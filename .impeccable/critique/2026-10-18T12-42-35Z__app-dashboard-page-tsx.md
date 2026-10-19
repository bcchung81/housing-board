---
target: 종합상황판(/) 정책담당자 첫 화면
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/bcchung81/workspace/housing-board/app/(dashboard)/page.tsx"
target_fingerprint: "sha256:3eafadbbaaaa3e3f4c80a26e98a78191697b9f7307d113dff8162a9fc2f45ff3"
target_path: /Users/bcchung81/workspace/housing-board/app/(dashboard)/page.tsx
timestamp: 2026-10-18T12-42-35Z
slug: app-dashboard-page-tsx
---
# 종합상황판(/) 정책담당자 첫 화면 critique — 2026-10-18

Method: dual-agent (A: 디자인 검토 · B: 검출기·브라우저 증거)

## Design Health Score: 24/40 (Acceptable)
| # | 휴리스틱 | 점수 | 핵심 |
|---|---|---|---|
| 1 | 상태 가시성 | 2 | 지시 카드 누름 효과가 화면 밖이거나 없음(p-flow 없는 id) |
| 2 | 실제 세계 일치 | 2 | '후보 계산'·'판정 대상 없음' 내부 용어 |
| 3 | 통제·자유 | 3 | |
| 4 | 일관성 | 1 | 머리 줄 3방식·범례 5모양·링크 3모양·대표 숫자 6단계 |
| 5 | 오류 예방 | 3 | |
| 6 | 인식 | 2 | '착공' 두 정의 |
| 7 | 효율 | 3 | 리본·12개월 막대 키보드 불가 |
| 8 | 미적·최소 | 2 | 1,666 ×4 반복, 불변 총량 강조 |
| 9 | 오류 회복 | 3 | |
| 10 | 도움말 | 3 | |

## Design Specificity
차트(6단계 리본·지연 띠·빗금)·시도 격자는 제품 고유, 카드 틀(제목+숫자+목록 › 6칸, 흰 위 흰 + 1px 테두리)은 범용.
검출: CLI 0건. 브라우저 5건 = 중첩 카드 4(p-snap 3칸, p-region 서울 요약 — 테두리형 2단 허용 결정으로 오탐), 줄무늬 1(예정·후보 빗금 — 오탐).

## Priority Issues
- [P1] 지시 카드 규격 불일치·숫자 위계 없음: 숫자 16px(1440)/14px(1280) = 제목 14, 앞말·링크 12; 진척 관리만 꼬리·증감, 링크 3종; 진척 관리 값 줄 넘쳐 6장 모두 81.8px(2줄 결정 깨짐). Fix: 2줄 통일 규격(이름 14 muted + (i) / 앞말 14 + 숫자 20/700 + 단위 14, 숫자 = 목록 링크, 반경 14, 1101~1279 3열). → typeset, polish
- [P1] 강조 역배분: 불변 총량 라벨 1,424,872호(16 굵게 + 3px 강조 띠) > 단계 표 20 > 12개월 30 vs 지연 14~20·병목 12px 배지. Fix: 라벨 14/400·띠 삭제, 단계 표 16, 병목 행 bad 틴트. → bolder + quieter
- [P1] 패널 규격 불일치: 머리 줄 .ui-card-head 하나, 범례 2모양, PanelLink 하나, 숫자 4단계(24/20/16/14). → polish, layout
- [P2] 열 격자 불일치(오른쪽 칸 400/620/452): 6열 기본 격자(1행 4+2, 2행 3+3, 3행 2+2+2, gap 12). → layout
- [P2] 지시 카드 누름 효과: p-flow 없는 id, 1px 고리·화면 밖. (a) 2px 고리 + scrollIntoView + id 수정 / (b) 누름 제거. → polish / distill

## Persona Red Flags
- 점검회의 발표자: 3~5m 거리에서 카드 숫자 14~16px 안 읽힘, 1,666 4곳.
- Sam: 리본 달 고르기·12개월 막대 마우스 전용, 카드당 탭 정지 3~4(리본까지 약 19).
- Alex: 링크 표시 3모양, 12px 링크 표적.

## Minor
시도 13칸 '판정 대상 없음 · 확인 필요 n건' 2줄 → '확인 필요 n건' 1줄; ▲10.8% 초록 = 정상색 혼동; 선택 시점 머리 줄 2줄 넘침; 라이트 바탕=카드 #FFF(10-17 결정).

## Questions
- 매달 같은 총량이 가장 큰 숫자여야 하나?
- 지시 카드는 점검표인가 지표 줄인가(누름 유지 여부)?
