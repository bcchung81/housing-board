/* 종합상황판의 공통 클래스(옛 board.css 의 .disp · 버튼 초기화 · .ptitle · .plink · .row2 · 막대 행). Board 와 RealPanels 가 함께 쓴다. */

/* 숫자 글씨(.disp): 본문과 같은 글꼴과 같은 폭 숫자를 쓴다. */
export const disp = "[font-family:inherit] font-bold tabular-nums tracking-[0]";

/* 옛 `.board button` 초기화(app/tailwind.css 의 .btn-reset, components 레이어). 단추마다 붙이면 뒤에 덧입힌 유틸리티가 이긴다 */
export const btn = "btn-reset";

/* 패널 제목(.ptitle)과 그 안의 작은 설명(.ptitle small). 제목 안의 표지는 10.5px */
export const ptitle = `m-0 text-[20px] leading-[1.25] ${disp} [&_[data-slot=badge]]:text-[10.5px]`;
export const ptSmall = "[font-family:inherit] text-[12px] font-normal text-muted-foreground";
export const ptSmallBlock = `${ptSmall} mt-0.5 block`;

/* 패널 아래 액션: 설명과 구분하는 얇은 선, 일정한 간격과 클릭 영역 */
export const plink = "mt-4 mb-0 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-[13px]";

/* 두 칸 행(.row2)과 막대 행(.ags .ag .an .ad .bar3) */
export const row2 = "mt-3.5 grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] items-stretch gap-3.5 narrow:grid-cols-1";
export const ags = "mt-2.5 flex flex-auto flex-col justify-around gap-1.5";
export const ag = "grid items-center gap-2.5";
export const agName = "flex min-w-0 flex-wrap items-baseline gap-x-[5px] [&_b]:text-[13px] [&_b]:leading-[1.3]";
export const agVal = "flex items-baseline justify-end gap-[5px] whitespace-nowrap [&_b]:text-[16px] [&_b]:leading-[1.2]";
export const bar3 = "flex gap-px overflow-hidden rounded-[3px]";
