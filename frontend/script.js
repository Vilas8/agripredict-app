// Global State
let allData = [];
let currentUser = null;
let isAdmin = false;
let charts = {};
let navigationHistory = [];
let currentPage = 'home';

// Admin Remember Me
const ADMIN_REMEMBER_KEY = 'adminRememberMe';
const ADMIN_CREDENTIALS_KEY = 'adminCredentials';

function saveAdminCredentials(email, password, secret, rememberMe) {
  localStorage.setItem(ADMIN_REMEMBER_KEY, rememberMe ? 'true' : 'false');
  if (rememberMe) {
    localStorage.setItem(ADMIN_CREDENTIALS_KEY, JSON.stringify({ email, password, secret }));
  } else {
    localStorage.removeItem(ADMIN_CREDENTIALS_KEY);
  }
}

function loadAdminCredentials() {
  const rememberMe = localStorage.getItem(ADMIN_REMEMBER_KEY) === 'true';
  if (rememberMe) {
    const credentials = localStorage.getItem(ADMIN_CREDENTIALS_KEY);
    if (credentials) {
      try {
        const creds = JSON.parse(credentials);
        document.getElementById('admin-email').value = creds.email || '';
        document.getElementById('admin-password').value = creds.password || '';
        document.getElementById('admin-secret').value = creds.secret || '';
        document.getElementById('admin-remember').checked = true;
      } catch (e) {}
    }
  }
}

let userIndexByEmail = new Map();
function rebuildUserIndex() {
  userIndexByEmail.clear();
  allData.forEach(d => {
    if (d.type === 'user' && d.email) userIndexByEmail.set(d.email.toLowerCase(), d);
  });
}

const defaultConfig = {
  app_title: 'AgriPredict', tagline: 'Smart Farming, Better Tomorrow',
  background_color: '#064e3b', primary_color: '#10b981',
  text_color: '#ffffff', secondary_color: '#047857', accent_color: '#6ee7b7'
};

const marketsByDistrict = {
  'Kolar': ['Kolar Main Market', 'Kolar APMC'],
  'Malur': ['Malur Main', 'Malur APMC'],
  'Chintamani': ['Chintamani Main', 'Chintamani APMC'],
  'Hoskote': ['Hoskote Main', 'Hoskote APMC']
};

const basePrices = { 'Maize': 2150, 'Paddy': 1940, 'Wheat': 2275, 'Sugarcane': 310 };

function getTodayDate() { return new Date().toISOString().split('T')[0]; }

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function getDailyPrice(commodity, district = 'Kolar', market = 'Main') {
  const today = getTodayDate();
  const storageKey = `price_${commodity}_${district}_${market}_${today}`;
  let storedData = localStorage.getItem(storageKey);
  if (storedData) return JSON.parse(storedData).price;
  const basePrice = basePrices[commodity] || 2000;
  const combinedHash = (hashCode(today) + hashCode(commodity) + hashCode(district) + hashCode(market)) % 1600 - 800;
  const variationPercent = combinedHash / 10000;
  let dailyPrice = Math.round(basePrice * (1 + variationPercent));
  dailyPrice = Math.max(Math.round(basePrice * 0.85), Math.min(Math.round(basePrice * 1.15), dailyPrice));
  localStorage.setItem(storageKey, JSON.stringify({ price: dailyPrice, date: today, commodity, district, market, basePrice, variation: (variationPercent * 100).toFixed(2) }));
  return dailyPrice;
}

function getAllCurrentPrices() {
  const districts = ['Kolar', 'Malur', 'Chintamani', 'Hoskote'];
  const prices = {};
  for (const commodity of Object.keys(basePrices)) {
    let total = 0, count = 0;
    for (const district of districts) {
      total += getDailyPrice(commodity, district, marketsByDistrict[district][0]);
      count++;
    }
    prices[commodity] = Math.round(total / count);
  }
  return prices;
}

function getPriceTrend(commodity) {
  return {
    'Maize': { direction: 'up', min: 3, max: 8 },
    'Paddy': { direction: 'stable', min: -1, max: 3 },
    'Wheat': { direction: 'up', min: 2, max: 5 },
    'Sugarcane': { direction: 'stable', min: -2, max: 2 }
  }[commodity] || { direction: 'stable', min: -2, max: 3 };
}

function calculatePredictedPrice(currentPrice, commodity, daysAhead = 7, quantile = 0.5) {
  const trend = getPriceTrend(commodity);
  const today = getTodayDate();
  const todayHash = hashCode(today);
  const trendFactor = trend.min + ((todayHash + hashCode(commodity)) % Math.max(1, trend.max - trend.min * 2 + 1));
  const dailyChange = trendFactor / 100;
  const predictedChange = dailyChange * (daysAhead / 7);
  const randomFactor = ((todayHash % 400) - 200) / 10000;
  const quantileAdjustment = (quantile - 0.5) * 0.15;
  const predictedPrice = Math.round(currentPrice * (1 + predictedChange + randomFactor + quantileAdjustment));
  return Math.max(Math.round(currentPrice * 0.85), Math.min(Math.round(currentPrice * 1.25), predictedPrice));
}

