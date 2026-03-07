const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

// GET /api/users  - List all users (admin only)
router.get('/', verifyAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, email, phone, role, status, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ users: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET /api/users/stats  - User statistics (admin only)
router.get('/stats', verifyAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, role, status, created_at');
    if (error) throw error;
    const today = new Date().toISOString().split('T')[0];
    const stats = {
      total: data.length,
      active: data.filter(u => u.status === 'active').length,
      admins: data.filter(u => u.role === 'admin').length,
      today: data.filter(u => u.created_at && u.created_at.startsWith(today)).length
    };
    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user stats' });
  }
});

// PATCH /api/users/:id  - Update user (admin only)
router.patch('/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, status } = req.body;
    const updates = {};
    if (username) updates.username = username;
    if (status) updates.status = status;
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', id)
      .select('id, username, email, phone, role, status, created_at')
      .single();
    if (error) throw error;
    res.json({ user: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// PATCH /api/users/profile  - Update own profile
router.patch('/profile/me', verifyToken, async (req, res) => {
  try {
    const { username, phone } = req.body;
    const updates = {};
    if (username) updates.username = username;
    if (phone) {
      const phoneDigits = phone.replace(/\D/g, '');
      if (phoneDigits.length !== 10) return res.status(400).json({ error: 'Phone must be 10 digits' });
      updates.phone = phoneDigits;
    }
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', req.user.id)
      .select('id, username, email, phone, role, status')
      .single();
    if (error) throw error;
    res.json({ user: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// PATCH /api/users/password/me  - Change own password
router.patch('/password/me', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password required' });

    const { data: user, error } = await supabase.from('users').select('password_hash').eq('id', req.user.id).single();
    if (error || !user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const password_hash = await bcrypt.hash(newPassword, 12);
    const { error: updateError } = await supabase.from('users').update({ password_hash }).eq('id', req.user.id);
    if (updateError) throw updateError;
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update password' });
  }
});

module.exports = router;
