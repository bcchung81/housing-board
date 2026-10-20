# HOME 재덤프 이관 핸드오프

작성일은 2026-10-14이다. 다음 이관은 2026-10-16(금)으로 잡혀 있다. 팀원들이 사업–정책 연결을 다시 매칭한 HOME DB 덤프가 들어오면, 지난번 이관(2026-10-13 판 → Supabase run 23~25, 커밋 be90537·2eb2e31)과 **같은 경로**로 반영한다. 이 문서만 보고 처음부터 끝까지 진행할 수 있게 적었다. 배경 설계는 `데이터-정제-계획.md`를 본다.

## 0. 한 장 요약

```text
덤프 폴더 받기 ─▶ ① 사전 점검 ─▶ ② 추출(home-dump.py) ─▶ ③ 변환(convert) ─▶ ④ 발급(issue-projects --home) ─▶ ③ 변환 다시
  ─▶ ⑤ 보드·지도 자료·정책 진행 ─▶ ⑥ 시험 고정값 갱신 ─▶ ⑦ 전체 시험·빌드 ─▶ ⑧ 백업 ─▶ ⑨ 원본 Storage
  ─▶ ⑩ 적재·검증(운영 캐시 비우지 않게) ─▶ ⑪ 커밋·푸시(CI 재적재 확인) ─▶ ⑫ 미리보기 → 운영 배포·확인
```

- 원장 달은 **2026-10(열린 달)** 그대로 쓴다. 새 덤프는 `schemas/ledger-2026-10/raw/home/<덤프시각>/`에 새 판 폴더로 들어간다. 변환은 **가장 늦은 판**을 자동으로 고른다.
- 서울(11)·인천(28)·경기(41)만 HOME이 정본이다. **2026-10-19 결정으로 원장·화면은 수도권 HOME 만 싣는다** — convert 가 `--sidos 11,28,41`(monthly.js `convertArgs` 가 넘긴다)로 수도권 밖 사업·딸린 행을 빼고, `issue-projects --home` 이 수도권 밖 발급 사업을 숨긴다. 원장에 수도권 밖 사업이 생기면 멈춘다(`ledger-home` 리허설 ②, `capital-ledger` 시험).
- 커밋, 적재, 배포는 사용자 승인을 받은 뒤에 한다(메모 규칙).

## 1. 준비물

| 항목 | 값 |
|---|---|
| 저장소 | `/Users/bcchung81/workspace/housing-board` (main) |
| 덤프 도구 | `/opt/homebrew/opt/libpq/bin/pg_restore`(18.x, `brew libpq`). Docker와 로컬 DB 서버는 필요 없다 |
| 실행 환경 | node(저장소 `npm ci` 상태), python3 |
| 비밀값 | `.env.local`: `SUPABASE_DB_URL`·`SUPABASE_SECRET_KEY`·`NEXT_PUBLIC_SUPABASE_URL`·`BOARD_REVALIDATE_URL`(**운영 주소**)·`REVALIDATE_SECRET`·`VERCEL_TOKEN`·`VERCEL_ORG_ID`·`VERCEL_PROJECT_ID`. 값은 절대 출력하지 않는다 |
| Supabase | 서울 프로젝트 `hpxjledpmrbhgenhdvyp`. 2026-10-20 판에서 `20261020100000_ledger_prune_stale.sql`까지 적용했다. 새 마이그레이션 파일이 없으면 이번에는 마이그레이션이 필요 없다(`supabase migration list --db-url …`로 원격 = 로컬 확인) |
| 지난 판(비교 기준) | 로컬 옛 판 폴더는 2026-10-20 에 지웠다. 지난 판은 Storage `ledger-raw/2026-10/home/<판>/` 에만 있다. 비교가 필요하면 Storage 에서 내려받는다 |

## 2. 기준선(2026-10-13 판) — 새 판과 비교할 숫자

새 판(2026-10-20) 수치는 10절 실행 기록을 본다.

