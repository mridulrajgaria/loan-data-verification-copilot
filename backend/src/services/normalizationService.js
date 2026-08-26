/**
 * Normalization Service (Module A)
 *
 * Normalizes raw parsed CSV rows into typed domain entities.
 * CRITICAL RULE: Normalization handles format & coercion ONLY, NOT business correctness.
 * Faulty domain values (negative principals, DPD mismatches, bad date values) are preserved
 * in their normalized format so the downstream Validation Engine can evaluate and flag them.
 */

/**
 * Parses and coerces date values into ISO Date objects without altering invalid semantics.
 * If a date string is structurally unparseable (e.g. "INVALID_DATE_VAL", "13/45/2023", "2024-02-31"),
 * returns null and tracks the unparsed string in unparsedAccumulator so validation engine can flag it.
 */
function normalizeDate(val, fieldName, unparsedAccumulator) {
  if (!val || typeof val !== 'string' || val.trim() === '') {
    return null;
  }
  const trimmed = val.trim();

  // Check for strict ISO YYYY-MM-DD or standard YYYY/MM/DD
  const isoMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);

    // Validate calendar ranges strictly (e.g. catch 2024-02-31 or month 13)
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      unparsedAccumulator[fieldName] = trimmed;
      return null;
    }

    const testDate = new Date(Date.UTC(year, month - 1, day));
    if (
      testDate.getUTCFullYear() !== year ||
      testDate.getUTCMonth() !== month - 1 ||
      testDate.getUTCDate() !== day
    ) {
      // Date rolled over (e.g. Feb 31 -> March 2), meaning invalid calendar date
      unparsedAccumulator[fieldName] = trimmed;
      return null;
    }
    return testDate;
  }

  // General Date parse attempt
  const parsedTimestamp = Date.parse(trimmed);
  if (isNaN(parsedTimestamp)) {
    unparsedAccumulator[fieldName] = trimmed;
    return null;
  }

  const d = new Date(parsedTimestamp);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Coerces a numeric field, preserving negative values and zero.
 */
function normalizeFloat(val, fieldName, unparsedAccumulator) {
  if (val === null || val === undefined || val === '') {
    return null;
  }
  const str = String(val).trim().replace(/[$,]/g, '');
  if (str === '') return null;

  const num = parseFloat(str);
  if (isNaN(num)) {
    unparsedAccumulator[fieldName] = str;
    return null;
  }
  return num;
}

/**
 * Coerces an integer field.
 */
function normalizeInt(val, fieldName, unparsedAccumulator) {
  if (val === null || val === undefined || val === '') {
    return null;
  }
  const str = String(val).trim().replace(/[,]/g, '');
  if (str === '') return null;

  const num = parseInt(str, 10);
  if (isNaN(num)) {
    unparsedAccumulator[fieldName] = str;
    return null;
  }
  return num;
}

/**
 * Normalizes text: trims whitespace, preserves uppercase state codes.
 */
