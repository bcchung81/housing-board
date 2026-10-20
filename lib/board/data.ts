/* 화면 자료를 읽는 곳(서버 컴포넌트가 쓴다. 클라이언트 번들에는 실리지 않는다). 원천은 Supabase(api.board·api.screens)이고, 안 되면 번들 JSON — 각 *-source.ts 가 맡는다. 계산은 calc.ts. */
import { cache } from 'react';
import { loadLedgerBoard } from './ledger-source';
import { loadScreens } from './screen-source';
import { capitalLh, capitalMolit } from './calc';

/* 요청마다 한 번만 읽는다(cache). ledger 는 사업 원장 집계(종합상황판 카드), AHEAD_FROM 은 앞으로의 물량을 세는 기준 달:
   종합상황판의 '향후 12개월'과 같은 달(원장 관측 달 — 월 갱신을 따라간다). 보고자료·우리 동네가 쓴다.
   projects 는 살아 있는 레지스트리 사업(대체 supersededBy·숨김 hiddenAt 제외 — 수도권은 HOME 사업이 대신한다), allProjects 는 전부(사업 상세가 옛 id 를 새 사업으로 넘기거나 안내한다).
   통계누리·LH 준공예정은 수도권으로 줄여 넘긴다(calc.ts capitalMolit·capitalLh — 2026-10-19 결정: 화면은 수도권, 통계누리 합계 자리 '00' = 서울+인천+경기) */
export const getBoardData = cache(async () => {
  const [l, s] = await Promise.all([loadLedgerBoard(), loadScreens()]);
  return {
    molit: capitalMolit(s.molit), lh: capitalLh(s.lh), sources: s.sources, projects: s.projects.filter((p) => !p.supersededBy && !p.hiddenAt), allProjects: s.projects,
    ledger: l.board, AHEAD_FROM: l.board.observedMonth,
    origin: s.origin, month: s.month, runId: s.runId,
    ledgerOrigin: l.origin, ledgerMonth: l.month,
  };
});

/* 사업 레지스트리가 다루는 시군구: 이름은 /api/v1/resolve 응답(행정표준코드)으로 확인한 값이다(2026-10-09). 수도권 HOME 발급 사업(2026-10-14)의 시군구는 법정동코드 파일(국토교통부 15123287)의 이름 */
export const SGG: Record<string, { name: string; sido: string }> = {
  '11110': { name: '서울특별시 종로구', sido: '11' },
  '11140': { name: '서울특별시 중구', sido: '11' },
  '11170': { name: '서울특별시 용산구', sido: '11' },
  '11200': { name: '서울특별시 성동구', sido: '11' },
  '11215': { name: '서울특별시 광진구', sido: '11' },
  '11230': { name: '서울특별시 동대문구', sido: '11' },
  '11260': { name: '서울특별시 중랑구', sido: '11' },
  '11290': { name: '서울특별시 성북구', sido: '11' },
  '11305': { name: '서울특별시 강북구', sido: '11' },
  '11320': { name: '서울특별시 도봉구', sido: '11' },
  '11350': { name: '서울특별시 노원구', sido: '11' },
  '11380': { name: '서울특별시 은평구', sido: '11' },
  '11410': { name: '서울특별시 서대문구', sido: '11' },
  '11440': { name: '서울특별시 마포구', sido: '11' },
  '11470': { name: '서울특별시 양천구', sido: '11' },
  '11500': { name: '서울특별시 강서구', sido: '11' },
  '11530': { name: '서울특별시 구로구', sido: '11' },
  '11545': { name: '서울특별시 금천구', sido: '11' },
  '11560': { name: '서울특별시 영등포구', sido: '11' },
  '11590': { name: '서울특별시 동작구', sido: '11' },
  '11620': { name: '서울특별시 관악구', sido: '11' },
  '11650': { name: '서울특별시 서초구', sido: '11' },
  '11680': { name: '서울특별시 강남구', sido: '11' },
  '11710': { name: '서울특별시 송파구', sido: '11' },
  '11740': { name: '서울특별시 강동구', sido: '11' },
  '12170': { name: '전남광주통합특별시 나주시', sido: '12' },
  '12330': { name: '전남광주통합특별시 광산구', sido: '12' },
  '28125': { name: '인천광역시 제물포구', sido: '28' },
  '28155': { name: '인천광역시 영종구', sido: '28' },
  '28177': { name: '인천광역시 미추홀구', sido: '28' },
  '28185': { name: '인천광역시 연수구', sido: '28' },   // 2026-10-20 HOME 판에 연수구 사업이 처음 생겼다(법정동코드 이름)
  '28200': { name: '인천광역시 남동구', sido: '28' },
  '28237': { name: '인천광역시 부평구', sido: '28' },
  '28245': { name: '인천광역시 계양구', sido: '28' },
  '28275': { name: '인천광역시 서해구', sido: '28' },
  '28290': { name: '인천광역시 검단구', sido: '28' },
  '41110': { name: '경기도 수원시', sido: '41' },
  '41113': { name: '경기도 수원시 권선구', sido: '41' },
  '41130': { name: '경기도 성남시', sido: '41' },
  '41131': { name: '경기도 성남시 수정구', sido: '41' },
  '41133': { name: '경기도 성남시 중원구', sido: '41' },
  '41135': { name: '경기도 성남시 분당구', sido: '41' },
  '41150': { name: '경기도 의정부시', sido: '41' },
  '41170': { name: '경기도 안양시', sido: '41' },
  '41190': { name: '경기도 부천시', sido: '41' },
  '41192': { name: '경기도 부천시 원미구', sido: '41' },
  '41194': { name: '경기도 부천시 소사구', sido: '41' },
  '41196': { name: '경기도 부천시 오정구', sido: '41' },
  '41210': { name: '경기도 광명시', sido: '41' },
  '41220': { name: '경기도 평택시', sido: '41' },
  '41270': { name: '경기도 안산시', sido: '41' },
  '41273': { name: '경기도 안산시 단원구', sido: '41' },
  '41281': { name: '경기도 고양시 덕양구', sido: '41' },
  '41285': { name: '경기도 고양시 일산동구', sido: '41' },
  '41290': { name: '경기도 과천시', sido: '41' },
  '41310': { name: '경기도 구리시', sido: '41' },
  '41360': { name: '경기도 남양주시', sido: '41' },
  '41370': { name: '경기도 오산시', sido: '41' },
  '41390': { name: '경기도 시흥시', sido: '41' },
  '41410': { name: '경기도 군포시', sido: '41' },
  '41430': { name: '경기도 의왕시', sido: '41' },
  '41450': { name: '경기도 하남시', sido: '41' },
  '41463': { name: '경기도 용인시 기흥구', sido: '41' },
  '41480': { name: '경기도 파주시', sido: '41' },
  '41500': { name: '경기도 이천시', sido: '41' },
  '41570': { name: '경기도 김포시', sido: '41' },
  '41590': { name: '경기도 화성시', sido: '41' },
  '41595': { name: '경기도 화성시 병점구', sido: '41' },
  '41610': { name: '경기도 광주시', sido: '41' },
  '41630': { name: '경기도 양주시', sido: '41' },
  '41830': { name: '경기도 양평군', sido: '41' },
};
