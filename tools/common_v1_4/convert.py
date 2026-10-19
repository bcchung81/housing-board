"""종합상황판·지도 화면 자료 → 주택파동 공통규격 v1.4 CSV 8종(+ 검토 목록·변환 보고서).

  python3 tools/common_v1_4/convert.py                      # exports/housing_wave_common_v1_4/ 에 쓴다
  python3 tools/common_v1_4/convert.py --out DIR --only ID,사업명,...   # 시험 변환(고른 사업만)

읽기만 하는 입력(화면이 읽는 자료와 그 원천 파일):
  data/board/lh-completion.json   LH 공공주택 준공예정현황(종합상황판 '향후 12개월 공급 예정')
  data/board/sources.json         원천 카탈로그(수집일·원천 기준일)
  registry/projects.json          사업 레지스트리(로컬 사업번호 PRJ-시군구5-일련4)
  regions/*/projects.json·region.json   지도 번들(대상 지역인 계양만 변환)
  data/raw/lh/cwstt/…인천계양_공정율_이력…csv   청약플러스 공사현황(번들 공정율의 원천, 지구·블록 코드)
  data/raw/lh/public/…건설공사현황…인천계양_추출.csv   LH 건설공사현황(번들 시공사의 원천)
대상: 서울·경기·인천 공공주택. 같은 입력이면 같은 결과가 나오도록 정렬을 고정하고 시각을 쓰지 않는다.
"""
from __future__ import annotations

import csv
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import spec  # noqa: E402
import validate  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "exports" / "housing_wave_common_v1_4"
CWSTT = "data/raw/lh/cwstt/lh_공사현황_인천계양_공정율_이력_20261003.csv"
BUILD = "data/raw/lh/public/LH_건설공사현황_20260701_인천계양_추출.csv"
BUILD_PDF = "LH_건설공사현황_20260701_주택품질안전처.pdf"
BUILD_ASOF = "2026-07-01"

REGION = {"11": "서울", "28": "인천", "41": "경기"}          # 대상 시도
REGION_BY_NAME = {"서울": "11", "인천": "28", "경기": "41"}
STAGE = {"01": "정책", "02": "사업화", "03": "인허가", "04": "건설", "05": "공급", "06": "입주"}
ORG = {"한국토지주택공사": "LH", "LH": "LH"}
PUBLIC_MARK = re.compile(r"LH|SH|에스에이치|휴먼시아|행복주택|공공주택|국민임대|영구임대|스윗시티")


def rel(p: str) -> Path:
    return ROOT / p


def read_json(p: str):
    return json.loads(rel(p).read_text(encoding="utf-8"))


def read_csv(p: str) -> list[dict]:
    return list(csv.DictReader(rel(p).read_text(encoding="utf-8-sig").splitlines()))


def num(x: float) -> str:
    return f"{x:g}"


def yymmdd(s: str) -> str:   # '25-12-29' → '2025-12-29'
    return f"20{s}" if re.fullmatch(r"\d{2}-\d{2}-\d{2}", s) else s


def sigungu(location: str) -> str:
    """'경기도 성남시 수정구 창곡동 …' → '성남시 수정구', '인천광역시 서구 …' → '서구'."""
    t = location.split()
    if len(t) < 2 or not re.search(r"(시|군|구)$", t[1]):
        return ""
    return f"{t[1]} {t[2]}" if t[1].endswith("시") and len(t) > 2 and t[2].endswith("구") else t[1]


def temp_id(district: str, block: str) -> str:
    """레지스트리에 없는 LH 블록의 임시 로컬 ID. 원천 키(지구+블록)의 해시라 다른 블록이 늘어도 바뀌지 않는다."""
    return "WAVE-LHC-" + hashlib.sha1(f"15141761|{district}|{block}".encode()).hexdigest()[:8].upper()


def notice_date(label: str) -> tuple[str, bool]:
    m = re.search(r"(\d{4}-\d{2}-\d{2})", label)
    return (m.group(1) if m else ""), "정정" in label


