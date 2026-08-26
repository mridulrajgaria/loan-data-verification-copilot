const test = require('node:test');
const assert = require('node:assert/strict');
const { validateLoan, loadConfig } = require('./engine');

// Standard clean baseline loan
function createCleanLoan(overrides = {}) {
  return {
    id: 'test-loan-001',
    loanIdentifier: 'LN-100001',
    borrowerId: 'BW-50001',
    borrowerName: 'John Doe',
    borrowerEmail: 'jdoe@example.com',
    loanType: 'CONVENTIONAL',
    originationDate: new Date('2024-01-15T00:00:00.000Z'),
    maturityDate: new Date('2054-01-15T00:00:00.000Z'),
    originalPrincipal: 350000.0,
    currentBalance: 342000.0,
    interestRate: 6.25,
    termMonths: 360,
    borrowerState: 'CA',
    loanPurpose: 'PURCHASE',
    creditGrade: 'A',
    paymentStatus: 'CURRENT',
    daysPastDue: 0,
    documentStatus: 'VERIFIED',
    lastUpdatedAt: new Date('2026-01-10T00:00:00.000Z'),
    rawUnparsedValues: null,
    ...overrides,
  };
}

test('Validation Engine: Clean record passes all rules', () => {
  const loan = createCleanLoan();
  const results = validateLoan(loan);

  const failing = results.filter((r) => !r.passed);
  assert.equal(failing.length, 0, `Expected 0 failures on clean loan, got: ${JSON.stringify(failing)}`);
  assert.equal(results.length, 15);
});

test('RULE_REQUIRED_FIELDS: Flags missing core attributes', () => {
  const loan = createCleanLoan({
    loanIdentifier: '',
    originalPrincipal: null,
    interestRate: null,
  });
  const results = validateLoan(loan);
  const reqRule = results.find((r) => r.rule_id === 'RULE_REQUIRED_FIELDS');

  assert.equal(reqRule.passed, false);
  assert.match(reqRule.message, /Missing required field/);
  assert.deepEqual(reqRule.details.missingFields.sort(), ['interest_rate', 'loan_id', 'original_principal'].sort());
});

test('RULE_VALID_DATES: Flags unparseable or invalid calendar date', () => {
  const loan = createCleanLoan({
    rawUnparsedValues: JSON.stringify({ origination_date: '2024-02-31' }),
  });
  const results = validateLoan(loan);
  const dateRule = results.find((r) => r.rule_id === 'RULE_VALID_DATES');

  assert.equal(dateRule.passed, false);
  assert.match(dateRule.message, /2024-02-31/);
});

test('EDGE CASE: Origination date malformed while checking maturity > origination', () => {
  // Simulates when origination_date was "2024-02-31" (unparseable)
  const loan = createCleanLoan({
    originationDate: null,
    rawUnparsedValues: JSON.stringify({ origination_date: '2024-02-31' }),
    maturityDate: new Date('2054-01-15T00:00:00.000Z'),
  });

  const results = validateLoan(loan);

  // 1. RULE_VALID_DATES should fail
  const dateRule = results.find((r) => r.rule_id === 'RULE_VALID_DATES');
  assert.equal(dateRule.passed, false);
  assert.match(dateRule.message, /2024-02-31/);

  // 2. RULE_MATURITY_AFTER_ORIGINATION must NOT crash or evaluate NaN arithmetic.
  // It must report prerequisite failure gracefully.
  const matRule = results.find((r) => r.rule_id === 'RULE_MATURITY_AFTER_ORIGINATION');
  assert.equal(matRule.passed, false);
  assert.match(matRule.message, /Cannot verify maturity sequence/);
  assert.equal(matRule.details.isOrigValid, false);
});

test('RULE_MATURITY_AFTER_ORIGINATION: Flags maturity prior to origination', () => {
  const loan = createCleanLoan({
    originationDate: new Date('2024-05-01T00:00:00.000Z'),
    maturityDate: new Date('2021-01-01T00:00:00.000Z'),
  });
  const results = validateLoan(loan);
  const matRule = results.find((r) => r.rule_id === 'RULE_MATURITY_AFTER_ORIGINATION');

  assert.equal(matRule.passed, false);
  assert.match(matRule.message, /on or before origination date/);
});

