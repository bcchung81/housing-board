'use strict';
/* 지역 공급: 시군구 지도에서 시군구를 고르고 지도(/map?sgg=)로 보내는 연결점(2026-10-15). 이름 → 코드 대조·구 링크·주소 ?sgg= 처리. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const R = require('../../lib/board/region.ts');
const regionMap = require('../../data/board/region-map.json');
const MO = require('../../lib/board/metro-overview.ts');
const T = { areas: MO.METRO_AREAS, sidoShort: MO.SIDO_SHORT, guOf: MO.guOf };
const { mapHref } = require('../../lib/board/map-href.ts');

const all = R.sggUnits(regionMap, 'metro', T);

test('region-map 의 시군구 67개가 모두 코드로 대조된다(실패 목록 고정)', () => {
  assert.equal(regionMap.sgg.length, 67);
  assert.equal(all.length, 67);
  assert.deepEqual(all.filter((u) => !u.code).map((u) => u.label), []);
  assert.equal(new Set(all.map((u) => u.code)).size, 67, '코드 중복 없음');
});

test('구가 있는 경기 시는 구마다 링크, 단일 시군구는 링크 하나', () => {
  const by = Object.fromEntries(all.map((u) => [u.code, u]));
  assert.deepEqual(by['41280'].gu.map((g) => [g.code, g.name]), [['41281', '덕양구'], ['41285', '일산동구'], ['41287', '일산서구']]);
  for (const c of ['41110', '41130', '41170', '41190', '41270', '41460', '41590']) assert.ok(by[c].gu.length >= 2, c);
  assert.equal(all.filter((u) => u.gu.length).length, 8, '구 있는 시 8곳');
  assert.equal(by['11170'].gu.length, 0);
  assert.equal(by['11170'].n, '용산구');
  assert.equal(mapHref({ sgg: '11170' }), '/map?sgg=11170');
  assert.equal(mapHref({ sgg: by['41280'].gu[0].code }), '/map?sgg=41281');
  assert.equal(by['41500'].gu.length, 0, '이천시: 구 없음');
});

test('범위: 서울은 25 · 인천 11 · 경기 31, 수도권 밖은 비어 있다', () => {
  assert.equal(R.sggUnits(regionMap, '11', T).length, 25);
  assert.equal(R.sggUnits(regionMap, '28', T).length, 11);
  assert.equal(R.sggUnits(regionMap, '41', T).length, 31);
  assert.equal(R.sggUnits(regionMap, '26', T).length, 0);
});

test('주소 ?sgg=: 범위 안의 면 코드만 받고 나머지는 선택 없음', () => {
  assert.equal(R.parseSgg(regionMap, '41', T, '41280'), '41280');
  assert.equal(R.parseSgg(regionMap, 'metro', T, '11170'), '11170');
  assert.equal(R.parseSgg(regionMap, '41', T, '11170'), null, '범위 밖');
  assert.equal(R.parseSgg(regionMap, '41', T, '41281'), null, '구 코드는 면이 아니다');
  assert.equal(R.parseSgg(regionMap, 'metro', T, 'abc'), null);
  assert.equal(R.parseSgg(regionMap, 'metro', T, undefined), null);
  assert.equal(R.parseSgg(regionMap, '', T, '11170'), null, '전국은 지도 없음');
});

test('화면: 면 클릭·select·Esc, 고르면 ?sgg= 로 이동(서버가 거름), 시도 칩은 sgg 를 풀고 종류·지표 칩은 지킨다', () => {
  const ahead = read('components/region/Ahead.tsx');
  assert.match(ahead, /data-sgg=\{u\.code\}/);
  assert.match(ahead, /if \(e\) \{ setHud\(null\); pick\(e\.ym, e\.k\); return; \}/, '원 클릭이 먼저');
  assert.match(ahead, /ev\.key === 'Escape' && sgg/);
  assert.match(ahead, /<select aria-label="시군구 고르기/);
  assert.match(ahead, /q\.set\('sgg', c\); else q\.delete\('sgg'\)/);
  assert.match(ahead, /mapHref\(\{ sgg: g\.code \}\)/);
  assert.match(ahead, /누르면 고르기/, 'title');
  assert.match(ahead, /router\.push\(/, '고르면 서버 렌더로(replaceState 만 하지 않는다)');
  assert.doesNotMatch(ahead, /replaceState\(null, '', `\$\{window\.location\.pathname\}/);
  const page = read('app/(dashboard)/region/page.tsx');
  assert.match(page, /const sgg = parseSgg\(regionMap, sido, SGG_TABLE, q\.sgg\);/);
  assert.match(page, /initialSgg=\{sgg\}/);
  assert.match(page.match(/const href = [\s\S]*?\n  \};/)[0], /const sg = p\.sgg !== undefined \? p\.sgg : p\.sido !== undefined \? null : sgg;/);
});