def build() -> dict:
    catalog = {s["id"]: s for s in read_json("data/board/sources.json")["items"]}
    lh = read_json("data/board/lh-completion.json")
    registry = read_json("registry/projects.json")
    regions = read_json("regions/index.json")["regions"]
    cwstt = read_csv(CWSTT)
    works = read_csv(BUILD)

    out = {k: [] for k in spec.FILES}
    review: list[dict] = []
    stats: dict[str, Counter] = defaultdict(Counter)

    # ── 원천 ──────────────────────────────────────────────
    lhc = catalog["datagokr-15141761"]
    src = {}

    def add_source(key: str, **row):
        ref = f"WAVE-SRC-{len(src) + 1:02d}"
        src[key] = ref
        out["sources"].append({"source_ref": ref, "source_owner": "HOUSING_WAVE", **{h: row.get(h, "") for h in spec.FILES["sources"][1][2:]}})

    add_source("lh-completion", provider="한국토지주택공사(공공데이터포털)", dataset_name="공공주택 준공예정현황(15141761)",
               source_url="https://www.data.go.kr/data/15141761/fileData.do", source_record_key="사업지구명+블록명+공급유형",
               data_as_of=lhc["sourceAsOf"], collected_at=lhc["collectedAt"][:10], original_filename=lhc["query"]["file"],
               notes="종합상황판 '향후 12개월 공급 예정'이 읽는 자료(data/board/lh-completion.json)")
    add_source("registry", provider="주택파동", dataset_name="사업 레지스트리(registry/projects.json)", source_record_key="id(PRJ-시군구5-일련4)",
               data_as_of=registry["updatedAt"], original_filename="projects.json",
               notes="로컬 사업번호 발급처. 레코드는 건축HUB 주택인허가 기본개요와 지도 번들에서 발급")

    gy = next(r for r in regions if r["slug"] == "incheon-gyeyang")
    gy_region = read_json("regions/incheon-gyeyang/region.json")
    gy_projects = read_json("regions/incheon-gyeyang/projects.json")["projects"]
    add_source("bundle", provider="주택파동", dataset_name="인천 계양구 지도 번들(regions/incheon-gyeyang)", source_record_key="id",
               data_as_of=gy["updatedAt"], original_filename="projects.json",
               notes="지도 화면 단지. 단지별 근거는 LH 입주자모집공고·청약플러스 공사현황")
    add_source("lh-cwstt", provider="한국토지주택공사(LH청약플러스)", dataset_name="공사현황 · 인천계양 블록별 공정율 이력",
               source_url="https://apply.lh.or.kr/lhapply/land/cwsttList.do", source_record_key="지구명+블록+기준일",
               data_as_of=max(r["기준일"] for r in cwstt), collected_at=re.search(r"_(\d{4})(\d{2})(\d{2})\.csv$", CWSTT).expand(r"\1-\2-\3"),
               original_filename=Path(CWSTT).name, notes="지도 공정율의 원천(번들 progress). 수집일은 파일 이름의 날짜")
    add_source("lh-build", provider="한국토지주택공사(사전정보공표)", dataset_name="건설공사현황(2026-07-01) · 인천계양 추출", source_record_key="현장명",
               data_as_of=BUILD_ASOF, original_filename=BUILD_PDF,
               notes=f"지도 시공사의 원천. 인천계양 22행을 {Path(BUILD).name} 로 추림. 공정률은 7월 기준 건축공사 공정률(청약플러스 블록 공정율과 기준 다름)")
    notices = {s["id"]: s for s in gy_region["sources"] if s["id"].startswith("notice-")}
    by_block = lambda nid: int(re.sub(r"\D", "", nid))   # notice-a17 → 17
    for nid in sorted(notices, key=by_block):
        label = notices[nid]["label"]
        if "입주자모집공고" not in label:   # notice-a10 은 준공예정현황·공사현황을 가리키는 묶음 표기
            continue
        block = f"A{by_block(nid)}"
        date, _ = notice_date(label)
        pdf = sorted(rel("data/raw/lh/notices").glob(f"LH_인천계양{block}_입주자모집공고문_*.pdf"))
        add_source(nid, provider="한국토지주택공사", dataset_name=f"{label} · 인천계양 {block}", data_as_of=date,
                   original_filename=pdf[0].name if pdf else "", notes="지도 단지의 세대수·입주예정 근거")

    # ── 계양 번들 단지(레지스트리 번호) ──────────────────────
    reg_by_bundle = {r["value"]: p for p in registry["projects"] for r in p["refs"] if r["system"] == "bundle"}
    zone = {z["id"]: z["name"] for z in gy_region["zones"]}
    gy_area = {r["지구명"] for r in cwstt}                     # LH 원천의 지구명(인천계양(공공주택))
    code_of = {r["블록"]: f"{r['지구코드']}-{r['블록코드']}" for r in cwstt}
    sido_name, sgg_name = gy_region["name"].split()          # '인천 계양구'
    bundle_of: dict[tuple[str, str], dict] = {}               # (LH 지구명, 블록) → 번들 단지

    projects = []
    for p in gy_projects:
        reg = reg_by_bundle[p["id"]]
        pid = reg["id"]
        public = p["sponsorClass"] == "public"
        stats["bundle"]["계양 단지"] += 1
        if not public:
            review.append({"review_type": "PUBLIC_SCOPE_UNKNOWN", "local_project_id": pid, "source_ref": src["bundle"], "record_key": p["id"],
                           "record_name": p["name"], "detail": f"sponsorClass={p['sponsorClass']}", "reason": "번들 시행자가 공공으로 확인되지 않음"})
            continue
        for area in gy_area:
            bundle_of[(area, p["label"])] = p
        projects.append({"local_project_id": pid, "project_name": p["name"], "project_unit": "BLOCK", "parent_area_name": zone[p["zoneId"]],
                         "block_name": p["label"], "region": sido_name, "sigungu": sgg_name, "organization": ORG[p["sponsor"]["name"]],
                         "public_scope": "PUBLIC", "project_status": STAGE[reg["stageCode"]], "is_demo": "false", "source_ref": src["bundle"]})
        ids = [("INTERNAL_PROJECT_ID", pid, "HOUSING_WAVE", src["registry"]), ("BUNDLE_ID", p["id"], "HOUSING_WAVE", src["bundle"])]
        ids += [("PNU", v, "국토교통부", src["registry"]) for v in reg["pnus"]]
        ids += [("BJD_CODE", v, "행정안전부", src["registry"]) for v in reg["bjdCodes"]]
        if p["label"] in code_of:
            ids.append(("LH_AREA_BLOCK_CODE", code_of[p["label"]], "LH", src["lh-cwstt"]))
        out["identifiers"] += [{"local_project_id": pid, "id_type": t, "id_value": v, "id_issuer": i, "source_ref": s, "match_status": "CONFIRMED"}
                               for t, v, i, s in ids]

        notice_ids = [s for s in p["sources"] if s.startswith("notice-") and s in src]
        prog = p.get("progress") or {}
        for d, rate in prog.get("history", []):
            out["events"].append(ev(pid, "PROGRESS", "ACTUAL", d, pct=num(rate), detail="블록 공정율(청약플러스 공사현황)", ref=src["lh-cwstt"]))
        if prog.get("start"):
            started = any(d >= prog["start"] and rate > 0 for d, rate in prog.get("history", []))
            out["events"].append(ev(pid, "CONSTRUCTION_START", "ACTUAL" if started else "PLANNED", prog["start"],
                                    detail="공사 시작(청약플러스 공사기간)", ref=src["lh-cwstt"]))
        if prog.get("end"):
            done = prog.get("rate") == 100 and prog["end"] <= prog.get("asOf", "")
            out["events"].append(ev(pid, "COMPLETION", "ACTUAL" if done else "PLANNED", prog["end"],
                                    detail="공사 종료 예정(청약플러스 공사기간)", ref=src["lh-cwstt"]))
        for nid in notice_ids:
            date, corrected = notice_date(notices[nid]["label"])
            out["events"].append(ev(pid, "SUPPLY_NOTICE", "ACTUAL", date, ref=src[nid],
                                    detail="입주자모집 정정공고(최초 공고일은 원천에 없음)" if corrected else "입주자모집공고"))
            out["units"].append({"local_project_id": pid, "quantity_type": "NOTICE", "housing_type": p["kind"], "unit_count": str(p["units"]),
                                 "reference_period": "" if corrected else date[:7], "unit_scope": "SUBTYPE", "source_ref": src[nid],
                                 "review_status": "CONFIRMED"})
        if p.get("moveIn"):
            if notice_ids:
                out["events"].append(ev(pid, "MOVE_IN", "PLANNED", p["moveIn"], detail="입주 예정(입주자모집공고)", ref=src[notice_ids[0]]))
            else:
                review.append({"review_type": "MOVE_IN_FROM_COMPLETION", "local_project_id": pid, "source_ref": src["bundle"], "record_key": p["id"],
                               "record_name": p["name"], "detail": f"번들 moveIn={p['moveIn']}",
                               "reason": "모집공고가 없어 번들 입주 시기가 준공예정일을 옮긴 값임. 준공예정과 입주예정을 섞지 않으려고 입주예정 이력에서 뺌"})

    # ── LH 준공예정 블록(서울·경기·인천) ──────────────────────
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for b in lh["blocks"]:
        stats["lh-completion"]["입력 행"] += 1
        if b["sido"] not in REGION:
            stats["lh-completion"]["제외: 대상 지역 밖(행)"] += 1
            continue
        groups[(b["district"], b["block"])].append(b)
    lh_confirmed = {p["label"] for p in gy_projects if any("준공예정현황" in gy_region_label(gy_region, s) for s in p["sources"])}
    for (district, block), rows in sorted(groups.items()):
        rows = sorted(rows, key=lambda r: (r["type"], r["date"]))
        matched = bundle_of.get((district, block))
        status = "CONFIRMED"
        if matched:
            pid = reg_by_bundle[matched["id"]]["id"]
            stats["lh-completion"]["계양 번들 단지에 합침(블록)"] += 1
            if block not in lh_confirmed:
                status = "REVIEW_REQUIRED"
                review.append({"review_type": "CROSS_SOURCE_NAME_MATCH", "local_project_id": pid, "source_ref": src["lh-completion"],
                               "record_key": f"{district}|{block}", "record_name": matched["name"],
                               "detail": "준공예정 " + " · ".join(f"{r['type']} {r['units']}호 {r['date']}" for r in rows),
                               "reason": "지구명(LH 원천)·블록명이 같아 번들 단지와 한 사업으로 묶음. 번들 원천 목록에는 이 자료가 없음"})
        else:
            pid = temp_id(district, block)
            unit = "AREA_UNKNOWN" if re.fullmatch(r"\d+", block) else "BLOCK"   # '1'·'01' 같은 번호만 있는 블록명
            projects.append({"local_project_id": pid, "project_name": f"{district} {block}", "project_unit": unit, "parent_area_name": district,
                             "block_name": block, "region": REGION[rows[0]["sido"]], "sigungu": sigungu(rows[0]["location"]), "organization": "LH",
                             "public_scope": "PUBLIC", "project_status": "", "is_demo": "false", "source_ref": src["lh-completion"]})
            stats["lh-completion"]["사업(블록)"] += 1
            if unit == "AREA_UNKNOWN":
                review.append({"review_type": "BLOCK_NAME_NUMERIC", "local_project_id": pid, "source_ref": src["lh-completion"],
                               "record_key": f"{district}|{block}", "record_name": f"{district} {block}", "detail": rows[0]["location"],
                               "reason": "블록명이 번호뿐이라 지구 안 블록인지 독립 사업인지 원천으로 알 수 없음(project_unit=AREA_UNKNOWN)"})
        out["identifiers"].append({"local_project_id": pid, "id_type": "AREA_BLOCK", "id_value": f"{district}|{block}", "id_issuer": "LH",
                                   "source_ref": src["lh-completion"], "match_status": status})
        for r in rows:
            stats["lh-completion"]["변환 행(유형별 물량)"] += 1
            out["units"].append({"local_project_id": pid, "quantity_type": "PUBLIC_PLAN", "housing_type": r["type"], "unit_count": str(r["units"]),
                                 "reference_period": r["date"][:7], "unit_scope": "SUBTYPE", "source_ref": src["lh-completion"], "review_status": status})
        for date in sorted({r["date"] for r in rows}):
            types = "·".join(r["type"] for r in rows if r["date"] == date)
            out["events"].append(ev(pid, "COMPLETION", "PLANNED", date, detail=f"준공예정({types})", ref=src["lh-completion"], status=status))

    # ── LH 건설공사현황(계양 추출) — 건축 공사만 블록 사업에 붙인다 ─────
    gy_by_label = {p["label"]: reg_by_bundle[p["id"]]["id"] for p in gy_projects}
    for w in works:
        stats["lh-build"]["입력 행"] += 1
        pid = gy_by_label.get(w["블록"]) if w["공종"] == "건축" and w["사업지구"] in gy_area else None
        if not pid:
            stats["lh-build"]["제외: 설비·조경·지구 조성 공사"] += 1
            continue
        stats["lh-build"]["변환 행(건축 공사)"] += 1
        site = w["현장명"]
        start, end = yymmdd(w["착공(YY-MM-DD)"]), yymmdd(w["준공예정(YY-MM-DD)"])
        out["events"].append(ev(pid, "CONSTRUCTION_START", "ACTUAL" if start <= BUILD_ASOF else "PLANNED", start, detail=f"건축공사 착공 · {site}",
                                ref=src["lh-build"], status="REVIEW_REQUIRED"))
        out["events"].append(ev(pid, "COMPLETION", "PLANNED", end, detail=f"건축공사 준공예정 · {site}", ref=src["lh-build"], status="REVIEW_REQUIRED"))
        out["events"].append(ev(pid, "PROGRESS", "ACTUAL", BUILD_ASOF[:7], pct=num(float(w["공정률_퍼센트(7월 기준)"])),
                                detail=f"건축공사 공정률(7월 기준, 블록 공정율과 기준 다름) · {site}", ref=src["lh-build"], status="REVIEW_REQUIRED"))
        if w["단위"] == "호":
            out["units"].append({"local_project_id": pid, "quantity_type": "PROJECT_PLAN", "housing_type": "", "unit_count": str(int(w["공사규모"].replace(",", ""))),
                                 "reference_period": BUILD_ASOF[:7], "unit_scope": "TOTAL", "source_ref": src["lh-build"], "review_status": "REVIEW_REQUIRED"})
        review.append({"review_type": "CROSS_SOURCE_NAME_MATCH", "local_project_id": pid, "source_ref": src["lh-build"], "record_key": site,
                       "record_name": w["사업지구"] + " " + w["블록"], "detail": f"착공 {start} · 준공예정 {end} · 공사규모 {w['공사규모']}{w['단위']}",
                       "reason": "현장명·블록명으로 번들 단지에 붙임. 번들 원천 목록에는 이 자료가 없음"})

    # 계양 단지의 착공·준공 날짜가 원천마다 다르면 검토 목록에 남긴다
    for pid in sorted(gy_by_label.values()):
        for kind, label in (("CONSTRUCTION_START", "착공"), ("COMPLETION", "준공")):
            seen = sorted({(e["event_date"], e["source_ref"]) for e in out["events"] if e["local_project_id"] == pid and e["event_type"] == kind})
            if len({d for d, _ in seen}) > 1:
                review.append({"review_type": "DATE_CONFLICT", "local_project_id": pid, "source_ref": "", "record_key": kind, "record_name": label,
                               "detail": " · ".join(f"{d}({s})" for d, s in seen), "reason": f"{label} 날짜가 원천마다 다름. 원천별로 따로 기록함"})

    # ── 레지스트리: 계양 외 ─────────────────────────────────
    for p in registry["projects"]:
        stats["registry"]["입력 사업"] += 1
        sido = next((k for k, v in REGION.items() if p["sgg"].startswith(k)), None)
        if p["sgg"] == "28245":
            stats["registry"]["계양 번들 단지로 변환"] += 1
        elif not sido:
            stats["registry"]["제외: 대상 지역 밖"] += 1
        else:
            stats["registry"]["검토 목록: 공공 여부 근거 없음"] += 1
            hub = [r["value"] for r in p["refs"] if r["system"] == "hub-hs-basis"]
            mark = PUBLIC_MARK.search(p["name"])
            review.append({"review_type": "PUBLIC_SCOPE_UNKNOWN", "local_project_id": p["id"], "source_ref": src["registry"],
                           "record_key": "mgmHsrgstPk=" + ",".join(hub), "record_name": p["name"],
                           "detail": f"시군구 {p['sgg']} · 단계 {p['stageCode']}({STAGE[p['stageCode']]}) · 전체 세대수 {p.get('units') if p.get('units') is not None else '미상'}"
                                     f" · PNU {','.join(p['pnus']) or '없음'} · 이름의 공공 표지 {mark.group(0) if mark else '없음'}",
                           "reason": "건축HUB 주택인허가에 공공·민간 구분이 없어 공공주택 여부를 확인할 수 없음. 세대수는 사업 전체(공공 귀속 호수 아님)"})
    for r in regions:
        if r["slug"] != "incheon-gyeyang":
            n = len(read_json(f"regions/{r['slug']}/projects.json")["projects"])
            stats["bundle"][f"제외: 대상 지역 밖({r['name']})"] += n

    out["projects"] = projects
    return {"out": out, "review": review, "stats": stats, "catalog": catalog}


