'use strict';
// Supabase 적재 도구(tools/ledger/supabase-load.js): 묶음 나누기·스테이징 모양·dry-run 무호출·보드 불일치 거부·Storage 키. fetch 는 가짜(네트워크 없음).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const L = require('../../tools/ledger/supabase-load');

const ROOT = path.join(__dirname, '..', '..');
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test' };
const tables = L.readTables(path.join(ROOT, 'schemas/ledger-2026-10/tables'));

/* 가짜 Data API: 부른 것을 적고 RPC 마다 정해진 답을 준다 */
function fakeFetch() {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const p = new URL(url).pathname;
    const body = p.endsWith('/rpc/begin_run') ? '7' : p.endsWith('/rpc/publish_run') ? JSON.stringify(L.expectedCounts(tables, {})) : '';
    return { ok: true, status: 200, text: async () => body };
  };
  return { fetch, calls };
}

test('chunkRows: 순서를 지키며 바이트 한도 안에서 자르고, 한도보다 큰 항목은 혼자 한 묶음', () => {
  const items = Array.from({ length: 50 }, (_, i) => ({ tbl: 't', seq: i + 1, row: { v: 'x'.repeat(100) } }));
  const chunks = L.chunkRows(items, 1000);
  assert.ok(chunks.length > 1);
  assert.deepEqual(chunks.flat(), items);
  for (const ch of chunks) assert.ok(Buffer.byteLength(JSON.stringify(ch)) <= 1000);
  assert.equal(L.chunkRows([{ row: 'y'.repeat(5000) }], 1000).length, 1);
});

test('stageItems: 표마다 파일 순서대로 seq 1…, 보드는 tbl board', () => {
  const items = L.stageItems({ a: [{ k: 1 }, { k: 2 }], b: [] }, { schema: 'ledger-board/1' });
  assert.deepEqual(items, [{ tbl: 'a', seq: 1, row: { k: 1 } }, { tbl: 'a', seq: 2, row: { k: 2 } }, { tbl: 'board', seq: 1, row: { schema: 'ledger-board/1' } }]);
  assert.deepEqual(L.expectedCounts({ a: [1, 2], b: [] }, {}), { a: 2, b: 0, board: 1 });
});

test('dry-run: fetch 를 한 번도 부르지 않는다', async () => {
  const f = fakeFetch();
  const r = await L.load({ month: '2026-10', dryRun: true, env: ENV, fetch: f.fetch, log: () => {} });
  assert.equal(f.calls.length, 0);
  assert.equal(r.counts.areas, tables.areas.length);
  assert.equal(r.counts.board, 1);
});

test('보드가 data/board/ledger-board.json 과 다르면 호출 전에 멈춘다', async () => {
  const board = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/board/ledger-board.json'), 'utf8'));
  board.scope.units += 1;
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sb-load-')), 'board.json');
  fs.writeFileSync(tmp, JSON.stringify(board));
  const f = fakeFetch();
  await assert.rejects(L.load({ month: '2026-10', boardFile: tmp, env: ENV, fetch: f.fetch, log: () => {} }), /ledger-board\.json 와 다르다/);
  assert.equal(f.calls.length, 0);
});

