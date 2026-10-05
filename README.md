# 주택파동 공급 지도

공공주택 공급 현황을, 국토교통부 GIS건물통합정보(V-World) 공식 건물 위에 3차원으로 보여 주는 지도입니다. 지역마다 자료 묶음(번들)만 바꿔 끼우면 같은 화면으로 다른 지역을 보여 줍니다.

지금 올라 있는 지역: **인천 계양구**(계양 테크노밸리, 기본) · **광주 광산구**(선운2지구) · **전남 나주시**(빛가람 혁신도시).

데이터(번들 구조·수집한 원천·가공 과정)는 이 파일에 두지 않고 **[dataset.md](dataset.md)** 에 모았습니다.

## 실행

지역 자료(`regions/*.json`)를 `fetch`로 읽으므로 **더블클릭(`file://`)으로는 열리지 않고, 서버가 필요합니다.** 로컬에서는 개발 서버를 쓰세요. 정적 파일과 버스 위치 중계(`/api/bus`), 표준코드 해석(`/api/v1/resolve`)을 함께 열어 줍니다.

```
./run-app.sh                     # 이 폴더에서. 개발 서버를 켜고 브라우저를 엽니다(포트 기본 8000, 바꾸려면 ./run-app.sh 8001)
node scripts/dev.js 8000         # 같은 일을 직접: 브라우저에서 http://127.0.0.1:8000/ 을 엽니다
```

- **버스 위치(3D 버스)는 인천 계양구에서만** 나옵니다(`?region=incheon-gyeyang`, 기본 지역). 확대 14 이상에서 노선 선을 따라 움직이는 3D 버스 모형과 노선 번호가 보입니다(확대 17.5 이상에서 실제 크기).
- `.env.local`에 공공데이터포털 인증키가 있어야 위치를 받아옵니다(`DATA_GO_KR_KEY_BUS_1` 처럼 용도별 여러 개, 또는 `DATA_GO_KR_KEY` 하나). 없으면 지도는 노선 선만 보여 줍니다. 키 이름·용도·한도는 `env.example`을 보세요.
- **버스 위치는 `버스 위치 조회` 버튼을 누를 때만 한 번 조회합니다**(자동 갱신 없음). 누른 뒤 서버 `ttl`(기본 60초) 동안은 다시 누를 수 없고, 같은 시간 동안 서버도 응답을 재사용합니다.
- 버스가 어디 있는지 모르겠으면 **옵션 → `가장 가까운 버스 보기`** 를 누르세요(버스가 움직이므로 고정 위치가 없습니다). 시작 위치는 주소 `?at=경도,위도,확대[,기울기,방위]`로 정할 수 있습니다(예: `?region=incheon-gyeyang&at=126.7573,37.5588,17.2,58,25`).
- `python3 -m http.server 8000` 같은 정적 서버로도 지도는 열리지만 **버스 위치 함수가 없어(404) 노선 선만 보입니다.** 이때 하단 범례에 `버스 선만`, 옵션에 `위치 서버 없음`이 뜹니다.

- 화면에 `지역 자료를 불러오지 못했습니다. regions/index.json: Failed to fetch`가 뜨면 `file://`로 열었거나 서버가 꺼져 있는 것입니다. 서버를 켜고 `http://localhost:포트/`로 여세요.
- 인터넷이 필요합니다: 배경지도(V-World), 지형 고도(AWS), 지명 글자(OpenFreeMap)를 내려받습니다.
- V-World 배경을 쓰려면 `config.js`에 인증키를 넣습니다(`config.example.js` 참고). 비어 있으면 OpenFreeMap 회색 지도로 대신 나옵니다.
- 지역이 둘 이상이면 지역 선택기가 보입니다(사이드바 맨 위, 사이드바가 접혀 있을 때는 지도 오른쪽 위 요약 카드 왼쪽 위). 지역 목록에 없는 `?region=` 값은 안내 화면이 뜹니다.
- **지도는 팝업(`window.open`)이나 새 탭으로 여세요. `<iframe>`에는 넣을 수 없습니다**(응답 헤더 `X-Frame-Options: DENY`, `frame-ancestors 'none'`).

주소 매개변수(모두 선택). 화면에서 바꾸면 주소에도 반영되어 링크가 보던 상태를 따라갑니다.