| 항목 | 지난 판 값 | 어디서 보나 |
|---|---|---|
| 덤프 | PG 16.9, PostGIS 3.5.2, 310MB, `home_revision` 1,765,753행 | 덤프 `manifest.json` |
| 추출 kind 21개 현재 판 | 19,175행 (+ 추가 kind: evidence_bridge 414·lh_movein_plan 217·document_evidence 234, delivery_setting 0·execution_schedule 0) | 새 판 `manifest.json` |
| HOME 사업(HPR) | 308 → 같은 현장 병합 43 → 수도권 사업 259(시군구 미정 2) | 변환 출력 `home.homeProjects`·`groups`·`sggUnresolved` |
| 연결(home_mapping) | 308(REVIEW 307·CONFIRMED 1) → 원장 links 295(정책–프로그램 26·프로그램–사업 269) | `mapping`·`links.json` |
| 새 사업 id | `ids.fresh` 0, `ids.conflicts` 0 | 변환 출력 `home.ids` |
| 대체·삭제 | 옛 수도권 원천 행 1,784 제거, 레지스트리 대체 10·숨김 55, 살아 있는 발급 275 | `home.replaced`, `registry/projects.json` |
| 공고 | LH 2,887(중복 1,131)·청약홈 0(중복 1,110)·GH 694 | `home.notices` |
| 지역 지표 | 18,264(인천 옛 구 147건 미해결 — 2026-07 개편, 정상) | `home.areaFacts` |
| 9·7 공급(같은 기간 2026-01~09) | 목표 9,355 / 확인 6,680 / 부족 28.6% | `data/board/policy-progress.json` `samePeriod` |
| 9·7 HOME 방식 | 9,355 / 7,606 (HOME 화면 18.7%) | 같은 파일 `homeRule` |
| 종합상황판 판정 | 2,006사업 / 1,256,390호 | `data/board/ledger-board.json` |
| Supabase | run 25: projects 2,324(대체 행 포함)·links 295·policy_targets 47·area_facts 18,264·notices 24,374 | `supabase-load.js` 출력 |

## 3. 절차

### ① 사전 점검 (멈춤 조건이 있으면 멈추고 보고)

```bash
cd /Users/bcchung81/workspace/housing-board
git fetch -q && git status -sb             # main...origin/main 이 같아야 함(봇 커밋은 없어야 정상 — 예약 제거됨)
npm test 2>&1 | tail -5                    # 시작 전 기준 녹색(지금 840 통과)
D=~/Downloads/HOME_DB_<시각>               # 받은 폴더
cat "$D/README.txt"; cat "$D/manifest.json" | head -80
(cd "$D" && shasum -a 256 -c SHA256SUMS.txt)
```

- `README`·`manifest`를 지난 판과 비교한다(PG·PostGIS 버전, `home_*` 표 목록, 행 수). **표가 새로 생기거나 열 이름이 바뀌었으면** ②에서 열 수 불일치 오류가 날 수 있다. 그러면 `tools/ledger/home-dump.py`의 표·열 목록을 고친다.
- **담당자 목표가 들어왔는지** 본다. 팀원이 재매칭하면서 HOME 관리 화면에 목표·일정 기준선을 입력했을 수 있다. ② 뒤 새 판 `manifest.json`의 `delivery_setting`·`execution_schedule` 행 수가 0이 아니면 ⑤의 `policy-progress.js`가 멈춘다(7절).

### ② 추출

```bash
python3 tools/ledger/home-dump.py --dump "$D"
# → schemas/ledger-2026-10/raw/home/<YYYYMMDDTHHMMSSZ>/  (jsonl.gz 37개 + manifest.json, 약 1분)
```

- 덤프 SHA가 다르거나, 키 검사(`serviceKey=` 등)에 걸리거나, 열 수가 맞지 않으면 스스로 멈춘다.
- 확인 사항:
  - 새 판 `manifest.json`의 kind별 행 수를 지난 판과 비교한다(`project`·`home_project`·`home_mapping`·`home_program_mapping`).
  - 같은 명령을 두 번 돌려 manifest가 같은지(결정성) 확인한다.

