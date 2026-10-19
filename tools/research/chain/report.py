"""README 만들기. 정책 실행마다 단계·루트 README 의 정책 절(마크다운 조각)과 집계를 _work/<policy_id>/report.json 에 두고,
assemble() 이 config 의 정책 순서대로 있는 report.json 을 모아 단계 폴더 README.md·루트 README.md 를 다시 쓴다
(--policy 로 하나만 돌려도 다른 정책 절이 지워지지 않는다).
"""

import csv
import os
import re
from collections import Counter

from common import p, write_text, VERDICTS, STATUS_ORDER, VERDICT_EN, CONFIRMED_VERDICTS
from outputs import stage_counts, stage_extract_path

T_STAGE, T_VERDICT, T_STATUS, T_JUDGE = '단계', '대조', 'HOME_상태', 'HOME_단계판정'
MANAGED = '이 파일은 `python3 tools/research/chain/run.py --all` 이 만든다. 손으로 고치지 말고 다시 돌린다.'


def _count_line(c, keys):
    return ' · '.join('%s %d' % (k, c.get(k, 0)) for k in keys)


def check_reverify(R):
    """재검증 CSV(다른 작업 산출물, 읽기만)의 '수정 필요' 행이 지금 판정과 같은지 스스로 대조한다."""
    rc = R.cfg['reverify']
    if not os.path.exists(p(rc['path'])):
        return []
    srcmap = [(needle, R.src(key).get('path') or R.src(key).get('zip'), pat) for needle, key, pat in rc['srcmap']]
    expect = {k: tuple(v) for k, v in rc['expect'].items()}
    stage_of = {sc['dir']: k for k, sc in R.stages.items()}
    out = []
    pids = R.pids_set
    with open(p(rc['path']), encoding='utf-8-sig', newline='') as f:
        for w in csv.DictReader(f):
            if w.get('결과') != '수정 필요' or w.get('project_id') not in pids:
                continue
            st = stage_of.get(w['단계'])
            m = re.search(r'행 (\d+)', w['원본_위치'])
            src = [x for x in srcmap if x[0] in w['원본_위치']]
            mine = []
            if st and m and src:
                mine = [r for r in R.rows[st] if r['project_id'] == w['project_id'] and r['원본_파일'] == src[0][1]
                        and (src[0][2] % m.group(1)) in r['원본_위치'] + ' ']
            exp = w['재검증_대조']
            if exp == '근거없음':
                ok = not mine
                got = '후보 행 없음(다른 지구 행이 붙지 않음)' if ok else '; '.join(r['대조'] for r in mine)
            elif exp in expect:
                v, needle = expect[exp]
                ok = bool(mine) and all(r['대조'] == v and (needle is None or needle in r['비고']) for r in mine)
                got = '; '.join('%s(%s)' % (r['대조'], r['대조_성격']) for r in mine) or '행 없음'
            else:
                ok, got = False, '판정 대응 없음'
            out.append((w['단계'], w['project_id'], w['원본_위치'], exp, got, ok))
    return out


# ---------------------------------------------------------------- 정책 실행의 조각

def pct(a, n):
    return 100.0 * a / n if n else 0.0


def confirmed(es, with_absent=True):
    """설계 1절: verdict ∈ {MATCH, MISMATCH, SOURCED, NOT_IN_SOURCE, ABSENT_CONFIRMED} 이고 basis ≠ EXISTENCE 인 행이 하나라도 있음."""
    ok = set(CONFIRMED_VERDICTS) - (set() if with_absent else {'ABSENT_CONFIRMED'})
    return any(e['verdict'] in ok and e['basis'] != 'EXISTENCE' for e in es)


def m1_counts(items):
    by = {}
    for k, es in items.items():
        a = by.setdefault(k[2], [0, 0, 0])
        a[0] += 1
        a[1] += confirmed(es)
        a[2] += confirmed(es, False)
    return {'by_field': by, 'with': sum(confirmed(es) for es in items.values()),
            'without': sum(confirmed(es, False) for es in items.values()),
            'independent': sum(1 for es in items.values() if any(
                e['basis'] == 'INDEPENDENT' and e['verdict'] in CONFIRMED_VERDICTS for e in es))}


