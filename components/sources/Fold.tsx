/* 데이터 원본의 접는 상자: 요약은 펼쳐 두고 상세(단계별·계산 근거·원천별 카드)는 여기 넣어 필요할 때만 연다.
   상자 안의 앵커(#step-… · #id)로 오면 HashOpen 이 연다. Chromium 은 수화 전에 스스로 열어 open 속성이 서버 HTML 과 달라지므로
   그 차이는 경고하지 않는다(suppressHydrationWarning — 열린 채 두는 것이 맞다). */
import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from 'cn';

/* plain = 다른 접는 상자 안에 든 상자: 테두리·그림자 상자를 또 두지 않고 위 구분선만(카드 안 카드 금지) */
export default function Fold({ title, meta, children, className, plain = false }: { title: string; meta?: string; children: ReactNode; className?: string; plain?: boolean }) {
  return (
    <details suppressHydrationWarning className={cn('group mt-3', plain ? 'border-t border-border' : 'rounded-card border border-border bg-card shadow-card', className)}>
      <summary className={cn('flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-0.5 px-4 py-2.5 text-base font-bold hover:bg-pn2 focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden', plain ? 'rounded-tile' : 'rounded-card')}>
        <ChevronRight className="size-4 flex-none text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />
        {title}{meta ? <span className="font-normal text-muted-foreground">{meta}</span> : null}
      </summary>
      <div className={cn('py-3', plain ? 'px-0' : 'border-t border-border px-4')}>{children}</div>
    </details>
  );
}
