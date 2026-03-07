const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { verifyToken, verifyAdmin } = require('../middleware/auth');

// POST /api/activities  - Log an activity
router.post('/', verifyToken, async (req, res) => {
  try {
    const { activity_type, description, metadata } = req.body;
    if (!activity_type) return res.status(400).json({ error: 'activity_type is required' });

    const { data, error } = await supabase.from('activities').insert([{
      user_id: req.user.id === 'default-admin' ? null : req.user.id,
      username: req.user.username,
      activity_type,
      description,
      metadata: metadata || {}
    }]).select().single();

    if (error) throw error;
    res.status(201).json({ activity: data });
  } catch (err) {
    console.error('Log activity error:', err);
    res.status(500).json({ error: 'Failed to log activity' });
  }
});

// GET /api/activities  - Get all activities (admin only)
router.get('/', verifyAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json({ activities: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// GET /api/activities/my  - Get current user's activities
router.get('/my', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    res.json({ activities: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// GET /api/activities/stats  - Activity stats for dashboard
router.get('/stats', verifyAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase.from('activities').select('activity_type');
    if (error) throw error;
    const stats = { total: data.length, login: 0, admin_login: 0, market_search: 0, prediction: 0, register: 0, logout: 0 };
    data.forEach(a => { if (stats[a.activity_type] !== undefined) stats[a.activity_type]++; });
    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

module.exports = router;
