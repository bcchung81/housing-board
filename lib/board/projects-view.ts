/* 사업 화면(/projects — 목록·상세 서랍 ?id=·월간 보고 ?print=1)의 순수 계산. 파일을 읽지 않고 인자로 받아 Node 시험이 그대로 부른다(tests/js/projects-view.test.cjs).
   자료 읽기는 lib/board/projects-index.ts. 렌즈 = 정책(?policy=97|129|813) 또는 프로그램(?program=이름) 하나, 거르기 = 시도·시군구·단계(리본 칸 0~5)·상태·기관.
   시안: docs/design/home-concept/projects.html · assets/app.js(2026-10-14 승인). */

export type Cls = 'ok' | 'caution' | 'delay';
/* 상태 = 판정(cls) + 장기 지연(지연 중 경과 12개월 이상) + 일정 없음 */
export type Status = Cls | 'long' | 'none';
/* 상태 거르기: 상태 하나 또는 '점검 필요'(주의·지연·장기 지연, 지연 개월 큰 순) */
export type StatusFilter = Status | 'check';
export type LinkStatus = 'CONFIRMED' | 'REVIEW_REQUIRED';
/* 지도 색인 행(data/board/ledger-map.json · tools/ledger/board.js mapIndexFromLedger) */
export type MapRow = {
  id: string; name: string | null; issued: boolean; stage: string; cls: Cls | null; why: string | null;
  overdue: { eventType: string; planned: string; months: number } | null; next: { eventType: string; planned: string } | null; done?: string; units: number;
  /* 건축HUB 관리번호(공개 범위 미결 — 화면에는 값 없이 '건축HUB 인허가에서 온 사업'인지만 쓴다) */
  pks?: string[];
};
/* projects-index.json 의 사업별 덧붙임(tools/ledger/projects-index.js): reached = 원천 실제 기록이 있는 리본 칸(1~5), completion = 준공 현재 예정 달(준공 실제 없을 때) */
export type IndexExtra = { notice?: number; programs?: string[]; policies?: string[]; link?: LinkStatus; agency?: string; reached?: number[]; completion?: string };
export type Policy = { id: string; key: string; short: string; name: string; announced: string; scope: string };
export type Program = { name: string; policies: string[]; projects: number };
export type ProjectRow = Omit<MapRow, 'name'> & {
  name: string; sgg: string; sggName: string; notice: number | null; programs: string[]; policies: string[]; link: LinkStatus | null;
  agency: string | null; reached: number[]; completion: string | null; board: number;
};

/* 공식 6단계 → 종합상황판 리본 칸(①계획 ②인허가 ③착공 ④모집 ⑤준공 ⑥입주)의 색. 01·02 는 ①, 06 은 ⑤(준공 = 사용검사, tools/ledger/board.js BOARD_OF_STAGE) */
export const BOARD_NAMES = ['계획', '인허가', '착공', '모집', '준공', '입주'] as const;
export const BOARD_CIR = ['①', '②', '③', '④', '⑤', '⑥'] as const;
export const BOARD_COLOR = ['var(--st-plan)', 'var(--st-permit)', 'var(--st-build)', 'var(--st-sale)', 'var(--st-soon)', 'var(--st-move)'] as const;
export const BOARD_INK = ['var(--st-plan-ink)', 'var(--st-permit-ink)', 'var(--st-build-ink)', 'var(--st-sale-ink)', 'var(--st-soon-ink)', 'var(--st-move-ink)'] as const;
/* 리본 칸의 공식 단계(칸 title) */
export const BOARD_OFFICIAL = ['01 정책 · 02 사업화', '03 인허가', '04 건설(착공~준공 공사 기간)', '05 공급', '04 건설 끝(사용검사)', '06 입주'] as const;
export const BOARD_OF_STAGE: Record<string, number> = { '01': 0, '02': 0, '03': 1, '04': 2, '05': 3, '06': 4 };
export const stageColor = (code: string) => BOARD_COLOR[BOARD_OF_STAGE[code] ?? 0];
/* 원장 단계 사건 → 리본 칸 */
export const BOARD_OF_EVENT: Record<string, number> = { PERMIT: 1, CONSTRUCTION_START: 2, SUPPLY_NOTICE: 3, COMPLETION: 4, MOVE_IN: 5 };
export const EVENT_NAME: Record<string, string> = { PERMIT: '인허가', CONSTRUCTION_START: '착공', SUPPLY_NOTICE: '모집공고', COMPLETION: '준공', MOVE_IN: '입주' };

/* 판정 규칙: 주의 1~6개월, 지연 6개월 이상(tools/ledger/board.js JUDGE), 장기 지연 12개월 이상(시안 build-data.mjs LONG_DELAY_MONTHS) */
export const LONG_DELAY_MONTHS = 12;
export const STATUS_NAME: Record<Status, string> = { ok: '정상', caution: '주의', delay: '지연', long: '장기 지연', none: '일정 없음' };
export const STATUS_TIP: Record<Status, string> = { ok: '현재 예정일이 지나지 않음', caution: '현재 예정일 경과 1~6개월', delay: '현재 예정일 경과 6~12개월', long: '현재 예정일 경과 12개월 이상', none: '판정할 현재 예정일이 없음' };
export const STATUS_ORDER: Status[] = ['ok', 'caution', 'delay', 'long', 'none'];
/* 구간 이름(칩 메뉴·보조 줄): '지연'은 묶음(지연 + 장기, 경과 6개월 이상)에만 '지연(장기 포함)'으로 쓰고, 구간은 개월을 붙여 구분한다 */
export const STATUS_RANGE: Record<Status, string> = { ok: '정상', caution: '주의 1~6개월', delay: '지연 6~12개월', long: '장기 12개월+', none: '일정 없음' };
export const DELAY_GROUP = '지연(장기 포함)';
export const statusOf = (r: { cls: Cls | null; overdue: { months: number } | null }): Status =>
  r.cls === 'delay' ? (r.overdue && r.overdue.months >= LONG_DELAY_MONTHS ? 'long' : 'delay') : r.cls ?? 'none';
export const isCheck = (r: ProjectRow) => r.cls === 'caution' || r.cls === 'delay';
/* 지연 개월: 주의·지연(장기 포함) 사업의 현재 예정일 경과 개월, 아니면 null */
export const lateOf = (r: ProjectRow) => (isCheck(r) && r.overdue ? r.overdue.months : null);