def independent_section(R, items):
    """독립 수집 경로 집계, 남은 UNVERIFIED 묶음(단계·이유), 단계 순서 모순 목록."""
    st = getattr(R, 'indep_stats', {}) or {}
    why = getattr(R, 'indep_why', {}) or {}
    issues = getattr(R, 'order_issues', []) or []
    left = Counter()
    for k, es in items.items():
        if confirmed(es):
            continue
        if k[0] == 'links':
            left[(k[2], es[0]['notes'].split(' · ')[0][:60])] += 1
        else:
            left[(k[2], why.get((k[1], k[2][-2:]), 'HOME 근거만 있고 원천 대조 안 됨'))] += 1
    L = ['', '### 독립 수집(HOME 연결 없이 위치 키로 원천 찾기)', '',
         '원장 행(HOME 유래 제외) → 원 레코드 %d건 · 원 레코드 재확인 경로가 없는 원장 행 %d. 규칙·원천·범위는 `config/stage_sources.json` 의 independent.' % (
             st.get('원장 행 → 원 레코드', 0), st.get('원장 행(경로 없음)', 0)), '',
         '남은 미확인 항목(단계·이유):', '']
    for (f, w), n in sorted(left.items(), key=lambda kv: (kv[0][0], -kv[1], kv[0][1])):
        L.append('- %s · %s: %d' % (f, w, n))
    if not left:
        L.append('- 없음')
    causes = Counter(x['추정_원인'] for x in issues)
    L += ['', '단계 순서 모순(미도달로 두지 않고 UNVERIFIED 로 둔 것) %d건%s — 목록 `dataset/_work/%s/%s`, 사람용 `%s`.' % (
        len(issues), (' (' + ', '.join('%s %d' % kv for kv in sorted(causes.items())) + ')') if causes else '',
        R.policy['policy_id'], R.cfg['independent']['review']['csv'], R.cfg['independent']['review']['md'])]
    return L


def stage_order_md(cfg, reports):
    """검토_단계순서.md: 정책별 단계 순서 모순 목록(사람용). 행은 각 정책 report.json 의 stage_order."""
    rv = cfg['independent']['review']
    L = ['# 단계 순서 검토', '', MANAGED, '',
         '뒤 단계(착공·공고·입주)에 원천 근거가 있거나 HOME 이 그 단계 이상을 주장하는데, 앞 단계(인허가·착공) 원천 기록을 위치 키로 찾지 못한 사업이다. '
         '미도달(ABSENT_CONFIRMED)로 두지 않고 UNVERIFIED 로 두었다. ' + cfg['independent']['order_note'], '', rv['note'], '']
    for rep in reports:
        rows = rep.get('stage_order') or []
        L += ['## %s (`%s`) — %d건' % (rep.get('name', rep['slug']), rep['policy_id'], len(rows)), '']
        if not rows:
            L += ['- 없음', '']
            continue
        L += ['| 사업 | HOME 레코드 | 단계 | HOME 주장·근거 단계 | 추정 원인 | 탐색 결과 |', '|---|---|---|---|---|---|']
        for x in rows:
            L.append('| `%s` | `%s` | %s | %s | %s | %s |' % (x['subject_id'], x['project_id'], x['단계'], x['HOME_주장'],
                                                      x['추정_원인'], x['탐색_결과'].replace('|', '/')))
        L.append('')
    write_text(cfg['paths']['research_dir'] + '/' + rv['md'], '\n'.join(L))


