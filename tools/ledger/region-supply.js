'use strict';
/* '지역 공급'(/region) 화면 자료 세 파일을 만든다. 화면은 이 작은 파일만 읽는다(원장 표·HOME 원본을 서버 번들에 싣지 않는다).
     data/board/region-calendar.json  앞으로 12개월 모집·준공·입주 예정(원장 전국, 사업마다 종류당 현재 예정 하나), 위치(점)와 위치 근거.
                                      drawer = 사업 화면 서랍(/projects?id=)이 여는 사업(사업 id 가 있는 수도권 HOME 사업)
     data/board/region-map.json       서울 25·경기 31·인천 11 시군구 경계 + 공공주택지구(공동주택용지) 경계를 줄인 SVG 경로, 시도별 보기 상자
     data/board/region-annual.json    서울·인천·경기 HOME 통계(통계누리 시도 자료)의 월 실적·연 인허가 — 화면은 2018~2021 을 통계누리(molit.json) 앞에 잇는다
   입력: schemas/ledger-<달>/tables(projects·events·sources·areas), data/board/ledger-map.json·home-map/*.json,
         그 달의 가장 늦은 HOME 판 원본(raw/home/<덤프시각>/municipality·policy_municipality·district·statistic.jsonl.gz — gitignore, 없으면 멈춘다).
   계산은 승인된 시안(docs/design/home-concept/build-data.mjs 의 calendar·areaMap·annual.metro)과 같다. 출력은 결정적이다(정렬, 현재 시각 없음).
   HOME 원본의 담당자 이름·입력 사유 칸은 읽지 않는다(경계·통계·지구 이름만).
   실행: node tools/ledger/region-supply.js [--month YYYY-MM] */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const P = require('./paths');
const { latestHomeDir } = require('./home-source');

const OUT = { calendar: 'data/board/region-calendar.json', map: 'data/board/region-map.json', annual: 'data/board/region-annual.json' };
const KINDS = ['SUPPLY_NOTICE', 'COMPLETION', 'MOVE_IN'];
const METRO = { '서울특별시': '11', '인천광역시': '28', '경기도': '41' };

/* ---------- 달 ---------- */
const addM = (ym, n) => { const k = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + n; return `${Math.floor(k / 12)}-${String(k % 12 + 1).padStart(2, '0')}`; };
const monthOf = (e) => (e.event_date ? e.event_date.slice(0, 7) : e.event_month ?? (e.event_year != null ? `${e.event_year}-12` : null));

