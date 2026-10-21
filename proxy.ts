import { NextResponse, type NextRequest } from 'next/server';

/* 옛 지도 주소 호환(기획서 M6): 지도가 `/`였을 때의 링크(`/?region=…` `/?code=…` `/?pnu=…` `/?at=…` 등)는 `/map?…`로 보낸다.
   `/`에는 쿼리를 쓰는 화면이 없으므로 쿼리가 있으면 전부 지도다. 쿼리 이름·우선순위는 스펙 2.1 그대로다. */
const TRACKING_KEYS = new Set(['fbclid', 'gclid', 'gbraid', 'wbraid', 'igshid', 'msclkid', 'yclid', 'dclid', 'mc_cid', 'mc_eid', '_ga', '_gl', 'ref', 'ref_src']);

/* 공유·광고 추적 쿼리(`/?fbclid=…` `/?utm_source=…`)만 붙은 첫 방문까지 지도로 보내면 안 되므로, 키가 전부 추적용이면 넘기지 않는다. */
export function isTrackingOnly(searchParams: URLSearchParams): boolean {
  const keys = [...searchParams.keys()];
  return keys.length > 0 && keys.every((k) => k.startsWith('utm_') || TRACKING_KEYS.has(k));
}

/* 종합상황판 지역 탭(2026-10-21 사용자 결정 — `/?area=11`: 수도권 전체·서울·경기·인천)은 '/' 화면의 쿼리라 지도로 넘기지 않는다(옛 지도 쿼리에 area 는 없다) */
export function isBoardOnly(searchParams: URLSearchParams): boolean {
  const keys = [...searchParams.keys()];
  return keys.includes('area') && keys.every((k) => k === 'area' || k.startsWith('utm_') || TRACKING_KEYS.has(k));
}

export function proxy(request: NextRequest) {
  const { search, searchParams } = request.nextUrl;
  if (search && !isTrackingOnly(searchParams) && !isBoardOnly(searchParams)) return NextResponse.redirect(new URL('/map' + search, request.url));
  return NextResponse.next();
}

export const config = { matcher: '/' };
