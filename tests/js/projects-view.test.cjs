'use strict';
/* 사업 화면(2026-10-14, HOME 개념 흡수 시안 v2): tools/ledger/projects-index.js 가 만든 두 파일, lib/board/projects-view.ts 의 렌즈·거르기·핵심 질문·단계 파이프라인·목표 대비·타임라인·서랍,
   그리고 화면 적용(목록 + 상세 서랍 ?id= · 월간 보고 ?print=1 · 옛 주소 넘김 · 발급 사업만 상세)을 고정한다. */
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

const BOARD = require('../../data/board/ledger-board.json');
const MOLIT = require('../../data/board/molit.json');

const rows = V.rowsOf(MAP.bySgg, IDX.projects, IDX.sgg);
const pol = (k) => IDX.policies.find((p) => p.key === k);
const sidoName = (c) => MOLIT.sido.find((x) => x.code === c)?.name ?? c;
const ctx = { pp: PP, policies: IDX.policies, observedMonth: IDX.observedMonth, sidoName, sggName: (c) => (IDX.sgg[c] ?? c).split(' ').slice(1).join(' ') };
const Q = (f) => Object.fromEntries(V.questionsOf(rows, f, ctx).map((q) => [q.q, q]));

test('두 파일은 지금 원장 표에서 다시 만든 것과 바이트가 같다(원장을 갱신하면 node tools/ledger/projects-index.js 를 다시 돌린다)', () => {
  const m = X.loadMonth();
  assert.equal(read(X.INDEX_OUT), X.renderIndex(X.projectsIndexFromLedger(m.tables, m)));
  assert.equal(read(X.DETAIL_OUT), X.renderDetail(X.projectDetailFromLedger(m.tables, m)));
  assert.equal(IDX.referenceDate, MAP.referenceDate, '지도 색인과 같은 기준일');
});

test('목록 행 = 원장의 살아 있는 사업 전부(대체 10·숨김 55 제외), 발급 278 · 후보 2,039', () => {
  assert.equal(rows.length, 2317);
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
  const gone = new Set(REG.filter((p) => p.supersededBy || p.hiddenAt).map((p) => p.id));
  assert.equal(gone.size, 65);
  assert.ok(rows.every((r) => !gone.has(r.id)), '대체·숨김 사업은 목록에 없다');
  assert.equal(rows.filter((r) => r.issued).length, 278);
  const live = new Set(REG.filter((p) => !p.supersededBy && !p.hiddenAt).map((p) => p.id));
  assert.ok(rows.filter((r) => r.issued).every((r) => live.has(r.id)), '발급 행 = 살아 있는 레지스트리 사업');
  assert.deepEqual(Object.keys(DET.projects).sort(), rows.filter((r) => r.issued).map((r) => r.id).sort(), '상세 자료는 발급 사업만');
});

test('렌즈: 9·7 141건 · 1·29 47건 · 8·13 51건(모두 서울·인천·경기), 프로그램 렌즈는 프로그램 목록의 사업 수와 같다', () => {
  const n = (f) => V.applyFilters(rows, f).length;
  assert.deepEqual(IDX.policies.map((p) => [p.key, n({ policy: p })]), [['97', 141], ['129', 47], ['813', 51]]);
  for (const p of IDX.policies) assert.ok(V.applyFilters(rows, { policy: p }).every((r) => r.policies.includes(p.key) && ['11', '28', '41'].includes(r.sgg.slice(0, 2))), p.key);
  for (const g of IDX.programs) assert.equal(n({ program: g }), g.projects, g.name);
  assert.equal(rows.filter((r) => r.policies.length).length, 239, '정책에 연결된 사업');
  const s = V.summaryOf(V.applyFilters(rows, { policy: pol('97') }));
  assert.deepEqual([s.n, s.units, s.notice, s.review, s.confirmed], [141, 129771, 19521, 0, 141], '2026-10-14 판: 재매칭으로 9·7 사업 연결이 모두 확정(2026-10-13 판 검토 137 · 확정 1)');
  /* 렌즈 + 지역 + 단계 + 상태가 함께 걸린다 */
  const f = { policy: pol('97'), sido: '41', stage: '04', status: 'ok' };
  assert.ok(V.applyFilters(rows, f).every((r) => r.policies.includes('97') && r.sgg.startsWith('41') && r.stage === '04' && r.cls === 'ok'));
  assert.equal(V.applyFilters(rows, f, 'stage').length >= V.applyFilters(rows, f).length, true, '계단 건수는 단계 거르기를 빼고 센다');
});

