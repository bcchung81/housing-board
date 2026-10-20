# 시안에 넣을 색인·자료를 저장소 JSON 에서 뽑는다(읽기만). 출력: data.json
import json, re, sys, collections, datetime
import os
R = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..')) + '/'
pi = json.load(open(R + 'data/board/projects-index.json'))
lm = json.load(open(R + 'data/board/ledger-map.json'))
rc = json.load(open(R + 'data/board/region-calendar.json'))
rm = json.load(open(R + 'data/board/region-map.json'))
areas = json.load(open(R + 'schemas/ledger-2026-10/tables/areas.json'))['rows']
sgg = pi['sgg']
assert set(sgg) == set(lm['bySgg'])
code_of_name = {r['area_name']: r['area_code'] for r in areas if r['level'] == 'SGG'}
SDN = {'11': '서울특별시', '28': '인천광역시', '41': '경기도'}

# 수도권 경계(region-map)에는 있으나 원장에 사업이 없는 시군구 — 코드는 행정표준코드 표(areas)
names_in_idx = set(sgg.values())
zero = {}
for s in rm['sgg']:
    full = SDN[s['s']] + ' ' + s['n']
    if full in names_in_idx: continue
    if any(v.startswith(full + ' ') for v in names_in_idx): continue   # 고양시·용인시: 구가 색인에 있음
    zero[code_of_name[full]] = full

# 이웃: region-map 경계 꼭짓점을 2개 이상 공유
def pts(dstr):
    out = set(); x = y = 0; sx = sy = 0
    for cmd, body in re.findall(r'([Mlz])([^Mlz]*)', dstr):
        nums = list(map(int, body.split())) if body.strip() else []
        if cmd == 'M': x, y = nums[0], nums[1]; out.add((x, y)); nums = nums[2:]; cmd = 'l'
        if cmd == 'l':
            for i in range(0, len(nums), 2): x += nums[i]; y += nums[i + 1]; out.add((x, y))
    return out
P = {SDN[s['s']] + ' ' + s['n']: pts(s['d']) for s in rm['sgg']}
def codes_for(full):
    return [code_of_name[full]] if full in code_of_name and code_of_name[full] in sgg else []   # 구 일부만 색인에 있는 시(용인)는 이웃으로 넘기지 않는다
neigh = {}
for zc, zn in zero.items():
    ns = []
    for other, pp in P.items():
        if other == zn: continue
        if len(P[zn] & pp) >= 2: ns += codes_for(other)
    neigh[zc] = [c for c in ns if c in sgg]

NEXT = ['SUPPLY_NOTICE', 'CONSTRUCTION_START', 'COMPLETION', 'MOVE_IN']
prj = {}
for code, L in lm['bySgg'].items():
    # 다음 고비(원장 next): 종류 번호(NEXT) · 예정일('2027-09-27' · '2026-10' · '2027'), 없으면 -1 · ''
    # 7번째 칸(있을 때만): 사업 필지 PNU — 공고(마이홈·청약홈) pnu 와 사업을 코드로만 잇는다(이름으로 잇지 않는다)
    prj[code] = [[p['id'].split('-')[2], p['name'], int(p['stage']), p['units'] or 0,
                  NEXT.index(p['next']['eventType']) if p.get('next') else -1, (p.get('next') or {}).get('planned') or ''] + ([p['pnus']] if p.get('pnus') else []) for p in L]
# 원장 판정(사업 일정표 상태 칩, 정책 화면과 같은 판정 lib/board/projects-view statusOf): 시군구 → { 번호: [0 정상 · 1 주의 · 2 지연, 예정일 경과 개월, 경과한 고비 번호(0 모집 공고 · 1 착공 · 2 준공 · 3 입주 · 4 허가 · 없으면 -1)] }.
# 판정이 있는 번호 있는 사업만(번호 없는 후보는 '확인 필요'라 판정에 넣지 않는다 — 없으면 '일정 미정')
JD = {'ok': 0, 'caution': 1, 'delay': 2}
JDEV = {'SUPPLY_NOTICE': 0, 'CONSTRUCTION_START': 1, 'COMPLETION': 2, 'MOVE_IN': 3, 'PERMIT': 4}   # 세 번째 칸 = 예정일이 지난 고비(없으면 -1) — 화면이 '준공 예정일이 n개월 지났어요' 를 만든다
jd = {}
for code, L in lm['bySgg'].items():
    m = {p['id'].split('-')[2]: [JD[p['cls']], (p.get('overdue') or {}).get('months') or 0, JDEV.get((p.get('overdue') or {}).get('eventType'), -1)] for p in L if p.get('issued') and p.get('cls') in JD}
    if m: jd[code] = m
