const crypto = require('crypto');
const { Readable } = require('stream');
const csvParser = require('csv-parser');
const prisma = require('../db');
const { logAudit } = require('./auditService');
const { normalizeLoanRecord } = require('./normalizationService');

const MAX_ROW_LIMIT = 20000;

/**
 * Custom error class for ingestion business and security constraints.
 */
class IngestionError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Parses raw CSV buffer using streaming parser with quoting and multi-line safety.
 * Enforces strict row limit security boundary (20,000 max rows).
 *
 * @param {Buffer} buffer - Raw file buffer
 * @returns {Promise<Array<{ rowNumber: number, data: Object }>>}
 */
async function parseCsvStream(buffer) {
  return new Promise((resolve, reject) => {
    const rows = [];
    let rowCount = 0;
    let limitExceeded = false;

    const stream = Readable.from(buffer)
      .pipe(
        csvParser({
          trim: true,
          skipEmptyLines: true,
        })
      )
      .on('data', (row) => {
        rowCount++;
        if (rowCount > MAX_ROW_LIMIT) {
          limitExceeded = true;
          stream.destroy(
            new IngestionError(
              `Payload Too Large: File contains more than ${MAX_ROW_LIMIT} rows. Upload rejected to prevent resource exhaustion.`,
              413
            )
          );
          return;
        }
        rows.push({
          rowNumber: rowCount,
          data: row,
        });
      })
      .on('end', () => {
        if (!limitExceeded) {
          resolve(rows);
        }
      })
      .on('error', (err) => {
        reject(err);
      });
  });
}

/**
 * Executes the complete ingestion pipeline:
 * 1. Raw Hash & RawUpload record creation
 * 2. Upload Audit Log
 * 3. Raw Parsed Rows -> RawLoanRecord insertion (unchanged provenance layer)
 * 4. Normalization -> NormalizedLoan insertion (linked by FK)
 * 5. Aggregation of failed rows & metrics
 * 6. Import Completion Audit Log
 *
 * @param {Object} params
 * @param {Buffer} params.fileBuffer - Raw in-memory buffer
 * @param {string} params.filename - Original uploaded filename
 * @param {number} params.fileSize - File size in bytes
 * @param {string} [params.userId] - Uploader user ID
 * @returns {Promise<Object>} Ingestion summary metrics and failed row details
 */
async function processLoanTapeUpload({ fileBuffer, filename, fileSize, userId = 'system' }) {
  if (!fileBuffer || fileBuffer.length === 0) {
    throw new IngestionError('Uploaded CSV file is empty.', 400);
  }

  // 1. Calculate cryptographic SHA-256 digest of original raw file
  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  // 2. Stream parse CSV safely with row count check
  const parsedRows = await parseCsvStream(fileBuffer);
  const totalRows = parsedRows.length;

  if (totalRows === 0) {
    throw new IngestionError('CSV contains headers but no valid data rows.', 400);
  }

  // Resolve user foreign key if exists
  let validUserId = null;
  if (userId && userId !== 'system') {
    const userExists = await prisma.user.findUnique({ where: { id: userId } });
    if (userExists) {
      validUserId = userExists.id;
    }
  }

  // 3. Create initial RawUpload row
  const rawUpload = await prisma.rawUpload.create({
    data: {
      filename,
      fileSize,
      rowCount: totalRows,
      fileHash,
      status: 'PROCESSING',
      uploadedById: validUserId,
    },
  });

  // 4. Audit Log 1: Upload Event
  await logAudit({
    actor: userId,
    actionType: 'UPLOAD',
    entityType: 'RawUpload',
    entityId: rawUpload.id,
    details: {
      filename,
      fileSize,
      fileHash,
      totalRows,
      stage: 'FILE_RECEIVED',
    },
  });

  try {
    // 5. Transform and persist raw rows and normalized entities inside a database transaction
    const failedImportRows = [];
    const normalizedLoanInputs = [];
    const rawRecordsToInsert = [];

    for (const item of parsedRows) {
      const { rowNumber, data: rawRow } = item;
      const rawContentStr = JSON.stringify(rawRow);

      // Run structural normalization
      const normResult = normalizeLoanRecord(rawRow, rowNumber);

      if (!normResult.success) {
        failedImportRows.push({
          rowNumber,
          rawData: rawRow,
          reason: normResult.error || 'Structural parsing error',
        });
        // Still persist raw record for complete audit lineage
        rawRecordsToInsert.push({
          rawUploadId: rawUpload.id,
          rowNumber,
          rawContent: rawContentStr,
          normalizedData: null,
        });
      } else {
        rawRecordsToInsert.push({
          rawUploadId: rawUpload.id,
          rowNumber,
          rawContent: rawContentStr,
          normalizedData: normResult.data,
        });
      }
    }

    // Execute chunked atomic writes to SQLite to maintain speed and avoid transaction timeouts
    let successfullyNormalizedCount = 0;

    // Insert RawLoanRecords and NormalizedLoans in sequence
    // We use batch chunks of 200 to stay well within SQLite variable limits
    const CHUNK_SIZE = 200;
    for (let i = 0; i < rawRecordsToInsert.length; i += CHUNK_SIZE) {
      const chunk = rawRecordsToInsert.slice(i, i + CHUNK_SIZE);

      await prisma.$transaction(async (tx) => {
        for (const record of chunk) {
          const createdRaw = await tx.rawLoanRecord.create({
            data: {
              rawUploadId: record.rawUploadId,
              rowNumber: record.rowNumber,
              rawContent: record.rawContent,
            },
          });

          if (record.normalizedData) {
            await tx.normalizedLoan.create({
              data: {
                rawLoanRecordId: createdRaw.id,
                rawUploadId: record.rawUploadId,
                status: 'VALID',
                ...record.normalizedData,
              },
            });
            successfullyNormalizedCount++;
          }
        }
      });
    }

    // 6. Update RawUpload final status
    const finalStatus = failedImportRows.length === 0 ? 'COMPLETED' : 'COMPLETED_WITH_ERRORS';
    await prisma.rawUpload.update({
      where: { id: rawUpload.id },
      data: {
        status: finalStatus,
        rowCount: totalRows,
      },
    });

    const failedCount = failedImportRows.length;
    const successRate = ((successfullyNormalizedCount / totalRows) * 100).toFixed(2);
    const failedRate = ((failedCount / totalRows) * 100).toFixed(2);

    // 7. Audit Log 2: Import Completion Event
    await logAudit({
      actor: userId,
      actionType: 'IMPORT',
      entityType: 'RawUpload',
      entityId: rawUpload.id,
      details: {
        totalRows,
        successfullyNormalized: successfullyNormalizedCount,
        failedToParse: failedCount,
        successRatePercentage: `${successRate}%`,
        failedRatePercentage: `${failedRate}%`,
        status: finalStatus,
      },
    });

    return {
      uploadId: rawUpload.id,
      filename,
      fileHash,
      totalRows,
      successfullyNormalized: successfullyNormalizedCount,
      failedToParse: failedCount,
      successRatePercentage: `${successRate}%`,
      failedRatePercentage: `${failedRate}%`,
      status: finalStatus,
      failedImportRows,
    };
  } catch (err) {
    await prisma.rawUpload.update({
      where: { id: rawUpload.id },
      data: { status: 'FAILED' },
    });
    throw err;
  }
}

module.exports = {
  processLoanTapeUpload,
  parseCsvStream,
  IngestionError,
};
