"""사람이 읽는 출력: 01.정책 추출 3개, 단계 추출 CSV·발췌·원 파일 사본, 추적표, 웹확인 대상. 파일 이름에 정책 slug.

이 모듈이 지우는 파일은 이 정책 slug 가 붙은 자기 출력뿐이다(clean_policy). 원본/web/·01.정책 원 파일은 건드리지 않는다.
"""

import glob
import json
import os
import shutil
from collections import Counter, defaultdict

import pypdf

from common import (p, write_csv, write_text, read_csv_dicts, page_of, VERDICTS, STATUS_ORDER, VERDICT_ORDER, CANDIDATE_TABLES)
from engine import EXTRACT_COLS, BASE_COLS, stage_judgement

PROGRAM_COLS = ['프로그램_원문근거', '프로그램_원문PDF쪽']
TRACE_COLS = ['project_id', '사업_id', '단계', '사업명', '프로그램', '블록_키', '프로그램_원문근거', '프로그램_원문PDF쪽',
              'HOME_단계판정', 'HOME_상태', 'HOME_표', 'HOME_값', '원본_자료명', '원본_값', '대조', '대조_성격', '근거_URL',
              '근거_행수', '근거_대조_집계', '교차_후보_값', '교차_대조']


def stage_cols(sc):
    return (EXTRACT_COLS[:1] + ['사업_id'] + EXTRACT_COLS[1:BASE_COLS] +
            (PROGRAM_COLS + ['블록_키'] if sc.get('program_cols') else []) + EXTRACT_COLS[BASE_COLS:])


def stage_extract_path(R, stage):
    sc = R.stages[stage]
    return '%s/%s/추출_%s_%s.csv' % (R.out, sc['dir'], sc['name'], R.slug)


def clean_policy(R):
    """이 정책의 단계 출력(추출_*_<slug>.csv, 원본/발췌_*_<slug>.csv)을 지운다. 다른 정책·다른 작업 파일은 두고."""
    removed = 0
    for sc in R.stages.values():
        d = p(R.out + '/' + sc['dir'])
        os.makedirs(d + '/원본', exist_ok=True)
        for pat in (d + '/추출_*_%s.csv' % R.slug, d + '/원본/발췌_*_%s.csv' % R.slug):
            for f in glob.glob(pat):
                os.remove(f)
                removed += 1
    return removed


# ---------------------------------------------------------------- 01.정책 추출(HOME 값)

def write_policy_extracts(R):
    D = R.D
    pdir = R.cfg['paths']['policy_dir']
    pol = sorted(D['policy'], key=lambda r: r['payload']['id'])
    write_csv(pdir + '/추출_정책_HOME.csv',
              ['id', '이름', '발표일', '목표(호)', '목표_표기', '범위', '지표', '근거_URL', 'lifecycle', 'evidence_checked',
               '기준일', '비고', 'entity_id', 'source_id'],
              [[r['payload'].get(k) for k in ['id', 'name', 'announced_at', 'target_units', 'assertion', 'target_scope',
                                              'metric', 'evidence_url', 'lifecycle_status', 'evidence_checked',
                                              'base_date', 'note']] + [r['entity_id'], r['source_id']] for r in pol])
    pm = sorted(D['home_program_mapping'], key=lambda r: (r.get('policy_id') or '', r.get('name') or '', r['id']))
    write_csv(pdir + '/추출_프로그램_HOME.csv',
              ['정책_id', '프로그램_id', '프로그램', '상태', '근거_URL', '근거_쪽(#page)', '근거_설명', '생성', '검토',
               'revision_no'],
              [[r.get('policy_id'), r['id'], r.get('name'), r.get('status'), r.get('evidence_url'),
                page_of(r.get('evidence_url')), r.get('basis'), r.get('created_at'), r.get('reviewed_at'),
                r.get('revision_no')] for r in pm])
    out = []
    for r in sorted(D['policy_delivery_plan'], key=lambda x: x['entity_id']):
        d = r['payload']
        if d.get('policy_id') != R.policy['home_policy_id']:
            continue
        url = d.get('evidence_url')
        pg = 'PDF %s쪽 · 인쇄 %s쪽' % (d.get('pdf_page'), d.get('printed_page'))
        out.append(['전체 목표', '', '합계', '%s~%s' % (str(d.get('period_start'))[:4], str(d.get('period_end'))[:4]),
                    d.get('target_units'), '', 'TARGET', url, pg,
                    '표 합계 %s · 반올림 미배분 %s' % (d.get('table_total_units'), d.get('rounding_unallocated_units'))])
        period = out[-1][3]
        for a in d.get('annual') or []:
            out.append(['연도별', '', '합계', a['year'], a['units'], a.get('seoul_units'), 'TARGET', url, pg, ''])
        for pr in d.get('programs') or []:
            out.append(['프로그램군 합계', pr['id'], pr['name'], period, pr.get('target_units'), '', 'TARGET', url, pg, ''])
            for a in pr.get('annual') or []:
                out.append(['프로그램군 연도별', pr['id'], pr['name'], a['year'], a['units'], '', 'TARGET', url, pg, ''])
        for reg, v in sorted((d.get('region_allocations') or {}).items()):
            out.append(['지역 배분', '', reg, period, v if v is not None else '', '', 'TARGET', url, pg,
                        '' if v is not None else '원문 배분 없음(추정하지 않음)'])
        o = d.get('occupancy_outlook') or {}
        for a in o.get('annual') or []:
            out.append(['입주 전망(%s)' % o.get('scope'), '', o.get('metric'), a['year'], a['units'], a.get('seoul_units'),
                        a.get('role'), o.get('evidence_url'),
                        'PDF %s쪽 · 인쇄 %s쪽' % (o.get('pdf_page'), o.get('printed_page')), o.get('adoption_basis')])
        out.append(['비고', '', '', '', '', '', '', url, pg, d.get('note')])
    path = '%s/추출_%s_목표_HOME.csv' % (pdir, R.slug)
    if out:
        write_csv(path, ['구분', '프로그램군_id', '이름', '연도', '호수', '서울_호수', '역할', '근거_URL', '근거_쪽', '비고'], out)
    elif os.path.exists(p(path)):
        os.remove(p(path))
    return len(out)


