/**
 * AI Review Assistant Service (Module D)
 *
 * Wraps Anthropic Claude API to provide intelligent explanations,
 * suggested field-level corrections, and portfolio batch summaries.
 *
 * CRITICAL ARCHITECTURAL BOUNDARY:
 * - This service is strictly READ-AND-SUGGEST ONLY.
 * - Under NO circumstances does this file mutate NormalizedLoan or VerifiedLoan.
 * - Every invocation records an AIRecommendation row BEFORE returning to caller.
 */

const Anthropic = require('@anthropic-ai/sdk');
const prisma = require('../db');
const { logAudit } = require('../services/auditService');

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
const API_TIMEOUT_MS = 10000; // 10-second timeout boundary

/**
 * Instantiate Anthropic client if API key is present in environment.
 */
function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your_anthropic_api_key_here' || apiKey.trim() === '') {
    return null;
  }
  return new Anthropic({
    apiKey,
    timeout: API_TIMEOUT_MS,
  });
}

/**
 * Sanitizes and truncates loan attributes to prevent payload bloat.
 */
function sanitizeField(val, maxLen = 150) {
  if (val === null || val === undefined) return 'null';
  const str = String(val).trim();
  if (str.length > maxLen) {
    return str.substring(0, maxLen) + '...[truncated]';
  }
  return str;
}

function sanitizeLoanContext(loan) {
  if (!loan) return {};
  return {
    loan_id: sanitizeField(loan.loanIdentifier),
    borrower_id: sanitizeField(loan.borrowerId),
    borrower_name: sanitizeField(loan.borrowerName),
    loan_type: sanitizeField(loan.loanType),
    origination_date: sanitizeField(loan.originationDate ? new Date(loan.originationDate).toISOString().split('T')[0] : null),
    maturity_date: sanitizeField(loan.maturityDate ? new Date(loan.maturityDate).toISOString().split('T')[0] : null),
    original_principal: sanitizeField(loan.originalPrincipal),
    current_balance: sanitizeField(loan.currentBalance),
    interest_rate: sanitizeField(loan.interestRate),
    term_months: sanitizeField(loan.termMonths),
    borrower_state: sanitizeField(loan.borrowerState),
    loan_purpose: sanitizeField(loan.loanPurpose),
    credit_grade: sanitizeField(loan.creditGrade),
    payment_status: sanitizeField(loan.paymentStatus),
    days_past_due: sanitizeField(loan.daysPastDue),
    document_status: sanitizeField(loan.documentStatus),
    servicer_name: sanitizeField(loan.servicerName),
    last_updated_at: sanitizeField(loan.lastUpdatedAt ? new Date(loan.lastUpdatedAt).toISOString().split('T')[0] : null),
    unparsed_fields: sanitizeField(loan.rawUnparsedValues),
  };
}

/**
 * Records an AIRecommendation entry before returning output.
 */
async function recordRecommendation({
  target = 'exception',
  loanId = null,
  exceptionId = null,
  promptSent,
  modelName = DEFAULT_MODEL,
  response,
  suggestedPatch = null,
  reasoning = null,
  userId = 'system',
}) {
  const rec = await prisma.aIRecommendation.create({
    data: {
      target,
      loanId,
      exceptionId,
      promptSent,
      modelName,
      response: typeof response === 'string' ? response : JSON.stringify(response),
      suggestedPatch: suggestedPatch ? (typeof suggestedPatch === 'string' ? suggestedPatch : JSON.stringify(suggestedPatch)) : null,
      reasoning,
      acceptedByReviewer: null, // Explicitly starts NULL until human reviewer acts
    },
  });

  // Write audit log entry for AI suggestion generation
  await logAudit({
    actor: userId,
    actionType: 'AI_SUGGESTION_GENERATED',
    entityType: 'AIRecommendation',
    entityId: rec.id,
    details: {
      target,
      exceptionId,
      loanId,
      modelName,
      hasSuggestedPatch: Boolean(suggestedPatch),
    },
  });

  return rec;
}

/**
 * 1. explainFailure(exceptionId)
 * Provides a plain-language explanation of why this specific loan failed this rule.
 */
