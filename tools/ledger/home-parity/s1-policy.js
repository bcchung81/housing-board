#!/usr/bin/env node
'use strict';
// S1 정답 값(golden-policy.json): HOME 정책·프로그램 추진현황 화면 숫자를 HOME API 응답(정답 입력 S1-*.json)에서
// HOME 프런트 JS(web/js_policy-stage-flow.js·js_policy-decision.js·js_policy-region-map.js)를 그대로 돌려 다시 계산한다.
// 옮겨 온 곳: .cache/home-parity/golden/S1-extract.js(2026-11-09 HOME-JSON-반영-계획 P3). 입력·출력 폴더를 인자로 받는다. 네트워크 없음.
// 쓰임: node s1-policy.js --golden <정답 입력 폴더> --web <프런트 JS 폴더> --out <golden-policy.json> [--check <비교할 golden-policy.json>]
// 2026-10-22 22:35 판(HOME 앱 bbc21f7, policy-stage-flow.js?v=20261022-render-cache-v17 · policy-907.js?v=20261022-visible-axis-v14):
//   /policy-delivery/view 응답의 portfolio_comparisons 는 요청 범위(scope)만 싣는다 — 시도 범위는 scope=region:<시도> 로 따로 받은 S1-view-region-<시도>.json 에서 합친다.
//   단계 카드 = summaryValues(dataAsOf·comparisonDate = 기준일 분기 말일), Y축 = windowAxis(첫 그리기 전체 구간), 말풍선 = renderChart gapChecks(머문 단계 부족분).
const fs = require('fs'), path = require('path'), vm = require('vm');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const HERE = path.resolve(arg('--golden') || '.'), POC = path.resolve(arg('--web') || HERE);
let YEAR = 2026;   // 분석 연도 = 응답 as_of_date 의 연도(build 에서 정한다)

// PoC 전역 함수 흉내(화면 글자용, 계산에는 쓰이지 않음)
const ctx = vm.createContext({console, num: v => Number(v).toLocaleString('ko-KR'), esc: v => String(v ?? ''), module: undefined});
for (const [file, name] of [['js_policy-stage-flow.js', 'PolicyStageFlow'], ['js_policy-decision.js', 'PolicyDecision'], ['js_policy-region-map.js', 'PolicyRegionMap']])
  vm.runInContext(fs.readFileSync(path.join(POC, file), 'utf8') + `\n;globalThis.${name}=${name};`, ctx, {filename: file});
const {PolicyStageFlow: Flow, PolicyDecision: Decision, PolicyRegionMap: RegionMap} = ctx;

const read = f => JSON.parse(fs.readFileSync(path.join(HERE, f), 'utf8'));
const withTracking = metrics => Object.fromEntries(Object.entries(metrics || {}).map(([k, c]) => [k, c.tracking ? {...c, ...c.tracking, management_points: []} : c]));
const plain = v => JSON.parse(JSON.stringify(v));

// js_policy-907.js reached() 그대로(지도 값: 사업별 해당 단계 이후 실제 사건의 최대 호수, 사업 규모로 자름)
function reached(data, items, key, when) {
  if (key === 'POLICY') return items.reduce((a, c) => a + (c.planned_units ?? 0), 0);
  const later = {BUSINESS: ['BUSINESS', 'APPROVAL', 'CONSTRUCTION', 'COMPLETION', 'SUPPLY', 'MOVE_IN'], APPROVAL: ['APPROVAL', 'CONSTRUCTION', 'COMPLETION', 'SUPPLY', 'MOVE_IN'], CONSTRUCTION: ['CONSTRUCTION', 'COMPLETION', 'SUPPLY', 'MOVE_IN'], COMPLETION: ['COMPLETION', 'MOVE_IN'], SUPPLY: ['SUPPLY', 'MOVE_IN'], MOVE_IN: ['MOVE_IN']};
  const end = when < data.as_of_date ? when : data.as_of_date;
  return items.reduce((sum, c) => sum + Math.min(c.units, Math.max(0, ...c.events.filter(e => (later[key] || [key]).includes(e.stage) && (e.status || 'ACTUAL') === 'ACTUAL' && e.event_date <= end).map(e => e.units ?? c.units))), 0);
}

