const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const supabase = require('../lib/supabase');
const { generateToken, verifyToken } = require('../middleware/auth');

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'AGRI2026';
const DEFAULT_ADMIN_EMAIL = process.env.DEFAULT_ADMIN_EMAIL || 'admin@gmail.com';
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, email, phone, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }
    const phoneDigits = (phone || '').replace(/\D/g, '');
    if (phone && phoneDigits.length !== 10) {
      return res.status(400).json({ error: 'Mobile number must be exactly 10 digits' });
    }
    // Check existing user
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle();
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const password_hash = await bcrypt.hash(password, 12);
    const { data: user, error } = await supabase
      .from('users')
      .insert([{ username, email: email.toLowerCase(), phone: phoneDigits || null, password_hash, role: 'user', status: 'active' }])
      .select('id, username, email, phone, role, status, created_at')
      .single();

    if (error) throw error;

    // Log activity
    await supabase.from('activities').insert([{
      user_id: user.id, username: user.username, activity_type: 'register',
      description: `User ${email} registered`
    }]);

    const token = generateToken({ id: user.id, email: user.email, role: user.role, username: user.username });
    res.status(201).json({ message: 'Registration successful', user, token });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (error) throw error;
    if (!user) return res.status(401).json({ error: 'User not found. Please register.' });
    if (user.status === 'inactive') return res.status(403).json({ error: 'Account is blocked. Contact admin.' });

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) return res.status(401).json({ error: 'Invalid password' });

    await supabase.from('activities').insert([{
      user_id: user.id, username: user.username, activity_type: 'login',
      description: `User ${email} logged in`
    }]);

    const token = generateToken({ id: user.id, email: user.email, role: user.role, username: user.username });
    const { password_hash, ...safeUser } = user;
    res.json({ message: 'Login successful', user: safeUser, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/admin-login
router.post('/admin-login', async (req, res) => {
  try {
    const { email, password, secret } = req.body;
    if (!email || !password || !secret) {
      return res.status(400).json({ error: 'Email, password and secret key required' });
    }
    if (!email.toLowerCase().endsWith('@gmail.com')) {
      return res.status(400).json({ error: 'Please use a valid @gmail.com email address' });
    }
    if (secret !== ADMIN_SECRET) {
      return res.status(401).json({ error: 'Invalid secret key' });
    }

    // Default admin check
    if (email === DEFAULT_ADMIN_EMAIL && password === DEFAULT_ADMIN_PASSWORD) {
      const adminUser = { id: 'default-admin', username: 'Admin', email: DEFAULT_ADMIN_EMAIL, phone: '9999999999', role: 'admin', status: 'active' };
      const token = generateToken({ id: adminUser.id, email: adminUser.email, role: 'admin', username: 'Admin' });
      await supabase.from('activities').insert([{ username: 'Admin', activity_type: 'admin_login', description: `Admin ${email} logged in` }]);
      return res.json({ message: 'Admin login successful', user: adminUser, token });
    }

    // DB admin check
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .eq('role', 'admin')
      .maybeSingle();

    if (error) throw error;
    if (!user) return res.status(401).json({ error: 'Invalid admin credentials' });

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) return res.status(401).json({ error: 'Invalid password' });

    await supabase.from('activities').insert([{
      user_id: user.id, username: user.username, activity_type: 'admin_login',
      description: `Admin ${email} logged in`
    }]);

    const token = generateToken({ id: user.id, email: user.email, role: user.role, username: user.username });
    const { password_hash, ...safeUser } = user;
    res.json({ message: 'Admin login successful', user: safeUser, token });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ error: 'Admin login failed' });
  }
});

// POST /api/auth/logout
router.post('/logout', verifyToken, async (req, res) => {
  await supabase.from('activities').insert([{
    user_id: req.user.id, username: req.user.username, activity_type: 'logout',
    description: `User ${req.user.email} logged out`
  }]);
  res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me
router.get('/me', verifyToken, async (req, res) => {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, username, email, phone, role, status, created_at')
    .eq('id', req.user.id)
    .single();
  if (error || !user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

module.exports = router;
