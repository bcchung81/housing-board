"""tools/research/chain discover.py(P0·P1)·policy.py(P2) 시험 — 네트워크 없이.

- 원문 문자열 게이트: 원문에 있는 수는 통과, 없는 수는 거부, 쪽(PDF·인쇄)이 기록된다.
- 원 게시처 정규화: 게시판 상세 주소 정규형, 전재처 종류, 첨부 이름 → 원 보도자료 제목.
- 캐시 재사용: 같은 요청은 캐시를 읽고 다시 부르지 않는다. 저장된 캐시만으로 발견을 다시 돌릴 수 있다.
- 코드에 정책 고유 문자열(정책 id·발표일·URL·이름·목표 호수·지명)이 없다.
"""
import csv
import json
import os
import sys

import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
CHAIN = os.path.join(ROOT, 'tools', 'research', 'chain')
sys.path.insert(0, CHAIN)

import discover  # noqa: E402
import policy  # noqa: E402


def page(no, printed, lines):
    return {'page': no, 'printed': printed, 'lines': lines, 'raw': lines}


def doc(pages, name='안건.pdf'):
    return {'path': 'x/' + name, 'name': name, 'url': 'https://example.go.kr/f', 'sha256': '0' * 64, 'format': 'PDF',
            'kind': '', 'aliases': [], 'pages': pages}


TABLE = [
    '□ 공급 계획(착공 기준)',
    '(단위:만호) 연평균 향후 5년',
    "‘22~’24 ‘26~’30(순증) 합계 ‘26 ’27 ’28 ’29 ’30",
    '수도권 15.8 27.0(+11.2) 134.9 26.9 24.6 25.0 24.9 33.5',
    '합계',
    '서울 3.9 6.7(+2.8) 33.4 6.8 6.3 6.1 5.9 8.3',
    '시범 사업 수도권 2.0 7.4(+5.4) 37.2 5.2 6.0 6.0 6.8 13.2',
    '확대ㆍ조기화 서울 0.1 0.5(+0.4) 2.7 0.4 0.6 0.6 0.5 0.6',
    '- 43 -',
]


# ---------------------------------------------------------------- 문자열 게이트

def test_table_gate_accepts_present_value_and_records_pages():
    d = doc([page(46, 43, TABLE)])
    hits = policy.table_matches([d], 269000, ['11', '28', '41'], 2026, 2026, None, ['시범 사업 확대·조기화'])
    assert len(hits) == 1
    h = hits[0]
    assert h['cell'] == '26.9' and h['col'] == "'26" and h['unit'] == '만호'
    assert policy.locator(h['page']) == 'PDF 46쪽 · 인쇄 43쪽'


def test_table_gate_rejects_absent_value_and_wrong_region():
    d = doc([page(46, 43, TABLE)])
    assert policy.table_matches([d], 270000, ['11', '28', '41'], 2026, 2026, None, []) == []
    # 서울 행의 '26 값(6.8)을 수도권으로 물으면 거부(수도권 행의 '29 칸 6.8 은 열이 달라 거부)
    assert policy.table_matches([d], 68000, ['11', '28', '41'], 2026, 2026, None, []) == []
    assert len(policy.table_matches([d], 68000, ['11'], 2026, 2026, None, [])) == 1


def test_table_gate_total_column_and_multiline_program_label():
    d = doc([page(46, 43, TABLE)])
    assert [h['cell'] for h in policy.table_matches([d], 334000, ['11'], 2026, 2030, None, [])] == ['33.4']
    hits = policy.table_matches([d], 372000, ['11', '28', '41'], 2026, 2030, '시범 사업 확대·조기화', [])
    assert [h['cell'] for h in hits] == ['37.2']
    assert policy.table_matches([d], 372000, ['11', '28', '41'], 2026, 2030, '다른 사업', []) == []


