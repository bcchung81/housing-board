import { MapPin } from 'lucide-react';
import type { ReactNode } from 'react';

/* 화면 → 지도 연결점의 한 모양: 핀 아이콘 + 짧은 글자('지도'), 마우스를 올리거나 포커스하면 주색·밑줄, 포커스 테두리.
   지도(/map)는 루트 레이아웃이 달라 <Link> 가 아니라 <a>. 주소는 lib/board/map-href. 설명(full)은 title 과 aria-label 로. */
export const MAP_LINK = 'inline-flex flex-none items-center gap-1 rounded-[4px] text-[14px] leading-[1.45] whitespace-nowrap text-muted-foreground no-underline underline-offset-[3px] transition-colors hover:text-primary hover:underline focus-visible:text-primary focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export default function MapLink({ href, full, children = '지도' }: { href: string; full: string; children?: ReactNode }) {
  return <a href={href} title={full} aria-label={full} className={MAP_LINK}><MapPin className="size-3.5 shrink-0" aria-hidden="true" /><span>{children}</span></a>;
}
