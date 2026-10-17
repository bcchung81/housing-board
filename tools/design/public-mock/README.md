# 대국민 모드 시안 빌드 원본

`docs/design/대국민-모드-시안.html` 을 만드는 원본이다. 시안은 앱에 연결하지 않은 독립 HTML 이다.

```sh
cd tools/design/public-mock
python3 build_data.py data.json   # 저장소 자료(data/board/*.json)에서 색인·지도·일정 추출
node build.js                     # template.html + search.js + data.json → docs/design/대국민-모드-시안.html(데모판) + assets/citizen/index.html(운영판, /citizen)
node search.test.js               # 검색·카드·라벨 시험
```

- `measure.js`: 브라우저에서 실행하는 화면 측정 스크립트(v7). G1 넘침·잘림·오류, G3 누르는 크기, G5 첫 화면, G6 라벨 겹침(그려진 글자의 실제 getBBox), G7 기둥이 가리는 면 넓이, G9 글자 크기, G13 문서 높이, G14 금지어, G15 기둥 정합을 잰다(`docs/design/대국민-모드-반복개선-메타프롬프트.md` 4절). 콘솔 오류는 페이지보다 먼저 심은 `window.__errs` 를 읽는다.
- 화면 구성(v7): 한 화면(1440×900 스크롤 없음) = 검색 띠 → [요약 카드 | 3D 지도(평평한 판 + 시군구 기둥, 높이 = 호수 선형)] → [일정 · 언제 들어오나 · 사업] → 출처 한 줄. '전체 n' 은 옆 시트, 9구역은 담당자 모드에서만.
- `data.json` 의 `hh` 는 통계청 장래가구추계(`data/board/area-facts.json`)의 올해 → 내년 가구 증가(시도 단위, 서울·인천·경기)다.
- `data.json` 은 생성물이라 커밋하지 않는다.

- 두 판(build.js): 데모판은 시안 상태 막대·흉내 동작(IP 추천·현 위치·주소 묶음)과 이동 주소 출력. 운영판은 실제 이동(location.assign), 머리 메뉴 실제 경로, `/api/v1/geo` 시도 추천(실패면 시도 고르기 칩), [현 위치]는 브라우저 안 경계 판정(좌표를 보내지 않음), 주소 검색은 `/api/v1/codes/search`. 운영판도 `?demo=1` 이면 상태 막대를 보인다.
- 큰 지도 연결 주소는 `lib/board/map-href.ts` 를 그대로 옮긴 `mapHref`·`mapScopeHref`(시험이 같은 결과인지 확인).
