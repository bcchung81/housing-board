'use client';
/* 사업 찾기의 첫 지역 = 내 동네: 주소에 지역·사업·검색(?sido·?sgg·?id·?q)이 하나도 없을 때만, /citizen 이 저장한 localStorage 'myArea'(시군구 5자리·시도 2자리)를
   lib/shell/menu.ts myAreaScope 로 읽어 수도권 안이면 그 지역으로 한 번 옮긴다(replace — 뒤로 가기 기록을 쌓지 않는다). 저장소를 못 쓰거나 수도권 밖이면 그대로 수도권. 그리는 것 없음.
   (공급 일정의 components/region/MyAreaDefault 와 같은 일 — 주소 모양이 달라 따로 둔다) */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { myAreaScope } from '@/lib/shell/menu';
import { METRO, findHref, type StageGroup } from '@/lib/board/public-labels';

export default function MyAreaFirst({ stage }: { stage?: StageGroup }) {
  const router = useRouter();
  React.useEffect(() => {
    let raw: string | null = null;
    try { raw = localStorage.getItem('myArea'); } catch (_) { /* 저장소를 못 쓰면 수도권 그대로 */ }
    const { sgg, sido } = myAreaScope(raw);
    if (!METRO.includes((sgg ?? sido ?? '').slice(0, 2))) return;
    router.replace(findHref(sgg ? { sgg, stage } : { sido, stage }), { scroll: false });
  }, [router, stage]);
  return null;
}
