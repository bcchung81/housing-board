'use strict';
// HOME PoC(https://www.minslab.kr/poc/home/) 정책·프로그램 추진현황 화면의 프런트 계산을 그대로 옮긴 모듈.
// 식·순서·반올림·날짜 비교(문자열 비교, Date.parse)는 원본 그대로이고, render·SVG·DOM 부분은 옮기지 않았다.
// 원본: js_policy-stage-flow.js · js_policy-decision.js · js_policy-region-map.js · js_policy-907.js
// 정답 대조: .cache/home-parity/golden/S1-extract.js (같은 입력 → golden-policy.json), 시험 tests/js/home-view.test.cjs

// ---- js_policy-stage-flow.js (PolicyStageFlow) ----
const order = ['MOVE_IN', 'SUPPLY', 'CONSTRUCTION', 'APPROVAL', 'BUSINESS', 'POLICY'];

// goalSeries
function goalSeries(m, stage) {
  const c = m.comparisons?.[stage];
  return (c?.management_points?.length ? c.management_points : c?.target_points || []).slice().sort((a, b) => a.date.localeCompare(b.date));
}

// goalAt
function goalAt(m, stage, when) {
  const ps = goalSeries(m, stage); if (!ps.length) return null;
  const time = Date.parse(when), next = ps.find(p => p.date >= when), prev = ps.filter(p => p.date <= when).at(-1);
  if (prev && (!next || prev.date === next.date)) return prev.units;
  if (!next) return null;
  const left = prev || { date: next.date.slice(0, 4) + '-01-01', units: 0 };
  if (when < left.date) return null;
  const fraction = (time - Date.parse(left.date)) / Math.max(1, Date.parse(next.date) - Date.parse(left.date));
  return Math.round(left.units + (next.units - left.units) * Math.max(0, Math.min(1, fraction)));
}

// measuredAt
const measuredAt = (m, stage, when) => (m.comparisons?.[stage]?.actual_points || []).filter(p => p.date <= when && p.date <= m.asOf).slice().sort((a, b) => a.date.localeCompare(b.date)).at(-1);

// targetAt
const targetAt = (m, stage, when) => goalSeries(m, stage).filter(p => p.date <= when).at(-1)?.units ?? null;

// trackingPoints
function trackingPoints(m, sampleDates = null) {
  const dates = new Set(sampleDates || [m.start + '-01-01', m.end + '-12-31', m.asOf]);
  if (!sampleDates) for (const c of Object.values(m.comparisons || {})) for (const p of [...(c.target_points || []), ...(c.actual_points || [])]) dates.add(p.date);
  return [...dates].filter(d => d >= m.start + '-01-01' && d <= m.end + '-12-31').sort().map(date => {
    let reached = 0; const totals = { POLICY: 0, UNKNOWN: 0 }, cumulative = {};
    for (const k of order.filter(k => k !== 'POLICY')) {
      const observed = measuredAt(m, k, date); cumulative[k] = observed?.units ?? null;
      const amount = Math.max(reached, observed?.units || 0); totals[k] = amount - reached; reached = amount;
    }
    return { date, totals, cumulative, forecast: date > m.asOf };
  });
}

// monthlyPoints
function monthlyPoints(m) {
  const dates = [m.start + '-01-01', m.asOf, m.end + '-12-31'];
  for (let year = m.start; year <= m.end; year++) for (let month = 1; month <= 12; month++) dates.push(new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10));
  return trackingPoints(m, dates);
}

