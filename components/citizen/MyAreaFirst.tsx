'use client';
/* 일반사용자 화면(사업 찾기 /citizen/projects · 공급 일정 /citizen/schedule)의 [내 동네] 단추: 2026-10-21 W6 사용자 지시 '기본은 수도권 전체'에 따라 첫 범위는 늘 수도권 전체이고,
   /citizen 이 저장한 localStorage 'myArea'(시군구 5자리·시도 2자리)를 lib/shell/menu.ts myAreaScope 로 읽어 수도권 안이면 그 지역으로 가는 단추를 하나 보인다(한 번 눌러 이동, 저장은 안 함).
   옛 동작(주소에 지역이 없으면 내 동네로 자동 이동 — 공급 일정은 components/region/MyAreaDefault)은 일반사용자 화면에서 쓰지 않는다. 저장소를 못 쓰거나 수도권 밖이면 그리지 않는다.
   to = 'find'(사업 찾기 주소 findHref) | 'schedule'(공급 일정 주소 — sggOf: 시군구·구 코드 → 거를 수 있는 면 코드, 서버가 넘긴다) */
import * as React from 'react';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { myAreaScope } from '@/lib/shell/menu';
import { METRO_AREAS, SIDO_SHORT } from '@/lib/board/metro-overview';
import { METRO, findHref, type StageGroup } from '@/lib/board/public-labels';

type Props = { to: 'find'; stage?: StageGroup } | { to: 'schedule'; sggOf: Record<string, string> };

export default function MyAreaFirst(props: Props) {
  const [area, setArea] = React.useState<{ sgg?: string; sido?: string }>({});
  React.useEffect(() => {
    let raw: string | null = null;
    try { raw = localStorage.getItem('myArea'); } catch (_) { /* 저장소를 못 쓰면 단추 없음 */ }
    setArea(myAreaScope(raw));
  }, []);
  const { sgg, sido } = area, sd = sgg ? sgg.slice(0, 2) : sido;
  if (!sd || !METRO.includes(sd)) return null;
  const face = sgg ? (props.to === 'schedule' ? props.sggOf[sgg] : sgg) : undefined;
  const name = sgg ? METRO_AREAS[sgg] ?? METRO_AREAS[face ?? ''] ?? SIDO_SHORT[sd] : SIDO_SHORT[sd];
  const href = props.to === 'find' ? findHref(sgg ? { sgg, stage: props.stage } : { sido, stage: props.stage }) : `/citizen/schedule?sido=${sd}${face ? `&sgg=${face}` : ''}`;
  return (
    <Link href={href} scroll={false} className="ui-btn ui-btn-ghost" title={`내 동네 ${name} 보기`}>
      <MapPin data-icon="inline-start" aria-hidden="true" />내 동네 {name}
    </Link>
  );
}
