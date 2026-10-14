/* 사업 화면(/projects · /project/[id] · /reports 정책 절)의 순수 계산. 파일을 읽지 않고 인자로 받아 Node 시험이 그대로 부른다(tests/js/projects-view.test.cjs).
   자료 읽기는 lib/board/projects-index.ts. 렌즈 = 정책(?policy=97|129|813) 또는 프로그램(?program=이름) 하나, 거르기 = 시도·시군구·단계(01~06)·상태. */

export type Cls = 'ok' | 'caution' | 'delay';
export type Status = Cls | 'none';
export type LinkStatus = 'CONFIRMED' | 'REVIEW_REQUIRED';
/* 지도 색인 행(data/board/ledger-map.json · tools/ledger/board.js mapIndexFromLedger) */
export type MapRow = {
  id: string; name: string | null; issued: boolean; stage: string; cls: Cls | null; why: string | null;
  overdue: { eventType: string; planned: string; months: number } | null; next: { eventType: string; planned: string } | null; done?: string; units: number;
};
export type IndexExtra = { notice?: number; programs?: string[]; policies?: string[]; link?: LinkStatus };
export type Policy = { id: string; key: string; short: string; name: string; announced: string; scope: string };
export type Program = { name: string; policies: string[]; projects: number };
export type ProjectRow = Omit<MapRow, 'name'> & { name: string; sgg: string; sggName: string; notice: number | null; programs: string[]; policies: string[]; link: LinkStatus | null };

/* 공식 6단계 → 종합상황판 리본 칸(①계획 ②인허가 ③착공 ④모집 ⑤준공 ⑥입주)의 색. 01·02 는 ①, 06 은 ⑤(준공 = 사용검사, tools/ledger/board.js BOARD_OF_STAGE) */
export const BOARD_NAMES = ['계획', '인허가', '착공', '모집', '준공', '입주'] as const;
export const BOARD_CIR = ['①', '②', '③', '④', '⑤', '⑥'] as const;
export const BOARD_COLOR = ['var(--st-plan)', 'var(--st-permit)', 'var(--st-build)', 'var(--st-sale)', 'var(--st-soon)', 'var(--st-move)'] as const;
export const BOARD_INK = ['var(--st-plan-ink)', 'var(--st-permit-ink)', 'var(--st-build-ink)', 'var(--st-sale-ink)', 'var(--st-soon-ink)', 'var(--st-move-ink)'] as const;
export const BOARD_OF_STAGE: Record<string, number> = { '01': 0, '02': 0, '03': 1, '04': 2, '05': 3, '06': 4 };
export const stageColor = (code: string) => BOARD_COLOR[BOARD_OF_STAGE[code] ?? 0];
/* 원장 단계 사건 → 리본 칸 */
export const BOARD_OF_EVENT: Record<string, number> = { PERMIT: 1, CONSTRUCTION_START: 2, SUPPLY_NOTICE: 3, COMPLETION: 4, MOVE_IN: 5 };
export const EVENT_NAME: Record<string, string> = { PERMIT: '인허가', CONSTRUCTION_START: '착공', SUPPLY_NOTICE: '모집공고', COMPLETION: '준공', MOVE_IN: '입주' };

export const STATUS_NAME: Record<Status, string> = { ok: '정상', caution: '주의', delay: '지연', none: '일정 미확보' };
export const STATUS_TIP: Record<Status, string> = { ok: '현재 예정일이 지나지 않음', caution: '현재 예정일 경과 1~6개월', delay: '현재 예정일 경과 6개월 이상', none: '판정할 현재 예정일이 없음' };
export const statusOf = (r: { cls: Cls | null }): Status => r.cls ?? 'none';

