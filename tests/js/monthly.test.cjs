'use strict';
// 사업 원장 월 갱신(tools/ledger/monthly.js · raw-store.js · paths.js): 가짜 목록·내려받기·실행과 임시 폴더로 '새 자료 없음' · '같은 달 새 판' · '새 달' · 거부 경로,
// 그리고 고정 경로(ledger-2026-10 · 2026-08)를 달·판 인자로 바꾼 뒤에도 지금 결과가 같은지. 네트워크를 쓰지 않는다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const M = require('../../tools/ledger/monthly');
const P = require('../../tools/ledger/paths');
const RS = require('../../tools/ledger/raw-store');

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const KST = (d, h = 0) => Date.UTC(...d.split('-').map((x, i) => (i === 1 ? +x - 1 : +x)), h) - 9 * 3600 * 1000;   // 한국시간 그날 h시
const ALL = ['basic', 'act', 'site'];
const NAME = { basic: '기본개요', act: '행위개요', site: '대지위치' };

/* 디렉터리 내용(경로·바이트) 지문 */
function tree(dir) {
  const out = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out.push(`${path.relative(dir, p)} ${sha(fs.readFileSync(p))}`); } };
  walk(dir);
  return out;
}
const write = (f, data) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof data === 'string' || Buffer.isBuffer(data) ? data : `${JSON.stringify(data, null, 1)}\n`); };
const next = (dm) => { const [y, m] = dm.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };
const fileInfo = (kind, dm, buf) => ({ service: `${NAME[kind]} (${dm.slice(0, 4)}년 ${dm.slice(5)}월, 데이터제공년월 ${next(dm)})`, zip: `주택인허가_${NAME[kind]}_${dm}.zip`, zip_bytes: buf.length, zip_sha256: sha(buf), member: `m_${kind}.txt`, member_bytes: 10, rows: 1, fetched_at: '2026-10-21T00:00:00.000Z' });

/* 2026-10 원장 폴더(판 2026-08, 과거 판 2026-07 하나)와 보드 파일이 있는 가짜 저장소 */
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'monthly-'));
  const base = path.join(root, 'schemas/ledger-2026-10');
  fs.mkdirSync(path.join(root, 'schemas/ledger'), { recursive: true });   // 달이 아닌 폴더는 무시
  const files = {};
  for (const k of ALL) { const buf = Buffer.from(`old ${k} 2026-08`); files[k] = { ...fileInfo(k, '2026-08', buf), columns: [{ name: `${k}열` }] }; write(path.join(base, 'raw/hub-bulk', files[k].zip), buf); }
  write(path.join(base, 'raw/hub-bulk/manifest.json'), { source: '건축HUB', fetched_at: '2026-10-11T01:37:31Z', endpoint: 'x', files });
  const h7 = Buffer.from('basic 2026-07');
  write(path.join(base, 'raw/hub-bulk-history/basic-2026-07.zip'), h7);
  write(path.join(base, 'raw/hub-bulk-history/manifest.json'), { source: '과거 판', files: [{ data_month: '2026-07', zip: 'basic-2026-07.zip', zip_sha256: sha(h7) }] });
  write(path.join(base, 'raw/legal-dong/국토교통부_법정동코드_20260929.csv'), 'code');
  write(path.join(base, 'raw/move-in/manifest.json'), {});
  write(path.join(base, 'raw/myhome/manifest.json'), {});
  write(path.join(base, 'mappings/hub-candidate-ids.json'), { 1: 'PRJ-11290-0001' });
  write(path.join(base, 'mappings/lh-block-sgg.json'), []);
  write(path.join(base, 'agency/templates/연계.csv'), 'a,b');
  write(path.join(base, 'snapshot/hub-bulk-2026-08.json'), '{}');
  write(path.join(base, 'snapshot/hub-bulk-2026-08.manifest.json'), '{}');
  for (const f of M.REFRESH_FILES) write(path.join(base, 'snapshot', f), '{}');   // 열린 달 API 덮어쓰기 결과
  write(path.join(base, 'tables/projects.json'), { rows: [] });
  const board = (month, ref, edition, n) => ({ observedMonth: month, referenceDate: ref, scope: { projects: n, judged: n - 1 }, judgment: { ok: { projects: n - 3 }, caution: { projects: 1 }, delay: { projects: 1 } }, trend: [{ month, edition }] });
  write(path.join(root, 'data/board/ledger-board.json'), board('2026-10', '2026-10-10', '2026-08', 100));
  /* 가짜 실행: 순서를 적고, board.js 는 새 보드를 쓴다 */
  const calls = [];
  const exec = (script, args) => {
    calls.push([script, ...args].join(' '));
    if (script === 'board.js') { const m = args[args.indexOf('--month') + 1]; write(path.join(root, 'data/board/ledger-board.json'), board(m, P.referenceDateOf(P.ledgerDir(m, root)), P.bulkDataMonth(path.join(P.ledgerDir(m, root), 'raw/hub-bulk')), 110)); }
    return '';
  };
  const downloads = [];
  const download = async (dm, out) => {
    downloads.push(dm);
    const f = {};
    for (const k of ALL) { const buf = Buffer.from(`new ${k} ${dm}`); f[k] = fileInfo(k, dm, buf); fs.writeFileSync(path.join(out, f[k].zip), buf); }
    return { data_month: dm, files: f };
  };
  const list = (...months) => async () => months.map((m) => (typeof m === 'string' ? { month: m, provided: '?', kinds: ALL } : m));
  return { root, base, calls, exec, download, downloads, list, opts: { root, exec, download, validateDir: () => [], log: () => {} } };
}

