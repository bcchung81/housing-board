'use strict';
// /region·/month·/agency 의 숫자 요소를 HOME PoC 정답(.cache/home-parity/golden — 기준일 2026-10-20)과 대조한다(2026-10-21 결정: 전 화면 PoC 규칙).
//   12개월 = PoC '향후 12개월 공급 예정'(golden-policy.json policy.statistics.upcoming_12m — 9·7 기본) ↔ data/board/region-calendar.json home.p97(지역 공급·월 상세가 그리는 값)
//   기관 줄 = PoC 기관별 진행현황(policy.statistics.agencies) ↔ lib/board/home-agency.ts agencyLine(기관 화면이 그리는 값)
//   연도별 공급 = PoC #annual-supply(S2-raw-annual-supply.json · golden-projects.json annual_supply) ↔ lib/board/region.ts regionYears·metroYears(지난 공급 실적)
//   지역 지표 = golden-projects.json area ↔ data/board/area-facts.json(동네 여건)
// 정답과 다른 값은 data/board/home-projects.json residuals(PRO_ id·덤프 값·PoC 값·이유)로 모두 설명돼야 한다 — 설명 못 하는 차이는 0.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const GOLD = path.join(ROOT, '.cache/home-parity/golden');
const files = ['golden-policy.json', 'golden-projects.json', 'S2-raw-annual-supply.json'];
const has = files.every((f) => fs.existsSync(path.join(GOLD, f)));
const skip = !has && '정답 파일(.cache/home-parity/golden) 없음';
const gold = (f) => JSON.parse(fs.readFileSync(path.join(GOLD, f), 'utf8'));
const gp = has ? gold('golden-policy.json') : null, gj = has ? gold('golden-projects.json') : null, ga = has ? gold('S2-raw-annual-supply.json') : null;

const CAL = require('../../data/board/region-calendar.json');
const HP = require('../../data/board/home-projects.json');
const FACTS = require('../../data/board/area-facts.json');
const MOLIT = require('../../data/board/molit.json');
const ANNUAL = require('../../data/board/region-annual.json');
const R = require('../../lib/board/region.ts');
const MA = require('../../lib/board/month-ahead.ts');
const HA = require('../../lib/board/home-agency.ts');

const AFTER_DUMP = /^덤프 뒤 HOME/;   // home-projects.js REASON — 덤프 뒤 담당자 입력·근거 변경(다음 덤프 재이관에서 같아진다)
const res = (field) => HP.residuals.filter((r) => r.field === field);

