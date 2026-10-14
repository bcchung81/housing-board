"""tools/ledger/home-dump.py — COPY 파서·결정성·키 검사 (실제 덤프에 의존하지 않는다)"""
import gzip, importlib.util, os, unittest

_P = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tools', 'ledger', 'home-dump.py')
_spec = importlib.util.spec_from_file_location('home_dump', _P)
hd = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(hd)

COPY = (b'COPY public.t (id, name, payload, note) FROM stdin;\n'
        b'a1\tx\\ty\\nz\\\\w\t{"k":"\\\\uac00 \xea\xb0\x80"}\t\\N\n'
        b'a2\t\t{"n":null}\t\\N\n'
        b'\\.\n')


class ParseTest(unittest.TestCase):
    def rows(self):
        return [hd.to_record(c, v) for _t, c, v in hd.parse_copy(iter(COPY.splitlines(True)))]

    def test_escape_and_null(self):
        r = self.rows()
        self.assertEqual(len(r), 2)
        self.assertEqual(r[0]['name'], 'x\ty\nz\\w')
        self.assertIsNone(r[0]['note'])
        self.assertEqual(r[1]['name'], '')
        self.assertEqual(r[0]['payload']['k'], '가 가')

    def test_column_mismatch(self):
        bad = [b'COPY public.t (a, b) FROM stdin;\n', b'1\n']
        with self.assertRaises(ValueError):
            list(hd.parse_copy(iter(bad)))

    def test_octal_hex_bytes(self):
        self.assertEqual(hd.unescape_field(b'\\352\\260\\200'), '가')
        self.assertEqual(hd.unescape_field(b'\\xea\\xb0\\x80'), '가')


class DeterminismTest(unittest.TestCase):
    def test_same_bytes(self):
        rows = [{'b': 1, 'a': '가'}, {'z': None}]
        a, b = hd.encode_rows(rows), hd.encode_rows(rows)
        self.assertEqual(a, b)
        text = gzip.decompress(a).decode('utf-8')
        self.assertEqual(text, '{"a":"가","b":1}\n{"z":null}\n')
        self.assertEqual(a[4:8], b'\0\0\0\0')  # mtime=0
        self.assertEqual(a[3] & 0x08, 0)  # 파일명 없음


class KeyScanTest(unittest.TestCase):
    def test_catches_fake_keys(self):
        t = '{"u":"http://x/api?serviceKey=FAKE123abc&a=1"}'
        self.assertEqual(hd.key_scan(t)['name_value'], 1)
        t2 = 'https://x/y?token=' + 'A' * 40
        self.assertEqual(hd.key_scan(t2)['url_query_long_token'], 1)
        self.assertEqual(hd.key_scan('apikey=%s authKey=abc access_token=def' % 'q')['name_value'], 3)

    def test_clean(self):
        self.assertEqual(hd.key_scan('https://x/y?a=1&b=가나다 name 서비스'), {'name_value': 0, 'url_query_long_token': 0})

    def test_percent_encoded_text_is_not_key(self):
        utf8 = 'https://x/y?zonenm=' + '%EA%B3%84%EC%96%91' * 4
        euckr = 'https://x/y?zonenm=' + '%B0%E8%BE%E7' * 8  # EUC-KR 지구명(UTF-8 로 못 읽음)
        for t in (utf8, euckr):
            self.assertEqual(hd.key_scan(t)['url_query_long_token'], 0)


if __name__ == '__main__':
    unittest.main()
