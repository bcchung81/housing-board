# HOME JSON 반영 계획

작성일 2026-11-09(같은 날 검증·개정). HOME(the주택) 팀이 2026-10-22 이후 자료를 JSON 슬라이스로 주면, 명령 한 번으로 우리 원장(Supabase)과 화면 수치를 HOME 과 같게 맞춘다. 지금까지는 pg_dump zip(1.9GB)을 받아 `HOME-재덤프-이관-핸드오프.md` 의 13단계를 손으로 돌렸다. 처음 검토한 수신 API 안은 사용자 지시로 접었다.

## 1. 사용자 결정(2026-11-09)

| 항목 | 결정 |
|---|---|
| 전달 | HOME 팀이 JSON 묶음(zip)을 준다. API 는 만들지 않는다 |
| 형식 | **HOME 원천 슬라이스**: 지난 이관에서 실제로 반영된 HOME 항목·칸만, 표별 JSON + manifest. 우리 원장 표 모양이 아니다(규칙은 우리 변환기가 적용) |
| 범위 | 2026-10-22 이후 변경분. 첫 묶음 since `2026-10-22 00:00 KST`, 기준 판 `20261022T133544Z`(10-22 22:35) |
| 실행 | 받은 폴더로 명령 한 번: `node tools/ledger/home-apply.js --in <폴더>` |
| 운영 반영 | 멈춤 조건이 없고 HOME 정답 대조 차이가 0 이면 운영 적재·배포까지 자동 |
| 원장 달 | 11월 판은 2026-11 새 달을 연다(2026-10 이 닫히고 되돌릴 수 없다) |

가정(반대하면 바꾼다): 그 뒤에도 묶음 스냅샷 달(한국시간)이 열린 달보다 늦고 한국시간 이번 달이면 자동으로 새 달을 연다.

## 2. 슬라이스 형식 — 요약

정본은 `HOME-데이터셋-슬라이스-명세.md`, 기계가 읽는 정의는 `schemas/home-slices/`(slices.json·manifest.schema.json·template/) 다.

```text
manifest.json          format·since·until·files{rows,sha256}·current{kind:{count,digest}}·removed
slices/<이름>.json     HOME 원천 행 중 우리가 쓰는 칸만
api/<이름>.json        until 시점 HOME API 응답(생성기 입력 + 정답 대조 입력)
web/<이름>.js          until 시점 HOME 프런트 계산 JS(정답 값 계산용)
```

