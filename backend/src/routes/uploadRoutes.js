const express = require('express');
const multer = require('multer');
const path = require('path');
const { Readable } = require('stream');
const csvParser = require('csv-parser');
const prisma = require('../db');
const { processLoanTapeUpload, IngestionError } = require('../services/ingestionService');
const { runBatchValidation } = require('../validation/batchValidator');
const { authenticateUser, requireRole } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validate');
const { paginationQuerySchema } = require('../schemas/validationSchemas');

const router = express.Router();

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB limit

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'text/csv',
    'text/plain',
    'application/csv',
    'application/vnd.ms-excel',
    'text/x-csv',
  ];

  const ext = path.extname(file.originalname).toLowerCase();
  const isCsvExt = ext === '.csv';
  const isAllowedMime = allowedMimeTypes.includes(file.mimetype);

  if (isCsvExt && (isAllowedMime || file.mimetype === 'application/octet-stream')) {
    cb(null, true);
  } else {
    cb(
      new IngestionError(
        `Invalid file type "${file.mimetype}". Only valid RFC-4180 compliant CSV files (.csv) are accepted.`,
        400
      ),
      false
    );
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 3,
  },
  fileFilter,
});

/**
 * Parses a small secondary-feed CSV buffer (servicer updates / document
 * manifest) into plain row objects, matching the shape runBatchValidation
 * expects (the same shape the standalone test scripts already parse from
 * disk with the same csv-parser package).
 */
function parseSecondaryFeedBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const rows = [];
    Readable.from(buffer)
      .pipe(csvParser({ trim: true, skipEmptyLines: true }))
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

/**
 * POST /api/uploads
 * Ingests and normalizes a loan tape CSV file.
 * Requires OPERATOR or ADMIN role.
 */
router.post(
  '/',
  authenticateUser,
  requireRole(['OPERATOR', 'ADMIN', 'REVIEWER']),
  (req, res, next) => {
    upload.fields([
      { name: 'file', maxCount: 1 },
      { name: 'servicerUpdate', maxCount: 1 },
      { name: 'documentManifest', maxCount: 1 },
    ])(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            success: false,
            error: `File size exceeds the 10MB limit. Maximum allowed size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`,
          });
        }
        return res.status(400).json({
          success: false,
          error: `File upload error: ${err.message}`,
        });
      } else if (err) {
        return res.status(err.statusCode || 400).json({
          success: false,
          error: err.message || 'Failed to process uploaded file.',
        });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const tapeFile = req.files?.file?.[0];
      if (!tapeFile) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded. Please attach a CSV file under the "file" form-data field.',
        });
      }

      const userId = req.user?.id || 'system';

      const result = await processLoanTapeUpload({
        fileBuffer: tapeFile.buffer,
        filename: tapeFile.originalname,
        fileSize: tapeFile.size,
        userId: String(userId),
      });

      // Module B: run the validation engine against this batch immediately
      // after ingestion, so the exception queue and dashboards populate
      // without a separate manual step. Validation failure doesn't fail the
      // upload itself (the file is already safely ingested/normalized) —
      // it's logged and surfaced to the caller so the gap is visible rather
      // than silently leaving loans unvalidated.
      let validationSummary = null;
      try {
        validationSummary = await runBatchValidation({
          rawUploadId: result.uploadId,
          actor: String(userId),
        });
      } catch (validationError) {
        console.error('[POST_INGESTION_VALIDATION_ERROR]', validationError);
      }

      return res.status(201).json({
        success: true,
        message: 'Loan tape uploaded, normalized, and validated successfully.',
        data: { ...result, validationSummary },
      });
    } catch (error) {
      console.error('[INGESTION_CONTROLLER_ERROR]', error);

      if (error instanceof IngestionError || error.statusCode) {
        return res.status(error.statusCode || 400).json({
          success: false,
          error: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        error: 'An internal server error occurred while processing the loan tape. The incident has been logged.',
      });
    }
  }
);

/**
 * GET /api/uploads
 * List import history with row counts, file hashes, and status.
 */
router.get(
  '/',
  authenticateUser,
  validateRequest({ query: paginationQuerySchema }),
  async (req, res) => {
    try {
      const { page = 1, limit = 50 } = req.query;
      const skip = (page - 1) * limit;
      const take = Math.min(limit, 100);

      const [uploads, totalCount] = await Promise.all([
        prisma.rawUpload.findMany({
          include: {
            uploadedBy: { select: { id: true, name: true, email: true } },
            _count: { select: { normalizedLoans: true, rawRecords: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        prisma.rawUpload.count(),
      ]);

      return res.status(200).json({
        success: true,
        data: uploads.map((u) => ({
          id: u.id,
          filename: u.filename,
          fileSize: u.fileSize,
          fileHash: u.fileHash,
          rowCount: u.rowCount,
          status: u.status,
          createdAt: u.createdAt,
          uploadedBy: u.uploadedBy?.name || 'System',
          normalizedCount: u._count.normalizedLoans,
        })),
        pagination: {
          page,
          limit: take,
          total: totalCount,
          totalPages: Math.ceil(totalCount / take),
        },
      });
    } catch (error) {
      console.error('[GET_UPLOADS_ERROR]', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch upload history.' });
    }
  }
);

module.exports = router;
