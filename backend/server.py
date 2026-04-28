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
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

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

# --- Auth Endpoints ---
def _set_cookie(resp: Response, token: str):
    resp.set_cookie("access_token", token, httponly=True, secure=False, samesite="lax", max_age=86400, path="/")

@api.post("/auth/register")
async def register(body: UserCreate, response: Response):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    uid = str(uuid.uuid4())
    doc = {
        "id": uid, "email": email, "name": body.name, "role": body.role,
        "password_hash": hash_password(body.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    token = create_token(uid, email, body.role)
    _set_cookie(response, token)
    return {"id": uid, "email": email, "name": body.name, "role": body.role, "token": token}

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
def _calc_dealer_metrics(d: dict) -> dict:
    """Compute summary numbers used by dashboards."""
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
    # YTD = sum of months in current year up to current month
    cm = datetime.now().month
    ytd = sum(m["actual"] for m in monthly if m["year"] == current_year and m["month"] <= cm)
    py_ytd = sum(m["actual"] for m in monthly if m["year"] == current_year - 1 and m["month"] <= cm)
    ytd_growth = ((ytd - py_ytd) / py_ytd * 100) if py_ytd else 0
    flag = "red"
    if achievement >= 100:
        flag = "green"
    elif achievement >= 85:
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
    for r in rows:
        r["metrics"] = _calc_dealer_metrics(r)
    return rows

@api.get("/dealers/{dealer_id}")
async def get_dealer(dealer_id: str, user: dict = Depends(get_current_user)):
    d = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Dealer not found")
    d["metrics"] = _calc_dealer_metrics(d)
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
    showroom_owned = sum(1 for o in outlets if o.get("showroom_ownership") == "Owned")
    showroom_leased = len(outlets) - showroom_owned
    workshop_owned = sum(1 for o in outlets if o.get("workshop_ownership") == "Owned")
    workshop_leased = len(outlets) - workshop_owned
    return {
        "group": g,
        "metrics": metrics,
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
    inserted = 0
    for _, row in df.iterrows():
        d = Dealer(
            dealer_name=str(row.get("dealer_name", "")),
            dealer_code=str(row.get("dealer_code", "")),
            dealer_principal=str(row.get("dealer_principal", "")),
            region=str(row.get("region", "")),
            state=str(row.get("state", "")),
            city=str(row.get("city", "")),
            tier=str(row.get("tier", "T1")),
            dealer_type=str(row.get("dealer_type", "3S")),
            mobile=str(row.get("mobile", "")),
            email=str(row.get("email", "")),
        ).model_dump()
        await db.dealers.insert_one(d.copy())
        inserted += 1
    return {"inserted": inserted}

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
    group_outlets = [
        Outlet(dealer_code="GB-RG-101", state="Maharashtra", city="Pune", tier="T1", start_of_business="2017-06-01",
               showroom_frontage=140, showroom_area=9000, workshop_area=12500, workshop_bays=14, bp_bays=6,
               showroom_ownership="Owned", workshop_ownership="Owned").model_dump(),
        Outlet(dealer_code="GB-RG-102", state="Maharashtra", city="Nashik", tier="T2", start_of_business="2019-09-12",
               showroom_frontage=90, showroom_area=6500, workshop_area=8500, workshop_bays=10, bp_bays=4,
               showroom_ownership="Leased", workshop_ownership="Owned").model_dump(),
        Outlet(dealer_code="GB-RG-103", state="Gujarat", city="Ahmedabad", tier="T1", start_of_business="2020-02-20",
               showroom_frontage=120, showroom_area=8000, workshop_area=10000, workshop_bays=12, bp_bays=5,
               showroom_ownership="Owned", workshop_ownership="Leased").model_dump(),
        Outlet(dealer_code="GB-RG-104", state="Gujarat", city="Surat", tier="T2", start_of_business="2021-11-05",
               showroom_frontage=100, showroom_area=7000, workshop_area=9000, workshop_bays=10, bp_bays=4,
               showroom_ownership="Leased", workshop_ownership="Leased").model_dump(),
    ]
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
