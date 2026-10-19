#!/usr/bin/env python3
"""일반사용자 B안 '신문 1면' 시제품 빌드.

data/board/*.json + notices.json(공고 스냅숏) → template.html 의 /*__DATA__*/ 자리에 넣어
docs/design/일반사용자-B안-신문.html 한 파일을 만든다.

  python3 build.py            # 있는 notices.json 으로 빌드
  python3 build.py --fetch    # 로컬 서버(127.0.0.1:8000)에서 경기 공고를 다시 받아 notices.json 을 바꾼 뒤 빌드
"""
import json
import math
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
BOARD = ROOT / "data" / "board"
OUT = ROOT / "docs" / "design" / "일반사용자-B안-신문.html"
NOTICES = HERE / "notices.json"
NOTICES_URL = "http://127.0.0.1:8000/api/v1/notices?sido=41"

# 경기 31개 시군의 시 단위 행정표준코드(구가 있는 시는 시 코드 하나로 묶는다)
CITY_CODE = {
    "수원시": "41110", "성남시": "41130", "의정부시": "41150", "안양시": "41170", "부천시": "41190",
    "광명시": "41210", "평택시": "41220", "동두천시": "41250", "안산시": "41270", "고양시": "41280",
    "과천시": "41290", "구리시": "41310", "남양주시": "41360", "오산시": "41370", "시흥시": "41390",
    "군포시": "41410", "의왕시": "41430", "하남시": "41450", "용인시": "41460", "파주시": "41480",
    "이천시": "41500", "안성시": "41550", "김포시": "41570", "화성시": "41590", "광주시": "41610",
    "양주시": "41630", "포천시": "41650", "여주시": "41670", "연천군": "41800", "가평군": "41820",
    "양평군": "41830",
}
STAGES = ("02", "03", "04", "05")


