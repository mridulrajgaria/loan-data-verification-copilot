const express = require('express');
const prisma = require('../db');
const { logAudit } = require('../services/auditService');
const { aiRateLimiter } = require('../middleware/rateLimiter');
const { authenticateUser, requireRole } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validate');
const {
  exceptionQuerySchema,
  idParamSchema,
  decisionBodySchema,
  batchSummaryBodySchema,
} = require('../schemas/validationSchemas');
const {
  explainFailure,
  suggestCorrection,
  summarizeExceptionBatch,
} = require('../ai/reviewAssistant');

const router = express.Router();

function getActor(req) {
  return req.user?.id || req.headers['x-user-id'] || 'system';
}

/**
 * GET /api/exceptions
 * List exceptions with bounded pagination and Zod-validated filters.
 */
router.get(
  '/',
  authenticateUser,
  validateRequest({ query: exceptionQuerySchema }),
  async (req, res) => {
    try {
      const { status, severity, ruleCode, loanId, rawUploadId, page = 1, limit = 50 } = req.query;
      const take = Math.min(limit, 100);
      const skip = (page - 1) * take;

      const where = {};
      if (status) where.status = status;
      if (severity) where.severity = severity;
      if (loanId) where.loanId = loanId;
      if (ruleCode) where.rule = { ruleCode };
      if (rawUploadId) where.loan = { rawUploadId };

      const [exceptions, totalCount] = await Promise.all([
        prisma.exception.findMany({
          where,
          include: {
            rule: true,
            loan: {
              select: {
                id: true,
                loanIdentifier: true,
                borrowerName: true,
                originalPrincipal: true,
                currentBalance: true,
                interestRate: true,
                paymentStatus: true,
                daysPastDue: true,
                borrowerState: true,
                status: true,
              },
            },
            aiRecommendations: {
              orderBy: { createdAt: 'desc' },
              take: 3,
            },
            reviewActions: {
              orderBy: { createdAt: 'desc' },
            },
          },
          orderBy: [{ createdAt: 'desc' }],
          skip,
          take,
        }),
        prisma.exception.count({ where }),
      ]);

      return res.status(200).json({
        success: true,
        data: {
          items: exceptions,
          total: totalCount,
          page,
          totalPages: Math.ceil(totalCount / take),
        },
      });
    } catch (error) {
      console.error('[GET_EXCEPTIONS_ERROR]', error);
      return res.status(500).json({ success: false, error: 'Failed to retrieve exception records.' });
    }
  }
);

/**
 * GET /api/exceptions/:id
 * Retrieve full details for a single exception including lineage and AI suggestions.
 */
