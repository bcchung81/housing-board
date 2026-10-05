/* api/bus.js — 버스 위치 중계. 네트워크 없이 가짜 fetch 로 시험한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const bus = require('../../api/bus.js');

const KEY = 'fake+data/go==KEY';
const live = { city: 23, routes: ['R87', 'R584'] };
const item = (v, lon, lat, ord, nm) => ({ vehicleno: v, gpslong: lon, gpslati: lat, nodeord: ord, nodenm: nm, routenm: 87 });
const ok = (items) => ({ response: { header: { resultCode: '00' }, body: { items: items === '' ? '' : { item: items }, totalCount: 0 } } });
const resp = (json, status = 200) => ({ ok: status === 200, status, json: async () => json });

function harness(over = {}) {
  const calls = [];
  const clock = { t: 1_000_000 };
  const fetchImpl = over.fetch || (async () => resp(ok([item('인천73아1091', '126.7', 37.5, 7, '가정류장')])));
  const handler = bus.createHandler({
    fetch: async (url, opts) => { calls.push(url); return fetchImpl(url, opts); },
    env: over.env || { DATA_GO_KR_KEY: KEY },
    now: () => clock.t,
    readLiveRoutes: over.readLiveRoutes || ((slug) => (slug === 'incheon-gyeyang' ? live : null)),
    sleep: async () => {},
  });
  const run = async (url, method = 'GET') => {
    const res = { headers: {}, statusCode: 0, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.body = b; } };
    await handler({ method, url }, res);
    return { status: res.statusCode, headers: res.headers, json: res.body ? JSON.parse(res.body) : null };
  };
  return { run, calls, clock };
}

test('ttl: 노선이 적어도 60초, 많아지면 하루 예산에 맞춰 늘어난다', () => {
  assert.equal(bus.ttlFor(0), 60);
  assert.equal(bus.ttlFor(4), 60);
  assert.equal(bus.ttlFor(7), 76);     // 7 × 86400 / 8000 = 75.6
  assert.equal(bus.ttlFor(10), 108);
  for (const n of [1, 4, 7, 20, 50]) assert.ok(n * 86400 / bus.ttlFor(n) <= bus.DAILY_BUDGET + n, `노선 ${n}개`);
});

test('normalize: 문자열 좌표를 읽고, 좌표가 없거나 범위 밖이거나 차량번호가 없는 행은 뺀다', () => {
  const out = bus.normalize('R87', ok([item('가1', '126.7123456789', '37.5', '7', '정류장'), item('가2', '', '', 3, 'x'), item('가3', 10, 37.5, 1, 'x'), { gpslong: 126.7, gpslati: 37.5 }, item('가5', 126.8, 37.6, 'x', '')]));
  assert.deepEqual(out.map((b) => b.v), ['가1', '가5']);
  assert.deepEqual(out[0], { r: 'R87', v: '가1', lon: 126.712346, lat: 37.5, ord: 7, stop: '정류장' });
  assert.equal(out[1].ord, null);
  assert.deepEqual(bus.normalize('R', ok('')), []);                                // 운행 차량이 없으면 items 가 빈 문자열
  assert.equal(bus.normalize('R', ok(item('단일', 126.7, 37.5, 1, 'a'))).length, 1);   // item 이 목록이 아닌 한 건일 때
});

test('성공: 노선마다 한 번씩만 부르고, 키는 URL 인코딩해서 보내며, CDN 캐시 시간을 ttl 로 준다', async () => {
  const h = harness();
  const r = await h.run('/api/bus?region=incheon-gyeyang');
  assert.equal(r.status, 200);
  assert.equal(h.calls.length, 2);
  for (const u of h.calls) {
    assert.ok(u.includes('serviceKey=fake%2Bdata%2Fgo%3D%3DKEY'), u);             // + / = 가 그대로면 승인된 키도 거절된다
    assert.ok(!u.includes(KEY));
    assert.ok(u.includes('cityCode=23'));
  }
  assert.ok(h.calls[0].includes('routeId=R87') && h.calls[1].includes('routeId=R584'));
  assert.equal(r.headers['cache-control'], 'public, s-maxage=60, stale-while-revalidate=60');
  assert.equal(r.json.ttl, 60);
  assert.equal(r.json.buses.length, 2);
  assert.equal(r.json.at, new Date(1_000_000).toISOString());
  assert.ok(!JSON.stringify(r.json).includes('KEY'));
});

test('같은 인스턴스에서 30초 안에 다시 오면 TAGO 를 다시 부르지 않는다', async () => {
  const h = harness();
  await h.run('/api/bus?region=incheon-gyeyang');
  h.clock.t += 29_000;
  await h.run('/api/bus?region=incheon-gyeyang');
  assert.equal(h.calls.length, 2);
  h.clock.t += 2_000;
  await h.run('/api/bus?region=incheon-gyeyang');
  assert.equal(h.calls.length, 4);
});

test('요청이 노선을 정하지 못한다: 모르는 지역·추가 쿼리·형식 위반은 TAGO 를 부르지 않고 거절한다', async () => {
  const h = harness();
  for (const [url, status] of [['/api/bus', 400], ['/api/bus?region=incheon-gyeyang&x=1', 400], ['/api/bus?region=incheon-gyeyang&region=a', 400], ['/api/bus?routeId=R1', 400],
    ['/api/bus?region=../etc', 400], ['/api/bus?region=UPPER', 400], ['/api/bus?region=jeonnam-naju', 404]]) {
    const r = await h.run(url);
    assert.equal(r.status, status, url);
  }
  assert.equal(h.calls.length, 0);
});

test('GET·HEAD 외 방식은 405, 키가 없으면 503 이고 캐시하지 않는다', async () => {
  assert.equal((await harness().run('/api/bus?region=incheon-gyeyang', 'POST')).status, 405);
  const r = await harness({ env: {} }).run('/api/bus?region=incheon-gyeyang');
  assert.equal(r.status, 503);
  assert.equal(r.headers['cache-control'], 'no-store');
});

test('키가 이미 URL 인코딩된 채로 들어와도 한 번만 디코딩해서 보낸다', async () => {
  const h = harness({ env: { DATA_GO_KR_KEY: 'fake%2Bdata%2Fgo%3D%3DKEY' } });
  await h.run('/api/bus?region=incheon-gyeyang');
  assert.ok(h.calls[0].includes('serviceKey=fake%2Bdata%2Fgo%3D%3DKEY'), h.calls[0]);
});

test('한 노선이 실패해도 나머지는 돌려주고 failed 에 적는다. 전부 실패하면 502 를 짧게만 캐시한다', async () => {
  const partial = harness({ fetch: async (url) => (url.includes('R584') ? resp({}, 500) : resp(ok([item('가', 126.7, 37.5, 1, 'a')]))) });
  const r = await partial.run('/api/bus?region=incheon-gyeyang');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.failed, ['R584']);
  assert.equal(r.json.buses.length, 1);
  const none = harness({ fetch: async () => { throw new Error('boom serviceKey=' + KEY); } });
  const r2 = await none.run('/api/bus?region=incheon-gyeyang');
  assert.equal(r2.status, 502);
  assert.equal(r2.headers['cache-control'], 'public, s-maxage=15');
  assert.deepEqual(r2.json, { error: 'upstream' });                              // 원인 문구(키가 섞일 수 있음)는 밖으로 내보내지 않는다
});

test('TAGO 가 동시 접속 가득(99)이면 한 번 다시 시도한다. 다른 오류 코드는 다시 시도하지 않는다', async () => {
  let n = 0;
  const busyOnce = harness({ fetch: async () => (n++ === 0 ? resp({ response: { header: { resultCode: '99' } } }) : resp(ok([item('가', 126.7, 37.5, 1, 'a')]))) });
  const r = await busyOnce.run('/api/bus?region=incheon-gyeyang');
  assert.equal(r.status, 200);
  assert.ok(n >= 3);                                                             // 두 노선 중 하나가 재시도했다
  let m = 0;
  const denied = harness({ readLiveRoutes: () => ({ city: 23, routes: ['R1'] }), fetch: async () => { m++; return resp({ response: { header: { resultCode: '30' } } }); } });
  assert.equal((await denied.run('/api/bus?region=incheon-gyeyang')).status, 502);
  assert.equal(m, 1);
});

test('실제 번들: 계양 infra.json 의 live 노선과 도시코드를 읽는다', () => {
  const real = require('../../api/bus.js').createHandler;
  assert.equal(typeof real, 'function');
  const fs = require('node:fs');
  const infra = JSON.parse(fs.readFileSync(require('node:path').join(__dirname, '../../regions/incheon-gyeyang/infra.json'), 'utf8'));
  const liveIds = infra.busRoutes.filter((r) => r.live).map((r) => r.id);
  assert.ok(liveIds.length >= 1 && infra.busCityCode === 23);
  assert.ok(bus.ttlFor(liveIds.length) >= 60);
});
