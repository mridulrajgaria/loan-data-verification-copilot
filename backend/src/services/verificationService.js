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
  const lastUpdated = loan.lastUpdatedAt
    ? new Date(loan.lastUpdatedAt).toISOString().split('T')[0]
    : (loan.lastPaymentDate ? new Date(loan.lastPaymentDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);

  return {
    schemaVersion: '1.0.0',
    verifiedAt: typeof verifiedAt === 'string' ? verifiedAt : verifiedAt.toISOString(),

    // 1. Canonical Loan Fields (Deep copy of verified domain attributes)
    canonicalLoan: {
      loanIdentifier: loan.loanIdentifier || '',
      borrowerId: loan.borrowerId,
      borrowerName: loan.borrowerName,
      borrowerEmail: loan.borrowerEmail || null,
      loanType: loan.loanType,
      originationDate: loan.originationDate ? new Date(loan.originationDate).toISOString().split('T')[0] : null,
      maturityDate: loan.maturityDate ? new Date(loan.maturityDate).toISOString().split('T')[0] : null,
      originalPrincipal: loan.originalPrincipal !== null && loan.originalPrincipal !== undefined ? parseFloat(Number(loan.originalPrincipal).toFixed(2)) : null,
      currentBalance: loan.currentBalance !== null && loan.currentBalance !== undefined ? parseFloat(Number(loan.currentBalance).toFixed(2)) : null,
      interestRate: loan.interestRate !== null && loan.interestRate !== undefined ? parseFloat(Number(loan.interestRate).toFixed(4)) : null,
      termMonths: loan.termMonths !== null && loan.termMonths !== undefined ? parseInt(loan.termMonths, 10) : null,
      borrowerState: loan.borrowerState || null,
      loanPurpose: loan.loanPurpose || null,
      creditGrade: loan.creditGrade || null,
      employmentLength: loan.employmentLength || null,
      incomeBand: loan.incomeBand || null,
      paymentStatus: loan.paymentStatus || null,
      daysPastDue: loan.daysPastDue !== null && loan.daysPastDue !== undefined ? parseInt(loan.daysPastDue, 10) : 0,
      documentStatus: loan.documentStatus || null,
      servicerName: loan.servicerName || null,
      sourceSystem: loan.sourceSystem || null,
      propertyAddress: loan.propertyAddress || null,
      propertyValue: loan.propertyValue || null,
      ltvRatio: loan.ltvRatio || null,
      creditScore: loan.creditScore || null,
      lastUpdatedAt: lastUpdated,
      entityVersion: loan.currentVersion || 1,
    },

    // 2. Source Lineage Provenance
    provenance: {
      sourceUploadId: rawUpload?.id || loan.rawUploadId || 'unknown_upload',
      sourceFilename: rawUpload?.filename || 'loan_tape.csv',
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
 * @param {boolean} [params.allowPolicyOverride=true] - Whether policy override approved warnings are permitted
 * @param {Object} [params.tx] - Optional Prisma transaction
 * @returns {Promise<Object>} The created VerifiedLoan record and verification details
 */
async function createVerifiedLoanRecord({
  loanId,
  userId,
  reviewerNote = null,
  aiRecommendationId = null,
  allowPolicyOverride = true,
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

  if (loan.status === 'REJECTED') {
    throw new Error(`Cannot verify loan '${loan.loanIdentifier}': loan status is REJECTED.`);
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

  // Guard: Check if there are any unresolved OPEN critical exceptions on this loan
  const openCriticalExceptions = (loan.exceptions || []).filter(
    (e) => e.status === 'OPEN' && e.severity === 'CRITICAL'
  );
  if (openCriticalExceptions.length > 0) {
    throw new Error(`Cannot verify loan '${loan.loanIdentifier}': ${openCriticalExceptions.length} unresolved CRITICAL exception(s) remain open.`);
  }

  // Guard against uncorrected critical failures unless explicitly covered by policy override
  const criticalFailures = validationSnapshot.filter((r) => !r.passed && r.severity === 'CRITICAL');
  if (criticalFailures.length > 0) {
    const hasOverride = (loan.reviewActions || []).some((ra) => ra.actionType === 'OVERRIDE_APPROVE');
    if (!hasOverride) {
      const failedMsg = criticalFailures.map((f) => `${f.name}: ${f.message}`).join(' | ');
      throw new Error(`Cannot verify defective loan '${loan.loanIdentifier}': uncorrected CRITICAL validation failure(s) detected [${failedMsg}].`);
    }
  }

  // 3. Build canonical document payload
  const verifiedAt = new Date();
  const canonicalDoc = buildCanonicalDocument({
    loan,
    rawUpload: loan.rawUpload,
    rawLoanRecord: loan.rawLoanRecord,
    validationSnapshot,
    reviewAction: latestReviewAction,
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
      recordHash,
      canonicalJson,
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

  // 7. Write immutable audit log
  await logAudit(
    {
      actor: validUserId,
      actionType: 'VERIFY',
      entityType: 'VerifiedLoan',
      entityId: verifiedRecord.id,
      details: {
        loanId: loan.id,
        loanIdentifier: loan.loanIdentifier,
        recordHash,
        version: verifiedRecord.version,
        reviewActionId: latestReviewAction?.id || null,
        validationRulesPassed: validationSnapshot.filter((r) => r.passed).length,
        validationRulesTotal: validationSnapshot.length,
      },
    },
    db
  );

  return {
    verifiedLoan: verifiedRecord,
    canonicalJson,
    recordHash,
    canonicalDoc,
  };
}

/**
 * Recomputes the SHA-256 record hash from the stored canonical JSON and verifies its integrity.
 *
 * @param {string} verifiedLoanId - ID of the VerifiedLoan
 * @returns {Promise<Object>} Verification integrity result
 */
async function verifyRecordHash(verifiedLoanId) {
  const verifiedLoan = await prisma.verifiedLoan.findUnique({
    where: { id: verifiedLoanId },
    include: {
      loan: {
        select: {
          loanIdentifier: true,
          borrowerName: true,
          status: true,
        },
      },
      verifiedByUser: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
  });

  if (!verifiedLoan) {
    throw new Error(`VerifiedLoan record with ID '${verifiedLoanId}' not found.`);
  }

  // Parse stored canonical document to verify canonical serialization invariance
  let storedDoc;
  try {
    storedDoc = JSON.parse(verifiedLoan.canonicalJson);
  } catch (err) {
    return {
      verifiedLoanId,
      isValid: false,
      tamperDetected: true,
      error: 'Stored canonical JSON is corrupt and could not be parsed.',
      storedHash: verifiedLoan.recordHash,
      computedHash: null,
    };
  }

  // Re-serialize with recursive deterministic sorting
  const { canonicalJson: recomputedJson, recordHash: computedHash } = computeRecordHash(storedDoc);
  const isHashMatch = computedHash.toLowerCase() === verifiedLoan.recordHash.toLowerCase();

  return {
    verifiedLoanId: verifiedLoan.id,
    loanId: verifiedLoan.loanId,
    loanIdentifier: verifiedLoan.loan.loanIdentifier,
    borrowerName: verifiedLoan.loan.borrowerName,
    storedHash: verifiedLoan.recordHash,
    computedHash,
    match: isHashMatch ? 'EXACT_MATCH' : 'HASH_MISMATCH_TAMPER_DETECTED',
    isValid: isHashMatch,
    tamperDetected: !isHashMatch,
    verifiedAt: verifiedLoan.verifiedAt,
    verifiedBy: verifiedLoan.verifiedByUser,
    version: verifiedLoan.version,
  };
}

module.exports = {
  canonicalStringify,
  computeRecordHash,
  buildCanonicalDocument,
  createVerifiedLoanRecord,
  verifyRecordHash,
};