async function explainFailure(exceptionId, userId = 'system') {
  const exception = await prisma.exception.findUnique({
    where: { id: exceptionId },
    include: {
      rule: true,
      loan: {
        include: {
          rawLoanRecord: true,
        },
      },
    },
  });

  if (!exception) {
    throw new Error(`Exception with ID ${exceptionId} not found.`);
  }

  const sanitizedLoan = sanitizeLoanContext(exception.loan);
  const exceptionDetails = exception.details ? JSON.parse(exception.details) : {};

  const prompt = `You are an expert mortgage underwriting compliance copilot.
Explain in 2-3 concise sentences why the following loan record failed the validation rule.
Use the actual rule definition, rule failure reason, and actual loan field values provided below.

VALIDATION RULE:
- Rule Code: ${exception.rule.ruleCode}
- Rule Name: ${exception.rule.name}
- Category: ${exception.rule.category}
- Severity: ${exception.severity}
- Rule Description: ${exception.rule.description}

FAILURE DIAGNOSTIC:
${JSON.stringify(exceptionDetails, null, 2)}

LOAN RECORD CONTEXT:
${JSON.stringify(sanitizedLoan, null, 2)}

RAW CSV CONTENT:
${sanitizeField(exception.loan?.rawLoanRecord?.rawContent, 200)}

INSTRUCTIONS:
Provide a clear, human-readable explanation of why this failed, what the conflicting or invalid values are, and the regulatory/underwriting risk. Output plain text only.`;

  let explanationText = '';
  const client = getAnthropicClient();

  if (client) {
    try {
      const response = await client.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: 300,
        temperature: 0.1,
        messages: [{ role: 'user', content: prompt }],
      });
      explanationText = response.content[0].text.trim();
    } catch (apiErr) {
      console.warn(`[AI_ASSISTANT_WARN] Claude API call failed: ${apiErr.message}. Generating rule-based deterministic fallback.`);
      explanationText = generateFallbackExplanation(exception, exceptionDetails);
    }
  } else {
    explanationText = generateFallbackExplanation(exception, exceptionDetails);
  }

  // Persist AIRecommendation before returning
  const recommendation = await recordRecommendation({
    target: 'exception',
    loanId: exception.loanId,
    exceptionId: exception.id,
    promptSent: prompt,
    modelName: client ? DEFAULT_MODEL : 'rule-engine-fallback-v1',
    response: explanationText,
    reasoning: explanationText,
    userId,
  });

  return {
    recommendationId: recommendation.id,
    exceptionId: exception.id,
    ruleCode: exception.rule.ruleCode,
    ruleName: exception.rule.name,
    severity: exception.severity,
    explanation: explanationText,
    timestamp: recommendation.createdAt,
  };
}

/**
 * 2. suggestCorrection(exceptionId)
 * Returns a suggested corrected value with a confidence indicator and one-line justification.
 * DOES NOT mutate loan records.
 */
async function suggestCorrection(exceptionId, userId = 'system') {
  const exception = await prisma.exception.findUnique({
    where: { id: exceptionId },
    include: {
      rule: true,
      loan: {
        include: {
          rawLoanRecord: true,
        },
      },
    },
  });

  if (!exception) {
    throw new Error(`Exception with ID ${exceptionId} not found.`);
  }

  const sanitizedLoan = sanitizeLoanContext(exception.loan);
  const exceptionDetails = exception.details ? JSON.parse(exception.details) : {};

  const prompt = `You are an automated loan data verification copilot.
Analyze this validation exception and suggest an explicit field correction for the human underwriter to review.

VALIDATION RULE:
- Rule Code: ${exception.rule.ruleCode} (${exception.rule.name})
- Severity: ${exception.severity}
- Diagnostic: ${JSON.stringify(exceptionDetails)}

LOAN RECORD:
${JSON.stringify(sanitizedLoan, null, 2)}

RAW LINEAGE:
${sanitizeField(exception.loan?.rawLoanRecord?.rawContent, 200)}

INSTRUCTIONS:
Return a JSON object ONLY with these exact keys:
{
  "field": "<name of the field to correct in NormalizedLoan, e.g. currentBalance, paymentStatus, borrowerState, originationDate, interestRate>",
  "currentValue": "<current faulty value>",
  "suggestedValue": <typed suggested replacement value: string, number, or null>,
  "confidence": "<HIGH | MEDIUM | LOW>",
  "justification": "<one concise sentence explaining why this correction resolves the violation>"
}`;

  let correctionData = null;
  let rawResponseText = '';
  const client = getAnthropicClient();

  if (client) {
    try {
      const response = await client.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: 300,
        temperature: 0.1,
        messages: [{ role: 'user', content: prompt }],
      });
      rawResponseText = response.content[0].text.trim();
      // Extract JSON if wrapped in markdown code fence
      const jsonMatch = rawResponseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        correctionData = JSON.parse(jsonMatch[0]);
      }
    } catch (apiErr) {
      console.warn(`[AI_ASSISTANT_WARN] Claude API suggestion failed: ${apiErr.message}. Generating deterministic rule suggestion.`);
      correctionData = generateFallbackCorrection(exception, exceptionDetails);
      rawResponseText = JSON.stringify(correctionData);
    }
  } else {
    correctionData = generateFallbackCorrection(exception, exceptionDetails);
    rawResponseText = JSON.stringify(correctionData);
  }

  // Persist AIRecommendation before returning
  const recommendation = await recordRecommendation({
    target: 'exception',
    loanId: exception.loanId,
    exceptionId: exception.id,
    promptSent: prompt,
    modelName: client ? DEFAULT_MODEL : 'rule-engine-fallback-v1',
    response: rawResponseText,
    suggestedPatch: correctionData,
    reasoning: correctionData.justification,
    userId,
  });

  return {
    recommendationId: recommendation.id,
    exceptionId: exception.id,
    ruleCode: exception.rule.ruleCode,
    suggestion: correctionData,
    acceptedByReviewer: null, // explicitly un-reviewed
    timestamp: recommendation.createdAt,
  };
}

