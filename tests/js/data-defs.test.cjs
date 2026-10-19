'use strict';
/* 데이터 정의 3가지(2026-10-15 사용자 결정)를 계산·자료·화면에 일관되게 반영했는지 고정한다.
   D3 판정 건수는 사업 번호가 있는 사업(issued)만, 번호가 없는 후보는 같은 계산을 '확인 필요(후보)'로 따로.
   D4 '이 단계까지 온 사업'은 현재 단계 기준 누적(①계획 = 전체), '지금 이 단계'·병목은 현재 단계 그대로.
   D2 준공 예정 판정은 HOME 날짜, LH 준공 예정 파일(data/board/lh-completion.json)과 다르면 표지(dateAlt — 지도 계약 필드). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('node:module').registerHooks({ resolve(s, c, n) { try { return n(s, c); } catch (e) { if (/^\.\.?\//.test(s)) return n(`${s}.ts`, c); throw e; } } });

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const V = require('../../lib/board/projects-view.ts');
const L = require('../../lib/board/projects-list.ts');
const S = require('../../lib/grid/spec.ts');
const M = require('../../lib/board/metro-overview.ts');
const { makeDirectives } = require('../../lib/board/directives.ts');
const B = require('../../tools/ledger/board.js');
const MAP = require('../../data/board/ledger-map.json');
const IDX = require('../../data/board/projects-index.json');
const PP = require('../../data/board/policy-progress.json');
const BOARD = require('../../data/board/ledger-board.json');
const LH = require('../../data/board/lh-completion.json');

const rows = V.rowsOf(MAP.bySgg, IDX.projects, IDX.sgg);
const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
const fctx = { policies: IDX.policies, programs: IDX.programs, sidoOk: () => true, guOf: M.guOf };
const pf = (q) => V.parseFilters(q, fctx);
const sido = (c) => ({ 11: '서울', 28: '인천', 41: '경기' })[c] ?? c;
const qctx = { pp: PP, policies: IDX.policies, observedMonth: IDX.observedMonth, sidoName: sido, sggName: (c) => c };
const Q = (q) => Object.fromEntries(V.questionsOf(rows, pf(q), qctx).map((x) => [x.q, x]));
const sum = (xs) => xs.reduce((s, x) => s + x, 0);

/* ---------- D3 ---------- */
test('D3: 지연 건수는 번호 있는 사업만(2건), 후보는 확인 필요로 따로(수도권 한정으로 0건) — 예전 전국 315건 = 2 + 313', () => {
  const j = BOARD.judgment, c = j.candidate;
  assert.deepEqual([j.ok.projects, j.caution.projects, j.delay.projects], [165, 2, 2]);
  // 2026-10-19 수도권 한정: 번호 없는 후보(건축HUB 대용량·LH 준공예정)가 원장에서 빠져 후보 계산 1442·84·313 → 0·0·0, 후보 판정 1,839 → 0. 그래서 지연 합 = 2, 주의 합 = 2, 정상 합 = 165
  assert.deepEqual([c.ok.projects, c.caution.projects, c.delay.projects], [0, 0, 0]);
  assert.equal(j.delay.projects + c.delay.projects, 2);
  assert.equal(j.caution.projects + c.caution.projects, 2);
  assert.equal(j.ok.projects + c.ok.projects, 165);
  assert.equal(BOARD.scope.judged, 169);
  assert.equal(BOARD.scope.candidateJudged, 0);
  /* 행에서 다시 센 값 = 집계 */
  assert.equal(rows.filter((r) => r.issued && r.cls === 'delay').length, j.delay.projects);
  assert.equal(rows.filter((r) => !r.issued && r.cls === 'delay').length, c.delay.projects);
  assert.ok(rows.filter((r) => r.issued && r.cls).every((r) => V.statusOf(r) !== 'review'));
  assert.ok(rows.filter((r) => !r.issued && r.cls).every((r) => V.statusOf(r) === 'review'), '후보는 상태가 확인 필요');
  /* 이번 달 판정 행(지연·주의 추이·선택 달 판정)도 같은 나눔 */
  const own = BOARD.trend[BOARD.trend.length - 1];
  assert.equal(own.month, BOARD.observedMonth);
  assert.deepEqual([own.delay, own.candidate.delay], [j.delay, { projects: c.delay.projects, units: c.delay.units }]);
  assert.deepEqual(BOARD.delayByStage, V.delayByStageOf(rows), '단계별 지연 호수(병목)도 번호 있는 사업만');
});

