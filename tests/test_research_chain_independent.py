"""tools/research/chain 독립 수집 경로 시험: 원장 행 → 원 레코드 재확인, HOME 유래 제외, 범위 밖·단계 순서 모순이면 미도달 아님,
HOME 값 대조·원천값 수집, 위치 키 정규화."""

import os
import sys
from collections import OrderedDict, defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
CHAIN = os.path.join(ROOT, 'tools', 'research', 'chain')
sys.path.insert(0, CHAIN)

import common  # noqa: E402
import engine  # noqa: E402
from stages import independent as ind  # noqa: E402

CFG = common.load_config('stage_sources.json')


def fake_run(payloads, stage_claim=None):
    """engine.Run 의 행 만들기(add·use)만 쓰는 가짜 실행."""
    R = engine.Run.__new__(engine.Run)
    R.cfg = CFG
    R.stages = OrderedDict((s['home_stage'], s) for s in CFG['stages'])
    R.projects = {pid: {'payload': dict(pl), 'source_id': 'x'} for pid, pl in payloads.items()}
    R.pids = sorted(payloads)
    R.subject = {pid: ('PRJ-%d' % i, 'HPR') for i, pid in enumerate(R.pids)}
    R.rows = {st: [] for st in R.stages}
    R.used = defaultdict(lambda: defaultdict(dict))
    R.order_issues, R.indep_why, R.home_urls = [], {}, {}

    class S:
        pass
    R.S = S()
    R.S.indep = ind.Indep()
    R.S.indep.urls = {}
    R.S.indep.lh_old, R.S.indep.lh_old_limit = None, ""
    return R


def hub_x(rows):
    X = ind.Indep()
    c = CFG['independent']['sources']['hub_basic']
    X.hub_cols = list(c['cols'].values()) + ['승인_일', '착공_일', '착공_예정_일', '사용_검사_예정_일', '사용_검사_일']
    X.hub_ix = {k: X.hub_cols.index(v) for k, v in c['cols'].items()}
    X.hub_member = 'm.txt'
    X.hub_by_pk = {}
    for ln, rec in rows:
        X.hub_by_pk[rec['관리_주택대장_PK']] = (ln, [rec.get(col, '') for col in X.hub_cols])
    X.idents, X.events, X.nlinks = defaultdict(list), defaultdict(list), defaultdict(list)
    return X


def test_ledger_row_rechecked_against_raw_record_and_home_rows_excluded():
    R = fake_run({'PRO_a': {'name': 'x'}})
    X = hub_x([(7, {'관리_주택대장_PK': 'P1', '승인_일': '20211231', '총_세대_수(세대)': '463'}),
               (8, {'관리_주택대장_PK': 'P2', '승인_일': '20200101', '총_세대_수(세대)': '10'})])
    subj = R.subject_id('PRO_a')
    X.idents[subj] = [
        {'local_project_id': subj, 'id_type': 'HUB_HS_PK', 'id_value': 'P1', 'source_ref': 'hub-bulk-hs-2026-08'},
        {'local_project_id': subj, 'id_type': 'HUB_HS_PK', 'id_value': 'P2', 'source_ref': 'home-dump-20261014T102506Z'},
        {'local_project_id': subj, 'id_type': 'KAPT_CODE', 'id_value': 'K1', 'source_ref': 'datagokr-15106861'}]
    X.events[subj] = [{'local_project_id': subj, 'source_ref': 'hub-bulk-hs-2026-08', 'event_type': 'PERMIT',
                       'event_date': '2021-12-30'}]
    X.nlinks[subj] = [{'local_project_id': subj, 'notice_id': 'N1', 'source_ref': 'home-dump-20261014T102506Z-notice'}]
    k = {'block': None}
    recs, notes, unrouted = ind.from_ledger(R, X, 'PRO_a', k)
    assert [r['rid'] for r in recs] == [('hub', 'P1')]  # HOME 유래(P2)·HOME 공고 연결은 쓰지 않음
    rec = recs[0]
    assert rec['fields']['승인_일'] == '20211231' and '행 7' in rec['pos']  # 값은 원 레코드에서
    assert '원장 PERMIT 2021-12-30 는 원 레코드에 없음' in rec['how']  # 원장 값을 믿지 않고 다르면 적음
    assert unrouted == 1 and notes == []
    X.hub_by_pk.pop('P1')
    recs, notes, _ = ind.from_ledger(R, X, 'PRO_a', k)
    assert recs == [] and '원 레코드를 대용량에서 못 찾음' in notes[0]