/**
 * 3. summarizeExceptionBatch(filterCriteria)
 * Generates a natural-language portfolio summary of open exceptions for dashboard overview.
 */
async function summarizeExceptionBatch(filterCriteria = {}, userId = 'system') {
  const where = {
    status: filterCriteria.status || 'OPEN',
  };
  if (filterCriteria.severity) where.severity = filterCriteria.severity;
  if (filterCriteria.ruleCode) where.rule = { ruleCode: filterCriteria.ruleCode };

  const exceptions = await prisma.exception.findMany({
    where,
    include: {
      rule: true,
    },
    take: 500,
  });

  const totalExceptions = exceptions.length;
  const severityBreakdown = {};
  const ruleBreakdown = {};

  for (const e of exceptions) {
    severityBreakdown[e.severity] = (severityBreakdown[e.severity] || 0) + 1;
    ruleBreakdown[e.rule.ruleCode] = (ruleBreakdown[e.rule.ruleCode] || 0) + 1;
  }

  const prompt = `You are a Chief Risk Officer AI summary generator for mortgage portfolio auditing.
Provide a 3-4 sentence high-level executive summary of this open exception batch for the underwriter dashboard.
Highlight the dominant defect categories, critical risks (such as negative balances or closed loans carrying balances), and recommended prioritization.

BATCH METRICS:
- Total Open Exceptions: ${totalExceptions}
- Severity Breakdown: ${JSON.stringify(severityBreakdown)}
- Top Rule Violations: ${JSON.stringify(ruleBreakdown)}

INSTRUCTIONS:
Write a concise, professional executive briefing in markdown format.`;

  let summaryText = '';
  const client = getAnthropicClient();

  if (client) {
    try {
      const response = await client.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: 400,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
      });
      summaryText = response.content[0].text.trim();
    } catch (apiErr) {
      console.warn(`[AI_ASSISTANT_WARN] Claude API summary failed: ${apiErr.message}`);
      summaryText = `Portfolio review indicates ${totalExceptions} active exceptions across ${Object.keys(ruleBreakdown).length} distinct rule types. Critical severity items (${severityBreakdown.CRITICAL || 0}) require immediate human adjudication, particularly relating to principal boundary limits and terminal status discrepancies.`;
    }
  } else {
    summaryText = `Portfolio review indicates ${totalExceptions} active exceptions across ${Object.keys(ruleBreakdown).length} distinct rule types. Critical severity items (${severityBreakdown.CRITICAL || 0}) require immediate human adjudication, particularly relating to principal boundary limits and terminal status discrepancies.`;
  }

  // Persist AIRecommendation before returning
  const recommendation = await recordRecommendation({
    target: 'batch_summary',
    loanId: null,
    exceptionId: null,
    promptSent: prompt,
    modelName: client ? DEFAULT_MODEL : 'rule-engine-fallback-v1',
    response: summaryText,
    reasoning: summaryText,
    userId,
  });

  return {
    recommendationId: recommendation.id,
    totalOpenExceptions: totalExceptions,
    severityBreakdown,
    ruleBreakdown,
    summary: summaryText,
    timestamp: recommendation.createdAt,
  };
}

// =============================================================================
// DETERMINISTIC FALLBACK GENERATORS (Ensures 100% uptime if offline/no API key)
// =============================================================================

