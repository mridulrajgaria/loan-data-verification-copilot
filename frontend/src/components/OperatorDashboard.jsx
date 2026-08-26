import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import {
  UploadCloud,
  FileCheck,
  AlertOctagon,
  AlertTriangle,
  Info,
  ShieldAlert,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Loader2,
  FileSpreadsheet,
  Clock,
} from 'lucide-react';

export default function OperatorDashboard({ onSelectLoan, onOpenAudit }) {
  // State
  const [summary, setSummary] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [flaggedLoans, setFlaggedLoans] = useState([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingUploads, setLoadingUploads] = useState(true);
  const [loadingFlagged, setLoadingFlagged] = useState(true);
  const [summaryError, setSummaryError] = useState(null);
  const [uploadsError, setUploadsError] = useState(null);
  const [flaggedError, setFlaggedError] = useState(null);

  // Upload drag & drop state
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
      setSummaryError(err.message || 'Failed to load portfolio summary metrics.');
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
      setUploadsError(err.message || 'Failed to load import history.');
    } finally {
      setLoadingUploads(false);
    }
  }, []);

  const fetchFlaggedLoans = useCallback(async () => {
    setLoadingFlagged(true);
    setFlaggedError(null);
    try {
      const res = await api.getLoans({ status: 'FLAGGED', limit: 15 });
      setFlaggedLoans(res.data?.items || []);
    } catch (err) {
      setFlaggedError(err.message || 'Failed to load flagged loan records.');
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

  // Handle File Upload
  const handleFileUpload = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setUploadError('Invalid file format. Please upload a standard RFC-4180 CSV file (.csv).');
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadMessage(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.uploadLoanTape(formData);
      setUploadMessage(`Successfully ingested "${res.data.filename}" (${res.data.totalRows} rows). Ingestion success rate: ${res.data.successRatePercentage}`);
      refreshAll();
    } catch (err) {
      setUploadError(err.message || 'Upload failed. Ensure file size is under 10MB and format is compliant.');
    } finally {
      setUploading(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Data Operator Dashboard</h2>
          <p className="text-sm text-slate-400">
            Ingest loan tapes, inspect import lineage provenance, and review anomaly validation health.
          </p>
        </div>
        <button
          onClick={refreshAll}
          className="flex items-center space-x-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition-colors self-start md:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Feeds</span>
        </button>
      </div>

      {/* 1. Validation Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Critical */}
        <div className="bg-slate-900/80 border border-red-900/40 rounded-xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider uppercase text-red-400">Critical Failures</span>
            <AlertOctagon className="w-5 h-5 text-red-400" />
          </div>
          <div className="mt-3">
            {loadingSummary ? (
              <div className="h-8 w-16 bg-slate-800 animate-pulse rounded"></div>
            ) : (
              <span className="text-3xl font-extrabold text-white">
                {summary?.severityCounts?.CRITICAL ?? 0}
              </span>
            )}
            <p className="text-xs text-slate-400 mt-1">Requires immediate human sign-off</p>
          </div>
        </div>

        {/* High */}
        <div className="bg-slate-900/80 border border-amber-900/40 rounded-xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider uppercase text-amber-400">High Severity</span>
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <div className="mt-3">
            {loadingSummary ? (
              <div className="h-8 w-16 bg-slate-800 animate-pulse rounded"></div>
            ) : (
              <span className="text-3xl font-extrabold text-white">
                {summary?.severityCounts?.HIGH ?? 0}
              </span>
            )}
            <p className="text-xs text-slate-400 mt-1">Policy & cross-source conflicts</p>
          </div>
        </div>

        {/* Medium */}
        <div className="bg-slate-900/80 border border-yellow-900/40 rounded-xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider uppercase text-yellow-400">Medium Severity</span>
            <ShieldAlert className="w-5 h-5 text-yellow-400" />
          </div>
          <div className="mt-3">
            {loadingSummary ? (
              <div className="h-8 w-16 bg-slate-800 animate-pulse rounded"></div>
            ) : (
              <span className="text-3xl font-extrabold text-white">
                {summary?.severityCounts?.MEDIUM ?? 0}
              </span>
            )}
            <p className="text-xs text-slate-400 mt-1">Custody & document gaps</p>
          </div>
        </div>

        {/* Warning / Clean */}
        <div className="bg-slate-900/80 border border-blue-900/40 rounded-xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider uppercase text-blue-400">Warnings / Clean</span>
            <Info className="w-5 h-5 text-blue-400" />
          </div>
          <div className="mt-3">
            {loadingSummary ? (
              <div className="h-8 w-16 bg-slate-800 animate-pulse rounded"></div>
            ) : (
              <span className="text-3xl font-extrabold text-white">
                {summary?.severityCounts?.WARNING ?? 0}
              </span>
            )}
            <p className="text-xs text-slate-400 mt-1">Staleness & format warnings</p>
          </div>
        </div>
      </div>

      {summaryError && (
        <div className="p-4 bg-red-950/40 border border-red-800 rounded-lg text-red-300 text-xs">
          {summaryError}
        </div>
      )}

      {/* 2. File Ingestion Section (Drag & Drop + Button) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 shadow-xl">
        <h3 className="text-base font-semibold text-white mb-2 flex items-center space-x-2">
          <FileSpreadsheet className="w-5 h-5 text-blue-400" />
          <span>Upload New Loan Tape File</span>
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Streaming CSV parser with 20,000-row DoS protection boundary and cryptographic SHA-256 file hashing.
        </p>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
            isDragging
              ? 'border-blue-500 bg-blue-950/20'
              : 'border-slate-700 hover:border-slate-600 bg-slate-950/40'
          }`}
        >
          <input
            type="file"
            id="csvFileInput"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileUpload(e.target.files[0]);
              }
            }}
          />
          <label htmlFor="csvFileInput" className="cursor-pointer flex flex-col items-center justify-center">
            {uploading ? (
              <div className="py-4 flex flex-col items-center space-y-2">
                <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
                <p className="text-sm font-medium text-slate-200">Streaming & normalising records...</p>
                <p className="text-xs text-slate-500">Writing RawLoanRecord provenance layer</p>
              </div>
            ) : (
              <>
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-400 mb-3">
                  <UploadCloud className="w-8 h-8" />
                </div>
                <p className="text-sm font-medium text-white mb-1">
                  Drag and drop loan_tape.csv here, or <span className="text-blue-400 underline">browse files</span>
                </p>
                <p className="text-xs text-slate-500">Supports standard RFC-4180 CSV files up to 10MB (max 20,000 rows)</p>
              </>
            )}
          </label>
        </div>

        {uploadMessage && (
          <div className="mt-4 p-3.5 bg-emerald-950/40 border border-emerald-800 rounded-lg text-emerald-300 text-xs flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{uploadMessage}</span>
          </div>
        )}

        {uploadError && (
          <div className="mt-4 p-3.5 bg-red-950/40 border border-red-800 rounded-lg text-red-300 text-xs flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{uploadError}</span>
          </div>
        )}
      </div>

      {/* 3. Grid of Import History & Records Needing Correction */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Import History Table */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-white flex items-center space-x-2">
              <Clock className="w-4 h-4 text-blue-400" />
              <span>Import Provenance History</span>
            </h3>
            <span className="text-xs text-slate-400">{uploads.length} uploaded files</span>
          </div>

          {loadingUploads ? (
            <div className="py-12 flex justify-center text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : uploadsError ? (
            <div className="p-3 bg-red-950/40 border border-red-800 rounded text-red-300 text-xs">
              {uploadsError}
            </div>
          ) : uploads.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center">No loan tape files uploaded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                    <th className="pb-2.5">File & SHA-256</th>
                    <th className="pb-2.5">Rows</th>
                    <th className="pb-2.5">Status</th>
                    <th className="pb-2.5 text-right">Uploaded At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {uploads.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 pr-2">
                        <span className="font-semibold text-slate-200 block">{u.filename}</span>
                        <span className="font-mono text-[10px] text-slate-500 truncate block max-w-[160px]">
                          {u.fileHash}
                        </span>
                      </td>
                      <td className="py-3 font-mono text-slate-300">
                        {u.rowCount?.toLocaleString() || 0}
                      </td>
                      <td className="py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                            u.status === 'COMPLETED'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                              : 'bg-amber-950 text-amber-400 border border-amber-800/60'
                          }`}
                        >
                          {u.status}
                        </span>
                      </td>
                      <td className="py-3 text-right text-slate-400">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Records Needing Correction List */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-white flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>Flagged Records Needing Review</span>
            </h3>
            <span className="text-xs text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded">
              {summary?.flaggedLoansCount ?? flaggedLoans.length} Flagged
            </span>
          </div>

          {loadingFlagged ? (
            <div className="py-12 flex justify-center text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
            </div>
          ) : flaggedError ? (
            <div className="p-3 bg-red-950/40 border border-red-800 rounded text-red-300 text-xs">
              {flaggedError}
            </div>
          ) : flaggedLoans.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-60" />
              <p>All ingested records are currently verified or clean.</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {flaggedLoans.map((l) => (
                <div
                  key={l.id}
                  className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-lg hover:border-slate-700 transition-all flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-xs text-white">
                        {l.loanIdentifier || '(Missing ID)'}
                      </span>
                      <span className="text-slate-400 text-xs">
                        {l.borrowerName || l.borrowerId || 'Unknown'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1 flex items-center space-x-2">
                      <span>${l.originalPrincipal?.toLocaleString() ?? 0}</span>
                      <span>•</span>
                      <span>{l.exceptions?.length || 1} Open Violation(s)</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => onSelectLoan && onSelectLoan(l.id)}
                      className="px-2.5 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded text-xs font-semibold flex items-center space-x-1 transition-colors"
                    >
                      <span>Inspect</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
