/* HOME 개념 시안 v2 자료 스냅샷 만들기: 실제 산출물(사업 원장 2026-10 · HOME 덤프 20261013T140241Z · 통계누리)에서 assets/data.json 을 만든다.
   시안 화면의 숫자는 모두 이 스냅샷에서 계산해 그린다(HTML 에 숫자를 적지 않는다). 가상 자료는 없다.
   저장소 루트에서: node docs/design/home-concept/build-data.mjs
   읽기만 하는 곳: 저장소 data/board/*·schemas/ledger-2026-10/*, worktree(housing-board-screens) data/board/*, HOME PoC 요구사항 파일(문자열로 읽어 JSON 부분만 푼다 — 실행하지 않는다). */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../../..');
const WT = path.resolve(ROOT, '../housing-board-screens');
const REQ = '/private/tmp/claude-501/-Users-bcchung81-workspace-housing-board/01bf3a38-2aa7-4f0c-bd87-a732d3da9b4a/scratchpad/minslab/PoC/10-home/web/assets/requirements-manual.js';
const MONTH = '2026-10';
const TABLES = path.join(ROOT, `schemas/ledger-${MONTH}/tables`);
const EDITION = '20261013T140241Z';
const RAW = path.join(ROOT, `schemas/ledger-${MONTH}/raw/home/${EDITION}`);

