'use client';
/* 사업 상세 서랍(오른쪽, 화면 폭의 약 60%): 목록(/projects)은 그대로 보이고 주소 ?id= 가 서랍을 연다. 내용은 서버가 그린다(직접 연 주소도 서랍이 열린 채 온다).
   닫기: × 단추·Esc(펼친 칩 메뉴가 있으면 메뉴만 닫는다)·뒤로 가기. 목록에서 열었으면 닫을 때 그만큼 뒤로 가고(주소 기록이 쌓이지 않게), 주소로 바로 열었으면 ?id= 를 뺀 목록으로 바꾼다.
   대체된 옛 id 로 열면(서버가 대표 사업을 그린다) 주소를 대표 id 로 고쳐 쓴다. 열릴 때 제목에 초점, 닫히면 목록의 그 사업 링크로 초점을 돌린다. 인쇄에는 싣지 않는다. */
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';

type Props = { id: string | null; canonical?: string | null; closeHref: string; title: ReactNode; head?: ReactNode; children?: ReactNode };

export default function Drawer({ id, canonical, closeHref, title, head, children }: Props) {
  const router = useRouter();
  const prev = useRef(id);
  const nav = useRef({ base: false, depth: 0, pop: false, last: id });
  const titleRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPop = () => { nav.current.pop = true; };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  /* 열고 닫힌 차례: 목록에서 연 뒤 서랍 안에서 몇 번 옮겼는지(depth) — 닫을 때 그만큼 뒤로 */
  useEffect(() => {
    const n = nav.current, was = prev.current;
    prev.current = id;
    if (was === id) return;
    if (n.pop) { n.pop = false; if (id) n.depth = Math.max(0, n.depth - 1); else { n.depth = 0; n.base = false; } }
    else if (!id) { n.depth = 0; n.base = false; }
    else { if (!was) n.base = true; n.depth += 1; }
    if (id) n.last = id;
    if (id) { bodyRef.current?.scrollTo({ top: 0 }); titleRef.current?.focus({ preventScroll: true }); }
    else if (n.last) document.querySelector<HTMLAnchorElement>(`[data-slot="data-grid"] a[href$="=${n.last}"]`)?.focus({ preventScroll: true });   // ?id= · ?cand=
  }, [id]);

  /* 처음 열린 서랍: 제목에 초점, 대체된 옛 id 면 주소를 대표 id 로 */
  useEffect(() => {
    if (!id) return;
    titleRef.current?.focus({ preventScroll: true });
    if (canonical && canonical !== id) {
      const u = new URL(window.location.href);
      u.searchParams.set('id', canonical);
      window.history.replaceState(window.history.state, '', u);
    }
  }, [id, canonical]);

  const close = () => {
    const n = nav.current;
    if (n.base && n.depth > 0) window.history.go(-n.depth);
    else router.replace(closeHref, { scroll: false });
  };

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const menu = document.querySelector<HTMLDetailsElement>('details[open]');
      if (menu) { menu.open = false; return; }   // 펼친 칩 메뉴가 먼저
      close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!id || !children) return null;
  return (
    <aside role="dialog" aria-modal="false" aria-labelledby="drawer-title"
      className="fixed top-16 right-0 bottom-0 z-30 flex w-[min(60vw,980px)] flex-col border-l border-border shadow-[var(--shadow-pop)] [background:var(--page-bg)] print:hidden mobile:top-12 mobile:w-full">
      {/* 머리: 왼쪽 열(제목 + 배지·id, 줄바꿈) · 오른쪽 열(× — 긴 이름에서도 오른쪽 위에 고정) */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 border-b border-border bg-card py-2.5 pr-3 pl-5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
          <h2 id="drawer-title" ref={titleRef} tabIndex={-1} className="m-0 min-w-0 font-display text-[24px] leading-[1.2] font-normal tracking-[-0.03em] [overflow-wrap:anywhere] focus:outline-none">{title}</h2>
          {head}
        </div>
        <button type="button" onClick={close} aria-label="사업 상세 닫기" title="닫기 (Esc)"
          className="flex size-9 flex-none cursor-pointer items-center justify-center rounded-[8px] border-0 bg-transparent p-0 text-muted-foreground hover:bg-pn2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <X className="size-[18px]" aria-hidden="true" />
        </button>
      </header>
      <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 pt-4 pb-6">{children}</div>
    </aside>
  );
}
