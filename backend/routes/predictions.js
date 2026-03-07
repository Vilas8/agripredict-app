const express = require('express');
const router = express.Router();
const https = require('https');
const http = require('http');
const supabase = require('../lib/supabase');
const { verifyToken, verifyAdmin } = require('../middleware/auth');

// ── Commodity name mappings for Agmarknet API ──────────────────────────────
const AGMARKNET_COMMODITY_MAP = {
  'Maize':     'Maize',
  'Paddy':     'Paddy(Dhan)(Common)',
  'Wheat':     'Wheat',
  'Sugarcane': 'Sugarcane'
};

// Fallback MSP / base prices (₹/quintal) — updated FY2025-26
const BASE_PRICES = { Maize: 2225, Paddy: 2300, Wheat: 2425, Sugarcane: 340 };

// ── Seasonal trend coefficients (based on NCDEX/Agmarknet historical data) ─
const SEASONAL_TRENDS = {
  Maize:     { annual_growth: 0.055, volatility: 0.04, harvest_dip_months: [10,11], peak_months: [4,5,6] },
  Paddy:     { annual_growth: 0.048, volatility: 0.03, harvest_dip_months: [11,12,1], peak_months: [6,7,8] },
  Wheat:     { annual_growth: 0.052, volatility: 0.03, harvest_dip_months: [3,4,5], peak_months: [10,11,12] },
  Sugarcane: { annual_growth: 0.035, volatility: 0.02, harvest_dip_months: [1,2,3], peak_months: [8,9,10] }
};

