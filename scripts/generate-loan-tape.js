#!/usr/bin/env node
/**
 * Synthetic Loan Tape & Multi-Source Data Generator
 * Generates realistic loan portfolios with controlled, deterministic anomaly injections.
 *
 * Outputs:
 *  - data/loan_tape.csv (Primary tape: 2000 records)
 *  - data/servicer_update.csv (Discrepant secondary data feed: ~400 records)
 *  - data/document_manifest.csv (Document custody manifest with missing entries)
 */

const fs = require('fs');
const path = require('path');

// =============================================================================
// 1. CONFIGURATION & INJECTION RATES (Configurable constants)
// =============================================================================
const CONFIG = {
  TOTAL_RECORDS: 2000,
  SERVICER_UPDATE_RECORDS: 400,
  DOCUMENT_MANIFEST_MISSING_RATE: 0.05, // 5% missing docs in manifest
  OUTPUT_DIR: path.join(__dirname, '..', 'data'),

  // Target Injection Counts / Probabilities for Primary Tape
  ANOMALIES: {
    MISSING_LOAN_ID: 15,
    DUPLICATE_LOAN_ID: 20,
    DUPLICATE_BORROWER_TRIPLET: 25, // same borrower + amount + origination_date
    INVALID_DATE_FORMAT: 30,
    MATURITY_BEFORE_ORIGINATION: 25,
    NEGATIVE_PRINCIPAL: 15,
    BALANCE_EXCEEDS_PRINCIPAL: 35,
    UNREALISTIC_INTEREST_RATE: 30, // negative or >35%
    PAYMENT_STATUS_DPD_MISMATCH: 40,
    MISSING_DOCUMENT_STATUS: 35,
    STALE_LAST_UPDATED: 45, // > 180 days old
    INVALID_STATE_CODE: 25, // e.g. "ZZ", "XX", "99", "California"
    SUSPICIOUS_REPEATED_BORROWER: 30, // same borrower_id multiple times with slight variance
    CLOSED_LOAN_POSITIVE_BALANCE: 25,
  },
};

// =============================================================================
// 2. REALISTIC DOMAIN DISTRIBUTIONS
// =============================================================================
const VALID_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
];

const STATE_WEIGHTS = [
  { state: 'CA', weight: 15 },
  { state: 'TX', weight: 12 },
  { state: 'FL', weight: 10 },
  { state: 'NY', weight: 8 },
  { state: 'IL', weight: 5 },
  { state: 'PA', weight: 4 },
  { state: 'OH', weight: 4 },
  { state: 'GA', weight: 4 },
  { state: 'NC', weight: 4 },
  { state: 'MI', weight: 3 },
  { state: 'WA', weight: 3 },
  { state: 'AZ', weight: 3 },
  { state: 'CO', weight: 3 },
  { state: 'VA', weight: 3 },
  { state: 'MA', weight: 2 },
];

const LOAN_TYPES = [
  { type: 'CONVENTIONAL', weight: 55 },
  { type: 'FHA', weight: 20 },
  { type: 'VA', weight: 15 },
  { type: 'JUMBO', weight: 10 },
];

const CREDIT_GRADES = [
  { grade: 'A', weight: 30, minRate: 4.5, maxRate: 6.0, minScore: 740, maxScore: 850 },
  { grade: 'B', weight: 30, minRate: 5.5, maxRate: 7.0, minScore: 680, maxScore: 739 },
  { grade: 'C', weight: 22, minRate: 6.5, maxRate: 8.5, minScore: 620, maxScore: 679 },
  { grade: 'D', weight: 12, minRate: 8.0, maxRate: 11.0, minScore: 580, maxScore: 619 },
  { grade: 'E', weight: 5, minRate: 10.5, maxRate: 14.5, minScore: 520, maxScore: 579 },
  { grade: 'F', weight: 1, minRate: 14.0, maxRate: 18.0, minScore: 480, maxScore: 519 },
];

