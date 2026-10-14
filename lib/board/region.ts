/* '지역 공급'(/region) 화면 값(순수 함수 — 파일을 읽지 않는다). 자료는 tools/ledger/region-supply.js 가 만든
   data/board/region-calendar.json(앞으로 12개월 예정) · region-map.json(서울·인천·경기 경계) · region-annual.json(서울·인천·경기 HOME 통계)과 통계누리 molit.json.
   계산은 승인된 시안(docs/design/home-concept/assets/app.js 의 PAGES.region)과 같다. */
import type { YearVal } from './annual';
import type { Metric, Molit } from './types';

export type CalKind = 'SUPPLY_NOTICE' | 'COMPLETION' | 'MOVE_IN';
export const CAL_KINDS: CalKind[] = ['SUPPLY_NOTICE', 'COMPLETION', 'MOVE_IN'];
/* 종류 이름·면 색·글자 색(종합상황판 단계색: ④모집 ⑤준공 ⑥입주) */
export const CAL_TYPE: Record<CalKind, { name: string; color: string; ink: string }> = {
  SUPPLY_NOTICE: { name: '모집', color: 'var(--st-sale)', ink: 'var(--st-sale-ink)' },
  COMPLETION: { name: '준공', color: 'var(--st-soon)', ink: 'var(--st-soon-ink)' },
  MOVE_IN: { name: '입주', color: 'var(--st-move)', ink: 'var(--st-move-ink)' },
};
/* 위치 근거: 점(블록 라벨점·주소 근사점·지구 대표점) · 근사(시군구·동) · 대표(시군구 중심) */
export type LocKind = 'block' | 'address' | 'district' | 'area' | 'name' | 'rep';
export const LOC_NAME: Record<LocKind, string> = { block: 'LH 블록 대표점', address: '주소 근사점', district: '지구 대표점', area: '근사 위치(시군구·동)', name: '근사 위치(이름 검색)', rep: '대표 위치(시군구 중심)' };

export type CalEntry = { ym: string; day: string | null; type: CalKind; id: string; drawer: boolean; name: string; units: number; sgg: string; loc?: LocKind; pt?: [number, number] };
export type CalendarDoc = { schema: string; observedMonth: string; referenceDate: string; edition: string; from: string; to: string; months: string[]; kinds: CalKind[]; sido: Record<string, CalEntry[]> };
export type RegionMapDoc = { schema: string; view: Record<string, [number, number, number, number]>; sgg: { s: string; n: string; d: string }[]; districts: { n: string; d: string }[] };
export type AnnualDoc = { schema: string; edition: string; months: string[]; series: Record<'start' | 'sale' | 'complete', Record<string, (number | null)[]>>; permitYearly: Record<string, Record<string, number>>; sourceAsOf: string | null };

/* 화면에 넘기는 예정 하나: k = 사업|종류(한 사업이 준공·입주 둘 다 있을 수 있다), sd = 시도, place = 표에 쓰는 짧은 시군구 이름 */
export type AheadEntry = CalEntry & { k: string; sd: string; place: string };

/* '경기도 수원시 권선구' → 전국 보기 '경기 수원시 권선구', 시도 보기 '수원시 권선구' */
export function placeLabel(sgg: string, sidoShort: string, inSido: boolean): string {
  const t = sgg.split(' ');
  if (t.length < 2) return sgg;
  return inSido ? t.slice(1).join(' ') : `${sidoShort} ${t.slice(1).join(' ')}`;
}

export const METRO = ['11', '28', '41'];
const byDay = (a: CalEntry, b: CalEntry) => (a.day ?? `${a.ym}-99`).localeCompare(b.day ?? `${b.ym}-99`) || a.name.localeCompare(b.name, 'ko');

/* 지역 범위: '' = 전국 · 'metro' = 수도권(서울·인천·경기 — 처음 열 때) · 'NN' = 시도 하나. 주소는 ?sido=all|NN, 수도권은 ?sido 없음 */
export const scopeCodes = (doc: { sido: Record<string, unknown> }, sido: string) => (sido === 'metro' ? METRO.filter((c) => c in doc.sido) : sido ? [sido] : Object.keys(doc.sido));
export const inScope = (sido: string, code: string) => (sido === 'metro' ? METRO.includes(code) : sido ? code === sido : true);

/* 지역 범위의 예정 전체(종류 거르기 전). 시도 하나일 때만 시도 이름을 뺀다 */
export function aheadAll(doc: CalendarDoc, sido: string, sidoName: (code: string) => string): AheadEntry[] {
  const one = !!sido && sido !== 'metro';
  return scopeCodes(doc, sido).flatMap((sd) => (doc.sido[sd] ?? []).map((e) => ({ ...e, k: `${e.id}|${e.type}`, sd, place: placeLabel(e.sgg, sidoName(sd), one) }))).sort(byDay);
}
/* 지도 보기 상자(시도들의 상자를 합친 것). 경계 자료가 없는 범위면 null */
export function viewOf(doc: RegionMapDoc, sido: string): [number, number, number, number] | null {
  const vs = (sido === 'metro' ? METRO : sido ? [sido] : []).map((c) => doc.view[c]).filter(Boolean);
  if (!vs.length) return null;
  const x0 = Math.min(...vs.map((v) => v[0])), y0 = Math.min(...vs.map((v) => v[1])), x1 = Math.max(...vs.map((v) => v[0] + v[2])), y1 = Math.max(...vs.map((v) => v[1] + v[3]));
  return [x0, y0, x1 - x0, y1 - y0];
}

