import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';

/* 이동 동작은 링크로 유지하고, 상황판 카드의 보조 액션으로 일관되게 표시한다. */
export default function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="group/action inline-flex min-h-10 max-w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[15px] leading-[1.4] font-medium text-primary no-underline transition-colors hover:border-primary hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
    <span>{children}</span><ArrowRight className="size-3.5 shrink-0 transition-transform group-hover/action:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
  </Link>;
}
