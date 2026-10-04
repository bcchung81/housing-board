"""테스트 공용 도구. import하면 tools/ 가 sys.path 에 들어간다."""
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from datacheck.spec import load_spec  # noqa: E402

TODAY = date(2026, 10, 4)
SPEC = load_spec()
