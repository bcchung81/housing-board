/* 종합상황판 시안(주택파동_종합상황판_최종)에서 옮긴 공통 상수·문구와 계산. 리본 좌표 상수는 시안을 실행해 뽑은 기준값(tests/fixtures/board-sample-golden.json)과 같은지 tests/js/boardsample.test.cjs 가 확인한다.
   리본 차트 기하(ribbonOf)는 시안 수식을 원장 집계(data/board/ledger-board.json 의 달 말 단계별 호수)에 맞춰 바꾼 것이다.
   판정은 원장 집계의 trend(월 판정 이력: 2025.01~2026.09 건축HUB 과거 판 소급 + 관측 달, tools/ledger/trend.js)가 있는 달마다 있다 — 지연·주의 추이 카드, 선택 달 판정, 리본의 지연 띠.
   시점(달 이름·기준 달·마지막 달·실제 날짜가 있는 마지막 달)은 고정값이 아니라 원장 집계에서 읽는다(timelineOf) — 다음 달 원장을 올리면 화면의 기준일·달 이름이 따라 바뀐다. */

/* 원장 집계의 시점: months = 'YYYY-MM' 목록(0 부터), now = 기준 달(판정 관측 달), last = 마지막 시점, actual = 실제 날짜가 있는 마지막 달(그 뒤는 예정으로 다시 만든 값),
   judged = 판정이 있는 달(trend 의 달 + 기준 달, 오름차순) */
export type Timeline = { months: string[]; now: number; last: number; actual: number; judged: number[] };
export function timelineOf(L: { months: string[]; now: number; actualThrough?: string; trend?: { month: string }[] }): Timeline {
  const a = L.actualThrough ? L.months.indexOf(L.actualThrough) : -1;
  const judged = [...new Set([...(L.trend ?? []).map((r) => L.months.indexOf(r.month)).filter((i) => i >= 0 && i <= L.now), L.now])].sort((x, y) => x - y);   // trend 가 없는 옛 집계는 기준 달만
  return { months: L.months, now: L.now, last: L.months.length - 1, actual: a >= 0 && a < L.now ? a : L.now, judged };   // actualThrough 가 없는 옛 집계는 기준 달까지 실제
}
/* 한 달의 판정(data/board/judgment-history.json 의 행 모양). 기준 달은 원장 집계 자신의 judgment */
type Judged = { projects: number; units: number };
/* ok·caution·delay = 판정(사업 번호가 있는 사업만), candidate = 번호가 없는 후보의 같은 계산(확인 필요). candidate 가 없는 행(2026-09 까지의 소급 이력·옛 집계)은 후보 포함 판정 */
type CandJudged = { ok: Judged; caution: Judged; delay: Judged };
export type JudgeRow = { month: string; referenceDate: string; ok: Judged; caution: Judged; delay: Judged; candidate?: CandJudged; delayByStage: number[]; cautionByStage: number[]; judged: number; addedSources?: string[] };
type JudgeSource = { months: string[]; now: number; referenceDate: string; judgment: { ok: Judged; caution: Judged; delay: Judged; candidate?: CandJudged }; delayByStage: number[]; cautionByStage: number[]; scope: { judged: number }; trend?: JudgeRow[] };
/* 달(시점 번호)마다 판정 행, 판정 없는 달은 null */
export function judgmentsOf(L: JudgeSource): (JudgeRow | null)[] {
  const out: (JudgeRow | null)[] = L.months.map(() => null);
  for (const r of L.trend ?? []) { const i = L.months.indexOf(r.month); if (i >= 0 && i <= L.now) out[i] = r; }
  out[L.now] ??= { month: L.months[L.now], referenceDate: L.referenceDate, ok: L.judgment.ok, caution: L.judgment.caution, delay: L.judgment.delay, ...(L.judgment.candidate ? { candidate: L.judgment.candidate } : {}), delayByStage: L.delayByStage, cautionByStage: L.cautionByStage, judged: L.scope.judged };
  return out;
}
export const CIR = ['①', '②', '③', '④', '⑤', '⑥'];
export const K = ['계획', '인허가', '착공', '모집', '준공', '입주'];
/* 6단계 색: 테마별 값은 app/tailwind.css 의 --st-* (차트 면 색, 라이트·다크). SVG 와 인라인 스타일이 var() 로 읽는다 */
export const C = ['var(--st-plan)', 'var(--st-permit)', 'var(--st-build)', 'var(--st-sale)', 'var(--st-soon)', 'var(--st-move)'];