| 매개변수 | 값 | 동작 |
|---|---|---|
| `region` | slug | 열 지역(없으면 기본 지역). 지역을 바꾸면 `block`과 코드 매개변수는 지워집니다. 코드가 함께 오면 코드가 우선 |
| `code` `sgg` `bjd` `pnu` | 표준코드(법정동 기준): 시군구 5 · 법정동 8 또는 10 · 필지 PNU 19자리. 둘 이상이면 `pnu` > `bjd` > `sgg` > `code` | 코드를 해석해(`/api/v1/resolve`) 번들이 있는 지역이면 그곳으로 열고 법정동·필지로 이동해 경계를 강조합니다. 번들이 없는 지역(예: 서울)은 "공급 사업 정보가 아직 없는 지역" 안내가 뜹니다. 예: `?bjd=2824510900` |
| `block` | 단지 `label` 또는 `id`(예 `A6`) | 그 단지 카드를 열고 지도로 이동 |
| `mode` | `progress` `time` `infra` | 보기 기준(기본 층수). `infra`는 점검 자료가 있는 지역만 |
| `panel` | `1` | 데스크톱에서 사이드바를 펼친 채 열기(기본은 접힘) |
| `priv` `ctx` `infra` | `0` | 공공택지 민간 단지 · 역·학교 · 입주 전 점검 표시를 끈다 |
| `ring` `zone` `hud` `cards` | `1` | 역 반경 원 · 초등 통학구역 경계 · 단지 모서리 표시선 · 단지 정보 카드를 켠다 |
| `aa` | `0` | 안티앨리어싱 끄기(저사양) |
| `selftest` | 아무 값 | 시험용 훅(`window.__map` 등)을 붙인다 |

## 폴더 구조

```
index.html               운영 진입점 (지역 불러오기 → 키 → 앱 순으로 스크립트를 읽음)
config.js                V-World 인증키 등 설정 (공유 금지) / config.example.js 는 키가 빈 견본
vercel.json  .vercelignore   배포 설정(캐시 헤더 · 올라가면 안 되는 파일 제외 · 버스 함수 설정)
api/bus.js               버스 위치 중계(Vercel 함수): 키를 숨기고 TAGO 호출 수를 묶음(요청 시에만, 키 풀·로컬 캐시)
api/v1/resolve.js        표준코드 해석 API: 행정표준코드 표 + V-World 경계·필지 + 번들 coverage
lib/                     서버 공용(키 풀 keys.js · 로컬 캐시 cache.js · 코드 판별 codes.js)
env.example              .env.local 견본(키 이름·용도·한도, 값 없음)
assets/
  css/app.css            화면 모양 (반투명 유리 변수 --glass-*)
  js/region.js           지역 로더와 어댑터 (순수 함수 + 얇은 DOM 부분)
  js/infra.js            입주 전 점검 판정 (순수 함수)
  js/facility.js         기존 건물 시설 분류 (순수 함수)
  js/bus.js              버스 노선·위치 계산 (방향·3D 면·보간·경유 단지, 순수 함수)
  js/app.js              화면 동작 (지도·레이어·HUD·카드·옵션·사이드바)
  vendor/maplibre-gl/    MapLibre GL JS 5.24.0 (자체 호스팅, BSD-3, LICENSE.txt 동봉)
regions/                 지역별 자료 묶음(번들) — 구조는 dataset.md
schemas/                 번들·입력 규격(JSON Schema)
tools/                   데이터를 만들고 검증하는 도구 — dataset.md
run-app.sh               로컬 실행(개발 서버 + 브라우저 열기)
dataset.md               지도 데이터 (쓰는 것 · 만드는 절차 · 안 쓰는 것 · 구조 · 수집 출처 · 가공 과정)
docs/                    데이터 인터페이스 정의서(docs/data-interface/)·설계 문서(docs/superpowers/)·상황판 기획서와 스펙(docs/product/)
scripts/build.js         Vercel 빌드
scripts/dev.js           로컬 개발 서버(정적 파일 + /api/bus + /api/v1/resolve)
tests/                   Python(unittest)·Node(node --test) 시험
workspace/               작업 영역 — 배포하지 않음 (원천 자료, 기획 문서, 영상)
```

## 처리 구조

서버는 정적 파일(`index.html` · `assets/` · `regions/`)만 주고, 브라우저가 지역 자료를 읽어 지도를 그립니다. 자료를 만드는 과정과 파일 구조는 [dataset.md](dataset.md), 배포는 아래 "배포"에 있습니다.

```
index.html ─► region.js(RegionLoader.boot) ─► config.js ─► app.js
               지역 자료 읽기 → 화면용 전역으로 변환          MapLibre 지도 · 레이어 · 사이드바 · 카드 · 옵션
```

