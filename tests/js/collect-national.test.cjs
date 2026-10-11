'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../tools/ledger/collect-national.js');

test('pageCount: 총건수 → 쪽 수', () => {
  assert.equal(C.pageCount(0), 0);
  assert.equal(C.pageCount(1), 1);
  assert.equal(C.pageCount(100), 1);
  assert.equal(C.pageCount(101), 2);
  assert.equal(C.pageCount(285), 3);
});

test('splitWindows: 연도별 창, 양 끝은 잘림', () => {
  assert.deepEqual(C.splitWindows('2024-01-01', '2026-10-11'), [
    { from: '2024-01-01', to: '2024-12-31' }, { from: '2025-01-01', to: '2025-12-31' }, { from: '2026-01-01', to: '2026-10-11' }]);
  assert.deepEqual(C.splitWindows('2026-03-05', '2026-10-11'), [{ from: '2026-03-05', to: '2026-10-11' }]);
  assert.deepEqual(C.splitWindows('2026-10-11', '2026-01-01'), []);
});

test('pickSupplyTargets: 매입·전세·어린이집 제외, 최신 순, 중복 제거, 상한', () => {
  const row = (id, name, dt, spl = '01') => ({ PAN_ID: id, AIS_TP_CD_NM: name, PAN_NM: `${name} 공고`, PAN_NT_ST_DT: dt, SPL_INF_TP_CD: spl });
  const rows = [row('a', '행복주택', '2026.01.01'), row('b', '매입임대', '2026.09.01'), row('c', '전세임대', '2026.09.02'), row('d', '분양주택', '2026.05.01'),
    row('d', '분양주택', '2026.05.01'), row('e', '가정어린이집', '2026.08.01'), row('f', '국민임대', '2026.07.01', '')];
  assert.deepEqual(C.pickSupplyTargets(rows, 10).map((r) => r.PAN_ID), ['d', 'a']);
  assert.deepEqual(C.pickSupplyTargets(rows, 1).map((r) => r.PAN_ID), ['d']);
});

test('countBy: 많은 순, 빈 값은 (없음)', () => {
  assert.deepEqual(C.countBy([{ k: 'a' }, { k: 'b' }, { k: 'a' }, {}], (r) => r.k), { a: 2, b: 1, '(없음)': 1 });
});

test('manifest: 필수 키가 모두 있다', () => {
  const m = C.manifest({ source: 's', endpoint: 'e', params: {}, calls: 3, pages: 2, records: 5, fetchedAt: '2026-10-11T00:00:00Z', notes: 'n', extra: { x: 1 } });
  for (const k of ['source', 'fetched_at', 'endpoint', 'params', 'calls', 'pages', 'records', 'notes', 'x']) assert.ok(k in m, k);
});
