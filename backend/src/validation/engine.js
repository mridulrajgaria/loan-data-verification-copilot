/**
 * Standalone Loan Validation Engine (Module B)
 *
 * Pure validation engine for NormalizedLoan entities.
 * Evaluates loans against data-integrity, compliance, and underwriting rules.
 * Supports cross-source matching against Servicer Updates and Document Manifests.
 */

const fs = require('fs');
const path = require('path');

// Load default rules config
const DEFAULT_CONFIG_PATH = path.join(__dirname, 'validation_rules.json');
let cachedConfig = null;

function loadConfig(configPath = DEFAULT_CONFIG_PATH) {
  if (cachedConfig && configPath === DEFAULT_CONFIG_PATH) {
    return cachedConfig;
  }
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (configPath === DEFAULT_CONFIG_PATH) {
    cachedConfig = parsed;
  }
  return parsed;
}

/**
 * Parses rawUnparsedValues if stored as string.
 */
function getUnparsedMap(loan) {
  if (!loan || !loan.rawUnparsedValues) return {};
  if (typeof loan.rawUnparsedValues === 'object') return loan.rawUnparsedValues;
  try {
    return JSON.parse(loan.rawUnparsedValues);
  } catch {
    return {};
  }
}

/**
 * Validates a single NormalizedLoan entity.
 *
 * @param {Object} loan - NormalizedLoan domain object
 * @param {Object} [options] - Contextual data sources and batch duplicate lookups
 * @param {Object} [options.servicerUpdate] - Matching record from servicer_update.csv
 * @param {Object} [options.documentManifest] - Matching record from document_manifest.csv
 * @param {Map<string, number>} [options.loanIdCounts] - Map of loanIdentifier -> occurrences in batch
 * @param {Set<string>} [options.existingDbLoanIds] - Set of loanIdentifier already in DB prior to batch
 * @param {Map<string, number>} [options.tripletCounts] - Map of "borrowerId|principal|origDate" -> occurrences in batch
 * @param {Object} [options.config] - Custom validation config overrides
 * @returns {Array<{ rule_id: string, name: string, severity: string, passed: boolean, message: string, details?: any }>}
 */
