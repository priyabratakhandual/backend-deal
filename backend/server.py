from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import io
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

import bcrypt
import jwt
import pandas as pd
import httpx
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.units import mm

# --- DB ---
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALG = "HS256"

app = FastAPI(title="Globtier Dealer Intelligence API")
api = APIRouter(prefix="/api")

# --- Helpers ---
def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()

def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False

def create_token(user_id: str, email: str, role: str, minutes: int = 60 * 24) -> str:
    payload = {
        "sub": user_id, "email": email, "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=minutes),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user

def require_role(*roles):
    async def checker(user: dict = Depends(get_current_user)):
        if user.get("role") not in roles and user.get("role") != "admin":
            raise HTTPException(403, "Insufficient permissions")
        return user
    return checker

# --- Models ---
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Literal["admin", "business_user", "data_entry", "viewer"] = "viewer"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class OutletMonthly(BaseModel):
    year: int
    month: int
    target: float = 0
    actual: float = 0

class Outlet(BaseModel):
    dealer_code: str
    state: str
    city: str
    tier: str
    start_of_business: str  # YYYY-MM-DD
    showroom_frontage: float = 0
    showroom_area: float = 0
    workshop_area: float = 0
    workshop_bays: int = 0
    bp_bays: int = 0
    showroom_ownership: Literal["Owned", "Leased"] = "Owned"
    workshop_ownership: Literal["Owned", "Leased"] = "Owned"
    monthly_sales: List[OutletMonthly] = []

class MonthlySales(BaseModel):
    year: int
    month: int  # 1-12
    target: float = 0
    actual: float = 0

class YearlyKPI(BaseModel):
    year: int
    gross_profit: float = 0  # INR Lacs
    ros: float = 0  # %
    oar: float = 0  # %
    ssi: float = 0
    dcsi: float = 0
    kdep: float = 0
    national_rank: int = 0

class Dealer(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: Literal["single", "group"] = "single"
    dealer_name: str
    dealer_code: str = ""
    dealer_principal: str = ""
    dealer_principal_photo: str = ""  # base64
    region: str = ""
    state: str = ""
    city: str = ""
    tier: str = "T1"
    dealer_type: str = "3S"
    activation_date: str = ""
    mobile: str = ""
    email: str = ""
    brand: str = "Globtier"
    other_brands: str = ""
    general_info: str = ""
    # Network
    num_3s: int = 0
    num_1s: int = 0
    num_outlets: int = 1
    # Infrastructure (single)
    showroom_ownership: Literal["Owned", "Leased"] = "Owned"
    showroom_frontage: float = 0
    showroom_area: float = 0
    workshop_ownership: Literal["Owned", "Leased"] = "Owned"
    workshop_area: float = 0
    workshop_bays: int = 0
    bp_bays: int = 0
    # Group only
    outlets: List[Outlet] = []
    # Media (base64 lists)
    showroom_photos: List[str] = []
    workshop_photos: List[str] = []
    interior_photos: List[str] = []
    # Performance
    monthly_sales: List[MonthlySales] = []
    yearly_kpis: List[YearlyKPI] = []
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class NationalBenchmark(BaseModel):
    year: int
    gross_profit_avg: float = 0
    ros_avg: float = 0
    oar_avg: float = 0
    ssi_avg: float = 0
    dcsi_avg: float = 0
    kdep_avg: float = 0

class CalcConfig(BaseModel):
    green_threshold: float = 100.0
    amber_threshold: float = 85.0
    achievement_formula: str = "actual / target * 100"
    growth_formula: str = "(current - previous) / previous * 100"
    ytd_growth_formula: str = "(ytd_current - ytd_previous) / ytd_previous * 100"
    kpi_weights: dict = Field(default_factory=lambda: {"ros": 0.25, "oar": 0.20, "ssi": 0.20, "dcsi": 0.20, "kdep": 0.15})
    notes: str = ""

class Integration(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str = ""
    base_url: str
    method: Literal["GET", "POST"] = "GET"
    endpoint_path: str = ""
    auth_type: Literal["none", "bearer", "api_key", "basic"] = "none"
    auth_value: str = ""
    auth_header: str = "Authorization"
    headers: dict = Field(default_factory=dict)
    target_module: Literal["dealers", "sales", "kpis", "benchmarks", "custom"] = "custom"
    enabled: bool = True
    last_status: str = ""
    last_run_at: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class AuditEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_email: str
    user_role: str
    action: str
    resource: str
    resource_id: str = ""
    details: str = ""
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

async def _audit(user: dict, action: str, resource: str, resource_id: str = "", details: str = ""):
    try:
        await db.audit_log.insert_one(AuditEntry(
            user_email=user.get("email", ""), user_role=user.get("role", ""),
            action=action, resource=resource, resource_id=resource_id, details=details,
        ).model_dump())
    except Exception:
        pass

async def _get_calc_config() -> dict:
    cfg = await db.calc_config.find_one({"key": "default"}, {"_id": 0, "key": 0})
    if not cfg:
        cfg = CalcConfig().model_dump()
    return cfg


# --- Auth Endpoints ---
def _set_cookie(resp: Response, token: str):
    resp.set_cookie("access_token", token, httponly=True, secure=False, samesite="lax", max_age=86400, path="/")

@api.post("/auth/register")
async def register(body: UserCreate, request: Request, response: Response):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    # Only admins can assign non-viewer roles. Anonymous self-registration is forced to "viewer".
    role = "viewer"
    token = request.cookies.get("access_token") or (request.headers.get("Authorization", "")[7:] if request.headers.get("Authorization", "").startswith("Bearer ") else None)
    if token:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
            requester = await db.users.find_one({"id": payload.get("sub")})
            if requester and requester.get("role") == "admin":
                role = body.role
        except jwt.InvalidTokenError:
            pass
    uid = str(uuid.uuid4())
    doc = {
        "id": uid, "email": email, "name": body.name, "role": role,
        "password_hash": hash_password(body.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    new_token = create_token(uid, email, role)
    _set_cookie(response, new_token)
    return {"id": uid, "email": email, "name": body.name, "role": role, "token": new_token}

@api.post("/auth/login")
async def login(body: UserLogin, response: Response):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    token = create_token(user["id"], user["email"], user["role"])
    _set_cookie(response, token)
    return {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"], "token": token}

@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

@api.get("/auth/users")
async def list_users(user: dict = Depends(require_role("admin"))):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users

# --- Dealer CRUD ---
def _calc_dealer_metrics(d: dict, cfg: Optional[dict] = None) -> dict:
    """Compute summary numbers used by dashboards."""
    cfg = cfg or {"green_threshold": 100.0, "amber_threshold": 85.0}
    monthly = d.get("monthly_sales", [])
    by_year = {}
    for m in monthly:
        by_year.setdefault(m["year"], {"target": 0, "actual": 0})
        by_year[m["year"]]["target"] += m.get("target", 0)
        by_year[m["year"]]["actual"] += m.get("actual", 0)
    current_year = datetime.now().year
    cy = by_year.get(current_year, {"target": 0, "actual": 0})
    py = by_year.get(current_year - 1, {"target": 0, "actual": 0})
    growth = ((cy["actual"] - py["actual"]) / py["actual"] * 100) if py["actual"] else 0
    achievement = (cy["actual"] / cy["target"] * 100) if cy["target"] else 0
    cm = datetime.now().month
    ytd = sum(m["actual"] for m in monthly if m["year"] == current_year and m["month"] <= cm)
    py_ytd = sum(m["actual"] for m in monthly if m["year"] == current_year - 1 and m["month"] <= cm)
    ytd_growth = ((ytd - py_ytd) / py_ytd * 100) if py_ytd else 0
    flag = "red"
    if achievement >= cfg.get("green_threshold", 100):
        flag = "green"
    elif achievement >= cfg.get("amber_threshold", 85):
        flag = "amber"
    return {
        "by_year": by_year,
        "current_year_actual": cy["actual"],
        "current_year_target": cy["target"],
        "previous_year_actual": py["actual"],
        "growth_pct": round(growth, 2),
        "achievement_pct": round(achievement, 2),
        "ytd_actual": ytd,
        "ytd_growth_pct": round(ytd_growth, 2),
        "performance_flag": flag,
    }

@api.get("/dealers")
async def list_dealers(
    type: Optional[str] = None,
    region: Optional[str] = None,
    state: Optional[str] = None,
    tier: Optional[str] = None,
    dealer_type: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    q = {}
    if type: q["type"] = type
    if region: q["region"] = region
    if state: q["state"] = state
    if tier: q["tier"] = tier
    if dealer_type: q["dealer_type"] = dealer_type
    rows = await db.dealers.find(q, {"_id": 0}).to_list(2000)
    cfg = await _get_calc_config()
    for r in rows:
        r["metrics"] = _calc_dealer_metrics(r, cfg)
    return rows

@api.get("/dealers/{dealer_id}")
async def get_dealer(dealer_id: str, user: dict = Depends(get_current_user)):
    d = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Dealer not found")
    cfg = await _get_calc_config()
    d["metrics"] = _calc_dealer_metrics(d, cfg)
    return d

@api.post("/dealers")
async def create_dealer(dealer: Dealer, user: dict = Depends(require_role("admin", "business_user", "data_entry"))):
    doc = dealer.model_dump()
    await db.dealers.insert_one(doc.copy())
    return dealer

@api.put("/dealers/{dealer_id}")
async def update_dealer(dealer_id: str, dealer: Dealer, user: dict = Depends(require_role("admin", "business_user", "data_entry"))):
    doc = dealer.model_dump()
    doc["id"] = dealer_id
    doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.dealers.update_one({"id": dealer_id}, {"$set": doc}, upsert=False)
    if res.matched_count == 0:
        raise HTTPException(404, "Dealer not found")
    return doc

@api.delete("/dealers/{dealer_id}")
async def delete_dealer(dealer_id: str, user: dict = Depends(require_role("admin"))):
    await db.dealers.delete_one({"id": dealer_id})
    return {"ok": True}

# --- National Benchmark ---
@api.get("/benchmarks")
async def get_benchmarks(user: dict = Depends(get_current_user)):
    rows = await db.benchmarks.find({}, {"_id": 0}).to_list(100)
    return rows

@api.put("/benchmarks/{year}")
async def upsert_benchmark(year: int, body: NationalBenchmark, user: dict = Depends(require_role("admin"))):
    doc = body.model_dump()
    doc["year"] = year
    await db.benchmarks.update_one({"year": year}, {"$set": doc}, upsert=True)
    return doc

# --- Group Dashboard ---
@api.get("/groups/{group_id}/dashboard")
async def group_dashboard(group_id: str, user: dict = Depends(get_current_user)):
    g = await db.dealers.find_one({"id": group_id, "type": "group"}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Group not found")
    metrics = _calc_dealer_metrics(g)
    outlets = g.get("outlets", [])
    cfg = await _get_calc_config()
    # Per-outlet metrics
    outlet_metrics = []
    for o in outlets:
        om = _calc_dealer_metrics({"monthly_sales": o.get("monthly_sales", [])}, cfg)
        outlet_metrics.append({**o, "metrics": om})
    showroom_owned = sum(1 for o in outlets if o.get("showroom_ownership") == "Owned")
    showroom_leased = len(outlets) - showroom_owned
    workshop_owned = sum(1 for o in outlets if o.get("workshop_ownership") == "Owned")
    workshop_leased = len(outlets) - workshop_owned
    return {
        "group": g,
        "metrics": metrics,
        "outlets": outlet_metrics,
        "totals": {
            "total_dealerships": len(outlets) or 1,
            "num_3s": g.get("num_3s", 0),
            "num_1s": g.get("num_1s", 0),
            "num_outlets": g.get("num_outlets", len(outlets)),
            "showroom_owned": showroom_owned,
            "showroom_leased": showroom_leased,
            "workshop_owned": workshop_owned,
            "workshop_leased": workshop_leased,
        },
    }

# --- Dealer sub-resource endpoints (sales / kpis / photos) ---
class MonthlySalesUpsert(BaseModel):
    year: int
    month: int
    target: float = 0
    actual: float = 0

class KPIUpsert(BaseModel):
    year: int
    gross_profit: float = 0
    ros: float = 0
    oar: float = 0
    ssi: float = 0
    dcsi: float = 0
    kdep: float = 0
    national_rank: int = 0

class PhotoBody(BaseModel):
    category: Literal["showroom", "workshop", "interior"]
    base64_image: str

@api.post("/dealers/{dealer_id}/sales")
async def upsert_sales(dealer_id: str, body: MonthlySalesUpsert, user: dict = Depends(require_role("admin", "business_user", "data_entry"))):
    d = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
    if not d: raise HTTPException(404, "Dealer not found")
    sales = d.get("monthly_sales", [])
    sales = [s for s in sales if not (s["year"] == body.year and s["month"] == body.month)]
    sales.append(body.model_dump())
    await db.dealers.update_one({"id": dealer_id}, {"$set": {"monthly_sales": sales, "updated_at": datetime.now(timezone.utc).isoformat()}})
    await _audit(user, "upsert_sales", "dealer", dealer_id, f"{body.year}-{body.month}: target={body.target}, actual={body.actual}")
    return {"ok": True}

@api.post("/dealers/{dealer_id}/kpis")
async def upsert_kpi(dealer_id: str, body: KPIUpsert, user: dict = Depends(require_role("admin", "business_user", "data_entry"))):
    d = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
    if not d: raise HTTPException(404, "Dealer not found")
    kpis = d.get("yearly_kpis", [])
    kpis = [k for k in kpis if k["year"] != body.year]
    kpis.append(body.model_dump())
    await db.dealers.update_one({"id": dealer_id}, {"$set": {"yearly_kpis": kpis, "updated_at": datetime.now(timezone.utc).isoformat()}})
    await _audit(user, "upsert_kpi", "dealer", dealer_id, f"{body.year}")
    return {"ok": True}

@api.post("/dealers/{dealer_id}/photos")
async def add_photo(dealer_id: str, body: PhotoBody, user: dict = Depends(require_role("admin", "business_user", "data_entry"))):
    d = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
    if not d: raise HTTPException(404, "Dealer not found")
    field = f"{body.category}_photos"
    arr = d.get(field, [])
    arr.append(body.base64_image)
    await db.dealers.update_one({"id": dealer_id}, {"$set": {field: arr}})
    await _audit(user, "add_photo", "dealer", dealer_id, body.category)
    return {"ok": True, "count": len(arr)}

@api.delete("/dealers/{dealer_id}/photos/{category}/{index}")
async def remove_photo(dealer_id: str, category: str, index: int, user: dict = Depends(require_role("admin", "business_user", "data_entry"))):
    d = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
    if not d: raise HTTPException(404, "Dealer not found")
    field = f"{category}_photos"
    arr = d.get(field, [])
    if 0 <= index < len(arr):
        arr.pop(index)
        await db.dealers.update_one({"id": dealer_id}, {"$set": {field: arr}})
    return {"ok": True}

# --- PDF Reports ---
def _pdf_dealer_report(d: dict, metrics: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=15*mm, rightMargin=15*mm, topMargin=15*mm, bottomMargin=15*mm)
    styles = getSampleStyleSheet()
    title_s = ParagraphStyle("t", parent=styles["Title"], textColor=colors.HexColor("#0F4C81"), fontSize=20)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], textColor=colors.HexColor("#0F4C81"), fontSize=12, spaceAfter=6)
    body = styles["BodyText"]
    elems = []
    elems.append(Paragraph("Globtier — Dealer Profile Report", title_s))
    elems.append(Spacer(1, 6))
    elems.append(Paragraph(f"<b>{d.get('dealer_name','')}</b> &nbsp;|&nbsp; {d.get('dealer_code','')} &nbsp;|&nbsp; {d.get('dealer_principal','')}", body))
    elems.append(Paragraph(f"{d.get('city','')}, {d.get('state','')} • {d.get('region','')} • Tier {d.get('tier','')} • {d.get('dealer_type','')}", body))
    elems.append(Spacer(1, 12))

    elems.append(Paragraph("Performance Summary", h2))
    perf = [
        ["Metric", "Value"],
        ["CY Target", f"₹{metrics['current_year_target']:,.0f}"],
        ["CY Actual", f"₹{metrics['current_year_actual']:,.0f}"],
        ["Achievement %", f"{metrics['achievement_pct']}%"],
        ["Growth vs LY", f"{metrics['growth_pct']}%"],
        ["YTD Actual", f"₹{metrics['ytd_actual']:,.0f}"],
        ["Performance Flag", metrics["performance_flag"].upper()],
    ]
    t = Table(perf, hAlign="LEFT", colWidths=[80*mm, 80*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F4C81")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8F9FA")]),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
    ]))
    elems.append(t)
    elems.append(Spacer(1, 12))

    elems.append(Paragraph("Yearly KPIs", h2))
    kpi_rows = [["Year", "GP (₹L)", "ROS%", "OAR%", "SSI", "DCSI", "KDEP", "Rank"]]
    for k in sorted(d.get("yearly_kpis", []), key=lambda x: -x["year"]):
        kpi_rows.append([k["year"], k["gross_profit"], k["ros"], k["oar"], k["ssi"], k["dcsi"], k["kdep"], f"#{k['national_rank']}"])
    if len(kpi_rows) > 1:
        kt = Table(kpi_rows, hAlign="LEFT")
        kt.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F4C81")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
        ]))
        elems.append(kt)
    elems.append(Spacer(1, 12))

    elems.append(Paragraph("Infrastructure", h2))
    infra = [
        ["", "Showroom", "Workshop"],
        ["Ownership", d.get("showroom_ownership","-"), d.get("workshop_ownership","-")],
        ["Area (sq ft)", d.get("showroom_area",0), d.get("workshop_area",0)],
        ["Frontage (ft)", d.get("showroom_frontage",0), "-"],
        ["Bays", "-", f"{d.get('workshop_bays',0)} WS / {d.get('bp_bays',0)} BP"],
    ]
    it = Table(infra, hAlign="LEFT", colWidths=[50*mm, 55*mm, 55*mm])
    it.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F3F4F6")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
    ]))
    elems.append(it)

    if d.get("type") == "group" and d.get("outlets"):
        elems.append(PageBreak())
        elems.append(Paragraph("Outlets", h2))
        rows = [["Code", "City", "State", "Tier", "Start", "Showroom", "Workshop"]]
        for o in d["outlets"]:
            rows.append([o["dealer_code"], o["city"], o["state"], o["tier"], o["start_of_business"], o["showroom_ownership"], o["workshop_ownership"]])
        ot = Table(rows, hAlign="LEFT")
        ot.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F4C81")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
        ]))
        elems.append(ot)

    doc.build(elems)
    buf.seek(0)
    return buf.getvalue()