test('D3: 후보 행의 상태 칸·간단 보기는 \'확인 필요\'(판정과 다른 모양), 같은 계산 결과는 title·보조 글', () => {
  // 2026-10-19 수도권 한정: 원장에 후보 행이 없다(전엔 후보 1,839곳) → 후보 모양은 번호 있는 지연 사업에서 issued 를 끈 합성 행으로 확인하고, 실제 후보 행은 0임을 본다
  assert.equal(rows.filter((r) => !r.issued).length, 0, '원장에 번호 없는 후보 행이 없다');
  const cand = { ...rows.find((r) => r.issued && r.cls === 'delay'), issued: false };
  const cell = L.statusCell(cand);
  assert.equal(cell.text, '확인 필요');
  assert.equal(cell.mark, 'outline');
  assert.equal(cell.tone, undefined, '지연처럼 빨간 글자가 아니다');
  assert.match(cell.title, /계산하면 (지연|장기 지연)/);
  const late = L.lateCell(cand);
  assert.equal(late.muted, true, '지연(개월)은 옅게');
  assert.equal(V.lateOf(cand), null, '판정 지연 개월은 없다');
  assert.equal(V.STATUS_NAME.review, '확인 필요');
  assert.equal(V.STATUS_RANGE.review, '확인 필요(후보)');
  const comp = read('components/projects/Candidate.tsx');
  assert.match(comp, /statusLabel\(r\)\}\{st === 'review'/, '간단 보기의 판정 칸도 statusLabel(=확인 필요)');
  assert.match(comp, /계산하면 \{STATUS_NAME\[calcOf\(r\)\]\}/);
  assert.equal(V.applyFilters(rows, pf({ sido: 'all', status: 'review' })).length, 0, '상태 거르기 ?status=review — 후보가 없어 0건(전엔 1,839)');
});

test('D3: 종합상황판 지연 = 사업 화면 지연, 시도 타일 지연율은 번호 있는 사업으로, 판정 시도는 수도권 3곳', () => {
  const d = makeDirectives({ sourceCount: 1, stageNames: V.BOARD_NAMES, ledger: BOARD, start: { year: '2026', upto: 8, cum: 1, cumLy: 1 }, bottleneck: V.bottleneckOf });
  const q = Q({ sido: 'all' })['어떤 사업이 늦어지는가'];
  // 2026-10-19 수도권 한정: 후보 0이라 카드 한 줄이 '지연 확정 n건 · 후보 계산 n건' → '지연 n건'(쌍 숫자 없음)
  assert.equal(d[4].m, `지연 ${BOARD.judgment.delay.projects}건`);
  assert.equal(q.value, String(BOARD.judgment.delay.projects), '종합상황판 지연 = 사업 화면 지연(수도권)');
  assert.doesNotMatch(q.sub, /확인 필요\(후보\)/, '2026-10-19 수도권 한정: 후보 0이라 보조 글에 \'· 확인 필요(후보) n\' 이 붙지 않는다(전엔 313)');
  assert.equal(d[2].m, `병목 ${V.BOARD_NAMES[V.bottleneckOf(BOARD.delayByStage).i]} ${BOARD.delayByStage[2].toLocaleString('en-US')}호`);
  assert.equal(Q({ sido: 'all' })['어디서 막혀 있는가'].value, '③ 착공', '병목도 같은 값');
  for (const r of BOARD.regions) {
    const xs = rows.filter((x) => x.sgg.startsWith(r.code));
    assert.equal(r.judged, xs.filter((x) => x.issued && x.cls).length, r.code);
    assert.equal(r.delay, xs.filter((x) => x.issued && x.cls === 'delay').length, r.code);
    assert.equal(r.candidate.judged, xs.filter((x) => !x.issued && x.cls).length, r.code);
  }
  assert.deepEqual(BOARD.regions.filter((r) => r.judged).map((r) => [r.code, r.delay, r.judged]), [['11', 0, 45], ['28', 2, 19], ['41', 0, 105]]);
  const board = read('components/board/Board.tsx');
  assert.match(board, /data-slot="board-cand"/, '선택 시점 판정 카드에 확인 필요(후보) 줄');
  assert.match(board, /status=review/, '후보 목록 링크');
});

