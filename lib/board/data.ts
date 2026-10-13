/* 화면 자료를 읽는 곳(서버 컴포넌트가 쓴다. 클라이언트 번들에는 실리지 않는다). 원천은 Supabase(api.board·api.screens)이고, 안 되면 번들 JSON — 각 *-source.ts 가 맡는다. 계산은 calc.ts. */
import { cache } from 'react';
import { loadLedgerBoard } from './ledger-source';
import { loadScreens } from './screen-source';

/* 요청마다 한 번만 읽는다(cache). ledger 는 사업 원장 집계(종합상황판 카드), AHEAD_FROM 은 앞으로의 물량을 세는 기준 달:
   종합상황판의 '향후 12개월'과 같은 달(원장 관측 달 — 월 갱신을 따라간다). 보고자료·우리 동네가 쓴다 */
export const getBoardData = cache(async () => {
  const [l, s] = await Promise.all([loadLedgerBoard(), loadScreens()]);
  return {
    molit: s.molit, lh: s.lh, sources: s.sources, projects: s.projects,
    ledger: l.board, AHEAD_FROM: l.board.observedMonth,
    origin: s.origin, month: s.month, runId: s.runId,
    ledgerOrigin: l.origin, ledgerMonth: l.month,
  };
});

/* 사업 레지스트리가 다루는 시군구: 이름은 /api/v1/resolve 응답(행정표준코드)으로 확인한 값이다(2026-10-09). */
export const SGG: Record<string, { name: string; sido: string }> = {
  '11290': { name: '서울특별시 성북구', sido: '11' },
  '12170': { name: '전남광주통합특별시 나주시', sido: '12' },
  '12330': { name: '전남광주통합특별시 광산구', sido: '12' },
  '28245': { name: '인천광역시 계양구', sido: '28' },
  '41450': { name: '경기도 하남시', sido: '41' },
};
