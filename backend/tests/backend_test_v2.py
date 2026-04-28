"""Iteration 2 backend tests — calc-config, integrations, audit, sales/kpis/photos, PDF, group outlets, import validation, RBAC."""
import os, io, pytest, requests, pandas as pd

BASE = (os.environ.get('REACT_APP_BACKEND_URL') or 'https://dealer-dashboard-pro-1.preview.emergentagent.com').rstrip('/')
A = BASE + '/api'

def H(t): return {'Authorization': f'Bearer {t}'}

@pytest.fixture(scope='module')
def admin():
    r = requests.post(f'{A}/auth/login', json={'email': 'admin@globtier.com', 'password': 'admin123'})
    assert r.status_code == 200
    return r.json()['token']

@pytest.fixture(scope='module')
def viewer():
    r = requests.post(f'{A}/auth/login', json={'email': 'viewer@globtier.com', 'password': 'viewer123'})
    assert r.status_code == 200
    return r.json()['token']

@pytest.fixture(scope='module')
def business():
    r = requests.post(f'{A}/auth/login', json={'email': 'business@globtier.com', 'password': 'business123'})
    assert r.status_code == 200
    return r.json()['token']

@pytest.fixture(scope='module')
def dealer_id(admin):
    rows = requests.get(f'{A}/dealers?type=single', headers=H(admin)).json()
    return rows[0]['id']

@pytest.fixture(scope='module')
def group_id(admin):
    rows = requests.get(f'{A}/dealers?type=group', headers=H(admin)).json()
    return rows[0]['id']

# ---------------- calc-config ----------------
def test_calc_config_get(admin):
    r = requests.get(f'{A}/calc-config', headers=H(admin))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d['green_threshold'] == 100
    assert d['amber_threshold'] == 85
    assert 'kpi_weights' in d and 'achievement_formula' in d

def test_calc_config_update_admin_and_reflected(admin):
    new = {'green_threshold': 95, 'amber_threshold': 80,
           'kpi_weights': {'ros': 0.25, 'oar': 0.20, 'ssi': 0.20, 'dcsi': 0.20, 'kdep': 0.15},
           'achievement_formula': 'actual / target * 100',
           'growth_formula': '(current - previous) / previous * 100',
           'ytd_growth_formula': '(ytd_current - ytd_previous) / ytd_previous * 100',
           'notes': ''}
    r = requests.put(f'{A}/calc-config', headers=H(admin), json=new)
    assert r.status_code == 200, r.text
    g = requests.get(f'{A}/calc-config', headers=H(admin)).json()
    assert g['green_threshold'] == 95 and g['amber_threshold'] == 80
    # dealers reflect new thresholds
    rows = requests.get(f'{A}/dealers', headers=H(admin)).json()
    for x in rows:
        assert x['metrics']['performance_flag'] in ('green', 'amber', 'red')
    # restore
    requests.put(f'{A}/calc-config', headers=H(admin),
                 json={'green_threshold': 100, 'amber_threshold': 85,
                       'kpi_weights': {'ros': 0.25, 'oar': 0.20, 'ssi': 0.20, 'dcsi': 0.20, 'kdep': 0.15},
                       'achievement_formula': 'actual / target * 100',
                       'growth_formula': '(current - previous) / previous * 100',
                       'ytd_growth_formula': '(ytd_current - ytd_previous) / ytd_previous * 100',
                       'notes': ''})

def test_calc_config_viewer_403(viewer):
    r = requests.put(f'{A}/calc-config', headers=H(viewer),
                     json={'green_threshold': 100, 'amber_threshold': 85, 'kpi_weights': {}, 'achievement_formula': 'x'})
    assert r.status_code == 403

# ---------------- integrations ----------------
@pytest.fixture(scope='module')
def integration_id(admin):
    payload = {'name': 'TEST_jp', 'base_url': 'https://jsonplaceholder.typicode.com',
               'endpoint_path': '/users/1', 'method': 'GET', 'auth_type': 'none'}
    r = requests.post(f'{A}/integrations', headers=H(admin), json=payload)
    assert r.status_code == 200, r.text
    iid = r.json()['id']
    yield iid
    requests.delete(f'{A}/integrations/{iid}', headers=H(admin))

def test_integration_list(admin, integration_id):
    r = requests.get(f'{A}/integrations', headers=H(admin))
    assert r.status_code == 200
    assert any(x['id'] == integration_id for x in r.json())

def test_integration_business_can_list_not_create(business):
    r = requests.get(f'{A}/integrations', headers=H(business))
    assert r.status_code == 200
    r2 = requests.post(f'{A}/integrations', headers=H(business),
                      json={'name': 'X', 'base_url': 'http://x', 'endpoint_path': '/', 'method': 'GET', 'auth_type': 'none'})
    assert r2.status_code == 403

def test_integration_update(admin, integration_id):
    r = requests.put(f'{A}/integrations/{integration_id}', headers=H(admin),
                    json={'name': 'TEST_jp2', 'base_url': 'https://jsonplaceholder.typicode.com',
                          'endpoint_path': '/users/1', 'method': 'GET', 'auth_type': 'none'})
    assert r.status_code == 200