const STATE_NAME_MAP = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
  'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
  'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
  'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
  'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
  'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
  'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
  'district of columbia': 'DC', 'dc': 'DC', 'puerto rico': 'PR',
  'calif': 'CA', 'calif.': 'CA', 'tex': 'TX', 'tex.': 'TX', 'penn': 'PA', 'penna': 'PA',
  'fla': 'FL', 'fla.': 'FL', 'ill': 'IL', 'ill.': 'IL', 'wash': 'WA', 'wash.': 'WA',
  'mass': 'MA', 'mass.': 'MA', 'conn': 'CT', 'conn.': 'CT', 'ariz': 'AZ', 'ariz.': 'AZ',
  'mich': 'MI', 'mich.': 'MI', 'minn': 'MN', 'minn.': 'MN', 'colo': 'CO', 'colo.': 'CO',
};

function generateFallbackExplanation(exception, details) {
  const code = exception.rule?.ruleCode;
  const loan = exception.loan;

  switch (code) {
    case 'RULE_REQUIRED_FIELDS': {
      const missing = details?.missingFields || details?.details?.missingFields || [];
      const missingList = missing.length > 0 ? missing.join(', ') : 'core loan attributes';
      return `Missing mandatory loan attribute(s): [${missingList}]. Core metadata must be fully populated before asset pooling.`;
    }
    case 'RULE_VALID_DATES': {
      const invalid = details?.invalidFields || details?.details?.invalidFields || [];
      const invalidList = invalid.length > 0 ? invalid.join(', ') : 'calendar date fields';
      return `Invalid calendar date format detected for [${invalidList}]. Dates must strictly conform to ISO 8601 calendar bounds (YYYY-MM-DD).`;
    }
    case 'RULE_MATURITY_AFTER_ORIGINATION': {
      const origStr = loan?.originationDate ? new Date(loan.originationDate).toISOString().split('T')[0] : 'N/A';
      const matStr = loan?.maturityDate ? new Date(loan.maturityDate).toISOString().split('T')[0] : 'N/A';
      return `Maturity date (${matStr}) is chronologically on or before origination date (${origStr}). In amortizing credit facilities, maturity must strictly succeed origination by the amortization term.`;
    }
    case 'RULE_NON_NEGATIVE_PRINCIPAL':
      return `Loan ${loan?.loanIdentifier || ''} carries a negative balance/principal value (Original: $${loan?.originalPrincipal?.toLocaleString() || '0'}, Balance: $${loan?.currentBalance?.toLocaleString() || '0'}). Principal amounts must represent positive disbursed capital.`;
    case 'RULE_BALANCE_LE_PRINCIPAL':
      return `Current outstanding balance ($${loan?.currentBalance?.toLocaleString() || '0'}) exceeds original disbursed principal ($${loan?.originalPrincipal?.toLocaleString() || '0'}). Standard amortizing loans cannot increase balance without negative amortization terms.`;
    case 'RULE_INTEREST_RATE_RANGE':
      return `The recorded interest rate of ${loan?.interestRate}% violates statutory bounds (0.50% - 35.00%) and acceptable underwriting yield parameters.`;
    case 'RULE_VALID_PAYMENT_STATUS':
      return `Payment status '${loan?.paymentStatus}' is not a standardized servicing enumeration (CURRENT, LATE_30, LATE_60, LATE_90, DEFAULT, PAID_OFF).`;
    case 'RULE_PAYMENT_STATUS_DPD_CONSISTENCY':
      return `Servicing status '${loan?.paymentStatus}' contradicts the recorded ${loan?.daysPastDue} days past due (DPD). A status of '${loan?.paymentStatus}' requires alignment with standard delinquency buckets.`;
    case 'RULE_DUPLICATE_LOAN_ID': {
      const collisionDetail = details?.details?.reason || details?.message || 'Identical identifier appears multiple times in batch or portfolio registry';
      return `Primary loan identifier '${loan?.loanIdentifier}' collision detected: ${collisionDetail}. Primary identifiers must be globally unique across the portfolio to prevent asset double-pledging.`;
    }
    case 'RULE_DUPLICATE_BORROWER_TRIPLET': {
      const origStr = loan?.originationDate ? new Date(loan.originationDate).toISOString().split('T')[0] : 'N/A';
      return `Borrower origination triplet collision: Borrower '${loan?.borrowerId || loan?.borrowerName || 'N/A'}' with principal $${loan?.originalPrincipal?.toLocaleString() || '0'} originated on ${origStr} appears multiple times in the tape, indicating potential duplicate loan booking.`;
    }
    case 'RULE_REQUIRED_DOCUMENT_STATUS':
      return `Document custody status is missing or unassigned ('${loan?.documentStatus || 'NULL'}'). Mortgage compliance requires verified custody tracking (VERIFIED, PENDING, REJECTED, EXPIRED).`;
    case 'RULE_STALE_RECORD': {
      const lastUp = loan?.lastUpdatedAt ? new Date(loan.lastUpdatedAt).toISOString().split('T')[0] : 'N/A';
      return `Tape record last updated on ${lastUp} exceeds the maximum allowable freshness threshold of 180 days. Outdated servicing telemetry increases portfolio valuation risk.`;
    }
    case 'RULE_VALID_STATE_CODE':
      return `Borrower state code '${loan?.borrowerState}' is not a recognized 2-letter US postal jurisdiction code.`;
    case 'RULE_CLOSED_LOAN_POSITIVE_BALANCE':
      return `Loan is marked '${loan?.paymentStatus}' (terminal status) but carries an active balance of $${loan?.currentBalance?.toLocaleString() || '0'}. Closed/paid-off loans must have a zero ledger balance.`;
    case 'RULE_CROSS_SOURCE_CONFLICT': {
      const conflictList = details?.details?.discrepancies?.join(', ') || details?.discrepancies?.join(', ') || details?.message || 'Conflicting servicing records';
      return `Discrepancy detected between primary tape and external servicer feed: ${conflictList}. Tape records must reconcile against servicer ledger.`;
    }
    default:
      return details?.message || `Loan ${loan?.loanIdentifier || ''} failed compliance check for rule ${exception.rule?.name || code}.`;
  }
}

