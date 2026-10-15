'use strict';
// 지역 공급(/region)·요구사항 충족(/sources ①) 자료 — tools/ledger/region-supply.js · tools/ledger/requirements.js · lib/board/region.ts · lib/board/requirements.ts.
// 결정적 출력, 서울·인천·경기 HOME 통계 2022~2025 = 통계누리, 판정 규칙, 동네 여건 범위, 담당자 실명·입력 사유 0건.
// HOME 판 원본(jsonl.gz)은 저장소에 없어(gitignore) 원본으로 다시 만들어 맞춰 보는 시험은 원본이 있을 때만 돈다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const RS = require('../../tools/ledger/region-supply.js');
const RQ = require('../../tools/ledger/requirements.js');
const R = require('../../lib/board/region.ts');
const Q = require('../../lib/board/requirements.ts');
const A = require('../../lib/board/annual.ts');
const P = require('../../tools/ledger/paths.js');
const H = require('../../tools/ledger/home-source.js');
const calendar = require('../../data/board/region-calendar.json');
const regionMap = require('../../data/board/region-map.json');
const annual = require('../../data/board/region-annual.json');
const reqs = require('../../data/board/requirements.json');
const facts = require('../../data/board/area-facts.json');
const molit = require('../../data/board/molit.json');
const pp = require('../../data/board/policy-progress.json');

const OUTS = ['data/board/region-calendar.json', 'data/board/region-map.json', 'data/board/region-annual.json', 'data/board/requirements.json'];
const homeDir = H.latestHomeDir(P.ledgerDir(P.latestMonth()));
const raw = !!homeDir && H.homeAvailable(homeDir);

/* ---------- 생성기 결정성 ---------- */
test('buildCalendar: 입력 행 순서가 달라도 같은 결과(정렬), 종류마다 현재 예정 하나·실제가 있는 종류는 뺀다·12개월 밖은 뺀다', () => {
  const tables = {
    areas: [{ level: 'SGG', area_code: '41113', area_name: '경기도 수원시 권선구' }],
    sources: [{ source_ref: 'a', data_as_of: '2026-10-01' }, { source_ref: 'b', data_as_of: '2026-09-01' }],
    projects: [
      { local_project_id: 'P1', sgg_code: '41113', issued_at: '2026-10-01', source_ref: 'home-dump-x', project_name: '가' },
      { local_project_id: 'P2', sgg_code: '41113', issued_at: null, source_ref: 'b', project_name: '나' },
      { local_project_id: 'P3', sgg_code: '41113', issued_at: null, source_ref: 'b', project_name: '다', superseded_by: 'P1' },
    ],
    events: [
      { local_project_id: 'P1', event_type: 'COMPLETION', date_type: 'PLANNED', plan_basis: 'CURRENT', event_month: '2027-02', source_ref: 'b' },
      { local_project_id: 'P1', event_type: 'COMPLETION', date_type: 'PLANNED', plan_basis: 'CURRENT', event_date: '2027-01-05', source_ref: 'a' },
      { local_project_id: 'P1', event_type: 'MOVE_IN', date_type: 'PLANNED', plan_basis: 'CURRENT', event_month: '2027-11', source_ref: 'a' },   // 12개월 밖
      { local_project_id: 'P2', event_type: 'SUPPLY_NOTICE', date_type: 'PLANNED', plan_basis: 'CURRENT', event_month: '2026-12', source_ref: 'b' },
      { local_project_id: 'P2', event_type: 'SUPPLY_NOTICE', date_type: 'ACTUAL', event_month: '2026-09', source_ref: 'b' },   // 이미 모집 → 뺀다
      { local_project_id: 'P3', event_type: 'COMPLETION', date_type: 'PLANNED', plan_basis: 'CURRENT', event_month: '2026-11', source_ref: 'b' },   // 대체된 사업
    ],
  };
  const map = { P1: { name: '가 A1', units: 300 } };
  const a = RS.buildCalendar(tables, map, '2026-10');
  const shuffled = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, [...v].reverse()]));
  assert.deepEqual(RS.buildCalendar(shuffled, map, '2026-10'), a);
  assert.deepEqual(a.months, ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07', '2027-08', '2027-09']);
  assert.deepEqual(a.sido['41'].map((e) => [e.id, e.type, e.ym, e.day, e.units, e.drawer]), [['P1', 'COMPLETION', '2027-01', '2027-01-05', 300, true]], '기준일이 늦은 원천의 예정이 이긴다');
});