### ③ 변환 — 반드시 아래 node 실행 방식으로

`convertArgs`를 셸에 붙여 넣지 않는다. **zsh는 변수를 나눠 주지 않아서 인자가 통째로 한 덩어리로 넘어가고, 표가 레지스트리 77건짜리로 잘못 만들어진다(실측).** 아래 한 줄을 그대로 쓴다. 가장 늦은 HOME 판과 `snapshot/hub-refresh.json`(없으면 hub-bulk 판)을 자동으로 고른다.

```bash
node -e "
const m=require('./tools/ledger/monthly'),path=require('path'),fs=require('fs'),cp=require('child_process');
const root=process.cwd(),month='2026-10',dir=path.join(root,'schemas/ledger-'+month);
const bulk=fs.existsSync(path.join(dir,'snapshot/hub-refresh.json'))?'hub-refresh.json':fs.readdirSync(path.join(dir,'snapshot')).filter(f=>/^hub-bulk-\d{4}-\d{2}\.json$/.test(f)).sort().pop();
let a=m.convertArgs(root,dir,month,bulk); if(process.env.OUT){a[a.indexOf('--out')+1]=process.env.OUT;}
cp.execFileSync('node',['tools/ledger/convert.js',...a],{stdio:'inherit'});
" | tee /tmp/convert.log | tail -4
```

- `OUT=<임시 폴더>`를 앞에 붙이면 저장소 표를 건드리지 않고 시험 삼아 돌릴 수 있다. 같은 판이면 표 18개가 바이트까지 같아야 한다(2026-10-14 실측 diffs=0).
- 출력 JSON의 `home` 부분을 2절 기준선과 비교한다: `homeProjects`, `merged`, `inventory`, `groups`, `sggUnresolved`, `ids.fresh`·`ids.conflicts`, `replaced.removedProjects`, `mapping.skipped`·`noProject`, `notices`.
- **멈춤 조건**:
  - `검증 실패`가 나온 경우
  - `ids.conflicts` > 0인 경우
  - `groups`가 지난 판보다 크게(±20% 넘게) 바뀌었는데 이유를 모르는 경우
  - `sggUnresolved`가 크게 는 경우
  - 원장에 수도권 밖 행이 생긴 경우: `git diff --stat schemas/ledger-2026-10/tables`만으로는 판단할 수 없다. ⑦의 `ledger-home` 리허설 시험 ②가 이것을 잡는다.

### ④ 발급 → ③ 다시

```bash
node scripts/issue-projects.js --home --month 2026-10   # 새 HOME 사업 발급, 수도권 옛 발급은 대체(supersededBy)·숨김(hiddenAt)
# 그다음 ③의 node 한 줄을 한 번 더 — 발급 결과(issued_at·superseded_by)가 원장에 들어간다
```

- `registry/projects.json` diff에서 확인할 것: 새 발급 수, 새로 대체된 사업(옛 id → 대표 id), 새로 숨긴 사업.
- 재매칭으로 HPR_ id가 바뀌어도 `mappings/home-ids.json`이 PRO_·LH_·지구+블록 키로 이어 주므로 **같은 사업은 같은 PRJ id**를 받는다. `home-ids.json`의 diff는 키가 **추가만** 된 모양이어야 한다. 기존 키가 다른 id를 가리키게 바뀌었다면 사업 병합 규칙이 작동한 것이니 대표 id를 확인한다.

### ⑤ 보드·지도 자료·정책 진행

```bash
node tools/ledger/board.js --month 2026-10            # data/board/ledger-board.json·ledger-map.json
node tools/ledger/home-map.js --month 2026-10         # data/board/home-map/<시군구>.json (수도권 지도 정적 자료)
node tools/ledger/policy-progress.js --month 2026-10  # data/board/policy-progress.json (9·7 단계 비교)
```

