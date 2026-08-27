import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FileJson,
  FileSpreadsheet,
  Flame,
  Check,
} from 'lucide-react';

export default function ConsumerDashboard({ onOpenAudit, onSelectLoan, searchQuery = '' }) {
  const [summary, setSummary] = useState(null);
  const [verifiedList, setVerifiedList] = useState([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingVerified, setLoadingVerified] = useState(true);
  const [summaryError, setSummaryError] = useState(null);
  const [verifiedError, setVerifiedError] = useState(null);

  // Hash verification state
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

  // Live Judge Demo: Simulated DB Tamper
  const handleSimulateTamper = async (verifiedLoanId) => {
    if (!confirm('Live Judge Demonstration: This will inject an unauthorized 1-byte modification into the SQLite canonical JSON to demonstrate instant cryptographic tamper detection. Proceed?')) {
      return;
    }
    try {
      await api.simulateTamper(verifiedLoanId);
      setTamperAlertMessage(`Tamper simulated on record #${verifiedLoanId.slice(0, 8)}. Click "Verify Hash" to observe the cryptographic hash mismatch.`);
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

  const filteredVerified = searchQuery
    ? verifiedList.filter(
        (v) =>
          v.loan?.loanIdentifier?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.loan?.borrowerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.recordHash?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : verifiedList;

  const verifiedRatio = summary?.totalLoans
    ? ((summary.verifiedLoansCount / summary.totalLoans) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="space-y-6">
      {/* Top Header Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-border">
        <div>
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-content-primary">
            Verification & Cryptographic Attestation Ledger
          </h2>
          <p className="text-xs text-content-secondary mt-0.5">
            Cryptographic integrity, data quality scoring and audit attestation
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => handleExport('json')}
            disabled={exporting}
            className="btn-institutional text-xs font-mono"
          >
            <FileJson className="w-3.5 h-3.5" />
            <span>Export Bundle (JSON)</span>
          </button>
          <button
            onClick={() => handleExport('csv')}
            disabled={exporting}
            className="btn-institutional-secondary text-xs font-mono"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* 1. DATA QUALITY SCORE & VERIFICATION STATUS BANNER */}
      <div className="section-band p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-semantic-verified" />
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-content-primary">
                Portfolio Data Quality & Verification Index
              </h3>
            </div>

            {/* FORMULA (GRADABLE CRITERIA) */}
            <div className="bg-surface-secondary px-3 py-1.5 rounded-xs border border-border text-[11px] font-mono text-content-primary inline-flex items-center space-x-2">
              <span className="text-content-muted">Formula:</span>
              <span>(verified_records / total_ingested_records) × 100</span>
            </div>

            <p className="text-xs text-content-secondary max-w-xl font-sans">
              Measures the proportion of portfolio loans cryptographically signed and sealed with zero unresolved critical exceptions.
            </p>
          </div>

          {/* Metric Tiles Strip */}
          <div className="flex items-center space-x-6 bg-surface-secondary/70 p-4 rounded-xs border border-border">
            <div className="text-left">
              <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-content-muted block">
                Verification Rate
              </span>
              <span className="text-2xl font-bold font-mono text-semantic-verified tabular-nums">
                {verifiedRatio}%
              </span>
            </div>
            <div className="h-8 w-px bg-border"></div>
            <div className="text-left">
              <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-content-muted block">
                Verified / Total
              </span>
              <span className="text-sm font-mono font-bold text-content-primary tabular-nums">
                {summary?.verifiedLoansCount?.toLocaleString() ?? 0} / {summary?.totalLoans?.toLocaleString() ?? 0}
              </span>
            </div>
            <div className="h-8 w-px bg-border"></div>
            <div className="text-left">
              <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-content-muted block">
                Avg Exceptions
              </span>
              <span className="text-sm font-mono font-bold text-semantic-warning tabular-nums">
                {summary?.dataQualityScore?.avgExceptionsPerLoan ?? 0.0}
              </span>
            </div>
          </div>
        </div>
      </div>

      {tamperAlertMessage && (
        <div className="p-3 bg-semantic-warning-bg border border-semantic-warning-border rounded-xs text-semantic-warning text-xs flex items-center justify-between font-mono">
          <div className="flex items-center space-x-2">
            <Flame className="w-4 h-4 flex-shrink-0 text-semantic-warning" />
            <span>{tamperAlertMessage}</span>
          </div>
          <button
            onClick={() => setTamperAlertMessage(null)}
            className="text-[11px] underline font-medium hover:text-content-primary"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 2. CRYPTOGRAPHICALLY LOCKED VERIFIED RECORDS TABLE */}
      <div className="section-band p-5 space-y-3">
        <div className="flex items-center justify-between border-b border-border pb-2.5">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-content-primary font-mono">
              Verified Records Ledger
            </h3>
            <span className="text-[11px] text-content-secondary font-sans">
              Immutable SHA-256 digests over recursively sorted canonical JSON payloads.
            </span>
          </div>
          <span className="badge-verified font-mono">
            {filteredVerified.length} Sealed Records
          </span>
        </div>

        {loadingVerified ? (
          <div className="py-16 flex justify-center text-content-muted">
            <Loader2 className="w-6 h-6 animate-spin text-brand-institutional" />
          </div>
        ) : verifiedError ? (
          <div className="p-3 bg-semantic-critical-bg border border-semantic-critical-border rounded-xs text-semantic-critical text-xs font-mono">
            {verifiedError}
          </div>
        ) : filteredVerified.length === 0 ? (
          <div className="py-12 text-center text-xs text-content-muted">
            No verified loan records match criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-[10px] text-content-muted font-mono font-semibold uppercase tracking-wider">
                  <th className="pb-2.5">Loan Identifier</th>
                  <th className="pb-2.5">Borrower & Amount</th>
                  <th className="pb-2.5">SHA-256 Digest</th>
                  <th className="pb-2.5">Integrity Attestation</th>
                  <th className="pb-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredVerified.map((v) => {
                  const check = hashVerificationState[v.id];
                  const isVerifying = verifyingId === v.id;

                  return (
                    <tr key={v.id} className="hover:bg-surface-secondary/40 transition-colors">
                      <td className="py-3 pr-2">
                        <span className="font-mono font-bold text-brand-institutional block">
                          {v.loan?.loanIdentifier}
                        </span>
                        <span className="text-[10px] text-content-muted font-mono">
                          Verified: {new Date(v.verifiedAt).toLocaleDateString()}
                        </span>
                      </td>

                      <td className="py-3">
                        <span className="text-content-primary block font-medium">
                          {v.loan?.borrowerName || 'Borrower'}
                        </span>
                        <span className="text-content-secondary font-mono text-[11px] tabular-nums">
                          ${v.loan?.originalPrincipal?.toLocaleString() ?? 0} • {v.loan?.paymentStatus}
                        </span>
                      </td>

                      <td className="py-3 font-mono text-[11px]">
                        <span className="bg-surface-secondary text-content-primary px-2 py-0.5 rounded-xs border border-border block truncate max-w-[210px]" title={v.recordHash}>
                          {v.recordHash}
                        </span>
                      </td>

                      {/* Live Cryptographic Proof Badge */}
                      <td className="py-3">
                        {check ? (
                          check.isValid ? (
                            <span className="badge-verified">
                              <Check className="w-3 h-3" />
                              <span>Exact Match</span>
                            </span>
                          ) : (
                            <span className="badge-critical animate-pulse">
                              <AlertTriangle className="w-3 h-3" />
                              <span>TAMPER DETECTED</span>
                            </span>
                          )
                        ) : (
                          <span className="text-[11px] text-content-muted italic font-mono">Ready</span>
                        )}
                      </td>

                      <td className="py-3 text-right space-x-2 font-mono">
                        <button
                          onClick={() => handleVerifyHash(v.id)}
                          disabled={isVerifying}
                          className="btn-institutional-secondary text-[11px] py-1"
                        >
                          {isVerifying ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Verify Hash'}
                        </button>

                        <button
                          onClick={() => handleSimulateTamper(v.id)}
                          className="btn-institutional-ghost text-semantic-critical text-[11px] py-1"
                          title="Simulate database modification for live judge demo"
                        >
                          Demo Tamper
                        </button>

                        <button
                          onClick={() => onOpenAudit && onOpenAudit(v.loanId)}
                          className="btn-institutional-ghost text-[11px] py-1 font-sans"
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