// ---- Backend-aware dashboard price update ----
async function updateDashboardPrices() {
  try {
    let prices;
    if (window.AgriAPI) {
      const res = await window.AgriAPI.getDashboardPrices();
      prices = res.prices;
    } else {
      prices = getAllCurrentPrices();
    }
    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = `₹${Number(val).toLocaleString()}`; };
    el('price-maize',     prices['Maize']);
    el('price-paddy',     prices['Paddy']);
    el('price-wheat',     prices['Wheat']);
    el('price-sugarcane', prices['Sugarcane']);
  } catch (e) {
    const prices = getAllCurrentPrices();
    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = `₹${Number(val).toLocaleString()}`; };
    el('price-maize',     prices['Maize']);
    el('price-paddy',     prices['Paddy']);
    el('price-wheat',     prices['Wheat']);
    el('price-sugarcane', prices['Sugarcane']);
  }
}

let storedPredictionValues = {};
let storedSearchValues = {};
let currentPredictionData = { commodity: null, district: null, market: null, currentPrice: null, predictedPrice: null };

// ---- Dropdown Toggles ----
function toggleLoginDropdown() {
  const dropdown = document.getElementById('login-dropdown');
  if (dropdown) dropdown.classList.toggle('hidden');
  // Close when clicking outside
  document.addEventListener('click', function closeDropdown(e) {
    const dropdown = document.getElementById('login-dropdown');
    const btn = document.querySelector('button[onclick="toggleLoginDropdown()"]');
    if (dropdown && !dropdown.classList.contains('hidden')) {
      if (!dropdown.contains(e.target) && (!btn || !btn.contains(e.target))) {
        dropdown.classList.add('hidden');
        document.removeEventListener('click', closeDropdown);
      }
    }
  });
}

function toggleAboutUsLoginDropdown() {
  const dropdown = document.getElementById('about-us-login-dropdown');
  if (dropdown) dropdown.classList.toggle('hidden');
  document.addEventListener('click', function closeDropdown(e) {
    const dropdown = document.getElementById('about-us-login-dropdown');
    const btn = document.querySelector('button[onclick="toggleAboutUsLoginDropdown()"]');
    if (dropdown && !dropdown.classList.contains('hidden')) {
      if (!dropdown.contains(e.target) && (!btn || !btn.contains(e.target))) {
        dropdown.classList.add('hidden');
        document.removeEventListener('click', closeDropdown);
      }
    }
  });
}

// ---- Notifications (Home Page Price Alerts) ----
function updateNotifications() {
  const container = document.getElementById('home-notification-scroll');
  const dateEl = document.getElementById('notification-date');
  if (!container) return;
  if (dateEl) {
    const today = new Date();
    dateEl.textContent = today.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }
  const prices = getAllCurrentPrices();
  const alerts = [
    { emoji: '🌽', name: 'Maize', price: prices['Maize'], trend: '↑ +2.3%' },
    { emoji: '🌾', name: 'Paddy', price: prices['Paddy'], trend: '→ Stable' },
    { emoji: '🌿', name: 'Wheat', price: prices['Wheat'], trend: '↑ +1.8%' },
    { emoji: '🎋', name: 'Sugarcane', price: prices['Sugarcane'], trend: '↓ -0.5%' },
    { emoji: '🌽', name: 'Maize', price: prices['Maize'], trend: 'Kolar APMC' },
    { emoji: '🌾', name: 'Paddy', price: prices['Paddy'], trend: 'Chintamani' },
    { emoji: '🌿', name: 'Wheat', price: prices['Wheat'], trend: 'Hoskote APMC' },
    { emoji: '🎋', name: 'Sugarcane', price: prices['Sugarcane'], trend: 'Malur Main' }
  ];
  const html = alerts.map(a => `
    <div class="flex items-center justify-between p-2 bg-white bg-opacity-10 rounded-xl">
      <span class="text-white text-sm">${a.emoji} ${a.name}</span>
      <div class="text-right">
        <span class="text-emerald-200 text-xs font-bold">₹${a.price.toLocaleString()}</span>
        <span class="text-emerald-300 text-xs block">${a.trend}</span>
      </div>
    </div>`).join('');
  // Duplicate for seamless scroll loop
  container.innerHTML = html + html;
}

// ---- Markets Available Count ----
function updateMarketsAvailableCount() {
  const el = document.getElementById('user-markets-available');
  if (el) {
    let count = 0;
    for (const district of Object.keys(marketsByDistrict)) {
      count += marketsByDistrict[district].length;
    }
    el.textContent = count;
  }
}

// ---- Password Visibility Toggle ----
function togglePasswordVisibility(inputId, eyeId) {
  const input = document.getElementById(inputId);
  const eye = document.getElementById(eyeId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (eye) eye.textContent = '🙈';
  } else {
    input.type = 'password';
    if (eye) eye.textContent = '👁️';
  }
}