/* 정책 이름: 화면에는 '9·7 대책'처럼 짧은 이름 + '대책'(정책 코드만 내지 않는다) */
export const policyLabel = (p: { short: string }) => `${p.short} 대책`;
/* 기본 범위 = 수도권(서울·인천·경기). 지도·HOME 자료가 있는 세 시도 */
export const METRO_SIDO = ['11', '28', '41'];
export const isMetro = (sgg: string) => METRO_SIDO.includes(sgg.slice(0, 2));

/* 주소 글자('경기도 성남시 수정구 창곡동 …') → 시군구 코드: 그 시도의 시군구 이름 중 주소 앞에 붙는 가장 긴 것(LH 준공 예정 블록 → 지도 시군구). 없으면 null */
export function sggOfAddress(address: string, sido: string, sggNames: Record<string, string | null>): string | null {
  let best: [string, number] | null = null;
  for (const [code, name] of Object.entries(sggNames)) if (name && code.startsWith(sido) && address.startsWith(`${name} `) && (!best || name.length > best[1])) best = [code, name.length];
  return best ? best[0] : null;
}

/* 기관: 원장 agency_id → 칩·열 이름. LH·SH·GH 밖(지자체·국방부·미연결)은 '기타' */
export const AGENCY_NAME: Record<string, string> = { lh: 'LH', sh: 'SH', gh: 'GH', etc: '기타' };
export const AGENCY_TIP: Record<string, string> = { lh: '한국토지주택공사', sh: '서울주택도시공사', gh: '경기주택도시공사', etc: '시행 기관 미확인(원천에 기관 없음) 또는 LH·SH·GH 밖' };
export const agencyKey = (id: string | null) => (id && id in AGENCY_NAME && id !== 'etc' ? id : 'etc');

/* 날짜 글자: 'YYYY-MM-DD'·'YYYY-MM' → 'YYYY.MM', 'YYYY' 는 그대로 */
export const ymText = (d: string) => (d.length >= 7 ? `${d.slice(0, 4)}.${d.slice(5, 7)}` : d);
/* 자료 판 이름 '20261014T102506Z' → '2026.10.14'(화면에 판 번호를 내지 않는다) */
export const editionText = (ed: string) => { const m = /^(\d{4})(\d{2})(\d{2})/.exec(ed); return m ? `${m[1]}.${m[2]}.${m[3]}` : ed; };
export const dayText = (d: string | null | undefined) => (d ? d.slice(0, 10).replace(/-/g, '.') : '');
/* 달 번호(연 × 12 + 월 − 1). 연도만 있으면 그해 12월(원장 monthOf 와 같다) */
export const monthNo = (d: string) => Number(d.slice(0, 4)) * 12 + (d.length >= 7 ? Number(d.slice(5, 7)) - 1 : 11);
const ymOfNo = (n: number) => `${Math.floor(n / 12)}.${String((n % 12) + 1).padStart(2, '0')}`;
/* 'YYYY-MM' 에서 n 달 뒤 */
export const addMonths = (ym: string, n: number) => { const k = monthNo(ym) + n; return `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`; };
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/* ---------- 목록 행 ---------- */
export function rowsOf(bySgg: Record<string, MapRow[]>, extra: Record<string, IndexExtra>, sggNames: Record<string, string | null>): ProjectRow[] {
  const out: ProjectRow[] = [];
  for (const [sgg, rows] of Object.entries(bySgg)) for (const r of rows) {
    const x = extra[r.id] ?? {};
    out.push({ ...r, name: r.name ?? r.id, sgg, sggName: sggNames[sgg] ?? sgg, notice: x.notice ?? null, programs: x.programs ?? [], policies: x.policies ?? [], link: x.link ?? null,
      agency: x.agency ?? null, reached: x.reached ?? [], completion: x.completion ?? null, board: BOARD_OF_STAGE[r.stage] ?? 0 });
  }
  return out.sort((a, b) => a.sgg.localeCompare(b.sgg) || b.stage.localeCompare(a.stage) || a.name.localeCompare(b.name, 'ko'));
}

/* ---------- 거르기 ---------- */
/* metro = 수도권(서울·인천·경기). 지역 거르기가 하나도 없으면 전국 */
export type Filters = { policy?: Policy; program?: Program; sido?: string; sgg?: string; metro?: boolean; stage?: number; status?: StatusFilter; agency?: string };
/* 종합상황판·옛 주소가 거는 거르기(?stage·?status·?agency). 지역 없이 이것만 오면 전국(종합상황판 숫자가 전국이라) — 그 밖에 지역이 없으면 기본 범위 수도권 */
const LEGACY_KEYS = ['stage', 'status', 'agency'] as const;
type Query = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);
/* 맞지 않는 값은 거르지 않는다. 렌즈는 하나: 정책이 있으면 프로그램은 무시. 단계는 리본 칸 0~5, 옛 주소의 공식 단계 01~06(/stage/NN·종합상황판·계단)은 그 칸으로.
   지역: ?sgg=NNNNN > ?sido=NN > ?sido=all(전국) > ?sido=metro(수도권). 지역이 없으면 기본 수도권 — 단 ?stage·?status·?agency 만 온 주소(종합상황판 링크)는 전국 */
