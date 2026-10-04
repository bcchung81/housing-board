# workspace — 작업 영역 (배포하지 않음)

운영 화면(루트 `index.html`)에 필요 없는 모든 것이 여기 있습니다.

| 폴더 | 내용 |
|---|---|
| `data/` | 원천(`raw/`, 기관별 하위 폴더) · 정리본(`processed/`) · 가공 도구(`tools/`) · 데이터 설명(`README.md`) |
| `docs/` | 기획 문서(`request.md`, 정책근거·요구사항 매트릭스, 신청 API 정리), 평가 기준(`eval/`), 발표자료 HTML 2종(`media/` 포함), 기획서 발표 초안(`발표자료_pptx/deck.pptx·pdf`, 2026-10-02), 참고 이미지(`view/`) |
| `videos/` | 소개 영상 HyperFrames 프로젝트(`housing-wave-intro/`) |

## 옛 경로 → 새 경로 (2026-10-04 정리)

| 옛 경로 | 새 경로 |
|---|---|
| `docs/주택파동_3D지형_테스트.html` | `index.html` + `assets/css/app.css` + `assets/js/app.js` (옛 단일 파일은 정리하며 삭제) |
| `docs/vworld-key.js` | `config.js` |
| `data/processed/gyeyang_{buildings,projects,context}.js` | `data/gyeyang_{buildings,projects,context}.js` (루트) |
| `data/processed/*.csv · *summary.json` | `workspace/data/processed/` |
| `data/raw/15…csv · 3045249…csv` | `workspace/data/raw/datagokr/` |
| `data/raw/molit_*.csv` | `workspace/data/raw/molit/` |
| `data/raw/LH_*공고문*.pdf` · `LH_*팸플릿*.pdf` | `workspace/data/raw/lh/notices/` · `lh/pamphlets/` |
| `data/raw/lh_cwstt/` · `lh_public/` | `workspace/data/raw/lh/cwstt/` · `lh/public/` |
| `data/raw/vworld_*` | `workspace/data/raw/vworld/` |
| `data/tools/` · `data/README.md` | `workspace/data/tools/` · `workspace/data/README.md` |
| `docs/` · `videos/` | `workspace/docs/` · `workspace/videos/` |
