/* 3D 단계 구분도(시군구 면 돌출) 공용 모듈 — /citizen(tools/design/public-mock/template.html, build.js 가 끼워 넣는다)과 /map 수도권 개요(assets/js/overview.js)가 같은 구현을 쓴다.
   기하(공유 호 다듬기 · 등방 + 기울기 k 투영 y' = y·k − h · √ 높이) · 면/옆벽 그리기 · 이름표(이름 / 숫자 두 줄) 놓기 · 고른 곳/가리킨 곳 면 효과 · 키보드 이동.
   모양(CSS)은 assets/css/map3d.css 하나(/citizen 은 build.js 가 <style> 에 넣고, /map 은 지도 레이아웃이 <link> 로 부른다). 색·글자는 globals 토큰(--map-ov-* 등)만 쓴다.
   입력 면 목록: [{ code, s(시도 2자리), n(이름), d(region-map 경로 'M x y l … z', 투영 정수), lx, ly(라벨 시작점) }] → prep. 화면마다 다른 것(값·색 단계·이름표 숫자·aria 문구)은 부르는 쪽이 넘긴다.
   돌려 보기·높이 움직임(선택형, 2026-10-18 — 넘기지 않으면 예전과 바이트 단위로 같다): 보기 상태 view = { bearing(도, −30~+30), k(.55~.85) } 로 다시 투영(project · reproject),
   옆벽 방향별 명암(draw o.shade — .w.l1~l3), 같은 기하에서 면 값만 바꿔 높이 보간(animateHeights), 포인터 끌기로 view 바꾸기(attachOrbit). 기하 준비(공유 호 다듬기)는 geom 한 번, 보기마다 투영만 다시 한다.
   순수 함수(prep·geom·project·faces·faceH·heightPlan·heightsAt·orbitStep·keyMove 등)는 node 로 시험한다(tests/js/map3d-orbit.test.cjs, map-overview.test.cjs, search.test.js). DOM 은 draw·reproject·animateHeights·attachOrbit·labels·paintFaces·recolor 만 만진다. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Map3D = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* 지도 숫자 라벨: 1만 이상 '1.6만', 미만 '3,885'(단위 '호'는 범례에 한 번) */
  const labelNum = (u) => (u >= 1e4 ? `${+(Math.round(u / 1e3) / 10).toFixed(1)}만` : u.toLocaleString('ko-KR'));   // '1만'·'1.1만'(소수점이 0 이면 뺀다)
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const SIDO_SHORT = { '11': '서울', '28': '인천', '41': '경기' };
  /* 렌더 상수(화면에 그리지 않는 화소 판 칠): 면 번호 n 과 종류 b(1 윗면 · 2 옆벽)를 담은 색, 가리는 옆벽, 맥락 면 자리 */
  const PIX = { id: (n, b) => `rgb(${n & 255},${n >> 8},${b})`, wall: '#fff', on: '#000' };

  /* 지도 짧은 이름: 끝의 시·군·구를 뗀다('남양주시' → '남양주', '중구'처럼 한 글자가 되면 그대로). 같은 시도 안에서 떼어 겹치면 그 이름들은 붙인 채로 */
  function shortNames(names) {
    const cut = (n) => (n.length > 2 && /[시군구]$/.test(n) ? n.slice(0, -1) : n), c = {};
    for (const n of names) c[cut(n)] = (c[cut(n)] || 0) + 1;
    return Object.fromEntries(names.map((n) => [n, c[cut(n)] > 1 ? n : cut(n)]));
  }
  /* 면 높이(v7d): 0호 = 0(평평), 그 밖은 h = Hmin + (Hmax − Hmin)·(u/umax)^0.75. 무대 하나에 배율 하나 — 값 순위 = 높이 순위.
     um: 배율을 밖에서 고정(해 재생처럼 여러 상태를 한 배율로 비교할 때). 없으면 그 값들의 최댓값. 넘는 값은 Hmax 에서 멈춘다 */
  function faceH(us, Hmin, Hmax, um) {
    const umax = um || Math.max(1, ...us);
    return us.map((u) => (u > 0 ? Hmin + (Hmax - Hmin) * Math.pow(um ? Math.min(1, u / umax) : u / umax, .75) : 0));
  }
  function ringsOf(d) {
    const out = []; let x = 0, y = 0;
    for (const [, cmd, body] of d.matchAll(/([Mlz])([^Mlz]*)/g)) {
      let n = body.trim() ? body.trim().split(/\s+/).map(Number) : [];
      if (cmd === 'M') { x = n[0]; y = n[1]; out.push([[x, y]]); n = n.slice(2); }
      if (cmd !== 'z') for (let i = 0; i < n.length; i += 2) { x += n[i]; y += n[i + 1]; out[out.length - 1].push([x, y]); }
    }
    return out;
  }
  const inRing = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [x1, y1] = r[i], [x2, y2] = r[j]; if ((y1 > p[1]) !== (y2 > p[1]) && p[0] < (x2 - x1) * (p[1] - y1) / (y2 - y1) + x1) c = !c; } return c; };
  const ringArea = (r) => r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
  /* 면 모양(고리·상자): 코드 → { code, s, n, lx, ly, R, B }. 공유 호(arcs)는 처음 쓸 때 한 번 만든다 */
  function prep(list) {
    const GU = new Map();
    for (const { code, s, n, d, lx, ly } of list) {
      const R = ringsOf(d); let B = [Infinity, Infinity, -Infinity, -Infinity];
      for (const r of R) for (const [x, y] of r) B = [Math.min(B[0], x), Math.min(B[1], y), Math.max(B[2], x), Math.max(B[3], y)];
      GU.set(code, { code, s, n, lx, ly, R, B });
    }
    return { GU, all: [...GU.values()], arcs: null };
  }
  const bboxOf = (us) => us.reduce((b, u) => [Math.min(b[0], u.B[0]), Math.min(b[1], u.B[1]), Math.max(b[2], u.B[2]), Math.max(b[3], u.B[3])], [Infinity, Infinity, -Infinity, -Infinity]);
  /* 공유 호(arc): 지도 면 고리를 '그 변을 쓰는 면 묶음'이 바뀌는 점과 세 면 이상 만나는 점에서 끊는다(정수 좌표가 같은 꼭짓점·변 = 공유).
     호는 한 번만 다듬어 양쪽 면이 같은 좌표를 쓴다 → 이웃끼리 틈·겹침이 생기지 않는다. 원본(region-map) 좌표는 그대로 둔다 */
  function arcsOf(base) {
    if (base.arcs) return base.arcs;
    const all = base.all, vk = (p) => p[0] + ',' + p[1], ek = (a, b) => { const x = vk(a), y = vk(b); return x < y ? x + '|' + y : y + '|' + x; };
    const eo = new Map(), vo = new Map(), add = (m, k, v) => (m.get(k) || m.set(k, new Set()).get(k)).add(v);
    const clean = (r) => { const q = r.filter((p, i) => i === 0 || vk(p) !== vk(r[i - 1])); return q.length > 1 && vk(q[0]) === vk(q[q.length - 1]) ? q.slice(0, -1) : q; };   // 같은 점 겹침·닫는 점 빼기
    for (const u of all) for (const r0 of u.R) { const r = clean(r0); for (let i = 0; i < r.length; i++) { add(eo, ek(r[i], r[(i + 1) % r.length]), u.code); add(vo, vk(r[i]), u.code); } }
    /* 끊는 점은 전역으로 정한다: 어느 고리에서든 앞뒤 변의 면 묶음이 바뀌는 점(되돌아가는 가시 끝 포함) + 세 면 이상 만나는 점 */
    const bk = new Set();
    for (const u of all) for (const r0 of u.R) { const r = clean(r0), n = r.length, own = (i) => [...eo.get(ek(r[i], r[(i + 1) % n]))].sort().join(); for (let i = 0; i < n; i++) if (vo.get(vk(r[i])).size >= 3 || own((i - 1 + n) % n) !== own(i)) bk.add(vk(r[i])); }
    const reg = new Map(), rings = new Map();
    for (const u of all) rings.set(u.code, u.R.map((r0) => {
      const r = clean(r0), n = r.length, own = (i) => [...eo.get(ek(r[i], r[(i + 1) % n]))].sort().join();
      const brk = []; for (let i = 0; i < n; i++) if (bk.has(vk(r[i]))) brk.push(i);
      const segs = [];
      if (!brk.length) {
        /* 끊는 점이 없는 고리(섬·통째로 둘러싸인 면): 가장 작은 꼭짓점에서 시작, 방향도 사전순으로 정해 양쪽이 같은 열쇠를 쓴다 */
        let m = 0; for (let i = 1; i < n; i++) if (vk(r[i]) < vk(r[m])) m = i;
        const f = [...r.slice(m), ...r.slice(0, m)], b = [f[0], ...f.slice(1).reverse()], fs = f.map(vk).join(';'), bs = b.map(vk).join(';');
        segs.push({ key: 'C' + (fs <= bs ? fs : bs), pts: fs <= bs ? f : b, rev: fs > bs, closed: true, owners: own(0) });
      } else for (let j = 0; j < brk.length; j++) {
        const a = brk[j], b = brk[(j + 1) % brk.length], pts = [r[a]];
        for (let i = (a + 1) % n; ; i = (i + 1) % n) { pts.push(r[i]); if (i === b) break; }
        const f = pts.map(vk).join(';'), bk = pts.slice().reverse().map(vk).join(';'), rev = bk < f;
        segs.push({ key: rev ? bk : f, pts: rev ? pts.slice().reverse() : pts, rev, closed: false, owners: own(a) });
      }
      return segs.map((sg) => { if (!reg.has(sg.key)) reg.set(sg.key, { pts: sg.pts, closed: sg.closed, owners: sg.owners.split(',') }); return { key: sg.key, rev: sg.rev }; });
    }));
    return (base.arcs = { reg, rings });
  }
  /* 보는 시도 둘레(순수, 2026-10-19 사용자 피드백 '서울을 볼 때 지역 경계 1레벨까지만 — 카드 외곽이 회색으로 차지 않게'): base = prep 결과, sd = 시도 두 자리, o.omit = 판에서 뺀 코드(섬).
     near = 보는 시도 면과 공유 호(맞댄 변 — 꼭짓점 둘 이상)를 가진 다른 시도 면(1단계 이웃 — 맥락 회색으로 남긴다), hide = 그 밖의 다른 시도 면(그리지 않는다 — 카드 바탕이 보인다).
     keep = 이웃이 아니어도 라벨 점에서 8방향 반직선이 모두 보는 시도·이웃 면에 닿는 면(경기를 볼 때 서울 안쪽 구처럼 둘러싸인 면 — 구멍이 나지 않게 맥락 회색). sd 가 없으면 모두 빈 목록. 코드는 정렬 */
  const RAY8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  function nearOf(base, sd, o = {}) {
    const om = new Set(o.omit || []), us = base.all.filter((u) => !om.has(u.code)), sOf = new Map(us.map((u) => [u.code, u.s]));
    if (!sd || !us.some((u) => u.s === sd)) return { near: [], keep: [], hide: [] };
    const touch = new Set();
    for (const a of arcsOf(base).reg.values()) { const w = a.owners.filter((c) => sOf.has(c)); if (w.some((c) => sOf.get(c) === sd)) for (const c of w) if (sOf.get(c) !== sd) touch.add(c); }
    const segs = us.filter((u) => u.s === sd || touch.has(u.code)).flatMap((u) => u.R.flatMap((r) => r.map((p, i) => [p, r[(i + 1) % r.length]])));
    /* 반직선 p + t·d(t > 0)가 변 a–b 와 만나는가 */
    const hits = (p, d) => segs.some(([a, b]) => { const ex = b[0] - a[0], ey = b[1] - a[1], den = d[0] * ey - d[1] * ex; if (!den) return false; const qx = a[0] - p[0], qy = a[1] - p[1], t = (qx * ey - qy * ex) / den, s = (qx * d[1] - qy * d[0]) / den; return t > 0 && s >= 0 && s <= 1; });
    const rest = us.filter((u) => u.s !== sd && !touch.has(u.code)), keep = rest.filter((u) => RAY8.every((d) => hits([u.lx, u.ly], d))).map((u) => u.code);
    return { near: [...touch].sort(), keep: keep.sort(), hide: rest.map((u) => u.code).filter((c) => !keep.includes(c)).sort() };
  }
  /* 화면 좌표 다듬기: Visvalingam(삼각형 넓이 eps px² 이하 꼭짓점 제거, 호 끝점 고정) → Chaikin 2회(열린 호는 끝점 고정) */
  function simplifyVW(p, closed, eps) {
    const pts = p.slice(), ar = (a, b, c) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2, minN = closed ? 4 : 2;
    while (pts.length > minN) {
      const n = pts.length; let mi = -1, mv = Infinity;
      for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) { const v = ar(pts[(i - 1 + n) % n], pts[i], pts[(i + 1) % n]); if (v < mv) { mv = v; mi = i; } }
      if (mv > eps) break; pts.splice(mi, 1);
    }
    return pts;
  }
  function chaikin(p, closed, it) {
    for (let t = 0; t < it; t++) {
      const n = p.length, q = closed ? [] : [p[0]], m = closed ? n : n - 1;
      for (let i = 0; i < m; i++) { const a = p[i], b = p[(i + 1) % n]; q.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]); }
      if (!closed) q.push(p[n - 1]);
      p = q;
    }
    return p;
  }
  /* 다듬은 면 안 라벨 점: 원래 라벨 점이 다듬은 고리 안이면 그대로, 밖이면 격자에서 가장자리와 가장 먼 점 */
  function labelPoint(rings, p) {
    const big = rings.reduce((m, r) => (Math.abs(ringArea(r)) > Math.abs(ringArea(m)) ? r : m), rings[0]);
    if (inRing(p, big)) return p;
    const bb = big.reduce((q, [x, y]) => [Math.min(q[0], x), Math.min(q[1], y), Math.max(q[2], x), Math.max(q[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
    const ed = (x, y) => { let m = Infinity; for (let i = 0; i < big.length; i++) { const [ax, ay] = big[i], [bx, by] = big[(i + 1) % big.length], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0; m = Math.min(m, Math.hypot(x - ax - t * dx, y - ay - t * dy)); } return m; };
    let best = [-1, p[0], p[1]];
    for (let i = 1; i < 12; i++) for (let j = 1; j < 12; j++) { const x = bb[0] + (bb[2] - bb[0]) * i / 12, y = bb[1] + (bb[3] - bb[1]) * j / 12; if (inRing([x, y], big)) { const d = ed(x, y); if (d > best[0]) best = [d, x, y]; } }
    return [Math.round(best[1] * 10) / 10, Math.round(best[2] * 10) / 10];
  }

  /* 3D 판 기하(v7d 면 돌출): 그릴 면(own)·섬 삽입 지도(isles)·무대 크기(W·H)·휴대폰 여부에만 의존한다 — 보는 곳·가리킨 곳은 받지 않는다(고를 때 그림이 움직이지 않게, G16).
     o = { own: 코드 목록, isles: 삽입 지도로 뺄 코드, view: 맥락 시도를 고르는 상자(없으면 own 상자 + 4%), W, H, narrow, uOf: { 코드: 높이 값 }, left: 판 왼쪽 여백 하한(px), insetTop: 삽입 지도를 왼쪽 위에 }.
     전국 맥락 면(/map 개요만 켠다 — 없으면 예전과 같다): ctxBase = 시도 외곽 면 묶음(prep, data/board/korea-sido.json) · ctxOmit = 그 가운데 그리지 않을 시도(판 면이 있는 수도권) · fit = 무대에 맞출 투영 상자 [x, y, w, h](판 상자 대신, 선택).
       이때 맥락 면은 ctxBase 의 시도(자기 공유 호로 다듬음, 무대 밖은 잘림)다. fit 을 주면 판이 무대의 일부라 높이 상한은 판 높이의 10%(8~16px), 주지 않으면 무대 = 판 상자라 높이 상한은 맥락 면이 없을 때와 같다.
     반환: k, s, 원점, 두께 T, 높이 상한 Hmax0, 판 면(own: 다듬은 땅 고리[조각마다 이웃 코드], 라벨 점, 값), 맥락 시도 면(다듬음), 삽입 지도 */
  function geom(base, o) {
    const { W, H, narrow } = o, all = base.all, uOf = o.uOf || {}, nat = o.ctxBase || null;
    const ownSet = new Set(o.own), isl = (o.isles || []).filter((c) => base.GU.has(c));
    const own = all.filter((u) => ownSet.has(u.code)), b = bboxOf(own), ownS = new Set(own.map((u) => u.s));
    const view = o.view || (() => { const w = b[2] - b[0], h = b[3] - b[1]; return [b[0] - w * .04, b[1] - h * .04, w * 1.08, h * 1.08]; })();
    const fits = (u) => u.B[0] >= view[0] && u.B[1] >= view[1] && u.B[2] <= view[0] + view[2] && u.B[3] <= view[1] + view[3];
    const ctxS = nat ? [] : [...new Set(all.map((u) => u.s))].filter((s) => !ownS.has(s) && all.filter((u) => u.s === s).every(fits));
    const ctx = all.filter((u) => ctxS.includes(u.s));
    const T = narrow ? 5 : 7, pad = 6;
    let Hmax0 = nat && o.fit ? 16 : Math.max(16, Math.min(48, Math.round(H * .08)));
    const iw = isl.length ? (narrow ? 92 : 132) : 0, ih = isl.length ? (narrow ? 72 : 100) : 0, left = Math.max(pad + (iw ? iw + 10 : 0), o.left || 0);
    /* 기울기 k: 판 경계 상자와 무대 W·H 만으로, 판이 무대를 가장 넓게 쓰는 값(0.6~0.8). 위쪽 여유는 가장 높은 면 높이만큼 */
    const fb = o.fit ? [o.fit[0], o.fit[1], o.fit[0] + o.fit[2], o.fit[1] + o.fit[3]] : b;   // 무대에 맞출 상자(전국 보기는 fit, 그 밖은 판 상자)
    const bw = fb[2] - fb[0], bh = fb[3] - fb[1], AW = W - left - pad, top = Hmax0 + 2, AH = H - 2 * pad - T - top;
    const k = +Math.min(.8, Math.max(.6, (bw / bh) / (AW / AH))).toFixed(3), s = Math.min(AW / bw, AH / (bh * k));
    const ox = left + (AW - bw * s) / 2 - fb[0] * s, oy = pad + top + Math.max(0, (H - 2 * pad - T - top - bh * k * s) / 2) - fb[1] * k * s;
    if (nat && o.fit) Hmax0 = Math.max(8, Math.min(16, Math.round((b[3] - b[1]) * k * s * .1)));   // 넓은 상자(fit)에 맞춘 무대: 작은 판이 탑처럼 솟지 않게 판 높이의 10%(위 여유 16 + 2 안)
    const r1 = (v) => Math.round(v * 10) / 10, P = ([x, y]) => [ox + x * s, oy + y * k * s];
    /* 쓰는 호만 한 번씩 다듬는다. 조각의 이웃 = 같은 묶음(판 면끼리, 맥락 면은 같은 시도끼리)에서 그 호를 함께 쓰는 면 */
    const builder = (B, drawn, grp) => {
      const { reg, rings } = arcsOf(B), sm = new Map();
      const arcPts = (key) => { if (!sm.has(key)) { const a = reg.get(key); { const q = chaikin(simplifyVW(a.pts.map(P), a.closed, .5), a.closed, 2).map(([x, y]) => [r1(x), r1(y)]); const z = q.filter((p, i) => i === 0 || p[0] !== q[i - 1][0] || p[1] !== q[i - 1][1]); if (!a.closed && (z[z.length - 1][0] !== q[q.length - 1][0] || z[z.length - 1][1] !== q[q.length - 1][1])) z[z.length - 1] = q[q.length - 1]; sm.set(key, z); } } return sm.get(key); };
      return (u) => rings.get(u.code).map((segs) => {
        const pieces = segs.map(({ key, rev }) => { const p = arcPts(key), a = reg.get(key), nb = a.owners.filter((c) => c !== u.code && drawn.has(c) && grp(c) === grp(u.code))[0] || null; return { pts: rev ? p.slice().reverse() : p, nb, closed: a.closed }; }).filter((pc) => pc.pts.length > 1);   // 다듬어 한 점으로 줄어든 아주 짧은 호는 뺀다
        const pts = pieces.length === 1 && pieces[0].closed ? pieces[0].pts.slice() : pieces.flatMap((pc) => pc.pts.slice(0, -1));
        return { pts, pieces };
      });
    };
    const build = builder(base, new Set([...own, ...ctx].map((u) => u.code)), (c) => (ownSet.has(c) ? '' : c.slice(0, 2)));
    const ownG = own.map((u) => { const R = build(u), lp = labelPoint(R.map((r) => r.pts), P([u.lx, u.ly]).map(r1)); return { code: u.code, rings: R, lp, u: uOf[u.code] || 0 }; });
    let inset = null;
    if (isl.length) {
      /* 섬마다 칸 하나: 그 섬 고리 가운데 큰 것(가장 큰 고리의 15% 이상)만, 칸에 맞춰 같은 기울기로(평평) */
      const x0 = pad, y0 = o.insetTop ? pad : H - pad - ih, cw = iw / isl.length, ra = (r) => Math.abs(ringArea(r));
      inset = { x: x0, y: y0, w: iw, h: ih, units: isl.map((code, i) => { const u = base.GU.get(code), mx = Math.max(...u.R.map(ra)), R = u.R.filter((r) => ra(r) >= mx * .15), bb = R.flat().reduce((q, [x, y]) => [Math.min(q[0], x), Math.min(q[1], y), Math.max(q[2], x), Math.max(q[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
        const si = Math.min((cw - 14) / (bb[2] - bb[0]), (ih - 46) / ((bb[3] - bb[1]) * k)), ix = x0 + i * cw + (cw - (bb[2] - bb[0]) * si) / 2 - bb[0] * si, iy = y0 + 22 + (ih - 46 - (bb[3] - bb[1]) * k * si) / 2 - bb[1] * k * si;
        return { code, name: u.n, tf: [ix, iy, si], R: R.map((r) => chaikin(simplifyVW(r.map(([x, y]) => [ix + x * si, iy + y * k * si]), true, .5), true, 2).map(([x, y]) => [r1(x), r1(y)])), b: [r1(x0 + i * cw + cw / 2), r1(y0 + ih / 2 + 4)], t: [r1(x0 + i * cw + cw / 2), r1(y0 + ih - 9)] }; }) };
    }
    /* 전국 보기의 맥락 면: 시도 외곽(그 묶음끼리 공유 호), 판 면이 있는 시도는 뺀다 */
    const natCtx = nat ? (() => { const omit = new Set(o.ctxOmit || []), us = nat.all.filter((u) => !omit.has(u.s)), bd = builder(nat, new Set(us.map((u) => u.code)), () => '');
      return us.map((u) => ({ code: u.code, s: u.s, n: u.n, rings: bd(u).map((r) => r.pts).filter((r) => r.length > 2), l: P([u.lx, u.ly]).map(r1) })); })() : null;
    return { W, H, narrow, k, s, ox, oy, T, Hmax0, own: ownG, ctx: natCtx || ctx.map((u) => ({ code: u.code, s: u.s, rings: build(u).map((r) => r.pts), l: P([u.lx, u.ly]).map(r1) })), inset, ...(nat ? { nat: true } : {}) };
  }
  /* ---------- 보기 상태(돌려 보기, 선택형) ----------
     view = { bearing(도, −30~+30, + 는 화면에서 시계 방향), k(기울기 .55~.85, 클수록 위에서 내려다본다) }. 없거나 { bearing: 0, k: geom 의 k } 면 기하 그대로(바이트 단위로 같다).
     geom 의 화면 좌표(기울기 k0)를 평면(y / k0)으로 되돌려, 그린 땅(판 + 맥락 면) 상자 가운데를 축으로 bearing 만큼 돌리고 k 로 다시 기울인다.
     돌린 모양의 상자 가운데를 처음 상자 가운데로 옮기고(dx·dy), 상자가 커지면 처음 상자 안에 들도록 같은 비율로 줄인다(f ≤ 1, 위쪽 높이 여유·왼쪽 범례 칸은 그대로). 섬 삽입 지도는 돌리지 않는다 */
  const VIEW_LIM = { bearing: [-30, 30], k: [.55, .85] };
  const clampTo = (v, [a, b]) => Math.min(b, Math.max(a, v));
  const boxOf = new WeakMap();   // geom → 그린 땅 점 상자(화면, 기본 보기) — 부르는 쪽 geom 객체는 고치지 않는다
  function groundBox(g) {
    if (boxOf.has(g)) return boxOf.get(g);
    const b = [Infinity, Infinity, -Infinity, -Infinity], add = ([x, y]) => { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; };
    for (const q of g.own) for (const r of q.rings) r.pts.forEach(add);
    for (const c of g.ctx) for (const r of c.rings) r.forEach(add);
    boxOf.set(g, b); return b;
  }
  /* 보기 변환 V(없으면 null = 기본 보기). V 는 viewPt·unviewPt 가 쓴다 */
  function viewOf(g, view) {
    if (!view) return null;
    const bearing = clampTo(+view.bearing || 0, VIEW_LIM.bearing), k = view.k == null ? g.k : clampTo(+view.k, VIEW_LIM.k);
    if (!bearing && k === g.k) return null;
    const b = groundBox(g), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, rad = bearing * Math.PI / 180;
    const V = { bearing, k, k0: g.k, cx, cy, cos: Math.cos(rad), sin: Math.sin(rad), f: 1, dx: 0, dy: 0 };
    /* 옮김·줄임: 땅 상자 네 귀가 아니라 실제 점으로(돌린 모양의 상자) */
    const r = [Infinity, Infinity, -Infinity, -Infinity], add = (p) => { const [x, y] = viewPt(V, p); if (x < r[0]) r[0] = x; if (y < r[1]) r[1] = y; if (x > r[2]) r[2] = x; if (y > r[3]) r[3] = y; };
    for (const q of g.own) for (const rr of q.rings) rr.pts.forEach(add);
    for (const c of g.ctx) for (const rr of c.rings) rr.forEach(add);
    V.dx = (r[0] + r[2]) / 2 - cx; V.dy = (r[1] + r[3]) / 2 - cy;
    V.f = Math.min(1, (b[2] - b[0]) / Math.max(1e-9, r[2] - r[0]), (b[3] - b[1]) / Math.max(1e-9, r[3] - r[1]));
    return V;
  }
  /* 기본 보기 화면 점 → 보기 V 화면 점(반올림 없음), 그 거꾸로 */
  function viewPt(V, [X, Y]) {
    const a = X - V.cx, b = (Y - V.cy) / V.k0;
    return [V.cx + V.f * (V.cos * a - V.sin * b - V.dx), V.cy + V.f * (V.k * (V.sin * a + V.cos * b) - V.dy)];
  }
  function unviewPt(V, [X, Y]) {
    const p = (X - V.cx) / V.f + V.dx, q = ((Y - V.cy) / V.f + V.dy) / V.k;
    return [V.cx + V.cos * p + V.sin * q, V.cy + V.k0 * (-V.sin * p + V.cos * q)];
  }
  /* 투영만 다시: geom 결과(다듬은 고리)를 보기 V 로 옮긴 같은 모양의 기하. 같은 점(이웃이 함께 쓰는 호 점)은 같은 값으로(틈 없음), 0.1px 반올림.
     기본 보기는 g 그대로 돌려준다. 반환에 V(보기 변환)·k(보기 기울기)가 붙는다 */
  function project(g, view) {
    const V = viewOf(g, view);
    if (!V) return g;
    const r1 = (v) => Math.round(v * 10) / 10, memo = new Map(), T = (p) => { let q = memo.get(p); if (!q) { const v = viewPt(V, p); q = [r1(v[0]), r1(v[1])]; memo.set(p, q); } return q; };
    const own = g.own.map((q) => ({ ...q, lp: T(q.lp), rings: q.rings.map((r) => ({ pts: r.pts.map(T), pieces: r.pieces.map((pc) => ({ ...pc, pts: pc.pts.map(T) })) })) }));
    const ctx = g.ctx.map((c) => ({ ...c, rings: c.rings.map((r) => r.map(T)), l: T(c.l) }));
    return { ...g, k: V.k, V, own, ctx };
  }
  /* 사업 위치 화면 좌표(/citizen 지도 위 사업 카드 자리): region-map 자체 투영 [x, y] → 판 좌표(geom 의 P, 돌린 보기면 viewPt) − 그 면 윗면 높이 h. 섬 삽입 지도는 그 칸 변환(tf, 평평·돌리지 않음) */
  const ptXY = (g, f, p) => {
    const k0 = g.V ? g.V.k0 : g.k;
    if (f.tf) return [f.tf[0] + p[0] * f.tf[2], f.tf[1] + p[1] * k0 * f.tf[2]];
    const q = [g.ox + p[0] * g.s, g.oy + p[1] * k0 * g.s], v = g.V ? viewPt(g.V, q) : q;
    return [v[0], v[1] - (f.h || 0)];
  };
  /* 옆벽 명암 단계(빛은 위 왼쪽 하나): 벽 바깥 방향(평면)의 가로 성분 nx — 왼쪽을 향한 벽 1(밝음) · 보는 쪽 2 · 오른쪽을 향한 벽 3(어두움) */
  const wallTier = (nx) => (nx < -.4 ? 1 : nx > .4 ? 3 : 2);

  let measureCtx = null;
  const textW = (txt, size, weight = 700) => { measureCtx = measureCtx || document.createElement('canvas').getContext('2d'); measureCtx.font = `${weight} ${size}px ${getComputedStyle(document.body).fontFamily}`; return measureCtx.measureText(txt).width; };

  /* ---------- 3D 지도 그리기(무대·면 묶음이 바뀔 때만) ----------
     svg 좌표 = 무대 px(viewBox 0 0 W H). 경계는 공유 호를 다듬은 것(이웃끼리 같은 좌표).
     면마다 윗면을 h 만큼 올린다(y' = y·k − h). h = 4 + (Hmax − 4)·(u/umax)^0.75, 0 은 0. 고른 곳은 솟지 않는다.
     옆벽은 보는 쪽(화면 아래)을 향한 변에만: 이웃이 낮으면 그 차이만큼, 이웃이 없으면(판 바깥·바다·맥락 시도) 판 두께 T 아래까지. 돌린 보기면 돌린 뒤의 변 방향으로 다시 정한다.
     그리는 순서는 높이 오름차순(같으면 화면 아래쪽 끝 y 오름차순 = 멀리 → 가까이, 돌린 뒤 좌표로), 면마다 벽 → 윗면. 번짐·그림자 필터는 쓰지 않는다.
     가림: 윗면이 보이는 비율이 면마다 55%·평균 80% 이상이 되도록 Hmax 를 1px 씩(하한 Hfloor = Hmax0 의 60% 이상) 한꺼번에 줄인다.
     o = { units: [{ key, name, u(이름표 값), c(색 단계) }], nameOf(코드), hFloor, aria(unit) → 면 이름(화면 읽기),
           선택: view(보기 상태, 없으면 기본) · shade(true 면 옆벽을 방향별 명암 .w.l1~l3 으로 나눈다) · umax(높이 배율 고정) }. 반환 G(라벨·칠하기·키보드·reproject·animateHeights 가 쓴다) */
  const f1 = (v) => Math.round(v * 10) / 10;
  const dOf = (R, dy = 0) => R.map((r) => `M${r.map(([x, y]) => `${x} ${f1(y + dy)}`).join('L')}Z`).join('');
  /* 보는 시도(draw o.scope, 선택 — 2026-10-19 사용자 결정, /citizen): 시도 두 자리면 그 시도 밖 면(코드 앞 두 자리가 다른 면)은 맥락 회색·평평(.out), null 이면 없음.
     키를 주면(null 포함) 시도 경계선(.sdl — 보는 시도에 닿은 선 .on, 시도를 보면 그 선만)도 그린다. 주지 않으면 예전과 같다.
     o.hide(코드 목록, 선택 — Map3D.nearOf 의 hide, 2026-10-19): 이웃 1단계 밖 면 묶음은 .hid(map3d.css 가 숨긴다)·판 그늘에서 빼고 키보드 이동도 건너뛴다 */
  const outOf = (o) => (c) => !!(o && o.scope) && String(c).slice(0, 2) !== o.scope;
  /* 면 그림(순수): 투영한 기하 gv(geom 또는 project 결과)와 면마다 높이 hs(gv.own 순서)·값 us → 그리는 순서로 놓은 면 목록 */
  function faces(gv, o, st) {
    const T = gv.T, kk = gv.k, byKey = Object.fromEntries(o.units.map((x) => [x.key, x])), sdOn = o.scope !== undefined, sd = (c) => String(c).slice(0, 2);
    const hs = st.hs, us = st.us || gv.own.map((q) => q.u), hOf = Object.fromEntries(gv.own.map((q, i) => [q.code, hs[i]]));
    return gv.own.map((q, i) => {
      const h = hs[i], x = byKey[q.code] || { key: q.code, name: o.nameOf ? o.nameOf(q.code) : '', u: 0, c: 0 };
      let wall = '', outl = '', sdl = '', sdlOn = '';
      const wt = o.shade ? ['', '', '', ''] : null;   // 명암 단계별 옆벽(1~3)
      /* 섬 고리: 화면 넓이 12px² 미만은 그리지 않고, 12~36px² 는 벽 없이 윗면만 옅게. 가장 큰 고리는 늘 면 */
      const ar = q.rings.map((r) => Math.abs(ringArea(r.pts))), big = Math.max(...ar);
      const main = q.rings.filter((r, j) => ar[j] >= 36 || ar[j] === big), isle = q.rings.filter((r, j) => ar[j] >= 12 && ar[j] < 36 && ar[j] !== big);
      for (const r of main) {
        const sg = Math.sign(ringArea(r.pts));
        for (const pc of r.pieces) {
          const hn = pc.nb ? hOf[pc.nb] : -T;
          if (!pc.nb) outl += `M${pc.pts.map(([px, py]) => `${px} ${f1(py - h)}`).join('L')}`;
          /* 시도 경계선: 시도가 다른 이웃과 닿은 조각을 낮은 쪽 면(같으면 코드가 작은 쪽)의 윗면 높이에 — 그 뒤에 그리는 솟은 면이 앞을 가린다 */
          if (sdOn && pc.nb && sd(pc.nb) !== sd(q.code) && (h < hn || (h === hn && q.code < pc.nb))) {
            const d = `M${pc.pts.map(([px, py]) => `${px} ${f1(py - h)}`).join('L')}`;
            if (!o.scope) sdl += d; else if (sd(q.code) === o.scope || sd(pc.nb) === o.scope) sdlOn += d;   // 시도를 보면 그 시도에 닿은 선만(2026-10-19 — 이웃 1단계)
          }
          if (hn >= h) continue;
          for (let j = 0; j + 1 < pc.pts.length; j++) {
            const a = pc.pts[j], b = pc.pts[j + 1], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
            /* 바깥 법선의 아래쪽 성분(정규화)이 0.25 이상인 변만(거의 세로인 변에 생기는 얇은 띠를 막는다). 2px² 미만 조각은 버린다 */
            if ((sg > 0 ? -dx : dx) / len < .25 || Math.abs(dx) * (h - hn) < 2) continue;
            const seg = `M${a[0]} ${f1(a[1] - h)}L${b[0]} ${f1(b[1] - h)}L${b[0]} ${f1(b[1] - hn)}L${a[0]} ${f1(a[1] - hn)}Z`;
            wall += seg;
            if (wt) { const ey = dy / kk; wt[wallTier((sg > 0 ? ey : -ey) / (Math.hypot(dx, ey) || 1))] += seg; }   // 바깥 방향은 평면에서(기울기를 되돌려) 잰다
          }
        }
      }
      const R = main.map((r) => r.pts.map(([px, py]) => [px, f1(py - h)]));
      const south = Math.max(...main.flatMap((r) => r.pts.map((p) => p[1])));
      return { x, u: us[i], h, R, G: main.map((r) => r.pts), d: dOf(R), isle: isle.length ? dOf(isle.map((r) => r.pts.map(([px, py]) => [px, f1(py - h)]))) : '', wall, outl, ...(sdOn ? { sdl, sdlOn } : {}), south, bx: q.lp[0], by: f1(q.lp[1] - h), area: Math.abs(main.reduce((a, r) => a + ringArea(r.pts), 0)), ...(wt ? { walls: wt } : {}) };
    }).sort((a, b) => a.h - b.h || a.south - b.south);
  }
  /* 옆벽 경로 문자열: 명암을 켜면 단계마다 하나(.w.lN), 끄면 하나(.w) */
  const wallsOf = (f) => (f.walls ? [1, 2, 3].filter((t) => f.walls[t]).map((t) => [` l${t}`, f.walls[t]]) : f.wall ? [['', f.wall]] : []);
  /* 맥락 시도 이름표 자리·맥락 면 고리(라벨이 쓴다). wOf(이름) = 이름표 폭 */
  function ctxOf(g, T, wOf) {
    /* 맥락 시도 이름표(경기 화면의 '서울'): 그 시도 대표점 상자의 가운데, 바닥 높이 */
    let ctxL = null; const G0 = {};
    if (g.ctx.length && !g.nat) { const s0 = g.ctx[0].s, cs = g.ctx.filter((c) => c.s === s0), xs = cs.map((c) => c.l[0]), ys = cs.map((c) => c.l[1]), nm = SIDO_SHORT[s0];
      ctxL = { key: 'ctx', v: nm, x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 + T, w: wOf(nm), h: 18 }; }
    /* 전국 보기(geom nat): 맥락 시도마다 이름 하나(옅게), 자리는 그 시도 면 안 — 시도 대표점(korea-sido l)에서 가까운 순 */
    if (g.nat) { G0.ctxLs = g.ctx.filter((c) => c.rings.length).map((c) => ({ key: 'ctx-' + c.s, v: c.n, x: c.l[0], y: c.l[1] + T, far: true, rings: c.rings.map((r) => r.map(([x, y]) => [x, y + T])) })); }
    return { ctxL, ...G0, ctxRings: g.ctx.flatMap((c) => c.rings.map((r) => r.map(([x, y]) => [x, y + T]))) };
  }
  function draw(svg, g0, o) {
    const g = project(g0, o.view), { W, H, narrow, T } = g;   // g = 그 보기로 투영한 기하(기본 보기면 g0 그대로)
    /* 높이(배율 하나)와 그 높이의 면 그림 */
    const out = outOf(o), us = g.own.map((q) => (out(q.code) ? 0 : q.u)), hsOf = (Hmax) => (o.umax ? faceH(us, 4, Hmax, o.umax) : o.scope ? faceH(us, 4, Hmax) : faceH(g.own.map((q) => q.u), 4, Hmax));   // 배율 고정(o.umax)이 없으면 예전 그대로 · 보는 시도 밖 면은 0(평평)
    const make = (Hmax) => faces(g, o, { hs: hsOf(Hmax), us });
    /* 윗면 보이는 비율(화면 그림으로 잰다): 칠하는 순서대로 벽은 0, 윗면은 번호로 칠해 마지막에 남은 화소 / 윗면 넓이 */
    /* 화소 세기: 가장자리 번짐 화소(불투명도 < 255)는 양쪽 모두 빼고 센다 — 판은 바닥에서 서로 겹치지 않아 한 번에 '혼자 넓이'를 잰다 */
    const count = (paint, n) => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d', { willReadFrequently: true }); paint(c);
      const px = c.getImageData(0, 0, W, H).data, a = new Float64Array(n + 1); for (let i = 0; i < W * H; i++) if (px[i * 4 + 3] === 255 && px[i * 4 + 2] === 1) a[px[i * 4] + (px[i * 4 + 1] << 8)]++; return a; };
    const idc = (i) => PIX.id(i + 1, 1);
    const vis = (F) => {
      const alone = count((c) => F.forEach((f, i) => { c.fillStyle = idc(i); c.fill(new Path2D(dOf(f.G)), 'evenodd'); }), F.length);
      const seen = count((c) => F.forEach((f, i) => { if (f.wall) { c.fillStyle = PIX.wall; c.fill(new Path2D(f.wall)); } c.fillStyle = idc(i); c.fill(new Path2D(f.d), 'evenodd'); }), F.length);
      const r = F.map((f, i) => (alone[i + 1] > 4 ? Math.min(1, seen[i + 1] / alone[i + 1]) : 1));
      return { min: Math.min(...r), avg: r.reduce((a, b) => a + b, 0) / r.length, r };
    };
    let Hmax = g.Hmax0, F = make(Hmax), V = vis(F);
    const Hfloor = Math.max(o.hFloor || 0, Math.ceil(g.Hmax0 * .6));
    while ((V.min < .55 || V.avg < .8) && Hmax > Hfloor) { Hmax--; F = make(Hmax); V = vis(F); }
    F.forEach((f, i) => { f.vis = V.r[i]; });
    const byKey = Object.fromEntries(o.units.map((x) => [x.key, x]));
    const FI = g.inset ? g.inset.units.map((q) => { const x = byKey[q.code] || { key: q.code, name: q.name, u: 0, c: 0 }; return { x, h: 0, R: q.R, d: dOf(q.R), bx: q.b[0], by: q.b[1], inset: true, tf: q.tf }; }) : [];
    const oc = (f) => (out(f.x.key) ? ' out' : ''), hid = new Set(o.hide || []);
    F.forEach((f) => { if (hid.has(f.x.key)) f.hid = true; });
    const face = (f) => `<path id="f-${f.x.key}" class="f c${f.x.c}${oc(f)}" d="${f.d}" data-area="${f.x.key}" role="option" aria-selected="false" aria-label="${esc(o.aria(f.x))}"/>`;
    const grp = (f) => `<g class="fg${f.hid ? ' hid' : ''}" data-area="${f.x.key}" data-u="${f.u}" data-h="${f.h.toFixed(2)}" data-vis="${f.vis.toFixed(3)}">${wallsOf(f).map(([t, d]) => `<path class="w c${f.x.c}${t}${oc(f)}" d="${d}" data-area="${f.x.key}" aria-hidden="true"/>`).join('')}${face(f)}${f.isle ? `<path class="isle c${f.x.c}${oc(f)}" d="${f.isle}" aria-hidden="true"/>` : ''}${f.outl ? `<path class="ol" d="${f.outl}" aria-hidden="true"/>` : ''}${f.sdl ? `<path class="sdl" d="${f.sdl}" aria-hidden="true"/>` : ''}${f.sdlOn ? `<path class="sdl on" d="${f.sdlOn}" aria-hidden="true"/>` : ''}</g>`;
    const ins = g.inset ? `<g class="inset"><rect class="inset-bg" x="${g.inset.x}" y="${g.inset.y}" width="${g.inset.w}" height="${g.inset.h}" rx="8" aria-hidden="true"/><text class="inset-t" x="${g.inset.x + 8}" y="${g.inset.y + 14}" aria-hidden="true">섬 지역</text>${FI.map(face).join('')}${g.inset.units.map((q) => `<text class="inset-n" x="${q.t[0]}" y="${q.t[1]}" aria-hidden="true">${esc(q.name)}</text>`).join('')}</g>` : '';
    svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
    svg.dataset.hmax = Hmax; svg.dataset.k = g.k;
    if (g.V) svg.dataset.bearing = g.V.bearing;
    const seaD = (dy) => dOf(F.filter((f) => !f.hid).flatMap((f) => f.G), dy);
    svg.innerHTML = `<path class="sea" d="${seaD(T + 2)}" aria-hidden="true"/><path class="sea" d="${seaD(T + 1)}" aria-hidden="true"/>${g.ctx.map((c) => `<path class="ctx" d="${dOf(c.rings, T)}" aria-hidden="true"/>`).join('')}
    <g class="faces" role="presentation">${F.map(grp).join('')}${ins}</g>
    <g class="lift" aria-hidden="true"></g>
    <path class="kb-halo" d="" aria-hidden="true"/><path class="kb" d="" aria-hidden="true"/>
    <g class="lbls" aria-hidden="true"></g><g class="hil" aria-hidden="true"></g>`;
    const C = ctxOf(g, T, (nm) => textW(nm, 14, 400) + 6);
    /* 다시 투영·높이 움직임이 쓰는 상태(st): 기본 기하 g(geom 결과) · 지금 투영 gv · 그리기 옵션 · 면마다 지금 높이·값(gv.own 순서) · 높이 배율 */
    const st = { g: g0, gv: g, o, hs: hsOf(Hmax), us, umax: o.umax || 0, anim: null };
    return { W, H, k: g.k, s: g.s, ox: g.ox, oy: g.oy, T, Hmax, F: [...F, ...FI], ctxL: C.ctxL, ...(C.ctxLs ? { ctxLs: C.ctxLs } : {}), ctxRings: C.ctxRings, narrow, inset: g.inset, vis: V, aria: o.aria, ...(g.V ? { V: g.V } : {}), st };
  }
  /* ---------- 다시 투영·높이 움직임(선택형, 그린 svg 를 고쳐 쓴다) ----------
     sync: 같은 면 묶음의 새 면 그림 F 에 svg 를 맞춘다 — 바뀐 경로 d 만 고치고, 옆벽·섬 고리·둘레선은 생기거나 사라진 만큼 만들고 지운다. 그리는 순서가 바뀌면 묶음을 다시 늘어놓는다.
     moved(투영이 바뀜)면 맥락 면·맥락 이름표 자리와 바다 둘레도(sea false 면 바다 둘레는 건너뛴다 — 끄는 동안). G 는 새 그림으로 바꾼다(라벨·키보드·칠하기가 그대로 쓴다).
     가림 맞춤(canvas)·라벨 겹침 계산은 하지 않는다 — 끝난 뒤 부르는 쪽이 labels·paintFaces 를 다시 부른다(.lift 사본·키보드 고리는 옛 모양) */
  const SVGNS = 'http://www.w3.org/2000/svg';
  function sync(svg, G, F, moved, sea = true) {
    const st = G.st, gv = st.gv, T = G.T, doc = svg.ownerDocument, box = svg.querySelector('.faces'), ins = box.querySelector(':scope > .inset');
    const els = new Map(); for (const el of box.querySelectorAll(':scope > .fg')) els.set(el.dataset.area, el);
    const old = new Map(G.F.filter((f) => !f.inset).map((f) => [f.x.key, f]));
    const mk = (cls, before, el, key) => { const p = doc.createElementNS(SVGNS, 'path'); p.setAttribute('class', cls); if (key) p.setAttribute('data-area', key); p.setAttribute('aria-hidden', 'true'); el.insertBefore(p, before); return p; };
    /* 하나뿐인 경로(섬 고리·둘레선): 있으면 고치고, 없어졌으면 지우고, 새로 생기면 만든다 */
    const one = (el, sel, cls, d, before) => { let p = el.querySelector(':scope > ' + sel); if (!d) { if (p) p.remove(); return; } if (!p) p = mk(cls, before, el); p.setAttribute('d', d); };
    const wkey = (f) => (f.walls ? f.walls.join('\n') : f.wall);
    for (const f of F) {
      const el = els.get(f.x.key), p = old.get(f.x.key); if (!el) continue;
      f.vis = p && p.vis != null ? p.vis : 1; if (p && p.hid) f.hid = true;
      const top = el.querySelector(':scope > .f');
      if (!p || p.d !== f.d) top.setAttribute('d', f.d);
      if (!p || wkey(p) !== wkey(f)) {
        const want = wallsOf(f), have = [...el.querySelectorAll(':scope > .w')];
        want.forEach(([t, d], i) => { const w = have[i] || mk('', top, el, f.x.key); w.setAttribute('class', `w c${f.x.c}${t}${top.classList.contains('out') ? ' out' : ''}`); w.setAttribute('d', d); });
        have.slice(want.length).forEach((w) => w.remove());
      }
      if (!p || p.isle !== f.isle) one(el, '.isle', `isle c${f.x.c}`, f.isle, top.nextSibling);
      if (!p || p.outl !== f.outl) one(el, '.ol', 'ol', f.outl, null);
      if (!p || p.sdl !== f.sdl) one(el, '.sdl:not(.on)', 'sdl', f.sdl, null);
      if (!p || p.sdlOn !== f.sdlOn) one(el, '.sdl.on', 'sdl on', f.sdlOn, null);
      if (!p || p.h !== f.h) el.dataset.h = f.h.toFixed(2);
      if (!p || p.u !== f.u) el.dataset.u = f.u;
    }
    /* 그리는 순서(높이 → 깊이)가 바뀌었으면 묶음을 그 순서로(섬 삽입 지도는 맨 뒤 그대로) */
    const now = [...els.keys()];
    if (F.some((f, i) => now[i] !== f.x.key)) for (const f of F) { const el = els.get(f.x.key); if (el) box.insertBefore(el, ins); }
    if (moved) {
      const sp = sea ? svg.querySelectorAll(':scope > .sea') : [], seaD = (dy) => dOf(F.filter((f) => !f.hid).flatMap((f) => f.G), dy);
      if (sp[0]) sp[0].setAttribute('d', seaD(T + 2));
      if (sp[1]) sp[1].setAttribute('d', seaD(T + 1));
      svg.querySelectorAll(':scope > .ctx').forEach((el, i) => { if (gv.ctx[i]) el.setAttribute('d', dOf(gv.ctx[i].rings, T)); });
      svg.dataset.k = gv.k;
      if (gv.V) svg.dataset.bearing = gv.V.bearing; else delete svg.dataset.bearing;
      const C = ctxOf(gv, T, (nm) => (G.ctxL && G.ctxL.v === nm ? G.ctxL.w : textW(nm, 14, 400) + 6));
      G.ctxL = C.ctxL; if (C.ctxLs) G.ctxLs = C.ctxLs; G.ctxRings = C.ctxRings; G.k = gv.k;
      if (gv.V) G.V = gv.V; else delete G.V;
    }
    G.F = [...F, ...G.F.filter((f) => f.inset)];
  }
  /* 보기 상태만 바꿔 다시 그린다(끌기·키보드·단추): 높이(Hmax·면 높이)는 지금 그대로, 투영·보이는 벽·그리는 순서만 다시. view 가 기본이면 기본 기하로 돌아온다.
     opt.sea = false: 바다 둘레(그림의 절반 가까운 글자 수)를 건너뛴다 — 끄는 동안 프레임마다는 이것으로(무대 .orbiting 이면 CSS 가 바다 둘레를 숨긴다), 끝에서 한 번 opt 없이 부른다.
     가림 맞춤을 그 보기로 다시 하려면 끌기를 마친 뒤 draw(svg, g, { ...o, view }) 를 부른다. 반환: G(같은 객체) */
  function reproject(svg, G, view, opt = {}) {
    const st = G.st;
    st.gv = project(st.g, view);
    sync(svg, G, faces(st.gv, st.o, st), true, opt.sea !== false);
    return G;
  }
  /* 지수형 감속(처음 빠르고 끝에서 부드럽게 멈춘다). t ≥ 1 이면 정확히 1 */
  const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
  /* 움직임 줄이기 설정(그 창의 matchMedia) — 켜져 있으면 움직이지 않고 바로 마지막 상태 */
  const reducedMotion = (win) => !!(win && typeof win.matchMedia === 'function' && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
  /* 높이 전환 계획(순수): next = { 코드: 값 }(없는 코드는 0) → 면마다(gv.own 순서) 시작 높이 h0 · 목표 높이 h1 · 늦춤 delay(ms), 한 면 길이 dur, 전체 total.
     opt = { umax(높이 배율 고정 — 없으면 그린 때 고정한 값, 그것도 없으면 next 최댓값), Hmax(없으면 G.Hmax), from({ 코드: 값 } — 없으면 지금 높이에서),
             duration(ms, 기본 700), stagger: { origin(코드 또는 화면 [x, y]), msPerPx(그 점에서 라벨 점까지 1px 마다 늦춤) } } */
  function heightPlan(G, next, opt = {}) {
    const st = G.st, own = st.gv.own, Hmax = opt.Hmax || G.Hmax, out = outOf(st.o), us = own.map((q) => (out(q.code) ? 0 : next[q.code] || 0));   // 보는 시도 밖 면은 늘 평평
    const umax = opt.umax || st.umax || Math.max(1, ...us), h1 = faceH(us, 4, Hmax, umax);
    const h0 = opt.from ? faceH(own.map((q) => (out(q.code) ? 0 : opt.from[q.code] || 0)), 4, Hmax, umax) : st.hs.slice();
    const sg = opt.stagger, at = sg && (Array.isArray(sg.origin) ? sg.origin : (own.find((q) => q.code === sg.origin) || {}).lp);
    const delay = own.map((q) => (at && sg.msPerPx ? Math.hypot(q.lp[0] - at[0], q.lp[1] - at[1]) * sg.msPerPx : 0));
    const dur = opt.duration == null ? 700 : Math.max(0, opt.duration);
    return { us, h0, h1, delay, dur, total: dur + Math.max(0, ...delay), umax, Hmax };
  }
  /* 계획 P 의 ms 시점 높이(순수): 면마다 늦춤만큼 기다렸다가 dur 동안 ease. 0 이전은 h0, 끝난 면은 정확히 h1 */
  const heightsAt = (P, ms, ease = easeOutExpo) => P.h1.map((h1, i) => { const t = P.dur > 0 ? (ms - P.delay[i]) / P.dur : ms >= P.delay[i] ? 1 : 0; return t >= 1 ? h1 : t <= 0 ? P.h0[i] : P.h0[i] + (h1 - P.h0[i]) * ease(t); });
  /* 높이 전환: 같은 기하(같은 보기)에서 면 값만 next 로 바꿔 높이를 rAF 로 보간한다 — 프레임마다 윗면·옆벽 경로만 고친다(가림 맞춤·라벨 없음).
     처음 솟음은 opt.from = {}(모두 0)과 stagger(기준 면에서 바깥으로 거리순)로. 움직임 줄이기면 바로 마지막 상태 + onEnd.
     opt = heightPlan 옵션 + { ease, onFrame(진행 0~1, G), onEnd(G) }. 새 전환을 시작하면 하던 전환은 그 자리에서 멈추고 거기서 이어 간다.
     반환: { cancel()(그 자리에서 멈춤), finish()(바로 끝 상태 + onEnd) } */
  function animateHeights(svg, G, next, opt = {}) {
    const st = G.st, win = svg.ownerDocument && svg.ownerDocument.defaultView;
    if (st.anim) st.anim.cancel();
    const P = heightPlan(G, next, opt), ease = opt.ease || easeOutExpo;
    let raf = 0, t0 = null, done = false;
    const step = (ms) => { st.hs = heightsAt(P, ms, ease); if (ms === Infinity) st.us = P.us; sync(svg, G, faces(st.gv, st.o, st), false); };   // 면 값(data-u)은 끝에서 바꾼다
    const stop = () => { done = true; if (raf && win) win.cancelAnimationFrame(raf); raf = 0; if (st.anim === hd) st.anim = null; };
    const end = () => { stop(); step(Infinity); G.Hmax = P.Hmax; svg.dataset.hmax = P.Hmax; if (opt.umax) st.umax = opt.umax; if (opt.onEnd) opt.onEnd(G); };
    const hd = { cancel: () => { if (!done) stop(); }, finish: () => { if (!done) end(); } };
    if (P.total <= 0 || !win || !win.requestAnimationFrame || reducedMotion(win)) { end(); return hd; }
    st.anim = hd; step(0);   // 첫 프레임 전에 시작 상태로(끝 상태가 한 번 비치지 않게)
    const tick = (now) => { if (done) return; if (t0 == null) t0 = now; const ms = now - t0; if (ms >= P.total) { end(); return; } step(ms); if (opt.onFrame) opt.onFrame(ms / P.total, G); raf = win.requestAnimationFrame(tick); };
    raf = win.requestAnimationFrame(tick);
    return hd;
  }
  /* 지표를 바꿀 때: 기하는 그대로 두고 면·옆벽·작은 섬 고리의 색 단계(cN)와 면 이름(aria)만 다시 칠한다(G16 '고르기는 칠하기만').
     G.F 의 x 는 부르는 쪽 단위 객체 그대로 — 그 c 를 바꾼 뒤 부른다 */
  function recolor(svg, G) {
    const byKey = new Map(G.F.map((f) => [f.x.key, f.x])), cls = (el, c) => el.setAttribute('class', el.getAttribute('class').replace(/\bc\d\b/, 'c' + c));
    for (const el of svg.querySelectorAll('.fg')) { const x = byKey.get(el.dataset.area); if (x) el.querySelectorAll('.f, .w, .isle').forEach((p) => cls(p, x.c)); }
    for (const el of svg.querySelectorAll('.f')) { const x = byKey.get(el.dataset.area); if (!x) continue; cls(el, x.c); el.setAttribute('aria-label', G.aria(x)); }
  }
  /* 화면 좌표의 면 단계(라벨 글자색): 그 점에서 가장 위(나중에 칠한) 윗면 */
  function faceClassAt(G, x, y) {
    let c = 0; for (const f of G.F) if (!f.inset && f.R.some((r) => inRing([x, y], r))) c = f.x.c;
    return c;
  }
  /* ---------- 기본 라벨(기하·내 동네·이름표 값이 바뀔 때만): '이름 / 숫자' 두 줄 묶음 ----------
     내 동네 → 값 큰 순 그리디(상위 5·내 동네는 반드시). 자리: 윗면 라벨 점에 두 줄이 면 안에 들어가면 면 안 → 상위 10 은 자기 면 라벨 점 위에 옅은 바탕 두 줄
     → 이름 한 줄(면 안 → 라벨 점 위 옅은 바탕) → 아니면 생략(가리킴·순위 목록이 받는다). 연결선·떨어진 자리는 쓰지 않는다(2026-10-17 사용자 지시).
     0 인 면은 이름만 옅게. 맥락 시도 면 위에는 놓지 않는다. 그린 뒤 getBBox 로 실제 상자를 재서 겹치면 맥락 이름 → 낮은 순위 묶음 순으로 뺀다.
     휴대폰은 상위 5곳(+ 내 동네)만. 고를 때·가리킬 때는 라벨을 다시 놓지 않는다(위치 고정, G16).
     units = [{ key, name, u(순서·숫자 값), c }], opt = { homeKey, strict }. 반환: 놓인 라벨 [{ key, v, nm, x, y, w, h }] */
  function labels(g, G, units, opt = {}) {
    const { W, H, ctxL, narrow } = G;
    const inStage = (o) => o.x - o.w / 2 >= 2 && o.x + o.w / 2 <= W - 2 && o.y - o.h / 2 >= 2 && o.y + o.h / 2 <= H - 2;
    const plate = G.F.filter((f) => !f.inset), fOf = Object.fromEntries(plate.map((f) => [f.x.key, f]));
    const SN = shortNames(units.map((x) => x.name));
    /* 화면 점의 맨 위(나중에 칠한) 윗면 — 면 돌출로 이웃이 덮은 곳까지 반영 */
    const fbb = plate.map((f) => f.R.flat().reduce((q, [x, y]) => [Math.min(q[0], x), Math.min(q[1], y), Math.max(q[2], x), Math.max(q[3], y)], [Infinity, Infinity, -Infinity, -Infinity]));
    /* 화면 점의 맨 위 칠: 그리는 순서대로 벽·윗면을 화소 판에 번호로 칠해 둔다(r9 — 남의 옆벽 위도 '남의 면'으로 본다). 윗면 = { key, c }, 옆벽 = { key: 'wall', c } */
    const PM = (() => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d', { willReadFrequently: true });
      plate.forEach((f, i) => { if (f.wall) { c.fillStyle = PIX.id(i + 1, 2); c.fill(new Path2D(f.wall)); } c.fillStyle = PIX.id(i + 1, 1); c.fill(new Path2D(f.d), 'evenodd'); });
      const d = c.getImageData(0, 0, W, H).data, m = new Int32Array(W * H);
      for (let k = 0; k < W * H; k++) { if (d[k * 4 + 3] < 128) continue; const id = d[k * 4] + (d[k * 4 + 1] << 8), b = d[k * 4 + 2]; m[k] = id < 1 || id > plate.length ? -1e6 : b === 1 ? id : -id; }
      return m; })();
    const topAt = (x, y) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return null; const v = PM[y * W + x]; if (!v) return null; if (v === -1e6) return { key: 'wall', c: 0 }; const f = plate[Math.abs(v) - 1]; return v > 0 ? { key: f.x.key, c: f.x.c } : { key: 'wall', c: f.x.c }; };
    const P5 = [[0, 0], [-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5]], pts = (o) => P5.map(([a, b]) => [o.x + a * (o.w - 4), o.y + b * (o.h - 4)]);
    /* 면 안 묶음(r9): 다섯 점(가운데·네 귀)이 모두 자기 윗면 위 + 상자 넓이의 70% 이상이 자기 윗면 위(6×3 표본) */
    const share = (f, o) => { let n = 0; for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) if (topAt(o.x - o.w / 2 + o.w * (i + .5) / 6, o.y - o.h / 2 + o.h * (j + .5) / 3)?.key === f.x.key) n++; return n / 18; };
    const inFace = (f, o) => pts(o).every(([x, y]) => topAt(x, y)?.key === f.x.key) && share(f, o) >= .7;
    /* 맥락 시도 면(경기 화면의 서울): 시군구 묶음은 그 위에 놓지 않는다 */
    /* 맥락 시도 면은 한 번 화소 판(1 = 그 면 위)으로 칠해 두고 찾아본다(후보가 많아 다각형 판정을 되풀이하지 않게) */
    const ctxR = (G.ctxRings || []), ctxM = (() => { if (!ctxR.length) return null; const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d', { willReadFrequently: true }); c.fillStyle = PIX.on; for (const r of ctxR) { c.beginPath(); r.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill(); } const d = c.getImageData(0, 0, W, H).data, m = new Uint8Array(W * H); for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 127 ? 1 : 0; return m; })();
    const inCtx = (x, y) => { if (!ctxM) return false; x = Math.round(x); y = Math.round(y); return x >= 0 && y >= 0 && x < W && y < H && ctxM[y * W + x] === 1; };
    const onCtx = (o) => pts(o).some(([x, y]) => inCtx(x, y));
    const boxes = [], out = [];
    if (G.inset) { const b = G.inset; boxes.push({ key: 'inset', x: b.x + b.w / 2, y: b.y + b.h / 2, w: b.w, h: b.h }); }
    const hit = (a, b) => Math.abs(a.x - b.x) * 2 < a.w + b.w + 8 && Math.abs(a.y - b.y) * 2 < a.h + b.h + 8;   // 묶음끼리 4px 이상 띄워 잡는다(그린 뒤 실제 상자로 3px 확인)
    let me = null;
    const covers = (o, b) => Math.abs(o.x - b.x) * 2 < o.w + 6 && Math.abs(o.y - b.y) * 2 < o.h + 6;   // 남의 라벨 점(3px 둘레)을 덮는지
    const free = (o, loose) => inStage(o) && !boxes.some((b) => b.key !== me && (b.anchor ? !loose && covers(o, b) : hit(o, b)));   // loose: 남의 라벨 점 상자는 무시(반드시 보일 곳)
    const order = units.filter((x) => fOf[x.key]).sort((a, b) => b.u - a.u), rkOf = new Map(order.map((x, i) => [x.key, i]));
    const hm = order.find((x) => x.key === opt.homeKey); if (hm) order.splice(order.indexOf(hm), 1), order.unshift(hm);   // 내 동네가 먼저 자리를 잡는다
    const NTOP = narrow ? 5 : 10;   // 옅은 바탕 두 줄: 휴대폰 상위 5 · 그 밖 상위 10
    /* 라벨 점(휴대폰은 상위 5, 그 밖은 값이 있는 모든 면)은 남의 묶음이 덮지 않게 작은 막힌 상자로(그 면의 묶음이 그 점 위에 와야 한다) */
    order.filter((x) => (narrow ? rkOf.get(x.key) < NTOP : x.u > 0)).forEach((x) => { const f = fOf[x.key]; boxes.push({ key: x.key, x: f.bx, y: f.by, w: 6, h: 6, anchor: true }); });
    const pl = (o) => o && { ...o, pill: true };
    order.forEach((x, pr) => {
      const ri = rkOf.get(x.key), must = (!opt.strict && !!x.u && ri < 5) || x === hm;   // 상위 5 · 내 동네는 반드시(strict: 내 동네만 — 작은 면이 몰린 판은 상위라도 겹치면 숨긴다, /map 수도권)
      if (narrow && !must && (ri >= 5 || !x.u)) return;
      const f = fOf[x.key], nm = SN[x.name] || x.name, v = x.u ? labelNum(x.u) : '', [px, py] = [f.bx, f.by]; me = x.key;
      const NS = 14, w2 = Math.max(textW(nm, NS, 400), v ? textW(v, 16) : 0) + 8, h2 = v ? 38 : 19;   // 지도 라벨 14px 이상(휴대폰 포함, G9) · 숫자 16px 700
      const near = [[0, 0], [0, -5], [0, 5], [-6, 0], [6, 0]].map(([dx, dy]) => ({ x: px + dx, y: py + dy, w: w2, h: h2 }));
      /* 자기 면 라벨 점 위 자리: 상자가 그 점을 덮는(가장자리에서 4px 이상 안쪽) 4px 격자, 점에서 가까운 순 — 떨어진 자리가 아니다 */
      const onPt = (w, h) => { const P = []; for (let dy = -(h / 2 - 4); dy <= h / 2 - 4; dy += 4) for (let dx = -(w / 2 - 4); dx <= w / 2 - 4; dx += 4) P.push({ x: px + dx, y: py + dy, w, h, d: Math.hypot(dx, dy) }); return P.sort((a, b) => a.d - b.d); };
      /* 면 안 자리: 라벨 점 근처 → 면 상자 안 4px 격자(라벨 점에서 가까운 순) */
      const fb = fbb[plate.indexOf(f)], inner = (w, h) => { const P = []; for (let yy = fb[1] + h / 2; yy <= fb[3] - h / 2; yy += 4) for (let xx = fb[0] + w / 2; xx <= fb[2] - w / 2; xx += 4) P.push({ x: xx, y: yy, w, h, d: Math.hypot(xx - px, yy - py) }); return P.sort((a, b) => a.d - b.d).slice(0, 400); };
      let at = near.find((o) => inFace(f, o) && free(o)) || inner(w2, h2).find((o) => inFace(f, o) && free(o));
      /* 면 안에 안 들어가면 자기 면 라벨 점 위에 옅은 바탕(놓인 면의 값으로 읽히지 않게, 70% 규칙 면제). 반드시 보일 곳은 남의 점 상자를 무시하고, 그래도 없으면 제자리 */
      if (!at && x.u && ri < NTOP) at = pl(onPt(w2, h2).find((o) => free(o) && !onCtx(o)));
      if (!at && must) at = pl(onPt(w2, h2).find((o) => free(o, true) && !onCtx(o)));
      let one = false;
      const w1 = textW(nm, NS, 400) + 8;
      if (!at && v) { at = [[0, 0], [0, -6], [0, 6], [-8, 0], [8, 0], [0, -12], [0, 12]].map(([dx, dy]) => ({ x: px + dx, y: py + dy, w: w1, h: 19 })).find((o) => inFace(f, o) && free(o)) || inner(w1, 19).find((o) => inFace(f, o) && free(o)); if (at) one = true; }
      /* 그래도 없으면: 이름 한 줄을 자기 면 라벨 점 위에 옅은 바탕으로. 반드시 보일 곳은 마지막에 제자리 두 줄 */
      if (!at) { at = pl(onPt(w1, 19).find((o) => free(o, must) && !onCtx(o))); if (at && v) one = true; }
      if (!at && must) at = pl(near.find((o) => inStage(o))) || pl(near[0]);
      if (!at) return;
      const ai = boxes.findIndex((b) => b.anchor && b.key === x.key); if (ai >= 0) boxes.splice(ai, 1);   // 놓였으면 자기 점 상자는 묶음이 대신한다
      boxes.push({ ...at, key: x.key });
      out.push({ key: x.key, nm, full: x.name, v: one ? '' : v, zero: !x.u, at, ri, pr, must, pill: !!at.pill });
    });
    /* 맥락 시도 이름('서울'): 묶음을 다 놓은 뒤, 그 시도 면 안에서 비어 있는 자리(대표점에서 가까운 순). 없으면 숨긴다 */
    /* 전국 보기는 맥락 시도마다(G.ctxLs, 그 시도 면 안에만), 그 밖은 맥락 시도 하나(ctxL). 놓은 이름은 다음 이름이 비켜 가게 상자로 남긴다 */
    let ctxAt = [];
    for (const L of G.ctxLs || (ctxL ? [ctxL] : [])) {
      const RR = L.rings || ctxR, inL = L.rings ? (x, y) => L.rings.some((r) => inRing([x, y], r)) : inCtx;
      const w = textW(L.v, 14, 400) + 10, h = 19, xs = RR.flat().map((p) => p[0]), ys = RR.flat().map((p) => p[1]), c = [{ x: L.x, y: L.y, w, h }];
      for (let yy = Math.min(...ys); yy <= Math.max(...ys); yy += 4) for (let xx = Math.min(...xs); xx <= Math.max(...xs); xx += 4) c.push({ x: xx, y: yy, w, h });
      const at = c.sort((a, b) => Math.hypot(a.x - L.x, a.y - L.y) - Math.hypot(b.x - L.x, b.y - L.y)).find((o) => free(o) && pts(o).every(([x, y]) => inCtx(x, y) && inL(x, y) && !topAt(x, y)));
      if (at) { ctxAt.push({ L, at }); boxes.push({ ...at, key: L.key }); }
    }
    const paint = () => {
      g.innerHTML = out.map((p) => { const b = p.at, c = faceClassAt(G, b.x, b.y), two = !!p.v;
        return `<g class="lb-g${p.zero ? ' z' : ''}${p.pill ? ' pl' : ''}" data-area="${p.key}" data-v="${p.v}" data-nm="${esc(p.nm)}" data-box="${b.x},${b.y},${b.w},${b.h}">
      ${p.pill ? `<rect class="plb" x="${b.x - b.w / 2}" y="${b.y - b.h / 2}" width="${b.w}" height="${b.h}" rx="6"/>` : ''}
      <text class="lb nm f${c}" x="${b.x}" y="${two ? b.y - 9 : b.y}">${esc(p.nm)}</text>${two ? `<text class="lb f${c}" x="${b.x}" y="${b.y + 10}">${p.v}</text>` : ''}</g>`;
      }).join('') + ctxAt.map(({ L, at }) => `<text class="lb-ctx${L.far ? ' far' : ''}" x="${at.x}" y="${at.y}" data-box="${at.x},${at.y},${at.w},${at.h}">${esc(L.v)}</text>`).join('');
    };
    paint();
    /* 2차: 그린 글자의 실제 상자(getBBox)로 다시 잰다 — 겹치면 맥락 이름을 먼저 빼고, 그다음 낮은 순위 묶음을 뺀다(상위 5·내 동네는 남긴다) */
    const real = () => { const R = [...g.querySelectorAll('.lb-g')].map((el) => { let u = null; for (const t of el.querySelectorAll('text, .plb')) { const b = t.getBBox(); u = u ? [Math.min(u[0], b.x), Math.min(u[1], b.y), Math.max(u[2], b.x + b.width), Math.max(u[3], b.y + b.height)] : [b.x, b.y, b.x + b.width, b.y + b.height]; } return { key: el.dataset.area, u }; });
      g.querySelectorAll('.lb-ctx').forEach((ct, i) => { const b = ct.getBBox(); R.push({ key: ctxAt[i].L.key, u: [b.x, b.y, b.x + b.width, b.y + b.height] }); }); return R; };
    /* 묶음끼리 실제 간격 3px 미만이면 가까운 것으로 본다(r9). 무대 밖으로 나간 묶음은 반드시 보일 곳·상위 10 두 줄이면 안쪽으로 밀고, 그 밖은 뺀다 */
    const isCtx = (k) => String(k).startsWith('ctx');
    const ovr = (a, b) => Math.min(a.u[2], b.u[2]) - Math.max(a.u[0], b.u[0]) > -3 && Math.min(a.u[3], b.u[3]) - Math.max(a.u[1], b.u[1]) > -3;
    for (let guard = 0; guard < 40; guard++) {
      const R = real(); let drop = null;
      const outS = R.find((r) => !isCtx(r.key) && (r.u[0] < 1 || r.u[1] < 1 || r.u[2] > W - 1 || r.u[3] > H - 1));
      if (outS) { const p = out.find((q) => q.key === outS.key);
        if (!p.must && (p.ri >= NTOP || !p.v)) { out.splice(out.indexOf(p), 1); paint(); continue; }
        const dx = outS.u[0] < 1 ? 1 - outS.u[0] : outS.u[2] > W - 1 ? W - 1 - outS.u[2] : 0, dy = outS.u[1] < 1 ? 1 - outS.u[1] : outS.u[3] > H - 1 ? H - 1 - outS.u[3] : 0;
        if (dx || dy) { p.at = { ...p.at, x: p.at.x + dx, y: p.at.y + dy }; paint(); continue; } }
      for (let i = 0; i < R.length && !drop; i++) for (let j = i + 1; j < R.length; j++) if (ovr(R[i], R[j])) { const rk = (k) => (isCtx(k) ? 1e9 : out.find((p) => p.key === k).pr), lo = rk(R[i].key) > rk(R[j].key) ? R[i].key : R[j].key; drop = lo; break; }
      if (!drop) break;
      if (isCtx(drop)) ctxAt = ctxAt.filter((c) => c.L.key !== drop); else { const p = out.find((q) => q.key === drop); if (p.must) break; out.splice(out.indexOf(p), 1); }
      paint();
    }
    return out.map((p) => ({ key: p.key, v: p.v, nm: p.nm, x: p.at.x, y: p.at.y, w: p.at.w, h: p.at.h }));
  }
  /* ---------- 칠하기(고를 때·가리킬 때마다, svg·라벨은 다시 만들지 않는다) ----------
     고른 곳·가리킨 곳·키보드 위치는 그림만 띄운다(2026-10-18 사용자 피드백 '검은 굵은 경계선 대신 입체로'): 기하(면 높이 값·경계·라벨 자리)는 그대로(G16).
     .lift 층(면 묶음 위, 라벨 아래)에 그 면의 사본을 놓는다 — 바닥 그림자(고른 곳만) · 원래 자리의 옆면 색 판 · 들어 올린 옆벽 + 윗면(그 면 단계 계열 1.25px 윤곽).
     띄우는 높이·색·짧은 ease-out 전이는 map3d.css(.lift .on 5px · .hv 2px, 줄이기 동작이면 0·전이 없음). 그 면의 이름표도 같은 만큼 올린다(.lb-g.up-on·up-hv). 키보드 초점 고리는 그대로 둔다.
     p = { sel: 고른 곳, hover: 가리킨 곳, kb: 키보드 위치 } (코드 또는 null), 선택 band: 범례 구간 면 코드 목록(2026-10-19 /citizen — 그 면은 가리킨 곳처럼 2px 띄우고,
     나머지 면 묶음은 흐리게 .fg.dim · 보는 시도 밖 면·고른 곳·가리킨 곳은 흐리지 않는다). 주지 않으면 예전 그대로 */
  function paintFaces(svg, p) {
    const doc = svg.ownerDocument, NS = 'http://www.w3.org/2000/svg', dOfKey = (k) => (k ? doc.getElementById('f-' + k)?.getAttribute('d') || '' : '');
    svg.querySelectorAll('.f[aria-selected="true"]').forEach((f) => f.setAttribute('aria-selected', 'false'));
    const sf = p.sel ? doc.getElementById('f-' + p.sel) : null;
    if (sf) sf.setAttribute('aria-selected', 'true');
    for (const c of ['.kb-halo', '.kb']) svg.querySelector(c).setAttribute('d', p.kb && p.kb !== p.sel ? dOfKey(p.kb) : '');
    svg.querySelectorAll('.f.hl').forEach((f) => f.classList.remove('hl'));
    const hf = p.hover ? doc.getElementById('f-' + p.hover) : null; if (hf && !hf.classList.contains('out')) hf.classList.add('hl');   // 순위 줄·옆벽에서 가리켜도 면 효과(보는 시도 밖 면은 없음)
    const el = (tag, cls, d) => { const e = doc.createElementNS(NS, tag); e.setAttribute('class', cls); if (d) e.setAttribute('d', d); return e; };
    const band = p.band ? new Set(p.band) : null;
    svg.querySelectorAll('.faces > .fg').forEach((g) => { const k = g.dataset.area, f = g.querySelector(':scope > .f'); g.classList.toggle('dim', !!band && !band.has(k) && k !== p.hover && k !== p.sel && !(f && f.classList.contains('out'))); });
    const ups = [...new Set([p.hover, p.kb, ...(band || [])].filter((k) => k && k !== p.sel))].map((k) => [k, 'hv']).concat(p.sel ? [[p.sel, 'on']] : []);   // 고른 곳을 맨 나중(맨 위)에
    const lift = svg.querySelector('.lift'), kids = [];
    for (const [k, lv] of ups) {
      const f = doc.getElementById('f-' + k); if (!f || f.classList.contains('out')) continue;   // 보는 시도 밖 면은 띄우지 않는다
      const d = f.getAttribute('d'), c = (f.getAttribute('class').match(/\bc\d\b/) || ['c0'])[0], ws = f.parentNode.querySelectorAll(':scope > .w'), g = el('g', `${lv} ${c}`), up = el('g', 'up');
      if (lv === 'on') g.appendChild(el('path', 'up-shd', d));
      g.appendChild(el('path', 'up-side', d));
      for (const w of ws) up.appendChild(el('path', 'up-w' + ((w.getAttribute('class').match(/ l[123]\b/) || [''])[0]), w.getAttribute('d')));   // 명암을 켰으면 단계마다(.up-w.lN)
      up.appendChild(el('path', 'up-top', d));
      g.appendChild(up); kids.push(g);
    }
    lift.replaceChildren(...kids);
    svg.querySelectorAll('.lbls .lb-g').forEach((g) => { const u = ups.find(([k]) => k === g.dataset.area); g.classList.toggle('up-on', !!u && u[1] === 'on'); g.classList.toggle('up-hv', !!u && u[1] === 'hv'); });
  }
  /* 지도 키보드(탭 정지점은 지도 하나, aria-activedescendant): 화살표는 위치대로 — 그 방향(±45°)에 있는 가장 가까운 라벨 점, Home·End 는 위·아래 끝, Enter·Space 는 고르기.
     반환: null(다루지 않는 키) · { key }(옮김) · { key, enter: true }(고름) */
  function keyMove(G, curKey, key) {
    const F = G.F, cur = F.find((f) => f.x.key === curKey) || F[0];
    const dir = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key];
    let next = null;
    if (dir) {
      let best = Infinity;
      for (const f of F) {
        if (f === cur || f.hid) continue;   // 그리지 않는 면(.hid)은 건너뛴다
        const dx = f.bx - cur.bx, dy = (f.by - cur.by) / G.k, along = dx * dir[0] + dy * dir[1], perp = Math.abs(dx * dir[1] - dy * dir[0]);
        if (along <= 0 || perp > along) continue;
        const sc = Math.hypot(dx, dy); if (sc < best) { best = sc; next = f; }
      }
      if (!next) next = cur;
    } else if (key === 'Home' || key === 'End') {
      const ord = F.filter((f) => !f.hid).sort((a, b) => (Math.round(a.by / 40) - Math.round(b.by / 40)) || a.bx - b.bx);
      next = key === 'Home' ? ord[0] : ord[ord.length - 1];
    } else if (key === 'Enter' || key === ' ') return { key: cur.x.key, enter: true };
    return next ? { key: next.x.key } : null;
  }

  /* ---------- 돌려 보기 조작(선택형) ----------
     orbitStep(순수): 끌기 시작 보기 v0 에서 끈 거리(dx, dy px)·비튼 각도(twist, 도) → 새 보기. 가로로 끌면 돈다(가까운 쪽을 잡아 끄는 느낌 — 오른쪽으로 끌면 반시계),
     세로로 끌면 기울기(아래로 끌면 더 내려다본다), 두 손가락을 비틀면 그만큼 돈다. o.min·o.max({ bearing, k })로 자른다(기본 VIEW_LIM) */
  const ORBIT = { degPerPx: .25, kPerPx: .0015, slop: 4 };
  function orbitStep(v0, dx, dy, o = {}, twist = 0) {
    const lo = { bearing: VIEW_LIM.bearing[0], k: VIEW_LIM.k[0], ...(o.min || {}) }, hi = { bearing: VIEW_LIM.bearing[1], k: VIEW_LIM.k[1], ...(o.max || {}) };
    return { bearing: clampTo((v0.bearing || 0) - dx * (o.degPerPx || ORBIT.degPerPx) + twist, [lo.bearing, hi.bearing]), k: clampTo(v0.k + dy * (o.kPerPx || ORBIT.kPerPx), [lo.k, hi.k]) };
  }
  /* 무대 끌기 → 보기 상태(attachOrbit): 마우스·펜은 왼쪽 단추로 끌기, 터치는 두 손가락일 때만(한 손가락은 페이지 스크롤 그대로 — 두 손가락일 때만 기본 동작을 막는다).
     slop(4px)·비틂 3° 를 넘어야 끌기로 보고, 끌었으면 이어지는 click 하나를 삼킨다(눌러서 고르기와 섞이지 않게 — 부르는 쪽 고르기는 click 으로).
     o = { get() → 지금 보기, set(보기)(rAF 로 묶어 프레임마다 한 번 — 보통 reproject), onStart(보기)(라벨 층 숨기기 등), onEnd(보기)(라벨 다시 놓기·필요하면 draw 로 가림 맞춤), min, max, degPerPx, kPerPx, slop }.
     끄는 동안 무대에 .orbiting. 반환: 떼어 내기 함수 */
  function attachOrbit(stage, o) {
    const win = stage.ownerDocument.defaultView, slop = o.slop || ORBIT.slop;
    let drag = null, raf = 0, pend = null;
    const push = (v) => { pend = v; if (!raf) raf = win.requestAnimationFrame(() => { raf = 0; const p = pend; pend = null; if (p) o.set(p); }); };
    const flush = () => { if (raf) { win.cancelAnimationFrame(raf); raf = 0; } if (pend) { const p = pend; pend = null; o.set(p); } };
    const eat = (e) => { e.stopImmediatePropagation(); e.preventDefault(); };
    const swallow = () => { stage.addEventListener('click', eat, { capture: true, once: true }); win.setTimeout(() => stage.removeEventListener('click', eat, { capture: true }), 0); };
    const begin = () => { drag.on = true; stage.classList.add('orbiting'); if (o.onStart) o.onStart(drag.v0); };
    const finish = () => { const d = drag; drag = null; if (!d || !d.on) return; flush(); stage.classList.remove('orbiting'); if (o.onEnd) o.onEnd(d.last || d.v0); if (!d.touch) swallow(); };
    const down = (e) => { if (drag || e.pointerType === 'touch' || e.button !== 0) return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY, v0: o.get(), on: false, last: null }; };
    const move = (e) => {
      if (!drag || drag.touch || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.on) { if (Math.hypot(dx, dy) < slop) return; begin(); try { stage.setPointerCapture(e.pointerId); } catch (_) { /* 붙잡기 실패해도 끌기는 이어 간다 */ } }
      drag.last = orbitStep(drag.v0, dx, dy, o); push(drag.last);
    };
    const up = (e) => { if (drag && !drag.touch && drag.id === e.pointerId) finish(); };
    const two = (e) => { const [a, b] = e.touches; return { my: (a.clientY + b.clientY) / 2, ang: Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX) * 180 / Math.PI }; };
    const tstart = (e) => { if (e.touches.length !== 2) { if (drag && drag.touch) finish(); return; } if (drag) return; e.preventDefault(); drag = { touch: true, g0: two(e), v0: o.get(), on: false, last: null }; };
    const tmove = (e) => {
      if (!drag || !drag.touch || e.touches.length !== 2) return;
      e.preventDefault();
      const g = two(e), dy = g.my - drag.g0.my, da = ((g.ang - drag.g0.ang + 540) % 360) - 180;
      if (!drag.on) { if (Math.abs(dy) < slop && Math.abs(da) < 3) return; begin(); }
      drag.last = orbitStep(drag.v0, 0, dy, o, da); push(drag.last);
    };
    const tend = (e) => { if (drag && drag.touch && e.touches.length < 2) finish(); };
    const L = [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up], ['touchstart', tstart, { passive: false }], ['touchmove', tmove, { passive: false }], ['touchend', tend], ['touchcancel', tend]];
    for (const [t, f, op] of L) stage.addEventListener(t, f, op);
    return () => { for (const [t, f, op] of L) stage.removeEventListener(t, f, op); if (raf) win.cancelAnimationFrame(raf); stage.classList.remove('orbiting'); };
  }

  return { labelNum, esc, SIDO_SHORT, shortNames, faceH, ringsOf, inRing, ringArea, prep, bboxOf, arcsOf, nearOf, simplifyVW, chaikin, labelPoint, geom, ptXY, textW, draw, recolor, faceClassAt, labels, paintFaces, keyMove,
    VIEW_LIM, ORBIT, viewOf, viewPt, unviewPt, project, wallTier, faces, reproject, easeOutExpo, reducedMotion, heightPlan, heightsAt, animateHeights, orbitStep, attachOrbit };
});
