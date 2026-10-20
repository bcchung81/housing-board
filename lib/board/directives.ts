/* 종합상황판의 총리 지시 6건 카드. 지시 날짜·제목·연결 패널(p)은 고정이고, 카드의 값은 모두 자료에서 센다:
   통계누리 수도권 착공 누계(보고자료와 같은 ytd), 사업 원장 집계(ledger-board.json), 원천 카탈로그 건수. */
import type { LedgerBoard } from './types';

/* 카드 아랫줄 = 앞말(pre) + 큰 숫자(big) + 단위(u) + 보조 값(sub — 색 없는 증감). m 은 그 셋을 이은 한 줄(읽기용 이름). 날짜·지시 이름·기준(basis)은 카드 title·(i).
   2026-10-18 지시 카드 통일 규격: 두 줄 고정(지시 이름 / 값), 꼬리·링크 글자 없음 — 숫자 자체가 목록 링크(list) */
export type Directive = {
  date: string; t: string; m: string;
  pre?: string; big: string; u: string;
  sub?: string;                                           // 값 오른쪽의 보조 값(증감 '+10.8%' — 색·화살표 없음, 좁은 카드에서는 숨기고 basis 에 같은 값)
  basis: string;                                          // 카드 title·(i): 값의 기준(기간·범위)과 못 내는 값
  p: string[];
  /* 숫자 링크: 그 숫자를 만든 사업만 거른 목록(사업 화면 쿼리 — lib/board/projects-view.ts parseFilters 규칙). 사업 목록으로 거를 수 없는 숫자는 가장 가까운 목록으로 보내고 차이를 title 에 */
  list: { href: string; title: string };
  /* 두 숫자를 같은 크기로 나란히(2026-10-15 사용자 결정 — 일정 지연 관리: 확정 · 후보 계산). 두 숫자가 각각 자기 목록으로 이어진다(앞 숫자 = list) */
  pair?: { pre: string; big: string; u: string; list: { href: string; title: string } };
};
const val = (pre: string | undefined, big: string, u: string) => ({ pre, big, u, m: `${pre ? pre + ' ' : ''}${big}${u}` });
export type DirectiveInput = {
  sourceCount: number;
  stageNames: string[];                                                    // 리본 6단계 이름(sample.ts 의 K): 병목 단계 이름
  ledger: LedgerBoard;
  start: { year: string; upto: number; cum: number | null; cumLy: number | null };   // 통계누리 수도권 착공 누계(올해 1~upto월)와 전년 같은 기간
  /* 병목 계산: 사업 화면 '어디서 막혀 있는가'와 같은 함수(lib/board/projects-view.ts bottleneckOf)를 넘겨받는다 — 이 파일은 Node 시험이 그대로 읽어 다른 .ts 를 가져오지 않는다 */
  bottleneck: (byStage: number[]) => { i: number; units: number } | null;
};