# 사업 카드 자료(project-detail): 사업 id → [시행 기관 이름, [모집 공고·착공·준공·입주 각 [날짜, 실제 1 / 예정 0] 또는 None]]. 실제가 있으면 실제
pd = json.load(open(R + 'data/board/project-detail.json'))
AG = {'lh': 'LH', 'gh': 'GH', 'sh': 'SH', 'ih': 'iH', 'local': '지자체', 'mnd': '국방부'}
det = {}
for pid, x in pd['projects'].items():
    st = x.get('stages') or {}
    s = [([st[k]['actual'], 1] if st.get(k, {}).get('actual') else [st[k]['plan'], 0] if st.get(k, {}).get('plan') else None) for k in NEXT]
    if x.get('agency') or any(s): det[pid] = [AG.get(x.get('agency'), ''), s]
# 준공·입주(2026-10-20 일반사용자 6단계): 원장 단계(stage)는 06 까지라 입주를 가르지 못한다. 화면 사업(project-detail)에 실제 준공·입주일이 있으면 단계를 올린다
# (실제 입주일 → 7 입주, 실제 준공일 → 6 준공). 기록이 없으면 그대로 — 지금은 두 단계 모두 0 이다. 큰 숫자(공급 예정 호수)는 이 둘을 세지 않는다
for code, rows in prj.items():
    for row in rows:
        s = (det.get(f'PRJ-{code}-{row[0]}') or [None, []])[1]
        if len(s) > 3 and s[3] and s[3][1]: row[2] = 7
        elif len(s) > 2 and s[2] and s[2][1]: row[2] = max(row[2], 6)
TYPES = rc['kinds']
cal = []
for sd, L in rc['sido'].items():
    for e in L:
        cal.append([code_of_name.get(e['sgg']) if e['sgg'] not in names_in_idx else [k for k, v in sgg.items() if v == e['sgg']][0], e['ym'], e['day'] or 0, TYPES.index(e['type']), e['name'], e['units'] or 0, e['id']])
sggs = [[k, v, 0] for k, v in sorted(sgg.items())] + [[k, v, 1] for k, v in sorted(zero.items())]
meta = {'ledgerRef': lm['referenceDate'], 'ledgerMonth': lm['observedMonth'], 'calRef': rc['referenceDate'], 'calFrom': rc['from'], 'calTo': rc['to'],
        'idxRef': pi['referenceDate'], 'today': datetime.date.today().isoformat()}   # 빌드한 날(가구 증가 해 계산용). 화면의 '오늘'은 브라우저의 실제 날짜
# 지도 그림: region-map 경계(자체 투영) + 면 코드(lib/board/metro-overview.ts AREAS 를 그대로 읽는다) + 안쪽 대표점
ts = open(R + 'lib/board/metro-overview.ts').read()
areas_str = ''.join(re.findall(r"'([^']*)'", re.search(r"const AREAS = ([^;]*);", ts).group(1)))
AREAS = {t.split(':')[0]: t.split(':')[1].replace('_', ' ') for t in areas_str.split()}
code_of_unit = {(c[:2], n): c for c, n in AREAS.items()}
def rings(dstr):
    out = []; x = y = 0
    for cmd, body in re.findall(r'([Mlz])([^Mlz]*)', dstr):
        nums = list(map(int, body.split())) if body.strip() else []
        if cmd == 'M': x, y = nums[0], nums[1]; out.append([(x, y)]); nums = nums[2:]; cmd = 'l'
        if cmd == 'l':
            for i in range(0, len(nums), 2): x += nums[i]; y += nums[i + 1]; out[-1].append((x, y))
    return out
def inside(pt, ring):
    x, y = pt; c = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: c = not c
    return c
