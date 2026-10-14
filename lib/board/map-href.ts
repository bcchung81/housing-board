/* 지도 자료가 있는 시도(서울·인천·경기) — projects-view METRO_SIDO 와 같은 값(이 파일은 가져오는 것 없이 시험에서 바로 읽힌다) */
const METRO_SIDO = ['11', '28', '41'];

/* 화면 → 지도 연결점의 주소 한 곳(2026-10-14 지도 연결 작업). 지도는 `?project=`(사업 위치로 이동) · `?sgg=`(시군구 범위) · `?sido=`(시도 개요) 셋을 받는다.
   우선순위 사업 > 시군구 > 시도 > 지도 첫 화면(수도권 개요). 지도(app/(map))는 다른 루트 레이아웃이라 이 주소는 <a> 로 연다(<Link> 아님).
   mapHref 는 항상 주소를 돌려준다(수도권 밖 sido 는 `?sido=` 를 붙이지 않고 첫 화면). 지도 자료가 서울·인천·경기뿐이라 화면의 지역 연결점은
   mapScopeHref 로 만든다 — 수도권 밖이면 null(연결점을 숨긴다). */
export const mapHref = (o: { project?: string | null; sgg?: string | null; sido?: string | null } = {}): string =>
  o.project ? `/map?project=${encodeURIComponent(o.project)}` : o.sgg ? `/map?sgg=${encodeURIComponent(o.sgg)}` : o.sido && METRO_SIDO.includes(o.sido) ? `/map?sido=${o.sido}` : '/map';

/* 지역 범위 → 지도 주소. sgg 하나 > sido 하나 > 수도권 전체(둘 다 없음 = '/map'). 수도권 밖 sgg·sido 는 null */
export const mapScopeHref = (o: { sgg?: string | null; sido?: string | null } = {}): string | null => {
  if (o.sgg) return METRO_SIDO.includes(o.sgg.slice(0, 2)) ? mapHref({ sgg: o.sgg }) : null;
  if (o.sido) return METRO_SIDO.includes(o.sido) ? mapHref({ sido: o.sido }) : null;
  return mapHref();
};