def keyd(**kw):
    k = dict(block_key=False, name='', names=[], sgg='11110', sido='11', district=None, block=None, blocks=[], nb='',
             key_how='', base='', units=None, developer='', claim=None, region='서울특별시', muni='', bjds=[], pnus=[])
    k.update(kw)
    return k


def stage_rows(R, code):
    return R.rows[ind.stage_of(R, code)]


def test_absent_only_inside_source_scope():
    # 호수 30 미만: 주택인허가 범위 밖 → 미도달 아님
    R = fake_run({'PRO_a': {'name': '가나다라'}})
    ind.absent(R, 'PRO_a', keyd(name='가나다라', names=['가나다라'], units=20), True, {}, {}, [])
    assert all(not rs for rs in R.rows.values())
    assert R.indep_why[(R.subject_id('PRO_a'), '03')].startswith('범위 밖')
    # 위치 키 없음 → 미도달 아님
    R = fake_run({'PRO_a': {'name': '가'}})
    ind.absent(R, 'PRO_a', keyd(), False, {}, {}, [])
    assert all(not rs for rs in R.rows.values()) and '위치 키 없음' in R.indep_why[(R.subject_id('PRO_a'), '03')]
    # 범위 안·근거 없음 → 03 미도달 + 04~06 파생, search_scope 기록
    R = fake_run({'PRO_a': {'name': '가나다라'}})
    ind.absent(R, 'PRO_a', keyd(name='가나다라', names=['가나다라']), True, {}, {}, [])
    for code in ('03', '04', '05', '06'):
        rs = stage_rows(R, code)
        assert [r['대조'] for r in rs] == ['미도달 확인']
        assert '조회 키: 이름 키 시군구 11110' in rs[0]['_scope'] and '2026-08-31' in rs[0]['_scope']
        # 직접 탐색(03)은 INDEPENDENT, 선행 단계에서 이어서 판단한 04~06 은 RULE + '파생: 03 미도달'
        if code == '03':
            assert rs[0]['대조_성격'] == '독립 원천 대조' and '파생' not in rs[0]['비고']
        else:
            assert common.BASIS_EN[rs[0]['대조_성격']] == 'RULE' and '파생: 03 미도달' in rs[0]['비고']
    assert common.VERDICT_EN['미도달 확인'] == 'ABSENT_CONFIRMED'


def test_stage_order_conflict_is_not_absent():
    R = fake_run({'PRO_a': {'name': '가나다라'}})
    R.add(ind.stage_of(R, '06'), 'PRO_a', HOME_표='collection_link', HOME_상태='확정', 대조='일치', 대조_성격='같은 원천 재확인')
    ind.absent(R, 'PRO_a', keyd(name='가나다라', names=['가나다라']), True, {}, {}, [])
    rs = stage_rows(R, '03')
    assert [r['대조'] for r in rs] == ['비교 불가'] and '단계 순서 모순' in rs[0]['비고']
    assert not any(r['대조'] == '미도달 확인' for v in R.rows.values() for r in v)
    assert [x['단계'] for x in R.order_issues] == ['03'] and R.order_issues[0]['추정_원인'] == '이름 차이'
    # 계획값(_plan) 행은 도달 근거가 아니다
    R = fake_run({'PRO_a': {'name': '가나다라'}})
    r = R.add(ind.stage_of(R, '04'), 'PRO_a', HOME_표='project', HOME_상태='검토', 대조='일치', 대조_성격='같은 원천 재확인')
    r['_plan'] = True
    ind.absent(R, 'PRO_a', keyd(name='가나다라', names=['가나다라']), True, {}, {}, [])
    assert [r['대조'] for r in stage_rows(R, '03')] == ['미도달 확인']
    # HOME 사업 단계 주장(APPROVAL) → 모순
    R = fake_run({'PRO_a': {'name': '가나다라'}})
    ind.absent(R, 'PRO_a', keyd(name='가나다라', names=['가나다라'], claim='APPROVAL'), True, {}, {}, [])
    assert [r['대조'] for r in stage_rows(R, '03')] == ['비교 불가'] and R.order_issues


