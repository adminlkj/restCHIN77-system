const API_BASE = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = 'binaa-auth-token';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || data.message || 'Request failed');
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function entityClient(entityName) {
  return {
    list: (sort = '-created_date', limit = 500) => request(`/api/entities/${entityName}/list`, { method: 'POST', body: JSON.stringify({ sort, limit }) }),
    filter: (query = {}, sort = '-created_date', limit = 500) => request(`/api/entities/${entityName}/filter`, { method: 'POST', body: JSON.stringify({ query, sort, limit }) }),
    get: (id) => request(`/api/entities/${entityName}/get/${id}`),
    create: (data) => request(`/api/entities/${entityName}/create`, { method: 'POST', body: JSON.stringify(data) }),
    bulkCreate: (items) => request(`/api/entities/${entityName}/bulk-create`, { method: 'POST', body: JSON.stringify({ items }) }),
    update: (id, data) => request(`/api/entities/${entityName}/update/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    bulkUpdate: (items) => request(`/api/entities/${entityName}/bulk-update`, { method: 'PATCH', body: JSON.stringify({ items }) }),
    updateMany: (query, update) => request(`/api/entities/${entityName}/update-many`, { method: 'PATCH', body: JSON.stringify({ query, update }) }),
    delete: (id) => request(`/api/entities/${entityName}/delete/${id}`, { method: 'DELETE' }),
    deleteMany: (query) => request(`/api/entities/${entityName}/delete-many`, { method: 'POST', body: JSON.stringify({ query }) }),
    schema: () => request(`/api/entities/${entityName}/schema`),
    subscribe: () => () => {},
  };
}

export const base44 = {
  auth: {
    async loginViaEmailPassword(email, password) {
      const result = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      localStorage.setItem(TOKEN_KEY, result.access_token);
      return result.user;
    },
    async register(data) { return request('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }); },
    async verifyOtp(data) {
      const result = await request('/api/auth/verify-otp', { method: 'POST', body: JSON.stringify(data) });
      if (result.access_token) localStorage.setItem(TOKEN_KEY, result.access_token);
      return result;
    },
    resendOtp: (email) => request('/api/auth/resend-otp', { method: 'POST', body: JSON.stringify({ email }) }),
    setToken: (token) => localStorage.setItem(TOKEN_KEY, token),
    me: () => request('/api/auth/me'),
    updateMe: (data) => request('/api/auth/me', { method: 'PATCH', body: JSON.stringify(data) }),
    isAuthenticated: async () => Boolean(getToken()),
    logout: () => localStorage.removeItem(TOKEN_KEY),
    redirectToLogin: () => { window.location.href = '/login'; },
    loginWithProvider: () => { throw new Error('Google login not available'); },
    resetPasswordRequest: (email) => request('/api/auth/reset-request', { method: 'POST', body: JSON.stringify({ email }) }),
    resetPassword: (data) => request('/api/auth/reset', { method: 'POST', body: JSON.stringify(data) }),
  },
  entities: new Proxy({}, { get: (_, entityName) => entityClient(entityName) }),
  users: {
    inviteUser: (email, role = 'user', appRole = 'VIEWER') => request('/api/users/invite', { method: 'POST', body: JSON.stringify({ email, role, appRole }) }),
    listRegistrationRequests: () => request('/api/users/registration-requests/list', { method: 'POST', body: JSON.stringify({}) }),
    approveRegistrationRequest: (data) => request('/api/users/registration-requests/approve', { method: 'POST', body: JSON.stringify(data) }),
    rejectRegistrationRequest: (id) => request('/api/users/registration-requests/reject', { method: 'POST', body: JSON.stringify({ id }) }),
  },
  functions: {
    invoke: (name, payload = {}) => request(`/api/functions/${name}`, { method: 'POST', body: JSON.stringify(payload) }).then((data) => ({ data, status: 200 })),
  },
  analytics: { track: async () => ({ success: true }) },
  integrations: {
    Core: {
      async UploadFile({ file } = {}) {
        if (!file) { const err = new Error('No file provided'); err.status = 400; throw err; }
        const formData = new FormData();
        formData.append('file', file);
        const token = getToken();
        const response = await fetch(`${API_BASE}/api/upload`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: formData });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) { const error = new Error(data.error || data.message || 'Upload failed'); error.status = response.status; error.data = data; throw error; }
        return { file_url: data.file_url || data.url || data.path };
      },
    },
  },
};