/* ---------- D4 ---------- */
test('D4: 이 단계까지 온 사업은 현재 단계 기준 누적 — ①계획 = 전체(수도권 262/262), 칸이 뒤로 갈수록 줄어든다(단조 감소)', () => {
  for (const q of [{}, { sido: 'all' }, { sido: '41' }, { policy: '97' }]) {
    const scope = V.applyFilters(rows, pf(q), 'stage'), p = V.pipelineOf(scope);
    const n = V.BOARD_NAMES.map((_, i) => scope.filter((r) => V.reachedAt(r, i)).length);
    assert.equal(n[0], scope.length, `${JSON.stringify(q)} ① = 전체`);
    assert.ok(n.every((v, i) => i === 0 || v <= n[i - 1]), `${JSON.stringify(q)} 단조 감소 ${n}`);
    for (const c of p.open) assert.ok(c.now <= c.n, '지금 이 단계 ≤ 이 단계까지 온 사업');
    /* 지금 이 단계는 현재 단계 그대로 */
    for (const c of p.open) assert.equal(c.now, scope.filter((r) => r.board === c.i).length);
  }
  const metro = V.pipelineOf(V.applyFilters(rows, pf({}), 'stage'));
  assert.deepEqual([metro.open[0].n, metro.total, metro.open[0].units], [262, 262, 227976]);
  assert.deepEqual(metro.open.map((c) => [c.i, c.n, c.now]), [[0, 262, 143], [1, 119, 12], [2, 107, 71], [3, 36, 36]]);
});

/* ---------- D2 ---------- */
test('D2: 원천 날짜 다름 — HOME 준공 예정과 LH 준공 예정 파일이 다른 사업에 dateAlt(판정은 HOME 날짜 그대로)', () => {
  const want = { 'PRJ-28290-0058': '2028-12-31', 'PRJ-28290-0057': '2026-12-31', 'PRJ-41500-0072': '2026-12-31', 'PRJ-41131-0050': '2026-12-31', 'PRJ-28245-0055': '2026-10-31', 'PRJ-28245-0057': '2026-10-31' };
  for (const [id, lh] of Object.entries(want)) assert.deepEqual(byId[id].dateAlt, { source: 'LH', planned: lh }, id);
  const flagged = rows.filter((r) => r.dateAlt);
  assert.equal(flagged.length, 71);
  assert.ok(flagged.every((r) => V.isMetro(r.sgg) && r.issued && !r.done), 'HOME 사업 중 준공 실제가 없는 사업만');
  assert.ok(flagged.every((r) => LH.blocks.some((b) => b.date === r.dateAlt.planned)), 'LH 날짜는 파일에 있는 값');
  /* 판정은 HOME 날짜: 인천검단 AA13-1 은 HOME 2025.02.18 로 장기 지연 그대로 */
  const aa = byId['PRJ-28290-0058'];
  assert.deepEqual([aa.overdue.planned, V.statusOf(aa)], ['2025-02-18', 'long']);
  assert.deepEqual([byId['PRJ-28290-0057'].overdue.planned, V.statusOf(byId['PRJ-28290-0057'])], ['2026-08-07', 'caution']);
  /* 같은 날짜면 표지 없음 · 준공 실제가 있으면 표지 없음 */
  const t = B.loadTables(), ref = MAP.referenceDate;
  const { projects } = B.projectStates(t, ref);
  const m = B.dateAltOf(projects, LH.blocks);
  assert.equal(m.size, flagged.length);
  const same = projects.find((x) => x.home && x.plan.COMPLETION && !m.has(x.p.local_project_id) && LH.blocks.some((b) => `${b.district} ${b.block}` === x.p.project_name && b.date === (x.plan.COMPLETION.event_date ?? '')));
  if (same) assert.ok(!byId[same.p.local_project_id].dateAlt, 'HOME 날짜와 같은 LH 날짜가 있으면 표지 없음');
});

