"""tools/research/chain 엔진 시험: 정책 고유 값이 코드에 없음, 판정 변환, 사업 id 합침, 지명 연결, 같은 입력 두 번 = 바이트 동일."""

import copy
import glob
import json
import os
import re
import sys
from collections import OrderedDict

import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
CHAIN = os.path.join(ROOT, 'tools', 'research', 'chain')
sys.path.insert(0, CHAIN)

import common  # noqa: E402
import evidence  # noqa: E402
import home  # noqa: E402
from engine import EXTRACT_COLS  # noqa: E402

ENGINE_FILES = [os.path.join(CHAIN, f) for f in ('common.py', 'readers.py', 'home.py', 'engine.py', 'outputs.py',
                                                 'evidence.py', 'report.py', 'run.py')] + \
    sorted(glob.glob(os.path.join(CHAIN, 'stages', '*.py')))


def test_no_policy_specific_strings_in_code():
    with open(os.path.join(CHAIN, 'config', 'policies.json'), encoding='utf-8') as f:
        pols = json.load(f)['policies']
    needles = {'0907', '9-7', 'POL_20', '95091185'}
    for x in pols:
        needles |= {x['policy_id'], x['slug'], x['announced'], x['canonical_url'], x['home_policy_id']}
        needles |= set(re.findall(r'id=(\d+)', x['canonical_url']))
        needles.add(x['slug'].replace('-', '·'))
    hits = []
    for path in ENGINE_FILES:
        text = open(path, encoding='utf-8').read()
        hits += ['%s: %s' % (os.path.relpath(path, ROOT), n) for n in sorted(needles) if n in text]
    assert hits == []


def test_verdict_and_basis_tables_cover_all_values():
    assert set(common.VERDICT_EN) == set(common.VERDICTS)
    assert common.VERDICT_EN['일치'] == 'MATCH' and common.VERDICT_EN['불일치'] == 'MISMATCH'
    assert common.VERDICT_EN['원본에서 못 찾음'] == common.VERDICT_EN['원본 칸 비어 있음'] == 'NOT_IN_SOURCE'
    assert common.VERDICT_EN['수집 범위 밖'] == 'OUT_OF_SCOPE' and common.VERDICT_EN['원본 없음'] == 'NO_ORIGINAL'
    assert common.VERDICT_EN['비교 불가'] == common.VERDICT_EN['근거없음'] == 'UNVERIFIED'
    assert common.BASIS_EN == {'존재 확인': 'EXISTENCE', '같은 원천 재확인': 'SAME_SOURCE', '독립 원천 대조': 'INDEPENDENT',
                               '규칙 파생': 'RULE', '': None}
    assert set(common.NATURES) == set(common.BASIS_EN)


class FakeRun:
    def __init__(self, out, rows=None):
        self.cfg = {'checked_at': '2026-01-01', 'home': {'subject_table': 'projects'},
                    'sources': {'x': {'doc_urls': {'raw/a.csv': 'https://example.test/a'}}}}
        self.policy = {'policy_id': 'POL_TEST', 'home_policy_id': 'HP_TEST', 'canonical_url': 'https://example.test/p'}
        self.stages = OrderedDict([('BUSINESS', {'code': '02', 'dir': '02.x'})])
        self.rows = {'BUSINESS': rows or []}
        self.out = out
        self.subject = {'PRO_a': ('PRJ-1', 'HPR'), 'PRO_b': ('PRJ-1', 'HPR'), 'PRO_c': ('HOME:PRO_c', '')}

    def subject_id(self, pid):
        return self.subject[pid][0]


def row(pid, verdict, nature, **kw):
    r = {c: '' for c in EXTRACT_COLS}
    r.update(project_id=pid, 대조=verdict, 대조_성격=nature, HOME_표='stage_evidence', HOME_상태='확정')
    r.update(kw)
    return r


