/* 종합상황판의 총리 지시 6건 카드. 지시 날짜·제목·연결 패널(p)은 고정이고, 카드의 값은 모두 자료에서 센다:
   통계누리 전국 착공 누계(보고자료와 같은 ytd), 사업 원장 집계(ledger-board.json), 원천 카탈로그 건수. */
import type { LedgerBoard } from './types';

/* 카드 아랫줄 = 앞말(pre, 작은 글자) + 큰 숫자(big) + 단위(u) + 보조 값(sub). m 은 그 셋을 이은 한 줄(읽기용 이름). 날짜·지시 이름·기준(basis)은 카드 title */
export type Directive = {
  date: string; t: string; m: string;
  tag?: string;                                           // 지시 이름 곁의 짧은 정의 꼬리(같은 이름의 숫자가 화면마다 정의가 다를 때 — 착공 = 통계누리 누계)
  pre?: string; big: string; u: string;
  sub?: { text: string; tone: 'ok' | 'bad' | 'warn' };   // 값 오른쪽의 작은 보조 값
  basis: string;                                          // 카드 title: 값의 기준(기간·범위)과 못 내는 값
  p: string[];
  /* '목록 ›' 연결: 그 숫자를 만든 사업만 거른 목록(사업 화면 쿼리 — lib/board/projects-view.ts parseFilters 규칙). 사업 목록으로 거를 수 없는 숫자는 가장 가까운 목록으로 보내고 차이를 title 에 */
  list: { href: string; title: string };
};
const val = (pre: string | undefined, big: string, u: string) => ({ pre, big, u, m: `${pre ? pre + ' ' : ''}${big}${u}` });
export type DirectiveInput = {
  sourceCount: number;
  stageNames: string[];                                                    // 리본 6단계 이름(sample.ts 의 K): 병목 단계 이름
  ledger: LedgerBoard;
  start: { year: string; upto: number; cum: number | null; cumLy: number | null };   // 통계누리 전국 착공 누계(올해 1~upto월)와 전년 같은 기간
  /* 병목 계산: 사업 화면 '어디서 막혀 있는가'와 같은 함수(lib/board/projects-view.ts bottleneckOf)를 넘겨받는다 — 이 파일은 Node 시험이 그대로 읽어 다른 .ts 를 가져오지 않는다 */
  bottleneck: (byStage: number[]) => { i: number; units: number } | null;
};

const f = (n: number) => n.toLocaleString('en-US');
/* 원장 범위 글자(화면 여러 곳이 같이 쓴다): 전국 여부, 사업 구성, 판정 대상·제외 */
export const nation = (L: LedgerBoard) => (L.scope.coverage === 'NATIONWIDE' ? '전국' : '전국 아님');
export const ledgerMix = (L: LedgerBoard) => { const b = L.scope.bySource; return b ? `발급 ${f(b.issued)} · LH 후보 ${f(b.lhCandidates)} · 건축HUB 후보 ${f(b.hubBulkCandidates)}${b.home ? ` · 수도권 HOME ${f(b.home)}` : ''}` : `발급 ${f(L.scope.issued)} · 후보 ${f(L.scope.candidates)}`; };
export const ledgerJudged = (L: LedgerBoard) => {
  const b = L.scope.bySource, s = L.judgment.excludedStartOverdue, c = L.judgment.candidate;
  const out = `판정 밖: LH 후보 ${f(b?.lhCandidates ?? L.judgment.excluded.projects)}건${s ? `, 건축HUB 후보의 착공 예정 경과 ${f(s.pairs)}건` : ''}`;
  /* candidate 가 있는 집계(2026-10-15 결정 D3): 판정은 사업 번호가 있는 사업만, 후보는 같은 계산을 확인 필요로 따로 */
  return c ? `판정 ${f(L.scope.judged)}건(사업 번호가 있는 사업 — 착공·준공 예정 경과 · ${CAND_TEXT} ${f(L.scope.candidateJudged ?? c.ok.projects + c.caution.projects + c.delay.projects)}건은 번호가 없는 후보라 따로 셈(건축HUB 후보, 준공 예정 경과만 계산) · ${out})`
    : `판정 ${f(L.scope.judged)}건(발급 사업은 착공·준공, 건축HUB 후보는 준공 예정 경과만 · ${out})`;
};
/* 번호가 없는 후보의 같은 계산(D3) — 화면 이름 '확인 필요(후보)'(사업 화면 STATUS_RANGE.review 와 같은 말) */
export const CAND_TEXT = '확인 필요(후보)';
export const candText = (c: { ok: { projects: number }; caution: { projects: number }; delay: { projects: number } }) => `계산하면 지연 ${f(c.delay.projects)} · 주의 ${f(c.caution.projects)} · 정상 ${f(c.ok.projects)}`;
const ymDot = (ym: string) => ym.replace('-', '.');
const L_ = (L: LedgerBoard) => `원장 ${ymDot(L.observedMonth)} 기준 · ${nation(L)}`;

