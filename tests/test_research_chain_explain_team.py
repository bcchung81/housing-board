"""tools/research/chain explain_team.py 시험 — 작은 고정 입력으로 팀 공유판을 만든다.

- 같은 입력이면 바이트까지 같고, 덱과 같은 15장(장 그림 = 덱의 장 HTML 그대로)이다.
- 개인정보가 없고, URL 쿼리의 비밀 모양 값은 *** 로 가린다(key=·fileKey·tblKey 는 그대로).
- 원천 위치 절에는 말줄임표·<정책>·*.jsonl 같은 와일드카드가 없다(실제 파일로 펼친다).
- 사례 사업의 단계별 근거 문서 경로·URL·쪽·evidence_id 가 모두 나온다. 불일치·수정 제안은 전부 나온다.
- 입력이 없어도 실패하지 않는다.
"""
import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(__file__))
from test_research_chain_explain import make_root, ev, PID, write  # noqa: E402
from test_research_chain_explain_deck import README  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
CHAIN = os.path.join(ROOT, 'tools', 'research', 'chain')
SCRIPT = os.path.join(CHAIN, 'explain_team.py')
sys.path.insert(0, CHAIN)

import explain  # noqa: E402
import explain_deck  # noqa: E402
import explain_team  # noqa: E402

RS = 'docs/speech/research'
SID = 'PRJ-00000-0001'


def run(root, out):
    return subprocess.run([sys.executable, '-P', '-E', SCRIPT, '--root', root, '--out', out], capture_output=True, text=True)


def srcs(html):
    return re.findall(r'<section class="srcs">(.*?)</section>', html, re.S)


def doc(n, stage, url, fmt='PDF'):
    return {'doc_id': 'DOC-%016d' % n, 'canonical_url': url, 'title': '시험 원문 %d 아주 긴 제목 — 자르지 않는다 %s' % (n, '가' * 80), 'doc_type': 'OTHER',
            'format': fmt, 'publisher_org': '시험기관', 'publisher_dept': '시험과', 'collection_method': 'HTTP',
            'local_path': '%s/%s.시험/원본/문서_%d.pdf' % (RS, stage, n), 'stage_codes': [stage], 'saved': True}


def full_root(tmp):
    """사례(단계별 근거 문서) · 문서 목록 · 데이터셋 evidence · README 불일치가 있는 고정 입력."""
    root = make_root(tmp)
    docs = [doc(k, '0%d' % k, 'https://example.go.kr/view.do?bbsNo=1&key=%d&serviceKey=SECRETVALUE%d&fileKey=abc%d' % (k, k, k)) for k in range(2, 7)]
    docs.append(doc(1, '01', 'https://example.go.kr/policy.do?tblKey=77&apiKey=XYZ123'))
    docs.append(dict(doc(9, '05', None, 'HTML'), local_path=None, saved=False, not_saved_reason='시험 사유', stage_codes=['05', '06']))
    rows, ds = [], []
    for k in range(2, 7):
        r = dict(ev('stage_0%d' % k, 'MATCH', 'INDEPENDENT'), doc_path=docs[k - 2]['local_path'], locator='p.%d' % (k * 10),
                 external_ref='PRO_x', dataset_value='값 %d · 둘째 값 · 셋째 값' % k)
        rows.append(r)
        ds.append(dict(r, evidence_id='EV-%016d' % k, doc_id=docs[k - 2]['doc_id']))
    link = dict(ev('program_project', 'MATCH', 'INDEPENDENT', table='links', sid='PROGRAM_PROJECT|PRG_1|' + SID), stage_code='01',
                doc_url=docs[5]['canonical_url'], locator='p.3', external_ref='PRO_x', dataset_value='시험지구')
    rows.append(link)
    ds.append(dict(link, evidence_id='EV-%016d' % 1, doc_id=docs[5]['doc_id']))
    write(os.path.join(root, RS, 'dataset/_work', PID, 'evidence.jsonl'), '\n'.join(json.dumps(r, ensure_ascii=False) for r in rows) + '\n')
    write(os.path.join(root, RS, 'dataset/_work', PID, 'evidence_rule.jsonl'), '')
    for name, data in (('source_documents', docs), ('evidence', ds), ('policies', []), ('programs', []), ('policy_targets', []),
                       ('links', []), ('sources', [])):
        write(os.path.join(root, RS, 'dataset', name + '.json'), json.dumps({'rows': data}, ensure_ascii=False))
    write(os.path.join(root, RS, 'README.md'), README)
    write(os.path.join(root, RS, '원천사이트_대조.csv'),
          '﻿통합출처ID,제공기관,공식원천명,소관부서,공식URL\nSRC-001,국토교통부,시험 원천,주택정책과,https://www.molit.go.kr/a?id=1\n'
          'NEW-001,국토교통부,시험 원천 다른 이름,주택정책과,http://molit.go.kr/a?id=1/\nNEW-002,시험시,시험 게시판,시험과,https://x.go.kr/b?token=TOK999&key=5\n')
    return root


