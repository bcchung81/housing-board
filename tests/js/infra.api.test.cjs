'use strict';
/* lib/infra.js · api/v1/infra.js — 요청 시 조회용 신설예정 학교·버스 정류장. 네트워크 없이 가짜 fetch 로 시험한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCache } = require('../../lib/cache.js');
const { createKeyPool, memoryStore } = require('../../lib/keys.js');
const I = require('../../lib/infra.js');
const api = require('../../api/v1/infra.js');

/* ---------- lib/infra.js ---------- */
const row = (over) => Object.assign({ schlSeq: 51, schlNm: '(가칭)덕풍초', ditcNm: '초', openSchdYm: '202903', classCnt: '44', stdtCnt: '1113', realAddr: '경기도 하남시 덕풍동 1 일원', pointX: '37.5400', pointY: '127.2000' }, over);

test('scheduledSchools: 번들 infra.js 와 같은 모양(초·중·고·특수 학교급, 년월, 학급·학생, 좌표 pointX=위도), 가까운 것만, 개교 빠른 순', () => {
  const centers = [[127.2005, 37.5402]];
  const { schools, skipped } = I.scheduledSchools([
    row(), row({ schlSeq: 52, schlNm: '(가칭)가중', ditcNm: '중', openSchdYm: '202803', classCnt: '', stdtCnt: null }),
    row({ schlSeq: 53, schlNm: '멀리', pointX: '37.6', pointY: '127.3' }), row({ schlSeq: 54, ditcNm: '유치원' }), row({ schlSeq: 55, openSchdYm: '2029' }), row({ schlSeq: 56, pointX: '99', pointY: '999' }),
  ], centers);
  assert.deepEqual(skipped, { level: 1, ym: 1, point: 1 });
  assert.deepEqual(schools.map((s) => s.name), ['(가칭)가중', '(가칭)덕풍초']);
  assert.deepEqual(schools[1], { id: 'edu-51', name: '(가칭)덕풍초', level: '초등학교', status: '신설예정', openYm: '2029-03', classes: 44, students: 1113, address: '경기도 하남시 덕풍동 1 일원', lon: 127.2, lat: 37.54, sources: ['edu-newschool'] });
  assert.equal('classes' in schools[0], false); assert.equal('students' in schools[0], false);
  assert.deepEqual(I.scheduledSchools(null, centers).schools, []);
});

test('tagoStop·queryCenters·centerOf: 정류소 변환, 150 m 안 중심은 건너뜀, 폴리곤 중심', () => {
  assert.deepEqual(I.tagoStop({ nodeid: 'BSB1', nodenm: '해운대구청', nodeno: 12345, gpslati: '35.1631', gpslong: '129.1639' }), { id: 'BSB1', name: '해운대구청', lon: 129.1639, lat: 35.1631, no: '12345' });
  assert.equal('no' in I.tagoStop({ nodeid: 'X', nodenm: 'y', gpslati: 35, gpslong: 129 }), false);
  for (const bad of [{ nodenm: 'a', gpslati: 35, gpslong: 129 }, { nodeid: 'a', gpslati: 35, gpslong: 129 }, { nodeid: 'a', nodenm: 'b', gpslati: 1, gpslong: 1 }]) assert.equal(I.tagoStop(bad), null);
  const near = [127.2, 37.54], also = [127.2008, 37.5401], far = [127.205, 37.54];                              // also 는 약 70 m, far 는 약 440 m
  assert.deepEqual(I.queryCenters([near, also, far]), [near, far]);
  assert.equal(I.queryCenters(Array.from({ length: 100 }, (_, i) => [127 + i * 0.01, 37.5])).length, 40);
  assert.deepEqual(I.centerOf({ type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] }), [1, 1]);
  assert.equal(I.centerOf(null), null); assert.equal(I.centerOf({ type: 'Point', coordinates: [1, 1] }), null);
  assert.ok(Math.abs(I.distM([127, 37.5], [127, 37.51]) - 1111.9) < 2);
});

/* ---------- api/v1/infra.js ---------- */
const BJD = '4145010800';
const rec = (over) => Object.assign({ sigunguCd: '41450', bjdongCd: '10800', bun: '0569', ji: '0000', platGbCd: '0', purpsCdNm: '공동주택', totHhldCnt: 100, bldNm: '덕풍아파트', mgmHsrgstPk: 1, apprvDay: '20240101', stcnsDay: '20240601', useInsptDay: '', mainBldCnt: 3, platPlc: '경기도 하남시 덕풍동 569번지' }, over);
const SQ = (x, y, d = 0.0003) => ({ type: 'Polygon', coordinates: [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]] });
const ok = (json) => ({ ok: true, status: 200, json: async () => json, text: async () => JSON.stringify(json) });
const raw = (status, text) => ({ ok: status < 400, status, json: async () => JSON.parse(text), text: async () => text });
const hub = (items) => ({ response: { header: { resultCode: '00' }, body: { items: { item: items }, totalCount: items.length } } });
const tago = (items) => ({ response: { header: { resultCode: '00' }, body: { items: items.length ? { item: items } : '', totalCount: items.length } } });
const vw = (g) => ({ response: { status: 'OK', result: { featureCollection: { features: [{ geometry: g }] } } } });
const host = (url) => new URL(url).hostname;

