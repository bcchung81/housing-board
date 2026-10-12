/* 종합상황판의 공통 클래스(옛 board.css 의 .disp · 버튼 초기화 · .ptitle · .plink · .row2 · 막대 행). Board 와 RealPanels 가 함께 쓴다. */

/* 숫자 글씨(.disp): 본문과 같은 글꼴과 같은 폭 숫자를 쓴다. */
export const disp = "font-display font-bold tabular-nums tracking-[0]";   // 숫자·패널 제목은 Do Hyeon(계획서 14절 T1). 본문 글자는 시스템 본문 글꼴

/* 옛 `.board button` 초기화(app/tailwind.css 의 .btn-reset, components 레이어). 단추마다 붙이면 뒤에 덧입힌 유틸리티가 이긴다 */
export const btn = "btn-reset";

/* 패널 제목(.ptitle). 제목 안의 표지는 12px. 설명은 보이는 글자 대신 h2 의 title 에 둔다 */
export const ptitle = `m-0 text-[20px] leading-[1.25] ${disp} [&_[data-slot=badge]]:text-[12px]`;

/* 패널 제목 줄: [제목(설명은 title)] … [범례 칩][이동 버튼]. 넓은 화면에서는 한 줄, 좁으면 오른쪽 묶음(phgroup)이 다음 줄 오른쪽으로 내려간다 */
export const phead = "flex flex-wrap items-center gap-x-3 gap-y-1.5";
export const phgroup = "ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1";
export const pacts = "ml-auto flex flex-none gap-3";
/* 선택 시점 패널의 판정 기준 꼬리표('2026.10 판정' · '판정 없음'): 선택 달과 판정 달이 다를 때만 판정 값이 어느 달 것인지 보인다 */
export const jtag = "text-[13px] whitespace-nowrap text-muted-foreground tabular-nums";
/* 제목 줄의 작은 범례 칩 묶음(칩은 tags.tsx 의 Key) */
export const legend = "flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-muted-foreground";

/* 두 칸 행(.row2: 월별 실적 흐름 | 시도 16곳)과 막대 행(.ags .ag .an .ad .bar3).
   시도 칸은 지리 격자 4열 × 5줄(타일 4열 + 안쪽 여백)이 들어가는 620px 로 고정한다 — 남는 높이는 타일 줄이 늘어나 채운다.
   1280px 미만에서는 실적 그래프 칸이 너무 좁아져 위아래로 쌓는다. */
export const row2 = "mt-3.5 grid grid-cols-1 items-stretch gap-3.5 min-[1280px]:grid-cols-[minmax(0,1fr)_620px]";
/* 기관 줄들은 머리 줄과 '사업 없음' 줄 사이 세로 가운데에 18px 간격으로 모인다(ags = 줄 묶음 격자). 모든 줄이 같은 세 칸(이름 | 막대 | 지연 호수·비중)을 subgrid 로 나눠
   막대 시작·끝이 맞고, 오른쪽 칸은 가장 긴 값에 맞춰 넓어진다. 900px 이하는 막대가 아랫줄로 내려간다 */
export const ags = "mt-2.5 grid flex-auto grid-cols-[158px_minmax(0,1fr)_auto] content-center gap-x-3 gap-y-[18px] pt-2 pb-3 mobile:grid-cols-[minmax(0,1fr)_auto] mobile:gap-y-3";
export const ag = "col-span-full grid grid-cols-subgrid items-center gap-y-1";
export const agName = "flex min-w-0 items-baseline gap-x-1.5 whitespace-nowrap [&_b]:text-[15px] [&_b]:leading-[1.3]";
export const agVal = "flex items-baseline justify-end gap-1 whitespace-nowrap [&_b]:font-display [&_b]:text-[22px] [&_b]:leading-[1.1]";
export const bar3 = "flex gap-px overflow-hidden";   // 막대 그래프는 모서리를 둥글리지 않는다(계획서 11절)
