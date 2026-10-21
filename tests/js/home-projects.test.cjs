'use strict';
// PoC 규칙 사업 보기 data/board/home-projects.json(tools/ledger/home-projects.js) — 사업 = HOME 원천 행(PRO_), 해제 빼고 통계, 값은 덤프 우선·덤프로 못 내는 값만 PoC 스냅샷.
// (a) 늘: 출력 모양·합 맞음·담당자 이름/사유 글 없음.
// (b) HOME 덤프와 PoC 스냅샷(raw/home-api/2026-10-20)이 있을 때: 다시 만들면 같은 바이트, 9·7 범위 묶음과 정책 전체 묶음의 사업별 값이 같다.
// (c) 정답(.cache/home-parity/golden, PoC as_of 2026-10-20)이 있을 때: 9·7 기본·정책 전체 묶음 값과 사업 행 451개 분류가 같고, 덤프 계산과 다른 칸은 residuals 의 정해진 목록·이유뿐이다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../../tools/ledger/paths');
const H = require('../../tools/ledger/home-source');
const HP = require('../../tools/ledger/home-projects');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data/board/home-projects.json');
const text = fs.readFileSync(OUT, 'utf8');
const doc = JSON.parse(text);
const GOLD = path.join(ROOT, '.cache/home-parity/golden');
const MONTH = P.ledgerDir('2026-10');
const homeDir = H.latestHomeDir(MONTH);
const pocDir = path.join(MONTH, 'raw/home-api/2026-10-20');
const haveInputs = !!homeDir && H.homeAvailable(homeDir) && Object.keys(HP.POC_FILES).every((f) => fs.existsSync(path.join(pocDir, f)));
const haveGold = fs.existsSync(path.join(GOLD, 'golden-projects.json')) && fs.existsSync(path.join(GOLD, 'S2-project-map.csv'));
const byId = new Map(doc.rows.map((r) => [r.id, r]));
const STATS = ['DELAYED', 'WARNING', 'NORMAL', 'UNKNOWN'];

test('(a) 출력 모양: 451행(PRO_ 순)·필드·묶음 합', () => {
  assert.equal(doc.schema, 'home-projects/1');
  assert.equal(doc.asOf, '2026-10-20');
  assert.equal(doc.rows.length, 451);
  assert.deepEqual(doc.rows.map((r) => r.id), doc.rows.map((r) => r.id).slice().sort());
  for (const r of doc.rows) {
    assert.match(r.id, /^PRO_[0-9a-f]{24}$/);
    assert.ok(r.ourId === null || /^PRJ-\d{5}-\d{4}$/.test(r.ourId), r.id);
    assert.ok(['CONFIRMED', 'REVIEW', 'RELEASED'].includes(r.policy.status), r.id);
    assert.equal(r.stats, r.policy.status !== 'RELEASED', r.id);
    assert.equal(r.p97, r.policy.id === 'POL_2025_0907' && r.policy.status === 'CONFIRMED', r.id);
    if (!r.stats) assert.deepEqual(r.chart, { all: false, p97: false }, r.id);
    if (r.chart.p97) assert.ok(r.chart.all && r.p97, r.id);
    if (!r.chart.all) assert.equal(r.units.counted, null, r.id);
    assert.ok(['dump', 'snapshot'].includes(r.from), r.id);
    if (r.judge) assert.ok(STATS.includes(r.judge.status), r.id);
    if (r.reached) for (const v of Object.values(r.reached)) assert.ok(v >= 0, r.id);
  }
  for (const [scope, pick] of [['all', (r) => r.stats], ['p97', (r) => r.stats && r.p97]]) {
    const v = doc.views[scope], rs = doc.rows.filter(pick), ch = rs.filter((r) => r.chart[scope]);
    assert.equal(v.rows, rs.length, scope);
    assert.equal(v.chart, ch.length, scope);
    assert.equal(v.units, ch.reduce((s, r) => s + (r.units.counted ?? 0), 0), scope);
    assert.equal(v.regions.reduce((s, r) => s + r.rows, 0), v.rows, scope);
    assert.equal(v.regions.reduce((s, r) => s + r.units, 0), v.units, scope);
    assert.equal(v.municipalities.reduce((s, m) => s + m.rows, 0) + v.unlinked, v.rows, scope);
    for (const m of v.municipalities) assert.deepEqual(doc.bySgg[m.id][scope], { rows: m.rows, units: m.units }, `${scope} ${m.id}`);
  }
});

