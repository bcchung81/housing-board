---
name: 더주택
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
  map-ov-1: "#C9E7E1"
  map-ov-2: "#84CBC3"
  map-ov-3: "#2E9AA0"
  map-ov-4: "#1D6A93"
  map-ov-5: "#1F3B66"
  logo-ink: "#132543"
  logo-wave: "#C75036"
  cz-accent: "#A64B35"
  cz-summary-bg: "#252C38"
  cz-apply-bg: "#F4E7DE"
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

# Design System: 더주택

**값의 정본은 `app/globals.css` 다.** 위 머리(YAML)는 라이트 테마 값을 옮긴 것이고, 다크 값·지도 전용 값(`--map-*`)·비지도 웜 범위(`data-design="warm"`)·/citizen 범위 값은 globals 에만 있다. 이 문서와 globals 가 다르면 globals 가 맞고 이 문서를 고친다. 새 값이 필요하면 화면이 아니라 globals 에 의미 이름으로 더한다.
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
- **바탕·카드** `--background`·`--card`·`--page-bg`: 기본값(`:root`·`.dark`) 라이트 #FFFFFF / 다크 #111111(2026-10-17 바탕 통일 — 옛 남색 다크 폐기). 지금은 모든 화면(대시보드·/citizen·지도)이 아래 '비지도 화면 배색'의 웜 범위로 덮는다(2026-10-19, 지도는 같은 날 사용자 지시로 합류). 카드와 바탕이 같으므로 경계는 `--border`(#D5DCE6 / #3B3B3B)가 맡는다.
- **본문 글자** `--foreground` #172B4D / #F2F2F2, **보조 글자** `--muted-foreground` #4D5B6F / #B3B3B3(회의실 투사 기준 한 단계 진하게), `--ink2`·`--mute`(차트 축·보조).
- **면** `--muted`·`--secondary`·`--accent`·`--pn2`, **선** `--border`·`--line2`·`--input`, **차트 바탕** `--chartbg`.

