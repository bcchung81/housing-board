# Supabase 사업 원장 설계 (초안 · 2026-10-11)

사업 원장 16표(`schemas/ledger-2026-10/tables`, 39,162행 · 6,388,162바이트)를 Supabase(서울 ap-northeast-2, Postgres 17.11, ref `hpxjledpmrbhgenhdvyp`)로 옮기기 전의 **설계**다. 표는 2026-10-11 에 만들었다(부록 A-1~A-6 적용, 부록 C 적용 기록). 열 정의는 `docs/product/데이터셋-스키마.md` 와 `schemas/ledger/*.schema.json` 이 정본이고, 이 문서에는 DB 로 옮기면서 달라지는 것만 적는다. 결정이 필요한 것은 9절에 모았다.

## 0. 끝에서 거꾸로: 화면 → 키 사슬 → 보관/실시간

키 사슬: 시도 `sido_code`(2) → 시군구 `sgg_code`(5) → 법정동 `bjd_code`(10) → 필지 `pnu`(19, 앞 10자리 = 법정동) → 사업 id `PRJ-{sgg5}-{seq4}`. DB 에서는 `areas`(00·2·5·10자리 한 표) → `projects.sgg_code` → `project_locations.bjd_code`·`pnu` 로 외래 키가 이어지고, 시도는 `left(sgg_code, 2)` 로 얻는다(현재 사업 350건 모두 id 안의 시군구 = `sgg_code`. 행정구역 개편 때 달라질 수 있어 제약으로 묶지 않는다).

| 화면·카드 | 답할 질문 | 키 사슬에서 읽는 곳 | DB 보관 | 실시간(원장 밖) | 근거 수치(2026-10) |
|---|---|---|---|---|---|
| 종합 · 월별 공급 파동 | 2025.01~2028.10 단계별 월말 호수 | 사업 id → events·units | `board_snapshots.board`(stageUnits) ← projects·events·units | – | 사업 350 · 호수 193,032 · 보드 JSON 10,335 B/월 |
| 종합 · 선택 시점 판정 | 정상·주의·지연 | 사업 id → events(CURRENT·ACTUAL) | 같은 보드 JSON(judgment·overdue) | – | 판정 54 = 45·2·7, 제외(LH 후보) 273건·148,389호 |
| 종합 · 시도 16 | 어디를 먼저 | 시도 = left(sgg,2) | 보드 regions | 경계 단순화본은 파일 | 16개 시도 모두 사업 ≥ 2 |
| 종합 · 기관별 | 기관별 진척 | projects.agency_id | 보드 agencies | – | 5기관 + 기관 미상 |
| 종합 · 향후 12개월 | 앞으로의 준공 | events COMPLETION·PLANNED·CURRENT | 보드 upcoming | – | 78건 · 32,312호 |
| 종합 · 지연·주의 추이 | 지연이 늘었나 | events × observed_month | `board_snapshots` 여러 달 + `events` 달별 행 | – | 관측 달 1개(2026-10), BASELINE·REVISED 0행 → 2026-11 부터 |
| 종합 · 총리 지시 | 지시별 진척 | policies → programs → links → projects, stat_facts | policies·programs·links(0행), stat_facts | – | 연결할 행 0 |
| 종합 · 월별 실적 · 공급 실적 `/area` | 시도·주체별 실적 | sido_code × ym × actor | stat_facts | – | 16,320행, 공표마다 시도 17 × 지표 4 × (총계+주체)= 272행/월 |
| 사업 `/projects`·상세 | 단계·규모·위치·근거 | sgg·stage 거르기 → 사업 id | projects·units·events·identifiers·project_locations·sources | 근거 원문 링크 | 사업 350, 위치 332행 |
| 지도 `/map` | 위치·단지 | 시군구 → 법정동 → PNU | areas·project_locations·complexes·identifiers | 건물 윤곽·필지·건물대장·버스·정류소·지형·신설학교·공고 | 윤곽 캐시 80,550건, 버스 ttl 60초(TAGO 1만/일·서울 1천/일), 건축HUB 1만/일 |
| 데이터 원본 `/sources` | 출처·수집일·원천 기준일(D1) | source_ref | sources + `ingest_runs`·`ingest_run_sources` | – | 원천 23 |
| 우리 동네 `/my-area` | 내 시도의 사업·준공·공고 | 시도 → 사업 | projects·events·units(시도 거르기) | 공고 목록(1시간 캐시) | 공고 캐시 535건, 마이홈 1천건/일 |
| 보고자료 `/reports` | 월간 브리핑 | 달 ↔ 달 | board_snapshots 달끼리 비교 + stat_facts | – | 화면 미구현 |

**나누는 규칙**(데이터셋-스키마 3절 그대로): 전국·시도 합계를 보이면 보관, 과거 값이 필요하면 월 스냅샷으로 보관, 한 위치만·이력 불필요면 실시간 + 캐시. 실시간 자료는 이 DB 에 넣지 않는다(이용허락: 기획서 결정 4 "원천 응답 재배포 안 함").

| 보관 원천 | 갱신 | 호출·크기 |
|---|---|---|
| 건축HUB 기본개요 스냅샷 → events | 매달 | 지금 10호출·844건·209행 / 전국 약 2.1만 호출(키 1개 2~3일) |
| LH 준공예정 → projects·events·units | 연 1회(차기 2027-02-04) | 351행·29 KiB |
| 통계누리 → stat_facts | 매달 공표 | 4표 65,878행·약 2 MB |
| 법정동코드 → areas | 연 1회·개편 때 | 53,387행·2,471,662 B(존재 20,560) |
| 기관 입력 → projects·events·units·policies·programs·links | 수시 | 호출 없음 |

## 1. 이름공간·노출·권한

| 스키마 | 담는 것 | Data API 노출 | 누가 |
|---|---|---|---|
| `ledger` | 16표 + `months`·`ingest_runs`·`ingest_run_sources`·`board_snapshots` | **안 함** | 소유자 postgres(마이그레이션), 읽기 anon·authenticated(RLS), 쓰기 service_role(RPC 안에서만) |
| `api` | 읽기 뷰(`security_invoker = true`), 열 = v1.4 열 + `is_demo`·`sido_code`·`is_candidate` | **노출**(publishable 키) | anon·authenticated `select` 만 |
| `ledger_admin` | 적재 RPC(`begin_run`·`publish_run`·`export_table`)와 스테이징 표 `stage_rows` | **노출**하되 service_role 에만 USAGE | 파이프라인(secret 키) |
| `public` | 쓰지 않는다 | (기본값 그대로) | – |
| (나중) `intake` | 기관 입력 접수 표 | 노출 | authenticated(기관 사용자) |

