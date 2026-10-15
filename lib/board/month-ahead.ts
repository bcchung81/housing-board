/* 월 상세(/month/{ym})의 '그 달 준공 예정'(사업 원장). 종합상황판 '앞으로 12개월'(ledger-board.json upcoming)·지역 공급 준공 예정과
   같은 자료·같은 정의(data/board/region-calendar.json 의 COMPLETION — 준공 실제가 없는 사업의 현재 예정, 사업당 하나)라 달 합계가 셋 다 같다.
   날짜는 HOME 정본(calendar 의 day), LH 파일 날짜가 다르면 화면이 '원천 날짜 다름' 표지(projects-view dateAltOf)를 단다. 순수 함수 — Node 시험이 그대로 읽는다. */
import type { CalendarDoc, CalEntry } from './region';
import { PAST_DUE_UNDER } from './projects-view';

export type MonthDue = CalEntry & { sd: string };
const byDay = (a: CalEntry, b: CalEntry) => (a.day ?? `${a.ym}-99`).localeCompare(b.day ?? `${b.ym}-99`) || a.name.localeCompare(b.name, 'ko');

/* 그 달 준공 예정(전국, 예정일 순) */
export const monthDue = (cal: Pick<CalendarDoc, 'sido'>, ym: string): MonthDue[] =>
  Object.entries(cal.sido).flatMap(([sd, es]) => es.filter((e) => e.type === 'COMPLETION' && e.ym === ym).map((e) => ({ ...e, sd }))).sort(byDay);

/* 월 상세가 열리는 달: 통계누리 실적 달 + LH 준공 예정 파일의 달 + 원장 준공 예정이 있는 달(종합상황판의 월 링크도 같은 목록) */
export function monthIds(molitMonths: string[], lhBlocks: { date: string }[], cal: Pick<CalendarDoc, 'sido'>): string[] {
  const due = Object.values(cal.sido).flatMap((es) => es.filter((e) => e.type === 'COMPLETION').map((e) => e.ym));
  return [...new Set([...molitMonths, ...lhBlocks.map((b) => b.date.slice(0, 7)), ...due])].sort();
}

/* 예정일 지남: 예정일이 원장 기준일보다 앞섰는데 실제 기록이 없고 경과 1개월 미만 — 상태는 그대로 두고 뒤에 붙인다('정상 · 예정일 지남(1개월 미만)').
   '경과 0개월'은 쓰지 않는다(2026-10-15 사용자 결정 D1 — 사업 화면·지역 공급과 같은 말) */
export const dueStatus = (status: string, past: boolean) => (past ? `${status} · ${PAST_DUE_UNDER}` : status);