def rec(rid, **fields):
    return dict(src='hub_basic', rid=rid, file='raw/hub.zip', pos='행 %s' % rid, how='키', fields=fields,
                raw=OrderedDict([('_file', 'raw/hub.zip'), ('_pos', str(rid))]))


def test_records_rows_compare_and_sourced():
    R = fake_run({'PRO_a': {'name': 'x'}})
    hv = {c: defaultdict(list) for c in ind.CODES}
    hv['03']['승인일'] = ['2021-12-31']
    ind.records_rows(R, 'PRO_a', '03', 'hub_basic', [rec(1, 승인_일='20211231'), rec(2, 승인_일='20150101')], hv,
                     {'building_hub'})
    rs = stage_rows(R, '03')
    assert [(r['대조'], r['대조_성격']) for r in rs] == [('일치', '같은 원천 재확인'), ('원천값 수집', '같은 원천 재확인')]
    assert rs[0]['HOME_표'] == common.INDEP and '같은 사업의 다른 레코드' in rs[1]['비고']
    # HOME 값이 없으면 원천값 수집(SOURCED), HOME 원천과 다르면 독립 원천 대조
    R = fake_run({'PRO_a': {'name': 'x'}})
    hv = {c: defaultdict(list) for c in ind.CODES}
    ind.records_rows(R, 'PRO_a', '03', 'hub_basic', [rec(1, 승인_일='20211231')], hv, {'lh_sale'})
    r = stage_rows(R, '03')[0]
    assert (r['대조'], r['대조_성격'], r['HOME_값']) == ('원천값 수집', '독립 원천 대조', '')
    assert common.NO_EXTERNAL in r['비고'] and common.VERDICT_EN['원천값 수집'] == 'SOURCED'
    # HOME 값과 다르고 맞는 레코드가 없으면 불일치
    R = fake_run({'PRO_a': {'name': 'x'}})
    hv = {c: defaultdict(list) for c in ind.CODES}
    hv['03']['승인일'] = ['2022-01-06']
    ind.records_rows(R, 'PRO_a', '03', 'hub_basic', [rec(1, 승인_일='20211231')], hv, set())
    assert stage_rows(R, '03')[0]['대조'] == '불일치'
    # 값이 모두 빈 레코드는 행을 만들지 않는다
    R = fake_run({'PRO_a': {'name': 'x'}})
    ind.records_rows(R, 'PRO_a', '03', 'hub_basic', [rec(1, 승인_일='')], hv, set())
    assert stage_rows(R, '03') == []