@api.get("/dealers/{dealer_id}/report.pdf")
async def dealer_pdf(dealer_id: str, user: dict = Depends(get_current_user)):
    d = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
    if not d: raise HTTPException(404, "Dealer not found")
    cfg = await _get_calc_config()
    pdf = _pdf_dealer_report(d, _calc_dealer_metrics(d, cfg))
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename={d.get('dealer_code','dealer')}_report.pdf"})

# --- Calculation Config ---
@api.get("/calc-config")
async def get_calc_config(user: dict = Depends(get_current_user)):
    return await _get_calc_config()

@api.put("/calc-config")
async def put_calc_config(body: CalcConfig, user: dict = Depends(require_role("admin"))):
    doc = body.model_dump()
    doc["key"] = "default"
    await db.calc_config.update_one({"key": "default"}, {"$set": doc}, upsert=True)
    await _audit(user, "update", "calc_config", "default", str(doc))
    return body

# --- External API Integrations ---
@api.get("/integrations")
async def list_integrations(user: dict = Depends(require_role("admin", "business_user"))):
    rows = await db.integrations.find({}, {"_id": 0}).to_list(200)
    return rows

@api.post("/integrations")
async def create_integration(body: Integration, user: dict = Depends(require_role("admin"))):
    doc = body.model_dump()
    await db.integrations.insert_one(doc.copy())
    await _audit(user, "create", "integration", body.id, body.name)
    return body

