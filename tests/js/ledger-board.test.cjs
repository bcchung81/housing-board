'use strict';
// 종합상황판 카드용 원장 집계(tools/ledger/board.js → data/board/ledger-board.json): 지금 원장(가장 늦은 달 폴더) 표에서 판정·단계·향후 준공을 만든다. 네트워크를 쓰지 않는다.
// 관측 달·기준일·건축HUB 판은 저장된 보드(L)에서 읽는다(월 갱신 PR 마다 시험을 고치지 않게). 판정 건수처럼 달마다 바뀌는 수는 저장된 보드와 대조하고 합계·출처 규칙을 본다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { boardFromLedger, mapIndexFromLedger, renderMap, MAP_OUT, elapsedMonths, classify, render, loadTables, loadHistory, OUT } = require('../../tools/ledger/board');
const { lastDay } = require('../../tools/ledger/paths');

const L = require('../../data/board/ledger-board.json');
const REF = L.referenceDate, MONTH = L.observedMonth, EDITION = L.trend[L.trend.length - 1].edition;
const tables = loadTables();
const board = boardFromLedger(tables, { referenceDate: REF, observedMonth: MONTH });
const sum = (a) => a.reduce((s, v) => s + v, 0);
const BULK = `hub-bulk-hs-${EDITION}`;
/* 대체된 사업(superseded_by — 수도권 레지스트리 사업이 HOME 사업으로 넘어간 것, 2026-10-14)은 집계·지도에서 빠진다. 수도권(11·28·41)은 HOME 덤프 사업(source_ref home-dump-<덤프시각>) */
const live = tables.projects.filter((p) => !p.superseded_by), N = live.length;
const isHome = (p) => p.source_ref.startsWith('home-dump-');
/* 예정일 경과 쌍·계양 A2 다음 일정을 센 기준일(2026-10-10). 열린 달 주 1회 갱신(monthly.js --refresh)으로 저장된 보드의 기준일은 날마다 바뀌므로 이 둘은 이 기준일로 다시 계산해 본다 */
const REF0 = '2026-10-10', board0 = boardFromLedger(tables, { referenceDate: REF0, observedMonth: MONTH });   // 발급 16 + LH 후보 122 + 건축HUB 대용량 후보 1,917 + 수도권 HOME 263

test('판정 개월 경계: 꽉 찬 달 수(기준일의 일이 끝 날짜의 일보다 작으면 1을 뺀다), 6개월 = 지연, 1개월 미만 = 정상', () => {
  assert.equal(elapsedMonths('2026-04-10', '2026-10-10'), 6);
  assert.equal(classify(6), 'delay');
  assert.equal(elapsedMonths('2026-04-11', '2026-10-10'), 5);
  assert.equal(classify(5), 'caution');
  assert.equal(elapsedMonths('2026-09-10', '2026-10-10'), 1);
  assert.equal(classify(1), 'caution');
  assert.equal(elapsedMonths('2026-09-30', '2026-10-10'), 0, '경과했지만 한 달이 차지 않음');
  assert.equal(classify(0), 'ok');
  assert.equal(elapsedMonths('2026-10-10', '2026-10-10'), 0, '기준일 당일은 경과 아님');
  assert.equal(elapsedMonths('2026-12-31', '2026-10-10'), 0, '아직 오지 않은 예정');
});