export function parseFilters(q: Query, ctx: { policies: Policy[]; programs: Program[]; sidoOk: (code: string) => boolean }): Filters {
  const f: Filters = {};
  const policy = ctx.policies.find((p) => p.key === one(q.policy));
  if (policy) f.policy = policy;
  else { const program = ctx.programs.find((p) => p.name === one(q.program)); if (program) f.program = program; }
  const sgg = one(q.sgg), sido = one(q.sido);
  if (sgg && /^\d{5}$/.test(sgg) && ctx.sidoOk(sgg.slice(0, 2))) f.sgg = sgg;
  else if (sido && /^\d{2}$/.test(sido) && ctx.sidoOk(sido)) f.sido = sido;
  else if (sido === 'metro' || (sido !== 'all' && !LEGACY_KEYS.some((k) => q[k] !== undefined))) f.metro = true;
  const stage = one(q.stage);
  if (stage && /^[0-5]$/.test(stage)) f.stage = Number(stage);
  else if (stage && /^0[1-6]$/.test(stage)) f.stage = BOARD_OF_STAGE[stage];
  const status = one(q.status);
  if (status && (status in STATUS_NAME || status === 'check')) f.status = status as StatusFilter;
  const agency = one(q.agency);
  if (agency && agency in AGENCY_NAME) f.agency = agency;
  return f;
}
export const inLens = (r: ProjectRow, f: Filters) => (f.policy ? r.policies.includes(f.policy.key) : f.program ? r.programs.includes(f.program.name) : true);
export const inRegion = (r: ProjectRow, f: Filters) => (f.sgg ? r.sgg === f.sgg : f.sido ? r.sgg.startsWith(f.sido) : f.metro ? isMetro(r.sgg) : true);
export const inAgency = (r: ProjectRow, f: Filters) => !f.agency || agencyKey(r.agency) === f.agency;
export const statusOk = (r: ProjectRow, st: StatusFilter | undefined) => !st || (st === 'check' ? isCheck(r) : statusOf(r) === st);
/* 범위 = 렌즈 × 지역 × 기관(핵심 질문은 상태·단계 칩과 상관없이 이 범위로 센다) */
export const scopeOf = (rows: ProjectRow[], f: Filters) => rows.filter((r) => inLens(r, f) && inRegion(r, f) && inAgency(r, f));
/* skip: 그 거르기만 빼고 */
export function applyFilters(rows: ProjectRow[], f: Filters, skip?: 'stage' | 'status') {
  return scopeOf(rows, f).filter((r) => (skip === 'stage' || f.stage === undefined || r.board === f.stage) && (skip === 'status' || statusOk(r, f.status)));
}
/* 목록 순서(기본): 번호가 있는 사업 먼저, 후보 사업(원천 예정이라 확인 필요)은 뒤에 — 그 안에서 점검 필요 순(지연 개월 큰 순, 같으면 호수 큰 순), 경과 없는 사업은 원래 순서로 뒤에.
   판정·상태·지연 건수는 그대로이고 순서만 나눈다(2026-10-15 사용자 결정). 열 머리로 정렬을 바꾸면 그 정렬을 따른다(그리드) */
export const listOrder = (rows: ProjectRow[]) => [...rows].sort((a, b) => Number(!a.issued) - Number(!b.issued) || (lateOf(b) ?? -1) - (lateOf(a) ?? -1) || (lateOf(a) === null ? 0 : b.units - a.units));

/* 거르기 주소: 열쇠 순서를 고정한다. patch 의 undefined 는 그 거르기를 푼다. 렌즈(policy·program)는 하나, 시도를 고르면 시군구가 풀리고 시군구를 고르면 시도가 풀린다.
   지역 sido: 'NN' · 'metro'(수도권) · 'all'(전국). 지역이 비면 기본 수도권 — 'metro' 는 ?stage·?status·?agency 가 함께 있을 때만 적는다(없으면 기본과 같아 뺀다) */
const KEYS = ['policy', 'program', 'sido', 'sgg', 'stage', 'status', 'agency', 'id', 'cand', 'print'] as const;
type Plain = Partial<Record<(typeof KEYS)[number], string>>;
export const plainOf = (f: Filters): Plain => ({ policy: f.policy?.key, program: f.program?.name, sido: f.sgg ? undefined : f.sido ?? (f.metro ? 'metro' : 'all'), sgg: f.sgg, stage: f.stage === undefined ? undefined : String(f.stage), status: f.status, agency: f.agency });
export function listHref(f: Filters, patch: Plain = {}) {
  const v: Plain = { ...plainOf(f), ...patch };
  if ('policy' in patch && patch.policy) v.program = undefined;
  if ('program' in patch && patch.program) v.policy = undefined;
  if ('sido' in patch && !('sgg' in patch)) v.sgg = undefined;
  if ('sgg' in patch && patch.sgg) v.sido = undefined;
  if (v.sgg || (v.sido === 'metro' && !LEGACY_KEYS.some((k) => v[k]))) v.sido = undefined;
  const q = new URLSearchParams();
  for (const k of KEYS) if (v[k]) q.set(k, v[k]!);
  const s = q.toString();
  return s ? `/projects?${s}` : '/projects';
}

/* ---------- 요약 ---------- */
export function summaryOf(rows: ProjectRow[]) {
  const units = rows.reduce((s, r) => s + r.units, 0), notice = rows.reduce((s, r) => s + (r.notice ?? 0), 0);
  return {
    n: rows.length, units, notice, noticeProjects: rows.filter((r) => r.notice != null).length,
    delay: rows.filter((r) => r.cls === 'delay').length, review: rows.filter((r) => r.link === 'REVIEW_REQUIRED').length, confirmed: rows.filter((r) => r.link === 'CONFIRMED').length,
    noticeRatio: units ? notice / units * 100 : null, noUnits: rows.filter((r) => !(r.units > 0)).length,
  };
}

/* ---------- 단계 파이프라인: 칸마다 그 단계를 거쳐 간 사업 수·그 계획 호수. 기록이 없는 칸은 접는다 ---------- */
/* 칸의 두 숫자: 거쳐 간 n = 그 단계 실제 기록이 있거나(①은 계획 호수가 있거나) 지금 그 단계인 사업(누적, 큰 숫자·막대) · 지금 now = 지금 그 단계인 사업(칸을 누르면 거르는 기준).
   지금 그 단계인 사업은 그 단계에 들어와 있으므로 거쳐 간 사업에 넣는다 — 실제 기록 없이 단계만 올라간 사업(예: 준공 실제 없이 06 인 사업) 때문에 지금 > 거쳐 간 이 되던 것을 막는다(불변식 now ≤ n) */
export const reachedAt = (r: ProjectRow, i: number) => r.board === i || (i === 0 ? r.units > 0 : r.reached.includes(i));
export type PipeCell = { i: number; n: number; units: number; share: number; now: number };
export function pipelineOf(rows: ProjectRow[]) {
  const cells: PipeCell[] = BOARD_NAMES.map((_, i) => {
    const hit = rows.filter((r) => reachedAt(r, i));
    return { i, n: hit.length, units: hit.reduce((s, r) => s + r.units, 0), share: rows.length ? hit.length / rows.length * 100 : 0, now: rows.filter((r) => r.board === i).length };
  });
  const open = (c: PipeCell) => c.n > 0 || c.now > 0;
  return { total: rows.length, open: cells.filter(open), shut: cells.filter((c) => !open(c)).map((c) => c.i) };
}

