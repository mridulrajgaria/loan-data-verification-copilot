import React, { useState, useEffect } from 'react';
import { api } from '../api';
import {
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export default function AuditTrailModal({ loanId, onClose }) {
  const [trail, setTrail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedIndices, setExpandedIndices] = useState({});

  useEffect(() => {
    if (!loanId) return;
    setLoading(true);
    setError(null);

    api.getLoanAuditTrail(loanId)
      .then((res) => setTrail(res.data))
      .catch((err) => setError(err.message || 'Failed to load chronological audit events.'))
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

  const toggleExpand = (idx) => {
    setExpandedIndices((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  const getActionBadge = (actionType) => {
    switch (actionType) {
      case 'VERIFY':
      case 'VERIFIED':
        return <span className="badge-verified">VERIFY</span>;
      case 'MANUAL_EDIT':
      case 'OVERRIDE_APPROVE':
        return <span className="badge-teal">{actionType}</span>;
      case 'REJECT':
      case 'EXCEPTION_CREATED':
        return <span className="badge-critical">{actionType}</span>;
      case 'AI_SUGGESTION':
      case 'AI_SUGGESTION_GENERATED':
        return <span className="badge-ai">AI_SUGGESTION</span>;
      default:
        return <span className="badge-neutral">{actionType}</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#151817]/30 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-modal-title"
        className="bg-surface border border-border rounded-xs shadow-modal w-full max-w-4xl max-h-[90vh] flex flex-col text-content-primary animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header (Deep Teal Header) */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-shrink-0 bg-ref-teal text-white">
          <div>
            <div className="flex items-center space-x-2">
              <h3 id="audit-modal-title" className="font-mono font-bold text-base text-white">
                {trail?.loanIdentifier || 'Audit Event Ledger'}
              </h3>
              <span className="text-[10px] font-mono uppercase bg-ref-lime text-ref-teal px-2 py-0.5 rounded-xs font-bold">
                Immutable Ledger
              </span>
            </div>
            <p className="text-xs text-ref-teal-light mt-0.5">
              Complete chronological lifecycle events, underwriter decisions, and cryptographic state transitions.
            </p>
          </div>

          <button
            onClick={onClose}
            aria-label="Close audit ledger"
            className="p-1 text-white/80 hover:text-white rounded-xs hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: Chronological Event Log */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs bg-white">
          {loading ? (
            <div className="py-24 flex flex-col items-center justify-center text-content-muted">
              <Loader2 className="w-6 h-6 animate-spin text-ref-teal mb-2" />
              <span>Retrieving immutable audit events...</span>
            </div>
          ) : error ? (
            <div className="p-3 bg-semantic-critical-bg border border-semantic-critical-border rounded-xs text-semantic-critical font-mono">
              {error}
            </div>
          ) : !trail || trail.timeline?.length === 0 ? (
            <div className="text-center py-12 text-content-muted">No audit events recorded for this entity.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-[10px] text-content-muted font-mono font-semibold uppercase tracking-wider">
                    <th className="pb-2">Time</th>
                    <th className="pb-2">Action</th>
                    <th className="pb-2">Actor</th>
                    <th className="pb-2">Entity</th>
                    <th className="pb-2">Details</th>
                    <th className="pb-2 text-right">Payload</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {trail.timeline.map((event, idx) => {
                    const isExpanded = !!expandedIndices[idx];
                    return (
                      <React.Fragment key={event.id || idx}>
                        <tr className="hover:bg-surface-secondary/40 transition-colors">
                          <td className="py-2.5 font-mono text-[11px] text-content-muted whitespace-nowrap">
                            {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </td>
                          <td className="py-2.5">
                            {getActionBadge(event.actionType)}
                          </td>
                          <td className="py-2.5 font-sans font-medium text-content-primary">
                            {event.actor}
                          </td>
                          <td className="py-2.5 font-mono text-[11px] text-content-secondary" title={event.entityId || undefined}>
                            {event.entityType}:{event.entityId ? event.entityId.slice(0, 8) : '—'}
                          </td>
                          <td className="py-2.5 text-content-secondary max-w-xs truncate">
                            {event.details?.notes || event.details?.message || event.details?.decision || `Executed ${event.actionType}`}
                          </td>
                          <td className="py-2.5 text-right">
                            <button
                              onClick={() => toggleExpand(idx)}
                              aria-label={`${isExpanded ? 'Hide' : 'Inspect'} payload for event ${idx + 1}`}
                              className="text-ref-teal hover:underline font-mono text-[11px] inline-flex items-center space-x-1"
                            >
                              <span>{isExpanded ? 'Hide' : 'Inspect'}</span>
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-surface-secondary/60">
                            <td colSpan={6} className="p-3 border-b border-border">
                              <div className="bg-white border border-border rounded-xs p-2.5 font-mono text-[11px] text-content-primary overflow-x-auto">
                                <pre>{JSON.stringify(event.details, null, 2)}</pre>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-border bg-surface-secondary/50 flex items-center justify-between flex-shrink-0">
          <span className="text-[11px] text-content-muted font-mono">
            Total Logged Events: {trail?.timeline?.length || 0}
          </span>
          <button
            onClick={onClose}
            aria-label="Close audit ledger"
            className="btn-institutional-secondary text-xs"
          >
            Close Ledger
          </button>
        </div>
      </div>
    </div>
  );
}