test('판정 = 정상 · 주의 · 지연(발급 사업 + 수도권 HOME 사업 + 건축HUB 대용량 후보의 준공 예정 경과, 2026-10 첫 판 3,411 = 2,757 · 134 · 520 → 단계별 원천(건축물대장 준공 실제) 뒤 2,811 · 132 · 468 → 단계 올리기(2026-10-13) 뒤 2,812 · 133 · 466 → 수도권 HOME 교체(2026-10-14) 뒤 2,009 = 1,608 · 86 · 315), LH 후보는 판정에서 뺀다', () => {
  const j = board.judgment;
  assert.deepEqual([board.scope.judged, j.ok.projects, j.caution.projects, j.delay.projects], [L.scope.judged, L.judgment.ok.projects, L.judgment.caution.projects, L.judgment.delay.projects], '저장된 보드와 같다');
  assert.equal(j.ok.projects + j.caution.projects + j.delay.projects, board.scope.judged);
  const of = (f) => live.filter(f).length;
  const lhN = of((p) => p.source_ref === 'datagokr-15141761'), bulkN = of((p) => p.source_ref === BULK), issuedN = of((p) => p.issued_at), homeN = of(isHome);
  assert.equal(j.excluded.projects, lhN, '판정 제외 = LH 후보 전부');
  assert.deepEqual(board.scope, { projects: N, issued: issuedN, candidates: N - issuedN, judged: L.scope.judged, units: board.scope.units, coverage: 'NATIONWIDE', bySource: { issued: of((p) => p.issued_at && !isHome(p)), lhCandidates: lhN, hubBulkCandidates: bulkN, home: homeN }, sido: new Set(live.map((p) => p.sgg_code.slice(0, 2))).size, withEvents: L.scope.withEvents });
  assert.equal(board.scope.bySource.issued + lhN + bulkN + homeN, N, '발급 + LH 후보 + 건축HUB 대용량 후보 + 수도권 HOME');
  assert.ok(homeN > 0 && live.filter((p) => ['11', '28', '41'].includes(p.sgg_code.slice(0, 2))).every(isHome), '수도권 사업은 모두 HOME');
  assert.equal(board.scope.units, L.scope.units);
  assert.deepEqual({ ...board.judge, rule: undefined }, { cautionMonths: 1, delayMonths: 6, rule: undefined, dataAsOf: L.judge.dataAsOf });
  assert.equal(board.judge.dataAsOf[BULK], lastDay(EDITION), '건축HUB 대용량의 자료 기준일 = 판 데이터 월 말일');
  const lh = new Set(tables.projects.filter((p) => p.source_ref === 'datagokr-15141761').map((p) => p.local_project_id));
  assert.ok(board.overdue.every((o) => !lh.has(o.id)), 'overdue 에 LH 후보가 없다');
  assert.equal(sum(board.regions.map((r) => r.judged)), board.scope.judged);
  assert.equal(sum(board.agencies.map((a) => a.excludedUnits)), j.excluded.units);
  assert.equal(sum(board.agencies.map((a) => a.okUnits)), j.ok.units, '기관 정상 호수 합');
  assert.equal(sum(board.agencies.map((a) => a.cautionUnits)), j.caution.units, '기관 주의 호수 합');
  assert.equal(sum(board.agencies.map((a) => a.delayUnits)), j.delay.units, '기관 지연 호수 합');
  assert.equal(sum(board.delayByStage), j.delay.units);
  assert.equal(sum(board.cautionByStage), j.caution.units);
});

