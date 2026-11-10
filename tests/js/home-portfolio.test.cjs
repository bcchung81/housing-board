'use strict';
// 9·7 포트폴리오(HOME portfolio_cohorts)와 범위별 tracking(portfolio_comparisons[범위].metrics[지표].tracking) — tools/ledger/policy-progress.js 의 HOME 이식.
// (a) 계산 층: PoC 응답(as_of 2026-10-22, HOME 앱 bbc21f7 — 덤프 HOME_DB_20261022_223542 와 같은 판)의 portfolio_cohorts 를 넣으면 PoC 의 tracking 점(목표·실적·연말 예상)과 완전히 같다
//     (정책 전체·시도 3·프로그램 31 범위 × 지표 6 — 이 판부터 응답이 요청 범위만 실어 시군구 범위는 받지 않았다).
//     고정값 tests/fixtures/home-1022b/portfolio-view.json = PoC GET /policy-delivery/view?as_of_date=2026-10-22(+ scope=region:<시도> 3개 · 프로그램 화면 31개)에서
//     tracking·대조에 쓰는 칸만 잘라 넣은 것(담당자 이름·사유·배치 id·근거 글 칸은 뺐다). 점 목록은 {cols, rows}, evidence_urls 는 urls 번호로 접었다 — 여기서 다시 편다.
//     2026-10-22 22:35 판 규칙(역추적): 착공 누적은 공급 사건으로 끌어올리지 않는다 · 호수 없는 사건은 누적·연말 예상에 세지 않는다 · evidence_bridge 참고용(reference_only) 실제 사실은 사건이 아니다.
// (b) 덤프로 만든 포트폴리오(HOME 덤프가 있을 때만 — 2026-10-22 22:35 판 20261022T133544Z): 같은 고정값의 PoC 포트폴리오와 같은 사업·같은 칸. 남는 차이는 아래 허용 목록(사업 id·까닭)뿐이어야 한다.
//     덤프 뒤 변경 판정: PoC 사건에 changed_at > 덤프 시각이 있는 사업은 사건·일정 대조에서 뺀다. 일정에는 changed_at 이 없어 일정 차이는 근거를 보고 허용 목록에 적었다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PP = require('../../tools/ledger/policy-progress');
const H = require('../../tools/ledger/home-source');
const P = require('../../tools/ledger/paths');

const FIX = path.join(__dirname, '..', 'fixtures', 'home-1022b', 'portfolio-view.json');
const poc = JSON.parse(fs.readFileSync(FIX, 'utf8'));
const pocB = poc;   // (b) 덤프 대조용 — 덤프 판과 같은 판의 PoC 포트폴리오
const unpack = ({ cols, rows }) => rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, c === 'evidence_urls' ? r[i].map((k) => poc.urls[k]) : r[i]])));
const expected = Object.fromEntries(Object.entries(poc.expected).map(([k, v]) => [k, { ...v,
  metrics: Object.fromEntries(Object.entries(v.metrics).map(([m, t]) => [m, { ...t, target_points: unpack(t.target_points), actual_points: unpack(t.actual_points), forecast_points: unpack(t.forecast_points) }])) }]));
const METRICS = ['CONSTRUCTION', 'SUPPLY', 'BUSINESS', 'APPROVAL', 'COMPLETION', 'MOVE_IN'];

test('(a) PoC 포트폴리오 → 범위별 tracking(목표·실적·연말 예상 점)이 PoC portfolio_comparisons 와 완전히 같다(35 범위 × 6 지표)', () => {
  const mine = PP.portfolioComparisons(poc.portfolio_cohorts, poc.as_of_date, { programs: poc.programs });
  const kinds = {};
  for (const [k, v] of Object.entries(expected)) kinds[v.kind] = (kinds[v.kind] ?? 0) + 1;
  assert.deepEqual(kinds, { policy: 1, region: 3, program: 31 });
  let n = 0;
  for (const [k, v] of Object.entries(expected)) {
    assert.ok(mine[k], `범위 ${k} 가 있다(사업 없는 프로그램은 programs 로 들어온다)`);
    assert.deepEqual([mine[k].name, mine[k].kind], [v.name, v.kind], k);
    assert.deepEqual(Object.keys(mine[k].metrics), METRICS, k);
    for (const m of METRICS) { assert.deepStrictEqual(mine[k].metrics[m].tracking, v.metrics[m], `${k} ${m}`); n++; }
  }
  assert.equal(n, 210);
  /* 정책 전체: 공급 누적 35,410호(2026-10-19 — 담당자 입력 32,021 · 추정 8,136 포함, 10-22 오전 판 58,125 에서 담당자 공급 추정이 빠졌다) · 착공 81,131 · 사업화 152,802 */
  assert.deepEqual(PP.trackingOf(poc.portfolio_cohorts, 'SUPPLY', poc.as_of_date).actual_points.at(-1),
    { date: '2026-10-19', units: 35410, confirmed_units: 35410, policy_confirmed_units: 35410, review_units: 0, origin: 'SOURCE_OR_MANUAL', manual_units: 32021, inferred_units: 8136,
      evidence_urls: ['https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?aisTpCd=10&ccrCnntSysDsCd=03&mi=1026&panId=2015122300020925&uppAisTpCd=06'] });
  assert.deepEqual(['CONSTRUCTION', 'BUSINESS', 'APPROVAL'].map((m) => mine.policy.metrics[m].tracking.actual_points.at(-1).units), [81131, 152802, 99462]);
});