test('12개월: 지역 공급 9·7 = PoC 향후 12개월 공급 예정 — 월별·합·사업 수, 남는 차이는 덤프 뒤 변경 사업(PRO_ id)뿐', { skip }, () => {
  const g = { total: gp['policy.statistics.upcoming_12m.total'], projects: gp['policy.statistics.upcoming_12m.projects'], months: gp['policy.statistics.upcoming_12m.months'] };
  assert.deepEqual([g.total, g.projects], [17488, 30], '정답(9·7 기본 17,488호·30사업)');
  const h = CAL.home.p97;
  assert.deepEqual(h.months.map((m) => m.ym), g.months.map((m) => m.month), '같은 12개월(기준 달 2026-10 ~ 2027-09)');
  /* 잔차: 덤프 값을 PoC 값으로 바꾸면 정답과 바이트까지 같아야 한다 */
  const rs = res('upcoming');
  assert.ok(rs.length && rs.every((r) => /^PRO_[0-9a-f]{24}$/.test(r.id) && AFTER_DUMP.test(r.why) && r.use === 'dump'), '잔차는 PRO_ id · 덤프 뒤 변경 · 값은 덤프');
  assert.deepEqual(rs.map((r) => r.id), ['PRO_9a256c5d211050be9f0814ff'], '2026-10-20 판 잔차 1사업(인천부평 도시재생뉴딜 A — 덤프 350호, PoC 0)');
  const adj = Object.fromEntries(h.months.map((m) => [m.ym, m.units]));
  for (const r of rs) { for (const [ym, u] of r.dump) adj[ym] -= u; for (const [ym, u] of r.poc) adj[ym] += u; }
  assert.deepEqual(g.months.map((m) => [m.month, adj[m.month]]), g.months.map((m) => [m.month, m.units]), '월별(잔차 바꾼 뒤)');
  const ids = new Set(h.ids);
  for (const r of rs) { if (r.dump.some(([, u]) => u > 0)) ids.delete(r.id); if (r.poc.some(([, u]) => u > 0)) ids.add(r.id); }
  assert.equal(ids.size, g.projects, '사업 수(잔차 바꾼 뒤)');
  assert.equal(h.total - rs.reduce((s, r) => s + r.dump.reduce((t, [, u]) => t + u, 0) - r.poc.reduce((t, [, u]) => t + u, 0), 0), g.total, '합(잔차 바꾼 뒤)');
  /* 화면 셈: 지역 공급(수도권) 목록 합·사업 수 = home.p97, 월 상세 그 달 = 같은 달 값 */
  const metro = R.aheadAll(h, 'metro', (c) => c);
  assert.equal(metro.reduce((s, e) => s + e.units, 0), h.total);
  assert.equal(new Set(metro.map((e) => e.pro)).size, h.projects);
  for (const m of h.months) assert.equal(MA.monthSupply(CAL, m.ym).reduce((s, e) => s + e.units, 0), m.units, `월 상세 ${m.ym}`);
  /* 정책 전체(거르기)는 9·7 을 담는다 */
  assert.ok(CAL.home.all.total >= h.total && h.ids.every((id) => CAL.home.all.ids.includes(id)));
});

test('12개월 자료 모양: 옛 sido 묶음(일반사용자 공급 일정)은 그대로, home 항목은 PRO_ id·우리 id·시군구가 있고 시군구 거르기가 된다', () => {
  for (const k of ['p97', 'all']) {
    const h = CAL.home[k];
    assert.deepEqual(Object.keys(h).sort(), ['ids', 'months', 'projects', 'sido', 'total']);
    for (const e of Object.values(h.sido).flat()) {
      assert.equal(e.type, 'SUPPLY_NOTICE'); assert.match(e.pro, /^PRO_/); assert.ok(e.units > 0); assert.equal(e.day, null);
      const row = HP.rows.find((r) => r.id === e.pro);
      assert.equal(e.id, row.ourId ?? row.id, '원장 사업 id, 없으면 PRO_');
      if (R.offLedger(e)) assert.equal(e.drawer, false);
    }
  }
  /* 시군구 거르기: 이름이 코드표에 있으면 그 코드 */
  const T = { areas: require('../../lib/board/metro-overview.ts').METRO_AREAS };
  const e = Object.values(CAL.home.p97.sido).flat().find((x) => /과천지식정보타운 S-12/.test(x.name));
  assert.equal(R.entrySgg(e, '41', T), '41290');
  assert.ok(Object.values(CAL.sido).flat().some((x) => x.type === 'COMPLETION'), '옛 원장 예정(준공·입주)은 /citizen/schedule 이 계속 쓴다');
});

