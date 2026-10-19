"""tools/research/chain explain_deck.py 시험 — 작은 고정 입력으로 발표 덱을 만든다.

- 장 수(표지 + 한눈에 보기 + 본문 10 + 마무리 + 부록 2 = 15)와 장마다 제목·출처 줄이 있다.
- 세 기준(미도달 포함 · 파생 미도달 제외 · 미도달 제외)은 부록 표에 모두 출력된다. 파생 미도달 = verdict ABSENT_CONFIRMED 이고 basis RULE.
- 확인률 장 제목은 목표 달성 정책 수에 따라 설정의 세 문구(모두 · 일부 · 없음) 중 하나다.
- 본문 장(부록 제외, 바닥글 출처 줄 제외)에는 영문 코드·파일명·필드명이 없다. 영문 표 이름은 작은 회색 글씨(.en)로만 둔다.
  모든 장에 말줄임표와 8자리 숫자 날짜가 없다.
- 입력에 전화번호·이메일·IP 가 있어도 출력에 없다. 입력이 없는 장은 '아직 없음' 이고 실패하지 않는다.
- 같은 입력이면 재실행 결과가 바이트까지 같다.
"""
import json
import os
import re
import shutil
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))
from test_research_chain_explain import make_root, ev, PID, write  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
CHAIN = os.path.join(ROOT, 'tools', 'research', 'chain')
SCRIPT = os.path.join(CHAIN, 'explain_deck.py')
sys.path.insert(0, CHAIN)

import explain_deck  # noqa: E402
import explain  # noqa: E402

CODE_RX = re.compile(r'[A-Z]{3,}_[A-Z_]+')
DATE8_RX = re.compile(r'\b(19|20)\d{6}\b')
BODY_WORDS = ('evidence', 'source_documents', '.json', 'sha256')

README = """# 시험

## 시험 정책 — `%s`

### 주요 불일치·HOME 수정 제안

1. **03.인허가 불일치** `PRO_a` 민간참여) 시험지구 A1 — HOME 값: 승인일 2020-01-07 / 원본(x/a.zip): 승인일 20191231 · 총세대수 10
2. **03.인허가 불일치** `PRO_b` 민간참여) 시험지구 A1 — HOME 값: 승인일 2020-01-07 / 원본(x/a.zip): 승인일 20191231 · 총세대수 10
3. **03.인허가 불일치** `PRO_c` 시험지구 B2 — HOME 값: INITIAL_APPROVAL · 2025-12-30 / 원본(x/b.pdf): 변경승인
4. **06.입주 불일치** `PRO_d` 시험지구 C3 6공구 ( — HOME 값: HOME 입주 예정월 2028-02(evidence_bridge) / 원본(x/c.csv): 아파트명 시험 · 세대수 350 · 입주예정월 2028-01
5. **시험 지표**(`a/README.md` 2절): HOME 은 230,000호로 두었다. unit_basis 수정 필요.
""" % PID


def run(root, out):
    return subprocess.run([sys.executable, '-P', '-E', SCRIPT, '--root', root, '--out', out], capture_output=True, text=True)


def sections(html):
    """[(부록인지, 바닥글·영문 표 이름을 뺀 장 HTML)]"""
    out = []
    for m in re.finditer(r'<section class="slide([^"]*)"(.*?)</section>', html, re.S):
        s = re.sub(r'<div class="foot".*?</div>', '', m.group(2), flags=re.S)
        s = re.sub(r'<span class="en">[^<]*</span>', '', s)
        out.append(('appx' in m.group(1).split(), s))
    return out


def plain_violations(html):
    bad = []
    for k, (appx, s) in enumerate(sections(html), 1):
        if not appx:
            bad += ['%d장 코드 %s' % (k, x.group(0)) for x in CODE_RX.finditer(s)]
            bad += ['%d장 낱말 %s' % (k, w) for w in BODY_WORDS if w in s]
        if '…' in s:
            bad.append('%d장 말줄임표' % k)
        bad += ['%d장 날짜 %s' % (k, x.group(0)) for x in DATE8_RX.finditer(s)]
    return bad


