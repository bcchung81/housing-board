"""tools/research/chain/gosi.py(토지이음 고시 조회·대조) 시험 — 네트워크 없이, 저장된 HTML·PDF 고정 입력.

- 목록·상세 HTML 파서, 고시 종류(제목 → 단계).
- 문자열 게이트: 지구+블록(블록 고시)·지구명(지구 고시)·이름(더 긴 다른 사업 이름이 있으면 그 사업 것), 사업 유형별 종류.
- 최초/변경 구분: 제목·게시 본문은 '승인'인데 첨부 고시문은 '변경승인'이면 첨부 기준.
- HOME 값 대조(MATCH/MISMATCH/SOURCED), 검색 범위 밖이면 ABSENT_CONFIRMED 가 아님.
- 캐시가 있으면 다시 부르지 않음, manifest 는 u1_ 항목만 더함.
- 코드·규칙에 정책 고유 문자열 없음, 같은 입력이면 출력이 바이트까지 같음.
"""
import json
import os
import re
import sys
from types import SimpleNamespace

import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
CHAIN = os.path.join(ROOT, 'tools', 'research', 'chain')
FIX = os.path.join(ROOT, 'tests', 'fixtures', 'gosi')
sys.path.insert(0, CHAIN)

import common  # noqa: E402
import gosi  # noqa: E402
from common import load_config  # noqa: E402

G = load_config('gosi_rules.json')
CFG = load_config('stage_sources.json')
KIND = {k['id']: k for k in G['kinds']}


def fixture_text(name):
    with open(os.path.join(FIX, name), 'rb') as f:
        return f.read().decode(G['source']['encoding'], 'replace')


def keys(**pl):
    pl.setdefault('region', '경기도')
    return gosi.subject_keys(CFG, G, pl)


# ---------------------------------------------------------------- 파서·종류

def test_parse_detail_fields_without_contact():
    d = gosi.parse_detail(fixture_text('detail_change.html'))
    assert d['gosino'].endswith('고시 제2022-744호') and re.fullmatch(r'\d{4}-\d{2}-\d{2}', d['date'])
    assert d['dept'] and d['title'] and '고시합니다' in d['body']
    assert len(d['attachments']) == 1 and d['attachments'][0][0].endswith('.pdf')
    assert not common.PHONE_RE.search(json.dumps(d, ensure_ascii=False))  # 문의처(전화)는 읽지 않는다


def test_parse_list_rows():
    rows = gosi.parse_list(fixture_text('list_sample.html'))
    assert rows and all(r['seq'].isdigit() and re.fullmatch(r'\d{4}-\d{2}-\d{2}', r['date']) and r['title'] for r in rows)
    assert all('고시' in r['gosino'] for r in rows)


def test_kind_of_titles():
    k = lambda t: (gosi.kind_of(G, t) or {}).get('id')  # noqa: E731
    assert k('공공주택건설 사업계획 변경승인(가나 A-1BL)') == 'HOUSING_PLAN_APPROVAL'
    assert k('가나 공공주택지구 B-1블록 주택건설사업계획승인 고시') == 'HOUSING_PLAN_APPROVAL'
    assert k('공공주택건설 사업계획 승인 취소(가나 A-1BL)') == 'CANCEL'
    assert k('가나역 도심 공공주택 복합지구 복합사업계획 승인 및 지형도면 등의 고시') == 'COMPLEX_PLAN_APPROVAL'
    assert k('서울 가나역 인근 도심 공공주택 복합지구의 지정 및 지형도면등의 고시') == 'COMPLEX_DISTRICT'
    assert k('가나 공공주택지구 지구지정 변경(4차) 및 지구계획 변경(4차) 승인') == 'DISTRICT_DESIGNATION'
    assert k('가나 공공주택지구 지구계획 변경(3차) 및 주택지구 밖 사업 승인') == 'DISTRICT_PLAN'
    assert k('가나 재건축 정비계획 결정 및 정비구역 지정 고시') == 'REDEVELOPMENT_ZONE'
    assert k('도시관리계획(수도공급설비) 결정 및 지형도면 고시 (가나 공공주택지구 지구 외)') is None