def test_integration_test_run(admin, integration_id):
    r = requests.post(f'{A}/integrations/{integration_id}/test', headers=H(admin))
    assert r.status_code == 200, r.text
    d = r.json()
    assert 'last_status' in d or 'status' in d
    g = requests.get(f'{A}/integrations', headers=H(admin)).json()
    found = next(x for x in g if x['id'] == integration_id)
    assert found.get('last_status') is not None
    assert found.get('last_run_at') is not None

# ---------------- audit-logs ----------------
def test_audit_logs(admin, integration_id):
    r = requests.get(f'{A}/audit-logs', headers=H(admin))
    assert r.status_code == 200
    rows = r.json()
    assert isinstance(rows, list) and len(rows) >= 1

def test_audit_logs_viewer_403(viewer):
    r = requests.get(f'{A}/audit-logs', headers=H(viewer))
    assert r.status_code == 403

# ---------------- sales / kpis / photos ----------------
def test_sales_upsert(admin, dealer_id):
    payload = {'year': 2025, 'month': 6, 'target': 1000, 'actual': 950, 'gross_profit': 100, 'csi_score': 90}
    r = requests.post(f'{A}/dealers/{dealer_id}/sales', headers=H(admin), json=payload)
    assert r.status_code == 200, r.text
    # upsert again, replaces
    payload['actual'] = 1100
    r2 = requests.post(f'{A}/dealers/{dealer_id}/sales', headers=H(admin), json=payload)
    assert r2.status_code == 200
    d = requests.get(f'{A}/dealers/{dealer_id}', headers=H(admin)).json()
    matches = [m for m in d['monthly_sales'] if m.get('year') == 2025 and m.get('month') == 6]
    assert len(matches) == 1
    assert matches[0]['actual'] == 1100

def test_sales_viewer_403(viewer, dealer_id):
    r = requests.post(f'{A}/dealers/{dealer_id}/sales', headers=H(viewer),
                     json={'year': 2025, 'month': 7, 'target': 1, 'actual': 1, 'gross_profit': 1, 'csi_score': 1})
    assert r.status_code == 403

def test_kpi_upsert(admin, dealer_id):
    p = {'year': 2025, 'gross_profit': 480, 'ros': 12.5, 'oar': 95, 'ssi': 88, 'dcsi': 91, 'kdep': 75, 'national_rank': 5}
    r = requests.post(f'{A}/dealers/{dealer_id}/kpis', headers=H(admin), json=p)
    assert r.status_code == 200, r.text
    d = requests.get(f'{A}/dealers/{dealer_id}', headers=H(admin)).json()
    rows = [k for k in d['yearly_kpis'] if k.get('year') == 2025]
    assert len(rows) == 1 and rows[0]['dcsi'] == 91

def test_photo_add_and_delete(admin, dealer_id):
    img = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
    r = requests.post(f'{A}/dealers/{dealer_id}/photos', headers=H(admin),
                     json={'category': 'showroom', 'base64_image': img})
    assert r.status_code == 200, r.text
    d = requests.get(f'{A}/dealers/{dealer_id}', headers=H(admin)).json()
    photos = d.get('showroom_photos', [])
    assert len(photos) >= 1
    r2 = requests.delete(f'{A}/dealers/{dealer_id}/photos/showroom/0', headers=H(admin))
    assert r2.status_code == 200

# ---------------- PDF ----------------
def test_dealer_pdf(admin, dealer_id):
    r = requests.get(f'{A}/dealers/{dealer_id}/report.pdf', headers=H(admin))
    assert r.status_code == 200, r.text[:200]
    assert 'application/pdf' in r.headers.get('content-type', '')
    assert len(r.content) > 500
    assert r.content[:4] == b'%PDF'

# ---------------- group outlets ----------------
def test_group_dashboard_outlets(admin, group_id):
    r = requests.get(f'{A}/groups/{group_id}/dashboard', headers=H(admin))
    assert r.status_code == 200
    d = r.json()
    outlets = d['outlets']
    assert len(outlets) >= 1
    o0 = outlets[0]
    assert 'metrics' in o0
    for k in ['current_year_actual', 'growth_pct', 'ytd_actual', 'performance_flag']:
        assert k in o0['metrics'], f'missing {k} in outlet metrics'

# ---------------- import validation ----------------
def test_import_missing_columns(admin):
    df = pd.DataFrame([{'name': 'bad', 'foo': 'bar'}])
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine='openpyxl') as w:
        df.to_excel(w, index=False)
    buf.seek(0)
    r = requests.post(f'{A}/import/dealers', headers=H(admin),
                     files={'file': ('t.xlsx', buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})
    # should return errors array (200 with errors or 400)
    assert r.status_code in (200, 400)
    j = r.json()
    assert 'errors' in j or 'detail' in j

def test_import_skips_missing_required(admin):
    df = pd.DataFrame([
        {'dealer_name': 'TEST_OK', 'dealer_code': 'TEST-OK-1', 'region': 'North', 'state': 'D', 'city': 'D', 'tier': 'T1', 'dealer_type': '3S'},
        {'dealer_name': '', 'dealer_code': '', 'region': 'N', 'state': 'D', 'city': 'D', 'tier': 'T1', 'dealer_type': '3S'},
    ])
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine='openpyxl') as w:
        df.to_excel(w, index=False)
    buf.seek(0)
    r = requests.post(f'{A}/import/dealers', headers=H(admin),
                     files={'file': ('t.xlsx', buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})
    assert r.status_code == 200
    j = r.json()
    assert j.get('inserted', 0) >= 1
    assert 'errors' in j
