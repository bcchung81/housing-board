"""가공 도구가 공통으로 쓰는 경로. 폴더를 옮기면 여기만 고친다.

  <루트>/workspace/data/legacy/     옛 계양 운영 데이터(JS)  ← 도구가 여기에 쓴다. 화면은 regions/ 번들을 읽으므로
                                    번들로 옮기려면: python3 tools/regiontools/migrate_legacy.py --src workspace/data/legacy --out regions/incheon-gyeyang
  <루트>/workspace/data/raw/        내려받은 원본(수정하지 않음)
  <루트>/workspace/data/processed/  분석용 정리본(CSV·요약 JSON)
"""
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parent.parent.parent   # <루트>/workspace
ROOT = WORKSPACE.parent                                      # <루트>
PROD_DATA = WORKSPACE / "data" / "legacy"
PROD_DATA.mkdir(parents=True, exist_ok=True)
RAW = WORKSPACE / "data" / "raw"
PROCESSED = WORKSPACE / "data" / "processed"