def anchor(dstr):
    best = None
    for r in rings(dstr):
        a = cx = cy = 0
        for (x1, y1), (x2, y2) in zip(r, r[1:] + r[:1]):
            k = x1 * y2 - x2 * y1; a += k; cx += (x1 + x2) * k; cy += (y1 + y2) * k
        if a and (not best or abs(a) > abs(best[0])): best = (a, cx / (3 * a), cy / (3 * a), r)
    a, cx, cy, r = best
    if not inside((cx, cy), r):   # 오목한 면: 무게중심 높이의 가로줄에서 가장 긴 안쪽 구간의 가운데
        xs = sorted(x1 + (cy - y1) * (x2 - x1) / (y2 - y1) for (x1, y1), (x2, y2) in zip(r, r[1:] + r[:1]) if (y1 > cy) != (y2 > cy))
        segs = [(xs[i], xs[i + 1]) for i in range(0, len(xs) - 1, 2)]
        l, h = max(segs, key=lambda t: t[1] - t[0]); cx = (l + h) / 2
    return round(cx), round(cy)
# 지도 숫자 라벨 자리: 면 안에서 가장 넓은 곳(polylabel, 가장자리에서 가장 먼 점). 가장 넓은 고리 기준, 격자 칸을 쪼개 가며 찾는다
import heapq, math
def seg_d2(px, py, a, b):
    x, y = a; dx, dy = b[0] - x, b[1] - y
    if dx or dy:
        t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy)
        if t > 1: x, y = b
        elif t > 0: x += dx * t; y += dy * t
    return (px - x) ** 2 + (py - y) ** 2
def pdist(px, py, ring):
    ins = inside((px, py), ring)
    d = min(seg_d2(px, py, a, b) for a, b in zip(ring, ring[1:] + ring[:1]))
    return (1 if ins else -1) * math.sqrt(d)
def polylabel(ring, prec=1.0):
    xs = [p[0] for p in ring]; ys = [p[1] for p in ring]
    x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
    size = min(x1 - x0, y1 - y0)
    if size == 0: return x0, y0, 0
    h = size / 2; q = []
    def cell(x, y, h): d = pdist(x, y, ring); return (-(d + h * math.sqrt(2)), x, y, h, d)
    x = x0
    while x < x1:
        y = y0
        while y < y1: heapq.heappush(q, cell(x + h, y + h, h)); y += size
        x += size
    cx, cy = anchor_xy = (sum(xs) / len(xs), sum(ys) / len(ys))
    best = (pdist(cx, cy, ring), cx, cy)
    while q:
        _, x, y, h, d = heapq.heappop(q)
        if d > best[0]: best = (d, x, y)
        if d + h * math.sqrt(2) - best[0] <= prec: continue
        h /= 2
        for dx in (-h, h):
            for dy in (-h, h): heapq.heappush(q, cell(x + dx, y + dy, h))
    return best[1], best[2], best[0]
def area(r): return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(r, r[1:] + r[:1]))) / 2
units = []
for g in rm['sgg']:
    code = code_of_unit[(g['s'], g['n'])]
    cx, cy = anchor(g['d'])
    lx, ly, lr = polylabel(max(rings(g['d']), key=area))
    units.append([code, g['s'], g['n'], g['d'], cx, cy, round(lx, 1), round(ly, 1), round(lr, 1)])
