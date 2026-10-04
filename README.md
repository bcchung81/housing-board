# 주택파동 공급 지도 (인천 계양구)

인천 계양 테크노밸리 공공주택(A2·A3·A6·A9·A10·A17) 공급 현황을, 국토교통부 GIS건물통합정보(V-World) 공식 건물 위에 3차원으로 보여 주는 지도입니다.

## 실행

**`index.html`을 더블클릭하면 됩니다.** 서버도 빌드도 필요 없습니다(모든 파일을 상대 경로의 일반 스크립트로 읽습니다).

- 인터넷이 필요합니다: 배경지도(V-World), 지형 고도(AWS), 지명 글자(OpenFreeMap)를 내려받습니다.
- V-World 배경을 쓰려면 `config.js`에 인증키를 넣습니다(`config.example.js` 참고). 비어 있으면 OpenFreeMap 회색 지도로 대신 나옵니다.
- 주소 매개변수(선택): `?block=A6` 단지 열기 · `mode=progress|time` 보기 기준 · `theme=night` 야간 · `ctx=0` 역·학교 끄기 · `ring=1` 역 반경 원 · `hud=0` HUD 끄기 · `aa=0` 안티앨리어싱 끄기(저사양).

## 폴더 구조

```
index.html               운영 진입점
config.js                V-World 인증키 등 설정 (공유 금지) / config.example.js 는 키가 빈 견본
vercel.json  .vercelignore   배포 설정(캐시 헤더 · workspace/ 제외)
assets/
  css/app.css            화면 모양
  js/app.js              화면 동작 (지도·레이어·HUD·카드·옵션)
  vendor/maplibre-gl/    MapLibre GL JS 5.24.0 (자체 호스팅, BSD-3, LICENSE.txt 동봉)
data/                    지도가 읽는 운영 데이터 3개 (자세한 설명: data/README.md)
workspace/               작업 영역 — 배포하지 않음 (자세한 설명: workspace/README.md)
  data/                  원천(raw) · 정리본(processed) · 가공 도구(tools) · 데이터 README
  docs/                  기획 문서, 발표자료, 평가 기준
  videos/                소개 영상(HyperFrames) 프로젝트
```

## 데이터를 다시 만들 때

원천 → 운영 데이터는 `workspace/data/tools/`의 스크립트가 만듭니다(표준 라이브러리 중심. 팸플릿 읽기만 Pillow·poppler 필요).

```
python3 workspace/data/tools/vworld_buildings/build_buildings.py   # 건물 윤곽·높이  → data/gyeyang_buildings.js
python3 workspace/data/tools/lh_projects/build_projects.py          # 단지·동·공정율  → data/gyeyang_projects.js
python3 workspace/data/tools/context/build_context.py               # 역·학교(OSM)    → data/gyeyang_context.js
python3 workspace/data/tools/molit_tidy.py                          # 통계누리 정리본 → workspace/data/processed/
```

폴더를 옮기면 `workspace/data/tools/paths.py`만 고치면 됩니다.

## 배포

`workspace/`(원천 159 MB 포함)는 올리지 않습니다. Vercel 등 정적 호스팅에는 루트를 그대로 올리고 `.vercelignore`가 `workspace/`를 빼 줍니다.
배포 주소는 V-World 콘솔의 서비스 URL에 등록해야 배경지도가 뜹니다. 인증키는 브라우저에 그대로 보이므로 URL 제한이 보호 수단의 전부입니다.

## 운영 최적화 메모

- 첫 화면(불러오는 중 안내)을 먼저 그린 뒤 무거운 스크립트를 순서대로 불러옵니다(`index.html`의 로더). 큰 파일은 `preload`로 미리 받습니다.
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

건물 © 국토교통부 GIS건물통합정보(V-World, CC BY 2.0 KR) · 지구경계·역·학교 © OpenStreetMap contributors(ODbL). 지도 오른쪽 아래 출처 표기에 자동으로 나옵니다.

## 알아둘 점

- 동(棟) 윤곽과 높이는 LH 팸플릿을 맞춘 **근사값**(10~20 m)이고, 블록 윤곽은 V-World 공식 자료입니다.
- 기존 건물 높이는 공식 59% · 층수 환산 18% · 정보 없음 23%(3 m 평면)입니다. 건물 색조(용도·연식)와 그림자는 보기 좋게 한 **장식**이며 실제 일조 계산이 아닙니다.
- '입주 시기' 보기는 공사 기간을 직선으로 나눈 추정입니다.