/* 날짜 글자: 'YYYY-MM-DD'·'YYYY-MM' → 'YYYY.MM', 'YYYY' 는 그대로 */
export const ymText = (d: string) => (d.length >= 7 ? `${d.slice(0, 4)}.${d.slice(5, 7)}` : d);
/* 달 번호(연 × 12 + 월 − 1). 연도만 있으면 그해 12월(원장 monthOf 와 같다) */
export const monthNo = (d: string) => Number(d.slice(0, 4)) * 12 + (d.length >= 7 ? Number(d.slice(5, 7)) - 1 : 11);
const ymOfNo = (n: number) => `${Math.floor(n / 12)}.${String((n % 12) + 1).padStart(2, '0')}`;

/* ---------- 목록 행 ---------- */
export function rowsOf(bySgg: Record<string, MapRow[]>, extra: Record<string, IndexExtra>, sggNames: Record<string, string | null>): ProjectRow[] {
  const out: ProjectRow[] = [];
  for (const [sgg, rows] of Object.entries(bySgg)) for (const r of rows) {
    const x = extra[r.id] ?? {};
    out.push({ ...r, name: r.name ?? r.id, sgg, sggName: sggNames[sgg] ?? sgg, notice: x.notice ?? null, programs: x.programs ?? [], policies: x.policies ?? [], link: x.link ?? null });
  }
  return out.sort((a, b) => a.sgg.localeCompare(b.sgg) || b.stage.localeCompare(a.stage) || a.name.localeCompare(b.name, 'ko'));
}

/* ---------- 거르기 ---------- */
export type Filters = { policy?: Policy; program?: Program; sido?: string; sgg?: string; stage?: string; status?: Status };
type Query = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);
/* 맞지 않는 값은 거르지 않는다. 렌즈는 하나: 정책이 있으면 프로그램은 무시 */
export function parseFilters(q: Query, ctx: { policies: Policy[]; programs: Program[]; sidoOk: (code: string) => boolean }): Filters {
  const f: Filters = {};
  const policy = ctx.policies.find((p) => p.key === one(q.policy));
  if (policy) f.policy = policy;
  else { const program = ctx.programs.find((p) => p.name === one(q.program)); if (program) f.program = program; }
  const sgg = one(q.sgg), sido = one(q.sido);
  if (sgg && /^\d{5}$/.test(sgg) && ctx.sidoOk(sgg.slice(0, 2))) f.sgg = sgg;
  else if (sido && /^\d{2}$/.test(sido) && ctx.sidoOk(sido)) f.sido = sido;
  const stage = one(q.stage);
  if (stage && /^0[1-6]$/.test(stage)) f.stage = stage;
  const status = one(q.status);
  if (status && status in STATUS_NAME) f.status = status as Status;
  return f;
}
export const inLens = (r: ProjectRow, f: Filters) => (f.policy ? r.policies.includes(f.policy.key) : f.program ? r.programs.includes(f.program.name) : true);
export const inRegion = (r: ProjectRow, f: Filters) => (f.sgg ? r.sgg === f.sgg : f.sido ? r.sgg.startsWith(f.sido) : true);
/* skip: 그 거르기만 빼고(칩·계단의 건수는 자기 거르기를 빼고 센다) */
export function applyFilters(rows: ProjectRow[], f: Filters, skip?: 'stage' | 'status') {
  return rows.filter((r) => inLens(r, f) && inRegion(r, f) && (skip === 'stage' || !f.stage || r.stage === f.stage) && (skip === 'status' || !f.status || statusOf(r) === f.status));
}

/* 거르기 주소: 열쇠 순서를 고정한다. patch 의 undefined 는 그 거르기를 푼다. 렌즈(policy·program)는 하나만 */
const KEYS = ['policy', 'program', 'sido', 'sgg', 'stage', 'status'] as const;
type Plain = Partial<Record<(typeof KEYS)[number], string>>;
export const plainOf = (f: Filters): Plain => ({ policy: f.policy?.key, program: f.program?.name, sido: f.sido, sgg: f.sgg, stage: f.stage, status: f.status });
export function listHref(f: Filters, patch: Plain = {}) {
  const v: Plain = { ...plainOf(f), ...patch };
  if ('policy' in patch && patch.policy) v.program = undefined;
  if ('program' in patch && patch.program) v.policy = undefined;
  if ('sido' in patch) v.sgg = undefined;
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
    noticeRatio: units ? notice / units * 100 : null,
  };
}
export const stageCounts = (rows: ProjectRow[]) => Object.fromEntries(['01', '02', '03', '04', '05', '06'].map((c) => [c, rows.filter((r) => r.stage === c).length]));