// referenceAxis (Y축 눈금 최대값)
function referenceAxis({ points = [], comparisons = {}, asOf, fullMax = 1 }) {
  const reference = new Date(asOf + 'T00:00:00Z');
  if (!Number.isFinite(reference.getTime())) return { max: Math.max(1, fullMax), focused: false };
  const shift = months => { const d = new Date(reference); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months); const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(reference.getUTCDate(), end)); return d.toISOString().slice(0, 10); };
  const start = shift(-3), end = shift(3), active = p => order.filter(k => k !== 'POLICY').reduce((sum, k) => sum + Math.max(0, Number(p.totals?.[k]) || 0), 0);
  const sorted = points.slice().sort((a, b) => a.date.localeCompare(b.date));
  const at = when => {
    const before = sorted.filter(p => p.date <= when).at(-1), after = sorted.find(p => p.date >= when);
    if (!before) return 0; if (!after || before.date === after.date) return active(before);
    const fraction = (Date.parse(when) - Date.parse(before.date)) / (Date.parse(after.date) - Date.parse(before.date));
    return active(before) + (active(after) - active(before)) * fraction;
  };
  const values = [at(start), at(asOf), at(end), ...sorted.filter(p => p.date >= start && p.date <= end).map(active)];
  for (const stage of order.filter(k => k !== 'POLICY')) {
    const m = { comparisons }, series = goalSeries(m, stage);
    for (const day of [start, asOf, end, ...series.filter(p => p.date >= start && p.date <= end).map(p => p.date)]) values.push(goalAt(m, stage, day) || 0);
    const observed = (comparisons[stage]?.actual_points || []).filter(p => p.date <= asOf).slice().sort((a, b) => a.date.localeCompare(b.date));
    values.push(observed.filter(p => p.date < start).at(-1)?.units || 0, ...observed.filter(p => p.date >= start && p.date <= end).map(p => p.units));
  }
  const peak = Math.max(0, ...values.filter(Number.isFinite));
  if (!peak) return { max: Math.max(1, fullMax), focused: false, start, end };
  const raw = peak * 1.12 / 4, power = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 2.5, 5, 10].map(n => n * power).find(n => n >= raw));
  return { max: Math.ceil(step) * 4, focused: true, start, end, peak };
}

// formatGapRate
function formatGapRate(rate) { return rate == null ? '미확보' : rate > 0 && rate < .05 ? '0.1% 미만' : rate < 2 && rate >= 1.95 ? '2% 미만' : rate.toFixed(1) + '%'; }

// assessGap
function assessGap(target, actual) {
  if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(actual) || actual < 0) return { status: 'UNKNOWN', label: '판정 미확보', gap: null, rate: null, color: '#8795a5', text: '#fff' };
  const gap = Math.max(0, target - actual), rate = 100 * gap / target;
  if (!gap) return { status: 'NORMAL', label: '목표 도달', gap, rate, color: '#218267', text: '#fff' };
  return gap * 100 >= target * 2 ? { status: 'DELAYED', label: '지연', gap, rate, color: '#b51f38', text: '#fff' } : { status: 'WARNING', label: '주의', gap, rate, color: '#e8ad25', text: '#503700' };
}

// comparisonStatus
function comparisonStatus(m, stage) {
  const c = m.comparisons?.[stage] || {}, targets = goalSeries(m, stage), due = targets.filter(t => t.date <= m.asOf).at(-1);
  const actual = (c.actual_points || []).filter(a => a.date <= m.asOf).slice().sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const confirmed = new Map(); for (const d of m.delays || []) if ((d.stage === 'COMPLETION' ? 'CONSTRUCTION' : d.stage) === stage) confirmed.set(d.project_id, Math.max(confirmed.get(d.project_id) || 0, d.units));
  const confirmedUnits = [...confirmed.values()].reduce((a, b) => a + b, 0);
  let status = 'NO_TARGET', assessment = assessGap(null, null);
  if (targets.length && !due) status = 'NOT_DUE';
  if (due) { assessment = assessGap(due.units, actual?.units); status = !actual ? 'NO_ACTUAL' : assessment.status === 'NORMAL' ? 'REACHED' : assessment.status; }
  return { difference: due && actual ? due.units - actual.units : null, stage, label: stage === 'MOVE_IN' ? '입주' : c.label || m.stages?.[stage] || stage, status, due, actual, gap: assessment.gap, confirmedUnits, next: targets.find(t => t.date > m.asOf), rate: assessment.rate, assessment, stale: !!(due && actual && actual.date < due.date) };
}

