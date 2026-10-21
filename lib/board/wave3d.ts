/* 종합상황판 '월별 공급 파동' 3D 차트(components/board/SupplyWave3D.tsx)의 순수 계산. 그리는 일은 컴포넌트가, 값은 여기서 낸다.
   쌓임은 2D 리본(./sample ribbonOf)과 같다: 입주(k=5)가 바닥, 정책(k=0)이 맨 위, 지연 띠는 제 층 바닥에서 위로(층보다 두껍지 않게).
   시점(2026-10-21 사용자 지시 '기울기 없이 정면으로'): 정사영 정면 — 세계 좌표 = 캔버스 CSS px(y 위로)라 앞면이 축과 px 단위로 맞는다.
   깊이는 쌓은 판 전체를 뒤로 밀어낸 두께로 보인다(뒷면을 오른쪽 위로 dx·dy 만큼 비켜 그림 — 윗면·오른쪽 끝면이 드러남, 앞면은 기울지 않음).
   tests/js/wave3d.test.cjs 가 2D 리본과 같은 합·같은 쌓임, 판 배치(글자가 캔버스 안), 기하를 대조한다. */
import { scaleLinear } from 'd3-scale';
import { delayAt, ml, type Timeline } from './sample';

/* ① 자료 어댑터: 단계 k·달 m 의 누적 하한 lo·상한 hi(호), 지연 띠 두께 band(호), 달 총량 total */
export type Stack = { n: number; lo: number[][]; hi: number[][]; band: number[][]; total: number[] };
export function stackOf(T: Timeline, su: number[][], delays: (number[] | null)[]): Stack {
  const lo: number[][] = [[], [], [], [], [], []], hi: number[][] = [[], [], [], [], [], []], band: number[][] = [[], [], [], [], [], []], total: number[] = [];
  su.forEach((s, m) => {
    const d = delayAt(T, delays, m);   // 그 달 이하 가장 늦은 판정 달의 단계별 지연(2D 와 같다)
    let below = 0;
    for (let k = 5; k >= 0; k--) { lo[k][m] = below; hi[k][m] = below + s[k]; band[k][m] = Math.min(d[k], s[k]); below += s[k]; }
    total[m] = below;
  });
  return { n: su.length, lo, hi, band, total };
}

/* 보이는 달 범위(양 끝 포함). 카메라·범위 고정이라 늘 전체 [0, n-1] */
export type Win = { a: number; b: number };
export const fullWin = (n: number): Win => ({ a: 0, b: n - 1 });

/* ② 판 배치(px): 왼쪽 = 세로축 글자, 아래 = 가로축 글자, 위 = 기준 달 글자 + 깊이, 오른쪽 = 깊이. 모든 글자·선이 캔버스(w×h) 안에 든다.
   깊이 d = 폭의 1.4%(10~18px), 뒷면은 (d, 0.7d) 만큼 오른쪽 위. 달 m 은 칸 가운데(2D 리본과 같은 칸 나눔) */
export const PAD = { l: 56, r: 12, t: 30, b: 30 };
export type Layout = { w: number; h: number; n: number; x0: number; x1: number; y0: number; y1: number; pitch: number; dx: number; dy: number };
export function layoutOf(w: number, h: number, n: number): Layout {
  const d = Math.round(Math.max(10, Math.min(18, w * 0.014))), dx = d, dy = Math.round(d * 0.7);
  const x0 = PAD.l, x1 = w - PAD.r - dx, y0 = PAD.b, y1 = h - PAD.t - dy;
  return { w, h, n, x0, x1, y0, y1, pitch: (x1 - x0) / Math.max(1, n), dx, dy };
}
export const cx = (L: Layout, m: number) => L.x0 + (m + 0.5) * L.pitch;
export const edge = (L: Layout, m: number) => L.x0 + m * L.pitch;   // 달 m 칸의 왼쪽 끝(m = n 이면 오른쪽 끝)
export const monthAt = (L: Layout, x: number) => (x < L.x0 || x > L.x1 ? -1 : Math.max(0, Math.min(L.n - 1, Math.floor((x - L.x0) / L.pitch))));
export const yAt = (L: Layout, v: number, ymax: number) => L.y0 + (v / ymax) * (L.y1 - L.y0);
export const sy = (L: Layout, y: number) => L.h - y;   // 세계 y(위로) → 화면 y(아래로)

