'use strict';
// 종합상황판 카드용 원장 집계(tools/ledger/board.js → data/board/ledger-board.json): 2026-10 기준 원장 표에서 판정·단계·향후 준공을 만든다. 네트워크를 쓰지 않는다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { boardFromLedger, elapsedMonths, classify, render, loadTables, OUT } = require('../../tools/ledger/board');

const tables = loadTables();
const board = boardFromLedger(tables, { referenceDate: '2026-10-10', observedMonth: '2026-10' });
const sum = (a) => a.reduce((s, v) => s + v, 0);
const BULK = 'hub-bulk-hs-2026-08';
const N = tables.projects.length;   // 발급 77 + LH 후보 273 + 건축HUB 대용량 후보 3,495(진행 중만)

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

test('판정 3,411 = 정상 2,757 · 주의 134 · 지연 520(발급 사업 + 건축HUB 대용량 후보의 준공 예정 경과), LH 후보 273 은 판정에서 뺀다', () => {
  const j = board.judgment;
  assert.equal(board.scope.judged, 3411);
  assert.deepEqual([j.ok.projects, j.caution.projects, j.delay.projects], [2757, 134, 520]);
  assert.equal(j.excluded.projects, 273);
  assert.deepEqual(board.scope, { projects: N, issued: 77, candidates: 3768, judged: 3411, units: board.scope.units, coverage: 'NATIONWIDE', bySource: { issued: 77, lhCandidates: 273, hubBulkCandidates: 3495 }, sido: 16, withEvents: { supplyNotice: 8, moveIn: 376 } });
  assert.equal(board.scope.units, 2378929);
  assert.deepEqual({ ...board.judge, rule: undefined }, { cautionMonths: 1, delayMonths: 6, rule: undefined, dataAsOf: { 'bundle-incheon-gyeyang': '2026-10-03', 'datagokr-15111714': '2026-06-30', [BULK]: '2026-08-31', 'hub-hs-basis': null, 'myhome-hwspr02': '2026-10-11' } });
  const lh = new Set(tables.projects.filter((p) => p.source_ref === 'datagokr-15141761').map((p) => p.local_project_id));
  assert.ok(board.overdue.every((o) => !lh.has(o.id)), 'overdue 에 LH 후보가 없다');
  assert.equal(sum(board.regions.map((r) => r.judged)), 3411);
  assert.equal(sum(board.agencies.map((a) => a.excludedUnits)), j.excluded.units);
  assert.equal(sum(board.agencies.map((a) => a.okUnits)), j.ok.units, '기관 정상 호수 합');
  assert.equal(sum(board.agencies.map((a) => a.cautionUnits)), j.caution.units, '기관 주의 호수 합');
  assert.equal(sum(board.agencies.map((a) => a.delayUnits)), j.delay.units, '기관 지연 호수 합');
  assert.equal(sum(board.delayByStage), j.delay.units);
  assert.equal(sum(board.cautionByStage), j.caution.units);
});

