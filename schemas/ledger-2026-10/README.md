# 사업 원장 2026-10 기준

2026-10 기준 사업 원장 한 벌이다. 원본·매핑·스냅샷·기준 표·기관 입력 양식이 들어 있다. `.vercelignore` 가 `schemas/` 를 빼므로 배포에는 실리지 않는다. 화면과 레지스트리(사업 77건)는 이 폴더로 바뀌지 않았다. 계획과 결정은 `docs/product/데이터-수집-계획.md`, 표 구조는 `docs/product/데이터셋-스키마.md` 에 있다.

## 하위 폴더

| 폴더 | 내용 | 원천·기준 |
|---|---|---|
| `raw/legal-dong/` | `국토교통부_법정동코드_20260929.csv` (CP949, CRLF, 2,471,662바이트) | 공공데이터포털 15123287, 2026-09-29 판. 53,387행(존재 20,560 · 폐지 32,827). 로그인 없이 받았다. 2026-07 광주·전남 통합 코드(12)를 포함한다 |
| `raw/lh-completion/` | 빈 폴더 | 포털 최신 판이 `한국토지주택공사_공공주택 준공예정현황_20260127` 로 저장소 판과 같다. 차기 등록 예정 2027-02-04 |
| `raw/hub/` | `<법정동10>.json` 4개 (1129013800 · 4145010800 · 4145011400 · 4145011500) | 건축HUB 주택인허가 기본개요(getHpBasisOulnInfo). 호출 10번에 레코드 844건. 인증키는 저장하지 않았다 |
| `raw/hub-bulk/` | 주택인허가 기본개요·행위개요·대지위치 zip 3개 + `manifest.json`(열 이름) | 건축HUB 대용량 제공 서비스, 2026-08 데이터(2026-09 제공). 전국 기본개요 377,256행. 읽기 전용 |
| `raw/hub-bulk-history/` | 기본개요 과거 월 판 `basic-YYYY-MM.zip` 19개(2025-01~2026-07) + `manifest.json` | 같은 서비스의 과거 판. 월 판정 이력 소급용(`tools/ledger/trend.js`). 2025-10 판은 2025-09 판과 내용이 같다. 읽기 전용 |
| `raw/myhome/` · `raw/lh-notice/` · `raw/move-in/` | 마이홈 공공주택 모집공고(임대·분양 363행 · 공고 117) · LH 분양임대공고문 4,985건 + 공급정보 2,825행 · 한국부동산원 입주예정물량 703행, 폴더마다 `manifest.json` | `tools/ledger/collect-national.js`(공고, 2026-10-11) · 공공데이터포털 파일 15111714(입주예정, 기준 2026-06-30). 읽기 전용 |
| `mappings/` | `lh-block-sgg.json` · `hub-candidate-ids.json` | LH 준공예정 278 지구·블록의 시군구(이름 일치 254 · 세종 규칙 7 · 시도 통합 규칙 7 · 개편 시군구 규칙 10 · 미해결 0, 법정동까지 255). 건축HUB 대용량 후보의 관리번호 → 사업 id(관리번호 13,588개, 더하기만 하고 지우지 않는다 — 장기 미갱신으로 빠진 관리번호의 id 도 남는다. 지금 사업은 3,495개) |
| `snapshot/` | `hub-events.json` · `manifest.json` · `hub-bulk-2026-08.json` · `hub-bulk-2026-08.manifest.json` · `stage-2026-08.json` · `stage-2026-08.manifest.json` | 건축HUB 사업 55건(관리번호 58개) 대조, 209행. 건축HUB 대용량 중간 스냅샷: 범위 안 진행 중 기록 4,103개(2.0 MB, 한 기록 한 줄)와 거르기 건수·날짜 정리 건수·zip 해시. 단계별 원천 중간 스냅샷(`tools/ledger/stage-snapshot.js`, 8.3 MB): 원장 사업 필지·법정동에 걸리는 건축물대장 6,227 · 부동산원 단지 777 · K-apt 2,032 · 마이홈 단지 121과 청약홈 6,096 · HUG 9,700 · LH 공고 상세 단지 8,841 |
| `raw/` 단계별 전국 원천(2026-10-12) | `vworld-district/` · `hub-bulk-ap/` · `hub-bulk-bld/` · `applyhome/` · `applyhome-cmpet/` · `hug-sale-history/` · `hug-guarantee/` · `lh-notice-detail/` · `sejong-completion/` · `reb-complex-id/` · `molit-complex-file/` · `kapt-list/` · `myhome-complex/` · `lh-lease-complex/` · `lh-rental-complex/` · `jigu-file/`(점검 중, 기록만) | 6단계별 원본(원장 표에는 아직 넣지 않음). 단계·규모·필드·다시 받기는 `docs/product/단계별-원천-수집.md` |
| `agency/` | `templates/` 양식 6종, `README.md`, `demo/` | 기관 입력 양식(UTF-8 BOM)과 '[가상]' 예시 CSV 6종·rows.json. 예시 행은 모두 is_demo 원천을 가리키며 기준 표에는 합치지 않았다 |
| `tables/` | 원장 16표 (15 MB, 한 행 한 줄 JSON, 가장 큰 events 5.1 MB) | 2026-10 기준. 검증 통과, 같은 입력이면 같은 결과 |

