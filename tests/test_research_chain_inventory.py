"""tools/research/chain/inventory.py(팀 수집 관리표 ↔ 우리 원천 대조, 수집항목 중복 제거) 시험 — 네트워크 없이, 작은 고정 입력.

- 관리표 몇 행을 흉내 낸 작은 xlsx 를 시험 안에서 openpyxl 로 만든다(사람 이름·연락처는 지어낸 값).
- 관리ID 가 하나도 빠지지 않고 두 번 들어가지 않는다.
- 같은 원천·같은 요소는 합치고(R1 같은 이름, R2 같은 API 오퍼레이션, R3 정규화 이름, R4 같은 URL 출처ID), 다른 원천은 합치지 않는다.
- 출력에 이름·전화번호가 없다. 같은 입력이면 출력이 바이트까지 같다. 코드에 정책 고유 문자열이 없다.
"""
import csv
import json
import os
import re
import shutil
import sys

import pytest

openpyxl = pytest.importorskip('openpyxl')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHAIN = os.path.join(ROOT, 'tools', 'research', 'chain')
sys.path.insert(0, CHAIN)

import inventory  # noqa: E402

FAKE_NAME, FAKE_PHONE = '가나다', '-'.join(['02', '123', '4567'])  # 지어낸 값(파일에 전화번호 모양을 두지 않는다)
ROW_HEAD = ['관리ID', '단계', '수집분야', '세부주제', '수집 후보 데이터·자료명', '필요 세부 필드·내용', '연계·활용 목적', '주요 연계 단계',
            '통합 출처ID', '제공 기관', '원천 사이트·자료명', '원천 부서·문의처', '공개 연락처', '수집 경로·형식', '공식 원천 URL',
            '원천 안내 확인수준', '실제 자료 수집상태', 'API·파일 테스트', '개별 사업 연결키 후보', '연결 가능 단위', '적용 검증 규칙',
            '수집 제약·추가 확인사항', '자료 기준 지역', '갱신 주기·시점', '내부 수집 담당자', '수집·검증 메모', '최종 확인일', '원본 출처ID', '원본 관리표']
SITE_HEAD = ['통합 출처ID', '제공 기관', '공식 원천명', '소관 부서·담당범위', '공개 연락처', '수집 경로·형식', '원천 안내 확인수준', '공식 원천 URL',
             '수집·검증 유의사항', '원본 자료 수집 상태', 'API·파일 동작 확인', '마지막 확인일', '원본 관리표·출처ID', '기관 협조 담당자', '추가 확인·후속 조치']
SITES = [
    ('SRC-001', '가부처', '테스트 대책 보도자료', '주택과(사무관 %s)' % FAKE_NAME, 'PDF/HWPX', 'https://board.example.go.kr/dtl.jsp?id=111'),
    ('SRC-002', '나기관', '청약홈 분양정보 조회 서비스', '데이터부', 'REST API', 'https://www.data.go.kr/data/15098547/openapi.do'),
    ('SRC-003', '가부처', '주택건설실적통계 인허가', '주택과', 'XLS/통계표', 'https://stat.example.go.kr/meta.do?hRsId=9'),
    ('SRC-004', '다기관', '다른 통계 사이트', '통계과', 'XLS/통계표', 'https://other.example.go.kr/stat.do?hRsId=7'),
    ('SRC-005', '가부처', '주택건설 인허가 확정치', '주택과', 'XLS/통계표', 'https://stat.example.go.kr/meta.do?hRsId=9'),
    ('SRC-006', '라기관', '전자관보', '관보과', '웹/PDF', 'https://gwanbo.example.go.kr/main.do'),
]
# (관리ID, 단계, 출처ID, 자료명, 필드, 연결 단위)
ROWS = [
    ('P1-0001', '1 정책', 'SRC-001', '테스트 대책 보도자료 원문', '정책명·발표일', '문서/정책'),
    ('P5-0001', '5 공급', 'SRC-002', '아파트 분양 모집공고 상세', '공고번호', '공고/단지'),
    ('P6-0001', '6 입주', 'SRC-002', '청약홈 분양공고 입주예정월', '입주예정월', '공고/단지'),
    ('P5-0002', '5 공급', 'SRC-002', '아파트 분양주택형 정보', '주택형·세대수', '공고/주택형'),
    ('P1-0003', '1 정책', 'SRC-003', '월별 전체 주택 인허가 건수', '월·호수', '통계/지역'),
    ('P3-0003', '3 인허가', 'SRC-003', '월별 주택 인허가 실적', '기준월·호수', '통계/지역'),
    ('P1-0004', '1 정책', 'SRC-003', '규모별 인허가 실적', '면적·호수', '통계/지역'),
    ('P3-0004', '3 인허가', 'SRC-004', '월별 주택 인허가 실적', '기준월·호수', '통계/지역'),
    ('P6-0004', '6 입주', 'SRC-005', '규모별 허가실적', '면적·호수', '통계/지역'),
    ('P1-0005', '1 정책', 'SRC-006', '공공주택지구 준공 공고', '지구명·준공일', '고시/지구'),
    ('P4-0005', '4 건설', 'SRC-006', '공공주택지구 준공 공고', '지구명·고시번호', '고시/지구'),
    ('P6-0006', '6 입주', 'SRC-006', '학교 운영 상태', '운영상태', '고시/지구'),
    ('P6-0007', '6 입주', 'SRC-006', '학교 설립·운영 상태', '설립일·운영상태', '고시/지구'),
]


