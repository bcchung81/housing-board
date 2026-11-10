#!/usr/bin/env node
'use strict';
/* HOME 슬라이스 패키지 반영 명령(2026-11-09 docs/product/HOME-JSON-반영-계획.md 3절 P3).
   쓰임: node tools/ledger/home-apply.js --in <HOME 슬라이스 패키지> [--dry-run] [--base <기준 판 폴더|판 이름>] [--workdir <폴더>] [--report <파일.json>]
   흐름(모두 scratch 사본에서 — cp -c 로 저장소를 통째로 복제):
     사전 점검(실제 모드만: main·origin 과 같음·색인 비어 있음·.env.local 키 이름·이번 반영 경로에 미커밋 변경 없음)
     → 사본 → 직전 판 기준선(convert OUT=임시, 같은 코드로 직전 판의 home 보고)
     → 달(until 의 한국 달 > 열린 달이고 한국시간 이번 달이면 monthly.js --month, 아니면 멈춤)
     → 합치기(home-slice.py apply: 기준 판 = 가장 늦은 판 또는 --base, 새 판 = until, api → raw/home-api/<until 한국 날짜>) · 기준일 = until 한국 날짜
     → 변환·생성기(convert → issue-projects --home → convert → 생성기 14개) → 멈춤 조건 → 정답 계산(패키지 golden·web → home-parity/run.js)
     → 시험(정답 대조 6종 건너뛰기 0 · npm test · unittest · tsc · npm run build) → 보고
     → (--dry-run 이 아니고 멈춤이 없을 때만) 결과 옮기기 → pg_dump 백업 → raw-store push → supabase-load → verify → 커밋 → Vercel 운영 배포 → push → 운영 board-source 확인
   종료 코드: 0 통과(실제 모드면 반영까지 끝), 2 멈춤(보고 파일에 까닭), 1 도구 오류.
   외부 명령은 모두 runner(cmd, args, opts) 로 부른다 — 시험(tests/js/home-apply.test.cjs)이 가짜 runner 로 순서·멈춤을 본다. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const PROD_URL = 'https://the-housing.vercel.app';
const PG_BIN = '/opt/homebrew/opt/libpq/bin';
const BACKUP_DIR = path.join(os.homedir(), 'housing-board-backups');
const CO_AUTHOR = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>';
/* 적재·백업·Storage·검증이 읽는 .env.local 키(값은 읽기만, 출력하지 않는다). 새 달이면 DATA_GO_KR_KEY 도 */
const ENV_KEYS = ['SUPABASE_DB_URL', 'SUPABASE_SECRET_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
const GOLDEN_TESTS = ['policy', 'projects', 'region', 'citizen', 'sources', 'map'].map((n) => `tests/js/${n}-golden.test.cjs`);
/* 변환 뒤 생성기(핸드오프 9절 순서, issue-projects 뒤 두 번째 convert 다음).
   trend.js(--close 없이)는 board.js 앞: 판정 이력 소급 행은 원장 표(HOME 판)로 계산하므로 새 달(monthly.js 가 옛 판으로 돌린 뒤)이든 같은 달이든 합친 판으로 다시 돌린다 — 보드 trend 칸이 이력을 읽는다.
   home-lite.js --offline 은 home-map.js 뒤: 경량 지도 번들의 사업 줄·index.json 을 새 home-map 에 맞춘다(네트워크 없음, 건물·지구·블록은 그대로) */
const GENERATORS = (m) => [
  ['trend.js', '--month', m], ['board.js', '--month', m], ['home-projects.js', '--month', m], ['home-map.js', '--month', m], ['home-lite.js', '--month', m, '--offline'],
  ['policy-progress.js', '--month', m], ['home-lh-plan.js', '--month', m],
  ['home-board.js'], ['map-overview.js'], ['projects-index.js', '--month', m], ['region-supply.js', '--month', m], ['requirements.js', '--month', m],
  ['area-facts.js', '--month', m], ['home-sources.js', '--month', m]];
/* 생성기 목록 끝: 운영 /citizen 정적 화면(assets/citizen/index.html)과 시안(docs/design/대국민-모드-시안.html) 재생성 — cwd = 사본의 tools/design/public-mock.
   public/ 사본은 git 이 무시하고(.gitignore) Vercel 빌드의 prebuild(node scripts/build.js)가 만들므로 여기서 하지 않는다 */
const CITIZEN_DIR = 'tools/design/public-mock';
const CITIZEN_BUILD = [['python3', ['build_data.py', 'data.json']], ['node', ['build.js']]];
/* 이번 반영이 쓰는 경로(사전 점검·옮기기·커밋 범위). 새 달이면 달 폴더 전체 */
const applyPaths = (month, newMonth) => [...(newMonth ? [`schemas/ledger-${month}`] : ['tables', 'mappings', 'raw/home', 'raw/home-api', 'manifest.json'].map((p) => `schemas/ledger-${month}/${p}`)), 'registry', 'data/board', 'assets/citizen/index.html', 'docs/design/대국민-모드-시안.html'];
/* 변경 감지에서 뺄 최상위 폴더(사본에서 만들어지는 빌드·캐시·정답 출력) */
const WALK_SKIP = new Set(['.git', 'node_modules', '.next', '.cache', '.venv', 'videos', '.visual']);

/* 핸드오프 3절 ③ 변환 node 한 줄 — 달은 argv 로 넘긴다(셸을 거치지 않아 zsh 인자 쪼개짐 함정이 없다) */
const CONVERT_JS = `
const m=require('./tools/ledger/monthly'),path=require('path'),fs=require('fs'),cp=require('child_process');
const root=process.cwd(),month=process.argv[1],dir=path.join(root,'schemas/ledger-'+month);
const bulk=fs.existsSync(path.join(dir,'snapshot/hub-refresh.json'))?'hub-refresh.json':fs.readdirSync(path.join(dir,'snapshot')).filter(f=>/^hub-bulk-\\d{4}-\\d{2}\\.json$/.test(f)).sort().pop();
let a=m.convertArgs(root,dir,month,bulk); if(process.env.OUT){a[a.indexOf('--out')+1]=process.env.OUT;}
cp.execFileSync('node',['tools/ledger/convert.js',...a],{stdio:'inherit'});`;

/* ---------- 비밀값 가리기 ---------- */
const mask = (s) => String(s ?? '')
  .replace(/postgres(ql)?:\/\/[^\s'"]+/g, '***')
  .replace(/sb_secret_[A-Za-z0-9_-]+/g, '***')
  .replace(/((?:serviceKey|service_key|token|apikey|api_key)=)[^&\s'"]+/gi, '$1***');

/* ---------- runner ---------- */
function defaultRunner(logFile) {
  return (cmd, args = [], opts = {}) => {
    const t = Date.now();
    const r = spawnSync(cmd, args, { cwd: opts.cwd, env: opts.env || process.env, input: opts.input, encoding: 'utf8', maxBuffer: 1 << 30 });
    const out = { code: r.status ?? (r.error ? 127 : 1), stdout: r.stdout || '', stderr: r.stderr || (r.error ? String(r.error.message) : '') };
    if (logFile) fs.appendFileSync(logFile, `\n$ ${mask([cmd, ...args].join(' '))}  (cwd ${opts.cwd || '.'}, ${Date.now() - t}ms, 종료 ${out.code})\n${mask(out.stdout)}${mask(out.stderr)}`);
    return out;
  };
}

/* ---------- 시각·달 ---------- */
/* manifest until('2026-10-22 13:35:44.7232+00' — PostgreSQL UTC ::text) → Date */
function parsePgTime(t) {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?([+-]\d{2})(:?\d{2})?$/.exec(String(t).trim());
  if (!m) throw new Error(`시각 꼴이 아니다: ${t}`);
  const ms = m[3] ? m[3].slice(0, 4).padEnd(4, '0') : '';
  return new Date(`${m[1]}T${m[2]}${ms}${m[4]}:${(m[5] || '00').replace(':', '')}`);
}
const kstDate = (d) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const kstMonth = (d) => kstDate(d).slice(0, 7);
/* home-slice.py apply 의 판 이름(until UTC 초 단위) */
const editionOf = (d) => d.toISOString().slice(0, 19).replace(/[-:]/g, '') + 'Z';

/* 반영할 원장 달: until 한국 달 = 열린 달 → 그 달, 더 늦고 한국시간 이번 달 → 새 달(monthly.js), 그 밖 → 멈춤 */
function decideMonth({ until, observedMonth, now }) {
  const u = kstMonth(until), cur = kstMonth(now);
  if (u === observedMonth) return { month: u, newMonth: false };
  if (u < observedMonth) return { stop: `until 의 한국 달 ${u} 이 열린 달 ${observedMonth} 보다 앞이다(닫힌 달 자료)` };
  if (u === cur) return { month: u, newMonth: true };
  return { stop: `until 의 한국 달 ${u} 이 열린 달 ${observedMonth} 보다 늦지만 한국시간 이번 달(${cur})이 아니다 — 새 달은 이번 달만 연다` };
}

/* ---------- convert 보고 ---------- */
/* convert 표준출력에서 home 보고가 든 줄('<이름> {json}')을 찾는다 */
function parseConvertReport(text) {
  for (const line of String(text).split('\n')) {
    const i = line.indexOf('{');
    if (i < 0 || !line.includes('"home"')) continue;
    try { const j = JSON.parse(line.slice(i)); if (j.home) return { home: j.home, scope: j.scope ?? null, validated: /검증 통과/.test(text) }; } catch { /* 다음 줄 */ }
  }
  return null;
}

/* 시군구 미정 묶음 허용 증가: 2. 근거 — 판별 실측 10-13 판 2, 10-20·10-22 판 0. 미정 묶음은 원장에서 빠지므로(사업 누락)
   새 판에서 3묶음 넘게 늘면 위치 규칙에 안 걸리는 새 HOME 행이 생긴 것이라 사람이 본다 */
const SGG_UNRESOLVED_ALLOW = 2;
const GROUPS_RATIO = 0.2;
/* 멈춤 조건(핸드오프 3절 ③ + 계획 3절 4) → 까닭 목록 */
function stopReasons({ baseline, first, second }) {
  const out = [];
  if (!first) out.push('첫 convert 의 home 보고를 못 읽었다');
  if (!second) out.push('두 번째 convert 의 home 보고를 못 읽었다');
  if (!baseline) out.push('직전 판 기준선(convert home 보고)이 없다');
  for (const [n, r] of [['첫 convert', first], ['두 번째 convert', second]]) {
    if (!r) continue;
    if (!r.validated) out.push(`${n}: '검증 통과' 가 없다`);
    if ((r.home.ids?.conflicts ?? 0) > 0) out.push(`${n}: ids.conflicts ${r.home.ids.conflicts} > 0`);
  }
  if (second) {
    const h = second.home;
    if ((h.publicTier?.F ?? 0) > 0) out.push(`publicTier F(판단 불가) ${h.publicTier.F} > 0`);
    if (baseline) {
      const b = baseline.home;
      if ((h.sggUnresolved ?? 0) - (b.sggUnresolved ?? 0) > SGG_UNRESOLVED_ALLOW) out.push(`sggUnresolved ${b.sggUnresolved} → ${h.sggUnresolved}(허용 증가 ${SGG_UNRESOLVED_ALLOW})`);
      if (b.groups > 0 && Math.abs(h.groups - b.groups) / b.groups > GROUPS_RATIO) out.push(`묶음 수 ${b.groups} → ${h.groups}(±${GROUPS_RATIO * 100}% 초과)`);
    }
  }
  return out;
}

/* node --test 출력의 ℹ 줄 → { tests, pass, fail, skipped } */
function parseTestCounts(text) {
  const n = (k) => { const m = new RegExp(`^ℹ ${k} (\\d+)`, 'm').exec(text); return m ? Number(m[1]) : null; };
  return { tests: n('tests'), pass: n('pass'), fail: n('fail'), skipped: n('skipped'), cancelled: n('cancelled') };
}

/* ---------- .env.local ---------- */
const envKeysOf = (text) => new Set(String(text || '').split('\n').map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l)).filter((m) => m && m[2].trim() !== '').map((m) => m[1]));
function envValue(text, key) {
  for (const l of String(text || '').split('\n')) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(l); if (m && m[1] === key) return m[2].trim().replace(/^(['"])(.*)\1$/, '$2'); }
  return null;
}
/* 자식 시험·빌드 환경: Supabase·Vercel·키 값을 빼서 JSON 대체로(네트워크 없음) */
const offlineEnv = (extra = {}) => ({ ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/SUPABASE|VERCEL|REVALIDATE|DATA_GO_KR|HUG_SERVICE|VWORLD/.test(k))), ...extra });

/* ---------- 사전 점검(실제 모드) ---------- */
function preflight({ root, runner, envText, month, newMonth }) {
  const problems = [];
  const git = (...a) => runner('git', a, { cwd: root });
  const br = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (br.stdout.trim() !== 'main') problems.push(`main 브랜치가 아니다(${br.stdout.trim() || br.stderr.trim()})`);
  const f = git('fetch', '-q', 'origin');
  if (f.code !== 0) problems.push(`git fetch 실패: ${f.stderr.trim().slice(0, 200)}`);
  const head = git('rev-parse', 'HEAD').stdout.trim(), up = git('rev-parse', 'origin/main').stdout.trim();
  if (!head || head !== up) problems.push(`HEAD(${head.slice(0, 7)}) 가 origin/main(${up.slice(0, 7)}) 과 다르다`);
  if (git('diff', '--cached', '--quiet').code !== 0) problems.push('git 색인에 올려 둔 변경이 있다(커밋이 섞인다)');
  const dirty = git('status', '--porcelain', '--', ...applyPaths(month, newMonth)).stdout.trim();
  if (dirty) problems.push(`이번 반영 경로에 미커밋 변경 ${dirty.split('\n').length}개: ${dirty.split('\n').slice(0, 5).join(', ')}`);
  if (envText == null) problems.push('.env.local 이 없다');
  else {
    const keys = envKeysOf(envText);
    const missing = [...ENV_KEYS, ...(newMonth ? ['DATA_GO_KR_KEY'] : [])].filter((k) => !keys.has(k));
    if (missing.length) problems.push(`.env.local 에 키가 없다: ${missing.join(', ')}`);
  }
  if (runner(path.join(PG_BIN, 'pg_dump'), ['--version']).code !== 0) problems.push(`pg_dump 없음(${PG_BIN})`);
  if (runner('vercel', ['--version']).code !== 0) problems.push('vercel CLI 없음');
  return problems;
}

/* ---------- 변경 감지 ---------- */
function walk(dir, rel = '', out = new Map()) {
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (!rel && WALK_SKIP.has(e.name)) continue;
    if (e.isDirectory()) walk(dir, r, out);
    else if (e.isFile()) { const s = fs.statSync(path.join(dir, r)); out.set(r, `${s.size}:${s.mtimeMs}`); }
  }
  return out;
}
const sameBytes = (a, b) => fs.existsSync(a) && fs.existsSync(b) && fs.readFileSync(a).equals(fs.readFileSync(b));
/* 사본에서 바뀐 파일(작업 트리와 바이트 비교) → { changed, deleted } */
function changedFiles(copy, root, before) {
  const after = walk(copy);
  const changed = [...after].filter(([f, st]) => before.get(f) !== st && !sameBytes(path.join(copy, f), path.join(root, f))).map(([f]) => f).sort();
  const deleted = [...before.keys()].filter((f) => !after.has(f) && fs.existsSync(path.join(root, f))).sort();
  return { changed, deleted };
}
/* 연도 확보 격자 정답 입력: golden/ 에 S3-year-coverage.json 이 없고 api/sources-year-coverage.json 이 있으면 그것을 넣는다(같은 HOME 응답) */
function goldenYearCoverage(pfiles, gin, pkg) {
  if (pfiles.includes('golden/S3-year-coverage.json') || !pfiles.includes('api/sources-year-coverage.json')) return null;
  fs.mkdirSync(gin, { recursive: true });
  fs.copyFileSync(path.join(pkg, 'api/sources-year-coverage.json'), path.join(gin, 'S3-year-coverage.json'));
  return 'golden-in/S3-year-coverage.json ← api/sources-year-coverage.json';
}
/* git 이 무시하는 파일(예: tools/design/public-mock/data.json)은 반영 경로 밖 변경 검사에서 뺀다 */
function notIgnored(list, runner, cwd) {
  if (!list.length) return list;
  const ig = new Set(runner('git', ['check-ignore', '--stdin'], { cwd, input: list.join('\n') }).stdout.split('\n').filter(Boolean));
  return list.filter((f) => !ig.has(f));
}
const inPaths = (f, paths) => paths.some((p) => f === p || f.startsWith(`${p}/`));

/* ---------- 바뀐 수치 ---------- */
function metrics(root, month) {
  const rd = (f) => { try { return JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')); } catch { return null; } };
  const t = (n) => rd(`schemas/ledger-${month}/tables/${n}.json`)?.rows ?? [];
  const m = {};
  const projects = t('projects'), live = projects.filter((p) => !p.superseded_by);
  m['원장.사업 행'] = projects.length; m['원장.사업(대체 아님)'] = live.length;
  for (const p of live) m[`원장.사업 범위.${p.public_scope}`] = (m[`원장.사업 범위.${p.public_scope}`] ?? 0) + 1;
  for (const n of ['links', 'events', 'units', 'identifiers', 'notices', 'notice_links', 'review_required']) m[`원장.${n}`] = t(n).length;
  const plan = new Map();
  for (const u of t('units')) if (u.quantity_type === 'PROJECT_PLAN' && u.unit_scope === 'TOTAL') plan.set(u.local_project_id, Math.max(plan.get(u.local_project_id) ?? 0, u.unit_count ?? 0));
  m['원장.계획 호수(대체 아님)'] = live.reduce((s, p) => s + (plan.get(p.local_project_id) ?? 0), 0);
  const reg = rd('registry/projects.json')?.projects ?? [];
  m['레지스트리.살아 있는 발급'] = reg.filter((p) => !p.supersededBy && !p.hiddenAt).length;
  m['기준일'] = rd(`schemas/ledger-${month}/manifest.json`)?.reference_date ?? null;
  for (const [k, f] of [['종합상황판', 'data/board/ledger-board.json'], ['HOME 종합상황판', 'data/board/home-board.json']]) {
    const b = rd(f); if (!b) continue;
    for (const s of ['projects', 'judged', 'units']) m[`${k}.${s}`] = b.scope?.[s] ?? null;
    for (const g of ['ok', 'caution', 'delay']) { m[`${k}.판정 ${g}.사업`] = b.judgment?.[g]?.projects ?? null; m[`${k}.판정 ${g}.호수`] = b.judgment?.[g]?.units ?? null; }
  }
  const hb = rd('data/board/home-board.json')?.home;
  for (const [st, c] of Object.entries(hb?.cards ?? {})) for (const k of ['target', 'current', 'year_end_expected']) if (c[k] !== undefined) m[`9·7 단계 카드.${st}.${k}`] = c[k];
  for (const pol of rd('data/board/policy-progress.json')?.policies ?? []) {
    for (const [st, s] of Object.entries(pol.stages ?? {})) {
      m[`9·7 진행.${st}.HOME 방식 실적`] = s.homeRule?.actual?.units ?? null;
      m[`9·7 진행.${st}.HOME 방식 목표`] = s.homeRule?.target?.units ?? null;
      const sp = (s.samePeriod ?? []).at(-1);
      if (sp) { m[`9·7 진행.${st}.같은 기간 목표`] = sp.target; m[`9·7 진행.${st}.같은 기간 실적`] = sp.actual; }
    }
  }
  return m;
}
const metricDiff = (a, b) => Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map((k) => [k, [a[k] ?? null, b[k] ?? null]]));

/* ---------- 실제 모드 단계 ---------- */
/* ctx: { root, copy, month, edition, files:{changed,deleted}, envText, report, untilDate } — 각 단계는 실패하면 Error 를 던진다 */
function realSteps(ctx, runner) {
  const at = (cmd, args, opts = {}) => runner(cmd, args, { cwd: ctx.root, ...opts });
  const must = (r, what) => { if (r.code !== 0) throw new Error(`${what} 실패(종료 ${r.code}): ${mask(r.stderr || r.stdout).trim().split('\n').slice(-3).join(' / ')}`); return r; };
  const commitFiles = () => {
    const all = [...ctx.files.changed, ...ctx.files.deleted];
    const ignored = new Set(at('git', ['check-ignore', '--stdin'], { input: all.join('\n') }).stdout.split('\n').filter(Boolean));
    return all.filter((f) => !ignored.has(f));
  };
  return [
    ['결과 옮기기', () => {
      for (const f of ctx.files.changed) { fs.mkdirSync(path.dirname(path.join(ctx.root, f)), { recursive: true }); fs.copyFileSync(path.join(ctx.copy, f), path.join(ctx.root, f)); }
      for (const f of ctx.files.deleted) fs.rmSync(path.join(ctx.root, f), { force: true });
      return `${ctx.files.changed.length}개 쓰기 · ${ctx.files.deleted.length}개 지우기`;
    }],
    ['백업(pg_dump)', () => {
      const dir = ctx.backupDir || BACKUP_DIR;
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const stamp = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace(/[-:T]/g, '');
      const file = path.join(dir, `ledger-before-home-${ctx.edition}-${stamp}.dump`);
      const url = envValue(ctx.envText, 'SUPABASE_DB_URL');
      if (!url) throw new Error('SUPABASE_DB_URL 없음');
      must(at(path.join(PG_BIN, 'pg_dump'), [url, '-n', 'ledger', '-n', 'ledger_admin', '-n', 'api', '-Fc', '-f', file]), 'pg_dump');
      const n = (must(at(path.join(PG_BIN, 'pg_restore'), ['-l', file]), 'pg_restore -l').stdout.match(/TABLE DATA/g) || []).length;
      if (n < 20) throw new Error(`백업 TABLE DATA ${n}개(20 미만): ${file}`);
      ctx.report.rollback.backup = file;
      return `${file} (TABLE DATA ${n})`;
    }],
    ['원본 Storage(raw-store push)', () => must(at('node', ['tools/ledger/raw-store.js', 'push', '--month', ctx.month, '--only', 'raw/home']), 'raw-store push').stdout.trim().split('\n').at(-1)],
    ['적재(supabase-load)', () => {
      const r = must(at('node', ['tools/ledger/supabase-load.js', '--month', ctx.month, '--skip-raw'], { env: { ...process.env, BOARD_REVALIDATE_URL: '' } }), 'supabase-load');
      const m = /판 발행: run (\d+)/.exec(r.stdout);
      ctx.runId = m ? Number(m[1]) : null;
      return r.stdout.trim().split('\n').filter((l) => /발행|고아|지움/.test(l)).join(' / ');
    }],
    ['검증(supabase-verify)', () => {
      const r = must(at('node', ['tools/ledger/supabase-verify.js', '--month', ctx.month]), 'supabase-verify');
      if (!/모두 통과/.test(r.stdout)) throw new Error(`supabase-verify 가 '모두 통과' 가 아니다: ${r.stdout.trim().split('\n').at(-1)}`);
      return '모두 통과';
    }],
    ['커밋', () => {
      const files = commitFiles();
      if (!files.length) throw new Error('커밋할 파일이 없다');
      must(at('git', ['add', '-A', '--', ...files]), 'git add');
      const staged = at('git', ['diff', '--cached']).stdout;
      if (/sb_secret_|postgres(ql)?:\/\/[^ ]*:[^ ]*@/.test(staged)) throw new Error('올린 변경에 키가 보인다 — 중단(git reset 으로 색인을 비운다)');
      const msg = path.join(ctx.work, 'commit-message.txt');
      fs.writeFileSync(msg, `chore(ledger): HOME 슬라이스 ${ctx.edition} 반영 — ${ctx.summary}\n\n${CO_AUTHOR}\n`);
      must(at('git', ['commit', '-F', msg, '--', ...files]), 'git commit');
      ctx.commit = at('git', ['rev-parse', 'HEAD']).stdout.trim();
      ctx.report.rollback.commit = ctx.commit;
      return `${ctx.commit.slice(0, 7)} (${files.length}개 파일)`;
    }],
    ['운영 배포(vercel)', () => {
      const prev = at('vercel', ['inspect', PROD_URL], { env: noVercelEnv() });
      ctx.report.rollback.previousDeployment = (/(https:\/\/[a-z0-9-]+\.vercel\.app)/.exec(prev.stdout + prev.stderr) || [])[1] ?? null;
      const dir = fs.mkdtempSync(path.join(ctx.work, 'deploy-'));
      must(at('sh', ['-c', 'git archive HEAD | tar -x -C "$1"', 'sh', dir]), 'git archive');
      fs.mkdirSync(path.join(dir, '.vercel'), { recursive: true });
      fs.copyFileSync(path.join(ctx.root, '.vercel/project.json'), path.join(dir, '.vercel/project.json'));
      const r = must(runner('vercel', ['deploy', '--prod', '--yes'], { cwd: dir, env: noVercelEnv() }), 'vercel deploy --prod');
      ctx.deployment = (/(https:\/\/[a-z0-9-]+\.vercel\.app)/.exec(r.stdout) || [])[1] ?? null;
      return ctx.deployment ?? '주소를 못 읽음';
    }],
    ['푸시', () => { must(at('git', ['push', 'origin', 'main']), 'git push'); return 'origin/main'; }],
    ['운영 board-source 확인', () => {
      const r = must(at('curl', ['-s', `${PROD_URL}/`]), 'curl');
      const meta = (/board-source" content="([^"]+)"/.exec(r.stdout) || [])[1] ?? null;
      const want = ctx.runId ? `supabase:${ctx.month}:run${ctx.runId}` : `supabase:${ctx.month}:`;
      if (!meta || !meta.startsWith(want)) throw new Error(`운영 board-source ${meta} ≠ ${want}`);
      return meta;
    }],
  ];
}
/* Vercel CLI 는 전역 OAuth 로그인(kcaev3 팀)으로 — .env.local 의 VERCEL_* 는 옛 팀이라 넘기지 않는다(메모 2026-10-29) */
const noVercelEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^VERCEL_/.test(k)));

/* 단계를 차례로 — 하나라도 실패하면 거기서 멈추고 { ok:false, failed } */
function runSteps(steps, report, log = console.log) {
  for (const [name, fn] of steps) {
    const t = Date.now();
    try {
      const note = fn();
      report.steps.push({ name, ok: true, ms: Date.now() - t, note: mask(note ?? '') });
      log(`  ✓ ${name}${note ? ` — ${mask(note)}` : ''}`);
    } catch (e) {
      report.steps.push({ name, ok: false, ms: Date.now() - t, note: mask(e.message) });
      log(`  ✗ ${name} — ${mask(e.message)}`);
      return { ok: false, failed: name };
    }
  }
  return { ok: true };
}

function rollbackText(report, root) {
  const r = report.rollback, lines = ['되돌리기:'];
  if (r.backup) lines.push(`  Supabase: 백업 ${r.backup} — 사용자 승인 뒤 ${PG_BIN}/pg_restore --clean -n ledger -n ledger_admin -n api -d "$SUPABASE_DB_URL" <백업>(열린 달이면 이전 커밋 표로 supabase-load 재실행도 된다)`);
  else lines.push('  Supabase: 백업 전에 멈췄다(적재 안 함)');
  if (r.commit) lines.push(`  저장소: git revert ${r.commit.slice(0, 7)} (푸시 전이면 git reset --hard HEAD~1 은 사용자 확인 뒤)`);
  else lines.push(`  저장소: 커밋 전 — 옮긴 파일은 git checkout -- <경로> · 새 파일은 git clean -n 으로 확인 뒤 지운다(경로: ${report.applyPaths.join(' ')})`);
  lines.push(`  배포: ${r.previousDeployment ? `vercel rollback ${r.previousDeployment}` : '직전 운영 배포를 vercel ls --prod 로 찾아 vercel rollback <주소>'}`);
  return lines.join('\n');
}

/* ---------- 인자 ---------- */
function parseArgs(argv) {
  const o = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dryRun = true;
    else if (['--in', '--base', '--workdir', '--report'].includes(a)) o[a.slice(2)] = argv[++i];
    else throw new Error(`모르는 인자: ${a}`);
  }
  if (!o.in) throw new Error('--in <패키지> 가 필요하다');
  return o;
}

/* ---------- 전체 ---------- */
function run(opts, deps = {}) {
  const root = deps.root || ROOT, now = deps.now ? deps.now() : new Date(), log = deps.log || console.log;
  const pkg = path.resolve(opts.in);
  const work = path.resolve(opts.workdir || fs.mkdtempSync(path.join(os.tmpdir(), 'home-apply-')));
  fs.mkdirSync(work, { recursive: true });
  const runner = deps.runner || defaultRunner(path.join(work, 'commands.log'));
  const t0 = Date.now();
  const report = { mode: opts.dryRun ? 'dry-run' : 'real', startedAt: now.toISOString(), package: pkg, work, steps: [], stops: [], rollback: {}, applyPaths: [] };
  const reportFile = path.resolve(opts.report || path.join(work, 'report.json'));
  const save = () => { report.durationMs = Date.now() - t0; fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 1)}\n`); };
  const step = (name, fn) => {
    const t = Date.now(); log(`== ${name}`);
    try { const note = fn(); report.steps.push({ name, ok: true, ms: Date.now() - t, note: mask(note ?? '') }); if (note) log(`   ${mask(note)}`); return true; }
    catch (e) { report.steps.push({ name, ok: false, ms: Date.now() - t, note: mask(e.message) }); log(`   실패: ${mask(e.message)}`); return false; }
  };
  const halt = (why) => { report.stops.push(why); report.result = 'stopped'; save(); log(`멈춤: ${why}\n보고: ${reportFile}`); return 2; };
  const tail = (r) => mask(r.stderr || r.stdout).trim().split('\n').slice(-4).join(' / ');

  /* 패키지 머리 */
  const pm = JSON.parse(fs.readFileSync(path.join(pkg, 'manifest.json'), 'utf8'));
  const until = parsePgTime(pm.until), untilDate = kstDate(until), edition = editionOf(until);
  const observedMonth = JSON.parse(fs.readFileSync(path.join(root, 'data/board/ledger-board.json'), 'utf8')).observedMonth;
  Object.assign(report, { since: pm.since, until: pm.until, untilDate, edition, observedMonth });
  const dm = decideMonth({ until, observedMonth, now });
  if (dm.stop) return halt(dm.stop);
  const { month, newMonth } = dm;
  Object.assign(report, { month, newMonth, applyPaths: applyPaths(month, newMonth) });
  log(`패키지 since ${pm.since} · until ${pm.until} → 판 ${edition}, 원장 달 ${month}${newMonth ? '(새 달)' : ''}, 작업 폴더 ${work}`);

  const envFile = path.join(root, '.env.local');
  const envText = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : null;
  if (!opts.dryRun) {
    const problems = preflight({ root, runner, envText, month, newMonth });
    report.preflight = problems;
    if (problems.length) return halt(`사전 점검: ${problems.join(' · ')}`);
  }

  /* 사본 */
  const copy = path.join(work, 'repo');
  if (fs.existsSync(copy)) return halt(`작업 사본이 이미 있다: ${copy}`);
  if (!step('작업 사본(cp -c -R)', () => { const r = runner('cp', ['-c', '-R', root, copy]); if (r.code !== 0) throw new Error(tail(r)); return copy; })) return halt('작업 사본 실패');
  const before = walk(copy);
  const metricsBefore = metrics(copy, observedMonth);
  const node = (args, opt = {}) => runner('node', args, { cwd: copy, ...opt });

  /* 직전 판 기준선: 같은 코드로 직전 판을 변환(표는 임시 폴더로) */
  let baseline = null;
  if (!step('직전 판 기준선(convert, 표는 임시 폴더)', () => {
    const out = path.join(work, 'baseline-tables'); fs.mkdirSync(out, { recursive: true });
    const r = node(['-e', CONVERT_JS, observedMonth], { env: { ...process.env, OUT: out } });
    if (r.code !== 0) throw new Error(tail(r));
    baseline = parseConvertReport(r.stdout);
    if (!baseline) throw new Error('home 보고 없음');
    return `판 ${baseline.home.edition} · 묶음 ${baseline.home.groups} · 시군구 미정 ${baseline.home.sggUnresolved}`;
  })) return halt('직전 판 기준선 실패');
  report.convert = { baseline: baseline.home };

  /* 달 */
  if (newMonth) {
    log(`새 달 ${month}: monthly.js 는 네트워크(건축HUB·data.go.kr·공고 API)와 .env.local 의 DATA_GO_KR_KEY 가 필요하다`);
    if (!envKeysOf(envText).has('DATA_GO_KR_KEY')) return halt('새 달인데 .env.local 에 DATA_GO_KR_KEY 가 없다');
    if (!step(`새 달(monthly.js --month ${month})`, () => { const r = node(['tools/ledger/monthly.js', '--month', month]); if (r.code !== 0) throw new Error(tail(r)); return r.stdout.trim().split('\n').at(-1); })) return halt('monthly.js 실패');
  }
  const monthDir = path.join(copy, `schemas/ledger-${month}`);

  /* 합치기 */
  const H = require(path.join(copy, 'tools/ledger/home-source'));
  const baseDir = opts.base ? (fs.existsSync(path.resolve(opts.base)) ? path.resolve(opts.base) : path.join(monthDir, 'raw/home', opts.base)) : H.latestHomeDir(monthDir);
  if (!baseDir || !fs.existsSync(path.join(baseDir, 'manifest.json'))) return halt(`기준 판이 없다: ${baseDir}`);
  report.base = path.basename(baseDir);
  const edOut = path.join(work, 'apply', edition), apiOut = path.join(work, 'apply-api', untilDate);
  if (!step(`합치기(home-slice.py apply, 기준 ${report.base})`, () => {
    const r = runner('python3', [path.join(copy, 'tools/ledger/home-slice.py'), 'apply', '--base', baseDir, '--in', pkg, '--out', edOut, '--api-out', apiOut], { cwd: copy });
    if (r.code !== 0) throw new Error(`종료 ${r.code}: ${tail(r)}`);
    for (const [src, dst] of [[edOut, path.join(monthDir, 'raw/home', edition)], [apiOut, path.join(monthDir, 'raw/home-api', untilDate)]]) {
      if (fs.existsSync(dst)) { fs.mkdirSync(path.join(work, 'replaced'), { recursive: true }); fs.renameSync(dst, path.join(work, 'replaced', `${path.basename(path.dirname(dst))}-${path.basename(dst)}`)); report.replacedExisting = [...(report.replacedExisting ?? []), path.relative(copy, dst)]; }
      fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.renameSync(src, dst);
    }
    return `raw/home/${edition}${report.replacedExisting ? ` (같은 이름 판·응답 폴더를 바꿔 넣음: ${report.replacedExisting.join(', ')})` : ''}`;
  })) return halt('합치기 실패(home-slice 검사)');
  /* 기준일 = until 한국 날짜(raw/home-api/<기준일> 을 home-sources·requirements·정답 시험이 읽는다 — 10-20·10-22 이관과 같은 규칙) */
  const mfFile = path.join(monthDir, 'manifest.json'), mf = JSON.parse(fs.readFileSync(mfFile, 'utf8'));
  report.referenceDate = [mf.reference_date, untilDate];
  if (mf.reference_date !== untilDate) { mf.reference_date = untilDate; fs.writeFileSync(mfFile, `${JSON.stringify(mf, null, 2)}\n`); log(`   기준일 ${report.referenceDate[0]} → ${untilDate}`); }

  /* 변환·생성기 */
  let first = null, second = null;
  const conv = (n) => step(`convert ${n}`, () => {
    const r = node(['-e', CONVERT_JS, month]);
    fs.writeFileSync(path.join(work, `convert${n}.log`), mask(r.stdout + r.stderr));
    if (r.code !== 0) throw new Error(tail(r));
    const rep = parseConvertReport(r.stdout);
    if (n === 1) first = rep; else second = rep;
    return rep ? `묶음 ${rep.home.groups} · 충돌 ${rep.home.ids?.conflicts} · 시군구 미정 ${rep.home.sggUnresolved} · F ${rep.home.publicTier?.F}` : 'home 보고 없음';
  });
  const gen = (args) => step(args.join(' '), () => { const r = node(args); if (r.code !== 0) throw new Error(tail(r)); return null; });
  const pipelineOk = conv(1) && gen(['scripts/issue-projects.js', '--home', '--month', month]) && conv(2)
    && GENERATORS(month).every(([f, ...a]) => gen([`tools/ledger/${f}`, ...a]))
    && CITIZEN_BUILD.every(([cmd, a]) => step(`${cmd} ${a.join(' ')} (${CITIZEN_DIR})`, () => { const r = runner(cmd, a, { cwd: path.join(copy, CITIZEN_DIR) }); if (r.code !== 0) throw new Error(tail(r)); return null; }));
  if (!pipelineOk) return halt(`변환·생성기 실패: ${report.steps.at(-1).name} — ${report.steps.at(-1).note}`);
  report.convert.first = first?.home ?? null;
  report.convert.second = second?.home ?? null;
  report.stops.push(...stopReasons({ baseline, first, second }));

  /* 정답 계산(패키지 golden·web) */
  const goldenOut = path.join(copy, '.cache/home-apply/golden');
  const pfiles = Object.keys(pm.files || {});
  const gin = path.join(work, 'golden-in'), win = path.join(work, 'web-in');
  const hasGolden = pfiles.some((f) => f.startsWith('golden/')) && pfiles.some((f) => f.startsWith('web/'));
  if (!hasGolden) report.stops.push('정답 대조 입력 없음(패키지에 golden/·web/ 이 없다) — 자동 운영 반영의 조건');
  else {
    for (const f of pfiles.filter((x) => /^(golden|web)\//.test(x))) {
      const dst = path.join(f.startsWith('golden/') ? gin : win, f.slice(f.indexOf('/') + 1));
      fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(path.join(pkg, f), dst);
    }
    const yc = goldenYearCoverage(pfiles, gin, pkg);
    if (yc) log(`   ${yc}`);
    const fetchedAt = pm.files['golden/S2-raw-map-dashboard.json']?.fetched_at ?? until.toISOString();
    if (!step('정답 계산(home-parity/run.js)', () => {
      const r = node([path.join(copy, 'tools/ledger/home-parity/run.js'), '--golden', gin, '--web', win, '--out', goldenOut, '--repo', copy, '--as-of', untilDate, '--fetched-at', fetchedAt]);
      if (r.code !== 0) throw new Error(tail(r));
      return r.stdout.trim().split('\n').at(-1);
    })) report.stops.push('정답 계산 실패');
  }

  /* 바뀐 파일·수치(시험·빌드 전에 — 빌드 산출물은 넣지 않는다) */
  const files = changedFiles(copy, root, before);
  const paths = applyPaths(month, newMonth);
  report.files = { changed: files.changed, deleted: files.deleted, outside: notIgnored([...files.changed, ...files.deleted].filter((f) => !inPaths(f, paths)), runner, copy) };
  if (report.files.outside.length) report.stops.push(`이번 반영 경로 밖 변경 ${report.files.outside.length}개: ${report.files.outside.slice(0, 5).join(', ')}`);
  const metricsAfter = metrics(copy, month);
  report.metrics = { before: metricsBefore, after: metricsAfter, changed: metricDiff(metricsBefore, metricsAfter) };

  /* 시험(사본, 네트워크 없이 — .env.local 을 치우고 Supabase 값을 빼 JSON 대체로) */
  if (fs.existsSync(path.join(copy, '.env.local'))) fs.renameSync(path.join(copy, '.env.local'), path.join(work, 'env.local.hidden'));
  const tenv = offlineEnv({ HOME_GOLDEN_DIR: goldenOut, MAP_GOLDEN: path.join(goldenOut, 'map-golden.json') });
  report.tests = {};
  step('정답 대조 시험 6종(건너뛰기 0)', () => {
    const r = node(['--test', ...GOLDEN_TESTS], { env: tenv });
    const c = parseTestCounts(r.stdout); report.tests.golden = c;
    fs.writeFileSync(path.join(work, 'test-golden.log'), r.stdout + r.stderr);
    if (!hasGolden) throw new Error('정답 대조 입력 없음');
    if (r.code !== 0 || c.fail || c.skipped || c.cancelled || !c.pass) throw new Error(`통과 ${c.pass} · 실패 ${c.fail} · 건너뛰기 ${c.skipped}`);
    return `통과 ${c.pass} · 건너뛰기 0`;
  }) || report.stops.push(`정답 대조 실패: ${report.steps.at(-1).note}`);
  step('npm test', () => {
    const r = runner('npm', ['test'], { cwd: copy, env: tenv });
    const c = parseTestCounts(r.stdout); report.tests.npm = c;
    fs.writeFileSync(path.join(work, 'test-npm.log'), r.stdout + r.stderr);
    if (r.code !== 0 || c.fail) throw new Error(`통과 ${c.pass} · 실패 ${c.fail} · 건너뛰기 ${c.skipped}`);
    return `통과 ${c.pass} · 건너뛰기 ${c.skipped}`;
  }) || report.stops.push(`npm test 실패: ${report.steps.at(-1).note}`);
  step('python3 -m unittest', () => {
    const r = runner('python3', ['-m', 'unittest', 'discover', '-s', 'tests'], { cwd: copy, env: tenv });
    report.tests.unittest = (r.stderr.trim().split('\n').slice(-3).join(' '));
    if (r.code !== 0) throw new Error(report.tests.unittest);
    return report.tests.unittest;
  }) || report.stops.push('unittest 실패');
  step('npx tsc --noEmit', () => { const r = runner('npx', ['tsc', '--noEmit'], { cwd: copy, env: tenv }); if (r.code !== 0) throw new Error(tail(r)); return null; }) || report.stops.push('tsc 실패');
  /* Next.js 16.4.0 은 첫 빌드에서 페이지 생성 뒤 SecurityFatalError(알려진 취약점, 업그레이드 권고)로 종료 1 을 낸다(다시 돌리면 통과 — 2026-11-09 실측).
     몰래 다시 돌리지 않고 따로 멈춤 이유로 보고한다(업그레이드 여부는 사용자 결정) */
  let securityFatal = false;
  step('npm run build', () => {
    const r = runner('npm', ['run', 'build'], { cwd: copy, env: tenv });
    fs.writeFileSync(path.join(work, 'build.log'), r.stdout + r.stderr);
    securityFatal = r.code !== 0 && /SecurityFatalError/.test(r.stdout + r.stderr);
    if (r.code !== 0) throw new Error(tail(r));
    return null;
  }) || report.stops.push(securityFatal ? 'Next.js 보안 업그레이드 필요(npm run build 가 SecurityFatalError 로 끝남 — 다시 돌리지 않았다)' : 'npm run build 실패');

  /* 보고 */
  const ch = report.metrics.changed;
  report.summary = `사업 ${metricsAfter['원장.사업(대체 아님)']}(${metricsAfter['원장.사업(대체 아님)'] - metricsBefore['원장.사업(대체 아님)'] >= 0 ? '+' : ''}${metricsAfter['원장.사업(대체 아님)'] - (metricsBefore['원장.사업(대체 아님)'] ?? 0)})·연결 ${metricsAfter['원장.links']}·바뀐 수치 ${Object.keys(ch).length}`;
  log(`\n바뀐 수치 ${Object.keys(ch).length}개${Object.keys(ch).length ? ':' : ''}`);
  for (const [k, [a, b]] of Object.entries(ch).slice(0, 60)) log(`  ${k}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
  log(`바뀐 파일 ${files.changed.length}개 · 지운 파일 ${files.deleted.length}개${report.files.outside.length ? ` · 범위 밖 ${report.files.outside.length}개` : ''}`);
  if (report.stops.length) return halt(report.stops.join(' · '));
  if (opts.dryRun) { report.result = 'dry-run ok'; save(); log(`dry-run 통과 — 저장소·Supabase·운영은 건드리지 않았다. 보고: ${reportFile}`); return 0; }

  /* 실제 반영 */
  const ctx = { root, copy, work, month, edition, untilDate, files, envText, report, summary: report.summary };
  log('\n실제 반영:');
  const res = runSteps(realSteps(ctx, runner), report, log);
  report.deployment = ctx.deployment ?? null; report.runId = ctx.runId ?? null;
  if (!res.ok) { report.result = `failed at ${res.failed}`; save(); log(rollbackText(report, root)); return 2; }
  report.result = 'applied'; save();
  log(`반영 끝: run ${ctx.runId} · 배포 ${ctx.deployment} · 커밋 ${ctx.commit?.slice(0, 7)}\n${rollbackText(report, root)}\n보고: ${reportFile}`);
  return 0;
}

if (require.main === module) {
  let code;
  try { code = run(parseArgs(process.argv.slice(2))); } catch (e) { console.error(mask(e.stack || e.message)); code = 1; }
  process.exit(code);
}

module.exports = { parsePgTime, kstDate, kstMonth, editionOf, decideMonth, parseConvertReport, stopReasons, parseTestCounts, envKeysOf, preflight, realSteps, runSteps, applyPaths, mask, metricDiff, parseArgs, rollbackText, SGG_UNRESOLVED_ALLOW, GROUPS_RATIO, GENERATORS, CITIZEN_BUILD, CITIZEN_DIR, goldenYearCoverage, notIgnored };
