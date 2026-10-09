# Tailwind CSS · shadcn/ui 전환 계획 (2026-10-09)

- 결정(사용자): ① 예전 요소(바닐라 지도 앱·옛 CSS·옛 개발 서버)를 버리고 **Next.js · React · Tailwind CSS · shadcn/ui**로 옮긴다. ② **지도 앱은 React 선언형으로 전부 재작성**한다(엔진 유지안은 채택하지 않음). ③ 화면은 **픽셀 단위로 완전히 같아야** 한다. ④ **1~4단계를 먼저** 하고, 지도(5~7단계)는 그 결과를 보고 진행 여부를 다시 정한다.
- 기준 커밋: `1f63b3d`(로컬 태그 `pre-tailwind`). 이 커밋의 화면이 "현재 상태"다.

## 분석 요약 (2026-10-09 측정)

| 예전 요소 | 규모 |
|---|---|
| `assets/js/app.js` | 1,785줄 · `#id` 참조 162회(고유 87) · 이벤트 39 · 레이어 69 · 전역 `window.*` |
| `assets/js/` 나머지 5개 | 1,270줄(`region` `goto` `infra` `bus` `facility`) — 순수 함수 |
| `index.html` · `assets/css/app.css` | 187줄 · 516줄(클래스 212, `backdrop-filter` 23) |
| 대시보드 CSS | `dash.css` 86 · `board.css` 153 · `shell.css` 50 |
| 시험 | 순수 함수 144건(옮기기 쉬움) · 문자열 검사 약 60건(다시 써야 함) |

임시 폴더에서 Next 16.4 · React 19.3 · Tailwind 4 · shadcn 4.21.4 로 `init` + 컴포넌트 22개 + `next build` 성공을 확인했다. shadcn 기본 스타일은 `base-nova`(Radix가 아닌 **Base UI**, `lucide-react` 1.x, `cmdk`, `cn`)이고, `Sidebar`는 아이콘 모드·모바일 `Sheet`를 기본 제공한다.

## 단계

| 단계 | 내용 | 통과 조건 |
|---|---|---|
| 1 | 화면 비교 기준선·도구 | 같은 화면 반복 촬영이 한 픽셀도 안 다름(알려진 잡음 제외) |
| 2 | Tailwind · shadcn 기반(토큰·`cn`·`components.json`), **preflight 보류** | 기준선과 같음 |
| 3 | 대시보드 화면(레일·빵부스러기·카드·표·차트 틀)을 shadcn/Tailwind로, `dash.css`·`shell.css` 삭제 | 기준선과 같음 |
| 4 | `/` 종합상황판(`board.css` 삭제). 리본 차트 SVG 계산은 유지 | 기준선과 같음 |
| 5~7 | 지도 앱 React 선언형 재작성·옛 파일 삭제·정리 | (1~4 결과를 보고 다시 정함) |

## 화면 비교 도구 (`scripts/visual/`)

```
npm run build && npx next start -p 3100 &
node scripts/visual/shoot.js --base http://localhost:3100 --out .visual/current --map
node scripts/visual/diff.mjs .visual/baseline .visual/current       # 다르면 종료 코드 1, 차이는 current/diff/ 에 빨간 PNG
```

- 대상: 대시보드 22개 경로 × 해상도 3(1440·1100·390) + 상호작용 상태 11종 + `/map` 레일 잘라내기 = **80장**(`.visual/`은 gitignore, 기준선은 `pre-tailwind` 태그를 빌드해 다시 만든다).
- 결정적이게: `prefers-reduced-motion`(시안 순환·전환 끔), 촬영 전 포인터를 화면 밖으로 치움, 글꼴 로딩 대기, 툴팁은 보일 때까지 대기.
- **이미지는 CSS 픽셀과 1:1**이어야 한다. `ego-browser`의 `page.screenshot`은 화면 배율(이 기계 1.1) 보정이 겹쳐 이미지가 줄어들어, `Page.captureScreenshot`을 `clip.scale: 1`로 직접 부른다. 뷰포트 폭도 같은 배율로 보정해 준다(모바일 에뮬레이션 폭은 그대로).
- 비교는 한 픽셀의 R·G·B 최대 차이가 **2 이하면 같은 것**으로 본다(그라데이션 디더링 잡음: 같은 화면을 두 번 찍어도 ±1~2). 알려진 잡음은 `noise.json`에 파일 이름과 픽셀 수로 적는다 — 지금은 `area-11@390`(축소된 SVG 격자선, 515px) 하나다.
- 지도 캔버스는 타일·버스 때문에 비교하지 않는다. 지도 화면의 껍데기 비교는 5단계에서 정한다.

## 알려진 한계

- 브라우저 기본 위젯(`<input type=range>` · `<select>` · `<details>` · 체크박스)은 shadcn 컴포넌트로 바꾸면 픽셀이 달라진다. 픽셀 동일이 우선이라 이런 곳은 기본 위젯을 유지하고 Tailwind로 겉만 맞춘다.
- shadcn 기본값(둥근 정도·높이·포커스 링)은 우리 디자인과 다르므로 컴포넌트마다 덮어쓴다. Tailwind `preflight`는 전역 리셋이라 마지막 단계에서 켠다.