/* ---------- 앞으로 12개월(종류마다 현재 예정 하나 — tools/ledger/board.js 와 같은 순위) ---------- */
const SOURCE_RANK = {
  MOVE_IN: ['datagokr-15111714', 'datagokr-15057999', 'datagokr-15098547', /^home-dump-.+-notice$/, /^home-dump-[^-]+$/],
  COMPLETION: [/^home-dump-[^-]+$/, /^home-dump-.+-lh-plan$/],
};
const rankOf = (e) => { const i = SOURCE_RANK[e.event_type]?.findIndex((x) => (typeof x === 'string' ? x === e.source_ref : x.test(e.source_ref))) ?? -1; return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
const order = (ref) => (ref.startsWith('bundle-') ? 0 : ref === 'hub-hs-basis' ? 1 : ref === 'datagokr-15141761' ? 2 : 3);

/* tables: { projects, events, sources, areas } · mapRows: ledger-map 행(id → name·units) · from: 첫 달 'YYYY-MM'
   돌려주는 것: 시도 코드 → 예정 목록(날짜 → 이름 순). 위치는 placeCalendar 가 붙인다 */
function buildCalendar(tables, mapRows, from) {
  const months = Array.from({ length: 12 }, (_, i) => addM(from, i));
  const sggName = Object.fromEntries(tables.areas.filter((a) => a.level === 'SGG').map((a) => [a.area_code, a.area_name]));
  const asOf = new Map(tables.sources.map((s) => [s.source_ref, s.data_as_of]));
  const bySource = (a, b) => { const da = asOf.get(a), db = asOf.get(b); if (da && db && da !== db) return da > db ? -1 : 1; return order(a) - order(b) || (a < b ? -1 : a > b ? 1 : 0); };
  const evBy = new Map();
  for (const e of tables.events) { if (!evBy.has(e.local_project_id)) evBy.set(e.local_project_id, []); evBy.get(e.local_project_id).push(e); }
  const calendar = {};
  const live = tables.projects.filter((p) => !p.superseded_by).sort((a, b) => (a.local_project_id < b.local_project_id ? -1 : 1));
  for (const p of live) {
    const id = p.local_project_id, evs = evBy.get(id) ?? [];
    const actual = new Set(evs.filter((e) => e.date_type === 'ACTUAL').map((e) => e.event_type));
    const plan = {};
    const planned = evs.filter((x) => x.date_type === 'PLANNED' && x.plan_basis === 'CURRENT' && monthOf(x));
    planned.sort((a, b) => rankOf(a) - rankOf(b) || bySource(a.source_ref, b.source_ref) || (monthOf(a) < monthOf(b) ? -1 : monthOf(a) > monthOf(b) ? 1 : 0));
    for (const e of planned) plan[e.event_type] ??= e;
    for (const t of KINDS) {
      const e = plan[t];
      if (!e || actual.has(t)) continue;
      const ym = monthOf(e);
      if (!months.includes(ym)) continue;
      const r = mapRows[id];
      (calendar[p.sgg_code.slice(0, 2)] ??= []).push({ ym, day: e.event_date ?? null, type: t, id, drawer: !!p.issued_at && p.source_ref.startsWith('home-dump-'), name: r?.name ?? p.project_name ?? id, units: r?.units ?? 0, sgg: sggName[p.sgg_code] ?? p.sgg_code, code: p.sgg_code });
    }
  }
  const sorted = {};
  for (const s of Object.keys(calendar).sort()) sorted[s] = calendar[s].sort((a, b) => (a.day ?? `${a.ym}-99`).localeCompare(b.day ?? `${b.ym}-99`) || a.name.localeCompare(b.name, 'ko') || a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
  return { months, sido: sorted };
}

/* ---------- 지도: 위도 37.5° 보정 등장방형 하나(1000 = 위도 1°), 세 시도가 같은 좌표를 쓰고 시도마다 보기 상자만 다르다 ---------- */
const GEO_COS = Math.cos(37.5 * Math.PI / 180), GEO_TOL = 0.8, GEO_SNAP = 0.5;
const proj = ([lon, lat]) => [(lon - 124.5) * GEO_COS * 1000, (38.4 - lat) * 1000];
/* Douglas-Peucker. 닫힌 고리는 처음·끝이 같은 점이라 선분 대신 그 점과의 거리 */
function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    let mi = -1, md = tol;
    for (let i = a + 1; i < b; i++) { const d = L ? Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / L : Math.hypot(pts[i][0] - ax, pts[i][1] - ay); if (d > md) { md = d; mi = i; } }
    if (mi > 0) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const ringsOf = (g) => (!g ? [] : g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : g.type === 'GeometryCollection' ? g.geometries.flatMap(ringsOf) : []);
const polysOf = (g) => (!g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : g.type === 'GeometryCollection' ? g.geometries.flatMap(polysOf) : []);
const area2 = (r) => Math.abs(r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y; }, 0)) / 2;
/* 줄인 닫힌 고리 → 정수로 반올림해 'M절대 l상대…z'. 점 4개 미만이거나 minArea 단위² 미만(작은 섬·조각)이면 '' */
function ringPath(pts, minArea, box) {
  const r = pts.map(([x, y]) => [Math.round(x), Math.round(y)]).filter((p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
  if (r.length < 4 || area2(r) < minArea) return '';
  for (const [x, y] of r) { box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y); }
  return `M${r[0][0]} ${r[0][1]}l${r.slice(1, -1).map(([x, y], i) => `${x - r[i][0]} ${y - r[i][1]}`).join(' ')}z`;
}
/* 고리마다 따로 줄인다(지구용) */
function pathOf(rings, tol, minArea) {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  return { d: rings.map((ring) => ringPath(dp(ring.map(proj), tol), minArea, box)).join(''), box };
}

/* ---------- 시군구 경계: 이웃이 같은 선을 똑같이 줄이게 공유 경계(호)를 한 번만 줄인다 ---------- */
const keyOf = ([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`;
const inRing = ([px, py], r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) c = !c; } return c; };
/* 고리 안의 점: 세로 가운데 높이의 가로선이 고리와 만나는 점들 중 가장 넓은 안쪽 구간의 가운데(꼭짓점 평균은 오목하면 밖으로 나간다) */
function interiorPoint(r) {
  let y0 = Infinity, y1 = -Infinity; for (const p of r) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const y = (y0 + y1) / 2, xs = [];
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y)) xs.push(xi + (y - yi) * (xj - xi) / (yj - yi)); }
  xs.sort((a, b) => a - b);
  let k = 0; for (let i = 2; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > xs[k + 1] - xs[k]) k = i;
  return [(xs[k] + xs[k + 1]) / 2, y];
}
/* 꼭짓점 맞붙이기: 원천의 이웃 다각형은 같은 경계를 서로 다른 꼭짓점으로 그린 곳이 많다(어긋남 대부분 0.1단위 미만).
   그대로면 꼭짓점 키가 안 맞아 양쪽이 따로 줄여져 두 줄과 가는 틈이 된다.
   다른 시군구 경계에서 eps 안에 있는 꼭짓점을 그 경계의 가장 가까운 선분에 (옮기지 않고) 끼워 넣는다 → 양쪽 고리가 같은 점들을 지나 같은 호가 된다.
   판정은 모두 끼워 넣기 전 좌표로 한 번에 해서 입력 순서와 상관없다. eps 보다 넓은 물길·해안 틈은 그대로 둔다
   (eps 를 1 이상으로 키우면 옮기지 않은 점이 이웃 선을 끌어당겨 오히려 두 줄·겹침이 는다 — 2026-10-16 실측) */
function snapUnits(units, eps) {
  const C = 4, grid = new Map(), has = units.map(() => new Set()), segs = [];
  units.forEach((ps, u) => { for (const p of ps) for (const r of p) r.forEach((a, i) => {
    has[u].add(keyOf(a));
    const b = r[(i + 1) % r.length], s = { u, a, b, add: new Map() }; segs.push(s);
    for (let cx = Math.floor((Math.min(a[0], b[0]) - eps) / C); cx <= Math.floor((Math.max(a[0], b[0]) + eps) / C); cx++)
      for (let cy = Math.floor((Math.min(a[1], b[1]) - eps) / C); cy <= Math.floor((Math.max(a[1], b[1]) + eps) / C); cy++) { const k = `${cx},${cy}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(s); }
  }); });
  units.forEach((ps, u) => { for (const p of ps) for (const r of p) for (const v of r) {
    const best = new Map();   // 이웃 시군구 → [거리, 선분, t]
    for (const s of grid.get(`${Math.floor(v[0] / C)},${Math.floor(v[1] / C)}`) ?? []) {
      if (s.u === u || has[s.u].has(keyOf(v))) continue;
      const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((v[0] - s.a[0]) * dx + (v[1] - s.a[1]) * dy) / l2)) : 0;
      const d = Math.hypot(v[0] - s.a[0] - t * dx, v[1] - s.a[1] - t * dy), cur = best.get(s.u);
      if (d <= eps && (!cur || d < cur[0])) best.set(s.u, [d, s, t]);
    }
    for (const [, s, t] of best.values()) s.add.set(keyOf(v), [t, v]);
  } });
  let i = 0;
  return units.map((ps) => ps.map((p) => p.map((r) => r.flatMap((a) => {
    const s = segs[i++];
    return [a, ...[...s.add].sort(([ka, [ta]], [kb, [tb]]) => ta - tb || (ka < kb ? -1 : 1)).map(([, [, v]]) => v)];
  }))));
}
/* units: 시군구마다 다각형들(투영 좌표, [바깥 고리, ...구멍]) → 시군구마다 { d, box }, 메운 구멍 수.
   opt(전국 시도 경계 tools/ledger/korea-sido.js 가 쓴다): tol 줄이기 허용 오차(기본 GEO_TOL) · minArea 남길 고리 넓이 하한(단위², 기본 2) */
