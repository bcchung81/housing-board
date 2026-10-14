# HOME DB 덤프 → Supabase 데이터 이관 계획


> 2026-10-14 대체됨: 방향(수도권은 덤프 정본·시도 단위 교체)은 `데이터-정제-계획.md` 를 따른다. 이 문서의 덤프 측정값(2·7절)은 그대로 유효하다.
- 작성일: 2026-10-14
- 입력: `~/Downloads/HOME_DB_20261013_230241/`
  - `home.dump`: pg_dump custom, PostgreSQL 16.9, PostGIS 3.5.2, 310MB, 원본 커밋 21c60b1, 스냅샷 2026-10-13 14:02 UTC
- 조건: Docker를 쓰지 않는다. 덤프 README의 복원 절차는 Docker를 전제로 하므로 따르지 않는다.
- 측정 산출물: 세션 scratchpad `home-dump/`(임시 폴더, 저장소 밖). 측정은 읽기 전용으로 했다.

## 1. 결론

**덤프를 Supabase에 통째로 복원하지 않는다.** 이관 대상이 들어 있는 kind 21개의 현재 판(19,175행, 37MB)과 작은 표만 로컬에서 뽑는다. 뽑은 자료는 우리 원장 표로 바꿔 기존 적재기로 넣는다. Docker도 로컬 DB 서버도 필요 없다. 로컬에 이미 있는 `pg_restore`(libpq 18.4)가 DB 없이 덤프를 읽기 때문이다.

통째 복원을 하지 않는 이유(측정값):

| 항목 | 통째 복원 | 선별 이관 |
|---|---|---|
| 크기 | 약 4~5GB (압축을 푼 데이터 3.53GB + 인덱스, 추정). 지금 우리 DB는 69MB | 37MB (UTF-8로 바꾸면 더 작아짐) |
| 내용 | 91%가 건축물대장·인허가 원천(register·permit 계열 2.96GB). 우리는 이 자료를 건축HUB로 전국을 따로 수집하고 있다 | 정책·프로그램·연결·사업·일정·공정률·공고·지역 지표만 |
| 노출 | 덤프 표가 `public`에 생긴다. `public`은 PostgREST 노출 대상(`pgrst.db_schemas`)이라 API로 열릴 위험이 있다 | 비공개 `ledger`에만 들어가고 화면 값만 공개한다(기존 Q4 결정) |
| 확장 | PostGIS 3.5.2·tiger·topology 정의(우리 쪽 설치 가능 판은 3.3.7) | 필요 없음. 공개 표에 PostGIS 열이 없고, 경계는 payload 안의 GeoJSON 글자다 |
| 요금제 | 무료(500MB)라면 불가. 요금제는 확인하지 못했다 | 무료 한도 안에 든다 |

덤프 무결성: SHA-256이 일치하고 manifest의 행 수와 모두 맞는다. API 키 흔적도 없다. `credentials_removed: true` 표시가 38,028건 있고, `이름=값` 형태의 키는 0건이다.

## 2. 덤프 구성 (측정)

| 표 | 행 | 압축 해제 크기 | 이관 |
|---|---:|---:|---|
| `home_revision` (원천 판본, payload json) | 1,765,753 (현재 판 1,663,308) | 3,262MB | **kind 21개 현재 판만** |
| `home_project` (사업 정체성 HPR_) | 308 | 작음 | 전부 |
| `home_identity_alias` (HPR_ ↔ 원천 개체) | 420 | 작음 | 전부 |
| `home_project_evidence` | 539 | 작음 | 전부 |
| `home_mapping` (사업 → 정책·프로그램) | 308 | 작음 | 전부 |
| `home_program_mapping` (프로그램 → 정책) | 21 | 작음 | 전부 |
| `home_plan` / `home_plan_event` | 2 / 2 | 작음 | 전부 |
| `home_coverage` (원천 × 지역 × 기간 확보 범위) | 2,260 | 0.9MB | 전부 |
| `home_batch` (수집 실행 기록) | 5,194 | 225MB | 상태 열만(source_id·상태·시각·sha) |
| `home_audit` (조치 이력) | 18,089 | 39MB | 사람 판정(`*_REVIEW`)만, 이력 보존용 |