# ---------------------------------------------------------------- 발췌·사본

def _ids(r):
    return ';'.join(sorted(r['관련_project_id']))


def _sorted_items(recs):
    return sorted(recs.items(), key=lambda kv: str(kv[0]) if not isinstance(kv[0], tuple)
                  else tuple(str(x).zfill(8) for x in kv[0]))


def _free_keys(items, first=()):
    rest = sorted({k for _, r in items for k in r if not k.startswith('_') and k != '관련_project_id' and k not in first})
    return list(first) + rest


def write_excerpts(R):
    S, sizes = R.S, {}
    for sdir, files in sorted(R.used.items()):
        for (key, part), recs in sorted(files.items(), key=lambda kv: (kv[0][0], kv[0][1] or '')):
            items = _sorted_items(recs)
            path = '%s/%s/원본/%s' % (R.out, sdir, R.excerpt_file(key, part))
            if key.startswith('indep:'):
                ks = _free_keys(items)
                write_csv(path, ks + ['원본_파일', '원본_행', '관련_project_id'],
                          [[r.get(k, '') for k in ks] + [r['_file'], r['_pos'], _ids(r)] for _, r in items])
                sizes[path] = len(items)
                continue
            c = R.src(key)
            if key == 'lh_construction_pdf':
                ks = list(S.pdf_rows[0].keys())
                write_csv(path, ks + ['원본_파일', '원본_행', '관련_project_id'],
                          [[r[k] for k in ks] + [c['path'], 'p.%d 줄 %d' % (r['쪽'], r['줄']), _ids(r)] for _, r in items])
            elif key in ('lh_completion_csv', 'movein_reb_csv', 'lh_complex_csv'):
                header = S.comp_header if key == 'lh_completion_csv' else getattr(S, key)[0]
                write_csv(path, header + ['원본_파일', '원본_행', '관련_project_id'],
                          [[r[h] for h in header] + [c['path'], r['_ln'], _ids(r)] for _, r in items])
            elif key == 'hub_bulk':
                write_csv(path, S.hub_cols + ['원본_파일', '원본_행', '관련_project_id'],
                          [[r.get(h, '') for h in S.hub_cols] + [c['zip'] + '!' + S.hub_member, r['_ln'], _ids(r)]
                           for _, r in items])
            elif key == 'applyhome':
                ks = _free_keys(items)
                write_csv(path, ks + ['원본_파일', '원본_행', '관련_project_id'],
                          [[r.get(k, '') for k in ks] + [c['dir'] + '/' + r['_op'] + '.json', 'rows[%d]' % r['_i'], _ids(r)]
                           for _, r in items])
            elif key == 'lh_notice' and part == 'notices':
                ks = _free_keys(items)
                write_csv(path, ks + ['원본_파일', '원본_행', '관련_project_id'],
                          [[r.get(k, '') for k in ks] + [c['notice_dir'] + '/notices.json', 'items[%d]' % r['_i'], _ids(r)]
                           for _, r in items])
            elif key == 'lh_notice' and part == 'details':
                ks = _free_keys(items, (c['key'],))
                write_csv(path, ks + ['원본_파일', '원본_행', '관련_project_id'],
                          [[r.get(k, '') for k in ks] + [c['detail_dir'] + '/details.json', 'rows[%d].%s[%d]' % (
                              r['_i'], c['labels']['detail_block'], r['_k']), _ids(r)] for _, r in items])
            elif key == 'lh_notice' and part == 'supply':
                ks = _free_keys(items, (c['key'],))
                write_csv(path, ks + ['원본_파일', '원본_행', '관련_project_id'],
                          [[r.get(k, '') for k in ks] + [c['notice_dir'] + '/supply.json', 'items[%d].%s[%d]' % (
                              r['_i'], r['_blk'], r['_k']), _ids(r)] for _, r in items])
            elif key == 'movein_hwpx':
                cols = c['columns']
                write_csv(path, cols + ['원본_파일', '원본_행', '관련_project_id'],
                          [[r[k] for k in cols] + [r['_file'], r['_pos'], _ids(r)] for _, r in items])
            else:
                raise ValueError('발췌 형식 없음: %s' % key)
            sizes[path] = len(items)
    return sizes


