'use strict';
/* 사업 원장 한 달 판을 Supabase 에 싣는다 — 설계: docs/product/Supabase-원장-설계.md 5·6절, 마이그레이션 supabase/migrations/*_ledger_load.sql.
   정본은 저장소 파일(결정 1-A). secret 키로 Data API(PostgREST·Storage REST)만 쓴다(새 패키지 없음, 결정 3-A).
   ① schemas/ledger-<달>/tables/*.json 읽기 → validate.js 오류 0
   ② board.js 로 그 달 보드 계산 → data/board/ledger-board.json 과 같아야 한다(기준일은 그 파일의 referenceDate)
   ③ ledger_admin.begin_run → run_id(닫힌 달이면 DB 가 거부)
   ④ ledger_admin.stage_rows 에 묶음(약 1 MB)으로 POST, 보드 JSON 은 tbl 'board'
   ⑤ ledger_admin.publish_run — 한 트랜잭션(표별 행 수가 기대와 다르면 전체 취소)
   ⑥ 원본(raw·snapshot·mappings·agency)과 16표 묶음(tables.tar.gz)을 Storage ledger-raw/<달>/ 에 덮어쓰기(같은 달 재실행 = 같은 내용) → record_files
   실행: node tools/ledger/supabase-load.js --month 2026-10 [--dry-run] [--skip-raw]
   확인: node tools/ledger/supabase-verify.js --month 2026-10 · 시험: tests/js/supabase-load.test.cjs */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');
const { boardFromLedger } = require('./board');
const { validate } = require('./validate');

const ROOT = path.join(__dirname, '..', '..');
const BOARD_FILE = 'data/board/ledger-board.json';
const BUCKET = 'ledger-raw';
const CHUNK_BYTES = 1_000_000;
const RAW_DIRS = ['raw', 'snapshot', 'mappings', 'agency'];   // raw/<원천>/… 은 <달>/<원천>/… 로(설계 5절)

function parseArgs(argv) {
  const o = { month: null, dryRun: false, skipRaw: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--month') o.month = argv[++i];
    else if (argv[i] === '--dry-run') o.dryRun = true;
    else if (argv[i] === '--skip-raw') o.skipRaw = true;
    else throw new Error(`모르는 인자 ${argv[i]}`);
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(o.month ?? '')) throw new Error('--month YYYY-MM 이 필요하다');
  return o;
}

/* .env.local 의 KEY=VALUE 위에 process.env 를 덮는다 */
function readEnv(root = ROOT, env = process.env) {
  const out = {};
  const file = path.join(root, '.env.local');
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return { ...out, ...env };
}

const monthDir = (root, month) => path.join(root, 'schemas', `ledger-${month}`);

function readTables(dir) {
  return Object.fromEntries(fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    .map((f) => [f.slice(0, -5), JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).rows]));
}

/* 파일 보드와 다시 계산한 보드가 같아야 한다. 같으면 보드를 돌려준다 */
function checkBoard(tables, fileBoard, month) {
  if (fileBoard.observedMonth !== month) throw new Error(`${BOARD_FILE} 의 observedMonth ${fileBoard.observedMonth} ≠ ${month}`);
  const board = boardFromLedger(tables, { referenceDate: fileBoard.referenceDate, observedMonth: month });
  if (!isDeepStrictEqual(board, fileBoard)) throw new Error(`boardFromLedger 결과가 ${BOARD_FILE} 와 다르다(node tools/ledger/board.js 로 다시 만들고 확인)`);
  return board;
}

/* 스테이징 행: 표마다 파일 순서대로 seq 1… (= load_seq), 보드는 tbl 'board' seq 1 */
function stageItems(tables, board) {
  const items = [];
  for (const [tbl, rows] of Object.entries(tables)) rows.forEach((row, i) => items.push({ tbl, seq: i + 1, row }));
  if (board) items.push({ tbl: 'board', seq: 1, row: board });
  return items;
}

const expectedCounts = (tables, board) => ({ ...Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, rows.length])), ...(board ? { board: 1 } : {}) });

