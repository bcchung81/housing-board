'use strict';
// 9·7 정책 단계별 목표·확인(tools/ledger/policy-progress.js): HOME 운영 화면 계산 재현.
// 고정값 = HOME 운영 API(2026-10-14 20:45 KST GET /poc/home/api/policy-delivery?compact=true)의 yearly_comparisons.policy.metrics — 덤프 판(2026-10-14T10:25:06Z)으로 다시 계산한 6단계 목표·확인 점과 숫자가 같았다.
// 2026-10-14 판부터 담당자 입력(계획물량·단계 측정값·승인 일정)이 들어와 공급 목표·확인이 바뀌었다(2026-10-13 판: 목표 9,355 · 확인 7,606 · 같은 기간 확인 6,680).
// 2026-10-20 판(20261019T212247Z, 담당자 일정 execution_schedule 1,800건): HOME 운영 API(2026-10-20 09:30 KST GET, as_of 2026-10-20)와 6단계 목표·확인 점·연도 쌍이 모두 같았다.
//   공급(분양·모집) 2026 값은 10-14 판과 같고(8,049 대 8,742), 연결 사업 197→228 로 사업화·인허가·준공·입주 목표와 2031년 공급 목표 끝점이 늘었다.
// 2026-10-21 HOME 2038810 이식: 6단계 목표·확인 점·연도 쌍은 그대로였고(코호트가 바뀐 광교 A17 은 기간 안 점이 없다), basis 의 연결 사업·코호트 수만 바뀌었다.
//   PoC(as_of 10-20) 공급 2026 연간 목표 10,684 대 우리 10,676 의 8호 = 덤프 뒤 매핑된 연남동 공공임대주택 코호트(8호) — 덤프로는 맞출 수 없다.
// 2026-10-21 새 덤프(20261020T142230Z, 2026-10-20 23:22 KST, HOME 2038810): 덤프 뒤였던 담당자 입력·매핑(독산동·방화차고지·연남동)이 판에 들어와 PoC(as_of 10-20, 2026-10-21 11:27 KST 받은 /policy-delivery/view)와
//   6단계 목표·확인 점이 모두 같다. 연남동 공공임대주택(PRO_b8e9b07eb43ee60a807ec231) 근거 연결 사실(SH 2025-11 업무보고, reference_only — '당시 계획')의 2026-10 준공 8호는
//   2026-10-21 W5 사용자 결정 'HOME 기준'으로 일정에서 뺀다(policy-progress.js — 덤프의 reference_only PLAN 3건이 모두 PoC 에 없고 HOME project_profile.target_default 도 거른다.
//   2038810 policy_delivery 에는 없는 처리) → 준공 목표 누적도 PoC 와 같다.
// HOME 원본(jsonl.gz)은 저장소에 없다(gitignore, Storage) — 없으면 원본으로 다시 계산하는 시험은 건너뛴다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PP = require('../../tools/ledger/policy-progress');
const H = require('../../tools/ledger/home-source');
const M = require('../../tools/ledger/monthly');
const P = require('../../tools/ledger/paths');
const E = require('./home-era.cjs');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data/board/policy-progress.json');
const saved = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const MONTH = P.latestMonth();   // 판 무관(2026-11-10): 생성기(policy-progress.js 기본 --month)와 같은 가장 늦은 달
const HOME_DIR = H.latestHomeDir(P.ledgerDir(MONTH)), HAVE = !!HOME_DIR && H.homeAvailable(HOME_DIR);
const SKIP = !HAVE && 'HOME 원본(jsonl.gz) 없음 — Storage 에서 받거나 tools/ledger/home-dump.py';
const supply = saved.policies[0].stages.SUPPLY;

