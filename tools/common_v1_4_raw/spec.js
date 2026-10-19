'use strict';
/* 주택파동 공통규격 v1.4(조원 배포 재가공 양식) — CSV 8종의 파일 이름·헤더·허용값·필수 칸·날짜 칸.
   헤더는 양식 ZIP(공통규격 양식.zip)의 CSV 첫 줄을 그대로 옮겼다. validate.js --spec-zip 으로 ZIP 과 다시 대조한다.
   README 에 적힌 허용값(README_VALUES)은 규격 값이고, PROPOSED 는 규격에 허용값이 없어 이 변환기가 정한 제안 영문 코드다
   (출력 폴더 field_mapping.md 에 같은 목록을 적는다). 이전 변환기 tools/common_v1_4/spec.py 를 이어 쓰고 원천 코드만 더했다. */

const FILES = {
  policies: ['정책_policies.csv', ['local_policy_id', 'policy_name', 'announcement_date', 'scope_region', 'source_ref', 'review_status']],
  programs: ['프로그램_programs.csv', ['local_program_id', 'program_name', 'program_definition', 'source_ref', 'review_status']],
  projects: ['사업_projects.csv', ['local_project_id', 'project_name', 'project_unit', 'parent_area_name', 'block_name', 'region', 'sigungu',
    'organization', 'public_scope', 'project_status', 'is_demo', 'source_ref']],
  links: ['정책사업연결_links.csv', ['link_type', 'from_local_id', 'to_local_id', 'evidence', 'review_status', 'source_ref']],
  identifiers: ['사업식별자_identifiers.csv', ['local_project_id', 'id_type', 'id_value', 'id_issuer', 'source_ref', 'match_status']],
  events: ['진행이력_events.csv', ['local_project_id', 'event_type', 'date_type', 'event_date', 'event_month', 'progress_pct', 'event_detail',
    'source_ref', 'review_status']],
  units: ['공급물량_units.csv', ['local_project_id', 'quantity_type', 'housing_type', 'unit_count', 'reference_period', 'unit_scope',
    'source_ref', 'review_status']],
  sources: ['원천_sources.csv', ['source_ref', 'source_owner', 'provider', 'dataset_name', 'source_url', 'source_record_key', 'data_as_of',
    'collected_at', 'original_filename', 'notes']],
};

/* 검토 목록(규격 밖, 이전 변환기와 같은 열) */
const REVIEW_FILE = ['review_required.csv', ['review_type', 'local_project_id', 'source_ref', 'record_key', 'record_name', 'detail', 'reason']];

/* README 에 적힌 값 */
const REVIEW_STATUS = ['CONFIRMED', 'REVIEW_REQUIRED'];
const PROJECT_UNIT = ['BLOCK', 'INDEPENDENT', 'AREA_UNKNOWN'];
const QUANTITY_TYPE = ['PROJECT_PLAN', 'PUBLIC_PLAN', 'SUPPLY_PLAN', 'NOTICE', 'MOVE_IN_ACTUAL'];

/* 규격에 없어 정한 제안값 */
const PROPOSED = {
  source_owner: ['HOUSING_WAVE'],
  public_scope: ['PUBLIC'],
  project_status: ['정책', '사업화', '인허가', '건설', '공급', '입주'],
  is_demo: ['false'],
  event_type: ['PERMIT', 'CONSTRUCTION_START', 'PROGRESS', 'COMPLETION', 'SUPPLY_NOTICE', 'MOVE_IN'],
  date_type: ['PLANNED', 'ACTUAL'],
  id_type: ['INTERNAL_PROJECT_ID', 'LEDGER_CANDIDATE_ID', 'AREA_BLOCK', 'LH_PAN_ID', 'MYHOME_PBLANC_ID', 'MYHOME_COMPLEX_ID',
    'APPLYHOME_HOUSE_MANAGE_NO', 'HUB_HS_PK', 'HUB_AP_PK', 'HUB_BLD_PK', 'REB_COMPLEX_ID', 'KAPT_CODE', 'PNU', 'BJD_CODE'],
  unit_scope: ['TOTAL', 'SUBTYPE'],
  region: ['서울', '경기', '인천'],
};

