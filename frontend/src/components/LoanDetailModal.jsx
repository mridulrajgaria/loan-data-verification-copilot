import React, { useState, useEffect } from 'react';
import { api } from '../api';
import {
  X,
  History,
  Loader2,
  Info,
} from 'lucide-react';

export default function LoanDetailModal({ loanId, onClose, onOpenAudit }) {
  const [loan, setLoan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!loanId) return;
    setLoading(true);
    setError(null);

    api.getLoanDetail(loanId)
      .then((res) => setLoan(res.data))
      .catch((err) => setError(err.message || 'Failed to load loan record lineage.'))
      .finally(() => setLoading(false));
  }, [loanId]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  let rawJsonObj = null;
  if (loan?.rawLoanRecord?.rawContent) {
    try {
      rawJsonObj = JSON.parse(loan.rawLoanRecord.rawContent);
    } catch {}
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#151817]/30 backdrop-blur-[2px] flex justify-end">
      {/* Right-Side Forensic Slide-Out Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="loan-drawer-title"
        className="bg-surface border-l border-border shadow-drawer w-full max-w-2xl h-full flex flex-col text-content-primary animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header (Deep Teal Anchor) */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-shrink-0 bg-ref-teal text-white">
          <div>
            <div className="flex items-center space-x-2">
              <h3 id="loan-drawer-title" className="font-mono font-bold text-base text-white">
                {loan?.loanIdentifier || 'Loan Inspection'}
              </h3>
              {loan && (
                <span
                  className={
                    loan.status === 'VERIFIED'
                      ? 'badge-verified'
                      : loan.status === 'FLAGGED'
                      ? 'badge-warning'
                      : 'badge-teal'
                  }
                >
                  {loan.status}
                </span>
              )}
            </div>
            <p className="text-xs text-ref-teal-light mt-0.5">
              Forensic Lineage, Ingested CSV Raw Provenance & Entity Snapshot
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => onOpenAudit && onOpenAudit(loanId)}
              aria-label="View chronological audit history for this loan"
              className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-xs text-xs font-mono border border-white/20"
            >
              <History className="w-3.5 h-3.5 inline mr-1 text-ref-lime" />
              <span>Audit History</span>
            </button>
            <button
              onClick={onClose}
              aria-label="Close loan inspection drawer"
              className="p-1 text-white/80 hover:text-white rounded-xs hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Drawer Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs bg-canvas">
          {loading ? (
            <div className="py-24 flex flex-col items-center justify-center text-content-muted">
              <Loader2 className="w-6 h-6 animate-spin text-ref-teal mb-2" />
              <span>Fetching loan provenance dossier...</span>
            </div>
          ) : error ? (
            <div className="p-3 bg-semantic-critical-bg border border-semantic-critical-border rounded-xs text-semantic-critical font-mono">
              {error}
            </div>
          ) : !loan ? (
            <div className="text-center py-12 text-content-muted">Loan record not found.</div>
          ) : (
            <>
              {/* 1. Core Financial Data Facts (Periwinkle Surface Band) */}
              <div className="space-y-2">
                <span className="text-[10px] font-mono uppercase font-bold text-ref-periwinkle-text tracking-wider block">
                  Financial Facts
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-ref-periwinkle-light p-4 rounded-xs border border-ref-periwinkle-border">
                  <div>
                    <span className="text-[10px] font-mono uppercase font-bold text-ref-periwinkle-text/70 block">
                      Original Principal
                    </span>
                    <span className="font-mono font-bold text-ref-periwinkle-text text-sm tabular-nums">
                      ${loan.originalPrincipal?.toLocaleString() ?? '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-mono uppercase font-bold text-ref-periwinkle-text/70 block">
                      Current Balance
                    </span>
                    <span className="font-mono font-bold text-ref-periwinkle-text text-sm tabular-nums">
                      ${loan.currentBalance?.toLocaleString() ?? '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-mono uppercase font-bold text-ref-periwinkle-text/70 block">
                      Rate / Term
                    </span>
                    <span className="font-sans font-medium text-ref-periwinkle-text text-xs">
                      {loan.interestRate}% • {loan.termMonths}m
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-mono uppercase font-bold text-ref-periwinkle-text/70 block">
                      Status / DPD
                    </span>
                    <span className="font-sans font-medium text-ref-periwinkle-text text-xs">
                      {loan.paymentStatus} ({loan.daysPastDue} DPD)
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. Side-by-Side Forensic Comparison (Clean White Surface) */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Info className="w-4 h-4 text-content-secondary" />
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-content-primary font-mono">
                    Raw Tape Source vs Normalized Record
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
                  {/* Raw Ingested Row */}
                  <div className="bg-white border border-border rounded-xs p-3.5 space-y-1.5 shadow-subtle">
                    <span className="text-[10px] uppercase font-semibold text-content-muted tracking-wider block font-sans border-b border-border/60 pb-1">
                      Raw Source CSV (Verbatim)
                    </span>
                    {rawJsonObj ? (
                      <div className="space-y-1 text-[11px] text-content-primary">
                        <div><span className="text-content-muted">loan_id:</span> "{rawJsonObj.loan_id}"</div>
                        <div><span className="text-content-muted">borrower_id:</span> "{rawJsonObj.borrower_id}"</div>
                        <div><span className="text-content-muted">origination_date:</span> "{rawJsonObj.origination_date}"</div>
                        <div><span className="text-content-muted">maturity_date:</span> "{rawJsonObj.maturity_date}"</div>
                        <div><span className="text-content-muted">original_principal:</span> "{rawJsonObj.original_principal}"</div>
                        <div><span className="text-content-muted">current_balance:</span> "{rawJsonObj.current_balance}"</div>
                        <div><span className="text-content-muted">payment_status:</span> "{rawJsonObj.payment_status}"</div>
                        <div><span className="text-content-muted">days_past_due:</span> "{rawJsonObj.days_past_due}"</div>
                        <div><span className="text-content-muted">borrower_state:</span> "{rawJsonObj.borrower_state}"</div>
                        <div><span className="text-content-muted">servicer_name:</span> "{rawJsonObj.servicer_name}"</div>
                      </div>
                    ) : (
                      <p className="text-content-muted font-sans">Raw CSV source content loaded.</p>
                    )}
                  </div>

                  {/* Normalized Database Entity */}
                  <div className="bg-white border border-border rounded-xs p-3.5 space-y-1.5 shadow-subtle">
                    <span className="text-[10px] uppercase font-semibold text-content-muted tracking-wider block font-sans border-b border-border/60 pb-1">
                      Normalized Database Record
                    </span>
                    <div className="space-y-1 text-[11px] text-content-primary">
                      <div><span className="text-content-muted">loanIdentifier:</span> {loan.loanIdentifier || 'null'}</div>
                      <div><span className="text-content-muted">borrowerId:</span> {loan.borrowerId || 'null'}</div>
                      <div><span className="text-content-muted">originationDate:</span> {loan.originationDate ? new Date(loan.originationDate).toISOString().split('T')[0] : 'null'}</div>
                      <div><span className="text-content-muted">maturityDate:</span> {loan.maturityDate ? new Date(loan.maturityDate).toISOString().split('T')[0] : 'null'}</div>
                      <div><span className="text-content-muted">originalPrincipal:</span> {loan.originalPrincipal}</div>
                      <div><span className="text-content-muted">currentBalance:</span> {loan.currentBalance}</div>
                      <div><span className="text-content-muted">paymentStatus:</span> {loan.paymentStatus}</div>
                      <div><span className="text-content-muted">daysPastDue:</span> {loan.daysPastDue}</div>
                      <div><span className="text-content-muted">borrowerState:</span> {loan.borrowerState}</div>
                      <div><span className="text-content-muted">servicerName:</span> {loan.servicerName}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Source Lineage Provenance */}
              <div className="section-band p-4 space-y-2 text-xs bg-white">
                <span className="text-[10px] font-mono uppercase font-semibold text-content-muted tracking-wider block">
                  Source Lineage
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                  <div>
                    <span className="text-content-muted block font-sans">Source File:</span>
                    <span className="font-semibold text-ref-teal font-mono">{loan.rawUpload?.filename || 'loan_tape.csv'}</span>
                  </div>
                  <div>
                    <span className="text-content-muted block font-sans">Source Row Index:</span>
                    <span className="font-mono font-semibold text-content-primary">Row #{loan.rawLoanRecord?.rowNumber ?? '—'}</span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-content-muted block font-sans">Raw File SHA-256 Digest:</span>
                    <span className="font-mono text-content-primary bg-surface-secondary px-2 py-0.5 rounded-xs border border-border block truncate" title={loan.rawUpload?.fileHash}>
                      {loan.rawUpload?.fileHash || 'unhashed'}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="px-6 py-3 border-t border-border bg-surface-secondary/50 flex items-center justify-between flex-shrink-0">
          <span className="text-[11px] text-content-muted font-mono">
            Lineage ID: {loan?.id ? loan.id.slice(0, 16) + '...' : '—'}
          </span>
          <button
            onClick={onClose}
            aria-label="Close drawer"
            className="btn-institutional-secondary text-xs"
          >
            Close Drawer
          </button>
        </div>
      </div>
    </div>
  );
}
