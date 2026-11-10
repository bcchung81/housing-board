'use strict';
/* 종합상황판 '/'(data/board/home-board.json)·9·7 포트폴리오를 HOME PoC 정책 화면 정답과 대조한다(2026-10-22 사용자 지시 'home 화면과 같은 숫자').
   정답: .cache/home-parity/golden/S1-view-policy.json(PoC GET /policy-delivery/view?as_of_date=2026-10-22&group=policy&scope=policy 원 응답),
         S1-view-region-<시도>.json(같은 주소 scope=region:<시도> — 2026-10-22 22:35 HOME 앱(bbc21f7)부터 응답이 요청 범위의 비교 묶음만 싣는다)과
         golden-policy.json(같은 응답에 PoC 프런트 JS 2026-10-22 22:35 판 — policy-stage-flow.js?v=20261022-render-cache-v17 · policy-907.js?v=20261022-visible-axis-v14 — 를 돌린 값, S1-extract.js).
   대조: 단계 카드(현재 누적·보조 기준일(분기 말) 예상 누적 — 수도권·시도) · 사업 판정 분포 · 실제 기여 원천 수 · 공급 도달 · '/' 문서 전체(PoC 응답으로 만든 home-board 와 같다).
   덤프 뒤 생긴 차이가 없어 잔차 목록이 없다(생기면 사업 id·까닭으로 적는다). 정답 파일이 없으면 건너뛴다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const E = require('./home-era.cjs');
const GOLD = E.GOLDEN_DIR;   // HOME_GOLDEN_DIR(기본 .cache/home-parity/golden)
const SIDO = { 11: '서울특별시', 41: '경기도', 28: '인천광역시' };
const has = ['S1-view-policy.json', 'golden-policy.json', ...Object.values(SIDO).map((n) => `S1-view-region-${n}.json`)].every((f) => fs.existsSync(path.join(GOLD, f)));
/* 정답 받은 시각 < 원장 HOME 판 snapshot_at 이면 옛 판 정답 — 건너뛴다(home-era.cjs) */
const skip = has ? E.golden(path.join(GOLD, 'S1-view-policy.json')).skip : '정답 파일(.cache/home-parity/golden) 없음';
const read = (f) => JSON.parse(fs.readFileSync(path.join(GOLD, f), 'utf8'));
/* 정책 응답 + 시도 범위 응답의 비교 묶음(region:<시도>)을 합친 것 — HOME 화면이 지역을 고르면 받는 값과 같다 */
const view = has ? (() => {
  const v = read('S1-view-policy.json');
  const regions = Object.fromEntries(Object.values(SIDO).map((n) => [`region:${n}`, read(`S1-view-region-${n}.json`).portfolio_comparisons[`region:${n}`]]));
  return { ...v, portfolio_comparisons: { ...v.portfolio_comparisons, ...regions } };
})() : null;
const gp = has ? read('golden-policy.json') : null;
const HB = require('../../data/board/home-board.json');
const HP = require('../../data/board/home-projects.json');
const { homeBoards } = require('../../tools/ledger/home-board');
const STAGES = ['BUSINESS', 'APPROVAL', 'CONSTRUCTION', 'SUPPLY', 'MOVE_IN'];
const FIELDS = ['current', 'measured_on', 'year_end_expected', 'plan_date', 'remainder'];

test('정답 판: PoC 응답 기준일 = 우리 기준일, 관리사업 · 정책 연결 원천 = 사업 보기 자료', { skip }, () => {
  assert.equal(view.as_of_date, HB.referenceDate);
  /* 판 숫자([177, 232]) 대신: 사업 보기 자료(home-projects views.p97 — 다른 생성기)의 집계 행·원천 행 */
  assert.deepEqual([gp['policy.linked_projects'], gp['policy.management_projects']], [HP.views.p97.counted, HP.views.p97.rows]);
  assert.equal(HB.scope.projects, gp['policy.linked_projects']);
});

test('단계 카드(수도권): 현재 누적·12월 말 예상(사업화·인허가·착공·공급·입주) = PoC', { skip }, () => {
  for (const k of STAGES) {
    const c = HB.home.cards[k];
    assert.deepEqual(FIELDS.map((f) => c[f]), FIELDS.map((f) => gp[`policy.stage_cards.${k}.${f}`]), k);
  }
  /* 판 숫자([152802, …] · [174394, …]) 대신: 카드 = PoC(위) · 남은 호수 = 예상 − 현재 · 공급 현재 = PoC 시도 지도 공급 도달 합(다른 화면 값) */
  for (const k of STAGES) { const c = HB.home.cards[k]; if (c.current != null && c.year_end_expected != null) assert.equal(c.remainder, c.year_end_expected - c.current, k); }
  assert.equal(HB.home.cards.SUPPLY.current, Object.values(SIDO).reduce((s, n) => s + gp[`policy.map_supply.${n}.supply_reached`], 0));
  /* 2026-10-22 22:35 판: 예상 누적 = 단계별 max(현재 실적 머문 물량, 목표 머문 물량) + 분기 말까지 목표 증가분의 단계 이동(위 단계부터 누적) — forecast_points 의 연말 점이 아니다 */
  const t = view.portfolio_comparisons.policy.metrics.CONSTRUCTION.tracking;
  assert.notEqual(t.forecast_points.filter((p) => p.date <= '2026-12-31').at(-1).units, HB.home.cards.CONSTRUCTION.year_end_expected, '옛 판 규칙(forecast_points 연말 점 153,567 대 착공)과 다르다');
});