test('예정일 경과 목록은 수집 계획 3절의 정의와 같다: 발급 사업은 9개 사업 13쌍(착공 9 · 준공 4) → 8개 사업 11쌍(2026-10-13 단계 올리기) → 수도권 HOME 교체(2026-10-14) 뒤 성북·하남 건축HUB 발급 사업은 원장에서 빠지고 HOME 사업 5개 사업 5쌍(모두 준공), 목록은 경과가 큰 것부터 200쌍, 전체 수는 overdueTotal', () => {
  // 저장된 원장 시험(ledger-2026-10.test.cjs)과 같은 정의로 고른 쌍(발급 사업은 건축HUB 스냅샷, 대용량 후보는 대용량 원천 — 사업마다 원천이 하나.
  // HOME 사업은 종류마다 HOME 원천 예정(공사 계약 준공예정) → LH 준공예정 별칭 순으로 하나 — board.js SOURCE_RANK)
  const stage = Object.fromEntries(live.map((p) => [p.local_project_id, p.stage_code]));
  const issued = new Set(live.filter((p) => p.issued_at).map((p) => p.local_project_id));
  const bulk = new Set(live.filter((p) => p.source_ref === BULK).map((p) => p.local_project_id));
  const home = new Set(live.filter(isHome).map((p) => p.local_project_id));
  const homePlan = new Map();
  for (const e of tables.events.filter((x) => home.has(x.local_project_id) && x.date_type === 'PLANNED' && x.plan_basis === 'CURRENT').sort((a, b) => Number(/-lh-plan$/.test(a.source_ref)) - Number(/-lh-plan$/.test(b.source_ref)))) {
    const k = `${e.local_project_id}|${e.event_type}`;
    if (!homePlan.has(k)) homePlan.set(k, e);
  }
  const hub = [...tables.events.filter((e) => (e.source_ref === 'hub-hs-basis' && issued.has(e.local_project_id)) || (e.source_ref === BULK && bulk.has(e.local_project_id))), ...homePlan.values()];
  // 실제 기록은 모든 원천(2026-10-13 단계별 원천: 건축물대장의 준공·착공 실제가 예정일 경과를 지운다). 착공 추정(ESTIMATED)은 실제가 아니다
  const actual = new Set(tables.events.filter((e) => e.date_type === 'ACTUAL').map((e) => `${e.local_project_id}|${e.event_type}`));
  const end = (e) => e.event_date ?? (e.event_month ? `${e.event_month}-31` : `${e.event_year}-12-31`);
  const reached = { CONSTRUCTION_START: '04', COMPLETION: '06' };
  const expected = hub.filter((e) => e.date_type === 'PLANNED' && end(e) < REF0 && !actual.has(`${e.local_project_id}|${e.event_type}`) && stage[e.local_project_id] < reached[e.event_type])
    .map((e) => ({ id: e.local_project_id, eventType: e.event_type, months: elapsedMonths(end(e), REF0) }))
    .sort((a, b) => b.months - a.months || a.id.localeCompare(b.id) || a.eventType.localeCompare(b.eventType));
  assert.equal(board0.overdueTotal, expected.length);
  assert.equal(board.overdueTotal, L.overdueTotal);
  assert.deepEqual(board0.overdue.map((o) => `${o.id}|${o.eventType}|${o.months}`), expected.slice(0, 200).map((e) => `${e.id}|${e.eventType}|${e.months}`));
  const reg = expected.filter((e) => issued.has(e.id));
  assert.ok(reg.every((e) => home.has(e.id)), '발급 사업의 경과는 모두 HOME 사업(성북·하남 건축HUB 발급 사업은 HOME 에 대응이 없어 숨김)');
  assert.equal(reg.length, 5);
  assert.equal(new Set(reg.map((e) => e.id)).size, 5);
  assert.equal(reg.filter((e) => e.eventType === 'CONSTRUCTION_START').length, 0);
  const worst = new Map();
  for (const e of reg) worst.set(e.id, Math.max(worst.get(e.id) ?? 0, e.months));
  assert.deepEqual([...worst.values()].map((m) => classify(m)).sort(), ['caution', 'caution', 'delay', 'delay', 'ok'], '인천검단 AA13 계약 준공예정 2025-02-18 두 블록 지연 · 인천검단 AA21·이천장호원 B2 주의 · 성남금토 A2(2026-09-16) 한 달이 차지 않음');
});

