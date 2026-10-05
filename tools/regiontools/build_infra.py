#!/usr/bin/env python3
"""지역 번들에 입주 전 기반시설 점검 자료(infra.json)를 만든다.

  .venv/bin/python tools/regiontools/build_infra.py incheon-gyeyang --raw workspace/data/raw/infra

필요한 것
- 키(.env.local): V-World(도시계획시설), data.go.kr(건축인허가). 교육재정알리미는 키가 필요 없다. 키·요청 URL은 출력하지 않는다.
- 공공데이터포털에서 내려받은 파일을 --raw 폴더에 둔다(파일 이름에 아래 낱말이 들어 있으면 된다. 날짜가 여러 개면 가장 늦은 것).
    *초등학교통학구역*.zip   https://www.data.go.kr/data/15159265/fileData.do
    *학교학구도연계정보*.csv  https://www.data.go.kr/data/15159266/fileData.do
    *초중등학교위치*.csv      https://www.data.go.kr/data/15159184/fileData.do
    *버스정류장 위치정보*.csv  https://www.data.go.kr/data/15067528/fileData.do
- 사람이 보도·고시로 확인한 대책은 tools/regiontools/curated/<slug>.json (출처 id 와 함께).
시군구 단위 설정은 INFRA_REGIONS 에 더한다.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path

if __package__ in (None, ""):          # 파일로 직접 실행할 때
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from regiontools import api, bundle, geo, infra  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CURATED = Path(__file__).resolve().parent / "curated"
MARGIN_DEG = 0.004                       # V-World 조회 상자를 지구에서 넓히는 정도(약 400 m)
PERMIT_SINCE = "2019-01-01"              # 지구 지정 이후 허가만


@dataclass(frozen=True)
class InfraConfig:
    slug: str
    address_prefix: str                   # 신설예정학교 주소가 이 글자로 시작하는 것만
    sigungu_code: str                     # 건축인허가 시군구 코드
    bjdongs: tuple                        # 건축인허가를 훑을 법정동 코드(지구가 걸친 동)
    edu_new_as_of: str = "2026-03-31"     # 신설예정학교 공시 기준일(알리미 '현황' 쪽에 적힘, 해마다 5월 공시)


INFRA_REGIONS = {
    "incheon-gyeyang": InfraConfig("incheon-gyeyang", "인천광역시 계양구", "28245", ("10700", "10900", "11000")),
}


def build(cfg: InfraConfig, client, raw_dir, today: date, region_dir, log=print) -> dict:
    region = json.loads((Path(region_dir) / "region.json").read_text("utf-8"))
    projects = json.loads((Path(region_dir) / "projects.json").read_text("utf-8"))["projects"]
    areas = [z["poly"] for z in region["zones"] if z.get("poly")]
    if not areas:
        raise ValueError("region.json 에 지구 경계(zones[].poly)가 없어 지구 안 시설을 고를 수 없음")
    bbox = geo.expand_bbox(geo.bbox_of([p for a in areas for p in a]), MARGIN_DEG)

    rows = client.eduinfo_new_schools()
    raw = Path(raw_dir)
    raw.mkdir(parents=True, exist_ok=True)
    (raw / f"교육재정알리미_신설예정학교_{today.isoformat()}.json").write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    scheduled = infra.scheduled_schools(rows, cfg.address_prefix)
    sites = infra.school_sites(client.vworld_features("LT_C_UPISUQ155", bbox=bbox), areas)
    schools = infra.merge_schools(scheduled, sites)
    facility = infra.facility_sites(client.vworld_features("LT_C_UPISUQ154", bbox=bbox), client.vworld_features("LT_C_UPISUQ152", bbox=bbox), areas)

    shp_path, dbf_path = infra.ensure_zone_shp(raw)
    link = infra.read_csv(infra.find_one(raw, "*학교학구도연계정보*.csv"))
    loc = infra.read_csv(infra.find_one(raw, "*초중등학교위치*.csv"))
    zone_date = str(link[0].get("데이터기준일자") or today.isoformat()) if link else today.isoformat()
    zones, att = infra.attendance(projects, shp_path, dbf_path, link, loc, zone_date)

    stop_rows = infra.read_csv(infra.find_one(raw, "*버스정류장 위치정보*.csv"))
    stops = infra.stops_near(stop_rows, areas)
    stop_date = max((str(r.get("정보수집일") or "") for r in stop_rows), default="") or None

    permits_raw = [it for b in cfg.bjdongs for it in client.hub_arch_dong(cfg.sigungu_code, b)]
    permits = infra.nonhousing_permits(permits_raw, PERMIT_SINCE)

    cf = CURATED / f"{cfg.slug}.json"
    curated = json.loads(cf.read_text("utf-8")) if cf.exists() else {}
    dates = {"edu-newschool": cfg.edu_new_as_of, "vworld-upis": today.isoformat(), "hub-arch": today.isoformat(), "edu-zone": zone_date}
    if stop_date:
        dates["molit-busstop"] = stop_date
    doc = infra.assemble(today=today.isoformat(), schools=schools, zones=zones, attendance=att, stops=stops, sites=facility,
                         permits=permits, curated=curated, source_dates=dates)
    log(report(doc))
    return doc


def report(doc: dict) -> str:
    schools = doc.get("schools", [])
    sched = [s for s in schools if s["status"] == "신설예정"]
    lines = [f"infra.json {doc['asOf']}: 신설예정 학교 {len(sched)}개교 · 일정 미공시 학교 부지 {len(schools) - len(sched)}곳 · 통학구역 {len(doc.get('zones', []))}곳 "
             f"(단지 {len(doc.get('attendance', []))}개 연결) · 정류장 {len(doc.get('stops', []))}곳 · 시설 부지 {len(doc.get('sites', []))}곳 · "
             f"비주택 인허가 {len(doc.get('permits', []))}건 · 대책 {len(doc.get('measures', []))}건"]
    for s in sched:
        lines.append(f"  - {s['name']} {s['openYm']} 개교 예정" + ("" if s.get("poly") else " (부지 윤곽 없음)"))
    return "\n".join(lines)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="build_infra", description="지역 번들에 입주 전 기반시설 점검 자료(infra.json)를 만든다.")
    ap.add_argument("slug", choices=sorted(INFRA_REGIONS))
    ap.add_argument("--raw", default=str(ROOT / "workspace" / "data" / "raw" / "infra"), help="공공데이터포털에서 내려받은 파일 폴더")
    ap.add_argument("--env", default=str(ROOT / ".env.local"), help="키 파일(기본 저장소의 .env.local)")
    ap.add_argument("--cache-dir", default=os.environ.get("REGIONBUILD_CACHE"), help="응답 캐시 폴더(저장소 밖)")
    ap.add_argument("--refresh", action="store_true", help="캐시를 무시하고 다시 받기")
    ap.add_argument("--out", default=None, help="출력 폴더(기본 regions/<slug>)")
    ap.add_argument("--today", default=None, help="기준일 YYYY-MM-DD(기본 오늘)")
    ap.add_argument("--edu-as-of", default=None, help="신설예정학교 공시 기준일(기본: 설정값)")
    args = ap.parse_args(argv)
    try:
        keys = api.load_keys(args.env)
    except api.MissingKey as e:
        print(f"오류: {e}. 키가 있을 때만 동작합니다.")
        return 2
    if args.cache_dir and Path(args.cache_dir).resolve().is_relative_to(ROOT):
        print("오류: 캐시 폴더는 저장소 밖이어야 합니다.")
        return 2
    cfg = INFRA_REGIONS[args.slug]
    if args.edu_as_of:
        cfg = InfraConfig(**{**cfg.__dict__, "edu_new_as_of": args.edu_as_of})
    today = date.fromisoformat(args.today) if args.today else date.today()
    out = Path(args.out) if args.out else ROOT / "regions" / cfg.slug
    client = api.Client(keys, cache_dir=args.cache_dir, refresh=args.refresh)
    try:
        doc = build(cfg, client, args.raw, today, out)
    except FileNotFoundError as e:
        print(f"오류: 내려받은 파일이 없음 — {e} (이 파일 머리말의 안내를 보세요)")
        return 2
    except (api.ApiError, ValueError) as e:
        print(f"오류: {e}")
        return 1
    bundle.write_json(out / "infra.json", doc)
    print(f"쓴 파일: {out / 'infra.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
