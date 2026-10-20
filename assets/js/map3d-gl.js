/* 진짜 3D 시군구 지도(WebGL · MapLibre GL fill-extrusion) 공용 모듈 — /citizen(tools/design/public-mock/build.js 가 끼워 넣는다)과 /map 수도권 개요(assets/js/overview.js — 맥락 면 층·색 단계만 바꾸기 setClasses 를 더 쓴다)가 같은 구현을 쓴다.
   2026-10-18 사용자 결정: 바탕 지도 없이 시군구 면만, WebGL 이 안 되면 부르는 쪽이 SVG 흉내 3D(assets/js/map3d.js — Map3D)로 그린다(supported·load 가 판정).
   - 스타일: 투명 배경 + 시군구 면 GeoJSON 하나(styleOf). 타일·글꼴(glyphs)·스프라이트 요청 0. 라벨·핀은 지도 위 SVG 덮개(이름표 규칙은 Map3D.labels 와 같은 뜻, 클래스·모양도 map3d.css 그대로).
   - 좌표: region-map 경로(투영 정수 x = (경도 − 124.5)·cos37.5°·1000, y = (38.4 − 위도)·1000)를 경위도로 되돌린다(toLngLat). 경계는 Map3D 의 공유 호로 다듬는다(이웃끼리 같은 좌표 — 틈·겹침 없음).
   - 높이: 값 → 화면 px(heightOf — Map3D.faceH 와 같은 척도: 0호 평평, 4 + (Hmax − 4)·(u/umax)^0.75, Hmax = 무대 높이 8%·16~48) → 미터(heightExpr — 확대 단계가 1 오르면 미터는 절반, 지수 0.5 보간이라
     확대·축소해도 같은 화면 높이). 같은 값 = 같은 높이, 값 순위 = 높이 순위(G15). 배율(umax)은 부르는 쪽이 판 하나로 고정해 넘긴다(시도를 확대해도 높이 순위·색 구간이 튀지 않게).
   - 0호 면은 평평한 면(fill) + 경계선, 값이 있는 면만 솟는다(fill-extrusion, 필터 = 지금 솟은 코드). 고른 곳·가리킨 곳은 feature-state 만(sel 5px · hv 2px 띄움 + 윗면 조금 밝게 + 평평한 면은 면 계열 1.25px 윤곽) — 기하·source 는 다시 만들지 않는다(G16).
   - 시군구 경계(2026-10-19): 바닥 경계선(gl-line .75) + 솟은 윗면 안쪽 띠(gl-rim — rimGeoJSON, 확대 단계마다 한 벌 · 필터·feature-state 는 솟은 면과 같다, 색 = 그 면 색을 그늘 쪽으로 --map-edge-mix).
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
  /* 공유 호 다듬기: Visvalingam(1 단위²) → Chaikin 2회(면 고리·시도 경계선이 같은 점을 쓴다) */
  const smoothArc = (m3, a) => m3.chaikin(m3.simplifyVW(a.pts, a.closed, 1), a.closed, 2);
  /* 면 고리(투영 좌표): 다듬기(smooth)면 Map3D 공유 호를 Visvalingam(1 단위²) → Chaikin 2회로(양쪽 면이 같은 점), 아니면 원본 경로 그대로 */
  function ringsOfUnits(units, smooth) {
    const m3 = M3();
    if (!smooth || !m3) return new Map(units.map((u) => [u.code, m3 ? m3.ringsOf(u.d) : []]));
    const base = m3.prep(units.map((u) => ({ code: u.code, s: u.s, n: nameOf(u), d: u.d, lx: u.lx, ly: u.ly }))), { reg, rings } = m3.arcsOf(base), sm = new Map();
    const arc = (key) => { if (!sm.has(key)) sm.set(key, smoothArc(m3, reg.get(key))); return sm.get(key); };
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
  /* 시도 경계선 GeoJSON(순수, 2026-10-19 사용자 결정 — /citizen 시도 보기): 이웃한 두 면의 시도가 다른 공유 호만 모은 선(면과 같은 다듬기라 면 경계와 꼭 겹친다).
     바깥 해안선(이웃 없는 호)·같은 시도 안 경계는 넣지 않는다. o = { omit(기본 섬 둘), smooth(기본 true) }. 시도 짝마다 MultiLineString 하나(속성 id = 두 시도 코드를 이은 것 '1141', a·b), 없으면 null */
  function sidoLines(units, o = {}) {
    const m3 = M3(), omit = new Set(o.omit || ISLES), own = units.filter((u) => !omit.has(u.code)), sOf = new Map(own.map((u) => [u.code, u.s])), by = new Map();
    const { reg } = m3.arcsOf(m3.prep(own.map((u) => ({ code: u.code, s: u.s, n: nameOf(u), d: u.d, lx: u.lx, ly: u.ly }))));
    for (const a of reg.values()) {
      if (a.owners.length !== 2) continue;
      const [p, q] = a.owners.map((c) => sOf.get(c)).sort(); if (!p || !q || p === q) continue;
      const pts = (o.smooth === false ? a.pts : smoothArc(m3, a)).map(toLngLat); if (pts.length < 2) continue;
      if (!by.has(p + q)) by.set(p + q, { a: p, b: q, lines: [] });
      by.get(p + q).lines.push(a.closed ? [...pts, pts[0]] : pts);
    }
    const fs = [...by].sort(([x], [y]) => (x < y ? -1 : 1)).map(([id, v]) => ({ type: 'Feature', properties: { id, a: v.a, b: v.b }, geometry: { type: 'MultiLineString', coordinates: v.lines } }));
    return fs.length ? { type: 'FeatureCollection', features: fs } : null;
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
  /* 보는 시도 밖 면(feature-state out, 2026-10-19 — mount o.scope 를 준 화면만): 맥락 회색·평평, 고른 곳·가리킨 곳 효과 없음. 시도 경계선은 보는 시도에 닿으면 on(진하게) */
  const OUT = ['boolean', ['feature-state', 'out'], false], ON = ['boolean', ['feature-state', 'on'], false];
  /* 범례 구간 강조(feature-state bd · dim, 2026-10-19 — o.scope 를 준 화면만): 그 구간 면은 가리킨 곳처럼 2px 띄우고 윗면 조금 밝게, 나머지는 흐린 색(가리킨 곳·고른 곳은 흐리지 않는다) */
  const BD = ['boolean', ['feature-state', 'bd'], false], DIM = ['boolean', ['feature-state', 'dim'], false];
  /* 보는 시도 둘레 밖 면(feature-state hid, 2026-10-19 사용자 피드백 '서울은 지역 경계 1레벨까지만' — Map3D.nearOf 의 hide): 면·경계선·판 그늘 모두 투명(그리지 않는다), 시도 경계선도 같은 이름으로(보는 시도에 닿지 않은 선) */
  const HID = ['boolean', ['feature-state', 'hid'], false], CLEAR = ['rgba', 0, 0, 0, 0];
  /* fill-extrusion-height 식: 면 높이 px(feature-state h) + 띄움 → 미터. 확대 단계 지수 0.5 보간이라 화면 높이가 확대와 상관없이 같다. o.scope 면 out 은 0(옵션이 없으면 예전 식 그대로).
     o.add(px, 경계 띠 윗면 — 2026-10-19)를 주면 그만큼 더한다 */
  function heightExpr(o = {}) {
    const up = o.scope ? ['case', SEL, LIFT.sel, HV, LIFT.hv, BD, LIFT.hv, 0] : ['case', SEL, LIFT.sel, HV, LIFT.hv, 0];
    const lifted = ['+', ['coalesce', ['feature-state', 'h'], 0], up], px0 = o.scope ? ['case', OUT, 0, lifted] : lifted, px = o.add ? ['+', px0, o.add] : px0;
    return ['interpolate', ['exponential', .5], ['zoom'], CAM.z0, ['*', px, mPerPx(CAM.z0)], CAM.z1, ['*', px, mPerPx(CAM.z1)]];
  }
  /* 색 식: feature-state c(색 단계 0~5) → 토큰 색, 고른 곳·가리킨 곳은 윗면이 조금 밝은 색(lift). cols = readColors 결과 */
  const rgbaOf = (c) => ['rgba', c[0], c[1], c[2], c[3] == null ? 1 : c[3]];
  const byClass = (list) => ['match', ['coalesce', ['feature-state', 'c'], 0], ...list.flatMap((c, i) => [i, rgbaOf(c)]), rgbaOf(list[0])];
  /* o.scope 면 out 은 맥락 회색(cols.ctx)이 먼저, 그다음 흐린 면(dim, 고른 곳·가리킨 곳 제외 — cols.dim), 구간 면(bd)은 고른 곳처럼 밝게(옵션이 없으면 예전 식 그대로). 경계선도 out 면은 맥락 면 경계(카드색) */
  /* 고른 곳 선택 색(cols.sel, 2026-10-19 사용자 피드백 '선택 지역구가 기존 색상과 같아 구분이 안 된다' — /citizen 토큰 --cz-map-sel): 있으면 고른 면은 램프 밖 색으로(흐림·구간보다 먼저), 없으면(/map 개요) 예전처럼 6% 밝힘 */
  const outColor = (cols) => ['case', HID, CLEAR, rgbaOf(cols.ctx || [0, 0, 0, 0])];
  const colorExpr = (cols, o = {}) => {
    const sel = cols.sel ? [SEL, rgbaOf(cols.sel)] : [], lit = byClass(cols.lift), face = byClass(cols.face);
    return o.scope ? ['case', OUT, outColor(cols), ...sel, ['all', DIM, ['!', ['any', SEL, HV]]], byClass(cols.dim || cols.face), ['any', SEL, HV, BD], lit, face] : ['case', ...sel, ['any', SEL, HV], lit, face];
  };
  /* 바닥 윤곽(gl-hl): 고른 곳은 선택 색 진한 쪽(cols.selLine) 1.5px, 그 밖은 단계 계열 1.25px(cols.selLine 이 없으면 예전 그대로) */
  const hlColor = (cols) => (cols.selLine ? ['case', SEL, rgbaOf(cols.selLine), byClass(cols.ce)] : byClass(cols.ce));
  const hlWidth = (cols) => (cols.selLine ? ['case', SEL, 1.5, 1.25] : 1.25);
  const lineExpr = (cols, o = {}) => (o.scope ? ['case', HID, CLEAR, OUT, rgbaOf(cols.ctxLine || cols.line), rgbaOf(cols.line)] : rgbaOf(cols.line));
  const seaExpr = (cols, o = {}) => (o.scope ? ['case', HID, CLEAR, rgbaOf(cols.sea)] : rgbaOf(cols.sea));
  const hlOpacity = (o = {}) => (o.scope ? ['case', OUT, 0, ['any', SEL, HV, BD], 1, 0] : ['case', ['any', SEL, HV], 1, 0]);
  /* 시도 경계선 칠: 보는 시도에 닿은 선(on) = --map-sido-line · 굵기 sidoW[0], 나머지 = --map-sido-line-weak · sidoW[1](수도권 전체 보기). 시도를 보면 닿지 않은 선(hid)은 투명 */
  const sidoPaint = (cols) => { const w = cols.sidoW || [2, 1.25]; return { 'line-color': ['case', HID, CLEAR, ON, rgbaOf(cols.sido || cols.line), rgbaOf(cols.sidoWeak || cols.line)], 'line-width': ['case', ON, w[0], w[1]] }; };
  /* 고른 곳 윤곽색: 그 면 단계 계열에서 대비가 나는 단계(map3d.css .lift --ce 와 같은 대응) */
  const CE = [3, 3, 4, 1, 2, 2];
  /* ---------- 시군구 경계 띠(순수, 2026-10-19 사용자 피드백 '지역구별 경계를 명확하게 구분' — /citizen·/map 개요) ----------
     경계선(gl-line)은 바닥에 그려 솟은 면 윗면 둘레에는 선이 없다 → 윗면 위에 안쪽으로 얇은 띠를 하나 더 솟힌다(fill-extrusion gl-rim, 바닥 = 그 면 높이 · 윗면 = + RIM.eps px).
     띠 = 고리의 변마다 안쪽 법선 방향 사각형(GeoJSON 바깥 고리 반시계·구멍 시계라 어느 고리든 진행 방향 왼쪽이 면 안). 맞댄 두 면이 각자 안쪽에 하나씩이라 틈은 두 띠 폭.
     폭(미터) = 화면 px(--map-edge-w, 한쪽) × 확대 단계 t 의 지면 1px 미터 — 띠 한 벌은 확대 단계 하나(rimTier = 반올림)에 맞춘 것이라 t ± 0.5 에서 0.71~1.41배(확대해도 굵어지지 않게 단계마다 다른 벌).
     꼭짓점 줄이기: 고리를 폭의 RIM.tol 허용(Douglas–Peucker, 미터)으로 줄인 뒤 사각형을 만든다(띠 바깥 변이 면 경계에서 0.3px 안 — 지도 첫 벌 약 6천 변) */
  const RIM = { tol: .3, eps: .3, z: [5, 12] };
  const DEG = EARTH / 360, KX = Math.cos(CAM.lat * Math.PI / 180);
  const rimTier = (z) => Math.max(RIM.z[0], Math.min(RIM.z[1], Math.round(z)));
  /* 열린 선 Douglas–Peucker(미터 좌표, 양 끝 유지) */
  function dpLine(p, tol) {
    const keep = new Uint8Array(p.length), stack = [[0, p.length - 1]]; keep[0] = keep[p.length - 1] = 1;
    while (stack.length) {
      const [i, j] = stack.pop(), [ax, ay] = p[i], dx = p[j][0] - ax, dy = p[j][1] - ay, L = Math.hypot(dx, dy) || 1; let dmax = -1, k = -1;
      for (let m = i + 1; m < j; m++) { const d = Math.abs((p[m][0] - ax) * dy - (p[m][1] - ay) * dx) / L; if (d > dmax) { dmax = d; k = m; } }
      if (dmax > tol) { keep[k] = 1; stack.push([i, k], [k, j]); }
    }
    return p.filter((_, i) => keep[i]);
  }
  /* 닫힌 고리(경위도, 끝 = 처음) → 안쪽 띠 사각형 [[[경도, 위도] × 5]] 목록. 줄인 고리가 세 점 아래(폭보다 작은 조각)면 없음 */
  function rimQuads(ring, w, tol) {
    const m = ring.map(([x, y]) => [x * DEG * KX, y * DEG]), n = m.length - 1; if (n < 3) return [];
    let k = 1, fd = -1; for (let i = 1; i < n; i++) { const d = Math.hypot(m[i][0] - m[0][0], m[i][1] - m[0][1]); if (d > fd) { fd = d; k = i; } }
    const s = dpLine(m.slice(0, k + 1), tol).concat(dpLine(m.slice(k), tol).slice(1)); if (s.length < 4) return [];
    const ll = ([x, y]) => [r6(x / (DEG * KX)), r6(y / DEG)], out = [];
    for (let i = 0; i + 1 < s.length; i++) {
      const [ax, ay] = s[i], [bx, by] = s[i + 1], L = Math.hypot(bx - ax, by - ay); if (!L) continue;
      const nx = -(by - ay) / L * w, ny = (bx - ax) / L * w, q = [[ax, ay], [bx, by], [bx + nx, by + ny], [ax + nx, ay + ny]].map(ll);
      out.push([[...q, q[0]]]);
    }
    return out;
  }
  /* 경계 띠 GeoJSON(순수): fc = toGeoJSON 결과, t = 확대 단계, o = { px(한쪽 띠 화면 px, 기본 1) }. 면마다 MultiPolygon 하나(속성 code — promoteId, 면과 같은 feature-state 열쇠) */
  function rimGeoJSON(fc, t, o = {}) {
    const w = (o.px == null ? 1 : o.px) * mPerPx(t, { pitch: 90 }), tol = w * RIM.tol;
    return { type: 'FeatureCollection', features: fc.features.map((f) => ({ type: 'Feature', properties: { code: f.properties.code }, geometry: { type: 'MultiPolygon', coordinates: f.geometry.coordinates.flatMap((poly) => poly.flatMap((r) => rimQuads(r, w, tol))) } })).filter((f) => f.geometry.coordinates.length) };
  }
  /* 경계 띠 색(2026-10-19 사용자 피드백 '흰색이니 촌스럽네'): 그 면의 지금 색(colorExpr 와 같은 상태 식 — 단계·선택 색·가리킴·구간·흐림)을 그늘 cols.shade(--map-shade) 쪽으로 cols.edgeMix(--map-edge-mix)만큼 섞은 팔레트.
     fill-extrusion 은 색의 투명도를 쓰지 않아 숨김은 필터로(솟은 면 필터와 같은 목록 — 밖 면·숨긴 면은 들지 않는다) */
  const edgeCols = (cols) => { const s = cols.shade || [0, 0, 0], t = cols.edgeMix == null ? .2 : cols.edgeMix, m = (c) => (c ? mix(c, s, t) : c); return { ...cols, face: cols.face.map(m), lift: cols.lift.map(m), dim: cols.dim && cols.dim.map(m), sel: m(cols.sel) }; };
  const rimPaint = (cols, so) => ({ 'fill-extrusion-color': colorExpr(edgeCols(cols), so), 'fill-extrusion-base': heightExpr(so), 'fill-extrusion-height': heightExpr({ ...so, add: RIM.eps }), 'fill-extrusion-opacity': 1, 'fill-extrusion-vertical-gradient': false });
  /* 렌더 상수: 빛 하나(화면 기준 왼쪽 아래 240° · 위에서 30°, 흰빛 — 왼쪽을 향한 벽 밝게 · 보는 쪽 중간 · 오른쪽 어둡게), 판 그늘 아래로 6px */
  const RENDER = { light: { anchor: 'viewport', color: 'white', intensity: .35, position: [1.15, 240, 30] }, seaY: 6 };
  const LAYERS_Q = ['gl-ext', 'gl-flat'];
  const EMPTY = ['in', ['get', 'code'], ['literal', []]];
  /* 스타일(순수): 배경(투명) · 판 그늘(fill 아래로 6px) · 평평한 면(fill) · 경계선 · 고른 곳 윤곽 · 솟은 면(fill-extrusion). 타일·글꼴·스프라이트 없음.
     ctxFc(맥락 면 GeoJSON, 선택 — /map 개요)를 주면 배경 바로 위에 평평한 맥락 면(--map-ctx)·경계(카드색) 두 층을 더한다(주지 않으면 예전과 같은 층).
     sc(보는 시도 모드, 선택 — /citizen, 2026-10-19) = { lines(sidoLines 결과 또는 null) }: 색·높이·경계·윤곽 식이 out 을 받고, 고른 곳 윤곽 위·솟은 면 아래에 시도 경계선(gl-sido)을 더한다(솟은 면이 앞을 가리면 가려진다).
     맨 위는 경계 띠(gl-rim, source rim — 처음엔 비어 있고 mount 가 확대 단계에 맞는 벌을 넣는다, 2026-10-19) */
  const EMPTY_FC = { type: 'FeatureCollection', features: [] };
  const ctxLayers = (cols) => [
    { id: 'gl-ctx', type: 'fill', source: 'ctx', paint: { 'fill-color': rgbaOf(cols.ctx || [0, 0, 0, 0]) } },
    { id: 'gl-ctx-line', type: 'line', source: 'ctx', layout: { 'line-join': 'round' }, paint: { 'line-color': rgbaOf(cols.ctxLine || cols.line), 'line-width': .75 } },
  ];
  function styleOf(fc, cols, ctxFc, sc) {
    const so = sc ? { scope: true } : {}, lines = sc && sc.lines;
    return {
      version: 8, name: 'sgg-3d', light: RENDER.light,
      sources: { sgg: { type: 'geojson', data: fc, promoteId: 'code' }, ...(ctxFc ? { ctx: { type: 'geojson', data: ctxFc } } : {}), ...(lines ? { sido: { type: 'geojson', data: lines, promoteId: 'id' } } : {}), rim: { type: 'geojson', data: EMPTY_FC, promoteId: 'code' } },
      layers: [
        { id: 'gl-bg', type: 'background', paint: { 'background-color': rgbaOf([0, 0, 0, 0]) } },
        ...(ctxFc ? ctxLayers(cols) : []),
        { id: 'gl-sea', type: 'fill', source: 'sgg', paint: { 'fill-color': seaExpr(cols, so), 'fill-translate': [0, RENDER.seaY], 'fill-translate-anchor': 'viewport', 'fill-antialias': false } },
        { id: 'gl-flat', type: 'fill', source: 'sgg', paint: { 'fill-color': colorExpr(cols, so) } },
        { id: 'gl-line', type: 'line', source: 'sgg', layout: { 'line-join': 'round' }, paint: { 'line-color': lineExpr(cols, so), 'line-width': .75 } },
        { id: 'gl-hl', type: 'line', source: 'sgg', layout: { 'line-join': 'round' }, paint: { 'line-color': hlColor(cols), 'line-width': hlWidth(cols), 'line-opacity': hlOpacity(so) } },
        ...(lines ? [{ id: 'gl-sido', type: 'line', source: 'sido', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: sidoPaint(cols) }] : []),
        { id: 'gl-ext', type: 'fill-extrusion', source: 'sgg', filter: EMPTY, paint: { 'fill-extrusion-color': colorExpr(cols, so), 'fill-extrusion-height': heightExpr(so), 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 1, 'fill-extrusion-vertical-gradient': true } },
        { id: 'gl-rim', type: 'fill-extrusion', source: 'rim', filter: EMPTY, paint: rimPaint(cols, so) },
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
  /* 카메라 여백(순수, mount 가 o.padding 을 받지 않았을 때): 기본(수도권 전체·보는 시도 모드가 아닌 화면) = 위 면 높이 + 14 · 옆 12 · 아래 14.
     tight(보는 시도로 확대 — /citizen, 2026-10-19 사용자 피드백 '그 시도 모양으로 상하좌우 여백 없이'): 위 = 면 높이 + 고른 곳 띄움(솟은 윗면이 잘리지 않게), 아래 = 판 그늘, 옆 = 이름표 가장자리 2px */
  const padFor = (hmax, tight) => (tight ? { top: hmax + LIFT.sel, right: 2, bottom: RENDER.seaY, left: 2 } : { top: hmax + 14, right: 12, bottom: 14, left: 12 });
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
     고른 곳 윗면 = 면 색 94% + 카드색(라이트)·글자색(다크) 6%(map3d.css .up-top 과 같다), 윤곽 = CE 단계, 판 그늘 = --map-shade 6%(다크 40%), 맥락 면 = --map-ctx · 경계 카드색(map3d.css .ctx 와 같다),
     시도 경계선 = --map-sido-line(보는 시도)·--map-sido-line-weak, 굵기 --map-sido-w·--map-sido-w-weak(px, map3d.css .sdl 과 같다), 시군구 경계 띠 한쪽 폭 --map-edge-w(px)·색 섞음 --map-edge-mix(그늘 --map-shade 쪽, map3d.css .f 테두리와 같다), 흐린 면 = 면 색 --map-dim-mix + 카드색(map3d.css .fg.dim 과 같다),
     선택 색 --cz-map-sel·--cz-map-sel-line(정의된 화면만 — 없으면 null, 예전 식) */
  function readColors(el) {
    const doc = el.ownerDocument, cs = doc.defaultView.getComputedStyle(el), v = (n) => parseColor(cs.getPropertyValue(n).trim() || 'transparent', doc);
    const px = (n, d) => { const x = parseFloat(cs.getPropertyValue(n)); return Number.isFinite(x) ? x : d; };
    const dark = !!(el.closest && el.closest('.dark')), face = [0, 1, 2, 3, 4, 5].map((i) => v(`--map-ov-${i}`)), toward = v(dark ? '--foreground' : '--card'), shade = v('--map-shade'), card = v('--card');
    const keep = px('--map-dim-mix', 35) / 100, opt = (n) => (cs.getPropertyValue(n).trim() ? v(n) : null);   // 선택 색은 토큰이 있는 화면(/citizen)만
    return { face, sel: opt('--cz-map-sel'), selLine: opt('--cz-map-sel-line'), lift: face.map((c) => mix(c, toward, .06)), dim: face.map((c) => mix(c, card, 1 - keep)), ce: CE.map((i) => face[i]), line: v('--map-ov-line'), sea: [shade[0], shade[1], shade[2], dark ? .4 : .06], ctx: v('--map-ctx'), ctxLine: v('--card'),
      sido: v('--map-sido-line'), sidoWeak: v('--map-sido-line-weak'), sidoW: [px('--map-sido-w', 2), px('--map-sido-w-weak', 1.25)], edgeW: px('--map-edge-w', 1), shade: shade.slice(0, 3), edgeMix: px('--map-edge-mix', 20) / 100, dark };
  }

  /* 지도 붙이기: el(크기가 있는 빈 칸) 에 maplibre 지도 하나. o = { units, omit, target(처음 볼 시도 또는 null), maplibregl, colors, pitch, bearing, padding(stage → {top,right,bottom,left}), ctx(맥락 면 [{ code, d }], 선택),
     scope(보는 시도 모드, 선택 — 키를 주면 켜진다: 처음 볼 시도 또는 null, 이후 setScope) }.
     사건: 'ready'(첫 그림이 끝난 idle) · 'settle'(움직임·필터가 가라앉은 뒤 첫 idle — 이름표를 다시 놓을 때) · 'pick'(코드) · 'hover'(코드|null) · 'movestart' · 'move' · 'moveend' · 'lost'(WebGL 맥락 잃음 → 부르는 쪽 SVG 로). 반환 = 조작 API(아래 return) */
  function mount(el, o) {
    const doc = el.ownerDocument, win = doc.defaultView, ml = o.maplibregl || win.maplibregl, m3 = M3();
    const omit = o.omit || ISLES, units = o.units.filter((u) => !omit.includes(u.code)), codes = units.map((u) => u.code);
    const fc = toGeoJSON(o.units, { omit, smooth: o.smooth !== false });
    const anchor = Object.fromEntries(units.map((u) => [u.code, toLngLat([u.lx, u.ly])])), fcBy = new Map(fc.features.map((f) => [f.properties.code, f]));
    const P0 = o.pitch == null ? CAM.pitch : o.pitch, B0 = o.bearing == null ? CAM.bearing : o.bearing;
    const scoped = 'scope' in o, SO = scoped ? { scope: true } : {}, sOf = Object.fromEntries(units.map((u) => [u.code, u.s])), sidoFc = scoped ? sidoLines(o.units, { omit, smooth: o.smooth !== false }) : null, nbBase = scoped ? m3.prep(units.map((u) => ({ code: u.code, s: u.s, n: nameOf(u), d: u.d, lx: u.lx, ly: u.ly }))) : null;
    const st = { ready: false, quiet: 0, target: o.target === undefined ? null : o.target, W: 0, H: 0, hmax: 32, h: {}, vals: {}, umax: 0, ext: '', sel: null, hv: null, ptr: null, anim: null,
      dirty: false, cols: o.colors || readColors(el), on: {}, ov: null, lblG: null, base: {}, samples: new Map(), loaded: false, scope: null, want: scoped ? o.scope || null : null, out: new Set(), hid: new Set(), nearMemo: new Map(), extRaw: [], bd: new Set(), dim: new Set(), rimT: null, rims: new Map() };
    const emit = (t, ...a) => (st.on[t] || []).forEach((f) => f(...a));
    const coarse = !!(win.matchMedia && win.matchMedia('(pointer: coarse)').matches);
    const cap = boundsOf(o.units, null, { omit });
    const map = new ml.Map({ container: el, style: styleOf(fc, st.cols, ctxGeoJSON(o.ctx), scoped ? { lines: sidoFc } : undefined), attributionControl: false, maplibreLogo: false, trackResize: false, renderWorldCopies: false, fadeDuration: 0,
      bounds: cap, fitBoundsOptions: { padding: 12 }, pitch: P0, bearing: B0, maxPitch: CAM.maxPitch, minPitch: 0,
      scrollZoom: false, boxZoom: false, doubleClickZoom: false, keyboard: false, dragPan: !coarse, dragRotate: true, pitchWithRotate: true, touchPitch: true, touchZoomRotate: true,
      canvasContextAttributes: { antialias: true } });
    /* 캔버스는 탭 정지점·영문 이름을 갖지 않는다(지도 이름·키보드는 부르는 쪽 칸이 맡는다) */
    const cv = map.getCanvas(); cv.removeAttribute('tabindex'); cv.removeAttribute('role'); cv.removeAttribute('aria-label'); el.setAttribute('aria-hidden', 'true');
    /* feature-state 는 면(sgg)과 경계 띠(rim)에 같이 — 띠 높이가 면 높이·띄움·밖 면을 그대로 따른다 */
    const fs = (code, s) => { map.setFeatureState({ source: 'sgg', id: code }, s); map.setFeatureState({ source: 'rim', id: code }, s); };
    const zNow = () => map.getZoom();
    const lift = (c) => (c && c === st.sel ? LIFT.sel : c && (c === st.hv || st.bd.has(c)) ? LIFT.hv : 0);
    const roofPx = (c) => (st.h[c] > 0 && !st.out.has(c) ? st.h[c] + lift(c) : 0);   // 평평한 면(필터 밖·보는 시도 밖)은 띄우지 않는다
    /* 화면 좌표(높이 반영): 경위도 ll 을 그 면(code) 윗면 높이로 올려 투영. 높이 투영은 maplibre 변환의 고도 투영(지형과 같은 길)을 쓰고, 없으면 지면 투영 − px */
    function project(ll, code) {
      const px = code ? roofPx(code) : 0, m = px * mPerPx(zNow()), tf = map.transform;
      if (m > 0 && tf && typeof tf.locationToScreenPoint === 'function') {
        try { const p = tf.locationToScreenPoint(new ml.LngLat(ll[0], ll[1]), { getElevationForLngLat: () => m }); if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return [p.x, p.y]; } catch (_) { /* 아래 근사로 */ }
      }
      const p = map.project(ll); return [p.x, p.y - px * Math.sin(map.getPitch() * Math.PI / 180) / Math.sin(CAM.pitch * Math.PI / 180)];
    }
    const anchorOf = (code) => (anchor[code] ? project(anchor[code], code) : null);
    /* 맨 위 면 코드(화면 점): 솟은 면 → 평평한 면 순, 3D 는 maplibre 가 앞쪽부터 준다. 투명하게 둔 면(hid)은 없는 면으로 */
    const topAt = (pt) => { for (const f of map.queryRenderedFeatures(pt, { layers: LAYERS_Q })) { const k = String(f.id != null ? f.id : f.properties.code); if (!st.hid.has(k)) return k; } return null; };   // 그리지 않는 면(hid)은 건너뛴다
    /* 솟은 면 필터: 바뀔 때만(작업 스레드가 다시 묶는다 — 값을 바꿀 때·보는 시도를 바꿀 때만, 고르기·가리키기에서는 부르지 않는다). 보는 시도 밖 면(out)은 뺀다 */
    const setExt = (list) => { st.extRaw = list; const l = list.filter((c) => !st.out.has(c)), k = l.slice().sort().join(); if (k === st.ext) return; st.ext = k; st.dirty = true; const f = ['in', ['get', 'code'], ['literal', l]]; map.setFilter('gl-ext', f); map.setFilter('gl-rim', f); };   // 경계 띠도 같은 목록(솟은 면 윗면만)
    const applyH = (h) => { for (const c of codes) { const v = h[c] || 0; if (v !== st.h[c]) { st.h[c] = v; fs(c, { h: v }); } } };
    /* 상자 맞춤 표본(그 범위 면 꼭짓점 몇 개 건너 하나) */
    const samplesOf = (target) => {
      const k = target == null ? '*' : target;
      if (!st.samples.has(k)) { const pts = []; for (const f of fc.features) if (target == null || f.properties.s === target) for (const poly of f.geometry.coordinates) poly[0].forEach((p, i) => { if (i % 3 === 0) pts.push(p); }); st.samples.set(k, pts); }
      return st.samples.get(k);
    };
    const padOf = (target) => (o.padding ? o.padding({ W: st.W, H: st.H, hmax: st.hmax }) : padFor(st.hmax, scoped && target != null));
    /* 기울인 카메라 맞춤: 위에서 본 맞춤(cameraFor)에서 시작해 실제 투영(기울기·방향·원근)으로 상자 넘침·치우침을 세 번까지 고친다. 계산 중 움직임 사건은 내보내지 않는다 */
    function fitCam(target) {
      const b = target == null ? cap : boundsOf(o.units, target, { omit }) || cap, pad = padOf(target), pts = samplesOf(target);
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
    /* 경계 띠 한 벌 고르기: 확대 단계를 반올림한 벌이 바뀔 때만 rim source 에 넣는다(만든 벌은 기억 — 확대·축소를 오가도 다시 만들지 않는다).
       카메라만 이것을 부른다 — 값·고르기·가리키기·보는 시도·구간 강조는 feature-state·필터만(G16) */
    function syncRim() {
      const t = rimTier(zNow()); if (t === st.rimT) return;
      st.rimT = t; if (!st.rims.has(t)) st.rims.set(t, rimGeoJSON(fc, t, { px: st.cols.edgeW }));
      map.getSource('rim').setData(st.rims.get(t));
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
      const w0 = st.cols.edgeW; st.cols = cols || readColors(el);
      map.setPaintProperty('gl-rim', 'fill-extrusion-color', rimPaint(st.cols, SO)['fill-extrusion-color']);   // 다크·단계 램프 전환 때 띠 색도
      if (st.cols.edgeW !== w0) { st.rims.clear(); st.rimT = null; if (st.loaded) syncRim(); }   // 띠 폭 토큰이 바뀌면 벌을 다시
      map.setPaintProperty('gl-sea', 'fill-color', seaExpr(st.cols, SO));
      map.setPaintProperty('gl-flat', 'fill-color', colorExpr(st.cols, SO));
      map.setPaintProperty('gl-line', 'line-color', lineExpr(st.cols, SO));
      map.setPaintProperty('gl-hl', 'line-color', hlColor(st.cols)); map.setPaintProperty('gl-hl', 'line-width', hlWidth(st.cols));
      map.setPaintProperty('gl-ext', 'fill-extrusion-color', colorExpr(st.cols, SO));
      if (map.getLayer('gl-sido')) { const sp = sidoPaint(st.cols); map.setPaintProperty('gl-sido', 'line-color', sp['line-color']); map.setPaintProperty('gl-sido', 'line-width', sp['line-width']); }
      if (map.getLayer('gl-ctx')) { map.setPaintProperty('gl-ctx', 'fill-color', rgbaOf(st.cols.ctx || [0, 0, 0, 0])); map.setPaintProperty('gl-ctx-line', 'line-color', rgbaOf(st.cols.ctxLine || st.cols.line)); }
    }
    /* 보는 시도(2026-10-19 사용자 결정, mount o.scope 를 준 화면만 — /citizen): 그 시도 밖 면은 맥락 회색·평평(feature-state out — 색·높이·윤곽 식이 받는다), 솟은 면 필터에서도 뺀다.
       밖 면 가운데 1단계 이웃(Map3D.nearOf — 맞댄 변이 있는 면, 둘러싸인 면 포함)만 남기고 나머지는 투명(hid — 면·경계선·판 그늘·가리킴·누름 없음).
       시도 경계선은 보는 시도에 닿은 것만 진하게(feature-state on), 나머지는 투명(hid). null = 수도권 전체(모두 칠함, 경계선은 모두 옅게). 기하·source 는 다시 만들지 않는다(G16). 붙기 전이면 붙을 때. 반환: 바꿨으면 true */
    function setScope(sd) {
      if (!scoped) return false;
      const s = sd || null; st.want = s;
      if (!st.loaded || s === st.scope) return false;
      st.scope = s;
      if (s && !st.nearMemo.has(s)) st.nearMemo.set(s, new Set(m3.nearOf(nbBase, s).hide));
      const hd = s ? st.nearMemo.get(s) : new Set();   // 이웃 1단계 밖 면 = 그리지 않는다(카드 바탕이 보이게, 2026-10-19)
      for (const c of codes) {
        const out = !!s && sOf[c] !== s, hid = out && hd.has(c);
        if (out !== st.out.has(c) || hid !== st.hid.has(c)) { st.out[out ? 'add' : 'delete'](c); st.hid[hid ? 'add' : 'delete'](c); fs(c, { out, hid }); }
      }
      if (sidoFc) for (const f of sidoFc.features) { const on = !!s && (f.properties.a === s || f.properties.b === s); map.setFeatureState({ source: 'sido', id: f.properties.id }, { on, hid: !!s && !on }); }
      setExt(st.extRaw); st.dirty = true;
      return true;
    }
    /* 범례 구간 강조(2026-10-19, mount o.scope 를 준 화면만 — /citizen): list = 그 구간 면 코드(bd — 2px 띄움·윗면 조금 밝게), 나머지 면은 흐리게(dim). null = 풀기.
       보는 시도 밖 면(out)은 색 식이 먼저 받아 그대로 회색. feature-state 만 바꾼다(기하·source·필터 그대로, G16). 반환: 바꿨으면 true */
    function setBand(list) {
      if (!scoped || !st.loaded) return false;
      const on = list ? new Set(list) : null; let moved = false;
      for (const c of codes) {
        const bd = !!on && on.has(c), dim = !!on && !bd;
        if (bd === st.bd.has(c) && dim === st.dim.has(c)) continue;
        moved = true; st.bd[bd ? 'add' : 'delete'](c); st.dim[dim ? 'add' : 'delete'](c); fs(c, { bd, dim });
      }
      return moved;
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
    /* 면 라벨 점(윗면 높이 반영) 화면 좌표 목록 — 키보드 이동(Map3D.keyMove 의 F)·핀·거리순 늦춤이 쓴다. 그리지 않는 면(hid)은 뺀다 */
    const faces = () => codes.filter((c) => !st.hid.has(c)).map((c) => { const p = anchorOf(c); return { key: c, x: Math.round(p[0] * 10) / 10, y: Math.round(p[1] * 10) / 10, h: st.out.has(c) ? 0 : st.h[c] || 0 }; });
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
      st.loaded = true; syncRim(); setScope(st.want);
      map.once('idle', () => { st.ready = true; emit('ready'); });
    });
    map.on('movestart', () => { if (!st.quiet) emit('movestart'); });
    map.on('move', () => { if (!st.quiet) { follow(); emit('move'); } });
    map.on('moveend', () => { if (!st.quiet) { st.dirty = true; emit('moveend'); } });
    map.on('zoom', () => { if (!st.quiet && st.loaded) syncRim(); });   // 맞춤 계산(quiet) 중 잠깐 바뀐 확대는 건너뛴다
    /* 가라앉음('settle'): 움직임이 끝났거나 솟은 면 필터가 바뀐 뒤 첫 idle — 그린 그림 기준으로 이름표를 다시 놓을 때(가리키기·고르기의 idle 에는 내보내지 않는다) */
    map.on('idle', () => { if (st.ready && st.dirty && !st.anim) { st.dirty = false; emit('settle'); } });
    /* 보는 시도 밖 면(out)은 가리킴을 내보내지 않는다(면 효과·미리보기 없음) — 누르면 'pick' 은 그대로(부르는 쪽이 그 시도로 옮긴다) */
    map.on('mousemove', (e) => { const k0 = topAt([e.point.x, e.point.y]), k = k0 && st.out.has(k0) ? null : k0; cv.style.cursor = k0 ? 'pointer' : ''; if (k === st.ptr) return; st.ptr = k; emit('hover', k, e); });
    map.on('mouseout', () => { if (st.ptr == null) return; st.ptr = null; cv.style.cursor = ''; emit('hover', null); });
    map.on('click', (e) => { const k = topAt([e.point.x, e.point.y]); if (k) emit('pick', k, e); });
    map.on('webglcontextlost', () => emit('lost'));
    map.on('error', (e) => { if (!st.ready && /webgl/i.test(String(e && e.error && e.error.message))) emit('lost'); });

    return {
      map, el, get ready() { return st.ready; }, get target() { return st.target; }, get pending() { return st.dirty; }, get scope() { return st.scope; },
      on(t, f) { (st.on[t] = st.on[t] || []).push(f); return this; },
      setSize, setColors, setValues, setClasses, select, hover, setScope, setBand, flyTo, view, rotateBy, resetView, isHome, project, anchorOf, faces, overlay, labels, follow, rebase,
      heights: () => ({ ...st.h }), destroy() { if (st.anim) st.anim.cancel(); map.remove(); },
    };
  }

  return { PROJ, ISLES, LIFT, CAM, CE, RENDER, RIM, rimTier, rimGeoJSON, edgeCols, toLngLat, fromLngLat, toGeoJSON, ctxGeoJSON, sidoLines, polygonsOf, boundsOf, expand, heightOf, hmaxFor, mPerPx, heightExpr, colorExpr, lineExpr, styleOf, cameraFor, limitsFor, durationOf, placeLabels, padFor, hlColor, supported, load, parseColor, readColors, mount };
});
