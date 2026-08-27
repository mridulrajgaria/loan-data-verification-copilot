import React, { useState } from 'react';
import OperatorDashboard from './components/OperatorDashboard';
import ReviewerDashboard from './components/ReviewerDashboard';
import ConsumerDashboard from './components/ConsumerDashboard';
import AuditTrailModal from './components/AuditTrailModal';
import LoanDetailModal from './components/LoanDetailModal';
import { api } from './api';
import {
  Shield,
  Layers,
  FileCheck2,
  Search,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('reviewer'); // default to underwriter reviewer workspace
  const [selectedLoanId, setSelectedLoanId] = useState(null);
  const [auditLoanId, setAuditLoanId] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');

  // Three Demo Personas per Challenge Specification
  const personas = {
    operator: {
      name: 'Elena Rostova',
      title: 'Data Operations Specialist',
      role: 'OPERATOR',
      userId: 'usr-operator-01',
      initials: 'ER',
    },
    reviewer: {
      name: 'David Chen',
      title: 'Senior Underwriter',
      role: 'REVIEWER',
      userId: 'usr-reviewer-01',
      initials: 'DC',
    },
    consumer: {
      name: 'Marcus Lee',
      title: 'Verification Auditor',
      role: 'AUDITOR',
      userId: 'usr-auditor-01',
      initials: 'ML',
    },
  };

  const currentPersona = personas[activeTab] || personas.reviewer;

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    const persona = personas[tabId] || personas.reviewer;
    api.setAuthUser(persona.userId, persona.role);
  };

  const navItems = [
    { id: 'operator', label: 'DATA OPERATIONS', icon: Layers, descriptor: 'Ingestion & tape lineage' },
    { id: 'reviewer', label: 'UNDERWRITING REVIEW', icon: FileCheck2, descriptor: 'Exception adjudication' },
    { id: 'consumer', label: 'VERIFICATION PORTAL', icon: Shield, descriptor: 'Cryptographic attestation' },
  ];

  const getPageTitle = () => {
    switch (activeTab) {
      case 'operator':
        return { title: 'Data Control Room', subtitle: 'Loan tape ingestion, validation rule metrics and source lineage' };
      case 'reviewer':
        return { title: 'Underwriting Review Workspace', subtitle: 'Adjudicate flagged tape anomalies, inspect forensic discrepancies, and execute binding decisions' };
      case 'consumer':
        return { title: 'Verification Portal', subtitle: 'Cryptographic integrity, data quality scoring and audit attestation' };
      default:
        return { title: 'Loan Verification Copilot', subtitle: 'Institutional Underwriting Verification System' };
    }
  };

  const activeMeta = getPageTitle();

  return (
    <div className="min-h-screen bg-canvas flex flex-col lg:flex-row text-content-primary font-sans antialiased">
      {/* 1. DESKTOP LEFT SIDEBAR */}
      <aside className="hidden lg:flex lg:flex-col w-64 border-r border-border bg-surface flex-shrink-0 justify-between">
        <div className="flex flex-col">
          {/* Institutional Header */}
          <div className="h-14 border-b border-border px-5 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-5 h-5 bg-brand-institutional rounded-xs flex items-center justify-center text-white">
                <Shield className="w-3 h-3" />
              </div>
              <div>
                <span className="text-xs font-bold tracking-tight text-content-primary block leading-none font-mono">
                  INTAIN
                </span>
                <span className="text-[9.5px] uppercase font-semibold tracking-wider text-content-muted block mt-0.5 font-mono">
                  LOAN VERIFICATION
                </span>
              </div>
            </div>
            <span className="inline-flex items-center px-1 py-0.5 rounded-xs text-[9px] font-mono font-medium bg-surface-secondary text-content-secondary border border-border">
              v1.0
            </span>
          </div>

          {/* Navigation Links */}
          <div className="p-2.5 space-y-1">
            <div className="px-2.5 pt-2 pb-1 text-[9.5px] font-mono font-semibold uppercase tracking-wider text-content-muted">
              Workspaces
            </div>

            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleTabChange(item.id)}
                  className={`w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-xs text-left transition-colors ${
                    isActive
                      ? 'bg-surface-secondary text-brand-institutional font-semibold border-l-2 border-brand-institutional'
                      : 'text-content-secondary hover:text-content-primary hover:bg-surface-secondary/70'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-brand-institutional' : 'text-content-muted'}`} />
                  <div className="flex-1 truncate">
                    <div className="text-xs font-mono tracking-tight leading-none">{item.label}</div>
                    <div className="text-[11px] text-content-muted mt-1 leading-none font-normal font-sans">{item.descriptor}</div>
                  </div>
                  {isActive && <ChevronRight className="w-3 h-3 text-brand-institutional" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sidebar Footer: Active Demo Persona & System Status */}
        <div className="border-t border-border p-3.5 bg-surface-secondary/40 space-y-2.5">
          {/* Operational Status */}
          <div className="flex items-center justify-between text-xs px-0.5">
            <span className="flex items-center space-x-1.5 text-[11px] text-content-secondary font-sans">
              <span className="w-1.5 h-1.5 rounded-full bg-semantic-verified"></span>
              <span>Verification Engine</span>
            </span>
            <span className="text-[9.5px] font-mono text-content-muted uppercase">Ready</span>
          </div>

          {/* Dynamic User Persona Card */}
          <div className="pt-2 border-t border-border flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-xs bg-surface border border-border flex items-center justify-center text-brand-institutional text-xs font-semibold font-mono">
                {currentPersona.initials}
              </div>
              <div className="truncate">
                <div className="text-xs font-semibold text-content-primary truncate">{currentPersona.name}</div>
                <div className="text-[9.5px] text-content-muted uppercase tracking-wider font-mono">{currentPersona.title}</div>
              </div>
            </div>
            <span className="text-[9px] font-mono text-content-muted bg-surface px-1 py-0.5 rounded-xs border border-border">
              {currentPersona.role}
            </span>
          </div>
        </div>
      </aside>

      {/* 2. MAIN APPLICATION CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Utility Header */}
        <header className="h-14 border-b border-border bg-surface px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 flex-shrink-0">
          {/* Left: Mobile Menu & Title */}
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-1.5 text-content-secondary hover:text-content-primary rounded-xs hover:bg-surface-secondary"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>

            <div className="hidden sm:flex items-center space-x-2 text-xs text-content-muted font-mono">
              <span className="font-semibold text-content-primary">Intain Copilot</span>
              <span>/</span>
              <span className="capitalize font-sans">{activeTab}</span>
            </div>
          </div>

          {/* Center: Global Search Bar */}
          <div className="flex-1 max-w-md mx-4 hidden md:block">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-content-muted" />
              <input
                type="text"
                placeholder="Search loan ID, borrower, exception..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                className="w-full bg-surface-secondary/70 border border-border rounded-xs pl-8 pr-3 py-1.5 text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:bg-surface focus:border-brand-institutional transition-all font-sans"
              />
            </div>
          </div>

          {/* Right: Workspace Switcher & Persona Indicator */}
          <div className="flex items-center space-x-2.5">
            {/* Segmented Workspace Role Switcher */}
            <div className="flex items-center bg-surface-secondary p-0.5 rounded-xs border border-border text-xs">
              <button
                onClick={() => handleTabChange('operator')}
                className={`px-2.5 py-1 rounded-xs text-[11px] font-medium transition-colors ${
                  activeTab === 'operator'
                    ? 'bg-surface text-brand-institutional shadow-subtle font-semibold'
                    : 'text-content-secondary hover:text-content-primary'
                }`}
              >
                Operator
              </button>
              <button
                onClick={() => handleTabChange('reviewer')}
                className={`px-2.5 py-1 rounded-xs text-[11px] font-medium transition-colors ${
                  activeTab === 'reviewer'
                    ? 'bg-surface text-brand-institutional shadow-subtle font-semibold'
                    : 'text-content-secondary hover:text-content-primary'
                }`}
              >
                Reviewer
              </button>
              <button
                onClick={() => handleTabChange('consumer')}
                className={`px-2.5 py-1 rounded-xs text-[11px] font-medium transition-colors ${
                  activeTab === 'consumer'
                    ? 'bg-surface text-brand-institutional shadow-subtle font-semibold'
                    : 'text-content-secondary hover:text-content-primary'
                }`}
              >
                Auditor
              </button>
            </div>

            <div className="h-3.5 w-px bg-border hidden sm:block"></div>

            <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-xs text-[10px] font-mono text-content-muted bg-surface-secondary border border-border">
              <span className="w-1.5 h-1.5 rounded-full bg-semantic-verified"></span>
              {currentPersona.name}
            </span>
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-b border-border bg-surface p-3 space-y-1.5">
            <div className="text-[9.5px] font-mono font-semibold uppercase tracking-wider text-content-muted mb-1">
              Select Workspace
            </div>
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  handleTabChange(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-2 text-xs rounded-xs ${
                  activeTab === item.id
                    ? 'bg-surface-secondary text-brand-institutional font-semibold border-l-2 border-brand-institutional'
                    : 'text-content-secondary hover:bg-surface-secondary'
                }`}
              >
                <span className="font-mono">{item.label}</span>
                <span className="text-[10px] text-content-muted">{item.descriptor}</span>
              </button>
            ))}
          </div>
        )}

        {/* Workspace Page Header Strip */}
        <div className="border-b border-border bg-surface px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
          <div>
            <h1 className="text-base font-semibold text-content-primary tracking-tight">
              {activeMeta.title}
            </h1>
            <p className="text-xs text-content-secondary mt-0.5">
              {activeMeta.subtitle}
            </p>
          </div>

          <div className="flex items-center space-x-2 text-[11px] font-mono text-content-muted">
            <span>Tape: Active</span>
            <span>•</span>
            <span>2,000 Records</span>
          </div>
        </div>

        {/* Main Workspace Dynamic Content Area */}
        <main className="flex-1 overflow-y-auto p-6 max-w-[1600px] w-full mx-auto">
          {activeTab === 'operator' && (
            <OperatorDashboard
              searchQuery={globalSearch}
              onSelectLoan={(id) => setSelectedLoanId(id)}
              onOpenAudit={(id) => setAuditLoanId(id)}
            />
          )}

          {activeTab === 'reviewer' && (
            <ReviewerDashboard
              searchQuery={globalSearch}
              onSelectLoan={(id) => setSelectedLoanId(id)}
              onOpenAudit={(id) => setAuditLoanId(id)}
            />
          )}

          {activeTab === 'consumer' && (
            <ConsumerDashboard
              searchQuery={globalSearch}
              onSelectLoan={(id) => setSelectedLoanId(id)}
              onOpenAudit={(id) => setAuditLoanId(id)}
            />
          )}
        </main>

        {/* Forensic Side-Drawer Inspector */}
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

        {/* Audit Trail Modal */}
        {auditLoanId && (
          <AuditTrailModal
            loanId={auditLoanId}
            onClose={() => setAuditLoanId(null)}
          />
        )}

        {/* Institutional Minimal Footer */}
        <footer className="border-t border-border bg-surface px-6 py-2.5 text-[11px] text-content-muted flex flex-col sm:flex-row items-center justify-between gap-2 flex-shrink-0">
          <div>
            Intain Campus FinTech Challenge 2026 • Full-Stack Track • Loan Data Verification Copilot
          </div>
          <div className="flex items-center space-x-4 font-mono text-[10px]">
            <span>Human-in-the-Loop Governance</span>
            <span>SHA-256 Record Hashing</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