# 지도 면 이웃(같은 시도, 말풍선 카드 목록): 경계 꼭짓점을 2개 이상 공유하면 이웃
UP = {u[0]: pts(u[3]) for u in units}
adj = {u[0]: [o[0] for o in units if o[0] != u[0] and o[1] == u[1] and len(UP[u[0]] & UP[o[0]]) >= 2] for u in units}
mapdoc = {'view': rm['view'], 'units': units, 'edition': rm.get('edition'), 'adj': adj}
# 공고 0건 넓히기용 이웃(수도권 지도 면 전부, 시도 경계를 넘어서도): 경계 꼭짓점을 2개 이상 공유. 코드는 지도 면 코드(경기는 시)
nb = {u[0]: [o[0] for o in units if o[0] != u[0] and len(UP[u[0]] & UP[o[0]]) >= 2] for u in units}
# 데모판 공고 표본(운영판은 /api/v1/notices): 마이홈 원천(schemas/ledger-2026-10/raw/myhome) 수도권 행을 API 와 같은 모양으로. 키·개인 정보 없음.
# 날짜는 받은 날(sampleRef) 기준이라 화면이 오늘 날짜만큼 옮겨 보인다(표본임을 ⓘ에 적는다)
TGT = [('신혼부부', r'신혼'), ('신생아', r'신생아'), ('청년', r'청년'), ('다자녀', r'다자녀'), ('고령자', r'고령자')]
def ymd(v): v = str(v or ''); return f'{v[:4]}-{v[4:6]}-{v[6:8]}' if len(v) == 8 else None
notices, seen = [], set()
mh = json.load(open(R + 'schemas/ledger-2026-10/raw/myhome/manifest.json'))
for kind in ('rental', 'sale'):
    for x in json.load(open(R + f'schemas/ledger-2026-10/raw/myhome/{kind}.json'))['items']:
        if x.get('brtcNm') not in SDN.values(): continue
        sg = (x.get('pnu') or '')[:5] or code_of_name.get(f"{x['brtcNm']} {x.get('signguNm') or ''}".strip())
        nid = f"rental-{x['pblancId']}" if kind == 'rental' else f"sale-{x['pblancId']}-{x['houseSn']}"
        if not sg or not ymd(x.get('endDe')) or (nid, sg) in seen: continue
        seen.add((nid, sg))
        notices.append({'id': nid, 'kind': kind, 'title': x['pblancNm'], 'agency': x.get('suplyInsttNm'), 'status': x.get('sttusNm'), 'housingType': x.get('houseTyNm'),
                        'supplyType': x.get('suplyTyNm') or None, 'complex': x.get('hsmpNm') or None, 'units': x.get('sumSuplyCo') or None, 'address': (x.get('fullAdres') or '').strip() or None,
                        'pnu': x.get('pnu') or None, 'announcedAt': ymd(x.get('rcritPblancDe')), 'applyFrom': ymd(x.get('beginDe')), 'applyTo': ymd(x.get('endDe')), 'url': x.get('pcUrl'), 'source': 'myhome',
                        'deposit': x.get('rentGtn') or None, 'monthlyRent': x.get('mtRntchrg') or None, 'targets': [t for t, rx in TGT if re.search(rx, x['pblancNm'])], 'sgg': sg})
meta['sampleRef'] = mh['fetched_at'][:10]
# 가구 증가(통계청 장래가구추계, 시도 단위): 올해 → 내년 차이. 자료가 있는 시도만(지금은 서울·인천·경기)
af = json.load(open(R + 'data/board/area-facts.json'))
y0 = meta['today'][:4]; y1 = str(int(y0) + 1)
hh = {sd: [v['forecast_households'][y1] - v['forecast_households'][y0], y0, y1]
      for sd, v in af['sido'].items() if y0 in v.get('forecast_households', {}) and y1 in v['forecast_households']}
# 사업 위치 점(r14): data/board/home-map/<시군구>.json 의 loc{by, at:[경도,위도]} → region-map 과 같은 자체 투영(tools/ledger/region-supply.js proj) 정수 [x, y, 정확 1 / 근사 0].
# 정확 = 블록 라벨점·주소·지구 대표점, 근사 = 영역 근사·이름 검색. 사업 id 는 원장(ledger-map)과 같은 'PRJ-<시군구>-<번호>'
import glob
GEO_COS = math.cos(37.5 * math.pi / 180)
EXACT = {'block': 1, 'address': 1, 'district': 1, 'area': 0, 'name': 0}
lid = {p['id'] for L in lm['bySgg'].values() for p in L}
pt = {}
for f in sorted(glob.glob(R + 'data/board/home-map/*.json')):
    for p in json.load(open(f))['projects']:
        l = p.get('loc') or {}
        if p['id'] in lid and l.get('at') and l.get('by') in EXACT:
            lon, lat = l['at']; pt[p['id']] = [round((lon - 124.5) * GEO_COS * 1000), round((38.4 - lat) * 1000), EXACT[l['by']]]
