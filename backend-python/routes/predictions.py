import os
import math
from datetime import datetime, date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import httpx
from lib.supabase_client import supabase
from middleware.auth import verify_token, verify_admin

router = APIRouter()

AGMARKNET_MAP = {
    "Maize": "Maize",
    "Paddy": "Paddy(Dhan)(Common)",
    "Wheat": "Wheat",
    "Sugarcane": "Sugarcane",
}
BASE_PRICES = {"Maize": 2225, "Paddy": 2300, "Wheat": 2425, "Sugarcane": 340}
SEASONAL_TRENDS = {
    "Maize":     {"annual_growth": 0.055, "volatility": 0.04, "harvest_dip_months": [10, 11], "peak_months": [4, 5, 6]},
    "Paddy":     {"annual_growth": 0.048, "volatility": 0.03, "harvest_dip_months": [11, 12, 1], "peak_months": [6, 7, 8]},
    "Wheat":     {"annual_growth": 0.052, "volatility": 0.03, "harvest_dip_months": [3, 4, 5],  "peak_months": [10, 11, 12]},
    "Sugarcane": {"annual_growth": 0.035, "volatility": 0.02, "harvest_dip_months": [1, 2, 3],  "peak_months": [8, 9, 10]},
}


def get_seasonal_price(commodity: str) -> int:
    base = BASE_PRICES.get(commodity, 2000)
    trend = SEASONAL_TRENDS.get(commodity, {"annual_growth": 0.05})
    now = datetime.utcnow()
    yf = 1 + trend["annual_growth"] * (now.year - 2021)
    sf = 1.0
    if now.month in trend.get("harvest_dip_months", []):
        sf = 0.94
    if now.month in trend.get("peak_months", []):
        sf = 1.06
    return round(base * yf * sf)


async def fetch_agmarknet(commodity: str, state: str = "Karnataka", district: str = "Kolar"):
    name = AGMARKNET_MAP.get(commodity, commodity)
    api_key = os.getenv("AGMARKNET_API_KEY", "demo_key")
    url = (
        f"https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070"
        f"?api-key={api_key}&format=json&limit=10"
        f"&filters%5Bcommodity%5D={name}"
        f"&filters%5Bstate%5D={state}"
        f"&filters%5Bdistrict%5D={district}"
    )
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(url)
            records = r.json().get("records", [])
            if records:
                records.sort(key=lambda x: x.get("arrival_date", ""), reverse=True)
                price = float(
                    records[0].get("modal_price")
                    or records[0].get("max_price")
                    or 0
                )
                if price > 0:
                    return {"price": price, "source": "agmarknet"}
    except Exception:
        pass
    return None


async def get_live_price(commodity: str, district: str) -> dict:
    today = date.today().isoformat()
    cached = (
        supabase.from_("commodity_prices")
        .select("price_per_quintal, source")
        .eq("commodity", commodity)
        .eq("district", district)
        .eq("price_date", today)
        .maybe_single()
        .execute()
    )
    if cached.data:
        return {"price": float(cached.data["price_per_quintal"]), "source": "cache"}

    live = await fetch_agmarknet(commodity, district=district)
    if live:
        supabase.from_("commodity_prices").upsert(
            [{
                "commodity": commodity, "district": district,
                "market": f"{district} APMC",
                "price_per_quintal": live["price"],
                "price_date": today, "source": "agmarknet",
            }],
            on_conflict="commodity,district,market,price_date",
        ).execute()
        return live

    return {"price": get_seasonal_price(commodity), "source": "msp_seasonal"}


def predict_price(current_price: float, commodity: str, days_ahead: int = 7) -> dict:
    trend = SEASONAL_TRENDS.get(commodity, {"annual_growth": 0.05, "volatility": 0.03})
    now = datetime.utcnow()
    future_month = ((now.month - 1 + days_ahead // 30) % 12) + 1
    weekly_growth = trend["annual_growth"] / 52
    weeks_ahead = days_ahead / 7
    seasonal_momentum = 0.0
    if future_month in trend.get("harvest_dip_months", []):
        seasonal_momentum = -0.025
    elif future_month in trend.get("peak_months", []):
        seasonal_momentum = 0.025
    day_of_year = now.timetuple().tm_yday
    noise = math.sin(day_of_year * 0.17 + len(commodity)) * trend["volatility"] * 0.5
    total_change = (weekly_growth * weeks_ahead) + seasonal_momentum + noise
    predicted = round(current_price * (1 + total_change))
    lower = round(current_price * (1 + total_change - trend["volatility"]))
    upper = round(current_price * (1 + total_change + trend["volatility"]))
    return {
        "predicted": predicted,
        "lowerBound": lower,
        "upperBound": upper,
        "changePercent": f"{total_change * 100:.2f}",
    }


class PredictionBody(BaseModel):
    commodity: str
    district: str
    market: str
    quantity: float = None
    quantile: float = 0.5


@router.post("/", status_code=201)
async def create_prediction(body: PredictionBody, user: dict = Depends(verify_token)):
    live = await get_live_price(body.commodity, body.district)
    pred = predict_price(live["price"], body.commodity)
    today = date.today().isoformat()

    res = (
        supabase.from_("price_predictions")
        .insert([{
            "user_id": None if user["id"] == "default-admin" else user["id"],
            "username": user["username"],
            "commodity": body.commodity,
            "district": body.district,
            "market": body.market,
            "current_price": live["price"],
            "predicted_price": pred["predicted"],
            "prediction_date": today,
            "days_ahead": 7,
            "quantile": body.quantile,
            "metadata": {
                "source": live["source"],
                "lowerBound": pred["lowerBound"],
                "upperBound": pred["upperBound"],
                "changePercent": pred["changePercent"],
                "quantity": body.quantity,
            },
        }])
        .select()
        .single()
        .execute()
    )

    supabase.from_("activities").insert([{
        "user_id": None if user["id"] == "default-admin" else user["id"],
        "username": user["username"],
        "activity_type": "prediction",
        "description": (
            f"Predicted {body.commodity} at {body.market}, {body.district} "
            f"\u2014 \u20b9{live['price']}\u2192\u20b9{pred['predicted']}"
        ),
        "metadata": {
            "commodity": body.commodity, "district": body.district,
            "market": body.market, "currentPrice": live["price"],
            "predictedPrice": pred["predicted"], "source": live["source"],
        },
    }]).execute()

    source_messages = {
        "agmarknet": "\u2705 Live Agmarknet price used",
        "data.gov.in": "\u2705 data.gov.in price used",
        "cache": "\U0001f4e6 Cached today's price used",
    }
    msg = source_messages.get(live["source"], "\U0001f4ca MSP seasonal estimate used")

    return {
        "prediction": res.data,
        "currentPrice": live["price"],
        "predictedPrice": pred["predicted"],
        "lowerBound": pred["lowerBound"],
        "upperBound": pred["upperBound"],
        "changePercent": pred["changePercent"],
        "priceSource": live["source"],
        "message": msg,
    }


@router.get("/my")
async def my_predictions(user: dict = Depends(verify_token)):
    res = (
        supabase.from_("price_predictions")
        .select("*")
        .eq("user_id", user["id"])
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )
    return {"predictions": res.data}


@router.get("/stats")
async def prediction_stats(user: dict = Depends(verify_admin)):
    res = supabase.from_("price_predictions").select("id, commodity").execute()
    by_comm: dict = {}
    for p in res.data:
        by_comm[p["commodity"]] = by_comm.get(p["commodity"], 0) + 1
    return {"total": len(res.data), "by_commodity": by_comm}
