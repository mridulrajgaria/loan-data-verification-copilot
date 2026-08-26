# Loan Data Verification Copilot — Architecture Note

## 1. System Design

The system implements an end-to-end pipeline that transforms raw, unverified loan tapes into cryptographically locked, tamper-evident verified loan records with complete lineage and human-in-the-loop governance.

```
+-----------------------------------------------------------------------------------+
| 1. RAW INGESTION & LINEAGE                                                        |
|    [Raw CSV Tape Upload]                                                          |
|            |                                                                      |
|            v                                                                      |
|    [Compute SHA-256 File Hash] ---> Persist RawUpload (File metadata & hash)      |
|            |                                                                      |
|            v                                                                      |
|    [Row-by-Row Extraction]    ---> Persist RawLoanRecord (Exact CSV text, row #)  |
+-----------------------------------------------------------------------------------+
                                     |
                                     v
+-----------------------------------------------------------------------------------+
| 2. NORMALIZATION & TYPE COERCION                                                  |
|    - Standardize field names & formats (ISO dates, floats, 2-letter state codes)   |
|    - Capture unparseable values into `rawUnparsedValues` JSON bag                 |
|    - Persist NormalizedLoan (Linked via non-nullable foreign keys)                |
+-----------------------------------------------------------------------------------+
                                     |
                                     v
+-----------------------------------------------------------------------------------+
| 3. VALIDATION ENGINE (Config-Driven)                                              |
|    - Evaluate 15 data integrity, underwriting, & compliance rules                 |
|    - Cross-reference servicer feeds and custodial document manifests              |
|            |                                                                      |
|            +---> [All Passed]  ---> Status: APPROVED                              |
|            |                                    |                                 |
|            +---> [Rule Failed] ---> Status: FLAGGED                               |
|                                         |       |                                 |
|                                         v       |                                 |
|                             Persist Exception   |                                 |
+-----------------------------------------------------------------------------------+
                                     |            |
                                     v            |
+-----------------------------------------------------------------------------------+
| 4. UNDERWRITER REVIEW WORKBENCH                                                   |
|    - AI Copilot (Claude 3.5 Sonnet) generates advisory recommendations:           |
|      * Explain Failure | Suggest Field Correction | Batch Executive Summary       |
|      * Strictly READ-ONLY: Persists to AIRecommendation (Never mutates loan)       |
|    - Reviewer inspects lineage, rules, and AI guidance                            |
|    - Reviewer submits decision: POST /api/exceptions/:id/decision                 |
|      * Request body: { decision: 'approved' | 'rejected' | 'corrected', notes }   |
|      * Internally mapped to an immutable ReviewAction.actionType of               |
|        OVERRIDE_APPROVE | REJECT | MANUAL_EDIT | ACCEPT_AI_FIX (MANUAL_EDIT        |
|        vs ACCEPT_AI_FIX distinguished by whether acceptedAiRecommendationId        |
|        was supplied).                                                             |
|      * Executes atomic transaction: updates loan & creates immutable ReviewAction |
+-----------------------------------------------------------------------------------+
                                     |            |
                                     +------+-----+
                                            |
                                            v
+-----------------------------------------------------------------------------------+
| 5. CRYPTOGRAPHIC VERIFICATION SEAL                                                |
|    - POST /api/loans/:id/verify (Locks loan into VerifiedLoan)                    |
|    - Constructs deterministic canonical JSON payload (sorted keys)                |
|    - Computes SHA-256 digest (`record_hash`) independent of DB audit logs         |
|    - Status: VERIFIED (Ready for portfolio analytics & tamper-evident export)     |
+-----------------------------------------------------------------------------------+
```

---

## 2. Data Model

The schema comprises 10 relational entities managed via Prisma ORM:

* **`User`**: System actors with RBAC roles (`ADMIN`, `REVIEWER`, `OPERATOR`, `AUDITOR`).
* **`RawUpload`**: File-level provenance (original filename, byte size, row count, SHA-256 `fileHash`, upload timestamp, and uploader foreign key).
* **`RawLoanRecord`**: Untransformed, verbatim row-level provenance capturing exact CSV row text/JSON (`rawContent`) and 1-indexed `rowNumber`.
* **`NormalizedLoan`**: Strongly-typed domain entity containing coerced attributes (principal, rate, DPD, payment status), unparsed error bag (`rawUnparsedValues`), lifecycle status (`UNVALIDATED`, `VALID`, `FLAGGED`, `IN_REVIEW`, `APPROVED`, `REJECTED`, `VERIFIED`), and `currentVersion`.
* **`ValidationRule`**: Rule catalog specifying `ruleCode`, descriptive name, category (`DATA_INTEGRITY`, `UNDERWRITING`, `COMPLIANCE`, `ELIGIBILITY`), `severity`, and `ruleType`.
* **`Exception`**: Flagged validation failure linking a `NormalizedLoan` and `ValidationRule`, detailing diagnostic failure context and status (`OPEN`, `RESOLVED`, `DISMISSED`).
* **`AIRecommendation`**: Ephemeral, read-only AI advisory record storing the prompt sent, model identifier, raw response, suggested JSON patch, reasoning, and human acceptance status (`acceptedByReviewer`).
* **`ReviewAction`**: Immutable human adjudication record capturing `userId`, `actionType` (`MANUAL_EDIT`, `ACCEPT_AI_FIX`, `OVERRIDE_APPROVE`, `REJECT`), serialized `beforeState` & `afterState` JSON snapshots, and justification notes.
* **`VerifiedLoan`**: Cryptographically locked verification record storing the deterministic `canonicalJson` string, SHA-256 `recordHash`, verification timestamp, version, and verifier user ID.
* **`AuditLog`**: Append-only operational ledger tracking every state transition across all entities with actor ID, action type, entity ID, and structured JSON diff details.

### Why Lineage Fields Are Non-Nullable Foreign Keys
In `NormalizedLoan`, `rawLoanRecordId` and `rawUploadId` are defined as strict non-nullable foreign keys (`String @unique` / `String` referencing `RawLoanRecord` and `RawUpload` with `onDelete: Cascade`):
* **Strict Chain of Custody**: Secondary mortgage markets and regulatory bodies require mathematical proof of provenance. A normalized loan can never exist without pointing directly to the exact file and raw row from which it originated.
* **Zero Discrepancy Ambiguity**: Enables automated diffing between typed loan attributes and original raw string inputs to resolve servicing or underwriting disputes.
* **Orphan Prevention**: Schema-level non-nullability guarantees no un-sourced or synthetic records can bypass ingestion controls.

---

## 3. API Design

### Single Mutating Endpoint Architecture
`POST /api/exceptions/:id/decision` is the **ONLY** endpoint in the system authorized to mutate loan field values or resolve exception statuses.

* **Rationale**:
  * Prevents "side-door" data tampering by eliminating generic `PUT /api/loans/:id` or `PATCH /api/exceptions/:id` routes.
  * Centralizes all financial state modifications into a single, transactional chokepoint where validation invariants, entity version increments, before/after snapshot captures, and audit logging are guaranteed to run atomically.

### Code Enforcement & Boundary Guarantees
* **Atomic Transactions (`prisma.$transaction`)**: `exceptionRoutes.js` wraps the entire decision pipeline in an isolated transaction:
  1. Updates `Exception` status to `RESOLVED` with the specific resolution.
  2. Increments `NormalizedLoan.currentVersion` and applies sanitized field updates (restricted to an explicit whitelist of loan attributes).
  3. Updates `AIRecommendation.acceptedByReviewer = true` if an AI recommendation was accepted.
  4. Automatically evaluates remaining open exceptions on the parent loan to transition loan status to `APPROVED` or `REJECTED`.
  5. Creates an immutable `ReviewAction` capturing deep `beforeState` and `afterState` JSON snapshots.
  6. Writes an immutable `AuditLog` entry.
