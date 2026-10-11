# 사업 원장 2026-10 기준

2026-10 기준 사업 원장 한 벌이다. 원본·매핑·스냅샷·기준 표·기관 입력 양식이 들어 있다. `.vercelignore` 가 `schemas/` 를 빼므로 배포에는 실리지 않는다. 화면과 레지스트리(사업 77건)는 이 폴더로 바뀌지 않았다. 계획과 결정은 `docs/product/데이터-수집-계획.md`, 표 구조는 `docs/product/데이터셋-스키마.md` 에 있다.

## 하위 폴더

| 폴더 | 내용 | 원천·기준 |
|---|---|---|
| `raw/legal-dong/` | `국토교통부_법정동코드_20260929.csv` (CP949, CRLF, 2,471,662바이트) | 공공데이터포털 15123287, 2026-09-29 판. 53,387행(존재 20,560 · 폐지 32,827). 로그인 없이 받았다. 2026-07 광주·전남 통합 코드(12)를 포함한다 |
| `raw/lh-completion/` | 빈 폴더 | 포털 최신 판이 `한국토지주택공사_공공주택 준공예정현황_20260127` 로 저장소 판과 같다. 차기 등록 예정 2027-02-04 |
| `raw/hub/` | `<법정동10>.json` 4개 (1129013800 · 4145010800 · 4145011400 · 4145011500) | 건축HUB 주택인허가 기본개요(getHpBasisOulnInfo). 호출 10번에 레코드 844건. 인증키는 저장하지 않았다 |
| `raw/hub-bulk/` | 주택인허가 기본개요·행위개요·대지위치 zip 3개 + `manifest.json`(열 이름) | 건축HUB 대용량 제공 서비스, 2026-08 데이터(2026-09 제공). 전국 기본개요 377,256행. 읽기 전용 |
| `raw/myhome/` · `raw/lh-notice/` · `raw/move-in/` | 마이홈 공공주택 모집공고(임대·분양 363행 · 공고 117) · LH 분양임대공고문 4,985건 + 공급정보 2,825행 · 한국부동산원 입주예정물량 703행, 폴더마다 `manifest.json` | `tools/ledger/collect-national.js`(공고, 2026-10-11) · 공공데이터포털 파일 15111714(입주예정, 기준 2026-06-30). 읽기 전용 |
| `mappings/` | `lh-block-sgg.json` · `hub-candidate-ids.json` | LH 준공예정 278 지구·블록의 시군구(이름 일치 254 · 세종 규칙 7 · 시도 통합 규칙 7 · 개편 시군구 규칙 10 · 미해결 0, 법정동까지 255). 건축HUB 대용량 후보의 관리번호 → 사업 id(관리번호 13,588개, 더하기만 하고 지우지 않는다 — 장기 미갱신으로 빠진 관리번호의 id 도 남는다. 지금 사업은 3,495개) |
| `snapshot/` | `hub-events.json` · `manifest.json` · `hub-bulk-2026-08.json` · `hub-bulk-2026-08.manifest.json` | 건축HUB 사업 55건(관리번호 58개) 대조, 209행. 건축HUB 대용량 중간 스냅샷: 범위 안 진행 중 기록 4,103개(2.0 MB, 한 기록 한 줄)와 거르기 건수·날짜 정리 건수·zip 해시 |
| `agency/` | `templates/` 양식 6종, `README.md`, `demo/` | 기관 입력 양식(UTF-8 BOM)과 '[가상]' 예시 CSV 6종·rows.json. 예시 행은 모두 is_demo 원천을 가리키며 기준 표에는 합치지 않았다 |
| `tables/` | 원장 16표 (15 MB, 한 행 한 줄 JSON, 가장 큰 events 5.1 MB) | 2026-10 기준. 검증 통과, 같은 입력이면 같은 결과 |

`tables/` 행 수: areas 20,562 · agencies 5 · policies 0 · programs 0 · links 0 · projects 3,845(발급 77 + LH 후보 273 + 건축HUB 대용량 후보 3,495) · identifiers 4,451 · project_locations 3,861 · complexes 22 · events 13,001 · units 4,012 · notices 4,993 · notice_links 10 · stat_facts 16,320 · sources 27 · review_required 66(공공 여부 미확인 55 · 시군구 미해결 5 · LH 연결 후보 6).

