"""03 인허가(HOME APPROVAL): stage_evidence 선택 근거 → 건축HUB 주택인허가 대용량·LH 건설공사현황 PDF·고시문(저장소 밖)."""

from stages import shared


def run(R, stage):
    shared.stage_evidence(R, stage)
    shared.bridge(R, stage)
    shared.document_evidence(R, stage)
    shared.bridge_notice(R, stage)