def stage_section(R, stage, trace, sizes):
    sc = R.stages[stage]
    sdir = sc['dir']
    rows = R.rows[stage]
    c = stage_counts(rows)
    st = Counter(r['HOME_상태'] for r in rows)
    tr = Counter(x[T_VERDICT] for x in trace if x[T_STAGE] == sdir)
    trs = Counter(x[T_STATUS] for x in trace if x[T_STAGE] == sdir)
    trj = Counter(x[T_JUDGE] for x in trace if x[T_STAGE] == sdir)
    bad = [r for r in rows if r['대조'] == '불일치'][:3]
    srcs_d = {}
    for r in rows:
        if r['원본_자료명'] and r['대조'] != '원본 없음':
            for f in r['원본_파일'].split('; '):
                srcs_d.setdefault(r['원본_자료명'], set()).add(f)
    fname = os.path.basename(stage_extract_path(R, stage))
    L = ['## %s (%s, `%s`)' % (R.policy['name'], R.policy['policy_id'], fname), '',
         '사업 레코드 %d건(원장 사업 %d) · 추출 %d행(사업×근거).' % (
             len(R.pids), len({R.subject_id(x) for x in R.pids}), len(rows)), '', '쓴 원천:', '']
    for n, fs in sorted(srcs_d.items()):
        L.append('- %s — `%s`' % (n, '`, `'.join(sorted(fs))))
    if not srcs_d:
        L.append('- 원본으로 대조한 행 없음')
    L += ['', '| 대조 | 행 | 존재 확인 | 같은 원천 재확인 | 독립 원천 대조 | verdict |', '|---|---:|---:|---:|---:|---|']
    cn = Counter((r['대조'], r['대조_성격']) for r in rows)
    for v in VERDICTS:
        L.append('| %s | %d | %d | %d | %d | %s |' % (v, c.get(v, 0), cn.get((v, '존재 확인'), 0),
                                                    cn.get((v, '같은 원천 재확인'), 0), cn.get((v, '독립 원천 대조'), 0),
                                                    VERDICT_EN[v]))
    L += ['', 'HOME_상태별 행: ' + ' · '.join('%s %d' % (k, st[k]) for k in sorted(st, key=lambda x: STATUS_ORDER.get(x, 9))),
          '',
          '추적표(`../추적표_%s.csv`, 사업 레코드당 대표 1행, %d행): ' % (R.slug, len(R.pids)) + _count_line(tr, VERDICTS) +
          ' / HOME_상태 ' + ' · '.join('%s %d' % (k, trs[k]) for k in sorted(trs, key=lambda x: STATUS_ORDER.get(x, 9))),
          '', 'HOME 단계 판정(`HOME_단계판정`): ' + ' · '.join('%s %d' % (k, trj[k]) for k in sorted(trj)) + '.', '']
    ws = R.web_stats
    L += ['웹 원문 반영: "원본 없음" 행 중 %d행을 `../웹확인_결과.csv`(다른 작업, 읽기만)로 채웠다(%s). 남은 원본 없음 %d행.' % (
        ws.get((sdir, '해소'), 0),
        ', '.join('%s %d' % (k[1][3:], v) for k, v in sorted(ws.items(), key=str)
                  if isinstance(k, tuple) and k[0] == sdir and k[1].startswith('해소:')) or '없음',
        c.get('원본 없음', 0)), '']
    if sc.get('program_cols'):
        pc, none_ids = Counter(), set()
        for pid in R.pids:
            raw = R.prog_cols(pid)[0]
            v = (R.prog_check.get(R.projects[pid]['payload'].get('program') or '') or {}).get('verdict')
            pc[raw if len(raw) <= 20 else raw[:20] + '…'] += 1
            if v != 'MATCH':
                none_ids.add(pid)
        progs = Counter(R.projects[pid]['payload'].get('program') for pid in none_ids)
        L += ['프로그램 원문 근거(`프로그램_원문근거`·`프로그램_원문PDF쪽` 칸, `../01.정책/프로그램_원문대조_*.csv`): ' +
              ' · '.join('%s %d' % kv for kv in sorted(pc.items(), key=lambda kv: (-kv[1], kv[0]))) +
              '. **원문 일치가 아닌 프로그램에 걸린 사업 레코드 %d** (%s).' % (
                  len(none_ids), ', '.join('%s %d' % kv for kv in sorted(progs.items(), key=lambda kv: (-kv[1], kv[0])))
                  or '없음'), '']
    L += ['불일치 대표 사례:', '']
    for r in bad:
        L.append('- `%s` %s — HOME: %s / 원본(%s, %s): %s — %s' % (r['project_id'], r['사업명'], r['HOME_값'],
                                                               r['원본_자료명'], r['원본_위치'], r['원본_값'], r['비고']))
    if not bad:
        L.append('- 불일치 행 없음')
    L.append('')
    return '\n'.join(L)