def test_stage_rows_verdict_basis_checked_by(tmp_path):
    os.makedirs(tmp_path / '02.x' / '원본' / 'web')
    (tmp_path / '02.x' / '원본' / 'web' / 'manifest.json').write_text(json.dumps(
        {'files': {'k': {'filename': 'w.html', 'fetched_at': '2026-02-03T00:00:00Z'}}}), encoding='utf-8')
    web_path = '%s/02.x/원본/web/w.html' % tmp_path
    rows = [
        row('PRO_a', '일치', '같은 원천 재확인', 원본_파일='raw/a.csv', 원본_위치='CSV 행 2', 원본_값='2025-01-01', HOME_값='2025-01-01'),
        row('PRO_a', '일치', '존재 확인', 원본_파일='raw/a.csv'),
        row('PRO_b', '원본 없음', '', HOME_근거_URL='https://example.test/home'),
        row('PRO_b', '원본 칸 비어 있음', '독립 원천 대조', 원본_파일='raw/b.csv; raw/c.csv',
            원본_위치='b.csv 행 2 · c.csv 행 5 · 키: k'),
        row('PRO_c', '근거없음', '', HOME_표='', HOME_상태='근거없음'),
        row('PRO_c', '수집 범위 밖', ''),
        row('PRO_c', '비교 불가', '같은 원천 재확인'),
        dict(row('PRO_c', '불일치', '독립 원천 대조', 원본_파일=web_path), _web={'url': 'https://example.test/web'}),
    ]
    out = evidence.stage_rows(FakeRun(str(tmp_path), rows))
    got = [(e['subject_id'], e['external_ref'], e['field'], e['verdict'], e['basis'], e['checked_by']) for e in out]
    assert got == [
        ('PRJ-1', 'PRO_a', 'stage_02', 'MATCH', 'SAME_SOURCE', 'TOOL'),
        ('PRJ-1', 'PRO_a', 'stage_02', 'MATCH', 'EXISTENCE', 'TOOL'),
        ('PRJ-1', 'PRO_b', 'stage_02', 'NO_ORIGINAL', None, 'TOOL'),
        ('PRJ-1', 'PRO_b', 'stage_02', 'NOT_IN_SOURCE', 'INDEPENDENT', 'TOOL'),
        ('PRJ-1', 'PRO_b', 'stage_02', 'NOT_IN_SOURCE', 'INDEPENDENT', 'TOOL'),
        ('HOME:PRO_c', 'PRO_c', 'stage_02', 'UNVERIFIED', None, 'TOOL'),
        ('HOME:PRO_c', 'PRO_c', 'stage_02', 'OUT_OF_SCOPE', None, 'TOOL'),
        ('HOME:PRO_c', 'PRO_c', 'stage_02', 'UNVERIFIED', 'SAME_SOURCE', 'TOOL'),
        ('HOME:PRO_c', 'PRO_c', 'stage_02', 'MISMATCH', 'INDEPENDENT', 'AGENT'),
    ]
    assert out[0]['doc_url'] == 'https://example.test/a' and out[0]['doc_path'] == 'raw/a.csv'
    assert out[0]['locator'] == 'CSV 행 2' and out[0]['dataset_value'] == out[0]['original_value'] == '2025-01-01'
    assert out[0]['checked_at'] == '2026-01-01'
    assert out[2]['doc_url'] == 'https://example.test/home' and out[2]['doc_path'] is None
    # 한 대조에 원 파일 둘 → 파일마다 한 행(설계 5.2)
    assert (out[3]['doc_path'], out[4]['doc_path']) == ('raw/b.csv', 'raw/c.csv')
    assert '원본 2개 중 하나' in out[3]['notes'] and out[3]['verdict'] == out[4]['verdict']
    assert (out[3]['locator'], out[4]['locator']) == ('b.csv 행 2 · 키: k', 'c.csv 행 5 · 키: k')
    assert out[5]['doc_url'] is None and out[5]['doc_path'] is None
    assert out[8]['doc_url'] == 'https://example.test/web' and out[8]['checked_at'] == '2026-02-03'
    assert all(set(e) == set(evidence.COLS) for e in out)


def test_project_subject_ids_key_order():
    D = {'home_identity_alias': [
        {'match_rule': 'SOURCE_ANCHOR', 'project_id': 'H1', 'source_entity_id': 'P1'},
        {'match_rule': 'SOURCE_ANCHOR', 'project_id': 'H2', 'source_entity_id': 'P2'},
        {'match_rule': 'SOURCE_ANCHOR', 'project_id': 'H3', 'source_entity_id': 'P3'},
        {'match_rule': 'REGION_DISTRICT_BLOCK', 'project_id': 'H3', 'source_entity_id': 'L3'},
        {'match_rule': 'SOURCE_ANCHOR', 'project_id': 'H5', 'source_entity_id': 'P5'},
    ]}
    id_map = {'HPR:H1': 'PRJ-00001-0001', 'PRO:P1': 'PRJ-00001-0009', 'PRO:P2': 'PRJ-00001-0002',
              'LH:L3': 'PRJ-00001-0003', 'HPR:H5': 'PRJ-00001-0001'}
    got = home.project_subject_ids(D, ['P1', 'P2', 'P3', 'P4', 'P5'], id_map, ['HPR', 'PRO', 'LH'], 'HOME:')
    assert got == {'P1': ('PRJ-00001-0001', 'HPR'), 'P2': ('PRJ-00001-0002', 'PRO'), 'P3': ('PRJ-00001-0003', 'LH'),
                   'P4': ('HOME:P4', ''), 'P5': ('PRJ-00001-0001', 'HPR')}
    # 합친 뒤 사업 수: P1·P5 가 한 사업
    assert len({v[0] for v in got.values()}) == 4


