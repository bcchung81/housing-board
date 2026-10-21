/* 데이터 원본 '수집 상태' 보기의 값(순수 함수). data/board/home-sources.json(tools/ledger/home-sources.js)을 화면 모양으로 바꾼다 — 파일을 읽지 않는다.
   HOME 쪽 값은 PoC 와 같게: 수집 실행(마지막 실행이 성공이면 정상, 아니면 실패)은 덤프, 건수·기준일·조회 상태·연도 확보는 PoC 스냅샷이다. 실패한 원천은 마지막 정상 값을 쓴다. */

export type QueryStatus = 'VERIFIED' | 'PARTIAL' | 'UNVERIFIED' | 'NOT_COLLECTED';
export type HomeSource = { id: string; name: string; org: string; ok: boolean; lastRun: string; lastOk: string | null; runs: number; failed: number; interrupted: number; records: number; asOf: string | null; query: QueryStatus; provided: number | null; fetched: number | null };
/* full 확보 · none 미확보(PoC 미입수) · nosrc 원본에 행 없음 · unpub 원천 미공표 */
export type GridState = 'full' | 'none' | 'nosrc' | 'unpub';
export type GridRow = { id: string; name: string; region: string; owner: 'HOME'; years: Record<string, GridState> };
export type LinkCount = { type: 'POLICY_PROGRAM' | 'PROGRAM_PROJECT'; confirmed: number; review: number; released: number };
export type HomeSources = { schema: string; poc: { fetchedAt: string; generatedAt: string; registered: number; withData: number; orgs: number }; runs: { total: number; success: number; failed: number; interrupted: number }; sources: HomeSource[]; grid: GridRow[]; links: LinkCount[] };

export const GRID_YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
export const LINK_NAME: Record<LinkCount['type'], string> = { POLICY_PROGRAM: '정책–프로그램', PROGRAM_PROJECT: '프로그램–사업' };

/* ISO 시각(UTC) → 한국 날짜 'YYYY.MM.DD' */
export function kstDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(/Z$|[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso}+09:00`);   // 카탈로그 수집일은 +09:00 이 붙어 온다
  if (Number.isNaN(t)) return null;
  return new Date(t + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '.');
}

/* HOME 덤프 판 이름 '20261019T212247Z'(UTC) → 한국 날짜 'YYYY.MM.DD' */
export function kstEdition(edition: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(edition);
  return m ? kstDate(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`) : null;
}

/* warn = 마지막 수집이 정상이지만 조회 범위가 일부(PoC 조회 상태 PARTIAL) · lastRun = 마지막 실행 날짜 */
export type StatusRow = { owner: 'HOME'; id: string; name: string; org: string; ok: boolean; warn: boolean; lastOk: string | null; lastRun: string | null; asOf: string | null; count: number; runs: string; note: string };

/* 원천 표: 실패한 원천을 맨 위에, 그 뒤 HOME 원천. 상태는 정상/경고/실패. 우리 보관 원천 카탈로그는 맨 아래 접힌 카탈로그에서 센다 */
export function statusRows(hs: HomeSources): StatusRow[] {
  const all: StatusRow[] = hs.sources.map((s) => ({
    owner: 'HOME', id: s.id, name: s.name, org: s.org, ok: s.ok, warn: s.ok && s.query === 'PARTIAL', lastOk: kstDate(s.lastOk), lastRun: kstDate(s.lastRun), asOf: s.asOf ? s.asOf.replace(/-/g, '.') : null, count: s.records,
    runs: `${s.runs}회${s.failed ? ` · 실패 ${s.failed}` : ''}`,
    note: `수집 실행 ${s.runs}회 중 실패 ${s.failed}${s.interrupted ? `·중단 ${s.interrupted}` : ''}${s.ok ? '' : ` · 마지막 실행 ${kstDate(s.lastRun)} 실패${s.lastOk ? ' — 마지막 정상 값을 씀' : ' — 정상 수집 없음'}`}${s.provided !== null ? ` · 제공 ${s.provided.toLocaleString('en-US')} 조회 ${s.fetched?.toLocaleString('en-US')} 적재 ${s.records.toLocaleString('en-US')}${s.query === 'PARTIAL' ? '(조회 범위 일부)' : ''}` : ''}`,
  }));
  return [...all.filter((r) => !r.ok), ...all.filter((r) => r.ok)];
}

export type CoverageRow = { id: string; name: string; owner: 'HOME'; cells: GridState[] };
/* 연도 × 원천 확보 격자: PoC '자료연도별 확보'와 같은 줄(원천 × 시도) */
export function coverageRows(hs: HomeSources): CoverageRow[] {
  return hs.grid.map((g) => ({ id: g.id, name: `${g.name} · ${g.region}`, owner: g.owner, cells: GRID_YEARS.map((y) => g.years[String(y)]) }));
}

/* 표에서 모든 행이 같은 표지인 열(값이 하나뿐 — 빈칸 포함)은 그리지 않고, 그 사실은 한 번만 말한다(사용자 지시 2026-10-14: 의미 없는 칸 버리기).
   cells: 행마다 열 key → 표시 글자(빈칸은 null). 행이 둘 이상일 때만 접는다. 돌려주는 것: 남길 열 key 와 접은 열의 한 줄 설명 */
export function uniformColumns(keys: string[], cells: Record<string, string | null>[], names: Record<string, string>): { keep: string[]; folded: string[] } {
  const keep: string[] = [], folded: string[] = [];
  for (const k of keys) {
    const vals = new Set(cells.map((c) => c[k] ?? null));
    if (cells.length >= 2 && vals.size === 1) { const v = [...vals][0]; folded.push(`${names[k] ?? k} ${v === null ? '없음' : `모두 ${v}`}`); } else keep.push(k);
  }
  return { keep, folded };
}
