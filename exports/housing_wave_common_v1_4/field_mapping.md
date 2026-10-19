# 필드 대응표 — 주택파동(3번) 화면 자료 → 공통규격 v1.4

기준: `공통규격 양식.zip`(README_제출안내.md, CSV 8종 헤더). 변환 코드는 `tools/common_v1_4/convert.py`.

## 1. 범위

- **원천:** 종합상황판·지도 화면이 읽는 자료와 그 원천 파일만 쓴다(2026-10-10 결정). 화면 밖에 보관만 한 파일(LH 행복주택 공급계획, LH 입주계획 hwpx, SH·GH 계획 등)은 쓰지 않았다.
- **대상:** 서울·경기·인천의 공공주택.
  - LH 준공예정현황의 비대상 지역 행은 제외했다.
  - 광주 광산·전남 나주 번들과 그 레지스트리 사업도 제외했다.
- **DEMO:** 종합상황판 SAMPLE(`lib/board/sample.ts`)은 시안 고정값이라 읽지 않았다. 사업 단위 DEMO 행은 없다.

| 원천 (`source_ref`) | 파일 | 쓰인 곳 |
|---|---|---|
| WAVE-SRC-01 LH 공공주택 준공예정현황(15141761) | `data/board/lh-completion.json` (원본 CSV 의 가공본) | 사업·식별자·물량·이력 |
| WAVE-SRC-02 사업 레지스트리 | `registry/projects.json` | 계양 사업의 로컬 ID·PNU·법정동, 검토 목록 |
| WAVE-SRC-03 인천 계양구 지도 번들 | `regions/incheon-gyeyang/projects.json`·`region.json` | 계양 사업·공고 물량·입주예정 |
| WAVE-SRC-04 LH청약플러스 공사현황(계양 이력) | `data/raw/lh/cwstt/…인천계양_공정율_이력_20261003.csv` | 공정 이력·공사기간·LH 지구·블록 코드 |
| WAVE-SRC-05 LH 건설공사현황(2026-07-01) | `data/raw/lh/public/…인천계양_추출.csv` | 건축공사 착공·준공예정·공정률·공사규모 |
| WAVE-SRC-06~10 LH 입주자모집공고 A2·A3·A6·A9·A17 | `region.json` 의 `sources` 와 `data/raw/lh/notices/*.pdf` | 공고일·공고 물량·입주예정의 근거 |

## 2. 파일별 대응

### 사업_projects.csv

| 컬럼 | LH 준공예정 블록 (151건) | 계양 번들 단지 (6건) |
|---|---|---|
| local_project_id | 임시 ID `WAVE-LHC-` + SHA-1(`15141761|지구|블록`) 앞 8자리 | 레지스트리 `id`(`PRJ-28245-0001…`) 그대로 |
| project_name | `사업지구명 블록명` 원문 | 번들 `name` |
| project_unit | 블록명이 번호뿐(`1`·`01`)이면 `AREA_UNKNOWN`, 아니면 `BLOCK` | `BLOCK` |
| parent_area_name | `사업지구명` 원문 | 번들 `zones[].name` |
| block_name | `블록명` 원문(정규화하지 않음: `A-11` 그대로) | 번들 `label` |
| region | 시도 코드 → `서울`·`경기`·`인천` | `region.json` 의 `name` 앞마디 |
| sigungu | `위치` 글자의 둘째 마디. 일반구가 있으면 `성남시 수정구` | `region.json` 의 `name` 뒷마디 |
| organization | `LH` | `sponsor.name` → `LH` |
| public_scope | `PUBLIC` (LH 공공주택 공급 목록) | `PUBLIC` (`sponsorClass=public`) |
| project_status | 빈칸(원천에 단계 없음) | 레지스트리 `stageCode` → 6단계 이름 |
| is_demo | `false` | `false` |
| source_ref | WAVE-SRC-01 | WAVE-SRC-03 |

계양 블록 5곳(A2·A3·A6·A9·A10)은 LH 준공예정에도 있다. 이 블록들은 사업을 새로 만들지 않고 계양 사업에 물량·이력을 붙였다(3절).

### 사업식별자_identifiers.csv

| id_type | 값 | id_issuer | 원천 |
|---|---|---|---|
| `AREA_BLOCK` | `사업지구명|블록명` (LH 원천 표기) | LH | SRC-01 |
| `INTERNAL_PROJECT_ID` | 레지스트리 사업번호 | HOUSING_WAVE | SRC-02 |
| `BUNDLE_ID` | 번들 단지 id(`techno-A2`) | HOUSING_WAVE | SRC-03 |
| `PNU` | 레지스트리 `pnus`. **블록 윤곽 중심의 대표 필지**이며 블록 전체 필지가 아니다 | 국토교통부 | SRC-02 |
| `BJD_CODE` | 레지스트리 `bjdCodes`(10자리) | 행정안전부 | SRC-02 |
| `LH_AREA_BLOCK_CODE` | 청약플러스 `지구코드-블록코드`(`105130-01`) | LH | SRC-04 |