test('buildMap: 결정적이고 경계 경로는 줄인 상대 좌표, 시도 보기 상자는 서울·인천·경기', () => {
  const sq = (x, y, d) => ({ type: 'Polygon', coordinates: [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]] });
  const munis = [
    { region: '경기도', name: '가시', admin_codes: ['41111'], longitude: 127, latitude: 37.3, geometry: sq(127, 37.3, 0.1) },
    { region: '서울특별시', name: '나구', admin_codes: ['11110'], longitude: 126.9, latitude: 37.5, geometry: sq(126.9, 37.5, 0.05) },
  ];
  const a = RS.buildMap(munis, [{ name: '지구', geometry: sq(127.01, 37.31, 0.01) }]);
  assert.deepEqual(RS.buildMap([...munis].reverse(), [{ name: '지구', geometry: sq(127.01, 37.31, 0.01) }]).doc, a.doc);
  assert.deepEqual(Object.keys(a.doc.view), ['11', '41']);
  assert.match(a.doc.sgg[0].d, /^M-?\d+ -?\d+l(-?\d+ -?\d+ ?)+z$/);
});

test('커밋된 지역 공급·요구사항 자료는 원본으로 다시 만든 것과 바이트까지 같다', { skip: !raw && 'HOME 판 원본(jsonl.gz) 없음' }, () => {
  const out = RS.build();
  assert.equal(read(OUTS[0]), JSON.stringify(out.calendar) + '\n');
  assert.equal(read(OUTS[1]), JSON.stringify(out.map) + '\n');
  assert.equal(read(OUTS[2]), JSON.stringify(out.annual) + '\n');
  assert.equal(read(OUTS[3]), JSON.stringify(RQ.build()) + '\n');
});

/* ---------- 앞으로 12개월·지도 ---------- */
test('region-calendar: 12개월 안의 예정만, 위치(점)는 서울·인천·경기만 · 지도 자료는 100 KB 이하', () => {
  assert.equal(calendar.months.length, 12);
  assert.equal(calendar.from, calendar.observedMonth);
  for (const [sd, list] of Object.entries(calendar.sido)) for (const e of list) {
    assert.ok(calendar.months.includes(e.ym), `${e.id} ${e.ym}`);
    assert.ok(R.CAL_KINDS.includes(e.type));
    assert.equal(!!e.pt, R.METRO.includes(sd), `${e.id}: 점은 서울·인천·경기만`);
    if (e.pt) assert.ok(Object.keys(R.LOC_NAME).includes(e.loc), `${e.id}: 위치 근거`);
  }
  assert.deepEqual(Object.keys(regionMap.view), ['11', '28', '41']);
  assert.deepEqual(['11', '28', '41'].map((s) => regionMap.sgg.filter((g) => g.s === s).length), [25, 11, 31], '서울 25 · 인천 11 · 경기 31');
  assert.ok(fs.statSync(path.join(ROOT, OUTS[1])).size <= 100 * 1024);
});

test('lib/board/region: 종류 칩(마지막 하나는 못 끔)·고른 달(예정 없는 달이면 첫 예정 달)·전국 합치기', () => {
  assert.deepEqual(R.parseKinds(undefined), ['COMPLETION'], '기본 = 준공만(대표 숫자, 2026-10-15 결정)');
  assert.deepEqual(R.parseKinds('SUPPLY_NOTICE,COMPLETION,MOVE_IN'), R.CAL_KINDS);
  assert.deepEqual(R.parseKinds('MOVE_IN,x,SUPPLY_NOTICE'), ['SUPPLY_NOTICE', 'MOVE_IN']);
  assert.deepEqual(R.toggleKind(['COMPLETION'], 'MOVE_IN'), ['COMPLETION', 'MOVE_IN']);
  assert.equal(R.toggleKind(['COMPLETION'], 'COMPLETION'), null);
  const months = calendar.months;
  assert.equal(R.pickMonth(months, [{ ym: months[3] }], months[0]), months[3]);
  assert.equal(R.pickMonth(months, [{ ym: months[3] }, { ym: months[5] }], months[5]), months[5]);
  assert.equal(R.pickMonth(months, [], 'x'), months[0]);
  const names = Object.fromEntries(molit.sido.map((s) => [s.code, s.name]));
  const nation = R.aheadAll(calendar, '', (c) => names[c]);
  assert.equal(nation.length, Object.values(calendar.sido).flat().length);
  assert.equal(new Set(nation.map((e) => e.k)).size, nation.length, '사업|종류 열쇠는 겹치지 않는다');
  const gg = R.aheadAll(calendar, '41', (c) => names[c]);
  assert.ok(gg.every((e) => !e.place.startsWith('경기')), '시도 보기는 시도 이름을 뺀다');
  assert.equal(R.placeLabel('경기도 수원시 권선구', '경기', false), '경기 수원시 권선구');
});

