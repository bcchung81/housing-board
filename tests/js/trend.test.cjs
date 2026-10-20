'use strict';
// 월 판정 이력(tools/ledger/trend.js → data/board/judgment-history.json): 소급 행이 지금 원장과 같은 모집단(발급된 수도권 HOME 사업)을 되감아 만든 것인지,
// 판 목록(내용이 같은 판 건너뛰기 — --close 가 판 sha 를 적는다), 시간 되감기, 이력 파일 모양, boardFromLedger 의 trend. 네트워크를 쓰지 않는다. 원본 zip 이 없으면 건너뛴다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../../tools/ledger/hub-bulk');
const T = require('../../tools/ledger/trend');
const { boardFromLedger, loadTables, loadHistory, lastDay } = require('../../tools/ledger/board');
const P = require('../../tools/ledger/paths');

const ROOT = path.join(__dirname, '..', '..');
const L = require('../../data/board/ledger-board.json');
/* 지금 원장(가장 늦은 달 폴더)의 판·관측 달 */
const BASE = path.dirname(path.dirname(H.RAW)), ED = H.DATA_MONTH, MONTH = L.observedMonth;
const rawZips = Object.values(JSON.parse(fs.readFileSync(path.join(H.RAW, 'manifest.json'), 'utf8')).files).map((f) => path.join(H.RAW, f.zip));
const HIST_DIR = path.join(BASE, 'raw/hub-bulk-history');
const noRaw = !rawZips.every((f) => fs.existsSync(f)) && `${ED} 원본 zip 이 없다`;

