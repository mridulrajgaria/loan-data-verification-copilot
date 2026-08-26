# AI Development Log: Loan Data Verification Copilot

---

## 1. Tools Used and Specific Modular Allocations

Rather than using AI as an unguided code generator, tools were deployed with strict modular scopes:

* **Antigravity (DeepMind Agentic AI & Claude 3.5 Sonnet)**:
  * **Module 1 (Architecture & Data Modeling)**: Generated the multi-entity relational SQLite schema in Prisma, establishing non-negotiable foreign-key lineage from raw CSV rows to verified cryptographic records.
  * **Module 2 (Synthetic Data Engine)**: Created the deterministic synthetic loan portfolio generator with statistical distributions across credit grades and states, as well as 14 discrete anomaly injection routines.
  * **Module 3 (Ingestion & Lineage Pipeline)**: Built the streaming CSV parser with memory-bounded chunking, SHA-256 raw file hashing, and dual-event audit logging (`UPLOAD` vs `IMPORT`).
  * **Module 4 (Validation Engine)**: Formulated the standalone 15-rule validation engine driven by `validation_rules.json` and a strict servicing Delinquency/Days-Past-Due (DPD) matrix.
  * **Module 5 (AI Review Assistant)**: Implemented the read-only Anthropic Claude API wrapper for plain-language rule explanations, suggested field patches, and portfolio summaries, strictly isolated from human decision tables.
  * **Module 6 (Cryptographic Attestation Engine)**: Built recursive key-sorting canonical JSON stringification, SHA-256 hash generation, and independent tamper-detection verification routines.
  * **Module 7 (Frontend Dashboards)**: Generated the three React/Tailwind functional dashboards (Data Operator, Reviewer Adjudication, and Data Consumer).
  * **Module 8 (Security Audit & Remediation)**: Implemented centralized Zod schema validation, unbounded pagination guards, and Role-Based Access Control (RBAC) middleware.

* **Prisma ORM & SQLite Engine**: Enforced relational schema constraints, cascade behavior, and transactional atomicity (`prisma.$transaction`).
* **Node.js Native Test Runner (`node:test`, `node:assert/strict`)**: Executed independent unit and integration tests for validation rules, edge-case date handling, and security boundaries.

---

## 2. Representative Prompts

The following prompts illustrate the precise constraints, negative boundaries, and domain rules enforced throughout development:

1. **System Standing Instructions (Prompt 0)**:
   > *"No placeholder logic. Never write TODO, 'implement later', mocked return values presented as real logic, or empty function bodies... Any AI-generated suggestion must be stored and returned as a DISTINCT object from the human decision. Never let an AI call directly mutate loan data. Always require an explicit human action that is itself logged."*
2. **Architecture & Schema Isolation (Prompt 1)**:
   > *"AIRecommendation must store: target, prompt sent, model name, response, timestamp, and a boolean `accepted_by_reviewer` that starts null until a human acts on it. Do NOT let this table double as the decision record — ReviewAction is the decision record, this is the suggestion record. Keep them separate on purpose."*
3. **Deterministic Synthetic Anomaly Injection (Prompt 2)**:
   > *"Deliberately inject, at known/logged rates, EVERY issue listed (missing loan_id, duplicate triplets, invalid date formats, maturity before origination, negative principal, balance > principal, payment_status vs DPD mismatch, stale records >180 days, closed loans with positive balance)... Print a summary table at the end showing exactly how many of each issue type were injected."*
4. **Data Normalization vs Data Correction Boundary (Prompt 3)**:
   > *"Standardize date formats to ISO 8601, standardize state codes to uppercase 2-letter, but DO NOT silently fix data-quality problems like negative balances or bad dates — that's the validation engine's job in the next module, not this one's. Normalization is about format, not correctness."*
5. **Validation Engine Edge-Case Dependency (Prompt 4)**:
   > *"Do not skip edge cases: what happens if origination_date itself is malformed AND we're checking maturity > origination? Show me how you handle that specific case."*
6. **AI Service Security & Inviolable Boundaries (Prompt 5)**:
   > *"These functions must NEVER write to the NormalizedLoan or VerifiedLoan tables. They are read-and-suggest only. If you find yourself writing mutation code in this file, stop and tell me — that's a boundary violation for this module."*
