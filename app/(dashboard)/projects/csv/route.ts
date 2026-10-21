/* 사업 목록 CSV 내려받기(/projects/csv?…): 사업 화면(/projects)과 같은 쿼리·같은 거르기·같은 순서(지연 → 주의 → 정상), 열 = 원천 행 id + 화면 열(빈 열·지도 표지 제외) + 사업 원장 id.
   행 = HOME 원천 행(2026-10-21 PoC 규칙 — getHomeProjects). 열·칸은 lib/board/projects-list.ts 한 곳, CSV 글자는 lib/grid/spec.ts toCsv(UTF-8 BOM · CRLF). */
import { sidoName } from '@/lib/board/calc';
import { getBoardData } from '@/lib/board/data';
import { getHomeProjects } from '@/lib/board/projects-index';
import { guOf } from '@/lib/board/metro-overview';
import { HOME_LIST_COLS, dropBlank, homeCsvCols, homeCsvRows, homeListRows } from '@/lib/board/projects-list';
import { applyFilters, homeChartOf, homeListOrder, parseFilters } from '@/lib/board/projects-view';
import { toCsv } from '@/lib/grid/spec';

export async function GET(req: Request) {
  const q = Object.fromEntries(new URL(req.url).searchParams);
  const [{ molit }, idx] = await Promise.all([getBoardData(), getHomeProjects()]);
  const f = parseFilters(q, { policies: idx.policies, programs: idx.programs, sidoOk: (c) => !!sidoName(molit, c), guOf, home: { agencies: idx.agencies.map((a) => a.name) } });
  const list = homeListOrder(applyFilters(idx.rows, f));
  const rows = homeListRows(list, f, null, (c) => sidoName(molit, c), homeChartOf(f));
  const body = toCsv(homeCsvCols(dropBlank(HOME_LIST_COLS, rows).cols), homeCsvRows(rows, list));
  const name = `사업목록_${idx.referenceDate.replace(/-/g, '')}.csv`;
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="projects_${idx.referenceDate.replace(/-/g, '')}.csv"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'no-store',
    },
  });
}
