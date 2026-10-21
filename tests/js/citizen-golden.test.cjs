'use strict';
// 일반사용자 화면(/citizen · /citizen/projects · /citizen/schedule)의 숫자를 HOME PoC 정답(기준일 2026-10-20 '정책 전체' — /map/dashboard 정책 필터 없음)과 대조한다.
// 정답: .cache/home-parity/golden/golden-projects.json(poc_overview_all) · S2-raw-map-dashboard.json(시도 groups.region · 시군구 municipalities). 정답 파일이 없으면 건너뛴다.
// /citizen 값은 빌드 결과(docs/design/대국민-모드-시안.html)의 D(build_data.py hp)를 화면과 같은 함수(sumOf·stageSums·yearSums·unitsFor)로 읽는다.
// 남는 차이는 EXPLAINED(PRO_ id · 이유)에 적힌 것뿐이어야 한다 — 설명 못 하는 차이는 0.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const GOLD = path.join(ROOT, '.cache/home-parity/golden');
const has = fs.existsSync(path.join(GOLD, 'golden-projects.json')) && fs.existsSync(path.join(GOLD, 'S2-raw-map-dashboard.json'));
const skip = !has && '정답 파일(.cache/home-parity/golden) 없음';
const golden = has ? JSON.parse(fs.readFileSync(path.join(GOLD, 'golden-projects.json'), 'utf8')).poc_overview_all : null;
const dash = has ? JSON.parse(fs.readFileSync(path.join(GOLD, 'S2-raw-map-dashboard.json'), 'utf8')) : null;

