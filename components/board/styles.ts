/* 종합상황판의 공통 클래스(옛 board.css 의 .disp · 버튼 초기화 · .ptitle · .plink · .row2 · 막대 행). Board 와 RealPanels 가 함께 쓴다. */

/* 종합상황판 구역 카드(Card section)에 덧붙이는 배치: 제목 줄 아래 내용이 세로로 쌓이고 SVG 는 줄어들지 않는다 */
export const panel = "flex flex-col [&>svg]:flex-none";

/* 숫자 글씨(.disp): 본문과 같은 글꼴과 같은 폭 숫자를 쓴다. */
export const disp = "font-bold tabular-nums";   // 숫자·패널 제목: 본문 글꼴(Noto Sans KR) 굵게 + 같은 폭 숫자(2026-10-17: Do Hyeon 폐지)

/* 옛 `.board button` 초기화(app/globals.css 의 .btn-reset, components 레이어). 단추마다 붙이면 뒤에 덧입힌 유틸리티가 이긴다 */
export const btn = "btn-reset";

/* 패널 제목(.ptitle). 제목 안의 표지는 12px. 설명은 보이는 글자 대신 h2 의 title 에 둔다 */
export const ptitleBase = `m-0 leading-sub ${disp} [&_[data-slot=badge]]:text-xs`;
export const ptitle = `${ptitleBase} text-h2`;

/* 패널 제목 줄(모든 패널 하나 — 2026-10-18 규격 통일): 카드 머리 부품 .ui-card-head(최소 높이 44 · 간격 8). 순서 고정 [제목 h2][(i) pinfo][범위 칩] … ml-auto [범례][링크].
   넓은 화면에서는 한 줄, 좁으면 오른쪽 묶음(phgroup)이 다음 줄 오른쪽으로 내려간다. 본문 첫 요소는 mt-3 하나 */
export const phead = "ui-card-head flex-wrap gap-y-1.5";
/* 제목 옆 (i) 의 한 오프셋(머리 간격 8 − 단추 안쪽 여백 4 = 제목과 아이콘 사이 8) */
export const pinfo = "-ml-1";
export const phgroup = "ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1";
export const pacts = "ml-auto flex flex-none gap-3";
/* 선택 시점 패널의 판정 기준 꼬리표('2026.10 판정' · '판정 없음'): 선택 달과 판정 달이 다를 때만 판정 값이 어느 달 것인지 보인다 */
export const jtag = "text-sm whitespace-nowrap text-muted-foreground tabular-nums";
/* 제목 줄의 작은 범례 칩 묶음(칩은 tags.tsx 의 Key) */
export const legend = "flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-sm text-muted-foreground";

/* 패널 줄의 6열 기본 격자(2026-10-18): 1280px 이상에서 지시 카드 줄과 패널 줄이 같은 6열 · 같은 간격(12px)이라 세로선이 맞는다 — 1행 리본 4 + 선택 시점 2, 2행 실적 3 + 시도 3, 3행 2 + 2 + 2.
   1280px 미만은 줄마다 원래 배치(간격 14px). */
export const grid6 = "mt-3.5 grid items-stretch gap-3.5 min-[1280px]:mt-3 min-[1280px]:grid-cols-6 min-[1280px]:gap-3";
/* 두 칸 행(.row2: 월별 실적 흐름 | 시도 16곳)과 막대 행(.ags .ag .an .ad .bar3).
   1280px 이상은 6열의 3 + 3 — 시도 칸은 1280px(스크롤바 포함)에서도 약 598px 라 지리 격자 4열 타일이 약 135px(좁은 타일 배치 105px 보다 넓다).
   1280px 미만에서는 실적 그래프 칸이 너무 좁아져 위아래로 쌓는다. */
export const row2 = `${grid6} grid-cols-1 min-[1280px]:[&>*]:col-span-3`;
/* 기관 줄들은 머리 줄과 '사업 없음' 줄 사이 세로 가운데에 18px 간격으로 모인다(ags = 줄 묶음 격자). 모든 줄이 같은 세 칸(이름 | 막대 | 지연 호수·비중)을 subgrid 로 나눠
   막대 시작·끝이 맞고, 오른쪽 칸은 가장 긴 값에 맞춰 넓어진다. 900px 이하는 막대가 아랫줄로 내려간다 */
export const ags = "mt-3 grid flex-auto grid-cols-[158px_minmax(0,1fr)_auto] content-center gap-x-3 gap-y-[18px] pt-2 pb-3 narrow:grid-cols-[minmax(0,1fr)_auto] narrow:gap-y-3 mobile:grid-cols-[minmax(0,1fr)_auto] mobile:gap-y-3";
export const ag = "col-span-full grid grid-cols-subgrid items-center gap-y-1";
export const agName = "flex min-w-0 items-baseline gap-x-1.5 whitespace-nowrap [&>:first-child]:text-base [&>:first-child]:leading-sub";
export const agVal = "flex items-baseline justify-end gap-1 whitespace-nowrap [&_b]:text-lg [&_b]:leading-title [&_b]:font-bold";
export const bar3 = "flex gap-px overflow-hidden rounded-full";   // 막대 틀도 둥글게(2026-10-18 카드 윤곽 통일: 모든 틀 모서리 둥글게)
