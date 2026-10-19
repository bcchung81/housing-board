"""04 건설(HOME CONSTRUCTION): 사업 자체 건설 기록·evidence_bridge 건설 사실 → LH 건설공사현황 PDF,
LH 준공예정 별칭(home_identity_alias) → 준공예정 CSV, 정책 사업의 착공 계획(정책 원문 값, 저장소 밖)."""

from common import same_date, to_int, nz, verdict_from, STATUS_KO
from stages import shared


def own_construction(R, stage):
    sdir = R.sdir(stage)
    pdf_name, pdf_file = R.src('lh_construction_pdf')['label'], R.stage_file('lh_construction_pdf')
    for pid in R.pids:
        pr = R.projects[pid]
        pl = pr['payload']
        if shared.is_source(R, 'lh_construction_pdf', pr['source_id']):
            st, snote = R.own_status(pid, stage, pl.get('start_actual_date'))
            hval = '착공 %s · 공정률 %s%%(%s) · 준공예정 %s · %s호 · 시공 %s' % (
                pl.get('start_actual_date'), pl.get('progress_pct'), pl.get('base_date'), pl.get('completion_plan_date'),
                pl.get('planned_units'), pl.get('contractor'))
            common = dict(HOME_표='project', HOME_근거원천=pr['source_id'], HOME_근거키=pid, HOME_값=hval,
                          HOME_근거_URL=pl.get('evidence_url'), HOME_상태=st)
            row, how = shared.pdf_lookup(R, pid)
            if not row:
                R.add(stage, pid, 원본_자료명=pdf_name, 원본_파일=pdf_file, 대조='원본에서 못 찾음', 비고=how, **common)
                continue
            shared.pdf_use(R, sdir, row, pid)
            units_ok = None if (row['단위'] != '호' or pl.get('planned_units') is None) else \
                to_int(row['공사규모']) == pl.get('planned_units')
            cmp_ = [('착공', same_date(pl.get('start_actual_date'), row['착공일'], True), pl.get('start_actual_date'), row['착공일']),
                    ('준공', same_date(pl.get('completion_plan_date'), row['준공일'], True), pl.get('completion_plan_date'),
                     row['준공일']),
                    ('공사규모(호)', units_ok, pl.get('planned_units'), row['공사규모'] + row['단위']),
                    ('공정률', None if pl.get('progress_pct') is None else float(pl['progress_pct']) == float(row['공정률(%)']),
                     pl.get('progress_pct'), row['공정률(%)']),
                    ('시공회사', None if not pl.get('contractor') else nz(pl.get('contractor')) in nz(row['원문_줄']),
                     pl.get('contractor'), '현장명·시공회사 칸')]
            v, note = verdict_from(cmp_)
            R.add(stage, pid, 원본_자료명=pdf_name, 원본_파일=pdf_file, 원본_위치=shared.pdf_pos(row) + ' · 키: ' + how,
                  원본_값=shared.pdf_val(row), 대조=v, 비고=note + ' · 날짜는 PDF 의 YY-MM-DD 를 20YY 로 읽어 비교 · ' + snote,
                  **common)
        if pl.get('start_plan_year') or pl.get('start_plan_month'):
            R.no_local(stage, pid, 'project', pr['source_id'], pid,
                       '착공 계획 %s · 계획 %s호' % (pl.get('start_plan_month') or str(pl.get('start_plan_year')) + '년',
                                               pl.get('planned_units')),
                       pl.get('evidence_url'), '검토', '정책 원문(%s)' % pr['source_id'],
                       '정책 문서의 계획값(실제 착공 아님) · 원문은 01.정책 작업 범위 · ' + (pl.get('schedule_basis') or ''), plan=True)


def completion_alias(R, stage):
    """HOME 정체성 별칭으로 걸린 LH 준공예정 레코드 중 evidence_bridge 로 나오지 않은 것."""
    comp = R.src('lh_completion_csv')
    bridged = {(r['payload']['project_id'], r['payload']['source_entity_id']) for r in R.D['evidence_bridge']}
    alias_hpr = {}
    for r in R.D['home_identity_alias']:
        alias_hpr.setdefault(r['project_id'], set()).add(
            (r['source_id'], r['source_entity_id'], r['relation_status'], r.get('basis'), r.get('evidence_url'),
             r.get('unit_comparison')))
    nkey = lambda t: tuple('' if x is None else str(x) for x in t)
    for hpr, items in sorted(alias_hpr.items()):
        for pid in sorted(x[1] for x in items if x[1] in R.pids_set):
            for (src, sid, rs, basis, url, ucmp) in sorted(items, key=nkey):
                if not shared.is_source(R, 'lh_completion_csv', src) or (pid, sid) in bridged:
                    continue
                lp = (R.lhcp.get(sid) or {}).get('payload') or {}
                hval = '준공예정 %s · %s호 · %s' % (lp.get('completion_plan_date'), lp.get('planned_units'), lp.get('tenure'))
                common = dict(HOME_표='home_identity_alias', HOME_근거원천=src, HOME_근거키=sid, HOME_값=hval,
                              HOME_근거_URL=url, HOME_상태=STATUS_KO.get(rs, rs))
                hit, how = shared.comp_lookup(R, sid)
                if not hit:
                    R.add(stage, pid, 원본_자료명=comp['label'], 원본_파일=comp['path'], 대조='원본에서 못 찾음', 비고=how,
                          **common)
                    continue
                shared.comp_use(R, R.sdir(stage), hit, pid)
                ln, x = hit
                cdate, cunits, ctype = shared.comp_parts(R, x)
                cmp_ = [('준공예정일', same_date(lp.get('completion_plan_date'), cdate), lp.get('completion_plan_date'), cdate),
                        ('세대수', to_int(lp.get('planned_units')) == to_int(cunits), lp.get('planned_units'), cunits)]
                v, note = verdict_from(cmp_)
                R.add(stage, pid, 원본_자료명=comp['label'], 원본_파일=comp['path'],
                      원본_위치='CSV 행 %d · 키: %s' % (ln, how), 원본_값='준공예정일 %s · 세대수 %s · 공급유형 %s' % (cdate, cunits, ctype),
                      대조=v, 비고=note + ' · HOME 정체성 별칭(사업 호수 비교 %s): %s' % (ucmp, basis), **common)


def run(R, stage):
    shared.bridge(R, stage)
    shared.document_evidence(R, stage)
    own_construction(R, stage)
    completion_alias(R, stage)
    shared.bridge_notice(R, stage)
