# 시안에 넣을 색인·자료를 저장소 JSON 에서 뽑는다(읽기만). 출력: data.json
import json, re, sys, collections
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
    prj[code] = [[p['id'].split('-')[2], p['name'], int(p['stage']), p['units'] or 0,
                  NEXT.index(p['next']['eventType']) if p.get('next') else -1, (p.get('next') or {}).get('planned') or ''] for p in L]
# 사업 카드 자료(project-detail): 사업 id → [시행 기관 이름, [모집 공고·착공·준공·입주 각 [날짜, 실제 1 / 예정 0] 또는 None]]. 실제가 있으면 실제
pd = json.load(open(R + 'data/board/project-detail.json'))
AG = {'lh': 'LH', 'gh': 'GH', 'sh': 'SH', 'local': '지자체', 'mnd': '국방부'}
det = {}
for pid, x in pd['projects'].items():
    st = x.get('stages') or {}
    s = [([st[k]['actual'], 1] if st.get(k, {}).get('actual') else [st[k]['plan'], 0] if st.get(k, {}).get('plan') else None) for k in NEXT]
    if x.get('agency') or any(s): det[pid] = [AG.get(x.get('agency'), ''), s]
TYPES = rc['kinds']
cal = []
for sd, L in rc['sido'].items():
    for e in L:
        cal.append([code_of_name.get(e['sgg']) if e['sgg'] not in names_in_idx else [k for k, v in sgg.items() if v == e['sgg']][0], e['ym'], e['day'] or 0, TYPES.index(e['type']), e['name'], e['units'] or 0, e['id']])
sggs = [[k, v, 0] for k, v in sorted(sgg.items())] + [[k, v, 1] for k, v in sorted(zero.items())]
meta = {'ledgerRef': lm['referenceDate'], 'ledgerMonth': lm['observedMonth'], 'calRef': rc['referenceDate'], 'calFrom': rc['from'], 'calTo': rc['to'],
        'idxRef': pi['referenceDate'], 'today': '2026-10-16'}
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
# 가구 증가(통계청 장래가구추계, 시도 단위): 올해 → 내년 차이. 자료가 있는 시도만(지금은 서울·인천·경기)
af = json.load(open(R + 'data/board/area-facts.json'))
y0 = meta['today'][:4]; y1 = str(int(y0) + 1)
hh = {sd: [v['forecast_households'][y1] - v['forecast_households'][y0], y0, y1]
      for sd, v in af['sido'].items() if y0 in v.get('forecast_households', {}) and y1 in v['forecast_households']}
out = {'meta': meta, 'sgg': sggs, 'prj': prj, 'cal': cal, 'neigh': neigh, 'map': mapdoc, 'hh': hh, 'det': det}
json.dump(out, open(sys.argv[1], 'w'), ensure_ascii=False, separators=(',', ':'))
print('zero', zero); print('neigh', {k: [(c, sgg[c], len(lm['bySgg'][c])) for c in v] for k, v in neigh.items()})
print('adj 41280', [AREAS[c] for c in adj['41280']], 'none', [c for c, v in adj.items() if not v])
print('sgg', len(sggs), 'prj', sum(len(v) for v in prj.values()), 'cal', len(cal), 'det', len(det))