test('판 목록: 기본개요 내용이 앞 판과 같은 판(2025-10 = 2025-09)은 건너뛰고, 지금 판은 raw/hub-bulk 의 zip 3개', { skip: (noRaw || !fs.existsSync(path.join(HIST_DIR, 'basic-2025-10.zip'))) && '과거 판이 없다' }, async () => {
  const { editions, skipped } = await T.editionsOf();
  assert.deepEqual(skipped, [{ month: '2025-10', sameAs: '2025-09' }]);
  assert.equal(editions.find((e) => e.month === ED).files.length, 3);
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

test('이력 파일: 2025-01~관측 달 앞 달 소급 행(한 줄에 하나), 판은 editions 에 있고, 행의 단계 합 = 호수, 보드의 trend = 이력 + 이번 달 OBSERVED 행', () => {
  const file = path.join(ROOT, 'data/board/judgment-history.json'), text = fs.readFileSync(file, 'utf8'), h = JSON.parse(text);
  assert.equal(h.schema, 'judgment-history/1');
  assert.equal(h.rule, T.RULE);
  const months = h.rows.map((r) => r.month);
  assert.deepEqual(months, [...months].sort());
  for (const r of h.rows) {
    assert.ok(text.includes(`\n${JSON.stringify(r)}`), `${r.month} 한 줄`);
    assert.ok(h.editions[r.edition], `${r.month} 판 ${r.edition}`);
    assert.equal(r.delayByStage.reduce((a, b) => a + b, 0), r.delay.units, `${r.month} 지연`);
    assert.equal(r.cautionByStage.reduce((a, b) => a + b, 0), r.caution.units, `${r.month} 주의`);
    assert.equal(r.ok.projects + r.caution.projects + r.delay.projects, r.judged, `${r.month} 판정 수`);
  }
  const back = h.rows.filter((r) => r.basis === 'BACKFILL');
  assert.equal(back[0].month, '2025-01');
  assert.equal(back.length + 1, L.months.indexOf(MONTH) + 1, '2025-01 … 관측 달 앞 달이 모두 있다');
  assert.ok(back.every((r) => !('addedSources' in r)), '소급 행은 단계별 원천을 쓰지 않아 원천 추가 표지가 없다');
  assert.deepEqual(L.trend.slice(0, -1), loadHistory().filter((r) => r.month < L.observedMonth));
  const own = L.trend[L.trend.length - 1];
  assert.deepEqual([own.month, own.basis, own.edition, own.referenceDate], [L.observedMonth, 'OBSERVED', ED, L.referenceDate]);
  /* 2026-10-19 수도권 한정: 단계별 원천 행은 모두 비수도권 사업 몫이라 빠졌고(수도권은 HOME), 판정 사업이 단계별 원천을 쓰지 않아 원천 추가 표지가 없다(전엔 건축물대장·청약홈·HUG·LH 공고 상세) */
  if (own.month === '2026-10') assert.equal(own.addedSources, undefined);
  assert.deepEqual([own.ok, own.caution, own.delay, own.delayByStage, own.cautionByStage, own.judged], [L.judgment.ok, L.judgment.caution, L.judgment.delay, L.delayByStage, L.cautionByStage, L.scope.judged]);
});

test('소급 모집단(2026-10-20 사용자 결정): 지금 원장과 같은 사업(발급된 수도권 HOME)만 — 후보 0(candidate 칸 = 화면의 기준 변경 없음), 판정 합 ≤ 원장 호수, 단계별 지연·주의 ≤ 그 달 리본 층', () => {
  const h = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/board/judgment-history.json'), 'utf8'));
  const total = (i) => L.stageUnits[i].reduce((a, b) => a + b, 0);
  for (const r of h.rows.filter((x) => x.basis === 'BACKFILL')) {
    const i = L.months.indexOf(r.month);
    assert.ok(i >= 0 && i < L.now, r.month);
    assert.ok(r.candidate, `${r.month} candidate 칸`);
    assert.deepEqual([r.candidate.ok.projects, r.candidate.caution.projects, r.candidate.delay.projects], [0, 0, 0], `${r.month} 후보 0`);
    assert.equal(total(i), L.scope.units, `${r.month} 리본 총량 = 원장 호수`);
    assert.ok(r.ok.units + r.caution.units + r.delay.units <= total(i), `${r.month} 판정 합 ≤ 원장 호수`);
    assert.ok(r.judged <= L.scope.issued, `${r.month} 판정 건수 ≤ 발급 사업`);
    for (let s = 0; s < 6; s++) assert.ok(r.delayByStage[s] + r.cautionByStage[s] <= L.stageUnits[i][s], `${r.month} 단계 ${s} 지연+주의 ${r.delayByStage[s] + r.cautionByStage[s]} ≤ 층 ${L.stageUnits[i][s]}`);
    assert.equal(r.referenceDate, lastDay(r.month));
  }
});

test('소급 다시 계산: 저장된 원장 표를 그 달 말로 되감아 boardFromLedger(stagesAt = 지금 보드의 그 달 칸)를 돌린 행 = 이력 행', () => {
  const tables = loadTables(path.join(BASE, 'tables')), h = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/board/judgment-history.json'), 'utf8'));
  const { months, stagesOf } = boardFromLedger(tables, { referenceDate: P.referenceDateOf(BASE), observedMonth: MONTH });
  for (const r of h.rows.filter((x) => x.basis === 'BACKFILL')) {
    const i = months.indexOf(r.month), ref = lastDay(r.month);
    const b = boardFromLedger(T.rewind(tables, ref), { referenceDate: ref, observedMonth: r.month, stagesAt: new Map([...stagesOf].map(([id, s]) => [id, s[i]])) });
    assert.deepEqual({ ...b.trend[b.trend.length - 1], basis: 'BACKFILL' }, r, r.month);
  }
});

test('boardFromLedger: 이력 중 관측 달과 그 뒤 행은 버리고 이번 달 판정 행을 붙인다, 이력이 없으면 trend 는 한 행', () => {
  const tables = loadTables();
  const row = (month) => ({ month, basis: 'BACKFILL' });
  const b = boardFromLedger(tables, { history: [row('2026-08'), row('2026-09'), row('2026-10'), row('2026-11')] });
  assert.deepEqual(b.trend.map((r) => `${r.month} ${r.basis}`), ['2026-08 BACKFILL', '2026-09 BACKFILL', '2026-10 OBSERVED']);
  assert.equal(boardFromLedger(tables).trend.length, 1);
});