# ---------------------------------------------------------------- 게이트

def test_gate_block_key():
    k = keys(name='가나다 A-1BL 아파트 건설공사', district='가나다(공공주택)', block='A-1')
    blk, dis = KIND['HOUSING_PLAN_APPROVAL'], KIND['DISTRICT_DESIGNATION']
    assert k['block_key'] and k['tokens'] == ['가나다']
    assert gosi.gate(k, blk, '공공주택건설 사업계획 승인(가나다 A-1BL)')
    assert gosi.gate(k, blk, '가나다 공공주택지구 A1블록 주택건설사업계획 변경 승인 고시')
    assert not gosi.gate(k, blk, '공공주택건설 사업계획 승인(가나다 A-10BL)')
    assert not gosi.gate(k, blk, '공공주택건설 사업계획 승인(가나다2 A-1BL)')  # 지구명 뒤 숫자 = 다른 지구
    assert gosi.gate(k, dis, '가나다 공공주택지구 지정 변경(2차)')
    assert not gosi.gate(k, dis, '가나다2 공공주택지구 지정')


def test_gate_name_key_prefers_longer_other_name():
    short = keys(name='라마바역', region='서울특별시')
    longer = keys(name='라마바역 북측', region='서울특별시')
    title = '서울 라마바역 북측 도심 공공주택 복합지구의 지정 및 지형도면등의 고시'
    others = sorted(set(short['names'] + longer['names']))
    assert not short['block_key'] and short['tokens'] == ['라마바역']
    assert gosi.gate(short, KIND['COMPLEX_DISTRICT'], title, others) is None
    assert gosi.gate(longer, KIND['COMPLEX_DISTRICT'], title, others)
    assert gosi.gate(short, KIND['COMPLEX_DISTRICT'], '서울 라마바역 인근 도심 공공주택 복합지구의 지정', others)


def test_hangul_block_from_name_is_a_name_key():
    k = keys(name='가나 다라2', municipality='가나시')
    assert not k['block_key'] and k['tokens'] == ['다라2'] and '가나다라2' in k['names']


def test_program_limits_kinds_and_region_filter():
    assert 'REDEVELOPMENT_ZONE' not in gosi.allowed_kinds(G, '도심 공공주택 복합사업')
    assert gosi.allowed_kinds(G, '알 수 없는 유형') == set(KIND)
    assert gosi.region_ok(G, '경기도 가나시 고시 제2025-1호', '경기도 가나시', '경기도')
    assert not gosi.region_ok(G, '충청남도 가나군 고시 제2025-1호', '충청남도 가나군', '경기도')
    assert gosi.region_ok(G, '국토교통부 고시 제2025-1호', '서울특별시 가나구', '서울특별시')


# ---------------------------------------------------------------- 최초/변경

def test_change_from_body_and_attachment():
    ini = gosi.parse_detail(fixture_text('detail_initial.html'))
    ch = gosi.parse_detail(fixture_text('detail_change.html'))
    assert gosi.change_of(G, ini['body']) == '최초'
    assert gosi.change_of(G, ch['body']) == '변경'


def test_title_approval_but_gosi_text_change():
    """제목·게시 본문은 '승인', 첨부 고시문(관보)은 '변경승인' → 첨부 기준 변경."""
    d = gosi.parse_detail(fixture_text('detail_title_approval_body_change.html'))
    assert gosi.kind_of(G, d['title'])['id'] == 'HOUSING_PLAN_APPROVAL' and '변경' not in d['title']
    assert gosi.change_of(G, d['body']) == '최초'
    txt = gosi.attach_text(os.path.join(FIX, 'attach_title_approval_body_change.pdf'), 'pdf', G['attachments']['pdf_pages'])
    assert gosi.change_of(G, txt) == '변경'


# ---------------------------------------------------------------- HOME 대조