`tables/` 행 수(2026-10-13 단계별 원천 반영, 같은 날 단계 올리기 뒤에도 같다 — 바뀐 것은 projects.stage_code 729행: 03 2,212 · 04 220 · 05 669 · 06 744): areas 20,562 · agencies 5 · policies 0 · programs 0 · links 0 · projects 3,845(발급 77 + LH 후보 273 + 건축HUB 대용량 후보 3,495) · identifiers 5,936(+ 건축물대장 792 · 부동산원 219 · K-apt 370 · 마이홈 104) · project_locations 3,861 · complexes 22 · events 16,203(실제 6,754 · 예정 8,861 · 추정 588) · units 4,012 · notices 20,791(LH 4,987 · 마이홈 8 · 청약홈 6,096 · HUG 9,700) · notice_links 2,501 · stat_facts 16,320 · sources 34 · review_required 96(공공 여부 미확인 55 · 시군구 미해결 5 · 연결 후보 20(LH↔건축HUB 6 · 공고 T3 8 · 건축물대장 키 중복 6) · 중복 사업 후보 16). 단계별 원천의 규칙·효과는 `docs/product/단계별-원천-수집.md` 5절.

## 건축HUB 대용량(전국, 2026-08 데이터)

- 거르기(기록 = 관리번호): 377,256 → 사업승인일 없음·오염 951 · 총세대수 0 348,582 · 철거·멸실 표시 0(열이 모두 비어 있다) · 2025-01 전 사용검사 13,764 · 장기 미갱신 9,856 → **4,103**(2,579,621세대). 날짜는 달력에 있는 1990-01-01~2040-12-31 의 YYYYMMDD 만 받는다(열별 오염 건수는 중간 스냅샷 manifest 의 dates).
- 진행 중 규칙(2026-10-10 결정, 기준일 2026-10-10, `hub-bulk.js`): 넷 중 하나라도 맞으면 남긴다 — d 사용검사일 ≥ 2025-01-01 · a 사업승인일 ≥ 2021-10-01(주택법 제16조 착공 의무 5년) · b 착공일 ≥ 2018-01-01 · c 사용검사 예정일 ≥ 2025-01-01 이고 승인일 ≥ 2015-01-01. 근거(처음 맞는 것, d·a·b·c 순) d 630 · a 2,912 · b 70 · c 491. 착공·준공 기록 없는 옛 허가(2010년 전 허가만 6,727건·450만 세대)가 ②인허가·지연을 부풀리던 것을 뺐다.
- 묶기: `lib/permits.js` 처럼 필지(PNU) · 블록 단위 허가(법정동 + 블록) · 그 밖은 관리번호 하나. 시군구는 법정동코드 파일의 존재 행이고, 옛 코드(인천 서구·중구, 광주·전남, 강원·전북, 고양 일산구 등)는 폐지 행 이름으로 지금 코드에 잇는다. 못 이은 223건(시군구 빈칸 199 포함)은 검토 목록.
- 4,098 기록 → 3,598 묶음 → 레지스트리와 겹침 7(식별자만 붙임) · LH 후보에 붙임 96묶음(LH 후보 91 + 레지스트리 계양 블록 3, 계양은 식별자만) · 후보 **3,495**(모두 매핑의 id, 새 id 0). LH 블록 둘 이상에 맞는 3묶음은 따로 싣고 LINK_CANDIDATE 로 남겼다.
- 위치는 대표 필지만 싣는다(대지위치 전체는 남긴 관리번호만 26만 행이라 싣지 않았다). 실제일은 `lib/permits.js` 의 의심 값(자료 기준일 2026-08-31 뒤, 한 기록 안 순서 모순)을 빼고 고른다.
- 후보 id: `mappings/hub-candidate-ids.json` 의 id 를 먼저 쓰고, 새 묶음만 시군구마다 레지스트리 카운터·LH 후보·매핑 중 가장 큰 번호 다음을 준다. 다음 달에도 이 파일을 이어 쓴다.