test('예정일 경과 목록은 수집 계획 3절의 정의와 같다: 발급 사업은 9개 사업 13쌍(착공 9 · 준공 4) 그대로, 목록은 경과가 큰 것부터 200쌍, 전체 수는 overdueTotal', () => {
  // 저장된 원장 시험(ledger-2026-10.test.cjs)과 같은 정의로 고른 쌍(발급 사업은 건축HUB 스냅샷, 대용량 후보는 대용량 원천 — 사업마다 원천이 하나)
  const stage = Object.fromEntries(tables.projects.map((p) => [p.local_project_id, p.stage_code]));
  const issued = new Set(tables.projects.filter((p) => p.issued_at).map((p) => p.local_project_id));
  const bulk = new Set(tables.projects.filter((p) => p.source_ref === BULK).map((p) => p.local_project_id));
  const hub = tables.events.filter((e) => (e.source_ref === 'hub-hs-basis' && issued.has(e.local_project_id)) || (e.source_ref === BULK && bulk.has(e.local_project_id)));
  const actual = new Set(hub.filter((e) => e.date_type === 'ACTUAL').map((e) => `${e.local_project_id}|${e.event_type}`));
  const end = (e) => e.event_date ?? (e.event_month ? `${e.event_month}-31` : `${e.event_year}-12-31`);
  const reached = { CONSTRUCTION_START: '04', COMPLETION: '06' };
  const expected = hub.filter((e) => e.date_type === 'PLANNED' && end(e) < '2026-10-10' && !actual.has(`${e.local_project_id}|${e.event_type}`) && stage[e.local_project_id] < reached[e.event_type])
    .map((e) => ({ id: e.local_project_id, eventType: e.event_type, months: elapsedMonths(end(e), '2026-10-10') }))
    .sort((a, b) => b.months - a.months || a.id.localeCompare(b.id) || a.eventType.localeCompare(b.eventType));
  assert.equal(board.overdueTotal, expected.length);
  assert.equal(board.overdueTotal, 3107);
  assert.deepEqual(board.overdue.map((o) => `${o.id}|${o.eventType}|${o.months}`), expected.slice(0, 200).map((e) => `${e.id}|${e.eventType}|${e.months}`));
  const reg = expected.filter((e) => issued.has(e.id));
  assert.equal(reg.length, 13);
  assert.equal(new Set(reg.map((e) => e.id)).size, 9);
  assert.equal(reg.filter((e) => e.eventType === 'CONSTRUCTION_START').length, 9);
  const worst = new Map();
  for (const e of reg) worst.set(e.id, Math.max(worst.get(e.id) ?? 0, e.months));
  assert.deepEqual([...worst.values()].map((m) => classify(m)).sort(), ['caution', 'caution', 'delay', 'delay', 'delay', 'delay', 'delay', 'delay', 'delay']);
});

