'use strict';
/* git 이 무시하는 원본(건축HUB 과거 판 schemas/ledger-<달>/raw/hub-bulk-history/*.zip, 열린 달 주 1회 갱신의 API 원본 raw/hub-refresh/*.json — .gitignore)을 Storage ledger-raw 와 주고받는다.
   GitHub Actions 에는 이 zip 이 체크아웃되지 않으므로 월 수집(.github/workflows/ledger-collect.yml)이 먼저 받고(pull), 새로 생긴 것을 올린다(push).
   DB 에는 쓰지 않는다(begin_run·record_files 없음). 키 모양은 supabase-load.js 와 같다: <달>/hub-bulk-history/<파일>.gz(gzip).
   - pull: 그 달 폴더 raw/hub-bulk-history/manifest.json 의 zip 중 없는 것을 그 달 → 앞 달 … 순서의 경로에서 찾아 받고 sha256(manifest)을 맞춘다.
   - push: 그 달 폴더에서 git 이 무시하는 파일 중 바로 앞 원장 달 폴더의 같은 경로 파일과 바이트가 다른(또는 없는) 것만 올린다
     (앞 달에 있던 과거 판은 앞 달 경로에 이미 있다 — 달마다 같은 zip 을 다시 올려 무료 1 GB 를 채우지 않게).
     --only <달 폴더 기준 경로>를 주면 그 아래 파일만 올린다(주 1회 갱신 .github/workflows/ledger-refresh.yml 은 raw/hub-refresh 만 — 받아 둔 과거 판 zip 을 갱신 때마다 다시 올리지 않게).
     raw/hub-refresh 는 같은 키(<달>/hub-refresh/<법정동>.json.gz)에 덮어쓰므로 Storage 에는 마지막으로 받은 날의 원본이 남는다. pull 은 하지 않는다(갱신 때마다 새로 받는다).
   실행: node tools/ledger/raw-store.js pull|push [--month YYYY-MM](기본 가장 늦은 원장 폴더) [--only <경로>]
   HOME 덤프 판 raw/home/<덤프시각>/*.jsonl.gz 도 같은 방식: push 는 <달>/home/<덤프시각>/<파일>.gz 로 올리고 pull 은 가장 늦은 판의 없는 파일을 받는다(pullHome).
   환경변수: NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SECRET_KEY(.env.local 또는 환경). 시험: tests/js/monthly.test.cjs */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const P = require('./paths');
const { readEnv, client, rawFiles } = require('./supabase-load');

const HISTORY = 'raw/hub-bulk-history';
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

async function pull({ root = P.ROOT, month = P.latestMonth(root), api, log = console.log }) {
  const dir = path.join(P.ledgerDir(month, root), HISTORY);
  const files = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).files ?? [];
  const months = P.ledgerMonths(root).filter((m) => m <= month).reverse();
  let got = 0;
  for (const f of files) {
    const target = path.join(dir, f.zip);
    if (fs.existsSync(target) && sha256(fs.readFileSync(target)) === f.zip_sha256) continue;
    let buf = null;
    for (const m of months) {
      const gz = await api.download(`${m}/hub-bulk-history/${f.zip}.gz`);
      if (!gz) continue;
      buf = zlib.gunzipSync(gz);
      if (sha256(buf) !== f.zip_sha256) throw new Error(`${m}/hub-bulk-history/${f.zip}: sha256 이 manifest 와 다르다`);
      break;
    }
    if (!buf) throw new Error(`${f.zip} 를 Storage(${months.join('·')})에서 찾지 못했다`);
    fs.writeFileSync(target, buf);
    got++;
  }
  log(`pull ${month}: 과거 판 ${files.length}개 중 ${got}개 받음`);
  await pullHome({ root, month, api, log });
  return got;
}

/* HOME 덤프 판(raw/home/<덤프시각>/*.jsonl.gz, git 무시 — 같은 폴더의 manifest.json 만 저장소에 있다) 중 가장 늦은 판의 없는/다른 파일을 Storage <달>/home/<덤프시각>/<파일>.gz 에서 받는다
   (convert --home 재현용. push 는 git 무시 파일을 다 올리므로 이 폴더도 이미 같은 키로 올라간다). 그 달 → 앞 달 순서로 찾고 sha256(manifest.files)을 맞춘다 */