/* ---------- 정책 단계별 목표 대비 확인(data/board/policy-progress.json · samePeriod) ---------- */
export type SamePeriod = { year: number; from: string; through: string; target: number | null; actual: number | null; actualThrough: string | null; actualReviewUnits: number | null; gap: number | null; shortfallPct: number | null; status: string };
export type PolicyProgress = {
  schema: string; asOf: string; referenceMonthEnd: string; source: { edition: string; rule: string };
  policies: { policyId: string; name: string; periodStart: string; periodEnd: string; targetUnits: number; basis: Record<string, unknown> & { rule: string; linkedProjects: number };
    stages: Record<string, { label: string; targetBasis: string; actualBasis: string; samePeriod: SamePeriod[] }> }[];
  notes: string[];
};
/* HOME 의 6단계 → 리본 칸: 사업화 ①계획 · 인허가 ② · 착공 ③ · 공급(분양·모집) ④ · 준공 ⑤ · 입주 예정 ⑥ */
export const PP_STAGES = ['BUSINESS', 'APPROVAL', 'CONSTRUCTION', 'SUPPLY', 'COMPLETION', 'MOVE_IN'] as const;
/* state: short 목표 미달(빨간 테두리) · met 목표 이상 · noTarget 목표 없음(빗금, 확인 값만) · noActual 확인 미확보(빗금, 목표만) · none 둘 다 없음 */
export type StageCell = { board: number; key: string; label: string; target: number | null; actual: number | null; review: number | null; gap: number | null; shortfallPct: number | null;
  status: string; state: 'short' | 'met' | 'noTarget' | 'noActual' | 'none'; from: string; through: string; actualThrough: string | null; fill: number; targetBasis: string; actualBasis: string };
export function policyStageCells(pp: PolicyProgress, policyId: string): StageCell[] | null {
  const pol = pp.policies.find((p) => p.policyId === policyId);
  if (!pol) return null;
  const year = Number(pp.referenceMonthEnd.slice(0, 4));
  return PP_STAGES.map((key, board) => {
    const st = pol.stages[key];
    const s = st?.samePeriod.find((y) => y.year === year);
    const target = s?.target ?? null, actual = s?.actual ?? null;
    const state = target != null && actual != null ? (s!.status === 'GAP' ? 'short' : 'met') : target == null && actual != null ? 'noTarget' : target != null ? 'noActual' : 'none';
    return {
      board, key, label: st?.label ?? key, target, actual, review: s?.actualReviewUnits ?? null, gap: s?.gap ?? null, shortfallPct: s?.shortfallPct ?? null, status: s?.status ?? 'NONE', state,
      from: s?.from ?? `${year}-01-01`, through: s?.through ?? pp.referenceMonthEnd, actualThrough: s?.actualThrough ?? null,
      fill: target && actual != null ? Math.min(100, actual / target * 100) : 0, targetBasis: st?.targetBasis ?? '', actualBasis: st?.actualBasis ?? '',
    };
  });
}
/* 칸 설명(title): 확인/목표·부족·기간·확인 필요 연결 */
export function stageCellTip(c: StageCell) {
  const f = (n: number) => n.toLocaleString('en-US');
  const span = `${ymText(c.from)}~${ymText(c.through)}`;
  const head = `${BOARD_CIR[c.board]} ${BOARD_NAMES[c.board]} — HOME 단계 '${c.label}' · ${span}`;
  if (c.state === 'none') return `${head} · 목표 없음 · 확인 미확보`;
  const act = c.actual != null ? `확인 ${f(c.actual)}호${c.actualThrough && c.actualThrough !== c.through ? `(${ymText(c.actualThrough)}까지)` : ''}${c.review ? ` — 확인 필요 연결 ${f(c.review)}호 포함` : ''}` : `확인 미확보(${c.actualBasis})`;
  const tgt = c.target != null ? `목표 ${f(c.target)}호` : '목표 없음';
  const gap = c.state === 'short' && c.gap != null ? ` · 부족 ${f(c.gap)}호(${c.shortfallPct}%)` : '';
  return `${head} · ${act} / ${tgt}${gap}`;
}

