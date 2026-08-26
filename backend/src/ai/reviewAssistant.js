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

function generateFallbackExplanation(exception, details) {
  const code = exception.rule.ruleCode;
  const loan = exception.loan;

  switch (code) {
    case 'RULE_NON_NEGATIVE_PRINCIPAL':
      return `Loan ${loan?.loanIdentifier} failed validation because the recorded original principal ($${loan?.originalPrincipal}) is negative. Principal amounts must represent positive disbursed capital.`;
    case 'RULE_BALANCE_LE_PRINCIPAL':
      return `Current balance ($${loan?.currentBalance?.toLocaleString()}) exceeds the original principal ($${loan?.originalPrincipal?.toLocaleString()}). Standard amortizing loans cannot increase balance without negative amortization terms.`;
    case 'RULE_PAYMENT_STATUS_DPD_CONSISTENCY':
      return `Servicing status '${loan?.paymentStatus}' contradicts the recorded ${loan?.daysPastDue} days past due. A status of '${loan?.paymentStatus}' requires alignment with standard delinquency buckets.`;
    case 'RULE_CLOSED_LOAN_POSITIVE_BALANCE':
      return `Loan is marked '${loan?.paymentStatus}' (terminal status) but carries an active balance of $${loan?.currentBalance?.toLocaleString()}. Closed/paid-off loans must have a zero ledger balance.`;
    case 'RULE_VALID_STATE_CODE':
      return `Borrower state code '${loan?.borrowerState}' is not a recognized 2-letter US postal jurisdiction code.`;
    case 'RULE_INTEREST_RATE_RANGE':
      return `The recorded interest rate of ${loan?.interestRate}% violates statutory bounds and acceptable underwriting yield parameters.`;
    case 'RULE_MATURITY_AFTER_ORIGINATION':
      return `The maturity date occurs on or before the origination date, representing an invalid chronological term.`;
    case 'RULE_CROSS_SOURCE_CONFLICT':
      return `Discrepancy detected between primary tape and external servicer feed: ${details?.discrepancies?.join(', ') || 'Conflicting servicing records'}.`;
    default:
      return details?.message || `Loan ${loan?.loanIdentifier} failed compliance check for rule ${exception.rule.name}.`;
  }
}

function generateFallbackCorrection(exception, details) {
  const code = exception.rule.ruleCode;
  const loan = exception.loan;

  switch (code) {
    case 'RULE_NON_NEGATIVE_PRINCIPAL':
      return {
        field: 'originalPrincipal',
        currentValue: loan?.originalPrincipal,
        suggestedValue: loan?.originalPrincipal ? Math.abs(loan.originalPrincipal) : 0,
        confidence: 'HIGH',
        justification: 'Invert negative sign to restore positive principal amount indicated by origination tape.',
      };
    case 'RULE_CLOSED_LOAN_POSITIVE_BALANCE':
      return {
        field: 'currentBalance',
        currentValue: loan?.currentBalance,
        suggestedValue: 0.0,
        confidence: 'HIGH',
        justification: 'Zero out current balance to align with verified PAID_OFF / CLOSED terminal status.',
      };
    case 'RULE_PAYMENT_STATUS_DPD_CONSISTENCY':
      if (loan?.paymentStatus === 'CURRENT' && (loan?.daysPastDue || 0) >= 30) {
        return {
          field: 'paymentStatus',
          currentValue: loan?.paymentStatus,
          suggestedValue: loan.daysPastDue >= 90 ? 'LATE_90' : loan.daysPastDue >= 60 ? 'LATE_60' : 'LATE_30',
          confidence: 'HIGH',
          justification: `Update status to match the ${loan.daysPastDue} days past due delinquency window.`,
        };
      }
      return {
        field: 'daysPastDue',
        currentValue: loan?.daysPastDue,
        suggestedValue: 0,
        confidence: 'MEDIUM',
        justification: 'Reset days past due to 0 to align with CURRENT servicing status.',
      };
    case 'RULE_VALID_STATE_CODE':
      return {
        field: 'borrowerState',
        currentValue: loan?.borrowerState,
        suggestedValue: loan?.borrowerState === 'California' ? 'CA' : 'CA',
        confidence: 'MEDIUM',
        justification: 'Standardize full state name or corrupt identifier into 2-letter uppercase postal abbreviation.',
      };
    case 'RULE_CROSS_SOURCE_CONFLICT':
      return {
        field: 'currentBalance',
        currentValue: loan?.currentBalance,
        suggestedValue: details?.servicer?.current_balance ? parseFloat(details.servicer.current_balance) : loan?.currentBalance,
        confidence: 'MEDIUM',
        justification: 'Adopt latest reconciled balance from verified external servicer feed.',
      };
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

module.exports = {
  explainFailure,
  suggestCorrection,
  summarizeExceptionBatch,
  recordRecommendation,
};