/* ---------- 지난 공급 실적 ---------- */
test('서울·인천·경기 HOME 통계 2022~2025 는 통계누리(molit.json)와 같다 — 그래서 2018~2021 을 앞에 이어도 된다', () => {
  const sumYear = (months, arr, y) => months.reduce((s, m, i) => s + (m.startsWith(String(y)) && arr[i] != null ? arr[i] : 0), 0);
  for (const code of R.METRO) for (const y of [2022, 2023, 2024, 2025]) {
    for (const m of ['start', 'sale', 'complete']) assert.equal(sumYear(annual.months, annual.series[m][code], y), sumYear(molit.months, molit.metrics[m].series[code].total, y), `${code} ${m} ${y}`);
    assert.equal(annual.permitYearly[code][String(y)], sumYear(molit.months, molit.metrics.permit.series[code].total, y), `${code} permit ${y}`);
  }
  for (const code of R.METRO) for (const y of [2018, 2019, 2020, 2021]) for (const m of ['start', 'sale', 'complete']) assert.equal(annual.series[m][code].filter((v, i) => annual.months[i].startsWith(String(y)) && v != null).length, 12, `${code} ${m} ${y} 12개월`);
});

test('regionYears: 서울·인천·경기는 2018 부터(2018~2021 완결), 전국·다른 시도는 2022 부터 = annualSeries', () => {
  for (const m of ['permit', 'start', 'sale', 'complete']) {
    const gg = R.regionYears(molit, annual, m, '41');
    assert.equal(gg.spliced, true);
    assert.deepEqual(gg.years.slice(0, 4).map((y) => [y.year, y.complete]), [[2018, true], [2019, true], [2020, true], [2021, true]], m);
    for (const code of ['', '26']) {
      const r = R.regionYears(molit, annual, m, code);
      assert.equal(r.spliced, false);
      assert.deepEqual(r.years, A.annualSeries(molit, m, code || '00').filter((y) => y.year >= 2022), `${m} ${code}`);
    }
  }
});

