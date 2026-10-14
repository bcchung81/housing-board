'use strict';
/* 사업 원장 한 달 판을 Supabase 에 싣는다 — 설계: docs/product/Supabase-원장-설계.md 5·6절, 마이그레이션 supabase/migrations/*_ledger_load.sql.
   정본은 저장소 파일(결정 1-A). DB 쪽(③~⑤')은 SUPABASE_DB_URL 로 직접 연결(pg, 결정 3-C — PostgREST 의 statement_timeout 8초를 피한다),
   Storage(⑥)만 secret 키로 REST.
   ① schemas/ledger-<달>/tables/*.json 읽기 → validate.js 오류 0
   ② board.js 로 그 달 보드 계산 → data/board/ledger-board.json 과 같아야 한다(기준일은 그 파일의 referenceDate)
   ③ ledger_admin.begin_run → run_id(닫힌 달이면 DB 가 거부). 이것만 먼저 커밋한다(실행 기록)
   ④~⑤' 한 트랜잭션: stage_rows 에 묶음(약 1 MB) INSERT(보드 JSON 은 tbl 'board') → ledger_admin.publish_run(표별 행 수가 기대와 다르면 거부. 이번 판에 없는 projects·complexes 는 지우고,
      닫힌 달 events 가 가리키면 retired_run_id 로 표시해 남긴다 — 마이그레이션 *_ledger_refine.sql)
      → ledger_admin.publish_map(지도 색인 data/board/ledger-map.json = mapIndexFromLedger(표), ②에서 대조, 마이그레이션 *_map_snapshots.sql)
      → ledger_admin.publish_screens(화면 파일 넷 SCREEN_FILES 를 그대로, ②에서 모양만 확인, 마이그레이션 *_screen_snapshots.sql).
      어디서든 실패하면 되돌려 발행되지 않는다(실행은 'staged' 로 남고 다음 begin_run 이 failed 로 돌린다)
   ⑥ 원본(raw·snapshot·mappings·agency)과 16표 묶음(tables.tar.gz)을 Storage ledger-raw/<달>/ 에 덮어쓰기(같은 달 재실행 = 같은 내용) → record_files
   실행: node tools/ledger/supabase-load.js --month 2026-10 [--dry-run] [--skip-raw]
   확인: node tools/ledger/supabase-verify.js --month 2026-10 · 시험: tests/js/supabase-load.test.cjs */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');
const { boardFromLedger, mapIndexFromLedger, loadHistory, MAP_OUT } = require('./board');
const { validate } = require('./validate');

const ROOT = path.join(__dirname, '..', '..');
const BOARD_FILE = 'data/board/ledger-board.json';
const BUCKET = 'ledger-raw';
const CHUNK_BYTES = 1_000_000;
const STATEMENT_TIMEOUT = '120s';   // 이 연결에서만. publish_run 실측은 부록 C
const STAGE_SQL = 'insert into ledger_admin.stage_rows (run_id, tbl, seq, "row") select $1, x.tbl, x.seq, x."row" from jsonb_to_recordset($2::jsonb) as x(tbl text, seq integer, "row" jsonb)';
const RAW_DIRS = ['raw', 'snapshot', 'mappings', 'agency'];   // raw/<원천>/… 은 <달>/<원천>/… 로(설계 5절)
/* 화면 표시값(api.screens): 키 → 저장소 파일과 그 파일에 있어야 하는 필드(배열·객체) */
const SCREEN_FILES = {
  molit: { file: 'data/board/molit.json', arrays: ['months', 'sido'], objects: ['metrics'] },
  lh: { file: 'data/board/lh-completion.json', arrays: ['blocks'], objects: [] },
  sources: { file: 'data/board/sources.json', arrays: ['items'], objects: [] },
  registry: { file: 'registry/projects.json', arrays: ['projects'], objects: [] },
};

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

/* 파일 보드와 다시 계산한 보드가 같아야 한다(판정 이력 history 는 board.js 가 쓰는 data/board/judgment-history.json 의 행). 같으면 보드를 돌려준다 */
function checkBoard(tables, fileBoard, month, history = []) {
  if (fileBoard.observedMonth !== month) throw new Error(`${BOARD_FILE} 의 observedMonth ${fileBoard.observedMonth} ≠ ${month}`);
  const board = boardFromLedger(tables, { referenceDate: fileBoard.referenceDate, observedMonth: month, history });
  if (!isDeepStrictEqual(board, fileBoard)) throw new Error(`boardFromLedger 결과가 ${BOARD_FILE} 와 다르다(node tools/ledger/board.js 로 다시 만들고 확인)`);
  return board;
}

