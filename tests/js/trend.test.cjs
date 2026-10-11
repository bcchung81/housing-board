'use strict';
// 월 판정 이력(tools/ledger/trend.js → data/board/judgment-history.json): 과거 판 소급 파이프라인이 지금 파이프라인과 같은지(항등),
// 판 고르기(내용이 같은 판 건너뛰기), 시간 되감기, 이력 파일 모양, boardFromLedger 의 trend. 네트워크를 쓰지 않는다. 원본 zip 이 없으면 건너뛴다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../../tools/ledger/hub-bulk');
const T = require('../../tools/ledger/trend');
const { readHubBulk } = require('../../tools/ledger/convert');
const { boardFromLedger, loadTables, loadHistory } = require('../../tools/ledger/board');

const ROOT = path.join(__dirname, '..', '..');
const L = require('../../data/board/ledger-board.json');
const rawZips = Object.values(JSON.parse(fs.readFileSync(path.join(H.RAW, 'manifest.json'), 'utf8')).files).map((f) => path.join(H.RAW, f.zip));
const HIST_DIR = path.join(ROOT, 'schemas/ledger-2026-10/raw/hub-bulk-history');
const noRaw = !rawZips.every((f) => fs.existsSync(f)) && '2026-08 원본 zip 이 없다';

test('V1 항등: 2026-08 판을 소급 경로(기본개요 + 2026-08 정적 속성)로 읽어 기준일 2026-10-10·API 스냅샷 이벤트로 돌리면 기준 표·판정과 같고, 판 기본개요로 만든 레지스트리 이벤트(V2)도 같다', { skip: noRaw }, async () => {
  const { editions } = await T.editionsOf(path.join(ROOT, 'no-such-dir'));
  const ed = editions.find((e) => e.month === '2026-08');
  const ctx = T.loadContext(), a = H.permitFloor('2026-10-10');
  assert.equal(a, '2021-10-01', '기준일 2026-10-10 의 승인 하한은 지금 규칙과 같다');
  const p = await T.readBasic(ed, [a], T.registryPks(ctx.base.registry));
  await T.attachStatic2608([p.recs[a]]);
  const records = T.sortedRecords(p.recs[a]);
  assert.deepEqual(records, readHubBulk(H.OUT).records, '중간 스냅샷과 같은 기록');
  const tables = T.tablesFor(ctx, { ed, records, reg: p.reg, month: '2026-10', hubEvents: ctx.apiEvents });
  const saved = loadTables();
  for (const t of Object.keys(saved)) assert.deepEqual(tables[t], saved[t], t);
  const all = fs.readdirSync(path.join(ROOT, 'schemas/ledger-2026-10/tables')).map((f) => f.slice(0, -5));
  for (const t of all) assert.deepEqual(tables[t], JSON.parse(fs.readFileSync(path.join(ROOT, `schemas/ledger-2026-10/tables/${t}.json`), 'utf8')).rows, t);
  const opts = { referenceDate: '2026-10-10', observedMonth: '2026-10' };
  assert.deepEqual(boardFromLedger(tables, opts).judgment, L.judgment);
  const fromBulk = T.tablesFor(ctx, { ed, records, reg: p.reg, month: '2026-10' });
  assert.deepEqual(fromBulk.events.filter((e) => e.source_ref === 'hub-hs-basis'), ctx.apiEvents, '판 기본개요 → eventsFromHub = API 스냅샷');
  assert.deepEqual(boardFromLedger(fromBulk, opts).judgment, L.judgment);
});

test('판 고르기: 데이터 월이 D 이하인 가장 늦은 판, 기본개요 내용이 앞 판과 같은 판(2025-10 = 2025-09)은 건너뛴다', { skip: (noRaw || !fs.existsSync(path.join(HIST_DIR, 'basic-2025-10.zip'))) && '과거 판이 없다' }, async () => {
  const { editions, skipped } = await T.editionsOf();
  assert.deepEqual(skipped, [{ month: '2025-10', sameAs: '2025-09' }]);
  assert.equal(T.pickEdition(editions, '2025-10').month, '2025-09');
  assert.equal(T.pickEdition(editions, '2026-09').month, '2026-08');
  assert.equal(T.pickEdition(editions, '2026-08').files.length, 3, '2026-08 은 raw/hub-bulk 의 zip 3개');
  assert.equal(T.pickEdition(editions, '2024-12'), null);
});

