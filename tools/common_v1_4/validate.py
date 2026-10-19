"""공통규격 v1.4 CSV 8종 검증. convert.py 가 끝에 부르고, 따로도 돌릴 수 있다.

  python3 tools/common_v1_4/validate.py [출력 폴더] [--spec-zip 양식.zip]

검사: UTF-8 BOM·헤더 일치, 필수 칸, 허용값, 날짜(YYYY-MM-DD·YYYY-MM)·숫자 형식, NULL 대용 글자, 로컬 사업 ID 중복,
참조 무결성(사업·원천·정책·프로그램), DEMO 행, 행 중복, 인증키처럼 보이는 값. 오류가 있으면 종료 코드 1.
"""
from __future__ import annotations

import csv
import datetime as dt
import re
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import spec  # noqa: E402

BOM = b"\xef\xbb\xbf"
NULLISH = {"null", "none", "nan", "n/a", "na", "-"}
SECRET = re.compile(r"(servicekey|api[_-]?key|access[_-]?token|[?&]key=)|[A-Za-z0-9+/=%]{40,}", re.I)


def read(path: Path) -> tuple[list[str], list[dict], bool]:
    raw = path.read_bytes()
    rows = list(csv.reader(raw.decode("utf-8-sig").splitlines()))
    head = rows[0] if rows else []
    return head, [dict(zip(head, r)) for r in rows[1:]], raw.startswith(BOM)


def date_ok(value: str, kind: str) -> bool:
    for fmt, k in (("%Y-%m-%d", "day"), ("%Y-%m", "month")):
        if kind in (k, "either") and re.fullmatch(r"\d{4}-\d{2}(-\d{2})?", value):
            try:
                dt.datetime.strptime(value, fmt)
                return True
            except ValueError:
                pass
    return False


def spec_zip_headers(zip_path: Path) -> dict[str, list[str]]:
    """양식 ZIP 의 CSV 헤더(파일 이름 끝의 _projects.csv 같은 영문 꼬리로 짝짓는다)."""
    out = {}
    with zipfile.ZipFile(zip_path) as z:
        for info in z.infolist():
            name = info.filename
            if not info.flag_bits & 0x800:   # UTF-8 표시가 없는 이름은 cp437 로 읽혀 있다
                try:
                    name = name.encode("cp437").decode("utf-8")
                except UnicodeError:
                    pass
            for key, (fname, _) in spec.FILES.items():
                if name.endswith(fname.split("_", 1)[1]):
                    out[key] = z.read(info).decode("utf-8-sig").splitlines()[0].split(",")
    return out


