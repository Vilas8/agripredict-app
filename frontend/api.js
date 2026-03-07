// ============================================================
// AgriPredict API Client v2
// - Session persistence (survives page refresh)
// - Agmarknet live price integration
// ============================================================

const API_BASE = window.AGRI_API_BASE || 'http://localhost:3000/api';

// Token + session management
function getToken() { return localStorage.getItem('agripredict_token'); }
function setToken(t) { localStorage.setItem('agripredict_token', t); }
function clearToken() {
  localStorage.removeItem('agripredict_token');
  localStorage.removeItem('agripredict_user');
  localStorage.removeItem('agripredict_role');
}
function saveSession(user, role) {
  localStorage.setItem('agripredict_user', JSON.stringify(user));
  localStorage.setItem('agripredict_role', role || 'user');
}
function getSession() {
  try {
    const user = JSON.parse(localStorage.getItem('agripredict_user'));
    const role = localStorage.getItem('agripredict_role') || 'user';
    return { user, role };
  } catch { return { user: null, role: null }; }
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

// ============================================================
// SESSION RESTORE — called on every page load
// Returns { user, role } if session valid, else null
// ============================================================
async function restoreSession() {
  const token = getToken();
  if (!token) return null;
  try {
    const data = await apiFetch('/auth/me');
    if (data && data.user) {
      saveSession(data.user, data.user.role);
      return { user: data.user, role: data.user.role };
    }
    return null;
  } catch {
    // Token expired or invalid — clear it
    clearToken();
    return null;
  }
}

const AgriAPI = {
  restoreSession,
  getSession,

  async register(username, email, phone, password) {
    const data = await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ username, email, phone, password }) });
    if (data.token) { setToken(data.token); saveSession(data.user, 'user'); }
    return data;
  },
  async login(email, password) {
    const data = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (data.token) { setToken(data.token); saveSession(data.user, data.user?.role || 'user'); }
    return data;
  },
  async adminLogin(email, password, secret) {
    const data = await apiFetch('/auth/admin-login', { method: 'POST', body: JSON.stringify({ email, password, secret }) });
    if (data.token) { setToken(data.token); saveSession(data.user, 'admin'); }
    return data;
  },
  async logout() {
    try { await apiFetch('/auth/logout', { method: 'POST' }); } catch (_) {}
    clearToken();
  },
  async getMe() { return apiFetch('/auth/me'); },

  // ============ PRICES (Agmarknet-backed) ============
  async getDashboardPrices() { return apiFetch('/prices/dashboard'); },
  async searchPrice(commodity, district, market) {
    return apiFetch(`/prices/search?commodity=${encodeURIComponent(commodity)}&district=${encodeURIComponent(district)}&market=${encodeURIComponent(market)}`);
  },
  async getPriceHistory(commodity) {
    return apiFetch(`/prices/history${commodity ? '?commodity=' + encodeURIComponent(commodity) : ''}`);
  },

  // ============ ACTIVITIES ============
  async logActivity(activity_type, description, metadata) {
    try { return await apiFetch('/activities', { method: 'POST', body: JSON.stringify({ activity_type, description, metadata }) }); }
    catch (_) {}
  },
  async getActivities(limit = 50) { return apiFetch(`/activities?limit=${limit}`); },
  async getMyActivities() { return apiFetch('/activities/my'); },
  async getActivityStats() { return apiFetch('/activities/stats'); },

  // ============ USERS ============
  async getUsers() { return apiFetch('/users'); },
  async getUserStats() { return apiFetch('/users/stats'); },
  async updateUser(id, data) { return apiFetch(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }); },
  async updateMyProfile(data) { return apiFetch('/users/profile/me', { method: 'PATCH', body: JSON.stringify(data) }); },
  async changeMyPassword(currentPassword, newPassword) {
    return apiFetch('/users/password/me', { method: 'PATCH', body: JSON.stringify({ currentPassword, newPassword }) });
  },

  // ============ PREDICTIONS (Agmarknet-powered) ============
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

// ============================================================
// AUTO SESSION RESTORE on every page load
// Redirects back to the correct dashboard without re-login
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  const session = await AgriAPI.restoreSession();
  if (session && session.user) {
    // Restore into script.js globals
    if (typeof currentUser !== 'undefined') {
      currentUser = session.user;
      isAdmin = session.role === 'admin';
    }
    if (session.role === 'admin') {
      if (typeof updateAdminProfile === 'function') updateAdminProfile();
      if (typeof showPage === 'function') showPage('admin-dashboard', false);
      if (typeof showAdminSection === 'function') showAdminSection('dashboard');
    } else {
      if (typeof updateUserProfile === 'function') updateUserProfile();
      if (typeof showPage === 'function') showPage('user-dashboard', false);
      if (typeof showUserSection === 'function') showUserSection('dashboard');
      if (typeof updateDashboardPrices === 'function') updateDashboardPrices();
    }
  }
});