* **Read-Only / Non-Mutating Route Boundaries**:
  * AI endpoints (`/ai-explain`, `/ai-suggest`, `/ai-summary`) only insert advisory `AIRecommendation` rows.
  * Verification (`POST /api/loans/:id/verify`) creates an immutable `VerifiedLoan` cryptographic snapshot of an already-approved loan.
  * RBAC guards (`requireRole(['REVIEWER', 'ADMIN'])`) and Zod schema validation middleware reject unauthorized or malformed requests before handler execution.

---

## 4. Validation Engine

The validation engine (`engine.js`) is purely functional and config-driven via `validation_rules.json` rather than hardcoded logic.

* **Dynamic Rule Decoupling**: Business rules, threshold parameters, and severity mappings are decoupled from evaluation execution, allowing credit policy adjustments without codebase changes or server recompilation.
* **Configurable Parameters**: Loads parameters including `stalenessThresholdDays` (180 days), `interestRateBounds` (0.5%–35.0%), `validStateCodes` (US-50 + DC), `validPaymentStatuses`, and cross-field matrices.

### Concrete Example: Payment Status vs. DPD Consistency Matrix
* **Configuration (`validation_rules.json`)**:
  ```json
  "paymentStatusDpdMatrix": {
    "CURRENT":  { "minDpd": 0,   "maxDpd": 0 },
    "LATE_30":  { "minDpd": 30,  "maxDpd": 59 },
    "LATE_60":  { "minDpd": 60,  "maxDpd": 89 },
    "LATE_90":  { "minDpd": 90,  "maxDpd": 119 },
    "DEFAULT":  { "minDpd": 120, "maxDpd": 9999 },
    "PAID_OFF": { "minDpd": 0,   "maxDpd": 0 }
  }
  ```
* **Engine Execution (`engine.js` — `RULE_PAYMENT_STATUS_DPD_CONSISTENCY`)**:
  The engine dynamically accesses `config.paymentStatusDpdMatrix[loan.paymentStatus]` and evaluates `loan.daysPastDue`. If `dpd < expected.minDpd || dpd > expected.maxDpd`, it records a failure with exact diagnostic details. Modifying delinquency ranges requires only a JSON update.

---

## 5. AI Feature: AI Controls & Separation of Concerns

### Separation of `AIRecommendation` vs. `ReviewAction`
The system strictly enforces human-in-the-loop governance per regulatory requirements (e.g., OCC Model Risk Management guidance):

```
+-----------------------------+         +-------------------------------+
|     AIRecommendation        |         |         ReviewAction          |
|-----------------------------|         |-------------------------------|
| - Advisory ONLY             |         | - Legally Binding Decision    |
| - Generated by LLM / Engine |         | - Executed by Human Reviewer  |
| - acceptedByReviewer = NULL | ------> | - userId: Reviewer UUID       |
| - Read-only; cannot mutate  |         | - actionType: ACCEPT_AI_FIX   |
|   loan or exception state   |         | - beforeState & afterState    |
+-----------------------------+         +-------------------------------+
```

* **`AIRecommendation` (Machine Suggestion)**:
  * Records the exact prompt sent to Claude 3.5 Sonnet (with sanitized PII context), model name, raw LLM response, structured patch, and reasoning.
  * Instantiated with `acceptedByReviewer = null`. It has zero permissions to alter loans or exceptions.
* **`ReviewAction` (Human Decision Attestation)**:
  * When a reviewer selects **"Accept AI Fix"**, the human explicitly triggers `POST /api/exceptions/:id/decision`.
  * The backend applies the suggested patch, sets `ReviewAction.actionType = 'ACCEPT_AI_FIX'`, references `aiRecommendationId`, captures the before/after state diff, and marks `AIRecommendation.acceptedByReviewer = true`.
  * Preserves clear accountability: AI advises; humans decide.

---

## 6. Audit Trail & Tamper Evidence

