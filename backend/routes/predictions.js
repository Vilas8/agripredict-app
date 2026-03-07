const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { verifyToken, verifyAdmin } = require('../middleware/auth');

const basePrices = { Maize: 2150, Paddy: 1940, Wheat: 2275, Sugarcane: 310 };

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

const trends = {
  Maize:     { min: 3, max: 8 },
  Paddy:     { min: -1, max: 3 },
  Wheat:     { min: 2, max: 5 },
  Sugarcane: { min: -2, max: 2 }
};

function calculatePrediction(currentPrice, commodity, daysAhead = 7, quantile = 0.5) {
  const trend = trends[commodity] || { min: -2, max: 3 };
  const today = new Date().toISOString().split('T')[0];
  const todayHash = hashCode(today);
  const range = trend.max - trend.min * 2 + 1;
  const trendFactor = trend.min + ((todayHash + hashCode(commodity)) % (range > 0 ? range : 1));
  const dailyChange = trendFactor / 100;
  const predictedChange = dailyChange * (daysAhead / 7);
  const randomFactor = ((todayHash % 400) - 200) / 10000;
  const quantileAdjustment = (quantile - 0.5) * 0.15;
  const predictedPrice = Math.round(currentPrice * (1 + predictedChange + randomFactor + quantileAdjustment));
  return Math.max(Math.round(currentPrice * 0.85), Math.min(Math.round(currentPrice * 1.25), predictedPrice));
}

// POST /api/predictions  - Save a new prediction
router.post('/', verifyToken, async (req, res) => {
  try {
    const { commodity, district, market, quantity, quantile = 0.5 } = req.body;
    if (!commodity || !district || !market) {
      return res.status(400).json({ error: 'commodity, district and market are required' });
    }

    // Get today's price from commodity_prices
    const today = new Date().toISOString().split('T')[0];
    const { data: priceRow } = await supabase
      .from('commodity_prices')
      .select('price_per_quintal')
      .eq('commodity', commodity)
      .eq('district', district)
      .eq('market', market)
      .eq('price_date', today)
      .maybeSingle();

    const currentPrice = priceRow ? parseFloat(priceRow.price_per_quintal) : basePrices[commodity] || 2000;
    const predictedPrice = calculatePrediction(currentPrice, commodity, 7, quantile);

    const { data, error } = await supabase.from('price_predictions').insert([{
      user_id: req.user.id === 'default-admin' ? null : req.user.id,
      username: req.user.username,
      commodity, district, market,
      current_price: currentPrice,
      predicted_price: predictedPrice,
      prediction_date: today,
      days_ahead: 7,
      quantile
    }]).select().single();

    if (error) throw error;

    // Log activity
    await supabase.from('activities').insert([{
      user_id: req.user.id === 'default-admin' ? null : req.user.id,
      username: req.user.username,
      activity_type: 'prediction',
      description: `Predicted ${commodity} prices for ${market}, ${district}`,
      metadata: { commodity, district, market, currentPrice, predictedPrice }
    }]);

    res.status(201).json({ prediction: data, currentPrice, predictedPrice });
  } catch (err) {
    console.error('Prediction error:', err);
    res.status(500).json({ error: 'Failed to save prediction' });
  }
});

// GET /api/predictions/my  - User's prediction history
router.get('/my', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('price_predictions')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    res.json({ predictions: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch predictions' });
  }
});

// GET /api/predictions/stats  - All prediction stats (admin)
router.get('/stats', verifyAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase.from('price_predictions').select('id, commodity');
    if (error) throw error;
    const byComm = {};
    data.forEach(p => { byComm[p.commodity] = (byComm[p.commodity] || 0) + 1; });
    res.json({ total: data.length, by_commodity: byComm });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch prediction stats' });
  }
});

module.exports = router;