test('(a) tracking 규칙: 후속 단계 사건도 그 단계 도달(착공은 공급으로 끌어올리지 않음) · 호수 없는 사건은 세지 않음 · 목표는 1900-01-01 부터 · 사업 수는 범위 사업 수', () => {
  const c = { id: 'p', units: 100, mapping_status: 'CONFIRMED', events: [{ stage: 'SUPPLY', event_date: '2020-05-01', units: 60, origin: 'MANUAL', inferred: true }, { stage: 'MOVE_IN', event_date: '2021-01-01', units: null, status: 'ACTUAL' }],
    schedules: [{ stage: 'APPROVAL', due_date: '1999-12-31', units: 100, origin: 'SOURCE', source_object_id: 's' }] };
  const t = PP.trackingOf([c], 'APPROVAL', '2026-10-20');
  assert.deepEqual(t.actual_points.map((p) => [p.date, p.units, p.manual_units, p.inferred_units]), [['2020-05-01', 60, 60, 60]], '호수 없는 입주 사건(2021-01-01)은 사업 물량으로 보지 않는다(2026-10-22 22:35 판)');
  assert.deepEqual(t.target_points.map((p) => [p.date, p.units, p.origin]), [['1999-12-31', 100, 'SOURCE']]);
  assert.equal(t.project_count, 1);
  assert.deepEqual(PP.trackingOf([c], 'CONSTRUCTION', '2026-10-20').actual_points, [], '착공 누적은 공급 사건으로 끌어올리지 않는다(2026-10-22 22:35 판)');
  assert.deepEqual(PP.stageEvents([c], 'APPROVAL', '2026-10-20').points, [], '우리 문서용(같은 단계만)은 후속 단계를 세지 않는다');
});

/* (a′) 연말 예상(tracking.forecast_points): 날짜 = 목표 점·확인 점 날짜, 값 = 사업별 max(그 날까지 누적 도달, 그 날까지 누적 목표)의 합 — (a) 에서 PoC 점과 같음을 본다.
   단계 카드의 12월 말 예상은 2026-10-22 22:35 판부터 이 점이 아니라 머문 단계 계산(home-view projectedValue)이다 */
test('(a′) 단계 카드(home-view — PoC policy-stage-flow.js 22:35 판): PoC 포트폴리오로 만든 카드 = 사업화 152,802→174,394 · 인허가 99,462→126,852 · 착공 81,131→117,392 · 공급 35,410→68,267 · 입주 미측정→3,845', () => {
  const mine = PP.portfolioComparisons(pocB.portfolio_cohorts, pocB.as_of_date);
  const HV = require('../../tools/ledger/home-view');
  const cards = HV.policyScreen({ as_of_date: pocB.as_of_date, target_units: 1350000, plan: { period_start: '2026-01-01', period_end: '2030-12-31' }, stages: { POLICY: '정책', BUSINESS: '사업화', APPROVAL: '인허가', CONSTRUCTION: '건설', SUPPLY: '공급', MOVE_IN: '입주' },
    portfolio_cohorts: pocB.portfolio_cohorts, portfolio_comparisons: mine }).stage_cards;
  assert.deepEqual(['BUSINESS', 'APPROVAL', 'CONSTRUCTION', 'SUPPLY', 'MOVE_IN'].map((k) => [cards[k].current, cards[k].year_end_expected]),
    [[152802, 174394], [99462, 126852], [81131, 117392], [35410, 68267], [null, 3845]]);
});
test('(a′) 연말 예상 규칙: 이미 도달한 사업은 계획보다 도달, 미도달 사업은 연말까지 계획 — 같은 사업의 실적·계획을 두 번 세지 않는다(착공은 공급 도달로 올리지 않는다)', () => {
  const c = (id, units, events, schedules) => ({ id, units, mapping_status: 'CONFIRMED', events, schedules });
  const sch = (due, units) => ({ stage: 'CONSTRUCTION', due_date: due, units, origin: 'SOURCE', source_object_id: 's' });
  const a = c('a', 100, [{ stage: 'CONSTRUCTION', event_date: '2026-03-01', units: 100 }], [sch('2026-06-30', 100)]);   // 이미 착공 — 계획과 겹침
  const b = c('b', 50, [], [sch('2026-11-30', 50)]);                                                                      // 아직 — 연말 전 계획
  const d = c('d', 80, [{ stage: 'SUPPLY', event_date: '2026-05-01', units: 30 }], [sch('2027-03-31', 80)]);             // 공급 30(착공 도달 아님), 계획은 내년
  const fcRows = (pts) => pts.map((p) => [p.date, p.units, p.observed_units, p.remaining_plan_units]);
  const t = PP.trackingOf([a, b, d], 'CONSTRUCTION', '2026-10-22');
  assert.deepEqual(fcRows(t.forecast_points), [['2026-03-01', 100, 100, 0], ['2026-06-30', 100, 100, 0], ['2026-11-30', 150, 100, 50], ['2027-03-31', 230, 100, 130]]);
  assert.deepEqual(t.forecast_points.map((p) => p.date), [...new Set([...t.target_points, ...t.actual_points].map((p) => p.date))].sort());
});

