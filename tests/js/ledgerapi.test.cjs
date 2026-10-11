'use strict';
// GET /api/v1/ledger(handlers/v1/ledger.js): 지도 사업 표시값 — Supabase api.map 을 공개용 키로 읽고, 안 되면 data/board/ledger-map.json 으로 대체한다. fetch 는 가짜(네트워크 없음).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHandler } = require('../../handlers/v1/ledger.js');

const ROOT = path.join(__dirname, '..', '..');
const MAP = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/board/ledger-map.json'), 'utf8'));
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'sb_secret_never' };
const json = (status, body) => ({ ok: status < 400, status, json: async () => body });

function run(over = {}) {
  const calls = [], warns = [];
  const handler = createHandler({ env: over.env ?? ENV, warn: (m) => warns.push(m), wrap: over.wrap, fetch: async (u, init) => { calls.push({ url: String(u), init }); return over.fetch(String(u)); } });
  return async (url, method = 'GET') => {
    const res = { headers: {}, statusCode: 0, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.body = b; } };
    await handler({ method, url }, res);
    return { status: res.statusCode, headers: res.headers, json: res.body ? JSON.parse(res.body) : null, calls, warns };
  };
}
/* 가짜 api.map: 최신 달 2026-10, 계양만 행이 있다 */
const fakeMap = (u) => {
  const q = new URL(u).searchParams;
  if (q.get('order') === 'month.desc') return json(200, [{ month: '2026-10', reference_date: '2026-10-10' }]);
  return json(200, q.get('sgg_code') === 'eq.28245' ? [{ rows: MAP.bySgg['28245'] }] : []);
};

test('형식: sgg 가 5자리 숫자가 아니면 400 invalid-code, 없거나 중복·모르는 쿼리는 400 invalid-query, 원천은 부르지 않는다', async () => {
  const r = run({ fetch: () => { throw new Error('호출하면 안 됨'); } });
  for (const q of ['sgg=abc', 'sgg=2824', 'sgg=282450', 'sgg=']) {
    const x = await r(`/api/v1/ledger?${q}`);
    assert.deepEqual([x.status, x.json.code], [400, 'invalid-code'], q);
    assert.match(x.headers['content-type'], /^application\/problem\+json/);
  }
  for (const q of ['', '?sgg=28245&sgg=11110', '?sgg=28245&bjd=1']) assert.equal((await r(`/api/v1/ledger${q}`)).json.code, 'invalid-query', q);
  const post = await r('/api/v1/ledger?sgg=28245', 'POST');
  assert.deepEqual([post.status, post.headers.allow], [405, 'GET, HEAD']);
  assert.equal(post.calls.length, 0);
});

test('Supabase: 공개용 키·api 스키마로 최신 달 → 그 달의 시군구 행을 읽고 origin supabase, 비밀 키는 보내지 않는다', async () => {
  const x = await run({ fetch: fakeMap })('/api/v1/ledger?sgg=28245');
  assert.equal(x.status, 200);
  assert.deepEqual({ ...x.json, projects: x.json.projects.length }, { schema: 'ledger-map/1', month: '2026-10', referenceDate: '2026-10-10', origin: 'supabase', sgg: '28245', projects: MAP.bySgg['28245'].length });
  assert.deepEqual(x.json.projects, MAP.bySgg['28245']);
  assert.equal(x.calls.length, 2);
  assert.match(x.calls[0].url, /\/rest\/v1\/map\?select=month,reference_date&order=month\.desc&limit=1$/);
  assert.match(x.calls[1].url, /\/rest\/v1\/map\?select=rows&month=eq\.2026-10&sgg_code=eq\.28245$/);
  for (const c of x.calls) {
    assert.deepEqual(c.init.headers, { apikey: ENV.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'Accept-Profile': 'api' });
    assert.equal(c.init.cache, 'no-store');
    assert.ok(c.init.signal);
  }
  assert.ok(!JSON.stringify(x.calls).includes(ENV.SUPABASE_SECRET_KEY));
  assert.match(x.headers['cache-control'], /s-maxage=300/);
  assert.equal(x.warns.length, 0);
});