def test_slide_count_and_footers(tmp_path):
    html, _ = explain_deck.build(make_root(tmp_path))
    secs = re.findall(r'<section class="slide[^>]*>', html)
    assert len(secs) == 15
    assert html.count('class="foot"') == 14          # 표지만 푸터 없음
    assert html.count('출처:') == 14
    assert html.count('class="sub ld"') == 13         # 표지·마무리 말고는 장 설명 한 줄
    assert len([s for s in secs if 'appx' in s]) == 2
    assert '기준일 2000-01-02' in html
    assert '범위' in html and '정책 1개(시험 정책), 6단계(정책→입주)' in html
    assert 'Gothic+A1' in html and 'Space+Mono' in html
    assert 'data:image' not in html                   # 이미지는 가져오지 않는다


def test_three_bases_and_derived_rule(tmp_path):
    root = make_root(tmp_path)
    # 파생 미도달은 search_scope 글자가 아니라 ABSENT_CONFIRMED + basis RULE 로 가른다
    rows = [ev('stage_02', 'MATCH', 'INDEPENDENT'),
            ev('stage_03', 'ABSENT_CONFIRMED', 'RULE', '글자와 무관'),
            ev('stage_04', 'ABSENT_CONFIRMED', 'INDEPENDENT', '선행 단계 03 미도달(글자만 같음)'),
            ev('stage_05', 'UNVERIFIED', None), ev('stage_06', 'EXISTS_ONLY', 'EXISTENCE')]
    write(os.path.join(root, 'docs/speech/research/dataset/_work', PID, 'evidence.jsonl'), '\n'.join(json.dumps(r, ensure_ascii=False) for r in rows) + '\n')
    html, _ = explain_deck.build(root)
    appx = ''.join(s for a, s in sections(html) if a)
    assert '3/5 60.0%' in appx                        # 미도달 포함
    assert '2/5 40.0%' in appx                        # 파생 미도달 제외(RULE 한 건만 뺌)
    assert '1/5 20.0%' in appx                        # 미도달 제외
    for label in ('미도달 포함', '파생 미도달 제외', '미도달 제외'):
        assert label in appx
    assert '원천 확인률 60.0% — 목표 90%를 넘은 정책은 아직 없다' in html
    assert '전체 판정 기준' in html and '도달한 단계만' in html


def test_title_when_some_or_all_met(tmp_path):
    root = make_root(tmp_path)
    cfg = os.path.join(root, 'tools/research/chain/config')
    write(os.path.join(cfg, 'policies.json'), json.dumps({'policies': [
        {'policy_id': PID, 'name': '시험 정책 (1·1)'}, {'policy_id': 'POL_TEST_0002', 'name': '둘째 정책 (2·2)'}]}, ensure_ascii=False))
    good = [dict(ev('stage_0%d' % k, 'MATCH', 'INDEPENDENT'), policy_id='POL_TEST_0002') for k in range(2, 7)]
    write(os.path.join(root, 'docs/speech/research/dataset/_work/POL_TEST_0002/evidence.jsonl'), '\n'.join(json.dumps(r) for r in good) + '\n')
    html, _ = explain_deck.build(root)
    assert '원천 확인률 60.0%~100.0% — 목표 90%는 2·2만 달성' in html
    assert '정책 2개(1·1 · 2·2)' in html
    write(os.path.join(cfg, 'policies.json'), json.dumps({'policies': [{'policy_id': 'POL_TEST_0002', 'name': '둘째 정책 (2·2)'}]}, ensure_ascii=False))
    shutil.rmtree(os.path.join(root, 'docs/speech/research/dataset/_work', PID))   # 작업 폴더가 남으면 정책으로 다시 잡힌다
    html, _ = explain_deck.build(root)
    assert '원천 확인률 100.0% — 정책 1개 모두 목표 90% 달성' in html


