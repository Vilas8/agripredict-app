# AgriPredict Backend

Node.js + Express REST API with Supabase (PostgreSQL) database.

## 🛠️ Setup

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Create Supabase Project
1. Go to [supabase.com](https://supabase.com) and create a new project
2. Go to **SQL Editor** and run the contents of `supabase/schema.sql`
3. Get your keys from **Settings > API**

### 3. Configure Environment
```bash
cp .env.example .env
```
Fill in your `.env`:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=your-random-secret-key
ADMIN_SECRET=AGRI2026
DEFAULT_ADMIN_EMAIL=admin@gmail.com
DEFAULT_ADMIN_PASSWORD=admin123
FRONTEND_URL=http://localhost:5500
```

### 4. Run the Server
```bash
# Development
npm run dev

# Production
npm start
```

Server runs on **http://localhost:3000**

---

## 📡 API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/admin-login` | Admin login |
| POST | `/api/auth/logout` | Logout |
| GET  | `/api/auth/me` | Get current user |

### Prices
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/prices/today` | All today's prices (all markets) |
| GET | `/api/prices/dashboard` | Averaged prices per commodity |
| GET | `/api/prices/search?commodity=&district=&market=` | Search specific price |
| GET | `/api/prices/history?commodity=` | Historical price data for charts |

### Activities
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/activities` | Log an activity |
| GET  | `/api/activities` | All activities (admin) |
| GET  | `/api/activities/my` | Own activities |
| GET  | `/api/activities/stats` | Activity stats (admin) |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/api/users` | All users (admin) |
| GET  | `/api/users/stats` | User stats (admin) |
| PATCH | `/api/users/:id` | Update user (admin) |
| PATCH | `/api/users/profile/me` | Update own profile |
| PATCH | `/api/users/password/me` | Change own password |

### Predictions
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/predictions` | Save prediction |
| GET  | `/api/predictions/my` | Own predictions |
| GET  | `/api/predictions/stats` | Prediction stats (admin) |

### Config
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/api/config` | Get app config |
| PATCH | `/api/config` | Update config (admin) |

---

## 🚀 Deploy to Render

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) > New Web Service
3. Connect your GitHub repo
4. Set **Root Directory** = `backend`
5. Set **Build Command** = `npm install`
6. Set **Start Command** = `npm start`
7. Add all environment variables from `.env`
8. Deploy!

Update `FRONTEND_URL` in env vars to your Vercel/Netlify frontend URL after deploying frontend.

---

## 🗄️ Database Schema

- **users** — registered users
- **activities** — all user actions logged
- **commodity_prices** — daily prices per commodity/district/market
- **price_predictions** — saved predictions per user
- **app_config** — app settings (title, colors, tagline)
