"""
ACOS — Autonomous Company Operating System backend
FastAPI + MongoDB + JWT auth + LLM-driven multi-agent orchestration.
"""
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, UploadFile, File, Header, Query, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import logging
import uuid
import bcrypt
import jwt
import asyncio
import secrets
import requests
import resend
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALG = os.environ.get('JWT_ALG', 'HS256')
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '').strip()
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
APP_NAME = os.environ.get('EMERGENT_APP_NAME', 'acos')
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

_storage_key: Optional[str] = None

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="ACOS API")
api_router = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)

# ---------------------------------------------------------------- Models

def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def new_id() -> str:
    return str(uuid.uuid4())


class UserOut(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: EmailStr
    name: str
    role: str
    avatar: Optional[str] = None
    email_verified: bool = False
    auth_provider: Optional[str] = None


class RegisterInput(BaseModel):
    email: EmailStr
    name: str
    password: str
    role: str = "employee"


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    token: str
    user: UserOut


# ---------------------------------------------------------------- Helpers

def hash_password(pwd: str) -> str:
    return bcrypt.hashpw(pwd.encode(), bcrypt.gensalt()).decode()

def verify_password(pwd: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pwd.encode(), hashed.encode())
    except Exception:
        return False

def create_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

async def current_user(cred: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> Dict[str, Any]:
    if not cred:
        raise HTTPException(401, "Missing token")
    try:
        payload = jwt.decode(cred.credentials, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


async def audit(actor: str, action: str, module: str, details: str, agent: Optional[str] = None):
    await db.audit_logs.insert_one({
        "id": new_id(),
        "timestamp": utcnow_iso(),
        "actor": actor,
        "agent": agent,
        "module": module,
        "action": action,
        "details": details,
    })


# ---------------------------------------------------------------- Email helper (Resend + graceful fallback)

async def send_email(to: str, subject: str, html: str, purpose: str = "notification") -> str:
    """Sends real email if RESEND_API_KEY set, else logs + stores. Returns message id."""
    msg_id = new_id()
    doc = {
        "id": msg_id,
        "to": to,
        "subject": subject,
        "html": html,
        "purpose": purpose,
        "sent_at": utcnow_iso(),
        "provider": "resend" if RESEND_API_KEY else "console",
        "status": "queued",
    }
    if RESEND_API_KEY:
        try:
            params = {"from": SENDER_EMAIL, "to": [to], "subject": subject, "html": html}
            result = await asyncio.to_thread(resend.Emails.send, params)
            doc["status"] = "sent"
            doc["provider_id"] = result.get("id") if isinstance(result, dict) else None
        except Exception as e:
            logging.exception("Resend failed")
            doc["status"] = "failed"
            doc["error"] = str(e)
    else:
        # Console fallback — always succeeds for demo
        logging.info(f"[EMAIL/console] to={to} subject={subject!r} purpose={purpose}")
        doc["status"] = "console"
    await db.emails.insert_one(doc)
    return msg_id


# ---------------------------------------------------------------- Object storage (Emergent)

def init_storage() -> Optional[str]:
    global _storage_key
    if _storage_key:
        return _storage_key
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
        resp.raise_for_status()
        _storage_key = resp.json()["storage_key"]
        return _storage_key
    except Exception as e:
        logging.exception("Storage init failed")
        return None

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(503, "Object storage unavailable")
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    resp.raise_for_status()
    return resp.json()

def get_object(path: str) -> tuple:
    key = init_storage()
    if not key:
        raise HTTPException(503, "Object storage unavailable")
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=60,
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ---------------------------------------------------------------- Prompt-injection sanitizer

_INJECTION_PATTERNS = [
    r"(?i)ignore (all|previous|the above|prior) (instructions|prompts?|rules)",
    r"(?i)you are (now )?(a |an )?(?!hr|finance|inventory|sales|compliance|orchestrator)[a-z ]{3,40} ai",
    r"(?i)system prompt",
    r"(?i)act as (root|admin|developer|jailbroken)",
    r"(?i)disregard (safety|policy|rules)",
    r"<\|[a-z_]+\|>",
]

def sanitize_input(text: str, max_len: int = 4000) -> str:
    """Strip common prompt-injection patterns and wrap the rest in explicit user-content tags."""
    if not text:
        return ""
    cleaned = text[:max_len]
    for pat in _INJECTION_PATTERNS:
        cleaned = re.sub(pat, "[filtered]", cleaned)
    # Collapse suspicious repeated whitespace
    cleaned = re.sub(r"\n{4,}", "\n\n\n", cleaned)
    return f"<user_supplied_goal>\n{cleaned}\n</user_supplied_goal>"


# ---------------------------------------------------------------- RBAC helpers

def _role(u: dict) -> str:
    return u.get("role", "employee")

def can_write(u: dict) -> bool:
    return _role(u) in {"admin", "manager"}

def filter_by_role(items: List[dict], user: dict, self_field: Optional[str] = None) -> List[dict]:
    """Employees only see items where self_field == their email. Everyone else sees all."""
    if _role(user) in {"admin", "auditor", "manager"} or not self_field:
        return items
    email = user.get("email")
    return [x for x in items if x.get(self_field) == email]



# ---------------------------------------------------------------- Auth Routes

@api_router.post("/auth/register", response_model=TokenOut)
async def register(inp: RegisterInput):
    if await db.users.find_one({"email": inp.email}):
        raise HTTPException(400, "Email already registered")
    if len(inp.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    user_id = new_id()
    doc = {
        "id": user_id,
        "email": inp.email,
        "name": inp.name,
        "password": hash_password(inp.password),
        # New signups start with no role — admin must assign one before they can use modules.
        "role": "pending",
        "avatar": None,
        "email_verified": False,
        "auth_provider": "password",
        "created_at": utcnow_iso(),
    }
    await db.users.insert_one(doc)
    # Send verification OTP
    otp = _gen_otp()
    await db.otps.insert_one({
        "id": new_id(), "user_id": user_id, "email": inp.email,
        "otp": otp, "purpose": "verify_email", "used": False,
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat(),
        "created_at": utcnow_iso(),
    })
    html = f"""
    <div style='font-family:Inter,Arial,sans-serif;background:#09090b;color:#fafafa;padding:32px'>
      <h2 style='font-size:22px;margin:0 0 12px'>Welcome to ACOS, {inp.name.split()[0]}!</h2>
      <p style='color:#a1a1aa'>Verify your email with this 6-digit code:</p>
      <div style='background:#18181b;border:1px solid #27272a;padding:24px;border-radius:8px;text-align:center;letter-spacing:8px;font-size:32px;font-weight:800;margin:16px 0'>
        {otp}
      </div>
      <p style='color:#71717a;font-size:12px'>Expires in 15 minutes.</p>
    </div>"""
    await send_email(inp.email, f"ACOS · verify your email · {otp}", html, purpose="verify_email")
    await audit(inp.email, "register", "auth", f"New user {inp.name} registered as {doc['role']}")
    return TokenOut(token=create_token(user_id, doc["role"]), user=UserOut(**doc))


class VerifyEmailInput(BaseModel):
    otp: str


@api_router.post("/auth/verify-email")
async def verify_email_signup(inp: VerifyEmailInput, user: dict = Depends(current_user)):
    doc = await db.otps.find_one({
        "email": user["email"], "otp": inp.otp, "purpose": "verify_email", "used": False,
    })
    if not doc:
        raise HTTPException(400, "Invalid or expired code")
    if datetime.now(timezone.utc) > datetime.fromisoformat(doc["expires_at"]):
        raise HTTPException(400, "Code expired")
    await db.otps.update_one({"id": doc["id"]}, {"$set": {"used": True}})
    await db.users.update_one({"id": user["id"]}, {"$set": {"email_verified": True}})
    await audit(user["email"], "verify_email", "auth", "Email verified via OTP")
    return {"ok": True, "email_verified": True}


@api_router.post("/auth/verify-email/resend")
async def resend_verification(user: dict = Depends(current_user)):
    if user.get("email_verified"):
        return {"ok": True, "already_verified": True}
    otp = _gen_otp()
    await db.otps.insert_one({
        "id": new_id(), "user_id": user["id"], "email": user["email"],
        "otp": otp, "purpose": "verify_email", "used": False,
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat(),
        "created_at": utcnow_iso(),
    })
    html = f"""
    <div style='font-family:Inter,Arial,sans-serif;background:#09090b;color:#fafafa;padding:32px'>
      <h2>New verification code</h2>
      <p style='color:#a1a1aa'>Your ACOS verification code:</p>
      <div style='background:#18181b;border:1px solid #27272a;padding:24px;border-radius:8px;text-align:center;letter-spacing:8px;font-size:32px;font-weight:800;margin:16px 0'>{otp}</div>
      <p style='color:#71717a;font-size:12px'>Expires in 15 minutes.</p>
    </div>"""
    await send_email(user["email"], f"ACOS code · {otp}", html, purpose="verify_email")
    return {"ok": True, "demo_hint": otp if (not RESEND_API_KEY and os.environ.get("DEBUG_OTP", "true").lower() == "true") else None}


# ---------------------------------------------------------------- Emergent Google Auth bridge

class EmergentCallbackInput(BaseModel):
    session_id: str


@api_router.post("/auth/emergent/callback", response_model=TokenOut)
async def emergent_callback(inp: EmergentCallbackInput):
    """Exchange an Emergent session_id for our JWT + user record."""
    try:
        resp = await asyncio.to_thread(
            requests.get,
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": inp.session_id},
            timeout=15,
        )
    except Exception:
        raise HTTPException(502, "Could not reach Emergent auth")
    if resp.status_code != 200:
        raise HTTPException(401, "Emergent session invalid or expired")
    data = resp.json()
    email = data["email"].lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        user_id = existing["id"]
        await db.users.update_one({"id": user_id}, {"$set": {
            "name": data.get("name", existing.get("name")),
            "avatar": data.get("picture", existing.get("avatar")),
            "email_verified": True,
            "auth_provider": existing.get("auth_provider", "google"),
        }})
    else:
        user_id = new_id()
        await db.users.insert_one({
            "id": user_id, "email": email,
            "name": data.get("name", email.split("@")[0]),
            "avatar": data.get("picture"),
            "password": hash_password(secrets.token_urlsafe(32)),  # random, unusable
            "role": "employee",
            "auth_provider": "google",
            "email_verified": True,
            "created_at": utcnow_iso(),
        })
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    await audit(email, "google_login", "auth", "Signed in via Emergent Google")
    return TokenOut(token=create_token(user_id, user["role"]), user=UserOut(**user))


# ---------------------------------------------------------------- Profile edit

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    avatar: Optional[str] = None


@api_router.put("/auth/me", response_model=UserOut)
async def update_profile(inp: ProfileUpdate, user: dict = Depends(current_user)):
    patch = {k: v for k, v in inp.model_dump(exclude_none=True).items() if v != ""}
    if not patch:
        raise HTTPException(400, "Nothing to update")
    if "email" in patch and patch["email"] != user["email"]:
        exists = await db.users.find_one({"email": patch["email"]})
        if exists:
            raise HTTPException(400, "Email already in use")
        patch["email_verified"] = False
    await db.users.update_one({"id": user["id"]}, {"$set": patch})
    await audit(user["email"], "profile_update", "auth", f"Updated: {', '.join(patch.keys())}")
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password": 0})
    return UserOut(**updated)


class PasswordChangeInput(BaseModel):
    current_password: str
    new_password: str


@api_router.post("/auth/change-password")
async def change_password(inp: PasswordChangeInput, user: dict = Depends(current_user)):
    doc = await db.users.find_one({"id": user["id"]})
    if not verify_password(inp.current_password, doc["password"]):
        raise HTTPException(401, "Current password is incorrect")
    if len(inp.new_password) < 6:
        raise HTTPException(400, "New password too short")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password": hash_password(inp.new_password)}})
    await audit(user["email"], "password_change", "auth", "Password changed")
    return {"ok": True}


# ---------------------------------------------------------------- Team & role management (admin only)

@api_router.get("/users")
async def list_users(user: dict = Depends(current_user)):
    if _role(user) not in {"admin", "auditor"}:
        raise HTTPException(403, "Only admin/auditor")
    users = await db.users.find({}, {"_id": 0, "password": 0}).sort("created_at", -1).to_list(500)
    return users


class RoleChangeInput(BaseModel):
    role: str


@api_router.put("/users/{user_id}/role")
async def set_user_role(user_id: str, inp: RoleChangeInput, user: dict = Depends(current_user)):
    if _role(user) != "admin":
        raise HTTPException(403, "Only admin can change roles")
    if inp.role not in {"admin", "manager", "employee", "auditor"}:
        raise HTTPException(400, "Invalid role")
    if user_id == user["id"] and inp.role != "admin":
        raise HTTPException(400, "You cannot demote yourself")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(404, "User not found")
    await db.users.update_one({"id": user_id}, {"$set": {"role": inp.role}})
    await audit(user["email"], "role_change", "auth", f"{target['email']}: {target['role']} → {inp.role}")
    return {"ok": True, "role": inp.role}


@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(current_user)):
    if _role(user) != "admin":
        raise HTTPException(403, "Only admin can remove members")
    if user_id == user["id"]:
        raise HTTPException(400, "You cannot remove yourself")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(404, "User not found")
    await db.users.delete_one({"id": user_id})
    # Clean up any tokens / OTPs for that user
    await db.otps.delete_many({"user_id": user_id})
    await db.password_resets.delete_many({"email": target["email"]})
    await audit(user["email"], "user_delete", "auth", f"Removed member {target['email']} (was {target.get('role')})")
    return {"ok": True}


@api_router.post("/auth/login", response_model=TokenOut)
async def login(inp: LoginInput):
    user = await db.users.find_one({"email": inp.email})
    if not user or not verify_password(inp.password, user["password"]):
        raise HTTPException(401, "Invalid credentials")
    await audit(inp.email, "login", "auth", "User logged in")
    return TokenOut(
        token=create_token(user["id"], user["role"]),
        user=UserOut(**user),
    )


@api_router.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(current_user)):
    return UserOut(**user)


# ---------------------------------------------------------------- Forgot password + Email OTP

class ForgotInput(BaseModel):
    email: EmailStr

class ResetInput(BaseModel):
    token: str
    new_password: str

class OtpRequestInput(BaseModel):
    purpose: str = "approval"  # "approval" | "finance"

class OtpVerifyInput(BaseModel):
    otp: str
    purpose: str


def _gen_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


@api_router.post("/auth/forgot")
async def forgot_password(inp: ForgotInput):
    # Always return success (do not leak whether email exists)
    user = await db.users.find_one({"email": inp.email})
    if user:
        token = secrets.token_urlsafe(32)
        await db.password_resets.insert_one({
            "id": new_id(),
            "email": inp.email,
            "token": token,
            "used": False,
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat(),
            "created_at": utcnow_iso(),
        })
        frontend_url = os.environ.get("FRONTEND_URL", "").rstrip("/")
        link_hint = f"Use token: <b>{token}</b>" if not frontend_url else f'<a href="{frontend_url}/reset?token={token}">Reset your password</a>'
        html = f"""
        <div style='font-family:Inter,Arial,sans-serif;background:#09090b;color:#fafafa;padding:32px'>
          <h2 style='font-size:22px;margin:0 0 12px'>ACOS — password reset</h2>
          <p style='color:#a1a1aa'>Someone (hopefully you) asked to reset the password for {inp.email}.</p>
          <div style='background:#18181b;border:1px solid #27272a;padding:16px;border-radius:8px;margin:16px 0'>
            {link_hint}
          </div>
          <p style='color:#71717a;font-size:12px'>This link expires in 30 minutes. Ignore this email if you didn't request it.</p>
        </div>"""
        await send_email(inp.email, "ACOS — reset your password", html, purpose="reset")
        await audit(inp.email, "forgot_password", "auth", "Reset requested")
    return {"ok": True, "message": "If an account exists, we've sent instructions."}


@api_router.post("/auth/reset")
async def reset_password(inp: ResetInput):
    doc = await db.password_resets.find_one({"token": inp.token, "used": False})
    if not doc:
        raise HTTPException(400, "Invalid or already-used token")
    expires = datetime.fromisoformat(doc["expires_at"])
    if datetime.now(timezone.utc) > expires:
        raise HTTPException(400, "Token expired")
    if len(inp.new_password) < 6:
        raise HTTPException(400, "Password too short (min 6 chars)")
    await db.users.update_one({"email": doc["email"]}, {"$set": {"password": hash_password(inp.new_password)}})
    await db.password_resets.update_one({"token": inp.token}, {"$set": {"used": True, "used_at": utcnow_iso()}})
    await audit(doc["email"], "reset_password", "auth", "Password reset via email token")
    return {"ok": True}


@api_router.post("/auth/otp/request")
async def request_otp(inp: OtpRequestInput, user: dict = Depends(current_user)):
    otp = _gen_otp()
    await db.otps.insert_one({
        "id": new_id(),
        "user_id": user["id"],
        "email": user["email"],
        "otp": otp,
        "purpose": inp.purpose,
        "used": False,
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat(),
        "created_at": utcnow_iso(),
    })
    html = f"""
    <div style='font-family:Inter,Arial,sans-serif;background:#09090b;color:#fafafa;padding:32px'>
      <h2 style='font-size:22px;margin:0 0 12px'>ACOS — verification code</h2>
      <p style='color:#a1a1aa'>Your one-time code for <b>{inp.purpose}</b> action:</p>
      <div style='background:#18181b;border:1px solid #27272a;padding:24px;border-radius:8px;text-align:center;letter-spacing:8px;font-size:32px;font-weight:800;margin:16px 0'>
        {otp}
      </div>
      <p style='color:#71717a;font-size:12px'>Expires in 5 minutes.</p>
    </div>"""
    await send_email(user["email"], f"ACOS code · {otp}", html, purpose=f"otp-{inp.purpose}")
    await audit(user["email"], "otp_requested", "auth", f"OTP requested for {inp.purpose}")
    # For demo without Resend key: return the otp so frontend can auto-fill (gated behind DEBUG_OTP=true).
    return {"ok": True, "demo_hint": otp if (not RESEND_API_KEY and os.environ.get("DEBUG_OTP", "true").lower() == "true") else None}


@api_router.post("/auth/otp/verify")
async def verify_otp(inp: OtpVerifyInput, user: dict = Depends(current_user)):
    doc = await db.otps.find_one({
        "email": user["email"], "otp": inp.otp, "purpose": inp.purpose, "used": False,
    })
    if not doc:
        raise HTTPException(400, "Invalid or expired code")
    if datetime.now(timezone.utc) > datetime.fromisoformat(doc["expires_at"]):
        raise HTTPException(400, "Code expired")
    await db.otps.update_one({"id": doc["id"]}, {"$set": {"used": True}})
    # Issue short-lived elevated token (15 min) with purpose claim
    step_up = jwt.encode({
        "sub": user["id"], "role": user["role"], "purpose": inp.purpose,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
    }, JWT_SECRET, algorithm=JWT_ALG)
    await audit(user["email"], "otp_verified", "auth", f"OTP verified for {inp.purpose}")
    return {"ok": True, "step_up_token": step_up}


def require_step_up(purpose: str):
    async def _dep(x_otp_token: Optional[str] = Header(None), user: dict = Depends(current_user)):
        if _role(user) == "admin":
            # Admin must present step-up token for restricted actions
            if not x_otp_token:
                raise HTTPException(428, "Step-up (OTP) required")
            try:
                payload = jwt.decode(x_otp_token, JWT_SECRET, algorithms=[JWT_ALG])
            except jwt.PyJWTError:
                raise HTTPException(428, "Invalid step-up token")
            if payload.get("purpose") != purpose or payload.get("sub") != user["id"]:
                raise HTTPException(428, "Step-up purpose mismatch")
        return user
    return _dep


# ---------------------------------------------------------------- Dashboard

@api_router.get("/dashboard/kpis")
async def dashboard_kpis(user: dict = Depends(current_user)):
    counts = {
        "employees": await db.employees.count_documents({}),
        "invoices": await db.invoices.count_documents({}),
        "inventory_items": await db.inventory.count_documents({}),
        "leads": await db.leads.count_documents({}),
        "pending_approvals": await db.approvals.count_documents({"status": "pending"}),
        "active_agents": await db.agents.count_documents({"status": "active"}),
    }
    revenue = 0
    async for inv in db.invoices.find({"status": "paid"}, {"_id": 0, "amount": 1}):
        revenue += float(inv.get("amount") or 0)
    counts["revenue"] = revenue
    counts["cash_burn"] = revenue * 0.42  # simple mock
    counts["confidence_avg"] = 87
    return counts


# ---------------------------------------------------------------- Generic module fetchers

async def _list(collection: str) -> List[dict]:
    return await db[collection].find({"is_deleted": {"$ne": True}}, {"_id": 0, "history": 0}).to_list(500)


@api_router.get("/agents")
async def list_agents(user: dict = Depends(current_user)):
    return await _list("agents")


@api_router.get("/hr/employees")
async def list_employees(user: dict = Depends(current_user)):
    items = await _list("employees")
    return filter_by_role(items, user, self_field="email")


@api_router.get("/hr/leaves")
async def list_leaves(user: dict = Depends(current_user)):
    items = await _list("leaves")
    if _role(user) == "employee":
        # Employees see only their own leaves (match by name — seed uses name)
        return [x for x in items if x.get("employee") == user.get("name")]
    return items


@api_router.get("/finance/invoices")
async def list_invoices(user: dict = Depends(current_user)):
    if _role(user) == "employee":
        raise HTTPException(403, "Employees cannot view invoices")
    return await _list("invoices")


@api_router.get("/inventory")
async def list_inventory(user: dict = Depends(current_user)):
    return await _list("inventory")


@api_router.get("/sales/leads")
async def list_leads(user: dict = Depends(current_user)):
    if _role(user) == "employee":
        raise HTTPException(403, "Employees cannot view sales pipeline")
    return await _list("leads")


@api_router.get("/compliance/contracts")
async def list_contracts(user: dict = Depends(current_user)):
    if _role(user) == "employee":
        raise HTTPException(403, "Employees cannot view contracts")
    return await _list("contracts")


@api_router.get("/approvals")
async def list_approvals(user: dict = Depends(current_user)):
    if _role(user) == "employee":
        raise HTTPException(403, "Employees cannot view the approvals queue")
    return await _list("approvals")


@api_router.get("/audit-logs")
async def list_audit(user: dict = Depends(current_user)):
    logs = await db.audit_logs.find({}, {"_id": 0}).sort("timestamp", -1).to_list(200)
    return logs


@api_router.get("/analytics/summary")
async def analytics_summary(user: dict = Depends(current_user)):
    # produce simple monthly trends
    months = ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb"]
    revenue = [42000, 51000, 48500, 62000, 71500, 82300]
    approvals = [12, 18, 15, 22, 26, 31]
    agent_runs = [140, 189, 220, 267, 340, 402]
    return {
        "months": months,
        "revenue": revenue,
        "approvals": approvals,
        "agent_runs": agent_runs,
        "anomalies": [
            {"id": "a1", "module": "Finance", "severity": "high", "message": "Invoice #INV-2041 amount 4.2x higher than supplier average."},
            {"id": "a2", "module": "Inventory", "severity": "medium", "message": "SKU CBL-USB-C predicted stockout in 6 days."},
            {"id": "a3", "module": "HR", "severity": "low", "message": "Overtime hours up 18% in Ops team this week."},
        ]
    }


# ---------------------------------------------------------------- CRUD writes (admin/manager only)

class EmployeeIn(BaseModel):
    name: str
    role: str = "Employee"
    team: str = "General"
    email: EmailStr
    status: str = "present"
    attendance: int = 100

class LeaveIn(BaseModel):
    employee: str
    type: str = "Vacation"
    days: int = 1
    start: str
    status: str = "pending"

class InvoiceIn(BaseModel):
    number: str
    vendor: str
    amount: float
    status: str = "unpaid"
    due: str

class InventoryIn(BaseModel):
    sku: str
    name: str
    stock: int
    reorder_at: int
    supplier: str

class LeadIn(BaseModel):
    name: str
    contact: str
    score: int = 50
    stage: str = "qualification"
    value: float = 0

class ContractIn(BaseModel):
    title: str
    party: str
    expires: str
    risk: str = "low"


def _require_writer(user: dict):
    if not can_write(user):
        raise HTTPException(403, "Only admin/manager can modify data")


_PROTECTED_KEYS = {"id", "_id", "history", "is_deleted", "deleted_at", "deleted_by", "created_at", "created_by"}
_CRUD_COLLECTIONS = {"employees", "leaves", "invoices", "inventory", "leads", "contracts"}


async def _crud_create(collection: str, doc: dict, user: dict, label: str) -> dict:
    _require_writer(user)
    doc = {**doc, "id": new_id(), "created_at": utcnow_iso(), "created_by": user["email"], "is_deleted": False}
    await db[collection].insert_one(doc)
    doc.pop("_id", None)
    await audit(user["email"], "create", collection, f"Created {label}: {doc.get('name') or doc.get('number') or doc.get('sku') or doc.get('title') or doc['id']}")
    return doc


async def _crud_update(collection: str, id_: str, patch: dict, user: dict, label: str) -> dict:
    _require_writer(user)
    prev = await db[collection].find_one({"id": id_, "is_deleted": {"$ne": True}})
    if not prev:
        raise HTTPException(404, "Not found")
    # Strip protected keys from patch
    clean = {k: v for k, v in patch.items() if k not in _PROTECTED_KEYS}
    if not clean:
        raise HTTPException(400, "No editable fields provided")
    # Version snapshot: previous doc minus protected/history keys
    snapshot = {k: v for k, v in prev.items() if k not in _PROTECTED_KEYS and k != "updated_at" and k != "updated_by"}
    snapshot["_version_at"] = utcnow_iso()
    snapshot["_version_by"] = user["email"]
    clean["updated_at"] = utcnow_iso()
    clean["updated_by"] = user["email"]
    await db[collection].update_one(
        {"id": id_},
        {"$set": clean, "$push": {"history": {"$each": [snapshot], "$slice": -10}}},
    )
    updated = await db[collection].find_one({"id": id_}, {"_id": 0, "history": 0})
    await audit(user["email"], "update", collection, f"Updated {label}/{id_} · fields: {', '.join(clean.keys())}")
    return updated


async def _crud_delete(collection: str, id_: str, user: dict) -> dict:
    """Soft-delete: mark is_deleted=true. Recover via /restore."""
    _require_writer(user)
    res = await db[collection].update_one(
        {"id": id_, "is_deleted": {"$ne": True}},
        {"$set": {"is_deleted": True, "deleted_at": utcnow_iso(), "deleted_by": user["email"]}},
    )
    if not res.matched_count:
        raise HTTPException(404, "Not found")
    await audit(user["email"], "delete", collection, f"Soft-deleted {collection}/{id_}")
    return {"ok": True, "soft_deleted": True}


async def _crud_restore(collection: str, id_: str, user: dict) -> dict:
    _require_writer(user)
    res = await db[collection].update_one(
        {"id": id_, "is_deleted": True},
        {"$set": {"is_deleted": False}, "$unset": {"deleted_at": "", "deleted_by": ""}},
    )
    if not res.matched_count:
        raise HTTPException(404, "Not in trash")
    await audit(user["email"], "restore", collection, f"Restored {collection}/{id_}")
    return {"ok": True}


@api_router.get("/trash/{collection}")
async def list_trash(collection: str, user: dict = Depends(current_user)):
    if collection not in _CRUD_COLLECTIONS:
        raise HTTPException(404, "Unknown collection")
    if _role(user) not in {"admin", "manager", "auditor"}:
        raise HTTPException(403, "Only admin/manager/auditor")
    return await db[collection].find({"is_deleted": True}, {"_id": 0, "history": 0}).sort("deleted_at", -1).to_list(200)


@api_router.post("/trash/{collection}/{id}/restore")
async def restore_item(collection: str, id: str, user: dict = Depends(current_user)):
    if collection not in _CRUD_COLLECTIONS:
        raise HTTPException(404, "Unknown collection")
    return await _crud_restore(collection, id, user)


@api_router.get("/history/{collection}/{id}")
async def get_history(collection: str, id: str, user: dict = Depends(current_user)):
    if collection not in _CRUD_COLLECTIONS:
        raise HTTPException(404, "Unknown collection")
    doc = await db[collection].find_one({"id": id}, {"_id": 0, "history": 1})
    if not doc:
        raise HTTPException(404, "Not found")
    return {"history": doc.get("history", [])}


# --- CSV import (bulk) ---
import csv as _csv
import io as _io

@api_router.post("/import/{collection}")
async def import_csv(collection: str, file: UploadFile = File(...), user: dict = Depends(current_user)):
    if collection not in _CRUD_COLLECTIONS:
        raise HTTPException(404, "Unknown collection")
    _require_writer(user)
    raw = await file.read()
    if len(raw) > 2 * 1024 * 1024:
        raise HTTPException(413, "CSV too large (max 2 MB)")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")
    reader = _csv.DictReader(_io.StringIO(text))
    numeric_keys = {"amount", "value", "stock", "reorder_at", "score", "attendance", "days"}
    rows = []
    errors = []
    for i, row in enumerate(reader, start=2):
        doc = {k.strip(): (v.strip() if isinstance(v, str) else v) for k, v in row.items() if k}
        for k in list(doc.keys()):
            if k in numeric_keys and doc[k] not in (None, ""):
                try:
                    doc[k] = float(doc[k]) if k in {"amount", "value"} else int(float(doc[k]))
                except ValueError:
                    errors.append(f"Row {i}: '{k}' is not a number")
        doc.update({
            "id": new_id(), "created_at": utcnow_iso(),
            "created_by": user["email"], "is_deleted": False, "imported": True,
        })
        rows.append(doc)
    if rows:
        await db[collection].insert_many(rows)
        await audit(user["email"], "import", collection, f"Imported {len(rows)} rows via CSV")
    return {"ok": True, "imported": len(rows), "errors": errors[:20]}


# --- Original CRUD write endpoints ---


# --- HR ---
@api_router.post("/hr/employees")
async def create_employee(inp: EmployeeIn, user: dict = Depends(current_user)):
    return await _crud_create("employees", inp.model_dump(), user, "employee")

@api_router.put("/hr/employees/{id}")
async def update_employee(id: str, patch: Dict[str, Any], user: dict = Depends(current_user)):
    return await _crud_update("employees", id, patch, user, "employee")

@api_router.delete("/hr/employees/{id}")
async def delete_employee(id: str, user: dict = Depends(current_user)):
    return await _crud_delete("employees", id, user)

@api_router.post("/hr/leaves")
async def create_leave(inp: LeaveIn, user: dict = Depends(current_user)):
    return await _crud_create("leaves", inp.model_dump(), user, "leave")

@api_router.put("/hr/leaves/{id}")
async def update_leave(id: str, patch: Dict[str, Any], user: dict = Depends(current_user)):
    return await _crud_update("leaves", id, patch, user, "leave")

@api_router.delete("/hr/leaves/{id}")
async def delete_leave(id: str, user: dict = Depends(current_user)):
    return await _crud_delete("leaves", id, user)

# --- Finance ---
@api_router.post("/finance/invoices")
async def create_invoice(inp: InvoiceIn, user: dict = Depends(current_user)):
    return await _crud_create("invoices", inp.model_dump(), user, "invoice")

@api_router.put("/finance/invoices/{id}")
async def update_invoice(id: str, patch: Dict[str, Any], user: dict = Depends(current_user)):
    return await _crud_update("invoices", id, patch, user, "invoice")

@api_router.delete("/finance/invoices/{id}")
async def delete_invoice(id: str, user: dict = Depends(current_user)):
    return await _crud_delete("invoices", id, user)

# --- Inventory ---
@api_router.post("/inventory")
async def create_inventory(inp: InventoryIn, user: dict = Depends(current_user)):
    return await _crud_create("inventory", inp.model_dump(), user, "SKU")

@api_router.put("/inventory/{id}")
async def update_inventory(id: str, patch: Dict[str, Any], user: dict = Depends(current_user)):
    return await _crud_update("inventory", id, patch, user, "SKU")

@api_router.delete("/inventory/{id}")
async def delete_inventory(id: str, user: dict = Depends(current_user)):
    return await _crud_delete("inventory", id, user)

# --- Sales ---
@api_router.post("/sales/leads")
async def create_lead(inp: LeadIn, user: dict = Depends(current_user)):
    return await _crud_create("leads", inp.model_dump(), user, "lead")

@api_router.put("/sales/leads/{id}")
async def update_lead(id: str, patch: Dict[str, Any], user: dict = Depends(current_user)):
    return await _crud_update("leads", id, patch, user, "lead")

@api_router.delete("/sales/leads/{id}")
async def delete_lead(id: str, user: dict = Depends(current_user)):
    return await _crud_delete("leads", id, user)

# --- Compliance ---
@api_router.post("/compliance/contracts")
async def create_contract(inp: ContractIn, user: dict = Depends(current_user)):
    return await _crud_create("contracts", inp.model_dump(), user, "contract")

@api_router.put("/compliance/contracts/{id}")
async def update_contract(id: str, patch: Dict[str, Any], user: dict = Depends(current_user)):
    return await _crud_update("contracts", id, patch, user, "contract")

@api_router.delete("/compliance/contracts/{id}")
async def delete_contract(id: str, user: dict = Depends(current_user)):
    return await _crud_delete("contracts", id, user)


# ---------------------------------------------------------------- Approvals actions

class ApprovalDecision(BaseModel):
    decision: str  # "approve" | "reject"
    note: Optional[str] = ""


@api_router.post("/approvals/{approval_id}/decide")
async def decide_approval(approval_id: str, inp: ApprovalDecision, user: dict = Depends(require_step_up("approval"))):
    if user["role"] not in {"admin", "manager"}:
        raise HTTPException(403, "Only admin/manager can decide")
    if inp.decision not in {"approve", "reject"}:
        raise HTTPException(400, "Invalid decision")
    new_status = "approved" if inp.decision == "approve" else "rejected"
    res = await db.approvals.update_one(
        {"id": approval_id},
        {"$set": {"status": new_status, "decided_by": user["email"], "decided_at": utcnow_iso(), "note": inp.note}},
    )
    if not res.matched_count:
        raise HTTPException(404, "Approval not found")
    approval = await db.approvals.find_one({"id": approval_id}, {"_id": 0})
    await audit(user["email"], f"approval_{new_status}", "approvals", f"Approval {approval_id} {new_status}")

    # Notify the requester if we have their email
    if approval and approval.get("requested_by") and "@" in approval["requested_by"]:
        html = f"""
        <div style='font-family:Inter,Arial,sans-serif;background:#09090b;color:#fafafa;padding:32px'>
          <div style='color:#06b6d4;font-size:11px;letter-spacing:3px;text-transform:uppercase'>ACOS · Approval {new_status}</div>
          <h2 style='margin:6px 0 12px'>{approval.get('title')}</h2>
          <p style='color:#a1a1aa'>Decided by {user['email']} at {utcnow_iso()}.</p>
          <p style='color:#71717a;font-size:12px'>Note: {inp.note or '—'}</p>
        </div>"""
        await send_email(approval["requested_by"], f"[ACOS] Approval {new_status}", html, purpose="approval-notice")
    return {"ok": True, "status": new_status}


# ---------------------------------------------------------------- Agent execution (LLM-driven)

class AgentRunInput(BaseModel):
    goal: Optional[str] = None


AGENT_SYS_PROMPTS = {
    "orchestrator": "You are the Orchestrator, the central brain of ACOS. Decompose the goal into 3 concrete sub-tasks and pick which specialist agent (HR, Finance, Inventory, Sales, Compliance) executes each. You will be given a JSON snapshot of the company. Reference concrete numbers from it.",
    "hr": "You are the HR Agent. You will receive a JSON snapshot of employees and leave requests. Reference specific employees by name and cite the actual attendance/status numbers. Recommend a concrete action.",
    "finance": "You are the Finance Agent. You will receive a JSON snapshot of invoices. Cite specific invoice numbers, amounts and vendors. Flag overdue or anomalous invoices.",
    "inventory": "You are the Inventory Agent. You will receive a JSON snapshot of SKUs, current stock and reorder thresholds. Name specific SKUs that need reorder and quantify how many units.",
    "sales": "You are the Sales/CRM Agent. You will receive a JSON snapshot of leads. Prioritise the highest-value leads and recommend a next action for each.",
    "compliance": "You are the Compliance Agent. You will receive a JSON snapshot of contracts. Flag high-risk contracts and expiring deadlines by title.",
}


async def _agent_context(agent_key: str) -> Dict[str, Any]:
    """Fetch the data slice the agent should reason over."""
    def _slim(docs, keep):
        return [{k: d.get(k) for k in keep} for d in docs]

    if agent_key == "hr":
        emps = await db.employees.find({}, {"_id": 0}).to_list(200)
        leaves = await db.leaves.find({}, {"_id": 0}).to_list(200)
        return {
            "employees": _slim(emps, ["name", "role", "team", "status", "attendance"]),
            "leaves": _slim(leaves, ["employee", "type", "days", "status", "start"]),
        }
    if agent_key == "finance":
        inv = await db.invoices.find({}, {"_id": 0}).to_list(200)
        return {"invoices": _slim(inv, ["number", "vendor", "amount", "status", "due"])}
    if agent_key == "inventory":
        items = await db.inventory.find({}, {"_id": 0}).to_list(200)
        return {"inventory": _slim(items, ["sku", "name", "stock", "reorder_at", "supplier"])}
    if agent_key == "sales":
        leads = await db.leads.find({}, {"_id": 0}).to_list(200)
        return {"leads": _slim(leads, ["name", "contact", "score", "stage", "value"])}
    if agent_key == "compliance":
        contracts = await db.contracts.find({}, {"_id": 0}).to_list(200)
        return {"contracts": _slim(contracts, ["title", "party", "expires", "risk"])}
    if agent_key == "orchestrator":
        return {
            "counts": {
                "employees": await db.employees.count_documents({}),
                "invoices": await db.invoices.count_documents({}),
                "inventory": await db.inventory.count_documents({}),
                "leads": await db.leads.count_documents({}),
                "contracts": await db.contracts.count_documents({}),
                "pending_approvals": await db.approvals.count_documents({"status": "pending"}),
            }
        }
    return {}


@api_router.get("/agents/{agent_key}/context")
async def agent_context(agent_key: str, user: dict = Depends(current_user)):
    """Preview the data slice an agent will see when it runs."""
    if agent_key not in AGENT_SYS_PROMPTS:
        raise HTTPException(404, "Unknown agent")
    return await _agent_context(agent_key)


async def _llm_reason(agent_key: str, goal: str) -> Dict[str, Any]:
    """Call Claude Sonnet 4.6 via emergentintegrations, injecting the agent's data context."""
    system = AGENT_SYS_PROMPTS.get(agent_key, "You are a helpful business AI agent.")
    import json as _json
    context = await _agent_context(agent_key)
    context_str = _json.dumps(context, indent=2, default=str)
    if len(context_str) > 8000:
        context_str = context_str[:8000] + "\n… (truncated)"
    prompt = (
        f"COMPANY DATA (authoritative — use these exact numbers):\n{context_str}\n\n"
        f"USER GOAL: {goal}\n\n"
        "Ground every claim in the data above. Do NOT invent employees, SKUs, invoices or contracts.\n"
        "If a required data point is missing, say so explicitly.\n\n"
        "Return in EXACTLY this format:\n"
        "REASONING: <2-4 sentences citing specific data points>\n"
        "ACTION: <single concrete next action>\n"
        "CONFIDENCE: <0-100>\n"
        "ESCALATE: <yes/no> — say yes only if high-risk (>$5000, firing, contract signing, or data insufficient)."
    )
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"acos-{agent_key}-{new_id()[:8]}",
            system_message=system,
        ).with_model("anthropic", "claude-sonnet-4-6")
        resp = await chat.send_message(UserMessage(text=prompt))
        text = str(resp)
    except Exception as e:
        logging.exception("LLM call failed")
        text = (
            "REASONING: Unable to reach LLM; using deterministic fallback.\n"
            f"ACTION: Log the goal '{goal}' for manual review.\n"
            "CONFIDENCE: 55\nESCALATE: yes"
        )
    # Extract confidence + escalate
    confidence = 75
    escalate = False
    for line in text.splitlines():
        low = line.strip().lower()
        if low.startswith("confidence:"):
            try:
                confidence = int("".join(c for c in low.split(":", 1)[1] if c.isdigit()) or 75)
            except Exception:
                pass
        if low.startswith("escalate:"):
            escalate = "yes" in low
    return {"raw": text, "confidence": min(max(confidence, 0), 100), "escalate": escalate}


@api_router.post("/agents/{agent_key}/run")
async def run_agent(agent_key: str, inp: AgentRunInput, user: dict = Depends(current_user)):
    if agent_key not in AGENT_SYS_PROMPTS:
        raise HTTPException(404, "Unknown agent")
    goal = sanitize_input(inp.goal or "Perform routine check for anomalies and produce daily digest.")
    result = await _llm_reason(agent_key, goal)

    task_id = new_id()
    task_doc = {
        "id": task_id,
        "agent": agent_key,
        "goal": goal,
        "reasoning": result["raw"],
        "confidence": result["confidence"],
        "escalate": result["escalate"],
        "status": "pending_approval" if result["escalate"] else "completed",
        "actor": user["email"],
        "created_at": utcnow_iso(),
    }
    await db.agent_tasks.insert_one(task_doc)

    if result["escalate"]:
        approval_doc = {
            "id": new_id(),
            "task_id": task_id,
            "agent": agent_key,
            "title": f"{agent_key.title()} Agent escalation",
            "summary": (result["raw"][:280] + "…") if len(result["raw"]) > 280 else result["raw"],
            "confidence": result["confidence"],
            "requested_by": user["email"],
            "status": "pending",
            "created_at": utcnow_iso(),
        }
        await db.approvals.insert_one(approval_doc)

    await db.agents.update_one(
        {"key": agent_key},
        {"$set": {"last_run": utcnow_iso(), "last_confidence": result["confidence"]}},
    )
    await audit(user["email"], "agent_run", "agents", f"Ran {agent_key} agent — conf {result['confidence']}", agent=agent_key)
    task_doc.pop("_id", None)
    return task_doc


@api_router.get("/agents/{agent_key}/tasks")
async def agent_tasks(agent_key: str, user: dict = Depends(current_user)):
    return await db.agent_tasks.find({"agent": agent_key}, {"_id": 0}).sort("created_at", -1).to_list(50)


@api_router.delete("/agents/tasks/{task_id}")
async def delete_agent_task(task_id: str, user: dict = Depends(current_user)):
    """Hard-delete a reasoning task. Anyone authenticated can clear their own workspace."""
    task = await db.agent_tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(404, "Task not found")
    if _role(user) not in {"admin", "manager"} and task.get("actor") != user["email"]:
        raise HTTPException(403, "You can only delete your own tasks")
    await db.agent_tasks.delete_one({"id": task_id})
    # Also delete any follow-up replies tied to this task
    await db.agent_tasks.delete_many({"parent_id": task_id})
    await audit(user["email"], "task_delete", "agents", f"Deleted task {task_id}", agent=task.get("agent"))
    return {"ok": True}


class FollowUpInput(BaseModel):
    question: str


@api_router.post("/agents/tasks/{task_id}/follow-up")
async def agent_follow_up(task_id: str, inp: FollowUpInput, user: dict = Depends(current_user)):
    """Ask a follow-up question against a previous agent task. Uses same data context + prior reasoning."""
    parent = await db.agent_tasks.find_one({"id": task_id}, {"_id": 0})
    if not parent:
        raise HTTPException(404, "Task not found")
    agent_key = parent["agent"]
    system = AGENT_SYS_PROMPTS.get(agent_key, "You are a helpful business AI agent.")
    context = await _agent_context(agent_key)
    import json as _json
    ctx_str = _json.dumps(context, indent=2, default=str)
    if len(ctx_str) > 6000:
        ctx_str = ctx_str[:6000] + "\n… (truncated)"
    q = sanitize_input(inp.question, max_len=2000)
    prompt = (
        f"COMPANY DATA:\n{ctx_str}\n\n"
        f"PREVIOUS AGENT REASONING (task {task_id}):\n{parent.get('reasoning', '')}\n\n"
        f"USER FOLLOW-UP: {q}\n\n"
        "Continue the conversation. Cite specific records from the data.\n"
        "Return EXACTLY:\n"
        "REASONING: <2-4 sentences>\n"
        "ACTION: <concrete next step>\n"
        "CONFIDENCE: <0-100>\n"
        "ESCALATE: <yes/no>"
    )
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"acos-followup-{task_id}-{new_id()[:6]}",
            system_message=system,
        ).with_model("anthropic", "claude-sonnet-4-6")
        resp = await chat.send_message(UserMessage(text=prompt))
        text = str(resp)
    except Exception:
        logging.exception("Follow-up LLM call failed")
        text = "REASONING: Unable to reach LLM.\nACTION: Retry.\nCONFIDENCE: 50\nESCALATE: yes"

    # Parse confidence/escalate
    confidence = 75
    escalate = False
    for line in text.splitlines():
        low = line.strip().lower()
        if low.startswith("confidence:"):
            try:
                confidence = int("".join(c for c in low.split(":", 1)[1] if c.isdigit()) or 75)
            except Exception:
                pass
        if low.startswith("escalate:"):
            escalate = "yes" in low

    reply_id = new_id()
    reply = {
        "id": reply_id,
        "parent_id": task_id,
        "agent": agent_key,
        "goal": inp.question,
        "reasoning": text,
        "confidence": min(max(confidence, 0), 100),
        "escalate": escalate,
        "status": "completed",
        "actor": user["email"],
        "created_at": utcnow_iso(),
        "kind": "follow_up",
    }
    await db.agent_tasks.insert_one(reply)
    await audit(user["email"], "follow_up", "agents", f"Follow-up on task {task_id}", agent=agent_key)
    reply.pop("_id", None)
    return reply


