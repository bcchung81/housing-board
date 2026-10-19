# 변환 보고서 — 주택파동 공통규격 v1.4

이 파일은 `tools/common_v1_4/convert.py` 가 만든다. 같은 입력이면 같은 내용이 나온다(실행 시각을 적지 않는다).

## 1. 입력 파일

| 파일 | SHA-256(앞 12자리) |
|---|---|
| `data/board/lh-completion.json` | `698042dfdc22` |
| `data/board/sources.json` | `9031364d5fbc` |
| `registry/projects.json` | `dcada9ec177c` |
| `regions/index.json` | `19e631fc151e` |
| `regions/incheon-gyeyang/projects.json` | `af88065243a5` |
| `regions/incheon-gyeyang/region.json` | `62c12421fa5d` |
| `data/raw/lh/cwstt/lh_공사현황_인천계양_공정율_이력_20261003.csv` | `91c4f0ca77ec` |
| `data/raw/lh/public/LH_건설공사현황_20260701_인천계양_추출.csv` | `b0efaff91016` |

## 2. 출력 파일

| 파일 | 행 수 |
|---|---:|
| `정책_policies.csv` | 0 |
| `프로그램_programs.csv` | 0 |
| `사업_projects.csv` | 157 |
| `정책사업연결_links.csv` | 0 |
| `사업식별자_identifiers.csv` | 186 |
| `진행이력_events.csv` | 255 |
| `공급물량_units.csv` | 214 |
| `원천_sources.csv` | 10 |
| `review_required.csv` | 95 |

## 3. 원천별 변환·제외 건수

| 원천 | 항목 | 건수 |
|---|---|---:|
| LH 준공예정현황 | 입력 행 | 351 |
| LH 준공예정현황 | 제외: 대상 지역 밖(행) | 147 |
| LH 준공예정현황 | 사업(블록) | 151 |
| LH 준공예정현황 | 변환 행(유형별 물량) | 204 |
| LH 준공예정현황 | 계양 번들 단지에 합침(블록) | 5 |
| 사업 레지스트리 | 입력 사업 | 77 |
| 사업 레지스트리 | 검토 목록: 공공 여부 근거 없음 | 55 |
| 사업 레지스트리 | 제외: 대상 지역 밖 | 16 |
| 사업 레지스트리 | 계양 번들 단지로 변환 | 6 |
| 지도 번들 | 계양 단지 | 6 |
| 지도 번들 | 제외: 대상 지역 밖(광주 광산구) | 4 |
| 지도 번들 | 제외: 대상 지역 밖(전남 나주시) | 12 |
| LH 건설공사현황(계양 추출) | 입력 행 | 22 |
| LH 건설공사현황(계양 추출) | 변환 행(건축 공사) | 5 |
| LH 건설공사현황(계양 추출) | 제외: 설비·조경·지구 조성 공사 | 17 |

## 4. 읽지 않은 화면 자료(제외 유형)

| 자료 | 화면 | 건수 | 제외 이유 |
|---|---|---:|---|
| 종합상황판 SAMPLE (`lib/board/sample.ts`) | 종합상황판 위젯 6개 | 사업 단위 행 0 | DEMO(시안 고정값). 실데이터 제출본에서 뺀다 |
| 통계누리 5표 (`data/board/molit.json`) | 종합상황판 월별 실적 | 65,978행 | 시도·월 단위 통계라 사업 단위 규격에 넣을 곳이 없음 |
| 실시간 API 응답 (`.cache`) | 지도 공고·인허가·건물 등 | — | 24시간 캐시라 다시 돌리면 같은 결과가 나오지 않음(보관 자료 아님) |
| 지도 기반시설·건물 번들 (`infra.json`·`buildings.json`·`context.json`) | 지도 | — | 학교·정류장·건물 윤곽은 주택공급 사업이 아님 |

## 5. 검토 필요 항목(`review_required.csv`)

| 유형 | 건수 | 뜻 |
|---|---:|---|
| `PUBLIC_SCOPE_UNKNOWN` | 55 | 공공주택 여부를 원천으로 확인할 수 없어 사업 파일에서 뺀 사업 |
| `CROSS_SOURCE_NAME_MATCH` | 9 | 다른 원천의 행을 지구·블록 이름으로 같은 사업에 붙임(행은 REVIEW_REQUIRED) |
| `DATE_CONFLICT` | 11 | 같은 사업의 착공·준공 날짜가 원천마다 다름 |
| `MOVE_IN_FROM_COMPLETION` | 1 | 입주 시기가 준공예정일을 옮긴 값이라 입주예정에서 뺌 |
| `BLOCK_NAME_NUMERIC` | 19 | 블록명이 번호뿐(project_unit=AREA_UNKNOWN) |

`PUBLIC_SCOPE_UNKNOWN` 중 이름에 공공 표지(LH·SH·휴먼시아·행복주택·스윗시티 등)가 있는 사업은 15건이다. 표지는 참고용이고 확정 근거가 아니다.

## 6. 원천에 없어 비워 둔 값

- `정책_policies.csv`·`프로그램_programs.csv`·`정책사업연결_links.csv`: 화면 자료에 정책·프로그램과 사업을 잇는 근거가 없어 헤더만 냈다.
- `project_status`: LH 준공예정현황에는 단계가 없어 그 블록들은 비웠다(계양 단지만 레지스트리 단계 코드).
- 정정공고만 있는 모집공고(A2·A3·A6·A9)는 최초 공고일이 원천에 없어, 공고 물량의 `reference_period` 를 비웠다.
- `MOVE_IN_ACTUAL`(입주 실적): 원천 없음.
- 원천 `collected_at`: 지도 번들·건설공사현황·모집공고는 수집일 기록이 없어 비웠다.

물량·이력 행의 review_status: CONFIRMED 439 · REVIEW_REQUIRED 30

## 7. 검증

검증 통과 (UTF-8 BOM·헤더·필수 칸·허용값·날짜·숫자·NULL·ID 중복·참조 무결성·DEMO·행 중복·인증키 검사)

## 8. 다시 만들기

```
python3 tools/common_v1_4/convert.py
python3 tools/common_v1_4/validate.py exports/housing_wave_common_v1_4
```
