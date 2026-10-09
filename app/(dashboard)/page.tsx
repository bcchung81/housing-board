import Board, { type BoardReal } from '../../components/board/Board';
import RealPanels from '../../components/board/RealPanels';
import { lastMonth, lhByMonth, monthsBetween } from '../../lib/board/calc';
import { lh, molit, sources } from '../../lib/board/data';
import './board.css';

/* 종합상황판(L0, 시안 이식). 시안 수치는 SAMPLE(위젯마다 표지)이고, 실데이터는 '실데이터' 표지가 붙은 위젯 — 월별 실적·시행주체별(통계누리),
   향후 12개월 LH 준공 예정, 원천 수(카탈로그). 월 상세로 가는 링크는 열리는 달(실적 + LH 예정 달)만 만든다. */
export default function Home() {
  const last = lastMonth(molit);
  const lhMonths = [...new Set(lh.blocks.map((b) => b.date.slice(0, 7)))];
  const real: BoardReal = {
    sourceCount: sources.items.length,
    validMonths: [...new Set([...molit.months, ...lhMonths])],
    lh: lhByMonth(lh, '2026-10', 12),   // 시안의 NOW(2026.10)부터 12개월
    lhAsOf: lh.sourceAsOf,
    lhAgeMonths: Math.max(0, monthsBetween(lh.sourceAsOf.slice(0, 7), last)),
    actualMonth: last,
  };
  return <Board real={real} middle={<RealPanels />} />;
}