def test_location_key_normalization():
    suf = CFG['independent']['keys']['district_suffixes']
    assert common.district_eq('남양주 왕숙2 공공주택지구', '남양주왕숙2', suf)
    assert not common.district_eq('남양주왕숙2지구', '남양주왕숙', suf)  # 지구명 뒤 숫자 = 다른 지구
    assert common.district_eq('고덕국제화계획지구 내', '평택고덕국제화계획 (', suf)
    assert common.district_eq('인천서구(거북이기지)', '인천서구(거북이기지)', suf)
    assert not common.district_eq('인천서구(석남어울림)', '인천서구(거북이기지)', suf)
    assert not common.site_in_text('남양주왕숙2지구 A7블록', '남양주왕숙', 'A7')
    assert common.site_in_text('고양창릉지구 S-5, S-6블록', '고양창릉', 'S-06')
    assert ind.name_in('서울 신길2 도심 공공주택', '신길2') and not ind.name_in('장위12구역', '장위1')
    kc = CFG['independent']['keys']
    assert ind.name_variants('면목(용마터널)', kc) == ['면목용마터널', '용마터널']
    assert ind.name_variants('신길2구역', kc) == ['신길2구역', '신길2']
    assert ind.any_name('서울 용마터널 인근 도심 공공주택 복합지구', ['용마터널'], kc['name_markers'])
    assert not ind.any_name('녹번역e편한세상캐슬', ['녹번역'], kc['name_markers'])  # 공공주택 표지 없음
    assert ind.strip_block_from_district('의정부법조타운S-3BL (', ['S3']) == '의정부법조타운'
    assert common.same_period('2026-10', '20261015') and common.same_period('2026-10-01', '2026-10-02') is False


def test_block_aliases_and_loose_notation():
    kc = CFG['independent']['keys']
    k = keyd(block_key=True, district='인천검단', base='인천검단', blocks=['A13-1'], block='A13-1', nb='A131')
    got = [(x['block'], bool(x['alias'])) for x in ind.per_block(k, kc)]
    assert got == [('A13-1', False), ('AA19', True)]  # 원천 한 행에 두 이름이 함께 나온 별칭만
    k = keyd(block_key=True, district='인천계양', base='인천계양', blocks=['A2'], block='A2', nb='A2')
    assert [x['block'] for x in ind.per_block(k, kc)] == ['A2']  # 근거 없는 별칭은 만들지 않음
    import re
    m = re.match(kc['block_loose']['regex'], 'Ab37')
    assert m and m.group(1) + m.group(2) == 'A37' and not re.match(kc['block_loose']['regex'], 'AA19')


def test_lh_notice_rows_value_per_file(tmp_path):
    import evidence
    R = fake_run({'PRO_a': {'name': 'x'}})
    R.out = str(tmp_path)
    R.policy = {'policy_id': 'POL_TEST'}
    r = R.add(ind.stage_of(R, '05'), 'PRO_a', HOME_표='evidence_bridge', HOME_상태='확정', 대조='일치',
              대조_성격='같은 원천 재확인', 원본_파일='a/notices.json; a/details.json', 원본_위치='키 P=1 · notices.json items[0] · details.json rows[3]',
              원본_값='공고 / 단지')
    r['_by_file'] = {'a/notices.json': ('키 P=1 · notices.json items[0]', '공고일 20250101'),
                     'a/details.json': ('키 P=1 · details.json rows[3]', '입주예정월 202801')}
    out = [e for e in evidence.stage_rows(R) if e['stage_code'] == '05']
    assert [(e['doc_path'], e['original_value'], e['locator']) for e in out] == [
        ('a/notices.json', '공고일 20250101', '키 P=1 · notices.json items[0]'),
        ('a/details.json', '입주예정월 202801', '키 P=1 · details.json rows[3]')]