- `policy-progress.js`가 `담당자 목표·사건(delivery_setting·execution_schedule)이 있는 판`이라며 멈추면 7절로 간다.
- `homeRule`(HOME 방식) 값이 **덤프 시점 HOME 운영 화면 값과 같아야** 재현이 맞다. 정책별 추진현황의 공급(분양·모집) 목표·확인을 비교한다. 운영 API(`https://www.minslab.kr/poc/home/api/policy-delivery?compact=true`, 읽기 GET 한 번)의 `yearly_comparisons.policy.metrics.SUPPLY`와도 대조한다.

### ⑥ 덤프마다 바뀌는 시험 고정값 갱신

| 파일 | 고정값(지난 판) | 갱신 방법 |
|---|---|---|
| `tests/js/ledger-home.test.cjs` 143~144줄 | HPR 308, 묶음 259, 병합 47, 시군구 미정 2 | ③ 출력의 `home` 값으로 고친다 |
| `tests/js/policy-progress.test.cjs` | 월말 목표 점(9,355·10,285…), 확인(7,606 등), samePeriod 9,355/6,680/2,675/28.6 | ⑤ 결과 파일 값. 단 `homeRule`은 HOME 화면 값과 대조한 뒤 고친다 |
| `tests/js/pipeline.test.cjs` 40~49줄 + `lib/board/pipeline.ts` 46·49줄 문구 | 살아 있는 레지스트리 275·HOME 259·70개 시군구·대체/숨김 수 | `registry/projects.json`에서 다시 세고, 문구의 숫자와 날짜도 함께 |
| `tests/js/ledger-board.test.cjs` | 보드 판정 수치 일부 | 실패 메시지의 새 값을 원장으로 확인한 뒤 |
| (고칠 필요 없음) `home-map.test.cjs`·`monthly.test.cjs`·`home-lite.test.cjs`의 판 이름 | 시험 안의 자체 고정 자료(2026-10-20에 옛 판 경로를 걷어 냄) | — |

- 고정값을 바꿀 때는 **왜 바뀌었는지**(재매칭으로 연결 증가 등)를 커밋 메시지에 남긴다. 이유를 모르면 고치지 말고 멈춘다.

### ⑦ 전체 시험·빌드

```bash
npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"
python3 -m unittest discover -s tests 2>&1 | tail -2
npx tsc --noEmit
npm run build            # npx next build 만 돌리면 prebuild(scripts/build.js)가 빠져 지도 시험이 깨진다
```

- `ledger-home` 리허설 시험(같은 판 두 번 바이트 동일, 원장에 수도권 밖 행 0, 수도권 합 = 세 시도 합, 같은 블록 두 사업 0, 연결만 바뀐 판에서 사업 id 불변)이 모두 통과해야 한다.

### ⑧ 백업

```bash
B=~/housing-board-backups; mkdir -p $B; chmod 700 $B
DBURL=$(grep -E '^SUPABASE_DB_URL=' .env.local | cut -d= -f2- | tr -d '"')
/opt/homebrew/opt/libpq/bin/pg_dump "$DBURL" -n ledger -n ledger_admin -n api -Fc -f $B/ledger-before-home-$(date +%Y%m%d%H%M).dump 2>&1 | sed -E 's#postgres(ql)?://[^ ]+#***#g'
```

- 확인: `pg_restore -l <파일> | grep -c "TABLE DATA"`가 23 안팎(지난번 23)이다. `pg_restore -a -n ledger -t projects -f - <파일> | wc -l`이 2천 줄 이상이다.

### ⑨ HOME 원본을 Storage에 (커밋 전에)

```bash
set -a; . ./.env.local; set +a
node tools/ledger/raw-store.js push --month 2026-10 --only raw/home    # 새 판 37개, 약 4MB
```

- 저장소에는 새 판 `manifest.json`만 올라간다. 원본이 Storage에 없으면 다른 기계에서 `raw-store.js pull`로 받을 수 없다.

### ⑩ 적재·검증 — 운영 캐시를 비우지 않게

