'use strict';
/* 정책 단계별 목표·확인 누적(9·7 주택공급 확대방안): HOME 덤프 판(raw/home/<덤프시각>)으로 HOME 운영 화면의 계산을 그대로 다시 한다. 오프라인·결정적(같은 판 → 같은 바이트).
   실행: node tools/ledger/policy-progress.js [--month YYYY-MM | --home <판 폴더>] [--out <파일>](기본 data/board/policy-progress.json)
   옮긴 계산(HOME PoC 10-home backend — 읽기만 했다. 2026-10-21 커밋 2038810(2026-10-19 21:53 UTC, PoC 운영 판) 기준으로 갱신, 처음 이식은 21c60b1)
   - policy_delivery.build_delivery: 정책에 이어진 사업(service.projects(policy_id)) → 지구·블록 중복 제외(supply_dashboard.inventory) → 같은 블록 원천을 한 묶음으로
     사건(착공 실적·단계 근거 stage_evidence·교차 원천 evidence_bridge·본 모집공고 linked_notices + 저장된 본 모집 사실 supply_notices·공정률 100%)과
     일정(roadmap.source_events·evidence_bridge 계획·입주계획·승인 일정)을 모은다. 이것이 '포트폴리오'(portfolio_cohorts, 과거 착공 포함)이고,
     계획물량이 있고 정책기간 전 착공이 아닌 묶음만 '코호트'.
   - policy_delivery_comparison.comparison_index: 단계별 목표 점(_schedule_targets — 코호트마다 가장 늦은 원천 하나, 같은 (날짜·호수) 한 번, 사업 물량 상한)과
     확인 점(_events — 사업별 최대 도달량의 누적, 확인 필요(REVIEW) 연결 포함). 정책 전체 착공은 9·7 원문 연도별 목표와 지역 착공 통계(_official_targets·_regional_actual).
     포트폴리오 범위(portfolio_comparisons)의 tracking = 1900-01-01 부터 목표 점 + 후속 단계까지 누적한 확인 점(trackingOf·portfolioComparisons).
   - 담당자 입력: project_profile.overrides(계획물량·공정률)가 원천값을 덮고(공정률 입력은 MANUAL, 추정(inferred) 100% 는 준공으로 보지 않는다),
     progress(단계 측정값, 날짜·호수 둘 다 있는 것)는 그 묶음의 같은 단계 사건을 모두 대신한다(project_profile.progress_events).
     execution_schedule(승인 일정) → 사업·단계 관리 목표(delivery_operations.schedule_goals): 그 단계의 원천 일정을 빼고, 관리 목표가 있으면 목표 점은 그것만 쓴다.
     delivery_setting 은 아직 들어온 판이 없어 옮기지 않았다(있으면 멈춘다). policy_profile(착공 연간 목표 입력)·program_profile 은 덤프에 없어 옮기지 않았다.
   - 2038810 supply_dashboard.block_key(이름의 블록 표기 하나로 키 보충)·inventory(서로 다른 임대 유형 공급계획을 따로 남김)는 원장 변환과 한 벌인
     home-source.js 의 blockKey·inventory 에 옮겼다(2026-10-21 — 인천검단 AA19 두 유형·의왕초평 A4 계약).
   - 인천 시군구: PoC 운영 판은 2038810 에 없는 행정구역 개편 귀속(INCHON_DATED_ADMINISTRATIVE_NAME)을 쓴다 — homeService 가 원장 시군구 규칙(home-source.js sggByPro)으로 대신한다.
   - 기준일(as_of) = 덤프 시각의 한국 날짜(HOME 은 기준일 다음 날 0시(한국) 전에 기록된 판을 읽는다 — 덤프 뒤 기록이 없으니 덤프의 현재 판과 같다).
   두 가지 비교
   - homeRule: HOME 화면(policy-stage-flow.js comparisonStatus)과 같다 — 기준일까지 도래한 마지막 목표 누적(정책 시작일부터) 대 기준일까지 마지막 확인 누적(처음부터). 기간이 섞인다.
   - samePeriod(우리 기본, 2026-10-14 결정): 같은 해 1월 1일 ~ 기준 달(기준일 이전에 끝난 마지막 달의 말일) 목표 증가분 대 확인 증가분. 지난 해는 1~12월.
   화면 생성기용: trackingOf(사업 목록, 지표, 기준일) · portfolioComparisons(포트폴리오, 기준일) · homeView(판) — HOME /policy-delivery/view 의 포트폴리오 부분과 같은 모양.
   시험: tests/js/policy-progress.test.cjs, tests/js/home-portfolio.test.cjs(PoC 응답 tracking 과 완전 일치·덤프 포트폴리오 대조) */
const fs = require('node:fs');
const path = require('node:path');
const P = require('./paths');
const HOME = require('./home-source');

const POLICY_ID = 'POL_2025_0907';
const STAGES = ['POLICY', 'BUSINESS', 'APPROVAL', 'CONSTRUCTION', 'SUPPLY', 'MOVE_IN'];
const EVENT_STAGES = new Set([...STAGES, 'COMPLETION']);
const METRICS = { CONSTRUCTION: '착공(건설)', SUPPLY: '공급(분양·모집)', BUSINESS: '사업화', APPROVAL: '인허가', COMPLETION: '준공', MOVE_IN: '입주 예정' };
const REGIONS = ['서울특별시', '경기도', '인천광역시'];
const ALIASES = { lh_incheon_sale: 'lh_sale', lh_incheon_rent: 'lh_rent', lh_incheon_construction: 'lh_construction' };
/* 담당자 추정 입력(project_profile.progress 의 input_rule): '기한이 지난 단계에서 담당자가 고른 현재값 — 원천 실적 확인과 구분'. HOME 화면(homeRule·actualPoints)은 그대로 섞고,
   우리 같은 기간 비교(samePeriod)는 확인(actual = 이 입력을 뺀 사건)과 추정 포함(actualWithEstimates)을 나눠 낸다(2026-10-14 결정: 확인과 추정을 섞지 않는다) */
const ESTIMATE_RULES = new Set(['OFFICER_CURRENT_ESTIMATE']);
/* HOME policy_delivery_comparison.METRICS(2038810) — portfolio_comparisons 의 지표 이름 */
const HOME_METRICS = { CONSTRUCTION: '착공(건설)', SUPPLY: '공급(분양·모집)', BUSINESS: '사업화', APPROVAL: '인허가', COMPLETION: '준공', MOVE_IN: '입주' };
const ROADMAP_STAGES = { PLANNING: '계획', APPROVAL: '인허가', CONSTRUCTION: '착공', SUPPLY: '공급', COMPLETION: '준공', MOVE_IN: '입주 시작' };

const byStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const cmpTuple = (a, b) => { for (let i = 0; i < a.length; i++) { const c = byStr(a[i], b[i]); if (c) return c; } return 0; };
const pad2 = (n) => String(n).padStart(2, '0');
const lastDayOf = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const validDate = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= lastDayOf(y, m);
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
/* 파이썬 max(key=...) — 같은 값이면 먼저 나온 것 */
const maxBy = (xs, key) => xs.reduce((best, x) => (best === undefined || cmpTuple(key(x), key(best)) > 0 ? x : best), undefined);

