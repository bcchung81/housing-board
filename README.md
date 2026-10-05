# 주택파동 공급 지도

공공주택 공급 현황을, 국토교통부 GIS건물통합정보(V-World) 공식 건물 위에 3차원으로 보여 주는 지도입니다. 지역마다 자료 묶음(번들)만 바꿔 끼우면 같은 화면으로 다른 지역을 보여 줍니다.

지금 올라 있는 지역: **인천 계양구**(계양 테크노밸리, 기본) · **광주 광산구**(선운2지구) · **전남 나주시**(빛가람 혁신도시).

데이터(번들 구조·수집한 원천·가공 과정)는 이 파일에 두지 않고 **[dataset.md](dataset.md)** 에 모았습니다.

## 실행

지역 자료(`regions/*.json`)를 `fetch`로 읽으므로 **더블클릭(`file://`)으로는 열리지 않고, 정적 서버가 필요합니다.**

```
python3 -m http.server 8000      # 이 폴더에서
# 브라우저에서 http://localhost:8000/ 을 엽니다
```

- 화면에 `지역 자료를 불러오지 못했습니다. regions/index.json: Failed to fetch`가 뜨면 `file://`로 열었거나 서버가 꺼져 있는 것입니다. 서버를 켜고 `http://localhost:포트/`로 여세요.
- 인터넷이 필요합니다: 배경지도(V-World), 지형 고도(AWS), 지명 글자(OpenFreeMap)를 내려받습니다.
- V-World 배경을 쓰려면 `config.js`에 인증키를 넣습니다(`config.example.js` 참고). 비어 있으면 OpenFreeMap 회색 지도로 대신 나옵니다.
- 지역이 둘 이상이면 지역 선택기가 보입니다(사이드바 맨 위, 사이드바가 접혀 있을 때는 지도 오른쪽 위 요약 카드 왼쪽 위). 지역 목록에 없는 `?region=` 값은 안내 화면이 뜹니다.

주소 매개변수(모두 선택). 화면에서 바꾸면 주소에도 반영되어 링크가 보던 상태를 따라갑니다.

| 매개변수 | 값 | 동작 |
|---|---|---|
| `region` | slug | 열 지역(없으면 기본 지역). 지역을 바꾸면 `block`은 지워집니다 |
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
vercel.json  .vercelignore   배포 설정(캐시 헤더 · 올라가면 안 되는 파일 제외)
assets/
  css/app.css            화면 모양 (반투명 유리 변수 --glass-*)
  js/region.js           지역 로더와 어댑터 (순수 함수 + 얇은 DOM 부분)
  js/infra.js            입주 전 점검 판정 (순수 함수)
  js/facility.js         기존 건물 시설 분류 (순수 함수)
  js/app.js              화면 동작 (지도·레이어·HUD·카드·옵션·사이드바)
  vendor/maplibre-gl/    MapLibre GL JS 5.24.0 (자체 호스팅, BSD-3, LICENSE.txt 동봉)
regions/                 지역별 자료 묶음(번들) — 구조는 dataset.md
schemas/                 번들·입력 규격(JSON Schema)
tools/                   데이터를 만들고 검증하는 도구 — dataset.md
dataset.md               지도 데이터 (쓰는 것 · 만드는 절차 · 안 쓰는 것 · 구조 · 수집 출처 · 가공 과정)
docs/                    데이터 인터페이스 정의서(docs/data-interface/)와 설계 문서(docs/superpowers/)
scripts/build.js         Vercel 빌드
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

1. **`index.html`** — 첫 화면(불러오는 중 안내)을 먼저 그린 뒤, `maplibre-gl.js` · `region.js` · `infra.js` · `facility.js`를 병렬로 받아 **받은 순서가 아니라 적힌 순서대로** 실행합니다.
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

## 시험

```
.venv/bin/python -m unittest discover -s tests       # Python
node --test "tests/js/*.test.cjs"                     # Node (따옴표 필수)
```

| 시험 | 확인하는 것 |
|---|---|
| `tests/js/region.test.cjs` | 어댑터: 지역 고르기·단지 변환·문구·불러오기 |
| `tests/js/infra.test.cjs` | 입주 전 점검 판정 |
| `tests/js/facility.test.cjs` | 기반시설 분류·이름표·강조색과 지도 연결(실제 계양 자료 회귀 포함) |
| `tests/js/build.test.cjs` | `scripts/build.js`(복사 범위·미리보기 지역 제외) |
| `tests/js/glass.test.cjs` `sidebar.test.cjs` `topbar.test.cjs` | 반투명 유리 글자 대비 · 사이드바(글자 13px 이상·기본 접힘·요약) · 상단 바·확대 카드·가로 요약 |

화면의 실제 겹침·높이는 정적 시험이 보지 못하므로, 화면을 고친 뒤에는 `?selftest`로 열어 `window.__map`으로 레이어·위치를 확인합니다. Python 시험(번들을 만드는 도구·검증기)은 [dataset.md](dataset.md)의 "지역을 추가하거나 고칠 때"에 정리했습니다.

## 배포

Vercel은 `vercel.json`의 빌드 명령(`node scripts/build.js`)이 `index.html`·`assets/`·`regions/`만 `public/`에 모아 서비스합니다. 운영 빌드(`VERCEL_ENV=production`)는 `visibility: preview` 지역을 뺍니다. `workspace/`·`tools/`·`tests/`·`docs/`와 `*.md`는 올라가지 않습니다.

**인증키**: `config.js`와 `.env*`는 저장소에 없습니다(`.gitignore`). Vercel 프로젝트 환경변수 `VWORLD_KEY`(선택: `VWORLD_LAYER`)를 넣으면 빌드가 `public/config.js`를 만들어 줍니다. 환경변수가 없으면 로컬 `config.js`, 그것도 없으면 빈 키(OpenFreeMap 회색 지도)로 빌드합니다.

```
vercel env add VWORLD_KEY production      # 값은 프롬프트에 붙여넣기
vercel env add VWORLD_KEY preview
vercel --prod
```

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