## 전국 모집공고·입주예정(`convert.js --national raw`)

- 공고(notices 4,993): LH 목록 4,985 + 마이홈만 있는 공고 8(지방공사). 마이홈 공고 링크의 panId 가 LH PAN_ID 와 같은 107건은 한 공고로 합쳐 (LH, PAN_ID) 로 싣고 값(제목·날짜·시군구·필지)과 source_ref 는 마이홈이다. LH 목록만 있는 공고는 지역이 시도뿐이라 시군구·필지가 없다. 원천 `myhome-hwspr02`·`datagokr-15058530`.
- 연결(notice_links 362, 공고 280 · 사업 130 — 2026-10-13 접두 충돌 수정 뒤, 규칙 `tools/ledger/notice-link.js`, evidence 에 규칙 이름과 대조한 글자): M1_PNU 마이홈 필지 = 사업 위치 필지 10 · T1_LH_DISTRICT_BLOCK 제목(또는 공급정보·마이홈 단지명) 블록 = LH 준공예정 블록 + LH 지구 낱말이 제목에 200 · T2_NAME_DISTRICT_BLOCK 제목 블록 = 사업 블록 + 제목 지구 낱말이 사업 이름·단지명·특수지명에(주소는 안 봄) 152. T1·T2 는 시도 일치. 블록만·법정동/본번만 같은 것은 잇지 않는다. 자동 연결이라 REVIEW_REQUIRED. 취소공고는 잇지 않는다.
- 검토 목록: T3(지구 낱말에서 '인천영종 → 영종' 같은 시·시도 줄임말을 떼야 맞음) 8건은 잇지 않고 LINK_CANDIDATE(원천 = 공고), 같은 공고의 같은 블록에 자동 연결된 두 사업 16쌍은 DUPLICATE_CANDIDATE(LH 후보·발급 사업 ↔ 건축HUB 대용량 후보 15, 대용량끼리 1, 시군구가 다른 3쌍은 detail 에 적음). 병합하지 않는다.
- SUPPLY_NOTICE(129, 사업 106): 최초 입주자모집 공고만, 정정·재공고(앞머리 [정정공고]·(재게시)·날짜·회차를 지운 제목) 묶음마다 하나 — 날짜는 묶음의 가장 이른 공고일(실제), 접수 기간·정정 공고는 event_detail. 잔여세대·추가·예비입주자·선착순·매각 공고와 가정어린이집·오피스텔 등 비공급 공고는 연결만 둔다. 종합상황판 ④모집이 이 이벤트를 쓴다.
- 기관: 연결된 건축HUB 후보 중 기관이 빈 34건을 공급기관(LH)으로 채우고 public_scope PUBLIC, 근거(공고·규칙)는 public_basis. 이름만 같은 후보 공고 8건은 잇지 않았다.
- 입주예정(MOVE_IN 예정 370, 원천 `datagokr-15111714`, 기준 2026-06-30): 703행 = 월 오류(2027-00) 2 · 주소 실패 80(본번 0 등 77 · 행정동·읍면 빠짐 3) · 맞는 사업 없음 250 · 필지 일치 371. 지번 주소는 법정동코드 이름(옛 시도 이름·개편 구 포함)으로 PNU 를 만든다(`map-lh.js jibunToPnu`). 사업은 만들지 않는다.

## 만드는 순서

1. 법정동코드: 포털에서 받아 `raw/legal-dong/` 에 둔다(판마다 새 파일).
2. LH 매핑: `node tools/ledger/map-lh.js [--api]`
3. 건축HUB 스냅샷: `node tools/ledger/snapshot.js --month 2026-10 [--offline]` (온라인 실행은 한국시간 이번 달만 받는다)
4. 건축HUB 대용량 중간 스냅샷: `node tools/ledger/hub-bulk.js` (zip 3개를 시스템 unzip 으로 읽는다, 약 2초)
4-1. 단계별 원천 중간 스냅샷(수동 — 원본 API 자료가 CI 에 없어 월 갱신에 넣지 않는다): `node tools/ledger/stage-snapshot.js` → `snapshot/stage-<대용량 판>.json`(약 1분). 그 달 폴더에 있으면 월 갱신(`monthly.js`)이 `--stage` 로 넘긴다
5. 기준 표(검증을 통과하면 `--hub-ids` 파일에 새 후보 id 를 더한다. `--stage` 가 없으면 단계별 원천 없이 전과 같은 표. `--hub-bulk` 는 열린 달 API 덮어쓰기(`snapshot/hub-refresh.json`, monthly.js --refresh)가 있으면 그것, 없으면 `snapshot/hub-bulk-<판>.json` — 지금 저장된 표는 hub-refresh.json 으로 만들었다. 변환의 마지막에 사업 단계를 실제 이벤트로 올린다(`raiseStages`)):