def test_link_attribution_by_document_and_site_name_rules():
    import evidence
    import home
    R = fake_run({'PRO_a': {'name': '하계5단지', 'program': 'P', 'region': '서울특별시', 'planned_units': 1336},
                  'PRO_b': {'name': '가양 노후 임대 재건축', 'program': 'P', 'region': '서울특별시', 'planned_units': 3235},
                  'PRO_c': {'name': '마곡', 'program': 'P', 'region': '서울특별시', 'planned_units': 10},
                  'PRO_d': {'name': '강서 군부지', 'program': 'P', 'region': '서울특별시', 'municipality': '강서구'}})
    R.policy = {'policy_id': 'POL_T', 'slug': 'A-1', 'home_policy_id': 'H', 'canonical_url': None, 'docs_dir': 'd/원본/A-1'}
    R.D = {'home_program_mapping': []}
    R.prog_check = {}
    R.sites = [
        {'site_name': '하계5', 'units': 1336, 'candidate_source': 'FOLLOWUP_RULE_TABLE', 'doc_path': 'd/원본/A-1_후속_x/t.pdf', 'page': 3, 'quote': 'q'},
        {'site_name': '가양7', 'units': 3235, 'candidate_source': 'FOLLOWUP_RULE_TABLE', 'doc_path': 'd/원본/A-1_후속_x/t.pdf', 'page': 3, 'quote': 'q'},
        {'site_name': '가양7', 'units': 999, 'candidate_source': 'FOLLOWUP_RULE', 'doc_path': 'd/원본/A-1_후속_y/u.pdf', 'page': 1, 'quote': 'q'},
        {'site_name': '마곡', 'units': None, 'candidate_source': '정례브리핑', 'doc_path': 'd/원본/정례브리핑_x/b.pdf', 'page': 5, 'quote': 'q'},
        {'site_name': '마곡', 'units': None, 'candidate_source': 'FOLLOWUP_RULE', 'doc_path': 'd/원본/A-1+B-2_후속_z/j.pdf', 'page': 2, 'quote': 'q'},
        # 추출 방법(EXA·RULE+EXA)이어도 정책 원문 폴더의 문서면 귀속
        {'site_name': '강서 군부지', 'units': None, 'candidate_source': 'RULE+EXA', 'doc_path': 'd/원본/A-1/an.pdf', 'page': 7, 'quote': 'q',
         'sido': '서울', 'site_kind': 'SITE'},
    ]
    rules = CFG['independent']['keys']['site_name_rules']
    assert [h for _, h in home.site_matches(R.projects['PRO_a']['payload'], R.sites, rules)] == ['이름(정규화)']
    # 가양 → 가양7 은 호수가 같은 행만
    assert [(s['units'], h) for s, h in home.site_matches(R.projects['PRO_b']['payload'], R.sites, rules)] == [(3235, '이름 앞부분+호수')]
    rows = {e['external_ref']: e for e in evidence.link_rows(R)}
    assert rows['PRO_a']['verdict'] == 'MATCH' and rows['PRO_b']['verdict'] == 'MATCH'
    assert rows['PRO_d']['verdict'] == 'MATCH' and rows['PRO_d']['doc_path'] == 'd/원본/A-1/an.pdf'
    # 정례브리핑·부모 정책이 둘인 후속 발표의 지명은 연결 확인에 쓰지 않는다
    assert rows['PRO_c']['verdict'] == 'UNVERIFIED' and rows['PRO_c']['notes'].count('여러 정책 공통 언급') == 2


def test_site_name_normalization_examples():
    import home
    rules = CFG['independent']['keys']['site_name_rules']

    def hit(project, site, municipality, sido=None):
        pl = {'name': project, 'region': '경기도' if municipality.endswith('시') else '서울특별시', 'municipality': municipality}
        return [h for _, h in home.site_matches(pl, [{'site_name': site, 'sido': sido, 'site_kind': 'SITE'}], rules)]
    assert hit('중랑 면목행정복합타운', '면목 행정복합타운', '중랑구') != []
    # 舊·◯구·부지·앞 지역 낱말(성수동·서울)을 떼면 '경찰청기마대' 로 같다
    assert hit('성수동 舊 서울경찰청기마대 부지', '◯구경찰청 기마대', '성동구') == ['이름(정규화)']
    assert hit('성수동 舊 서울경찰청기마대 부지', '성수동 舊 경찰청 기마대 부지', '성동구') == ['이름(정규화)']
    assert hit('쌍문동 교육연구시설', '쌍문동 연구시설', '도봉구') == ['이름(포함·지역 일치)']
    # 지역 낱말이 서로 다르면 포함이어도 잇지 않는다, 근거 없는 유사도 매칭 없음
    assert hit('쌍문동 교육연구시설', '창동 연구시설', '도봉구') == []
    assert hit('강서 군부지', '대방동군부지', '강서구') == []
    assert hit('강서 군부지', '군부지', '강서구', '서울') == ['이름(정규화)']
    assert hit('부천우편집중국', '수원 우편집중국', '부천시') == [] and hit('부천우편집중국', '수원우편집중국', '부천시') == []
    assert hit('금천 공군부대', '독산 공군부대', '금천구') == ['이름(정규화)']  # 독산동은 금천구
    assert home.site_matches({'name': '강서 군부지', 'region': '서울특별시', 'municipality': '강서구'},
                             [{'site_name': '군부지', 'site_kind': 'AGGREGATE'}], rules) == []


