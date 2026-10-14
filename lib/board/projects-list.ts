/* 사업 목록 표의 열·칸(화면 /projects 의 표와 CSV 내려받기 /projects/csv 가 같이 쓴다 — 열 이름·값이 하나). 서버 전용 순수 계산.
   칸 모양은 lib/grid/spec.ts 의 Cell(직렬화되는 값만). */
import type { Cell, Col, Row } from '../grid/spec';
import { mapHref } from './map-href';
import {
  AGENCY_NAME, BOARD_CIR, BOARD_COLOR, BOARD_INK, BOARD_NAMES, CAND_NAME, EVENT_NAME, PLAN_COL, STATUS_NAME, STATUS_TIP,
  agencyKey, isMetro, lateOf, listHref, nextOf, statusOf, ymText, type Filters, type ProjectRow, type Status,
} from './projects-view';

/* '경기도 고양시 일산동구' → '경기 고양시 일산동구'(표가 전국이라 시도를 붙이되 짧게), drop 이면 시도를 뺀다 */
export const sggLabel = (name: string, sido?: string, drop = false) => { const t = name.split(' '); return t.length < 2 ? name : drop ? t.slice(1).join(' ') : sido ? `${sido} ${t.slice(1).join(' ')}` : name; };

/* 상태 칸 견본: 정상·주의는 색 면, 지연은 빨간 테두리, 장기 지연은 빨간 면, 일정 없음은 빗금 */
type Sw = { kind: 'fill' | 'outline' | 'hatch'; color?: string };
export const STATUS_SW: Record<Status, Sw> = { ok: { kind: 'fill', color: 'var(--ok)' }, caution: { kind: 'fill', color: 'var(--warn)' }, delay: { kind: 'outline', color: 'var(--bad)' }, long: { kind: 'fill', color: 'var(--bad)' }, none: { kind: 'hatch' } };
const STATUS_SORT: Record<Status, number> = { long: 0, delay: 1, caution: 2, none: 3, ok: 4 };
export function statusCell(r: ProjectRow): Cell {
  const s = statusOf(r), w = STATUS_SW[s];
  const why = s === 'none' && r.why ? ` — ${r.why === 'LH 후보' ? 'LH 후보(판정 대상 아님)' : r.why}` : '';
  return { text: STATUS_NAME[s], sort: STATUS_SORT[s], title: `${STATUS_TIP[s]}${why}`, ...(w.kind === 'hatch' ? { mark: 'hatch' as const, muted: true } : w.kind === 'outline' ? { swatch: w.color, mark: 'outline' as const, tone: 'bad' as const } : { swatch: w.color, ...(s === 'long' ? { tone: 'bad' as const } : {}) }) };
}
/* 현재 예정: projects-view nextOf(간단 보기 서랍·인쇄 표와 같은 값 — 지난 예정은 색 대신 '경과 n개월' 꼬리표) */
export const nextCell = (r: ProjectRow): Cell => nextOf(r);
/* 칸마다 title 을 붙이면 2,317행 목록의 화면 자료가 커진다 — 설명은 열 머리에 두고 칸에는 뜻이 다른 것(상태·현재 예정·지연)만 */
export const stagePill = (r: ProjectRow): Cell => ({ text: `${BOARD_CIR[r.board]} ${BOARD_NAMES[r.board]}`, sort: r.board, pill: { color: BOARD_COLOR[r.board], ink: BOARD_INK[r.board] } });
export const lateCell = (r: ProjectRow): Cell => {
  const late = lateOf(r);
  return late === null ? null : { text: `+${late}`, sort: late, tone: r.cls === 'caution' ? 'warn' : 'bad', strong: r.cls !== 'caution', title: `${EVENT_NAME[r.overdue!.eventType]} 예정 ${ymText(r.overdue!.planned)} 경과` };
};
export const agencyCell = (r: ProjectRow): Cell => { const k = agencyKey(r.agency); return k === 'etc' ? { text: AGENCY_NAME[k], muted: true } : AGENCY_NAME[k]; };
export const unitsCell = (r: ProjectRow): Cell => (r.units > 0 ? r.units : { na: '미확인' });
/* 지도 연결점(수도권 사업만 — 지도 자료가 서울·인천·경기). 지도는 다른 루트 레이아웃이라 <a> */
export const mapCell = (r: ProjectRow): Cell => (isMetro(r.sgg) ? { text: '지도에서 보기', href: mapHref({ project: r.id }), doc: true, icon: 'map', title: `${r.name} — 지도에서 이 사업 위치 보기` } : null);