test('적재 호출 순서와 모양: begin_run → stage_rows 묶음(≤1 MB) → publish_run, 키는 머리에만', async () => {
  const f = fakeFetch();
  const r = await L.load({ month: '2026-10', skipRaw: true, env: ENV, fetch: f.fetch, log: () => {} });
  const paths = f.calls.map((c) => new URL(c.url).pathname);
  assert.equal(paths[0], '/rest/v1/rpc/begin_run');
  assert.equal(paths.at(-1), '/rest/v1/rpc/publish_run');
  const stages = f.calls.filter((c) => c.url.endsWith('/rest/v1/stage_rows'));
  assert.equal(stages.length, r.chunks);
  assert.equal(stages.length, f.calls.length - 2);
  const begin = JSON.parse(f.calls[0].init.body);
  assert.equal(begin.p_month, '2026-10');
  assert.equal(begin.p_kind, 'load');
  assert.equal(begin.p_reference_date, '2026-10-10');
  let staged = 0;
  for (const c of stages) {
    assert.equal(c.init.method, 'POST');
    assert.equal(c.init.headers['Content-Profile'], 'ledger_admin');
    assert.equal(c.init.headers.Prefer, 'return=minimal');
    assert.equal(c.init.headers.apikey, ENV.SUPABASE_SECRET_KEY);
    assert.ok(Buffer.byteLength(c.init.body) <= L.CHUNK_BYTES);
    const rows = JSON.parse(c.init.body);
    for (const row of rows) assert.deepEqual(Object.keys(row), ['run_id', 'tbl', 'seq', 'row']);
    assert.ok(rows.every((x) => x.run_id === 7));
    staged += rows.length;
  }
  const expected = JSON.parse(f.calls.at(-1).init.body);
  assert.deepEqual(expected, { p_run: 7, p_expected: L.expectedCounts(tables, {}) });
  assert.equal(staged, Object.values(tables).reduce((s, rows) => s + rows.length, 0) + 1);
  for (const c of f.calls) assert.ok(!c.url.includes(ENV.SUPABASE_SECRET_KEY));
});

test('원본 업로드: ASCII 키·덮어쓰기, 16표 묶음, 끝에 record_files', async () => {
  const f = fakeFetch();
  const r = await L.load({ month: '2026-10', env: ENV, fetch: f.fetch, log: () => {} });
  const uploads = f.calls.filter((c) => c.url.includes('/storage/v1/object/ledger-raw/'));
  assert.equal(uploads.length, r.files.length);
  for (const c of uploads) {
    const key = c.url.split('/storage/v1/object/ledger-raw/')[1];
    assert.match(key, /^2026-10\/[A-Za-z0-9._/-]+\.gz$/);
    assert.equal(c.init.headers['x-upsert'], 'true');
  }
  assert.ok(r.files.some((x) => x.path === '2026-10/tables.tar.gz'));
  assert.ok(r.files.some((x) => x.path.startsWith('2026-10/legal-dong/u-') && x.source.startsWith('raw/legal-dong/')));
  assert.ok(r.files.some((x) => x.path === '2026-10/hub/1129013800.json.gz'));
  const last = f.calls.at(-1);
  assert.ok(last.url.endsWith('/rpc/record_files'));
  assert.equal(JSON.parse(last.init.body).p_files.length, r.files.length);
});

test('safeKey: 한글·대괄호 이름은 되돌릴 수 있는 base64url 로, ASCII 는 그대로', () => {
  assert.equal(L.safeKey('1129013800.json'), '1129013800.json');
  const k = L.safeKey('[가상]기관_일정.csv');
  assert.match(k, /^u-[A-Za-z0-9_-]+\.csv$/);
  assert.equal(Buffer.from(k.slice(2, -4), 'base64url').toString('utf8'), '[가상]기관_일정');
});

test('tarball: 같은 입력이면 같은 바이트, 512 바이트 블록', () => {
  const files = [{ name: 'a.json', data: Buffer.from('{"x":1}') }, { name: 'b.json', data: Buffer.alloc(600, 1) }];
  const a = L.tarball(files), b = L.tarball(files);
  assert.ok(a.equals(b));
  assert.equal(a.length % 512, 0);
  assert.equal(a.subarray(0, 6).toString(), 'a.json');
  assert.ok(zlib.gzipSync(a).equals(zlib.gzipSync(b)));
});

test('parseArgs: --month 필수, 플래그', () => {
  assert.deepEqual(L.parseArgs(['--month', '2026-10', '--dry-run', '--skip-raw']), { month: '2026-10', dryRun: true, skipRaw: true });
  assert.throws(() => L.parseArgs([]), /--month/);
  assert.throws(() => L.parseArgs(['--month', '2026-13']), /--month/);
});
