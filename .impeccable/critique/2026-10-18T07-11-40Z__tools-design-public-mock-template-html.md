---
target: "/citizen (http://127.0.0.1:8000/citizen)"
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/Users/bcchung81/workspace/housing-board/tools/design/public-mock/template.html"
target_fingerprint: "sha256:b68775f2b60c4900ba6d4f2ee3c6b4e568be119c7971970f595283f6f33359de"
target_path: /Users/bcchung81/workspace/housing-board/tools/design/public-mock/template.html
timestamp: 2026-10-18T07-11-40Z
slug: tools-design-public-mock-template-html
---
Method: dual-agent (A: 디자인 평가 · B: 검사기 정적 + 렌더 주입)

## 디자인 건강 점수 27/40 (Acceptable)
| # | 휴리스틱 | 점수 | 핵심 문제 |
|---|---|---|---|
| 1 | 상태 보이기 | 3 | 가리켜도 반응 거의 없음 |
| 2 | 현실과 맞음 | 3 | '1만 6,388'과 '1.2만' 표기 혼용 |
| 3 | 사용자 통제 | 3 | 되돌리기·Esc 됨 |
| 4 | 일관성 | 2 | 같은 카드 안 '집'과 '호' 혼용 |
| 5 | 오류 예방 | 3 | — |
| 6 | 인식 | 3 | — |
| 7 | 유연성 | 2 | 시간·단계를 탐색할 수단 없음 |
| 8 | 미니멀 | 2 | 장식 아이콘 과다(첫 화면 SVG 55) |
| 9 | 오류 복구 | 3 | — |
| 10 | 도움말 | 3 | 설명이 ⓘ 툴팁에만 |

## 고유성 판정
지역 이름·숫자를 지우면 일반 SaaS 대시보드. 고유 언어는 돌출 지도 하나인데 정지 그림(getAnimations 0, 회전·자라기·전환 없음). 정책 화면이 가진 움직임 어휘(rb-sweep·rb-scan·q-rise·q-grow·q-pulse)를 /citizen 은 하나도 쓰지 않음.
검사기: 정적 HTML 0건(본문을 JS 로 채움). 렌더 주입 1440·443 각 4건 — nested-cards 2(.rk-hud·.lgv ui-hud), text-occlusion 2(지도 라벨 '남양주'·'1.6만', 오탐 가능).

## 우선 문제
- [P1] 지도가 정지 그림 — 높이 자라기·시점 변화·선택 전환 없음(replaceChildren 순간 교체, .lift 전이 없음). → overdrive/animate
- [P1] 390 가로 넘침 — 문서 폭 443, '언제 들어오나' 머리의 '해별 20' 단추. → adapt
- [P2] 장식 아이콘·이모티콘처럼 읽히는 기호 — 카드 머리 배지 타일, 지도 머리 지도 아이콘 3, 정육면체·트로피·확성기·연필·핀, ⓘ 5, 원 숫자 순위, ● 색 점, 바닥글 →. → distill/quieter
- [P2] 주인공 다툼 — 큰 숫자 30px vs 지도, 글자 16/14 가 80% 이상. → layout/typeset
- [P2] '집/호'·수 표기 혼용. → clarify

## 페르소나
- Jordan: '들어올 해 정해짐 1.2만', '대략' 범례, ⓘ 뜻 모름.
- Casey: 가로 넘침, 사업 점 16px, 보기 스위치 48×28.
- Sam: Tab 7번째 이름 없는 요소(검색창 추정), 지도 svg 이름 30여 개를 한 문자열로 읽음.

## 기타
- 시트 비침 관찰 1회 — --popover 불투명, sheet-in 이 opacity .4 시작이라 가려진 창 촬영 탓 가능성. 확인 필요.

## 질문
- 카드 4장 대신 지도를 무대로 삼고 숫자를 지도 위에 띄우면 무엇을 잃나?
- 국민이 '언제'를 묻는데 왜 시간이 화면에서 움직이지 않나?
- 아이콘을 다 지웠을 때 위계가 무너지면, 지금 위계는 아이콘이 버티는 것 아닌가?