test('빈 목록: 원장에 없는 시군구는 200 + projects [] (Supabase 도 JSON 도)', async () => {
  const a = await run({ fetch: fakeMap })('/api/v1/ledger?sgg=99999');
  assert.deepEqual([a.status, a.json.origin, a.json.projects], [200, 'supabase', []]);
  const b = await run({ env: {}, fetch: () => { throw new Error('호출하면 안 됨'); } })('/api/v1/ledger?sgg=99999');
  assert.deepEqual([b.status, b.json.origin, b.json.projects], [200, 'json', []]);
});

test('JSON 대체: 환경변수 없음·HTTP 오류·빈 표·모양 불량·예외면 data/board/ledger-map.json 을 origin json · no-store 로, 경고 한 줄', async () => {
  const cases = [
    [{ env: {}, fetch: () => { throw new Error('호출하면 안 됨'); } }, /환경변수 없음/],
    [{ fetch: () => json(401, { code: '42501' }) }, /HTTP 401/],
    [{ fetch: () => json(200, []) }, /결과 없음/],
    [{ fetch: () => json(200, { rows: 1 }) }, /모양 검사 실패/],
    [{ fetch: (u) => (new URL(u).searchParams.get('order') ? json(200, [{ month: '2026-10' }]) : json(200, [{ rows: {} }])) }, /모양 검사 실패/],
    [{ fetch: () => { throw new Error('ECONNRESET'); } }, /ECONNRESET/],
  ];
  for (const [over, why] of cases) {
    const x = await run(over)('/api/v1/ledger?sgg=28245');
    assert.equal(x.status, 200);
    assert.deepEqual(x.json, { schema: 'ledger-map/1', month: MAP.observedMonth, referenceDate: MAP.referenceDate, origin: 'json', sgg: '28245', projects: MAP.bySgg['28245'] });
    assert.equal(x.headers['cache-control'], 'no-store');
    assert.equal(x.warns.length, 1);
    assert.match(x.warns[0], why);
  }
});

test('캐시: Supabase 읽기는 wrap(라우트의 unstable_cache)을 거치고, 라우트는 3600초·태그 ledger-board 로 감싼다', async () => {
  let wrapped = 0;
  const wrap = (fn) => async (...args) => { wrapped++; assert.deepEqual(args, [ENV.NEXT_PUBLIC_SUPABASE_URL, ENV.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, '28245']); return fn(...args); };
  await run({ fetch: fakeMap, wrap })('/api/v1/ledger?sgg=28245');
  assert.equal(wrapped, 1);
  const route = fs.readFileSync(path.join(ROOT, 'app/api/v1/ledger/route.ts'), 'utf8');
  assert.match(route, /unstable_cache\(fn, \['ledger-map'\], \{ revalidate: 3600, tags: \['ledger-board'\] \}\)/);
  assert.match(route, /allMethods\(toRoute\(handler\)\)/);
  const src = fs.readFileSync(path.join(ROOT, 'handlers/v1/ledger.js'), 'utf8');
  assert.doesNotMatch(src, /SUPABASE_SECRET_KEY|SUPABASE_DB_URL|SERVICE_ROLE/);
  const revalidate = fs.readFileSync(path.join(ROOT, 'app/api/revalidate/route.ts'), 'utf8');
  assert.match(revalidate, /ALLOWED_TAGS = \['ledger-board'\]/, '보드와 같은 태그라 적재 뒤 한 번에 비워진다');
});

test('계약 문서: /api/v1/ledger 경로·LedgerResponse 가 openapi.json 에 있고 대체 파일이 그 모양을 지킨다', () => {
  const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas/api/openapi.json'), 'utf8'));
  const op = doc.paths['/api/v1/ledger'].get;
  assert.equal(op.responses['200'].content['application/json'].schema.$ref, '#/components/schemas/LedgerResponse');
  assert.deepEqual(op.parameters.map((p) => p.name), ['sgg']);
  const props = doc.components.schemas.LedgerProject.required;
  for (const r of Object.values(MAP.bySgg).flat()) assert.deepEqual(Object.keys(r), props);
});
