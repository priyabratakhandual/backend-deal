import os, io, pytest, requests, pandas as pd

BASE = os.environ.get('REACT_APP_BACKEND_URL', 'https://dealer-dashboard-pro-1.preview.emergentagent.com').rstrip('/')
A = BASE + '/api'

@pytest.fixture(scope='module')
def admin():
    r = requests.post(f'{A}/auth/login', json={'email': 'admin@globtier.com', 'password': 'admin123'})
    assert r.status_code == 200, r.text
    d = r.json()
    assert 'token' in d and d['role'] == 'admin'
    assert 'access_token' in r.cookies
    return d['token']

@pytest.fixture(scope='module')
def viewer():
    r = requests.post(f'{A}/auth/login', json={'email': 'viewer@globtier.com', 'password': 'viewer123'})
    assert r.status_code == 200
    return r.json()['token']

def H(t): return {'Authorization': f'Bearer {t}'}

def test_login_invalid():
    r = requests.post(f'{A}/auth/login', json={'email': 'admin@globtier.com', 'password': 'wrong'})
    assert r.status_code == 401

def test_me(admin):
    r = requests.get(f'{A}/auth/me', headers=H(admin))
    assert r.status_code == 200
    u = r.json()
    assert u['email'] == 'admin@globtier.com'
    assert '_id' not in u and 'password_hash' not in u

def test_me_no_token():
    r = requests.get(f'{A}/auth/me')
    assert r.status_code == 401

def test_logout(admin):
    s = requests.Session()
    s.post(f'{A}/auth/login', json={'email': 'admin@globtier.com', 'password': 'admin123'})
    r = s.post(f'{A}/auth/logout')
    assert r.status_code == 200

def test_dealers_list(admin):
    r = requests.get(f'{A}/dealers', headers=H(admin))
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) >= 6
    groups = [x for x in rows if x['type'] == 'group']
    singles = [x for x in rows if x['type'] == 'single']
    assert len(groups) >= 1 and len(singles) >= 5
    for r0 in rows:
        m = r0['metrics']
        for k in ['current_year_actual', 'current_year_target', 'achievement_pct',
                  'growth_pct', 'performance_flag', 'ytd_actual', 'ytd_growth_pct', 'by_year']:
            assert k in m

def test_dealer_filter_group(admin):
    r = requests.get(f'{A}/dealers?type=group', headers=H(admin))
    assert r.status_code == 200
    assert all(x['type'] == 'group' for x in r.json())

def test_dealer_filter_region(admin):
    r = requests.get(f'{A}/dealers?region=North', headers=H(admin))
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) >= 1 and all(x['region'] == 'North' for x in rows)

def test_dealer_get_one(admin):
    rows = requests.get(f'{A}/dealers', headers=H(admin)).json()
    did = rows[0]['id']
    r = requests.get(f'{A}/dealers/{did}', headers=H(admin))
    assert r.status_code == 200
    d = r.json()
    assert 'monthly_sales' in d and 'yearly_kpis' in d and 'metrics' in d

def test_create_dealer_admin_and_viewer_403(admin, viewer):
    payload = {'type': 'single', 'dealer_name': 'TEST_Dealer_X', 'dealer_code': 'TEST-X-001',
               'region': 'North', 'state': 'Delhi', 'city': 'New Delhi', 'tier': 'T1', 'dealer_type': '3S'}
    r = requests.post(f'{A}/dealers', headers=H(admin), json=payload)
    assert r.status_code == 200, r.text
    did = r.json()['id']
    # viewer 403
    r2 = requests.post(f'{A}/dealers', headers=H(viewer), json=payload)
    assert r2.status_code == 403
    # update
    payload['city'] = 'Gurugram'
    r3 = requests.put(f'{A}/dealers/{did}', headers=H(admin), json=payload)
    assert r3.status_code == 200
    assert r3.json()['city'] == 'Gurugram'
    # cleanup
    requests.delete(f'{A}/dealers/{did}', headers=H(admin))

def test_group_dashboard(admin):
    rows = requests.get(f'{A}/dealers?type=group', headers=H(admin)).json()
    gid = rows[0]['id']
    r = requests.get(f'{A}/groups/{gid}/dashboard', headers=H(admin))
    assert r.status_code == 200
    d = r.json()
    assert d['group']['type'] == 'group'
    t = d['totals']
    for k in ['showroom_owned', 'showroom_leased', 'workshop_owned', 'workshop_leased']:
        assert k in t
    assert len(d['group']['outlets']) == 4

def test_overview(admin):
    r = requests.get(f'{A}/overview', headers=H(admin))
    assert r.status_code == 200
    d = r.json()
    assert d['total_dealers'] >= 6
    assert d['groups'] >= 1 and d['singles'] >= 5
    assert 'achievement_pct' in d and 'flags' in d

def test_benchmarks(admin):
    r = requests.get(f'{A}/benchmarks', headers=H(admin))
    assert r.status_code == 200
    rows = r.json()
    years = sorted([x['year'] for x in rows])
    assert 2023 in years and 2024 in years and 2025 in years
    # admin update
    r2 = requests.put(f'{A}/benchmarks/2025', headers=H(admin), json={'year': 2025, 'gross_profit_avg': 200})
    assert r2.status_code == 200

def test_export(admin):
    r = requests.get(f'{A}/export/dealers', headers=H(admin))
    assert r.status_code == 200
    assert 'spreadsheetml' in r.headers.get('content-type', '')
    assert len(r.content) > 100

def test_import(admin):
    df = pd.DataFrame([{'dealer_name': 'TEST_Imp_1', 'dealer_code': 'TEST-IMP-1', 'region': 'North',
                        'state': 'Delhi', 'city': 'New Delhi', 'tier': 'T1', 'dealer_type': '3S',
                        'dealer_principal': 'Test', 'mobile': '9', 'email': 't@t.com'}])
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine='openpyxl') as w:
        df.to_excel(w, index=False)
    buf.seek(0)
    r = requests.post(f'{A}/import/dealers', headers=H(admin),
                      files={'file': ('t.xlsx', buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})
    assert r.status_code == 200
    assert r.json()['inserted'] >= 1

def test_import_viewer_403(viewer):
    buf = io.BytesIO(b'x')
    r = requests.post(f'{A}/import/dealers', headers=H(viewer),
                      files={'file': ('t.xlsx', buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})
    assert r.status_code == 403
