/* 모집 공고 요청 시 조회 API: 시군구 하나(또는 시도 전체)의 마이홈포털 공공주택 모집공고(임대·분양), 한국토지주택공사(LH) 분양임대공고문, 청약홈 민영 분양 공고를 돌려준다.
   일반사용자 화면(/citizen)의 '지금 신청' 블록이 쓴다. 민영 분양은 기존 '공공만' 원칙의 예외로 사용자가 허용했다(2026-10-17).

   GET /api/v1/notices?sgg=<시군구 5자리>   또는   GET /api/v1/notices?sido=<시도 2자리>   (둘 중 하나만, 함께 주면 400)
   → 200 { type:'Notices', sgg|sido, name, asOf, items:[{ id, kind:'rental'|'sale', title, agency, status, housingType, supplyType, complex, units, address, pnu, announcedAt, applyFrom, applyTo, url,
            deposit, monthlyRent, targets, sgg, sggName, source:'myhome'|'lh'|'applyhome' }], meta:{ source, rental, sale, lh, applyhome, matched, lhMatched, applyhomeMatched, partial? } }
     - deposit·monthlyRent: 임대 보증금·월 임대료(원, 정수) — 마이홈 임대 행의 rentGtn·mtRntchrg 만. 임대가 아니거나 값이 없으면(0 포함) null. 분양가는 싣지 않는다.
     - targets: 제목에 적힌 대상 '신혼부부'(신혼·신혼희망타운)·'신생아'·'청년'·'다자녀'·'고령자'(고령·어르신) 중에서 이 순서로, 없으면 []. 자격 판정이 아니다.
     - sgg·sggName: 공고가 속한 시군구 5자리·표준코드 이름('경기도 김포시'). ?sgg= 응답은 요청한 시군구, ?sido= 응답은 마이홈 주소(fullAdres)·시도+시군구 필드, 청약홈 공급 위치 주소 앞부분,
       LH 제목(시군구 하나로 정해질 때만)으로 정한다(구가 있으면 구). 정할 수 없으면 null.
   → problem+json: invalid-query 400 · invalid-code 400 · unknown-code 404 · method 405 · keys-exhausted 429 · not-configured 503 · upstream 502

   - 마이홈포털 HWSPR02(임대 rsdtRcritNtcList · 분양 ltRsdtRcritNtcList)의 전국 현재 공고(2026-10-05: 324건)는 시군구 필터가 없어 전체를 받아(100건씩) 1시간 캐시하고,
     행정표준코드 이름('경기도 하남시', 시도 질의는 '경기도')으로 거른다(lib/myhome.js). 구가 있는 시는 시 전체가 구 공고를 모두 포함한다. 링크는 마이홈·LH 주소만 싣는다.
   - 시도 질의의 시군구 목록은 행정표준코드(sido_cd + umd_cd=000)로 받아 24시간 캐시한다.
   - 공고는 대부분 매입임대·일반매각(개별 주택)이라 건설 중인 단지(/api/v1/permits)와 합치지 않는 별도 목록이다. PNU 가 있는 공고는 화면이 그 필지로 이동할 수 있다.
   - 인증키: lib/keys.js 의 RESOLVE 용도 풀(서비스 myhome·lh·applyhome·stan, 하루 10,000건씩). 한 원천만 실패하면 나머지를 주고 meta.partial 에 적는다(이때는 짧게만 캐시).
   - LH 공고문(15058530)은 진행 중(공고중·접수중·정정공고중) 주택 공고 전국 약 150건을 받아 1시간 캐시한다(lib/lhnotice.js). 지역은 시도뿐이라 제목에 시군구·법정동 이름이 있을 때만 이 시군구의 공고로 보고(제목 기준 추정, 구가 있는 시의 구는 구 이름만),
     시도 질의는 시도가 같은 공고 전부. 마이홈과 제목이 같은 공고는 마이홈 쪽만 둔다. 고른 공고는 공급정보(15056765)로 단지명·금회공급 세대수를 채운다(24시간 캐시, 실패해도 공고는 나가고 meta.partial 에 'lh-supply').
   - 청약홈 분양정보(15098547 getAPTLttotPblancDetail, odcloud)는 접수 마감이 오늘(KST) 이후인 공고를 cond 로 받아 1시간 캐시하고 민영만 넣는다(lib/applyhome.js, 국민 = 공공분양은 마이홈·LH 와 중복).
     건설사·분양가는 싣지 않는다. 실패하면(한도·연결) 나머지는 나가고 meta.partial 에 'applyhome'.
   - LH 가 실패하면 meta.partial 에 'lh', 마이홈 한쪽은 'rental'·'sale'. 네 원천이 모두 실패할 때만 오류.
   시험: tests/js/noticesapi.test.cjs · tests/js/myhome.test.cjs · tests/js/lhnotice.test.cjs · tests/js/applyhome.test.cjs */