def test_compare_home():
    c = lambda g, d, hv: gosi.compare_home(G, g, d, hv)[0]  # noqa: E731
    assert c('최초', '2025-12-30', []) == 'SOURCED'
    assert c('최초', '2025-12-30', [('최초', '2025-12-30', '고시일', 'h')]) == 'MATCH'
    assert c('변경', '2025-12-30', [('최초', '2025-12-30', '고시일', 'h')]) == 'MISMATCH'  # 같은 날, 구분 다름
    assert c('최초', '2025-12-30', [('최초', '2025-11-03', '고시일', 'h')]) == 'MISMATCH'
    assert c('최초', '2025-12-30', [('최초', '2025-12-24', '승인일', 'h')]) == 'MATCH'  # 승인일은 고시일보다 앞 14일 안
    assert c('변경', '2025-12-30', [('최초', '2024-12-31', '고시일', 'h')]) == 'SOURCED'  # 비교할 같은 구분 값 없음


# ---------------------------------------------------------------- 미도달 판단 범위

def absent_ctx(**e):
    base = dict(codes={'03'}, refs=['R'], order=set(), order_rows=[], positive=set(), in_ledger=True)
    base.update(e)
    return SimpleNamespace(G=G, T={'S': base})


def lists_for(token, titles, truncated=False):
    items = [dict(seq=str(i), date='2025-01-01', gosino='국토교통부 고시 제2025-%d호' % i, title=t, org='국토교통부', tag='')
             for i, t in enumerate(titles)]
    return {token: dict(rec=dict(truncated=truncated, result_count=len(items), pages=['p1'], fetched_at='2026-01-01T00:00:00Z'),
                        items=items, code='03')}


def test_absent_only_when_scope_covers():
    k = keys(name='가나다 A-1BL', district='가나다', block='A-1')
    seen = lists_for('가나다', ['가나다 공공주택지구 지정 변경(2차)', '공공주택건설 사업계획 승인(가나다 A-2BL)'])
    assert gosi.absent_reason(absent_ctx(), 'S', '03', k, seen) is None  # 지구는 보이고 블록 고시 없음 → 미도달 확인
    assert gosi.absent_reason(absent_ctx(), 'S', '03', k, lists_for('가나다', ['라마바 공공주택지구 지정']))  # 지구 표기 안 보임
    assert gosi.absent_reason(absent_ctx(), 'S', '03', k, lists_for('가나다', ['가나다 공공주택지구 지정'], truncated=True))
    assert gosi.absent_reason(absent_ctx(order={'03'}), 'S', '03', k, seen)  # 단계 순서 모순
    assert gosi.absent_reason(absent_ctx(positive={'04'}), 'S', '03', k, seen)  # 뒤 단계 근거
    assert gosi.absent_reason(absent_ctx(), 'S', '03', k, {})  # 미조회
    assert gosi.absent_reason(absent_ctx(codes={'02'}), 'S', '02', k, seen)  # 02 는 미도달로 보지 않음
    nk = keys(name='라마바역', region='서울특별시')
    assert gosi.absent_reason(absent_ctx(), 'S', '03', nk, lists_for('라마바역', []))  # 이름 키


# ---------------------------------------------------------------- 캐시·manifest

def tmp_store(tmp_path):
    cfg = json.loads(json.dumps(CFG))
    cfg['paths']['research_dir'] = str(tmp_path)
    g = json.loads(json.dumps(G))
    g['source']['delay_sec'] = 0
    P = gosi.Paths(cfg, g)
    for code in P.codes():
        os.makedirs(os.path.dirname(P.manifest(code)), exist_ok=True)
        with open(P.manifest(code), 'w', encoding='utf-8') as f:
            f.write(json.dumps({'source': 's', 'files': {'old': {'filename': 'a.html', 'sha256': 'x'}}},
                               ensure_ascii=False, indent=1) + '\n')
    return g, P, gosi.Store(P, g)