/* ---------- 사업 상세: 단계 일정·타임라인 ---------- */
export type StageEv = { plan?: string; planSrc?: string; actual?: string; actualSrc?: string; est?: string; estSrc?: string; late?: { months: number; cls: Cls } };
export type ProjectDetail = {
  unit: string; agency: string | null; scope: string; basis: string | null; asOf: string; issuedAt: string; source: string; bjd: string[];
  stages: Partial<Record<string, StageEv>>; progress: [string, number][]; refs: string[];
};
export const STAGE_EVENTS = ['PERMIT', 'CONSTRUCTION_START', 'SUPPLY_NOTICE', 'COMPLETION', 'MOVE_IN'] as const;

/* 타임라인: 가로축은 연 단위(첫 해 1월 ~ 끝 해 다음 1월), 위치는 % 로 준다(서버가 그린다).
   줄 = 리본 칸 6개. 마커: 예정(점선·옅은 면) · 실제(실색) · 추정(점선 테두리만). 지연은 예정 마커에 빨간 테두리(주의는 노란).
   ③착공 줄은 공사 기간 막대: 예정(착공 → 준공 예정, 점선) 위에 실제(착공 실제 → 준공 실제 또는 오늘, 실선). 공정률은 보고 점과 선.
   꼬리표(tag): 줄마다 날짜 한 개를 마커 옆에 쓴다 — 실제가 있으면 실제 달, 없으면 '예정 달'(경과면 +개월과 색), 추정이면 '달 이전'.
   예정 대비 실제 차이(개월)는 실제 마커의 title. (2026-10-14 사업 상세의 '일정' 표를 없애고 그 값을 여기로 옮겼다) */
