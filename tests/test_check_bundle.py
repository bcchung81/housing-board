import copy
import json
import tempfile
import unittest
from pathlib import Path

from helpers import ROOT  # noqa: F401  (tools/ 를 sys.path 에 넣는다)

try:
    import jsonschema  # noqa: F401
    HAVE = True
except ImportError:
    HAVE = False

RING = [[126.78, 35.15], [126.79, 35.15], [126.79, 35.16], [126.78, 35.16]]

REGION = {
    "schema_version": "1.1.0", "slug": "test-region", "name": "테스트구", "title": "주택파동 · 테스트구",
    "updatedAt": "2026-10-04", "view": {"center": [126.785, 35.155], "zoom": 15},
    "codes": [{"code": "12330", "type": "sigungu", "name": "테스트구"}],
    "zones": [{"id": "z1", "name": "테스트 지구", "type": "공공주택지구", "publicLand": True, "poly": RING}],
    "sources": [{"id": "src-a", "label": "출처 A", "redistributable": "unknown"}],
    "statusOrder": ["계획", "분양중", "건설 단계", "준공 임박", "입주 단계"],
}
PROJECT = {
    "id": "z1-A1", "label": "A-1", "name": "테스트 A-1", "sponsor": {"name": "LH", "type": "public"},
    "sponsorClass": "public", "kind": "공공분양", "status": "입주 단계", "units": 100, "dongCount": 1,
    "outline": {"tier": "official", "poly": RING},
    "dongs": [{"no": "101", "tier": "building", "floorsAbove": 15, "poly": [RING]}],
    "sources": ["src-a"],
}
BUILDINGS = {"type": "FeatureCollection", "meta": {"basis": "20261004"},
             "features": [{"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [RING + [RING[0]]]},
                           "properties": {"eh": 12.0, "src": "정보없음"}}]}
CONTEXT = {"stations": [{"name": "테스트역", "lon": 126.78, "lat": 35.15}], "schools": [], "asOf": "2026-10-04", "source": "OSM"}
INDEX = {"schema_version": "1.1.0", "regions": [
    {"slug": "test-region", "name": "테스트구", "default": True, "visibility": "public",
     "updatedAt": "2026-10-04", "schema_version": "1.1.0"}]}


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def make(tmp, region=None, projects=None, buildings=None, context="default", index=None):
    root = Path(tmp) / "regions"
    d = root / "test-region"
    write_json(root / "index.json", index if index is not None else INDEX)
    write_json(d / "region.json", region if region is not None else REGION)
    write_json(d / "projects.json", projects if projects is not None else {"schema_version": "1.1.0", "projects": [PROJECT]})
    write_json(d / "buildings.json", buildings if buildings is not None else BUILDINGS)
    if context == "default":
        write_json(d / "context.json", CONTEXT)
    elif context is not None:
        write_json(d / "context.json", context)
    return root


def variant(base, **changes):
    d = copy.deepcopy(base)
    for k, v in changes.items():
        d[k] = v
    return d


@unittest.skipUnless(HAVE, "jsonschema 패키지가 필요함 (.venv/bin/python 으로 실행)")
class CheckBundle(unittest.TestCase):
    def setUp(self):
        import regiontools.check_bundle as cb
        self.cb = cb

    def errors(self, **kw):
        with tempfile.TemporaryDirectory() as tmp:
            root = make(tmp, **kw)
            return self.cb.check_region_dir(root / "test-region") + self.cb.check_index(root / "index.json")

    def test_valid_bundle_has_no_errors(self):
        self.assertEqual(self.errors(), [])

    def test_context_is_optional(self):
        self.assertEqual(self.errors(context=None), [])

    def test_a_1_0_0_bundle_without_new_fields_is_still_valid(self):
        self.assertEqual(self.errors(), [])  # PROJECT 에는 1.1.0 추가 필드가 하나도 없다

    def test_1_1_0_fields_are_accepted(self):
        project = copy.deepcopy(PROJECT)
        project.update(note="메모", builder="시공사", contractAmountM=1000.5)
        project["progress"] = {"rate": 12.5, "asOf": "2026-10-04", "start": "2026-01-01", "end": "2028-01-01", "source": "src-a"}
        region = variant(REGION, projectOrder=["z1-A1"])
        self.assertEqual(self.errors(projects={"schema_version": "1.1.0", "projects": [project]}, region=region), [])

    def test_schema_violation_names_the_missing_field(self):
        bad = {k: v for k, v in PROJECT.items() if k != "label"}
        errs = self.errors(projects={"schema_version": "1.1.0", "projects": [bad]})
        self.assertTrue(any("label" in e and "projects.json" in e for e in errs), errs)

    def test_unknown_status_is_a_schema_error(self):
        errs = self.errors(projects={"schema_version": "1.1.0", "projects": [dict(PROJECT, status="공사중")]})
        self.assertTrue(any("status" in e for e in errs), errs)

    def test_project_source_must_exist_in_region_sources(self):
        errs = self.errors(projects={"schema_version": "1.1.0", "projects": [dict(PROJECT, sources=["nope"])]})
        self.assertTrue(any("nope" in e for e in errs), errs)

    def test_progress_source_must_exist(self):
        p = dict(PROJECT, progress={"rate": 1, "asOf": "2026-10-04", "source": "nope"})
        errs = self.errors(projects={"schema_version": "1.1.0", "projects": [p]})
        self.assertTrue(any("nope" in e for e in errs), errs)

    def test_duplicate_project_ids(self):
        errs = self.errors(projects={"schema_version": "1.1.0", "projects": [PROJECT, copy.deepcopy(PROJECT)]})
        self.assertTrue(any("중복" in e and "z1-A1" in e for e in errs), errs)

    def test_project_order_must_reference_existing_projects(self):
        errs = self.errors(region=variant(REGION, projectOrder=["z1-A1", "ghost"]))
        self.assertTrue(any("ghost" in e for e in errs), errs)

    def test_region_slug_must_match_folder(self):
        errs = self.errors(region=variant(REGION, slug="other"))
        self.assertTrue(any("폴더" in e for e in errs), errs)

    def test_index_needs_exactly_one_default(self):
        two = copy.deepcopy(INDEX)
        two["regions"].append(dict(two["regions"][0], slug="other", name="다른구"))
        none = copy.deepcopy(INDEX)
        none["regions"][0].pop("default")
        for label, idx in (("둘", two), ("없음", none)):
            with self.subTest(label):
                with tempfile.TemporaryDirectory() as tmp:
                    root = make(tmp, index=idx)
                    errs = self.cb.check_index(root / "index.json")
                    self.assertTrue(any("default" in e for e in errs), errs)

    def test_index_region_folder_must_exist(self):
        idx = copy.deepcopy(INDEX)
        idx["regions"].append(dict(idx["regions"][0], slug="ghost-region", name="유령", default=False))
        with tempfile.TemporaryDirectory() as tmp:
            root = make(tmp, index=idx)
            errs = self.cb.check_index(root / "index.json")
            self.assertTrue(any("ghost-region" in e for e in errs), errs)

    def test_cli_exit_codes(self):
        import contextlib, io
        with tempfile.TemporaryDirectory() as tmp:
            root = make(tmp)
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(self.cb.main([str(root)]), 0)
                self.assertEqual(self.cb.main([str(Path(tmp) / "nope")]), 2)
            bad = make(tempfile.mkdtemp(), projects={"schema_version": "1.1.0", "projects": [dict(PROJECT, status="x")]})
            with contextlib.redirect_stdout(out):
                self.assertEqual(self.cb.main([str(bad)]), 1)


if __name__ == "__main__":
    unittest.main()