7. **Deterministic Cryptographic Verification (Prompt 6)**:
   > *"Record_hash: SHA-256 over a deterministically-ordered JSON of the canonical fields (sort keys before stringifying — hash must be reproducible independent of object key insertion order)... Write a verifyRecordHash(verifiedLoanId) utility that re-computes the hash and confirms it matches."*

---

## 3. Human Review & Verification Process

Every module underwent rigorous human validation and live CLI/integration testing before proceeding to the next step:

```
[Module A: Ingestion]  --> Tested with 2,000-row CSV; confirmed 2,000 RawLoanRecords + 2,000 NormalizedLoans + 2 AuditLogs.
[Module B: Validation] --> Ran 16 automated unit tests; tested on 2,000-loan batch (30,000 rule runs -> 1,005 exceptions).
[Module D: AI Review]  --> Verified AIRecommendation created with acceptedByReviewer=null; confirmed loan unmutated until ReviewAction.
[Module E: Hash Proof] --> Tested key-order invariance; ran live tamper simulation (altering 1 byte in DB triggered tamper alarm).
[Module 8: Security]   --> Tested Zod query rejections (limit > 100), RBAC permission blocking (AUDITOR rejected with HTTP 403).
```

1. **Schema Review**: Inspected SQLite table constraints and verified that `NormalizedLoan` maintains non-nullable foreign keys (`rawLoanRecordId`, `rawUploadId`) to guarantee provenance.
2. **Dataset Audit**: Ran `node scripts/generate-loan-tape.js` and cross-referenced the CLI summary table against injected counts.
3. **Ingestion Testing (`test-ingestion.js`)**: Ingested `loan_tape.csv` through the streaming pipeline; verified that raw CSV text was preserved verbatim in `RawLoanRecord` while normalized records were created.
4. **Validation Test Suite (`engine.test.js`)**: Executed 16 automated tests covering all 15 validation rules, DPD consistency matrices, and cross-source discrepancies.
5. **AI Proposal Isolation (`test-ai-assistant.js`)**: Confirmed that running `explainFailure()` and `suggestCorrection()` created `AIRecommendation` rows with `acceptedByReviewer: null` and left the loan's version and fields completely untouched until a human `ReviewAction` was recorded.
6. **Tamper Detection Demo (`test-verification.js`)**: Verified that identical JSON objects with scrambled keys produced matching SHA-256 hashes, and confirmed that an unauthorized database modification was immediately flagged as `HASH_MISMATCH_TAMPER_DETECTED`.
7. **Security Verification (`test-security.js`)**: Validated that Zod schemas rejected out-of-bounds parameters (e.g. `limit=500` or invalid enum strings) and that RBAC middleware blocked unauthorized roles with `HTTP 403 Forbidden`.

---

## 4. Code Generation Ratio & Human-in-the-Loop Reasoning

* **Estimated Split**: **75% AI-Generated Code** / **25% Human Direction, Architectural Guardrails, & Corrections**.
* **Reasoning**:
  * AI excels at rapidly producing repetitive boilerplate, typed Zod schemas, complex Tailwind UI structures, and comprehensive domain rule sets.
  * Human intervention was required to establish strict separation of concerns (e.g., forbidding AI services from writing directly to loan tables), mandate exact cryptographic serialization algorithms, configure referential integrity checks, and catch edge-case falsy type coercions in JavaScript.

---

## 5. Concrete Examples of Rejected / Corrected AI Output

### Example 1: Falsy Value Leak in Malformed Date Edge-Case Evaluation
* **What the AI initially generated**:
  In `backend/src/validation/engine.js`, the engine attempted to evaluate whether dates were valid using logical `&&` chaining:
  ```javascript
  // FLAGGED CODE:
  const origDate = loan.originationDate ? new Date(loan.originationDate) : null;
  const matDate = loan.maturityDate ? new Date(loan.maturityDate) : null;

  const isOrigValid = origDate && !isNaN(origDate.getTime()) && !unparsed.origination_date;
  const isMatValid = matDate && !isNaN(matDate.getTime()) && !unparsed.maturity_date;
  ```