# ---------------------------------------------------------------- Agent schedules (P1: background runs)

class ScheduleInput(BaseModel):
    enabled: bool
    cadence_minutes: int
    goal: Optional[str] = None


@api_router.get("/schedules")
async def list_schedules(user: dict = Depends(current_user)):
    docs = await db.schedules.find({}, {"_id": 0}).to_list(50)
    return docs


@api_router.put("/schedules/{agent_key}")
async def update_schedule(agent_key: str, inp: ScheduleInput, user: dict = Depends(current_user)):
    if _role(user) != "admin":
        raise HTTPException(403, "Only admin can configure schedules")
    if agent_key not in AGENT_SYS_PROMPTS:
        raise HTTPException(404, "Unknown agent")
    if inp.cadence_minutes < 1 or inp.cadence_minutes > 1440:
        raise HTTPException(400, "cadence_minutes must be 1..1440")
    doc = {
        "agent_key": agent_key,
        "enabled": inp.enabled,
        "cadence_minutes": inp.cadence_minutes,
        "goal": inp.goal or "Perform routine background check and produce digest.",
        "next_run_at": (datetime.now(timezone.utc) + timedelta(minutes=inp.cadence_minutes)).isoformat(),
        "updated_by": user["email"],
        "updated_at": utcnow_iso(),
    }
    await db.schedules.update_one({"agent_key": agent_key}, {"$set": doc}, upsert=True)
    await audit(user["email"], "schedule_update", "settings", f"Schedule for {agent_key}: enabled={inp.enabled}, cadence={inp.cadence_minutes}m")
    return doc


