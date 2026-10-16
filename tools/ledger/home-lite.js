'use strict';
/* 수도권 지도 경량 번들: HOME 사업이 있는 시군구마다 data/board/home-lite/<시군구>.json 하나. 지도(assets/js/region.js)는 수도권 시군구를 열 때
   home-map(사업 행) 과 함께 이 파일을 받아, 번들 3곳(계양·광산·나주)처럼 처음부터 건물 외곽·지구 경계·사업 표지를 그린다.
   - buildings: 위치가 있는 사업(블록 라벨점·대표 지번·지구 대표점·이름 검색 근사, home-map 의 loc) 둘레 RADIUS_M 안에 중심점이 있는 건물
     + 블록·지구 위치 사업이 든 공공주택지구(공동주택용지 면의 볼록 껍질, 넓이 WIDE_MAX_M2 이하) 안의 건물(wide: 그 지구 이름들).
     이름 검색 근사(loc.by 'name')는 위치가 불확실해 APPROX_RADIUS_M 만 담는다(2026-10-14: 근사 사업이 많은 서울 시군구 번들이 커서 첫 열기가 늦었다).
     V-World 건물 레이어(LT_C_BLDGINFO)를 /api/v1/buildings 와 같은 0.01° 칸·같은 변환(lib/buildings.js convertFeature, 계양 층고)으로 받는다
     → 지도가 번들 밖을 요청 시 조회할 때 같은 건물은 같은 좌표라 중심점으로 겹침을 거른다.
   - districts: 그 시군구에 걸친 공공주택지구(HOME district — V-World 공동주택용지 도형). 대표점이 시군구 경계 안이거나 연결 사업이 이 시군구인 지구. 면만, 단순화(약 1 m).
   - blocks: 시군구 경계 안의 LH 블록 라벨점 중 사업 표지와 겹치지 않는 것(지구 안 다른 블록). 라벨점을 품은 LH 주택 블록 다각형이 있으면 poly(닫힌 링) — 지도는 '이름 모르는 주택 용지' 윤곽으로,
     없으면 옅은 점 표지로. 사업 블록과 같은 다각형인 라벨점·같은 다각형의 둘째 라벨점은 뺀다.
   - projects: [사업 id, 둘레 건물 수, 블록 링?] — 사업 속성은 home-map 과 같은 id 로 잇고 여기에 다시 싣지 않는다.
     블록 링: LH 블록 라벨점(loc.by 'block')을 품은 V-World LH 주택 블록(LT_C_LHBLPN, blocktype 이 주택 용지) 다각형의 바깥 링(닫힘, 약 1 m 단순화, 소수 6자리).
     지도(region.js homeToProjects)는 이 링을 사업 구역(단계색 면)으로 그린다. 블록 하나에 사업이 둘이면 둘 다 점 표지로 둔다(같은 면이 겹친다).
     원 응답은 .cache/home-map/lhblpn/ (라벨점마다 POINT 조회 1건).
   - 건물 한 줄 = [속성, 도형]. 도형은 링마다 경위도×1e6 정수의 첫 점 + 차이(닫는 점 뺌), MultiPolygon 이면 { m: [폴리곤...] } (encodeGeometry).
     지도(region.js liteFeatures)가 GeoJSON 으로 되돌리면 원래 좌표(소수 6자리)와 같은 수가 된다 — gzip 이 GeoJSON 의 약 절반.
   - 같은 입력(home-map·HOME 판·캐시) → 같은 바이트: 건물은 중심점 순, 좌표 소수 6자리. 원 응답(변환한 칸)은 .cache/home-map/cells/ (home-vworld.js) — 캐시가 있으면 V-World 를 부르지 않는다.
   - index.json: 수도권 시군구 전부(이름·사업 수·지도에 그릴 사업 수·경량 번들 유무). scripts/build.js 가 지역 선택기 목록으로 넘긴다.
   실행: node tools/ledger/home-lite.js [--month YYYY-MM] [--max-calls N] [--plan]   (--plan: 칸 수만 세고 부르지 않음)
   시험: tests/js/home-lite.test.cjs */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const P = require('./paths');
const V = require('./home-vworld');
const Bld = require('../../lib/buildings.js');
const { readHome, latestHomeDir, homeAvailable } = require('./home-source');

