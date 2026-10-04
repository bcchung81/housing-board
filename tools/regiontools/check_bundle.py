#!/usr/bin/env python3
"""지역 번들을 schemas/bundle/*.schema.json 으로 검증한다. 개발 전용: jsonschema 가 필요하다(.venv/bin/python).

  .venv/bin/python tools/regiontools/check_bundle.py regions           # index.json 과 모든 지역
  .venv/bin/python tools/regiontools/check_bundle.py regions/<slug>    # 지역 하나

JSON Schema 가 못 잡는 교차 규칙도 본다: 출처 id 존재, 단지 id 중복, projectOrder 참조, 기본 지역 하나, 폴더·slug 일치.
종료 코드: 0 = 오류 없음, 1 = 오류 있음, 2 = 사용법·경로 오류
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

SCHEMAS = Path(__file__).resolve().parents[2] / "schemas" / "bundle"
REGION_FILES = {"region.json": "region", "projects.json": "projects", "buildings.json": "buildings", "context.json": "context"}
OPTIONAL_FILES = {"context.json"}


def _schema_errors(label: str, data, name: str) -> list[str]:
    from jsonschema import Draft202012Validator

    schema = json.loads((SCHEMAS / f"{name}.schema.json").read_text(encoding="utf-8"))
    errors = []
    for e in sorted(Draft202012Validator(schema).iter_errors(data), key=lambda e: [str(p) for p in e.absolute_path]):
        where = "/".join(str(p) for p in e.absolute_path) or "(최상위)"
        errors.append(f"{label}: {where}: {e.message[:200]}")
    return errors


def _read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def _semantic(region: dict, projects: dict) -> list[str]:
    errors = []
    source_ids = {s.get("id") for s in region.get("sources", []) if isinstance(s, dict)}
    seen: dict = {}
    for i, p in enumerate(projects.get("projects", [])):
        if not isinstance(p, dict):
            continue
        pid = p.get("id")
        if pid in seen:
            errors.append(f"projects.json: 단지 id 중복: {pid!r} (#{seen[pid]}, #{i})")
        else:
            seen[pid] = i
        for sid in p.get("sources") or []:
            if sid not in source_ids:
                errors.append(f"projects.json: 단지 {pid!r}의 출처 id {sid!r}가 region.json의 sources에 없음")
        progress = p.get("progress")
        if isinstance(progress, dict) and progress.get("source") and progress["source"] not in source_ids:
            errors.append(f"projects.json: 단지 {pid!r}의 progress.source {progress['source']!r}가 region.json의 sources에 없음")
    for pid in region.get("projectOrder") or []:
        if pid not in seen:
            errors.append(f"region.json: projectOrder의 {pid!r}가 projects.json에 없음")
    return errors


def check_region_dir(path: Path | str) -> list[str]:
    path = Path(path)
    errors: list[str] = []
    data: dict = {}
    for fname, schema in REGION_FILES.items():
        f = path / fname
        if not f.exists():
            if fname not in OPTIONAL_FILES:
                errors.append(f"{path.name}/{fname}: 파일이 없음")
            continue
        try:
            data[fname] = _read_json(f)
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            errors.append(f"{path.name}/{fname}: JSON을 읽을 수 없음: {e}")
            continue
        errors += _schema_errors(f"{path.name}/{fname}", data[fname], schema)
    region, projects = data.get("region.json"), data.get("projects.json")
    if isinstance(region, dict) and region.get("slug") != path.name:
        errors.append(f"region.json: slug {region.get('slug')!r}가 폴더 이름 {path.name!r}와 다름")
    if isinstance(region, dict) and isinstance(projects, dict):
        errors += _semantic(region, projects)
    return errors


def check_index(path: Path | str) -> list[str]:
    path = Path(path)
    try:
        data = _read_json(path)
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        return [f"index.json: JSON을 읽을 수 없음: {e}"]
    errors = _schema_errors("index.json", data, "index")
    regions = [r for r in (data.get("regions", []) if isinstance(data, dict) else []) if isinstance(r, dict)]
    defaults = [r.get("slug") for r in regions if r.get("default")]
    if len(defaults) != 1:
        errors.append(f"index.json: default: true 인 지역이 정확히 하나여야 함 (현재 {len(defaults)}개: {defaults})")
    slugs = [r.get("slug") for r in regions]
    for slug in sorted({s for s in slugs if slugs.count(s) > 1}):
        errors.append(f"index.json: 지역 slug 중복: {slug!r}")
    for slug in slugs:
        if not (path.parent / str(slug) / "region.json").exists():
            errors.append(f"index.json: 지역 {slug!r}의 폴더(region.json)가 없음")
    return errors


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="check_bundle", description="지역 번들을 스키마로 검증한다.")
    ap.add_argument("path", help="regions 폴더 또는 지역 폴더 하나")
    args = ap.parse_args(argv)
    p = Path(args.path)
    if not p.exists():
        print(f"오류: 경로가 없음: {p}")
        return 2
    try:
        import jsonschema  # noqa: F401
    except ImportError:
        print("오류: jsonschema 가 필요함 — .venv/bin/python 으로 실행하세요")
        return 2
    errors: list[str] = []
    if (p / "index.json").exists():
        errors += check_index(p / "index.json")
        for d in sorted(x for x in p.iterdir() if x.is_dir() and (x / "region.json").exists()):
            errors += check_region_dir(d)
    elif (p / "region.json").exists():
        errors += check_region_dir(p)
    else:
        print("오류: index.json 도 region.json 도 없음")
        return 2
    for e in errors:
        print("오류:", e)
    print(f"검증 {'통과' if not errors else '실패'}: 오류 {len(errors)}건")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
