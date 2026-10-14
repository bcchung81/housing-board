/* 데이터 원본 '수집 상태' 보기의 값(순수 함수). data/board/home-sources.json(tools/ledger/home-sources.js)을 화면 모양으로 바꾼다 — 파일을 읽지 않는다.
   HOME 쪽은 수집 실행(마지막 실행이 성공이면 정상, 아니면 실패)·확보 기록, 우리 쪽은 원천 카탈로그(sources.json)다. 실패한 원천은 마지막 정상 값을 쓴다. */
import type { YearVal } from './annual';
import type { Source } from './types';

export type HomeSource = { id: string; name: string; org: string; ok: boolean; lastRun: string; lastOk: string | null; runs: number; failed: number; interrupted: number; expected: number | null; fetched: number | null; partial: boolean; records: number | null; asOf: string | null };
export type GridState = 'full' | 'part';
export type GridRow = { id: string; name: string; owner: '우리' | 'HOME'; years: Record<string, GridState> };
export type LinkCount = { type: 'POLICY_PROGRAM' | 'PROGRAM_PROJECT'; confirmed: number; review: number; other: number };
export type HomeSources = { schema: string; runs: { total: number; success: number; failed: number; interrupted: number }; sources: HomeSource[]; grid: GridRow[]; links: LinkCount[] };

export const GRID_YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
export const LINK_NAME: Record<LinkCount['type'], string> = { POLICY_PROGRAM: '정책–프로그램', PROGRAM_PROJECT: '프로그램–사업' };

/* ISO 시각(UTC) → 한국 날짜 'YYYY.MM.DD' */
export function kstDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(/Z$|[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso}+09:00`);   // 카탈로그 수집일은 +09:00 이 붙어 온다
  if (Number.isNaN(t)) return null;
  return new Date(t + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '.');
}

/* warn = 마지막 수집이 정상이지만 일부 범위만(확보 기록의 수집 < 기대) · lastRun = 마지막 실행 날짜(HOME 만) */
export type StatusRow = { owner: '우리' | 'HOME'; id: string; name: string; org: string; ok: boolean; warn: boolean; lastOk: string | null; lastRun: string | null; asOf: string | null; count: number | null; runs: string; note: string };

/* 원천 표: 실패한 원천을 맨 위에, 그 밖은 우리 원천(카탈로그) 먼저, 그 뒤 HOME 원천. 상태는 정상/실패 두 가지 */
export function statusRows(hs: HomeSources, ours: Source[]): StatusRow[] {
  const mine: StatusRow[] = ours.map((s) => ({ owner: '우리', id: s.id, name: s.dataset, org: s.group, ok: true, warn: false, lastOk: kstDate(s.collectedAt), lastRun: null, asOf: s.sourceAsOf ? s.sourceAsOf.replace(/-/g, '.') : null, count: s.count, runs: '파일', note: `${s.provider} · 파일로 받아 둔 자료` }));
  const home: StatusRow[] = hs.sources.map((s) => ({
    owner: 'HOME', id: s.id, name: s.name, org: s.org, ok: s.ok, warn: s.ok && s.partial, lastOk: kstDate(s.lastOk), lastRun: kstDate(s.lastRun), asOf: s.asOf ? s.asOf.replace(/-/g, '.') : null, count: s.records ?? s.fetched,
    runs: `${s.runs}회${s.failed ? ` · 실패 ${s.failed}` : ''}`,
    note: `수집 실행 ${s.runs}회 중 실패 ${s.failed}${s.interrupted ? `·중단 ${s.interrupted}` : ''}${s.ok ? '' : ` · 마지막 실행 ${kstDate(s.lastRun)} 실패${s.lastOk ? ' — 마지막 정상 값을 씀' : ' — 정상 수집 없음'}`}${s.expected !== null ? ` · 확보 기록 기대 ${s.expected.toLocaleString('en-US')} 수집 ${s.fetched?.toLocaleString('en-US')}${s.partial ? '(일부 범위)' : ''}` : ''}`,
  }));
  const all = [...mine, ...home];
  return [...all.filter((r) => !r.ok), ...all.filter((r) => r.ok)];
}

export type CoverageRow = { id: string; name: string; owner: '우리' | 'HOME'; cells: ('full' | 'part' | 'none')[] };
/* 연도 × 원천 확보 격자. 첫 줄은 통계누리 월 자료(우리, 전국 연도별 집계 annualSeries 로 센다 — 12개월이 다 있으면 확보, 일부면 부분), 나머지는 HOME 요약 */
export function coverageRows(hs: HomeSources, ann: YearVal[]): CoverageRow[] {
  const stat: CoverageRow = { id: 'molit', name: '통계누리 주택건설실적(월)', owner: '우리', cells: GRID_YEARS.map((y) => { const a = ann.find((v) => v.year === y); return !a || a.months === 0 ? 'none' : a.complete ? 'full' : 'part'; }) };
  return [stat, ...hs.grid.map((g) => ({ id: g.id, name: g.name, owner: g.owner, cells: GRID_YEARS.map((y) => g.years[String(y)] ?? 'none') }))];
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