test('건축HUB 대용량 후보는 착공 예정 경과를 판정에서 뺀다: 준공 예정 경과만 정상·주의·지연, 뺀 쌍은 excludedStartOverdue 로 센다(발급 사업은 둘 다 판정)', () => {
  const bulk = new Set(tables.projects.filter((p) => p.source_ref === BULK).map((p) => p.local_project_id));
  const skipped = board.overdue.filter((o) => o.class === 'excluded');   // 목록은 200쌍까지라 전체 수는 아래 수치로 본다
  assert.ok(skipped.length > 0 && skipped.every((o) => bulk.has(o.id) && o.eventType === 'CONSTRUCTION_START'));
  assert.ok(board.overdue.filter((o) => o.class !== 'excluded').every((o) => o.eventType === 'COMPLETION' || !bulk.has(o.id)));
  const x = board.judgment.excludedStartOverdue;
  assert.deepEqual([x.projects, x.pairs, x.units], [L.judgment.excludedStartOverdue.projects, L.judgment.excludedStartOverdue.pairs, L.judgment.excludedStartOverdue.units]);
  assert.equal(x.projects, x.pairs, '대용량 후보 하나에 착공 예정은 하나');
  assert.equal(board.overdueTotal, L.overdueTotal, '예정일 경과 목록(수집 계획 3절 정의)은 그대로');
  // 착공 예정만 지난 대용량 후보 하나는 판정 대상이 아니고, 발급 사업이면 지연이다
  const one = (src, issuedAt) => {
    const p = { ...tables.projects.find((r) => r.source_ref === BULK), source_ref: src, issued_at: issuedAt, stage_code: '03' };
    const ev = { local_project_id: p.local_project_id, source_ref: src, event_type: 'CONSTRUCTION_START', date_type: 'PLANNED', plan_basis: 'CURRENT', event_date: '2025-01-15' };
    return boardFromLedger({ ...tables, projects: [p], events: [ev], units: [] }).judgment;
  };
  const b = one(BULK, null), r = one('hub-hs-basis', '2024-01-01');
  assert.deepEqual([b.ok.projects + b.caution.projects + b.delay.projects, b.excludedStartOverdue.pairs], [0, 1]);
  assert.deepEqual([r.delay.projects, r.excludedStartOverdue.pairs], [1, 0]);
  assert.match(board.judge.rule, /준공 예정 경과만|사용검사\(준공\) 예정 경과만/);
});

test('실제 기록이 모집공고뿐인 사업은 첫 공고 전 달에도 stage_code 칸에서 시작한다(①계획으로 되돌리지 않는다)', () => {
  const lh = tables.projects.find((r) => !r.issued_at && !r.source_ref.startsWith('hub-bulk-hs-'));
  const p = { ...lh, stage_code: '04' }, unit = { local_project_id: p.local_project_id, quantity_type: 'PUBLIC_PLAN', unit_scope: 'TOTAL', unit_count: 100, source_ref: p.source_ref };
  const notice = { local_project_id: p.local_project_id, source_ref: p.source_ref, event_type: 'SUPPLY_NOTICE', date_type: 'ACTUAL', plan_basis: null, event_date: '2025-06-10' };
  const stageOf = (events) => { const g = boardFromLedger({ ...tables, projects: [p], events, units: [unit] }, { referenceDate: REF, observedMonth: MONTH }); return g.stageProjects.map((v) => v.indexOf(1)); };
  const withNotice = stageOf([notice]);
  assert.equal(withNotice[0], 2, '2025-01: stage_code 04 → ③착공');
  assert.equal(withNotice[5], 3, '2025-06: 첫 공고 달부터 ④모집');
  const raised = boardFromLedger({ ...tables, projects: [{ ...p, stage_code: '05' }], events: [notice], units: [unit] }, { referenceDate: REF, observedMonth: MONTH }).stageProjects.map((v) => v.indexOf(1));
  assert.deepEqual([raised[0], raised[5]], [2, 3], '공고로 05 가 된 사업(convert.js raiseStages)도 ④모집은 공고 달부터 — 그 전은 ③착공');
  const permit = { ...notice, event_type: 'PERMIT', event_date: '2025-03-01' };
  assert.equal(stageOf([permit, notice])[0], 0, '인허가 같은 다른 실제 기록이 있으면 지금처럼 ①계획부터 다시 센다');
});

test('모든 달에서 단계별 사업 수의 합 = 원장 사업 수, 호수의 합 = scope.units', () => {
  assert.equal(board.months.length, 46);
  assert.equal(board.months[0], '2025-01');
  assert.equal(board.months[45], '2028-10');
  assert.equal(board.months[board.now], MONTH);
  assert.equal(board.now, board.months.indexOf(MONTH));
  for (let i = 0; i < 46; i++) {
    assert.equal(board.stageProjects[i].length, 6);
    assert.equal(sum(board.stageProjects[i]), N, board.months[i]);
    assert.equal(sum(board.stageUnits[i]), board.scope.units, board.months[i]);
  }
  assert.equal(sum(board.regions.map((r) => r.projects)), N);
  assert.equal(sum(board.regions.map((r) => r.units)), board.scope.units);
  assert.equal(sum(board.agencies.map((a) => a.projects)), N);
});

