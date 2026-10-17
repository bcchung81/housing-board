'use strict';
/* 지도 화면 품질 개선(2026-10-17): ① 배경은 OpenFreeMap 벡터가 기본, V-World 래스터는 ?base=vworld 일 때만(배경 자체 건물은 숨김)
   ② '건물 흐리게' 기본 끔(tests/js/existing.test.cjs) ③ 12 m 이상 건물 벽면 무늬(official-3d-tex). 화면 모양은 브라우저로 확인하고, 여기서는 app.js 의 규칙을 확인한다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', '..', 'assets/js/app.js'), 'utf8');
const layerOf = (id) => { const m = new RegExp(`add\\(\\{ id: '${id}'[^\\n]*(?:\\n[^\\n]*)?`).exec(app); assert.ok(m, `${id} 층이 있어야 한다`); return m[0]; };

test('① 배경: V-World 는 키가 있고 ?base=vworld 일 때만, 상태값도 그 기준', () => {
  assert.match(app, /let usingVworld = !!KEY && q\.get\('base'\) === 'vworld';/);
  assert.ok(app.indexOf('const q = new URLSearchParams(location.search);') < app.indexOf('let usingVworld ='), 'q 를 먼저 선언한다');
  assert.match(app, /base: usingVworld \? 'vworld' : 'openfreemap' \}/);
  assert.match(app, /if \(!KEY \|\| !usingVworld\) return ofmUrl\(\);/, 'baseStyle 의 V-World 경로는 그대로 남는다');
});

test('① OpenFreeMap 배경일 때 스타일 자체 건물(source-layer building)과 상점 POI(poi, transit 제외)를 숨긴다', () => {
  const body = /function setupCustom\(\) \{[\s\S]*?\n\}\n/.exec(app)[0];
  assert.match(body, /if \(!usingVworld\) for \(const l of layers\) if \(map\.getLayer\(l\.id\) && \(l\['source-layer'\] === 'building' \|\| \(l\['source-layer'\] === 'poi' && !\/transit\/\.test\(l\.id\)\)\)\) map\.setLayoutProperty\(l\.id, 'visibility', 'none'\);/);
});

test('③ 벽은 12 m 로 나눈다: 아래는 단색(official-3d), 이상은 높이대별 무늬(official-3d-tex)', () => {
  assert.match(layerOf('official-3d'), /filter: \['all', KNOWN_H, \['<', \['get', 'eh'\], 12\]\]/);
  const tex = layerOf('official-3d-tex');
  assert.match(tex, /type: 'fill-extrusion', source: 'official', minzoom: 14, filter: \['all', KNOWN_H, \['>=', \['get', 'eh'\], 12\]\]/);
  assert.match(tex, /'fill-extrusion-pattern': \['step', \['get', 'eh'\], 'fac-1', 25, 'fac-2', 45, 'fac-3', 70, 'fac-4'\]/);
  assert.match(tex, /'fill-extrusion-height': \['max', 0\.5, \['-', \['get', 'eh'\], ROOF_T\]\], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 1/);
  assert.doesNotMatch(tex, /fill-extrusion-color/, '무늬가 있으면 색은 쓰이지 않는다');
  assert.ok(app.indexOf("add({ id: 'official-3d'") < app.indexOf("add({ id: 'official-3d-tex'") && app.indexOf("add({ id: 'official-3d-tex'") < app.indexOf("add({ id: 'official-roof'"), 'official-3d 바로 다음, 지붕 앞');
});

test('④ facadeImage: 32 px · pixelRatio 2, fac-1~4 를 램프 1~4 색으로 hasImage 검사 뒤 만든다(테마 전환 뒤 다시 만든다)', () => {
  const fn = /function facadeImage\(color\) \{[\s\S]*?\n\}\n/.exec(app);
  assert.ok(fn, 'facadeImage 가 있어야 한다');
  assert.match(fn[0], /pixelRatio: 2/);
  assert.match(app, /for \(let k = 1; k <= 4; k\+\+\) if \(!map\.hasImage\('fac-' \+ k\)\) \{ const im = facadeImage\(T\.ramp\[k\]\); map\.addImage\('fac-' \+ k, im\.data, im\.opts\); \}/);
  // 가짜 캔버스에 그려 바탕·층 줄(−14%)·창(+16%, 0~255 로 자름)을 확인한다
  const rects = [];
  const ctx = { set fillStyle(v) { this._f = v; }, get fillStyle() { return this._f; }, fillRect(x, y, w, h) { rects.push([this._f, x, y, w, h]); }, getImageData: (x, y, w, h) => ({ w, h }) };
  const document = { createElement: () => ({ getContext: () => ctx }) };
  const hex2 = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const out = new Function('document', 'hex2', `${fn[0]}; return facadeImage('#CBD6E3');`)(document, hex2);
  assert.deepEqual(out.data, { w: 32, h: 32 });
  assert.deepEqual(out.opts, { pixelRatio: 2 });
  assert.deepEqual(rects[0], ['#CBD6E3', 0, 0, 32, 32], '바탕');
  const floor = rects.filter((r) => r[3] === 32 && r[4] === 2), win = rects.filter((r) => r[3] === 4 && r[4] === 4);
  assert.equal(floor.length, 4); assert.equal(win.length, 16);
  assert.equal(floor[0][0], '#' + [0xCB, 0xD6, 0xE3].map((v) => Math.round(v * 0.86).toString(16).padStart(2, '0')).join(''));
  assert.equal(win[0][0], '#ebf8ff', '+16% 는 255 에서 자른다');
});

/* applyOfficial 을 가짜 지도에 돌린다(tests/js/existing.test.cjs 의 run 과 같은 방식) */
function run(dim, selId) {
  const src = /function applyOfficial\(\) \{[\s\S]*?\n\}\n/.exec(app);
  assert.ok(src, 'applyOfficial 을 찾을 수 없음');
  const LAYERS = ['official-3d', 'official-3d-tex', 'official-roof', 'official-far', 'official-flat', 'official-flat-line', 'official-ao', 'official-shadow', 'official-outline', 'official-hit'];
  const filters = {};
  const map = { getLayer: (id) => (LAYERS.includes(id) ? { id } : undefined), setFilter: (id, f) => { filters[id] = f; } };
  const KNOWN_H = ['!=', ['get', 'src'], '정보없음'], NO_INFO = ['==', ['get', 'src'], '정보없음'], IS_FAC = ['has', 'fc'], NOT_FAC = ['!', ['has', 'fc']];
  new Function('map', 'vis', 'KNOWN_H', 'NO_INFO', 'IS_FAC', 'NOT_FAC', 'dimExisting', 'selId', `${src[0]}; applyOfficial();`)(map, () => {}, KNOWN_H, NO_INFO, IS_FAC, NOT_FAC, dim, selId);
  return filters;
}
const has = (f, needle) => JSON.stringify(f).includes(JSON.stringify(needle));
const LO = ['<', ['get', 'eh'], 12], HI = ['>=', ['get', 'eh'], 12];

