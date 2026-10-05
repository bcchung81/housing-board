/* 코드 해석 API: 표준코드(법정동·시군구·PNU)를 받아 지도가 열 영역을 알려 준다.

   GET /api/v1/resolve?code=<코드>        (또는 sgg= | bjd= | pnu= 중 하나)   선택: geometry=0|1
   → 200 { type, canonical, input, sgg, bjd?, pnu?, name, level, bbox, center, geometry?, parcel?, coverage, warnings?, source, asOf }
   → 4xx/5xx application/problem+json (RFC 7807): invalid-code 400 · unsupported-level 422 · unknown-code 404 · keys-exhausted 429 · not-configured 503 · upstream 502

   처리 순서: 형식 판별(lib/codes.js) → 행정표준코드 API(StanReginCd)로 존재 확인(시군구 단위로 가져와 캐시) → V-World 경계·필지(속성 조회) → 커버리지(regions/ 번들 유무).
   - 인증키: lib/keys.js 의 RESOLVE 용도 풀(DATA_GO_KR_KEY_RESOLVE_<N>, 없으면 DATA_GO_KR_KEY). V-World 는 VWORLD_KEY·VWORLD_DOMAIN.
   - 캐시: lib/cache.js 로컬 캐시 24시간(표준코드 표·경계·필지). 키·원본 응답은 응답에 싣지 않는다.
   - PNU 필지를 못 찾으면 법정동 경계로 후퇴하고 warnings 에 알린다. V-World 가 실패하면 경계 없이 이름·커버리지만 준다.
   - 시군구 폴리곤은 크므로 geometry 는 기본 생략(geometry=1 이면 포함). 링은 최대 600점으로 줄인다.
   시험: tests/js/resolve.test.cjs */
'use strict';
const fs = require('fs');
const path = require('path');
const { createKeyPool, fileStore, memoryStore, KeyPoolError } = require('../../lib/keys.js');
const { createCache, defaultDir } = require('../../lib/cache.js');
const codes = require('../../lib/codes.js');

const STAN_URL = 'https://apis.data.go.kr/1741000/StanReginCd/getStanReginCdList';
const VWORLD_URL = 'https://api.vworld.kr/req/data';
const TTL_MS = 24 * 3600 * 1000;
const FETCH_TIMEOUT_MS = 10000;
const MAX_RING_POINTS = 600;
const ALLOWED = new Set(['code', 'sgg', 'bjd', 'pnu', 'geometry']);

const LAYERS = {
  sgg: { layer: 'LT_C_ADSIGG_INFO', filter: (c) => `sig_cd:=:${c}`, source: 'V-World 시군구 경계(LT_C_ADSIGG_INFO)' },
  umd: { layer: 'LT_C_ADEMD_INFO', filter: (c) => `emd_cd:=:${c.slice(0, 8)}`, source: 'V-World 법정읍면동 경계(LT_C_ADEMD_INFO)' },
  pnu: { layer: 'LP_PA_CBND_BUBUN', filter: (c) => `pnu:=:${c}`, source: 'V-World 연속지적도(LP_PA_CBND_BUBUN)' },
};

/* regions/ 번들에서 시군구 코드 → 번들 {slug, name, updatedAt, visibility}. 번들이 없으면 빈 표.
   production 이면 visibility 가 preview 인 지역은 뺀다(운영 빌드가 그 지역을 배포에서 빼므로, 해석 결과가 열 수 없는 지역을 가리키지 않게) */
function readCoverage(root = path.join(__dirname, '..', '..', 'regions'), production = false) {
  const map = {};
  try {
    const index = JSON.parse(fs.readFileSync(path.join(root, 'index.json'), 'utf8'));
    for (const r of index.regions || []) {
      if (production && r.visibility === 'preview') continue;
      try {
        const region = JSON.parse(fs.readFileSync(path.join(root, r.slug, 'region.json'), 'utf8'));
        for (const c of region.codes || []) if (c.type === 'sigungu') map[c.code] = { slug: r.slug, name: r.name, updatedAt: r.updatedAt, visibility: r.visibility || 'public' };
      } catch (e) { /* 이 지역은 건너뜀 */ }
    }
  } catch (e) { /* index 없음 */ }
  return map;
}

