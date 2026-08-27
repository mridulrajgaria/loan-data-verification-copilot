const fs = require('fs');
const path = require('path');
const { validateLoan } = require('../backend/src/validation/engine');

async function auditExportedVerifiedLoans() {
  console.log('🔍 Auditing ALL 34 Verified Loans in sample-output/verified-loans-export.json...\n');

  const exportPath = path.join(__dirname, '..', 'sample-output', 'verified-loans-export.json');
  const rawExport = fs.readFileSync(exportPath, 'utf8');
  const exportData = JSON.parse(rawExport);

  const verifiedLoans = exportData.verifiedLoans || [];
  console.log(`Total verified loans to audit: ${verifiedLoans.length}`);

  const failureReport = [];

  for (let i = 0; i < verifiedLoans.length; i++) {
    const v = verifiedLoans[i];
    const loanPayload = v.canonicalPayload?.canonicalLoan;
    const validationSnapshot = v.canonicalPayload?.validationSnapshot || [];
    const attestation = v.canonicalPayload?.reviewAttestation;

    // Run current validation engine directly on the canonicalLoan object
    const evalResults = validateLoan(loanPayload);
    const failedRules = evalResults.filter((r) => !r.passed);

    // Also check the stored snapshot
    const snapshotFailed = validationSnapshot.filter((s) => !s.passed);

    if (failedRules.length > 0 || snapshotFailed.length > 0) {
      failureReport.push({
        index: i + 1,
        verifiedLoanId: v.verifiedLoanId,
        loanIdentifier: v.loanIdentifier,
        decision: attestation?.decision,
        actionType: attestation?.actionType,
        reviewerNote: attestation?.reviewerNote,
        liveFailedRules: failedRules.map((f) => ({ ruleId: f.rule_id, severity: f.severity, message: f.message })),
        snapshotFailedRules: snapshotFailed.map((s) => ({ ruleId: s.ruleId, severity: s.severity, message: s.message })),
        loanPayload: {
          originationDate: loanPayload.originationDate,
          maturityDate: loanPayload.maturityDate,
          originalPrincipal: loanPayload.originalPrincipal,
          currentBalance: loanPayload.currentBalance,
          interestRate: loanPayload.interestRate,
          paymentStatus: loanPayload.paymentStatus,
          daysPastDue: loanPayload.daysPastDue,
          borrowerState: loanPayload.borrowerState,
        },
      });
    }
  }

  console.log(`\n========================================================================`);
  console.log(`📊 AUDIT RESULTS ACROSS ALL ${verifiedLoans.length} VERIFIED LOANS`);
  console.log(`========================================================================`);
  console.log(`Total loans failing validation rules in export: ${failureReport.length} / ${verifiedLoans.length}\n`);

  failureReport.forEach((rep) => {
    console.log(`❌ [Loan #${rep.index}] ID: ${rep.loanIdentifier} (${rep.verifiedLoanId})`);
    console.log(`   Action Type: ${rep.actionType} | Decision: ${rep.decision}`);
    console.log(`   Reviewer Note: "${rep.reviewerNote}"`);
    console.log(`   Failed in Snapshot: ${JSON.stringify(rep.snapshotFailedRules)}`);
    console.log(`   Failed in Live Validation: ${JSON.stringify(rep.liveFailedRules)}`);
    console.log(`   Loan Attributes: ${JSON.stringify(rep.loanPayload)}`);
    console.log(`------------------------------------------------------------------------`);
  });
}

auditExportedVerifiedLoans().catch(console.error);