// summaryValues (단계 카드: 현재 누적 측정량·12월 말 예상량)
function summaryValues(m) {
  const yearEnd = String(m.year || m.asOf.slice(0, 4)) + '-12-31';
  return Object.fromEntries(Object.entries(m.stages).filter(([k]) => k !== 'POLICY').map(([k, label]) => {
    const actual = measuredAt(m, k, m.asOf), expected = goalSeries(m, k).filter(p => p.date <= yearEnd).at(-1);
    return [k, { label, as_of_date: m.asOf, measurement_date: actual?.date || null, current_units: actual?.units ?? null, year_end: yearEnd, expected_units: expected?.units ?? null, plan_date: expected?.date || null, basis: '12월 31일까지 저장된 계획 누계' }];
  }));
}

// ---- js_policy-decision.js (PolicyDecision) ----
const stages = { BUSINESS: '사업화', APPROVAL: '인허가', CONSTRUCTION: '건설', SUPPLY: '공급', COMPLETION: '준공', MOVE_IN: '입주 시작' };
const statMetrics = { APPROVAL: '인허가', CONSTRUCTION: '착공', SUPPLY: '분양·모집', COMPLETION: '준공' }; // 원본 metrics 의 키만(이름·색은 화면용)

// checks
function checks(metrics, day) { const comparisons = withTracking(metrics); return Object.keys(stages).map(stage => comparisonStatus({ comparisons, asOf: day }, stage)); }

// delayAt
function delayAt(metrics, day) { const list = checks(metrics, day), known = list.some(c => c.assessment.status !== 'UNKNOWN'); return { DELAYED: known ? Math.max(0, ...list.filter(c => c.status === 'DELAYED').map(c => c.gap)) : null, WARNING: known ? Math.max(0, ...list.filter(c => c.status === 'WARNING').map(c => c.gap)) : null, checks: list }; }

// mapDelay
function mapDelay(metrics, day) { const delayed = checks(metrics, day).filter(c => c.status === 'DELAYED'); return { delayed: delayed.length > 0, delayNote: delayed.map(c => (stages[c.stage] || c.label) + ' ' + c.gap.toLocaleString('ko-KR') + '호 부족 (' + formatGapRate(c.rate) + ')').join(' · ') }; }

// events
function events(c, s, day) { return (c.events || []).filter(e => e.stage === s && e.status !== 'DELAYED' && e.origin !== 'PLANNED' && e.event_date <= day); }

const monthKey = (day, shift = 0) => { const [y, m] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + shift, 1)).toISOString().slice(0, 7); };
const monthEnd = month => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const capacity = c => Math.max(0, Number(c.units) || 0);

// measured
function measured(c, stage, day) { const list = events(c, stage, day); return list.length ? Math.min(capacity(c), Math.max(0, ...list.map(v => v.units ?? capacity(c)))) : null; }

// statusAt (사업 하나의 판정)
function statusAt(c, day) {
  let result = { status: 'UNKNOWN', units: 0 };
  for (const stage of Object.keys(stages)) {
    const goals = (c.schedules || []).filter(s => s.stage === stage && s.due_date <= day && s.units != null);
    if (!goals.length) continue;
    const target = Math.min(capacity(c), Math.max(...goals.map(s => s.units))), actual = measured(c, stage, day), check = assessGap(target, actual), rank = { UNKNOWN: 0, NORMAL: 1, WARNING: 2, DELAYED: 3 };
    if (rank[check.status] > rank[result.status] || check.status === result.status && (check.gap || 0) > result.units) result = { status: check.status, units: check.gap || 0 };
  }
  return result;
}

