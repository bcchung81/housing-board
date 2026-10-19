"""tools/research/chain rules.py(프로그램 조건 규칙, basis RULE) 시험 — 고정 입력, 네트워크 없이.

- 조건 충족 → MATCH, 위배 → MISMATCH(위배 조건과 원천 값이 notes 에), 속성 원천 없음 → UNVERIFIED.
- 원문 문자열 게이트: quote 가 그 쪽 원문에 없거나 값이 quote 에 없으면 거부한다.
- 원문에 없는 프로그램(NOT_IN_SOURCE)·조건 미상 프로그램은 행을 만들지 않는다.
- 코드에 정책 고유 문자열(정책 id·slug·프로그램 이름·quote·원문 경로)이 없다.
- 같은 입력이면 출력이 바이트까지 같다.
"""
import json
import os
import re
import sys
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
CHAIN = os.path.join(ROOT, 'tools', 'research', 'chain')
sys.path.insert(0, CHAIN)

import rules  # noqa: E402
from common import write_jsonl  # noqa: E402

DOC = 'x/정책안건.pdf'
PAGES = {DOC: [('', ''), (rules.squash('□ 수도권 공공택지에서 ’25년 4분기 0.5만호, ’26년 2.7만호 분양 예정'),
                         rules.squash('◈ 서울 도심 내 국·공유지, 유휴부지에 주택을 복합 개발하여 ’30년까지 서울 4천호 착공'))]}
Q1 = '수도권 공공택지에서 ’25년 4분기 0.5만호, ’26년 2.7만호 분양 예정'
Q2 = '서울 도심 내 국·공유지, 유휴부지에 주택을 복합 개발하여 ’30년까지 서울 4천호 착공'


def cfg():
    return {
        'sources': {'unknown_markers': ['확인 필요']},
        'vocab': {'region': {'수도권': ['11', '28', '41'], '서울': ['11']},
                  'developer': {'공공': ['lh']},
                  'zone_kinds': [['공공주택지구', '공공택지']], 'zone_name_lead': ['서울']},
        'unsourced_attributes': {'former_use': {'label': '부지 기존 용도', 'reason': '원천 없음(시험)'}},
        'policies': {'P1': {'doc_path': DOC, 'programs': {
            '분양형': {'status': 'RULE', 'source_program': '원문 분양 과제', 'rule_sets': [{'label': 'A', 'conditions': [
                {'attribute': 'region', 'op': 'region_in', 'value_text': ['수도권'], 'page': 2, 'quote': Q1},
                {'attribute': 'land_zone', 'op': 'zone_kind_in', 'value_text': ['공공택지'], 'page': 2, 'quote': Q1},
                {'attribute': 'supply_date', 'op': 'within', 'value_text': ['’25년 4분기', '’26년'], 'page': 2, 'quote': Q1},
                {'attribute': 'tenure', 'op': 'contains_any', 'value_text': ['분양'], 'page': 2, 'quote': Q1}]}]},
            '유휴형': {'status': 'RULE', 'source_program': '원문 유휴부지 과제', 'rule_sets': [{'label': 'B', 'conditions': [
                {'attribute': 'former_use', 'op': 'unsourced', 'value_text': ['국·공유지, 유휴부지'], 'page': 2, 'quote': Q2},
                {'attribute': 'region', 'op': 'region_in', 'value_text': ['서울'], 'page': 2, 'quote': Q2},
                {'attribute': 'start_date', 'op': 'by', 'value_text': ['’30년까지'], 'page': 2, 'quote': Q2}]}]},
            '미상형': {'status': 'UNKNOWN', 'reason': '원문에 조건 없음'}}}}}


def ev(prj, etype, dtype, **kw):
    return dict(local_project_id=prj, event_type=etype, date_type=dtype, event_date=kw.get('d'), event_month=kw.get('m'),
                event_year=kw.get('y'), source_ref='t')