test('목록 읽기: fetch-hub-bulk --list 출력에서 3종이 다 있는 가장 늦은 판', () => {
  const l = M.parseList('2026-09\t제공 2026-10\tbasic,act\n2026-08\t제공 2026-09\tbasic,act,site\n잡음\n2026-07\t제공 2026-08\tbasic,act,site\n');
  assert.deepEqual(l.map((e) => e.month), ['2026-09', '2026-08', '2026-07']);
  assert.equal(M.latestEdition(l).month, '2026-08', '2026-09 는 대지위치가 아직 없다');
  assert.equal(M.latestEdition([]), null);
});

test('새 자료 없음: 같은 달이고 최신 판(3종)이 이미 쓴 판이면 아무 파일도 바꾸지 않고 실행도 하지 않는다(매일 돌려도 안전)', async () => {
  const f = fixture(), before = tree(f.root);
  const r = await M.run({ ...f.opts, month: '2026-10', now: KST('2026-10-22', 9), listEditions: f.list('2026-08', { month: '2026-09', kinds: ['basic'] }) });
  assert.equal(r.status, 'no-new-data');
  assert.deepEqual([f.calls, f.downloads], [[], []]);
  assert.deepEqual(tree(f.root), before);
  const d = await M.run({ ...f.opts, now: KST('2026-10-22', 9), listEditions: f.list('2026-08') });
  assert.equal(d.month, '2026-10', '달을 주지 않으면 한국시간 이번 달');
});

test('거부: 한국시간 이번 달보다 뒤의 달, 가장 늦은 원장 폴더보다 앞의 달, 이번 달이 아닌 새 달 — 목록도 부르지 않는다', async () => {
  const f = fixture(), before = tree(f.root);
  let listed = 0;
  const listEditions = async () => { listed++; return []; };
  await assert.rejects(M.run({ ...f.opts, month: '2026-11', now: KST('2026-10-31', 23), listEditions }), /한국시간 이번 달\(2026-10\)보다 뒤/);
  await assert.rejects(M.run({ ...f.opts, month: '2026-09', now: KST('2026-10-22'), listEditions }), /가장 늦은 원장 폴더\(2026-10\)보다 앞/);
  await assert.rejects(M.run({ ...f.opts, month: '2026-11', now: KST('2026-12-21'), listEditions }), /새 달 원장은 한국시간 이번 달\(2026-12\)만/);
  await assert.rejects(M.run({ ...f.opts, month: '2026-1', now: KST('2026-10-22'), listEditions }), /YYYY-MM/);
  assert.equal(listed, 0, '거부는 목록(사이트 호출) 전에');
  assert.deepEqual(tree(f.root), before);
});