// ---- Password Strength Meter ----
function updatePasswordStrength(value) {
  const bar = document.getElementById('pw-strength-bar');
  const label = document.getElementById('pw-strength-label');
  const reqLen = document.getElementById('req-len');
  const reqUpper = document.getElementById('req-upper');
  const reqLower = document.getElementById('req-lower');
  const reqDigit = document.getElementById('req-digit');
  const reqSym = document.getElementById('req-sym');

  const hasLen = value.length >= 8;
  const hasUpper = /[A-Z]/.test(value);
  const hasLower = /[a-z]/.test(value);
  const hasDigit = /[0-9]/.test(value);
  const hasSym = /[!@#$%^&*(),.?":{}|<>]/.test(value);

  const mark = (el, met) => {
    if (!el) return;
    el.className = met ? 'met' : 'unmet';
    el.textContent = el.textContent.replace(/^[✓✗] /, (met ? '✓ ' : '✗ '));
  };
  mark(reqLen, hasLen);
  mark(reqUpper, hasUpper);
  mark(reqLower, hasLower);
  mark(reqDigit, hasDigit);
  mark(reqSym, hasSym);

  const score = [hasLen, hasUpper, hasLower, hasDigit, hasSym].filter(Boolean).length;
  const configs = [
    { width: '0%', color: '#e5e7eb', text: '', textColor: '' },
    { width: '20%', color: '#ef4444', text: 'Very Weak', textColor: '#ef4444' },
    { width: '40%', color: '#f97316', text: 'Weak', textColor: '#f97316' },
    { width: '60%', color: '#eab308', text: 'Fair', textColor: '#eab308' },
    { width: '80%', color: '#22c55e', text: 'Strong', textColor: '#22c55e' },
    { width: '100%', color: '#10b981', text: 'Very Strong', textColor: '#10b981' }
  ];
  const cfg = configs[score];
  if (bar) { bar.style.width = cfg.width; bar.style.background = cfg.color; }
  if (label) { label.textContent = cfg.text; label.style.color = cfg.textColor; }
}

// ---- Email Validation ----
function validateRegEmail() {
  const emailInput = document.getElementById('reg-email');
  const hint = document.getElementById('reg-email-hint');
  if (!emailInput || !hint) return;
  const val = emailInput.value.trim();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  hint.classList.remove('hidden');
  if (!val) { hint.textContent = ''; hint.classList.add('hidden'); return; }
  if (valid) {
    hint.textContent = '✓ Valid email address';
    hint.className = 'text-xs mt-1 text-emerald-600';
  } else {
    hint.textContent = '✗ Please enter a valid email (e.g. name@gmail.com)';
    hint.className = 'text-xs mt-1 text-red-500';
  }
}

// ---- Complaint Submit (About Us Page) ----
async function handleComplaintSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('complaint-name')?.value?.trim();
  const email = document.getElementById('complaint-email')?.value?.trim();
  const commodity = document.getElementById('complaint-commodity')?.value;
  const message = document.getElementById('complaint-message')?.value?.trim();
  const submitBtn = e.target.querySelector('button[type="submit"]');

  if (!name || !email || !commodity || !message) {
    showToast('Please fill in all required fields', '⚠️');
    return;
  }

  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting...'; }

  const complaintData = {
    type: 'remark',
    complaint_type: 'complaint',
    username: name,
    email: email,
    commodity: commodity,
    remark: message,
    district: 'N/A',
    market: 'N/A',
    created_at: new Date().toISOString(),
    sync_id: Date.now()
  };

  // Save locally first
  try {
    const pending = JSON.parse(localStorage.getItem('pendingcomplaints') || '[]');
    pending.unshift(complaintData);
    localStorage.setItem('pendingcomplaints', JSON.stringify(pending));
    showToast('Complaint saved! Syncing...', '📥');
  } catch (err) {
    console.error('Local save failed', err);
  }

  // Try backend
  try {
    const res = await fetch('/api/remarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(complaintData)
    });
    const data = await res.json();
    if (data.success) {
      showToast('Complaint submitted! We will respond within 24 hours.', '✅');
    } else {
      showToast('Complaint saved locally. Admin will be notified.', '📋');
    }
  } catch (err) {
    showToast('Complaint saved locally. Will sync when online.', '📋');
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit Complaint ⚠️'; }
    e.target.reset();
  }
}

// ---- Page Navigation ----
function showPage(page, addToHistory = true) {
  if (addToHistory && currentPage && page !== currentPage) {
    const lastPage = navigationHistory[navigationHistory.length - 1];
    if (lastPage !== page) navigationHistory.push(currentPage);
  }
  currentPage = page;
  ['home-page','about-us-page','login-page','register-page','admin-login-page','user-dashboard','admin-dashboard'].forEach(id => {
    document.getElementById(id)?.classList.add('hidden');
  });
  const map = {
    'home': 'home-page',
    'about-us': 'about-us-page',
    'user-login': 'login-page',
    'user-register': 'register-page',
    'user-admin-login': 'admin-login-page',
    'user-dashboard': 'user-dashboard',
    'admin-dashboard': 'admin-dashboard'
  };
  if (map[page]) document.getElementById(map[page])?.classList.remove('hidden');
  if (page === 'home') updateNotifications();
  if (page === 'user-admin-login') loadAdminCredentials();
  if (page === 'admin-dashboard') {
    updateAllStats(); updateUsersTable(); updateActivityTimeline();
    setTimeout(() => initAdminCharts(), 100);
  }
}

function goBack() {
  if (navigationHistory.length > 0) showPage(navigationHistory.pop(), false);
  else showPage('home', false);
}