def test_suffix_gate_and_year_marker_gate():
    d = doc([page(5, 2, ['수도권 APT 입주물량(만호): (‘23)19.5 (’25e)16.1', '총 135만호 규모의 착공']), ])
    assert [h['cell'] for h in policy.suffix_matches([d], 1350000)] == ['135만호']
    assert policy.suffix_matches([d], 1360000) == []
    hits = policy.year_marker_matches([d], 161000, ['11', '28', '41'], 2025)
    assert len(hits) == 1 and hits[0]['page']['page'] == 5
    assert policy.year_marker_matches([d], 161000, ['11'], 2025) == []
    # '1호선' 같은 표기는 호수가 아니다
    assert policy.suffixed_numbers('4호선 역세권, 제1호 안건') == []


def test_text_gate_normalizes_marks_and_returns_page():
    d = doc([page(10, 7, ['LH 소유 非주택용지 용도전환 정례화'])])
    hits = policy.find_text([d], 'LH 소유 비주택용지 용도전환')
    assert len(hits) == 1 and hits[0][1]['page'] == 10
    assert policy.find_text([d], '토지임대부') == []


def test_unverified_items_fall_back_to_agent_not_reviewer():
    assert policy.manual_verdict('일치(같은 뜻)') == 'MATCH'
    assert policy.manual_verdict('원문에 없음') == 'NOT_IN_SOURCE'
    assert policy.manual_verdict('불일치(재검증 #1)') == 'MISMATCH'
    assert policy.manual_verdict('불일치는 아니나 원 게시물 병기 권장') == 'MATCH'
    assert policy.manual_verdict('—') is None
    src = open(os.path.join(CHAIN, 'policy.py'), encoding='utf-8').read()
    assert "checked_by='REVIEWER'" not in src and '"REVIEWER"' not in src


# ---------------------------------------------------------------- 원 게시처 정규화

@pytest.fixture(scope='module')
def cfg():
    return discover.load_config()


def test_board_url_canonical_and_kinds(cfg):
    host = 'https://www.molit.go.kr/USR/NEWS/m_71/dtl.jsp'
    assert discover.canonical_url(cfg, host + '?lcmspage=1&id=123') == host + '?id=123'
    assert discover.classify(cfg, host + '?id=123')['kind'] == 'original_board'
    assert discover.classify(cfg, 'https://www.korea.kr/briefing/pressReleaseView.do?newsId=1')['kind'] == 'press_repost'
    assert discover.classify(cfg, 'https://www.korea.kr/briefing/policyBriefingView.do?newsId=1')['kind'] == 'briefing'
    assert discover.classify(cfg, 'https://d.nts.go.kr/a/b.do?nttSn=1')['kind'] == 'repost'
    assert discover.classify(cfg, 'https://news.example.com/a')['kind'] == 'other'


def test_repost_text_rules(cfg):
    rule = discover.domain_rule(cfg, 'https://www.korea.kr/x')
    import re
    m = re.search(rule['publisher_regex'], '“이 자료는 국토교통부의 보도자료를 전재하여 제공함을 알려드립니다.”')
    assert m.group(1) == '국토교통부'
    text = ('첨부파일 : 속기자료.hwp 바로보기 내려받기    '
            '(안건)_시범_정책_확대_방안(정책과_등).pdf 바로보기 내려받기    '
            '260101(석간) 시범 부지를 활용한 1만호 공급(정책과).hwpx 바로보기 내려받기')
    titles = discover.attachment_titles(cfg, 'https://www.korea.kr/briefing/policyBriefingView.do?newsId=1', text)
    assert titles == ['시범 정책 확대 방안', '시범 부지를 활용한 1만호 공급']
    assert discover.clean_title(cfg, '시범 공급 방안 - 보도자료 | 브리핑룸 | 대한민국 정책브리핑') == '시범 공급 방안'
    assert discover.similarity('수도권 1만호＋a 추가 공급', '수도권 1만호+α 추가 공급') == 1.0
    assert discover.is_policy_title(cfg, '수도권 1만호 추가 공급')
    assert not discover.is_policy_title(cfg, '[해명] 1만호 공급은 사실과 다릅니다')


def test_month_windows():
    assert discover.month_windows('2025-08-01', '2026-01-10', 3) == [
        ('2025-08-01', '2025-10-31'), ('2025-11-01', '2026-01-10')]