```bash
set -a; . ./.env.local; set +a
BOARD_REVALIDATE_URL= node tools/ledger/supabase-load.js --month 2026-10 --skip-raw
node tools/ledger/supabase-verify.js --month 2026-10        # 마지막 줄 '모두 통과'
```

- **`BOARD_REVALIDATE_URL=`(빈 값)을 꼭 붙인다.** `.env.local` 값이 운영 주소라서, 그대로 두면 적재가 끝나는 즉시 운영 화면 캐시가 비워진다. 그러면 새 데이터가 아직 배포되지 않은 코드로 보인다(10-14에 실제로 겪음).
- 출력의 `고아 정리`에 나오는 사업 삭제 수는 이번 판에서 빠진 HOME 사업 수와 맞아야 한다.
- 같은 줄 아래의 `지역 지움 · 통계 지움 · 공고 지움`은 이번 판에 없는 `areas`·`stat_facts`·`notices` 행을 지운 수다(2026-10-20 `publish_run` 변경). 다른 행이 가리켜 남긴 수(`남김`)는 0이어야 한다.
- verify에서 확인할 것:
  - anon 공개 범위가 board·map·screens만 200인지
  - 고아 0인지
  - 왕복 결과가 파일과 같은지

### ⑪ 커밋·푸시

```bash
git status --short     # 다른 세션 미추적 파일은 빼고 올린다: exports/, tools/common_v1_4*, tests/js/common-v1-4-raw.test.cjs,
                       # docs/product/단계별-원천-수집.md(수정분), docs/design/종합상황판_시안_정리.html, PRODUCT.md, .impeccable/, docs/design/home-concept/
git add <이번 판 파일들: raw/home/<새 판>/manifest.json, tables, mappings, registry, data/board, tests, lib/board/pipeline.ts>
git diff --cached | grep -E "sb_secret_|postgres(ql)?://[^ ]*:[^ ]*@" && echo "키 노출 — 중단"
git commit -m "chore(ledger): HOME 재매칭 덤프 <시각> 반영 — <바뀐 숫자 요약>"   # 끝에 Co-Authored-By·Claude-Session 줄
git push origin main
gh run list --workflow ledger-load.yml --limit 1     # 푸시로 CI 가 같은 표를 다시 적재(멱등). success 확인
```

- CI(`ledger-load.yml`)는 자기 비밀값으로 **운영 캐시를 비운다**. 이번 이관에서 코드가 바뀌었다면 ⑫ 배포를 곧바로 이어서 한다.

### ⑫ 미리보기 → 운영 배포·확인

```bash
DIR=$(mktemp -d); git archive HEAD | tar -x -C $DIR
export VERCEL_TOKEN=... VERCEL_ORG_ID=... VERCEL_PROJECT_ID=...   # .env.local 에서 export, 값 출력 금지
(cd $DIR && vercel deploy --yes -Q $(mktemp -d))           # 미리보기 — 보호돼 있어 `vercel curl <경로> --deployment <URL>` 로 확인
(cd $DIR && vercel deploy --prod --yes -Q $(mktemp -d))    # 운영
curl -s https://housing-board.vercel.app/ | grep -oE 'board-source" content="[^"]+"'   # supabase:2026-10:run<새 번호>
```

- 운영에서 확인할 것:
  - `/`, `/map`, `/map?sgg=41281`, `/projects` 200
  - 대체된 옛 사업 주소가 307로 대표 사업에 넘어감
  - 종합상황판 수도권 판정 값이 `ledger-board.json`과 같음

### ⑬ (선택) 미리보기 화면·시안 갱신

- 미리보기 브랜치 worktree(`/Users/bcchung81/workspace/housing-board-screens`, 로컬 `home-screens`):
  1. `git merge main`
  2. HOME 원본을 그 worktree에도 복사한다(gitignore라 따라오지 않음).
  3. `node tools/ledger/projects-index.js`, `area-facts.js`, `home-sources.js`를 다시 돌린다.
  4. `npm run build && npx next start -p 8140`
  - 이 브랜치에는 프로그램 표기 합치기(26→24)가 있어 main과 표 일부가 다르다.
