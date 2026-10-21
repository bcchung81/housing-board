'use strict';
/* 사업 화면(/projects) 수치 ↔ HOME PoC 정답(2026-10-21 W2-P — 기준일 2026-10-20). 화면과 같은 함수(lib/board/projects-view.ts homeRowsOf·parseFilters·homeSummaryOf·homePipelineOf)로
   기본(9·7 포트폴리오)·전 정책 보기의 건수·호수·상태별·단계별·기관별·시도별 값을 내고, 정답과 같거나 남는 차이를 PRO_ id·이유(data/board/home-projects.json residuals)로 설명한다.
   정답: .cache/home-parity/golden/golden-projects.json(PoC /map/dashboard 9·7·정책 전체), golden-policy.json(PoC /policy-delivery/view 9·7 포트폴리오 — 판정·기관·도달·12개월),
   S2-raw-map-dashboard.json(정책 전체 시도별). 정답 파일이 없으면(저장소 밖 작업 폴더) 건너뛴다.
   종합상황판 목록 창(lib/board/board-lists.ts) 건수 = '/' 카드 숫자(data/board/home-board.json)도 여기서 고정한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const GOLD = path.join(ROOT, '.cache/home-parity/golden');
const V = require('../../lib/board/projects-view.ts');
const BL = require('../../lib/board/board-lists.ts');
const HP = require('../../data/board/home-projects.json');
const HB = require('../../data/board/home-board.json');
const IDX = require('../../data/board/projects-index.json');
const gold = (f) => JSON.parse(fs.readFileSync(path.join(GOLD, f), 'utf8'));
const has = fs.existsSync(path.join(GOLD, 'golden-projects.json')) && fs.existsSync(path.join(GOLD, 'golden-policy.json'));
const opt = { skip: has ? false : '정답 파일(.cache/home-parity/golden) 없음' };

const rows = V.homeRowsOf(HP.rows, HP.residuals);
const programs = V.homeProgramsOf(rows), agencies = V.homeAgenciesOf(rows);
const parse = (q) => V.parseFilters(q, { policies: IDX.policies, programs, sidoOk: () => true, home: { agencies: agencies.map((a) => a.name) } });
const SIDO = { 서울특별시: '11', 인천광역시: '28', 경기도: '41' };
const view = (q) => { const f = parse(q), scope = V.scopeOf(rows, f), chartOf = V.homeChartOf(f); return { f, scope, chartOf, chart: scope.filter(chartOf), s: V.homeSummaryOf(scope, chartOf), pipe: V.homePipelineOf(scope, chartOf) }; };
const P97 = view({}), ALL = view({ policy: 'all' });
/* 덤프 값을 쓴(use 'dump') 칸의 PoC 값 — 잔차를 적용하면 정답과 같아야 한다 */
const pocOf = (field) => new Map(HP.residuals.filter((r) => r.field === field && r.use === 'dump').map((r) => [r.id, r]));
const explained = (list) => list.every((r) => /^PRO_[0-9a-f]{24}$/.test(r.id) && r.why.length > 10);

test('기본 = 9·7 포트폴리오: 원천 행 230 · 집계 175 · 중복/모호 제외 55 · 물량 없음 0 · 151,271호(PoC /map/dashboard 9·7 summary 와 같다)', opt, () => {
  const g = gold('golden-projects.json').poc_overview_97;
  assert.equal(P97.f.policy?.key, '97', '정책을 고르지 않으면 9·7');
  assert.equal(P97.s.n, g['summary.project_count']);
  assert.equal(P97.s.counted, g['summary.target_counted_projects']);
  assert.equal(P97.s.excluded, g['summary.target_excluded_projects']);
  assert.equal(P97.s.missing, g['summary.target_missing_projects']);
  assert.equal(P97.s.units, g['summary.target_units']);
  /* 같은 현장 병합 사업 수(보조 표기): 원장 사업 170곳 · 원장에 없는 원천 행 9(덤프 뒤 신규 3 · SOURCE_ANCHOR 없음 4 · 시군구 미정 2 — S2 2절) */
  assert.deepEqual([P97.s.sites, P97.s.unlinked], [170, 9]);
});