test('RULE_NON_NEGATIVE_PRINCIPAL: Flags negative principal and negative balance', () => {
  const loan1 = createCleanLoan({ originalPrincipal: -250000 });
  const results1 = validateLoan(loan1);
  const rule1 = results1.find((r) => r.rule_id === 'RULE_NON_NEGATIVE_PRINCIPAL');
  assert.equal(rule1.passed, false);
  assert.match(rule1.message, /negative/);

  const loan2 = createCleanLoan({ currentBalance: -1500 });
  const results2 = validateLoan(loan2);
  const rule2 = results2.find((r) => r.rule_id === 'RULE_NON_NEGATIVE_PRINCIPAL');
  assert.equal(rule2.passed, false);
});

test('RULE_BALANCE_LE_PRINCIPAL: Flags balance exceeding original principal', () => {
  const loan = createCleanLoan({
    originalPrincipal: 300000,
    currentBalance: 425000,
  });
  const results = validateLoan(loan);
  const balRule = results.find((r) => r.rule_id === 'RULE_BALANCE_LE_PRINCIPAL');

  assert.equal(balRule.passed, false);
  assert.match(balRule.message, /exceeds original principal/);
  assert.equal(balRule.details.excess, 125000);
});

test('RULE_INTEREST_RATE_RANGE: Flags rates < 0.5% or > 35%', () => {
  const loanLow = createCleanLoan({ interestRate: -1.2 });
  const resLow = validateLoan(loanLow);
  assert.equal(resLow.find((r) => r.rule_id === 'RULE_INTEREST_RATE_RANGE').passed, false);

  const loanHigh = createCleanLoan({ interestRate: 88.5 });
  const resHigh = validateLoan(loanHigh);
  assert.equal(resHigh.find((r) => r.rule_id === 'RULE_INTEREST_RATE_RANGE').passed, false);
});

test('RULE_VALID_PAYMENT_STATUS: Flags unknown status strings', () => {
  const loan = createCleanLoan({ paymentStatus: 'UNKNOWN_STATUS_CODE' });
  const results = validateLoan(loan);
  const statusRule = results.find((r) => r.rule_id === 'RULE_VALID_PAYMENT_STATUS');

  assert.equal(statusRule.passed, false);
  assert.match(statusRule.message, /Invalid payment status/);
});

test('RULE_PAYMENT_STATUS_DPD_CONSISTENCY: Enforces exact servicing DPD matrix', () => {
  // Conflict 1: CURRENT with 60 DPD
  const loan1 = createCleanLoan({ paymentStatus: 'CURRENT', daysPastDue: 60 });
  const res1 = validateLoan(loan1);
  const rule1 = res1.find((r) => r.rule_id === 'RULE_PAYMENT_STATUS_DPD_CONSISTENCY');
  assert.equal(rule1.passed, false);
  assert.match(rule1.message, /is inconsistent with days past due \(60\)/);

  // Conflict 2: LATE_90 with 0 DPD
  const loan2 = createCleanLoan({ paymentStatus: 'LATE_90', daysPastDue: 0 });
  const res2 = validateLoan(loan2);
  const rule2 = res2.find((r) => r.rule_id === 'RULE_PAYMENT_STATUS_DPD_CONSISTENCY');
  assert.equal(rule2.passed, false);

  // Valid: LATE_30 with 45 DPD
  const loan3 = createCleanLoan({ paymentStatus: 'LATE_30', daysPastDue: 45 });
  const res3 = validateLoan(loan3);
  const rule3 = res3.find((r) => r.rule_id === 'RULE_PAYMENT_STATUS_DPD_CONSISTENCY');
  assert.equal(rule3.passed, true);
});

