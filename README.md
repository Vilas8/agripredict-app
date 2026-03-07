# 🌾 AgriPredict — AI-Powered Commodity Price Prediction

> Smart Farming, Better Tomorrow — Real-time commodity price predictions powered by Agmarknet live data + seasonal ML models.

[![Live](https://img.shields.io/badge/🌐%20Live%20App-agripredict--app.vercel.app-brightgreen?style=for-the-badge)](https://agripredict-app.vercel.app)
[![API](https://img.shields.io/badge/⚙️%20API%20Server-agripredict--app.onrender.com-blue?style=for-the-badge)](https://agripredict-app.onrender.com)
[![GitHub](https://img.shields.io/badge/📦%20Repo-Vilas8%2Fagripredict--app-black?style=for-the-badge&logo=github)](https://github.com/Vilas8/agripredict-app)

---

## 🔗 Live URLs

| Service | URL |
|---------|-----|
| 🌐 **Frontend (Vercel)** | [https://agripredict-app.vercel.app](https://agripredict-app.vercel.app) |
| ⚙️ **Backend API (Render)** | [https://agripredict-app.onrender.com](https://agripredict-app.onrender.com) |
| 💊 **API Health Check** | [https://agripredict-app.onrender.com/health](https://agripredict-app.onrender.com/health) |
| 📊 **API Info** | [https://agripredict-app.onrender.com/api](https://agripredict-app.onrender.com/api) |

---

## 📁 Project Structure

```
agripredict-app/
├── frontend/
│   ├── index.html       # Main app UI (unchanged from original)
│   ├── styles.css       # Styles (unchanged)
│   ├── script.js        # Frontend logic
│   ├── api.js           # API client — connects frontend to backend
│   └── vercel.json      # SPA routing config for Vercel
├── backend/
│   ├── server.js        # Express app entry point
│   ├── package.json     # Dependencies
│   ├── .env.example     # Environment variables template
│   ├── lib/
│   │   └── supabase.js  # Supabase service-role client
│   ├── middleware/
│   │   └── auth.js      # JWT verify / admin guard
│   ├── routes/
│   │   ├── auth.js         # register, login, admin-login, /me
│   │   ├── prices.js       # Agmarknet live + dashboard + search
│   │   ├── predictions.js  # Agmarknet-powered ML predictions
│   │   ├── activities.js   # Activity log (search, predict, login)
│   │   ├── users.js        # User management
│   │   └── config.js       # App config (title, tagline)
│   └── supabase/
│       └── schema.sql   # Full DB schema — run this in Supabase
├── SETUP.md             # Step-by-step deployment guide
└── README.md
```

---

## 🗄️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Vanilla JS, Tailwind CSS, Chart.js |
| **Backend** | Node.js, Express.js |
| **Database** | Supabase (PostgreSQL) |
| **Auth** | JWT tokens + bcrypt |
| **Price Data** | Agmarknet via data.gov.in API |
| **Frontend Deploy** | Vercel |
| **Backend Deploy** | Render |

---

## 🔑 Default Login Credentials

| Role | Email | Password | Secret Key |
|------|-------|----------|------------|
| 👑 Admin | `admin@gmail.com` | `admin123` | `AGRI2026` |
| 👨‍🌾 User | Register via UI | Your choice | — |

---

## 📡 API Endpoints

```
GET  /                          → API info
GET  /health                    → Health check

POST /api/auth/register         → Register new user
POST /api/auth/login            → User login
POST /api/auth/admin-login      → Admin login
GET  /api/auth/me               → Get current user

GET  /api/prices/dashboard      → All 4 commodity prices (live)
GET  /api/prices/search         → Search specific market price
GET  /api/prices/today          → All today's prices from DB
GET  /api/prices/history        → Historical price records

POST /api/predictions           → Generate & save ML prediction
GET  /api/predictions/my        → User's prediction history
GET  /api/predictions/stats     → Prediction stats (admin)

GET  /api/activities            → Activity log (admin)
POST /api/activities            → Log an activity
GET  /api/activities/stats      → Activity statistics

GET  /api/users                 → All users (admin)
GET  /api/users/stats           → User statistics (admin)
PATCH /api/users/:id            → Update user (admin)

GET  /api/config                → App config
PATCH /api/config               → Update config (admin)
```

---

## 🧠 Prediction Model

Predictions use a **4-layer price pipeline**:

1. **Supabase DB cache** — today's already-fetched live price (instant)
2. **Agmarknet (data.gov.in)** — Karnataka live modal price from APMC markets
3. **data.gov.in fallback** — secondary government data API
4. **MSP Seasonal model** — Annual MSP growth rate + harvest/lean season adjustment

The prediction algorithm applies:
- 📈 Weekly growth rate derived from annual commodity trend
- 🌾 Seasonal momentum (harvest dip vs lean season peak per commodity)
- 📊 Deterministic volatility bounds (commodity-specific)
- Returns: `predictedPrice`, `lowerBound`, `upperBound`, `changePercent`

---

## 🚀 Local Development

```bash
# Clone
git clone https://github.com/Vilas8/agripredict-app.git
cd agripredict-app

# Backend
cd backend
npm install
cp .env.example .env     # Fill in your keys
npm run dev              # Starts on http://localhost:3000

# Frontend — open in browser or use Live Server
cd ../frontend
# Open index.html with Live Server (VS Code extension)
```

---

## ☁️ Deployment

See **[SETUP.md](./SETUP.md)** for the complete step-by-step deployment guide for Supabase + Render + Vercel.

---

## 🌾 Built for Karnataka Farmers

> *"The farmer is the only man in our economy who buys everything at retail, sells everything at wholesale, and pays the freight both ways."* — John F. Kennedy
