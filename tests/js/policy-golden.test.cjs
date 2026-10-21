'use strict';
/* 종합상황판 '/'(data/board/home-board.json)·9·7 포트폴리오를 HOME PoC 정책 화면 정답과 대조한다(2026-10-22 사용자 지시 'home 화면과 같은 숫자').
   정답: .cache/home-parity/golden/S1-view-policy.json(PoC GET /policy-delivery/view?as_of_date=2026-10-22&group=policy&scope=policy 원 응답)과
         golden-policy.json(같은 응답에 PoC 프런트 JS 2026-10-22 판 — policy-stage-flow.js?v=20261022-cumulative-forecast — 를 돌린 값, S1-extract.js).
   대조: 연말 예상(단계 카드 12월 말 누적 예상량 — 수도권·시도) · 사업 판정 분포 · 실제 기여 원천 수 · 공급 도달 · '/' 문서 전체(PoC 응답으로 만든 home-board 와 같다).
   덤프 뒤 생긴 차이가 없어 잔차 목록이 없다(생기면 사업 id·까닭으로 적는다). 정답 파일이 없으면 건너뛴다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const GOLD = path.join(ROOT, '.cache/home-parity/golden');
const has = fs.existsSync(path.join(GOLD, 'S1-view-policy.json')) && fs.existsSync(path.join(GOLD, 'golden-policy.json'));
const skip = !has && '정답 파일(.cache/home-parity/golden) 없음';
const view = has ? JSON.parse(fs.readFileSync(path.join(GOLD, 'S1-view-policy.json'), 'utf8')) : null;
const gp = has ? JSON.parse(fs.readFileSync(path.join(GOLD, 'golden-policy.json'), 'utf8')) : null;
const HB = require('../../data/board/home-board.json');
const HP = require('../../data/board/home-projects.json');
const { homeBoards } = require('../../tools/ledger/home-board');
const STAGES = ['BUSINESS', 'APPROVAL', 'CONSTRUCTION', 'SUPPLY', 'MOVE_IN'];
const SIDO = { 11: '서울특별시', 41: '경기도', 28: '인천광역시' };

test('정답 판: PoC 응답 기준일 = 우리 기준일(2026-10-22), 관리사업 177 · 정책 연결 원천 232', { skip }, () => {
  assert.equal(view.as_of_date, HB.referenceDate);
  assert.deepEqual([gp['policy.linked_projects'], gp['policy.management_projects']], [177, 232]);
  assert.equal(HB.scope.projects, gp['policy.linked_projects']);
});

test('연말 예상(12월 말 누적 예상량): 수도권 카드 = PoC — 착공 99,885 · 사업화 153,402 · 인허가 106,771 · 공급 73,114 · 입주 3,845, 현재 누적·차이도 같다', { skip }, () => {
  for (const k of STAGES) {
    const c = HB.home.cards[k];
    assert.deepEqual([c.current, c.measured_on, c.year_end_expected, c.plan_date, c.remainder],
      ['current', 'measured_on', 'year_end_expected', 'plan_date', 'remainder'].map((f) => gp[`policy.stage_cards.${k}.${f}`]), k);
  }
  assert.deepEqual(STAGES.map((k) => HB.home.cards[k].year_end_expected), [153402, 106771, 99885, 73114, 3845]);
  /* 연말 예상 = forecast_points 의 연말까지 마지막 점(사업별 max(현재 누적 도달, 연말까지 누적 계획)의 합) — 옛 계획 누계(target_points)가 아니다 */
  const t = view.portfolio_comparisons.policy.metrics.CONSTRUCTION.tracking;
  assert.equal(t.forecast_points.filter((p) => p.date <= '2026-12-31').at(-1).units, HB.home.cards.CONSTRUCTION.year_end_expected);
  assert.notEqual(t.target_points.filter((p) => p.date <= '2026-12-31').at(-1).units, HB.home.cards.CONSTRUCTION.year_end_expected, '계획 누계(94,498)와 다르다');
});

test('연말 예상: 시도 카드(서울·경기·인천) = PoC region:<시도> forecast_points 연말 점', { skip }, () => {
  for (const [code, name] of Object.entries(SIDO)) {
    const metrics = view.portfolio_comparisons[`region:${name}`].metrics;
    for (const k of STAGES) {
      const p = metrics[k].tracking.forecast_points.filter((x) => x.date <= '2026-12-31').at(-1) ?? null;
      assert.equal(HB.byRegion[code].home.cards[k].year_end_expected, p?.units ?? null, `${name} ${k}`);
    }
  }
});

test('사업 판정 분포 = PoC project_status(정상 168 · 지연 6 · 주의 2 · 미확보 1) — 종합상황판·사업 보기 같은 값', { skip }, () => {
  const want = Object.fromEntries(['NORMAL', 'DELAYED', 'WARNING', 'UNKNOWN'].map((k) => [k, [gp[`policy.project_status.${k}.projects`], gp[`policy.project_status.${k}.units`]]]));
  const j = HB.judgment;
  assert.deepEqual({ NORMAL: [j.ok.projects, j.ok.units], DELAYED: [j.delay.projects, j.delay.units], WARNING: [j.caution.projects, j.caution.units], UNKNOWN: [j.excluded.projects, j.excluded.units] }, want);
  assert.deepEqual(Object.fromEntries(Object.entries(HP.views.p97.judge).map(([k, v]) => [k, [v.rows, v.units]])), Object.fromEntries(Object.entries(want).filter(([, v]) => v[0])));
  assert.deepEqual([want.NORMAL[0], want.DELAYED[0], want.WARNING[0], want.UNKNOWN[0]], [168, 6, 2, 1]);
  assert.deepEqual(HP.residuals, [], '사업 보기 잔차 없음(덤프 값 = PoC)');
});

test('공급 도달 58,125 · 지연·주의 최대 1,988·643 · 12개월 공급 18,214호·31곳 = PoC', { skip }, () => {
  assert.equal(HB.home.cards.SUPPLY.current, 58125);
  assert.equal(HB.home.cards.SUPPLY.current, gp['policy.stage_cards.SUPPLY.current']);
  assert.equal(Object.values(SIDO).reduce((s, n) => s + gp[`policy.map_supply.${n}.supply_reached`], 0), HB.home.cards.SUPPLY.current);
  assert.deepEqual([HB.home.delayMax, HB.home.warningMax], [gp['policy.statistics.delay_max_latest'], gp['policy.statistics.warning_max_latest']]);
  assert.deepEqual([HB.home.supplyUpcoming.total, HB.home.supplyUpcoming.projects], [gp['policy.statistics.upcoming_12m.total'], gp['policy.statistics.upcoming_12m.projects']]);
});

test('실제 기여 원천 221 = PoC portfolio_cohorts 묶음 원천(중복 제외) — 인천부평(도시재생뉴딜) A 묶음에 계약 행이 든다', { skip }, () => {
  const src = (cs) => new Set(cs.flatMap((c) => c.source_ids));
  const PP = require('../../tools/ledger/policy-progress');
  const H = require('../../tools/ledger/home-source');
  const P = require('../../tools/ledger/paths');
  const dir = H.latestHomeDir(P.ledgerDir(P.latestMonth()));
  if (!dir || !H.homeAvailable(dir)) return;   // HOME 덤프 원본(git 무시)이 있는 개발 PC 에서만
  const ours = PP.homeView(H.readHome(dir)).portfolio_cohorts;
  assert.equal(src(view.portfolio_cohorts).size, 221);
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
