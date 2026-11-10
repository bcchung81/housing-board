# HOME 데이터셋 슬라이스 명세 (home-slices/1)

작성 2026-11-09. HOME(the주택 PoC) 팀이 **2026-10-22 이후 자료**를 보낼 때 쓰는 꼴이다. 덤프(pg_dump 1.9 GB) 대신 우리 변환기·화면이 **실제로 읽는 원천과 칸만** 잘라 보낸다.

- 기계가 읽는 정의: `schemas/home-slices/slices.json`(슬라이스·칸·변경분 규칙·API 목록), `schemas/home-slices/manifest.schema.json`
- 틀(가짜 값): `schemas/home-slices/template/`
- 도구: `tools/ledger/home-slice.py`(`sql`·`seal`·`make`·`apply`), 시험 `tests/test_home_slice.py`

## 1. 목적과 원칙

| 항목 | 내용 |
|---|---|
| 모양 | HOME 원천 모양 그대로(`home_revision` 행·작은 표 행). 우리 원장 표 모양이 아니다 — 변환은 우리 `convert.js`·`home-source.js` 가 한다 |
| 범위 | 2026-10-22 판 이관(06:23 운영 반영본·22:35 판, 같은 변환기)에서 원장·화면에 실제로 쓰인 kind 25·작은 표 4·쌓이는 표 2(= 31). 지역으로 거르지 않는다 |
| 칸 | 변환기 + HOME 원본을 읽는 오프라인 생성기 12개를 실행 추적해 실제로 읽힌 payload 경로만(아래 3절). 22:35 판 기준으로 원본·슬라이스 결과가 바이트까지 같음을 확인했다 |
| 실명 | 담당자 이름(actor)·입력 사유(reason·change_reason)·`last_changes` 같은 칸은 없다. 남기는 글 안에 섞인 이름·사유 조각은 봉인(`seal`) 때 우리 `home-source.js` 와 같은 규칙으로 지운다(4절) |
| 단위 | 변경분: `since` 뒤 기록된 현재 판 + 현재 판 요약(`current`)으로 우리 쪽 판을 다시 짓고 맞는지 확인한다 |

## 2. 패키지 구성

```text
<패키지>/
  manifest.json                  형식·시각·파일 sha256·현재 판 요약(manifest.schema.json)
  slices/<이름>.json             행 배열, 들여쓰기 없는 UTF-8 JSON(키 정렬). 31개 — 변경이 없어도 [] 로 둔다
  api/<이름>.json                우리 생성기가 읽는 HOME API 응답 10종(6절) — until 날짜 기준
  golden/<이름>.json|csv         정답 대조 시험 6종의 입력(6절) — 정답을 새로 뜰 때
  web/js_<이름>.js               정답 계산에 그대로 돌리는 HOME 프런트 JS 4개(6절)
```

| manifest 칸 | 규칙 |
|---|---|
| `format` | `"home-slices/1"` |
| `since` / `until` | PostgreSQL `SET TimeZone='UTC'` 의 `::text` 꼴(예 `2026-10-22 13:35:44.7232+00`). `until` = 내보낸 트랜잭션의 `now()`. `since: null` = 전체 슬라이스 |
| `source_commit` · `alembic_version` | HOME 앱 커밋 · `alembic_version.version_num` |
| `dump_sha256` | 같은 시점 pg_dump 가 있을 때만(없으면 null — 우리 쪽은 manifest.json 의 sha256 을 대신 적는다) |
| `files{경로: {rows, sha256}}` | slices 는 행 수, api·golden·web 은 `rows: null`(받은 시각 `fetched_at` 선택) |
| `current{이름: {count, digest}}` | until 시점 **현재 판 전체**(변경분 아님). digest = sha256(`entity_id:revision_no` 를 entity_id 바이트 순(COLLATE "C") 정렬해 `\n` 로 이은 글). 쌓이는 표(`home_batch`·`home_audit`)는 `id` 로 같은 셈 |
| `removed{이름: [entity_id]}` | since 뒤 현재 판이 없어진 entity |