test('거르기 읽기·주소: 맞지 않는 값은 거르지 않고, 렌즈는 하나(정책이 이긴다), 시군구가 시도를 이긴다, 단계는 리본 칸(옛 01~06 도 받는다), 열쇠 순서 고정', () => {
  const ctx = { policies: IDX.policies, programs: IDX.programs, sidoOk: (c) => ['11', '28', '41'].includes(c) };
  assert.deepEqual(V.parseFilters({ policy: 'x', stage: '07', status: 'bad', sgg: '99999', agency: 'lx' }, ctx), {});
  const f = V.parseFilters({ policy: '97', program: '3기 신도시', sido: '11', sgg: '41285', stage: '04', status: 'delay', agency: 'lh' }, ctx);
  assert.equal(f.policy.key, '97'); assert.equal(f.program, undefined); assert.equal(f.sgg, '41285'); assert.equal(f.sido, undefined);
  assert.equal(f.stage, 2, '옛 공식 단계 04 건설 → ③착공 칸(/stage/04·종합상황판 링크)');
  assert.deepEqual(['01', '02', '03', '05', '06', '0', '5'].map((x) => V.parseFilters({ stage: x }, ctx).stage), [0, 0, 1, 3, 4, 0, 5]);
  assert.equal(V.parseFilters({ status: 'check' }, ctx).status, 'check');
  assert.equal(V.listHref(f), '/projects?policy=97&sgg=41285&stage=2&status=delay&agency=lh');
  assert.equal(V.listHref(f, { program: '3기 신도시' }), '/projects?program=3%EA%B8%B0+%EC%8B%A0%EB%8F%84%EC%8B%9C&sgg=41285&stage=2&status=delay&agency=lh', '프로그램을 고르면 정책 렌즈가 풀린다');
  assert.equal(V.listHref(f, { sido: '11' }), '/projects?policy=97&sido=11&stage=2&status=delay&agency=lh', '시도를 고르면 시군구가 풀린다');
  assert.equal(V.listHref({ sido: '41' }, { sgg: '41500' }), '/projects?sgg=41500', '시군구를 고르면 시도가 풀린다');
  assert.equal(V.listHref(f, { id: 'PRJ-41113-0035' }), '/projects?policy=97&sgg=41285&stage=2&status=delay&agency=lh&id=PRJ-41113-0035', '서랍 id 는 거르기를 지킨 채 맨 뒤');
  assert.equal(V.listHref({ metro: true }, { print: '1' }), '/projects?print=1', '기본 범위(수도권)는 주소에 적지 않는다');
  assert.equal(V.listHref({}, { print: '1' }), '/projects?sido=all&print=1', '전국은 ?sido=all');
  assert.equal(V.listHref(f, { policy: undefined, program: undefined, sgg: undefined, stage: undefined, status: undefined, agency: undefined }), '/projects');
  /* 기관·상태·단계가 함께 걸린다 */
  const g = { agency: 'lh', status: 'check', stage: 2 };
  assert.ok(V.applyFilters(rows, g).every((r) => r.agency === 'lh' && ['caution', 'delay'].includes(r.cls) && r.board === 2));
  assert.deepEqual(['lh', 'sh', 'gh', 'etc'].map((a) => V.applyFilters(rows, { agency: a }).length), [269, 24, 4, 2020], '기타 = 기관 미연결(지자체·국방부 포함)');
});