test('기본 시도별: 원천 행 수 · 집계 호수가 PoC groups.region(9·7)과 같다', opt, () => {
  for (const g of gold('golden-projects.json').poc_overview_97['groups.region']) {
    const rs = P97.scope.filter((r) => r.sgg.startsWith(SIDO[g.name]));
    assert.deepEqual([rs.length, rs.filter(P97.chartOf).reduce((s, r) => s + (r.home.counted ?? 0), 0)], [g.project_count, g.target_units], g.name);
  }
});

test('기본 기관별: PoC 기관 이름 7줄의 집계 행 수 · 집계 호수가 PoC statistics.agencies(9·7 포트폴리오 175)와 같다', opt, () => {
  const g = gold('golden-policy.json')['policy.statistics.agencies'];
  const ours = new Map();
  for (const r of P97.chart) { const x = ours.get(r.agency) ?? { count: 0, total: 0 }; x.count++; x.total += r.home.counted ?? 0; ours.set(r.agency, x); }
  assert.equal(ours.size, g.length);
  for (const a of g) assert.deepEqual(ours.get(a.name), { count: a.count, total: a.total }, a.name);
  assert.equal(pocOf('agency').size, 0, '기관 잔차 없음');
});

test('기본 상태별: PoC 사업 판정과 다른 37행은 모두 덤프 뒤 HOME 담당자 입력 변경(PRO_ id·이유) — 잔차를 적용하면 PoC project_status 와 같다', opt, () => {
  const g = gold('golden-policy.json'), res = pocOf('judge');
  const ours = {}, poc = {};
  for (const r of P97.chart) {
    ours[r.home.judge] = (ours[r.home.judge] ?? 0) + 1;
    const s = res.get(r.id)?.poc.status ?? r.home.judge;
    poc[s] = (poc[s] ?? 0) + 1;
  }
  assert.deepEqual(ours, { NORMAL: 136, UNKNOWN: 35, DELAYED: 4 }, '화면(덤프 값)');
  assert.deepEqual(poc, Object.fromEntries(['NORMAL', 'DELAYED', 'WARNING'].map((k) => [k, g[`policy.project_status.${k}.projects`]])), '잔차 적용 = PoC');
  assert.equal(res.size, 37);
  assert.ok(explained([...res.values()]) && [...res.values()].every((r) => r.why.startsWith('덤프 뒤 HOME 담당자 입력')));
  /* 화면 상태 칩: 지연 4 · 주의 0 = 종합상황판 사업 판정 */
  assert.deepEqual([P97.s.delay, P97.s.caution], [HB.judgment.delay.projects, HB.judgment.caution.projects]);
});

test('기본 단계별: 단계별 진행 ②사업화~⑤공급 누적 도달 호수 = PoC 정책 화면 지도 값(시도별 business·approval·construction·supply_reached) — 남는 차는 덤프 뒤 입력 40행', opt, () => {
  const g = gold('golden-policy.json'), res = pocOf('reached');
  const KEYS = [[1, 'BUSINESS', 'business_reached'], [2, 'APPROVAL', 'approval_reached'], [3, 'CONSTRUCTION', 'construction_reached'], [4, 'SUPPLY', 'supply_reached']];
  for (const [i, key, gk] of KEYS) {
    const cell = P97.pipe.open.find((c) => c.i === i);
    const pocSum = P97.chart.reduce((s, r) => s + (res.has(r.id) ? res.get(r.id).poc[key] : V.slotUnits(r.home.reached, i)), 0);
    const want = Object.keys(SIDO).reduce((s, n) => s + g[`policy.map_supply.${n}.${gk}`], 0);
    assert.equal(pocSum, want, `${V.HOME_NAMES[i]}: 잔차 적용 = PoC`);
    assert.equal(cell.units, P97.chart.reduce((s, r) => s + V.slotUnits(r.home.reached, i), 0), `${V.HOME_NAMES[i]}: 화면 칸 = 덤프 값`);
  }
  assert.equal(P97.pipe.open[0].units, 151271, '①정책 = 집계 호수');
  assert.equal(res.size, 40);
  assert.ok(explained([...res.values()]));
});