const BUILT = fs.readFileSync(path.join(ROOT, 'docs', 'design', '대국민-모드-시안.html'), 'utf8');
const code = [...BUILT.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((c) => c.includes('function makeSearch'));
const ctx = {}; vm.createContext(ctx);
vm.runInContext(code + '\nObject.assign(this, { D, makeSearch, sumOf, unitsFor, stageSums, yearSums, STAGE6 });', ctx);
const D = ctx.D, IX = ctx.makeSearch(D);
const home = require('../../data/board/home-projects.json');
const cal = require('../../data/board/region-calendar.json');
const PV = require('../../lib/board/projects-view.ts');
const PL = require('../../lib/board/public-labels.ts');

const SD = { 서울특별시: '11', 인천광역시: '28', 경기도: '41' };
const METRO = ['11', '28', '41'];
/* PoC 7칸 → 일반사용자 6칸(build_data.py hp · 머리 주석과 같은 표): 계획 = 정책 + 사업화 + 단계 미확인 · 인허가 · 착공 = 건설(준공 포함) · 모집 = 공급 · 준공 0 · 입주 */
const SIX = (p) => [p.POLICY + p.BUSINESS + p.UNKNOWN, p.APPROVAL, p.CONSTRUCTION, p.SUPPLY, 0, p.MOVE_IN];
/* 설명된 잔차: { 어디: [PRO_ id …, 이유] }. 2026-10-21 대조에서 남은 차이 0 — 다음 덤프·스냅샷에서 차이가 나면 여기에 PRO_ id 와 이유를 적는다 */
const EXPLAINED = {};
const metro = (f) => METRO.reduce((a, sd) => { const v = f(sd); return Array.isArray(v) ? (a || v.map(() => 0)).map((x, i) => x + v[i]) : (a || 0) + v; }, null);

test('C01 큰 숫자 공급 예정 호수(수도권) = PoC 정책 전체 집계 호수 − 입주(지금 PoC 입주 0 → 289,336) · 사업 수 = PoC 행 443', { skip }, () => {
  const u = metro((sd) => ctx.sumOf(D, IX.regionOf[sd].codes).u), n = metro((sd) => ctx.sumOf(D, IX.regionOf[sd].codes).n);
  assert.equal(u, golden['summary.target_units'] - golden['summary.stage_distribution'].parts.MOVE_IN);
  assert.equal(u, 289336);
  assert.equal(n, golden['summary.project_count']);
  /* 집계 346행 = 물량 있는 집계 대상 행(56 중복·모호 제외 · 41 물량 없음) — 자료 층 home-projects views.all 과 같다 */
  assert.equal(home.views.all.counted, golden['summary.target_counted_projects']); assert.equal(home.views.all.excluded, golden['summary.target_excluded_projects']); assert.equal(home.views.all.missing, golden['summary.target_missing_projects']);
});

test('C01 시도 큰 숫자·사업 수 = PoC groups.region(시군구 미연결 행 포함)', { skip }, () => {
  for (const g of dash.groups.region) {
    const s = ctx.sumOf(D, IX.regionOf[SD[g.name]].codes);
    assert.deepEqual([s.u, s.n], [g.target_units - g.stage_distribution.parts.MOVE_IN, g.project_count], g.name);
  }
});

test('C04 지도 면·순위(시군구) = PoC municipalities(정책 전체 59곳 — 경기 구가 있는 시는 시 하나), 상위 7', { skip }, () => {
  const U = Object.fromEntries(METRO.flatMap((sd) => ctx.unitsFor(D, IX, sd)).map((x) => [x.key, x]));
  const bad = [];
  for (const m of dash.municipalities.filter((x) => x.project_count)) {
    const key = m.admin_codes.length > 1 ? m.admin_codes[0].slice(0, 4) + '0' : m.admin_codes[0], x = U[key];
    if (!x || x.u !== (m.target_units ?? 0) || x.n !== m.project_count) bad.push(`${m.region} ${m.name} PoC ${m.project_count}행 ${m.target_units} · 우리 ${x?.n}행 ${x?.u}`);
  }
  assert.deepEqual(bad.filter((b) => !EXPLAINED[b]), []);
  /* 면에 PoC 시군구가 없는 곳은 0(사업 없음) */
  const pocKeys = new Set(dash.municipalities.filter((x) => x.project_count).map((m) => (m.admin_codes.length > 1 ? m.admin_codes[0].slice(0, 4) + '0' : m.admin_codes[0])));
  for (const x of Object.values(U)) if (!pocKeys.has(x.key)) assert.deepEqual([x.u, x.n], [0, 0], x.name);
  const top = Object.values(U).sort((a, b) => b.u - a.u).slice(0, 7).map((x) => [x.name, x.u]);
  const want = dash.municipalities.filter((x) => x.project_count).sort((a, b) => (b.target_units ?? 0) - (a.target_units ?? 0)).slice(0, 7).map((m) => [m.name, m.target_units]);
  assert.deepEqual(top, want);
  console.log('  상위 7:', top.map(([n, u]) => `${n} ${u.toLocaleString('en-US')}`).join(' · '));
});

test('C02 단계 6줄(우리 이름 계획·인허가·착공·모집·준공·입주) = PoC stage_distribution.parts 대응, 앞 넷 합 = 큰 숫자 — 수도권·시도', { skip }, () => {
  assert.deepEqual([...ctx.STAGE6], ['계획', '인허가', '착공', '모집', '준공', '입주']);
  const S = metro((sd) => [...ctx.stageSums(D, IX.regionOf[sd].codes)]);
  assert.deepEqual(S, SIX(golden['summary.stage_distribution'].parts));
  assert.equal(S[0] + S[1] + S[2] + S[3], metro((sd) => ctx.sumOf(D, IX.regionOf[sd].codes).u));
  for (const g of dash.groups.region) assert.deepEqual([...ctx.stageSums(D, IX.regionOf[SD[g.name]].codes)], SIX(g.stage_distribution.parts), g.name);
  /* 지도 면(시군구) 단계 값 = PoC 시군구 stage_distribution(build_data.py 가 블록 → 시군구 → 시도로 나눠 담은 합) */
  for (const m of dash.municipalities.filter((x) => x.project_count)) {
    const key = m.admin_codes.length > 1 ? m.admin_codes[0].slice(0, 4) + '0' : m.admin_codes[0], r = IX.regionOf[key];
    assert.deepEqual([...ctx.stageSums(D, r.codes)], SIX(m.stage_distribution.parts), m.name);
  }
  console.log('  수도권 6줄:', S.join(' · '));
});

test('C03 해 모드 = PoC 향후 12개월 공급(모집·분양) 예정의 해(2026·2027) + 연도 미정, 합 = 큰 숫자 · 12개월 합 = 공급 일정(region-calendar home.all)', { skip }, () => {
  const Y = metro((sd) => [...ctx.yearSums(D, IX.regionOf[sd].codes)]);
  assert.equal(Y.reduce((a, b) => a + b, 0), 289336);
  assert.equal(Y.slice(0, 6).reduce((a, b) => a + b, 0), cal.home.all.total, '12개월 공급 예정 = /citizen/schedule 모집 공고 합');
  assert.equal(cal.home.all.total, home.views.all.upcoming.units);
  console.log('  해 칸:', Y.join(' · '));
});

test('CP02 /citizen/projects 목록 = PoC 정책 전체 수도권 행(443) · 집계 호수 합 289,336 · 단계 거르기 = 일반사용자 이름', { skip }, () => {
  const rows = PV.homeRowsOf(home.rows).filter((r) => PV.isMetro(r.sgg));
  assert.equal(rows.length, golden['summary.project_count']);
  assert.equal(rows.reduce((s, r) => s + (r.home.counted ?? 0), 0), golden['summary.target_units']);
  assert.deepEqual([...PL.PUBLIC_OF_HOME].map((i) => PL.STAGE_NAME[i]), ['계획', '계획', '인허가', '착공', '모집', '입주'], 'PoC 정책·사업화·인허가·건설·공급·입주 → 우리 이름');
  const dup = rows.filter((r) => !r.home.chart.all && (r.units ?? 0) > 0).length;
  assert.equal(dup, golden['summary.target_excluded_projects'], '겹쳐서 뺀 행(합계에서 뺌) = PoC 중복·모호 제외');
});

test('CP08·C10 예정 대비 = PoC 판정(지연·주의만 사실 문장) — 대상 = PoC 지연 행', { skip }, () => {
  const rows = PV.homeRowsOf(home.rows).filter((r) => PV.isMetro(r.sgg));
  const late = rows.filter((r) => PL.homeFact(r.cls, r.home.gap, null)).map((r) => r.id).sort();
  assert.deepEqual(late, home.rows.filter((r) => r.stats && ['DELAYED', 'WARNING'].includes(r.judge?.status)).map((r) => r.id).sort());
  assert.equal(PL.homeFact('delay', 291, null), '예정보다 291호가 아직 확인되지 않았어요');
  assert.equal(PL.homeFact('delay', 291, { eventType: 'COMPLETION', months: 3 }), '준공 예정일이 3개월 지났어요');
  assert.equal(PL.homeFact('ok', 0, { eventType: 'COMPLETION', months: 3 }), '', '우리 원장이 주의여도 PoC 정상이면 빈칸');
  console.log(`  PoC 지연·주의 ${late.length}행: ${late.join(' · ')}`);
});

test('CS /citizen/schedule 사업 수 = 사업 찾기와 같은 PoC 행, 기본 종류 = 모집 공고(PoC 공급 예정)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'app/(dashboard)/citizen/schedule/page.tsx'), 'utf8');
  assert.match(src, /const inScope = applyFilters\(HOME_ROWS, pf\)\.length;/);
  assert.match(src, /const kinds = q\.kind \? parseKinds\(q\.kind\) : \[\.\.\.KIND_HOME\];/);
  assert.match(src, /calendar\.home\.all\.sido\[c\]/);
});
