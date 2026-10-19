"""tools/research/chain explain.py 시험 — 작은 고정 입력으로 설명자료 HTML 을 만든다.

- 세 기준(미도달 포함 · 파생 미도달 제외 · 미도달 제외)이 모두 출력되고 수치가 입력에서 계산된다.
- 입력에 전화번호·이메일·IP 가 있어도 출력에 없고, 출력에 남으면 검사가 잡는다.
- 입력이 없는 절은 '아직 없음'이고 실패하지 않는다.
- 같은 입력이면 재실행 결과가 바이트까지 같다.
"""
import json
import os
import shutil
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
CHAIN = os.path.join(ROOT, 'tools', 'research', 'chain')
SCRIPT = os.path.join(CHAIN, 'explain.py')
sys.path.insert(0, CHAIN)

import explain  # noqa: E402

PID = 'POL_TEST_0001'


def ev(field, verdict, basis, scope=None, table='projects', sid='PRJ-00000-0001'):
    return {'policy_id': PID, 'subject_table': table, 'subject_id': sid, 'field': field, 'stage_code': field[-2:],
            'verdict': verdict, 'basis': basis, 'search_scope': scope}


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)


def make_root(tmp, with_pii=False):
    root = str(tmp)
    cfg = os.path.join(root, 'tools/research/chain/config')
    os.makedirs(cfg)
    shutil.copy(os.path.join(CHAIN, 'config', 'explain.json'), cfg)
    write(os.path.join(cfg, 'stage_sources.json'), json.dumps({'checked_at': '2000-01-02', 'paths': {
        'research_dir': 'docs/speech/research', 'work_dir': 'docs/speech/research/dataset/_work'}}))
    write(os.path.join(cfg, 'policies.json'), json.dumps({'policies': [{'policy_id': PID, 'name': '시험 정책', 'announced': '2000-01-01'}]}))
    rows = [
        ev('stage_02', 'MATCH', 'INDEPENDENT'),                                              # 확인, 직접
        ev('stage_04', 'ABSENT_CONFIRMED', 'RULE', '선행 단계 03 미도달(시험)'),                # 파생 미도달만
        ev('stage_03', 'ABSENT_CONFIRMED', 'INDEPENDENT', '직접 찾아봄'),                      # 직접 미도달
        ev('stage_05', 'UNVERIFIED', None),                                                   # 미확인
        ev('stage_06', 'EXISTS_ONLY', 'EXISTENCE'),                                           # 존재만
    ]
    write(os.path.join(root, 'docs/speech/research/dataset/_work', PID, 'evidence.jsonl'), '\n'.join(json.dumps(r, ensure_ascii=False) for r in rows) + '\n')
    if with_pii:
        write(os.path.join(root, 'docs/speech/research/원천주체_단계별.csv'),
              '﻿단계,원천,①업무주체,②입력처,③공개부서,작성주체_확인,담당부서_확인,쓰인_evidence_수\n'
              '01,시험 원천,"국토부 담당 02-1234-5678 hong@example.go.kr 10.20.30.40",해당 없음,시험과,원문 확인,원문 확인,3\n')
    return root


def run(root, out):
    return subprocess.run([sys.executable, '-P', '-E', SCRIPT, '--root', root, '--out', out], capture_output=True, text=True)


def test_three_bases_printed(tmp_path):
    root = make_root(tmp_path)
    html, _ = explain.build(root)
    # 항목 5 · 미도달 포함 3 · 파생 미도달 제외 2 · 미도달 제외 1
    assert '3 / 5 · 60.0%' in html
    assert '2 / 5 · 40.0%' in html
    assert '1 / 5 · 20.0%' in html
    for label in ('미도달 포함', '파생 미도달 제외', '미도달 제외'):
        assert label in html
    assert '달성한 곳이 없습니다' in html     # 어느 기준도 90% 미만
    assert '2000-01-02' in html               # 기준일은 config 의 checked_at


def test_missing_inputs_do_not_fail(tmp_path):
    root = make_root(tmp_path)
    out = str(tmp_path / 'o.html')
    r = run(root, out)
    assert r.returncode == 0, r.stderr
    html = open(out, encoding='utf-8').read()
    assert '아직 없음' in html
    assert '메인 정리 예정' in html           # open_items 가 빈 배열


def test_personal_info_not_copied(tmp_path):
    root = make_root(tmp_path, with_pii=True)
    out = str(tmp_path / 'o.html')
    r = run(root, out)
    assert r.returncode == 0, r.stderr
    html = open(out, encoding='utf-8').read()
    assert '시험 원천' in html and '국토부 담당' in html
    assert explain.pii_hits(html) == []
    for s in ('02-1234-5678', 'hong@example.go.kr', '10.20.30.40'):
        assert s not in html


def test_pii_check_detects():
    for s in ('<p>010-1234-5678</p>', '<p>a.b@c.kr</p>', '<p>192.168.0.1</p>', '<p>02-123-4567</p>'):
        assert explain.pii_hits(s), s
    assert explain.pii_hits('<p>2025-09-07 PRJ-11350-0100 제2025-931호 1,154건 91.6%</p>') == []


def test_byte_identical(tmp_path):
    root = make_root(tmp_path, with_pii=True)
    a, b = str(tmp_path / 'a.html'), str(tmp_path / 'b.html')
    assert run(root, a).returncode == 0 and run(root, b).returncode == 0
    assert open(a, 'rb').read() == open(b, 'rb').read()
