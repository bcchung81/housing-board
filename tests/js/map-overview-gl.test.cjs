'use strict';
/* /map 수도권 개요의 진짜 3D(2026-10-18 사용자 결정 — 공용 모듈 assets/js/map3d-gl.js · MapGL, /citizen 과 같은 구현).
   ① 분기: WebGL·모듈 주소가 있으면 MapGL 경로, ?gl=0·WebGL 없음·불러오기 실패면 SVG 판(Map3D.draw) ② 시도 고르기 → flyTo(시도), 풀기 → flyTo(null), ?sido= 는 처음부터 그 시도
   ③ 지표 전환 = 색 단계(setClasses)·색(setColors)만 — 다시 붙이거나 값(높이)·source 를 다시 만들지 않는다 ④ 섬(강화·옹진) 면 제외 65 · 맥락 면 13 ⑤ 스타일 외부 요청 0(맥락 층 포함)
   ⑥ 공용 모듈 확장(맥락 면 층·setClasses)은 하위 호환 — 맥락을 주지 않으면 예전과 같은 층. 화면 사진은 찍지 않는다(가짜 DOM·가짜 MapGL 로 개요 모듈 mount 를 돌린다). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const O = require('../../lib/board/metro-overview.ts');
const V = require('../../lib/board/projects-view.ts');
const J = require('../../assets/js/overview.js');
const GLM = require('../../assets/js/map3d-gl.js');
const MAP = require('../../data/board/ledger-map.json');
const IDX = require('../../data/board/projects-index.json');
const CAL = require('../../data/board/region-calendar.json');
const RM = require('../../data/board/region-map.json');
const KS = require('../../data/board/korea-sido.json');

const rows = V.rowsOf(MAP.bySgg, IDX.projects, IDX.sgg);
const DOC = { ...O.metroOverview(RM, { rows, sggNames: IDX.sgg, calendar: CAL, referenceDate: MAP.referenceDate }), nation: { view: KS.view, sido: KS.sido.map((x) => ({ s: x.s, n: x.n, d: x.d, l: x.l })) } };

/* ---------- 가짜 DOM: 개요 mount 가 만지는 만큼만 ---------- */
function fakeEl(tag) {
  const L = {}, A = {};
  const e = {
    tagName: tag || 'div', style: {}, dataset: {}, children: [], hidden: false, innerHTML: '', textContent: '', title: '', tabIndex: 0, className: '',
    clientWidth: 1000, clientHeight: 700, offsetTop: 0, offsetHeight: 20, offsetWidth: 160, parentNode: null,
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, on) { if (on) this._s.add(c); else this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    setAttribute(k, v) { A[k] = String(v); }, getAttribute(k) { return k in A ? A[k] : null; }, removeAttribute(k) { delete A[k]; },
    addEventListener(t, f) { (L[t] = L[t] || []).push(f); }, fire(t, ev) { (L[t] || []).forEach((f) => f(ev)); },
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; }, contains() { return false; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 180, bottom: 700, width: 1000, height: 700 }; },
    prepend(c) { this.children.unshift(c); }, appendChild(c) { this.children.push(c); if (c.tagName === 'script' && e.onScript) e.onScript(c); }, remove() {}, focus() {},
  };
  return e;
}
function fakePage(search, o = {}) {
  const els = {}, $ = (id) => (els[id] = els[id] || fakeEl());
  $('ov').dataset.gl = o.glSrc === undefined ? '/assets/js/map3d-gl.js' : o.glSrc;
  $('ov').dataset.maplibre = J.MAPLIBRE;
  $('ovLegend').parentNode = fakeEl();
  const svg = fakeEl('svg'); $('ovStage').querySelector = (q) => (q === 'svg.map' ? svg : null);
  svg.querySelector = (q) => (q === '.lbls' ? (svg.lbls = svg.lbls || fakeEl('g')) : null);
  const html = fakeEl('html'); html.setAttribute('data-aud', 'admin');
  const head = fakeEl('head');
  const doc = { getElementById: $, documentElement: html, head, activeElement: null, createElement: (t) => fakeEl(t), addEventListener() {} };
  const calls = [], log = (k, ...a) => calls.push([k, ...a]);
  const Map3D = { prep: (x) => x, geom: () => ({}), draw: () => { log('svg-draw'); return { F: [] }; }, labels: () => log('svg-labels'), recolor: () => log('svg-recolor'), paintFaces() {}, keyMove: () => null };
  let handlers = {};
  const glMap = {
    ready: false, el: null, map: { on() {} },
    on(t, f) { (handlers[t] = handlers[t] || []).push(f); return this; },
    setSize: () => false, setValues: (v, c, opt) => log('setValues', opt), setClasses: (c) => log('setClasses', c), setColors: () => log('setColors'),
    flyTo(t, opt) { log('flyTo', t, opt && opt.duration); const moved = t !== this.target; this.target = t; return moved; },
    select: (c) => log('select', c), hover() {}, overlay: () => log('overlay'), labels: (g, us, opt) => log('labels', us.length, opt.strict), faces: () => [], destroy: () => log('destroy'),
  };
  const MapGL = {
    supported: () => o.webgl !== false,
    load: () => (o.loadFail ? Promise.reject(new Error('x')) : Promise.resolve({})),
    readColors: () => ({ k: html.getAttribute('data-ov-metric') }),
    mount(el, opt) { log('mount', opt); glMap.el = el; glMap.target = opt.target; return glMap; },
  };
  const win = {
    OVERVIEW: DOC, Map3D, MapGL, location: { search }, history: { replaceState(_, __, u) { log('url', u); } },
    matchMedia: () => ({ matches: false }), innerWidth: 1440, innerHeight: 900,
    setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {}, addEventListener() {},
  };
  const ready = () => { glMap.ready = true; (handlers.ready || []).forEach((f) => f()); };
  return { win, doc, $, svg, calls, glMap, ready, handlers: () => handlers, of: (k) => calls.filter((c) => c[0] === k) };
}
const tick = () => new Promise((r) => setImmediate(r));
const clickCard = (P, s) => P.$('ovCards').fire('click', { target: { closest: (q) => (q === 'button[data-s]' ? { dataset: { s } } : null) } });
const clickMetric = (P, m) => P.$('ovMetrics').fire('click', { target: { closest: (q) => (q === 'button[data-m]' ? { dataset: { m } } : null) } });