/* ---------- (b) 덤프로 만든 포트폴리오 ---------- */
const HOME_DIR = H.latestHomeDir(P.ledgerDir('2026-10')), HAVE = !!HOME_DIR && H.homeAvailable(HOME_DIR);
const SKIP = !HAVE && 'HOME 원본(jsonl.gz) 없음 — Storage 에서 받거나 tools/ledger/home-dump.py';
/* (b) 는 고정값과 같은 판 덤프일 때만: 고정값 snapshot_at(그 PoC 응답과 같은 판 HOME 덤프) ≠ 원장 HOME 판 snapshot_at 이면 건너뛴다(2026-11-09 P2 — 판 숫자 대신 판 맞춤) */
const E = require('./home-era.cjs');
const SKIP_B = SKIP || (pocB.snapshot_at !== E.snapshotAt && `정답 판 ≠ 원장 판: 고정값 home-1022b snapshot_at ${pocB.snapshot_at} ≠ HOME 판 ${E.snapshotAt}`);
/* PoC 에만 있는 사업 — 2026-10-21 새 덤프(20261020T142230Z, 2026-10-20 23:22 KST)에 덤프 뒤 9·7 매핑 3곳(독산동·방화차고지·연남동)이 들어와 없다 */
const ONLY_POC = {};
/* 2026-10-22: 남는 차이(사업 id·까닭) 없음. 10-21·22 판에 있던 차이 — 부천대장 A5·A6·성남금토 A4·A2(같은 블록 계약 행의 담당자 공급 추정이 덤프 묶음에만)·
   인천부평(도시재생뉴딜) A(계약 행 PRO_0e5b…(블록 'A')가 PoC 묶음 원천)·관리 일정 precision 13곳 — 은 역추적한 규칙으로 PoC 와 같아졌다:
   ① 대표 행에 담당자 확인 완료 측정값(OFFICER_VERIFIED_SOURCE)이 있는 단계는 묶음 다른 원천 행의 측정값을 쓰지 않는다(policy-progress.js buildCohorts)
   ② 숫자 없는 영문 블록('A')도 블록 키(home-source.js blockKey) ③ 관리 일정 precision = execution_schedule.date_precision → source_precision → DAY */
const EVENT_DIFF = {};
/* 2026-10-21 W5 'HOME 기준': reference_only PLAN 사실을 일정에서 빼(policy-progress.js) 고양창릉 S-6BL 3공구(DOC_be739…)·연남동(DOC_2587…) 일정 차이가 없어졌다 */
const SCHEDULE_DIFF = {};
const REF_ONLY_DOCS = ['DOC_be739d9e407cfc85f2bc7848', 'DOC_2587e87ac1f72a71cd250383'];
/* 시군구: PoC 운영 판의 인천 행정구역 개편 표시(INCHON_DATED_ADMINISTRATIVE_NAME)를 policy-progress.js homeService 가 원장 시군구 규칙(home-source.js sggByPro)으로 대신한다.
   2026-10-21 W4: 인천서구 2곳(석남어울림·거북이기지)도 지구 이름 규칙으로 서해구가 되어 칸이 모두 같다 */