// js_policy-907.js flow() 의 시작·끝 연도와 Y축(referenceAxis) 계산
function axisOf(data, rows, comparisons, {policyScope, programProfile}) {
  const dates = [data.as_of_date, Flow.quarterEnd(data.as_of_date), ...rows.flatMap(c => [...c.events.map(e => e.event_date), ...c.schedules.map(s => s.due_date)])]
    .concat(Object.values(comparisons).flatMap(c => [...(c.target_points || []), ...(c.management_points || []), ...(c.actual_points || [])].map(p => p.date))).filter(Boolean);
  if (policyScope) dates.push(data.plan.period_start, data.plan.period_end);
  else if (programProfile) dates.push(programProfile.period_start, programProfile.period_end);
  const years = dates.filter(Boolean).map(d => Number(d.slice(0, 4))), start = years.length ? Math.min(...years) : YEAR, end = Math.max(YEAR, ...years);
  const points = Flow.trackingPoints({comparisons, start, end, asOf: data.as_of_date});
  return {start, end, points};
}

// 단계 카드(summaryTable) 숫자
function stageCards(data, comparisons, policyTarget) {
  const q = Flow.quarterEnd(data.as_of_date), aux = q < data.as_of_date ? data.as_of_date : q;   // js_policy-907.js auxiliaryDate()
  const s = plain(Flow.summaryValues({year: YEAR, asOf: data.as_of_date, dataAsOf: data.as_of_date, comparisonDate: aux, comparisons, stages: data.stages}));
  const out = {POLICY: {target: policyTarget}};
  for (const [k, v] of Object.entries(s)) {
    const remainder = v.current_units != null && v.expected_units != null ? v.expected_units - v.current_units : null;
    out[k] = {current: v.current_units, measured_on: v.measurement_date, year_end_expected: v.expected_units, plan_date: v.plan_date, remainder};
  }
  return out;
}

// 그래프 위 지연·주의 말풍선(기준일 도래 목표 대비)
function callouts(data, comparisons) {
  // js_policy-stage-flow.js renderChart 의 gapChecks 그대로
  const m = {comparisons, asOf: data.as_of_date, stages: data.stages, tracking: true}, layout = Flow.stageLayout(m, m.asOf);
  return ['BUSINESS', 'APPROVAL', 'CONSTRUCTION', 'SUPPLY', 'MOVE_IN'].map(k => { const b = layout[k], c = Flow.comparisonStatus(m, k), assessment = Flow.assessGap(b.target.units, b.actual.units); return {...c, gap: b.gap, rate: Flow.shortageRate(b.gap, b.actual.cumulative), assessment, status: assessment.status}; })
    .filter(c => c.gap > 0).map(c => ({stage: c.stage, status: c.status, gap: c.gap, rate: Flow.formatGapRate(c.rate), due_date: c.due?.date ?? null, due_units: c.due?.units ?? null, actual_date: c.actual?.date, actual_units: c.actual?.units}));
}

// 추진현황 통계 4장(월별 실적 흐름·지연·주의 추이·향후 12개월·기관별)
function statistics(data, rows, metrics) {
  const m = plain(Decision.statistics(rows, data.as_of_date, YEAR, metrics));
  const latest = m.delays.at(-1);
  const stageNames = {BUSINESS: '사업화', APPROVAL: '인허가', CONSTRUCTION: '건설', SUPPLY: '공급', COMPLETION: '준공', MOVE_IN: '입주 시작'};
  return {
    linked_projects: rows.length,
    day: m.day,
    monthly_increments: m.monthly,
    delay_trend: m.delays.map(r => ({month: r.month, DELAYED: r.DELAYED, WARNING: r.WARNING})),
    delay_max_latest: latest.DELAYED,
    warning_max_latest: latest.WARNING,
    stage_gaps_latest: (latest.checks || []).filter(c => c.gap > 0).map(c => ({stage: c.stage, label: stageNames[c.stage], status: c.status, gap: c.gap, rate: Flow.formatGapRate(c.rate)})),
    upcoming_12m: {total: m.total, projects: m.projects, schedules: m.scheduled, last_month: m.upcoming.at(-1).month, months: m.upcoming},
    agencies: m.agencies.map(r => ({...r, delayed_share_pct: r.total ? Number((100 * r.DELAYED / r.total).toFixed(1)) : 0})),
  };
}