test('① 분기: 모듈 주소가 있고 WebGL 이면 MapGL 경로(SVG 판을 그리지 않는다), ?gl=0·WebGL 없음·maplibre 불러오기 실패·모듈 주소 없음이면 SVG 판(Map3D.draw)', async () => {
  assert.equal(J.glModeOf('', '/assets/js/map3d-gl.js'), 'load'); assert.equal(J.glModeOf('?gl=0', '/x.js'), 'svg'); assert.equal(J.glModeOf('?sido=28&gl=0', '/x.js'), 'svg'); assert.equal(J.glModeOf('', ''), 'svg'); assert.equal(J.glModeOf('', undefined), 'svg');
  const P = fakePage('');
  J.mount(P.win, P.doc);
  assert.equal(P.of('svg-draw').length, 0, '불러오는 동안 무대는 비워 둔다(SVG 판을 먼저 그리지 않는다)');
  await tick(); await tick();
  assert.equal(P.of('mount').length, 1, 'MapGL.mount 한 번');
  P.ready(); await tick();
  assert.equal(P.of('svg-draw').length, 0, 'GL 이면 SVG 판 없음');
  assert.equal(P.of('overlay').length, 1, '라벨 덮개 = 무대 svg');
  assert.equal(P.$('ovStage').getAttribute('role'), 'img');
  for (const [nm, search, o] of [['?gl=0', '?gl=0', {}], ['WebGL 없음', '', { webgl: false }], ['불러오기 실패', '', { loadFail: true }], ['모듈 주소 없음', '', { glSrc: '' }]]) {
    const Q = fakePage(search, o); J.mount(Q.win, Q.doc); await tick(); await tick();
    assert.equal(Q.of('mount').length, 0, nm); assert.ok(Q.of('svg-draw').length >= 1, `${nm} → SVG 판`); assert.equal(Q.$('ovStage').getAttribute('role'), 'listbox', `${nm}: SVG 판 무대 역할`);
  }
  /* 공용 모듈이 아직 없으면(운영 첫 방문) data-gl 주소를 script 로 부른 뒤 판정한다 */
  const R = fakePage(''); delete R.win.MapGL; let src = '';
  R.doc.head.onScript = (s) => { src = s.src; R.win.MapGL = { supported: () => false, load: () => Promise.resolve() }; s.onload(); };
  J.mount(R.win, R.doc); await tick(); await tick();
  assert.equal(src, '/assets/js/map3d-gl.js'); assert.ok(R.of('svg-draw').length >= 1, '부른 뒤 WebGL 없음 → SVG');
});