- **왜 public 이 아닌가(실측)**: 이 프로젝트의 `public` 기본 권한(`pg_default_acl`)은 새 표에 anon·authenticated 에 `arwdDxtm`(쓰기 포함 전부)를 준다. RLS 자동 켜기 이벤트 트리거(`ensure_rls` → `public.rls_auto_enable`)는 `public` 에만 작동한다. 그래서 `ledger` 에 두고 **RLS 를 마이그레이션에서 직접 켜고 GRANT 를 명시**한다.
- **키**: publishable 키 = anon 역할(RLS 적용), secret 키 = service_role(BYPASSRLS, 그래도 GRANT·트리거는 적용). 웹앱(Vercel)에는 `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 두 개만 둔다. `SUPABASE_SECRET_KEY`·`SUPABASE_DB_URL` 은 적재하는 곳(로컬 `.env.local`, 나중에 GitHub Actions 비밀값)에만 둔다.
- **RLS**: `ledger` 모든 표 `enable row level security`. anon·authenticated 는 공개 표에 `for select using (true)` 정책만(쓰기 정책 없음 → 쓰기 불가). 공개하지 않는 표: `review_required`(내부 작업 목록), `stage_rows`. `ingest_runs` 는 `status in ('published','superseded')` 행만 읽기.
- 발행이 한 트랜잭션이라 "반쯤 올라간 판"은 읽는 쪽에 보이지 않는다. 그래서 공개 조건을 행마다 두지 않고, `api` 뷰가 **현재 판**(최근 발행 실행이 쓴 행)만 고른다. events·board_snapshots 는 모든 달을 보인다.
- **역할별 시간 제한(실측)**: anon 3초, authenticated 8초, authenticator 8초, 그리고 authenticator 에 `safeupdate` 가 걸려 있다(WHERE 없는 UPDATE·DELETE 거부). 발행 RPC 는 8초 안에 끝나야 하고 지우기 문에는 늘 WHERE 를 둔다.
- **나중의 기관 입력 역할**: Supabase Auth 사용자 + `app_metadata.agency_id`(사용자가 고칠 수 없는 쪽). `intake.agency_rows(agency_id, tbl, row jsonb, submitted_by default auth.uid(), status)` 에 `with check (agency_id = auth.jwt()->'app_metadata'->>'agency_id')` 로 넣기만 하고, 원장 반영은 파이프라인이 `import-agency.js` 규칙(검증·거부 사유)으로 한다. 기관은 원장 표에 직접 쓰지 않는다. 지금은 만들지 않는다.

## 2. 표별 대응

**공통 규칙**

| 항목 | 규칙 |
|---|---|
| 코드 | 모두 `text`(앞자리 0). `common.schema.json` 의 `$defs` 는 **도메인**으로 1:1(`ledger.project_id`·`sgg_code`·`bjd_code`·`pnu`·`ym`·`stage_code`·`review_status`·`source_ref` …) |
| 값 목록 | **text + CHECK**(표에만 쓰는 목록은 열 CHECK, 여러 표가 쓰는 목록은 도메인 CHECK). enum 타입은 쓰지 않는다: v1.4 값이 팀 합의로 늘거나 바뀌고(link_type·review_type 은 제안 값), enum 은 값을 지울 수 없으며, CHECK 는 마이그레이션 한 줄로 바꾼다. 코드 표(참조 표)는 이름이 필요한 areas·agencies·sources 만 |
| 날짜 | 일 → `date`. 달 `YYYY-MM` 은 `ledger.ym`(text, 문자열 정렬 = 시간 순, JSON 그대로 왕복). 연 → text `^\d{4}$`. `sources.collected_at` 은 일시·날짜가 섞여(일시 15 · 날짜 1 · 없음 7) text |
| 수 | 호수·건수 `integer ≥ 0`, 공정율 `numeric`(범위 0~100, 소수 3자리 값 있음 — 1.741) |
| 배열 | `sources.used_by text[]` |
| 적재 열 | 모든 원장 표에 `load_run_id bigint`(이 행을 마지막으로 쓴 실행), `load_seq integer`(그 달 파일 안의 순서). CSV·JSON 내보낼 때 뺀다. `load_seq` 가 필요한 이유: `board.js` 가 같은 원천의 CURRENT 예정이 둘이면 **먼저 나온 행**을 고르므로(예 PRJ-28245-0005 준공 예정 2행) 순서가 결과를 바꾼다 |
| 지우기 | **지우지 않는 표**(upsert 만): areas·sources·agencies·projects·complexes·stat_facts·policies·programs·notices — 지난 달 events 가 참조하거나 원천 개정으로 남아야 함. **판마다 통째로 바꾸는 표**: identifiers·project_locations·units·review_required·links·notice_links(자식 표, 참조받지 않음) |

**표별**

| 표 | 행 | 기본 키 | 고유·CHECK(스키마 외 추가는 ★) | 외래 키 | 인덱스(화면) |
|---|---:|---|---|---|---|
| areas | 20,562 | area_code | 길이 = level(NATION·SIDO 2, SGG 5, BJD 10)★, parent null ⇔ NATION·SIDO★, area_code 가 parent 로 시작★ (모두 현재 행 만족) | parent_code → areas | parent_code(시도 → 시군구 → 법정동 목록) |
| agencies | 5 | agency_id | 도메인 agency_id, stat_actor 도메인 | – | – |
| sources | 23 | source_ref | is_demo not null | – | – |
| projects | 350 | local_project_id | project_unit·public_scope CHECK, superseded_by ≠ 자기★ | sgg_code → areas, agency_id → agencies, superseded_by → projects(지연) | sgg_code, left(sgg_code,2), stage_code, agency_id |
| identifiers | 358 | (id_type, id_value) | id_type·id_issuer CHECK | → projects | local_project_id |
| project_locations | 332 | location_id(대리) | **unique nulls not distinct (사업, 법정동, 필지)**, pnu 앞 10 = bjd_code | → projects, bjd_code → areas | bjd_code, pnu(부분) — 지도 `?bjd`·`?pnu` |
| complexes | 22 | complex_id | status·sponsor_class CHECK | → projects | local_project_id |
| events | 709 | event_id(대리) | **unique (observed_month, load_seq)**, 날짜 셋 중 정확히 하나★, ACTUAL ⇔ plan_basis null★ | → projects, complexes, months(observed_month) | (사업, observed_month), (observed_month, event_type, date_type) |
| units | 426 | unit_id(대리) | quantity_type·unit_scope CHECK. 자연 키는 두지 않는다(업무 규칙이 아님) | → projects, complexes | local_project_id |
| stat_facts | 16,320 | (metric, sido_code, ym, actor) | metric ↔ stage_code(03·04·05·06) | sido_code → areas(00 은 NATION 행) | (sido_code, ym) |
| review_required | 55 | review_id(대리) | review_type CHECK | → projects(있으면) | local_project_id |
| policies · programs | 0 · 0 | local_policy_id · local_program_id | – | – | – |
| links | 0 | (link_type, from, to) | link_type CHECK | link_type 에 따라 끝이 다른 표 → **생성 열 4개**(`from_policy_id`·`from_program_id`·`to_program_id`·`to_project_id`)에 외래 키. v1.4 열은 그대로 | – |
| notices | 0 | (notice_system, notice_id) | – | sgg_code → areas | sgg_code |
| notice_links | 0 | (notice_system, notice_id, local_project_id) | – | → notices, projects | – |

- ★ 는 지금 709·332·20,562행이 모두 만족하는 규칙이지만 JSON Schema 에는 없다. 같은 규칙을 `validate.js` 에도 넣어야 "파일 검증 통과 = DB 적재 성공"이 유지된다(적재 시험 3단계에서 확인).
- `source_ref` 외래 키는 모든 표에 두되 인덱스는 두지 않는다(sources 는 지우지 않으므로 필요 없다. Supabase 점검기의 "인덱스 없는 외래 키" 안내는 의도된 것으로 둔다).

## 3. 이력·스냅샷 모델

**모델(추천, 결정 2)**: 현재 판 표 + **events 달별 누적** + **달별 보드 JSON** + 달별 표 묶음은 Storage 에 보관.

| 대상 | 이력 방식 | 근거 |
|---|---|---|
| events | 관측 달마다 행(`observed_month`) 누적. 지금 파일과 같다 | 당초 대비 지연·머문 기간은 관측 이력으로만 계산(데이터셋-스키마 3절) |
| board_snapshots | 달마다 JSON 하나(`month` 기본 키) | 지연·주의 추이·보고자료가 달끼리 비교한다. 10,335 B/월 |
| 그 밖의 원장 표 | 현재 판만. 지난 판은 `ledger-raw/{YYYY-MM}/tables.tar.gz` | 화면이 지난 판의 사업·물량을 다시 묻지 않는다. 지금 16표 묶음 gzip 298,835 B |
| stat_facts | 원천의 달(`ym`)이 시간 축. 잠정치 개정은 덮어쓴다 | 원천 개정값이 정답이다. 개정 전 값은 Storage 원본에 남는다 |

**`months` 와 불변 강제**

| 장치 | 내용 |
|---|---|
| `ledger.months(month, status open/closed, reference_date)` | 열린 달은 하나(부분 고유 인덱스). `begin_run(새 달)` 이 이전의 열린 달을 **같은 트랜잭션에서 닫는다** |
| 트리거 `guard_closed_month` | events·board_snapshots·ingest_runs 에서 닫힌 달 행의 INSERT·UPDATE·DELETE 를 예외로 막는다 |
| 트리거 `guard_months` | 닫힌 달을 다시 열거나 달을 지우는 것을 막는다 |
| 권한 | service_role 에 TRUNCATE 를 주지 않고, 문장 단위 `before truncate` 트리거로도 막는다(행 트리거를 건너뛰므로) |
| 같은 달 재실행 | 열린 달은 `publish_run` 이 그 달 events 를 지우고 다시 넣는다. 이전 실행은 `superseded` |
| 한계 | postgres(소유자)는 트리거를 끌 수 있다. 사고 방지 장치이고 악의적 변경 방지는 아니다. 저장소 파일(`schemas/ledger-YYYY-MM/`, git)이 함께 증거다 |

달을 한국시간 "이번 달"로만 받는 규칙(`snapshot.js`)은 DB 에 넣지 않는다. 2026-10 판을 11월에 처음 싣는 경우를 막으면 안 되기 때문이다. 대신 "이미 닫힌 달은 거부, 열린 달보다 앞선 새 달은 거부(열린 달이 둘이 되므로)"로 충분하다.

**`ingest_runs`(manifest.json 대체)**

| manifest.json | ingest_runs |
|---|---|
| `month` | month → months |
| `taken_at` | started_at(가장 이른 fetched_at) · finished_at |
| `endpoint`·`bjd_codes` | params jsonb(인증키 없는 조회 조건) |
| `calls`·`pages`·`records`·`rows`·`projects`·`refs`·`refs_matched` | counts jsonb + 발행 때 표별 행 수 |
| `refs_missing` | issues jsonb |
| `source_ref` | `ingest_run_sources(run_id, source_ref, data_as_of, collected_at, record_count)` — 실행마다 원천 판(기준일)을 남긴다. `sources.data_as_of` 는 현재 판 |
| (없음) | kind(`legal_dong`·`lh_mapping`·`hub_snapshot`·`agency_import`·`stat`·`load`), status, tool, git_commit, files jsonb(Storage 경로·바이트·sha256) |

## 4. 화면 읽기 경로

**집계는 `tools/ledger/board.js` 그대로**, 결과 JSON 을 `board_snapshots` 에 달마다 저장한다(SQL 뷰·물질화 뷰로 다시 짜지 않는다).

| | board.js + JSON 저장(추천) | SQL 뷰·물질화 뷰 |
|---|---|---|
| 규칙 | 원천 순위·물량 종류 우선·stageAt·경과 개월이 185줄 한 곳, 시험(`ledger-board.test.cjs`) 있음 | 같은 규칙을 SQL 로 두 벌. 어긋나면 화면과 시험이 다른 답 |
| 지난 달 | 그 달 JSON 이 그대로 남는다(불변) | 지난 달을 다시 계산하면 현재 판 표로 계산돼 값이 바뀐다 |
| 크기·비용 | 10 KB/월, 읽기 1회 | 읽을 때마다 계산 또는 갱신 관리 |
| 약점 | 사업 하나·시군구 하나의 즉석 거르기는 못 한다 → 그런 화면은 `api` 뷰(표)를 읽는다 | – |

**Next.js 가 읽는 법(결정 4)**: 서버 컴포넌트가 PostgREST 를 `fetch` 로 부른다. 새 패키지는 필요 없다.

```ts
// lib/ledger/remote.ts (서버 컴포넌트에서만 import) — 키는 publishable 뿐
const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/board?month=eq.${m}&select=board`, {
  headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, 'Accept-Profile': 'api' },
  next: { revalidate: 3600, tags: ['ledger'] },
});
```