function showUserSection(section) {
  ['dashboard','market-search','prediction','profile','settings'].forEach(s => {
    document.getElementById(`user-section-${s}`)?.classList.add('hidden');
    document.querySelector(`.user-nav-item[data-section="${s}"]`)?.classList.remove('bg-emerald-600');
  });
  document.getElementById(`user-section-${section}`)?.classList.remove('hidden');
  document.querySelector(`.user-nav-item[data-section="${section}"]`)?.classList.add('bg-emerald-600');
  if (section === 'dashboard') { updateDashboardPrices(); updateMarketsAvailableCount(); }
}

function showAdminSection(section) {
  ['dashboard','control','data','activity','users','profile'].forEach(s => {
    document.getElementById(`admin-section-${s}`)?.classList.add('hidden');
    document.querySelector(`.admin-nav-item[data-section="${s}"]`)?.classList.remove('bg-emerald-600');
  });
  document.getElementById(`admin-section-${section}`)?.classList.remove('hidden');
  document.querySelector(`.admin-nav-item[data-section="${section}"]`)?.classList.add('bg-emerald-600');
  if (section === 'dashboard') { updateAllStats(); initAdminCharts(); }
  else if (section === 'data') { updateAllStats(); setTimeout(() => initDataChart(), 100); }
  else if (section === 'activity') { updateAllStats(); updateActivityTimeline(); }
  else if (section === 'users') { updateAllStats(); updateUsersTable(); }
}

// ---- Auth ----
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-btn');
  btn.textContent = 'Signing in...'; btn.disabled = true;
  try {
    if (window.AgriAPI) {
      const res = await window.AgriAPI.login(email, password);
      currentUser = res.user; isAdmin = false;
      updateUserProfile();
      showToast('Login successful!', '✅');
      showPage('user-dashboard'); showUserSection('dashboard');
    } else {
      const existingUser = userIndexByEmail.get(email.toLowerCase());
      if (existingUser && existingUser.password === password) {
        currentUser = existingUser; isAdmin = false;
        updateUserProfile();
        showToast('Login successful!', '✅');
        showPage('user-dashboard'); showUserSection('dashboard');
      } else showToast(existingUser ? 'Invalid password' : 'User not found. Please register.', '❌');
    }
  } catch (err) {
    showToast(err.message || 'Login failed', '❌');
  }
  btn.textContent = 'Sign In'; btn.disabled = false;
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;
  const phone = document.getElementById('reg-phone').value;
  const password = document.getElementById('reg-password').value;
  const confirm = document.getElementById('reg-confirm').value;
  const errorEl = document.getElementById('reg-error');
  const phoneDigits = phone.replace(/\D/g, '');
  if (phoneDigits.length !== 10) { errorEl.textContent = 'Mobile number must be exactly 10 digits'; errorEl.classList.remove('hidden'); return; }
  if (password !== confirm) { errorEl.textContent = 'Passwords do not match'; errorEl.classList.remove('hidden'); return; }
  errorEl.classList.add('hidden');
  try {
    if (window.AgriAPI) {
      await window.AgriAPI.register(name, email, phone, password);
      document.getElementById('register-form').reset();
      showToast('Registration successful! Please login.', '✅');
      showPage('user-login');
    } else {
      const existingUser = userIndexByEmail.get(email.toLowerCase());
      if (existingUser) { errorEl.textContent = 'Email already registered'; errorEl.classList.remove('hidden'); return; }
      const newUser = { type: 'user', username: name, email, phone, password, role: 'user', status: 'active', created_at: new Date().toISOString() };
      allData.push(newUser); userIndexByEmail.set(email.toLowerCase(), newUser);
      document.getElementById('register-form').reset();
      showToast('Registration successful! Please login.', '✅');
      showPage('user-login');
    }
  } catch (err) {
    errorEl.textContent = err.message || 'Registration failed'; errorEl.classList.remove('hidden');
  }
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const email = document.getElementById('admin-email').value;
  const password = document.getElementById('admin-password').value;
  const secret = document.getElementById('admin-secret').value;
  const rememberMe = document.getElementById('admin-remember')?.checked || false;
  const errorEl = document.getElementById('admin-error');
  errorEl.classList.add('hidden');
  if (!email.toLowerCase().endsWith('@gmail.com')) {
    errorEl.textContent = 'Please use a valid @gmail.com email address'; errorEl.classList.remove('hidden'); return;
  }
  if (secret !== 'AGRI2026') {
    errorEl.textContent = 'Invalid secret key'; errorEl.classList.remove('hidden'); return;
  }
  const btn = document.getElementById('admin-login-btn');
  btn.textContent = 'Verifying...'; btn.disabled = true;
  try {
    if (window.AgriAPI) {
      const res = await window.AgriAPI.adminLogin(email, password, secret);
      saveAdminCredentials(email, password, secret, rememberMe);
      currentUser = res.user; isAdmin = true;
      updateAdminProfile();
      showToast('Admin login successful!', '🛡️');
      showPage('admin-dashboard'); showAdminSection('dashboard');
    } else {
      if (email === 'admin@gmail.com' && password === 'admin123') {
        saveAdminCredentials(email, password, secret, rememberMe);
        currentUser = { username: 'Admin', email, phone: '9999999999', role: 'admin' }; isAdmin = true;
        updateAdminProfile();
        showToast('Admin login successful!', '🛡️');
        showPage('admin-dashboard'); showAdminSection('dashboard');
      } else { errorEl.textContent = 'Invalid admin credentials'; errorEl.classList.remove('hidden'); }
    }
  } catch (err) {
    errorEl.textContent = err.message || 'Admin login failed'; errorEl.classList.remove('hidden');
  }
  btn.textContent = 'Access Admin Panel'; btn.disabled = false;
}