def root_section(R, trace, ev, web_targets):
    pids = R.pids
    keys = Counter(R.block_key(pid) for pid in pids)
    with_block = sum(v for k, v in keys.items() if k)
    nob = keys.get('', 0)
    uniq = len([k for k in keys if k])
    multi = {k: v for k, v in keys.items() if k and v > 1}
    subj = {R.subject_id(x) for x in pids}
    by_kind = Counter(R.subject[x][1] or '못 바꿈' for x in pids)
    mapped = sum(1 for x in pids if R.subject[x][1])
    pcheck = R.prog_check
    none_prog = Counter(R.projects[pid]['payload'].get('program') for pid in pids
                        if (pcheck.get(R.projects[pid]['payload'].get('program') or '') or {}).get('verdict') != 'MATCH')
    pol = R.policy
    L = ['## %s — `%s`' % (pol['name'], pol['policy_id']), '',
         '출력: `추적표_%s.csv`, `웹확인_대상_%s.csv`, 각 단계 `추출_<단계>_%s.csv`·`원본/발췌_*_%s.csv`, '
         '`dataset/_work/%s/evidence.jsonl`.' % (pol['slug'], pol['slug'], pol['slug'], pol['slug'], pol['policy_id']), '',
         '### 사슬', '',
         '정책 원문(`%s/`) → HOME 프로그램 %d (원문 대조 MATCH %d · 그 밖 %d, `01.정책/프로그램_원문대조_*.csv`) '
         '→ HOME 사업 레코드 %d건 → 원장 사업 %d → 단계 근거(02~06 추출 합계 %d행).' % (
             os.path.relpath(pol['docs_dir'], R.out), len(pcheck), sum(1 for v in pcheck.values() if v['verdict'] == 'MATCH'),
             sum(1 for v in pcheck.values() if v['verdict'] != 'MATCH'), len(pids), len(subj),
             sum(len(v) for v in R.rows.values())), '',
         '- **사업 합침**: 레코드 %d건 중 %d건(%.1f%%)을 원장 사업 id(`schemas/ledger-2026-10/mappings/home-ids.json`, '
         'home-source.js 키 순위)로 바꿨다(%s). 못 바꾼 것은 `HOME:<PRO id>`. 합친 뒤 사업 %d.' % (
             len(pids), mapped, 100.0 * mapped / len(pids) if pids else 0,
             ', '.join('%s %d' % kv for kv in sorted(by_kind.items())), len(subj)),
         '- 블록 키(시도|정규화 지구|정규화 블록): 블록 있음 %d건(고유 블록 %d, 2건 이상 걸린 블록 %d개·%d건) + 블록 없음 %d건.' % (
             with_block, uniq, len(multi), sum(multi.values()), nob),
         '- 원문 일치가 아닌 프로그램에 걸린 사업 레코드: %d (%s).' % (
             sum(none_prog.values()), ', '.join('%s %d' % kv for kv in sorted(none_prog.items(), key=lambda kv: (-kv[1], kv[0])))
             or '없음'),
         '- 정책 원문 지명(`dataset/_work/%s/policy_sites.jsonl`): %s.' % (
             pol['policy_id'], '없음 — 지명 연결 건너뜀' if R.sites is None else '%d행' % len(R.sites)), '',
         '### 단계별 집계', '',
         '추출 CSV(사업 레코드×근거) 기준. [ ] 안은 추적표 대표 행 수.', '',
         '| 단계 | 행 | 일치(존재/같은 원천/독립) | 불일치(같은 원천/독립) | 원천값 수집 | 미도달 확인 | 비교 불가 | 못 찾음 | 칸 비어 있음 | 수집 범위 밖 | 원본 없음 | 근거없음 |',
         '|---|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|']
    for stage, sc in R.stages.items():
        sdir = sc['dir']
        rs = R.rows[stage]
        c = stage_counts(rs)
        cn = Counter((r['대조'], r['대조_성격']) for r in rs)
        tc = Counter(x[T_VERDICT] for x in trace if x[T_STAGE] == sdir)
        L.append('| %s | %d | %d (%d/%d/%d) [%d] | %d (%d/%d) [%d] | %d | %d | %d | %d | %d | %d | %d [%d] | %d [%d] |' % (
            sdir, len(rs), c.get('일치', 0), cn.get(('일치', '존재 확인'), 0), cn.get(('일치', '같은 원천 재확인'), 0),
            cn.get(('일치', '독립 원천 대조'), 0), tc.get('일치', 0), c.get('불일치', 0),
            cn.get(('불일치', '같은 원천 재확인'), 0), cn.get(('불일치', '독립 원천 대조'), 0), tc.get('불일치', 0),
            c.get('원천값 수집', 0), c.get('미도달 확인', 0), c.get('비교 불가', 0), c.get('원본에서 못 찾음', 0), c.get('원본 칸 비어 있음', 0), c.get('수집 범위 밖', 0),
            c.get('원본 없음', 0), tc.get('원본 없음', 0), c.get('근거없음', 0), tc.get('근거없음', 0)))
    items = {}
    for e in ev:
        items.setdefault((e['subject_table'], e['subject_id'], e['field']), []).append(e)
    vb = Counter((e['verdict'], e['basis'] or '-') for e in ev)
    m1 = m1_counts(items)
    L += ['', '### evidence(`dataset/_work/%s/evidence.jsonl`)' % pol['policy_id'], '',
          '행 %d · 항목 %d(사업×단계 %d, 프로그램→사업 연결 %d). 설계 1절 M1(원문 대조 전 중간값): 미도달 확인 포함 %d(%.1f%%) · '
          '제외 %d(%.1f%%) · 독립 원천(INDEPENDENT) 근거가 있는 항목 %d.' % (
              len(ev), len(items), sum(1 for k in items if k[0] != 'links'), sum(1 for k in items if k[0] == 'links'),
              m1['with'], pct(m1['with'], len(items)), m1['without'], pct(m1['without'], len(items)), m1['independent']), '',
          '| 항목 | 수 | 확인(미도달 포함) | 확인(미도달 제외) |', '|---|---:|---:|---:|']
    for f in sorted(m1['by_field']):
        a = m1['by_field'][f]
        L.append('| %s | %d | %d | %d |' % (f, a[0], a[1], a[2]))
    L += ['', '| verdict | basis | 행 |', '|---|---|---:|']
    for (v, b), n in sorted(vb.items()):
        L.append('| %s | %s | %d |' % (v, b, n))
    L += independent_section(R, items)
    ws = R.web_stats
    rv = check_reverify(R)
    L += ['', '### 웹 확인·재검증', '',
          '- 웹 원문(`웹확인_결과.csv`, 다른 작업)으로 채운 "원본 없음" 행: ' +
          ', '.join('%s %d' % (sc['dir'], ws.get((sc['dir'], '해소'), 0)) for sc in R.stages.values()) +
          '. 저장소에 원 파일이 없어 웹 확인이 남은 HOME 근거 URL %d개(단계×URL) → `웹확인_대상_%s.csv`.' % (
              len(web_targets), pol['slug'])]
    if rv:
        L.append('- 재검증(`재검증_02-06.*`) "수정 필요" %d행 중 지금 판정이 재검증 판정과 같은 행 %d.' % (
            len(rv), sum(1 for x in rv if x[5])))
        for x in rv:
            if not x[5]:
                L.append('  - 다름: %s `%s` %s — 재검증 %s / 지금 %s' % x[:5])
    bad = [(sc['dir'], r) for st, sc in R.stages.items() for r in R.rows[st] if r['대조'] == '불일치']
    nf = [(sc['dir'], r) for st, sc in R.stages.items() for r in R.rows[st]
          if r['대조'] == '원본에서 못 찾음' and '/원본/web/' in r['원본_파일']]
    notes = (R.cfg.get('report_notes') or {}).get(pol['policy_id']) or []
    L += ['', '### 주요 불일치·HOME 수정 제안', '']
    n = 1
    if none_prog:
        L.append('%d. **원문에 없는 프로그램 = 사업 레코드 %d건**: %s. 정책과 이 사업들을 잇는 원문 근거가 없다(`01.정책/프로그램_원문대조_*.csv`).' % (
            n, sum(none_prog.values()), ', '.join('%s(사업 %d)' % (k, none_prog.get(k, 0)) for k in sorted(none_prog))))
        n += 1
    for sdir, r in bad:
        L.append('%d. **%s 불일치** `%s` %s — HOME 값: %s / 원본(%s): %s' % (
            n, sdir, r['project_id'], r['사업명'], r['HOME_값'], r['원본_파일'], r['원본_값']))
        n += 1
    if nf:
        L.append('%d. **웹 원문에서 못 찾음 %d행**: %s — HOME 근거 URL 이 값이 없는 게시물로 이어져 있다(`웹확인_결과.md`). 근거 URL 교체 필요.' % (
            n, len(nf), ', '.join(sorted({r['사업명'] for _, r in nf}))))
        n += 1
    corr = sum(1 for st in R.stages for r in R.rows[st]
               if '정정공고 게시일' in r['비고'])
    if corr:
        L.append('%d. **정정공고 날짜**: LH 공고 행 중 공고일과 게시일이 다른 행 %d. HOME 문서 근거는 공고일, HOME lh_notice 표는 게시일을 써서 HOME 안에서 두 날짜가 섞인다.' % (n, corr))
        n += 1
    if multi:
        L.append('%d. **같은 블록 중복 등록**: 고유 블록 %d개 중 %d개에 사업 레코드가 2건 이상(%d건). 원장 사업 id 로 합쳐 세야 한다(evidence 의 subject_id).' % (
            n, uniq, len(multi), sum(multi.values())))
        n += 1
    for x in notes:
        L.append('%d. %s' % (n, x))
        n += 1
    if n == 1:
        L.append('- 없음')
    L.append('')
    return '\n'.join(L)