def test_site_name_distinct_qualifier_not_contained():
    import home
    rules = CFG['independent']['keys']['site_name_rules']
    pl = {'name': '효창공원앞역', 'region': '서울특별시', 'municipality': '용산구'}
    assert home.site_matches(pl, [{'site_name': '용산구 효창공원앞역 북측', 'site_kind': 'SITE'}], rules) == []


def test_agency_notice_first_recruitment_only(tmp_path, monkeypatch):
    import copy
    d = tmp_path / 'sh'
    d.mkdir()
    (d / '목록.csv').write_text(
        '﻿기관,공고구분,제목,공고일,공고번호,상세URL,게시부서,정정여부,지명일치,상세저장파일,공고문저장파일\n'
        'SH,분양,[정정] 마곡지구 17단지 입주자모집공고,2026-03-02,2,u2,,정정,,,\n'
        'SH,분양,마곡지구 17단지 입주자모집공고,2026-03-01,1,u1,,,,,\n'
        'SH,임대,마곡지구 17단지 잔여세대 입주자 모집공고,2026-05-01,3,u3,,,,,\n'
        'SH,임대,마곡 상가 당첨결과 발표,2026-05-02,4,u4,,,,,\n', encoding='utf-8')
    cfg = copy.deepcopy(CFG)
    c = cfg['independent']['sources']['agency_notice']
    c['dir'] = str(tmp_path)
    c['lists'] = [dict(c['lists'][0], path='sh/목록.csv')]
    monkeypatch.setattr(common, 'ROOT', '/')
    R = fake_run({'PRO_a': {'name': 'x'}})
    R.cfg = cfg
    X = ind.Indep()
    X.urls = {}
    ind.load_agency(R, X)
    # 정정은 같은 묶음(최초 공고일 하나), 잔여세대·결과 발표는 공급 근거가 아님
    assert [(r['공고번호'], n) for _, _, _, r, n, _ in X.agency] == [('1', 2)]