function generateFallbackCorrection(exception, details) {
  const code = exception.rule?.ruleCode;
  const loan = exception.loan;

  switch (code) {
    case 'RULE_REQUIRED_FIELDS': {
      const missing = details?.missingFields || details?.details?.missingFields || [];
      const primaryMissing = missing[0] || 'loan_id';
      const fieldMap = {
        loan_id: 'loanIdentifier',
        borrower_id: 'borrowerId',
        original_principal: 'originalPrincipal',
        interest_rate: 'interestRate',
        loan_type: 'loanType',
        term_months: 'termMonths',
      };
      const targetField = fieldMap[primaryMissing] || primaryMissing;
      return {
        field: targetField,
        currentValue: loan?.[targetField] || null,
        suggestedValue: null,
        confidence: 'LOW',
        justification: `Populate missing mandatory attribute '${targetField}' from verified promissory note and origination schedule.`,
      };
    }
    case 'RULE_VALID_DATES': {
      const invalid = details?.invalidFields || details?.details?.invalidFields || [];
      const primaryInvalid = invalid[0] || 'origination_date';
      const targetField = primaryInvalid === 'maturity_date' ? 'maturityDate' : 'originationDate';
      return {
        field: targetField,
        currentValue: loan?.[targetField] ? new Date(loan[targetField]).toISOString().split('T')[0] : null,
        suggestedValue: null,
        confidence: 'LOW',
        justification: `Verify and enter valid ISO calendar date (YYYY-MM-DD) for '${targetField}' from closing disclosure.`,
      };
    }
    case 'RULE_MATURITY_AFTER_ORIGINATION': {
      if (loan?.originationDate && loan?.termMonths) {
        const d = new Date(loan.originationDate);
        d.setMonth(d.getMonth() + Number(loan.termMonths));
        const suggestedMaturity = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : null;
        if (suggestedMaturity) {
          return {
            field: 'maturityDate',
            currentValue: loan?.maturityDate ? new Date(loan.maturityDate).toISOString().split('T')[0] : null,
            suggestedValue: suggestedMaturity,
            confidence: 'HIGH',
            justification: `Recompute maturity date by adding loan term (${loan.termMonths} months) to origination date.`,
          };
        }
      }
      return {
        field: 'maturityDate',
        currentValue: loan?.maturityDate ? new Date(loan.maturityDate).toISOString().split('T')[0] : null,
        suggestedValue: null,
        confidence: 'MEDIUM',
        justification: 'Correct maturity date to succeed origination date in accordance with the credit agreement schedule.',
      };
    }
    case 'RULE_NON_NEGATIVE_PRINCIPAL': {
      const isPrincipalNeg = loan?.originalPrincipal !== null && loan?.originalPrincipal < 0;
      const field = isPrincipalNeg ? 'originalPrincipal' : 'currentBalance';
      const currentVal = loan?.[field];
      return {
        field,
        currentValue: currentVal,
        suggestedValue: currentVal ? Math.abs(currentVal) : 0,
        confidence: 'HIGH',
        justification: `Invert negative sign to restore positive ${field === 'originalPrincipal' ? 'principal' : 'balance'} amount indicated by origination tape.`,
      };
    }
    case 'RULE_BALANCE_LE_PRINCIPAL':
      return {
        field: 'currentBalance',
        currentValue: loan?.currentBalance,
        suggestedValue: loan?.originalPrincipal || 0,
        confidence: 'MEDIUM',
        justification: 'Cap current balance at original disbursed principal pending amortized schedule audit.',
      };
    case 'RULE_INTEREST_RATE_RANGE': {
      if (loan?.interestRate !== null && loan?.interestRate < 0) {
        return {
          field: 'interestRate',
          currentValue: loan?.interestRate,
          suggestedValue: Math.abs(loan.interestRate),
          confidence: 'HIGH',
          justification: 'Invert negative sign to restore positive statutory note interest rate.',
        };
      }
      if (loan?.interestRate !== null && loan?.interestRate > 35) {
        const scaledRate = Number((loan.interestRate / 100).toFixed(4));
        if (scaledRate >= 0.5 && scaledRate <= 35) {
          return {
            field: 'interestRate',
            currentValue: loan?.interestRate,
            suggestedValue: scaledRate,
            confidence: 'MEDIUM',
            justification: `Rescale interest rate entered in basis points (${loan.interestRate} bps -> ${scaledRate}%).`,
          };
        }
      }
      return {
        field: 'interestRate',
        currentValue: loan?.interestRate,
        suggestedValue: 6.5,
        confidence: 'LOW',
        justification: 'Adjust interest rate to standard conforming benchmark pending note inspection.',
      };
    }
    case 'RULE_VALID_PAYMENT_STATUS': {
      const statusAliases = {
        'PERFORMING': 'CURRENT',
        'ACTIVE': 'CURRENT',
        'DELINQUENT_30': 'LATE_30',
        '30_DAYS': 'LATE_30',
        'DELINQUENT_60': 'LATE_60',
        '60_DAYS': 'LATE_60',
        'DELINQUENT_90': 'LATE_90',
        '90_DAYS': 'LATE_90',
        'CHARGED_OFF': 'DEFAULT',
        'DEFAULTED': 'DEFAULT',
        'CLOSED': 'PAID_OFF',
        'SETTLED': 'PAID_OFF',
      };
      const rawStatus = String(loan?.paymentStatus || '').trim().toUpperCase();
      const mappedStatus = statusAliases[rawStatus];
      if (mappedStatus) {
        return {
          field: 'paymentStatus',
          currentValue: loan?.paymentStatus,
          suggestedValue: mappedStatus,
          confidence: 'HIGH',
          justification: `Standardize non-standard status string '${loan?.paymentStatus}' to canonical status '${mappedStatus}'.`,
        };
      }
      return {
        field: 'paymentStatus',
        currentValue: loan?.paymentStatus,
        suggestedValue: 'CURRENT',
        confidence: 'LOW',
        justification: 'Map unknown payment status to CURRENT pending servicer confirmation.',
      };
    }
    case 'RULE_PAYMENT_STATUS_DPD_CONSISTENCY':
      if (loan?.paymentStatus === 'CURRENT' && (loan?.daysPastDue || 0) >= 30) {
        const suggested = loan.daysPastDue >= 90 ? 'LATE_90' : loan.daysPastDue >= 60 ? 'LATE_60' : 'LATE_30';
        return {
          field: 'paymentStatus',
          currentValue: loan?.paymentStatus,
          suggestedValue: suggested,
          confidence: 'HIGH',
          justification: `Update status to '${suggested}' to match the recorded ${loan.daysPastDue} days past due delinquency window.`,
        };
      }
      return {
        field: 'daysPastDue',
        currentValue: loan?.daysPastDue,
        suggestedValue: 0,
        confidence: 'MEDIUM',
        justification: 'Reset days past due to 0 to align with CURRENT servicing status.',
      };
    case 'RULE_DUPLICATE_LOAN_ID':
      return {
        field: 'status',
        currentValue: loan?.status,
        suggestedValue: 'REJECTED',
        confidence: 'HIGH',
        justification: `Reject duplicate tape record for '${loan?.loanIdentifier}' to eliminate asset double-counting and preserve single-source portfolio registry.`,
      };
    case 'RULE_DUPLICATE_BORROWER_TRIPLET':
      return {
        field: 'status',
        currentValue: loan?.status,
        suggestedValue: 'REJECTED',
        confidence: 'HIGH',
        justification: 'Reject duplicate loan booking sharing identical borrower ID, principal amount, and origination date.',
      };
    case 'RULE_REQUIRED_DOCUMENT_STATUS':
      return {
        field: 'documentStatus',
        currentValue: loan?.documentStatus,
        suggestedValue: 'PENDING',
        confidence: 'HIGH',
        justification: 'Assign custody status PENDING to initiate document trailing tracking with custodian.',
      };
    case 'RULE_STALE_RECORD':
      return {
        field: 'lastUpdatedAt',
        currentValue: loan?.lastUpdatedAt ? new Date(loan.lastUpdatedAt).toISOString().split('T')[0] : null,
        suggestedValue: new Date().toISOString().split('T')[0],
        confidence: 'MEDIUM',
        justification: 'Update record timestamp upon receiving fresh monthly servicing feed reconciliation.',
      };
    case 'RULE_VALID_STATE_CODE': {
      const rawState = String(loan?.borrowerState || '').trim().toLowerCase();
      const mappedCode = STATE_NAME_MAP[rawState];
      if (mappedCode) {
        return {
          field: 'borrowerState',
          currentValue: loan?.borrowerState,
          suggestedValue: mappedCode,
          confidence: 'HIGH',
          justification: `Standardize recognized state name '${loan?.borrowerState}' to official 2-letter postal abbreviation '${mappedCode}'.`,
        };
      }
      return {
        field: 'borrowerState',
        currentValue: loan?.borrowerState,
        suggestedValue: null,
        confidence: 'LOW',
        justification: `State input '${loan?.borrowerState}' cannot be unambiguously mapped. Underwriter must verify borrower jurisdiction from origination documents.`,
      };
    }
    case 'RULE_CLOSED_LOAN_POSITIVE_BALANCE':
      return {
        field: 'currentBalance',
        currentValue: loan?.currentBalance,
        suggestedValue: 0.0,
        confidence: 'HIGH',
        justification: 'Zero out current balance to align with verified PAID_OFF / CLOSED terminal status.',
      };
    case 'RULE_CROSS_SOURCE_CONFLICT': {
      const servicerBal = details?.details?.servicer?.current_balance ?? details?.servicer?.current_balance;
      if (servicerBal !== undefined && servicerBal !== null) {
        return {
          field: 'currentBalance',
          currentValue: loan?.currentBalance,
          suggestedValue: parseFloat(servicerBal),
          confidence: 'MEDIUM',
          justification: 'Adopt latest reconciled balance from verified external servicer feed.',
        };
      }
      return {
        field: 'status',
        currentValue: loan?.status,
        suggestedValue: 'IN_REVIEW',
        confidence: 'MEDIUM',
        justification: 'Hold loan in review pending servicer discrepancy investigation.',
      };
    }
    default:
      return {
        field: 'status',
        currentValue: loan?.status,
        suggestedValue: 'IN_REVIEW',
        confidence: 'LOW',
        justification: 'Manual underwriter review required to verify supporting loan documents.',
      };
  }
}