const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const rows = (t) => json(path.join(TABLES, `${t}.json`)).rows;
const jsonl = (f) => gunzipSync(readFileSync(path.join(RAW, f))).toString('utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
for (const p of [TABLES, WT, RAW]) if (!existsSync(p)) throw new Error(`없음: ${p}`);

/* ---------- 원천 ---------- */
const projectsT = rows('projects'), eventsT = rows('events'), sourcesT = rows('sources'), areasT = rows('areas'), linksT = rows('links');
const manifest = json(path.join(ROOT, `schemas/ledger-${MONTH}/manifest.json`));
const REF = manifest.reference_date;                       // 원장 기준일 2026-10-13
const ledgerMap = json(path.join(ROOT, 'data/board/ledger-map.json'));
const pp = json(path.join(ROOT, 'data/board/policy-progress.json'));
const molit = json(path.join(ROOT, 'data/board/molit.json'));
const oursCatalog = json(path.join(ROOT, 'data/board/sources.json')).items;
const pIndex = json(path.join(WT, 'data/board/projects-index.json'));
const pDetail = json(path.join(WT, 'data/board/project-detail.json'));
const areaFacts = json(path.join(WT, 'data/board/area-facts.json'));
const homeSources = json(path.join(WT, 'data/board/home-sources.json'));
const homeMap = Object.fromEntries(readdirSync(path.join(ROOT, 'data/board/home-map')).flatMap((f) => json(path.join(ROOT, 'data/board/home-map', f)).projects.map((p) => [p.id, p])));

const isHome = (ref) => ref.startsWith('home-dump-');
const SIDO = Object.fromEntries(molit.sido.map((s) => [s.code, s.name]));
const SGG_NAME = Object.fromEntries(areasT.filter((a) => a.level === 'SGG').map((a) => [a.area_code, a.area_name]));
const BOARD_OF_EVENT = { PERMIT: 1, CONSTRUCTION_START: 2, SUPPLY_NOTICE: 3, COMPLETION: 4, MOVE_IN: 5 };
const BOARD_OF_STAGE = { '01': 0, '02': 0, '03': 1, '04': 2, '05': 3, '06': 4 };
const AGENCY = { lh: 'LH', sh: 'SH', gh: 'GH' };

/* ---------- 판정 규칙(시안에서 정하는 값은 여기 한 곳) ---------- */
const LONG_DELAY_MONTHS = 12;    // 장기 지연 = 현재 예정일 경과 12개월 이상(지연 6개월 이상 중 1년 넘음)
const statusOf = (r) => (r.cls === 'delay' ? (r.overdue && r.overdue.months >= LONG_DELAY_MONTHS ? 'long' : 'delay') : r.cls ?? 'none');

/* ---------- 수도권 HOME 사업(대체된 사업 제외) ---------- */
const homeP = projectsT.filter((p) => isHome(p.source_ref) && !p.superseded_by);
const homeIds = new Set(homeP.map((p) => p.local_project_id));
const mapRow = Object.fromEntries(Object.values(ledgerMap.bySgg).flat().map((r) => [r.id, r]));
const evBy = new Map();
for (const e of eventsT) { if (!evBy.has(e.local_project_id)) evBy.set(e.local_project_id, []); evBy.get(e.local_project_id).push(e); }
const hasEv = (id, type, dt) => (evBy.get(id) ?? []).some((e) => e.event_type === type && (!dt || e.date_type === dt));

const projects = homeP.map((p) => {
  const id = p.local_project_id, r = mapRow[id], x = pIndex.projects[id] ?? {}, hm = homeMap[id];
  if (!r) throw new Error(`지도 색인에 없음 ${id}`);
  const st = statusOf(r);
  return {
    id, name: r.name ?? p.project_name, sgg: p.sgg_code, sido: p.sgg_code.slice(0, 2), sggName: SGG_NAME[p.sgg_code] ?? p.sgg_code,
    agency: AGENCY[p.agency_id] ?? '기타', stage: r.stage, board: BOARD_OF_STAGE[r.stage], units: r.units,
    notice: x.notice ?? null, programs: x.programs ?? [], policies: x.policies ?? [], link: x.link ?? null,
    status: st, late: (r.cls === 'delay' || r.cls === 'caution') && r.overdue ? r.overdue.months : null,
    overdue: r.overdue, next: r.next, loc: hm?.loc?.by ?? null,
    /* 단계 확인(원천 실제 기록): ①계획은 계획 호수 확인, ②~⑥은 실제 사건 */
    reached: [r.units > 0, hasEv(id, 'PERMIT', 'ACTUAL'), hasEv(id, 'CONSTRUCTION_START', 'ACTUAL'), hasEv(id, 'SUPPLY_NOTICE', 'ACTUAL'), hasEv(id, 'COMPLETION', 'ACTUAL'), hasEv(id, 'MOVE_IN', 'ACTUAL')],
    anyPlan: hasEv(id, null, 'PLANNED') || (evBy.get(id) ?? []).some((e) => e.date_type === 'PLANNED'),
  };
}).sort((a, b) => a.sgg.localeCompare(b.sgg) || b.stage.localeCompare(a.stage) || a.name.localeCompare(b.name, 'ko'));
const superseded = Object.fromEntries(projectsT.filter((p) => isHome(p.source_ref) && p.superseded_by).map((p) => [p.local_project_id, { to: p.superseded_by, name: p.project_name }]));

/* 사업 상세: worktree project-detail(원장 events 를 사업별로 묶은 것) + 기준선(원장 plan_basis 가 CURRENT 아닌 예정 — 지금은 0건) */
const baseline = eventsT.filter((e) => homeIds.has(e.local_project_id) && e.date_type === 'PLANNED' && e.plan_basis && e.plan_basis !== 'CURRENT');
const details = Object.fromEntries(projects.map((p) => {
  const d = pDetail.projects[p.id];
  if (!d) throw new Error(`사업 상세 없음 ${p.id}`);
  const hm = homeMap[p.id];
  return [p.id, { unit: d.unit, scope: d.scope, basis: d.basis, asOf: d.asOf, issuedAt: d.issuedAt, bjd: d.bjd, stages: d.stages, progress: d.progress, refs: d.refs,
    baseline: Object.fromEntries(baseline.filter((e) => e.local_project_id === p.id).map((e) => [e.event_type, e.event_date ?? e.event_month ?? e.event_year])),
    loc: hm?.loc ? { by: hm.loc.by, basis: hm.loc.basis } : null }];
}));
const refs = pDetail.sources;

/* ---------- 정책: 9·7 단계 목표(policy-progress samePeriod) ---------- */
const PP_STAGES = ['BUSINESS', 'APPROVAL', 'CONSTRUCTION', 'SUPPLY', 'COMPLETION', 'MOVE_IN'];
const refYear = Number(pp.referenceMonthEnd.slice(0, 4));
const policyCells = Object.fromEntries(pIndex.policies.map((pol) => {
  const src = pp.policies.find((x) => x.policyId === pol.id);
  if (!src) return [pol.key, null];   // 1·29·8·13: 단계 목표 계산 없음
  return [pol.key, PP_STAGES.map((k, board) => {
    const st = src.stages[k], s = st.samePeriod.find((y) => y.year === refYear);
    /* 기간 안 목표가 없을 때: 착공은 원문 연도별 목표(연말 점), 나머지는 다음 목표 점만 title 에 */
    const after = (st.targetPoints ?? []).find((t) => t.date > pp.referenceMonthEnd && s.target == null);
    const yearEnd = k === 'CONSTRUCTION' && after && after.date.endsWith('-12-31') ? after : null;
    return { board, label: st.label, target: s.target, actual: s.actual, actualThrough: s.actualThrough, review: s.actualReviewUnits, gap: s.gap, shortfallPct: s.shortfallPct, status: s.status,
      from: s.from, through: s.through, targetBasis: st.targetBasis, actualBasis: st.actualBasis, yearEnd: yearEnd ? { date: yearEnd.date, units: yearEnd.units } : null, nextPoint: !yearEnd && after ? { date: after.date, units: after.units } : null };
  })];
}));

/* ---------- 공급 실적: 전국(통계누리 2021-09~) · 수도권(HOME 통계 2018~) ---------- */
const METRICS = ['permit', 'start', 'sale', 'complete'];
const nation = {
  months: molit.months, provisional: molit.provisional,
  regions: molit.sido.map((s) => s.code),
  series: Object.fromEntries(METRICS.map((m) => [m, Object.fromEntries(molit.sido.map((s) => [s.code, molit.metrics[m].series[s.code].total]))])),
};
const stat = jsonl('statistic.jsonl.gz').map((r) => ({ ...r.payload, src: r.source_id }));
const METRO = { '서울특별시': '11', '인천광역시': '28', '경기도': '41' };
const HM = { 인허가: 'permit', 착공: 'start', 분양승인: 'sale', 준공: 'complete' };
const metroStat = stat.filter((s) => ['molit_statistics', 'incheon_statistics'].includes(s.src) && METRO[s.region]);
const mMonths = [...new Set(metroStat.filter((s) => s.statistic_frequency === 'MONTH').map((s) => s.statistic_period))].sort().map((p) => `${p.slice(0, 4)}-${p.slice(4, 6)}`);
const metro = {
  months: mMonths, provisional: molit.provisional.filter((m) => mMonths.includes(m)), regions: ['11', '28', '41'],
  series: Object.fromEntries(METRICS.filter((m) => m !== 'permit').map((m) => [m, Object.fromEntries(['11', '28', '41'].map((c) => [c, mMonths.map((ym) => {
    const hit = metroStat.find((s) => METRO[s.region] === c && HM[s.statistic_metric] === m && s.statistic_frequency === 'MONTH' && s.statistic_period === ym.replace('-', ''));
    return hit ? hit.units : null;
  })]))])),
  /* 인허가는 HOME 통계에 연 단위만 있다 */
  yearly: { permit: Object.fromEntries(['11', '28', '41'].map((c) => [c, Object.fromEntries(metroStat.filter((s) => METRO[s.region] === c && s.statistic_metric === '인허가' && s.statistic_frequency === 'YEAR').map((s) => [s.statistic_period, s.units]))])) },
  sourceAsOf: [...new Set(metroStat.map((s) => s.base_date))].sort().pop(),
};

/* ---------- 우리 동네: 앞으로 12개월 모집·준공·입주 예정(원장 전국, 종류마다 현재 예정 하나 — tools/ledger/board.js 와 같은 순위) ---------- */
const SOURCE_RANK = {
  MOVE_IN: ['datagokr-15111714', 'datagokr-15057999', 'datagokr-15098547', /^home-dump-.+-notice$/, /^home-dump-[^-]+$/],
  COMPLETION: [/^home-dump-[^-]+$/, /^home-dump-.+-lh-plan$/],
};
const rankOf = (e) => { const i = SOURCE_RANK[e.event_type]?.findIndex((x) => (typeof x === 'string' ? x === e.source_ref : x.test(e.source_ref))) ?? -1; return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
const asOfRef = new Map(sourcesT.map((s) => [s.source_ref, s.data_as_of]));
const order = (ref) => (ref.startsWith('bundle-') ? 0 : ref === 'hub-hs-basis' ? 1 : ref === 'datagokr-15141761' ? 2 : 3);
const bySource = (a, b) => { const da = asOfRef.get(a), db = asOfRef.get(b); if (da && db && da !== db) return da > db ? -1 : 1; return order(a) - order(b); };
const monthOf = (e) => (e.event_date ? e.event_date.slice(0, 7) : e.event_month ?? (e.event_year != null ? `${e.event_year}-12` : null));
const addM = (ym, n) => { const k = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + n; return `${Math.floor(k / 12)}-${String(k % 12 + 1).padStart(2, '0')}`; };
const calMonths = Array.from({ length: 12 }, (_, i) => addM(MONTH, i));
const live = new Map(projectsT.filter((p) => !p.superseded_by).map((p) => [p.local_project_id, p]));
const calendar = {};
for (const [id, p] of live) {
  const evs = evBy.get(id) ?? [];
  const actual = new Set(evs.filter((e) => e.date_type === 'ACTUAL').map((e) => e.event_type));
  const plan = {};
  for (const e of evs.filter((x) => x.date_type === 'PLANNED' && x.plan_basis === 'CURRENT' && monthOf(x)).sort((a, b) => rankOf(a) - rankOf(b) || bySource(a.source_ref, b.source_ref))) plan[e.event_type] ??= e;
  for (const t of ['SUPPLY_NOTICE', 'COMPLETION', 'MOVE_IN']) {
    const e = plan[t];
    if (!e || actual.has(t)) continue;
    const ym = monthOf(e);
    if (!calMonths.includes(ym)) continue;
    const sido = p.sgg_code.slice(0, 2), r = mapRow[id];
    (calendar[sido] ??= []).push({ ym, day: e.event_date ?? null, type: t, id, issued: !!p.issued_at, name: r?.name ?? p.project_name ?? id, units: r?.units ?? 0, sgg: SGG_NAME[p.sgg_code] ?? p.sgg_code, src: e.source_ref });
  }
}
for (const list of Object.values(calendar)) list.sort((a, b) => (a.day ?? `${a.ym}-99`).localeCompare(b.day ?? `${b.ym}-99`) || a.name.localeCompare(b.name, 'ko'));

/* ---------- 우리 동네 지도(서울·인천·경기): 시군구 경계·공공주택지구 바탕·사업 위치 ----------
   경계 = HOME 덤프 municipality(서울·경기, V-World LT_C_ADSIGG_INFO) + policy_municipality(인천 11), 지구 = district(LT_C_LHBLPN).
   투영은 위도 37.5° 보정 등장방형 하나(1000 = 위도 1°), 세 시도가 같은 좌표를 쓰고 시도마다 보기 상자(view)만 다르다.
   경계는 Douglas-Peucker(허용 1.2 = 약 130m)로 줄이고 정수 상대 좌표 경로로 적는다. 수원시는 원본에 면이 없다(점만) — 경계 없이 대표점만 쓴다. */
const GEO_COS = Math.cos(37.5 * Math.PI / 180), GEO_TOL = 1.2;
const proj = ([lon, lat]) => [(lon - 124.5) * GEO_COS * 1000, (38.4 - lat) * 1000];
const dp = (pts, tol) => {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    let mi = -1, md = tol;
    /* 닫힌 고리는 처음·끝이 같은 점이라 선분 대신 그 점과의 거리 */
    for (let i = a + 1; i < b; i++) { const d = L ? Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / L : Math.hypot(pts[i][0] - ax, pts[i][1] - ay); if (d > md) { md = d; mi = i; } }
    if (mi > 0) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
};
const ringsOf = (g) => (!g ? [] : g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : g.type === 'GeometryCollection' ? g.geometries.flatMap(ringsOf) : []);
const area2 = (r) => Math.abs(r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y; }, 0)) / 2;
/* 경로: 줄인 고리마다 'M절대 l상대…z'. minArea 단위² 미만 고리(작은 섬·조각)는 뺀다 */
const pathOf = (rings, tol = GEO_TOL, minArea = 4) => {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  const d = rings.map((ring) => {
    const r = dp(ring.map(proj), tol).map(([x, y]) => [Math.round(x), Math.round(y)]).filter((p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
    if (r.length < 4 || area2(r) < minArea) return '';
    for (const [x, y] of r) { box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y); }
    return `M${r[0][0]} ${r[0][1]}l${r.slice(1, -1).map(([x, y], i) => `${x - r[i][0]} ${y - r[i][1]}`).join(' ')}z`;
  }).join('');
  return { d, box };
};
const MAP_SIDO = { '서울특별시': '11', '인천광역시': '28', '경기도': '41' };
const munis = [...jsonl('municipality.jsonl.gz'), ...jsonl('policy_municipality.jsonl.gz')].map((r) => r.payload);
const geoSgg = munis.map((m) => { const { d, box } = pathOf(ringsOf(m.geometry)); return { s: MAP_SIDO[m.region], n: m.name, codes: m.admin_codes, c: proj([m.longitude, m.latitude]).map(Math.round), d, box }; });
/* 지구 도형은 지구 경계가 아니라 공동주택용지 필지들(작다)이라 더 촘촘히 남긴다 */
const geoDistricts = jsonl('district.jsonl.gz').map((r) => r.payload).map((x) => ({ n: x.name, d: pathOf(ringsOf(x.geometry), 0.5, 0.5).d })).filter((x) => x.d);
/* 보기 상자: 시도 경계 전체(인천은 옹진군 서해 섬 제외 — 넣으면 육지가 점처럼 작아진다) + 여백 4% */
const mapView = Object.fromEntries(Object.values(MAP_SIDO).map((s) => {
  const bs = geoSgg.filter((g) => g.s === s && g.d && !(s === '28' && g.n === '옹진군')).map((g) => g.box);
  const x0 = Math.min(...bs.map((b) => b[0])), y0 = Math.min(...bs.map((b) => b[1])), x1 = Math.max(...bs.map((b) => b[2])), y1 = Math.max(...bs.map((b) => b[3]));
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.04);
  return [s, [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad]];
}));
/* 사업 위치: home-map 의 위치(블록 라벨점·주소 근사점·지구 대표점 = 점, 근사 영역 = 근사) → 없으면 시군구 대표점('rep') */
const LOC_KIND = { block: 'block', address: 'address', district: 'district', area: 'area' };
const mapCount = { point: 0, area: 0, rep: 0, none: 0 };
for (const s of Object.values(MAP_SIDO)) for (const e of calendar[s] ?? []) {
  const loc = homeMap[e.id]?.loc, code = live.get(e.id).sgg_code;
  if (loc?.at && LOC_KIND[loc.by]) { e.pk = LOC_KIND[loc.by]; e.pt = proj(loc.at).map(Math.round); mapCount[e.pk === 'area' ? 'area' : 'point']++; continue; }
  /* 원장 코드가 옛 시 단위(예: 안산 41270)이면 앞 4자리로 구 단위 코드에 맞춘다 */
  const g = geoSgg.find((x) => x.codes.includes(code)) ?? (code.endsWith('0') ? geoSgg.find((x) => x.codes.some((c) => c.slice(0, 4) === code.slice(0, 4))) : null);
  if (g) { e.pk = 'rep'; e.pt = g.c; mapCount.rep++; } else mapCount.none++;
}
const areaMap = { view: mapView, sgg: geoSgg.filter((g) => g.d).map(({ s, n, d }) => ({ s, n, d })), districts: geoDistricts };