/* ── 계산 ── */
export const f = (n: number) => n.toLocaleString('en-US');
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
/* 판정 값은 선택 시점 이하의 가장 늦은 판정 달(T.judged)의 값이다. 없으면 -1 */
export const judgedAt = (T: Timeline, m: number) => T.judged.reduce((j, k) => (k <= m ? k : j), -1);
export const argmax = (a: number[]) => a.reduce((b, v, i) => (v > a[b] ? i : b), 0);
export const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
/* 단계별 지연 호수: delays = 달마다 delayByStage(판정 없는 달 null). 선택 시점 이하의 가장 늦은 판정 달의 값, 판정 달이 없으면 0(예정 구간은 NOW 의 판정을 유지한다) */
export const delaysOf = (J: (JudgeRow | null)[]) => J.map((r) => r?.delayByStage ?? null);
const ZERO = [0, 0, 0, 0, 0, 0];
export const delayAt = (T: Timeline, delays: (number[] | null)[], m: number) => { const j = judgedAt(T, m); return j >= 0 && delays[j] ? delays[j] : ZERO; };

/* ── 지연·주의 추이 카드 ── */
/* 0 … NOW 달마다 지연·주의 호수(판정 없는 달 null) */
export const trendOf = (T: Timeline, J: (JudgeRow | null)[]) => J.slice(0, T.now + 1).map((r) => (r ? { d: r.delay.units, w: r.caution.units } : null));
/* 세로 맨 위: 최댓값 이상인 가장 작은 1·1.2·1.5·2·2.5·3·4·5·6·8 × 10^n(눈금 글자가 없어 선이 카드 높이를 고르게 쓰게 한다). 눈금선 3개는 4등분 */
/* 원천이 새로 들어간 달(addedSources 가 있는 판정 행) — 추이 그래프의 표지. 이전 달과 직접 비교되지 않는다 */
/* 판정 기준 변경 달: candidate(번호 없는 후보를 따로 셈)가 있는 첫 판정 달 — 그 앞 판정 달(소급 이력)은 후보 포함이라 값이 이어지지 않는다(2026.09 수만 호 → 2026.10 번호 있는 사업만).
   앞 판정 달이 없거나 후보 포함 판정이 없으면 -1(변경 없음). 리본의 구분선·흐린 띠, 지연·주의 추이의 '기준 변경' 표지, 선택 달의 '후보 포함' 꼬리표가 같은 달을 쓴다 */
export const scopeChangeOf = (J: (JudgeRow | null)[]) => {
  const m = J.findIndex((r) => r?.candidate);
  return m > 0 && J.slice(0, m).some((r) => r && !r.candidate) ? m : -1;
};
export const SCOPE_TAG = (ym: string) => `판정 기준 변경 · ${ym}부터 번호 있는 사업만`;
export const addedMarks = (J: (JudgeRow | null)[], NOW: number) => J.slice(0, NOW + 1).flatMap((r, m) => (r?.addedSources?.length ? [{ m, sources: r.addedSources }] : []));
export const trendMax = (max: number) => { for (let e = 1; ; e *= 10) for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8]) if (m * e >= max) return m * e; };
/* 선 끝 이름표의 값: 선택 시점(NOW 까지)의 판정 달 값과 전월 대비 증감(호, 이력 차이). 판정 달이 없으면 null, 앞 달 판정이 없으면 증감 0 */
export function trendAt(T: Timeline, tr: ({ d: number; w: number } | null)[], cur: number) {
  const j = judgedAt(T, Math.min(cur, T.now)), a = j >= 0 ? tr[j] : null, b = j > 0 ? tr[j - 1] : null;
  return a ? { d: a.d, w: a.w, dd: b ? a.d - b.d : 0, dw: b ? a.w - b.w : 0 } : null;
}
/* 두 이름표의 세로 자리(y, 아래로 커진다): 간격이 gap 보다 좁으면 아래쪽을 내리고, 바닥(max)을 넘으면 위쪽을 올린다. 입력 순서대로 돌려준다 */
export function apart(a: number, b: number, gap: number, max: number): [number, number] {
  const lowFirst = a > b, up = lowFirst ? b : a;
  let lo = lowFirst ? a : b, hi = up;
  if (lo - hi < gap) lo = hi + gap;
  if (lo > max) { lo = max; hi = Math.min(hi, lo - gap); }
  return lowFirst ? [lo, hi] : [hi, lo];
}