# ---------------------------------------------------------------- 모으기

def stage_readme(cfg, stage_cfg, reports, sizes):
    rt = stage_cfg['readme']
    out = cfg['paths']['research_dir']
    sdir = stage_cfg['dir']
    L = ['# %s — 정책 사업 %s 단계 원천 대조' % (sdir, stage_cfg['name']), '', MANAGED, '',
         '## 단계 정의', '', rt['define'], '',
         'HOME 단계 코드 대응: ' + ', '.join('%s=%s %s' % (s['home_stage'], s['code'], s['name']) for s in cfg['stages']) + '.', '',
         '## 연결 방법', '', rt['link'], '', cfg['normalization_note'], '',
         '## 판정 값', '', cfg['verdict_note'], '']
    ic = cfg.get('independent')
    if ic:
        code = stage_cfg['code']
        srcs = [c for c in ic['sources'].values() if code in c['stages']]
        L += ['## 독립 수집(HOME 연결 없이 위치 키로 원천 찾기)', '', ic['description'], '',
              '이 단계에서 찾는 원천: ' + ', '.join('%s(%s)' % (c['label'], ', '.join(x[0] for x in c['stages'][code])) for c in srcs) + '.', '',
              ic['keys']['note'], '']
        if code in ic['absent']:
            L += ['미도달 확인 규칙: ' + ic['absent'][code]['note'] + ' ' + ic['order_note'], '']
    for rep in reports:
        L.append(rep['stage_md'][stage_cfg['code']])
    L += ['## 원본/ 폴더', '']
    d = p(out + '/' + sdir + '/원본')
    for f in sorted(os.listdir(d)) if os.path.isdir(d) else []:
        if f == 'web':
            L.append('- `web/` — 다른 작업(웹 원문 확인)이 받은 원 파일·manifest.json·Exa 응답. 엔진은 읽기만 한다.')
            continue
        n = sizes.get(out + '/' + sdir + '/원본/' + f)
        L.append('- `%s`%s' % (f, ' — 발췌 %d행' % n if n is not None else ''))
    copy_dirs = sorted({c['copy_dir'] for c in cfg['sources'].values() if c.get('copy_dir')} - {sdir})
    if stage_cfg.get('uses_pdf_copy') and copy_dirs:
        L.append('- 원 파일 사본과 전체 추출 텍스트·표는 %s 에 있다.' % ', '.join('`../%s/원본/`' % x for x in copy_dirs))
    L += ['', '발췌 CSV 는 원 칸 이름을 그대로 두고 `원본_파일`·`원본_행`·`관련_project_id` 칸을 덧붙였다. 대용량 JSON 은 복사하지 않고 발췌만 두었다. 전화번호 칸은 뺐다.', '',
          '## 한계', '']
    for x in rt['limit']:
        L.append('- ' + x)
    L += ['- 웹 원문으로도 남은 원본 없음 행의 HOME 근거 URL 은 `../웹확인_대상_<slug>.csv` 에 있다(엔진은 네트워크를 쓰지 않는다).',
          '- HOME 덤프의 담당자 이름은 출력하지 않는다. 자유 문장에 섞인 이름은 [담당자]로 바꿨다.', '']
    write_text(out + '/' + sdir + '/README.md', '\n'.join(L))