test('RULE_DUPLICATE_LOAN_ID: Flags batch and existing DB duplicates', () => {
  const loan = createCleanLoan({ loanIdentifier: 'LN-DUP-001' });

  // In-batch duplicate
  const loanIdCounts = new Map([['LN-DUP-001', 3]]);
  const resBatch = validateLoan(loan, { loanIdCounts });
  const ruleBatch = resBatch.find((r) => r.rule_id === 'RULE_DUPLICATE_LOAN_ID');
  assert.equal(ruleBatch.passed, false);
  assert.match(ruleBatch.message, /Appears 3 times/);

  // Cross-DB duplicate
  const existingDbLoanIds = new Set(['LN-DUP-001']);
  const resDb = validateLoan(loan, { existingDbLoanIds });
  const ruleDb = resDb.find((r) => r.rule_id === 'RULE_DUPLICATE_LOAN_ID');
  assert.equal(ruleDb.passed, false);
  assert.match(ruleDb.message, /Already exists in existing/);
});

test('RULE_DUPLICATE_BORROWER_TRIPLET: Flags repeated borrower origination records', () => {
  const loan = createCleanLoan({
    borrowerId: 'BW-99999',
    originalPrincipal: 400000,
    originationDate: new Date('2024-06-01T00:00:00.000Z'),
  });
  const tripletKey = 'BW-99999|400000|2024-06-01';
  const tripletCounts = new Map([[tripletKey, 2]]);

  const results = validateLoan(loan, { tripletCounts });
  const tripletRule = results.find((r) => r.rule_id === 'RULE_DUPLICATE_BORROWER_TRIPLET');
  assert.equal(tripletRule.passed, false);
  assert.match(tripletRule.message, /Duplicate borrower origination triplet/);
});

test('RULE_STALE_RECORD: Flags records older than 180-day staleness threshold', () => {
  // Config referenceDate is 2026-02-26
  const staleLoan = createCleanLoan({
    lastUpdatedAt: new Date('2024-01-01T00:00:00.000Z'), // ~780 days old
  });
  const results = validateLoan(staleLoan);
  const staleRule = results.find((r) => r.rule_id === 'RULE_STALE_RECORD');
  assert.equal(staleRule.passed, false);
  assert.match(staleRule.message, /exceeds 180-day limit/);
});

test('RULE_VALID_STATE_CODE: Flags invalid state codes', () => {
  const badStateLoan = createCleanLoan({ borrowerState: 'ZZ' });
  const results = validateLoan(badStateLoan);
  const stateRule = results.find((r) => r.rule_id === 'RULE_VALID_STATE_CODE');
  assert.equal(stateRule.passed, false);
  assert.match(stateRule.message, /Invalid or unrecognized US state code 'ZZ'/);
});

test('RULE_CLOSED_LOAN_POSITIVE_BALANCE: Flags PAID_OFF loans carrying remaining balance', () => {
  const loan = createCleanLoan({
    paymentStatus: 'PAID_OFF',
    currentBalance: 45000.0,
  });
  const results = validateLoan(loan);
  const closedRule = results.find((r) => r.rule_id === 'RULE_CLOSED_LOAN_POSITIVE_BALANCE');
  assert.equal(closedRule.passed, false);
  assert.match(closedRule.message, /positive balance of \$45,000/);
});

test('RULE_CROSS_SOURCE_CONFLICT: Flags discrepancies with external servicer feed', () => {
  const loan = createCleanLoan({
    loanIdentifier: 'LN-100001',
    currentBalance: 300000.0,
    paymentStatus: 'CURRENT',
    daysPastDue: 0,
  });

  const servicerUpdate = {
    loan_id: 'LN-100001',
    current_balance: 315000.0, // Discrepancy
    payment_status: 'LATE_30', // Discrepancy
    days_past_due: 35, // Discrepancy
  };

  const results = validateLoan(loan, { servicerUpdate });
  const conflictRule = results.find((r) => r.rule_id === 'RULE_CROSS_SOURCE_CONFLICT');
  assert.equal(conflictRule.passed, false);
  assert.match(conflictRule.message, /current_balance mismatch/);
  assert.match(conflictRule.message, /payment_status mismatch/);
  assert.match(conflictRule.message, /days_past_due mismatch/);
});