test('기관 줄: 기관 화면 = PoC 기관별 진행현황 7줄 — 호수·사업 수 같음, 판정별 호수 차이는 덤프 뒤 변경 사업(PRO_ id)뿐', { skip }, () => {
  const g = gp['policy.statistics.agencies'];
  assert.deepEqual(g.map((a) => a.name), ['LH', '기관 미상', '인천도시공사', 'SH', '4)공공(LH,SH,GH)', '1)조합', 'GH']);
  const status = new Map(HP.rows.map((r) => [r.id, r.judge?.status ?? 'UNKNOWN']));
  const rs = res('judge');
  assert.ok(rs.every((r) => /^PRO_/.test(r.id) && AFTER_DUMP.test(r.why) && r.use === 'dump' && r.dump.status === status.get(r.id)));
  const fix = new Map(rs.map((r) => [r.id, r.poc.status]));
  for (const a of g) {
    const l = HA.agencyLine(HP.rows, a.name);
    assert.deepEqual([l.total, l.count], [a.total, a.count], `${a.name} 호수·사업 수`);
    const units = { DELAYED: 0, WARNING: 0, NORMAL: 0, UNKNOWN: 0 };
    for (const r of l.rows) units[fix.get(r.id) ?? status.get(r.id)] += r.units.counted ?? 0;
    assert.deepEqual(units, { DELAYED: a.DELAYED, WARNING: a.WARNING, NORMAL: a.NORMAL, UNKNOWN: a.UNKNOWN }, `${a.name} 판정별 호수(잔차 바꾼 뒤)`);
    assert.equal(Math.round(units.DELAYED / l.total * 1000) / 10, a.delayed_share_pct, `${a.name} 지연 사업 물량 비중(잔차 바꾼 뒤)`);
    assert.equal(l.delayedSharePct, a.delayed_share_pct, `${a.name} 지연 사업 물량 비중(화면 값 — 지연 호수는 잔차 없음)`);
  }
  /* 화면이 있는 기관: LH·GH·SH·iH(= 원천 '인천도시공사') */
  assert.deepEqual(HA.HOME_AGENCY, { lh: 'LH', gh: 'GH', sh: 'SH', ih: '인천도시공사' });
});

test('연도별 공급: 지난 공급 실적 3시도 × 9년 × 4지표 108칸 = PoC #annual-supply, 수도권 합도 같음', { skip }, () => {
  assert.deepEqual(gj.annual_supply.mismatches, []);
  const MET = { 분양승인: 'sale', 인허가: 'permit', 착공: 'start', 준공: 'complete' }, CODE = { 서울특별시: '11', 인천광역시: '28', 경기도: '41' };
  let n = 0;
  for (const row of ga.rows.filter((r) => CODE[r.region])) for (const [k, m] of Object.entries(MET)) {
    const y = R.regionYears(MOLIT, ANNUAL, m, CODE[row.region]).years.find((x) => x.year === row.year);
    assert.equal(y?.value ?? null, row.metrics[k].units, `${row.region} ${row.year} ${k}`);
    n++;
  }
  assert.equal(n, 108);
  for (const [year, ms] of Object.entries(gj.annual_supply.metro_by_year)) for (const [k, v] of Object.entries(ms)) {
    assert.equal(R.metroYears(MOLIT, ANNUAL, MET[k]).find((x) => x.year === Number(year)).value, v.poc, `수도권 ${year} ${k}`);
  }
});

test('지역 지표: 동네 여건(인구·가구·주택 재고·미분양·장래가구) 3시도 = PoC #area', { skip }, () => {
  const CODE = { 서울특별시: '11', 인천광역시: '28', 경기도: '41' };
  for (const [name, a] of Object.entries(gj.area)) {
    const f = FACTS.sido[CODE[name]], last = (o) => o[Object.keys(o).sort().pop()];
    assert.equal(f.population[String(a.population.poc_year)], a.population.poc, `${name} 인구`);
    assert.equal(last(f.households), a.households.poc, `${name} 가구`);
    assert.equal(last(f.housing_units), a.housing_units.poc, `${name} 주택 재고`);
    assert.equal(f.unsold_total[a.unsold_total.poc_period], a.unsold_total.poc, `${name} 미분양`);
    assert.equal(f.unsold_completed[a.unsold_total.poc_period], a.unsold_completed.poc, `${name} 준공 후 미분양`);
    assert.equal(f.forecast_households['2026'], a.forecast_households_2026.poc, `${name} 장래가구 2026`);
  }
});
