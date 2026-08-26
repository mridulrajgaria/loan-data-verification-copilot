/**
 * Central API Client for Loan Data Verification Copilot
 * Handles consistent error handling, credentials, and API endpoints.
 */

const API_BASE = '/api';

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Accept': 'application/json',
    'x-user-id': 'usr-dashboard-operator',
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

    // Check if CSV download
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('text/csv')) {
      const text = await response.text();
      return text;
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMessage = data.error || data.message || `Request failed with status ${response.status}`;
      throw new Error(errorMessage);
    }

    return data;
  } catch (error) {
    console.error(`[API_ERROR] ${endpoint}:`, error);
    throw error;
  }
}

export const api = {
  // Master Summary
  getSummary: () => request('/summary'),

  // Ingestion & Uploads
  getUploads: () => request('/uploads'),
  uploadLoanTape: (formData) => request('/uploads', {
    method: 'POST',
    body: formData,
  }),

  // Exceptions & AI
  getExceptions: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/exceptions${query ? `?${query}` : ''}`);
  },
  getExceptionDetail: (id) => request(`/exceptions/${id}`),
  aiExplainException: (id) => request(`/exceptions/${id}/ai-explain`, { method: 'POST' }),
  aiSuggestCorrection: (id) => request(`/exceptions/${id}/ai-suggest`, { method: 'POST' }),
  aiSummarizeExceptions: (filterCriteria = {}) => request('/exceptions/ai-summary', {
    method: 'POST',
    body: filterCriteria,
  }),
  submitDecision: (id, payload) => request(`/exceptions/${id}/decision`, {
    method: 'POST',
    body: payload,
  }),

  // Loans & Lineage
  getLoans: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/loans${query ? `?${query}` : ''}`);
  },
  getLoanDetail: (id) => request(`/loans/${id}`),
  getLoanAuditTrail: (id) => request(`/loans/${id}/audit-trail`),
  verifyLoan: (id, payload = {}) => request(`/loans/${id}/verify`, {
    method: 'POST',
    body: payload,
  }),

  // Verified Records & Hashing
  getVerifiedLoans: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/verified-loans${query ? `?${query}` : ''}`);
  },
  verifyRecordHash: (id) => request(`/verified-loans/${id}/verify-hash`),
  simulateTamper: (id) => request(`/verified-loans/${id}/simulate-tamper`, { method: 'POST' }),
  exportVerified: (format = 'json') => request(`/export?format=${format}`),
};
