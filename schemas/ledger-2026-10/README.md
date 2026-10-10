# 사업 원장 2026-10 기준

2026-10 기준 사업 원장 한 벌이다. 원본·매핑·스냅샷·기준 표·기관 입력 양식이 들어 있다. `.vercelignore` 가 `schemas/` 를 빼므로 배포에는 실리지 않는다. 화면과 레지스트리(사업 77건)는 이 폴더로 바뀌지 않았다. 계획과 결정은 `docs/product/데이터-수집-계획.md`, 표 구조는 `docs/product/데이터셋-스키마.md` 에 있다.

## 하위 폴더

| 폴더 | 내용 | 원천·기준 |
|---|---|---|
| `raw/legal-dong/` | `국토교통부_법정동코드_20260929.csv` (CP949, CRLF, 2,471,662바이트) | 공공데이터포털 15123287, 2026-09-29 판. 53,387행(존재 20,560 · 폐지 32,827). 로그인 없이 받았다. 2026-07 광주·전남 통합 코드(12)를 포함한다 |
| `raw/lh-completion/` | 빈 폴더 | 포털 최신 판이 `한국토지주택공사_공공주택 준공예정현황_20260127` 로 저장소 판과 같다. 차기 등록 예정 2027-02-04 |
| `raw/hub/` | `<법정동10>.json` 4개 (1129013800 · 4145010800 · 4145011400 · 4145011500) | 건축HUB 주택인허가 기본개요(getHpBasisOulnInfo). 호출 10번에 레코드 844건. 인증키는 저장하지 않았다 |
| `mappings/` | `lh-block-sgg.json` | LH 준공예정 278 지구·블록의 시군구. 이름 일치 254 · 세종 규칙 7 · 시도 통합 규칙 7 · 개편 시군구 규칙 10 · 미해결 0. 법정동까지 255 |
| `snapshot/` | `hub-events.json` · `manifest.json` | 건축HUB 사업 55건(관리번호 58개) 대조, 209행 |
| `agency/` | `templates/` 양식 6종, `README.md`, `demo/` | 기관 입력 양식(UTF-8 BOM)과 '[가상]' 예시 CSV 6종·rows.json. 예시 행은 모두 is_demo 원천을 가리키며 기준 표에는 합치지 않았다 |
| `tables/` | 원장 16표 (6.1 MB, 한 행 한 줄 JSON) | 2026-10 기준. 검증 통과, 같은 입력이면 같은 결과 |

`tables/` 행 수: areas 20,562 · agencies 5 · policies 0 · programs 0 · links 0 · projects 350(발급 77 + LH 후보 273) · identifiers 358 · project_locations 332 · complexes 22 · events 709 · units 426 · notices 0 · notice_links 0 · stat_facts 16,320 · sources 23 · review_required 55.

## 만드는 순서

1. 법정동코드: 포털에서 받아 `raw/legal-dong/` 에 둔다(판마다 새 파일).
2. LH 매핑: `node tools/ledger/map-lh.js [--api]`
3. 건축HUB 스냅샷: `node tools/ledger/snapshot.js --month 2026-10 [--offline]` (온라인 실행은 한국시간 이번 달만 받는다)
4. 기준 표:

```
node tools/ledger/convert.js --month 2026-10 --lh-sgg schemas/ledger-2026-10/mappings/lh-block-sgg.json --hub-events schemas/ledger-2026-10/snapshot/hub-events.json --legal-dong "schemas/ledger-2026-10/raw/legal-dong/국토교통부_법정동코드_20260929.csv" --out schemas/ledger-2026-10/tables
```

기관 입력 가져오기: `node tools/ledger/import-agency.js --dir <폴더> --agency <id> --received YYYY-MM-DD [--demo] [--out <파일>]`

## 시험

`tests/js/legal-dong.test.cjs` · `lh-mapping.test.cjs` · `snapshot.test.cjs` · `agency-import.test.cjs` · `ledger.test.cjs` · `ledger-2026-10.test.cjs`

## 한계

- LH 후보 273건의 id 는 발급 전 임시값이다. 발급은 따로 승인받는다.
- LH 파일 기준일 2026-01-27 이후 준공 여부를 알 기록이 없다. 새 판(2027-02 예정) 전에는 LH 예정일 경과를 지연으로 보이지 않는다.
- import-agency 의 base 는 LH 후보가 없는 변환 결과다. LH 후보가 있는 시군구에 새 사업을 넣을 때는 기준 표를 base 로 써야 번호가 겹치지 않는다.
- 기관 입력 스키마의 빈 곳: 기관을 가리키는 source_owner·id_issuer 값이 없다(임시로 'AGENCY'·'HOUSING_WAVE'). 같은 입력을 다시 보내면 계획 물량 행이 겹친다(원천이 같은 것 중 최신 묶음만 쓰는 규칙이 필요하다).