def test_site_matches_and_link_rows(tmp_path):
    sites = [
        {'policy_id': 'POL_TEST', 'program_name': None, 'sido': '인천', 'district': '인천계양 지구', 'block': 'A-10',
         'site_name': '인천계양 A-10', 'units': 500, 'doc_path': 'docs/x.pdf', 'page': 3, 'quote': '인천계양 A-10 블록'},
        {'policy_id': 'POL_TEST', 'program_name': '노후청사', 'sido': None, 'district': None, 'block': None,
         'site_name': '송파 우체국', 'units': None, 'doc_path': 'docs/x.pdf', 'page': 5, 'quote': '송파우체국'},
        {'policy_id': 'POL_TEST', 'program_name': None, 'sido': '경기', 'district': '인천계양', 'block': 'A10',
         'site_name': '다른 시도', 'units': None, 'doc_path': 'docs/x.pdf', 'page': 6, 'quote': 'x'},
    ]
    pa = {'name': '인천계양 A10BL', 'district': '인천계양(공공주택)', 'block': 'A-10BL', 'region': '인천광역시', 'program': '프로그램A'}
    pb = {'name': '인천계양 A11', 'district': '인천계양', 'block': 'A11', 'region': '인천광역시', 'program': '프로그램B'}
    pc = {'name': '송파우체국', 'district': None, 'block': None, 'region': '서울특별시', 'program': '프로그램A'}
    assert [(s['site_name'], how) for s, how in home.site_matches(pa, sites)] == [('인천계양 A-10', '지구+블록')]
    assert home.site_matches(pb, sites) == []
    assert [(s['site_name'], how) for s, how in home.site_matches(pc, sites)] == [('송파 우체국', '이름')]

    R = FakeRun(str(tmp_path))
    R.D = {'home_program_mapping': [{'id': 'PRG_A', 'name': '프로그램A', 'policy_id': 'HP_TEST'},
                                    {'id': 'PRG_X', 'name': '프로그램A', 'policy_id': 'OTHER'}]}
    R.pids = ['PRO_a', 'PRO_b', 'PRO_c']
    R.projects = {'PRO_a': {'payload': pa}, 'PRO_b': {'payload': pb}, 'PRO_c': {'payload': pc}}
    R.prog_check = {'프로그램B': dict(raw='원문에 없음', page='', verdict='NOT_IN_SOURCE', locator='', quote='',
                                   doc_path='docs/p.pdf', check_file='c.csv'),
                    '프로그램A': dict(raw='일치', page='3', verdict='MATCH', locator='', quote='', doc_path='', check_file='c.csv')}
    R.sites = sites
    rows = evidence.link_rows(R)
    got = [(e['subject_id'], e['verdict'], e['basis'], e['checked_by']) for e in rows]
    assert got == [('PROGRAM_PROJECT|PRG_A|PRJ-1', 'MATCH', 'INDEPENDENT', 'TOOL'),
                   ('PROGRAM_PROJECT|프로그램B|PRJ-1', 'NOT_IN_SOURCE', 'INDEPENDENT', 'AGENT'),
                   ('PROGRAM_PROJECT|PRG_A|HOME:PRO_c', 'MATCH', 'INDEPENDENT', 'TOOL')]
    assert rows[0]['locator'] == 'p.3' and rows[0]['original_value'] == '인천계양 A-10 블록'
    # HOME 이 그 프로그램 근거로 원문과 같은 파일(정책 canonical_url)을 썼을 때만 SAME_SOURCE
    R.D['home_program_mapping'].append({'id': 'PRG_B', 'name': '프로그램B', 'policy_id': 'HP_TEST',
                                        'evidence_url': 'https://example.test/p'})
    assert [e['basis'] for e in evidence.link_rows(R) if e['verdict'] == 'NOT_IN_SOURCE'] == ['SAME_SOURCE']
    R.sites = None  # policy_sites.jsonl 없음 → 지명 연결 건너뜀
    rows = evidence.link_rows(R)
    assert [e['verdict'] for e in rows] == ['UNVERIFIED', 'NOT_IN_SOURCE', 'UNVERIFIED']
    assert 'policy_sites.jsonl 없음' in rows[0]['notes']


