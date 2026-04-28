# Globtier Dealer Intelligence — PRD

## Original Problem Statement
Build a Dealer Intelligence and Performance Management Application to replace Excel-based Dealer Profile Cards and Group Dealer Dashboards.

## User Choices
- JWT-based custom auth, 4 roles (admin, business_user, data_entry, viewer)
- Globtier branding (deep blue #0F4C81, Swiss/high-contrast theme)
- Base64 image storage in MongoDB
- Excel import + manual entry
- Seeded sample data with generic dealer names

## Architecture
- Backend: FastAPI + Motor (MongoDB), bcrypt + PyJWT, pandas/openpyxl, reportlab (PDF), httpx (external API calls)
- Frontend: React 19 + Tailwind + Shadcn UI + Recharts
- Auth: JWT cookie + Bearer fallback, role-gated registration

## Implemented (Feb 2026)
### Iteration 1
- JWT auth + 4 roles, role-gated registration (anon → viewer)
- Dealer Master CRUD (single + group), Network, Infrastructure, Media (base64), Sales (yearly + monthly), KPIs (yearly), National Benchmarks
- Overview dashboard, Single Dealer Profile Card (charts + KPI radar vs national avg), Group Dealer Dashboard with outlets
- Excel Import (basic) + Excel Export
- Role-aware sidebar; seeded 4 users + 6 dealers (5 single + 1 group with 4 outlets)

### Iteration 2 (Feb 2026)
- **Per-outlet sales attribution**: outlets now have their own monthly_sales; group dashboard returns per-outlet metrics (target/actual/variance/growth/YTD/flag)
- **Edit Dealer page** (`/dealers/:id/edit`) with 4 tabs: Master & Infrastructure, Monthly Sales (per-month upsert), KPIs (yearly upsert), Photos (upload/delete with base64 thumbnails)
- **PDF Reports** for Dealer Profile and Group Dashboard (`/api/dealers/{id}/report.pdf`, reportlab)
- **Outlet Comparison bar chart** in Group Dashboard
- **Excel Import column validation** with errors array
- **NEW Settings module** (admin-only) with 3 tabs:
  1. **Calculation Logic** — configurable green/amber thresholds, formula reference text, KPI composite weights. Threshold changes immediately affect all dealer flag computations.
  2. **External APIs** — full CRUD for outbound integrations (name, base URL, method, path, auth: none/bearer/api_key/basic, headers, target module). One-click **Test Connection** executes real HTTP call and reports status + latency + response sample.
  3. **Audit Log** — admin trail of config changes, integrations, sales/KPI updates with user + role + timestamp.
- **Audit logging** wired across mutations (calc-config, integrations, sales, KPIs, photos, imports)

## Personas
- **Admin** — full control, configure calc logic, integrations, manage users
- **Business User** — view all, edit master/performance, list integrations
- **Data Entry** — enter sales/KPI/photos, import Excel
- **Viewer** — read-only

## Test Results
- Iteration 1: 15/15 backend pytest + frontend happy paths
- Iteration 2: 32/32 backend pytest (17 new + 15 regression) + frontend admin login + Settings visibility verified

## Backlog (P1/P2)
- P1: SSRF protection + timeout on integration test (admin could probe internal hosts)
- P1: Scheduled sync jobs for integrations (currently test-only)
- P1: Side-by-side dealer comparison view
- P2: Brute-force lockout, password reset flow, MFA
- P2: Dealer performance alert engine (auto-email when achievement <85%)
- P2: Map view of dealers by region

## Test Credentials
See `/app/memory/test_credentials.md`