첫 묶음: `since = 2026-10-22 00:00:00+09`. 우리 쪽 기준 판은 **우리가 가진 최신 판** `20261022T133544Z`(10-22 22:35)다. since 가 기준 판보다 앞이면 겹친 구간을 다시 받을 뿐이고, 겹친 행은 같은 `(entity_id, revision_no)` 라 문제없다(06:23 판 `20261021T212310Z` 를 기준으로 써도 결과가 같다 — 9절). 그다음부터는 지난 패키지의 `until` 보다 조금 앞을 since 로.

## 3. 슬라이스 (22:35 판 = `20261022T133544Z` 기준)

변경분: kind 는 `home_revision` 에서 `superseded_at IS NULL`(until 현재 판) 이고 `recorded_at > since` — 단 **전체** 표시 kind 는 매번 현재 판 전체(4절). 작은 표는 매번 표 전체(제자리 수정이 있어서). 쌓이는 표는 since 뒤 행.
kind 행 = `{entity_id, kind, source_id, revision_no, recorded_at, payload_hash, batch_id, payload(남길 칸만)}`. 칸 경로: `x[]` = 배열 원소, `*` = 아무 키(키가 단계·칸 이름인 사전), 경로 끝 = 값 통째. Supabase 표는 모두 `ledger.` 스키마, source_ref 는 `home-dump-<판>` + 꼬리.