test('NOW(2026-10)의 단계 분포 = stage_code 분포(01·02→①, 03→②, 04→③, 05→④, 06→⑤) — 2026-10-13 부터 원장 변환이 그 달까지의 실제 기록으로 stage_code 를 올리므로(convert.js raiseStages) 실제 기록이 더 올리는 사업은 없다. 감일 블록처럼 준공 날짜가 없는 06 사업도 ⑤준공', () => {
  const idx = { '01': 0, '02': 0, '03': 1, '04': 2, '05': 3, '06': 4 }, ofEvent = { PERMIT: 1, CONSTRUCTION_START: 2, SUPPLY_NOTICE: 3, COMPLETION: 4, MOVE_IN: 5 };
  const top = new Map();   // 사업 → NOW 달까지 실제 기록의 가장 높은 칸(착공 추정 ESTIMATED 는 실제가 아니다)
  for (const e of tables.events) if (e.date_type === 'ACTUAL' && ofEvent[e.event_type] != null && (e.event_date ?? e.event_month ?? `${e.event_year}-12`).slice(0, 7) <= MONTH) top.set(e.local_project_id, Math.max(top.get(e.local_project_id) ?? 0, ofEvent[e.event_type]));
  const expected = [0, 0, 0, 0, 0, 0];
  for (const p of live) expected[Math.max(idx[p.stage_code], top.get(p.local_project_id) ?? 0)] += 1;
  assert.deepEqual(board.stageProjects[board.now], expected);
  const byStage = [0, 0, 0, 0, 0, 0];
  for (const p of live) byStage[idx[p.stage_code]] += 1;
  assert.deepEqual(byStage, expected, '실제 기록이 stage_code 보다 높은 칸을 뜻하는 사업이 없다(MOVE_IN 실제는 없다)');
  const index = mapIndexFromLedger(tables, { referenceDate: REF, observedMonth: MONTH });
  assert.deepEqual(Object.values(index.bySgg).flat().reduce((v, r) => ((v[idx[r.stage]] += 1), v), [0, 0, 0, 0, 0, 0]), expected, '지도 색인의 stage 도 같은 분포');
});

/* 계양 A2·A3: 2026-10-14 부터 HOME 사업(옛 레지스트리 PRJ-28245-0005·0004 는 대체 → 0055·0057, HOME 원천 공사 계약 준공예정 2026-10-11) */
const [A2, A3] = ['PRJ-28245-0005', 'PRJ-28245-0004'].map((id) => tables.projects.find((p) => p.local_project_id === id).superseded_by);
test('향후 12개월(2026-10 ~ 2027-09) 준공 예정: 계양 A2·A3 는 한 사업에 예정이 여럿이어도 한 번만 센다', () => {
  assert.deepEqual(board.upcoming.map((u) => u.ym), board.months.slice(board.now, board.now + 12));
  assert.deepEqual([A2, A3], ['PRJ-28245-0055', 'PRJ-28245-0057']);
  // 계양 A2 747 + A3 538 은 준공 예정(2026-10-11)의 달에 한 번
  const keep = (r) => [A2, A3].includes(r.local_project_id);
  const two = boardFromLedger({ ...tables, projects: tables.projects.filter(keep), events: tables.events.filter(keep), units: tables.units.filter(keep) });
  assert.deepEqual(two.upcoming[0], { ym: '2026-10', units: 747 + 538, projects: 2 });
  const plans = new Map();
  for (const e of tables.events) if (e.event_type === 'COMPLETION' && e.plan_basis === 'CURRENT') plans.set(e.local_project_id, (plans.get(e.local_project_id) ?? 0) + 1);
  assert.ok(sum(board.upcoming.map((u) => u.projects)) <= plans.size, '사업마다 한 번');
});