/* 검토 목록 유형과 뜻(보고서·정렬 순서) */
const REVIEW_TYPES = {
  PUBLIC_SCOPE_UNKNOWN: '공공 근거가 없어 사업으로 올리지 않은 기록(건축HUB 주택인허가 진행 중 기록 · 공공 이름이 든 조합·PFV 사업주체 공고)',
  PRIVATE_ON_PUBLIC_LAND: '청약홈 공공택지(PUBLIC_HOUSE_EARTH_AT=Y) 공고인데 사업주체가 민간이라 제외한 공고',
  PUBLIC_PRIVATE_JOINT: '청약홈 사업주체가 공공기관과 민간의 공동이라 포함했지만 공공 몫을 원천에서 나눌 수 없는 사업',
  DUPLICATE_CANDIDATE: '확실한 키는 다르지만 블록·지구 낱말이나 이름이 같아 같은 사업일 수 있는 두 사업(합치지 않음)',
  LINK_CANDIDATE: '보강 원천 기록이나 마이홈 공고 단지가 붙을 사업이 둘 이상이거나 정할 수 없어 붙이지 않은 것',
  LEDGER_ID_CONFLICT: '원장 사업번호 대응이 하나로 정해지지 않은 사업',
  DATE_CONFLICT: '같은 사업의 같은 종류 날짜가 원천마다 다름(원천별로 각각 기록함)',
  STOCK_COMPLEX_NOTICE: '모집공고로 만든 사업인데 입주예정월이 공고보다 1년 넘게 앞서거나(LH·청약홈) 회차·정기 모집 공고 이름이라(청약홈) 이미 입주한 재고 단지의 모집일 수 있음(사업으로 올렸음)',
  BLOCK_NAME_NUMERIC: '블록명이 번호뿐(project_unit=AREA_UNKNOWN)',
};

/* 비면 안 되는 칸(규격에 필수 표시가 없어 키·참조·분류 칸을 필수로 본다) */
const REQUIRED = {
  projects: ['local_project_id', 'project_name', 'project_unit', 'region', 'organization', 'public_scope', 'is_demo', 'source_ref'],
  identifiers: ['local_project_id', 'id_type', 'id_value', 'id_issuer', 'source_ref', 'match_status'],
  events: ['local_project_id', 'event_type', 'date_type', 'source_ref', 'review_status'],
  units: ['local_project_id', 'quantity_type', 'unit_count', 'unit_scope', 'source_ref', 'review_status'],
  sources: ['source_ref', 'source_owner', 'provider', 'dataset_name'],
  policies: ['local_policy_id', 'policy_name', 'source_ref', 'review_status'],
  programs: ['local_program_id', 'program_name', 'source_ref', 'review_status'],
  links: ['link_type', 'from_local_id', 'to_local_id', 'review_status', 'source_ref'],
  review: ['review_type', 'reason'],
};

/* 열 → 허용값 */
const ENUMS = {
  projects: { project_unit: PROJECT_UNIT, public_scope: PROPOSED.public_scope, project_status: PROPOSED.project_status, is_demo: PROPOSED.is_demo, region: PROPOSED.region },
  identifiers: { id_type: PROPOSED.id_type, match_status: REVIEW_STATUS },
  events: { event_type: PROPOSED.event_type, date_type: PROPOSED.date_type, review_status: REVIEW_STATUS },
  units: { quantity_type: QUANTITY_TYPE, unit_scope: PROPOSED.unit_scope, review_status: REVIEW_STATUS },
  sources: { source_owner: PROPOSED.source_owner },
  policies: { review_status: REVIEW_STATUS },
  programs: { review_status: REVIEW_STATUS },
  links: { review_status: REVIEW_STATUS },
  review: { review_type: Object.keys(REVIEW_TYPES) },
};

/* 날짜 열: day = YYYY-MM-DD, month = YYYY-MM, either = 둘 중 하나 */
const DATES = {
  events: { event_date: 'day', event_month: 'month' },
  units: { reference_period: 'either' },
  sources: { data_as_of: 'day', collected_at: 'day' },
  policies: { announcement_date: 'either' },
};

module.exports = { FILES, REVIEW_FILE, REVIEW_STATUS, PROJECT_UNIT, QUANTITY_TYPE, PROPOSED, REVIEW_TYPES, REQUIRED, ENUMS, DATES };
