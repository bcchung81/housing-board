/* 사업 목록 CSV 내려받기(/projects/csv?…): 사업 화면(/projects)과 같은 쿼리·같은 거르기·같은 순서(점검 필요 순), 열 = 화면 열(빈 열·지도 표지 제외).
   열·칸은 lib/board/projects-list.ts 한 곳, CSV 글자는 lib/grid/spec.ts toCsv(UTF-8 BOM · CRLF). */
import { sidoName } from '../../../../lib/board/calc';
import { getBoardData } from '../../../../lib/board/data';
import { getProjectsIndex } from '../../../../lib/board/projects-index';
import { LIST_COLS, csvCols, dropBlank, listRows } from '../../../../lib/board/projects-list';
import { applyFilters, listOrder, parseFilters } from '../../../../lib/board/projects-view';
import { toCsv } from '../../../../lib/grid/spec';

export async function GET(req: Request) {
  const q = Object.fromEntries(new URL(req.url).searchParams);
  const [{ molit }, idx] = await Promise.all([getBoardData(), getProjectsIndex()]);
  const f = parseFilters(q, { policies: idx.policies, programs: idx.programs, sidoOk: (c) => !!sidoName(molit, c) });
  const rows = listRows(listOrder(applyFilters(idx.rows, f)), f, null, (c) => sidoName(molit, c));
  const body = toCsv(csvCols(dropBlank(LIST_COLS, rows).cols), rows);
  const name = `사업목록_${idx.referenceDate.replace(/-/g, '')}.csv`;
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="projects_${idx.referenceDate.replace(/-/g, '')}.csv"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'no-store',
    },
  });
}