def make_xlsx(path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = '통합현황_안내'
    ws.append(['테스트 관리표'])
    ws.append(['2026.10.17  |  수집 후보 인벤토리'])
    ws = wb.create_sheet('전체_1-6단계')
    ws.append(ROW_HEAD)
    src = {s[0]: s for s in SITES}
    for mid, stage, sid, name, field, unit in ROWS:
        s = src[sid]
        rec = {'관리ID': mid, '단계': stage, '수집 후보 데이터·자료명': name, '필요 세부 필드·내용': field, '통합 출처ID': sid,
               '제공 기관': s[1], '원천 사이트·자료명': s[2], '원천 부서·문의처': s[3], '공개 연락처': FAKE_PHONE, '수집 경로·형식': s[4],
               '공식 원천 URL': s[5], '원천 안내 확인수준': '공식 자료 확인', '실제 자료 수집상태': '미수집', 'API·파일 테스트': '미검증',
               '개별 사업 연결키 후보': '키', '연결 가능 단위': unit, '내부 수집 담당자': FAKE_NAME}
        ws.append([rec.get(h) for h in ROW_HEAD])
    ws = wb.create_sheet('원천사이트_통합')
    ws.append(SITE_HEAD)
    for sid, org, name, dept, route, url in SITES:
        rec = {'통합 출처ID': sid, '제공 기관': org, '공식 원천명': name, '소관 부서·담당범위': dept, '공개 연락처': FAKE_PHONE,
               '수집 경로·형식': route, '공식 원천 URL': url, '기관 협조 담당자': FAKE_NAME}
        ws.append([rec.get(h) for h in SITE_HEAD])
    ws = wb.create_sheet('정례브리핑_담당자')
    ws.append(['기관', '소관 부서', '직위', '공개 성명', '공개 전화번호'])
    ws.append(['가부처', '점검팀', '사무관', FAKE_NAME, FAKE_PHONE])
    ws = wb.create_sheet('연계필드_통합')
    ws.append(['연계 구간·구분', '식별자·권장 필드', '필드 의미·설명', '원천 후보·기준', '연결 단위', '검증·주의사항', '원본 시트'])
    ws.append(['정책 자체', 'policy_id', '내부 정책 식별자', '원문', '정책ID', '', ''])
    ws.append(['입주·교육', '학교ID·학구ID', '학교 코드', '표준', '학교', '', ''])
    ws = wb.create_sheet('수집점검_통합')
    ws.append(['해당 단계', '점검 분야', '수집·검증할 작업', '대상 원천 또는 확인 기준', '진행상태·조치사항', '추가 유의사항', '원본 시트'])
    ws.append(['전체', '민감정보 최소화', '개인정보 제외', '전체', None, None, ''])
    wb.save(path)


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False)