test('dry-run: 새 판이 있어도 할 일만 출력하고 아무것도 바꾸지 않는다', async () => {
  const f = fixture(), before = tree(f.root), lines = [];
  const r = await M.run({ ...f.opts, month: '2026-10', dryRun: true, now: KST('2026-10-21', 9), listEditions: f.list('2026-09', '2026-08'), log: (s) => lines.push(s) });
  assert.deepEqual([r.status, r.edition, r.previousEdition, r.branch], ['planned', '2026-09', '2026-08', 'ledger/2026-10-2026-09']);
  assert.match(lines.join('\n'), /건축HUB 대용량 2026-09 판 3종 받기/);
  assert.deepEqual([f.calls, f.downloads, tree(f.root)], [[], [], before]);
});

test('같은 달 새 판: 3종을 raw/hub-bulk 에 받고 밀려난 기본개요를 과거 판으로 옮기며, hub-bulk → snapshot → 공고 → convert → validate → trend → board 순서(--close 없음)', async () => {
  const f = fixture();
  const oldBasic = fs.readFileSync(path.join(f.base, 'raw/hub-bulk/주택인허가_기본개요_2026-08.zip'));
  let validated = null;
  const r = await M.run({ ...f.opts, month: '2026-10', now: KST('2026-10-21', 9), listEditions: f.list('2026-09', '2026-08'), validateDir: (d) => { validated = d; return []; } });
  assert.deepEqual([r.status, r.newMonth, r.edition, r.branch], ['updated', false, '2026-09', 'ledger/2026-10-2026-09']);
  assert.deepEqual(f.downloads, ['2026-09']);
  assert.deepEqual(f.calls.map((c) => c.split(' ')[0]), ['hub-bulk.js', 'snapshot.js', 'collect-national.js', 'convert.js', 'trend.js', 'board.js']);
  assert.equal(f.calls[2], 'collect-national.js --month 2026-10 --source all --to 2026-10-21');
  assert.match(f.calls[3], /--hub-bulk schemas\/ledger-2026-10\/snapshot\/hub-bulk-2026-09\.json/);
  assert.match(f.calls[3], /--out schemas\/ledger-2026-10\/tables$/);
  assert.equal(validated, path.join(f.base, 'tables'));
  const raw = fs.readdirSync(path.join(f.base, 'raw/hub-bulk')).sort();
  assert.deepEqual(raw, ['manifest.json', '주택인허가_기본개요_2026-09.zip', '주택인허가_대지위치_2026-09.zip', '주택인허가_행위개요_2026-09.zip']);
  const bm = JSON.parse(fs.readFileSync(path.join(f.base, 'raw/hub-bulk/manifest.json'), 'utf8'));
  assert.equal(P.bulkDataMonth(path.join(f.base, 'raw/hub-bulk')), '2026-09');
  assert.deepEqual(bm.files.act.columns, [{ name: 'act열' }], '열 이름은 앞 판 manifest 에서');
  assert.deepEqual(fs.readFileSync(path.join(f.base, 'raw/hub-bulk-history/basic-2026-08.zip')), oldBasic, '밀려난 기본개요 = 옛 zip 그대로');
  const hm = JSON.parse(fs.readFileSync(path.join(f.base, 'raw/hub-bulk-history/manifest.json'), 'utf8'));
  assert.deepEqual(hm.files.map((x) => [x.zip, x.data_month]), [['basic-2026-07.zip', '2026-07'], ['basic-2026-08.zip', '2026-08']]);
  assert.deepEqual([hm.files[1].zip_sha256, hm.files[1].provided_month], [sha(oldBasic), '2026-09']);
  assert.ok(!fs.existsSync(path.join(f.base, 'snapshot/hub-bulk-2026-08.json')), '옛 판 중간 스냅샷은 지운다');
  assert.ok(M.REFRESH_FILES.every((x) => !fs.existsSync(path.join(f.base, 'snapshot', x))), '새 판이 들어오면 API 덮어쓰기 결과도 지운다(새 판이 더 최신 기준)');
  const rec = JSON.parse(fs.readFileSync(path.join(f.base, 'manifest.json'), 'utf8'));
  assert.deepEqual([rec.month, rec.reference_date, rec.edition, rec.previous], ['2026-10', '2026-10-21', '2026-09', { month: '2026-10', edition: '2026-08' }]);
  assert.equal(P.referenceDateOf(f.base), '2026-10-21');
  assert.deepEqual([rec.summary.before.projects, rec.summary.after.projects, rec.summary.after.edition], [100, 110, '2026-09']);
  assert.match(r.summary, /\| 사업 \| 100 \| 110 \|/);
  assert.match(r.summary, /같은 달\(2026-10\) 갱신/);
});

