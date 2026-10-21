'use strict';
// lib/board/wave3d.ts — 종합상황판 '월별 공급 파동' 3D 차트의 순수 계산(자료 어댑터·축·띠 기하·키보드·대체 판정).
// 3D 라이브러리(three·R3F) 자체는 시험하지 않는다. 우리 쪽 경계만: 2D 리본(lib/board/sample.ts ribbonOf)과 같은 값을 내는지 대조한다.
const test = require('node:test');
const assert = require('node:assert/strict');

/* wave3d.ts 는 같은 폴더 모듈을 확장자 없이 부른다 — 시험에서만 '.ts' 를 붙여 찾는다(data-fix-2 와 같다) */
require('node:module').registerHooks({ resolve(s, c, n) { try { return n(s, c); } catch (e) { if (/^\.\.?\//.test(s)) return n(`${s}.ts`, c); throw e; } } });
const S = require('../../lib/board/sample.ts');
const W = require('../../lib/board/wave3d.ts');
const L = require('../../data/board/home-board.json');

const T = S.timelineOf(L), J = S.judgmentsOf(L), DL = S.delaysOf(J), SF = S.scopeChangeOf(J);
const rib = S.ribbonOf(T, L.stageUnits, DL, SF);
const st = W.stackOf(T, L.stageUnits, DL);
const N = T.last + 1;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), `${msg}: ${a} ≠ ${b}`);

test('① 자료 어댑터: 단계별 누적 하한·상한·지연 띠가 2D 리본(ribbonOf)과 같은 합·같은 쌓임 순서(입주가 바닥, 정책이 맨 위)', () => {
  assert.equal(st.n, N);
  assert.deepEqual(st.total, rib.total, '달마다 총량 = 2D 리본 총량');
  for (let m = 0; m < N; m++) {
    const p = rib.geo.find((g) => Math.abs(g.x - (m + 0.5)) < 1e-9);   // 2D 는 달 m 의 값을 칸 가운데(m + 0.5)에 둔다
    for (let k = 0; k < 6; k++) {
      near(st.lo[k][m], (S.BOT - p.lw[k]) / rib.s2, `하한 k${k} m${m}`);
      near(st.hi[k][m], (S.BOT - p.up[k]) / rib.s2, `상한 k${k} m${m}`);
      near(st.band[k][m], p.dl[k] / rib.s2, `지연 띠 k${k} m${m}`);
      assert.equal(st.hi[k][m] - st.lo[k][m], L.stageUnits[m][k], '층 두께 = 그 단계 호수');
      assert.ok(st.band[k][m] <= L.stageUnits[m][k], '띠는 층보다 두꺼울 수 없다');
    }
    assert.equal(st.lo[5][m], 0, '입주가 바닥');
    assert.equal(st.hi[0][m], st.total[m], '정책 위 = 총량');
    for (let k = 0; k < 5; k++) assert.equal(st.lo[k][m], st.hi[k + 1][m], '층이 틈 없이 쌓인다');
  }
  assert.ok(st.band.flat().some((v) => v > 0), '지연 띠 값이 있다(판정 달)');
});

test('② 세로축: 보이는 달 범위의 최대값으로 d3 nice 눈금 — 범위·높이에 따라 눈금이 바뀐다', () => {
  const full = W.fullWin(N);
  const ya = W.yAxis(st, full, 320);
  const vmax = Math.max(...st.total);
  assert.ok(ya.max >= vmax && ya.max < vmax * 1.5, `맨 위 ${ya.max} ≥ 최대 ${vmax}`);
  assert.equal(ya.ticks[0], 0); assert.equal(ya.ticks.at(-1), ya.max, '맨 위 = 마지막 눈금(nice)');
  const step = ya.ticks[1] - ya.ticks[0], e = 10 ** Math.floor(Math.log10(step));
  assert.ok([1, 2, 5, 10].includes(Math.round(step / e)), `간격 ${step} 은 1·2·5 × 10^n`);
  ya.ticks.forEach((v, i) => near(v, i * step, '눈금 등간격'));
  /* 높이가 작으면 눈금 수가 준다 */
  assert.ok(W.yAxis(st, full, 120).ticks.length < ya.ticks.length, '낮은 판은 눈금이 적다');
  assert.ok(W.yAxis(st, full, 120).ticks.length >= 2);
  /* 보이는 범위만의 최대값: 총량이 가장 작은 달 근처 6개월로 좁히면 맨 위가 그 범위 최대값을 따른다 */
  const tiny = { total: [10, 20, 30, 40, 50, 60, 1000, 2000], n: 8 };
  assert.equal(W.yAxis(tiny, { a: 0, b: 5 }, 320).max, 60);
  assert.equal(W.yAxis(tiny, { a: 2, b: 7 }, 320).max, 2000);
  assert.deepEqual(W.yAxis({ total: [0, 0, 0, 0, 0, 0], n: 6 }, { a: 0, b: 5 }, 320).ticks.slice(0, 1), [0], '값이 모두 0 이어도 축이 선다');
  assert.ok(W.yAxis({ total: [0, 0, 0, 0, 0, 0], n: 6 }, { a: 0, b: 5 }, 320).max > 0);
});

test('② 가로축: 보이는 달 수에 따라 해 → 분기 → 달 간격, 기준 달 표시는 보일 때만', () => {
  const full = W.fullWin(N);
  const yr = W.xTicks(T.months, full);
  assert.equal(yr.unit, 'year');
  assert.deepEqual(yr.ticks.map((t) => t.label), ['2025', '2026', '2027', '2028']);
  assert.ok(yr.ticks.every((t) => T.months[t.m].endsWith('-01')));
  const q = W.xTicks(T.months, { a: 12, b: 23 });
  assert.equal(q.unit, 'quarter');
  assert.deepEqual(q.ticks.map((t) => t.label), ['2026.01', '2026.04', '2026.07', '2026.10']);
  const mo = W.xTicks(T.months, { a: 18, b: 23 });
  assert.equal(mo.unit, 'month');
  assert.equal(mo.ticks.length, 6);
  assert.equal(mo.ticks[0].label, '2026.07');
  /* 기준 달(T.now): 기준 달 칸의 오른쪽 끝(2D nowX = X(now + 1)) */
  const L = W.layoutOf(1090, 454, N);
  assert.equal(W.nowMark(T, L).label, `기준 ${S.ml(T, T.now)}`);
  near(W.nowMark(T, L).x, L.x0 + (T.now + 1) * L.pitch, '기준 달 x');
});

test('③ 범위 고정·가리킴: 보이는 범위는 전체 기간, 확대·이동 함수는 없다 · 판 x → 달(칸 안), 판 밖은 -1', () => {
  assert.deepEqual(W.fullWin(N), { a: 0, b: N - 1 });
  for (const fn of ['zoomWin', 'panWin', 'panPx', 'clampWin', 'toScreen', 'fitDistance', 'stripOf', 'xAt', 'monthAtX', 'zOf']) assert.equal(W[fn], undefined, `${fn} 삭제`);
  assert.equal(W.MIN_SPAN, undefined);
  const L = W.layoutOf(1090, 454, N);
  for (const m of [0, 1, 20, N - 1]) { assert.equal(W.monthAt(L, W.cx(L, m)), m); assert.equal(W.monthAt(L, W.edge(L, m) + 0.01), m, '칸 왼쪽 끝 = 그 달'); }
  assert.equal(W.monthAt(L, L.x0 - 1), -1); assert.equal(W.monthAt(L, L.x1 + 1), -1); assert.equal(W.monthAt(L, L.x1), N - 1);
});

test('③ 키보드: ←→ 고른 달 옮기기 · Shift+←→ 한 해, 양 끝에서 멈춤, 확대 키·다른 키는 처리 안 함', () => {
  assert.equal(W.keyStep(23, 'ArrowRight', false, N), 24);
  assert.equal(W.keyStep(23, 'ArrowLeft', false, N), 22);
  assert.equal(W.keyStep(0, 'ArrowLeft', false, N), 0, '처음에서 멈춤');
  assert.equal(W.keyStep(N - 1, 'ArrowRight', false, N), N - 1, '끝에서 멈춤');
  assert.equal(W.keyStep(20, 'ArrowRight', true, N), 32);
  assert.equal(W.keyStep(5, 'ArrowLeft', true, N), 0);
  for (const k of ['+', '=', '-', '_', 'Home', 'End', '0', 'a']) assert.equal(W.keyStep(10, k, false, N), null, `${k} 는 처리하지 않는다(기본 동작 유지)`);
});

/* 2026-10-21 사용자 피드백: 2117×906 화면에서 3D 가로축 글자가 카드 밖으로 나감 — 글자·깊이 자리를 판 여백으로 캔버스 안에 둔다 */
test('④ 정면 판 배치: 앞면 판(x0~x1 · y0~y1)·깊이(dx·dy)·축 글자 자리가 모두 캔버스 안, 칸 나눔 = 2D 리본(달 m = 칸 가운데)', () => {
  for (const [w, h] of [[1090, 454], [820, 342], [1600, 667], [960, 400]]) {
    const L = W.layoutOf(w, h, N);
    assert.ok(L.dx >= 10 && L.dx <= 18 && L.dy > 0 && L.dy < L.dx, `깊이 ${L.dx}·${L.dy}`);
    assert.ok(L.x0 >= 48, '왼쪽 = 세로축 글자 자리(가장 긴 눈금 글자 \'17.5만\' 약 40px + 8)');
    assert.ok(L.x1 + L.dx <= w, '오른쪽 끝면(깊이)까지 캔버스 안');
    assert.ok(L.y1 + L.dy + 24 <= h, '윗면 깊이 + 기준 달 글자(21px)까지 캔버스 안');
    assert.ok(L.y0 >= 9 + 21, '아래 = 눈금 표시(7px) + 가로축 글자(21px) 자리');
    near(L.pitch * N, L.x1 - L.x0, '칸 나눔');
    near(W.cx(L, 0), L.x0 + L.pitch / 2, '첫 달 = 첫 칸 가운데'); near(W.edge(L, N), L.x1, '마지막 칸 끝 = x1');
    near(W.yAt(L, 0, 100), L.y0, '0 = 바닥'); near(W.yAt(L, 100, 100), L.y1, '맨 위 눈금 = 판 위');
    near(W.sy(L, L.y0), h - L.y0, '화면 y 는 아래로');
  }
  /* 판이 넓으면 깊이가 커지지만 18px 를 넘지 않는다 */
  assert.equal(W.layoutOf(3000, 1250, N).dx, 18); assert.equal(W.layoutOf(500, 208, N).dx, 10); assert.equal(W.layoutOf(1090, 454, N).dx, 15);
});

test('④ 정면 시점: 정사영(원근·기울기·회전 값 없음) — 앞면은 축과 px 단위로 맞는다', () => {
  assert.equal(W.VIEW, undefined, '옛 원근 시점 값(fov·tilt·turn) 삭제');
  assert.deepEqual(W.Z, { back: -1, front: 0, seam: 0.4, band: 0.5 }, '앞면 0 · 뒷면 -1 · 경계선·지연 띠는 앞면 앞');
});

test('⑤ 층 기둥(colsOf): 칸 가운데 + 양 끝을 판 끝까지, 높이 = 누적값 ÷ 세로축 맨 위, 지연 띠는 제 층 바닥에서', () => {
  const L = W.layoutOf(1090, 454, N), ya = W.yAxis(st, W.fullWin(N), L.y1 - L.y0);
  for (let k = 0; k < 6; k++) {
    const cs = W.colsOf(st, k, L, ya.max);
    assert.equal(cs.length, N + 2);
    near(cs[0].x, L.x0, '왼쪽 끝'); near(cs.at(-1).x, L.x1, '오른쪽 끝');
    for (let m = 0; m < N; m++) {
      const c = cs[m + 1];
      near(c.x, W.cx(L, m), 'x'); near(c.hi, W.yAt(L, st.hi[k][m], ya.max), `윗변 k${k} m${m}`); near(c.lo, W.yAt(L, st.lo[k][m], ya.max), `아랫변 k${k} m${m}`);
      near(c.bd - c.lo, st.band[k][m] / ya.max * (L.y1 - L.y0), '띠 두께');
      assert.ok(c.hi <= L.y1 + 1e-9 && c.lo >= L.y0 - 1e-9, '판 안');
    }
    assert.deepEqual([cs[0].lo, cs[0].hi], [cs[1].lo, cs[1].hi], '왼쪽 끝 = 첫 달 값');
  }
  /* 층이 틈 없이 쌓인다(앞면이 같은 평면 — 정면에서 축 눈금으로 그대로 읽힌다) */
  const all = [0, 1, 2, 3, 4, 5].map((k) => W.colsOf(st, k, L, ya.max));
  for (let k = 0; k < 5; k++) all[k].forEach((c, i) => near(c.lo, all[k + 1][i].hi, '층 사이 틈 없음'));
});

test('⑤ 구간 자르기(cut): 실적·예정을 칸 경계에서 나누면 경계 값이 이웃 기둥 사이 직선 위 · 두 구간이 이어진다', () => {
  const L = W.layoutOf(1090, 454, N), ya = W.yAxis(st, W.fullWin(N), 300), cs = W.colsOf(st, 2, L, ya.max), e = W.edge(L, T.actual + 1);
  const act = W.cut(cs, L.x0, e), plan = W.cut(cs, e, L.x1);
  near(act.at(-1).x, e, '실적 끝 = 경계'); near(plan[0].x, e, '예정 처음 = 경계');
  assert.deepEqual(act.at(-1), plan[0], '같은 점에서 이어진다');
  const a = cs[T.actual + 1], b = cs[T.actual + 2];
  near(plan[0].hi, (a.hi + b.hi) / 2, '두 칸 가운데 사이의 절반');
  assert.equal(act.length + plan.length, cs.length + 2, '기둥은 하나도 빠지지 않는다(경계 두 점만 더함)');
  assert.deepEqual(W.cut(cs, e, e), []);
});

test('⑥ 3D 기하: 앞면(위·가운데·아래 3점)·지연 띠·경계선·윗면(뒤로 dx·dy)·끝면 — 정점·삼각형 수와 z', () => {
  const L = W.layoutOf(1090, 454, N), ya = W.yAxis(st, W.fullWin(N), 300), cs = W.colsOf(st, 0, L, ya.max), n = cs.length;
  const z = (g) => [...new Set(Array.from(g.positions).filter((_, i) => i % 3 === 2))].sort();
  const f = W.frontOf(cs);
  assert.equal(f.positions.length / 3, n * 3); assert.equal(f.index.length, (n - 1) * 2 * 6); assert.deepEqual(z(f), [0]);
  near(f.positions[1], cs[0].hi, '첫 점 = 윗변'); near(f.positions[4], (cs[0].lo + cs[0].hi) / 2, '가운데'); near(f.positions[7], cs[0].lo, '아랫변');
  const b = W.bandOf(cs); assert.equal(b.positions.length / 3, n * 2); assert.deepEqual(z(b), [0.5]);
  const s = W.seamOf(cs); near(s.positions[1] - s.positions[4], 1, '경계선 두께 1px'); assert.deepEqual(z(s), [Math.fround(0.4)]);
  const lid = W.lidOf(cs, L);
  assert.deepEqual(z(lid), [-1, 0]);
  near(lid.positions[0] - lid.positions[3], L.dx, '윗면 뒤쪽 = 오른쪽으로 dx'); near(lid.positions[1] - lid.positions[4], L.dy, '위로 dy');
  const cap = W.capOf(cs.at(-1), L);
  assert.equal(cap.positions.length / 3, 4); assert.equal(cap.index.length, 6);
  near(cap.positions[6], L.x1 + L.dx, '끝면 뒤쪽 x');
  assert.ok(Math.max(...Array.from(cap.positions).filter((_, i) => i % 3 === 0)) <= L.w, '끝면이 캔버스 안');
});

test('⑦ 면 색: 2D 리본과 같은 섞기(위 = 하이라이트 30% · 아래 = 그늘 14% · 예정 = 바탕 38% · 강조 밖 = 바탕 72%) · 윗면 밝게 · 끝면 어둡게', () => {
  const base = [200, 100, 50], hi = [255, 255, 255], lo = [0, 0, 0], card = [250, 250, 250];
  assert.deepEqual(W.mix([0, 0, 0], [255, 255, 255], 0.5), [128, 128, 128]);
  const c = W.faceColors(base, { hi, lo, card, plan: false, dim: false });
  assert.deepEqual(c.mid, base); assert.deepEqual(c.top, W.mix(base, hi, 0.3)); assert.deepEqual(c.bottom, W.mix(base, lo, 0.14));
  assert.ok(c.lid[1] > c.mid[1] && c.cap[1] < c.mid[1], '윗면 밝게 · 끝면 어둡게');
  assert.deepEqual(W.faceColors(base, { hi, lo, card, plan: true, dim: false }).mid, W.mix(base, card, 0.38));
  assert.deepEqual(W.faceColors(base, { hi, lo, card, plan: false, dim: true }).mid, W.mix(base, card, 0.72));
});

test('R4 대체 판정: WebGL 없음·움직임 줄이기·900px 이하는 2D', () => {
  assert.equal(W.viewMode({ webgl: true, reduced: false, width: 1440 }), '3d');
  assert.equal(W.viewMode({ webgl: false, reduced: false, width: 1440 }), '2d');
  assert.equal(W.viewMode({ webgl: true, reduced: true, width: 1440 }), '2d');
  assert.equal(W.viewMode({ webgl: true, reduced: false, width: 900 }), '2d');
  assert.equal(W.viewMode({ webgl: true, reduced: false, width: 901 }), '3d');
});

test('⑧ 툴팁 자리(tipPlace): 오른쪽 아래 → 넘치면 왼쪽으로 뒤집기 · 판 가장자리 6px 안에 붙이기', () => {
  const box = (q, tw, th, w, h) => q.x >= 6 && q.y >= 6 && q.x + tw <= w - 6 && q.y + th <= h - 6;
  assert.deepEqual(W.tipPlace(100, 50, 180, 120, 1200, 500), { x: 114, y: 50 }, '오른쪽에 자리');
  assert.deepEqual(W.tipPlace(1100, 50, 180, 120, 1200, 500), { x: 906, y: 50 }, '오른쪽이 넘치면 왼쪽으로');
  assert.equal(W.tipPlace(10, 50, 180, 120, 1200, 500).x, 24);
  assert.equal(W.tipPlace(100, 450, 180, 120, 1200, 500).y, 374, '아래가 넘치면 위로 붙인다');
  assert.equal(W.tipPlace(100, -20, 180, 120, 1200, 500).y, 6, '위로 나가면 가장자리');
  for (const [w, h] of [[1200, 500], [960, 400]]) for (const ax of [0, 50, w / 2, w - 100, w]) for (const ay of [-10, 20, h / 2, h]) {
    assert.ok(box(W.tipPlace(ax, ay, 260, 180, w, h), 260, 180, w, h), `판 안 ${w}×${h} (${ax},${ay})`);
  }
});

test('⑧ 고른 달 총량 라벨(totalPlace): 더미 윗변 안쪽(2D 첫 자리) · 판 안 · 양옆 끝에서 비켜 남', () => {
  const L = W.layoutOf(1090, 454, N);
  const q = W.totalPlace(L, W.cx(L, 20), L.y1 - 10, 90);
  near(q.y, W.sy(L, L.y1 - 10) + 22 - 12, '윗변 22px 아래가 라벨 가운데');
  for (const m of [0, 20, N - 1]) for (const top of [L.y0, L.y0 + 5, (L.y0 + L.y1) / 2, L.y1]) {
    const p = W.totalPlace(L, W.cx(L, m), top, 90);
    assert.ok(p.x >= L.x0 + 4 && p.x + 90 <= L.x1 - 4 + 1e-9, `x 판 안 m${m}`);
    assert.ok(p.y >= W.sy(L, L.y1) - 1e-9 && p.y + 24 <= W.sy(L, L.y0) - 6 + 1e-9, `y 판 안 m${m} top${top}`);
  }
});