/* 종류 칩: 켜진 값(쉼표). 모르는 값은 버리고, 하나도 안 남으면 전부 */
export function parseKinds(v?: string): CalKind[] {
  const on = (v ?? '').split(',').filter((x): x is CalKind => (CAL_KINDS as string[]).includes(x));
  return on.length ? CAL_KINDS.filter((k) => on.includes(k)) : [...CAL_KINDS];
}
/* 칩 하나를 켜고 끈 결과(마지막 하나는 끌 수 없다 — null) */
export function toggleKind(on: CalKind[], k: CalKind): CalKind[] | null {
  const next = on.includes(k) ? on.filter((x) => x !== k) : CAL_KINDS.filter((x) => on.includes(x) || x === k);
  return next.length ? next : null;
}

/* 고른 달: 주소의 m 이 예정 있는 달이면 그대로, 아니면 예정 있는 첫 달(없으면 첫 달) */
/* 지도 원의 키보드 초점(로빙 tabindex): 고른 달의 위치 있는 원만 초점 대상(목록 순서), Tab 으로 들어가는 원은 고른 사업(없으면 첫 원) 하나.
   ←→(↑↓) 로 옮기고 Enter·Space 로 그 사업을 고른다(components/region/Ahead.tsx) */
export function dotFocus(list: { k: string; ym: string; pt?: unknown }[], m: string, sel: string | null): { keys: string[]; tab: string | null } {
  const keys = list.filter((e) => e.ym === m && e.pt).map((e) => e.k);
  return { keys, tab: sel && keys.includes(sel) ? sel : keys[0] ?? null };
}
export function pickMonth(months: string[], list: { ym: string }[], m?: string): string {
  const has = (x: string) => list.some((e) => e.ym === x);
  return m && months.includes(m) && has(m) ? m : months.find(has) ?? months[0];
}

/* ---------- 지난 공급 실적 ---------- */
export const NATION_FROM = 2022;   // 통계누리 월 자료가 2021-09 부터라 2021 은 4개월뿐 — 전국·다른 시도는 2022 부터

/* 월 자료 → 해마다 YearVal(lib/board/annual.ts 와 같은 모양) */
export function yearlyOf(months: string[], values: (number | null)[], provisional: string[], fromYear: number, toYear = Infinity): YearVal[] {
  const out = new Map<number, YearVal>();
  months.forEach((ym, i) => {
    const year = Number(ym.slice(0, 4));
    if (year < fromYear || year > toYear) return;
    const y = out.get(year) ?? { year, value: null, months: 0, first: null, last: null, complete: false, provisional: false };
    out.set(year, y);
    if (provisional.includes(ym)) y.provisional = true;
    const v = values[i];
    if (v === null || v === undefined) return;
    const mo = Number(ym.slice(5, 7));
    y.value = (y.value ?? 0) + v; y.months += 1;
    y.first = y.first === null ? mo : Math.min(y.first, mo);
    y.last = y.last === null ? mo : Math.max(y.last, mo);
  });
  return [...out.values()].sort((a, b) => a.year - b.year).map((y) => ({ ...y, complete: y.months === 12 }));
}

/* 시도 하나('' = 전국)의 연도별 실적: 통계누리 2022~. 서울·인천·경기는 2018~2021 을 HOME 통계(같은 통계누리 시도 자료 — 2022~2025 값이 같다, 시험으로 확인)로 앞에 잇는다.
   인허가는 HOME 에 연 단위만 있다 */
export function regionYears(molit: Molit, annual: AnnualDoc, metric: Metric, code: string): { years: YearVal[]; spliced: boolean } {
  const years = yearlyOf(molit.months, molit.metrics[metric].series[code || '00'].total, molit.provisional, NATION_FROM);   // = annualSeries(…) 의 2022~ (값을 가져오지 않아 Node 시험이 이 파일만 읽는다)
  if (!METRO.includes(code)) return { years, spliced: false };
  const early: YearVal[] = metric === 'permit'
    ? [2018, 2019, 2020, 2021].map((year) => { const v = annual.permitYearly[code]?.[String(year)] ?? null; return { year, value: v, months: v === null ? 0 : 12, first: v === null ? null : 1, last: v === null ? null : 12, complete: v !== null, provisional: false }; })
    : yearlyOf(annual.months, annual.series[metric][code], [], 2018, NATION_FROM - 1);
  return { years: [...early, ...years], spliced: true };
}

/* 수도권(세 시도) 연도별 합: 해마다 값을 더하고(셋 다 비면 null), 달 수는 가장 적은 시도 것, 완결은 셋 다 완결일 때만 */
export function metroYears(molit: Molit, annual: AnnualDoc, metric: Metric): YearVal[] {
  const each = METRO.map((c) => regionYears(molit, annual, metric, c).years);
  const years = [...new Set(each.flat().map((y) => y.year))].sort((a, b) => a - b);
  return years.map((year) => {
    const ys = each.map((e) => e.find((y) => y.year === year)).filter((y): y is YearVal => !!y && y.value !== null);
    if (!ys.length) return { year, value: null, months: 0, first: null, last: null, complete: false, provisional: false };
    const full = ys.length === METRO.length;
    return { year, value: ys.reduce((t, y) => t + y.value!, 0), months: full ? Math.min(...ys.map((y) => y.months)) : 0, first: Math.max(...ys.map((y) => y.first ?? 1)), last: Math.min(...ys.map((y) => y.last ?? 12)),
      complete: full && ys.every((y) => y.complete), provisional: ys.some((y) => y.provisional) };
  });
}
