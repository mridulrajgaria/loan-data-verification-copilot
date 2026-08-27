import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import {
  CheckCircle2,
  XCircle,
  Edit3,
  Search,
  Loader2,
  UserCheck,
  BrainCircuit,
  Send,
  ExternalLink,
  ShieldAlert,
  Info,
} from 'lucide-react';

export default function ReviewerDashboard({ onSelectLoan, onOpenAudit, searchQuery = '' }) {
  // Filters & Search
  const [severityFilter, setSeverityFilter] = useState('');
  const [ruleFilter, setRuleFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState(searchQuery);

  // Exception list state
  const [exceptions, setExceptions] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState(null);

  // Selected Exception & Loan Detail
  const [selectedExceptionId, setSelectedExceptionId] = useState(null);
  const [exceptionDetail, setExceptionDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState(null);

  // AI Assistant State (Strictly Advisory Proposal Layer)
  const [aiExplanation, setAiExplanation] = useState(null);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [loadingAiExplain, setLoadingAiExplain] = useState(false);
  const [loadingAiSuggest, setLoadingAiSuggest] = useState(false);
  const [aiError, setAiError] = useState(null);

  // Human Reviewer Decision State (Mutation Layer)
  const [decisionType, setDecisionType] = useState('approved'); // "approved" | "rejected" | "corrected"
  const [reviewerNote, setReviewerNote] = useState('');
  const [editedFieldsJson, setEditedFieldsJson] = useState('{\n  "currentBalance": 0\n}');
  const [appliedAiRecId, setAppliedAiRecId] = useState(null);
  const [submittingDecision, setSubmittingDecision] = useState(false);
  const [decisionSuccess, setDecisionSuccess] = useState(null);
  const [decisionError, setDecisionError] = useState(null);

  // Sync prop searchQuery
  useEffect(() => {
    if (searchQuery !== undefined) {
      setSearchTerm(searchQuery);
    }
  }, [searchQuery]);

  // Fetch Exception Queue
  const fetchExceptionList = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const params = { status: 'OPEN', limit: 100 };
      if (severityFilter) params.severity = severityFilter;
      if (ruleFilter) params.ruleCode = ruleFilter;
      const res = await api.getExceptions(params);
      const items = res.data?.items || [];

      // Filter locally for search term
      const filtered = searchTerm
        ? items.filter(
            (e) =>
              e.loan?.loanIdentifier?.toLowerCase().includes(searchTerm.toLowerCase()) ||
              e.loan?.borrowerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
              e.rule?.name?.toLowerCase().includes(searchTerm.toLowerCase())
          )
        : items;

      setExceptions(filtered);
      if (filtered.length > 0 && (!selectedExceptionId || !filtered.some((e) => e.id === selectedExceptionId))) {
        setSelectedExceptionId(filtered[0].id);
      }
    } catch (err) {
      setListError(err.message || 'Failed to fetch active exception queue.');
    } finally {
      setLoadingList(false);
    }
  }, [severityFilter, ruleFilter, searchTerm, selectedExceptionId]);

  useEffect(() => {
    fetchExceptionList();
  }, [fetchExceptionList]);

  // Fetch Single Exception Details when selected
  useEffect(() => {
    if (!selectedExceptionId) {
      setExceptionDetail(null);
      return;
    }

    setLoadingDetail(true);
    setDetailError(null);
    setAiExplanation(null);
    setAiSuggestion(null);
    setAiError(null);
    setDecisionSuccess(null);
    setDecisionError(null);
    setAppliedAiRecId(null);

    api.getExceptionDetail(selectedExceptionId)
      .then((res) => {
        setExceptionDetail(res.data);
        // Preload any stored AI recommendations
        if (res.data?.aiRecommendations?.length > 0) {
          const latest = res.data.aiRecommendations[0];
          if (latest.suggestedPatch) {
            try {
              const parsedPatch = JSON.parse(latest.suggestedPatch);
              setAiSuggestion({
                recommendationId: latest.id,
                suggestion: parsedPatch,
                timestamp: latest.createdAt,
                modelName: latest.modelName,
              });
              setEditedFieldsJson(JSON.stringify({ [parsedPatch.field]: parsedPatch.suggestedValue }, null, 2));
            } catch {}
          }
          if (latest.reasoning) {
            setAiExplanation({
              recommendationId: latest.id,
              explanation: latest.reasoning,
              timestamp: latest.createdAt,
              modelName: latest.modelName,
            });
          }
        }
      })
      .catch((err) => setDetailError(err.message || 'Failed to load exception detail dossier.'))
      .finally(() => setLoadingDetail(false));
  }, [selectedExceptionId]);

  // AI Actions (Read-Only)
  const handleRequestAiExplain = async () => {
    if (!selectedExceptionId) return;
    setLoadingAiExplain(true);
    setAiError(null);
    try {
      const res = await api.aiExplainException(selectedExceptionId);
      setAiExplanation(res.data);
    } catch (err) {
      setAiError(err.message || 'AI explanation service unavailable.');
    } finally {
      setLoadingAiExplain(false);
    }
  };

  const handleRequestAiSuggest = async () => {
    if (!selectedExceptionId) return;
    setLoadingAiSuggest(true);
    setAiError(null);
    try {
      const res = await api.aiSuggestCorrection(selectedExceptionId);
      setAiSuggestion(res.data);
      if (res.data?.suggestion?.field) {
        setEditedFieldsJson(
          JSON.stringify(
            { [res.data.suggestion.field]: res.data.suggestion.suggestedValue },
            null,
            2
          )
        );
      }
    } catch (err) {
      setAiError(err.message || 'AI suggestion service unavailable.');
    } finally {
      setLoadingAiSuggest(false);
    }
  };

  const handleApplyAiSuggestion = (suggestionObj, recommendationId) => {
    setDecisionType('corrected');
    setAppliedAiRecId(recommendationId);
    if (suggestionObj?.field) {
      setEditedFieldsJson(
        JSON.stringify({ [suggestionObj.field]: suggestionObj.suggestedValue }, null, 2)
      );
    }
    setReviewerNote(`Accepted AI recommendation (${suggestionObj?.justification || 'Aligned with verified servicing guidelines'}).`);
  };

  // Submit Reviewer Decision (The ONLY State-Mutating Action)
  const handleSubmitDecision = async (e) => {
    e.preventDefault();
    if (!selectedExceptionId) return;
    if (!reviewerNote || reviewerNote.trim().length < 3) {
      setDecisionError('Underwriter review rationale is required (minimum 3 characters).');
      return;
    }

    let parsedFields = null;
    if (decisionType === 'corrected') {
      try {
        parsedFields = JSON.parse(editedFieldsJson);
      } catch (err) {
        setDecisionError('Invalid JSON format for corrected fields payload.');
        return;
      }
    }

    setSubmittingDecision(true);
    setDecisionError(null);
    setDecisionSuccess(null);

    try {
      const payload = {
        decision: decisionType,
        notes: reviewerNote,
        editedFields: parsedFields,
        acceptedAiRecommendationId: appliedAiRecId,
      };

      const res = await api.submitDecision(selectedExceptionId, payload);
      setDecisionSuccess(`Decision recorded: Exception ${decisionType.toUpperCase()}. ReviewAction #${res.data.reviewAction.id.slice(0, 8)} vaulted to audit ledger.`);
      setReviewerNote('');
      fetchExceptionList();
    } catch (err) {
      setDecisionError(err.message || 'Failed to record underwriter decision.');
    } finally {
      setSubmittingDecision(false);
    }
  };

  // Extract raw and normalized JSON objects for comparison
  let rawJsonObj = null;
  if (exceptionDetail?.loan?.rawLoanRecord?.rawContent) {
    try {
      rawJsonObj = JSON.parse(exceptionDetail.loan.rawLoanRecord.rawContent);
    } catch {}
  }

  const getSeverityBadgeClass = (sev) => {
    switch (sev) {
      case 'CRITICAL':
        return 'badge-critical';
      case 'HIGH':
      case 'MEDIUM':
        return 'badge-warning';
      default:
        return 'badge-navy';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Section Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-border">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-content-primary">
            Underwriting Review Workspace
          </h2>
          <p className="text-xs text-content-secondary mt-0.5">
            Adjudicate validation rule violations, inspect forensic source discrepancies, and log permanent decisions.
          </p>
        </div>
        <div className="flex items-center space-x-2 text-xs font-mono text-content-muted">
          <span>Active Queue: {exceptions.length}</span>
          <span>•</span>
          <span>Signer: David Chen (REVIEWER)</span>
        </div>
      </div>

      {/* Master / Detail Grid Layout (33% Left / 67% Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ========================================================================= */}
        {/* LEFT COLUMN: Exception Queue (~33% width -> 4 cols)                        */}
        {/* ========================================================================= */}
        <div className="lg:col-span-4 panel-institutional p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-semantic-warning" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-content-primary font-mono">
                Exception Queue
              </h3>
            </div>
            <span className="text-[10px] font-mono text-content-muted bg-surface-secondary px-1.5 py-0.5 rounded-xs border border-border">
              {exceptions.length} Open
            </span>
          </div>

          {/* Search & Filters */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-content-muted" />
              <input
                type="text"
                placeholder="Filter loan ID, borrower, rule..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-institutional w-full pl-8 py-1 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="select-institutional text-xs py-1"
              >
                <option value="">All Severities</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="WARNING">Warning</option>
              </select>

              <select
                value={ruleFilter}
                onChange={(e) => setRuleFilter(e.target.value)}
                className="select-institutional text-xs py-1 truncate"
              >
                <option value="">All Rules</option>
                <option value="RULE_MATURITY_AFTER_ORIGINATION">Maturity Sequence</option>
                <option value="RULE_NON_NEGATIVE_PRINCIPAL">Negative Principal</option>
                <option value="RULE_BALANCE_LE_PRINCIPAL">Balance &gt; Principal</option>
                <option value="RULE_PAYMENT_STATUS_DPD_CONSISTENCY">DPD Consistency</option>
                <option value="RULE_CROSS_SOURCE_CONFLICT">Servicer Discrepancy</option>
                <option value="RULE_VALID_STATE_CODE">Invalid State Code</option>
                <option value="RULE_CLOSED_LOAN_POSITIVE_BALANCE">Closed Loan Balance</option>
              </select>
            </div>
          </div>

          {/* Queue List Rows */}
          {loadingList ? (
            <div className="py-16 flex justify-center text-content-muted">
              <Loader2 className="w-5 h-5 animate-spin text-brand-navy" />
            </div>
          ) : listError ? (
            <div className="p-3 bg-semantic-critical-bg border border-semantic-critical-border rounded-sm text-semantic-critical text-xs font-mono">
              {listError}
            </div>
          ) : exceptions.length === 0 ? (
            <div className="text-center py-12 text-xs text-content-muted">
              No open exceptions match filter criteria.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[640px] overflow-y-auto pr-1">
              {exceptions.map((e) => {
                const isSelected = e.id === selectedExceptionId;
                return (
                  <div
                    key={e.id}
                    onClick={() => setSelectedExceptionId(e.id)}
                    className={`p-3 rounded-sm border transition-colors cursor-pointer text-left ${
                      isSelected
                        ? 'bg-brand-navy-subtle border-l-2 border-brand-navy border-t-border border-r-border border-b-border'
                        : 'bg-surface border-border hover:bg-surface-secondary/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-mono font-bold text-xs text-brand-navy truncate">
                        {e.loan?.loanIdentifier || '(Missing ID)'}
                      </span>
                      <span className={getSeverityBadgeClass(e.severity)}>
                        {e.severity}
                      </span>
                    </div>

                    <div className="text-xs text-content-primary font-medium truncate">
                      {e.rule?.name || e.ruleId}
                    </div>

                    <div className="text-[11px] text-content-secondary mt-1 flex items-center justify-between font-sans">
                      <span className="truncate max-w-[140px]">{e.loan?.borrowerName || 'Borrower'}</span>
                      <span className="font-mono font-medium text-content-primary tabular-nums">
                        ${e.loan?.currentBalance?.toLocaleString() ?? '0.00'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* RIGHT COLUMN: Underwriting Workspace & Adjudication (~67% -> 8 cols)      */}
        {/* ========================================================================= */}
        <div className="lg:col-span-8 space-y-5">
          {loadingDetail ? (
            <div className="panel-institutional p-16 flex flex-col items-center justify-center text-content-muted">
              <Loader2 className="w-6 h-6 animate-spin text-brand-navy mb-2" />
              <span className="text-xs font-medium">Fetching loan exception dossier...</span>
            </div>
          ) : detailError ? (
            <div className="panel-institutional p-6 bg-semantic-critical-bg border-semantic-critical-border text-semantic-critical text-xs font-mono">
              {detailError}
            </div>
          ) : !exceptionDetail ? (
            <div className="panel-institutional p-16 text-center text-xs text-content-muted">
              Select an exception from the queue to start underwriter review.
            </div>
          ) : (
            <>
              {/* 1. Loan Header & Diagnostic Summary */}
              <div className="panel-institutional p-5 space-y-4">
                {/* Header & Rule Title */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-sm text-brand-navy">
                        {exceptionDetail.loan?.loanIdentifier || '(Missing ID)'}
                      </span>
                      <span className={getSeverityBadgeClass(exceptionDetail.severity)}>
                        {exceptionDetail.severity}
                      </span>
                      <span className="text-xs text-content-muted font-mono">
                        Rule: {exceptionDetail.rule?.ruleCode}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-content-primary mt-1">
                      {exceptionDetail.rule?.name}
                    </h3>
                  </div>

                  <button
                    onClick={() => onSelectLoan && onSelectLoan(exceptionDetail.loanId)}
                    className="btn-institutional-secondary text-xs self-start sm:self-auto"
                  >
                    <span>Full Loan Lineage</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>

                {/* Violation Reason Box */}
                <div className="p-3 bg-semantic-critical-bg/60 border border-semantic-critical-border rounded-sm text-xs text-semantic-critical">
                  <span className="font-semibold block mb-0.5 font-mono uppercase text-[10px]">
                    Violation Diagnostic:
                  </span>
                  <p className="font-sans leading-relaxed">
                    {exceptionDetail.details
                      ? JSON.parse(exceptionDetail.details).message
                      : 'Validation rule condition failed.'}
                  </p>
                </div>

                {/* Financial Facts Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-surface-secondary/70 p-3 rounded-sm border border-border text-xs">
                  <div>
                    <span className="text-[10px] font-mono uppercase font-semibold text-content-muted block">
                      Original Principal
                    </span>
                    <span className="font-mono font-bold text-content-primary text-xs tabular-nums">
                      ${exceptionDetail.loan?.originalPrincipal?.toLocaleString() ?? '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-mono uppercase font-semibold text-content-muted block">
                      Current Balance
                    </span>
                    <span className="font-mono font-bold text-content-primary text-xs tabular-nums">
                      ${exceptionDetail.loan?.currentBalance?.toLocaleString() ?? '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-mono uppercase font-semibold text-content-muted block">
                      Servicing Status / DPD
                    </span>
                    <span className="font-sans font-medium text-content-primary text-xs">
                      {exceptionDetail.loan?.paymentStatus} ({exceptionDetail.loan?.daysPastDue} DPD)
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-mono uppercase font-semibold text-content-muted block">
                      State / Term
                    </span>
                    <span className="font-sans font-medium text-content-primary text-xs">
                      {exceptionDetail.loan?.borrowerState || '—'} • {exceptionDetail.loan?.termMonths || 360}m
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. FORENSIC SOURCE COMPARISON (TWO STRUCTURED PANES) */}
              <div className="panel-institutional p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <div className="flex items-center space-x-2">
                    <Info className="w-4 h-4 text-content-secondary" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-content-primary font-mono">
                      Forensic Source Comparison
                    </h3>
                  </div>
                  <span className="text-[10px] text-content-muted font-mono">Row #{exceptionDetail.loan?.rawLoanRecord?.rowNumber ?? '—'}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                  {/* Raw Source Tape */}
                  <div className="bg-surface-secondary/80 border border-border rounded-sm p-3 space-y-1.5">
                    <span className="text-[10px] uppercase font-semibold text-content-muted tracking-wider block font-sans border-b border-border/60 pb-1">
                      Raw Source Tape (Verbatim CSV)
                    </span>
                    {rawJsonObj ? (
                      <div className="space-y-1 text-[11px] text-content-primary">
                        <div><span className="text-content-muted">loan_id:</span> "{rawJsonObj.loan_id}"</div>
                        <div><span className="text-content-muted">origination_date:</span> "{rawJsonObj.origination_date}"</div>
                        <div><span className="text-content-muted">maturity_date:</span> "{rawJsonObj.maturity_date}"</div>
                        <div><span className="text-content-muted">original_principal:</span> "{rawJsonObj.original_principal}"</div>
                        <div><span className="text-content-muted">current_balance:</span> "{rawJsonObj.current_balance}"</div>
                        <div><span className="text-content-muted">payment_status:</span> "{rawJsonObj.payment_status}"</div>
                        <div><span className="text-content-muted">borrower_state:</span> "{rawJsonObj.borrower_state}"</div>
                      </div>
                    ) : (
                      <p className="text-content-muted text-xs font-sans">Raw CSV source content loaded.</p>
                    )}
                  </div>

                  {/* Normalized Database Record */}
                  <div className="bg-surface-secondary/80 border border-border rounded-sm p-3 space-y-1.5">
                    <span className="text-[10px] uppercase font-semibold text-content-muted tracking-wider block font-sans border-b border-border/60 pb-1">
                      Normalized Database Record
                    </span>
                    <div className="space-y-1 text-[11px] text-content-primary">
                      <div><span className="text-content-muted">loanIdentifier:</span> {exceptionDetail.loan?.loanIdentifier || 'null'}</div>
                      <div><span className="text-content-muted">originationDate:</span> {exceptionDetail.loan?.originationDate ? new Date(exceptionDetail.loan.originationDate).toISOString().split('T')[0] : 'null'}</div>
                      <div><span className="text-content-muted">maturityDate:</span> {exceptionDetail.loan?.maturityDate ? new Date(exceptionDetail.loan.maturityDate).toISOString().split('T')[0] : 'null'}</div>
                      <div><span className="text-content-muted">originalPrincipal:</span> {exceptionDetail.loan?.originalPrincipal}</div>
                      <div><span className="text-content-muted">currentBalance:</span> {exceptionDetail.loan?.currentBalance}</div>
                      <div><span className="text-content-muted">paymentStatus:</span> {exceptionDetail.loan?.paymentStatus}</div>
                      <div><span className="text-content-muted">borrowerState:</span> {exceptionDetail.loan?.borrowerState}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. AI REVIEW ASSIST (COMPACT, ADVISORY ONLY, PLUM/VIOLET) */}
              <div className="bg-semantic-ai-bg border border-semantic-ai-border rounded-sm p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <BrainCircuit className="w-4 h-4 text-semantic-ai" />
                    <div>
                      <span className="text-xs font-bold text-semantic-ai uppercase tracking-wider block font-mono leading-none">
                        AI Review Assist (Advisory Only)
                      </span>
                      <span className="text-[11px] text-content-secondary mt-0.5 block leading-none">
                        Non-binding advisory proposal. Human underwriter review is mandatory.
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={handleRequestAiExplain}
                      disabled={loadingAiExplain}
                      className="px-2.5 py-1 bg-surface border border-semantic-ai-border hover:bg-surface-secondary text-semantic-ai rounded-sm text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {loadingAiExplain ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Explain'}
                    </button>
                    <button
                      type="button"
                      onClick={handleRequestAiSuggest}
                      disabled={loadingAiSuggest}
                      className="px-2.5 py-1 bg-semantic-ai text-white hover:bg-semantic-ai/90 rounded-sm text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {loadingAiSuggest ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Suggest Fix'}
                    </button>
                  </div>
                </div>

                {aiError && (
                  <div className="p-2.5 bg-semantic-critical-bg border border-semantic-critical-border rounded-sm text-xs text-semantic-critical font-mono">
                    {aiError}
                  </div>
                )}

                {/* AI Explanation Text */}
                {aiExplanation && (
                  <div className="bg-surface border border-semantic-ai-border/80 rounded-sm p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-content-muted">
                      <span className="font-semibold text-semantic-ai font-mono">Diagnostic Analysis</span>
                      <span className="font-mono">
                        Model: {aiExplanation.modelName || 'Anthropic Claude'} • {new Date(aiExplanation.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-content-primary leading-relaxed">{aiExplanation.explanation}</p>
                  </div>
                )}

                {/* AI Suggested Field Correction Box */}
                {aiSuggestion && aiSuggestion.suggestion && (
                  <div className="bg-surface border border-semantic-ai-border/80 rounded-sm p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-semantic-ai font-mono">Proposed Correction Patch</span>
                      <span className="badge-ai font-mono">
                        Confidence: {aiSuggestion.suggestion.confidence || 'HIGH'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 bg-surface-secondary p-2 rounded-sm border border-border text-xs">
                      <div>
                        <span className="text-[10px] font-mono text-content-muted block">Target Field</span>
                        <span className="font-mono font-semibold text-content-primary">{aiSuggestion.suggestion.field}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-mono text-content-muted block">Suggested Value</span>
                        <span className="font-mono font-bold text-semantic-verified">
                          {String(aiSuggestion.suggestion.suggestedValue)}
                        </span>
                      </div>
                    </div>

                    <p className="text-content-secondary italic text-[11px]">
                      "{aiSuggestion.suggestion.justification}"
                    </p>

                    <div className="pt-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleApplyAiSuggestion(aiSuggestion.suggestion, aiSuggestion.recommendationId)}
                        className="btn-institutional-secondary text-xs"
                      >
                        <UserCheck className="w-3 h-3 text-brand-navy" />
                        <span>Populate Human Review Form</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 4. HUMAN REVIEW DECISION LAYER (THE SOLE MUTATION POINT) */}
              <form
                onSubmit={handleSubmitDecision}
                className="panel-institutional p-5 space-y-4"
              >
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center space-x-2">
                    <UserCheck className="w-4 h-4 text-brand-navy" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-content-primary font-mono">
                      Human Review Decision & Audit Sign-Off
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-content-muted">
                    Signer: David Chen (REVIEWER)
                  </span>
                </div>

                {decisionSuccess && (
                  <div className="p-3 bg-semantic-verified-bg border border-semantic-verified-border rounded-sm text-semantic-verified text-xs flex items-center space-x-2 font-mono">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    <span>{decisionSuccess}</span>
                  </div>
                )}

                {decisionError && (
                  <div className="p-3 bg-semantic-critical-bg border border-semantic-critical-border rounded-sm text-semantic-critical text-xs flex items-center space-x-2 font-mono">
                    <XCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{decisionError}</span>
                  </div>
                )}

                {/* Decision Action Buttons */}
                <div>
                  <label className="text-xs font-semibold text-content-primary block mb-2 font-mono uppercase text-[10px]">
                    Select Adjudication Action:
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setDecisionType('approved')}
                      className={`p-2.5 rounded-sm border text-xs font-medium flex flex-col items-center justify-center space-y-1 transition-all ${
                        decisionType === 'approved'
                          ? 'bg-semantic-verified text-white border-semantic-verified font-bold shadow-subtle'
                          : 'bg-surface border-border text-content-secondary hover:bg-surface-secondary'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Approve Override</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDecisionType('corrected')}
                      className={`p-2.5 rounded-sm border text-xs font-medium flex flex-col items-center justify-center space-y-1 transition-all ${
                        decisionType === 'corrected'
                          ? 'bg-brand-navy text-white border-brand-navy font-bold shadow-subtle'
                          : 'bg-surface border-border text-content-secondary hover:bg-surface-secondary'
                      }`}
                    >
                      <Edit3 className="w-4 h-4" />
                      <span>Correct & Apply</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDecisionType('rejected')}
                      className={`p-2.5 rounded-sm border text-xs font-medium flex flex-col items-center justify-center space-y-1 transition-all ${
                        decisionType === 'rejected'
                          ? 'bg-semantic-critical text-white border-semantic-critical font-bold shadow-subtle'
                          : 'bg-surface border-border text-content-secondary hover:bg-surface-secondary'
                      }`}
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Reject Loan</span>
                    </button>
                  </div>
                </div>

                {/* If "corrected" selected, show JSON editor for editedFields */}
                {decisionType === 'corrected' && (
                  <div>
                    <label className="text-xs font-semibold text-content-primary block mb-1 font-mono uppercase text-[10px]">
                      Corrected Fields Payload (JSON):
                    </label>
                    <textarea
                      rows={3}
                      value={editedFieldsJson}
                      onChange={(e) => setEditedFieldsJson(e.target.value)}
                      className="input-institutional w-full font-mono text-xs text-brand-navy"
                    />
                    {appliedAiRecId && (
                      <span className="text-[10px] text-semantic-ai mt-1 block font-mono">
                        Linked AI Recommendation ID: {appliedAiRecId.slice(0, 8)}...
                      </span>
                    )}
                  </div>
                )}

                {/* Required Reviewer Note */}
                <div>
                  <label className="text-xs font-semibold text-content-primary block mb-1 font-mono uppercase text-[10px]">
                    Underwriting Rationale / Compliance Justification <span className="text-semantic-critical">*</span>:
                  </label>
                  <textarea
                    rows={2}
                    required
                    placeholder="Enter compliance justification for policy override, field correction, or rejection..."
                    value={reviewerNote}
                    onChange={(e) => setReviewerNote(e.target.value)}
                    className="input-institutional w-full text-xs"
                  />
                </div>

                {/* Submit Action */}
                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-border">
                  <span className="text-[11px] text-content-muted">
                    This decision will be permanently recorded in the audit trail.
                  </span>
                  <button
                    type="submit"
                    disabled={submittingDecision}
                    className="btn-navy text-xs self-end"
                  >
                    {submittingDecision ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>Record Human Decision</span>
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
