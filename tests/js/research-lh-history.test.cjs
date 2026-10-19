'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { assertSafeOut, OUT_DIR, ROOT } = require('../../tools/research/chain/collect_lh_history.js');

test('출력 경로는 schemas/ 아래가 아니라 연구 폴더', () => {
  const rel = path.relative(ROOT, OUT_DIR);
  assert.ok(!rel.startsWith('schemas'));
  assert.ok(rel.startsWith(path.join('docs', 'speech', 'research')));
  assert.strictEqual(assertSafeOut(OUT_DIR), OUT_DIR);
});
test('schemas 경로는 거부', () => {
  assert.throws(() => assertSafeOut(path.join(ROOT, 'schemas', 'ledger-2026-10', 'raw', 'lh-notice')));
  assert.throws(() => assertSafeOut(path.join(ROOT, '..', 'x')));
});