const OUT_DIR = 'data/board/home-lite';
const SCHEMA = 'home-lite/1';
const RADIUS_M = 300;
const APPROX_RADIUS_M = 150;
const radiusOf = (r) => (r.loc && r.loc.by === 'name' ? APPROX_RADIUS_M : RADIUS_M);
const DRAWN = new Set(['block', 'address', 'district', 'name']);
const LAYER = 'LT_C_BLDGINFO';
const PAGE_SIZE = 1000;
const MAX_PAGES = 12;   // /api/v1/buildings 는 5쪽에서 자르지만(시간당 상한) 미리 담는 번들은 칸을 다 받는다(성남 수정구 등 5천 동 넘는 칸)
const WIDE_MAX_M2 = 2e6;   // 지구 전체 건물을 담는 지구 넓이 상한. 2026-10-16 실측: 큰 신도시(고양창릉 10.6·남양주왕숙 9.3·파주운정3 12.2·화성동탄2 27.5 km²)까지 담으면
                           // 건물이 약 2만 동 늘어 그 시군구 번들이 gzip 150 KB 를 넘는다(첫 열기) — 큰 지구는 사업 둘레만, 나머지는 확대하면 요청 시 조회
const SIMPLIFY_DEG = 1e-5;   // 지구 경계·블록 단순화(약 1 m)
const BLOCK_LAYER = 'LT_C_LHBLPN';
const HOUSING_BLOCK = /주택|주상복합|아파트|연립|단독/;   // LH 블록 blocktype 중 주택 용지(공동주택·아파트·연립·주상복합 등 — 2026-10-16 수도권 라벨점 실측: 공동주택 226·아파트 29·주상복합 8·연립 1, 복합시설용지기타 15·공원 3 은 뺀다). 도로·공원·학교 등은 사업 구역으로 쓰지 않는다
const r6 = (v) => Math.round(v * 1e6) / 1e6;
const byStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/* ---------- 순수 함수 ---------- */
/* 점 둘레 반경 rM 상자에 걸치는 0.01° 칸들 */
function cellsAround([x, y], rM = RADIUS_M) {
  const dx = rM / (111320 * Math.cos(y * Math.PI / 180)), dy = rM / 110540, out = [];
  for (let ix = Math.floor((x - dx) * 100); ix <= Math.floor((x + dx) * 100); ix++) for (let iy = Math.floor((y - dy) * 100); iy <= Math.floor((y + dy) * 100); iy++) out.push(`${ix},${iy}`);
  return out;
}
/* 경위도 상자 [x0, y0, x1, y1] 에 걸치는 0.01° 칸들 */
function cellsInBox([x0, y0, x1, y1]) {
  const out = [];
  for (let ix = Math.floor(x0 * 100); ix <= Math.floor(x1 * 100); ix++) for (let iy = Math.floor(y0 * 100); iy <= Math.floor(y1 * 100); iy++) out.push(`${ix},${iy}`);
  return out;
}
const keyOf = (c) => `${c[0]},${c[1]}`;
/* 사업 지점들 → 그 둘레 반경 안(또는 areas 의 면 안)에 중심점이 있는 건물(중심점 순, 겹치면 하나). 지점은 [경도, 위도] 또는 { at, r }(사업마다 반경) */
function nearBuildings(features, points, rM = RADIUS_M, areas = []) {
  const seen = new Map(), ps = points.map((p) => (Array.isArray(p) ? { at: p, r: rM } : p));
  for (const f of features) {
    const c = Bld.centroidOf(f.geometry);
    if (!c || seen.has(keyOf(c))) continue;
    if (ps.some((p) => V.distM(p.at, c) <= p.r) || areas.some((g) => V.pointInGeometry(g, c))) seen.set(keyOf(c), f);
  }
  return [...seen.entries()].sort((a, b) => byStr(a[0], b[0])).map(([, f]) => f);
}
/* Douglas–Peucker(경위도 그대로, 짧은 거리라 충분) */
function simplifyRing(ring, tol = SIMPLIFY_DEG) {
  const pts = ring.slice(0, -1);
  if (pts.length < 4) return ring.map((p) => [r6(p[0]), r6(p[1])]);
  const keep = new Uint8Array(pts.length); keep[0] = 1; keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let idx = -1, dmax = 0;
    const [ax, ay] = pts[a], [bx, by] = pts[b], L = Math.hypot(bx - ax, by - ay) || 1e-12;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L; if (d > dmax) { dmax = d; idx = i; } }
    if (dmax > tol) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  const out = pts.filter((_, i) => keep[i]).map((p) => [r6(p[0]), r6(p[1])]);
  return out.length >= 3 ? [...out, out[0]] : null;
}
/* HOME district 도형(GeometryCollection·MultiPolygon·Polygon, 선은 버림) → 바깥 링들 */
function districtRings(g) {
  const parts = !g ? [] : g.type === 'GeometryCollection' ? g.geometries : [g];
  return parts.flatMap((x) => (x.type === 'Polygon' ? [x.coordinates] : x.type === 'MultiPolygon' ? x.coordinates : [])).map((p) => simplifyRing(p[0])).filter(Boolean);
}

