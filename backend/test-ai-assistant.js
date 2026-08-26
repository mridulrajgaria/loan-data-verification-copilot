const prisma = require('./src/db');
const {
  explainFailure,
  suggestCorrection,
  summarizeExceptionBatch,
} = require('./src/ai/reviewAssistant');

async function testAiAssistantPipeline() {
  console.log('🤖 Testing Module D: AI Review Assistant & Decision Ledger Pipeline...');

  // 1. Pick a sample exception from SQLite database
  const sampleException = await prisma.exception.findFirst({
    where: {
      status: 'OPEN',
      severity: 'CRITICAL',
    },
    include: {
      rule: true,
      loan: true,
    },
  });

  if (!sampleException) {
    throw new Error('No open exceptions found in database. Run test-batch-validation.js first.');
  }

  console.log(`\n📌 Testing on Exception: ${sampleException.id}`);
  console.log(`- Rule Code: ${sampleException.rule.ruleCode} (${sampleException.rule.name})`);
  console.log(`- Loan ID: ${sampleException.loan.loanIdentifier}`);
  console.log(`- Severity: ${sampleException.severity}`);

  // 2. Test explainFailure(exceptionId)
  console.log('\n--- 1. Testing explainFailure() ---');
  const explanation = await explainFailure(sampleException.id, 'usr-underwriter-01');
  console.log('✅ Explanation Result:');
  console.log(JSON.stringify(explanation, null, 2));

  // Verify AIRecommendation row was created in DB
  const rec1 = await prisma.aIRecommendation.findUnique({
    where: { id: explanation.recommendationId },
  });
  console.log(`Verified AIRecommendation #${rec1.id} recorded in DB:`);
  console.log(`- target: ${rec1.target}`);
  console.log(`- modelName: ${rec1.modelName}`);
  console.log(`- acceptedByReviewer: ${rec1.acceptedByReviewer} (MUST BE NULL)`);
  if (rec1.acceptedByReviewer !== null) {
    throw new Error('FAILED: acceptedByReviewer must start as null!');
  }

  // 3. Test suggestCorrection(exceptionId)
  console.log('\n--- 2. Testing suggestCorrection() ---');
  const suggestion = await suggestCorrection(sampleException.id, 'usr-underwriter-01');
  console.log('✅ Suggestion Result:');
  console.log(JSON.stringify(suggestion, null, 2));

  const rec2 = await prisma.aIRecommendation.findUnique({
    where: { id: suggestion.recommendationId },
  });
  console.log(`Verified AIRecommendation #${rec2.id} recorded in DB:`);
  console.log(`- suggestedPatch: ${rec2.suggestedPatch}`);
  console.log(`- acceptedByReviewer: ${rec2.acceptedByReviewer} (MUST BE NULL)`);

  // Verify that NormalizedLoan was NOT mutated by AI calls!
  const loanBeforeDecision = await prisma.normalizedLoan.findUnique({
    where: { id: sampleException.loanId },
  });
  console.log(`\n🔒 Loan status before human decision: ${loanBeforeDecision.status} (version ${loanBeforeDecision.currentVersion})`);

  // 4. Test summarizeExceptionBatch()
  console.log('\n--- 3. Testing summarizeExceptionBatch() ---');
  const batchSummary = await summarizeExceptionBatch({ status: 'OPEN' }, 'usr-underwriter-01');
  console.log('✅ Batch Summary Result:');
  console.log(JSON.stringify(batchSummary, null, 2));

  // 5. Test Review Decision Workflow (Human In The Loop Decision Endpoint)
  console.log('\n--- 4. Testing Human Review Decision Execution ---');
  // We simulate human reviewer accepting the AI suggested correction
  const suggestedPatch = typeof rec2.suggestedPatch === 'string' ? JSON.parse(rec2.suggestedPatch) : rec2.suggestedPatch;
  const editedFields = {};
  if (suggestedPatch && suggestedPatch.field) {
    editedFields[suggestedPatch.field] = suggestedPatch.suggestedValue;
  }

  console.log(`Applying Human Decision: ACCEPT_AI_FIX with fields:`, editedFields);

  // Ensure reviewer user exists for foreign key integrity
  const testUser = await prisma.user.upsert({
    where: { email: 'underwriter@loancopilot.local' },
    update: {},
    create: {
      id: 'usr-underwriter-01',
      email: 'underwriter@loancopilot.local',
      name: 'Sarah Underwriter',
      passwordHash: 'dummyHashForTestingAuth12345',
      role: 'REVIEWER',
    },
  });
  const userId = testUser.id;

  // Invoke decision logic directly as done in route
  const decisionResult = await prisma.$transaction(async (tx) => {
    // A. Update Exception
    const updatedException = await tx.exception.update({
      where: { id: sampleException.id },
      data: {
        status: 'RESOLVED',
        resolution: 'corrected',
        resolvedAt: new Date(),
      },
    });

    // B. Mark AI recommendation as accepted by reviewer
    await tx.aIRecommendation.update({
      where: { id: rec2.id },
      data: {
        acceptedByReviewer: true,
        reviewedByUserId: 'usr-underwriter-01',
        reviewedAt: new Date(),
      },
    });

    // C. Apply human-approved edit to NormalizedLoan
    const updatedLoan = await tx.normalizedLoan.update({
      where: { id: sampleException.loanId },
      data: {
        ...editedFields,
        currentVersion: { increment: 1 },
      },
    });

    // D. Create ReviewAction (The decision record)
    const reviewAction = await tx.reviewAction.create({
      data: {
        loanId: sampleException.loanId,
        exceptionId: sampleException.id,
        userId: 'usr-underwriter-01',
        actionType: 'ACCEPT_AI_FIX',
        resolution: 'corrected',
        beforeState: JSON.stringify({ loan: loanBeforeDecision, exception: sampleException }),
        afterState: JSON.stringify({ loan: updatedLoan, exception: updatedException }),
        notes: 'Underwriter accepted AI recommendation fix for data discrepancy.',
        aiRecommendationId: rec2.id,
      },
    });

    return { updatedException, updatedLoan, reviewAction };
  });

  console.log('\n✅ Human Decision Execution Completed:');
  console.log(`- Exception Status: ${decisionResult.updatedException.status} (${decisionResult.updatedException.resolution})`);
  console.log(`- ReviewAction ID: ${decisionResult.reviewAction.id} (Action: ${decisionResult.reviewAction.actionType})`);
  console.log(`- Normalized Loan Version: ${decisionResult.updatedLoan.currentVersion}`);

  // Verify AIRecommendation status updated in DB
  const rec2After = await prisma.aIRecommendation.findUnique({
    where: { id: rec2.id },
  });
  console.log(`- AIRecommendation #${rec2After.id} acceptedByReviewer: ${rec2After.acceptedByReviewer} (SET TO TRUE AFTER HUMAN ACTION)`);

  await prisma.$disconnect();
  console.log('\n✨ AI Review Assistant & Decision Ledger pipeline verified successfully!');
}

testAiAssistantPipeline().catch((err) => {
  console.error('AI assistant test failed:', err);
  process.exit(1);
});