/* ---------- 지오메트리 ---------- */
const round5 = (n) => Math.round(n * 1e5) / 1e5;
function thinRing(ring, max = MAX_RING_POINTS) {
  const pts = [];
  for (const p of ring) { const q = [round5(p[0]), round5(p[1])]; const last = pts[pts.length - 1]; if (!last || last[0] !== q[0] || last[1] !== q[1]) pts.push(q); }
  const open = pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1] ? pts.slice(0, -1) : pts;
  const kept = open.length <= max ? open : Array.from({ length: max }, (_, i) => open[Math.floor(i * open.length / max)]);
  return kept.length >= 3 ? [...kept, kept[0]] : null;
}
function thinGeometry(g) {
  if (!g || !g.coordinates) return null;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  const out = polys.map((rings) => rings.map((r) => thinRing(r)).filter(Boolean)).filter((rings) => rings.length);
  if (!out.length) return null;
  return out.length === 1 ? { type: 'Polygon', coordinates: out[0] } : { type: 'MultiPolygon', coordinates: out };
}
function bboxOf(g) {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const rings of polys) for (const p of rings[0]) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  return [round5(x0), round5(y0), round5(x1), round5(y1)];
}

/* ---------- 응답 ---------- */
function createHandler(overrides = {}) {
  const env = overrides.env || process.env;
  const now = overrides.now || (() => Date.now());
  const doFetch = overrides.fetch || ((...a) => fetch(...a));
  const dir = overrides.cacheDir || defaultDir(env);
  const cache = overrides.cache || createCache({ dir, now });
  const pool = overrides.pool || createKeyPool({ env, now, store: env.VERCEL ? memoryStore() : fileStore(path.join(dir, 'key-usage.json')) });
  const coverageOf = overrides.readCoverage || (() => readCoverage(undefined, env.VERCEL_ENV === 'production'));

  const send = (res, status, body, cacheControl, type = 'application/json; charset=utf-8') => {
    res.statusCode = status;
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', cacheControl);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(JSON.stringify(body));
  };
  const problem = (res, status, code, title, detail, extra, cc) => send(res, status, Object.assign({ type: `/problems/${code}`, title, status, code, detail }, extra), cc || (status >= 500 || status === 429 ? 'no-store' : 'public, s-maxage=60'), 'application/problem+json; charset=utf-8');

  async function getJson(url) {
    const r = await doFetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { Accept: 'application/json' } });
    if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
    return r.json();
  }

  /* 시군구 안 표준코드 행 전부(24시간 캐시). 없으면 [] */
  function stanRows(sido, sgg) {
    return cache.wrap(`stan:${sido}${sgg}`, TTL_MS, () => pool.run('RESOLVE', 'stan', async (key) => {
      const out = [];
      for (let page = 1; page <= 10; page++) {
        const q = new URLSearchParams({ serviceKey: key, type: 'json', numOfRows: '1000', pageNo: String(page), sido_cd: sido, sgg_cd: sgg.slice(2) });
        const json = await getJson(`${STAN_URL}?${q}`);
        const block = json && json.StanReginCd;
        if (!Array.isArray(block)) { if (json && json.RESULT && json.RESULT.resultCode === 'INFO-3') return out; return json; }   // 이상한 모양은 pool 이 한도 오류인지 본다
        const head = block[0] && block[0].head, total = Number(head && head[0] && head[0].totalCount) || 0;
        const rows = (block.find((b) => b && b.row) || {}).row || [];
        out.push(...rows);
        if (out.length >= total || !rows.length) return out;
      }
      return out;
    }).then((r) => { if (!Array.isArray(r)) throw new Error('표준코드 응답 모양이 다름'); return r; }));
  }

  /* V-World 속성 조회 → { geometry, props } | null. 실패는 던진다 */
  async function vworld(kind, code) {
    const key = env.VWORLD_KEY, domain = env.VWORLD_DOMAIN || env.VERCEL_PROJECT_PRODUCTION_URL || 'localhost';
    if (!key) { const e = new Error('VWORLD_KEY 없음'); e.notConfigured = true; throw e; }
    const L = LAYERS[kind];
    return cache.wrap(`vw:${L.layer}:${code}`, TTL_MS, async () => {
      const q = new URLSearchParams({ service: 'data', request: 'GetFeature', data: L.layer, key, domain, format: 'json', size: '5', crs: 'EPSG:4326', attrFilter: L.filter(code) });
      const json = await getJson(`${VWORLD_URL}?${q}`);
      const st = json && json.response && json.response.status;
      if (st === 'NOT_FOUND') return { none: true };
      if (st !== 'OK') throw new Error(`V-World ${st || '응답 형식'}`);
      const f = ((json.response.result || {}).featureCollection || {}).features || [];
      if (!f.length) return { none: true };
      const geometry = thinGeometry(f[0].geometry);
      return geometry ? { geometry, props: { addr: f[0].properties && f[0].properties.addr, jibun: f[0].properties && f[0].properties.jibun } } : { none: true };
    });
  }

  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); return problem(res, 405, 'method', '허용하지 않는 방식', 'GET 만 지원합니다'); }
    const params = new URL(req.url || '/', 'http://local').searchParams;
    const names = [...new Set(params.keys())];
    if (names.some((n) => !ALLOWED.has(n))) return problem(res, 400, 'invalid-query', '알 수 없는 매개변수', `허용: ${[...ALLOWED].join(', ')}`);
    const given = ['code', 'sgg', 'bjd', 'pnu'].filter((n) => params.has(n));
    if (given.length !== 1 || params.getAll(given[0]).length !== 1) return problem(res, 400, 'invalid-query', '코드는 하나만 넘겨야 합니다', 'code, sgg, bjd, pnu 중 하나를 한 번만 쓰세요', undefined, 'public, s-maxage=3600');
    const input = params.get(given[0]);
    const c = codes.classify(input);
    if (!c.ok) return problem(res, 400, 'invalid-code', '코드 형식이 맞지 않습니다', c.detail, { reason: c.reason }, 'public, s-maxage=3600');
    if (given[0] !== 'code' && given[0] !== c.type) return problem(res, 400, 'invalid-code', '코드 종류가 다릅니다', `${given[0]}= 에 ${c.type} 코드가 왔습니다`, { reason: 'type-mismatch' }, 'public, s-maxage=3600');
    if (c.type === 'sido') return problem(res, 422, 'unsupported-level', '시도 단위는 지도 대상이 아닙니다', '시군구(5자리) 이하 코드를 쓰세요', undefined, 'public, s-maxage=3600');

    const wantGeometry = params.has('geometry') ? params.get('geometry') !== '0' : c.type !== 'sgg';
    try {
      const rows = await stanRows(c.sido, c.sgg);
      const sggRow = codes.findRow(rows, `${c.sgg}00000`);
      if (!sggRow) return problem(res, 404, 'unknown-code', '표준코드 표에 없는 시군구입니다', `${c.sgg}는 행정표준코드(2026-10-05 이후 기준)에 없습니다. 개편으로 바뀐 코드일 수 있습니다`, { sgg: c.sgg });
      let row = sggRow, level = 'sgg';
      if (c.type !== 'sgg') {
        row = codes.findRow(rows, c.bjd);
        if (!row) {
          const umd = rows.filter((r) => codes.levelOf(r) === 'umd').slice(0, 8).map((r) => ({ bjd: r.region_cd, name: r.locatadd_nm }));
          return problem(res, 404, 'unknown-code', '표준코드 표에 없는 법정동입니다', `${c.bjd}는 ${sggRow.locatadd_nm}에 없습니다`, { sgg: c.sgg, suggestions: umd });
        }
        level = codes.levelOf(row);
      }

      const warnings = [], out = { type: c.type, canonical: c.canonical, input: c.input, sgg: c.sgg };
      if (c.bjd) out.bjd = c.bjd;
      if (c.pnu) { out.pnu = c.pnu; const p = codes.parsePnu(c.pnu); out.parcel = { jibun: p.jibun, landType: p.landType === '1' ? '일반' : '산', hub: p.hub, geometry: null }; }
      out.name = row.locatadd_nm; out.level = level;
      if (c.padded) warnings.push('padded-8-digit');

      let frame = null;
      try {
        let hit = null;
        if (c.type === 'pnu') {
          hit = await vworld('pnu', c.pnu);
          if (hit.none) { warnings.push('parcel-not-found'); hit = null; } else { out.parcel.geometry = hit.geometry; if (hit.props && hit.props.addr) out.parcel.addr = hit.props.addr; frame = hit.geometry; }
        }
        if (!frame) {
          const kind = c.type === 'sgg' ? 'sgg' : 'umd';
          if (c.type !== 'sgg' && level === 'ri') warnings.push('ri-uses-umd-boundary');
          const b = await vworld(kind, c.type === 'sgg' ? c.sgg : c.bjd);
          if (b.none) warnings.push('boundary-not-found'); else frame = b.geometry;
          if (frame && wantGeometry && c.type !== 'pnu') out.geometry = frame;
          else if (frame && c.type === 'pnu' && wantGeometry) out.geometry = frame;     // 후퇴: 필지가 없으면 법정동 경계
        }
        if (frame) { out.bbox = bboxOf(frame); out.center = [round5((out.bbox[0] + out.bbox[2]) / 2), round5((out.bbox[1] + out.bbox[3]) / 2)]; }
        if (c.type === 'pnu' && out.parcel.geometry && !wantGeometry) out.parcel.geometry = null;
      } catch (e) {
        if (e instanceof KeyPoolError) throw e;
        warnings.push(e.notConfigured ? 'geometry-not-configured' : 'geometry-unavailable');
      }

      const cov = coverageOf()[c.sgg];
      out.coverage = cov ? { tier: 'A', slug: cov.slug, name: cov.name, updatedAt: cov.updatedAt, visibility: cov.visibility } : { tier: 'none' };
      if (warnings.length) out.warnings = warnings;
      out.source = { code: '행정안전부 행정표준코드(법정동코드)', geometry: c.type === 'pnu' ? LAYERS.pnu.source : LAYERS[c.type === 'sgg' ? 'sgg' : 'umd'].source };
      out.asOf = new Date(now()).toISOString().slice(0, 10);
      return send(res, 200, out, 'public, s-maxage=300, stale-while-revalidate=300');
    } catch (e) {
      if (e instanceof KeyPoolError) {
        if (e.code === 'EXHAUSTED') { res.setHeader('Retry-After', String(e.retryAfterSec || 3600)); return problem(res, 429, 'keys-exhausted', '오늘 인증키 한도에 닿았습니다', e.message, { retryAfterSec: e.retryAfterSec }); }
        return problem(res, 503, 'not-configured', '인증키가 설정되어 있지 않습니다', e.message);
      }
      return problem(res, 502, 'upstream', '표준코드 서비스를 부르지 못했습니다', '잠시 뒤 다시 시도하세요');   // 원인 문구는 밖으로 내보내지 않는다(키가 섞일 수 있음)
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.readCoverage = readCoverage;
module.exports.thinGeometry = thinGeometry;
module.exports.bboxOf = bboxOf;