/* ── 시도 타일 색(바탕색 = 지연율 단계) ── */
export const RTH = [10, 15, 20, 30];
export const RCOL = ['var(--region-0)', 'var(--region-1)', 'var(--region-2)', 'var(--region-3)', 'var(--region-4)', 'var(--region-5)'];
export const RLAB = ['0', '<10', '10~15', '15~20', '20~30', '30+'];
export const rcls = (rate: number) => (rate === 0 ? 0 : 1 + RTH.filter((t) => rate >= t).length);
/* 시도 코드 → 지리 격자 자리 [줄, 열](4열 × 5줄, 5줄 2~4열은 선택한 시도 요약 칸). 표에 없는 코드는 자리를 주지 않아 빈 칸에 이어 붙는다 */
export const REGION_POS: Record<string, [number, number]> = { '28': [1, 1], '11': [1, 2], '41': [1, 3], '51': [1, 4], '44': [2, 1], '36': [2, 2], '43': [2, 3], '47': [2, 4], '52': [3, 1], '30': [3, 2], '27': [3, 3], '31': [3, 4], '12': [4, 1], '48': [4, 2], '26': [4, 3], '50': [5, 1] };

/* ── 리본 차트 기하(시안과 같은 좌표계). 층 두께 = 원장의 달 말 단계별 호수, 붉은 띠 = delayAt, 세로 축척(ymax)은 총량에 맞춘다 ── */
export const VW = 960, PX0 = 46, PW = 908, TOP = 52, PH = 320, BOT = TOP + PH; // 시안 값. 아래 달 이름 줄을 없애(2026-10-12) '기준' 글자(BOT 아래 한 줄)만 남아 304 로 줄였던 높이를 되돌렸다
/* 시점 n 칸을 플롯 폭에 고르게 놓은 x 좌표(칸 m 의 왼쪽 끝 = X(m)) */
export const xOf = (n: number) => (x: number) => PX0 + x * PW / n;
export type Geo = { x: number; lw: number[]; up: number[]; dl: number[] };
/* total = 달마다 단계 합, step = 세로축 눈금 간격(1·2·2.5·5 × 10^n 중 눈금 5칸 이하가 되는 가장 작은 값), ymax = 가장 큰 총량을 step 단위로 올린 값(세로축 맨 위), ticks = 0…ymax 눈금,
   s2 = 1호의 px, geo = 0.25개월 간격의 층 경계(lw 아래·up 위, 0 은 BOT 에서 쌓는다)와 지연 띠 두께(dl, px), T = 시점, X·pitch = 시점의 x 좌표와 한 달 폭,
   scopeFrom = 판정 기준 변경 달(scopeChangeOf, 없으면 -1 — 그 앞 지연 띠는 후보 포함 값이라 흐리게 그린다) */