### 브라우저 안의 순서

1. **`index.html`** — 첫 화면(불러오는 중 안내)을 먼저 그린 뒤, `maplibre-gl.js` · `region.js` · `infra.js` · `facility.js` · `bus.js`를 병렬로 받아 **받은 순서가 아니라 적힌 순서대로** 실행합니다.
2. **`RegionLoader.boot()`**(`region.js`) — `regions/index.json`에서 주소의 `?region=`으로 지역을 고르고, 그 지역 폴더의 자료를 병렬로 받아 화면이 쓰는 모양으로 바꿔 전역 변수에 넣습니다(파일·필드 구조는 dataset.md). 선택 파일이 없으면 그 기능은 꺼집니다. 제목·푸터 문구를 채우고 지역 선택기와 미리보기 띠를 붙이며, 실패하면 안내 화면(`#fatal`)을 띄우고 멈춥니다.
3. **`config.js`**(없어도 됨)로 V-World 키를 읽은 뒤 **`app.js`**를 불러옵니다.
4. **`app.js`** — 주소 매개변수와 전역 자료로 상태를 만들고, MapLibre 지도를 만들고, 기존 건물을 분류하고, 사이드바(합계·다음 일정·단지 카드·입주 전 점검·타임라인)를 그립니다. 지도 스타일이 올라오면(`style.load`) `setupCustom()`이 자료원과 레이어를 올리고 `applyAll()`이 보기·필터·옵션을 반영합니다.
5. **상호작용** — 단지 카드·지도 클릭·타임라인·옵션·상단 버튼이 상태 변수를 바꾸고 `apply*()` 함수가 레이어를 다시 칠하며, `syncUrl()`이 `history.replaceState`로 주소에 반영합니다. 지역을 바꾸면 `?region=`을 바꿔 페이지를 새로 불러옵니다(지도 안에서 갈아끼우지 않음).

화면 구성과 담당 코드:

| 화면 | 위치 | 비고 |
|---|---|---|
| 사이드바 | 왼쪽(`#panel`) | 지역 선택·요약·다음 일정·단지·입주 전 점검(기본 접힘)·타임라인·출처 문구. 데스크톱은 기본 접힘, 모바일(≤900px)은 하단 시트 |
| 상단 바 | 지도 왼쪽 위(`.tools`) | 보기 기준(층수·공정율·입주 시기·기반시설) · 옵션 · 전체/평면/투어 · ◀▶ 돌리기/자동. 한 줄, 좁으면 가로로 밀림 |
| 확대·나침반 | 지도 오른쪽 위(`.rctl`) | +/− 와 나침반(누르면 북쪽 복귀) |
| 가로 요약 | 확대 카드 왼쪽(`#hudSum`) | 사이드바가 접혀 있을 때만. 지역 선택·합계·막대·점검 한 줄·다음 일정 2건 |
| 범례 | 지도 아래(`#botbar`) | 한 줄 + `자세히`로 펼침 |
| 옵션 창 | 상단 `옵션` 아래(`#optPanel`) | 보일 단지 상태·역·학교·반경·기존 건물 흐리게·점검 표시·표시선·정보 카드 |
| 상세 카드 | 지도 위 팝업 | 단지·동·기존 건물·학교·정류장·부지. 요약·확대 카드와 겹치면 아래로 비킴 |

지도에 올리는 자료원과 레이어(이름은 `app.js`의 id):

| 묶음 | 자료원 → 레이어 |
|---|---|
| 배경 | `vworld`(또는 OpenFreeMap) · `dem` → 지형·`hillshade-own` |
| 지구·단지 | `district*` → `district-mask/line/label` · `blocks` → `blk-sale/build/soon/move/plan/priv`·`blk-line*` · `block-pts` → `blk-dot`·`blk-label-lo` · `block-fronts` → `blk-badge`·`blk-badge-top` · `other-blocks` → `other-fill/line` |
| 동 | `dongs` → `dong-3d/ghost/line/shadow` · `dong-labels` → `dong-label` |
| 기존 건물 | `official` → `official-far/3d/roof/ao`·`official-shadow` · `fac-pts` → `fac-label`(기반시설 이름표) · `sel`(선택) → `sel-3d`·`sel-line*` |
| 역·학교(OSM) | `ctx-st` `ctx-sch` `ctx-ring` → `ctx-*` |
| 입주 전 점검 | `infra-*` → 신설 학교·부지·정류장·전기·통학구역·연결선·반경 |
| 버스 노선·위치 | `bus-routes` `bus-solids` `bus-lbl` → `bus-route-line` `bus-route-label` `bus-3d`(3D 버스) `bus-label`(번호) |