const LOAN_PURPOSES = [
  { purpose: 'PURCHASE', weight: 60 },
  { purpose: 'REFINANCE_RATE_TERM', weight: 25 },
  { purpose: 'REFINANCE_CASH_OUT', weight: 15 },
];

const EMPLOYMENT_LENGTHS = [
  '< 1 year', '1-2 years', '3-5 years', '6-9 years', '10+ years'
];

const INCOME_BANDS = [
  '< $40k', '$40k-$75k', '$75k-$120k', '$120k-$200k', '$200k+'
];

const PAYMENT_STATUSES = [
  { status: 'CURRENT', weight: 84, dpdMin: 0, dpdMax: 0 },
  { status: 'LATE_30', weight: 7, dpdMin: 30, dpdMax: 59 },
  { status: 'LATE_60', weight: 4, dpdMin: 60, dpdMax: 89 },
  { status: 'LATE_90', weight: 2, dpdMin: 90, dpdMax: 119 },
  { status: 'DEFAULT', weight: 1, dpdMin: 120, dpdMax: 240 },
  { status: 'PAID_OFF', weight: 2, dpdMin: 0, dpdMax: 0 },
];

const SERVICERS = [
  'PennyMac Financial Services',
  'Rocket Mortgage Servicing',
  'Mr. Cooper Group',
  'Wells Fargo Home Mortgage',
  'Freedom Mortgage Corporation',
  'Chase Home Lending',
  'U.S. Bank Home Mortgage'
];

const SOURCE_SYSTEMS = [
  'LOS_ENCOMPASS_PROD',
  'SERVICING_MSP_CORE',
  'CORE_BLACKKNIGHT_LPS',
  'ORIGINATION_PORTAL_V2'
];

const DOCUMENT_STATUSES = [
  'VERIFIED',
  'PENDING_REVIEW',
  'EXCEPTION_NOTED',
  'MISSING_DOCS',
  'AUDIT_COMPLETE'
];

