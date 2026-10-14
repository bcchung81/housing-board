'use client';
/* 링크를 누른 뒤 서버가 새 화면(칩 거르기·서랍)을 그리는 동안의 가벼운 표지: 링크 오른쪽 위의 작은 주색 점(깜빡임).
   <Link> 안에 넣는다(next/link useLinkStatus). 기다리지 않을 때는 아무것도 그리지 않아 자리를 차지하지 않는다 — 부모 링크에 relative 가 있어야 한다. */
import { useLinkStatus } from 'next/link';

export default function LinkPending() {
  const { pending } = useLinkStatus();
  return pending ? <span role="status" aria-label="불러오는 중" className="pointer-events-none absolute -top-0.5 -right-0.5 block size-2 animate-pulse rounded-full bg-primary motion-reduce:animate-none" /> : null;
}