// agencyName
function agencyName(value) { const v = String(value || '').trim(); if (!v || /미확|확인 필요/.test(v)) return '기관 미상'; if (/한국토지주택공사|^LH$/i.test(v)) return 'LH'; if (/경기주택도시공사|^GH$/i.test(v)) return 'GH'; if (/서울주택도시|서울주택도시개발|^SH$/i.test(v)) return 'SH'; return v; }

// statistics (월별 실적 흐름·지연 추이·향후 12개월·기관별)
function statistics(cohorts, asOf, year, comparisons) {
  const day = year && year < Number(asOf.slice(0, 4)) ? year + '-12-31' : asOf;
  const months = Array.from({ length: 24 }, (_, i) => monthKey(day, i - 23));
  const monthly = months.map(month => { const end = month === day.slice(0, 7) ? day : monthEnd(month), before = monthEnd(monthKey(month, -1)), values = {}; for (const stage of Object.keys(statMetrics)) { const known = cohorts.some(c => measured(c, stage, day) != null); values[stage] = known ? cohorts.reduce((sum, c) => sum + Math.max(0, (measured(c, stage, end) || 0) - (measured(c, stage, before) || 0)), 0) : null; } return { month, ...values }; });
  const delays = months.map(month => { const end = month === day.slice(0, 7) ? day : monthEnd(month); if (comparisons) return { month, ...delayAt(comparisons, end) }; return cohorts.reduce((r, c) => { const s = statusAt(c, end); if (s.status === 'DELAYED') r.DELAYED += s.units; if (s.status === 'WARNING') r.WARNING += s.units; return r; }, { month, DELAYED: 0, WARNING: 0 }); });
  const upcoming = Array.from({ length: 12 }, (_, i) => ({ month: monthKey(day, i), units: 0 })), projectIds = new Set(); let scheduled = 0;
  for (const c of cohorts) { let allocated = measured(c, 'SUPPLY', day) || 0; for (const s of [...(c.schedules || [])].filter(s => s.stage === 'SUPPLY' && s.units != null && s.due_date).sort((a, b) => a.due_date.localeCompare(b.due_date))) { const target = Math.min(capacity(c), s.units), increment = Math.max(0, target - allocated); allocated = Math.max(allocated, target); if (s.due_date <= day) continue; const row = upcoming.find(r => r.month === s.due_date.slice(0, 7)); if (!row) continue; scheduled++; row.units += increment; if (increment) projectIds.add(c.id); } }
  const agencies = new Map(); for (const c of cohorts) { const name = agencyName(c.developer), r = agencies.get(name) || { name, total: 0, count: 0, NORMAL: 0, WARNING: 0, DELAYED: 0, UNKNOWN: 0 }, status = statusAt(c, day); r.total += capacity(c); r.count++; r[status.status] += capacity(c); agencies.set(name, r); }
  return { day, monthly, delays, upcoming, scheduled, projects: projectIds.size, total: upcoming.reduce((s, r) => s + r.units, 0), agencies: [...agencies.values()].sort((a, b) => b.total - a.total) };
}

