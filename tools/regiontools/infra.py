"""입주 전 기반시설 점검 자료(infra.json, 번들 1.2.0) 만들기: 순수 함수 + 원본 읽기.

원천(모두 공개 자료, 키가 필요한 것은 V-World·건축HUB뿐):
- 교육재정알리미 신설예정학교(개교 예정 년월·학급·학생·공시 좌표)  → schools
- V-World 도시계획시설 학교·전기공급설비·교통시설 부지               → schools(부지) · sites
- 한국교육시설안전원 초등학교통학구역(SHP) + 학교학구도연계정보 + 학교위치(CSV) → zones · attendance
- 국토교통부 전국 버스정류장 위치정보(CSV)                          → stops
- 건축HUB 건축인허가 기본개요(지구 안 비주택)                        → permits
- 보도·고시로 사람이 확인한 대책(curated JSON)                      → measures

V-World 도시계획시설의 '집행완료/미집행' 표기는 쓰지 않는다. 계양 테크노밸리에서 운영 중인 학교가 하나도 없는 부지 9곳이
모두 '집행완료'로 표기되어 있어 건립 현황을 뜻하지 않는다(지목도 준공 전에는 안 바뀐다). 건립 여부는 인허가·운영 학교 자료로만 말한다.
"""
from __future__ import annotations

import csv
import io
import re
import zipfile
from pathlib import Path
from typing import Iterable, Sequence

from . import geo, proj, shp

INFRA_SCHEMA_VERSION = "1.2.0"
LEVEL_OF = {"초": "초등학교", "중": "중학교", "고": "고등학교", "특수": "특수학교"}
LEVEL_ORDER = ["초등학교", "중학교", "고등학교", "유치원", "특수학교"]
SITE_KIND = {"초등학교": "elem", "중학교": "mid", "고등학교": "high", "유치원": "kg"}
MAX_ZONE_POINTS = 200
NEAR_SITE_M = 100.0      # 공시 좌표가 부지 안이 아닐 때 같은 학교급 부지를 이 거리 안에서 짝으로 본다

SOURCE_DEFS = {
    "edu-newschool": {"label": "지방교육재정알리미 신설예정학교", "publisher": "교육부·한국교육학술정보원",
                      "url": "https://eduinfo.go.kr/portal/theme/newSchMapPage.do", "redistributable": "unknown"},
    "vworld-upis": {"label": "V-World 도시계획시설(UPIS)", "publisher": "국토교통부",
                    "url": "https://www.vworld.kr", "redistributable": "unknown"},
    "edu-zone": {"label": "한국교육시설안전원 초등학교통학구역·학교학구도연계정보·초중등학교위치", "publisher": "한국교육시설안전원",
                 "url": "https://www.data.go.kr/data/15159265/fileData.do", "license": "이용허락범위 제한 없음", "redistributable": "Y"},
    "molit-busstop": {"label": "국토교통부 전국 버스정류장 위치정보", "publisher": "국토교통부",
                      "url": "https://www.data.go.kr/data/15067528/fileData.do", "license": "이용허락범위 제한 없음", "redistributable": "Y"},
    "hub-arch": {"label": "국토교통부 건축HUB 건축인허가정보", "publisher": "국토교통부",
                 "url": "https://www.data.go.kr/data/15134735/openapi.do", "redistributable": "unknown"},
}
SOURCE_ORDER = list(SOURCE_DEFS)