test('기본 향후 12개월 공급 예정: 덤프 17,838호 · 31건 — PoC 17,488 · 30 과의 차 350호 1건은 덤프 뒤 입력(PRO_9a256c5d211050be9f0814ff)', opt, () => {
  const g = gold('golden-policy.json'), res = pocOf('upcoming');
  const sumOf = (r) => (res.has(r.id) ? res.get(r.id).poc.reduce((s, x) => s + x[1], 0) : r.home.upcoming);
  assert.deepEqual([P97.chart.reduce((s, r) => s + r.home.upcoming, 0), P97.chart.filter((r) => r.home.upcoming > 0).length], [17838, 31]);
  assert.deepEqual([P97.chart.reduce((s, r) => s + sumOf(r), 0), P97.chart.filter((r) => sumOf(r) > 0).length], [g['policy.statistics.upcoming_12m.total'], g['policy.statistics.upcoming_12m.projects']]);
  assert.deepEqual([...res.keys()], ['PRO_9a256c5d211050be9f0814ff']);
});

test('전 정책(?policy=all): 원천 행 443 · 집계 346 · 제외 56 · 물량 없음 41 · 289,336호 · 시도별(PoC /map/dashboard 정책 전체)', opt, () => {
  const g = gold('golden-projects.json').poc_overview_all;
  assert.equal(ALL.f.policy, undefined);
  assert.deepEqual([ALL.s.n, ALL.s.counted, ALL.s.excluded, ALL.s.missing, ALL.s.units],
    [g['summary.project_count'], g['summary.target_counted_projects'], g['summary.target_excluded_projects'], g['summary.target_missing_projects'], g['summary.target_units']]);
  for (const r of gold('S2-raw-map-dashboard.json').groups.region) {
    const rs = ALL.scope.filter((x) => x.sgg.startsWith(SIDO[r.name]));
    assert.deepEqual([rs.length, rs.filter(ALL.chartOf).reduce((s, x) => s + (x.home.counted ?? 0), 0)], [r.project_count, r.target_units], r.name);
  }
  /* 정책별 원천 행 = PoC groups.policy(9·7 230 · 1·29 47 · 8·13 67) */
  for (const p of g['groups.policy'].filter((x) => /^POL_/.test(x.id))) assert.equal(view({ policy: IDX.policies.find((y) => y.id === p.id).key }).s.n, p.project_count, p.name);
  /* 같은 현장 병합 원장 사업 377곳(원장 살아 있는 사업 전부 — S2 2절) */
  assert.equal(ALL.s.sites, 377);
});

test('전 정책의 판정·도달·기관은 home-projects.json views.all(덤프 값)과 같다 — PoC 정답은 9·7 포트폴리오만 공개(정책 전체 판정·기관 화면 없음)', () => {
  const v = HP.views.all;
  const judge = {};
  for (const r of ALL.scope.filter((x) => ALL.chartOf(x) && (x.home.counted ?? 0) > 0 && x.home.reached)) { const j = (judge[r.home.judge] ??= { rows: 0, units: 0 }); j.rows++; j.units += r.home.counted; }
  assert.deepEqual(judge, v.judge);
  for (const [i, key] of [[1, 'BUSINESS'], [2, 'APPROVAL'], [4, 'SUPPLY'], [5, 'MOVE_IN']]) assert.equal(ALL.pipe.open.find((c) => c.i === i).units, v.reached[key], key);
});

