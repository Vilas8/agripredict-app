// ============================================================
// AgriPredict API Client
// Connects the frontend to the Node.js + Supabase backend
// DO NOT modify frontend UI/UX - only data layer
// ============================================================

const API_BASE = window.AGRI_API_BASE || 'http://localhost:3000/api';

// Token management
function getToken() { return localStorage.getItem('agripredict_token'); }
function setToken(t) { localStorage.setItem('agripredict_token', t); }
function clearToken() { localStorage.removeItem('agripredict_token'); }

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

// ============ AUTH ============
const AgriAPI = {
  async register(username, email, phone, password) {
    const data = await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ username, email, phone, password }) });
    if (data.token) setToken(data.token);
    return data;
  },
  async login(email, password) {
    const data = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (data.token) setToken(data.token);
    return data;
  },
  async adminLogin(email, password, secret) {
    const data = await apiFetch('/auth/admin-login', { method: 'POST', body: JSON.stringify({ email, password, secret }) });
    if (data.token) setToken(data.token);
    return data;
  },
  async logout() {
    try { await apiFetch('/auth/logout', { method: 'POST' }); } catch (_) {}
    clearToken();
  },
  async getMe() { return apiFetch('/auth/me'); },

  // ============ PRICES ============
  async getDashboardPrices() { return apiFetch('/prices/dashboard'); },
  async searchPrice(commodity, district, market) { return apiFetch(`/prices/search?commodity=${encodeURIComponent(commodity)}&district=${encodeURIComponent(district)}&market=${encodeURIComponent(market)}`); },
  async getPriceHistory(commodity) { return apiFetch(`/prices/history${commodity ? '?commodity=' + encodeURIComponent(commodity) : ''}`); },

  // ============ ACTIVITIES ============
  async logActivity(activity_type, description, metadata) {
    try { return await apiFetch('/activities', { method: 'POST', body: JSON.stringify({ activity_type, description, metadata }) }); }
    catch (_) {} // non-blocking
  },
  async getActivities(limit = 50) { return apiFetch(`/activities?limit=${limit}`); },
  async getMyActivities() { return apiFetch('/activities/my'); },
  async getActivityStats() { return apiFetch('/activities/stats'); },

  // ============ USERS ============
  async getUsers() { return apiFetch('/users'); },
  async getUserStats() { return apiFetch('/users/stats'); },
  async updateUser(id, data) { return apiFetch(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }); },
  async updateMyProfile(data) { return apiFetch('/users/profile/me', { method: 'PATCH', body: JSON.stringify(data) }); },
  async changeMyPassword(currentPassword, newPassword) { return apiFetch('/users/password/me', { method: 'PATCH', body: JSON.stringify({ currentPassword, newPassword }) }); },

  // ============ PREDICTIONS ============
  async savePrediction(commodity, district, market, quantity, quantile = 0.5) {
    return apiFetch('/predictions', { method: 'POST', body: JSON.stringify({ commodity, district, market, quantity, quantile }) });
  },
  async getMyPredictions() { return apiFetch('/predictions/my'); },
  async getPredictionStats() { return apiFetch('/predictions/stats'); },

  // ============ CONFIG ============
  async getConfig() { return apiFetch('/config'); },
  async updateConfig(data) { return apiFetch('/config', { method: 'PATCH', body: JSON.stringify(data) }); }
};

window.AgriAPI = AgriAPI;