- 시안(`docs/design/home-concept/`): `node docs/design/home-concept/build-data.mjs && node docs/design/home-concept/gen-html.mjs && node docs/design/home-concept/build-css.mjs`

## 4. 정상 변화 vs 멈춤

| 바뀐 것 | 정상으로 볼 범위 | 멈추고 확인 |
|---|---|---|
| links | 정책–프로그램·프로그램–사업 수 변화, `CONFIRMED` 증가(재매칭의 목적) | 연결 수가 크게 줄었거나 `mapping.noProject`가 크게 늚 |
| 사업 수(수도권) | HOME 사업 추가·삭제만큼 | 이유 없는 ±20% 넘는 변화, 수도권 밖 행 발생 |
| 사업 id | 새 사업만 새 id, 기존 사업은 같은 id | `ids.conflicts` > 0, 기존 PRJ id가 사라짐(대체 기록 없이) |
| 9·7 진행값 | 공고·연결이 바뀐 만큼 | `homeRule`이 HOME 화면과 다름 |
| 종합상황판 | 수도권 판정 호수 변화 | 수도권 합 ≠ 세 시도 합(시험이 잡음) |

## 5. 함정 (지난 이관에서 실제로 겪거나 확인한 것)

1. **zsh 인자 쪼개짐**: 변수에 담은 인자를 그대로 넘기면 한 덩어리가 된다. 이 때문에 ③을 node 실행으로만 한다.
2. **운영 캐시**: 로컬 `BOARD_REVALIDATE_URL`이 운영 주소다. 적재할 때는 빈 값을 준다. 반대로 CI는 푸시하면 운영 캐시를 비운다.
3. **순서**: `issue-projects --home` 뒤에 convert를 한 번 더 돌린다. 이걸 빠뜨리면 원장에 발급·대체가 반영되지 않는다.
4. **원본 Storage**: 원본을 Storage에 올리는 것은 커밋 전에 한다. HOME 원본 gz는 gitignore 대상이다.
5. **달 닫힘**: `supabase-load.js --month 2026-11`처럼 **새 달로 적재하면 2026-10이 닫히고 되돌릴 수 없다.** 덤프가 11월에 오면 새 달 절차가 따로 필요하니 이 문서대로 하지 말고 먼저 보고한다.
6. **서버 끄기**: `pkill -f next-server`처럼 한꺼번에 끄지 않는다. 다른 세션의 개발 서버(8000)까지 꺼진다. 자기가 띄운 PID만 끈다.
7. **빌드 명령**: `npx next build`만 돌리면 prebuild가 빠진다. 반드시 `npm run build`로 한다.
8. **다른 세션 파일**: 커밋할 때 다른 세션의 미추적·수정 파일을 섞지 않는다(⑪ 목록).
9. **원장에 남는 행**: `programs`·`policies`·`sources`는 Supabase에서 덮어쓰기만 하고 지우지 않는다. 빠진 프로그램 id가 DB에 남지만 공개 뷰와 내보내기에는 보이지 않으므로 정상이다. `areas`·`stat_facts`·`notices`는 2026-10-20부터 발행 때 이번 판에 없는 행을 지운다(`20261020100000_ledger_prune_stale.sql`). 그래서 수도권 밖 행이 DB에 남지 않는다.

## 6. 되돌리기

- **Supabase**: ⑧ 백업으로 되돌린다(`pg_restore --clean -n ledger …`, 실행 전 사용자 승인). 열린 달이라 이전 커밋의 표로 `supabase-load.js`를 다시 돌려도 된다(멱등).
- **저장소**: 커밋을 되돌린 뒤 다시 푸시한다. 그러면 CI가 이전 표로 다시 적재한다.
- **배포**: Vercel에서 이전 운영 배포(`housing-board-folbi2ead` 등)로 promote/rollback한다.

## 7. 담당자 목표가 들어온 경우

