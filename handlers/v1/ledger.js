/* 지도 사업 표시값 API: 사업 원장의 시군구 하나 사업 행 — 6단계 위치·판정(정상·주의·지연)·가장 많이 지난 예정·다음 일정(기획서 M7·M8).

   GET /api/v1/ledger?sgg=<시군구 5자리>
   → 200 { schema:'ledger-map/1', month, referenceDate, origin:'supabase'|'json', sgg, projects:[{ id, name, issued, stage, cls, why, overdue, next, units, pks, pnus }] }
         원장에 사업이 없는 시군구는 projects: []
   → problem+json: invalid-query 400(sgg 없음·중복·모르는 쿼리) · invalid-code 400(5자리 숫자가 아님) · method 405

   - 행은 tools/ledger/board.js 의 mapIndexFromLedger(보드 판정과 같은 사업별 상태)이고, 적재 도구가 달·시군구마다 Supabase ledger.map_snapshots 에 싣는다.
   - 서버가 공개 보기 api.map 을 공개용 키(NEXT_PUBLIC_SUPABASE_URL·NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)로 읽는다: 최신 달 → 그 달의 이 시군구 행.
     성공한 결과만 캐시한다(라우트가 unstable_cache 3600초 · 태그 ledger-board 로 감싼다 — 적재 뒤 /api/revalidate 가 보드와 함께 비운다).
   - 환경변수가 없거나 요청·모양 검사가 실패하면 data/board/ledger-map.json 으로 대체하고 origin 'json'(lib/board/ledger-source.ts 와 같은 방식). 그래서 502·503 이 없다.
   - 지도 매칭 키: pks(건축HUB 주택인허가 관리번호) = /api/v1/permits 의 properties.refs, pnus(19자리 필지) = properties.pnu, id = properties.projectId(발급 사업).
   시험: tests/js/ledgerapi.test.cjs · tests/js/contract.test.cjs */
'use strict';

const SCHEMA = 'ledger-map/1';
const FETCH_TIMEOUT_MS = 4000;
const OK_CACHE = 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600';
const ALLOWED = new Set(['sgg']);

/* api.map 에서 최신 달과 그 달의 시군구 행을 읽는다. 실패·빈 표·모양 불량은 던진다(던진 결과는 캐시에 남지 않는다). fetch 는 no-store */
async function fetchMap(doFetch, url, key, sgg) {
  const get = async (query) => {
    const res = await doFetch(`${url}/rest/v1/map?${query}`, { headers: { apikey: key, 'Accept-Profile': 'api' }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error('모양 검사 실패');
    return rows;
  };
  const [latest] = await get('select=month,reference_date&order=month.desc&limit=1');
  if (!latest) throw new Error('결과 없음');
  const [row] = await get(`select=rows&month=eq.${latest.month}&sgg_code=eq.${sgg}`);
  if (row && !Array.isArray(row.rows)) throw new Error('모양 검사 실패');
  return { month: latest.month, referenceDate: latest.reference_date, projects: row ? row.rows : [] };
}

/* 대체 자료: 저장소의 지도 색인(같은 함수로 만든 파일). 처음 쓸 때 읽는다 */
const codes = require('../../lib/codes.js');
const scope = require('../../lib/scope.js');
const readFallback = () => require('../../data/board/ledger-map.json');

function createHandler(overrides = {}) {
  const env = overrides.env || process.env;
  const doFetch = overrides.fetch || ((...a) => fetch(...a));
  const fallback = overrides.fallback || readFallback;
  const warn = overrides.warn || ((m) => console.warn(m));
  /* 라우트(app/api/v1/ledger/route.ts)가 unstable_cache 로 감싼다. 감싼 함수의 인자(url·key·sgg)가 캐시 키다 */
  const load = (overrides.wrap || ((fn) => fn))((url, key, sgg) => fetchMap(doFetch, url, key, sgg));

  const problem = (res, status, code, title, detail, extra, cc) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/problem+json; charset=utf-8');
    res.setHeader('Cache-Control', cc || 'public, s-maxage=60');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(JSON.stringify(Object.assign({ type: `/problems/${code}`, title, status, code, detail }, extra)));
  };

  return async function ledger(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); return problem(res, 405, 'method', '허용하지 않는 메서드', 'GET 만 받습니다'); }
    const q = new URL(req.url, 'http://x').searchParams;
    if ([...q.keys()].some((k) => !ALLOWED.has(k)) || q.getAll('sgg').length !== 1) return problem(res, 400, 'invalid-query', '잘못된 요청', 'sgg 하나만 받습니다');
    const sgg = q.get('sgg');
    if (!/^\d{5}$/.test(sgg)) return problem(res, 400, 'invalid-code', '잘못된 코드', 'sgg 는 시군구 5자리 숫자입니다');
    const c = codes.classify(sgg);   // 옛 광주·전남 코드도 새 시도로 판정한다
    if (!scope.nonCapitalAllowed(env) && !(c.ok && scope.inCapitalSido(c.sido))) return scope.denyScope(problem, res, c.ok ? c.sido : undefined);   // 2026-10-19 수도권 한정

    let out;
    const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    try {
      if (!url || !key) throw new Error('환경변수 없음');
      out = { ...(await load(url, key, sgg)), origin: 'supabase' };
    } catch (e) {
      warn(`[ledger-map] Supabase 대신 JSON 사용: ${e instanceof Error ? e.message || e.name : '오류'}`);
      const idx = fallback();
      out = { month: idx.observedMonth, referenceDate: idx.referenceDate, projects: idx.bySgg[sgg] || [], origin: 'json' };
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', out.origin === 'supabase' ? OK_CACHE : 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(JSON.stringify({ schema: SCHEMA, month: out.month, referenceDate: out.referenceDate, origin: out.origin, sgg, projects: out.projects }));
  };
}

/* 라우트마다 캐시(wrap)를 붙여 만들므로 미리 만든 핸들러는 내보내지 않는다 */
module.exports = { createHandler, fetchMap };