function regionMap(data, rows, compIndex, prefix = '') {
  const out = {};
  for (const r of ['서울특별시', '경기도', '인천광역시']) {
    const cs = rows.filter(c => c.region === r);
    const delay = Decision.mapDelay(compIndex[prefix + 'region:' + r]?.metrics, data.as_of_date);
    const dist = plain(RegionMap.stageDistribution(cs, data.as_of_date, data.as_of_date));
    out[r] = {supply_reached: reached(data, cs, 'SUPPLY', data.as_of_date), projects: cs.length, planned_units: cs.reduce((a, c) => a + (c.planned_units ?? 0), 0), delayed: delay.delayed, delay_note: delay.delayNote, stage_distribution: dist.counts, stage_total: dist.total};
    for (const k of ['BUSINESS', 'APPROVAL', 'CONSTRUCTION']) out[r][k.toLowerCase() + '_reached'] = reached(data, cs, k, data.as_of_date);
  }
  return out;
}

function policyGolden(data) {
  const rows = data.portfolio_cohorts;
  const metrics = data.portfolio_comparisons.policy.metrics, comparisons = withTracking(metrics);
  const {start, end, points} = axisOf(data, rows, comparisons, {policyScope: true});
  const axis = Flow.windowAxis({comparisons, asOf: data.as_of_date, tracking: true}, points[0]?.date || data.as_of_date, points.at(-1)?.date || data.as_of_date);   // js_policy-907.js axisForScope 첫 그리기
  const yearly = data.yearly_comparisons.policy.metrics;
  const yearPair = k => { const a = yearly[k].annual.find(a => a.year === YEAR), now = yearly[k].actual_points.at(-1); return {...a, latest_actual: now ? {date: now.date, units: now.units, policy_confirmed_units: now.policy_confirmed_units, review_units: now.review_units, manual_units: now.manual_units, inferred_units: now.inferred_units} : null}; };
  const lastStart = data.regional_start_months.at(-1);
  return {
    as_of_date: data.as_of_date,
    scope: data.official_alignment?.default_management_scope,
    overview: {target_units: data.target_units, period: data.plan.period_start.slice(0, 4) + '–' + data.plan.period_end.slice(0, 4), region_allocations: data.plan.region_allocations, joint_region_units: data.plan.joint_region_units, announced_at: data.plan.announced_at},
    linked_projects: rows.length,
    management_projects: data.management_projects.length,
    policy_period_cohorts: data.cohorts.length,
    stage_cards: stageCards(data, comparisons, data.target_units),
    // 지역 선택(scope=region:<시도>) 화면의 단계 카드 — 지역 목표는 plan.region_allocations
    region_cards: Object.fromEntries(['서울특별시', '경기도', '인천광역시'].filter((r) => data.portfolio_comparisons['region:' + r]).map((r) => [r, stageCards(data, withTracking(data.portfolio_comparisons['region:' + r].metrics), data.plan.region_allocations?.[r] ?? null)])),
    axis: {start_year: start, end_year: end, y_max: axis.max, full_max: data.target_units},
    callouts: callouts(data, comparisons),
    map_supply: regionMap(data, rows, data.portfolio_comparisons),
    statistics: statistics(data, rows, metrics),
    // 사업별 판정(기관별 진행현황과 같은 statusAt, 기준일 도래 일정 대비 같은 단계 실제)을 사업 수·호수로 모음
    project_status: rows.reduce((r, c) => { const s = Decision.statusAt(c, data.as_of_date).status; r[s] = r[s] || {projects: 0, units: 0}; r[s].projects++; r[s].units += c.units; return r; }, {}),
    // 누적 그래프·2D 막대의 '머문 단계' 호수(누적 도달 차분, 준공은 건설에 포함)
    stage_exclusive: (() => { const p = Flow.trackingPoints({comparisons, start: YEAR, end: YEAR, asOf: data.as_of_date}, [data.as_of_date])[0]; return {...p.totals, POLICY: rows.reduce((s, c) => s + c.units, 0) - Object.values(p.totals).reduce((a, b) => a + b, 0)}; })(),
    comparison_panel_supply_2026: yearPair('SUPPLY'),
    comparison_panel_construction_2026: yearPair('CONSTRUCTION'),
    yearly_2026: Object.fromEntries(Object.keys(yearly).map(k => [k, yearly[k].annual.find(a => a.year === YEAR) || null])),
    macro_start: {month: lastStart.month, cumulative_units: lastStart.cumulative_units, pct_of_target: Number((lastStart.cumulative_units / data.target_units * 100).toFixed(2))},
    reserve_units: data.reserve_units,
    allocated_units: data.allocated_units,
    // 2026-11-10 08:53 판(HOME d9657b7)부터 /policy-delivery/view 에 current·snapshots 가 없다(화면 JS 도 안 읽는다) → null
    current_totals_policy_period: data.current?.totals ?? null,
    portfolio_actual_points_last: Object.fromEntries(Object.entries(metrics).map(([k, c]) => { const p = (c.actual_points || []).filter(p => p.date <= data.as_of_date).at(-1); return [k, p ? {date: p.date, units: p.units} : null]; })),
    issues: {total: data.issues.length, by_status: data.issues.reduce((r, i) => (r[i.status] = (r[i.status] || 0) + 1, r), {})},
    official_alignment: {official_start_units_lower_bound: data.official_alignment.official_start_units_lower_bound, cases: data.official_alignment.cases.length},
  };
}