def validate(out_dir: Path, spec_zip: Path | None = None) -> tuple[list[str], dict[str, int]]:
    errors: list[str] = []
    data: dict[str, list[dict]] = {}
    for key, (fname, header) in {**spec.FILES, "review": spec.REVIEW_FILE}.items():
        path = out_dir / fname
        if not path.exists():
            errors.append(f"{fname}: 파일 없음")
            data[key] = []
            continue
        head, rows, bom = read(path)
        if not bom:
            errors.append(f"{fname}: UTF-8 BOM 없음")
        if head != header:
            errors.append(f"{fname}: 헤더가 규격과 다름 {head}")
        data[key] = rows
        seen = set()
        for i, r in enumerate(rows, start=2):
            where = f"{fname}:{i}"
            if len(r) != len(header):
                errors.append(f"{where}: 열 수 {len(r)} ≠ {len(header)}")
            line = tuple(r.get(h, "") for h in header)
            if line in seen:
                errors.append(f"{where}: 같은 행이 이미 있음")
            seen.add(line)
            for h, v in r.items():
                if v.strip().lower() in NULLISH:
                    errors.append(f"{where}: {h} 에 NULL 대용 글자 '{v}' (빈 칸으로 둔다)")
                if v != v.strip():
                    errors.append(f"{where}: {h} 앞뒤 공백")
                if SECRET.search(v):
                    errors.append(f"{where}: {h} 에 인증키처럼 보이는 값")
            if key == "review":
                continue
            for h in spec.REQUIRED.get(key, []):
                if not r.get(h):
                    errors.append(f"{where}: 필수 칸 {h} 비어 있음")
            for h, allowed in spec.ENUMS.get(key, {}).items():
                if r.get(h) and r[h] not in allowed:
                    errors.append(f"{where}: {h}='{r[h]}' 허용값 아님")
            for h, kind in spec.DATES.get(key, {}).items():
                if r.get(h) and not date_ok(r[h], kind):
                    errors.append(f"{where}: {h}='{r[h]}' 날짜 형식 아님")

    projects = {r["local_project_id"] for r in data["projects"]}
    if len(projects) != len(data["projects"]):
        errors.append("사업_projects.csv: local_project_id 중복")
    if any(r.get("is_demo") != "false" for r in data["projects"]):
        errors.append("사업_projects.csv: DEMO 행이 제출본에 있음")
    sources = [r["source_ref"] for r in data["sources"]]
    if len(set(sources)) != len(sources):
        errors.append("원천_sources.csv: source_ref 중복")
    known = {
        "project": projects,
        "policy": {r["local_policy_id"] for r in data["policies"]},
        "program": {r["local_program_id"] for r in data["programs"]},
    }
    for key in ("projects", "identifiers", "events", "units", "policies", "programs", "links", "review"):
        fname = spec.REVIEW_FILE[0] if key == "review" else spec.FILES[key][0]
        for i, r in enumerate(data[key], start=2):
            if r.get("source_ref") and r["source_ref"] not in sources:
                errors.append(f"{fname}:{i}: source_ref '{r['source_ref']}' 가 원천_sources.csv 에 없음")
            if key in ("identifiers", "events", "units") and r["local_project_id"] not in projects:
                errors.append(f"{fname}:{i}: local_project_id '{r['local_project_id']}' 가 사업_projects.csv 에 없음")
    every = set().union(*known.values())
    for i, r in enumerate(data["links"], start=2):
        for h in ("from_local_id", "to_local_id"):
            if r[h] not in every:
                errors.append(f"정책사업연결_links.csv:{i}: {h} '{r[h]}' 가 정책·프로그램·사업에 없음")

    for i, r in enumerate(data["events"], start=2):
        where = f"진행이력_events.csv:{i}"
        if bool(r["event_date"]) == bool(r["event_month"]):
            errors.append(f"{where}: event_date·event_month 중 하나만 채운다")
        if r["event_type"] == "PROGRESS":
            try:
                if not 0 <= float(r["progress_pct"]) <= 100:
                    errors.append(f"{where}: progress_pct 범위 밖")
            except ValueError:
                errors.append(f"{where}: PROGRESS 인데 progress_pct 가 숫자가 아님")
        elif r["progress_pct"]:
            errors.append(f"{where}: PROGRESS 가 아닌데 progress_pct 가 있음")
    unit_keys = set()
    for i, r in enumerate(data["units"], start=2):
        where = f"공급물량_units.csv:{i}"
        if not re.fullmatch(r"[1-9]\d*", r["unit_count"]):
            errors.append(f"{where}: unit_count='{r['unit_count']}' 양의 정수 아님")
        k = (r["local_project_id"], r["quantity_type"], r["housing_type"], r["reference_period"], r["source_ref"])
        if k in unit_keys:
            errors.append(f"{where}: 같은 사업·물량종류·유형·시기·원천의 물량이 두 번 있음")
        unit_keys.add(k)

    if spec_zip:
        headers = spec_zip_headers(spec_zip)
        for key, (fname, header) in spec.FILES.items():
            if headers.get(key) != header:
                errors.append(f"{fname}: 양식 ZIP 헤더와 다름 {headers.get(key)}")

    counts = {spec.FILES[k][0]: len(data[k]) for k in spec.FILES} | {spec.REVIEW_FILE[0]: len(data["review"])}
    return errors, counts


def main(argv: list[str]) -> int:
    root = Path(__file__).resolve().parents[2]
    out_dir = root / "exports" / "housing_wave_common_v1_4"
    spec_zip = None
    args = iter(argv)
    for a in args:
        if a == "--spec-zip":
            spec_zip = Path(next(args))
        else:
            out_dir = Path(a)
    errors, counts = validate(out_dir, spec_zip)
    for name, n in counts.items():
        print(f"{name}\t{n}")
    for e in errors:
        print("오류:", e)
    print("검증 통과" if not errors else f"검증 실패 {len(errors)}건")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
