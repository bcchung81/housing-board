#!/usr/bin/env python3
"""정책 무관 사슬 엔진: 정책 → 프로그램 → 사업 → 02 사업화 · 03 인허가 · 04 건설 · 05 공급 · 06 입주 근거 수집·대조.

실행
    python3 tools/research/chain/run.py --policy <policy_id 또는 slug>
    python3 tools/research/chain/run.py --all

입력(읽기만, 네트워크 없음)
    config/policies.json(정책), config/stage_sources.json(HOME 덤프 판·단계 원천·조인 키·대조 칸·판정 규칙·README 글),
    config/report_notes.json(정책별 사람 확인 메모, 있으면), 저장소 raw 원천, 웹확인_결과.csv·재검증_02-06.csv·
    01.정책/프로그램_원문대조_*.csv(다른 작업), dataset/_work/<policy_id>/policy_sites.jsonl(있으면).
출력
    단계 폴더 추출_<단계>_<slug>.csv·원본/발췌_*_<slug>.csv·README.md, 루트 추적표_<slug>.csv·웹확인_대상_<slug>.csv·README.md,
    01.정책/추출_정책_HOME.csv·추출_프로그램_HOME.csv·추출_<slug>_목표_HOME.csv,
    dataset/_work/<policy_id>/evidence.jsonl(설계 6.1)·report.json.
끝에 엔진 출력 전체에서 덤프 actor 값과 전화번호 형식을 찾아 0건인지 검사하고, 있으면 실패로 끝낸다.
"""

import argparse
import json
import os
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import common  # noqa: E402
from common import p, load_config, write_json, write_jsonl, ACTORS, PHONE_RE  # noqa: E402
import engine  # noqa: E402
import evidence  # noqa: E402
import outputs  # noqa: E402
import report  # noqa: E402
from home import load_home  # noqa: E402


def load_all(config_dir=None):
    cfg = load_config('stage_sources.json', config_dir)
    pols = load_config('policies.json', config_dir)['policies']
    notes_path = os.path.join(config_dir or common.CONFIG_DIR, 'report_notes.json')
    if os.path.exists(notes_path):
        with open(notes_path, encoding='utf-8') as f:
            cfg['report_notes'] = json.load(f).get('notes') or {}
    return cfg, pols


def pick(pols, key):
    hit = [x for x in pols if key in (x['policy_id'], x['slug'])]
    if not hit:
        raise SystemExit('정책 없음: %s (config/policies.json 의 policy_id 또는 slug)' % key)
    return hit[0]


def run_policy(cfg, policy, home, sources):
    R = engine.Run(cfg, policy, home=home, sources=sources).process()
    outputs.clean_policy(R)
    outputs.write_policy_extracts(R)
    sizes = outputs.write_excerpts(R)
    for stage in R.stages:
        outputs.write_stage(R, stage)
    trace = outputs.trace_rows(R)
    outputs.write_trace(R, trace)
    web = outputs.write_web_targets(R)
    order = outputs.write_stage_order(R)
    ev = evidence.build(R)
    write_jsonl(R.work_path('evidence.jsonl'), ev)
    rep = dict(policy_id=policy['policy_id'], slug=policy['slug'], name=policy['name'], sizes=sizes, stage_order=order,
               stage_md={sc['code']: report.stage_section(R, st, trace, sizes) for st, sc in R.stages.items()},
               root_md=report.root_section(R, trace, ev, web))
    write_json(R.work_path('report.json'), rep)
    return R, ev, web


def assemble(cfg, pols):
    reports = []
    for pol in pols:
        path = '%s/%s/report.json' % (cfg['paths']['work_dir'], pol['policy_id'])
        if os.path.exists(p(path)):
            with open(p(path), encoding='utf-8') as f:
                reports.append(json.load(f))
    sizes = {}
    for rep in reports:
        sizes.update(rep['sizes'])
    for sc in cfg['stages']:
        report.stage_readme(cfg, sc, reports, sizes)
    report.root_readme(cfg, reports)
    report.stage_order_md(cfg, reports)


def check_privacy(cfg, pols):
    """엔진이 쓴 파일만 검사한다(원본/web/·01.정책 원 파일·다른 작업 파일은 뺀다)."""
    out = cfg['paths']['research_dir']
    files = [out + '/README.md', out + '/' + cfg['independent']['review']['md'], cfg['paths']['policy_dir'] + '/추출_정책_HOME.csv',
             cfg['paths']['policy_dir'] + '/추출_프로그램_HOME.csv']
    for sc in cfg['stages']:
        d = out + '/' + sc['dir']
        files += [d + '/' + f for f in os.listdir(p(d)) if f.endswith(('.csv', '.md', '.txt'))]
        files += [d + '/원본/' + f for f in os.listdir(p(d + '/원본')) if f.endswith(('.csv', '.md', '.txt'))]
    for pol in pols:
        files += [out + '/추적표_%s.csv' % pol['slug'], out + '/웹확인_대상_%s.csv' % pol['slug'],
                  cfg['paths']['policy_dir'] + '/추출_%s_목표_HOME.csv' % pol['slug']]
        files += ['%s/%s/%s' % (cfg['paths']['work_dir'], pol['policy_id'], x) for x in
                  ('evidence.jsonl', 'report.json', cfg['independent']['review']['csv'])]
    hits = []
    for f in sorted(set(files)):
        if not os.path.exists(p(f)):
            continue
        t = open(p(f), encoding='utf-8-sig', errors='replace').read()
        for a in ACTORS:
            if a in t:
                hits.append((f, 'actor'))
        m = PHONE_RE.search(t)
        if m:
            hits.append((f, 'phone:' + m.group(0)))
    return hits


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--policy', help='policy_id 또는 slug (config/policies.json)')
    g.add_argument('--all', action='store_true', help='config/policies.json 의 모든 정책')
    a = ap.parse_args(argv)
    cfg, pols = load_all()
    todo = pols if a.all else [pick(pols, a.policy)]
    home = load_home(cfg)
    sources = None
    for pol in todo:
        R, ev, web = run_policy(cfg, pol, home, sources)
        sources = R.S
        mapped = sum(1 for x in R.pids if R.subject[x][1])
        items = {(e['subject_table'], e['subject_id'], e['field']) for e in ev}
        print('%s(%s): HOME 레코드 %d → 원장 사업 %d (id 로 바꿈 %d/%d) · evidence %d행·항목 %d · 웹확인 대상 %d' % (
            pol['policy_id'], pol['slug'], len(R.pids), len({R.subject_id(x) for x in R.pids}), mapped, len(R.pids),
            len(ev), len(items), len(web)))
    outputs.write_copies(R)
    assemble(cfg, pols)
    hits = check_privacy(cfg, pols)
    if hits:
        print('개인정보 검사 실패:', hits)
        sys.exit(1)
    print('개인정보 검사: actor %d개 값·전화번호 형식 0건' % len(ACTORS))


if __name__ == '__main__':
    main()