- `policy-progress.js`는 HOME의 `delivery_setting`·`execution_schedule`(담당자 목표·일정 기준선)을 아직 옮기지 않았다. 판에 이것이 있으면 일부러 멈춘다.
- 이 경우 HOME `backend/policy_delivery.py`의 `build_delivery` 안 `stored_config`·`schedule_goals` 병합 규칙(관리자 목표가 원천 예정과 같은 범위·단계면 대체)을 옮겨야 한다.
- 원장 쪽에서는 `policy_targets`(정책 목표)와 `events(PLANNED, plan_basis=BASELINE)`(기준선)가 받을 자리다.
- 이 작업은 이관 범위를 넘으니 먼저 보고하고 진행한다.

## 8. 참고

- **계획·결정 문서**: `docs/product/데이터-정제-계획.md`(6절 결정, 8절 진행), `HOME-데이터-이관-계획.md`(덤프 측정), `지도-개선-계획.md`
- **도구**: `tools/ledger/home-dump.py`, `home-source.js`(`replaceSido`·`inventory`·`issueHome`), `convert.js`, `scripts/issue-projects.js`, `board.js`, `home-map.js`, `policy-progress.js`, `raw-store.js`, `supabase-load.js`, `supabase-verify.js`
- **마이그레이션**: `supabase/migrations/20261014100000_ledger_refine.sql`(고아 정리 `retired_run_id`, `policy_targets`·`area_facts`, 공고 GH, 식별자 HOME), `20261020100000_ledger_prune_stale.sql`(이번 판에 없는 지역·통계·공고 정리, `orphan_counts` stale 세 값)
- **HOME 소스(읽기 전용)**: `github.com/acesharp81/minslab` `PoC/10-home` 커밋 21c60b1. 운영 화면은 https://www.minslab.kr/poc/home/

## 9. 실제 수행 기록 — 2026-10-14 판(20261014T102506Z)

- **반영 순서와 결과**:
  - worktree(`home-screens`)에서 ①~⑦을 진행했다(커밋 7306e92).
  - 화면을 시안(3장·메뉴 5개)대로 구현했다(f9a98ea·1fecb47·853ba15·5056fed).
  - main fast-forward → 백업 → raw-store push → 적재 run 27(`BOARD_REVALIDATE_URL=` 빈 값) → verify를 거쳤다.
  - 미리보기(iq6mp8m34) → 운영 배포(8q4r4vblc) → 푸시(CI ledger-load run 28 성공) 순서로 마쳤다.
  - 배포를 푸시보다 먼저 했다. CI가 운영 캐시를 비우기 전에 새 코드를 올려 두기 위해서다.
- **새 판에서 처음 생긴 일**:
  - 담당자 입력(execution_schedule 1,182건, project_profile 197건)이 들어왔다. policy-progress에 담당자 목표 규칙을 이식했고, HOME API와 대조했다.
  - 공급 확인 값에 담당자 추정(`OFFICER_CURRENT_ESTIMATE`)이 섞여 있어 화면에서 '확인'과 '추정 포함'을 나눠 표시했다.
  - 덤프에 담당자 실명과 입력 사유가 있었다. 매핑 근거 문구로 새어 나가지 않게 `home-source.js`에서 지웠고, 산출물 실명 검사 결과는 0건이다.
- **새 생성기**: `region-supply.js`·`requirements.js`·`projects-index.js`(+ `area-facts.js`·`home-sources.js`)는 HOME 원본이 필요하다. 원장이 바뀌면 board → home-map → policy-progress → projects-index → region-supply → requirements 순서로 다시 돌린다. monthly.js에는 policy-progress·projects-index까지만 들어 있다.
- **미리보기 배포**: Supabase 환경변수가 없어 JSON 대체로 동작한다(`board-source=json`). 운영 출처 확인은 운영 주소에서 한다.

## 10. 실제 수행 기록 — 2026-10-20 판(20261019T212247Z)