/* ---------- 동네 여건 범위 ---------- */
test('동네 여건은 서울·인천·경기만 그리고, 다른 시도·전국은 블록 없이 한 줄', () => {
  assert.deepEqual(Object.keys(facts.sido), ['11', '28', '41']);
  const page = read('app/(dashboard)/region/page.tsx');
  assert.match(page, /\{sido && facts\.sido\[sido\] \? <Cond /);
  assert.match(page, /인구·주택 재고·미분양은 시도를 고르면 보입니다/, '수도권·전국·다른 시도는 막다른 꼬리말 대신 시도 고르기 링크');
  assert.match(read('components/region/Cond.tsx'), /if \(!c\) return null;/);
});

/* ---------- 요구사항 판정 ---------- */
const M0 = { base: 100, refYear: 2026, refMonth: '09', pairCells: 0, plan: 0, anyPlan: 0, supplyOrMoveInPlan: 0, stageCells: 0, stageCellsTotal: 500, locPrecise: 0, agencyKnown: 0, sourced: 0, judged: 0, baselineRows: 0, baselineProjects: 0, ledgerBaseline: 0, causes: 0, scenarios: 0, agencyTargets: 0, policySidos: 0, sidoTotal: 16, ledgerProjects: 0, failedSources: 0 };
test('judge: 규칙 경계(충족·부분·없음)', () => {
  const v = (patch) => Object.fromEntries(Object.entries(RQ.judge({ ...M0, ...patch })).map(([k, x]) => [k, x.verdict]));
  assert.ok(Object.values(v({})).every((x) => x === 'none'), '아무것도 없으면 모두 없음');
  assert.equal(v({ pairCells: 6 })['F-02'], 'met'); assert.equal(v({ pairCells: 4 })['F-02'], 'part');
  assert.equal(v({ stageCells: 400 })['F-03'], 'met'); assert.equal(v({ stageCells: 399 })['F-03'], 'part');
  assert.equal(v({ plan: 95 })['F-04'], 'met'); assert.equal(v({ plan: 50 })['F-04'], 'part'); assert.equal(v({ plan: 49 })['F-04'], 'none');
  assert.equal(v({ baselineProjects: 1 })['F-06'], 'part', '담당자 기준선이 있으면 부분');
  assert.equal(v({ supplyOrMoveInPlan: 80 })['F-09'], 'met');
  assert.equal(v({ sourced: 100 })['F-10'], 'met'); assert.equal(v({ sourced: 99 })['F-10'], 'part');
  assert.equal(v({ policySidos: 16, ledgerProjects: 1 })['F-01'], 'met'); assert.equal(v({ policySidos: 3, ledgerProjects: 1 })['F-01'], 'part');
});

test('requirements.json: F-01~F-12, 화면은 새 구조(사업·지역 공급·데이터 원본), 9·7 같은 칸 수는 policy-progress 와 같다', () => {
  assert.deepEqual(reqs.items.map((r) => r.id), Array.from({ length: 12 }, (_, i) => `F-${String(i + 1).padStart(2, '0')}`));
  for (const r of reqs.items) {
    assert.ok(['met', 'part', 'none'].includes(r.verdict), r.id);
    assert.ok(r.metric && r.tip && r.title && r.priority && r.items.length, r.id);
    assert.ok(r.screens.every((s) => ['projects', 'region', 'sources'].includes(s)), r.id);
    for (const d of r.dates) assert.ok(reqs.directives.some((x) => x.date === d), `${r.id} 지시 ${d}`);
  }
  const p = pp.policies.find((x) => x.policyId === 'POL_2025_0907'), y = Number(pp.referenceMonthEnd.slice(0, 4));
  const pairs = Object.values(p.stages).filter((st) => { const s = st.samePeriod.find((q) => q.year === y); return s && s.target != null && s.actual != null; }).length;
  assert.equal(reqs.measures.pairCells, pairs);
  assert.equal(reqs.items.find((r) => r.id === 'F-06').verdict, reqs.measures.baselineProjects > 0 ? 'part' : 'none');
  assert.deepEqual(Q.reqsFor(reqs, 'region').map((r) => r.id), ['F-01', 'F-05', 'F-09']);
  assert.deepEqual(Q.reqsFor(reqs, 'sources').map((r) => r.id), ['F-10']);
  assert.match(Q.tagTitle(reqs, reqs.items[1]), /^F-02 .+\(필수\) · 지시 2026\.08\.14 .+ · 판정 /);
});

test('요구사항 꼬리표는 /sources#F-xx 로 가고, 데이터 원본 ① 표의 행에 같은 id 가 있으며 :target 으로 강조한다', () => {
  assert.match(read('components/ReqTags.tsx'), /href=\{`\/sources#\$\{r\.id\}`\}/);
  const t = read('components/sources/Requirements.tsx');
  assert.match(t, /<TableRow key=\{r\.id\} id=\{r\.id\} className=\{`scroll-mt-24 target:outline-2/);
  const page = read('app/(dashboard)/sources/page.tsx'), at = (k) => page.indexOf(k);
  assert.ok(at('<Requirements ') < at('<Collect ') && at('<Collect ') < at('<Coverage ') && at('<Coverage ') < at('<Links ') && at('<Links ') < at('<Fold title="원천 카탈로그"') && at('<Fold title="원천 카탈로그"') < at('id="stage-links"'), '①~④ 다음 맨 아래 접힌 원천 카탈로그');
});

/* ---------- 공개 저장소: 담당자 실명·입력 사유 0건 ---------- */
test('산출물에 담당자 칸(actor·reason)이 없다', () => {
  for (const f of OUTS) assert.doesNotMatch(read(f), /"(actor|actor_basis|reason|change_reason|responsible_org)"\s*:/, f);
});
test('산출물에 HOME 원본의 담당자 이름·입력 사유 원문이 0건이다', { skip: !raw && 'HOME 판 원본(jsonl.gz) 없음' }, () => {
  const t = H.officerTerms(H.readHome(homeDir).kinds);
  assert.ok(t.names.length > 0, '원본에 담당자 입력이 있다(시험이 빈 목록으로 통과하지 않게)');
  for (const f of [...OUTS, 'data/board/area-facts.json', 'data/board/home-sources.json']) {
    const s = read(f);
    assert.deepEqual(t.names.filter((n) => s.includes(n)), [], `${f}: 이름`);
    assert.deepEqual([...t.reasons].filter((r) => s.includes(r)), [], `${f}: 사유`);
  }
});
