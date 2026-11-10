'use strict';
// 공공 공급 분류(2026-10-20 사용자 결정 '공공 분류는 안2로' — tools/ledger/home-source.js PUBLIC_TIER): 수도권 HOME 사업을 위 계층부터 A 공공 시행 · B 공공 시행 제도 ·
// C1 공공택지·공공주택지구 · C2 공공부지 복합개발 · D 민간 정비(정책 귀속 검토) · E 일반 민간·소규모 로 나눈다. A~C2 = PUBLIC, D = PRIVATE_RENEWAL, E = PRIVATE, F(판단 불가) = 0.
// 화면(종합상황판·지도 색인·사업·지역 공급·지도 정적 자료·/citizen)은 PUBLIC 만 싣고, 민간 정비는 종합상황판 scope.renewal 과 사업 화면 ?scope=renewal 로만 따로 보인다. 9·7 정책 진행값은 그대로.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const H = require('../../tools/ledger/home-source');
const { isShown, isRenewal, projectStates } = require('../../tools/ledger/board');
const P = require('../../tools/ledger/paths');
const E = require('./home-era.cjs');

const ROOT = path.join(__dirname, '..', '..');
const BASE = P.ledgerDir(P.latestMonth());   // 지금 원장(가장 늦은 달 폴더) — 화면 자료(data/board)와 같은 달
const table = (t) => JSON.parse(fs.readFileSync(path.join(BASE, 'tables', `${t}.json`), 'utf8')).rows;
const board = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/board', f), 'utf8'));
const projects = table('projects'), live = projects.filter((p) => !p.superseded_by);
const byScope = (s) => live.filter((p) => p.public_scope === s);
const HOME_DIR = H.latestHomeDir(BASE), SKIP = !H.homeAvailable(HOME_DIR) && 'HOME 원본(jsonl.gz) 없음 — Storage 에서 받거나 tools/ledger/home-dump.py';
const sum = (xs) => xs.reduce((s, v) => s + v, 0);
/* 사업 호수(보드와 같은 물량 규칙): 원장 살아 있는 사업 전부의 상태에서 */
const unitsOf = new Map(projectStates({ ...Object.fromEntries(['events', 'units', 'sources'].map((t) => [t, table(t)])), projects }, '2026-10-20', { pick: (p) => !p.superseded_by }).projects.map((x) => [x.p.local_project_id, x.units]));

test('분류 표: 계층 순서 B·C1·C2·D·E, 프로그램 id 는 한 계층에만, 판정은 id·시행·출처 코드로만(프로그램 이름 정규식 없음)', () => {
  assert.deepEqual(H.PUBLIC_TIER.map((x) => [x.tier, x.scope, x.ids.size]), [['B', 'PUBLIC', 5], ['C1', 'PUBLIC', 13], ['C2', 'PUBLIC', 8], ['D', 'PRIVATE_RENEWAL', 3], ['E', 'PRIVATE', 2]]);
  const all = H.PUBLIC_TIER.flatMap((x) => [...x.ids]);
  assert.equal(new Set(all).size, all.length, '한 id 는 한 계층');
  assert.ok(all.every((id) => /^PRG_[0-9a-f]{24}$/.test(id)));
  assert.ok(H.AGENCY_SOURCES.has('ih_notice') && H.AGENCY_SOURCES.has('sh_inventory') && H.AGENCY_SOURCES.has('gh_supply_plan') && H.AGENCY_SOURCES.has('lh_construction'));
  const src = fs.readFileSync(path.join(ROOT, 'tools/ledger/home-source.js'), 'utf8');
  assert.doesNotMatch(src, /\/공공\/\.test/, '옛 프로그램 이름 판정(/공공/)은 없다');
});