def gy_region_label(region: dict, sid: str) -> str:
    return next((s["label"] for s in region["sources"] if s["id"] == sid), "")


def ev(pid, kind, date_type, when, *, detail, ref, pct="", status="CONFIRMED") -> dict:
    day = re.fullmatch(r"\d{4}-\d{2}-\d{2}", when)
    return {"local_project_id": pid, "event_type": kind, "date_type": date_type, "event_date": when if day else "",
            "event_month": "" if day else when, "progress_pct": pct, "event_detail": detail, "source_ref": ref, "review_status": status}


def select(result: dict, only: list[str]) -> None:
    """시험 변환: 고른 사업(로컬 ID 또는 사업명)과 그 사업의 행만 남긴다."""
    out = result["out"]
    keep = {p["local_project_id"] for p in out["projects"] if p["local_project_id"] in only or p["project_name"] in only}
    missing = [x for x in only if x not in keep and not any(p["project_name"] == x for p in out["projects"])]
    if missing:
        raise SystemExit(f"사업을 찾지 못함: {missing}")
    for k in ("projects", "identifiers", "events", "units"):
        out[k] = [r for r in out[k] if r["local_project_id"] in keep]
    result["review"] = [r for r in result["review"] if r["local_project_id"] in keep]


def natural(s: str) -> list:   # A2 < A10 < A17
    return [(0, int(x), "") if x.isdigit() else (1, 0, x) for x in re.findall(r"\d+|\D+", s)]