test('상태: 지연 중 경과 12개월 이상은 장기 지연, 점검 필요 = 주의·지연·장기 지연(지연 개월 큰 순)', () => {
  const n = (s) => rows.filter((r) => V.statusOf(r) === s).length;
  assert.deepEqual(['ok', 'caution', 'delay', 'long', 'none'].map(n), [1607, 86, 96, 219, 309]);
  assert.equal(n('delay') + n('long'), BOARD.judgment.delay.projects, '지연 + 장기 지연 = 보드 판정 지연');
  assert.equal(n('caution'), BOARD.judgment.caution.projects);
  const chk = V.listOrder(V.applyFilters(rows, { status: 'check' }), { status: 'check' });
  assert.equal(chk.length, 401);
  /* 번호가 있는 사업 먼저, 후보 사업은 뒤(2026-10-15 결정) — 그 안에서 지연 개월 큰 순 */
  const sameGroup = (a, b) => !!a.issued === !!b.issued;
  assert.ok(chk.every((r, i) => i === 0 || (!!chk[i - 1].issued >= !!r.issued && (!sameGroup(chk[i - 1], r) || V.lateOf(chk[i - 1]) >= V.lateOf(r)))), '번호 있는 사업 먼저 · 지연 개월 큰 순');
  const top = V.priorityOf(rows);
  assert.deepEqual(top.map(V.lateOf), [81, 71, 70, 68, 65, 58, 58, 50, 49, 43], '월간 보고 우선 점검 상위 10');
  assert.deepEqual([top[5].name, top[5].count, top[5].units], ['온천2구역아파트', 4, 3853], '같은 시군구·같은 이름(한 단지의 동·공구)은 한 줄로 합친다 — 상위 10에 같은 이름이 되풀이되지 않는다');
  assert.equal(new Set(top.map((r) => `${r.sgg}|${r.name}`)).size, top.length);
  const all = V.listOrder(V.applyFilters(rows, {}));
  assert.ok(all.every((r, i) => i === 0 || (!!all[i - 1].issued >= !!r.issued && (!sameGroup(all[i - 1], r) || (V.lateOf(all[i - 1]) ?? -1) >= (V.lateOf(r) ?? -1)))), '목록 기본 순서 = 번호 있는 사업 먼저, 그 안에서 점검 필요 순(지연 개월 큰 순, 경과 없는 사업은 뒤)');
});

test('핵심 질문 5(전체): 9·7 ①계획 확인 3,560 / 목표 14,694 → 75.8% 부족 · ② 인허가 113,632호 · 지연 315건 · 대구 · 앞으로 12개월 준공 214,975호(= 종합상황판 향후 12개월)', () => {
  const q = Q({});
  assert.deepEqual(Object.keys(q), ['9·7 대책 목표 대비(정책 전체)', '어디서 막혀 있는가', '어떤 사업이 늦어지는가', '어디를 먼저 챙기는가', '앞으로 얼마나 공급되는가'], '첫 칸은 범위(정책 전체)를 이름에');
  const a = q['9·7 대책 목표 대비(정책 전체)'];
  assert.deepEqual([a.value, a.unit, a.sub, a.tone, a.href], ['75.8', '% 부족', '①계획 확인 3,560 / 목표 14,694', 'bad', '/projects?policy=97&sido=all']);
  for (const x of Object.values(q)) assert.ok(x.help && !/policy-progress|samePeriod|HOME|원장/.test(x.help), `ⓘ 정의는 쉬운 말: ${x.q}`);
  assert.match(a.tip, /담당자 추정 포함\(확인과 따로\): ①계획 5,789호/, '추정 포함은 title 에만');
  assert.deepEqual([q['어디서 막혀 있는가'].value, q['어디서 막혀 있는가'].sub, q['어디서 막혀 있는가'].href], ['② 인허가', '병목 · 지연(장기 포함) 83,715호', '/projects?sido=all&stage=1&status=check']);
  assert.deepEqual([q['어떤 사업이 늦어지는가'].value, q['어떤 사업이 늦어지는가'].sub, q['어떤 사업이 늦어지는가'].href], ['315', '지연 6~12개월 96 · 장기 12개월+ 219', '/projects?sido=all&status=check'], '보조 줄 = 머리 숫자의 구성(지연 + 장기), 주의는 따로');
  assert.deepEqual([q['어디를 먼저 챙기는가'].value, q['어디를 먼저 챙기는가'].sub, q['어디를 먼저 챙기는가'].href], ['대구', '지연·주의 25,072호', '/projects?sido=27']);
  const up = BOARD.upcoming.reduce((s, x) => ({ units: s.units + x.units, projects: s.projects + x.projects }), { units: 0, projects: 0 });
  assert.deepEqual([q['앞으로 얼마나 공급되는가'].value, q['앞으로 얼마나 공급되는가'].sub, q['앞으로 얼마나 공급되는가'].href], [up.units.toLocaleString('en-US'), `앞으로 12개월 준공 예정 · ${up.projects}건`, '/region?sido=all']);
  assert.equal(up.units, 214975);
});

