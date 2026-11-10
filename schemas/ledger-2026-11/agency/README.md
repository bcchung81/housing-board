# 기관 입력 양식 (사업 원장, 2026-10)

기관이 보내는 CSV 6종의 양식이다. 파일은 UTF-8(BOM) CSV, 머리글 한 줄은 원장 열 이름 그대로이고 양식(`templates/`)에는 데이터 행이 없다. 쓰지 않는 칸은 비워 둔다. PoC 에서는 실제 기관 경로가 없어 `demo/` 의 가상 입력으로 시연한다.

## 파일별 열

**기관_사업.csv** — 사업 등록(새 사업) 또는 기존 사업에 기관 키 붙이기
| 열 | 뜻·허용값 |
|---|---|
| agency_project_key | 기관 안의 사업 키(필수). 원장에는 identifiers 의 MANUAL 값 `<기관>:<키>` 로 들어간다 |
| local_project_id | 기존 사업이면 `PRJ-시군구5-일련4`, 새 사업이면 비운다 |
| project_name, sgg_code(5자리), agency_id(lh·local·gh·sh·mnd) | 새 사업만 필수 |
| stage_code | 01 정책 · 02 사업화 · 03 인허가 · 04 건설 · 05 공급 · 06 입주 |
| public_scope, public_basis | PUBLIC · PRIVATE_ON_PUBLIC_LAND · UNKNOWN / 근거 글(선택) |

예: `LHD-NEW-01,,계양 A12 블록,28245,lh,02,PUBLIC,LH 공공주택지구`

**기관_일정.csv** — 예정 일정(원장 events, 항상 PLANNED)
- local_project_id 와 agency_project_key 중 **하나만** 채운다.
- event_type: PERMIT · CONSTRUCTION_START · PROGRESS · COMPLETION · SUPPLY_NOTICE · MOVE_IN
- plan_basis: BASELINE(당초) · REVISED(변경)
- event_date(YYYY-MM-DD)·event_month(YYYY-MM)·event_year(YYYY) 중 **정확히 하나**
- change_reason: PERMIT · BUSINESS_APPROVAL · CONSTRUCTION_START · OTHER(인허가·사업승인·착공·기타). REVISED 에만 쓴다. 설명은 change_note.

예: `PRJ-28245-0004,,CONSTRUCTION_START,REVISED,2026-04-30,,,PERMIT,인허가 보완`

**기관_계획물량.csv** — 기관 계획 호수(원장 units, quantity_type AGENCY_PLAN)
- 사업 지정은 일정과 같다. housing_type(선택), unit_count(0 이상 정수), reference_period(YYYY 또는 YYYY-MM, 선택), unit_scope(SUBTYPE 유형별 · TOTAL 합계).

**정책.csv** — local_policy_id, policy_name, announcement_date(YYYY-MM-DD, 선택), scope_region(선택)
**프로그램.csv** — local_program_id, program_name, program_definition(선택)
**연결.csv** — link_type(POLICY_PROGRAM · PROGRAM_PROJECT · POLICY_PROJECT), from_local_id, to_local_id, evidence(선택). 사업 쪽 끝은 사업 id 대신 이번에 보낸 agency_project_key 로 써도 된다.

정책·프로그램·연결 양식에서 **source_ref·review_status 는 뺐다.** 도구가 받은 입력의 원천(`agency-<기관>-<YYYYMMDD>`)과 CONFIRMED 를 채우기 때문이다. 일정·물량의 observed_month(받은 달)도 도구가 채운다.

## 받는 절차
1. 받기: 기관이 6종 중 필요한 파일을 보낸다(없는 파일은 건너뜀). 받은 날을 적는다.
2. 가져오기 도구: `node tools/ledger/import-agency.js --dir <폴더> --agency lh --received 2026-10-10 [--demo] [--out rows.json]` — 표별 추가 행 수, 거부 행(파일·줄·사유), 원장 검증 결과가 나온다. 가상 입력이면 `--demo`.
3. 오류 행 돌려보내기: 거부 행의 파일·줄·사유를 기관에 보내 고친 파일을 다시 받는다(통과한 행은 이미 가져온 키라 다시 보내지 않아도 된다).
4. 보관: 받은 CSV 와 추가 행 JSON 을 받은 날 폴더에 그대로 둔다. 원천 행(sources)이 입력 한 번마다 하나 생긴다.

## 새 사업은 임시 id
새 사업(local_project_id 빈칸)의 id 는 발급 전 임시 id 다. 원장의 마지막 번호 다음 번호로 계산만 하고(issued_at 비움) 실제 발급은 사업 id 발급 절차가 한다. 임시 id 는 바뀔 수 있으니 기관에는 agency_project_key 로 계속 부르게 한다.