```
node tools/ledger/convert.js --month 2026-10 --lh-sgg schemas/ledger-2026-10/mappings/lh-block-sgg.json --hub-events schemas/ledger-2026-10/snapshot/hub-events.json --legal-dong "schemas/ledger-2026-10/raw/legal-dong/국토교통부_법정동코드_20260929.csv" --hub-bulk schemas/ledger-2026-10/snapshot/hub-refresh.json --hub-ids schemas/ledger-2026-10/mappings/hub-candidate-ids.json --national schemas/ledger-2026-10/raw --stage schemas/ledger-2026-10/snapshot/stage-2026-08.json --home schemas/ledger-2026-10/raw/home/20261013T140241Z --home-ids schemas/ledger-2026-10/mappings/home-ids.json --out schemas/ledger-2026-10/tables
```

5-1. 수도권 HOME 덤프(2026-10-14, `tools/ledger/home-source.js`): `--home` 판의 서울·인천·경기 사업이 기존 원천 행을 대신한다(id 는 `mappings/home-ids.json` 누적). 새 판이면 위 명령 → `node scripts/issue-projects.js --home --month 2026-10`(레지스트리 발급·옛 수도권 사업 대체·숨김, 근거 `mappings/home-registry-match.json`) → 위 명령을 한 번 더(발급일·대체가 원장에 실린다). 원본 jsonl.gz 는 저장소에 없다(Storage).
6. 월 판정 이력(소급): `node tools/ledger/trend.js` → `data/board/judgment-history.json`(2025-01~2026-09, 약 20초). 다음 달로 넘어갈 때는 새 원장 전에 `node tools/ledger/trend.js --close` 로 이번 달 판정을 관측 행으로 붙인다.
7. 종합상황판 집계·지도 색인: `node tools/ledger/board.js` → `data/board/ledger-board.json`(이력이 있으면 trend 포함)과 `data/board/ledger-map.json`(시군구마다 사업 단계·판정·다음 일정, 한 사업 한 줄, 판정 합계 = 보드)
8. Supabase 적재·확인: `node tools/ledger/supabase-load.js --month 2026-10 [--dry-run] [--skip-raw]` → `node tools/ledger/supabase-verify.js --month 2026-10`. DB 쪽(실행 기록·스테이징·발행·지도)은 `SUPABASE_DB_URL` 로 직접 연결(pg, 시간 제한 120s, 2026-10-11), 원본 업로드·verify 는 secret 키 REST. 다른 곳(GitHub Actions 등)에서 돌릴 때 필요한 환경변수: `SUPABASE_DB_URL`·`SUPABASE_SECRET_KEY`·`NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`(verify 의 anon 점검), 선택 `BOARD_REVALIDATE_URL`·`REVALIDATE_SECRET`.

### 월 갱신 자동화(수집 PR → 사람 확인 → 합치면 적재)

- 위 3~7을 한 번에: `node tools/ledger/monthly.js [--month YYYY-MM] [--dry-run]`(기본 한국시간 이번 달). 새 판·새 달이 아니면 '새 자료 없음'으로 아무것도 바꾸지 않는다. 새 달이면 `schemas/ledger-<달>/` 을 만들고 이 폴더의 정적 입력(법정동·LH 준공예정·입주예정·과거 판·매핑·기관 양식)을 복사한다. 같은 달 새 판이면 이 폴더를 고치고 밀려난 기본개요를 `raw/hub-bulk-history/basic-<판>.zip` 으로 옮긴다. Supabase 에는 쓰지 않는다.
- `hub-bulk.js`·`trend.js`·`board.js` 는 `--month` 를 받는다(기본 가장 늦은 원장 폴더). 대용량 판은 `raw/hub-bulk/manifest.json`, 기준일은 달 폴더 `manifest.json` 의 `reference_date`(이 폴더는 없어 2026-10-10).
- GitHub Actions: `ledger-collect.yml`(매달 21~25일, PR 생성) → 사람이 합침 → `ledger-load.yml`(8단계 적재·확인·캐시 비우기). 과거 판 zip 은 git 이 무시하므로 `tools/ledger/raw-store.js pull|push` 로 Storage `ledger-raw/<달>/hub-bulk-history/` 와 주고받는다.
- 비밀값 이름: `SUPABASE_DB_URL` · `SUPABASE_SECRET_KEY` · `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` · `DATA_GO_KR_KEY` · `REVALIDATE_SECRET` · `BOARD_REVALIDATE_URL`(없으면 잡은 건너뛴다).
- 수동으로 남는 것: 통계누리(`data/board/molit.json`), 입주예정 새 파일(반기), LH 준공예정 새 판(2027-02), 법정동코드 새 판(연 1회). 자세히는 `docs/product/데이터-수집-계획.md` 8-1절.