test('HOME 화면 공급(분양·모집) 값 재현: 목표 점·확인 점·연도 쌍이 HOME 운영 API 와 같다', () => {
  /* 판 숫자(기준일 2026-10-22 · 목표 점 9개 · 확인 점 10개 · 연도 쌍 · homeRule 8,833 대 6,544) 대신:
     기준일 = 덤프 시각(snapshot_at)의 한국 날짜, homeRule = 기준일까지 마지막 목표 점 대 마지막 확인 점(같은 파일 점에서 다시 셈), 점·연도 쌍 = HOME 정책 화면 응답(판이 같을 때) */
  assert.equal(saved.asOf, new Date(Date.parse(E.snapshotAt) + 9 * 3600e3).toISOString().slice(0, 10));
  const last = (pts) => pts.filter((p) => p.date <= saved.asOf).at(-1) ?? null;
  const t = last(supply.targetPoints), a = last(supply.actualPoints);
  assert.ok(t && a, '기준일까지 목표·확인 점이 있다');
  const gap = Math.max(0, t.units - a.units);
  assert.deepEqual(supply.homeRule, { target: { date: t.date, units: t.units }, actual: { date: a.date, units: a.units, reviewUnits: a.review_units, confirmedUnits: a.confirmed_units }, status: gap > 0 ? 'GAP' : 'REACHED', gap, shortfallPct: Math.round(gap / t.units * 1000) / 10 });
  assert.ok(supply.targetPoints.every((p, k) => p.annual_units === p.units - (k && supply.targetPoints[k - 1].date.slice(0, 4) === p.date.slice(0, 4) ? supply.targetPoints[k - 1].units : supply.targetPoints.filter((q) => q.date.slice(0, 4) < p.date.slice(0, 4)).at(-1)?.units ?? 0)), '연도 안 증가분 = 누적 차');
  const view = E.golden('S1-view-policy.json').doc;
  if (!view) return;
  assert.equal(saved.asOf, view.as_of_date);
  const m = view.yearly_comparisons.policy.metrics.SUPPLY;
  assert.deepEqual(supply.targetPoints.map((p) => [p.date, p.units, p.annual_units]), m.target_points.map((p) => [p.date, p.units, p.annual_units]));
  assert.deepEqual(supply.actualPoints.map((p) => [p.date, p.units, p.confirmed_units, p.policy_confirmed_units, p.review_units]), m.actual_points.map((p) => [p.date, p.units, p.confirmed_units, p.policy_confirmed_units, p.review_units]), '담당자 측정값이 확인 필요 연결을 대신한다');
  assert.deepEqual(supply.annual, m.annual);
});

test('같은 기간 비교(우리 기본): 올해 1월~기준 달 앞 달 말 목표 대 확인(추정 포함 따로) → 부족·부족률 — 확인과 담당자 추정을 섞지 않는다', () => {
  /* 판 숫자(2026-09-30 · 8,833 · 6,544 · 6,544 · 2,289 · 25.9 · 월말 2026-09) 대신: 기간 = 기준일 앞 달 말까지, 값 = 같은 파일 점에서 다시 센 기간 증가분·HOME 정답(판이 같을 때) */
  const prevEnd = new Date(Date.UTC(+saved.asOf.slice(0, 4), +saved.asOf.slice(5, 7) - 1, 0)).toISOString().slice(0, 10);
  assert.equal(saved.referenceMonthEnd, prevEnd);
  const year = +prevEnd.slice(0, 4), from = `${year}-01-01`;
  const s = supply.samePeriod.find((y) => y.year === year);
  const at = (pts, d) => pts.filter((p) => p.date <= d).at(-1)?.units ?? 0, before = (pts) => pts.filter((p) => p.date < from).at(-1)?.units ?? 0;
  const target = at(supply.targetPoints, prevEnd) - before(supply.targetPoints), withEst = at(supply.actualPoints, prevEnd) - before(supply.actualPoints);
  assert.deepEqual([s.from, s.through, s.target, s.actualWithEstimates], [from, prevEnd, target, withEst]);
  assert.ok(s.actual <= s.actualWithEstimates);
  const gap = Math.max(0, s.target - s.actual);
  assert.deepEqual([s.gap, s.shortfallPct, s.status], [gap, Math.round(gap / s.target * 1000) / 10, gap > 0 ? 'GAP' : 'REACHED']);
  /* HOME 화면 규칙(homeRule — 그 날까지 마지막 확인 점)을 기간 끝(기준 달 앞 달 말)에 대면 같다. 저장된 homeRule 은 기준일까지라 기준일 달 확인 점(11-10 판 11-06 7,575)이 있으면 다르다 */
  assert.equal(s.actualWithEstimates, PP.homeRule(supply.targetPoints, supply.actualPoints, prevEnd).actual.units - before(supply.actualPoints), '추정 포함 = HOME 화면 확인 누적(올해 1월 전 확인 뺌)');
  const ym = prevEnd.slice(0, 7);
  assert.deepEqual(supply.monthly.find((x) => x.month === ym), { month: ym, target: at(supply.targetPoints, prevEnd), actual: at(supply.actualPoints, prevEnd), targetYtd: target, actualYtd: withEst }, '월말 시계열은 HOME 점과 같다(추정 포함)');
  const view = E.golden('S1-view-policy.json').doc;
  if (view) assert.deepEqual(E.homePeriod(view, 'SUPPLY', s.from, s.through), { target: s.target, actual: s.actualWithEstimates });
});