test('새 달: 새 폴더에 정적 입력을 복사하고 앞 달 폴더는 그대로, 새 판이면 앞 판 기본개요를 과거 판에 복사, 앞 달 관측 행(--close)을 trend·board 전에 붙인다', async () => {
  const f = fixture(), prevBefore = tree(f.base);
  const r = await M.run({ ...f.opts, now: KST('2026-11-21', 9), listEditions: f.list('2026-10', '2026-09', '2026-08') });
  assert.deepEqual([r.status, r.month, r.newMonth, r.edition, r.previousMonth, r.branch], ['updated', '2026-11', true, '2026-10', '2026-10', 'ledger/2026-11-2026-10']);
  assert.deepEqual(tree(f.base), prevBefore, '앞 달 폴더는 바뀌지 않는다');
  const nb = path.join(f.root, 'schemas/ledger-2026-11');
  for (const rel of ['raw/legal-dong/국토교통부_법정동코드_20260929.csv', 'raw/move-in/manifest.json', 'mappings/hub-candidate-ids.json', 'mappings/lh-block-sgg.json', 'agency/templates/연계.csv', 'raw/hub-bulk-history/basic-2026-07.zip']) assert.ok(fs.existsSync(path.join(nb, rel)), rel);
  for (const rel of ['raw/myhome', 'snapshot', 'tables']) assert.ok(!fs.existsSync(path.join(nb, rel)), `${rel} 는 새로 만든다`);
  assert.deepEqual(fs.readdirSync(path.join(nb, 'raw/hub-bulk-history')).sort(), ['basic-2026-07.zip', 'basic-2026-08.zip', 'manifest.json']);
  assert.equal(P.bulkDataMonth(path.join(nb, 'raw/hub-bulk')), '2026-10');
  assert.deepEqual(f.calls.map((c) => c.split(' ').slice(0, 1).concat(c.includes('--close') ? ['--close'] : []).join(' ')), ['hub-bulk.js', 'snapshot.js', 'collect-national.js', 'convert.js', 'trend.js --close', 'trend.js', 'board.js']);
  assert.ok(f.calls.every((c) => c.includes('--month 2026-11')));
  assert.equal(P.latestMonth(f.root), '2026-11');
  assert.match(r.summary, /앞 달 2026-10 가 닫힌다/);
  assert.match(r.summary, /\| 원장 달 · 기준일 \| 2026-10 · 2026-10-10 \| 2026-11 · 2026-11-21 \|/);
});

test('새 달이지만 새 판이 없으면 앞 달 판을 그대로 복사하고 받지 않는다', async () => {
  const f = fixture();
  const r = await M.run({ ...f.opts, now: KST('2026-11-03', 9), listEditions: f.list('2026-08') });
  assert.deepEqual([r.status, r.edition, r.branch], ['updated', '2026-08', 'ledger/2026-11-2026-08']);
  assert.deepEqual(f.downloads, []);
  const nb = path.join(f.root, 'schemas/ledger-2026-11');
  assert.deepEqual(tree(path.join(nb, 'raw/hub-bulk')), tree(path.join(f.base, 'raw/hub-bulk')));
  assert.deepEqual(fs.readdirSync(path.join(nb, 'raw/hub-bulk-history')).sort(), ['basic-2026-07.zip', 'manifest.json']);
});

