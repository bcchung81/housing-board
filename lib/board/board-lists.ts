/* 종합상황판 링크가 '목록 창'으로 여는 사업 목록(2026-10-20) — 서버가 /projects 화면과 같은 함수(parseFilters → applyFilters → listOrder)로 미리 계산한다.
   projects-view 는 Node 시험이 확장자 없는 import 를 읽지 못해 함수째 넘겨받는다(directives.ts bottleneck 과 같은 방식). 링크 href 가 곧 열쇠다(상황판 지시 카드·판정 카드·병목 링크가 같은 href). 직렬화되는 칸만 담는다(행 원자료 pks·bundles 는 넘기지 않는다).
   HOME 원천 행(2026-10-21 — 종합상황판이 HOME 규칙 집계 home-board.json 을 그린다)을 받으면 모집단은 카드 숫자와 같은 종합상황판 모집단(row.home.board — 9·7 포트폴리오, home-projects views.p97 과 같은 행)이고,
   순서는 사업 화면 HOME 목록 순서(지연 → 주의 → 정상 · 부족 호수 큰 순), 단계 이름은 HOME 6칸, 덧말은 부족 호수. 카드 '연결 사업 n개'(사업장별 현황판)도 목록 창으로 연다.
   단계 부족 목록(2026-10-21 사용자 결정 — 병목 보기·병목 카드·일정 지연 카드): 단계 집계 판정에 부족량이 있는 단계마다 그 단계 목표보다 측정이 모자란 사업(row.home.short, 부족 큰 순).
   부족 합 − 다른 사업 초과(stageShort over) = 카드 숫자 — 초과가 있으면 제목에 그 셈을 적는다. 덧말은 그 단계 부족 호수 · 사업 판정(측정이 없는 단계는 사업 판정에 들지 않아 '정상'일 수 있다) */
import type * as View from './projects-view';

export type ViewFns = Pick<typeof View, 'BOARD_CIR' | 'BOARD_NAMES' | 'HOME_NAMES' | 'HOME_STATUS_NAME' | 'applyFilters' | 'homeOrderOf' | 'listHref' | 'listOrder' | 'overdueMonthsOf' | 'parseFilters' | 'shortHref' | 'shortName' | 'shortStageOf'>;
export type BoardList = { title: string; rows: { href: string; name: string; meta?: string }[] };

/* 창으로 여는 링크(상황판이 거는 주소 — lib/board/directives.ts·components/board/Board.tsx 와 같은 글자) */
export const LIST_LATE = '/projects?sido=all&status=late';
export const LIST_REVIEW = '/projects?sido=all&status=review-late';
export const LIST_CAUTION = '/projects?sido=all&status=caution';
export const LIST_ALL = '/projects?sido=all';
export const listStage = (i: number) => `/projects?sido=all&stage=${i}&status=late`;

/* 시도 이름이 있으면 '경기 고양시'(projects-list sggLabel 규칙), 지연 개월이 있으면 '+n개월'(HOME 행은 부족 호수) */
const shortSgg = (name: string, sido?: string) => { const t = name.split(' '); return t.length < 2 ? name : sido ? `${sido} ${t.slice(1).join(' ')}` : name; };
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export function boardLists(V: ViewFns, rows: View.ProjectRow[], sido: (code: string) => string | undefined, stageShort: View.StageShort = {}): Record<string, BoardList> {
  const home = rows.some((r) => r.home), pop = home ? rows.filter((r) => r.home!.board) : rows;
  const make = (href: string, title: (n: number, list: View.ProjectRow[]) => string): [string, BoardList] => {
    const q = Object.fromEntries(new URL(href, 'http://x').searchParams);
    const f = V.parseFilters(q, { policies: [], programs: [], sidoOk: () => true });
    const k = f.status && V.shortStageOf(f.status), hit = V.applyFilters(pop, f), list = home ? V.homeOrderOf(hit, f) : V.listOrder(hit);
    return [href, {
      title: title(list.length, list),
      rows: list.map((r) => {
        const late = V.overdueMonthsOf(r), gap = r.home?.gap ? `부족 ${fmt(r.home.gap)}호` : '';
        const short = k ? `${V.shortName(k)} ${fmt(r.home!.short![k])}호 · 사업 판정 ${V.HOME_STATUS_NAME[r.cls ?? 'none']}` : '';
        const meta = [shortSgg(r.sggName, sido(r.sgg.slice(0, 2))), k ? short : home ? gap : late !== null ? `+${late}개월` : ''].filter(Boolean).join(' · ');
        return { href: V.listHref(f, r.issued ? { id: r.id } : { cand: r.id }), name: r.name, ...(meta ? { meta } : {}) };
      }),
    }];
  };
  const names = home ? V.HOME_NAMES : V.BOARD_NAMES;
  return Object.fromEntries([
    make(LIST_LATE, (n) => (home ? `지연 ${n}건` : `지연 확정 ${n}건`)),
    make(LIST_REVIEW, (n) => `후보 계산 ${n}건`),
    make(LIST_CAUTION, (n) => `주의 ${n}건`),
    ...(home ? [make(LIST_ALL, (n) => `연결 사업 ${n}개`)] : []),
    ...Object.entries(stageShort).map(([k, v]) => make(V.shortHref(k), (n, list) => {
      const sum = list.reduce((s, r) => s + (r.home?.short?.[k] ?? 0), 0);
      return `${V.shortName(k)} ${n}건 · ${fmt(sum)}호${v.over ? ` (다른 사업 초과 ${fmt(v.over)}호를 빼면 ${fmt(sum - v.over)}호)` : ''}`;
    })),
    ...names.map((name, i) => make(listStage(i), (n) => `${V.BOARD_CIR[i]} ${name} 지연 ${n}건`)),
  ]);
}
