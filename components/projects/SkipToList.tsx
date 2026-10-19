'use client';
/* 목록으로 바로가기: 요약 카드(핵심 질문·단계별 진행 링크 수십 개)를 건너뛰어 사업 목록 첫 행의 링크에 초점을 둔다. 평소엔 숨기고 초점이 오면 보인다.
   스크립트가 없으면 #projects-list(목록 카드)로 간다 */
export default function SkipToList() {
  return (
    <a href="#projects-list"
      onClick={(e) => {
        const a = document.querySelector<HTMLElement>('table[aria-label="사업 목록"] tbody a');
        if (!a) return;
        e.preventDefault();
        a.focus();
        a.scrollIntoView({ block: 'center' });
      }}
      className="sr-only rounded-tile bg-primary px-4 py-2 text-base font-bold text-primary-foreground no-underline focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:outline-2 focus:outline-offset-2 focus:outline-primary print:hidden">
      목록으로 바로가기
    </a>
  );
}
