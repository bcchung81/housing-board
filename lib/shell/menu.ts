/* 사이드바 메뉴와 파생 상세 화면의 경로 표(docs/product/상황판-셸-설계.md 1절).
   사이드바에는 1차 목적지만 두고, 상세(월·시도·사업·기관)는 위젯·표에서 내려가며 부모 메뉴가 강조된다.
   2026-10-10 메뉴 9 → 7: 단계별(/stage)·시군구 상세(/area/{시군구5})는 사업 목록의 거르기(?stage=·?sgg=)로, 지역별·기관별은 '공급 실적'의 두 보기(/area·/agency)로 합쳤다.
   옛 주소는 next.config.ts 의 redirects 가 넘긴다. */

export type MenuId = 'home' | 'map' | 'projects' | 'area' | 'sources' | 'reports' | 'my-area';
export type MenuItem = { id: MenuId; href: string; label: string; soon?: boolean };

export const MENU: MenuItem[] = [
  { id: 'home', href: '/', label: '종합상황판' },
  { id: 'map', href: '/map', label: '지도' },
  { id: 'projects', href: '/projects', label: '사업' },
  { id: 'area', href: '/area', label: '공급 실적' },
  { id: 'sources', href: '/sources', label: '데이터 원본' },
  { id: 'reports', href: '/reports', label: '보고자료' },
  { id: 'my-area', href: '/my-area', label: '우리 동네' },
];

/* 첫 경로 마디 → 강조할 사이드바 메뉴. 월 상세는 종합상황판 위젯에서 내려가므로 ①을, 사업 상세는 ③을, 시행주체별(/agency)은 공급 실적을 강조한다. */
const PARENT: Record<string, MenuId> = {
  '': 'home', month: 'home', map: 'map', projects: 'projects', project: 'projects', area: 'area',
  agency: 'area', sources: 'sources', reports: 'reports', 'my-area': 'my-area',
};
export const activeMenuId = (pathname: string): MenuId | null => PARENT[pathname.split('/')[1] ?? ''] ?? null;

/* 목록 화면(/projects ...)이 있는 구역. 준비 중 화면도 여기서 이름과 들어올 내용을 얻는다. */
export const SECTIONS: Record<string, { label: string; note: string; soon?: boolean }> = {
  projects: { label: '사업(현황표)', note: '사업 목록(이름·6단계·호수). 시군구·6단계로 거르고(?sgg=·?stage=), 행을 누르면 사업 상세로 내려갑니다. 사업 id 레지스트리 77건으로 열 수 있습니다.' },
  area: { label: '공급 실적', note: '통계누리 주택건설실적통계의 두 보기: 시도별(/area → 시도 → 그 시도의 사업)과 시행주체별(/agency → LH·GH·SH·지자체·국방부). 지연율·기관별 신호는 일정 적재 뒤에 열립니다.' },
  sources: { label: '데이터 원본', note: '원천 카탈로그: 모든 숫자의 출처·수집일·원천 기준일(스펙 9.3). 수집일과 원천 기준을 따로 보입니다.' },
  reports: { label: '보고자료', note: '월간 주택공급 브리핑: 매월 진척상황 보고(8.14 지시)를 위한 실데이터 집계.' },
  'my-area': { label: '우리 동네', note: '국민 공개: 시도를 골라 앞으로 1년의 공공주택 준공 예정과 진행 중인 사업을 봅니다(9.4 국민 예측가능성 지시).' },
};

/* 파생 상세 `/{section}/{id}`: 이름·식별자 모양·올라갈 목록. 식별자는 새로 만들지 않는다(지역은 AreaRef 코드, 사업은 PRJ-{시군구5}-{일련4}). */
export const DETAILS: Record<string, { label: string; id: RegExp; list: string; idLabel: string }> = {
  area: { label: '시도 상세', id: /^\d{2}$/, list: '/area', idLabel: '시도 2자리 코드' },
  project: { label: '사업 상세', id: /^PRJ-\d{5}-\d{4}$/, list: '/projects', idLabel: '사업 id' },
  agency: { label: '기관 상세', id: /^(lh|gh|sh|local|mnd)$/, list: '/agency', idLabel: '기관' },
  month: { label: '월 상세', id: /^\d{4}-(0[1-9]|1[0-2])$/, list: '/', idLabel: '연-월' },
  'my-area': { label: '우리 동네 시도', id: /^\d{2}$/, list: '/my-area', idLabel: '시도 2자리 코드' },
};
