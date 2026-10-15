'use strict';
/* 화면 → 지도 연결점(2026-10-15): 종합상황판 시도 타일·지역 공급 칩 줄·사업 목록 머리와 행. 주소는 lib/board/map-href 한 곳, 수도권 밖은 연결을 숨긴다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const { mapHref, mapScopeHref } = require('../../lib/board/map-href.ts');

test('mapHref: 사업 > 시군구 > 시도 > 첫 화면, 수도권 밖 시도는 ?sido= 를 붙이지 않는다', () => {
  assert.equal(mapHref({ project: 'P1', sgg: '41281', sido: '41' }), '/map?project=P1');
  assert.equal(mapHref({ sgg: '41281', sido: '41' }), '/map?sgg=41281');
  for (const s of ['11', '28', '41']) assert.equal(mapHref({ sido: s }), `/map?sido=${s}`);
  assert.equal(mapHref({ sido: '26' }), '/map');
  assert.equal(mapHref({ project: null, sgg: null, sido: null }), '/map');
  assert.equal(mapHref(), '/map');
});

test('mapScopeHref: 수도권 = /map, 수도권 시도·시군구 = 각 주소, 수도권 밖 = null(연결 숨김)', () => {
  assert.equal(mapScopeHref(), '/map');
  assert.equal(mapScopeHref({ sido: '28' }), '/map?sido=28');
  assert.equal(mapScopeHref({ sgg: '11110' }), '/map?sgg=11110');
  assert.equal(mapScopeHref({ sgg: '11110', sido: '11' }), '/map?sgg=11110');
  for (const s of ['26', '27', '30', '36', '50']) assert.equal(mapScopeHref({ sido: s }), null, s);
  assert.equal(mapScopeHref({ sgg: '26110' }), null);
});

test('사업 행: 수도권 사업만 핀 + 글자 \'지도\'(?project=), 수도권 밖은 칸이 비어 있다', () => {
  assert.match(read('lib/board/projects-list.ts'), /!isMetro\(r\.sgg\) \? null : noLoc[\s\S]*\{ text: '지도', href: mapHref\(\{ project: r\.id \}\), doc: true, icon: 'map'/, '수도권 사업만, 밖은 null');
  const grid = read('components/ui/data-grid.tsx');
  assert.match(grid, /<MapPin[^>]*\/><span aria-hidden="true">지도<\/span><span className="sr-only">\{d\.text\}<\/span>/, '아이콘 옆에 글자, 읽기 도구에는 전체 설명');
  assert.match(grid, /o\.doc \? <a href=\{o\.href\} className=\{o\.icon \? '[^']*focus-visible:outline-2/, '초점 테두리');
});

test('공통 연결점: <a> + 핀 아이콘 + 글자, hover·초점 모양, aria-label', () => {
  const s = read('components/board/MapLink.tsx');
  assert.match(s, /<a href=\{href\} title=\{full\} aria-label=\{full\} className=\{MAP_LINK\}><MapPin /);
  assert.match(s, /hover:text-primary hover:underline focus-visible:text-primary focus-visible:underline focus-visible:outline-2/);
  assert.doesNotMatch(s, /next\/link/);
});

test('종합상황판: 시도 타일 선택 줄에 \'{시도} 실적\' 옆 지도 버튼(?sido=, 수도권 시도만)', () => {
  const s = read('components/board/Board.tsx');
  assert.match(s, /const curRegMap = mapScopeHref\(\{ sido: curReg\.code \}\)/);
  assert.match(s, /실적<\/PanelLink>\{curRegMap \? <MapLink href=\{curRegMap\} /);
  assert.doesNotMatch(s, /`\/map\?/);
  assert.equal(mapScopeHref({ sido: '11' }), '/map?sido=11');
  assert.equal(mapScopeHref({ sido: '48' }), null, '수도권 밖 시도 타일에는 지도 버튼이 없다');
});

test('지역 공급: 칩 줄 옆 지도 버튼 — 시군구 ?sgg= · 수도권 /map · 시도 하나 ?sido= · 전국·수도권 밖 숨김', () => {
  const s = read('app/(dashboard)/region/page.tsx');
  assert.match(s, /const scopeMap = sgg \? mapScopeHref\(\{ sgg \}\) : sido === 'metro' \? mapScopeHref\(\) : sido \? mapScopeHref\(\{ sido \}\) : null;/);
  assert.match(s, /\{scopeMap \? <><MapLink href=\{scopeMap\}/);
  assert.doesNotMatch(s, /`\/map\?/);
  const scope = (sido) => (sido === 'metro' ? mapScopeHref() : sido ? mapScopeHref({ sido }) : null);
  assert.deepEqual(['metro', '41', '', '26'].map(scope), ['/map', '/map?sido=41', null, null]);
  assert.match(read('components/region/Ahead.tsx'), /mapHref\(\{ project: e\.id \}\)/, '앞으로 12개월 사업 핀은 그대로');
});

test('사업 목록 머리: 이 범위 지도에서 — 시군구 ?sgg= · 시도 ?sido= · 수도권 /map · 전국·수도권 밖 숨김', () => {
  const s = read('app/(dashboard)/projects/page.tsx');
  assert.match(s, /const scopeMap = f\.sgg \|\| f\.sido \? mapScopeHref\(\{ sgg: f\.sgg, sido: f\.sido \}\) : f\.metro \? mapScopeHref\(\) : null;/);
  assert.match(s, /<MapLink href=\{scopeMap\} full="이 범위를 지도에서 보기">이 범위 지도에서<\/MapLink>/);
  const scope = (f) => (f.sgg || f.sido ? mapScopeHref({ sgg: f.sgg, sido: f.sido }) : f.metro ? mapScopeHref() : null);
  assert.deepEqual([{ sgg: '41281' }, { sido: '28' }, { metro: true }, {}, { sido: '26' }, { sgg: '26110' }].map(scope), ['/map?sgg=41281', '/map?sido=28', '/map', null, null, null]);
});
