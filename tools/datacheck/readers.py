"""입력 파일 읽기: CSV, GeoJSON."""
from __future__ import annotations

import csv
import io
import json
from pathlib import Path

from .model import Row, Table


def read_csv(path: Path | str, name: str) -> Table:
    """UTF-8(BOM 허용) CSV를 읽는다. UTF-8이 아니면 UnicodeDecodeError를 낸다."""
    text = Path(path).read_bytes().decode("utf-8-sig")
    raw = list(csv.reader(io.StringIO(text, newline="")))
    header = [h.strip() for h in raw[0]] if raw else []
    rows: list[Row] = []
    for cells in raw[1:]:
        if not any(c.strip() for c in cells):
            continue  # 끝의 빈 줄 등
        values = {h: (cells[i].strip() if i < len(cells) else "") for i, h in enumerate(header)}
        rows.append(Row(len(rows) + 1, values))
    return Table(name, header, rows)


def read_geojson_table(path: Path | str, name: str, slug: str) -> tuple[Table, list[dict]]:
    """GeoJSON FeatureCollection을 표로 읽는다. 각 Feature의 properties가 한 행이 된다.

    행에는 region_slug 가 자동으로 들어간다(참조 검사용). 형식이 틀리면 ValueError.
    """
    data = json.loads(Path(path).read_text(encoding="utf-8-sig"))
    if not isinstance(data, dict) or data.get("type") != "FeatureCollection" or not isinstance(data.get("features"), list):
        raise ValueError("FeatureCollection이 아님")
    features = data["features"]
    rows: list[Row] = []
    keys: list[str] = []
    for i, feature in enumerate(features, start=1):
        props = feature.get("properties") if isinstance(feature, dict) else None
        props = props if isinstance(props, dict) else {}
        for k in props:
            if k not in keys:
                keys.append(k)
        values = {k: ("" if v is None else str(v)).strip() for k, v in props.items()}
        values["region_slug"] = slug
        rows.append(Row(i, values))
    return Table(name, keys, rows), features