def test_byte_identical_and_slides(tmp_path):
    root = full_root(tmp_path)
    a, b = str(tmp_path / 'a.html'), str(tmp_path / 'b.html')
    ra, rb = run(root, a), run(root, b)
    assert ra.returncode == 0 and rb.returncode == 0, ra.stderr + rb.stderr
    ha = open(a, 'rb').read()
    assert ha == open(b, 'rb').read()
    html = ha.decode('utf-8')
    deck, _ = explain_deck.build(root)
    slides = re.findall(r'<section class="slide.*?</section>', deck, re.S)
    assert len(slides) == 15 and html.count('<article class="sh"') == 15 and len(srcs(html)) == 15
    for s in slides:                                  # 장 그림 = 덱의 장 HTML 그대로
        assert s in html
    assert 'class="ui"' not in html and 'id="prog"' not in html   # 덱 넘김 UI 없음


def test_no_pii_and_secrets_masked(tmp_path):
    root = full_root(tmp_path)
    write(os.path.join(root, RS, '원천주체_단계별.csv'),
          '﻿단계,원천,①업무주체,①근거,②입력처,②근거,③공개부서,③근거,게시처\n'
          '01,시험 원천,"국토부 담당 02-1234-5678 hong@example.go.kr 10.20.30.40",근거,해당 없음,근거2,시험과,근거3,게시판\n')
    out = str(tmp_path / 'o.html')
    r = run(root, out)
    assert r.returncode == 0, r.stderr
    html = open(out, encoding='utf-8').read()
    assert explain.pii_hits(html) == []
    for s in ('02-1234-5678', 'hong@example.go.kr', '10.20.30.40', 'SECRETVALUE', 'XYZ123', 'TOK999'):
        assert s not in html, s
    assert 'serviceKey=***' in html and 'apiKey=***' in html and 'token=***' in html
    assert 'key=2&amp;' in html and 'fileKey=abc2' in html and 'tblKey=77' in html   # 게시판 글 번호는 그대로
    assert explain_team.secret_hits(html) == []


def test_mask_rules():
    m = explain_team.mask
    assert m('https://a.kr/x?serviceKey=AbC%2B1&page=1') == 'https://a.kr/x?serviceKey=***&page=1'
    assert m('https://a.kr/x?a=1&SERVICEKEY=z') == 'https://a.kr/x?a=1&SERVICEKEY=***'
    assert m('https://a.kr/x?api_key=1&access_token=2&secret=3') == 'https://a.kr/x?api_key=***&access_token=***&secret=***'
    assert m('https://a.kr/x (POST crtfc_key=abc&b=1)') == 'https://a.kr/x (POST crtfc_key=***&b=1)'
    for s in ('https://a.kr/x?key=3315&nttNo=1', 'https://a.kr/d?fileKey=99614d', 'https://a.kr/v?tblKey=GMN&x=1', 'https://a.kr/v?monkey=1'):
        assert m(s) == s
    assert explain_team.secret_hits('<a href="x?serviceKey=abc">') and not explain_team.secret_hits('x?serviceKey=***')