test('raw-store: pull 은 그 달 → 앞 달 경로에서 찾아 sha256 을 맞추고, push 는 git 무시 파일 중 앞 달 폴더와 다른 것만 올린다(DB 호출 없음)', async () => {
  const f = fixture();
  const store = new Map(), api = { download: async (k) => store.get(k) ?? null, upload: async (k, d) => { store.set(k, d); } };
  /* 2026-10 의 과거 판은 Storage 2026-10/ 에만 있다 → 새 달 2026-11 폴더에서 지운 뒤 받는다 */
  await M.run({ ...f.opts, now: KST('2026-11-21', 9), listEditions: f.list('2026-10') });
  store.set('2026-10/hub-bulk-history/basic-2026-07.zip.gz', zlib.gzipSync(fs.readFileSync(path.join(f.base, 'raw/hub-bulk-history/basic-2026-07.zip'))));
  const nb = path.join(f.root, 'schemas/ledger-2026-11');
  const ignored = ['raw/hub-bulk-history/basic-2026-07.zip', 'raw/hub-bulk-history/basic-2026-08.zip'];
  const keys = await RS.push({ root: f.root, month: '2026-11', api, ignored, log: () => {} });
  assert.deepEqual(keys, ['2026-11/hub-bulk-history/basic-2026-08.zip.gz'], '앞 달에도 있는 2026-07 판은 올리지 않는다');
  for (const rel of ignored) fs.rmSync(path.join(nb, rel));
  assert.equal(await RS.pull({ root: f.root, month: '2026-11', api, log: () => {} }), 2);
  assert.deepEqual(fs.readFileSync(path.join(nb, ignored[0])), fs.readFileSync(path.join(f.base, ignored[0])), '2026-07 판은 앞 달 경로에서');
  assert.equal(await RS.pull({ root: f.root, month: '2026-11', api, log: () => {} }), 0, '이미 있으면 받지 않는다');
  fs.rmSync(path.join(nb, ignored[1]));
  store.set('2026-11/hub-bulk-history/basic-2026-08.zip.gz', zlib.gzipSync(Buffer.from('다른 내용')));
  await assert.rejects(RS.pull({ root: f.root, month: '2026-11', api, log: () => {} }), /sha256 이 manifest 와 다르다/);
  write(path.join(nb, 'raw/hub-refresh/1129013800.json'), '{"pages":[]}');
  const only = await RS.push({ root: f.root, month: '2026-11', api, ignored: [...ignored.slice(0, 1), 'raw/hub-refresh/1129013800.json'], only: 'raw/hub-refresh', log: () => {} });
  assert.deepEqual(only, ['2026-11/hub-refresh/1129013800.json.gz'], '--only 는 그 폴더 아래만(과거 판 zip 은 다시 올리지 않는다)');
});

test('raw-store: HOME 덤프 판(raw/home/<덤프시각>)은 <달>/home/<덤프시각>/<파일>.gz 로 올라가고, pull 이 없는·다른 파일만 sha256 을 맞춰 받는다', async () => {
  const f = fixture();
  const store = new Map(), api = { download: async (k) => store.get(k) ?? null, upload: async (k, d) => { store.set(k, d); } };
  const hd = path.join(f.base, 'raw/home/20261019T212247Z'), body = zlib.gzipSync(Buffer.from('{"a":1}\n'));
  fs.mkdirSync(hd, { recursive: true });
  write(path.join(hd, 'manifest.json'), { snapshot_at: '2026-10-13T14:02:41Z', files: { 'gh_notice.jsonl.gz': { sha256: crypto.createHash('sha256').update(body).digest('hex'), rows: 1 } } });
  fs.writeFileSync(path.join(hd, 'gh_notice.jsonl.gz'), body);
  const keys = await RS.push({ root: f.root, month: '2026-10', api, ignored: ['raw/home/20261019T212247Z/gh_notice.jsonl.gz'], log: () => {} });
  assert.deepEqual(keys, ['2026-10/home/20261019T212247Z/gh_notice.jsonl.gz.gz']);
  assert.equal(await RS.pullHome({ root: f.root, month: '2026-10', api, log: () => {} }), 0, '이미 있으면 받지 않는다');
  fs.rmSync(path.join(hd, 'gh_notice.jsonl.gz'));
  assert.equal(await RS.pullHome({ root: f.root, month: '2026-10', api, log: () => {} }), 1);
  assert.deepEqual(fs.readFileSync(path.join(hd, 'gh_notice.jsonl.gz')), body);
  fs.rmSync(path.join(hd, 'gh_notice.jsonl.gz'));
  store.set(keys[0], zlib.gzipSync(Buffer.from('다른 내용')));
  await assert.rejects(RS.pullHome({ root: f.root, month: '2026-10', api, log: () => {} }), /sha256 이 manifest 와 다르다/);
  store.clear();
  await assert.rejects(RS.pullHome({ root: f.root, month: '2026-10', api, log: () => {} }), /Storage\(.*\)에서 찾지 못했다/);
});