test('핵심 질문 5(9·7 렌즈): ③착공 3,510호 · 지연 2건(장기 2·주의 2) · 인천 2,890호 · 13,372호 24건 / 1·29 는 목표가 없어 정상 비율 / 시도를 고르면 시군구', () => {
  const q = Q({ policy: pol('97') });
  assert.deepEqual(Object.values(q).map((x) => [x.value, x.sub]), [['75.8', '①계획 확인 3,560 / 목표 14,694'], ['③ 착공', '병목 · 지연(장기 포함) 1,666호'], ['2', '지연 6~12개월 0 · 장기 12개월+ 2'], ['인천', '지연·주의 2,890호'], ['13,372', '앞으로 12개월 준공 예정 · 24건']]);
  assert.equal(q['9·7 대책 목표 대비(정책 전체)'].href, undefined, '이미 9·7 렌즈');
  const q129 = Q({ policy: pol('129') });
  assert.deepEqual([q129['계획대로 가고 있는가'].value, q129['계획대로 가고 있는가'].unit, q129['계획대로 가고 있는가'].sub], ['100', '% 정상', '판정 38건 · 일정 없음 9']);
  assert.deepEqual([q129['어디서 막혀 있는가'].value, q129['어디서 막혀 있는가'].muted, q129['어디서 막혀 있는가'].href], ['없음', true, undefined]);
  const qm = Q({ metro: true });
  assert.deepEqual([qm['어디서 막혀 있는가'].href, qm['앞으로 얼마나 공급되는가'].href], ['/projects?sido=metro&stage=2&status=check', '/region'], '수도권(기본) 범위의 링크는 수도권을 지킨다');
  const q41 = Q({ sido: '41' });
  assert.deepEqual([q41['어디를 먼저 챙기는가'].value, q41['어디를 먼저 챙기는가'].href], ['이천시', '/projects?sgg=41500']);
  assert.equal(q41['앞으로 얼마나 공급되는가'].href, '/region?sido=41');
});

test('단계 파이프라인: 거쳐 간 사업(실제 기록 또는 지금 그 단계)이 있는 칸만 열고 나머지는 접은 한 칸 — 전체 ⑥만, 9·7 ⑤⑥, 1·29 ②~⑥', () => {
  const p = (f) => V.pipelineOf(V.applyFilters(rows, f, 'stage'));
  const all = p({});
  assert.deepEqual(all.open.map((c) => [c.i, c.n]), [[0, 2306], [1, 1967], [2, 615], [3, 582], [4, 382]]);
  assert.deepEqual(all.shut, [5]);
  assert.equal(all.total, 2317);
  assert.equal(all.open[0].units, rows.reduce((s, r) => s + r.units, 0), '①은 계획 호수가 있거나 지금 ①인 사업(호수 0 은 더해도 합은 같다)');
  const p97 = p({ policy: pol('97') });
  assert.deepEqual([p97.open.map((c) => [c.i, c.n, c.units]), p97.shut, p97.total], [[[0, 141, 129771], [1, 10, 6751], [2, 103, 70673], [3, 35, 24468]], [4, 5], 141]);
  assert.deepEqual(p({ policy: pol('129') }).shut, [1, 2, 3, 4, 5]);
  assert.ok(rows.every((r) => r.reached.every((i) => i >= 1 && i <= 5)), 'reached 는 리본 칸 1~5');
});