| # | 슬라이스 | 원천 | 변경분 | 남길 칸 | Supabase 표 (source_ref 꼬리) | 22:35 행 | 06:23→22:35 행 |
|---|---|---|---|---|---|---:|---:|
| 1 | `policy` | kind | since | announced_at, id, lifecycle_status, metric, name, target_scope | links, policies, policy_targets, programs, sources (`-policy`) | 3 | 0 |
| 2 | `policy_delivery_plan` | kind | **전체** | annual[].{seoul_units, units, year}, base_date, evidence_url, geography, joint_region_units, metric, occupancy_outlook.{adoption, adoption_basis, annual[].{role, seoul_units, units, year}, evidence_url, metric, pdf_page, scope}, pdf_page, period_end, period_start, policy_id, programs[].{annual[].{units, year}, id, name, target_units}, region_allocations, target_units | links, policy_targets, programs (`-policy`) | 1 | 1 |
| 3 | `project` | kind | since | address, base_date, block, completion_plan_date, developer, district, evidence_url, move_in_evidence_url, municipality, name, planned_units, policy_candidate_only, progress_date, progress_date_basis, progress_pct, region, rows[].{move_in_month, move_in_raw, supply_month, supply_raw, units}, schedule_basis, schedule_month, source_id, source_move_in_label, source_object_id, source_reference_id, source_supply_label, stage, start_actual_date, start_plan_date, start_plan_month, start_plan_year, tenure, warnings | projects, events, units, identifiers, links, notice_links, project_locations, sources (본) | 452 | 8 |
| 4 | `project_report` | kind | since | base_date, construction_description, current_project_id, date_precision, evidence_url, progress_pct, report_date | events, sources (`-report`) | 1,432 | 2 |
| 5 | `stage_evidence` | kind | **전체** | base_date, project_id, selected.{basis, event_date, event_type, evidence_url, method, observed_on, source_id, source_name, units}, stage, status | events, projects, sources (`-stage`) | 904 | 904 |
| 6 | `lh_completion_plan` | kind | since | address, base_date, block, completion_plan_date, district, region, source_date, tenure, units | events, identifiers, project_locations, projects, sources (`-lh-plan`) | 204 | 0 |
| 7 | `lh_notice` | kind | since | base_date, dates.{공고 마감일}, name, notice_no, source_date | notices, notice_links, sources (`-lh-notice`) | 4,020 | 4,020 |
| 8 | `notice` | kind | since | address, base_date, dates.{청약 시작일, 청약 종료일}, developer, evidence_url, house_manage_no, move_in_plan_month, name, region, source_date, source_object_id, units | notices, notice_links, events, projects, sources (`-notice`) | 1,342 | 1,342 |
| 9 | `gh_notice` | kind | since | base_date, name, source_date, source_object_id | notices, notice_links, sources (`-gh-notice`) | 695 | 0 |
| 10 | `statistic` | kind | since | base_date, region, statistic_frequency, statistic_metric, statistic_period, units | — (policy-progress·region-annual) | 5,442 | 640 |
| 11 | `area_stat` | kind | since | age_bands, businesses, census_housing_units, definition, employment_rate, forecast_households, half, household_total, households, housing_units, industry_workers, labor_force, metric_group, municipality, official_ratio, period, population, population_total, region, region_code, resident_employed, sizes, unit_basis, workplace_workers, year | area_facts, sources (`-area-<지표 묶음>`) | 2,672 | 0 |
| 12 | `unsold` | kind | since | metric, municipality, period, region, region_code, unit_basis, units | area_facts, sources (`-unsold`) | 1,798 | 418 |
| 13 | `district` | kind | since | base_date, geometry.{coordinates, geometries[].{coordinates, type}, type}, latitude, link_status, longitude, name, project_ids | — (지도·region-map) | 35 | 0 |
| 14 | `block_location` | kind | since | block, coordinate_basis, district_name, latitude, longitude, region, status, zonecode | — (시군구 판정 보조·지도) | 288 | 0 |
| 15 | `project_location` | kind | since | address_original, address_query, base_date, coordinate_basis, latitude, longitude, municipality, project_id, status | project_locations, projects (본) | 310 | 0 |
| 16 | `collection_link` | kind | since | links[].{basis, date, kind, review_status, source_entity_id}, project_id, stage | events, notice_links, projects, sources (`-notice`) | 904 | 788 |
| 17 | `municipality` | kind | since | admin_codes, base_date, district_names, geometry.{coordinates, geometries[].{coordinates, type}, type}, latitude, longitude, name, region | — (시군구 판정 보조·지도) | 56 | 0 |
| 18 | `policy_municipality` | kind | since | admin_codes, base_date, geometry.{coordinates, type}, latitude, longitude, name, region | — (지도·정책 시군구) | 11 | 0 |
| 19 | `evidence_bridge` | kind | **전체** | base_date, evidence_source_id, evidence_url, facts[].{basis, date, date_basis, date_conversion, date_label, date_precision, kind, method, milestone, notice_round, observed_on, reference_only, scope_partial, source_event_date, stage, units}, inferred, project_id, source_entity_id, source_name, source_notice_round, status | events, notice_links, sources (`-bridge`·`-lh-doc`·`-gh-doc`·`-sh-doc`·`-local-doc`) | 822 | 822 |
| 20 | `lh_movein_plan` | kind | since | base_date, block, district_name, name | — (정책 진행) | 252 | 252 |
| 21 | `document_evidence` | kind | since | base_date | — (정책 진행 원천 대조) | 2,081 | 749 |
| 22 | `delivery_setting` | kind | since | events, policy_id, targets | — (들어오면 policy-progress 가 멈춘다) | 0 | 0 |
| 23 | `execution_schedule` | kind | since | base_date, date_precision, due_date, evidence_url, project_id, source_precision, stage, status, units | — (정책 진행) | 1,847 | 11 |
| 24 | `project_profile` | kind | **전체** | base_date, overrides.\*.{inferred, value}, progress.\*.{changed_at, event_date, evidence_url, inferred, input_rule, origin, units}, project_id | — (정책 진행·사업 보기) | 323 | 323 |
| 25 | `mapping_decision` | kind | since | changed_at, status, subject_id, subject_kind | (home_mapping 해제 판정) | 11 | 11 |
| 26 | `home_project` | 작은 표 | 표 전체 | id, name | 3번과 같음(본) | 4,186 | 4,186 |
| 27 | `home_identity_alias` | 작은 표 | 표 전체 | id, match_rule, project_id, source_entity_id, unit_comparison | 3번과 같음(본) | 4,358 | 4,358 |
| 28 | `home_mapping` | 작은 표 | 표 전체 | basis, evidence_url, id, policy_id, program_id, project_id, status | links, projects, review_required, sources (`-policy`) | 452 | 452 |
| 29 | `home_program_mapping` | 작은 표 | 표 전체 | basis, created_at, evidence_url, id, name, policy_id, status | links, programs, projects, sources (`-policy`) | 45 | 45 |
| 30 | `home_batch` | 쌓이는 표 | started_at·finished_at > since 또는 finished_at 없음 | finished_at, id, source_id, started_at, status | — (데이터 원본 수집 상태) | 8,609 | 436 |
| 31 | `home_audit` | 쌓이는 표 | `action LIKE '%\_REVIEW'` 이고 recorded_at > since | id, recorded_at | — (기준일 뒤 감사 기록이 있으면 멈춤) | 1,509 | 193 |

