# 주택파동 공급 지도

공공주택 공급 현황을, 국토교통부 GIS건물통합정보(V-World) 공식 건물 위에 3차원으로 보여 주는 지도입니다. 지역마다 자료 묶음(번들)만 바꿔 끼우면 같은 화면으로 다른 지역을 보여 줍니다.

지금 올라 있는 지역: **인천 계양구**(계양 테크노밸리, 기본) · **광주 광산구**(선운2지구) · **전남 나주시**(빛가람 혁신도시).

## 실행

지역 자료(`regions/*.json`)를 `fetch`로 읽으므로 **더블클릭(`file://`)으로는 열리지 않고, 정적 서버가 필요합니다.**

```
python3 -m http.server 8000      # 이 폴더에서
# 브라우저에서 http://localhost:8000/ 을 엽니다
```

- 인터넷이 필요합니다: 배경지도(V-World), 지형 고도(AWS), 지명 글자(OpenFreeMap)를 내려받습니다.
- V-World 배경을 쓰려면 `config.js`에 인증키를 넣습니다(`config.example.js` 참고). 비어 있으면 OpenFreeMap 회색 지도로 대신 나옵니다.
- 주소 매개변수(선택): `?region=jeonnam-naju` 지역 · `block=A6` 단지 열기 · `mode=progress|time` 보기 기준 · `theme=night` 야간 · `ctx=0` 역·학교 끄기 · `ring=1` 역 반경 원 · `hud=0` HUD 끄기 · `priv=0` 공공택지 민간 단지 숨기기 · `aa=0` 안티앨리어싱 끄기(저사양).
- 지역이 둘 이상이면 왼쪽 위에 지역 선택기가 보입니다. 지역 목록에 없는 `?region=` 값은 안내 화면이 뜹니다.

## 폴더 구조

```
index.html               운영 진입점 (지역 불러오기 → 키 → 앱 순으로 스크립트를 읽음)
config.js                V-World 인증키 등 설정 (공유 금지) / config.example.js 는 키가 빈 견본
vercel.json  .vercelignore   배포 설정(캐시 헤더 · 올라가면 안 되는 파일 제외)
assets/
  css/app.css            화면 모양 (반투명 유리 변수 --glass-*)
  js/region.js           지역 번들 로더와 어댑터 (번들 → 화면이 쓰는 전역 모양)
  js/app.js              화면 동작 (지도·레이어·HUD·카드·옵션)
  vendor/maplibre-gl/    MapLibre GL JS 5.24.0 (자체 호스팅, BSD-3, LICENSE.txt 동봉)
regions/                 지도가 읽는 지역 번들
  index.json             지역 목록(어느 지역이 기본인지, public/preview)
  <slug>/                region.json · projects.json · buildings.json · context.json
schemas/                 입력 규격과 번들 JSON Schema
tools/                   데이터 도구(검증기·번들 검증·계양 이전·API 빌더)
docs/data-interface/     팀원에게 보내는 데이터 인터페이스 정의서(Markdown·PDF·템플릿·예시)
docs/superpowers/        설계 문서(스펙)와 계획
scripts/build.js         Vercel 빌드
tests/                   Python(unittest)·Node(node --test) 시험
workspace/               작업 영역 — 배포하지 않음 (원천 자료, 기획 문서, 영상)
```

## 지역을 추가하거나 고칠 때

1. 팀원이 입력 규격(`docs/data-interface/정의서.md`)대로 CSV·GeoJSON을 만들고 `python3 tools/validate_input.py`로 점검합니다.
2. 입력이 번들(`regions/<slug>/*.json`)로 컴파일됩니다. 지금은 API 빌더(`tools/regiontools/build_region.py`)가 광산구·나주를, `tools/regiontools/migrate_legacy.py`가 계양의 옛 자료를 번들로 만듭니다. 번들의 필드와 화면 규칙은 `docs/data-interface/번들-어댑터-정의서.md`에 있습니다.
3. 번들을 검증합니다(`jsonschema` 필요, `python3 -m venv .venv && .venv/bin/pip install jsonschema markdown`).

```
.venv/bin/python tools/regiontools/check_bundle.py regions            # index.json 과 모든 지역
.venv/bin/python tools/regiontools/check_bundle.py regions/<slug>     # 지역 하나
```

4. `regions/index.json`에 지역을 올립니다(`visibility: preview`이면 운영 배포에서는 빠집니다).

## 시험

```
.venv/bin/python -m unittest discover -s tests       # Python
node --test "tests/js/*.test.cjs"                     # Node (따옴표 필수)
```

## 배포

Vercel은 `vercel.json`의 빌드 명령(`node scripts/build.js`)이 `index.html`·`assets/`·`regions/`만 `public/`에 모아 서비스합니다. 운영 빌드(`VERCEL_ENV=production`)는 `visibility: preview` 지역을 뺍니다. `workspace/`·`tools/`·`tests/`·`docs/`와 `*.md`는 올라가지 않습니다.

**인증키**: `config.js`와 `.env*`는 저장소에 없습니다(`.gitignore`). Vercel 프로젝트 환경변수 `VWORLD_KEY`(선택: `VWORLD_LAYER`)를 넣으면 빌드가 `public/config.js`를 만들어 줍니다. 환경변수가 없으면 로컬 `config.js`, 그것도 없으면 빈 키(OpenFreeMap 회색 지도)로 빌드합니다. 공공데이터포털 키 등 수집용 키는 `.env.local`에만 두며 배포에는 쓰지 않습니다.

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
- 오류가 나면 먼저 `?aa=0`(안티앨리어싱 끄기)과 `hud=0`(HUD 끄기)으로 열어 보세요.

## 외부 서비스와 출처 표기

| 서비스 | 용도 | 비고 |
|---|---|---|
| V-World WMTS (`api.vworld.kr`) | 배경지도(낮 white · 밤 midnight) | 인증키 필요, 최대 확대 18 |
| AWS Terrain Tiles (`s3.amazonaws.com/elevation-tiles-prod`) | 지형 고도 | 키 없음. SRTM 등 |
| OpenFreeMap (`tiles.openfreemap.org`) | 지명·도로명 글자, 키가 없을 때 대체 배경 | 키 없음 |

건물 © 국토교통부 GIS건물통합정보(V-World, CC BY 2.0 KR) · 역·학교 © OpenStreetMap contributors(ODbL). 지도 오른쪽 아래 출처 표기와 사이드바 아래쪽 문구가 지역 자료의 출처에서 자동으로 만들어집니다.

## 알아둘 점

- 블록 윤곽은 V-World 공식 자료이고, 동(棟) 윤곽과 높이는 지역에 따라 실제 건물 자료이거나 **근사값**(10~20 m)입니다. 사이드바 아래 문구에 어느 쪽인지 적힙니다.
- 기존 건물 높이는 공식 높이 · 층수 환산 · 정보 없음(3 m 평면)으로 나뉘며 지도 아래 막대에 비율이 나옵니다. 건물 색조(용도·연식)와 그림자는 보기 좋게 한 **장식**이며 실제 일조 계산이 아닙니다.
- '입주 시기' 보기는 공사 기간을 직선으로 나눈 추정입니다.
- 광산구·나주 자료는 공공 API와 LH 공고에서 모았고 **이용조건이 확인되지 않은 자료가 있습니다**(`region.json`의 `sources[].redistributable`이 `unknown`). 재배포 전에 제공기관 이용조건을 확인하세요.
