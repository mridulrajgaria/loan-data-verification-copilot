/**
 * End-to-End Pipeline Execution & Sample Deliverables Generator
 *
 * Runs the full verification pipeline end-to-end:
 * 1. Ingestion of raw synthetic loan tape (with SHA-256 file & row lineage).
 * 2. 15-Rule Validation engine execution across entire batch.
 * 3. Human Underwriter Review & Adjudication:
 *    - AI-assisted explanation & suggestion generation.
 *    - AI-assisted decision acceptance (ACCEPT_AI_FIX).
 *    - Manual edit correction (MANUAL_EDIT).
 *    - Policy override approval (OVERRIDE_APPROVE).
 *    - Strict rejection (REJECT).
 * 4. Cryptographic Verification sealing (Canonical JSON + SHA-256 recordHash).
 * 5. Generation of sample-output/verified-loans-export.json & sample-output/audit-trail-export.csv.
 */

const fs = require('fs');
const path = require('path');
const csvParser = require('../backend/node_modules/csv-parser');
const prisma = require('../backend/src/db');
const { processLoanTapeUpload } = require('../backend/src/services/ingestionService');
const { runBatchValidation } = require('../backend/src/validation/batchValidator');
const { explainFailure, suggestCorrection } = require('../backend/src/ai/reviewAssistant');
const { createVerifiedLoanRecord, verifyRecordHash } = require('../backend/src/services/verificationService');
const { logAudit } = require('../backend/src/services/auditService');

const OUTPUT_DIR = path.join(__dirname, '..', 'sample-output');
const LOAN_TAPE_PATH = path.join(__dirname, '..', 'data', 'loan_tape.csv');
const SERVICER_PATH = path.join(__dirname, '..', 'data', 'servicer_update.csv');
const MANIFEST_PATH = path.join(__dirname, '..', 'data', 'document_manifest.csv');

function parseCsvFile(filePath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) return resolve([]);
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csvParser({ trim: true, skipEmptyLines: true }))
      .on('data', (data) => rows.push(data))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

