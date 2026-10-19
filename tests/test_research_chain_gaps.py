"""tools/research/chain/gaps.py(M4 누락 검증 02·03) 시험 — 네트워크 없이, 고정 입력.

- 지명 → 레지스트리 판정: 이미 있음 · 누락 확정(LINK_MISSING / PROJECT_MISSING) · 판단 보류 · 범위 밖.
- gaps.jsonl 을 다시 쓸 때 01 행(다른 단계 행)은 글자 그대로, 자리도 그대로.
- 프로그램 조건: 원문 한 문장에서 지역·단계·기간이 모두 나와야 조건 확정, 아니면 조건 미상·원천 범위 밖.
- Exa 캐시: 캐시가 있으면 읽고, 없으면 --exa 없이 부르지 않는다.
- 코드·설정에 정책 고유 문자열이 없다. 같은 입력이면 출력이 바이트까지 같다.
"""
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
CHAIN = os.path.join(ROOT, 'tools', 'research', 'chain')
sys.path.insert(0, CHAIN)

import gaps  # noqa: E402
from common import load_config  # noqa: E402

G = load_config('gap_rules.json')
SUFFIXES = load_config('stage_sources.json')['independent']['keys']['district_suffixes']


def registry(ents):
    """파일을 읽지 않는 시험용 레지스트리."""
    reg = object.__new__(gaps.Registry)
    reg.G, reg.suffixes, reg.keys_ready = G, SUFFIXES, False
    reg.ents, reg.hub_pk, reg.locs = {}, {}, {}
    for rid, names, pairs, sido, units in ents:
        e = reg.ent(rid)
        e['names'], e['pairs'], e['sido'], e['units'] = list(names), list(pairs), sido, list(units)
    return reg


REG = [
    ('PRJ-00001-0001', ['가나다 A-1BL 아파트 건설공사'], [('가나다', 'A1')], '41', [300]),
    ('PRJ-00001-0002', ['라마바 청사'], [], '11', [120]),
    ('PRJ-00001-0003', ['사아자 B1'], [], '41', [200]),
    ('PRJ-00001-0004', ['사아자 B2'], [], '41', [250]),
]
CHAIN_SET = {'PRJ-00001-0001'}


def site(name, kind='SITE', district=None, block=None, units=None, sido='', quote=''):
    return dict(name=name, kind=kind, district=district, block=block, units=units, sido=sido, quote=quote)


def judge(s, other_chains=None, labels=None):
    return gaps.judge_site(G, registry(REG), s, CHAIN_SET, other_chains or {}, labels or {})


def test_site_already_present_by_block_key():
    gt, v, why, ids = judge(site('가나다 공공주택지구 A-1', district='가나다 공공주택지구', block='A-1'))
    assert (gt, v, ids) == ('LINK_MISSING', 'ALREADY_PRESENT', ['PRJ-00001-0001'])


def test_site_link_missing_when_registry_has_it_but_chain_does_not():
    gt, v, why, ids = judge(site('라마바 청사', units=120))
    assert (gt, v, ids) == ('LINK_MISSING', 'MISSING', ['PRJ-00001-0002'])
    assert '연결 안 됨' in why


def test_site_project_missing_when_registry_has_nothing():
    gt, v, why, ids = judge(site('차카타 부지'))
    assert (gt, v, ids) == ('PROJECT_MISSING', 'MISSING', [])


def test_site_pending_with_two_candidates():
    gt, v, why, ids = judge(site('사아자'))
    assert (gt, v) == ('LINK_MISSING', 'PENDING')
    assert ids == ['PRJ-00001-0003', 'PRJ-00001-0004'] and why


def test_site_units_pick_one_of_two():
    gt, v, why, ids = judge(site('사아자', units=250))
    assert (v, ids) == ('MISSING', ['PRJ-00001-0004'])


