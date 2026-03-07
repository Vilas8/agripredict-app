from fastapi import APIRouter, Depends
from lib.supabase_client import supabase
from middleware.auth import verify_admin

router = APIRouter()


@router.get("/")
async def get_config():
    res = supabase.from_("app_config").select("key, value").execute()
    config = {row["key"]: row["value"] for row in res.data}
    return {"config": config}


@router.patch("/")
async def update_config(updates: dict, admin: dict = Depends(verify_admin)):
    rows = [{"key": k, "value": str(v)} for k, v in updates.items()]
    supabase.from_("app_config").upsert(rows, on_conflict="key").execute()
    return {"message": "Config updated successfully"}
