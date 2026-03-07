const express = require('express');
const router = express.Router();
const https = require('https');
const supabase = require('../lib/supabase');
const { verifyToken } = require('../middleware/auth');

const AGMARKNET_COMMODITY_MAP = {
  'Maize': 'Maize', 'Paddy': 'Paddy(Dhan)(Common)', 'Wheat': 'Wheat', 'Sugarcane': 'Sugarcane'
};
const BASE_PRICES = { Maize: 2225, Paddy: 2300, Wheat: 2425, Sugarcane: 340 };
const SEASONAL_TRENDS = {
  Maize:     { annual_growth: 0.055, harvest_dip_months: [10,11], peak_months: [4,5,6] },
  Paddy:     { annual_growth: 0.048, harvest_dip_months: [11,12,1], peak_months: [6,7,8] },
  Wheat:     { annual_growth: 0.052, harvest_dip_months: [3,4,5], peak_months: [10,11,12] },
  Sugarcane: { annual_growth: 0.035, harvest_dip_months: [1,2,3], peak_months: [8,9,10] }
};

function getSeasonalPrice(commodity) {
  const base = BASE_PRICES[commodity] || 2000;
  const trend = SEASONAL_TRENDS[commodity] || { annual_growth: 0.05 };
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const yearFactor = 1 + trend.annual_growth * (year - 2021);
  let seasonalFactor = 1.0;
  if (trend.harvest_dip_months?.includes(month)) seasonalFactor = 0.94;
  if (trend.peak_months?.includes(month)) seasonalFactor = 1.06;
  return Math.round(base * yearFactor * seasonalFactor);
}

async function fetchAgmarknetLive(commodity, district = 'Kolar') {
  return new Promise((resolve) => {
    const name = AGMARKNET_COMMODITY_MAP[commodity] || commodity;
    const apiKey = process.env.AGMARKNET_API_KEY || process.env.DATA_GOV_API_KEY || 'demo_key';
    const url = `https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070?api-key=${apiKey}&format=json&limit=5&filters%5Bcommodity%5D=${encodeURIComponent(name)}&filters%5Bstate%5D=Karnataka&filters%5Bdistrict%5D=${encodeURIComponent(district)}`;
    const req = https.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const records = json.records || [];
          if (records.length > 0) {
            const price = parseFloat(records[0].modal_price || records[0].max_price || 0);
            if (price > 100) return resolve(price);
          }
          resolve(null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// GET /api/prices/dashboard — all 4 commodities
router.get('/dashboard', async (req, res) => {
  try {
    const commodities = ['Maize', 'Paddy', 'Wheat', 'Sugarcane'];
    const today = new Date().toISOString().split('T')[0];
    const prices = {};

    await Promise.all(commodities.map(async (c) => {
      // 1. Try DB cache
      const { data: cached } = await supabase
        .from('commodity_prices').select('price_per_quintal')
        .eq('commodity', c).eq('price_date', today).limit(1).maybeSingle();
      if (cached) { prices[c] = parseFloat(cached.price_per_quintal); return; }

      // 2. Try Agmarknet
      const live = await fetchAgmarknetLive(c);
      if (live) { prices[c] = live; return; }

      // 3. Seasonal fallback
      prices[c] = getSeasonalPrice(c);
    }));

    res.json({ prices, date: today });
  } catch (err) {
    console.error('Dashboard prices error:', err);
    // Fallback: return seasonal prices
    const prices = {};
    ['Maize','Paddy','Wheat','Sugarcane'].forEach(c => { prices[c] = getSeasonalPrice(c); });
    res.json({ prices, date: new Date().toISOString().split('T')[0] });
  }
});

// GET /api/prices/today
router.get('/today', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('commodity_prices').select('*').eq('price_date', today)
      .order('commodity', { ascending: true });
    if (error) throw error;
    res.json({ prices: data, date: today });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch prices' }); }
});

// GET /api/prices/search?commodity=&district=&market=
router.get('/search', verifyToken, async (req, res) => {
  try {
    const { commodity, district, market } = req.query;
    if (!commodity || !district || !market)
      return res.status(400).json({ error: 'commodity, district, market required' });

    const today = new Date().toISOString().split('T')[0];

    // Try DB first
    const { data: dbRow } = await supabase
      .from('commodity_prices').select('*')
      .eq('commodity', commodity).eq('district', district)
      .eq('market', market).eq('price_date', today).maybeSingle();

    if (dbRow) return res.json({ price: dbRow });

    // Try Agmarknet
    const livePrice = await fetchAgmarknetLive(commodity, district);
    const finalPrice = livePrice || getSeasonalPrice(commodity);

    const row = {
      commodity, district, market,
      price_per_quintal: finalPrice,
      price_date: today,
      source: livePrice ? 'agmarknet' : 'seasonal_estimate'
    };

    // Cache it
    await supabase.from('commodity_prices').upsert([row], { onConflict: 'commodity,district,market,price_date' });

    // Log activity if user is logged in
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      try {
        const { verifyToken: vt } = require('../middleware/auth');
        await supabase.from('activities').insert([{
          username: 'User',
          activity_type: 'market_search',
          description: `Searched ${commodity} in ${market}, ${district}`,
          metadata: { commodity, district, market, price: finalPrice }
        }]);
      } catch (_) {}
    }

    res.json({ price: row });
  } catch (err) {
    console.error('Price search error:', err);
    res.status(500).json({ error: 'Failed to fetch price' });
  }
});

// GET /api/prices/history?commodity=Maize
router.get('/history', async (req, res) => {
  try {
    const { commodity } = req.query;
    let query = supabase.from('commodity_prices').select('*').order('price_date', { ascending: false }).limit(30);
    if (commodity) query = query.eq('commodity', commodity);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ prices: data });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch history' }); }
});

module.exports = router;