- 지금 화면은 `generateStaticParams` 로 빌드 때 만든다. 빌드 때 한 번 읽고 1시간마다 다시 확인(ISR)한다. 다시 확인이 실패하면 Next 는 마지막 성공 페이지를 계속 보인다. 빌드 때 DB 가 멈춰 있으면 빌드가 실패하므로, 전환기 동안 `data/board/ledger-board.json` 을 대체값으로 남긴다.
- Data API 는 한 번에 최대 1,000행(기본값)을 준다. 사업 목록(350)은 한 번, 전국(약 1만)과 areas(20,562)는 쪽 나누기.
- 같은 서울 지역(Vercel icn1 · Supabase ap-northeast-2)이라 왕복 지연은 작다(측정은 안 함).

## 5. 원본 파일 → Storage

버킷 `ledger-raw` 하나, **비공개**(공개 URL 없음, 읽기·쓰기 모두 secret 키). 원천 응답은 재배포하지 않는다는 기획서 결정 4 때문에 공개 버킷을 두지 않는다.

```
ledger-raw/
  {YYYY-MM}/legal-dong/국토교통부_법정동코드_20260929.csv.gz
  {YYYY-MM}/hub/{bjd10}.json.gz          # 전국으로 넓히면 {sgg5}.json.gz 로 묶는다
  {YYYY-MM}/lh-completion/{원본 파일명}.gz
  {YYYY-MM}/agency/{agency_id}/{received}/*.csv
  {YYYY-MM}/mappings/lh-block-sgg.json.gz
  {YYYY-MM}/tables.tar.gz                  # 그 달 원장 16표 묶음(지난 판 보관)
```

| 자료 | DB 표? | 이유 |
|---|---|---|
| 법정동코드 CSV(폐지 32,827행 포함) | 아니오. 존재 행만 `areas` | 옛 코드 조회용 원본. gzip 393,135 B |
| 건축HUB 원본 JSON | 아니오 | 레코드 844건 667,063 B → gzip 27,600 B. 화면은 events 만 읽는다 |
| LH·기관 CSV·매핑 | 아니오 | 다시 변환할 입력. 결과는 원장 표 |

- 지난 달 경로는 덮어쓰지 않는다(`x-upsert: false`, 적재 도구가 지킴 — service_role 은 Storage RLS 를 건너뛰므로 DB 처럼 강제할 수는 없다). 경로·sha256 은 `ingest_runs.files` 에 남긴다.
- 저장소 git 의 `schemas/ledger-YYYY-MM/raw` 는 결정 1 에 따라 전환기에는 그대로 둔다.

## 6. 적재·검증 절차

새 도구 `tools/ledger/load.js --month YYYY-MM [--dry-run]`(만들 때 승인). secret 키로 Data API 만 쓴다(새 패키지 없음).

| 단계 | 하는 일 | 확인 |
|---|---|---|
| 1 | 파일 16표 읽기 → `validate.js` | 오류 0 |
| 2 | `board.js` 로 그 달 보드 계산 | `data/board/ledger-board.json` 과 같음 |
| 3 | `ledger_admin.begin_run(month, 'load', reference_date, meta)` → run_id | 닫힌 달이면 여기서 거부 |
| 4 | `stage_rows(run_id, tbl, seq, row)` 에 표별로 나눠 POST(묶음 약 1 MB, areas 3.2 MB 는 4~5번) + 보드 JSON | 표별 행 수 = 파일 |
| 5 | `ledger_admin.publish_run(run_id)` — **한 트랜잭션**: 외래 키 지연 → upsert 표 → 바꾸는 표(지우고 넣기) → 그 달 events 지우고 넣기 → board_snapshots → 실행 상태·행 수 → stage 비우기 | 제약 위반이면 전체 취소 |
| 6 | 왕복: `export_table(tbl, month)` 로 DB → JSON(적재 열 제외, load_seq 순, 1,000행씩) | 파일 행과 **깊은 같음**(jsonb 는 키 순서를 바꾸므로 키 순서는 비교하지 않는다), `validate.js` 통과, `boardFromLedger(DB 표)` = 저장한 보드 |
| 7 | 원본을 `ledger-raw/{month}/` 에 올리고 `ingest_runs.files` 기록 | sha256 |

- **멱등**: 같은 달 같은 파일로 다시 돌리면 같은 행(upsert·바꾸기·달 events 바꾸기)이고, 이전 실행은 `superseded`. 지난 달은 3단계에서 거부.
- **마이그레이션**: `supabase/migrations/<타임스탬프>_ledger_schema.sql`(부록 A-1~A-6, api 뷰 포함 — 2026-10-11 적용), `_ledger_admin.sql`(A-7, 적재 단계) 을 저장소에 둔다. 적용은 승인 뒤 `supabase db push --db-url …`, 적용 뒤 `supabase db advisors` 로 RLS·노출 점검, `supabase migration list` 로 원격 기록 대조. 노출 스키마(`api`·`ledger_admin`)는 대시보드 Data API 설정에서 바꾼다.
- **시험**: Docker 가 없어 로컬 DB(`supabase start`)는 못 쓴다. ① 오프라인 시험 `tests/js/supabase-ddl.test.cjs`(2026-10-11 추가) — 마이그레이션 SQL 의 CHECK 값 목록·패턴이 `schemas/ledger/*.schema.json` 의 enum·pattern 과 같은지 글자 대조(스키마와 DDL 이 따로 바뀌는 것을 막는다) ② 온라인 — 무료 두 번째 프로젝트를 시험용 DB 로 두고 적재 → 왕복 → 닫힌 달 쓰기 거부·TRUNCATE 거부를 확인한 뒤 운영 프로젝트에 적용.
- **CSV(v1.4) 내보내기**: DB → JSON 이 파일과 같으므로 기존 변환(`tools/common_v1_4`)을 그대로 쓴다.