function handleLogout() {
  localStorage.removeItem(ADMIN_REMEMBER_KEY);
  localStorage.removeItem(ADMIN_CREDENTIALS_KEY);
  if (window.AgriAPI) window.AgriAPI.logout().catch(() => {});
  currentUser = null; isAdmin = false;
  showToast('Logged out successfully', '👋');
  setTimeout(() => showPage('home', false), 100);
}

// ---- Market ----
function updateMarkets() {
  const district = document.getElementById('search-district').value;
  const marketSelect = document.getElementById('search-market');
  marketSelect.innerHTML = '<option value="">Select Market</option>';
  if (district && marketsByDistrict[district]) {
    marketsByDistrict[district].forEach(m => { marketSelect.innerHTML += `<option value="${m}">${m}</option>`; });
  }
}

function updatePredMarkets() {
  const district = document.getElementById('pred-district').value;
  const marketSelect = document.getElementById('pred-market');
  marketSelect.innerHTML = '<option value="">Select Market</option>';
  if (district && marketsByDistrict[district]) {
    marketsByDistrict[district].forEach(m => { marketSelect.innerHTML += `<option value="${m}">${m}</option>`; });
  }
}

async function handleMarketSearch(e) {
  e.preventDefault();
  const commodity = document.getElementById('search-commodity').value;
  const district = document.getElementById('search-district').value;
  const market = document.getElementById('search-market').value;
  const quantity = document.getElementById('search-quantity').value;
  let currentPrice, totalValue;
  try {
    if (window.AgriAPI) {
      const res = await window.AgriAPI.searchPrice(commodity, district, market);
      currentPrice = Math.round(parseFloat(res.price?.price_per_quintal || getDailyPrice(commodity, district, market)));
    } else {
      currentPrice = getDailyPrice(commodity, district, market);
    }
    await logActivity('market_search', `Searched ${commodity} in ${market}, ${district}`);
  } catch (e) {
    currentPrice = getDailyPrice(commodity, district, market);
  }
  totalValue = currentPrice * quantity;
  const resultsDiv = document.getElementById('price-results');
  resultsDiv.innerHTML = `
    <div class="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border-l-4 border-emerald-500">
      <p class="font-semibold text-emerald-800">${commodity}</p>
      <p class="text-2xl font-bold text-gray-800 mt-1">₹${currentPrice.toLocaleString()}/quintal</p>
    </div>
    <div class="mt-3 grid grid-cols-2 gap-3">
      <div class="p-3 bg-gray-50 rounded-xl"><div class="text-gray-500 text-xs">Market</div><div class="font-medium">${market}</div></div>
      <div class="p-3 bg-gray-50 rounded-xl"><div class="text-gray-500 text-xs">District</div><div class="font-medium">${district}</div></div>
      <div class="p-3 bg-gray-50 rounded-xl"><div class="text-gray-500 text-xs">Quantity</div><div class="font-medium">${quantity} quintals</div></div>
      <div class="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl border-l-4 border-blue-500">
        <div class="text-gray-600 text-xs">Total Value</div>
        <div class="text-xl font-bold text-blue-800">₹${totalValue.toLocaleString()}</div>
      </div>
    </div>`;
  document.getElementById('search-results').classList.remove('hidden');
  initSearchChart(commodity, currentPrice);
  updateUserStats();
}

async function handlePrediction(e) {
  e.preventDefault();
  const commodity = document.getElementById('pred-commodity').value;
  const district = document.getElementById('pred-district').value;
  const market = document.getElementById('pred-market').value;
  const quantity = document.getElementById('pred-quantity').value;
  let currentPrice, predictedPrice;
  try {
    if (window.AgriAPI) {
      const res = await window.AgriAPI.savePrediction(commodity, district, market, quantity);
      currentPrice = Math.round(res.currentPrice);
      predictedPrice = Math.round(res.predictedPrice);
    } else {
      currentPrice = getDailyPrice(commodity, district, market);
      predictedPrice = calculatePredictedPrice(currentPrice, commodity);
      await logActivity('prediction', `Predicted ${commodity} prices for ${market}, ${district}`);
    }
  } catch (err) {
    currentPrice = getDailyPrice(commodity, district, market);
    predictedPrice = calculatePredictedPrice(currentPrice, commodity);
  }
  currentPredictionData = { commodity, district, market, currentPrice, predictedPrice };
  document.getElementById('current-price').textContent = currentPrice.toLocaleString();
  document.getElementById('predicted-price').textContent = predictedPrice.toLocaleString();
  document.getElementById('prediction-results').classList.remove('hidden');
  initPredictionChart(commodity, currentPrice, predictedPrice);
  updateUserStats();
}