/* ---------- 병목: 종합상황판 카드·리본·사업 핵심 질문이 함께 쓰는 한 계산 ---------- */
/* 단계별 지연 호수 = 지연(현재 예정일 경과 6개월 이상, 장기 지연 포함) 사업의 계획 호수를 지금 단계(리본 칸)별로 더한 값 — 원장 집계 delayByStage 와 같다 */
export function delayByStageOf(rows: { cls: Cls | null; board: number; units: number }[]): number[] {
  const out = [0, 0, 0, 0, 0, 0];
  for (const r of rows) if (r.cls === 'delay') out[r.board] += r.units;
  return out;
}
/* 병목 = 지연 호수가 가장 큰 단계(같으면 앞 단계). 지연 호수가 하나도 없으면 null */
export function bottleneckOf(byStage: number[]): { i: number; units: number } | null {
  const i = byStage.reduce((b, v, k) => (v > byStage[b] ? k : b), 0);
  return byStage[i] > 0 ? { i, units: byStage[i] } : null;
}

/* ---------- 정책 단계별 목표 대비 확인(data/board/policy-progress.json · samePeriod) ---------- */
/* actual = 확인(담당자 추정 입력을 뺀 사건), actualWithEstimates = 추정 포함(HOME 화면 값). gap·status 는 확인 기준(tools/ledger/policy-progress.js) */
export type SamePeriod = { year: number; from: string; through: string; target: number | null; actual: number | null; actualWithEstimates?: number | null; actualThrough: string | null; actualReviewUnits: number | null; gap: number | null; shortfallPct: number | null; status: string };
export type PolicyProgress = {
  schema: string; asOf: string; referenceMonthEnd: string; source: { edition: string; rule: string };
  policies: { policyId: string; name: string; periodStart: string; periodEnd: string; targetUnits: number; basis: Record<string, unknown> & { rule: string; linkedProjects: number };
    stages: Record<string, { label: string; targetBasis: string; actualBasis: string; samePeriod: SamePeriod[]; targetPoints?: { date: string; units: number }[] }> }[];
  notes: string[];
};
/* HOME 의 6단계 → 리본 칸: 사업화 ①계획 · 인허가 ② · 착공 ③ · 공급(분양·모집) ④ · 준공 ⑤ · 입주 예정 ⑥ */
export const PP_STAGES = ['BUSINESS', 'APPROVAL', 'CONSTRUCTION', 'SUPPLY', 'COMPLETION', 'MOVE_IN'] as const;
/* state: short 목표 미달 · met 목표 이상 · noTarget 목표 없음(확인 값만) · noActual 확인 미확보(목표만) · none 둘 다 없음.
   withEst = 추정 포함 확인(없으면 확인과 같다), yearEnd = 같은 기간 목표가 없고 다음 목표 점이 연말인 착공(9·7 원문 연도별 목표) */
export type StageCell = { board: number; key: string; label: string; target: number | null; actual: number | null; withEst: number | null; review: number | null; gap: number | null; shortfallPct: number | null;
  status: string; state: 'short' | 'met' | 'noTarget' | 'noActual' | 'none'; from: string; through: string; actualThrough: string | null; fill: number; estFill: number;
  targetBasis: string; actualBasis: string; yearEnd: { date: string; units: number } | null };
