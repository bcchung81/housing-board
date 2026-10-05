import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

from helpers import ROOT  # noqa: F401  (tools/ 를 sys.path 에 넣는다)
from test_regiontools_infra import edu_row, permit, site_feature, sq
from test_regiontools_shp import write_dbf, write_shp

from regiontools import build_infra, proj

try:
    import jsonschema  # noqa: F401
    HAVE = True
except ImportError:
    HAVE = False

AREA = [[126.75, 37.54], [126.77, 37.54], [126.77, 37.56], [126.75, 37.56]]


class StubClient:
    """네트워크 없이 build 를 돌리는 가짜 클라이언트."""
    def __init__(self):
        self.layers = []

    def eduinfo_new_schools(self):
        return [edu_row(), edu_row(schlSeq=99, schlNm="(가칭)다른구", realAddr="전남광주통합특별시 광산구 하남동 395 일원")]

    def vworld_features(self, layer, bbox=None, attr_filter=None, size=1000):
        self.layers.append(layer)
        return {"LT_C_UPISUQ155": [site_feature("학교", "초등학교", 126.7573, 37.5553), site_feature("학교", "유치원", 126.7556, 37.5467, 77, "6000")],
                "LT_C_UPISUQ154": [site_feature("전기공급설비", "기타전기공급설비", 126.7607, 37.5419, 50, "2400", "전기공급설비")],
                "LT_C_UPISUQ152": []}[layer]

    def hub_arch_dong(self, sigungu, bjdong):
        return [permit()] if bjdong == "11000" else []


def write_raw(raw: Path):
    ring = lambda lo0, la0, lo1, la1: [proj.to_tm(*p) for p in [(lo0, la0), (lo0, la1), (lo1, la1), (lo1, la0), (lo0, la0)]]
    write_shp(raw / "x초등학교통학구역_20260920.shp", [[ring(126.74, 37.54, 126.78, 37.57)]])
    write_dbf(raw / "x초등학교통학구역_20260920.dbf", [{"HAKGUDO_ID": "ZA", "HAKGUDO_NM": "가초통학구역", "HAKGUDO_GB": "0", "BASE_DT": "2026-09-20"}])


class BuildEndToEnd(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        t = Path(self.tmp.name)
        self.region = t / "regions" / "test-region"
        self.region.mkdir(parents=True)
        (self.region / "region.json").write_text(json.dumps({"zones": [{"id": "z", "name": "지구", "poly": AREA}]}), "utf-8")
        (self.region / "projects.json").write_text(json.dumps({"projects": [{"id": "p1", "outline": {"poly": sq(126.755, 37.55)}}]}), "utf-8")
        self.raw = t / "raw"
        self.raw.mkdir()
        # 압축 파일 대신 이미 풀린 폴더를 쓴다(ensure_zone_shp 가 elem_zone/ 을 우선 인정)
        (self.raw / "elem_zone").mkdir()
        write_raw(self.raw / "elem_zone")
        (self.raw / "elem_zone" / "x초등학교통학구역_20260920.shp").rename(self.raw / "elem_zone" / "elem_zone.shp")
        (self.raw / "elem_zone" / "x초등학교통학구역_20260920.dbf").rename(self.raw / "elem_zone" / "elem_zone.dbf")
        (self.raw / "학교학구도연계정보_20260920.csv").write_text("학구ID,학교ID,학교명,학교급구분,데이터기준일자\nZA,B1,가초등학교,초등학교,2026-09-20\n", "utf-8")
        (self.raw / "초중등학교위치_20260920.csv").write_text("학교ID,학교명,위도,경도\nB1,가초등학교,37.555,126.755\n", "utf-8-sig")
        (self.raw / "국토교통부_전국 버스정류장 위치정보_20251031.csv").write_text(
            "정류장번호,정류장명,위도,경도,정보수집일\n1,가정류장,37.55,126.76,2025-10-31\n2,먼정류장,36.0,127.0,2025-10-31\n", "utf-8")
        self.cfg = build_infra.InfraConfig("test-region", "인천광역시 계양구", "28245", ("10700", "10900", "11000"))

    def tearDown(self):
        self.tmp.cleanup()

    def run_build(self):
        logs = []
        client = StubClient()
        doc = build_infra.build(self.cfg, client, self.raw, date(2026, 10, 4), self.region, log=logs.append)
        return doc, client, logs

    def test_builds_every_section_from_the_pieces(self):
        doc, client, logs = self.run_build()
        self.assertEqual(sorted(client.layers), ["LT_C_UPISUQ152", "LT_C_UPISUQ154", "LT_C_UPISUQ155"])
        schools = {s["id"]: s for s in doc["schools"]}
        self.assertEqual(schools["edu-51"]["openYm"], "2029-03")
        self.assertIn("poly", schools["edu-51"])
        self.assertEqual([s["status"] for s in doc["schools"]].count("부지만"), 1)       # 유치원 부지
        self.assertEqual([z["id"] for z in doc["zones"]], ["ZA"])
        self.assertEqual(doc["attendance"], [{"projectId": "p1", "zoneId": "ZA"}])
        self.assertEqual([s["name"] for s in doc["stops"]], ["가정류장"])
        self.assertEqual(doc["sites"][0]["category"], "전기")
        self.assertEqual(doc["permits"][0]["name"], "공공주택지구 커뮤니티3")
        self.assertEqual(doc["asOf"], "2026-10-04")
        dates = {s["id"]: s.get("asOf") for s in doc["sources"]}
        self.assertEqual(dates["molit-busstop"], "2025-10-31")
        self.assertEqual(dates["edu-newschool"], "2026-03-31")
        self.assertEqual(dates["edu-zone"], "2026-09-20")
        self.assertIn("신설예정 학교 1개교", logs[0])

    def test_saves_the_raw_planned_school_list_next_to_the_other_raw_files(self):
        self.run_build()
        saved = json.loads((self.raw / "교육재정알리미_신설예정학교_2026-10-04.json").read_text("utf-8"))
        self.assertEqual(len(saved), 2)

    @unittest.skipUnless(HAVE, "jsonschema 패키지가 필요함 (.venv/bin/python 으로 실행)")
    def test_result_passes_the_bundle_checker(self):
        from regiontools import check_bundle
        doc, _, _ = self.run_build()
        self.assertEqual(check_bundle._schema_errors("infra.json", doc, "infra"), [])
        self.assertEqual(check_bundle._semantic_infra(doc, {"projects": [{"id": "p1"}]}), [])

    def test_missing_download_is_a_clear_file_not_found(self):
        (self.raw / "국토교통부_전국 버스정류장 위치정보_20251031.csv").unlink()
        with self.assertRaises(FileNotFoundError):
            self.run_build()

    def test_region_without_a_district_boundary_is_an_error(self):
        (self.region / "region.json").write_text(json.dumps({"zones": [{"id": "z", "name": "지구"}]}), "utf-8")
        with self.assertRaises(ValueError):
            self.run_build()

    def test_every_configured_region_has_a_curated_file_that_names_known_sources(self):
        for slug in build_infra.INFRA_REGIONS:
            data = json.loads((build_infra.CURATED / f"{slug}.json").read_text("utf-8"))
            ids = {s["id"] for s in data["sources"]}
            for m in data["measures"]:
                self.assertTrue(set(m["sources"]) <= ids, m["id"])


if __name__ == "__main__":
    unittest.main()
