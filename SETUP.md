# 🔧 AgriPredict Full Setup Guide

## Step 1: Upload index.html

The `index.html` file needs one small addition to connect to the backend.
Add these 2 lines **just before your closing `</body>` tag**:

```html
<script>window.AGRI_API_BASE = 'https://YOUR-RENDER-BACKEND-URL/api';</script>
<script src="api.js"></script>
```

Replace `YOUR-RENDER-BACKEND-URL` with your actual Render deployment URL.

---

## Step 2: Setup Supabase

1. Go to [supabase.com](https://supabase.com) → New Project
2. Name: `agripredict` | Choose region closest to India (Singapore)
3. Go to **SQL Editor** → **New Query**
4. Paste contents of `backend/supabase/schema.sql` and click **Run**
5. Go to **Settings → API** and copy:
   - `Project URL` → `SUPABASE_URL`
   - `anon public key` → `SUPABASE_ANON_KEY`
   - `service_role secret key` → `SUPABASE_SERVICE_ROLE_KEY`

---

## Step 3: Deploy Backend on Render

1. Go to [render.com](https://render.com) → **New Web Service**
2. Connect this GitHub repo: `Vilas8/agripredict-app`
3. Settings:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Node
4. Add Environment Variables:
   ```
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   JWT_SECRET=agripredict-jwt-secret-2026-strong
   ADMIN_SECRET=AGRI2026
   DEFAULT_ADMIN_EMAIL=admin@gmail.com
   DEFAULT_ADMIN_PASSWORD=admin123
   FRONTEND_URL=https://your-vercel-url.vercel.app
   PORT=3000
   ```
5. Click **Deploy** — takes ~2 minutes
6. Copy the Render URL (e.g., `https://agripredict-backend.onrender.com`)

---

## Step 4: Deploy Frontend on Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Import this GitHub repo: `Vilas8/agripredict-app`
3. Settings:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Other
4. Add Environment Variable:
   ```
   AGRI_API_BASE=https://agripredict-backend.onrender.com/api
   ```
5. Deploy!

---

## Step 5: Update CORS on Backend

In Render environment variables, update:
```
FRONTEND_URL=https://your-vercel-app.vercel.app
```

---

## ✅ Default Login Credentials

| Role | Email | Password | Secret Key |
|------|-------|----------|------------|
| Admin | admin@gmail.com | admin123 | AGRI2026 |
| User | Register via UI | Your choice | - |

---

## 📊 Database Tables Created

| Table | Purpose |
|-------|---------|
| `users` | All registered users |
| `activities` | Login, search, prediction logs |
| `commodity_prices` | Daily prices per market |
| `price_predictions` | Saved user predictions |
| `app_config` | App title, colors, tagline |
