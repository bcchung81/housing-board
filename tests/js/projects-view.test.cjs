'use strict';
/* 사업 화면(2026-10-14, HOME 개념 흡수): tools/ledger/projects-index.js 가 만든 두 파일, lib/board/projects-view.ts 의 렌즈·거르기·정책 단계 칸·타임라인,
   그리고 화면 적용(대체 id 넘김·숨김 안내·발급 사업만 상세)을 고정한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const V = require('../../lib/board/projects-view.ts');
const X = require('../../tools/ledger/projects-index.js');
const MAP = require('../../data/board/ledger-map.json');
const IDX = require('../../data/board/projects-index.json');
const DET = require('../../data/board/project-detail.json');
const PP = require('../../data/board/policy-progress.json');
const REG = require('../../registry/projects.json').projects;

const rows = V.rowsOf(MAP.bySgg, IDX.projects, IDX.sgg);
const pol = (k) => IDX.policies.find((p) => p.key === k);

test('두 파일은 지금 원장 표에서 다시 만든 것과 바이트가 같다(원장을 갱신하면 node tools/ledger/projects-index.js 를 다시 돌린다)', () => {
  const m = X.loadMonth();
  assert.equal(read(X.INDEX_OUT), X.renderIndex(X.projectsIndexFromLedger(m.tables, m)));
  assert.equal(read(X.DETAIL_OUT), X.renderDetail(X.projectDetailFromLedger(m.tables, m)));
  assert.equal(IDX.referenceDate, MAP.referenceDate, '지도 색인과 같은 기준일');
});

test('목록 행 = 원장의 살아 있는 사업 전부(대체 6·숨김 55 제외), 발급 279 · 후보 2,039', () => {
  assert.equal(rows.length, 2318);
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
  const gone = new Set(REG.filter((p) => p.supersededBy || p.hiddenAt).map((p) => p.id));
  assert.equal(gone.size, 61);
  assert.ok(rows.every((r) => !gone.has(r.id)), '대체·숨김 사업은 목록에 없다');
  assert.equal(rows.filter((r) => r.issued).length, 279);
  const live = new Set(REG.filter((p) => !p.supersededBy && !p.hiddenAt).map((p) => p.id));
  assert.ok(rows.filter((r) => r.issued).every((r) => live.has(r.id)), '발급 행 = 살아 있는 레지스트리 사업');
  assert.deepEqual(Object.keys(DET.projects).sort(), rows.filter((r) => r.issued).map((r) => r.id).sort(), '상세 자료는 발급 사업만');
});

test('렌즈: 9·7 140건 · 1·29 47건 · 8·13 51건(모두 서울·인천·경기), 프로그램 렌즈는 프로그램 목록의 사업 수와 같다', () => {
  const n = (f) => V.applyFilters(rows, f).length;
  assert.deepEqual(IDX.policies.map((p) => [p.key, n({ policy: p })]), [['97', 140], ['129', 47], ['813', 51]]);
  for (const p of IDX.policies) assert.ok(V.applyFilters(rows, { policy: p }).every((r) => r.policies.includes(p.key) && ['11', '28', '41'].includes(r.sgg.slice(0, 2))), p.key);
  for (const g of IDX.programs) assert.equal(n({ program: g }), g.projects, g.name);
  assert.equal(rows.filter((r) => r.policies.length).length, 238, '정책에 연결된 사업');
  const s = V.summaryOf(V.applyFilters(rows, { policy: pol('97') }));
  assert.deepEqual([s.n, s.units, s.notice, s.review, s.confirmed], [140, 118748, 19521, 139, 1]);
  /* 렌즈 + 지역 + 단계 + 상태가 함께 걸린다 */
  const f = { policy: pol('97'), sido: '41', stage: '04', status: 'ok' };
  assert.ok(V.applyFilters(rows, f).every((r) => r.policies.includes('97') && r.sgg.startsWith('41') && r.stage === '04' && r.cls === 'ok'));
  assert.equal(V.applyFilters(rows, f, 'stage').length >= V.applyFilters(rows, f).length, true, '계단 건수는 단계 거르기를 빼고 센다');
});

