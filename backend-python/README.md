# AgriPredict — Python FastAPI Backend

This is the Python/FastAPI rewrite of the original Node.js/Express backend.
All features and API routes are 100% preserved.

## Tech Stack

| Component       | Technology                  |
|-----------------|-----------------------------|
| Framework       | FastAPI + Uvicorn           |
| Auth            | python-jose (JWT)           |
| Password Hash   | passlib[bcrypt]             |
| Database        | Supabase (Python SDK)       |
| HTTP Client     | httpx (async)               |
| Rate Limiting   | slowapi                     |
| Config          | python-dotenv               |

## Project Structure

```
backend-python/
├── main.py                  # FastAPI app entry point
├── requirements.txt
├── .env.example
├── lib/
│   └── supabase_client.py   # Supabase client init
├── middleware/
│   └── auth.py              # JWT verify/generate, admin guard
└── routes/
    ├── auth.py              # /api/auth/*
    ├── prices.py            # /api/prices/*
    ├── predictions.py       # /api/predictions/*
    ├── activities.py        # /api/activities/*
    ├── users.py             # /api/users/*
    └── config.py            # /api/config/*
```

## Setup & Run

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Configure environment
cp .env.example .env
# Edit .env with your Supabase URL, keys, JWT secret, etc.

# 3. Start the server
uvicorn main:app --reload --port 8000
```

## API Docs (Swagger UI)

Once running, visit: http://localhost:8000/docs

## API Endpoints

| Method | Endpoint                        | Auth     | Description                    |
|--------|---------------------------------|----------|--------------------------------|
| POST   | /api/auth/register              | None     | Register new user              |
| POST   | /api/auth/login                 | None     | User login                     |
| POST   | /api/auth/admin-login           | None     | Admin login with secret key    |
| POST   | /api/auth/logout                | Token    | Logout                         |
| GET    | /api/auth/me                    | Token    | Get current user               |
| GET    | /api/prices/dashboard           | None     | All 4 commodity prices         |
| GET    | /api/prices/today               | None     | Today's prices from DB         |
| GET    | /api/prices/search              | Token    | Search specific market price   |
| GET    | /api/prices/history             | None     | Price history                  |
| POST   | /api/predictions/               | Token    | Create price prediction        |
| GET    | /api/predictions/my             | Token    | My predictions                 |
| GET    | /api/predictions/stats          | Admin    | Prediction statistics          |
| POST   | /api/activities/                | Token    | Log activity                   |
| GET    | /api/activities/                | Admin    | All activities                 |
| GET    | /api/activities/my              | Token    | My activities                  |
| GET    | /api/activities/stats           | Admin    | Activity statistics            |
| GET    | /api/users/                     | Admin    | List all users                 |
| GET    | /api/users/stats                | Admin    | User statistics                |
| PATCH  | /api/users/profile/me           | Token    | Update own profile             |
| PATCH  | /api/users/password/me          | Token    | Change own password            |
| PATCH  | /api/users/{id}                 | Admin    | Update user (admin)            |
| GET    | /api/config/                    | None     | Get app config                 |
| PATCH  | /api/config/                    | Admin    | Update app config              |
