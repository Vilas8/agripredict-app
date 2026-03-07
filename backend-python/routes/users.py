from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from passlib.hash import bcrypt
from lib.supabase_client import supabase
from middleware.auth import verify_token, verify_admin

router = APIRouter()


class UpdateUserBody(BaseModel):
    username: str = None
    status: str = None


class ProfileBody(BaseModel):
    username: str = None
    phone: str = None


class PasswordBody(BaseModel):
    currentPassword: str
    newPassword: str


@router.get("/")
async def list_users(user: dict = Depends(verify_admin)):
    res = (
        supabase.from_("users")
        .select("id, username, email, phone, role, status, created_at")
        .order("created_at", desc=True)
        .execute()
    )
    return {"users": res.data}


@router.get("/stats")
async def user_stats(user: dict = Depends(verify_admin)):
    res = supabase.from_("users").select("id, role, status, created_at").execute()
    today = date.today().isoformat()
    return {
        "stats": {
            "total": len(res.data),
            "active": sum(1 for u in res.data if u["status"] == "active"),
            "admins": sum(1 for u in res.data if u["role"] == "admin"),
            "today": sum(1 for u in res.data if (u.get("created_at") or "").startswith(today)),
        }
    }


@router.patch("/profile/me")
async def update_profile(body: ProfileBody, user: dict = Depends(verify_token)):
    updates: dict = {}
    if body.username:
        updates["username"] = body.username
    if body.phone:
        digits = "".join(filter(str.isdigit, body.phone))
        if len(digits) != 10:
            raise HTTPException(400, "Phone must be 10 digits")
        updates["phone"] = digits
    res = (
        supabase.from_("users")
        .update(updates)
        .eq("id", user["id"])
        .select("id, username, email, phone, role, status")
        .single()
        .execute()
    )
    return {"user": res.data}


@router.patch("/password/me")
async def change_password(body: PasswordBody, user: dict = Depends(verify_token)):
    res = (
        supabase.from_("users")
        .select("password_hash")
        .eq("id", user["id"])
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "User not found")
    if not bcrypt.verify(body.currentPassword, res.data["password_hash"]):
        raise HTTPException(401, "Current password is incorrect")
    supabase.from_("users").update(
        {"password_hash": bcrypt.hash(body.newPassword)}
    ).eq("id", user["id"]).execute()
    return {"message": "Password updated successfully"}


@router.patch("/{user_id}")
async def update_user(
    user_id: str,
    body: UpdateUserBody,
    admin: dict = Depends(verify_admin),
):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    res = (
        supabase.from_("users")
        .update(updates)
        .eq("id", user_id)
        .select("id, username, email, phone, role, status, created_at")
        .single()
        .execute()
    )
    return {"user": res.data}