# ---------------------------------------------------------------- 캐시

def test_cache_reused_without_refetch(tmp_path):
    calls = discover.Calls()
    req = discover.exa_search_request('q', '2025-01-01', None)
    got = discover.cached(str(tmp_path), 'exa-search', req, lambda: {'results': [1]}, False, calls)

    def boom():
        raise AssertionError('캐시가 있는데 다시 불렀다')

    again = discover.cached(str(tmp_path), 'exa-search', req, boom, False, calls)
    assert got == again == {'results': [1]} and calls.cached == 1
    saved = json.load(open(discover.cache_path(str(tmp_path), 'exa-search', req), encoding='utf-8'))
    assert saved['request']['body'] == {'query': 'q', 'type': 'auto', 'contents': {'highlights': True},
                                        'startPublishedDate': '2025-01-01'}


def test_discovery_reruns_offline_from_saved_cache(cfg, monkeypatch):
    run = os.path.join(cfg['_cache_dir'], 'run-2025-08-01_2026-10-17.json')
    if not os.path.exists(run):
        pytest.skip('증명 창 캐시가 없다')

    def no_network(*a, **k):
        raise AssertionError('네트워크 호출')

    monkeypatch.setattr(discover, 'run_exa', no_network)
    monkeypatch.setattr(discover, 'http_get', no_network)
    calls = discover.Calls()
    records, details, _ = discover.discover(cfg, '2025-08-01', '2026-10-17', False, calls)
    found = {o['url'] for r in records for o in r['originals']}
    policies = json.load(open(os.path.join(discover.ROOT, cfg['policies_file']), encoding='utf-8'))['policies']
    for p in policies:
        assert discover.canonical_url(cfg, p['canonical_url']) in found
    assert calls.exa == 0 and calls.http == 0


# ---------------------------------------------------------------- 정책 고유 문자열 없음

