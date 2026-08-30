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