### 공급물량_units.csv

| 원천 | quantity_type | housing_type | unit_count | reference_period | unit_scope |
|---|---|---|---|---|---|
| LH 준공예정 행 | `PUBLIC_PLAN` | `공급유형` 원문 | `세대수` | 준공예정월 | `SUBTYPE` |
| 계양 번들(모집공고) | `NOTICE` | 번들 `kind` | 번들 `units`(공고 세대수) | 공고월. 정정공고만 있으면 빈칸 | `SUBTYPE` |
| 건설공사현황 건축공사 | `PROJECT_PLAN` | 빈칸 | `공사규모`(호) = 블록 전체 세대수 | `2026-07` | `TOTAL` |

- 같은 블록의 공급유형은 사업 1건 아래 유형별 행으로 둔다(예: 위례A2-7BL 1 → 공공분양 1,090 · 행복주택 219). 합계 행은 만들지 않는다.
- 기준이 다른 물량(PUBLIC_PLAN·NOTICE·PROJECT_PLAN)은 서로 더하지 않는다. 예를 들어 계양 A3 는 공고 359(신혼희망타운), 준공예정 359+179(공공분양·행복주택), 공사규모 538 이다.
- 번들 A10 의 세대수는 준공예정현황 값을 옮긴 것이라 NOTICE 로 넣지 않았다.

### 진행이력_events.csv

| 원천 | event_type | date_type | 날짜 칸 |
|---|---|---|---|
| LH 준공예정 | `COMPLETION` | `PLANNED` | event_date(준공예정일). 같은 날짜의 유형은 한 행에 모으고 detail 에 유형을 적음 |
| 공사현황 공정 이력 | `PROGRESS` + progress_pct | `ACTUAL` | event_date(기준일) |
| 공사현황 공사기간 시작 | `CONSTRUCTION_START` | 그 뒤 공정 기록이 있으면 `ACTUAL`, 없으면 `PLANNED` | event_date |
| 공사현황 공사기간 종료 | `COMPLETION` | 공정 100% 이고 기준일이 종료일 뒤면 `ACTUAL`, 아니면 `PLANNED` | event_date |
| 모집공고 | `SUPPLY_NOTICE` | `ACTUAL` | event_date(공고일·정정공고일. 정정이면 detail 에 표시) |
| 번들 입주 시기(공고 근거) | `MOVE_IN` | `PLANNED` | event_month(월만 있음) |
| 건설공사현황 건축공사 | `CONSTRUCTION_START`·`COMPLETION`·`PROGRESS` | 착공은 2026-07-01 이전이면 `ACTUAL`, 준공예정은 `PLANNED` | 착공·준공예정은 event_date, 공정률은 event_month(`2026-07`) |

- 날짜가 일 단위면 `event_date`, 월만 있으면 `event_month` 에 넣는다. 월만 있는 값에 날짜를 만들어 넣지 않는다.
- 준공예정(SRC-01)과 공사 종료(SRC-04)와 건축공사 준공예정(SRC-05)은 원천별로 따로 적는다. 날짜가 다르면 `DATE_CONFLICT` 로 남긴다.
- 블록 공정율(SRC-04)과 건축공사 공정률(SRC-05)은 기준이 다르다. detail 에 그 사실을 적었다.

### 원천_sources.csv

- `source_owner`: `HOUSING_WAVE`.
- `data_as_of`: 원천 기준일.
  - 준공예정: 2026-01-27
  - 공사현황: 이력의 마지막 기준일
  - 모집공고: 공고일
- `collected_at`: 수집 기록이 있는 원천만 채운다.
  - 준공예정: 카탈로그 기록
  - 공사현황: 파일 이름의 날짜
  - 나머지: 빈칸
- `source_url`: 공식 URL 을 아는 원천만 채운다(공공데이터포털 15141761, LH청약플러스 공사현황).

### 정책_policies.csv · 프로그램_programs.csv · 정책사업연결_links.csv

헤더만 낸다. 화면 자료에 정책·프로그램 원천이 없고, 사업과 이어 줄 근거도 없다. 사업지구 이름(예: `인천계양(공공주택)`)으로 프로그램을 추정해 만들지 않았다.

