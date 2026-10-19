"""tools/research/chain 출력 단계(P9) — URL 정규화, 문서 목록(sha 합치기·파생물 제외·첨부), doc_id 안정성, 스키마 검사, 지표.

고정 입력: tests/fixtures/research_chain/repo (작은 연구 폴더·원장 표). 시험마다 임시 폴더에 복사해 실행한다(네트워크 없음).
"""
import json
import os
import shutil
import subprocess
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHAIN = os.path.join(ROOT, 'tools', 'research', 'chain')
FIX = os.path.join(ROOT, 'tests', 'fixtures', 'research_chain')
sys.path.insert(0, CHAIN)

import catalog  # noqa: E402
import emit  # noqa: E402
import ids  # noqa: E402

RULES = ids.load_rules()
RESEARCH = 'docs/speech/research'
P = RESEARCH + '/01.정책/원본/t/press.pdf'


def canon(u):
    return ids.canonical_url(u, RULES)


@pytest.fixture
def repo(tmp_path):
    r = tmp_path / 'repo'
    shutil.copytree(os.path.join(FIX, 'repo'), r)
    shutil.copytree(os.path.join(ROOT, 'schemas', 'ledger'), r / 'schemas' / 'ledger')
    cfg = tmp_path / 'config'
    cfg.mkdir()
    for f in ('url_rules.json', 'domains.json', 'publisher_rules.json'):
        shutil.copy(os.path.join(CHAIN, 'config', f), cfg / f)
    shutil.copy(os.path.join(FIX, 'policies.json'), cfg / 'policies.json')
    return r, cfg


def run(repo, validate=True):
    r, cfg = repo
    return emit.run(repo=str(r), research=RESEARCH, config_dir=str(cfg), ledger_rel='ledger/tables',
                    schemas_rel='schemas/ledger', validate=validate, log=lambda *_: None)


def table(repo, name):
    with open(os.path.join(repo[0], RESEARCH, 'dataset', name + '.json'), encoding='utf-8') as f:
        return json.load(f)['rows']


# ---------- URL 정규화 ----------
def test_url_rules_query_host_fragment():
    a, loc = canon('https://molit.go.kr/USR/NEWS/m_71/dtl.jsp?lcmspage=2&id=95091185#top')
    assert a == 'https://www.molit.go.kr/USR/NEWS/m_71/dtl.jsp?id=95091185' and loc is None   # 별칭 호스트·keep_params·조각 제거
    b, loc = canon('HTTPS://eiec.kdi.re.kr:443/policy/callDownload.do?num=270716&filenum=2&empty=#page=46')
    assert b == 'https://eiec.kdi.re.kr/policy/callDownload.do?filenum=2&num=270716'          # 정렬·빈 값·기본 포트
    assert loc == 'page=46'                                                                     # #page=N 은 locator
    c, _ = canon('https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?panId=1&mi=1027&aisTpCd=05')
    assert c == 'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?aisTpCd=05&panId=1'   # drop_params
    # 퍼센트 인코딩이 달라도 같은 URL
    assert canon('https://www.molit.go.kr/LCMS/DWN.jsp?fold=law&fileName=%EA%B3%A0%EC%8B%9C.hwp')[0] == \
        canon('https://www.molit.go.kr/LCMS/DWN.jsp?fileName=고시.hwp&fold=law')[0]
    # POST 기록은 본문을 같은 규칙으로 정리하고 모양을 지킨다
    d, _ = canon('https://www.eum.go.kr/web/FileDownload.do (POST seq=1&gosi=Y&file=/a/b.pdf)')
    assert d == 'https://www.eum.go.kr/web/FileDownload.do (POST file=/a/b.pdf&gosi=Y&seq=1)'
    assert canon('') == (None, None)


def test_subject_key_reads_old_shapes():
    k = 'PROGRAM_PROJECT|PRG_A|HOME:PRO_1'
    assert ids.subject_key('links', 'PROGRAM_PROJECT:PRG_A:HOME:PRO_1') == k == ids.subject_key('links', k)
    assert ids.subject_key('links', 'POL_T>PRG_A', 'POLICY_PROGRAM') == 'POLICY_PROGRAM|POL_T|PRG_A'
    t = 'POL_T|*|04|11+28|2026-01-01|2026-12-31'
    assert ids.subject_key('policy_targets', 'POL_T:-:04:11,28:2026-01-01:2026-12-31') == t == ids.subject_key('policy_targets', t)
    assert emit.target_key(dict(local_policy_id='POL_T', local_program_id=None, stage_code='04', area_codes=['11', '28'],
                                period_start='2026-01-01', period_end='2026-12-31')) == t


