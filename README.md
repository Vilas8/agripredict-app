# 🌾 AgriPredict — AI-Powered Commodity Price Prediction

Full-stack web application for farmers to get real-time commodity price predictions.

## 📁 Project Structure

```
agripredict-app/
├── frontend/          # Static frontend (HTML, CSS, JS)
│   ├── index.html     # Main app (unchanged)
│   ├── styles.css     # Styles (unchanged)
│   ├── script.js      # Frontend logic (unchanged)
│   └── api.js         # NEW: API client connecting frontend to backend
├── backend/           # Node.js + Express + Supabase
│   ├── server.js      # Express app entry point
│   ├── routes/        # All API routes
│   ├── middleware/     # JWT auth middleware
│   ├── lib/           # Supabase client
│   ├── supabase/      # SQL schema
│   └── .env.example   # Environment variables template
└── README.md
```

## 🚀 Quick Start

### 1. Setup Backend
```bash
cd backend
npm install
cp .env.example .env   # Fill in your Supabase keys
npm run dev
```

### 2. Setup Supabase
1. Create project at [supabase.com](https://supabase.com)
2. Run `backend/supabase/schema.sql` in SQL Editor
3. Add your keys to `backend/.env`

### 3. Connect Frontend
Add this line to your `index.html` **before** `script.js`:
```html
<script>window.AGRI_API_BASE = 'http://localhost:3000/api';</script>
<script src="api.js"></script>
```
Then in `script.js`, replace `window.dataSdk` calls with `window.AgriAPI` methods.

### 4. Deploy
- **Backend**: Deploy `backend/` folder to [Render](https://render.com)
- **Frontend**: Deploy `frontend/` folder to [Vercel](https://vercel.com) or Netlify

## 🔐 Default Credentials
- **Admin Email**: `admin@gmail.com`
- **Admin Password**: `admin123`
- **Admin Secret**: `AGRI2026`

## 🗄️ Tech Stack
- **Frontend**: Vanilla JS, Tailwind CSS, Chart.js
- **Backend**: Node.js, Express.js
- **Database**: Supabase (PostgreSQL)
- **Auth**: JWT tokens + bcrypt
- **Deployment**: Render (backend) + Vercel (frontend)
