import os
from datetime import datetime, date
from fastapi import APIRouter, Query, Depends, HTTPException
import httpx
from lib.supabase_client import supabase
from middleware.auth import verify_token

router = APIRouter()

AGMARKNET_MAP = {
    "Maize": "Maize",
    "Paddy": "Paddy(Dhan)(Common)",
    "Wheat": "Wheat",
    "Sugarcane": "Sugarcane",
}
BASE_PRICES = {"Maize": 2225, "Paddy": 2300, "Wheat": 2425, "Sugarcane": 340}
SEASONAL_TRENDS = {
    "Maize":     {"annual_growth": 0.055, "harvest_dip_months": [10, 11], "peak_months": [4, 5, 6]},
    "Paddy":     {"annual_growth": 0.048, "harvest_dip_months": [11, 12, 1], "peak_months": [6, 7, 8]},
    "Wheat":     {"annual_growth": 0.052, "harvest_dip_months": [3, 4, 5], "peak_months": [10, 11, 12]},
    "Sugarcane": {"annual_growth": 0.035, "harvest_dip_months": [1, 2, 3], "peak_months": [8, 9, 10]},
}


def get_seasonal_price(commodity: str) -> int:
    base = BASE_PRICES.get(commodity, 2000)
    trend = SEASONAL_TRENDS.get(commodity, {"annual_growth": 0.05})
    now = datetime.utcnow()
    year_factor = 1 + trend["annual_growth"] * (now.year - 2021)
    seasonal = 1.0
    if now.month in trend.get("harvest_dip_months", []):
        seasonal = 0.94
    if now.month in trend.get("peak_months", []):
        seasonal = 1.06
    return round(base * year_factor * seasonal)


async def fetch_agmarknet_live(commodity: str, district: str = "Kolar") -> float | None:
    name = AGMARKNET_MAP.get(commodity, commodity)
    api_key = os.getenv("AGMARKNET_API_KEY") or os.getenv("DATA_GOV_API_KEY", "demo_key")
    url = (
        f"https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070"
        f"?api-key={api_key}&format=json&limit=5"
        f"&filters%5Bcommodity%5D={name}"
        f"&filters%5Bstate%5D=Karnataka"
        f"&filters%5Bdistrict%5D={district}"
    )
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(url)
            records = r.json().get("records", [])
            if records:
                price = float(
                    records[0].get("modal_price")
                    or records[0].get("max_price")
                    or 0
                )
                if price > 100:
                    return price
    except Exception:
        pass
    return None


@router.get("/dashboard")
async def dashboard():
    commodities = ["Maize", "Paddy", "Wheat", "Sugarcane"]
    today = date.today().isoformat()
    prices = {}
    for c in commodities:
        cached = (
            supabase.from_("commodity_prices")
            .select("price_per_quintal")
            .eq("commodity", c)
            .eq("price_date", today)
            .limit(1)
            .maybe_single()
            .execute()
        )
        if cached.data:
            prices[c] = float(cached.data["price_per_quintal"])
            continue
        live = await fetch_agmarknet_live(c)
        prices[c] = live if live else get_seasonal_price(c)
    return {"prices": prices, "date": today}


@router.get("/today")
async def today_prices():
    today = date.today().isoformat()
    res = (
        supabase.from_("commodity_prices")
        .select("*")
        .eq("price_date", today)
        .order("commodity")
        .execute()
    )
    return {"prices": res.data, "date": today}


@router.get("/search")
async def search_price(
    commodity: str = Query(...),
    district: str = Query(...),
    market: str = Query(...),
    user=Depends(verify_token),
):
    today = date.today().isoformat()
    db = (
        supabase.from_("commodity_prices")
        .select("*")
        .eq("commodity", commodity)
        .eq("district", district)
        .eq("market", market)
        .eq("price_date", today)
        .maybe_single()
        .execute()
    )
    if db.data:
        return {"price": db.data}

    live = await fetch_agmarknet_live(commodity, district)
    final = live if live else get_seasonal_price(commodity)
    row = {
        "commodity": commodity, "district": district, "market": market,
        "price_per_quintal": final, "price_date": today,
        "source": "agmarknet" if live else "seasonal_estimate",
    }
    supabase.from_("commodity_prices").upsert(
        [row], on_conflict="commodity,district,market,price_date"
    ).execute()
    return {"price": row}


@router.get("/history")
async def price_history(commodity: str = Query(None)):
    q = (
        supabase.from_("commodity_prices")
        .select("*")
        .order("price_date", desc=True)
        .limit(30)
    )
    if commodity:
        q = q.eq("commodity", commodity)
    res = q.execute()
    return {"prices": res.data}
