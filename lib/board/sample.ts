/* 종합상황판 시안(주택파동_종합상황판_최종)에서 옮긴 공통 상수·문구와, 아직 SAMPLE 인 위젯(지연·주의 추이)의 데이터·계산.
   SAMPLE 부분은 원본을 실행해 뽑은 기준값(tests/fixtures/board-sample-golden.json)과 같은 숫자를 내는지 tests/js/boardsample.test.cjs 가 확인한다.
   리본 차트 기하(ribbonOf)는 시안 수식을 원장 집계(data/board/ledger-board.json 의 달 말 단계별 호수)에 맞춰 바꾼 것이다.
   시점(달 이름·기준 달·마지막 달·실제 날짜가 있는 마지막 달)은 고정값이 아니라 원장 집계에서 읽는다(timelineOf) — 다음 달 원장을 올리면 화면의 기준일·달 이름이 따라 바뀐다. */

/* 원장 집계의 시점: months = 'YYYY-MM' 목록(0 부터), now = 기준 달(판정 관측 달), last = 마지막 시점, actual = 실제 날짜가 있는 마지막 달(그 뒤는 예정으로 다시 만든 값) */
export type Timeline = { months: string[]; now: number; last: number; actual: number };
export function timelineOf(L: { months: string[]; now: number; actualThrough?: string }): Timeline {
  const a = L.actualThrough ? L.months.indexOf(L.actualThrough) : -1;
  return { months: L.months, now: L.now, last: L.months.length - 1, actual: a >= 0 && a < L.now ? a : L.now };   // actualThrough 가 없는 옛 집계는 기준 달까지 실제
}
export const CIR = ['①', '②', '③', '④', '⑤', '⑥'];
export const K = ['계획', '인허가', '착공', '모집', '준공', '입주'];
/* 6단계 색: 테마별 값은 app/tailwind.css 의 --st-* (차트 면 색, 라이트·다크). SVG 와 인라인 스타일이 var() 로 읽는다 */
export const C = ['var(--st-plan)', 'var(--st-permit)', 'var(--st-build)', 'var(--st-sale)', 'var(--st-soon)', 'var(--st-move)'];

export const AD: [number, number][] = [[0, 1200], [9, 3400], [15, 6100], [21, 10000]];
export const AW: [number, number][] = [[0, 2100], [9, 4500], [15, 9800], [21, 18000]];
/* ── 계산 ── */
export const f = (n: number) => n.toLocaleString('en-US');
export const r10 = (n: number) => Math.round(n / 10) * 10;
export const sg = (n: number) => (n >= 0 ? '+' : '−') + f(Math.abs(n));
export const ml = (T: Timeline, m: number) => T.months[m].replace('-', '.');
export const kind = (T: Timeline, m: number) => (m === T.now ? '현재' : (m <= T.actual ? '실적 기준' : '예정 기준'));
/* 시점 m 의 연도 순번(첫 달의 해 = 0)과, 해마다 첫·마지막 시점 */
export const yr = (T: Timeline, m: number) => Number(T.months[m].slice(0, 4)) - Number(T.months[0].slice(0, 4));
export function yearsOf(T: Timeline) {
  const ys: { y: number; a: number; b: number }[] = [];
  T.months.forEach((ym, m) => { const y = Number(ym.slice(0, 4)), l = ys[ys.length - 1]; if (l && l.y === y) l.b = m; else ys.push({ y, a: m, b: m }); });
  return ys;
}
/* 판정은 관측한 달(기준 달 NOW 하나)에만 있다: 선택 시점 이하의 가장 늦은 판정 달. 없으면 -1 */
export const judgedAt = (T: Timeline, m: number) => (m >= T.now ? T.now : -1);

/* SAMPLE 추이(AD·AW)는 시안의 기준 달(마지막 점)을 원장의 기준 달에 맞춰 옮긴다 */
export const anchor = (arr: [number, number][], now: number): [number, number][] => arr.map(([m, v]) => [m + now - arr[arr.length - 1][0], v]);
export function ip(arr: [number, number][], m: number, now: number): number {
  const mm = Math.min(m, now);
  if (mm <= arr[0][0]) return arr[0][1];
  for (let i = 0; i < arr.length - 1; i++) {
    if (mm >= arr[i][0] && mm <= arr[i + 1][0]) { const u = (mm - arr[i][0]) / (arr[i + 1][0] - arr[i][0]); return arr[i][1] + (arr[i + 1][1] - arr[i][1]) * u; }
  }
  return arr[arr.length - 1][1];
}
export const argmax = (a: number[]) => a.reduce((b, v, i) => (v > a[b] ? i : b), 0);
export const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
/* 단계별 지연 호수: 판정은 기준 달(NOW) 관측부터라 그 앞 달은 0, NOW 와 예정 구간은 NOW 의 판정(delayByStage)을 유지한다 */
export const delayAt = (T: Timeline, delay: number[], m: number) => (judgedAt(T, m) >= 0 ? delay : delay.map(() => 0));