def facts(c=None):
    """Facts 를 파일 없이 고정 값으로 만든다."""
    c = c or cfg()
    f = rules.Facts.__new__(rules.Facts)
    f.vocab, f.unsourced, f.unknown = c['vocab'], c['unsourced_attributes'], c['sources']['unknown_markers']
    f.ledger_dir, f.home_file, f.zone_file, f.zone_label = 'L', 'H', 'Z', 'Z'
    f.projects = {
        'PRJ-A': {'sgg_code': '41111', 'agency_id': 'lh', 'project_name': '가나지구 A1'},   # 모두 충족
        'PRJ-B': {'sgg_code': '41111', 'agency_id': 'lh', 'project_name': '가나지구 A2'},   # 분양 시기 위배
        'PRJ-C': {'sgg_code': '11110', 'agency_id': None, 'project_name': '어느 유휴부지'},  # 원천 없음
        'PRJ-D': {'sgg_code': '26110', 'agency_id': None, 'project_name': '먼 유휴부지'},    # 지역 위배
    }
    rows = [ev('PRJ-A', 'SUPPLY_NOTICE', 'ACTUAL', d='2026-05-29'), ev('PRJ-A', 'SUPPLY_NOTICE', 'PLANNED', m='2026-05'),
            ev('PRJ-B', 'SUPPLY_NOTICE', 'PLANNED', m='2027-03'), ev('PRJ-C', 'CONSTRUCTION_START', 'PLANNED', y='2029'),
            ev('PRJ-D', 'CONSTRUCTION_START', 'PLANNED', y='2029')]
    f.events = defaultdict(list)
    for i, r in enumerate(rows):
        f.events[r['local_project_id']].append((i, r))
    f.units = defaultdict(list, {'PRJ-A': [{'housing_type': '공공분양'}], 'PRJ-B': [{'housing_type': '공공분양'}]})
    f.programs = {'PRG_1': '분양형', 'PRG_2': '유휴형', 'PRG_3': '미상형', 'PRG_4': '없는과제'}
    f.links = [{'link_type': 'POLICY_PROGRAM', 'from_local_id': 'P1', 'to_local_id': 'PRG_2'},
               {'link_type': 'PROGRAM_PROJECT', 'from_local_id': 'PRG_2', 'to_local_id': 'PRJ-D', 'evidence': 'PRO_d 메모'}]
    f.home = {'PRO_a': {'source_id': 's', 'payload': {'district': '가나', 'name': '가나 A1'}},
              'PRO_b': {'source_id': 's', 'payload': {'district': '가나', 'developer': '시행기관 확인 필요'}},
              'PRO_c': {'source_id': 's', 'payload': {}}, 'PRO_d': {'source_id': 's', 'payload': {}}}
    f.zones = ['가나 공공주택지구', '서울 가나다 공공주택지구']
    f.name_rules = {'old_markers': ['舊'], 'tails': ['인근', '일대'], 'min_len': 3}
    f.lex, f.refs, f.gosi = {}, [], defaultdict(list)
    f.dev_labels, f.dev_names, f.dev_window = ['공공주택사업자'], ['한국토지주택공사'], 150
    return f


def work(tmp_path):
    """엔진 중간 출력(evidence.jsonl) 고정본."""
    d = tmp_path / 'P1'
    d.mkdir(parents=True, exist_ok=True)
    rows = [('PROGRAM_PROJECT|PRG_1|PRJ-A', 'PRO_a', 'UNVERIFIED'), ('PROGRAM_PROJECT|PRG_1|PRJ-B', 'PRO_b', 'UNVERIFIED'),
            ('PROGRAM_PROJECT|PRG_2|PRJ-C', 'PRO_c', 'UNVERIFIED'), ('PROGRAM_PROJECT|PRG_3|PRJ-A', 'PRO_a', 'UNVERIFIED'),
            ('PROGRAM_PROJECT|PRG_4|PRJ-A', 'PRO_a', 'NOT_IN_SOURCE')]
    with open(d / 'evidence.jsonl', 'w', encoding='utf-8') as f:
        for sid, ref, v in rows:
            f.write(json.dumps({'subject_table': 'links', 'subject_id': sid, 'external_ref': ref, 'verdict': v,
                                'external_value': None}, ensure_ascii=False) + '\n')
        f.write(json.dumps({'subject_table': 'projects', 'subject_id': 'PRJ-A', 'verdict': 'MATCH'}) + '\n')
    return str(tmp_path)


def run(tmp_path):
    return rules.run_policy({'policy_id': 'P1'}, cfg(), facts(), '2000-01-01', work(tmp_path))


def by_subject(rows):
    return {r['subject_id']: r for r in rows}


