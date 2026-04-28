# Globtier Dealer Intelligence — PRD

## Original Problem Statement
Build a Dealer Intelligence and Performance Management Application to replace Excel-based Dealer Profile Cards and Group Dealer Dashboards. Single dealer view + group multi-outlet view, KPIs, performance flags, charts, role-based access, Excel I/O.

## User Choices
- JWT-based custom auth with 4 roles (admin, business_user, data_entry, viewer)
- Globtier branding (deep blue #0F4C81 + amber accents, Swiss/high-contrast theme)
- Base64 image storage
- Excel import + manual entry
- Seeded sample data with generic dealer names (no Kia)

## Architecture
- Backend: FastAPI + Motor (MongoDB), bcrypt + PyJWT, openpyxl/pandas for Excel
- Frontend: React 19 + Tailwind + Shadcn UI + Recharts
- Auth: JWT in httpOnly cookie + Authorization Bearer fallback (localStorage)
- DB: MongoDB collections: users, dealers, benchmarks, login_attempts (reserved)

## Implemented (Feb 2026)
- JWT auth (login/register/me/logout), role-gated registration (anonymous → viewer; admin can assign roles)
- Dealer master CRUD (single + group types) with full schema (master, network, infra, media, monthly sales, yearly KPIs)
- Group dealer dashboard with outlet table and ownership totals
- Overview dashboard (network-wide KPIs, performance flags, top dealers)
- Dealer Profile Card (KPI tiles + sales trend + monthly bars + KPI radar vs national avg + 4 tabs)
- National Benchmarks (CRUD by admin)
- Excel Import (admin/data_entry) and Excel Export (all roles)
- Filters: Region/Tier/Type + free-text search
- Role-aware sidebar (Users + Excel Import gated to admin/data_entry)
- Seeded data: 4 users, 3 benchmarks, 5 single dealers, 1 group dealer (Regalia Auto Group, 4 outlets)

## Personas
- **Admin** — full control, manage users, configure benchmarks, approve data
- **Business User** — view all, edit dealer master/performance
- **Data Entry** — enter monthly sales, infra, import Excel
- **Viewer** — read-only across dashboards

## Backlog (P1/P2)
- P1: Per-outlet sales attribution (currently group totals only)
- P1: PDF report generation (Dealer Profile + Group Dashboard)
- P1: Image upload UI (backend supports base64 list; needs UI uploader)
- P1: Excel column validation + error report on import
- P2: Brute-force lockout, password reset flow
- P2: Edit Dealer form (Add Dealer exists)
- P2: Audit log
- P2: Dealer comparison side-by-side view

## Test Credentials
See `/app/memory/test_credentials.md`
