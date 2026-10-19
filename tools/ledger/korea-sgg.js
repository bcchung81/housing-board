'use strict';
/* 전국 시군구 경계(판정 전용) assets/geo/korea-sgg.json 을 만든다 — /citizen '현 위치'가 브라우저 안에서 좌표 → 시군구를 맞출 때 늦게 불러오는 정적 파일.
   원천: V-World 2D 데이터 API LT_C_ADSIGG_INFO(행정구역 시군구) — 국토교통부 국가공간정보센터. 공공데이터포털 15059008 '국토교통부_행정구역도(WMS/WFS)',
         이용허락 공공누리 제1유형(출처표시). 전국 범위(BOX 124,33,132,39)를 PAGE_SIZE 건씩 모든 쪽을 받는다.
   투영: region-map/1 과 같다(tools/ledger/region-supply.js proj) 에 SCALE 배를 곱해 정수로 둔다(1 = 위도 1/(1000·SCALE)°).
   줄이기: korea-sido.js 와 같은 공유 호 방식(sggPaths — 이웃 시군구가 같은 점을 써서 틈·겹침이 없다) · Douglas-Peucker TOL · 넓이 MIN_AREA 미만 고리만 뺀다(작은 섬도 남긴다).
   범위: 수도권(서울 11·인천 28·경기 41)은 뺀다 — 화면이 region-map(우리 코드와 맞는 정본, 수도권 67곳)으로 먼저 맞추고, 없을 때만 이 파일을 본다.
   코드: 원천 코드가 우리 코드와 다르면 ALIAS(원천 → 우리)로 바꿔 쓴다(시험 tests/js/sgg-locate.test.cjs 가 모든 코드를 data.json sgg 와 대조한다).
   캐시: .cache/home-map/sgg-nation/LT_C_ADSIGG_INFO.json.gz(gitignore, 받은 날 포함). 캐시가 있으면 V-World 를 부르지 않아 같은 결과(결정적, 현재 시각 없음).
   키: lib/vworld.js 규칙(.env.local VWORLD_DEV_KEY·VWORLD_KEY) — 출력·파일에 쓰지 않는다.
   실행: node tools/ledger/korea-sgg.js [--refresh] */
const fs = require('node:fs');
const path = require('node:path');
const { createClient, cacheGet, cachePut, ROOT } = require('./home-vworld');
const { proj, sggPaths } = require('./region-supply');
const { crossRing } = require('../../assets/js/sgg-locate.js');

const OUT = 'assets/geo/korea-sgg.json';
const LAYER = 'LT_C_ADSIGG_INFO';
const PAGE_SIZE = 100;
const SCALE = 5, TOL = 3, MIN_AREA = 1;   // 1단위 ≈ 22 m · 허용 오차 3단위 ≈ 67 m(실측: 경계 300 m 안 표본에서 어긋난 점의 경계 거리 95% 34 m·99% 49 m) · 1단위²(≈500 m²) 미만 고리만 빼고, 무너진 작은 섬은 상자로 남긴다
const ISLE_MAX = 8 * TOL;   // 이보다 작은(상자 긴 변) 섬만 상자로 되살린다
const SKIP_SIDO = ['11', '28', '41'];
/* 원천 코드 → 우리 코드(원천이 옛 구획이거나 번호가 다른 곳). 없으면 그대로 쓴다 */
const ALIAS = {};

async function fetchRaw({ refresh = false } = {}) {
  const hit = !refresh && cacheGet('sgg-nation', LAYER);
  if (hit) return hit;
  const c = createClient({ maxCalls: 12, log: (m) => console.error(m) });
  const feats = [];
  for (let page = 1, total = Infinity; feats.length < total; page++) {
    const res = await c.data({ data: LAYER, size: String(PAGE_SIZE), page: String(page), geomFilter: 'BOX(124,33,132,39)' });
    if (res.status !== 'OK') break;
    total = Number(res.record.total);   // page.total 은 쪽 수
    const fs_ = res.result.featureCollection.features;
    if (!fs_.length) break;
    feats.push(...fs_);
  }
  const d = new Date(), fetched = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const out = { fetched, calls: c.stats.calls, features: feats.map((f) => ({ code: f.properties.sig_cd, name: f.properties.full_nm, geometry: f.geometry })) };
  cachePut('sgg-nation', LAYER, out);
  return out;
}

