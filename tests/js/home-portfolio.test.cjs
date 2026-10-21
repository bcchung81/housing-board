'use strict';
// 9·7 포트폴리오(HOME portfolio_cohorts)와 범위별 tracking(portfolio_comparisons[범위].metrics[지표].tracking) — tools/ledger/policy-progress.js 의 HOME 2038810 이식.
// (a) 계산 층: PoC 응답(as_of 2026-10-20)의 portfolio_cohorts 를 넣으면 PoC 의 tracking 점과 완전히 같다(정책 전체·시도 3·시군구 42·프로그램 31 + 프로그램×시도 29·×시군구 96, 지표 6).
//     고정값 tests/fixtures/home-1020/portfolio-view.json = PoC GET /policy-delivery/view?as_of_date=2026-10-20&group=policy&scope=policy(+ 프로그램 화면 30개)에서
//     tracking·대조에 쓰는 칸만 잘라 넣은 것(담당자 이름·사유·배치 id·근거 글 칸은 뺐다). 점 목록은 {cols, rows}, evidence_urls 는 urls 번호로 접었다 — 여기서 다시 편다.
// (b) 덤프로 만든 포트폴리오(HOME 덤프가 있을 때만 — 2026-10-22 부터 20261021T212310Z): PoC 와 같은 사업·같은 칸. 남는 차이는 아래 허용 목록(사업 id·까닭)뿐이어야 한다.
//     고정값 tests/fixtures/home-1022/portfolio-cohorts.json = PoC GET /policy-delivery/view?as_of_date=2026-10-22 의 portfolio_cohorts 를 (a) 고정값과 같은 칸으로 자른 것(덤프와 같은 기준일 — 2026-10-22 재이관).
//     덤프 뒤 변경 판정: PoC 사건에 changed_at > 덤프 시각(2026-10-19T21:22:47Z)이 있는 사업은 사건·일정 대조에서 뺀다(담당자 입력 74건 등). 일정에는 changed_at 이 없어 일정 차이는 근거를 보고 허용 목록에 적었다.
// (a′) 연말 예상(tracking.forecast_points — 2026-10-22 HOME 운영 판): 고정값 tests/fixtures/home-1022/forecast-policy.json = 같은 PoC 응답의 forecast_points 숫자(정책 범위 전체 점 + 47 범위 연말 점).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PP = require('../../tools/ledger/policy-progress');
const H = require('../../tools/ledger/home-source');
const P = require('../../tools/ledger/paths');

const FIX = path.join(__dirname, '..', 'fixtures', 'home-1020', 'portfolio-view.json');
const FIX_B = path.join(__dirname, '..', 'fixtures', 'home-1022', 'portfolio-cohorts.json');   // (b) 덤프 대조용 — 덤프 판과 같은 기준일의 PoC 포트폴리오
const pocB = JSON.parse(fs.readFileSync(FIX_B, 'utf8'));
const poc = JSON.parse(fs.readFileSync(FIX, 'utf8'));
const unpack = ({ cols, rows }) => rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, c === 'evidence_urls' ? r[i].map((k) => poc.urls[k]) : r[i]])));
const expected = Object.fromEntries(Object.entries(poc.expected).map(([k, v]) => [k, { ...v,
  metrics: Object.fromEntries(Object.entries(v.metrics).map(([m, t]) => [m, { ...t, target_points: unpack(t.target_points), actual_points: unpack(t.actual_points) }])) }]));
const METRICS = ['CONSTRUCTION', 'SUPPLY', 'BUSINESS', 'APPROVAL', 'COMPLETION', 'MOVE_IN'];