## 7. 용량

| | 지금(2026-10) | 전국(추정) | 무료 한도 |
|---|---|---|---|
| 원장 행 | 39,162 | 사업 약 1만(주택인허가 약 31만 건 ÷ 성북 비율 4,542건/152사업) | – |
| events 증가 | 709행/월 | 약 3.9만 행/월(사업당 3.8행 = 건축HUB 209행/55사업) | – |
| DB 크기 | 표 약 8~10 MB(추정: 행당 값 바이트 + 머리 24 B + 인덱스) + 시스템 10 MB(실측) | 첫해 약 150 MB, 이후 events 로 연 약 120 MB(행당 약 250 B) | 500 MB → 전국에서 약 3년 |
| Storage | 원본 3,138,725 B(gzip 420,735 B) + 표 묶음 0.3 MB/월 | 건축HUB 원본 약 245 MB/월 → gzip 약 10 MB/월 | 1 GB → 수년 |
| 보드 JSON | 10 KB/월 | 같음(카드 수가 같다) | – |

- 건축인허가 전국(약 585만 건, 필요한 항목만 약 2.5 GB)은 이 DB 에 넣지 않는다. 넣는다면 무료 한도를 넘는다.
- 전국 events 가 400 MB 에 가까워지면 둘 중 하나: 유료 요금제로 올리거나, events 를 "바뀐 달만 새 행 + 유효 구간" 저장으로 바꾼다(v1.4 내보내기는 뷰로 펼친다).
- 적재 뒤 `supabase inspect db table-stats` 로 실측해 이 표를 고친다.

## 8. 알려진 결손·이상의 처리

| 결손·이상 | 처리 |
|---|---|
| 빈 표 5개(policies·programs·links·notices·notice_links) | 지금 만든다(외래 키 끝이 있어야 총리 지시·우리 동네를 붙인다). notices 열은 공고 연동 설계 때 마이그레이션으로 고칠 수 있다 |
| 늘 null 인 열(events.change_reason·change_note, projects.superseded_by, sources.source_url·original_filename) | nullable 로 둔다 |
| events 자연 키 중복: (사업·종류·date_type·plan_basis) 43묶음·202행, **모든 열이 같은 행도 11묶음·23행**(번들 건물 단위 허가·착공) | 대리 키 `event_id` + `unique(observed_month, load_seq)`. 중복을 합치지 않는다(파일과 왕복이 같아야 하고 보드 결과도 그대로) |
| units·project_locations·review_required·links·notice_links 에 선언된 키 없음 | units·review_required: 대리 키만. project_locations: 대리 키 + (사업, 법정동, 필지) `nulls not distinct` 고유(데이터셋-스키마 2절의 키). links·notice_links: 열 조합을 기본 키로 |
| 물량 종류 혼합(PUBLIC_PLAN 352·PERMIT 67·NOTICE 7행) | `quantity_type` 을 반드시 둔다. `api` 뷰는 합계를 내지 않는다. SQL 로 합칠 일이 생기면 `quantity_type` 으로 묶는다 |
| 이상 행 PRJ-12330-0002(착공 ACTUAL 2026-12-23 이 기준일 뒤·준공 2026-01-20 뒤) | 그대로 싣는다. `review_status = REVIEW_REQUIRED` 로 표시돼 있다. "ACTUAL ≤ 기준일" CHECK 는 두지 않는다(이 행이 거부되면 원장과 DB 가 어긋난다) |
| LH 후보 273건 `issued_at` null(id 는 발급 전 임시값) | 싣고 `api.projects.is_candidate` 로 가른다. 발급 때 **같은 id 를 확정**(issued_at 만 채움)해야 지난 달 events 가 그대로 이어진다(결정 5). 판에서 빠진 후보도 지우지 않는다 |
| observed_month 1개·BASELINE/REVISED 0행 | months 1행(2026-10, open). 추이 카드는 둘째 달 발행 전까지 SAMPLE |
| sources.used_by 가 통합 전 경로(/month·/agency) | DB 일이 아니다. 데이터에서 고친다 |
| 기관 입력의 source_owner·id_issuer 값 없음, 재입력 시 물량 겹침 | id_issuer CHECK 는 스키마 값 그대로. 기관 값을 정하면 스키마·DDL 을 같이 바꾼다. 겹침은 "같은 기관의 최신 묶음만" 규칙을 정할 때까지 units 를 판마다 바꾸는 것으로 막는다 |

## 9. 결정이 필요한 것

| # | 질문 | 선택지 | 추천 | 이유와 대가 |
|---|---|---|---|---|
| 1 | 정본은 어디인가 | A 전환기엔 저장소 파일이 정본, DB 는 적재한 사본 · B 지금부터 DB 가 정본 | **A** | 2026-10-10 결정(③ DB 전환은 기관 입력 쓰기 화면 때)과 맞고, 검증·시험·커밋 흐름이 그대로다. 대가: 같은 자료가 두 곳. 기관 입력 경로를 열 때 B 로 바꾼다 |
| 2 | 이력을 어떻게 남기나 | A 현재 판 + events 달별 + 보드 JSON 달별 + 표 묶음 Storage · B 모든 표를 달마다 한 벌 · C 모든 표 유효 구간(SCD2) | **A** | 화면이 묻는 이력은 events 와 판정 추이뿐이다. B 는 areas 2만 행을 매달 복제, C 는 적재·조회가 복잡. 대가: 지난 달의 사업·물량 표를 SQL 로 바로 못 묻고 Storage 묶음을 풀어야 한다 |
| 3 | 노출·적재 경로 | A `api` 뷰만 공개 + secret 키로 스테이징 → 발행 RPC · B `ledger` 를 바로 노출 + RLS · C DB 연결 문자열로 직접 적재(pg 패키지) | **A** | 공개 면이 뷰로 고정되고 적재가 한 트랜잭션이며 새 패키지가 없다. 대가: RPC 가 8초 제한 안이어야 한다(지금 규모는 충분, 전국이면 실측). 넘으면 C 로 |
| 4 | 화면이 언제 읽나 | A 서버 fetch + ISR(1시간, publishable 키) · B 빌드 전에 DB → JSON 파일로 받아 지금처럼 import | **A** | 배포 없이 새 판이 반영되고 비밀 키가 웹앱에 없다. 대가: 빌드·재확인이 DB 에 의존 → 전환기에는 JSON 대체값을 남긴다. B 는 가장 단순하지만 매달 배포해야 한다 |
| 5 | LH 후보 273건을 지금 싣나 | A 싣고, 발급 때 같은 id 확정 · B 발급 뒤에만 싣기 | **A** | 지금 보드 호수의 77%(148,389호)와 향후 12개월이 후보에서 온다. 대가: 발급 도구가 후보 id 를 그대로 써야 한다(`scripts/issue-projects.js` 보완) |
| 6 | 요금제 | A 무료 유지 · B 유료 | **A** | 지금 약 20 MB/500 MB. 대가: **7일 동안 활동이 없으면 일시정지**된다. 4-A 의 시간당 재확인이 방문이 있는 동안 활동을 만들고, 멈추면 대시보드에서 복원한다. 전국 수집(8절 6번)을 시작하거나 400 MB 에 가까워지면 B |

## 부록 A. DDL 초안 (A-1~A-6 적용 — 부록 C, A-7·`ledger_admin`·`stage_rows` 는 적재 단계)

