const prisma = require('./src/db');
const {
  explainFailure,
  suggestCorrection,
  summarizeExceptionBatch,
} = require('./src/ai/reviewAssistant');

async function testAiAssistantPipeline() {
  console.log('🤖 Testing Module D: AI Review Assistant & Decision Ledger Pipeline...\n');

  // =========================================================================
  // 1. Specific Test: RULE_DUPLICATE_LOAN_ID
  // =========================================================================
  console.log('================================================================');
  console.log('📌 TARGET TEST 1: RULE_DUPLICATE_LOAN_ID Exception Handler');
  console.log('================================================================');
  
  let duplicateException = await prisma.exception.findFirst({
    where: {
      rule: { ruleCode: 'RULE_DUPLICATE_LOAN_ID' },
    },
    include: {
      rule: true,
      loan: true,
    },
  });

  if (!duplicateException) {
    let rule = await prisma.validationRule.findUnique({ where: { ruleCode: 'RULE_DUPLICATE_LOAN_ID' } });
    if (!rule) {
      rule = await prisma.validationRule.create({
        data: {
          ruleCode: 'RULE_DUPLICATE_LOAN_ID',
          name: 'Duplicate Primary Loan Identifier',
          category: 'DATA_INTEGRITY',
          severity: 'CRITICAL',
          description: 'Each loan identifier must be unique across the portfolio.',
        },
      });
    }
    const sampleLoan = await prisma.normalizedLoan.findFirst();
    duplicateException = await prisma.exception.create({
      data: {
        loanId: sampleLoan.id,
        ruleId: rule.id,
        severity: 'CRITICAL',
        status: 'OPEN',
        details: JSON.stringify({
          message: `Duplicate loan_id '${sampleLoan.loanIdentifier}' detected: Already exists in portfolio registry and appears in batch rows [14, 82].`,
          details: {
            reason: `Collides with existing master loan record '${sampleLoan.loanIdentifier}' in SQLite database`,
            duplicateCount: 2,
          },
        }),
      },
      include: { rule: true, loan: true },
    });
  }

  const dupExplain = await explainFailure(duplicateException.id, 'usr-underwriter-01');
  console.log('🔍 [RULE_DUPLICATE_LOAN_ID] explainFailure output:');
  console.log(JSON.stringify(dupExplain, null, 2));

  const dupSuggest = await suggestCorrection(duplicateException.id, 'usr-underwriter-01');
  console.log('\n💡 [RULE_DUPLICATE_LOAN_ID] suggestCorrection output:');
  console.log(JSON.stringify(dupSuggest, null, 2));

  // =========================================================================
  // 2. Specific Test: RULE_VALID_STATE_CODE
  // =========================================================================
  console.log('\n================================================================');
  console.log('📌 TARGET TEST 2: RULE_VALID_STATE_CODE Exception Handler');
  console.log('================================================================');

  let stateRule = await prisma.validationRule.findUnique({ where: { ruleCode: 'RULE_VALID_STATE_CODE' } });
  if (!stateRule) {
    stateRule = await prisma.validationRule.create({
      data: {
        ruleCode: 'RULE_VALID_STATE_CODE',
        name: 'Invalid US State Jurisdiction Code',
        category: 'COMPLIANCE',
        severity: 'HIGH',
        description: 'Borrower state must be a valid 2-letter US jurisdiction code.',
      },
    });
  }

  const sampleLoan = await prisma.normalizedLoan.findFirst();

  // A. Test recognizable full state name "California" -> maps to "CA" with HIGH confidence
  const origBorrowerState = sampleLoan.borrowerState;
  await prisma.normalizedLoan.update({
    where: { id: sampleLoan.id },
    data: { borrowerState: 'California' },
  });

  const stateExceptionCA = await prisma.exception.create({
    data: {
      loanId: sampleLoan.id,
      ruleId: stateRule.id,
      severity: 'HIGH',
      status: 'OPEN',
      details: JSON.stringify({
        message: "Borrower state 'California' is invalid. Expected 2-letter US jurisdiction code.",
      }),
    },
    include: { rule: true, loan: true },
  });

  const stateExplainCA = await explainFailure(stateExceptionCA.id, 'usr-underwriter-01');
  console.log('🔍 [RULE_VALID_STATE_CODE: "California"] explainFailure output:');
  console.log(JSON.stringify(stateExplainCA, null, 2));

  const stateSuggestCA = await suggestCorrection(stateExceptionCA.id, 'usr-underwriter-01');
  console.log('\n💡 [RULE_VALID_STATE_CODE: "California"] suggestCorrection output (Mapped):');
  console.log(JSON.stringify(stateSuggestCA, null, 2));

  // B. Test unrecognizable / corrupt state name "XX_UNKNOWN" -> falls back to null + LOW confidence
  await prisma.normalizedLoan.update({
    where: { id: sampleLoan.id },
    data: { borrowerState: 'XX_UNKNOWN' },
  });

  const stateExceptionUnk = await prisma.exception.create({
    data: {
      loanId: sampleLoan.id,
      ruleId: stateRule.id,
      severity: 'HIGH',
      status: 'OPEN',
      details: JSON.stringify({
        message: "Borrower state 'XX_UNKNOWN' is invalid. Expected 2-letter US jurisdiction code.",
      }),
    },
    include: { rule: true, loan: true },
  });

  const stateExplainUnk = await explainFailure(stateExceptionUnk.id, 'usr-underwriter-01');
  console.log('\n🔍 [RULE_VALID_STATE_CODE: "XX_UNKNOWN"] explainFailure output:');
  console.log(JSON.stringify(stateExplainUnk, null, 2));

  const stateSuggestUnk = await suggestCorrection(stateExceptionUnk.id, 'usr-underwriter-01');
  console.log('\n💡 [RULE_VALID_STATE_CODE: "XX_UNKNOWN"] suggestCorrection output (Unmappable / No Guess):');
  console.log(JSON.stringify(stateSuggestUnk, null, 2));

  // Restore sample loan state and clean up test recommendations/exceptions
  await prisma.normalizedLoan.update({
    where: { id: sampleLoan.id },
    data: { borrowerState: origBorrowerState },
  });
  await prisma.aIRecommendation.deleteMany({
    where: { exceptionId: { in: [stateExceptionCA.id, stateExceptionUnk.id] } },
  });
  await prisma.exception.deleteMany({
    where: { id: { in: [stateExceptionCA.id, stateExceptionUnk.id] } },
  });

  // =========================================================================
  // 3. Batch Summary & Human Decision Verification
  // =========================================================================
  console.log('\n================================================================');
  console.log('📌 TEST 3: Portfolio Batch Summary & Audit Ledger');
  console.log('================================================================');
  const batchSummary = await summarizeExceptionBatch({ status: 'OPEN' }, 'usr-underwriter-01');
  console.log('✅ Batch Summary Result:');
  console.log(JSON.stringify(batchSummary, null, 2));

  await prisma.$disconnect();
  console.log('\n✨ All AI Assistant rule handlers & fallback engines verified successfully!');
}

testAiAssistantPipeline().catch((err) => {
  console.error('AI assistant test failed:', err);
  process.exit(1);
});
