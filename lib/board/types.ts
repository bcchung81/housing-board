/* data/board/*.json 의 모양(tools/boarddata 가 만든다). */
export type Metric = 'permit' | 'start' | 'complete' | 'sale';
export type Actor = '지자체' | 'LH' | '주택업체' | '민간';

export type Series = { total: (number | null)[]; actors?: Record<Actor, (number | null)[]> };
export type Molit = {
  months: string[];
  provisional: string[];
  sido: { code: string; name: string }[];
  actors: Actor[];
  metrics: Record<Metric, { label: string; unit: string; basis: string; series: Record<string, Series> }>;
};

export type LhBlock = { district: string; block: string; location: string; type: string; units: number; date: string; sido: string };
export type LhData = { sourceAsOf: string; count: number; units: number; blocks: LhBlock[] };

export type Source = {
  id: string; group: string; provider: string; dataset: string; query: Record<string, unknown>;
  collectedAt: string | null; sourceAsOf: string | null; count: number; description: string; license: string | null; usedBy: string[];
};
export type Sources = { items: Source[] };

export type RegistryProject = {
  id: string; name: string; sgg: string; bjdCodes: string[]; pnus?: string[]; stageCode: string; units?: number | null;
  source: { provider: string; dataset: string; url?: string }; asOf: string; issuedAt: string;
  supersededBy?: string; hiddenAt?: string; hiddenReason?: string;   // 대체(다른 사업으로 넘어감)·숨김(대응 사업 없음) — scripts/issue-projects.js --home
};

/* data/board/ledger-board.json(tools/ledger/board.js 가 사업 원장 표에서 만든다). 시점 0 = months[0], 단계 6칸 = ①계획 … ⑥입주 */
type Judged = { projects: number; units: number };
type CandJudged = { ok: Judged; caution: Judged; delay: Judged };
/* HOME 규칙 집계(data/board/home-board.json, tools/ledger/home-board.js — 2026-10-21 결정: 종합상황판은 HOME 정책 추진현황과 같은 조건·같은 표기)의 추가 값 */
export type HomeExtra = {
  policyId: string; targetUnits: number | null;   // 시도 묶음 = HOME 지역 배분 목표(plan.region_allocations, 없으면 null)
  cards: Record<string, { target?: number; current?: number | null; measured_on?: string | null; year_end_expected?: number | null; plan_date?: string | null; remainder?: number | null }>;
  delayMax: number; warningMax: number; axisMax: number;
  stageGaps: { stage: string; label: string; status: string; gap: number; rate: string }[];
  bottleneck: { stage: string; label: string; status: string; gap: number; rate: string } | null;
  stageShort?: Record<string, { rows: { id: string; short: number }[]; over: number }>;   // 단계 부족 사업(단계 부족량 = 부족 합 − over) — 병목·일정 지연 카드의 목록 창
  supplyUpcoming: { total: number; projects: number; from: string; to: string };
  monthly: { month: string; APPROVAL: number | null; CONSTRUCTION: number | null; SUPPLY: number | null; COMPLETION: number | null }[];
  mapSupply: Record<string, { supplyReached: number; delayed: boolean; delayNote: string }>;
};
export type LedgerBoard = {
  schema: string; observedMonth: string; referenceDate: string;
  stageNames?: string[];                                                    // 리본 6칸 이름(HOME 집계: 정책·사업화·인허가·건설·공급·입주). 없으면 sample.ts K
  home?: HomeExtra;
  judge: { cautionMonths: number; delayMonths: number; rule?: string };
  scope: { projects: number; issued: number; candidates: number; judged: number; candidateJudged?: number; units: number; coverage?: string; areaName?: string; bySource?: { issued: number; lhCandidates: number; hubBulkCandidates: number; home?: number }; renewal?: { projects: number; units: number } };
  months: string[]; now: number; stageUnits: number[][]; stageProjects: number[][];
  actualThrough?: string; actualIndex?: number; actualSource?: string | null;   // 실제 날짜가 있는 마지막 달(호수가 가장 많은 원천의 자료 달). 그 뒤 달은 예정으로 다시 만든 값. 없으면(옛 집계) 기준 달까지 실제
  /* ok·caution·delay = 판정(사업 번호가 있는 사업만), candidate = 번호가 없는 후보의 같은 계산(확인 필요, 2026-10-15 결정 D3 — 없으면 옛 집계: 후보 포함 판정) */
  judgment: { ok: Judged; caution: Judged; delay: Judged; candidate?: CandJudged & { reason: string }; excluded: Judged & { reason: string }; excludedStartOverdue?: Judged & { pairs: number; reason: string } };
  delayByStage: number[]; cautionByStage: number[];
  regions: { code: string; name: string; projects: number; units: number; judged: number; ok: number; caution: number; delay: number; delayUnits: number; cautionUnits: number; okUnits?: number; homeDelay?: string | null; candidate?: { judged: number; ok: number; caution: number; delay: number } }[];
  agencies: { id: string; name: string; projects: number; units: number; ok: number; caution: number; delay: number; okUnits: number; cautionUnits: number; delayUnits: number; excludedUnits: number; candidateUnits?: number; note: string | null; delayedSharePct?: number }[];
  upcoming: { ym: string; units: number; projects: number }[];
  overdue: { id: string; name: string; sgg: string; eventType: string; planned: string; months: number; class: string }[];
  /* 월 판정 이력(data/board/judgment-history.json, tools/ledger/trend.js) 중 기준 달 앞 행 + 이번 달 행. 없으면(옛 집계) 기준 달만 판정 */
  trend?: { month: string; referenceDate: string; edition: string | null; basis: 'BACKFILL' | 'OBSERVED'; ok: Judged; caution: Judged; delay: Judged; candidate?: CandJudged; delayByStage: number[]; cautionByStage: number[]; judged: number; addedSources?: string[]; excludedStartOverdue?: Judged & { pairs: number }; max?: { d: number; w: number } }[];
  /* 시도별 HOME 집계(2026-10-21 사용자 결정 — 종합상황판 지역 탭 수도권 전체·서울·경기·인천, home-board.js homeBoards): 같은 계산을 HOME 지역 범위로. 시도 타일(regions)은 전체 집계 것만 */
  byRegion?: Record<string, Omit<LedgerBoard, 'regions' | 'byRegion'>>;
};