/* ── 문구 ── */
/* 지연·주의 추이 카드의 아래 줄: 선택 시점(NOW 까지)의 전월 대비 증감 */
export function txTrend(T: Timeline, cur: number) {
  const n = T.now, ad = anchor(AD, n), aw = anchor(AW, n), c = Math.min(cur, n), p = Math.max(c - 1, 0);
  return '전월 대비 지연 ' + sg(r10(ip(ad, c, n) - ip(ad, p, n))) + ' · 주의 ' + sg(r10(ip(aw, c, n) - ip(aw, p, n)));   // 시점·단위(호)는 카드 제목 title 에(2026-10-11 서술 최소화)
}

/* ── 시도 타일 색(바탕색 = 지연율 단계) ── */
export const RTH = [5, 7, 8.5, 10];
export const RCOL = ['var(--region-0)', 'var(--region-1)', 'var(--region-2)', 'var(--region-3)', 'var(--region-4)', 'var(--region-5)'];
export const RLAB = ['0', '~5', '5~7', '7~8.5', '8.5~10', '10+'];
export const rcls = (rate: number) => (rate === 0 ? 0 : 1 + RTH.filter((t) => rate >= t).length);

/* ── 리본 차트 기하(시안과 같은 좌표계). 층 두께 = 원장의 달 말 단계별 호수, 붉은 띠 = delayAt, 세로 축척(ymax)은 총량에 맞춘다 ── */
export const VW = 960, PX0 = 46, PW = 908, TOP = 52, PH = 304, BOT = TOP + PH; // PH 는 시안(320)보다 16 줄였다: 바닥부터 쌓으면 층이 BOT 까지 내려와 '기준일' 글자 줄(374)과 겹쳐서(2026-10-11)
/* 시점 n 칸을 플롯 폭에 고르게 놓은 x 좌표(칸 m 의 왼쪽 끝 = X(m)) */
export const xOf = (n: number) => (x: number) => PX0 + x * PW / n;
export type Geo = { x: number; lw: number[]; up: number[]; dl: number[] };
/* total = 달마다 단계 합, step = 세로축 눈금 간격(1·2·2.5·5 × 10^n 중 눈금 5칸 이하가 되는 가장 작은 값), ymax = 가장 큰 총량을 step 단위로 올린 값(세로축 맨 위), ticks = 0…ymax 눈금,
   s2 = 1호의 px, geo = 0.25개월 간격의 층 경계(lw 아래·up 위, 0 은 BOT 에서 쌓는다)와 지연 띠 두께(dl, px), T = 시점, X·pitch = 시점의 x 좌표와 한 달 폭 */
export type Ribbon = { T: Timeline; X: (x: number) => number; pitch: number; su: number[][]; delay: number[]; total: number[]; step: number; ymax: number; ticks: number[]; s2: number; geo: Geo[] };
const niceStep = (max: number) => { for (let e = 1; ; e *= 10) for (const m of [1, 2, 2.5, 5]) if (Math.ceil(max / (m * e)) <= 5) return m * e; };
export function ribbonOf(tl: Timeline, su: number[][], delay: number[]): Ribbon {
  const LAST = tl.last, total = su.map(sum), step = niceStep(Math.max(...total)), n = Math.ceil(Math.max(...total) / step), ymax = n * step, s2 = PH / ymax, geo: Geo[] = [];
  for (let x = 0; x <= LAST + 1 + 1e-9; x += 0.25) {   // 달 m 의 값은 칸 가운데(m + 0.5)에 두고 이웃 달과 곧게 잇는다
    const t = Math.min(LAST, Math.max(0, x - 0.5)), i = Math.floor(t), j = Math.min(LAST, i + 1), u = t - i;
    const s = su[i].map((v, k) => v + (su[j][k] - v) * u), T = sum(s), d = delayAt(tl, delay, x), lw: number[] = [], up: number[] = [];
    let below = 0;
    for (let k = 5; k >= 0; k--) { lw[k] = BOT - below * s2; up[k] = lw[k] - s[k] * s2; below += s[k]; }
    geo.push({ x, lw, up, dl: s.map((v, k) => Math.min(d[k], v) * s2) });   // 띠는 층보다 두꺼울 수 없다
  }
  return { T: tl, X: xOf(LAST + 1), pitch: PW / (LAST + 1), su, delay, total, step, ymax, ticks: Array.from({ length: n + 1 }, (_, i) => i * step), s2, geo };
}
export const rp = (g: Ribbon, k: number, a: number, b: number, band: boolean, precision = 1) => {
  const up: string[] = [], lo: string[] = [];
  g.geo.forEach((p) => {
    if (p.x < a - 1e-9 || p.x > b + 1e-9) return;
    const xs = g.X(p.x).toFixed(precision);
    up.push(xs + ',' + (band ? p.lw[k] - p.dl[k] : p.up[k]).toFixed(precision)); lo.push(xs + ',' + p.lw[k].toFixed(precision));
  });
  return 'M' + up.join(' L') + ' L' + lo.reverse().join(' L') + ' Z';
};