def test_pre_completion_and_pre_supply_rules():
    R = fake_run({'PRO_a': {'name': 'x'}})
    k = keyd(block_key=True, district='가', base='가', blocks=['A1'], block='A1', nb='A1')
    pdf = lambda start, end: dict(src='lh_pdf', file='f.pdf', fields={'착공일': start, '준공일': end})
    # 착공했고 준공일이 기준일(2026-07-01) 뒤 → 06 미도달(파생 RULE, '파생: 04 준공 전')
    ind.pre_completion_06(R, 'PRO_a', k, {'lh_pdf': [pdf('2024-05-01', '2027-03-31')]})
    r = stage_rows(R, '06')[0]
    assert r['대조'] == '미도달 확인' and common.BASIS_EN[r['대조_성격']] == 'RULE'
    assert '파생: 04 준공 전(준공예정 2027-03' in r['비고']
    # 준공일이 기준일 전이거나 사용검사일이 있으면 미도달 아님
    R = fake_run({'PRO_a': {'name': 'x'}})
    ind.pre_completion_06(R, 'PRO_a', k, {'lh_pdf': [pdf('2023-01-01', '2026-04-30')]})
    hub = dict(src='hub_basic', file='h.zip', fields={'착공_일': '20240101', '사용_검사_예정_일': '20280101', '사용_검사_일': '20260901'})
    ind.pre_completion_06(R, 'PRO_a', k, {'hub_basic': [hub]})
    assert stage_rows(R, '06') == []
    # 공급계획 공급예정이 공고 원천 기준일 뒤 + 공고 없음 → 05 미도달(파생), 비고에 사전청약이면 범위 밖
    plan = lambda m, note='': dict(src='lh_supply_plan', file='p.xls', fields={'month': m, 'note': note})
    R = fake_run({'PRO_a': {'name': 'x'}})
    ind.pre_supply_05(R, 'PRO_a', k, {'lh_supply_plan': [plan('2026년12월')]}, {'05': {'lh_supply_plan'}})
    r = stage_rows(R, '05')[0]
    assert r['대조'] == '미도달 확인' and '파생: 공급계획상 공급 전(공급예정 2026-12' in r['비고']
    for recs, found in (([plan('2026년12월', "'22년 사전청약")], {}), ([plan('2026년09월')], {}),
                        ([plan('2026년12월')], {'05': {'lh_supply_plan', 'applyhome_x'}})):
        R = fake_run({'PRO_a': {'name': 'x'}})
        ind.pre_supply_05(R, 'PRO_a', k, {'lh_supply_plan': recs}, found)
        assert stage_rows(R, '05') == []


def test_plan_value_shown_as_plan():
    c = CFG['independent']['sources']['lh_supply_plan']
    assert ind.show_value(c, '공급예정시기', '2026년12월') == '계획 공급예정시기 2026-12(한국토지주택공사)'
    assert ind.show_value(c, '총세대수', '630') == '총세대수 630'


def test_row_level_attribution_overrides_document_rule():
    import evidence
    R = fake_run({'PRO_a': {'name': '용산 캠프킴', 'program': 'P', 'region': '서울특별시', 'municipality': '용산구'}})
    R.policy = {'policy_id': 'POL_T', 'slug': 'A-1', 'home_policy_id': 'H', 'canonical_url': None, 'docs_dir': 'd/원본/A-1'}
    R.D = {'home_program_mapping': []}
    R.prog_check = {}
    row = {'site_name': '용산 캠프킴', 'site_kind': 'SITE', 'doc_path': 'd/원본/A-1+B-2_후속_z/j.pdf', 'page': 3, 'quote': 'q'}
    R.sites = [dict(row, attribution_status='귀속', policy_attribution=['POL_T'])]
    assert evidence.link_rows(R)[0]['verdict'] == 'MATCH'  # 다부모 문서라도 행 단위 귀속이면 쓴다
    R.sites = [dict(row, doc_path='d/원본/A-1/a.pdf', attribution_status='다른 정책 귀속', policy_attribution=['POL_X'])]
    assert evidence.link_rows(R)[0]['verdict'] == 'UNVERIFIED'  # 다른 정책 귀속이면 원문 폴더여도 쓰지 않는다
    R.sites = [dict(row, attribution_status='공통', policy_attribution=None)]
    assert evidence.link_rows(R)[0]['verdict'] == 'UNVERIFIED'  # 공통 → 문서 규칙(다부모 후속은 공통 언급)


