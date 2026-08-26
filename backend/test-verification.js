const prisma = require('./src/db');
const {
  canonicalStringify,
  computeRecordHash,
  createVerifiedLoanRecord,
  verifyRecordHash,
} = require('./src/services/verificationService');

async function testVerificationPipeline() {
  console.log('🔒 Testing Module E: Cryptographic Verification & Tamper-Evidence Pipeline...');

  // ---------------------------------------------------------------------------
  // 1. Test Key Sorting Independence in canonicalStringify
  // ---------------------------------------------------------------------------
  console.log('\n--- 1. Testing Deterministic Canonical Key Sorting ---');
  const objA = { z: 100, a: 'test', m: { b: 2, a: 1 } };
  const objB = { a: 'test', m: { a: 1, b: 2 }, z: 100 };

  const strA = canonicalStringify(objA);
  const strB = canonicalStringify(objB);

  const hashA = computeRecordHash(objA).recordHash;
  const hashB = computeRecordHash(objB).recordHash;

  console.log(`Payload A Stringified: ${strA}`);
  console.log(`Payload B Stringified: ${strB}`);
  console.log(`Hash A: ${hashA}`);
  console.log(`Hash B: ${hashB}`);

  if (hashA !== hashB || strA !== strB) {
    throw new Error('FAILED: Canonical JSON stringifier must produce identical output regardless of key insertion order!');
  }
  console.log('✅ Key sorting independence verified: Identical SHA-256 hashes generated.');

  // ---------------------------------------------------------------------------
  // 2. Create a VerifiedLoan Record for a Sample Loan in Database
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. Creating VerifiedLoan Record in SQLite ---');
  const sampleLoan = await prisma.normalizedLoan.findFirst({
    where: { status: { in: ['VALID', 'APPROVED'] } },
    include: { rawUpload: true, rawLoanRecord: true },
  });

  if (!sampleLoan) {
    throw new Error('No VALID or APPROVED loan found. Run test-batch-validation.js first.');
  }

  const verificationResult = await createVerifiedLoanRecord({
    loanId: sampleLoan.id,
    userId: 'usr-underwriter-01',
    reviewerNote: 'Full underwriting audit complete. All documentation vaulted and verified.',
  });

  console.log('✅ VerifiedLoan Record Created:');
  console.log(`- VerifiedLoan ID: ${verificationResult.verifiedLoan.id}`);
  console.log(`- Loan Identifier: ${sampleLoan.loanIdentifier}`);
  console.log(`- Record Hash (SHA-256): ${verificationResult.recordHash}`);
  console.log(`- Canonical JSON Size: ${verificationResult.canonicalJson.length} bytes`);

  // ---------------------------------------------------------------------------
  // 3. Test verifyRecordHash() on Clean Record (Live Proof of Integrity)
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. Running Independent Hash Verification (Clean State) ---');
  const verifyCheckClean = await verifyRecordHash(verificationResult.verifiedLoan.id);
  console.log('✅ Hash Verification Result:');
  console.log(`- Is Valid: ${verifyCheckClean.isValid}`);
  console.log(`- Tamper Detected: ${verifyCheckClean.tamperDetected}`);
  console.log(`- Match Status: ${verifyCheckClean.match}`);
  console.log(`- Stored Hash:   ${verifyCheckClean.storedHash}`);
  console.log(`- Computed Hash: ${verifyCheckClean.computedHash}`);

  if (!verifyCheckClean.isValid || verifyCheckClean.tamperDetected) {
    throw new Error('FAILED: Clean record hash verification should pass with exact match!');
  }

  // ---------------------------------------------------------------------------
  // 4. Live Judge Demo: Simulate Unauthorized Database Tampering
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. Live Demo: Simulating Unauthorized Database Tampering ---');
  console.log('Injecting simulated rogue database modification to canonical JSON in SQLite...');

  const docToTamper = JSON.parse(verificationResult.canonicalJson);
  // Modify loan balance or borrower name
  docToTamper.canonicalLoan.borrowerName = (docToTamper.canonicalLoan.borrowerName || 'John Doe') + ' [TAMPERED_ROGUE_UPDATE]';
  docToTamper.canonicalLoan.currentBalance = (docToTamper.canonicalLoan.currentBalance || 100000) + 15000.0;

  // Persist tampered payload into database
  await prisma.verifiedLoan.update({
    where: { id: verificationResult.verifiedLoan.id },
    data: { canonicalJson: JSON.stringify(docToTamper) },
  });

  console.log('Executing verifyRecordHash() against tampered database record...');
  const verifyCheckTampered = await verifyRecordHash(verificationResult.verifiedLoan.id);

  console.log('🚨 Tamper Verification Result:');
  console.log(`- Is Valid: ${verifyCheckTampered.isValid} (Expected false)`);
  console.log(`- Tamper Detected: ${verifyCheckTampered.tamperDetected} (Expected true)`);
  console.log(`- Match Status: ${verifyCheckTampered.match}`);
  console.log(`- Stored Hash (Pre-signed):   ${verifyCheckTampered.storedHash}`);
  console.log(`- Computed Hash (Post-tamper): ${verifyCheckTampered.computedHash}`);

  if (verifyCheckTampered.isValid || !verifyCheckTampered.tamperDetected) {
    throw new Error('FAILED: Tamper detection should have caught the hash mismatch!');
  }
  console.log('✅ Tamper detection successfully caught the unauthorized modification!');

  // Restore clean state
  await prisma.verifiedLoan.update({
    where: { id: verificationResult.verifiedLoan.id },
    data: { canonicalJson: verificationResult.canonicalJson },
  });
  console.log('Clean state restored for record.');

  // ---------------------------------------------------------------------------
  // 5. Verify Audit Log Entry
  // ---------------------------------------------------------------------------
  const verifyAudit = await prisma.auditLog.findFirst({
    where: {
      actionType: 'VERIFIED',
      entityId: verificationResult.verifiedLoan.id,
    },
  });
  console.log(`\nAudit Log Entry: Action=${verifyAudit.actionType}, Actor=${verifyAudit.actor}, Entity=${verifyAudit.entityType}:${verifyAudit.entityId}`);

  await prisma.$disconnect();
  console.log('\n✨ Cryptographic verification & tamper-evidence pipeline verified and fully operational!');
}

testVerificationPipeline().catch((err) => {
  console.error('Verification test failed:', err);
  process.exit(1);
});