- **kind 슬라이스**(`home_revision`): `since < recorded_at` 이고 until 시점 현재 판인 행. 06:23→22:35 실측에서 바뀐 행은 모두 `revision_no` 증가였다(제자리 수정 0, 삭제 0). 그래서 변경분이 성립한다.
- **작은 표**(사업·별칭·매핑 등): 제자리 수정이 있어 매번 통째로 받는다.
- **빠짐 검사**: `current` 의 kind 별 건수·해시값과 합친 결과가 다르면 멈춘다.
- **api/·web/**: 우리가 나중에 HOME 공개 API 를 받으면 그사이 수집으로 값이 달라진다. 그래서 HOME 팀이 until 과 같은 시점에 넣는다.
- 담당자 실명·사유 칸은 우리 결과에 쓰이지 않으면 슬라이스에서 빠진다. 원본 패키지는 Storage 비공개 버킷에만 두고 저장소에는 manifest 만 커밋한다.

## 3. 반영 명령 `home-apply.js`

`node tools/ledger/home-apply.js --in <패키지> [--dry-run] [--base <판>] [--workdir <폴더>] [--report <파일>]`. 모든 단계는 **scratch 사본(`cp -c -R`)에서 먼저** 돈다. 성공했을 때만 결과 파일을 작업 트리로 옮긴다. 변환 로직은 새로 짜지 않는다. 외부 명령은 주입 가능한 runner 로 부른다(시험 `tests/js/home-apply.test.cjs`).

0. **사전 점검**(실제 모드만): main 이고 `git fetch` 뒤 origin/main 과 같음, git 색인 비어 있음, 이번 반영 경로(달 폴더의 tables·mappings·raw/home·raw/home-api·manifest.json, 새 달이면 달 폴더 전체 + registry·data/board)에 미커밋 변경 없음, `.env.local` 키 이름(`SUPABASE_DB_URL`·`SUPABASE_SECRET_KEY`·`NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, 새 달이면 `DATA_GO_KR_KEY`), pg_dump·vercel CLI.
1. **직전 판 기준선**: 사본에서 같은 코드로 지금 판을 convert(표는 임시 폴더) — 멈춤 조건의 '직전' 값(묶음·시군구 미정).
2. **달**: until 의 한국 달 = 열린 달(`ledger-board.json observedMonth`)이면 그 달. 더 늦고 한국시간 이번 달이면 `monthly.js --month <달>`(새 달 폴더, 앞 달 정적 입력 — raw/home 포함 — 복사, `trend --close`). 더 늦은데 이번 달이 아니거나 앞 달이면 멈춘다. 새 달은 네트워크(건축HUB·data.go.kr·공고 API)와 `DATA_GO_KR_KEY` 가 필요하다. **합치기보다 먼저** 돈다 — 새 판을 닫히는 앞 달 폴더에 넣지 않으려고.
3. **합치기**: `home-slice.py apply --base <가장 늦은 판 또는 --base> --in <패키지>` → 내부 판 `raw/home/<until>/`. sha256·키 검사·digest·모르는 kind·칸·since 공백에 걸리면 멈춘다. `api/` 는 `raw/home-api/<until 한국 날짜>/`. 같은 이름 판·응답 폴더가 이미 있으면 바꿔 넣고 보고에 적는다. 달 `manifest.json` 의 `reference_date` 를 until 한국 날짜로 맞춘다(home-sources·requirements·정답 시험이 `raw/home-api/<기준일>` 을 읽는다 — 10-20·10-22 이관과 같은 규칙).
4. **변환**: convert(`--sidos 11,28,41`, 핸드오프 3절 ③ node 한 줄을 셸 없이) → `issue-projects --home` → convert 다시 → trend(`--close` 없이 — 소급 행을 합친 판으로, 같은 달에도) → board → home-projects → home-map → home-lite `--offline`(사업 줄·색인만, 네트워크 없음) → policy-progress → home-lh-plan → home-board → map-overview → projects-index → region-supply → requirements → area-facts → home-sources.
5. **멈춤 조건**: 두 convert 어느 쪽이든 `ids.conflicts > 0`·'검증 통과' 없음, `publicTier` F > 0, `sggUnresolved` 가 직전 판보다 2 넘게 늚(실측 10-13 판 2, 10-20·10-22 판 0 — 미정 묶음은 원장에서 빠진다), 묶음 수 직전 대비 ±20% 초과, 이번 반영 경로 밖 파일 변경, 변환기·생성기 오류(모르는 `mapping_decision` 등). 수도권 밖 행은 `npm test` 의 `ledger-home` 리허설 시험이 잡는다.
6. **정답 대조**: 패키지 `golden/`·`web/` 으로 `tools/ledger/home-parity/run.js`(S1 `s1-policy.js` · S2 `s2-projects.js` · S3 `s3-sources.js` · `map-golden.js`)가 정답을 계산해 사본 `.cache/home-apply/golden/` 에 두고 `HOME_GOLDEN_DIR`·`MAP_GOLDEN` 으로 시험 6종을 돌린다. 실패·**건너뛰기도** 멈춤이다. golden·web 이 없으면 '정답 대조 입력 없음'으로 멈춘다. 2026-11-09 리허설에서 본 slices.json 목록의 빈 곳(`S1-view-region-<시도>.json` 3개, `web/js_requirements-manual.js`)은 같은 날 목록에 넣었다. 목록 = home-parity 스크립트가 읽는 입력(`tests/test_home_slice.py` GoldenList 시험이 지킨다). S3 는 원본 응답 `S3-<경로>.json` 10개 또는 줄인 `S3-snapshot.json` 을 받는다.
7. **시험**(사본, `.env.local` 을 치우고 JSON 대체로 — 네트워크 없음): 정답 대조 6종 → `npm test` → `python3 -m unittest` → `tsc` → `npm run build`. 빌드가 Next.js `SecurityFatalError` 로 끝나면 다시 돌리지 않고 'Next.js 보안 업그레이드 필요'로 멈춘다(업그레이드는 사용자 결정).
8. **반영**(`--dry-run` 이면 여기 전에 끝): 결과를 작업 트리로 옮기고 다음 순서로 진행한다. 하나라도 실패하면 멈추고 되돌리기(백업 파일·커밋·직전 운영 배포)를 출력한다.
   1. 백업(pg_dump `-n ledger -n ledger_admin -n api`, `~/housing-board-backups/`, TABLE DATA 20개 이상)
   2. raw-store push(`--only raw/home`)
   3. `supabase-load.js --skip-raw`(`BOARD_REVALIDATE_URL` 빈 값) — run 번호를 읽는다
   4. `supabase-verify.js`('모두 통과')
   5. 이번 반영 파일만 커밋(키 검사, `Co-Authored-By` 줄)
   6. `git archive HEAD` 사본 + `.vercel/project.json` 으로 `vercel deploy --prod --yes`(전역 OAuth 로그인, `VERCEL_*` 환경변수는 넘기지 않음)
   7. push(CI ledger-load 가 멱등 재적재·캐시 비움)
   8. 운영 `board-source` = `supabase:<달>:run<새 번호>` 확인
9. **보고**(`<작업 폴더>/report.json`): 바뀐 수치(원장 사업·연결·일정·호수, 종합상황판 판정, 9·7 단계 카드·진행 전후), 바뀐 파일, 멈춘 이유, 시험 결과, 운영 배포 주소, 되돌리기.

## 4. 단계와 상태

| 단계 | 내용 | 확인 | 상태(11-09) |
|---|---|---|---|
| P1 슬라이스 형식·도구 | 명세·정의·틀, `home-slice.py make/apply` | (a) 전체 판 vs 슬라이스 판 변환 산출물 바이트 동일 (b) 06:23 + 변경분 = 22:35 (c) 두 번 돌려 동일 (d) 멈춤 조건 시험 | **완료** — (a) 177파일 동일·(b) 동일(메인 재실행), `tests/test_home_slice.py` 15 |
| P2 판 무관 시험 | 기준선 실패 43건 해소. 판 숫자 고정을 원천 재계산·HOME 정답 대조·산출물 관계로 바꾼다 | `npm test` 녹색(결함 의심은 따로 보고), 06:23 판 사본에서도 통과 | **완료** — 작업 트리 1,667 통과. 06:23 사본 실패 1(HOME 앱 계산 규칙이 판마다 달라 생긴 차이, 판 숫자 아님)·건너뜀 10 |
| P3 반영 명령 | `home-apply.js`(사본·합치기·달·변환·멈춤·정답 대조·반영·보고, `--dry-run`), 정답 스크립트 저장소 이전 | 22:35 변경분 패키지로 `--dry-run` 통과, 멈춤 조건마다 가짜 묶음 시험 | **완료** — 리허설(메인, 82초): 바뀐 수치 0·정답 대조 51 통과·npm test 1,667·unittest 358·tsc 통과, **빌드만 Next.js 보안 오류로 멈춤**. 시험 `home-apply.test.cjs` 19. 실제 모드는 미실행 |
| P0 작업 트리 커밋 | 22:35 판 변환분·11-06 운영 소스·P1~P3 를 한 번에 커밋 | `git status` 깨끗, 운영과 main 이 같음 | **사용자 지시 필요** |
| P4 첫 운영 실행 | HOME 11월 묶음 = 2026-11 열기 | 운영 board-source 새 run, 정답 대조 0 | **묶음 도착 후, 실행 직전 확인**. 그 전에 Next.js 보안 업그레이드 필요(빌드 멈춤) |

## 5. 선행 조건

- **P0 커밋**: 운영(gvwc0n846)이 커밋하지 않은 소스로 배포돼 있다. 반영 명령은 HEAD 사본을 배포하므로, 먼저 커밋하지 않으면 그 변경이 운영에서 사라진다. 지금 작업 트리는 시험 43건이 실패하므로 P2 뒤에 커밋한다.
- **HOME 팀 합의**: 슬라이스 형식, 그리고 `api/`·`web/` 를 until 과 같은 시점에 넣는 것.

## 6. 위험

- 검사를 통과한 잘못된 자료도 운영까지 간다. 정답 대조(HOME 이 낸 값과 차이 0)와 반영 전 백업으로 막는다.
- 판마다 새 규칙이 필요했다(10-14 담당자 목표, 10-20 id 충돌, 10-22 mapping_decision). 이런 판은 멈추고, 사람이 규칙을 더한 뒤 다시 돌린다.
- 새 달을 열면 앞 달은 되돌릴 수 없다.
- HOME 프런트 계산 로직이 바뀌면 `web/` 없이는 정답 값이 틀어진다.