### What Is Logged in the Audit Trail
The `AuditLog` table records an append-only timeline of all system lifecycle events:
* **Events**: `UPLOAD`, `IMPORT`, `VALIDATE`, `EXCEPTION_CREATED`, `AI_SUGGESTION_GENERATED`, `FIELD_EDITED`, `OVERRIDE_APPROVE`, `REJECT`, `VERIFIED`, `EXPORTED`.
* **Metadata**: Actor ID (`userId` or `system`), ISO timestamp, entity type, entity ID, and structured JSON payloads containing field-level diffs, before/after values, and reviewer justification notes.
* **Timeline Access**: Exposed via `GET /api/loans/:id/audit-trail` for loan-level chronological inspection.

### Independent Tamper Evidence via `record_hash`
While audit logs record historical transitions, they remain database rows that could theoretically be modified or dropped by a database administrator with direct SQL access. The `VerifiedLoan.recordHash` provides mathematical tamper evidence independent of the audit log:

1. **Deterministic Canonical Serialization (`canonicalStringify`)**:
   At verification sign-off (`createVerifiedLoanRecord`), the system aggregates loan attributes, source file hash, source row number, validation snapshot, and reviewer attestation into a single canonical document. All keys are sorted recursively, guaranteeing identical byte serialization regardless of runtime JSON formatting.
2. **Cryptographic SHA-256 Digest**:
   `recordHash = SHA-256(canonicalJson)`.
3. **Independent Verification (`GET /api/verified-loans/:id/verify-hash`)**:
   Any auditor or downstream system can recompute `SHA-256(re-serialized canonicalJson)` and compare it with `recordHash`.
4. **Tamper Simulation (`POST /api/verified-loans/:id/simulate-tamper`)**:
   Directly mutating stored database JSON triggers an immediate hash mismatch (`HASH_MISMATCH_TAMPER_DETECTED`), exposing data alteration without requiring external log verification.

---

## 7. Trade-offs

* **(a) Mock Header-Based Auth (`x-user-id`, `x-user-role`) vs. Production Identity Provider (OAuth2 / OIDC / JWT)**:
  * *Context*: Authentication reads user identity and roles from HTTP headers (defaulting to `REVIEWER`) instead of verifying signed JWTs against an identity provider (e.g., Auth0, Okta, Keycloak).
  * *Rationale*: Acceptable scope cut for a self-contained hackathon evaluation, enabling judges to switch roles (`REVIEWER`, `ADMIN`, `OPERATOR`, `AUDITOR`) and run automated test suites without external network calls or session setup.
  * *Production Reality*: Insecure without an authenticated API gateway stripping and injecting verified claims. Production requires asymmetric JWT validation, token expiration, and fine-grained OAuth2 scopes.
* **(b) SQLite Database vs. Distributed PostgreSQL**:
  * *Context*: Single-file SQLite database configured via Prisma.
  * *Rationale*: Zero-dependency setup, zero daemon configuration, and instant reproducibility for evaluators.
  * *Production Reality*: SQLite uses file-level locking (`WAL` mode). High-concurrency batch uploads and simultaneous underwriter reviews would encounter lock contention (`SQLITE_BUSY`). Production requires PostgreSQL with connection pooling (e.g., PgBouncer) and read replicas.
* **(c) In-Memory Synchronous Batch Processing vs. Asynchronous Job Queues (BullMQ / Kafka)**:
  * *Context*: File uploads, normalization, and validation rules run synchronously in the Express request-response cycle.
  * *Rationale*: Simplifies stack architecture and gives immediate UI feedback for standard demo datasets (1,000–5,000 rows).
  * *Production Reality*: Processing large loan tapes (100,000+ rows) synchronously would block the Node.js event loop and cause HTTP gateway timeouts (e.g., 30s ALB limits). Production requires chunked streaming to object storage (S3) and decoupled background workers.
* **(d) Deterministic Heuristic AI Fallback vs. Fine-Tuned Local LLM Sidecar**:
  * *Context*: When `ANTHROPIC_API_KEY` is not provided or rate limits are hit, the AI assistant falls back to rule-based explanation and patch generators.
  * *Rationale*: Guarantees 100% demo uptime and continuous CI test execution without requiring paid API credits.
  * *Production Reality*: Deterministic fallback lacks the complex multi-document contextual synthesis of large models for non-standard, uncataloged edge cases.

