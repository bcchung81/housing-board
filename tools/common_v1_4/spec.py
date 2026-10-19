"""주택파동 공통규격 v1.4(조원 배포 재가공 양식) — CSV 8종의 헤더와 허용값.

헤더는 양식 ZIP(공통규격 양식.zip)의 CSV 첫 줄을 그대로 옮겼다. validate.py --spec-zip 으로 ZIP 과 다시 대조할 수 있다.
허용값 중 README 에 적힌 것(README)은 규격 값이고, 나머지(PROPOSED)는 규격에 없어 이 변환기가 정한 제안값이다
(exports/housing_wave_common_v1_4/field_mapping.md 4절).
"""

FILES = {
    "policies": ("정책_policies.csv", ["local_policy_id", "policy_name", "announcement_date", "scope_region", "source_ref", "review_status"]),
    "programs": ("프로그램_programs.csv", ["local_program_id", "program_name", "program_definition", "source_ref", "review_status"]),
    "projects": ("사업_projects.csv", ["local_project_id", "project_name", "project_unit", "parent_area_name", "block_name", "region", "sigungu",
                                      "organization", "public_scope", "project_status", "is_demo", "source_ref"]),
    "links": ("정책사업연결_links.csv", ["link_type", "from_local_id", "to_local_id", "evidence", "review_status", "source_ref"]),
    "identifiers": ("사업식별자_identifiers.csv", ["local_project_id", "id_type", "id_value", "id_issuer", "source_ref", "match_status"]),
    "events": ("진행이력_events.csv", ["local_project_id", "event_type", "date_type", "event_date", "event_month", "progress_pct", "event_detail",
                                     "source_ref", "review_status"]),
    "units": ("공급물량_units.csv", ["local_project_id", "quantity_type", "housing_type", "unit_count", "reference_period", "unit_scope",
                                   "source_ref", "review_status"]),
    "sources": ("원천_sources.csv", ["source_ref", "source_owner", "provider", "dataset_name", "source_url", "source_record_key", "data_as_of",
                                   "collected_at", "original_filename", "notes"]),
}

REVIEW_FILE = ("review_required.csv", ["review_type", "local_project_id", "source_ref", "record_key", "record_name", "detail", "reason"])

# README 에 적힌 값
REVIEW_STATUS = {"CONFIRMED", "REVIEW_REQUIRED"}
PROJECT_UNIT = {"BLOCK", "INDEPENDENT", "AREA_UNKNOWN"}
QUANTITY_TYPE = {"PROJECT_PLAN", "PUBLIC_PLAN", "SUPPLY_PLAN", "NOTICE", "MOVE_IN_ACTUAL"}

# 규격에 없어 정한 제안값
PROPOSED = {
    "source_owner": {"HOUSING_WAVE"},
    "public_scope": {"PUBLIC"},
    "project_status": {"정책", "사업화", "인허가", "건설", "공급", "입주"},
    "is_demo": {"false"},
    "event_type": {"PERMIT", "CONSTRUCTION_START", "PROGRESS", "COMPLETION", "SUPPLY_NOTICE", "MOVE_IN"},
    "date_type": {"PLANNED", "ACTUAL"},
    "id_type": {"INTERNAL_PROJECT_ID", "BUNDLE_ID", "AREA_BLOCK", "LH_AREA_BLOCK_CODE", "PNU", "BJD_CODE"},
    "unit_scope": {"TOTAL", "SUBTYPE"},
    "region": {"서울", "경기", "인천"},
}

# 열마다 비면 안 되는 칸(규격에 필수 표시가 없어, 키·참조·분류 칸을 필수로 본다)
REQUIRED = {
    "projects": ["local_project_id", "project_name", "project_unit", "region", "organization", "public_scope", "is_demo", "source_ref"],
    "identifiers": ["local_project_id", "id_type", "id_value", "id_issuer", "source_ref", "match_status"],
    "events": ["local_project_id", "event_type", "date_type", "source_ref", "review_status"],
    "units": ["local_project_id", "quantity_type", "unit_count", "unit_scope", "source_ref", "review_status"],
    "sources": ["source_ref", "source_owner", "provider", "dataset_name"],
    "policies": ["local_policy_id", "policy_name", "source_ref", "review_status"],
    "programs": ["local_program_id", "program_name", "source_ref", "review_status"],
    "links": ["link_type", "from_local_id", "to_local_id", "review_status", "source_ref"],
}

# 열 → 허용값 묶음
ENUMS = {
    "projects": {"project_unit": PROJECT_UNIT, "public_scope": PROPOSED["public_scope"], "project_status": PROPOSED["project_status"],
                 "is_demo": PROPOSED["is_demo"], "region": PROPOSED["region"]},
    "identifiers": {"id_type": PROPOSED["id_type"], "match_status": REVIEW_STATUS},
    "events": {"event_type": PROPOSED["event_type"], "date_type": PROPOSED["date_type"], "review_status": REVIEW_STATUS},
    "units": {"quantity_type": QUANTITY_TYPE, "unit_scope": PROPOSED["unit_scope"], "review_status": REVIEW_STATUS},
    "sources": {"source_owner": PROPOSED["source_owner"]},
    "policies": {"review_status": REVIEW_STATUS},
    "programs": {"review_status": REVIEW_STATUS},
    "links": {"review_status": REVIEW_STATUS},
}

# 날짜 열: day = YYYY-MM-DD, month = YYYY-MM, either = 둘 중 하나
DATES = {
    "events": {"event_date": "day", "event_month": "month"},
    "units": {"reference_period": "either"},
    "sources": {"data_as_of": "day", "collected_at": "day"},
    "policies": {"announcement_date": "either"},
}