/**
 * 4. generateRuleFromNaturalLanguage(description, userId)
 * Translates a natural language validation request into a structured JSON configuration.
 */
async function generateRuleFromNaturalLanguage(description, userId = 'system') {
  if (!description || description.trim() === '') {
    throw new Error('Description is required for rule generation.');
  }

  const prompt = `You are a mortgage compliance engineer. Translate the following natural language validation rule request into a structured JSON configuration for our config-driven loan validation engine:

NATURAL LANGUAGE REQUEST:
"${description}"

Return a JSON object containing the following keys (and nothing else, no markdown fences, no prefix, no suffix):
- ruleCode: unique uppercase snake_case identifier starting with RULE_ (e.g. RULE_INTEREST_RATE_LE_15)
- name: clear Title Case name for the rule (e.g. Interest Rate Max Threshold 15 Percent)
- category: one of: DATA_INTEGRITY, UNDERWRITING, COMPLIANCE, ELIGIBILITY
- severity: one of: CRITICAL, HIGH, MEDIUM, LOW, WARNING
- ruleType: one of: RANGE, FORMAT, COMPARISON, REQUIRED_FIELD, CROSS_FIELD
- description: concise user-friendly description of what the rule does
- parameters: JSON object with threshold values or bounds (e.g. { "maxInterestRate": 15.0 })
- mockTestCase: JSON object representing a mock NormalizedLoan that would FAIL this rule (e.g. { "interestRate": 16.5 })`;

  let ruleJson = null;
  const client = getAnthropicClient();

  if (client) {
    try {
      const response = await client.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: 600,
        temperature: 0.1,
        messages: [{ role: 'user', content: prompt }],
      });
      const text = response.content[0].text.trim();
      ruleJson = JSON.parse(text);
    } catch (apiErr) {
      console.warn(`[AI_ASSISTANT_WARN] Claude API call failed: ${apiErr.message}. Generating rule-based deterministic fallback.`);
      ruleJson = generateFallbackRule(description);
    }
  } else {
    ruleJson = generateFallbackRule(description);
  }

  // Persist AIRecommendation before returning
  const recommendation = await recordRecommendation({
    target: 'loan',
    promptSent: prompt,
    modelName: client ? DEFAULT_MODEL : 'rule-engine-fallback-v1',
    response: JSON.stringify(ruleJson, null, 2),
    reasoning: `Auto-generated structured rule config from description: "${description}"`,
    userId,
  });

  return {
    recommendationId: recommendation.id,
    rule: ruleJson,
    timestamp: recommendation.createdAt,
  };
}

