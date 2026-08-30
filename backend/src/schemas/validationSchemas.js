/**
 * Centralized Zod Validation Schemas
 * Enforces strict input typing, bounds, length limits, and enum constraints across all endpoints.
 */

const { z } = require('zod');

// Common Pagination & Sorting Query Schema
const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// Exception Query Filters Schema
const exceptionQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED']).optional(),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'WARNING', 'INFO']).optional(),
  ruleCode: z.string().trim().max(100).optional(),
  loanId: z.string().trim().max(100).optional(),
  rawUploadId: z.string().trim().max(100).optional(),
});

// Loan Query Filters Schema
const loanQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['UNVALIDATED', 'VALID', 'FLAGGED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'VERIFIED']).optional(),
  loanIdentifier: z.string().trim().max(100).optional(),
  borrowerId: z.string().trim().max(100).optional(),
  uploadId: z.string().trim().max(100).optional(),
});

// Exception Decision Body Schema
const decisionBodySchema = z.object({
  decision: z.enum(['approved', 'rejected', 'corrected']),
  notes: z.string().trim().min(3, 'Underwriter justification must be at least 3 characters.').max(2000),
  editedFields: z.record(z.string().max(100), z.any()).nullable().optional(),
  acceptedAiRecommendationId: z.string().trim().max(100).nullable().optional(),
});

// ID Parameter Schema
const idParamSchema = z.object({
  id: z.string().trim().min(1).max(100),
});

// Batch AI Summary Body Schema
const batchSummaryBodySchema = z.object({
  status: z.enum(['OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED']).default('OPEN'),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'WARNING', 'INFO']).optional(),
  ruleCode: z.string().trim().max(100).optional(),
});

// Export Query Schema
const exportQuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  target: z.enum(['verified', 'audit']).default('verified'),
});

// Verify Loan Body Schema
const verifyLoanBodySchema = z.object({
  reviewerNote: z.string().trim().max(2000).optional(),
  aiRecommendationId: z.string().trim().max(100).nullable().optional(),
});

// Standalone Comment Body Schema
const commentBodySchema = z.object({
  notes: z.string().trim().min(3, 'Reviewer comment must be at least 3 characters.').max(2000),
});

// Generate Rule from Natural Language Body Schema
const generateRuleBodySchema = z.object({
  description: z.string().trim().min(3, 'Rule description must be at least 3 characters.').max(1000),
});

module.exports = {
  paginationQuerySchema,
  exceptionQuerySchema,
  loanQuerySchema,
  decisionBodySchema,
  idParamSchema,
  batchSummaryBodySchema,
  exportQuerySchema,
  verifyLoanBodySchema,
  commentBodySchema,
  generateRuleBodySchema,
};

