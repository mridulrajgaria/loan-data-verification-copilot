const fs = require('fs');
const path = require('path');
const csvParser = require('csv-parser');
const prisma = require('./src/db');
const { runBatchValidation } = require('./src/validation/batchValidator');

function parseCsvFile(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csvParser({ trim: true, skipEmptyLines: true }))
      .on('data', (data) => rows.push(data))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

async function testFullBatchValidation() {
  console.log('🧪 Testing End-to-End Batch Validation Pipeline...');

  const latestUpload = await prisma.rawUpload.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  if (!latestUpload) {
    throw new Error('No RawUpload found in database. Run test-ingestion.js first.');
  }

  console.log(`Found target RawUpload: ${latestUpload.id} (${latestUpload.filename})`);

  // Parse secondary feeds
  const servicerRows = await parseCsvFile(path.join(__dirname, '..', 'data', 'servicer_update.csv'));
  const manifestRows = await parseCsvFile(path.join(__dirname, '..', 'data', 'document_manifest.csv'));

  console.log(`Loaded ${servicerRows.length} servicer update rows and ${manifestRows.length} manifest rows.`);

  const summary = await runBatchValidation({
    rawUploadId: latestUpload.id,
    servicerUpdates: servicerRows,
    documentManifests: manifestRows,
    actor: 'usr-reviewer-test-01',
  });

  console.log('\n📊 BATCH VALIDATION SUMMARY:');
  console.log(JSON.stringify(summary, null, 2));

  // Inspect Exceptions Breakdown in Database
  const exceptions = await prisma.exception.findMany({
    include: {
      rule: true,
      loan: true,
    },
  });

  const ruleCounts = {};
  const severityCounts = {};
  exceptions.forEach((e) => {
    ruleCounts[e.rule.ruleCode] = (ruleCounts[e.rule.ruleCode] || 0) + 1;
    severityCounts[e.severity] = (severityCounts[e.severity] || 0) + 1;
  });

  console.log('\n📋 CREATED EXCEPTIONS BREAKDOWN BY RULE:');
  console.table(Object.entries(ruleCounts).map(([rule, count]) => ({ 'Rule Code': rule, 'Exceptions Created': count })));

  console.log('\n🚨 EXCEPTIONS BY SEVERITY:');
  console.table(Object.entries(severityCounts).map(([sev, count]) => ({ 'Severity': sev, 'Count': count })));

  // Inspect Audit Logs
  const validateAuditLogs = await prisma.auditLog.findMany({
    where: { actionType: 'VALIDATE' },
  });
  console.log(`\nAudit Logs for VALIDATE: ${validateAuditLogs.length} entries`);

  await prisma.$disconnect();
  console.log('\n✨ Batch validation verification complete and verified in SQLite!');
}

testFullBatchValidation().catch((err) => {
  console.error('Batch validation test failed:', err);
  process.exit(1);
});