test('② 시도 확대·축소: 시도 카드 → flyTo(시도), 같은 카드 다시 → flyTo(null)(수도권 본토), 면 누름(수도권 보기) → 그 시도로, ?sido=28 은 처음부터 인천 — 지도는 한 번만 붙인다', async () => {
  const P = fakePage('');
  J.mount(P.win, P.doc); await tick(); await tick(); P.ready(); await tick();
  assert.equal(P.of('mount')[0][1].target, null, '첫 보기 = 수도권 본토');
  assert.deepEqual(P.of('flyTo').map((c) => c.slice(1)), [[null, 0]], '첫 그림은 움직임 없이');
  clickCard(P, '41');
  assert.deepEqual(P.of('flyTo').at(-1).slice(1), ['41', undefined], '경기로 날기(모듈 기본 900ms · 움직임 줄이기 0)');
  assert.deepEqual(P.of('url').at(-1), ['url', '/map?sido=41']);
  clickCard(P, '41');
  assert.deepEqual(P.of('flyTo').at(-1).slice(1), [null, undefined], '다시 누르면 수도권으로 축소');
  assert.deepEqual(P.of('url').at(-1), ['url', '/map']);
  P.handlers().pick[0]('11110', { originalEvent: { clientX: 10, clientY: 10 } });
  assert.deepEqual(P.of('flyTo').at(-1).slice(1), ['11', undefined], '수도권 보기에서 면 누름 → 그 시도로');
  P.$('ovBack').fire('click', {});
  assert.deepEqual(P.of('flyTo').at(-1).slice(1), [null, undefined], "'수도권 전체' 단추 → 축소");
  assert.equal(P.of('mount').length, 1, '지도 하나를 끝까지 쓴다'); assert.equal(P.of('destroy').length, 0);
  const I = fakePage('?sido=28');
  J.mount(I.win, I.doc); await tick(); await tick(); I.ready(); await tick();
  assert.equal(I.of('mount')[0][1].target, '28', '?sido=28 → 인천으로 붙인다'); assert.deepEqual(I.of('flyTo')[0].slice(1), ['28', 0]);
  assert.ok(!('omit' in I.of('mount')[0][1]), '섬은 모듈 기본(강화·옹진 제외) — 인천 확대도 섬 삽입 지도 없이 본토만');
  assert.equal(I.of('svg-draw').length, 0);
});