test('시간 되감기: 기준일 뒤 실제 이벤트는 빠지고, 근거가 기준일 뒤 실제뿐인 단계는 준공 → 04 · 착공 → 03 으로 낮추며, 대용량 후보·근거 없는 단계는 그대로', () => {
  const ev = (pid, type, date, dt = 'ACTUAL') => ({ local_project_id: pid, event_type: type, date_type: dt, event_date: date, event_month: null, event_year: null });
  const pr = (pid, stage, src = 'hub-hs-basis') => ({ local_project_id: pid, stage_code: stage, source_ref: src });
  const t = {
    projects: [pr('A', '06'), pr('B', '06'), pr('C', '06'), pr('D', '06', 'hub-bulk-hs-2025-06'), pr('E', '05', 'bundle-x')],
    events: [ev('A', 'COMPLETION', '2025-08-01'), ev('A', 'CONSTRUCTION_START', '2023-01-01'), ev('B', 'COMPLETION', '2025-05-01'),
      ev('D', 'COMPLETION', '2025-09-01'), ev('E', 'CONSTRUCTION_START', '2025-07-01'), ev('E', 'COMPLETION', '2027-01-01', 'PLANNED')],
  };
  const api = [ev('C', 'COMPLETION', '2025-12-01'), ev('C', 'CONSTRUCTION_START', '2025-07-01')];
  const r = T.rewind(t, '2025-06-30', api);
  assert.deepEqual(r.projects.map((p) => p.stage_code), ['04', '06', '03', '06', '03']);
  assert.deepEqual(r.events.map((e) => `${e.local_project_id} ${e.event_type}`), ['A CONSTRUCTION_START', 'B COMPLETION', 'E COMPLETION'], '기준일 뒤 실제만 빠지고 예정은 남는다');
  assert.equal(r.projects[1], t.projects[1], '바뀌지 않은 사업은 그대로');
});

test('이력 파일: 2025-01~2026-09 소급 행(한 줄에 하나), 판은 editions 에 있고, 행의 단계 합 = 호수, 보드의 trend = 이력 + 이번 달 OBSERVED 행', () => {
  const file = path.join(ROOT, 'data/board/judgment-history.json'), text = fs.readFileSync(file, 'utf8'), h = JSON.parse(text);
  assert.equal(h.schema, 'judgment-history/1');
  const months = h.rows.map((r) => r.month);
  assert.deepEqual(months, [...months].sort());
  for (const r of h.rows) {
    assert.ok(text.includes(`\n${JSON.stringify(r)}`), `${r.month} 한 줄`);
    assert.ok(h.editions[r.edition], `${r.month} 판 ${r.edition}`);
    assert.ok(r.edition <= r.month);
    assert.equal(r.delayByStage.reduce((a, b) => a + b, 0), r.delay.units, `${r.month} 지연`);
    assert.equal(r.cautionByStage.reduce((a, b) => a + b, 0), r.caution.units, `${r.month} 주의`);
    assert.equal(r.ok.projects + r.caution.projects + r.delay.projects, r.judged, `${r.month} 판정 수`);
  }
  assert.deepEqual(h.rows.filter((r) => r.basis === 'BACKFILL').map((r) => r.month)[0], '2025-01');
  const back = h.rows.find((r) => r.month === '2025-10');
  if (back) assert.equal(back.edition, '2025-09', '2025-10 은 2025-09 판');
  assert.deepEqual(L.trend.slice(0, -1), loadHistory().filter((r) => r.month < L.observedMonth));
  const own = L.trend[L.trend.length - 1];
  assert.deepEqual([own.month, own.basis, own.edition, own.referenceDate], [L.observedMonth, 'OBSERVED', '2026-08', L.referenceDate]);
  assert.deepEqual([own.ok, own.caution, own.delay, own.delayByStage, own.cautionByStage, own.judged], [L.judgment.ok, L.judgment.caution, L.judgment.delay, L.delayByStage, L.cautionByStage, L.scope.judged]);
});

test('boardFromLedger: 이력 중 관측 달과 그 뒤 행은 버리고 이번 달 판정 행을 붙인다, 이력이 없으면 trend 는 한 행', () => {
  const tables = loadTables();
  const row = (month) => ({ month, basis: 'BACKFILL' });
  const b = boardFromLedger(tables, { history: [row('2026-08'), row('2026-09'), row('2026-10'), row('2026-11')] });
  assert.deepEqual(b.trend.map((r) => `${r.month} ${r.basis}`), ['2026-08 BACKFILL', '2026-09 BACKFILL', '2026-10 OBSERVED']);
  assert.equal(boardFromLedger(tables).trend.length, 1);
});
