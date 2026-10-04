import unittest

from helpers import SPEC
import gen_docs


class GenDocs(unittest.TestCase):
    def test_csv_templates_are_header_only_with_bom(self):
        templates = gen_docs.render_templates(SPEC)
        text = templates["projects.csv"]
        self.assertTrue(text.startswith("﻿region_slug,project_id,zone_id,project_name"))
        self.assertEqual(text.count("\n"), 1)
        self.assertEqual(sorted(templates), sorted(SPEC.files))

    def test_geojson_template_is_an_empty_feature_collection(self):
        text = gen_docs.render_templates(SPEC)["geometry_overrides.geojson"]
        self.assertIn('"type": "FeatureCollection"', text)
        self.assertIn('"features": []', text)

    def test_field_tables_list_every_file_and_column(self):
        md = gen_docs.render_field_tables(SPEC)
        for name, fs in SPEC.files.items():
            self.assertIn(f"#### {name}", md)
            for c in fs.columns:
                self.assertIn(f"| `{c.name}` |", md)
        self.assertIn("참조:", md)

    def test_required_columns_are_marked(self):
        md = gen_docs.render_field_tables(SPEC)
        self.assertIn("| `project_id` | ● |", md)
        self.assertIn("| `zone_id` |  |", md)

    def test_enum_table_lists_every_value(self):
        md = gen_docs.render_enums(SPEC)
        for name, values in SPEC.enums.items():
            self.assertIn(f"`{name}`", md)
            for v in values:
                self.assertIn(v, md)

    def test_type_label(self):
        floors = SPEC.files["dongs.csv"].columns[3]
        self.assertEqual(floors.name, "floors_above")
        self.assertEqual(gen_docs.type_label(floors), "정수 0~120")
        sponsor = [c for c in SPEC.files["projects.csv"].columns if c.name == "sponsor_type"][0]
        self.assertEqual(gen_docs.type_label(sponsor), "열거 (sponsor_type)")

    def test_inject_replaces_between_markers_and_is_idempotent(self):
        text = "머리\n<!-- GENERATED:x:BEGIN -->\n옛 내용\n<!-- GENERATED:x:END -->\n꼬리\n"
        once = gen_docs.inject(text, "x", "새 내용\n")
        self.assertEqual(once, "머리\n<!-- GENERATED:x:BEGIN -->\n새 내용\n<!-- GENERATED:x:END -->\n꼬리\n")
        self.assertEqual(gen_docs.inject(once, "x", "새 내용\n"), once)

    def test_inject_without_markers_raises(self):
        with self.assertRaises(ValueError):
            gen_docs.inject("표지 없음", "x", "내용\n")


if __name__ == "__main__":
    unittest.main()