test('(a) PoC 포트폴리오 → 범위별 tracking 이 PoC portfolio_comparisons 와 완전히 같다(202 범위 × 6 지표)', () => {
  const mine = PP.portfolioComparisons(poc.portfolio_cohorts, poc.as_of_date, { programs: poc.programs });
  assert.deepEqual(Object.keys(mine).sort(), Object.keys(expected).sort(), '범위 키가 같다(사업 없는 프로그램은 programs 로 들어온다)');
  const kinds = {};
  for (const [k, v] of Object.entries(expected)) kinds[v.kind] = (kinds[v.kind] ?? 0) + 1;
  assert.deepEqual(kinds, { policy: 1, region: 3, city: 42, program: 31, program_region: 29, program_city: 96 });
  let n = 0;
  for (const [k, v] of Object.entries(expected)) {
    assert.deepEqual([mine[k].name, mine[k].kind], [v.name, v.kind], k);
    assert.deepEqual(Object.keys(mine[k].metrics), METRICS, k);
    for (const m of METRICS) { const { forecast_points, ...t } = mine[k].metrics[m].tracking; assert.deepStrictEqual(t, v.metrics[m], `${k} ${m}`); n++; }   // 10-20 응답에는 forecast_points 가 없었다((a′))
  }
  assert.equal(n, 1212);
  /* 정책 전체 공급: 누적 58,541호(2026-10-19) — 담당자 입력 53,160 · 추정 50,587 포함 */
  assert.deepEqual(PP.trackingOf(poc.portfolio_cohorts, 'SUPPLY', poc.as_of_date).actual_points.at(-1),
    { date: '2026-10-19', units: 58541, confirmed_units: 58541, policy_confirmed_units: 58541, review_units: 0, origin: 'SOURCE_OR_MANUAL', manual_units: 53160, inferred_units: 50587,
      evidence_urls: ['https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?aisTpCd=10&ccrCnntSysDsCd=03&mi=1026&panId=2015122300020925&uppAisTpCd=06'] });
});

test('(a) tracking 규칙: 후속 단계 사건도 그 단계 도달 · 목표는 1900-01-01 부터 · 사업 수는 범위 사업 수', () => {
  const c = { id: 'p', units: 100, mapping_status: 'CONFIRMED', events: [{ stage: 'SUPPLY', event_date: '2020-05-01', units: 60, origin: 'MANUAL', inferred: true }, { stage: 'MOVE_IN', event_date: '2021-01-01', units: null, status: 'ACTUAL' }],
    schedules: [{ stage: 'APPROVAL', due_date: '1999-12-31', units: 100, origin: 'SOURCE', source_object_id: 's' }] };
  const t = PP.trackingOf([c], 'APPROVAL', '2026-10-20');
  assert.deepEqual(t.actual_points.map((p) => [p.date, p.units, p.manual_units, p.inferred_units]), [['2020-05-01', 60, 60, 60], ['2021-01-01', 100, 60, 60]]);
  assert.deepEqual(t.target_points.map((p) => [p.date, p.units, p.origin]), [['1999-12-31', 100, 'SOURCE']]);
  assert.equal(t.project_count, 1);
  assert.deepEqual(PP.stageEvents([c], 'APPROVAL', '2026-10-20').points, [], '우리 문서용(같은 단계만)은 후속 단계를 세지 않는다');
});