- Supabase 표 = 그 슬라이스를 비우고 변환했을 때 바뀌는 원장 표(22:35 판 실측). "—" 는 원장 표에는 안 들어가고 `data/board` 화면 자료만 만든다(읽는 생성기는 slices.json `readers`).
- 추적이 못 본 칸(이번 자료로는 그 갈래를 안 지남)은 코드를 읽고 더했다: `mapping_decision.changed_at`, `delivery_setting.{policy_id, targets, events}`.

**뺀 것**(변환기·생성기가 읽지 않음, 코드에 이름도 없음): kind `policy_event`(5행)·`sequence_review`(11)·`plan_notice`(2), 표 `home_project_evidence`(4,687)·`home_plan`(2)·`home_plan_event`(2)·`home_plan_project_link`(0)·`home_coverage`(9,566). 덤프에만 있는 대형 kind(register·permit 등 41종)도 지난 이관부터 쓰지 않는다.

## 4. 담당자 이름·사유 지우기

`home-source.js scrubKinds` 는 판 전체의 `actor` 값(이름)·`reason`/`change_reason` 값(사유)을 모아, 모든 글에서 ` · ` 조각이 그 값과 같으면 빼고 남은 이름은 지운다. 슬라이스에는 이 칸들이 없으므로 봉인(`seal`)이 같은 규칙을 미리 적용한다 — 결과가 같다(5절 (a)).

- 이름·사유 목록은 until 시점 판 전체(`home-dump.py KINDS` 28종 현재 판 payload + `home_audit` `_REVIEW` 의 before/after + `home_batch.stats`)에서 모은다. 이 목록은 HOME 밖으로 나가지 않는다.
- 지우기 결과는 **판 전체의 목록**에 달려 있다(어떤 사유가 다른 행에서 사라지면 같은 글이 다르게 지워진다 — 06:23→22:35 에서 실제로 evidence_bridge 5행). 그래서 남기는 글에 이름·사유가 섞이는 kind(`policy_delivery_plan`·`stage_evidence`·`evidence_bridge`·`project_profile`)는 **매번 현재 판 전체**를 보낸다. 다른 kind 의 남기는 글에 이름·사유 조각이 생기면 `seal`·`make` 가 멈춘다(그 kind 를 `resend: all` 로 바꾼다).
- 22:35 판 패키지 확인: 이름 25개 중 패키지 글에 나온 것 0, `actor`·`reason` 키 0. 사유 69개 중 6개는 더 긴 글 안의 조각으로 남는다(우리 규칙도 조각째 같을 때만 빼므로 원장·화면과 같다, 이름 없음).

## 5. HOME 쪽 내보내기(SQL → seal)