# 사업 카드 덧붙임(ex): 사업 id → [유형 번호(pg), 법정동 이름, 공고 물량, [다른 기관, 예정일], [공정률 기준 날짜, 최근 %, 3개월 전 %]]. 값이 없는 칸은 null, 뒤쪽 null 은 자른다.
# 유형 = projects-index programs 첫 값(화면용 짧은 이름 표 PG_SHORT, 원래 이름은 title) · 법정동 = home-map bjd → areas.json BJD 이름의 마지막 낱말 · 공고 물량 = home-map noticeUnits
# 다른 기관 예정일 = home-map dateAlt · 공정률 = project-detail progress 의 최근 값과 그 날짜 3개월 전(그날 이전 마지막 값, 없으면 null). 전체 시계열은 넣지 않는다
PG_SHORT = {'공공주택 건설': '공공주택 건설', '도심 공공주택 복합사업': '도심 복합사업', '노후청사·공공부지': '노후청사·공공부지', '공공택지·공공분양': '공공택지 분양', '3기 신도시': '3기 신도시', '건설형 공공임대': '공공임대 건설',
            '노후 공공임대 재건축': '노후 임대 재건축', '공공시설·유휴부지 개발': '공공시설·유휴부지 개발', '군 유휴부지': '군 유휴부지', '도심 내 유휴부지 활용 공급': '도심 유휴부지 활용', '철도부지 복합개발': '철도부지 복합개발',
            '공공시설 이전': '공공시설 이전', '서울 남부권 공공택지 공급 조기화': '남부권 공공택지 공급', '신규 공공주택지구': '신규 주택지구', '우수입지 공공택지 분양': '우수입지 택지 분양', '유휴부지·노후청사 복합개발': '유휴·청사 복합개발',
            '공공택지 공급 조기화': '공공택지 공급',
            # 2026-10-20 HOME 판에 새로 생긴 프로그램 5개(사용자 결정 짧은 이름)
            'LH 직접시행 전환·토지이용 효율화': 'LH 직접시행 전환', 'iH 공공분양': 'iH 공공분양', 'iH 통합공공임대': 'iH 통합공공임대', 'iH 공공분양, 공공임대(6년 분양전환)': 'iH 분양·임대', 'iH 주택건설 후보': 'iH 주택건설 후보'}
assert {x['name'] for x in pi['programs']} <= set(PG_SHORT), [x['name'] for x in pi['programs'] if x['name'] not in PG_SHORT]
pg = [[PG_SHORT[x['name']], x['name']] for x in pi['programs']]
BJD = {r['area_code']: r['area_name'].split(' ')[-1] for r in areas if r['level'] == 'BJD'}
def months_before(d, n):
    y, m, dd = int(d[:4]), int(d[5:7]), int(d[8:10]); m -= n
    while m < 1: m += 12; y -= 1
    return '%04d-%02d-%02d' % (y, m, min(dd, __import__('calendar').monthrange(y, m)[1]))
ex = {}
hm = {}
for f in sorted(glob.glob(R + 'data/board/home-map/*.json')):
    for p in json.load(open(f))['projects']: hm[p['id']] = p
for pid in lid:
    pr = (pi['projects'].get(pid) or {}).get('programs') or []
    h = hm.get(pid) or {}
    da = h.get('dateAlt')
    sr = [x for x in ((pd['projects'].get(pid) or {}).get('progress') or []) if x[1] is not None]
    pgs = None
    if sr:
        last = sr[-1]; old = [x for x in sr if x[0] <= months_before(last[0], 3)]
        pgs = [last[0][:7], round(last[1], 2), round(old[-1][1], 2) if old else None]
    v = [[x['name'] for x in pi['programs']].index(pr[0]) if pr else None, BJD.get(h.get('bjd')) if h.get('bjd') else None, h.get('noticeUnits') or None,
         [da['source'], da['planned']] if da and da.get('planned') else None, pgs]
    while v and v[-1] is None: v.pop()
    if v: ex[pid] = v