const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
const sproj = (p) => { const [x, y] = proj(p); return [x * SCALE, y * SCALE]; };
/* 'M절대 l상대…z' 여러 개 → 고리마다 [x0, y0, dx1, dy1, …](닫는 점 없음) */
const ringsOfD = (d) => (d.match(/M[^z]*z/g) || []).map((s) => s.slice(1, -1).replace('l', ' ').trim().split(/\s+/).map(Number));
/* 고리 안의 점(region-supply interiorPoint 와 같다): 세로 가운데 높이의 가로선이 고리와 만나는 가장 넓은 안쪽 구간의 가운데 */
function interiorPoint(r) {
  let y0 = Infinity, y1 = -Infinity; for (const p of r) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const y = (y0 + y1) / 2, xs = [];
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y)) xs.push(xi + (y - yi) * (xj - xi) / (yj - yi)); }
  xs.sort((a, b) => a - b);
  let k = 0; for (let i = 2; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > xs[k + 1] - xs[k]) k = i;
  return [(xs[k] + xs[k + 1]) / 2, y];
}
const inBox = (b, [x, y]) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
/* 줄이다 사라진 작은 섬(허용 오차보다 작아 고리가 무너진 것): 원천 바깥 고리 안의 점이 결과 고리에 없으면 그 섬의 상자(바깥으로 반올림)를 따로 남긴다 */
function isleBoxes(polys, rings) {
  const boxes = [];
  for (const [outer] of polys) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of outer) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    if (Math.max(x1 - x0, y1 - y0) > ISLE_MAX) continue;
    const pt = interiorPoint(outer);
    if (rings.reduce((c, r) => c !== crossRing(r, pt[0], pt[1]), false) || boxes.some((b) => inBox(b, pt))) continue;
    boxes.push([Math.floor(x0), Math.floor(y0), Math.ceil(x1), Math.ceil(y1)]);
  }
  return boxes.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]);
}

/* raw: { fetched, features: [{ code, name, geometry(경위도) }] } → korea-sgg/1 문서 */
function buildSgg(raw) {
  const feats = raw.features.filter((f) => !SKIP_SIDO.includes(f.code.slice(0, 2))).slice().sort((a, b) => a.code.localeCompare(b.code));
  const units = feats.map((f) => polysOf(f.geometry).map((p) => p.map((r) => r.map(sproj))));
  const { paths } = sggPaths(units, { tol: TOL, minArea: MIN_AREA });
  const sgg = feats.map((f, i) => {
    const rings = ringsOfD(paths[i].d), isles = isleBoxes(units[i], rings), b = paths[i].box.slice();
    for (const q of isles) { b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[2]); b[3] = Math.max(b[3], q[3]); }
    return isles.length ? [ALIAS[f.code] || f.code, f.name, b, rings, isles] : [ALIAS[f.code] || f.code, f.name, b, rings];
  });
  return {
    source: { name: `V-World 2D 데이터 API ${LAYER}(행정구역 시군구) — 국토교통부 국가공간정보센터`, catalog: 'https://www.data.go.kr/data/15059008/openapi.do', license: '공공누리 제1유형(출처표시)', fetched: raw.fetched },
    schema: 'korea-sgg/1',
    projection: `region-map/1 좌표 × ${SCALE}(정수) · x = (경도−124.5)·cos37.5°·${1000 * SCALE}, y = (38.4−위도)·${1000 * SCALE}`,
    scale: SCALE,
    simplify: `공유 호 Douglas-Peucker ${TOL}단위(≈${Math.round(TOL * 111 / SCALE)} m) · 넓이 ${MIN_AREA}단위² 미만 고리 제외`,
    skip: SKIP_SIDO,
    alias: ALIAS,
    rings: '시군구 = [코드, 이름, 상자 [x0, y0, x1, y1], 고리들, 작은 섬 상자들?] · 고리 = [x0, y0, dx1, dy1, …](닫는 점 없음), 한 시군구의 모든 고리에 짝수-홀수 규칙(구멍·섬 포함) · 작은 섬 상자 = 줄이다 무너진 섬의 바깥 상자(안이면 그 시군구)',
    sgg,
  };
}

if (require.main === module) {
  fetchRaw({ refresh: process.argv.includes('--refresh') }).then((raw) => {
    const doc = buildSgg(raw), txt = JSON.stringify(doc) + '\n';
    fs.mkdirSync(path.dirname(path.join(ROOT, OUT)), { recursive: true });
    fs.writeFileSync(path.join(ROOT, OUT), txt);
    console.log(`${OUT}: ${Math.round(txt.length / 1024)} KB · 시군구 ${doc.sgg.length}(원천 ${raw.features.length}, 수도권 ${SKIP_SIDO.join('·')} 제외) · 받은 날 ${doc.source.fetched}`);
  }).catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { OUT, LAYER, SCALE, TOL, MIN_AREA, ISLE_MAX, SKIP_SIDO, ALIAS, buildSgg, fetchRaw };
