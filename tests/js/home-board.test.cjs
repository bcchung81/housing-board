'use strict';
/* 종합상황판 HOME 집계(tools/ledger/home-board.js): HOME 응답(2026-10-20, tests/fixtures/home-view-1020)을 넣으면 HOME 정책 추진현황 화면과 같은 숫자를 Board 모양으로 낸다.
   정답 값은 HOME 프런트 JS 를 같은 응답에 돌린 값(.cache/home-parity/golden/golden-policy.json — 2026-10-21 S1 명세). */
const test = require('node:test');
const E = require('./home-era.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const { homeBoard, STAGE_NAMES } = require('../../tools/ledger/home-board');

const view = require(path.join(__dirname, '..', 'fixtures', 'home-view-1020', 'policy-view.json'));
const b = homeBoard(view);

test('시점: 2025-01 부터 46개월, 기준 달 2026-10, 단계 이름은 HOME 단계', () => {
  assert.equal(b.months.length, 46);
  assert.deepEqual([b.months[0], b.months[b.now], b.referenceDate], ['2025-01', '2026-10', '2026-10-20']);
  assert.deepEqual(STAGE_NAMES, ['정책', '사업화', '인허가', '건설', '공급', '입주']);
});

test('리본 기준 달 = HOME 머문 단계(정책 잔여 173 · 사업화 53,209 · 인허가 18,005 · 건설 21,343 · 공급 58,541 · 입주 0), 합 = 연결 사업 175개 151,271호', () => {
  assert.deepEqual(b.stageUnits[b.now], [173, 53209, 18005, 21343, 58541, 0]);
  assert.deepEqual([b.scope.projects, b.scope.units], [175, 151271]);
  for (const row of b.stageUnits) assert.equal(row.reduce((a, c) => a + c, 0), 151271, '같은 사업이 단계만 옮겨 총량은 매달 같다');
});

test('단계 카드: 현재 누적 측정량·12월 말 예상량(HOME 카드 값)', () => {
  const c = b.home.cards;
  assert.deepEqual([c.BUSINESS.current, c.BUSINESS.year_end_expected], [151098, 153304]);   // 12월 말 예상 = 22:35 판 머문 단계 계산(home-view projectedValue — 옛 판 151,098)
  assert.deepEqual([c.APPROVAL.current, c.APPROVAL.year_end_expected], [97889, 105375]);
  assert.deepEqual([c.CONSTRUCTION.current, c.CONSTRUCTION.year_end_expected], [79884, 94780]);
  assert.deepEqual([c.SUPPLY.current, c.SUPPLY.year_end_expected], [58541, 70005]);
  assert.deepEqual([c.MOVE_IN.current, c.MOVE_IN.year_end_expected], [null, 3845]);
});

test('판정: 사업 판정(지연 4·1,360 / 주의 2·541 / 도달 169·149,370), 단계 지연 = 준공 1,988(건설 칸) · 주의 = 공급 227', () => {
  assert.deepEqual(b.judgment.delay, { projects: 4, units: 1360 });
  assert.deepEqual(b.judgment.caution, { projects: 2, units: 541 });
  assert.deepEqual(b.judgment.ok, { projects: 169, units: 149370 });
  assert.deepEqual(b.delayByStage, [0, 0, 0, 1988, 0, 0]);
  assert.deepEqual(b.cautionByStage, [0, 0, 0, 0, 227, 0]);
  assert.deepEqual([b.home.delayMax, b.home.warningMax], [1988, 227]);
  assert.deepEqual(b.home.bottleneck, { stage: 'COMPLETION', label: '준공', status: 'DELAYED', gap: 1988, rate: '36.2%' });
});

test('지연·주의 추이: 달 말 집계 판정의 최대 부족량(HOME 24개월 중 2025-01~2026-10)', () => {
  const tr = Object.fromEntries(b.trend.map((t) => [t.month, [t.max.d, t.max.w]]));
  assert.equal(b.trend.length, 22);
  assert.deepEqual([tr['2025-01'], tr['2025-03'], tr['2026-06'], tr['2026-08'], tr['2026-09'], tr['2026-10']], [[33903, 0], [30184, 367], [1163, 2822], [1882, 965], [1882, 0], [1988, 227]]);
});

test('향후 12개월 공급 예정 17,488호 · 30개 사업(월별 12칸), 기관별 7줄(원천 글자, LH·GH·SH 만 묶음)', () => {
  assert.deepEqual(b.upcoming.map((u) => u.units), [3533, 5473, 1881, 795, 0, 0, 0, 0, 1063, 4143, 0, 600]);
  assert.deepEqual([b.home.supplyUpcoming.total, b.home.supplyUpcoming.projects], [17488, 30]);
  assert.deepEqual(b.agencies.map((a) => [a.name, a.units, a.projects, a.okUnits, a.cautionUnits, a.delayUnits, a.delayedSharePct]), [
    ['LH', 93648, 142, 91747, 541, 1360, 1.5], ['기관 미상', 40549, 14, 40549, 0, 0, 0], ['인천도시공사', 6629, 7, 6629, 0, 0, 0], ['SH', 3488, 7, 3488, 0, 0, 0],
    ['4)공공(LH,SH,GH)', 3178, 1, 3178, 0, 0, 0], ['1)조합', 2945, 2, 2945, 0, 0, 0], ['GH', 834, 2, 834, 0, 0, 0]]);
});

test('시도: 사업 판정 호수와 HOME 시도 집계 지연 문구, 월별 실적 흐름 24개월', () => {
  const r = Object.fromEntries(b.regions.map((x) => [x.name, [x.projects, x.delayUnits, x.cautionUnits, x.okUnits, x.homeDelay, x.supplyReached]]));
  assert.deepEqual(r['서울특별시'], [27, 1133, 0, 46482, '준공 14호 부족 (3.5%)', 2089]);
  assert.deepEqual(r['경기도'], [119, 227, 541, 82637, '준공 1,974호 부족 (81.8%)', 49749]);
  assert.deepEqual(r['인천광역시'], [29, 0, 0, 20251, null, 6703]);
  assert.equal(b.home.monthly.length, 24);
  assert.deepEqual(b.home.monthly.at(-1), { month: '2026-10', APPROVAL: 0, CONSTRUCTION: 0, SUPPLY: 1655, COMPLETION: 0 });
});

/* 2026-10-21 W3-H: 덤프로 만든 '/' 자료(data/board/home-board.json)는 home-projects.json views.p97 과 같은 원천 행 집합(덤프 우선 + 덤프 뒤 신규 행만 PoC 스냅샷)을 쓴다 */
test("'/' 자료 = home-projects views.p97·region-calendar home.p97: 연결 177곳 · 카드 도달 · 판정 · 12개월 공급(월별) · 시도 · 기관", () => {
  const HB = require('../../data/board/home-board.json'), HP = require('../../data/board/home-projects.json'), RC = require('../../data/board/region-calendar.json');
  const v = HP.views.p97, rc = RC.home.p97, rs = HP.rows.filter((r) => r.stats && r.p97 && r.chart.p97);
  assert.deepEqual([HB.scope.projects, HB.scope.units], [v.chart, v.units]);
  /* 판 숫자([177, 153575, 16916, 30]) 대신: 원천 행에서 다시 센 연결 사업·집계 호수, HOME 정책 화면 정답(판이 같을 때)의 연결 사업·12개월 공급 */
  assert.deepEqual([HB.scope.projects, HB.scope.units], [rs.length, rs.reduce((s, x) => s + x.units.counted, 0)]);
  const gp = E.golden('golden-policy.json').doc;
  if (gp) assert.deepEqual([HB.scope.projects, HB.home.supplyUpcoming.total, HB.home.supplyUpcoming.projects], [gp['policy.linked_projects'], gp['policy.statistics.upcoming_12m.total'], gp['policy.statistics.upcoming_12m.projects']]);
  for (const k of ['APPROVAL', 'SUPPLY']) assert.equal(HB.home.cards[k].current, v.reached[k], k);
  /* 2026-10-22 22:35 판: 카드(서버 tracking)와 지도 도달(프런트 reached — 호수 없는 사건은 사업 물량, 착공은 공급 사건 포함)이 HOME 안에서도 갈린다 —
     사업화 600(광교 A17 호수 없는 사업화 근거) · 착공 1,357(다산지금A3 등 6곳 공급 사건). 카드는 '/' 단계 카드, 도달은 지도·사업 화면(PoC 지도 카드와 같은 값) */
  /* 판 숫자([600, 1357]) 대신: 지도 도달 ≥ 카드(카드가 빼는 사건이 있을 뿐), 차이는 HOME 정답(판이 같을 때)의 지도 도달 합 − 카드 현재와 같다 */
  for (const k of ['BUSINESS', 'CONSTRUCTION']) assert.ok(v.reached[k] >= HB.home.cards[k].current, k);
  if (gp) for (const k of ['BUSINESS', 'CONSTRUCTION']) assert.equal(v.reached[k] - HB.home.cards[k].current, ['서울특별시', '경기도', '인천광역시'].reduce((s, n) => s + gp[`policy.map_supply.${n}.${k.toLowerCase()}_reached`], 0) - gp[`policy.stage_cards.${k}.current`], k);
  const J = HB.judgment;
  for (const k of ['NORMAL', 'WARNING', 'DELAYED', 'UNKNOWN']) {
    const j = { NORMAL: J.ok, WARNING: J.caution, DELAYED: J.delay, UNKNOWN: J.excluded }[k];
    assert.deepEqual([j.projects, j.units], [v.judge[k]?.rows ?? 0, v.judge[k]?.units ?? 0], k);
  }
  assert.deepEqual([HB.home.supplyUpcoming.total, HB.home.supplyUpcoming.projects], [v.upcoming.units, v.upcoming.projects]);
  assert.deepEqual([HB.home.supplyUpcoming.total, HB.home.supplyUpcoming.projects], [rc.total, rc.projects]);
  assert.deepEqual(HB.upcoming.map((u) => [u.ym, u.units, u.projects]), rc.months.map((m) => [m.ym, m.units, m.projects]), '월별 = region-calendar');
  /* 판 숫자(2026-12 1,881호) 대신: 달마다 = 원천 행의 공급 예정(upcoming)에서 다시 센 값 */
  const byYm = {};
  for (const r of rs) for (const [ym, u] of r.upcoming ?? []) byYm[ym] = (byYm[ym] ?? 0) + u;
  assert.deepEqual(HB.upcoming.map((u) => u.units), HB.upcoming.map((u) => byYm[u.ym] ?? 0));
  for (const r of HB.regions) { const xs = rs.filter((x) => x.region === r.name); assert.deepEqual([r.projects, r.units], [xs.length, xs.reduce((s, x) => s + x.units.counted, 0)], r.name); }
  const ag = new Map();
  for (const x of rs) { const a = ag.get(x.agency) ?? [0, 0]; a[0]++; a[1] += x.units.counted; ag.set(x.agency, a); }
  assert.deepEqual(HB.agencies.map((a) => [a.name, a.projects, a.units]).sort(), [...ag].map(([k, [n, u]]) => [k, n, u]).sort());
  /* 덤프 뒤 신규 행은 셋뿐(PoC 스냅샷 근거 — home-projects residuals 'row') */
  assert.deepEqual(HP.rows.filter((r) => r.from === 'snapshot' && rs.includes(r)).map((r) => r.id), HP.residuals.filter((r) => r.field === 'row').map((r) => r.id));
});
