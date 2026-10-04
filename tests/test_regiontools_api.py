import json
import tempfile
import unittest
from pathlib import Path

from helpers import ROOT  # noqa: F401  (tools/ 를 sys.path 에 넣는다)

from regiontools import api

FAKE_DG = "fake+data/go==KEY"
FAKE_VW = "FAKE-VWORLD-KEY-0000"
KEYS = api.Keys(data_go_kr=FAKE_DG, vworld=FAKE_VW, vworld_domain="example.test")


def body(obj):
    return json.dumps(obj).encode("utf-8")


def hub_page(items, total):
    return body({"response": {"header": {"resultCode": "00"}, "body": {"items": {"item": items}, "totalCount": total}}})


def vw_page(features, page, pages):
    return body({"response": {"status": "OK", "page": {"total": str(pages), "current": str(page)},
                              "result": {"featureCollection": {"type": "FeatureCollection", "features": features}}}})


class FakeFetch:
    def __init__(self, responses):
        self.responses = list(responses)
        self.urls = []

    def __call__(self, url, data=None, headers=None, timeout=None):
        self.urls.append(url)
        return self.responses.pop(0)


class Env(unittest.TestCase):
    def test_load_env(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / ".env.local"
            p.write_text('# 주석\nDATA_GO_KR_KEY="abc+/="\nVWORLD_KEY=xyz\nVWORLD_DOMAIN=\'dom\'\n\n', encoding="utf-8")
            env = api.load_env(p)
            self.assertEqual(env, {"DATA_GO_KR_KEY": "abc+/=", "VWORLD_KEY": "xyz", "VWORLD_DOMAIN": "dom"})
            keys = api.load_keys(p)
            self.assertEqual(keys.vworld_domain, "dom")

    def test_missing_keys_raise(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / ".env.local"
            p.write_text("VWORLD_KEY=xyz\n", encoding="utf-8")
            with self.assertRaises(api.MissingKey):
                api.load_keys(p)
            with self.assertRaises(api.MissingKey):
                api.load_keys(Path(tmp) / "none")


class Helpers(unittest.TestCase):
    def test_cache_key_ignores_secrets_and_order(self):
        a = api.cache_key("hub", {"serviceKey": "k1", "pageNo": 1, "sigunguCd": "12330"})
        b = api.cache_key("hub", {"sigunguCd": "12330", "pageNo": 1, "serviceKey": "k2"})
        self.assertEqual(a, b)
        self.assertNotIn("k1", a)
        self.assertNotEqual(a, api.cache_key("hub", {"sigunguCd": "12330", "pageNo": 2}))

    def test_extract_items_variants(self):
        self.assertEqual(api.extract_items({"response": {"body": {"items": {"item": [{"a": 1}]}}}}), [{"a": 1}])
        self.assertEqual(api.extract_items({"response": {"body": {"items": {"item": {"a": 1}}}}}), [{"a": 1}])
        self.assertEqual(api.extract_items({"response": {"body": {"items": ""}}}), [])
        self.assertEqual(api.extract_items({"response": {"body": {"item": [{"a": 2}]}}}), [{"a": 2}])

    def test_redact(self):
        s = api.redact("x serviceKey=fake%2Bdata%2Fgo%3D%3DKEY and fake+data/go==KEY", [FAKE_DG])
        self.assertNotIn("KEY", s.replace("<KEY>", ""))

    def test_pan_id(self):
        url = "https://apply.lh.or.kr/x/selectWrtancInfo.do?panId=0000061131&ccrCnntSysDsCd=02"
        self.assertEqual(api.pan_id(url), "0000061131")
        self.assertIsNone(api.pan_id("https://example.org/"))


class ClientCalls(unittest.TestCase):
    def test_retry_then_cache(self):
        with tempfile.TemporaryDirectory() as tmp:
            waits = []
            fetch = FakeFetch([(503, b""), (200, b""), (200, hub_page([{"a": 1}, {"a": 2}], 2))])
            c = api.Client(KEYS, cache_dir=tmp, fetch=fetch, sleep=waits.append)
            self.assertEqual(c.hub_basis("12330", "10600"), [{"a": 1}, {"a": 2}])
            self.assertEqual(len(fetch.urls), 3)
            self.assertEqual(waits, sorted(waits))
            self.assertGreater(waits[1], waits[0])
            # 두 번째는 캐시에서 읽는다
            c2 = api.Client(KEYS, cache_dir=tmp, fetch=FakeFetch([]), sleep=waits.append)
            self.assertEqual(c2.hub_basis("12330", "10600"), [{"a": 1}, {"a": 2}])
            self.assertEqual(c2.calls["cache"], 1)
            for f in Path(tmp).rglob("*"):
                self.assertNotIn(FAKE_DG, f.name)
                if f.is_file():
                    text = f.read_text("utf-8")
                    self.assertNotIn(FAKE_DG, text)
                    self.assertNotIn("serviceKey", text)

    def test_gives_up_after_five_attempts(self):
        fetch = FakeFetch([(503, b"")] * 5)
        c = api.Client(KEYS, fetch=fetch, sleep=lambda s: None)
        with self.assertRaises(api.ApiError) as cm:
            c.hub_basis("12330", "10600")
        self.assertEqual(len(fetch.urls), 5)
        self.assertNotIn(FAKE_DG, str(cm.exception))

    def test_key_rejection_is_not_retried(self):
        xml = b"<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>"
        fetch = FakeFetch([(200, xml)])
        c = api.Client(KEYS, fetch=fetch, sleep=lambda s: None)
        with self.assertRaises(api.ApiError) as cm:
            c.hub_basis("12330", "10600")
        self.assertIn("SERVICE_KEY_IS_NOT_REGISTERED_ERROR", str(cm.exception))
        self.assertEqual(len(fetch.urls), 1)

    def test_hub_paging(self):
        fetch = FakeFetch([(200, hub_page([{"n": i} for i in range(100)], 150)),
                           (200, hub_page([{"n": i} for i in range(100, 150)], 150))])
        c = api.Client(KEYS, fetch=fetch, sleep=lambda s: None)
        self.assertEqual(len(c.hub_basis("12330", "10600")), 150)
        self.assertIn("pageNo=2", fetch.urls[1])

    def test_vworld_paging_and_not_found(self):
        f1 = {"type": "Feature", "properties": {"a": 1}, "geometry": None}
        fetch = FakeFetch([(200, vw_page([f1], 1, 2)), (200, vw_page([f1], 2, 2)),
                           (200, body({"response": {"status": "NOT_FOUND"}}))])
        c = api.Client(KEYS, fetch=fetch, sleep=lambda s: None)
        self.assertEqual(len(c.vworld_features("LT_C_BLDGINFO", bbox=(126.0, 35.0, 126.1, 35.1))), 2)
        self.assertIn("BOX%28126.0%2C35.0%2C126.1%2C35.1%29", fetch.urls[0])
        self.assertEqual(c.vworld_features("LP_PA_CBND_BUBUN", attr_filter="pnu:=:1233010600105190000"), [])

    def test_overpass_retries_busy_server_then_gives_up(self):
        ok = body({"elements": [{"type": "node", "lat": 35.1, "lon": 126.7, "tags": {"name": "역"}}]})
        waits = []
        fetch = FakeFetch([(504, b"busy"), (429, b""), (200, ok)])
        c = api.Client(KEYS, fetch=fetch, sleep=waits.append)
        self.assertEqual(len(c.overpass("[out:json];node(1);out;")["elements"]), 1)
        self.assertEqual(len(fetch.urls), 3)
        self.assertEqual(len(waits), 2)
        fetch = FakeFetch([(504, b"")] * 3)
        c = api.Client(KEYS, fetch=fetch, sleep=lambda s: None)
        with self.assertRaises(api.ApiError):
            c.overpass("[out:json];node(1);out;")
        self.assertEqual(len(fetch.urls), 3)

    def test_vworld_error_raises(self):
        fetch = FakeFetch([(200, body({"response": {"status": "ERROR", "error": {"code": "INVALID_KEY", "text": "x"}}}))])
        c = api.Client(KEYS, fetch=fetch, sleep=lambda s: None)
        with self.assertRaises(api.ApiError) as cm:
            c.vworld_features("LT_C_BLDGINFO", bbox=(126.0, 35.0, 126.1, 35.1))
        self.assertIn("INVALID_KEY", str(cm.exception))
        self.assertNotIn(FAKE_VW, str(cm.exception))


if __name__ == "__main__":
    unittest.main()
