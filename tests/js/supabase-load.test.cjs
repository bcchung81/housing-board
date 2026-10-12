'use strict';
// Supabase 적재 도구(tools/ledger/supabase-load.js): 묶음 나누기·스테이징 모양·dry-run 무호출·보드 불일치 거부·Storage 키·실패 시 미발행·연결 문자열 가림.
// DB 는 가짜 pg 연결, Storage 는 가짜 fetch(네트워크 없음).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const L = require('../../tools/ledger/supabase-load');

const ROOT = path.join(__dirname, '..', '..');
const DB_URL = 'postgresql://postgres.testref:s3cr%40tpw@aws-0-test.pooler.example.com:5432/postgres';
const SECRETS = ['s3cr', 'tpw', 'testref', 'pooler.example.com'];
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test', SUPABASE_DB_URL: DB_URL };
/* 적재할 달 = 저장된 보드의 관측 달(2026-10 첫 판 · 기준일 2026-10-10) — 월 갱신 뒤에도 시험을 고치지 않게 */
const { observedMonth: MONTH, referenceDate: REF } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/board/ledger-board.json'), 'utf8'));
const tables = L.readTables(path.join(ROOT, `schemas/ledger-${MONTH}/tables`));
const mapFile = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/board/ledger-map.json'), 'utf8'));

/* 가짜 Storage REST: 부른 것을 적는다 */
function fakeFetch() {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, text: async () => '' };
  };
  return { fetch, calls };
}

/* 가짜 pg 연결: SQL·인자를 적고 함수마다 정해진 답을 준다. failOn 이 SQL 에 있으면 그 호출에서 (연결 문자열이 섞인) 오류를 던진다 */
function fakeDb({ failOn, failConnect } = {}) {
  const calls = [], urls = [];
  let ended = 0;
  const db = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (failOn && sql.includes(failOn)) throw new Error(`${failOn} 실패 — ${DB_URL} (host aws-0-test.pooler.example.com, password s3cr@tpw)`);
      if (sql.includes('ledger_admin.begin_run')) return { rows: [{ v: '7' }] };   // bigint 는 문자열로 온다
      if (sql.includes('ledger_admin.publish_run')) return { rows: [{ v: L.expectedCounts(tables, {}) }] };
      if (sql.includes('ledger_admin.publish_map')) return { rows: [{ v: Object.keys(JSON.parse(params[1])).length }] };
      return { rows: [] };
    },
    end: async () => { ended++; },
  };
  const connect = async (url) => {
    urls.push(url);
    if (failConnect) throw new Error(`connect ECONNREFUSED ${new URL(DB_URL).host} for ${DB_URL}`);
    return db;
  };
  return { connect, calls, urls, ended: () => ended, sqls: () => calls.map((c) => c.sql) };
}