test('NOW 뒤의 달은 기준일 뒤 현재 예정을 쓴다: 계양 A2·A3(HOME — 착공 2023-10-25 실제, 준공 예정 2026-10-11, 모집공고·입주 연결 없음) → 2026-10 ③착공 · 2026-11·12 ⑤준공', () => {
  const only = (id) => {
    const keep = (r) => r.local_project_id === id;
    return boardFromLedger({ ...tables, projects: tables.projects.filter(keep), events: tables.events.filter(keep), units: tables.units.filter(keep) });
  };
  for (const id of [A2, A3]) {
    const b = only(id), at = (ym) => b.stageProjects[b.months.indexOf(ym)].indexOf(1);
    assert.deepEqual([at('2026-09'), at('2026-10'), at('2026-11'), at('2026-12')], [2, 2, 4, 4], id);
  }
});

test('기관 미상 줄: id unknown, 건축HUB(수도권 교체 뒤 0) · 건축HUB 전국 후보(공고 연결로 LH 를 채운 것 제외) · 수도권 HOME(시행기관 미상) · 지역 번들 공공택지 민간 11건', () => {
  const u = board.agencies.find((a) => a.id === 'unknown');
  assert.equal(u.name, '기관 미상');
  const noAgency = live.filter((p) => !p.agency_id), n = (f) => noAgency.filter(f).length.toLocaleString('en-US');
  assert.equal(u.projects, noAgency.length, '2026-10 첫 판: 66 + 3,460');
  assert.equal(u.note, `시행 기관 미연결: 건축HUB ${n((p) => p.source_ref === 'hub-hs-basis')}건 · 건축HUB 전국 후보 ${n((p) => p.source_ref === BULK)}건 · 수도권 HOME ${n(isHome)}건 · 지역 번들 ${n((p) => p.source_ref.startsWith('bundle-'))}건(공공택지 민간 ${n((p) => p.public_scope === 'PRIVATE_ON_PUBLIC_LAND')})`);
  const lhRows = live.filter((p) => p.agency_id === 'lh');
  assert.equal(board.agencies.find((a) => a.id === 'lh').projects, lhRows.length, 'LH 후보 · 번들 LH · 공고로 채운 후보(2026-10 첫 판 273 + 11 + 3)');
  assert.ok(lhRows.filter((p) => p.source_ref === 'datagokr-15141761').length === board.judgment.excluded.projects);
  assert.ok(lhRows.some(isHome), 'HOME 원천 시행 LH');
  assert.equal(board.agencies.filter((a) => a.id == null).length, 0);
});

test('실제 날짜는 호수가 가장 많은 원천의 자료 달까지(actualThrough): 전국은 건축HUB 대용량 2026-08, 그 뒤 달은 예정으로 다시 만들고 기준 달은 관측(stage_code) 그대로', () => {
  assert.deepEqual([board.actualThrough, board.actualIndex, board.actualSource], [EDITION, board.months.indexOf(EDITION), BULK]);
  assert.equal(board.months[board.actualIndex], board.actualThrough);
  /* 작은 원장: 대용량 사업(100호, 자료 2026-08) + 번들 사업(10호, 자료 2026-10). 대용량 사업은 2025-03 인허가 실제, 준공 예정 2026-09-20.
     기준일을 2026-09-15 로 두면 2026-09 는 실제 날짜 뒤라 예정(준공)을 쓴다 — 예전 규칙(기준 달 뒤만 예정)이면 ②인허가였다 */
  const base = tables.projects.find((r) => r.source_ref === BULK);
  const p1 = { ...base, local_project_id: 'T-1', source_ref: BULK, issued_at: null, stage_code: '06' }, p2 = { ...base, local_project_id: 'T-2', source_ref: 'bundle-t', issued_at: null, stage_code: '04' };
  const ev = (pid, src, type, dt, date) => ({ local_project_id: pid, source_ref: src, event_type: type, date_type: dt, plan_basis: dt === 'PLANNED' ? 'CURRENT' : null, event_date: date });
  const u = (pid, src, n) => ({ local_project_id: pid, source_ref: src, quantity_type: 'PERMIT', unit_scope: 'TOTAL', unit_count: n });
  const small = boardFromLedger({ ...tables, projects: [p1, p2], sources: [{ source_ref: BULK, data_as_of: '2026-08-31' }, { source_ref: 'bundle-t', data_as_of: '2026-10-03' }],
    events: [ev('T-1', BULK, 'PERMIT', 'ACTUAL', '2025-03-02'), ev('T-1', BULK, 'COMPLETION', 'PLANNED', '2026-09-20'), ev('T-2', 'bundle-t', 'CONSTRUCTION_START', 'ACTUAL', '2026-10-01')],
    units: [u('T-1', BULK, 100), u('T-2', 'bundle-t', 10)] }, { referenceDate: '2026-09-15', observedMonth: '2026-10' });
  assert.deepEqual([small.actualThrough, small.actualSource], ['2026-08', BULK], '호수가 많은 원천(대용량 100호 > 번들 10호)의 자료 달');
  const st = (ym) => small.stageUnits[small.months.indexOf(ym)];
  assert.deepEqual(st('2026-08'), [10, 100, 0, 0, 0, 0], '실제 날짜까지는 실제(②인허가, 번들 사업은 아직 실제 기록 전이라 ①)');
  assert.deepEqual(st('2026-09'), [10, 0, 0, 0, 100, 0], '실제 날짜 뒤는 예정(⑤준공)');
  assert.deepEqual(st('2026-10'), [0, 0, 10, 0, 100, 0], '기준 달은 관측: stage_code 바닥(06 → ⑤) · 번들 착공 실제(2026-10)');
});