def test_home_fixes_merged_and_cleaned(tmp_path):
    root = make_root(tmp_path)
    write(os.path.join(root, 'docs/speech/research/README.md'), README)
    html, _ = explain_deck.build(root)
    assert 'HOME 값 3건이 원문과 달랐다 — 고칠 점 1건을 제안한다' in html   # 레코드 id 만 다른 두 줄은 하나로
    assert '합치기 전 4건' in html
    assert '<b>시험지구 A1</b>' in html and '민간참여)' not in html            # 앞이 잘린 괄호 정리
    assert '<b>시험지구 C3 6공구</b>' in html                                  # 끝의 열린 괄호 정리
    assert '2019-12-31' in html and '20191231' not in html                     # 날짜 맞춤
    assert '<td>입주 예정월</td><td>2028-02</td>' in html                       # HOME 머리말·영문 표식 괄호 뺌
    assert '<b>2028-01</b>' in html                                            # 원문 값은 같은 항목의 구절만
    assert 'evidence_bridge' not in html and 'INITIAL_APPROVAL' not in html
    assert '시험 지표' in html and 'HOME 은 230,000호로 두었다.' in html and 'unit_basis' not in html
    assert plain_violations(html) == []


def test_helpers():
    assert explain_deck.norm_dates('승인일 20211231 · 공고일 2025.12.31 · 2028년 12월') == '승인일 2021-12-31 · 공고일 2025-12-31 · 2028-12'
    assert explain_deck.norm_dates('15141761 · 99991231') == '15141761 · 99991231'
    assert explain_deck.fix_parens('민간참여) 화성동탄2 C-14') == '화성동탄2 C-14'
    assert explain_deck.fix_parens('사업(건축) 6공구 (') == '사업(건축) 6공구'
    assert explain_deck.drop_id_parens('2027-11(project.rows(LH 공급계획))') == '2027-11'
    assert explain_deck.drop_id_parens('2028-08(한국토지주택공사)') == '2028-08(한국토지주택공사)'
    assert explain_deck.short_name('주택공급 확대방안 (9·7)') == '9·7'
    assert explain_deck.src_value('아파트명 가 · 세대수 350 · 입주예정월 2028-01', '입주 예정월') == '2028-01'
    assert explain_deck.src_value('계획 입주예정월 2025-06(한국부동산원)', '입주예정월') == '2025-06(한국부동산원)'


def test_plain_body_on_fixture(tmp_path):
    root = make_root(tmp_path, with_pii=True)
    html, _ = explain_deck.build(root)
    assert plain_violations(html) == []


@pytest.mark.skipif(not os.path.exists(os.path.join(ROOT, 'docs/speech/research/dataset/source_documents.json')), reason='저장소 출력 없음')
def test_plain_body_on_repo_outputs():
    html, _ = explain_deck.build(ROOT)
    assert plain_violations(html) == []
    assert explain.pii_hits(html) == []
    m = re.search(r'<span class="big">([\d,]+)</span><p>팀 관리표 ([\d,]+)곳 \+ 새로 찾은 ([\d,]+)곳, 같은 주소 ([\d,]+)곳 합침', html)
    n, a, b, k = (int(x.replace(',', '')) for x in m.groups())
    assert a + b - k == n                              # 원천 사이트 카드의 수가 맞아떨어진다


def test_missing_inputs_and_pii(tmp_path):
    root = make_root(tmp_path, with_pii=True)
    out = str(tmp_path / 'd.html')
    r = run(root, out)
    assert r.returncode == 0, r.stderr
    html = open(out, encoding='utf-8').read()
    assert '아직 없음' in html or '입력이 아직 없음' in html
    assert '측정 중' in html                           # 표본 감사 파일 없음
    assert explain.pii_hits(html) == []
    for s in ('02-1234-5678', 'hong@example.go.kr', '10.20.30.40'):
        assert s not in html
    assert 'X' not in re.findall(r'SHEET \d+ / (\d+)', html)[0]


def test_byte_identical(tmp_path):
    root = make_root(tmp_path, with_pii=True)
    a, b = str(tmp_path / 'a.html'), str(tmp_path / 'b.html')
    assert run(root, a).returncode == 0 and run(root, b).returncode == 0
    assert open(a, 'rb').read() == open(b, 'rb').read()
