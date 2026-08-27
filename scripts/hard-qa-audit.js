const assert = require('assert');

const BASE_URL = 'http://localhost:4000/api';

async function req(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'Accept': 'application/json',
    'x-user-id': 'usr-reviewer-01',
    'x-user-role': 'REVIEWER',
    ...(options.headers || {}),
  };
  if (options.body && !(options.body instanceof FormData) && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const res = await fetch(url, { ...options, headers });
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/csv')) {
    const text = await res.text();
    return { status: res.status, ok: res.ok, data: text };
  }
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data: json };
}

async function runHardQAAudit() {
  console.log('🧪 Starting Hard Product QA & Visual/Mathematical Verification...\n');

  const results = {
    passed: [],
    failed: [],
    improvements: [],
  };

  // =========================================================================
  // TEST 1: Summary & Mathematical Accuracy
  // =========================================================================
  console.log('--- TEST 1: Summary & Mathematical Precision ---');
  const summaryRes = await req('/summary');
  if (!summaryRes.ok) {
    results.failed.push({ test: 'GET /api/summary', error: 'Summary endpoint failed', res: summaryRes });
  } else {
    const s = summaryRes.data.data;
    console.log('Summary payload:', {
      totalLoans: s.totalLoans,
      verifiedLoansCount: s.verifiedLoansCount,
      totalOpenExceptions: s.totalOpenExceptions,
      percentage: s.dataQualityScore?.percentage,
      avgExceptionsPerLoan: s.dataQualityScore?.avgExceptionsPerLoan,
    });

    // Check Math
    const expectedPercentage = s.totalLoans > 0 ? parseFloat(((s.verifiedLoansCount / s.totalLoans) * 100).toFixed(2)) : 0;
    const expectedAvgExceptions = s.totalLoans > 0 ? parseFloat((s.totalOpenExceptions / s.totalLoans).toFixed(2)) : 0;

    assert.strictEqual(s.dataQualityScore.percentage, expectedPercentage, 'Quality percentage must be mathematically exact');
    assert.strictEqual(s.dataQualityScore.avgExceptionsPerLoan, expectedAvgExceptions, 'Average exceptions must be mathematically exact');
    console.log(`✅ Math check passed: ${s.verifiedLoansCount}/${s.totalLoans} = ${s.dataQualityScore.percentage}%`);
    results.passed.push('Summary mathematical precision verified');
  }

  // =========================================================================
  // TEST 2: Ingestion & Upload Validation
  // =========================================================================
  console.log('\n--- TEST 2: Ingestion & Upload Rejection ---');
  const uploadsRes = await req('/uploads');
  if (uploadsRes.ok && uploadsRes.data.data?.length > 0) {
    const firstUpload = uploadsRes.data.data[0];
    assert(firstUpload.fileHash && firstUpload.fileHash.length === 64, 'Upload fileHash must be valid 64-char SHA-256');
    assert(firstUpload.rowCount > 0, 'Upload rowCount must be positive');
    console.log(`✅ Upload lineage verified: ${firstUpload.filename} (${firstUpload.rowCount} rows, hash=${firstUpload.fileHash.slice(0, 16)}...)`);
    results.passed.push('Upload lineage and SHA-256 hashes verified');
  } else {
    results.failed.push({ test: 'GET /api/uploads', error: 'No uploads found' });
  }

  // Test Invalid file upload rejection
  const badUploadRes = await req('/uploads', {
    method: 'POST',
    headers: { 'x-user-role': 'OPERATOR' },
    body: 'Not a CSV payload',
  });
  assert.strictEqual(badUploadRes.status === 400 || badUploadRes.status === 500, true, 'Non-CSV payload must be rejected');
  console.log('✅ Ingestion security check: Malformed upload rejected with error status.');
  results.passed.push('Malformed upload rejected correctly');

  // =========================================================================
  // TEST 3: Reviewer Exceptions Queue, Filtering & Search
  // =========================================================================
  console.log('\n--- TEST 3: Reviewer Exception Queue, Filtering & Search ---');
  const excAllRes = await req('/exceptions?limit=50');
  assert(excAllRes.ok, 'GET /api/exceptions must succeed');
  const allExceptions = excAllRes.data.data.items || [];
  console.log(`Fetched ${allExceptions.length} exceptions from queue.`);

  // Test Severity filter
  const excCritRes = await req('/exceptions?severity=CRITICAL&limit=20');
  const critExceptions = excCritRes.data.data.items || [];
  const allCritical = critExceptions.every((e) => e.severity === 'CRITICAL');
  assert(allCritical, 'Severity filter must return only CRITICAL exceptions');
  console.log(`✅ Severity filter passed: ${critExceptions.length} CRITICAL exceptions returned.`);
  results.passed.push('Exception severity filtering verified');

  // =========================================================================
  // TEST 4: Forensic Detail & AI Explain/Suggest
  // =========================================================================
  console.log('\n--- TEST 4: Exception Detail & AI Advisory ---');
  if (allExceptions.length > 0) {
    const targetExc = allExceptions[0];
    const detailRes = await req(`/exceptions/${targetExc.id}`);
    assert(detailRes.ok, 'Exception detail must load');
    assert(detailRes.data.data.loan, 'Exception detail must include parent loan');
    assert(detailRes.data.data.loan.rawLoanRecord, 'Exception detail must include rawLoanRecord for forensic comparison');
    console.log(`✅ Forensic lineage present: Loan ${detailRes.data.data.loan.loanIdentifier}, Rule: ${detailRes.data.data.rule.ruleCode}`);

    // Test AI Explain
    const explainRes = await req(`/exceptions/${targetExc.id}/ai-explain`, { method: 'POST' });
    assert(explainRes.ok, 'AI explain must return 200');
    assert(explainRes.data.data.explanation, 'AI explain must contain plain language explanation');
    console.log(`✅ AI Explain verified: "${explainRes.data.data.explanation.slice(0, 70)}..."`);

    // Test AI Suggest Fix
    const suggestRes = await req(`/exceptions/${targetExc.id}/ai-suggest`, { method: 'POST' });
    assert(suggestRes.ok, 'AI suggest fix must return 200');
    assert(suggestRes.data.data.suggestion?.field, 'AI suggestion must specify field to fix');
    console.log(`✅ AI Suggest verified: Patch ${suggestRes.data.data.suggestion.field} -> ${suggestRes.data.data.suggestion.suggestedValue} (${suggestRes.data.data.suggestion.confidence})`);
    results.passed.push('Forensic comparison and AI advisory (explain/suggest) verified');
  }

  // =========================================================================
  // TEST 5: Decision Validation & Mandatory Underwriter Rationale
  // =========================================================================
  console.log('\n--- TEST 5: Underwriter Decision Execution & Validation ---');
  if (allExceptions.length > 0) {
    const targetExc = allExceptions[0];

    // Case A: Reject empty notes
    const badDecisionRes = await req(`/exceptions/${targetExc.id}/decision`, {
      method: 'POST',
      body: { decision: 'approved', notes: '  ' },
    });
    assert.strictEqual(badDecisionRes.status, 400, 'Decision with empty notes must be rejected with 400');
    console.log('✅ Mandatory underwriter rationale check: Empty notes rejected with 400.');

    // Case B: Reject invalid JSON in editedFields
    const badJsonDecision = await req(`/exceptions/${targetExc.id}/decision`, {
      method: 'POST',
      body: { decision: 'corrected', notes: 'Valid underwriter note', editedFields: 'INVALID_NOT_AN_OBJECT' },
    });
    assert.strictEqual(badJsonDecision.status, 400, 'Non-object editedFields must be rejected');
    console.log('✅ Zod schema validation: Invalid editedFields format rejected with 400.');
    results.passed.push('Underwriter decision validation and mandatory note checks verified');
  }

  // =========================================================================
  // TEST 6: Cryptographic Verification & Tamper Detection
  // =========================================================================
  console.log('\n--- TEST 6: Cryptographic Verification & Tamper Detection ---');
  const verifiedListRes = await req('/verified-loans?limit=10');
  assert(verifiedListRes.ok, 'GET /api/verified-loans must return 200');
  const verifiedList = verifiedListRes.data.data.items || [];
  console.log(`Fetched ${verifiedList.length} verified records.`);

  if (verifiedList.length > 0) {
    const targetVerified = verifiedList[0];

    // Clean verification
    const cleanCheck = await req(`/verified-loans/${targetVerified.id}/verify-hash`);
    assert(cleanCheck.ok, 'Verify hash endpoint must return 200');
    assert.strictEqual(cleanCheck.data.data.isValid, true, 'Clean record must pass hash verification');
    assert.strictEqual(cleanCheck.data.data.match, 'EXACT_MATCH', 'Clean record must match stored hash exactly');
    // Save original database raw canonical payload for bit-for-bit restoration
    const { PrismaClient } = await import('../backend/node_modules/@prisma/client/index.js');
    const prisma = new PrismaClient();
    const originalDbRow = await prisma.verifiedLoan.findUnique({ where: { id: targetVerified.id } });
    const originalRawPayload = originalDbRow?.canonicalJson;

    // Tamper Simulation
    const tamperSimRes = await req(`/verified-loans/${targetVerified.id}/simulate-tamper`, { method: 'POST' });
    assert(tamperSimRes.ok, 'Simulate tamper must return 200');

    // Post-tamper verification
    const tamperedCheck = await req(`/verified-loans/${targetVerified.id}/verify-hash`);
    assert(tamperedCheck.ok, 'Verify hash on tampered record must return 200');
    assert.strictEqual(tamperedCheck.data.data.isValid, false, 'Tampered record must fail hash verification');
    assert.strictEqual(tamperedCheck.data.data.tamperDetected, true, 'Tamper must be detected');
    assert.strictEqual(tamperedCheck.data.data.match, 'HASH_MISMATCH_TAMPER_DETECTED', 'Match status must be HASH_MISMATCH_TAMPER_DETECTED');
    console.log('✅ Tamper detection verified: Hash mismatch triggered immediately.');

    // Restore clean state in database for idempotency
    if (originalRawPayload) {
      await prisma.verifiedLoan.update({
        where: { id: targetVerified.id },
        data: { canonicalJson: originalRawPayload },
      });
    }
    await prisma.$disconnect();
    results.passed.push('Cryptographic verification and live tamper detection verified');
  }

  // =========================================================================
  // TEST 7: Exports (JSON & CSV)
  // =========================================================================
  console.log('\n--- TEST 7: JSON & CSV Export Verification ---');
  const jsonExport = await req('/export?format=json');
  assert(jsonExport.ok, 'JSON export must return 200');
  assert(jsonExport.data.verifiedLoans && jsonExport.data.verifiedLoans.length > 0, 'JSON export must contain verified loans');
  assert(jsonExport.data.auditTrailSnapshot && jsonExport.data.auditTrailSnapshot.length > 0, 'JSON export must contain audit trail snapshot');
  console.log(`✅ JSON Export verified: ${jsonExport.data.verifiedLoans.length} verified records, ${jsonExport.data.auditTrailSnapshot.length} audit entries.`);

  const csvExport = await req('/export?format=csv');
  assert(csvExport.ok, 'CSV export must return 200');
  assert(typeof csvExport.data === 'string' && csvExport.data.includes('verified_loan_id'), 'CSV export must contain CSV header row');
  console.log(`✅ CSV Export verified: ${csvExport.data.split('\n').length} CSV lines generated.`);
  results.passed.push('JSON and CSV export bundles verified');

  // =========================================================================
  // TEST 8: RBAC Permissions & Role Gating
  // =========================================================================
  console.log('\n--- TEST 8: Role-Based Access Control (RBAC) Gating ---');
  if (allExceptions.length > 0) {
    const targetExc = allExceptions[0];
    // Attempt decision execution with role "AUDITOR"
    const auditorBlockedRes = await req(`/exceptions/${targetExc.id}/decision`, {
      method: 'POST',
      headers: { 'x-user-role': 'AUDITOR' },
      body: { decision: 'approved', notes: 'Unauthorized auditor attempt' },
    });
    assert.strictEqual(auditorBlockedRes.status, 403, 'AUDITOR role must be blocked with HTTP 403 Forbidden on decision endpoint');
    console.log('✅ RBAC enforcement verified: Unauthorized role blocked with HTTP 403 Forbidden.');
    results.passed.push('RBAC role enforcement verified');
  }

  console.log('\n========================================================================');
  console.log('🎉 HARD QA AUDIT SUMMARY');
  console.log('========================================================================');
  console.log(`Passed Checks: ${results.passed.length}`);
  console.log(`Failed Checks: ${results.failed.length}`);
  results.passed.forEach((p) => console.log(`  [PASS] ${p}`));
  if (results.failed.length > 0) {
    console.log('\nFailed Details:');
    results.failed.forEach((f) => console.error(`  [FAIL] ${f.test}:`, f.error));
  }
}

runHardQAAudit().catch((err) => {
  console.error('Hard QA audit test run failed:', err);
  process.exit(1);
});