test('건축HUB 대용량 후보는 착공 예정 경과를 판정에서 뺀다: 준공 예정 경과만 정상·주의·지연, 뺀 쌍은 excludedStartOverdue 로 센다(발급 사업은 둘 다 판정)', () => {
  const bulk = new Set(tables.projects.filter((p) => p.source_ref === BULK).map((p) => p.local_project_id));
  const skipped = board.overdue.filter((o) => o.class === 'excluded');   // 목록은 200쌍까지라 전체 수는 아래 수치로 본다
  assert.ok(skipped.length > 0 && skipped.every((o) => bulk.has(o.id) && o.eventType === 'CONSTRUCTION_START'));
  assert.ok(board.overdue.filter((o) => o.class !== 'excluded').every((o) => o.eventType === 'COMPLETION' || !bulk.has(o.id)));
  const x = board.judgment.excludedStartOverdue;
  assert.deepEqual([x.projects, x.pairs, x.units], [2407, 2407, 1363918]);
  assert.equal(board.overdueTotal, 3107, '예정일 경과 목록(수집 계획 3절 정의)은 그대로');
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

test('모든 달에서 단계별 사업 수의 합 = 원장 사업 수, 호수의 합 = scope.units', () => {
  assert.equal(board.months.length, 46);
  assert.equal(board.months[0], '2025-01');
  assert.equal(board.months[45], '2028-10');
  assert.equal(board.months[board.now], '2026-10');
  assert.equal(board.now, 21);
  for (let i = 0; i < 46; i++) {
    assert.equal(board.stageProjects[i].length, 6);
    assert.equal(sum(board.stageProjects[i]), N, board.months[i]);
    assert.equal(sum(board.stageUnits[i]), board.scope.units, board.months[i]);
  }
  assert.equal(sum(board.regions.map((r) => r.projects)), N);
  assert.equal(sum(board.regions.map((r) => r.units)), board.scope.units);
  assert.equal(sum(board.agencies.map((a) => a.projects)), N);
});

test('NOW(2026-10)의 단계 분포 = stage_code 분포(01·02→①, 03→②, 04→③, 05→④, 06→⑤) — 감일 블록처럼 준공 날짜가 없는 06 사업도 ⑤준공, 모집공고(실제)가 붙은 사업은 ④모집 이상', () => {
  const idx = { '01': 0, '02': 0, '03': 1, '04': 2, '05': 3, '06': 4 };
  const noticed = new Set(tables.events.filter((e) => e.event_type === 'SUPPLY_NOTICE' && e.date_type === 'ACTUAL' && (e.event_date ?? e.event_month) <= '2026-10-31').map((e) => e.local_project_id));
  const expected = [0, 0, 0, 0, 0, 0];
  for (const p of tables.projects) expected[noticed.has(p.local_project_id) ? Math.max(idx[p.stage_code], 3) : idx[p.stage_code]] += 1;
  assert.deepEqual(board.stageProjects[board.now], expected);
  assert.equal(tables.projects.filter((p) => noticed.has(p.local_project_id) && idx[p.stage_code] < 3).length, 3, '공고 필지 연결로 ②인허가 → ④모집이 된 건축HUB 후보');
});

test('향후 12개월(2026-10 ~ 2027-09) 준공 예정: 계양 A2·A3 는 번들과 LH 에 예정이 있어도 한 번만 센다', () => {
  assert.deepEqual(board.upcoming.map((u) => u.ym), board.months.slice(21, 33));
  // 계양 A2(PRJ-28245-0005) 747 + A3(PRJ-28245-0004) 538 은 번들 예정(2026-10-11)의 달에 한 번
  const keep = (r) => ['PRJ-28245-0005', 'PRJ-28245-0004'].includes(r.local_project_id);
  const two = boardFromLedger({ ...tables, projects: tables.projects.filter(keep), events: tables.events.filter(keep), units: tables.units.filter(keep) });
  assert.deepEqual(two.upcoming[0], { ym: '2026-10', units: 747 + 538, projects: 2 });
  const plans = new Map();
  for (const e of tables.events) if (e.event_type === 'COMPLETION' && e.plan_basis === 'CURRENT') plans.set(e.local_project_id, (plans.get(e.local_project_id) ?? 0) + 1);
  assert.ok(sum(board.upcoming.map((u) => u.projects)) <= plans.size, '사업마다 한 번');
});

test('NOW 뒤의 달은 기준일 뒤 현재 예정을 쓴다: 계양 A2·A3(준공 예정 2026-10-11, 입주 2026-12) → 2026-10 ③착공 · 2026-11 ⑤준공 · 2026-12 ⑥입주', () => {
  const only = (id) => {
    const keep = (r) => r.local_project_id === id;
    return boardFromLedger({ ...tables, projects: tables.projects.filter(keep), events: tables.events.filter(keep), units: tables.units.filter(keep) });
  };
  for (const id of ['PRJ-28245-0005', 'PRJ-28245-0004']) {
    const b = only(id), at = (ym) => b.stageProjects[b.months.indexOf(ym)].indexOf(1);
    assert.deepEqual([at('2026-09'), at('2026-10'), at('2026-11'), at('2026-12')], [2, 2, 4, 5], id);
  }
});

test('기관 미상 줄: id unknown, 건축HUB 55건 · 건축HUB 전국 후보 3,492건(공고로 LH 를 채운 3건 제외) · 지역 번들 공공택지 민간 11건', () => {
  const u = board.agencies.find((a) => a.id === 'unknown');
  assert.equal(u.name, '기관 미상');
  assert.equal(u.projects, 66 + 3492);
  assert.equal(u.note, '시행 기관 미연결: 건축HUB 55건 · 건축HUB 전국 후보 3,492건 · 지역 번들 11건(공공택지 민간 11)');
  assert.equal(board.agencies.find((a) => a.id === 'lh').projects, 273 + 11 + 3, 'LH 후보 273 · 번들 LH 11 · 공고로 채운 후보 3');
  assert.equal(board.agencies.filter((a) => a.id == null).length, 0);
});

test('저장된 data/board/ledger-board.json 이 도구로 다시 만든 것과 같다', () => {
  const saved = fs.readFileSync(path.join(__dirname, '..', '..', OUT), 'utf8');
  assert.equal(saved, `${render(board)}\n`);
});
