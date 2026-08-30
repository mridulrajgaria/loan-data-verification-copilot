/**
 * Central API Client for Loan Data Verification Copilot
 * Handles consistent error handling, credentials, and mock RBAC headers.
 */

const API_BASE = '/api';

// Active Mock Authentication Context (Synchronized with default Reviewer Persona)
let currentAuth = {
  userId: 'usr-reviewer-01',
  userRole: 'REVIEWER',
};

export function setAuthUser(userId, userRole) {
  currentAuth = {
    userId: String(userId || 'usr-reviewer-01'),
    userRole: String(userRole || 'REVIEWER').toUpperCase(),
  };
}

export function getAuthUser() {
  return currentAuth;
}

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Accept': 'application/json',
    'x-user-id': currentAuth.userId,
    'x-user-role': currentAuth.userRole,
    ...(options.headers || {}),
  };

  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const isJson = response.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      const errorMsg = isJson && data.error ? data.error : `HTTP ${response.status}: ${response.statusText}`;
      throw new Error(errorMsg);
    }

    return data;
  } catch (err) {
    console.error(`API Error on [${options.method || 'GET'}] ${endpoint}:`, err);
    throw err;
  }
}

export const api = {
  setAuthUser,
  getAuthUser,

  // Health / Status
  getHealth: () => request('/health'),
  getSummary: () => request('/summary'),

  // Uploads (Data Operations)
  uploadLoanTape: (formData) => request('/uploads', { method: 'POST', body: formData }),
  getUploads: () => request('/uploads'),
  getUploadDetail: (id) => request(`/uploads/${id}`),

  // Loans (Lineage & Entities)
  getLoans: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/loans${query ? `?${query}` : ''}`);
  },
  getLoanDetail: (id) => request(`/loans/${id}`),
  getLoanAuditTrail: (id) => request(`/loans/${id}/audit-trail`),
  verifyLoan: (id, payload = {}) =>
    request(`/loans/${id}/verify`, {
      method: 'POST',
      body: payload,
    }),

  // Exceptions (Underwriting Review)
  getExceptions: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/exceptions${query ? `?${query}` : ''}`);
  },
  getExceptionDetail: (id) => request(`/exceptions/${id}`),
  submitDecision: (id, payload) =>
    request(`/exceptions/${id}/decision`, {
      method: 'POST',
      body: payload,
    }),
  addComment: (id, notes) =>
    request(`/exceptions/${id}/comment`, {
      method: 'POST',
      body: { notes },
    }),

  // AI Assistant (Advisory Layer)
  aiExplainException: (id) => request(`/exceptions/${id}/ai-explain`, { method: 'POST' }),
  aiSuggestCorrection: (id) => request(`/exceptions/${id}/ai-suggest`, { method: 'POST' }),
  aiGenerateRule: (description) =>
    request('/exceptions/ai-generate-rule', {
      method: 'POST',
      body: { description },
    }),

  // Verification Portal (Cryptographic Attestation)
  getVerifiedLoans: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/verified-loans${query ? `?${query}` : ''}`);
  },
  getVerifiedLoanDetail: (id) => request(`/verified-loans/${id}`),
  verifyRecordHash: (id) => request(`/verified-loans/${id}/verify-hash`),
  simulateTamper: (id) => request(`/verified-loans/${id}/simulate-tamper`, { method: 'POST' }),

  // Exports
  exportVerified: (format = 'json') => request(`/export?format=${format}`),
};