def sort_tables(result: dict) -> None:
    out = result["out"]
    out["projects"].sort(key=lambda p: (REGION_BY_NAME[p["region"]], p["parent_area_name"], natural(p["block_name"]), p["local_project_id"]))
    order = {p["local_project_id"]: i for i, p in enumerate(out["projects"])}
    for k in ("identifiers", "units"):
        out[k].sort(key=lambda r: (order[r["local_project_id"]], *(r[h] for h in spec.FILES[k][1][1:])))
    out["events"].sort(key=lambda r: (order[r["local_project_id"]], r["event_date"] or r["event_month"], r["event_type"], r["source_ref"], r["event_detail"]))
    kinds = ["PUBLIC_SCOPE_UNKNOWN", "CROSS_SOURCE_NAME_MATCH", "DATE_CONFLICT", "MOVE_IN_FROM_COMPLETION", "BLOCK_NAME_NUMERIC"]
    result["review"].sort(key=lambda r: (kinds.index(r["review_type"]), r["local_project_id"], r["source_ref"], r["record_key"]))


def write_csv(path: Path, header: list[str], rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=header, lineterminator="\r\n")
        w.writeheader()
        w.writerows(rows)


def sha(p: str) -> str:
    return hashlib.sha256(rel(p).read_bytes()).hexdigest()[:12]


