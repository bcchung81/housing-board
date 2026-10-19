/* 진짜 3D 시군구 지도(WebGL · MapLibre GL fill-extrusion) 공용 모듈 — /citizen(tools/design/public-mock/build.js 가 끼워 넣는다)과 /map 수도권 개요(assets/js/overview.js — 맥락 면 층·색 단계만 바꾸기 setClasses 를 더 쓴다)가 같은 구현을 쓴다.
   2026-10-18 사용자 결정: 바탕 지도 없이 시군구 면만, WebGL 이 안 되면 부르는 쪽이 SVG 흉내 3D(assets/js/map3d.js — Map3D)로 그린다(supported·load 가 판정).
   - 스타일: 투명 배경 + 시군구 면 GeoJSON 하나(styleOf). 타일·글꼴(glyphs)·스프라이트 요청 0. 라벨·사업 점·핀은 지도 위 SVG 덮개(이름표 규칙은 Map3D.labels 와 같은 뜻, 클래스·모양도 map3d.css 그대로).
   - 좌표: region-map 경로(투영 정수 x = (경도 − 124.5)·cos37.5°·1000, y = (38.4 − 위도)·1000)를 경위도로 되돌린다(toLngLat). 경계는 Map3D 의 공유 호로 다듬는다(이웃끼리 같은 좌표 — 틈·겹침 없음).
   - 높이: 값 → 화면 px(heightOf — Map3D.faceH 와 같은 척도: 0호 평평, 4 + (Hmax − 4)·(u/umax)^0.75, Hmax = 무대 높이 8%·16~48) → 미터(heightExpr — 확대 단계가 1 오르면 미터는 절반, 지수 0.5 보간이라
     확대·축소해도 같은 화면 높이). 같은 값 = 같은 높이, 값 순위 = 높이 순위(G15). 배율(umax)은 부르는 쪽이 판 하나로 고정해 넘긴다(시도를 확대해도 높이 순위·색 구간이 튀지 않게).
   - 0호 면은 평평한 면(fill) + 경계선, 값이 있는 면만 솟는다(fill-extrusion, 필터 = 지금 솟은 코드). 고른 곳·가리킨 곳은 feature-state 만(sel 5px · hv 2px 띄움 + 윗면 조금 밝게 + 평평한 면은 면 계열 1.25px 윤곽) — 기하·source 는 다시 만들지 않는다(G16).
   - 카메라: 첫 화면 = 섬(강화·옹진)을 뺀 수도권 본토, 기울기 45°·방향 −10°. flyTo(시도) = 그 시도 상자로 900ms(움직임 줄이기면 0), flyTo(null) = 수도권 본토. 기울기 0~60°, maxBounds·min/maxZoom 으로 수도권 둘레만.
   순수 함수(toLngLat·toGeoJSON·boundsOf·heightOf·heightExpr·styleOf·cameraFor·limitsFor·placeLabels·durationOf 등)는 node 로 시험한다(tests/js/map3d-gl.test.cjs). DOM·WebGL 은 supported·load·readColors·mount 만.

   사용법(/map 개요가 그대로 쓸 수 있게 — 값·색 단계·이름은 부르는 쪽이 정한다):
     if (!MapGL.supported(document)) return drawSvg();                                   // WebGL 없음 → Map3D(SVG)
     await MapGL.load('/assets/vendor/maplibre-gl/5.24.0/maplibre-gl.js', document);     // 실패하면 catch 에서 drawSvg()
     const gl = MapGL.mount(el, { units, target: null });                                // units = [{ code, s, n|name, d, lx, ly }], 섬은 기본으로 뺀다
     gl.on('ready', () => { gl.setValues(vals, cls, { umax }); gl.labels(svgG, ux, { strict: true }); });   // vals = { 코드: 값 }, cls = { 코드: 색 단계 0~5 }
     gl.on('pick', (code) => (sido ? go(code) : gl.flyTo(code.slice(0, 2)))); gl.on('hover', (code) => tip(code));   // 시도 2단: 면 누름 → 그 시도로 확대, flyTo(null) = 수도권 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MapGL = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  /* Map3D(공유 호·다듬기·이름표 글자 폭·움직임 줄이기 판정)를 함께 쓴다 — /citizen 은 같은 스크립트에 먼저 있고, node 는 옆 파일 */
  const M3 = () => (root && root.Map3D) || (typeof require === 'function' ? require('./map3d.js') : null);

  /* ---------- 좌표·경계(순수) ---------- */
  const PROJ = { lon0: 124.5, lat0: 38.4, kx: Math.cos(37.5 * Math.PI / 180) * 1000, ky: 1000 };
  const r6 = (v) => Math.round(v * 1e6) / 1e6;
  const toLngLat = ([x, y]) => [r6(x / PROJ.kx + PROJ.lon0), r6(PROJ.lat0 - y / PROJ.ky)];
  const fromLngLat = ([lng, lat]) => [(lng - PROJ.lon0) * PROJ.kx, (PROJ.lat0 - lat) * PROJ.ky];
  /* 섬 지역(인천 강화·옹진): 지도 면에서 뺀다(값·순위·합계에는 그대로, 2026-10-18) */
  const ISLES = ['28710', '28720'];
  const nameOf = (u) => u.n || u.name || '';
  /* 면 고리(투영 좌표): 다듬기(smooth)면 Map3D 공유 호를 Visvalingam(1 단위²) → Chaikin 2회로(양쪽 면이 같은 점), 아니면 원본 경로 그대로 */
  function ringsOfUnits(units, smooth) {
    const m3 = M3();
    if (!smooth || !m3) return new Map(units.map((u) => [u.code, m3 ? m3.ringsOf(u.d) : []]));
    const base = m3.prep(units.map((u) => ({ code: u.code, s: u.s, n: nameOf(u), d: u.d, lx: u.lx, ly: u.ly }))), { reg, rings } = m3.arcsOf(base), sm = new Map();
    const arc = (key) => { if (!sm.has(key)) { const a = reg.get(key); sm.set(key, m3.chaikin(m3.simplifyVW(a.pts, a.closed, 1), a.closed, 2)); } return sm.get(key); };
    return new Map(units.map((u) => [u.code, rings.get(u.code).map((segs) => {
      const pieces = segs.map(({ key, rev }) => { const p = arc(key); return rev ? p.slice().reverse() : p; });
      return segs.length === 1 && reg.get(segs[0].key).closed ? pieces[0] : pieces.flatMap((p) => p.slice(0, -1));
    }).filter((r) => r.length >= 3)]));
  }
  const areaOf = (r) => r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
  const inRing = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [x1, y1] = r[i], [x2, y2] = r[j]; if ((y1 > p[1]) !== (y2 > p[1]) && p[0] < (x2 - x1) * (p[1] - y1) / (y2 - y1) + x1) c = !c; } return c; };
  /* 고리 묶음 → GeoJSON MultiPolygon 좌표: 다른 고리 안에 홀수 번 든 고리는 구멍(가장 작은 바깥 고리에 붙인다). 바깥 = 반시계, 구멍 = 시계(경위도 기준, RFC 7946) */
  function polygonsOf(rings) {
    const L = rings.map((r) => r.map(toLngLat)), A = L.map(areaOf);
    const depth = L.map((r, i) => L.reduce((n, q, j) => n + (j !== i && inRing(r[0], q) ? 1 : 0), 0));
    const close = (r, ccw) => { const q = (areaOf(r) > 0) === ccw ? r.slice() : r.slice().reverse(); q.push(q[0]); return q; };
    const outer = L.map((r, i) => i).filter((i) => depth[i] % 2 === 0), polys = new Map(outer.map((i) => [i, [close(L[i], true)]]));
    L.forEach((r, i) => {
      if (depth[i] % 2 === 0) return;
      const own = outer.filter((j) => inRing(r[0], L[j])).sort((a, b) => Math.abs(A[a]) - Math.abs(A[b]))[0];
      if (own != null) polys.get(own).push(close(r, false));
    });
    return [...polys.values()];
  }
  /* 시군구 면 GeoJSON(순수): o = { omit(뺄 코드, 기본 섬 둘), smooth(기본 true) }. 속성 code·s·n, promoteId = code(feature-state 열쇠) */
  function toGeoJSON(units, o = {}) {
    const omit = new Set(o.omit || ISLES), own = units.filter((u) => !omit.has(u.code)), R = ringsOfUnits(own, o.smooth !== false);
    return { type: 'FeatureCollection', features: own.map((u) => ({ type: 'Feature', properties: { code: u.code, s: u.s, n: nameOf(u) }, geometry: { type: 'MultiPolygon', coordinates: polygonsOf(R.get(u.code)) } })).filter((f) => f.geometry.coordinates.length) };
  }
  /* 맥락 면 GeoJSON(순수, /map 수도권 개요 — 2026-10-18): 수도권 밖 시도 외곽 [{ code, d(같은 투영 정수 경로) }] → 평평한 면(다듬지 않음, 고를 수 없음). 없으면 null */
  function ctxGeoJSON(list) {
    const m3 = M3(), fs = (list || []).map((c) => ({ type: 'Feature', properties: { code: c.code }, geometry: { type: 'MultiPolygon', coordinates: polygonsOf(m3.ringsOf(c.d)) } })).filter((f) => f.geometry.coordinates.length);
    return fs.length ? { type: 'FeatureCollection', features: fs } : null;
  }
  /* 상자(순수): sel = null(섬 뺀 수도권 본토) · 시도 두 자리 · 코드 목록 → [[서, 남], [동, 북]] */
  function boundsOf(units, sel, o = {}) {
    const omit = new Set(o.omit || ISLES), m3 = M3(), pick = (u) => !omit.has(u.code) && (sel == null || (Array.isArray(sel) ? sel.includes(u.code) : u.s === sel));
    let b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const u of units) if (pick(u)) for (const r of m3.ringsOf(u.d)) for (const p of r) { const [x, y] = toLngLat(p); b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)]; }
    return b[0] === Infinity ? null : [[b[0], b[1]], [b[2], b[3]]];
  }
  const expand = ([[w, s], [e, n]], f) => { const dx = (e - w) * f, dy = (n - s) * f; return [[w - dx, s - dy], [e + dx, n + dy]]; };

  /* ---------- 높이(순수) ---------- */
  /* 면 높이 px: Map3D.faceH 와 같은 척도(umax 를 넘는 값은 Hmax 에서 멈춘다). codes 를 주면 값이 없는 코드는 0 */
  function heightOf(vals, o = {}) {
    const codes = o.codes || Object.keys(vals), hmin = o.hmin == null ? 4 : o.hmin, hmax = o.hmax == null ? 32 : o.hmax;
    const umax = o.umax || Math.max(1, ...codes.map((c) => vals[c] || 0));
    return Object.fromEntries(codes.map((c) => { const u = vals[c] || 0; return [c, u > 0 ? hmin + (hmax - hmin) * Math.pow(Math.min(1, u / umax), .75) : 0]; }));
  }
  /* 높이 상한: 무대 높이 8%, 16~48px(SVG 판 Hmax0 와 같은 식) */
  const hmaxFor = (H) => Math.max(16, Math.min(48, Math.round(H * .08)));
  /* 화면 1px 높이의 미터(확대 단계 z, 기준 위도·기울기): 지구 둘레·cos(위도) / (512·2^z) / sin(기준 기울기) — 기준 기울기에서 화면에 h px 로 선다 */
  const CAM = { pitch: 45, bearing: -10, lat: 37.5, z0: 4, z1: 14, maxPitch: 60, fly: 900, turn: 280 };
  const EARTH = 2 * Math.PI * 6371008.8;
  const mPerPx = (z, o = {}) => EARTH * Math.cos((o.lat || CAM.lat) * Math.PI / 180) / (512 * Math.pow(2, z)) / Math.sin((o.pitch || CAM.pitch) * Math.PI / 180);
  /* 고른 곳·가리킨 곳 띄우는 높이(px, SVG 판 .lift .on 5px · .hv 2px 와 같다) */
  const LIFT = { sel: 5, hv: 2 };
  const SEL = ['boolean', ['feature-state', 'sel'], false], HV = ['boolean', ['feature-state', 'hv'], false];
  /* fill-extrusion-height 식: 면 높이 px(feature-state h) + 띄움 → 미터. 확대 단계 지수 0.5 보간이라 화면 높이가 확대와 상관없이 같다 */
  function heightExpr() {
    const px = ['+', ['coalesce', ['feature-state', 'h'], 0], ['case', SEL, LIFT.sel, HV, LIFT.hv, 0]];
    return ['interpolate', ['exponential', .5], ['zoom'], CAM.z0, ['*', px, mPerPx(CAM.z0)], CAM.z1, ['*', px, mPerPx(CAM.z1)]];
  }
  /* 색 식: feature-state c(색 단계 0~5) → 토큰 색, 고른 곳·가리킨 곳은 윗면이 조금 밝은 색(lift). cols = readColors 결과 */
  const rgbaOf = (c) => ['rgba', c[0], c[1], c[2], c[3] == null ? 1 : c[3]];
  const byClass = (list) => ['match', ['coalesce', ['feature-state', 'c'], 0], ...list.flatMap((c, i) => [i, rgbaOf(c)]), rgbaOf(list[0])];
  const colorExpr = (cols) => ['case', ['any', SEL, HV], byClass(cols.lift), byClass(cols.face)];
  /* 고른 곳 윤곽색: 그 면 단계 계열에서 대비가 나는 단계(map3d.css .lift --ce 와 같은 대응) */
  const CE = [3, 3, 4, 1, 2, 2];
  /* 렌더 상수: 빛 하나(화면 기준 왼쪽 아래 240° · 위에서 30°, 흰빛 — 왼쪽을 향한 벽 밝게 · 보는 쪽 중간 · 오른쪽 어둡게), 판 그늘 아래로 6px */
  const RENDER = { light: { anchor: 'viewport', color: 'white', intensity: .35, position: [1.15, 240, 30] }, seaY: 6 };
  const LAYERS_Q = ['gl-ext', 'gl-flat'];
  const EMPTY = ['in', ['get', 'code'], ['literal', []]];
  /* 스타일(순수): 배경(투명) · 판 그늘(fill 아래로 6px) · 평평한 면(fill) · 경계선 · 고른 곳 윤곽 · 솟은 면(fill-extrusion). 타일·글꼴·스프라이트 없음.
     ctxFc(맥락 면 GeoJSON, 선택 — /map 개요)를 주면 배경 바로 위에 평평한 맥락 면(--map-ctx)·경계(카드색) 두 층을 더한다(주지 않으면 예전과 같은 층) */
  const ctxLayers = (cols) => [
    { id: 'gl-ctx', type: 'fill', source: 'ctx', paint: { 'fill-color': rgbaOf(cols.ctx || [0, 0, 0, 0]) } },
    { id: 'gl-ctx-line', type: 'line', source: 'ctx', layout: { 'line-join': 'round' }, paint: { 'line-color': rgbaOf(cols.ctxLine || cols.line), 'line-width': .75 } },
  ];
  function styleOf(fc, cols, ctxFc) {
    return {
      version: 8, name: 'sgg-3d', light: RENDER.light,
      sources: { sgg: { type: 'geojson', data: fc, promoteId: 'code' }, ...(ctxFc ? { ctx: { type: 'geojson', data: ctxFc } } : {}) },
      layers: [
        { id: 'gl-bg', type: 'background', paint: { 'background-color': rgbaOf([0, 0, 0, 0]) } },
        ...(ctxFc ? ctxLayers(cols) : []),
        { id: 'gl-sea', type: 'fill', source: 'sgg', paint: { 'fill-color': rgbaOf(cols.sea), 'fill-translate': [0, RENDER.seaY], 'fill-translate-anchor': 'viewport', 'fill-antialias': false } },
        { id: 'gl-flat', type: 'fill', source: 'sgg', paint: { 'fill-color': colorExpr(cols) } },
        { id: 'gl-line', type: 'line', source: 'sgg', layout: { 'line-join': 'round' }, paint: { 'line-color': rgbaOf(cols.line), 'line-width': .75 } },
        { id: 'gl-hl', type: 'line', source: 'sgg', layout: { 'line-join': 'round' }, paint: { 'line-color': byClass(cols.ce), 'line-width': 1.25, 'line-opacity': ['case', ['any', SEL, HV], 1, 0] } },
        { id: 'gl-ext', type: 'fill-extrusion', source: 'sgg', filter: EMPTY, paint: { 'fill-extrusion-color': colorExpr(cols), 'fill-extrusion-height': heightExpr(), 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 1, 'fill-extrusion-vertical-gradient': true } },
      ],
    };
  }

  /* ---------- 카메라(순수) ---------- */
  const mercX = (lng) => (lng + 180) / 360, mercY = (lat) => { const s = Math.sin(lat * Math.PI / 180); return .5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
  /* 상자를 무대(W·H, padding)에 맞추는 위에서 본(기울기 0) 카메라: 방향(bearing)만큼 돌린 상자 폭으로. mount 는 이 값에서 시작해 기울기를 넣고 실제 투영으로 다시 맞춘다 */
  function cameraFor(b, stage, o = {}) {
    const p = { top: 0, right: 0, bottom: 0, left: 0, ...(o.padding || {}) }, br = (o.bearing || 0) * Math.PI / 180;
    const xs = [mercX(b[0][0]), mercX(b[1][0])], ys = [mercY(b[1][1]), mercY(b[0][1])], cx = (xs[0] + xs[1]) / 2, cy = (ys[0] + ys[1]) / 2;
    const pts = [[xs[0], ys[0]], [xs[1], ys[0]], [xs[0], ys[1]], [xs[1], ys[1]]].map(([x, y]) => [(x - cx) * Math.cos(br) + (y - cy) * Math.sin(br), -(x - cx) * Math.sin(br) + (y - cy) * Math.cos(br)]);
    const w = Math.max(...pts.map((q) => q[0])) - Math.min(...pts.map((q) => q[0])), h = Math.max(...pts.map((q) => q[1])) - Math.min(...pts.map((q) => q[1]));
    const aw = Math.max(1, stage.W - p.left - p.right), ah = Math.max(1, stage.H - p.top - p.bottom);
    return { center: [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2], zoom: Math.log2(Math.min(aw / (w * 512), ah / (h * 512))) };
  }
  /* 카메라 한도(순수): 수도권 본토 상자를 60% 넓힌 maxBounds, 맞춘 확대 단계 zCap 에서 −0.8 ~ +3, 기울기 0~60 */
  const limitsFor = (cap, zCap) => ({ maxBounds: expand(cap, .6), minZoom: zCap - .8, maxZoom: zCap + 3, minPitch: 0, maxPitch: CAM.maxPitch });
  /* 움직임 길이: 움직임 줄이기 설정이면 0 */
  const durationOf = (ms, win) => { const m3 = M3(); return m3 && m3.reducedMotion(win) ? 0 : ms; };

  /* ---------- 이름표 자리(순수) ----------
     cands = [{ key, ax, ay(윗면 라벨 점 화면 좌표), nm, v('1.6만' 또는 ''), u, c, must, ri(값 순위) }](놓을 순서대로: 내 동네 → 값 큰 순),
     o = { W, H, narrow, wOf(글, 크기, 굵기), inFace(key, 상자) → 그 면 윗면 위인가 }.
     Map3D.labels 와 같은 뜻: 두 줄(이름 14 / 숫자 16 굵게)이 면 안·빈 자리 → 상위 10(휴대폰 5)은 라벨 점 위 옅은 바탕 두 줄 → 이름 한 줄(면 안 → 옅은 바탕)
     → 반드시 보일 곳(상위 5·보는 곳·내 동네)은 제자리 → 아니면 생략(가리킴·순위 목록이 받는다). 지시선·떨어진 자리 없음. 무대 밖 라벨 점은 놓지 않는다 */
  const NEAR2 = [[0, 0], [0, -5], [0, 5], [-6, 0], [6, 0]], NEAR1 = [[0, 0], [0, -6], [0, 6], [-8, 0], [8, 0], [0, -12], [0, 12]];
  function placeLabels(cands, o) {
    const { W, H } = o, NTOP = o.narrow ? 5 : 10, boxes = [], out = [];
    const inStage = (b) => b.x - b.w / 2 >= 2 && b.x + b.w / 2 <= W - 2 && b.y - b.h / 2 >= 2 && b.y + b.h / 2 <= H - 2;
    const hit = (a, b) => Math.abs(a.x - b.x) * 2 < a.w + b.w + 8 && Math.abs(a.y - b.y) * 2 < a.h + b.h + 8;   // 묶음끼리 4px 이상 띄운다
    const free = (b) => inStage(b) && !boxes.some((q) => hit(b, q));
    const r1 = (v) => Math.round(v * 10) / 10;
    for (const x of cands) {
      if (!(x.ax >= 0 && x.ax <= W && x.ay >= 0 && x.ay <= H)) continue;
      if (o.narrow && !x.must && (x.ri >= 5 || !x.u)) continue;
      const w1 = o.wOf(x.nm, 14, 400) + 8, w2 = x.v ? Math.max(w1 - 8, o.wOf(x.v, 16, 700)) + 8 : w1, h2 = x.v ? 38 : 19;
      const two = NEAR2.map(([dx, dy]) => ({ x: x.ax + dx, y: x.ay + dy, w: w2, h: h2 })), one = NEAR1.map(([dx, dy]) => ({ x: x.ax + dx, y: x.ay + dy, w: w1, h: 19 }));
      const inF = (b) => o.inFace(x.key, b);
      let at = two.find((b) => free(b) && inF(b)), pill = false, v = x.v;
      if (!at && x.v && x.ri < NTOP) { at = two.find(free); pill = !!at; }
      if (!at && x.v) { at = one.find((b) => free(b) && inF(b)); if (at) v = ''; }
      if (!at) { at = one.find(free); if (at) { pill = true; v = ''; } }
      if (!at && x.must) { at = two.find(inStage) || two[0]; pill = true; v = x.v; }
      if (!at) continue;
      boxes.push(at);
      out.push({ key: x.key, nm: x.nm, v, zero: !x.u, pill, c: x.c || 0, x: r1(at.x), y: r1(at.y), w: r1(at.w), h: r1(at.h) });
    }
    return out;
  }

  /* ---------- 브라우저(DOM·WebGL) ---------- */
  /* WebGL 판정: webgl2 또는 webgl 맥락을 만들 수 있으면 true(재 본 맥락은 바로 놓는다) */
  function supported(doc) {
    try {
      const cv = doc.createElement('canvas'), g = cv.getContext('webgl2') || cv.getContext('webgl') || cv.getContext('experimental-webgl');
      if (!g) return false;
      const lose = g.getExtension && g.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
      return true;
    } catch (_) { return false; }
  }
  /* maplibre 동적 불러오기(판정 뒤에만 — 첫 그림은 요약 카드가 먼저): 스크립트 + 같은 폴더 css. 한 번만 부르고, 실패면 거절(부르는 쪽은 SVG 로) */
  let loading = null;
  function load(src, doc) {
    const win = doc.defaultView;
    if (win.maplibregl) return Promise.resolve(win.maplibregl);
    if (loading) return loading;
    return (loading = new Promise((ok, no) => {
      const css = doc.createElement('link'); css.rel = 'stylesheet'; css.href = src.replace(/\.js$/, '.css'); doc.head.appendChild(css);
      const s = doc.createElement('script'); s.src = src; s.async = true;
      s.onload = () => (win.maplibregl && win.maplibregl.Map ? ok(win.maplibregl) : no(new Error('maplibregl missing')));
      s.onerror = () => { loading = null; no(new Error('load failed: ' + src)); };
      doc.head.appendChild(s);
    }));
  }
  /* CSS 색 → [r, g, b, a]: 16진이면 바로, 그 밖(color-mix·oklch 등)은 캔버스가 푼 값으로 */
  function parseColor(s, doc) {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s.trim());
    if (m) { const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1]; return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1); }
    const c = doc.createElement('canvas').getContext('2d'); c.fillStyle = 'transparent'; c.fillStyle = s;
    const v = String(c.fillStyle), h = /^#([0-9a-f]{6})$/i.exec(v);
    if (h) return parseColor(v, doc);
    const n = (v.match(/[\d.]+/g) || []).map(Number); return [n[0] || 0, n[1] || 0, n[2] || 0, n[3] == null ? 1 : n[3]];
  }
  const mix = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] * (1 - t) + b[i] * t)).concat(1);
  /* 토큰 색 읽기(그 요소에서 — /citizen 단계 모드 램프 #mapc[data-ramp]·/map 지연 빨강 html[data-ov-metric] 처럼 범위가 덮은 값까지): 면 --map-ov-0~5, 경계 --map-ov-line,
     고른 곳 윗면 = 면 색 94% + 카드색(라이트)·글자색(다크) 6%(map3d.css .up-top 과 같다), 윤곽 = CE 단계, 판 그늘 = --map-shade 6%(다크 40%), 맥락 면 = --map-ctx · 경계 카드색(map3d.css .ctx 와 같다) */
  function readColors(el) {
    const doc = el.ownerDocument, cs = doc.defaultView.getComputedStyle(el), v = (n) => parseColor(cs.getPropertyValue(n).trim() || 'transparent', doc);
    const dark = !!(el.closest && el.closest('.dark')), face = [0, 1, 2, 3, 4, 5].map((i) => v(`--map-ov-${i}`)), toward = v(dark ? '--foreground' : '--card'), shade = v('--map-shade');
    return { face, lift: face.map((c) => mix(c, toward, .06)), ce: CE.map((i) => face[i]), line: v('--map-ov-line'), sea: [shade[0], shade[1], shade[2], dark ? .4 : .06], ctx: v('--map-ctx'), ctxLine: v('--card'), dark };
  }

  /* 지도 붙이기: el(크기가 있는 빈 칸) 에 maplibre 지도 하나. o = { units, omit, target(처음 볼 시도 또는 null), maplibregl, colors, pitch, bearing, padding(stage → {top,right,bottom,left}), ctx(맥락 면 [{ code, d }], 선택) }.
     사건: 'ready'(첫 그림이 끝난 idle) · 'settle'(움직임·필터가 가라앉은 뒤 첫 idle — 이름표를 다시 놓을 때) · 'pick'(코드) · 'hover'(코드|null) · 'movestart' · 'move' · 'moveend' · 'lost'(WebGL 맥락 잃음 → 부르는 쪽 SVG 로). 반환 = 조작 API(아래 return) */
  function mount(el, o) {
    const doc = el.ownerDocument, win = doc.defaultView, ml = o.maplibregl || win.maplibregl, m3 = M3();
    const omit = o.omit || ISLES, units = o.units.filter((u) => !omit.includes(u.code)), codes = units.map((u) => u.code);
    const fc = toGeoJSON(o.units, { omit, smooth: o.smooth !== false });
    const anchor = Object.fromEntries(units.map((u) => [u.code, toLngLat([u.lx, u.ly])])), fcBy = new Map(fc.features.map((f) => [f.properties.code, f]));
    const P0 = o.pitch == null ? CAM.pitch : o.pitch, B0 = o.bearing == null ? CAM.bearing : o.bearing;
    const st = { ready: false, quiet: 0, target: o.target === undefined ? null : o.target, W: 0, H: 0, hmax: 32, h: {}, vals: {}, umax: 0, ext: '', sel: null, hv: null, ptr: null, anim: null,
      dirty: false, cols: o.colors || readColors(el), on: {}, ov: null, lblG: null, base: {}, samples: new Map() };
    const emit = (t, ...a) => (st.on[t] || []).forEach((f) => f(...a));
    const coarse = !!(win.matchMedia && win.matchMedia('(pointer: coarse)').matches);
    const cap = boundsOf(o.units, null, { omit });
    const map = new ml.Map({ container: el, style: styleOf(fc, st.cols, ctxGeoJSON(o.ctx)), attributionControl: false, maplibreLogo: false, trackResize: false, renderWorldCopies: false, fadeDuration: 0,
      bounds: cap, fitBoundsOptions: { padding: 12 }, pitch: P0, bearing: B0, maxPitch: CAM.maxPitch, minPitch: 0,
      scrollZoom: false, boxZoom: false, doubleClickZoom: false, keyboard: false, dragPan: !coarse, dragRotate: true, pitchWithRotate: true, touchPitch: true, touchZoomRotate: true,
      canvasContextAttributes: { antialias: true } });
    /* 캔버스는 탭 정지점·영문 이름을 갖지 않는다(지도 이름·키보드는 부르는 쪽 칸이 맡는다) */
    const cv = map.getCanvas(); cv.removeAttribute('tabindex'); cv.removeAttribute('role'); cv.removeAttribute('aria-label'); el.setAttribute('aria-hidden', 'true');
    const fs = (code, s) => map.setFeatureState({ source: 'sgg', id: code }, s);
    const zNow = () => map.getZoom();
    const lift = (c) => (c && c === st.sel ? LIFT.sel : c && c === st.hv ? LIFT.hv : 0);
    const roofPx = (c) => (st.h[c] > 0 ? st.h[c] + lift(c) : 0);   // 평평한 면(필터 밖)은 띄우지 않는다
    /* 화면 좌표(높이 반영): 경위도 ll 을 그 면(code) 윗면 높이로 올려 투영. 높이 투영은 maplibre 변환의 고도 투영(지형과 같은 길)을 쓰고, 없으면 지면 투영 − px */
    function project(ll, code) {
      const px = code ? roofPx(code) : 0, m = px * mPerPx(zNow()), tf = map.transform;
      if (m > 0 && tf && typeof tf.locationToScreenPoint === 'function') {
        try { const p = tf.locationToScreenPoint(new ml.LngLat(ll[0], ll[1]), { getElevationForLngLat: () => m }); if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return [p.x, p.y]; } catch (_) { /* 아래 근사로 */ }
      }
      const p = map.project(ll); return [p.x, p.y - px * Math.sin(map.getPitch() * Math.PI / 180) / Math.sin(CAM.pitch * Math.PI / 180)];
    }
    const anchorOf = (code) => (anchor[code] ? project(anchor[code], code) : null);
    /* 맨 위 면 코드(화면 점): 솟은 면 → 평평한 면 순, 3D 는 maplibre 가 앞쪽부터 준다 */
    const topAt = (pt) => { const f = map.queryRenderedFeatures(pt, { layers: LAYERS_Q })[0]; return f ? String(f.id != null ? f.id : f.properties.code) : null; };
    /* 솟은 면 필터: 바뀔 때만(작업 스레드가 다시 묶는다 — 값을 바꿀 때만, 고르기·가리키기에서는 부르지 않는다) */
    const setExt = (list) => { const k = list.slice().sort().join(); if (k === st.ext) return; st.ext = k; st.dirty = true; map.setFilter('gl-ext', ['in', ['get', 'code'], ['literal', list]]); };
    const applyH = (h) => { for (const c of codes) { const v = h[c] || 0; if (v !== st.h[c]) { st.h[c] = v; fs(c, { h: v }); } } };
    /* 상자 맞춤 표본(그 범위 면 꼭짓점 몇 개 건너 하나) */
    const samplesOf = (target) => {
      const k = target == null ? '*' : target;
      if (!st.samples.has(k)) { const pts = []; for (const f of fc.features) if (target == null || f.properties.s === target) for (const poly of f.geometry.coordinates) poly[0].forEach((p, i) => { if (i % 3 === 0) pts.push(p); }); st.samples.set(k, pts); }
      return st.samples.get(k);
    };
    const padOf = () => (o.padding ? o.padding({ W: st.W, H: st.H, hmax: st.hmax }) : { top: st.hmax + 14, right: 12, bottom: 14, left: 12 });
    /* 기울인 카메라 맞춤: 위에서 본 맞춤(cameraFor)에서 시작해 실제 투영(기울기·방향·원근)으로 상자 넘침·치우침을 세 번까지 고친다. 계산 중 움직임 사건은 내보내지 않는다 */
    function fitCam(target) {
      const b = target == null ? cap : boundsOf(o.units, target, { omit }) || cap, pad = padOf(), pts = samplesOf(target);
      const save = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
      const c0 = cameraFor(b, { W: st.W, H: st.H }, { padding: pad, bearing: save.bearing });
      let cam = { center: c0.center, zoom: c0.zoom, bearing: save.bearing, pitch: save.pitch };
      st.quiet++;
      try {
        for (let i = 0; i < 4; i++) {
          map.jumpTo(cam);
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          for (const p of pts) { const q = map.project(p); if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y; }
          const aw = st.W - pad.left - pad.right, ah = st.H - pad.top - pad.bottom, s = Math.min(aw / Math.max(1, x1 - x0), ah / Math.max(1, y1 - y0));
          const dx = (x0 + x1) / 2 - (pad.left + aw / 2), dy = (y0 + y1) / 2 - (pad.top + ah / 2);
          if (Math.abs(Math.log2(s)) < .01 && Math.hypot(dx, dy) < 1) break;
          const c = map.unproject([st.W / 2 + dx, st.H / 2 + dy]);
          cam = { ...cam, center: [c.lng, c.lat], zoom: map.getZoom() + Math.log2(s) };
        }
      } finally { map.jumpTo(save); st.quiet--; }
      return cam;
    }
    /* 크기·한도 다시 맞춤(처음·무대 크기 바뀜): 한도를 풀고 수도권 본토 맞춤 확대 단계로 한도를 다시 잡은 뒤 지금 범위로 바로 맞춘다 */
    function refit() {
      st.quiet++;
      try { map.setMaxBounds(null); map.setMinZoom(0); map.setMaxZoom(22); } finally { st.quiet--; }
      const L = limitsFor(cap, fitCam(null).zoom);
      st.quiet++;
      try { map.setMaxBounds(L.maxBounds); map.setMinZoom(L.minZoom); map.setMaxZoom(L.maxZoom); } finally { st.quiet--; }
      map.jumpTo(fitCam(st.target));
    }
    function sizeOverlay() {
      if (!st.ov) return;
      for (const [a, v] of [['width', st.W], ['height', st.H], ['viewBox', `0 0 ${st.W} ${st.H}`]]) st.ov.setAttribute(a, v);
    }
    /* 무대 크기 맞춤: 바뀌었으면 캔버스·높이 상한·덮개·카메라를 다시(반환 true) */
    function setSize() {
      const W = el.clientWidth, H = el.clientHeight;
      if (W === st.W && H === st.H) return false;
      st.W = W; st.H = H; map.resize(); st.hmax = hmaxFor(H); sizeOverlay();
      if (st.ready) { applyH(heightOf(st.vals, { codes, umax: st.umax, hmax: st.hmax })); refit(); }
      return true;
    }

    /* 값 바꾸기: vals = { 코드: 값 }, cls = { 코드: 색 단계 }. 색은 바로, 높이는 duration(기본 700ms) 동안 지수형 감속으로(움직임 줄이기·0 이면 바로).
       opt = { umax(높이 배율 고정), duration, from({ 코드: 값 } — 없으면 지금 높이에서, {} 면 평평한 판에서), stagger: { origin(코드), msPerPx(그 면 라벨 점에서 1px 마다 늦춤) }, onEnd }.
       솟은 면 필터는 움직이는 동안 '시작 또는 끝에 솟은 면', 끝나면 '끝에 솟은 면'. 반환: { cancel()(그 자리에서 멈춤), finish()(바로 끝 + onEnd) } */
    function setValues(vals, cls, opt = {}) {
      if (st.anim) st.anim.cancel();
      st.vals = { ...vals }; st.umax = opt.umax || Math.max(1, ...codes.map((c) => vals[c] || 0));
      setClasses(cls);
      const h1 = heightOf(vals, { codes, umax: st.umax, hmax: st.hmax }), h0 = opt.from ? heightOf(opt.from, { codes, umax: st.umax, hmax: st.hmax }) : { ...st.h };
      setExt(codes.filter((c) => (h0[c] || 0) > 0 || h1[c] > 0));
      const sg = opt.stagger, at = sg && anchor[sg.origin] ? map.project(anchor[sg.origin]) : null;
      const delay = Object.fromEntries(codes.map((c) => { if (!at || !sg.msPerPx || !anchor[c]) return [c, 0]; const p = map.project(anchor[c]); return [c, Math.hypot(p.x - at.x, p.y - at.y) * sg.msPerPx]; }));
      const dur = durationOf(opt.duration == null ? 700 : Math.max(0, opt.duration), win), total = dur > 0 ? dur + Math.max(0, ...Object.values(delay)) : 0, ease = m3.easeOutExpo;
      let raf = 0, t0 = null, done = false;
      const step = (ms) => applyH(Object.fromEntries(codes.map((c) => { const t = dur > 0 ? (ms - delay[c]) / dur : 1; return [c, t >= 1 ? h1[c] : t <= 0 ? h0[c] || 0 : (h0[c] || 0) + (h1[c] - (h0[c] || 0)) * ease(t)]; })));
      const stop = () => { done = true; if (raf) win.cancelAnimationFrame(raf); raf = 0; if (st.anim === hd) st.anim = null; };
      const end = () => { stop(); applyH(h1); setExt(codes.filter((c) => h1[c] > 0)); if (opt.onEnd) opt.onEnd(); };
      const hd = { cancel: () => { if (!done) stop(); }, finish: () => { if (!done) end(); } };
      if (total <= 0) { end(); return hd; }
      st.anim = hd; step(0);
      const tick = (now) => { if (done) return; if (t0 == null) t0 = now; const ms = now - t0; if (ms >= total) { end(); return; } step(ms); raf = win.requestAnimationFrame(tick); };
      raf = win.requestAnimationFrame(tick);
      return hd;
    }
    /* 색 단계만 바꾸기(높이·필터·source 그대로 — /map 개요 지표 전환): cls = { 코드: 색 단계 0~5 } */
    function setClasses(cls) { for (const c of codes) fs(c, { c: (cls && cls[c]) || 0 }); }
    /* 고른 곳·가리킨 곳: feature-state 만 바꾼다(기하·source·필터는 그대로, G16) */
    function select(code) {
      const c = code && anchor[code] ? code : null; if (c === st.sel) return;
      if (st.sel) fs(st.sel, { sel: false }); st.sel = c; if (c) fs(c, { sel: true });
    }
    function hover(code) {
      const c = code && anchor[code] ? code : null; if (c === st.hv) return;
      if (st.hv) fs(st.hv, { hv: false }); st.hv = c; if (c) fs(c, { hv: true });
    }
    /* 색 다시 칠하기(테마·단계 모드 램프가 바뀔 때): 토큰을 다시 읽어 paint 만 바꾼다 */
    function setColors(cols) {
      st.cols = cols || readColors(el);
      map.setPaintProperty('gl-sea', 'fill-color', rgbaOf(st.cols.sea));
      map.setPaintProperty('gl-flat', 'fill-color', colorExpr(st.cols));
      map.setPaintProperty('gl-line', 'line-color', rgbaOf(st.cols.line));
      map.setPaintProperty('gl-hl', 'line-color', byClass(st.cols.ce));
      map.setPaintProperty('gl-ext', 'fill-extrusion-color', colorExpr(st.cols));
      if (map.getLayer('gl-ctx')) { map.setPaintProperty('gl-ctx', 'fill-color', rgbaOf(st.cols.ctx || [0, 0, 0, 0])); map.setPaintProperty('gl-ctx-line', 'line-color', rgbaOf(st.cols.ctxLine || st.cols.line)); }
    }
    /* 범위로 날기: 시도 두 자리면 그 시도 상자, null 이면 수도권 본토. 지금 방향·기울기는 그대로, 900ms(움직임 줄이기면 0). 같은 범위면 그대로(force 면 다시) */
    function flyTo(target, opt = {}) {
      const t = target || null; if (t === st.target && !opt.force) return false;
      st.target = t; if (!st.ready) return true;
      const cam = fitCam(t), dur = durationOf(opt.duration == null ? CAM.fly : opt.duration, win);
      if (dur > 0) map.easeTo({ ...cam, duration: dur, easing: (x) => 1 - Math.pow(1 - x, 3), essential: true }); else map.jumpTo(cam);
      return true;
    }
    /* 방향: 지금 보기 · 돌리기(단추 15°, + 는 화면에서 시계 방향) · 처음 보기로 · 처음 보기인가 */
    const view = () => ({ bearing: map.getBearing(), pitch: map.getPitch() });
    const rotateBy = (d) => map.easeTo({ bearing: map.getBearing() - d, duration: durationOf(CAM.turn, win) });   // d + = 화면에서 시계 방향(SVG 판 bearing 과 같은 뜻 — maplibre bearing 은 반대)
    const resetView = () => map.easeTo({ bearing: B0, pitch: P0, duration: durationOf(CAM.turn, win) });
    const isHome = () => Math.abs((((map.getBearing() - B0) % 360) + 540) % 360 - 180) < .5 && Math.abs(map.getPitch() - P0) < .5;
    /* 면 라벨 점(윗면 높이 반영) 화면 좌표 목록 — 키보드 이동(Map3D.keyMove 의 F)·핀·거리순 늦춤이 쓴다 */
    const faces = () => codes.map((c) => { const p = anchorOf(c); return { key: c, x: Math.round(p[0] * 10) / 10, y: Math.round(p[1] * 10) / 10, h: st.h[c] || 0 }; });
    /* 덮개 svg(라벨·핀): 무대 크기·viewBox, 라벨 층(.lbls)·핀 층(.hil)을 한 번 만든다(카드를 다시 만들면 새 svg 로 다시 부른다) */
    function overlay(svg) {
      if (st.ov !== svg) {
        st.ov = svg; svg.classList.add('glov'); svg.setAttribute('aria-hidden', 'true'); svg.removeAttribute('role');
        for (const k of ['lbls', 'hil']) if (!svg.querySelector(':scope > .' + k)) { const g = doc.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('class', k); g.setAttribute('aria-hidden', 'true'); svg.appendChild(g); }
      }
      sizeOverlay();
      return svg;
    }
    /* 이름표(Map3D.labels 와 같은 규칙·같은 마크업 — map3d.css 가 칠한다): units = [{ key, name, u, c }], opt = { homeKey, viewKey, strict, narrow, textW }.
       면 안 판정은 그 상자의 가운데·네 귀가 그 면 윗면 안이고 가운데의 맨 위 면이 그 면(maplibre 가 그린 그림). 놓은 라벨 점을 기준으로 남겨 두고, 움직이는 동안 follow 가 그만큼 옮긴다. 반환: [{ key, v, nm, x, y, w, h }] */
    function labels(g, us, opt = {}) {
      st.lblG = g;
      const wOf = opt.textW || m3.textW, SN = m3.shortNames(us.map((x) => x.name));
      const order = us.filter((x) => anchor[x.key]).sort((a, b) => b.u - a.u), rk = new Map(order.map((x, i) => [x.key, i]));
      const hm = order.find((x) => x.key === opt.homeKey); if (hm) { order.splice(order.indexOf(hm), 1); order.unshift(hm); }
      st.base = {};
      const cands = order.map((x) => { const p = anchorOf(x.key), ri = rk.get(x.key); st.base[x.key] = p;
        return { key: x.key, ax: p[0], ay: p[1], nm: SN[x.name] || x.name, v: x.u ? m3.labelNum(x.u) : '', u: x.u, c: x.c, ri, must: (!opt.strict && !!x.u && ri < 5) || x.key === opt.homeKey || x.key === opt.viewKey }; });
      /* 면 안 판정: 가운데·네 귀가 그 면 윗면 고리(지면 투영 + 라벨 점의 높이 몫, 꼭짓점 둘에 하나) 안 + 가운데의 맨 위 면이 그 면(그린 그림 — 앞의 높은 면이 가리면 아님). 같은 점은 한 번만 묻는다 */
      const roofs = new Map(), memo = new Map();
      const roofOf = (key) => {
        if (!roofs.has(key)) { const f = fcBy.get(key), g0 = map.project(anchor[key]), r = anchorOf(key), dx = r[0] - g0.x, dy = r[1] - g0.y;
          roofs.set(key, f ? f.geometry.coordinates.map((poly) => poly[0].filter((p, i) => i % 2 === 0).map((p) => { const q = map.project(p); return [q.x + dx, q.y + dy]; })) : []); }
        return roofs.get(key);
      };
      const top = (x, y) => { const k = `${Math.round(x)},${Math.round(y)}`; if (!memo.has(k)) memo.set(k, topAt([x, y])); return memo.get(k); };
      const inFace = (key, b) => { const R = roofOf(key); return [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]].every(([a, c]) => { const p = [b.x + a * (b.w / 2 - 2), b.y + c * (b.h / 2 - 2)]; return R.some((r) => inRing(p, r)); }) && top(b.x, b.y) === key; };
      const out = placeLabels(cands, { W: st.W, H: st.H, narrow: !!opt.narrow, wOf, inFace }), esc = m3.esc;
      g.innerHTML = out.map((p) => { const two = !!p.v;
        return `<g class="lb-g${p.zero ? ' z' : ''}${p.pill ? ' pl' : ''}" data-area="${p.key}" data-v="${p.v}" data-nm="${esc(p.nm)}" data-box="${p.x},${p.y},${p.w},${p.h}">${p.pill ? `<rect class="plb" x="${p.x - p.w / 2}" y="${p.y - p.h / 2}" width="${p.w}" height="${p.h}" rx="6"/>` : ''}`
          + `<text class="lb nm f${p.c}" x="${p.x}" y="${two ? p.y - 9 : p.y}">${esc(p.nm)}</text>${two ? `<text class="lb f${p.c}" x="${p.x}" y="${p.y + 10}">${p.v}</text>` : ''}</g>`; }).join('');
      return out.map((p) => ({ key: p.key, v: p.v, nm: p.nm, x: p.x, y: p.y, w: p.w, h: p.h }));
    }
    /* 움직이는 동안(끌기·날기·돌리기): 놓은 라벨 묶음과 data-follow 요소를 그 면 라벨 점이 옮겨 간 만큼 옮긴다(자리 잡기는 moveend 에 부르는 쪽이 다시) */
    function follow() {
      if (!st.ov) return;
      const els = [...(st.lblG ? st.lblG.querySelectorAll(':scope > .lb-g[data-area]') : []), ...st.ov.querySelectorAll('[data-follow]')];
      for (const e of els) {
        const k = e.getAttribute('data-area') || e.getAttribute('data-follow'), b = st.base[k], p = b && anchorOf(k);
        if (p) e.setAttribute('transform', `translate(${Math.round((p[0] - b[0]) * 10) / 10} ${Math.round((p[1] - b[1]) * 10) / 10})`); else e.removeAttribute('transform');
      }
    }
    /* 기준점 다시 잡기(덮개 요소를 지금 자리에 새로 그렸을 때 — 예: 핀) */
    const rebase = (code) => { const p = anchorOf(code); if (p) st.base[code] = p; };

    /* 사건 */
    map.on('load', () => {
      const W = el.clientWidth, H = el.clientHeight; st.W = 0; st.H = 0;
      if (W && H) { st.W = W; st.H = H; map.resize(); st.hmax = hmaxFor(H); sizeOverlay(); }
      refit();
      map.once('idle', () => { st.ready = true; emit('ready'); });
    });
    map.on('movestart', () => { if (!st.quiet) emit('movestart'); });
    map.on('move', () => { if (!st.quiet) { follow(); emit('move'); } });
    map.on('moveend', () => { if (!st.quiet) { st.dirty = true; emit('moveend'); } });
    /* 가라앉음('settle'): 움직임이 끝났거나 솟은 면 필터가 바뀐 뒤 첫 idle — 그린 그림 기준으로 이름표를 다시 놓을 때(가리키기·고르기의 idle 에는 내보내지 않는다) */
    map.on('idle', () => { if (st.ready && st.dirty && !st.anim) { st.dirty = false; emit('settle'); } });
    map.on('mousemove', (e) => { const k = topAt([e.point.x, e.point.y]); if (k === st.ptr) return; st.ptr = k; cv.style.cursor = k ? 'pointer' : ''; emit('hover', k, e); });
    map.on('mouseout', () => { if (st.ptr == null) return; st.ptr = null; cv.style.cursor = ''; emit('hover', null); });
    map.on('click', (e) => { const k = topAt([e.point.x, e.point.y]); if (k) emit('pick', k, e); });
    map.on('webglcontextlost', () => emit('lost'));
    map.on('error', (e) => { if (!st.ready && /webgl/i.test(String(e && e.error && e.error.message))) emit('lost'); });

    return {
      map, el, get ready() { return st.ready; }, get target() { return st.target; }, get pending() { return st.dirty; },
      on(t, f) { (st.on[t] = st.on[t] || []).push(f); return this; },
      setSize, setColors, setValues, setClasses, select, hover, flyTo, view, rotateBy, resetView, isHome, project, anchorOf, faces, overlay, labels, follow, rebase,
      heights: () => ({ ...st.h }), destroy() { if (st.anim) st.anim.cancel(); map.remove(); },
    };
  }

  return { PROJ, ISLES, LIFT, CAM, CE, RENDER, toLngLat, fromLngLat, toGeoJSON, ctxGeoJSON, polygonsOf, boundsOf, expand, heightOf, hmaxFor, mPerPx, heightExpr, colorExpr, styleOf, cameraFor, limitsFor, durationOf, placeLabels, supported, load, parseColor, readColors, mount };
});
