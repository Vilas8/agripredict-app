import os
from datetime import datetime, timedelta
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError

JWT_SECRET = os.getenv("JWT_SECRET", "agripredict-secret-change-me")
ALGORITHM = "HS256"
bearer_scheme = HTTPBearer()


def generate_token(payload: dict) -> str:
    data = payload.copy()
    data["exp"] = datetime.utcnow() + timedelta(days=7)
    return jwt.encode(data, JWT_SECRET, algorithm=ALGORITHM)


def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    try:
        payload = jwt.decode(
            credentials.credentials, JWT_SECRET, algorithms=[ALGORITHM]
        )
        return payload
    except JWTError:
        raise HTTPException(status_code=403, detail="Invalid or expired token")


def verify_admin(user: dict = Depends(verify_token)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