/* JSON 바이트가 maxBytes 를 넘기 전에 자른다(한 항목이 더 크면 그 항목 혼자 한 묶음) */
function chunkRows(items, maxBytes = CHUNK_BYTES) {
  const chunks = [];
  let cur = [], size = 2;
  for (const it of items) {
    const n = Buffer.byteLength(JSON.stringify(it)) + 1;
    if (cur.length && size + n > maxBytes) { chunks.push(cur); cur = []; size = 2; }
    cur.push(it); size += n;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

/* Storage 키는 ASCII 일부만 받는다(한글·[] 는 InvalidKey, 2026-10-11 실측). 그런 이름은 u-<base64url(확장자 앞 이름)><확장자> 로 바꾸고 원래 경로는 files.source 에 남긴다 */
function safeKey(name) {
  if (/^[A-Za-z0-9._-]+$/.test(name)) return name;
  const ext = path.extname(name);
  return `u-${Buffer.from(name.slice(0, name.length - ext.length), 'utf8').toString('base64url')}${/^[A-Za-z0-9.]*$/.test(ext) ? ext : ''}`;
}

/* 올릴 원본: RAW_DIRS 아래 파일(점 파일 제외) → { source(달 폴더 기준 경로), key(버킷 안 경로, .gz) } */
function rawFiles(dir, month) {
  const out = [];
  const walk = (rel) => {
    const abs = path.join(dir, rel);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name.startsWith('.')) continue;
      const r = path.posix.join(rel, e.name);
      if (e.isDirectory()) walk(r);
      else {
        const parts = r.split('/');
        if (parts[0] === 'raw') parts.shift();
        out.push({ source: r, key: `${month}/${parts.map(safeKey).join('/')}.gz` });
      }
    }
  };
  for (const d of RAW_DIRS) walk(d);
  return out;
}