test('저장된 data/board/ledger-board.json 이 도구로 다시 만든 것과 같다(판정 이력 파일을 넘긴다)', () => {
  const saved = fs.readFileSync(path.join(__dirname, '..', '..', OUT), 'utf8');
  assert.equal(saved, `${render(boardFromLedger(tables, { referenceDate: REF, observedMonth: MONTH, history: loadHistory() }))}\n`);
});

/* ---------- 지도 색인(mapIndexFromLedger → data/board/ledger-map.json) ---------- */
const index = mapIndexFromLedger(tables, { referenceDate: REF, observedMonth: MONTH });
const rows = Object.values(index.bySgg).flat();

test('지도 색인: 모든 사업(대체된 사업 제외 — 2026-10-14 수도권 HOME 교체 뒤 2,318건, 그 전 3,845건)이 시군구마다 id 순으로 한 번씩, 시군구 키는 사업의 sgg_code', () => {
  assert.deepEqual([index.schema, index.observedMonth, index.referenceDate], ['ledger-map/1', MONTH, REF]);
  assert.equal(rows.length, N);
  assert.equal(new Set(rows.map((r) => r.id)).size, N);
  assert.ok(rows.every((r) => !tables.projects.find((p) => p.local_project_id === r.id).superseded_by), '대체된 사업은 없다');
  const sgg = Object.fromEntries(live.map((p) => [p.local_project_id, p.sgg_code]));
  for (const [k, list] of Object.entries(index.bySgg)) {
    assert.match(k, /^\d{5}$/);
    assert.ok(list.every((r) => sgg[r.id] === k), k);
    assert.deepEqual(list.map((r) => r.id), list.map((r) => r.id).slice().sort(), `${k} id 순`);
  }
  for (const r of rows) assert.deepEqual(Object.keys(r), ['id', 'name', 'issued', 'stage', 'cls', 'why', 'overdue', 'next', ...('done' in r ? ['done'] : []), 'units', 'pks', 'pnus', 'bundles']);
});

test('지도 색인의 판정 합계(건수·호수) = 보드 판정, 대상이 아닌 사업은 why 로 까닭(LH 후보 273 = 보드 제외)', () => {
  const j = board.judgment;
  for (const c of ['ok', 'caution', 'delay']) {
    const xs = rows.filter((r) => r.cls === c);
    assert.deepEqual({ projects: xs.length, units: sum(xs.map((r) => r.units)) }, j[c], c);
  }
  assert.equal(sum(rows.map((r) => r.units)), board.scope.units);
  assert.ok(rows.every((r) => (r.cls === null) === (r.why !== null)));
  assert.deepEqual([rows.filter((r) => r.why === 'LH 후보').length, sum(rows.filter((r) => r.why === 'LH 후보').map((r) => r.units))], [j.excluded.projects, j.excluded.units]);
  assert.equal(rows.filter((r) => r.why === '예정 없음').length, N - board.scope.judged - j.excluded.projects);
});