test('③ 지표 전환: 색 단계(setClasses)·색(setColors — 지연은 빨강 램프)·이름표만, 값(높이)·지도·source 는 다시 만들지 않는다', async () => {
  const P = fakePage('');
  J.mount(P.win, P.doc); await tick(); await tick(); P.ready(); await tick();
  const n0 = P.of('setValues').length, c0 = P.of('setColors').length;
  assert.equal(n0, 1, '높이(진행 호수)는 첫 그림에 한 번');
  clickMetric(P, 'd');
  assert.equal(P.doc.documentElement.getAttribute('data-ov-metric'), 'd');
  assert.equal(P.of('setValues').length, n0, '지표 전환은 setValues 없음(높이 그대로)');
  assert.equal(P.of('setClasses').length, 1); assert.equal(P.of('setColors').length, c0 + 1, '빨강 램프로 다시 칠하기');
  const cls = P.of('setClasses')[0][1], vals = DOC.units.map((u) => (u.v ? u.v.d : 0)), ups = J.breaksOf(vals);
  for (const u of DOC.units) assert.equal(cls[u.code], J.classOf(u.v ? u.v.d : 0, ups), u.name);
  clickMetric(P, 'a');
  assert.equal(P.of('setValues').length, n0); assert.equal(P.of('mount').length, 1); assert.equal(P.of('flyTo').length, 1, '카메라도 그대로');
  /* 소스 글: 지표 전환(paint)은 setValues·mount·flyTo·toGeoJSON 을 부르지 않는다 */
  const ov = read('assets/js/overview.js'), i = ov.indexOf('    function paint('), body = ov.slice(i, ov.indexOf('\n    }\n', i));
  assert.match(body, /GL\.map\.setClasses\(clsOf\(\)\)/); assert.doesNotMatch(body, /setValues|MapGL\.mount|flyTo|toGeoJSON|drawMap/);
});

test('④ 섬 면 제외·맥락 면: 개요가 넘기는 면은 섬(강화·옹진)을 뺀 본토 65면(값·순위에는 67곳 그대로), 맥락 면은 수도권 밖 13개 시도 — 고를 수 없는 평평한 층', async () => {
  const seeds = J.seedOf(DOC.units), fc = GLM.toGeoJSON(seeds);
  assert.equal(fc.features.length, 65); assert.ok(!fc.features.some((f) => J.ISLES.includes(f.properties.code)));
  assert.deepEqual(['11', '28', '41'].map((s) => fc.features.filter((f) => f.properties.s === s).length), [25, 9, 31]);
  assert.equal(J.rankOf(DOC.units, 'u', '28').length, 11, '인천 순위에는 강화·옹진이 있다(목록에서 고른다)');
  const ctx = J.glCtxOf(DOC.nation.sido);
  assert.equal(ctx.length, 13); assert.ok(ctx.every((c) => !J.SIDO.includes(c.code) && c.d));
  const cfc = GLM.ctxGeoJSON(ctx);
  assert.equal(cfc.features.length, 13); assert.ok(cfc.features.every((f) => f.geometry.type === 'MultiPolygon' && f.geometry.coordinates.length));
  const P = fakePage('');
  J.mount(P.win, P.doc); await tick(); await tick();
  const opt = P.of('mount')[0][1];
  assert.equal(opt.units.length, 67, '67곳을 넘기고 모듈이 섬을 뺀다'); assert.equal(opt.ctx.length, 13);
  assert.equal(GLM.toGeoJSON(opt.units).features.length, 65);
  /* 맥락 층은 고르기(queryRenderedFeatures 층 gl-ext·gl-flat) 밖 */
  assert.match(read('assets/js/map3d-gl.js'), /const LAYERS_Q = \['gl-ext', 'gl-flat'\];/);
});