async function logActivity(type, description) {
  const activity = { type: 'activity', username: currentUser?.username || 'Anonymous', activitytype: type, description, created_at: new Date().toISOString() };
  allData.push(activity);
  if (window.AgriAPI) window.AgriAPI.logActivity(type, description).catch(() => {});
  updateAllStats(); updateActivityTimeline();
}

// ---- UI Updates ----
function updateUserProfile() {
  if (!currentUser) return;
  ['sidebar-username','header-username','profile-heading','profile-name'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = currentUser.username || 'Farmer';
  });
  const pe = document.getElementById('profile-email'); if (pe) pe.textContent = currentUser.email || 'N/A';
  const pp = document.getElementById('profile-phone'); if (pp) pp.textContent = currentUser.phone ? `+91 ${currentUser.phone}` : 'N/A';
}

function updateAdminProfile() {
  if (!currentUser) return;
  ['admin-sidebar-name','admin-profile-name'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = currentUser.username || 'Admin';
  });
  const ae = document.getElementById('admin-profile-email'); if (ae) ae.textContent = currentUser.email || 'admin@agripredict.com';
  const ap = document.getElementById('admin-profile-phone'); if (ap) ap.textContent = currentUser.phone ? `+91 ${currentUser.phone}` : 'N/A';
}

async function updateAllStats() {
  try {
    if (window.AgriAPI && isAdmin) {
      const [uStats, aStats, pStats] = await Promise.all([
        window.AgriAPI.getUserStats().catch(() => ({ stats: { total:0, active:0, admins:0, today:0 } })),
        window.AgriAPI.getActivityStats().catch(() => ({ stats: { total:0, market_search:0, prediction:0 } })),
        window.AgriAPI.getPredictionStats().catch(() => ({ total:0 }))
      ]);
      const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
      set('admin-total-users', uStats.stats?.total ?? 0);
      set('admin-total-activities', aStats.stats?.total ?? 0);
      set('admin-predictions', aStats.stats?.prediction ?? pStats.total ?? 0);
      set('admin-records', 0);
      set('users-total', uStats.stats?.total ?? 0);
      set('users-active', uStats.stats?.active ?? 0);
      set('users-admins', uStats.stats?.admins ?? 0);
      set('users-today', uStats.stats?.today ?? 0);
      set('activity-searches', aStats.stats?.market_search ?? 0);
      set('activity-predictions', aStats.stats?.prediction ?? 0);
      set('activity-total', aStats.stats?.total ?? 0);
      set('data-total-records', 0);
      return;
    }
  } catch (e) {}
  // fallback local
  const users = allData.filter(d => d.type === 'user');
  const activities = allData.filter(d => d.type === 'activity');
  const searches = activities.filter(a => a.activitytype === 'market_search');
  const predictions = activities.filter(a => a.activitytype === 'prediction');
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set('admin-total-users', users.length);
  set('admin-total-activities', activities.length);
  set('admin-predictions', predictions.length);
  set('admin-records', 0);
  set('users-total', users.length);
  set('users-active', users.filter(u => u.status === 'active').length);
  set('users-admins', users.filter(u => u.role === 'admin').length);
  set('users-today', users.filter(u => u.created_at?.startsWith(getTodayDate())).length);
  set('activity-searches', searches.length);
  set('activity-predictions', predictions.length);
  set('activity-total', activities.length);
}

function updateUserStats() {
  if (!currentUser) return;
  const userActivities = allData.filter(d => d.type === 'activity' && d.username === currentUser.username);
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set('user-searches', userActivities.filter(a => a.activitytype === 'market_search').length);
  set('user-predictions', userActivities.filter(a => a.activitytype === 'prediction').length);
}

