'use strict';
// 9·7 정책 단계별 목표·확인(tools/ledger/policy-progress.js): HOME 운영 화면 계산 재현.
// 고정값 = HOME 운영 API(2026-10-14 GET /poc/home/api/policy-delivery?compact=true)의 yearly_comparisons.policy.metrics.SUPPLY — 덤프 판(2026-10-13T14:02:41Z)으로 다시 계산한 값과 숫자가 같았다.
// HOME 원본(jsonl.gz)은 저장소에 없다(gitignore, Storage) — 없으면 원본으로 다시 계산하는 시험은 건너뛴다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PP = require('../../tools/ledger/policy-progress');
const H = require('../../tools/ledger/home-source');
const M = require('../../tools/ledger/monthly');
const P = require('../../tools/ledger/paths');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data/board/policy-progress.json');
const saved = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const HOME_DIR = H.latestHomeDir(P.ledgerDir('2026-10')), HAVE = !!HOME_DIR && H.homeAvailable(HOME_DIR);
const SKIP = !HAVE && 'HOME 원본(jsonl.gz) 없음 — Storage 에서 받거나 tools/ledger/home-dump.py';
const supply = saved.policies[0].stages.SUPPLY;

test('HOME 화면 공급(분양·모집) 값 재현: 목표 점·확인 점·연도 쌍이 HOME 운영 API 와 같다', () => {
  assert.equal(saved.asOf, '2026-10-13');
  assert.deepEqual(supply.targetPoints.map((p) => [p.date, p.units, p.annual_units]), [
    ['2026-02-28', 206, 206], ['2026-05-31', 1455, 1249], ['2026-06-30', 4798, 3343], ['2026-07-31', 5932, 1134], ['2026-08-31', 8374, 2442],
    ['2026-09-30', 9355, 981], ['2026-10-31', 10285, 930], ['2026-11-30', 11351, 1066], ['2026-12-31', 12408, 1057]]);
  assert.deepEqual(supply.actualPoints.map((p) => [p.date, p.units, p.confirmed_units, p.policy_confirmed_units, p.review_units]), [
    ['2025-07-31', 926, 610, 0, 316], ['2026-02-27', 1307, 610, 0, 697], ['2026-05-28', 1825, 610, 0, 1215], ['2026-05-29', 2758, 1543, 0, 1215],
    ['2026-06-26', 3734, 2519, 0, 1215], ['2026-06-30', 6040, 4825, 0, 1215], ['2026-08-10', 6634, 5419, 0, 1215], ['2026-08-31', 7297, 5419, 0, 1878],
    ['2026-09-30', 7606, 5419, 0, 2187]]);
  const y = (n) => supply.annual.find((a) => a.year === n);
  assert.deepEqual(y(2025), { year: 2025, target_units: null, target_cumulative_units: null, management_cumulative_units: null, actual_units: 926, actual_cumulative_units: 926, actual_through: '2025-07-31', actual_status: 'PARTIAL' });
  assert.deepEqual(y(2026), { year: 2026, target_units: 12408, target_cumulative_units: 12408, management_cumulative_units: null, actual_units: 6680, actual_cumulative_units: 7606, actual_through: '2026-09-30', actual_status: 'PARTIAL' });
  assert.deepEqual(supply.homeRule, { target: { date: '2026-09-30', units: 9355 }, actual: { date: '2026-09-30', units: 7606, reviewUnits: 2187, confirmedUnits: 5419 }, status: 'GAP', gap: 1749, shortfallPct: 18.7 });
});

test('같은 기간 비교(우리 기본): 2026-01~09 목표 9,355 대 확인 6,680 → 부족 2,675호 · 28.6%', () => {
  assert.equal(saved.referenceMonthEnd, '2026-09-30');
  const s = supply.samePeriod.find((y) => y.year === 2026);
  assert.deepEqual([s.from, s.through, s.target, s.actual, s.gap, s.shortfallPct, s.status], ['2026-01-01', '2026-09-30', 9355, 6680, 2675, 28.6, 'GAP']);
  assert.deepEqual(supply.monthly.find((m) => m.month === '2026-09'), { month: '2026-09', target: 9355, actual: 7606, targetYtd: 9355, actualYtd: 6680 });
});

test('다른 단계 고정값(덤프 판 = HOME 운영 API): 착공은 원문 연간 목표·지역 통계, 인허가·준공은 목표가 기준 달 뒤라 NOT_DUE, 입주는 실적 없음', () => {
  const st = saved.policies[0].stages;
  assert.deepEqual(Object.keys(st), ['CONSTRUCTION', 'SUPPLY', 'BUSINESS', 'APPROVAL', 'COMPLETION', 'MOVE_IN']);
  const y26 = (k) => st[k].samePeriod.find((y) => y.year === 2026);
  assert.deepEqual([y26('CONSTRUCTION').target, y26('CONSTRUCTION').actual, y26('CONSTRUCTION').status], [null, 86739, 'NOT_DUE']);
  assert.deepEqual([y26('APPROVAL').actual, y26('APPROVAL').status, y26('COMPLETION').actual, y26('COMPLETION').status], [1909, 'NOT_DUE', 381, 'NOT_DUE']);
  assert.deepEqual([y26('MOVE_IN').target, y26('MOVE_IN').actual, y26('MOVE_IN').status], [381, null, 'NO_ACTUAL']);
  assert.deepEqual(st.CONSTRUCTION.targetPoints.map((p) => p.units), [269000, 515000, 765000, 1014000, 1349000]);
  assert.deepEqual(st.APPROVAL.annual.find((a) => a.year === 2026), { year: 2026, target_units: 1370, target_cumulative_units: 1370, management_cumulative_units: null, actual_units: 1909, actual_cumulative_units: 12546, actual_through: '2026-06-30', actual_status: 'PARTIAL' });
  assert.deepEqual(st.COMPLETION.annual.find((a) => a.year === 2029).target_cumulative_units, 11482);
  assert.deepEqual(st.MOVE_IN.annual.find((a) => a.year === 2031).target_cumulative_units, 14478);
  const b = saved.policies[0].basis;
  assert.deepEqual([b.linkedProjects, b.duplicateExcluded, b.missingQuantity, b.prePolicyStart, b.cohorts, b.cohortUnits], [194, 57, 4, 87, 46, 54914]);
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
  assert.deepEqual(a.points.map((p) => [p.date, p.units, p.confirmed_units, p.policy_confirmed_units, p.review_units]), [['2026-02-01', 40, 40, 0, 0], ['2026-04-01', 140, 90, 50, 50]]);
  assert.equal(PP.stageEvents([c2], 'BUSINESS', '2026-10-13').points.length, 0, '상태 추정(STATE)은 실적이 아니다');
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
  assert.deepEqual(M.policyProgressArgs(P.ledgerDir('2026-10'), '2026-10'), HOME_DIR ? ['--month', '2026-10'] : null);
  assert.equal(M.policyProgressArgs(path.join(ROOT, 'tests'), '2026-10'), null);
});