/* 의미 없는 열 버리기: 모든 칸이 빈칸(–)이거나 모두 '기타'인 열은 그리지 않고, 뺀 사실은 표 머리의 title 에 한 번만 */
const OPTIONAL: Record<string, string> = { agency: '기관(모두 기타)', notice: '공고 확인(모두 없음)', next: `${PLAN_COL}(모두 없음)`, late: '지연(개월)(모두 경과 없음)', map: '지도(수도권 사업만)' };
const blank = (v: Cell) => v == null || (typeof v === 'object' && (v.na !== undefined || (v.muted && v.text === AGENCY_NAME.etc)));
export function dropBlank(cols: Col[], rows: Row[]) {
  const gone = cols.filter((c) => c.key in OPTIONAL && rows.length > 0 && rows.every((r) => blank(r.c[c.key])));
  return { cols: cols.filter((c) => !gone.includes(c)), note: gone.length ? ` · 이 조건에 값이 없어 뺀 열: ${gone.map((c) => OPTIONAL[c.key]).join(', ')}` : '' };
}

/* 목록 열: 1280~1440 폭에서 다 보이게 사업·시군구는 한 줄 말줄임(전체는 title) */
export const LIST_COLS: Col[] = [{ key: 'name', label: '사업', kind: 'text', clip: 'clamp(180px, 100vw - 1120px, 380px)' }, { key: 'sgg', label: '시군구', kind: 'text', clip: 'clamp(120px, 100vw - 1180px, 200px)' }, { key: 'agency', label: '기관', kind: 'text' },
  { key: 'stage', label: '단계', kind: 'text' }, { key: 'units', label: '계획 호수' }, { key: 'notice', label: '공고 확인' }, { key: 'next', label: PLAN_COL, kind: 'text' }, { key: 'late', label: '지연(개월)' }, { key: 'status', label: '상태', kind: 'text' },
  { key: 'map', label: '지도', kind: 'text', sort: false }];

/* 목록 행: 발급 사업은 상세 서랍(?id=), 후보 사업은 간단 보기(?cand=) */
export function listRows(list: ProjectRow[], f: Filters, sel: string | null, sido: (code: string) => string | undefined): Row[] {
  return list.map((r) => {
    const href = r.issued ? listHref(f, { id: r.id }) : listHref(f, { cand: r.id });
    return {
      id: r.id, href, sel: r.id === sel,
      c: {
        name: r.issued ? { text: r.name, href, stay: true } : { text: r.name, href, stay: true, title: `${r.name} — ${CAND_NAME}(사업 번호가 아직 없음): 누르면 간단 보기 · 다음 원장에서 번호가 바뀔 수 있음` },
        sgg: sggLabel(r.sggName, sido(r.sgg.slice(0, 2))),
        agency: agencyCell(r), stage: stagePill(r), units: unitsCell(r),
        notice: r.notice, next: nextCell(r), late: lateCell(r), status: statusCell(r), map: mapCell(r),
      },
    };
  });
}
/* CSV 열 = 화면에 보이는 열(뺀 빈 열 제외)에서 지도 표지만 뺀다(링크라 값이 없다) */
export const csvCols = (cols: Col[]) => cols.filter((c) => c.key !== 'map');