def test_source_sections_unabridged(tmp_path):
    root = full_root(tmp_path)
    html, _ = explain_team.build(root)
    ss = ''.join(srcs(html))
    for bad in ('…', '<정책>', '&lt;정책&gt;', '*.jsonl', '*.json', '*.py', 'text-overflow'):
        assert bad not in ss, bad
    # 와일드카드는 실제 파일 목록으로
    for f in ('evidence.jsonl', 'evidence_rule.jsonl'):
        assert '%s/dataset/_work/%s/%s' % (RS, PID, f) in ss
    assert '%s/dataset/source_documents.json' % RS in ss and '%s/dataset/links.json' % RS in ss
    # 사이트: 3행 = 관리표 1 + 새로 찾은 2, 같은 URL 은 같은 번호
    assert '관리표에 있던 원천 1행' in ss and '이번에 새로 찾은 원천 2행' in ss
    # 문서 목록: 7건 전부, 제목 전체, 보존 안 한 문서는 사유
    assert ss.count('<span class="p">DOC-') >= 7
    assert '시험 원문 2 아주 긴 제목 — 자르지 않는다 ' + '가' * 80 in ss
    assert '원 파일 보존 안 함 · 시험 사유' in ss


def test_case_evidence_locations(tmp_path):
    root = full_root(tmp_path)
    html, c = explain_team.build(root)
    s8 = srcs(html)[7]
    assert c.picked['s7']['sid'] == SID
    for k in range(2, 7):
        p = '%s/0%d.시험/원본/문서_%d.pdf' % (RS, k, k)
        assert '>%s</a>' % p in s8                                     # 로컬 경로 전체
        assert 'href="0%d.%%EC%%8B%%9C%%ED%%97%%98/' % k in s8          # 출력 파일 기준 상대 링크
        assert 'https://example.go.kr/view.do?bbsNo=1&amp;key=%d&amp;serviceKey=***&amp;fileKey=abc%d' % (k, k) in s8
        assert 'p.%d' % (k * 10) in s8 and 'EV-%016d' % k in s8 and 'DOC-%016d' % k in s8
        assert '값 %d · 둘째 값 · 셋째 값' % k in s8                    # 데이터셋 값은 자르지 않는다
    # 01 정책 → 사업 연결 근거
    assert 'https://example.go.kr/policy.do?tblKey=77&amp;apiKey=***' in s8 and 'EV-%016d' % 1 in s8 and 'p.3' in s8
    assert '시험기관 시험과' in s8


def test_mismatches_and_suggestions_all(tmp_path):
    root = full_root(tmp_path)
    html, c = explain_team.build(root)
    s11 = srcs(html)[10]
    fi = c.find_info
    assert len(fi['uniq']) == 3 and len(fi['rows']) == 4 and len(fi['texts']) == 1
    assert s11.count('class="rec"') == 3
    assert 'PRO_a · PRO_b' in s11                                      # 합친 줄의 레코드 id 모두
    assert 'HOME 입주 예정월 2028-02(evidence_bridge)' in s11         # HOME 값 전체(정리하지 않음)
    assert '아파트명 시험 · 세대수 350 · 입주예정월 2028-01' in s11
    for f in ('x/a.zip', 'x/b.pdf', 'x/c.csv'):
        assert '>%s</a>' % f in s11
    assert 'HOME 은 230,000호로 두었다. unit_basis 수정 필요.' in s11  # 제안 전문
    shown = len(c.picked['s10']['rows']) + len(c.picked['s10']['texts'])
    assert s11.count('class="bd"') == shown > 0                         # 덱이 고른 행 표시


def test_missing_inputs_do_not_fail(tmp_path):
    root = make_root(tmp_path)
    out = str(tmp_path / 'o.html')
    r = run(root, out)
    assert r.returncode == 0, r.stderr
    html = open(out, encoding='utf-8').read()
    assert html.count('<article class="sh"') == 15
    assert '아직 없음' in ''.join(srcs(html))
    assert explain.pii_hits(html) == []