# ---------------------------------------------------------------- 교육: 신설예정 학교 · 부지
def scheduled_schools(rows: Iterable[dict], address_prefix: str) -> list[dict]:
    """교육재정알리미 행 → 신설예정 학교. 주소가 address_prefix 로 시작하는 것만. 개교 예정 년월이 빠른 순."""
    out = []
    for r in rows:
        addr = str(r.get("realAddr") or "").strip()
        if not addr.startswith(address_prefix):
            continue
        name = str(r.get("schlNm") or "").strip()
        level = LEVEL_OF.get(str(r.get("ditcNm") or "").strip())
        if level is None:
            raise ValueError(f"알 수 없는 학교급 {r.get('ditcNm')!r}: {name}")
        ym = str(r.get("openSchdYm") or "")
        if not re.fullmatch(r"(19|20)\d{2}(0[1-9]|1[0-2])", ym):
            raise ValueError(f"개교 예정 년월 형식 오류 {ym!r}: {name}")
        lat, lon = float(r["pointX"]), float(r["pointY"])      # 자료는 pointX 가 위도, pointY 가 경도
        if not (30 <= lat <= 45 and 120 <= lon <= 135):
            raise ValueError(f"좌표가 한국 밖: {name} ({r['pointX']}, {r['pointY']})")
        s = {"id": f"edu-{r['schlSeq']}", "name": name, "level": level, "status": "신설예정", "openYm": f"{ym[:4]}-{ym[4:]}"}
        for key, field in (("classes", "classCnt"), ("students", "stdtCnt")):
            if str(r.get(field) or "").strip().isdigit():
                s[key] = int(r[field])
        s.update(address=addr, lon=lon, lat=lat, sources=["edu-newschool"])
        out.append(s)
    return sorted(out, key=lambda s: (s["openYm"], s["name"]))


NAME_FIELDS = ("lcl_nam", "mls_nam", "scl_nam", "atr_nam", "dgm_nm")


def _names(props: dict) -> list[str]:
    """도시계획시설 기록의 분류 이름들. 같은 레이어 안에서도 지자체·시기마다 학교급이 놓이는 칸이 다르다
    (예전 기록은 대분류 '학교'·중분류 '초등학교', 3기 신도시 기록은 대분류 '미분류'·중분류 '학교'·세분류 '초등학교')."""
    return [str(props.get(f) or "").split("/")[0].strip() for f in NAME_FIELDS]


def _school_level(props: dict) -> str | None:
    names = _names(props)
    if "학교" not in names:
        return None
    return next((n for n in names if n in SITE_KIND), None)


def _in_any(geom: dict, areas: Sequence[Sequence[Sequence[float]]]) -> bool:
    c = geo.geometry_centroid(geom)
    return any(geo.point_in_ring(c, a) for a in areas)


def _site_ring(geom: dict) -> list:
    ring = max(geo.outer_rings(geom), key=geo.ring_area_m2)
    return geo.clean_ring(ring, 6) or []


def _area_m2(props: dict, ring: list) -> float:
    try:
        return float(props.get("dgm_ar"))
    except (TypeError, ValueError):
        return round(geo.ring_area_m2(ring))


def school_sites(features: Iterable[dict], areas: Sequence[Sequence[Sequence[float]]]) -> list[dict]:
    """V-World 도시계획시설(공공문화체육시설) 중 학교·유치원 부지로서 지구 안에 있는 것."""
    out = []
    for f in features:
        p = f.get("properties") or {}
        level = _school_level(p)
        if level is None or not _in_any(f["geometry"], areas):
            continue
        ring = _site_ring(f["geometry"])
        if len(ring) < 3:
            continue
        lon, lat = geo.ring_centroid(ring)
        out.append({"level": level, "areaM2": _area_m2(p, ring), "poly": ring, "lon": round(lon, 6), "lat": round(lat, 6)})
    return out


def merge_schools(scheduled: list[dict], sites: list[dict]) -> list[dict]:
    """신설예정 학교에 같은 학교급 부지 윤곽을 붙이고, 짝이 없는 부지는 '부지만'(개교 일정 공시 없음)으로 더한다."""
    free = sorted(sites, key=lambda s: (LEVEL_ORDER.index(s["level"]), s["lon"], s["lat"]))
    out = []
    for sch in scheduled:
        sch = dict(sch)
        same = [s for s in free if s["level"] == sch["level"]]
        pick = next((s for s in same if geo.point_in_ring((sch["lon"], sch["lat"]), s["poly"])), None)
        if pick is None and same:
            near = min(same, key=lambda s: _dist_m((sch["lon"], sch["lat"]), (s["lon"], s["lat"])))
            if _dist_m((sch["lon"], sch["lat"]), (near["lon"], near["lat"])) <= NEAR_SITE_M:
                pick = near
        if pick is not None:
            free.remove(pick)
            sch.update(poly=pick["poly"], areaM2=pick["areaM2"], sources=["edu-newschool", "vworld-upis"])
        out.append(sch)
    counts: dict[str, int] = {}
    for s in free:
        kind = SITE_KIND[s["level"]]
        counts[kind] = counts.get(kind, 0) + 1
        out.append({"id": f"site-{kind}-{counts[kind]}", "name": f"{s['level']} 부지", "level": s["level"], "status": "부지만",
                    "areaM2": s["areaM2"], "lon": s["lon"], "lat": s["lat"], "poly": s["poly"],
                    "note": "학교 부지는 있으나 개교 일정은 공시되지 않음", "sources": ["vworld-upis"]})
    return out