function programGolden(file, profileRow) {
  const data = read(file), id = profileRow.id, key = 'program:' + id;
  const rows = (data.portfolio_cohorts || data.cohorts || []).filter(c => c.program_id === id);
  const metrics = data.portfolio_comparisons?.[key]?.metrics || {}, comparisons = withTracking(metrics);
  const profile = profileRow.profile || null;
  const metric = profile?.metric && profile.metric !== 'CAPACITY' ? profile.metric : 'SUPPLY';
  const a = data.program_assessments?.[id];
  const st = rows.length ? statistics(data, rows, metrics) : null;
  return {
    name: profileRow.name, status: data.status, linked_projects: rows.length, linked_units: rows.reduce((s, c) => s + c.units, 0),
    target: profile ? {metric: profile.metric, unit: profile.unit, units: profile.target_units, period: (profile.period_start || '').slice(0, 4) + '–' + (profile.period_end || '').slice(0, 4)} : null,
    default_metric: metric,
    assessment: a ? {target_kind_label: a.target_kind_label, case: a.case, capacity_units: a.capacity_units, period_plan_units: a.period_plan_units, plan_gap_units: a.plan_gap_units, review_project_count: a.review_project_count, missing_quantity_count: a.missing_quantity_count, missing_schedule_count: a.missing_schedule_count} : null,
    stage_cards: Object.keys(metrics).length ? stageCards(data, comparisons, profile?.target_units ?? null) : null,
    callouts: Object.keys(metrics).length ? callouts(data, comparisons) : [],
    regions: [...new Set(rows.map(c => c.region))],
    statistics: st && {delay_max_latest: st.delay_max_latest, warning_max_latest: st.warning_max_latest, stage_gaps_latest: st.stage_gaps_latest, upcoming_total: st.upcoming_12m.total, upcoming_projects: st.upcoming_12m.projects, agencies: st.agencies.map(r => ({name: r.name, total: r.total, count: r.count, NORMAL: r.NORMAL, WARNING: r.WARNING, DELAYED: r.DELAYED, UNKNOWN: r.UNKNOWN}))},
  };
}