@api.put("/integrations/{iid}")
async def update_integration(iid: str, body: Integration, user: dict = Depends(require_role("admin"))):
    doc = body.model_dump()
    doc["id"] = iid
    res = await db.integrations.update_one({"id": iid}, {"$set": doc})
    if res.matched_count == 0: raise HTTPException(404, "Not found")
    await _audit(user, "update", "integration", iid, body.name)
    return doc

@api.delete("/integrations/{iid}")
async def delete_integration(iid: str, user: dict = Depends(require_role("admin"))):
    await db.integrations.delete_one({"id": iid})
    await _audit(user, "delete", "integration", iid)
    return {"ok": True}

@api.post("/integrations/{iid}/test")
async def test_integration(iid: str, user: dict = Depends(require_role("admin", "business_user"))):
    intg = await db.integrations.find_one({"id": iid}, {"_id": 0})
    if not intg: raise HTTPException(404, "Not found")
    url = intg["base_url"].rstrip("/") + "/" + intg.get("endpoint_path", "").lstrip("/")
    headers = dict(intg.get("headers", {}))
    if intg["auth_type"] == "bearer" and intg.get("auth_value"):
        headers["Authorization"] = f"Bearer {intg['auth_value']}"
    elif intg["auth_type"] == "api_key" and intg.get("auth_value"):
        headers[intg.get("auth_header", "Authorization")] = intg["auth_value"]
    status = "unknown"
    detail = ""
    sample = None
    try:
        async with httpx.AsyncClient(timeout=10) as client_x:
            r = await client_x.request(intg.get("method", "GET"), url, headers=headers)
            status = f"{r.status_code} OK" if r.status_code < 400 else f"{r.status_code} {r.reason_phrase}"
            try:
                j = r.json()
                sample = j if isinstance(j, dict) else (j[:3] if isinstance(j, list) else None)
            except Exception:
                sample = r.text[:200]
            detail = f"Latency {int(r.elapsed.total_seconds()*1000)}ms"
    except Exception as e:
        status = "error"
        detail = str(e)[:200]
    now = datetime.now(timezone.utc).isoformat()
    await db.integrations.update_one({"id": iid}, {"$set": {"last_status": status, "last_run_at": now}})
    await _audit(user, "test", "integration", iid, status)
    return {"status": status, "detail": detail, "sample": sample, "tested_at": now}