## 건축HUB 대용량(전국, 2026-08 데이터)

- 거르기(기록 = 관리번호): 377,256 → 사업승인일 없음·오염 951 · 총세대수 0 348,582 · 철거·멸실 표시 0(열이 모두 비어 있다) · 2025-01 전 사용검사 13,764 · 장기 미갱신 9,856 → **4,103**(2,579,621세대). 날짜는 달력에 있는 1990-01-01~2040-12-31 의 YYYYMMDD 만 받는다(열별 오염 건수는 중간 스냅샷 manifest 의 dates).
- 진행 중 규칙(2026-10-10 결정, 기준일 2026-10-10, `hub-bulk.js`): 넷 중 하나라도 맞으면 남긴다 — d 사용검사일 ≥ 2025-01-01 · a 사업승인일 ≥ 2021-10-01(주택법 제16조 착공 의무 5년) · b 착공일 ≥ 2018-01-01 · c 사용검사 예정일 ≥ 2025-01-01 이고 승인일 ≥ 2015-01-01. 근거(처음 맞는 것, d·a·b·c 순) d 630 · a 2,912 · b 70 · c 491. 착공·준공 기록 없는 옛 허가(2010년 전 허가만 6,727건·450만 세대)가 ②인허가·지연을 부풀리던 것을 뺐다.
- 묶기: `lib/permits.js` 처럼 필지(PNU) · 블록 단위 허가(법정동 + 블록) · 그 밖은 관리번호 하나. 시군구는 법정동코드 파일의 존재 행이고, 옛 코드(인천 서구·중구, 광주·전남, 강원·전북, 고양 일산구 등)는 폐지 행 이름으로 지금 코드에 잇는다. 못 이은 223건(시군구 빈칸 199 포함)은 검토 목록.
- 4,098 기록 → 3,598 묶음 → 레지스트리와 겹침 7(식별자만 붙임) · LH 후보에 붙임 96묶음(LH 후보 91 + 레지스트리 계양 블록 3, 계양은 식별자만) · 후보 **3,495**(모두 매핑의 id, 새 id 0). LH 블록 둘 이상에 맞는 3묶음은 따로 싣고 LINK_CANDIDATE 로 남겼다.
- 위치는 대표 필지만 싣는다(대지위치 전체는 남긴 관리번호만 26만 행이라 싣지 않았다). 실제일은 `lib/permits.js` 의 의심 값(자료 기준일 2026-08-31 뒤, 한 기록 안 순서 모순)을 빼고 고른다.
- 후보 id: `mappings/hub-candidate-ids.json` 의 id 를 먼저 쓰고, 새 묶음만 시군구마다 레지스트리 카운터·LH 후보·매핑 중 가장 큰 번호 다음을 준다. 다음 달에도 이 파일을 이어 쓴다.

## 전국 모집공고·입주예정(`convert.js --national raw`)

- 공고(notices 4,993): LH 목록 4,985 + 마이홈만 있는 공고 8(지방공사). 마이홈 공고 링크의 panId 가 LH PAN_ID 와 같은 107건은 한 공고로 합쳐 (LH, PAN_ID) 로 싣고 값(제목·날짜·시군구·필지)과 source_ref 는 마이홈이다. LH 목록만 있는 공고는 지역이 시도뿐이라 시군구·필지가 없다. 원천 `myhome-hwspr02`·`datagokr-15058530`.
- 연결(notice_links 10, 공고 8 · 사업 8): 마이홈 행의 19자리 필지가 사업 위치 필지(레지스트리·LH 후보에 붙은 건축HUB·건축HUB 후보 대표 필지)와 같을 때만. 자동 연결이라 REVIEW_REQUIRED. 이름만 같은 후보 공고 12건은 잇지 않았다. 연결마다 SUPPLY_NOTICE(실제, 공고일, 접수 기간은 event_detail) — 종합상황판 ④모집이 이 이벤트를 쓴다.
- 기관: 연결된 건축HUB 후보 중 기관이 빈 3건을 공급기관(LH)으로 채우고 public_scope PUBLIC, 근거는 public_basis.
- 입주예정(MOVE_IN 예정 370, 원천 `datagokr-15111714`, 기준 2026-06-30): 703행 = 월 오류(2027-00) 2 · 주소 실패 80(본번 0 등 77 · 행정동·읍면 빠짐 3) · 맞는 사업 없음 250 · 필지 일치 371. 지번 주소는 법정동코드 이름(옛 시도 이름·개편 구 포함)으로 PNU 를 만든다(`map-lh.js jibunToPnu`). 사업은 만들지 않는다.

