---
name: The주택
description: 주택공급 6단계(계획→입주) 디지털 상황판 — 정책담당자 종합상황판·지도·일반사용자 /citizen 이 한 모양을 쓴다
colors:
  primary: "#23466D"
  primary-foreground: "#FFFFFF"
  background: "#FFFFFF"
  foreground: "#172B4D"
  card: "#FFFFFF"
  popover: "#FFFFFF"
  secondary: "#EAF0F6"
  muted: "#F3F5F8"
  muted-foreground: "#4D5B6F"
  accent: "#EDF3F9"
  border: "#D5DCE6"
  input: "#B9C6D6"
  ring: "#23466D"
  ink2: "#344960"
  mute: "#5F6E82"
  line2: "#B9C6D6"
  pn2: "#EAF0F6"
  chartbg: "#FAFBFD"
  ok: "#287B61"
  warn: "#7F6300"
  bad: "#BD3A50"
  destructive: "#C94359"
  st-plan: "#3D7BD8"
  st-permit: "#16998D"
  st-build: "#DA7426"
  st-sale: "#7286A8"
  st-soon: "#5B9B3A"
  st-move: "#8B67CC"
  st-priv: "#8C99AB"
  st-plan-ink: "#365F99"
  st-permit-ink: "#327F79"
  st-build-ink: "#8E541D"
  st-sale-ink: "#536278"
  st-soon-ink: "#526E35"
  st-move-ink: "#795B9E"
  st-priv-ink: "#53637A"
  actor-local: "#8160A8"
  actor-lh: "#3D63A0"
  actor-builder: "#B05A84"
  actor-private: "#8693A5"
  map-ov-0: "#E3E7EC"
  map-ov-1: "#b7d3f6"
  map-ov-2: "#6da7ec"
  map-ov-3: "#256abf"
  map-ov-4: "#184f95"
  map-ov-5: "#0d366b"
  logo-ink: "#132543"
  logo-wave: "#C75036"
  cz-accent: "#B6351B"
  cz-summary-bg: "#0E5E66"
typography:
  h1:
    fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.2
  h2:
    fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.3
  h3:
    fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.3
  kpi:
    fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.2
    fontFeature: "tnum"
  body:
    fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  body-public:
    fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  table:
    fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  meta:
    fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  legend:
    fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  nav:
    fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
    fontSize: "16px"
    fontWeight: 400
  text-xs:
    fontSize: "12px"
    lineHeight: 1.4
  text-sm:
    fontSize: "14px"
    lineHeight: 1.5
  text-base:
    fontSize: "16px"
    lineHeight: 1.6
  text-md:
    fontSize: "18px"
    lineHeight: 1.4
  text-lg:
    fontSize: "20px"
    lineHeight: 1.3
  text-xl:
    fontSize: "24px"
    lineHeight: 1.2
  text-2xl:
    fontSize: "30px"
    lineHeight: 1.2
  text-3xl:
    fontSize: "38px"
    lineHeight: 1.1
rounded:
  chip: "4px"
  tile: "10px"
  card: "14px"
  full: "9999px"
spacing:
  pad-card: "20px"
  pad-tile-y: "12px"
  pad-tile-x: "16px"
  pad-compact-y: "8px"
  pad-compact-x: "10px"
  pad-chip-x: "8px"
  head-gap: "8px"
  btn-gap: "6px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.tile}"
    padding: "0 10px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.tile}"
    height: "36px"
  button-sm:
    typography: "{typography.meta}"
    rounded: "{rounded.tile}"
    height: "32px"
  card-section:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.card}"
    padding: "{spacing.pad-card}"
  card-tile:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.tile}"
    padding: "12px 16px"
  card-inset:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.tile}"
    padding: "8px 10px"
  chip:
    textColor: "{colors.muted-foreground}"
    typography: "{typography.meta}"
    rounded: "{rounded.chip}"
    padding: "0 8px"
  card-head:
    height: "44px"
---

# Design System: The주택

**값의 정본은 `app/globals.css` 다.** 위 머리(YAML)는 라이트 테마 값을 옮긴 것이고, 다크 값·지도 전용 값(`--map-*`)·/citizen 범위 값은 globals 에만 있다. 이 문서와 globals 가 다르면 globals 가 맞고 이 문서를 고친다. 새 값이 필요하면 화면이 아니라 globals 에 의미 이름으로 더한다.
제품 맥락(사용자·목적·원칙)은 `PRODUCT.md`, 이 문서는 시각 규칙만 다룬다.

## Overview

**Creative North Star: "숫자가 먼저인 상황판"** — 화면에는 숫자·단위·짧은 이름만 두고, 설명·출처·기준은 (i) 툴팁으로 내린다(PRODUCT.md 원칙 1).

- **한 모양**(2026-10-17 결정): 정책담당자 6화면·지도 `/map`·일반사용자 `/citizen` 을 한 시각 언어로 맞춘다. 정본은 정책담당자 화면(Next 앱, `components/ui`)이다. `/citizen` 은 정적 페이지 그대로 두고 빌드 때 globals 의 토큰·부품 층을 주입받는다(신문형 B안은 거뒀다).
- **테마**: CSS 정의는 `:root` = 라이트, `.dark` = 다크(`<html class="dark">`). 앱은 다크가 기본 표시이고 저장된 라이트만 그리기 전에 푼다(`localStorage('theme')`, 지도도 같은 값).
- **관점**: `html[data-aud="admin"|"public"]`. 정책담당자 전용 화면은 늘 admin 값. 처음 온 사람(값 없음)은 public.
- **위계는 크기·굵기·면 색 배분으로만** 만든다. 장식·새 콘텐츠로 풀지 않는다.

**Key Characteristics**
- 한 글꼴(Noto Sans KR, 로컬)·8단계 크기·굵기 400/700.
- 의미 이름 색 토큰, 글자 4.5:1·차트 면 3:1.
- 카드 다섯 모양(구역·tile·compact·inset·pop) + 줄(row), 모든 카드 모서리 둥글게.
- 하드코딩 금지 — 화면은 토큰 이름이 붙은 유틸리티·부품 클래스만 쓴다(시험이 잠금).

## Colors

색은 **의미 이름** 한 곳에서 정한다. 의미가 같으면 같은 색, 다르면 다른 색. 색 이름 토큰(옛 `--s-blue…--s-amber`)은 쓰지 않는다.

### 바탕·글자(중립)
- **바탕·카드** `--background`·`--card`·`--page-bg`: 라이트 #FFFFFF / 다크 #111111(2026-10-17 바탕 통일 — 옛 남색 다크 폐기, 앱·지도·/citizen 같은 값). 카드와 바탕이 같으므로 경계는 `--border`(#D5DCE6 / #3B3B3B)가 맡는다.
- **본문 글자** `--foreground` #172B4D / #F2F2F2, **보조 글자** `--muted-foreground` #4D5B6F / #B3B3B3(회의실 투사 기준 한 단계 진하게), `--ink2`·`--mute`(차트 축·보조).
- **면** `--muted`·`--secondary`·`--accent`·`--pn2`, **선** `--border`·`--line2`·`--input`, **차트 바탕** `--chartbg`.

### 주색
- **Primary** `--primary` #23466D / #9DBCE9: 선택·조작·링크·초점(`--ring` 같은 값). 주의·지연 상태색과 분리한다.
- `/citizen` 만 범위 블록이 덮는다(아래 '/citizen 배색').