test('추정 분리: 공급 측정값 중 담당자 추정(OFFICER_CURRENT_ESTIMATE · 2026-10-22 22:35 판부터 SEQUENCE_VALIDATED_TARGET_ESTIMATE·REVIEWED_MANAGEMENT_ESTIMATE) · 확인 ≤ 추정 포함, 추정 입력이 없는 단계(착공 통계·준공)는 같다', { skip: SKIP }, () => {
  const svc = PP.homeService(H.readHome(HOME_DIR), saved.asOf);
  const sup = [...svc.profiles.values()].map((p) => p.progress?.SUPPLY).filter(Boolean);
  /* 판 숫자([81, 13]) 대신: HOME 원본 project_profile 에서 따로 센 공급 측정값 수·추정 규칙 수(homeService 가 빠뜨리거나 더하지 않는다) */
  const raw = H.readHome(HOME_DIR).kinds.project_profile.map((r) => r.payload?.progress?.SUPPLY).filter(Boolean);
  assert.ok(raw.length > 0);
  assert.deepEqual([sup.length, sup.filter((v) => PP.ESTIMATE_RULES.has(v.input_rule)).length], [raw.length, raw.filter((v) => PP.ESTIMATE_RULES.has(v.input_rule)).length]);
  const b = PP.buildCohorts(svc, saved.asOf, PP.POLICY_ID);
  const est = b.cohorts.flatMap((c) => c.events).filter((e) => e.estimate);
  assert.ok(est.length > 0 && est.every((e) => e.origin === 'MANUAL'), '추정 표지는 담당자 측정값에만');
});

test('추정 분리는 모든 단계·연도에서 확인 ≤ 추정 포함이고, 다르면 gap·status 는 확인 기준이다', () => {
  for (const [k, st] of Object.entries(saved.policies[0].stages)) for (const y of st.samePeriod) {
    assert.ok('actualWithEstimates' in y, `${k} ${y.year}`);
    if (y.actual != null) assert.ok(y.actualWithEstimates >= y.actual, `${k} ${y.year}`);
    if (y.target != null && y.actual != null) assert.equal(y.gap, Math.max(0, y.target - y.actual), `${k} ${y.year}`);
  }
  const y26 = (k) => saved.policies[0].stages[k].samePeriod.find((y) => y.year === 2026);
  assert.deepEqual(['CONSTRUCTION', 'COMPLETION'].map((k) => y26(k).actual === y26(k).actualWithEstimates), [true, true]);
  assert.ok(saved.notes.some((n) => n.includes('actualWithEstimates')));
  /* 순수 함수: withEstimates 를 주면 칸을 덧붙이고, 비교는 확인 점으로만 */
  const t = [{ date: '2026-09-30', units: 100 }], a = [{ date: '2026-03-31', units: 40 }], w = [{ date: '2026-03-31', units: 40 }, { date: '2026-08-31', units: 120 }];
  const [r] = PP.samePeriod(t, a, '2026-09-30', 2026, w);
  assert.deepEqual([r.actual, r.actualWithEstimates, r.gap, r.status], [40, 120, 60, 'GAP']);
  assert.equal('actualWithEstimates' in PP.samePeriod(t, a, '2026-09-30', 2026)[0], false);
});