def test_gate_accepts_fixture():
    assert rules.gate(cfg(), lambda d: PAGES[d]) == []


def test_gate_rejects_value_not_in_quote():
    c = cfg()
    c['policies']['P1']['programs']['분양형']['rule_sets'][0]['conditions'][0]['value_text'] = ['서울']
    errs = rules.gate(c, lambda d: PAGES[d])
    assert any("'서울' 이 quote 에 없음" in e for e in errs)


def test_gate_rejects_quote_not_on_page():
    c = cfg()
    cond = c['policies']['P1']['programs']['분양형']['rule_sets'][0]['conditions'][1]
    cond['quote'] = '비수도권 공공택지에서 분양'
    cond['value_text'] = ['공공택지']
    errs = rules.gate(c, lambda d: PAGES[d])
    assert any('quote 가 원문 2쪽에 없음' in e for e in errs)
    cond['quote'], cond['page'] = Q1, 1  # 다른 쪽
    assert any('quote 가 원문 1쪽에 없음' in e for e in rules.gate(c, lambda d: PAGES[d]))


def test_gate_rejects_bad_config():
    c = cfg()
    conds = c['policies']['P1']['programs']['분양형']['rule_sets'][0]['conditions']
    conds[0]['op'] = 'within'                       # 지역에 기간 연산
    conds[2]['value_text'] = ['분양']                # 기간 표기 아님
    c['policies']['P1']['programs']['미상형'] = {'status': 'UNKNOWN'}  # 사유 없음
    errs = rules.gate(c, lambda d: PAGES[d])
    assert any('쓸 수 없는 연산' in e for e in errs)
    assert any('기간 표기를 못 읽음' in e for e in errs)
    assert any('reason' in e for e in errs)


def test_period():
    assert rules.period('’25년 4분기') == ('2025-10-01', '2025-12-31')
    assert rules.period('‘30년') == ('2030-01-01', '2030-12-31')
    assert rules.period('(’25.下,3만호)') == ('2025-07-01', '2025-12-31')
    assert rules.bounds('within', ['’25년 4분기', '’26년']) == ('2025-10-01', '2026-12-31')
    assert rules.bounds('by', ['’30년까지'])[1] == '2030-12-31'
    assert rules.period('분양') is None


def test_match(tmp_path):
    rows, _ = run(tmp_path)
    r = by_subject(rows)['PROGRAM_PROJECT|PRG_1|PRJ-A']
    assert (r['verdict'], r['basis'], r['checked_by'], r['stage_code']) == ('MATCH', 'RULE', 'TOOL', '01')
    assert r['doc_path'] == DOC and r['locator'] == 'p.2 (프로그램 조건)' and r['original_value'] == Q1
    assert r['dataset_value'] == '원문 분양 과제' and r['checked_at'] == '2000-01-01'
    assert "'가나 공공주택지구 [종류 공공택지]'" in r['notes'] and 'ACTUAL=2026-05-29' in r['notes']


def test_mismatch_names_condition_and_value(tmp_path):
    rows, _ = run(tmp_path)
    r = by_subject(rows)['PROGRAM_PROJECT|PRG_1|PRJ-B']
    assert r['verdict'] == 'MISMATCH'
    assert re.search(r"모집공고·분양 시기.*— 위배: '2027-03-01~2027-03-31' ← L/events.json", r['notes'])
    # 엔진 출력에 없고 원장 links.json 에만 있는 연결(PRJ-D)도 모집단에 들어오고, 지역 위배
    d = by_subject(rows)['PROGRAM_PROJECT|PRG_2|PRJ-D']
    assert d['verdict'] == 'MISMATCH' and "'26110'" in d['notes'] and d['external_ref'] == 'PRO_d'


def test_unverified_when_no_source(tmp_path):
    rows, _ = run(tmp_path)
    r = by_subject(rows)['PROGRAM_PROJECT|PRG_2|PRJ-C']
    assert r['verdict'] == 'UNVERIFIED' and r['basis'] == 'RULE'
    assert '부지 기존 용도(원천 없음)' in r['notes'] and '원천 없음(시험)' in r['notes']
    assert '— 충족' in r['notes']  # 지역·착공은 충족이지만 원천 없는 조건이 남아 MATCH 가 아니다


