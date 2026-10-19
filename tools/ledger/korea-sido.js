'use strict';
/* 전국 시도 외곽 경계(지도 첫 화면 /map 전국 보기의 맥락 면) data/board/korea-sido.json 을 만든다.
   원천: V-World 2D 데이터 API LT_C_ADSIDO_INFO(행정구역 시도) — 국토교통부 국가공간정보센터. 공공데이터포털 15059008 '국토교통부_행정구역도(WMS/WFS)',
         이용허락 공공누리 제1유형(출처표시). 2026-07 통합한 '전남광주통합특별시'(12)는 원천이 이미 한 면이다(광주 29·전남 46 따로 없음) → 16곳.
   투영: region-map/1 과 같다(tools/ledger/region-supply.js proj — x = (경도−124.5)·cos37.5°·1000, y = (38.4−위도)·1000, 정수).
   줄이기: region-map 과 같은 공유 호 방식(sggPaths — 꼭짓점 맞붙이기 snapUnits → 이음점에서 끊은 호를 한 번만 Douglas-Peucker)이라 이웃 시도끼리 같은 점을 쓴다.
         전국 무대(1px ≈ 6단위)에 맞춰 허용 오차 TOL·작은 섬 하한 MIN_AREA 를 크게 잡는다. 울릉도·독도(경도 130.5° 동쪽)는 넓이와 상관없이 따로 촘촘히 남긴다.
   캐시: .cache/home-map/sido/LT_C_ADSIDO_INFO.json.gz(gitignore, 받은 날 포함). 캐시가 있으면 V-World 를 부르지 않아 같은 결과(결정적, 현재 시각 없음).
   키: lib/vworld.js 규칙(.env.local VWORLD_DEV_KEY·VWORLD_KEY) — 출력·파일에 쓰지 않는다.
   실행: node tools/ledger/korea-sido.js [--refresh] */
const fs = require('node:fs');
const path = require('node:path');
const { createClient, cacheGet, cachePut, ROOT } = require('./home-vworld');
const { proj, dp, sggPaths } = require('./region-supply');
const OV = require('../../assets/js/overview.js');

const OUT = 'data/board/korea-sido.json';
const LAYER = 'LT_C_ADSIDO_INFO';
const TOL = 4, MIN_AREA = 60, EAST_LON = 130.5, EAST_TOL = 0.3;
/* 짧은 이름(통계누리 시도 이름 — data/board/molit.json 과 같다) */
const SHORT = { 11: '서울', 26: '부산', 27: '대구', 28: '인천', 30: '대전', 31: '울산', 36: '세종', 41: '경기', 43: '충북', 44: '충남', 47: '경북', 48: '경남', 50: '제주', 51: '강원', 52: '전북', 12: '전남광주' };

async function fetchRaw({ refresh = false } = {}) {
  const hit = !refresh && cacheGet('sido', LAYER);
  if (hit) return hit;
  const c = createClient({ maxCalls: 4, log: (m) => console.error(m) });
  const res = await c.data({ data: LAYER, size: '1000', geomFilter: 'BOX(124,33,132,39)' });
  const feats = res.status === 'OK' ? res.result.featureCollection.features : [];
  const d = new Date(), fetched = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const out = { fetched, features: feats.map((f) => ({ code: f.properties.ctprvn_cd, name: f.properties.ctp_kor_nm, geometry: f.geometry })) };
  cachePut('sido', LAYER, out);
  return out;
}

const area2 = (r) => Math.abs(r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y; }, 0)) / 2;
const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
/* 정수로 반올림한 닫힌 고리 → 'M절대 l상대…z'(region-supply ringPath 와 같은 꼴). 점 4개 미만이면 '' */
function ringD(pts) {
  const r = pts.map(([x, y]) => [Math.round(x), Math.round(y)]).filter((p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
  if (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) r.push(r[0]);
  if (r.length < 4) return '';
  return `M${r[0][0]} ${r[0][1]}l${r.slice(1, -1).map(([x, y], i) => `${x - r[i][0]} ${y - r[i][1]}`).join(' ')}z`;
}

/* raw: { fetched, features: [{ code, name, geometry(경위도) }] } → korea-sido/1 문서 */
function buildSido(raw) {
  const feats = raw.features.slice().sort((a, b) => a.code.localeCompare(b.code));
  /* 울릉도·독도: 모든 점이 EAST_LON 동쪽인 다각형은 공유 호 없이 따로(작아도 남긴다) */
  const isEast = (p) => p[0].every(([lon]) => lon > EAST_LON);
  const units = feats.map((f) => polysOf(f.geometry).filter((p) => !isEast(p)).map((p) => p.map((r) => r.map(proj))).filter((p) => area2(p[0]) >= MIN_AREA));
  const { paths } = sggPaths(units, { tol: TOL, minArea: MIN_AREA });
  const sido = feats.map((f, i) => {
    const east = polysOf(f.geometry).filter(isEast).map((p) => ringD(dp(p[0].map(proj), EAST_TOL))).filter(Boolean).join('');
    const d = paths[i].d + east, rings = OV.pathRings(d), l = OV.labelPoint(rings).map(Math.round);
    return { s: f.code, n: SHORT[f.code] || f.name, d, l };
  });
  const all = sido.flatMap((x) => OV.pathRings(x.d)), [x0, y0, w, h] = OV.ringsBox(all), pad = Math.round(Math.max(w, h) * 0.02);
  return {
    source: { name: `V-World 2D 데이터 API ${LAYER}(행정구역 시도) — 국토교통부 국가공간정보센터`, catalog: 'https://www.data.go.kr/data/15059008/openapi.do', license: '공공누리 제1유형(출처표시)', fetched: raw.fetched },
    schema: 'korea-sido/1',
    projection: '등장방형(위도 37.5° 보정) · 1000 = 위도 1° · x = (경도−124.5)·cos37.5°·1000, y = (38.4−위도)·1000 (region-map/1 과 같다)',
    simplify: `공유 호 Douglas-Peucker ${TOL}단위 · 넓이 ${MIN_AREA}단위² 미만 섬 제외 · 울릉도·독도(경도 ${EAST_LON}° 동쪽)는 ${EAST_TOL}단위로 따로 남김`,
    view: [x0 - pad, y0 - pad, w + 2 * pad, h + 2 * pad],
    sido,
  };
}

if (require.main === module) {
  fetchRaw({ refresh: process.argv.includes('--refresh') }).then((raw) => {
    const doc = buildSido(raw), txt = JSON.stringify(doc) + '\n';
    fs.writeFileSync(path.join(ROOT, OUT), txt);
    console.log(`${OUT}: ${Math.round(txt.length / 1024)} KB · 시도 ${doc.sido.length} · 받은 날 ${doc.source.fetched}`);
  }).catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { OUT, LAYER, SHORT, TOL, MIN_AREA, EAST_LON, buildSido, fetchRaw };