test('(a) 담당자 이름·사유 글이 없다(PoC 응답의 basis·reason·actor 칸과 \'사용자 입력 · 이름\' 글)', () => {
  assert.ok(!text.includes('사용자 입력'), '사용자 입력 글');
  const banned = new Set(['actor', 'actor_basis', 'reason', 'change_reason', 'basis', 'mapping_basis', 'note', 'changed_by', 'user', 'officer']);
  const walk = (v, at) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { assert.ok(!banned.has(k), `${at}.${k}`); walk(x, `${at}.${k}`); }
  };
  walk(doc, '$');
  /* 스냅샷을 받을 때 지우는 칸도 같은 목록이다 */
  assert.deepEqual(HP.scrub({ a: 1, basis: 'x', reason: 'y', actor: 'z', note: 'n', b: [{ mapping_basis: 1, c: 2 }] }), { a: 1, b: [{ c: 2 }] });
});

test('(a) 잔차: 칸·이유가 정해진 것뿐이고 출력 값은 use 쪽(분류는 PoC, 측정값은 덤프)', () => {
  const whys = new Set(Object.values(HP.REASON));
  for (const x of doc.residuals) {
    assert.ok(whys.has(x.why), `${x.id} ${x.field}`);
    assert.notEqual(x.why, HP.REASON.cohort, `${x.id} ${x.field}: 원인 미확인 차이`);
    const r = byId.get(x.id);
    assert.ok(r, x.id);
    assert.equal(x.use, ['reached', 'judge', 'upcoming', 'agency'].includes(x.field) ? 'dump' : 'poc', `${x.id} ${x.field}`);
    if (x.field === 'row') assert.equal(r.from, 'snapshot');
    if (x.field.startsWith('chart.')) assert.equal(r.chart[x.field.slice(6)], x.poc && r.stats, x.id);
    if (x.field === 'sgg') assert.equal(r.sgg?.id ?? null, x.poc, x.id);
    if (x.use === 'dump') assert.deepEqual(r[x.field], x.dump, `${x.id} ${x.field}`);
  }
  assert.deepEqual(doc.rows.filter((r) => r.from === 'snapshot').map((r) => r.id).sort(), doc.residuals.filter((x) => x.field === 'row').map((x) => x.id).sort());
});

test('(b) 덤프·스냅샷으로 다시 만들면 같은 바이트, 9·7 범위 묶음과 사업별 값이 같다', { skip: !haveInputs && 'HOME 덤프 원본 또는 PoC 스냅샷이 없다' }, () => {
  const PP = require('../../tools/ledger/policy-progress');
  const HV = require('../../tools/ledger/home-view');
  const home = H.readHome(homeDir);
  const fresh = HP.render(HP.build(home, HP.readPoc(pocDir), HP.ledgerIds(MONTH)));
  assert.equal(fresh, text, 'data/board/home-projects.json 을 node tools/ledger/home-projects.js 로 다시 만든다');
  /* 9·7 범위(homeView — policy-progress.js 그대로)의 묶음으로 센 값 = 정책 전체 범위 묶음으로 센 값 */
  const view = PP.homeView(home);
  let n = 0;
  for (const c of view.portfolio_cohorts) {
    const r = byId.get(c.id);
    for (const k of Object.keys(r.reached)) assert.equal(r.reached[k], HV.reached(view, [c], k, view.as_of_date), `${c.id} ${k}`);
    assert.deepEqual(r.judge, { status: HV.statusAt(c, view.as_of_date).status, gap: HV.statusAt(c, view.as_of_date).units }, c.id);
    n++;
  }
  assert.equal(n, 172);   // 2038810 inventory 이식으로 인천검단 AA19 두 임대 유형이 따로 묶음(2026-10-21, 170 → 172)
});

/* 정답 CSV(따옴표 칸 포함) → 행 객체 */
function readCsv(file) {
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  const split = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
  const head = split(lines[0]);
  return lines.slice(1).map(split).filter((c) => /^PRO_/.test(c[0])).map((c) => Object.fromEntries(head.map((h, i) => [h, c[i]])));
}

