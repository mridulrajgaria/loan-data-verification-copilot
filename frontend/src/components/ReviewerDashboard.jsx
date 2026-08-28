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
  const [appliedSearchTerm, setAppliedSearchTerm] = useState(searchQuery);

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

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setAppliedSearchTerm(searchTerm);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [searchTerm]);

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
      const filtered = appliedSearchTerm
        ? items.filter(
            (e) =>
              e.loan?.loanIdentifier?.toLowerCase().includes(appliedSearchTerm.toLowerCase()) ||
              e.loan?.borrowerName?.toLowerCase().includes(appliedSearchTerm.toLowerCase()) ||
              e.rule?.name?.toLowerCase().includes(appliedSearchTerm.toLowerCase())
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
  }, [severityFilter, ruleFilter, appliedSearchTerm, selectedExceptionId]);

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
        return 'badge-periwinkle';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Section Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#CDD7CB]">
        <div>
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-[#131D1B]">
            Underwriting Case Management Dossier
          </h2>
          <p className="text-xs text-[#495B56] mt-0.5 font-medium">
            Adjudicate validation rule violations, inspect forensic source discrepancies, and log permanent decisions.
          </p>
        </div>
        <div className="flex items-center space-x-2 text-xs font-mono text-[#768883]">
          <span className="badge-warning">Queue: {exceptions.length} Open</span>
          <span>•</span>
          <span className="font-bold text-[#131D1B]">Signer: Mridul Rajgaria (REVIEWER)</span>
        </div>
      </div>

      {/* Master / Detail Grid Layout (33% Queue / 67% Dossier) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ========================================================================= */}
        {/* LEFT COLUMN: Exception Queue (~33% width -> 4 cols)                        */}
        {/* ========================================================================= */}
        <div className="lg:col-span-4 section-band p-4 bg-white flex flex-col min-h-0 lg:sticky lg:top-4 lg:h-[calc(100vh-12rem)] max-h-[850px] overflow-hidden shadow-sm">
          <div className="flex items-center justify-between border-b border-[#CDD7CB] pb-2.5 flex-shrink-0">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-[#A15C00]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#131D1B] font-mono">
                Case Queue
              </h3>
            </div>
            <span
              style={{ backgroundColor: '#FFEB8C', color: '#453800', border: '1px solid #F0D452' }}
              className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md"
            >
              {exceptions.length} Open
            </span>
          </div>

          {/* Search & Filters */}
          <div className="space-y-2 flex-shrink-0 pt-3 pb-3">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 absolute left-2.5 text-[#768883] pointer-events-none" />
              <input
                type="text"
                placeholder="Filter loan ID, borrower, rule..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ paddingLeft: '2.25rem' }}
                className="input-institutional w-full py-1.5 text-xs bg-[#F8FAFC]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="select-institutional text-xs py-1.5 font-mono text-[11px]"
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
                className="select-institutional text-xs py-1.5 truncate font-mono text-[11px]"
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

          {/* Queue List Rows (Scrollable, strictly bounded to card height) */}
          {loadingList ? (
            <div className="py-16 flex justify-center text-[#768883] flex-1 items-center">
              <Loader2 className="w-5 h-5 animate-spin text-[#204E4C]" />
            </div>
          ) : listError ? (
            <div className="p-3 bg-[#FEF3F2] border border-[#FECDCA] rounded-md text-[#B42318] text-xs font-mono">
              {listError}
            </div>
          ) : exceptions.length === 0 ? (
            <div className="text-center py-12 text-xs text-[#768883] flex-1 flex items-center justify-center">
              No open exceptions match filter criteria.
            </div>
          ) : (
            <div className="space-y-2 overflow-y-auto pr-1 flex-1 min-h-0">
              {exceptions.map((e) => {
                const isSelected = e.id === selectedExceptionId;
                return (
                  <div
                    key={e.id}
                    onClick={() => setSelectedExceptionId(e.id)}
                    style={{
                      backgroundColor: isSelected ? '#E2F0D9' : '#FFFFFF',
                      borderLeft: isSelected ? '4px solid #204E4C' : '1px solid #CDD7CB',
                      borderColor: isSelected ? '#B3D463' : '#CDD7CB',
                    }}
                    className={`p-3 rounded-lg transition-all cursor-pointer text-left border ${
                      isSelected
                        ? 'shadow-sm pl-3'
                        : 'hover:bg-[#F4F8F3]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-mono font-bold text-xs text-[#204E4C] truncate">
                        {e.loan?.loanIdentifier || '(Missing ID)'}
                      </span>
                      <span className={getSeverityBadgeClass(e.severity)}>
                        {e.severity}
                      </span>
                    </div>

                    <div className="text-xs text-[#131D1B] font-bold truncate font-sans">
                      {e.rule?.name || e.ruleId}
                    </div>

                    <div className="text-[11px] text-[#495B56] mt-1 flex items-center justify-between font-sans">
                      <span className="truncate max-w-[140px]">{e.loan?.borrowerName || 'Borrower'}</span>
                      <span className="font-mono font-bold text-[#131D1B] tabular-nums">
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
        {/* RIGHT COLUMN: Forensic Investigation Dossier (~67% -> 8 cols)             */}
        {/* ========================================================================= */}
        <div className="lg:col-span-8 space-y-5">
          {loadingDetail ? (
            <div className="section-band p-16 flex flex-col items-center justify-center text-[#768883] bg-white">
              <Loader2 className="w-6 h-6 animate-spin text-[#204E4C] mb-2" />
              <span className="text-xs font-medium">Fetching loan exception dossier...</span>
            </div>
          ) : detailError ? (
            <div className="section-band p-6 bg-[#FEF3F2] border-[#FECDCA] text-[#B42318] text-xs font-mono">
              {detailError}
            </div>
          ) : !exceptionDetail ? (
            <div className="section-band p-16 text-center text-xs text-[#768883] bg-white">
              Select an exception from the queue to start underwriter review.
            </div>
          ) : (
            <>
              {/* 1. Case Header & Diagnostic Statement */}
              <div className="section-band p-5 space-y-4 bg-white">
                {/* Header & Rule Title */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#CDD7CB]">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-base text-[#204E4C]">
                        {exceptionDetail.loan?.loanIdentifier || '(Missing ID)'}
                      </span>
                      <span className={getSeverityBadgeClass(exceptionDetail.severity)}>
                        {exceptionDetail.severity}
                      </span>
                      <span className="text-xs text-[#768883] font-mono">
                        Rule: {exceptionDetail.rule?.ruleCode}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-[#131D1B] mt-1 font-sans">
                      {exceptionDetail.rule?.name}
                    </h3>
                  </div>

                  <button
                    onClick={() => onSelectLoan && onSelectLoan(exceptionDetail.loanId)}
                    className="btn-institutional-secondary text-xs self-start sm:self-auto"
                  >
                    <span>Full Loan Lineage</span>
                    <ExternalLink className="w-3.5 h-3.5 text-[#204E4C]" />
                  </button>
                </div>

                {/* Violation Diagnostic Banner (RICH PALE YELLOW SURFACE #FFEB8C) */}
                <div
                  style={{ backgroundColor: '#FFEB8C', color: '#453800', border: '1px solid #F0D452' }}
                  className="p-4 rounded-lg text-xs shadow-sm"
                >
                  <span className="font-bold block mb-1 font-mono uppercase text-[10px] tracking-wider">
                    Violation Diagnostic:
                  </span>
                  <p className="font-sans leading-relaxed font-bold text-xs">
                    {(() => {
                      if (!exceptionDetail.details) return 'Validation rule condition failed.';
                      if (typeof exceptionDetail.details === 'object') return exceptionDetail.details.message || 'Validation rule condition failed.';
                      try {
                        const parsed = JSON.parse(exceptionDetail.details);
                        return parsed.message || parsed.ruleName || 'Validation rule condition failed.';
                      } catch {
                        return String(exceptionDetail.details);
                      }
                    })()}
                  </p>
                </div>

                {/* Critical Financial Facts Grid (RICH SOFT PERIWINKLE SURFACE BLOCK #C1D8FF) */}
                <div
                  style={{ backgroundColor: '#C1D8FF', color: '#0D2754', border: '1px solid #9DC0FB' }}
                  className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-lg text-xs shadow-sm"
                >
                  <div className="bg-white/80 p-2.5 rounded-md border border-[#9DC0FB]">
                    <span className="text-[10px] font-mono uppercase font-bold text-[#0D2754]/80 block">
                      Original Principal
                    </span>
                    <span className="font-mono font-bold text-[#0D2754] text-sm tabular-nums">
                      ${exceptionDetail.loan?.originalPrincipal?.toLocaleString() ?? '—'}
                    </span>
                  </div>
                  <div className="bg-white/80 p-2.5 rounded-md border border-[#9DC0FB]">
                    <span className="text-[10px] font-mono uppercase font-bold text-[#0D2754]/80 block">
                      Current Balance
                    </span>
                    <span className="font-mono font-bold text-[#0D2754] text-sm tabular-nums">
                      ${exceptionDetail.loan?.currentBalance?.toLocaleString() ?? '—'}
                    </span>
                  </div>
                  <div className="bg-white/80 p-2.5 rounded-md border border-[#9DC0FB]">
                    <span className="text-[10px] font-mono uppercase font-bold text-[#0D2754]/80 block">
                      Servicing / DPD
                    </span>
                    <span className="font-sans font-bold text-[#0D2754] text-xs">
                      {exceptionDetail.loan?.paymentStatus} ({exceptionDetail.loan?.daysPastDue} DPD)
                    </span>
                  </div>
                  <div className="bg-white/80 p-2.5 rounded-md border border-[#9DC0FB]">
                    <span className="text-[10px] font-mono uppercase font-bold text-[#0D2754]/80 block">
                      State / Term
                    </span>
                    <span className="font-sans font-bold text-[#0D2754] text-xs">
                      {exceptionDetail.loan?.borrowerState || '—'} • {exceptionDetail.loan?.termMonths || 360}m
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. SOURCE EVIDENCE / FORENSIC COMPARISON (CLEAN WHITE DATA LEDGER) */}
              <div className="section-band p-5 space-y-3 bg-white">
                <div className="flex items-center justify-between border-b border-[#CDD7CB] pb-2">
                  <div className="flex items-center space-x-2">
                    <Info className="w-4 h-4 text-[#204E4C]" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#131D1B] font-mono">
                      Source Evidence & Forensic Comparison
                    </h3>
                  </div>
                  <span className="text-[10px] text-[#204E4C] font-mono font-bold bg-[#E2ECEB] px-2.5 py-0.5 rounded-md border border-[#9BB8B6]">
                    Tape Row #{exceptionDetail.loan?.rawLoanRecord?.rowNumber ?? '—'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                  {/* Raw Source Tape */}
                  <div className="bg-[#F4F8F3] border border-[#CDD7CB] rounded-lg p-3.5 space-y-1.5">
                    <span className="text-[10px] uppercase font-bold text-[#495B56] tracking-wider block font-sans border-b border-[#CDD7CB] pb-1">
                      Raw Source Tape (Verbatim CSV)
                    </span>
                    {rawJsonObj ? (
                      <div className="space-y-1 text-[11px] text-[#131D1B]">
                        <div><span className="text-[#768883]">loan_id:</span> "{rawJsonObj.loan_id}"</div>
                        <div><span className="text-[#768883]">origination_date:</span> "{rawJsonObj.origination_date}"</div>
                        <div><span className="text-[#768883]">maturity_date:</span> "{rawJsonObj.maturity_date}"</div>
                        <div><span className="text-[#768883]">original_principal:</span> "{rawJsonObj.original_principal}"</div>
                        <div><span className="text-[#768883]">current_balance:</span> "{rawJsonObj.current_balance}"</div>
                        <div><span className="text-[#768883]">payment_status:</span> "{rawJsonObj.payment_status}"</div>
                        <div><span className="text-[#768883]">borrower_state:</span> "{rawJsonObj.borrower_state}"</div>
                      </div>
                    ) : (
                      <p className="text-[#768883] text-xs font-sans">Raw CSV source content loaded.</p>
                    )}
                  </div>

                  {/* Normalized Database Record */}
                  <div className="bg-white border border-[#CDD7CB] rounded-lg p-3.5 space-y-1.5 shadow-sm">
                    <span className="text-[10px] uppercase font-bold text-[#204E4C] tracking-wider block font-sans border-b border-[#CDD7CB] pb-1">
                      Normalized Database Record
                    </span>
                    <div className="space-y-1 text-[11px] text-[#131D1B]">
                      <div><span className="text-[#768883]">loanIdentifier:</span> {exceptionDetail.loan?.loanIdentifier || 'null'}</div>
                      <div><span className="text-[#768883]">originationDate:</span> {exceptionDetail.loan?.originationDate ? new Date(exceptionDetail.loan.originationDate).toISOString().split('T')[0] : 'null'}</div>
                      <div><span className="text-[#768883]">maturityDate:</span> {exceptionDetail.loan?.maturityDate ? new Date(exceptionDetail.loan.maturityDate).toISOString().split('T')[0] : 'null'}</div>
                      <div><span className="text-[#768883]">originalPrincipal:</span> {exceptionDetail.loan?.originalPrincipal}</div>
                      <div><span className="text-[#768883]">currentBalance:</span> {exceptionDetail.loan?.currentBalance}</div>
                      <div><span className="text-[#768883]">paymentStatus:</span> {exceptionDetail.loan?.paymentStatus}</div>
                      <div><span className="text-[#768883]">borrowerState:</span> {exceptionDetail.loan?.borrowerState}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. AI REVIEW ASSIST (LIGHT CORAL / SOFT RED TINT #FEECEB) */}
              <div
                style={{ backgroundColor: '#FEECEB', color: '#7A1D18', border: '1px solid #F9C3BF' }}
                className="p-4 rounded-lg space-y-3 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <BrainCircuit className="w-5 h-5 text-[#7A1D18]" />
                    <div>
                      <span className="text-xs font-bold text-[#7A1D18] uppercase tracking-wider block font-mono leading-none">
                        AI Review Assist (Advisory Only)
                      </span>
                      <span className="text-[11px] text-[#7A1D18]/80 mt-0.5 block leading-none font-sans font-medium">
                        Non-binding diagnostic. Human review is mandatory.
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={handleRequestAiExplain}
                      disabled={loadingAiExplain}
                      className="px-3 py-1 bg-white border border-[#F9C3BF] hover:bg-[#FEECEB] text-[#7A1D18] rounded-md text-xs font-bold transition-colors disabled:opacity-50 font-mono shadow-sm"
                    >
                      {loadingAiExplain ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Explain'}
                    </button>
                    <button
                      type="button"
                      onClick={handleRequestAiSuggest}
                      disabled={loadingAiSuggest}
                      style={{ backgroundColor: '#204E4C', color: '#FFFFFF' }}
                      className="px-3 py-1 rounded-md text-xs font-bold transition-colors disabled:opacity-50 font-mono shadow-sm"
                    >
                      {loadingAiSuggest ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Suggest Fix'}
                    </button>
                  </div>
                </div>

                {aiError && (
                  <div className="p-2.5 bg-[#FEF3F2] border border-[#FECDCA] rounded-md text-xs text-[#B42318] font-mono">
                    {aiError}
                  </div>
                )}

                {/* AI Explanation Text */}
                {aiExplanation && (
                  <div className="bg-white border border-[#F9C3BF] rounded-md p-3 text-xs space-y-1 shadow-sm">
                    <div className="flex items-center justify-between text-[10px] text-[#768883]">
                      <span className="font-bold text-[#7A1D18] font-mono">Diagnostic Analysis</span>
                      <span className="font-mono">
                        Model: {aiExplanation.modelName || 'Anthropic Claude'}
                      </span>
                    </div>
                    <p className="text-[#131D1B] leading-relaxed text-xs font-sans">{aiExplanation.explanation}</p>
                  </div>
                )}

                {/* AI Suggested Field Correction Box */}
                {aiSuggestion && aiSuggestion.suggestion && (
                  <div className="bg-white border border-[#F9C3BF] rounded-md p-3 text-xs space-y-2 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#7A1D18] font-mono text-xs">Proposed Correction Patch</span>
                      <span className="badge-coral font-mono">
                        Confidence: {aiSuggestion.suggestion.confidence || 'HIGH'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 bg-[#F4F8F3] p-2.5 rounded-md border border-[#CDD7CB] text-xs">
                      <div>
                        <span className="text-[10px] font-mono text-[#768883] block">Target Field</span>
                        <span className="font-mono font-bold text-[#131D1B]">{aiSuggestion.suggestion.field}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-mono text-[#768883] block">Suggested Value</span>
                        <span className="font-mono font-bold text-[#087443]">
                          {String(aiSuggestion.suggestion.suggestedValue)}
                        </span>
                      </div>
                    </div>

                    <div className="pt-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleApplyAiSuggestion(aiSuggestion.suggestion, aiSuggestion.recommendationId)}
                        className="btn-institutional-secondary text-xs"
                      >
                        <UserCheck className="w-3.5 h-3.5 text-[#204E4C]" />
                        <span>Populate Human Review Form</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 4. HUMAN REVIEW DECISION LAYER (DEEP TEAL ANCHOR BLOCK #204E4C) */}
              <form
                onSubmit={handleSubmitDecision}
                style={{ backgroundColor: '#204E4C', color: '#FFFFFF', border: '1px solid #163B39' }}
                className="p-6 rounded-lg space-y-4 shadow-modal"
              >
                <div className="flex items-center justify-between border-b border-white/20 pb-3">
                  <div className="flex items-center space-x-2">
                    <UserCheck className="w-5 h-5 text-[#CDE78C]" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-white font-mono">
                      Human Review Decision & Audit Sign-Off
                    </h3>
                  </div>
                  <span
                    style={{ backgroundColor: '#CDE78C', color: '#204E4C' }}
                    className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-md"
                  >
                    Signer: Mridul Rajgaria (REVIEWER)
                  </span>
                </div>

                {decisionSuccess && (
                  <div
                    style={{ backgroundColor: '#CDE78C', color: '#1C3806' }}
                    className="p-3 rounded-md text-xs flex items-center space-x-2 font-mono font-bold"
                  >
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    <span>{decisionSuccess}</span>
                  </div>
                )}

                {decisionError && (
                  <div
                    style={{ backgroundColor: '#B42318', color: '#FFFFFF' }}
                    className="p-3 rounded-md text-xs flex items-center space-x-2 font-mono font-bold"
                  >
                    <XCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{decisionError}</span>
                  </div>
                )}

                {/* 3 Distinct Action Selectors */}
                <div>
                  <label className="text-xs font-bold text-white block mb-2 font-mono uppercase text-[10px]">
                    Select Adjudication Action:
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setDecisionType('approved')}
                      style={{
                        backgroundColor: decisionType === 'approved' ? '#CDE78C' : 'rgba(255, 255, 255, 0.1)',
                        color: decisionType === 'approved' ? '#1C3806' : '#FFFFFF',
                        borderColor: decisionType === 'approved' ? '#B3D463' : 'rgba(255, 255, 255, 0.2)',
                      }}
                      className="p-3 rounded-lg border text-xs font-bold flex flex-col items-center justify-center space-y-1 transition-all shadow-sm"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Approve Override</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDecisionType('corrected')}
                      style={{
                        backgroundColor: decisionType === 'corrected' ? '#CDE78C' : 'rgba(255, 255, 255, 0.1)',
                        color: decisionType === 'corrected' ? '#1C3806' : '#FFFFFF',
                        borderColor: decisionType === 'corrected' ? '#B3D463' : 'rgba(255, 255, 255, 0.2)',
                      }}
                      className="p-3 rounded-lg border text-xs font-bold flex flex-col items-center justify-center space-y-1 transition-all shadow-sm"
                    >
                      <Edit3 className="w-4 h-4" />
                      <span>Correct & Apply</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDecisionType('rejected')}
                      style={{
                        backgroundColor: decisionType === 'rejected' ? '#B42318' : 'rgba(255, 255, 255, 0.1)',
                        color: '#FFFFFF',
                        borderColor: decisionType === 'rejected' ? '#FECDCA' : 'rgba(255, 255, 255, 0.2)',
                      }}
                      className="p-3 rounded-lg border text-xs font-bold flex flex-col items-center justify-center space-y-1 transition-all shadow-sm"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Reject Loan</span>
                    </button>
                  </div>
                </div>

                {/* If "corrected" selected, show JSON editor for editedFields */}
                {decisionType === 'corrected' && (
                  <div>
                    <label className="text-xs font-bold text-white block mb-1 font-mono uppercase text-[10px]">
                      Corrected Fields Payload (JSON):
                    </label>
                    <textarea
                      rows={3}
                      value={editedFieldsJson}
                      onChange={(e) => setEditedFieldsJson(e.target.value)}
                      className="w-full bg-white text-[#131D1B] border border-white rounded-lg p-2.5 text-xs font-mono focus:outline-none"
                    />
                    {appliedAiRecId && (
                      <span className="text-[10px] text-[#CDE78C] mt-1 block font-mono">
                        Linked AI Recommendation ID: {appliedAiRecId.slice(0, 8)}...
                      </span>
                    )}
                  </div>
                )}

                {/* Required Reviewer Note */}
                <div>
                  <label className="text-xs font-bold text-white block mb-1 font-mono uppercase text-[10px]">
                    Underwriting Rationale / Compliance Justification <span className="text-[#CDE78C]">*</span>:
                  </label>
                  <textarea
                    rows={2}
                    required
                    placeholder="Enter compliance justification for policy override, field correction, or rejection..."
                    value={reviewerNote}
                    onChange={(e) => setReviewerNote(e.target.value)}
                    className="w-full bg-white text-[#131D1B] border border-white rounded-lg p-2.5 text-xs font-sans placeholder:text-[#768883] focus:outline-none"
                  />
                </div>

                {/* Submit Action */}
                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-white/20">
                  <span className="text-[11px] text-[#E2ECEB] font-medium">
                    This decision will be permanently recorded in the immutable audit trail.
                  </span>
                  <button
                    type="submit"
                    disabled={submittingDecision}
                    className="btn-lime text-xs self-end"
                  >
                    {submittingDecision ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
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