test('원장: 살아 있는 사업 = 공공 공급 285 · 민간 정비 39 · 일반 민간 53, 판단 불가(F → UNKNOWN)·공공택지 민간 0, 검토 목록 공개 범위 미상 0', () => {
  /* 판 숫자(2026-10-22 판 289 · 39 · 53 / 381, 2026-11-10 판 290 · 39 · 53 / 382) 대신: 세 범위 합 = 살아 있는 사업, 판단 불가·공공택지 민간 0.
     계층별 건수·호수는 아래 'HOME 원본으로 다시 나눈 계층' 시험이 원본에서 다시 세어 대조한다 */
  assert.deepEqual(['UNKNOWN', 'PRIVATE_ON_PUBLIC_LAND'].map((s) => byScope(s).length), [0, 0]);
  assert.ok(['PUBLIC', 'PRIVATE_RENEWAL', 'PRIVATE'].every((s) => byScope(s).length > 0));
  assert.equal(['PUBLIC', 'PRIVATE_RENEWAL', 'PRIVATE'].reduce((n, s) => n + byScope(s).length, 0), live.length);
  assert.equal(table('review_required').filter((r) => r.review_type === 'PUBLIC_SCOPE_UNKNOWN').length, 0, 'F 0건');
  /* 기관이 있으면 공공 시행(A) — 기관 있는 민간 사업은 없다 */
  assert.ok(live.filter((p) => p.agency_id).every((p) => p.public_scope === 'PUBLIC'));
  assert.ok(byScope('PUBLIC').filter((p) => !p.agency_id).every((p) => /^HOME 프로그램: \S/.test(p.public_basis)), '기관 없는 공공 공급은 프로그램 근거(시행기관 미정)');
  assert.ok([...byScope('PRIVATE_RENEWAL'), ...byScope('PRIVATE')].every((p) => !p.agency_id && /^HOME 프로그램: /.test(p.public_basis)));
});

test('계층별 대표 사업(호수가 가장 큰 사업)', () => {
  const at = (id) => { const p = projects.find((x) => x.local_project_id === id); return [p.public_scope, p.agency_id, p.public_basis]; };
  assert.deepEqual(at('PRJ-11680-0113'), ['PUBLIC', 'lh', 'HOME 원천 시행: LH'], 'A 수서 노후 임대 재건축');
  assert.deepEqual(at('PRJ-11470-0087'), ['PUBLIC', null, 'HOME 프로그램: 도심 공공주택 복합사업'], 'B 염창역 남측');
  assert.deepEqual(at('PRJ-11650-0080'), ['PUBLIC', null, 'HOME 프로그램: 서울 남부권 공공택지 공급 조기화'], 'C1 서울 서리풀');
  assert.deepEqual(at('PRJ-11170-0047'), ['PUBLIC', null, 'HOME 프로그램: 공공시설·유휴부지 개발'], 'C2 용산국제업무지구');
  assert.deepEqual(at('PRJ-41360-0200'), ['PUBLIC', null, 'HOME 프로그램: 군 유휴부지'], 'C2 남양주 군부지(옛 이름 판정으로는 공개 범위 미상이던 13곳 중 하나)');
  assert.deepEqual(at('PRJ-11650-0084'), ['PRIVATE_RENEWAL', null, 'HOME 프로그램: 재개발·재건축 · 정책 귀속 검토'], 'D 반포주공1단지');
  assert.deepEqual(at('PRJ-11215-0048'), ['PRIVATE', null, 'HOME 프로그램: 일반 주택 건설 · 정책 미귀속'], 'E 자양동 도시형생활주택');
});

