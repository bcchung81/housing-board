'use strict';
/* /citizen '현 위치' 전국 판정(2026-10-18): 판정 순서(region-map → 전국 경계) · 틈 보완(둘레 150m 다수결) · 사업 없는 시군구 · 실패 문구 · 좌표를 보내는 fetch 없음.
   템플릿에서 함수(areaAtLonLat·findCode·areaFromGeo·locateCode)를 떼어 실제 자료·경계 파일로 돌린다. 화면 사진은 찍지 않는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const TPL = fs.readFileSync(path.join(ROOT, 'tools', 'design', 'public-mock', 'template.html'), 'utf8');
const BUILT = fs.readFileSync(path.join(ROOT, 'docs', 'design', '대국민-모드-시안.html'), 'utf8');
const OPS = fs.readFileSync(path.join(ROOT, 'assets', 'citizen', 'index.html'), 'utf8');
const SggLocate = require('../../assets/js/sgg-locate.js');
const GEO = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'geo', 'korea-sgg.json'), 'utf8'));
const code = [...BUILT.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((c) => c.includes('function makeSearch'));
const ctx = { SggLocate }; vm.createContext(ctx);
vm.runInContext(code + '\nObject.assign(this, { D, makeSearch, ringsOf: Map3D.ringsOf, inRing: Map3D.inRing });', ctx);
const IX = ctx.makeSearch(ctx.D);
const fnBody = (name, kw = 'function') => { const i = TPL.indexOf(`${kw} ${name}(`); assert.ok(i >= 0, name); return TPL.slice(i, TPL.indexOf('\n}\n', i) + 2); };
const MAPU = ctx.D.map.units.map(([c, s, n, d]) => ({ code: c, s, n, d }));
const mk = (data) => new Function('IX', 'MAPU', 'ringsOf', 'inRing', 'SggLocate', `const GEO_URL = 'x'; const areaOf = (c) => IX.regionOf[c];
${fnBody('areaAtLonLat')}${fnBody('findCode')}${fnBody('areaFromGeo')}${fnBody('locateCode', 'async function')}
SggLocate = { ...SggLocate, load: async () => ${data === null ? 'null' : 'DATA'} };
return { locateCode, findCode, areaFromGeo };`
.replace('const GEO_URL', `const DATA = arguments[5]; const GEO_URL`));
const make = (data) => mk(data)(IX, MAPU, ctx.ringsOf, ctx.inRing, SggLocate, GEO);

test('판정 순서: 서울시청은 region-map(11140), 대전시청은 전국 경계(30170)', async () => {
  const L = make(GEO);
  assert.deepEqual(await L.locateCode(126.978, 37.5665), { code: '11140' });
  assert.deepEqual(await L.locateCode(127.3845, 36.3504), { code: '30170' });
});

test('수도권이면 경계 자료를 받지 않는다', async () => {
  let loads = 0;
  const L = new Function('IX', 'MAPU', 'ringsOf', 'inRing', 'SggLocate', `const GEO_URL = 'x'; const areaOf = (c) => IX.regionOf[c];
${fnBody('areaAtLonLat')}${fnBody('findCode')}${fnBody('areaFromGeo')}${fnBody('locateCode', 'async function')} return { locateCode };`)(IX, MAPU, ctx.ringsOf, ctx.inRing, { load: async () => { loads++; return GEO; }, locate: SggLocate.locate });
  await L.locateCode(126.978, 37.5665);
  assert.equal(loads, 0);
  await L.locateCode(127.3845, 36.3504);
  assert.equal(loads, 1);
});

test('사업 없는 시군구(단양군청)는 경계 자료 이름으로 0 항목을 만든다', async () => {
  assert.equal(IX.regionOf['43800'], undefined);
  const L = make(GEO);
  assert.deepEqual(await L.locateCode(128.3655, 36.9845), { code: '43800' });
  const r = IX.regionOf['43800'];
  assert.equal(r.label, '단양군'); assert.equal(r.kind, 'sgg'); assert.deepEqual(r.codes, ['43800']); assert.equal(r.units, 0);
  assert.equal(ctx.D.prj['43800'], undefined);
});

test('바다(125.0, 35.0)는 실패, 자료를 못 받으면 구분된 실패', async () => {
  assert.deepEqual(await make(GEO).locateCode(125.0, 35.0), { code: null, fail: 'nogeo' });
  assert.deepEqual(await make(null).locateCode(127.3845, 36.3504), { code: null, fail: 'nofile' });
});

test('경계 틈 보완: 한 점이 비면 둘레 150m 다수결, 그래도 없으면 null', () => {
  const { findCode } = make(GEO);
  const at = (lo, la) => (lo > 127.0005 ? 'B' : lo > 127.0 && la > 36.0 ? 'A' : null);   // 중심(127.0, 36.0)은 비어 있고 동쪽 이웃 B 가 더 많이 걸린다
  assert.equal(findCode(127.0, 36.0, at), 'B');
  assert.equal(findCode(127.0, 36.0, () => null), null);
  assert.equal(findCode(127.0, 36.0, (lo) => (lo === 127.0 ? 'C' : null)), 'C', '중심이 맞으면 그대로');
  const real = (lo, la) => SggLocate.locate(GEO, lo, la);
  const c = findCode(127.3845, 36.3504, real);
  assert.equal(c, '30170');
});

test('실패 문구와 출처 표기, 좌표를 보내는 fetch 없음', () => {
  assert.match(TPL, /위치로 시군구를 찾지 못했어요/); assert.match(TPL, /경계 자료를 불러오지 못했어요/);
  const loc = fnBody('renderLoc');
  assert.ok(!/경계 준비 중/.test(loc.slice(loc.indexOf("'nogeo'"), loc.indexOf("'denied'"))));
  assert.match(OPS, /행정구역 경계: 국토교통부 V-World 행정구역 시군구\(공공누리 제1유형\), 2026-10-18 기준/);
  const block = TPL.slice(TPL.indexOf('const GEO_URL'), TPL.indexOf('/* 보기 대상 스위치'));
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon/.test(block), '판정 구간에 fetch 없음');
  assert.ok(OPS.includes('SggLocate') && !OPS.includes('/*__SGGLOCATE__*/'));
});
