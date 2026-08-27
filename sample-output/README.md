# 📦 Sample Output Deliverables: Verified Loan Dataset & Audit Trail

This directory contains the live export deliverables generated from an end-to-end execution of the **Loan Data Verification Copilot** pipeline against the synthetic portfolio dataset (`data/loan_tape.csv`, `data/servicer_update.csv`, and `data/document_manifest.csv`).

---

## 📊 Summary of Pipeline Execution & Export Statistics

* **Total Raw Loans Processed**: `2,000` loans ingested with SHA-256 file-level and row-level lineage preserved in `RawLoanRecord`.
* **Portfolio Validation**: `15` configurable rules evaluated across all `2,000` loans (`30,000` rule checks).
* **Adjudicated Flagged Exceptions**: `20` representative defective loans reviewed across human underwriter decision workflows:
  * **AI-Assisted Decisions (`ACCEPT_AI_FIX`)**: `4` loans (AI explanation & suggested patch generated via Claude 3.5 Sonnet / deterministic engine, then explicitly reviewed and accepted by human underwriter with `acceptedAiRecommendationId` linked).
  * **Manual Field Corrections (`MANUAL_EDIT`)**: `6` loans corrected by underwriter (state codes, negative principal inversion, maturity date sequence, date validation, missing identifiers).
  * **Policy Override Approvals (`OVERRIDE_APPROVE`)**: `6` loans approved with documented underwriting compliance rationale.
  * **Strict Rejections (`REJECT`)**: `4` loans rejected for irreconcilable defects.
* **Total Cryptographically Verified Loans**: `1198` loans sealed into `VerifiedLoan` entities.
* **Total Audit Trail Events Logged**: `2234` immutable events in `AuditLog`.

---

## 🔐 Cryptographic Integrity & Tamper-Evidence Verification

Each record in `verified-loans-export.json` contains:
1. **`canonicalPayload`**: Deep copy of verified loan attributes, source file/row provenance, validation rules snapshot, and reviewer attestation, serialized with recursively sorted keys (`canonicalStringify`).
2. **`recordHash`**: Strict 64-character hexadecimal SHA-256 digest: `SHA-256(canonicalJson)`.
3. **Independent Spot-Check**: Running `verifyRecordHash()` re-computes the SHA-256 digest from stored canonical data and confirms an `EXACT_MATCH`.

---

## 📁 Exported Deliverable Files

1. **[`verified-loans-export.json`](./verified-loans-export.json)** (`8.60 MB`):
   * Full verified portfolio export bundle including metadata, `verifiedLoans` array with canonical payloads and cryptographic hashes, and complete chronological `auditTrailSnapshot`.
2. **[`audit-trail-export.csv`](./audit-trail-export.csv)** (`0.90 MB`):
   * Complete tabular audit ledger with columns: `audit_id`, `timestamp`, `actor`, `action_type`, `entity_type`, `entity_id`, `details`.
