'use client';
/* 사이드바 메뉴. 지도 화면(compact)에서는 56px 아이콘 레일로 접어 두고, 900px 이하에서는 햄버거 드로어가 된다.
   지도 화면은 루트 레이아웃이 달라 들어갈 때·나올 때 전체 문서가 새로 열린다(app.js 는 문서당 한 번만 도는 스크립트라서).
   그래서 지도로 가는 링크와 지도 안의 모든 링크는 <Link> 대신 <a> 로 둔다(미리 가져오지 않고 바로 이동). */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MENU, activeMenuId, type MenuId } from '../lib/shell/menu';
import './shell.css';

const ICON: Record<MenuId, string> = {
  home: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  map: 'M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11zM12 12.2a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8z',
  projects: 'M5 20V6l7-3 7 3v14M9 9h2M13 9h2M9 13h2M13 13h2M10 20v-3h4v3',
  area: 'M12 3 3 8l9 5 9-5zM3 13l9 5 9-5',
  stage: 'M4 18h4v-4h4v-4h4V6h4',
  agency: 'M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6',
  sources: 'M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3zM5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6',
  reports: 'M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5',
  'my-area': 'M4 11l8-7 8 7M6 10v10h12V10M10 20v-5h4v5',
};

export default function ShellRail({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const active = compact ? 'map' : activeMenuId(pathname);
  const [open, setOpen] = useState(false);          // 900px 이하의 드로어
  const [folded, setFolded] = useState(false);      // 넓은 화면에서 아이콘만 보기(이 브라우저에 기억)
  useEffect(() => { try { setFolded(localStorage.getItem('rail-folded') === '1'); } catch (_) { /* 저장소를 못 써도 펼친 채로 동작 */ } }, []);
  useEffect(() => { setOpen(false); }, [pathname]);
  const fold = () => { const v = !folded; setFolded(v); try { localStorage.setItem('rail-folded', v ? '1' : '0'); } catch (_) { /* 위와 같음 */ } };

  return (
    <>
      <button type="button" className="rail-burger" aria-expanded={open} aria-controls="rail" aria-label="메뉴 열기" onClick={() => setOpen(!open)}><i aria-hidden="true" /></button>
      <nav id="rail" className="rail" data-compact={compact || folded ? '1' : '0'} data-open={open ? '1' : '0'} aria-label="주 메뉴">
        <a className="rail-brand" href="/" aria-label="주택파동 종합상황판 처음으로"><img src="/assets/img/wave-lockup-ondark.svg" alt="주택파동" width="123" height="34" /><b aria-hidden="true">파동</b></a>
        <ul>
          {MENU.map((m) => {
            const on = active === m.id;
            const body = (<><svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICON[m.id]} /></svg><span>{m.label}</span>{m.soon ? <em>준비 중</em> : null}</>);
            const exact = pathname === m.href;
            return (
              <li key={m.id}>
                {compact || m.id === 'map'
                  ? <a href={m.href} className={on ? 'on' : ''} aria-current={on && (compact ? m.id === 'map' : exact) ? 'page' : undefined} title={m.label}>{body}</a>
                  : <Link href={m.href} className={on ? 'on' : ''} aria-current={exact ? 'page' : undefined} title={m.label}>{body}</Link>}
              </li>
            );
          })}
        </ul>
        {compact ? null : <button type="button" className="rail-fold" aria-pressed={folded} onClick={fold} title="메뉴 접기·펼치기"><span aria-hidden="true">{folded ? '›' : '‹'}</span><span>{folded ? '펼치기' : '접기'}</span></button>}
      </nav>
      <div className="rail-scrim" data-open={open ? '1' : '0'} onClick={() => setOpen(false)} aria-hidden="true" />
    </>
  );
}