// ---- js_policy-region-map.js (PolicyRegionMap) ----
const cardStages = [['POLICY', '정책', '#285e66'], ['BUSINESS', '사업화', '#43968e'], ['APPROVAL', '인허가', '#8b9f53'], ['CONSTRUCTION', '건설', '#bf9c52'], ['SUPPLY', '공급', '#957b94'], ['MOVE_IN', '입주', '#647e9c']];
// stageDistribution (단계별 '머문 단계' 호수: 나중 단계부터 배정)
function stageDistribution(items, when, asOf) {
  const counts = Object.fromEntries(cardStages.map(([key]) => [key, 0])), projects = new Map(), cutoff = when < asOf ? when : asOf;
  let total = 0;
  for (const item of items) { const id = item.id ?? item; const previous = projects.get(id); projects.set(id, previous ? { ...previous, events: [...(previous.events || []), ...(item.events || [])] } : item); }
  for (const item of projects.values()) {
    const rawCapacity = Number(item.units ?? item.planned_units ?? 0), cap = Number.isFinite(rawCapacity) ? Math.max(0, rawCapacity) : 0;
    const reachedBy = Object.fromEntries(cardStages.map(([key]) => [key, 0]));
    total += cap;
    for (const event of item.events || []) {
      if (!event.event_date || event.event_date > cutoff || event.status === 'DELAYED' || event.origin === 'PLANNED') continue;
      const key = event.stage === 'COMPLETION' ? 'CONSTRUCTION' : event.stage, quantity = Number(event.units ?? cap);
      if (key in reachedBy && Number.isFinite(quantity)) reachedBy[key] = Math.max(reachedBy[key], Math.min(cap, Math.max(0, quantity)));
    }
    let assigned = 0;
    for (const [key] of cardStages.slice(1).reverse()) {
      const quantity = Math.max(0, reachedBy[key] - assigned);
      counts[key] += quantity; assigned += quantity;
    }
    counts.POLICY += cap - assigned;
  }
  return { total, counts, unit: '호' };
}

// ---- js_policy-907.js ----
// flow() 안 comparisons 생성식: {...c, ...c.tracking, management_points: []}
function withTracking(metrics) { return Object.fromEntries(Object.entries(metrics || {}).map(([k, c]) => [k, c.tracking ? { ...c, ...c.tracking, management_points: [] } : c])); }

// stateAt (when 시점의 단계별 현재 단계 물량, 미래는 일정 포함). data = 응답(as_of_date 필요)
function stateAt(data, items, when) {
  const colors = { POLICY: 1, BUSINESS: 1, APPROVAL: 1, CONSTRUCTION: 1, SUPPLY: 1, MOVE_IN: 1, UNKNOWN: 1 };
  const future = when > data.as_of_date, result = {};
  for (const key of Object.keys(colors)) result[key] = 0;
  for (const c of items) {
    const evs = c.events.filter(e => e.status !== 'DELAYED' && e.event_date <= (future ? data.as_of_date : when));
    if (future) for (const s of c.schedules) if (s.units != null && s.stage !== 'MOVE_IN' && s.due_date > data.as_of_date && s.due_date <= when) evs.push({ ...s, event_date: s.due_date, origin: 'PLANNED' });
    let supply = Math.min(c.units, Math.max(0, ...evs.filter(e => e.stage === 'SUPPLY').map(e => e.units ?? c.units)));
    const entry = Math.min(c.units, Math.max(0, ...evs.filter(e => e.stage === 'MOVE_IN' && e.origin !== 'PLANNED').map(e => e.units ?? c.units)));
    supply = Math.max(supply, entry); result.MOVE_IN += entry; result.SUPPLY += supply - entry; let assigned = supply;
    for (const k of ['CONSTRUCTION', 'APPROVAL', 'BUSINESS']) {
      const got = Math.min(c.units, Math.max(0, ...evs.filter(e => e.stage === k).map(e => e.units ?? c.units)));
      const amount = Math.max(0, got - assigned); result[k] += amount; assigned += amount;
    }
    result.UNKNOWN += c.units - assigned;
  }
  return result;
}

// reached (지도 값: 사업별 해당 단계 이후 실제 사건의 최대 호수, 사업 규모로 자름). data = 응답(as_of_date 필요)
function reached(data, items, key, when) {
  if (key === 'POLICY') return items.reduce((a, c) => a + (c.planned_units ?? 0), 0);
  const later = { BUSINESS: ['BUSINESS', 'APPROVAL', 'CONSTRUCTION', 'COMPLETION', 'SUPPLY', 'MOVE_IN'], APPROVAL: ['APPROVAL', 'CONSTRUCTION', 'COMPLETION', 'SUPPLY', 'MOVE_IN'], CONSTRUCTION: ['CONSTRUCTION', 'COMPLETION', 'SUPPLY', 'MOVE_IN'], COMPLETION: ['COMPLETION', 'MOVE_IN'], SUPPLY: ['SUPPLY', 'MOVE_IN'], MOVE_IN: ['MOVE_IN'] };
  const end = when < data.as_of_date ? when : data.as_of_date;
  return items.reduce((sum, c) => sum + Math.min(c.units, Math.max(0, ...c.events.filter(e => (later[key] || [key]).includes(e.stage) && (e.status || 'ACTUAL') === 'ACTUAL' && e.event_date <= end).map(e => e.units ?? c.units))), 0);
}

