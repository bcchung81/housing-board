'use client';
/* 떠 있는 창 하나(모달리스 — 막·초점 가둠·스크롤 잠금 없음, role=dialog aria-modal=false). 2026-10-19 옛 사업 상세 서랍(Drawer.tsx)의 머리를 그대로 옮겼다.
   폭 >900px: 끌기 전 자리는 순수 CSS 정중앙(fixed left·top 50% + -translate 50% — 서버 HTML·내용 높이·화면 크기가 바뀌어도 늘 가운데, 여러 창은 --win-off 로 24 씩 어긋남) · 기본 폭 800(400 ~ 화면 60%) · 높이는 내용(최대 화면 − 96, 안쪽 스크롤) · 머리 줄을 끌어 옮기고 오른쪽 아래 모서리로 크기 조절 · 접기(머리만)·닫기.
   폭 ≤900px: 옛 서랍 모바일 모양(상단 메뉴 아래 전면) — 끌기·크기 조절·접기 없음. 자리·크기는 이 창 안에서만 기억한다(끄는 동안 창 내용은 다시 그리지 않는다).
   키(Esc)·주소·창 순서는 창 관리자(WindowHost) 하나가 맡는다 — 창마다 keydown 리스너를 달지 않는다. 인쇄에는 싣지 않는다. */
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, X } from 'lucide-react';
import { cn } from 'cn';
import { WIN_W, clampBox, clampH, clampW, type Box } from './nav';

export type Back = { href: string; label: string; title?: string };
/* placed = 끌거나 크기를 바꿔 자리를 정했다(그 전에는 CSS 정중앙 — 서버 HTML 도 같은 자리) · off = 정중앙에서 오른쪽 아래로 어긋난 px(끌기 전 창끼리) */
export type WinBox = Box & { h: number | null; placed: boolean; off: number };
export const DEFAULT_BOX: WinBox = { x: 0, y: 0, w: WIN_W, h: null, placed: false, off: 0 };

type Props = {
  winKey: string; title: ReactNode; head?: ReactNode; back?: Back | null; box: WinBox; active: boolean; focusSeq: number;
  closeLabel?: string; onClose: () => void; onRaise: () => void; children?: ReactNode;
};

const isMobile = () => window.matchMedia('(max-width: 900px)').matches;
const viewport = () => ({ w: window.innerWidth, h: window.innerHeight });