test('거르기 읽기·주소: 맞지 않는 값은 거르지 않고, 렌즈는 하나(정책이 이긴다), 시군구가 시도를 이긴다, 열쇠 순서 고정', () => {
  const ctx = { policies: IDX.policies, programs: IDX.programs, sidoOk: (c) => ['11', '28', '41'].includes(c) };
  assert.deepEqual(V.parseFilters({ policy: 'x', stage: '07', status: 'bad', sgg: '99999' }, ctx), {});
  const f = V.parseFilters({ policy: '97', program: '3기 신도시', sido: '11', sgg: '41285', stage: '04', status: 'delay' }, ctx);
  assert.equal(f.policy.key, '97'); assert.equal(f.program, undefined); assert.equal(f.sgg, '41285'); assert.equal(f.sido, undefined);
  assert.equal(V.listHref(f), '/projects?policy=97&sgg=41285&stage=04&status=delay');
  assert.equal(V.listHref(f, { program: '3기 신도시' }), '/projects?program=3%EA%B8%B0+%EC%8B%A0%EB%8F%84%EC%8B%9C&sgg=41285&stage=04&status=delay', '프로그램을 고르면 정책 렌즈가 풀린다');
  assert.equal(V.listHref(f, { sido: '11' }), '/projects?policy=97&sido=11&stage=04&status=delay', '시도를 고르면 시군구가 풀린다');
  assert.equal(V.listHref(f, { policy: undefined, program: undefined, sgg: undefined, stage: undefined, status: undefined }), '/projects');
});

test('9·7 6단계 목표 대비 확인 = policy-progress samePeriod(2026-01~09): 공급 목표 9,355 vs 확인 6,680 · 부족 2,675(28.6%) · 확인 필요 연결 1,871 포함', () => {
  const cells = V.policyStageCells(PP, 'POL_2025_0907');
  const st = PP.policies[0].stages;
  assert.deepEqual(cells.map((c) => c.key), ['BUSINESS', 'APPROVAL', 'CONSTRUCTION', 'SUPPLY', 'COMPLETION', 'MOVE_IN']);
  for (const c of cells) {
    const s = st[c.key].samePeriod.find((y) => y.year === 2026);
    assert.deepEqual([c.target, c.actual, c.gap, c.shortfallPct, c.review], [s.target, s.actual, s.gap, s.shortfallPct, s.actualReviewUnits], c.key);
  }
  const sup = cells[3];
  assert.deepEqual([sup.state, sup.target, sup.actual, sup.gap, sup.shortfallPct, sup.review], ['short', 9355, 6680, 2675, 28.6, 1871]);
  assert.equal(Math.round(sup.fill * 10) / 10, 71.4);
  const tip = V.stageCellTip(sup);
  for (const t of ['6,680', '9,355', '2,675', '28.6%', '1,871', '2026.01~2026.09']) assert.ok(tip.includes(t), t);
  assert.deepEqual(cells.map((c) => c.state), ['none', 'noTarget', 'noTarget', 'short', 'noTarget', 'noActual'], '목표 없는 단계는 빗금, 입주는 확인 미확보');
  assert.equal(V.policyStageCells(PP, 'POL_2026_0129'), null, '1·29·8·13 은 비교 자료 없음');
});