// =============================================================================
// 3. UTILITY & RANDOM HELPER FUNCTIONS
// =============================================================================
// Pseudo-random with seed capability for reproducible distributions
let seed = 42;
function random() {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

function randomInt(min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function randomFloat(min, max, decimals = 2) {
  const val = random() * (max - min) + min;
  return parseFloat(val.toFixed(decimals));
}

function pickWeighted(items) {
  const totalWeight = items.reduce((acc, item) => acc + item.weight, 0);
  let r = random() * totalWeight;
  for (const item of items) {
    if (r < item.weight) return item;
    r -= item.weight;
  }
  return items[items.length - 1];
}

function pickRandom(array) {
  return array[Math.floor(random() * array.length)];
}

function formatDateISO(date) {
  return date.toISOString().split('T')[0];
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function escapeCsvValue(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// =============================================================================
// 4. GENERATION PIPELINE & INJECTION ENGINE
// =============================================================================

function generateBaseRecord(index) {
  const creditConfig = pickWeighted(CREDIT_GRADES);
  const loanType = pickWeighted(LOAN_TYPES).type;
  const loanPurpose = pickWeighted(LOAN_PURPOSES).purpose;
  const paymentConfig = pickWeighted(PAYMENT_STATUSES);

  // Realistic Principal ranges based on loan type
  let originalPrincipal = 0;
  if (loanType === 'JUMBO') {
    originalPrincipal = randomInt(750000, 1800000);
  } else if (loanType === 'FHA') {
    originalPrincipal = randomInt(120000, 420000);
  } else {
    originalPrincipal = randomInt(180000, 650000);
  }

  // Realistic Term: 180 (15y), 240 (20y), 360 (30y)
  const termMonths = pickRandom([180, 240, 360]);

  // Origination Date: between 2021-01-01 and 2025-06-01
  const origDaysAgo = randomInt(180, 1600);
  const originationDate = addDays(new Date('2026-02-01'), -origDaysAgo);
  const maturityDate = addMonths(originationDate, termMonths);

  // Current balance amortized down realistically
  const elapsedMonths = Math.min(Math.floor(origDaysAgo / 30.4), termMonths);
  const amortizationFraction = Math.max(0.05, 1 - (elapsedMonths / termMonths) * 0.7);
  let currentBalance = paymentConfig.status === 'PAID_OFF'
    ? 0.0
    : Math.round(originalPrincipal * amortizationFraction * 100) / 100;

  const interestRate = randomFloat(creditConfig.minRate, creditConfig.maxRate, 3);
  const dpd = randomInt(paymentConfig.dpdMin, paymentConfig.dpdMax);

  // Dates
  const lastPaymentDaysAgo = paymentConfig.status === 'CURRENT'
    ? randomInt(5, 32)
    : dpd + randomInt(1, 15);
  const lastPaymentDate = addDays(new Date('2026-02-01'), -lastPaymentDaysAgo);
  const lastUpdatedDaysAgo = randomInt(1, 45); // fresh by default
  const lastUpdatedAt = addDays(new Date('2026-02-01'), -lastUpdatedDaysAgo);

  // State selection
  const statePick = random() < 0.7 ? pickWeighted(STATE_WEIGHTS).state : pickRandom(VALID_STATES);

  return {
    loan_id: `LN-${String(index + 100001).padStart(7, '0')}`,
    borrower_id: `BW-${String(index + 50001).padStart(7, '0')}`,
    loan_type: loanType,
    origination_date: formatDateISO(originationDate),
    maturity_date: formatDateISO(maturityDate),
    original_principal: originalPrincipal,
    current_balance: currentBalance,
    interest_rate: interestRate,
    term_months: termMonths,
    borrower_state: statePick,
    loan_purpose: loanPurpose,
    credit_grade: creditConfig.grade,
    employment_length: pickRandom(EMPLOYMENT_LENGTHS),
    income_band: pickRandom(INCOME_BANDS),
    payment_status: paymentConfig.status,
    days_past_due: dpd,
    servicer_name: pickRandom(SERVICERS),
    last_payment_date: formatDateISO(lastPaymentDate),
    last_updated_at: formatDateISO(lastUpdatedAt),
    document_status: pickRandom(DOCUMENT_STATUSES),
    source_system: pickRandom(SOURCE_SYSTEMS),
  };
}

function runGeneration() {
  console.log('='.repeat(78));
  console.log('🚀 GENERATING SYNTHETIC LOAN DATASET WITH INJECTED ANOMALIES');
  console.log('='.repeat(78));

  const total = CONFIG.TOTAL_RECORDS;
  const records = [];
  for (let i = 0; i < total; i++) {
    records.push(generateBaseRecord(i));
  }

  // Tracking Injection Tallies
  const tallies = {
    missing_loan_id: 0,
    duplicate_loan_id: 0,
    duplicate_borrower_triplet: 0,
    invalid_date_format: 0,
    maturity_before_origination: 0,
    negative_principal: 0,
    balance_exceeds_principal: 0,
    unrealistic_interest_rate: 0,
    payment_status_dpd_mismatch: 0,
    missing_document_status: 0,
    stale_last_updated: 0,
    invalid_state_code: 0,
    suspicious_repeated_borrower: 0,
    closed_loan_positive_balance: 0,
  };

  // Helper to pick random unique indices from records
  let assignedIndices = new Set();
  function getUniqueIndices(count) {
    const list = [];
    while (list.length < count) {
      const idx = randomInt(0, total - 1);
      if (!assignedIndices.has(idx)) {
        assignedIndices.add(idx);
        list.push(idx);
      }
    }
    return list;
  }

  // 1. Missing loan_id
  const missingIdIndices = getUniqueIndices(CONFIG.ANOMALIES.MISSING_LOAN_ID);
  missingIdIndices.forEach(idx => {
    records[idx].loan_id = '';
    tallies.missing_loan_id++;
  });

  // 2. Duplicate loan_id
  const dupIdIndices = getUniqueIndices(CONFIG.ANOMALIES.DUPLICATE_LOAN_ID);
  dupIdIndices.forEach((targetIdx, i) => {
    // pick a donor index from clean range
    const donorIdx = (targetIdx + 100) % total;
    if (records[donorIdx].loan_id) {
      records[targetIdx].loan_id = records[donorIdx].loan_id;
      tallies.duplicate_loan_id++;
    }
  });

  // 3. Duplicate borrower + amount + origination_date triplets
  const dupTripletIndices = getUniqueIndices(CONFIG.ANOMALIES.DUPLICATE_BORROWER_TRIPLET);
  dupTripletIndices.forEach((targetIdx) => {
    const donorIdx = (targetIdx + 50) % total;
    records[targetIdx].borrower_id = records[donorIdx].borrower_id;
    records[targetIdx].original_principal = records[donorIdx].original_principal;
    records[targetIdx].origination_date = records[donorIdx].origination_date;
    tallies.duplicate_borrower_triplet++;
  });

  // 4. Invalid date formats
  const invalidDateIndices = getUniqueIndices(CONFIG.ANOMALIES.INVALID_DATE_FORMAT);
  const malformedDateStrings = [
    '2024-02-31', // Impossible day in Feb
    '13/45/2023', // Out of bounds month/day
    '2023.11.05', // Wrong delimiter
    'INVALID_DATE_VAL', // Text
    '0000-00-00', // Zero date
    '2024-06-31', // June has 30 days
  ];
  invalidDateIndices.forEach((idx, i) => {
    const malformed = malformedDateStrings[i % malformedDateStrings.length];
    if (i % 2 === 0) {
      records[idx].origination_date = malformed;
    } else {
      records[idx].last_payment_date = malformed;
    }
    tallies.invalid_date_format++;
  });

  // 5. Maturity before origination
  const maturityBeforeOrigIndices = getUniqueIndices(CONFIG.ANOMALIES.MATURITY_BEFORE_ORIGINATION);
  maturityBeforeOrigIndices.forEach(idx => {
    records[idx].origination_date = '2024-05-15';
    records[idx].maturity_date = '2021-08-01'; // 3 years before origination
    tallies.maturity_before_origination++;
  });

  // 6. Negative principal
  const negPrincipalIndices = getUniqueIndices(CONFIG.ANOMALIES.NEGATIVE_PRINCIPAL);
  negPrincipalIndices.forEach(idx => {
    records[idx].original_principal = -Math.abs(records[idx].original_principal);
    tallies.negative_principal++;
  });

  // 7. Current balance > original principal
  const balExceedsIndices = getUniqueIndices(CONFIG.ANOMALIES.BALANCE_EXCEEDS_PRINCIPAL);
  balExceedsIndices.forEach(idx => {
    records[idx].current_balance = Math.abs(records[idx].original_principal) + randomInt(25000, 150000);
    tallies.balance_exceeds_principal++;
  });

  // 8. Unrealistic interest rate
  const rateIndices = getUniqueIndices(CONFIG.ANOMALIES.UNREALISTIC_INTEREST_RATE);
  rateIndices.forEach((idx, i) => {
    if (i % 3 === 0) {
      records[idx].interest_rate = -1.75; // Negative rate
    } else if (i % 3 === 1) {
      records[idx].interest_rate = 88.5; // Predatory/usurious 88.5%
    } else {
      records[idx].interest_rate = 0.0; // Zero rate on commercial loan
    }
    tallies.unrealistic_interest_rate++;
  });

  // 9. Payment status inconsistent with days_past_due
  const statusMismatches = getUniqueIndices(CONFIG.ANOMALIES.PAYMENT_STATUS_DPD_MISMATCH);
  statusMismatches.forEach((idx, i) => {
    if (i % 2 === 0) {
      records[idx].payment_status = 'CURRENT';
      records[idx].days_past_due = randomInt(90, 180); // marked current but 90-180 DPD
    } else {
      records[idx].payment_status = 'LATE_90';
      records[idx].days_past_due = 0; // marked late 90 but 0 DPD
    }
    tallies.payment_status_dpd_mismatch++;
  });

  // 10. Missing document_status
  const missingDocIndices = getUniqueIndices(CONFIG.ANOMALIES.MISSING_DOCUMENT_STATUS);
  missingDocIndices.forEach(idx => {
    records[idx].document_status = '';
    tallies.missing_document_status++;
  });

  // 11. Stale last_updated_at (> 180 days old)
  const staleIndices = getUniqueIndices(CONFIG.ANOMALIES.STALE_LAST_UPDATED);
  staleIndices.forEach(idx => {
    const staleDays = randomInt(200, 850);
    const staleDate = addDays(new Date('2026-02-01'), -staleDays);
    records[idx].last_updated_at = formatDateISO(staleDate);
    tallies.stale_last_updated++;
  });

  // 12. Invalid US State Codes
  const invalidStateIndices = getUniqueIndices(CONFIG.ANOMALIES.INVALID_STATE_CODE);
  const badStates = ['ZZ', 'XX', '99', 'California', 'TX_NORTH', 'N/A', 'UK'];
  invalidStateIndices.forEach((idx, i) => {
    records[idx].borrower_state = badStates[i % badStates.length];
    tallies.invalid_state_code++;
  });

  // 13. Suspiciously repeated borrower records
  const repeatedBorrowerIndices = getUniqueIndices(CONFIG.ANOMALIES.SUSPICIOUS_REPEATED_BORROWER);
  repeatedBorrowerIndices.forEach((idx, i) => {
    const masterIdx = (idx + 15) % total;
    records[idx].borrower_id = records[masterIdx].borrower_id;
    records[idx].borrower_state = records[masterIdx].borrower_state;
    records[idx].income_band = records[masterIdx].income_band;
    records[idx].employment_length = records[masterIdx].employment_length;
    tallies.suspicious_repeated_borrower++;
  });

  // 14. Loans marked "PAID_OFF" / "CLOSED" with positive current balance
  const closedWithBalanceIndices = getUniqueIndices(CONFIG.ANOMALIES.CLOSED_LOAN_POSITIVE_BALANCE);
  closedWithBalanceIndices.forEach(idx => {
    records[idx].payment_status = 'PAID_OFF';
    records[idx].current_balance = randomFloat(15000, 320000, 2);
    records[idx].days_past_due = 0;
    tallies.closed_loan_positive_balance++;
  });

  // ===========================================================================
  // 5. WRITE OUT LOAN_TAPE.CSV
  // ===========================================================================
  if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
    fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
  }

  const tapeHeaders = [
    'loan_id', 'borrower_id', 'loan_type', 'origination_date', 'maturity_date',
    'original_principal', 'current_balance', 'interest_rate', 'term_months',
    'borrower_state', 'loan_purpose', 'credit_grade', 'employment_length',
    'income_band', 'payment_status', 'days_past_due', 'servicer_name',
    'last_payment_date', 'last_updated_at', 'document_status', 'source_system'
  ];

  const tapeCsvLines = [tapeHeaders.join(',')];
  records.forEach(r => {
    const row = tapeHeaders.map(h => escapeCsvValue(r[h])).join(',');
    tapeCsvLines.push(row);
  });

  const tapePath = path.join(CONFIG.OUTPUT_DIR, 'loan_tape.csv');
  fs.writeFileSync(tapePath, tapeCsvLines.join('\n'), 'utf8');
  console.log(`\n✅ Generated Primary Tape: ${tapePath} (${records.length} records)`);

  // ===========================================================================
  // 6. GENERATE SERVICER_UPDATE.CSV (~400 rows with conflicting updates)
  // ===========================================================================
  const servicerUpdateHeaders = [
    'loan_id', 'servicer_name', 'current_balance', 'payment_status',
    'days_past_due', 'last_payment_date', 'servicer_as_of_date', 'data_source'
  ];
  const servicerUpdateLines = [servicerUpdateHeaders.join(',')];

  let servicerDiscrepancyCount = 0;
  for (let i = 0; i < CONFIG.SERVICER_UPDATE_RECORDS; i++) {
    const baseRecord = records[i % records.length];
    const loanId = baseRecord.loan_id || `LN-FALLBACK-${i}`;

    let balance = baseRecord.current_balance;
    let paymentStatus = baseRecord.payment_status;
    let dpd = baseRecord.days_past_due;

    // Inject discrepancies on ~60% of update records to test reconciliation engine
    if (i % 2 === 0) {
      balance = Math.max(0, Math.round((balance + randomFloat(-15000, 25000)) * 100) / 100);
      if (random() > 0.5) {
        paymentStatus = paymentStatus === 'CURRENT' ? 'LATE_30' : 'CURRENT';
        dpd = paymentStatus === 'CURRENT' ? 0 : 35;
      }
      servicerDiscrepancyCount++;
    }

    const row = [
      escapeCsvValue(loanId),
      escapeCsvValue(baseRecord.servicer_name),
      escapeCsvValue(balance),
      escapeCsvValue(paymentStatus),
      escapeCsvValue(dpd),
      escapeCsvValue(formatDateISO(new Date('2026-02-15'))),
      escapeCsvValue(formatDateISO(new Date('2026-02-20'))),
      'SERVICER_PORTAL_API_FEED'
    ].join(',');
    servicerUpdateLines.push(row);
  }

  const servicerPath = path.join(CONFIG.OUTPUT_DIR, 'servicer_update.csv');
  fs.writeFileSync(servicerPath, servicerUpdateLines.join('\n'), 'utf8');
  console.log(`✅ Generated Servicer Feed: ${servicerPath} (${CONFIG.SERVICER_UPDATE_RECORDS} records, ${servicerDiscrepancyCount} conflicting values)`);

  // ===========================================================================
  // 7. GENERATE DOCUMENT_MANIFEST.CSV (with ~5% missing entries)
  // ===========================================================================
  const manifestHeaders = [
    'loan_id', 'document_status', 'promissory_note_vaulted',
    'deed_of_trust_recorded', 'title_policy_attached', 'last_custody_audit_date'
  ];
  const manifestLines = [manifestHeaders.join(',')];

  let manifestMissingCount = 0;
  let manifestIncludedCount = 0;

  records.forEach(r => {
    if (!r.loan_id) return; // skip records with missing loan_id in primary

    // Intentionally omit ~5% of loans from document manifest
    if (random() < CONFIG.DOCUMENT_MANIFEST_MISSING_RATE) {
      manifestMissingCount++;
      return;
    }

    manifestIncludedCount++;
    const row = [
      escapeCsvValue(r.loan_id),
      escapeCsvValue(r.document_status || 'MISSING_DOCS'),
      random() > 0.08 ? 'YES' : 'NO',
      random() > 0.05 ? 'YES' : 'NO',
      random() > 0.04 ? 'YES' : 'NO',
      formatDateISO(addDays(new Date('2026-02-01'), -randomInt(5, 120)))
    ].join(',');
    manifestLines.push(row);
  });

  const manifestPath = path.join(CONFIG.OUTPUT_DIR, 'document_manifest.csv');
  fs.writeFileSync(manifestPath, manifestLines.join('\n'), 'utf8');
  console.log(`✅ Generated Document Custody Manifest: ${manifestPath} (${manifestIncludedCount} records, ${manifestMissingCount} deliberately omitted)`);

  // ===========================================================================
  // 8. PRINT VERIFICATION SUMMARY TABLE
  // ===========================================================================
  console.log('\n' + '='.repeat(78));
  console.log('📊 INJECTED ANOMALY AUDIT SUMMARY');
  console.log('='.repeat(78));
  console.table([
    { 'Anomaly Description': 'Missing loan_id (Blank)', 'Config Target': CONFIG.ANOMALIES.MISSING_LOAN_ID, 'Injected Count': tallies.missing_loan_id, 'Severity': 'CRITICAL' },
    { 'Anomaly Description': 'Duplicate loan_id', 'Config Target': CONFIG.ANOMALIES.DUPLICATE_LOAN_ID, 'Injected Count': tallies.duplicate_loan_id, 'Severity': 'CRITICAL' },
    { 'Anomaly Description': 'Duplicate (Borrower + Amount + OrigDate)', 'Config Target': CONFIG.ANOMALIES.DUPLICATE_BORROWER_TRIPLET, 'Injected Count': tallies.duplicate_borrower_triplet, 'Severity': 'HIGH' },
    { 'Anomaly Description': 'Invalid Date Format / Bad Values', 'Config Target': CONFIG.ANOMALIES.INVALID_DATE_FORMAT, 'Injected Count': tallies.invalid_date_format, 'Severity': 'ERROR' },
    { 'Anomaly Description': 'Maturity Date Before Origination Date', 'Config Target': CONFIG.ANOMALIES.MATURITY_BEFORE_ORIGINATION, 'Injected Count': tallies.maturity_before_origination, 'Severity': 'CRITICAL' },
    { 'Anomaly Description': 'Negative Original Principal', 'Config Target': CONFIG.ANOMALIES.NEGATIVE_PRINCIPAL, 'Injected Count': tallies.negative_principal, 'Severity': 'CRITICAL' },
    { 'Anomaly Description': 'Current Balance > Original Principal', 'Config Target': CONFIG.ANOMALIES.BALANCE_EXCEEDS_PRINCIPAL, 'Injected Count': tallies.balance_exceeds_principal, 'Severity': 'HIGH' },
    { 'Anomaly Description': 'Unrealistic Interest Rate (<0% or >35%)', 'Config Target': CONFIG.ANOMALIES.UNREALISTIC_INTEREST_RATE, 'Injected Count': tallies.unrealistic_interest_rate, 'Severity': 'HIGH' },
    { 'Anomaly Description': 'Payment Status vs DPD Mismatch', 'Config Target': CONFIG.ANOMALIES.PAYMENT_STATUS_DPD_MISMATCH, 'Injected Count': tallies.payment_status_dpd_mismatch, 'Severity': 'HIGH' },
    { 'Anomaly Description': 'Missing Document Status (Empty)', 'Config Target': CONFIG.ANOMALIES.MISSING_DOCUMENT_STATUS, 'Injected Count': tallies.missing_document_status, 'Severity': 'MEDIUM' },
    { 'Anomaly Description': 'Stale Record (>180 Days Last Updated)', 'Config Target': CONFIG.ANOMALIES.STALE_LAST_UPDATED, 'Injected Count': tallies.stale_last_updated, 'Severity': 'WARNING' },
    { 'Anomaly Description': 'Invalid US State Code (e.g. ZZ, XX)', 'Config Target': CONFIG.ANOMALIES.INVALID_STATE_CODE, 'Injected Count': tallies.invalid_state_code, 'Severity': 'ERROR' },
    { 'Anomaly Description': 'Suspicious Repeated Borrower Identity', 'Config Target': CONFIG.ANOMALIES.SUSPICIOUS_REPEATED_BORROWER, 'Injected Count': tallies.suspicious_repeated_borrower, 'Severity': 'WARNING' },
    { 'Anomaly Description': 'Closed / Paid-Off Loan with Positive Balance', 'Config Target': CONFIG.ANOMALIES.CLOSED_LOAN_POSITIVE_BALANCE, 'Injected Count': tallies.closed_loan_positive_balance, 'Severity': 'CRITICAL' },
  ]);
  console.log('='.repeat(78));
  console.log('⚡ All datasets successfully generated and ready for ingestion pipeline.');
  console.log('='.repeat(78));
}

runGeneration();