/* ── 리본 글자 자리. 실데이터(원장)는 같은 사업이 단계만 옮겨 가 총량이 매달 같아서, 시안의 연도별 총량 두 줄·병목 핀·커서 라벨이 머리 줄과 서로 겹쳤다(2026-10-11).
   글자 상자는 대략값(한글 0.9em, 숫자·영문 0.6em, 띄어쓰기·문장부호 0.35em, 위 = 기준선 − 0.9em, 높이 1.2em — 브라우저 getBBox 보다 조금 크게 잡는다).
   라벨(HUD 판)은 판 상자로 겹침을 본다. ribbon.ts 가 이 자리를 그리고, tests/js/boardsample.test.cjs 가 46개 시점에서 겹치지 않음을 확인한다. ── */
export type Box = { x: number; y: number; w: number; h: number };
export type Tx = { x: number; y: number; t: string; fs: number; a: 'start' | 'middle' | 'end'; c: string; bold?: boolean };
export const HY1 = 14, HY2 = 33;   // 머리 두 줄의 기준선: 위 줄 = 연도별 총량(총량이 매달 같으면 비움), 아래 줄 = 증감(또는 연도)
export const textW = (t: string, fs: number) => [...t].reduce((w, c) => w + fs * (/[가-힣]/.test(c) ? 0.9 : /[\s.,·:()]/.test(c) ? 0.35 : 0.6), 0);
export const textBox = (x: Tx): Box => { const w = textW(x.t, x.fs); return { x: x.a === 'middle' ? x.x - w / 2 : x.a === 'end' ? x.x - w : x.x, y: x.y - 0.9 * x.fs, w, h: 1.2 * x.fs }; };
export const hit = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export const inView = (b: Box) => b.x >= 0 && b.y >= 0 && b.x + b.w <= VW && b.y + b.h <= 400;
/* HUD 라벨 판: 너비는 한글 15·그 밖 9 + 여백 22, 가운데는 차트 안으로 당긴다, 판 높이 24(기준선 위 17) */
export function labelBox(x: number, baseline: number, text: string) {
  const w = [...text].reduce((s, c) => s + (/[가-힣]/.test(c) ? 15 : 9), 0) + 22;
  const center = Math.max(w / 2 + 6, Math.min(PX0 + PW - w / 2, x));
  return { center, x: center - w / 2, y: baseline - 17, w, h: 24, baseline };
}
/* 총량이 46개월 내내 같으면(원장) 연도별 총량·증감 대신 연도만 둔다(총량은 커서 라벨과 카드 제목 title 에) */
export const flatTotal = (g: Ribbon) => g.total.every((v) => v === g.total[0]);
const man = (n: number, unit = '만') => (n === 0 ? '0' : `${+(n / 10000).toFixed(2)}${unit}`);   // 세로축 눈금 글자: 0, 5만, 2.5만 (ymax 1,000만 이상이면 '만' 을 빼고 단위를 머리 글자로 옮긴다)

/* 정적 글자(c = ribbon.ts 의 색 이름). 붉은 띠 범례·총량 설명은 차트 안에 두지 않는다(카드 제목 줄의 '지연' 칩과 제목 title, 2026-10-11) */
/* 아래 달 이름: 1월·7월, 기준일 글자 아래(기준선 ±3개월)는 비운다 */
export function staticTexts(g: Ribbon) {
  const big = g.ymax >= 10000000, { T, X } = g;
  return {
    ticks: g.ticks.map((v): Tx => ({ x: PX0 - 6, y: BOT - v * g.s2 + 3, t: man(v, big ? '' : '만'), fs: 13, a: 'end', c: 'axis' })),   // 세로축: 0 에서 ymax 까지 눈금마다
    unit: { x: PX0 - 6, y: TOP - 14, t: big ? '(만 호)' : '(호)', fs: 13, a: 'end', c: 'axis' } as Tx,
    now: { x: X(T.now + 1), y: 374, t: `기준일 ${ml(T, T.now)}`, fs: 14, a: 'middle', c: 'ink' } as Tx,
    months: T.months.flatMap((ym, m): Tx[] => (/-(01|07)$/.test(ym) && Math.abs(m + 0.5 - (T.now + 1)) >= 3 ? [{ x: X(m + 0.5), y: 392, t: ml(T, m), fs: 14, a: 'middle', c: 'axis' }] : [])),
  };
}
const staticList = (g: Ribbon) => { const s = staticTexts(g); return [...s.ticks, s.unit, s.now, ...s.months]; };