def fetch_notices():
    raw = subprocess.run(["curl", "-s", "--max-time", "60", NOTICES_URL], check=True, capture_output=True).stdout
    body = json.loads(raw)
    snap = {"fetchedAt": datetime.now().strftime("%Y-%m-%dT%H:%M"), "url": NOTICES_URL, "response": body}
    NOTICES.write_text(json.dumps(snap, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"notices.json: {len(body.get('items', []))}건 ({snap['fetchedAt']})")


def rings(d):
    """'M x y l dx dy … z' 경로 → 꼭짓점 목록들."""
    out = []
    for part in re.findall(r"M([^Mz]+)z?", d):
        nums = [float(n) for n in re.findall(r"-?\d+(?:\.\d+)?", part.replace("l", " "))]
        x, y = nums[0], nums[1]
        pts = [(x, y)]
        for i in range(2, len(nums) - 1, 2):
            x += nums[i]
            y += nums[i + 1]
            pts.append((x, y))
        out.append(pts)
    return out


def inside(px, py, rs):
    c = False
    for r in rs:
        n = len(r)
        for i in range(n):
            x1, y1 = r[i]
            x2, y2 = r[(i + 1) % n]
            if (y1 > py) != (y2 > py) and px < (x2 - x1) * (py - y1) / (y2 - y1) + x1:
                c = not c
    return c


def edge_dist(px, py, rs):
    best = 1e18
    for r in rs:
        n = len(r)
        for i in range(n):
            x1, y1 = r[i]
            x2, y2 = r[(i + 1) % n]
            dx, dy = x2 - x1, y2 - y1
            L = dx * dx + dy * dy
            t = 0 if L == 0 else max(0, min(1, ((px - x1) * dx + (py - y1) * dy) / L))
            ex, ey = x1 + t * dx - px, y1 + t * dy - py
            best = min(best, ex * ex + ey * ey)
    return math.sqrt(best)


def label_point(rs):
    """면 안에서 가장자리와 가장 먼 점(라벨이 자기 면 위에 앉도록)."""
    xs = [p[0] for r in rs for p in r]
    ys = [p[1] for r in rs for p in r]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    best = None
    step = max(x1 - x0, y1 - y0) / 36
    for _ in range(3):
        cand = []
        y = y0
        while y <= y1:
            x = x0
            while x <= x1:
                if inside(x, y, rs):
                    cand.append((edge_dist(x, y, rs), x, y))
                x += step
            y += step
        if cand:
            b = max(cand)
            if not best or b[0] > best[0]:
                best = b
        cx, cy = best[1], best[2]
        x0, x1, y0, y1 = cx - step * 2, cx + step * 2, cy - step * 2, cy + step * 2
        step /= 4
    return round(best[1]), round(best[2]), round(best[0])


def clean_name(n):
    if not n or n.startswith("PRJ-"):
        return "이름 미정 사업"
    n = re.sub(r"^(조달청|민간참여)\)\s*", "", n)
    n = re.sub(r"([A-Za-z]*-?\d+)BL\b", r"\1블록", n)
    n = re.sub(r"\s*\($", "", n).strip()
    return n


def year_of(stages):
    for key in ("MOVE_IN", "COMPLETION"):
        v = stages.get(key) or {}
        dt = v.get("actual") or v.get("plan")
        if dt:
            return dt[:4]
    return None


def main():
    if "--fetch" in sys.argv:
        fetch_notices()
    lmap = json.loads((BOARD / "ledger-map.json").read_text(encoding="utf-8"))
    pidx = json.loads((BOARD / "projects-index.json").read_text(encoding="utf-8"))
    pdet = json.loads((BOARD / "project-detail.json").read_text(encoding="utf-8"))["projects"]
    rmap = json.loads((BOARD / "region-map.json").read_text(encoding="utf-8"))
    snap = json.loads(NOTICES.read_text(encoding="utf-8"))

    # 시군별 사업(단계 02~05)
    cities = {name: {"c": code, "n": name, "p": []} for name, code in CITY_CODE.items()}
    for sgg, rows in lmap["bySgg"].items():
        if not sgg.startswith("41"):
            continue
        city = pidx["sgg"][sgg].split()[1]
        for x in rows:
            if x["stage"] not in STAGES:
                continue
            st = pdet.get(x["id"], {}).get("stages", {})
            comp = (st.get("COMPLETION") or {})
            cities[city]["p"].append({
                "n": clean_name(x["name"]),
                "u": x["units"] or 0,
                "s": x["stage"],
                "y": year_of(st),
                "cd": comp.get("actual") or comp.get("plan"),
            })
    for c in cities.values():
        c["p"].sort(key=lambda p: -p["u"])

    # 지도: 경기 면(고를 수 있음) + 서울·인천 면(맥락)
    shapes, ctx = [], []
    for f in rmap["sgg"]:
        if f["s"] == "41":
            lx, ly, r = label_point(rings(f["d"]))
            shapes.append({"c": CITY_CODE[f["n"]], "n": f["n"], "d": f["d"], "lx": lx, "ly": ly, "r": r})
        else:
            ctx.append({"s": f["s"], "n": f["n"], "d": f["d"]})
    # 맥락 라벨: 서울 = 구 라벨점 평균, 인천 = 부평구 라벨점
    seoul = [label_point(rings(f["d"])) for f in ctx if f["s"] == "11"]
    bupyeong = next(f for f in ctx if f["s"] == "28" and f["n"] == "부평구")
    ctx_labels = [
        {"n": "서울", "x": round(sum(p[0] for p in seoul) / len(seoul)), "y": round(sum(p[1] for p in seoul) / len(seoul))},
        {"n": "인천", **dict(zip(("x", "y"), label_point(rings(bupyeong["d"]))[:2]))},
    ]

    items = []
    for n in snap["response"].get("items", []):
        items.append({k: n.get(k) for k in (
            "kind", "title", "supplyType", "housingType", "units", "address", "applyFrom", "applyTo",
            "url", "source", "targets", "deposit", "monthlyRent", "sgg", "sggName")})

    data = {
        "ref": lmap["referenceDate"],
        "noticesAt": snap["fetchedAt"],
        "noticeSource": snap["response"].get("meta", {}).get("source", ""),
        "view": rmap["view"]["41"],
        "cities": list(cities.values()),
        "shapes": shapes,
        "ctx": ctx,
        "ctxLabels": ctx_labels,
        "notices": items,
    }
    tpl = (HERE / "template.html").read_text(encoding="utf-8")
    js = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    OUT.write_text(tpl.replace("/*__DATA__*/null", js), encoding="utf-8")
    total = sum(p["u"] for c in cities.values() for p in c["p"])
    print(f"{OUT.relative_to(ROOT)}: {OUT.stat().st_size // 1024} KB · 경기 {total:,}집 · 공고 {len(items)}건")


if __name__ == "__main__":
    main()