def _dist_m(a: Sequence[float], b: Sequence[float]) -> float:
    import math
    r = math.pi / 180
    dl, dn = (b[1] - a[1]) * r, (b[0] - a[0]) * r
    h = math.sin(dl / 2) ** 2 + math.cos(a[1] * r) * math.cos(b[1] * r) * math.sin(dn / 2) ** 2
    return 2 * 6371008.8 * math.asin(math.sqrt(h))


# ---------------------------------------------------------------- 전기·교통 시설 부지
def facility_sites(power_features: Iterable[dict], transit_features: Iterable[dict], areas: Sequence[Sequence[Sequence[float]]]) -> list[dict]:
    """전기공급설비(UPIS 154)와 자동차정류장·철도류(UPIS 152) 중 지구 안의 것."""
    out = []
    for category, feats, accept in (("전기", power_features, lambda p: any("전기공급설비" in n for n in _names(p))),
                                    ("교통", transit_features, lambda p: any(n in ("자동차정류장", "도시철도", "철도") for n in _names(p)))):
        picked = []
        for f in feats:
            p = f.get("properties") or {}
            if not accept(p) or not _in_any(f["geometry"], areas):
                continue
            ring = _site_ring(f["geometry"])
            if len(ring) >= 3:
                picked.append((geo.ring_centroid(ring), {"name": str(p.get("dgm_nm") or p.get("mls_nam") or category).strip(),
                                                         "areaM2": _area_m2(p, ring), "poly": ring}))
        key = "power" if category == "전기" else "transit"
        for n, (_, s) in enumerate(sorted(picked, key=lambda t: t[0]), 1):
            out.append({"id": f"site-{key}-{n}", "category": category, **s, "sources": ["vworld-upis"]})
    return out


# ---------------------------------------------------------------- 초등 통학구역
def _project_center(project: dict) -> tuple[float, float]:
    return geo.ring_centroid(project["outline"]["poly"])


def _thin(ring: list, limit: int) -> list:
    if len(ring) <= limit * 4:
        return ring
    step = len(ring) // (limit * 2) + 1
    return ring[::step]


def attendance(projects: list[dict], shp_path, dbf_path, link_rows: list[dict], school_rows: list[dict], base_date: str):
    """단지 중심이 들어가는 초등 통학구역을 찾는다 → (zones, attendance). 단일 학교 구역(HAKGUDO_GB=0)을 공동 구역보다 먼저 고른다."""
    dbf = shp.read_dbf(dbf_path)
    targets = {}
    for p in projects:
        lon, lat = _project_center(p)
        targets[p["id"]] = proj.to_tm(lon, lat)
    xs, ys = [t[0] for t in targets.values()], [t[1] for t in targets.values()]
    bbox = (min(xs), min(ys), max(xs), max(ys))
    found: dict[str, list] = {pid: [] for pid in targets}
    rings_of: dict[int, list] = {}
    for idx, _, rings in shp.iter_polygons(shp_path, bbox=bbox):
        if idx >= len(dbf) or dbf[idx]["_deleted"]:
            continue
        for pid, pt in targets.items():
            if shp.contains(rings, pt):
                found[pid].append(idx)
                rings_of[idx] = rings
    link: dict[str, dict] = {}
    for r in link_rows:
        if r.get("학교급구분") == "초등학교":
            link.setdefault(r["학구ID"], r)
    loc = {r["학교ID"]: r for r in school_rows}
    zones: dict[str, dict] = {}
    att = []
    for p in projects:
        hits = sorted(found[p["id"]], key=lambda i: (dbf[i]["HAKGUDO_GB"] != "0", i))
        if not hits:
            continue
        idx = hits[0]
        row = dbf[idx]
        zid = row["HAKGUDO_ID"]
        if zid not in zones:
            lk = link.get(zid)
            if lk is None:
                raise ValueError(f"통학구역 {zid} {row['HAKGUDO_NM']}에 연결된 초등학교가 학교학구도연계정보에 없음")
            z = {"id": zid, "name": row["HAKGUDO_NM"], "school": lk["학교명"]}
            where = loc.get(lk["학교ID"])
            if where and where.get("경도") and where.get("위도"):
                z.update(schoolLon=round(float(where["경도"]), 6), schoolLat=round(float(where["위도"]), 6))
            outers = shp.outer_rings(rings_of[idx]) or [rings_of[idx][0]]
            pt = targets[p["id"]]
            ring = next((r for r in outers if shp.contains([r], pt)), max(outers, key=len))
            ring = [list(proj.from_tm(x, y)) for x, y in _thin(list(ring), MAX_ZONE_POINTS)]
            ring = geo.simplify_ring(geo.clean_ring(ring, 6) or ring, MAX_ZONE_POINTS)
            z.update(poly=geo.clean_ring(ring, 6), asOf=row.get("BASE_DT") or base_date, sources=["edu-zone"])
            zones[zid] = z
        att.append({"projectId": p["id"], "zoneId": zid})
    return list(zones.values()), att


