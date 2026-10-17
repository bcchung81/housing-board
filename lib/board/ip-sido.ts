/* Vercel 이 붙이는 IP 위치 헤더(x-vercel-ip-country·x-vercel-ip-country-region, ISO 3166-2 하위 코드)를 행정 시도 코드(2자리)로 바꾼다.
   ISO 와 행정 표준 코드가 다른 곳만 적는다: 강원 42→51, 전북 45→52, 세종 50→36. 나머지는 같다. */
const ISO_TO_SIDO: Record<string, string> = { '42': '51', '45': '52', '50': '36' };
const SIDO = new Set(['11', '26', '27', '28', '29', '30', '31', '36', '41', '43', '44', '46', '47', '48', '49', '51', '52']);

export function ipSido(country?: string | null, region?: string | null): string | null {
  if (country !== 'KR' || !region) return null;
  const sido = ISO_TO_SIDO[region] ?? region;
  return SIDO.has(sido) ? sido : null;
}