function defaultFetch(url, init) {
  const u = new URL(url);
  if (u.hostname === 'eduinfo.go.kr') return ok({ result: [row(), row({ schlSeq: 90, schlNm: '(가칭)먼곳', pointX: '36', pointY: '128' })] });
  if (u.hostname === 'api.vworld.kr') { const pnu = /pnu:=:(\d+)/.exec(u.searchParams.get('attrFilter'))[1]; return ok(vw(pnu.endsWith('05690000') ? SQ(127.2, 37.54) : SQ(127.206, 37.54))); }
  if (u.pathname.includes('HsPmsHubService')) return ok(hub([rec(), rec({ mgmHsrgstPk: 2, bun: '0570', bldNm: '다른단지', totHhldCnt: 50, stcnsDay: '' })]));
  if (u.pathname.includes('getCrdntPrxmtSttnList')) {
    const lon = Number(u.searchParams.get('gpsLong')), lat = Number(u.searchParams.get('gpsLati'));
    return ok(tago([{ nodeid: `S${Math.round(lon * 1000)}`, nodenm: `정류소${Math.round(lon * 1000)}`, nodeno: '123', gpslati: lat + 0.001, gpslong: lon + 0.001 }, { nodeid: 'FAR', nodenm: '먼정류소', gpslati: lat + 0.01, gpslong: lon + 0.01 }]));   // 약 140 m / 1.4 km
  }
  throw new Error('예상 밖 호출 ' + url);
}
function harness(over = {}) {
  const calls = [], clock = { t: Date.parse('2026-10-05T03:00:00Z') };
  const env = over.env || { DATA_GO_KR_KEY_RESOLVE_1: 'RES-KEY', DATA_GO_KR_KEY_BUS_1: 'BUS-KEY', VWORLD_KEY: 'VW-KEY', VWORLD_DOMAIN: 'localhost' };
  const now = () => clock.t;
  const handler = api.createHandler({
    env, now, sleep: async () => {}, cache: createCache({ persist: false, now }), pool: createKeyPool({ env, now, store: memoryStore() }),
    fetch: async (url, init) => { calls.push({ url, init }); return (over.fetch || defaultFetch)(url, init, calls.length); },
  });
  const run = async (url, method = 'GET') => {
    const res = { headers: {}, statusCode: 0, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.body = b; } };
    await handler({ method, url }, res);
    return { status: res.statusCode, headers: res.headers, json: res.body ? JSON.parse(res.body) : null, raw: res.body };
  };
  return { run, calls, clock };
}

test('덕풍동: 인허가 단지 중심에서 가까운 신설예정 학교와 정류소를 번들 infra 모양으로(출처·기준일 포함, 먼 학교·먼 정류소 제외)', async () => {
  const h = harness();
  const r = await h.run(`/api/v1/infra?bjd=${BJD}`);
  assert.equal(r.status, 200); assert.equal(r.json.type, 'Infra'); assert.equal(r.json.bjd, BJD); assert.equal(r.json.asOf, '2026-10-05');
  assert.deepEqual(r.json.schools.map((s) => s.name), ['(가칭)덕풍초']); assert.equal(r.json.schools[0].openYm, '2029-03'); assert.equal(r.json.schools[0].level, '초등학교');
  assert.equal(r.json.stops.length, 2);                                                                            // 단지 2곳(중심 약 500 m 떨어짐)마다 1곳, 먼정류소 제외
  assert.deepEqual(Object.keys(r.json.stops[0]).sort(), ['id', 'lat', 'lon', 'name', 'no']);
  assert.deepEqual(r.json.sources.map((s) => s.id), ['edu-newschool', 'tago-bus']); assert.ok(r.json.sources.every((s) => s.redistributable && s.asOf === '2026-10-05'));
  const m = r.json.meta; assert.equal(m.centers, 2); assert.equal(m.schoolsNational, 2); assert.equal(m.schools, 1); assert.equal(m.stopCalls, 2); assert.equal(m.stops, 2);
  assert.equal(r.headers['cache-control'], 'public, s-maxage=86400, stale-while-revalidate=86400');
  const t = h.calls.map((c) => c.url).filter((u) => u.includes('getCrdntPrxmtSttnList')).map((u) => new URL(u));
  assert.equal(t[0].searchParams.get('serviceKey'), 'BUS-KEY'); assert.ok(Number(t[0].searchParams.get('gpsLati')) > 37.5);                              // 정류소는 BUS 용도 키
  const hubCall = h.calls.map((c) => c.url).find((u) => u.includes('HsPmsHubService')); assert.equal(new URL(hubCall).searchParams.get('serviceKey'), 'RES-KEY');   // 인허가는 RESOLVE 용도 키
  const edu = h.calls.find((c) => host(c.url) === 'eduinfo.go.kr'); assert.equal(edu.init.method, 'POST'); assert.match(edu.init.headers.Referer, /newSchMapPage/);
  assert.ok(!r.raw.includes('KEY'));
});