## 만드는 순서

1. 법정동코드: 포털에서 받아 `raw/legal-dong/` 에 둔다(판마다 새 파일).
2. LH 매핑: `node tools/ledger/map-lh.js [--api]`
3. 건축HUB 스냅샷: `node tools/ledger/snapshot.js --month 2026-10 [--offline]` (온라인 실행은 한국시간 이번 달만 받는다)
4. 건축HUB 대용량 중간 스냅샷: `node tools/ledger/hub-bulk.js` (zip 3개를 시스템 unzip 으로 읽는다, 약 2초)
5. 기준 표(검증을 통과하면 `--hub-ids` 파일에 새 후보 id 를 더한다):

```
node tools/ledger/convert.js --month 2026-10 --lh-sgg schemas/ledger-2026-10/mappings/lh-block-sgg.json --hub-events schemas/ledger-2026-10/snapshot/hub-events.json --legal-dong "schemas/ledger-2026-10/raw/legal-dong/국토교통부_법정동코드_20260929.csv" --hub-bulk schemas/ledger-2026-10/snapshot/hub-bulk-2026-08.json --hub-ids schemas/ledger-2026-10/mappings/hub-candidate-ids.json --national schemas/ledger-2026-10/raw --out schemas/ledger-2026-10/tables
```

6. 종합상황판 집계: `node tools/ledger/board.js` → `data/board/ledger-board.json`

기관 입력 가져오기: `node tools/ledger/import-agency.js --dir <폴더> --agency <id> --received YYYY-MM-DD [--demo] [--out <파일>]`

## 시험

`tests/js/legal-dong.test.cjs` · `lh-mapping.test.cjs` · `snapshot.test.cjs` · `agency-import.test.cjs` · `ledger.test.cjs` · `ledger-2026-10.test.cjs` · `hub-bulk.test.cjs` · `ledger-board.test.cjs`

## 한계

- LH 후보 273건의 id 는 발급 전 임시값이다. 발급은 따로 승인받는다. LH 후보 id 는 아직 매핑 파일 없이 레지스트리 카운터 다음 번호로 계산하므로, LH 새 판에서 블록이 늘면 건축HUB 후보 id 와 겹칠 수 있다(검증의 사업 id 중복으로 드러난다).
- 진행 중 규칙 뒤에도 판정 3,537건 중 지연이 2,090건이다. 건축HUB 후보 지연 2,083건의 근거는 a(승인 5년 안) 1,707 · c 322 · b 51 등이고 대부분(2,029) 착공 예정일이 지났는데 착공 기록이 없는 것이다. 착공일은 범위 안 기록의 약 7%만 채워져 있어 착공한 사업 다수가 ②인허가·지연으로 잡힌다.
- 행위개요 zip 의 관리번호는 기본개요와 하나도 겹치지 않아 단지명(complex)이 늘 비어 있다.
- 중복 가능: LH 후보 중 건축HUB 후보와 시군구·블록이 같은데 지구 이름이 안 맞아 잇지 않은 것 26블록(LH 15,680호), 지역 번들 사업(광주선운2 A-1·A-3 등)과 건축HUB 후보는 대조하지 않았다.
- LH 파일 기준일 2026-01-27 이후 준공 여부를 알 기록이 없다. 새 판(2027-02 예정) 전에는 LH 예정일 경과를 지연으로 보이지 않는다.
- import-agency 의 base 는 LH 후보가 없는 변환 결과다. LH 후보가 있는 시군구에 새 사업을 넣을 때는 기준 표를 base 로 써야 번호가 겹치지 않는다.
- 기관 입력 스키마의 빈 곳: 기관을 가리키는 source_owner·id_issuer 값이 없다(임시로 'AGENCY'·'HOUSING_WAVE'). 같은 입력을 다시 보내면 계획 물량 행이 겹친다(원천이 같은 것 중 최신 묶음만 쓰는 규칙이 필요하다).
