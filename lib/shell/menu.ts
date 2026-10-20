/* 상단 메뉴와 파생 상세 화면의 경로 표(docs/product/상황판-셸-설계.md 1절).
   메뉴에는 1차 목적지만 두고, 상세(월·기관)는 위젯·표에서 내려가며 부모 메뉴가 강조된다.
   2026-10-10 메뉴 9 → 7: 단계별(/stage)·시군구 상세(/area/{시군구5})는 사업 목록의 거르기(?stage=·?sgg=)로 합쳤다.
   2026-10-14 메뉴 7 → 5(HOME 개념 흡수 시안 v2): 보고자료는 사업 화면의 '보고서 인쇄'(?print=1)로, 사업 상세는 사업 화면의 서랍(?id=)으로,
   공급 실적(/area·/agency)·우리 동네(/my-area)는 지역 공급(/region)으로 합쳤다. 옛 주소는 next.config.ts 의 redirects 가 넘긴다.
   월 상세(/month/{연-월})·기관 상세(/agency/{기관})는 종합상황판 위젯 링크가 쓰므로 남는다(메뉴에는 없다). 지역 공급은 상세 화면이 없다(?sido= 거르기). */

/* 2026-10-19 관점별 메뉴: 정책담당자 = 종합상황판·지도·사업·지역 공급·데이터 원본, 일반사용자 = 종합상황판(/citizen)·지도·사업 찾기·공급 일정.
   adminOnly 는 html[data-aud=public] 에서, publicOnly 는 html[data-aud=admin] 에서 CSS 로 숨긴다(TopNav — 첫 그림부터). 한 배열이라 두 관점 모두 위 순서 그대로 보인다.
   peer = 다른 관점의 같은 화면(보기 대상 스위치를 그 화면에서 바꾸면 그리로 간다 — peerHref) */
export type MenuId = 'home' | 'map' | 'projects' | 'region' | 'sources' | 'find' | 'schedule';
export type MenuItem = { id: MenuId; href: string; label: string; soon?: boolean; adminOnly?: boolean; publicOnly?: boolean; peer?: string };

export const MENU: MenuItem[] = [
  { id: 'home', href: '/', label: '종합상황판' },
  { id: 'map', href: '/map', label: '지도' },
  { id: 'projects', href: '/projects', label: '사업', adminOnly: true, peer: '/citizen/projects' },
  { id: 'region', href: '/region', label: '지역 공급', adminOnly: true, peer: '/citizen/schedule' },
  { id: 'sources', href: '/sources', label: '데이터 원본', adminOnly: true },
  { id: 'find', href: '/citizen/projects', label: '사업 찾기', publicOnly: true, peer: '/projects' },
  { id: 'schedule', href: '/citizen/schedule', label: '공급 일정', publicOnly: true, peer: '/region' },
];

/* 보기 대상 스위치의 갈 곳: 지금 화면에 다른 관점의 짝(peer)이 있으면 그 화면으로(지역·사업 쿼리 ?sido·?sgg·?id 만 넘긴다 — 단계·검색은 두 화면의 값이 달라 버린다),
   없으면 null(그 관점의 첫 화면으로 — TopNav homeOf). 시도·시군구는 수도권 안일 때만 일반사용자 화면으로 넘긴다(일반사용자 화면은 수도권만) */
const PEER_KEYS = ['sido', 'sgg', 'id'] as const;
export function peerHref(pathname: string, search: string, next: 'public' | 'admin'): string | null {
  const m = MENU.find((x) => x.href === pathname && x.peer && (next === 'public' ? x.adminOnly : x.publicOnly));
  if (!m || !m.peer) return null;
  const from = new URLSearchParams(search), q = new URLSearchParams();
  for (const k of PEER_KEYS) {
    const v = from.get(k);
    if (!v) continue;
    if (next === 'public' && k !== 'id' && !/^(11|28|41)/.test(v)) continue;
    if (next === 'admin' && k === 'sido' && v === 'metro') continue;   // 정책 화면은 지역이 없으면 수도권
    q.set(k, v);
  }
  const s = q.toString();
  return s ? `${m.peer}?${s}` : m.peer;
}

/* /citizen 이 저장한 내 동네(localStorage 'myArea': 시군구 5자리 또는 시도 2자리) → mapHref 에 넘길 범위. 그 밖의 값은 범위 없음(= '/map') */
export const myAreaScope = (raw: string | null | undefined): { sgg?: string; sido?: string } => (/^\d{5}$/.test(raw ?? '') ? { sgg: raw as string } : /^\d{2}$/.test(raw ?? '') ? { sido: raw as string } : {});

/* 첫 경로 마디 → 강조할 메뉴. 월 상세·기관 상세(/agency/{기관})는 종합상황판 위젯에서 내려가므로 종합상황판을 강조한다(빵부스러기도 '종합상황판 › 기관') */
const PARENT: Record<string, MenuId> = {
  '': 'home', month: 'home', map: 'map', projects: 'projects', region: 'region', agency: 'home', sources: 'sources',
};
/* 일반사용자 화면은 /citizen 아래 두 마디(/citizen 자체는 정적 문서라 이 메뉴 바를 쓰지 않는다) */
const PUBLIC_PARENT: Record<string, MenuId> = { 'citizen/projects': 'find', 'citizen/schedule': 'schedule' };
export const activeMenuId = (pathname: string): MenuId | null => PUBLIC_PARENT[pathname.split('/').slice(1, 3).join('/')] ?? PARENT[pathname.split('/')[1] ?? ''] ?? null;

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
  agency: { label: '기관 상세', id: /^(lh|gh|sh|ih|local|mnd)$/, list: '/', idLabel: '기관' },
  month: { label: '월 상세', id: /^\d{4}-(0[1-9]|1[0-2])$/, list: '/', idLabel: '연-월' },
};
