"""05 공급(HOME SUPPLY): collection_link(청약홈 공고)·evidence_bridge 공고 사실 → 청약홈 Detail·LH 공고 API,
사업 자체 공급계획 예정월(LH 공급계획 웹 목록, 저장소 밖)."""

from stages import shared

PLANNED_SUPPLY = 'PLANNED_SUPPLY'  # HOME project.payload.stage 값: 공급계획 단계


def run(R, stage):
    shared.bridge(R, stage)
    shared.document_evidence(R, stage)
    for pid in R.pids:
        pr = R.projects[pid]
        pl = pr['payload']
        shared.collection_link(R, stage, pid)
        if pl.get('stage') == PLANNED_SUPPLY:
            st, snote = R.own_status(pid, stage, pl.get('schedule_month'))
            name, note = R.web_source(pr['source_id'])
            R.no_local(stage, pid, 'project', pr['source_id'], pid,
                       '공급 예정월 %s · %s호 (%s)' % (pl.get('schedule_month'), pl.get('supply_units'), pl.get('unit_basis')),
                       pl.get('evidence_url'), st, name, note + ' · ' + snote, plan=True)
    shared.bridge_notice(R, stage)