기관 입력 가져오기: `node tools/ledger/import-agency.js --dir <폴더> --agency <id> --received YYYY-MM-DD [--demo] [--out <파일>]`

## 시험

`tests/js/legal-dong.test.cjs` · `lh-mapping.test.cjs` · `snapshot.test.cjs` · `agency-import.test.cjs` · `ledger.test.cjs` · `ledger-2026-10.test.cjs` · `hub-bulk.test.cjs` · `ledger-board.test.cjs` · `trend.test.cjs` · `monthly.test.cjs` · `notice-link.test.cjs` · `stage-link.test.cjs`

## 한계

- LH 후보 273건의 id 는 발급 전 임시값이다. 발급은 따로 승인받는다. LH 후보 id 는 아직 매핑 파일 없이 레지스트리 카운터 다음 번호로 계산하므로, LH 새 판에서 블록이 늘면 건축HUB 후보 id 와 겹칠 수 있다(검증의 사업 id 중복으로 드러난다).
- 진행 중 규칙 뒤에도 판정 3,537건 중 지연이 2,090건이다. 건축HUB 후보 지연 2,083건의 근거는 a(승인 5년 안) 1,707 · c 322 · b 51 등이고 대부분(2,029) 착공 예정일이 지났는데 착공 기록이 없는 것이다. 착공일은 범위 안 기록의 약 7%만 채워져 있어 착공한 사업 다수가 ②인허가·지연으로 잡힌다.
- 단계별 원천(2026-10-13): stage-link 는 행을 더하기만 하고, 사업 단계는 변환 마지막의 단계 올리기(실제 인허가·착공·모집공고·준공, 원천 무관)가 올린다 — 올린 사업 729, 그 바람에 착공 예정 경과가 판정에서 빠진 발급 사업 2(장위10·장위6구역), 판정에서 뺀 대용량 후보 착공 예정 경과 2,361 → 1,797. 착공 추정(ESTIMATED 588)은 판정·단계에 쓰지 않는다. 판정 이력의 소급 달은 단계별 원천을 쓰지 않아 2026-09 → 2026-10 사이 지연이 줄어든 것(511 → 466) 일부는 원천이 늘어난 몫이다 — 보드 trend 의 2026-10 행에 `addedSources`(건축물대장 · 청약홈 · HUG · LH 공고 상세)로 표지한다. 입주예정은 부동산원 → LH 공고 상세 → 청약홈 순으로 고른다(원천 사이 달이 다른 33사업 중 지난 달을 고른 것 15 → 7). 같은 원천 안에 달이 여럿이면(청약홈 공고마다 다른 입주예정월) 가장 이른 달이 남는다.
- 행위개요 zip 의 관리번호는 기본개요와 하나도 겹치지 않아 단지명(complex)이 늘 비어 있다.
- 중복 가능: LH 후보 중 건축HUB 후보와 시군구·블록이 같은데 지구 이름이 안 맞아 잇지 않은 것 26블록(LH 15,680호), 지역 번들 사업(광주선운2 A-1·A-3 등)과 건축HUB 후보는 대조하지 않았다.
- LH 파일 기준일 2026-01-27 이후 준공 여부를 알 기록이 없다. 새 판(2027-02 예정) 전에는 LH 예정일 경과를 지연으로 보이지 않는다.
- import-agency 의 base 는 LH 후보가 없는 변환 결과다. LH 후보가 있는 시군구에 새 사업을 넣을 때는 기준 표를 base 로 써야 번호가 겹치지 않는다.
- 기관 입력 스키마의 빈 곳: 기관을 가리키는 source_owner·id_issuer 값이 없다(임시로 'AGENCY'·'HOUSING_WAVE'). 같은 입력을 다시 보내면 계획 물량 행이 겹친다(원천이 같은 것 중 최신 묶음만 쓰는 규칙이 필요하다).