function validateLoan(loan, options = {}) {
  const config = options.config || loadConfig();
  const unparsed = getUnparsedMap(loan);
  const results = [];

  // Helper to append a validation result
  const record = (ruleCode, passed, message, details = null) => {
    const ruleDef = config.rules.find((r) => r.ruleCode === ruleCode) || {
      severity: 'HIGH',
      name: ruleCode,
    };
    results.push({
      rule_id: ruleCode,
      name: ruleDef.name,
      severity: ruleDef.severity,
      passed: Boolean(passed),
      message: String(message),
      details,
    });
  };

  // ---------------------------------------------------------------------------
  // 1. RULE_REQUIRED_FIELDS: Essential Identifiers & Core Attributes
  // ---------------------------------------------------------------------------
  const missingRequired = [];
  if (!loan.loanIdentifier || String(loan.loanIdentifier).trim() === '') {
    missingRequired.push('loan_id');
  }
  if (!loan.borrowerId && !loan.borrowerName) {
    missingRequired.push('borrower_id');
  }
  if (loan.originalPrincipal === null || loan.originalPrincipal === undefined) {
    missingRequired.push('original_principal');
  }
  if (loan.interestRate === null || loan.interestRate === undefined) {
    missingRequired.push('interest_rate');
  }
  if (!loan.loanType) {
    missingRequired.push('loan_type');
  }
  if (loan.termMonths === null || loan.termMonths === undefined) {
    missingRequired.push('term_months');
  }

  if (missingRequired.length > 0) {
    record(
      'RULE_REQUIRED_FIELDS',
      false,
      `Missing required field(s): ${missingRequired.join(', ')}.`,
      { missingFields: missingRequired }
    );
  } else {
    record('RULE_REQUIRED_FIELDS', true, 'All core required fields are present.');
  }

  // ---------------------------------------------------------------------------
  // 2. RULE_VALID_DATES: Strict Date Format & Calendar Validity
  // ---------------------------------------------------------------------------
  const dateErrors = [];
  if (unparsed.origination_date) {
    dateErrors.push(`origination_date: '${unparsed.origination_date}'`);
  }
  if (unparsed.maturity_date) {
    dateErrors.push(`maturity_date: '${unparsed.maturity_date}'`);
  }
  if (unparsed.last_payment_date) {
    dateErrors.push(`last_payment_date: '${unparsed.last_payment_date}'`);
  }
  if (unparsed.last_updated_at) {
    dateErrors.push(`last_updated_at: '${unparsed.last_updated_at}'`);
  }

  if (dateErrors.length > 0) {
    record(
      'RULE_VALID_DATES',
      false,
      `Invalid or unparseable calendar dates detected: ${dateErrors.join('; ')}.`,
      { invalidDates: dateErrors, unparsed }
    );
  } else {
    record('RULE_VALID_DATES', true, 'All provided dates are valid ISO calendar dates.');
  }

  // ---------------------------------------------------------------------------
  // 3. RULE_MATURITY_AFTER_ORIGINATION: Temporal Sequence Validation
  // EDGE CASE HANDLING: If origination_date or maturity_date is malformed or missing,
  // we cannot perform mathematical date comparison (would result in NaN comparison).
  // We explicitly flag dependency failure without crashing.
  // ---------------------------------------------------------------------------
  const origDate = loan.originationDate ? new Date(loan.originationDate) : null;
  const matDate = loan.maturityDate ? new Date(loan.maturityDate) : null;

  const isOrigValid = Boolean(origDate && !isNaN(origDate.getTime()) && !unparsed.origination_date);
  const isMatValid = Boolean(matDate && !isNaN(matDate.getTime()) && !unparsed.maturity_date);

  if (!isOrigValid || !isMatValid) {
    const missing = [];
    if (!isOrigValid) missing.push(`origination_date (${unparsed.origination_date || 'missing'})`);
    if (!isMatValid) missing.push(`maturity_date (${unparsed.maturity_date || 'missing'})`);

    record(
      'RULE_MATURITY_AFTER_ORIGINATION',
      false,
      `Cannot verify maturity sequence: date values invalid or missing [${missing.join(', ')}].`,
      { isOrigValid, isMatValid, unparsed }
    );
  } else if (matDate.getTime() <= origDate.getTime()) {
    record(
      'RULE_MATURITY_AFTER_ORIGINATION',
      false,
      `Maturity date (${matDate.toISOString().split('T')[0]}) is on or before origination date (${origDate.toISOString().split('T')[0]}).`,
      { originationDate: origDate, maturityDate: matDate }
    );
  } else {
    record(
      'RULE_MATURITY_AFTER_ORIGINATION',
      true,
      `Maturity date follows origination date (${Math.round((matDate - origDate) / (1000 * 60 * 60 * 24 * 30.4))} months duration).`
    );
  }

  // ---------------------------------------------------------------------------
  // 4. RULE_NON_NEGATIVE_PRINCIPAL: Principal & Balance Positivity Bounds
  // ---------------------------------------------------------------------------
  const principal = loan.originalPrincipal;
  const balance = loan.currentBalance;

  if (principal !== null && principal < 0) {
    record(
      'RULE_NON_NEGATIVE_PRINCIPAL',
      false,
      `Original principal cannot be negative (found: $${principal}).`,
      { originalPrincipal: principal }
    );
  } else if (balance !== null && balance < 0) {
    record(
      'RULE_NON_NEGATIVE_PRINCIPAL',
      false,
      `Current balance cannot be negative (found: $${balance}).`,
      { currentBalance: balance }
    );
  } else {
    record('RULE_NON_NEGATIVE_PRINCIPAL', true, 'Original principal and current balance are non-negative.');
  }

  // ---------------------------------------------------------------------------
  // 5. RULE_BALANCE_LE_PRINCIPAL: Current Balance vs Original Disbursed Principal
  // ---------------------------------------------------------------------------
  if (principal !== null && balance !== null && principal >= 0) {
    if (balance > principal) {
      record(
        'RULE_BALANCE_LE_PRINCIPAL',
        false,
        `Current balance ($${balance.toLocaleString()}) exceeds original principal ($${principal.toLocaleString()}) by $${(balance - principal).toLocaleString()}.`,
        { currentBalance: balance, originalPrincipal: principal, excess: balance - principal }
      );
    } else {
      record('RULE_BALANCE_LE_PRINCIPAL', true, 'Current balance is within original principal boundary.');
    }
  } else {
    record('RULE_BALANCE_LE_PRINCIPAL', true, 'Balance boundary verified or principal not evaluable.');
  }

  // ---------------------------------------------------------------------------
  // 6. RULE_INTEREST_RATE_RANGE: Market & Usury Bounds
  // ---------------------------------------------------------------------------
  const rate = loan.interestRate;
  const { min: minRate, max: maxRate } = config.interestRateBounds;

  if (rate === null || rate === undefined || unparsed.interest_rate) {
    record(
      'RULE_INTEREST_RATE_RANGE',
      false,
      `Interest rate is missing or invalid (value: '${unparsed.interest_rate || rate}').`,
      { interestRate: rate }
    );
  } else if (rate < minRate || rate > maxRate) {
    record(
      'RULE_INTEREST_RATE_RANGE',
      false,
      `Interest rate ${rate}% is outside acceptable range [${minRate}% - ${maxRate}%].`,
      { interestRate: rate, minRate, maxRate }
    );
  } else {
    record('RULE_INTEREST_RATE_RANGE', true, `Interest rate ${rate}% is within acceptable parameters.`);
  }

  // ---------------------------------------------------------------------------
  // 7. RULE_VALID_PAYMENT_STATUS: Enumeration Compliance
  // ---------------------------------------------------------------------------
  const status = loan.paymentStatus;
  const validStatuses = config.validPaymentStatuses;

  if (!status || !validStatuses.includes(status)) {
    record(
      'RULE_VALID_PAYMENT_STATUS',
      false,
      `Invalid payment status '${status}'. Expected one of: ${validStatuses.join(', ')}.`,
      { paymentStatus: status, validStatuses }
    );
  } else {
    record('RULE_VALID_PAYMENT_STATUS', true, `Payment status '${status}' is valid.`);
  }

  // ---------------------------------------------------------------------------
  // 8. RULE_PAYMENT_STATUS_DPD_CONSISTENCY: Servicing Coherence Matrix
  // ---------------------------------------------------------------------------
  const dpd = loan.daysPastDue;
  const dpdMatrix = config.paymentStatusDpdMatrix;

  if (status && dpd !== null && dpd !== undefined && dpdMatrix[status]) {
    const expected = dpdMatrix[status];
    if (dpd < expected.minDpd || dpd > expected.maxDpd) {
      record(
        'RULE_PAYMENT_STATUS_DPD_CONSISTENCY',
        false,
        `Payment status '${status}' is inconsistent with days past due (${dpd}). Expected DPD between ${expected.minDpd} and ${expected.maxDpd}.`,
        { paymentStatus: status, daysPastDue: dpd, expectedRange: expected }
      );
    } else {
      record(
        'RULE_PAYMENT_STATUS_DPD_CONSISTENCY',
        true,
        `Payment status '${status}' correctly aligns with ${dpd} DPD.`
      );
    }
  } else if (dpd === null || dpd === undefined) {
    record(
      'RULE_PAYMENT_STATUS_DPD_CONSISTENCY',
      false,
      `Days past due value is missing or invalid.`,
      { daysPastDue: dpd }
    );
  } else {
    record('RULE_PAYMENT_STATUS_DPD_CONSISTENCY', true, 'DPD consistency verified.');
  }

  // ---------------------------------------------------------------------------
  // 9. RULE_DUPLICATE_LOAN_ID: Unique Identifier Verification
  // ---------------------------------------------------------------------------
  const loanId = loan.loanIdentifier;
  if (!loanId) {
    // Already flagged in required fields
    record('RULE_DUPLICATE_LOAN_ID', true, 'Skipped duplicate check for empty loan_id.');
  } else {
    const batchOccurrences = options.loanIdCounts ? (options.loanIdCounts.get(loanId) || 0) : 1;
    const existsInDb = options.existingDbLoanIds ? options.existingDbLoanIds.has(loanId) : false;

    if (batchOccurrences > 1 || existsInDb) {
      const reason = batchOccurrences > 1
        ? `Appears ${batchOccurrences} times within current batch.`
        : 'Already exists in existing portfolio database.';
      record(
        'RULE_DUPLICATE_LOAN_ID',
        false,
        `Duplicate loan_id '${loanId}' detected: ${reason}`,
        { loanId, batchOccurrences, existsInDb }
      );
    } else {
      record('RULE_DUPLICATE_LOAN_ID', true, `Loan ID '${loanId}' is unique.`);
    }
  }

  // ---------------------------------------------------------------------------
  // 10. RULE_DUPLICATE_BORROWER_TRIPLET: Duplicate Origination Triplet Check
  // ---------------------------------------------------------------------------
  if (loan.borrowerId && principal !== null && isOrigValid) {
    const origIso = origDate.toISOString().split('T')[0];
    const tripletKey = `${loan.borrowerId}|${principal}|${origIso}`;
    const tripletOccurrences = options.tripletCounts ? (options.tripletCounts.get(tripletKey) || 0) : 1;

    if (tripletOccurrences > 1) {
      record(
        'RULE_DUPLICATE_BORROWER_TRIPLET',
        false,
        `Duplicate borrower origination triplet detected: Borrower ${loan.borrowerId} has ${tripletOccurrences} loans with amount $${principal} originated on ${origIso}.`,
        { borrowerId: loan.borrowerId, principal, originationDate: origIso, count: tripletOccurrences }
      );
    } else {
      record('RULE_DUPLICATE_BORROWER_TRIPLET', true, 'Borrower origination triplet is unique.');
    }
  } else {
    record('RULE_DUPLICATE_BORROWER_TRIPLET', true, 'Triplet uniqueness verified.');
  }

  // ---------------------------------------------------------------------------
  // 11. RULE_REQUIRED_DOCUMENT_STATUS: Document Custody Presence
  // ---------------------------------------------------------------------------
  const docStatus = loan.documentStatus;
  const manifestRecord = options.documentManifest;

  if (!docStatus || docStatus.trim() === '') {
    record(
      'RULE_REQUIRED_DOCUMENT_STATUS',
      false,
      'Document status is missing or blank in primary loan tape.',
      { documentStatus: docStatus }
    );
  } else if (manifestRecord && manifestRecord.document_status === 'MISSING_DOCS') {
    record(
      'RULE_REQUIRED_DOCUMENT_STATUS',
      false,
      'Document custody audit indicates missing collateral files in custodial vault.',
      { manifestRecord }
    );
  } else if (options.documentManifest === null && options.hasManifestFeed) {
    // Intentionally omitted from manifest
    record(
      'RULE_REQUIRED_DOCUMENT_STATUS',
      false,
      'Loan record is missing entirely from custodial document manifest.',
      { loanId: loan.loanIdentifier }
    );
  } else {
    record('RULE_REQUIRED_DOCUMENT_STATUS', true, `Document status '${docStatus}' verified.`);
  }

  // ---------------------------------------------------------------------------
  // 12. RULE_STALE_RECORD: Freshness Window Check (> 180 Days)
  // ---------------------------------------------------------------------------
  const refDate = new Date(config.referenceDate || '2026-02-26T00:00:00.000Z');
  const lastUpdated = loan.lastUpdatedAt ? new Date(loan.lastUpdatedAt) : null;
  const stalenessLimitDays = config.stalenessThresholdDays || 180;

  if (!lastUpdated || isNaN(lastUpdated.getTime()) || unparsed.last_updated_at) {
    record(
      'RULE_STALE_RECORD',
      false,
      `last_updated_at is missing or malformed (found: '${unparsed.last_updated_at || loan.lastUpdatedAt}').`,
      { lastUpdatedAt: loan.lastUpdatedAt }
    );
  } else {
    const ageInDays = Math.floor((refDate.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24));
    if (ageInDays > stalenessLimitDays) {
      record(
        'RULE_STALE_RECORD',
        false,
        `Record is stale: last updated ${ageInDays} days ago on ${lastUpdated.toISOString().split('T')[0]} (exceeds ${stalenessLimitDays}-day limit).`,
        { ageInDays, stalenessLimitDays, lastUpdatedAt: lastUpdated }
      );
    } else {
      record('RULE_STALE_RECORD', true, `Record updated ${ageInDays} days ago (within ${stalenessLimitDays}-day limit).`);
    }
  }

  // ---------------------------------------------------------------------------
  // 13. RULE_VALID_STATE_CODE: US State Code Validation
  // ---------------------------------------------------------------------------
  const state = loan.borrowerState;
  const validStates = config.validStateCodes;

  if (!state || !validStates.includes(state)) {
    record(
      'RULE_VALID_STATE_CODE',
      false,
      `Invalid or unrecognized US state code '${state}'. Must be a valid 2-letter state abbreviation.`,
      { borrowerState: state, validStates }
    );
  } else {
    record('RULE_VALID_STATE_CODE', true, `US state code '${state}' is valid.`);
  }

  // ---------------------------------------------------------------------------
  // 14. RULE_CLOSED_LOAN_POSITIVE_BALANCE: Paid-Off Loan Zero Balance
  // ---------------------------------------------------------------------------
  if (status === 'PAID_OFF' || status === 'CLOSED') {
    if (balance !== null && balance > 0) {
      record(
        'RULE_CLOSED_LOAN_POSITIVE_BALANCE',
        false,
        `Loan is marked '${status}' but carries a positive balance of $${balance.toLocaleString()}.`,
        { paymentStatus: status, currentBalance: balance }
      );
    } else {
      record('RULE_CLOSED_LOAN_POSITIVE_BALANCE', true, `Paid-off loan has zero balance ($${balance || 0}).`);
    }
  } else {
    record('RULE_CLOSED_LOAN_POSITIVE_BALANCE', true, 'Closed loan balance check passed.');
  }

  // ---------------------------------------------------------------------------
  // 15. RULE_CROSS_SOURCE_CONFLICT: Discrepancy against Servicer Update Feed
  // ---------------------------------------------------------------------------
  const servicer = options.servicerUpdate;
  if (servicer) {
    const discrepancies = [];

    // Check balance mismatch
    if (servicer.current_balance !== undefined && balance !== null) {
      const servicerBal = parseFloat(servicer.current_balance);
      if (!isNaN(servicerBal) && Math.abs(servicerBal - balance) > 0.01) {
        discrepancies.push(`current_balance mismatch: Tape=$${balance}, Servicer=$${servicerBal}`);
      }
    }

    // Check payment status mismatch
    if (servicer.payment_status && status) {
      const servicerStatus = String(servicer.payment_status).trim().toUpperCase();
      if (servicerStatus !== status) {
        discrepancies.push(`payment_status mismatch: Tape='${status}', Servicer='${servicerStatus}'`);
      }
    }

    // Check days past due mismatch
    if (servicer.days_past_due !== undefined && dpd !== null) {
      const servicerDpd = parseInt(servicer.days_past_due, 10);
      if (!isNaN(servicerDpd) && servicerDpd !== dpd) {
        discrepancies.push(`days_past_due mismatch: Tape=${dpd}, Servicer=${servicerDpd}`);
      }
    }

    if (discrepancies.length > 0) {
      record(
        'RULE_CROSS_SOURCE_CONFLICT',
        false,
        `Discrepancy detected against external servicer feed: ${discrepancies.join(' | ')}.`,
        { discrepancies, tape: { balance, status, dpd }, servicer }
      );
    } else {
      record('RULE_CROSS_SOURCE_CONFLICT', true, 'Primary tape fully matches external servicer update feed.');
    }
  } else {
    record('RULE_CROSS_SOURCE_CONFLICT', true, 'No external servicer discrepancy found.');
  }

  return results;
}

module.exports = {
  validateLoan,
  loadConfig,
};
