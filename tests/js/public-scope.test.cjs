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

const ROOT = path.join(__dirname, '..', '..');
const BASE = P.ledgerDir('2026-10');
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
  assert.deepEqual(['PUBLIC', 'PRIVATE_RENEWAL', 'PRIVATE', 'UNKNOWN', 'PRIVATE_ON_PUBLIC_LAND'].map((s) => byScope(s).length), [289, 39, 53, 0, 0]);   // 2026-10-22 새 덤프(20261021T212310Z): 새 사업 1(부천역곡 A1 — A 공공 시행 LH) 288 → 289 · 2026-10-21 새 덤프(20261020T142230Z): 새 사업 3(독산동·방화차고지 A 공공 시행 SH, 연남동 C1 프로그램 건설형 공공임대) 285 → 288
  assert.equal(live.length, 381);   // 2026-10-22 새 덤프: 새 사업 1(부천역곡 A1) · 2026-10-21 새 덤프: 새 사업 3
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

test('HOME 원본으로 다시 나눈 계층 = 원장 공개 범위 — A 180 · B 52 · C1 5 · C2 48 · D 39 · E 53 · F 0(건수·호수)', { skip: SKIP }, () => {
  const gz = (k) => zlib.gunzipSync(fs.readFileSync(path.join(HOME_DIR, `${k}.jsonl.gz`))).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const src = new Map(gz('project').map((r) => [r.entity_id, r.source_id]));
  const progs = new Map();
  for (const m of gz('home_mapping')) if (m.status !== 'RELEASED') (progs.get(m.project_id) || progs.set(m.project_id, new Set()).get(m.project_id)).add(m.program_id);
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
  assert.deepEqual(tiers, { A: 184, B: 52, C1: 5, C2: 48, D: 39, E: 53 }, 'F 없음');   // 2026-10-22 새 덤프(20261021T212310Z): A +1(부천역곡 A1, 시행 LH) · 2026-10-21 새 덤프(20261020T142230Z): A +3(독산동·방화차고지·연남동, 시행 SH — 연남동은 W5 SH 규칙으로 C1 → A)
  assert.deepEqual(units, { A: 125001, B: 33199, C1: 30000, C2: 55342, D: 27251, E: 628 });   // 2026-10-22 새 덤프: A +1,160(부천역곡 A1) · 2026-10-21 새 덤프: A +103(독산동 20·방화차고지 75·연남동 8)
});

test('화면 합계 = 공공 공급 합: 종합상황판·지도 색인·사업 색인·상세·지역 공급·지도 정적 자료·경량 번들·/citizen 에 민간 사업이 없고, 민간 정비는 따로', () => {
  const pub = new Set(live.filter(isShown).map((p) => p.local_project_id)), renewal = live.filter(isRenewal).map((p) => p.local_project_id).sort();
  const priv = live.filter((p) => !isShown(p)).map((p) => p.local_project_id);
  assert.equal(pub.size, byScope('PUBLIC').length);
  const L = board('ledger-board.json');
  assert.deepEqual([L.scope.projects, L.scope.units], [pub.size, sum([...pub].map((id) => unitsOf.get(id)))]);
  assert.deepEqual([L.scope.projects, L.scope.units], [289, 243542]);   // 2026-10-22 새 덤프(20261021T212310Z): 새 사업 1(부천역곡 A1 1,160호) · 2026-10-21 새 덤프(20261020T142230Z): 새 사업 3(103호)
  assert.deepEqual(L.scope.renewal, { projects: renewal.length, units: sum(renewal.map((id) => unitsOf.get(id))) });
  assert.deepEqual(L.scope.renewal, { projects: 39, units: 27251 });
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

test('9·7 정책 진행값 불변(HOME 원본에서 따로 계산 — 공공 분류와 상관없음): 같은 기간 2026 목표 8,049 · 확인 4,963 · 추정 포함 8,742', () => {
  const s97 = board('policy-progress.json').policies.find((p) => p.policyId === 'POL_2025_0907').stages.SUPPLY.samePeriod.find((y) => y.year === 2026);
  assert.deepEqual([s97.target, s97.actual, s97.actualWithEstimates], [8049, 4963, 8742]);   // 2026-10-22 새 덤프: 확인 +231(담당자 공급 측정값 3건 추정 → 원천 확인, policy-progress.test.cjs)
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