/**
 * Fallback generator for rule translation when AI is disabled.
 */
function generateFallbackRule(description) {
  const desc = description.toLowerCase();
  let ruleCode = 'RULE_CUSTOM_NL_VALIDATION';
  let name = 'Custom Natural Language Rule';
  let category = 'UNDERWRITING';
  let severity = 'HIGH';
  let ruleType = 'RANGE';
  let parameters = {};
  let mockTestCase = {};

  if (desc.includes('interest rate') || desc.includes('rate')) {
    const match = desc.match(/(\d+(?:\.\d+)?)\s*%/);
    const limit = match ? parseFloat(match[1]) : 15.0;
    ruleCode = `RULE_INTEREST_RATE_LIMIT_${Math.round(limit)}`;
    name = `Interest Rate Max Threshold ${limit} Percent`;
    category = 'UNDERWRITING';
    severity = 'HIGH';
    ruleType = 'RANGE';
    parameters = { maxInterestRate: limit };
    mockTestCase = { interestRate: limit + 2.5 };
  } else if (desc.includes('principal') || desc.includes('balance') || desc.includes('principal balance')) {
    const match = desc.match(/(?:greater|more|above|exceed)\s*(?:than)?\s*\$?(\d+(?:\.\d+)?)/) || desc.match(/\$?(\d+(?:\.\d+)?)/);
    const limit = match ? parseFloat(match[1]) : 100000;
    ruleCode = `RULE_MAX_PRINCIPAL_LIMIT_${Math.round(limit / 1000)}`;
    name = `Maximum Loan Principal Limit $${limit}`;
    category = 'UNDERWRITING';
    severity = 'HIGH';
    ruleType = 'RANGE';
    parameters = { maxPrincipal: limit };
    mockTestCase = { originalPrincipal: limit + 50000 };
  } else if (desc.includes('state') || desc.includes('borrower state')) {
    ruleCode = 'RULE_RESTRICTED_BORROWER_STATES';
    name = 'Restricted Borrower State Validation';
    category = 'ELIGIBILITY';
    severity = 'MEDIUM';
    ruleType = 'COMPARISON';
    parameters = { allowedStates: ['NY', 'CA', 'TX', 'FL'] };
    mockTestCase = { borrowerState: 'HI' };
  } else if (desc.includes('document') || desc.includes('missing') || desc.includes('require')) {
    ruleCode = 'RULE_REQUIRED_UNDERWRITING_DOCUMENTS';
    name = 'Required Underwriting Document Validation';
    category = 'COMPLIANCE';
    severity = 'CRITICAL';
    ruleType = 'REQUIRED_FIELD';
    parameters = { requiredDocumentStatus: 'APPROVED' };
    mockTestCase = { documentStatus: 'MISSING' };
  } else {
    // General default fallback
    parameters = { limit: 100 };
    mockTestCase = { testValue: 120 };
  }

  return {
    ruleCode,
    name,
    category,
    severity,
    ruleType,
    description: `Auto-generated validation rule from request: "${description}"`,
    parameters,
    mockTestCase,
  };
}

module.exports = {
  explainFailure,
  suggestCorrection,
  summarizeExceptionBatch,
  recordRecommendation,
  generateRuleFromNaturalLanguage,
};