## 시험

```
.venv/bin/python -m unittest discover -s tests       # Python
node --test "tests/js/*.test.cjs"                     # Node (따옴표 필수)
```

| 시험 | 확인하는 것 |
|---|---|
| `tests/js/region.test.cjs` | 어댑터: 지역 고르기·단지 변환·문구·불러오기·표준코드 진입(`boot`) |
| `tests/js/infra.test.cjs` | 입주 전 점검 판정 |
| `tests/js/facility.test.cjs` | 기반시설 분류·이름표·강조색과 지도 연결(실제 계양 자료 회귀 포함) |
| `tests/js/build.test.cjs` | `scripts/build.js`(복사 범위·미리보기 지역 제외) |
| `tests/js/busapi.test.cjs` | `api/bus.js`: 호출 수 묶기(ttl, 키 수)·노선 제한·쿼리 거절·실패 처리·키 인코딩·키 교체·한도 소진·키 값이 캐시에 없음 |
| `tests/js/keys.test.cjs` `cache.test.cjs` | `lib/keys.js`(용도별 키 풀·한도·시연 프로파일) · `lib/cache.js`(TTL·50 MB 상한) |
| `tests/js/codes.test.cjs` `resolve.test.cjs` | 코드 판별과 `/api/v1/resolve`(표준코드 표·경계·필지·후퇴·오류·coverage) |
| `tests/js/vercelconf.test.cjs` | `vercel.json`: iframe 차단 헤더·함수 번들 파일 |
| `tests/js/bus.test.cjs` | 버스 계산(방향·3D 면·보간·경유 단지)과 화면 연결(옵션·요청 시에만 조회 약속) |
| `tests/js/glass.test.cjs` `sidebar.test.cjs` `topbar.test.cjs` | 반투명 유리 글자 대비 · 사이드바(글자 13px 이상·기본 접힘·요약) · 상단 바·확대 카드·가로 요약 |

화면의 실제 겹침·높이는 정적 시험이 보지 못하므로, 화면을 고친 뒤에는 `?selftest`로 열어 `window.__map`으로 레이어·위치를 확인합니다. Python 시험(번들을 만드는 도구·검증기)은 [dataset.md](dataset.md)의 "지역을 추가하거나 고칠 때"에 정리했습니다.

## 배포

Vercel은 `vercel.json`의 빌드 명령(`node scripts/build.js`)이 `index.html`·`assets/`·`regions/`만 `public/`에 모아 서비스하고, `api/bus.js`와 `api/v1/resolve.js`는 함수로 따로 배포됩니다(`lib/`는 함수가 가져가고, `regions/` 파일은 `vercel.json`의 `includeFiles`로 함께 올라갑니다). 운영 빌드(`VERCEL_ENV=production`)는 `visibility: preview` 지역을 뺍니다. `workspace/`·`tools/`·`tests/`·`docs/`와 `*.md`는 올라가지 않습니다.

**인증키**: `config.js`와 `.env*`는 저장소에 없습니다(`.gitignore`). Vercel 프로젝트 환경변수 `VWORLD_KEY`(선택: `VWORLD_LAYER`)를 넣으면 빌드가 `public/config.js`를 만들어 줍니다. 환경변수가 없으면 로컬 `config.js`, 그것도 없으면 빈 키(OpenFreeMap 회색 지도)로 빌드합니다.

```
vercel env add VWORLD_KEY production      # 값은 프롬프트에 붙여넣기
vercel env add VWORLD_KEY preview
vercel --prod
```

**공공데이터포털 키(서버 전용)**: 함수는 `lib/keys.js`의 키 풀로 키를 고릅니다. 이름은 `DATA_GO_KR_KEY_<용도>_<번호>`(용도 `BUS` 버스 위치 · `RESOLVE` 코드 해석 · `BUILD` 번들 제작 · `DEMO` 시연)이고, 같은 용도의 키가 여러 개면 오늘 가장 적게 쓴 키부터 쓰며 한도 오류(`resultCode` 22·HTTP 429)를 받은 키는 한국시간 자정까지 쉽니다. 용도 키가 없으면 `DATA_GO_KR_KEY` 하나를 씁니다. 시연일에는 `DATA_GO_KR_PROFILE=demo`로 `DEMO` 키를 먼저 쓰게 합니다. 값은 `+ / =`가 든 디코딩된 형태 그대로 적고, `NEXT_PUBLIC_` 접두를 붙이지 않습니다(브라우저로 나갑니다). 키가 없으면 함수가 503을 주고 지도는 노선 선만 보입니다. 키마다 TAGO 버스위치정보(15098533)를 **활용신청**해 두어야 합니다(자동승인). 코드 해석에는 행정표준코드(법정동코드) 신청과 `VWORLD_KEY`·`VWORLD_DOMAIN`도 필요합니다. 자세한 규칙은 [docs/product/상황판-스펙.md](docs/product/상황판-스펙.md) 6절.

