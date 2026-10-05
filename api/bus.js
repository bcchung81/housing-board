/* 버스 실시간 위치 중계(Vercel 함수). 브라우저가 data.go.kr 을 직접 부르지 않게 해 인증키를 숨기고, 호출 횟수를 서버에서 묶는다.

   GET /api/bus?region=<slug>
   → 200 { at: 'ISO 시각', ttl: 초, buses: [{ r: 노선id, v: 차량번호, lon, lat, ord: 정류소순서, stop: 정류소 이름 }], failed?: [노선id] }

   어느 노선을 부르는지는 요청이 정하지 못한다. 배포된 regions/<slug>/infra.json 의 busRoutes 중 live 노선만 부른다(키를 쓰는 열린 중계가 되지 않게).
   호출 수: 응답을 CDN 이 ttl 초 동안 나눠 쓰므로 하루 호출은 (live 노선 수) × 86400 / ttl 회로 묶인다.
   ttl = max(60, ceil(노선 수 × 86400 / DAILY_BUDGET)) — 개발계정 한도(하루 10,000건)에서 DAILY_BUDGET 만 쓴다. 인스턴스 메모리에도 30초 보조 캐시를 둔다.
   쿼리에 region 말고 다른 값이 있으면 거절한다(값을 바꿔 가며 CDN 캐시를 비켜 가는 호출을 막는다).
   환경변수 DATA_GO_KR_KEY(디코딩된 키 그대로). 비밀은 응답·로그에 남기지 않는다. 시험: tests/js/busapi.test.cjs */
'use strict';
const fs = require('fs');
const path = require('path');

const ENDPOINT = 'https://apis.data.go.kr/1613000/BusLcInfoInqireService/getRouteAcctoBusLcList';
const DAILY_BUDGET = 8000;
const MIN_TTL_S = 60;
const MEMO_MS = 30000;
const FETCH_TIMEOUT_MS = 8000;
const REGION = /^[a-z0-9-]{1,40}$/;

const ttlFor = (routeCount) => Math.max(MIN_TTL_S, Math.ceil(routeCount * 86400 / DAILY_BUDGET));

/* 지역 번들에서 실시간으로 부를 노선 {city, routes:[id]} — 없으면 null */
function readLiveRoutes(slug) {
  try {
    const infra = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'regions', slug, 'infra.json'), 'utf8'));
    const routes = (infra.busRoutes || []).filter((r) => r && r.live && typeof r.id === 'string').map((r) => r.id);
    return infra.busCityCode && routes.length ? { city: Number(infra.busCityCode), routes } : null;
  } catch (e) {
    return null;
  }
}

const num = (v) => { const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v); return Number.isFinite(n) ? n : null; };
function itemsOf(json) {
  const items = json && json.response && json.response.body && json.response.body.items;
  const it = items && items.item !== undefined ? items.item : items;
  return Array.isArray(it) ? it : it && typeof it === 'object' ? [it] : [];
}
/* TAGO 한 노선 응답 → 버스 목록. 좌표가 없거나 이상한 차량은 뺀다(좌표는 문자열로 오는 행도 있다) */
function normalize(routeId, json) {
  const out = [];
  for (const b of itemsOf(json)) {
    const lon = num(b.gpslong), lat = num(b.gpslati);
    if (lon === null || lat === null || lon < 120 || lon > 135 || lat < 30 || lat > 45 || !b.vehicleno) continue;
    out.push({ r: routeId, v: String(b.vehicleno), lon: Math.round(lon * 1e6) / 1e6, lat: Math.round(lat * 1e6) / 1e6, ord: num(b.nodeord), stop: b.nodenm ? String(b.nodenm) : '' });
  }
  return out;
}

async function fetchRoute(deps, key, city, routeId) {
  const q = new URLSearchParams({ serviceKey: key, cityCode: String(city), routeId, numOfRows: '200', pageNo: '1', _type: 'json' });
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await deps.fetch(`${ENDPOINT}?${q}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const code = String(json && json.response && json.response.header && json.response.header.resultCode);
    if (code === '00') return normalize(routeId, json);
    if (code === '99' && attempt === 0) { await deps.sleep(400); continue; }   // TAGO 동시 접속이 가득 찬 일시 오류
    throw new Error(`result ${code}`);
  }
  throw new Error('retry exhausted');
}

function createHandler(overrides) {
  const deps = Object.assign({
    fetch: (...a) => fetch(...a), env: process.env, now: () => Date.now(), readLiveRoutes, sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  }, overrides);
  const memo = new Map();   // slug → { at, status, headers, body }

  const send = (res, status, body, cache) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', cache);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(JSON.stringify(body));
  };

  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); return send(res, 405, { error: 'method' }, 'no-store'); }
    const params = new URL(req.url || '/', 'http://local').searchParams;
    const keys = [...new Set(params.keys())];
    const slug = params.get('region') || '';
    if (keys.length !== 1 || keys[0] !== 'region' || params.getAll('region').length !== 1 || !REGION.test(slug)) return send(res, 400, { error: 'query' }, 'public, s-maxage=3600');
    const live = deps.readLiveRoutes(slug);
    if (!live) return send(res, 404, { error: 'no-live-routes' }, 'public, s-maxage=3600');
    const raw = String(deps.env.DATA_GO_KR_KEY || '');
    if (!raw) return send(res, 503, { error: 'not-configured' }, 'no-store');
    const key = raw.includes('%') ? decodeURIComponent(raw) : raw;
    const ttl = ttlFor(live.routes.length);

    const hit = memo.get(slug);
    if (hit && deps.now() - hit.at < MEMO_MS) return send(res, hit.status, hit.body, hit.cache);

    const results = await Promise.allSettled(live.routes.map((id) => fetchRoute(deps, key, live.city, id)));
    const buses = [], failed = [];
    results.forEach((r, i) => { if (r.status === 'fulfilled') buses.push(...r.value); else failed.push(live.routes[i]); });
    const all = failed.length === live.routes.length;
    const body = all ? { error: 'upstream' } : Object.assign({ at: new Date(deps.now()).toISOString(), ttl, buses }, failed.length ? { failed } : {});
    const status = all ? 502 : 200;
    const cache = all ? 'public, s-maxage=15' : `public, s-maxage=${ttl}, stale-while-revalidate=${ttl}`;
    memo.set(slug, { at: deps.now(), status, body, cache });
    return send(res, status, body, cache);
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.ttlFor = ttlFor;
module.exports.normalize = normalize;
module.exports.DAILY_BUDGET = DAILY_BUDGET;