def test_not_in_source_and_unknown_get_no_rows(tmp_path):
    rows, summ = run(tmp_path)
    subs = by_subject(rows)
    assert 'PROGRAM_PROJECT|PRG_4|PRJ-A' not in subs and 'PROGRAM_PROJECT|PRG_3|PRJ-A' not in subs
    st = {s['subject_id']: s['status'] for s in summ}
    assert st['PROGRAM_PROJECT|PRG_4|PRJ-A'] == 'NOT_IN_SOURCE' and st['PROGRAM_PROJECT|PRG_3|PRJ-A'] == 'UNKNOWN'
    assert len(summ) == 6 and len(rows) == 4


def test_zone_match_rules():
    f = facts()
    f.zones = ['가나 공공주택지구', '가나2 공공주택지구', '서울 다라1 공공주택지구', '서울 다라2 택지', '마바 도시개발구역']
    names = lambda v: [z for z, _ in v[0]]
    f.home['PRO_x'] = {'payload': {'district': '가나'}}
    assert names(f.land_zone(None, 'PRO_x')) == ['가나 공공주택지구']            # 같은 지구가 있으면 숫자 붙은 지구는 뺀다
    f.projects['PRJ-X'] = {'project_name': '다라'}
    assert names(f.land_zone('PRJ-X', 'PRO_none')) == ['서울 다라1 공공주택지구', '서울 다라2 택지']  # 앞 시도 줄임말을 뗀다
    c = {'attribute': 'land_zone', 'op': 'zone_kind_in', 'value_text': ['공공택지']}
    assert rules.check(c, f, 'PRJ-X', 'PRO_none')[0] == rules.UNK              # 종류 미정 지구가 섞이면 검사 못함
    f.projects['PRJ-Y'] = {'project_name': '마바'}
    assert rules.check(c, f, 'PRJ-Y', 'PRO_none')[0] == rules.UNK


def test_rerun_is_byte_identical(tmp_path):
    out = []
    for i in range(2):
        rows, _ = rules.run_policy({'policy_id': 'P1'}, cfg(), facts(), '2000-01-01', work(tmp_path / 'w'))
        path = str(tmp_path / ('out%d.jsonl' % i))
        write_jsonl(path, rows)
        with open(path, 'rb') as f:
            out.append(f.read())
    assert out[0] == out[1] and out[0]


def test_no_policy_specific_strings_in_code():
    with open(os.path.join(CHAIN, 'rules.py'), encoding='utf-8') as f:
        code = f.read()
    with open(os.path.join(CHAIN, 'config', 'program_rules.json'), encoding='utf-8') as f:
        real = json.load(f)
    with open(os.path.join(CHAIN, 'config', 'policies.json'), encoding='utf-8') as f:
        pols = json.load(f)['policies']
    bad = []
    for pol in pols:
        bad += [pol['policy_id'], pol['slug'], pol['announced'], pol['canonical_url'], pol['docs_dir'], pol['name']]
    for pid, pc in real['policies'].items():
        bad.append(pc['doc_path'])
        for name, prog in pc['programs'].items():
            bad += [name, prog.get('source_program') or '']
            conds = [c for s in prog.get('rule_sets', []) for c in s['conditions']] + pc.get('common_conditions', [])
            for c in conds:
                bad.append(c['quote'])
                bad += [v for v in c['value_text'] if len(v) > 2]
    hits = sorted({b for b in bad if b and b in code})
    assert hits == []
    assert not re.search(r'POL_\d|PRG_[0-9a-f]|PRJ-\d|20\d\d-\d\d-\d\d', code)