def test_ids_are_stable():
    assert ids.doc_id_for_file('ab' * 32) == 'DOC-' + ('ab' * 8)
    u = 'https://www.molit.go.kr/USR/NEWS/m_71/dtl.jsp?id=1'
    assert ids.doc_id_for_url(u) == ids.doc_id_for_url(u) and ids.doc_id_for_url(u).startswith('URL-')
    e1 = ids.evidence_id('projects', 'PRJ-11110-0001', 'stage_05', 'PRO_1', 'DOC-0', 'p.1')
    assert e1 == ids.evidence_id('projects', 'PRJ-11110-0001', 'stage_05', 'PRO_1', 'DOC-0', 'p.1')
    assert e1 != ids.evidence_id('projects', 'PRJ-11110-0001', 'stage_05', 'PRO_1', 'DOC-0', None)
    assert e1 != ids.evidence_id('projects', 'PRJ-11110-0001', 'stage_05', 'PRO_2', 'DOC-0', 'p.1')   # HOME 레코드마다 한 행


# ---------- 문서 목록 ----------
def test_catalog_merges_same_sha_and_excludes_derived(repo):
    cat = catalog.build(str(repo[0]), RESEARCH, str(repo[1]))
    by_sha = {}
    for r in cat.rows:
        if r['sha256']:
            by_sha.setdefault(r['sha256'], []).append(r)
    assert all(len(v) == 1 for v in by_sha.values()), 'sha256 중복 0'
    press = next(r for r in cat.rows if r['local_path'] == P)
    # 같은 바이트(01 원문 + 02 재게시 사본) → 한 행, 정부 원 게시처 URL 이 canonical, 재게시 URL 은 별칭
    assert press['doc_id'] == ids.doc_id_for_file(press['sha256'])
    assert press['canonical_url'].startswith('https://www.molit.go.kr/portal/common/download/DownloadMltm2.jsp?FilePath=')
    assert 'https://eiec.kdi.re.kr/policy/callDownload.do?num=1&filenum=2' in press['url_aliases']
    assert 'copy.pdf' in press['notes']
    assert press['doc_type'] == 'PRESS_RELEASE' and press['publisher_org'] == '국토교통부' and press['publisher_dept'] == '시험과'
    assert press['published_at'] == '2026-01-01' and press['stage_codes'] == ['01', '02']
    paths = {r['local_path'] for r in cat.rows}
    assert not any('발췌_' in (p or '') or (p or '').endswith('manifest.json') or (p or '').endswith('t0.txt') for p in paths)
    derived = {row[0]: row for row in catalog.derived_rows(cat)}
    assert derived[RESEARCH + '/02.사업화/원본/발췌_시험.csv'][4] == press['doc_id']   # 파생물 → 원천 문서
    assert derived[RESEARCH + '/01.정책/원본/t_exa/t0.txt'][1] == 'Exa 응답 본문 텍스트'
    exa = next(r for r in cat.rows if (r['local_path'] or '').endswith('s.json'))
    assert (exa['doc_type'], exa['collection_method']) == ('API_RESPONSE', 'EXA_SEARCH')