/* ---------- 열린 달 주 1회 갱신(--refresh) ---------- */
const REF_BOARD = (projects, judged = projects - 1) => ({ observedMonth: '2026-10', referenceDate: '2026-10-12', scope: { projects, judged }, judgment: { ok: { projects: judged - 2, units: 9000 }, caution: { projects: 1, units: 500 }, delay: { projects: 1, units: 300 } }, trend: [{ month: '2026-10', edition: '2026-08' }] });
const mapOf = (grades) => ({ bySgg: { 11290: grades.map((cls, i) => ({ id: `PRJ-11290-${String(i + 1).padStart(4, '0')}`, cls })) } });
/* 가짜 실행: board.js 가 보드·지도를 (주면) 바꿔 쓴다 */
function refreshFixture({ board, grades } = {}) {
  const f = fixture();
  write(path.join(f.root, 'data/board/ledger-map.json'), mapOf(Array(100).fill('ok')));
  const calls = [];
  const exec = (script, args) => {
    calls.push([script, ...args].join(' '));
    if (script === 'board.js' && board) write(path.join(f.root, 'data/board/ledger-board.json'), board);
    if (script === 'board.js' && grades) write(path.join(f.root, 'data/board/ledger-map.json'), mapOf(grades));
    return '';
  };
  return { ...f, calls, opts: { ...f.opts, exec } };
}
const regrade = (n) => Array.from({ length: 100 }, (_, i) => (i < n ? 'delay' : 'ok'));

test('--refresh unchanged: 판 목록·내려받기 없이 기준일 = 오늘 → hub-bulk → hub-api-refresh → snapshot → 공고 → convert(hub-refresh.json) → validate → trend(--close 없음) → board, 표·보드 바이트가 같으면 unchanged', async () => {
  const f = refreshFixture();
  const r = await M.refresh({ ...f.opts, now: KST('2026-10-12', 6) });
  assert.deepEqual([r.status, r.month, r.edition, r.branch, r.changedGrades], ['unchanged', '2026-10', '2026-08', 'ledger/2026-10-refresh-2026-10-12', 0]);
  assert.deepEqual(f.calls.map((c) => c.split(' ')[0]), ['hub-bulk.js', 'hub-api-refresh.js', 'snapshot.js', 'collect-national.js', 'convert.js', 'trend.js', 'board.js']);
  assert.ok(!f.calls.some((c) => c.includes('--close') || c.includes('--offline')));
  assert.match(f.calls[4], /--hub-bulk schemas\/ledger-2026-10\/snapshot\/hub-refresh\.json/);
  const rec = JSON.parse(fs.readFileSync(path.join(f.base, 'manifest.json'), 'utf8'));
  assert.deepEqual([rec.reference_date, rec.edition, rec.summary.status], ['2026-10-12', '2026-08', 'unchanged']);
  assert.ok(fs.existsSync(path.join(f.base, 'raw/hub-bulk/manifest.json')), '대용량 판은 그대로');
});

test('HOME 판이 있으면 보드 다음에 policy-progress → projects-index(같은 --month), 다른 단계 순서는 그대로', async () => {
  const f = refreshFixture();
  write(path.join(f.base, 'raw/home/20261019T212247Z/manifest.json'), { files: {} });
  await M.refresh({ ...f.opts, now: KST('2026-10-12', 6) });
  assert.deepEqual(f.calls.map((c) => c.split(' ')[0]), ['hub-bulk.js', 'hub-api-refresh.js', 'snapshot.js', 'collect-national.js', 'convert.js', 'trend.js', 'board.js', 'policy-progress.js', 'projects-index.js']);
  assert.deepEqual(f.calls.slice(-2), ['policy-progress.js --month 2026-10', 'projects-index.js --month 2026-10']);
});