function normalizeString(val) {
  if (val === null || val === undefined) return null;
  const trimmed = String(val).trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeStateCode(val) {
  if (!val) return null;
  return String(val).trim().toUpperCase();
}

/**
 * Normalizes a single raw row object.
 *
 * @param {Object} rawRow - Raw key-value row from CSV parser
 * @param {number} rowNumber - 1-indexed row number in the uploaded CSV
 * @returns {{ success: boolean, data?: Object, error?: string }}
 */
function normalizeLoanRecord(rawRow, rowNumber) {
  // Case-insensitive key accessor helper
  const get = (keyName) => {
    if (!rawRow) return undefined;
    if (rawRow[keyName] !== undefined) return rawRow[keyName];
    const lower = keyName.toLowerCase();
    const foundKey = Object.keys(rawRow).find(k => k.toLowerCase() === lower);
    return foundKey ? rawRow[foundKey] : undefined;
  };

  const rawLoanId = get('loan_id');

  // Structural sanity check: If row is entirely empty or has no keys
  if (!rawRow || Object.keys(rawRow).length === 0) {
    return {
      success: false,
      error: `Row ${rowNumber} is structurally empty with no column data.`,
    };
  }

  const unparsedFields = {};

  const loanIdentifier = normalizeString(rawLoanId) || '';
  const borrowerId = normalizeString(get('borrower_id'));
  const borrowerName = normalizeString(get('borrower_name')) || borrowerId || null;
  const borrowerEmail = normalizeString(get('borrower_email'));
  const borrowerSsnHash = normalizeString(get('borrower_ssn_hash'));
  const loanType = normalizeString(get('loan_type')) ? normalizeString(get('loan_type')).toUpperCase() : null;

  const originationDate = normalizeDate(get('origination_date'), 'origination_date', unparsedFields);
  const maturityDate = normalizeDate(get('maturity_date'), 'maturity_date', unparsedFields);
  const originalPrincipal = normalizeFloat(get('original_principal'), 'original_principal', unparsedFields);
  const currentBalance = normalizeFloat(get('current_balance'), 'current_balance', unparsedFields);
  const interestRate = normalizeFloat(get('interest_rate'), 'interest_rate', unparsedFields);
  const termMonths = normalizeInt(get('term_months'), 'term_months', unparsedFields);
  const borrowerState = normalizeStateCode(get('borrower_state'));
  const loanPurpose = normalizeString(get('loan_purpose')) ? normalizeString(get('loan_purpose')).toUpperCase() : null;
  const creditGrade = normalizeString(get('credit_grade')) ? normalizeString(get('credit_grade')).toUpperCase() : null;
  const employmentLength = normalizeString(get('employment_length'));
  const incomeBand = normalizeString(get('income_band'));
  const paymentStatus = normalizeString(get('payment_status')) ? normalizeString(get('payment_status')).toUpperCase() : null;
  const daysPastDue = normalizeInt(get('days_past_due'), 'days_past_due', unparsedFields);
  const servicerName = normalizeString(get('servicer_name'));
  const lastPaymentDate = normalizeDate(get('last_payment_date'), 'last_payment_date', unparsedFields);
  const lastUpdatedAt = normalizeDate(get('last_updated_at'), 'last_updated_at', unparsedFields);
  const documentStatus = normalizeString(get('document_status')) ? normalizeString(get('document_status')).toUpperCase() : null;
  const sourceSystem = normalizeString(get('source_system'));
  const propertyAddress = normalizeString(get('property_address'));
  const propertyValue = normalizeFloat(get('property_value'), 'property_value', unparsedFields);
  const creditScore = normalizeInt(get('credit_score'), 'credit_score', unparsedFields);

  // Derived financial ratios if values exist (without correcting/filtering out of bounds)
  let ltvRatio = null;
  if (originalPrincipal !== null && propertyValue !== null && propertyValue > 0) {
    ltvRatio = parseFloat(((originalPrincipal / propertyValue) * 100).toFixed(2));
  }

  return {
    success: true,
    data: {
      loanIdentifier,
      borrowerId,
      borrowerName,
      borrowerEmail,
      borrowerSsnHash,
      loanType,
      originationDate,
      maturityDate,
      originalPrincipal,
      currentBalance,
      interestRate,
      termMonths,
      borrowerState,
      loanPurpose,
      creditGrade,
      employmentLength,
      incomeBand,
      paymentStatus,
      daysPastDue,
      servicerName,
      lastPaymentDate,
      lastUpdatedAt,
      documentStatus,
      sourceSystem,
      propertyAddress,
      propertyValue,
      ltvRatio,
      creditScore,
      status: 'UNVALIDATED',
      rawUnparsedValues: Object.keys(unparsedFields).length > 0 ? JSON.stringify(unparsedFields) : null,
    },
  };
}

module.exports = {
  normalizeLoanRecord,
  normalizeDate,
  normalizeFloat,
  normalizeInt,
  normalizeString,
  normalizeStateCode,
};