router.get(
  '/:id',
  authenticateUser,
  validateRequest({ params: idParamSchema }),
  async (req, res) => {
    try {
      const { id } = req.params;
      const exception = await prisma.exception.findUnique({
        where: { id },
        include: {
          rule: true,
          loan: {
            include: {
              rawUpload: true,
              rawLoanRecord: true,
            },
          },
          aiRecommendations: {
            orderBy: { createdAt: 'desc' },
          },
          reviewActions: {
            include: {
              user: { select: { id: true, name: true, email: true, role: true } },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!exception) {
        return res.status(404).json({ success: false, error: `Exception '${id}' not found.` });
      }

      return res.status(200).json({ success: true, data: exception });
    } catch (error) {
      console.error('[GET_EXCEPTION_DETAIL_ERROR]', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch exception detail.' });
    }
  }
);

/**
 * POST /api/exceptions/:id/ai-explain
 * Generates plain-language explanation of rule failure.
 * Requires REVIEWER or ADMIN role. Rate-limited.
 */
router.post(
  '/:id/ai-explain',
  authenticateUser,
  requireRole(['REVIEWER', 'ADMIN', 'OPERATOR']),
  validateRequest({ params: idParamSchema }),
  aiRateLimiter,
  async (req, res) => {
    try {
      const { id } = req.params;
      const actor = getActor(req);

      const explanation = await explainFailure(id, actor);
      return res.status(200).json({ success: true, data: explanation });
    } catch (error) {
      console.error('[AI_EXPLAIN_ERROR]', error);
      return res.status(error.message?.includes('not found') ? 404 : 500).json({
        success: false,
        error: error.message || 'Failed to generate AI explanation.',
      });
    }
  }
);

/**
 * POST /api/exceptions/:id/ai-suggest
 * Generates suggested field-level correction.
 * Requires REVIEWER or ADMIN role. Rate-limited.
 */
router.post(
  '/:id/ai-suggest',
  authenticateUser,
  requireRole(['REVIEWER', 'ADMIN', 'OPERATOR']),
  validateRequest({ params: idParamSchema }),
  aiRateLimiter,
  async (req, res) => {
    try {
      const { id } = req.params;
      const actor = getActor(req);

      const suggestion = await suggestCorrection(id, actor);
      return res.status(200).json({ success: true, data: suggestion });
    } catch (error) {
      console.error('[AI_SUGGEST_ERROR]', error);
      return res.status(error.message?.includes('not found') ? 404 : 500).json({
        success: false,
        error: error.message || 'Failed to generate AI suggestion.',
      });
    }
  }
);

/**
 * POST /api/exceptions/ai-summary
 * Generates portfolio executive summary of open exception batch. Rate-limited.
 */
router.post(
  '/ai-summary',
  authenticateUser,
  validateRequest({ body: batchSummaryBodySchema }),
  aiRateLimiter,
  async (req, res) => {
    try {
      const filterCriteria = req.body || {};
      const actor = getActor(req);

      const summary = await summarizeExceptionBatch(filterCriteria, actor);
      return res.status(200).json({ success: true, data: summary });
    } catch (error) {
      console.error('[AI_SUMMARY_ERROR]', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to generate batch AI summary.',
      });
    }
  }
);

/**
 * POST /api/exceptions/:id/decision
 * The ONLY endpoint authorized to mutate exception status or loan data.
 * Requires REVIEWER or ADMIN role.
 */
router.post(
  '/:id/decision',
  authenticateUser,
  requireRole(['REVIEWER', 'ADMIN']),
  validateRequest({ params: idParamSchema, body: decisionBodySchema }),
  async (req, res) => {
    try {
      const { id } = req.params;
      const {
        decision,
        notes,
        editedFields = null,
        acceptedAiRecommendationId = null,
      } = req.body;

      const actor = getActor(req);
      const normalizedDecision = decision.toLowerCase();

      // 1. Fetch current Exception and parent Loan
      const exception = await prisma.exception.findUnique({
        where: { id },
        include: {
          loan: true,
          rule: true,
        },
      });

      if (!exception) {
        return res.status(404).json({ success: false, error: `Exception with ID '${id}' not found.` });
      }

      const loan = exception.loan;

      // Ensure valid user ID for foreign key
      let userId = actor;
      const userExists = await prisma.user.findUnique({ where: { id: userId } });
      if (!userExists) {
        const defaultUser = await prisma.user.upsert({
          where: { email: 'reviewer@loancopilot.local' },
          update: {},
          create: {
            id: userId !== 'system' ? userId : undefined,
            email: 'reviewer@loancopilot.local',
            name: 'System Reviewer',
            passwordHash: '$2b$10$defaultPlaceholderHashForReviewerAuth00000',
            role: 'REVIEWER',
          },
        });
        userId = defaultUser.id;
      }

      // 2. Capture snapshots for beforeState and afterState
      const beforeState = {
        exception: {
          id: exception.id,
          status: exception.status,
          resolution: exception.resolution,
        },
        loan: {
          id: loan.id,
          status: loan.status,
          version: loan.currentVersion,
          ...loan,
        },
      };

      // 3. Execute State-Changing Mutations inside an atomic transaction
      const result = await prisma.$transaction(async (tx) => {
        // A. Update Exception status
        const updatedException = await tx.exception.update({
          where: { id: exception.id },
          data: {
            status: 'RESOLVED',
            resolution: normalizedDecision,
            resolvedAt: new Date(),
          },
        });

        // B. If human accepted an AI recommendation, link and update it
        if (acceptedAiRecommendationId) {
          await tx.aIRecommendation.updateMany({
            where: { id: acceptedAiRecommendationId },
            data: {
              acceptedByReviewer: true,
              reviewedByUserId: userId,
              reviewedAt: new Date(),
            },
          });
        }

        // C. Apply field mutations to NormalizedLoan if decision is "corrected"
        let updatedLoan = loan;
        if (normalizedDecision === 'corrected' && editedFields && typeof editedFields === 'object') {
          const allowedLoanFields = [
            'loanIdentifier',
            'borrowerId',
            'borrowerName',
            'originalPrincipal',
            'currentBalance',
            'interestRate',
            'termMonths',
            'borrowerState',
            'loanPurpose',
            'creditGrade',
            'paymentStatus',
            'daysPastDue',
            'documentStatus',
            'originationDate',
            'maturityDate',
            'lastUpdatedAt',
            'lastPaymentDate',
          ];

          const sanitizedUpdate = {};
          for (const [key, val] of Object.entries(editedFields)) {
            if (allowedLoanFields.includes(key)) {
              if (key.includes('Date') && val) {
                sanitizedUpdate[key] = new Date(val);
              } else if (['originalPrincipal', 'currentBalance', 'interestRate'].includes(key) && val !== null) {
                sanitizedUpdate[key] = parseFloat(val);
              } else if (['termMonths', 'daysPastDue'].includes(key) && val !== null) {
                sanitizedUpdate[key] = parseInt(val, 10);
              } else {
                sanitizedUpdate[key] = val;
              }
            }
          }

          if (loan.rawUnparsedValues) {
            try {
              const unparsed = JSON.parse(loan.rawUnparsedValues);
              if (sanitizedUpdate.originationDate && unparsed.origination_date) {
                delete unparsed.origination_date;
              }
              if (sanitizedUpdate.maturityDate && unparsed.maturity_date) {
                delete unparsed.maturity_date;
              }
              if (sanitizedUpdate.loanIdentifier && unparsed.loan_id) {
                delete unparsed.loan_id;
              }
              sanitizedUpdate.rawUnparsedValues = Object.keys(unparsed).length > 0 ? JSON.stringify(unparsed) : null;
            } catch {}
          }

          updatedLoan = await tx.normalizedLoan.update({
            where: { id: loan.id },
            data: {
              ...sanitizedUpdate,
              currentVersion: { increment: 1 },
            },
          });
        }

        // D. Check if all exceptions on this loan are now resolved
        const remainingOpenExceptions = await tx.exception.count({
          where: {
            loanId: loan.id,
            id: { not: exception.id },
            status: { notIn: ['RESOLVED', 'DISMISSED'] },
          },
        });

        let nextLoanStatus = updatedLoan.status;
        if (remainingOpenExceptions === 0) {
          nextLoanStatus = normalizedDecision === 'rejected' ? 'REJECTED' : 'APPROVED';
          updatedLoan = await tx.normalizedLoan.update({
            where: { id: loan.id },
            data: { status: nextLoanStatus },
          });
        }

        const afterState = {
          exception: {
            id: updatedException.id,
            status: updatedException.status,
            resolution: updatedException.resolution,
            resolvedAt: updatedException.resolvedAt,
          },
          loan: {
            id: updatedLoan.id,
            status: updatedLoan.status,
            version: updatedLoan.currentVersion,
          },
          editedFields: normalizedDecision === 'corrected' ? editedFields : null,
        };

        // E. Create ReviewAction (The immutable human decision record)
        let actionType = 'OVERRIDE_APPROVE';
        if (normalizedDecision === 'rejected') actionType = 'REJECT';
        if (normalizedDecision === 'corrected') actionType = acceptedAiRecommendationId ? 'ACCEPT_AI_FIX' : 'MANUAL_EDIT';

        const reviewAction = await tx.reviewAction.create({
          data: {
            loanId: loan.id,
            exceptionId: exception.id,
            userId,
            actionType,
            resolution: normalizedDecision,
            beforeState: JSON.stringify(beforeState),
            afterState: JSON.stringify(afterState),
            notes,
            aiRecommendationId: acceptedAiRecommendationId || null,
          },
        });

        // F. Write Audit Log for the decision
        await logAudit(
          {
            actor: userId,
            actionType: actionType,
            entityType: 'Exception',
            entityId: exception.id,
            details: {
              loanId: loan.id,
              loanIdentifier: loan.loanIdentifier,
              ruleCode: exception.rule.ruleCode,
              decision: normalizedDecision,
              notes,
              appliedAiRecommendationId: acceptedAiRecommendationId,
              remainingOpenExceptions,
              loanFinalStatus: nextLoanStatus,
            },
          },
          tx
        );

        return {
          exception: updatedException,
          reviewAction,
          loan: updatedLoan,
          remainingOpenExceptions,
        };
      });

      return res.status(200).json({
        success: true,
        message: `Exception resolved with decision '${normalizedDecision}'.`,
        data: result,
      });
    } catch (error) {
      console.error('[REVIEW_DECISION_ERROR]', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'An error occurred while processing reviewer decision.',
      });
    }
  }
);

module.exports = router;