test('--refresh auto·review:등급 바뀐 사업 > max(50, 판정 사업 2%) 또는 사업 수 ±2% 초과면 review, 아니면 auto. 요약에 판정 전후 사업·호수', async () => {
  const auto = refreshFixture({ board: REF_BOARD(101), grades: regrade(3) });
  const a = await M.refresh({ ...auto.opts, now: KST('2026-10-12', 6) });
  assert.deepEqual([a.status, a.changedGrades], ['auto', 3]);
  assert.match(a.summary, /\| 사업 \| 100 \| 101 \|/);
  assert.match(a.summary, /\| 정상 사업 · 호수 \| 97 · – \| 98 · 9,000호 \|/);
  assert.match(a.summary, /판정 등급이 바뀐 사업 3 · 결과 auto/);
  const many = refreshFixture({ board: REF_BOARD(100), grades: regrade(51) });
  assert.deepEqual([(await M.refresh({ ...many.opts, now: KST('2026-10-12', 6) })).status], ['review'], '51 > max(50, 99 × 2%)');
  const fifty = refreshFixture({ board: REF_BOARD(100), grades: regrade(50) });
  assert.equal((await M.refresh({ ...fifty.opts, now: KST('2026-10-12', 6) })).status, 'auto', '50 은 넘지 않는다');
  const grow = refreshFixture({ board: REF_BOARD(103) });
  assert.equal((await M.refresh({ ...grow.opts, now: KST('2026-10-12', 6) })).status, 'review', '사업 수 +3%');
  assert.equal(M.refreshStatus({ same: false, before: { projects: 10000, judged: 5000 }, after: { projects: 10000 }, changed: 101 }), 'review', '판정 사업 5,000 의 2% = 100');
  assert.equal(M.refreshStatus({ same: false, before: null, after: { projects: 1 }, changed: null }), 'review', '앞 보드가 없으면 사람이 본다');
});

test('--refresh 거부·건너뜀: 가장 늦은 원장 폴더가 아니면 오류, 그 폴더가 한국시간 이번 달이 아니면(새 달 폴더 전) 아무것도 하지 않고 skipped', async () => {
  const f = refreshFixture(), before = tree(f.root);
  await assert.rejects(M.refresh({ ...f.opts, month: '2026-09', now: KST('2026-10-12', 6) }), /가장 늦은 원장 폴더\(2026-10\)만/);
  const r = await M.refresh({ ...f.opts, now: KST('2026-11-05', 6) });
  assert.deepEqual([r.status, f.calls], ['skipped', []]);
  assert.deepEqual(tree(f.root), before);
  assert.deepEqual(M.parseArgs(['--refresh', '--month', '2026-10']), { refresh: true, month: '2026-10' });
});

/* ---------- 고정 경로를 인자로 바꾼 뒤 지금 결과가 같은지 ---------- */
const H = require('../../tools/ledger/hub-bulk');
const { boardFromLedger, mapIndexFromLedger, renderMap, render, loadTables, loadHistory, loadLhBlocks } = require('../../tools/ledger/board');
const ROOT = path.join(__dirname, '..', '..');
const L = require('../../data/board/ledger-board.json');

test('기본 경로 = 가장 늦은 원장 폴더(달이 아닌 schemas/ledger 는 무시), 데이터 월은 raw/hub-bulk manifest, 기준일은 달 기록(없으면 2026-10-10)', () => {
  const latest = P.latestMonth();
  assert.ok(P.ledgerMonths().every((m) => /^\d{4}-\d{2}$/.test(m)));
  assert.equal(H.RAW, path.join(P.ledgerDir(latest), 'raw/hub-bulk'));
  assert.equal(H.DATA_MONTH, P.bulkDataMonth(H.RAW));
  assert.equal(H.OUT, path.join(P.ledgerDir(latest), `snapshot/hub-bulk-${H.DATA_MONTH}.json`));
  assert.equal(L.observedMonth, latest, '보드의 관측 달 = 가장 늦은 원장 폴더');
  assert.equal(L.referenceDate, P.referenceDateOf(P.ledgerDir(latest)));
  assert.equal(L.source, `schemas/ledger-${latest}/tables`);
  assert.equal(P.lastDay('2026-02'), '2026-02-28');
  assert.equal(P.lastDay('2026-09'), '2026-09-30', '9월 판의 자료 기준일(예전 `${달}-31` 은 2026-09-31 이 됐다)');
});

