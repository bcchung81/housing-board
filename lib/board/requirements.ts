/* 요구사항 F-01~F-12 판정(data/board/requirements.json — tools/ledger/requirements.js)을 화면 값으로 바꾼다. 순수 함수 — 파일을 읽지 않는다.
   데이터 원본의 '요구사항 충족' 격자와 화면 머리의 요구사항 꼬리표(components/ReqTags.tsx)가 쓴다. */
export type Screen = 'projects' | 'region' | 'sources';
export type Verdict = 'met' | 'part' | 'none';
export type Requirement = { id: string; title: string; short: string; priority: string; criterion: string; items: string[]; dates: string[]; screens: Screen[]; verdict: Verdict; metric: string; tip: string; poc: PocMetric };
/* 근거 지표의 PoC 값: 추정 포함(count/total/percent) · 추정 제외(ex*) · 추정으로 더해진 수(added). 분모 0 이면 percent 는 null */
export type PocMetric = { label: string; count: number; total: number; percent: number | null; exCount: number; exTotal: number; exPercent: number | null; added: number };
export type Directive = { date: string; full: string; event: string; need: string };
export type RequirementsDoc = { schema: string; observedMonth: string; referenceDate: string; edition: string; screens: Record<Screen, { name: string; href: string }>; directives: Directive[]; items: Requirement[] };

export const VERDICT: Record<Verdict, { name: string; sort: number }> = { met: { name: '충족', sort: 0 }, part: { name: '부분', sort: 1 }, none: { name: '없음', sort: 2 } };

/* 그 화면이 답하는 요구사항(F 순) */
export const reqsFor = (doc: RequirementsDoc, screen: Screen) => doc.items.filter((r) => r.screens.includes(screen));

/* 지시 날짜 '08.14' → '2026.08.14 제1차 범부처 …'(표에 없으면 날짜 그대로) */
export function directiveText(doc: RequirementsDoc, date: string): string {
  const d = doc.directives.find((x) => x.date === date);
  return d ? `${d.full} ${d.event}` : date;
}

/* 지시 날짜를 시간순으로('MM.DD' — 지시는 모두 같은 해) */
export const datesOf = (r: Requirement) => [...r.dates].sort();

/* 꼬리표 title: 이름(우선순위) · 지시 · 판정(근거 지표) */
export const tagTitle = (doc: RequirementsDoc, r: Requirement) =>
  `${r.id} ${r.title}(${r.priority}) · 지시 ${datesOf(r).map((d) => directiveText(doc, d)).join(' · ')} · 판정 ${VERDICT[r.verdict].name}(${r.metric})`;

export const countVerdicts = (doc: RequirementsDoc) => Object.fromEntries((Object.keys(VERDICT) as Verdict[]).map((v) => [v, doc.items.filter((r) => r.verdict === v).length])) as Record<Verdict, number>;