```sql
-- ============ A-1 스키마·도메인 ============
create schema ledger;
create schema ledger_admin;                 -- 적재 단계에서(2026-10-11 마이그레이션에는 없음)
create schema api;
revoke all on schema ledger, ledger_admin, api from public;
grant usage on schema api, ledger to anon, authenticated, service_role;  -- ledger USAGE 는 security_invoker 뷰용(노출 안 함)
grant usage on schema ledger_admin to service_role;   -- 적재 단계에서

create domain ledger.project_id    as text check (value ~ '^PRJ-\d{5}-\d{4}$');
create domain ledger.sido_code     as text check (value ~ '^\d{2}$');
create domain ledger.sgg_code      as text check (value ~ '^\d{5}$');
create domain ledger.bjd_code      as text check (value ~ '^\d{10}$');
create domain ledger.pnu           as text check (value ~ '^\d{19}$');
create domain ledger.ym            as text check (value ~ '^\d{4}-(0[1-9]|1[0-2])$');
create domain ledger.stage_code    as text check (value in ('01','02','03','04','05','06'));
create domain ledger.agency_id     as text check (value in ('lh','local','gh','sh','mnd'));
create domain ledger.stat_actor    as text check (value in ('지자체','LH','주택업체','민간'));
create domain ledger.review_status as text check (value in ('CONFIRMED','REVIEW_REQUIRED'));
create domain ledger.source_ref    as text check (value ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$');
create domain ledger.complex_id    as text check (value ~ '^[a-z0-9-]+/.+$');
create domain ledger.local_id      as text check (value ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$');

-- ============ A-2 운영 표 ============
create table ledger.months (
  month          ledger.ym primary key,
  status         text not null default 'open' check (status in ('open','closed')),
  reference_date date not null,                       -- 보드 기준일(2026-10 은 2026-10-10)
  opened_at      timestamptz not null default now(),
  closed_at      timestamptz,
  check ((status = 'closed') = (closed_at is not null))
);
create unique index months_one_open on ledger.months ((true)) where status = 'open';

create table ledger.ingest_runs (
  run_id      bigint generated always as identity primary key,
  month       ledger.ym not null references ledger.months,
  kind        text not null check (kind in ('legal_dong','lh_mapping','hub_snapshot','agency_import','stat','load')),
  status      text not null default 'staged' check (status in ('staged','published','failed','superseded')),
  tool        text not null,
  git_commit  text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  params      jsonb not null default '{}',   -- 조회 조건(인증키 없음)
  counts      jsonb not null default '{}',
  issues      jsonb not null default '[]',
  files       jsonb not null default '[]',   -- [{bucket, path, bytes, sha256}]
  error       text
);

-- ============ A-3 원장 표 (적재 열 load_run_id·load_seq 는 모든 표 공통) ============
create table ledger.sources (
  source_ref        ledger.source_ref primary key,
  source_owner      text not null check (source_owner <> ''),
  provider          text not null check (provider <> ''),
  dataset_name      text not null check (dataset_name <> ''),
  source_url        text, source_record_key text,
  data_as_of        date,
  collected_at      text check (collected_at ~ '^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$'),
  original_filename text, notes text,
  record_count      integer check (record_count >= 0),
  license           text,
  used_by           text[] not null default '{}',
  is_demo           boolean not null,
  load_run_id bigint not null references ledger.ingest_runs, load_seq integer not null
);

create table ledger.ingest_run_sources (
  run_id       bigint references ledger.ingest_runs on delete cascade,
  source_ref   ledger.source_ref references ledger.sources deferrable initially deferred,
  data_as_of   date, collected_at text, record_count integer,
  primary key (run_id, source_ref)
);

create table ledger.areas (
  area_code   text primary key check (area_code ~ '^(\d{2}|\d{5}|\d{10})$'),
  level       text not null check (level in ('NATION','SIDO','SGG','BJD')),
  area_name   text check (area_name <> ''),
  parent_code text references ledger.areas deferrable initially deferred,
  source_ref  ledger.source_ref not null references ledger.sources,
  load_run_id bigint not null references ledger.ingest_runs, load_seq integer not null,
  check (length(area_code) = case level when 'BJD' then 10 when 'SGG' then 5 else 2 end),
  check ((parent_code is null) = (level in ('NATION','SIDO'))),
  check (parent_code is null or area_code like parent_code || '%')
);
create index on ledger.areas (parent_code);

create table ledger.agencies (
  agency_id   ledger.agency_id primary key,
  agency_name text not null check (agency_name <> ''),
  stat_actor  ledger.stat_actor,
  source_ref  ledger.source_ref not null references ledger.sources,
  load_run_id bigint not null references ledger.ingest_runs, load_seq integer not null
);

create table ledger.projects (
  local_project_id ledger.project_id primary key,
  project_name     text check (project_name <> ''),
  project_unit     text not null check (project_unit in ('PROJECT','BLOCK','AREA_UNKNOWN')),
  sgg_code         ledger.sgg_code not null references ledger.areas,
  agency_id        ledger.agency_id references ledger.agencies,
  public_scope     text not null check (public_scope in ('PUBLIC','PRIVATE_ON_PUBLIC_LAND','UNKNOWN')),
  public_basis     text,
  stage_code       ledger.stage_code not null,
  as_of            date not null,
  issued_at        date,                                   -- null = LH 후보(발급 전)
  superseded_by    ledger.project_id references ledger.projects deferrable initially deferred,
  source_ref       ledger.source_ref not null references ledger.sources,
  load_run_id bigint not null references ledger.ingest_runs, load_seq integer not null,
  check (superseded_by is distinct from local_project_id)
);
create index on ledger.projects (sgg_code);
create index on ledger.projects (left(sgg_code, 2));   -- 시도 16·우리 동네
create index on ledger.projects (stage_code);
create index on ledger.projects (agency_id);

create table ledger.identifiers (
  id_type          text not null check (id_type in ('AREA_BLOCK','BUNDLE_ID','LH_AREA_BLOCK_CODE','HUB_HS_PK','HUB_AP_PK','MANUAL')),
  id_value         text not null check (id_value <> ''),
  local_project_id ledger.project_id not null references ledger.projects,
  id_issuer        text not null check (id_issuer in ('LH','HOUSING_WAVE','국토교통부','행정안전부')),
  as_of            date,
  source_ref       ledger.source_ref not null references ledger.sources,
  match_status     ledger.review_status not null,
  load_run_id bigint not null references ledger.ingest_runs, load_seq integer not null,
  primary key (id_type, id_value)
);
create index on ledger.identifiers (local_project_id);

create table ledger.project_locations (
  location_id      bigint generated always as identity primary key,
  local_project_id ledger.project_id not null references ledger.projects,
  bjd_code         ledger.bjd_code not null references ledger.areas,
  pnu              ledger.pnu,
  pnu_scope        text check (pnu_scope in ('SITE','REPRESENTATIVE')),
  source_ref       ledger.source_ref not null references ledger.sources,
  load_run_id bigint not null references ledger.ingest_runs, load_seq integer not null,
  unique nulls not distinct (local_project_id, bjd_code, pnu),
  check (pnu is null or left(pnu, 10) = bjd_code),
  check ((pnu is null) = (pnu_scope is null))
);
create index on ledger.project_locations (bjd_code);
create index on ledger.project_locations (pnu) where pnu is not null;

create table ledger.complexes (
  complex_id       ledger.complex_id primary key,
  local_project_id ledger.project_id references ledger.projects,
  region_slug      text not null check (region_slug ~ '^[a-z0-9-]+$'),
  complex_label    text not null check (complex_label <> ''),
  complex_name     text not null check (complex_name <> ''),
  status           text not null check (status in ('계획','분양중','건설 단계','준공 임박','입주 단계')),
  sponsor_class    text not null check (sponsor_class in ('public','private_on_public_land')),
  housing_kind     text,
  unit_count       integer check (unit_count >= 0),
  move_in_month    ledger.ym,
  progress_pct     numeric check (progress_pct between 0 and 100),
  progress_as_of   date,
  source_ref       ledger.source_ref not null references ledger.sources,
  load_run_id bigint not null references ledger.ingest_runs, load_seq integer not null
);
create index on ledger.complexes (local_project_id);

create table ledger.events (
  event_id         bigint generated always as identity primary key,
  local_project_id ledger.project_id not null references ledger.projects,
  complex_id       ledger.complex_id references ledger.complexes,
  event_type       text not null check (event_type in ('PERMIT','CONSTRUCTION_START','PROGRESS','COMPLETION','SUPPLY_NOTICE','MOVE_IN')),
  date_type        text not null check (date_type in ('PLANNED','ACTUAL')),
  plan_basis       text check (plan_basis in ('BASELINE','REVISED','CURRENT')),
  event_date       date,
  event_month      ledger.ym,
  event_year       text check (event_year ~ '^\d{4}$'),
  progress_pct     numeric check (progress_pct between 0 and 100),
  event_detail     text,
  change_reason    text check (change_reason in ('PERMIT','BUSINESS_APPROVAL','CONSTRUCTION_START','OTHER')),
  change_note      text,
  observed_month   ledger.ym not null references ledger.months,
  source_ref       ledger.source_ref not null references ledger.sources,
  review_status    ledger.review_status not null,
  load_run_id bigint not null references ledger.ingest_runs, load_seq integer not null,
  unique (observed_month, load_seq),
  check (num_nonnulls(event_date, event_month, event_year) = 1),
  check ((date_type = 'ACTUAL') = (plan_basis is null))
);
create index on ledger.events (local_project_id, observed_month);
create index on ledger.events (observed_month, event_type, date_type);

create table ledger.units (
  unit_id          bigint generated always as identity primary key,
  local_project_id ledger.project_id not null references ledger.projects,
  complex_id       ledger.complex_id references ledger.complexes,
  quantity_type    text not null check (quantity_type in ('PUBLIC_PLAN','NOTICE','PROJECT_PLAN','PERMIT','AGENCY_PLAN')),
  housing_type     text,
  unit_count       integer not null check (unit_count >= 0),
  reference_period text check (reference_period ~ '^\d{4}(-(0[1-9]|1[0-2]))?$'),
  unit_scope       text not null check (unit_scope in ('SUBTYPE','TOTAL')),
  source_ref       ledger.source_ref not null references ledger.sources,
  review_status    ledger.review_status not null,
  load_run_id bigint not null references ledger.ingest_runs, load_seq integer not null
);
create index on ledger.units (local_project_id);

create table ledger.stat_facts (
  metric      text not null check (metric in ('permit','start','sale','complete')),
  stage_code  text not null check (stage_code in ('03','04','05','06')),
  sido_code   ledger.sido_code not null references ledger.areas,
  ym          ledger.ym not null,
  actor       text not null check (actor in ('TOTAL','지자체','LH','주택업체','민간')),
  value       integer check (value >= 0),
  provisional boolean not null,
  source_ref  ledger.source_ref not null references ledger.sources,
  load_run_id bigint not null references ledger.ingest_runs, load_seq integer not null,
  primary key (metric, sido_code, ym, actor),
  check (stage_code = case metric when 'permit' then '03' when 'start' then '04' when 'sale' then '05' else '06' end)
);
create index on ledger.stat_facts (sido_code, ym);

create table ledger.review_required (
  review_id        bigint generated always as identity primary key,
  review_type      text not null check (review_type in ('SGG_UNRESOLVED','PUBLIC_SCOPE_UNKNOWN','DATE_CONFLICT','LINK_CANDIDATE')),
  local_project_id ledger.project_id references ledger.projects,
  source_ref       ledger.source_ref not null references ledger.sources,
  record_key       text not null check (record_key <> ''),
  record_name      text, detail text,
  reason           text not null check (reason <> ''),
  load_run_id bigint not null references ledger.ingest_runs, load_seq integer not null
);
create index on ledger.review_required (local_project_id);

create table ledger.policies (
  local_policy_id   ledger.local_id primary key,
  policy_name       text not null check (policy_name <> ''),
  announcement_date date,
  scope_region      text,
  source_ref        ledger.source_ref not null references ledger.sources,
  review_status     ledger.review_status not null,
  load_run_id bigint not null references ledger.ingest_runs, load_seq integer not null
);
create table ledger.programs (
  local_program_id   ledger.local_id primary key,
  program_name       text not null check (program_name <> ''),
  program_definition text,
  source_ref         ledger.source_ref not null references ledger.sources,
  review_status      ledger.review_status not null,
  load_run_id bigint not null references ledger.ingest_runs, load_seq integer not null
);
create table ledger.links (
  link_type     text not null check (link_type in ('POLICY_PROGRAM','PROGRAM_PROJECT','POLICY_PROJECT')),
  from_local_id ledger.local_id not null,
  to_local_id   ledger.local_id not null,
  evidence      text,
  review_status ledger.review_status not null,
  source_ref    ledger.source_ref not null references ledger.sources,
  load_run_id bigint not null references ledger.ingest_runs, load_seq integer not null,
  -- link_type 별 끝을 생성 열로 갈라 외래 키를 건다(v1.4 열은 그대로). PG17 에서 동작 확인(2026-10-11)
  from_policy_id  text generated always as (case when link_type <> 'PROGRAM_PROJECT' then from_local_id end) stored references ledger.policies,
  from_program_id text generated always as (case when link_type =  'PROGRAM_PROJECT' then from_local_id end) stored references ledger.programs,
  to_program_id   text generated always as (case when link_type =  'POLICY_PROGRAM'  then to_local_id   end) stored references ledger.programs,
  to_project_id   text generated always as (case when link_type <> 'POLICY_PROGRAM'  then to_local_id   end) stored references ledger.projects,
  primary key (link_type, from_local_id, to_local_id)
);
create table ledger.notices (
  notice_system text not null check (notice_system in ('MYHOME','LH')),
  notice_id     text not null check (notice_id <> ''),
  notice_title  text not null check (notice_title <> ''),
  sgg_code      ledger.sgg_code references ledger.areas,
  pnu           ledger.pnu,
  announced_on  date, apply_start date, apply_end date,
  observed_on   date not null,
  source_ref    ledger.source_ref not null references ledger.sources,
  load_run_id bigint not null references ledger.ingest_runs, load_seq integer not null,
  primary key (notice_system, notice_id)
);
create index on ledger.notices (sgg_code);
create table ledger.notice_links (
  notice_system    text not null check (notice_system in ('MYHOME','LH')),
  notice_id        text not null,
  local_project_id ledger.project_id not null references ledger.projects,
  evidence         text,
  review_status    ledger.review_status not null,
  source_ref       ledger.source_ref not null references ledger.sources,
  load_run_id bigint not null references ledger.ingest_runs, load_seq integer not null,
  primary key (notice_system, notice_id, local_project_id),
  foreign key (notice_system, notice_id) references ledger.notices
);

create table ledger.board_snapshots (
  month          ledger.ym primary key references ledger.months,
  run_id         bigint not null references ledger.ingest_runs,
  reference_date date not null,
  board          jsonb not null check (board->>'schema' = 'ledger-board/1' and board->>'observedMonth' = month::text),
  built_at       timestamptz not null default now()
);

create table ledger_admin.stage_rows (
  run_id bigint not null references ledger.ingest_runs on delete cascade,
  tbl    text not null,
  seq    integer not null,
  row    jsonb not null,
  primary key (run_id, tbl, seq)
);

-- ============ A-4 불변 강제 ============
create function ledger.guard_closed_month() returns trigger
language plpgsql set search_path = '' as $$
declare col text := tg_argv[0];
begin
  if tg_op in ('UPDATE','DELETE') and exists (select 1 from ledger.months m where m.month = to_jsonb(old)->>col and m.status = 'closed') then
    raise exception '닫힌 달 %의 행은 바꿀 수 없다', to_jsonb(old)->>col;
  end if;
  if tg_op in ('INSERT','UPDATE') and exists (select 1 from ledger.months m where m.month = to_jsonb(new)->>col and m.status = 'closed') then
    raise exception '닫힌 달 %에는 넣을 수 없다', to_jsonb(new)->>col;
  end if;
  return coalesce(new, old);
end $$;
create trigger guard before insert or update or delete on ledger.events          for each row execute function ledger.guard_closed_month('observed_month');
create trigger guard before insert or update or delete on ledger.board_snapshots for each row execute function ledger.guard_closed_month('month');
create trigger guard before insert or update or delete on ledger.ingest_runs     for each row execute function ledger.guard_closed_month('month');

create function ledger.guard_months() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception '달은 지우지 않는다'; end if;
  if old.status = 'closed' then raise exception '닫힌 달 %은 바꿀 수 없다', old.month; end if;
  return new;
end $$;
create trigger guard before update or delete on ledger.months for each row execute function ledger.guard_months();

create function ledger.no_truncate() returns trigger language plpgsql set search_path = '' as $$ begin raise exception 'TRUNCATE 금지'; end $$;
create trigger no_truncate before truncate on ledger.events          for each statement execute function ledger.no_truncate();
create trigger no_truncate before truncate on ledger.board_snapshots for each statement execute function ledger.no_truncate();
create trigger no_truncate before truncate on ledger.months          for each statement execute function ledger.no_truncate();

-- ============ A-5 RLS·권한 ============
-- (16표 + months·ingest_runs·ingest_run_sources·board_snapshots 모두) public 이 아니므로 자동 켜기가 닿지 않는다
alter table ledger.events enable row level security;   -- … 나머지 표도 같은 줄
alter table ledger_admin.stage_rows enable row level security;   -- 적재 단계에서

revoke all on all tables in schema ledger from public, anon, authenticated, service_role;     -- 명시적 출발점
revoke all on all sequences in schema ledger from public, anon, authenticated, service_role;

grant select on ledger.areas, ledger.agencies, ledger.sources, ledger.projects, ledger.identifiers,
  ledger.project_locations, ledger.complexes, ledger.events, ledger.units, ledger.stat_facts,
  ledger.policies, ledger.programs, ledger.links, ledger.notices, ledger.notice_links,
  ledger.months, ledger.board_snapshots, ledger.ingest_runs, ledger.ingest_run_sources to anon, authenticated;
create policy read_all on ledger.events for select to anon, authenticated using (true);   -- 공개 표마다 같은 정책
create policy read_published on ledger.ingest_runs for select to anon, authenticated using (status in ('published','superseded'));
-- review_required·stage_rows: anon 권한·정책 없음

grant select, insert, update, delete on all tables in schema ledger to service_role;   -- TRUNCATE 는 주지 않는다
grant usage on all sequences in schema ledger to service_role;                          -- 대리 키(identity)
grant select, insert, delete on ledger_admin.stage_rows to service_role;

-- ============ A-6 공개 뷰 ============
create function ledger.current_run() returns bigint language sql stable set search_path = '' as $$
  select run_id from ledger.ingest_runs where kind = 'load' and status = 'published' order by month desc, run_id desc limit 1
$$;
grant execute on function ledger.current_run() to anon, authenticated, service_role;

create view api.board with (security_invoker = true) as
  select b.month, b.reference_date, b.board, m.status from ledger.board_snapshots b join ledger.months m using (month);

create view api.projects with (security_invoker = true) as
  select p.local_project_id, p.project_name, p.project_unit, p.sgg_code, left(p.sgg_code, 2) as sido_code,
         p.agency_id, p.public_scope, p.public_basis, p.stage_code, p.as_of, p.issued_at,
         p.issued_at is null as is_candidate, p.superseded_by, p.source_ref, s.is_demo
  from ledger.projects p join ledger.sources s using (source_ref)
  where p.load_run_id = (select ledger.current_run());   -- 한 번만 계산

create view api.events with (security_invoker = true) as        -- 모든 관측 달
  select e.local_project_id, e.complex_id, e.event_type, e.date_type, e.plan_basis, e.event_date, e.event_month,
         e.event_year, e.progress_pct, e.event_detail, e.change_reason, e.change_note, e.observed_month,
         e.source_ref, e.review_status, s.is_demo
  from ledger.events e join ledger.sources s using (source_ref);
-- api.units·project_locations·identifiers·complexes·areas·stat_facts·sources·agencies·policies·programs·links·notices·notice_links:
--   같은 모양(v1.4 열 + is_demo, load_*·대리 키 제외). 지우지 않는 표는 load_run_id = (select ledger.current_run()) 로 현재 판만, 바꾸는 표는 전부.
-- api.source_freshness: sources × ingest_run_sources(최근 발행) → 수집일·원천 기준일(/sources D1)
revoke all on all tables in schema api from public, anon, authenticated, service_role;
grant select on all tables in schema api to anon, authenticated;

-- ============ A-7 적재 RPC (모양만) ============
create function ledger_admin.begin_run(p_month text, p_kind text, p_reference_date date, p_meta jsonb) returns bigint
language plpgsql set search_path = '' as $$
declare v_run bigint;
begin
  update ledger.months set status = 'closed', closed_at = now() where status = 'open' and month < p_month;
  insert into ledger.months (month, reference_date) values (p_month, p_reference_date)
    on conflict (month) do update set reference_date = excluded.reference_date;   -- 닫힌 달이면 guard 가 거부
  insert into ledger.ingest_runs (month, kind, tool, git_commit, params)
    values (p_month, p_kind, p_meta->>'tool', p_meta->>'git_commit', coalesce(p_meta->'params', '{}'))
    returning run_id into v_run;
  return v_run;
end $$;

-- publish_run(p_run): 한 트랜잭션에서
--   set constraints all deferred;
--   upsert 표:   insert into ledger.projects (열…, load_run_id, load_seq)
--                select r.*, p_run, s.seq from ledger_admin.stage_rows s, jsonb_populate_record(null::…, s.row) r
--                where s.run_id = p_run and s.tbl = 'projects'
--                on conflict (local_project_id) do update set … , load_run_id = excluded.load_run_id, load_seq = excluded.load_seq;
--   바꾸는 표:   delete from ledger.units where load_run_id is not null;  (safeupdate 때문에 WHERE 필수) → insert
--   events:      delete from ledger.events where observed_month = v_month; → insert
--   board:       insert into ledger.board_snapshots … on conflict (month) do update …
--   마무리:      이전 실행 superseded, 이 실행 published·counts, stage_rows 비우기
-- export_table(p_tbl, p_month): 허용 표 이름만 format(%I) 로 → to_jsonb(t) - 'load_run_id' - 'load_seq' - '<대리 키>' 를 load_seq 순으로
grant execute on all functions in schema ledger_admin to service_role;
revoke execute on all functions in schema ledger_admin from anon, authenticated, public;
```