test('⑤ applyOfficial: 두 벽 층에 각자 높이 조건이 걸리고, 흐리게 켬이면 둘 다 시설 건물만, 고른 건물은 둘 다에서 빠진다', () => {
  const off = run(false, null);
  assert.ok(has(off['official-3d'], LO) && !has(off['official-3d'], HI), 'official-3d 는 12 m 미만');
  assert.ok(has(off['official-3d-tex'], HI) && !has(off['official-3d-tex'], LO), 'official-3d-tex 는 12 m 이상');
  for (const id of ['official-3d', 'official-3d-tex']) assert.ok(!has(off[id], ['has', 'fc']), `${id} 흐리게 끔: 시설 거름 없음`);
  const on = run(true, null);
  for (const id of ['official-3d', 'official-3d-tex']) assert.ok(has(on[id], ['has', 'fc']), `${id} 흐리게 켬: 시설 건물만`);
  const sel = run(false, 3);
  for (const id of ['official-3d', 'official-3d-tex']) assert.ok(has(sel[id], ['!=', ['get', 'i'], 3]), `${id} 고른 건물 제외`);
});

test('⑥ 클릭 후보·포인터 대상·쌓기 연출 ③ 단계에 official-3d-tex 가 있다', () => {
  assert.match(app, /pick\(\['official-3d', 'official-3d-tex', 'official-roof', 'official-far'\]\)/);
  assert.match(app, /const OFFICIAL_LAYERS = \['official-far', 'official-3d', 'official-3d-tex', 'official-roof'\];/);
  assert.match(app, /\['official-flat', 'official-flat-line', 'official-outline', 'official-ao', 'official-shadow', 'official-far', 'official-3d', 'official-3d-tex', 'official-roof'\],\s+\/\/ ③ 기존 건물/);
});