async def _scheduler_loop():
    """Background poller — runs every 30 seconds and dispatches any due scheduled agent."""
    while True:
        try:
            now = datetime.now(timezone.utc)
            async for sched in db.schedules.find({"enabled": True}):
                try:
                    nxt = datetime.fromisoformat(sched["next_run_at"])
                except Exception:
                    continue
                if now >= nxt:
                    agent_key = sched["agent_key"]
                    goal = sanitize_input(sched.get("goal") or "Routine background check")
                    result = await _llm_reason(agent_key, goal)
                    task_doc = {
                        "id": new_id(), "agent": agent_key, "goal": goal,
                        "reasoning": result["raw"], "confidence": result["confidence"],
                        "escalate": result["escalate"],
                        "status": "pending_approval" if result["escalate"] else "completed",
                        "actor": "scheduler@acos.io", "created_at": utcnow_iso(),
                    }
                    await db.agent_tasks.insert_one(task_doc)
                    if result["escalate"]:
                        await db.approvals.insert_one({
                            "id": new_id(), "task_id": task_doc["id"], "agent": agent_key,
                            "title": f"[Scheduled] {agent_key.title()} escalation",
                            "summary": (result["raw"][:280] + "…") if len(result["raw"]) > 280 else result["raw"],
                            "confidence": result["confidence"], "requested_by": "scheduler@acos.io",
                            "status": "pending", "created_at": utcnow_iso(),
                        })
                    await db.schedules.update_one(
                        {"agent_key": agent_key},
                        {"$set": {
                            "last_run_at": utcnow_iso(),
                            "next_run_at": (now + timedelta(minutes=sched["cadence_minutes"])).isoformat(),
                        }},
                    )
                    await audit("scheduler@acos.io", "scheduled_run", "agents", f"Scheduled {agent_key} run — conf {result['confidence']}", agent=agent_key)
        except Exception:
            logging.exception("scheduler tick failed")
        await asyncio.sleep(30)