export function policyStageCells(pp: PolicyProgress, policyId: string): StageCell[] | null {
  const pol = pp.policies.find((p) => p.policyId === policyId);
  if (!pol) return null;
  const year = Number(pp.referenceMonthEnd.slice(0, 4));
  return PP_STAGES.map((key, board) => {
    const st = pol.stages[key];
    const s = st?.samePeriod.find((y) => y.year === year);
    const target = s?.target ?? null, actual = s?.actual ?? null, withEst = s?.actualWithEstimates ?? actual;
    const state = target != null && actual != null ? (s!.status === 'GAP' ? 'short' : 'met') : target == null && actual != null ? 'noTarget' : target != null ? 'noActual' : 'none';
    const after = target == null ? (st?.targetPoints ?? []).find((t) => t.date > pp.referenceMonthEnd) : undefined;
    return {
      board, key, label: st?.label ?? key, target, actual, withEst, review: s?.actualReviewUnits ?? null, gap: s?.gap ?? null, shortfallPct: s?.shortfallPct ?? null, status: s?.status ?? 'NONE', state,
      from: s?.from ?? `${year}-01-01`, through: s?.through ?? pp.referenceMonthEnd, actualThrough: s?.actualThrough ?? null,
      fill: target && actual != null ? Math.min(100, actual / target * 100) : 0, estFill: target && withEst != null ? Math.min(100, withEst / target * 100) : 0,
      targetBasis: st?.targetBasis ?? '', actualBasis: st?.actualBasis ?? '',
      yearEnd: key === 'CONSTRUCTION' && after && after.date.endsWith('-12-31') ? { date: after.date, units: after.units } : null,
    };
  });
}
export const hasTarget = (c: StageCell | undefined) => !!c && (c.target != null || !!c.yearEnd);
/* 추정이 섞여 확인과 다른 칸 */
export const hasEstimate = (c: StageCell) => c.withEst != null && c.actual != null && c.withEst > c.actual;
/* 확인 대비 목표 비율 글자: 미달은 '부족 n%'(확인 기준), 목표를 넘으면 '초과 n%', 같으면 '100% 달성' */
export function rateOf(c: StageCell): { value: string; unit: string; word: string } {
  if (c.state === 'short') return { value: String(c.shortfallPct), unit: '% 부족', word: `부족 ${c.shortfallPct}%` };
  const over = c.target && c.actual != null ? Math.round((c.actual / c.target - 1) * 1000) / 10 : 0;
  return over > 0 ? { value: String(over), unit: '% 초과', word: `초과 ${over}%` } : { value: '100', unit: '% 달성', word: '달성' };
}
/* 칸 설명(title): 확인·추정 포함/목표·부족·기간·확인 필요 연결 */
export function stageCellTip(c: StageCell, polName = '') {
  const span = `${ymText(c.from)}~${ymText(c.through)}`;
  const head = `${polName ? `${polName} ` : ''}${BOARD_CIR[c.board]} ${BOARD_NAMES[c.board]} — HOME 단계 '${c.label}' · ${span}`;
  if (c.state === 'none' && !c.yearEnd) return `${head} · 목표 없음 · 확인 미확보`;
  const est = hasEstimate(c) ? ` · 추정 포함 ${fmt(c.withEst!)}호(담당자 추정 입력 ${fmt(c.withEst! - c.actual!)}호)` : '';
  const act = c.actual != null ? `확인 ${fmt(c.actual)}호${c.actualThrough && c.actualThrough !== c.through ? `(${ymText(c.actualThrough)}까지)` : ''}${c.review ? ` — 확인 필요 연결 ${fmt(c.review)}호 포함` : ''}${est}` : `확인 미확보(${c.actualBasis})`;
  const tgt = c.target != null ? `목표 ${fmt(c.target)}호` : c.yearEnd ? `같은 기간 목표 없음 · 연말 목표 ${dayText(c.yearEnd.date)} ${fmt(c.yearEnd.units)}호` : '목표 없음';
  const gap = c.state === 'short' && c.gap != null ? ` · 부족 ${fmt(c.gap)}호(${c.shortfallPct}%)` : '';
  return `${head} · ${act} / ${tgt}${gap} · 목표: ${c.targetBasis} · 확인: ${c.actualBasis}`;
}
/* 목표 대비 줄: 렌즈 '전체'면 목표가 배정된 정책 모두, 정책 렌즈면 그 정책 하나(목표가 없으면 없음). 칸은 목표가 있는 단계만, 나머지는 '목표 미배정' 한 번 */
export type CompareLine = { policy: Policy; cells: StageCell[]; none: number[]; n: number; units: number; review: number; confirmed: number };
/* 접힌 '정책 목표 대비' 머리의 한 줄: 부족률 숫자 없이 목표가 있는 단계 수와 부족한 단계 이름만(단계별 비율은 핵심 질문 첫 칸·펼친 칸에 — 같은 화면에 이름표 없는 부족률이 둘 나오지 않게) */
export function compareHead(l: CompareLine) {
  const tgt = l.cells.filter((c) => c.target != null), short = tgt.filter((c) => c.state === 'short');
  if (!tgt.length) return `${l.policy.short} 목표만 있음`;
  return short.length ? `${l.policy.short} · 목표 있는 ${tgt.length}단계 중 ${short.length}단계 부족(${short.map((c) => `${BOARD_CIR[c.board]}${BOARD_NAMES[c.board]}`).join('·')})` : `${l.policy.short} · 목표 있는 ${tgt.length}단계 모두 달성`;
}
export function compareLines(pp: PolicyProgress, policies: Policy[], rows: ProjectRow[], keys: string[]): CompareLine[] {
  return policies.filter((p) => keys.includes(p.key)).flatMap((policy) => {
    const cells = policyStageCells(pp, policy.id);
    if (!cells || !cells.some(hasTarget)) return [];
    const set = rows.filter((r) => r.policies.includes(policy.key)), s = summaryOf(set);
    return [{ policy, cells, none: cells.filter((c) => !hasTarget(c)).map((c) => c.board), n: s.n, units: s.units, review: s.review, confirmed: s.confirmed }];
  });
}

/* '앞으로 12개월'의 두 이름: 준공만(사업 핵심 질문·종합상황판) · 모집·준공·입주(지역 공급). 범위는 둘 다 원장 관측 달부터 12개월 */
export const AHEAD_COMPLETION = '앞으로 12개월 준공 예정';
export const AHEAD_ALL = '앞으로 12개월 모집·준공·입주 예정';
export const aheadMonths = (observedMonth: string) => Array.from({ length: 12 }, (_, i) => addMonths(observedMonth, i));

/* ---------- 핵심 질문 5(시안 app.js questions): 렌즈·지역·기관 범위로 다시 센다(상태·단계 칩과 상관없음) ---------- */
/* help: ⓘ 에 여는 쉬운 말 정의(전문용어 없이). 범위가 다른 첫 칸(정책 목표 대비)은 이름에 범위를 넣는다.
   stages: 첫 칸(정책 목표 대비)은 대표 단계 하나 대신 ①~⑥ 단계마다 확인/목표·비율(접힌 '정책 목표 대비'의 그 정책 행과 같은 policyStageCells) — 있으면 value·unit·sub 대신 그린다 */
