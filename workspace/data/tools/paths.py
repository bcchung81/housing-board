"""가공 도구가 공통으로 쓰는 경로. 폴더를 옮기면 여기만 고친다.

  <루트>/data/                      화면(index.html)이 읽는 운영 데이터(JS)  ← 도구가 여기에 쓴다
  <루트>/workspace/data/raw/        내려받은 원본(수정하지 않음)
  <루트>/workspace/data/processed/  분석용 정리본(CSV·요약 JSON)
"""
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parent.parent.parent   # <루트>/workspace
ROOT = WORKSPACE.parent                                      # <루트>
PROD_DATA = ROOT / "data"
RAW = WORKSPACE / "data" / "raw"
PROCESSED = WORKSPACE / "data" / "processed"
