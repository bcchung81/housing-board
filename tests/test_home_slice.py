"""tools/ledger/home-slice.py — HOME 원천 슬라이스 만들기·반영(가짜 작은 판으로 멈춤 조건, 실제 판이 있으면 10-22 왕복)"""
import gzip, hashlib, importlib.util, json, os, shutil, subprocess, tempfile, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_spec = importlib.util.spec_from_file_location('home_slice', os.path.join(ROOT, 'tools', 'ledger', 'home-slice.py'))
hs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(hs)
SPEC = hs.load_spec()
HOME = os.path.join(ROOT, 'schemas', 'ledger-2026-10', 'raw', 'home')


def rb(path):
    with open(path, 'rb') as f:
        return f.read()


def rj(path):
    return json.loads(rb(path).decode('utf-8'))


def rev(eid, no, at, payload, kind='project'):
    return {'entity_id': eid, 'kind': kind, 'source_id': 'src', 'revision_no': no, 'recorded_at': at,
            'payload_hash': hashlib.sha256(json.dumps(payload).encode()).hexdigest(), 'batch_id': 'b', 'payload': payload}


def write_edition(folder, snapshot, kinds):
    """home-dump.py 꼴 내부 판(가짜): kinds = {이름: 행 목록}"""
    os.makedirs(folder)
    files = {}
    for name, rows in kinds.items():
        blob = hs.encode_rows(rows)
        with open(os.path.join(folder, name + '.jsonl.gz'), 'wb') as f:
            f.write(blob)
        files[name + '.jsonl.gz'] = {'rows': len(rows), 'sha256': hs.sha(blob), 'bytes': len(blob)}
    with open(os.path.join(folder, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump({'snapshot_at': snapshot, 'source_commit': 'c0ffee', 'dump_sha256': 'f' * 64, 'files': files}, f)


def read_edition(folder):
    out = {}
    for fn in sorted(os.listdir(folder)):
        with open(os.path.join(folder, fn), 'rb') as f:
            out[fn] = f.read()
    return out


def write_sql_export(spec, ex, folder):
    """export_from_editions 결과를 SQL 내보내기(home-slice.py sql) 꼴 폴더로 — 행 JSON 의 시각은 ::text 꼴 그대로."""
    os.makedirs(os.path.join(folder, 'rows'))
    def put(rel, rows):
        with open(os.path.join(folder, rel), 'w', encoding='utf-8') as f:
            f.write(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in rows))
    with open(os.path.join(folder, 'meta.json'), 'w', encoding='utf-8') as f:
        json.dump({k: ex[k] for k in ('since', 'until', 'source_commit', 'alembic_version', 'dump_sha256')}, f)
    put('current.jsonl', [dict(kind=k, **v) for k, v in ex['current'].items() if v['count']])
    put('removed.jsonl', [{'kind': k, 'entity_id': e} for k, v in ex['removed'].items() for e in v])
    put('terms.jsonl', [{'key': 'actor', 'value': n} for n in ex['officer_terms']['names']] + [{'key': 'reason', 'value': r} for r in ex['officer_terms']['reasons']])
    revs = {d['name'] for d in spec['slices'] if d['mode'] == 'revision'}
    put('rows/home_revision.jsonl', [r for k in sorted(revs) for r in ex['rows'][k]])
    for d in spec['slices']:
        if d['name'] not in revs:
            put('rows/%s.jsonl' % d['name'], ex['rows'][d['name']])


class FakeEditions(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        p = lambda **kw: dict({'name': '사업', 'block': 'A1', 'actor': '홍길동', 'unused': 1}, **kw)
        self.base = os.path.join(self.tmp, 'base')
        write_edition(self.base, '2026-10-21T21:23:10.582610+00:00', {
            'project': [rev('PRO_1', 1, '2026-10-20 01:00:00+00', p()), rev('PRO_2', 3, '2026-10-20 02:00:00+00', p()),
                        rev('PRO_3', 1, '2026-10-20 03:00:00+00', p())],
            'stage_evidence': [rev('STA_1', 1, '2026-10-20 01:00:00+00', {'project_id': 'PRO_1', 'stage': 'APPROVAL', 'selected': {'basis': '담당자 확인 · 홍길동 · 근거'}}, 'stage_evidence')],
            'home_mapping': [{'id': 'M1', 'project_id': 'PRO_1', 'policy_id': 'POL', 'program_id': 'PRG', 'status': 'REVIEW', 'basis': 'b', 'evidence_url': 'u', 'reviewed_at': None, 'revision_no': 1}],
            'home_batch': [{'id': 'B1', 'source_id': 's', 'status': 'RUNNING', 'started_at': '2026-10-21 10:00:00+00', 'finished_at': None}],
        })
        self.new = os.path.join(self.tmp, 'new')
        write_edition(self.new, '2026-10-22T13:35:44.723200+00:00', {
            'project': [rev('PRO_1', 2, '2026-10-22 01:00:00+00', p(name='사업2')), rev('PRO_2', 3, '2026-10-20 02:00:00+00', p()),
                        rev('PRO_4', 1, '2026-10-22 02:00:00+00', p())],   # PRO_3 은 없어졌다
            'stage_evidence': [rev('STA_1', 1, '2026-10-20 01:00:00+00', {'project_id': 'PRO_1', 'stage': 'APPROVAL', 'selected': {'basis': '담당자 확인 · 홍길동 · 근거'}}, 'stage_evidence')],
            'home_mapping': [{'id': 'M1', 'project_id': 'PRO_1', 'policy_id': 'POL', 'program_id': 'PRG', 'status': 'CONFIRMED', 'basis': 'b', 'evidence_url': 'u', 'reviewed_at': None, 'revision_no': 2}],
            'home_batch': [{'id': 'B1', 'source_id': 's', 'status': 'SUCCESS', 'started_at': '2026-10-21 10:00:00+00', 'finished_at': '2026-10-22 01:00:00+00'},
                           {'id': 'B2', 'source_id': 's', 'status': 'SUCCESS', 'started_at': '2026-10-22 02:00:00+00', 'finished_at': '2026-10-22 03:00:00+00'}],
        })

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def path(self, *a):
        return os.path.join(self.tmp, *a)

    def make(self, out, base=True, since='2026-10-22 00:00:00+09'):
        ex = hs.export_from_editions(SPEC, self.new, base_dir=self.base if base else None, since=since if base else None)
        return hs.seal(SPEC, ex, self.path(out))

    def cut_new(self):
        self.make('full', base=False)
        hs.apply(SPEC, self.path('full'), self.path('cut'))
        return read_edition(self.path('cut'))

    def test_roundtrip_and_determinism(self):
        man = self.make('pkg')
        self.assertEqual(man['since'], '2026-10-21 15:00:00+00')
        self.assertEqual(man['removed'], {'project': ['PRO_3']})
        rows = rj(self.path('pkg', 'slices', 'project.json'))
        self.assertEqual([r['entity_id'] for r in rows], ['PRO_1', 'PRO_4'])                 # since 뒤 기록만
        self.assertEqual(sorted(rows[0]['payload']), ['block', 'name'])                        # 정의 칸만(actor·unused 빠짐)
        self.assertEqual(len(rj(self.path('pkg', 'slices', 'stage_evidence.json'))), 1)   # resend: all
        hs.apply(SPEC, self.path('pkg'), self.path('out'), base_dir=self.base)
        got, want = read_edition(self.path('out')), self.cut_new()
        got.pop('slice-origin.json'), want.pop('slice-origin.json')
        self.assertEqual(got, want)
        self.make('pkg2')
        self.assertEqual(read_edition(self.path('pkg', 'slices')), read_edition(self.path('pkg2', 'slices')))
        self.assertEqual(rb(self.path('pkg', 'manifest.json')), rb(self.path('pkg2', 'manifest.json')))

    def test_seal_from_sql_export_layout(self):
        ex = hs.export_from_editions(SPEC, self.new, base_dir=self.base, since='2026-10-22 00:00:00+09')
        hs.seal(SPEC, ex, self.path('direct'))
        write_sql_export(SPEC, ex, self.path('export'))
        hs.seal(SPEC, hs.read_export(SPEC, self.path('export')), self.path('sealed'))
        self.assertEqual(read_edition(self.path('direct', 'slices')), read_edition(self.path('sealed', 'slices')))
        self.assertEqual(rb(self.path('direct', 'manifest.json')), rb(self.path('sealed', 'manifest.json')))
        self.assertIn('ON_ERROR_STOP', hs.sql(SPEC))

    def test_officer_names_scrubbed(self):
        self.make('pkg')
        text = rb(self.path('pkg', 'slices', 'stage_evidence.json')).decode('utf-8')
        self.assertNotIn('홍길동', text)
        self.assertIn('담당자 확인 · 근거', text)

    def stops(self, pkg, base=None, msg=''):
        with self.assertRaises(hs.Stop) as c:
            hs.apply(SPEC, pkg, self.path('out-%d' % len(os.listdir(self.tmp))), base_dir=base)
        self.assertIn(msg, str(c.exception))

    def edit_manifest(self, pkg, fn):
        p = os.path.join(pkg, 'manifest.json')
        m = rj(p)
        fn(m)
        with open(p, 'w', encoding='utf-8') as f:
            json.dump(m, f)

    def test_stop_digest_mismatch(self):
        self.make('pkg')
        self.edit_manifest(self.path('pkg'), lambda m: m['current']['project'].update(count=9))
        self.stops(self.path('pkg'), self.base, 'manifest.current')

    def test_stop_since_gap(self):
        self.make('pkg')
        self.edit_manifest(self.path('pkg'), lambda m: m.update(since='2026-10-22 00:00:00+00'))   # 기준 판(21:23Z) 뒤
        self.stops(self.path('pkg'), self.base, '빈 구간')
        with self.assertRaises(hs.Stop):
            hs.export_from_editions(SPEC, self.new, base_dir=self.base, since='2026-10-22 09:00:00+09')

    def test_stop_unknown_kind(self):
        self.make('pkg')
        self.edit_manifest(self.path('pkg'), lambda m: m['current'].update(foo={'count': 0, 'digest': '0' * 64}))
        self.stops(self.path('pkg'), self.base, '정의에 없는 kind')

    def test_stop_unknown_slice_file(self):
        self.make('pkg')
        blob = b'[]\n'
        with open(self.path('pkg', 'slices', 'foo.json'), 'wb') as f:
            f.write(blob)
        self.edit_manifest(self.path('pkg'), lambda m: m['files'].update({'slices/foo.json': {'rows': 0, 'sha256': hs.sha(blob)}}))
        self.stops(self.path('pkg'), self.base, '정의에 없는 슬라이스')

    def test_stop_sha_mismatch(self):
        self.make('pkg')
        with open(self.path('pkg', 'slices', 'project.json'), 'ab') as f:
            f.write(b' ')
        self.stops(self.path('pkg'), self.base, 'sha256')

    def test_stop_undefined_field(self):
        self.make('pkg')
        p = self.path('pkg', 'slices', 'project.json')
        rows = rj(p)
        rows[0]['payload']['actor'] = '누구'
        blob = (hs.dumps(rows) + '\n').encode('utf-8')
        with open(p, 'wb') as f:
            f.write(blob)
        self.edit_manifest(self.path('pkg'), lambda m: m['files']['slices/project.json'].update(sha256=hs.sha(blob)))
        self.stops(self.path('pkg'), self.base, '정의에 없는 payload 칸')

    def test_stop_delta_without_base(self):
        self.make('pkg')
        self.stops(self.path('pkg'), None, '--base')

    def test_time_text(self):
        self.assertEqual(hs.pg_text(hs.parse_ts('2026-10-22 00:00:00+09')), '2026-10-21 15:00:00+00')
        self.assertEqual(hs.pg_text(hs.parse_ts('2026-10-22T13:35:44.723200+00:00')), '2026-10-22 13:35:44.7232+00')
        self.assertTrue(hs.parse_ts('2026-10-22 13:32:48.919713+00') > hs.parse_ts('2026-10-22 22:32:48+09'))


class Template(unittest.TestCase):
    T = os.path.join(ROOT, 'schemas', 'home-slices', 'template')

    def test_template_rows_follow_spec(self):
        m = rj(os.path.join(self.T, 'manifest.json'))
        self.assertEqual({'slices/%s.json' % d['name'] for d in SPEC['slices']}, set(m['files']))
        for d in SPEC['slices']:
            rel = 'slices/%s.json' % d['name']
            blob = rb(os.path.join(self.T, rel))
            self.assertEqual(hs.sha(blob), m['files'][rel]['sha256'], rel)
            for r in json.loads(blob):
                hs.Slice(d).check_row(r, rel)

    def test_manifest_schema(self):
        if not shutil.which('node') or not os.path.exists(os.path.join(ROOT, 'node_modules', 'ajv')):
            self.skipTest('node·ajv 없음')
        js = ("const Ajv=require('ajv/dist/2020'),fs=require('fs');const a=new Ajv({allErrors:true});"
              "const v=a.compile(JSON.parse(fs.readFileSync(process.argv[1],'utf8')));const ok=v(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));"
              "if(!ok){console.error(JSON.stringify(v.errors));process.exit(1)}")
        r = subprocess.run(['node', '-e', js, os.path.join(ROOT, 'schemas', 'home-slices', 'manifest.schema.json'), os.path.join(self.T, 'manifest.json')],
                           cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)


class GoldenList(unittest.TestCase):
    """slices.json golden·web = tools/ledger/home-parity 스크립트가 읽는 입력(코드에서 뽑은 이름과 대조)."""
    HP = os.path.join(ROOT, 'tools', 'ledger', 'home-parity')

    def test_matches_home_parity(self):
        if not os.path.isdir(self.HP):
            self.skipTest('home-parity 없음')
        import re
        src = {f: rb(os.path.join(self.HP, f)).decode('utf-8') for f in os.listdir(self.HP) if f.endswith('.js')}
        want = set()
        s1, s2, s3, mg = src['s1-policy.js'], src['s2-projects.js'], src['s3-sources.js'], src['map-golden.js']
        want |= set(re.findall(r"read\('(S1-[\w-]+\.json)'\)", s1)) | {'S1-view-policy.json', 'S1-view-program-{program_id}.json'}
        regions = re.findall(r"for \(const r of \[([^\]]+)\]\)", s1)[-1]
        want |= {'S1-view-region-%s.json' % r for r in re.findall(r"'([^']+)'", regions)}
        want |= {'S2-raw-%s.json' % n for n in re.findall(r"raw\('([\w-]+)'\)", s2)}
        want |= {'S2-raw-%s-%s.json' % (k, slug) for k in re.findall(r"raw\(`([\w-]+)-\$\{slug\}`\)", s2) for slug in ('seoul', 'incheon', 'gyeonggi')}
        want |= {'S3-%s.json' % n for n in re.findall(r"'([\w-]+)'", re.search(r"S3_FILES = \[([^\]]+)\]", s3).group(1))}
        want |= set(re.findall(r"path\.join\(dir, '(S3-year-coverage\.json)'\)", s3))
        want |= {'S2-raw-%s.json' % n for n in re.findall(r"read\('S2-raw-([\w-]+)\.json'\)", mg)} | {'deliv-{until_date}.json'}
        self.assertEqual(sorted(e['save'] for e in SPEC['golden']), sorted(want))
        js = set(re.findall(r"\['(js_[\w-]+\.js)', '", s1))   # vm 으로 돌리는 [[파일, 이름], …]
        js |= set(re.findall(r"'(js_[\w-]+\.js)'", s3))
        self.assertEqual(sorted(e['save'] for e in SPEC['web']), sorted(js))


def _available(ed):
    d = os.path.join(HOME, ed)
    if not os.path.exists(os.path.join(d, 'manifest.json')):
        return False
    return all(os.path.exists(os.path.join(d, f)) for f in rj(os.path.join(d, 'manifest.json'))['files'])


@unittest.skipUnless(_available('20261021T212310Z') and _available('20261022T133544Z'), 'HOME 10-22 원본 판(jsonl.gz, git 무시) 없음')
class RealRoundTrip(unittest.TestCase):
    """10-22 06:23 판 + 06:23→22:35 변경분 패키지 = 22:35 판을 슬라이스로 자른 것(바이트까지)."""

    def test_delta_equals_cut(self):
        tmp = tempfile.mkdtemp()
        try:
            new, base = os.path.join(HOME, '20261022T133544Z'), os.path.join(HOME, '20261021T212310Z')
            hs.seal(SPEC, hs.export_from_editions(SPEC, new), os.path.join(tmp, 'full'))
            hs.apply(SPEC, os.path.join(tmp, 'full'), os.path.join(tmp, 'cut'))
            hs.seal(SPEC, hs.export_from_editions(SPEC, new, base_dir=base, since='2026-10-22 00:00:00+09'), os.path.join(tmp, 'delta'))
            hs.apply(SPEC, os.path.join(tmp, 'delta'), os.path.join(tmp, 'out'), base_dir=base)
            a, b = read_edition(os.path.join(tmp, 'cut')), read_edition(os.path.join(tmp, 'out'))
            a.pop('slice-origin.json'), b.pop('slice-origin.json')
            self.assertEqual(a, b)
            for d in SPEC['slices']:
                rows = rj(os.path.join(HOME, '20261022T133544Z', 'manifest.json'))['files'].get(d['name'] + '.jsonl.gz', {}).get('rows', 0)
                self.assertEqual(d['rows_20261022T133544Z'], rows, d['name'])
        finally:
            shutil.rmtree(tmp)


if __name__ == '__main__':
    unittest.main()
