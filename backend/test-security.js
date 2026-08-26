const assert = require('assert');
const { z } = require('zod');
const {
  paginationQuerySchema,
  exceptionQuerySchema,
  decisionBodySchema,
} = require('./src/schemas/validationSchemas');
const { requireRole } = require('./src/middleware/auth');

async function runSecurityAudit() {
  console.log('🛡️  Running Security Pass Verification Tests...');

  // 1. Test Zod Pagination Schema
  console.log('\n--- 1. Testing Zod Input Bounds & Pagination ---');
  const validQuery = paginationQuerySchema.parse({ page: '2', limit: '25' });
  assert.strictEqual(validQuery.page, 2);
  assert.strictEqual(validQuery.limit, 25);
  console.log('✅ Coercion and valid bounds passed.');

  // Test Out-of-bounds limit rejection (limit > 100)
  assert.throws(() => {
    paginationQuerySchema.parse({ page: 1, limit: 500 });
  }, /Number must be less than or equal to 100/);
  console.log('✅ Unbounded query protection: Rejects limit > 100 with validation error.');

  // 2. Test Zod Enum Validation on Exceptions
  console.log('\n--- 2. Testing Zod Enum Validation ---');
  assert.throws(() => {
    exceptionQuerySchema.parse({ status: 'HACKED_STATUS_ENUM' });
  }, /Invalid enum value/);
  console.log('✅ Invalid query filter rejected with Zod schema validation.');

  // 3. Test Underwriter Decision Body Schema
  console.log('\n--- 3. Testing Review Decision Schema Validation ---');
  // Rejects empty notes
  assert.throws(() => {
    decisionBodySchema.parse({ decision: 'approved', notes: '  ' });
  }, /Underwriter justification must be at least 3 characters/);
  console.log('✅ Enforced required underwriter note with character length validation.');

  // Rejects invalid decision enum
  assert.throws(() => {
    decisionBodySchema.parse({ decision: 'bypassed', notes: 'Approved by override' });
  }, /Invalid enum value/);
  console.log('✅ Enforced strict decision enumeration ["approved", "rejected", "corrected"].');

  // 4. Test RBAC Middleware Permission Guard
  console.log('\n--- 4. Testing RBAC Role Enforcement ---');
  const reviewerOnlyMiddleware = requireRole(['REVIEWER', 'ADMIN']);

  // Case A: User with role "AUDITOR" attempting decision execution
  const reqAuditor = { user: { id: 'usr-01', role: 'AUDITOR' } };
  let forbiddenCalled = false;
  const resAuditor = {
    status: (code) => {
      if (code === 403) forbiddenCalled = true;
      return { json: () => {} };
    },
  };
  reviewerOnlyMiddleware(reqAuditor, resAuditor, () => {});
  assert.strictEqual(forbiddenCalled, true, 'AUDITOR must receive 403 Forbidden on reviewer-only endpoints');
  console.log('✅ RBAC blocked unauthorized AUDITOR role from hitting decision endpoint with HTTP 403.');

  // Case B: User with role "REVIEWER"
  let nextCalled = false;
  const reqReviewer = { user: { id: 'usr-02', role: 'REVIEWER' } };
  reviewerOnlyMiddleware(reqReviewer, {}, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true, 'REVIEWER must be authorized');
  console.log('✅ RBAC permitted authorized REVIEWER role.');

  console.log('\n✨ All Security Audit Verifications Passed!');
}

runSecurityAudit().catch((err) => {
  console.error('Security audit test failed:', err);
  process.exit(1);
});
