/* 일반사용자 '공급 일정'(/citizen/schedule) 값·문구(순수 함수 — 파일을 읽지 않는다). 계산은 lib/board/region.ts 를 그대로 쓴다(새 계산 없음).
   정책 화면 /region 과 부품(components/region/Ahead)을 나눠 쓰므로, 부품이 쓰는 말은 AheadWords 로 묶어 정책 판(POLICY_WORDS)이 기본이고 일반사용자 판(PUBLIC_WORDS)만 덮는다.
   서버 화면이 'use client' 부품에 넘기므로 AheadWords 는 글자·표지뿐(함수 없음). 제안서: scratchpad/public-menus/proposal.md 5절. */
import type { YearVal } from './annual';
import type { CalKind } from './region';

/* region.ts 의 METRO·CAL_TYPE 이름·PAST_DUE 와 같은 값(이 파일은 가져오는 것 없이 Node 시험이 바로 읽는다 — 같은 값은 tests/js/public-schedule.test.cjs 가 잠근다) */
const METRO = ['11', '28', '41'];

export type AheadWords = {
  count: string;                        // 건수 단위: 정책 '건' · 일반 '곳'
  kind: Record<CalKind, string>;        // 종류 칩 이름
  kindTip: Record<CalKind, string> | null;   // 목록 종류 칩 설명(null = 정책 판 aheadKindTip)
  past: string;                         // 예정일 지남 표지
  pastTip: string | null;               // null 이면 부품 기본 설명
  cand: string;                         // 사업 번호가 아직 없는 사업 표지
  candTip: string;
  unitsUnknown: string;                 // 목록 칸의 호수 모름
  unitsUnknownLong: string;             // 설명·읽기 이름의 호수 모름
  none: string;                         // 사업이 없는 달 막대 글자('' = 안 보임)
  date: 'dot' | 'ko';                   // dot = 2026.10.11 · ko = 10월 11일(달 제목 2026년 10월)
  hrefBase: string | null;              // 사업 링크 기준(null = 정책 사업 화면 /projects)
  large: boolean;                       // 일반사용자 본문 16px
};

export const POLICY_WORDS: AheadWords = {
  count: '건',
  kind: { SUPPLY_NOTICE: '모집', COMPLETION: '준공', MOVE_IN: '입주' },
  kindTip: null,
  past: '예정일 지남', pastTip: null,
  cand: '(후보)', candTip: '후보 사업(사업 번호가 아직 없음) — 누르면 간단 보기',
  unitsUnknown: '미확인', unitsUnknownLong: '호수 미확인',
  none: '없음', date: 'dot', hrefBase: null, large: false,
};

export const PUBLIC_WORDS: AheadWords = {
  count: '곳',
  kind: { SUPPLY_NOTICE: '모집 공고', COMPLETION: '준공', MOVE_IN: '입주' },
  kindTip: { SUPPLY_NOTICE: '청약 모집 공고가 날 예정인 달', COMPLETION: '공사를 마칠 예정인 달', MOVE_IN: '입주할 예정인 달' },
  past: '예정일 지남 · 기록 확인 중', pastTip: '예정한 날짜가 지났는데 아직 기록이 없어요',
  cand: '일정 확인 중', candTip: '아직 사업 번호가 없어 일정을 확인하는 사업이에요',
  unitsUnknown: '호수 미정', unitsUnknownLong: '호수 미정',
  none: '', date: 'ko', hrefBase: '/citizen/projects', large: true,
};

/* 수도권만(서울 11·인천 28·경기 41): ?sido= 가 이 셋 중 하나가 아니면 수도권 전체 */
export const parsePublicSido = (v?: string): string => (v && METRO.includes(v) ? v : 'metro');

/* 일반사용자 날짜: 달 목록 안이라 연도는 뺀다. 날짜가 없으면 달만 */
export const koDay = (e: { day: string | null; ym: string }) => (e.day ? `${Number(e.day.slice(5, 7))}월 ${Number(e.day.slice(8, 10))}일` : `${Number(e.ym.slice(5, 7))}월`);
export const koMonth = (ym: string) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월`;

/* 큰 호수는 '9만 9,896호', 1만 미만은 '9,896호' */
export function hoText(n: number): string {
  const v = Math.round(n);
  if (v < 10000) return `${v.toLocaleString('en-US')}호`;
  const man = Math.floor(v / 10000), rest = v % 10000;
  return rest ? `${man}만 ${rest.toLocaleString('en-US')}호` : `${man}만 호`;
}

/* 지난 몇 년 지표: 착공·준공 둘 */
export type PublicMetric = 'start' | 'complete';
export const PUBLIC_METRICS: PublicMetric[] = ['start', 'complete'];
export const PUBLIC_METRIC_NAME: Record<PublicMetric, string> = { start: '착공', complete: '준공' };
export const parsePublicMetric = (v?: string): PublicMetric => (v === 'start' ? 'start' : 'complete');

/* 순위 한 줄: 시도 하나의 가장 최근 완결 연도 값을 시도들(값이 있는 곳) 사이에서 견준다 → { year, rank, of, value }. 완결 연도·값이 없으면 null */
export function yearRank(byCode: Record<string, YearVal[]>, code: string): { year: number; rank: number; of: number; value: number } | null {
  const mine = (byCode[code] ?? []).filter((y) => y.complete && y.value !== null).pop();
  if (!mine) return null;
  const vals = Object.values(byCode).map((ys) => ys.find((y) => y.year === mine.year)).filter((y): y is YearVal => !!y && y.complete && y.value !== null).map((y) => y.value as number);
  return { year: mine.year, rank: 1 + vals.filter((v) => v > (mine.value as number)).length, of: vals.length, value: mine.value as number };
}
export const rankText = (metricName: string, r: { year: number; rank: number; of: number; value: number }) => `${r.year}년 ${metricName} ${r.of}곳 중 ${r.rank}위 · ${hoText(r.value)}`;
