const prisma = require('../db');

/**
 * Log a state-changing event to the immutable audit log table.
 *
 * @param {Object} params
 * @param {string} params.actor - User ID or "system"
 * @param {string} params.actionType - State transition event (UPLOAD, IMPORT, VALIDATE, etc.)
 * @param {string} params.entityType - Target model (RawUpload, NormalizedLoan, etc.)
 * @param {string} params.entityId - Target record ID
 * @param {Object|string} params.details - Structured metadata describing the action
 * @param {Object} [tx] - Optional Prisma interactive transaction client
 * @returns {Promise<Object>} The created AuditLog record
 */
async function logAudit({ actor = 'system', actionType, entityType, entityId, details }, tx = null) {
  const db = tx || prisma;
  const serializedDetails = typeof details === 'string' ? details : JSON.stringify(details || {});

  try {
    return await db.auditLog.create({
      data: {
        actor: String(actor || 'system'),
        actionType: String(actionType),
        entityType: String(entityType),
        entityId: String(entityId),
        details: serializedDetails,
      },
    });
  } catch (error) {
    // Audit log failures must be reported to server console but shouldn't crash ungracefully
    console.error(`[AUDIT_LOG_ERROR] Failed to write audit log for ${actionType} on ${entityType}:${entityId}`, error);
    throw error;
  }
}

module.exports = {
  logAudit,
};
