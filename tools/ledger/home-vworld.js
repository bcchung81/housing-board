'use strict';
/* 수도권 지도 보강 도구(home-geocode.js · home-lite.js)가 같이 쓰는 V-World 호출과 수집 캐시.
   - 키·domain: lib/vworld.js 규칙(로컬은 VWORLD_DEV_KEY, 없으면 VWORLD_KEY). 환경변수 또는 .env.local 에서 읽고 어디에도 쓰지 않는다(오류 문구도 가린다).
   - 한도: 호출 시작 간격 SPACING_MS 이상, 동시 CONCURRENCY 건, 실패는 쉬었다(2·4·8초) 최대 RETRIES 번 다시, 실행당 상한(maxCalls)을 넘으면 멈춘다.
   - 캐시: .cache/home-map/<종류>/<이름>.json.gz (gitignore). 캐시에 있으면 부르지 않는다 → 같은 캐시로 다시 돌리면 V-World 없이 같은 결과.
   순수 함수(pointInGeometry · bboxOf)는 시험한다(tests/js/home-lite.test.cjs). */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { VWORLD_URL, VWORLD_SEARCH_URL, vworldCreds, redactVworld } = require('../../lib/vworld');

const ROOT = path.join(__dirname, '..', '..');
const CACHE = path.join(ROOT, '.cache', 'home-map');
const SPACING_MS = 200;
const CONCURRENCY = 2;
const RETRIES = 3;
const TIMEOUT_MS = 20000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadEnv() {
  const file = path.join(ROOT, '.env.local');
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const env = { ...process.env };
  for (const k of ['VWORLD_KEY', 'VWORLD_DEV_KEY', 'VWORLD_DOMAIN']) {
    if (env[k]) continue;
    const m = text.match(new RegExp('^' + k + '=(.*)$', 'm'));
    if (m) env[k] = m[1].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

/* ---------- 캐시 ---------- */
const hashName = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 20);
const cacheFile = (kind, name) => path.join(CACHE, kind, `${name}.json.gz`);
function cacheGet(kind, name) {
  const f = cacheFile(kind, name);
  return fs.existsSync(f) ? JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8')) : null;
}
function cachePut(kind, name, value) {
  const f = cacheFile(kind, name);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(value)));
}

/* ---------- 호출(간격·동시·재시도·상한) ---------- */
function createClient({ env = loadEnv(), maxCalls = 3000, log = () => {} } = {}) {
  const creds = vworldCreds(env);
  const st = { calls: 0, retries: 0, errors: 0 };
  let nextStart = 0, active = 0;
  const waiters = [];
  const acquire = async () => { while (active >= CONCURRENCY) await new Promise((r) => waiters.push(r)); active++; };
  const release = () => { active--; const w = waiters.shift(); if (w) w(); };
  /* params(키 제외) → 응답 response 객체. NOT_FOUND 는 그대로 돌려준다. 끝내 실패하면 던진다(문구에서 키를 가림) */
  async function call(url, params) {
    if (!creds.key) throw new Error('V-World 키가 없다(.env.local 의 VWORLD_DEV_KEY 또는 VWORLD_KEY)');
    const q = new URLSearchParams({ ...params, key: creds.key, domain: creds.domain });
    let last;
    await acquire();
    try {
      for (let t = 0; t <= RETRIES; t++) {
        if (st.calls >= maxCalls) throw new Error(`실행당 호출 상한 ${maxCalls} 에 닿았다(--max-calls 로 늘리거나 다시 실행 — 캐시는 남는다)`);
        const wait = Math.max(0, nextStart - Date.now());
        nextStart = Math.max(nextStart, Date.now()) + SPACING_MS;
        await sleep(wait);
        if (t > 0) { st.retries++; await sleep(1000 * 2 ** t); }
        try {
          st.calls++;
          const r = await fetch(`${url}?${q}`, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'application/json' } });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const res = (await r.json()).response;
          if (res && (res.status === 'OK' || res.status === 'NOT_FOUND')) return res;
          throw new Error(`V-World ${(res && res.error && res.error.code) || (res && res.status) || '응답 형식'}`);
        } catch (e) { last = redactVworld(e.message, env); log(`  다시 시도(${t + 1}/${RETRIES}): ${last}`); }
      }
    } finally { release(); }
    st.errors++;
    throw new Error(last || 'V-World 호출 실패');
  }
  const data = (params) => call(VWORLD_URL, { service: 'data', request: 'GetFeature', format: 'json', crs: 'EPSG:4326', ...params });
  const search = (params) => call(VWORLD_SEARCH_URL, { service: 'search', request: 'search', version: '2.0', crs: 'EPSG:4326', format: 'json', errorformat: 'json', ...params });
  return { data, search, stats: st, hasKey: !!creds.key };
}

/* ---------- 시군구 경계(V-World LT_C_ADSIGG_INFO) ----------
   시 단위 코드(41110 수원시 등 구가 있는 시)는 V-World 에 없어 앞 4자리로 구 경계를 모은다. 캐시: sgg/<코드> */
async function sggBoundary(client, sgg) {
  const hit = cacheGet('sgg', sgg);
  if (hit) return hit;
  let res = await client.data({ data: 'LT_C_ADSIGG_INFO', size: '20', attrFilter: `sig_cd:=:${sgg}` });
  if (res.status === 'NOT_FOUND') res = await client.data({ data: 'LT_C_ADSIGG_INFO', size: '20', attrFilter: `sig_cd:like:${sgg.slice(0, 4)}` });
  const feats = res.status === 'OK' ? ((res.result || {}).featureCollection || {}).features || [] : [];
  const polys = feats.flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : []));
  const out = { sgg, codes: feats.map((f) => f.properties.sig_cd).sort(), name: feats.length === 1 ? feats[0].properties.full_nm : null, geometry: polys.length ? { type: 'MultiPolygon', coordinates: polys } : null };
  cachePut('sgg', sgg, out);
  return out;
}

/* ---------- 순수 함수 ---------- */
function ringContains(ring, [x, y]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/* 점이 (Multi)Polygon 안인가(구멍 제외) */
function pointInGeometry(g, pt) {
  if (!g) return false;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return polys.some((p) => p.length && ringContains(p[0], pt) && !p.slice(1).some((h) => ringContains(h, pt)));
}
function bboxOf(g) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const p of polys) for (const [x, y] of p[0]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}
/* 두 점 사이 거리(m, 짧은 거리용 등장방형) */
const distM = (a, b) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180), (a[1] - b[1]) * 110540);

module.exports = { ROOT, CACHE, loadEnv, createClient, cacheGet, cachePut, hashName, sggBoundary, pointInGeometry, bboxOf, distM };
