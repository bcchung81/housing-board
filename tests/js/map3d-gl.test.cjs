'use strict';
/* 진짜 3D 지도(assets/js/map3d-gl.js — MapLibre GL fill-extrusion, WebGL 없으면 SVG 대체) 공용 모듈의 순수 부분과 /citizen 연결(원본 template.html 글)을 시험한다. 화면 사진은 찍지 않는다.
   ① 투영 역변환 왕복 ② 섬 제외 본토 65면·GeoJSON 고리 ③ 높이 순위 = 값 순위(G15)·0호 0·확대해도 같은 화면 높이 ④ 시도·수도권 상자·카메라 한도 ⑤ 움직임 줄이기 → 0
   ⑥ 스타일 외부 요청 0 ⑦ 고르기·가리키기는 feature-state 만(G16) ⑧ 이름표 자리 규칙 ⑨ WebGL 없음·불러오기 실패 → SVG 대체 경로 ⑩ 빌드 결과가 maplibre 를 동적으로 부른다 */
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
  assert.deepEqual(Object.keys(st.sources), ['sgg']); assert.equal(st.sources.sgg.type, 'geojson'); assert.equal(st.sources.sgg.promoteId, 'code');
  assert.deepEqual(st.layers.map((l) => `${l.id}:${l.type}`), ['gl-bg:background', 'gl-sea:fill', 'gl-flat:fill', 'gl-line:line', 'gl-hl:line', 'gl-ext:fill-extrusion']);
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
    assert.doesNotMatch(b, /setData|addSource|removeSource|setStyle|setFilter|setExt|addLayer|toGeoJSON|labels\(/, nm);
  }
  assert.match(fnBody(SRC, 'setValues'), /setExt\(/, '솟은 면 필터는 값이 바뀔 때만');
  assert.equal((SRC.match(/toGeoJSON\(o\.units/g) || []).length, 1, 'GeoJSON 은 붙일 때 한 번');
  assert.doesNotMatch(SRC, /setData\(/, '데이터를 다시 넣지 않는다');
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
  assert.match(tplBody('glDraw'), /GLS\.map\.flyTo\(camSido\(\)/); assert.match(tplBody('renderMapCard'), /if \(cap && glOn\(\)\) GLS\.map\.flyTo\(camSido\(\)\);/, '같은 시도 안 고르기도 범위를 맞춘다');
  assert.match(tplBody('glDraw'), /GLS\.map\.setValues\(VIEW\.mvals, glCls\(\), \{ umax: VIEW\.umax, duration: 0 \}\)/);
  assert.match(tplBody('applyMode'), /GLS\.map\.setValues\(md\.vals, glCls\(\), \{ umax: md\.umax, duration: 700,/, '모드 바꾸기 = 같은 배율로 700ms');
  assert.match(tplBody('startRise'), /glOn\(\) \? GLS\.map\.setValues\(VIEW\.mvals, glCls\(\), opt\) : Map3D\.animateHeights\(svg, VIEW\.G, VIEW\.mvals, opt\)/, '첫 솟음 = 같은 계획');
  assert.match(tplBody('glDraw'), /box\.setAttribute\('role', 'img'\); box\.setAttribute\('aria-label', '수도권 시군구 지도'\);/);
  assert.match(tplBody('paintRings'), /if \(GLS\.mode !== 'svg'\) \{ if \(glOn\(\)\) \{ GLS\.map\.select\(VIEW\.viewKey\); GLS\.map\.hover\(VIEW\.hoverKey\); \} return; \}/);
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