// ---- 화면 조립 (golden/S1-extract.js 의 조립 방식 그대로) ----
const plain = v => JSON.parse(JSON.stringify(v));
const YEAR = 2026;

function axisOf(data, rows, comparisons, year, { policyScope, programProfile }) {
  const dates = rows.flatMap(c => [...c.events.map(e => e.event_date), ...c.schedules.map(s => s.due_date)])
    .concat(Object.values(comparisons).flatMap(c => [...(c.target_points || []), ...(c.management_points || []), ...(c.actual_points || [])].map(p => p.date))).filter(Boolean);
  if (policyScope) dates.push(data.plan.period_start, data.plan.period_end);
  else if (programProfile) dates.push(programProfile.period_start, programProfile.period_end);
  const years = dates.filter(Boolean).map(d => Number(d.slice(0, 4))), start = years.length ? Math.min(...years) : year, end = Math.max(year, ...years);
  const points = trackingPoints({ comparisons, start, end, asOf: data.as_of_date });
  return { start, end, points };
}

function stageCards(data, comparisons, policyTarget, asOf, year) {
  const s = plain(summaryValues({ year, asOf, comparisons, stages: data.stages }));
  const out = { POLICY: { target: policyTarget } };
  for (const [k, v] of Object.entries(s)) {
    const remainder = v.current_units != null && v.expected_units != null ? v.expected_units - v.current_units : null;
    out[k] = { current: v.current_units, measured_on: v.measurement_date, year_end_expected: v.expected_units, plan_date: v.plan_date, remainder };
  }
  return out;
}

function calloutsOf(data, comparisons, asOf) {
  return ['BUSINESS', 'APPROVAL', 'CONSTRUCTION', 'SUPPLY', 'MOVE_IN'].map(k => comparisonStatus({ comparisons, asOf, stages: data.stages }, k))
    .filter(c => c.gap > 0).map(c => ({ stage: c.stage, status: c.status, gap: c.gap, rate: formatGapRate(c.rate), due_date: c.due.date, due_units: c.due.units, actual_date: c.actual?.date, actual_units: c.actual?.units }));
}

function statisticsOf(rows, metrics, asOf, year) {
  const m = plain(statistics(rows, asOf, year, metrics));
  const latest = m.delays.at(-1);
  return {
    linked_projects: rows.length,
    day: m.day,
    monthly_increments: m.monthly,
    delay_trend: m.delays.map(r => ({ month: r.month, DELAYED: r.DELAYED, WARNING: r.WARNING })),
    delay_max_latest: latest.DELAYED,
    warning_max_latest: latest.WARNING,
    stage_gaps_latest: (latest.checks || []).filter(c => c.gap > 0).map(c => ({ stage: c.stage, label: stages[c.stage], status: c.status, gap: c.gap, rate: formatGapRate(c.rate) })),
    upcoming_12m: { total: m.total, projects: m.projects, schedules: m.scheduled, last_month: m.upcoming.at(-1).month, months: m.upcoming },
    agencies: m.agencies.map(r => ({ ...r, delayed_share_pct: r.total ? Number((100 * r.DELAYED / r.total).toFixed(1)) : 0 })),
  };
}