# --- Audit Log ---
@api.get("/audit-logs")
async def audit_logs(limit: int = 200, user: dict = Depends(require_role("admin"))):
    rows = await db.audit_log.find({}, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    return rows



# --- Overview / dashboard ---
@api.get("/overview")
async def overview(user: dict = Depends(get_current_user)):
    rows = await db.dealers.find({}, {"_id": 0}).to_list(5000)
    total_dealers = len(rows)
    groups = sum(1 for r in rows if r.get("type") == "group")
    singles = total_dealers - groups
    cy = datetime.now().year
    total_actual = 0
    total_target = 0
    flags = {"green": 0, "amber": 0, "red": 0}
    for r in rows:
        m = _calc_dealer_metrics(r)
        total_actual += m["current_year_actual"]
        total_target += m["current_year_target"]
        flags[m["performance_flag"]] += 1
    achievement = (total_actual / total_target * 100) if total_target else 0
    return {
        "total_dealers": total_dealers,
        "groups": groups,
        "singles": singles,
        "current_year": cy,
        "total_actual": total_actual,
        "total_target": total_target,
        "achievement_pct": round(achievement, 2),
        "flags": flags,
    }

# --- Excel Import / Export ---
@api.post("/import/dealers")
async def import_dealers(file: UploadFile = File(...), user: dict = Depends(require_role("admin", "data_entry"))):
    content = await file.read()
    try:
        df = pd.read_excel(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(400, f"Invalid Excel: {e}")
    required = ["dealer_name", "dealer_code"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise HTTPException(400, f"Missing required columns: {', '.join(missing)}")
    inserted = 0
    errors = []
    for idx, row in df.iterrows():
        try:
            name = str(row.get("dealer_name", "")).strip()
            code = str(row.get("dealer_code", "")).strip()
            if not name or not code:
                errors.append(f"Row {idx + 2}: dealer_name and dealer_code required")
                continue
            d = Dealer(
                dealer_name=name, dealer_code=code,
                dealer_principal=str(row.get("dealer_principal", "")),
                region=str(row.get("region", "")), state=str(row.get("state", "")),
                city=str(row.get("city", "")), tier=str(row.get("tier", "T1")),
                dealer_type=str(row.get("dealer_type", "3S")),
                mobile=str(row.get("mobile", "")), email=str(row.get("email", "")),
            ).model_dump()
            await db.dealers.insert_one(d.copy())
            inserted += 1
        except Exception as e:
            errors.append(f"Row {idx + 2}: {str(e)[:100]}")
    await _audit(user, "import", "dealers", "", f"inserted={inserted}, errors={len(errors)}")
    return {"inserted": inserted, "errors": errors}

@api.get("/export/dealers")
async def export_dealers(user: dict = Depends(get_current_user)):
    rows = await db.dealers.find({}, {"_id": 0}).to_list(2000)
    flat = []
    for r in rows:
        m = _calc_dealer_metrics(r)
        flat.append({
            "Dealer Name": r.get("dealer_name"),
            "Dealer Code": r.get("dealer_code"),
            "Type": r.get("type"),
            "Region": r.get("region"),
            "State": r.get("state"),
            "City": r.get("city"),
            "Tier": r.get("tier"),
            "Dealer Type": r.get("dealer_type"),
            "Principal": r.get("dealer_principal"),
            "CY Target": m["current_year_target"],
            "CY Actual": m["current_year_actual"],
            "Achievement %": m["achievement_pct"],
            "Growth %": m["growth_pct"],
            "YTD": m["ytd_actual"],
            "Flag": m["performance_flag"],
        })
    df = pd.DataFrame(flat)
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as w:
        df.to_excel(w, index=False, sheet_name="Dealers")
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=dealers_export.xlsx"},
    )

@api.get("/")
async def root():
    return {"app": "Globtier Dealer Intelligence", "status": "ok"}

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- Seeding ---
SEED_USERS = [
    ("admin@globtier.com", "admin123", "Admin User", "admin"),
    ("business@globtier.com", "business123", "Business User", "business_user"),
    ("dataentry@globtier.com", "data123", "Data Entry", "data_entry"),
    ("viewer@globtier.com", "viewer123", "Viewer User", "viewer"),
]

def _gen_monthly(years, base_actual, base_target, growth=0.08):
    rows = []
    for i, y in enumerate(years):
        scale = (1 + growth) ** i
        for m in range(1, 13):
            seasonality = 0.85 + (m % 4) * 0.08
            rows.append(MonthlySales(
                year=y, month=m,
                target=round(base_target * scale * seasonality, 2),
                actual=round(base_actual * scale * seasonality * (0.9 + (m * 0.015)), 2),
            ).model_dump())
    return rows

def _gen_kpis(years):
    out = []
    for i, y in enumerate(years):
        out.append(YearlyKPI(
            year=y,
            gross_profit=round(120 + i * 18, 2),
            ros=round(2.8 + i * 0.4, 2),
            oar=round(72 + i * 3.5, 2),
            ssi=round(820 + i * 12, 2),
            dcsi=round(810 + i * 14, 2),
            kdep=round(75 + i * 3, 2),
            national_rank=max(1, 25 - i * 4),
        ).model_dump())
    return out

async def seed_data():
    # users
    for email, pwd, name, role in SEED_USERS:
        if not await db.users.find_one({"email": email}):
            await db.users.insert_one({
                "id": str(uuid.uuid4()), "email": email, "name": name, "role": role,
                "password_hash": hash_password(pwd),
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
    # benchmarks
    bm = [
        NationalBenchmark(year=2023, gross_profit_avg=140, ros_avg=3.1, oar_avg=78, ssi_avg=830, dcsi_avg=820, kdep_avg=78),
        NationalBenchmark(year=2024, gross_profit_avg=160, ros_avg=3.4, oar_avg=82, ssi_avg=842, dcsi_avg=830, kdep_avg=80),
        NationalBenchmark(year=2025, gross_profit_avg=180, ros_avg=3.7, oar_avg=85, ssi_avg=855, dcsi_avg=845, kdep_avg=83),
    ]
    for b in bm:
        await db.benchmarks.update_one({"year": b.year}, {"$set": b.model_dump()}, upsert=True)
    # dealers
    if await db.dealers.count_documents({}) > 0:
        return
    years = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]
    samples = [
        ("Northstar Motors", "GB-NM-001", "Aarav Sharma", "North", "Delhi", "New Delhi", "T1", "3S", 220, 250),
        ("Sunrise Auto", "GB-SA-014", "Priya Mehta", "West", "Maharashtra", "Mumbai", "T1", "3S", 280, 300),
        ("Greenline Cars", "GB-GL-027", "Rajesh Iyer", "South", "Karnataka", "Bengaluru", "T1", "3S", 190, 200),
        ("Heritage Wheels", "GB-HW-042", "Kavita Singh", "East", "West Bengal", "Kolkata", "T2", "1S", 120, 130),
        ("Skyline Auto Hub", "GB-SH-058", "Mohammed Ali", "South", "Tamil Nadu", "Chennai", "UC", "3S", 150, 170),
    ]
    for name, code, principal, region, state, city, tier, dt, base_a, base_t in samples:
        d = Dealer(
            type="single", dealer_name=name, dealer_code=code, dealer_principal=principal,
            region=region, state=state, city=city, tier=tier, dealer_type=dt,
            activation_date="2018-04-15", mobile="+91-98765-43210", email=f"{code.lower()}@globtier.com",
            num_3s=1 if dt == "3S" else 0, num_1s=1 if dt == "1S" else 0, num_outlets=1,
            showroom_ownership="Owned", showroom_frontage=120, showroom_area=8500,
            workshop_ownership="Owned", workshop_area=12000, workshop_bays=14, bp_bays=6,
            general_info=f"{name} is a flagship outlet operating since 2018 in {city}, {state}.",
            monthly_sales=_gen_monthly(years, base_a, base_t),
            yearly_kpis=_gen_kpis([2023, 2024, 2025]),
        ).model_dump()
        await db.dealers.insert_one(d.copy())

    # group dealer
    group_outlets_specs = [
        ("GB-RG-101", "Maharashtra", "Pune", "T1", "2017-06-01", 140, 9000, 12500, 14, 6, "Owned", "Owned", 220, 250),
        ("GB-RG-102", "Maharashtra", "Nashik", "T2", "2019-09-12", 90, 6500, 8500, 10, 4, "Leased", "Owned", 150, 170),
        ("GB-RG-103", "Gujarat", "Ahmedabad", "T1", "2020-02-20", 120, 8000, 10000, 12, 5, "Owned", "Leased", 200, 220),
        ("GB-RG-104", "Gujarat", "Surat", "T2", "2021-11-05", 100, 7000, 9000, 10, 4, "Leased", "Leased", 150, 160),
    ]
    group_outlets = []
    for code, st, ct, tier, sob, fr, sa, wa, wb, bp, so, wo, ba, bt in group_outlets_specs:
        outlet_monthly = []
        for ms in _gen_monthly(years, ba, bt, growth=0.10):
            outlet_monthly.append(OutletMonthly(year=ms["year"], month=ms["month"], target=ms["target"], actual=ms["actual"]).model_dump())
        group_outlets.append(Outlet(
            dealer_code=code, state=st, city=ct, tier=tier, start_of_business=sob,
            showroom_frontage=fr, showroom_area=sa, workshop_area=wa, workshop_bays=wb, bp_bays=bp,
            showroom_ownership=so, workshop_ownership=wo, monthly_sales=outlet_monthly,
        ).model_dump())
    grp = Dealer(
        type="group", dealer_name="Regalia Auto Group", dealer_code="GB-RG-PARENT",
        dealer_principal="Vikram Khanna", region="West", state="Maharashtra", city="Pune",
        tier="T1", dealer_type="3S", activation_date="2017-06-01",
        mobile="+91-99887-76655", email="vikram@regaliaauto.com",
        num_3s=3, num_1s=1, num_outlets=4,
        general_info="Regalia Auto Group operates 4 outlets across Maharashtra and Gujarat with strong CSI scores.",
        outlets=group_outlets,
        monthly_sales=_gen_monthly(years, 720, 800, growth=0.10),
        yearly_kpis=_gen_kpis([2023, 2024, 2025]),
    ).model_dump()
    await db.dealers.insert_one(grp.copy())

@app.on_event("startup")
async def on_start():
    await db.users.create_index("email", unique=True)
    await db.dealers.create_index("id", unique=True)
    await seed_data()
    logger.info("Seeded users, benchmarks, dealers")

@app.on_event("shutdown")
async def on_shutdown():
    client.close()
