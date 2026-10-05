'use strict';
/* api/v1/notices.js — 시군구의 마이홈 공공 모집공고. 네트워크 없이 가짜 fetch 로 시험한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCache } = require('../../lib/cache.js');
const { createKeyPool, memoryStore } = require('../../lib/keys.js');
const api = require('../../api/v1/notices.js');

const row = (cd, nm) => ({ region_cd: cd, sido_cd: cd.slice(0, 2), sgg_cd: cd.slice(2, 5), umd_cd: cd.slice(5, 8), ri_cd: cd.slice(8, 10), locatadd_nm: nm, locallow_nm: nm.split(' ').pop() });
const stanJson = (rows) => (rows.length ? { StanReginCd: [{ head: [{ totalCount: rows.length }, { RESULT: { resultCode: 'INFO-0' } }] }, { row: rows }] } : { RESULT: { resultCode: 'INFO-3' } });
const mh = (items, total = items.length) => ({ response: { header: { resultCode: '00' }, body: { totalCount: total, numOfRows: 100, pageNo: 1, item: items } } });
const ok = (json) => ({ ok: true, status: 200, json: async () => json, text: async () => JSON.stringify(json) });
const raw = (status, text) => ({ ok: status < 400, status, json: async () => JSON.parse(text || 'null'), text: async () => text });
const N = (id, brtc, sgg, over = {}) => ({ pblancId: id, houseSn: 0, sttusNm: '일반공고', pblancNm: `공고 ${id}`, suplyInsttNm: 'LH', houseTyNm: '아파트', brtcNm: brtc, signguNm: sgg, fullAdres: `${brtc} ${sgg} 어딘가 1`, rcritPblancDe: '20261001', beginDe: '20261012', endDe: '20261014', pcUrl: `https://www.myhome.go.kr/n/${id}`, ...over });
const RENTAL = [N('1', '경기도', '하남시'), N('2', '경기도', '하남시', { rcritPblancDe: '20261003' }), N('3', '서울특별시', '성북구')], SALE = [N('9', '경기도', '하남시', { suplyHoCo: undefined, sumSuplyCo: '309' })];

function defaultFetch(url) {
  const u = new URL(url);
  if (u.pathname.endsWith('/getStanReginCdList')) return ok(stanJson(u.searchParams.get('sgg_cd') === '450' ? [row('4145000000', '경기도 하남시'), row('4145011400', '경기도 하남시 감일동')] : []));
  if (u.pathname.endsWith('/rsdtRcritNtcList')) return ok(mh(RENTAL));
  if (u.pathname.endsWith('/ltRsdtRcritNtcList')) return ok(mh(SALE));
  throw new Error(`예상 밖 호출 ${url}`);
}
function harness(over = {}) {
  const calls = [], clock = { t: Date.parse('2026-10-05T03:00:00Z') };
  const env = over.env || { DATA_GO_KR_KEY_RESOLVE_1: 'NOTICE-KEY-1' };
  const now = () => clock.t;
  const handler = api.createHandler({ env, now, sleep: async () => {}, cache: createCache({ persist: false, now }), pool: createKeyPool({ env, now, store: memoryStore() }), fetch: async (url) => { calls.push(String(url)); return (over.fetch || defaultFetch)(String(url)); } });
  const run = async (url, method = 'GET') => {
    const res = { headers: {}, statusCode: 0, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.body = b; } };
    await handler({ method, url }, res);
    return { status: res.statusCode, headers: res.headers, json: res.body ? JSON.parse(res.body) : null, raw: res.body };
  };
  return { run, calls, clock };
}
const isList = (u) => /\/(rsdtRcritNtcList|ltRsdtRcritNtcList)$/.test(new URL(u).pathname);

test('시군구의 공고: 임대·분양을 거르고 공고일 최신 순, 이름·집계·캐시 헤더, 키는 응답에 없다', async () => {
  const h = harness();
  const r = await h.run('/api/v1/notices?sgg=41450');
  assert.equal(r.status, 200); assert.equal(r.json.type, 'Notices'); assert.equal(r.json.sgg, '41450'); assert.equal(r.json.name, '경기도 하남시'); assert.equal(r.json.asOf, '2026-10-05');
  assert.deepEqual(r.json.items.map((i) => [i.id, i.kind, i.units]), [['rental-2', 'rental', null], ['rental-1', 'rental', null], ['sale-9', 'sale', 309]]);   // 최신 공고(2, 10-03)가 앞, 공고일이 같으면 id 순(1 → sale-9)
  assert.deepEqual(r.json.meta, { source: '마이홈포털 공공주택 모집공고(HWSPR02)', rental: 3, sale: 1, matched: 3 });
  assert.equal(r.headers['cache-control'], 'public, s-maxage=3600, stale-while-revalidate=3600');
  assert.ok(!r.raw.includes('NOTICE-KEY'));
  const lists = h.calls.filter(isList); assert.equal(lists.length, 2); assert.equal(new URL(lists[0]).searchParams.get('serviceKey'), 'NOTICE-KEY-1'); assert.equal(new URL(lists[0]).searchParams.get('numOfRows'), '100');
  const n = h.calls.length; await h.run('/api/v1/notices?sgg=41450'); assert.equal(h.calls.length, n);                                          // 전국 목록·표준코드 표는 캐시
  h.clock.t += 3600 * 1000 + 1; await h.run('/api/v1/notices?sgg=41450'); assert.equal(h.calls.filter(isList).length, 4);                           // 1시간 뒤 목록만 다시
});

test('여러 쪽: 총건수만큼 100건씩 이어 받는다. 한쪽 목록만 실패하면 나머지를 주고 meta.partial(짧게만 캐시), 둘 다 실패하면 502, 키 없음 503, 한도 429', async () => {
  const pages = harness({ fetch: (url) => { const u = new URL(url); if (u.pathname.endsWith('/rsdtRcritNtcList')) { const p = Number(u.searchParams.get('pageNo')); return ok(mh([N(String(100 + p), '경기도', '하남시')], 150)); } return defaultFetch(url); } });
  const a = await pages.run('/api/v1/notices?sgg=41450'); assert.equal(a.json.meta.rental, 2); assert.equal(pages.calls.filter((u) => new URL(u).pathname.endsWith('/rsdtRcritNtcList')).length, 2);
  const half = harness({ fetch: (url) => (new URL(url).pathname.endsWith('/ltRsdtRcritNtcList') ? raw(503, '') : defaultFetch(url)) });
  const b = await half.run('/api/v1/notices?sgg=41450'); assert.equal(b.status, 200); assert.deepEqual(b.json.meta.partial, ['sale']); assert.equal(b.json.meta.sale, 0); assert.equal(b.json.items.length, 2); assert.equal(b.headers['cache-control'], 'public, s-maxage=60');
  const dead = harness({ fetch: (url) => (isList(url) ? raw(503, '') : defaultFetch(url)) }); const c = await dead.run('/api/v1/notices?sgg=41450'); assert.equal(c.status, 502); assert.equal(c.json.code, 'upstream'); assert.equal(c.headers['cache-control'], 'no-store');
  const none = await harness({ env: {} }).run('/api/v1/notices?sgg=41450'); assert.equal(none.status, 503); assert.equal(none.json.code, 'not-configured');
  const quota = harness({ fetch: (url) => (isList(url) ? raw(429, '') : defaultFetch(url)) }); const q = await quota.run('/api/v1/notices?sgg=41450'); assert.equal(q.status, 429); assert.equal(q.json.code, 'keys-exhausted'); assert.ok(Number(q.headers['retry-after']) > 0);
});

test('거절: 쿼리·코드 종류(법정동·PNU 는 시군구가 아님)·표준코드 표에 없는 시군구(404)·방식', async () => {
  const h = harness();
  for (const [url, status, code, reason] of [['/api/v1/notices', 400, 'invalid-query'], ['/api/v1/notices?sgg=41450&x=1', 400, 'invalid-query'], ['/api/v1/notices?sgg=41450&sgg=11230', 400, 'invalid-query'],
    ['/api/v1/notices?sgg=abc', 400, 'invalid-code', 'not-digits'], ['/api/v1/notices?sgg=4145011400', 400, 'invalid-code', 'type-mismatch'], ['/api/v1/notices?sgg=41', 400, 'invalid-code', 'type-mismatch'], ['/api/v1/notices?sgg=99999', 400, 'invalid-code', 'unknown-sido']]) {
    const r = await h.run(url); assert.equal(r.status, status, url); assert.equal(r.json.code, code, url); assert.equal(r.json.type, `/problems/${code}`); if (reason) assert.equal(r.json.reason, reason, url);
  }
  const nf = await h.run('/api/v1/notices?sgg=41111'); assert.equal(nf.status, 404); assert.equal(nf.json.code, 'unknown-code'); assert.equal(nf.json.sgg, '41111');
  const post = await h.run('/api/v1/notices?sgg=41450', 'POST'); assert.equal(post.status, 405); assert.equal(post.headers.allow, 'GET, HEAD');
});