test('단계 카드(시도: 서울·경기·인천) = PoC 지역 선택 화면(scope=region:<시도>)의 카드 — 지역 목표 포함', { skip }, () => {
  for (const [code, name] of Object.entries(SIDO)) {
    assert.equal(HB.byRegion[code].home.cards.POLICY.target, gp[`policy.region_cards.${name}.POLICY.target`], `${name} 목표`);
    for (const k of STAGES) assert.deepEqual(FIELDS.map((f) => HB.byRegion[code].home.cards[k][f]), FIELDS.map((f) => gp[`policy.region_cards.${name}.${k}.${f}`]), `${name} ${k}`);
  }
});

test('사업 판정 분포 = PoC project_status — 종합상황판·사업 보기 같은 값', { skip }, () => {
  const want = Object.fromEntries(['NORMAL', 'DELAYED', 'WARNING', 'UNKNOWN'].map((k) => [k, [gp[`policy.project_status.${k}.projects`], gp[`policy.project_status.${k}.units`]]]));
  const j = HB.judgment;
  assert.deepEqual({ NORMAL: [j.ok.projects, j.ok.units], DELAYED: [j.delay.projects, j.delay.units], WARNING: [j.caution.projects, j.caution.units], UNKNOWN: [j.excluded.projects, j.excluded.units] }, want);
  assert.deepEqual(Object.fromEntries(Object.entries(HP.views.p97.judge).map(([k, v]) => [k, [v.rows, v.units]])), Object.fromEntries(Object.entries(want).filter(([, v]) => v[0])));
  /* 판 숫자([163, 10, 3, 1]) 대신: 판정 사업 합 = PoC 관리(연결) 사업 수 */
  assert.equal(want.NORMAL[0] + want.DELAYED[0] + want.WARNING[0] + want.UNKNOWN[0], gp['policy.linked_projects']);
  assert.deepEqual(HP.residuals, [], '사업 보기 잔차 없음(덤프 값 = PoC — 사업 연결 결정 mapping_decision 반영)');
});

test('공급 도달 · 지연·주의 최대 · 12개월 공급 = PoC', { skip }, () => {
  assert.equal(HB.home.cards.SUPPLY.current, HP.views.p97.reached.SUPPLY, '판 숫자(35,410) 대신 사업 보기 자료 9·7 공급 도달');
  assert.equal(HB.home.cards.SUPPLY.current, gp['policy.stage_cards.SUPPLY.current']);
  assert.equal(Object.values(SIDO).reduce((s, n) => s + gp[`policy.map_supply.${n}.supply_reached`], 0), HB.home.cards.SUPPLY.current);
  assert.deepEqual([HB.home.delayMax, HB.home.warningMax], [gp['policy.statistics.delay_max_latest'], gp['policy.statistics.warning_max_latest']]);
  /* 판 숫자([21592, 0]) 대신: 지연 최대 = '/' 단계 부족 중 지연(DELAYED) 부족량 최대, 주의 최대 = 주의(WARNING) 부족량 최대(없으면 0) */
  const mx = (st) => Math.max(0, ...HB.home.stageGaps.filter((g) => g.status === st).map((g) => g.gap));
  assert.deepEqual([HB.home.delayMax, HB.home.warningMax], [mx('DELAYED'), mx('WARNING')]);
  assert.deepEqual([HB.home.supplyUpcoming.total, HB.home.supplyUpcoming.projects], [gp['policy.statistics.upcoming_12m.total'], gp['policy.statistics.upcoming_12m.projects']]);
});

test('실제 기여 원천 = PoC portfolio_cohorts 묶음 원천(중복 제외) — 인천부평(도시재생뉴딜) A 묶음에 계약 행이 든다', { skip }, () => {
  const src = (cs) => new Set(cs.flatMap((c) => c.source_ids));
  const PP = require('../../tools/ledger/policy-progress');
  const H = require('../../tools/ledger/home-source');
  const P = require('../../tools/ledger/paths');
  const dir = H.latestHomeDir(P.ledgerDir(P.latestMonth()));
  if (!dir || !H.homeAvailable(dir)) return;   // HOME 덤프 원본(git 무시)이 있는 개발 PC 에서만
  const ours = PP.homeView(H.readHome(dir)).portfolio_cohorts;
  /* 판 숫자(221) 대신: PoC 묶음 원천은 모두 사업 보기 자료의 9·7 원천 행이고 묶음마다 하나 이상 — 집합 전체는 아래 줄에서 우리 덤프 포트폴리오와 같다 */
  const p97 = new Set(HP.rows.filter((r) => r.p97).map((r) => r.id));
  assert.ok([...src(view.portfolio_cohorts)].every((id) => p97.has(id)) && view.portfolio_cohorts.every((c) => c.source_ids.length > 0));
  assert.deepEqual([...src(ours)].sort(), [...src(view.portfolio_cohorts)].sort());
  assert.deepEqual(ours.find((c) => c.id === 'PRO_9a256c5d211050be9f0814ff').source_ids, ['PRO_0e5b836fdd9670216e60ee53', 'PRO_9a256c5d211050be9f0814ff']);
});

test("'/' 문서 = PoC 응답으로 만든 종합상황판(카드·판정·추이·리본·시도·기관·12개월·시도 묶음 전부)", { skip }, () => {
  const fromPoc = homeBoards(view);
  /* 출처 표지만 다르다: 덤프에 없어 PoC 스냅샷으로 채운 지역 목표(경기·인천)에 우리는 from 'poc' 를 남긴다(값은 같다) */
  const strip = (b) => { const { source, ...rest } = JSON.parse(JSON.stringify(b)); for (const r of Object.values(rest.byRegion)) delete r.home.cards.POLICY.from; return rest; };
  assert.deepEqual(Object.entries(HB.byRegion).filter(([, r]) => r.home.cards.POLICY.from).map(([k]) => k).sort(), ['28', '41']);
  assert.deepEqual(strip(HB), strip(fromPoc));
});