/* ---------- 일정 글 → 기간(schedule_period.py) ---------- */
function schedulePeriod(value, year = null) {
  const raw = String(value || '').trim();
  if (!raw || /미정|미확정|추후|이후|이전|미수립/.test(raw)) return null;
  let text = raw.replace(/\s+/g, '').replaceAll('예정', '').replaceAll('목표', '').replace(/^[()]+|[()]+$/g, '');
  text = text.replace(/중\(최초\)?$/, '');   // GH 공고 차수 꼬리(2038810)
  text = text.replace(/^[‘’'](\d{2})(?=년|[./-])/, '20$1');
  let m = /^(20\d{2})[-./](\d{1,2})(?:[-./](\d{1,2}))?\.?$/.exec(text) || /^(20\d{2})년(\d{1,2})월(?:(\d{1,2})일)?$/.exec(text);
  if (m) {
    const y = +m[1], mo = +m[2], d = m[3] ? +m[3] : null;
    if (!validDate(y, mo, d || 1)) return null;
    return { month: `${y}-${pad2(mo)}`, due_date: `${y}-${pad2(mo)}-${pad2(d || lastDayOf(y, mo))}`, precision: d ? 'DAY' : 'MONTH', original: raw, conversion: d ? 'EXACT' : 'MONTH_END' };
  }
  let y, mo, precision;
  m = /^(?:(20\d{2})년?)?(?:제?([1-4])분기|([상하])반기|([1-4])Q)$/i.exec(text);
  if (m) {
    y = +(m[1] || year || 0); mo = (m[2] || m[4]) ? +(m[2] || m[4]) * 3 : m[3] === '상' ? 6 : 12;
    precision = (m[2] || m[4]) ? 'QUARTER' : 'HALF_YEAR';
  } else {
    m = /^(20\d{2})(?:년|[./-])(\d{1,2})월?[~～〜–-](?:(20\d{2})(?:년|[./-]))?(\d{1,2})월?$/.exec(text);
    if (m) {
      const sy = +m[1], sm = +m[2]; y = +(m[3] || m[1]); mo = +m[4]; precision = 'MONTH_RANGE';
      if (!(sm >= 1 && sm <= 12) || sy > y || (sy === y && sm > mo)) return null;
    } else {
      m = /^(20\d{2})년?(?:[~～〜–-](20\d{2})년?)?$/.exec(text);
      if (!m) return null;
      y = +(m[2] || m[1]); mo = 12; precision = m[2] ? 'YEAR_RANGE' : 'YEAR';
      if (y < +m[1]) return null;
    }
  }
  if (!(y >= 2000 && y <= 2099) || !(mo >= 1 && mo <= 12)) return null;
  return { month: `${y}-${pad2(mo)}`, due_date: `${y}-${pad2(mo)}-${pad2(lastDayOf(y, mo))}`, precision, original: raw, conversion: 'PERIOD_END' };
}
/* roadmap.month: 'YYYY-MM(-DD)' → 'YYYY-MM' */
function scheduleMonth(value) {
  const s = String(value ?? '');
  if (!value || !/^20\d{2}-\d{2}(?:-\d{2})?$/.test(s)) return null;
  const mo = +s.slice(5, 7);
  return mo >= 1 && mo <= 12 ? s.slice(0, 7) : null;
}

/* ---------- 원천 예정 일정(roadmap.source_events) ---------- */
function sourceEvents(row) {
  let events = [];
  const add = (stage, when, units, basis) => {
    const period = schedulePeriod(when);
    if (!period) return;
    events.push({ month: period.month, stage, due_date: period.due_date, precision: period.precision, units: stage === 'MOVE_IN' ? null : units, basis, evidence_url: row.evidence_url ?? null });
  };
  if (Array.isArray(row.rows) && row.rows.length) {
    for (const [field, stage] of [['supply_month', 'SUPPLY'], ['move_in_month', 'MOVE_IN']]) {
      const groups = new Map(), periods = new Map();
      for (const dim of row.rows) {
        const period = schedulePeriod(dim[field.replace('_month', '_raw')] || dim[field]);
        if (!period) continue;
        if (!groups.has(period.month)) { groups.set(period.month, []); periods.set(period.month, []); }
        groups.get(period.month).push(dim.units ?? null);
        periods.get(period.month).push(period);
      }
      const keys = [...groups.keys()];
      const picked = stage === 'MOVE_IN' && keys.length ? [keys.slice().sort(byStr)[0]] : keys;
      for (const when of picked) {
        const units = groups.get(when);
        add(stage, when, units.every((u) => u !== null) ? units.reduce((a, b) => a + b, 0) : null, stage === 'SUPPLY' ? '원천 면적별 공급계획' : '원천 임대 입주 시작 예정월');
        if (periods.get(when).some((p) => p.conversion === 'PERIOD_END')) Object.assign(events[events.length - 1], { precision: 'PERIOD', basis: `${events[events.length - 1].basis} · 범위 마지막 달 기준` });
      }
    }
  } else if (['lh_construction', 'lh_incheon_construction', 'lh_progress'].includes(row.source_id)) {
    if (!row.start_actual_date) add('CONSTRUCTION', row.start_plan_date, row.planned_units ?? null, '원천 계약 착공 예정일');
    add('COMPLETION', row.completion_plan_date, row.planned_units ?? null, '공사 계약 준공예정 · 입주일 아님');
  }
  if (row.source_id === 'lh_policy_followup') add('CONSTRUCTION', row.start_plan_month, row.planned_units ?? null, 'LH 정책 후속 개별 공모 착공 목표월');
  if (row.start_plan_year && !row.start_actual_date && !row.start_plan_date) add('CONSTRUCTION', `${row.start_plan_year}년`, row.planned_units ?? null, row.schedule_basis || '공식 착공 예정연도 · 연말 표기');
  if (row.source_id === 'policy_129') add('CONSTRUCTION', row.start_plan_month, row.planned_units ?? null, '1·29 공식 별첨 착공 예정월 · 준공·공급월 아님');
  for (const [field, stage] of [['source_supply_label', 'SUPPLY'], ['source_move_in_label', 'MOVE_IN']]) {
    if (schedulePeriod(row[field])) {
      events = events.filter((e) => e.stage !== stage);
      add(stage, row[field], row.planned_units ?? null, '원천 예정 범위 · 마지막 달 기준 집계');
      if (stage === 'MOVE_IN' && row.move_in_evidence_url) for (const e of events) if (e.stage === 'MOVE_IN') e.evidence_url = row.move_in_evidence_url;
    }
  }
  const noticeMonth = scheduleMonth(row.notice_move_in_month);
  if (noticeMonth) {
    events = events.filter((e) => e.stage !== 'MOVE_IN');
    add('MOVE_IN', noticeMonth, null, '청약홈 본 모집공고 입주 시작 예정월 · 사업 연결 검토');
    events[events.length - 1].evidence_url = row.notice_evidence_url ?? null;
  }
  return events.map((e, i) => [e, i]).sort(([a, i], [b, j]) => cmpTuple([a.month, a.stage], [b.month, b.stage]) || i - j).map(([e]) => e);
}

/* ---------- 지구·블록 키(supply_dashboard.block_key, map_data.district_term)·중복 제외(supply_dashboard.inventory) — 원장 변환(home-source.js)과 한 벌 ---------- */
/* → [시도, 지구, 블록] 또는 null */
function blockKey(row) { const k = HOME.blockKey(row); return k ? [k.region, k.term, k.block] : null; }
const keyStr = (k) => k.join('\u0000');
/* 지구·블록 중복 제외 → { chosen, excluded } */
const inventory = HOME.inventory;

/* 본 모집공고 연결(supply_dashboard.linked_notices) → Map(사업 id → 공고) */
function linkedNotices(rows, notices, asOf) {
  const matched = new Map(), candidates = [];
  for (const row of rows) {
    const key = blockKey(row);
    if (!key) continue;
    const b = /^([A-Z]+)(\d+)$/.exec(key[2]);
    candidates.push([row, new RegExp(`${escRe(key[1])}(?:공공주택지구|택지개발지구|지구)?${escRe(b[1])}-?0*${b[2]}(?:BL|블록)?(?![A-Z0-9])`)]);
  }
  const sorted = notices.slice().sort((a, b) => cmpTuple([a.source_date || '', a.id], [b.source_date || '', b.id]));
  for (const n of sorted) {
    if (!n.source_date || n.source_date > asOf) continue;
    if (!(n.developer ?? '').replace(/\s+/g, '').includes('한국토지주택공사')) continue;
    const name = n.name.replace(/\s+/g, '').replaceAll('국제화계획', '').toUpperCase();
    if (['사전', '잔여', '추가', '취소', '무순위', '정정'].some((w) => name.includes(w))) continue;
    if (new Set(name.match(/[A-Z]{1,3}-?\d+(?:BL|블록)/g) || []).size > 1) continue;
    if (n.units == null || n.units <= 0) continue;
    const owners = [];
    for (const [row, re] of candidates) {
      if (row.region !== n.region || !re.test(name)) continue;
      if (row.source_id === 'lh_rent' && !name.includes('임대')) continue;
      if (row.source_id === 'lh_sale' && !name.includes('분양')) continue;
      if (row.planned_units != null && n.units > row.planned_units) continue;
      owners.push(row);
    }
    if (owners.length === 1) matched.set(owners[0].id, n);
  }
  const repeats = new Map();
  for (const [pid, n] of matched) { const k = n.house_manage_no || n.id; if (!repeats.has(k)) repeats.set(k, []); repeats.get(k).push(pid); }
  for (const owners of repeats.values()) if (owners.length > 1) for (const pid of owners) matched.delete(pid);
  return matched;
}

/* ---------- 판 → HOME service.rows / projects ---------- */
/* 덤프 시각(UTC) → 한국 날짜 */
const asOfOf = (snapshotAt) => new Date(Date.parse(snapshotAt) + 9 * 3600 * 1000).toISOString().slice(0, 10);

function homeService(home, asOf) {
  const K = home.kinds;
  /* service.rows: 기준일 다음 날 0시(한국) 전 기록·현재 판 = 덤프의 현재 판(home-dump.py 가 superseded 없는 것만 뽑는다), payload.base_date > 기준일은 뺀다.
     순서: 덤프는 개체 id 순이고 HOME 은 DB 순(ORDER BY 없음)이다 — 기록 시각 순으로 맞춘다(같은 물량·날짜 공고 중 HOME 이 고른 것이 가장 먼저 기록된 것이었다: 하남교산 A-2BL) */
  const rows = (kind) => {
    if (!K[kind]) throw new Error(`HOME 판에 ${kind} 가 없다(tools/ledger/home-dump.py 로 다시 뽑는다)`);
    return K[kind].filter((r) => (r.payload.base_date ?? '9999') <= asOf).map((r, i) => [r, i]).sort(([a, i], [b, j]) => byStr(a.recorded_at ?? '', b.recorded_at ?? '') || i - j)
      .map(([r]) => ({ ...r.payload, id: r.entity_id, source_id: r.source_id, revision_no: r.revision_no }));
  };
  /* 담당자 입력 오버레이(project_profile — 2026-10-14 판부터): 사업 id → { overrides(계획물량·공정률 등 { value }), progress(단계 → 측정값) }. 이 kind 가 없는 옛 판은 입력이 없던 판이다 */
  const profiles = new Map();
  for (const r of K.project_profile ? rows('project_profile') : []) {
    if (profiles.has(r.project_id)) throw new Error(`같은 사업의 담당자 입력이 둘: ${r.project_id}`);
    profiles.set(r.project_id, r);
  }
  const cutoffMs = Date.parse(`${asOf}T00:00:00+09:00`) + 86400000;
  const pgTime = (s) => Date.parse(String(s).replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
  /* service.projects(2038810): 사업 매핑(home_mapping) → 프로그램(home_program_mapping, 기준일 전 생성)의 정책(program_hierarchy.effective_mapping). 기준일 뒤 감사 기록이 없으니 되감기는 없다.
     원천 목록에서 만든 참조 사업(source_reference_id·policy_candidate_only)은 사업 매핑이 확정되지 않았고 정책이 없으면 프로그램이 정책을 줘도 미배정이다.
     위치(project_location)는 시군구가 비었거나 '확인'이 든 사업에 시군구를 채운다. 담당자 입력(project_profile.overrides)은 manual_fields 로 남기고 값을 덮는다(project_profile.overlay).
     인천 행의 시군구는 행정구역 개편 뒤 이름(인천 정책 시군구 경계 policy_municipality 의 이름)으로 덮는다 — HOME PoC 운영 판 INCHON_DATED_ADMINISTRATIVE_NAME 대신
     원장 변환과 같은 시군구 규칙(home-source.js sggByPro — 덤프 + 그 달 폴더의 법정동 표·LH 블록 시군구 매핑)의 코드를 경계 행정 코드로 잇는다(2026-10-21 결정).
     원장 규칙으로 못 정한 행(인천서구 SGG_UNRESOLVED)과 판 폴더를 모르는 판(home.dir 없음)은 원천 값 그대로 */
  let all = null;
  function allProjects() {
    if (all) return all;
    const dated = new Map();
    const sgg = home.dir ? HOME.sggByPro(home, path.resolve(home.dir, '..', '..', '..')) : null;
    if (sgg) {
      const nameOf = new Map(rows('policy_municipality').filter((a) => (a.admin_codes ?? []).length === 1).map((a) => [a.admin_codes[0], a.name]));
      for (const [pro, code] of sgg) if (nameOf.has(code)) dated.set(pro, nameOf.get(code));
    }
    const after = (K.home_audit || []).filter((a) => pgTime(a.recorded_at) >= cutoffMs);
    if (after.length) throw new Error(`기준일 뒤 감사 기록 ${after.length}건 — 되감기는 옮기지 않았다`);
    const mappings = new Map((K.home_mapping || []).map((m) => [m.project_id, m]));
    const programs = new Map((K.home_program_mapping || []).filter((p) => pgTime(p.created_at) < cutoffMs).map((p) => [p.id, p]));
    const locations = new Map((K.project_location ? rows('project_location') : []).filter((r) => r.status !== 'RELEASED').map((r) => [r.project_id, r]));
    const latest = new Map();
    for (const r of rows('project_report')) {
      if (r.source_id !== 'lh_progress' || r.progress_pct == null) continue;
      const pid = r.current_project_id;
      if (pid && (!latest.has(pid) || r.report_date > latest.get(pid).report_date)) latest.set(pid, r);
    }
    all = [];
    for (const row of rows('project')) {
      const m = mappings.get(row.id);
      const direct = m ? { status: m.status, policy_id: m.policy_id, program_id: m.program_id } : { status: 'REVIEW', policy_id: row.proposed_policy ?? null, program_id: null };
      let mapping = { ...direct };
      const program = programs.get(mapping.program_id);
      if (program) mapping = { ...mapping, program_id: program.id, program_name: program.name, policy_id: program.status !== 'RELEASED' ? program.policy_id : 'UNASSIGNED', policy_status: program.status };
      else if (mapping.program_id === 'UNASSIGNED') mapping = { ...mapping, policy_id: 'UNASSIGNED', program_name: '프로그램 미연계' };
      if ((row.source_reference_id || row.policy_candidate_only) && direct.status !== 'CONFIRMED' && [null, undefined, 'UNASSIGNED'].includes(direct.policy_id)) mapping = { ...mapping, policy_id: 'UNASSIGNED', policy_status: 'REVIEW', reference_policy_pending: true };
      const p = { ...row, warnings: [...(row.warnings || [])], mapping, ...(program ? { program: program.name } : {}) };
      const location = locations.get(row.id);
      if (location && !(p.longitude != null && p.latitude != null) && (!p.municipality || String(p.municipality).includes('확인'))) p.municipality = location.municipality ?? null;
      if (p.region === '인천광역시' && dated.has(row.id)) p.municipality = dated.get(row.id);
      const report = latest.get(row.id);
      if (report && (row.progress_pct == null || report.report_date > (row.progress_date ?? row.base_date))) Object.assign(p, { progress_pct: report.progress_pct, progress_date: report.report_date, progress_evidence_url: report.evidence_url });
      const overrides = profiles.get(row.id)?.overrides ?? {};
      p.manual_fields = overrides;
      for (const [k, v] of Object.entries(overrides)) if (v && v.value !== undefined) p[k] = v.value;   // 담당자 입력값이 원천값을 덮는다
      all.push(p);
    }
    all.sort((a, b) => cmpTuple([a.region, a.name], [b.region, b.name]));
    return all;
  }
  const projects = (policyId) => allProjects().filter((p) => p.mapping.policy_id === policyId);
  return { rows, projects, allProjects, profiles };
}

/* ---------- 코호트(policy_delivery.build_delivery 의 사업 묶음) ---------- */
const get = (o, k, d) => (o && Object.hasOwn(o, k) ? o[k] : d);   // 파이썬 dict.get(k, d) — 값이 null 이어도 그대로
/* evidence_bridge.by_project: 사업 id → 교차 원천 연결(원천 id 는 근거 원천 → 원 개체의 원천 → 연결 행의 원천) */
function bridgesByProject(svc) {
  const origins = new Map(['project', 'lh_completion_plan', 'document_evidence'].flatMap((k) => svc.rows(k).map((r) => [r.id, r.source_id])));
  const out = new Map();
  for (const r of svc.rows('evidence_bridge')) {
    const b = { ...r, source_id: r.evidence_source_id || (origins.has(r.source_entity_id) ? origins.get(r.source_entity_id) : r.source_id) };
    if (!out.has(b.project_id)) out.set(b.project_id, []);
    out.get(b.project_id).push(b);
  }
  return out;
}
/* evidence_bridge.supply_notices(2038810): 저장된 본 모집 공급 사실(전체 범위·본 차수) → 사업 id → 공고(물량 최대·같으면 늦은 날). 한 공고가 두 사업에 걸리면 뺀다 */
function supplyNotices(byProject, asOf) {
  const results = new Map(), owners = new Map();
  for (const [pid, list] of byProject) {
    const choices = [];
    for (const b of list) {
      if (!['REVIEW', 'CONFIRMED'].includes(b.status) || get(b, 'source_notice_round', 'MAIN') !== 'MAIN') continue;
      for (const f of b.facts || []) {
        if (f.stage !== 'SUPPLY' || f.kind !== 'ACTUAL' || f.scope_partial || get(f, 'notice_round', 'MAIN') !== 'MAIN') continue;
        if (!f.date || f.date > asOf || !f.units) continue;
        if (!owners.has(b.source_entity_id)) owners.set(b.source_entity_id, new Set());
        owners.get(b.source_entity_id).add(pid);
        choices.push({ id: b.source_entity_id, name: b.source_name, units: f.units, source_date: f.date, source_id: b.source_id, evidence_url: b.evidence_url ?? null, review_status: b.status });
      }
    }
    if (choices.length) results.set(pid, maxBy(choices, (n) => [n.units, n.source_date]));
  }
  return new Map([...results].filter(([, n]) => owners.get(n.id).size === 1));
}
/* project_profile.progress_events: 담당자 단계 측정값(날짜·호수 둘 다 있는 것) → 사업 id → 실제 사건. 담당자 이름·사유 글은 싣지 않는다 */
function progressEvents(svc) {
  const out = new Map();
  for (const r of svc.profiles.values()) for (const [stage, v] of Object.entries(r.progress ?? {})) {
    if (!v.event_date || v.units == null) continue;
    if (!out.has(r.project_id)) out.set(r.project_id, []);
    out.get(r.project_id).push({ origin: v.origin ?? 'MANUAL', input_rule: v.input_rule ?? null, inferred: v.inferred ?? false, changed_at: v.changed_at ?? null, event_date: v.event_date, units: v.units,
      ...(v.evidence_url ? { evidence_url: v.evidence_url } : {}), project_id: r.project_id, stage, status: 'ACTUAL', review_status: 'CONFIRMED', ...(ESTIMATE_RULES.has(v.input_rule) ? { estimate: true } : {}) });
  }
  return out;
}
/* supply_geography.municipal_membership(2038810) → Map(사업 id → 시군구 경계 id). rows = 공급현황의 사업 행(연결 해제 뺀 전체), boundaries = municipality + policy_municipality,
   districts = 지구 행과 그 소속 사업. ① 원천 시군구 이름(경기는 '시' 뗀 이름도)·인천은 사업명·지구·주소의 '인천 ○○구' ② 같은 블록 사업의 ① ③ 소속 지구 이름이 경계의 지구 목록에 하나.
   공급현황의 '대표 위치' 묶음(사업 좌표만 있는 사업 이름)은 ③에 넣지 않았다(사업 이름이 지구 목록에 들 일이 드물다) */
function municipalMembership(rows, boundaries, districts) {
  const explicit = (row) => {
    let matches = boundaries.filter((a) => a.region === row.region && row.municipality != null && (row.municipality === a.name || (a.region === '경기도' && row.municipality === a.name.slice(0, -1)))).map((a) => a.id);
    if (!matches.length && row.region === '인천광역시') {
      const text = ['name', 'district', 'address'].map((k) => String(row[k] || '')).join(' ');
      matches = boundaries.filter((a) => a.region === row.region && new RegExp(`인천(?:광역시)?\\s*${escRe(a.name.replace(/구$/, '').replace(/군$/, ''))}(?:구|군)?(?=\\s|[\\[\\]()A-Z0-9]|$)`).test(text)).map((a) => a.id);
    }
    return matches.length === 1 ? matches[0] : null;
  };
  const resolved = new Map(), own = new Map(rows.map((r) => [r.id, explicit(r)])), keys = new Map(rows.map((r) => { const k = blockKey(r); return [r.id, k ? keyStr(k) : null]; }));
  for (const row of rows) if (own.get(row.id)) resolved.set(row.id, own.get(row.id));
  for (const row of rows) {
    if (resolved.has(row.id)) continue;
    const key = keys.get(row.id);
    const peers = new Set(key ? rows.filter((q) => keys.get(q.id) === key && own.get(q.id)).map((q) => own.get(q.id)) : []);
    if (peers.size === 1) { resolved.set(row.id, [...peers][0]); continue; }
    const names = new Set(districts.filter((d) => d.project_ids.includes(row.id)).map((d) => d.name));
    const areas = new Set(boundaries.filter((a) => a.region === row.region && (a.district_names || []).some((n) => names.has(n))).map((a) => a.id));
    if (areas.size === 1) resolved.set(row.id, [...areas][0]);
  }
  return resolved;
}
/* 포트폴리오 사업의 시군구(build_delivery city_of·인천 정책 시군구 경계) → (사업 행) → { municipality, municipality_id } */
function municipalities(svc) {
  const extra = svc.rows('policy_municipality');
  const boundaries = [...new Map([...svc.rows('municipality'), ...extra].map((a) => [a.id, a])).values()];
  const rows = svc.allProjects().filter((p) => p.mapping.status !== 'RELEASED').map((r) => ({ ...r, source_id: ALIASES[r.source_id] ?? r.source_id }));
  const ids = new Set(rows.map((r) => r.id));
  const districts = svc.rows('district').map((d) => ({ name: d.name, project_ids: (d.project_ids || []).filter((id) => ids.has(id)) })).filter((d) => d.project_ids.length);
  const cityOf = municipalMembership(rows, boundaries, districts);
  const names = new Map([...extra, ...boundaries].map((a) => [a.id, a.name]));
  return (row) => {
    let id = cityOf.get(row.id) ?? null, name = id != null && names.has(id) ? names.get(id) : (row.municipality ?? null);
    /* build_delivery 의 인천 이름 추정(지구·사업명에 경계 이름이 들면 그 경계)은 소속이 안 정해졌을 때만 — 2038810 은 늘 덮지만 PoC 운영 판 정책 묶음은
       명시 시군구를 앞세운다(제물포 도심공공복합 = 미추홀구, portfolio_cohorts 2026-10-20) */
    if (row.region === '인천광역시' && id == null) {
      const district = row.district || row.name;
      const inferred = extra.find((p) => { const n = p.name.replaceAll('인천광역시 ', ''); return district.includes(n.endsWith('구') ? n.slice(0, -1) : n); });
      if (inferred) { id = inferred.id; name = inferred.name; }
    }
    return { municipality: name, municipality_id: id };
  };
}

function buildCohorts(svc, asOf, policyId) {
  const plan = svc.rows('policy_delivery_plan').find((r) => r.policy_id === policyId);
  if (!plan) throw new Error(`${policyId} 원문 목표표(policy_delivery_plan)가 판에 없다`);
  const raw = svc.projects(policyId);
  const rows = raw.map((r) => ({ ...r, source_id: ALIASES[r.source_id] ?? r.source_id, origin_source_id: r.source_id }));
  const { chosen, excluded } = inventory(rows);
  const allByKey = new Map();
  const groupKey = (row) => { const k = blockKey(row); return k ? `K${keyStr(k)}` : `I${row.id}`; };
  for (const row of rows) { const k = groupKey(row); if (!allByKey.has(k)) allByKey.set(k, []); allByKey.get(k).push(row); }
  const bridges = bridgesByProject(svc);
  const notices = linkedNotices(chosen, svc.rows('notice'), asOf);
  const eligible = new Map(chosen.map((r) => [r.id, r]));
  for (const [pid, n] of supplyNotices(bridges, asOf)) if (eligible.has(pid) && n.units <= (eligible.get(pid).planned_units || 0)) notices.set(pid, n);
  /* 담당자 설정(delivery_setting) — 아직 들어온 판이 없어 옮기지 않았다(있으면 멈춘다) */
  const setting = svc.rows('delivery_setting').find((r) => r.policy_id === policyId) ?? { targets: [], events: [] };
  if ((setting.targets || []).length || (setting.events || []).length) throw new Error('담당자 목표·사건(delivery_setting)이 있는 판 — 아직 옮기지 않았다');
  /* delivery_operations.schedule_goals: 승인 일정(execution_schedule) → 사업·단계 관리 목표(managed_schedule). 근거 글(사유)은 싣지 않는다 */
  const managed = new Map();
  for (const r of svc.rows('execution_schedule')) {
    if (r.status === 'RELEASED' || r.units == null) continue;
    if (!managed.has(r.project_id)) managed.set(r.project_id, []);
    managed.get(r.project_id).push({ scope_kind: 'project', scope_id: r.project_id, stage: r.stage, due_date: r.due_date, units: r.units, origin: r.status === 'REVIEW' ? 'SOURCE_REVIEW' : 'MANUAL', evidence_url: r.evidence_url ?? null, precision: 'DAY', managed_schedule: true });
  }
  /* stage_evidence.linked_events */
  const stageLinks = new Map();
  for (const r of svc.rows('stage_evidence')) {
    const s = r.selected;
    if (!['REVIEW', 'CONFIRMED'].includes(r.status) || !s) continue;
    const effective = s.event_date || s.observed_on;
    if (!effective || effective > asOf) continue;
    if (!stageLinks.has(r.project_id)) stageLinks.set(r.project_id, []);
    stageLinks.get(r.project_id).push({ stage: r.stage, event_date: effective, source_event_date: s.event_date ?? null, date_basis: s.event_date ? 'EVENT' : 'OBSERVED_BY', units: s.units ?? null,
      status: s.event_date && !['PREREQUISITE', 'STAGE_INFERENCE'].includes(s.method) ? 'ACTUAL' : 'STATE', review_status: r.status, origin: 'LINKED_EVIDENCE', method: s.method ?? null, evidence_url: s.evidence_url ?? null, source_id: s.source_id ?? null });
  }
  const occupancy = occupancySchedules(rows, svc.rows('lh_movein_plan'));
  const manualProgress = progressEvents(svc);
  const cityOf = municipalities(svc);

  const selectedIds = new Set(chosen.map((r) => r.id));
  const portfolio = [], cohorts = [], historical = [], missing = [];
  for (const row of chosen) {
    let group = allByKey.get(groupKey(row));
    /* 한 블록의 서로 다른 임대 유형은 따로 센다 — 묶음에 대표가 둘 이상이면 자기 행만(2038810) */
    if (group.filter((m) => selectedIds.has(m.id)).length > 1) group = group.filter((m) => m.id === row.id);
    const plannedCap = row.planned_units ?? null;
    let cap = plannedCap;
    if (cap == null || cap <= 0) {
      missing.push(row.id); cap = notices.get(row.id)?.units;
      if (!cap) continue;
    }
    let events = [], schedules = [];
    const progress = [];
    for (const member of group) {
      if (member.start_actual_date) events.push({ stage: 'CONSTRUCTION', event_date: member.start_actual_date, units: cap, evidence_url: member.evidence_url ?? null, origin: 'SOURCE', source_id: member.origin_source_id });
      for (const e of sourceEvents(member)) {
        schedules.push({ stage: e.stage, due_date: e.due_date || `${e.month}-01`, precision: e.precision, units: e.units, evidence_url: e.evidence_url, origin: 'SOURCE', basis: e.basis, source_id: member.origin_source_id, source_object_id: member.id, source_base_date: member.base_date });
      }
      if (member.progress_pct != null) {
        const override = get(member.manual_fields ?? {}, 'progress_pct', {});
        progress.push({ pct: member.progress_pct, as_of_date: member.progress_date || member.base_date, evidence_url: member.evidence_url ?? null, inferred: !!override?.inferred, origin: override && Object.keys(override).length ? 'MANUAL' : 'SOURCE' });
      }
      events.push(...(stageLinks.get(member.id) || []));
      for (const bridge of bridges.get(member.id) || []) {
        if (!['REVIEW', 'CONFIRMED'].includes(bridge.status)) continue;
        for (const fact of bridge.facts || []) {
          if (fact.scope_partial) continue;
          const stage = fact.stage === 'CONSTRUCTION' && fact.milestone === 'COMPLETION' ? 'COMPLETION' : fact.stage;
          if (!EVENT_STAGES.has(stage)) continue;
          const when = fact.date || fact.date_label;
          if (fact.kind === 'ACTUAL' && when && when.length === 10 && when <= asOf) {
            const dateBasis = get(fact, 'date_basis', 'EVENT');
            events.push({ stage, event_date: when, units: fact.units ?? null, status: 'ACTUAL', review_status: bridge.status, origin: 'LINKED_EVIDENCE', source_id: bridge.source_id, evidence_url: bridge.evidence_url ?? null,
              date_basis: dateBasis, source_event_date: dateBasis === 'EVENT' ? when : fact.source_event_date ?? null, observed_on: fact.observed_on ?? null, method: fact.method ?? null });
          } else if (fact.kind === 'PLAN' && !fact.reference_only) {   /* reference_only(당시 계획 — 최신 목표 아님)는 일정으로 쓰지 않는다(2026-10-21 W5 'HOME 기준': 덤프의 reference_only PLAN 3건이 모두 PoC 묶음에 없고, HOME project_profile.target_default 도 거른다 — 2038810 policy_delivery 에는 없는 처리) */
            const period = schedulePeriod(when);
            if (period) schedules.push({ stage, due_date: period.due_date, precision: period.precision, source_date_label: period.original, date_conversion: period.conversion, units: fact.units || cap, origin: 'SOURCE',
              source_id: bridge.source_id, source_object_id: bridge.source_entity_id, review_status: bridge.status, evidence_url: bridge.evidence_url ?? null });
          }
        }
      }
      schedules.push(...(occupancy.get(member.id) || []));
      /* 승인 일정이 있는 단계는 이 사업의 원천 일정을 빼고 관리 목표를 넣는다(build_delivery managed_stages) */
      const goals = managed.get(member.id) || [], managedStages = new Set(goals.map((g) => g.stage));
      schedules = schedules.filter((s) => !(s.source_object_id === member.id && managedStages.has(s.stage)));
      schedules.push(...goals);
    }
    /* 담당자 단계 측정값이 있는 단계는 그 묶음의 다른 사건을 모두 빼고 측정값만(build_delivery overrides — 착공 판정 전과 공고·공정률 사건을 더한 뒤 두 번) */
    const overrides = group.flatMap((m) => manualProgress.get(m.id) || []);
    const applyOverrides = () => { if (overrides.length) { const st = new Set(overrides.map((e) => e.stage)); events = events.filter((e) => !st.has(e.stage)).concat(overrides); } };
    applyOverrides();
    const starts = events.filter((e) => e.stage === 'CONSTRUCTION' && get(e, 'status', 'ACTUAL') === 'ACTUAL').map((e) => e.event_date);
    const firstStart = starts.length ? starts.slice().sort(byStr)[0] : null;
    const beforePeriod = !!(firstStart && firstStart < plan.period_start);
    if (beforePeriod) historical.push(row.id);
    const notice = notices.get(row.id);
    if (notice) events.push({ stage: 'SUPPLY', event_date: notice.source_date, units: notice.units, evidence_url: notice.evidence_url ?? null, origin: 'SOURCE', source_id: notice.source_id });
    if (notice && notice.move_in_plan_month) {
      const month = notice.move_in_plan_month.replaceAll('-', '');
      if (/^\d{6}$/.test(month)) schedules.push({ stage: 'MOVE_IN', due_date: `${month.slice(0, 4)}-${month.slice(4)}-01`, precision: 'MONTH', units: notice.units, origin: 'SOURCE', source_id: notice.source_id, source_object_id: notice.id, source_base_date: notice.source_date,
        basis: '본 모집공고 입주 예정 물량 · 실입주 아님', evidence_url: notice.evidence_url ?? null });
    }
    const p = progress.length ? maxBy(progress, (x) => [x.as_of_date]) : null;
    if (p && p.pct === 100 && !p.inferred) events.push({ stage: 'COMPLETION', event_date: p.as_of_date, units: cap, evidence_url: p.evidence_url, origin: p.origin });
    applyOverrides();
    const c = { id: row.id, source_ids: group.map((m) => m.id), name: row.name, units: cap, planned_units: plannedCap, quantity_basis: plannedCap ? 'PLAN' : 'NOTICE_ONLY', region: row.region, ...cityOf(row),
      program_id: row.mapping.program_id ?? null, program: row.mapping.program_name || row.program || null, block: row.block ?? null, developer: group.find((m) => m.developer)?.developer ?? null,
      events, schedules, progress: p, mapping_status: row.mapping.status,
      eligibility_status: beforePeriod ? 'PRE_POLICY_START' : starts.length ? 'START_IN_POLICY_PERIOD' : 'PERIOD_MEMBERSHIP_REVIEW', evidence_url: row.evidence_url ?? null };
    portfolio.push(c);
    if (!beforePeriod && plannedCap) cohorts.push(c);
  }
  const allocated = cohorts.reduce((a, c) => a + c.units, 0);
  if (allocated > plan.target_units) throw new Error('연결 사업 물량이 정책 목표 초과: 배분 검토 필요');
  return { plan, raw, chosen, excluded, missing, historical, portfolio, cohorts, allocated, notices };
}

/* occupancy_targets.occupancy_schedules → Map(사업 id → 입주 예정 일정) */
function occupancySchedules(projects, moveInPlans) {
  const owners = new Map();
  for (const p of projects) { const k = blockKey(p); if (k) { const s = keyStr(k); if (!owners.has(s)) owners.set(s, []); owners.get(s).push(p); } }
  const groups = new Map();
  for (const r of moveInPlans) {
    const k = blockKey({ ...r, district: r.district_name });
    if (k && owners.has(keyStr(k)) && r.units != null && r.move_in_plan_month) { const s = keyStr(k); if (!groups.has(s)) groups.set(s, []); groups.get(s).push(r); }
  }
  const result = new Map();
  for (const p of projects) {
    const dims = new Map();
    for (const r of p.rows || []) {
      const when = scheduleMonth(r.move_in_month);
      if (when && Number.isInteger(r.units)) { if (!dims.has(when)) dims.set(when, []); dims.get(when).push(r.units); }
    }
    if (!dims.size) continue;
    let remaining = p.planned_units || [...dims.values()].flat().reduce((a, b) => a + b, 0);
    const schedules = [];
    for (const when of [...dims.keys()].sort(byStr)) {
      const units = Math.min(remaining, dims.get(when).reduce((a, b) => a + b, 0)); remaining -= units;
      if (units <= 0) continue;
      schedules.push({ stage: 'MOVE_IN', due_date: `${when}-01`, units, precision: 'MONTH', origin: 'SOURCE', source_id: p.source_id, source_object_id: p.id, source_base_date: p.base_date, basis: '원천 면적·유형별 입주 예정 물량 · 실입주 아님', evidence_url: p.evidence_url ?? null });
    }
    result.set(p.id, schedules);
  }
  for (const [s, rs] of groups) {
    const version = rs.map((r) => String(r.dataset_version ?? '')).sort(byStr).pop();
    const latest = new Map(rs.filter((r) => String(r.dataset_version ?? '') === version).map((r) => [r.id, r]));
    const byMonth = new Map();
    for (const r of latest.values()) { if (!byMonth.has(r.move_in_plan_month)) byMonth.set(r.move_in_plan_month, []); byMonth.get(r.move_in_plan_month).push(r); }
    for (const p of owners.get(s)) {
      const schedules = []; let remaining = p.planned_units || 0;
      for (const month of [...byMonth.keys()].sort(byStr)) {
        const list = byMonth.get(month), units = Math.min(remaining, list.reduce((a, r) => a + r.units, 0)); remaining -= units;
        if (units <= 0) continue;
        schedules.push({ stage: 'MOVE_IN', due_date: `${month}-01`, units, precision: 'MONTH', origin: 'SOURCE', source_id: list[0].source_id, source_object_id: `occupancy:${s}`, source_base_date: version, basis: 'LH 공식 연간 입주계획 · 동일 지구·블록 연결 검토 · 실입주 아님', evidence_url: list[0].evidence_url ?? null, review_status: 'REVIEW' });
      }
      if (!result.has(p.id)) result.set(p.id, []);
      result.get(p.id).push(...schedules);
    }
  }
  return result;
}

/* ---------- 목표·확인 점(policy_delivery_comparison) ---------- */
/* _schedule_targets: 코호트마다 가장 늦은 원천 일정 하나(관리 목표가 있으면 그것만), 같은 (날짜·호수) 한 번, 사업 물량 상한 → 날짜 → [{ id, units, s }] (날짜 순) */
function scheduleIncrements(cohorts, metric, periodStart) {
  const inc = new Map();
  for (const c of cohorts) {
    let source = c.schedules.filter((s) => s.stage === metric && (get(s, 'origin', null) === 'SOURCE' || s.managed_schedule) && s.units != null && s.due_date >= periodStart);
    const managedOnly = source.filter((s) => s.managed_schedule);
    if (managedOnly.length) source = managedOnly;   // 관리 목표가 있으면 그것만
    if (!source.length) continue;
    const latest = maxBy(source, (s) => [s.source_base_date || '', s.source_object_id || '']);
    source = source.filter((s) => get(s, 'source_object_id', null) === get(latest, 'source_object_id', null));
    const unique = new Map();
    for (const s of source) unique.set(`${s.due_date}\u0000${s.units}`, s);
    let remaining = c.units;
    for (const s of [...unique.values()].map((s, i) => [s, i]).sort(([a, i], [b, j]) => byStr(a.due_date, b.due_date) || i - j).map(([s]) => s)) {
      const amount = Math.min(remaining, s.units);
      if (amount <= 0) continue;
      if (!inc.has(s.due_date)) inc.set(s.due_date, []);
      inc.get(s.due_date).push({ id: c.id, units: amount, s });
      remaining -= amount;
    }
  }
  return [...inc.keys()].sort(byStr).map((date) => [date, inc.get(date)]);
}
const urlsOf = (xs) => [...new Set(xs.map((x) => x.evidence_url).filter(Boolean))].sort(byStr);
/* HOME _schedule_targets 점 그대로(date·units 누적·annual_units·origin·precision·evidence_urls·basis) */
function homeScheduleTargets(cohorts, metric, periodStart) {
  let cum = 0;
  return scheduleIncrements(cohorts, metric, periodStart).map(([date, xs]) => {
    const units = xs.reduce((a, x) => a + x.units, 0);
    cum += units;
    return { date, units: cum, annual_units: units, origin: xs.some((x) => x.s.managed_schedule) ? 'MANUAL' : 'SOURCE', precision: 'DAY', evidence_urls: urlsOf(xs.map((x) => x.s)), basis: '연결 사업 목표 일정 · 담당자 입력 우선 · 중복 제외' };
  });
}
/* 우리 문서용: { points: [{ date, units, annual_units, cohorts }], cohorts } */
function scheduleTargets(cohorts, metric, periodStart) {
  const used = new Set();
  let cum = 0;
  const points = scheduleIncrements(cohorts, metric, periodStart).map(([date, xs]) => {
    const units = xs.reduce((a, x) => a + x.units, 0);
    cum += units;
    for (const x of xs) used.add(x.id);
    return { date, units: cum, annual_units: units, cohorts: xs.length };
  });
  return { points, cohorts: used.size };
}
/* _events: 단계 실적 사건 → 날짜별 누적(사업별 최대 도달량, 확인 필요 연결 포함). cumulative 면 후속 단계 사건도 그 단계 도달로 본다(tracking).
   keep(e) 로 사건을 거른다(우리 확인 = 담당자 추정 입력 뺌). HOME 점 그대로(…·manual_units·inferred_units·evidence_urls) */
const LATER = { BUSINESS: ['BUSINESS', 'APPROVAL', 'CONSTRUCTION', 'COMPLETION', 'SUPPLY', 'MOVE_IN'], APPROVAL: ['APPROVAL', 'CONSTRUCTION', 'COMPLETION', 'SUPPLY', 'MOVE_IN'],
  CONSTRUCTION: ['CONSTRUCTION', 'COMPLETION', 'SUPPLY', 'MOVE_IN'], COMPLETION: ['COMPLETION', 'MOVE_IN'], SUPPLY: ['SUPPLY', 'MOVE_IN'], MOVE_IN: ['MOVE_IN'] };
function homeEvents(cohorts, metric, asOf, { cumulative = false, keep = () => true } = {}) {
  const accepted = new Set(cumulative ? LATER[metric] ?? [metric] : [metric]);
  const byDate = new Map();
  for (const c of cohorts) for (const e of c.events) {
    if (accepted.has(e.stage) && get(e, 'status', 'ACTUAL') === 'ACTUAL' && e.event_date <= asOf && keep(e)) {
      if (!byDate.has(e.event_date)) byDate.set(e.event_date, []);
      byDate.get(e.event_date).push([c, e]);
    }
  }
  const counts = new Map(), confirmed = new Map(), attributed = new Map(), manual = new Map(), inferred = new Map();
  const bump = (m, id, v) => m.set(id, Math.max(m.get(id) ?? 0, v));
  const sum = (m) => [...m.values()].reduce((a, b) => a + b, 0);
  const points = [...byDate.keys()].sort(byStr).map((date) => {
    const list = byDate.get(date);
    for (const [c, e] of list) {
      const v = Math.min(c.units, e.units == null ? c.units : e.units);
      bump(counts, c.id, v);
      if (e.origin === 'MANUAL') bump(manual, c.id, v);
      if (e.inferred) bump(inferred, c.id, v);
      if (e.review_status !== 'REVIEW') bump(confirmed, c.id, v);
      if (e.review_status !== 'REVIEW' && c.mapping_status === 'CONFIRMED') bump(attributed, c.id, v);
    }
    return { date, units: sum(counts), confirmed_units: sum(confirmed), policy_confirmed_units: sum(attributed), review_units: sum(counts) - sum(confirmed), origin: 'SOURCE_OR_MANUAL',
      manual_units: sum(manual), inferred_units: sum(inferred), evidence_urls: urlsOf(list.map(([, e]) => e)) };
  });
  return { points, cohorts: counts.size };
}
/* 우리 문서용(같은 단계만): estimates: false 면 담당자 추정 입력(estimate)을 뺀다 → { points: [{ date, units, confirmed_units, policy_confirmed_units, review_units }], cohorts } */
function stageEvents(cohorts, metric, asOf, { estimates = true } = {}) {
  const r = homeEvents(cohorts, metric, asOf, { keep: (e) => estimates || !e.estimate });
  return { points: r.points.map(({ date, units, confirmed_units, policy_confirmed_units, review_units }) => ({ date, units, confirmed_units, policy_confirmed_units, review_units })), cohorts: r.cohorts };
}
/* comparison_index 의 tracking(2038810): 선택 범위 사업의 1900-01-01 부터 목표 점 + 후속 단계까지 누적한 확인 점(담당자 입력·추정 포함) */
function trackingOf(cohorts, metric, asOf) {
  return { target_points: homeScheduleTargets(cohorts, metric, '1900-01-01'), actual_points: homeEvents(cohorts, metric, asOf, { cumulative: true }).points,
    project_count: cohorts.length, basis: '선택 범위 사업 현재+후속 단계 누적 · 담당자 입력·추정 포함 · 원천 중복 제외' };
}
/* portfolio_comparisons(build_delivery 의 comparison_index(포트폴리오, 정책 시작 1900-01-01)) 중 tracking: 범위 키 → { name, kind, metrics: { 지표: { label, tracking } } }.
   범위 = policy · region:<시도> · city:<시군구 id> · program:<프로그램 id>(·|region:<시도>·|city:<id>). 사업 범위(project:)는 옮기지 않았다.
   programs = { 프로그램 id: 이름 }(HOME plan.program_profiles — 덤프에 없다): 주면 사업이 없는 프로그램도 빈 범위로 넣고 이름을 그것으로 쓴다 */
function portfolioComparisons(portfolio, asOf, { programs = {} } = {}) {
  const scopes = new Map([['policy', { name: '수도권 전체', kind: 'policy', cohorts: portfolio }]]);
  for (const region of REGIONS) scopes.set(`region:${region}`, { name: region, kind: 'region', cohorts: portfolio.filter((c) => c.region === region) });
  for (const c of portfolio) if (c.municipality_id) {
    const k = `city:${c.municipality_id}`;
    if (!scopes.has(k)) scopes.set(k, { name: c.municipality || c.municipality_id, kind: 'city', cohorts: [] });
    scopes.get(k).cohorts.push(c);
  }
  for (const pid of [...new Set([...portfolio.map((c) => c.program_id).filter(Boolean), ...Object.keys(programs)])]) {
    const members = portfolio.filter((c) => c.program_id === pid), key = `program:${pid}`;
    scopes.set(key, { name: programs[pid] || (members.length ? members[0].program : pid) || pid, kind: 'program', cohorts: members });
    for (const region of new Set(members.map((c) => c.region))) scopes.set(`${key}|region:${region}`, { name: region, kind: 'program_region', cohorts: members.filter((c) => c.region === region) });
    for (const city of new Set(members.map((c) => c.municipality_id).filter(Boolean))) {
      const local = members.filter((c) => c.municipality_id === city);
      scopes.set(`${key}|city:${city}`, { name: local[0].municipality || city, kind: 'program_city', cohorts: local });
    }
  }
  const out = {};
  for (const [key, sc] of scopes) out[key] = { name: sc.name, kind: sc.kind, metrics: Object.fromEntries(Object.keys(HOME_METRICS).map((m) => [m, { label: HOME_METRICS[m], tracking: trackingOf(sc.cohorts, m, asOf) }])) };
  return out;
}
/* _official_targets(정책 전체): 9·7 원문 연도별 착공 목표 → 연말 누적 */
function officialTargets(plan) {
  let cum = 0;
  return plan.annual.slice().sort((a, b) => a.year - b.year).filter((a) => a.units != null).map((a) => { cum += a.units; return { date: `${a.year}-12-31`, units: cum, annual_units: a.units }; });
}
/* _regional_actual(수도권 3개 시도): 착공 통계 월 합의 누적, 빠진 달·시도가 있으면 거기서 멈춘다 */
function regionalActual(statistics, asOf, periodStart) {
  const monthly = new Map(), ym = asOf.slice(0, 7).replace('-', '');
  for (const r of statistics) {
    const period = String(r.statistic_period ?? '');
    if (r.statistic_metric === '착공' && REGIONS.includes(r.region) && /^\d{6}$/.test(period) && periodStart.slice(0, 4) <= period.slice(0, 4) && period <= ym && Number.isInteger(r.units) && r.units >= 0) {
      if (!monthly.has(period)) monthly.set(period, new Map());
      if (monthly.get(period).has(r.region)) throw new Error('같은 지역·월 착공 통계 중복');
      monthly.get(period).set(r.region, r.units);
    }
  }
  const points = []; let cum = 0, y = +periodStart.slice(0, 4), m = +periodStart.slice(5, 7);
  while (`${y}${pad2(m)}` <= ym) {
    const when = `${y}-${pad2(m)}-${pad2(lastDayOf(y, m))}`;
    if (when > asOf) break;
    const v = monthly.get(`${y}${pad2(m)}`);
    if (!v || v.size !== REGIONS.length) break;
    const units = REGIONS.reduce((a, r) => a + v.get(r), 0);
    cum += units;
    points.push({ date: when, units: cum, annual_units: units, by_region: Object.fromEntries(REGIONS.map((r) => [r, v.get(r)])) });
    if (m === 12) { y++; m = 1; } else m++;
  }
  return points;
}

const lastAtOrBefore = (points, date) => points.filter((p) => p.date <= date).pop() ?? null;
const pct1 = (gap, base) => (base > 0 ? Number(((100 * gap) / base).toFixed(1)) : null);

/* HOME annual(연도 쌍) — comparison_index 의 years */
function annualPairs(targets, actual, asOf, macro) {
  const year0 = +asOf.slice(0, 4), out = [];
  for (let year = year0 - 5; year <= year0 + 5; year++) {
    const yearEnd = `${year}-12-31`, obsEnd = yearEnd < asOf ? yearEnd : asOf;
    const yearlyPlans = targets.filter((p) => p.date.startsWith(String(year)));
    const yearlyActual = actual.filter((a) => a.date.startsWith(String(year)) && a.date <= obsEnd);
    const last = year <= year0 ? lastAtOrBefore(actual, obsEnd) : null;
    const prior = actual.filter((a) => a.date < `${year}-01-01`).pop() ?? null;
    const target = lastAtOrBefore(targets, yearEnd);
    out.push({ year, target_units: yearlyPlans.length ? yearlyPlans.reduce((a, p) => a + p.annual_units, 0) : null, target_cumulative_units: target ? target.units : null,
      management_cumulative_units: null,   // 정책·지역 범위 담당자 목표(delivery_setting·policy_profile)는 옮기지 않았다 — 사업 범위 승인 일정은 목표 점에 들어간다
      actual_units: yearlyActual.length ? yearlyActual[yearlyActual.length - 1].units - (prior ? prior.units : 0) : null,
      actual_cumulative_units: last ? last.units : null, actual_through: last ? last.date : null,
      actual_status: year > year0 ? 'FUTURE' : yearlyActual.length && (!macro || yearlyActual[yearlyActual.length - 1].date < yearEnd) ? 'PARTIAL' : yearlyActual.length ? 'OBSERVED' : 'NOT_ACQUIRED' });
  }
  return out;
}

/* homeRule — HOME 화면 comparisonStatus: 기준일까지 도래한 마지막 목표 누적 대 기준일까지 마지막 확인 누적 */
function homeRule(targets, actual, asOf) {
  const due = lastAtOrBefore(targets, asOf), act = lastAtOrBefore(actual, asOf);
  let status = 'NO_TARGET', gap = null;
  if (targets.length && !due) status = 'NOT_DUE';
  if (due) {
    if (!act) status = 'NO_ACTUAL';
    else if (act.units >= due.units) { status = 'REACHED'; gap = 0; } else if (act.date < due.date) status = 'STALE_ACTUAL';
    else { gap = Math.max(0, due.units - act.units); status = gap ? 'GAP' : 'REACHED'; }
  }
  return { target: due ? { date: due.date, units: due.units } : null, actual: act ? { date: act.date, units: act.units, reviewUnits: act.review_units ?? null, confirmedUnits: act.confirmed_units ?? null } : null,
    status, gap, shortfallPct: gap != null && due && due.units > 0 ? pct1(gap, due.units) : null };
}

/* samePeriod — 같은 해 1월 1일 ~ 기준 달 말일(지난 해는 12월 31일)의 목표 증가분 대 확인 증가분. 그 기간에 점이 없으면 null(0 으로 보지 않는다).
   status: GAP · REACHED · NO_ACTUAL(목표만) · NOT_DUE(목표가 기간 뒤에만) · NO_TARGET
   withEstimates(추정 포함 확인 점)를 주면 actualWithEstimates 를 덧붙인다 — actual·gap·status 는 확인(actual 점)으로만 낸다 */
function samePeriod(targets, actual, cutoff, firstYear, withEstimates = null) {
  const years = [];
  for (let year = firstYear; year <= +cutoff.slice(0, 4); year++) {
    const from = `${year}-01-01`, through = `${year}-12-31` < cutoff ? `${year}-12-31` : cutoff;
    const inWin = (p) => p.date >= from && p.date <= through;
    const delta = (points) => {
      if (!points.some(inWin)) return null;
      const end = lastAtOrBefore(points, through), before = points.filter((p) => p.date < from).pop();
      return end.units - (before ? before.units : 0);
    };
    const target = delta(targets), act = delta(actual), lastAct = actual.filter(inWin).pop() ?? null;
    const gap = target != null && act != null ? Math.max(0, target - act) : null;
    const reviewBefore = actual.filter((p) => p.date < from).pop();
    years.push({ year, from, through, target, actual: act, ...(withEstimates ? { actualWithEstimates: delta(withEstimates) } : {}), actualThrough: lastAct ? lastAct.date : null,
      actualReviewUnits: lastAct && lastAct.review_units != null ? lastAct.review_units - (reviewBefore?.review_units ?? 0) : null,
      gap, shortfallPct: gap != null ? pct1(gap, target) : null,
      status: target == null ? (targets.some((p) => p.date > through) ? 'NOT_DUE' : 'NO_TARGET') : act == null ? 'NO_ACTUAL' : gap > 0 ? 'GAP' : 'REACHED' });
  }
  return years;
}

/* 월말 시계열: 정책 시작 달 ~ 기준 달, 목표 누적(정책 시작일부터)·확인 누적(처음부터)·그해 1월부터의 증가분 */
function monthlySeries(targets, actual, periodStart, cutoff) {
  const out = [];
  let y = +periodStart.slice(0, 4), m = +periodStart.slice(5, 7);
  while (`${y}-${pad2(m)}` <= cutoff.slice(0, 7)) {
    const end = `${y}-${pad2(m)}-${pad2(lastDayOf(y, m))}`, jan = `${y}-01-01`;
    const t = lastAtOrBefore(targets, end), a = lastAtOrBefore(actual, end);
    const t0 = targets.filter((p) => p.date < jan).pop(), a0 = actual.filter((p) => p.date < jan).pop();
    out.push({ month: `${y}-${pad2(m)}`, target: t ? t.units : null, actual: a ? a.units : null,
      targetYtd: t ? t.units - (t0 ? t0.units : 0) : null, actualYtd: a ? a.units - (a0 ? a0.units : 0) : null });
    if (m === 12) { y++; m = 1; } else m++;
  }
  return out;
}

/* 판 → 정책 진행 문서 */
function policyProgress(home, { policyId = POLICY_ID } = {}) {
  const asOf = asOfOf(home.snapshotAt);
  const svc = homeService(home, asOf);
  const b = buildCohorts(svc, asOf, policyId);
  const statistics = svc.rows('statistic');
  const cutoff = (() => { const [y, m] = asOf.split('-').map(Number); const end = `${asOf.slice(0, 7)}-${pad2(lastDayOf(y, m))}`; if (end === asOf) return asOf; return m === 1 ? `${y - 1}-12-31` : `${y}-${pad2(m - 1)}-${pad2(lastDayOf(y, m - 1))}`; })();
  const periodStart = b.plan.period_start, firstYear = +periodStart.slice(0, 4);
  const stages = {};
  for (const metric of Object.keys(METRICS)) {
    const macro = metric === 'CONSTRUCTION';
    const t = macro ? { points: officialTargets(b.plan), cohorts: null } : scheduleTargets(b.cohorts, metric, periodStart);
    const a = macro ? { points: regionalActual(statistics, asOf, periodStart), cohorts: null } : stageEvents(b.cohorts, metric, asOf);   // 입주도 실제 시작 사건을 센다(2038810)
    const confirmed = macro ? a : stageEvents(b.cohorts, metric, asOf, { estimates: false });   // 확인 = 담당자 추정 입력을 뺀 사건
    const last = a.points[a.points.length - 1];
    stages[metric] = {
      label: METRICS[metric],
      targetBasis: macro ? '9·7 원문 연도별 착공 목표' : '연결 사업 원천의 동일 단계 예정 물량',
      actualBasis: macro ? '동일 범위 공식 지역 착공 통계(서울·경기·인천 합)' : '동일 범위 단계 도달량 · 확인 필요 연결 포함 · 관측일 기준 추정은 사건일과 구분',
      evidence: { targetCohorts: t.cohorts, actualCohorts: a.cohorts, reviewIncluded: !macro, reviewUnits: last?.review_units ?? null, confirmedUnits: last?.confirmed_units ?? null, policyConfirmedUnits: last?.policy_confirmed_units ?? null },
      homeRule: homeRule(t.points, a.points, asOf),
      samePeriod: samePeriod(t.points, confirmed.points, cutoff, firstYear, a.points),
      monthly: monthlySeries(t.points, a.points, periodStart, cutoff),
      targetPoints: t.points.map(({ cohorts, ...p }) => p),
      actualPoints: a.points,
      annual: annualPairs(t.points, a.points, asOf, macro),
    };
  }
  return {
    schema: 'policy-progress/1',
    source: { system: 'home', edition: home.edition, snapshotAt: home.snapshotAt, sourceCommit: home.manifest.source_commit ?? null,
      rule: 'HOME 10-home backend(커밋 2038810) policy_delivery.build_delivery + policy_delivery_comparison.comparison_index(정책 전체 범위), web policy-stage-flow.js comparisonStatus' },
    asOf, referenceMonthEnd: cutoff,
    policies: [{
      policyId, name: '주택공급 확대방안 (9·7)', periodStart, periodEnd: b.plan.period_end ?? null, targetUnits: b.plan.target_units,
      basis: {
        linkedProjects: b.raw.length, afterDedup: b.chosen.length, duplicateExcluded: b.excluded.length, missingQuantity: b.missing.length,
        portfolio: b.portfolio.length, prePolicyStart: b.historical.length, cohorts: b.cohorts.length, cohortUnits: b.allocated,
        linkedNotices: b.cohorts.filter((c) => b.notices.has(c.id)).length, mappingReviewIncluded: true,
        rule: '사업 원장(정책 매핑) → 지구·블록 중복 제외(여러 원천이 같은 블록이면 LH 공급계획 하나, 계획이 둘 이상이거나 계획 없이 여러 개면 모두 제외) → 계획물량 있고 정책기간 전 착공이 아닌 묶음',
      },
      stages,
    }],
    notes: [
      'homeRule 은 HOME 화면과 같다(목표 누적은 정책 시작일부터, 확인 누적은 처음부터라 기간이 섞인다). 우리 화면은 samePeriod(같은 해 1월~기준 달)를 쓴다.',
      '착공은 정책 전체 범위에서 원문 연도별 목표(연말 점)와 지역 착공 통계를 쓴다 — 연말 목표를 달로 나누지 않는다.',
      '입주는 실제 시작 사건(담당자 측정값 등)만 센다 — 입주 물량 통계가 아니다(HOME 2038810 과 같다).',
      'HOME 의 이 계산은 9·7(POL_2025_0907) 전용이다 — 1·29·8·13 은 같은 코드 경로가 없다.',
      `samePeriod.actual 은 확인(담당자 추정 입력 ${[...ESTIMATE_RULES].join('·')} 을 뺀 사건), actualWithEstimates 는 추정 포함(= HOME actualPoints)이다. gap·status 는 확인으로만 낸다.`,
    ],
  };
}

/* 화면 생성기용: HOME /policy-delivery/view 응답 중 포트폴리오 부분과 같은 모양 — { policy_id, name, as_of_date, target_units, plan, stages, cohorts, portfolio_cohorts, portfolio_comparisons }.
   home 을 주지 않으면 최신 달 폴더의 HOME 판을 읽는다. portfolio_comparisons 는 tracking 만 담는다(portfolioComparisons) */
function homeView(home = null, { policyId = POLICY_ID } = {}) {
  if (!home) {
    const dir = HOME.latestHomeDir(P.ledgerDir(P.latestMonth()));
    if (!dir || !HOME.homeAvailable(dir)) throw new Error('HOME 판(raw/home/<덤프시각>)의 원본(jsonl.gz)이 없다');
    home = HOME.readHome(dir);
  }
  const asOf = asOfOf(home.snapshotAt);
  const b = buildCohorts(homeService(home, asOf), asOf, policyId);
  return { policy_id: policyId, name: '주택공급 확대방안 (9·7)', as_of_date: asOf, target_units: b.plan.target_units,
    plan: { policy_id: policyId, period_start: b.plan.period_start, period_end: b.plan.period_end ?? null, target_units: b.plan.target_units, annual: b.plan.annual },
    stages: { POLICY: '정책', BUSINESS: '사업화', APPROVAL: '인허가', CONSTRUCTION: '건설', SUPPLY: '공급', MOVE_IN: '입주' },
    cohorts: b.cohorts, portfolio_cohorts: b.portfolio, portfolio_comparisons: portfolioComparisons(b.portfolio, asOf) };
}

function render(doc) { return `${JSON.stringify(doc, null, 1)}\n`; }

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (['--month', '--home', '--out'].includes(a)) o[a.slice(2)] = argv[++i];
    else throw new Error(`모르는 인자 ${a}`);
  }
  return o;
}

module.exports = { ESTIMATE_RULES, policyProgress, render, schedulePeriod, sourceEvents, blockKey, inventory, linkedNotices, scheduleTargets, stageEvents, homeRule, samePeriod, asOfOf, buildCohorts, homeService, POLICY_ID,
  trackingOf, portfolioComparisons, homeView, homeScheduleTargets, homeEvents };

if (require.main === module) {
  try {
    const o = parseArgs(process.argv.slice(2));
    const dir = o.home ? path.resolve(o.home) : HOME.latestHomeDir(P.ledgerDir(o.month ?? P.latestMonth()));
    if (!dir) throw new Error('HOME 판(raw/home/<덤프시각>)이 없다');
    if (!HOME.homeAvailable(dir)) throw new Error(`${dir} 의 원본(jsonl.gz)이 없다 — raw-store.js pull 또는 home-dump.py`);
    const out = o.out ? path.resolve(o.out) : path.join(P.ROOT, 'data/board/policy-progress.json');
    const doc = policyProgress(HOME.readHome(dir));
    fs.writeFileSync(out, render(doc));
    const s = doc.policies[0].stages.SUPPLY, y = s.samePeriod[s.samePeriod.length - 1];
    console.log(`${path.relative(P.ROOT, out)}: 기준일 ${doc.asOf} · 공급 HOME 방식 ${s.homeRule.target?.units ?? '–'} 대 ${s.homeRule.actual?.units ?? '–'} · 같은 기간 ${y.year} ${y.target ?? '–'} 대 ${y.actual ?? '–'} (부족 ${y.gap ?? '–'} · ${y.shortfallPct ?? '–'}%)`);
  } catch (e) { console.error(`오류: ${e.message}`); process.exit(1); }
}