/* 최소 ustar 묶음(시각·소유자 0 고정 → 같은 파일이면 같은 바이트) */
function tarball(files) {
  const blocks = [];
  for (const { name, data } of files) {
    const h = Buffer.alloc(512);
    h.write(name, 0, 100, 'utf8');
    h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
    h.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124);
    h.write('00000000000\0', 136);
    h.write('        ', 148); h.write('0', 156); h.write('ustar\0', 257); h.write('00', 263);
    let sum = 0;
    for (const b of h) sum += b;
    h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
    blocks.push(h, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function gitCommit(root) {
  try {
    const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim() !== '';
    return dirty ? `${head}-dirty` : head;
  } catch { return null; }
}

/* Data API 손잡이. 키는 머리에만 싣고 오류 문장에 넣지 않는다 */
function client({ url, key, fetch = globalThis.fetch }) {
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL·SUPABASE_SECRET_KEY 가 필요하다(.env.local)');
  const auth = { apikey: key, Authorization: `Bearer ${key}` };
  const call = async (method, p, { headers = {}, body } = {}) => {
    const res = await fetch(`${url}${p}`, { method, headers: { ...auth, ...headers }, body });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${p.split('?')[0]} → ${res.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  };
  const json = { 'Content-Type': 'application/json' };
  return {
    rpc: (name, args) => call('POST', `/rest/v1/rpc/${name}`, { headers: { ...json, 'Content-Profile': 'ledger_admin' }, body: JSON.stringify(args) }),
    stage: (rows) => call('POST', '/rest/v1/stage_rows', { headers: { ...json, 'Content-Profile': 'ledger_admin', Prefer: 'return=minimal' }, body: JSON.stringify(rows) }),
    upload: (key, data, contentType) => call('POST', `/storage/v1/object/${BUCKET}/${key}`, { headers: { 'Content-Type': contentType, 'x-upsert': 'true' }, body: data }),
  };
}

async function load({ month, dryRun = false, skipRaw = false, root = ROOT, boardFile = path.join(root, BOARD_FILE), env = readEnv(root), fetch = globalThis.fetch, log = console.log } = {}) {
  const timings = {};
  let t0 = Date.now();
  const lap = (k) => { timings[k] = Date.now() - t0; t0 = Date.now(); };
  const dir = monthDir(root, month);
  const tables = readTables(path.join(dir, 'tables'));
  const errors = validate(tables);
  if (errors.length) throw new Error(`validate.js 오류 ${errors.length}건: ${errors.slice(0, 3).join(' / ')}`);
  lap('read');
  const fileBoard = JSON.parse(fs.readFileSync(boardFile, 'utf8'));
  const board = checkBoard(tables, fileBoard, month);
  lap('board');
  const expected = expectedCounts(tables, board);
  const items = stageItems(tables, board);
  const payload = (runId) => chunkRows(items.map((it) => ({ run_id: runId, ...it })));   // 묶음 크기는 run_id 까지 넣은 실제 본문으로 잰다
  const chunks = payload(0);
  const raws = skipRaw ? [] : rawFiles(dir, month);
  const summary = { month, referenceDate: fileBoard.referenceDate, counts: expected, chunks: chunks.length, raw: raws.length + (skipRaw ? 0 : 1), dryRun };
  if (dryRun) {
    log(`[dry-run] ${month}: 표 ${Object.keys(tables).length}개 · ${chunks.length}묶음 · 원본 ${summary.raw}개 — 호출 없음`);
    return { ...summary, timings };
  }

  const api = client({ url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.SUPABASE_SECRET_KEY, fetch });
  const runId = await api.rpc('begin_run', { p_month: month, p_kind: 'load', p_reference_date: fileBoard.referenceDate,
    p_meta: { tool: 'tools/ledger/supabase-load.js', git_commit: gitCommit(root), params: { tables: `schemas/ledger-${month}/tables` } } });
  lap('begin');
  for (const ch of payload(runId)) await api.stage(ch);
  lap('stage');
  const published = await api.rpc('publish_run', { p_run: runId, p_expected: expected });
  lap('publish');

  const files = [];
  if (!skipRaw) {
    const put = async (key, data, source) => {
      await api.upload(key, data, 'application/gzip');
      files.push({ bucket: BUCKET, path: key, bytes: data.length, sha256: sha256(data), source });
    };
    for (const f of raws) await put(f.key, zlib.gzipSync(fs.readFileSync(path.join(dir, f.source))), f.source);
    const tdir = path.join(dir, 'tables');
    const tar = tarball(fs.readdirSync(tdir).filter((f) => f.endsWith('.json')).sort().map((f) => ({ name: f, data: fs.readFileSync(path.join(tdir, f)) })));
    await put(`${month}/tables.tar.gz`, zlib.gzipSync(tar), 'tables/*.json');
    await api.rpc('record_files', { p_run: runId, p_files: files });
  }
  lap('raw');
  const result = { ...summary, runId, published, files, timings };
  log(`${month} 판 발행: run ${runId} · ${Object.entries(published).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  log(`원본 ${files.length}개(${files.reduce((s, f) => s + f.bytes, 0).toLocaleString()} B) · 시간(ms) ${Object.entries(result.timings).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  await revalidateBoard(env, log);
  return result;
}

/* 발행 뒤 화면 캐시 비우기(BOARD_REVALIDATE_URL 이 있을 때만). 실패해도 적재는 성공이므로 경고만 한다 */
async function revalidateBoard(env, log, fetch = globalThis.fetch) {
  if (!env.BOARD_REVALIDATE_URL) return;
  try {
    const res = await fetch(env.BOARD_REVALIDATE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-revalidate-secret': env.REVALIDATE_SECRET ?? '' }, body: JSON.stringify({ tag: 'ledger-board' }), signal: AbortSignal.timeout(10000) });
    log(`화면 캐시 비우기(ledger-board): HTTP ${res.status}`);
    if (!res.ok) console.warn('경고: 화면 캐시를 비우지 못했다(적재는 성공)');
  } catch (e) {
    console.warn(`경고: 화면 캐시 비우기 실패(${e instanceof Error ? e.name : '오류'}) — 적재는 성공`);
  }
}

module.exports = { parseArgs, readEnv, readTables, checkBoard, stageItems, expectedCounts, chunkRows, safeKey, rawFiles, tarball, client, load, revalidateBoard, BUCKET, CHUNK_BYTES };

if (require.main === module) {
  load(parseArgs(process.argv.slice(2))).catch((e) => { console.error(e.message); process.exit(1); });
}
