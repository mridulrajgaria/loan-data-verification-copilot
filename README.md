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
```

---

## 📁 Repository Structure
```
Loan-Data-Verification-Copilot/
├── AI_DEVELOPMENT_LOG.md         # Deliverable: 9. AI Development Log
├── README.md                     # Project documentation & execution guide
├── data/                         # Synthetic datasets (loan_tape, servicer_update, manifest)
├── scripts/
│   └── generate-loan-tape.js     # Deterministic synthetic portfolio generator
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
        ├── api.js                # Unified fetch API client
        └── App.jsx               # Role tab navigation container
```
