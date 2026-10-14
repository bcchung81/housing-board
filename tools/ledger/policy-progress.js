'use strict';
/* 정책 단계별 목표·확인 누적(9·7 주택공급 확대방안): HOME 덤프 판(raw/home/<덤프시각>)으로 HOME 운영 화면의 계산을 그대로 다시 한다. 오프라인·결정적(같은 판 → 같은 바이트).
   실행: node tools/ledger/policy-progress.js [--month YYYY-MM | --home <판 폴더>] [--out <파일>](기본 data/board/policy-progress.json)
   옮긴 계산(HOME PoC 10-home backend, 커밋 21c60b1 — 읽기만 했다)
   - policy_delivery.build_delivery: 정책에 이어진 사업(service.projects(policy_id)) → 지구·블록 중복 제외(supply_dashboard.inventory) → 같은 블록 원천을 한 묶음으로
     사건(착공 실적·단계 근거 stage_evidence·교차 원천 evidence_bridge·본 모집공고 linked_notices·공정률 100%)과 일정(roadmap.source_events·evidence_bridge 계획·입주계획)을 모은다.
     계획물량이 있고 정책기간 전 착공이 아닌 묶음만 '코호트'.
   - policy_delivery_comparison.comparison_index 의 정책 전체 범위: 단계별 목표 점(_schedule_targets — 코호트마다 가장 늦은 원천 하나, 같은 (날짜·호수) 한 번, 사업 물량 상한, 정책 시작일 이후)과
     확인 점(_events — 사업별 최대 도달량의 누적, 확인 필요(REVIEW) 연결 포함). 착공은 9·7 원문 연도별 목표와 지역 착공 통계(_official_targets·_regional_actual).
   - 기준일(as_of) = 덤프 시각의 한국 날짜(HOME 은 기준일 다음 날 0시(한국) 전에 기록된 판을 읽는다 — 덤프 뒤 기록이 없으니 덤프의 현재 판과 같다).
   두 가지 비교
   - homeRule: HOME 화면(policy-stage-flow.js comparisonStatus)과 같다 — 기준일까지 도래한 마지막 목표 누적(정책 시작일부터) 대 기준일까지 마지막 확인 누적(처음부터). 기간이 섞인다.
   - samePeriod(우리 기본, 2026-10-14 결정): 같은 해 1월 1일 ~ 기준 달(기준일 이전에 끝난 마지막 달의 말일) 목표 증가분 대 확인 증가분. 지난 해는 1~12월.
   시험: tests/js/policy-progress.test.cjs */
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
  if (row.source_id === 'policy_129') add('CONSTRUCTION', row.start_plan_month, row.planned_units ?? null, '1·29 공식 별첨 착공 예정월 · 준공·공급월 아님');
  for (const [field, stage] of [['source_supply_label', 'SUPPLY'], ['source_move_in_label', 'MOVE_IN']]) {
    if (schedulePeriod(row[field])) {
      events = events.filter((e) => e.stage !== stage);
      add(stage, row[field], row.planned_units ?? null, '원천 예정 범위 · 마지막 달 기준 집계');
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
  /* service.rows: 기준일 다음 날 0시(한국) 전 기록·현재 판 = 덤프의 현재 판(home-dump.py 가 superseded 없는 것만 뽑는다), payload.base_date > 기준일은 뺀다 */
  const rows = (kind) => {
    if (!K[kind]) throw new Error(`HOME 판에 ${kind} 가 없다(tools/ledger/home-dump.py 로 다시 뽑는다)`);
    return K[kind].filter((r) => (r.payload.base_date ?? '9999') <= asOf).map((r) => ({ ...r.payload, id: r.entity_id, source_id: r.source_id, revision_no: r.revision_no }));
  };
  const cutoffMs = Date.parse(`${asOf}T00:00:00+09:00`) + 86400000;
  const pgTime = (s) => Date.parse(String(s).replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
  /* service.projects(policy_id): 사업 매핑(home_mapping) → 프로그램(home_program_mapping, 기준일 전 생성)의 정책. 기준일 뒤 감사 기록이 없으니 되감기는 없다 */
  function projects(policyId) {
    const after = (K.home_audit || []).filter((a) => pgTime(a.recorded_at) >= cutoffMs);
    if (after.length) throw new Error(`기준일 뒤 감사 기록 ${after.length}건 — 되감기는 옮기지 않았다`);
    const mappings = new Map((K.home_mapping || []).map((m) => [m.project_id, m]));
    const programs = new Map((K.home_program_mapping || []).filter((p) => pgTime(p.created_at) < cutoffMs).map((p) => [p.id, p]));
    const latest = new Map();
    for (const r of rows('project_report')) {
      if (r.source_id !== 'lh_progress' || r.progress_pct == null) continue;
      const pid = r.current_project_id;
      if (pid && (!latest.has(pid) || r.report_date > latest.get(pid).report_date)) latest.set(pid, r);
    }
    const out = [];
    for (const row of rows('project')) {
      const m = mappings.get(row.id);
      let mapping = m ? { status: m.status, policy_id: m.policy_id, program_id: m.program_id } : { status: 'REVIEW', policy_id: row.proposed_policy ?? null, program_id: null };
      const program = programs.get(mapping.program_id);
      if (program) mapping = { ...mapping, program_id: program.id, program_name: program.name, policy_id: program.status !== 'RELEASED' ? program.policy_id : 'UNASSIGNED', policy_status: program.status };
      else if (mapping.program_id === 'UNASSIGNED') mapping = { ...mapping, policy_id: 'UNASSIGNED' };
      const report = latest.get(row.id);
      const p = { ...row, warnings: [...(row.warnings || [])], mapping };
      if (report && (row.progress_pct == null || report.report_date > (row.progress_date ?? row.base_date))) Object.assign(p, { progress_pct: report.progress_pct, progress_date: report.report_date, progress_evidence_url: report.evidence_url });
      if (mapping.policy_id === policyId) out.push(p);
    }
    return out.sort((a, b) => cmpTuple([a.region, a.name], [b.region, b.name]));
  }
  return { rows, projects };
}

/* ---------- 코호트(policy_delivery.build_delivery 의 사업 묶음) ---------- */
function buildCohorts(svc, asOf, policyId) {
  const plan = svc.rows('policy_delivery_plan').find((r) => r.policy_id === policyId);
  if (!plan) throw new Error(`${policyId} 원문 목표표(policy_delivery_plan)가 판에 없다`);
  const raw = svc.projects(policyId);
  const rows = raw.map((r) => ({ ...r, source_id: ALIASES[r.source_id] ?? r.source_id, origin_source_id: r.source_id }));
  const { chosen, excluded } = inventory(rows);
  const allByKey = new Map();
  const groupKey = (row) => { const k = blockKey(row); return k ? `K${keyStr(k)}` : `I${row.id}`; };
  for (const row of rows) { const k = groupKey(row); if (!allByKey.has(k)) allByKey.set(k, []); allByKey.get(k).push(row); }
  const notices = linkedNotices(chosen, svc.rows('notice'), asOf);
  /* 담당자 설정(delivery_setting)·승인 일정(execution_schedule) — 이 판에는 없다(관리 목표 없음) */
  const setting = svc.rows('delivery_setting').find((r) => r.policy_id === policyId) ?? { targets: [], events: [] };
  const approved = svc.rows('execution_schedule').filter((r) => r.status !== 'RELEASED' && r.units != null);
  if ((setting.targets || []).length || (setting.events || []).length || approved.length) throw new Error('담당자 목표·사건(delivery_setting·execution_schedule)이 있는 판 — 아직 옮기지 않았다');
  /* stage_evidence.linked_events */
  const stageLinks = new Map();
  for (const r of svc.rows('stage_evidence')) {
    const s = r.selected;
    if (!['REVIEW', 'CONFIRMED'].includes(r.status) || !s) continue;
    const effective = s.event_date || s.observed_on;
    if (!effective || effective > asOf) continue;
    if (!stageLinks.has(r.project_id)) stageLinks.set(r.project_id, []);
    stageLinks.get(r.project_id).push({ stage: r.stage, event_date: effective, units: s.units ?? null, status: s.event_date && !['PREREQUISITE', 'STAGE_INFERENCE'].includes(s.method) ? 'ACTUAL' : 'STATE', review_status: r.status, origin: 'LINKED_EVIDENCE', source_id: s.source_id ?? null });
  }
  /* evidence_bridge.by_project */
  const origins = new Map(['project', 'lh_completion_plan', 'document_evidence'].flatMap((k) => svc.rows(k).map((r) => [r.id, r.source_id])));
  const bridges = new Map();
  for (const r of svc.rows('evidence_bridge')) {
    const b = { ...r, source_id: r.evidence_source_id || (origins.has(r.source_entity_id) ? origins.get(r.source_entity_id) : r.source_id) };
    if (!bridges.has(b.project_id)) bridges.set(b.project_id, []);
    bridges.get(b.project_id).push(b);
  }
  const occupancy = occupancySchedules(rows, svc.rows('lh_movein_plan'));

  const portfolio = [], cohorts = [], historical = [], missing = [];
  for (const row of chosen) {
    const group = allByKey.get(groupKey(row));
    const plannedCap = row.planned_units ?? null;
    let cap = plannedCap;
    if (cap == null || cap <= 0) {
      missing.push(row.id); cap = notices.get(row.id)?.units;
      if (!cap) continue;
    }
    const events = [], schedules = [], progress = [];
    for (const member of group) {
      if (member.start_actual_date) events.push({ stage: 'CONSTRUCTION', event_date: member.start_actual_date, units: cap, origin: 'SOURCE', source_id: member.origin_source_id });
      for (const e of sourceEvents(member)) {
        schedules.push({ stage: e.stage, due_date: e.due_date || `${e.month}-01`, precision: e.precision, units: e.units, origin: 'SOURCE', source_id: member.origin_source_id, source_object_id: member.id, source_base_date: member.base_date });
      }
      if (member.progress_pct != null) progress.push({ pct: member.progress_pct, as_of_date: member.progress_date || member.base_date });
      events.push(...(stageLinks.get(member.id) || []));
      for (const bridge of bridges.get(member.id) || []) {
        if (!['REVIEW', 'CONFIRMED'].includes(bridge.status)) continue;
        for (const fact of bridge.facts || []) {
          if (fact.scope_partial) continue;
          const stage = fact.stage === 'CONSTRUCTION' && fact.milestone === 'COMPLETION' ? 'COMPLETION' : fact.stage;
          if (!EVENT_STAGES.has(stage)) continue;
          const when = fact.date || fact.date_label;
          if (fact.kind === 'ACTUAL' && when && when.length === 10 && when <= asOf) {
            events.push({ stage, event_date: when, units: fact.units ?? null, status: 'ACTUAL', review_status: bridge.status, origin: 'LINKED_EVIDENCE', source_id: bridge.source_id });
          } else if (fact.kind === 'PLAN') {
            const period = schedulePeriod(when);
            if (period) schedules.push({ stage, due_date: period.due_date, precision: period.precision, units: fact.units || cap, origin: 'SOURCE', source_id: bridge.source_id, source_object_id: bridge.source_entity_id, review_status: bridge.status });
          }
        }
      }
      schedules.push(...(occupancy.get(member.id) || []));
    }
    const starts = events.filter((e) => e.stage === 'CONSTRUCTION' && (e.status ?? 'ACTUAL') === 'ACTUAL').map((e) => e.event_date);
    const firstStart = starts.length ? starts.slice().sort(byStr)[0] : null;
    const beforePeriod = !!(firstStart && firstStart < plan.period_start);
    if (beforePeriod) historical.push(row.id);
    const notice = notices.get(row.id);
    if (notice) events.push({ stage: 'SUPPLY', event_date: notice.source_date, units: notice.units, origin: 'SOURCE', source_id: notice.source_id, notice_id: notice.id });
    if (notice && notice.move_in_plan_month) {
      const month = notice.move_in_plan_month.replaceAll('-', '');
      if (/^\d{6}$/.test(month)) schedules.push({ stage: 'MOVE_IN', due_date: `${month.slice(0, 4)}-${month.slice(4)}-01`, precision: 'MONTH', units: notice.units, origin: 'SOURCE', source_id: notice.source_id, source_object_id: notice.id, source_base_date: notice.source_date });
    }
    const p = progress.length ? maxBy(progress, (x) => [x.as_of_date]) : null;
    if (p && p.pct === 100) events.push({ stage: 'COMPLETION', event_date: p.as_of_date, units: cap, origin: 'SOURCE' });
    const c = { id: row.id, source_ids: group.map((m) => m.id), name: row.name, region: row.region, units: cap, planned_units: plannedCap, mapping_status: row.mapping.status, events, schedules };
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
      schedules.push({ stage: 'MOVE_IN', due_date: `${when}-01`, units, precision: 'MONTH', origin: 'SOURCE', source_id: p.source_id, source_object_id: p.id, source_base_date: p.base_date });
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
        schedules.push({ stage: 'MOVE_IN', due_date: `${month}-01`, units, precision: 'MONTH', origin: 'SOURCE', source_id: list[0].source_id, source_object_id: `occupancy:${s}`, source_base_date: version, review_status: 'REVIEW' });
      }
      if (!result.has(p.id)) result.set(p.id, []);
      result.get(p.id).push(...schedules);
    }
  }
  return result;
}

