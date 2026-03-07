require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const pricesRoutes = require('./routes/prices');
const activitiesRoutes = require('./routes/activities');
const usersRoutes = require('./routes/users');
const configRoutes = require('./routes/config');
const predictionsRoutes = require('./routes/predictions');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(morgan('dev'));

// CORS - allow all origins for API accessibility
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'https://agripredict-app.vercel.app',
  'https://agripredict-app-vilas8.vercel.app'
];
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(o => origin.startsWith(o))) {
      callback(null, true);
    } else {
      // In production allow all vercel preview URLs
      if (origin.includes('vercel.app') || origin.includes('localhost')) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, message: { error: 'Too many requests' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many auth attempts' } });
app.use('/api/', limiter);
app.use('/api/auth/', authLimiter);

// ✅ Root route - shows backend is running
app.get('/', (req, res) => {
  res.json({
    name: 'AgriPredict API',
    status: '🟢 Running',
    version: '1.0.0',
    description: 'AI-powered Commodity Price Prediction Backend',
    timestamp: new Date().toISOString(),
    endpoints: {
      health:      'GET  /health',
      auth:        'POST /api/auth/login | /api/auth/register | /api/auth/admin-login',
      prices:      'GET  /api/prices/today | /api/prices/dashboard | /api/prices/search',
      predictions: 'POST /api/predictions | GET /api/predictions/my',
      activities:  'GET  /api/activities | POST /api/activities',
      users:       'GET  /api/users | PATCH /api/users/:id',
      config:      'GET  /api/config | PATCH /api/config'
    },
    frontend: process.env.FRONTEND_URL || 'https://agripredict-app.vercel.app'
  });
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() }));

// API info route
app.get('/api', (req, res) => {
  res.json({ message: 'AgriPredict API v1.0 - Use /api/auth, /api/prices, /api/predictions, /api/activities, /api/users, /api/config' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/prices', pricesRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/config', configRoutes);
app.use('/api/predictions', predictionsRoutes);

// 404
app.use((req, res) => res.status(404).json({ error: 'Route not found', hint: 'Visit / for API documentation' }));

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => console.log(`🌾 AgriPredict backend running on port ${PORT}`));

module.exports = app;
