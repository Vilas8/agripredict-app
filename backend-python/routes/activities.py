from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from lib.supabase_client import supabase
from middleware.auth import verify_token, verify_admin

router = APIRouter()


class ActivityBody(BaseModel):
    activity_type: str
    description: str = None
    metadata: dict = {}


@router.post("/", status_code=201)
async def log_activity(body: ActivityBody, user: dict = Depends(verify_token)):
    res = (
        supabase.from_("activities")
        .insert([{
            "user_id": None if user["id"] == "default-admin" else user["id"],
            "username": user["username"],
            "activity_type": body.activity_type,
            "description": body.description,
            "metadata": body.metadata,
        }])
        .select()
        .single()
        .execute()
    )
    return {"activity": res.data}


@router.get("/")
async def get_activities(
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(verify_admin),
):
    res = (
        supabase.from_("activities")
        .select("*")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return {"activities": res.data}


@router.get("/my")
async def my_activities(user: dict = Depends(verify_token)):
    res = (
        supabase.from_("activities")
        .select("*")
        .eq("user_id", user["id"])
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )
    return {"activities": res.data}


@router.get("/stats")
async def activity_stats(user: dict = Depends(verify_admin)):
    res = supabase.from_("activities").select("activity_type").execute()
    stats = {
        "total": len(res.data),
        "login": 0, "admin_login": 0, "market_search": 0,
        "prediction": 0, "register": 0, "logout": 0,
    }
    for a in res.data:
        if a["activity_type"] in stats:
            stats[a["activity_type"]] += 1
    return {"stats": stats}