def test_site_out_of_scope_aggregate_and_other_policy():
    assert judge(site('묶음 지명', kind='AGGREGATE'))[1] == 'OUT_OF_SCOPE'
    gt, v, why, ids = judge(site('라마바 청사', quote='(5·5 대책) 라마바 청사'),
                            other_chains={'POL_X': {'PRJ-00001-0002'}}, labels={'POL_X': ['5·5', '5.5']})
    assert (v, ids) == ('OUT_OF_SCOPE', ['PRJ-00001-0002'])


def test_every_verdict_has_reason():
    for s in (site('가나다 공공주택지구 A-1', district='가나다 공공주택지구', block='A-1'), site('라마바 청사'),
              site('차카타'), site('사아자'), site('x', kind='NOT_SITE')):
        gt, v, why, _ = judge(s)
        assert v in gaps.GAP_LABEL and gt in gaps.GAP_TYPES and why


# ---------------------------------------------------------------- 프로그램 조건

def prog(name, **kw):
    return dict(program_name=name, program_kind='SUPPLY', definition=kw.get('definition'),
                target_text=kw.get('target_text'), conditions=kw.get('conditions') or {})


def test_program_conditions_from_one_sentence():
    st, conds, _ = gaps.program_conditions(G, prog('공공택지 분양', definition='수도권 공공택지에서 ’25년 4분기 0.5만호, ’26년 2.7만호 분양 예정'), '2025-01-01')
    assert st == 'CONDITIONS'
    c = conds[0]
    assert c['stage'] == '분양' and c['codes'] == G['region_words']['수도권']
    assert c['period'] == ('2025-10-01', '2026-12-31') and c['land'] == ['공공택지']


def test_program_conditions_unknown_and_uncovered():
    assert gaps.program_conditions(G, prog('무엇', target_text='’30년까지 1만호 착공'), '2025-01-01')[0] == 'UNKNOWN'
    assert gaps.program_conditions(G, prog('무엇', conditions={'현행': '수도권 ’26년 1만호 착공'}), '2025-01-01')[0] == 'UNKNOWN'
    assert gaps.program_conditions(G, prog('매입임대 확대', target_text='’30년까지 수도권 1만호 착공'), '2025-01-01')[0] == 'UNCOVERED'


def test_source_row_filter():
    _, conds, _ = gaps.program_conditions(G, prog('공공택지 분양', definition='수도권 공공택지에서 ’26년 1만호 분양 예정'), '2025-01-01')
    row = dict(stages=['분양', '공급'], sido='41', dates=['2026-04'], type='분양', block='A1', text='가나다 A1')
    assert gaps.row_fits(G, row, conds[0])
    assert not gaps.row_fits(G, dict(row, sido='26'), conds[0])
    assert not gaps.row_fits(G, dict(row, dates=['2027-01']), conds[0])
    assert not gaps.row_fits(G, dict(row, type='임대'), conds[0])
    assert not gaps.row_fits(G, dict(row, block=''), conds[0])


# ---------------------------------------------------------------- gaps.jsonl 쓰기

ONE = '{"policy_id":"P","stage_code":"01","gap_type":"SITE",  "verdict":"MISSING"}\n'
ONE_B = '{"policy_id": "P", "stage_code": "01", "gap_type": "TARGET", "quote": "전화 02-123-4567 \\u00b7"}\n'
OLD02 = '{"policy_id": "P", "stage_code": "02", "gap_type": "LINK_MISSING"}\n'


def rows02():
    return [gaps.gap_row('P', '02', 'PROJECT_MISSING', 'MISSING', '이유', '값', '2000-01-01', 'ORIGINAL'),
            gaps.gap_row('P', '03', 'EVIDENCE_MISSING', 'PENDING', '이유', '값', '2000-01-01', 'exa')]


