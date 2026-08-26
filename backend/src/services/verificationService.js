/**
 * Cryptographic Verification Service (Module E)
 *
 * Generates tamper-evident VerifiedLoan records by constructing deterministic
 * canonical JSON payloads and calculating immutable SHA-256 digests.
 */

const crypto = require('crypto');
const prisma = require('../db');
const { logAudit } = require('./auditService');
const { validateLoan } = require('../validation/engine');

/**
 * Deterministic JSON stringifier that sorts all object keys recursively.
 * Guarantees identical byte output regardless of JavaScript object key insertion order.
 *
 * @param {any} obj - Target value to serialize
 * @returns {string} Deterministic canonical JSON string
 */
function canonicalStringify(obj) {
  if (obj === null || typeof obj !== 'object') {
    // Standardize undefined as null for deterministic JSON
    if (obj === undefined) return 'null';
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => canonicalStringify(item)).join(',') + ']';
  }

  // Object: sort keys alphabetically
  const keys = Object.keys(obj).sort();
  const keyValues = keys.map((key) => {
    return JSON.stringify(key) + ':' + canonicalStringify(obj[key]);
  });

  return '{' + keyValues.join(',') + '}';
}

/**
 * Computes SHA-256 hash hex digest of a deterministic canonical payload.
 *
 * @param {Object|string} payload - Canonical object or canonical string
 * @returns {{ canonicalJson: string, recordHash: string }}
 */
function computeRecordHash(payload) {
  const canonicalJson = typeof payload === 'string' ? payload : canonicalStringify(payload);
  const recordHash = crypto.createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
  return { canonicalJson, recordHash };
}

/**
 * Builds the comprehensive, self-contained canonical document for a loan at verification time.
 * Deep-copies loan attributes, lineage references, validation snapshot, and reviewer decision.
 */
function buildCanonicalDocument({
  loan,
  rawUpload,
  rawLoanRecord,
  validationSnapshot,
  reviewAction = null,
  reviewerId,
  reviewerNote = null,
  aiRecommendationId = null,
  verifiedAt = new Date().toISOString(),
}) {
  return {
    schemaVersion: '1.0.0',
    verifiedAt: typeof verifiedAt === 'string' ? verifiedAt : verifiedAt.toISOString(),

    // 1. Canonical Loan Fields (Deep copy of verified domain attributes)
    canonicalLoan: {
      loanIdentifier: loan.loanIdentifier,
      borrowerId: loan.borrowerId,
      borrowerName: loan.borrowerName,
      borrowerEmail: loan.borrowerEmail,
      loanType: loan.loanType,
      originationDate: loan.originationDate ? new Date(loan.originationDate).toISOString().split('T')[0] : null,
      maturityDate: loan.maturityDate ? new Date(loan.maturityDate).toISOString().split('T')[0] : null,
      originalPrincipal: loan.originalPrincipal !== null ? parseFloat(Number(loan.originalPrincipal).toFixed(2)) : null,
      currentBalance: loan.currentBalance !== null ? parseFloat(Number(loan.currentBalance).toFixed(2)) : null,
      interestRate: loan.interestRate !== null ? parseFloat(Number(loan.interestRate).toFixed(4)) : null,
      termMonths: loan.termMonths,
      borrowerState: loan.borrowerState,
      loanPurpose: loan.loanPurpose,
      creditGrade: loan.creditGrade,
      employmentLength: loan.employmentLength,
      incomeBand: loan.incomeBand,
      paymentStatus: loan.paymentStatus,
      daysPastDue: loan.daysPastDue,
      documentStatus: loan.documentStatus,
      servicerName: loan.servicerName,
      sourceSystem: loan.sourceSystem,
      propertyAddress: loan.propertyAddress,
      propertyValue: loan.propertyValue,
      ltvRatio: loan.ltvRatio,
      creditScore: loan.creditScore,
      entityVersion: loan.currentVersion,
    },

    // 2. Source Lineage Provenance
    provenance: {
      sourceUploadId: rawUpload?.id || loan.rawUploadId,
      sourceFilename: rawUpload?.filename || 'unknown_upload',
      sourceFileHash: rawUpload?.fileHash || 'unhashed',
      sourceRowNumber: rawLoanRecord?.rowNumber || null,
      sourceRawContentSha256: rawLoanRecord?.rawContent
        ? crypto.createHash('sha256').update(rawLoanRecord.rawContent).digest('hex')
        : null,
    },

    // 3. Validation Snapshot (Exact state of rules at sign-off time)
    validationSnapshot: (validationSnapshot || []).map((r) => ({
      ruleId: r.rule_id,
      name: r.name,
      severity: r.severity,
      passed: r.passed,
      message: r.message,
    })),

    // 4. Human Reviewer Attestation & Decision Record
    reviewAttestation: {
      reviewerId,
      decision: reviewAction?.resolution || 'approved',
      reviewerNote: reviewerNote || reviewAction?.notes || 'Loan verified and approved for portfolio inclusion.',
      actionType: reviewAction?.actionType || 'VERIFY',
      aiRecommendationId: aiRecommendationId || reviewAction?.aiRecommendationId || null,
    },
  };
}