def write_copies(R):
    """원 파일 사본과 추출 텍스트·표(정책과 무관, 매번 같은 내용으로 다시 쓴다)."""
    S = R.S
    c = R.src('lh_construction_pdf')
    d = '%s/%s/원본/' % (R.out, c['copy_dir'])
    os.makedirs(p(d), exist_ok=True)
    shutil.copyfile(p(c['path']), p(d + os.path.basename(c['path'])))
    write_text(d + c['copy_prefix'] + '_추출텍스트.txt',
               '# pypdf %s 로 추출한 텍스트(쪽 구분 === p.N ===). 원본: %s\n' % (pypdf.__version__, c['path']) + S.pdf_text)
    write_csv(d + c['copy_prefix'] + '_표.csv', list(S.pdf_rows[0].keys()) + ['원본_파일'],
              [list(r.values()) + [c['path']] for r in S.pdf_rows])
    c = R.src('movein_hwpx')
    d = '%s/%s/원본/' % (R.out, c['copy_dir'])
    for f in c['files']:
        fn = os.path.basename(f['path'])
        shutil.copyfile(p(f['path']), p(d + fn))
        write_csv(d + fn.replace('.hwpx', '_표.csv'), c['columns'] + ['원본_파일', '원본_행'],
                  [cells + [f['path'], '표 %d 행 %d' % (ti, ri)] for ti, ri, cells in S.hwpx[f['path']]])


# ---------------------------------------------------------------- 단계 추출·추적표

def write_stage(R, stage):
    sc = R.stages[stage]
    out = []
    for r in R.rows[stage]:
        r2 = dict(r)
        r2['사업_id'] = R.subject_id(r['project_id'])
        if sc.get('program_cols'):
            r2['프로그램_원문근거'], r2['프로그램_원문PDF쪽'] = R.prog_cols(r['project_id'])
            r2['블록_키'] = R.block_key(r['project_id'])
        out.append(r2)
    write_csv(stage_extract_path(R, stage), stage_cols(sc), out)


def stage_counts(rows):
    return Counter(r['대조'] for r in rows)


def primary(rows_for):
    """대표 행: HOME 자신의 근거 행 중에서 고른다. 이름 대조 후보(HOME 미연결)는 대표가 되지 않는다."""
    rows_for = [r for r in rows_for if r['HOME_표'] not in CANDIDATE_TABLES]

    def key(r):
        return (STATUS_ORDER.get(r['HOME_상태'], 9), VERDICT_ORDER.get(r['대조'], 9),
                0 if r['HOME_표'] in ('stage_evidence', 'project', 'collection_link') else 1,
                r['HOME_표'], r['HOME_근거키'] or '', r['원본_위치'])
    return sorted(rows_for, key=key)[0]


