import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import ShellRail from '../../components/ShellRail';
import '../tailwind.css';
import './dash.css';

export const metadata: Metadata = {
  title: { default: '주택파동 · 주택공급 종합상황판', template: '%s · 주택파동' },
  description: '공공주택 공급 현황을 6단계로 보고 사업·지역·지도로 내려가는 종합상황판',
};

/* 루트 레이아웃 ①(사이드바 + 본문). 지도(`app/(map)`)는 루트 레이아웃이 달라서 오갈 때 전체 문서가 새로 열린다. */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className="dark">
      <body>
        <div className="shell">
          <ShellRail />
          <main className="shell-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
