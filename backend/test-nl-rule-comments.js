/**
 * Integration Test for new features:
 * 1. Standalone exception comments (POST /api/exceptions/:id/comment)
 * 2. Natural language to validation rule config translator (POST /api/exceptions/ai-generate-rule)
 */

const assert = require('assert');

async function testNewFeatures() {
  console.log('🧪 Running integration tests for Standalone Comments & NL Rule Generator...');

  const baseUrl = 'http://localhost:4000/api';
  const headers = {
    'Content-Type': 'application/json',
    'x-user-id': 'usr-reviewer-01',
    'x-user-role': 'REVIEWER'
  };

  // 1. Fetch an active exception to comment on
  const listRes = await fetch(`${baseUrl}/exceptions?status=OPEN&limit=1`, { headers });
  const listData = await listRes.json();
  
  if (!listData.success || listData.data.items.length === 0) {
    console.error('❌ Test failed: No open exceptions available in DB to test comments.');
    process.exit(1);
  }

  const testException = listData.data.items[0];
  const exceptionId = testException.id;
  console.log(`📌 Using exception ID ${exceptionId} (Rule: ${testException.rule?.ruleCode}) for testing.`);

  // 2. Test Standalone Review Comment Endpoint
  console.log('\n--- 1. Testing Standalone Exception Comments ---');
  const commentText = `Standalone review verification comment: ${new Date().toISOString()}`;
  
  const commentRes = await fetch(`${baseUrl}/exceptions/${exceptionId}/comment`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ notes: commentText })
  });

  const commentData = await commentRes.json();
  assert.strictEqual(commentRes.status, 201, `Expected status 201, got ${commentRes.status}`);
  assert.strictEqual(commentData.success, true);
  assert.strictEqual(commentData.data.actionType, 'COMMENT_ADDED');
  assert.strictEqual(commentData.data.notes, commentText);
  console.log('✅ Comments endpoint successfully saved COMMENT_ADDED ReviewAction.');

  // Fetch detail view and verify comments feed contains it
  const detailRes = await fetch(`${baseUrl}/exceptions/${exceptionId}`, { headers });
  const detailData = await detailRes.json();
  const reviewActions = detailData.data?.reviewActions || [];
  const foundComment = reviewActions.some(action => action.notes === commentText && action.actionType === 'COMMENT_ADDED');
  assert.strictEqual(foundComment, true, 'Comment should be returned in exception details reviewActions list.');
  console.log('✅ Comments feed contains the added comment.');

  // 3. Test Natural Language Validation Rule Config Generator
  console.log('\n--- 2. Testing Natural Language Rule Generator ---');
  const nlRequest = 'Interest rate should not be higher than 12.5%';
  
  const ruleRes = await fetch(`${baseUrl}/exceptions/ai-generate-rule`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ description: nlRequest })
  });

  const ruleData = await ruleRes.json();
  assert.strictEqual(ruleRes.status, 200, `Expected status 200, got ${ruleRes.status}`);
  assert.strictEqual(ruleData.success, true);
  
  const generatedRule = ruleData.data.rule;
  assert.ok(generatedRule.ruleCode.startsWith('RULE_INTEREST_RATE_LIMIT_'), 'Expected ruleCode to start with RULE_INTEREST_RATE_LIMIT_');
  assert.strictEqual(generatedRule.ruleType, 'RANGE');
  assert.strictEqual(generatedRule.category, 'UNDERWRITING');
  assert.deepStrictEqual(generatedRule.parameters, { maxInterestRate: 12.5 });
  console.log('✅ AI rule translator translated request into structured rule JSON config successfully:');
  console.log(JSON.stringify(generatedRule, null, 2));

  console.log('\n✨ Standalone Comments & NL Rule Generator integration tests PASSED successfully!');
}

testNewFeatures().catch(err => {
  console.error('❌ Integration test failed with error:', err);
  process.exit(1);
});