test('D2: 표지는 목록 현재 예정 칸·서랍·간단 보기·CSV 비고 열에 같은 말로', () => {
  const r = byId['PRJ-28290-0058'];
  assert.equal(V.dateAltOf(r).text, '원천 날짜 다름(LH 2028.12)');
  assert.equal(L.nextCell(r).tag, '원천 날짜 다름(LH 2028.12)', '목록 칸 꼬리표');
  assert.match(L.nextCell(r).title, /HOME 2025\.02\.18 · LH 준공 예정 파일 2028\.12\.31 · 판정은 HOME 날짜로/);
  assert.equal(V.dateAltOf(byId['PRJ-28245-0055']).text, '원천 날짜 다름(LH 2026.10.31)', '같은 달이면 일까지');
  assert.match(V.dateAltOf(byId['PRJ-41290-0031']).text, /^원천 날짜 다름\(LH 준공 2027\.08\)$/, '보이는 예정이 준공이 아니면 LH 준공');
  assert.equal(V.nextOf(r).alt.text, '원천 날짜 다름(LH 2028.12)', '간단 보기(nextOf.alt)');
  assert.match(read('components/projects/Candidate.tsx'), /next\.alt \?/);
  assert.match(read('components/projects/ProjectDetail.tsx'), /const alt = dateAltOf\(r, true\)[\s\S]*\{alt\.text\}/, '서랍 타임라인 머리');
  const f = pf({ sido: 'all' }), list = V.listOrder(V.applyFilters(rows, f)), grid = L.listRows(list, f, null, sido);
  const cols = L.csvCols(L.dropBlank(L.LIST_COLS, grid).cols);
  assert.equal(cols[cols.length - 1].label, '비고');
  const csv = S.toCsv(cols, L.csvRows(grid)).split('\r\n').filter(Boolean);
  const line = csv.find((l) => l.startsWith('PRJ-28290-0058,'));
  assert.match(line, /원천 날짜 다름\(LH 2028\.12\) — HOME 2025\.02\.18 · LH 준공 예정 파일 2028\.12\.31 · 판정은 HOME 날짜로/);
  assert.equal(csv.filter((l) => l.includes('원천 날짜 다름(')).length, 71);
});

test('D2 지도 계약: 원장 행(ledger-map·home-map)의 dateAlt = { source: \'LH\', planned: \'YYYY-MM-DD\' } 이름 그대로', () => {
  const homeRows = fs.readdirSync(path.join(ROOT, 'data/board/home-map')).filter((f) => /^\d{5}\.json$/.test(f)).flatMap((f) => JSON.parse(read(`data/board/home-map/${f}`)).projects);
  const withAlt = homeRows.filter((r) => r.dateAlt);
  assert.equal(withAlt.length, 71);
  for (const r of withAlt) {
    assert.deepEqual(Object.keys(r.dateAlt), ['source', 'planned']);
    assert.equal(r.dateAlt.source, 'LH');
    assert.match(r.dateAlt.planned, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(r.dateAlt, byId[r.id].dateAlt, `${r.id} 지도 = 사업 화면`);
  }
});

/* ---------- 화면 사이 불변식 ---------- */
test('불변식: CSV = 목록(행·순서), 9·7 숫자, 수도권 227,976호·262건, 향후 12개월 준공 그대로', () => {
  const f = pf({ sido: 'all' }), list = V.listOrder(V.applyFilters(rows, f)), grid = L.listRows(list, f, null, sido);
  const csv = S.toCsv(L.csvCols(L.dropBlank(L.LIST_COLS, grid).cols), L.csvRows(grid)).split('\r\n').filter(Boolean);
  assert.equal(csv.length - 1, grid.length);
  assert.deepEqual(csv.slice(1).map((l) => l.split(',')[0]), list.map((r) => r.id), 'CSV 순서 = 목록 순서');
  const s97 = PP.policies.find((p) => p.policyId === 'POL_2025_0907').stages.SUPPLY.samePeriod.find((y) => y.year === 2026);
  assert.deepEqual([s97.target, s97.actual, s97.actualWithEstimates], [8049, 4732, 8742]);
  const metro = V.summaryOf(V.applyFilters(rows, pf({})));
  assert.deepEqual([metro.n, metro.units], [262, 227976]);
  // 2026-10-19 수도권 한정: 향후 12개월 준공 예정 214,975호(414곳) → 13,372호(24곳)
  assert.equal(sum(BOARD.upcoming.map((u) => u.units)), 13372);
  assert.equal(Q({ sido: 'all' })['앞으로 얼마나 공급되는가'].value, '13,372');
});