test('9·7 목표 대비 = policy-progress samePeriod(2026-01~09), 확인과 담당자 추정을 나눈다: 공급 목표 8,049 · 확인 4,732 · 추정 포함 8,742 → 부족 41.2%', () => {
  const cells = V.policyStageCells(PP, 'POL_2025_0907');
  const st = PP.policies[0].stages;
  assert.deepEqual(cells.map((c) => c.key), ['BUSINESS', 'APPROVAL', 'CONSTRUCTION', 'SUPPLY', 'COMPLETION', 'MOVE_IN']);
  for (const c of cells) {
    const s = st[c.key].samePeriod.find((y) => y.year === 2026);
    assert.deepEqual([c.target, c.actual, c.withEst, c.gap, c.shortfallPct, c.review], [s.target, s.actual, s.actualWithEstimates, s.gap, s.shortfallPct, s.actualReviewUnits], c.key);
  }
  const sup = cells[3];
  assert.deepEqual([sup.state, sup.target, sup.actual, sup.withEst, sup.gap, sup.shortfallPct], ['short', 8049, 4732, 8742, 3317, 41.2]);
  assert.equal(V.hasEstimate(sup), true);
  assert.equal(Math.round(sup.fill * 10) / 10, 58.8); assert.equal(sup.estFill, 100, '추정 포함 막대는 목표에서 멈춘다');
  for (const t of ['확인 4,732호', '추정 포함 8,742호', '8,049', '부족 3,317호(41.2%)', '2026.01~2026.09']) assert.ok(V.stageCellTip(sup).includes(t), t);
  const biz = cells[0];
  assert.deepEqual([biz.state, biz.target, biz.actual, biz.withEst, biz.gap, biz.shortfallPct], ['short', 14694, 3560, 5789, 11134, 75.8]);
  assert.deepEqual(cells.map((c) => c.state), ['short', 'met', 'noTarget', 'short', 'met', 'none'], '착공은 같은 기간 목표가 없다(연말 점), 입주는 목표·확인 모두 없음');
  assert.deepEqual(cells[2].yearEnd, { date: '2026-12-31', units: 269000 }, '착공은 9·7 원문 연도별 목표의 연말 점');
  assert.equal(cells[2].withEst, cells[2].actual, '착공(지역 통계)·준공은 추정 입력이 없다');
  assert.deepEqual(cells.map(V.hasTarget), [true, true, true, true, true, false]);
  assert.equal(V.policyStageCells(PP, 'POL_2026_0129'), null, '1·29·8·13 은 비교 자료 없음');
});

test('목표 대비 줄: 렌즈 전체 = 목표가 배정된 정책(9·7)만 · ⑥ 목표 미배정 한 번 · 9·7 렌즈도 같은 한 줄 · 1·29 렌즈는 없음', () => {
  const all = V.compareLines(PP, IDX.policies, rows, IDX.policies.map((p) => p.key));
  assert.deepEqual(all.map((l) => [l.policy.key, l.n, l.units, l.none, l.review, l.confirmed]), [['97', 141, 129771, [5], 0, 141]]);
  assert.deepEqual(V.compareLines(PP, IDX.policies, rows, ['97']).map((l) => l.policy.key), ['97']);
  assert.deepEqual(V.compareLines(PP, IDX.policies, rows, ['129']), []);
});

test('단계 타임라인(서랍): 수원당수 A5 — 기록 있는 단계만 ③④⑤⑥ 줄, 착공 실제 2023.12 공사 막대(오늘까지)·준공 예정 2027.02·입주 예정 2027.06, 공정률 마지막 68%', () => {
  const id = 'PRJ-41113-0035', d = DET.projects[id], row = rows.find((r) => r.id === id);
  assert.equal(d.stages.COMPLETION.plan, row.next.planned);
  const t = V.timelineOf(d, DET.referenceDate);
  assert.deepEqual(t.years, [2023, 2024, 2025, 2026, 2027]);
  assert.equal(t.todayText, '2026.10');
  assert.deepEqual(t.lanes.map((l) => l.board), [2, 3, 4, 5], '①계획·②인허가는 기록이 없어 줄이 없다');
  const build = t.lanes[0];
  assert.equal(build.actual.title, '착공 실제 2023.12.21');
  assert.ok(build.actualBar.from === build.planBar.from && build.actualBar.to === t.today && build.planBar.to > t.today, '공사 막대: 착공부터 오늘까지 실선, 준공 예정까지 점선');
  assert.deepEqual(t.lanes.map((l) => l.plan?.tag ?? null), [null, null, '2027.02', '2027.06']);
  assert.deepEqual(t.lanes.map((l) => l.actual?.tag ?? null), ['2023.12', '2024.11', null, null]);
  assert.deepEqual(t.used, { plan: true, actual: true, late: false, missing: false }, '범례는 그린 표지만');
  assert.deepEqual(t.progress[t.progress.length - 1], { at: t.progress[t.progress.length - 1].at, pct: 68, text: '2026.10.07 보고 68%' });
  assert.ok(t.progress.every((p, i, a) => i === 0 || p.at >= a[i - 1].at), '보고일 순');
  const late = V.timelineOf({ ...d, progress: [], stages: { CONSTRUCTION_START: { plan: '2025-03', late: { months: 7, cls: 'delay' } }, COMPLETION: { plan: '2026-01', actual: '2026-04' } } }, DET.referenceDate);
  assert.deepEqual([late.lanes[0].plan.tag, late.lanes[0].plan.late, late.lanes[0].late.months], ['2025.03 +7개월', 'delay', 7]);
  assert.match(late.lanes[0].missing, /예정일이 지났는데 실제 기록 없음/);
  assert.equal(late.lanes[1].actual.title, '준공 실제 2026.04 · 현재 예정 대비 +3개월', '예정 대비 차이는 실제 점의 title');
  assert.deepEqual(late.used, { plan: true, actual: true, late: true, missing: true });
});