이관하는 kind 21개: policy, policy_delivery_plan, policy_event, project, project_report, stage_evidence, sequence_review, lh_completion_plan, lh_notice, notice, gh_notice, statistic, area_stat, unsold, district, block_location, project_location, plan_notice, collection_link, municipality, policy_municipality.

선택 kind 12개(lh_supply·lh_stock·lh_movein_plan·legal_dong 등, +62MB)는 화면에 쓸 곳이 생길 때 넣는다.

## 3. 원장 대응

| HOME 자료 | 우리 원장 | 규칙 |
|---|---|---|
| policy 3 | `ledger.policies` | 그대로 |
| policy.target_units, policy_delivery_plan | **새** `ledger.policy_targets` | 정책·단계·범위 지역·기간·호수·근거 |
| home_program_mapping 21 | `ledger.programs` + `links(POLICY_PROGRAM)` | |
| home_mapping 308 | `links(PROGRAM_PROJECT)` | 상태는 REVIEW → `REVIEW_REQUIRED`, CONFIRMED → `CONFIRMED`로 옮긴다. RELEASED는 넣지 않는다. UNASSIGNED 26건은 연결하지 않는다. MON_* 3건은 정책이 아니라 모니터 관점이므로 넣지 않는다 |
| home_project 308 + kind=project | `ledger.projects` + `identifiers` | HPR_·PRO_·LH_ 식별자를 모두 `identifiers`에 남긴다. 사업 id 규칙은 4절 |
| planned_units | `units(PROJECT_PLAN, TOTAL)` | |
| 일정(start/completion plan, schedule_month, lh_completion_plan) | `events(PLANNED, plan_basis=CURRENT)` | 원천 날짜의 정밀도를 그대로 둔다(일·월·연) |
| project_report 1,199 | `events(PROGRESS, ACTUAL, progress_pct)` | 공정률 이력 |
| lh_notice·notice·gh_notice | `notices` + `notice_links` | 우리 공고와 공고번호로 중복을 걸러 없는 것만 넣는다 |
| area_stat 2,602, unsold 1,798 | **새** `ledger.area_facts` | 지역·지표·기간·값·단위 |
| statistic 5,442 | 적재하지 않음 | 우리 `stat_facts`(전국 직접 수집)와 **대조하는 시험**으로만 쓴다 |
| block_location·project_location | `project_locations` | 좌표 근거는 `REVIEW_REQUIRED` |
| home_batch·home_coverage | `sources` + 데이터 원본 화면 스냅샷 | 원천 상태와 확보 격자 |

## 4. 식별 대조 (가장 어려운 부분)

- HOME 사업 308건과 우리 원장 사업 3,845건(그중 LH 후보 273건)은 같은 사업을 가리킬 수 있다.
- **가장 강한 다리**: HOME의 `REGION_DISTRICT_BLOCK` 별칭 112건은 LH 준공예정 개체(`LH_`)를 가리킨다. 우리 LH 후보도 같은 LH 준공예정 파일(15141761)에서 나왔다. 그 다음 다리는 시군구 + 지구·블록 정규화 키(HOME `block_key` 규칙)다.
- **처리 규칙**:
  - 1:1로 확실히 맞으면 우리 사업 id를 쓰고 HOME id는 `identifiers`에 붙인다.
  - 애매하면(1:N, 호수 차이) 합치지 않는다. `ledger.review_required(DUPLICATE_CANDIDATE)`로 보낸다.
  - HOME에만 있는 사업은 시군구가 확인되면 `PRJ-{시군구5}-{일련4}`를 발급한다(기존 `issue-projects.js`). 시군구를 모르면 후보로 둔다.
- **산출물**: 대조 보고서(일치·HOME에만 있음·우리에만 있음·애매함 건수와 목록).