const kind = (sql) => sql.startsWith('set statement_timeout') ? 'timeout' : sql === 'begin' || sql === 'commit' || sql === 'rollback' ? sql
  : sql.startsWith('insert into ledger_admin.stage_rows') ? 'stage' : (sql.match(/ledger_admin\.(\w+)\(/) || [])[1] ?? sql;
const noSecret = (text) => { for (const x of SECRETS) assert.ok(!text.includes(x), `비밀 조각 ${x} 가 나왔다`); };

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

test('dry-run: DB 연결·fetch 를 한 번도 부르지 않는다', async () => {
  const f = fakeFetch(), d = fakeDb();
  const r = await L.load({ month: MONTH, dryRun: true, env: ENV, fetch: f.fetch, connect: d.connect, log: () => {} });
  assert.equal(f.calls.length, 0);
  assert.equal(d.urls.length, 0);
  assert.equal(r.counts.areas, tables.areas.length);
  assert.equal(r.counts.board, 1);
});

test('보드가 data/board/ledger-board.json 과 다르면 호출 전에 멈춘다', async () => {
  const board = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/board/ledger-board.json'), 'utf8'));
  board.scope.units += 1;
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sb-load-')), 'board.json');
  fs.writeFileSync(tmp, JSON.stringify(board));
  const f = fakeFetch(), d = fakeDb();
  await assert.rejects(L.load({ month: MONTH, boardFile: tmp, env: ENV, fetch: f.fetch, connect: d.connect, log: () => {} }), /ledger-board\.json 와 다르다/);
  assert.equal(f.calls.length, 0);
  assert.equal(d.urls.length, 0);
});

test('지도 색인이 data/board/ledger-map.json 과 다르면 호출 전에 멈춘다', async () => {
  const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/board/ledger-map.json'), 'utf8'));
  map.bySgg['28245'][0].cls = 'delay';
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sb-load-')), 'map.json');
  fs.writeFileSync(tmp, JSON.stringify(map));
  const f = fakeFetch(), d = fakeDb();
  await assert.rejects(L.load({ month: MONTH, mapFile: tmp, env: ENV, fetch: f.fetch, connect: d.connect, log: () => {} }), /ledger-map\.json 와 다르다/);
  assert.equal(f.calls.length, 0);
  assert.equal(d.urls.length, 0);
});

test('적재 순서와 모양: 제한 시간 → begin_run(커밋) → begin → 스테이징 묶음 → publish_run → publish_map → commit, 연결 문자열은 connect 에만', async () => {
  const f = fakeFetch(), d = fakeDb();
  const logs = [];
  const r = await L.load({ month: MONTH, skipRaw: true, env: ENV, fetch: f.fetch, connect: d.connect, log: (m) => logs.push(m) });
  assert.deepEqual(d.urls, [DB_URL]);
  assert.equal(f.calls.length, 0);
  const kinds = d.sqls().map(kind);
  assert.deepEqual(kinds, ['timeout', 'begin_run', 'begin', ...Array(r.chunks).fill('stage'), 'publish_run', 'publish_map', 'commit']);
  assert.equal(d.calls[0].sql, `set statement_timeout = '${L.STATEMENT_TIMEOUT}'`);
  assert.equal(d.ended(), 1);
  const [month, k, ref, meta] = d.calls[1].params;
  assert.deepEqual([month, k, ref], [MONTH, 'load', REF]);
  assert.equal(JSON.parse(meta).tool, 'tools/ledger/supabase-load.js');
  let staged = 0;
  for (const c of d.calls.filter((x) => kind(x.sql) === 'stage')) {
    assert.equal(c.sql, L.STAGE_SQL);
    assert.equal(c.params[0], 7);
    assert.ok(Buffer.byteLength(c.params[1]) <= L.CHUNK_BYTES);
    const rows = JSON.parse(c.params[1]);
    for (const row of rows) assert.deepEqual(Object.keys(row), ['tbl', 'seq', 'row']);
    staged += rows.length;
  }
  assert.equal(staged, Object.values(tables).reduce((s, rows) => s + rows.length, 0) + 1);
  const pub = d.calls.find((x) => kind(x.sql) === 'publish_run');
  assert.deepEqual([pub.params[0], JSON.parse(pub.params[1])], [7, L.expectedCounts(tables, {})]);
  const map = d.calls.find((x) => kind(x.sql) === 'publish_map');
  assert.deepEqual([map.params[0], JSON.parse(map.params[1])], [7, mapFile().bySgg]);
  assert.equal(r.runId, 7);
  assert.equal(r.mapRows, Object.keys(mapFile().bySgg).length);
  for (const t of ['begin', 'stage', 'publish', 'map', 'raw']) assert.ok(Number.isInteger(r.timings[t]), t);
  noSecret(logs.join('\n'));
});

test('publish_run 이 실패하면 되돌리고(commit 없음) 지도·원본·record_files 로 가지 않는다, 오류에 연결 문자열이 없다', async () => {
  const f = fakeFetch(), d = fakeDb({ failOn: 'ledger_admin.publish_run' });
  const err = await L.load({ month: MONTH, env: ENV, fetch: f.fetch, connect: d.connect, log: () => {} }).then(() => null, (e) => e);
  assert.match(err.message, /publish_run 실패/);
  noSecret(err.message);
  const kinds = d.sqls().map(kind);
  assert.equal(kinds.at(-1), 'rollback');
  for (const k of ['commit', 'publish_map', 'record_files']) assert.ok(!kinds.includes(k), k);
  assert.equal(f.calls.length, 0);
  assert.equal(d.ended(), 1);
});

test('스테이징 중 실패도 되돌리고 publish_run 을 부르지 않는다', async () => {
  const d = fakeDb({ failOn: 'insert into ledger_admin.stage_rows' });
  await assert.rejects(L.load({ month: MONTH, skipRaw: true, env: ENV, fetch: fakeFetch().fetch, connect: d.connect, log: () => {} }), /실패/);
  const kinds = d.sqls().map(kind);
  assert.deepEqual(kinds, ['timeout', 'begin_run', 'begin', 'stage', 'rollback']);
});

test('지도 행 수가 기대와 다르면 commit 하지 않는다', async () => {
  const d = fakeDb();
  const conn = async (url) => {
    const db = await d.connect(url);
    return { ...db, query: async (sql, params) => sql.includes('publish_map') ? (d.calls.push({ sql, params }), { rows: [{ v: 1 }] }) : db.query(sql, params) };
  };
  await assert.rejects(L.load({ month: MONTH, skipRaw: true, env: ENV, fetch: fakeFetch().fetch, connect: conn, log: () => {} }), /publish_map 이 1행/);
  const kinds = d.sqls().map(kind);
  assert.equal(kinds.at(-1), 'rollback');
  assert.ok(!kinds.includes('commit'));
});

test('연결 실패·SUPABASE_DB_URL 없음: 오류에 연결 문자열·호스트·비밀번호가 없다', async () => {
  const d = fakeDb({ failConnect: true });
  const err = await L.load({ month: MONTH, skipRaw: true, env: ENV, fetch: fakeFetch().fetch, connect: d.connect, log: () => {} }).then(() => null, (e) => e);
  assert.match(err.message, /ECONNREFUSED \*\*\*/);
  noSecret(err.message);
  const env = { ...ENV, SUPABASE_DB_URL: '' };
  const d2 = fakeDb();
  await assert.rejects(L.load({ month: MONTH, env, fetch: fakeFetch().fetch, connect: d2.connect, log: () => {} }), /SUPABASE_DB_URL 이 필요하다/);
  assert.equal(d2.urls.length, 0);
});

test('redact: 연결 문자열 통째·비밀번호(인코딩 전후)·사용자·호스트를 가린다', () => {
  const out = L.redact(`a ${DB_URL} b s3cr@tpw c s3cr%40tpw d postgres.testref e aws-0-test.pooler.example.com:5432 f postgres://x:y@z/w`, DB_URL);
  noSecret(out);
  assert.ok(!out.includes('x:y@z'));
  assert.equal(L.redact('그대로', DB_URL), '그대로');
});

test('원본 업로드: ASCII 키·덮어쓰기, 16표 묶음, 발행(commit) 뒤 올리고 끝에 record_files(DB)', async () => {
  const f = fakeFetch(), d = fakeDb();
  const r = await L.load({ month: MONTH, env: ENV, fetch: f.fetch, connect: d.connect, log: () => {} });
  const uploads = f.calls.filter((c) => c.url.includes('/storage/v1/object/ledger-raw/'));
  assert.equal(uploads.length, f.calls.length);
  assert.equal(uploads.length, r.files.length);
  for (const c of uploads) {
    const key = c.url.split('/storage/v1/object/ledger-raw/')[1];
    assert.match(key, new RegExp(`^${MONTH}/[A-Za-z0-9._/-]+\\.gz$`));
    assert.equal(c.init.headers['x-upsert'], 'true');
    assert.equal(c.init.headers.apikey, ENV.SUPABASE_SECRET_KEY);
    assert.ok(!c.url.includes(ENV.SUPABASE_SECRET_KEY));
  }
  assert.ok(r.files.some((x) => x.path === `${MONTH}/tables.tar.gz`));
  assert.ok(r.files.some((x) => x.path.startsWith(`${MONTH}/legal-dong/u-`) && x.source.startsWith('raw/legal-dong/')));
  assert.ok(r.files.some((x) => x.path === `${MONTH}/hub/1129013800.json.gz`));
  const kinds = d.sqls().map(kind);
  assert.deepEqual(kinds.slice(-2), ['commit', 'record_files']);
  const last = d.calls.at(-1);
  assert.equal(last.params[0], 7);
  assert.equal(JSON.parse(last.params[1]).length, r.files.length);
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