const f = (n: number) => n.toLocaleString('en-US');
/* 원장 범위 글자(화면 여러 곳이 같이 쓴다): 전국·수도권 여부, 사업 구성, 판정 대상·제외. 수도권 = 사업이 모두 서울·인천·경기 HOME(2026-10-19 결정, board.js coverage CAPITAL) */
export const nation = (L: LedgerBoard) => (L.scope.coverage === 'NATIONWIDE' ? '전국' : L.scope.coverage === 'CAPITAL' ? '수도권' : '전국 아님');
/* 0건인 원천은 적지 않는다 */
export const ledgerMix = (L: LedgerBoard) => { const b = L.scope.bySource; return b ? [b.issued ? `발급 ${f(b.issued)}` : '', b.lhCandidates ? `LH 후보 ${f(b.lhCandidates)}` : '', b.hubBulkCandidates ? `건축HUB 후보 ${f(b.hubBulkCandidates)}` : '', b.home ? `수도권 HOME ${f(b.home)}` : ''].filter(Boolean).join(' · ') : `발급 ${f(L.scope.issued)} · 후보 ${f(L.scope.candidates)}`; };
/* 공공 공급 밖으로 따로 센 민간 정비(2026-10-20 공공 분류 안2 — board.js scope.renewal): 카드 근거 끝에 한 줄, 없으면 빈 글 */
export const RENEWAL_NAME = '민간 정비(정책 귀속 검토)';
export const renewalText = (L: LedgerBoard) => (L.scope.renewal?.projects ? ` · 별도 ${RENEWAL_NAME} ${f(L.scope.renewal.projects)}건·${f(L.scope.renewal.units)}호(집계 밖)` : '');
/* 번호가 없는 후보의 같은 계산 건수(없거나 0이면 0 — 후보 줄·쌍 숫자를 보이지 않는다) */
export const candCount = (c?: { ok: { projects: number }; caution: { projects: number }; delay: { projects: number } } | null) => (c ? c.ok.projects + c.caution.projects + c.delay.projects : 0);
export const ledgerJudged = (L: LedgerBoard) => {
  const b = L.scope.bySource, s = L.judgment.excludedStartOverdue, c = L.judgment.candidate, lh = b?.lhCandidates ?? L.judgment.excluded.projects;
  const parts = [lh ? `LH 후보 ${f(lh)}건` : '', s?.pairs ? `건축HUB 후보의 착공 예정 경과 ${f(s.pairs)}건` : ''].filter(Boolean), out = parts.length ? ` · 일정 정보 없음: ${parts.join(', ')}` : '';
  /* candidate 가 있는 집계(2026-10-15 결정 D3): 판정은 사업 번호가 있는 사업만, 후보는 같은 계산을 확인 필요로 따로 */
  if (c && candCount(c)) return `판정 ${f(L.scope.judged)}건(사업 번호가 있는 사업 — 착공·준공 예정 경과 · ${CAND_TEXT} ${f(L.scope.candidateJudged ?? candCount(c))}건은 번호가 없는 후보라 따로 셈(건축HUB 후보, 준공 예정 경과만 계산)${out})`;
  return c ? `판정 ${f(L.scope.judged)}건(사업 번호가 있는 사업 — 착공·준공 예정 경과${out})` : `판정 ${f(L.scope.judged)}건(발급 사업은 착공·준공, 건축HUB 후보는 준공 예정 경과만${out})`;
};
/* 번호가 없는 후보의 같은 계산(D3) — 화면 이름 '확인 필요(후보)'(사업 화면 STATUS_RANGE.review 와 같은 말) */
export const CAND_TEXT = '확인 필요(후보)';
export const candText = (c: { ok: { projects: number }; caution: { projects: number }; delay: { projects: number } }) => `계산하면 지연 ${f(c.delay.projects)} · 주의 ${f(c.caution.projects)} · 정상 ${f(c.ok.projects)}`;
/* 판정 비율의 모수(선택 시점 카드): 판정 사업 건수·호수와 전체 호수(리본 총량 = 원장 전체 호수) 중 판정 호수 비율 */
type Pu = { projects: number; units: number };
export const judgeBase = (j: { ok: Pu; caution: Pu; delay: Pu }, total: number) => {
  const p = j.ok.projects + j.caution.projects + j.delay.projects, u = j.ok.units + j.caution.units + j.delay.units;
  return `판정 ${f(p)}건 · ${f(u)}호 · 전체의 ${(total ? u / total * 100 : 0).toFixed(1)}%`;
};
const ymDot = (ym: string) => ym.replace('-', '.');
const L_ = (L: LedgerBoard) => `원장 ${ymDot(L.observedMonth)} 기준 · ${nation(L)}`;
/* 통계누리 범위: 화면에 넘기는 통계누리는 수도권 합(calc.ts capitalMolit·CAPITAL_NAME 과 같은 이름 — 이 파일은 다른 .ts 를 가져오지 않는다) */
const STAT_SCOPE = '수도권';

