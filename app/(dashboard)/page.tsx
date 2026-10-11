import Board, { type BoardReal } from '../../components/board/Board';
import RealPanels from '../../components/board/RealPanels';
import { NATION, lastMonth, monthsBetween, nextYm, ytd } from '../../lib/board/calc';
import { lh, molit, sources } from '../../lib/board/data';
import { loadLedgerBoard } from '../../lib/board/ledger-source';

/* 종합상황판(L0, 시안 이식). 실데이터는 '실데이터' 표지가 붙은 위젯 — 월별 실적(통계누리), 사업 원장 집계(월별 공급 파동·선택 시점 판정·시도·
   기관별 진행·향후 12개월, 원장 2026-10 기준 · 전국 아님), 원천 수(카탈로그). 총리 지시 6건(통계누리 착공 누계·원장 집계·원천 수)도 실데이터, SAMPLE 은 지연·주의 추이만. 월 상세로 가는 링크는 열리는 달(실적 + LH 예정 달)만 만든다. */
export default async function Home() {
  const src = await loadLedgerBoard();
  const last = lastMonth(molit);
  const lhMonths = [...new Set(lh.blocks.map((b) => b.date.slice(0, 7)))];
  const real: BoardReal = {
    sourceCount: sources.items.length,
    validMonths: [...new Set([...molit.months, ...lhMonths])],
    ledger: src.board,
    ledgerOrigin: src.origin,
    ledgerMonth: src.month,
    sido: Object.fromEntries(molit.sido.map((s) => [s.code, s.name])),
    lhAsOf: lh.sourceAsOf,
    lhAgeMonths: Math.max(0, monthsBetween(lh.sourceAsOf.slice(0, 7), last)),
    actualMonth: last,
    start: { year: last.slice(0, 4), upto: Number(last.slice(5)), cum: ytd(molit, 'start', NATION, last), cumLy: ytd(molit, 'start', NATION, nextYm(last, -12)) },
  };
  return <Board real={real} middle={<RealPanels />} />;
}