/* ③ 세로축: 보이는 범위의 총량 최대값에서 d3 nice 눈금. 눈금 수는 판 높이(px)에 따라(48px 에 하나, 2~8) */
export function yAxis(st: Pick<Stack, 'total'>, w: Win, px: number) {
  const count = Math.max(2, Math.min(8, Math.floor(px / 48)));
  const max = Math.max(0, ...st.total.slice(w.a, w.b + 1));
  const y = scaleLinear().domain([0, max || 1]).nice(count);
  return { max: y.domain()[1], ticks: y.ticks(count) };
}

/* ③ 가로축: 보이는 달이 24개월 넘으면 해(1월), 10~24개월이면 분기(1·4·7·10월), 그 밖은 달마다 */
export function xTicks(months: string[], w: Win) {
  const span = w.b - w.a + 1, unit = span > 24 ? 'year' : span > 9 ? 'quarter' : 'month';
  const ticks: { m: number; label: string }[] = [];
  for (let m = w.a; m <= w.b; m++) {
    const mm = Number(months[m].slice(5));
    if (unit === 'year' ? mm === 1 : unit === 'quarter' ? mm % 3 === 1 : true) ticks.push({ m, label: unit === 'year' ? months[m].slice(0, 4) : months[m].replace('-', '.') });
  }
  return { unit, ticks };
}
/* 기준 달 표시: 기준 달 칸의 오른쪽 끝(2D 리본 nowX = X(now + 1) 과 같은 자리) */
export const nowMark = (T: Timeline, L: Layout) => (T.now < 0 || T.now >= L.n ? null : { x: edge(L, T.now + 1), label: `기준 ${ml(T, T.now)}` });

/* ④ 키보드: ←→ 고른 달 옮기기, Shift+←→ 12달(한 해)씩. 처리하지 않는 키는 null. 카메라·범위는 움직이지 않는다 */
export function keyStep(cur: number, key: string, shift: boolean, n: number): number | null {
  const dir = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0;
  return dir ? Math.max(0, Math.min(n - 1, cur + dir * (shift ? 12 : 1))) : null;
}

/* ⑤ 층 기둥: 단계 k 의 달마다 (x, 아랫변, 윗변, 지연 띠 윗변) px — 칸 가운데에 두고 양 끝은 판 끝(x0·x1)까지 같은 값으로 늘인다 */
export type Col = { x: number; lo: number; hi: number; bd: number };
export function colsOf(st: Stack, k: number, L: Layout, ymax: number): Col[] {
  const at = (m: number, x: number): Col => ({ x, lo: yAt(L, st.lo[k][m], ymax), hi: yAt(L, st.hi[k][m], ymax), bd: yAt(L, st.lo[k][m] + st.band[k][m], ymax) });
  return [at(0, L.x0), ...Array.from({ length: st.n }, (_, m) => at(m, cx(L, m))), at(st.n - 1, L.x1)];
}
/* 기둥 구간 [xa, xb] — 끝은 이웃 기둥 사이를 직선으로 나눈 값(실적·예정을 칸 경계에서 나눠 칠할 때) */
export function cut(cols: Col[], xa: number, xb: number): Col[] {
  const lerp = (x: number): Col => {
    const j = Math.max(1, cols.findIndex((c) => c.x >= x)), a = cols[j - 1], b = cols[j] ?? a, t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
    return { x, lo: a.lo + (b.lo - a.lo) * t, hi: a.hi + (b.hi - a.hi) * t, bd: a.bd + (b.bd - a.bd) * t };
  };
  if (xb <= xa) return [];
  return [lerp(xa), ...cols.filter((c) => c.x > xa && c.x < xb), lerp(xb)];
}

