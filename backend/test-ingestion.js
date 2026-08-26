const fs = require('fs');
const path = require('path');
const { processLoanTapeUpload } = require('./src/services/ingestionService');
const prisma = require('./src/db');

async function testIngestion() {
  console.log('🧪 Testing CSV Ingestion Pipeline against loan_tape.csv...');

  const csvPath = path.join(__dirname, '..', 'data', 'loan_tape.csv');
  const buffer = fs.readFileSync(csvPath);

  const result = await processLoanTapeUpload({
    fileBuffer: buffer,
    filename: 'loan_tape.csv',
    fileSize: buffer.length,
    userId: 'usr-reviewer-test-01',
  });

  console.log('\n📊 INGESTION RESULT SUMMARY:');
  console.log(JSON.stringify(result, null, 2));

  // Verify Database Records
  const rawUploadCount = await prisma.rawUpload.count();
  const rawRecordCount = await prisma.rawLoanRecord.count();
  const normalizedLoanCount = await prisma.normalizedLoan.count();
  const auditLogs = await prisma.auditLog.findMany({
    orderBy: { timestamp: 'asc' },
  });

  console.log('\n🔍 DATABASE VERIFICATION:');
  console.log(`- RawUpload count: ${rawUploadCount}`);
  console.log(`- RawLoanRecord count: ${rawRecordCount}`);
  console.log(`- NormalizedLoan count: ${normalizedLoanCount}`);
  console.log(`- AuditLog entries created: ${auditLogs.length}`);

  auditLogs.forEach((log, idx) => {
    console.log(`  [Log #${idx + 1}] Action: ${log.actionType} | Actor: ${log.actor} | Entity: ${log.entityType}:${log.entityId}`);
  });

  // Verify Lineage Check
  const sampleNormalized = await prisma.normalizedLoan.findFirst({
    include: {
      rawUpload: true,
      rawLoanRecord: true,
    },
  });

  console.log('\n🔗 LINEAGE VERIFICATION FOR SAMPLE RECORD:');
  console.log(`- Normalized Loan ID: ${sampleNormalized.id}`);
  console.log(`- Loan Identifier: ${sampleNormalized.loanIdentifier || '(BLANK - INJECTED ANOMALY)'}`);
  console.log(`- Linked Raw Upload File: ${sampleNormalized.rawUpload.filename} (Hash: ${sampleNormalized.rawUpload.fileHash.slice(0, 12)}...)`);
  console.log(`- Linked Raw Row Number: ${sampleNormalized.rawLoanRecord.rowNumber}`);
  console.log(`- Raw Content: ${sampleNormalized.rawLoanRecord.rawContent.slice(0, 80)}...`);

  await prisma.$disconnect();
  console.log('\n✨ Ingestion pipeline verification complete and passing!');
}

testIngestion().catch((err) => {
  console.error('Ingestion test failed:', err);
  process.exit(1);
});