/* 파일 지도 색인과 다시 계산한 색인이 같아야 한다(기준일·달은 보드 파일과 같게). 같으면 색인을 돌려준다 */
function checkMap(tables, fileMap, board) {
  const index = mapIndexFromLedger(tables, { referenceDate: board.referenceDate, observedMonth: board.observedMonth });
  if (!isDeepStrictEqual(index, fileMap)) throw new Error(`mapIndexFromLedger 결과가 ${MAP_OUT} 와 다르다(node tools/ledger/board.js 로 다시 만들고 확인)`);
  return index;
}

/* 화면 파일 넷을 읽고 모양만 확인한다(깊은 내용은 화면이 쓰는 그대로). → {키: 파일 내용} */
function readScreens(root) {
  const out = {};
  for (const [key, { file, arrays, objects }] of Object.entries(SCREEN_FILES)) {
    const v = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
    const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
    if (!isObj(v) || !arrays.every((k) => Array.isArray(v[k])) || !objects.every((k) => isObj(v[k]))) {
      throw new Error(`${file} 모양이 다르다(배열 ${arrays.join('·')}${objects.length ? `, 객체 ${objects.join('·')}` : ''} 가 있어야 한다)`);
    }
    out[key] = v;
  }
  return out;
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

/* DB 직접 연결(결정 3-C). { query(sql, params) → { rows }, end() } 를 돌려준다 — 시험은 같은 모양의 가짜를 넘긴다 */
async function pgConnect(url) {
  const { Client } = require('pg');
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  c.on('error', () => {});   // 끊김은 다음 query 의 실패로 드러난다(이벤트 오류 문장은 흘리지 않는다)
  await c.connect();
  return c;
}

/* 오류 문장에서 연결 문자열과 그 조각(비밀번호·사용자·호스트)을 가린다 */
function redact(msg, url) {
  let s = String(msg);
  const parts = [url];
  try {
    const u = new URL(url);
    parts.push(u.password, decodeURIComponent(u.password), u.username, decodeURIComponent(u.username), u.host, u.hostname);
  } catch { /* URL 이 아니면 통째로만 가린다 */ }
  for (const p of parts.filter(Boolean).sort((a, b) => b.length - a.length)) s = s.split(p).join('***');
  return s.replace(/postgres(ql)?:\/\/\S+/g, 'postgres://***');
}

/* Storage·Data API 손잡이. 키는 머리에만 싣고 오류 문장에 넣지 않는다 */
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
    upload: (key, data, contentType) => call('POST', `/storage/v1/object/${BUCKET}/${key}`, { headers: { 'Content-Type': contentType, 'x-upsert': 'true' }, body: data }),
    /* 객체 바이트. 없으면(4xx) null, 서버 오류면 던진다(tools/ledger/raw-store.js) */
    download: async (key) => {
      const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${key}`, { headers: auth });
      if (res.status >= 500) throw new Error(`GET /storage/v1/object/${BUCKET}/${key} → ${res.status}`);
      return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
    },
  };
}

async function load({ month, dryRun = false, skipRaw = false, root = ROOT, boardFile = path.join(root, BOARD_FILE), mapFile = path.join(root, MAP_OUT), env = readEnv(root), fetch = globalThis.fetch, connect = pgConnect, log = console.log } = {}) {
  const timings = {};
  let t0 = Date.now();
  const lap = (k) => { timings[k] = Date.now() - t0; t0 = Date.now(); };
  const dir = monthDir(root, month);
  const tables = readTables(path.join(dir, 'tables'));
  const errors = validate(tables);
  if (errors.length) throw new Error(`validate.js 오류 ${errors.length}건: ${errors.slice(0, 3).join(' / ')}`);
  lap('read');
  const fileBoard = JSON.parse(fs.readFileSync(boardFile, 'utf8'));
  const board = checkBoard(tables, fileBoard, month, loadHistory(root));
  const map = checkMap(tables, JSON.parse(fs.readFileSync(mapFile, 'utf8')), board);
  const screens = readScreens(root);
  lap('board');
  const expected = expectedCounts(tables, board);
  const items = stageItems(tables, board);
  const chunks = chunkRows(items);
  const raws = skipRaw ? [] : rawFiles(dir, month);
  const summary = { month, referenceDate: fileBoard.referenceDate, counts: expected, mapSgg: Object.keys(map.bySgg).length, screens: Object.keys(screens).length, chunks: chunks.length, raw: raws.length + (skipRaw ? 0 : 1), dryRun };
  if (dryRun) {
    log(`[dry-run] ${month}: 표 ${Object.keys(tables).length}개 · ${chunks.length}묶음 · 지도 시군구 ${summary.mapSgg} · 화면 ${summary.screens} · 원본 ${summary.raw}개 — 호출 없음`);
    return { ...summary, timings };
  }

  const dbUrl = env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error('SUPABASE_DB_URL 이 필요하다(.env.local)');
  const api = client({ url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.SUPABASE_SECRET_KEY, fetch });
  const one = async (db, sql, params) => (await db.query(sql, params)).rows[0].v;
  let db, runId, published, mapRows, screenRows;
  const files = [];
  try {
    db = await connect(dbUrl);
    await db.query(`set statement_timeout = '${STATEMENT_TIMEOUT}'`);
    runId = Number(await one(db, 'select ledger_admin.begin_run($1, $2, $3::date, $4::jsonb) as v', [month, 'load', fileBoard.referenceDate,
      JSON.stringify({ tool: 'tools/ledger/supabase-load.js', git_commit: gitCommit(root), params: { tables: `schemas/ledger-${month}/tables` } })]));
    lap('begin');
    await db.query('begin');
    try {
      for (const ch of chunks) await db.query(STAGE_SQL, [runId, JSON.stringify(ch)]);
      lap('stage');
      published = await one(db, 'select ledger_admin.publish_run($1, $2::jsonb) as v', [runId, JSON.stringify(expected)]);
      lap('publish');
      mapRows = Number(await one(db, 'select ledger_admin.publish_map($1, $2::jsonb) as v', [runId, JSON.stringify(map.bySgg)]));
      if (mapRows !== summary.mapSgg) throw new Error(`publish_map 이 ${mapRows}행을 넣었다(기대 ${summary.mapSgg})`);
      screenRows = Number(await one(db, 'select ledger_admin.publish_screens($1, $2::jsonb) as v', [runId, JSON.stringify(screens)]));
      if (screenRows !== summary.screens) throw new Error(`publish_screens 가 ${screenRows}행을 넣었다(기대 ${summary.screens})`);
      await db.query('commit');
      lap('map');
    } catch (e) {
      await db.query('rollback').catch(() => {});
      throw e;
    }

    if (!skipRaw) {
      const put = async (key, data, source) => {
        await api.upload(key, data, 'application/gzip');
        files.push({ bucket: BUCKET, path: key, bytes: data.length, sha256: sha256(data), source });
      };
      for (const f of raws) await put(f.key, zlib.gzipSync(fs.readFileSync(path.join(dir, f.source))), f.source);
      const tdir = path.join(dir, 'tables');
      const tar = tarball(fs.readdirSync(tdir).filter((f) => f.endsWith('.json')).sort().map((f) => ({ name: f, data: fs.readFileSync(path.join(tdir, f)) })));
      await put(`${month}/tables.tar.gz`, zlib.gzipSync(tar), 'tables/*.json');
      await db.query('select ledger_admin.record_files($1, $2::jsonb)', [runId, JSON.stringify(files)]);
    }
  } catch (e) {
    throw new Error(redact(e instanceof Error ? e.message : e, dbUrl));
  } finally {
    if (db) await db.end().catch(() => {});
  }
  lap('raw');
  const result = { ...summary, runId, published, mapRows, screenRows, files, timings };
  const { orphans, ...tableCounts } = published;
  log(`${month} 판 발행: run ${runId} · ${Object.entries(tableCounts).map(([k, v]) => `${k} ${v}`).join(' · ')} · 지도 시군구 ${mapRows} · 화면 ${screenRows}`);
  if (orphans) log(`고아 정리(이번 판에 없는 행): 사업 지움 ${orphans.projects_deleted} · 표시 ${orphans.projects_retired} · 단지 지움 ${orphans.complexes_deleted} · 표시 ${orphans.complexes_retired}`);
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

module.exports = { parseArgs, readEnv, readTables, checkBoard, checkMap, readScreens, stageItems, expectedCounts, chunkRows, safeKey, rawFiles, tarball, client, pgConnect, redact, load, revalidateBoard, BUCKET, CHUNK_BYTES, SCREEN_FILES, STAGE_SQL, STATEMENT_TIMEOUT };

if (require.main === module) {
  load(parseArgs(process.argv.slice(2))).catch((e) => { console.error(e.message); process.exit(1); });
}