```
vercel env add DATA_GO_KR_KEY_BUS_1 production   # 값은 프롬프트에 붙여넣기(번호를 늘려 가며)
vercel env add DATA_GO_KR_KEY_BUS_1 preview
vercel env add VWORLD_DOMAIN production         # 코드 해석이 V-World 를 서버에서 부를 때 보내는 서비스 도메인
```

**V-World 서버 호출 주의**: 현재 키는 서비스 URL `localhost`만 등록되어 있어 운영 주소를 `domain`으로 보내면 `INCORRECT_KEY`가 납니다. 그래서 Vercel의 `VWORLD_DOMAIN`을 `localhost`로 두었습니다(임시 방편). V-World 콘솔에 운영 도메인을 등록하면 그 값으로 바꾸세요. 함수는 서울(`vercel.json`의 `regions: ["icn1"]`)에서 실행합니다. 미국 지역에서는 V-World 호출이 연결 실패했습니다.

하루 호출은 (실시간 노선 수) × 86400 ÷ ttl 회로 묶입니다. 응답을 서버 캐시와 CDN이 ttl초(최소 60초) 동안 나눠 쓰기 때문입니다(계양 4개 노선이면 최대 5,760회, 개발계정 한도 10,000회). 노선이 늘면 ttl이 길어지고, BUS 키가 늘면 키 수만큼 짧아집니다. 로컬 캐시는 `.cache/`(gitignore, 최대 24시간·50 MB), Vercel에서는 인스턴스 임시 폴더입니다.

인증키는 결국 브라우저에 그대로 보이므로 환경변수는 '저장소에 안 올리는' 용도일 뿐이고, 실제 보호는 V-World 콘솔의 서비스 URL 제한이 전부입니다. 배포 주소(운영 도메인)를 그곳에 등록해야 배경지도가 뜹니다. 미리보기 배포 주소는 배포마다 바뀌므로 등록하지 않으면 회색 지도로 나옵니다.

`/regions/*`는 5분 캐시(`max-age=300`)라, 자료를 고쳐 다시 배포해도 최대 5분은 옛 자료가 보일 수 있습니다.

## 운영 최적화 메모

- 첫 화면(불러오는 중 안내)을 먼저 그린 뒤 스크립트를 순서대로 불러옵니다(`index.html`의 로더). 지역 자료는 `fetch`로 병렬로 받습니다.
- 지명·도로명 글자 층 6개의 정의는 `app.js`에 내장해 OpenFreeMap 스타일 JSON을 매번 받지 않습니다. 지도는 11단계 아래로 줄어들지 않습니다.
- 지형 고도는 14단계까지만 받습니다(원자료가 30 m급). 줌 12~14에서는 높이 10 m 이상 건물만 그립니다.
- 시험용 훅(`window.__map` 등)은 주소에 `?selftest`가 있을 때만 붙습니다.
- 오류가 나면 먼저 `?aa=0`(안티앨리어싱 끄기)으로 열어 보세요. 단지 모서리 표시선(`hud`)과 정보 카드(`cards`)는 기본이 꺼져 있습니다.

## 외부 서비스와 출처 표기

| 서비스 | 용도 | 비고 |
|---|---|---|
| V-World WMTS (`api.vworld.kr`) | 배경지도(white) | 인증키 필요, 최대 확대 18 |
| AWS Terrain Tiles (`s3.amazonaws.com/elevation-tiles-prod`) | 지형 고도 | 키 없음. SRTM 등 |
| OpenFreeMap (`tiles.openfreemap.org`) | 지명·도로명 글자, 키가 없을 때 대체 배경 | 키 없음 |

건물 © 국토교통부 GIS건물통합정보(V-World, CC BY 2.0 KR) · 역·학교 © OpenStreetMap contributors(ODbL). 지도 오른쪽 아래 출처 표기와 사이드바 아래쪽 문구가 지역 자료의 출처에서 자동으로 만들어집니다.
