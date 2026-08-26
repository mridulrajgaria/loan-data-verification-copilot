const express = require('express');
const prisma = require('../db');
const { authenticateUser, requireRole } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validate');
const {
  loanQuerySchema,
  idParamSchema,
  exportQuerySchema,
} = require('../schemas/validationSchemas');

const router = express.Router();

/**
 * GET /api/summary
 * Master portfolio summary metrics.
 */
router.get('/summary', authenticateUser, async (req, res) => {
  try {
    const [
      totalUploads,
      totalLoans,
      verifiedLoansCount,
      flaggedLoansCount,
      cleanLoansCount,
      exceptionsBySeverity,
      exceptionsByRule,
      recentAuditLogs,
    ] = await Promise.all([
      prisma.rawUpload.count(),
      prisma.normalizedLoan.count(),
      prisma.verifiedLoan.count(),
      prisma.normalizedLoan.count({ where: { status: 'FLAGGED' } }),
      prisma.normalizedLoan.count({ where: { status: { in: ['VALID', 'APPROVED', 'VERIFIED'] } } }),
      prisma.exception.groupBy({
        by: ['severity'],
        where: { status: 'OPEN' },
        _count: { id: true },
      }),
      prisma.exception.groupBy({
        by: ['ruleId'],
        where: { status: 'OPEN' },
        _count: { id: true },
      }),
      prisma.auditLog.findMany({
        orderBy: { timestamp: 'desc' },
        take: 15,
      }),
    ]);

    const totalOpenExceptions = exceptionsBySeverity.reduce((acc, curr) => acc + curr._count.id, 0);

    const qualityPercentage = totalLoans > 0 ? parseFloat(((verifiedLoansCount / totalLoans) * 100).toFixed(2)) : 0.0;
    const avgExceptionsPerLoan = totalLoans > 0 ? parseFloat((totalOpenExceptions / totalLoans).toFixed(2)) : 0.0;

    const severityCounts = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      WARNING: 0,
    };
    exceptionsBySeverity.forEach((item) => {
      severityCounts[item.severity] = item._count.id;
    });

    return res.status(200).json({
      success: true,
      data: {
        totalUploads,
        totalLoans,
        verifiedLoansCount,
        flaggedLoansCount,
        cleanLoansCount,
        totalOpenExceptions,
        severityCounts,
        dataQualityScore: {
          percentage: qualityPercentage,
          formula: '(verified_records / total_ingested_records) * 100',
          verifiedCount: verifiedLoansCount,
          totalCount: totalLoans,
          avgExceptionsPerLoan,
        },
        recentAuditLogs,
      },
    });
  } catch (error) {
    console.error('[GET_SUMMARY_ERROR]', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch summary metrics.' });
  }
});

/**
 * GET /api/loans
 * Query normalized loans with Zod validation & bounded pagination.
 */