test("'/' 카드 목록 창 건수 = 카드 숫자(home-board.json): 연결 사업 175 · 지연 4 · 주의 0 · 단계별 지연 합 = 지연", () => {
  const L = BL.boardLists(V, rows, () => undefined);
  assert.equal(L[BL.LIST_ALL].rows.length, HB.scope.projects);
  assert.equal(L[BL.LIST_ALL].title, `연결 사업 ${HB.scope.projects}개`);
  assert.equal(L[BL.LIST_LATE].rows.length, HB.judgment.delay.projects);
  assert.equal(L[BL.LIST_CAUTION].rows.length, HB.judgment.caution.projects);
  assert.equal([0, 1, 2, 3, 4, 5].reduce((n, i) => n + L[BL.listStage(i)].rows.length, 0), HB.judgment.delay.projects);
  assert.equal(rows.filter((r) => r.home.board).reduce((s, r) => s + r.home.counted, 0), HB.scope.units, '카드 모집단 호수');
  /* 행은 사업 화면 HOME 창(?id=PRO_)으로 */
  assert.ok(L[BL.LIST_LATE].rows.every((r) => /[?&]id=PRO_/.test(r.href)));
});

/* 2026-10-21 2038810 inventory 이식으로 인천검단 AA19 두 임대 유형이 덤프 묶음이 되어 '/' 카드 170 → 172, W3-H 로 덤프 뒤 신규 3행(PoC 스냅샷)도 같이 세어 175 — 차 0 */
test("'/' 카드 175개 = /projects 기본 집계 175행: 같은 원천 행 집합(덤프 뒤 신규 3행 포함)", () => {
  assert.deepEqual(P97.chart.filter((r) => !r.home.board).map((r) => r.id), []);
  assert.equal(rows.filter((r) => r.home.board && !P97.chartOf(r)).length, 0, '카드 모집단은 모두 /projects 기본 집계 행');
  assert.equal(rows.filter((r) => r.home.board).length, HB.scope.projects);
  const late = rows.filter((r) => r.home.board && r.home.snapshot).map((r) => r.id).sort();
  assert.deepEqual(late, ['PRO_18141914462204e2be0e5796', 'PRO_b8e9b07eb43ee60a807ec231', 'PRO_e925e787e29c13e42deafcda']);
  for (const id of late) { const why = HP.residuals.filter((x) => x.id === id && x.field === 'row'); assert.ok(why.length && explained(why), id); }
});

test('일반사용자 사업 창(PublicWin.home): 원장 사업에 합쳐진 원천 행의 PoC 판정 — 가장 나쁜 판정과 그 부족 호수 합, 원천 행이 없으면 null(옛 예정일 경과 문장)', () => {
  const PL = require('../../lib/board/public-labels.ts');
  const delayed = rows.filter((r) => r.cls === 'delay' && r.home.ourId);
  assert.ok(delayed.length > 0);
  for (const r of delayed) {
    const j = V.homeJudgeOf(rows, r.home.ourId);
    assert.equal(j.cls, 'delay', r.id);
    assert.equal(j.gap, rows.filter((x) => x.home.ourId === r.home.ourId && x.cls === 'delay').reduce((n, x) => n + x.home.gap, 0));
    assert.match(PL.homeFact(j.cls, j.gap, null), /^예정보다 [\d,]+호가 아직 확인되지 않았어요$/);
  }
  const ok = rows.find((r) => r.cls === 'ok' && r.home.ourId && rows.filter((x) => x.home.ourId === r.home.ourId).every((x) => x.cls !== 'delay' && x.cls !== 'caution'));
  assert.deepEqual(V.homeJudgeOf(rows, ok.home.ourId), { cls: 'ok', gap: null });
  assert.equal(PL.homeFact('ok', null, null), '');
  assert.equal(V.homeJudgeOf(rows, 'PRJ-00000-0000'), null);
  const src = fs.readFileSync(path.join(ROOT, 'components/citizen/PublicDetail.tsx'), 'utf8'), win = fs.readFileSync(path.join(ROOT, 'lib/board/project-window.ts'), 'utf8');
  assert.match(src, /d\.home \? homeFact\(d\.home\.cls, d\.home\.gap/);
  assert.match(win, /pastDue: home \? false : pastDueOf\(r\), home,/);
});