def test_lh_rule_05_needs_old_notice_window_and_recent_approval():
    k = keyd(block_key=True, district='가', base='가', blocks=['A1'], block='A1', nb='A1', developer='LH')
    hub = lambda d: dict(src='hub_basic', file='h.zip', fields={'승인_일': d})
    later = lambda code: []
    R = fake_run({'PRO_a': {'name': 'x'}})
    ind.lh_rule_05(R, 'PRO_a', k, {'hub_basic': [hub('20211230')]}, {}, later)
    assert stage_rows(R, '05') == []  # 2019~2023 목록이 없으면(manifest 없음) 쓰지 않는다
    R = fake_run({'PRO_a': {'name': 'x'}})
    R.S.indep.lh_old = []
    ind.lh_rule_05(R, 'PRO_a', k, {'hub_basic': [hub('20211230')]}, {}, later)
    assert [r['대조'] for r in stage_rows(R, '05')] == ['미도달 확인'] and stage_rows(R, '05')[0]['대조_성격'] == '독립 원천 대조'
    assert '파생: 05 미도달' in stage_rows(R, '06')[0]['비고']
    R = fake_run({'PRO_a': {'name': 'x'}})
    R.S.indep.lh_old = []
    ind.lh_rule_05(R, 'PRO_a', k, {'hub_basic': [hub('20181230')]}, {}, later)
    assert stage_rows(R, '05') == [] and '범위 밖' in R.indep_why[(R.subject_id('PRO_a'), '05')]


def test_date_normalization_zero_pad():
    for a, b in (('2026.7.23', '2026-07-23'), ('2026/7/3', '2026-07-03'), ('2026년 7월 23일', '20260723'),
                 ('2026년12월', '2026-12'), ('2026.07', '202607')):
        assert common.digits_date(a) == common.digits_date(b)
    assert common.same_date('2026-07-23', '2026.7.23') and common.same_period('2026-07', '2026.7.23')
    assert common.digits_date('27-10-31', True) == '20271031'


def test_applyhome_address_and_brand_name():
    k = keyd(block_key=True, district='평택고덕국제화계획 (', base='평택고덕국제화계획', blocks=['A65'], block='A65', nb='A65',
             region='경기도', muni='평택시', units=837)
    nm, addr = '힐스테이트 고덕엘리스트 A65BL 공공분양주택', '경기도 평택시 고덕동 고덕면 일원(평택고덕국제화계획지구 A65BL)'
    assert ind._text_hit(k, nm + ' ' + addr, addr, addr)  # 공급위치 괄호 속 지구·블록
    assert ind.applyhome_brand_hit(k, nm, '경기도 평택시 고덕동 일원', 837)  # 브랜드 단지명 + 세대수 일치
    assert not ind.applyhome_brand_hit(k, nm, '경기도 평택시 고덕동 일원', 900)  # 세대수가 다르면 잇지 않음
    assert not ind.applyhome_brand_hit(dict(k, nb='A64', block='A64'), nm, '경기도 평택시 고덕동 일원', 837)


def test_type_guard_rejects_other_project_type():
    import engine as eng
    R = eng.Run.__new__(eng.Run)
    R.projects = {'PRO_a': {'payload': {'program': '도심 공공주택 복합사업', 'name': '연신내역', 'planned_units': None}}}
    tg = CFG['independent']['type_guard']
    r = {'project_id': 'PRO_a', '원본_값': '구역명칭 연신내구역 · 사업유형 2)재개발(도시정비) · 공급 예정 세대수 77', '원본_위치': ''}
    assert '사업 유형' in R.type_conflict(tg, r)
    R.projects['PRO_a']['payload'] = {'program': '노후청사·공공부지', 'name': 'x', 'planned_units': 1000}
    r2 = dict(r, 원본_값='세대수 77', 원본_위치='키: 이름')
    assert '세대수 규모' in R.type_conflict(tg, r2)
    assert R.type_conflict(tg, dict(r2, 원본_값='세대수 900')) == ''


def test_confirmed_verdict_requires_document():
    import evidence
    r = {'verdict': 'MATCH', 'basis': 'INDEPENDENT', 'doc_url': None, 'doc_path': None, 'notes': 'x'}
    out = evidence.require_doc(r)
    assert out['verdict'] == 'UNVERIFIED' and out['basis'] is None and '근거 문서 없음' in out['notes']
    assert evidence.require_doc(dict(r, doc_path='a.pdf'))['verdict'] == 'MATCH'
