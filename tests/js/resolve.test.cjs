/* api/v1/resolve.js — 코드 해석 API. 네트워크 없이 가짜 fetch 로 시험한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const R = require('../../api/v1/resolve.js');

const ROW = (cd, nm, lvl) => ({ region_cd: cd, sido_cd: cd.slice(0, 2), sgg_cd: cd.slice(2, 5), umd_cd: cd.slice(5, 8), ri_cd: cd.slice(8, 10), locatadd_nm: nm, locallow_nm: nm.split(' ').pop(), locathigh_cd: '', adpt_de: '' });
const STAN_ROWS = [ROW('2824500000', '인천광역시 계양구'), ROW('2824510900', '인천광역시 계양구 박촌동'), ROW('2824511000', '인천광역시 계양구 동양동'), ROW('2824511100', '인천광역시 계양구 귤현동')];
const stanJson = (rows) => ({ StanReginCd: [{ head: [{ totalCount: rows.length }, { numOfRows: '1000', pageNo: '1', type: 'JSON' }, { RESULT: { resultCode: 'INFO-0', resultMsg: 'NOMAL SERVICE' } }] }, { row: rows }] });
const SQUARE = (x, y, d = 0.01) => ({ type: 'MultiPolygon', coordinates: [[[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]]] });
const vwJson = (feature) => ({ response: { status: feature ? 'OK' : 'NOT_FOUND', result: feature ? { featureCollection: { features: [feature] } } : undefined } });

function harness(over = {}) {
  const calls = [], dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-'));
  const env = over.env || { DATA_GO_KR_KEY_RESOLVE_1: 'SECRET-R1', VWORLD_KEY: 'VW-SECRET', VWORLD_DOMAIN: 'localhost' };
  const fakeFetch = async (url) => {
    calls.push(url);
    if (over.fetch) return over.fetch(url);
    const u = new URL(url);
    if (u.hostname === 'apis.data.go.kr') return { ok: true, status: 200, json: async () => (u.searchParams.get('sgg_cd') === '245' && u.searchParams.get('sido_cd') === '28' ? stanJson(STAN_ROWS) : { RESULT: { resultCode: 'INFO-3' } }) };
    const f = u.searchParams.get('attrFilter'), layer = u.searchParams.get('data');
    if (layer === 'LT_C_ADEMD_INFO') return { ok: true, status: 200, json: async () => vwJson({ properties: { emd_cd: '28245109' }, geometry: SQUARE(126.73, 37.53) }) };
    if (layer === 'LT_C_ADSIGG_INFO') return { ok: true, status: 200, json: async () => vwJson({ properties: { sig_cd: '28245' }, geometry: SQUARE(126.68, 37.52, 0.1) }) };
    if (layer === 'LP_PA_CBND_BUBUN') return { ok: true, status: 200, json: async () => (f.includes('2824511000104790000') ? vwJson({ properties: { pnu: '2824511000104790000', addr: '인천광역시 계양구 동양동 479', jibun: '479도' }, geometry: SQUARE(126.758, 37.55, 0.003) }) : vwJson(null)) };
    throw new Error('예상 밖 호출 ' + url);
  };
  const handler = R.createHandler({ fetch: fakeFetch, env, now: () => Date.parse('2026-10-05T03:00:00Z'), cacheDir: dir, readCoverage: over.readCoverage || (() => ({ 28245: { slug: 'incheon-gyeyang', name: '인천 계양구', updatedAt: '2026-10-03', visibility: 'public' } })) });
  const run = async (url, method = 'GET') => {
    const res = { headers: {}, statusCode: 0, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.body = b; } };
    await handler({ method, url }, res);
    return { status: res.statusCode, headers: res.headers, json: res.body ? JSON.parse(res.body) : null, raw: res.body };
  };
  return { run, calls, dir, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('법정동 10자리: 이름·수준·경계·bbox·커버리지, 표준코드 표는 시군구 한 번만 받아 캐시한다', async () => {
  const h = harness();
  const r = await h.run('/api/v1/resolve?code=2824510900');
  assert.equal(r.status, 200);
  assert.deepEqual([r.json.type, r.json.canonical, r.json.sgg, r.json.bjd, r.json.name, r.json.level], ['bjd', '2824510900', '28245', '2824510900', '인천광역시 계양구 박촌동', 'umd']);
  assert.deepEqual(r.json.bbox, [126.73, 37.53, 126.74, 37.54]);
  assert.deepEqual(r.json.center, [126.735, 37.535]);
  assert.equal(r.json.geometry.type, 'Polygon');
  assert.deepEqual(r.json.coverage, { tier: 'A', slug: 'incheon-gyeyang', name: '인천 계양구', updatedAt: '2026-10-03', visibility: 'public' });
  assert.equal(r.headers['cache-control'], 'public, s-maxage=300, stale-while-revalidate=300');
  const stanCalls = () => h.calls.filter((u) => u.includes('StanReginCd')).length;
  assert.equal(stanCalls(), 1);
  await h.run('/api/v1/resolve?bjd=2824511000');                              // 같은 시군구는 캐시
  assert.equal(stanCalls(), 1);
  assert.ok(!h.raw && !JSON.stringify(r.json).includes('SECRET'));
  h.done();
});

test('8자리 emd 는 00을 붙이고 알려 준다. 시군구는 geometry 를 기본 생략, geometry=1 이면 포함', async () => {
  const h = harness();
  const a = await h.run('/api/v1/resolve?code=28245109');
  assert.equal(a.json.canonical, '2824510900'); assert.deepEqual(a.json.warnings, ['padded-8-digit']);
  const s = await h.run('/api/v1/resolve?code=28245');
  assert.equal(s.json.type, 'sgg'); assert.equal(s.json.name, '인천광역시 계양구'); assert.equal(s.json.geometry, undefined); assert.ok(s.json.bbox);
  const g = await h.run('/api/v1/resolve?sgg=28245&geometry=1');
  assert.ok(g.json.geometry);
  h.done();
});

test('PNU: 지번·건축HUB 인자·필지 경계, 필지를 못 찾으면 법정동 경계로 후퇴하고 알린다', async () => {
  const h = harness();
  const r = await h.run('/api/v1/resolve?pnu=2824511000104790000');
  assert.equal(r.status, 200);
  assert.equal(r.json.type, 'pnu'); assert.equal(r.json.bjd, '2824511000');
  assert.equal(r.json.parcel.jibun, '479'); assert.equal(r.json.parcel.addr, '인천광역시 계양구 동양동 479');
  assert.deepEqual(r.json.parcel.hub, { sigunguCd: '28245', bjdongCd: '11000', platGbCd: '0', bun: '0479', ji: '0000' });
  assert.ok(r.json.parcel.geometry);
  const miss = await h.run('/api/v1/resolve?pnu=2824511000104800000');         // 필지 없음 → 법정동 경계
  assert.equal(miss.status, 200); assert.ok(miss.json.warnings.includes('parcel-not-found')); assert.ok(miss.json.bbox);
  assert.equal(miss.json.parcel.geometry, null);
  h.done();
});

test('오류: 형식·종류·시도·모르는 시군구·모르는 법정동(후보 포함)을 problem+json 으로', async () => {
  const h = harness();
  const bad = await h.run('/api/v1/resolve?code=abc');
  assert.equal(bad.status, 400); assert.equal(bad.json.code, 'invalid-code'); assert.match(bad.headers['content-type'], /application\/problem\+json/);
  assert.equal(bad.json.type, '/problems/invalid-code'); assert.equal(bad.json.title.length > 0, true); assert.equal(bad.json.status, 400);   // RFC 7807: type 은 상대 URI
  assert.equal((await h.run('/api/v1/resolve?bjd=28245')).json.reason, 'type-mismatch');
  assert.equal((await h.run('/api/v1/resolve?code=28')).status, 422);
  const noSgg = await h.run('/api/v1/resolve?code=28999'); assert.equal(noSgg.status, 404); assert.equal(noSgg.json.code, 'unknown-code');
  const noBjd = await h.run('/api/v1/resolve?code=2824519900'); assert.equal(noBjd.status, 404);
  assert.ok(noBjd.json.suggestions.length >= 3 && noBjd.json.suggestions[0].bjd);
  assert.equal((await h.run('/api/v1/resolve')).status, 400);
  assert.equal((await h.run('/api/v1/resolve?code=28245&code=28245')).status, 400);
  assert.equal((await h.run('/api/v1/resolve?code=28245&x=1')).status, 400);
  assert.equal((await h.run('/api/v1/resolve?code=28245', 'POST')).status, 405);
  h.done();
});

test('커버리지: 번들이 없는 시군구는 tier none', async () => {
  const h = harness({ readCoverage: () => ({}) });
  assert.deepEqual((await h.run('/api/v1/resolve?code=2824510900')).json.coverage, { tier: 'none' });
  h.done();
});

test('V-World 실패·키 없음이면 경계 없이 이름과 커버리지만(경고 포함)', async () => {
  const noKey = harness({ env: { DATA_GO_KR_KEY_RESOLVE_1: 'k' } });
  const a = await noKey.run('/api/v1/resolve?code=2824510900');
  assert.equal(a.status, 200); assert.ok(a.json.warnings.includes('geometry-not-configured')); assert.equal(a.json.bbox, undefined); assert.equal(a.json.name, '인천광역시 계양구 박촌동');
  noKey.done();
  const down = harness({ fetch: async (url) => { if (url.includes('vworld')) throw new Error('boom VW-SECRET'); return { ok: true, status: 200, json: async () => stanJson(STAN_ROWS) }; } });
  const b = await down.run('/api/v1/resolve?code=2824510900');
  assert.equal(b.status, 200); assert.ok(b.json.warnings.includes('geometry-unavailable'));
  assert.ok(!b.raw.includes('VW-SECRET'));
  down.done();
});

test('키: 용도 키가 없으면 503, 한도 오류로 모두 소진되면 429 와 Retry-After, 원천 오류는 502 로 원인을 숨긴다', async () => {
  const none = harness({ env: { VWORLD_KEY: 'v' } });
  assert.equal((await none.run('/api/v1/resolve?code=28245')).status, 503); none.done();
  const quota = harness({ fetch: async () => ({ ok: true, status: 200, json: async () => ({ response: { header: { resultCode: '22' } } }) }) });
  const q = await quota.run('/api/v1/resolve?code=28245');
  assert.equal(q.status, 429); assert.ok(Number(q.headers['retry-after']) > 0); assert.equal(q.json.code, 'keys-exhausted'); assert.equal(q.headers['cache-control'], 'no-store'); quota.done();
  const down = harness({ fetch: async () => { throw new Error('upstream SECRET-R1 down'); } });
  const d = await down.run('/api/v1/resolve?code=28245');
  assert.equal(d.status, 502); assert.ok(!d.raw.includes('SECRET-R1')); down.done();
});

test('지오메트리 단순화: 링을 600점 이하로 줄이고 닫으며 소수 5자리로 맞춘다', () => {
  const ring = Array.from({ length: 5000 }, (_, i) => [126 + Math.cos(i / 800) * 0.01234567, 37 + Math.sin(i / 800) * 0.01234567]);
  const g = R.thinGeometry({ type: 'Polygon', coordinates: [[...ring, ring[0]]] });
  assert.ok(g.coordinates[0].length <= 601);
  assert.deepEqual(g.coordinates[0][0], g.coordinates[0][g.coordinates[0].length - 1]);
  assert.ok(g.coordinates[0].every((p) => String(p[0]).split('.')[1].length <= 5));
  assert.equal(R.thinGeometry({ type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] }), null);
  assert.deepEqual(R.bboxOf(SQUARE(126.7, 37.5)), [126.7, 37.5, 126.71, 37.51]);
});

test('readCoverage: 실제 regions/ 에서 계양·광산구·나주 시군구 코드를 읽는다', () => {
  const cov = R.readCoverage();
  assert.equal(cov['28245'].slug, 'incheon-gyeyang'); assert.equal(cov['12330'].slug, 'gwangju-gwangsan'); assert.equal(cov['12170'].slug, 'jeonnam-naju');
  assert.deepEqual(R.readCoverage('/nonexistent/path'), {});
});

test('readCoverage: 운영(production)에서는 미리보기(preview) 지역을 뺀다', () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cov-'));
  fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify({ regions: [{ slug: 'pub', name: '공개', visibility: 'public', updatedAt: '2026-10-01' }, { slug: 'pre', name: '미리보기', visibility: 'preview', updatedAt: '2026-10-02' }] }));
  for (const [slug, code] of [['pub', '11111'], ['pre', '22222']]) { fs.mkdirSync(path.join(root, slug)); fs.writeFileSync(path.join(root, slug, 'region.json'), JSON.stringify({ codes: [{ code, type: 'sigungu', name: slug }] })); }
  assert.deepEqual(Object.keys(R.readCoverage(root)).sort(), ['11111', '22222']);
  assert.deepEqual(Object.keys(R.readCoverage(root, true)), ['11111']);
  fs.rmSync(root, { recursive: true, force: true });
});
