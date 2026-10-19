/* 범위 칩: 숫자 묶음 머리에 '어느 범위(전국·수도권·시도·시군구)의 어느 출처(사업 원장·정책 진행 자료·통계누리) 숫자인가'를 한 모양으로 단다.
   범위가 다른 숫자가 한 화면에 섞일 때(사업 화면의 정책 목표 = 정책 전체 vs 원장 요약 = 거르기 범위) 둘을 가르는 표지. 설명은 title.
   clearHref 를 주면 범위 거르기를 푸는 ×(지역 공급의 시군구 거르기). note 는 칩 옆 작은 표지(예: 시군구를 골랐는데 시도 단위 자료뿐인 패널의 '시도 단위 자료').
   서버·클라이언트 어디서나 쓴다(상태 없음). */
import Link from 'next/link';
import { X } from 'lucide-react';
import { cn } from 'cn';

export type ScopeSource = '사업 원장' | '정책 진행 자료' | '통계누리' | 'KOSIS·SGIS' | '공공 사업' | '모든 주택(민간 포함)';
export default function ScopeChip({ scope, source, title, clearHref, note, className }: { scope: string; source?: ScopeSource; title?: string; clearHref?: string; note?: { text: string; title: string }; className?: string }) {
  const chip = (
    <span data-slot="scope-chip" title={title} className={cn('inline-flex h-6 flex-none items-center font-sans gap-1 rounded-full border border-line2 bg-card pr-1 pl-2.5 text-sm leading-none whitespace-nowrap', !clearHref && 'pr-2.5', className)}>
      <b className="font-bold text-foreground">{scope}</b>
      {source ? <span className="text-muted-foreground"><span aria-hidden="true">· </span>{source}</span> : null}
      {clearHref ? (
        <Link href={clearHref} scroll={false} aria-label={`${scope} 거르기 풀기`} title={`${scope} 거르기 풀기`}
          className="ml-0.5 flex size-[18px] items-center justify-center rounded-full text-muted-foreground no-underline hover:bg-pn2 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary">
          <X className="size-3.5" aria-hidden="true" />
        </Link>
      ) : null}
    </span>
  );
  return note ? <span className="inline-flex flex-none items-center gap-1.5">{chip}<span data-slot="scope-note" title={note.title} className="font-sans text-sm whitespace-nowrap text-muted-foreground">{note.text}</span></span> : chip;
}
