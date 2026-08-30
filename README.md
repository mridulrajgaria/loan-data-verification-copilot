# 🛡️ Loan Data Verification Copilot

> Full-Stack Lineage, AI Validation & Cryptographic Attestation Platform for Mortgage & Loan Underwriting.

---

## 🌟 Highlights & Architecture

- **End-to-End Lineage & Provenance**: Preserves verbatim raw CSV row strings in `RawLoanRecord` while coercing format-only into `NormalizedLoan`.
- **Configurable 15-Rule Validation Engine**: Evaluates ranges, DPD servicing matrices, usury limits, duplicate triplets, and cross-source conflicts from `validation_rules.json`.
- **Isolated AI Advisory Layer**: Wraps Anthropic Claude API (`explainFailure`, `suggestCorrection`, `summarizeExceptionBatch`) as non-binding suggestions logged in `AIRecommendation` (`accepted_by_reviewer = null` until human signs off).
- **Binding Human Decision Ledger**: `POST /api/exceptions/:id/decision` records immutable before/after state snapshots in `ReviewAction` and updates the append-only `AuditLog`.
- **Cryptographic Tamper-Evidence (SHA-256)**: Canonical JSON sorting (`canonicalStringify`) hashes verified loans into `VerifiedLoan.recordHash`. Includes independent `verifyRecordHash()` utility with live judge tamper simulation.
- **Role-Differentiated Frontend**: Functional React/Tailwind dashboards for **Operator (7a)**, **Reviewer (7b)**, and **Consumer (7c)**.
- **Enterprise Security**: Zod input schemas, bounded pagination, Role-Based Access Control (`requireRole`), and API rate limiting.

---

## 📝 Changelog