test('⑤ 스타일 외부 요청 0: 맥락 층을 더해도 타일·글꼴·스프라이트·주소 없음, 층 = 배경 · 맥락 면 · 맥락 경계 · 판 그늘 · 평평한 면 · 경계 · 윤곽 · 솟은 면', () => {
  const cols = { face: Array(6).fill([1, 2, 3, 1]), lift: Array(6).fill([4, 5, 6, 1]), ce: Array(6).fill([7, 8, 9, 1]), line: [255, 255, 255, 1], sea: [0, 0, 0, .06], ctx: [9, 9, 9, 1], ctxLine: [8, 8, 8, 1] };
  const st = GLM.styleOf(GLM.toGeoJSON(J.seedOf(DOC.units)), cols, GLM.ctxGeoJSON(J.glCtxOf(DOC.nation.sido))), js = JSON.stringify(st);
  for (const k of ['glyphs', 'sprite', 'tiles', 'url']) assert.ok(!js.includes(`"${k}"`), k);
  assert.ok(!/https?:/.test(js), '주소 없음');
  assert.deepEqual(Object.keys(st.sources), ['sgg', 'ctx']); assert.equal(st.sources.ctx.type, 'geojson');
  assert.deepEqual(st.layers.map((l) => `${l.id}:${l.type}`), ['gl-bg:background', 'gl-ctx:fill', 'gl-ctx-line:line', 'gl-sea:fill', 'gl-flat:fill', 'gl-line:line', 'gl-hl:line', 'gl-ext:fill-extrusion']);
  assert.ok(!st.layers.some((l) => l.source === 'ctx' && l.type === 'fill-extrusion'), '맥락 면은 솟지 않는다');
  /* maplibre 는 상세 지도와 같은 로컬 주소(다시 받지 않게 — 같은 주소 = 브라우저 캐시) */
  assert.equal(J.MAPLIBRE, '/assets/vendor/maplibre-gl/5.24.0/maplibre-gl.js');
  assert.ok(read('components/MapIsland.tsx').includes(`'${J.MAPLIBRE}'`), '상세 지도 LIBS 와 같은 주소');
  const page = read('app/(map)/map/page.tsx');
  assert.match(page, /<div className="ov" id="ov" data-gl=\{glSrc\} data-maplibre=\{MAPLIBRE\}>/);
  assert.match(page, /const glSrc = scriptManifest\(\)\[MAP3D_GL_JS\] \|\| MAP3D_GL_JS;/, '해시 이름(장기 캐시) → 없으면 옛 이름');
  assert.match(page, /const MAP3D_GL_JS = '\/assets\/js\/map3d-gl\.js';/);
});

test('⑥ 공용 모듈 확장은 하위 호환: 맥락을 주지 않으면 예전 층·소스 그대로(/citizen), 색 읽기에 맥락 색이 더해지고 setColors 는 맥락 층이 있을 때만 칠한다', () => {
  const cols = { face: Array(6).fill([1, 2, 3, 1]), lift: Array(6).fill([4, 5, 6, 1]), ce: Array(6).fill([7, 8, 9, 1]), line: [255, 255, 255, 1], sea: [0, 0, 0, .06] };
  const st = GLM.styleOf(GLM.toGeoJSON(J.seedOf(DOC.units)), cols);
  assert.deepEqual(Object.keys(st.sources), ['sgg']);
  assert.deepEqual(st.layers.map((l) => l.id), ['gl-bg', 'gl-sea', 'gl-flat', 'gl-line', 'gl-hl', 'gl-ext']);
  assert.equal(GLM.ctxGeoJSON([]), null); assert.equal(GLM.ctxGeoJSON(undefined), null);
  const src = read('assets/js/map3d-gl.js');
  assert.match(src, /ctx: v\('--map-ctx'\), ctxLine: v\('--card'\)/, '맥락 색 = map3d.css .ctx 와 같은 토큰');
  assert.match(src, /if \(map\.getLayer\('gl-ctx'\)\)/);
  assert.match(src, /function setClasses\(cls\) \{ for \(const c of codes\) fs\(c, \{ c: \(cls && cls\[c\]\) \|\| 0 \}\); \}/, '색 단계만 = feature-state c');
  assert.doesNotMatch(read('tools/design/public-mock/template.html'), /MapGL\.mount\([^\n]*ctx:|\.setClasses\(/, '/citizen 은 확장을 쓰지 않는다(그대로)');
});