function otherPolicies() {
  const pm = read('S1-policy-monitor.json'), pol = read('S1-policies.json');
  return {
    policies_api: pol.items.map(p => ({policy_id: p.policy_id, name: p.name, target_units: p.target_units, metric: p.metric, kind: p.monitor_kind})),
    policy_monitor: pm.items.map(i => ({id: i.id, kind: i.kind, name: i.name, project_count: i.project_count, target_units: i.target_units, announced_target_units: i.announced_target_units, current_notice_units: i.current_notice_units, actual_supply_units: i.actual_supply_units, actual_supply_status: i.actual_supply_status, annual_goal_units: i.annual_goal_units, annual_observed_units: i.annual_observed_units, review_count: i.review_count, confirmed_count: i.confirmed_count})),
    policy_monitor_counts: {project_count: pm.project_count, review_count: pm.review_count, confirmed_count: pm.confirmed_count, released_count: pm.released_count},
  };
}

// 시도 범위 응답(scope=region:<시도>)의 portfolio_comparisons 를 정책 응답에 합친다(있으면)
function withRegions(data) {
  const extra = {};
  for (const r of ['서울특별시', '경기도', '인천광역시']) {
    const f = path.join(HERE, `S1-view-region-${r}.json`);
    if (fs.existsSync(f)) Object.assign(extra, Object.fromEntries(Object.entries(read(path.basename(f)).portfolio_comparisons).filter(([k]) => k !== 'policy')));
  }
  return {...data, portfolio_comparisons: {...data.portfolio_comparisons, ...extra}};
}

function build(viewFile) {
  const data = withRegions(read(viewFile));
  YEAR = Number(data.as_of_date.slice(0, 4));
  const mappings = read('S1-mappings.json');
  const programRows = mappings.programs.filter(p => p.policy_id === 'POL_2025_0907' && p.status !== 'REJECTED' && p.status !== 'RELEASED');
  const programs = {};
  for (const p of programRows) {
    const f = 'S1-view-program-' + p.id + '.json';
    programs[p.id] = fs.existsSync(path.join(HERE, f)) ? programGolden(f, p) : {name: p.name, missing_response: true};
  }
  return {_source: {view: viewFile, extractor: 'S1-extract.js', poc_js: ['js_policy-stage-flow.js', 'js_policy-decision.js', 'js_policy-region-map.js']}, policy: policyGolden(data), programs, other_policies: otherPolicies()};
}

// 지표키: 값 평탄화
function flatten(o, pre = '', out = {}) {
  if (o && typeof o === 'object' && !Array.isArray(o)) { for (const [k, v] of Object.entries(o)) flatten(v, pre ? pre + '.' + k : k, out); return out; }
  out[pre] = o; return out;
}

if (require.main === module) {
  const out = arg('--out'), check = arg('--check');
  if (!out && !check) { console.error('쓰임: node s1-policy.js --golden <폴더> --web <폴더> --out <파일> [--check <파일>]'); process.exit(2); }
  const result = flatten(build('S1-view-policy.json'));
  if (out) { fs.writeFileSync(out, JSON.stringify(result, null, 1) + '\n'); console.log('wrote', out, Object.keys(result).length, 'keys'); }
  if (check) {
    const saved = JSON.parse(fs.readFileSync(check, 'utf8'));
    const diffs = [...new Set([...Object.keys(saved), ...Object.keys(result)])].filter(k => k !== '_source.view' && JSON.stringify(saved[k]) !== JSON.stringify(result[k]));
    for (const k of diffs.slice(0, 200)) console.log('DIFF', k, JSON.stringify(saved[k])?.slice(0, 160), '→', JSON.stringify(result[k])?.slice(0, 160));
    console.log(diffs.length ? `다름 ${diffs.length}개 키` : `같음: ${Object.keys(result).length}개 키 모두 ${check} 와 일치`);
    process.exit(diffs.length ? 1 : 0);
  }
}
