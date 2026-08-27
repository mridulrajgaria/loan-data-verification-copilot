const fs = require('fs');
const path = require('path');

const exportPath = path.join(__dirname, '..', 'sample-output', 'verified-loans-export.json');
const data = JSON.parse(fs.readFileSync(exportPath, 'utf8'));

const verified = data.verifiedLoans || [];
console.log(`Total verified loans in export: ${verified.length}`);

const snapshotFailures = [];
verified.forEach((v, idx) => {
  const failedInSnap = (v.canonicalPayload?.validationSnapshot || []).filter(s => !s.passed);
  if (failedInSnap.length > 0) {
    snapshotFailures.push({
      index: idx + 1,
      id: v.verifiedLoanId,
      loanIdentifier: v.loanIdentifier,
      failedRules: failedInSnap.map(f => ({ rule: f.ruleId, msg: f.message })),
      canonicalLoan: v.canonicalPayload?.canonicalLoan,
    });
  }
});

console.log(`\nLoans with FAILING rules recorded in validationSnapshot at verification time: ${snapshotFailures.length}`);
console.log(JSON.stringify(snapshotFailures, null, 2));
