import { ipSido } from '../../../../lib/board/ip-sido';

export const dynamic = 'force-dynamic';

/* IP 로 짐작한 행정 시도 코드. 헤더 값은 기록하지 않고, 응답은 저장하지 않는다. */
export function GET(request: Request): Response {
  const sido = ipSido(request.headers.get('x-vercel-ip-country'), request.headers.get('x-vercel-ip-country-region'));
  return Response.json({ sido }, { headers: { 'Cache-Control': 'no-store' } });
}