test('상세의 현재 예정·경과는 목록(지도 색인)과 같은 값이다 — 발급 사업 전부', () => {
  for (const r of rows.filter((x) => x.issued)) {
    const d = DET.projects[r.id];
    if (r.next) assert.equal(d.stages[r.next.eventType]?.plan, r.next.planned, `${r.id} 다음 일정`);
    if (r.overdue && (r.cls === 'delay' || r.cls === 'caution')) assert.equal(d.stages[r.overdue.eventType]?.late?.months, r.overdue.months, `${r.id} 경과`);
    for (const s of Object.values(d.stages)) if (s.late) assert.ok(['delay', 'caution'].includes(s.late.cls), `${r.id}: 경과 1개월 미만은 표시하지 않는다`);
  }
});

test('서랍이 열 것(?id=): 발급 사업 → 그 사업, 대체된 옛 id → 대표 사업(옛 id 안내), 숨김 → 안내 한 줄, 발급 전 후보·없는 id → 열지 않음', () => {
  const has = (id) => id in DET.projects;
  assert.deepEqual(V.drawerTarget('PRJ-41113-0035', REG, has), { kind: 'detail', id: 'PRJ-41113-0035', from: null });
  const sup = REG.filter((p) => p.supersededBy);
  assert.ok(sup.length > 0);
  for (const p of sup) assert.deepEqual(V.drawerTarget(p.id, REG, has), { kind: 'detail', id: p.supersededBy, from: { id: p.id, name: p.name } }, p.id);
  const hid = REG.filter((p) => p.hiddenAt && !p.supersededBy);
  assert.equal(hid.length, 55);
  for (const p of hid) assert.equal(V.drawerTarget(p.id, REG, has).kind, 'hidden', p.id);
  const cand = rows.find((r) => !r.issued);
  assert.equal(V.drawerTarget(cand.id, REG, has), null, '발급 전 후보는 임시 번호라 서랍을 열지 않는다');
  for (const x of ['PRJ-0000-0001', 'x', '']) assert.equal(V.drawerTarget(x, REG, has), null, x);
});