# ---------------------------------------------------------------- 정류장 · 인허가
def stops_near(rows: Iterable[dict], areas: Sequence[Sequence[Sequence[float]]], margin_m: float = 400.0) -> list[dict]:
    """버스정류장 위치정보 중 지구(들)를 margin_m 만큼 넓힌 상자 안의 것. 이름·좌표가 같은 중복은 하나만."""
    pts = [p for a in areas for p in a]
    x0, y0, x1, y1 = geo.bbox_of(pts)
    dlat = margin_m / 110540.0
    dlon = margin_m / (111320.0 * __import__("math").cos(__import__("math").radians((y0 + y1) / 2)))
    seen, out = set(), []
    for r in rows:
        try:
            lat, lon = float(r["위도"]), float(r["경도"])
        except (KeyError, TypeError, ValueError):
            continue
        if not (x0 - dlon <= lon <= x1 + dlon and y0 - dlat <= lat <= y1 + dlat):
            continue
        name = str(r.get("정류장명") or "").strip()
        key = (name, round(lon, 5), round(lat, 5))
        if key in seen:
            continue
        seen.add(key)
        out.append({"name": name, "lon": round(lon, 6), "lat": round(lat, 6)})
    return sorted(out, key=lambda s: (s["name"], s["lon"], s["lat"]))


def _day(s) -> str | None:
    s = str(s or "").strip()
    return f"{s[:4]}-{s[4:6]}-{s[6:8]}" if re.fullmatch(r"\d{8}", s) else None


def _permit_name(it: dict, use: str) -> str:
    """건물 이름이 비었거나 법정동 이름뿐('동양동')이면 블록 표기(block+lot, 예: '종교시설1'·'공공주택지구 커뮤니티3')를 이름으로 쓴다."""
    name = str(it.get("bldNm") or "").strip()
    label = " ".join(x for x in (str(it.get("block") or "").strip(), str(it.get("lot") or "").strip()) if x)
    only_dong = bool(name) and name.endswith("동") and name in str(it.get("platPlc") or "").split()
    return (name if name and not only_dong else "") or label or name or use


def nonhousing_permits(items: Iterable[dict], since: str) -> list[dict]:
    """건축인허가 기본개요 중 LH '블록' 표기(공공주택지구 안)이고 주택이 아닌 것. since(YYYY-MM-DD) 이후 허가만."""
    out = []
    for it in items:
        permit_day = _day(it.get("archPmsDay"))
        use = str(it.get("mainPurpsCdNm") or "").strip()
        block_notation = "블록" in str(it.get("platPlc") or "") or bool(str(it.get("block") or "").strip())
        if not permit_day or permit_day < since or not block_notation or use.startswith("공동주택") or not use:
            continue
        name = _permit_name(it, use)
        out.append({"id": f"permit-{str(it.get('mgmPmsrgstPk')).strip()}", "name": name, "use": use, "permitDate": permit_day,
                    "startDate": _day(it.get("realStcnsDay")), "approvalDate": _day(it.get("useAprDay")), "sources": ["hub-arch"]})
    return sorted(out, key=lambda p: (p["permitDate"], p["id"]))