## 부록 B. 확인한 것·못 한 것

| 항목 | 상태 |
|---|---|
| Postgres 17.11, DB 10 MB·사용자 표 0개, 버킷 0개, 확장(pg_stat_statements·pgcrypto·plpgsql·supabase_vault·uuid-ossp, pg_graphql 없음) | 읽기 전용 질의로 실측(2026-10-11) |
| public 기본 권한(anon·authenticated 에 arwdDxtm), `ensure_rls` 이벤트 트리거가 public 에만 작동, 역할 시간 제한(anon 3s·authenticated 8s·authenticator 8s + safeupdate), service_role BYPASSRLS | 실측 |
| Data API 루트: publishable 키 401, secret 키로 public 스키마(PostgREST 14.18)만 노출 | 실측 |
| 무료 한도(DB 500 MB · Storage 1 GB · 7일 미사용 일시정지 · 조직당 무료 프로젝트 2개), secret 키 = RLS 우회·백엔드 전용 | 웹 검색(2차 출처 포함)으로 확인. 공식 가격표 본문은 열지 않음 |
| 2026-04-28 변경 기록 "public 새 표의 Data API 자동 노출 중단" | 검색으로만 확인. 이 프로젝트의 실측 기본 권한과 어긋나 보여, 어느 쪽이든 명시 GRANT 로 간다 |
| 생성 열의 외래 키(links) | PG17 에서 동작 확인(2026-10-11, 없는 정책을 가리키면 `links_from_policy_id_fkey` 로 거부) |
| Data API 기본 최대 1,000행, 노출 스키마는 대시보드 설정, 발행 RPC 실행 시간, 무료 Storage 파일 크기 한도 | 확인 못 함 — 시험용 프로젝트에서 확인 |
| DB 크기·전국 용량 | 추정(행당 값 바이트 실측 × 머리·인덱스 가정). 적재 뒤 실측해 고친다 |