function regionMap(data, rows, compIndex, asOf, prefix = '') {
  const out = {};
  for (const r of ['서울특별시', '경기도', '인천광역시']) {
    const cs = rows.filter(c => c.region === r);
    const delay = mapDelay(compIndex[prefix + 'region:' + r]?.metrics, asOf);
    const dist = plain(stageDistribution(cs, asOf, asOf));
    out[r] = { supply_reached: reached(data, cs, 'SUPPLY', asOf), projects: cs.length, planned_units: cs.reduce((a, c) => a + (c.planned_units ?? 0), 0), delayed: delay.delayed, delay_note: delay.delayNote, stage_distribution: dist.counts, stage_total: dist.total };
    for (const k of ['BUSINESS', 'APPROVAL', 'CONSTRUCTION']) out[r][k.toLowerCase() + '_reached'] = reached(data, cs, k, asOf);
  }
  return out;
}

// 정책 화면. view = /policy-delivery/view 응답(portfolio_cohorts·portfolio_comparisons·stages·as_of_date·target_units·plan)
function policyScreen(view, { asOf, year } = {}) {
  asOf = asOf || view.as_of_date; year = year || YEAR;
  const data = asOf === view.as_of_date ? view : { ...view, as_of_date: asOf };
  const rows = data.portfolio_cohorts, metrics = data.portfolio_comparisons.policy.metrics, comparisons = withTracking(metrics);
  const { start, end, points } = axisOf(data, rows, comparisons, year, { policyScope: true });
  const axis = referenceAxis({ points, comparisons, asOf, fullMax: data.target_units });
  return {
    stage_cards: stageCards(data, comparisons, data.target_units, asOf, year),
    axis: { start_year: start, end_year: end, y_max: axis.max, focused: axis.focused, full_max: data.target_units },
    callouts: calloutsOf(data, comparisons, asOf),
    map_supply: regionMap(data, rows, data.portfolio_comparisons, asOf),
    statistics: statisticsOf(rows, metrics, asOf, year),
    project_status: rows.reduce((r, c) => { const s = statusAt(c, asOf).status; r[s] = r[s] || { projects: 0, units: 0 }; r[s].projects++; r[s].units += c.units; return r; }, {}),
    stage_exclusive: (() => { const p = trackingPoints({ comparisons, start: year, end: year, asOf }, [asOf])[0]; return { ...p.totals, POLICY: rows.reduce((s, c) => s + c.units, 0) - Object.values(p.totals).reduce((a, b) => a + b, 0) }; })(),
  };
}

// 프로그램 화면. view = /policy-delivery/view?...program 응답, program = {id, profile}
function programScreen(view, program, { asOf, year } = {}) {
  asOf = asOf || view.as_of_date; year = year || YEAR;
  const data = asOf === view.as_of_date ? view : { ...view, as_of_date: asOf };
  const id = program.id, key = 'program:' + id;
  const rows = (data.portfolio_cohorts || data.cohorts || []).filter(c => c.program_id === id);
  const metrics = data.portfolio_comparisons?.[key]?.metrics || {}, comparisons = withTracking(metrics);
  const profile = program.profile || null;
  const has = Object.keys(metrics).length > 0;
  const st = rows.length ? statisticsOf(rows, metrics, asOf, year) : null;
  return {
    linked_projects: rows.length, linked_units: rows.reduce((s, c) => s + c.units, 0),
    stage_cards: has ? stageCards(data, comparisons, profile?.target_units ?? null, asOf, year) : null,
    callouts: has ? calloutsOf(data, comparisons, asOf) : [],
    regions: [...new Set(rows.map(c => c.region))],
    statistics: st,
  };
}

module.exports = {
  assessGap, formatGapRate, comparisonStatus, summaryValues, trackingPoints, monthlyPoints, referenceAxis,
  goalSeries, goalAt, targetAt, measuredAt, delayAt, mapDelay, statusAt, agencyName, statistics,
  stageDistribution, reached, stateAt, withTracking, policyScreen, programScreen, capacity, measured,
};