def make_repo(root):
    doc = {'doc_id': 'DOC-0000000000000001', 'canonical_url': 'https://board.example.go.kr/dtl.jsp?id=111', 'url_aliases': [],
           'title': 'press.pdf', 'doc_type': 'PRESS_RELEASE', 'format': 'PDF', 'publisher_org': '가부처', 'publisher_dept': None,
           'host_org': None, 'published_at': None, 'collected_at': None, 'collection_method': 'HTTP',
           'local_path': 'docs/speech/research/01.정책/원본/t/press.pdf', 'sha256': '0' * 64, 'bytes': 1, 'parent_doc_id': None,
           'stage_codes': ['01'], 'saved': True, 'not_saved_reason': None, 'source_ref': 'research-chain-dataset', 'notes': None}
    write_json(os.path.join(root, inventory.PATHS['docs']), {'schema_version': 'ledger/1', 'table': 'source_documents', 'rows': [doc]})
    ev = {'evidence_id': 'EV-1', 'doc_id': doc['doc_id'], 'verdict': 'MATCH'}
    write_json(os.path.join(root, inventory.PATHS['evidence']), {'schema_version': 'ledger/1', 'table': 'evidence', 'rows': [ev]})
    led = {'source_ref': 'datagokr-15098547', 'source_owner': 'HOUSING_WAVE', 'provider': '나기관', 'dataset_name': '15098547 분양정보',
           'source_url': 'https://www.data.go.kr/data/15098547/openapi.do', 'original_filename': 'getAPTLttotPblancDetail.json',
           'used_by': ['/']}
    write_json(os.path.join(root, inventory.PATHS['ledger']), {'schema_version': 'ledger/1', 'table': 'sources', 'rows': [led]})
    raw = os.path.join(root, 'schemas', 'ledger-2026-10', 'raw', 'applyhome')
    write_json(os.path.join(raw, 'manifest.json'), {'source': '청약홈 분양정보 조회 서비스(15098547)', 'endpoint': []})
    write_json(os.path.join(raw, 'getAPTLttotPblancDetail.json'), {'rows': []})
    write_json(os.path.join(root, 'schemas', 'ledger-2026-10', 'raw', 'extra-only', 'manifest.json'), {'source': '관리표에 없는 원천'})
    write_json(os.path.join(root, 'schemas', 'ledger-2026-10', 'raw', 'extra-only', 'data.json'), {'rows': []})
    owner = os.path.join(root, inventory.PATHS['owner'])
    with open(owner, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(['단계', '원천', '게시처'])
        w.writerow(['05', '청약홈 분양정보 조회 서비스(15098547)', '공공데이터포털'])
    shutil.copytree(os.path.join(ROOT, 'schemas', 'ledger'), os.path.join(root, 'schemas', 'ledger'))


@pytest.fixture
def setup(tmp_path):
    root = str(tmp_path / 'repo')
    make_repo(root)
    xlsx = str(tmp_path / 'sheet.xlsx')
    make_xlsx(xlsx)
    return root, xlsx, tmp_path


def read(path):
    with open(path, encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


def items_of(out):
    rows = read(os.path.join(out, inventory.ITEM_CSV))
    return {mid: r['항목ID'] for r in rows for mid in r['관리표_관리ID들'].split(' · ')}, rows


def test_every_id_exactly_once_and_merges(setup):
    root, xlsx, tmp = setup
    out = str(tmp / 'out')
    inventory.run(xlsx, root, out)
    where, rows = items_of(out)
    got = [m for r in rows for m in r['관리표_관리ID들'].split(' · ')]
    assert sorted(got) == sorted(r[0] for r in ROWS) and len(got) == len(set(got))
    assert where['P5-0001'] == where['P6-0001']  # R2 같은 API 오퍼레이션
    assert where['P5-0002'] != where['P5-0001']  # 다른 오퍼레이션
    assert where['P1-0003'] == where['P3-0003']  # R3 정규화 이름
    assert where['P1-0005'] == where['P4-0005']  # R1 같은 이름
    assert where['P1-0004'] == where['P6-0004']  # R4 같은 URL 의 다른 출처ID + R3
    assert where['P3-0004'] != where['P3-0003']  # 다른 원천은 합치지 않는다
    by = {r['항목ID']: r for r in rows}
    assert by[where['P6-0006']]['중복_판정'] == by[where['P6-0007']]['중복_판정'] == '중복 후보'  # R5 합치지 않고 표시
    assert where['P6-0006'] != where['P6-0007']
    op = by[where['P5-0001']]
    assert op['우리_수집상태'] == '원장 raw' and 'getAPTLttotPblancDetail' in op['제안_근거']
    assert by[where['P5-0002']]['우리_수집상태'] == '미수집'  # 그 오퍼레이션 원본은 없음
    assert by[where['P1-0001']]['우리_수집상태'] == '보존' and 'MATCH 1' in by[where['P1-0001']]['제안_테스트결과']


def test_sites_both_directions(setup):
    root, xlsx, tmp = setup
    out = str(tmp / 'out')
    inventory.run(xlsx, root, out)
    rows = read(os.path.join(out, inventory.SITE_CSV))
    site = {r['통합출처ID']: r for r in rows if r['통합출처ID'].startswith('SRC-')}
    assert len(site) == len(SITES)
    assert site['SRC-001']['우리_상태'].startswith('원 파일 보존 1건') and site['SRC-001']['evidence 수'] == '1'
    assert 'schemas/ledger-2026-10/raw/applyhome' in site['SRC-002']['우리_상태']
    assert site['SRC-002']['원천주체_행'] == 'r1'
    assert site['SRC-006']['우리_상태'] == '미수집'
    assert site['SRC-001']['소관부서'] == '주택과'
    unlisted = [r for r in rows if r['통합출처ID'] == '관리표 미수록']
    assert any('extra-only' in r['공식URL'] for r in unlisted)
    links = read(os.path.join(out, inventory.LINK_CSV))
    assert [r['대응'] for r in links] == ['같음', '없음']


def test_no_personal_data_in_outputs(setup):
    root, xlsx, tmp = setup
    out = str(tmp / 'out')
    inventory.run(xlsx, root, out)
    for f in sorted(os.listdir(out)):
        text = open(os.path.join(out, f), encoding='utf-8-sig').read()
        assert FAKE_NAME not in text and FAKE_PHONE not in text, f
        assert not inventory.common.PHONE_RE.search(text), f


def test_rerun_byte_identical(setup):
    root, xlsx, tmp = setup
    outs = []
    for k in ('a', 'b'):
        out = str(tmp / k)
        inventory.run(xlsx, root, out)
        outs.append({f: open(os.path.join(out, f), 'rb').read() for f in sorted(os.listdir(out))})
    assert outs[0] == outs[1] and len(outs[0]) == 4


def test_tokens_normalization():
    t = inventory.tokens
    assert t('월별 전체 주택 인허가 건수') == t('월별 주택 인허가 실적')
    assert t('공공·민간 인허가 실적') == t('사업주체별 인허가 통계')
    assert t('아파트·비아파트 허가실적', '주택건설실적통계 인허가') == t('주택 유형별 인허가 실적', '주택건설실적통계 인허가')
    assert t('정비구역 지정·해제') != t('정비구역 지정·변경')


def test_link_map_targets_exist_in_schema():
    cols = inventory.schema_columns(ROOT)
    for _pat, target, _kind, _note in inventory.LINK_MAP:
        for tc in [x.strip() for x in target.split('·') if x.strip()]:
            t, c = tc.split('.', 1)
            assert c in cols.get(t, set()), tc


def test_no_policy_specific_strings_in_code():
    with open(os.path.join(CHAIN, 'config', 'policies.json'), encoding='utf-8') as f:
        pols = json.load(f)['policies']
    needles = {'0907', '9-7', 'POL_20'}
    for x in pols:
        needles |= {x['policy_id'], x['slug'], x['announced'], x['canonical_url'], x['home_policy_id']}
        needles |= set(re.findall(r'id=(\d+)', x['canonical_url']))
    text = open(os.path.join(CHAIN, 'inventory.py'), encoding='utf-8').read()
    assert sorted(n for n in needles if n and n in text) == []


def test_no_source_ids_or_site_urls_in_code():
    """규칙(출처ID·사이트 URL·호스트·데이터셋 번호·raw 경로)은 config/inventory_rules.json 에만 둔다."""
    text = open(os.path.join(CHAIN, 'inventory.py'), encoding='utf-8').read()
    bad = re.findall(r'SRC-\d|https?://\w|www\.\w|\.go\.kr|\.or\.kr|\.co\.kr|data\.go|(?<!\d)1\d{7}(?!\d)|ledger-\d{4}-\d{2}', text)
    assert bad == []
    rules = json.load(open(os.path.join(CHAIN, 'config', inventory.RULES_FILE), encoding='utf-8'))
    assert all(a.get('why') for a in rules['aliases'])
    assert all(o.get('name') and 'why' in o for v in rules['operations'].values() for o in v['ops'])
    assert all(r.get('why') and r.get('when') for r in rules['judge_rules'])