## 부록 C. 적용 기록 (2026-10-11)

- 마이그레이션 `supabase/migrations/20261011100500_ledger_schema.sql` 을 `supabase db push --db-url` 로 운영 프로젝트(`hpxjledpmrbhgenhdvyp`)에 적용. `supabase migration list` 원격 = 로컬 `20261011100500`. `supabase init` 으로 `supabase/config.toml` 생성(손대지 않음, `link`·`config push` 안 함).
- 원격 객체: `ledger` 표 20(원장 16 + months·ingest_runs·ingest_run_sources·board_snapshots), `api` 뷰 17(원장 15 + board·source_freshness, review_required 없음), 정책 19, 트리거 7(guard 4 · no_truncate 3), 인덱스 38, 함수 4(current_run·guard_closed_month·guard_months·no_truncate), 도메인 13. `public` 객체 0, 데이터 0행.
- 초안과 다른 점(부록 A 에 반영):

| 다른 점 | 이유 |
|---|---|
| `ledger_admin` 스키마·A-7 RPC·`stage_rows` 를 만들지 않음 | 이번은 표 만들기만. 적재 단계 마이그레이션에서 만든다 |
| `stat_facts.stage_code` 에 열 CHECK `in ('03','04','05','06')`, `sido_code` 는 도메인 `ledger.sido_code` | 스키마 enum 과 글자 대조(시험)하려고. 값 범위는 초안과 같다 |
| `project_locations` 에 `check ((pnu is null) = (pnu_scope is null))` | 스키마의 if/then 규칙(파일 검증 통과 = DB 적재 성공) |
| `notice_links.notice_system` 에 CHECK `in ('MYHOME','LH')` | 스키마 enum 열은 모두 DDL 에 목록이 있게(외래 키로도 막히지만 시험 규칙을 하나로) |
| `no_truncate` 에 `set search_path = ''` | 다른 함수와 같게(점검기 search_path 경고 예방) |
| GRANT 앞에 `revoke all … from public, anon, authenticated, service_role`(ledger 표·시퀀스, api 뷰) | 새 스키마엔 기본 권한이 없지만(실측) 출발점을 명시 |
| 현재 판 조건을 `(select ledger.current_run())` 로, 판마다 바꾸는 표의 뷰는 거르지 않음 | 행마다 함수 호출 대신 한 번 계산. 바꾸는 표는 늘 현재 판뿐 |
| `current_run()` 실행 권한에 service_role 추가 | 적재 도구가 같은 함수로 현재 판을 본다 |
| api 뷰 13개(주석으로만 있던 것)와 `source_freshness` 를 실제로 정의 | 열 = 스키마 열 + is_demo, load_*·대리 키 제외. source_freshness = 현재 판 원천 + 그 원천을 실은 최근 발행 실행의 기준일·수집일·건수 |
| 시험 파일 이름 `tests/js/supabase-ddl.test.cjs`, 마이그레이션 한 파일 | 6절의 세 파일 중 api 뷰를 표 마이그레이션에 합침 |

