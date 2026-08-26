/**
 * Role-Based Access Control (RBAC) Middleware
 *
 * Enforces intentional role boundaries across endpoints:
 * - OPERATOR: Ingestion & upload management
 * - REVIEWER: Exception adjudication, AI assistance, and decision execution
 * - AUDITOR / CONSUMER: Verified records, hash verification, and audit trails
 * - ADMIN: Unrestricted access across all domains
 */

function authenticateUser(req, res, next) {
  // Extract user identity and role from headers or session
  const userId = req.headers['x-user-id'] || 'system';
  const role = (req.headers['x-user-role'] || 'REVIEWER').toUpperCase(); // default role for mock testing

  req.user = {
    id: String(userId),
    role: String(role),
  };

  next();
}

/**
 * Middleware factory requiring one of the specified roles.
 *
 * @param {Array<string>} allowedRoles - List of permitted roles (e.g. ['REVIEWER', 'ADMIN'])
 */
function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    const userRole = req.user?.role || 'REVIEWER';

    if (userRole === 'ADMIN' || allowedRoles.includes(userRole)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: `Forbidden: Role '${userRole}' is not authorized for this operation. Required role(s): [${allowedRoles.join(', ')}].`,
    });
  };
}

module.exports = {
  authenticateUser,
  requireRole,
};