test('같은 법정동은 캐시에서(원천 호출 0), 24시간 뒤 만료. 인허가가 이미 캐시돼 있으면 건축HUB·필지를 다시 부르지 않는다', async () => {
  const h = harness();
  await h.run(`/api/v1/permits?bjd=${BJD}`.replace('/permits', '/infra'));
  const n = h.calls.length; await h.run(`/api/v1/infra?bjd=${BJD}`); assert.equal(h.calls.length, n);
  h.clock.t += 24 * 3600 * 1000 + 1; await h.run(`/api/v1/infra?bjd=${BJD}`); assert.ok(h.calls.length > n);
});

test('서울처럼 근접정류소가 0곳이면 meta.noBus, 학교는 그대로. 사업이 없으면 학교·정류소도 없고 외부 호출도 없다', async () => {
  const seoul = harness({ fetch: (url, init) => (new URL(url).pathname.includes('getCrdntPrxmtSttnList') ? ok(tago([])) : defaultFetch(url, init)) });
  const r = await seoul.run(`/api/v1/infra?bjd=${BJD}`);
  assert.equal(r.json.stops.length, 0); assert.equal(r.json.meta.noBus, true); assert.equal(r.json.schools.length, 1); assert.deepEqual(r.json.sources.map((s) => s.id), ['edu-newschool']);
  assert.equal(r.headers['cache-control'], 'public, s-maxage=86400, stale-while-revalidate=86400');
  const empty = harness({ fetch: (url, init) => (new URL(url).pathname.includes('HsPmsHubService') ? ok(hub([])) : defaultFetch(url, init)) });
  const e = await empty.run(`/api/v1/infra?bjd=${BJD}`);
  assert.deepEqual([e.json.schools, e.json.stops, e.json.meta.centers], [[], [], 0]);
  assert.equal(empty.calls.filter((c) => host(c.url) === 'eduinfo.go.kr' || c.url.includes('getCrdntPrxmtSttnList')).length, 0);
});

test('학교 또는 정류소 한쪽이 실패해도 나머지는 주고 짧게만 캐시한다. 인허가를 못 받으면 502, 키가 없으면 503', async () => {
  const noEdu = harness({ fetch: (url, init) => (host(url) === 'eduinfo.go.kr' ? raw(500, '') : defaultFetch(url, init)) });
  const a = await noEdu.run(`/api/v1/infra?bjd=${BJD}`);
  assert.equal(a.status, 200); assert.deepEqual(a.json.schools, []); assert.equal(a.json.meta.schoolsError, '신설예정 학교를 불러오지 못함'); assert.equal(a.json.stops.length, 2); assert.equal(a.headers['cache-control'], 'public, s-maxage=60');
  const noBus = harness({ fetch: (url, init) => (url.includes('getCrdntPrxmtSttnList') ? raw(500, '') : defaultFetch(url, init)) });
  const b = await noBus.run(`/api/v1/infra?bjd=${BJD}`);
  assert.equal(b.status, 200); assert.deepEqual(b.json.stops, []); assert.equal(b.json.meta.stopsError, '버스 정류소를 불러오지 못함'); assert.equal(b.json.schools.length, 1); assert.equal(b.json.meta.noBus, undefined);
  let firstLon = null;                                                                                                // 정류소 호출 둘 중 하나(첫 중심)만 계속 실패
  const partial = harness({ fetch: (url, init) => { if (!url.includes('getCrdntPrxmtSttnList')) return defaultFetch(url, init); const lon = new URL(url).searchParams.get('gpsLong'); if (firstLon === null) firstLon = lon; return lon === firstLon ? raw(500, '') : defaultFetch(url, init); } });
  const p = await partial.run(`/api/v1/infra?bjd=${BJD}`);
  assert.equal(p.status, 200); assert.equal(p.json.stops.length, 1); assert.equal(p.json.meta.stopsError, '정류소 조회 1곳을 불러오지 못해 일부만 보임'); assert.equal(p.headers['cache-control'], 'public, s-maxage=60');
  const noPermit = harness({ fetch: (url, init) => (url.includes('HsPmsHubService') ? raw(503, '') : defaultFetch(url, init)) });
  const c = await noPermit.run(`/api/v1/infra?bjd=${BJD}`); assert.equal(c.status, 502); assert.equal(c.headers['cache-control'], 'no-store');
  assert.equal((await harness({ env: {} }).run(`/api/v1/infra?bjd=${BJD}`)).status, 503);
  assert.equal((await harness({ env: { DATA_GO_KR_KEY: 'k' } }).run(`/api/v1/infra?bjd=${BJD}`)).status, 503);        // V-World 키 없음
});

