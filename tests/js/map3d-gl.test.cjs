'use strict';
/* 진짜 3D 지도(assets/js/map3d-gl.js — MapLibre GL fill-extrusion, WebGL 없으면 SVG 대체) 공용 모듈의 순수 부분과 /citizen 연결(원본 template.html 글)을 시험한다. 화면 사진은 찍지 않는다.
   ① 투영 역변환 왕복 ② 섬 제외 본토 65면·GeoJSON 고리 ③ 높이 순위 = 값 순위(G15)·0호 0·확대해도 같은 화면 높이 ④ 시도·수도권 상자·카메라 한도 ⑤ 움직임 줄이기 → 0
   ⑥ 스타일 외부 요청 0 ⑦ 고르기·가리키기는 feature-state 만(G16) ⑧ 이름표 자리 규칙 ⑨ WebGL 없음·불러오기 실패 → SVG 대체 경로 ⑩ 빌드 결과가 maplibre 를 동적으로 부른다
   ⑪ 보는 시도(2026-10-19): 시도 경계선 순수 함수 · 밖 면(out) 식 · 옵션이 없으면 예전 식·층 그대로(/map 개요) · setScope 는 feature-state·필터만
   ⑭ 시군구 경계 띠(2026-10-19): 띠 기하(안쪽·폭·변 수) · 확대 단계 벌 두께 · 맨 위 층·식 · 가짜 maplibre 로 mount(필터·feature-state 동기화, 벌은 카메라만) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'assets', 'js', 'map3d-gl.js'));
const M3 = require(path.join(ROOT, 'assets', 'js', 'map3d.js'));
const SRC = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'map3d-gl.js'), 'utf8');
const TPL = fs.readFileSync(path.join(ROOT, 'tools', 'design', 'public-mock', 'template.html'), 'utf8');
const BUILT = fs.readFileSync(path.join(ROOT, 'docs', 'design', '대국민-모드-시안.html'), 'utf8');
const OPS = fs.readFileSync(path.join(ROOT, 'assets', 'citizen', 'index.html'), 'utf8');
const code = [...BUILT.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((c) => c.includes('function makeSearch'));
const ctx = {}; vm.createContext(ctx);
vm.runInContext(code + '\nObject.assign(this, { D, MapGLin: MapGL });', ctx);
const UNITS = ctx.D.map.units.map(([code, s, n, d, , , lx, ly]) => ({ code, s, n, d, lx, ly }));
/* 함수 글: 그 줄의 들여쓰기와 같은 들여쓰기의 닫는 괄호까지 */
const fnBody = (src, name) => { const i = src.indexOf(`function ${name}(`); assert.ok(i >= 0, name); const ind = src.slice(src.lastIndexOf('\n', i) + 1, i); return src.slice(i, src.indexOf(`\n${ind}}\n`, i)); };
const tplBody = (name) => { const i = TPL.indexOf(`function ${name}(`); assert.ok(i >= 0, name); return TPL.slice(i, TPL.indexOf('\n}\n', i)); };

test('① 투영 역변환: region-map 투영 정수 ↔ 경위도 왕복 오차 0.001 단위 이하, 종로구 라벨 점은 서울 도심(경도 126.9~127.1 · 위도 37.5~37.7)', () => {
  for (const u of UNITS) for (const p of M3.ringsOf(u.d)[0].slice(0, 40)) {
    const q = G.fromLngLat(G.toLngLat(p));
    assert.ok(Math.abs(q[0] - p[0]) < 1e-3 && Math.abs(q[1] - p[1]) < 1e-3, `${u.n} ${p}`);
  }
  const jongno = UNITS.find((u) => u.code === '11110'), [lng, lat] = G.toLngLat([jongno.lx, jongno.ly]);
  assert.ok(lng > 126.9 && lng < 127.1 && lat > 37.5 && lat < 37.7, `${lng}, ${lat}`);
  assert.deepEqual(G.ISLES, ['28710', '28720']);
});

