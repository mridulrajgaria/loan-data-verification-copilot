import React, { useState, useEffect } from 'react';
import OperatorDashboard from './components/OperatorDashboard';
import ReviewerDashboard from './components/ReviewerDashboard';
import ConsumerDashboard from './components/ConsumerDashboard';
import AuditTrailModal from './components/AuditTrailModal';
import LoanDetailModal from './components/LoanDetailModal';
import { setAuthUser } from './api';
import {
  Shield,
  Layers,
  UserCheck,
  BarChart3,
  User,
  Check,
  ChevronDown,
  Info,
} from 'lucide-react';

export const MOCK_PERSONAS = [
  {
    id: 'usr-operator-01',
    name: 'Elena Rostova',
    role: 'OPERATOR',
    title: 'Data Operations Lead',
    tab: 'operator',
    badgeClass: 'bg-blue-950 text-blue-300 border-blue-800',
    description: 'Ingest loan tapes, inspect CSV provenance & batch validation health.',
  },
  {
    id: 'usr-reviewer-01',
    name: 'David Chen',
    role: 'REVIEWER',
    title: 'Senior Underwriter',
    tab: 'reviewer',
    badgeClass: 'bg-purple-950 text-purple-300 border-purple-800',
    description: 'Adjudicate exceptions, inspect AI advice & execute binding decisions.',
  },
  {
    id: 'usr-auditor-01',
    name: 'Sarah Vance',
    role: 'AUDITOR',
    title: 'Compliance Auditor',
    tab: 'consumer',
    badgeClass: 'bg-emerald-950 text-emerald-300 border-emerald-800',
    description: 'View verified portfolio, test SHA-256 tamper proof & export dossiers.',
  },
  {
    id: 'usr-admin-01',
    name: 'Alex Mercer',
    role: 'ADMIN',
    title: 'System Administrator',
    tab: 'reviewer',
    badgeClass: 'bg-amber-950 text-amber-300 border-amber-800',
    description: 'Unrestricted access across ingestion, review, and verification.',
  },
];

export default function App() {
  const [activePersona, setActivePersona] = useState(MOCK_PERSONAS[0]);
  const [activeTab, setActiveTab] = useState('operator'); // "operator" | "reviewer" | "consumer"
  const [selectedLoanId, setSelectedLoanId] = useState(null);
  const [auditLoanId, setAuditLoanId] = useState(null);
  const [personaDropdownOpen, setPersonaDropdownOpen] = useState(false);

  // Sync active persona to API headers
  useEffect(() => {
    setAuthUser(activePersona.id, activePersona.role);
  }, [activePersona]);

  const handleSelectPersona = (persona) => {
    setActivePersona(persona);
    setActiveTab(persona.tab);
    setPersonaDropdownOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Main Navigation Bar */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo & Project Title */}
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl shadow-lg shadow-blue-600/30 text-white">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight flex items-center space-x-2">
                <span>Loan Data Verification Copilot</span>
                <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-blue-950 text-blue-400 border border-blue-800">
                  v1.0 Hackathon
                </span>
              </h1>
              <p className="text-[11px] text-slate-400">
                Full-Stack Lineage, AI Validation & Cryptographic Attestation Platform
              </p>
            </div>
          </div>

          {/* Center: Role Navigation Tabs */}
          <nav className="hidden md:flex items-center space-x-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('operator')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'operator'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Operator (7a)</span>
            </button>

            <button
              onClick={() => setActiveTab('reviewer')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'reviewer'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Reviewer (7b)</span>
            </button>

            <button
              onClick={() => setActiveTab('consumer')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'consumer'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Consumer (7c)</span>
            </button>
          </nav>

          {/* Right: Active Mock Persona / Role Switcher */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setPersonaDropdownOpen(!personaDropdownOpen)}
              className="flex items-center space-x-2.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 hover:border-slate-600 text-left transition-all"
            >
              <div className="p-1.5 bg-slate-800 rounded-lg text-slate-300">
                <User className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs font-bold text-white">{activePersona.name}</span>
                  <span className={`text-[9px] uppercase font-mono font-extrabold px-1.5 py-0.2 rounded border ${activePersona.badgeClass}`}>
                    {activePersona.role}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 block font-mono">
                  x-user-role: {activePersona.role}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
            </button>

            {/* Persona Dropdown Menu */}
            {personaDropdownOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 p-2 space-y-1">
                <div className="px-3 py-2 border-b border-slate-800">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 block">
                    Switch Mock Test Persona
                  </span>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Injects <code className="text-blue-400">x-user-id</code> & <code className="text-purple-400">x-user-role</code> headers into every API call.
                  </p>
                </div>

                {MOCK_PERSONAS.map((p) => {
                  const isSelected = p.id === activePersona.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => handleSelectPersona(p)}
                      className={`w-full text-left p-2.5 rounded-lg text-xs transition-colors flex items-start justify-between ${
                        isSelected
                          ? 'bg-blue-950/50 border border-blue-800/80 text-white'
                          : 'hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-white">{p.name}</span>
                          <span className={`text-[9px] font-mono uppercase font-bold px-1.5 py-0.2 rounded border ${p.badgeClass}`}>
                            {p.role}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">{p.description}</p>
                        <span className="text-[9px] font-mono text-slate-500 mt-1 block">
                          ID: {p.id}
                        </span>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5 ml-2" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Mobile View Switcher */}
        <div className="md:hidden flex items-center justify-around border-t border-slate-800 py-2 px-4 bg-slate-950">
          <button
            onClick={() => setActiveTab('operator')}
            className={`text-xs font-semibold px-2 py-1 rounded ${activeTab === 'operator' ? 'text-blue-400 font-bold' : 'text-slate-400'}`}
          >
            Operator
          </button>
          <button
            onClick={() => setActiveTab('reviewer')}
            className={`text-xs font-semibold px-2 py-1 rounded ${activeTab === 'reviewer' ? 'text-purple-400 font-bold' : 'text-slate-400'}`}
          >
            Reviewer
          </button>
          <button
            onClick={() => setActiveTab('consumer')}
            className={`text-xs font-semibold px-2 py-1 rounded ${activeTab === 'consumer' ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}
          >
            Consumer
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        {activeTab === 'operator' && (
          <OperatorDashboard
            onSelectLoan={(id) => setSelectedLoanId(id)}
            onOpenAudit={(id) => setAuditLoanId(id)}
          />
        )}

        {activeTab === 'reviewer' && (
          <ReviewerDashboard
            onSelectLoan={(id) => setSelectedLoanId(id)}
            onOpenAudit={(id) => setAuditLoanId(id)}
          />
        )}

        {activeTab === 'consumer' && (
          <ConsumerDashboard
            onSelectLoan={(id) => setSelectedLoanId(id)}
            onOpenAudit={(id) => setAuditLoanId(id)}
          />
        )}
      </main>

      {/* Modals */}
      {selectedLoanId && (
        <LoanDetailModal
          loanId={selectedLoanId}
          onClose={() => setSelectedLoanId(null)}
          onOpenAudit={(id) => {
            setSelectedLoanId(null);
            setAuditLoanId(id);
          }}
        />
      )}

      {auditLoanId && (
        <AuditTrailModal
          loanId={auditLoanId}
          onClose={() => setAuditLoanId(null)}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-4 text-center text-xs text-slate-500">
        Loan Data Verification Copilot • Active Header Identity: <code className="text-slate-400">{activePersona.id} ({activePersona.role})</code> • SQLite & Prisma • Anthropic Claude 3.5 Sonnet
      </footer>
    </div>
  );
}