def test_write_gaps_keeps_other_stage_lines(tmp_path):
    path = str(tmp_path / 'gaps.jsonl')
    open(path, 'w', encoding='utf-8').write(ONE + OLD02 + ONE_B)
    gaps.write_gaps(path, rows02(), ['02', '03'])
    lines = open(path, encoding='utf-8').read().splitlines(keepends=True)
    assert lines[0] == ONE and lines[-1] == ONE_B  # 01 행 글자·자리 그대로(공백·이스케이프·전화 형식도 손대지 않음)
    assert [json.loads(x)['stage_code'] for x in lines] == ['01', '02', '03', '01']


def test_write_gaps_appends_when_no_old_rows_and_is_idempotent(tmp_path):
    path = str(tmp_path / 'gaps.jsonl')
    open(path, 'w', encoding='utf-8').write(ONE + ONE_B)
    gaps.write_gaps(path, rows02(), ['02', '03'])
    first = open(path, 'rb').read()
    gaps.write_gaps(path, rows02(), ['02', '03'])
    assert open(path, 'rb').read() == first
    assert first.decode('utf-8').startswith(ONE + ONE_B)


# ---------------------------------------------------------------- Exa 캐시

def test_exa_cache_reuse_without_network(tmp_path):
    g = json.loads(json.dumps(G))
    g['exa']['cache_dir'] = str(tmp_path)
    ex = gaps.Exa(g, allow=False)
    assert ex.call('search', ['질의'], '질의') is None  # 캐시 없고 --exa 없음 → 부르지 않음
    name = 'search_%s.json' % gaps.sha16('질의')
    (tmp_path / name).write_text(json.dumps({'results': [], 'costDollars': {'total': 0.005}}), encoding='utf-8')
    assert ex.call('search', ['질의'], '질의') == {'results': [], 'costDollars': {'total': 0.005}}
    assert ex.calls_new == 0 and ex.cost() == 0.005


# ---------------------------------------------------------------- 재실행 바이트 동일

def test_rerun_byte_identical(tmp_path):
    def run(path):
        rows = []
        for s in (site('가나다 공공주택지구 A-1', district='가나다 공공주택지구', block='A-1'), site('라마바 청사'),
                  site('차카타'), site('사아자'), site('x', kind='AGGREGATE')):
            gt, v, why, ids = judge(s)
            rows.append(gaps.gap_row('P', '02', gt, v, why, s['name'], '2000-01-01', 'ORIGINAL', matched=gaps.ref_list(G, ids)))
        open(path, 'w', encoding='utf-8').write(ONE)
        gaps.write_gaps(path, rows, ['02', '03'])
        return open(path, 'rb').read()
    assert run(str(tmp_path / 'a.jsonl')) == run(str(tmp_path / 'b.jsonl'))


# ---------------------------------------------------------------- 정책 고유 문자열 없음

def forbidden_strings():
    out = set()
    policies = load_config('policies.json')['policies']
    for p in policies:
        out |= {p['policy_id'], p['announced'], p['canonical_url'], p['name'], p['slug'], p['home_policy_id'],
                p['canonical_url'].rsplit('=', 1)[-1], p['name'].split(' (')[0]}
    work = os.path.join(ROOT, 'docs/speech/research/dataset/_work')
    for p in policies:
        path = os.path.join(work, p['policy_id'], 'policy_sites.jsonl')
        if os.path.exists(path):
            for line in open(path, encoding='utf-8'):
                row = json.loads(line)
                if row.get('site_kind', 'SITE') == 'SITE' and len(gaps.nz(row['site_name'])) >= 3:
                    out.add(row['site_name'])
    return {s for s in out if s}


def test_no_policy_specific_strings_in_code_and_rules():
    bad = forbidden_strings()
    assert len(bad) > 10
    for rel in ('gaps.py', 'config/gap_rules.json'):
        text = open(os.path.join(CHAIN, rel), encoding='utf-8').read()
        hits = sorted(s for s in bad if s in text)
        assert hits == [], '%s 에 정책 고유 문자열: %s' % (rel, hits)