`python3 tools/ledger/home-slice.py sql > export.sql` 이 slices.json 에서 아래 psql 스크립트를 만든다(한 `READ ONLY REPEATABLE READ` 트랜잭션, `SET LOCAL TimeZone='UTC'`, 시각 칸은 모두 `::text`).

```bash
psql "$HOME_DB_URL" -v since='2026-10-22 00:00:00+09' -v commit=<HOME 소스 커밋> -f export.sql   # → export/ (실명 포함, HOME 안에만)
python3 tools/ledger/home-slice.py seal --export export --api fetched --out home-slices-<until>  # 칸 자르기·이름 지우기·키 검사·sha256
```

| export/ 파일 | 쿼리 요지 |
|---|---|
| `meta.json` | `since::timestamptz::text`, `until = now()::text`, `source_commit`, `alembic_version` |
| `rows/home_revision.jsonl` | 31개 중 kind 25종, `superseded_at IS NULL AND (recorded_at > :since OR kind = ANY(전체 4종))`, `ORDER BY kind, entity_id COLLATE "C"` |
| `current.jsonl` | kind 별 `count(*)`, `encode(sha256(convert_to(string_agg(entity_id||':'||revision_no, E'\n' ORDER BY entity_id COLLATE "C"),'UTF8')),'hex')` |
| `removed.jsonl` | `superseded_at > :since` 인 entity 중 현재 판이 없는 것 |
| `terms.jsonl` | 위 4절 범위에서 `jsonb_path_query(d, 'lax $.**.actor'·reason·change_reason)` 의 문자열 값(DISTINCT) |
| `rows/<표>.jsonl` | 작은 표 4개 전체, `home_batch`·`home_audit` 는 변경분 — 3절 열만 `row_to_json` |

`fetched/` 에는 6절 목록을 `api/`·`golden/`·`web/` 아래 저장 이름으로 둔다(`fetched/fetched.json` 에 `{"api/<이름>": 받은 시각}` 을 두면 manifest 에 적힌다). 없는 묶음(golden·web)은 빠진다.

## 6. 같이 받을 HOME API·정답 입력·프런트 JS

**until 스냅샷과 같은 시점에 HOME 팀이 받아 넣는다.** 공개 API 를 우리가 나중에 받으면 그사이 수집·담당자 입력으로 값이 달라진다(10-22 실측: 같은 날 다른 시각의 `policy-delivery/view` 가 sha256 이 다름). 기준 주소 `https://www.minslab.kr/poc/home/api/`, `{until}` = until 의 한국 날짜, `{POL}` = `POL_2025_0907`, `{HZ}` = `horizon=10&measure=SUPPLY&schedule_status=all`.

`api/` — 우리 생성기 입력(`apply --api-out` 이 `raw/home-api/<until>/` 스냅샷으로 줄이고·지워 옮긴다)

| 요청 경로 | 쿼리 | 저장 이름 | 읽는 곳 |
|---|---|---|---|
| `map/dashboard` | `as_of_date={until}&compact=true` | `projects-map-dashboard.json` | home-projects·map-overview·build_data |
| `map/dashboard` | `as_of_date={until}&policy_id={POL}&{HZ}&compact=true` | `projects-map-dashboard-97.json` | 같음 |
| `policy-delivery/view` | `as_of_date={until}&group=policy&scope=policy` | `projects-policy-delivery-97.json`, `policy-plan-97.json`(같은 응답) | home-projects, home-board |
| `sources` · `source-summary` · `sources/year-coverage` | `compact=true` · — · — | `sources-list.json` · `sources-summary.json` · `sources-year-coverage.json` | home-sources |
| `mappings` | `as_of_date={until}&compact=true` | `sources-mappings.json` | home-sources |
| `validation` · `requirements-status` | `as_of_date={until}` | `sources-validation.json` · `sources-requirements.json` | home-sources · requirements |

