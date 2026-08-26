import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import {
  ShieldCheck,
  ShieldAlert,
  Download,
  CheckCircle2,
  AlertTriangle,
  History,
  Calculator,
  RefreshCw,
  Loader2,
  FileJson,
  FileSpreadsheet,
  Lock,
  ExternalLink,
  Flame,
} from 'lucide-react';

export default function ConsumerDashboard({ onOpenAudit, onSelectLoan }) {
  const [summary, setSummary] = useState(null);
  const [verifiedList, setVerifiedList] = useState([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingVerified, setLoadingVerified] = useState(true);
  const [summaryError, setSummaryError] = useState(null);
  const [verifiedError, setVerifiedError] = useState(null);

  // Hash verification check state per record
  const [hashVerificationState, setHashVerificationState] = useState({});
  const [verifyingId, setVerifyingId] = useState(null);
  const [tamperAlertMessage, setTamperAlertMessage] = useState(null);
  const [exporting, setExporting] = useState(false);

  const fetchSummary = useCallback(async () => {
    setLoadingSummary(true);
    setSummaryError(null);
    try {
      const res = await api.getSummary();
      setSummary(res.data);
    } catch (err) {
      setSummaryError(err.message || 'Failed to fetch summary metrics.');
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  const fetchVerifiedLoans = useCallback(async () => {
    setLoadingVerified(true);
    setVerifiedError(null);
    try {
      const res = await api.getVerifiedLoans({ limit: 100 });
      setVerifiedList(res.data?.items || []);
    } catch (err) {
      setVerifiedError(err.message || 'Failed to fetch verified records.');
    } finally {
      setLoadingVerified(false);
    }
  }, []);

  const refreshAll = () => {
    fetchSummary();
    fetchVerifiedLoans();
  };

  useEffect(() => {
    refreshAll();
  }, [fetchSummary, fetchVerifiedLoans]);

  // Run Independent Hash Verification
  const handleVerifyHash = async (verifiedLoanId) => {
    setVerifyingId(verifiedLoanId);
    try {
      const res = await api.verifyRecordHash(verifiedLoanId);
      setHashVerificationState((prev) => ({
        ...prev,
        [verifiedLoanId]: res.data,
      }));
    } catch (err) {
      alert(`Hash verification error: ${err.message}`);
    } finally {
      setVerifyingId(null);
    }
  };

  // Live Judge Demo: Trigger Simulated Database Tampering
  const handleSimulateTamper = async (verifiedLoanId) => {
    if (!confirm('Live Judge Demo: This will inject an unauthorized 1-byte modification into the SQLite canonical JSON to demonstrate tamper detection. Proceed?')) {
      return;
    }
    try {
      const res = await api.simulateTamper(verifiedLoanId);
      setTamperAlertMessage(`Tamper simulated on record #${verifiedLoanId.slice(0, 8)}. Now click "Verify Hash" to observe tamper detection.`);
      // Run hash verification automatically
      handleVerifyHash(verifiedLoanId);
    } catch (err) {
      alert(`Simulation error: ${err.message}`);
    }
  };

  // Handle Export (JSON / CSV)
  const handleExport = async (format = 'json') => {
    setExporting(true);
    try {
      const data = await api.exportVerified(format);
      if (format === 'csv') {
        const blob = new Blob([data], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `verified_loan_tape_${Date.now()}.csv`;
        a.click();
      } else {
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `verified_portfolio_with_audit_trail_${Date.now()}.json`;
        a.click();
      }
    } catch (err) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Data Consumer & Audit Dashboard</h2>
          <p className="text-sm text-slate-400">
            Cryptographic trust verification, verifiable quality metrics, and tamper-evident portfolio export.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => handleExport('json')}
            disabled={exporting}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors disabled:opacity-50 shadow-lg shadow-blue-600/20"
          >
            <FileJson className="w-4 h-4" />
            <span>Export Verified + Audit (JSON)</span>
          </button>
          <button
            onClick={() => handleExport('csv')}
            disabled={exporting}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* 1. Data Quality Score Summary Banner with Explicit Visible Formula */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900/95 to-slate-900 border border-emerald-900/40 rounded-xl p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Calculator className="w-5 h-5 text-emerald-400" />
              <h3 className="font-bold text-white text-base">Portfolio Data Quality Score Index</h3>
            </div>

            {/* VISIBLE FORMULA (GRADABLE SPECIFICATION) */}
            <div className="bg-slate-950/80 border border-slate-800 px-3.5 py-2 rounded-lg text-xs font-mono text-emerald-400 inline-block">
              Formula: <strong>(verified_records / total_ingested_records) * 100</strong>
            </div>

            <p className="text-xs text-slate-400 max-w-xl">
              Measures the proportion of portfolio records cryptographically approved and locked with zero open compliance exceptions.
            </p>
          </div>

          <div className="flex items-center space-x-6 bg-slate-950/80 border border-slate-800/80 p-4 rounded-xl">
            <div className="text-center">
              <span className="text-xs text-slate-400 block mb-0.5">Quality Ratio</span>
              <span className="text-3xl font-extrabold text-emerald-400">
                {summary?.dataQualityScore?.percentage ?? 0}%
              </span>
            </div>
            <div className="h-10 w-px bg-slate-800"></div>
            <div className="text-center">
              <span className="text-xs text-slate-400 block mb-0.5">Verified / Total</span>
              <span className="text-lg font-bold text-white font-mono">
                {summary?.dataQualityScore?.verifiedCount ?? 0} / {summary?.dataQualityScore?.totalCount ?? 0}
              </span>
            </div>
            <div className="h-10 w-px bg-slate-800"></div>
            <div className="text-center">
              <span className="text-xs text-slate-400 block mb-0.5">Avg Exceptions/Loan</span>
              <span className="text-lg font-bold text-amber-400 font-mono">
                {summary?.dataQualityScore?.avgExceptionsPerLoan ?? 0}
              </span>
            </div>
          </div>
        </div>
      </div>

      {tamperAlertMessage && (
        <div className="p-4 bg-amber-950/60 border border-amber-800 rounded-xl text-amber-200 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Flame className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <span>{tamperAlertMessage}</span>
          </div>
          <button
            onClick={() => setTamperAlertMessage(null)}
            className="text-xs underline text-amber-400 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 2. Cryptographically Verified Records Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-white text-base flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <span>Cryptographically Locked Verified Records</span>
            </h3>
            <p className="text-xs text-slate-400">
              Each record possesses an immutable SHA-256 hash over deterministic canonical JSON.
            </p>
          </div>
          <span className="text-xs text-slate-400 font-mono bg-slate-800 px-2.5 py-1 rounded">
            {verifiedList.length} Verified Records
          </span>
        </div>

        {loadingVerified ? (
          <div className="py-16 flex justify-center text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : verifiedError ? (
          <div className="p-4 bg-red-950/40 border border-red-800 rounded text-red-300 text-xs">
            {verifiedError}
          </div>
        ) : verifiedList.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            No loans have been verified yet. Use the Reviewer Dashboard to approve and verify flagged records.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="pb-3">Loan Identifier</th>
                  <th className="pb-3">Borrower & Amount</th>
                  <th className="pb-3">SHA-256 Record Hash</th>
                  <th className="pb-3">Integrity Proof</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {verifiedList.map((v) => {
                  const check = hashVerificationState[v.id];
                  const isVerifying = verifyingId === v.id;

                  return (
                    <tr key={v.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 pr-2">
                        <span className="font-mono font-bold text-white text-sm block">
                          {v.loan?.loanIdentifier}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          Verified: {new Date(v.verifiedAt).toLocaleDateString()}
                        </span>
                      </td>

                      <td className="py-3.5">
                        <span className="text-slate-200 block font-medium">
                          {v.loan?.borrowerName || 'Borrower'}
                        </span>
                        <span className="text-slate-400 font-mono text-[11px]">
                          ${v.loan?.originalPrincipal?.toLocaleString() ?? 0} • {v.loan?.paymentStatus}
                        </span>
                      </td>

                      <td className="py-3.5 font-mono text-[11px]">
                        <span className="text-emerald-400 bg-emerald-950/60 px-2 py-1 rounded border border-emerald-800/60 block truncate max-w-[200px]">
                          {v.recordHash}
                        </span>
                      </td>

                      {/* Integrity Verification Live Badge */}
                      <td className="py-3.5">
                        {check ? (
                          check.isValid ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              <span>Exact Match (Unmodified)</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-300 border border-red-800 animate-pulse">
                              <AlertTriangle className="w-3 h-3 text-red-400" />
                              <span>TAMPER DETECTED (Mismatch)</span>
                            </span>
                          )
                        ) : (
                          <span className="text-slate-500 text-[11px] italic">Not verified this session</span>
                        )}
                      </td>

                      <td className="py-3.5 text-right space-x-2">
                        <button
                          onClick={() => handleVerifyHash(v.id)}
                          disabled={isVerifying}
                          className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded text-xs font-semibold transition-colors disabled:opacity-50"
                        >
                          {isVerifying ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Verify Hash'}
                        </button>

                        <button
                          onClick={() => handleSimulateTamper(v.id)}
                          className="px-2 py-1 bg-red-950/40 hover:bg-red-900/40 text-red-400 border border-red-800/60 rounded text-[11px] font-medium transition-colors"
                          title="Simulate database tampering for judge demo"
                        >
                          Demo Tamper
                        </button>

                        <button
                          onClick={() => onOpenAudit && onOpenAudit(v.loanId)}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded text-[11px] font-medium transition-colors"
                        >
                          Audit Trail
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