* **Why it was rejected**:
  When `loan.originationDate` was `null` (because the CSV contained an unparseable date like `"2024-02-31"`), the expression `origDate && ...` evaluated to `null` rather than `false`. When the unit test assertion ran:
  ```javascript
  assert.equal(matRule.details.isOrigValid, false);
  ```
  It threw `AssertionError [ERR_ASSERTION]: Expected null === false`.
* **The Correction**:
  Explicit boolean casting was introduced across all dependency validators:
  ```javascript
  // CORRECTED CODE:
  const isOrigValid = Boolean(origDate && !isNaN(origDate.getTime()) && !unparsed.origination_date);
  const isMatValid = Boolean(matDate && !isNaN(matDate.getTime()) && !unparsed.maturity_date);
  ```
  This guarantees that downstream rule prerequisite checks always receive strict boolean flags, avoiding falsy type coercion bugs.

---

### Example 2: Foreign Key Constraint Violations from Unchecked User References
* **What the AI initially generated**:
  In both the ingestion pipeline (`ingestionService.js`) and the review action logger (`exceptionRoutes.js`), the AI initially linked `uploadedById` and `userId` directly from client request headers (`req.headers['x-user-id']` or `'usr-reviewer-test-01'`):
  ```javascript
  // FLAGGED CODE:
  const rawUpload = await prisma.rawUpload.create({
    data: {
      filename,
      uploadedById: userId !== 'system' ? userId : null, // Passed raw string ID directly
      ...
    }
  });
  ```
* **Why it was rejected**:
  When running integration tests or handling requests from new users, SQLite threw `PrismaClientKnownRequestError: P2003 Foreign key constraint violated` because no corresponding row existed in the `User` table for that UUID/string.
* **The Correction**:
  Added automated foreign-key validation and idempotent user upserting prior to relational record creation:
  ```javascript
  // CORRECTED CODE:
  let validUserId = null;
  if (userId && userId !== 'system') {
    const userExists = await prisma.user.findUnique({ where: { id: userId } });
    if (userExists) {
      validUserId = userExists.id;
    } else {
      const defaultUser = await prisma.user.upsert({
        where: { email: `${userId}@loancopilot.local` },
        update: {},
        create: {
          id: userId,
          email: `${userId}@loancopilot.local`,
          name: `User ${userId}`,
          passwordHash: '$2b$10$defaultHashForTestingAuth00000000000000',
          role: 'REVIEWER',
        },
      });
      validUserId = defaultUser.id;
    }
  }
  ```
  This enforced referential integrity across all audit trails without crashing background batch jobs or testing harnesses.

---

## 6. Lessons Learned

### Where AI Helped Most:
1. **Accelerated Rule Engine Construction**: Generating the 15 distinct compliance rules and the complete DPD-to-status mapping matrix in JSON and JavaScript in a single pass.
2. **Synthetic Domain Data Modeling**: Rapidly creating realistic statistical distributions (realistic credit grade curves, state weightings, and amortization calculations) while injecting anomalies deterministically.
3. **Modern Multi-Role Frontend UI**: Scaffolding three responsive, role-differentiated React dashboards with Tailwind styling, modals, and status badges in minutes.

### Where Human Judgment Was Essential:
1. **Architectural Isolation (AI vs Human Boundary)**: AI models naturally tend to write "all-in-one" convenience functions that calculate a suggestion and immediately update the database. Human oversight was critical to enforce the rule that AI services must be **strictly read-only**, writing only to `AIRecommendation` while reserving state mutations exclusively for `ReviewAction`.
2. **Cryptographic Determinism**: Standard JavaScript `JSON.stringify()` does not guarantee deterministic key order. Human design was necessary to specify recursive alphabetical key sorting (`canonicalStringify`) so that SHA-256 hashes are reproducible regardless of object property ordering.
3. **Defensive Security Layering**: Adding centralized Zod validation, unbounded query limits (`limit <= 100`), stream row count ceilings (20,000 max), and RBAC route middleware to ensure the system is hardened against denial-of-service and unauthorized state changes.