def test_site_record_reference_and_gosi():
    f = facts()
    f.vocab['zone_kinds'] = [['도심공공주택복합사업', '도심 복합사업'], ['도심공공주택복합지구', '도심 복합사업']]
    f.lex = {'강북': {('sgg', '11305')}, '대구': {('sido', '27')}, '용산구': {('sgg', '11170')}}
    ref = {'path': 'R', 'kind': '도심 복합사업', 'label': '후보지 발표'}
    rows = [{'site_name': '舊 수유12구역', 'sigungu': '강북'}, {'site_name': '효창공원앞역 인근', 'sigungu': None},
            {'site_name': '캠프조지 인근', 'sigungu': '대구 남구'}]
    for i, r in enumerate(rows, 1):
        keys, regs = f.name_keys(r['site_name'])
        f.refs.append((ref, i, r, keys, regs + f.region_words(r['sigungu'])))
    f.projects.update({'PRJ-S': {'sgg_code': '11305', 'project_name': '수유12구역'},
                       'PRJ-H': {'sgg_code': '11170', 'project_name': '효창공원앞역 북측'},
                       'PRJ-K': {'sgg_code': '11305', 'project_name': '캠프조지'}})
    c = {'attribute': 'site_record', 'op': 'record_kind_any', 'value_text': ['도심 복합사업']}
    st, note = rules.check(c, f, 'PRJ-S', 'PRO_none')
    assert st == rules.SAT and "R 행 1 '舊 수유12구역'" in note and '지역 일치' in note   # 옛 표기 舊 를 뗀다
    assert rules.check(c, f, 'PRJ-H', 'PRO_none')[0] == rules.UNK   # '북측' 은 다른 사업(인근 꼬리만 뗀다)
    assert rules.check(c, f, 'PRJ-K', 'PRO_none')[0] == rules.UNK   # 지역(대구) 이 사업 시군구와 다르다
    # 고시: 제목과 고시문 '사업의 종류', 사업자 표기
    rules._DOC['g.pdf'] = rules.squash('1. 사업의 종류 : 도심 공공주택 복합사업 4. 공공주택사업자의 명칭 한국토지주택공사 대표자 홍길동')
    f.gosi['PRJ-K'] = [('G', 3, {'dataset_value': '고시 「다라 도심 공공주택 복합지구의 지정」', 'doc_path': 'g.pdf'})]
    st, note = rules.check(c, f, 'PRJ-K', 'PRO_none')
    assert st == rules.SAT and "고시문 '사업의 종류'" in note and 'G 행 3 고시 제목' in note
    d = {'attribute': 'developer', 'op': 'developer_in', 'value_text': ['공공']}
    f.vocab['developer']['공공'] = ['한국토지주택공사']
    st, note = rules.check(d, f, 'PRJ-K', 'PRO_none')
    assert st == rules.SAT and "'한국토지주택공사' ← g.pdf 고시문 '공공주택사업자' 뒤 표기" in note and '홍길동' not in note


def test_general_developer_phrase_only_for_listed_and_after_gosi():
    f = facts()
    f.vocab['developer']['공공'] = ['LH', '한국토지주택공사']
    g = {'doc_path': 'a.pdf', 'page': 3, 'quote': '(시행자)LH 등', 'value_text': ['LH']}
    ref = {'path': 'R', 'kind': '도심 복합사업', 'label': '후보지 발표', 'developer_text': g}
    r = {'site_name': '가나역 인근'}
    keys, regs = f.name_keys(r['site_name'])
    f.refs.append((ref, 1, r, keys, regs))
    f.projects.update({'PRJ-L': {'sgg_code': '11110', 'project_name': '가나역'},
                       'PRJ-N': {'sgg_code': '11110', 'project_name': '다라역'}})
    d = {'attribute': 'developer', 'op': 'developer_in', 'value_text': ['공공']}
    st, note = rules.check(d, f, 'PRJ-L', 'PRO_none')
    assert st == rules.SAT and rules.GENERAL_DEV in note and 'a.pdf 3쪽 “(시행자)LH 등”' in note
    assert rules.check(d, f, 'PRJ-N', 'PRO_none')[0] == rules.UNK      # 목록에 없는 사업에는 쓰지 않는다
    rules._DOC['g2.pdf'] = rules.squash('공공주택사업자의 명칭 한국토지주택공사')
    f.gosi['PRJ-L'] = [('G', 1, {'dataset_value': '', 'doc_path': 'g2.pdf'})]
    st, note = rules.check(d, f, 'PRJ-L', 'PRO_none')
    assert st == rules.SAT and rules.GENERAL_DEV not in note            # 고시문 사업자 표기가 있으면 그것을 쓴다
    c = cfg()
    c['sources']['reference_lists'] = [dict(ref, developer_text=dict(g, quote='(시행자)SH 등'))]
    assert any('developer_text' in e for e in rules.gate(c, lambda dp: PAGES.get(dp) or [('', '')] * 3))