def test_load_policy_sites_missing_and_present(tmp_path):
    assert home.load_policy_sites(str(tmp_path / 'none.jsonl')) is None
    f = tmp_path / 'policy_sites.jsonl'
    f.write_text('{"district": "가"}\n\n{"district": "나"}\n', encoding='utf-8')
    assert [x['district'] for x in home.load_policy_sites(str(f))] == ['가', '나']


def test_program_checks_by_slug_and_policy_column(tmp_path):
    d = tmp_path / 'pol'
    d.mkdir()
    (d / '프로그램_원문대조_A-1.csv').write_text('﻿프로그램,판정,원문_PDF쪽\n갑,일치,4\n을,원문에 없음,\n', encoding='utf-8')
    (d / '프로그램_원문대조_B-2_C-3.csv').write_text(
        '﻿정책,프로그램(HOME),원문 인용,위치,판정\n"비 (2026-02-02)",병,"""병 문구""",표,원문에 있음(일치)\n'
        '"씨 (2026-03-03)",정,"x",표,원문에 없음(병기)\n', encoding='utf-8')
    cfg = {'program_checks': {'glob': str(d / '프로그램_원문대조_*.csv'), 'prefix': '프로그램_원문대조_',
                              'policy_cols': ['정책'], 'program_cols': ['프로그램', '프로그램(HOME)'], 'verdict_cols': ['판정'],
                              'page_cols': ['원문_PDF쪽'], 'locator_cols': ['위치'], 'doc_cols': ['원문_파일'],
                              'quote_cols': ['원문 인용'], 'doc_base': 'base',
                              'verdict_prefix': [['일치', 'MATCH'], ['원문에 있음', 'MATCH'], ['원문에 없음', 'NOT_IN_SOURCE']]}}
    a = home.program_checks(cfg, {'slug': 'A-1', 'announced': '2026-01-01'})
    assert {k: (v['verdict'], v['page']) for k, v in a.items()} == {'갑': ('MATCH', '4'), '을': ('NOT_IN_SOURCE', '')}
    b = home.program_checks(cfg, {'slug': 'B-2', 'announced': '2026-02-02'})
    assert list(b) == ['병'] and b['병']['quote'] == '"병 문구"'
    c = home.program_checks(cfg, {'slug': 'C-3', 'announced': '2026-03-03'})
    assert {k: v['verdict'] for k, v in c.items()} == {'정': 'NOT_IN_SOURCE'}
    assert home.program_checks(cfg, {'slug': '1', 'announced': '2026-01-01'}) == {}


def test_normalization_rules():
    assert common.norm_block('A-07BL') == 'A7' and common.norm_block('S-04') == 'S4'
    assert common.norm_district('인천계양(공공주택) (') == '인천계양'
    assert common.norm_district('인천서구(거북이기지)') == '인천서구(거북이기지)'
    assert common.name_match('인천계양 A-10블록 행복주택', '인천계양', 'A10')
    assert not common.name_match('인천서구(석남어울림) 1', '인천서구(거북이기지)', '1')
    assert common.verdict_from([('a', None, 1, '')])[0] == '비교 불가'
    assert common.verdict_from([('a', True, 1, 1), ('b', False, 1, 2)])[0] == '불일치'


HAVE_INPUTS = os.path.exists(os.path.join(ROOT, 'schemas/ledger-2026-10/raw/home/20261014T102506Z/project.jsonl.gz'))


@pytest.mark.skipif(not HAVE_INPUTS, reason='HOME 덤프·raw 원천이 저장소에 없음')
def test_same_input_twice_is_byte_identical(tmp_path):
    import run
    cfg, pols = run.load_all()
    cfg = copy.deepcopy(cfg)
    out = str(tmp_path / 'research')
    cfg['paths'] = {'research_dir': out, 'work_dir': out + '/dataset/_work', 'policy_dir': out + '/01.정책'}
    pol = min(pols, key=lambda x: x['slug'])
    homedata = home.load_home(cfg)
    snaps = []
    for _ in range(2):
        R, ev, web = run.run_policy(cfg, pol, homedata, None)
        run.assemble(cfg, [pol])
        snap = {}
        for f in sorted(glob.glob(out + '/**/*', recursive=True)):
            if os.path.isfile(f):
                snap[os.path.relpath(f, out)] = open(f, 'rb').read()
        snaps.append(snap)
    assert snaps[0].keys() == snaps[1].keys() and len(snaps[0]) > 5
    assert [k for k in snaps[0] if snaps[0][k] != snaps[1][k]] == []
    assert any(k.endswith('evidence.jsonl') for k in snaps[0])