export type Question = { q: string; value: string; unit: string; sub: string; tip: string; help: string; href?: string; tone?: 'bad'; ink?: string; muted?: boolean; stages?: StageCell[] };
export type QuestionCtx = { pp: PolicyProgress; policies: Policy[]; observedMonth: string; sidoName: (code: string) => string; sggName: (code: string) => string };
export function questionsOf(rows: ProjectRow[], f: Filters, ctx: QuestionCtx): Question[] {
  const scope = scopeOf(rows, f), Q: Question[] = [];
  /* ① 정책 목표 대비(정책 전체 — 이름에 범위): 정책 렌즈(전체면 9·7)의 같은 기간 목표·확인이 함께 있는 첫 칸. 없으면(목표 없는 렌즈) '계획대로 가고 있는가' = 판정 사업 중 정상 비율 */
  const pk = f.policy ? f.policy.key : f.program ? null : '97';
  const pol = pk ? ctx.policies.find((p) => p.key === pk) : undefined;
  const cells = pol ? policyStageCells(ctx.pp, pol.id) : null;
  const pair = cells?.find((c) => c.target != null && c.actual != null);
  if (pol && pair) {
    const short = pair.state === 'short', i = pair.board, r = rateOf(pair);
    Q.push({ q: `${policyLabel(pol)} 목표 대비(정책 전체)`, href: !f.policy ? listHref(f, { policy: pk! }) : undefined, tone: short ? 'bad' : undefined,
      value: r.value, unit: r.unit, stages: cells!,
      sub: `${BOARD_CIR[i]}${BOARD_NAMES[i]} 확인 ${fmt(pair.actual!)} / 목표 ${fmt(pair.target!)}`,
      tip: `${pol.name} 단계별 목표 대비 확인(${ymText(pair.from)}~${ymText(pair.through)}) · 정책 전체 범위(위 지역·기관 거르기와 상관없음) · 부족·초과·비율은 확인으로만 계산${cells!.some(hasEstimate) ? ` · 담당자 추정 포함(확인과 따로): ${cells!.filter(hasEstimate).map((c) => `${BOARD_CIR[c.board]}${BOARD_NAMES[c.board]} ${fmt(c.withEst!)}호`).join(' · ')}` : ''} · 누르면 이 정책의 사업`,
      help: `${policyLabel(pol)}이 올해 1월부터 단계마다 세운 목표 집 수(호)와, 실제 기록으로 확인한 집 수를 단계별로 나란히 보입니다. 줄마다 '확인 / 목표'와 모자라면 부족 %, 넘치면 초과 %입니다. 목표를 정하지 않은 단계는 '목표 없음'입니다. 정책 전체 숫자라 위에서 고른 지역·기관과 상관없습니다.` });
  } else {
    const judged = scope.filter((r) => r.cls);
    if (judged.length) {
      const ok = judged.filter((r) => r.cls === 'ok').length;
      Q.push({ q: '계획대로 가고 있는가', href: listHref(f, { status: 'ok' }), value: String(Math.round(ok / judged.length * 100)), unit: '% 정상',
        sub: `판정 ${fmt(judged.length)}건 · 일정 없음 ${fmt(scope.length - judged.length)}`, tip: '단계 목표가 없는 범위라 현재 예정일을 지키는 사업 비율로 답함 · 판정 사업 중 정상(경과 없음)',
        help: '예정일을 아직 넘기지 않은 사업의 비율입니다. 예정일이 없는 사업은 빼고 셉니다.' });
    }
  }
  /* ② 어디서 막혀: 병목(지연 호수가 가장 큰 단계 — 종합상황판 '병목' 카드와 같은 계산 bottleneckOf) */
  const late = scope.filter(isCheck);
  const byStage = delayByStageOf(scope), neck = bottleneckOf(byStage);
  Q.push({ q: '어디서 막혀 있는가', href: neck ? listHref(f, { stage: String(neck.i), status: 'check' }) : undefined, ink: neck ? BOARD_INK[neck.i] : undefined, muted: !neck,
    value: neck ? `${BOARD_CIR[neck.i]} ${BOARD_NAMES[neck.i]}` : '없음', unit: '', sub: neck ? `병목 · ${DELAY_GROUP} ${fmt(neck.units)}호` : '지연 사업 없음',
    tip: `병목 = ${DELAY_GROUP} 호수(현재 예정일 경과 6개월 이상 사업의 계획 호수)가 가장 큰 단계 · 종합상황판 병목과 같은 계산 · ${byStage.map((v, i) => `${BOARD_CIR[i]} ${fmt(v)}`).join(' · ')}`,
    help: '예정일을 6개월 넘게 넘긴 사업이 가장 많이(호수 기준) 멈춰 있는 단계입니다.' });
  /* ③ 어떤 사업이 늦어지는가: 지연(장기 포함) 건수 = 지연 6~12개월 + 장기 12개월+(주의는 넣지 않는다) */
  const n = (s: Status) => late.filter((r) => statusOf(r) === s).length;
  Q.push({ q: '어떤 사업이 늦어지는가', href: late.length ? listHref(f, { status: 'check' }) : undefined, value: fmt(n('delay') + n('long')), unit: '건', sub: `${STATUS_RANGE.delay} ${fmt(n('delay'))} · ${STATUS_RANGE.long} ${fmt(n('long'))}`,
    tip: `${DELAY_GROUP} = ${STATUS_RANGE.delay} ${fmt(n('delay'))} + ${STATUS_RANGE.long} ${fmt(n('long'))} · ${STATUS_RANGE.caution} ${fmt(n('caution'))}건은 따로 · 누르면 점검 필요 목록`,
    help: `예정일을 6개월 넘게 넘긴 사업 수입니다. 12개월 넘게 넘긴 사업은 '장기'로 따로 셉니다. 1~6개월 넘긴 사업(주의)은 넣지 않습니다.` });
  /* ④ 어디를 먼저: 지연·주의 호수가 가장 큰 시도(시도·시군구를 고르면 시군구) */
  const bySgg = !!(f.sido || f.sgg), acc = new Map<string, number>();
  for (const r of late) { const k = bySgg ? r.sgg : r.sgg.slice(0, 2); acc.set(k, (acc.get(k) ?? 0) + r.units); }
  const top = [...acc].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  Q.push({ q: '어디를 먼저 챙기는가', muted: !top, value: top ? (bySgg ? ctx.sggName(top[0]) : ctx.sidoName(top[0])) : '없음', unit: '',
    href: top ? (bySgg ? (top[0] !== f.sgg ? listHref(f, { sgg: top[0] }) : undefined) : listHref(f, { sido: top[0] })) : undefined,
    sub: top ? `지연·주의 ${fmt(top[1])}호` : '지연·주의 사업 없음', tip: `지연·주의 사업 호수가 가장 큰 ${bySgg ? '시군구' : '시도'}`,
    help: `예정일을 넘긴 사업의 호수가 가장 많은 ${bySgg ? '시군구' : '시도'}입니다.` });
  /* ⑤ 앞으로 얼마나: 준공 현재 예정이 앞으로 12개월(원장 관측 달부터)에 드는 사업(준공 실제가 있으면 뺌 — 종합상황판 향후 12개월 준공과 같은 규칙) */
  const months = aheadMonths(ctx.observedMonth);
  const up = scope.filter((r) => r.completion && months.includes(r.completion));
  const sido = f.sgg ? f.sgg.slice(0, 2) : f.sido ?? (f.metro ? '' : 'all');
  Q.push({ q: '앞으로 얼마나 공급되는가', href: `/region${sido ? `?sido=${sido}` : ''}`, value: fmt(up.reduce((s, r) => s + r.units, 0)), unit: '호', sub: `${AHEAD_COMPLETION} · ${fmt(up.length)}건`,
    tip: `${AHEAD_COMPLETION} = 이 범위 사업의 준공 현재 예정 달이 ${ymText(months[0])}~${ymText(months[11])}인 사업(이미 준공 실제가 있는 사업 제외) · 지역 공급의 '준공' 칩과 같은 값 · 누르면 지역 공급`,
    help: `${ymText(months[0])}~${ymText(months[11])}에 공사를 마칠 예정인 사업의 호수입니다. 이미 공사를 마친 사업은 뺍니다.` });
  return Q;
}