# ---------------------------------------------------------------- File uploads (Emergent object storage)

@api_router.post("/files/upload")
async def upload_file(
    file: UploadFile = File(...),
    attach_to: Optional[str] = Query(None),  # "invoice:<id>" or "contract:<id>"
    user: dict = Depends(current_user),
):
    if not can_write(user):
        raise HTTPException(403, "Only admin/manager can upload files")
    ext = (file.filename.split(".")[-1] if file.filename and "." in file.filename else "bin").lower()
    if ext not in {"pdf", "png", "jpg", "jpeg", "webp", "csv", "txt"}:
        raise HTTPException(400, "Unsupported file type")
    path = f"{APP_NAME}/uploads/{user['id']}/{new_id()}.{ext}"
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 10 MB)")
    result = put_object(path, data, file.content_type or "application/octet-stream")
    file_id = new_id()
    doc = {
        "id": file_id,
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": file.content_type,
        "size": result.get("size", len(data)),
        "uploaded_by": user["email"],
        "is_deleted": False,
        "created_at": utcnow_iso(),
    }
    await db.files.insert_one(doc)

    # Optional attachment linking
    if attach_to and ":" in attach_to:
        kind, target_id = attach_to.split(":", 1)
        collection = {"invoice": "invoices", "contract": "contracts"}.get(kind)
        if collection:
            await db[collection].update_one({"id": target_id}, {"$push": {"attachments": file_id}})
    await audit(user["email"], "file_upload", "storage", f"Uploaded {file.filename} ({doc['size']} bytes)")
    doc.pop("_id", None)
    return doc


