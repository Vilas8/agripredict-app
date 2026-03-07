const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { verifyAdmin } = require('../middleware/auth');

// GET /api/config  - Get app configuration
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase.from('app_config').select('key, value');
    if (error) throw error;
    const config = {};
    data.forEach(row => { config[row.key] = row.value; });
    res.json({ config });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch config' });
  }
});

// PATCH /api/config  - Update app config (admin only)
router.patch('/', verifyAdmin, async (req, res) => {
  try {
    const updates = req.body;
    const rows = Object.entries(updates).map(([key, value]) => ({ key, value: String(value) }));
    const { error } = await supabase.from('app_config').upsert(rows, { onConflict: 'key' });
    if (error) throw error;
    res.json({ message: 'Config updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update config' });
  }
});

module.exports = router;