`golden/` — 정답 대조 시험 6종(`tests/js/{policy,projects,region,citizen,sources,map}-golden.test.cjs`)의 정답을 계산하는 입력. `tools/ledger/home-parity/run.js --golden <golden/> --web <web/>`(home-apply.js 가 부른다)가 읽는 파일 전부이고, 그 밖의 것은 넣지 않는다(2026-11-09 대조: 읽은 파일 = 목록, 빠짐·남음 0).

| 저장 이름 | 요청 경로 · 쿼리 | 읽는 곳 |
|---|---|---|
| `S1-view-policy.json` | `policy-delivery/view` · `as_of_date={until}&group=policy&scope=policy` | s1-policy · s2-projects(기준일) · map-golden · run.js |
| `S1-view-region-서울특별시.json`, `-인천광역시`, `-경기도` | `policy-delivery/view` · `as_of_date={until}&group=policy&scope=region:<시도>`(시도 URL 인코딩) — 22:35 앱부터 응답이 요청 범위만 싣는다 | s1-policy · map-golden |
| `S1-view-program-<PRG>.json` | `policy-delivery/view` · `as_of_date={until}&group=program:<PRG>&scope=program:<PRG>` — S1-mappings 의 programs 중 policy_id={POL}·REJECTED/RELEASED 아닌 것마다 | s1-policy |
| `S1-policies.json` · `S1-policy-monitor.json` · `S1-mappings.json` | `policies` · `policy-monitor?as_of_date={until}` · `mappings?as_of_date={until}&compact=true` | s1-policy |
| `deliv-{until}.json`(선택) | `S1-view-policy` 와 같은 요청 — 없으면 S1-view-policy.json 을 쓴다 | map-golden |
| `S2-raw-map-dashboard.json` · `S2-raw-map-dashboard-js.json` | `map/dashboard?as_of_date={until}&compact=true` · `…&policy_id={POL}&{HZ}&compact=true` | s2-projects · map-golden(· run.js 받은 시각 기본값) |
| `S2-raw-mappings.json` · `S2-raw-project-workspace.json` · `S2-raw-tree.json` · `S2-raw-tree-js.json` · `S2-raw-annual-supply.json` | `mappings?as_of_date&compact=true` · `project-workspace` · `tree?as_of_date` · `tree?as_of_date&policy_id={POL}` · `annual-supply` | s2-projects |
| `S2-raw-area-context-{seoul,incheon,gyeonggi}.json` · `S2-raw-area-outlook-{…}.json` | `area-context?region=<시도>&year=2026` · `area-outlook?region=<시도>` | s2-projects |
| `S3-<이름>.json` 10개: sources · source-summary · validation · samples · project-collection · mappings · connections · api-requests · data-integrity · requirements-status | `sources?compact=true` · `source-summary` · `validation?as_of_date` · `samples?as_of_date&page=1&page_size=100` · `project-collection` · `mappings?as_of_date&compact=true` · `connections` · `api-requests` · `data-integrity` · `requirements-status?as_of_date` | s3-sources(`S3_FILES` → reduceSnapshot. 이미 줄인 `S3-snapshot.json` 이 있으면 그것을 먼저 쓴다) |
| `S3-year-coverage.json` | `sources/year-coverage` — `api/sources-year-coverage.json` 과 같은 응답(golden/ 에 없으면 home-apply.js 가 api/ 것을 넣는다) | s3-sources(자료연도별 확보 격자 정답, 있으면 validation data_gaps 대신) |

`web/` — `https://www.minslab.kr/poc/home/assets/<이름>.js` → `js_<이름>.js`: `policy-stage-flow`·`policy-decision`·`policy-region-map`(s1-policy 가 그대로 돌린다), `requirements-manual`(s3-sources — 요구사항정의 자체 평가 점수).

정확한 목록(쿼리·저장 이름·되풀이 규칙)은 slices.json `api`·`golden`·`web` 이 정본이다.

## 7. 우리 쪽 반영 절차