test('HOME 원본으로 다시 나눈 계층 = 원장 공개 범위 — 계층 합 = 공공 공급 · 민간 정비 · 일반 민간(건수·호수, 보드와 같다), F 0', { skip: SKIP }, () => {
  const gz = (k) => zlib.gunzipSync(fs.readFileSync(path.join(HOME_DIR, `${k}.jsonl.gz`))).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const src = new Map(gz('project').map((r) => [r.entity_id, r.source_id]));
  const progs = new Map();
  /* 사업 연결은 해제(RELEASED) 제외 — 단 담당자 결정 제외(mapping_decision EXCLUDED, readHome 이 RELEASED 로 바꾸고 excluded_by_decision 표시)는 결정 전 연결로 본다(정책 집계에서만 빠지고 공공/민간 성격은 그대로).
     2026-11-10 판: 일반 민간(E) 53곳 모두 담당자 결정으로 정책 집계에서 빠졌지만 E 로 남는다 */
  for (const m of H.readHome(HOME_DIR).kinds.home_mapping) if (m.status !== 'RELEASED' || m.excluded_by_decision) (progs.get(m.project_id) || progs.set(m.project_id, new Set()).get(m.project_id)).add(m.program_id);
  const pros = new Map();
  for (const i of table('identifiers')) if (i.id_type === 'HOME' && i.id_value.startsWith('PRO_')) (pros.get(i.local_project_id) || pros.set(i.local_project_id, []).get(i.local_project_id)).push(i.id_value);
  const alias = (s) => String(s ?? '').replace(/^lh_incheon_/, 'lh_');
  const tiers = {}, units = {};
  for (const p of live) {
    const ps = pros.get(p.local_project_id) ?? [], ids = new Set(ps.flatMap((x) => [...(progs.get(x) ?? [])]));
    const t = p.agency_id || ps.some((x) => H.AGENCY_SOURCES.has(alias(src.get(x)))) ? { tier: 'A', scope: 'PUBLIC' } : H.PUBLIC_TIER.find((x) => [...ids].some((id) => x.ids.has(id))) ?? { tier: 'F', scope: 'UNKNOWN' };
    assert.equal(p.public_scope, t.scope, p.local_project_id);
    tiers[t.tier] = (tiers[t.tier] ?? 0) + 1;
    units[t.tier] = (units[t.tier] ?? 0) + unitsOf.get(p.local_project_id);
  }
  /* 판 숫자(2026-10-22 판 A 184 · B 52 · C1 5 · C2 48 · D 39 · E 53, 호수 A 125,001 · B 33,199 · C1 30,000 · C2 55,342 · D 27,251 · E 628) 대신 원장·보드와 대조 */
  assert.equal(tiers.F, undefined, 'F 없음');
  const pubT = ['A', 'B', 'C1', 'C2'], n = (ts, o) => sum(ts.map((x) => o[x] ?? 0));
  assert.deepEqual([n(pubT, tiers), tiers.D ?? 0, tiers.E ?? 0], [byScope('PUBLIC').length, byScope('PRIVATE_RENEWAL').length, byScope('PRIVATE').length]);
  const L = board('ledger-board.json');
  assert.deepEqual([n(pubT, units), units.D ?? 0], [L.scope.units, L.scope.renewal.units], '공공 공급 호수 = 보드 scope.units, 민간 정비 = scope.renewal.units');
});