- 점검(모두 `BEGIN … ROLLBACK` 안, 끝에 20표 모두 0행 확인): 77항목 중 76 통과 + 1 재시험 통과. 모든 표 RLS 켜짐 · anon·authenticated 의 쓰기 권한(INSERT·UPDATE·DELETE·TRUNCATE·REFERENCES·TRIGGER) 0 · review_required anon 읽기 불가(42501) · service_role TRUNCATE 권한 0 · anon 이 api 뷰 17개 모두 읽음(빈 DB 0행, 발행 실행을 넣으면 api.projects 1행) · anon INSERT 거부 · 잘못된 코드(도메인·CHECK)·없는 사업(FK)·법정동 밖 필지·links 생성 열 FK 거부 · 달을 닫은 뒤 그 달 events UPDATE·DELETE·INSERT, board_snapshots INSERT, ingest_runs UPDATE, 다시 열기, 달 지우기 거부 · events·board_snapshots·months TRUNCATE 거부(months 는 지연 외래 키 대기 사건이 없는 별도 트랜잭션에서 재시험 — 같은 트랜잭션에선 Postgres 가 트리거 전에 "pending trigger events" 로 먼저 거부) · 열린 달은 INSERT·UPDATE·DELETE·다시 INSERT·보드 upsert 허용 · 열린 달 둘 거부.
- `supabase db advisors`(전체): WARN·ERROR 0. INFO 만 — 인덱스 없는 외래 키 42(2절에서 의도), 쓰이지 않은 인덱스 14(빈 DB), review_required 정책 없음 1(의도).
- 시험: `npm test` 621 통과(612 + 9), `npx tsc --noEmit` 통과.
- 남은 수동 작업: 화면이 Data API 로 읽을 때 대시보드 Data API 설정의 노출 스키마에 `api` 를 넣는다(지금은 public 만). `ledger` 는 넣지 않는다.

### 적재 기록 (2026-10-11, Phase A)

- 마이그레이션 `supabase/migrations/20261011103000_ledger_load.sql` 을 `supabase db push --db-url … --yes` 로 적용(`migration list` 원격 = 로컬 2개). 객체: 스키마 `ledger_admin`(USAGE 는 service_role 만), `stage_rows`(RLS 켬·정책 없음), RPC `begin_run`·`publish_run`·`export_table`·`record_files` + 도우미 `load_cols`·`pk_cols`·`insert_sql`(EXECUTE 는 service_role 만, anon·authenticated false 확인), 비공개 버킷 `ledger-raw`, `alter role authenticator set pgrst.db_schemas = 'public, graphql_public, api, ledger_admin'` + `notify pgrst`. `db advisors`: 문제 없음.
- 적재 `node tools/ledger/supabase-load.js --month 2026-10`: validate 오류 0 → 보드 = `data/board/ledger-board.json` → run 5 → 8묶음 스테이징 → 발행 한 번(areas 20,562 · stat_facts 16,320 · events 709 · units 426 · identifiers 358 · projects 350 · project_locations 332 · review_required 55 · sources 23 · complexes 22 · agencies 5 · 빈 5표 0 · board 1) → 원본 27개(gzip 1,034,198 B) Storage. 시간(ms): begin 595 · stage 2,539 · **publish 2,088**(8초 제한의 약 1/4, 한 트랜잭션) · Storage 3,781.
- 확인 `node tools/ledger/supabase-verify.js --month 2026-10`: 16표 왕복 행마다 깊은 같음, validate(DB 표) 오류 0, 저장 보드 = boardFromLedger(DB 표) = 파일, anon 이 api 뷰 17개 읽음·행 수 = 파일, 원천별 최근 발행 실행 하나, anon 의 ledger_admin RPC·stage_rows 쓰기 401(42501), api.projects INSERT 거부(55000 조인 뷰 갱신 불가 → HTTP 500), api.review_required 404.
- 멱등: 같은 파일로 다시 적재 → run 6 published · run 5 superseded, 행 수 같음, `ingest_runs.files`(sha256 포함) 같음, Storage 객체 27개 그대로, `stage_rows` 0, 2026-10 열림. `BEGIN … ROLLBACK` 안에서 `begin_run('2026-11')` → 2026-10 닫힘, 그 뒤 `begin_run('2026-10')` 거부(guard_months), `begin_run('2026-09')` 거부(months_one_open).

| 설계와 다른 점 | 이유 |
|---|---|
| 도구 이름 `supabase-load.js`·`supabase-verify.js`, 마이그레이션 `_ledger_load.sql` | 작업 지시의 이름 |
| `publish_run(p_run, p_expected)` — 표별 스테이징 행 수가 기대와 다르면 전체 취소. `begin_run` 이 같은 달 `staged` 로 남은 실행을 failed 로 돌리고 스테이징을 비움. `record_files` RPC 추가 | 묶음 일부만 올라간 실행이 발행되지 않게, 멈춘 적재의 찌꺼기 정리, `ledger` 는 노출하지 않으므로 files 기록에 RPC 가 필요 |
| `export_table` 은 쪽(기본 5,000행)을 jsonb 배열 하나로 돌려줌 | 스칼라 반환이라 Data API 1,000행 제한을 받지 않는다 |
| Storage 키: 한글·`[]` 이름은 `u-<base64url(이름)><확장자>`, 원래 경로는 `files.source` | Storage 가 ASCII 밖 키를 `InvalidKey` 로 거부(실측) |
| 기관 CSV 도 gzip, 경로는 실제 폴더 그대로(`agency/demo/…`·`agency/templates/…`), `snapshot/` 도 올림 | 한 규칙으로. 기관 입력 접수 구조는 아직 없다 |
| 같은 달 재적재는 `x-upsert: true` 로 덮어씀 | 적재 대상은 늘 열린 달(닫힌 달은 begin_run 이 거부)이라 지난 달 경로는 덮어쓰지 않는다는 규칙과 맞다 |
| `ingest_runs.started_at` = 실행 시작 시각(가장 이른 fetched_at 아님) | 수집 시각은 원천별로 `ingest_run_sources.collected_at` 에 남는다 |