def test_catalog_attachments_and_url_docs(repo):
    cat = catalog.build(str(repo[0]), RESEARCH, str(repo[1]))
    rows = {r['doc_id']: r for r in cat.rows}
    page = next(r for r in cat.rows if (r['local_path'] or '').endswith('page.html'))
    saved = next(r for r in cat.rows if (r['local_path'] or '').endswith('attach/1/a.pdf'))
    unsaved = next(r for r in cat.rows if r['canonical_url'] == 'https://apply.lh.or.kr/lhapply/lhFile.do?fileid=12')
    assert saved['parent_doc_id'] == page['doc_id'] == unsaved['parent_doc_id']
    assert (unsaved['saved'], unsaved['not_saved_reason'], unsaved['format'], unsaved['local_path']) == (False, '용량 제한으로 받지 않음', 'HWP', None)
    assert page['doc_type'] == 'RECRUIT_NOTICE' and unsaved['doc_type'] == saved['doc_type'] == 'NOTICE_ATTACHMENT'
    assert unsaved['publisher_dept'] == '시험지역본부' and unsaved['stage_codes'] == ['02']
    # HOME 근거 URL(legacy, mi 붙음)은 받은 게시물 문서에 합쳐지고, 받지 않은 보고서 인용 URL 은 URL 문서 하나
    assert any('mi=1027' in u for u in page['url_aliases']) and '05' in page['stage_codes']
    assert page['publisher_org'] == '한국토지주택공사' and page['publisher_dept'] == '시험지역본부'
    cited = rows[ids.doc_id_for_url('https://www.korea.kr/briefing/pressReleaseView.do?newsId=5')]
    # 원천주체_확인.csv 덮어쓰기: 확인 값으로 바꾸고 '도메인 추정' → '원천주체 확인: 방법', '원문 표기 없음'이면 값 유지
    assert (cited['saved'], cited['publisher_org'], cited['publisher_dept']) == (False, '국토교통부', '주택정책과')
    assert '원천주체 확인: 게시판 담당부서' in cited['notes'] and '도메인 추정' not in cited['notes']
    exa = next(r for r in cat.rows if (r['local_path'] or '').endswith('s.json'))
    assert exa['publisher_org'] == 'Exa' and '원천주체 확인: 원문 표기 없음' in exa['notes']   # 값 유지, 다음 규칙으로
    assert cat.pub_method[exa['doc_id']] == 'API 응답 제공자'


def test_publisher_rules(repo):
    cat = catalog.build(str(repo[0]), RESEARCH, str(repo[1]))
    by_path = {r['local_path']: r for r in cat.rows if r['local_path']}
    m = cat.pub_method
    gosi = by_path[RESEARCH + '/03.인허가/원본/web/gosi/eum_gosi_seq1.html']
    att = by_path[RESEARCH + '/03.인허가/원본/web/gosi/eum_gosi_seq1_a.pdf']
    assert (gosi['publisher_org'], m[gosi['doc_id']]) == ('서울특별시', '고시 기관 표기')       # 고시번호 앞 기관(cp949 HTML)
    assert gosi['publisher_dept'] == '공공주택과'            # 열람장소 중 고시 기관으로 시작하는 항목의 부서(문의처 칸은 읽지 않음)
    assert '담당기관: 서울특별시 시험구' in gosi['notes']
    assert (att['publisher_org'], m[att['doc_id']], att['parent_doc_id']) == ('서울특별시', '부모 게시물', gosi['doc_id'])
    odd = by_path[RESEARCH + '/03.인허가/원본/형식시험.hwp']
    assert odd['format'] == 'PDF' and '확장자는 HWP, 내용(앞 바이트)은 PDF' in odd['notes']
    portal = by_path[RESEARCH + '/04.건설/원본/web/data_go_kr_15000001_fileData.html']
    data = by_path[RESEARCH + '/04.건설/원본/15000001_시험데이터.csv']
    assert (portal['publisher_org'], portal['publisher_dept'], m[portal['doc_id']]) == ('한국시험공사', '데이터팀', '공공데이터포털 메타')
    assert (data['publisher_org'], data['publisher_dept'], m[data['doc_id']]) == ('한국시험공사', '데이터팀', '공공데이터포털 메타')
    press = by_path[P]
    parent = next(r for r in cat.rows if r['doc_id'] == press['parent_doc_id'])
    assert (parent['canonical_url'], m[parent['doc_id']]) == ('https://www.molit.go.kr/USR/NEWS/m_71/dtl.jsp?id=1', '공식 누리집 게시')
    assert (press['publisher_org'], press['publisher_dept'], m[press['doc_id']]) == ('국토교통부', '시험과', '부모 게시물')
    page = by_path[RESEARCH + '/02.사업화/원본/web/page.html']
    assert m[page['doc_id']] == '웹 원문 확인 기록'
    cited = next(r for r in cat.rows if r['canonical_url'] == 'https://www.korea.kr/briefing/pressReleaseView.do?newsId=5')
    assert m[cited['doc_id']].startswith('원천주체 확인')
    assert [k for k, v in m.items() if v == '도메인 추정'] == [odd['doc_id']]   # URL·기록이 없는 시험 파일만 도메인 추정
    assert 'Exa 응답에 본문 있음' in cited['notes']
    # 문서 조회: URL 별칭·저장 경로가 같은 문서인지
    assert cat.resolve(url='https://eiec.kdi.re.kr/policy/callDownload.do?filenum=2&num=1') == cat.resolve(path=P)
    assert cat.same_document('https://molit.go.kr/portal/common/download/DownloadMltm2.jsp?FilePath=/up/a.pdf', RESEARCH + '/02.사업화/원본/web/copy.pdf') is True
    assert cat.same_document(P, RESEARCH + '/02.사업화/원본/web/page.html') is False
    assert cat.same_document(P, 'https://example.org/none') is None
    assert all(r['publisher_org'] for r in cat.rows)
    assert len({r['canonical_url'] for r in cat.rows if r['canonical_url']}) == sum(1 for r in cat.rows if r['canonical_url'])


