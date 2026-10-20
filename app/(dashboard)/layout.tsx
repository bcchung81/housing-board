import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import TopNav from '@/components/TopNav';
import WindowHost from '@/components/windows/WindowHost';
import { getBoardData } from '@/lib/board/data';
import { AUDIENCE_INIT, THEME_INIT } from '@/lib/shell/theme';
import '@/assets/fonts/noto-sans-kr/noto-sans-kr.css';   // 본문 글꼴 Noto Sans KR(저장소 안 로컬 파일, 외부 글꼴 요청 없음)
import '@/app/globals.css';

export const metadata: Metadata = {
  title: { default: '더주택 종합상황판', template: '%s · 더주택' },
  description: '공공주택 공급 현황을 6단계로 보고 사업·지역·지도로 내려가는 종합상황판',
};

/* 저장된 테마가 다크일 때만 그리기 전에 <html class="dark"> 를 켠다(켜 두지 않으면 라이트가 기본이다). 그리기 전에 돌아야 깜빡이지 않는다. */

/* 인쇄할 때만 다크를 풀었다가 인쇄가 끝나면 되돌린다(종이는 흰 바탕 + 진한 글자 — globals 의 @media print 웜 범위 규칙과 짝). 대시보드 전용이라 공유 THEME_INIT 에 넣지 않는다(지도는 그대로) */
const PRINT_LIGHT = "(function(){var c=document.documentElement.classList,d=false;addEventListener('beforeprint',function(){d=c.contains('dark');c.remove('dark')});addEventListener('afterprint',function(){if(d)c.add('dark')})})()";

/* 루트 레이아웃 ①(상단 메뉴 바 + 본문). 지도(`app/(map)`)는 루트 레이아웃이 달라서 오갈 때 전체 문서가 새로 열린다.
   data-design="warm" = 비지도 화면 웜 배색 범위(globals.css, 2026-10-19). 지도 레이아웃에는 달지 않는다. */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { origin, month, runId } = await getBoardData();
  return (
    <html lang="ko" data-design="warm" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <script dangerouslySetInnerHTML={{ __html: AUDIENCE_INIT }} />
        <script dangerouslySetInnerHTML={{ __html: PRINT_LIGHT }} />
        <meta name="board-source" content={`${origin}:${month}:run${runId ?? '-'}`} />
      </head>
      {/* 본문 바탕·글꼴(옛 dash.css 의 body): 위쪽 오른편이 살짝 밝아지는 바탕(--page-bg, 테마별), 글자 크기는 역할 토큰 text-body(정책담당자 14px · 일반사용자 16px).
          클래스가 없는 기본 링크(상세 화면의 dl 안 링크)는 브라우저 기본 파랑 대신 주색으로 보인다. 탭 목록(.ui-tabs) 안 링크는 빼고 — 탭 부품 색을 쓴다(2026-10-19). */}
      <body className={`font-sans m-0 min-h-screen text-body text-foreground [&_:not(.ui-tabs)>a:not([class])]:text-primary [background:var(--page-bg)] [font-synthesis:none]`}>
        {/* 본문 바로가기: 첫 Tab 에서만 보이는 링크(메뉴를 건너뛴다). 인쇄에는 싣지 않는다 */}
        <a href="#main" className="sr-only rounded-tile bg-primary px-4 py-2 text-base font-bold text-primary-foreground no-underline focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:outline-2 focus:outline-offset-2 focus:outline-primary print:hidden">본문 바로가기</a>
        <TopNav />
        {/* 사업 창 관리자(2026-10-19 서랍 → 모달리스 창): 본문 뒤에 떠 있는 창들 · 사업 링크 가로채기 · Esc · 주소(?id=·?cand=) */}
        <WindowHost>
          <main id="main" tabIndex={-1} className="focus:outline-none">{children}</main>
        </WindowHost>
      </body>
    </html>
  );
}
