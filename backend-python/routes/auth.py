import os
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from passlib.hash import bcrypt
from lib.supabase_client import supabase
from middleware.auth import generate_token, verify_token

router = APIRouter()

ADMIN_SECRET = os.getenv("ADMIN_SECRET", "AGRI2026")
DEFAULT_ADMIN_EMAIL = os.getenv("DEFAULT_ADMIN_EMAIL", "admin@gmail.com")
DEFAULT_ADMIN_PASSWORD = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin123")


class RegisterBody(BaseModel):
    username: str
    email: str
    phone: str = None
    password: str


class LoginBody(BaseModel):
    email: str
    password: str


class AdminLoginBody(BaseModel):
    email: str
    password: str
    secret: str


@router.post("/register", status_code=201)
async def register(body: RegisterBody):
    phone_digits = "".join(filter(str.isdigit, body.phone or ""))
    if body.phone and len(phone_digits) != 10:
        raise HTTPException(400, "Mobile number must be exactly 10 digits")

    existing = (
        supabase.from_("users")
        .select("id")
        .eq("email", body.email.lower())
        .maybe_single()
        .execute()
    )
    if existing.data:
        raise HTTPException(409, "Email already registered")

    password_hash = bcrypt.hash(body.password)
    res = (
        supabase.from_("users")
        .insert([{
            "username": body.username,
            "email": body.email.lower(),
            "phone": phone_digits or None,
            "password_hash": password_hash,
            "role": "user",
            "status": "active",
        }])
        .select("id, username, email, phone, role, status, created_at")
        .single()
        .execute()
    )
    user = res.data
    supabase.from_("activities").insert([{
        "user_id": user["id"],
        "username": user["username"],
        "activity_type": "register",
        "description": f"User {body.email} registered",
    }]).execute()

    token = generate_token({
        "id": user["id"], "email": user["email"],
        "role": user["role"], "username": user["username"],
    })
    return {"message": "Registration successful", "user": user, "token": token}


@router.post("/login")
async def login(body: LoginBody):
    res = (
        supabase.from_("users")
        .select("*")
        .eq("email", body.email.lower())
        .maybe_single()
        .execute()
    )
    user = res.data
    if not user:
        raise HTTPException(401, "User not found. Please register.")
    if user["status"] == "inactive":
        raise HTTPException(403, "Account is blocked. Contact admin.")
    if not bcrypt.verify(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid password")

    supabase.from_("activities").insert([{
        "user_id": user["id"],
        "username": user["username"],
        "activity_type": "login",
        "description": f"User {body.email} logged in",
    }]).execute()

    token = generate_token({
        "id": user["id"], "email": user["email"],
        "role": user["role"], "username": user["username"],
    })
    safe_user = {k: v for k, v in user.items() if k != "password_hash"}
    return {"message": "Login successful", "user": safe_user, "token": token}


@router.post("/admin-login")
async def admin_login(body: AdminLoginBody):
    if not body.email.lower().endswith("@gmail.com"):
        raise HTTPException(400, "Please use a valid @gmail.com email address")
    if body.secret != ADMIN_SECRET:
        raise HTTPException(401, "Invalid secret key")

    # Default hardcoded admin
    if body.email == DEFAULT_ADMIN_EMAIL and body.password == DEFAULT_ADMIN_PASSWORD:
        admin_user = {
            "id": "default-admin", "username": "Admin",
            "email": DEFAULT_ADMIN_EMAIL, "phone": "9999999999",
            "role": "admin", "status": "active",
        }
        token = generate_token({
            "id": "default-admin", "email": DEFAULT_ADMIN_EMAIL,
            "role": "admin", "username": "Admin",
        })
        supabase.from_("activities").insert([{
            "username": "Admin", "activity_type": "admin_login",
            "description": f"Admin {body.email} logged in",
        }]).execute()
        return {"message": "Admin login successful", "user": admin_user, "token": token}

    # DB admin
    res = (
        supabase.from_("users")
        .select("*")
        .eq("email", body.email.lower())
        .eq("role", "admin")
        .maybe_single()
        .execute()
    )
    user = res.data
    if not user:
        raise HTTPException(401, "Invalid admin credentials")
    if not bcrypt.verify(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid password")

    supabase.from_("activities").insert([{
        "user_id": user["id"], "username": user["username"],
        "activity_type": "admin_login",
        "description": f"Admin {body.email} logged in",
    }]).execute()

    token = generate_token({
        "id": user["id"], "email": user["email"],
        "role": user["role"], "username": user["username"],
    })
    safe_user = {k: v for k, v in user.items() if k != "password_hash"}
    return {"message": "Admin login successful", "user": safe_user, "token": token}


@router.post("/logout")
async def logout(user: dict = Depends(verify_token)):
    supabase.from_("activities").insert([{
        "user_id": user["id"], "username": user["username"],
        "activity_type": "logout",
        "description": f"User {user['email']} logged out",
    }]).execute()
    return {"message": "Logged out successfully"}


@router.get("/me")
async def me(user: dict = Depends(verify_token)):
    res = (
        supabase.from_("users")
        .select("id, username, email, phone, role, status, created_at")
        .eq("id", user["id"])
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "User not found")
    return {"user": res.data}