test('② GeoJSON: 섬(강화·옹진)을 뺀 수도권 본토 65면(서울 25·인천 9·경기 31), 고리는 닫히고 바깥 반시계·구멍 시계, 다듬은 공유 호라 이웃이 같은 꼭짓점을 쓴다', () => {
  const fc = G.toGeoJSON(UNITS);
  assert.equal(UNITS.length, 67);
  assert.equal(fc.features.length, 65);
  assert.ok(!fc.features.some((f) => G.ISLES.includes(f.properties.code)), '섬 없음');
  assert.deepEqual(['11', '28', '41'].map((s) => fc.features.filter((f) => f.properties.s === s).length), [25, 9, 31]);
  const area = (r) => r.slice(0, -1).reduce((a, p, i) => { const q = r[i + 1]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
  for (const f of fc.features) {
    assert.equal(f.geometry.type, 'MultiPolygon');
    for (const poly of f.geometry.coordinates) poly.forEach((r, i) => {
      assert.ok(r.length >= 4, f.properties.n); assert.deepEqual(r[0], r[r.length - 1], '닫힌 고리');
      assert.ok(i === 0 ? area(r) > 0 : area(r) < 0, `${f.properties.n} 고리 ${i} 방향`);
    });
  }
  /* 이웃(종로구·중구)이 같은 다듬은 점을 함께 쓴다(공유 호 — 틈·겹침 없음) */
  const pts = (c) => new Set(fc.features.find((f) => f.properties.code === c).geometry.coordinates.flat(2).map((p) => p.join()));
  const a = pts('11110'), b = pts('11140'); let n = 0; for (const p of a) if (b.has(p)) n++;
  assert.ok(n >= 10, `공유 점 ${n}`);
  assert.equal(G.toGeoJSON(UNITS, { omit: [] }).features.length, 67, 'omit 를 비우면 67면');
});

test('③ 높이: 값 순위 = 높이 순위(G15), 같은 값 = 같은 높이, 0호 = 0(평평), 최솟값 4px·최댓값 Hmax(umax 고정이면 넘는 값은 멈춤) — Map3D.faceH 와 같은 척도, 확대해도 같은 화면 높이(미터는 확대 1단계마다 절반)', () => {
  const vals = { a: 0, b: 10, c: 10, d: 300, e: 4000, f: 9000 }, h = G.heightOf(vals, { hmax: 40 });
  assert.equal(h.a, 0); assert.equal(h.b, h.c); assert.ok(h.b > 0 && h.b < h.d && h.d < h.e && h.e < h.f); assert.equal(h.f, 40);
  const ks = Object.keys(vals), byV = ks.slice().sort((x, y) => vals[x] - vals[y]), byH = ks.slice().sort((x, y) => h[x] - h[y] || vals[x] - vals[y]);
  assert.deepEqual(byH, byV);
  const us = ks.map((k) => vals[k]); assert.deepEqual(ks.map((k) => +h[k].toFixed(9)), M3.faceH(us, 4, 40).map((v) => +v.toFixed(9)), 'Map3D.faceH 와 같은 값');
  const fixed = G.heightOf({ x: 20000, y: 4500 }, { umax: 9000, hmax: 40 }); assert.equal(fixed.x, 40, 'umax 고정: 넘는 값은 Hmax'); assert.ok(Math.abs(fixed.y - (4 + 36 * Math.pow(.5, .75))) < 1e-9, 'umax 고정 배율');
  assert.deepEqual(G.heightOf({ x: 5 }, { codes: ['x', 'y'] }), { x: 32, y: 0 }, '값 없는 코드는 0');
  assert.deepEqual([600, 1000, 300].map(G.hmaxFor), [48, 48, 24]); assert.equal(G.hmaxFor(100), 16);
  /* 확대 단계 z 의 1px = mPerPx(z) 미터, z+1 은 절반 → 화면 높이 일정. 식은 zoom 지수 0.5 보간(두 끝값이 같은 비율) */
  assert.ok(Math.abs(G.mPerPx(9) / G.mPerPx(10) - 2) < 1e-12);
  const e = G.heightExpr(); assert.equal(e[0], 'interpolate'); assert.deepEqual(e[1], ['exponential', .5]); assert.deepEqual(e[2], ['zoom']);
  assert.ok(Math.abs(e[4][2] / e[6][2] - Math.pow(2, e[5] - e[3])) < 1e-6, '두 끝 미터 비 = 2^(z1 − z0)');
  assert.match(JSON.stringify(e), /"feature-state","h"/); assert.match(JSON.stringify(e), /"feature-state","sel"/);
  assert.deepEqual(G.LIFT, { sel: 5, hv: 2 }, '고른 곳 5px · 가리킨 곳 2px(SVG 판과 같다)');
});

test('④ 상자·카메라: 수도권 본토 상자(섬 제외)는 서울·인천·경기 상자를 모두 담고 강화·옹진은 밖, 위에서 본 맞춤 확대 단계는 상자가 무대를 넘지 않는 값, 한도 = 60% 넓힌 상자 · −0.8~+3 · 기울기 0~60', () => {
  const cap = G.boundsOf(UNITS, null), sd = Object.fromEntries(['11', '28', '41'].map((s) => [s, G.boundsOf(UNITS, s)]));
  for (const s of ['11', '41']) { const b = sd[s]; assert.ok(b[0][0] >= cap[0][0] && b[0][1] >= cap[0][1] && b[1][0] <= cap[1][0] && b[1][1] <= cap[1][1], s); }
  const ganghwa = G.boundsOf(UNITS, ['28710'], { omit: [] }); assert.ok(ganghwa[0][0] < cap[0][0], '강화 서쪽 끝은 본토 상자 밖');
  assert.equal(G.boundsOf(UNITS, ['28710']), null, '섬은 기본으로 빠진다');
  assert.ok(sd['11'][1][0] - sd['11'][0][0] < cap[1][0] - cap[0][0], '서울 상자 < 수도권 상자');
  const stage = { W: 1000, H: 660 }, pad = { top: 60, right: 12, bottom: 14, left: 12 }, cz = G.cameraFor(cap, stage, { padding: pad }), sz = G.cameraFor(sd['11'], stage, { padding: pad });
  assert.ok(cz.zoom > 7 && cz.zoom < 10, `수도권 확대 ${cz.zoom}`); assert.ok(sz.zoom > cz.zoom + 1, `서울은 더 크게 ${sz.zoom}`);
  const mx = (lng) => (lng + 180) / 360 * 512 * Math.pow(2, cz.zoom), my = (lat) => { const s = Math.sin(lat * Math.PI / 180); return (.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 512 * Math.pow(2, cz.zoom); };
  const w = mx(cap[1][0]) - mx(cap[0][0]), h = my(cap[0][1]) - my(cap[1][1]);
  assert.ok(w <= stage.W - 24 + 1e-6 && h <= stage.H - 74 + 1e-6 && (Math.abs(w - (stage.W - 24)) < 1e-6 || Math.abs(h - (stage.H - 74)) < 1e-6), '한 변이 무대에 꼭 맞는다');
  const rot = G.cameraFor(cap, stage, { padding: pad, bearing: -10 }); assert.ok(rot.zoom < cz.zoom, '돌리면 상자가 넓어져 조금 작게');
  const L = G.limitsFor(cap, cz.zoom);
  assert.equal(L.minZoom, cz.zoom - .8); assert.equal(L.maxZoom, cz.zoom + 3); assert.equal(L.minPitch, 0); assert.equal(L.maxPitch, 60);
  assert.ok(L.maxBounds[0][0] < cap[0][0] && L.maxBounds[1][1] > cap[1][1]);
  assert.deepEqual([G.CAM.pitch, G.CAM.bearing, G.CAM.fly], [45, -10, 900], '첫 보기 기울기 45°·방향 −10°, 시도로 날기 900ms');
});

test('⑤ 움직임 줄이기 → 날기·돌리기·높이 움직임 길이 0, 아니면 그대로(엔진은 Map3D.reducedMotion 과 같은 판정)', () => {
  const win = (reduce) => ({ matchMedia: (q) => ({ matches: reduce && /reduce/.test(q) }) });
  assert.equal(G.durationOf(900, win(true)), 0); assert.equal(G.durationOf(900, win(false)), 900); assert.equal(G.durationOf(700, null), 700);
  for (const nm of ['setValues', 'flyTo']) assert.match(fnBody(SRC, nm), /durationOf\(/, nm + ' 는 durationOf 를 거친다');
  assert.match(SRC, /const rotateBy = \(d\) => map\.easeTo\(\{ bearing: map\.getBearing\(\) - d, duration: durationOf\(CAM\.turn, win\) \}\);/);
});

test('⑥ 스타일 = 외부 요청 0: 배경(투명) + 시군구 GeoJSON 하나, 타일·글꼴(glyphs)·스프라이트·주소 없음 · 0호는 평평한 면 + 경계선, 값 있는 면만 fill-extrusion(빛 하나, 세로 명암)', () => {
  const cols = { face: Array(6).fill([1, 2, 3, 1]), lift: Array(6).fill([4, 5, 6, 1]), ce: Array(6).fill([7, 8, 9, 1]), line: [255, 255, 255, 1], sea: [0, 0, 0, .06] };
  const st = G.styleOf(G.toGeoJSON(UNITS), cols), js = JSON.stringify(st);
  assert.equal(st.version, 8);
  for (const k of ['glyphs', 'sprite', 'tiles', 'url', 'http']) assert.ok(!js.includes(`"${k}"`) && !js.includes(`${k}:`), k);
  assert.deepEqual(Object.keys(st.sources), ['sgg', 'rim']); assert.equal(st.sources.sgg.type, 'geojson'); assert.equal(st.sources.sgg.promoteId, 'code');
  assert.deepEqual(st.layers.map((l) => `${l.id}:${l.type}`), ['gl-bg:background', 'gl-sea:fill', 'gl-flat:fill', 'gl-line:line', 'gl-hl:line', 'gl-ext:fill-extrusion', 'gl-rim:fill-extrusion']);
  assert.ok(!st.layers.some((l) => l.type === 'symbol'), '글자 층 없음(라벨은 덮개)');
  const ext = st.layers.find((l) => l.id === 'gl-ext');
  assert.deepEqual(ext.filter, ['in', ['get', 'code'], ['literal', []]], '처음엔 솟은 면 없음(값을 넣을 때 필터)');
  assert.equal(ext.paint['fill-extrusion-vertical-gradient'], true); assert.ok(st.light && st.light.anchor === 'viewport');
  assert.deepEqual(st.layers[0].paint['background-color'], ['rgba', 0, 0, 0, 0], '바탕 지도 없음(투명 배경)');
  /* 색 = feature-state c(0~5) → 토큰 색, 고른 곳·가리킨 곳은 밝은 윗면 */
  assert.match(JSON.stringify(G.colorExpr(cols)), /^\["case",\["any",\["boolean",\["feature-state","sel"\],false\],\["boolean",\["feature-state","hv"\],false\]\],\["match",\["coalesce",\["feature-state","c"\],0\],0,/);
  /* 모듈 글에도 외부 주소·글꼴 요청이 없다(maplibre 는 부르는 쪽이 넘긴 로컬 경로만) */
  const urls = SRC.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, '').match(/https?:\/\/\S+/g); assert.equal(urls, null, 'SVG 이름공간 밖 주소 없음');
  assert.ok(!/glyphs\s*:|sprite\s*:/.test(SRC), 'glyphs·sprite 없음');
});

test('⑦ 고르기·가리키기(G16): select·hover 는 feature-state 만 — source·스타일·필터·데이터를 다시 만들지 않는다. 값 바꾸기만 필터를 바꾼다', () => {
  for (const nm of ['select', 'hover']) {
    const b = fnBody(SRC, nm);
    assert.match(b, /fs\(/, nm);
    assert.doesNotMatch(b, /setData|syncRim|rimGeoJSON|addSource|removeSource|setStyle|setFilter|setExt|addLayer|toGeoJSON|labels\(/, nm);
  }
  assert.match(fnBody(SRC, 'setValues'), /setExt\(/, '솟은 면 필터는 값이 바뀔 때만');
  assert.equal((SRC.match(/toGeoJSON\(o\.units/g) || []).length, 1, 'GeoJSON 은 붙일 때 한 번');
  /* 데이터를 다시 넣는 곳은 경계 띠 벌 바꾸기(확대 단계 — 카메라) 하나뿐(2026-10-19). 면 GeoJSON 은 다시 넣지 않는다 */
  assert.equal((SRC.match(/setData\(/g) || []).length, 1, 'setData 는 한 곳'); assert.match(fnBody(SRC, 'syncRim'), /map\.getSource\('rim'\)\.setData\(/);
  for (const nm of ['setValues', 'setClasses', 'setScope', 'setBand']) assert.doesNotMatch(fnBody(SRC, nm), /syncRim|rimGeoJSON|setData/, nm + ' 는 띠 벌을 바꾸지 않는다');
});

test('⑧ 이름표 자리: 값 큰 순·내 동네 먼저, 반드시 보일 곳(상위 5·보는 곳·내 동네)은 겹쳐도 남고, 그 밖은 겹치면 이름만 → 생략, 면 밖은 옅은 바탕, 무대 밖 라벨 점은 놓지 않는다', () => {
  const wOf = (t, size) => t.length * size * .6;
  const mk = (key, ax, ay, u, ri, must) => ({ key, ax, ay, nm: key, v: u ? M3.labelNum(u) : '', u, c: 2, ri, must });
  const C = [mk('A', 100, 100, 9000, 0, true), mk('B', 104, 104, 8000, 1, true), mk('C', 108, 100, 100, 12, false), mk('D', 400, 300, 50, 13, false), mk('E', 2000, 100, 40, 14, true), mk('F', 300, 100, 0, 15, false)];
  const out = G.placeLabels(C, { W: 800, H: 600, wOf, inFace: (k) => k !== 'D' });
  const by = Object.fromEntries(out.map((p) => [p.key, p]));
  assert.ok(by.A && !by.A.pill && by.A.v === '9,000', 'A 면 안 두 줄'); assert.ok(by.B && by.B.pill, 'B 반드시 — 옅은 바탕');
  assert.ok(!by.C, 'C 겹침 → 생략'); assert.ok(by.D && by.D.pill && by.D.v === '', 'D 면 밖 → 옅은 바탕 이름 한 줄');
  assert.ok(!by.E, '무대 밖'); assert.ok(by.F && by.F.zero && by.F.v === '' && by.F.h === 19, '0호는 이름만');
  const nar = G.placeLabels(C, { W: 800, H: 600, narrow: true, wOf, inFace: () => true });
  assert.deepEqual(nar.map((p) => p.key), ['A', 'B'], '휴대폰: 반드시 보일 곳·상위 5만');
  /* 마크업은 SVG 판 라벨과 같은 클래스(map3d.css 가 칠한다), 지시선 없음 */
  const lb = fnBody(SRC, 'labels');
  assert.match(lb, /class="lb-g\$\{p\.zero \? ' z' : ''\}\$\{p\.pill \? ' pl' : ''\}" data-area=/); assert.match(lb, /class="lb nm f\$\{p\.c\}"/);
  assert.doesNotMatch(lb, /<line|<polyline|leader/);
  assert.match(lb, /x\.key === opt\.homeKey \|\| x\.key === opt\.viewKey/, '보는 곳·내 동네는 반드시');
});

test('⑨ WebGL 없음·maplibre 불러오기 실패·맥락 잃음·?gl=0 → SVG 대체 경로(Map3D.draw 그대로), WebGL 이면 SVG 를 그리지 않고 maplibre 를 판정 뒤에만 동적으로 부른다', () => {
  assert.equal(G.supported({ createElement: () => ({ getContext: () => null }) }), false, '맥락 없음');
  assert.equal(G.supported({ createElement: () => { throw new Error('x'); } }), false, '예외');
  let lost = 0; assert.equal(G.supported({ createElement: () => ({ getContext: (k) => (k === 'webgl' ? { getExtension: () => ({ loseContext: () => lost++ }) } : null) }) }), true); assert.equal(lost, 1, '판정 맥락은 바로 놓는다');
  assert.match(TPL, /const GLS = \{ mode: new URLSearchParams\(location\.search\)\.get\('gl'\) === '0' \|\| !MapGL\.supported\(document\) \? 'svg' : 'load'/);
  assert.match(TPL, /MapGL\.load\(MAPLIBRE_SRC, document\)\.then\(\(\) => \{ GLS\.mode = 'gl';[^\n]*\}, \(\) => glFallback\(\)\);/, '불러오기 실패 → SVG');
  const dm = tplBody('drawMap');
  assert.ok(dm.indexOf("if (GLS.mode !== 'svg') { glDraw(force, W, H, narrow); return; }") > 0 && dm.indexOf("if (GLS.mode !== 'svg')") < dm.indexOf('Map3D.draw('), 'WebGL 이면 SVG 를 그리기 전에 GL 로');
  assert.match(tplBody('glFallback'), /GLS\.mode = 'svg';/); assert.match(tplBody('glMount'), /\.on\('lost', glFallback\)/); assert.match(tplBody('glMount'), /catch \(_\) \{[^}]*glFallback\(\)/);
  assert.match(tplBody('renderMapCard'), /if \(cap && GLS\.mode === 'svg'\) VIEW\.detach = Map3D\.attachOrbit\(/, 'SVG 대체 경로만 끌기 돌리기를 붙인다');
});

test('⑩ /citizen 연결: 시도를 고르면 그 시도로 날고(보는 곳 → camSido), 고른 곳이 없으면 수도권 본토 · 색·높이는 판 하나(VIEW.all·VIEW.umax) · 지도 칸 role=img · 테마·단계 램프 다시 칠하기 · 빌드 결과는 maplibre 를 동적으로', () => {
  assert.match(TPL, /const camSido = \(\) => \{ const c = S\.view \|\| S\.home, r = c && areaOf\(c\); return r && CAPITAL\.includes\(sidoOf\(r\)\) \? sidoOf\(r\) : null; \};/);
  assert.match(tplBody('glDraw'), /GLS\.map\.flyTo\(camSido\(\)/); assert.match(tplBody('renderMapCard'), /if \(cap && glOn\(\)\) \{ GLS\.map\.setScope\(camSido\(\)\); GLS\.map\.flyTo\(camSido\(\)\); \}/, '같은 시도 안 고르기도 범위(와 보는 시도 — 2026-10-19)를 맞춘다');
  assert.match(tplBody('glDraw'), /GLS\.map\.setValues\(VIEW\.mvals, glCls\(\), \{ umax: VIEW\.umax, duration: 0 \}\)/);
  assert.match(tplBody('applyMode'), /GLS\.map\.setValues\(md\.vals, glCls\(\), \{ umax: md\.umax, duration: 700,/, '모드 바꾸기 = 같은 배율로 700ms');
  assert.match(tplBody('startRise'), /glOn\(\) \? GLS\.map\.setValues\(VIEW\.mvals, glCls\(\), opt\) : Map3D\.animateHeights\(svg, VIEW\.G, VIEW\.mvals, opt\)/, '첫 솟음 = 같은 계획');
  assert.match(tplBody('glDraw'), /box\.setAttribute\('role', 'img'\); box\.setAttribute\('aria-label', '수도권 시군구 지도'\);/);
  assert.match(tplBody('paintRings'), /if \(GLS\.mode !== 'svg'\) \{ if \(glOn\(\)\) \{ GLS\.map\.select\(VIEW\.viewKey\); GLS\.map\.hover\(VIEW\.hoverKey\); GLS\.map\.setBand\(bandKeys\(\)\); \} return; \}/, '범례 구간 강조도 feature-state 만(2026-10-19)');
  assert.match(TPL, /if \(glOn\(\)\) glColors\(\);/, '테마 전환 → 다시 칠하기');
  assert.match(tplBody('applyMode'), /glColors\(\)/, '단계 모드 램프 → 다시 칠하기');
  assert.match(tplBody('mapKey'), /Map3D\.keyMove\(VIEW\.G, S\.mapAt, e\.key\)/, 'GL 도 같은 키보드 이동(화면 라벨 점 기준)');
  for (const [nm, h] of [['demo', BUILT], ['ops', OPS]]) {
    assert.ok(h.includes('MapGL'), nm); assert.doesNotMatch(h, /<script[^>]+maplibre-gl\.js/, nm + ': 정적 script 태그 없음(동적)');
  }
  assert.match(OPS, /const MAPLIBRE_SRC = '\/assets\/vendor\/maplibre-gl\/5\.24\.0\/maplibre-gl\.js';/);
  assert.match(BUILT, /const MAPLIBRE_SRC = '\.\.\/\.\.\/assets\/vendor\/maplibre-gl\/5\.24\.0\/maplibre-gl\.js';/);
  assert.ok(fs.existsSync(path.join(ROOT, 'assets', 'vendor', 'maplibre-gl', '5.24.0', 'maplibre-gl.js')) && fs.existsSync(path.join(ROOT, 'assets', 'vendor', 'maplibre-gl', '5.24.0', 'maplibre-gl.css')));
  assert.equal(typeof ctx.MapGLin.mount, 'function', '빌드 결과 첫 스크립트에 공용 모듈');
});

test('⑫ 2026-10-19 사용자 피드백 3건 — 모두 feature-state·색 식만(G16), 옵션·토큰이 없으면 /map 개요 식 그대로: (a) 범례 구간 강조 bd·dim (b) 이웃 1단계 밖 면 hid = 투명(⑬) (c) 고른 곳 선택 색 --cz-map-sel', () => {
  const SEL = ['boolean', ['feature-state', 'sel'], false], HV = ['boolean', ['feature-state', 'hv'], false], OUT = ['boolean', ['feature-state', 'out'], false], HID = ['boolean', ['feature-state', 'hid'], false];
  const base = { face: [0, 1, 2, 3, 4, 5].map((i) => [i, i, i, 1]), lift: Array(6).fill([9, 9, 9, 1]), ce: Array(6).fill([7, 7, 7, 1]), line: [255, 255, 255, 1], sea: [0, 0, 0, .06], ctx: [195, 203, 214, 1], ctxLine: [255, 255, 255, 1] };
  /* (b) 밖 면: 이웃 1단계 밖(hid)은 투명, 이웃은 맥락 회색 — 카드색 덮기(옛 far·farOf)는 없다 */
  assert.deepEqual(G.colorExpr(base, { scope: true }).slice(0, 3), ['case', OUT, ['case', HID, ['rgba', 0, 0, 0, 0], ['rgba', 195, 203, 214, 1]]], '밖 면 = 이웃 밖은 투명, 이웃은 맥락 회색');
  assert.ok(!('farOf' in G) && !/\bfar\b|FAR/.test(SRC), '옛 먼 면(far) 코드 없음');
  /* (c) 선택 색: 토큰이 있으면 고른 곳(sel) = 선택 색(흐림·구간·가리킴보다 먼저), 바닥 윤곽 = 진한 쪽 1.5px. 없으면(/map 개요 — readColors 가 null) 예전 식 */
  const cs = { ...base, sel: [199, 80, 54, 1], selLine: [126, 45, 28, 1] }, sc = G.colorExpr(cs, { scope: true });
  assert.deepEqual(sc.slice(3, 5), [SEL, ['rgba', 199, 80, 54, 1]], 'scope: 밖 면 다음이 선택 색'); assert.deepEqual(G.colorExpr(cs).slice(0, 3), ['case', SEL, ['rgba', 199, 80, 54, 1]], '옵션 없이도 토큰이 있으면 선택 색');
  assert.deepEqual(G.colorExpr(base), ['case', ['any', SEL, HV], ['match', ['coalesce', ['feature-state', 'c'], 0], ...base.lift.flatMap((c, i) => [i, ['rgba', ...c]]), ['rgba', ...base.lift[0]]], ['match', ['coalesce', ['feature-state', 'c'], 0], ...base.face.flatMap((c, i) => [i, ['rgba', ...c]]), ['rgba', ...base.face[0]]]], '토큰 없음 = 예전 식(6% 밝힘)');
  assert.deepEqual(G.hlColor(cs).slice(0, 3), ['case', SEL, ['rgba', 126, 45, 28, 1]]); assert.deepEqual(G.hlColor(base), G.hlColor({ ...base, sel: null }), '선 색도 토큰 없으면 예전');
  assert.ok(!JSON.stringify(G.styleOf(G.toGeoJSON(UNITS), base)).includes('"hid"') && JSON.stringify(G.styleOf(G.toGeoJSON(UNITS), base).layers.find((l) => l.id === 'gl-hl').paint['line-width']) === '1.25', '/map 개요 스타일: hid 없음 · 윤곽 1.25 그대로');
  assert.match(SRC, /sel: opt\('--cz-map-sel'\), selLine: opt\('--cz-map-sel-line'\)/, '선택 색 = 토큰(정의된 화면만)');
  assert.ok(!SRC.includes("'--map-sel'"), '/map 의 노란 --map-sel(app.js 고른 사업)과 이름이 겹치지 않게 /citizen 전용 --cz-map-sel');
  /* (a) 범례 구간: setBand 는 feature-state 만 */
  const sb = fnBody(SRC, 'setBand'); assert.match(sb, /fs\(c, \{ bd, dim \}\)/); assert.doesNotMatch(sb, /setData|setFilter|addLayer|setStyle|setPaintProperty/);
  assert.match(SRC, /dim: face\.map\(\(c\) => mix\(c, card, 1 - keep\)\)/, '흐린 색 = 면 색 --map-dim-mix + 카드색');
  /* 토큰: /citizen 범위에만(/map 은 없음), 짓는 중 램프에서는 딥 잉크로 덮는다 · 선택 색 위 라벨 4.5:1 · 카드 바탕 위 선택 색 3:1 */
  const GC = fs.readFileSync(path.join(ROOT, 'app', 'globals.css'), 'utf8'), blk = (sel) => { const i = GC.indexOf(sel + ' {'); assert.ok(i >= 0, sel); return GC.slice(i, GC.indexOf('}', i)); }, tv = (b, n) => (new RegExp(`--${n}: (#[0-9A-Fa-f]{6})`).exec(b) || [])[1];
  const lum = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)).reduce((a, v, i) => a + v * [.2126, .7152, .0722][i], 0), cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const rows = [[blk('html[data-page="citizen"]'), '#FCFCFA', '#1D6A93'], [blk('html.dark[data-page="citizen"]'), '#1D1C19', '#2378B6'], [blk('html[data-page="citizen"] #mapc[data-ramp="build"]'), '#FCFCFA', null], [blk('html.dark[data-page="citizen"] #mapc[data-ramp="build"]'), '#1D1C19', null]];
  for (const [b, card] of rows) { const s = tv(b, 'cz-map-sel'), ink = tv(b, 'cz-map-sel-ink'); assert.ok(s && ink && tv(b, 'cz-map-sel-line'), b.slice(0, 50)); assert.ok(cr(s, ink) >= 4.5, `라벨 ${s}/${ink} ${cr(s, ink).toFixed(2)}`); assert.ok(cr(s, card) >= 3, `면 ${s}/${card} ${cr(s, card).toFixed(2)}`); }
  assert.ok(!/--cz-map-sel/.test(GC.slice(GC.indexOf(':root {'), GC.indexOf('html[data-page="citizen"] {'))), '/map·정책 화면 :root·.dark 에는 선택 색 없음(예전 6% 밝힘)');
});
test('⑪ 보는 시도(2026-10-19 사용자 결정 — 서울을 보면 서울 밖은 맥락 회색·평평, 시도 경계선): 경계선 = 시도가 다른 이웃 면의 공유 호만(서울-경기·서울-인천·인천-경기, 같은 시도 안·해안선 없음), out 식은 옵션이 있을 때만', () => {
  const L = G.sidoLines(UNITS);
  assert.deepEqual(L.features.map((f) => [f.properties.id, f.properties.a, f.properties.b]), [['1128', '11', '28'], ['1141', '11', '41'], ['2841', '28', '41']]);
  /* 선 점은 모두 두 시도 면의 (다듬은) 꼭짓점 — 면 경계와 꼭 겹친다. 같은 시도 안 경계(종로-중구)는 선에 없다 */
  const fc = G.toGeoJSON(UNITS), vs = (sd) => new Set(fc.features.filter((f) => f.properties.s === sd).flatMap((f) => f.geometry.coordinates.flat(2).map((p) => p.join())));
  const V = { 11: vs('11'), 28: vs('28'), 41: vs('41') };
  for (const f of L.features) for (const ln of f.geometry.coordinates) { assert.ok(ln.length >= 2); for (const p of ln) { const k = p.join(); assert.ok(V[f.properties.a].has(k) && V[f.properties.b].has(k), `${f.properties.id} ${k}`); } }
  const lineSet = new Set(L.features.flatMap((f) => f.geometry.coordinates.flat().map((p) => p.join())));
  const own = (c) => new Set(fc.features.find((f) => f.properties.code === c).geometry.coordinates.flat(2).map((p) => p.join()));
  const jn = own('11110'), jg = own('11140'); let inner = 0; for (const k of jn) if (jg.has(k) && !V['41'].has(k) && !V['28'].has(k) && lineSet.has(k)) inner++;
  assert.equal(inner, 0, '서울 안(종로-중구) 경계는 시도 경계선이 아니다');
  assert.ok(L.features.find((f) => f.properties.id === '1141').geometry.coordinates.flat().length > 100, '서울-경기 둘레');
  assert.equal(G.sidoLines(UNITS.filter((u) => u.s === '41')), null, '한 시도뿐이면 없음');
  /* 식: 옵션이 없으면 예전 식과 같다 */
  const cols = { face: Array(6).fill([1, 2, 3, 1]), lift: Array(6).fill([4, 5, 6, 1]), ce: Array(6).fill([7, 8, 9, 1]), line: [255, 255, 255, 1], sea: [0, 0, 0, .06], ctx: [195, 203, 214, 1], ctxLine: [255, 255, 255, 1] };
  const OUT = ['boolean', ['feature-state', 'out'], false];
  assert.deepEqual(G.colorExpr(cols, {}), G.colorExpr(cols)); assert.deepEqual(G.heightExpr({}), G.heightExpr()); assert.deepEqual(G.lineExpr(cols), ['rgba', 255, 255, 255, 1]);
  assert.doesNotMatch(JSON.stringify([G.colorExpr(cols), G.heightExpr(), G.styleOf(fc, cols)]), /"out"|gl-sido/, '옵션 없음(/map 개요) = out·경계선 없음');
  const ce = G.colorExpr(cols, { scope: true }); assert.deepEqual(ce.slice(0, 3), ['case', OUT, ['case', ['boolean', ['feature-state', 'hid'], false], ['rgba', 0, 0, 0, 0], ['rgba', 195, 203, 214, 1]]], 'out = 맥락 회색(--map-ctx, 이웃 밖 hid 는 투명)이 먼저 — 고른 곳·가리킨 곳보다 앞');
  const SEL = ['boolean', ['feature-state', 'sel'], false], HV = ['boolean', ['feature-state', 'hv'], false], BD = ['boolean', ['feature-state', 'bd'], false], DIM = ['boolean', ['feature-state', 'dim'], false];
  assert.deepEqual(ce.slice(3, 5), [['all', DIM, ['!', ['any', SEL, HV]]], G.colorExpr(cols)[3]], '그다음 흐린 면(범례 구간 밖, 고른 곳·가리킨 곳 제외 — 2026-10-19), cols.dim 이 없으면 면 색');
  assert.deepEqual(ce[5], ['any', SEL, HV, BD]); assert.deepEqual(ce.slice(6), G.colorExpr(cols).slice(2), '구간 면은 고른 곳처럼 밝게, 그 밖은 예전 식');
  const he = G.heightExpr({ scope: true }); assert.deepEqual(he[4][1].slice(0, 3), ['case', OUT, 0], 'out = 높이 0(평평)');
  assert.deepEqual(he[4][1][3][2], ['case', SEL, 5, HV, 2, BD, 2, 0], '구간 면 = 가리킨 곳 높이(2px) 띄움');
  /* 스타일: 경계선 층 = 고른 곳 윤곽 위 · 솟은 면 아래(앞의 솟은 면이 가린다), feature-state on 으로 진하게 */
  const st = G.styleOf(fc, { ...cols, sido: [1, 1, 1, 1], sidoWeak: [2, 2, 2, 1], sidoW: [2, 1.25] }, null, { lines: L });
  assert.deepEqual(st.layers.map((l) => l.id), ['gl-bg', 'gl-sea', 'gl-flat', 'gl-line', 'gl-hl', 'gl-sido', 'gl-ext', 'gl-rim']);
  assert.deepEqual(st.sources.sido.promoteId, 'id');
  const sp = st.layers.find((l) => l.id === 'gl-sido').paint; assert.deepEqual(sp['line-width'], ['case', ['boolean', ['feature-state', 'on'], false], 2, 1.25]);
  assert.match(JSON.stringify(st.layers.find((l) => l.id === 'gl-hl').paint['line-opacity']), /^\["case",\["boolean",\["feature-state","out"\],false\],0,/, '밖 면은 윤곽 없음');
  /* setScope: feature-state·솟은 면 필터만(G16 — source·스타일·데이터는 다시 만들지 않는다), 밖 면은 가리킴을 내보내지 않는다 */
  const b = fnBody(SRC, 'setScope');
  assert.match(b, /fs\(c, \{ out, hid \}\)/); assert.match(b, /setFeatureState\(\{ source: 'sido'/); assert.match(b, /setExt\(st\.extRaw\)/);
  assert.doesNotMatch(b, /setData|addSource|removeSource|setStyle|addLayer|toGeoJSON|sidoLines/);
  assert.match(SRC, /const setExt = \(list\) => \{ st\.extRaw = list; const l = list\.filter\(\(c\) => !st\.out\.has\(c\)\)/, '솟은 면 필터에서 밖 면을 뺀다');
  assert.match(SRC, /k = k0 && st\.out\.has\(k0\) \? null : k0;/, '밖 면 가리킴 없음(누름은 그대로 — /citizen 은 그 시도로 옮긴다)');
  assert.match(SRC, /const scoped = 'scope' in o/, 'mount 에 scope 키를 줄 때만');
  assert.match(SRC, /sido: v\('--map-sido-line'\), sidoWeak: v\('--map-sido-line-weak'\), sidoW: \[px\('--map-sido-w', 2\), px\('--map-sido-w-weak', 1\.25\)\]/, '색·굵기 = globals 토큰');
  assert.match(tplBody('glMount'), /MapGL\.mount\(el, \{ units: MAPU, omit: [^\n]*, target: camSido\(\), scope: camSido\(\) \}\)/);
});

test('⑬ 이웃 1단계(2026-10-19 사용자 피드백 — 서울을 볼 때 지역 경계 1레벨까지만, 카드 외곽이 회색으로 차지 않게): Map3D.nearOf 집합 · 이웃 밖 면 hid = 투명(GL)·.hid(SVG) · 시도 경계선은 보는 시도에 닿은 선만 · 카메라 여백 축소 · /map 개요도 같은 모드(2026-10-19) · 툴팁 사업 위치 문구 없음', () => {
  const base = M3.prep(UNITS), ISL = ['28710', '28720'], N = (sd) => M3.nearOf(base, sd, { omit: ISL });
  /* 서울: 경기·인천에서 맞댄 시군구만(고양·의정부·양주·남양주·구리·하남·성남·과천·안양·광명·부천·김포 + 인천 계양) — 데이터 이웃표 D.nb 와 같다 */
  const s11 = N('11'); assert.deepEqual(s11.near, ['28245', '41130', '41150', '41170', '41190', '41210', '41280', '41290', '41310', '41360', '41450', '41570', '41630']);
  assert.deepEqual(s11.keep, []); for (const c of ['41110', '41390', '41410', '41220', '41800', '28237', '28185']) assert.ok(s11.hide.includes(c), '서울 보기 숨김 ' + c);
  const nb = (sd) => [...new Set(Object.entries(ctx.D.nb).filter(([k]) => k.startsWith(sd)).flatMap(([, v]) => v).filter((c) => !c.startsWith(sd) && !ISL.includes(c)))].sort();
  for (const sd of ['11', '28', '41']) assert.deepEqual(N(sd).near, nb(sd), sd + ' 이웃 = D.nb(경계 꼭짓점 2개 이상 공유)');
  /* 인천: 강서·부천·시흥·김포만 · 경기: 서울 18구·인천 4구가 이웃, 서울 안쪽 7구는 둘러싸여 구멍이 나지 않게 keep, 인천 바닷가 5구는 숨김 */
  assert.deepEqual(N('28').near, ['11500', '41190', '41390', '41570']); assert.equal(N('28').hide.length, 52);
  const s41 = N('41'); assert.equal(s41.near.length, 22); assert.deepEqual(s41.keep, ['11140', '11170', '11200', '11230', '11410', '11560', '11590']); assert.deepEqual(s41.hide, ['28125', '28155', '28177', '28185', '28275']);
  for (const sd of ['11', '28', '41']) { const r = N(sd), all = [...r.near, ...r.keep, ...r.hide]; assert.equal(new Set(all).size, all.length, sd + ' 겹침 없음'); assert.deepEqual(all.sort(), [...UNITS.filter((u) => u.s !== sd && !ISL.includes(u.code)).map((u) => u.code)].sort(), sd + ' 밖 면 전부'); }   // UNITS 는 vm 영역 배열 — 펼쳐서 비교
  assert.deepEqual(M3.nearOf(base, null), { near: [], keep: [], hide: [] });
  /* GL: 이웃 밖 면 = 면·경계선·판 그늘 투명, 시도 경계선은 닿지 않은 선 투명 — feature-state 만(G16), /map 개요(옵션 없음)는 hid 없음 */
  const HID = ['boolean', ['feature-state', 'hid'], false], OUT = ['boolean', ['feature-state', 'out'], false], CL = ['rgba', 0, 0, 0, 0];
  const cols = { face: Array(6).fill([1, 2, 3, 1]), lift: Array(6).fill([4, 5, 6, 1]), ce: Array(6).fill([7, 8, 9, 1]), line: [255, 255, 255, 1], sea: [0, 0, 0, .06], ctx: [195, 203, 214, 1], ctxLine: [250, 250, 250, 1], sido: [1, 1, 1, 1], sidoWeak: [2, 2, 2, 1], sidoW: [2, 1.25] };
  assert.deepEqual(G.lineExpr(cols, { scope: true }), ['case', HID, CL, OUT, ['rgba', 250, 250, 250, 1], ['rgba', 255, 255, 255, 1]]);
  const st = G.styleOf(G.toGeoJSON(UNITS), cols, null, { lines: G.sidoLines(UNITS) }), ly = (id) => st.layers.find((l) => l.id === id).paint;
  assert.deepEqual(ly('gl-sea')['fill-color'], ['case', HID, CL, ['rgba', 0, 0, 0, .06]], '판 그늘도 빼다');
  assert.deepEqual(ly('gl-sido')['line-color'].slice(0, 3), ['case', HID, CL], '닿지 않은 시도 경계선 투명');
  const plain = JSON.stringify(G.styleOf(G.toGeoJSON(UNITS), cols)); assert.ok(!plain.includes('"hid"'), '/map 개요 스타일 hid 없음');
  assert.deepEqual(G.styleOf(G.toGeoJSON(UNITS), cols).layers.find((l) => l.id === 'gl-sea').paint['fill-color'], ['rgba', 0, 0, 0, .06]);
  const sc = fnBody(SRC, 'setScope'); assert.match(sc, /m3\.nearOf\(nbBase, s\)\.hide/); assert.match(sc, /\{ on, hid: !!s && !on \}/); assert.doesNotMatch(sc, /setData|addSource|setStyle|addLayer|setPaintProperty/);
  assert.match(SRC, /if \(!st\.hid\.has\(k\)\) return k;/, '숨긴 면은 가리킴·누름·이름표 면 판정에서 없는 면'); assert.match(SRC, /const faces = \(\) => codes\.filter\(\(c\) => !st\.hid\.has\(c\)\)/, '키보드 이동 목록에서 뺀다');
  /* 카메라: 시도로 확대할 때만 여백 축소(위 면 높이 + 14 → + 5, 옆 12 → 2, 아래 14 → 판 그늘 6), 수도권 전체·padding 을 주는 /map 개요는 그대로 */
  assert.deepEqual(G.padFor(32, false), { top: 46, right: 12, bottom: 14, left: 12 }); assert.deepEqual(G.padFor(32, true), { top: 37, right: 2, bottom: 6, left: 2 });
  assert.match(SRC, /const padOf = \(target\) => \(o\.padding \? o\.padding\(\{ W: st\.W, H: st\.H, hmax: st\.hmax \}\) : padFor\(st\.hmax, scoped && target != null\)\);/);
  assert.match(fnBody(SRC, 'fitCam'), /pad = padOf\(target\)/); assert.match(fnBody(SRC, 'refit'), /limitsFor\(cap, fitCam\(null\)\.zoom\)/, '한도는 수도권 본토 기본 여백 그대로');
  const stage = { W: 720, H: 570 }, hm = G.hmaxFor(570), cap = G.boundsOf(UNITS, null), zc = G.cameraFor(cap, stage, { padding: G.padFor(hm, false), bearing: -10 }).zoom;
  for (const sd of ['11', '28', '41']) { const b = G.boundsOf(UNITS, sd), z0 = G.cameraFor(b, stage, { padding: G.padFor(hm, false), bearing: -10 }).zoom, z1 = G.cameraFor(b, stage, { padding: G.padFor(hm, true), bearing: -10 }).zoom; assert.ok(z1 > z0 && z1 < zc + 3, `${sd} ${z0.toFixed(2)} → ${z1.toFixed(2)} (한도 ${(zc + 3).toFixed(2)})`); }
  /* /map 개요도 같은 보는 시도 모드(2026-10-19 사용자 피드백 '일반사용자 종합상황판과 동일하게'): scope 를 넘기고, 시도를 보면 padFor tight + 왼쪽만 범례 칸 비킴 */
  const OVS = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'overview.js'), 'utf8');
  assert.match(OVS, /MapGL\.mount\(el, \{ units: seeds, target: S\.sido \|\| null, scope: S\.sido \|\| null, ctx: [^\n]*, padding: pad \}\)/, '/map 개요도 scope');
  assert.match(OVS, /const pad = \(\{ hmax \}\) => \(S\.sido \? \{ \.\.\.win\.MapGL\.padFor\(hmax, true\), left: left\(\) \} : \{ top: hmax \+ 14, right: 12, bottom: 14, left: left\(\) \}\);/, '시도 보기 = 꽉 맞춤, 수도권 전체 = 예전 여백');
  /* SVG 대체: 같은 집합(template hideOf → draw o.hide) → .fg.hid(숨김)·판 그늘 제외·키보드 건너뜀, 시도를 보면 닿지 않은 시도 경계선은 그리지 않는다 */
  const M3S = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'map3d.js'), 'utf8');
  assert.match(M3S, /<g class="fg\$\{f\.hid \? ' hid' : ''\}"/); assert.match(M3S, /seaD = \(dy\) => dOf\(F\.filter\(\(f\) => !f\.hid\)\.flatMap/); assert.match(M3S, /if \(!o\.scope\) sdl \+= d; else if \(sd\(q\.code\) === o\.scope \|\| sd\(pc\.nb\) === o\.scope\) sdlOn \+= d;/);
  assert.match(fs.readFileSync(path.join(ROOT, 'assets', 'css', 'map3d.css'), 'utf8'), /\.map \.fg\.hid \{ display: none; \}/);
  const KG = { k: 1, F: [{ x: { key: 'a' }, bx: 0, by: 0 }, { x: { key: 'b' }, bx: 10, by: 0, hid: true }, { x: { key: 'c' }, bx: 30, by: 0 }] };
  assert.equal(M3.keyMove(KG, 'a', 'ArrowRight').key, 'c', '숨긴 면은 건너뛴다');
  assert.match(tplBody('drawMap'), /scope: VIEW\.scope, hide: hideOf\(VIEW\.scope\) \}\)/); assert.match(TPL, /const hideOf = \(sd\) => \(sd \? \(HIDE\[sd\] \|\|= Map3D\.nearOf\(M3B, sd, \{ omit: CAPITAL\.flatMap\(\(s\) => ISLES\[s\] \|\| \[\]\) \}\)\.hide\) : null\);/);
  /* 지운 사업 위치 점: 지도 읽는 법 툴팁에 설명 없음(원본·빌드 결과 둘 다) */
  for (const [nm, h] of [['tpl', TPL], ['demo', BUILT], ['ops', OPS]]) { const tip = /<div class="tip" id="tip-map"[\s\S]*?<\/div>/.exec(h)[0]; assert.ok(!tip.includes('사업 위치') && !/점은|점을 누르면/.test(tip), nm); assert.match(tip, /지도를 끌면 돌려 볼 수 있어요/, nm + ' 다른 문단은 그대로'); }
});

/* ⑭ 시군구 경계 띠(2026-10-19 사용자 피드백 '지역구별 경계를 명확하게 구분' — /citizen·/map 개요): 바닥 경계선은 솟은 윗면 둘레에 없다 → 윗면 위 안쪽 띠(gl-rim) */
const areaLL = (r) => r.slice(0, -1).reduce((a, p, i) => { const q = r[i + 1]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
const inR = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [x1, y1] = r[i], [x2, y2] = r[j]; if ((y1 > p[1]) !== (y2 > p[1]) && p[0] < (x2 - x1) * (p[1] - y1) / (y2 - y1) + x1) c = !c; } return c; };
const inFeature = (p, f) => f.geometry.coordinates.some((poly) => inR(p, poly[0]) && !poly.slice(1).some((h) => inR(p, h)));
const KXM = 2 * Math.PI * 6371008.8 / 360;
const lenM = (a, b) => Math.hypot((b[0] - a[0]) * KXM * Math.cos(37.5 * Math.PI / 180), (b[1] - a[1]) * KXM);

test('⑭-1 띠 기하(순수): 면마다 한 feature(code), 변마다 닫힌 반시계 사각형, 안쪽(면 안)으로 폭 = px × 그 확대 단계 지면 1px 미터, 꼭짓점 줄이기(면 꼭짓점보다 훨씬 적다)', () => {
  const fc = G.toGeoJSON(UNITS), t = 8, w = G.mPerPx(t, { pitch: 90 }), R = G.rimGeoJSON(fc, t), by = new Map(fc.features.map((f) => [f.properties.code, f]));
  assert.equal(R.features.length, 65, '본토 65면 모두 띠가 있다');
  assert.deepEqual(R.features.map((f) => f.properties.code), fc.features.map((f) => f.properties.code), 'code 같은 순서(promoteId — 면과 같은 feature-state 열쇠)');
  let n = 0, inside = 0;
  for (const f of R.features) for (const [q] of f.geometry.coordinates) {
    n++; assert.equal(q.length, 5); assert.deepEqual(q[0], q[4], '닫힌 고리'); assert.ok(areaLL(q) > 0, '반시계(바깥 고리)');
    assert.ok(Math.abs(lenM(q[1], q[2]) - w) < w * .01 && Math.abs(lenM(q[0], q[3]) - w) < w * .01, `폭 ${lenM(q[1], q[2]).toFixed(1)} ≈ ${w.toFixed(1)} m`);
    const c = [(q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4];
    if (inFeature(c, by.get(f.properties.code))) { inside++; continue; }
    /* 밖이면 폭보다 가는 곳(곶·작은 섬 — 띠가 면 전체를 덮는다)뿐: 면 경계에서 한 폭 안 */
    const M = ([x, y]) => [x * KXM * Math.cos(37.5 * Math.PI / 180), y * KXM], cm = M(c);
    const d = Math.min(...by.get(f.properties.code).geometry.coordinates.flat().flatMap((r) => r.slice(1).map((b, i) => { const a = M(r[i]), e = M(b), dx = e[0] - a[0], dy = e[1] - a[1], L = dx * dx + dy * dy, u = L ? Math.max(0, Math.min(1, ((cm[0] - a[0]) * dx + (cm[1] - a[1]) * dy) / L)) : 0; return Math.hypot(cm[0] - a[0] - u * dx, cm[1] - a[1] - u * dy); })));
    assert.ok(d < w, `${f.properties.code} 띠가 면에서 ${(d / w).toFixed(2)} 폭 떨어짐`);
  }
  assert.ok(inside / n > .94, `띠 가운데가 제 면 안 ${inside}/${n}(구멍 고리도 안쪽 — 시계 고리의 왼쪽)`);
  const verts = fc.features.reduce((a, f) => a + f.geometry.coordinates.flat().reduce((b, r) => b + r.length, 0), 0);
  assert.ok(n < verts / 4, `띠 변 ${n} < 면 꼭짓점 ${verts} / 4`);
  /* 확대 단계가 오르면 폭은 절반, 변은 늘어난다(지면 미터 허용이 줄어서) · 폭 px 를 주면 비례 */
  const R9 = G.rimGeoJSON(fc, 9), q8 = R.features[0].geometry.coordinates[0][0], q9 = R9.features[0].geometry.coordinates[0][0];
  assert.ok(Math.abs(lenM(q9[1], q9[2]) * 2 - lenM(q8[1], q8[2])) < 1, '한 단계 위 = 폭 절반');
  assert.ok(R9.features.reduce((a, f) => a + f.geometry.coordinates.length, 0) > n);
  const q2 = G.rimGeoJSON(fc, t, { px: 2 }).features[0].geometry.coordinates[0][0]; assert.ok(Math.abs(lenM(q2[1], q2[2]) - 2 * w) < w * .02, 'px 2 = 폭 두 배');
});

test('⑭-2 띠 두께(화면 px): 확대 단계 반올림한 벌이라 수도권 전체·시도(서울·인천·경기) 확대 모두 한쪽 0.7~1.42px(맞댄 틈 1.4~2.8px) — 한 벌만 쓰면 서울 확대에서 3px 넘게 굵어진다', () => {
  assert.equal(G.rimTier(7.49), 7); assert.equal(G.rimTier(7.5), 8); assert.equal(G.rimTier(2), G.RIM.z[0]); assert.equal(G.rimTier(30), G.RIM.z[1]);
  const thick = (z, t) => Math.pow(2, z - t);   // 한쪽 px(--map-edge-w = 1) = 띠 미터 / 그 확대의 지면 1px 미터
  for (const stage of [{ W: 1000, H: 700 }, { W: 720, H: 570 }, { W: 360, H: 420 }]) {
    const hm = G.hmaxFor(stage.H), cap = G.boundsOf(UNITS, null), z0 = G.cameraFor(cap, stage, { padding: G.padFor(hm, false), bearing: -10 }).zoom;
    for (const sd of [null, '11', '28', '41']) {
      const z = sd ? G.cameraFor(G.boundsOf(UNITS, sd), stage, { padding: G.padFor(hm, true), bearing: -10 }).zoom : z0, px = thick(z, G.rimTier(z));
      assert.ok(px >= .7 && px <= 1.42, `${stage.W}×${stage.H} ${sd || '수도권'} z ${z.toFixed(2)} → ${px.toFixed(2)}px`);
    }
    const zs = G.cameraFor(G.boundsOf(UNITS, '11'), stage, { padding: G.padFor(hm, true), bearing: -10 }).zoom;
    assert.ok(thick(zs, G.rimTier(z0)) > 3, '수도권 벌 그대로면 서울 확대에서 3px 넘게');
    /* 카메라 한도(맞춘 확대 −0.8 ~ +3) 전체에서도 한 벌 안 0.7~1.42px */
    for (let z = z0 - .8; z <= z0 + 3; z += .05) { const px = thick(z, G.rimTier(z)); assert.ok(px >= .7 && px <= 1.42, `z ${z.toFixed(2)} ${px.toFixed(2)}`); }
  }
});

test('⑭-3 띠 스타일·상태 동기화: 맨 위 fill-extrusion(바닥 = 그 면 높이 식, 윗면 = + eps), 색 = 그 면 지금 색(같은 상태 식)을 그늘 쪽으로 --map-edge-mix(2026-10-19 사용자 피드백 \'흰색이니 촌스럽네\'), 바닥 경계선 .75 그대로 · SVG .f 테두리도 같은 섞음', () => {
  const cols = { face: [0, 1, 2, 3, 4, 5].map((i) => [200 - i * 30, 210 - i * 30, 220 - i * 30, 1]), lift: Array(6).fill([240, 240, 240, 1]), ce: Array(6).fill([7, 8, 9, 1]), dim: Array(6).fill([230, 230, 230, 1]), line: [250, 251, 252, 1], sea: [0, 0, 0, .06], ctx: [9, 9, 9, 1], ctxLine: [8, 8, 8, 1], sel: [199, 80, 54, 1], edgeW: 1.5, shade: [15, 26, 61], edgeMix: .22 };
  const E = G.edgeCols(cols), mx = (c) => [0, 1, 2].map((k) => Math.round(c[k] * .78 + [15, 26, 61][k] * .22)).concat(1);
  assert.deepEqual(E.face, cols.face.map(mx)); assert.deepEqual(E.lift, cols.lift.map(mx)); assert.deepEqual(E.dim, cols.dim.map(mx)); assert.deepEqual(E.sel, mx(cols.sel));
  assert.equal(G.edgeCols({ ...cols, sel: null }).sel, null, '선택 색 토큰이 없으면(/map 개요) 그대로 없음');
  for (const [sc, so] of [[undefined, {}], [{ lines: G.sidoLines(UNITS) }, { scope: true }]]) {
    const st = G.styleOf(G.toGeoJSON(UNITS), cols, null, sc), ids = st.layers.map((l) => l.id), rim = st.layers.find((l) => l.id === 'gl-rim');
    assert.equal(ids[ids.length - 1], 'gl-rim', '맨 위(솟은 면 다음 — 깊이로 앞 면이 가린다)'); assert.equal(ids.indexOf('gl-rim') - ids.indexOf('gl-ext'), 1);
    assert.deepEqual(st.sources.rim, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, promoteId: 'code' }, '처음엔 비어 있다(mount 가 확대 단계 벌을 넣는다)');
    assert.equal(rim.type, 'fill-extrusion'); assert.deepEqual(rim.filter, st.layers.find((l) => l.id === 'gl-ext').filter, '처음 필터 = 솟은 면과 같은 빈 목록');
    assert.deepEqual(rim.paint['fill-extrusion-base'], G.heightExpr(so), '바닥 = 그 면 높이 식(띄움·밖 면 0 포함)');
    assert.deepEqual(rim.paint['fill-extrusion-height'], G.heightExpr({ ...so, add: G.RIM.eps }));
    assert.deepEqual(rim.paint['fill-extrusion-color'], G.colorExpr(E, so), '띠 색 = 면과 같은 상태 식(c·sel·hv·bd·dim) + 섞은 팔레트');
    assert.ok(!JSON.stringify(rim.paint['fill-extrusion-color']).includes('[250,251,252'), '흰 경계색(--map-ov-line) 없음');
    assert.equal(rim.paint['fill-extrusion-vertical-gradient'], false);
    assert.equal(st.layers.find((l) => l.id === 'gl-line').paint['line-width'], .75, '바닥 경계선 굵기 원래대로');
  }
  const h = G.heightExpr({ scope: true, add: .3 }), h0 = G.heightExpr({ scope: true });
  assert.deepEqual(h[4][1], ['+', h0[4][1], .3]); assert.deepEqual(G.heightExpr({ add: 0 }), G.heightExpr(), 'add 0·없음 = 예전 식');
  assert.match(SRC, /edgeW: px\('--map-edge-w', 1\), shade: shade\.slice\(0, 3\), edgeMix: px\('--map-edge-mix', 20\) \/ 100/, '폭·섞음 = 토큰, 그늘 = --map-shade');
  assert.match(fnBody(SRC, 'setColors'), /map\.setPaintProperty\('gl-rim', 'fill-extrusion-color'/, '다크·단계 램프 전환 때 띠 색도');
  assert.match(SRC, /const fs = \(code, s\) => \{ map\.setFeatureState\(\{ source: 'sgg', id: code \}, s\); map\.setFeatureState\(\{ source: 'rim', id: code \}, s\); \};/, 'feature-state 는 면·띠 같이');
  assert.match(SRC, /map\.setFilter\('gl-ext', f\); map\.setFilter\('gl-rim', f\);/, '띠 필터 = 솟은 면 필터(밖 면·숨긴 면 제외)');
  /* 토큰: 폭 1px 한 곳, 섞음 라이트 22% · 다크 18% — 각 램프 1단계(가장 옅은 면)도 띠와 대비 1.45 이상, 5단계(가장 짙은 면)는 1.45 이하(검은 격자처럼 보이지 않게) */
  const GC = fs.readFileSync(path.join(ROOT, 'app', 'globals.css'), 'utf8'), CSS = fs.readFileSync(path.join(ROOT, 'assets', 'css', 'map3d.css'), 'utf8');
  assert.equal((GC.match(/--map-edge-w:/g) || []).length, 1, '폭은 한 곳(다크도 같은 값)'); assert.match(GC, /--map-edge-w: 1px;\n  --map-edge-mix: 22%;\n/); assert.match(GC, /--map-ov-line: #7A7A7A;\n  --map-edge-mix: 18%;/);
  const hx = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)), lin = (v) => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }, lum = (c) => .2126 * lin(c[0]) + .7152 * lin(c[1]) + .0722 * lin(c[2]);
  const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }, all = (n) => [...GC.matchAll(new RegExp(`--${n}: (#[0-9A-Fa-f]{6});`, 'g'))].map((m) => m[1]);
  for (const [th, k, sh, t] of [['라이트', 0, '#0F1A3D', .22], ['다크', 1, '#000000', .18]]) for (const rp of ['map-ov', 'ramp-build', 'ramp-sale']) {
    const c1 = hx(all(rp + '-1')[k]), c5 = hx(all(rp + '-5')[k]), m = (c) => [0, 1, 2].map((q) => Math.round(c[q] * (1 - t) + hx(sh)[q] * t));
    assert.ok(cr(c1, m(c1)) >= 1.45, `${th} ${rp}-1 ${cr(c1, m(c1)).toFixed(2)}`); assert.ok(cr(c5, m(c5)) <= 1.45, `${th} ${rp}-5 ${cr(c5, m(c5)).toFixed(2)}`);
  }
  assert.match(CSS, /\.map \.f \{ fill: var\(--c\); stroke: color-mix\(in srgb, var\(--c\), var\(--map-shade\) var\(--map-edge-mix\)\); stroke-width: \.75;/, 'SVG 대체 면 테두리 = GL 띠와 같은 섞음, 굵기 .75');
  assert.match(CSS, /\.map \.f\.out \{ stroke: var\(--card\); \}/, '회색 밖 면 테두리는 카드색 그대로'); assert.match(CSS, /\.map \.ctx \{ fill: var\(--map-ctx\); stroke: var\(--card\); stroke-width: \.75; \}/, '맥락 면 그대로');
  /* 빌드 결과(메인이 빌드한 뒤 통과): 토큰·SVG 테두리·띠 층 */
  for (const [nm, h] of [['demo', BUILT], ['ops', OPS]]) { assert.ok(h.includes('--map-edge-mix: 22%;') && h.includes('var(--map-shade) var(--map-edge-mix)') && h.includes("id: 'gl-rim'") && h.includes('const edgeCols = '), nm + ' 빌드 결과에 토큰·띠'); }
});

test('⑭-4 mount(가짜 maplibre): 처음 = 확대 단계 벌 하나 · 값·보는 시도·구간·고르기는 띠 필터·feature-state 만(숨긴·밖 면은 띠도 없음) · 확대 단계가 바뀔 때만 벌을 바꾸고 만든 벌은 다시 쓴다', () => {
  const mercX = (lng) => (lng + 180) / 360, mercY = (lat) => { const s = Math.sin(lat * Math.PI / 180); return .5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
  const ixY = (y) => { const n = Math.PI - 2 * Math.PI * y; return 180 / Math.PI * Math.atan(.5 * (Math.exp(n) - Math.exp(-n))); };
  const log = { data: [], filter: {}, fsRim: new Map(), paint: [] };
  class FakeMap {
    constructor(o) { this.style = o.style; this.z = 7; this.c = [127, 37.5]; this.b = o.bearing; this.p = o.pitch; this.on_ = {}; FakeMap.last = this; }
    on(t, f) { (this.on_[t] = this.on_[t] || []).push(f); } once(t, f) { this.on(t, f); } fire(t, e) { (this.on_[t] || []).slice().forEach((f) => f(e)); }
    getCanvas() { return { removeAttribute() {}, style: {} }; } resize() {} setMaxBounds() {} setMinZoom() {} setMaxZoom() {}
    getZoom() { return this.z; } getCenter() { return { lng: this.c[0], lat: this.c[1] }; } getBearing() { return this.b; } getPitch() { return this.p; }
    jumpTo(c) { if (c.center) this.c = Array.isArray(c.center) ? c.center : [c.center.lng, c.center.lat]; if (c.zoom != null && c.zoom !== this.z) { this.z = c.zoom; this.fire('zoom'); } }
    easeTo(c) { this.jumpTo(c); }
    project([lng, lat]) { const s = 512 * 2 ** this.z; return { x: (mercX(lng) - mercX(this.c[0])) * s + 500, y: (mercY(lat) - mercY(this.c[1])) * s + 350 }; }
    unproject([x, y]) { const s = 512 * 2 ** this.z; return { lng: ((x - 500) / s + mercX(this.c[0])) * 360 - 180, lat: ixY((y - 350) / s + mercY(this.c[1])) }; }
    setFeatureState(k, s) { if (k.source === 'rim') log.fsRim.set(k.id, { ...(log.fsRim.get(k.id) || {}), ...s }); }
    setFilter(id, f) { log.filter[id] = f; } setPaintProperty(id, k, v) { log.paint.push([id, k, v]); } getLayer(id) { return this.style.layers.find((l) => l.id === id); }
    getSource(id) { return { setData: (d) => log.data.push([id, d]) }; } queryRenderedFeatures() { return []; }
  }
  const win = { matchMedia: () => ({ matches: true }), requestAnimationFrame() {}, cancelAnimationFrame() {} };
  const el = { ownerDocument: { defaultView: win }, clientWidth: 1000, clientHeight: 700, setAttribute() {} };
  const cols = { face: Array(6).fill([1, 2, 3, 1]), lift: Array(6).fill([4, 5, 6, 1]), ce: Array(6).fill([7, 8, 9, 1]), line: [255, 255, 255, 1], sea: [0, 0, 0, .06], ctx: [9, 9, 9, 1], ctxLine: [8, 8, 8, 1], edgeW: 1 };
  const gl = G.mount(el, { units: UNITS, maplibregl: { Map: FakeMap, LngLat: class {} }, colors: cols, scope: null }), map = FakeMap.last;
  assert.equal(log.data.length, 0, '붙기 전에는 띠 없음');
  map.fire('load');
  assert.equal(log.data.length, 1, '붙으면 한 벌'); const t0 = G.rimTier(map.z), d0 = log.data[0][1];
  assert.equal(log.data[0][0], 'rim'); assert.equal(Math.abs(lenM(d0.features[0].geometry.coordinates[0][0][1], d0.features[0].geometry.coordinates[0][0][2]) - G.mPerPx(t0, { pitch: 90 })) < 1, true, '그 확대 단계 폭');
  /* 값: 솟은 면 필터 = 띠 필터, 띠 높이 feature-state h 가 면과 같다 */
  const vals = Object.fromEntries(UNITS.map((u, i) => [u.code, i % 4 ? 100 * i : 0]));
  gl.setValues(vals, {}, { duration: 0 });
  assert.deepEqual(log.filter['gl-rim'], log.filter['gl-ext']); const raised = log.filter['gl-ext'][2][1];
  assert.ok(raised.length > 30 && !raised.includes(UNITS[0].code), '0호 면은 띠 없음(바닥 경계선이 맡는다)');
  for (const c of raised) assert.ok(log.fsRim.get(c).h > 0, c + ' 띠 높이 = 면 높이');
  assert.equal(log.data.length, 1, '값 바꾸기는 띠 벌을 바꾸지 않는다');
  /* 보는 시도: 밖 면(회색·평평)·숨긴 면은 띠 필터에서 빠진다(feature-state out·hid 도 띠에) */
  gl.setScope('11');
  const inS = log.filter['gl-rim'][2][1]; assert.deepEqual(log.filter['gl-rim'], log.filter['gl-ext']);
  assert.ok(inS.length > 0 && inS.every((c) => c.startsWith('11')), '서울 보기 = 서울 솟은 면만 띠');
  const hid = [...log.fsRim].filter(([, s]) => s.hid).map(([c]) => c), out = [...log.fsRim].filter(([, s]) => s.out).map(([c]) => c);
  assert.ok(hid.length > 0 && hid.every((c) => out.includes(c) && !inS.includes(c)), '숨긴 면 ⊂ 밖 면 · 띠 없음');
  gl.setBand([inS[0]]); gl.select(inS[1]); gl.hover(inS[2]);
  assert.equal(log.fsRim.get(inS[0]).bd, true); assert.equal(log.fsRim.get(inS[1]).sel, true); assert.equal(log.fsRim.get(inS[2]).hv, true);
  assert.equal(log.data.length, 1, '보는 시도·구간·고르기·가리키기도 벌을 바꾸지 않는다');
  gl.setScope(null); assert.deepEqual(log.filter['gl-rim'], log.filter['gl-ext']); assert.equal(log.filter['gl-rim'][2][1].length, raised.length, '수도권 전체 = 다시 모든 솟은 면');
  /* 확대: 같은 벌 안 = 그대로, 단계가 바뀌면 새 벌, 돌아오면 만든 벌 그대로(다시 만들지 않는다) */
  map.jumpTo({ zoom: t0 + .2 }); assert.equal(log.data.length, 1);
  map.jumpTo({ zoom: t0 + 2 }); assert.equal(log.data.length, 2); assert.notEqual(log.data[1][1], d0);
  map.jumpTo({ zoom: t0 }); assert.equal(log.data.length, 3); assert.equal(log.data[2][1], d0, '만든 벌 다시 씀');
  /* 토큰 폭이 바뀌면(테마) 벌을 새로, 바닥 경계선 굵기도 */
  gl.setColors({ ...cols, edgeW: 2 }); assert.equal(log.data.length, 4); assert.notEqual(log.data[3][1], d0);
  assert.ok(log.paint.some(([id, k]) => id === 'gl-rim' && k === 'fill-extrusion-color') && !log.paint.some(([id, k]) => id === 'gl-line' && k === 'line-width'), '띠 색은 다시 칠하고 바닥 경계선 굵기는 그대로');
  gl.setColors({ ...cols, edgeW: 2 }); assert.equal(log.data.length, 4, '같은 폭이면 그대로');
});
