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
};

/* data/board/ledger-board.json(tools/ledger/board.js 가 사업 원장 표에서 만든다). 시점 0 = 2025-01, 단계 6칸 = ①계획 … ⑥입주 */
type Judged = { projects: number; units: number };
export type LedgerBoard = {
  schema: string; observedMonth: string; referenceDate: string;
  judge: { cautionMonths: number; delayMonths: number; rule?: string };
  scope: { projects: number; issued: number; candidates: number; judged: number; units: number; coverage?: string; bySource?: { issued: number; lhCandidates: number; hubBulkCandidates: number } };
  months: string[]; now: number; stageUnits: number[][]; stageProjects: number[][];
  judgment: { ok: Judged; caution: Judged; delay: Judged; excluded: Judged & { reason: string }; excludedStartOverdue?: Judged & { pairs: number; reason: string } };
  delayByStage: number[]; cautionByStage: number[];
  regions: { code: string; name: string; projects: number; units: number; judged: number; ok: number; caution: number; delay: number; delayUnits: number; cautionUnits: number }[];
  agencies: { id: string; name: string; projects: number; units: number; ok: number; caution: number; delay: number; okUnits: number; cautionUnits: number; delayUnits: number; excludedUnits: number; note: string | null }[];
  upcoming: { ym: string; units: number; projects: number }[];
  overdue: { id: string; name: string; sgg: string; eventType: string; planned: string; months: number; class: string }[];
};