test('타임라인·일정 표 자료: 수원당수 A5 — 착공 실제 2023.12, 준공 예정 2027.02(목록의 다음 일정과 같다), 입주 예정 2027.06, 공정률 마지막 68%(2026.10.07)', () => {
  const id = 'PRJ-41113-0035', d = DET.projects[id], row = rows.find((r) => r.id === id);
  assert.equal(d.stages.COMPLETION.plan, row.next.planned);
  const t = V.timelineOf(d, DET.referenceDate);
  assert.deepEqual(t.years, [2023, 2024, 2025, 2026, 2027]);
  assert.equal(t.todayText, '2026.10');
  assert.ok(t.rows[0].empty && t.rows[1].empty, '①계획·②인허가는 원천 없음(빗금)');
  const build = t.rows[2];
  assert.deepEqual(build.marks.map((m) => [m.kind, m.text]), [['actual', '착공 실제 2023.12']]);
  const [plan, act] = build.bars;
  assert.equal(plan.kind, 'plan'); assert.equal(act.kind, 'actual');
  assert.ok(act.from === plan.from && act.to === t.today && plan.to > t.today, '공사 막대: 착공부터 오늘까지 실선, 준공 예정까지 점선');
  assert.deepEqual(t.rows[4].marks.map((m) => m.text), ['준공 예정 2027.02']);
  assert.deepEqual(t.rows[5].marks.map((m) => m.text), ['입주 예정 2027.06']);
  assert.deepEqual(t.progress[t.progress.length - 1], { at: t.progress[t.progress.length - 1].at, pct: 68, text: '2026.10.07 보고 68%' });
  assert.ok(t.progress.every((p, i, a) => i === 0 || p.at >= a[i - 1].at), '보고일 순');
  const sched = V.scheduleOf(d);
  assert.deepEqual(sched.map((s) => [s.type, s.plan, s.actual]), [['PERMIT', null, null], ['CONSTRUCTION_START', null, '2023-12-21'], ['SUPPLY_NOTICE', null, '2024-11-15'], ['COMPLETION', '2027-02-03', null], ['MOVE_IN', '2027-06', null]]);
});

test('상세의 현재 예정·경과는 목록(지도 색인)과 같은 값이다 — 발급 사업 전부', () => {
  for (const r of rows.filter((x) => x.issued)) {
    const d = DET.projects[r.id];
    if (r.next) assert.equal(d.stages[r.next.eventType]?.plan, r.next.planned, `${r.id} 다음 일정`);
    if (r.overdue && (r.cls === 'delay' || r.cls === 'caution')) assert.equal(d.stages[r.overdue.eventType]?.late?.months, r.overdue.months, `${r.id} 경과`);
    for (const s of Object.values(d.stages)) if (s.late) assert.ok(['delay', 'caution'].includes(s.late.cls), `${r.id}: 경과 1개월 미만은 표시하지 않는다`);
  }
});

test('화면 적용: 사업 상세는 발급 id 전부를 빌드 때 만들고, 대체 id 는 새 id 로 넘기고 숨김 id 는 안내한다. 목록은 발급 사업만 상세로 링크한다', () => {
  const page = read('app/(dashboard)/project/[id]/page.tsx');
  assert.match(page, /export const generateStaticParams = async \(\) => \(await getBoardData\(\)\)\.allProjects\.map\(\(p\) => \(\{ id: p\.id \}\)\);/);
  assert.match(page, /if \(p\.supersededBy\) redirect\(`\/project\/\$\{p\.supersededBy\}`\)/);
  assert.match(page, /p\.hiddenAt \? <Card render=\{<section aria-label="대체됨" \/>\}>/);
  assert.match(page, /<ProjectTimeline t=\{tl\} \/>/);
  const list = read('app/(dashboard)/projects/page.tsx');
  assert.match(list, /name: r\.issued \? \{ text: r\.name, href: `\/project\/\$\{r\.id\}` \} : \{ text: r\.name, title: `발급 전 후보/);
  assert.match(list, /policyStageCells\(pp, f\.policy\.id\)/);
  assert.doesNotMatch(list, /SAMPLE/);
  const rep = read('app/(dashboard)/reports/page.tsx');
  assert.match(rep, /<PolicyTable lines=\{policyLines\} \/>/);
  assert.match(rep, /cells: policyStageCells\(pp, p\.id\)/);
  /* 화면은 자료를 lib/board/projects-index.ts 한 곳에서만 읽는다 */
  for (const f of ['app/(dashboard)/projects/page.tsx', 'app/(dashboard)/project/[id]/page.tsx', 'app/(dashboard)/reports/page.tsx']) assert.doesNotMatch(read(f), /data\/board\/(ledger-map|projects-index|project-detail|policy-progress)\.json/, f);
});