export function makeDirectives({ sourceCount, stageNames: K, ledger: L, start, bottleneck }: DirectiveInput): Directive[] {
  const neck = bottleneck(L.delayByStage), upSum = L.upcoming.reduce((n, m) => n + m.units, 0);
  const yoy = start.cum !== null && start.cumLy ? (start.cum - start.cumLy) / start.cumLy * 100 : null;
  const span = `${start.year}년 1~${start.upto}월`;
  const yoyText = yoy === null ? null : `${yoy >= 0 ? '+' : '−'}${Math.abs(yoy).toFixed(1)}%`;   // 증감: 부호 글자만(초록 = 정상 판정색과 섞이지 않게 색·▲ 없음)
  const startNow = L.stageProjects?.[L.now]?.[2];   // 원장에서 지금 ③착공 단계인 사업 수(진척 관리 숫자 링크가 여는 목록의 건수)
  return [
    { date: '08.14', t: '진척 관리', ...val('착공 누계', start.cum === null ? '–' : f(start.cum), start.cum === null ? '' : '호'),
      sub: yoyText ?? undefined,
      basis: `통계누리 ${STAT_SCOPE} 착공 ${span} 누계${yoyText ? ` · 전년 같은 기간 대비 ${yoyText}` : '와 전년 같은 기간 대비'}(보고자료와 같은 계산). 계획(목표) 물량 원천이 없어 계획 대비 달성률은 내지 못합니다.`,
      p: ['p-chart'], list: { href: '/projects?sido=all&stage=2', title: `목록: 지금 ③${K[2]} 단계인 원장 사업(${nation(L)})${startNow === undefined ? '' : ` ${f(startNow)}건`} — 카드 숫자는 통계누리 착공 통계라 사업 목록으로 거를 수 없어 가장 가까운 목록(건수가 다름)` } },
    { date: '08.19', t: '사업장별 현황판', ...val(undefined, f(L.scope.projects), '건'), basis: `${L_(L)} · 사업 ${f(L.scope.projects)}건(${ledgerMix(L)})${renewalText(L)}`,
      p: ['p-region'], list: { href: '/projects?sido=all', title: `목록: 원장 사업 전체(${nation(L)}) ${f(L.scope.projects)}건 — 카드 숫자와 같음` } },
    { date: '09.03', t: '범부처 통합·병목', ...(neck ? val(`병목 ${K[neck.i]}`, f(neck.units), '호') : val('병목', '없음', '')), basis: `${L_(L)} · 병목 = 지연 호수(경과 6개월 이상 사업의 계획 호수)가 가장 큰 단계 — 사업 화면 '어디서 막혀 있는가'와 같은 계산(판정한 사업 ${L.scope.judged}건 기준)`,
      p: ['p-trend', 'p-agency'], list: neck ? { href: `/projects?sido=all&stage=${neck.i}&status=late`, title: `목록: 병목 단계(${K[neck.i]})의 지연(장기 포함) 사업 — 목록 머리의 계획 호수 = 카드 숫자` } : { href: '/projects?sido=all&status=late', title: '목록: 지연(장기 포함) 사업(병목 없음)' } },
    { date: '09.04', t: '예측가능성', ...val('준공 예정', f(upSum), '호'), basis: `${L_(L)} · 향후 12개월(${ymDot(L.upcoming[0].ym)}~${ymDot(L.upcoming[L.upcoming.length - 1].ym)}) 준공 예정 호수 합`,
      p: ['p-fut'], list: { href: '/region?sido=all&kind=COMPLETION', title: `목록: 지역 공급의 준공 예정(${nation(L)}, 같은 12개월) — 사업 목록에는 '앞으로 12개월' 거르기가 없어 같은 범위·같은 값인 지역 공급 목록으로` } },
    lateCard(L),
    { date: '09.30', t: '국민 공개·공식 원천', ...val('원천', f(sourceCount), '곳'), basis: '데이터 원본 화면의 원천 카탈로그에 등록된 원천 수',
      p: ['p-actual'], list: { href: '/sources', title: '목록: 데이터 원본(원천 카탈로그) — 사업이 아니라 원천 목록' } },
  ];
}

/* 일정 지연 관리: 지연 확정(번호 있는 사업) · 후보 계산(번호 없는 후보를 같은 규칙으로 계산한 지연)을 같은 크기로(2026-10-15 사용자 결정). 후보 집계가 없는 옛 집계는 지연 · 주의 */
function lateCard(L: LedgerBoard): Directive {
  const J = L.judgment, c = candCount(J.candidate) ? J.candidate : undefined, n = f(J.delay.projects);   // 후보가 없으면(수도권 HOME 만) 지연 · 주의 카드
  const base = { date: '09.18', t: '일정 지연 관리', basis: `${L_(L)} · ${ledgerJudged(L)} 중 지연·주의${c ? ` · ${CAND_TEXT}: ${candText(c)}건(지연·주의에 넣지 않음)` : ''}`, p: ['p-trend'],
    list: { href: '/projects?sido=all&status=late', title: `목록: 지연(장기 포함) 사업(${nation(L)}) ${n}건 — 카드 숫자와 같음 · 주의 ${f(J.caution.projects)}건은 '점검 필요' 거르기` } };
  if (!c) return { ...base, ...val('지연', n, '건'), sub: `주의 ${f(J.caution.projects)}` };
  const cn = f(c.delay.projects);
  return { ...base, ...val('확정', n, '건'), m: `지연 확정 ${n}건 · 후보 계산 ${cn}건`,
    pair: { pre: '후보 계산', big: cn, u: '건', list: { href: '/projects?sido=all&status=review-late', title: `목록: 후보 · 지연 계산(${nation(L)}) ${cn}건 — 카드 숫자와 같음 · ${CAND_TEXT} ${f(c.ok.projects + c.caution.projects + c.delay.projects)}건 중 같은 규칙으로 계산하면 지연 · 사업 번호가 없어 지연 확정에 넣지 않음` } } };
}