export type Ribbon = { T: Timeline; X: (x: number) => number; pitch: number; su: number[][]; delay: (number[] | null)[]; total: number[]; step: number; ymax: number; ticks: number[]; s2: number; geo: Geo[]; scopeFrom: number };
const niceStep = (max: number) => { for (let e = 1; ; e *= 10) for (const m of [1, 2, 2.5, 5]) if (Math.ceil(max / (m * e)) <= 5) return m * e; };
/* delay = 달마다 단계별 지연 호수(delaysOf, 판정 없는 달 null) */
export function ribbonOf(tl: Timeline, su: number[][], delay: (number[] | null)[], scopeFrom = -1): Ribbon {
  const LAST = tl.last, total = su.map(sum), step = niceStep(Math.max(...total)), n = Math.ceil(Math.max(...total) / step), ymax = n * step, s2 = PH / ymax, geo: Geo[] = [];
  for (let x = 0; x <= LAST + 1 + 1e-9; x += 0.25) {   // 달 m 의 값은 칸 가운데(m + 0.5)에 두고 이웃 달과 곧게 잇는다
    const t = Math.min(LAST, Math.max(0, x - 0.5)), i = Math.floor(t), j = Math.min(LAST, i + 1), u = t - i;
    const s = su[i].map((v, k) => v + (su[j][k] - v) * u), T = sum(s), d = delayAt(tl, delay, x), lw: number[] = [], up: number[] = [];
    let below = 0;
    for (let k = 5; k >= 0; k--) { lw[k] = BOT - below * s2; up[k] = lw[k] - s[k] * s2; below += s[k]; }
    geo.push({ x, lw, up, dl: s.map((v, k) => Math.min(d[k], v) * s2) });   // 띠는 층보다 두꺼울 수 없다
  }
  return { T: tl, X: xOf(LAST + 1), pitch: PW / (LAST + 1), su, delay, total, step, ymax, ticks: Array.from({ length: n + 1 }, (_, i) => i * step), s2, geo, scopeFrom };
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

/* ── 리본 글자 자리. 실데이터(원장)는 같은 사업이 단계만 옮겨 가 총량이 매달 같아서, 시안의 연도별 총량 두 줄·커서 라벨이 머리 줄과 서로 겹쳤다(2026-10-11).
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
/* 세로축 단위(차트 안에 글자로 두지 않고 카드 제목 title 에): ymax 1,000만 이상이면 눈금 글자에서 '만' 을 빼 단위가 '만 호' 가 된다 */
export const axisUnit = (g: Ribbon) => (g.ymax >= 10000000 ? '만 호' : '호');
const man = (n: number, unit = '만') => (n === 0 ? '0' : `${+(n / 10000).toFixed(2)}${unit}`);   // 세로축 눈금 글자: 0, 5만, 2.5만

/* 정적 글자(c = ribbon.ts 의 색 이름): 세로축 눈금과 '기준' 글자뿐이다. 붉은 띠 범례·총량 설명·세로축 단위·아래 달 이름은 차트 안에 두지 않는다(카드 제목 줄의 '지연' 칩과 제목 title, 2026-10-12 시안 정리) */
export function staticTexts(g: Ribbon) {
  const { T, X } = g;
  const now: Tx = { x: X(T.now + 1), y: 393, t: `기준 ${ml(T, T.now)}`, fs: 13, a: 'middle', c: 'ink', bold: true };
  /* 판정 기준 변경 꼬리표: 구분선(X(scopeFrom)) 왼쪽 아래 줄, '기준' 글자와 겹치지 않게 그 왼쪽 끝보다 앞에서 끝난다 */
  const scope: Tx | null = g.scopeFrom > 0 ? { x: Math.min(X(g.scopeFrom) - 4, textBox(now).x - 8), y: 393, t: SCOPE_TAG(ml(T, g.scopeFrom)), fs: 12, a: 'end', c: 'axis' } : null;
  return {
    ticks: g.ticks.map((v): Tx => ({ x: PX0 - 6, y: BOT - v * g.s2 + 3, t: man(v, axisUnit(g) === '호' ? '만' : ''), fs: 13, a: 'end', c: 'axis' })),   // 세로축: 0 에서 ymax 까지 눈금마다
    now, scope,
  };
}
const staticList = (g: Ribbon) => { const s = staticTexts(g); return [...s.ticks, s.now, ...(s.scope ? [s.scope] : [])]; };

/* 선택 시점(cur)의 글자: 연도 머리 · 커서 총량 라벨(층 위쪽 안 → 아래쪽 안 → 더미 위 중 비어 있는 곳) */
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

  /* 커서 괄호의 총량 라벨: 쌓은 더미 위쪽 안 → 바닥 쪽 안 → 더미 위 빈 곳 */
  const top = BOT - g.total[cur] * g.s2, bx = X(cur + 0.5), tt = `${f(g.total[cur])}호`;
  const tw = labelBox(bx, 0, tt).w, xs = [bx, Math.max(bx, PX0 + 4 + tw / 2)];   // 막히면 왼쪽 세로축을 비켜 오른쪽으로
  const tops = [...xs.flatMap((x) => [labelBox(x, Math.max(TOP + 22, top + 22), tt), labelBox(x, BOT - 14, tt), labelBox(x, BOT - 30, tt)]), ...xs.map((x) => labelBox(x, top - 12, tt))];
  const total = tops.find(free) ?? tops[0];
  return { years: yrs, total: { ...total, text: tt }, statics: staticList(g) };
}