def report(result: dict, counts: dict, errors: list[str], trial: bool) -> str:
    stats, catalog, out = result["stats"], result["catalog"], result["out"]
    molit_rows = sum(s["count"] for k, s in catalog.items() if k.startswith("molit-"))
    inputs = ["data/board/lh-completion.json", "data/board/sources.json", "registry/projects.json", "regions/index.json",
              "regions/incheon-gyeyang/projects.json", "regions/incheon-gyeyang/region.json", CWSTT, BUILD]
    L = ["# 변환 보고서 — 주택파동 공통규격 v1.4", "",
         "이 파일은 `tools/common_v1_4/convert.py` 가 만든다. 같은 입력이면 같은 내용이 나온다(실행 시각을 적지 않는다)." + (" **시험 변환(일부 사업만)**" if trial else ""), "",
         "## 1. 입력 파일", "", "| 파일 | SHA-256(앞 12자리) |", "|---|---|"]
    L += [f"| `{p}` | `{sha(p)}` |" for p in inputs]
    L += ["", "## 2. 출력 파일", "", "| 파일 | 행 수 |", "|---|---:|"] + [f"| `{n}` | {c} |" for n, c in counts.items()]
    L += ["", "## 3. 원천별 변환·제외 건수", ""] + (["시험 변환이라도 이 표는 전체 원천 기준이다.", ""] if trial else []) + ["| 원천 | 항목 | 건수 |", "|---|---|---:|"]
    names = {"lh-completion": "LH 준공예정현황", "registry": "사업 레지스트리", "bundle": "지도 번들", "lh-build": "LH 건설공사현황(계양 추출)"}
    for key in ("lh-completion", "registry", "bundle", "lh-build"):
        L += [f"| {names[key]} | {k} | {v} |" for k, v in stats[key].items()]
    L += ["", "## 4. 읽지 않은 화면 자료(제외 유형)", "", "| 자료 | 화면 | 건수 | 제외 이유 |", "|---|---|---:|---|",
          "| 종합상황판 SAMPLE (`lib/board/sample.ts`) | 종합상황판 위젯 6개 | 사업 단위 행 0 | DEMO(시안 고정값). 실데이터 제출본에서 뺀다 |",
          f"| 통계누리 5표 (`data/board/molit.json`) | 종합상황판 월별 실적 | {molit_rows:,}행 | 시도·월 단위 통계라 사업 단위 규격에 넣을 곳이 없음 |",
          "| 실시간 API 응답 (`.cache`) | 지도 공고·인허가·건물 등 | — | 24시간 캐시라 다시 돌리면 같은 결과가 나오지 않음(보관 자료 아님) |",
          "| 지도 기반시설·건물 번들 (`infra.json`·`buildings.json`·`context.json`) | 지도 | — | 학교·정류장·건물 윤곽은 주택공급 사업이 아님 |",
          "", "## 5. 검토 필요 항목(`review_required.csv`)", "", "| 유형 | 건수 | 뜻 |", "|---|---:|---|"]
    meaning = {"PUBLIC_SCOPE_UNKNOWN": "공공주택 여부를 원천으로 확인할 수 없어 사업 파일에서 뺀 사업",
               "CROSS_SOURCE_NAME_MATCH": "다른 원천의 행을 지구·블록 이름으로 같은 사업에 붙임(행은 REVIEW_REQUIRED)",
               "DATE_CONFLICT": "같은 사업의 착공·준공 날짜가 원천마다 다름",
               "MOVE_IN_FROM_COMPLETION": "입주 시기가 준공예정일을 옮긴 값이라 입주예정에서 뺌",
               "BLOCK_NAME_NUMERIC": "블록명이 번호뿐(project_unit=AREA_UNKNOWN)"}
    rc = Counter(r["review_type"] for r in result["review"])
    L += [f"| `{k}` | {rc[k]} | {meaning[k]} |" for k in meaning if rc[k]]
    pub = sum(1 for r in result["review"] if r["review_type"] == "PUBLIC_SCOPE_UNKNOWN" and not r["detail"].endswith("표지 없음"))
    if rc["PUBLIC_SCOPE_UNKNOWN"]:
        L += ["", f"`PUBLIC_SCOPE_UNKNOWN` 중 이름에 공공 표지(LH·SH·휴먼시아·행복주택·스윗시티 등)가 있는 사업은 {pub}건이다. 표지는 참고용이고 확정 근거가 아니다."]
    status = Counter(r["review_status"] for k in ("units", "events") for r in out[k])
    L += ["", "## 6. 원천에 없어 비워 둔 값", "",
          "- `정책_policies.csv`·`프로그램_programs.csv`·`정책사업연결_links.csv`: 화면 자료에 정책·프로그램과 사업을 잇는 근거가 없어 헤더만 냈다.",
          "- `project_status`: LH 준공예정현황에는 단계가 없어 그 블록들은 비웠다(계양 단지만 레지스트리 단계 코드).",
          "- 정정공고만 있는 모집공고(A2·A3·A6·A9)는 최초 공고일이 원천에 없어, 공고 물량의 `reference_period` 를 비웠다.",
          "- `MOVE_IN_ACTUAL`(입주 실적): 원천 없음.",
          "- 원천 `collected_at`: 지도 번들·건설공사현황·모집공고는 수집일 기록이 없어 비웠다.",
          "", f"물량·이력 행의 review_status: CONFIRMED {status['CONFIRMED']} · REVIEW_REQUIRED {status['REVIEW_REQUIRED']}",
          "", "## 7. 검증", ""]
    L += ["검증 통과 (UTF-8 BOM·헤더·필수 칸·허용값·날짜·숫자·NULL·ID 중복·참조 무결성·DEMO·행 중복·인증키 검사)"] if not errors else [f"검증 실패 {len(errors)}건", ""] + [f"- {e}" for e in errors]
    L += ["", "## 8. 다시 만들기", "", "```", "python3 tools/common_v1_4/convert.py", "python3 tools/common_v1_4/validate.py exports/housing_wave_common_v1_4", "```", ""]
    return "\n".join(L)


def main(argv: list[str]) -> int:
    out_dir, only = OUT, None
    args = iter(argv)
    for a in args:
        if a == "--out":
            out_dir = Path(next(args))
        elif a == "--only":
            only = [x.strip() for x in next(args).split(",") if x.strip()]
        else:
            raise SystemExit(f"알 수 없는 인자: {a}")
    result = build()
    if only:
        select(result, only)
    sort_tables(result)
    out_dir.mkdir(parents=True, exist_ok=True)
    for key, (fname, header) in spec.FILES.items():
        write_csv(out_dir / fname, header, result["out"][key])
    write_csv(out_dir / spec.REVIEW_FILE[0], spec.REVIEW_FILE[1], result["review"])
    errors, counts = validate.validate(out_dir)
    (out_dir / "conversion_report.md").write_text(report(result, counts, errors, bool(only)), encoding="utf-8")
    for name, n in counts.items():
        print(f"{name}\t{n}")
    for e in errors:
        print("오류:", e)
    print("검증 통과" if not errors else f"검증 실패 {len(errors)}건")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