# 청약 단지 카드(ah, 2026-10-19 사용자 결정): 청약홈 APT 분양 공고(공공·민영). 원장 notices 의 APPLYHOME 행(시군구 코드 + notice_id = 관리번호-공고번호)으로
# raw Detail·Mdl 을 코드로만 잇는다(이름·제목으로 잇지 않는다). 공고일이 수집 기준일 2년 안. 단위 = 지도 면(경기는 시, 그 밖은 시군구 — 화면 unitKey 와 같은 규칙).
# 줄: [단지명, 세대, 구분(0 공공분양 · 1 민영), 법정동, 입주 예정 연월, 전용 최소, 최대, 시공·시행, 공고일, 접수 시작(특별공급 먼저), 접수 마감, 발표, 계약 시작, 계약 끝, 원문, 규제 비트, 특별공급 세대(주택형 줄 없으면 null), 유형별 세대 9칸(신혼부부·생애최초·다자녀·노부모·기관추천·청년·신생아·이전기관·기타, 모두 0 이면 [])]
# (정렬용 관리번호는 18번째 칸으로 두었다가 화면으로 보낼 때 자른다 — r[:18])
# 단계는 화면이 오늘 날짜로 계산한다. 크기를 줄이려고 빌드한 날에 끝나지 않은 줄 전부 + 끝난 줄은 공고 최근 5개만 둔다(끝난 줄은 다시 진행 중이 되지 않는다)
AH = 'schemas/ledger-2026-10/raw/applyhome/'
ahm = json.load(open(R + AH + 'manifest.json'))
ah_ref = ahm['fetched_at'][:10]
ah_from = '%04d%s' % (int(ah_ref[:4]) - 2, ah_ref[4:])
ah_sgg = {r['notice_id']: r for r in json.load(open(R + 'schemas/ledger-2026-10/tables/notices.json'))['rows'] if r['notice_system'] == 'APPLYHOME' and r.get('sgg_code')}
AH_SP = ['NWWDS_HSHLDCO', 'LFE_FRST_HSHLDCO', 'MNYCH_HSHLDCO', 'OLD_PARNTS_SUPORT_HSHLDCO', 'INSTT_RECOMEND_HSHLDCO', 'YGMN_HSHLDCO', 'NWBB_HSHLDCO', 'TRANSR_INSTT_ENFSN_HSHLDCO', 'ETC_HSHLDCO']
ah_mdl = collections.defaultdict(list)
for m in json.load(open(R + AH + 'getAPTLttotPblancMdl.json'))['rows']: ah_mdl[(m['HOUSE_MANAGE_NO'], m['PBLANC_NO'])].append(m)
BJD_IN = collections.defaultdict(set)
for k, v in BJD.items(): BJD_IN[k[:5]].add(v)
def ah_co(s):   # '(주)'·'㈜'·'주식회사' 떼기, 여럿이면 ', '
    return ', '.join(x for x in (re.sub(r'\s+', ' ', re.sub(r'\(\s*주\s*\)|㈜|주식회사', ' ', p)).strip() for p in (s or '').split(',')) if x)
def ah_ag(s):   # 공공 사업주체 약칭
    out = []
    for p in ah_co(s).split(', '):
        q = p.replace(' ', '')
        out.append('LH' if '한국토지주택공사' in q else 'SH' if q.startswith('서울주택도시') else 'GH' if q.startswith('경기주택도시공사') else 'iH' if q.startswith('인천도시공사') else p)
    return ', '.join(x for i, x in enumerate(out) if x and x not in out[:i])
def ah_dong(n, d):   # 법정동: 공고 PNU 앞 10자리 → areas BJD, 없으면 주소 낱말 가운데 그 시군구의 법정동 이름(코드표로 확인한 것만)
    b = BJD.get((n.get('pnu') or '')[:10])
    if b: return b
    names = BJD_IN[n['sgg_code']]
    for w in re.split(r'[\s(),]+', d.get('HSSPLY_ADRES') or ''):
        if w in names: return w
    return ''
AH_URL = 'https://www.applyhome.co.kr/ai/aia/selectAPTLttotPblancDetail.do?'   # 원문 주소(PBLANC_URL)의 같은 앞부분은 한 번만(화면이 다시 붙인다)
AH_FLAGS = ['PARCPRC_ULS_AT', 'SPECLT_RDN_EARTH_AT', 'PUBLIC_HOUSE_EARTH_AT', 'IMPRMN_BSNS_AT', 'LRSCL_BLDLND_AT']   # 비트 1 분양가상한제 · 2 투기과열지구 · 4 공공주택지구 · 8 정비사업 · 16 대규모택지
def ah_live(r, t):   # 화면 ahStep 과 같은 규칙: 끝나지 않았으면 True
    s, e, w, c2 = r[9], r[10], r[11], r[13]
    return bool((s and t < s) or (e and t <= e) or (w and t < w) or (c2 and t <= c2))