/* ---------- 현재 예정(목록 칸·인쇄 표·간단 보기 — 같은 열 이름 PLAN_COL): 지난 예정(주의·지연)은 그 달 + '경과 n개월' 꼬리표(색 대신),
   아니면 다음 현재 예정, 끝난 사업은 실제 준공 달 + '실제' 꼬리표 ---------- */
export const PLAN_COL = '현재 예정';
/* 후보 사업의 예정은 원천(건축HUB·LH 파일)에 적힌 값이라 이름을 따로 붙인다 */
export const CAND_PLAN = '원천 예정(확인 필요)';
/* 열이 좁아 모집공고는 '모집'(리본 ④와 같은 말) */
export const NEXT_NAME: Record<string, string> = { ...EVENT_NAME, SUPPLY_NOTICE: '모집' };
export function nextOf(r: ProjectRow): { text: string; sort: number; title: string; tag?: string; muted?: boolean } | null {
  const late = lateOf(r);
  if (late !== null && r.overdue) return { text: `${ymText(r.overdue.planned)} ${NEXT_NAME[r.overdue.eventType]}`, tag: `경과 ${r.overdue.months}개월`, sort: monthNo(r.overdue.planned), title: `${EVENT_NAME[r.overdue.eventType]} 현재 예정일 경과 ${r.overdue.months}개월 — ${STATUS_NAME[statusOf(r)]}` };
  if (r.next) return { text: `${ymText(r.next.planned)} ${NEXT_NAME[r.next.eventType]}`, sort: monthNo(r.next.planned), title: `${EVENT_NAME[r.next.eventType]} 현재 예정` };
  if (r.done) return { text: `${ymText(r.done)} 준공`, tag: '실제', muted: true, sort: monthNo(r.done), title: '실제 준공(이미 마친 사업)' };
  return null;
}

/* ---------- 간단 보기(?cand=): 상세 자료가 없는 사업(사업 번호가 아직 없는 후보 사업 등)을 목록 색인 자료만으로 연다 ---------- */
/* 후보 사업의 원장 id 는 다음 원장에서 바뀔 수 있어 상세(?id=)와 주소를 나눈다. 목록에 없는 id 면 null */
export const CAND_NAME = '후보 사업';
export function candidateOf(rows: ProjectRow[], id: string | null | undefined): { row: ProjectRow; sources: string[] } | null {
  const row = id ? rows.find((r) => r.id === id) : undefined;
  if (!row) return null;
  const sources = [...(row.pks?.length ? ['건축HUB 주택인허가'] : []), ...(row.why === 'LH 후보' ? ['LH 준공 예정 파일'] : [])];
  return { row, sources: sources.length ? sources : ['사업 원장'] };
}

/* ---------- 월간 보고: 우선 점검 상위 10(현재 예정일 경과 개월 큰 순, 같으면 호수 큰 순) ---------- */
/* 같은 시군구·같은 이름의 사업(한 단지의 동·공구가 따로 잡힌 건축HUB 후보)은 한 줄로 합친다: 경과는 가장 큰 값, 호수는 합, count = 합친 건수 */
export type PrioRow = ProjectRow & { count: number };
export function priorityOf(rows: ProjectRow[], n = 10): PrioRow[] {
  const groups = new Map<string, PrioRow>();
  for (const r of rows.filter((x) => lateOf(x) !== null).sort((a, b) => lateOf(b)! - lateOf(a)! || b.units - a.units)) {
    const k = `${r.sgg}|${r.name}`, g = groups.get(k);
    if (g) { g.count += 1; g.units += r.units; } else groups.set(k, { ...r, count: 1 });
  }
  return [...groups.values()].sort((a, b) => lateOf(b)! - lateOf(a)! || b.units - a.units).slice(0, n);
}

/* ---------- 서랍 단계 줄: '지금' 한 칸만 채우고, 지난 단계는 옅은 체크, 앞 단계는 빈 칸 ---------- */
export type StepState = 'now' | 'past' | 'ahead';
export const stepState = (i: number, current: number): StepState => (i === current ? 'now' : i < current ? 'past' : 'ahead');

/* ---------- 사업 상세: 단계 타임라인(시안 app.js timeline) ---------- */
export type StageEv = { plan?: string; planSrc?: string; actual?: string; actualSrc?: string; est?: string; estSrc?: string; late?: { months: number; cls: Cls } };
export type ProjectDetail = {
  unit: string; agency: string | null; scope: string; basis: string | null; asOf: string; issuedAt: string; source: string; bjd: string[];
  stages: Partial<Record<string, StageEv>>; progress: [string, number][]; refs: string[]; loc?: { by: string; basis: string | null };
};
export const STAGE_EVENTS = ['PERMIT', 'CONSTRUCTION_START', 'SUPPLY_NOTICE', 'COMPLETION', 'MOVE_IN'] as const;

/* 가로축은 연 단위(첫 해 1월 ~ 끝 해 다음 1월), 위치는 % 로 준다(서버가 그린다). 단계마다 두 줄: 현재(원장 현재 예정) · 실제(원천에서 확인한 날짜).
   기록(예정·실제)이 하나도 없는 단계는 줄을 그리지 않는다. ③착공 줄은 공사 기간 막대: 현재 = 착공 예정(없으면 실제) → 준공 예정(점선), 실제 = 착공 실제 → 준공 실제 또는 오늘(실선).
   예정일이 지났는데 실제가 없으면 실제 줄에 빗금(미확보). 오른쪽 열은 예정일 경과 개월(지연은 빨강, 주의는 노랑). 공정률은 보고 점과 선.
   기준선(당초 일정)은 원장·HOME 어디에도 없어 줄을 만들지 않는다(화면 머리에 '당초 일정 없음' 한 번) */
