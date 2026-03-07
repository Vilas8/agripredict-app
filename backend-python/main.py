from dotenv import load_dotenv
load_dotenv()

import os
import time
from datetime import datetime
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from routes import auth, prices, predictions, activities, users, config

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="AgriPredict API", version="1.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router,        prefix="/api/auth",        tags=["Auth"])
app.include_router(prices.router,      prefix="/api/prices",      tags=["Prices"])
app.include_router(predictions.router, prefix="/api/predictions", tags=["Predictions"])
app.include_router(activities.router,  prefix="/api/activities",  tags=["Activities"])
app.include_router(users.router,       prefix="/api/users",       tags=["Users"])
app.include_router(config.router,      prefix="/api/config",      tags=["Config"])

start_time = time.time()


@app.get("/")
def root():
    return {
        "name": "AgriPredict API",
        "status": "\U0001f7e2 Running",
        "version": "1.0.0",
        "description": "AI-powered Commodity Price Prediction Backend (Python/FastAPI)",
        "timestamp": datetime.utcnow().isoformat(),
        "endpoints": {
            "health":      "GET  /health",
            "docs":        "GET  /docs",
            "auth":        "POST /api/auth/login | /api/auth/register | /api/auth/admin-login",
            "prices":      "GET  /api/prices/today | /api/prices/dashboard | /api/prices/search",
            "predictions": "POST /api/predictions | GET /api/predictions/my",
            "activities":  "GET  /api/activities | POST /api/activities",
            "users":       "GET  /api/users | PATCH /api/users/{id}",
            "config":      "GET  /api/config | PATCH /api/config",
        },
        "frontend": os.getenv("FRONTEND_URL", "https://agripredict-app.vercel.app"),
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
        "uptime": time.time() - start_time,
    }


@app.get("/api")
def api_info():
    return {
        "message": "AgriPredict API v1.0 - Use /api/auth, /api/prices, /api/predictions, /api/activities, /api/users, /api/config"
    }