/* 링들의 점 → 볼록 껍질(닫힌 링)과 넓이(m²) */
function hullOf(rings) {
  const pts = rings.flat().slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (ps) => { const h = []; for (const p of ps) { while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop(); h.push(p); } h.pop(); return h; };
  const h = [...half(pts), ...half(pts.slice().reverse())], ring = [...h, h[0]];
  const kx = 111320 * Math.cos((pts[0][1] * Math.PI) / 180), ky = 110540;
  const m2 = Math.abs(ring.reduce((s, p, i) => (i ? s + (ring[i - 1][0] * p[1] - p[0] * ring[i - 1][1]) : 0), 0)) / 2 * kx * ky;
  return { ring, m2 };
}
/* 블록·지구 위치 사업(drawn 중 loc.by block·district)이 든 지구(껍질 안이거나 연결 사업 id) 중 껍질 넓이가 WIDE_MAX_M2 이하인 것 → [{ name, hull }](이름 순) */
function wideDistricts(drawn, districts) {
  const rs = drawn.filter((r) => r.loc.by === 'block' || r.loc.by === 'district');
  return districts.map((d) => ({ name: d.name, ids: d.ids, ...hullOf(d.rings) })).filter((d) => d.m2 <= WIDE_MAX_M2
    && rs.some((r) => d.ids.includes(r.id) || V.pointInGeometry({ type: 'Polygon', coordinates: [d.ring] }, r.loc.at)))
    .map((d) => ({ name: d.name, hull: d.ring })).sort((a, b) => byStr(a.name, b.name));
}

/* 라벨점 POINT 조회 응답(피처들) → 그 점을 품은 주택 블록 { id, ring } 또는 null. 여럿이면 넓이가 가장 작은 것(겹친 옛 계획보다 세부 블록), 같으면 id 순 */
function blockAt(features, at) {
  const area = (r) => Math.abs(r.reduce((s, p, i) => (i ? s + (r[i - 1][0] * p[1] - p[0] * r[i - 1][1]) : 0), 0)) / 2;
  const hits = [];
  for (const f of features || []) {
    if (!HOUSING_BLOCK.test(String(f.blocktype || ''))) continue;
    const polys = !f.geometry ? [] : f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
    const p = polys.find((q) => V.pointInGeometry({ type: 'Polygon', coordinates: q }, at));
    const ring = p && simplifyRing(p[0]);
    if (ring) hits.push({ id: String(f.id), ring, a: area(p[0]) });
  }
  hits.sort((x, y) => x.a - y.a || byStr(x.id, y.id));
  return hits.length ? { id: hits[0].id, ring: hits[0].ring } : null;
}