/* (a′) 연말 예상: PoC(as_of 2026-10-22) 포트폴리오 → forecast_points 가 PoC 와 같다. 날짜 = 목표 점·확인 점 날짜, 값 = 사업별 max(그 날까지 누적 도달, 그 날까지 누적 목표)의 합 */
const FC = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'home-1022', 'forecast-policy.json'), 'utf8'));
const fcRows = (pts) => pts.map((p) => [p.date, p.units, p.observed_units, p.remaining_plan_units]);
test('(a′) 연말 예상(forecast_points): PoC 2026-10-22 포트폴리오 → 정책 범위 6 지표 모든 점 · 47 범위 연말 점이 PoC 와 같다 — 착공 연말 예상 99,885호', () => {
  assert.equal(FC.as_of_date, pocB.as_of_date);
  const mine = PP.portfolioComparisons(pocB.portfolio_cohorts, pocB.as_of_date);
  for (const m of METRICS) {
    assert.deepEqual(fcRows(mine.policy.metrics[m].tracking.forecast_points), FC.policy[m], m);
    assert.ok(mine.policy.metrics[m].tracking.forecast_points.every((p) => p.basis === FC.basis));
  }
  assert.deepEqual(Object.keys(mine).filter((k) => !k.startsWith('program:')).sort(), Object.keys(FC.yearEnd).filter((k) => !k.startsWith('program:')).sort(), '정책·시도·시군구 범위');
  for (const [k, ms] of Object.entries(FC.yearEnd)) for (const [m, want] of Object.entries(ms)) {
    const got = (mine[k]?.metrics[m].tracking.forecast_points ?? []).filter((p) => p.date <= '2026-12-31').at(-1);
    assert.deepEqual(got ? fcRows([got])[0] : null, want, `${k} ${m}`);
  }
  assert.deepEqual(FC.policy.CONSTRUCTION.filter((p) => p[0] <= '2026-12-31').at(-1), ['2026-12-31', 99885, 82968, 16917], '덤프 안내(SCHEMA_AND_DATA_CHANGES 6절) 연말 예상 99,885 · 현재 누적 착공 82,968');
  /* 단계 카드(home-view summaryValues — PoC policy-stage-flow.js 2026-10-22 판): 연말 예상 = forecast_points 의 연말까지 마지막 점 */
  const HV = require('../../tools/ledger/home-view');
  const cards = HV.policyScreen({ as_of_date: pocB.as_of_date, target_units: 1350000, plan: { period_start: '2026-01-01', period_end: '2030-12-31' }, stages: { POLICY: '정책', BUSINESS: '사업화', APPROVAL: '인허가', CONSTRUCTION: '건설', SUPPLY: '공급', MOVE_IN: '입주' },
    portfolio_cohorts: pocB.portfolio_cohorts, portfolio_comparisons: mine }).stage_cards;
  assert.deepEqual(['BUSINESS', 'APPROVAL', 'CONSTRUCTION', 'SUPPLY', 'MOVE_IN'].map((k) => [cards[k].current, cards[k].year_end_expected]),
    [[153402, 153402], [100973, 106771], [82968, 99885], [58125, 73114], [null, 3845]]);
});
test('(a′) 연말 예상 규칙: 이미 도달한 사업은 계획보다 도달, 미도달 사업은 연말까지 계획 — 같은 사업의 실적·계획을 두 번 세지 않는다', () => {
  const c = (id, units, events, schedules) => ({ id, units, mapping_status: 'CONFIRMED', events, schedules });
  const sch = (due, units) => ({ stage: 'CONSTRUCTION', due_date: due, units, origin: 'SOURCE', source_object_id: 's' });
  const a = c('a', 100, [{ stage: 'CONSTRUCTION', event_date: '2026-03-01', units: 100 }], [sch('2026-06-30', 100)]);   // 이미 착공 — 계획과 겹침
  const b = c('b', 50, [], [sch('2026-11-30', 50)]);                                                                      // 아직 — 연말 전 계획
  const d = c('d', 80, [{ stage: 'SUPPLY', event_date: '2026-05-01', units: 30 }], [sch('2027-03-31', 80)]);             // 후속 단계 30 도달, 계획은 내년
  const t = PP.trackingOf([a, b, d], 'CONSTRUCTION', '2026-10-22');
  assert.deepEqual(fcRows(t.forecast_points), [['2026-03-01', 100, 100, 0], ['2026-05-01', 130, 130, 0], ['2026-06-30', 130, 130, 0], ['2026-11-30', 180, 130, 50], ['2027-03-31', 230, 130, 100]]);
  assert.deepEqual(t.forecast_points.map((p) => p.date), [...new Set([...t.target_points, ...t.actual_points].map((p) => p.date))].sort());
});