## 5. 단계

| 단계 | 내용 | 확인 기준 | 담당 |
|---|---|---|---|
| M0 | 결정(6절) | — | 사용자 |
| M1 추출 | `tools/home10/extract.py`: `pg_restore -a -t <표> -f - home.dump`로 COPY 스트림을 읽어 현재 판·대상 kind만 고른다. `\uXXXX`를 풀어 `schemas/ledger-2026-10/raw/home10/*.jsonl.gz` + `manifest.json`(sha·건수)으로 저장한다 | 건수가 측정값과 같음(kind 21개 19,175 / 사업 308 / 프로그램 21 / 연결 308). 키 검사 0건. 덤프 sha 검사 | sonnet · medium |
| M2 스키마 | 덧붙이는 마이그레이션: `policy_targets`, `area_facts`, `screen_snapshots.key` 확장, HOME 원천 등록 | `tests/js/supabase-ddl` 확장. 기존 표·뷰는 바뀌지 않음 | opus · high |
| M3 변환·대조 | `tools/home10/convert.js` → 원장 표 JSON + 4절 대조 보고서 | 같은 입력이면 같은 출력. 같은 블록이 두 사업으로 나오지 않음. 9·7 단계 목표·확인값 고정값 시험. statistic ↔ `stat_facts` 대조 | opus · high |
| M4 적재 | **사용자 승인 뒤 메인이 실행**: ① libpq `pg_dump`로 `ledger`·`ledger_admin` 백업 ② `supabase-load.js --month 2026-10`(열린 달) ③ 원본 `raw/home10`을 Storage `ledger-raw/2026-10/home10/`에 올림 ④ `supabase-verify.js` + HOME 대조 ⑤ 화면 캐시 비움 | verify 통과, anon 노출 범위 그대로(board·map·screens만) | 메인 |
| M5 화면 | 시안(`docs/design/home-concept/`)대로 화면 연결 | 시안 기준 고정값·화면 비교 | 별도 계획 |
| M6 갱신 | 덤프는 1회 스냅샷이다. 다음부터는 새 덤프를 받거나 HOME 공개 API로 같은 M1~M4를 다시 돌린다 | 다시 돌려도 결과가 같고, 바뀐 것만 반영 | — |

**되돌리기**
- 새 표는 지우면 된다.
- 기존 표에 들어간 HOME 행은 `source_ref`로 골라 지운다.
- 2026-10은 열린 달이므로 다시 적재할 수 있다. 이관 중에는 **달을 닫지 않는다**(닫힌 달은 불변 트리거로 막힌다).

## 6. 정할 것

1. **방식**: 선별 이관(권장)으로 할지, HOME 원본 선별본(37MB)을 비공개 스키마 `home_raw`에도 넣어 SQL로 볼 수 있게 할지(선택). 통째 복원은 유료 요금제나 별도 프로젝트가 있어야 가능하다.
2. **Supabase 요금제**: 무료(500MB)인지 확인이 필요하다. 선별 이관은 어느 쪽이든 된다.
3. **이관 범위**: kind 21개만 할지, 선택 12개까지 할지.
4. **갱신 경로**: 덤프를 다시 받을지, HOME API로 받을지. HOME 자료를 다시 공개하는 데 대한 합의도 함께 확인한다.
5. **HOME 상태값 처리**: UNASSIGNED·MON_*·RELEASED를 넣지 않는 규칙(3절)에 동의하는지.

## 7. 확인하지 못한 것

- 통째 복원했을 때 실제 크기(인덱스 포함)는 계산으로 추정한 값이다.
- 식별 대조의 실제 일치율은 M3에서 처음 나온다.
- HOME `lh_notice`는 호수 채움이 0%라서, 공고로 확인한 호수는 `notice`(청약홈)·`gh_notice`에 기대야 한다.
- 덤프 밖 원문 파일(PDF·HTML)은 오지 않았다. DB에 경로와 해시만 남아 있다.