function sggPaths(units, opt = {}) {
  const tol = opt.tol ?? GEO_TOL, minArea = opt.minArea ?? 2;
  /* 열린 고리(닫는 점·연달아 같은 점 뺌) */
  const open = (r) => r.filter((p, i) => keyOf(p) !== keyOf(r[(i || r.length) - 1]));
  units = units.map((ps) => ps.map((p) => p.map(open)).filter((p) => p[0].length >= 3).map((p) => p.filter((r) => r.length >= 3)));
  /* 구멍 메우기: 구멍 안의 점을 다른 시군구 바깥 고리가 덮으면 남기고(그 구역이 메운다), 아니면 지운다(원본의 빈 구멍) */
  let filled = 0;
  units = units.map((ps, u) => ps.map(([outer, ...holes]) => [outer, ...holes.filter((h) => {
    const pt = interiorPoint(h), keep = units.some((qs, v) => v !== u && qs.some((q) => inRing(pt, q[0])));
    if (!keep) filled++;
    return keep;
  })]));
  units = snapUnits(units, GEO_SNAP);
  /* 꼭짓점마다 쓰는 시군구 집합 → 집합이 바뀌는 점 = 이음점 */
  const users = new Map();
  units.forEach((ps, u) => { for (const p of ps) for (const r of p) for (const q of r) { const k = keyOf(q); if (!users.has(k)) users.set(k, new Set()); users.get(k).add(u); } });
  const sig = new Map([...users].map(([k, s]) => [k, [...s].sort((a, b) => a - b).join()]));
  /* 변(이웃한 두 꼭짓점)마다 쓰는 시군구 집합: 양쪽 고리에서 이웃 순서가 엇갈린 곳(맞붙이기 뒤 거의 같은 두 점)도 이음점으로 끊어 그 앞뒤 호는 같게 줄인다 */
  const edgeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`), edges = new Map();
  units.forEach((ps, u) => { for (const p of ps) for (const r of p) r.forEach((q, i) => { const k = edgeKey(keyOf(q), keyOf(r[(i + 1) % r.length])); if (!edges.has(k)) edges.set(k, new Set()); edges.get(k).add(u); }); });
  const esig = new Map([...edges].map(([k, s]) => [k, [...s].sort((a, b) => a - b).join()]));
  /* 호는 정규 방향(꼭짓점 키를 이은 문자열이 작은 쪽)으로 한 번만 줄이고, 반대로 쓰는 쪽은 뒤집어 쓴다 → 입력 순서와 상관없이 양쪽이 같은 점 */
  const cache = new Map();
  const simplify = (arc, ks) => {
    const f = ks.join('|'), b = [...ks].reverse().join('|'), rev = b < f, key = rev ? b : f;
    if (!cache.has(key)) cache.set(key, dp(rev ? [...arc].reverse() : arc, tol));
    return rev ? [...cache.get(key)].reverse() : cache.get(key);
  };
  const ringOf = (r) => {
    const n = r.length, ks = r.map(keyOf), sg = ks.map((k) => sig.get(k));
    const es = ks.map((k, i) => esig.get(edgeKey(k, ks[(i + 1) % n])));   // es[i] = 변 i→i+1
    const isJ = sg.map((s, i) => s !== sg[(i + n - 1) % n] || s !== sg[(i + 1) % n] || s !== es[i] || s !== es[(i + n - 1) % n]);
    const j0 = isJ.indexOf(true);
    if (j0 < 0) {   // 이음점 없는 고리(섬, 남의 바깥 고리와 같은 구멍): 가장 작은 키에서 시작하는 닫힌 호 하나
      let s = 0; for (let i = 1; i < n; i++) if (ks[i] < ks[s]) s = i;
      const idx = [...Array(n + 1).keys()].map((i) => (s + i) % n);
      return simplify(idx.map((i) => r[i]), idx.map((i) => ks[i]));
    }
    const out = [];
    let a = j0;
    do {
      const idx = [a]; let j = (a + 1) % n;
      while (!isJ[j]) { idx.push(j); j = (j + 1) % n; }
      idx.push(j);
      out.push(...simplify(idx.map((i) => r[i]), idx.map((i) => ks[i])).slice(0, -1));
      a = j;
    } while (a !== j0);
    return [...out, out[0]];
  };
  /* 바깥 고리가 빠지면 그 구멍도 뺀다 */
  const paths = units.map((ps) => {
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    const d = ps.map(([outer, ...holes]) => { const o = ringPath(ringOf(outer), minArea, box); return o && o + holes.map((h) => ringPath(ringOf(h), minArea, box)).join(''); }).join('');
    return { d, box };
  });
  return { paths, filled };
}

/* munis: HOME municipality + policy_municipality payload · districts: district payload */
function buildMap(munis, districts) {
  const ms = munis.filter((m) => METRO[m.region]);
  const { paths } = sggPaths(ms.map((m) => polysOf(m.geometry).map((p) => p.map((r) => r.map(proj)))));
  const sgg = ms.map((m, i) => ({ s: METRO[m.region], n: m.name, codes: [...(m.admin_codes ?? [])].sort(), c: proj([m.longitude, m.latitude]).map(Math.round), ...paths[i] }))
    .sort((a, b) => a.s.localeCompare(b.s) || a.codes.join().localeCompare(b.codes.join()) || a.n.localeCompare(b.n, 'ko'));
  /* 지구 도형은 지구 경계가 아니라 공동주택용지 필지들(작다)이라 더 촘촘히 남긴다 */
  const dist = districts.map((x) => ({ n: x.name, d: pathOf(ringsOf(x.geometry), 0.5, 0.5).d })).filter((x) => x.d).sort((a, b) => a.n.localeCompare(b.n, 'ko') || a.d.localeCompare(b.d));
  /* 보기 상자: 시도 경계 전체(인천은 옹진군 서해 섬 제외 — 넣으면 육지가 점처럼 작아진다) + 여백 4% */
  const view = {};
  for (const s of Object.values(METRO).sort()) {
    const bs = sgg.filter((g) => g.s === s && g.d && !(s === '28' && g.n === '옹진군')).map((g) => g.box);
    if (!bs.length) continue;
    const x0 = Math.min(...bs.map((b) => b[0])), y0 = Math.min(...bs.map((b) => b[1])), x1 = Math.max(...bs.map((b) => b[2])), y1 = Math.max(...bs.map((b) => b[3]));
    const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.04);
    view[s] = [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad];
  }
  return { geo: sgg, doc: { schema: 'region-map/1', projection: '등장방형(위도 37.5° 보정) · 1000 = 위도 1° · x = (경도−124.5)·cos37.5°·1000, y = (38.4−위도)·1000', view, sgg: sgg.filter((g) => g.d).map(({ s, n, d }) => ({ s, n, d })), districts: dist } };
}

/* 사업 위치: home-map 의 위치(블록 라벨점·주소 근사점·지구 대표점 = 점, 근사 영역 = area, 이름 검색 근사점 = name) → 없으면 시군구 대표점('rep').
   loc: 사업 id → home-map loc({ by, at }) · geo: buildMap 의 시군구(코드·대표점). 서울·인천·경기만 붙인다 */
const LOC_KIND = new Set(['block', 'address', 'district', 'area', 'name']);
function placeCalendar(calendar, loc, geo) {
  const count = { point: 0, area: 0, rep: 0, none: 0 };
  for (const s of Object.values(METRO)) for (const e of calendar.sido[s] ?? []) {
    const l = loc[e.id];
    if (l?.at && LOC_KIND.has(l.by)) { e.loc = l.by; e.pt = proj(l.at).map(Math.round); count[e.loc === 'area' ? 'area' : 'point']++; continue; }
    /* 원장 코드가 옛 시 단위(예: 안산 41270)이면 앞 4자리로 구 단위 코드에 맞춘다 */
    const g = geo.find((x) => x.codes.includes(e.code)) ?? (e.code.endsWith('0') ? geo.find((x) => x.codes.some((c) => c.slice(0, 4) === e.code.slice(0, 4))) : null);
    if (g) { e.loc = 'rep'; e.pt = g.c; count.rep++; } else count.none++;
  }
  for (const list of Object.values(calendar.sido)) for (const e of list) delete e.code;
  return count;
}

/* ---------- 서울·인천·경기 HOME 통계(통계누리 시도 자료): 착공·분양승인·준공은 월, 인허가는 연 ---------- */
const HM = { 착공: 'start', 분양승인: 'sale', 준공: 'complete' };
function buildAnnual(stat) {
  const rows = stat.filter((s) => ['molit_statistics', 'incheon_statistics'].includes(s.source_id) && METRO[s.region]);
  const months = [...new Set(rows.filter((s) => s.statistic_frequency === 'MONTH').map((s) => s.statistic_period))].sort().map((p) => `${p.slice(0, 4)}-${p.slice(4, 6)}`);
  const codes = Object.values(METRO).sort();
  const series = {};
  for (const m of Object.values(HM)) {
    series[m] = {};
    for (const c of codes) series[m][c] = months.map((ym) => rows.find((s) => METRO[s.region] === c && HM[s.statistic_metric] === m && s.statistic_frequency === 'MONTH' && s.statistic_period === ym.replace('-', ''))?.units ?? null);
  }
  const permit = {};
  for (const c of codes) permit[c] = Object.fromEntries(rows.filter((s) => METRO[s.region] === c && s.statistic_metric === '인허가' && s.statistic_frequency === 'YEAR').map((s) => [s.statistic_period, s.units]).sort(([a], [b]) => a.localeCompare(b)));
  const asOf = [...new Set(rows.map((s) => s.base_date).filter(Boolean))].sort().pop() ?? null;
  return { months, series, permitYearly: permit, sourceAsOf: asOf };
}

/* ---------- 실행 ---------- */
const readGz = (f) => zlib.gunzipSync(fs.readFileSync(f)).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

function build({ month, root = P.ROOT } = {}) {
  month ??= P.latestMonth(root);
  const dir = P.ledgerDir(month, root), tdir = path.join(dir, 'tables');
  const read = (t) => JSON.parse(fs.readFileSync(path.join(tdir, `${t}.json`), 'utf8')).rows;
  const homeDir = latestHomeDir(dir);
  const need = ['municipality', 'policy_municipality', 'district', 'statistic'].map((k) => path.join(homeDir ?? `${dir}/raw/home`, `${k}.jsonl.gz`));
  for (const f of need) if (!fs.existsSync(f)) throw new Error(`HOME 판 원본이 없다: ${f} — raw-store.js 로 받아 온 뒤 다시 실행`);
  const [muni, pmuni, district, statistic] = need.map(readGz);
  const edition = path.basename(homeDir), referenceDate = P.referenceDateOf(dir);
  const ledgerMap = JSON.parse(fs.readFileSync(path.join(root, 'data/board/ledger-map.json'), 'utf8'));
  const mapRows = Object.fromEntries(Object.values(ledgerMap.bySgg).flat().map((r) => [r.id, r]));
  const hmDir = path.join(root, 'data/board/home-map');
  const loc = Object.fromEntries(fs.readdirSync(hmDir).filter((f) => /^\d{5}\.json$/.test(f)).sort().flatMap((f) => JSON.parse(fs.readFileSync(path.join(hmDir, f), 'utf8')).projects.filter((p) => p.loc).map((p) => [p.id, p.loc])));

  const cal = buildCalendar({ projects: read('projects'), events: read('events'), sources: read('sources'), areas: read('areas') }, mapRows, month);
  const { geo, doc: map } = buildMap([...muni, ...pmuni].map((r) => r.payload), district.map((r) => r.payload));
  const placed = placeCalendar(cal, loc, geo);
  const annual = buildAnnual(statistic.map((r) => ({ ...r.payload, source_id: r.source_id })));
  return {
    calendar: { schema: 'region-calendar/1', observedMonth: month, referenceDate, edition, from: cal.months[0], to: cal.months[11], months: cal.months, kinds: KINDS, sido: cal.sido },
    map: { ...map, edition },
    annual: { schema: 'region-annual/1', edition, note: '서울·인천·경기 시도 전체 공식 통계(통계누리) — HOME 덤프 statistic(molit_statistics·incheon_statistics). 인허가는 연 단위만', ...annual },
    placed,
  };
}

if (require.main === module) {
  const i = process.argv.indexOf('--month');
  const out = build({ month: i > 0 ? process.argv[i + 1] : undefined });
  for (const k of ['calendar', 'map', 'annual']) fs.writeFileSync(path.join(P.ROOT, OUT[k]), JSON.stringify(out[k]) + '\n');
  const n = Object.values(out.calendar.sido).reduce((s, l) => s + l.length, 0);
  console.log(`${OUT.calendar}: ${out.calendar.from}~${out.calendar.to} 예정 ${n}곳(시도 ${Object.keys(out.calendar.sido).length}) · 위치 점 ${out.placed.point} · 근사 ${out.placed.area} · 대표 ${out.placed.rep} · 없음 ${out.placed.none}`);
  console.log(`${OUT.map}: ${Math.round(JSON.stringify(out.map).length / 1024)} KB · 시군구 ${out.map.sgg.length} · 지구 ${out.map.districts.length}`);
  console.log(`${OUT.annual}: ${out.annual.months[0]}~${out.annual.months[out.annual.months.length - 1]} (판 ${out.annual.edition})`);
}

module.exports = { KINDS, METRO, addM, monthOf, buildCalendar, buildMap, placeCalendar, buildAnnual, pathOf, proj, dp, sggPaths, build, OUT };