/* ---------- (b) 덤프로 만든 포트폴리오 ---------- */
const HOME_DIR = H.latestHomeDir(P.ledgerDir('2026-10')), HAVE = !!HOME_DIR && H.homeAvailable(HOME_DIR);
const SKIP = !HAVE && 'HOME 원본(jsonl.gz) 없음 — Storage 에서 받거나 tools/ledger/home-dump.py';
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

test('(b) 덤프 포트폴리오 = PoC 포트폴리오(사업 177·칸·사건·일정·실제 기여 원천 221·범위별 목표·확인·연말 예상 점이 모두 같다 — 2026-10-22)', { skip: SKIP }, () => {
  const home = H.readHome(HOME_DIR), dump = home.snapshotAt.slice(0, 19);
  const v = PP.homeView(home);
  assert.equal(v.as_of_date, pocB.as_of_date);
  const T = new Map(pocB.portfolio_cohorts.map((c) => [c.id, c])), O = new Map(v.portfolio_cohorts.map((c) => [c.id, c]));
  assert.equal(v.portfolio_cohorts.length, 177, 'PoC 177 과 같다(2026-10-22 새 덤프 — 부천역곡 A1·인천송림4 1 +2, 10-21 판 175)');
  assert.deepEqual([...T.keys()].filter((id) => !O.has(id)).sort(), Object.keys(ONLY_POC).sort());
  assert.deepEqual([...O.keys()].filter((id) => !T.has(id)), [], '우리에만 있는 사업 없음(광교 A17 은 참조 사업 매핑 규칙으로 빠진다)');
  assert.deepEqual([v.cohorts.length, v.cohorts.reduce((a, c) => a + c.units, 0)], [76, 91240], '코호트 76·91,240호(2026-10-22 새 덤프 — 부천역곡 A1 +1,160 · 병점복합타운 주복1 착공 2025-12-31 로 정책기간 전 −780, 10-21 판 76·90,860)');
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
  assert.equal(compared, 177, '공통 177 − 덤프 뒤 변경 0(2026-10-22 새 덤프)');
  assert.deepEqual(evDiff.sort(), Object.keys(EVENT_DIFF).sort());
  assert.deepEqual(scDiff.sort(), Object.keys(SCHEDULE_DIFF).sort());
  assert.ok(v.portfolio_cohorts.every((c) => c.schedules.every((s) => !REF_ONLY_DOCS.includes(s.source_object_id))), 'reference_only 근거 연결 사실은 일정이 아니다');
  for (const k of Object.keys(fieldDiff)) fieldDiff[k].sort();
  assert.deepEqual(fieldDiff, {}, '칸이 모두 같다 — 인천부평(도시재생뉴딜) A 묶음 원천도 같아졌다(2026-10-22, 실제 기여 원천 221)');
  assert.equal(new Set(v.portfolio_cohorts.flatMap((c) => c.source_ids)).size, 221, 'HOME 실제 기여 원천 221(덤프 안내 6절)');
  /* 범위별 tracking(목표·확인·연말 예상 점)도 PoC 포트폴리오로 만든 것과 같다(PoC 포트폴리오 → PoC tracking 은 (a)·(a′)) */
  const fromPoc = PP.portfolioComparisons(pocB.portfolio_cohorts, pocB.as_of_date), pts = (t) => ['target_points', 'actual_points', 'forecast_points'].map((f) => t[f].map(({ evidence_urls, ...p }) => p));
  for (const [k, sc] of Object.entries(fromPoc)) for (const m of METRICS) assert.deepEqual(pts(v.portfolio_comparisons[k].metrics[m].tracking), pts(sc.metrics[m].tracking), `${k} ${m}`);
  /* 담당자 이름은 고정값에 없다 */
  const text = fs.readFileSync(FIX, 'utf8') + fs.readFileSync(FIX_B, 'utf8');
  for (const n of H.officerTerms(home.kinds).names) assert.ok(!text.includes(n), '고정값에 담당자 이름');
});
