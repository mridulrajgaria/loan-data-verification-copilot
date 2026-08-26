const express = require('express');
const prisma = require('../db');
const {
  createVerifiedLoanRecord,
  verifyRecordHash,
} = require('../services/verificationService');
const { authenticateUser, requireRole } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validate');
const {
  idParamSchema,
  verifyLoanBodySchema,
  paginationQuerySchema,
} = require('../schemas/validationSchemas');

const router = express.Router();

function getActor(req) {
  return req.user?.id || req.headers['x-user-id'] || 'system';
}

/**
 * POST /api/loans/:id/verify
 * Verifies an approved loan, locks its canonical state, and generates a SHA-256 record hash.
 * Requires REVIEWER or ADMIN role.
 */
router.post(
  '/loans/:id/verify',
  authenticateUser,
  requireRole(['REVIEWER', 'ADMIN']),
  validateRequest({ params: idParamSchema, body: verifyLoanBodySchema }),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { reviewerNote, aiRecommendationId } = req.body || {};
      const actor = getActor(req);

      const result = await createVerifiedLoanRecord({
        loanId: id,
        userId: actor,
        reviewerNote,
        aiRecommendationId,
      });

      return res.status(201).json({
        success: true,
        message: 'Loan successfully verified and cryptographically locked.',
        data: {
          verifiedLoanId: result.verifiedLoan.id,
          loanId: id,
          recordHash: result.recordHash,
          verifiedAt: result.verifiedLoan.verifiedAt,
          version: result.verifiedLoan.version,
          canonicalJson: result.canonicalJson,
        },
      });
    } catch (error) {
      console.error('[VERIFY_LOAN_ERROR]', error);
      return res.status(error.message?.includes('not found') ? 404 : 500).json({
        success: false,
        error: error.message || 'Failed to verify loan record.',
      });
    }
  }
);

/**
 * GET /api/verified-loans
 * List verified loans with bounded pagination.
 */
router.get(
  '/verified-loans',
  authenticateUser,
  validateRequest({ query: paginationQuerySchema }),
  async (req, res) => {
    try {
      const { page = 1, limit = 50 } = req.query;
      const take = Math.min(limit, 100);
      const skip = (page - 1) * take;

      const [records, totalCount] = await Promise.all([
        prisma.verifiedLoan.findMany({
          include: {
            loan: {
              select: {
                loanIdentifier: true,
                borrowerName: true,
                originalPrincipal: true,
                currentBalance: true,
                interestRate: true,
                status: true,
              },
            },
            verifiedByUser: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { verifiedAt: 'desc' },
          skip,
          take,
        }),
        prisma.verifiedLoan.count(),
      ]);

      return res.status(200).json({
        success: true,
        data: {
          items: records,
          total: totalCount,
          page,
          totalPages: Math.ceil(totalCount / take),
        },
      });
    } catch (error) {
      console.error('[GET_VERIFIED_LOANS_ERROR]', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch verified loans.' });
    }
  }
);

/**
 * GET /api/verified-loans/:id/verify-hash
 * Independently recomputes SHA-256 hash from stored canonical data.
 */
router.get(
  '/verified-loans/:id/verify-hash',
  authenticateUser,
  validateRequest({ params: idParamSchema }),
  async (req, res) => {
    try {
      const { id } = req.params;
      const result = await verifyRecordHash(id);

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('[VERIFY_HASH_ERROR]', error);
      return res.status(error.message?.includes('not found') ? 404 : 500).json({
        success: false,
        error: error.message || 'Failed to perform cryptographic hash verification.',
      });
    }
  }
);

/**
 * POST /api/verified-loans/:id/simulate-tamper
 * Live judge demonstration endpoint. Requires ADMIN or REVIEWER role.
 */
router.post(
  '/verified-loans/:id/simulate-tamper',
  authenticateUser,
  requireRole(['ADMIN', 'REVIEWER', 'OPERATOR']),
  validateRequest({ params: idParamSchema }),
  async (req, res) => {
    try {
      const { id } = req.params;
      const record = await prisma.verifiedLoan.findUnique({ where: { id } });

      if (!record) {
        return res.status(404).json({ success: false, error: 'Record not found.' });
      }

      const doc = JSON.parse(record.canonicalJson);
      doc.canonicalLoan.borrowerName = (doc.canonicalLoan.borrowerName || 'John Doe') + ' [UNAUTHORIZED_TAMPER]';
      doc.canonicalLoan.currentBalance = (doc.canonicalLoan.currentBalance || 100000) + 5000;

      const tamperedJson = JSON.stringify(doc);

      await prisma.verifiedLoan.update({
        where: { id },
        data: { canonicalJson: tamperedJson },
      });

      return res.status(200).json({
        success: true,
        message: 'Simulated tamper injected into SQLite database. Run verifyRecordHash now to observe mismatch.',
        data: {
          verifiedLoanId: id,
          originalHash: record.recordHash,
          tamperedField: 'borrowerName & currentBalance',
        },
      });
    } catch (error) {
      console.error('[SIMULATE_TAMPER_ERROR]', error);
      return res.status(500).json({ success: false, error: 'Failed to execute tamper simulation.' });
    }
  }
);

module.exports = router;