test('board.js --month 경로(그 달 표 · 달 기록 기준일)로 다시 만든 보드·지도 색인 = 저장된 파일', () => {
  const dir = P.ledgerDir(L.observedMonth), tables = loadTables(path.join(dir, 'tables'));
  const ref = P.referenceDateOf(dir);
  assert.equal(fs.readFileSync(path.join(ROOT, 'data/board/ledger-board.json'), 'utf8'), `${render(boardFromLedger(tables, { referenceDate: ref, observedMonth: L.observedMonth, history: loadHistory() }))}\n`);
  assert.equal(fs.readFileSync(path.join(ROOT, 'data/board/ledger-map.json'), 'utf8'), renderMap(mapIndexFromLedger(tables, { referenceDate: ref, observedMonth: L.observedMonth, lhBlocks: loadLhBlocks() })));
});

const rawZips = fs.existsSync(path.join(H.RAW, 'manifest.json')) ? Object.values(JSON.parse(fs.readFileSync(path.join(H.RAW, 'manifest.json'), 'utf8')).files).map((f) => path.join(H.RAW, f.zip)) : [];
test('hub-bulk.js --month 경로(그 달 원본 · 데이터 월 · 달 기록 기준일)로 다시 만든 중간 스냅샷·manifest = 저장된 파일', { skip: !(rawZips.length && rawZips.every((f) => fs.existsSync(f))) && '원본 zip 이 없다' }, async () => {
  const base = path.dirname(path.dirname(H.RAW));
  const { records, manifest } = await H.build(H.RAW, { dataMonth: H.DATA_MONTH, referenceDate: P.referenceDateOf(base) });
  assert.equal(H.renderRecords(records, H.DATA_MONTH), fs.readFileSync(H.OUT, 'utf8'));
  assert.equal(`${JSON.stringify(manifest, null, 1)}\n`, fs.readFileSync(H.OUT_MANIFEST, 'utf8'));
});

test('convert 인자: 그 달 폴더에 단계별 원천 중간 스냅샷(snapshot/stage-*.json)이 있으면 가장 늦은 것을 --stage 로 넘기고, 없으면 넘기지 않는다(스냅샷은 수동 단계) · HOME 판(raw/home/<덤프시각>)이 있으면 --home·--home-ids', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-stage-')), dir = path.join(root, 'schemas/ledger-2026-11');
  write(path.join(dir, 'raw/legal-dong/국토교통부_법정동코드_20260929.csv'), 'x');
  write(path.join(dir, 'snapshot/hub-events.json'), { rows: [] });
  const args = () => M.convertArgs(root, dir, '2026-11', 'hub-bulk-2026-09.json');
  assert.ok(!args().includes('--stage'));
  write(path.join(dir, 'snapshot/stage-2026-08.json'), '{}');
  write(path.join(dir, 'snapshot/stage-2026-09.json'), '{}');
  write(path.join(dir, 'snapshot/stage-2026-09.manifest.json'), '{}');
  const a = args();
  assert.equal(a[a.indexOf('--stage') + 1], 'schemas/ledger-2026-11/snapshot/stage-2026-09.json');
  assert.equal(a[a.length - 2], '--out', '--out 은 끝');
  assert.ok(!a.includes('--home'), 'HOME 판이 없으면 넘기지 않는다');
  write(path.join(dir, 'raw/home/20261001T000000Z/manifest.json'), { files: {} });
  write(path.join(dir, 'raw/home/20261019T212247Z/manifest.json'), { files: {} });
  const h = args();
  assert.deepEqual([h[h.indexOf('--home') + 1], h[h.indexOf('--home-ids') + 1]], ['schemas/ledger-2026-11/raw/home/20261019T212247Z', 'schemas/ledger-2026-11/mappings/home-ids.json'], 'HOME 판(가장 늦은 덤프 시각)과 id 매핑');
  assert.equal(h[h.length - 2], '--out');
  assert.ok(M.STATIC.includes('raw/home'), '새 달에 HOME 판을 가져간다');
  fs.rmSync(root, { recursive: true, force: true });
});