### 판정·상태
- `--ok` #287B61 / #4ADE9E, `--warn` #7F6300 / #FFC24D, `--bad` #BD3A50 / #FF6B88(얼룩 행·강조 면 위에서도 4.5:1), `--destructive`.
- 주의는 한 색(`--warn`)뿐이다. 병목 강조는 주의색이 아니라 주색 계열(옅은 주색 면 + 주색 배지).

### 6단계 색(값 유지 — PRODUCT 약속)
- `--st-{plan,permit,build,sale,soon,move}` = 계획·인허가·착공·모집·준공·입주, `--st-priv` = 공공택지 민간.
- `--st-*` 는 **차트 면·선·막대**(차트 바탕 위 3:1 이상, 다크 면은 9.5:1 이하로 글자보다 앞서지 않게), `--st-*-ink` 는 **글자·칩·지도 위 기호**(카드 위 4.5:1 이상).
- 라이트 면은 OKLCH L .59~.66·C .06~.16 으로 고르게(흙빛 금지). 다크 면은 채도를 한 단계 낮춘다.
- 지도·종합상황판 리본·사업·지역 공급의 같은 번호는 같은 변수다(지도 스크립트도 CSS 변수에서 읽는다).
- 단계색은 6단계 전용이다. 지도 면 구분도·장식에 쓰지 않는다.

### 차트 고유색
- **시행주체** `--actor-*`: 공공 3주체(지자체·LH·주택업체)는 서로 색상각 30° 이상, 민간은 물러나는 중립 회색. 막대는 차트 바탕 위 3:1.
- **지연율 바탕 6단계** `--region-0~5`: 0 은 중립, 그 위는 한 색상(로즈)이 한 방향으로 짙어진다(명도 단조). 그 위 글자 4.5:1.
- **리본** `--rb-*`: 층 그라데이션(위 = 단계색 70% + `--rb-hi`, 아래 = 86% + `--rb-lo`), 층 경계 `--rb-seam` 한 줄, 예정 층은 불투명도 .62 + 빗금, 리본 위 라벨 판 `--rb-hud`(흰 글자 5.5:1 이상).
- shadcn `--chart-1~5` 는 단계색 면 값과 맞춘다. 판정 밖 조각 `--out`·`--out-line`.

### 지도 색
- 지도 전용 값은 globals 의 `--map-*`(라이트 `:root`, 다크 `.dark`). `assets/css/app.css` 는 지도 이름(`--ink`·`--glass-*` 등)으로 이것을 가리키기만 하고 색 값을 갖지 않는다. 지도 스크립트(`buildTheme`)도 `--map-*` 를 읽는다.
- **수도권 개요 면** `--map-ov-0~5`: 값 0 은 중립, 1~5 는 파랑 한 색상 명도 5단계. 라이트·다크 모두 **짙어질수록 많음**(명도 단조). 라벨 글자 `--map-ov-ink-*` 는 4.5:1 이 되는 쪽. '지연 사업' 지표(`html[data-ov-metric="d"]`)만 빨강 명도 5단계.
- 렌더 상수(해 빛·그림자 검정·3D 버스 모형)만 스크립트의 이름 붙은 표에 둔다.

