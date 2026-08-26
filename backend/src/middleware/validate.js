/**
 * Zod Validation Middleware Factory
 * Validates request bodies, queries, and params against Zod schemas.
 */

function validateRequest({ body, query, params }) {
  return (req, res, next) => {
    try {
      if (body) {
        req.body = body.parse(req.body);
      }
      if (query) {
        req.query = query.parse(req.query);
      }
      if (params) {
        req.params = params.parse(req.params);
      }
      next();
    } catch (err) {
      if (err.errors) {
        return res.status(400).json({
          success: false,
          error: 'Input validation error',
          details: err.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      return res.status(400).json({
        success: false,
        error: err.message || 'Invalid request input.',
      });
    }
  };
}

module.exports = {
  validateRequest,
};