/**
 * Creates and persists a VerifiedLoan record in SQLite with a cryptographic hash.
 *
 * @param {Object} params
 * @param {string} params.loanId - ID of NormalizedLoan
 * @param {string} params.userId - Reviewer User ID
 * @param {string} [params.reviewerNote] - Underwriter notes
 * @param {string} [params.aiRecommendationId] - AI suggestion reference if accepted
 * @param {Object} [params.tx] - Optional Prisma transaction
 * @returns {Promise<Object>} The created VerifiedLoan record and verification details
 */
async function createVerifiedLoanRecord({
  loanId,
  userId,
  reviewerNote = null,
  aiRecommendationId = null,
  tx = null,
}) {
  const db = tx || prisma;

  // 1. Fetch loan with full lineage and latest review action
  const loan = await db.normalizedLoan.findUnique({
    where: { id: loanId },
    include: {
      rawUpload: true,
      rawLoanRecord: true,
      reviewActions: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      exceptions: {
        include: { rule: true },
      },
    },
  });

  if (!loan) {
    throw new Error(`NormalizedLoan with ID '${loanId}' not found.`);
  }

  // Ensure user exists
  let validUserId = userId;
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) {
    const defaultUser = await db.user.upsert({
      where: { email: 'verifier@loancopilot.local' },
      update: {},
      create: {
        id: userId !== 'system' ? userId : undefined,
        email: 'verifier@loancopilot.local',
        name: 'System Verifier',
        passwordHash: '$2b$10$defaultHashForTestingVerificationAuth00',
        role: 'REVIEWER',
      },
    });
    validUserId = defaultUser.id;
  }

  // 2. Evaluate point-in-time validation snapshot
  const validationSnapshot = validateLoan(loan);

  // 3. Build canonical document payload
  const verifiedAt = new Date();
  const canonicalDoc = buildCanonicalDocument({
    loan,
    rawUpload: loan.rawUpload,
    rawLoanRecord: loan.rawLoanRecord,
    validationSnapshot,
    reviewAction: loan.reviewActions[0] || null,
    reviewerId: validUserId,
    reviewerNote,
    aiRecommendationId,
    verifiedAt,
  });

  // 4. Compute deterministic SHA-256 hash
  const { canonicalJson, recordHash } = computeRecordHash(canonicalDoc);

  // 5. Upsert VerifiedLoan row
  const verifiedRecord = await db.verifiedLoan.upsert({
    where: { loanId: loan.id },
    update: {
      canonicalJson,
      recordHash,
      verifiedByUserId: validUserId,
      verifiedAt,
      version: { increment: 1 },
    },
    create: {
      loanId: loan.id,
      canonicalJson,
      recordHash,
      verifiedByUserId: validUserId,
      verifiedAt,
      version: 1,
    },
  });

  // 6. Update loan status to VERIFIED
  await db.normalizedLoan.update({
    where: { id: loan.id },
    data: { status: 'VERIFIED' },
  });

  // 7. Write Audit Log for verification
  await logAudit(
    {
      actor: validUserId,
      actionType: 'VERIFIED',
      entityType: 'VerifiedLoan',
      entityId: verifiedRecord.id,
      details: {
        loanId: loan.id,
        loanIdentifier: loan.loanIdentifier,
        recordHash,
        sourceUploadId: loan.rawUploadId,
        version: verifiedRecord.version,
      },
    },
    db
  );

  return {
    verifiedLoan: verifiedRecord,
    recordHash,
    canonicalJson,
    canonicalDoc,
  };
}

/**
 * Verifies the integrity of a VerifiedLoan record by independently re-computing the SHA-256 hash
 * from the stored canonical JSON.
 *
 * @param {string} verifiedLoanId - The ID of the VerifiedLoan row
 * @returns {Promise<Object>} Tamper verification result
 */
async function verifyRecordHash(verifiedLoanId) {
  const record = await prisma.verifiedLoan.findUnique({
    where: { id: verifiedLoanId },
    include: {
      loan: true,
      verifiedByUser: {
        select: { id: true, name: true, email: true, role: true },
      },
    },
  });

  if (!record) {
    throw new Error(`VerifiedLoan record '${verifiedLoanId}' not found.`);
  }

  const storedHash = record.recordHash;
  const storedJson = record.canonicalJson;

  let parsedDoc = null;
  try {
    parsedDoc = JSON.parse(storedJson);
  } catch (err) {
    return {
      verifiedLoanId: record.id,
      loanIdentifier: record.loan.loanIdentifier,
      isValid: false,
      tamperDetected: true,
      reason: 'Stored canonical JSON is corrupt and could not be parsed.',
      storedHash,
      computedHash: null,
      verifiedAt: record.verifiedAt,
    };
  }

  // Re-serialize deterministically to verify key sorting independence
  const { canonicalJson: recomputedJson, recordHash: computedHash } = computeRecordHash(parsedDoc);

  const isValid = storedHash === computedHash;

  return {
    verifiedLoanId: record.id,
    loanIdentifier: record.loan.loanIdentifier,
    isValid,
    tamperDetected: !isValid,
    storedHash,
    computedHash,
    match: isValid ? 'EXACT_MATCH' : 'HASH_MISMATCH_TAMPER_DETECTED',
    verifiedAt: record.verifiedAt,
    verifiedBy: record.verifiedByUser,
    version: record.version,
    canonicalData: parsedDoc,
  };
}

module.exports = {
  canonicalStringify,
  computeRecordHash,
  buildCanonicalDocument,
  createVerifiedLoanRecord,
  verifyRecordHash,
};
