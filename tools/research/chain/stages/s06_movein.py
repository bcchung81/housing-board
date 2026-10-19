"""06 입주(HOME MOVE_IN): collection_link(청약홈 입주예정월)·evidence_bridge 공고 사실 → 청약홈·LH 공고 상세,
사업 공급계획 행의 입주월·정책 입주 전망(저장소 밖), 그리고 HOME 이 잇지 않은 로컬 입주 원본 교차 후보(지구·블록 이름 대조).
교차 후보 원천은 config stages[06].cross_sources, 원천마다 sources[…].cross(대조 방식·칸·값 글 틀)."""

import os
import re
from collections import OrderedDict, defaultdict

from common import NAME_MATCH, NO_EXTERNAL, digits_date, norm_block, norm_district, name_match
from stages import shared


def home_move_month(R, stage, pid):
    """HOME 이 이 사업에 둔 입주 예정월 전부: collection_link(청약홈), evidence_bridge(LH 공고 등),
    사업 레코드의 공급계획 행(project.payload.rows[].move_in_month). 출처를 함께 돌려준다."""
    ms = defaultdict(set)
    for r in R.rows[stage]:
        if r['project_id'] != pid:
            continue
        if r['HOME_표'] == 'collection_link':
            ms[digits_date(r['HOME_값'].split(' ')[1])[:6]].add('collection_link')
        elif r['HOME_표'] == 'evidence_bridge':
            for m in re.finditer(r'MOVE_IN · (\d{4}-\d{2})', r['HOME_값']):
                ms[digits_date(m.group(1))].add('evidence_bridge')
    for x in R.projects[pid]['payload'].get('rows') or []:
        if x.get('move_in_month'):
            ms[digits_date(x['move_in_month'])[:6]].add('project.rows(LH 공급계획)')
    return {k: sorted(v) for k, v in ms.items() if k}


def ym(d):
    return d[:4] + '-' + d[4:6] if len(d) >= 6 else d


def cross_candidates(R, stage):
    sdir = R.sdir(stage)
    for pid in R.pids:
        pl = R.projects[pid]['payload']
        nd, nb = norm_district(pl.get('district')), norm_block(pl.get('block'))
        if not nd or not nb:
            continue
        hmd = home_move_month(R, stage, pid)
        hm = sorted(hmd)
        hv = ('HOME 입주 예정월 ' + ', '.join('%s(%s)' % (ym(x), '·'.join(hmd[x])) for x in hm)) if hm else ''

        def emit(name, path, pos, val, month, extra, key):
            if hm and month:
                v = '일치' if digits_date(month)[:6] in hm else '불일치'
                note = ('같은 칸: 입주월' if v == '일치' else '다른 칸: 입주월 HOME %s / 원본 %s' % (
                    ', '.join(ym(x) for x in hm), month))
            elif hm:
                v, note = '원본 칸 비어 있음', '같은 지구·블록 행은 있으나 입주월 칸이 비어 있음'
            else:
                v, note = '원천값 수집', NO_EXTERNAL + ' · HOME 입주 근거 없음, 로컬 원본 후보(같은 사업인지 담당 확인 필요)'
            R.add(stage, pid, HOME_표=NAME_MATCH, HOME_근거원천='', HOME_근거키='', HOME_값=hv,
                  HOME_상태='미연결', 원본_자료명=name, 원본_파일=path, 원본_위치=pos + ' · 키: ' + key, 원본_값=val, 대조=v,
                  비고='HOME 이 잇지 않은 교차 후보 · ' + note + extra)

        for key in R.stages[stage]['cross_sources']:
            c = R.src(key)
            x_ = c['cross']
            if x_['match'] == 'district_block':
                cols = c['columns']
                for f in c['files']:
                    fn = os.path.basename(f['path'])
                    for ti, ri, cells in R.S.hwpx[f['path']]:
                        row = dict(zip(cols, cells))
                        if norm_district(row[x_['district_col']]) == nd and norm_block(row[x_['block_col']]) == nb:
                            pos = '표 %d 행 %d' % (ti, ri)
                            R.use(sdir, key, None, (fn, ti, ri),
                                  lambda: OrderedDict(list(row.items()) + [('_file', f['path']), ('_pos', pos)])
                                  )['관련_project_id'].add(pid)
                            emit(f['label'], '%s/%s/원본/%s' % (R.out, c['copy_dir'], fn), pos, x_['value'].format(**row),
                                 row[x_['month_col']], x_['extra'], x_['key'])
            else:
                header, rows = getattr(R.S, key)
                for ln, x in rows:
                    row = dict(zip(header, x))
                    if name_match(row[x_['name_col']], pl.get('district'), pl.get('block')):
                        R.use(sdir, key, None, ln, lambda: dict(row, _ln=ln))['관련_project_id'].add(pid)
                        emit(c['label'], c['path'], 'CSV 행 %d' % ln, x_['value'].format(**row), row[x_['month_col']],
                             x_['extra'], x_['key'])


def run(R, stage):
    shared.bridge(R, stage)
    shared.document_evidence(R, stage)
    for pid in R.pids:
        pr = R.projects[pid]
        pl = pr['payload']
        shared.collection_link(R, stage, pid)
        mv = sorted({x.get('move_in_month') for x in pl.get('rows') or [] if x.get('move_in_month')})
        if mv:
            name, note = R.web_source(pr['source_id'])
            R.no_local(stage, pid, 'project', pr['source_id'], pid, '입주 예정월 %s (공급계획 행)' % ', '.join(mv),
                       pl.get('evidence_url'), '검토', name, note + ' · 사업 자체 원천 기록', plan=True)
        if pl.get('source_move_in_label'):
            R.no_local(stage, pid, 'project', pr['source_id'], pid, '입주 전망 %s' % pl['source_move_in_label'],
                       pl.get('move_in_evidence_url') or pl.get('evidence_url'), '검토', '정책 후속 발표 원문',
                       '정책 문서의 전망값(실제 입주 아님) · 원문은 01.정책 작업 범위', plan=True)
    shared.bridge_notice(R, stage)
    cross_candidates(R, stage)