test('다른 단계(덤프 판 = HOME 운영 API): 착공은 원문 연간 목표·지역 통계, 사업화·인허가·준공은 승인 일정이 목표, 입주는 실적 없음 — 같은 기간 목표·추정 포함·연도 쌍·코호트 기준이 HOME 정책 화면 응답과 같다', () => {
  const st = saved.policies[0].stages;
  assert.deepEqual(Object.keys(st), ['CONSTRUCTION', 'SUPPLY', 'BUSINESS', 'APPROVAL', 'COMPLETION', 'MOVE_IN']);
  const y26 = (k) => st[k].samePeriod.find((y) => y.year === 2026);
  /* 판과 무관한 규칙: 착공 목표 = 9·7 원문 연도별 착공 목표(연말 점, 판이 바뀌어도 같다) — 같은 기간(1~9월) 목표가 없어 NOT_DUE */
  assert.deepEqual(st.CONSTRUCTION.targetPoints.map((p) => p.units), [269000, 515000, 765000, 1014000, 1349000]);
  assert.deepEqual([y26('CONSTRUCTION').target, y26('CONSTRUCTION').status], [null, 'NOT_DUE']);
  assert.equal(y26('CONSTRUCTION').actual, y26('CONSTRUCTION').actualWithEstimates, '착공(지역 통계)은 추정 입력이 없다');
  /* 판 숫자(사업화 13,914·14,515 · 인허가 8,386·5,660 · 준공 측정 없음 · 입주 NOT_DUE) 대신 규칙: 상태 = 목표 없음 → NOT_DUE(뒤에 목표 점이 있을 때) · 확인 없음 → NO_ACTUAL · 부족 → GAP · 아니면 REACHED, 확인 ≤ 추정 포함 */
  for (const k of Object.keys(st)) {
    const y = y26(k), later = st[k].targetPoints.some((p) => p.date > y.through);
    const want = y.target == null ? (later ? 'NOT_DUE' : 'NO_TARGET') : y.actual == null ? 'NO_ACTUAL' : y.actual < y.target ? 'GAP' : 'REACHED';
    assert.equal(y.status, want, k);
    if (y.actual != null) assert.ok(y.actualWithEstimates >= y.actual, k);
  }
  /* 판 숫자 대신 HOME 정책 화면 응답(/policy-delivery/view yearly_comparisons·코호트 — 판이 같을 때): 같은 기간 목표·추정 포함 확인, 연도 쌍 전부, 코호트 기준 수 */
  const view = E.golden('S1-view-policy.json').doc;
  if (!view) return;
  const m = view.yearly_comparisons.policy.metrics;
  for (const k of Object.keys(st)) {
    const y = y26(k);
    assert.deepEqual(E.homePeriod(view, k, y.from, y.through), { target: y.target, actual: y.actualWithEstimates ?? y.actual }, k);
    /* 착공의 management_cumulative_units 는 HOME 이 목표 누적을 싣고 우리는 비운다(10-22 오전 판부터 같은 차이 — 보고에 적음) */
    const strip = (a) => (k === 'CONSTRUCTION' ? a.map(({ management_cumulative_units: _, ...x }) => x) : a);
    assert.deepEqual(strip(st[k].annual), strip(m[k].annual), `${k} 연도 쌍`);
  }
  const b = saved.policies[0].basis;
  assert.deepEqual([b.linkedProjects, b.duplicateExcluded, b.missingQuantity, b.prePolicyStart, b.cohorts, b.cohortUnits, b.portfolio],
    [view.management_projects.length, view.excluded_source_ids.length, view.missing_quantity_ids.length, view.historical.length, view.cohorts.length, view.cohorts.reduce((n, c) => n + c.units, 0), view.portfolio_cohorts.length]);
});

test('HOME 원본으로 다시 계산: 저장된 파일과 바이트 같고, 같은 판 두 번도 같다', { skip: SKIP }, () => {
  const a = PP.render(PP.policyProgress(H.readHome(HOME_DIR))), b = PP.render(PP.policyProgress(H.readHome(HOME_DIR)));
  assert.equal(a, b);
  assert.equal(a, fs.readFileSync(OUT, 'utf8'));
});