test('정류소 한도 오류는 다음 BUS 키로, 시간당 상한을 넘으면 정류소만 비우고 알린다', async () => {
  const env = { DATA_GO_KR_KEY_RESOLVE_1: 'RES', DATA_GO_KR_KEY_BUS_1: 'B1', DATA_GO_KR_KEY_BUS_2: 'B2', VWORLD_KEY: 'v' };
  const q = harness({ env, fetch: (url, init) => { if (!url.includes('getCrdntPrxmtSttnList')) return defaultFetch(url, init); return new URL(url).searchParams.get('serviceKey') === 'B1' ? ok({ response: { header: { resultCode: '22' } } }) : defaultFetch(url, init); } });
  const r = await q.run(`/api/v1/infra?bjd=${BJD}`);
  assert.equal(r.status, 200); assert.equal(r.json.stops.length, 2); assert.ok(q.calls.some((c) => c.url.includes('serviceKey=B2')));
  const tight = harness({ env: { ...env, INFRA_UPSTREAM_PER_HOUR: '1' } });
  const t = await tight.run(`/api/v1/infra?bjd=${BJD}`);
  assert.equal(t.status, 200); assert.equal(t.json.stops.length, 1); assert.match(t.json.meta.stopsError, /시간당 정류소 조회 한도/); assert.equal(t.headers['cache-control'], 'public, s-maxage=60');
  const none = harness({ env: { DATA_GO_KR_KEY_RESOLVE_1: 'R', DATA_GO_KR_KEY_BUS_1: 'B1', VWORLD_KEY: 'v' }, fetch: (url, init) => (url.includes('getCrdntPrxmtSttnList') ? ok({ response: { header: { resultCode: '22' } } }) : defaultFetch(url, init)) });
  const n = await none.run(`/api/v1/infra?bjd=${BJD}`); assert.equal(n.status, 429); assert.equal(n.json.code, 'keys-exhausted');   // 정류소 키가 모두 소진
});

test('거절: 쿼리·법정동 형식·방식', async () => {
  const h = harness();
  for (const [url, status, code] of [['/api/v1/infra', 400, 'invalid-query'], [`/api/v1/infra?bjd=${BJD}&lat=1`, 400, 'invalid-query'], ['/api/v1/infra?lat=37&lon=127', 400, 'invalid-query'],
    ['/api/v1/infra?bjd=41450', 400, 'invalid-code'], ['/api/v1/infra?bjd=abc', 400, 'invalid-code']]) {
    const r = await h.run(url); assert.equal(r.status, status, url); assert.equal(r.json.code, code, url);
  }
  assert.equal((await h.run(`/api/v1/infra?bjd=${BJD}`, 'POST')).status, 405); assert.equal(h.calls.length, 0);
});

test('서울(시도 11)은 TAGO 에 없어 정류소를 부르지 않고 noBus 로 알린다(학교는 그대로, 캐시도 정상)', async () => {
  const BJD11 = '1129013800';
  const h = harness({ fetch: (url, init) => {
    const u = new URL(url);
    if (u.pathname.includes('HsPmsHubService')) return ok(hub([rec({ sigunguCd: '11290', bjdongCd: '13800' })]));
    return defaultFetch(url, init);
  } });
  const r = await h.run(`/api/v1/infra?bjd=${BJD11}`);
  assert.equal(r.status, 200); assert.equal(r.json.meta.noBus, true); assert.equal(r.json.meta.stopCalls, 0); assert.deepEqual(r.json.stops, []);
  assert.equal(h.calls.filter((c) => c.url.includes('getCrdntPrxmtSttnList')).length, 0);
  assert.equal(r.headers['cache-control'], 'public, s-maxage=86400, stale-while-revalidate=86400');
});
