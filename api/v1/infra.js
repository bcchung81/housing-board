/* 입주 전 기반시설 요청 시 조회 API: 번들이 없는 법정동에서도 인허가 단지 위에 "입주 전 점검"(교육·교통)이 나오도록,
   그 법정동 인허가 단지 가까이의 신설예정 학교와 버스 정류장을 번들 infra.json 의 schools·stops 와 같은 모양으로 돌려준다.

   GET /api/v1/infra?bjd=<법정동 10자리>        (8자리는 00 을 붙여 받는다)
   → 200 { type:'Infra', bjd, asOf, sources:[…], schools:[…], stops:[…], meta:{ centers, schoolsNational, schools, stopCalls, stops, schoolsError?, stopsError?, noBus? } }
   → problem+json: invalid-query 400 · invalid-code 400 · method 405 · keys-exhausted 429 · budget-exhausted 429 · not-configured 503 · upstream 502 (인허가를 못 받았을 때)

   - 서버는 임의 좌표를 받지 않는다. 그 법정동의 인허가 결과(/api/v1/permits 와 같은 캐시·키 풀)에서 필지 중심을 꺼내 쓴다 → 열린 중계가 되지 않는다. 사업이 없으면 학교·정류장도 없다.
   - 신설예정 학교: 교육재정알리미 전국 목록(키 없음, 24시간 캐시)에서 단지 중심 2 km 안만. 정류장: TAGO 근접정류소(키 풀 BUS·서비스 tago)를 단지 중심마다 한 번(150 m 안은 건너뜀, 동시 10개), 400 m 안만. 서울(시도 11)은 TAGO 도시 목록에 없어 부르지 않고 meta.noBus 로 알린다.
   - 학교·정류장 한쪽이 실패해도 나머지는 준다(meta.schoolsError·stopsError). 응답은 로컬 캐시 24시간 + CDN 24시간, 한쪽이라도 실패했으면 캐시하지 않는다.
   - 인스턴스별 시간당 TAGO 호출 상한(INFRA_UPSTREAM_PER_HOUR, 기본 300)을 넘으면 정류장만 비운다(meta.stopsError). 키·원천 URL·원인 문구는 응답에 싣지 않는다.
   시험: tests/js/infra.api.test.cjs */
'use strict';
const permits = require('./permits.js');
const { KeyPoolError } = require('../../lib/keys.js');
const { fetchPage } = require('../../lib/datagokr.js');
const codes = require('../../lib/codes.js');
const I = require('../../lib/infra.js');
const { vworldCreds } = require('../../lib/vworld.js');

const TAGO_NEAR_URL = 'https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getCrdntPrxmtSttnList';
const EDU_URL = 'https://eduinfo.go.kr/portal/theme/newSchInfoDetail.do';
const EDU_REFERER = 'https://eduinfo.go.kr/portal/theme/newSchMapPage.do';
const TTL_MS = 24 * 3600 * 1000;
const DEFAULT_BUDGET_PER_HOUR = 300;
const STOP_CONCURRENCY = 10;
const MAX_STOP_PAGES = 3;
const ALLOWED = new Set(['bjd']);
const NO_TAGO_SIDO = new Set(['11']);   // 서울은 국토교통부 TAGO 도시 목록에 없다(실측: 근접정류소 0곳, cityCode=11 노선 0건). 호출 낭비를 줄이려고 건너뛴다

