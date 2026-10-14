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
const GEO_COS = Math.cos(37.5 * Math.PI / 180), GEO_TOL = 1.2;
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
const area2 = (r) => Math.abs(r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y; }, 0)) / 2;
/* 줄인 고리마다 'M절대 l상대…z'. minArea 단위² 미만 고리(작은 섬·조각)는 뺀다 */
function pathOf(rings, tol = GEO_TOL, minArea = 4) {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  const d = rings.map((ring) => {
    const r = dp(ring.map(proj), tol).map(([x, y]) => [Math.round(x), Math.round(y)]).filter((p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
    if (r.length < 4 || area2(r) < minArea) return '';
    for (const [x, y] of r) { box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y); }
    return `M${r[0][0]} ${r[0][1]}l${r.slice(1, -1).map(([x, y], i) => `${x - r[i][0]} ${y - r[i][1]}`).join(' ')}z`;
  }).join('');
  return { d, box };
}

/* munis: HOME municipality + policy_municipality payload · districts: district payload */
function buildMap(munis, districts) {
  const sgg = munis.map((m) => { const { d, box } = pathOf(ringsOf(m.geometry)); return { s: METRO[m.region], n: m.name, codes: [...(m.admin_codes ?? [])].sort(), c: proj([m.longitude, m.latitude]).map(Math.round), d, box }; })
    .filter((g) => g.s).sort((a, b) => a.s.localeCompare(b.s) || a.codes.join().localeCompare(b.codes.join()) || a.n.localeCompare(b.n, 'ko'));
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

/* 사업 위치: home-map 의 위치(블록 라벨점·주소 근사점·지구 대표점 = 점, 근사 영역 = area) → 없으면 시군구 대표점('rep').
   loc: 사업 id → home-map loc({ by, at }) · geo: buildMap 의 시군구(코드·대표점). 서울·인천·경기만 붙인다 */
const LOC_KIND = new Set(['block', 'address', 'district', 'area']);
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

module.exports = { KINDS, METRO, addM, monthOf, buildCalendar, buildMap, placeCalendar, buildAnnual, pathOf, proj, build, OUT };