def forbidden_strings():
    out = set()
    policies = json.load(open(os.path.join(CHAIN, 'config', 'policies.json'), encoding='utf-8'))['policies']
    for p in policies:
        out |= {p['policy_id'], p['announced'], p['canonical_url'], p['name'], p['slug'], p['home_policy_id'],
                p['canonical_url'].rsplit('=', 1)[-1]}
        out.add(p['name'].split(' (')[0])
    with open(os.path.join(ROOT, 'docs/speech/research/01.정책/추출_정책_HOME.csv'), encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            out |= {r['목표(호)'], r['목표_표기'], r['근거_URL']}
    work = os.path.join(ROOT, 'docs/speech/research/dataset/_work')
    for p in policies:
        path = os.path.join(work, p['policy_id'], 'policy_sites.jsonl')
        if os.path.exists(path):
            for line in open(path, encoding='utf-8'):
                row = json.loads(line)
                name = row['site_name']
                # 개별 지명(SITE)만 본다. 묶음·주택 유형 낱말('군부지'·'기숙사')은 규칙 어휘와 겹친다.
                if row.get('site_kind', 'SITE') == 'SITE' and len(policy.norm(name)) >= 3:
                    out.add(name)
    return {s for s in out if s}


@pytest.mark.parametrize('name', ['discover.py', 'policy.py'])
def test_code_has_no_policy_specific_strings(name):
    src = open(os.path.join(CHAIN, name), encoding='utf-8').read()
    hits = sorted(s for s in forbidden_strings() if s in src)
    assert hits == []


# ---------------------------------------------------------------- 결정 반영: 근거 URL·SOURCED

def test_source_url_same_document_match_else_mismatch():
    kind = {'kind': 'press_repost', 'org': '정책브리핑'}
    canon = 'https://board.example.go.kr/dtl?id=1'
    assert policy.source_url_verdict(canon, canon, set(), kind, canon) == ('MATCH', None)
    v, note = policy.source_url_verdict('https://repost/a', canon, {'https://repost/a'}, kind, 'https://repost/a')
    assert v == 'MATCH' and '원 게시물 병기 권장' in note
    v, note = policy.source_url_verdict('https://other/b', canon, {'https://repost/a'}, kind, 'https://other/b')
    assert v == 'MISMATCH'


def test_publisher_rows_are_sourced_without_external_value():
    work = os.path.join(ROOT, 'docs/speech/research/dataset/_work')
    rows = []
    for name in sorted(os.listdir(work)) if os.path.isdir(work) else []:
        path = os.path.join(work, name, 'evidence_policy.jsonl')
        if name.startswith('POL_') and os.path.exists(path):
            rows += [json.loads(x) for x in open(path, encoding='utf-8')]
    pub = [r for r in rows if r['field'] in ('publisher_org', 'publisher_dept')]
    if not pub:
        pytest.skip('출력이 없다')
    assert all(r['verdict'] == 'SOURCED' and r['basis'] is None and r['external_value'] is None for r in pub)
    assert all(r['checked_by'] != 'REVIEWER' for r in rows)


# ---------------------------------------------------------------- 지명 정제

def test_site_kind_rules():
    assert policy.site_kind('○○왕숙 공공주택지구 A24') == 'SITE'
    assert policy.site_kind('3기 신도시') == 'AGGREGATE'
    assert policy.site_kind('서울 유휴부지') == 'AGGREGATE'
    assert policy.site_kind('군부지') == 'AGGREGATE'
    assert policy.site_kind('기숙사') == 'NOT_SITE'
    assert policy.site_kind('1지구') == 'NOT_SITE'
    assert policy.site_kind('B17') == 'NOT_SITE'


def test_block_only_row_gets_district_context():
    d = doc([page(13, 10, ['* (11월) 가나다 공공주택지구 A24(393호), B17(499호)'])])
    rows = policy.extract_sites({'policy_id': 'P'}, [d], {})
    names = [r['site_name'] for r in rows]
    assert names == ['가나다 공공주택지구 A24', '가나다 공공주택지구 B17']
    assert rows[1]['block'] == 'B17' and '지구' in rows[1]['notes']


def test_duplicate_site_units_annotated_with_representative():
    d = doc([page(9, 5, ['⑧ (서울) 가나 군부지 0.9천호']), page(15, 11, ['(서울 가나구) 가나 군부지 : 918호(약 7만㎡)'])])
    rows = policy.extract_sites({'policy_id': 'P'}, [d], {})
    rows = policy.merge_sites(rows, [policy.heading_site({'policy_id': 'P'}, d, d['pages'][1], d['pages'][1]['lines'][0])])
    rows = [r for r in rows if policy.site_key(r['site_name']) == policy.site_key('가나 군부지')]
    policy.annotate_duplicate_sites(rows)
    assert sorted(r['units'] for r in rows) == [900, 918]
    rep = [r for r in rows if r['notes'].startswith('대표')]
    assert len(rep) == 1 and rep[0]['units'] == 918
    assert all('대표 규칙' in r['notes'] for r in rows)


def test_heading_classification():
    names = set()
    assert policy.classify_heading('(경기 가나시) 다라 부지 : 약 550호', '(경기 가나시) 다라 부지 : 약 550호', names) == 'SITE'
    assert policy.classify_heading('501 마바(사아 앞)', '501 마바(사아 앞)', names) == 'SITE'
    assert policy.classify_heading('신축매입임대 공급 확대', '신축매입임대 공급 확대', names) == 'SUPPLY'
    assert policy.classify_heading('정비사업 제도 종합 개편', '정비사업 제도 종합 개편', names) == 'MEASURE'
    assert policy.classify_heading('규제지역 LTV 강화', '규제지역 LTV 강화', names) == 'MEASURE'
    assert policy.classify_heading('보상 착수 단계', '보상 착수 단계', names) == 'DROP'


# ---------------------------------------------------------------- M4 누락 검증(01)

def test_target_gap_rules():
    ds = {'values': {60000}}
    assert policy.judge_target(60000, '6만호', '◈ 6만호 공급', ds)[0] == 'ALREADY_PRESENT'
    assert policy.judge_target(50000, '5만호', '◈ ’30년까지 5만호 착공', ds)[0] == 'MISSING'
    assert policy.judge_target(73000, '7.3만호', '◈ 7.3만호+α 추가 발표', ds)[0] == 'PENDING'
    assert policy.judge_target(54000, '5.4만호', '◈ 작년 5.4만호 착공 실적', ds)[0] == 'OUT_OF_SCOPE'


def test_program_match_ignores_generic_words():
    progs = {'A': '소규모주택정비사업 활성화', 'B': '도심지 주택공급', 'C': '노후 공공임대 재건축'}
    assert policy.program_match('노후 공공임대주택 전면 재건축', progs)[0] == 'C'
    assert policy.program_match('모듈러 주택 공급 활성화', progs)[1] < 0.3
    assert policy.program_match('빈집 정비 활성화', progs)[1] < 0.3


def test_gaps_file_keeps_other_stage_rows(tmp_path):
    path = tmp_path / 'gaps.jsonl'
    path.write_text(json.dumps({'stage_code': '02', 'x': 1}) + '\n' + json.dumps({'stage_code': '01', 'x': 2}) + '\n')
    policy.write_gaps(str(path), [{'stage_code': '01', 'x': 3}])
    rows = [json.loads(x) for x in path.read_text().splitlines()]
    assert rows == [{'stage_code': '02', 'x': 1}, {'stage_code': '01', 'x': 3}]


def test_followup_parent_detection():
    pols = [{'policy_id': 'A', 'announced': '2025-09-07', 'name': '가나 확대방안 (9·7)'},
            {'policy_id': 'B', 'announced': '2026-01-29', 'name': '다라 방안 (1·29)'}]
    assert discover.parents_of('<가나 확대방안(9.7, 1.29) 후속조치> 무엇', pols) == ['A', 'B']
    assert discover.parents_of('‘가나 확대방안’ 후속조치 본격화', pols) == ['A']
    assert discover.parents_of('11.29 행사 안내', pols) == []


# ---------------------------------------------------------------- 후속·이행 실적 문서

def test_table_sites_reads_right_aligned_rows():
    raw = ['       단지명                  사업            이주             착공             입주            기존             계획              용적률',
           '                            승인            년도             년도             년도            호수             호수                변화',
           '    가나5(SH)                ’25.2       ’25        ’26        ’29        570      1,336     93  476%→']
    rows = policy.table_sites(raw)
    assert [(r['name'], r['units']) for r in rows] == [('가나5', 1336)]
    assert '착공년도 ’26' in rows[0]['notes'] and '시행 SH' in rows[0]['notes']


def test_card_sites():
    lines = ['① 가나역 동측', '·(위치) 서울시 다라구 마바동', '·(면적) 44,620㎡', '·(공급규모) 1,663호']
    c = policy.card_sites(lines)
    assert [(x['name'], x['units'], x['place']) for x in c] == [('가나역 동측', 1663, '서울시 다라구 마바동')]


def test_not_site_rules():
    assert policy.site_kind('방안') == 'NOT_SITE'
    assert policy.site_kind('800억 투자') == 'NOT_SITE'
    assert policy.site_kind('가나', ')급 신도시') == 'NOT_SITE'
    assert policy.site_kind('가나', ' 하나 더') == 'NOT_SITE'
    assert policy.site_kind('가나 모델') == 'NOT_SITE'
    assert policy.site_kind('가나역 동측') == 'SITE'


def test_policy_markers():
    pols = [{'policy_id': 'A', 'announced': '2025-09-07', 'name': '가나 확대방안 (9·7)'},
            {'policy_id': 'B', 'announced': '2026-08-13', 'name': '다라 방안 (8·13)'}]
    assert policy.policy_markers('세 차례 공급대책(9.7, 1.29, 8.13)으로', pols) == ['A', 'B']
    assert policy.policy_markers('｢다라 방안｣(8.13)의 후속조치다', pols) == ['B']
    assert policy.policy_markers('9.7% 증가', pols) == []


def test_progress_metric_rows():
    pols = [{'policy_id': 'A', 'announced': '2025-09-07', 'name': '가나 확대방안 (9·7)'},
            {'policy_id': 'B', 'announced': '2026-08-13', 'name': '다라 방안 (8·13)'}]
    d = doc([page(4, 4, ['3   실적', '□ 세 차례 공급대책(9.7, 8.13)으로 착공 계획', '➊ (공공주택) 올해 착공목표 6.2만호의 약 26%인 1.62만호* 착공',
                         '  * (3기신도시) 가나창릉(2.3천호) 착공', '4   이행 실적', '□ 8.13대책 세부과제 145건 중 48건 완료'])],
            name='(별첨1) 브리프.pdf')
    secs = policy.report_sections([d], pols)
    rows = policy.extract_progress({'slug': '정례브리핑_x', 'posted': '2026-10-16 00:00'}, [d], secs, pols)
    got = [(r['indicator'], r['measure'], r['value'], r['unit'], r['policy_attribution']) for r in rows]
    assert ('공공주택', '목표', 62000, '호', None) in got  # 여러 정책이 함께 나오는 절 → 공통
    assert ('공공주택', '착공', 16200, '호', None) in got
    assert all(r['value'] != 2300 for r in rows)  # 지명 뒤 괄호 속 사업별 값은 지표 아님
    assert [r['policy_attribution'] for r in rows if r['unit'] == '건'] == [['B'], ['B']]
    assert all(r['page'] == 4 and r['source'] == '정례브리핑' for r in rows)


def test_redact_official_names():
    assert policy.redact('국토교통부 (장관 가나다)는') == '국토교통부 (장관)는'
    assert policy.redact('가나다 주택공급추진본부장은') == '○○○ 주택공급추진본부장은'
    assert policy.redact('국토부 장관과') == '국토부 장관과'


def test_labeled_sites_with_bundle_units():
    lines = ['◈ 가나 테크노밸리 인근 우수 입지에', '신규 공공주택지구를 지정하여 6,300호 공급', '□ (개발구상) 친환경 주거단지',
             'ㅇ (다라금토2) 혁신산업 공간 조성', 'ㅇ (다라여수2) 공원 녹지축 조성', 'ㅇ (향후계획) 인허가 완료', '다라 금토2   다라 여수2']
    got = policy.labeled_sites(lines)
    assert [(x['name'], x['note']) for x in got] == [('다라금토2', '묶음 호수 6,300호(◈ 줄)'), ('다라여수2', '묶음 호수 6,300호(◈ 줄)')]


def test_name_normalize_keeps_quote():
    policy.NAME_NORMALIZE.clear()
    policy.NAME_NORMALIZE.update({'◯구': '舊', '◯': '舊'})
    d = doc([page(9, 5, ['⑪ (경기) ◯구가나대학교 2.6천호'])])
    r = policy.extract_sites({'policy_id': 'P'}, [d], {})[0]
    assert r['site_name'] == '舊가나대학교' and '◯구가나대학교' in r['quote'] and '정규화' in r['notes']
    policy.NAME_NORMALIZE.clear()


def test_table_with_location_as_name_column():
    raw = ['연번    지역               위치              면적(㎡)   노후도(%)     現용도      공급',
           '                                                           지역      규모',
           '  1   가나          다라역 인근            51,497    74.0%     2종     1,253',
           '  2   가나            마바역   동측           15,272    82.1%   2종, 상업    447']
    rows = policy.table_sites(raw)
    assert [(r['name'], r['region'], r['units']) for r in rows] == [('다라역 인근', '가나', 1253), ('마바역 동측', '가나', 447)]


def test_name_keys_variants():
    assert policy.name_match('신당(약수역)', {'x': '약수역 인근'}) == 'x'
    assert policy.name_match('가나다', {'x': '라마바'}) is None


def test_table_attribution_by_merged_note_cells():
    pols = [{'policy_id': 'A', 'announced': '2025-09-07', 'name': '가나 확대방안 (9·7)'},
            {'policy_id': 'B', 'announced': '2026-01-29', 'name': '다라 방안 (1·29)'}]
    raw = ['          사업부지                면적      계획호수(안)    활용부지 유형        비고']
    types = ['유휴부지'] * 3 + ['노후청사'] * 3 + ['공공임대'] * 2
    for n, t in enumerate(types, 1):
        note = '1.29 방안' if n == 3 else ''
        raw.append(f'{n}  가나{n}부지                   1,000㎡     {n}00호   {t}           {note}')
        if n == 7:
            raw.append(' ' * 63 + '9.7 대책')
    attr = policy.table_attribution(raw, pols, 3)
    got = {raw[k].split()[1]: v[0] for k, v in attr.items()}
    assert got['가나1부지'] == ['B'] and got['가나6부지'] == ['B'] and got['가나8부지'] == ['A']
    assert "비고 '1.29 방안'" in attr[1][1]


def test_label_words_are_not_sites():
    assert policy.site_kind('공급규모') == 'NOT_SITE'
    assert policy.site_kind('사업시행자') == 'NOT_SITE'
    d = doc([page(1, 1, ['(면적 : 93,262㎡, 공급규모 : 4,040호)', '·(공급규모) 1,663호'])])
    assert all(r['site_kind'] != 'SITE' for r in policy.extract_sites({'policy_id': 'P'}, [d], {}))


def test_aggregate_prefix_with_district_is_site():
    assert policy.site_kind('3기 신도시') == 'AGGREGATE'
    assert policy.site_kind('3기 신도시 가나왕숙') == 'SITE'
    assert policy.site_kind('△3기 신도시 가나왕숙') == 'SITE'
    assert policy.name_match('△3기 신도시 가나왕숙', {'x': '가나왕숙 A1'}) == 'x'


def test_block_rows_match_only_same_block():
    r = {'site_name': '가나왕숙 공공주택지구 B17', 'block': 'B17', 'site_kind': 'SITE'}
    ds = {'projects': {'p1': '가나왕숙 A24'}, 'all_projects': {'p1': '가나왕숙 A24', 'p2': '가나왕숙 B-17'}}
    v, pid, _ = policy.judge_site(r, ds)
    assert (v, pid) == ('PENDING', 'p2')


def test_manual_rows_get_source_document_or_unverified():
    press = doc([page(1, 1, ['수도권에 1만호 추가 공급'])], name='가나(보도자료).pdf')
    agenda = doc([page(54, 50, ['참고1 공급물량 확대 효과'])] * 1, name='가나 (안건) 방안.pdf')
    agenda['pages'] = [page(n, None, ['-']) for n in range(1, 54)] + [page(54, 50, ['참고1 공급물량 확대 효과'])]
    m = {'locator': "보도자료 2번째 □ / 해명 자료 제목", 'value': '"수도권에 1만호 추가 공급"'}
    d, pg = policy.manual_doc(m, [press, agenda])
    assert d is press and pg['page'] == 1
    d, pg = policy.manual_doc({'locator': '안건 참고1(인쇄 50 / PDF 54)', 'value': ''}, [press, agenda])
    assert d is agenda and pg['page'] == 54
    assert policy.manual_doc({'locator': '속기 원문', 'value': ''}, [press, agenda]) == (None, None)
    bad = policy.check_evidence_docs([{'verdict': 'MATCH', 'doc_url': None, 'doc_path': None},
                                      {'verdict': 'UNVERIFIED', 'doc_url': None, 'doc_path': None},
                                      {'verdict': 'SOURCED', 'doc_url': 'u', 'doc_path': None}])
    assert len(bad) == 1


def test_outputs_have_document_for_every_confirmed_row():
    work = os.path.join(ROOT, 'docs/speech/research/dataset/_work')
    rows = []
    for name in sorted(os.listdir(work)) if os.path.isdir(work) else []:
        path = os.path.join(work, name, 'evidence_policy.jsonl')
        if name.startswith('POL_') and os.path.exists(path):
            rows += [json.loads(x) for x in open(path, encoding='utf-8')]
    if not rows:
        pytest.skip('출력이 없다')
    assert policy.check_evidence_docs(rows) == []