test('(b) 덤프 포트폴리오 = PoC 포트폴리오(사업·칸·사건·일정·실제 기여 원천·범위별 목표·확인·연말 예상 점이 모두 같다)', { skip: SKIP_B }, () => {
  const home = H.readHome(HOME_DIR), dump = home.snapshotAt.slice(0, 19);
  const v = PP.homeView(home);
  assert.equal(v.as_of_date, pocB.as_of_date);
  const T = new Map(pocB.portfolio_cohorts.map((c) => [c.id, c])), O = new Map(v.portfolio_cohorts.map((c) => [c.id, c]));
  assert.equal(v.portfolio_cohorts.length, pocB.portfolio_cohorts.length - Object.keys(ONLY_POC).length, 'PoC 포트폴리오 사업 수와 같다(판 숫자 177 대신 고정값에서)');
  assert.deepEqual([...T.keys()].filter((id) => !O.has(id)).sort(), Object.keys(ONLY_POC).sort());
  assert.deepEqual([...O.keys()].filter((id) => !T.has(id)), [], '우리에만 있는 사업 없음(광교 A17 은 참조 사업 매핑 규칙으로 빠진다)');
  /* 판 숫자(77·91,849) 대신 HOME 정책 화면 정답(같은 판일 때)의 cohorts 수·호수 */
  const view = E.golden('S1-view-policy.json').doc;
  if (view) assert.deepEqual([v.cohorts.length, v.cohorts.reduce((a, c) => a + c.units, 0)], [view.cohorts.length, view.cohorts.reduce((a, c) => a + c.units, 0)], '코호트 = PoC cohorts');
  const post = (t) => t.events.some((e) => e.changed_at && e.changed_at.slice(0, 19) > dump);
  const ek = (e) => [e.stage, e.event_date, e.units, e.origin, e.status ?? '-', e.review_status ?? '-', e.inferred ?? '-', e.input_rule ?? '-', e.evidence_url ?? '-', e.source_id ?? '-'].join('|');
  const sk = (s) => [s.stage, s.due_date, s.units, s.origin, s.precision, !!s.managed_schedule, s.source_object_id ?? '-', s.source_base_date ?? '-', s.evidence_url ?? '-'].join('|');
  const same = (a, b, key) => JSON.stringify(a.map(key).sort()) === JSON.stringify(b.map(key).sort());
  const evDiff = [], scDiff = [], fieldDiff = {};
  let compared = 0;
  for (const c of v.portfolio_cohorts) {
    const t = T.get(c.id);
    for (const f of ['source_ids', 'name', 'units', 'planned_units', 'quantity_basis', 'region', 'municipality', 'municipality_id', 'program_id', 'program', 'block', 'developer', 'mapping_status', 'eligibility_status', 'evidence_url']) {
      if (JSON.stringify(c[f]) !== JSON.stringify(t[f]) && !(post(t) && ['eligibility_status', 'source_ids'].includes(f))) (fieldDiff[f] ??= []).push(c.id);
    }
    if (post(t)) continue;
    compared++;
    if (!same(c.events, t.events, ek)) evDiff.push(c.id);
    if (!same(c.schedules, t.schedules, sk)) scDiff.push(c.id);
  }
  assert.equal(compared, [...T.values()].filter((t) => O.has(t.id) && !post(t)).length, 'PoC 쪽에서 센 공통 − 덤프 뒤 변경(판 숫자 177 대신)');
  assert.ok(compared > 0);
  assert.deepEqual(evDiff.sort(), Object.keys(EVENT_DIFF).sort());
  assert.deepEqual(scDiff.sort(), Object.keys(SCHEDULE_DIFF).sort());
  assert.ok(v.portfolio_cohorts.every((c) => c.schedules.every((s) => !REF_ONLY_DOCS.includes(s.source_object_id))), 'reference_only 근거 연결 사실은 일정이 아니다');
  for (const k of Object.keys(fieldDiff)) fieldDiff[k].sort();
  assert.deepEqual(fieldDiff, {}, '칸이 모두 같다 — 인천부평(도시재생뉴딜) A 묶음 원천도 같아졌다(2026-10-22, 실제 기여 원천 221)');
  assert.equal(new Set(v.portfolio_cohorts.flatMap((c) => c.source_ids)).size, new Set(pocB.portfolio_cohorts.flatMap((c) => c.source_ids)).size, 'HOME 실제 기여 원천 수 = PoC 포트폴리오 묶음 원천 수(판 숫자 221 대신)');
  /* 범위별 tracking(목표·확인·연말 예상 점)도 PoC 포트폴리오로 만든 것과 같다(PoC 포트폴리오 → PoC tracking 은 (a)·(a′)) */
  const fromPoc = PP.portfolioComparisons(pocB.portfolio_cohorts, pocB.as_of_date), pts = (t) => ['target_points', 'actual_points', 'forecast_points'].map((f) => t[f].map(({ evidence_urls, ...p }) => p));
  for (const [k, sc] of Object.entries(fromPoc)) for (const m of METRICS) assert.deepEqual(pts(v.portfolio_comparisons[k].metrics[m].tracking), pts(sc.metrics[m].tracking), `${k} ${m}`);
  /* 담당자 이름은 고정값에 없다 */
  const text = fs.readFileSync(FIX, 'utf8');
  for (const n of H.officerTerms(home.kinds).names) assert.ok(!text.includes(n), '고정값에 담당자 이름');
});