test('지도 색인의 overdue 는 보드의 예정일 경과에서 판정에 넣은 것 중 가장 큰 것, next 는 기준일 뒤 가장 이른 예정(실제가 있는 종류 제외)', () => {
  const months = new Map();
  for (const o of board.overdue) if (o.class !== 'excluded') months.set(o.id, Math.max(months.get(o.id) ?? -1, o.months));
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const [id, m] of months) assert.equal(byId.get(id).overdue.months, m, id);   // 보드 목록(상위 200쌍)에 있는 사업
  assert.ok(rows.every((r) => !r.overdue || ['CONSTRUCTION_START', 'COMPLETION'].includes(r.overdue.eventType)));
  assert.ok(rows.filter((r) => r.cls === 'delay').every((r) => r.overdue.months >= 6));
  assert.ok(rows.filter((r) => r.cls === 'caution').every((r) => r.overdue.months >= 1 && r.overdue.months < 6));
  // 착공 예정만 지난 대용량 후보는 overdue 가 없다(판정에서 뺀 경과)
  const bulkStartOnly = board.overdue.filter((o) => o.class === 'excluded').map((o) => byId.get(o.id));
  assert.ok(bulkStartOnly.length && bulkStartOnly.every((r) => !r.overdue || r.overdue.eventType === 'COMPLETION'));
  const actual = new Set(tables.events.filter((e) => e.date_type === 'ACTUAL').map((e) => `${e.local_project_id}|${e.event_type}`));
  for (const r of rows.filter((x) => x.next)) {
    assert.ok(!actual.has(`${r.id}|${r.next.eventType}`), r.id);
    assert.ok(`${r.next.planned}`.padEnd(10, '9') >= REF, `${r.id} ${r.next.planned}`);
  }
  const a2 = mapIndexFromLedger(tables, { referenceDate: REF0, observedMonth: MONTH }).bySgg['28245'].find((r) => r.id === A2);   // 계양 A2(HOME): 준공 예정 2026-10-11 — 기준일 2026-10-10 다음 날
  assert.deepEqual(a2.next, { eventType: 'COMPLETION', planned: '2026-10-11' });
});

test('지도 색인: 건축HUB 관리번호·필지·번들 단지 id 는 원장 식별자·위치 그대로(정렬, 중복 없음)', () => {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const pk = tables.identifiers.filter((r) => r.id_type === 'HUB_HS_PK');
  assert.equal(sum(rows.map((r) => r.pks.length)), new Set(pk.map((r) => `${r.local_project_id}|${r.id_value}`)).size);
  for (const r of pk) assert.ok(byId.get(r.local_project_id).pks.includes(r.id_value));
  for (const l of tables.project_locations.filter((x) => x.pnu)) assert.ok(byId.get(l.local_project_id).pnus.includes(l.pnu));
  assert.ok(rows.every((r) => r.pnus.every((x) => /^\d{19}$/.test(x)) && r.pks.join() === r.pks.slice().sort().join()));
  const bundle = tables.identifiers.filter((r) => r.id_type === 'BUNDLE_ID');   // 지도 번들 단지와 잇는 열쇠 '지역slug/단지id'
  assert.equal(sum(rows.map((r) => r.bundles.length)), bundle.length);
  for (const r of bundle) assert.ok(byId.get(r.local_project_id).bundles.includes(r.id_value));
});

test('저장된 data/board/ledger-map.json 이 도구로 다시 만든 것과 같고, 한 사업 한 줄이다', () => {
  const saved = fs.readFileSync(path.join(__dirname, '..', '..', MAP_OUT), 'utf8');
  assert.equal(saved, renderMap(index));
  assert.deepEqual(JSON.parse(saved), index);
  assert.equal(saved.split('\n').filter((l) => l.startsWith('      {"id":')).length, N);
});