test('(c) 정답 대조: 9·7 기본 230/175/151,271·시도·시군구 44곳·단계 분포·향후 공급', { skip: !haveGold && '.cache/home-parity/golden 이 없다' }, () => {
  const g = JSON.parse(fs.readFileSync(path.join(GOLD, 'golden-projects.json'), 'utf8')).poc_overview_97;
  const v = doc.views.p97;
  assert.deepEqual([v.rows, v.counted, v.excluded, v.missing, v.units], [g.items, g['summary.target_counted_projects'], g['summary.target_excluded_projects'], g['summary.target_missing_projects'], g['summary.target_units']]);
  assert.deepEqual([v.rows, v.counted, v.units], [230, 175, 151271]);
  assert.deepEqual(v.regions.map((r) => [r.name, r.rows, r.units]), g['groups.region'].map((r) => [r.name, r.project_count, r.target_units]));
  const key = (m) => `${m.region}|${m.name}`;
  assert.equal(v.municipalities.length, 44);
  assert.deepEqual(new Map(v.municipalities.map((m) => [key(m), [m.rows, m.units]])), new Map(g.municipalities.map((m) => [key(m), [m.project_count, m.target_units]])));
  assert.equal(v.unlinked, g.municipality_unlinked_ids);
  const sd = g['summary.stage_distribution'];
  assert.deepEqual(v.stages, { parts: sd.parts, cumulative: sd.cumulative, advanced: sd.advanced_units, total: sd.total_units });
  assert.deepEqual(v.future.map((f) => [f.units, f.events]), g['summary.future.source_units'].map((u, i) => [u, g['summary.future.source_events'][i]]));
});

test('(c) 정답 대조: 정책 전체 443/346/289,336·시도·단계 분포', { skip: !haveGold && '.cache/home-parity/golden 이 없다' }, () => {
  const g = JSON.parse(fs.readFileSync(path.join(GOLD, 'golden-projects.json'), 'utf8')).poc_overview_all;
  const v = doc.views.all;
  assert.deepEqual([v.rows, v.counted, v.excluded, v.missing, v.units], [g['summary.project_count'], g['summary.target_counted_projects'], g['summary.target_excluded_projects'], g['summary.target_missing_projects'], g['summary.target_units']]);
  assert.deepEqual([v.rows, v.counted, v.units], [443, 346, 289336]);
  const sd = g['summary.stage_distribution'];
  assert.deepEqual(v.stages, { parts: sd.parts, cumulative: sd.cumulative, advanced: sd.advanced_units, total: sd.total_units });
  /* 정책별 행·호수(PoC groups.policy — UNMAPPED = 정책 미귀속, MON_* = 감시 목록(프로그램 이름)) */
  const group = { UNMAPPED: (r) => r.policy.id === 'UNASSIGNED', MON_THIRD_NEW_TOWN: (r) => r.policy.program === '3기 신도시', MON_URBAN_COMPLEX: (r) => r.policy.program === '도심 공공주택 복합사업' };
  for (const p of g['groups.policy']) {
    const rs = doc.rows.filter((r) => r.stats && (group[p.id] ?? ((x) => x.policy.id === p.id))(r));
    assert.deepEqual([rs.length, rs.reduce((s, r) => s + (r.units.counted ?? 0), 0)], [p.project_count, p.target_units ?? 0], p.id);
  }
  /* 시도: PoC 원본 응답의 groups.region */
  const raw = path.join(GOLD, 'S2-raw-map-dashboard.json');
  if (fs.existsSync(raw)) assert.deepEqual(v.regions.map((r) => [r.name, r.rows, r.units]), JSON.parse(fs.readFileSync(raw, 'utf8')).groups.region.map((r) => [r.name, r.project_count, r.target_units]).sort((a, b) => ['서울특별시', '인천광역시', '경기도'].indexOf(a[0]) - ['서울특별시', '인천광역시', '경기도'].indexOf(b[0])));
});