test('일정 글 → 기간(HOME schedule_period): 달·날짜·분기·반기·월 범위·연, 미정은 없음', () => {
  const f = (v) => { const p = PP.schedulePeriod(v); return p && [p.due_date, p.precision, p.conversion]; };
  assert.deepEqual(f('2026-06'), ['2026-06-30', 'MONTH', 'MONTH_END']);
  assert.deepEqual(f('2026.6.15'), ['2026-06-15', 'DAY', 'EXACT']);
  assert.deepEqual(f('2028년 09월'), ['2028-09-30', 'MONTH', 'MONTH_END']);
  assert.deepEqual(f("'27년 3분기"), ['2027-09-30', 'QUARTER', 'PERIOD_END']);
  assert.deepEqual(f('2027년 하반기 예정'), ['2027-12-31', 'HALF_YEAR', 'PERIOD_END']);
  assert.deepEqual(f('2026년 5~6월'), ['2026-06-30', 'MONTH_RANGE', 'PERIOD_END']);
  assert.deepEqual(f('2029~2030년'), ['2030-12-31', 'YEAR_RANGE', 'PERIOD_END']);
  assert.deepEqual(f(2026), ['2026-12-31', 'YEAR', 'PERIOD_END']);
  for (const v of ['미정', '2026년 이후', '2026-13', '2026-02-30', '', null, '3분기']) assert.equal(PP.schedulePeriod(v), null, String(v));
});

test('지구·블록 중복 제외(HOME inventory): 같은 블록 LH 공급계획 하나만 남고, 계획 없는 여러 원천·복합 계약은 뺀다', () => {
  const r = (id, source_id, name, extra = {}) => ({ id, source_id, name, region: '경기도', planned_units: null, warnings: [], ...extra });
  assert.deepEqual(PP.blockKey(r('x', 'lh_sale', '고양창릉 S-03(공공분양)', { block: 'S-03' })), ['경기도', '고양창릉', 'S3']);
  assert.equal(PP.blockKey(r('x', 'policy_907', '고양창릉 S-03')), null, 'LH 원천이 아니면 지구 키 없음');
  const { chosen, excluded } = PP.inventory([
    r('a', 'lh_sale', '고양창릉 S-03', { block: 'S-03' }), r('b', 'lh_construction', '고양창릉 S3BL 건설공사', { district: '고양창릉', block: 'S3', planned_units: 1282 }),
    r('c', 'lh_construction', '남양주왕숙 A-1', { district: '남양주왕숙', block: 'A1' }), r('d', 'lh_progress', '남양주왕숙 A-1', { district: '남양주왕숙', block: 'A-1' }),
    r('e', 'lh_construction', '이름만'), r('f', 'policy_907', '복합', { warnings: ['MULTI_SITE_CONTRACT'] })]);
  assert.deepEqual(chosen.map((c) => [c.id, c.planned_units]), [['a', 1282]], '계획물량은 같은 블록 원천의 하나뿐인 값');
  assert.deepEqual(excluded.sort(), ['b', 'c', 'd', 'e', 'f']);
});

test('목표·확인 점(HOME _schedule_targets·_events): 가장 늦은 원천 하나·사업 물량 상한, 사업별 최대 도달량 누적과 확인 필요 분리', () => {
  const c1 = { id: 'p1', units: 100, mapping_status: 'REVIEW', schedules: [
    { stage: 'SUPPLY', origin: 'SOURCE', due_date: '2026-03-31', units: 80, source_base_date: '2026-01-01', source_object_id: 'old' },
    { stage: 'SUPPLY', origin: 'SOURCE', due_date: '2026-05-31', units: 70, source_base_date: '2026-07-01', source_object_id: 'new' },
    { stage: 'SUPPLY', origin: 'SOURCE', due_date: '2026-06-30', units: 70, source_base_date: '2026-07-01', source_object_id: 'new' },
    { stage: 'SUPPLY', origin: 'SOURCE', due_date: '2025-12-31', units: 10, source_base_date: '2026-09-01', source_object_id: 'before' }],
  events: [{ stage: 'SUPPLY', event_date: '2026-02-01', units: 40 }, { stage: 'SUPPLY', event_date: '2026-04-01', units: 90, review_status: 'REVIEW' }, { stage: 'SUPPLY', event_date: '2026-11-01', units: 100 }] };
  const c2 = { id: 'p2', units: 50, mapping_status: 'CONFIRMED', schedules: [], events: [{ stage: 'SUPPLY', event_date: '2026-04-01', units: null }, { stage: 'BUSINESS', event_date: '2026-01-01', status: 'STATE' }] };
  const t = PP.scheduleTargets([c1, c2], 'SUPPLY', '2026-01-01');
  assert.deepEqual(t.points.map((p) => [p.date, p.units]), [['2026-05-31', 70], ['2026-06-30', 100]]);
  const a = PP.stageEvents([c1, c2], 'SUPPLY', '2026-10-13');
  /* 2026-10-22 22:35 판: 호수 없는 사건(c2 공급 units null)은 세지 않는다(옛 판은 사업 물량 50 — 140·90·50·50). HOME 응답 yearly·portfolio 점이 이 규칙으로 같다(사업화 신림2·흑석11 정비 근거) */
  assert.deepEqual(a.points.map((p) => [p.date, p.units, p.confirmed_units, p.policy_confirmed_units, p.review_units]), [['2026-02-01', 40, 40, 0, 0], ['2026-04-01', 90, 40, 0, 50]]);
  assert.equal(PP.stageEvents([c2], 'BUSINESS', '2026-10-13').points.length, 0, '상태 추정(STATE)은 실적이 아니다');
});