def test_cache_reuse_and_manifest_append(tmp_path):
    g, P, S = tmp_store(tmp_path)
    body = open(os.path.join(FIX, 'list_sample.html'), 'rb').read()
    calls = []

    def opener(req):
        calls.append(req.full_url)
        return 200, {'Content-Type': 'text/html; charset=euc-kr'}, body
    H = gosi.Http(g, budget=5, opener=opener)
    rec, new = gosi.fetch_query(H, S, g, '03', '가나다', False, 3)
    assert new and len(calls) == 1 and rec['pages'] and not rec['truncated']
    rec2, new2 = gosi.fetch_query(gosi.Http(g, budget=0, opener=opener), S, g, '03', '가나다', False, 3)
    assert not new2 and rec2 == rec and len(calls) == 1  # 캐시: 부르지 않음(한도 0 이어도)
    S.write_manifests()
    m = json.load(open(P.manifest('03'), encoding='utf-8'))
    assert m['files']['old'] == {'filename': 'a.html', 'sha256': 'x'}
    assert [k for k in m['files'] if k != 'old'] and all(k.startswith(g['store']['key_prefix']) for k in m['files'] if k != 'old')
    assert json.load(open(P.manifest('02'), encoding='utf-8'))['files'] == {'old': {'filename': 'a.html', 'sha256': 'x'}}


def test_blocked_response_stops(tmp_path):
    g, P, S = tmp_store(tmp_path)
    H = gosi.Http(g, budget=5, opener=lambda req: (200, {}, '<html>로그인이 필요합니다</html>'.encode('cp949')))
    with pytest.raises(gosi.Blocked):
        gosi.fetch_query(H, S, g, '03', '가나다', False, 3)


# ---------------------------------------------------------------- 정책 고유 문자열 없음

def forbidden_strings():
    out = set()
    for p in load_config('policies.json')['policies']:
        out |= {p['policy_id'], p['announced'], p['canonical_url'], p['name'], p['slug'], p['home_policy_id'],
                p['name'].split(' (')[0]}
        path = os.path.join(ROOT, 'docs/speech/research/dataset/_work', p['policy_id'], 'policy_sites.jsonl')
        if os.path.exists(path):
            for line in open(path, encoding='utf-8'):
                row = json.loads(line)
                if len(common.nz(row.get('site_name'))) >= 3:
                    out.add(row['site_name'])
    return {s for s in out if s}


def test_no_policy_specific_strings_in_code_and_rules():
    bad = forbidden_strings()
    assert len(bad) > 10
    for rel in ('gosi.py', 'config/gosi_rules.json'):
        text = open(os.path.join(CHAIN, rel), encoding='utf-8').read()
        hits = sorted(s for s in bad if s in text)
        assert hits == [], '%s 에 정책 고유 문자열: %s' % (rel, hits)
        assert not re.search(r'PRJ-\d|PRO_[0-9a-f]{6}|POL_\d{4}|seq=\d{4,}', text), rel


# ---------------------------------------------------------------- 재실행 바이트 동일

def test_rerun_byte_identical():
    cfg, g, pols = gosi.load_all()
    done = [x for x in pols if os.path.exists(common.p('%s/%s/evidence_gosi.jsonl' % (cfg['paths']['work_dir'], x['policy_id'])))]
    if not done:
        pytest.skip('evidence_gosi.jsonl 없음(gosi.py 를 아직 돌리지 않음)')
    home = gosi.Home(cfg, g)
    ledger = gosi.ledger_ids(g)
    names = gosi.all_target_names(cfg, g, pols, home)
    pol = done[0]

    def dump():
        rows, _ = gosi.build(gosi.Ctx(cfg, g, pol, home, ledger, names))
        return ''.join(json.dumps(common.scrub_json(r), ensure_ascii=False) + '\n' for r in rows).encode('utf-8')
    a = dump()
    assert a == dump()
    path = common.p('%s/%s/evidence_gosi.jsonl' % (cfg['paths']['work_dir'], pol['policy_id']))
    assert a == open(path, 'rb').read()
