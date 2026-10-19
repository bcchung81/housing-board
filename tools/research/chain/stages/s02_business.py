"""02 사업화(HOME BUSINESS): stage_evidence 선택 근거 → LH 건설공사현황 PDF·저장소 밖 원천, 그 밖 HOME 문서 근거."""

from stages import shared


def run(R, stage):
    shared.stage_evidence(R, stage)
    shared.bridge(R, stage)
    shared.document_evidence(R, stage)
    shared.bridge_notice(R, stage)