ah_u = collections.defaultdict(list)
for d in json.load(open(R + AH + 'getAPTLttotPblancDetail.json'))['rows']:
    n = ah_sgg.get(d['HOUSE_MANAGE_NO'] + '-' + d['PBLANC_NO'])
    if not n or (d.get('RCRIT_PBLANC_DE') or '') < ah_from: continue
    c = n['sgg_code']; unit = c[:4] + '0' if c.startswith('41') else c
    ar = [int(float(m.group())) for m in (re.match(r'\d+(\.\d+)?', x['HOUSE_TY'] or '') for x in ah_mdl[(d['HOUSE_MANAGE_NO'], d['PBLANC_NO'])]) if m and float(m.group()) > 0]
    pub = d['HOUSE_DTL_SECD_NM'] == '국민'
    mdl = ah_mdl[(d['HOUSE_MANAGE_NO'], d['PBLANC_NO'])]
    sp = sum(int(x.get('SPSPLY_HSHLDCO') or 0) for x in mdl) if mdl else None   # 주택형 줄이 없으면 모름(null)
    spk = [sum(int(x.get(k) or 0) for x in mdl) for k in AH_SP]
    ah_u[unit].append([d['HOUSE_NM'], d['TOT_SUPLY_HSHLDCO'] or 0, 0 if pub else 1, ah_dong(n, d), d.get('MVN_PREARNGE_YM') or '', min(ar) if ar else 0, max(ar) if ar else 0,
                       ah_ag(d['BSNS_MBY_NM']) if pub else ah_co(d['CNSTRCT_ENTRPS_NM']), d['RCRIT_PBLANC_DE'], d.get('SPSPLY_RCEPT_BGNDE') or d.get('RCEPT_BGNDE') or '', d.get('RCEPT_ENDDE') or '',
                       d.get('PRZWNER_PRESNATN_DE') or '', d.get('CNTRCT_CNCLS_BGNDE') or '', d.get('CNTRCT_CNCLS_ENDDE') or '', d['PBLANC_URL'].removeprefix(AH_URL), sum(1 << i for i, k in enumerate(AH_FLAGS) if d.get(k) == 'Y'),
                       sp, spk if any(spk) else [], d['HOUSE_MANAGE_NO']])
ah_all = sum(len(v) for v in ah_u.values())
for unit, L in ah_u.items():
    L.sort(key=lambda r: (r[8], r[18]), reverse=True)   # 공고 최근 순(같은 날이면 관리번호 큰 순)
    ended = [r for r in L if not ah_live(r, meta['today'])][:5]
    ah_u[unit] = [r[:18] for r in L if ah_live(r, meta['today']) or r in ended]
assert set(ah_u) <= {u[0] for u in units}, set(ah_u) - {u[0] for u in units}
ah = {'ref': ah_ref, 'from': ah_from, 'url': AH_URL, 'u': dict(sorted(ah_u.items()))}

out = {'meta': meta, 'sgg': sggs, 'prj': prj, 'cal': cal, 'neigh': neigh, 'nb': nb, 'map': mapdoc, 'hh': hh, 'det': det, 'jd': jd, 'notices': notices, 'pt': pt, 'pg': pg, 'ex': ex, 'ah': ah}
json.dump(out, open(sys.argv[1], 'w'), ensure_ascii=False, separators=(',', ':'))
print('zero', zero); print('neigh', {k: [(c, sgg[c], len(lm['bySgg'][c])) for c in v] for k, v in neigh.items()})
print('adj 41280', [AREAS[c] for c in adj['41280']], 'none', [c for c, v in adj.items() if not v])
print('sgg', len(sggs), 'prj', sum(len(v) for v in prj.values()), 'cal', len(cal), 'det', len(det), 'jd', sum(len(v) for v in jd.values()), 'notices', len(notices), 'nb 41450', nb['41450'], 'pt', len(pt), 'exact', sum(v[2] for v in pt.values()), 'ex', len(ex), 'ex유형', sum(1 for v in ex.values() if v[0] is not None), 'ex동', sum(1 for v in ex.values() if len(v)>1 and v[1]), 'ex공고', sum(1 for v in ex.values() if len(v)>2 and v[2]), 'ex기관', sum(1 for v in ex.values() if len(v)>3 and v[3]), 'ex공정', sum(1 for v in ex.values() if len(v)>4 and v[4]))
print('ah', ah_all, 'kept', sum(len(v) for v in ah['u'].values()), 'units', len(ah['u']), 'empty', [u[0] + ' ' + u[2] for u in units if u[0] not in ah['u']], '동 없음', sum(1 for v in ah['u'].values() for r in v if not r[3]))
