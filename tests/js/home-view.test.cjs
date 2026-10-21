'use strict';
/* HOME PoC 정책·프로그램 추진현황 계산 이식(tools/ledger/home-view.js) 시험.
   입력: tests/fixtures/home-view-1020 (PoC 2026-10-20 응답을 필요한 필드만 자른 것), 기대값: PoC 프런트 JS 를 vm 으로 돌린 golden. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const H = require('../../tools/ledger/home-view');

const FIX = path.join(__dirname, '..', 'fixtures', 'home-view-1020');
const view = require(path.join(FIX, 'policy-view.json'));
const programs = require(path.join(FIX, 'programs-view.json'));
const expected = require(path.join(FIX, 'expected.json'));

const flatten = (o, pre, out = {}) => {
  if (o && typeof o === 'object' && !Array.isArray(o)) { for (const [k, v] of Object.entries(o)) flatten(v, pre ? pre + '.' + k : k, out); return out; }
  out[pre] = o; return out;
};
const plain = (v) => JSON.parse(JSON.stringify(v));
const policy = H.policyScreen(view, { asOf: '2026-10-20', year: 2026 });
const stat = policy.statistics;

test('정책 화면: golden 의 정책 키(지표 176개 중 정책분)가 모두 같다', () => {
  const mine = flatten(plain({ ...policy, linked_projects: view.portfolio_cohorts.length }), 'policy');
  const keys = Object.keys(expected).filter((k) => k.startsWith('policy.'));
  assert.ok(keys.length > 100);
  const diffs = keys.filter((k) => JSON.stringify(mine[k]) !== JSON.stringify(expected[k]));
  assert.deepEqual(diffs, []);
});

test('단계 카드', () => {
  const c = policy.stage_cards;
  assert.deepEqual([c.BUSINESS.current, c.BUSINESS.year_end_expected], [151098, 151098]);
  assert.deepEqual([c.APPROVAL.current, c.APPROVAL.year_end_expected], [97889, 103169]);
  assert.deepEqual([c.CONSTRUCTION.current, c.CONSTRUCTION.year_end_expected], [79884, 92574]);
  assert.deepEqual([c.SUPPLY.current, c.SUPPLY.year_end_expected], [58541, 70005]);
  assert.deepEqual([c.MOVE_IN.current, c.MOVE_IN.year_end_expected], [null, 3845]);
});

test('말풍선·지도·Y축', () => {
  const s = policy.callouts.find((c) => c.stage === 'SUPPLY');
  assert.equal(s.gap, 227); assert.equal(s.rate, '0.4%'); assert.equal(s.due_date, '2026-09-30'); assert.equal(s.due_units, 58768);
  assert.equal(s.status, 'WARNING');
  const m = policy.map_supply;
  assert.deepEqual([m['경기도'].supply_reached, m['서울특별시'].supply_reached, m['인천광역시'].supply_reached], [49749, 2089, 6703]);
  assert.match(m['경기도'].delay_note, /준공 1,974호 부족 \(81\.8%\)/);
  assert.match(m['서울특별시'].delay_note, /준공 14호 부족 \(3\.5%\)/);
  assert.equal(policy.axis.y_max, 200000);
});

test('추진현황 통계', () => {
  assert.equal(stat.delay_max_latest, 1988); assert.equal(stat.warning_max_latest, 227);
  assert.equal(stat.stage_gaps_latest.length > 0, true);
  assert.equal(stat.delay_trend.length, 24); assert.equal(stat.monthly_increments.length, 24);
  assert.equal(stat.upcoming_12m.total, 17488); assert.equal(stat.upcoming_12m.projects, 30); assert.equal(stat.upcoming_12m.months.length, 12);
  assert.equal(stat.agencies.length, 7);
});

test('사업 판정·머문 단계', () => {
  const p = policy.project_status;
  assert.deepEqual([p.DELAYED.projects, p.DELAYED.units], [4, 1360]);
  assert.deepEqual([p.WARNING.projects, p.WARNING.units], [2, 541]);
  assert.deepEqual([p.NORMAL.projects, p.NORMAL.units], [169, 149370]);
  assert.deepEqual(policy.stage_exclusive, { POLICY: 173, UNKNOWN: 0, MOVE_IN: 0, SUPPLY: 58541, CONSTRUCTION: 21343, APPROVAL: 18005, BUSINESS: 53209 });
});

test('프로그램 화면: golden 과 같다', () => {
  for (const [id, { program, view: v }] of Object.entries(programs)) {
    const r = H.programScreen(v, program, { asOf: '2026-10-20', year: 2026 });
    const s = r.statistics;
    const mine = flatten(plain({
      linked_projects: r.linked_projects, linked_units: r.linked_units, stage_cards: r.stage_cards, callouts: r.callouts, regions: r.regions,
      statistics: s && { delay_max_latest: s.delay_max_latest, warning_max_latest: s.warning_max_latest, stage_gaps_latest: s.stage_gaps_latest, upcoming_total: s.upcoming_12m.total, upcoming_projects: s.upcoming_12m.projects, agencies: s.agencies.map((a) => ({ name: a.name, total: a.total, count: a.count, NORMAL: a.NORMAL, WARNING: a.WARNING, DELAYED: a.DELAYED, UNKNOWN: a.UNKNOWN })) },
    }), 'programs.' + id);
    const keys = Object.keys(expected).filter((k) => k.startsWith('programs.' + id + '.'));
    assert.ok(keys.length > 10, id);
    assert.deepEqual(keys.filter((k) => JSON.stringify(mine[k]) !== JSON.stringify(expected[k])), [], id);
  }
});

test('공공주택 건설 프로그램: 사업 39, 지연 최대 1,666', () => {
  const { program, view: v } = programs.PRG_1c5b82d3c0550e744941eb29;
  const r = H.programScreen(v, program, { asOf: '2026-10-20', year: 2026 });
  assert.equal(r.linked_projects, 39);
  assert.equal(r.statistics.delay_max_latest, 1666);
});

test('기본 함수: 판정 경계', () => {
  assert.equal(H.assessGap(100, 98).status, 'DELAYED');
  assert.equal(H.assessGap(100, 99).status, 'WARNING');
  assert.equal(H.assessGap(100, 100).status, 'NORMAL');
  assert.equal(H.assessGap(100, null).status, 'UNKNOWN');
  assert.equal(H.formatGapRate(null), '미확보');
});