// ── Fetch live price from Agmarknet Open API ───────────────────────────────
function fetchAgmarknetPrice(commodity, state = 'Karnataka', district = 'Kolar') {
  return new Promise((resolve) => {
    const commodityName = AGMARKNET_COMMODITY_MAP[commodity] || commodity;
    // Agmarknet data.gov.in API endpoint
    const url = `https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070?api-key=${process.env.AGMARKNET_API_KEY || 'demo_key'}&format=json&limit=10&filters%5Bcommodity%5D=${encodeURIComponent(commodityName)}&filters%5Bstate%5D=${encodeURIComponent(state)}&filters%5Bdistrict%5D=${encodeURIComponent(district)}`;
    
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const records = json.records || json.data || [];
          if (records.length > 0) {
            // Sort by date descending to get latest
            records.sort((a, b) => new Date(b.arrival_date || b.date || 0) - new Date(a.arrival_date || a.date || 0));
            const latest = records[0];
            // Agmarknet returns modal_price (most common trading price)
            const price = parseFloat(latest.modal_price || latest.max_price || latest.min_price || 0);
            if (price > 0) return resolve({ price, source: 'agmarknet', date: latest.arrival_date || new Date().toISOString() });
          }
          resolve(null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// ── Fetch from Agmarknet via data.gov.in (alternative endpoint) ────────────
function fetchDataGovPrice(commodity) {
  return new Promise((resolve) => {
    const commodityName = AGMARKNET_COMMODITY_MAP[commodity] || commodity;
    const apiKey = process.env.DATA_GOV_API_KEY || process.env.AGMARKNET_API_KEY || 'demo_key';
    const url = `https://api.data.gov.in/resource/35985678-0d79-46b4-9ed6-6f13308a1d24?api-key=${apiKey}&format=json&limit=5&filters%5BCommodity%5D=${encodeURIComponent(commodityName)}&filters%5BState%5D=Karnataka`;
    
    const req = https.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const records = json.records || [];
          if (records.length > 0) {
            const prices = records.map(r => parseFloat(r.Modal_Price || r.modal_price || 0)).filter(p => p > 100);
            if (prices.length > 0) {
              const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
              return resolve({ price: Math.round(avg), source: 'data.gov.in' });
            }
          }
          resolve(null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// ── Get best available live price ─────────────────────────────────────────
async function getLivePrice(commodity, district) {
  // 1. Try Supabase DB first (today's cached price)
  const today = new Date().toISOString().split('T')[0];
  const { data: dbPrice } = await supabase
    .from('commodity_prices')
    .select('price_per_quintal, source')
    .eq('commodity', commodity)
    .eq('district', district)
    .eq('price_date', today)
    .maybeSingle();
  
  if (dbPrice) return { price: parseFloat(dbPrice.price_per_quintal), source: dbPrice.source || 'cache' };

  // 2. Try Agmarknet live API
  const agmarkPrice = await fetchAgmarknetPrice(commodity, 'Karnataka', district);
  if (agmarkPrice) {
    // Cache in Supabase for today
    await supabase.from('commodity_prices').upsert([{
      commodity, district, market: `${district} APMC`,
      price_per_quintal: agmarkPrice.price,
      price_date: today, source: 'agmarknet'
    }], { onConflict: 'commodity,district,market,price_date' });
    return agmarkPrice;
  }

  // 3. Try data.gov.in as fallback
  const govPrice = await fetchDataGovPrice(commodity);
  if (govPrice) return govPrice;

  // 4. Final fallback: MSP-based calculation with seasonal adjustment
  return { price: getSeasonalPrice(commodity), source: 'msp_seasonal' };
}

// ── Seasonal price calculator (accurate MSP + seasonal pattern) ───────────
function getSeasonalPrice(commodity) {
  const base = BASE_PRICES[commodity] || 2000;
  const trend = SEASONAL_TRENDS[commodity];
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  
  // Apply annual growth from 2021 base
  const yearFactor = 1 + trend.annual_growth * (year - 2021);
  
  // Apply seasonal pattern
  let seasonalFactor = 1.0;
  if (trend.harvest_dip_months.includes(month)) seasonalFactor = 0.94; // price dips at harvest
  if (trend.peak_months.includes(month)) seasonalFactor = 1.06;        // peaks in lean season
  
  return Math.round(base * yearFactor * seasonalFactor);
}

// ── ML-style prediction: weighted trend + seasonal + momentum ─────────────
function predictPrice(currentPrice, commodity, daysAhead = 7) {
  const trend = SEASONAL_TRENDS[commodity] || { annual_growth: 0.05, volatility: 0.03 };
  const now = new Date();
  const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  const futureMonth = futureDate.getMonth() + 1;

  // Weekly growth rate from annual
  const weeklyGrowth = trend.annual_growth / 52;
  const weeksAhead = daysAhead / 7;

  // Seasonal momentum: are we moving toward harvest or peak?
  let seasonalMomentum = 0;
  if (trend.harvest_dip_months.includes(futureMonth)) seasonalMomentum = -0.025;
  else if (trend.peak_months.includes(futureMonth)) seasonalMomentum = 0.025;

  // Market volatility: bounded random walk based on commodity
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const deterministicNoise = (Math.sin(dayOfYear * 0.17 + commodity.length) * trend.volatility * 0.5);

  // Final prediction
  const totalChange = (weeklyGrowth * weeksAhead) + seasonalMomentum + deterministicNoise;
  const predicted = Math.round(currentPrice * (1 + totalChange));

  // Confidence bounds
  const lowerBound = Math.round(currentPrice * (1 + totalChange - trend.volatility));
  const upperBound = Math.round(currentPrice * (1 + totalChange + trend.volatility));

  return { predicted, lowerBound, upperBound, changePercent: (totalChange * 100).toFixed(2) };
}

// POST /api/predictions
router.post('/', verifyToken, async (req, res) => {
  try {
    const { commodity, district, market, quantity, quantile = 0.5 } = req.body;
    if (!commodity || !district || !market)
      return res.status(400).json({ error: 'commodity, district and market are required' });

    // Get best available live price
    const liveData = await getLivePrice(commodity, district);
    const currentPrice = liveData.price;

    // Predict using ML-style seasonal model
    const predResult = predictPrice(currentPrice, commodity, 7);
    const predictedPrice = predResult.predicted;

    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase.from('price_predictions').insert([{
      user_id: req.user.id === 'default-admin' ? null : req.user.id,
      username: req.user.username,
      commodity, district, market,
      current_price: currentPrice,
      predicted_price: predictedPrice,
      prediction_date: today,
      days_ahead: 7,
      quantile,
      metadata: {
        source: liveData.source,
        lowerBound: predResult.lowerBound,
        upperBound: predResult.upperBound,
        changePercent: predResult.changePercent,
        quantity
      }
    }]).select().single();

    if (error) throw error;

    // Log activity
    await supabase.from('activities').insert([{
      user_id: req.user.id === 'default-admin' ? null : req.user.id,
      username: req.user.username,
      activity_type: 'prediction',
      description: `Predicted ${commodity} at ${market}, ${district} — ₹${currentPrice}→₹${predictedPrice}`,
      metadata: { commodity, district, market, currentPrice, predictedPrice, source: liveData.source }
    }]);

    res.status(201).json({
      prediction: data,
      currentPrice,
      predictedPrice,
      lowerBound: predResult.lowerBound,
      upperBound: predResult.upperBound,
      changePercent: predResult.changePercent,
      priceSource: liveData.source,
      message: liveData.source === 'agmarknet' ? '✅ Live Agmarknet price used' :
                liveData.source === 'data.gov.in' ? '✅ data.gov.in price used' :
                liveData.source === 'cache' ? '📦 Cached today\'s price used' :
                '📊 MSP seasonal estimate used'
    });
  } catch (err) {
    console.error('Prediction error:', err);
    res.status(500).json({ error: 'Failed to save prediction' });
  }
});

// GET /api/predictions/my
router.get('/my', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('price_predictions').select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false }).limit(20);
    if (error) throw error;
    res.json({ predictions: data });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch predictions' }); }
});

// GET /api/predictions/stats (admin)
router.get('/stats', verifyAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase.from('price_predictions').select('id, commodity');
    if (error) throw error;
    const byComm = {};
    data.forEach(p => { byComm[p.commodity] = (byComm[p.commodity] || 0) + 1; });
    res.json({ total: data.length, by_commodity: byComm });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch prediction stats' }); }
});

module.exports = router;
