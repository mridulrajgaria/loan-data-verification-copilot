import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import {
  UploadCloud,
  FileCheck2,
  AlertTriangle,
  RefreshCw,
  Loader2,
  ArrowUpRight,
  CheckCircle,
  FileSpreadsheet,
  BrainCircuit,
  Sparkles,
  BadgeCheck,
  Flag,
} from 'lucide-react';

/**
 * Validation Outcome Composition — a single segmented bar showing what
 * share of the ingested portfolio is Clean/Verified vs currently Flagged.
 * Reuses this dashboard's own established two-tone story (lime = clean/
 * verified, coral/critical-red = flagged) rather than introducing a new
 * palette, and always pairs each segment with an icon + label + % so the
 * split never depends on color alone (a red/green pair sits in the CVD
 * warn band without that secondary encoding).
 */
function ValidationCompositionBar({ summary, loading }) {
  const total = summary?.totalLoans || 0;
  const clean = summary?.cleanLoansCount || 0;
  const flagged = summary?.flaggedLoansCount || 0;
  // Computed independently from actual counts (never by subtracting from
  // 100) so an un-validated or partially-reconciled batch — where
  // clean + flagged doesn't yet add up to total — can't render a
  // misleading "100% flagged" bar for loans that simply haven't been
  // classified yet.
  const cleanPct = total > 0 ? Math.round((clean / total) * 100) : 0;
  const flaggedPct = total > 0 ? Math.round((flagged / total) * 100) : 0;
  const unclassified = Math.max(total - clean - flagged, 0);

  return (
    <div className="section-band p-5 space-y-3 bg-white">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-content-primary font-mono">
          Validation Outcome Composition
        </h3>
        <span className="text-[10px] font-mono text-content-secondary">
          {loading ? '—' : `${total.toLocaleString()} loans ingested`}
        </span>
      </div>

      {!loading && total === 0 ? (
        <p className="text-xs text-content-secondary font-mono py-2">
          No loans ingested yet — upload a loan tape to see the validation split.
        </p>
      ) : (
        <div className="space-y-2 pt-1">
          <div
            className="flex h-3 w-full rounded-full overflow-hidden bg-surface-inset"
            role="img"
            aria-label={`Validation outcome: ${cleanPct}% clean or verified (${clean} loans), ${flaggedPct}% flagged (${flagged} loans)${unclassified > 0 ? `, ${unclassified} not yet validated` : ''}`}
          >
            {cleanPct > 0 && (
              <div
                className="h-full"
                style={{ width: `${cleanPct}%`, backgroundColor: '#087443' }}
              />
            )}
            {flaggedPct > 0 && (
              <div
                className="h-full"
                style={{ width: `${flaggedPct}%`, backgroundColor: '#B42318' }}
              />
            )}
            {unclassified > 0 && (
              <div
                className="h-full"
                style={{ width: `${Math.round((unclassified / total) * 100)}%`, backgroundColor: '#B4C2B1' }}
              />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 pt-0.5">
            <div className="flex items-center gap-1.5">
              <BadgeCheck className="w-3.5 h-3.5" style={{ color: '#087443' }} />
              <span className="text-[10.5px] font-mono font-semibold text-content-secondary uppercase tracking-wide">
                Clean / Verified
              </span>
              <span className="text-xs font-mono font-bold text-content-primary tabular-nums">
                {clean.toLocaleString()} ({cleanPct}%)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Flag className="w-3.5 h-3.5" style={{ color: '#B42318' }} />
              <span className="text-[10.5px] font-mono font-semibold text-content-secondary uppercase tracking-wide">
                Flagged
              </span>
              <span className="text-xs font-mono font-bold text-content-primary tabular-nums">
                {flagged.toLocaleString()} ({flaggedPct}%)
              </span>
            </div>
            {unclassified > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded-full inline-block" style={{ backgroundColor: '#B4C2B1' }} />
                <span className="text-[10.5px] font-mono font-semibold text-content-secondary uppercase tracking-wide">
                  Not Yet Validated
                </span>
                <span className="text-xs font-mono font-bold text-content-primary tabular-nums">
                  {unclassified.toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function OperatorDashboard({ onSelectLoan, onOpenAudit, searchQuery = '' }) {
  const [summary, setSummary] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [flaggedLoans, setFlaggedLoans] = useState([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingUploads, setLoadingUploads] = useState(true);
  const [loadingFlagged, setLoadingFlagged] = useState(true);
  const [summaryError, setSummaryError] = useState(null);
  const [uploadsError, setUploadsError] = useState(null);
  const [flaggedError, setFlaggedError] = useState(null);

  // Upload state
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState(null);
  const [uploadError, setUploadError] = useState(null);

  // Optional secondary feeds (servicer updates / document manifest) — used
  // by the cross-source-conflict and document-custody validation rules.
  // Both are optional; validation still runs without them, those two rules
  // just won't have anything to check a loan against.
  const [servicerUpdateFile, setServicerUpdateFile] = useState(null);
  const [documentManifestFile, setDocumentManifestFile] = useState(null);

  // AI Rule Generation State
  const [nlRuleDescription, setNlRuleDescription] = useState('');
  const [generatingRule, setGeneratingRule] = useState(false);
  const [generatedRule, setGeneratedRule] = useState(null);
  const [generationError, setGenerationError] = useState(null);

  const fetchSummary = useCallback(async () => {
    setLoadingSummary(true);
    setSummaryError(null);
    try {
      const res = await api.getSummary();
      setSummary(res.data);
    } catch (err) {
      setSummaryError(err.message || 'Failed to load portfolio metrics.');
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  const fetchUploads = useCallback(async () => {
    setLoadingUploads(true);
    setUploadsError(null);
    try {
      const res = await api.getUploads();
      setUploads(res.data || []);
    } catch (err) {
      setUploadsError(err.message || 'Failed to load import lineage history.');
    } finally {
      setLoadingUploads(false);
    }
  }, []);

  const fetchFlaggedLoans = useCallback(async () => {
    setLoadingFlagged(true);
    setFlaggedError(null);
    try {
      const res = await api.getLoans({ status: 'FLAGGED', limit: 25 });
      setFlaggedLoans(res.data?.items || []);
    } catch (err) {
      setFlaggedError(err.message || 'Failed to load flagged loan queue.');
    } finally {
      setLoadingFlagged(false);
    }
  }, []);

  const handleGenerateRule = async (e) => {
    e.preventDefault();
    if (!nlRuleDescription || nlRuleDescription.trim().length < 3) {
      setGenerationError('Natural language description must be at least 3 characters.');
      return;
    }

    setGeneratingRule(true);
    setGenerationError(null);
    setGeneratedRule(null);

    try {
      const res = await api.aiGenerateRule(nlRuleDescription);
      setGeneratedRule(res.data.rule);
      setNlRuleDescription('');
    } catch (err) {
      setGenerationError(err.message || 'Failed to generate structured rule configuration.');
    } finally {
      setGeneratingRule(false);
    }
  };

  const refreshAll = () => {
    fetchSummary();
    fetchUploads();
    fetchFlaggedLoans();
  };

  useEffect(() => {
    refreshAll();
  }, [fetchSummary, fetchUploads, fetchFlaggedLoans]);

  // File Ingestion Handler
  const handleFileUpload = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setUploadError('Invalid file type. Only standard RFC-4180 CSV files (.csv) are accepted.');
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadMessage(null);

    const formData = new FormData();
    formData.append('file', file);
    if (servicerUpdateFile) formData.append('servicerUpdate', servicerUpdateFile);
    if (documentManifestFile) formData.append('documentManifest', documentManifestFile);

    try {
      const res = await api.uploadLoanTape(formData);
      setUploadMessage(`Ingestion completed: "${res.data.filename}" (${res.data.totalRows?.toLocaleString()} rows parsed with SHA-256 provenance).`);
      refreshAll();
    } catch (err) {
      setUploadError(err.message || 'File upload failed. Ensure file is under 10MB and format is compliant.');
    } finally {
      setUploading(false);
    }
  };

  const filteredFlagged = searchQuery
    ? flaggedLoans.filter(
        (l) =>
          l.loanIdentifier?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          l.borrowerName?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : flaggedLoans;

  return (
    <div className="space-y-6">
      {/* 1. COLOR-BLOCK ANALYTICAL METRIC STRIP (PERIWINKLE -> LIME -> YELLOW -> CORAL) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Block 1: Total Records (Periwinkle #C1D8FF) */}
        <div className="block-periwinkle p-4 flex flex-col justify-between shadow-subtle">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-mono font-bold uppercase tracking-wider text-ref-periwinkle-text">
              Total Ingested
            </span>
            <span className="text-[10px] font-mono font-semibold text-ref-periwinkle-text/70 bg-white/50 px-1.5 py-0.5 rounded-xs">
              TAPE
            </span>
          </div>
          <div className="my-2">
            <span className="text-3xl font-bold tracking-tight font-mono text-ref-periwinkle-text tabular-nums">
              {loadingSummary ? '—' : summary?.totalLoans?.toLocaleString() ?? 0}
            </span>
            <span className="text-xs font-mono text-ref-periwinkle-text/80 ml-1">loans</span>
          </div>
          <div className="text-[11px] font-mono font-medium text-ref-periwinkle-text/90">
            {summary?.totalUploads ?? 0} active batch file(s)
          </div>
        </div>

        {/* Block 2: Verified & Sealed (Lime #CDE78C) */}
        <div className="block-lime p-4 flex flex-col justify-between shadow-subtle">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-mono font-bold uppercase tracking-wider text-ref-lime-text">
              Verified & Sealed
            </span>
            <span className="text-[10.5px] font-mono font-bold text-ref-lime-text bg-white/50 px-1.5 py-0.5 rounded-xs">
              {summary?.dataQualityScore?.percentage ?? 0}%
            </span>
          </div>
          <div className="my-2">
            <span className="text-3xl font-bold tracking-tight font-mono text-ref-lime-text tabular-nums">
              {loadingSummary ? '—' : summary?.verifiedLoansCount?.toLocaleString() ?? 0}
            </span>
            <span className="text-xs font-mono text-ref-lime-text/80 ml-1">sealed</span>
          </div>
          <div className="text-[11px] font-mono font-medium text-ref-lime-text/90">
            SHA-256 Attestation
          </div>
        </div>

        {/* Block 3: Open Exceptions (Pale Yellow #FFEB8C) */}
        <div className="block-yellow p-4 flex flex-col justify-between shadow-subtle">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-mono font-bold uppercase tracking-wider text-ref-yellow-text">
              Open Exceptions
            </span>
            <span className="text-[10px] font-mono font-semibold text-ref-yellow-text/80 bg-white/50 px-1.5 py-0.5 rounded-xs">
              QUEUE
            </span>
          </div>
          <div className="my-2">
            <span className="text-3xl font-bold tracking-tight font-mono text-ref-yellow-text tabular-nums">
              {loadingSummary ? '—' : summary?.totalOpenExceptions?.toLocaleString() ?? 0}
            </span>
            <span className="text-xs font-mono text-ref-yellow-text/80 ml-1">violations</span>
          </div>
          <div className="text-[11px] font-mono font-medium text-ref-yellow-text/90">
            {summary?.flaggedLoansCount ?? 0} flagged entities
          </div>
        </div>

        {/* Block 4: Critical Failures (Coral / Light Red #FEECEB) */}
        <div className="block-coral p-4 flex flex-col justify-between shadow-subtle">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-mono font-bold uppercase tracking-wider text-ref-coral-text">
              Critical Failures
            </span>
            <span className="text-[10px] font-mono font-bold bg-[#B42318] text-white px-1.5 py-0.5 rounded-xs">
              BLOCKING
            </span>
          </div>
          <div className="my-2">
            <span className="text-3xl font-bold tracking-tight font-mono text-ref-coral-text tabular-nums">
              {loadingSummary ? '—' : summary?.severityCounts?.CRITICAL ?? 0}
            </span>
            <span className="text-xs font-mono text-ref-coral-text/80 ml-1">items</span>
          </div>
          <div className="text-[11px] font-mono font-medium text-ref-coral-text/90">
            Requires Underwriter Sign-off
          </div>
        </div>
      </div>

      {summaryError && (
        <div className="p-3 bg-semantic-critical-bg border border-semantic-critical-border rounded-md text-semantic-critical text-xs font-mono">
          {summaryError}
        </div>
      )}

      {/* 1b. VALIDATION OUTCOME COMPOSITION (chart) */}
      <ValidationCompositionBar summary={summary} loading={loadingSummary} />

      {/* 2. FILE INTAKE OPERATION PANEL (PERIWINKLE-LIGHT SURFACE BAND) */}
      <div className="bg-ref-periwinkle-light border border-ref-periwinkle-border rounded-lg p-5 space-y-3 shadow-subtle">
        <div className="flex items-center justify-between border-b border-ref-periwinkle-border pb-2.5">
          <div className="flex items-center space-x-2">
            <UploadCloud className="w-5 h-5 text-ref-periwinkle-text" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-ref-periwinkle-text font-mono">
              File Intake & Lineage Operation
            </h3>
          </div>
          <span className="text-[10px] font-mono font-bold text-ref-periwinkle-text bg-white px-2 py-0.5 rounded-xs border border-ref-periwinkle-border">
            RFC-4180 Streaming Engine • Max: 10MB
          </span>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              handleFileUpload(e.dataTransfer.files[0]);
            }
          }}
          className={`border-2 border-dashed rounded-md p-6 text-center transition-all bg-white ${
            isDragging
              ? 'border-ref-teal bg-ref-teal-light'
              : 'border-ref-periwinkle-border hover:border-ref-teal'
          }`}
        >
          <input
            type="file"
            id="operatorCsvInput"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileUpload(e.target.files[0]);
              }
            }}
          />
          <label htmlFor="operatorCsvInput" className="cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-3">
            {uploading ? (
              <div className="py-1 flex items-center space-x-3 text-xs text-ref-teal font-mono font-bold">
                <Loader2 className="w-4 h-4 animate-spin text-ref-teal" />
                <span>Streaming tape, computing SHA-256 hash, and generating NormalizedLoan entities...</span>
              </div>
            ) : (
              <>
                <FileSpreadsheet className="w-5 h-5 text-ref-teal" />
                <div className="text-xs text-content-primary font-medium">
                  <span className="font-bold text-ref-teal underline font-mono">Select loan_tape.csv</span> or drop tape file here
                </div>
                <span className="text-[10px] text-content-muted font-mono font-semibold">(.csv, UTF-8)</span>
              </>
            )}
          </label>
        </div>

        {/* Optional secondary feeds — enable the cross-source-conflict and
            document-custody validation rules for this batch. Neither is
            required; validation still runs on the tape alone without them. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-[11px] font-mono text-content-secondary bg-white border border-ref-periwinkle-border rounded-md px-3 py-2 flex items-center justify-between cursor-pointer hover:border-ref-teal">
            <span className="truncate">
              Servicer Updates (optional): <span className="font-semibold text-content-primary">{servicerUpdateFile?.name || 'servicer_update.csv'}</span>
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => setServicerUpdateFile(e.target.files?.[0] || null)}
            />
          </label>
          <label className="text-[11px] font-mono text-content-secondary bg-white border border-ref-periwinkle-border rounded-md px-3 py-2 flex items-center justify-between cursor-pointer hover:border-ref-teal">
            <span className="truncate">
              Document Manifest (optional): <span className="font-semibold text-content-primary">{documentManifestFile?.name || 'document_manifest.csv'}</span>
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => setDocumentManifestFile(e.target.files?.[0] || null)}
            />
          </label>
        </div>

        {uploadMessage && (
          <div className="p-3 bg-semantic-verified-bg border border-semantic-verified-border rounded-md text-semantic-verified text-xs flex items-center space-x-2 font-mono font-bold">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <span>{uploadMessage}</span>
          </div>
        )}

        {uploadError && (
          <div className="p-3 bg-semantic-critical-bg border border-semantic-critical-border rounded-md text-semantic-critical text-xs flex items-center space-x-2 font-mono font-bold">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{uploadError}</span>
          </div>
        )}
      </div>

      {/* 2.5 AI VALIDATION RULE COPILOT (SOFT LIME-GREEN PANEL WITH SHADOW) */}
      <div className="bg-[#FBFDF9] border border-[#CDD7CB] rounded-lg p-5 space-y-3 shadow-subtle">
        <div className="flex items-center justify-between border-b border-[#CDD7CB] pb-2.5">
          <div className="flex items-center space-x-2">
            <BrainCircuit className="w-5 h-5 text-[#204E4C]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#204E4C] font-mono">
              AI Validation Rule Copilot
            </h3>
          </div>
          <span className="text-[10px] font-mono font-bold text-[#204E4C] bg-white px-2 py-0.5 rounded-xs border border-[#CDD7CB]">
            Natural Language to Rule Engine Configuration
          </span>
        </div>

        <form onSubmit={handleGenerateRule} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Describe a validation rule in plain English (e.g. 'Interest rate should not exceed 10.5%' or 'Original principal must be positive')..."
                value={nlRuleDescription}
                onChange={(e) => setNlRuleDescription(e.target.value)}
                className="w-full text-xs font-sans border border-[#CDD7CB] rounded-lg p-2.5 bg-white text-[#131D1B] placeholder:text-[#768883] focus:outline-none focus:ring-1 focus:ring-[#204E4C]"
              />
            </div>
            <button
              type="submit"
              disabled={generatingRule}
              style={{ backgroundColor: '#204E4C', color: '#FFFFFF' }}
              className="px-4 py-2.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center space-x-2 font-mono flex-shrink-0"
            >
              {generatingRule ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>Translate Rule</span>
            </button>
          </div>
        </form>

        {generationError && (
          <div className="p-3 bg-[#FEF3F2] border border-[#FECDCA] rounded-md text-xs text-[#B42318] font-mono font-bold">
            {generationError}
          </div>
        )}

        {generatedRule && (
          <div className="bg-white border border-[#CDD7CB] rounded-lg p-4 space-y-3 shadow-inner font-mono text-xs">
            <div className="flex items-center justify-between border-b border-[#CDD7CB]/50 pb-2">
              <span className="font-bold text-[#204E4C]">Generated Validation Configuration</span>
              <span className="badge-coral uppercase text-[9px] font-mono">
                {generatedRule.severity}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div>
                  <span className="text-[10px] text-[#768883] block">Rule Code</span>
                  <span className="font-bold text-[#131D1B]">{generatedRule.ruleCode}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#768883] block">Rule Name</span>
                  <span className="font-bold text-[#131D1B]">{generatedRule.name}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#768883] block">Rule Type</span>
                  <span className="font-bold text-[#204E4C]">{generatedRule.ruleType}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#768883] block">Category</span>
                  <span className="font-bold text-[#131D1B]">{generatedRule.category}</span>
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <span className="text-[10px] text-[#768883] block">Description</span>
                  <span className="text-[#334155] block font-sans text-xs">{generatedRule.description}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#768883] block">Configured Parameters</span>
                  <pre className="bg-[#F8FAFC] border border-[#E2E8F0] rounded p-2 text-[10px] text-[#475569] overflow-x-auto">
                    {JSON.stringify(generatedRule.parameters, null, 2)}
                  </pre>
                </div>
                <div>
                  <span className="text-[10px] text-[#768883] block">Failing Test Case Input</span>
                  <pre className="bg-[#FFF8F8] border border-[#FEE2E2] rounded p-2 text-[10px] text-[#991B1B] overflow-x-auto">
                    {JSON.stringify(generatedRule.mockTestCase, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
            
            <div className="pt-2 border-t border-[#CDD7CB]/50 text-[10px] text-[#768883] flex items-center justify-between font-sans">
              <span>This JSON is compliant with the validation engine's <code>validation_rules.json</code> format.</span>
              <span className="font-mono text-[#087443] font-bold">Rule validated & ready to commit</span>
            </div>
          </div>
        )}
      </div>

      {/* 3. WHITE DATA SURFACES: RECENT LINEAGE & WORK QUEUE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Recent Tape Lineage (6 Cols) */}
        <div className="lg:col-span-6 section-band p-5 space-y-3 bg-white">
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-content-primary font-mono">
                Recent Tape Lineage
              </h3>
              <span className="text-[11px] text-content-secondary font-medium font-sans">Source-of-truth file provenance</span>
            </div>
            <span className="text-[10px] font-mono font-bold text-ref-teal bg-surface-secondary px-2 py-0.5 rounded-xs border border-border">
              {uploads.length} files
            </span>
          </div>

          {loadingUploads ? (
            <div className="py-12 flex justify-center text-content-muted">
              <Loader2 className="w-5 h-5 animate-spin text-ref-teal" />
            </div>
          ) : uploadsError ? (
            <div className="p-3 bg-semantic-critical-bg border border-semantic-critical-border rounded-md text-semantic-critical text-xs font-mono">
              {uploadsError}
            </div>
          ) : uploads.length === 0 ? (
            <p className="text-xs text-content-muted text-center py-8 font-medium">No loan tape files ingested yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-[10px] text-content-muted font-mono font-bold uppercase tracking-wider">
                    <th className="pb-2">Source File & Hash</th>
                    <th className="pb-2 text-right">Rows</th>
                    <th className="pb-2 text-center">Status</th>
                    <th className="pb-2 text-right">Uploaded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {uploads.map((u) => (
                    <tr key={u.id} className="hover:bg-surface-secondary/40 transition-colors">
                      <td className="py-2.5 pr-2">
                        <div className="font-bold text-content-primary font-mono text-[11px]">{u.filename}</div>
                        <div className="font-mono text-[9.5px] text-content-muted truncate max-w-[200px]" title={u.fileHash}>
                          {u.fileHash}
                        </div>
                      </td>
                      <td className="py-2.5 text-right font-mono font-bold text-content-primary tabular-nums">
                        {u.rowCount?.toLocaleString() ?? 0}
                      </td>
                      <td className="py-2.5 text-center">
                        <span className="badge-verified">
                          {u.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-right text-content-secondary text-[11px] font-mono">
                        {new Date(u.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: Exceptions Requiring Review Queue (6 Cols) */}
        <div className="lg:col-span-6 section-band p-5 space-y-3 bg-white">
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-content-primary font-mono">
                Exceptions Requiring Review
              </h3>
              <span className="text-[11px] text-content-secondary font-medium font-sans">High & Critical underwriting violations</span>
            </div>
            <span className="badge-warning font-mono">
              {filteredFlagged.length} Flagged
            </span>
          </div>

          {loadingFlagged ? (
            <div className="py-12 flex justify-center text-content-muted">
              <Loader2 className="w-5 h-5 animate-spin text-semantic-warning" />
            </div>
          ) : flaggedError ? (
            <div className="p-3 bg-semantic-critical-bg border border-semantic-critical-border rounded-md text-semantic-critical text-xs font-mono">
              {flaggedError}
            </div>
          ) : filteredFlagged.length === 0 ? (
            <div className="py-8 text-center text-xs text-content-muted font-medium">
              All records in the current tape are verified or clean.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-[10px] text-content-muted font-mono font-bold uppercase tracking-wider sticky top-0 bg-white">
                    <th className="pb-2">Loan ID</th>
                    <th className="pb-2">Borrower</th>
                    <th className="pb-2 text-right">Balance</th>
                    <th className="pb-2 text-center">Violations</th>
                    <th className="pb-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredFlagged.map((loan) => (
                    <tr key={loan.id} className="hover:bg-surface-secondary/50 transition-colors">
                      <td className="py-2.5 font-mono font-bold text-content-primary">
                        {loan.loanIdentifier || '(Missing ID)'}
                      </td>
                      <td className="py-2.5 text-content-secondary font-medium truncate max-w-[120px] font-sans">
                        {loan.borrowerName || loan.borrowerId || 'Unknown'}
                      </td>
                      <td className="py-2.5 text-right font-mono font-bold text-content-primary tabular-nums">
                        ${loan.currentBalance?.toLocaleString() ?? '0.00'}
                      </td>
                      <td className="py-2.5 text-center">
                        <span className="badge-critical font-mono">
                          {loan.exceptions?.length || 1}
                        </span>
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          onClick={() => onSelectLoan && onSelectLoan(loan.id)}
                          className="btn-institutional-ghost text-ref-teal text-[11px] font-bold font-mono"
                        >
                          <span>Inspect</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
