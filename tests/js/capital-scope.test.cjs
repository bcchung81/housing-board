'use strict';
/* 2026-10-19 수도권 한정: 수도권 밖 실시간 자료 API 는 403 out-of-scope, NON_CAPITAL_LIVE=1 일 때만 허용. 외부 호출은 가짜 fetch. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createCache } = require('../../lib/cache.js');
const { createKeyPool, memoryStore } = require('../../lib/keys.js');
const scope = require('../../lib/scope.js');
const resolveApi = require('../../handlers/v1/resolve.js');
const permitsApi = require('../../handlers/v1/permits.js');
const infraApi = require('../../handlers/v1/infra.js');
const noticesApi = require('../../handlers/v1/notices.js');
const ledgerApi = require('../../handlers/v1/ledger.js');
const searchApi = require('../../handlers/v1/codes/search.js');
const buildingsApi = require('../../handlers/v1/buildings.js');
const terrainApi = require('../../handlers/v1/terrain.js');
const busApi = require('../../handlers/bus.js');
const R = require('../../assets/js/region.js');

const origError = console.error;
const KEYS = { DATA_GO_KR_KEY_RESOLVE_1: 'K1', DATA_GO_KR_KEY_BUS_1: 'B1', DATA_GO_KR_KEY: 'K', VWORLD_KEY: 'V', VWORLD_DOMAIN: 'localhost' };
const LIVE = { ...KEYS, NON_CAPITAL_LIVE: '1' };
const empty = () => ({ ok: true, status: 200, json: async () => ({ response: { status: 'NOT_FOUND' }, RESULT: { resultCode: 'INFO-3' } }), text: async () => '{}', arrayBuffer: async () => new ArrayBuffer(4) });
const deps = (env) => ({ env, fetch: async () => empty(), now: () => Date.parse('2026-10-19T03:00:00Z'), sleep: async () => {}, cache: createCache({ persist: false }), pool: createKeyPool({ env, store: memoryStore() }) });
const call = async (handler, url) => {
  const res = { headers: {}, statusCode: 0, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.body = b; } };
  await handler({ method: 'GET', url }, res);
  return { status: res.statusCode, headers: res.headers, json: res.body && String(res.body)[0] === '{' ? JSON.parse(res.body) : null };
};
const denied = (r) => { assert.equal(r.status, 403); assert.equal(r.json.code, 'out-of-scope'); assert.equal(r.json.title, '수도권만 제공합니다'); assert.equal(r.json.detail, '서울·인천·경기만 볼 수 있습니다'); };

const MAKERS = {
  resolve: (env) => resolveApi.createHandler({ ...deps(env), readCoverage: () => ({}), registryIndex: { byId: {} } }),
  permits: (env) => permitsApi.createHandler(deps(env)),
  infra: (env) => infraApi.createHandler(deps(env)),
  notices: (env) => noticesApi.createHandler(deps(env)),
  ledger: (env) => ledgerApi.createHandler({ env: { ...env, NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' }, warn: () => {}, fallback: () => ({ observedMonth: '2026-10', referenceDate: '2026-10-10', bySgg: {} }) }),
};
const URLS = {
  resolve: ['/api/v1/resolve?sgg=26110', '/api/v1/resolve?sgg=29200', '/api/v1/resolve?code=2920010600', '/api/v1/resolve?pnu=2611010100100010000'],
  permits: ['/api/v1/permits?bjd=2611010100', '/api/v1/permits?bjd=2920010600'],
  infra: ['/api/v1/infra?bjd=2611010100', '/api/v1/infra?bjd=2920010600'],
  notices: ['/api/v1/notices?sgg=26110', '/api/v1/notices?sgg=29200', '/api/v1/notices?sido=26'],
  ledger: ['/api/v1/ledger?sgg=26110', '/api/v1/ledger?sgg=29200'],
};

test('(1) resolve·permits·infra·notices·ledger: 수도권 밖(부산 26110, 옛 광산 29200)은 403 out-of-scope', async () => {
  for (const [name, urls] of Object.entries(URLS)) {
    const h = MAKERS[name](KEYS);
    for (const u of urls) { const r = await call(h, u); denied(r); assert.equal(r.headers['cache-control'], 'public, s-maxage=3600', u); }
  }
  const r = await call(MAKERS.resolve(KEYS), '/api/v1/resolve?sgg=29200'); assert.equal(r.json.sido, '12');   // 옛 코드는 통합 시도 12 로 판정
});

test('(2) NON_CAPITAL_LIVE=1 이면 같은 요청이 403 이 아니다(외부는 가짜)', async () => {
  for (const [name, urls] of Object.entries(URLS)) {
    const h = MAKERS[name](LIVE);
    for (const u of urls) assert.notEqual((await call(h, u)).status, 403, u);
  }
  assert.equal(scope.nonCapitalAllowed({ NON_CAPITAL_LIVE: '1' }), true);
  assert.equal(scope.nonCapitalAllowed({ NON_CAPITAL_LIVE: '0' }), false);
  assert.equal(scope.nonCapitalAllowed({}), false);
});

test('(1b) 수도권 안 코드는 막히지 않는다', async () => {
  for (const [name, u] of [['resolve', '/api/v1/resolve?sgg=28245'], ['permits', '/api/v1/permits?bjd=2824510900'], ['notices', '/api/v1/notices?sgg=41450'], ['notices', '/api/v1/notices?sido=11'], ['ledger', '/api/v1/ledger?sgg=28245']]) {
    assert.notEqual((await call(MAKERS[name](KEYS), u)).status, 403, u);
  }
});

test('(3) codes/search: 수도권 밖 후보는 빈 목록으로 빠진다', async () => {
  const row = (cd, nm) => ({ region_cd: cd, sido_cd: cd.slice(0, 2), sgg_cd: cd.slice(2, 5), umd_cd: cd.slice(5, 8), ri_cd: cd.slice(8, 10), locatadd_nm: nm, locallow_nm: nm.split(' ').pop() });
  const ROWS = [row('1129013800', '서울특별시 성북구 장위동'), row('4373035027', '충청북도 옥천군 청산면 장위리'), row('5115010100', '강원특별자치도 강릉시 홍제동')];
  const stan = (rows) => ({ ok: true, status: 200, json: async () => ({ StanReginCd: [{ head: [{ totalCount: rows.length }, { RESULT: { resultCode: 'INFO-0' } }] }, { row: rows }] }), text: async () => '' });
  const fetch = async (url) => {
    const u = new URL(url);
    if (u.pathname.endsWith('/getStanReginCdList')) { const nm = u.searchParams.get('locatadd_nm'); return stan(nm ? ROWS.filter((r) => r.locatadd_nm.includes(nm)) : ROWS.filter((r) => r.sido_cd === u.searchParams.get('sido_cd') && r.sgg_cd === u.searchParams.get('sgg_cd'))); }
    return { ok: true, status: 200, json: async () => ({ response: { status: 'NOT_FOUND' } }), text: async () => '' };
  };
  const run = (env, q) => call(searchApi.createHandler({ ...deps(env), fetch, readCoverage: () => ({}) }), `/api/v1/codes/search?q=${encodeURIComponent(q)}`);
  const a = await run(KEYS, '장위'); assert.deepEqual(a.json.items.map((i) => i.code), ['1129013800']);
  const b = await run(KEYS, '4373035027'); assert.equal(b.status, 200); assert.deepEqual(b.json.items, []);
  const c = await run(LIVE, '장위'); assert.deepEqual(c.json.items.map((i) => i.code).sort(), ['1129013800', '4373035027']);
});

test('(4) buildings·terrain: 수도권 밖 칸·타일은 403, 안은 403 아님', async () => {
  const b = (env) => buildingsApi.createHandler(deps(env));
  const t = (env) => terrainApi.createHandler(deps(env));
  denied(await call(b(KEYS), '/api/v1/buildings?cell=12900,3510'));   // 부산 근처(129.0E 35.1N, 칸 0.01°)
  assert.notEqual((await call(b(KEYS), '/api/v1/buildings?cell=12675,3755')).status, 403);
  assert.notEqual((await call(b(LIVE), '/api/v1/buildings?cell=12900,3510')).status, 403);
  // z10 타일: 부산 (x=878,y=405) 은 밖, 서울 (x=872,y=396) 은 안, 낮은 배율 z5 한국 타일은 겹쳐 허용
  const far = await call(t(KEYS), '/api/v1/terrain?z=10&x=878&y=405');
  denied(far);
  assert.equal(far.headers['cache-control'], 'public, s-maxage=3600', 'terrain 거부도 다른 API 와 같은 캐시(cc || (404 ? …) 우선순위)');
  assert.notEqual((await call(t(KEYS), '/api/v1/terrain?z=10&x=872&y=396')).status, 403);
  assert.notEqual((await call(t(KEYS), '/api/v1/terrain?z=5&x=27&y=12')).status, 403);
  assert.notEqual((await call(t(LIVE), '/api/v1/terrain?z=10&x=878&y=405')).status, 403);
});

test('(5) bus: 비수도권 slug 는 403, 수도권 slug 는 통과, NON_CAPITAL_LIVE=1 이면 통과', async () => {
  const mk = (env) => busApi.createHandler({ ...deps(env), readLiveRoutes: () => null, readRegionSidos: (slug) => (slug === 'jeonnam-naju' ? ['12'] : ['28']) });   // 가짜 수도권 밖 번들(옛 나주 번들은 제거됨)
  const r = await call(mk(KEYS), '/api/bus?region=jeonnam-naju');
  denied({ status: r.status, json: { code: r.json.error, title: r.json.title, detail: r.json.detail } });
  assert.equal((await call(mk(KEYS), '/api/bus?region=incheon-gyeyang')).status, 404);          // 수도권: 범위 검사를 지나 no-live-routes
  assert.equal((await call(mk(LIVE), '/api/bus?region=jeonnam-naju')).status, 404);
});

test('(6) regions/index.json: public 인 지역은 모두 수도권 코드', () => {
  const idx = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'regions', 'index.json'), 'utf8'));
  const codes = require('../../lib/codes.js');
  const pub = idx.regions.filter((r) => r.visibility === 'public');
  assert.ok(pub.length >= 1);
  for (const r of pub) {
    const reg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'regions', r.slug, 'region.json'), 'utf8'));
    for (const c of reg.codes) assert.ok(scope.inCapitalSido(codes.classify(c.code).sido), `${r.slug} ${c.code}`);
  }
});

test('(7) region.js fatalModel: out-of-scope 면 링크 없이 문구만', () => {
  const lite = { 28245: { name: '인천 계양구', n: 3 }, 28260: { name: '인천 서구', n: 2 } };
  const m = R.fatalModel({ name: 'sgg', value: '28260' }, '수도권만 제공합니다', lite, [{ slug: 'x', name: 'X' }], '서울·인천·경기만 볼 수 있습니다', 'out-of-scope');
  assert.deepEqual(m.links, []); assert.equal(m.title, '수도권만 제공합니다');
  assert.ok(R.fatalHtml(m).includes('수도권 개요로'));
  assert.equal(R.fatalHtml(m).includes('ft-go'), false);
});