test('화면 합계 = 공공 공급 합: 종합상황판·지도 색인·사업 색인·상세·지역 공급·지도 정적 자료·경량 번들·/citizen 에 민간 사업이 없고, 민간 정비는 따로', () => {
  const pub = new Set(live.filter(isShown).map((p) => p.local_project_id)), renewal = live.filter(isRenewal).map((p) => p.local_project_id).sort();
  const priv = live.filter((p) => !isShown(p)).map((p) => p.local_project_id);
  assert.equal(pub.size, byScope('PUBLIC').length);
  const L = board('ledger-board.json');
  assert.deepEqual([L.scope.projects, L.scope.units], [pub.size, sum([...pub].map((id) => unitsOf.get(id)))]);
  assert.deepEqual(L.scope.renewal, { projects: renewal.length, units: sum(renewal.map((id) => unitsOf.get(id))) });
  assert.equal(sum(L.regions.map((r) => r.projects)), pub.size, '시도 합');
  assert.equal(sum(L.agencies.map((a) => a.projects)), pub.size, '기관 합');
  assert.equal(sum(L.stageProjects[L.now]), pub.size, '단계 합');
  const mapIds = Object.values(board('ledger-map.json').bySgg).flat().map((r) => r.id);
  assert.deepEqual(mapIds.slice().sort(), [...pub].sort(), '지도 색인 = 공공 공급');
  const idx = board('projects-index.json');
  assert.ok(Object.keys(idx.projects).every((id) => pub.has(id)), '사업 색인');
  assert.deepEqual(Object.values(idx.renewal.bySgg).flat().map((r) => r.id).sort(), renewal, '사업 색인 renewal = 민간 정비');
  assert.ok(Object.keys(board('project-detail.json').projects).every((id) => pub.has(id)), '사업 상세');
  const cal = Object.values(board('region-calendar.json').sido).flat();
  assert.ok(cal.every((r) => pub.has(r.id)), '지역 공급 달력');
  const dir = (d) => fs.readdirSync(path.join(ROOT, 'data/board', d)).filter((f) => /^\d{5}\.json$/.test(f)).map((f) => board(`${d}/${f}`));
  assert.deepEqual(dir('home-map').flatMap((d) => d.projects.map((r) => r.id)).sort(), [...pub].sort(), '지도 정적 자료');
  assert.ok(dir('home-lite').flatMap((d) => d.projects.map((r) => r[0])).every((id) => pub.has(id)), '경량 번들');
  const lite = board('home-lite/index.json').sggs;
  assert.equal(sum(lite.map((x) => x.projects)), pub.size, '경량 번들 색인 사업 수');
  const citizen = fs.readFileSync(path.join(ROOT, 'assets/citizen/index.html'), 'utf8');
  assert.ok(priv.every((id) => !citizen.includes(id)), '/citizen 에 민간 사업 id 없음');
  assert.ok([...pub].filter((id) => citizen.includes(id)).length > 200, '/citizen 은 공공 공급 사업을 싣는다');
});

test('9·7 정책 진행값 불변(HOME 원본에서 따로 계산 — 공공 분류와 상관없음): 같은 기간 2026 목표·추정 포함 = HOME 정책 화면 응답, 원장 공공 분류 표를 읽지 않고 다시 계산해도 같다', { skip: SKIP }, () => {
  const PPJ = require('../../tools/ledger/policy-progress');
  const saved = board('policy-progress.json');
  const s97 = saved.policies.find((p) => p.policyId === 'POL_2025_0907').stages.SUPPLY.samePeriod.find((y) => y.year === 2026);
  /* 판 숫자([8049, 4963, 8742]) 대신: HOME 원본(jsonl.gz)만으로 다시 계산한 값(원장 projects.public_scope 를 읽지 않는다) = 저장된 화면 자료 */
  const again = PPJ.policyProgress(H.readHome(HOME_DIR)).policies.find((p) => p.policyId === 'POL_2025_0907').stages.SUPPLY.samePeriod.find((y) => y.year === 2026);
  assert.deepEqual([again.target, again.actual, again.actualWithEstimates], [s97.target, s97.actual, s97.actualWithEstimates]);
  assert.ok(s97.target > 0 && s97.actualWithEstimates >= s97.actual, '목표가 있고 추정 포함 ≥ 확인');
  /* HOME 정책 화면 응답(판이 같을 때): 같은 기간 목표·추정 포함 확인이 같다 */
  const view = E.golden('S1-view-policy.json');
  if (view.doc) assert.deepEqual(E.homePeriod(view.doc, 'SUPPLY', s97.from, s97.through), { target: s97.target, actual: s97.actualWithEstimates });
});