test('(c) 정답 대조: 사업 행 451개 분류가 같고, 덤프와 다른 칸은 residuals 의 정해진 목록뿐', { skip: !haveGold && '.cache/home-parity/golden 이 없다' }, () => {
  const csv = readCsv(path.join(GOLD, 'S2-project-map.csv'));
  assert.equal(csv.length, 451);
  const num = (s) => (s === '' ? null : Number(s));
  for (const c of csv) {
    const r = byId.get(c.poc_id);
    assert.ok(r, c.poc_id);
    assert.deepEqual(
      [r.name, r.region, r.policy.status, r.policy.id ?? '', r.stats, r.p97, r.chart.p97, r.units.planned, r.ourId ?? ''],
      [c.poc_name, c.poc_region, c.poc_mapping_status, c.poc_policy, c.poc_in_map_443 === 'Y', c.poc_in_projects_workspace === 'Y', c.poc_in_97_target_175 === 'Y', num(c.poc_planned_units), c.our_final_id], c.poc_id);
    if (r.chart.all) assert.equal(r.units.counted, num(c.poc_map_target_units), c.poc_id);
    assert.equal(r.from === 'snapshot', c.status === '덤프뒤신규', c.poc_id);
  }
  /* 덤프 계산과 PoC 가 다른 분류 칸(사업 id·까닭) — 이 밖의 차이는 0 이어야 한다 */
  const got = doc.residuals.filter((x) => x.use === 'poc').map((x) => `${x.field} ${x.id}`).sort();
  const want = [
    ...csv.filter((c) => c.status === '덤프뒤신규').map((c) => `row ${c.poc_id}`),
    /* 인천부평 A: 2038810 inventory·block_key 이식(2026-10-21) 뒤에도 덤프로는 단독 대표(블록 칸 'A' — 블록 키 없음)인데 PoC 운영 판은 집계에서 뺀다 — 덤프 뒤 변경 또는 미공개 서버 규칙.
       인천검단 AA19 두 임대 유형(PRO_3cb5…·PRO_8ccb…)은 이식으로 PoC 와 같아졌다 */
    'chart.all PRO_4b859c7f4b18222558932b97',
    /* 인천 시군구 귀속(행정구역 개편): policy-progress.js homeService 가 원장 시군구 규칙(home-source.js sggByPro)으로 PoC 운영 규칙 INCHON_DATED_ADMINISTRATIVE_NAME 을 대신해
       23행 중 19행이 같아졌다. 남은 4행 = 원장도 시군구를 못 정한 인천서구 묶음(SGG_UNRESOLVED — 지구 '인천서구' 만으로는 서해구·검단구를 못 가른다) */
    ...['1c2a1be12daff06cef52f8c6', '4e534476d1d747285e612f85', '85998117430f9302232be12d', 'a9e2bffb100945377e90ef33'].map((h) => `sgg PRO_${h}`),
  ].sort();
  assert.deepEqual(got, want);
  for (const x of doc.residuals.filter((y) => y.field === 'sgg')) assert.equal(byId.get(x.id).region, '인천광역시', x.id);
});

test('(c) 정답 대조: 9·7 묶음의 단계 도달·판정·12개월 공급·기관 — PoC 정책 응답과 다른 사업은 모두 덤프 뒤 담당자 입력이 있는 사업', { skip: !(haveGold && fs.existsSync(path.join(GOLD, 'deliv-2026-10-20.json'))) && '.cache/home-parity/golden 이 없다' }, () => {
  const HV = require('../../tools/ledger/home-view');
  const view = JSON.parse(fs.readFileSync(path.join(GOLD, 'deliv-2026-10-20.json'), 'utf8'));
  const dumpAt = Date.parse(doc.source.dump.snapshotAt);
  const late = new Set(view.portfolio_cohorts.filter((c) => [...c.events, ...c.schedules].some((e) => e.changed_at && Date.parse(e.changed_at) > dumpAt)).map((c) => c.id));
  const res = new Map(doc.residuals.filter((x) => x.use === 'dump').map((x) => [`${x.id} ${x.field}`, x]));
  let same = 0;
  for (const c of view.portfolio_cohorts) {
    const r = byId.get(c.id), asOf = view.as_of_date;
    const pv = { reached: Object.fromEntries(Object.keys(r.reached).map((k) => [k, HV.reached(view, [c], k, asOf)])), judge: { status: HV.statusAt(c, asOf).status, gap: HV.statusAt(c, asOf).units },
      upcoming: HV.statistics([c], asOf, 2026).upcoming.filter((m) => m.units > 0).map((m) => [m.month, m.units]), agency: HV.agencyName(c.developer) };
    let differs = false;
    for (const k of Object.keys(pv)) {
      const x = res.get(`${c.id} ${k}`);
      if (r.from === 'snapshot') assert.deepEqual(r[k], pv[k], `${c.id} ${k}(덤프 뒤 신규 = PoC 묶음 값)`);
      else if (x) { assert.deepEqual(x.poc, pv[k], `${c.id} ${k}`); differs = true; }
      else assert.deepEqual(r[k], pv[k], `${c.id} ${k}: 잔차 없이 다름`);
    }
    if (differs) assert.ok(late.has(c.id), `${c.id}: 덤프 뒤 입력 없이 다름`);
    else same++;
  }
  assert.equal(view.portfolio_cohorts.length, 175);
  assert.equal(same, 175 - new Set([...res.values()].map((x) => x.id)).size);
});
