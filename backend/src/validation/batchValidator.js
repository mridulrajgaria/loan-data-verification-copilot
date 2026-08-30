/**
 * Batch Validation Orchestrator (Module B)
 *
 * Coordinates database rule synchronization, batch loan evaluation,
 * granular Exception row creation (one Exception per failing rule),
 * and immutable audit log generation.
 */

const prisma = require('../db');
const { logAudit } = require('../services/auditService');
const { validateLoan, loadConfig } = require('./engine');

/**
 * Ensures all validation rules from JSON config exist in the database table.
 */
async function syncValidationRules(config = null) {
  const cfg = config || loadConfig();
  const rulesMap = new Map();

  for (const r of cfg.rules) {
    const upserted = await prisma.validationRule.upsert({
      where: { ruleCode: r.ruleCode },
      update: {
        name: r.name,
        description: r.description,
        category: r.category,
        severity: r.severity,
        ruleType: r.ruleType,
        ruleConfig: JSON.stringify({ ...r }),
        isActive: true,
      },
      create: {
        ruleCode: r.ruleCode,
        name: r.name,
        description: r.description,
        category: r.category,
        severity: r.severity,
        ruleType: r.ruleType,
        ruleConfig: JSON.stringify({ ...r }),
        isActive: true,
      },
    });
    rulesMap.set(r.ruleCode, upserted);
  }

  return rulesMap;
}

/**
 * Runs validation on all NormalizedLoans for a given rawUploadId.
 *
 * @param {Object} params
 * @param {string} params.rawUploadId - The ID of the RawUpload to validate
 * @param {Array<Object>} [params.servicerUpdates] - Parsed rows from servicer_update.csv
 * @param {Array<Object>} [params.documentManifests] - Parsed rows from document_manifest.csv
 * @param {string} [params.actor] - User ID or "system"
 * @returns {Promise<Object>} Batch validation summary
 */
async function runBatchValidation({ rawUploadId, servicerUpdates = [], documentManifests = [], actor = 'system' }) {
  // 1. Sync validation rules in DB
  const rulesMap = await syncValidationRules();

  // 2. Fetch all normalized loans for this upload
  const loans = await prisma.normalizedLoan.findMany({
    where: { rawUploadId },
    orderBy: { createdAt: 'asc' },
  });

  if (loans.length === 0) {
    throw new Error(`No normalized loans found for upload ID ${rawUploadId}`);
  }

  // 3. Build lookup index maps for duplicate and cross-source checks
  const loanIdCounts = new Map();
  const tripletCounts = new Map();

  for (const l of loans) {
    if (l.loanIdentifier) {
      loanIdCounts.set(l.loanIdentifier, (loanIdCounts.get(l.loanIdentifier) || 0) + 1);
    }
    if (l.borrowerId && l.originalPrincipal !== null && l.originationDate) {
      const isoDate = new Date(l.originationDate).toISOString().split('T')[0];
      const key = `${l.borrowerId}|${l.originalPrincipal}|${isoDate}`;
      tripletCounts.set(key, (tripletCounts.get(key) || 0) + 1);
    }
  }

  // Query existing loans in DB prior to this upload
  const existingDbLoans = await prisma.normalizedLoan.findMany({
    where: {
      rawUploadId: { not: rawUploadId },
      loanIdentifier: { not: '' },
    },
    select: { loanIdentifier: true },
  });
  const existingDbLoanIds = new Set(existingDbLoans.map((l) => l.loanIdentifier));

  // Build secondary feed maps
  const servicerMap = new Map();
  for (const s of servicerUpdates) {
    if (s.loan_id) servicerMap.set(String(s.loan_id).trim(), s);
  }

  const manifestMap = new Map();
  for (const m of documentManifests) {
    if (m.loan_id) manifestMap.set(String(m.loan_id).trim(), m);
  }

  const hasManifestFeed = documentManifests.length > 0;

  // 4. Validate each loan and record individual Exception rows
  let totalEvaluations = 0;
  let totalViolations = 0;
  let loansWithViolations = 0;
  const createdExceptions = [];

  for (const loan of loans) {
    const servicerMatch = loan.loanIdentifier ? servicerMap.get(loan.loanIdentifier) : null;
    const manifestMatch = loan.loanIdentifier ? manifestMap.get(loan.loanIdentifier) : null;

    const validationResults = validateLoan(loan, {
      servicerUpdate: servicerMatch,
      documentManifest: manifestMatch,
      hasManifestFeed,
      loanIdCounts,
      existingDbLoanIds,
      tripletCounts,
    });

    totalEvaluations += validationResults.length;
    const failingResults = validationResults.filter((r) => !r.passed);

    let loanStatus = 'VALID';
    if (failingResults.length > 0) {
      loanStatus = 'FLAGGED';
      loansWithViolations++;
      totalViolations += failingResults.length;
      // Clear prior OPEN exceptions on this loan to ensure batch revalidation idempotency
      await prisma.exception.deleteMany({
        where: { loanId: loan.id, status: 'OPEN' },
      });

      // Insert individual Exception record per failing rule
      for (const fail of failingResults) {
        const dbRule = rulesMap.get(fail.rule_id);
        const ruleId = dbRule ? dbRule.id : null;

        if (ruleId) {
          const exception = await prisma.exception.create({
            data: {
              loanId: loan.id,
              ruleId,
              severity: fail.severity,
              status: 'OPEN',
              details: JSON.stringify({
                message: fail.message,
                details: fail.details,
                ruleName: fail.name,
              }),
              resolution: null,
            },
          });
          createdExceptions.push(exception);

          // Audit log for individual exception creation
          await logAudit({
            actor,
            actionType: 'EXCEPTION_CREATED',
            entityType: 'Exception',
            entityId: exception.id,
            details: {
              loanId: loan.id,
              loanIdentifier: loan.loanIdentifier,
              ruleCode: fail.rule_id,
              severity: fail.severity,
              message: fail.message,
            },
          });
        }
      }
    }

    // Update loan verification status
    await prisma.normalizedLoan.update({
      where: { id: loan.id },
      data: { status: loanStatus },
    });
  }

  // 5. Write master batch validation audit log
  await logAudit({
    actor,
    actionType: 'VALIDATE',
    entityType: 'RawUpload',
    entityId: rawUploadId,
    details: {
      totalLoans: loans.length,
      totalRuleEvaluations: totalEvaluations,
      loansWithViolations,
      totalExceptionsCreated: createdExceptions.length,
      cleanLoansCount: loans.length - loansWithViolations,
    },
  });

  return {
    rawUploadId,
    totalLoans: loans.length,
    totalRuleEvaluations: totalEvaluations,
    cleanLoans: loans.length - loansWithViolations,
    flaggedLoans: loansWithViolations,
    totalExceptionsCreated: createdExceptions.length,
  };
}

module.exports = {
  runBatchValidation,
  syncValidationRules,
};