function createHandler(overrides = {}) {
  const svc = permits.createService(overrides);
  const { cache, pool, now, sleep, doFetch } = svc;
  const env = overrides.env || process.env;
  const budgetMax = Number(env.INFRA_UPSTREAM_PER_HOUR) > 0 ? Math.floor(Number(env.INFRA_UPSTREAM_PER_HOUR)) : DEFAULT_BUDGET_PER_HOUR;
  const budget = { hour: -1, used: 0 };
  const spend = (n) => {
    const hour = Math.floor(now() / 3600000);
    if (budget.hour !== hour) { budget.hour = hour; budget.used = 0; }
    if (budget.used + n > budgetMax) return false;
    budget.used += n;
    return true;
  };
  const send = (res, status, body, cacheControl, type = 'application/json; charset=utf-8') => {
    res.statusCode = status;
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', cacheControl);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(JSON.stringify(body));
  };
  const problem = (res, status, code, title, detail, extra, cc) => send(res, status, Object.assign({ type: `/problems/${code}`, title, status, code, detail }, extra),
    cc || (status >= 500 || status === 429 ? 'no-store' : 'public, s-maxage=60'), 'application/problem+json; charset=utf-8');

  /* 교육재정알리미 전국 신설예정학교(24시간 캐시). 일시 오류는 3번까지 다시 */
  function nationalSchools() {
    return cache.wrap('eduinfo:newschools', TTL_MS, async () => {
      const form = new URLSearchParams({ schlSeq: '', yymmdd: '', searchRg: '', searchOffc: '', searchWd: '' });
      let last = '응답 없음';
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt) await sleep(400 * attempt);
        let r;
        try { r = await doFetch(EDU_URL, { method: 'POST', body: form.toString(), signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest', Referer: EDU_REFERER } }); } catch (e) { last = 'network'; continue; }
        if (!r.ok) { last = `HTTP ${r.status}`; continue; }
        let json; try { json = await r.json(); } catch (e) { last = 'JSON 아님'; continue; }
        if (json && Array.isArray(json.result)) return json.result;
        last = 'result 목록이 없음';
      }
      throw new Error(last);
    });
  }
  /* TAGO 근접정류소 한 중심(반경 약 500 m). 서울처럼 도시 목록에 없으면 빈 목록 */
  async function stopsNear(center) {
    const all = [];
    for (let page = 1; page <= MAX_STOP_PAGES; page++) {
      if (!spend(1)) { const e = new Error('budget'); e.budget = true; throw e; }
      const got = await pool.run('BUS', 'tago', (key) => fetchPage({ doFetch, sleep, url: TAGO_NEAR_URL,
        params: { serviceKey: key, gpsLati: center[1].toFixed(6), gpsLong: center[0].toFixed(6), numOfRows: '100', pageNo: String(page), _type: 'json' } }));
      all.push(...got.items);
      if (!got.items.length || page * 100 >= got.total) break;
    }
    return all;
  }
  async function mapLimit(items, limit, fn) {
    const out = new Array(items.length); let next = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) { const i = next++; try { out[i] = { ok: await fn(items[i]) }; } catch (e) { out[i] = { err: e }; } }
    }));
    return out;
  }

  async function build(bjd, perm) {
    const centers = perm.features.map((f) => I.centerOf(f.geometry)).filter(Boolean);
    const meta = { centers: centers.length, schoolsNational: 0, schools: 0, stopCalls: 0, stops: 0 };
    let schools = [], stops = [], failed = false;
    if (centers.length) {
      try {
        const rows = await nationalSchools();
        meta.schoolsNational = rows.length;
        schools = I.scheduledSchools(rows, centers).schools;
      } catch (e) { failed = true; meta.schoolsError = '신설예정 학교를 불러오지 못함'; console.error(`infra ${bjd} schools: ${(e && e.message) || e}`); }
      const noTago = NO_TAGO_SIDO.has(bjd.slice(0, 2));
      const picked = noTago ? [] : I.queryCenters(centers);
      meta.stopCalls = picked.length;
      if (noTago) meta.noBus = true;
      const got = await mapLimit(picked, STOP_CONCURRENCY, stopsNear);
      const byId = new Map(); let ok = 0, budgetHit = false, errs = 0;
      for (const g of got) {
        if (g.err) { if (g.err.budget) budgetHit = true; else if (g.err instanceof KeyPoolError) throw g.err; else errs++; continue; }
        ok++;
        for (const it of g.ok) { const s = I.tagoStop(it); if (s && !byId.has(s.id) && I.nearAny([s.lon, s.lat], centers, I.STOP_SHOW_M)) byId.set(s.id, s); }
      }
      stops = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      if (budgetHit) { failed = true; meta.stopsError = '이 서버의 시간당 정류소 조회 한도에 닿아 일부만 불러옴'; }
      else if (picked.length && !ok) { failed = true; meta.stopsError = '버스 정류소를 불러오지 못함'; }
      else if (errs) { failed = true; meta.stopsError = `정류소 조회 ${errs}곳을 불러오지 못해 일부만 보임`; }   // 일부만 실패해도 조용히 넘기지 않고 캐시하지 않는다
      else if (picked.length && !stops.length) meta.noBus = true;   // 호출은 됐는데 반경 안에 정류소가 0곳: 서울처럼 TAGO 도시 목록에 없는 지역
    }
    meta.schools = schools.length; meta.stops = stops.length;
    const used = new Set();
    if (schools.length) used.add('edu-newschool');
    if (stops.length) used.add('tago-bus');
    const asOf = new Date(now()).toISOString().slice(0, 10);
    return {
      body: { type: 'Infra', bjd, asOf, sources: [...used].map((id) => ({ ...I.SOURCE_DEFS[id], asOf })), schools, stops, meta },
      cacheable: !failed,
    };
  }

  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); return problem(res, 405, 'method', '허용하지 않는 방식', 'GET 만 지원합니다'); }
    const params = new URL(req.url || '/', 'http://local').searchParams;
    const names = [...new Set(params.keys())];
    if (names.some((n) => !ALLOWED.has(n)) || !params.has('bjd') || params.getAll('bjd').length !== 1) return problem(res, 400, 'invalid-query', '쿼리가 맞지 않습니다', 'bjd=<법정동 10자리> 하나만 받습니다', undefined, 'public, s-maxage=3600');
    const c = codes.classify(params.get('bjd'));
    if (!c.ok || c.type !== 'bjd') return problem(res, 400, 'invalid-code', '법정동 코드가 맞지 않습니다', c.ok ? `${c.type} 코드가 왔습니다. 법정동(8 또는 10자리)만 받습니다` : c.detail, c.ok ? { reason: 'type-mismatch' } : { reason: c.reason }, 'public, s-maxage=3600');
    const bjd = c.bjd;
    if (!vworldCreds(env).key || !pool.hasKeys('RESOLVE')) return problem(res, 503, 'not-configured', '인증키가 설정되어 있지 않습니다', 'RESOLVE 용도 공공데이터포털 키와 V-World 키가 필요합니다');
    try {
      const hit = cache.get(`infra:${bjd}`);
      if (hit) return send(res, 200, hit, 'public, s-maxage=86400, stale-while-revalidate=86400');
      const perm = (await svc.getPermits(bjd)).body;
      const out = await build(bjd, perm);
      if (out.cacheable) cache.set(`infra:${bjd}`, out.body, TTL_MS);
      return send(res, 200, out.body, out.cacheable ? 'public, s-maxage=86400, stale-while-revalidate=86400' : 'public, s-maxage=60');
    } catch (e) {
      if (e instanceof KeyPoolError) {
        if (e.code === 'EXHAUSTED') { res.setHeader('Retry-After', String(e.retryAfterSec || 3600)); return problem(res, 429, 'keys-exhausted', '오늘 인증키 한도에 닿았습니다', e.message, { retryAfterSec: e.retryAfterSec }); }
        return problem(res, 503, 'not-configured', '인증키가 설정되어 있지 않습니다', e.message);
      }
      if (e && e.budget) {
        const wait = 3600 - (Math.floor(now() / 1000) % 3600);
        res.setHeader('Retry-After', String(wait));
        return problem(res, 429, 'budget-exhausted', '이 서버의 시간당 조회 한도에 닿았습니다', '잠시 뒤 다시 시도하세요', { retryAfterSec: wait });
      }
      console.error(`infra ${bjd}: ${(e && e.name) || 'Error'}: ${String((e && e.message) || e).slice(0, 200)}`);
      return problem(res, 502, 'upstream', '기반시설 서비스를 부르지 못했습니다', '잠시 뒤 다시 시도하세요');
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
