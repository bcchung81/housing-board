# data — 지도가 읽는 운영 데이터

`index.html`이 `<script>`로 읽는 3개 파일입니다. 원천과 가공 과정은 `workspace/data/README.md`에 있고, 아래 스크립트가 이 파일들을 직접 만듭니다.

| 파일 | 전역 변수 | 내용 | 크기 | 기준일 | 만드는 스크립트 |
|---|---|---|---|---|---|
| `gyeyang_buildings.js` | `window.GY_BUILDINGS` | 계양구 건물 16,724동의 윤곽(GeoJSON)과 높이 | 6.0 MB | 2026-09-06 | `vworld_buildings/build_buildings.py` |
| `gyeyang_projects.js` | `window.GY_PROJECTS` | 공급 단지 6곳(윤곽·동·층수·공정율·입주), 지구 경계, 이름 모르는 용지 22곳 | 40 KB | 2026-09-30 | `lh_projects/build_projects.py` |
| `gyeyang_context.js` | `window.GY_CONTEXT` | 지하철역 5곳·학교 16곳(OSM) | 1.5 KB | 2026-10-03 | `context/build_context.py` |

## gyeyang_buildings.js
`features[].properties`: `eh` 화면 높이(m) · `src` 높이 출처(`공식높이` 9,932 / `층수환산` 2,958 / `정보없음` 3,834) · `h` 공식 높이 · `f` 지상층수 · `b` 지하층수 · `u` 용도 · `n` 건물명 · `a` 사용승인 연도 · `d` 법정동 · `x` 높이·층수 불일치 의심(1).
좌표는 WGS84 소수 6자리. 출처 © 국토교통부 GIS건물통합정보(V-World), **CC BY 2.0 KR** — 이용 시 출처를 표시해야 합니다.

## gyeyang_projects.js
`blocks[]`: `id`(A2…) · `status`(분양중/건설 단계/준공 임박/계획) · `units` · `dongCount` · `moveIn` · `progress{rate,asOf,start,end,history}` · `poly`(V-World 공식 블록 윤곽) · `dongs[]`(근사 윤곽과 층수) · `builder` · `outlineHow`. `district`, `otherBlocks`, `meta`(방법·출처·맞춤 정확도)가 함께 있습니다.
'준공 임박'은 이 프로젝트의 정의입니다: 공정율 90% 이상이고 입주가 3개월 안.

## gyeyang_context.js
`stations[]`, `schools[]` 각각 `{name, lon, lat}`. © OpenStreetMap contributors (**ODbL**). 새로 짓는 학교·역은 OSM에 아직 없을 수 있습니다.

## 갱신 순서
원천 파일을 `workspace/data/raw/`에 새로 받은 뒤 위 스크립트를 실행하면 같은 이름으로 덮어씁니다. 각 파일 맨 윗줄 주석에 만든 스크립트가 적혀 있습니다.
