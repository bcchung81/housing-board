/* 상단 메뉴와 파생 상세 화면의 경로 표(docs/product/상황판-셸-설계.md 1절).
   메뉴에는 1차 목적지만 두고, 상세(월·기관)는 위젯·표에서 내려가며 부모 메뉴가 강조된다.
   2026-10-10 메뉴 9 → 7: 단계별(/stage)·시군구 상세(/area/{시군구5})는 사업 목록의 거르기(?stage=·?sgg=)로 합쳤다.
   2026-10-14 메뉴 7 → 5(HOME 개념 흡수 시안 v2): 보고자료는 사업 화면의 '보고서 인쇄'(?print=1)로, 사업 상세는 사업 화면의 서랍(?id=)으로,
   공급 실적(/area·/agency)·우리 동네(/my-area)는 지역 공급(/region)으로 합쳤다. 옛 주소는 next.config.ts 의 redirects 가 넘긴다.
   월 상세(/month/{연-월})·기관 상세(/agency/{기관})는 종합상황판 위젯 링크가 쓰므로 남는다(메뉴에는 없다). 지역 공급은 상세 화면이 없다(?sido= 거르기). */

export type MenuId = 'home' | 'map' | 'projects' | 'region' | 'sources';
export type MenuItem = { id: MenuId; href: string; label: string; soon?: boolean };

export const MENU: MenuItem[] = [
  { id: 'home', href: '/', label: '종합상황판' },
  { id: 'map', href: '/map', label: '지도' },
  { id: 'projects', href: '/projects', label: '사업' },
  { id: 'region', href: '/region', label: '지역 공급' },
  { id: 'sources', href: '/sources', label: '데이터 원본' },
];

/* 첫 경로 마디 → 강조할 메뉴. 월 상세·기관 상세(/agency/{기관})는 종합상황판 위젯에서 내려가므로 종합상황판을 강조한다(빵부스러기도 '종합상황판 › 기관') */
const PARENT: Record<string, MenuId> = {
  '': 'home', month: 'home', map: 'map', projects: 'projects', region: 'region', agency: 'home', sources: 'sources',
};
export const activeMenuId = (pathname: string): MenuId | null => PARENT[pathname.split('/')[1] ?? ''] ?? null;

/* 목록 화면이 있는 구역: 이름과 들어올 내용 */
export const SECTIONS: Record<string, { label: string; note: string; soon?: boolean }> = {
  projects: { label: '사업', note: '사업 목록(렌즈·지역·단계·상태·기관 거르기)과 핵심 질문·단계 파이프라인·목표 대비. 행을 누르면 오른쪽 서랍에 사업 상세(?id=), 보고서 인쇄(?print=1)는 월간 진척 보고.' },
  region: { label: '지역 공급', note: '시도를 골라 앞으로 12개월 예정(모집·준공·입주) → 지난 공급 실적 → 동네 여건(?sido=).' },
  sources: { label: '데이터 원본', note: '원천 카탈로그: 모든 숫자의 출처·수집일·원천 기준일(스펙 9.3). 수집일과 원천 기준을 따로 보입니다.' },
};

/* 파생 상세: 이름·식별자 모양·올라갈 목록. 식별자는 새로 만들지 않는다(사업은 PRJ-{시군구5}-{일련4}).
   사업 상세는 화면이 아니라 사업 목록의 서랍(/projects?id=)이고, 옛 주소 /project/{id} 는 넘긴다 */
export const DETAILS: Record<string, { label: string; id: RegExp; list: string; idLabel: string }> = {
  project: { label: '사업 상세', id: /^PRJ-\d{5}-\d{4}$/, list: '/projects', idLabel: '사업 id' },
  agency: { label: '기관 상세', id: /^(lh|gh|sh|local|mnd)$/, list: '/', idLabel: '기관' },
  month: { label: '월 상세', id: /^\d{4}-(0[1-9]|1[0-2])$/, list: '/', idLabel: '연-월' },
};