@api_router.get("/files/{file_id}/download")
async def download_file(file_id: str, user: dict = Depends(current_user)):
    rec = await db.files.find_one({"id": file_id, "is_deleted": False}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "File not found")
    data, ct = get_object(rec["storage_path"])
    return Response(content=data, media_type=rec.get("content_type") or ct)


@api_router.get("/files")
async def list_files(user: dict = Depends(current_user)):
    return await db.files.find({"is_deleted": False}, {"_id": 0}).sort("created_at", -1).to_list(200)


@api_router.get("/emails")
async def list_emails(user: dict = Depends(current_user)):
    """Debug view of all emails ACOS has queued (real or console-mocked)."""
    if _role(user) not in {"admin", "auditor"}:
        raise HTTPException(403, "Only admin/auditor")
    docs = await db.emails.find({}, {"_id": 0, "html": 0}).sort("sent_at", -1).to_list(100)
    return docs


# ---------------------------------------------------------------- Seed

async def seed():
    # Backfill: ensure schedules exist even if users are already seeded
    if await db.schedules.count_documents({}) == 0:
        schedules = [
            {"agent_key": k, "enabled": False, "cadence_minutes": 60,
             "goal": "Perform routine background check and produce digest.",
             "next_run_at": (datetime.now(timezone.utc) + timedelta(minutes=60)).isoformat(),
             "updated_by": "system", "updated_at": utcnow_iso()}
            for k in ["orchestrator", "hr", "finance", "inventory", "sales", "compliance"]
        ]
        await db.schedules.insert_many(schedules)
    if await db.users.count_documents({}) > 0:
        return
    users = [
        {"email": "admin@acos.io", "name": "Ava Reyes", "password": "admin123", "role": "admin",
         "avatar": "https://images.unsplash.com/photo-1560250097-0b93528c311a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA2ODl8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBidXNpbmVzcyUyMHBvcnRyYWl0JTIwaGVhZHNob3R8ZW58MHx8fHwxNzgzNzk3OTU0fDA&ixlib=rb-4.1.0&q=85"},
        {"email": "manager@acos.io", "name": "Marcus Nolan", "password": "manager123", "role": "manager",
         "avatar": "https://images.unsplash.com/photo-1652471943570-f3590a4e52ed?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA2ODl8MHwxfHNlYXJjaHwzfHxwcm9mZXNzaW9uYWwlMjBidXNpbmVzcyUyMHBvcnRyYWl0JTIwaGVhZHNob3R8ZW58MHx8fHwxNzgzNzk3OTU0fDA&ixlib=rb-4.1.0&q=85"},
        {"email": "employee@acos.io", "name": "Elena Park", "password": "employee123", "role": "employee",
         "avatar": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA2ODl8MHwxfHNlYXJjaHwyfHxwcm9mZXNzaW9uYWwlMjBidXNpbmVzcyUyMHBvcnRyYWl0JTIwaGVhZHNob3R8ZW58MHx8fHwxNzgzNzk3OTU0fDA&ixlib=rb-4.1.0&q=85"},
        {"email": "auditor@acos.io", "name": "Kenji Ito", "password": "auditor123", "role": "auditor",
         "avatar": "https://images.unsplash.com/photo-1685760259914-ee8d2c92d2e0?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA2ODl8MHwxfHNlYXJjaHw0fHxwcm9mZXNzaW9uYWwlMjBidXNpbmVzcyUyMHBvcnRyYWl0JTIwaGVhZHNob3R8ZW58MHx8fHwxNzgzNzk3OTU0fDA&ixlib=rb-4.1.0&q=85"},
    ]
    for u in users:
        u["id"] = new_id()
        u["password"] = hash_password(u["password"])
        u["created_at"] = utcnow_iso()
    await db.users.insert_many(users)

    agents = [
        {"key": "orchestrator", "name": "Orchestrator", "specialty": "Task decomposition & routing", "status": "active", "confidence": 92, "last_run": utcnow_iso()},
        {"key": "hr", "name": "HR Agent", "specialty": "Attendance, leaves, shift scheduling", "status": "active", "confidence": 88, "last_run": utcnow_iso()},
        {"key": "finance", "name": "Finance Agent", "specialty": "Invoices, expenses, cash-flow", "status": "active", "confidence": 84, "last_run": utcnow_iso()},
        {"key": "inventory", "name": "Inventory Agent", "specialty": "Stock, reorder, supply chain", "status": "active", "confidence": 91, "last_run": utcnow_iso()},
        {"key": "sales", "name": "Sales/CRM Agent", "specialty": "Lead scoring, follow-ups", "status": "idle", "confidence": 79, "last_run": utcnow_iso()},
        {"key": "compliance", "name": "Compliance Agent", "specialty": "Contracts, deadlines, risk", "status": "active", "confidence": 86, "last_run": utcnow_iso()},
    ]
    for a in agents:
        a["id"] = new_id()
    await db.agents.insert_many(agents)

    employees = [
        {"id": new_id(), "name": "Elena Park", "role": "Ops Engineer", "team": "Ops", "status": "present", "attendance": 96, "email": "elena@acos.io"},
        {"id": new_id(), "name": "Rohan Batra", "role": "Backend Dev", "team": "Engineering", "status": "on_leave", "attendance": 87, "email": "rohan@acos.io"},
        {"id": new_id(), "name": "Sara Aziz", "role": "Recruiter", "team": "HR", "status": "present", "attendance": 99, "email": "sara@acos.io"},
        {"id": new_id(), "name": "Diego Ramos", "role": "Sales Rep", "team": "Sales", "status": "present", "attendance": 94, "email": "diego@acos.io"},
        {"id": new_id(), "name": "Yuki Tanaka", "role": "Designer", "team": "Product", "status": "remote", "attendance": 92, "email": "yuki@acos.io"},
    ]
    await db.employees.insert_many(employees)

    leaves = [
        {"id": new_id(), "employee": "Rohan Batra", "type": "Sick leave", "days": 3, "status": "approved", "start": "2026-02-10"},
        {"id": new_id(), "employee": "Diego Ramos", "type": "Personal", "days": 2, "status": "pending", "start": "2026-02-22"},
        {"id": new_id(), "employee": "Yuki Tanaka", "type": "Vacation", "days": 7, "status": "pending", "start": "2026-03-04"},
    ]
    await db.leaves.insert_many(leaves)

    invoices = [
        {"id": new_id(), "number": "INV-2041", "vendor": "CloudNet Systems", "amount": 8420, "status": "paid", "due": "2026-01-15"},
        {"id": new_id(), "number": "INV-2042", "vendor": "PixelPress Print", "amount": 1250, "status": "paid", "due": "2026-01-22"},
        {"id": new_id(), "number": "INV-2043", "vendor": "Northwind Logistics", "amount": 15600, "status": "unpaid", "due": "2026-02-28"},
        {"id": new_id(), "number": "INV-2044", "vendor": "Aurora Design Studio", "amount": 6300, "status": "overdue", "due": "2026-01-08"},
        {"id": new_id(), "number": "INV-2045", "vendor": "Silverline Legal", "amount": 22400, "status": "paid", "due": "2026-02-01"},
    ]
    await db.invoices.insert_many(invoices)

    inventory = [
        {"id": new_id(), "sku": "CBL-USB-C", "name": "USB-C Cable 1m", "stock": 42, "reorder_at": 60, "supplier": "CableWorks"},
        {"id": new_id(), "sku": "MON-27-4K", "name": '27" 4K Monitor', "stock": 6, "reorder_at": 8, "supplier": "PixelHouse"},
        {"id": new_id(), "sku": "CHR-LTP-65", "name": "Laptop Charger 65W", "stock": 24, "reorder_at": 20, "supplier": "PowerPlus"},
        {"id": new_id(), "sku": "PEN-BLU-01", "name": "Blue Pen (pack of 12)", "stock": 130, "reorder_at": 50, "supplier": "OfficePro"},
        {"id": new_id(), "sku": "CHR-USB-45", "name": "USB-C Charger 45W", "stock": 3, "reorder_at": 10, "supplier": "PowerPlus"},
    ]
    await db.inventory.insert_many(inventory)

    leads = [
        {"id": new_id(), "name": "Northstar Robotics", "contact": "Priya Menon", "score": 92, "stage": "proposal", "value": 84000},
        {"id": new_id(), "name": "Meridian Bank", "contact": "Alan Cho", "score": 74, "stage": "discovery", "value": 220000},
        {"id": new_id(), "name": "Verdant Labs", "contact": "Chloe Green", "score": 61, "stage": "qualification", "value": 45000},
        {"id": new_id(), "name": "Orbital Health", "contact": "Sunil Rao", "score": 88, "stage": "negotiation", "value": 132000},
    ]
    await db.leads.insert_many(leads)

    contracts = [
        {"id": new_id(), "title": "SaaS Master Agreement — CloudNet", "party": "CloudNet Systems", "expires": "2026-06-30", "risk": "low"},
        {"id": new_id(), "title": "NDA — Meridian Bank", "party": "Meridian Bank", "expires": "2026-03-15", "risk": "medium"},
        {"id": new_id(), "title": "Supply Contract — Northwind", "party": "Northwind Logistics", "expires": "2026-02-28", "risk": "high"},
        {"id": new_id(), "title": "Employment Contract — Y. Tanaka", "party": "Internal", "expires": "2027-01-01", "risk": "low"},
    ]
    await db.contracts.insert_many(contracts)

    approvals = [
        {"id": new_id(), "task_id": new_id(), "agent": "finance", "title": "Payment > $10,000 to Northwind Logistics",
         "summary": "Finance Agent recommends releasing overdue payment INV-2043 ($15,600). Confidence 82. Escalated because amount exceeds $5k threshold.",
         "confidence": 82, "requested_by": "system@acos.io", "status": "pending", "created_at": utcnow_iso()},
        {"id": new_id(), "task_id": new_id(), "agent": "hr", "title": "Terminate contract — probation review",
         "summary": "HR Agent flagged an underperforming trainee (30% goal completion). Escalated for manager judgment.",
         "confidence": 68, "requested_by": "system@acos.io", "status": "pending", "created_at": utcnow_iso()},
        {"id": new_id(), "task_id": new_id(), "agent": "inventory", "title": "Emergency reorder — 27\" 4K Monitor",
         "summary": "Inventory Agent predicts stockout in 3 days. Reorder 20 units at $410 each = $8,200.",
         "confidence": 91, "requested_by": "system@acos.io", "status": "pending", "created_at": utcnow_iso()},
    ]
    await db.approvals.insert_many(approvals)

    await audit("system", "seed", "system", "Initial demo data seeded")


async def bootstrap_admin():
    """Ensure BOOTSTRAP_ADMIN_EMAIL exists as an admin. Idempotent: promotes if already present, creates otherwise.
    Also sets/refreshes the password to BOOTSTRAP_ADMIN_PASSWORD so the user can sign in with either
    the password OR their Google account.
    """
    email = os.environ.get("BOOTSTRAP_ADMIN_EMAIL", "").strip().lower()
    if not email:
        return
    name = os.environ.get("BOOTSTRAP_ADMIN_NAME", email.split("@")[0])
    pwd = os.environ.get("BOOTSTRAP_ADMIN_PASSWORD", "ChangeMe123!")
    existing = await db.users.find_one({"email": email})
    if existing:
        patch = {"role": "admin", "email_verified": True, "password": hash_password(pwd)}
        await db.users.update_one({"id": existing["id"]}, {"$set": patch})
        await audit("system", "bootstrap_admin", "auth", f"Bootstrap: ensured {email} is admin (password refreshed)")
        logging.info(f"Bootstrap: ensured {email} is admin — password refreshed to BOOTSTRAP_ADMIN_PASSWORD")
        return
    user_id = new_id()
    await db.users.insert_one({
        "id": user_id, "email": email, "name": name,
        "password": hash_password(pwd), "role": "admin",
        "avatar": None, "email_verified": True,
        "auth_provider": "password", "created_at": utcnow_iso(),
    })
    await audit("system", "user_create", "auth", f"Bootstrap: created admin {email}")
    logging.info(f"Bootstrap: created admin {email} (temporary password set — change on first login)")


@app.on_event("startup")
async def on_start():
    await seed()
    await bootstrap_admin()
    # Object storage init (best-effort)
    try:
        init_storage()
        logging.info("Object storage initialized")
    except Exception:
        logging.exception("Object storage init failed (uploads will 503)")
    # Skip long-running scheduler loop when running on serverless (Vercel)
    if not os.environ.get("VERCEL"):
        asyncio.create_task(_scheduler_loop())
    else:
        logging.info("Serverless environment detected — scheduler loop disabled (use Vercel Cron instead).")


# ----------------------------------------------------------------

app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