async function updateUsersTable() {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;
  let users = [];
  try {
    if (window.AgriAPI) {
      const res = await window.AgriAPI.getUsers();
      users = res.users || [];
    } else {
      users = allData.filter(d => d.type === 'user');
    }
  } catch (e) { users = allData.filter(d => d.type === 'user'); }
  if (users.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-8 text-center text-gray-500">No users registered yet</td></tr>'; return; }
  tbody.innerHTML = users.map(user => `
    <tr class="border-t border-gray-200 hover:bg-gray-50">
      <td class="px-6 py-4 text-sm font-medium text-gray-800">${user.username || 'N/A'}</td>
      <td class="px-6 py-4 text-sm text-gray-600">${user.email || 'N/A'}</td>
      <td class="px-6 py-4 text-sm text-gray-600">${user.phone || 'N/A'}</td>
      <td class="px-6 py-4"><span class="px-2 py-1 text-xs font-medium rounded-full ${user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}">${user.role || 'user'}</span></td>
      <td class="px-6 py-4"><span class="px-2 py-1 text-xs font-medium rounded-full ${user.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">${user.status || 'active'}</span></td>
      <td class="px-6 py-4 text-sm text-gray-600">${user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}</td>
      <td class="px-6 py-4"><button onclick="editUser('${user.id}')" class="text-blue-600 hover:text-blue-800 text-sm font-medium">Edit</button></td>
    </tr>`).join('');
}

async function updateActivityTimeline() {
  const timeline = document.getElementById('activity-timeline');
  if (!timeline) return;
  let activities = [];
  try {
    if (window.AgriAPI) {
      const res = await window.AgriAPI.getActivities(10);
      activities = res.activities || [];
    } else {
      activities = allData.filter(d => d.type === 'activity').slice(-10).reverse();
    }
  } catch (e) { activities = allData.filter(d => d.type === 'activity').slice(-10).reverse(); }
  if (activities.length === 0) { timeline.innerHTML = '<p class="text-gray-500 text-center py-8">No activities recorded yet</p>'; return; }
  const icons = { 'login': '🔐', 'admin_login': '🛡️', 'market_search': '🔍', 'prediction': '🤖', 'register': '🌱', 'logout': '👋' };
  timeline.innerHTML = activities.map(a => `
    <div class="flex items-start gap-4 p-3 bg-gray-50 rounded-xl">
      <div class="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow">
        <span class="text-lg">${icons[a.activity_type || a.activitytype] || '📌'}</span>
      </div>
      <div class="flex-1">
        <p class="font-medium text-gray-800">${a.description || 'Activity'}</p>
        <p class="text-sm text-gray-500">${a.username || 'Unknown'} · ${a.created_at ? new Date(a.created_at).toLocaleString() : 'N/A'}</p>
      </div>
    </div>`).join('');
}

function editUser(id) { showToast('Edit user feature coming soon', 'ℹ️'); }

async function saveAdminConfig() {
  const title = document.getElementById('ctrl-app-title')?.value;
  const tagline = document.getElementById('ctrl-tagline')?.value;
  try {
    if (window.AgriAPI) await window.AgriAPI.updateConfig({ app_title: title, tagline });
    const ht = document.getElementById('home-title'); if (ht && title) ht.textContent = title;
    showToast('Settings saved!', '✅');
  } catch (e) { showToast('Failed to save settings', '❌'); }
}

// ---- Forgot Password ----
function showForgotPasswordModal() {
  showModal(`
    <h3 class="text-xl font-bold text-gray-800 mb-2">Reset Password</h3>
    <p class="text-gray-600 text-sm mb-4">Enter your registered email address to receive password reset instructions.</p>
    <form onsubmit="handleForgotPassword(event)">
      <div class="mb-4">
        <label class="block text-gray-700 font-medium mb-2">Email Address</label>
        <input type="email" id="forgot-email" required class="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-teal-500" placeholder="Enter your email" />
      </div>
      <div id="forgot-error" class="hidden mb-4 p-3 bg-red-100 text-red-700 rounded-xl text-sm"></div>
      <div id="forgot-success" class="hidden mb-4 p-3 bg-green-100 text-green-700 rounded-xl text-sm"></div>
      <div class="flex gap-3">
        <button type="button" onclick="hideModal()" class="flex-1 py-3 border-2 border-gray-300 text-gray-600 rounded-xl font-bold hover:bg-gray-50">Cancel</button>
        <button type="submit" id="forgot-submit-btn" class="flex-1 py-3 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700">Send Reset Link</button>
      </div>
    </form>`);
}

async function handleForgotPassword(e) {
  e.preventDefault();
  const email = document.getElementById('forgot-email').value;
  const errorEl = document.getElementById('forgot-error');
  const successEl = document.getElementById('forgot-success');
  const btn = document.getElementById('forgot-submit-btn');
  errorEl.classList.add('hidden'); successEl.classList.add('hidden');
  btn.textContent = 'Sending...'; btn.disabled = true;
  await new Promise(r => setTimeout(r, 1200));
  successEl.innerHTML = `✅ If <strong>${email}</strong> is registered, a reset link has been sent.`;
  successEl.classList.remove('hidden');
  btn.textContent = 'Send Reset Link'; btn.disabled = false;
}

// ---- Modal ----
function showModal(content) {
  document.getElementById('modal-content').innerHTML = content;
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function hideModal() { document.getElementById('modal-overlay').classList.add('hidden'); }

// ---- Toast ----
function showToast(msg, icon = 'ℹ️') {
  const n = document.getElementById('notification');
  document.getElementById('notif-icon').textContent = icon;
  document.getElementById('notif-msg').textContent = msg;
  n.classList.remove('hidden');
  setTimeout(() => n.classList.add('hidden'), 3500);
}

// ---- Charts ----
function initSearchChart(commodity, currentPrice) {
  const ctx = document.getElementById('search-chart');
  if (!ctx) return;
  if (charts.search) charts.search.destroy();
  const years = [2021,2022,2023,2024,2025,2026,2027,2028,2029,2030,2031];
  const basePrice = basePrices[commodity] || 2000;
  const prices = years.map(year => {
    const variation = (year - 2021) * 1.5 + (year % 3 - 1) * 2;
    return Math.round(basePrice * (1 + variation / 100));
  });
  charts.search = new Chart(ctx, {
    type: 'bar',
    data: { labels: years, datasets: [{ label: 'Price for 1 Quintal', data: prices, backgroundColor: prices.map((_, i) => `rgba(13,148,136,${Math.min(0.4 + i * 0.06, 1)})`), borderColor: '#0d9488', borderWidth: 1, borderRadius: 6 }] },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, title: { display: true, text: `${commodity} Price Chart - 1 Quintal`, font: { size: 16, weight: 'bold' } }, tooltip: { callbacks: { label: ctx => `${ctx.parsed.x.toLocaleString()}/quintal` } } }, scales: { x: { title: { display: true, text: 'Amount (₹/Quintal)' }, beginAtZero: false }, y: { title: { display: true, text: 'Years' }, grid: { display: false } } } }
  });
}

