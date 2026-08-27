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
} from 'lucide-react';

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
      {/* 1. HORIZONTAL ANALYTICAL METRIC BAND (TYPOGRAPHY + VERTICAL DIVIDERS) */}
      <div className="section-band p-5">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-border">
          <div>
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-content-primary">
              Data Control Room Summary
            </h2>
            <p className="text-xs text-content-secondary mt-0.5">
              Portfolio lineage and ingestion metrics across active loan tape batches
            </p>
          </div>
          <button
            onClick={refreshAll}
            className="btn-institutional-secondary text-xs"
            title="Refresh feeds"
          >
            <RefreshCw className="w-3.5 h-3.5 text-content-secondary" />
            <span>Refresh Feeds</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 divide-y sm:divide-y-0 sm:divide-x divide-border">
          {/* Total Records */}
          <div className="pt-2 sm:pt-0 sm:px-3">
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-content-muted block">
              Total Records
            </span>
            <div className="mt-1 flex items-baseline space-x-1.5">
              <span className="text-2xl font-bold tracking-tight text-content-primary font-mono tabular-nums">
                {loadingSummary ? '—' : summary?.totalLoans?.toLocaleString() ?? 0}
              </span>
              <span className="text-[11px] text-content-muted">loans</span>
            </div>
            <span className="text-[11px] text-content-secondary mt-1 block font-mono">
              {summary?.totalUploads ?? 0} batch file(s)
            </span>
          </div>

          {/* Verified */}
          <div className="pt-2 sm:pt-0 sm:px-3">
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-semantic-verified block">
              Verified & Sealed
            </span>
            <div className="mt-1 flex items-baseline space-x-1.5">
              <span className="text-2xl font-bold tracking-tight text-semantic-verified font-mono tabular-nums">
                {loadingSummary ? '—' : summary?.verifiedLoansCount?.toLocaleString() ?? 0}
              </span>
              <span className="text-[11px] font-medium text-semantic-verified font-mono">
                ({summary?.dataQualityScore?.percentage ?? 0}%)
              </span>
            </div>
            <span className="text-[11px] text-content-secondary mt-1 block">
              SHA-256 attested
            </span>
          </div>

          {/* Open Exceptions */}
          <div className="pt-2 sm:pt-0 sm:px-3">
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-semantic-warning block">
              Open Exceptions
            </span>
            <div className="mt-1 flex items-baseline space-x-1.5">
              <span className="text-2xl font-bold tracking-tight text-semantic-warning font-mono tabular-nums">
                {loadingSummary ? '—' : summary?.totalOpenExceptions?.toLocaleString() ?? 0}
              </span>
              <span className="text-[11px] text-content-muted">violations</span>
            </div>
            <span className="text-[11px] text-content-secondary mt-1 block font-mono">
              {summary?.flaggedLoansCount ?? 0} loans affected
            </span>
          </div>

          {/* Critical Failures */}
          <div className="pt-2 sm:pt-0 sm:px-3">
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-semantic-critical block">
              Critical Failures
            </span>
            <div className="mt-1 flex items-baseline space-x-1.5">
              <span className="text-2xl font-bold tracking-tight text-semantic-critical font-mono tabular-nums">
                {loadingSummary ? '—' : summary?.severityCounts?.CRITICAL ?? 0}
              </span>
              <span className="text-[11px] text-content-muted">blocking</span>
            </div>
            <span className="text-[11px] text-content-secondary mt-1 block">
              Requires underwriter sign-off
            </span>
          </div>
        </div>
      </div>

      {summaryError && (
        <div className="p-3 bg-semantic-critical-bg border border-semantic-critical-border rounded-xs text-semantic-critical text-xs font-mono">
          {summaryError}
        </div>
      )}

      {/* 2. FILE INTAKE OPERATION PANEL */}
      <div className="section-band p-5 space-y-3">
        <div className="flex items-center justify-between border-b border-border pb-2.5">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-content-primary font-mono">
              File Intake Operation
            </h3>
            <p className="text-xs text-content-secondary mt-0.5">
              Streaming RFC-4180 CSV parser with 20,000-row memory protection boundary and SHA-256 raw file hashing.
            </p>
          </div>
          <span className="text-[10px] font-mono text-content-muted">Max: 10MB</span>
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
          className={`border border-dashed rounded-xs p-6 text-center transition-colors ${
            isDragging
              ? 'border-brand-institutional bg-surface-secondary'
              : 'border-border hover:border-border-strong bg-surface-secondary/40'
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
          <label htmlFor="operatorCsvInput" className="cursor-pointer flex flex-col items-center justify-center">
            {uploading ? (
              <div className="py-2 flex items-center space-x-3 text-xs text-content-primary font-mono">
                <Loader2 className="w-4 h-4 animate-spin text-brand-institutional" />
                <span>Streaming tape, computing SHA-256 hash, and generating NormalizedLoan entities...</span>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <UploadCloud className="w-4 h-4 text-content-secondary" />
                <div className="text-xs text-content-primary">
                  <span className="font-semibold text-brand-institutional underline font-mono">Select loan_tape.csv</span> or drag and drop file here
                </div>
                <span className="text-[10px] text-content-muted font-mono">(.csv, UTF-8)</span>
              </div>
            )}
          </label>
        </div>

        {uploadMessage && (
          <div className="p-3 bg-semantic-verified-bg border border-semantic-verified-border rounded-xs text-semantic-verified text-xs flex items-center space-x-2 font-mono">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <span>{uploadMessage}</span>
          </div>
        )}

        {uploadError && (
          <div className="p-3 bg-semantic-critical-bg border border-semantic-critical-border rounded-xs text-semantic-critical text-xs flex items-center space-x-2 font-mono">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{uploadError}</span>
          </div>
        )}
      </div>

      {/* 3. SPLIT CONTROL ROOM: RECENT LINEAGE & WORK QUEUE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Recent Tape Lineage (6 Cols) */}
        <div className="lg:col-span-6 section-band p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-content-primary font-mono">
                Recent Tape Lineage
              </h3>
              <span className="text-[11px] text-content-secondary">Source-of-truth file provenance</span>
            </div>
            <span className="text-[10px] font-mono text-content-muted bg-surface-secondary px-2 py-0.5 rounded-xs border border-border">
              {uploads.length} files
            </span>
          </div>

          {loadingUploads ? (
            <div className="py-12 flex justify-center text-content-muted">
              <Loader2 className="w-5 h-5 animate-spin text-brand-institutional" />
            </div>
          ) : uploadsError ? (
            <div className="p-3 bg-semantic-critical-bg border border-semantic-critical-border rounded-xs text-semantic-critical text-xs font-mono">
              {uploadsError}
            </div>
          ) : uploads.length === 0 ? (
            <p className="text-xs text-content-muted text-center py-8">No loan tape files ingested yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-[10px] text-content-muted font-mono font-semibold uppercase tracking-wider">
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
                        <div className="font-medium text-content-primary font-mono text-[11px]">{u.filename}</div>
                        <div className="font-mono text-[9.5px] text-content-muted truncate max-w-[200px]" title={u.fileHash}>
                          {u.fileHash}
                        </div>
                      </td>
                      <td className="py-2.5 text-right font-mono font-medium text-content-primary tabular-nums">
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
        <div className="lg:col-span-6 section-band p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-content-primary font-mono">
                Exceptions Requiring Review
              </h3>
              <span className="text-[11px] text-content-secondary">High & Critical underwriting violations</span>
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
            <div className="p-3 bg-semantic-critical-bg border border-semantic-critical-border rounded-xs text-semantic-critical text-xs font-mono">
              {flaggedError}
            </div>
          ) : filteredFlagged.length === 0 ? (
            <div className="py-8 text-center text-xs text-content-muted">
              All records in the current tape are verified or clean.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-[10px] text-content-muted font-mono font-semibold uppercase tracking-wider sticky top-0 bg-surface">
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
                      <td className="py-2.5 font-mono font-semibold text-content-primary">
                        {loan.loanIdentifier || '(Missing ID)'}
                      </td>
                      <td className="py-2.5 text-content-secondary truncate max-w-[120px]">
                        {loan.borrowerName || loan.borrowerId || 'Unknown'}
                      </td>
                      <td className="py-2.5 text-right font-mono font-medium text-content-primary tabular-nums">
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
                          className="btn-institutional-ghost text-brand-institutional text-[11px] font-semibold font-mono"
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