Tracking incremental changes made after the initial submission build, in scope with the [Full Stack Track problem statement](https://uc.hackerearth.com/he-public-ap-south-1/Intain_Full_Stack_Track_Problem_Statement.docx3b4003f.pdf) (production-grade infra such as Docker, message queues, and real auth are explicitly out of scope for this challenge, so this list stays focused on validation, workflow, and UX).

- **Consumer Dashboard — Exception Severity Breakdown chart**: Added a visual, color-coded horizontal bar chart above the verified-records table showing open exceptions grouped by severity (Critical / High / Medium / Warning), sourced from the existing `GET /api/summary` `severityCounts` payload. No new dependencies added — implemented with existing Tailwind tokens and a fixed status color palette (never reused from the app's categorical/series colors, so severity color never gets confused with anything else on screen), with an icon + label on every bar so the meaning never depends on color alone.
- **Operator Dashboard — Validation Outcome Composition chart**: Added a segmented bar under the metric-tile strip showing what share of the ingested portfolio is Clean/Verified vs Flagged, reusing the dashboard's own existing lime/coral color story (`cleanLoansCount` and `flaggedLoansCount` from `GET /api/summary`) instead of introducing a new palette. Each segment is labeled with an icon, count, and percentage so it never relies on color alone.
- **Bug fix — CSV upload was broken**: `frontend/src/api.js` was calling `POST /upload`, but the backend only registers `POST /uploads` (plural). Every upload attempt failed with a 404 before this fix. Corrected the frontend call to match the backend route.
- **Bug fix — validation never ran on upload, and flagged loans were never marked flagged**: `runBatchValidation` (Module B) was fully implemented but never called from any live route — uploading a loan tape ingested and normalized records but silently skipped validation entirely, so the exception queue and all dashboards stayed empty regardless of how messy the input file was. Wired it into `POST /api/uploads` so validation now runs automatically right after ingestion. Separately, even in the test scripts that did call it, `NormalizedLoan.status` was hardcoded to `'VALID'` and never set to `'FLAGGED'` when a loan had failing rules — fixed so loan status now correctly reflects validation outcome. Also hardened the Operator dashboard's composition chart to compute the "flagged" percentage from the actual flagged count rather than by subtracting from 100, so an un-validated batch can no longer render a misleading "100% flagged, 0 loans" bar.
- **Bug fix — no way to actually create a Verified Loan Record (Module E)**: `POST /api/loans/:id/verify` — the endpoint that locks a loan and generates its SHA-256 record hash — was fully implemented on the backend but never called anywhere in the frontend, so "Verified & Sealed" stayed at 0 no matter how many exceptions were resolved, and the required demo step "Create verified loan records" couldn't be performed. Added a "Verify & Seal Loan" action to the loan detail drawer (reachable from every dashboard via "View Full Loan Lineage"): it's disabled with a clear reason while unresolved CRITICAL exceptions remain or the loan was rejected, and once sealed it shows the record hash, verifier, and timestamp in place of the button.
- **Bug fix — submitting a reviewer decision looked like it did nothing**: after Approve/Reject/Correct was submitted, the exception's own detail view was never re-fetched, so the same decision form stayed on screen looking unchanged (only a small success line hinted anything happened). Now the exception detail refreshes immediately after a decision, and once it's resolved the decision form is replaced with a clear "Exception Resolved" confirmation instead of staying visible and interactive.
- **UX fix — decision confirmation was getting wiped by the queue auto-advancing**: turned out the previous fix wasn't enough on its own — submitting a decision also auto-advances the queue to the next open exception, which was silently resetting the confirmation before the reviewer could see it, so it still looked like nothing happened. Added a standalone "Decision recorded" toast that's independent of the per-exception panel state, so it survives the auto-advance and stays visible (auto-dismissing after 5 seconds) no matter which exception the queue jumps to next.
- **Bug fix — decision panel could still flicker/show a mismatched record**: the toast fixed the missing-confirmation problem, but the underlying cause was still there — after a decision, two separate fetches (our own manual refetch of the resolved exception, and the queue's own fetch for whatever it auto-advanced to) could both be in flight for two *different* exceptions, and whichever landed last silently won, occasionally leaving the panel showing stale or mismatched data. `fetchExceptionList` now returns the list it just fetched, so the decision handler can tell synchronously — not by guessing from React state that may not have re-rendered yet — whether the queue actually auto-advanced away from the resolved exception, and only performs its own refetch when it didn't. Exactly one fetch now runs per decision.
- **UX fix — decision toast rendered off-screen above the scroll position**: the "Human Review Decision" form sits far down the panel, so after submitting, the toast appeared correctly but above where the reviewer was scrolled — invisible without manually scrolling up. Now the panel smooth-scrolls to the toast the moment it appears.
- **Bug fix — AI "Suggest Fix" crashed when Claude's reply had no parseable JSON**: a successful (non-erroring) API response that didn't contain a `{...}` JSON object left `correctionData` as `null`, and the code then read `.justification` off it, throwing and turning into an opaque 500 instead of the same graceful deterministic fallback already used for actual API errors. Now a malformed-but-successful response falls back the same way.
- **Bug fix — two RBAC-gated actions were shown to personas the backend would reject**: the "Demo Tamper" button lives on the Auditor tab, but the tamper-simulation endpoint didn't allow the `AUDITOR` role — added it, since the endpoint's own purpose is judge/demo verification. Separately, "Verify & Seal Loan" was reachable from the Operator's loan detail drawer even though only `REVIEWER`/`ADMIN` can call that endpoint — the button (and a clear explanatory note) is now shown only to roles that can actually use it.
- **Bug fix — a validation rule could never trigger**: `RULE_REQUIRED_DOCUMENT_STATUS`'s "loan missing entirely from the custodial document manifest" branch checked for `null`, but an unmatched loan produces `undefined`, so the branch was dead code — a loan absent from an uploaded manifest silently passed instead of being flagged. Same root-cause pattern as the earlier `loanStatus` fix.
- **Feature — AI Portfolio Executive Summary wired into the Reviewer dashboard**: `summarizeExceptionBatch` (module D's third AI capability — a natural-language risk briefing over the whole open-exception batch) was fully implemented on the backend but had no client method and no UI, so it was unreachable. Added the API client call and an "AI Portfolio Summary" panel on the Reviewer dashboard, respecting the active severity/rule filters.
- **Cleanup — removed a dead API client method** (`getUploadDetail`) that pointed at a `GET /api/uploads/:id` route the backend never implemented; it wasn't called anywhere, but left in place it was a 404 waiting to happen for anyone wiring it up later, the same class of bug as the `/upload` vs `/uploads` fix above.
- **Feature — Export Audit Trail**: the backend's `/api/export` endpoint already supported a full audit-log CSV export (`target=audit`), but the frontend only ever requested the verified-records bundle. Added an "Export Audit Trail" button next to the existing export actions, and a hover tooltip on the audit trail's truncated entity IDs so auditors can read the full ID without guesswork.

---

## 🎭 Role-Based Access Control & Mock Test Personas

This system uses **header-based mock authentication** rather than username/password login, enabling evaluators to test role boundaries and permissions across the entire platform.

### How Role Switching Works
* **In the UI**: Use the **Persona / Role Switcher** dropdown in the top-right header. Switching a persona automatically updates the active view tab and injects the corresponding `x-user-id` and `x-user-role` headers into all subsequent API requests.
* **In cURL / API Clients**: Provide the headers directly:
  ```bash
  curl -X GET http://localhost:4000/api/exceptions \
    -H "x-user-id: usr-reviewer-01" \
    -H "x-user-role: REVIEWER"
  ```

### Available Test Personas & Permissions Table

| Persona Name | Header `x-user-id` | Header `x-user-role` | Accessible Views / Permissions |
| :--- | :--- | :--- | :--- |
| **Elena Rostova** | `usr-operator-01` | `OPERATOR` | **Operator (7a)**: Ingest CSV loan tapes (`POST /api/uploads`), inspect raw provenance & batch validation summary metrics. |
| **David Chen** | `usr-reviewer-01` | `REVIEWER` | **Reviewer (7b)**: Adjudicate exceptions, trigger AI explanation / fix suggestions, record binding decisions (`POST /api/exceptions/:id/decision`), verify loans. |
| **Sarah Vance** | `usr-auditor-01` | `AUDITOR` | **Consumer (7c)**: Inspect verified loan portfolio, independently recompute SHA-256 hashes (`GET /api/verified-loans/:id/verify-hash`), export data. *Adjudication & ingestion mutations return 403 Forbidden.* |
| **Alex Mercer** | `usr-admin-01` | `ADMIN` | **Unrestricted Access**: Ingestion, reviewer adjudication, cryptographic tamper simulation (`POST /api/verified-loans/:id/simulate-tamper`), and verification. |

---

## 🚀 Quick Start

### 1. Backend Setup
```bash
cd backend
npm install
npx prisma db push
node src/server.js
# Backend runs on http://localhost:4000
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
# Frontend runs on http://localhost:5173
```

---

## 🧪 Automated Test Suite

```bash
# Generate synthetic dataset with 14 anomaly injections
node scripts/generate-loan-tape.js

# Test Streaming Ingestion & Provenance Persistence
node backend/test-ingestion.js

# Run Validation Engine Unit Tests (16/16 tests)
node --test backend/src/validation/engine.test.js

# Run Batch Portfolio Validation (2,000 loans -> 1,005 exceptions)
node backend/test-batch-validation.js

# Test AI Review Assistant & Decision Ledger
node backend/test-ai-assistant.js

# Test Cryptographic Verification & Tamper Detection
node backend/test-verification.js

# Run Security Suite (Zod validation & RBAC guards)
node backend/test-security.js

# Test Standalone Comments & NL Rule Generator
node backend/test-nl-rule-comments.js
```

---

## 📁 Repository Structure
```
Loan-Data-Verification-Copilot/
├── ARCHITECTURE.md               # Deliverable: Architecture Note (1-2 pages)
├── AI_DEVELOPMENT_LOG.md         # Deliverable: AI Development Log
├── README.md                     # Project documentation & execution guide
├── sample-output/                # Deliverable: Exported sample outputs
│   ├── verified-loans-export.json # Full verified dataset with canonical JSON & SHA-256 hashes
│   └── audit-trail-export.csv    # Complete chronological audit ledger export
├── data/                         # Synthetic datasets & mock organizers package
│   ├── loan_tape.csv             # Primary ingested loan dataset
│   ├── servicer_update.csv       # External conflicting servicer updates
│   ├── document_manifest.csv     # Document availability manifest
│   ├── users.json                # Mock users and role assignments
│   └── expected_exception_sample.csv # Known exception orientation sample
├── scripts/
│   ├── generate-loan-tape.js     # Deterministic synthetic portfolio generator
│   └── run-e2e-pipeline-export.js # Full pipeline executor & sample export generator
├── backend/
│   ├── prisma/
│   │   └── schema.prisma         # 10-Entity relational SQLite schema
│   ├── src/
│   │   ├── ai/
│   │   │   └── reviewAssistant.js # Anthropic Claude API wrapper
│   │   ├── middleware/
│   │   │   ├── auth.js           # RBAC permission middleware
│   │   │   ├── rateLimiter.js    # 30 req/min sliding-window limiter
│   │   │   └── validate.js       # Zod validation middleware
│   │   ├── routes/
│   │   │   ├── dashboardRoutes.js
│   │   │   ├── exceptionRoutes.js
│   │   │   ├── uploadRoutes.js
│   │   │   └── verificationRoutes.js
│   │   ├── schemas/
│   │   │   └── validationSchemas.js # Zod schemas for all endpoints
│   │   ├── services/
│   │   │   ├── auditService.js   # Immutable audit logger
│   │   │   ├── ingestionService.js # Streaming CSV parser
│   │   │   ├── normalizationService.js # Format normalizer
│   │   │   └── verificationService.js # SHA-256 canonical hasher
│   │   ├── validation/
│   │   │   ├── batchValidator.js # Batch validation orchestrator
│   │   │   ├── engine.js         # Pure 15-rule validation engine
│   │   │   ├── engine.test.js    # 16 unit tests
│   │   │   └── validation_rules.json # Dynamic rule configurations
│   │   └── server.js             # Express app entry point
│   └── test-*.js                 # Modular integration test scripts
└── frontend/
    └── src/
        ├── components/
        │   ├── AuditTrailModal.jsx # Interactive loan timeline viewer
        │   ├── ConsumerDashboard.jsx # Module 7c: Verified table & export
        │   ├── LoanDetailModal.jsx   # Lineage & raw CSV comparison
        │   ├── OperatorDashboard.jsx # Module 7a: Ingestion & metrics
        │   └── ReviewerDashboard.jsx # Module 7b: AI panel & decisions
        ├── api.js                # Unified fetch API client with dynamic mock headers
        └── App.jsx               # Role & persona switcher navigation container
```
