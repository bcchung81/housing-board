/* 종합상황판 링크가 '목록 창'으로 여는 사업 목록(2026-10-20) — 서버가 /projects 화면과 같은 함수(parseFilters → applyFilters → listOrder)로 미리 계산한다.
   projects-view 는 Node 시험이 확장자 없는 import 를 읽지 못해 함수째 넘겨받는다(directives.ts bottleneck 과 같은 방식). 링크 href 가 곧 열쇠다(상황판 지시 카드·판정 카드·병목 링크가 같은 href). 직렬화되는 칸만 담는다(행 원자료 pks·bundles 는 넘기지 않는다). */
import type * as View from './projects-view';

export type ViewFns = Pick<typeof View, 'BOARD_CIR' | 'BOARD_NAMES' | 'applyFilters' | 'listHref' | 'listOrder' | 'overdueMonthsOf' | 'parseFilters'>;
export type BoardList = { title: string; rows: { href: string; name: string; meta?: string }[] };

/* 창으로 여는 링크(상황판이 거는 주소 — lib/board/directives.ts·components/board/Board.tsx 와 같은 글자) */
export const LIST_LATE = '/projects?sido=all&status=late';
export const LIST_REVIEW = '/projects?sido=all&status=review-late';
export const LIST_CAUTION = '/projects?sido=all&status=caution';
export const listStage = (i: number) => `/projects?sido=all&stage=${i}&status=late`;

/* 시도 이름이 있으면 '경기 고양시'(projects-list sggLabel 규칙), 지연 개월이 있으면 '+n개월' */
const shortSgg = (name: string, sido?: string) => { const t = name.split(' '); return t.length < 2 ? name : sido ? `${sido} ${t.slice(1).join(' ')}` : name; };

export function boardLists(V: ViewFns, rows: View.ProjectRow[], sido: (code: string) => string | undefined): Record<string, BoardList> {
  const make = (href: string, title: (n: number) => string): [string, BoardList] => {
    const q = Object.fromEntries(new URL(href, 'http://x').searchParams);
    const f = V.parseFilters(q, { policies: [], programs: [], sidoOk: () => true });
    const list = V.listOrder(V.applyFilters(rows, f));
    return [href, {
      title: title(list.length),
      rows: list.map((r) => {
        const late = V.overdueMonthsOf(r), meta = [shortSgg(r.sggName, sido(r.sgg.slice(0, 2))), late !== null ? `+${late}개월` : ''].filter(Boolean).join(' · ');
        return { href: V.listHref(f, r.issued ? { id: r.id } : { cand: r.id }), name: r.name, ...(meta ? { meta } : {}) };
      }),
    }];
  };
  return Object.fromEntries([
    make(LIST_LATE, (n) => `지연 확정 ${n}건`),
    make(LIST_REVIEW, (n) => `후보 계산 ${n}건`),
    make(LIST_CAUTION, (n) => `주의 ${n}건`),
    ...V.BOARD_NAMES.map((name, i) => make(listStage(i), (n) => `${V.BOARD_CIR[i]} ${name} 지연 ${n}건`)),
  ]);
}
