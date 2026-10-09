import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import ShellRail from '../../components/ShellRail';
import '../tailwind.css';

export const metadata: Metadata = {
  title: { default: '주택파동 · 주택공급 종합상황판', template: '%s · 주택파동' },
  description: '공공주택 공급 현황을 6단계로 보고 사업·지역·지도로 내려가는 종합상황판',
};

/* 루트 레이아웃 ①(사이드바 + 본문). 지도(`app/(map)`)는 루트 레이아웃이 달라서 오갈 때 전체 문서가 새로 열린다. */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className="dark">
      {/* 본문 바탕·글꼴(옛 dash.css 의 body): 남색 바탕에 위쪽 오른편이 밝아지는 그라데이션, 15px/1.55 */}
      <body className="m-0 min-h-screen text-foreground [background:#0A1030_radial-gradient(1200px_420px_at_70%_-10%,#1A2A6E_0%,#0A1030_62%)_no-repeat] [font:15px/1.55_'Noto_Sans_KR','Apple_SD_Gothic_Neo','Malgun_Gothic',system-ui,sans-serif]">
        <ShellRail>
          <main className="min-w-0 flex-1">{children}</main>
        </ShellRail>
      </body>
    </html>
  );
}