/* ⑥ 3D 기하(세계 = px, z: 앞면 0 · 뒷면 -1). rows = 기둥마다 같은 수의 점(위 → 아래), 이웃 기둥 사이를 삼각형 두 개씩으로 잇는다 */
export const Z = { back: -1, front: 0, seam: 0.4, band: 0.5 } as const;
export function gridOf(rows: [number, number, number][][]) {
  const per = rows[0]?.length ?? 0, positions = new Float32Array(rows.length * per * 3), index: number[] = [];
  rows.forEach((r, i) => r.forEach((p, j) => positions.set(p, (i * per + j) * 3)));
  for (let i = 1; i < rows.length; i++) for (let j = 1; j < per; j++) {
    const a = (i - 1) * per + j - 1, b = a + 1, c = i * per + j - 1, d = c + 1;
    index.push(a, b, c, b, d, c);
  }
  return { positions, index, per };
}
/* 앞면: 기둥마다 위·가운데·아래 세 점(2D 리본 세로 그라데이션의 세 멈춤과 같은 자리) */
export const frontOf = (cs: Col[]) => gridOf(cs.map((c) => [[c.x, c.hi, Z.front], [c.x, (c.lo + c.hi) / 2, Z.front], [c.x, c.lo, Z.front]]));
/* 지연 띠: 제 층 바닥(lo)에서 띠 윗변(bd)까지, 앞면보다 조금 앞 */
export const bandOf = (cs: Col[]) => gridOf(cs.map((c) => [[c.x, c.bd, Z.band], [c.x, c.lo, Z.band]]));
/* 층 경계선: 윗변(hi)을 따라 두께 1px 띠, 지연 띠보다 뒤 */
export const seamOf = (cs: Col[]) => gridOf(cs.map((c) => [[c.x, c.hi + 0.5, Z.seam], [c.x, c.hi - 0.5, Z.seam]]));
/* 윗면: 윗변(앞) → 오른쪽 위로 비킨 윗변(뒤). 위 층 앞면이 가리지 않는 곳(맨 위 층·얇은 층)에서만 보인다 */
export const lidOf = (cs: Col[], L: Layout) => gridOf(cs.map((c) => [[c.x + L.dx, c.hi + L.dy, Z.back], [c.x, c.hi, Z.front]]));
/* 오른쪽 끝면: 마지막 기둥의 앞(x1) → 뒤(x1 + dx) */
export const capOf = (c: Col, L: Layout) => gridOf([[[c.x, c.hi, Z.front], [c.x, c.lo, Z.front]], [[c.x + L.dx, c.hi + L.dy, Z.back], [c.x + L.dx, c.lo + L.dy, Z.back]]]);

/* ⑦ 색 섞기(sRGB 바이트, CSS color-mix(in srgb) 와 같은 셈): a 를 (1 - t), b 를 t 만큼 */
export type Rgb = [number, number, number];
export const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => Math.round(a[i] * (1 - t) + b[i] * t)) as Rgb;
/* 층 면 색(2D 와 같은 값): 앞면 위 = 단계색 70% + 하이라이트, 가운데 = 단계색, 아래 = 단계색 86% + 그늘 · 윗면 = 하이라이트 35% · 끝면 = 그늘 28% ·
   예정(실제 날짜 뒤) = 카드 바탕 38%(2D 불투명도 .62 와 같은 색) · 범례 강조 밖 층 = 카드 바탕 72%(2D 불투명도 .28) */
export const SHADE = { top: 0.3, bottom: 0.14, lid: 0.35, cap: 0.28, plan: 0.38, dim: 0.72 } as const;
export function faceColors(base: Rgb, o: { hi: Rgb; lo: Rgb; card: Rgb; plan: boolean; dim: boolean }) {
  let c = base;
  if (o.plan) c = mix(c, o.card, SHADE.plan);
  if (o.dim) c = mix(c, o.card, SHADE.dim);
  return { top: mix(c, o.hi, SHADE.top), mid: c, bottom: mix(c, o.lo, SHADE.bottom), lid: mix(c, o.hi, SHADE.lid), cap: mix(c, o.lo, SHADE.cap) };
}

/* 툴팁 자리: 가리킨 점(ax, ay) 오른쪽 아래, 넘치면 왼쪽으로 뒤집고, 판(w×h) 가장자리 pad 안으로 붙인다(2D 툴팁과 같은 규칙) */
export function tipPlace(ax: number, ay: number, tw: number, th: number, w: number, h: number, gap = 14, pad = 6) {
  let x = ax + gap;
  if (x + tw > w - pad) x = ax - tw - gap;
  return { x: Math.max(pad, Math.min(x, w - tw - pad)), y: Math.max(pad, Math.min(ay, h - th - pad)) };
}
/* 고른 달 총량 라벨(2D ribbonLabels 와 같은 첫 자리): 쌓은 더미 윗변 22px 아래(안쪽), 판 바닥·양옆 안으로 */
export function totalPlace(L: Layout, x: number, top: number, tw: number, th = 24) {
  const y = Math.min(sy(L, top) + 22 - th / 2, sy(L, L.y0) - th - 6);
  return { x: Math.max(L.x0 + 4, Math.min(x - tw / 2, L.x1 - tw - 4)), y: Math.max(sy(L, L.y1), y) };
}

/* R4 대체 판정은 첫 화면용 작은 모듈에 있다(여기서 다시 내보낸다) */
export { viewMode } from './wave3d-mode';
