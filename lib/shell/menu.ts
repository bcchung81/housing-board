/* 사이드바 메뉴와 파생 상세 화면의 경로 표(docs/product/상황판-셸-설계.md 1절).
   사이드바에는 1차 목적지만 두고, 상세(월·시도·시군구·사업·단계·기관)는 위젯·표에서 내려가며 부모 메뉴가 강조된다. */

export type MenuId = 'home' | 'map' | 'projects' | 'area' | 'stage' | 'agency' | 'sources' | 'reports' | 'my-area';
export type MenuItem = { id: MenuId; href: string; label: string; soon?: boolean };

export const MENU: MenuItem[] = [
  { id: 'home', href: '/', label: '종합상황판' },
  { id: 'map', href: '/map', label: '지도' },
  { id: 'projects', href: '/projects', label: '사업' },
  { id: 'area', href: '/area', label: '지역별' },
  { id: 'stage', href: '/stage', label: '단계별' },
  { id: 'agency', href: '/agency', label: '기관별' },
  { id: 'sources', href: '/sources', label: '데이터 원본' },
  { id: 'reports', href: '/reports', label: '보고자료' },
  { id: 'my-area', href: '/my-area', label: '우리 동네' },
];

/* 첫 경로 마디 → 강조할 사이드바 메뉴. 월 상세는 종합상황판 위젯에서 내려가므로 ①을, 사업 상세는 ③을 강조한다. */
const PARENT: Record<string, MenuId> = {
  '': 'home', month: 'home', map: 'map', projects: 'projects', project: 'projects', area: 'area', stage: 'stage',
  agency: 'agency', sources: 'sources', reports: 'reports', 'my-area': 'my-area',
};
export const activeMenuId = (pathname: string): MenuId | null => PARENT[pathname.split('/')[1] ?? ''] ?? null;

/* 목록 화면(/projects ...)이 있는 구역. 준비 중 화면도 여기서 이름과 들어올 내용을 얻는다. */
export const SECTIONS: Record<string, { label: string; note: string; soon?: boolean }> = {
  projects: { label: '사업(현황표)', note: '사업 목록(이름·6단계·호수). 행을 누르면 사업 상세로 내려갑니다. 사업 id 레지스트리 77건으로 열 수 있습니다.' },
  area: { label: '지역별', note: '시도 17곳 → 시군구 → 사업으로 내려가는 목록. 시도별 월별 실적·시행주체별 호수는 지금 자료로 채울 수 있고, 지연율은 전국 인허가 적재 뒤에 열립니다.' },
  stage: { label: '단계별', note: '6단계(01 정책 ~ 06 입주)별 사업 수와 병목. 단계마다 머문 사업 목록으로 내려갑니다.' },
  agency: { label: '기관별', note: 'LH·GH·SH·지자체·국방부별 사업·호수·단계 분포. 국방부는 수작업 입력 대기입니다.' },
  sources: { label: '데이터 원본', note: '원천 카탈로그: 모든 숫자의 출처·수집일·원천 기준일(스펙 9.3). 수집일과 원천 기준을 따로 보입니다.' },
  reports: { label: '보고자료', note: '월간 주택공급 브리핑: 매월 진척상황 보고(8.14 지시)를 위한 실데이터 집계.' },
  'my-area': { label: '우리 동네', note: '국민 공개: 시도를 골라 앞으로 1년의 공공주택 준공 예정과 진행 중인 사업을 봅니다(9.4 국민 예측가능성 지시).' },
};

/* 파생 상세 `/{section}/{id}`: 이름·식별자 모양·올라갈 목록. 식별자는 새로 만들지 않는다(지역은 AreaRef 코드, 사업은 PRJ-{시군구5}-{일련4}). */
export const DETAILS: Record<string, { label: string; id: RegExp; list: string; idLabel: string }> = {
  area: { label: '지역 상세', id: /^(\d{2}|\d{5})$/, list: '/area', idLabel: '시도 2자리 · 시군구 5자리 코드' },
  project: { label: '사업 상세', id: /^PRJ-\d{5}-\d{4}$/, list: '/projects', idLabel: '사업 id' },
  stage: { label: '단계 상세', id: /^0[1-6]$/, list: '/stage', idLabel: '6단계 코드' },
  agency: { label: '기관 상세', id: /^(lh|gh|sh|local|mnd)$/, list: '/agency', idLabel: '기관' },
  month: { label: '월 상세', id: /^\d{4}-(0[1-9]|1[0-2])$/, list: '/', idLabel: '연-월' },
  'my-area': { label: '우리 동네 시도', id: /^\d{2}$/, list: '/my-area', idLabel: '시도 2자리 코드' },
};