```bash
H=schemas/ledger-2026-10/raw/home
python3 tools/ledger/home-slice.py apply --base $H/20261022T133544Z --in <패키지> \
  --out $H/<until 판 이름> --api-out schemas/ledger-2026-10/raw/home-api/<until 한국 날짜>
# 다음부터는 --base 에 지난 apply 결과 판. 판 이름은 apply 가 알려 주는 YYYYMMDDTHHMMSSZ(until) 를 쓴다
```

그다음은 `HOME-재덤프-이관-핸드오프.md` 3절 ③(변환 node 한 줄, 먼저 `OUT=` 시험) → ④ issue-projects → ③ 다시 → ⑤ 이후와 9절 생성기 순서(board → home-projects → home-map → policy-progress → home-lh-plan → home-board → map-overview → projects-index → region-supply → requirements → area-facts → home-sources). 원본 판(`<이름>.jsonl.gz`)은 지금처럼 git 에 넣지 않고 Storage 로. 정답 대조 입력은 패키지 `golden/`·`web/` 을 `.cache/home-parity/golden/`·`poc/` 로 옮겨 추출 스크립트를 돌린다.

`apply` 는 기준 판 payload 도 슬라이스 칸으로 잘라(내부 덤프 판이면 그 판의 이름·사유로 지운 뒤) 한 모양으로 맞추고, 높은 `revision_no` 우선·`removed` 반영·작은 표 통째 교체·쌓이는 표 id 덮어쓰기를 한다.

## 8. 멈춤 조건(종료 코드 2, 아무것도 쓰지 않음)

| 단계 | 조건 |
|---|---|
| seal·make | 키 검사(`serviceKey=` 꼴 등, home-dump.py `key_scan`) 걸림 · 정의에 없는 원천 · 변경분 kind 의 남기는 글에 이름·사유 조각 · since > 기준 판 스냅샷 |
| apply | 형식이 `home-slices/1` 아님 · 파일 sha256·행 수 불일치 · 정의에 없는 슬라이스·kind · 슬라이스 파일 빠짐 · 정의에 없는 열·payload 칸 · since > 기준 판 스냅샷(빈 구간) · until < 기준 판 · 변경분인데 `--base` 없음 · 반영 결과 kind 별 count·digest 가 `current` 와 다름 · 결과 키 검사 걸림 |
| 반영 뒤 | policy-progress 의 기존 멈춤(담당자 목표 `delivery_setting` 이 생김, 기준일 뒤 감사 기록) 그대로 |

## 9. 확인 기록(2026-11-09)

| 확인 | 결과 |
|---|---|
| 칸 충분성: 22:35 판 원본 vs 슬라이스로 자른 판으로 convert → issue-projects → convert → 생성기 12개 | 원장 표 18 + data/board 152 + 레지스트리·id 매핑 7 = 177 파일 바이트 동일 |
| 변경분 왕복: 06:23 판 + 06:23→22:35 패키지(since 10-22 00:00+09) | 22:35 를 자른 판과 jsonl.gz 31 + manifest 바이트 동일(10-20 → 06:23 → 22:35 두 번 이어도 같음) |
| 결정성 | make·apply 두 번 → 바이트 동일 |
| SQL 내보내기 꼴 → seal | 내부 판에서 만든 같은 내용과 패키지 바이트 동일(실제 DB 실행은 못 함) |
| API 옮기기 | 10종 중 9종이 저장된 10-22 스냅샷과 sha256 동일(1종은 받은 시각이 달라 다름) |
| 크기 | 06:23→22:35 변경분 7.7 MB(tar.gz 1.6 MB), 전체 슬라이스 19 MB(4.1 MB) — 덤프 1.9 GB |

한계: 칸은 실행 추적이라 이번 자료가 지나지 않은 코드 갈래가 읽는 칸은 빠질 수 있다(코드 검토로 2곳 보탬). 우리 코드가 새 칸을 읽게 되면 slices.json 에 더하고 HOME 팀에 알린다.
