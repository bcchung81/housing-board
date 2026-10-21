/* 월 상세(/month/{ym})의 '그 달 공급 예정'(HOME 향후 12개월 공급 예정, 2026-10-21 결정). 종합상황판 '향후 12개월 공급 예정'·지역 공급 앞으로 12개월과
   같은 모집단·같은 식(data/board/region-calendar.json 의 home — PoC 원천 사업 행 단위, 공급(모집·분양) 일정 증가분에서 이미 측정된 공급을 뺀 값)이다.
   순수 함수 — Node 시험이 그대로 읽는다. */
import type { CalendarDoc, CalEntry, HomePolicy } from './region';

export type MonthDue = CalEntry & { sd: string };
const byName = (a: CalEntry, b: CalEntry) => a.name.localeCompare(b.name, 'ko') || (a.pro ?? a.id).localeCompare(b.pro ?? b.id);

/* 그 달 공급 예정(수도권, 이름 순 — HOME 일정은 달 단위) */
export const monthSupply = (cal: Pick<CalendarDoc, 'home'>, ym: string, policy: HomePolicy = 'p97'): MonthDue[] =>
  Object.entries(cal.home[policy].sido).flatMap(([sd, es]) => es.filter((e) => e.ym === ym).map((e) => ({ ...e, sd }))).sort(byName);

/* 월 상세가 열리는 달: 통계누리 실적 달 + LH 준공 예정 달(정책 진행 자료 9·7 연결 블록 — lib/board/home-lh-plan) + 9·7 공급 예정이 있는 달(종합상황판의 월 링크도 같은 목록) */
export function monthIds(molitMonths: string[], lhBlocks: { date: string }[], cal: Pick<CalendarDoc, 'home'>): string[] {
  const due = cal.home.p97.months.filter((m) => m.units > 0).map((m) => m.ym);
  return [...new Set([...molitMonths, ...lhBlocks.map((b) => b.date.slice(0, 7)), ...due])].sort();
}
