/* 화면 → 지도 연결점의 주소 한 곳(2026-10-14 지도 연결 작업). 지도는 `?project=`(사업 위치로 이동) 와 `?sgg=`(시군구 범위) 두 가지만 받는다.
   사업 id 가 있으면 사업으로, 없으면 시군구로, 둘 다 없으면 지도 첫 화면. 지도(app/(map))는 다른 루트 레이아웃이라 이 주소는 <a> 로 연다(<Link> 아님). */
export const mapHref = (o: { project?: string | null; sgg?: string | null } = {}): string =>
  o.project ? `/map?project=${encodeURIComponent(o.project)}` : o.sgg ? `/map?sgg=${encodeURIComponent(o.sgg)}` : '/map';