export type LaneMark = { at: number; tag: string; title: string; late?: Cls };
export type LaneBar = { from: number; to: number; title: string };
export type Lane = { board: number; plan?: LaneMark; planBar?: LaneBar; actual?: LaneMark; actualBar?: LaneBar; missing?: string; late?: { months: number; cls: Cls } };
export type Timeline = { years: number[]; today: number; todayText: string; lanes: Lane[]; progress: { at: number; pct: number; text: string }[]; used: { plan: boolean; actual: boolean; late: boolean; missing: boolean } };
export function timelineOf(d: ProjectDetail, referenceDate: string): Timeline {
  const T = monthNo(referenceDate);
  const dates: number[] = [T];
  for (const t of STAGE_EVENTS) { const s = d.stages[t]; if (s) for (const v of [s.plan, s.actual]) if (v) dates.push(monthNo(v)); }
  for (const [p] of d.progress) dates.push(monthNo(p));
  const y0 = Math.floor(Math.min(...dates) / 12), y1 = Math.floor(Math.max(...dates) / 12) + 1;
  const X0 = y0 * 12, span = (y1 - y0) * 12;
  const x = (m: number) => Math.round((m + 0.5 - X0) / span * 10000) / 100;   // 달 가운데
  const xe = (m: number) => Math.round((m - X0) / span * 10000) / 100;          // 달 시작
  const used = { plan: false, actual: false, late: false, missing: false };
  const lanes: Lane[] = [];
  const cs = d.stages.CONSTRUCTION_START ?? {}, cp = d.stages.COMPLETION ?? {};
  for (let b = 0; b < 6; b++) {
    const t = STAGE_EVENTS.find((k) => BOARD_OF_EVENT[k] === b);
    const s: StageEv = t ? d.stages[t] ?? {} : {};
    const span3 = b === 2 && !!cs.actual;
    if (!t || (!s.plan && !s.actual && !span3)) continue;
    const lane: Lane = { board: b };
    if (b === 2) {
      const st0 = cs.plan ?? cs.actual, end = cp.plan;
      if (st0 && end && monthNo(end) > monthNo(st0)) { used.plan = true; lane.planBar = { from: xe(monthNo(st0)), to: xe(monthNo(end) + 1), title: `공사 예정 ${ymText(st0)}~${ymText(end)}` }; }
      if (span3) {
        const a = cs.actual!, ca = cp.actual;
        lane.actualBar = { from: xe(monthNo(a)), to: ca ? xe(monthNo(ca) + 1) : Math.max(x(T), xe(monthNo(a) + 1)), title: `공사 ${ymText(a)}~${ca ? ymText(ca) : '진행 중'}` };
      }
    }
    if (s.plan) {
      used.plan = true;
      if (s.late) { lane.late = s.late; used.late = true; }
      lane.plan = { at: x(monthNo(s.plan)), tag: `${ymText(s.plan)}${s.late ? ` +${s.late.months}개월` : ''}`, title: `${EVENT_NAME[t]} 현재 예정 ${ymText(s.plan)}${s.late ? ` · 경과 ${s.late.months}개월 — ${STATUS_NAME[s.late.cls]}` : ''}`, ...(s.late ? { late: s.late.cls } : {}) };
    }
    if (s.actual) {
      used.actual = true;
      const diff = s.plan ? monthNo(s.actual) - monthNo(s.plan) : null;
      lane.actual = { at: x(monthNo(s.actual)), tag: ymText(s.actual), title: `${EVENT_NAME[t]} 실제 ${dayText(s.actual)}${diff !== null ? ` · 현재 예정 대비 ${diff > 0 ? '+' : ''}${diff}개월` : ''}` };
    } else if (s.plan && monthNo(s.plan) < T) { used.missing = true; lane.missing = `${BOARD_NAMES[b]} — 예정일이 지났는데 실제 기록 없음`; }
    if (lane.actualBar) used.actual = true;
    lanes.push(lane);
  }
  const years = Array.from({ length: y1 - y0 }, (_, i) => y0 + i);
  return {
    years, today: x(T), todayText: ymOfNo(T), lanes, used,
    progress: d.progress.map(([day, pct]) => ({ at: x(monthNo(day)), pct, text: `${dayText(day)} 보고 ${pct}%` })),
  };
}
/* 연 눈금 위치(%): 그해 1월 시작 */
export const yearAt = (t: Timeline, y: number) => Math.round((y - t.years[0]) / t.years.length * 10000) / 100;

/* ---------- 상세 서랍(?id=)이 열 것 ---------- */
/* 레지스트리에서 id 를 찾아: 대체된 옛 id → 대표 사업(from 에 옛 id·이름), 숨김(대응 사업 없음) → 안내, 상세 자료가 있는 발급 사업 → 그 사업.
   사업 id 모양이 아니거나 레지스트리에 없거나(발급 전 후보의 임시 번호) 상세 자료가 없으면 null — 서랍을 열지 않는다 */
export type RegLite = { id: string; name: string; sgg: string; supersededBy?: string; hiddenAt?: string; hiddenReason?: string };
export function drawerTarget<T extends RegLite>(asked: string, registry: T[], hasDetail: (id: string) => boolean, idOk: RegExp = /^PRJ-\d{5}-\d{4}$/):
  { kind: 'detail'; id: string; from: { id: string; name: string } | null } | { kind: 'hidden'; project: T } | null {
  if (!idOk.test(asked)) return null;
  const reg = registry.find((p) => p.id === asked);
  if (!reg) return null;
  if (reg.hiddenAt && !reg.supersededBy) return { kind: 'hidden', project: reg };
  const id = reg.supersededBy ?? reg.id;
  return hasDetail(id) ? { kind: 'detail', id, from: reg.supersededBy ? { id: reg.id, name: reg.name } : null } : null;
}

/* ---------- 숨김 사업 안내 ---------- */
/* 목록에서 뺀(대응 사업 없음) 사업의 한 줄 안내와 이유(title). 이유 글의 덤프 판 번호·내부 문서 참조('— 데이터-정제-계획 6절 3')는 화면에 내지 않는다 */
export function hiddenNote(at: string, reason: string | undefined) {
  const why = (reason ?? '대응 사업이 없다')
    .replace(/HOME 덤프 \d{8}T\d{6}Z ?에/g, 'HOME 자료에')
    .replace(/\s*—\s*[^—()]*\d+절[^()—]*/g, '')
    .replace(/\(\s*\)/g, '').trim();
  return { text: `${at.replace(/-/g, '.')}부터 목록에서 뺀 사업입니다 · 대신할 사업 없음`, title: why };
}
