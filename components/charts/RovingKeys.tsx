'use client';
/* 월 링크 묶음의 로빙 초점: 묶음 안 링크(data-roving) 중 하나만 Tab 대상(tabIndex 0)이고, ←→(↑↓)·Home·End 로 옮긴다.
   서버가 그린 링크(MonthLines)를 감싸기만 한다 — 링크·주소는 그대로라 마우스·Enter 동작은 같다(2026-10-15 평가: 홈 Tab 정지점 112개 중 월 링크 60개) */
import type { KeyboardEvent, ReactNode } from 'react';

const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

export default function RovingKeys({ className, children }: { className?: string; children: ReactNode }) {
  const onKeyDown = (ev: KeyboardEvent<HTMLDivElement>) => {
    const items = [...ev.currentTarget.querySelectorAll<SVGAElement | HTMLAnchorElement>('[data-roving]')];
    const i = items.indexOf((ev.target as Element).closest('[data-roving]') as SVGAElement);
    if (i < 0) return;
    const j = ev.key === 'Home' ? 0 : ev.key === 'End' ? items.length - 1 : ev.key in STEP ? Math.max(0, Math.min(items.length - 1, i + STEP[ev.key])) : -1;
    if (j < 0) return;
    ev.preventDefault();
    items[i].setAttribute('tabindex', '-1');
    items[j].setAttribute('tabindex', '0');
    items[j].focus();
  };
  return <div className={className} onKeyDown={onKeyDown}>{children}</div>;
}