# ---------- 출력·검증·지표 ----------
def test_emit_tables_and_metrics(repo):
    out = run(repo)
    ev = table(repo, 'evidence')
    sd = {r['doc_id']: r for r in table(repo, 'source_documents')}
    assert all(e['doc_id'] in sd for e in ev if e['doc_id'])
    # 외부 레코드(HOME)가 다르면 행도 다르다, 완전히 같은 대조(중복 줄)는 한 행
    st6 = sorted(e['external_ref'] for e in ev if e['field'] == 'stage_06')
    assert st6 == ['PRO_1', 'PRO_2']
    assert sum(1 for e in ev if e['field'] == 'stage_04') == 1 and out['metrics']['texts']
    pol = table(repo, 'policies')[0]
    assert pol['announcement_date'] == '2026-01-02' and pol['source_ref'] == catalog.DATASET_SOURCE_REF   # 원문값
    assert pol['review_status'] == 'CONFIRMED'          # HOME 과 MISMATCH 여도 값이 원문값이고 모든 항목 확인됨(설계 5.3)
    links = {emit.link_key(r): r for r in table(repo, 'links')}
    assert links['POLICY_PROGRAM|POL_T|PRG_A']['review_status'] == 'CONFIRMED'
    assert links['PROGRAM_PROJECT|PRG_A|PRJ-11110-0001']['review_status'] == 'REVIEW_REQUIRED'           # NOT_IN_SOURCE
    assert not any(r['from_local_id'] == 'POL_OTHER' for r in links.values())
    progs = {r['program_name']: r for r in table(repo, 'programs')}
    assert progs['프로그램 A']['program_definition'] == '원문 정의 A' and '새 프로그램' not in progs   # 후보는 이름이 맞을 때만
    targets = table(repo, 'policy_targets')
    assert targets[0]['review_status'] == 'CONFIRMED'   # 'from>to'·',' 모양 subject_id 도 같은 항목으로 읽는다
    m1 = out['metrics']['m1'][('POL_T', '전체')]
    assert (m1['total'], m1['confirmed'], m1['absent_only'], m1['basis:INDEPENDENT']) == (10, 8, 1, 2)
    a = out['metrics']['m3']
    assert (a['m3']['latest']['file'], a['m3']['ok'], a['m3']['error']) == ('audit_20261017.csv', 2, 1)   # 최신 판, evidence_id 빈 행 뺌
    assert [h['file'] for h in a['m3']['history']] == ['audit_20261016.csv']
    assert (a['m4']['latest']['file'], a['m4']['ok'], a['m4']['error']) == ('audit_gaps_20261017.csv', 1, 1)
    m4 = out['metrics']['m4']['by']
    assert m4[('POL_T', '02')] == {'누락 확정': 1, '판정 없음': 1} and m4[('POL_T', '03')] == {'범위 밖': 1}
    assert pol['scope_region'] == '전국'   # SOURCED 값도 원문값으로 쓴다
    m2 = out['metrics']['m2']
    assert (m2['canonical_dup'], m2['sha_dup'], m2['disk_unregistered']) == (0, 0, [])
    assert len(m2['unresolved']) == 1 and m2['unresolved'][0][4] == '목록에 없는 파일'
    assert (m2['attachments'], m2['attachments_registered']) == (3, 3)
    assert (m2['ev_docs'], m2['ev_saved']) == (2, 2)
    md = open(os.path.join(repo[0], RESEARCH, '품질_리포트.md'), encoding='utf-8').read()
    # 세 기준(분모 = 항목 10): 미도달 포함 8 · 파생 미도달 제외 8(미도달 근거가 INDEPENDENT) · 미도달 제외 7 — explain.py 와 같은 정의
    assert '| POL_T | 전체 | 10 | 8 | 80.0% | 80.0% | 70.0% | 1 |' in md and '표본 3건 중 오류 1건' in md and '이전 판 `audit_20261016.csv`' in md
    assert '확인 판정(MATCH·MISMATCH·SOURCED·NOT_IN_SOURCE)인데 doc_id 가 빈 evidence 행: 1' in md   # 없는 파일을 가리킨 stage_03
    assert m1['confirmed_nd'] == 8 and m1['confirmed_na'] == 7
    unconf = open(os.path.join(repo[0], RESEARCH, 'dataset/_work/미확인_항목.csv'), encoding='utf-8-sig').read().splitlines()
    assert len(unconf) == 3   # 머리 + stage_04(EXISTENCE) + stage_06(UNVERIFIED)
    miss = open(os.path.join(repo[0], RESEARCH, 'dataset/_work/fetch/미보존_evidence_URL.csv'), encoding='utf-8-sig').read().splitlines()
    assert miss == ['문서id,url,단계,관련 항목 수,자료명']   # 고정 입력의 evidence 문서는 모두 보존
    head = open(os.path.join(repo[0], RESEARCH, '출처_통합.csv'), encoding='utf-8-sig').readline().strip()
    assert head == ','.join(emit.CSV_COLS)