### 주색
- **Primary** `--primary` #23466D / #9DBCE9: 선택·조작·링크·초점(`--ring` 같은 값). 주의·지연 상태색과 분리한다.
- 모든 화면(지도 포함, 2026-10-19)은 웜 범위가 클레이로 덮는다(아래 '비지도 화면 배색'). 남색은 기본값(`:root`·`.dark`)에만 남는다.

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
- **지도 전용 웜 덮기**(2026-10-19 사용자 지시 — 핸드오프의 '지도 제외' 대체): `/map` 은 `<html data-map-shell data-design="warm">` 이라 웜 범위(머리 줄·패널·글자·선·주색 클레이·tile 8)를 그대로 받고, 지도 전용 리터럴 `--map-*` 중 **중립 면·글자·선·그늘 역할만** globals 의 `html[data-map-shell][data-design="warm"]`(다크 `html.dark[data-map-shell][data-design="warm"]`, 대체 브라우저용 `@supports not` 짝) 블록이 덮는다. 내보내기 구간 밖이고 `data-map-shell` 이 없는 /citizen 내장 지도는 `:root`·`.dark` 값 그대로. 라이트 블록은 다크에도 걸리므로 다크 블록이 같은 이름을 모두 다시 정한다(`warm-scope` 시험).
  - 값(라이트 / 다크): 바탕 `--map-bg` #F4F3EF / #1D1C19 · 하늘 `--map-sky` #EAE8E1 / #1D1C19 · 지평선 `--map-horizon` #F4F3EF / #262420 · 가림막 `--map-mask` #FCFCFA / #000 · 보조 글자 `--map-mute`·`--map-cmd-sub` #5C554C / #B8B0A4·#D6D0C6 · 팝업 보조 `--map-pop-mute` #4A443C / #C9C1B5 · 비활성 `--map-dis` #5C554C / #8A8275 · 입력줄 등급 `--map-cmd-tier` = `--foreground` / #FFF · 유리 `--map-glass-*`·`--map-fatal-bg` = 웜 카드 rgb(252 252 250)(비활성 입력줄은 웜 바탕 rgb(244 243 239)) / 웜 카드 rgb(29 28 25)·웜 바탕 rgb(20 19 17), 투명도는 옛 값 그대로(라이트 상세 카드 `--map-glass-hud` 만 .9 → .92: 뒤가 검정일 때 주의 글자 4.64) · 가리킨 표지 `--map-glass-tag-hover` #F1EEE8 / #2A2824 · 면 `--map-chip-priv-bg`·`--map-cmd-hover` #F1EEE8 / #2E2C27·웜 글자 14% · 막대 틀·회전 표시 `--map-bars-bg`·`--map-spin-track` #CBC6BC / #5E5950·웜 글자 35%, 회전 머리 `--map-spin-head` = 주색 / #FFF · 그림자 라이트 rgb(15 23 42) → rgb(44 36 26)(모양 그대로, 다크 검정 그대로) · 지형 음영 `--map-hill-shadow`·`-accent`·`-hi`, 동 그림자 `--map-dong-shadow`, 구 경계 `--map-district` #6E6254 / #D0C6B6 은 웜 회갈. app.css 의 `--mute → --map-mute` 별칭은 웜 범위의 `--mute` 가 덮지 않게 이 블록이 다시 잇는다.
  - **덮지 않는 것**: 개요 램프 `--map-ov-*`·`--map-ov-ink-*`·단계 모드 램프, 단계색, 판정(`--map-warn`·`--map-*-ink`·`--map-late-bad`), 시설·교통·기반시설(`--map-edu`·`--map-power`·`--map-transit`·`--map-fac-*`·버스), 건물 색 단계 `--map-ramp-*`·`--map-flat`, 정보 없음 `--map-ghost-*`, 단계 톤 `--map-tone-*`, 그 밖 구역 `--map-other*`, 고른 지역 노랑 `--map-sel`. 개요 판 토큰(`--map-shade`·`--map-ctx`·`--map-sido-*`·`--map-ov-0`·`--map-ov-line`)도 /citizen 지도 무대와 같은 값으로 둔다 — 개요 판 바탕 `--ov-bg` = 웜 `--background` = /citizen 지도 카드 면(#FCFCFA / #1D1C19).
  - 바탕 지도 타일(OpenFreeMap liberty·dark 벡터 스타일, V-World 백지도·midnight)의 자체 색은 바꾸지 않는다. `--map-bg` 는 그 아래 바탕(타일 전·V-World 경로)과 계획 표지 종이 색에만 보인다.

### 비지도 화면 배색(warm 범위) — '웜 뉴트럴 + 딥 잉크 + 클레이'(2026-10-19 사용자 요구로 /citizen 에 시작, 같은 날 지도 밖 모든 화면으로 확장)
- 범위 블록 `html[data-design="warm"]`(다크 `html.dark[data-design="warm"]`)이 globals 의 내보내기 구간 안에서 덮는다(입체 `raised` 블록보다 뒤, /citizen 전용 블록보다 앞). 속성은 `<html>` 에 직접 단다: 대시보드 루트 레이아웃 `app/(dashboard)/layout.tsx`(정책 화면·사업 찾기·공급 일정 등 Next 전 화면) + 정적 `/citizen` 템플릿. **지도도 웜**(2026-10-19 사용자 지시로 옛 '지도만 기본값' 결정 대체): `app/(map)/layout.tsx` 도 `data-design="warm"` 을 달고(`data-page`·`data-elev` 는 없음), 지도 전용 리터럴은 위 '지도 색'의 지도 전용 웜 덮기가 맡는다. 루트 레이아웃이 달라 오갈 때 문서가 새로 열리므로 `/citizen` 전용 범위는 섞이지 않는다.
- 값(라이트 / 다크 — 다크도 웜 뉴트럴, 10-17 중립 검정은 비지도 화면에서 대체):
  - 바탕 `--page-bg` #F4F3EF / #141311 · 카드·`--background`·`--popover` #FCFCFA / #1D1C19 · 안쪽 `--inset-bg` #FCFCFA / #262420 · `--border` #DEDED6 / #3A3731.
  - 글자 `--foreground`·`--secondary-foreground` #252C38 / #F2EFE8 · `--muted-foreground` #6B635A / #B8B0A4(회갈) · `--ink2` #434A55 / #D6D0C6 · `--mute` #716A60 / #A89F92. 기본값이 남색 리터럴인 `--card-foreground`·`--popover-foreground`·`--accent-foreground` 는 `var(--foreground)` 로 따른다.
  - 면 `--muted` #EAE8E1 / #2A2824 · `--secondary` #EEECE6 / #2E2C27 · `--accent`·`--pn2` #F1EEE8 / #2A2824 · `--line2`·`--input` #CBC6BC / #5E5950 · `--chartbg` #F8F7F3 / #171614.
  - 주색 `--primary`·`--ring` 클레이 #A64B35 / #E38A6E(다크 `--primary-foreground` #111111).
  - 반경 `--radius-tile` 8(단추·탭·입력·안쪽 카드, 웜 범위 전 화면 — 2026-10-19 지도 포함).
  - 종합상황판 리본 중립: 기준선·선택 시점·가리킴·고른 해 글자 `--rb-ink`·`--rb-cur`·`--rb-hover`·`--rb-yr-on` = `--foreground`, 축·안 고른 해 글자 `--rb-axis`·`--rb-yr-off` = `--mute`, 고른 해 괄호·기준 막대 `--rb-acc` = 주색(선택 의미), 옅은 선 `--rb-mid`·`--rb-sep`·`--rb-dim` = 웜 글자색 반투명(SVG 속성이라 rgba), 남색 유리 위 강조 `--rb-hud-acc` = 다크 주색 #E38A6E(두 테마), 다크 빗금·층 경계 `--rb-hatch`·`--rb-seam` = `--card`·`--chartbg`. 유리 판 `--rb-hud`·`--rb-hud-line` 은 그대로.
- **의미색은 덮지 않는다**: `--st-*`·`--st-*-ink`·`--ok`·`--warn`·`--bad`·`--destructive`·`--actor-*`·`--region-*`·`--chart-*`·`--map-*`·`--out*`. 웜 면 위 대비는 `warm-scope` 시험이 잰다. 웜 면 위에서 모자라던 라이트 의미색 4개만 **웜 범위 라이트에서만** 같은 색상각·채도로 명도(OKLCH L)만 내린 값으로 덮는다(2026-10-19 사용자 결정; 별도 블록 `html[data-design="warm"]:not(.dark)`, 위 warm 블록은 그대로 의미색을 덮지 않고 다크·`:root`·`.dark` 값도 그대로. 2026-10-19 부터 웜 범위인 /map 에도 걸린다): `--st-permit-ink` #327F79 → #24736D(면 최소 4.57), `--ok` #287B61 → #20755B(4.56), `--bad` #BD3A50 → #BB384E(4.52), `--st-priv` #8C99AB → #8390A2(`--chartbg` 위 3.02). 글자는 `--card`·`--page-bg`·`--muted`·`--accent`·`--inset-bg`·`--secondary` 위 4.5:1. 면 색(`--st-permit`)과 글자 색의 짝, 색상각 규칙은 그대로.
- 그림자(라이트): 같은 모양(오프셋·흐림·투명도)에 색만 남색 rgb(15 23 42) → 웜 중립 rgb(44 36 26). 별도 블록 `html[data-design="warm"]:not(.dark):not([data-elev="raised"])` 가 `--shadow-card·pop·hud·hover·hover-soft` 를 덮고, /citizen 의 입체 raised 블록은 두 겹 모양을 유지한 채 같은 웜 색을 직접 가진다(warm 이 raised 를 덮지 않게 `:not` 으로 비움). 다크 그림자는 그대로. 인쇄는 그림자 없음.
- 리본 HUD 판 `--rb-hud`(라이트): 남색 rgb(15 26 61 / 66%) → 딥 잉크 rgb(37 44 56 / 72%) — 66% 는 흰 뒤에서 흰 글자 4.72 라 '5.5:1 이상' 약속을 못 지켜 72%(5.68)로. `--rb-lo`·`--rb-hi` 같은 자료 표현 값은 그대로.
- **인쇄**: 대시보드 레이아웃의 작은 스크립트(`PRINT_LIGHT`)가 `beforeprint` 에 다크를 풀고 `afterprint` 에 되돌린다(공유 `THEME_INIT` 는 그대로 — 지도에 퍼지지 않게). `@media print` 에서 웜 범위의 `--page-bg`·`--background`·`--card`·`--popover`·`--inset-bg` = #FFFFFF, `--shadow-card`·`--shadow-pop` = none.

### /citizen 전용(`html[data-page="citizen"]`, 웜 블록 뒤)
- 공통 웜 값은 위 범위가 맡고, 이 블록에는 이 화면만의 토큰을 둔다.
- 요약 카드: 딥 잉크 **단색** `--cz-summary-bg`·`-bg-2` #252C38 / #2A313E(그라데이션 규칙은 그대로, 끝 색 = 시작 색), 큰 숫자 `--cz-summary-num` #FFF8ED.
- 지금 신청 카드(`.ap-card`): 살구색 면 `--cz-apply-bg` #F4E7DE / #33261F + 테두리 `--cz-apply-line` #E8D3C5 / #4A3A33(옛 '기본 카드' 결정 대체). 공고 접수 중·마감 임박 = 클레이, 접수 예정 = 잉크(`--foreground`).
- 지도 램프 `--map-ov-1~5` 청록→남색(라이트 #C9E7E1 #84CBC3 #2E9AA0 #1D6A93 #1F3B66 / 다크 #BFE5DE #6FCDC2 #1FA6AA #2378B6 #4053A8). `:root`·`.dark` 공유라 **/map 개요도 같다**(웜·/citizen 블록에 두지 않는다). 0·라벨 잉크·짓는 중·모집 끝남 램프는 그대로.
- 짓는 중 램프 선택 색 = 딥 잉크 `--cz-map-sel` #252C38 / #F2EEE6(코발트 대체).
- /citizen 전용 새 토큰은 접두 **`--cz-*`**: `--cz-accent`(클레이 #A64B35 / #E38A6E)·`--cz-accent-on`, `--cz-summary-*`(`-fg`·`-muted`·`-num`·`-plan`·`-build`·`-sale`·`-line`·`-panel`), `--cz-apply-bg`·`-line`, `--cz-badge-ink`, 지도 레일 흐림 `--cz-dim-op`, 지도 고른 지역 선택 색 `--cz-map-sel`·`-line`·`-ink`(/map 의 노란 `--map-sel` 과 다른 이름). 청약 단지 표·순위 줄 치수 `--pj-cols`·`--pj-row-h`·`--rank-row-h`·`--rank-bar-h` 도 여기. 요약 카드(`.smry`)는 안쪽 토큰만 `--cz-summary-*` 로 덮는다.
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

그림자는 역할별 토큰 몇 개뿐이고 테마마다 값이 다르다(라이트 = 옅은 남색 그림자(비지도 화면은 웜 중립 그림자), 다크 = 카드 위쪽 1px 하이라이트 + 짙은 그림자).
- `--shadow-card`(카드) · `--shadow-pop`(팝오버·툴팁·펼침) · `--shadow-hud`(떠 있는 판, 약하게) · `--shadow-hover`(누를 수 있는 카드 가리킴) · `--shadow-hover-soft`(누를 수 없는 카드 가리킴) · `--shadow-edge`(표의 붙은 첫 열을 민 동안). 유틸리티 `shadow-card` `shadow-pop` `shadow-edge`. 다른 그림자 값 금지.
- **HUD 유리** `.ui-hud`: 카드 색을 `--hud-alpha` 18% 로 섞은 `--hud-bg` + `--hud-backdrop`(blur 6px·saturate 1.1) + 반투명 1px 테두리(`--border` 38%). 지도 면 밖(카드 위)에 놓일 때의 값이다. 판을 지도 면 위에 통째로 띄우면 `--hud-alpha` 를 80% 이상으로 올린다. backdrop-filter 를 못 쓰는 브라우저는 96%.
- **지도 유리**(`--map-glass-*`): 흐림과 채도만 쓰고 밝기를 누르지 않는다. 상세 카드는 4px 이하 흐림, 사업·건물 팝업은 전용 유리(.72~.82, 흐림 10~14px), 입력줄은 상태별 투명도(입력 중 > 대기 > 비활성). 대체 브라우저는 .94 이상. 유리 색은 웜 카드·바탕 면(2026-10-19 지도 전용 웜 덮기 — Colors '지도 색'), 지도 그림자 라이트는 웜 중립 rgb(44 36 26).
- **입체 단계 raised**: `/citizen` 만 `<html data-elev="raised">` 로 바탕 < 카드 < 안쪽 카드 면을 한 단계씩 나눈다. 덮어쓰기는 `[data-elev]` 범위 안에만, 앱 레이아웃에는 없다.

## Shapes

- **반경 넷**: `--radius-chip` 4(칩·태그) · `--radius-tile` 10(안쪽 카드·타일·입력·표 틀·막대 틀·단추; 웜 범위 — 대시보드·/citizen·지도(2026-10-19) — 는 tile 8, 기본값 10 을 그대로 쓰는 화면은 없다) · `--radius-card` 14(바깥 구역 카드) · `--radius-full`(알약). 유틸리티 `rounded-chip/tile/card/full`(shadcn `rounded-sm`→4, `md`·`lg`→10, `xl`→14). 그 밖 반경 금지.
- **모든 카드 모서리는 둥글다**(2026-10-18). 각진(반경 0) 카드형 상자는 없다. 예외는 화면 가장자리에 붙는 구조 판(상단 머리 줄·지도 사이드 패널 판·900px 이하 전면 사업 창)뿐. 떠 있는 사업 창(2026-10-19)은 예외가 아니다(카드 반경).
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

### MetricRow · FactNote(`components/page.tsx`, 2026-10-19)
- **`MetricRow`** — 카드 제목 아래 대표값 한 줄: `label?`(지표 이름 14 보조색) · `value`(24/700 `tabular-nums`) + `unit?`(14, 값과 한 덩어리 `whitespace-nowrap`) · `items?`(보조 건수·기간 14 보조색, 빈 항목 생략, ' · ' 구분). 제목 문자열에 숫자를 붙이지 않고 이 줄로 나눈다. 대표값이 없는 표 카드에는 두지 않는다.
- **`FactNote`** — 사실 한 문장(일정 경과·원천 차이·자료 부족): 본문 크기(`--fs-body` — 정책 14 · 일반 16), `tone` = neutral(기본, `--foreground`) · warn(`--warn`) · error(`--bad`) — 색은 글자에만, 일반 지연 사실은 중립. `tip?`(`{ label, children }`)이면 문장 뒤 `InfoTip`. 면은 투명(안쪽 면이 필요하면 `className="ui-inset"`), 장식 아이콘·색 띠·배지 없음. `role="note"`.
- **카드 머리 나누기**(비지도 전 화면): 제목은 주제만('사업 목록'·'앞으로 12개월'·'수집 상태'·'단계 타임라인') · 범위는 `ScopeChip` · 대표값은 `MetricRow` · 상태 표지(색+글자)·한계 메타('당초 일정 없음')는 제목 아래 줄. 제목 문자열·`<span>` 에 건수·호수·상태를 붙이지 않는다. 일정 경과·원천 날짜 차이·숨김/대체·판정하지 않는 기관 안내는 `FactNote`(판정 없음은 중립). 표 위 소제목은 `SubTitle`(16/700), 붙은 건수는 보조 글로 뗀다.
- **수치 타일**: 라벨 14 → 값 20(칸·동네 여건·`StageKpis`) 또는 24(카드 대표·사업 질문 타일)/700 → 보조 14. 잠정 연도는 '{해}년 1~{월}월 · 잠정'.

### Buttons `.ui-btn`(shadcn 4.21.4 base-nova Button 값을 옮김)
- 기본 = 주색 채움, 가리키면 주색 80%. 변형 `.ui-btn-secondary`(가리키면 본문색 5% 섞기) · `.ui-btn-outline`(`--border` 테두리·`--background`, 다크는 `--input` 30%/50%) · `.ui-btn-ghost`(가리키면 `--muted`).
- 크기: 기본 높이 36 · `.ui-btn-sm` 32(글자 14) · `.ui-btn-icon` 정사각. 반경 tile, 굵기 700, 아이콘 16(`data-icon="inline-start|inline-end"` 쪽 여백 8/6).
- 초점: 2px `--ring` 외곽선(offset 2). 눌림: 1px 내려앉음(`aria-haspopup` 제외). 꺼짐: `--disabled-opacity` .6.
- 고른 것(`aria-pressed="true"`): 주색 옅은 면 + 주색 글자(테두리 2px 아님).
- **`.ui-btn-link`**(2026-10-19, /citizen 공고 더 보기): 바탕·테두리 없는 주색(클레이) 글자, 좌우 여백 최소, 가리키면 밑줄(바탕 그대로 투명), 고름 규칙 영향 없음.
- 보이는 높이 36, 누르는 영역 44(투명 확장 `::before`).
- 스위치(`components/ui/switch.tsx`): `role="switch"`, 48×28 트랙·22px 손잡이·44px 누름 영역.

### Tabs `.ui-tabs`(shadcn 4.21.4 TabsList·TabsTrigger 값을 옮김, 2026-10-19)
- **링크 탭**(2026-10-19 비지도 통일): 모든 변형(기본·outline·seg·line)이 `button[aria-pressed]` 과 `a[aria-current="true"]` 를 같은 모양으로 꾸민다(`> :is(button, a)`). 주소를 바꾸는 지역 선택은 `<div class="ui-tabs ui-tabs-seg" role="group" aria-label="지역">` + `Link aria-current`(링크 의미 유지).
- **역할별 형태**(비지도 전 화면): 지역 한 곳 = `.ui-tabs-seg` · 단계·지표 한 개 = `.ui-tabs-line`(지표 탭 `--tab-c` = 인허가 `--st-permit-ink` · 착공 `--st-build-ink` · 모집 `--st-sale-ink` · 준공 `--st-soon-ink`, `METRIC_COLOR` 와 같음 — /region 지난 공급 실적·/citizen/schedule 지난 몇 년) · 복수 종류 = 외곽선 칩(안 고른 칩도 `--line2` 테두리) · 정책·프로그램·상태·기관 등 긴 조건 = `ChipMenu` · 거르기 줄의 칩·메뉴·탭 높이 = `--ctl-h` 40.
- 거르기·모드 고르기용 탭 목록(탭 패널 없음). 틀 = inline-flex·`--muted` 바탕·`--muted-foreground` 글자·높이 36(`--btn-h`)·여백 `--tabs-pad` 3·반경 tile. 안의 `button` = 바탕 없음·투명 테두리·14/400·반경 `--tabs-radius`(tile − 3 = 7)·가리키면 `--foreground`.
- 고른 것 `aria-pressed="true"`: 라이트 `--card` 면 + `--shadow-card` · 다크 `--input` 30% 면 + `--input` 테두리(그림자 없음), 글자 `--foreground`, 굵기 700(shadcn 500 은 쓰지 않음). 의미는 거르기라 `role="group"` + 눌림 단추(`role="tab"` 쓰지 않음).
- 개수 배지 `.n`: 알약·`--muted-foreground` 30% 면·12/700·숫자만. 초점 2px `--ring` 외곽선(offset 2), 누름 칸 44(화면이 `::before` 로 확장).
- 의미색은 화면 범위가 글자색만 덮는다(바탕까지 칠하지 않는다).
- **테두리형 `.ui-tabs-outline`**(2026-10-19, /citizen 위쪽 줄): 입체 화면 바탕(`--page-bg` #F4F5F7)이 `--muted` 와 거의 같아 틀이 묻히므로 틀 = `--card` 면 + 1px `--border` + `--shadow-card`(검색 입력과 같은 면). 고른 탭 = 그 탭 색 `--tab-c`(기본 주색, 단계 탭은 화면이 `--st-*-ink` 로 덮음)의 옅은 면(`--tint-mix`) + 1px 같은 색 테두리 + 같은 색 글자 700, 배지 = `--tab-c` 채움 + `--card` 글자(4.5:1 이상). 가리키면 `--muted` 면.

- **채움 탭 `.ui-tabs-seg`**(2026-10-19, /citizen 시도): 틀 = `--muted` 면(테두리·그림자 없음), 안 고른 탭 투명·`--muted-foreground`, 고른 탭 = `--foreground` 면 + `--card` 글자 700(그림자 없음), 배지는 `--card` 옅은 면 + 글자색 상속.
- **밑줄 탭 `.ui-tabs-line`**(2026-10-19, /citizen 단계): 틀 바탕 없음·반경 0, 탭 = 반경 0 + 아래 2px 밑줄(`--border-w-on`), 가리키면 밑줄 `--border`, 고른 탭 = 글자 `--foreground` 700 + 밑줄 `--tab-c`(기본 `--foreground`, 화면이 단계색으로 덮음), 배지 = 바탕 없음, 고르면 글자 `--tab-c`.
- **/citizen 형태 위계**: 현 위치 = 텍스트 단추(ghost) · 지역 = 채움 탭 · 단계 = 밑줄 탭 · 공고 더 보기 = 클레이 링크(`.ui-btn-link`) · 채움은 주 행동만 · 시간 띠 고른 해 = 잉크 채움(`--foreground` 면 + `--card` 글자, 범위 규칙이 다크에서도 이김) · 반경 8.

### Search `.ui-search`(2026-10-19, /citizen 위쪽 줄)
- 틀 안에 돋보기(lucide, 왼쪽 `--search-icon-x` 12) · input · 지우기 단추(ghost·icon·sm 32, 입력이 있을 때만). 높이 `--btn-h`(위쪽 줄은 `--ctl-h` 40 으로 덮음), 글자 `--fs-body`, 자리표시 글 `--muted-foreground`, 넘치면 말줄임.
- 면 = `--card` + 1px `--border` + `--shadow-card` → 가리킴 테두리 `--line2` → 초점 테두리 `--ring` + 2px `--ring` 외곽선 + `--shadow-pop`(오프셋 있는 그림자, 0 오프셋 후광 아님), 돋보기 주색.

### Chips `.ui-chip`
- 반경 4, 1px `--line2` 테두리, 14px 보조색, 한 줄. 알약은 `--radius-full`. 강조 칩 `.ui-chip-primary`(주색 테두리·글자·700).

### Navigation — TopNav(정본)
- 한 줄 상단 메뉴 바, 높이 64(900px 이하 48, 햄버거로 접힘). 1600px 이상 1760px 선.
- 로고 = 열린 문 심벌(집 `--logo-ink`·문 `--logo-wave`) + **더**(`--logo-wave`) + **주택**(`--logo-ink`), 둘 다 Noto Sans KR Bold 윤곽선 벡터 한 벌(lockup, viewBox 202×64, 원본 `docs/design/the-jutaek-logo/`). 색 라이트 ink #132543·clay #C75036, 다크 ink #F8F7F3·clay #ED9275. 헤더 높이 32(폭 125, 900px 이하 25.6), 600px 미만은 심벌만 28. 서비스 이름 '더주택'은 링크 aria-label. 메뉴 16/400, 현재 위치는 아래 2px 주색 밑줄.
- 오른쪽 묶음: 보기 대상 스위치(사람/서류가방) → 1×20px 구분선 → 테마 스위치(해/달). 599px 이하는 구분선 없이 테마가 펼침 메뉴 맨 아래 줄.
- 일반사용자 메뉴 = 종합상황판·지도·사업 찾기·공급 일정(2026-10-19).
- 관점별 메뉴: 정책담당자 전용(사업·지역 공급·데이터 원본)은 `html[data-aud=public]` 에서 CSS 로 숨긴다. `/citizen` 머리 줄도 같은 토큰을 쓴다.

### Links
- 카드 이동 링크는 `PanelLink` 하나: 제목 줄 오른쪽 조용한 글자 링크(14px 보조색 + 작은 › 아이콘, 채움·상자 없음), 가리키면 주색·밑줄. 글자색 전환 애니메이션 없음.
- 숫자 자체가 목록 링크인 곳(지시 카드 등)은 점선 밑줄 → 가리키면 주색 실선.

- 대시보드 본문의 클래스 없는 링크는 주색(`body` 의 `[&_:not(.ui-tabs)>a:not([class])]:text-primary`) — 탭 목록(`.ui-tabs`) 안 링크는 빼고 탭 부품 색을 쓴다(2026-10-19, 링크형 지역 탭이 클레이로 칠해지던 깨짐).
### Tooltip `components/ui/info-tip.tsx`
- 설명·출처·기준일·판정 규칙은 (i) 툴팁으로. 툴팁 그림자는 `--shadow-pop`.

### Data grid `components/ui/data-grid.tsx`
- 글자 열 왼쪽·숫자 열 오른쪽, 머리글·첫 열 고정(옆으로 민 동안 `--shadow-edge`), 합계 행 고정, 불투명 줄무늬, 묶음 경계 세로선. 30행 초과 검색·건수, 120행 초과 가상 스크롤. 순서가 뜻인 표(6단계 행)는 정렬을 끈다. 페이지에서 원시 `Table` 을 직접 쓰지 않는다.

### 떠 있는 창(모달리스 사업 창, `components/windows`, 2026-10-19 — 옛 사업 상세 서랍 대체)
- 막·초점 가둠·스크롤 잠금 없음, 창마다 `role=dialog aria-modal=false`·고유 제목 id(`useId`). 면 `--popover` + 1px `--border` + `--shadow-pop` + `rounded-card`, 머리 `--card`, 본문 `--page-bg`(안쪽 카드가 떠 보이게). 새 토큰 없음.
- 폭 >900px: 끌기 전 창은 순수 CSS 로 **브라우저 보이는 영역의 정중앙**(`fixed left·top 50%` + `-translate 50%`, 2026-10-20 사용자 지시 '브라우저 한가운데' — 서버 HTML·내용 높이·화면 크기가 바뀌어도 늘 가운데), 기본 폭 800(400 ~ 화면 60%, 1280 화면이면 768), 높이 = 내용(최대 화면 − 96, 안쪽 스크롤). 여러 창은 앞 창에서 오른쪽 아래로 24 씩(`--win-off` 0·24·48 순환, 끌어 옮긴 창 다음에는 그 창 자리 +24). 머리 줄 끌기·오른쪽 아래 모서리 크기 조절을 시작하면 그 자리 px 로 바뀌고, 끌기 위 한계는 화면 맨 위(0 — 창이 상단 메뉴 위 층). 접기(머리만)·닫기. 치수 정본은 `components/windows/nav.ts`.
- 흐린 배경 막(2026-10-20 사용자 지시 '팝업이 열리면 배경화면들은 약간 흐리게'): 창이 하나라도 열려 있으면 상단 메뉴까지 화면 전체를 `--win-scrim` + `blur(var(--win-blur))` 막 한 장으로 덮는다. 눈에 보이는 효과일 뿐 `pointer-events: none`·`aria-hidden` — inert·초점 가둠·스크롤 잠금 없음(모달리스 유지). 150ms 투명도로 나타나고 움직임 줄이기면 전이 없음, 인쇄에 없음. 쌓임 = 상단 메뉴 40 < 막 50 < 창 60 < ⓘ 팝오버 70(body 포털).
- 창 안 배치는 viewport 가 아니라 창 폭을 따른다: 창 몸통 `@container`, 안쪽은 `@max-[…]` 컨테이너 변형 — 단계 칸(StageSteps·PublicSteps) 680 미만 6칸 → 3칸, 단계 타임라인 640 미만 열 폭 축소(이름 96→72·현재/실제 40→32·경과 76→56, 좌우 여백 20→12), 핵심 수치 560 이하 1열.
- 폭 ≤900px: 상단 메뉴 아래 전면 시트 하나(끌기·크기·접기 없음, 다른 사업은 내용 교체).
- 창 수: 정책담당자 3(넘치면 가장 오래된 창부터 닫음) · 일반사용자 1. 주소 = 맨 위 사업 창의 `?id=`(후보 `?cand=`), 창 0 → 1 만 기록 하나 쌓고 그 뒤는 바꿔 쓰기. Esc 는 창 관리자 하나(ⓘ → 칩 메뉴 → 맨 위 창). 등장은 `q-rise`(움직임 줄이기면 없음), 인쇄에는 없음.
- 사업 링크는 주소 그대로(`/projects?id=` 등) 두고 창 관리자가 가로챈다 — 새 탭·보조 키는 이동, 페이지 이동을 지켜야 하는 링크는 `data-window="off"`.
- 같은 모양의 다른 팝업(2026-10-20 — 오른쪽에서 밀려 나오던 판을 모두 바꿈): ① `/citizen` 팝업('전체 n'·일정·사업·검색·공고, 옛 오른쪽 시트 `#sheet`): 화면 가운데 창 하나, 폭 min(560, 화면−32), 높이 = 내용(화면−96 까지), 카드 반경·`--popover`·`--shadow-pop`, 머리 줄 끌기(닫으면 가운데로), `aria-modal="false"`·inert·Tab 가둠·막 눌러 닫기 없음, 뒤 화면을 누르면 같은 창의 내용이 바뀌고 제목에 초점, 알림은 바깥 `#live` 하나, 흐린 막은 위와 같은 토큰(0.16초). 599 이하는 아래 시트(82dvh)에 모달리스·막만 같이. ② 지도 개요 '전체 n ›' 시군구 목록(`#ovSheet`): 넓은 화면은 가운데 팝업(폭 min(480, 화면−32), `--shadow-pop`), 막 `.ov-scrim` 같은 토큰, Esc·✕ 로 닫음, 쌓임 막 < 팝업 55 < 구 고르기 메뉴 60. 768 이하는 패널 안을 덮는 판(막 없음).
- 바꾸지 않는 떠 있는 요소: 지도 상세 '공급 현황' 오른쪽 패널(레이아웃 칸)·모바일 하단 시트·위치 미확보 말풍선(`#lostPop`)·ⓘ·칩 메뉴·툴팁.

### Card hover
- 누를 수 있는 카드 `card-lift`: 2px 떠오름 + `--shadow-hover` + 테두리 주색 45%. 눌린 카드·현재 단계의 고리는 지킨다. 누르는 순간 내려앉음.
- 누를 수 없는 카드 `card-soft`: 떠오르지 않고 `--shadow-hover-soft` + 테두리 `--line2`.
- `@media (hover: hover)` 에서만, 움직임 줄이기면 떠오르지 않는다.
- 종합상황판은 아래 '종합상황판 상호작용' 부품을 쓴다(card-lift 의 고른 카드 바깥 고리를 쓰지 않는다). card-lift 는 /citizen·다른 정책 화면 그대로.

### 종합상황판 상호작용(2026-10-19, `app/globals.css` 끝 — 정책 화면 전용이라 @export 밖)
- **지시 카드 `.ui-dir`**(틀: 반경 14·1px 테두리·여백 `--dir-pad-y/x` 12/16 — 1280~1365px 6열은 좌우 12, 520px 이하 8/10 · 두 줄 사이 `--dir-gap` 4) + 면 `.ui-dir-face`(`--card`·`--border`·`--shadow-card`) + 겹친 숫자 층 `.ui-dir-layer` + 칸 `.ui-dir-cell`. 글자 색 위계는 틀의 토큰: `--dir-label`(지시 이름·앞말 = `--muted-foreground`) · `--dir-num`(숫자+단위 = `--foreground`, 고르면 `--primary`) · `--dir-sub`(보조 값 = muted). 숫자 링크 `.ui-dir-num` 점선 밑줄(`--num-underline-offset` 3) → 가리키면 주색 실선.
- **가리킴**: 칸째 2px 떠오름(`--lift-y`, 단추 면·숫자 층·(i)가 함께 — 숫자 링크를 가리켜도 가라앉지 않음) + `--shadow-hover` + 테두리 주색 45%(`--lift-mix`). 키보드 초점도 떠오름. **누름**: 떠오름 풀림 + `--shadow-card`, `--dur-press` 80ms. 움직임 줄이기면 떠오르지 않는다.
- **고른 것 `.ui-pick`**(`aria-pressed="true"`: 지시 카드·리본 범례 단추): 주색 옅은 면 `color-mix(in oklab, --primary --tint-mix, --card)`(라이트 #E2E7ED · 다크 #22252A) + 1px 주색 테두리. 두께는 그대로, 안쪽·바깥 고리 없음.
- **시도 타일 `.ui-press` + `.ui-region`**: 면 = 지연율 구간 의미색 `--rc`(화면이 style 로 넘김). 면이 뜻을 가져 고른 것은 면 대신 1px 주색 테두리 + `--shadow-linked`. 가리킴·누름은 `.ui-press`(떠오름·내려앉음). 원장 시도가 4곳 이하면 지리 격자 대신 한 줄(열 = 시도 수) + 아래 요약 칸 전체 폭(2026-10-19 수도권 한정).
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
- **Don't** 지도에 지시선(연결선)·말풍선 카드를 쓰지 않는다(옛 예외였던 /citizen 지도 위 사업 카드는 2026-10-19 없앴다).

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
- **총리 지시 카드 6장**: 바깥 카드(반경 14·카드 그림자·1px 테두리), 여백 12/16(`.ui-dir`, 1280~1365px 좌우 12, 520px 이하 8/10)·단 사이 4·최소 높이 112(`--dir-min-h`), 세 단 — 제목(지시 이름 14/400 보조색, 길면 말줄임, 오른쪽 (i)) / 숫자 30/700(`ui-kpi`) + 단위 14 — 지연·주의는 같은 크기로 나란히, 숫자 색 `--bad`·`--warn` / 지표 설명(앞말 14 보조색, 없으면 '전체 사업') + 보조 값 14(오른쪽, 폭과 관계없이 항상 보임). 숫자 자체가 목록 링크(밑줄은 가리킴·키보드 초점에서만). 열: 1280 이상 6 · 901~1279 3 · 900 이하 2, 간격 12. 고른 카드 = 주색 옅은 면 + 1px 주색 + 숫자 주색(2026-10-19, 2px 고리 대체), 진행 띠·자동 넘김 없음.
- **숫자 4단계**: 패널 대표 24 · 칸·타일 값 20 · 표 값 16 · 라벨 14. 12 는 축·작은 꼬리만.
- **머리 줄 하나**: 모든 패널이 `phead`(= `.ui-card-head`). 이동 링크는 `PanelLink` 하나.
- **지시가 가리키는(누른) 패널**: `.ui-linked` — 주색 섞은 1px 테두리 + 옅은 주색 그림자 + 연결 순간 한 번 밝아짐(2026-10-19, 2px outline 고리 대체).
- **리본**: 총량 라벨은 조용히(14 보통·색 띠 없음). 병목 핀은 차트가 아니라 툴팁에. 시점 조작 줄 없음(차트를 눌러 고른다).
- 판정 3칸·추이 두 숫자·시도 타일은 안쪽 카드(`ui-inset`). 맨 위 줄 없음(h1 은 sr-only).

### 일반사용자 `/citizen/projects`(사업 찾기)
- 본문 16, 12px 금지. 지연은 사실 문장(`준공 예정일이 n개월 지났어요`, 중립 색, 정상은 빈칸). 들어올 해 묶음. `.ui-tabs` 거르기. 수도권만. `/citizen` 의 다음 준공 줄·사업 시트 '자세히 보기'가 여기로 온다(쿼리 `sido`·`sgg`·`stage`·`id`). `/citizen` 에서 원장 사업 목록으로 가는 길은 맨 위 메뉴 '사업 찾기'다(2026-10-19).
- 거르기(2026-10-19 비지도 통일): 지역 `.ui-tabs-seg` · 단계 `.ui-tabs-line`(고른 단계 `--tab-c` = 준비 중 `--st-plan-ink` · 짓는 중 `--st-build-ink` · 모집 끝남 `--st-sale-ink`) · 시군구 `ChipMenu`(높이 `--ctl-h`, 안 고르면 `--muted` 면). 목록 머리 = '사업 목록' + `ScopeChip`('{지역} · 공공 사업') + `MetricRow`(호수 · n곳). 행 최소 56(옛 44).
- 상세 창(옛 서랍): 머리에 지역·시행기관·유형을 따로, 일정 경과는 `FactNote`(중립·`ui-inset`), 6단계는 현재 단계만 강조(지난 단계 체크 아이콘 없음), 일정 = 항목 · 날짜 · 실제/예정 3열, 전부 미정이면 '이 사업은 아직 일정 자료가 없어요' 한 문장.

- 표 행(900px 초과, 2026-10-19 수도권 깨짐 정리): 이름 칸은 늘 [사업명] / [지역 칩 · 보조] 두 줄, '지금' 칸은 늘 [진행 띠] / [단계 · 공사 n%] 두 줄(행마다 같은 모양), '다음 일정'·'들어올 때' 의 날짜('2025년 2월 18일')는 안에서 줄을 바꾸지 않는다(`keepDate`, 줄바꿈 없는 공백). 900px 이하 카드 배치는 한 줄 흐름 그대로.
### 일반사용자 `/citizen/schedule`(공급 일정, 수도권만)
- 앞으로 12개월 달 막대·목록(대표 = 준공 예정, 정책 `/region` 과 같은 함수·숫자) + 지난 몇 년 착공·준공 막대(민간 포함 모든 주택, 시도 하나면 순위 한 줄).
- 2026-10-19 비지도 통일: 시도 = 링크형 `.ui-tabs-seg`, 종류 복수 선택 = 외곽선 칩. 머리 = '앞으로 12개월' + `MetricRow`(지표 · 호수 · n곳), '지난 몇 년' + 순위 `MetricRow`(라벨 · n위 · 호수). 예정 0건 = `FactNote` 한 문장 + 범위 링크(시도 전체·모든 종류·수도권 전체 중 맞는 것). `Ahead` 는 일반사용자(`words.large`)만 행 56·이름 안 자름·달 소제목 `ui-h3`, 정책은 14·44.

- 내 동네로 옮기기(`MyAreaDefault`)는 주소에 `sido`·`sgg` 가 하나라도 없을 때만(판정은 페이지 — 사업 찾기 `MyAreaFirst` 와 같은 방식, 2026-10-19 명시 지역이 내 동네로 덮이던 결함 수정).
- 고른 달 목록(2026-10-19 수도권 깨짐 정리): 일반사용자 판은 한 단(정책 판은 다단 그대로), 지역 칸 160px, 휴대폰(≤520)은 [종류 · 이름] / [날짜 · 지역(남는 폭, 줄바꿈 가능) · 호수 · 지도 · ›] 두 줄. '앞으로 12개월' (i) 는 제목·범위 칩 옆. 지난 몇 년 연도 막대(`YearBars`)는 차트 폭 30rem 이하에서 연도 글자를 한 해 걸러 보인다(막대·읽기 이름은 모두).
### 그 밖의 정책 화면(`/projects`·`/region`·`/sources`·`/month`·`/agency` 등)
- 같은 카드·제목 역할·하드코딩 금지 규칙. 표는 DataGrid. 390 에서 표가 읽히지 않으면 세로 목록으로.
- 2026-10-19 비지도 통일: 웜 배색·tile 8, 카드 머리 나누기(위 Components), 시도 선택 = 링크형 seg(시도 5곳 넘으면 `ChipMenu`). `/projects` 목록 머리 = '사업 목록' + 범위·거르기 칩 + `MetricRow`(계획 호 · 건), 서랍 '단계 타임라인' 아래 줄에 상태 표지·'당초 일정 없음'. `/sources` 수집 상태 = 제목 + `MetricRow`(원천 n곳 · 실패 n(실패 원천 이름) · 경고 n, 색 + 글자), 원천 정의 목록은 원천 기준일·수집일 따로. `/month`·`/agency` = 실적/예정/잠정·자료 기준일은 `PageHead` meta, 낡은 자료·원천 차이는 값 옆 `--warn` 글자(배지 아님), 카드 범위에 원천 칩.

### 일반사용자 `/citizen`
- 정적 페이지(`tools/design/public-mock/template.html` → 빌드 `assets/citizen/index.html`). 토큰·부품 층은 `node scripts/globals-export.js` 가 낸 globals 의 `@export` 구간을 빌드가 주입한다.
- 배색은 '웜 뉴트럴 + 딥 잉크 + 클레이'(위 Colors). 배색 제약은 해제, 아이콘·장식 배지 금지만 유지.
- 본문 16, 보조 14, 12px 금지, 지도 라벨 14 이상. 누르는 대상 44px.
- 수도권만(검색·시도·IP·현 위치 — 밖이면 안내)(2026-10-19): 검색·[다른 시도]·[다른 동네]는 서울·인천·경기만, 수도권 밖 IP 는 추천 없이 기본 경기 보기 + 시도 고르기, 현 위치가 밖이면 '수도권만 볼 수 있어요'(저장 안 함), 저장된 내 동네가 밖이면 무시.
- **청약 단지 카드**(아래 줄 한 장, `#c-pj`, 2026-10-19 사용자 Q&A — 옛 사업 표·지도 위 사업 카드 대체): 원천 = 청약홈 APT 분양 공고(공공분양·민영). 원장 notices 의 APPLYHOME 행이 가진 시군구 코드 + 관리번호로 raw Detail·Mdl 을 잇는다(이름·제목 글자로 잇지 않는다, `data.json` 의 `ah`). 공고일이 수집 기준일 2년 안. 단위 = 지도 면(`unitKey` — 경기는 시, 수원시처럼 구가 있는 시는 구 공고를 합친다), 시도를 보면 그 시도 면 전부(줄마다 시군구 이름). 머리 = 제목 '청약 단지' + (i)만(개수·사업 링크 없음, (i) = 원천기관 · 수집 기준일 · '줄을 누르면 청약홈 원문'). 격자 하나(`--pj-cols`, 머리·줄 subgrid — 2026-10-20 사용자 피드백 '줄바꿈 없이 1열': 카드 안쪽 1200 이상은 **한 단지 = 한 줄** 9칸 = 구분 칩 · 이름 · 위치(법정동, 시도를 보면 시군구+동) · 세대 · 특별공급(세대 + 옅은 %, 한 줄) · 주택형 · 일정([단계 칩 `--pj-st-w` 80 | 다음 날짜], 끝난 줄은 칩 자리 비움) · 입주 · 시공·시행, 숫자 열 오른쪽 맞춤 tabular, 줄 높이 `--pj-row-h` 44. 아래 칸별 설명의 값 규칙은 그대로): 이름(구분 칩 '공공분양'(국민)·'민영' + 원래 단지명 그대로, 칸을 넘치면 말줄임 + 법정동 — 공고 PNU 의 법정동, 없으면 주소 낱말 가운데 그 시군구 법정동 이름, 그래도 없으면 생략) · 세대(`TOT_SUPLY_HSHLDCO`, 청약홈 원천 단위 '세대' 그대로) · 특별공급(Mdl `SPSPLY_HSHLDCO` 합 '685세대' + 옅은 전체 세대 대비 '53%'(반올림, 전체 0 이면 생략), 0 = 옅은 '없음', 주택형 줄이 없으면 옅은 '미정'; 유형별 세대(신혼부부·생애최초·다자녀·노부모 부양·기관 추천·청년·신생아·이전기관·기타, 0 인 유형 뺌)는 줄 title·aria-label 에만) · 일정(진행 중인 줄만 앞에 단계 칩 — 브라우저 오늘 날짜로 접수 예정·접수 중·발표 대기·계약 전·계약 중, 접수 시작은 특별공급 먼저, 의미색 틴트 접수 중 `--ok`·그 밖 `--primary` — 뒤에 다음 날짜 '마감 10.27'·'발표 10.21'·'계약 11.09~11.15', 끝난 줄은 칩 없이 옅은 '2026.03 공고') · 입주('2029.11', 없으면 '미정') · 주택형(Mdl 전용면적 범위 '59~84㎡') · 시공·시행(민영 = 시공사, 공공 = 사업주체 약칭 LH·SH·GH·iH, '(주)'·'주식회사' 뗌). 경쟁률·분양가는 넣지 않는다. 규제(분양가상한제·투기과열지구·공공주택지구·정비사업·대규모택지)·원래 이름·공고일은 줄 title·aria-label 에만. 정렬 = 끝나지 않은 단계 먼저 → 공고일 최근 순, 최대 5줄(`fitPj` 가 칸 높이에 맞게 접는다). 그 시군구에 2년 안 공고가 없으면 '최근 2년 청약 없음' 한 줄 + 맞닿은 면(`nb`)의 단지 3줄(시군구 이름), 이웃에도 없으면 그 한 줄만. 줄 = 청약홈 원문(`PBLANC_URL`) 새 탭(`target=_blank rel=noopener`) — 지도 아이콘 칸·지도 위 카드·면 가리킴 연결 없음. 상단 단계 탭은 이 카드를 거르지 않는다. 카드 안쪽 1200 미만 두 줄 [구분·이름·위치·세대 / 특별공급·일정·입주](주택형·시공·시행은 title, 화면 폭 약 1290 미만).
- **한 화면 요약**: 1440×900 첫 화면에 요약 카드 전체·지도 전체가 보이고 문서 높이 ≤ 1.35 화면, 390×844 ≤ 1.7 화면. 무한 스크롤 없음, 자세한 목록은 가운데 팝업(열어도 문서 높이 그대로).
- 배치: 위 줄 = 왼쪽 요약 표 카드(지역 이름·큰 숫자 h1·단계 3줄·다음 준공) + 오른쪽 3D 지도 카드(무대 + 시간 띠, 레일은 1px 구분선만 — 순위와 범례 사이도 1px 선, 머리 띠·6단계 띠 없음), 아래 줄 = 청약 단지 카드(2026-10-19). 지도 카드 머리에 큰 지도(`/map`) 연결점.
- 숫자 정의 하나: 큰 합계 = 지도 면 합 = 카드 = 지도 라벨 = 검색 숫자.
- (옛 **사업 표 열**·진행 띠·상태 칸 `lateShort` 규격은 2026-10-19 청약 단지 카드로 바뀌며 이 화면에서 없앴다. 짧은 지연 말 `lateShort` 함수는 사업 찾기 대조 시험 때문에 템플릿에 남는다. 진행 띠 토큰 `--pj-band-*`·지도 위 카드 토큰 `--mapcard-*` 는 globals 에 남아 있다.)
- **상단 줄**(2026-10-19 세 묶음): [검색] [보는 곳 + 현 위치 …… 거르기(시도 탭 · 단계 탭)]. 모든 조작 높이 `--ctl-h` 40(누름 칸 44 는 `::before`). 검색 칸 폭 상한 = 아래 요약 카드 열(같은 clamp)이라 자리가 있으면 검색 끝·보는 곳 시작·거르기 끝이 요약 카드·지도 카드 세로선에 맞는다. 모자라면 검색이 먼저 240 까지 줄고, 그다음 오른쪽 묶음이 다음 줄(그 안에서 거르기가 보는 곳 아래), 899 이하 검색 한 줄 → 보는 곳 → 거르기, 599 이하 시도 탭 3칸 · 단계 탭 2 × 2 칸(전체 폭, 가로 넘침 0). 검색 자리표시 글 '동네, 사업, 주소 검색'(초성 안내는 자동완성 판 키 안내 줄 `ㄱㅇ 초성 검색`·화면 읽기 설명). 보는 곳은 이름 + [다른 동네](동네 목록 펼침, 옛 [바꾸기])만, 안내 문장은 title. 필터 = 테두리형 탭 목록 부품 `.ui-tabs.ui-tabs-outline` 둘 — 시도(서울·경기·인천, 보는 곳과 동기, 내 동네는 바꾸지 않음, 배지 없음) + 단계(전체·준비 중·짓는 중·모집 끝남). 단계 = 지도 모드(`VIEW.mode`, 준비 중 ①② · 짓는 중 ③ · 모집 끝남 ④ — 아래 청약 단지 카드는 거르지 않는다, 2026-10-19), 요약 단계 줄·해 띠와 한 함수(`paintFbar`)로 동기, 해 모드면 단계 탭은 모두 풀림. 단계 탭 개수 배지 = 보는 지역의 그 단계 사업 건수('전체' 는 전체 건수, 0건도 0 표시). 고른 단계 탭은 단계 글자색(`--st-*-ink`)이 `--tab-c` 로 글자·옅은 면·테두리·배지를 칠한다(globals 규칙 3줄).
- **3D 지도**(2026-10-18 방식): MapLibre GL fill-extrusion(`assets/js/map3d-gl.js`, 바탕 지도 없이 시군구 면만, 외부 요청 0). WebGL 이 없거나 불러오지 못하면 SVG 흉내 3D(`assets/js/map3d.js`)로 대체. 시도를 고르면 그 시도로 부드럽게 확대(900ms), 고른 곳이 없으면 수도권 본토로 축소, 끌어 돌리기·기울이기(0~60°). 개별 기둥 없이 시군구 면이 호수에 따라 솟는다(0호 평평, h = 4px + (Hmax − 4)·(u/umax)^0.75, Hmax ≈ 무대 높이 8%, 16~48px — 확대해도 같은 화면 높이). SVG 대체는 옆벽 남쪽 변만, 높이 오름차순으로 벽 → 윗면. 면 위 라벨은 이름 / 호수 두 줄, 호수 큰 순으로 자리, 상위 5·보는 곳·내 동네는 반드시 보임. 자리가 없으면 옅은 바탕·이름만·생략. 시도를 고르면 그 시도 밖 면은 맥락 회색(`--map-ctx`)·평평(면 효과·미리보기 없음, 누르면 그 시군구 보기로 그 시도로 옮김), 시도 경계선 — 보는 시도에 닿은 선 `--map-sido-line`·`--map-sido-w` 진하게, 나머지 `--map-sido-line-weak`·`--map-sido-w-weak` 옅게, 해안선엔 없음(2026-10-19). 고른 곳이 없으면(수도권 전체) 모두 칠한다.
- **시군구 경계**(2026-10-19 사용자 피드백 '지역구별 경계를 명확하게 구분' → 같은 날 '흰색이니 촌스럽네' — /citizen·/map 개요 공용): 솟은 면 윗면 위에 안쪽 띠(`gl-rim` fill-extrusion, 한쪽 폭 `--map-edge-w` 1px, 바닥 = 그 면 높이 · 윗면 + 0.3px, 필터·feature-state 는 솟은 면과 같아 띄움·밖 면·숨긴 면을 그대로 따른다). 띠 색 = 그 면의 지금 색(단계·고른 곳·가리킴·구간 강조·흐림 상태 그대로)을 `--map-shade` 쪽으로 `--map-edge-mix`(라이트 22% · 다크 18%) 섞은 같은 색상 — 흰 띠 없음. 띠는 확대 단계(반올림)마다 한 벌이라 수도권 전체·시도 확대 모두 한쪽 0.7~1.4px. 평평한 면(0호·보는 시도 밖 회색)은 바닥 경계선 `--map-ov-line` 0.75(밖 면 경계는 카드색). SVG 대체 면 테두리 = 같은 섞음(`color-mix(in srgb, var(--c), var(--map-shade) var(--map-edge-mix))`) 0.75, 회색 밖 면·맥락 면은 카드색. 시도 경계선·고른 곳 윤곽은 그 위.
- **지도 범위**(2026-10-18): 서울·인천·경기 어느 시도를 봐도 지도 판은 섬 지역(강화·옹진)을 뺀 수도권 본토 한 판이다(서울 + 인천 본토 구·영종구 + 경기, 섬 삽입 지도 없음 — 두 군은 순위·합계·요약 값에만 있고, 보는 곳이 두 군이면 인천 시도 보기와 같은 지도). 배율·면 높이·색 구간은 시도와 관계없이 같고(시도로 확대해도 순위·색이 튀지 않는다), 고른 시도가 없으면(수도권 전체) 다른 시도 면도 같은 구간으로 칠하고, 시도를 고르면 그 시도 밖 면은 맥락 회색·평평(2026-10-19). 보는 시도는 기본 라벨·순위·요약 표로, 보는 시군구는 면 효과로 구분한다. 수도권 밖은 막대 순위 그대로.
- **지역 선택**: 면 띄우기 + 선택 색(2026-10-19 사용자 피드백 '선택 지역구가 기존 색상과 같아 구분이 안 된다'): 고른 곳 5px + 바닥 옅은 그림자 + 윗면 = 램프 밖 선택 색 `--cz-map-sel`(기본·해·모집 끝남 램프 = 클레이 #C75036 / #ED9275, 짓는 중 램프 = 딥 잉크 #252C38 / #F2EEE6), 바닥 윤곽 = 진한 쪽 `--cz-map-sel-line` 1.5px, 면 위 라벨 글자 `--cz-map-sel-ink`(4.5:1). 가리킴·키보드는 예전처럼 약하게(2px + 6% 밝힘, 윤곽 면 계열 1.25px). 범례 구간 흐림보다 선택 색이 앞선다. /map 은 토큰이 없어 예전 그대로. 흰 알약·흰 카드·검은 굵은 경계선·지시선 없음. 기하 높이·라벨 자리는 그대로(transform 만), 줄이기 설정이면 띄우지 않는다. 키보드 초점 고리는 유지.
- **지도 레일**(2026-10-19 사용자 결정): 순위 = 이름·값 아래 단색 띠(2026-10-19 사용자 피드백 '범례처럼 동일한 색상으로 개별적으로', 선택 '줄 아래 띠' — 'A안 막대가 줄 바탕' 대체; 1행 = 번호·이름·값 `--foreground`(글자는 카드 위), 2행 = 이름 열부터 값 열 끝까지 값 비례 width% 띠, 높이 `--rank-bar-h` 6px, 끝 `--radius-full`, 채움 = 그 줄 면 색 `--c` 그대로(카드색과 섞지 않음, 그라데이션·끝선 없음, 가리켜도 띠 색 그대로), 행 사이 `--s1`), 고른 곳(aria-current) = `--cz-map-sel` 2px 안쪽 테두리(우선순위 고른 곳 > 가리킴 > 흐림), 줄 높이 `--rank-row-h` 48(자리 표시 줄도 같은 값), 숫자 오른쪽 같은 폭, 가리킴·초점 줄 = `--pn2` 바탕, 보는 곳 줄 = 옅은 주색 면(가리키면 `--tint-mix-on`) + 이름 뒤 '보는 곳'(색 왼쪽 테두리 없음), 내 동네 핀은 번호 아래. 범례 = [사업 없음 작은 견본 `--map-ov-0`(1px `--border`)] 8px 떨어져 [연속 그라데이션 막대(높이 12, 끝 `--radius-full`)] + 아래 구간 경계 눈금(1×4px 눈금선 + 숫자, 겹치면 둘째 줄)(2026-10-19 사용자 피드백 '색상 그라데이션으로 표기' — 계단 칸 대체). 색 멈춤 = 구간 가운데에 그 구간의 면 색 단계(`--lg-stops`, `var(--map-ov-n)` 로 만들어 단계 모드 램프·다크를 따른다), 지도 면은 계단 색 그대로(툴팁 '면 색은 범례에 적은 호수 구간' 그대로). 구간 단추(`button.lg-sw[data-lv]`, 누름 칸 48, 한 번의 Tab + 화살표) = 그라데이션 위 같은 폭 조각(조각마다 전체 그라데이션의 제 몫을 그림): 가리킴·초점 = 미리보기(그 조각만 2px 뜨고 `--shadow-hud`, 나머지 조각은 `--cz-dim-op` 로 옅게), 누름 = 고정(`aria-pressed`, 아래 2px 주색 밑줄), 다시 누르면 풀림 — 그 구간 면만 2px 뜨고(GL feature-state `bd`) 나머지 면은 `--map-dim-mix` 만큼 카드색 쪽으로(GL `dim`·SVG `.fg.dim`), 순위 줄·범례 칸·라벨은 `--cz-dim-op` 로 흐림, 보는 시도 밖 면은 회색 그대로. 순위 줄 가리킴·초점 ↔ 지도 면 가리킴 양방향(면 2px + 라벨 굵게 `.lb-g.hv`, 순위 줄 `.hl` — 줄이 목록 칸 밖이면 목록 칸 안에서만 민다). 모드·해 재생·보는 곳으로 순위가 바뀌면 줄 FLIP 360ms · 막대 scaleX · 숫자 300ms 세기(다시 그릴 때만, 움직임 줄이기면 없음). 사업 위치 점·점 범례는 없다.
- **보는 시도 밖 면 = 이웃 1단계만**(2026-10-19, 사용자 피드백 '서울은 지역 경계 1레벨까지만 — 카드 외곽이 회색으로 차지 않게, 여백 없이 그 시도 지역구만'): 시도를 보면 밖 면 가운데 보는 시도와 변을 맞댄 시군구(공유 호 — 꼭짓점 2개 이상, 데이터 이웃표 `nb` 와 같다)만 맥락 회색·평평으로 남기고, 그 너머 면은 그리지 않는다(채움·경계선·판 그늘·가리킴·누름·키보드 없음 — 카드 바탕). 이웃이 아니어도 보는 시도·이웃에 둘러싸인 면(경기 보기의 서울 안쪽 7구)은 구멍이 나지 않게 회색으로 둔다. 시도 경계선도 보는 시도에 닿은 선만. 서울 13곳(고양·의정부·양주·남양주·구리·하남·성남·과천·안양·광명·부천·김포·인천 계양)·인천 4곳(강서·부천·시흥·김포)·경기 22곳. 공용 `Map3D.nearOf`(GL feature-state `hid` 투명, SVG `.fg.hid` 숨김). 카메라는 그 시도 모양에 꼭 맞춘다(여백: 위 면 높이 + 14 → + 5, 옆 12 → 2, 아래 14 → 판 그늘 6 — `MapGL.padFor`), 수도권 전체 보기는 그대로. SVG 대체는 확대가 없어 숨김만 같다. **/map 개요도 같은 규칙**(2026-10-19, `assets/js/overview.js` — mount `scope`·`setScope`): 시도 보기에서는 수도권 밖 13시도 맥락 면(`gl-ctx`)을 숨기고 시도 경계선(`gl-sido`)을 보이며, 왼쪽 범례 칸 비킴(`left`)만 유지한다. 수도권 전체 보기는 예전 /map 그대로(맥락 면 있음·시도 경계선 없음). /map SVG 대체는 본토 판 + 그 시도 면 상자 맞춤(geom `fit`) + draw `scope`·`hide`(섬 삽입 지도 없음). 회색 이웃 면을 누르면 그 시도로 옮긴다(/map 기존 동작).
- '지금 신청' 공고는 카드형(카드 전체가 링크).
- 광고·모달·가격·조회수·로그인 유도 없음.

### 지도 `/map`
- 머리 줄(`.mhead`)은 상단 메뉴 바와 같은 토큰·같은 1440/1760 선. 900px 이하 머리 줄과 지도는 메뉴 바 높이만큼 내려온다.
- 색은 `--map-*`·공통 토큰 별칭만(`app.css` 색 리터럴 0). 지도 단계색 = 화면의 같은 번호 색 변수.
- **배색 = 비지도 화면과 같은 웜**(2026-10-19 사용자 지시): `<html data-map-shell data-design="warm">` + 지도 전용 웜 덮기(Colors '지도 색'). 개요 3D 판은 /citizen 지도 무대와 같은 값(바탕 = 웜 카드 면, 램프·그늘·맥락 면 그대로).
- 핸드오프 반영(지도에 이미 있는 요소만, 2026-10-19): 반경은 모두 토큰이라 tile 8 이 저절로 들어온다. 개요 지표 고르기 = 밑줄 탭(`.ui-tabs.ui-tabs-line`, 라디오 의미·키보드 그대로 — 고른 모양을 `aria-checked` 에 잇는다). 시도 카드 고른 것 = 1px 주색 경계(옛 안쪽 1px 더한 2px 없앰). 전체 시군구 목록 머리 = 제목 '○○ 시군구' + 보조 건수 'n곳'(14) 분리. 다가오는 준공·입주의 'D-n'·'D-day' → 'n일 뒤'·'오늘'(120일 넘으면 'n개월 뒤' 그대로).
- 패널 그림(합계 막대·입주·기반시설 타임라인)은 테마 변수, 축척·출처 컨트롤은 지도 유리와 같은 바탕·글자.
- 일반사용자 `/map` 은 정책 용어 없이 공급 예정 호수·1년 안 준공 두 지표, 단위 '호'.
- **수도권 개요 3D**(2026-10-18): `/citizen` 과 같은 공용 모듈 `assets/js/map3d-gl.js`(MapLibre fill-extrusion, 바탕 지도 없이 시군구 면만, 외부 요청 0). `?gl=0`·WebGL 없음·불러오기 실패면 SVG 판(`assets/js/map3d.js`). 판은 섬(강화·옹진)을 뺀 본토 65면 하나(값·순위·합계엔 67곳, 섬은 순위 목록에서 고른다), 수도권 밖 시도는 평평한 맥락 면 층(고를 수 없음). 시도 카드·면 누름·`?sido=` → 그 시도로 날기(900ms), 다시 누름·'수도권 전체' → 수도권 본토로 축소. 높이 = 진행 호수(판 하나 배율), 지표를 바꾸면 색 단계·색만(지연 = 빨강 램프). 범례는 패널 맨 아래(순위 목록 아래)의 가로 그라데이션 막대 — `/citizen` 범례와 같은 모양(머리 줄 → 없음 견본 + 연속 막대 → 경계 눈금, 구간 단추·흐림은 없음, 막대 색 = `--ov-N`). 좁은 화면(≤768)은 패널이 아래 시트라 지도 위 띠에 같은 범례를 둔다. 순위 줄 수(`fitRanks`)는 범례를 그린 뒤 남은 높이로 잰다.
- 지도 사이드바 제목 크기 규칙은 미디어 쿼리 밖(좁은 화면 브라우저 기본 크기 방지).

## 시험이 잠근 규칙

`npm test` 가 지킨다. 규칙을 바꾸면 시험도 함께 고친다.
- `no-hardcode` — TSX(app·components, api 제외)의 `text-[` `rounded-[` `leading-[` `tracking-[` `shadow-[` `border-[Npx]` `p-[` 임의값·색 리터럴 0, `app.css` 의 font-size·radius 는 `var()`·`inherit`·0 만, `map3d.css` 색 리터럴 0, template `<style>` 색·px 크기·px 반경 0, 지도 JS 색은 이름 붙은 표에만, 내보내기 층이 순수 CSS 이고 필요한 토큰을 모두 담음, `.ui-*` 는 토큰만, Card 변형, 머리 줄 토큰, 카드 머리(배지 없음)·틴트 12/14%, raised 범위, 종합상황판 TSX(Board·RealPanels·styles) box-shadow·outline 임의값 0·외곽선은 focus-visible 만.
- `font-scale` — 앱의 글자 크기 임의값 없음, 8단계·역할 토큰, 정책 14·일반 16, `cn()` 안 역할 이름 금지, 굵기 400·700, 서비스 이름 '더주택'(옛 '주택파동' 없음), 로컬 Noto Sans KR·Do Hyeon 없음, 숫자 700 tabular.
- `map-fonts` — 지도 외부 글꼴 0·Do Hyeon 0, font-size 8단계·소수 px 0, 굵기 400·700, maplibre·기본 배경 라벨 14 이상·font-scale 없음, 지도 이름 더주택.
- `citizen-glyphs` — /citizen 템플릿·검색 스크립트·빌드 결과의 보이는 글·속성에 이모지·원 숫자·화살표·도형·꺾쇠 0, 장식 아이콘이 스프라이트·마크업에 없음.
- `citizen-unit-ho` — /citizen 보이는 글에 단위 '집' 없음, 일반사용자 /map 은 '공급 예정 호수'.
- `citizen-palette` — 웜 공통 라이트·다크 값(바탕·카드·글자·면·선·주색·tile 8·남색 리터럴 중립 글자·리본 중립)이 `html[data-design="warm"]` 블록에, /citizen 전용 값(`--cz-*`·표·순위 치수)은 `html[data-page="citizen"]` 블록에만(공통 값 다시 정하지 않음), 순서 raised → warm → citizen·모두 `@export` 안, 범위 속성은 대시보드 레이아웃·템플릿·지도 레이아웃(2026-10-19, `data-design` 만 — `data-page`·`data-elev` 없음) `<html>` 에 직접, `?pal` 시안 코드 없음, `:root`·`.dark` 주색(지도·기본값) 그대로.
- `warm-scope` — 웜 범위 라이트·다크의 실제 면(`--card`·`--page-bg`·`--muted`·`--accent`·`--inset-bg`) 위 글자(`--foreground`·`--muted-foreground`·`--primary`·`--st-*-ink`·`--ok`·`--warn`·`--bad`) 4.5:1, 채움 단추·축 글자(`--mute`·`--rb-axis`·`--rb-yr-off`) 4.5:1, `--st-*` 차트 바탕 위 3:1, `--ring` 3:1(웜 라이트가 덮은 의미색 4개 포함 모두 통과 — Colors), 웜 라이트 의미색 덮기·HUD 5.5:1·웜 그림자(raised 두 겹 유지, 다크 그대로), 웜 두 블록은 의미색을 덮지 않음, 인쇄(대시보드 전용 beforeprint/afterprint · `@media print` 흰 면·그림자 없음 · `THEME_INIT` 그대로), 지도 전용 웜 덮기(2026-10-19: 다크 블록이 라이트 블록 이름을 모두 다시 정함·자료색 덮지 않음·내보내기 구간 밖·/citizen 문서에서 풀린 `--map-*` 는 기본값 그대로·/map 개요 판 토큰과 `--ov-bg` = /citizen 지도 무대). 대비 식은 `tests/js/contrast.cjs`(tailwind 시험과 공유).
- `tailwind` — preflight 보류, 기본값 다크 = 중립 검정·#FFF/#111, 바탕 통일(앱·지도·/citizen 이 같은 웜 바탕 — 카드·패널 #FCFCFA / #1D1C19, 지도 칠하기 다크 바탕·후광·하늘 같은 값, 2026-10-19), 글자 4.5:1, 단계색 면 3:1·글자 4.5:1·다크 면 9.5:1 이하, 주의↔착공 18° 이상, 축 글자 4.5:1, 시행주체 3:1·30°, 지연율 단계 단조, 의미 이름(옛 `--s-*` 없음), 대시보드 다크 기본.
- `globals-tokens` — 전역 CSS 는 `app/globals.css` 하나, 지도 CSS 색 리터럴 0·정의되지 않은 `var()` 0·`--font-body` 없음.
- `maptheme` — 지도 강조색 = 대시보드 주색, 단계색 = `--st-*-ink`, 블록 면 단색, 숨긴 구역은 실제로 숨음, 패널 그림·그림자·컨트롤이 테마 변수, 900px 이하 머리 줄 내려옴.
- `map-tokens.cjs`(도우미) — globals 와 app.css 의 html 규칙을 겹쳐 지도 변수의 실제 값을 풀어 다른 시험이 대비를 계산하게 한다. 지도 html = `data-map-shell` + `data-design="warm"`(2026-10-19), `citizen: true` 면 /citizen 문서(warm + citizen + raised, `data-map-shell` 없음)로 푼다.
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
- `shell`·`r2-screens`·`r2-board` — 1600px 이상 1760px 선(대시보드·메뉴 바·지도), 지도 머리 줄 토큰, 탭 제목 더주택, 종합상황판 6열 격자.
- `directives` — 리본 그라데이션·경계선 토큰(`--rb-hi`·`--rb-lo`), 지시 6건 반영 화면.
- `windows` — 사업 창 링크 가로채기·주소·기록(push/replace/back)·창 수·자리·크기 규칙, projectWindow 종류·허용 목록(pks·bundles·bjd·필지 없음)·일반사용자 수도권만, Esc 순서·고유 id.

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
- 2026-10-19 /citizen 지도 사업 점 → 옆 시트 대신 지도 위 작은 카드(핵심만, 사업 찾기·공급 일정 연결), 토큰 `--mapcard-w`·`--mapcard-alpha` 추가.
- 2026-10-19 /citizen 지도: 시도를 보면 그 시도 밖 면은 맥락 회색·평평 + 시도 경계선(사용자 피드백 '서울 밖은 회색으로 경계를 나눠') — 토큰 `--map-sido-line`·`-weak`·`--map-sido-w`·`-weak` 추가, 공용 모듈 MapGL `setScope`·`sidoLines`·Map3D draw `scope`(/map 개요는 그대로).
- 2026-10-19 /citizen 요약 카드 바탕 짙은 청록 → 짙은 클레이 그라데이션(시안 B, `--cz-summary-bg-2` 추가, 보조·선·판 값도 시안대로).
- 2026-10-19 /citizen 위쪽 줄 정리(사용자 피드백 '검색창 세련되게·placeholder 정리', '필터 요소 개선'): 조작 높이 44/36 → 한 높이 `--ctl-h` 40, 세 묶음(검색 · 보는 곳 · 거르기)과 카드 세로선 맞춤, 검색 입력 부품 `.ui-search`·테두리형 탭 `.ui-tabs-outline`(고른 탭 = 그 색 옅은 면 + 1px + 채운 배지) 추가, 자리표시 글 '동네, 사업, 주소 검색'(초성 안내는 키 안내 줄로), 보는 곳 안내 문장 → title·[바꾸기] → [다른 동네].
- 2026-10-19 /citizen 지도 레일·지도(사용자 결정): 범례 구간 강조(단추·고정/해제, 토큰 `--map-dim-mix`·`--cz-dim-op`), 순위 ↔ 지도 양방향, 순위 바뀜 움직임(FLIP·막대·숫자), 모든 줄 막대·보는 곳 줄·순위/범례 구분선, 사업 위치 점·점 범례 삭제 → 사업 표 줄이 지도 위 카드를 연다(위치 없으면 시트), 서울 확대 때 먼 밖 면 = 카드색(`far`), 고른 지역 선택 색 `--cz-map-sel`. 공용 모듈 MapGL `setBand`·`farOf`·`hlColor`, Map3D `paintFaces` `band`(/map 개요는 옵션·토큰이 없어 그대로).
- 2026-10-19 /citizen 순위 줄 = 막대가 줄 바탕(사용자 선택 A안, 토큰 `--rank-bar-mix`·`--rank-bar-mix-on` citizen 범위) — 아래 '줄 아래 띠'로 대체.
- 2026-10-19 /citizen 사업 표(사용자 피드백): 유형 칩을 이름 앞으로(둘째 줄 공고 물량·법정동), 상태 칸 긴 문장 → 짧은 말 `lateShort`(긴 문장은 title).
- 2026-10-19 /citizen 레일 다듬기(사용자 피드백 '그래프가 촌스럽다'·'범례를 색상 그라데이션으로'): 순위 막대 = 3px 안쪽에 뜬 둥근 막대 + 램프 옅은 끝 → 면 색 그라데이션 + 2px 끝선(토큰 `--rank-bar-inset`·`-cap`·`-mix-0` 추가, `-mix` 28 → 22%·`-on` 40 → 32%), 범례 계단 칸 → 없음 견본 + 연속 그라데이션 막대 + 경계 눈금선, 구간 단추는 그라데이션 조각(구간 강조 동작 그대로). 그라데이션 금지 규칙은 자료 표현(범례·순위 막대)만 예외.
- 2026-10-19 /citizen 순위 막대(사용자 피드백 '오른쪽 선은 지우고, 색상으로 표기'): 끝선 삭제(`--rank-bar-cap` 삭제), 채움 = 그 줄 면 색 같은 색상 옅음→진함 그라데이션(`--rank-bar-mix-0` 8 → 14%, `-mix` 22 → 34%, `-mix-on` 32 → 40%; 다크 대비 4.5:1 상한 때문에 한 벌), 시작 색도 램프 1단계가 아니라 그 줄 색.
- 2026-10-19 /citizen 순위 막대 = 이름·값 아래 범례 색 단색 띠(사용자 피드백 '범례처럼 동일한 색상으로 개별적으로', 사용자 선택 '줄 아래 띠' — 'A안 막대가 줄 바탕' 대체, 토큰 `--rank-row-h` 48px·`--rank-bar-h` 6px 추가, `--rank-bar-inset`·`-mix-0`·`-mix`·`-mix-on` 삭제).
- /citizen/projects 목록 = 표(2026-10-19): 열 머리 고정(메뉴 바 아래)·칸 세로선 `--border`·DataGrid 줄무늬·줄 44 이상, 해 묶음 머리 = 주색 `--tint-mix` 띠 18/700 + 'n곳 · n호'(열 머리 아래 고정), '지금' = 6칸 진행 띠 + 단계 글자색, 900px 이하 사업별 테두리 칸.
- 사업 찾기 필터(2026-10-19): `/citizen/projects` 한 줄 = `.ui-search`+찾기 · 지역 `.ui-tabs-outline` · 시군구 `ChipMenu`(tile 반경·카드 면) · 단계 `.ui-tabs-outline`, 높이 `--ctl-h` 40, 컨테이너 64rem 미만이면 탭 묶음 다음 줄·37.5rem 이하 세로.
- 2026-10-19 /citizen 요약 카드 바탕 짙은 클레이 → 먹색 그라데이션(시안 D, 라이트 #1F2633→#2C3049 · 다크 #2B3446→#393C5C, 보조·선·판 값도 시안대로).
- 2026-10-19 /map 개요 시도 보기 = /citizen 과 같은 모양(사용자 피드백 '일반사용자 종합상황판과 동일하게 서울 선택 시 지도 모양'): 1단계 이웃 회색·너머 숨김·수도권 밖 맥락 면 숨김·카메라 꽉 맞춤.
- 2026-10-19 원장·화면 수도권 HOME 한정(비수도권 사업 2,055곳 제외, 비수도권 실시간 API 운영 차단 lib/scope.js — NON_CAPITAL_LIVE=1 개발만), 시도 칸 3개.
- 2026-10-19 /citizen 지도 보는 시도 밖 면(사용자 피드백 '서울은 지역 경계 1레벨까지만'): 상자 기준 먼 면 카드색(`far`·`farOf`) → 이웃 1단계만 회색·나머지는 그리지 않음(`Map3D.nearOf`, GL `hid`·SVG `.fg.hid`, 둘러싸인 면은 회색 유지), 시도 경계선은 보는 시도에 닿은 선만, 시도 확대 카메라 여백 축소(`MapGL.padFor`), 지도 읽는 법 툴팁의 지운 사업 위치 점 문단 삭제.
- 2026-10-19 3D 지도 시군구 경계(사용자 피드백 '지역구별 경계를 명확하게 구분', /citizen·/map 개요): 바닥 경계선만 있어 솟은 윗면 둘레에 선이 없던 것을 윗면 안쪽 띠(`gl-rim`, 확대 단계마다 한 벌·꼭짓점 줄임)로, 바닥 경계선·SVG 면 테두리 .75 → 2 × `--map-edge-w`(토큰 추가 1px, 색은 `--map-ov-line` 그대로).
- 2026-10-19 /citizen '사업' 카드 → '청약 단지'(사용자 Q&A: 공공+민영, 경쟁률·분양가 없음, 7칸 = 이름·세대·청약 단계·일정·입주·주택형·시공·시행, 최근 2년·5줄, 빈 시군구는 이웃 3줄, 원래 이름+말줄임, 줄 = 청약홈 원문). 카드 머리 '사업 n개' 링크·지도 위 사업 카드·줄 가리킴 면 강조 삭제, 단계 탭은 이 카드를 거르지 않음.
- 2026-10-19 경계 띠 색(사용자 피드백 '경계선이 흰색이니 촌스럽네 원래 색상으로 돌리던지', /citizen·/map 개요): 흰색 `--map-ov-line` → 그 면 색을 `--map-shade` 쪽으로 22%(다크 18%, 토큰 `--map-edge-mix` 추가), 바닥 경계선·SVG 면 테두리 2 × `--map-edge-w` → 0.75 원복(띠는 유지 — 빼면 '경계 명확하게'가 다시 깨진다).
- 2026-10-19 /citizen 배색 '코발트 안 2 → 웜 뉴트럴 + 딥 잉크 + 클레이'(사용자 요구): 바탕·카드·글자 웜 중립(다크도 웜 — 10-17 중립 검정은 /citizen 에서만 대체, 정책 화면·/map 다크는 그대로), 주색 클레이, 요약 카드 딥 잉크 단색, 신청 카드 살구색(`--cz-apply-*` 추가), 지도 램프 연두→남보라 → 청록→남색(/map 개요 공유), 반경 tile 8; 시도 = `.ui-tabs-seg`·단계 = `.ui-tabs-line`·`.ui-btn-link` 추가, 현 위치 ghost·[다른 동네] secondary, 시간 띠 고른 해 잉크 채움.
- 2026-10-19 /citizen 청약 단지 카드 '청약 단계' 열 → '특별공급'(사용자 피드백 '청약 단계가 전부 끝남'): 특별공급 세대 + 전체 대비 %, 유형별은 title, 진행 중 단계 칩은 일정 칸 앞으로.
- 2026-10-19 로고·서비스 이름 The주택 → 더주택(사용자 지시), 더 = 클레이 · 주택 = 잉크, Noto Sans KR Bold 윤곽, lockup viewBox 250×64 → 202×64.

- 2026-10-19 /citizen 상위 지역 패널 개선: 제목 `공급 예정 상위 지역` + 시도·기간·단위, 56px 행·4px 공통 램프색 비교 막대·순위 배지 제거, 선택은 옅은 면과 선택색 막대. 색상 구간 범례는 지도·시간 띠 아래로 이동(범례 필터·지도 연동 유지).

- 2026-10-19 /citizen 청약 단지 열 정리: 이름 → 세대 → 특별공급 → 주택형 → 일정 → 입주 → 시공·시행. 단지명과 유형·동네를 두 줄로 분리, 수량·면적 오른쪽 / 일정·입주 가운데 정렬, 머리·행 동일 트랙 유지. `--pj-cols`·`--pj-row-h`는 globals citizen 범위.
- 2026-10-19 /map 수도권 개요 범례: 지도 위 떠 있던 견본 상자를 패널 맨 아래 가로 그라데이션 막대로(사용자 피드백 '이 카드도 종합상황판의 범례처럼 하단에'). 좁은 화면은 지도 위 띠에 같은 모양.

- 2026-10-19 종합상황판 지시 카드: 최소 높이112·제목/숫자/지표 설명 3단, 숫자30·단위14·설명14, 지연·주의 동일 크기와 의미색, 보조값 상시 노출, 숫자 링크 밑줄은 호버·키보드 초점에서만 표시.

- 2026-10-19 종합상황판 판정·시도 패널: 공급 판정 제목·선택 월 분리, 판정 대상·전체 호수 대비 비중 명시, 지연/주의/정상은 평면 3열 요약(호수 우선·비율/건수 보조), 전체 사업 단계별 호수 표 별도 제목·단위. 시도별 지연 현황은 지역/지연율/판정 분포/지연 규모 가로 행·선택 시도 건수와 상세 링크 하단.

- 2026-10-19 비지도 화면 배색 통일(핸드오프 `docs/design/더주택-비지도-화면-디자인-통일-핸드오프.md` 9절 1~5): /citizen 범위의 공통 웜 토큰을 새 범위 `html[data-design="warm"]`(다크 `html.dark[…]`)로 옮겨 대시보드 루트 레이아웃·정적 /citizen 에 달았다(지도 레이아웃 제외 — 남색 기본값은 지도만). citizen 블록에는 `--cz-*`·표·순위 치수만 남김. 남색 리터럴 중립 토큰(`--card/popover/accent-foreground`, 리본 `--rb-ink·cur·hover·yr-on·axis·yr-off·acc·mid·sep·dim·hud-acc`, 다크 `--rb-hatch·seam`)을 웜 글자·보조·주색에 잇고, 의미색은 그대로(웜 면 위 대비 부족 7건은 결정 대기). 반경 tile 8 이 비지도 전 화면으로. 인쇄: 대시보드 `beforeprint` 다크 해제 + `@media print` 흰 면·그림자 없음. 공통 부품 `MetricRow`·`FactNote`(`components/page.tsx`) 추가. /citizen 다음 준공 칩 'D-13'·'D-day' → '13일 뒤'·'오늘'. 지시 카드 본문 규격을 구현(최소 112·3단·숫자 30)에 맞춰 고침.
- 2026-10-19 비지도 화면 이식(같은 핸드오프 5~8절): 카드 머리에서 숫자·상태 분리(`MetricRow`·`FactNote`·상태 줄), 탭 부품이 링크도 받음, 지역 = seg · 단계 = line · 복수 종류 = 외곽선 칩(사업 찾기의 `.ui-tabs-outline` 대체), 거르기 줄 높이 `--ctl-h`, 사업 찾기 행 44 → 56, 사업 질문 타일 값 30 → 24, `StageKpis`·동네 여건 값 20, 데이터 원본 소제목 16/400 → 16/700, 잠정 표기 '1~n월 · 잠정'. 하지 않은 것: 정책 화면 잉크 요약 승격(시안 결정 대기), `DataMeta`·`FilterBar`·`tone` 부품(쓰는 곳이 없어 만들지 않음).
- 2026-10-19 웜 범위 Q&A: 대비 부족 의미색 4개(`--st-permit-ink`·`--ok`·`--bad`·`--st-priv`)는 웜 라이트에서만 진하게, 정책 화면 잉크 요약 승격은 하지 않음, 라이트 그림자·리본 HUD 판은 웜 잉크로(raised 모양 유지).
- 2026-10-19 지표 칩 → 밑줄 탭(/region 지난 공급 실적·/citizen/schedule 지난 몇 년, 밑줄 = 지표 단계색), 공급 일정 명시 지역이 내 동네로 덮이던 결함 수정(시험 metric-tabs-myarea).
- 2026-10-19 지도도 웜 배색(사용자 지시 '지도 화면의 배경색상도 같이 수정 … 같은 핸드오프에서 참조해 개선' — 핸드오프의 지도 제외 결정 대체): `app/(map)/layout.tsx` 에 `data-design="warm"`, 지도 전용 리터럴의 중립 역할만 `html[data-map-shell][data-design="warm"]` 블록(내보내기 밖 — /citizen 내장 지도 값 그대로)이 웜으로 덮음, 자료색·개요 램프·`--map-sel` 은 그대로. 핸드오프 중 지도에 있는 요소: 개요 지표 = 밑줄 탭, 시도 카드 선택 1px, 시군구 목록 머리 제목/건수 분리, 'D-n' → 'n일 뒤'.
- 2026-10-19 수도권 깨짐 정리(ego lite 1908·1440·1280·390 확인): 링크형 탭 글자색(본문 링크 규칙에서 탭 제외), 공급 일정 달 목록 한 단·휴대폰 두 줄·연도 격년·(i) 위치, 사업 찾기 표 이름/지역·진행 두 줄 고정·날짜 줄바꿈 금지.
- 2026-10-19 사업 상세 서랍 → 떠 있는 모달리스 창(핸드오프 `docs/product/화면-데이터-활용-모달리스-창-핸드오프.md` 5절): 정책담당자 최대 3·일반사용자 1, 주소 = 맨 위 창 `?id=`/`?cand=`(0 → 1 만 push, 마지막 창 닫기 = back 또는 id 제거), 다른 화면의 사업 링크도 그 자리에서 창, ≤900px 은 옛 전면 시트 하나. 창 내용은 `lib/board/project-window.ts` 허용 목록(법정동 코드 표시 제거).
- 2026-10-20 팝업 통일(사용자 지시 '우측 슬라이드 덱 화면 찾아서 개선, 팝업 위치는 화면 중앙, 열리면 배경 약간 흐리게'): 사업 창 첫 자리 오른쪽 위 → 가운데·기본 폭 560 → 800·창 폭 기준 `@container` 배치(카드 깨짐 피드백), `/citizen` 오른쪽 시트 → 가운데 모달리스 팝업, 지도 개요 '전체 n' 판 → 가운데 팝업, 공용 막 토큰 `--win-scrim`·`--win-blur`(클릭 통과). 같은 날 청약 단지 표 한 줄 9칸·종합상황판 리본의 선택·호버·빛줄기 막대 위쪽을 그림 영역 위 끝에 맞춤(위로 4px 튀어나오던 것).
- 2026-10-20 사업 창 자리 = 브라우저 정중앙(사용자 지시): 상단 메뉴 아래 영역 기준 가운데·첫 측정 높이로 한 번 정하던 방식(메뉴 절반만큼 아래, API 로 연 창은 내용이 오면 더 내려감, 첫 그림 오른쪽 위)을 순수 CSS 정중앙으로. /citizen 팝업·지도 '전체 n' 은 이미 CSS 정중앙.