async function runPipeline() {
  console.log('================================================================');
  console.log('🚀 Starting Full End-to-End Loan Verification Pipeline Run');
  console.log('================================================================\n');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // --- Step 1: Ensure Users Exist ---
  console.log('👤 Step 1: Initializing Role Actors in Database...');
  const [operator, reviewer, auditor, admin] = await Promise.all([
    prisma.user.upsert({
      where: { id: 'usr-operator-01' },
      update: {},
      create: {
        id: 'usr-operator-01',
        email: 'elena.rostova@loancopilot.local',
        name: 'Elena Rostova',
        passwordHash: '$2b$10$placeholderHashForOperator0000000000000',
        role: 'OPERATOR',
      },
    }),
    prisma.user.upsert({
      where: { id: 'usr-reviewer-01' },
      update: {},
      create: {
        id: 'usr-reviewer-01',
        email: 'david.chen@loancopilot.local',
        name: 'David Chen',
        passwordHash: '$2b$10$placeholderHashForReviewer0000000000000',
        role: 'REVIEWER',
      },
    }),
    prisma.user.upsert({
      where: { id: 'usr-auditor-01' },
      update: {},
      create: {
        id: 'usr-auditor-01',
        email: 'sarah.vance@loancopilot.local',
        name: 'Sarah Vance',
        passwordHash: '$2b$10$placeholderHashForAuditor0000000000000',
        role: 'AUDITOR',
      },
    }),
    prisma.user.upsert({
      where: { id: 'usr-admin-01' },
      update: {},
      create: {
        id: 'usr-admin-01',
        email: 'alex.mercer@loancopilot.local',
        name: 'Alex Mercer',
        passwordHash: '$2b$10$placeholderHashForAdmin0000000000000',
        role: 'ADMIN',
      },
    }),
  ]);
  console.log(`✅ Initialized 4 system personas (Operator, Reviewer, Auditor, Admin).\n`);

  // --- Step 2: Ingest Raw CSV Tape ---
  console.log('📥 Step 2: Ingesting Raw Loan Tape CSV...');
  const fileBuffer = fs.readFileSync(LOAN_TAPE_PATH);
  const uploadResult = await processLoanTapeUpload({
    fileBuffer,
    filename: 'loan_tape.csv',
    fileSize: fileBuffer.length,
    userId: operator.id,
  });
  console.log(`✅ Ingested "${uploadResult.filename}" (Upload ID: ${uploadResult.uploadId})`);
  console.log(`   Total Rows: ${uploadResult.totalRows} | File SHA-256: ${uploadResult.fileHash.slice(0, 16)}...\n`);

  // --- Step 3: Batch Validation Engine ---
  console.log('⚙️  Step 3: Running 15-Rule Validation Engine Across Ingested Portfolio...');
  const servicerRows = await parseCsvFile(SERVICER_PATH);
  const manifestRows = await parseCsvFile(MANIFEST_PATH);

  const validationResult = await runBatchValidation({
    rawUploadId: uploadResult.uploadId,
    servicerUpdates: servicerRows,
    documentManifests: manifestRows,
    actor: reviewer.id,
  });
  console.log(`✅ Validation Batch Completed:`);
  console.log(`   Evaluated: ${validationResult.totalEvaluated} loans`);
  console.log(`   Clean / Valid: ${validationResult.cleanLoans}`);
  console.log(`   Flagged Defective: ${validationResult.flaggedLoans}`);
  console.log(`   Exceptions Created: ${validationResult.exceptionsCreated}\n`);

  // --- Step 4: Adjudicate Representative Exceptions (Human + AI) ---
  console.log('🧠 Step 4: Adjudicating Representative Exceptions...');

  const openExceptions = await prisma.exception.findMany({
    where: { status: 'OPEN', loan: { rawUploadId: uploadResult.uploadId } },
    include: { rule: true, loan: true },
    take: 20,
  });

  console.log(`Found ${openExceptions.length} sample open exceptions for human review.`);

  // 4a. AI-Assisted Adjudication (ACCEPT_AI_FIX)
  const aiCandidate = openExceptions.find((e) =>
    ['RULE_CLOSED_LOAN_POSITIVE_BALANCE', 'RULE_PAYMENT_STATUS_DPD_CONSISTENCY', 'RULE_NON_NEGATIVE_PRINCIPAL'].includes(e.rule.ruleCode)
  ) || openExceptions[0];

  if (aiCandidate) {
    console.log(`\n--- [AI Flow] Adjudicating Exception #${aiCandidate.id.slice(0, 8)} (${aiCandidate.rule.ruleCode}) on Loan ${aiCandidate.loan.loanIdentifier} ---`);
    
    const explainRes = await explainFailure(aiCandidate.id, reviewer.id);
    console.log(`   [AI Explain (${explainRes.severity})]: ${explainRes.explanation.slice(0, 120)}...`);

    const suggestRes = await suggestCorrection(aiCandidate.id, reviewer.id);
    console.log(`   [AI Suggest]: Field "${suggestRes.suggestion.field}" -> Suggested: ${suggestRes.suggestion.suggestedValue} (Confidence: ${suggestRes.suggestion.confidence})`);
    console.log(`   [AI Justification]: ${suggestRes.suggestion.justification}`);

    const beforeState = {
      exception: { id: aiCandidate.id, status: aiCandidate.status },
      loan: { id: aiCandidate.loan.id, status: aiCandidate.loan.status, version: aiCandidate.loan.currentVersion, ...aiCandidate.loan },
    };

    const updatePayload = {
      [suggestRes.suggestion.field]: suggestRes.suggestion.suggestedValue,
      currentVersion: { increment: 1 },
    };

    const [updatedException, updatedLoan, reviewAction] = await prisma.$transaction([
      prisma.exception.update({
        where: { id: aiCandidate.id },
        data: { status: 'RESOLVED', resolution: 'corrected', resolvedAt: new Date() },
      }),
      prisma.normalizedLoan.update({
        where: { id: aiCandidate.loan.id },
        data: { ...updatePayload, status: 'APPROVED' },
      }),
      prisma.reviewAction.create({
        data: {
          loanId: aiCandidate.loan.id,
          exceptionId: aiCandidate.id,
          userId: reviewer.id,
          actionType: 'ACCEPT_AI_FIX',
          resolution: 'corrected',
          beforeState: JSON.stringify(beforeState),
          afterState: JSON.stringify({ loanId: aiCandidate.loan.id, status: 'APPROVED', patch: updatePayload }),
          notes: `Underwriter accepted AI recommendation. ${suggestRes.suggestion.justification}`,
          aiRecommendationId: suggestRes.recommendationId,
        },
      }),
      prisma.aIRecommendation.update({
        where: { id: suggestRes.recommendationId },
        data: { acceptedByReviewer: true, reviewedByUserId: reviewer.id, reviewedAt: new Date() },
      }),
    ]);

    await logAudit({
      actor: reviewer.id,
      actionType: 'ACCEPT_AI_FIX',
      entityType: 'Exception',
      entityId: aiCandidate.id,
      details: {
        loanIdentifier: updatedLoan.loanIdentifier,
        ruleCode: aiCandidate.rule.ruleCode,
        patch: updatePayload,
        aiRecommendationId: suggestRes.recommendationId,
      },
    });

    console.log(`   ✅ Human Underwriter applied AI fix. ReviewAction #${reviewAction.id.slice(0, 8)} recorded.`);
  }

  // 4b. Manual Edit (MANUAL_EDIT)
  const manualCandidate = openExceptions.find((e) => e.id !== aiCandidate?.id && e.rule.ruleCode === 'RULE_VALID_STATE_CODE') || openExceptions[1];
  if (manualCandidate) {
    console.log(`\n--- [Manual Flow] Correcting Exception #${manualCandidate.id.slice(0, 8)} (${manualCandidate.rule.ruleCode}) on Loan ${manualCandidate.loan.loanIdentifier} ---`);
    await prisma.$transaction([
      prisma.exception.update({
        where: { id: manualCandidate.id },
        data: { status: 'RESOLVED', resolution: 'corrected', resolvedAt: new Date() },
      }),
      prisma.normalizedLoan.update({
        where: { id: manualCandidate.loan.id },
        data: { borrowerState: 'CA', status: 'APPROVED', currentVersion: { increment: 1 } },
      }),
      prisma.reviewAction.create({
        data: {
          loanId: manualCandidate.loan.id,
          exceptionId: manualCandidate.id,
          userId: reviewer.id,
          actionType: 'MANUAL_EDIT',
          resolution: 'corrected',
          beforeState: JSON.stringify({ state: manualCandidate.loan.borrowerState }),
          afterState: JSON.stringify({ state: 'CA' }),
          notes: 'Standardized state code to CA per origination deed verification.',
        },
      }),
    ]);
    console.log(`   ✅ Manual edit recorded by reviewer ${reviewer.name}.`);
  }

  // 4c. Policy Override Approval (OVERRIDE_APPROVE)
  const overrideCandidate = openExceptions.find((e) => e.id !== aiCandidate?.id && e.id !== manualCandidate?.id && e.rule.ruleCode === 'RULE_STALE_RECORD') || openExceptions[2];
  if (overrideCandidate) {
    console.log(`\n--- [Override Flow] Approving Exception #${overrideCandidate.id.slice(0, 8)} (${overrideCandidate.rule.ruleCode}) on Loan ${overrideCandidate.loan.loanIdentifier} ---`);
    await prisma.$transaction([
      prisma.exception.update({
        where: { id: overrideCandidate.id },
        data: { status: 'RESOLVED', resolution: 'approved', resolvedAt: new Date() },
      }),
      prisma.normalizedLoan.update({
        where: { id: overrideCandidate.loan.id },
        data: { status: 'APPROVED' },
      }),
      prisma.reviewAction.create({
        data: {
          loanId: overrideCandidate.loan.id,
          exceptionId: overrideCandidate.id,
          userId: reviewer.id,
          actionType: 'OVERRIDE_APPROVE',
          resolution: 'approved',
          beforeState: JSON.stringify({ status: overrideCandidate.status }),
          afterState: JSON.stringify({ status: 'APPROVED' }),
          notes: 'Approved with policy exception: servicer confirmation received within acceptable tolerance.',
        },
      }),
    ]);
    console.log(`   ✅ Override approval recorded.`);
  }

  // --- Step 5: Verify Representative Clean & Approved Loans ---
  console.log('\n🔒 Step 5: Cryptographically Verifying & Locking Representative Loans...');
  
  const loansToVerify = await prisma.normalizedLoan.findMany({
    where: {
      rawUploadId: uploadResult.uploadId,
      status: { in: ['VALID', 'APPROVED'] },
    },
    take: 25,
  });

  const verifiedResults = [];
  for (const loan of loansToVerify) {
    const verified = await createVerifiedLoanRecord({
      loanId: loan.id,
      userId: reviewer.id,
      reviewerNote: 'Pre-issuance quality control verification completed. Cryptographic seal applied.',
    });
    verifiedResults.push(verified);
  }
  console.log(`✅ Successfully verified & cryptographically locked ${verifiedResults.length} loans into VerifiedLoan entities.`);
  console.log(`   Sample Record Hash: ${verifiedResults[0].recordHash}\n`);

  // --- Step 6: Test Independent Hash Verification ---
  console.log('🔍 Step 6: Testing Independent SHA-256 Hash Verification...');
  const testHashResult = await verifyRecordHash(verifiedResults[0].verifiedLoan.id);
  console.log(`   Record ID: ${testHashResult.verifiedLoanId}`);
  console.log(`   Stored Hash:   ${testHashResult.storedHash}`);
  console.log(`   Computed Hash: ${testHashResult.computedHash}`);
  console.log(`   Match Status:  ${testHashResult.match} (Valid: ${testHashResult.isValid})\n`);

  // --- Step 7: Export Deliverables ---
  console.log('📦 Step 7: Exporting Deliverables to sample-output/ ...');

  const allVerifiedLoans = await prisma.verifiedLoan.findMany({
    include: {
      loan: true,
      verifiedByUser: { select: { id: true, name: true, email: true, role: true } },
    },
    orderBy: { verifiedAt: 'desc' },
  });

  const allAuditLogs = await prisma.auditLog.findMany({
    orderBy: { timestamp: 'desc' },
  });

  // 1. JSON Export: verified-loans-export.json
  const verifiedExportPayload = {
    exportMetadata: {
      exportedAt: new Date().toISOString(),
      datasetVersion: '1.0.0',
      totalVerifiedLoans: allVerifiedLoans.length,
      platform: 'Loan Data Verification Copilot',
      securityProtocol: 'SHA-256 Canonical JSON Attestation',
    },
    verifiedLoans: allVerifiedLoans.map((v) => ({
      verifiedLoanId: v.id,
      loanIdentifier: v.loan.loanIdentifier,
      recordHash: v.recordHash,
      verifiedAt: v.verifiedAt.toISOString(),
      verifiedBy: v.verifiedByUser,
      version: v.version,
      canonicalPayload: JSON.parse(v.canonicalJson),
    })),
    auditTrailSnapshot: allAuditLogs.map((log) => ({
      id: log.id,
      timestamp: log.timestamp.toISOString(),
      actor: log.actor,
      actionType: log.actionType,
      entityType: log.entityType,
      entityId: log.entityId,
      details: JSON.parse(log.details || '{}'),
    })),
  };

  const jsonExportPath = path.join(OUTPUT_DIR, 'verified-loans-export.json');
  fs.writeFileSync(jsonExportPath, JSON.stringify(verifiedExportPayload, null, 2), 'utf8');
  console.log(`✅ Written ${jsonExportPath} (${(fs.statSync(jsonExportPath).size / 1024).toFixed(1)} KB)`);

  // 2. CSV Export: audit-trail-export.csv
  const csvHeaders = ['audit_id', 'timestamp', 'actor', 'action_type', 'entity_type', 'entity_id', 'details'];
  const csvRows = [csvHeaders.join(',')];
  allAuditLogs.forEach((log) => {
    const row = [
      log.id,
      log.timestamp.toISOString(),
      log.actor,
      log.actionType,
      log.entityType,
      log.entityId,
      log.details || '{}',
    ];
    csvRows.push(row.map((val) => `"${String(val || '').replace(/"/g, '""')}"`).join(','));
  });

  const csvExportPath = path.join(OUTPUT_DIR, 'audit-trail-export.csv');
  fs.writeFileSync(csvExportPath, csvRows.join('\n'), 'utf8');
  console.log(`✅ Written ${csvExportPath} (${allAuditLogs.length} audit log rows, ${(fs.statSync(csvExportPath).size / 1024).toFixed(1)} KB)`);

  console.log('\n================================================================');
  console.log('🎉 Full Pipeline & Sample Deliverable Generation Complete!');
  console.log('================================================================\n');
}

runPipeline()
  .catch((err) => {
    console.error('❌ Pipeline run failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