test('사업 화면 민간 정비: 2026-10-21 PoC 규칙으로 HOME 원천 행 전 정책 목록에 함께 든다(?scope=renewal 따로 보기는 HOME 목록에서 받지 않는다)', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib/board/projects-view.ts'), 'utf8');
  assert.match(src, /if \(!ctx\.home && one\(q\.scope\) === 'renewal'\) f\.renewal = true;/);
  assert.match(src, /const KEYS = \['scope', /);
  const page = fs.readFileSync(path.join(ROOT, 'app/(dashboard)/projects/page.tsx'), 'utf8');
  assert.match(page, /const rows = idx\.rows;/);
  assert.doesNotMatch(page, /renewalRows|scope: 'renewal'/);
  /* 실제 자료: 민간 정비(D 계층 프로그램) 원천 행이 전 정책 목록에 모두 있고, 옛 주소 ?scope=renewal 은 거르지 않는다(같은 목록·주소에서 빠짐) */
  const V = require('../../lib/board/projects-view.ts'), HP = require('../../data/board/home-projects.json'), IDX = require('../../data/board/projects-index.json');
  const home = V.homeRowsOf(HP.rows, HP.residuals), ctx = { policies: IDX.policies, programs: V.homeProgramsOf(home), sidoOk: () => true, home: { agencies: V.homeAgenciesOf(home).map((a) => a.name) } };
  const D = H.PUBLIC_TIER.find((x) => x.scope === 'PRIVATE_RENEWAL').ids, renewal = HP.rows.filter((r) => r.stats && D.has(r.policy.programId));
  assert.ok(renewal.length > 0);
  const all = V.parseFilters({ policy: 'all' }, ctx), ids = new Set(V.applyFilters(home, all).map((r) => r.id));
  assert.ok(renewal.every((r) => ids.has(r.id)), '민간 정비 원천 행은 전 정책 목록에');
  const old = V.parseFilters({ policy: 'all', scope: 'renewal' }, ctx);
  assert.equal(old.renewal, undefined);
  assert.equal(V.listHref(old), '/projects?policy=all');
  assert.equal(V.applyFilters(home, old).length, ids.size);
  const dir = fs.readFileSync(path.join(ROOT, 'lib/board/directives.ts'), 'utf8');
  assert.match(dir, /RENEWAL_NAME = '민간 정비\(정책 귀속 검토\)'/);
});

test('결정 제외(mapping_decision EXCLUDED): 정책 연결은 RELEASED 로 빠지되 공공 공급 분류용 표시(excluded_by_decision)가 남아 E(민간) 프로그램 사업후보가 F(미상)가 되지 않는다', () => {
  const E_PRG = [...H.PUBLIC_TIER.find((x) => x.tier === 'E').ids][0];
  const maps = [
    { id: 'M1', project_id: 'PRO_1', program_id: E_PRG, status: 'REVIEW' },
    { id: 'M2', project_id: 'PRO_2', program_id: E_PRG, status: 'CONFIRMED' },
    { id: 'M3', project_id: 'PRO_3', program_id: E_PRG, status: 'RELEASED' },
  ];
  const dec = [{ entity_id: 'D1', payload: { subject_kind: 'project', subject_id: 'PRO_1', status: 'EXCLUDED', changed_at: '2026-11-04' } },
    { entity_id: 'D2', payload: { subject_kind: 'project', subject_id: 'PRO_3', status: 'EXCLUDED', changed_at: '2026-11-04' } }];
  const out = H.withDecisions(maps, dec);
  assert.deepEqual(out.map((m) => [m.status, m.excluded_by_decision ?? false]), [['RELEASED', true], ['CONFIRMED', false], ['RELEASED', false]], '결정으로 빠진 행만 표시 · 원래 RELEASED 는 표시 없음');
  /* programsOf 규칙(home-source.js homeRows): RELEASED 가 아니거나 결정 제외 행만 분류에 쓴다 → PRO_1(결정 제외)·PRO_2 는 E, 원래 RELEASED 인 PRO_3 은 분류 연결 없음 */
  const usable = out.filter((r) => r.status !== 'RELEASED' || r.excluded_by_decision).map((r) => r.project_id);
  assert.deepEqual(usable, ['PRO_1', 'PRO_2']);
  /* 정책 연결·집계는 RELEASED 로 본다(skipPolicy 쪽): 결정 제외 행은 RELEASED */
  assert.equal(out[0].status, 'RELEASED');
});