# ---------------------------------------------------------------- 조립
def _round_geo(v):
    if isinstance(v, list):
        return [_round_geo(x) for x in v]
    return round(v, 6) if isinstance(v, float) else v


def _clean(item: dict) -> dict:
    out = {}
    for k, v in item.items():
        if k == "poly" or k in ("lon", "lat", "schoolLon", "schoolLat"):
            out[k] = _round_geo(v)
        elif v is not None:
            out[k] = v
    return out


def assemble(*, today: str, schools, zones, attendance, stops, sites, permits, curated: dict, source_dates: dict) -> dict:
    """infra.json 문서. 비어 있는 목록은 키를 뺀다. 쓰지 않은 출처는 싣지 않고, 참조가 없는 출처 id 는 오류."""
    lists = {"schools": schools, "zones": zones, "attendance": attendance, "stops": stops, "sites": sites, "permits": permits,
             "measures": list(curated.get("measures") or [])}
    sources = {}
    for sid in SOURCE_ORDER:
        sources[sid] = {"id": sid, **SOURCE_DEFS[sid]}
    for s in curated.get("sources") or []:
        sources[s["id"]] = dict(s)
    used = {sid for name in ("schools", "zones", "sites", "permits", "measures") for it in lists[name] for sid in it.get("sources", [])}
    if lists["stops"]:
        used.add("molit-busstop")
    unknown = used - set(sources)
    if unknown:
        raise ValueError(f"정의되지 않은 출처 id: {sorted(unknown)}")
    doc = {"schema_version": INFRA_SCHEMA_VERSION, "asOf": today, "sources": []}
    for sid in list(SOURCE_ORDER) + [s["id"] for s in curated.get("sources") or []]:
        if sid in used and sid not in {s["id"] for s in doc["sources"]}:
            src = dict(sources[sid])
            if sid in source_dates:
                src["asOf"] = source_dates[sid]
            doc["sources"].append(src)
    for name, items in lists.items():
        if items:
            doc[name] = [_clean(i) for i in items]
    return doc


# ---------------------------------------------------------------- 원본 파일 읽기
def read_csv(path, encodings=("utf-8-sig", "cp949")) -> list[dict]:
    raw = Path(path).read_bytes()
    for enc in encodings:
        try:
            return list(csv.DictReader(io.StringIO(raw.decode(enc))))
        except UnicodeDecodeError:
            continue
    raise ValueError(f"문자 인코딩을 알 수 없음: {path}")


def find_one(directory, pattern: str) -> Path:
    hits = sorted(Path(directory).glob(pattern))
    if not hits:
        raise FileNotFoundError(pattern)
    return hits[-1]       # 날짜가 이름에 있어 마지막이 가장 최신


def ensure_zone_shp(raw_dir) -> tuple[Path, Path]:
    """초등학교통학구역 zip 을 한 번 풀어 둔다(압축 안 파일 이름이 CP949 라 영문 이름으로 저장). (shp, dbf) 경로."""
    raw = Path(raw_dir)
    out = raw / "elem_zone"
    zips = sorted(raw.glob("*초등학교통학구역*.zip"))
    if not zips and not (out / "elem_zone.shp").exists():
        raise FileNotFoundError("*초등학교통학구역*.zip")
    if zips and (not (out / "elem_zone.shp").exists() or (out / "elem_zone.shp").stat().st_mtime < zips[-1].stat().st_mtime):
        out.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(zips[-1], metadata_encoding="cp949") as z:
            for info in z.infolist():
                ext = Path(info.filename).suffix.lower()
                if ext in (".shp", ".dbf", ".shx", ".prj", ".cpg"):
                    (out / f"elem_zone{ext}").write_bytes(z.read(info))
    return out / "elem_zone.shp", out / "elem_zone.dbf"
