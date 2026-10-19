'use strict';
/* 전국 시군구 판정(assets/js/sgg-locate.js) + 판정용 경계 파일(assets/geo/korea-sgg.json, tools/ledger/korea-sgg.js) */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { locate, load } = require('../../assets/js/sgg-locate.js');
const { SKIP_SIDO, ALIAS } = require('../../tools/ledger/korea-sgg.js');

const ROOT = path.join(__dirname, '..', '..');
const FILE = path.join(ROOT, 'assets/geo/korea-sgg.json');
const text = fs.readFileSync(FILE, 'utf8');
const data = JSON.parse(text);
const ours = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/design/public-mock/data.json'), 'utf8')).sgg.map(([c, n]) => [c, n]));
/* 원천(V-World, 2026-10-18)에는 있지만 data.json sgg 에 없는 곳(우리 자료에 사업이 없어 목록에 없다) — 코드는 행정표준코드와 같다 */
const NOT_IN_OURS = { 43800: '충청북도 단양군', 47840: '경상북도 성주군', 47920: '경상북도 봉화군', 51750: '강원특별자치도 영월군', 52740: '전북특별자치도 장수군' };

test('알려진 청사 좌표 → 시군구 코드(data.json sgg 와 같은 코드)', () => {
  const cases = [
    ['대전시청', 127.3845, 36.3504, '30170'],
    ['부산시청', 129.0750, 35.1798, '26470'],
    ['대구시청 동인청사', 128.6014, 35.8714, '27110'],
    ['광주시청(전남광주 서구)', 126.8514, 35.1601, '12240'],
    ['세종시청', 127.2890, 36.4800, '36110'],
    ['제주시청', 126.5312, 33.4996, '50110'],
    ['서귀포시청', 126.5601, 33.2541, '50130'],
    ['울릉군청', 130.9057, 37.4844, '47940'],
    ['독도', 131.8648, 37.2412, '47940'],
    ['마라도', 126.2670, 33.1170, '50130'],
    ['가거도', 125.1200, 34.0700, '12870'],
    ['강원도청(춘천)', 127.7298, 37.8853, '51110'],
    ['전주시청(완산구)', 127.1480, 35.8242, '52111'],
    ['울산시청(남구)', 129.3114, 35.5384, '31140'],
    ['창원시청(성산구)', 128.6817, 35.2279, '48123'],
    ['청주시청(상당구)', 127.4890, 36.6424, '43111'],
    ['포항시청(남구)', 129.3435, 36.0190, '47111'],
  ];
  for (const [name, lon, lat, code] of cases) {
    assert.strictEqual(locate(data, lon, lat), code, name);
    assert.ok(ours.has(code), `${name}: ${code} 가 data.json sgg 에 있다`);
  }
});

test('수도권은 이 파일에 없다(화면이 region-map 으로 먼저 맞춘다) — 서울시청은 null', () => {
  assert.deepStrictEqual(SKIP_SIDO, ['11', '28', '41']);
  assert.strictEqual(locate(data, 126.9780, 37.5665), null);
  assert.ok(data.sgg.every(([c]) => !SKIP_SIDO.includes(c.slice(0, 2))));
});

test('바다·외국 좌표와 잘못된 입력 → null', () => {
  for (const [name, lon, lat] of [['남해 바다', 128.5, 34.5], ['서해', 125.5, 36.5], ['동해', 129.8, 37.5], ['도쿄', 139.76, 35.68], ['평양', 125.75, 39.03], ['대마도', 129.3, 34.4]]) assert.strictEqual(locate(data, lon, lat), null, name);
  assert.strictEqual(locate(data, NaN, 36), null);
  assert.strictEqual(locate(null, 127.38, 36.35), null);
});

test('모든 코드가 data.json sgg(또는 대응표·허용 목록)에 있고, 수도권 밖 data.json sgg 는 빠짐없이 들어 있다', () => {
  const codes = data.sgg.map(([c]) => c);
  assert.strictEqual(new Set(codes).size, codes.length, '코드 중복 없음');
  const aliasTo = new Set(Object.values(ALIAS));
  const extra = codes.filter((c) => !ours.has(c) && !aliasTo.has(c));
  assert.deepStrictEqual(Object.fromEntries(extra.map((c) => [c, data.sgg.find((s) => s[0] === c)[1]])), NOT_IN_OURS);
  const missing = [...ours.keys()].filter((c) => !SKIP_SIDO.includes(c.slice(0, 2)) && !codes.includes(c));
  assert.deepStrictEqual(missing, []);
  for (const [c, n] of data.sgg) if (ours.has(c)) assert.strictEqual(n, ours.get(c), `${c} 이름`);
});

test('출처 메타·형식·크기 상한', () => {
  assert.strictEqual(data.schema, 'korea-sgg/1');
  assert.match(data.source.name, /LT_C_ADSIGG_INFO/);
  assert.match(data.source.license, /공공누리 제1유형/);
  assert.match(data.source.fetched, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(Number.isInteger(data.scale) && data.scale > 0);
  for (const [, , b, rings, isles] of data.sgg) {
    assert.ok(b.length === 4 && b[0] <= b[2] && b[1] <= b[3]);
    assert.ok(rings.length > 0 && rings.every((r) => r.length >= 6 && r.length % 2 === 0 && r.every(Number.isInteger)));
    if (isles) assert.ok(isles.every((q) => q.length === 4 && q.every(Number.isInteger)));
  }
  assert.ok(Buffer.byteLength(text) <= 620 * 1024, `원본 ${Buffer.byteLength(text)} B`);
  assert.ok(zlib.gzipSync(text).length <= 230 * 1024, 'gzip');
  assert.doesNotMatch(text, /key=|VWORLD/i, '키·키 이름이 없다');
});

test('load: 한 번만 받아 기억, 실패하면 null 이고 다음에 다시 받는다', async () => {
  let n = 0;
  const ok = async () => { n++; return { ok: true, json: async () => data }; };
  const [a, b] = await Promise.all([load('/t/ok.json', ok), load('/t/ok.json', ok)]);
  assert.strictEqual(a, data); assert.strictEqual(b, data); assert.strictEqual(n, 1);
  let m = 0;
  const bad = async () => { m++; throw new Error('network'); };
  assert.strictEqual(await load('/t/bad.json', bad), null);
  assert.strictEqual(await load('/t/bad.json', async () => ({ ok: false })), null);
  assert.strictEqual(await load('/t/bad.json', async () => ({ ok: true, json: async () => ({ nope: 1 }) })), null);
  assert.strictEqual(m, 1);
});

test('sgg-locate.js 는 좌표를 밖으로 보내지 않는다(받기만 한다)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'assets/js/sgg-locate.js'), 'utf8');
  assert.doesNotMatch(src, /XMLHttpRequest|sendBeacon|WebSocket|method\s*:|body\s*:|\?lat|lon=/);
});