### /citizen 배색 — 안 2 '색 카드'(2026-10-18 기본값)
- 범위 블록 `html[data-page="citizen"]`(다크 `html.dark[data-page="citizen"]`)이 globals 의 내보내기 구간 안에서 덮는다. **적용 범위는 /citizen 만**, 정책 화면·`/map` 은 기본값 그대로.
- 덮는 것: `--primary`·`--ring` 코발트 #1F53B8 / #8BB4FE, 지도 램프 `--map-ov-1~5` 연두→남보라 다색(라이트 #D5E88A #63D18F #0D9FA6 #0168B4 #3A2F8E / 다크 #E9F098 #75DF8F #0AB8B9 #0375C9 #4D42C1, 다크도 짙을수록 많음)과 `--map-ov-ink-1~5`.
- /citizen 전용 새 토큰은 접두 **`--cz-*`**: `--cz-accent`(산호 #B6351B / #FD8965)·`--cz-accent-on`, 요약 카드 채움 `--cz-summary-bg` 짙은 청록(#0E5E66 / #0B4D54, 2026-10-18 사용자 선택 — 남보라 대체)와 그 위 `--cz-summary-fg`·`-muted`·`-num`·`-plan`·`-build`·`-sale`·`-line`·`-panel`, `--cz-badge-ink`. 지금 신청 카드는 기본 카드(배경색 없음, 2026-10-19 사용자 결정). 요약 카드(`.smry`)는 안쪽 토큰만 `--cz-summary-*` 로 덮는다.
- 단계 모드 램프 `--ramp-build-*`·`--ramp-sale-*`(짓는 중·모집 끝남 모드).
- 템플릿 `<style>` 은 토큰을 정의하지 않는다(값은 globals 에만).

### Named Rules
**대비 규칙.** 글자는 바탕 위 4.5:1, 차트 면·선·기호와 초점 고리는 3:1 이상(WCAG 1.4.3·1.4.11). 지도 위 글자는 가장 밝은 지도·가장 어두운 지도 위 모두에서 4.5:1. 바꾼 값은 시험으로 고정한다.

**색상각 규칙.** 주의(`--warn`)와 착공(`--st-build`)은 색상각 18° 이상 떨어진다. 같은 계열로 읽히는 상태색·단계색은 두지 않는다.

**틴트 규칙(정책 화면·지도).** 넓은 면의 옅은 색은 의미 색을 `--tint-mix`(라이트 12%·다크 14%, 가리킨 면 `--tint-mix-on` 20/22%)만큼 바탕에 섞어 만든다(`color-mix(in oklab, …)`). 새 색 값은 만들지 않는다. 진한 색은 점·아이콘·숫자에만. **/citizen 은 2026-10-18 이 규칙을 해제했다**(지도 면 파랑 계열 고정·틴트 12/14%·새 색 값 금지·주색 시험 고정 해제 — 안 2 다색을 쓴다). /citizen 에 남는 제약은 아이콘·장식 배지 금지뿐이다.

## Typography

**글꼴:** Noto Sans KR 하나(`--font-sans`, 저장소 안 로컬 파일 `assets/fonts/noto-sans-kr`, 외부 글꼴 요청 0). 로고 글자·제목·메뉴·숫자·지도 라벨(숫자·영문 포함)까지 같은 글꼴. Do Hyeon 은 쓰지 않는다. 글꼴 변수는 `--font-sans` 하나(지도 `--font-body` 없음).

**Character:** 위계는 크기와 굵기로만. 굵기는 400·700 두 가지(500·600·800 금지). 자간은 기본값만(`tracking-*` 단계 없음).

### 크기 8단계
12·14·16·18·20·24·30·38px = `--text-xs`~`--text-3xl`(Tailwind `text-xs` `text-sm` `text-base` `text-md` `text-lg` `text-xl` `text-2xl` `text-3xl`). 기본 Tailwind 단계는 지웠다. 소수 px·단계 밖 크기 금지. 1600px 이상 확대 없음.
- 12px 는 배지·축 눈금·작은 꼬리처럼 굵기 700·대비 4.5:1 인 곳에만. 읽는 문장에 쓰지 않는다. /citizen 은 12px 금지.

### 역할(Hierarchy)
| 역할 | 토큰 / 유틸리티 | 값 |
|---|---|---|
| 화면 제목 | `--fs-h1` / `text-h1` | 30/700, 900px 이하 24, 줄 높이 `--lh-title` 1.2 |
| 카드 제목 | `--fs-h2` / `text-h2` | 20/700, `--lh-sub` 1.3 |
| 소제목 | `--fs-h3` / `text-h3` | 16/700, 1.3 |
| 본문·표 | `--fs-body`·`--fs-table` / `text-body` `text-table` | 정책담당자 14(1.5), 일반사용자 `html[data-aud=public]` 16(1.6, 390 포함) |
| 보조·범례 | `--fs-meta`·`--fs-legend` / `text-meta` `text-legend` | 14, 색 `--muted-foreground` |
| 핵심 숫자 | `--fs-kpi` / `text-kpi` | 30/700, 같은 폭 숫자 |
| 축·각주 | `--fs-caption` / `text-caption` | 12 |
| 로고·메뉴 | `--logo-h`·`--fs-nav` | 로고 벡터 높이 32(900px 이하 25.6, 글자 크기 없음), 메뉴 16/400(1100px 이하 14) |

- 줄 높이 역할은 셋(`leading-title`·`leading-sub`·`leading-body`). 높이를 맞출 때는 줄 높이가 아니라 치수(`h-*`·`py-*`)로.
- 숫자는 본문 글꼴 700 + `tabular-nums`(`disp`). 큰 숫자에 다른 글꼴 없음.
- 지도 라벨(HTML 라벨·maplibre `text-size`·기본 배경 지명·도로명)은 8단계 토큰이고 **14px 이상**. `font-scale` 없음.

### 줄바꿈
- 전역: `body { word-break: keep-all; overflow-wrap: break-word }`, 제목(h1~h3·카드 제목) `text-wrap: balance`.
- 짧은 라벨은 한 줄, 넘치면 말줄임 + 전체 이름 `title`(`.ui-truncate`, 앱은 `components/ui/one-line.tsx`). 코드·숫자+단위는 끊지 않는다.
- 칸 폭에 따라 줄어드는 글자는 `cqi`·`min()/max()` 유동 크기 대신 카드 `@container` 폭 단계로 8단계 값에 붙인다(예 `text-sm @min-[160px]:text-xl`).

### Named Rules
**cn() 규칙.** `cn()`·`cva` 안에서는 역할 이름(`text-meta` 등)을 쓰지 않는다. 병합기가 색으로 알고 지운다. `text-(length:--fs-meta)` 형태나 부품 클래스(`ui-meta`)를 쓴다.

## Layout

- **틀**: 콘텐츠 상자 1440px 선(`px-7`, 900px 이하 `px-3`), **1600px 이상은 모든 화면 1760px 선**(지도 포함, 상단 메뉴 바도 같은 선). 블록 사이 간격 14(`gap-3.5`).
- **폭 단계**(옛 CSS 처럼 N 을 포함): `mobile` ≤900 · `narrow` ≤1100 · `phone` ≤520(globals 의 `@custom-variant`). Tailwind `max-[N]` 은 N 미만이라 쓰지 않는다.
- 900px 이하: `--pad-card` 16, h1 24, 상단 메뉴 바 48px.
- 주 환경은 1280~1920px 모니터·회의실 큰 화면. 어느 폭에서도 가로 스크롤 0.
- 카드 여백은 토큰만: 구역 카드 `p-card` 20, 타일 `py-tile-y px-tile-x` 12/16, 촘촘 `py-compact-y px-compact-x` 8/10, 칩 좌우 8. 레이아웃 치수(`w-[..]`·`grid-cols-[..]`·`min-h-[..]`·위치)는 하드코딩 금지 대상이 아니다.

## Elevation & Depth

그림자는 역할별 토큰 몇 개뿐이고 테마마다 값이 다르다(라이트 = 옅은 남색 그림자, 다크 = 카드 위쪽 1px 하이라이트 + 짙은 그림자).
- `--shadow-card`(카드) · `--shadow-pop`(팝오버·툴팁·펼침) · `--shadow-hud`(떠 있는 판, 약하게) · `--shadow-hover`(누를 수 있는 카드 가리킴) · `--shadow-hover-soft`(누를 수 없는 카드 가리킴) · `--shadow-edge`(표의 붙은 첫 열을 민 동안). 유틸리티 `shadow-card` `shadow-pop` `shadow-edge`. 다른 그림자 값 금지.
- **HUD 유리** `.ui-hud`: 카드 색을 `--hud-alpha` 18% 로 섞은 `--hud-bg` + `--hud-backdrop`(blur 6px·saturate 1.1) + 반투명 1px 테두리(`--border` 38%). 지도 면 밖(카드 위)에 놓일 때의 값이다. 판을 지도 면 위에 통째로 띄우면 `--hud-alpha` 를 80% 이상으로 올린다. backdrop-filter 를 못 쓰는 브라우저는 96%.
- **지도 유리**(`--map-glass-*`): 흐림과 채도만 쓰고 밝기를 누르지 않는다. 상세 카드는 4px 이하 흐림, 사업·건물 팝업은 전용 유리(.72~.82, 흐림 10~14px), 입력줄은 상태별 투명도(입력 중 > 대기 > 비활성). 대체 브라우저는 .94 이상.
- **입체 단계 raised**: `/citizen` 만 `<html data-elev="raised">` 로 바탕 < 카드 < 안쪽 카드 면을 한 단계씩 나눈다. 덮어쓰기는 `[data-elev]` 범위 안에만, 앱 레이아웃에는 없다.

## Shapes

- **반경 넷**: `--radius-chip` 4(칩·태그) · `--radius-tile` 10(안쪽 카드·타일·입력·표 틀·막대 틀·단추) · `--radius-card` 14(바깥 구역 카드) · `--radius-full`(알약). 유틸리티 `rounded-chip/tile/card/full`(shadcn `rounded-sm`→4, `md`·`lg`→10, `xl`→14). 그 밖 반경 금지.
- **모든 카드 모서리는 둥글다**(2026-10-18). 각진(반경 0) 카드형 상자는 없다. 예외는 화면 가장자리에 붙는 구조 판(상단 머리 줄·오른쪽 서랍 판·지도 사이드 패널 판)뿐.
- **테두리**: 1px(`--border-w`). 2px(`--border-w-on`)는 키보드 초점 외곽선에만(2026-10-19: 고른 것·연결 패널도 1px).
- **막대**: 막대 바깥 틀(판정 비율 막대·기관별 막대 `bar3`)은 알약. 막대 자체·12개월 막대와 선택 테두리·시도 타일 3색 막대·쌓은 막대·계단 칸·지도 막대(`.sbar`·`.mini`·`.pg .bar2`·`.ht-bar`)는 모서리를 둥글리지 않는다.
- **범례 견본 두 모양**(2026-10-18): 면 = 10px 사각(반경 chip), 선 = 12×3px 막대. `components/board/tags.tsx` 의 `Key`.
- **지도 선**: `/citizen` 지도에서 점선·빗금을 쓰지 않는다. 경계는 공유 호 단위로 다듬어(단순화 + Chaikin) 계단·틈·겹침 없이. `/map` 블록 면은 무늬 없이 현재 단계색 단색.

## Components

### Cards / Containers (`components/ui/card.tsx`, 부품 클래스 `.ui-*`)
- `<Card>`(구역, `.ui-card`: 반경 14·여백 20·1px 테두리·`--card`·`--shadow-card`) · `variant="tile"`(`.ui-tile`: 반경 10·12/16) · `variant="compact"`(`.ui-tile-compact`: 8/10, 그림자 없음) · `variant="inset"`(`.ui-inset`: 카드 안 묶음, 1px 테두리·`--inset-bg`·반경 10·8/10·그림자 없음) · `variant="row"`(`.ui-row`: 테두리 없이 아래 구분선) · 떠 있는 상자(pop).
- `tile`·`compact` 는 페이지 바탕 위에서만, 카드 안의 카드는 테두리형 `inset` 만. **깊이는 2단까지**(구역 카드 → 안쪽 카드), 안쪽 카드 안에 또 카드 금지. 구분선만 필요하면 `row`.
- 화면은 배치(`flex`·`gap`·격자)만 덧붙인다. 모양 규칙을 화면에 따로 두지 않는다.
- 제목 `<CardTitle>`(h2 20/700), 설명 `<CardDescription>`(보조 글).

### Card head `.ui-card-head`
- 제목 줄 하나: flex, 간격 `--head-gap` 8, 최소 높이 `--head-h` 44. 종합상황판 `phead` 도 이것이다.
- 순서 고정: [제목 h2][(i) 툴팁][범위 칩] … 오른쪽(`ml-auto`) [범례][링크]. 좁으면 오른쪽 묶음이 다음 줄 오른쪽으로.
- 개수 단추('일정 4')는 단추 부품 `.ui-btn.ui-btn-secondary.ui-btn-sm`(내용 아이콘 + 글자 + 꺾쇠).
- 장식 아이콘 배지는 두지 않는다(2026-10-18).

### Buttons `.ui-btn`(shadcn 4.21.4 base-nova Button 값을 옮김)
- 기본 = 주색 채움, 가리키면 주색 80%. 변형 `.ui-btn-secondary`(가리키면 본문색 5% 섞기) · `.ui-btn-outline`(`--border` 테두리·`--background`, 다크는 `--input` 30%/50%) · `.ui-btn-ghost`(가리키면 `--muted`).
- 크기: 기본 높이 36 · `.ui-btn-sm` 32(글자 14) · `.ui-btn-icon` 정사각. 반경 tile, 굵기 700, 아이콘 16(`data-icon="inline-start|inline-end"` 쪽 여백 8/6).
- 초점: 2px `--ring` 외곽선(offset 2). 눌림: 1px 내려앉음(`aria-haspopup` 제외). 꺼짐: `--disabled-opacity` .6.
- 고른 것(`aria-pressed="true"`): 주색 옅은 면 + 주색 글자(테두리 2px 아님).
- 보이는 높이 36, 누르는 영역 44(투명 확장 `::before`).
- 스위치(`components/ui/switch.tsx`): `role="switch"`, 48×28 트랙·22px 손잡이·44px 누름 영역.

### Tabs `.ui-tabs`(shadcn 4.21.4 TabsList·TabsTrigger 값을 옮김, 2026-10-19)
- 거르기·모드 고르기용 탭 목록(탭 패널 없음). 틀 = inline-flex·`--muted` 바탕·`--muted-foreground` 글자·높이 36(`--btn-h`)·여백 `--tabs-pad` 3·반경 tile. 안의 `button` = 바탕 없음·투명 테두리·14/400·반경 `--tabs-radius`(tile − 3 = 7)·가리키면 `--foreground`.
- 고른 것 `aria-pressed="true"`: 라이트 `--card` 면 + `--shadow-card` · 다크 `--input` 30% 면 + `--input` 테두리(그림자 없음), 글자 `--foreground`, 굵기 700(shadcn 500 은 쓰지 않음). 의미는 거르기라 `role="group"` + 눌림 단추(`role="tab"` 쓰지 않음).
- 개수 배지 `.n`: 알약·`--muted-foreground` 30% 면·12/700·숫자만. 초점 2px `--ring` 외곽선(offset 2), 누름 칸 44(화면이 `::before` 로 확장).
- 의미색은 화면 범위가 글자색만 덮는다(바탕까지 칠하지 않는다).

### Chips `.ui-chip`
- 반경 4, 1px `--line2` 테두리, 14px 보조색, 한 줄. 알약은 `--radius-full`. 강조 칩 `.ui-chip-primary`(주색 테두리·글자·700).

### Navigation — TopNav(정본)
- 한 줄 상단 메뉴 바, 높이 64(900px 이하 48, 햄버거로 접힘). 1600px 이상 1760px 선.
- 로고 = 열린 문 심벌(집 `--logo-ink`·문 `--logo-wave`) + **The**(`--logo-wave`) + **주택**(`--logo-ink`, Noto Sans KR Bold 윤곽선) 벡터 한 벌(lockup, viewBox 250×64, 원본 `docs/design/the-jutaek-logo/`). 색 라이트 ink #132543·clay #C75036, 다크 ink #F8F7F3·clay #ED9275. 헤더 높이 32(폭 125, 900px 이하 25.6), 600px 미만은 심벌만 28. 서비스 이름 'The주택'은 링크 aria-label. 메뉴 16/400, 현재 위치는 아래 2px 주색 밑줄.
- 오른쪽 묶음: 보기 대상 스위치(사람/서류가방) → 1×20px 구분선 → 테마 스위치(해/달). 599px 이하는 구분선 없이 테마가 펼침 메뉴 맨 아래 줄.
- 일반사용자 메뉴 = 종합상황판·지도·사업 찾기·공급 일정(2026-10-19).
- 관점별 메뉴: 정책담당자 전용(사업·지역 공급·데이터 원본)은 `html[data-aud=public]` 에서 CSS 로 숨긴다. `/citizen` 머리 줄도 같은 토큰을 쓴다.

### Links
- 카드 이동 링크는 `PanelLink` 하나: 제목 줄 오른쪽 조용한 글자 링크(14px 보조색 + 작은 › 아이콘, 채움·상자 없음), 가리키면 주색·밑줄. 글자색 전환 애니메이션 없음.
- 숫자 자체가 목록 링크인 곳(지시 카드 등)은 점선 밑줄 → 가리키면 주색 실선.

### Tooltip `components/ui/info-tip.tsx`
- 설명·출처·기준일·판정 규칙은 (i) 툴팁으로. 툴팁 그림자는 `--shadow-pop`.

### Data grid `components/ui/data-grid.tsx`
- 글자 열 왼쪽·숫자 열 오른쪽, 머리글·첫 열 고정(옆으로 민 동안 `--shadow-edge`), 합계 행 고정, 불투명 줄무늬, 묶음 경계 세로선. 30행 초과 검색·건수, 120행 초과 가상 스크롤. 순서가 뜻인 표(6단계 행)는 정렬을 끈다. 페이지에서 원시 `Table` 을 직접 쓰지 않는다.

### Card hover
- 누를 수 있는 카드 `card-lift`: 2px 떠오름 + `--shadow-hover` + 테두리 주색 45%. 눌린 카드·현재 단계의 고리는 지킨다. 누르는 순간 내려앉음.
- 누를 수 없는 카드 `card-soft`: 떠오르지 않고 `--shadow-hover-soft` + 테두리 `--line2`.
- `@media (hover: hover)` 에서만, 움직임 줄이기면 떠오르지 않는다.
- 종합상황판은 아래 '종합상황판 상호작용' 부품을 쓴다(card-lift 의 고른 카드 바깥 고리를 쓰지 않는다). card-lift 는 /citizen·다른 정책 화면 그대로.

### 종합상황판 상호작용(2026-10-19, `app/globals.css` 끝 — 정책 화면 전용이라 @export 밖)
- **지시 카드 `.ui-dir`**(틀: 반경 14·1px 테두리·여백 `--dir-pad-y/x` 12/16 — 1280~1365px 6열은 좌우 12, 520px 이하 8/10 · 두 줄 사이 `--dir-gap` 4) + 면 `.ui-dir-face`(`--card`·`--border`·`--shadow-card`) + 겹친 숫자 층 `.ui-dir-layer` + 칸 `.ui-dir-cell`. 글자 색 위계는 틀의 토큰: `--dir-label`(지시 이름·앞말 = `--muted-foreground`) · `--dir-num`(숫자+단위 = `--foreground`, 고르면 `--primary`) · `--dir-sub`(보조 값 = muted). 숫자 링크 `.ui-dir-num` 점선 밑줄(`--num-underline-offset` 3) → 가리키면 주색 실선.
- **가리킴**: 칸째 2px 떠오름(`--lift-y`, 단추 면·숫자 층·(i)가 함께 — 숫자 링크를 가리켜도 가라앉지 않음) + `--shadow-hover` + 테두리 주색 45%(`--lift-mix`). 키보드 초점도 떠오름. **누름**: 떠오름 풀림 + `--shadow-card`, `--dur-press` 80ms. 움직임 줄이기면 떠오르지 않는다.
- **고른 것 `.ui-pick`**(`aria-pressed="true"`: 지시 카드·리본 범례 단추): 주색 옅은 면 `color-mix(in oklab, --primary --tint-mix, --card)`(라이트 #E2E7ED · 다크 #22252A) + 1px 주색 테두리. 두께는 그대로, 안쪽·바깥 고리 없음.
- **시도 타일 `.ui-press` + `.ui-region`**: 면 = 지연율 구간 의미색 `--rc`(화면이 style 로 넘김). 면이 뜻을 가져 고른 것은 면 대신 1px 주색 테두리 + `--shadow-linked`. 가리킴·누름은 `.ui-press`(떠오름·내려앉음).
- **연결 패널 `.ui-linked`**(지시가 가리키는 패널, 서버 컴포넌트 #p-actual 은 감싼 줄의 `.ui-linked-actual`): 주색 60% 섞은 1px 테두리(`--linked-mix`) + 옅은 주색 그림자 `--shadow-linked`(0 2px 12px, 주색 `--linked-glow` 라이트 14% · 다크 20% — 오프셋·흐림 있음) + 연결되는 순간 한 번 밝아졌다 가라앉음(`ui-linked-in` `--dur-linked` .9s, 움직임 줄이기면 없음). 누를 수 없어 떠오르지 않는다.
- **키보드 초점**만 2px `--ring` 외곽선(`.ui-focus-scope`, offset 2). 고른 것·연결 표시와 섞지 않는다.

### Icons
- lucide 선 아이콘만(shadcn 과 같은 라이브러리). `/citizen` 은 `tools/design/public-mock/build.js` 의 `ICONS` 대응표대로 `lucide-react` 도형을 스프라이트로 만든다. 손으로 그린 도형 금지.

### Motion
- 모든 등장 동작은 `@media (prefers-reduced-motion: no-preference)` 안에서만. 움직임 줄이기면 아무것도 움직이지 않는다(화면 비교 하네스도 이 설정으로 찍는다).
- transform·opacity·clip-path 만 쓴다(레이아웃 이동 없음). 끝나면 원래 스타일로(`animation-fill-mode: backwards`).
- 종합상황판 리본은 화려한 연출(쓸기 → 착지, 기준 시점은 처음부터 지금), 나머지 그래프는 조용한 등장(`q-rise`·`q-grow-*`·`q-sweep`). 누르거나 키·휠을 쓰면 연출을 바로 끝낸다. 넘침 없는 ease-out.
- `/citizen`: 접수 마감 3일 이하만 맥동, 처음 솟음은 세션당 한 번, 줄임 설정이면 맥동·시트 펼침·전이·View Transition 모두 끔.

## Do's and Don'ts

### Do:
- **Do** 모든 시각 값(색·글꼴·크기·줄 높이·반경·테두리·그림자·여백)을 `app/globals.css` 토큰으로 쓴다. TSX 는 토큰 이름 유틸리티와 shadcn 부품만, 지도 CSS 는 `var(--토큰)` 만, `/citizen` 은 주입받은 토큰만.
- **Do** 고른 것은 주색 옅은 면 + 1px 주색 테두리(굵은·주색 글자)로, 지시가 가리키는 패널은 주색 섞은 1px 테두리 + 옅은 주색 그림자(`.ui-linked`)로 보인다(2026-10-19).
- **Do** '단조롭다'류 지적은 위계·규격·격자·색 배분으로 푼다(2026-10-18).
- **Do** 카드 구성(종류·순서)을 지우거나 바꿀 때는 먼저 시안을 보여 주고 확인받는다.
- **Do** 지도 라벨은 14px 이상, 진한 면 위 흰 글자 + 어두운 반투명 테두리, 옅은 면 위 진한 글자 + 밝은 테두리.

### Don't:
- **Don't** 임의값: `text-[13px]` `rounded-[12px]` `leading-[1.55]` `tracking-[..]` `shadow-[..]` `border-[1.5px]` `p-[..]`, `#hex`·`rgb()` 리터럴(클래스·코드 문자열·style). 대신 `text-sm`·`rounded-tile`·`leading-body`·`shadow-pop`·`border`·`p-card`·토큰.
- **Don't** 새 콘텐츠(차트·문구·장식)로 화면을 채우지 않는다.
- **Don't** 연결·고른 상태를 두꺼운 외곽선(2px outline·box-shadow 고리)으로 표시하지 않는다. 2px 외곽선은 키보드 초점만.
- **Don't** 눈썹 글(제목 위 작은 글), 그라데이션 글자, 1px 넘는 색 왼쪽·오른쪽 테두리 강조, 0 오프셋 색 후광, 장식 유리, 장식용 무지개색, 히어로 지표 틀 그대로 쓰기, 의미 없는 움직임.
- **Don't** 카드 안 카드 3단, 반경 0 카드형 상자, 중간 굵기(500·600), 8단계 밖 글자.
- **Don't** 단계색(`--st-*`)을 6단계 밖 의미에 쓰지 않는다.
- **Don't** `/citizen` 에 글자 기호(이모지·원 숫자 ①·화살표 →·도형 ●·꺾쇠 › ‹)·장식 아이콘(카드 머리 배지·지도 제목·트로피·층·건물·확성기·달력·연필·집)을 쓰지 않는다. 방향·열림은 lucide 선 아이콘.
- **Don't** 지도에 지시선(연결선)·말풍선 카드를 쓰지 않는다.

## 문구(서술 최소화)

2026-10-11 결정, 전 화면.
- 화면에는 이름·숫자·단위·짧은 꼬리표만. 짧은 라벨은 한 줄(넘치면 말줄임 + `title`).
- 기준·범위·판정 규칙 설명과 출처·기준일은 (i) 툴팁(`InfoTip`) 또는 제목 `title` 로. '실데이터'·SAMPLE 같은 표지는 쓰지 않는다.
- 빈 상태·오류 안내만 한 문장 남긴다. 보조 글은 `text-meta`/`ui-meta`(축·각주만 `text-caption`).
- 범례는 제목 줄(머리 줄)에 둔다.
- 단위는 '호'(일반사용자도 '집' 쓰지 않음). 표기: 큰 합계 '9만 9,896호', 비교 숫자 '16,388호', 지도 라벨 '1.6만'(단위는 범례).
- 6단계 이름: 종합상황판 ①계획 ②인허가 ③착공 ④모집 ⑤준공 ⑥입주, 그 밖의 정책 화면·지도 공식 01 정책~06 입주. 지표가 없는 단계도 6칸 틀에 '자료 없음' 칸으로 자리를 보인다(없는 숫자를 만들지 않는다).
- 일반사용자 문구는 쉬운 말: ①~④·'BL'·'D-'·'원장'·'단계 구분도' 같은 정책·내부 용어를 보이는 글에 쓰지 않는다(정의는 (i)). 일반사용자 단계 이름은 준비 중·짓는 중·모집 끝남.

## 화면별 규칙

### 정책담당자 종합상황판 `/`(2026-10-18 규격)
- **격자**: 1280px 이상 지시 카드 줄과 패널 줄이 같은 6열·간격 12(세로선 일치) — 1행 리본 4 + 선택 시점 2, 2행 실적 3 + 시도 3, 3행 2 + 2 + 2. 1280px 미만은 줄마다 원래 배치(간격 14).
- **총리 지시 카드 6장**: 바깥 카드(반경 14·카드 그림자·1px 테두리), 여백 12/16(`.ui-dir`, 1280~1365px 좌우 12)·두 줄 사이 4·높이 74, 두 줄 고정 — 줄1 지시 이름 14/400 보조색(길면 말줄임, 오른쪽 (i)), 줄2 앞말 14/400 + 숫자 20/700(카드 내용 180px 미만 18) + 단위 14 + 보조 값 14(220px 미만 숨김, 색 없음). 숫자 자체가 목록 링크. 열: 1280 이상 6 · 901~1279 3 · 900 이하 2, 간격 12. 고른 카드 = 주색 옅은 면 + 1px 주색 + 숫자 주색(2026-10-19, 2px 고리 대체), 진행 띠·자동 넘김 없음.
- **숫자 4단계**: 패널 대표 24 · 칸·타일 값 20 · 표 값 16 · 라벨 14. 12 는 축·작은 꼬리만.
- **머리 줄 하나**: 모든 패널이 `phead`(= `.ui-card-head`). 이동 링크는 `PanelLink` 하나.
- **지시가 가리키는(누른) 패널**: `.ui-linked` — 주색 섞은 1px 테두리 + 옅은 주색 그림자 + 연결 순간 한 번 밝아짐(2026-10-19, 2px outline 고리 대체).
- **리본**: 총량 라벨은 조용히(14 보통·색 띠 없음). 병목 핀은 차트가 아니라 툴팁에. 시점 조작 줄 없음(차트를 눌러 고른다).
- 판정 3칸·추이 두 숫자·시도 타일은 안쪽 카드(`ui-inset`). 맨 위 줄 없음(h1 은 sr-only).

### 일반사용자 `/citizen/projects`(사업 찾기)
- 본문 16, 12px 금지. 지연은 사실 문장(`준공 예정일이 n개월 지났어요`, 중립 색, 정상은 빈칸). 들어올 해 묶음. `.ui-tabs` 거르기. 수도권만. `/citizen` 의 '전체 n ›'·다음 준공 줄·사업 카드 '자세히 보기'가 여기로 온다(쿼리 `sido`·`sgg`·`stage`·`id`).

### 일반사용자 `/citizen/schedule`(공급 일정, 수도권만)
- 앞으로 12개월 달 막대·목록(대표 = 준공 예정, 정책 `/region` 과 같은 함수·숫자) + 지난 몇 년 착공·준공 막대(민간 포함 모든 주택, 시도 하나면 순위 한 줄).

### 그 밖의 정책 화면(`/projects`·`/region`·`/sources`·`/month`·`/agency` 등)
- 같은 카드·제목 역할·하드코딩 금지 규칙. 표는 DataGrid. 390 에서 표가 읽히지 않으면 세로 목록으로.

### 일반사용자 `/citizen`
- 정적 페이지(`tools/design/public-mock/template.html` → 빌드 `assets/citizen/index.html`). 토큰·부품 층은 `node scripts/globals-export.js` 가 낸 globals 의 `@export` 구간을 빌드가 주입한다.
- 배색은 안 2(위 Colors). 배색 제약은 해제, 아이콘·장식 배지 금지만 유지.
- 본문 16, 보조 14, 12px 금지, 지도 라벨 14 이상. 누르는 대상 44px.
- **한 화면 요약**: 1440×900 첫 화면에 요약 카드 전체·지도 전체가 보이고 문서 높이 ≤ 1.35 화면, 390×844 ≤ 1.7 화면. 무한 스크롤 없음, 자세한 목록은 옆 시트(열어도 문서 높이 그대로).
- 배치: 위 줄 = 왼쪽 요약 표 카드(지역 이름·큰 숫자 h1·단계 3줄·다음 준공) + 오른쪽 3D 지도 카드(무대 + 시간 띠, 레일은 1px 구분선만, 머리 띠·6단계 띠 없음), 아래 줄 = 사업 카드. 지도 카드 머리에 큰 지도(`/map`) 연결점.
- 숫자 정의 하나: 큰 합계 = 지도 면 합 = 카드 = 지도 라벨 = 검색 숫자.
- **사업 표 열**(2026-10-19): 이름 · 호 · 진행 · 다음 일정 · 들어올 때 · 상태 · 시행 · 큰 지도. '진행' = 6칸 가로 띠(계획·인허가·착공·모집 공고·준공·입주, CSS 칸 6개·aria-hidden·글자 기호 없음) + 지금 단계 이름(준비 중·짓는 중·모집 끝남) + 공정률이 있으면 ` · 공사 n%`. 채운 칸(지나온 단계 + 지금)은 칸마다 자기 단계색 `--st-*`, 남은 칸은 `--line2`. 칸 크기 토큰 `--pj-band-w`·`-h`·`-gap`. 카드 안쪽 1100 미만 두 줄, 600 미만 세 줄(이름·호 / 진행 / 다음 일정·상태).
- **상단 줄**(2026-10-19): 검색·보는 곳·시도 탭·단계 탭·현 위치 한 줄(넓으면 한 줄, 좁으면 줄바꿈, 390 은 검색 → 보는 곳 → 탭 줄). 필터 = 탭 목록 부품 `.ui-tabs` 둘 — 시도(서울·경기·인천, 보는 곳과 동기, 내 동네는 바꾸지 않음, 배지 없음) + 단계(전체·준비 중·짓는 중·모집 끝남). 단계 = 지도 모드(`VIEW.mode`)·사업 표 거르기(준비 중 ①② · 짓는 중 ③ · 모집 끝남 ④), 요약 단계 줄·해 띠와 한 함수(`paintFbar`)로 동기, 해 모드면 단계 탭은 모두 풀림. 단계 탭 개수 배지 = 보는 지역의 그 단계 사업 건수(사업 표를 그 단계로 거르면 나오는 건수와 같은 값, '전체' 는 전체 건수, 0건도 0 표시). 고른 단계 탭은 글자색만 단계 글자색(`--st-*-ink`, globals 규칙 3줄).
- **3D 지도**(2026-10-18 방식): MapLibre GL fill-extrusion(`assets/js/map3d-gl.js`, 바탕 지도 없이 시군구 면만, 외부 요청 0). WebGL 이 없거나 불러오지 못하면 SVG 흉내 3D(`assets/js/map3d.js`)로 대체. 시도를 고르면 그 시도로 부드럽게 확대(900ms), 고른 곳이 없으면 수도권 본토로 축소, 끌어 돌리기·기울이기(0~60°). 개별 기둥 없이 시군구 면이 호수에 따라 솟는다(0호 평평, h = 4px + (Hmax − 4)·(u/umax)^0.75, Hmax ≈ 무대 높이 8%, 16~48px — 확대해도 같은 화면 높이). SVG 대체는 옆벽 남쪽 변만, 높이 오름차순으로 벽 → 윗면. 면 위 라벨은 이름 / 호수 두 줄, 호수 큰 순으로 자리, 상위 5·보는 곳·내 동네는 반드시 보임. 자리가 없으면 옅은 바탕·이름만·생략.
- **지도 범위**(2026-10-18): 서울·인천·경기 어느 시도를 봐도 지도 판은 섬 지역(강화·옹진)을 뺀 수도권 본토 한 판이다(서울 + 인천 본토 구·영종구 + 경기, 섬 삽입 지도 없음 — 두 군은 순위·합계·요약 값에만 있고, 보는 곳이 두 군이면 인천 시도 보기와 같은 지도). 배율·면 높이·색 구간은 시도와 관계없이 같고(시도로 확대해도 순위·색이 튀지 않는다), 다른 시도 면도 같은 구간으로 칠한다. 보는 시도는 기본 라벨·순위·요약 표로, 보는 시군구는 면 효과로 구분한다. 수도권 밖은 막대 순위 그대로.
- **지역 선택**: hover 와 같은 면 효과(그 면을 그림으로만 띄움 — 고른 곳 5px + 바닥 옅은 그림자, 가리킴·키보드 2px, 윤곽은 면 계열 1.25px). 흰 알약·흰 카드·검은 굵은 경계선·지시선 없음. 기하 높이·라벨 자리는 그대로(transform 만), 줄이기 설정이면 띄우지 않는다. 키보드 초점 고리는 유지.
- '지금 신청' 공고는 카드형(카드 전체가 링크).
- 광고·모달·가격·조회수·로그인 유도 없음.

### 지도 `/map`
- 머리 줄(`.mhead`)은 상단 메뉴 바와 같은 토큰·같은 1440/1760 선. 900px 이하 머리 줄과 지도는 메뉴 바 높이만큼 내려온다.
- 색은 `--map-*`·공통 토큰 별칭만(`app.css` 색 리터럴 0). 지도 단계색 = 화면의 같은 번호 색 변수.
- 패널 그림(합계 막대·입주·기반시설 타임라인)은 테마 변수, 축척·출처 컨트롤은 지도 유리와 같은 바탕·글자.
- 일반사용자 `/map` 은 정책 용어 없이 공급 예정 호수·1년 안 준공 두 지표, 단위 '호'.
- **수도권 개요 3D**(2026-10-18): `/citizen` 과 같은 공용 모듈 `assets/js/map3d-gl.js`(MapLibre fill-extrusion, 바탕 지도 없이 시군구 면만, 외부 요청 0). `?gl=0`·WebGL 없음·불러오기 실패면 SVG 판(`assets/js/map3d.js`). 판은 섬(강화·옹진)을 뺀 본토 65면 하나(값·순위·합계엔 67곳, 섬은 순위 목록에서 고른다), 수도권 밖 시도는 평평한 맥락 면 층(고를 수 없음). 시도 카드·면 누름·`?sido=` → 그 시도로 날기(900ms), 다시 누름·'수도권 전체' → 수도권 본토로 축소. 높이 = 진행 호수(판 하나 배율), 지표를 바꾸면 색 단계·색만(지연 = 빨강 램프). 넓은 화면은 판이 범례 칸을 비켜 간다.
- 지도 사이드바 제목 크기 규칙은 미디어 쿼리 밖(좁은 화면 브라우저 기본 크기 방지).

## 시험이 잠근 규칙

`npm test` 가 지킨다. 규칙을 바꾸면 시험도 함께 고친다.
- `no-hardcode` — TSX(app·components, api 제외)의 `text-[` `rounded-[` `leading-[` `tracking-[` `shadow-[` `border-[Npx]` `p-[` 임의값·색 리터럴 0, `app.css` 의 font-size·radius 는 `var()`·`inherit`·0 만, `map3d.css` 색 리터럴 0, template `<style>` 색·px 크기·px 반경 0, 지도 JS 색은 이름 붙은 표에만, 내보내기 층이 순수 CSS 이고 필요한 토큰을 모두 담음, `.ui-*` 는 토큰만, Card 변형, 머리 줄 토큰, 카드 머리(배지 없음)·틴트 12/14%, raised 범위, 종합상황판 TSX(Board·RealPanels·styles) box-shadow·outline 임의값 0·외곽선은 focus-visible 만.
- `font-scale` — 앱의 글자 크기 임의값 없음, 8단계·역할 토큰, 정책 14·일반 16, `cn()` 안 역할 이름 금지, 굵기 400·700, 서비스 이름 'The주택'(옛 '주택파동' 없음), 로컬 Noto Sans KR·Do Hyeon 없음, 숫자 700 tabular.
- `map-fonts` — 지도 외부 글꼴 0·Do Hyeon 0, font-size 8단계·소수 px 0, 굵기 400·700, maplibre·기본 배경 라벨 14 이상·font-scale 없음, 지도 이름 The주택.
- `citizen-glyphs` — /citizen 템플릿·검색 스크립트·빌드 결과의 보이는 글·속성에 이모지·원 숫자·화살표·도형·꺾쇠 0, 장식 아이콘이 스프라이트·마크업에 없음.
- `citizen-unit-ho` — /citizen 보이는 글에 단위 '집' 없음, 일반사용자 /map 은 '공급 예정 호수'.
- `citizen-palette` — 안 2 라이트·다크 값이 globals 의 `html[data-page="citizen"]` 블록에 고정, `?pal` 시안 코드 없음, 정책 화면 `:root` 주색 그대로.
- `tailwind` — preflight 보류, 다크 = 중립 검정·바탕 #FFF/#111 통일, 글자 4.5:1, 단계색 면 3:1·글자 4.5:1·다크 면 9.5:1 이하, 주의↔착공 18° 이상, 축 글자 4.5:1, 시행주체 3:1·30°, 지연율 단계 단조, 의미 이름(옛 `--s-*` 없음), 대시보드 다크 기본.
- `globals-tokens` — 전역 CSS 는 `app/globals.css` 하나, 지도 CSS 색 리터럴 0·정의되지 않은 `var()` 0·`--font-body` 없음.
- `maptheme` — 지도 강조색 = 대시보드 주색, 단계색 = `--st-*-ink`, 블록 면 단색, 숨긴 구역은 실제로 숨음, 패널 그림·그림자·컨트롤이 테마 변수, 900px 이하 머리 줄 내려옴.
- `map-tokens.cjs`(도우미) — globals 와 app.css 의 html 규칙을 겹쳐 지도 변수의 실제 값을 풀어 다른 시험이 대비를 계산하게 한다.
- `glass` — 지도 유리 위 글자 4.5:1(가장 밝은·어두운 지도, 두 테마), 투명도 범위, 필터는 흐림·채도만, 대체 브라우저 .94 이상, 칩 글자 4.5:1.
- `motion` — 등장 동작은 움직임 줄이기가 아닐 때만, 리본 연출 단계·취소, 조용한 등장, 하네스 reduce, 카드 호버(lift/soft), `backwards`, 시점 조작 줄 없음.
- `citizen-motion` — 맥동 조건(마감 3일 이하), 솟음 세션당 한 번, 줄임 설정이면 모두 끔, 레이아웃 이동 없는 움직임.
- `bars` — 막대 모서리 없음(대시보드·지도), 막대 바깥 틀 알약, 판정 3칸·추이·시도 타일은 `ui-inset`, 3단 카드 금지.
- `board-dir-fit` — 지시 카드 두 줄 규격(`.ui-dir` 여백 토큰·높이 74 이하)·상호작용(칸 떠오름·누름 80ms·고른 것 면 + 1px)·글자 색 토큰·숫자 링크·열 수(6/3/2)·간격 12·한 줄에 맞음(번들 글꼴 폭 계산, 2117px 포함).
- `boardsample` — 리본 기하·글자 자리 겹침 0, 시도 격자, 원장 값, 이동 링크는 제목 줄 오른쪽 `PanelLink`, SAMPLE 표지 없음.
- `stages` — 6단계 표기(공식/종합상황판 이름), 지표↔단계 대응, 6칸 범례·KPI, 범례 견본 두 모양.
- `citizen-summary` — 요약 표 구조(단계 3줄 합 = 큰 숫자, 머리 띠 없음, h1 하나), 강조 금지 목록(색 테두리 2px 이상·0 오프셋 후광·그라데이션 글자·장식 유리·눈썹 글) 0.
- `map-overview-gl` — /map 개요 진짜 3D: WebGL 이면 MapGL·아니면 SVG 판, 시도 → flyTo(시도)·풀기 → flyTo(null), 지표 전환은 색 단계·색만, 섬 뺀 65면·맥락 면 13, 맥락 층 포함 스타일 외부 요청 0, 모듈 확장 하위 호환.
- `map3d-gl` — 진짜 3D 지도: 투영 역변환, 섬 뺀 본토 65면, 높이 순위 = 값 순위·0호 평평·확대해도 같은 화면 높이, 시도·수도권 상자·카메라 한도, 움직임 줄이기 0, 스타일 외부 요청 0, 고르기·가리키기는 feature-state 만, 이름표 규칙, WebGL 없음 → SVG 대체.
- `citizen-modes`·`citizen-stacking` — 모드 하나, 색 구간 = 높이 값, 1440 배치(지도 카드 72~75%), 쌓임 규칙.
- `audience-toggle`·`map-audience` — 스위치 부품 규격(48×28·44px), TopNav 오른쪽 묶음·구분선, `html[data-aud]` 규칙, 정책 전용 메뉴 숨김, 지도 관점별 지표·문구.
- `shell`·`r2-screens`·`r2-board` — 1600px 이상 1760px 선(대시보드·메뉴 바·지도), 지도 머리 줄 토큰, 탭 제목 The주택, 종합상황판 6열 격자.
- `directives` — 리본 그라데이션·경계선 토큰(`--rb-hi`·`--rb-lo`), 지시 6건 반영 화면.

## 결정 이력

최신이 앞선 것을 대체한다. 계획·측정 기록 중 `docs/product/화면-배색-개선-계획.md`·`docs/design/대국민-모드-반복개선-메타프롬프트.md` 는 git 이력에 있고, `화면-통일-계획.md`·`디자인-토큰-규칙.md` 는 커밋된 적이 없어 이 파일로만 남는다.
- 2026-10-09 색은 의미 이름 토큰 한 곳, 글자 4.5:1·차트 면 3:1, 라이트 주의 #7F6300.
- 2026-10-10 리본 그라데이션, 리본은 화려한 연출·나머지는 조용한 등장, 카드 호버 lift/soft, 막대 모서리 없음(10-18 에 바깥 틀만 알약으로).
- 2026-10-11 문구 최소화(숫자·단위·짧은 이름, 설명은 툴팁, '실데이터' 표지 없음).
- 2026-10-17 바탕 통일 #FFF / #111(남색 다크 폐기). 글꼴 Noto Sans KR 하나·8단계·400/700(Do Hyeon 폐기). 전 화면 한 모양(신문형 거둠). 지도 지시선 금지.
- 2026-10-18 하드코딩 금지(globals 한 곳). 모든 카드 둥글게·안쪽 카드는 테두리형 2단(10-17 지시 카드 모서리 0 대체). 머리 줄 TopNav 정본 64px·1600 이상 1760px·로고 'The주택'(M6-V5 대칭 게이트·키홈 심벌 + T3-D 박공 벡터 `The` + `주택`). 장식 아이콘 배지·기호 금지(/citizen). /citizen 배색 제약 해제 → 안 2 색 카드 기본값(`--cz-*`), 요약 카드는 짙은 청록. 종합상황판 규격(지시 카드 2줄·숫자 4단계·머리 줄 하나·견본 두 모양·PanelLink·6열 격자·고리 2px·리본 라벨 조용히). '단조롭다'는 콘텐츠 추가 없이 위계·규격·격자·색 배분으로. 다크 기본·라이트 선택. 지역 선택 = 면 띄우기. /citizen 지도 범위 = 섬을 뺀 수도권 본토 한 판(시도마다 맞추지 않음). 같은 날 밤: 3D 방식 = MapLibre fill-extrusion(WebGL 없으면 SVG 대체), 시도를 고르면 그 시도로 확대·풀면 수도권으로 축소(판·배율·색 구간은 그대로). `/map` 수도권 개요도 같은 모듈로(섬 면 제외, 인천 확대도 본토만).
- 2026-10-19 /citizen 상단 필터 줄(시도 + 단계) 추가, 안내 줄의 시도 칩 제거(수도권 밖은 [다른 시도]). 위 줄 높이 100vh−152 → 100vh−200(1440×906 무대 662 → 614).
- 2026-10-19 /citizen 필터(시도·단계 탭)를 검색 줄로 합쳐 상단 한 줄(검색·보는 곳·시도 탭·단계 탭·현 위치), 위 줄 높이 100vh−200 → 100vh−152(1440×906 위 줄 754·무대 662 복원). '전체 n ›'·다음 준공·'자세히 보기' → 사업 찾기, 지연 문구 안 A(`준공 예정일이 n개월 지났어요`, 정상 빈칸), 쓰이지 않는 yaml `logo` 타이포 삭제.
- 2026-10-19 탭 목록 부품 `.ui-tabs`(shadcn Tabs 값) 추가, /citizen 상단 필터를 이 부품 + 단계 건수 배지로(단추 outline·sm 대체).
- 2026-10-19 종합상황판 상호작용 부품(`.ui-dir`·`.ui-pick`·`.ui-press`·`.ui-region`·`.ui-linked`, globals): 지시 카드 여백 8/10 → 12/16·높이 64 → 74·간격 12 하나, 고른 것·연결 패널의 2px 고리 → 주색 옅은 면/섞은 1px 테두리 + 옅은 주색 그림자, 2px 외곽선은 키보드 초점만.
- 2026-10-19 로고 교체: 열린 문 심벌 + The(클레이) + 주택(잉크) 벡터 lockup(원본 docs/design/the-jutaek-logo/), `--logo-ink`·`--logo-wave` 값 변경, `--fs-logo` 폐기 → `--logo-h` 32.
- 2026-10-19 /citizen 사업 표 '지금' 열(단계 배지) → '진행' 열(6칸 띠 + 단계 이름 + 공사 n%), 열 폭 재분배·두 줄 접기 979 → 1099, 토큰 `--pj-band-*` 추가.
