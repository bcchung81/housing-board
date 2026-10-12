import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

/* 이동 동작은 링크로 유지하고, 상황판 카드 제목 줄 오른쪽에 조용한 글자 링크(채움·상자 없음, 작은 › 아이콘)로 작게 표시한다 — 마우스를 올리거나 포커스하면 주색·밑줄.
   화면에는 줄인 이름(children)을, 마우스를 올리면 원래 이름(full)을 보인다. */
export default function PanelLink({ href, full, children }: { href: string; full: string; children: ReactNode }) {
  return <Link href={href} title={full} className="group/action inline-flex flex-none items-center gap-px rounded-[4px] text-[14px] leading-[1.45] whitespace-nowrap text-muted-foreground no-underline underline-offset-[3px] transition-colors hover:text-primary hover:underline focus-visible:text-primary focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
    <span>{children}</span><ChevronRight className="size-3.5 shrink-0 transition-transform group-hover/action:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
  </Link>;
}