def root_readme(cfg, reports):
    out = cfg['paths']['research_dir']
    L = ['# 정책 → 입주 사업 단계별 원천 근거', '',
         '이 폴더의 02~06 단계 산출물(README.md, `추출_*_<slug>.csv`, `원본/` 의 발췌·사본), 루트 `추적표_<slug>.csv`·`웹확인_대상_<slug>.csv`·이 README, '
         '`01.정책/추출_*_HOME.csv`, `dataset/_work/<policy_id>/evidence.jsonl`·`report.json` 은 `tools/research/chain/run.py` 가 만든다. '
         '`01.정책/` 의 다른 파일, 각 단계 `원본/web/`, `출처_통합.csv`, `웹확인_결과.*`, `재검증_*.*` 는 다른 작업의 산출물이고 엔진은 읽기만 한다.', '',
         '## 목적', '',
         '정책(`tools/research/chain/config/policies.json`)마다 HOME 덤프에서 그 정책에 걸린 사업을 골라 사업화 → 인허가 → 건설 → 공급 → 입주 단계별로 따라가며, '
         'HOME 값과 원본(저장소 원천 파일, 웹 원문)을 대조한 결과를 남긴다. 추측하지 않고, 찾지 못한 것은 찾지 못했다고 적는다. '
         '계약(항목·verdict·basis)은 `파이프라인_설계.md`.', '',
         '## 폴더', '', '| 폴더 | 내용 |', '|---|---|',
         '| `01.정책/` | 정책 원문, 값·프로그램 원문 대조(README 참고). `추출_*_HOME.csv` 는 엔진 |']
    for s in cfg['stages']:
        L.append('| `%s/` | %s |' % (s['dir'], s['readme']['summary']))
    L += ['| `dataset/_work/<policy_id>/` | `evidence.jsonl`(설계 6.1 중간 출력), `report.json`(README 조각), 다른 작업의 `policy_sites.jsonl` 등 |',
          '| 루트 | `추적표_<slug>.csv`(사업 레코드×단계 대표 1행, `사업_id` = 원장 사업 id), `웹확인_대상_<slug>.csv`, `출처_통합.csv`·`웹확인_결과.*`·`재검증_02-06.*`(다른 작업) |',
          '', '판정 값: ' + cfg['verdict_note'], '']
    for rep in reports:
        L.append(rep['root_md'])
    L += ['## 원본 파일의 개인정보 주의', '',
          '- 엔진이 만든 CSV·MD·TXT·JSONL 에는 HOME 덤프의 담당자 이름(actor)과 전화번호 형식이 0건이다(실행 끝에 검사, 자유 문장 속 이름은 [담당자]).',
          '- 그러나 `01.정책/원본/`, 각 단계 `원본/web/` 의 **정부 원문 파일(보도자료·고시문 HWP/PDF)과 Exa 응답에는 담당 공무원 이름과 사무실 전화번호가 원문 그대로 있다.** 발표 자료로 옮기거나 공유할 때 그 부분을 지우거나 인용하지 않는다. 이 검사는 원문 파일을 대상에서 뺀다.',
          '- 청약홈 API 의 견본주택 전화번호 칸은 발췌에서 뺐다.', '',
          '## 재현', '', '```', 'python3 tools/research/chain/run.py --all', 'python3 tools/research/chain/run.py --policy <policy_id 또는 slug>', '```', '',
          '같은 입력이면 바이트까지 같은 결과를 낸다(정렬 고정, 실행 시각을 파일에 넣지 않음; evidence 의 checked_at 은 설정 값 또는 웹 원문 받은 날). '
          '엔진은 단계 폴더에서 그 정책 slug 가 붙은 자기 출력만 지우고 다시 쓴다. 네트워크를 쓰지 않는다.', '']
    write_text(out + '/README.md', '\n'.join(L))