'use strict';
const path = require('path');
const { createKeyPool, fileStore, memoryStore, KeyPoolError, kstDate } = require('../../lib/keys.js');
const { fetchPage } = require('../../lib/datagokr.js');
const { createCache, defaultDir } = require('../../lib/cache.js');
const { createStan, STAN_URL } = require('../../lib/stan.js');
const codes = require('../../lib/codes.js');
const scope = require('../../lib/scope.js');
const M = require('../../lib/myhome.js');
const L = require('../../lib/lhnotice.js');
const A = require('../../lib/applyhome.js');

const BASE = 'https://apis.data.go.kr/1613000/HWSPR02/';
const ENDPOINTS = { rental: 'rsdtRcritNtcList', sale: 'ltRsdtRcritNtcList' };
const PAGE_ROWS = 100;
const MAX_PAGES = 6;
const LIST_TTL_MS = 3600 * 1000;
const SUPPLY_TTL_MS = 24 * 3600 * 1000;
const LH_MAX_PAGES = 5;
const LH_WINDOW_DAYS = 365;                   // 진행 중인 공고 가운데 가장 오래된 것도 1년 안(2025-01 이후 공고중 142건, 2026-04 이후 134건)
const LH_SUPPLY_MAX = 20;                     // 한 응답에서 공급정보를 부르는 공고 수 상한
const LH_SUPPLY_CONCURRENCY = 4;
const APPLYHOME_PAGE_ROWS = 500;
const APPLYHOME_MAX_PAGES = 3;                 // 접수 마감이 오늘 이후인 공고는 전국 16건(2026-10-17 실측)
const STAN_TTL_MS = 24 * 3600 * 1000;
const FETCH_TIMEOUT_MS = 10000;
const ALLOWED = new Set(['sgg', 'sido']);
const SOURCE_TEXT = '마이홈포털 공공주택 모집공고(HWSPR02) + 한국토지주택공사 분양임대공고문(15058530)·공급정보(15056765) + 한국부동산원 청약홈 분양정보(15098547, 민영)';

