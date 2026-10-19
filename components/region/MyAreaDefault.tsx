'use client';
/* 공급 일정의 첫 지역 = 내 동네: 주소에 지역(?sido=·?sgg=)이 없을 때만, /citizen 이 저장한 localStorage 'myArea'(시군구 5자리·시도 2자리)를 읽어
   수도권 안이면 그 시도(·시군구)로 한 번 옮긴다(lib/shell/menu.ts myAreaScope 로 읽음). 저장소를 못 쓰거나 수도권 밖이면 그대로 수도권. 화면에 아무것도 그리지 않는다.
   sggOf: 시군구 코드(면 코드·구 코드) → 거를 수 있는 면 코드. 서버가 만들어 넘긴다. */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { myAreaScope } from '@/lib/shell/menu';

export default function MyAreaDefault({ metro, sggOf, base }: { metro: string[]; sggOf: Record<string, string>; base: string }) {
  const router = useRouter();
  React.useEffect(() => {
    let raw: string | null = null;
    try { raw = localStorage.getItem('myArea'); } catch (_) { /* 저장소를 못 쓰면 수도권 그대로 */ }
    const { sgg, sido } = myAreaScope(raw);
    const sd = sgg ? sgg.slice(0, 2) : sido;
    if (!sd || !metro.includes(sd)) return;
    const face = sgg ? sggOf[sgg] : undefined;
    router.replace(`${base}?sido=${sd}${face ? `&sgg=${face}` : ''}`, { scroll: false });
  }, [router, metro, sggOf, base]);
  return null;
}
