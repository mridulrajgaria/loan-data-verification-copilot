# 📦 Sample Output Deliverables: Verified Loan Dataset & Audit Trail

This directory contains the live export deliverables generated from an end-to-end execution of the **Loan Data Verification Copilot** pipeline (`scripts/run-e2e-pipeline-export.js`) against the synthetic portfolio dataset (`data/loan_tape.csv`, `data/servicer_update.csv`, and `data/document_manifest.csv`).

---

## 📊 Summary of Pipeline Execution & Export Statistics

* **Total Raw Loans Processed**: `2,000` loans ingested with SHA-256 file-level and row-level lineage preserved in `RawLoanRecord`.
* **Portfolio Validation**: `15` configurable rules evaluated across all `2,000` loans.
  * **Clean / Valid**: `1,116` loans passed every rule.
  * **Flagged Defective**: `884` loans failed one or more rules and generated an `Exception`.
* **Representative Decision Flows Demonstrated** (3 of the 4 supported `ReviewAction` types, one full worked example of each):
  * **AI-Assisted Correction (`ACCEPT_AI_FIX`)**: 1 loan — AI explanation & suggested field patch generated via Claude, then explicitly reviewed and accepted by a human underwriter with `acceptedAiRecommendationId` linked.
  * **Manual Field Correction (`MANUAL_EDIT`)**: 1 loan — an invalid state code corrected directly by the underwriter.
  * **Policy Override Approval (`OVERRIDE_APPROVE`)**: 1 loan — approved with a documented compliance rationale despite a stale-record flag.
  * *(`REJECT` is a fully supported decision type in the API and UI — see the Reviewer dashboard — it's just not one of the three flows this particular demo script walks through.)*
* **Total Cryptographically Verified Loans**: `25` representative clean/approved loans sealed into `VerifiedLoan` entities (the script verifies a fixed sample of 25 for a fast, reproducible demo run rather than sealing the entire portfolio).
* **Total Audit Trail Events Logged**: `1,121` immutable events in `AuditLog`.

---

## 🔐 Cryptographic Integrity & Tamper-Evidence Verification

Each record in `verified-loans-export.json` contains:
1. **`canonicalPayload`**: Deep copy of verified loan attributes, source file/row provenance, validation rules snapshot, and reviewer attestation, serialized with recursively sorted keys (`canonicalStringify`).
2. **`recordHash`**: Strict 64-character hexadecimal SHA-256 digest: `SHA-256(canonicalJson)`.
3. **Independent Spot-Check**: Running `verifyRecordHash()` re-computes the SHA-256 digest from stored canonical data and confirms an `EXACT_MATCH`.

---

## 📁 Exported Deliverable Files

1. **[`verified-loans-export.json`](./verified-loans-export.json)** (~`812 KB`):
   * Full verified-loan export bundle including metadata and a `verifiedLoans` array with canonical payloads and cryptographic hashes for all 25 sealed records.
2. **[`audit-trail-export.csv`](./audit-trail-export.csv)** (~`464 KB`):
   * Complete tabular audit ledger (1,121 rows) with columns: `audit_id`, `timestamp`, `actor`, `action_type`, `entity_type`, `entity_id`, `details`.

---

## ♻️ Reproducing This Export

```bash
# From a clean database (backend/prisma/dev.db removed, then `npx prisma db push`):
node scripts/run-e2e-pipeline-export.js
```
Running it against a database that already has loans ingested (e.g. from manual UI testing) will re-ingest the same tape a second time and skew the validation counts — always run it against a fresh database for a clean, reproducible export.
