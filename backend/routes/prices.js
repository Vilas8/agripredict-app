const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { verifyToken } = require('../middleware/auth');

const basePrices = { Maize: 2150, Paddy: 1940, Wheat: 2275, Sugarcane: 310 };
const marketsByDistrict = {
  Kolar: ['Kolar Main Market', 'Kolar APMC'],
  Malur: ['Malur Main', 'Malur APMC'],
  Chintamani: ['Chintamani Main', 'Chintamani APMC'],
  Hoskote: ['Hoskote Main', 'Hoskote APMC']
};

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function generateDailyPrice(commodity, district, market, dateStr) {
  const basePrice = basePrices[commodity] || 2000;
  const combinedHash = (hashCode(dateStr) + hashCode(commodity) + hashCode(district) + hashCode(market)) % 1600 - 800;
  const variationPercent = combinedHash / 10000;
  let dailyPrice = Math.round(basePrice * (1 + variationPercent));
  dailyPrice = Math.max(Math.round(basePrice * 0.85), Math.min(Math.round(basePrice * 1.15), dailyPrice));
  return { price: dailyPrice, variation: parseFloat((variationPercent * 100).toFixed(2)), basePrice };
}

// GET /api/prices/today  - Get all today's prices
router.get('/today', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    // Try fetching from DB first
    const { data: existing } = await supabase
      .from('commodity_prices')
      .select('*')
      .eq('price_date', today);

    if (existing && existing.length > 0) {
      return res.json({ prices: existing, date: today });
    }

    // Generate and save today's prices
    const rows = [];
    for (const commodity of Object.keys(basePrices)) {
      for (const district of Object.keys(marketsByDistrict)) {
        for (const market of marketsByDistrict[district]) {
          const { price, variation, basePrice } = generateDailyPrice(commodity, district, market, today);
          rows.push({ commodity, district, market, price_per_quintal: price, base_price: basePrice, variation_percent: variation, price_date: today });
        }
      }
    }

    const { data: inserted, error } = await supabase
      .from('commodity_prices')
      .upsert(rows, { onConflict: 'commodity,district,market,price_date' })
      .select();

    if (error) throw error;
    res.json({ prices: inserted, date: today });
  } catch (err) {
    console.error('Prices error:', err);
    res.status(500).json({ error: 'Failed to fetch prices' });
  }
});

// GET /api/prices/dashboard  - Aggregated prices for dashboard (one per commodity)
router.get('/dashboard', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('commodity_prices')
      .select('commodity, price_per_quintal')
      .eq('price_date', today);

    if (error) throw error;

    // If no data, generate fresh
    let pricesData = data;
    if (!data || data.length === 0) {
      const freshRes = await fetch(`http://localhost:${process.env.PORT || 3000}/api/prices/today`);
      const freshJson = await freshRes.json();
      pricesData = freshJson.prices;
    }

    // Average per commodity
    const totals = {};
    const counts = {};
    (pricesData || []).forEach(r => {
      if (!totals[r.commodity]) { totals[r.commodity] = 0; counts[r.commodity] = 0; }
      totals[r.commodity] += parseFloat(r.price_per_quintal);
      counts[r.commodity]++;
    });

    const dashboard = {};
    for (const c of Object.keys(totals)) {
      dashboard[c] = Math.round(totals[c] / counts[c]);
    }
    res.json({ prices: dashboard, date: today });
  } catch (err) {
    console.error('Dashboard prices error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard prices' });
  }
});

// GET /api/prices/search?commodity=Maize&district=Kolar&market=Kolar Main Market
router.get('/search', verifyToken, async (req, res) => {
  try {
    const { commodity, district, market } = req.query;
    if (!commodity || !district || !market) {
      return res.status(400).json({ error: 'commodity, district and market are required' });
    }
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('commodity_prices')
      .select('*')
      .eq('commodity', commodity)
      .eq('district', district)
      .eq('market', market)
      .eq('price_date', today)
      .maybeSingle();

    if (error) throw error;
    let price = data;
    if (!price) {
      const { p, variation, basePrice } = generateDailyPrice(commodity, district, market, today);
      const row = { commodity, district, market, price_per_quintal: p || generateDailyPrice(commodity, district, market, today).price, base_price: basePrices[commodity] || 2000, variation_percent: variation || 0, price_date: today };
      const { data: ins } = await supabase.from('commodity_prices').upsert([row], { onConflict: 'commodity,district,market,price_date' }).select().single();
      price = ins;
    }
    res.json({ price });
  } catch (err) {
    console.error('Search price error:', err);
    res.status(500).json({ error: 'Failed to fetch price' });
  }
});

// GET /api/prices/history?commodity=Maize  - Historical prices for charts
router.get('/history', async (req, res) => {
  try {
    const { commodity } = req.query;
    const yearlyPrices = {
      Maize:     [2050, 2080, 2120, 2180, 2150, 2200, 2250, 2300],
      Paddy:     [1850, 1900, 1920, 1960, 1940, 1980, 2020, 2060],
      Wheat:     [2180, 2220, 2250, 2300, 2275, 2320, 2370, 2420],
      Sugarcane: [290,  300,  305,  315,  310,  320,  330,  340]
    };
    const years = [2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028];
    const data = commodity
      ? { [commodity]: yearlyPrices[commodity] || [], years }
      : { ...yearlyPrices, years };
    res.json({ history: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

module.exports = router;