export type Mark = { kind: 'plan' | 'actual' | 'est'; at: number; text: string; late?: { months: number; cls: Cls } };
export type Bar = { kind: 'plan' | 'actual'; from: number; to: number; text: string };
export type Tag = { at: number; text: string; late?: Cls };
export type Timeline = { years: number[]; today: number; todayText: string; rows: { board: number; marks: Mark[]; bars: Bar[]; empty: boolean; tag?: Tag }[]; progress: { at: number; pct: number; text: string }[] };
export function timelineOf(d: ProjectDetail, referenceDate: string): Timeline {
  const T = monthNo(referenceDate);
  const dates: number[] = [T];
  for (const s of Object.values(d.stages)) for (const v of [s?.plan, s?.actual, s?.est]) if (v) dates.push(monthNo(v));
  for (const [p] of d.progress) dates.push(monthNo(p));
  const y0 = Math.floor(Math.min(...dates) / 12), y1 = Math.floor(Math.max(...dates) / 12) + 1;
  const X0 = y0 * 12, span = (y1 - y0) * 12;
  const x = (m: number) => Math.round((m + 0.5 - X0) / span * 10000) / 100;   // 달 가운데
  const xEdge = (m: number) => Math.round((m - X0) / span * 10000) / 100;
  const rows: Timeline['rows'] = BOARD_NAMES.map((_, board) => ({ board, marks: [], bars: [], empty: true }));
  for (const t of STAGE_EVENTS) {
    const s = d.stages[t];
    if (!s) continue;
    const row = rows[BOARD_OF_EVENT[t]];
    row.empty = false;
    if (s.plan) row.marks.push({ kind: 'plan', at: x(monthNo(s.plan)), text: `${EVENT_NAME[t]} 예정 ${ymText(s.plan)}`, ...(s.late ? { late: s.late } : {}) });
    if (s.est) row.marks.push({ kind: 'est', at: x(monthNo(s.est)), text: `${EVENT_NAME[t]} 추정 ${ymText(s.est)}(이 날 이전)` });
    if (s.actual) {
      const diff = s.plan ? monthNo(s.actual) - monthNo(s.plan) : null;
      row.marks.push({ kind: 'actual', at: x(monthNo(s.actual)), text: `${EVENT_NAME[t]} 실제 ${ymText(s.actual)}${diff !== null ? ` · 예정 ${ymText(s.plan!)} 대비 ${diff > 0 ? '+' : ''}${diff}개월` : ''}` });
      row.tag = { at: x(monthNo(s.actual)), text: ymText(s.actual) };
    } else if (s.plan) row.tag = { at: x(monthNo(s.plan)), text: `${ymText(s.plan)} 예정${s.late ? ` +${s.late.months}개월` : ''}`, ...(s.late ? { late: s.late.cls } : {}) };
    else if (s.est) row.tag = { at: x(monthNo(s.est)), text: `${ymText(s.est)} 이전` };
  }
  /* 공사 기간(③착공 줄) */
  const cs = d.stages.CONSTRUCTION_START, cp = d.stages.COMPLETION;
  const start = cs?.actual ?? cs?.est ?? null, planStart = cs?.plan ?? start, planEnd = cp?.plan ?? null;
  if (planStart && planEnd && monthNo(planEnd) > monthNo(planStart)) rows[2].bars.push({ kind: 'plan', from: xEdge(monthNo(planStart)), to: xEdge(monthNo(planEnd) + 1), text: `공사 예정 ${ymText(planStart)}~${ymText(planEnd)}` });
  if (start) {
    const to = cp?.actual ? xEdge(monthNo(cp.actual) + 1) : Math.max(x(T), xEdge(monthNo(start) + 1));   // 끝나지 않았으면 오늘 선까지
    rows[2].bars.push({ kind: 'actual', from: xEdge(monthNo(start)), to, text: `공사 ${ymText(start)}~${cp?.actual ? ymText(cp.actual) : '진행 중'}` });
    rows[2].empty = false;
  }
  const years = Array.from({ length: y1 - y0 }, (_, i) => y0 + i);
  return {
    years, today: x(T), todayText: ymOfNo(T), rows,
    progress: d.progress.map(([day, pct]) => ({ at: x(monthNo(day)), pct, text: `${day.replace(/-/g, '.')} 보고 ${pct}%` })),
  };
}
/* 연 눈금 위치(%): 그해 1월 시작 */
export const yearAt = (t: Timeline, y: number) => Math.round((y - t.years[0]) / t.years.length * 10000) / 100;

/* ---------- 숨김 사업 안내 ---------- */
/* 목록에서 뺀(대응 사업 없음) 사업의 한 줄 안내와 이유(title). 이유 글의 덤프 판 번호·내부 문서 참조('— 데이터-정제-계획 6절 3')는 화면에 내지 않는다 */
export function hiddenNote(at: string, reason: string | undefined) {
  const why = (reason ?? '대응 사업이 없다')
    .replace(/HOME 덤프 \d{8}T\d{6}Z ?에/g, 'HOME 자료에')
    .replace(/\s*—\s*[^—()]*\d+절[^()—]*/g, '')
    .replace(/\(\s*\)/g, '').trim();
  return { text: `${at.replace(/-/g, '.')}부터 목록에서 뺀 사업입니다 · 대신할 사업 없음`, title: why };
}