function createHandler(overrides = {}) {
  const env = overrides.env || process.env;
  const now = overrides.now || (() => Date.now());
  const doFetch = overrides.fetch || ((...a) => fetch(...a));
  const sleep = overrides.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const dir = overrides.cacheDir || defaultDir(env);
  const cache = overrides.cache || createCache({ dir, now });
  const pool = overrides.pool || createKeyPool({ env, now, store: env.VERCEL ? memoryStore() : fileStore(path.join(dir, 'key-usage.json')) });
  const stan = createStan({ doFetch, pool, cache, sleep });

  const send = (res, status, body, cacheControl, type = 'application/json; charset=utf-8') => {
    res.statusCode = status;
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', cacheControl);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(JSON.stringify(body));
  };
  const problem = (res, status, code, title, detail, extra, cc) => send(res, status, Object.assign({ type: `/problems/${code}`, title, status, code, detail }, extra),
    cc || (status >= 500 || status === 429 ? 'no-store' : 'public, s-maxage=60'), 'application/problem+json; charset=utf-8');

  /* 전국 공고 한 종류(임대 또는 분양): 100건씩 총건수만큼, 1시간 캐시. 실패는 던진다(캐시 안 함) */
  function nationalList(kind) {
    return cache.wrap(`myhome:${kind}`, LIST_TTL_MS, async () => {
      const all = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const got = await pool.run('RESOLVE', 'myhome', (key) => fetchPage({ doFetch, sleep, url: BASE + ENDPOINTS[kind], timeoutMs: FETCH_TIMEOUT_MS,
          params: { serviceKey: key, numOfRows: String(PAGE_ROWS), pageNo: String(page), _type: 'json' } }));
        all.push(...got.items);
        if (!got.items.length || page * PAGE_ROWS >= got.total) break;
      }
      return all;
    });
  }

  /* LH 진행 중 공고(전국, 상태별로 받아 합침): 1시간 캐시. 실패는 던진다(캐시 안 함) */
  const ymd = (t) => new Date(t).toISOString().slice(0, 10).replace(/-/g, '');
  function lhNationalList() {
    return cache.wrap('lh:notices', LIST_TTL_MS, async () => {
      const all = [], from = ymd(now() - LH_WINDOW_DAYS * 86400000), to = ymd(now());
      for (const status of L.STATUSES) {
        for (let page = 1; page <= LH_MAX_PAGES; page++) {
          const json = await pool.run('RESOLVE', 'lh', (key) => L.fetchLh({ doFetch, sleep, url: L.LIST_URL, params: { serviceKey: key, PG_SZ: String(PAGE_ROWS), PAGE: String(page), PAN_SS: status, PAN_ST_DT: from, PAN_ED_DT: to } }));
          const got = L.listOf(json);
          all.push(...got.rows);
          if (!got.rows.length || page * PAGE_ROWS >= got.total) break;
        }
      }
      return all;
    });
  }
  /* 청약홈 접수 마감이 오늘(KST) 이후인 분양 공고(전국, 민영·국민 모두): 1시간 캐시(날짜가 바뀌면 새로). 실패는 던진다 */
  function applyhomeList(today) {
    return cache.wrap(`applyhome:${today}`, LIST_TTL_MS, async () => {
      const all = [];
      for (let page = 1; page <= APPLYHOME_MAX_PAGES; page++) {
        const json = await pool.run('RESOLVE', 'applyhome', (key) => A.fetchApplyhome({ doFetch, sleep, url: A.LIST_URL,
          params: { serviceKey: key, page: String(page), perPage: String(APPLYHOME_PAGE_ROWS), returnType: 'JSON', 'cond[RCEPT_ENDDE::GTE]': today } }));
        const got = A.listOf(json);
        all.push(...got.rows);
        if (!got.rows.length || page * APPLYHOME_PAGE_ROWS >= got.total) break;
      }
      return all;
    });
  }
  /* 시도 안 시도·시군구 표준코드 행(sido_cd + umd_cd=000, 경기 56행): 24시간 캐시. 없으면 [] */
  function sidoRows(sido) {
    return cache.wrap(`stan:sido:${sido}`, STAN_TTL_MS, () => pool.run('RESOLVE', 'stan', async (key) => {
      const q = new URLSearchParams({ serviceKey: key, type: 'json', numOfRows: '1000', pageNo: '1', sido_cd: sido, umd_cd: '000' });
      const r = await doFetch(`${STAN_URL}?${q}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { Accept: 'application/json' } });
      if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
      const json = await r.json(), block = json && json.StanReginCd;
      if (!Array.isArray(block)) { if (json && json.RESULT && json.RESULT.resultCode === 'INFO-3') return []; return json; }   // 이상한 모양은 pool 이 한도 오류인지 본다
      return (block.find((b) => b && b.row) || {}).row || [];
    }).then((r) => { if (!Array.isArray(r)) throw new Error('표준코드 응답 모양이 다름'); return r; }));
  }
  /* 공고 하나의 공급정보 → { complex, units } | null(공급정보가 없거나 모양이 다름). 24시간 캐시, 실패는 던진다 */
  function lhSupply(ref) {
    return cache.wrap(`lh:supply:${ref.PAN_ID}`, SUPPLY_TTL_MS, async () => {
      const json = await pool.run('RESOLVE', 'lh', (key) => L.fetchLh({ doFetch, sleep, url: L.SUPPLY_URL, params: { serviceKey: key, PAN_ID: ref.PAN_ID, SPL_INF_TP_CD: ref.SPL_INF_TP_CD, CCR_CNNT_SYS_DS_CD: ref.CCR_CNNT_SYS_DS_CD, UPP_AIS_TP_CD: ref.UPP_AIS_TP_CD } }));
      return L.supplyOf(json) || { complex: null, units: null };
    });
  }
  async function mapLimit(items, limit, fn) {
    const out = new Array(items.length); let next = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) { const i = next++; try { out[i] = { ok: await fn(items[i]) }; } catch (e) { out[i] = { err: e }; } }
    }));
    return out;
  }

  const handler = async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); return problem(res, 405, 'method', '허용하지 않는 방식', 'GET 만 지원합니다'); }
    const params = new URL(req.url || '/', 'http://local').searchParams;
    const names = [...new Set(params.keys())];
    const one = (n) => params.getAll(n).length === 1;
    if (names.some((n) => !ALLOWED.has(n)) || names.length !== 1 || !one(names[0])) return problem(res, 400, 'invalid-query', '쿼리가 맞지 않습니다', 'sgg=<시군구 5자리> 또는 sido=<시도 2자리> 하나만 받습니다', undefined, 'public, s-maxage=3600');
    const bySido = names[0] === 'sido', want = bySido ? 'sido' : 'sgg';
    const c = codes.classify(params.get(want));
    if (!c.ok || c.type !== want) return problem(res, 400, 'invalid-code', bySido ? '시도 코드가 맞지 않습니다' : '시군구 코드가 맞지 않습니다', c.ok ? `${c.type} 코드가 왔습니다. ${bySido ? '시도(2자리)' : '시군구(5자리)'}만 받습니다` : c.detail, c.ok ? { reason: 'type-mismatch' } : { reason: c.reason }, 'public, s-maxage=3600');
    if (!scope.nonCapitalAllowed(env) && !scope.inCapitalSido(c.sido)) return scope.denyScope(problem, res, c.sido);   // 2026-10-19 수도권 한정
    if (!pool.hasKeys('RESOLVE')) return problem(res, 503, 'not-configured', '인증키가 설정되어 있지 않습니다', 'RESOLVE 용도 공공데이터포털 키가 필요합니다');
    const label = bySido ? c.sido : c.sgg;
    try {
      /* 지역 이름과 시군구 목록: 시군구 질의는 그 시군구 하나(LH 제목 맞추기용 법정동 이름도), 시도 질의는 시도 안 시군구 전부 */
      let name, regions, umdNames = [];
      if (bySido) {
        const rows = await sidoRows(c.sido), row = codes.findRow(rows, `${c.sido}00000000`);
        if (!row) return problem(res, 404, 'unknown-code', '표준코드 표에 없는 시도입니다', `${c.sido}는 행정표준코드에 없습니다`, { sido: c.sido });
        name = row.locatadd_nm;
        regions = rows.filter((r) => codes.levelOf(r) === 'sgg').map((r) => ({ code: String(r.region_cd).slice(0, 5), name: r.locatadd_nm }));
      } else {
        const rows = await stan.rows(c.sido, c.sgg), row = codes.findRow(rows, `${c.sgg}00000`);
        if (!row) return problem(res, 404, 'unknown-code', '표준코드 표에 없는 시군구입니다', `${c.sgg}는 행정표준코드에 없습니다`, { sgg: c.sgg });
        name = row.locatadd_nm;
        regions = [{ code: c.sgg, name }];
        umdNames = rows.filter((r) => codes.levelOf(r) === 'umd').map((r) => String(r.locallow_nm || r.locatadd_nm.split(' ').pop()));
      }
      const today = kstDate(now());
      const [rental, sale, lh, ah] = await Promise.allSettled([nationalList('rental'), nationalList('sale'), lhNationalList(), applyhomeList(today)]);
      const failed = [['rental', rental], ['sale', sale], ['lh', lh], ['applyhome', ah]].filter(([, r]) => r.status === 'rejected');
      if (failed.length === 4) throw (failed.map(([, r]) => r.reason).find((e) => e instanceof KeyPoolError) || rental.reason);
      const partial = failed.map(([k]) => k);
      const rl = rental.status === 'fulfilled' ? rental.value : [], sl = sale.status === 'fulfilled' ? sale.value : [], lhRows = lh.status === 'fulfilled' ? lh.value : [], ahRows = ah.status === 'fulfilled' ? ah.value : [];
      const mine = M.forRegion(rl, sl, name, regions);
      const ahItems = A.forRegion(ahRows, { regionName: name, sidoCode: bySido ? c.sido : null, regions, today });
      let lhItems = [];
      if (lhRows.length) {
        const exclude = new Set(mine.map((n) => L.titleKey(n.title)));
        lhItems = bySido ? L.forSido(lhRows, name, regions, exclude) : L.forRegion(lhRows, name, umdNames, exclude).map((n) => ({ ...n, sgg: c.sgg, sggName: name }));
        const got = await mapLimit(lhItems.slice(0, LH_SUPPLY_MAX), LH_SUPPLY_CONCURRENCY, (n) => lhSupply(n._supply));
        let supplyFailed = 0;
        got.forEach((g, i) => { if (g.err) supplyFailed++; else { lhItems[i].complex = g.ok.complex; lhItems[i].units = g.ok.units; } });
        if (supplyFailed) partial.push('lh-supply');
      }
      const items = [...mine, ...ahItems, ...lhItems.map(({ _supply, ...n }) => n)].sort((a, b) => String(b.announcedAt || '').localeCompare(String(a.announcedAt || '')) || a.id.localeCompare(b.id));
      const meta = { source: SOURCE_TEXT, rental: rl.length, sale: sl.length, lh: lhRows.length, applyhome: ahRows.length, matched: items.length, lhMatched: lhItems.length, applyhomeMatched: ahItems.length };
      if (partial.length) meta.partial = partial;
      return send(res, 200, { type: 'Notices', [want]: label, name, asOf: new Date(now()).toISOString().slice(0, 10), items, meta },
        partial.length ? 'public, s-maxage=60' : 'public, s-maxage=3600, stale-while-revalidate=3600');
    } catch (e) {
      if (e instanceof KeyPoolError) {
        if (e.code === 'EXHAUSTED') { res.setHeader('Retry-After', String(e.retryAfterSec || 3600)); return problem(res, 429, 'keys-exhausted', '오늘 인증키 한도에 닿았습니다', e.message, { retryAfterSec: e.retryAfterSec }); }
        return problem(res, 503, 'not-configured', '인증키가 설정되어 있지 않습니다', e.message);
      }
      console.error(`notices ${label}: ${(e && e.name) || 'Error'}: ${String((e && e.message) || e).slice(0, 200)}`);
      return problem(res, 502, 'upstream', '공공 모집 공고 서비스를 부르지 못했습니다', '잠시 뒤 다시 시도하세요');   // 원인 문구는 밖으로 내보내지 않는다(키가 섞일 수 있음)
    }
  };
  return handler;
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