export default function FloatingWindow({ winKey, title, head, back, box: initial, active, focusSeq, closeLabel = '사업 상세 닫기', onClose, onRaise, children }: Props) {
  const titleId = useId();
  const ref = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<WinBox>(initial);
  const [folded, setFolded] = useState(false);
  const drag = useRef<{ kind: 'move' | 'size'; x0: number; y0: number; r: DOMRect } | null>(null);

  /* 창 관리자가 초점을 보내라고 할 때(열기·이미 열린 사업 다시 누름·내용 교체): 제목에 초점, 본문은 맨 위로 */
  useEffect(() => {
    if (!focusSeq) return;
    bodyRef.current?.scrollTo({ top: 0 });
    titleRef.current?.focus({ preventScroll: true });
  }, [focusSeq]);

  /* 화면 크기가 바뀌면 화면 안으로 되돌린다 */
  useEffect(() => {
    const onResize = () => setBox((b) => (b.placed ? { ...b, ...clampBox(b, viewport()), h: b.h === null ? null : clampH(b.h, window.innerHeight) } : { ...b, w: clampW(b.w, window.innerWidth) }));
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const start = (kind: 'move' | 'size') => (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || isMobile()) return;
    if (kind === 'move' && (e.target as Element).closest('a, button, input, summary, [role="button"]')) return;
    drag.current = { kind, x0: e.clientX, y0: e.clientY, r: ref.current!.getBoundingClientRect() };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const move = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0, vp = viewport();
    setBox((b) => d.kind === 'move'
      ? { ...b, ...clampBox({ x: d.r.left + dx, y: d.r.top + dy, w: d.r.width }, vp), placed: true }
      : { ...b, ...clampBox({ x: d.r.left, y: d.r.top, w: d.r.width + dx }, vp), h: clampH(d.r.height + dy, vp.h), placed: true });
  };
  const end = (e: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const handlers = (kind: 'move' | 'size') => ({ onPointerDown: start(kind), onPointerMove: move, onPointerUp: end, onPointerCancel: end });

  const style = { '--win-x': `${box.x}px`, '--win-y': `${box.y}px`, '--win-w': `${box.w}px`, '--win-off': `${box.off}px`, ...(box.h !== null ? { '--win-h': `${box.h}px` } : {}) } as CSSProperties;
  return (
    <section ref={ref} role="dialog" aria-modal="false" aria-labelledby={titleId} data-window={winKey} data-active={active ? '' : undefined} data-placed={box.placed ? '' : undefined}
      onPointerDownCapture={onRaise} onFocusCapture={onRaise} style={style}
      className={cn('q-rise fixed z-60 flex w-(--win-w) max-w-[60vw] min-w-[400px] flex-col overflow-hidden rounded-card border border-border bg-popover text-popover-foreground shadow-pop print:hidden',
        box.placed ? 'top-(--win-y) left-(--win-x)' : 'top-1/2 left-1/2 mt-(--win-off) ml-(--win-off) -translate-x-1/2 -translate-y-1/2',
        folded ? 'h-auto' : box.h !== null ? 'h-(--win-h)' : 'max-h-[calc(100dvh-96px)]',
        'mobile:inset-x-0 mobile:top-12 mobile:bottom-0 mobile:m-0 mobile:translate-none mobile:h-auto mobile:max-h-none mobile:w-full mobile:max-w-none mobile:min-w-0 mobile:rounded-none mobile:border-x-0 mobile:border-b-0',
        !active && 'mobile:hidden')}>
      {/* 머리: 왼쪽 열(제목 + 머리 부속, 줄바꿈) · 오른쪽 열(돌아가기·접기·× — 긴 이름에서도 오른쪽 위에 고정). 머리 줄을 끌어 옮긴다(링크·단추 위는 빼고) */}
      <header {...handlers('move')}
        className="grid cursor-move touch-none grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 border-b border-border bg-card py-2.5 pr-3 pl-5 mobile:cursor-auto mobile:touch-auto">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
          <h2 id={titleId} ref={titleRef} tabIndex={-1} data-window-title="" className="m-0 min-w-0 text-h2 leading-title font-bold [overflow-wrap:anywhere] focus:outline-none">{title}</h2>
          {head}
        </div>
        <div className="flex items-center gap-2">
          {back ? (
            <a href={back.href} data-slot="drawer-back" title={back.title ?? back.label}
              className="group/back inline-flex flex-none items-center gap-px rounded-chip text-sm leading-body whitespace-nowrap text-muted-foreground no-underline underline-offset-[3px] transition-colors hover:text-primary hover:underline focus-visible:text-primary focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              {back.label}<ChevronRight className="size-3.5 shrink-0 transition-transform group-hover/back:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
            </a>
          ) : null}
          <button type="button" onClick={() => setFolded((v) => !v)} aria-expanded={!folded} aria-label={folded ? '창 펼치기' : '창 접기'} title={folded ? '펼치기' : '접기(머리만)'}
            className="flex size-9 flex-none cursor-pointer items-center justify-center rounded-tile border-0 bg-transparent p-0 text-muted-foreground hover:bg-pn2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary mobile:hidden">
            {folded ? <ChevronDown className="size-[18px]" aria-hidden="true" /> : <ChevronUp className="size-[18px]" aria-hidden="true" />}
          </button>
          <button type="button" onClick={onClose} aria-label={closeLabel} title="닫기 (Esc)"
            className="flex size-9 flex-none cursor-pointer items-center justify-center rounded-tile border-0 bg-transparent p-0 text-muted-foreground hover:bg-pn2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <X className="size-[18px]" aria-hidden="true" />
          </button>
        </div>
      </header>
      <div ref={bodyRef} className={cn('@container min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 pt-4 pb-6 [background:var(--page-bg)]', folded ? 'hidden' : 'flex')}>{children}</div>
      {folded ? null : <span aria-hidden="true" title="크기 조절" {...handlers('size')} className="absolute right-0 bottom-0 size-4 cursor-nwse-resize touch-none mobile:hidden" />}
    </section>
  );
}