def trace_rows(R):
    out = []
    for pid in R.pids:
        for stage, sc in R.stages.items():
            rs_all = [r for r in R.rows[stage] if r['project_id'] == pid]
            rs = [r for r in rs_all if r['HOME_표'] not in CANDIDATE_TABLES]
            cx = [r for r in rs_all if r['HOME_표'] in CANDIDATE_TABLES]
            pr = primary(rs)
            pc = R.prog_cols(pid)
            out.append(dict(zip(TRACE_COLS, [
                pid, R.subject_id(pid), sc['dir'], pr['사업명'], pr['프로그램'], R.block_key(pid), pc[0], pc[1],
                stage_judgement(R, pid, stage), pr['HOME_상태'], pr['HOME_표'], pr['HOME_값'],
                pr['원본_자료명'], pr['원본_값'], pr['대조'], pr['대조_성격'], pr['HOME_근거_URL'], len(rs),
                '; '.join('%s %d' % (v, c) for v, c in sorted(stage_counts(rs).items(), key=lambda kv: VERDICTS.index(kv[0]))),
                ' | '.join('%s: %s' % (r['원본_자료명'], r['원본_값']) for r in cx),
                '; '.join('%s %d' % (v, c) for v, c in sorted(stage_counts(cx).items(), key=lambda kv: VERDICTS.index(kv[0])))])))
    return out


def write_trace(R, trace):
    write_csv('%s/추적표_%s.csv' % (R.out, R.slug), TRACE_COLS, trace)


# ---------------------------------------------------------------- 웹확인 대상

def saved_urls(R):
    """저장소에 원 파일이 있는 URL: 각 단계 원본/web·01.정책 원본 manifest 의 url(·also_from·identical),
    웹확인_결과.csv 에서 저장파일이 있는 url."""
    urls = set()
    pats = [R.out + '/*/원본/web/manifest.json', R.cfg['paths']['policy_dir'] + '/원본/*/manifest.json']
    for pat in pats:
        for f in sorted(glob.glob(p(pat))):
            with open(f, encoding='utf-8') as fh:
                m = json.load(fh)
            for e in list((m.get('files') or {}).values()) + list(m.get('identical') or []):
                if e.get('url'):
                    urls.add(e['url'])
                for a in e.get('also_from') or []:
                    if isinstance(a, dict) and a.get('url'):
                        urls.add(a['url'])
                    elif isinstance(a, str):
                        urls.add(a)
    wp = R.cfg['web_result']['path']
    if os.path.exists(p(wp)):
        for w in read_csv_dicts(wp):
            if w.get('저장파일') and w.get('url'):
                urls.add(w['url'])
    return urls


def write_web_targets(R):
    have = saved_urls(R)
    agg = defaultdict(lambda: {'ids': set(), 'subj': set(), 'vals': set()})
    for stage, sc in R.stages.items():
        for r in R.rows[stage]:
            u = r['HOME_근거_URL']
            if r['대조'] == '원본 없음' and u and u not in have:
                e = agg[(sc['dir'], u)]
                e['ids'].add(r['project_id'])
                e['subj'].add(R.subject_id(r['project_id']))
                e['vals'].add('%s: %s' % (r['project_id'], r['HOME_값']))
    out = []
    for (sdir, u) in sorted(agg):
        e = agg[(sdir, u)]
        out.append([sdir, u, ';'.join(sorted(e['ids'])), ';'.join(sorted(e['subj'])), len(e['subj']),
                    ' | '.join(sorted(e['vals']))])
    write_csv('%s/웹확인_대상_%s.csv' % (R.out, R.slug),
              ['단계', 'url', '관련_project_id', '관련_사업_id', '사업_수', '확인할 값'], out)
    return out


# ---------------------------------------------------------------- 단계 순서 검토 목록

STAGE_ORDER_COLS = ['subject_id', 'project_id', '단계', 'HOME_주장', '원천_탐색', '탐색_결과', '추정_원인']


def write_stage_order(R):
    """_work/<policy_id>/review_stage_order.csv: 단계 순서 모순(미도달로 두지 않은 것) 목록."""
    rows = sorted(R.order_issues, key=lambda x: (x['subject_id'], x['project_id'], x['단계']))
    write_csv(R.work_path(R.cfg['independent']['review']['csv']), STAGE_ORDER_COLS, rows)
    return rows