/* ---------- 목표·확인 점(policy_delivery_comparison) ---------- */
/* _schedule_targets: 코호트마다 가장 늦은 원천 일정 하나, 같은 (날짜·호수) 한 번, 사업 물량 상한 → 날짜별 누적 */
function scheduleTargets(cohorts, metric, periodStart) {
  const inc = new Map(), used = new Set();
  for (const c of cohorts) {
    let source = c.schedules.filter((s) => s.stage === metric && s.origin === 'SOURCE' && s.units != null && s.due_date >= periodStart);
    if (!source.length) continue;
    const latest = maxBy(source, (s) => [s.source_base_date || '', s.source_object_id || '']);
    source = source.filter((s) => s.source_object_id === latest.source_object_id);
    const unique = new Map();
    for (const s of source) unique.set(`${s.due_date}\u0000${s.units}`, s);
    let remaining = c.units;
    for (const s of [...unique.values()].map((s, i) => [s, i]).sort(([a, i], [b, j]) => byStr(a.due_date, b.due_date) || i - j).map(([s]) => s)) {
      const amount = Math.min(remaining, s.units);
      if (amount <= 0) continue;
      if (!inc.has(s.due_date)) inc.set(s.due_date, []);
      inc.get(s.due_date).push({ id: c.id, units: amount });
      used.add(c.id);
      remaining -= amount;
    }
  }
  let cum = 0;
  const points = [...inc.keys()].sort(byStr).map((date) => {
    const units = inc.get(date).reduce((a, x) => a + x.units, 0);
    cum += units;
    return { date, units: cum, annual_units: units, cohorts: inc.get(date).length };
  });
  return { points, cohorts: used.size };
}
/* _events: 단계 실적 사건 → 날짜별 누적(사업별 최대 도달량, 확인 필요 연결 포함) */
function stageEvents(cohorts, metric, asOf) {
  const byDate = new Map();
  for (const c of cohorts) for (const e of c.events) {
    if (e.stage === metric && (e.status ?? 'ACTUAL') === 'ACTUAL' && e.event_date <= asOf) {
      if (!byDate.has(e.event_date)) byDate.set(e.event_date, []);
      byDate.get(e.event_date).push([c, e]);
    }
  }
  const counts = new Map(), confirmed = new Map(), attributed = new Map();
  const bump = (m, id, v) => m.set(id, Math.max(m.get(id) ?? 0, v));
  const sum = (m) => [...m.values()].reduce((a, b) => a + b, 0);
  const points = [...byDate.keys()].sort(byStr).map((date) => {
    for (const [c, e] of byDate.get(date)) {
      const v = Math.min(c.units, e.units == null ? c.units : e.units);
      bump(counts, c.id, v);
      if (e.review_status !== 'REVIEW') bump(confirmed, c.id, v);
      if (e.review_status !== 'REVIEW' && c.mapping_status === 'CONFIRMED') bump(attributed, c.id, v);
    }
    return { date, units: sum(counts), confirmed_units: sum(confirmed), policy_confirmed_units: sum(attributed), review_units: sum(counts) - sum(confirmed) };
  });
  return { points, cohorts: counts.size };
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
      management_cumulative_units: null,   // 담당자 목표(delivery_setting·execution_schedule) — 이 판에는 없다(있으면 buildCohorts 가 멈춘다)
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
   status: GAP · REACHED · NO_ACTUAL(목표만) · NOT_DUE(목표가 기간 뒤에만) · NO_TARGET */
function samePeriod(targets, actual, cutoff, firstYear) {
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
    years.push({ year, from, through, target, actual: act, actualThrough: lastAct ? lastAct.date : null,
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
    const a = macro ? { points: regionalActual(statistics, asOf, periodStart), cohorts: null } : metric === 'MOVE_IN' ? { points: [], cohorts: 0 } : stageEvents(b.cohorts, metric, asOf);
    const last = a.points[a.points.length - 1];
    stages[metric] = {
      label: METRICS[metric],
      targetBasis: macro ? '9·7 원문 연도별 착공 목표' : '연결 사업 원천의 동일 단계 예정 물량',
      actualBasis: macro ? '동일 범위 공식 지역 착공 통계(서울·경기·인천 합)' : metric === 'MOVE_IN' ? '입주 실적은 집계하지 않음(실제 시작일만 관리)' : '동일 범위 단계 도달량 · 확인 필요 연결 포함 · 관측일 기준 추정은 사건일과 구분',
      evidence: { targetCohorts: t.cohorts, actualCohorts: a.cohorts, reviewIncluded: !macro && metric !== 'MOVE_IN', reviewUnits: last?.review_units ?? null, confirmedUnits: last?.confirmed_units ?? null, policyConfirmedUnits: last?.policy_confirmed_units ?? null },
      homeRule: homeRule(t.points, a.points, asOf),
      samePeriod: samePeriod(t.points, a.points, cutoff, firstYear),
      monthly: monthlySeries(t.points, a.points, periodStart, cutoff),
      targetPoints: t.points.map(({ cohorts, ...p }) => p),
      actualPoints: a.points,
      annual: annualPairs(t.points, a.points, asOf, macro),
    };
  }
  return {
    schema: 'policy-progress/1',
    source: { system: 'home', edition: home.edition, snapshotAt: home.snapshotAt, sourceCommit: home.manifest.source_commit ?? null,
      rule: 'HOME 10-home backend policy_delivery.build_delivery + policy_delivery_comparison.comparison_index(정책 전체 범위), web policy-stage-flow.js comparisonStatus' },
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
      '입주는 예정 물량만 있고 실적은 집계하지 않는다(HOME 과 같다).',
      'HOME 의 이 계산은 9·7(POL_2025_0907) 전용이다 — 1·29·8·13 은 같은 코드 경로가 없다.',
    ],
  };
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

module.exports = { policyProgress, render, schedulePeriod, sourceEvents, blockKey, inventory, linkedNotices, scheduleTargets, stageEvents, homeRule, samePeriod, asOfOf, buildCohorts, homeService, POLICY_ID };

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
