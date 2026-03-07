-- ============================================================
-- AgriPredict Supabase Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ACTIVITIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  username TEXT,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('login', 'admin_login', 'market_search', 'prediction', 'logout', 'register')),
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- COMMODITY PRICES TABLE (Daily real prices per market)
-- ============================================================
CREATE TABLE IF NOT EXISTS commodity_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  commodity TEXT NOT NULL CHECK (commodity IN ('Maize', 'Paddy', 'Wheat', 'Sugarcane')),
  district TEXT NOT NULL,
  market TEXT NOT NULL,
  price_per_quintal NUMERIC(10, 2) NOT NULL,
  base_price NUMERIC(10, 2) NOT NULL,
  variation_percent NUMERIC(5, 2),
  price_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(commodity, district, market, price_date)
);

-- ============================================================
-- PRICE PREDICTIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS price_predictions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  username TEXT,
  commodity TEXT NOT NULL,
  district TEXT NOT NULL,
  market TEXT NOT NULL,
  current_price NUMERIC(10, 2) NOT NULL,
  predicted_price NUMERIC(10, 2) NOT NULL,
  prediction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  days_ahead INTEGER DEFAULT 7,
  quantile NUMERIC(3, 2) DEFAULT 0.5,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- APP CONFIG TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS app_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default config
INSERT INTO app_config (key, value) VALUES
  ('app_title', 'AgriPredict'),
  ('tagline', 'Smart Farming, Better Tomorrow'),
  ('background_color', '#064e3b'),
  ('primary_color', '#10b981'),
  ('text_color', '#ffffff'),
  ('secondary_color', '#047857'),
  ('accent_color', '#6ee7b7')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE commodity_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- Allow backend (service role) full access (RLS bypassed for service role)
-- Allow anonymous read for commodity_prices and app_config
CREATE POLICY "Public read commodity prices" ON commodity_prices FOR SELECT USING (true);
CREATE POLICY "Public read app config" ON app_config FOR SELECT USING (true);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER app_config_updated_at BEFORE UPDATE ON app_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_activities_user_id ON activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_commodity_prices_date ON commodity_prices(price_date);
CREATE INDEX IF NOT EXISTS idx_commodity_prices_commodity ON commodity_prices(commodity);
CREATE INDEX IF NOT EXISTS idx_predictions_user_id ON price_predictions(user_id);