- **덤프**: `~/Downloads/HOME_DB_20261020_062247`(스냅샷 2026-10-20 06:22 KST, 1.04 GB, `home_revision` 3,810,231행, 소스 커밋 31b4806). 표·열은 그대로라 추출 kind 는 바꾸지 않았다. 새 kind 41종(register·permit·general_permit 등 대형 원천)은 연결에 쓰이지 않아 범위 밖으로 뒀다.
- **반영 순서**: worktree(`housing-board-home1020`, 브랜치 `home-1020`)에서 ②~⑦ → ⑨ 원본 Storage(38개, 9.6 MB) → ⑧ 백업 → 마이그레이션 `20261020100000_ledger_prune_stale.sql` 적용(`supabase db push --db-url`) → 적재 run 33(`BOARD_REVALIDATE_URL=` 빈 값) → verify 모두 통과 → 커밋 → 미리보기·운영 배포 → 푸시.
- **사용자 결정(2026-10-20)**: 수도권만 남긴다(areas·stat_facts 의 수도권 밖·전국 '00' 행도 제거). 옛 판 원본 폴더(10-13·10-14)는 저장소에서 지우고 Storage 에만 둔다. 같은 현장으로 합쳐진 인천검단 AA19 는 블록 키를 가진 0055 를 대표로 두고 0054 를 대체한다. 원천 사업후보(PRO)가 둘인 HOME 사업은 둘 다 쓴다. 공개 범위 미상 사업은 HOME 처럼 표시한다. 인천부평 A(0068)·(도시재생뉴딜) A(0065) 중복 의심은 HOME 대로 둔다.
- **새 판에서 처음 생긴 일**:
  - 키 검사 오탐 840건: 토지이음 첨부(`FileDownload.do?file=`)의 날짜 폴더 경로였다. `home-dump.py` 가 `/YYYYMMDD/…` 경로만 키가 아닌 것으로 보게 좁혔다.
  - `ids.conflicts` 1건: HOME 이 블록 오기(A13-1→AA19)를 고쳐 지난 판의 두 사업이 한 묶음이 됐다. 대표는 '묶음 블록 키를 이미 가진 기존 id → 없으면 앞 번호' 규칙으로 고르고, 나머지 기존 id 는 숨기지 않고 `HOME_SAME_SITE` 로 대체한다.
  - HPR 하나에 PRO 가 둘인 사업 7곳: 모두 묶음에 넣고 같은 HPR 은 한 묶음으로 합친다. 같은 원천의 같은 종류 예정일이 둘이면 종합상황판도 지도처럼 이른 날짜를 쓴다(`board.js`).
  - `home_project` 311→2,011: 늘어난 1,700곳(정비사업 목록·일반 인허가 등)은 대부분 PRO 가 없어 원장 사업이 되지 않는다. PRO 가 새로 생긴 130곳이 묶음 증가의 원인이다.
  - 새 프로그램 5개의 /citizen 짧은 이름을 `build_data.py`·`public-labels.ts` 에 넣었다.
- **수치(지난 판 → 새 판)**: 원장 사업 262 → 383(대체 10 → 11, 숨김 71), 연결 310 → 342, areas 20,562 → 3,001, stat_facts 16,320 → 2,880, 지역지표 18,264 → 19,331, 검토 필요 15 → 110(공개 범위 미상 13 → 106), 종합상황판 판정 169건·168,152호 → 188건·179,428호, 전체 262사업·227,976호 → 383사업·274,296호. 9·7 같은 기간·HOME 방식 값(8,049 / 4,732 / 8,742)은 그대로이고 HOME 운영 API 와 같다.
- **적재(run 33)**: 사업 고아 0, 지역 지움 17,561 · 통계 지움 13,440 · 공고 지움 7,487(지난 판 잔여) · 남김 0. verify: 수도권 밖 행 0, 시군구 없는 공고 8,689(실패 아님).
- **남은 일**: 인천부평 0068·0065 중복 의심과 공개 범위 미상 106곳(상당수 재건축·가로주택 조합)은 HOME 담당자에게 확인을 요청한다. 위치 없는 사업 127곳. 종합상황판 기준일(referenceDate)은 2026-10-13 그대로다.