function initPredictionChart(commodity, currentPrice, predictedPrice) {
  const ctx = document.getElementById('prediction-chart');
  if (!ctx) return;
  if (charts.prediction) charts.prediction.destroy();
  const priceChange = ((predictedPrice - currentPrice) / currentPrice * 100);
  const isPositive = priceChange > 0;
  const historicalPrices = [currentPrice - Math.round(currentPrice * 0.05), currentPrice - Math.round(currentPrice * 0.03), currentPrice - Math.round(currentPrice * 0.01), currentPrice];
  const futurePrices = [];
  for (let i = 0; i < 4; i++) {
    const progress = (i + 1) / 4;
    const base = currentPrice + (predictedPrice - currentPrice) * progress;
    futurePrices.push(Math.round(base + (Math.random() * 40 - 20) * (1 - progress * 0.5)));
  }
  const labels = ['3 Weeks Ago','2 Weeks Ago','Last Week','Today','Next Week','In 2 Weeks','In 3 Weeks','In 4 Weeks'];
  charts.prediction = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [
      { label: 'Historical Prices', data: [...historicalPrices, null, null, null, null], borderColor: '#ff6b6b', backgroundColor: 'rgba(255,107,107,0.1)', borderWidth: 3, fill: true, tension: 0.4, pointRadius: 7, pointHoverRadius: 10 },
      { label: 'Current Price', data: [null,null,null,currentPrice,null,null,null,null], borderColor: '#f59e0b', backgroundColor: '#f59e0b', borderWidth: 0, pointRadius: 10, pointHoverRadius: 12, pointStyle: 'star', showLine: false },
      { label: 'Predicted Prices', data: [null,null,null,currentPrice,...futurePrices], borderColor: isPositive ? '#10b981' : '#ef4444', backgroundColor: isPositive ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', borderWidth: 3, borderDash: [8,4], fill: true, tension: 0.4, pointRadius: 6 }
    ]},
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, title: { display: true, text: `${commodity} Price Forecast - Next 4 Weeks`, font: { size: 16, weight: 'bold' } } }, scales: { y: { title: { display: true, text: 'Price (₹/quintal)' }, beginAtZero: false }, x: { grid: { display: false } } } }
  });
}

function initAdminCharts() {
  const ctx = document.getElementById('admin-overview-chart');
  if (!ctx) return;
  if (charts.adminOverview) charts.adminOverview.destroy();
  const users = allData.filter(d => d.type === 'user').length;
  const activities = allData.filter(d => d.type === 'activity').length;
  const searches = allData.filter(d => d.activitytype === 'market_search').length;
  const predictions = allData.filter(d => d.activitytype === 'prediction').length;
  charts.adminOverview = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: ['Users','Market Searches','Predictions','Other Activities'], datasets: [{ data: [users+1, searches+1, predictions+1, Math.max(0, activities - searches - predictions)+1], backgroundColor: ['#10b981','#0ea5e9','#8b5cf6','#f59e0b'], borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#374151' } } } }
  });
}

function initDataChart() {
  const ctx = document.getElementById('data-chart');
  if (!ctx) return;
  if (charts.data) charts.data.destroy();
  const years = [2021,2022,2023,2024,2025,2026,2027,2028];
  charts.data = new Chart(ctx, {
    type: 'bar',
    data: { labels: years, datasets: [
      { label: 'Maize (₹/quintal)', data: [2050,2080,2120,2180,2150,2200,2250,2300], backgroundColor: 'rgba(251,191,36,0.8)', borderColor: 'rgb(251,191,36)', borderWidth: 2, borderRadius: 6 },
      { label: 'Paddy (₹/quintal)', data: [1850,1900,1920,1960,1940,1980,2020,2060], backgroundColor: 'rgba(96,165,250,0.8)', borderColor: 'rgb(96,165,250)', borderWidth: 2, borderRadius: 6 },
      { label: 'Wheat (₹/quintal)', data: [2180,2220,2250,2300,2275,2320,2370,2420], backgroundColor: 'rgba(167,139,250,0.8)', borderColor: 'rgb(167,139,250)', borderWidth: 2, borderRadius: 6 },
      { label: 'Sugarcane (₹/quintal)', data: [290,300,305,315,310,320,330,340], backgroundColor: 'rgba(52,211,153,0.8)', borderColor: 'rgb(52,211,153)', borderWidth: 2, borderRadius: 6 }
    ]},
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' }, title: { display: true, text: 'Average Commodity Prices 2021-2028', font: { size: 16, weight: 'bold' } }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ₹${ctx.parsed.y.toLocaleString()}/quintal` } } }, scales: { y: { title: { display: true, text: 'Price (₹/quintal)' }, beginAtZero: false }, x: { title: { display: true, text: 'Years' } } } }
  });
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', async () => {
  showPage('home', false);
  updateNotifications();
  updateMarketsAvailableCount();
  // Load activities from localStorage fallback
  try {
    const stored = localStorage.getItem('agripredictactivities');
    if (stored) { const acts = JSON.parse(stored); acts.forEach(a => allData.push(a)); }
  } catch (e) {}
});
