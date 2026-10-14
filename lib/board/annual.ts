/* 공급 실적의 연도별 집계(순수 함수). 월 자료(통계누리)를 달력 연도로 합친다. 자료는 2021-09 부터라 2021 은 부분 연도이고,
   인허가는 연초 누계의 차분이라 첫 달이 비어 있다 → 값이 있는 달만 센다. 12개월이 모두 있는 해만 '완결 연도'다. */
import type { Metric, Molit } from './types';

export type YearVal = {
  year: number;
  value: number | null;   // 값이 있는 달의 합(값이 있는 달이 없으면 null)
  months: number;         // 값이 있는 달 수
  first: number | null;   // 값이 있는 첫 달·마지막 달(1~12)
  last: number | null;
  complete: boolean;      // 12/12개월
  provisional: boolean;   // 잠정치 달을 포함
};

/* 한 시도(또는 전국)·한 지표의 연도별 값. 해 순서대로 */
export function annualSeries(m: Molit, metric: Metric, code: string): YearVal[] {
  const total = m.metrics[metric].series[code].total;
  const byYear = new Map<number, YearVal>();
  m.months.forEach((ym, i) => {
    const year = Number(ym.slice(0, 4)), mo = Number(ym.slice(5));
    const y = byYear.get(year) ?? { year, value: null, months: 0, first: null, last: null, complete: false, provisional: false };
    byYear.set(year, y);
    if (m.provisional.includes(ym)) y.provisional = true;
    const v = total[i];
    if (v === null || v === undefined) return;
    y.value = (y.value ?? 0) + v;
    y.months += 1;
    y.first = y.first === null ? mo : Math.min(y.first, mo);
    y.last = y.last === null ? mo : Math.max(y.last, mo);
  });
  const out = [...byYear.values()].sort((a, b) => a.year - b.year);
  for (const y of out) y.complete = y.months === 12;
  return out;
}

/* 전년 대비(%). 두 해 모두 12/12개월일 때만 낸다(아니면 null) */
export function yoy(series: YearVal[], year: number): number | null {
  const cur = series.find((y) => y.year === year), prev = series.find((y) => y.year === year - 1);
  if (!cur || !prev || !cur.complete || !prev.complete || cur.value === null || prev.value === null || prev.value === 0) return null;
  return (cur.value / prev.value - 1) * 100;
}

/* 마지막 완결 연도(없으면 null) */
export const lastCompleteYear = (series: YearVal[]) => [...series].reverse().find((y) => y.complete)?.year ?? null;

/* 완결 연도 뒤에 이어지는 부분 연도(올해 1~N월). 없으면 null */
export function partialAfter(series: YearVal[]): YearVal | null {
  const lc = lastCompleteYear(series);
  return series.find((y) => !y.complete && y.value !== null && (lc === null || y.year > lc)) ?? null;
}

/* 부분 연도의 기간 꼬리표: '1~8월' */
export const spanLabel = (y: YearVal) => (y.first === null || y.last === null ? '' : y.first === y.last ? `${y.first}월` : `${y.first}~${y.last}월`);
