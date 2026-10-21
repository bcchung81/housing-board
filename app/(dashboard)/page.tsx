import Board, { type BoardReal } from '@/components/board/Board';
import RealPanels from '@/components/board/RealPanels';
import { NATION, lastMonth, nextYm, ytd } from '@/lib/board/calc';
import { getBoardData } from '@/lib/board/data';
import * as View from '@/lib/board/projects-view';
import { boardLists } from '@/lib/board/board-lists';
import { getProjectsIndex } from '@/lib/board/projects-index';
import { monthIds } from '@/lib/board/month-ahead';
import { homeLh } from '@/lib/board/home-lh-plan';
import type { CalendarDoc } from '@/lib/board/region';
import calendarJson from '@/data/board/region-calendar.json';
import homeBoardJson from '@/data/board/home-board.json';
import type { LedgerBoard } from '@/lib/board/types';

const calendar = calendarJson as unknown as CalendarDoc;
/* 종합상황판 집계는 HOME 정책 추진현황(9·7) 규칙(tools/ledger/home-board.js → data/board/home-board.json, 2026-10-21 결정: HOME 과 같은 조건·같은 표기). 원장 집계(ledger)는 다른 화면이 쓴다 */
const homeBoard = homeBoardJson as unknown as LedgerBoard;

/* 종합상황판(L0, 시안 이식). 2026-10-21부터 원장 위젯(월별 공급 파동·판정·시도·추이·12개월·기관)과 월별 실적 흐름은 HOME 규칙 집계(home-board.json). 이전 설명: 실데이터는 '실데이터' 표지가 붙은 위젯 — 월별 실적(통계누리), 사업 원장 집계(월별 공급 파동·선택 시점 판정·시도·
   기관별 진행·향후 12개월, 원장 2026-10 기준 · 전국 아님), 원천 수(카탈로그). 총리 지시 6건(통계누리 착공 누계·원장 집계·원천 수)도 실데이터, 지연·주의 추이는 월 판정 이력(trend). 월 상세로 가는 링크는 열리는 달(실적 + LH 준공 예정 달(정책 진행 자료 9·7 연결 블록) + 9·7 공급 예정 달 — monthIds)만 만든다. */
export default async function Home() {
  const { molit, sources } = await getBoardData();
  const last = lastMonth(molit);
  const idx = await getProjectsIndex();
  const sidoOf = (c: string) => molit.sido.find((s) => s.code === c)?.name;
  const real: BoardReal = {
    sourceCount: sources.items.length,
    validMonths: monthIds(molit.months, homeLh.blocks, calendar),   // LH 준공 예정 달 = 정책 진행 자료 9·7 연결 블록(2026-10-21 W6)
    ledger: homeBoard,
    ledgerOrigin: 'json',
    ledgerMonth: homeBoard.observedMonth,
    sido: Object.fromEntries(molit.sido.map((s) => [s.code, s.name])),
    /* 지역 탭(2026-10-21 사용자 결정): 수도권 전체 + 시도별(그 시도 집계의 단계 부족) 목록을 같이 넘긴다 — 주소의 sido 가 열쇠라 겹치지 않는다 */
    lists: Object.assign(boardLists(View, idx.homeRows, sidoOf, homeBoard.home?.stageShort),
      ...Object.entries(homeBoard.byRegion ?? {}).map(([code, b]) => boardLists(View, idx.homeRows, sidoOf, b.home?.stageShort, code))),
    lhAsOf: homeLh.sourceAsOf,
    regionOkUnits: Object.fromEntries(homeBoard.regions.map((r) => [r.code, r.okUnits ?? 0])),
    actualMonth: last,
    start: { year: last.slice(0, 4), upto: Number(last.slice(5)), cum: ytd(molit, 'start', NATION, last), cumLy: ytd(molit, 'start', NATION, nextYm(last, -12)) },
  };
  /* HOME 집계면 월별 실적 흐름은 Board 가 지역 탭 값으로 그린다(HomeActual) — 통계누리 판(RealPanels)은 HOME 집계가 없을 때만 */
  return <Board real={real} middle={homeBoard.home ? null : <RealPanels />} />;
}
