/* 요청 시 조회용 입주 전 기반시설(infra.json 의 schools·stops 부분). /api/v1/infra 가 쓴다.
   tools/regiontools/infra.py(scheduled_schools · LEVEL_OF)와 같은 규칙을 JS 로 옮겼다.
   - 신설예정 학교: 교육재정알리미 전국 목록(약 220교, 키 없음)에서 단지 중심 가까운 것만. 자료의 pointX 는 위도, pointY 는 경도다.
   - 정류장: TAGO 좌표기반근접정류소(반경 약 500 m). 단지 중심마다 부르되 이미 부른 중심에서 150 m 안이면 건너뛴다(500 − 150 = 350 m ≥ 점검 반경 300 m).
   시험: tests/js/infra.api.test.cjs */
'use strict';

const LEVEL_OF = { 초: '초등학교', 중: '중학교', 고: '고등학교', 특수: '특수학교' };
const SCHOOL_NEAR_M = 2000;    // 단지 중심에서 이 거리 안 신설예정 학교를 싣는다(점검은 1,200 m, 지도에서 조금 더 넓게)
const STOP_SHOW_M = 400;       // 단지 중심에서 이 거리 안 정류소만 싣는다(점검은 300 m)
const STOP_SKIP_M = 150;       // 이미 부른 중심에서 이 거리 안이면 정류소 조회를 건너뛴다

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
function distM(a, b) {
  const R = 6371008.8, r = Math.PI / 180, dl = (b[1] - a[1]) * r, dn = (b[0] - a[0]) * r;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/* 닫힌 링(또는 Polygon 지오메트리)의 꼭짓점 평균 [경도, 위도] */
function centerOf(geometry) {
  const ring = geometry && geometry.type === 'Polygon' ? geometry.coordinates[0] : null;
  if (!ring || ring.length < 4) return null;
  const pts = ring.slice(0, -1);
  return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
}
const nearAny = (pt, centers, m) => centers.some((c) => distM(pt, c) <= m);

/* 교육재정알리미 행 → 신설예정 학교(번들 infra.json schools 항목). 학교급을 모르거나 개교 년월·좌표가 이상하면 건너뛴다. 개교가 빠른 순 */
function scheduledSchools(rows, centers, radiusM = SCHOOL_NEAR_M) {
  const out = [], skipped = { level: 0, ym: 0, point: 0 };
  for (const r of rows || []) {
    const level = LEVEL_OF[String(r.ditcNm || '').trim()];
    if (!level) { skipped.level++; continue; }
    const ym = String(r.openSchdYm || '');
    if (!/^(19|20)\d{2}(0[1-9]|1[0-2])$/.test(ym)) { skipped.ym++; continue; }
    const lat = Number(r.pointX), lon = Number(r.pointY);
    if (!(lat >= 30 && lat <= 45 && lon >= 120 && lon <= 135)) { skipped.point++; continue; }
    if (!nearAny([lon, lat], centers, radiusM)) continue;
    const s = { id: `edu-${r.schlSeq}`, name: String(r.schlNm || '').trim(), level, status: '신설예정', openYm: `${ym.slice(0, 4)}-${ym.slice(4)}` };
    for (const [key, field] of [['classes', 'classCnt'], ['students', 'stdtCnt']]) if (/^\d+$/.test(String(r[field] == null ? '' : r[field]).trim())) s[key] = Number(String(r[field]).trim());
    const addr = String(r.realAddr || '').trim();
    if (addr) s.address = addr;
    Object.assign(s, { lon, lat, sources: ['edu-newschool'] });
    out.push(s);
  }
  out.sort((a, b) => (a.openYm < b.openYm ? -1 : a.openYm > b.openYm ? 1 : a.name.localeCompare(b.name, 'ko')));
  return { schools: out, skipped };
}

/* TAGO 근접정류소 항목 → 번들 stops 항목(노선은 모른다) */
function tagoStop(it) {
  const lon = Number(it.gpslong), lat = Number(it.gpslati), id = String(it.nodeid || '').trim(), name = String(it.nodenm || '').trim();
  if (!id || !name || !(lat >= 30 && lat <= 45 && lon >= 120 && lon <= 135)) return null;
  const s = { id, name, lon: Math.round(lon * 1e6) / 1e6, lat: Math.round(lat * 1e6) / 1e6 };
  const no = String(it.nodeno == null ? '' : it.nodeno).trim();
  if (no) s.no = no;
  return s;
}

/* 정류소를 부를 중심들: 입력 순서대로 보되 이미 고른 중심에서 skipM 안이면 뺀다(최대 max 개) */
function queryCenters(centers, skipM = STOP_SKIP_M, max = 40) {
  const picked = [];
  for (const c of centers) { if (picked.length >= max) break; if (!picked.some((p) => distM(p, c) < skipM)) picked.push(c); }
  return picked;
}

const SOURCE_DEFS = {
  'edu-newschool': { id: 'edu-newschool', label: '지방교육재정알리미 신설예정학교', publisher: '교육부·한국교육학술정보원', url: 'https://eduinfo.go.kr/portal/theme/newSchMapPage.do', redistributable: 'unknown' },
  'tago-bus': { id: 'tago-bus', label: '국토교통부 TAGO 버스정류소정보', publisher: '국토교통부', url: 'https://www.data.go.kr/data/15098534/openapi.do', license: '이용허락범위 제한 없음', redistributable: 'Y' },
};

module.exports = { LEVEL_OF, SCHOOL_NEAR_M, STOP_SHOW_M, STOP_SKIP_M, SOURCE_DEFS, distM, centerOf, nearAny, scheduledSchools, tagoStop, queryCenters };