/* 선택 시점(cur)의 글자: 연도 머리 · 커서 총량 라벨 · 병목 핀 라벨. 핀을 먼저 놓고(위 → 아래 → 왼쪽·오른쪽으로 비킴), 커서 라벨은 층 위쪽 안 → 아래쪽 안 중 비어 있는 곳 */
export function ribbonLabels(g: Ribbon, cur: number) {
  const { T, X } = g, fl = flatTotal(g), yi = yr(T, cur), yrs: Tx[][] = [], Y = yearsOf(T);
  const YT = Y.map((y) => g.total[y.b]);   // 해마다 마지막 달(마지막 해는 마지막 시점)의 총량
  YT.forEach((tv, i) => {
    const x = (X(Y[i].a) + X(Y[i].b + 1)) / 2, on = i === yi;
    if (fl) { yrs.push([{ x, y: HY2, t: `${Y[i].y}년`, fs: 15, a: 'middle', c: on ? 'yrOn' : 'yrOff', bold: true }]); return; }
    const dv = i > 0 ? tv - YT[i - 1] : 0;
    yrs.push([{ x, y: HY1, t: `${Y[i].y}년 ${f(tv)}호`, fs: 15, a: 'middle', c: on ? 'yrOn' : 'yrOff', bold: true }, dv ? { x, y: HY2, t: `${dv > 0 ? '▲' : '▼'} ${sg(dv)}호 (${sg(Math.round(dv / YT[i - 1] * 100))}%)`, fs: 14, a: 'middle', c: 'pos', bold: true }
      : { x, y: HY2, t: i > 0 ? '전년과 같음' : '기준 연도', fs: 14, a: 'middle', c: 'axis' }]);
  });
  const used: Box[] = [...staticList(g), ...yrs.flat()].map(textBox);
  const free = (b: Box) => inView(b) && !used.some((u) => hit(u, b));

  /* 병목 핀: 그 달 병목 단계(지연 호수가 가장 큰 단계)의 지연 띠 한가운데. 선택 시점이 판정 기록(NOW) 앞이면 NOW 관측 핀 */
  const m = cur >= T.now ? cur : T.now, p = g.geo[4 * m + 2], ds = delayAt(T, g.delay, m), k = argmax(ds);
  const px = X(m + 0.5), py = p.lw[k] - p.dl[k] / 2;
  const pt = cur >= T.now ? `${K[k]} 지연 ${f(ds[k])}호 · ${(ds[k] / g.su[m][k] * 100).toFixed(1)}%` : `${ml(T, m)} 관측 · ${K[k]} ${f(ds[k])}호`;
  const dot: Box = { x: px - 9, y: py - 9, w: 18, h: 18 };
  used.push(dot);
  const w0 = labelBox(px, 0, pt).w, cands: { dx: number; below: boolean }[] = [];
  for (const dx of [0, -(w0 / 2 + 16), w0 / 2 + 16]) for (const below of [false, true]) cands.push({ dx, below });
  const pins = cands.map(({ dx, below }) => ({ below, ...labelBox(Math.max(PX0 + 95, Math.min(PX0 + PW - 95, px + dx)), below ? py + 50 : py - 40, pt) }));
  const pin = pins.find(free) ?? pins[0];
  used.push(pin);

  /* 커서 괄호의 총량 라벨: 쌓은 더미 위쪽 안 → 바닥 쪽 안(기준일 글자가 막으면 한 칸 위) */
  const top = BOT - g.total[cur] * g.s2, bx = X(cur + 0.5), tt = `${f(g.total[cur])}호`;
  const tw = labelBox(bx, 0, tt).w, tops = [bx, Math.max(bx, PX0 + 4 + tw / 2)].flatMap((x) => [labelBox(x, Math.max(TOP + 22, top + 22), tt), labelBox(x, BOT - 14, tt), labelBox(x, BOT - 30, tt)]);   // 막히면 왼쪽 세로축을 비켜 오른쪽으로
  const total = tops.find(free) ?? tops[0];
  return { years: yrs, total: { ...total, text: tt }, pin: { ...pin, text: pt, px, py, k }, statics: staticList(g) };
}