test('승인 일정(managed_schedule)이 있으면 그 묶음의 목표 점은 승인 일정만 쓴다(HOME _schedule_targets)', () => {
  const c = { id: 'p', units: 100, schedules: [
    { stage: 'SUPPLY', origin: 'SOURCE', due_date: '2026-03-31', units: 100, source_base_date: '2026-01-01', source_object_id: 'src' },
    { stage: 'SUPPLY', origin: 'MANUAL', managed_schedule: true, due_date: '2026-08-31', units: 60 },
    { stage: 'SUPPLY', origin: 'MANUAL', managed_schedule: true, due_date: '2026-08-31', units: 60 },
    { stage: 'SUPPLY', origin: 'MANUAL', managed_schedule: true, due_date: '2027-02-28', units: 70 }], events: [] };
  assert.deepEqual(PP.scheduleTargets([c], 'SUPPLY', '2026-01-01').points.map((p) => [p.date, p.units]), [['2026-08-31', 60], ['2027-02-28', 100]], '같은 (날짜·호수)는 한 번, 사업 물량 상한');
  assert.deepEqual(PP.scheduleTargets([{ ...c, schedules: c.schedules.slice(0, 1) }], 'SUPPLY', '2026-01-01').points.map((p) => [p.date, p.units]), [['2026-03-31', 100]]);
});

test('HOME 방식 대 같은 기간: 확인 누적이 앞 해부터 쌓여 있으면 HOME 방식 부족률이 작게 나온다', () => {
  const targets = [{ date: '2026-09-30', units: 9355 }, { date: '2026-12-31', units: 12408 }];
  const actual = [{ date: '2025-07-31', units: 926, review_units: 316 }, { date: '2026-09-30', units: 7606, review_units: 2187 }];
  assert.deepEqual([PP.homeRule(targets, actual, '2026-10-13').gap, PP.homeRule(targets, actual, '2026-10-13').shortfallPct], [1749, 18.7]);
  const s = PP.samePeriod(targets, actual, '2026-09-30', 2025);
  assert.deepEqual(s.map((y) => [y.year, y.target, y.actual, y.gap, y.shortfallPct, y.status]), [[2025, null, 926, null, null, 'NOT_DUE'], [2026, 9355, 6680, 2675, 28.6, 'GAP']]);
  assert.equal(PP.homeRule([{ date: '2026-12-31', units: 1 }], actual, '2026-10-13').status, 'NOT_DUE');
  assert.equal(PP.asOfOf('2026-10-13T14:02:41.323977+00:00'), '2026-10-13');
  assert.equal(PP.asOfOf('2026-10-13T15:00:00+00:00'), '2026-10-14', '한국 날짜');
});

test('월 갱신: 그 달 폴더에 HOME 판이 있으면 보드 다음에 policy-progress.js --month 를 돈다', () => {
  assert.deepEqual(M.policyProgressArgs(P.ledgerDir(MONTH), MONTH), HOME_DIR ? ['--month', MONTH] : null);
  assert.equal(M.policyProgressArgs(path.join(ROOT, 'tests'), '2026-10'), null);
});
