/* 거르기 칩 한 줄(HOME 개념 흡수 계획 3절: 조작은 칩 한 줄, 모든 선택은 URL 에 남긴다). 서버 컴포넌트 — 칩은 쿼리 주소로 가는 링크라 스크립트 없이 동작한다.
   ChipBar(카드 한 줄) > ChipGroup(작은 이름 + 칩들) > Chip(링크, 고르면 aria-current) · ChipMenu(펼침 목록 — <details>, 고른 값이 바뀌면 key 로 닫힌 채 다시 그린다) · ChipSep(세로 구분선).
   견본(swatch): 단계 색 면(fill) · 지연 빨간 테두리(outline) · 미확보 빗금(hatch). 시안: docs/design/home-concept/projects.html
   한 줄 규칙(2026-10-14): 1280~1440 폭에서 칩이 한 줄에 들도록 묶음 이름(렌즈·지역·단계·상태)은 1440 미만에서 화면에서 숨기고(읽기 도구에는 남는다),
   펼침 칩에 고른 값이 길면 말줄임(전체 이름은 title). 범위·연결 상태 배지는 칩 줄에 두지 않는다(요약 카드 머리 줄). */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronDown, X } from 'lucide-react';
import { cn } from 'cn';

export const HATCH = '[background:repeating-linear-gradient(45deg,color-mix(in_srgb,var(--muted-foreground)_45%,transparent)_0_1.5px,transparent_1.5px_3.5px)]';
const CHIP = 'flex items-center gap-1.5 rounded-full border border-transparent px-2 py-[3px] text-[14px] leading-[1.5] whitespace-nowrap text-foreground no-underline [transition:background_.15s,border-color_.15s] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary max-[1500px]:px-1';
const ON = 'border-primary bg-accent';
const OFF = 'hover:bg-pn2';

export type Swatch = { kind: 'fill' | 'outline' | 'hatch'; color?: string };
export function SwatchMark({ kind, color, className }: Swatch & { className?: string }) {
  return <i aria-hidden="true" className={cn('block size-2.5 flex-none rounded-[3px]', kind === 'outline' && 'border-2', kind === 'hatch' && `border border-line2 ${HATCH}`, className)}
    style={kind === 'fill' ? { background: color } : kind === 'outline' ? { borderColor: color } : undefined} />;
}

export function ChipBar({ children, label = '거르기', className }: { children: ReactNode; label?: string; className?: string }) {
  return <nav aria-label={label} className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] border border-border bg-card px-3 py-2 shadow-[var(--shadow-card)]', className)}>{children}</nav>;
}
/* bare: 묶음 이름을 화면에 내지 않는다(읽기 도구에만) — 칩이 많은 줄(사업 화면 시안)이 1440 에서도 한 줄에 들게 */
export function ChipGroup({ label, children, className, bare = false }: { label: string; children: ReactNode; className?: string; bare?: boolean }) {
  return <div role="group" aria-label={label} className={cn('flex flex-wrap items-center gap-0.5', className)}><span className={cn('mr-1 text-[13px] text-muted-foreground', bare ? 'sr-only' : 'min-[901px]:max-[1439px]:sr-only')}>{label}</span>{children}</div>;
}
export const ChipSep = () => <span className="h-5 w-px bg-border mobile:hidden" aria-hidden="true" />;

export function Chip({ href, on, title, swatch, children }: { href: string; on?: boolean; title?: string; swatch?: Swatch; children: ReactNode }) {
  return (
    <Link href={href} scroll={false} aria-current={on ? 'true' : undefined} title={title} className={cn(CHIP, on ? ON : OFF)}>
      {swatch ? <SwatchMark {...swatch} /> : null}{children}
    </Link>
  );
}

/* 고른 값을 푸는 칩(예: 시군구 거르기): 이름 + × */
export function ClearChip({ href, title, children }: { href: string; title: string; children: ReactNode }) {
  return <Link href={href} scroll={false} title={title} aria-label={`${typeof children === 'string' ? children : ''} 거르기 풀기`} className={cn(CHIP, ON)}>{children}<X className="size-3.5 shrink-0" aria-hidden="true" /></Link>;
}

export type MenuItem = { href: string; label: string; on?: boolean; title?: string };
export function ChipMenu({ label, on, items, cols = 1, title }: { label: string; on?: boolean; items: MenuItem[]; cols?: 1 | 2; title?: string }) {
  const current = items.find((i) => i.on)?.label;
  return (
    <details key={current ?? ''} className="group relative">
      <summary title={title ?? current} className={cn(CHIP, 'cursor-pointer list-none [&::-webkit-details-marker]:hidden', on ? ON : OFF)}>
        <span className="max-w-[9em] truncate">{current ?? label}</span><ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="absolute top-full left-0 z-30 mt-1 max-h-[60vh] min-w-[160px] overflow-y-auto rounded-[10px] border border-border bg-popover p-1 text-popover-foreground shadow-[var(--shadow-pop)]">
        <ul className={cn('m-0 list-none p-0', cols === 2 ? 'grid grid-cols-2 gap-0.5' : 'flex flex-col gap-0.5')}>
          {items.map((i) => (
            <li key={i.href}>
              <Link href={i.href} scroll={false} title={i.title} aria-current={i.on ? 'true' : undefined}
                className={cn('block rounded-[8px] px-3 py-1.5 text-[14px] whitespace-nowrap text-foreground no-underline hover:bg-pn2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary', i.on && 'bg-accent font-bold')}>{i.label}</Link>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