export function makeDirectives({ sourceCount, stageNames: K, ledger: L, start, bottleneck }: DirectiveInput): Directive[] {
  const neck = bottleneck(L.delayByStage), upSum = L.upcoming.reduce((n, m) => n + m.units, 0);
  const yoy = start.cum !== null && start.cumLy ? (start.cum - start.cumLy) / start.cumLy * 100 : null;
  const span = `${start.year}년 1~${start.upto}월`;
  return [
    { date: '08.14', t: '진척 관리', tag: '통계누리', ...val('착공', start.cum === null ? '–' : f(start.cum), start.cum === null ? '' : '호'),
      sub: yoy === null ? undefined : { text: `${yoy >= 0 ? '▲' : '▼'}${Math.abs(yoy).toFixed(1)}%`, tone: yoy >= 0 ? 'ok' : 'bad' },
      basis: `통계누리 전국 착공 ${span} 누계와 전년 같은 기간 대비(보고자료와 같은 계산). 계획(목표) 물량 원천이 없어 계획 대비 달성률은 내지 못합니다.`,
      p: ['p-chart'], list: { href: '/projects?sido=all&stage=2', title: `목록: 지금 ③${K[2]} 단계인 원장 사업(전국) — 카드 숫자는 통계누리 착공 통계라 사업 목록으로 거를 수 없어 가장 가까운 목록(건수가 다름)` } },
    { date: '08.19', t: '사업장별 현황판', ...val(undefined, f(L.scope.projects), '건'), basis: `${L_(L)} · 사업 ${f(L.scope.projects)}건(${ledgerMix(L)})`,
      p: ['p-region'], list: { href: '/projects?sido=all', title: `목록: 원장 사업 전체(전국) ${f(L.scope.projects)}건 — 카드 숫자와 같음` } },
    { date: '09.03', t: '범부처 통합·병목', ...(neck ? val(`병목 ${K[neck.i]}`, f(neck.units), '호') : val('병목', '없음', '')), basis: `${L_(L)} · 병목 = 지연 호수(경과 6개월 이상 사업의 계획 호수)가 가장 큰 단계 — 사업 화면 '어디서 막혀 있는가'와 같은 계산(판정한 사업 ${L.scope.judged}건 기준)`,
      p: ['p-trend', 'p-agency'], list: neck ? { href: `/projects?sido=all&stage=${neck.i}&status=late`, title: `목록: 병목 단계(${K[neck.i]})의 지연(장기 포함) 사업 — 목록 머리의 계획 호수 = 카드 숫자` } : { href: '/projects?sido=all&status=late', title: '목록: 지연(장기 포함) 사업(병목 없음)' } },
    { date: '09.04', t: '예측가능성', ...val('준공 예정', f(upSum), '호'), basis: `${L_(L)} · 향후 12개월(${ymDot(L.upcoming[0].ym)}~${ymDot(L.upcoming[L.upcoming.length - 1].ym)}) 준공 예정 호수 합`,
      p: ['p-fut'], list: { href: '/region?sido=all&kind=COMPLETION', title: `목록: 지역 공급의 준공 예정(전국, 같은 12개월) — 사업 목록에는 '앞으로 12개월' 거르기가 없어 같은 범위·같은 값인 지역 공급 목록으로` } },
    { date: '09.18', t: '일정 지연 관리', ...val('지연', f(L.judgment.delay.projects), '건'), sub: { text: `주의 ${f(L.judgment.caution.projects)}`, tone: 'warn' }, basis: `${L_(L)} · ${ledgerJudged(L)} 중 지연·주의${L.judgment.candidate ? ` · ${CAND_TEXT}: ${candText(L.judgment.candidate)}건(지연·주의에 넣지 않음)` : ''}`,
      p: ['p-trend'], list: { href: '/projects?sido=all&status=late', title: `목록: 지연(장기 포함) 사업(전국) ${f(L.judgment.delay.projects)}건 — 카드 숫자와 같음 · 주의 ${f(L.judgment.caution.projects)}건은 '점검 필요' 거르기` } },
    { date: '09.30', t: '국민 공개·공식 원천', ...val('원천', f(sourceCount), '곳'), basis: '원천 카탈로그(data/board/sources.json)에 등록된 원천 수',
      p: ['p-flow'], list: { href: '/sources', title: '목록: 데이터 원본(원천 카탈로그) — 사업이 아니라 원천 목록' } },
  ];
}
