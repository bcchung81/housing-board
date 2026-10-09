'use client';
/* 상단 메뉴 바(한 줄, 높이 48px). 왼쪽 로고, 가운데 메뉴 글자 링크, 오른쪽 테마 토글. 900px 이하에서는 햄버거 하나로 접혀 아래로 펼쳐진다.
   지도 화면(compact)은 어두운 화면 하나라 테마 토글이 없다.
   지도로 가는 링크와 지도 안의 모든 링크는 <Link> 대신 <a> 로 둔다: 지도는 루트 레이아웃이 달라 들어갈 때·나올 때 전체 문서가 새로 열린다
   (app.js 는 문서당 한 번만 도는 스크립트라서). */
import { Menu, Moon, Sun, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from 'cn';
import { MENU, activeMenuId } from '../lib/shell/menu';

const linkBase = 'relative flex items-center whitespace-nowrap text-muted-foreground no-underline hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary';

export default function TopNav({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const active = compact ? 'map' : activeMenuId(pathname);
  const [open, setOpen] = useState(false);          // 900px 이하의 펼침 메뉴
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(document.documentElement.classList.contains('dark')); }, []);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('theme', next ? 'dark' : 'light'); } catch (_) { /* 저장소를 못 써도 이번 화면에서는 바뀐다 */ }
  };

  const items = MENU.map((m) => {
    const on = active === m.id;
    const exact = pathname === m.href;
    const label = (<>{m.label}{m.soon ? <em className="ml-1.5 hidden rounded-full border border-border px-1.5 py-px text-[10px] not-italic min-[1280px]:inline">준비 중</em> : null}</>);
    const cls = cn(linkBase, 'h-12 px-3 text-[14px] mobile:h-11 mobile:px-4', on && 'font-bold text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-primary mobile:after:inset-x-0 mobile:after:inset-y-2 mobile:after:right-auto mobile:after:h-auto mobile:after:w-0.5');
    return (
      <li key={m.id} className="flex">
        {compact || m.id === 'map'
          ? <a href={m.href} className={cls} aria-current={on && (compact ? m.id === 'map' : exact) ? 'page' : undefined} title={m.label}>{label}</a>
          : <Link href={m.href} className={cls} aria-current={exact ? 'page' : undefined} title={m.label}>{label}</Link>}
      </li>
    );
  });

  return (
    <header className="sticky top-0 z-40 shrink-0 border-b border-border bg-card text-card-foreground">
      <div className="flex h-12 items-center gap-2 px-3">
        <a className="mr-3 flex h-full items-center focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary" href="/" aria-label="주택파동 종합상황판 처음으로">
          <img className="block h-[26px] w-auto dark:hidden" src="/assets/img/wave-lockup-onlight.svg" alt="주택파동" width="94" height="26" />
          <img className="hidden h-[26px] w-auto dark:block" src="/assets/img/wave-lockup-ondark.svg" alt="" aria-hidden="true" width="94" height="26" />
        </a>
        <nav id="main-menu" aria-label="주 메뉴" className="mobile:hidden"><ul className="m-0 flex list-none p-0">{items}</ul></nav>
        <div className="ml-auto flex items-center gap-1">
          {compact ? null : (
            <button type="button" className="flex size-9 cursor-pointer items-center justify-center rounded-[8px] border-0 bg-transparent p-0 text-muted-foreground hover:bg-pn2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" aria-pressed={dark} aria-label="다크 모드" title="다크 모드 전환" onClick={toggleTheme}>
              <Moon className="size-[18px] dark:hidden" aria-hidden="true" /><Sun className="hidden size-[18px] dark:block" aria-hidden="true" />
            </button>
          )}
          <button type="button" className="hidden size-9 cursor-pointer items-center justify-center rounded-[8px] border-0 bg-transparent p-0 text-foreground hover:bg-pn2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary mobile:flex" aria-expanded={open} aria-controls="main-menu-list" aria-label="메뉴" onClick={() => setOpen(!open)}>
            {open ? <X className="size-[20px]" aria-hidden="true" /> : <Menu className="size-[20px]" aria-hidden="true" />}
          </button>
        </div>
      </div>
      {open ? <nav id="main-menu-list" aria-label="주 메뉴" className="hidden border-t border-border bg-card shadow-[0_8px_20px_rgba(0,0,0,.18)] mobile:block"><ul className="m-0 flex list-none flex-col p-0">{items}</ul></nav> : null}
    </header>
  );
}