/* home-map 문서 하나 + 칸 건물 + 지구·블록 원본 + 시군구 경계 + 라벨점 → 블록(blockOf) → 경량 번들(없으면 null) */
function liteDoc(doc, { features, districts, blocks, inside, basis, edition, blockOf = () => null }) {
  const drawn = doc.projects.filter((r) => r.loc && DRAWN.has(r.loc.by) && Array.isArray(r.loc.at));
  const points = drawn.map((r) => r.loc.at);
  const wide = wideDistricts(drawn, districts);
  const buildings = nearBuildings(features, drawn.map((r) => ({ at: r.loc.at, r: radiusOf(r) })), RADIUS_M, wide.map((w) => ({ type: 'Polygon', coordinates: [w.hull] })));
  const shapeOf = new Map(drawn.filter((r) => r.loc.by === 'block').map((r) => [r.id, blockOf(r.loc.at)]).filter(([, b]) => b));
  const used = new Map();
  for (const b of shapeOf.values()) used.set(b.id, (used.get(b.id) || 0) + 1);
  const projects = drawn.map((r) => {
    const b = shapeOf.get(r.id), row = [r.id, buildings.filter((f) => V.distM(r.loc.at, Bld.centroidOf(f.geometry)) <= radiusOf(r)).length];
    return b && used.get(b.id) === 1 ? [...row, b.ring] : row;
  }).sort((a, b) => byStr(a[0], b[0]));
  const ids = new Set(doc.projects.map((r) => r.id));
  const ds = districts.filter((d) => inside([d.lon, d.lat]) || d.ids.some((id) => ids.has(id))).map((d) => ({ name: d.name, polys: d.rings })).sort((a, b) => byStr(a.name, b.name));
  const taken = new Set(points.map(keyOf)), seen = new Set(used.keys());
  const bs = blocks.filter((b) => inside(b.at) && !taken.has(keyOf(b.at))).sort((a, b) => byStr(a.label, b.label) || byStr(keyOf(a.at), keyOf(b.at))).flatMap((b) => {
    const s = blockOf(b.at);
    if (!s) return [b];
    if (seen.has(s.id)) return [];
    seen.add(s.id);
    return [{ ...b, poly: s.ring }];
  });
  if (!buildings.length && !ds.length && !bs.length) return null;
  return { schema: SCHEMA, sgg: doc.sgg, name: doc.name ?? null, edition, basis, radiusM: RADIUS_M, approxRadiusM: APPROX_RADIUS_M, wide: wide.map((w) => w.name), projects, districts: ds, blocks: bs, buildings };
}
/* 링(닫힘) → [x0, y0, dx1, dy1, …](경위도×1e6 정수, 닫는 점 뺌) */
function encodeRing(ring) {
  const out = []; let px = 0, py = 0;
  ring.slice(0, -1).forEach(([x, y], i) => { const X = Math.round(x * 1e6), Y = Math.round(y * 1e6); out.push(i ? X - px : X, i ? Y - py : Y); px = X; py = Y; });
  return out;
}
const encodeGeometry = (g) => (g.type === 'Polygon' ? g.coordinates.map(encodeRing) : { m: g.coordinates.map((p) => p.map(encodeRing)) });
/* 파일 글: 머리 칸 한 줄씩, 지구·블록·건물 한 줄씩(건물은 [속성, 부호화한 도형]) */
function renderLite(d0) {
  const d = { ...d0, buildings: d0.buildings.map((f) => [f.properties, encodeGeometry(f.geometry)]) };
  const head = Object.entries(d).filter(([k]) => !['districts', 'blocks', 'buildings'].includes(k)).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  const list = (k) => `  ${JSON.stringify(k)}: [${d[k].length ? `\n${d[k].map((x) => `    ${JSON.stringify(x)}`).join(',\n')}\n  ` : ''}]`;
  return `{\n${head.join('\n')}\n${list('districts')},\n${list('blocks')},\n${list('buildings')}\n}\n`;
}

module.exports = { OUT_DIR, SCHEMA, RADIUS_M, APPROX_RADIUS_M, WIDE_MAX_M2, cellsAround, cellsInBox, nearBuildings, hullOf, wideDistricts, simplifyRing, districtRings, blockAt, liteDoc, encodeGeometry, renderLite };

/* ---------- 실행 ---------- */
async function fetchCell(client, key) {
  const name = key.replace(',', '_');
  const hit = V.cacheGet('cells', name);
  if (hit) return hit;
  const [ix, iy] = key.split(',').map(Number), [x0, y0, x1, y1] = Bld.cellBbox(ix, iy);
  const out = { cell: key, fetchedAt: new Date().toISOString().slice(0, 10), pages: 0, rawCount: 0, truncated: false, features: [] };
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await client.data({ data: LAYER, size: String(PAGE_SIZE), page: String(page), geomFilter: `BOX(${x0},${y0},${x1},${y1})` });
    out.pages++;
    const fc = res.status === 'OK' ? (((res.result || {}).featureCollection || {}).features || []) : [];
    out.rawCount += fc.length;
    for (const f of fc) { const feat = Bld.convertFeature(f); if (feat && Bld.inCell(Bld.centroidOf(feat.geometry), ix, iy)) out.features.push(feat); }
    const total = res.status === 'OK' ? Number((res.page || {}).total) || 1 : 1;
    if (page >= total || !fc.length) break;
    if (page === MAX_PAGES) out.truncated = true;
  }
  V.cachePut('cells', name, out);
  return out;
}