## 3. 판정 규칙

- **CONFIRMED와 REVIEW_REQUIRED**
  - 사업 레코드 자신이 근거를 가리키는 값은 `CONFIRMED` 이다. 번들 필드, 번들 `sources`, 레지스트리 `refs` 가 여기에 해당한다.
  - 다른 원천의 행을 지구·블록 **이름이 같아서** 붙인 값은 `REVIEW_REQUIRED` 이다. 계양 A2·A3·A6·A9 의 준공예정 행과 건설공사현황 행이 여기에 해당한다.
  - A10 의 준공예정은 번들 원천 표기(`notice-a10`)가 준공예정현황을 가리켜서 `CONFIRMED` 이다.
- **공공 판정**
  - LH 공공주택 목록과 번들의 `sponsorClass=public` 만 `PUBLIC` 으로 본다.
  - 건축HUB 주택인허가로 발급한 레지스트리 55건(성북 13·하남 42)은 공공·민간 구분 값이 없다. 그래서 사업 파일에 넣지 않고 `review_required.csv`(`PUBLIC_SCOPE_UNKNOWN`)로 분리했다.
  - 이름의 공공 표지(LH·SH·휴먼시아·행복주택·스윗시티 등, 15건)는 detail 에 참고로만 적었다.
  - 이 55건의 세대수는 사업 전체 세대수이고 공공 귀속 호수가 아니다.
- **같은 사업 판단:** 다른 조원 자료와 같은 사업인지는 판단하지 않는다. 통합 단계에서 `AREA_BLOCK`·`PNU`·인허가 관리번호(검토 목록의 `mgmHsrgstPk`)로 대조한다.

## 4. 규격에 없어 정한 값 (제안)

| 칸 | 쓴 값 | 비고 |
|---|---|---|
| source_owner | `HOUSING_WAVE` | 작성 예시와 같음 |
| public_scope | `PUBLIC` | 제출본에는 PUBLIC 만 있음. 보류 사업은 검토 목록으로 |
| project_status | `정책`·`사업화`·`인허가`·`건설`·`공급`·`입주` | 공통 6단계 이름 |
| is_demo | `false` | |
| event_type | `PERMIT`·`CONSTRUCTION_START`·`PROGRESS`·`COMPLETION`·`SUPPLY_NOTICE`·`MOVE_IN` | README 의 인허가·착공·공정·준공·공급공고·입주예정 |
| date_type | `PLANNED`·`ACTUAL` | 계획일·실제일 구분 |
| id_type | `AREA_BLOCK`·`INTERNAL_PROJECT_ID`·`BUNDLE_ID`·`PNU`·`BJD_CODE`·`LH_AREA_BLOCK_CODE` | |
| id_issuer | `LH`·`HOUSING_WAVE`·`국토교통부`·`행정안전부` | |
| match_status | `CONFIRMED`·`REVIEW_REQUIRED` | review_status 와 같은 뜻으로 씀 |
| unit_scope | `SUBTYPE`·`TOTAL` | 작성 예시의 `SUBTYPE` + 사업 전체 |
| region | `서울`·`경기`·`인천` | 작성 예시의 `경기` 형식 |
| review_required.csv 열 | `review_type, local_project_id, source_ref, record_key, record_name, detail, reason` | 규격에 열 정의 없음 |

## 5. 공통규격 보완 제안

1. **허용값 목록 확정:** 4절의 칸들은 규격에 허용값이 없다. 조원마다 다른 값을 쓰면 통합 때 다시 바꿔야 한다.
2. **준공예정 물량을 담을 종류:** LH 준공예정현황 같은 "준공예정 물량"에 맞는 `quantity_type` 이 없어 `PUBLIC_PLAN` 에 넣었다.
3. **지역 코드 칸:** `region`·`sigungu` 가 글자뿐이다. 시도 2자리·시군구 5자리 코드 칸이 있으면 통합 때 이름 차이(`경기`·`경기도`, 일반구 포함 여부)가 생기지 않는다.
4. **공공 판정 근거 칸:** 사업 파일에 `public_scope` 의 근거(시행자·공급유형·원천)를 적을 칸이 없다.
5. **식별자 범위 표시:** PNU 가 블록 전체 필지인지 대표 필지인지 구분할 칸이 없다.
6. **물량 기준일:** `공급물량_units.csv` 에는 물량의 기준일(as-of) 칸이 없어, 원천 기준일만으로 구분한다.
7. **검토 목록 양식:** `review_required.csv` 의 열을 팀 공통으로 정하면 세 조원의 검토 항목을 한 번에 모을 수 있다.