def test_emit_is_byte_stable(repo):
    run(repo, validate=False)
    names = ['source_documents', 'evidence', 'sources', 'policies', 'programs', 'policy_targets', 'links']
    base = os.path.join(repo[0], RESEARCH)
    first = {n: open(os.path.join(base, 'dataset', n + '.json'), 'rb').read() for n in names}
    first['csv'] = open(os.path.join(base, '출처_통합.csv'), 'rb').read()
    first['md'] = open(os.path.join(base, '품질_리포트.md'), 'rb').read()
    run(repo, validate=False)
    for n in names:
        assert open(os.path.join(base, 'dataset', n + '.json'), 'rb').read() == first[n], n
    assert open(os.path.join(base, '출처_통합.csv'), 'rb').read() == first['csv']
    assert open(os.path.join(base, '품질_리포트.md'), 'rb').read() == first['md']


def node_validate(repo):
    r = repo[0]
    return subprocess.run(['node', os.path.join(CHAIN, 'validate_dataset.cjs'), str(r / RESEARCH / 'dataset'),
                           str(r / 'schemas' / 'ledger'), str(r / 'ledger' / 'tables')], capture_output=True, text=True)


@pytest.mark.parametrize('table_name,mutate,expect', [
    ('source_documents', lambda rows: rows[0].update(saved=True, local_path=None), 'source_documents'),
    ('source_documents', lambda rows: rows[0].update(doc_id='DOC-xyz'), 'pattern'),
    ('evidence', lambda rows: next(e for e in rows if e['verdict'] == 'ABSENT_CONFIRMED').update(search_scope=None), 'evidence'),
    ('evidence', lambda rows: rows[0].update(doc_id='DOC-0000000000000000'), '없는 문서'),
    ('links', lambda rows: rows[0].update(to_local_id='PRG_NONE'), '끝이 없다'),
])
def test_schema_pass_and_fail(repo, table_name, mutate, expect):
    run(repo)                                   # 통과(run 이 검증까지 한다)
    assert node_validate(repo).returncode == 0
    p = os.path.join(repo[0], RESEARCH, 'dataset', table_name + '.json')
    doc = json.load(open(p, encoding='utf-8'))
    mutate(doc['rows'])
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False)
    res = node_validate(repo)
    assert res.returncode == 1 and expect in res.stdout, res.stdout