router.get(
  '/loans',
  authenticateUser,
  validateRequest({ query: loanQuerySchema }),
  async (req, res) => {
    try {
      const { status, loanIdentifier, borrowerId, uploadId, page = 1, limit = 50 } = req.query;
      const take = Math.min(limit, 100);
      const skip = (page - 1) * take;

      const where = {};
      if (status) where.status = status;
      if (loanIdentifier) where.loanIdentifier = { contains: loanIdentifier };
      if (borrowerId) where.borrowerId = { contains: borrowerId };
      if (uploadId) where.rawUploadId = uploadId;

      const [loans, total] = await Promise.all([
        prisma.normalizedLoan.findMany({
          where,
          include: {
            rawUpload: { select: { filename: true, createdAt: true } },
            exceptions: {
              where: { status: 'OPEN' },
              include: { rule: true },
            },
            verifiedLoan: { select: { recordHash: true, verifiedAt: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        prisma.normalizedLoan.count({ where }),
      ]);

      return res.status(200).json({
        success: true,
        data: {
          items: loans,
          total,
          page,
          totalPages: Math.ceil(total / take),
        },
      });
    } catch (error) {
      console.error('[GET_LOANS_ERROR]', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch loans.' });
    }
  }
);

/**
 * GET /api/loans/:id
 * Retrieve loan with complete lineage.
 */
router.get(
  '/loans/:id',
  authenticateUser,
  validateRequest({ params: idParamSchema }),
  async (req, res) => {
    try {
      const { id } = req.params;
      const loan = await prisma.normalizedLoan.findUnique({
        where: { id },
        include: {
          rawUpload: true,
          rawLoanRecord: true,
          exceptions: {
            include: {
              rule: true,
              aiRecommendations: { orderBy: { createdAt: 'desc' } },
              reviewActions: { include: { user: true }, orderBy: { createdAt: 'desc' } },
            },
          },
          reviewActions: {
            include: { user: true, aiRecommendation: true },
            orderBy: { createdAt: 'desc' },
          },
          aiRecommendations: {
            orderBy: { createdAt: 'desc' },
          },
          verifiedLoan: {
            include: { verifiedByUser: true },
          },
        },
      });

      if (!loan) {
        return res.status(404).json({ success: false, error: `Loan '${id}' not found.` });
      }

      return res.status(200).json({ success: true, data: loan });
    } catch (error) {
      console.error('[GET_LOAN_DETAIL_ERROR]', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch loan details.' });
    }
  }
);

/**
 * GET /api/loans/:id/audit-trail
 * Interactive chronological timeline for a single loan.
 */
router.get(
  '/loans/:id/audit-trail',
  authenticateUser,
  validateRequest({ params: idParamSchema }),
  async (req, res) => {
    try {
      const { id } = req.params;
      const loan = await prisma.normalizedLoan.findUnique({ where: { id } });
      if (!loan) {
        return res.status(404).json({ success: false, error: `Loan '${id}' not found.` });
      }

      const exceptions = await prisma.exception.findMany({
        where: { loanId: id },
        select: { id: true },
      });
      const exceptionIds = exceptions.map((e) => e.id);

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          OR: [
            { entityId: id },
            { entityId: loan.rawUploadId },
            { entityId: { in: exceptionIds } },
          ],
        },
        orderBy: { timestamp: 'asc' },
      });

      return res.status(200).json({
        success: true,
        data: {
          loanIdentifier: loan.loanIdentifier,
          loanId: loan.id,
          timeline: auditLogs.map((log) => ({
            id: log.id,
            actor: log.actor,
            actionType: log.actionType,
            entityType: log.entityType,
            entityId: log.entityId,
            timestamp: log.timestamp,
            details: JSON.parse(log.details || '{}'),
          })),
        },
      });
    } catch (error) {
      console.error('[GET_AUDIT_TRAIL_ERROR]', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch loan audit trail.' });
    }
  }
);

/**
 * GET /api/export
 * Downloads verified records + audit trail in JSON or CSV.
 */
router.get(
  '/export',
  authenticateUser,
  validateRequest({ query: exportQuerySchema }),
  async (req, res) => {
    try {
      const { format = 'json', target = 'verified' } = req.query;

      const verifiedRecords = await prisma.verifiedLoan.findMany({
        include: {
          loan: true,
          verifiedByUser: { select: { id: true, name: true, email: true } },
        },
        orderBy: { verifiedAt: 'desc' },
      });

      const auditLogs = await prisma.auditLog.findMany({
        orderBy: { timestamp: 'desc' },
        take: 5000,
      });

      if (format === 'csv') {
        if (target === 'audit') {
          const headers = [
            'audit_id',
            'timestamp',
            'actor',
            'action_type',
            'entity_type',
            'entity_id',
            'details',
          ];

          const csvRows = [headers.join(',')];
          auditLogs.forEach((log) => {
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

          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', `attachment; filename="audit_trail_export_${Date.now()}.csv"`);
          return res.status(200).send(csvRows.join('\n'));
        }

        const headers = [
          'verified_loan_id',
          'loan_identifier',
          'record_hash',
          'verified_at',
          'verified_by',
          'original_principal',
          'current_balance',
          'interest_rate',
          'payment_status',
          'borrower_state',
        ];

        const csvRows = [headers.join(',')];
        verifiedRecords.forEach((v) => {
          const row = [
            v.id,
            v.loan.loanIdentifier,
            v.recordHash,
            v.verifiedAt.toISOString(),
            v.verifiedByUser?.name || 'System',
            v.loan.originalPrincipal,
            v.loan.currentBalance,
            v.loan.interestRate,
            v.loan.paymentStatus,
            v.loan.borrowerState,
          ];
          csvRows.push(row.map((val) => `"${String(val || '').replace(/"/g, '""')}"`).join(','));
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="verified_loan_portfolio_${Date.now()}.csv"`);
        return res.status(200).send(csvRows.join('\n'));
      }

      const exportBundle = {
        exportedAt: new Date().toISOString(),
        datasetVersion: '1.0.0',
        totalVerifiedLoans: verifiedRecords.length,
        verifiedLoans: verifiedRecords.map((v) => ({
          verifiedLoanId: v.id,
          recordHash: v.recordHash,
          verifiedAt: v.verifiedAt,
          verifiedBy: v.verifiedByUser,
          canonicalPayload: JSON.parse(v.canonicalJson),
        })),
        auditTrailSnapshot: auditLogs.map((log) => ({
          id: log.id,
          actor: log.actor,
          actionType: log.actionType,
          entityType: log.entityType,
          entityId: log.entityId,
          timestamp: log.timestamp,
          details: JSON.parse(log.details || '{}'),
        })),
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="verified_portfolio_export_${Date.now()}.json"`);
      return res.status(200).json(exportBundle);
    } catch (error) {
      console.error('[EXPORT_ERROR]', error);
      return res.status(500).json({ success: false, error: 'Failed to export verified records.' });
    }
  }
);

module.exports = router;
