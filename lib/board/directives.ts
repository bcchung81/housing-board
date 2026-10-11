/* 종합상황판의 총리 지시 6건 카드. 지시 날짜·제목·연결 패널(p)은 고정이고, 카드의 값은 모두 자료에서 센다:
   통계누리 전국 착공 누계(보고자료와 같은 ytd), 사업 원장 집계(ledger-board.json), 원천 카탈로그 건수. */
import type { LedgerBoard } from './types';

export type Directive = {
  date: string; t: string; m: string;
  sub?: { text: string; note?: string; tone: 'ok' | 'bad' | 'warn' };   // 값 오른쪽의 작은 보조 값
  basis: string;                                                          // '실데이터' 표지의 title: 값의 기준과 못 내는 값
  p: string[];
};
export type DirectiveInput = {
  sourceCount: number;
  stageNames: string[];                                                    // 리본 6단계 이름(sample.ts 의 K): 병목 단계 이름
  ledger: LedgerBoard;
  start: { year: string; upto: number; cum: number | null; cumLy: number | null };   // 통계누리 전국 착공 누계(올해 1~upto월)와 전년 같은 기간
};

const f = (n: number) => n.toLocaleString('en-US');
const argmax = (a: number[]) => a.reduce((b, v, i) => (v > a[b] ? i : b), 0);
/* 원장 범위 글자(화면 여러 곳이 같이 쓴다): 전국 여부, 사업 구성, 판정 대상·제외 */
export const nation = (L: LedgerBoard) => (L.scope.coverage === 'NATIONWIDE' ? '전국' : '전국 아님');
export const ledgerMix = (L: LedgerBoard) => { const b = L.scope.bySource; return b ? `발급 ${f(b.issued)} · LH 후보 ${f(b.lhCandidates)} · 건축HUB 후보 ${f(b.hubBulkCandidates)}` : `발급 ${f(L.scope.issued)} · 후보 ${f(L.scope.candidates)}`; };
export const ledgerJudged = (L: LedgerBoard) => { const b = L.scope.bySource, s = L.judgment.excludedStartOverdue; return `판정 ${f(L.scope.judged)}건(발급 사업은 착공·준공, 건축HUB 후보는 준공 예정 경과만 · 판정 밖: LH 후보 ${f(b?.lhCandidates ?? L.judgment.excluded.projects)}건${s ? `, 건축HUB 후보의 착공 예정 경과 ${f(s.pairs)}건` : ''})`; };
const L_ = (L: LedgerBoard) => `원장 ${L.observedMonth} 기준 · ${nation(L)}`;

export function makeDirectives({ sourceCount, stageNames: K, ledger: L, start }: DirectiveInput): Directive[] {
  const bk = argmax(L.delayByStage), upSum = L.upcoming.reduce((n, m) => n + m.units, 0);
  const yoy = start.cum !== null && start.cumLy ? (start.cum - start.cumLy) / start.cumLy * 100 : null;
  const span = `${start.year}년 1~${start.upto}월`;
  return [
    { date: '08.14', t: '진척 관리', m: start.cum === null ? '착공 –' : `착공 ${f(start.cum)}호`,
      sub: yoy === null ? undefined : { text: `${yoy >= 0 ? '▲' : '▼'} ${Math.abs(yoy).toFixed(1)}%`, note: `1~${start.upto}월 · 전년 대비`, tone: yoy >= 0 ? 'ok' : 'bad' },
      basis: `통계누리 전국 착공 ${span} 누계와 전년 같은 기간 대비(보고자료와 같은 계산). 계획(목표) 물량 원천이 없어 계획 대비 달성률은 내지 못합니다.`,
      p: ['p-chart'] },
    { date: '08.19', t: '사업장별 현황판', m: `${f(L.scope.projects)} 사업`, basis: `${L_(L)} · 사업 ${f(L.scope.projects)}건(${ledgerMix(L)})`,
      p: ['p-region'] },
    { date: '09.03', t: '범부처 통합·병목', m: `병목 ${K[bk]} ${f(L.delayByStage[bk])}호`, basis: `${L_(L)} · 단계별 지연 호수가 가장 큰 단계(판정한 사업 ${L.scope.judged}건 기준)`,
      p: ['p-trend', 'p-agency'] },
    { date: '09.04', t: '예측가능성', m: `준공 예정 ${f(upSum)}호`, basis: `${L_(L)} · 향후 12개월(${L.upcoming[0].ym}~${L.upcoming[L.upcoming.length - 1].ym}) 준공 예정 호수 합`,
      p: ['p-fut'] },
    { date: '09.18', t: '일정 지연 관리', m: `지연 ${L.judgment.delay.projects}사업`, sub: { text: `주의 ${L.judgment.caution.projects}사업`, tone: 'warn' }, basis: `${L_(L)} · ${ledgerJudged(L)} 중 지연·주의`,
      p: ['p-trend'] },
    { date: '09.30', t: '국민 공개·공식 원천', m: `원천 ${sourceCount}곳`, basis: '원천 카탈로그(data/board/sources.json)에 등록된 원천 수',
      p: ['p-flow'] },
  ];
}
