/* 지도 자료가 있는 시도(서울·인천·경기) — projects-view METRO_SIDO 와 같은 값(이 파일은 가져오는 것 없이 시험에서 바로 읽힌다) */
const METRO_SIDO = ['11', '28', '41'];

/* 화면 → 지도 연결점의 주소 한 곳(2026-10-14 지도 연결 작업). 지도는 `?project=`(사업 위치로 이동) · `?sgg=`(시군구 범위) · `?sido=`(시도 개요, `&pick=` 구가 있는 시의 구 메뉴) 를 받는다.
   우선순위 사업 > 시군구 > 시도 > 지도 첫 화면(수도권 개요). 지도(app/(map))는 다른 루트 레이아웃이라 이 주소는 <a> 로 연다(<Link> 아님).
   mapHref 는 항상 주소를 돌려준다(수도권 밖 sido 는 `?sido=` 를 붙이지 않고 첫 화면). 지도 자료가 서울·인천·경기뿐이라 화면의 지역 연결점은
   mapScopeHref 로 만든다 — 수도권 밖이면 null(연결점을 숨긴다). */
/* 구가 있는 경기 시(수원·성남·안양·부천·안산·고양·용인·화성)의 시 코드 — 지도 개요 코드표의 guOf(lib/board/metro-overview.ts)로 구가 있는 시와 같다(시험으로 확인:
   tests/js/screens-d.test.cjs). 이 파일은 Node 시험이 그대로 읽어 다른 .ts 를 가져올 수 없어 값으로 둔다.
   원장 사업은 구 코드(41281 등)에 있어 시 코드 ?sgg=41280 지도는 0건이다 → 개요를 경기에 맞추고 그 시의 구 메뉴를 연 주소(?sido=41&pick=시 코드)로 보낸다(2026-10-15 평가) */
export const GU_CITY = ['41110', '41130', '41170', '41190', '41270', '41280', '41460', '41590'];
export const mapHref = (o: { project?: string | null; sgg?: string | null; sido?: string | null } = {}): string =>
  o.project ? `/map?project=${encodeURIComponent(o.project)}` : o.sgg ? (GU_CITY.includes(o.sgg) ? `/map?sido=41&pick=${o.sgg}` : `/map?sgg=${encodeURIComponent(o.sgg)}`) : o.sido && METRO_SIDO.includes(o.sido) ? `/map?sido=${o.sido}` : '/map';

/* 지역 범위 → 지도 주소. sgg 하나 > sido 하나 > 수도권 전체(둘 다 없음 = '/map'). 수도권 밖 sgg·sido 는 null */
export const mapScopeHref = (o: { sgg?: string | null; sido?: string | null } = {}): string | null => {
  if (o.sgg) return METRO_SIDO.includes(o.sgg.slice(0, 2)) ? mapHref({ sgg: o.sgg }) : null;
  if (o.sido) return METRO_SIDO.includes(o.sido) ? mapHref({ sido: o.sido }) : null;
  return mapHref();
};