/* ---------- 데이터 원본: 수집 상태(실패 맨 위) · 연도 확보 · 연결 ---------- */
const kst = (iso) => { if (!iso) return null; const t = Date.parse(/Z$|[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso}+09:00`); return Number.isNaN(t) ? null : new Date(t + 9 * 3600e3).toISOString().slice(0, 10); };
const statusRows = [
  ...oursCatalog.map((s) => ({ owner: '우리', name: s.dataset, org: s.group, ok: true, lastOk: kst(s.collectedAt), asOf: s.sourceAsOf ?? null, count: s.count, runs: null, failed: 0, note: s.provider })),
  ...homeSources.sources.map((s) => ({ owner: 'HOME', name: s.name, org: s.org, ok: s.ok, lastOk: kst(s.lastOk), lastRun: kst(s.lastRun), asOf: s.asOf ?? null, count: s.records ?? s.fetched, runs: s.runs, failed: s.failed, interrupted: s.interrupted, expected: s.expected, partial: s.partial })),
];
statusRows.sort((a, b) => Number(a.ok) - Number(b.ok));
const GRID_YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
const yearMonths = (months, series) => GRID_YEARS.map((y) => { const n = months.filter((m, i) => m.startsWith(String(y)) && series[i] != null).length; return n === 0 ? 'none' : n === 12 ? 'full' : 'part'; });
const coverage = [
  { name: '통계누리 주택건설실적(월)', owner: '우리', cells: yearMonths(molit.months, molit.metrics.complete.series['00'].total) },
  ...homeSources.grid.map((g) => ({ name: g.name, owner: g.owner, cells: GRID_YEARS.map((y) => g.years[String(y)] ?? 'none') })),
];

/* ---------- 채움률(수도권 HOME 사업 기준) ---------- */
const N = projects.length;
const cnt = (f) => projects.filter(f).length;
const PRECISE = ['block', 'address', 'district'];
const fill = {
  base: N,
  plan: cnt((p) => p.units > 0), anyPlan: cnt((p) => p.anyPlan),
  startActual: cnt((p) => p.reached[2]), permitActual: cnt((p) => p.reached[1]), noticeActual: cnt((p) => p.reached[3]),
  completionPlan: cnt((p) => hasEv(p.id, 'COMPLETION', 'PLANNED')), moveInPlan: cnt((p) => hasEv(p.id, 'MOVE_IN', 'PLANNED')),
  supplyOrMoveInPlan: cnt((p) => hasEv(p.id, 'SUPPLY_NOTICE', 'PLANNED') || hasEv(p.id, 'MOVE_IN', 'PLANNED')),
  progress: cnt((p) => hasEv(p.id, 'PROGRESS')), locPrecise: cnt((p) => PRECISE.includes(p.loc)), locApprox: cnt((p) => p.loc === 'area'), locNone: cnt((p) => !p.loc),
  agencyKnown: cnt((p) => p.agency !== '기타'), sourced: cnt((p) => details[p.id].refs.length > 0 && !!details[p.id].asOf),
  stageCells: projects.reduce((s, p) => s + p.reached.slice(1).filter(Boolean).length, 0), stageCellsTotal: N * 5,
  baseline: baseline.length, causes: 0, scenarios: 0, agencyTargets: 0,
  linkReview: linksT.filter((l) => l.link_type === 'PROGRAM_PROJECT' && l.review_status === 'REVIEW_REQUIRED').length,
  linkConfirmed: linksT.filter((l) => l.link_type === 'PROGRAM_PROJECT' && l.review_status === 'CONFIRMED').length,
  policySidos: new Set(projects.filter((p) => p.policies.length).map((p) => p.sido)).size, sidoTotal: molit.sido.length - 1,
  ledgerProjects: Object.values(ledgerMap.bySgg).flat().length,
  failedSources: statusRows.filter((r) => !r.ok).length,
};
/* HOME 원본에서도 확인: 일정 기준선(execution_schedule)·병목 사례(execution_case, 덤프에 표가 없으면 0) */
fill.baselineRaw = jsonl('execution_schedule.jsonl.gz').length;
fill.causes = existsSync(path.join(RAW, 'execution_case.jsonl.gz')) ? jsonl('execution_case.jsonl.gz').length : 0;
const pairCells = (policyCells['97'] ?? []).filter((c) => c.target != null && c.actual != null).length;

/* ---------- 지시·요구사항 ---------- */
const md = readFileSync(path.join(ROOT, 'docs/주택파동_정책근거_및_요구사항_매트릭스.md'), 'utf8');
const directives = [...md.matchAll(/^\| (2026\.\d\d\.\d\d) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)].map((m) => ({ date: m[1].slice(5), full: m[1], event: m[2].trim(), core: m[3].trim(), need: m[4].trim() }));
const reqText = readFileSync(REQ, 'utf8');
const reqSource = JSON.parse(reqText.slice(reqText.indexOf('{', reqText.indexOf('const source=')), reqText.indexOf(';\n', reqText.indexOf('const source='))));
const reqPriority = Object.fromEntries([...reqText.matchAll(/\['(F-\d\d)','([^']*)','([^']*)'/g)].map((m) => [m[1], { short: m[2], priority: m[3] }]));
/* F 와 지시 날짜(매트릭스 1절의 '주는 요구사항'과 맞춘 것), 답하는 화면(시안 3장: projects 사업·상세 서랍, region 지역 공급, sources 데이터 원본).
   F-12(시나리오)는 답하는 화면이 없다 — 앞으로 12개월 예정은 F-09 로만 센다 */
const F_LINK = {
  'F-01': [['08.21', '09.03'], ['projects', 'region']], 'F-02': [['08.14'], ['projects']], 'F-03': [['08.14', '09.30'], ['projects']],
  'F-04': [['08.19'], ['projects']], 'F-05': [['08.14'], ['region']], 'F-06': [['09.18'], ['projects']],
  'F-07': [['09.03', '08.29'], ['projects']], 'F-08': [['08.21', '08.29'], ['projects']], 'F-09': [['09.04'], ['region']],
  'F-10': [['09.30'], ['sources']], 'F-11': [['08.14', '09.03'], ['projects']], 'F-12': [['09.04', '09.30'], []],
};
const pct = (a, b) => (b ? Math.round(a / b * 1000) / 10 : null);
const f = (n) => n.toLocaleString('en-US');
/* 판정: met 충족 · part 부분 · none 없음. 근거 지표는 위 실제 값. 규칙은 F 마다 함수 하나 */
const JUDGE = {
  'F-01': () => ({ v: fill.policySidos >= fill.sidoTotal ? 'met' : fill.ledgerProjects > 0 ? 'part' : 'none', metric: `정책 연결 시도 ${fill.policySidos}/${fill.sidoTotal}`, tip: `원장 사업 ${f(fill.ledgerProjects)}건은 전국이지만 정책·프로그램 연결은 수도권 HOME 사업만 · 규칙: 정책 연결이 모든 시도면 충족, 원장만 전국이면 부분` }),
  'F-02': () => ({ v: pairCells === 6 ? 'met' : pairCells > 0 ? 'part' : 'none', metric: `목표·실적 같은 칸 ${pairCells}/6`, tip: `9·7 단계 6칸 중 같은 기간(${refYear}.01~${pp.referenceMonthEnd.slice(5, 7)}) 목표와 확인이 둘 다 있는 칸 · 1·29·8·13 은 단계 목표 없음 · 규칙: 6칸 모두면 충족, 1칸 이상 부분` }),
  'F-03': () => ({ v: pct(fill.stageCells, fill.stageCellsTotal) >= 80 ? 'met' : fill.stageCells > 0 ? 'part' : 'none', metric: `단계 실적 근거 ${pct(fill.stageCells, fill.stageCellsTotal)}%`, tip: `사업 ${N} × 단계 5(②인허가~⑥입주) 중 원천 실제 기록이 있는 칸 ${f(fill.stageCells)}/${f(fill.stageCellsTotal)} · 규칙: 80% 이상 충족, 0 초과 부분` }),
  'F-04': () => ({ v: pct(fill.plan, N) >= 95 ? 'met' : pct(fill.plan, N) >= 50 ? 'part' : 'none', metric: `계획 호수 ${Math.round(pct(fill.plan, N))}%`, tip: `사업명·지역은 ${N}건 모두, 계획 호수는 ${fill.plan}/${N} · 정밀 위치 ${fill.locPrecise}건 · 규칙: 95% 이상 충족, 50% 이상 부분` }),
  'F-05': () => ({ v: pct(fill.anyPlan, N) >= 95 ? 'met' : fill.anyPlan > 0 ? 'part' : 'none', metric: `예정 일정 1개 이상 ${Math.round(pct(fill.anyPlan, N))}%`, tip: `날짜가 있는 단계 예정이 하나라도 있는 사업 ${fill.anyPlan}/${N} · 연도별 실적은 전국 2022~, 수도권 2018~ · 규칙: 95% 이상 충족, 0 초과 부분` }),
  'F-06': () => ({ v: fill.baseline > 0 ? 'part' : 'none', metric: `기준선 ${fill.baseline}건`, tip: `최초(당초) 일정 기준선 ${fill.baseline}건 · 지연은 현재 예정일 경과로만 판정(당초 대비 아님) · 규칙: 기준선이 있으면 부분, 없으면 없음` }),
  'F-07': () => ({ v: fill.causes > 0 ? 'part' : 'none', metric: `원인·조치 기록 ${fill.causes}건`, tip: '병목 원인·담당기관·조치계획 기록(HOME execution_case·execution_schedule) 0건 · 규칙: 기록이 있으면 부분, 없으면 없음' }),
  'F-08': () => ({ v: fill.agencyTargets > 0 ? 'met' : fill.agencyKnown > 0 ? 'part' : 'none', metric: `기관 식별 ${Math.round(pct(fill.agencyKnown, N))}%`, tip: `LH·SH·GH 로 시행 기관을 아는 사업 ${fill.agencyKnown}/${N} · 기관별 배정 목표 ${fill.agencyTargets}건 · 규칙: 배정 목표가 있으면 충족, 기관만 알면 부분` }),
  'F-09': () => ({ v: pct(fill.supplyOrMoveInPlan, N) >= 80 ? 'met' : fill.supplyOrMoveInPlan > 0 ? 'part' : 'none', metric: `모집·입주 예정 ${Math.round(pct(fill.supplyOrMoveInPlan, N))}%`, tip: `모집 또는 입주 예정일이 있는 사업 ${fill.supplyOrMoveInPlan}/${N} · 규칙: 80% 이상 충족, 0 초과 부분` }),
  'F-10': () => ({ v: fill.sourced === N ? 'met' : fill.sourced > 0 ? 'part' : 'none', metric: `원천·기준일 ${fill.sourced}/${N}`, tip: `원천 참조와 기준일이 있는 사업 · 수집 실패 원천 ${fill.failedSources}곳(마지막 정상 값 사용) · 규칙: 모든 사업이면 충족` }),
  'F-11': () => ({ v: pairCells > 0 ? 'part' : 'none', metric: `목표·실적 같은 칸 ${pairCells}/6`, tip: `정상·주의·지연 판정 사업 ${cnt((p) => p.status !== 'none')}/${N} · 목표·실적 비교는 9·7 공급 한 칸 · 규칙: 목표·실적 칸이 있으면 부분` }),
  'F-12': () => ({ v: fill.scenarios > 0 ? 'part' : 'none', metric: `시나리오 ${fill.scenarios}건`, tip: '일정 이동 시나리오·기준선 저장 없음 · 규칙: 저장한 시나리오가 있으면 부분' }),
};
const requirements = Object.keys(reqSource).sort().map((id) => {
  const j = JUDGE[id]();
  return { id, title: reqSource[id].title, short: reqPriority[id]?.short ?? reqSource[id].title, priority: reqPriority[id]?.priority ?? '', items: reqSource[id].items, criterion: reqSource[id].criterion,
    dates: F_LINK[id][0], screens: F_LINK[id][1], verdict: j.v, metric: j.metric, tip: j.tip };
});

/* ---------- 핵심 질문 5 대조값(전체 범위): 화면(app.js questions)이 렌즈 범위로 다시 계산한 값과 맞춰 보는 용도 — data.json 에는 넣지 않는다 ---------- */
const delayed = projects.filter((p) => ['delay', 'long', 'caution'].includes(p.status));
const byBoard = [0, 0, 0, 0, 0, 0]; for (const p of delayed) byBoard[p.board] += p.units;
const bySido = {}; for (const p of delayed) bySido[p.sido] = (bySido[p.sido] ?? 0) + p.units;
const topSido = Object.entries(bySido).sort((a, b) => b[1] - a[1])[0] ?? null;
const upcoming = Object.values(calendar).flat().filter((e) => e.type === 'COMPLETION' && homeIds.has(e.id));

const out = {
  schema: 'home-concept-v2/1',
  meta: { ledgerMonth: MONTH, referenceDate: REF, dumpEdition: EDITION, dumpDate: '2026-10-13', molitThrough: molit.months[molit.months.length - 1], policyThrough: pp.referenceMonthEnd,
    longDelayMonths: LONG_DELAY_MONTHS, judge: { caution: 1, delay: 6 }, calendarFrom: calMonths[0], calendarTo: calMonths[11] },
  sido: SIDO, policies: pIndex.policies, programs: pIndex.programs,
  projects, superseded, details, refs, policyCells,
  annual: { nation, metro },
  calendar, areaMap, areaFacts: areaFacts.sido,
  sources: { status: statusRows, years: GRID_YEARS, coverage, links: homeSources.links, runs: homeSources.runs, oursCount: oursCatalog.length, homeCount: homeSources.sources.length },
  fill, directives, requirements,
};
const file = path.join(here, 'assets/data.json');
writeFileSync(file, JSON.stringify(out));
console.log(`data.json ${Math.round(JSON.stringify(out).length / 1024)} KB · 사업 ${N} · 상세 ${Object.keys(details).length} · 달력 시도 ${Object.keys(calendar).length} · 지시 ${directives.length} · 요구 ${requirements.length}`);
console.log(`지도 ${Math.round(JSON.stringify(areaMap).length / 1024)} KB · 시군구 ${areaMap.sgg.length} · 지구 ${areaMap.districts.length} · 위치 점 ${mapCount.point} · 근사 ${mapCount.area} · 대표 ${mapCount.rep} · 없음 ${mapCount.none}`, JSON.stringify(mapView));
console.log('채움률', Object.entries(fill).map(([k, v]) => `${k}=${v}`).join(' '));
console.log('핵심 질문(전체)', `병목 ${byBoard.indexOf(Math.max(...byBoard))} ${Math.max(...byBoard)}호 · 지연 ${cnt((p) => p.status === 'delay') + cnt((p) => p.status === 'long')}건 · 먼저 ${topSido ? `${SIDO[topSido[0]]} ${topSido[1]}호` : '없음'} · 12개월 준공 ${upcoming.reduce((s, e) => s + e.units, 0)}호 ${upcoming.length}건`);
console.log('판정', requirements.map((r) => `${r.id}:${r.verdict}(${r.metric})`).join(' | '));
/* 대조: HOME 수도권 통계와 통계누리(2022 준공, 경기) */
const yr = (months, arr, y) => months.reduce((s, m, i) => s + (m.startsWith(y) && arr[i] != null ? arr[i] : 0), 0);
console.log('대조 2022 경기 준공 HOME', yr(metro.months, metro.series.complete['41'], '2022'), '통계누리', yr(molit.months, molit.metrics.complete.series['41'].total, '2022'));
