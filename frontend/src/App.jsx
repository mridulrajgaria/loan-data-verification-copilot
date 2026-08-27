import React, { useState } from 'react';
import OperatorDashboard from './components/OperatorDashboard';
import ReviewerDashboard from './components/ReviewerDashboard';
import ConsumerDashboard from './components/ConsumerDashboard';
import AuditTrailModal from './components/AuditTrailModal';
import LoanDetailModal from './components/LoanDetailModal';
import { api } from './api';
import {
  ShieldCheck,
  Layers,
  FileCheck2,
  Search,
  Menu,
  X,
  ChevronRight,
  Sparkles,
  Lock,
  CheckCircle,
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
    { id: 'operator', label: '01. DATA OPERATIONS', icon: Layers, descriptor: 'Ingestion & tape lineage' },
    { id: 'reviewer', label: '02. UNDERWRITING REVIEW', icon: FileCheck2, descriptor: 'Exception adjudication' },
    { id: 'consumer', label: '03. VERIFICATION PORTAL', icon: ShieldCheck, descriptor: 'Cryptographic attestation' },
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
    <div className="min-h-screen bg-[#F6F8F6] flex flex-col lg:flex-row text-[#0F172A] font-sans antialiased">
      {/* 1. DESKTOP LEFT SIDEBAR */}
      <aside className="hidden lg:flex lg:flex-col w-64 border-r border-[#E2E8F0] bg-white flex-shrink-0 justify-between">
        <div className="flex flex-col">
          {/* Institutional Brand Header (Deep Teal with Cool Modern Logo) */}
          <div className="h-16 border-b border-[#163B39] px-5 flex items-center bg-[#204E4C] text-white">
            <div className="flex items-center space-x-3">
              {/* Cool Modern Fintech Logo Icon */}
              <div className="relative w-8 h-8 bg-gradient-to-br from-[#CDE78C] to-[#86C232] rounded-lg p-0.5 flex items-center justify-center shadow-sm">
                <div className="w-full h-full bg-[#204E4C] rounded-[6px] flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4 text-[#CDE78C]" />
                </div>
                <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#CDE78C] rounded-full border-2 border-[#204E4C]"></div>
              </div>

              <div>
                <div className="text-sm font-extrabold tracking-tight leading-none text-white font-mono flex items-center gap-1.5">
                  <span>INTAIN</span>
                  <span className="w-1 h-1 rounded-full bg-[#CDE78C]"></span>
                </div>
                <div className="text-[10.5px] font-semibold text-[#CDE78C] tracking-wide mt-1 font-sans">
                  Loan Verification
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="p-3 space-y-2">
            <div className="px-2 pt-3 pb-1 text-[10px] font-mono font-bold uppercase tracking-wider text-[#64748B]">
              Workspaces
            </div>

            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleTabChange(item.id)}
                  style={{
                    backgroundColor: isActive ? '#CDE78C' : 'transparent',
                    color: isActive ? '#1C3806' : '#475569',
                    borderColor: isActive ? '#B3D463' : 'transparent',
                  }}
                  className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-left transition-all border ${
                    isActive
                      ? 'font-bold shadow-sm'
                      : 'hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? '#1C3806' : '#64748B' }} />
                  <div className="flex-1 truncate">
                    <div className="text-xs font-mono tracking-tight leading-none font-bold">
                      {item.label}
                    </div>
                    <div
                      className="text-[11px] mt-1 leading-none font-normal font-sans"
                      style={{ color: isActive ? '#2A5208' : '#64748B' }}
                    >
                      {item.descriptor}
                    </div>
                  </div>
                  {isActive && <ChevronRight className="w-4 h-4" style={{ color: '#1C3806' }} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sidebar Footer: Active Demo Persona & System Status */}
        <div className="border-t border-[#E2E8F0] p-3.5 bg-[#F8FAFC] space-y-2.5">
          {/* Operational Status */}
          <div className="flex items-center justify-between text-xs px-0.5">
            <span className="flex items-center space-x-1.5 text-[11px] text-[#475569] font-medium font-sans">
              <span className="w-2 h-2 rounded-full bg-[#087443]"></span>
              <span>Verification Engine</span>
            </span>
            <span className="text-[10px] font-mono font-bold text-[#204E4C] bg-white px-2 py-0.5 rounded-md border border-[#E2E8F0]">
              READY
            </span>
          </div>

          {/* Dynamic User Persona Card */}
          <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-md bg-[#204E4C] text-white flex items-center justify-center text-xs font-bold font-mono">
                {currentPersona.initials}
              </div>
              <div className="truncate">
                <div className="text-xs font-bold text-[#0F172A] truncate">{currentPersona.name}</div>
                <div className="text-[9.5px] text-[#64748B] uppercase tracking-wider font-mono">{currentPersona.title}</div>
              </div>
            </div>
            <span className="text-[9.5px] font-mono font-bold text-[#204E4C] bg-[#EEF4FF] px-2 py-0.5 rounded-md border border-[#9DC0FB]">
              {currentPersona.role}
            </span>
          </div>
        </div>
      </aside>

      {/* 2. MAIN APPLICATION CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Utility Header */}
        <header className="h-16 border-b border-[#E2E8F0] bg-white px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 flex-shrink-0 shadow-sm">
          {/* Left: Mobile Menu & Title */}
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              className="lg:hidden p-1.5 text-[#475569] hover:text-[#0F172A] rounded-md hover:bg-[#F1F5F9]"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <div className="hidden sm:flex items-center space-x-2 text-xs text-[#64748B] font-mono">
              <span className="font-bold text-[#204E4C]">Intain Copilot</span>
              <span>/</span>
              <span className="capitalize font-sans font-semibold text-[#0F172A]">{activeTab}</span>
            </div>
          </div>

          {/* Center: Global Search Bar */}
          <div className="flex-1 max-w-md mx-4 hidden md:block">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#94A3B8]" />
              <input
                type="text"
                placeholder="Search loan ID, borrower, exception..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                aria-label="Search loan ID, borrower, or exception"
                className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-md pl-9 pr-3 py-1.5 text-xs text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#204E4C] focus:ring-2 focus:ring-[#204E4C]/10 transition-all font-sans"
              />
            </div>
          </div>

          {/* Right: Explicit High-Contrast Role Switcher */}
          <div className="flex items-center space-x-3">
            {/* Segmented Workspace Role Switcher */}
            <div className="flex items-center bg-[#F1F5F9] p-1 rounded-lg border border-[#E2E8F0] text-xs">
              <button
                onClick={() => handleTabChange('operator')}
                style={{
                  backgroundColor: activeTab === 'operator' ? '#204E4C' : 'transparent',
                  color: activeTab === 'operator' ? '#FFFFFF' : '#475569',
                }}
                className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                  activeTab === 'operator' ? 'shadow-sm' : 'hover:text-[#0F172A]'
                }`}
              >
                Operator
              </button>
              <button
                onClick={() => handleTabChange('reviewer')}
                style={{
                  backgroundColor: activeTab === 'reviewer' ? '#204E4C' : 'transparent',
                  color: activeTab === 'reviewer' ? '#FFFFFF' : '#475569',
                }}
                className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                  activeTab === 'reviewer' ? 'shadow-sm' : 'hover:text-[#0F172A]'
                }`}
              >
                Reviewer
              </button>
              <button
                onClick={() => handleTabChange('consumer')}
                style={{
                  backgroundColor: activeTab === 'consumer' ? '#204E4C' : 'transparent',
                  color: activeTab === 'consumer' ? '#FFFFFF' : '#475569',
                }}
                className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                  activeTab === 'consumer' ? 'shadow-sm' : 'hover:text-[#0F172A]'
                }`}
              >
                Auditor
              </button>
            </div>

            <div className="h-4 w-px bg-[#E2E8F0] hidden sm:block"></div>

            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-mono font-bold text-[#204E4C] bg-[#EEF4FF] border border-[#9DC0FB]">
              <span className="w-2 h-2 rounded-full bg-[#087443]"></span>
              {currentPersona.name}
            </span>
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-b border-[#E2E8F0] bg-white p-3 space-y-1.5">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#64748B] mb-1">
              Select Workspace
            </div>
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  handleTabChange(item.id);
                  setMobileMenuOpen(false);
                }}
                style={{
                  backgroundColor: activeTab === item.id ? '#CDE78C' : 'transparent',
                  color: activeTab === item.id ? '#1C3806' : '#475569',
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 text-xs rounded-lg font-bold"
              >
                <span className="font-mono">{item.label}</span>
                <span className="text-[10px] font-medium opacity-80">{item.descriptor}</span>
              </button>
            ))}
          </div>
        )}

        {/* Workspace Page Header Strip (Clean Surface) */}
        <div className="border-b border-[#E2E8F0] bg-white px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs">
          <div>
            <h1 className="text-lg font-bold text-[#0F172A] tracking-tight font-sans">
              {activeMeta.title}
            </h1>
            <p className="text-xs text-[#475569] mt-0.5 font-medium">
              {activeMeta.subtitle}
            </p>
          </div>

          <div className="flex items-center space-x-2 text-xs font-mono text-[#64748B]">
            <span className="badge-lime">Tape: Active</span>
            <span>•</span>
            <span className="font-bold text-[#0F172A]">2,000 Records</span>
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

        {/* Non-Technical Friendly Footer */}
        <footer className="border-t border-[#E2E8F0] bg-white px-6 py-3.5 text-xs text-[#64748B] flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0 shadow-sm">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-[#0F172A]">Intain Loan Verification Copilot</span>
            <span className="text-[#CBD5E1]">•</span>
            <span className="text-[11px] text-[#64748B]">Automated error detection with underwriter review and permanent protection</span>
          </div>

          <div className="flex items-center space-x-3 text-[11px] font-medium text-[#475569]">
            <span className="inline-flex items-center gap-1 text-[#087443]">
              <CheckCircle className="w-3.5 h-3.5 text-[#087443]" />
              <span>Verified by Underwriters</span>
            </span>
            <span className="text-[#CBD5E1]">•</span>
            <span className="inline-flex items-center gap-1 text-[#204E4C]">
              <Lock className="w-3.5 h-3.5 text-[#204E4C]" />
              <span>Tamper-Proof Records</span>
            </span>
            <span className="text-[#CBD5E1]">•</span>
            <span className="inline-flex items-center gap-1 text-[#0F172A]">
              <Sparkles className="w-3.5 h-3.5 text-[#0F172A]" />
              <span>100% Audit-Ready</span>
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