test('화면 적용: 목록은 발급 사업을 상세 서랍(?id=), 번호 발급 전 사업을 간단 보기(?cand=)로 열고, 서랍은 그 사업 자료만 서버에서 그린다. 인쇄 보기는 요약·우선 점검·출처만', () => {
  const page = read('app/(dashboard)/projects/page.tsx');
  const lst = read('lib/board/projects-list.ts');
  assert.match(lst, /const href = r\.issued \? listHref\(f, \{ id: r\.id \}\) : listHref\(f, \{ cand: r\.id \}\);/);
  assert.match(lst, /id: r\.id, href, sel: r\.id === sel,/, '행을 누르면 서랍, 열린 사업은 선택 표시');
  assert.match(page, /const gridRows: Row\[\] = listRows\(list, f, sel,/, '화면 표와 CSV 가 같은 행');
  assert.match(page, /getProjectDrawer\(id\)/);
  assert.match(page, /<Drawer id=\{drawer \? id : null\} canonical=\{sel\} closeHref=\{listHref\(f\)\}/);
  assert.doesNotMatch(page, /<ReqTags/, '요구사항 칩은 데이터 원본에만');
  assert.match(page, /href=\{listHref\(f, \{ print: '1' \}\)\}/, '보고서 인쇄는 지금 거르기를 지킨 인쇄 보기');
  const printBranch = page.slice(page.indexOf('if (print) {'), page.indexOf('/* 목록:'));
  for (const x of ['{reportHead}', '{summary}', '{report}', '<PrintButton']) assert.ok(printBranch.includes(x), x);
  for (const x of ['<DataGrid label="사업 목록"', '<Drawer', '<ChipBar']) assert.ok(!printBranch.includes(x), `인쇄 보기에 ${x} 없음`);
  assert.match(page, /print:hidden/, '@media print 도 같은 보고 보기');
  assert.doesNotMatch(page, /SAMPLE/);
  const drawer = read('components/projects/Drawer.tsx');
  assert.match(drawer, /e\.key !== 'Escape'/); assert.match(drawer, /window\.history\.go\(-n\.depth\)/); assert.match(drawer, /router\.replace\(closeHref, \{ scroll: false \}\)/);
  assert.match(drawer, /w-\[min\(60vw,980px\)\]/, '오른쪽 약 60% 폭');
  const det = read('components/projects/ProjectDetail.tsx');
  assert.match(det, /<StageSteps current=\{r\.board\} reached=\{r\.reached\}/, '서랍의 단계 줄도 목록과 같은 리본 칸 번호');
  assert.match(det, />당초 일정 없음</, "타임라인 머리에 '당초 일정 없음' 한 번");
  assert.match(det, /hiddenNote\(p\.hiddenAt!, p\.hiddenReason\)/);
  /* 화면은 자료를 lib/board/projects-index.ts 한 곳에서만 읽고, 옛 상세·보고자료 화면은 없다 */
  for (const f of ['app/(dashboard)/projects/page.tsx', 'components/projects/ProjectDetail.tsx', 'components/projects/Summary.tsx']) assert.doesNotMatch(read(f), /data\/board\/(ledger-map|projects-index|project-detail|policy-progress)\.json/, f);
  for (const f of ['app/(dashboard)/project', 'app/(dashboard)/reports']) assert.ok(!fs.existsSync(path.join(ROOT, f)), f);
});

test('옛 주소 넘김(next.config.ts redirects, 모두 307): 사업 상세 → 서랍, 보고자료 → 인쇄 보기, 공급 실적·시행주체별·우리 동네 → 지역 공급. 월·기관 상세는 넘기지 않는다', async () => {
  const cfg = require('../../next.config.ts').default;
  const list = await cfg.redirects();
  assert.deepEqual(list.map((r) => [r.source, r.destination]), [
    ['/stage', '/projects'], ['/stage/:id(0[1-6])', '/projects?stage=:id'], ['/area/:sgg(\\d{5})', '/projects?sgg=:sgg'],
    ['/project/:id', '/projects?id=:id'], ['/reports', '/projects?print=1'],
    ['/area', '/region'], ['/area/:sido(\\d{2})', '/region?sido=:sido'], ['/agency', '/region'], ['/my-area', '/region'], ['/my-area/:sido', '/region?sido=:sido'],
  ]);
  assert.ok(list.every((r) => r.permanent === false), '임시(307)');
  for (const p of ['/month', '/agency/:']) assert.ok(!list.some((r) => r.source.startsWith(p)), `${p} 는 넘기지 않는다`);
  assert.ok(fs.existsSync(path.join(ROOT, 'app/(dashboard)/month/[id]/page.tsx')) && fs.existsSync(path.join(ROOT, 'app/(dashboard)/agency/[id]/page.tsx')));
});

test('숨김 사업 안내: 한 줄 + 이유는 title, 덤프 판 번호·내부 문서 이름은 내지 않는다 · 시군구는 이름', () => {
  const h = REG.filter((p) => p.hiddenAt);
  assert.ok(h.length > 0);
  for (const p of h) {
    const n = V.hiddenNote(p.hiddenAt, p.hiddenReason);
    assert.equal(n.text, `${p.hiddenAt.replace(/-/g, '.')}부터 목록에서 뺀 사업입니다 · 대신할 사업 없음`);
    assert.doesNotMatch(n.title, /데이터-정제|절 \d|\d{8}T\d{6}Z/, p.id);
    assert.ok(IDX.sgg[p.sgg], `${p.id}: 시군구 ${p.sgg} 이름이 있다`);
  }
  assert.equal(V.hiddenNote('2026-10-14', 'HOME 덤프 20261013T140241Z 에 대응 사업이 없다(수도권은 HOME 이 정본 — 데이터-정제-계획 6절 3)').title, 'HOME 자료에 대응 사업이 없다(수도권은 HOME 이 정본)');
});