async function pullHome({ root = P.ROOT, month = P.latestMonth(root), api, log = console.log }) {
  const dir = require('./home-source').latestHomeDir(P.ledgerDir(month, root));
  if (!dir) return 0;
  const edition = path.basename(dir), files = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).files ?? {};
  const months = P.ledgerMonths(root).filter((m) => m <= month).reverse();
  let got = 0;
  for (const [name, f] of Object.entries(files)) {
    const target = path.join(dir, name);
    if (fs.existsSync(target) && (!f.sha256 || sha256(fs.readFileSync(target)) === f.sha256)) continue;
    let buf = null;
    for (const m of months) {
      const gz = await api.download(`${m}/home/${edition}/${name}.gz`);
      if (!gz) continue;
      buf = zlib.gunzipSync(gz);
      if (f.sha256 && sha256(buf) !== f.sha256) throw new Error(`${m}/home/${edition}/${name}: sha256 이 manifest 와 다르다`);
      break;
    }
    if (!buf) throw new Error(`HOME ${edition}/${name} 를 Storage(${months.join('·')})에서 찾지 못했다`);
    fs.writeFileSync(target, buf);
    got++;
  }
  log(`pull ${month}: HOME 판 ${edition} 의 ${Object.keys(files).length}개 중 ${got}개 받음`);
  return got;
}

/* 그 달 폴더에서 git 이 무시하는 파일(달 폴더 기준 경로) */
const ignoredFiles = (root, month) => execFileSync('git', ['ls-files', '-o', '-i', '--exclude-standard', '-z', '--', `schemas/ledger-${month}`], { cwd: root, encoding: 'utf8' })
  .split('\0').filter(Boolean).map((f) => path.posix.relative(`schemas/ledger-${month}`, f));

async function push({ root = P.ROOT, month = P.latestMonth(root), api, ignored = ignoredFiles(root, month), only = null, log = console.log }) {
  const dir = P.ledgerDir(month, root);
  if (only) ignored = ignored.filter((rel) => rel.startsWith(`${only.replace(/\/+$/, '')}/`));
  const prev = P.ledgerMonths(root).filter((m) => m < month).pop();
  const same = (rel) => { if (!prev) return false; const a = path.join(P.ledgerDir(prev, root), rel); return fs.existsSync(a) && sha256(fs.readFileSync(a)) === sha256(fs.readFileSync(path.join(dir, rel))); };
  const want = new Set(ignored.filter((rel) => !same(rel)));
  const up = rawFiles(dir, month).filter((f) => want.has(f.source));
  let bytes = 0;
  for (const f of up) {
    const gz = zlib.gzipSync(fs.readFileSync(path.join(dir, f.source)));
    await api.upload(f.key, gz, 'application/gzip');
    bytes += gz.length;
  }
  log(`push ${month}: git 무시 파일 ${ignored.length}개 중 ${up.length}개 올림(${bytes.toLocaleString('en-US')} B)${prev ? `, 앞 달 ${prev} 와 같은 ${ignored.length - want.size}개는 건너뜀` : ''}`);
  return up.map((f) => f.key);
}

module.exports = { pull, pullHome, push, ignoredFiles };

if (require.main === module) {
  const [cmd] = process.argv.slice(2), i = process.argv.indexOf('--month'), o = process.argv.indexOf('--only');
  const month = i > 0 ? process.argv[i + 1] : undefined, only = o > 0 ? process.argv[o + 1] : null;
  const env = readEnv();
  (async () => {
    if (!['pull', 'push'].includes(cmd)) throw new Error('사용: node tools/ledger/raw-store.js pull|push [--month YYYY-MM] [--only <경로>]');
    const api = client({ url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.SUPABASE_SECRET_KEY });
    await (cmd === 'pull' ? pull : push)({ month, api, only });
  })().catch((e) => { console.error(`오류: ${e.message}`); process.exit(1); });
}