/* 라벨점 하나 → 그 점에 걸친 LH 블록 피처들(POINT 조회 1건, 캐시 lhblpn/<경도>_<위도>) */
const blockCacheName = (at) => `${at[0].toFixed(6)}_${at[1].toFixed(6)}`;
async function fetchBlockAt(client, at) {
  const hit = V.cacheGet('lhblpn', blockCacheName(at));
  if (hit) return hit;
  const res = await client.data({ data: BLOCK_LAYER, size: '20', geomFilter: `POINT(${at[0]} ${at[1]})` });
  const fc = res.status === 'OK' ? (((res.result || {}).featureCollection || {}).features || []) : [];
  const out = { at, fetchedAt: new Date().toISOString().slice(0, 10), features: fc.map((f) => ({ id: f.id, blocktype: (f.properties || {}).blocktype ?? null, zonename: (f.properties || {}).zonename ?? null, geometry: f.geometry })) };
  V.cachePut('lhblpn', blockCacheName(at), out);
  return out;
}

async function main() {
  const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : process.argv[i + 1]; };
  const month = arg('month', P.latestMonth()), dir = P.ledgerDir(month);
  const homeDir = latestHomeDir(dir);
  if (!homeAvailable(homeDir)) throw new Error(`HOME 판 원본(jsonl.gz)이 없다: ${homeDir ?? `${dir}/raw/home`}`);
  const home = readHome(homeDir);
  const homeIds = JSON.parse(fs.readFileSync(path.join(dir, 'mappings/home-ids.json'), 'utf8'));
  const mapDir = path.join(P.ROOT, 'data/board/home-map');
  const docs = fs.readdirSync(mapDir).filter((f) => /^\d{5}\.json$/.test(f)).sort().map((f) => JSON.parse(fs.readFileSync(path.join(mapDir, f), 'utf8')));
  const districts = (home.kinds.district ?? []).map((r) => ({ name: String(r.payload.name ?? r.entity_id), lon: r.payload.longitude, lat: r.payload.latitude, rings: districtRings(r.payload.geometry),
    ids: (r.payload.project_ids ?? []).map((p) => homeIds[`PRO:${p}`] ?? homeIds[`HPR:${p}`]).filter(Boolean) })).filter((d) => d.rings.length);
  const blocks = (home.kinds.block_location ?? []).map((r) => ({ label: `${r.payload.district_name ?? ''} ${r.payload.block ?? ''}`.trim(), at: [r6(r.payload.longitude), r6(r.payload.latitude)] })).filter((b) => b.at.every(Number.isFinite));
  const drawnOf = (d) => d.projects.filter((r) => r.loc && DRAWN.has(r.loc.by) && Array.isArray(r.loc.at));
  const bboxOf = (ring) => [Math.min(...ring.map((p) => p[0])), Math.min(...ring.map((p) => p[1])), Math.max(...ring.map((p) => p[0])), Math.max(...ring.map((p) => p[1]))];
  const cellsOf = (d) => [...new Set([...drawnOf(d).flatMap((r) => cellsAround(r.loc.at)), ...wideDistricts(drawnOf(d), districts).flatMap((w) => cellsInBox(bboxOf(w.hull)))])];
  const cells = [...new Set(docs.flatMap(cellsOf))].sort();
  const cached = cells.filter((k) => fs.existsSync(path.join(V.CACHE, 'cells', `${k.replace(',', '_')}.json.gz`))).length;
  const labelPts = [...new Map([...docs.flatMap((d) => drawnOf(d).filter((r) => r.loc.by === 'block').map((r) => r.loc.at)), ...blocks.map((b) => b.at)].map((p) => [keyOf(p), p])).entries()].sort((a, b) => byStr(a[0], b[0])).map(([, p]) => p);
  const blockCached = labelPts.filter((p) => fs.existsSync(path.join(V.CACHE, 'lhblpn', `${blockCacheName(p)}.json.gz`))).length;
  console.log(`칸 ${cells.length}개(캐시 ${cached}, 새로 받을 칸 ${cells.length - cached}) · 사업 지점 ${docs.reduce((s, d) => s + drawnOf(d).length, 0)} · 블록 라벨점 ${labelPts.length}개(캐시 ${blockCached}, 새로 부를 ${labelPts.length - blockCached}건)`);
  if (process.argv.includes('--plan')) return;
  const client = V.createClient({ maxCalls: Number(arg('max-calls', 3000)), log: () => {} });
  const got = new Map(), blockRes = new Map(), failed = [];
  let done = 0;
  await Promise.all(cells.map(async (k) => {
    try { got.set(k, await fetchCell(client, k)); } catch (e) { failed.push(`${k}: ${e.message}`); }
    if (++done % 50 === 0) console.log(`  칸 ${done}/${cells.length} (호출 ${client.stats.calls}, 재시도 ${client.stats.retries})`);
  }));
  await Promise.all(labelPts.map(async (p) => {
    try { blockRes.set(keyOf(p), await fetchBlockAt(client, p)); } catch (e) { failed.push(`블록 ${keyOf(p)}: ${e.message}`); }
  }));
  if (failed.length) { console.error(`실패 ${failed.length}건 — 쓰지 않는다(다시 실행하면 받은 칸·블록은 캐시에서):\n  ${failed.sort().join('\n  ')}`); process.exit(1); }
  const blockOf = (at) => { const r = blockRes.get(keyOf(at)); return r ? blockAt(r.features, at) : null; };
  const out = path.join(P.ROOT, OUT_DIR);
  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(out)) if (/^\d{5}\.json$/.test(f)) fs.rmSync(path.join(out, f));
  const index = [], sizes = [];
  const truncated = [...got.values()].filter((c) => c.truncated).map((c) => c.cell);
  const client2 = V.createClient({ maxCalls: Number(arg('max-calls', 3000)) });
  for (const d of docs) {
    const b = await V.sggBoundary(client2, d.sgg);
    const inside = (pt) => V.pointInGeometry(b.geometry, pt);
    const mine = cellsOf(d).map((k) => got.get(k));
    const basis = mine.length ? mine.map((c) => c.fetchedAt).sort().pop().replace(/-/g, '') : null;
    const lite = liteDoc(d, { features: mine.flatMap((c) => c.features), districts, blocks, inside, basis, edition: home.edition, blockOf });
    index.push({ sgg: d.sgg, name: d.name ?? null, projects: d.projects.length, drawn: drawnOf(d).length, lite: !!lite });
    if (!lite) continue;
    const text = renderLite(lite);
    fs.writeFileSync(path.join(out, `${d.sgg}.json`), text);
    const per = lite.projects.map(([id]) => { const row = drawnOf(d).find((r) => r.id === id), at = row.loc.at; return zlib.gzipSync(JSON.stringify(lite.buildings.filter((f) => V.distM(at, Bld.centroidOf(f.geometry)) <= radiusOf(row)).map((f) => [f.properties, encodeGeometry(f.geometry)]))).length; });
    sizes.push({ sgg: d.sgg, raw: Buffer.byteLength(text), gz: zlib.gzipSync(text).length, n: lite.buildings.length, d: lite.districts.length, b: lite.blocks.length, bp: lite.blocks.filter((x) => x.poly).length, p: lite.projects.length, ps: lite.projects.filter((x) => x[2]).length, perMax: per.length ? Math.max(...per) : 0 });
  }
  fs.writeFileSync(path.join(out, 'index.json'), `{\n  "schema": "home-lite-index/1",\n  "edition": ${JSON.stringify(home.edition)},\n  "radiusM": ${RADIUS_M},\n  "approxRadiusM": ${APPROX_RADIUS_M},\n  "sggs": [\n${index.map((x) => `    ${JSON.stringify(x)}`).join(',\n')}\n  ]\n}\n`);
  const kb = (n) => `${Math.round(n / 1024)}KB`;
  for (const s of sizes) console.log(`  ${s.sgg} 건물 ${s.n} · 지구 ${s.d} · 블록 ${s.b}(다각형 ${s.bp}) · 사업 ${s.p}(블록 구역 ${s.ps}) · ${kb(s.raw)} (gzip ${kb(s.gz)}, 사업당 최대 gzip ${kb(s.perMax)})`);
  console.log(`블록 구역 사업 ${sizes.reduce((a, s) => a + s.ps, 0)} · 다른 블록 다각형 ${sizes.reduce((a, s) => a + s.bp, 0)}/${sizes.reduce((a, s) => a + s.b, 0)}`);
  const tot = sizes.reduce((a, s) => ({ raw: a.raw + s.raw, gz: a.gz + s.gz }), { raw: 0, gz: 0 });
  console.log(`${OUT_DIR}/: 시군구 ${sizes.length}/${docs.length} · 합계 ${kb(tot.raw)} (gzip ${kb(tot.gz)}) · 시군구 gzip 최대 ${kb(Math.max(...sizes.map((s) => s.gz)))} · 사업당 gzip 최대 ${kb(Math.max(...sizes.map((s) => s.perMax)))}`);
  console.log(`V-World 호출 ${client.stats.calls}(재시도 ${client.stats.retries}) · 실패 칸 0 · 잘린 칸 ${truncated.length}${truncated.length ? ` (${truncated.join(' ')})` : ''}`);
}
if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
