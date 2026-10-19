'use strict';
/* 사업 원장 월 갱신 오케스트레이터: 새 건축HUB 대용량 판 받기 → 원장 다시 만들기 → 판정 이력 → 보드·지도 색인. Supabase 에는 쓰지 않는다
   (적재는 PR 을 사람이 합친 뒤 .github/workflows/ledger-load.yml 이 한다).
   실행: node tools/ledger/monthly.js [--month YYYY-MM](기본 한국시간 이번 달, --refresh 면 가장 늦은 원장 폴더) [--dry-run | --refresh] [--root <저장소>] [--result <파일.json>] [--summary <파일.md>]
   규칙
   - 한국시간 이번 달보다 뒤의 달, 가장 늦은 원장 폴더보다 앞의 달은 거부한다(새 달을 적재하면 앞 달이 닫힌다). 새 달 원장은 이번 달만 만든다.
   - 받을 수 있는 최신 대용량 판(fetch-hub-bulk.js --list, 3종이 다 있는 데이터 월)이 그 달 폴더가 쓴 판과 같고 새 달도 아니면 '새 자료 없음'으로
     아무것도 바꾸지 않고 끝낸다(매일 다시 돌려도 안전). --dry-run 은 목록만 보고 할 일을 출력한다.
   - 새 달: schemas/ledger-<달>/ 을 만들고 앞 달 폴더의 정적 입력(STATIC: 법정동·LH 준공예정·입주예정·과거 판·매핑·기관 양식)을 복사한다.
     같은 달 갱신이면 그 폴더를 고친다. 새 판이면 3종을 raw/hub-bulk 에 받고, 밀려난 기본개요는 raw/hub-bulk-history/basic-<판>.zip 으로 옮기고 그 manifest 에 더한다.
   - 이어서 달 기록(manifest.json: 기준일 = 한국시간 오늘) → hub-bulk → snapshot(API, 이번 달만) → collect-national(공고 API) → convert(--out tables,
     후보 id 매핑 갱신) → validate → (새 달이면 trend --close: 앞 달 보드의 판정을 관측 행으로) → trend → board.
   - 끝에 바뀐 것(판·사업 수·판정 전후)을 표준출력과 달 기록 manifest.json 의 summary, --summary 파일(PR 본문)에 쓴다. --result 파일은 워크플로가 읽는 상태 JSON.
   - 새 판이 들어오면 그 판으로 다시 만들고 열린 달 API 덮어쓰기 결과(snapshot/hub-refresh.*)는 지운다(새 판이 더 최신 기준, 다음 --refresh 가 새 판 위에 다시 만든다).
   --refresh(열린 달 주 1회 갱신, .github/workflows/ledger-refresh.yml): 가장 늦은 원장 폴더가 한국시간 이번 달일 때만(아니면 'skipped' — 새 달 폴더는 월 수집이 만든다).
     판 목록·내려받기 없이 달 기록 기준일 = 한국시간 오늘 → hub-bulk(기준일이 바뀌어 중간 스냅샷의 규칙 글도 바뀐다) → hub-api-refresh(건축HUB OpenAPI 덮어쓰기)
     → snapshot → collect-national → convert(--hub-bulk snapshot/hub-refresh.json) → validate → trend(--close 없음) → board.
     --result 의 status: 'unchanged'(원장 표·보드 바이트가 같음) · 'auto' · 'review'(판정 등급이 바뀐 사업 > max(50, 판정 사업의 2%) 또는 사업 수가 ±2% 넘게 바뀜).
   시험: tests/js/monthly.test.cjs (가짜 목록·내려받기·실행으로) */
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const P = require('./paths');

const KINDS = ['basic', 'act', 'site'];
/* 새 달에 앞 달 폴더에서 가져오는 정적 입력(새로 받는 것: raw/hub·myhome·lh-notice·hub-bulk(새 판), snapshot, tables). raw/home = HOME 덤프 판(수도권 정본, 팀원이 새 덤프를 줄 때만 바뀐다) */
const STATIC = ['raw/legal-dong', 'raw/lh-completion', 'raw/move-in', 'raw/hub-bulk-history', 'raw/home', 'mappings', 'agency'];
/* 열린 달 API 덮어쓰기(tools/ledger/hub-api-refresh.js)의 출력(snapshot/ 안) */
const REFRESH_FILES = ['hub-refresh.json', 'hub-refresh.manifest.json', 'hub-refresh.report.json'];

const kstNow = (now) => new Date(now + 9 * 3600 * 1000).toISOString();
const nextMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeJson = (f, v) => fs.writeFileSync(f, `${JSON.stringify(v, null, 1)}\n`);
const fmt = (n) => (n == null ? '–' : Number(n).toLocaleString('en-US'));

/* fetch-hub-bulk.js --list 출력('2026-08\t제공 2026-09\tbasic,act,site') → [{ month, provided, kinds }] */
const parseList = (text) => text.split('\n').map((l) => /^(\d{4}-\d{2})\t제공 (\S+)\t(\S*)$/.exec(l.trim())).filter(Boolean)
  .map(([, month, provided, kinds]) => ({ month, provided, kinds: kinds.split(',').filter(Boolean) }));
/* 3종이 다 있는 가장 늦은 판 */
const latestEdition = (list) => list.filter((e) => KINDS.every((k) => e.kinds.includes(k))).sort((a, b) => a.month.localeCompare(b.month)).pop() ?? null;

function defaultExec(root) {
  return (script, args, { capture = false } = {}) => {
    const r = spawnSync(process.execPath, [path.join(root, 'tools/ledger', script), ...args], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', capture ? 'pipe' : 'inherit', 'inherit'] });
    if (r.status !== 0) throw new Error(`${script} ${args.join(' ')} 실패(종료 코드 ${r.status})`);
    return r.stdout;
  };
}
function defaultValidate(tablesDir) {
  const { validate } = require('./validate');
  const tables = Object.fromEntries(fs.readdirSync(tablesDir).filter((f) => f.endsWith('.json')).sort().map((f) => [f.slice(0, -5), readJson(path.join(tablesDir, f)).rows]));
  return validate(tables);
}

/* 보드 파일에서 요약 숫자 */
function boardSummary(file) {
  if (!fs.existsSync(file)) return null;
  const b = readJson(file), j = b.judgment;
  return { month: b.observedMonth, referenceDate: b.referenceDate, edition: b.trend?.[b.trend.length - 1]?.edition ?? null, projects: b.scope.projects, judged: b.scope.judged, ok: j.ok.projects, caution: j.caution.projects, delay: j.delay.projects,
    okUnits: j.ok.units, cautionUnits: j.caution.units, delayUnits: j.delay.units };
}
function summaryMarkdown({ month, edition, newMonth, prevMonth, before, after }) {
  const row = (label, f) => `| ${label} | ${before ? f(before) : '–'} | ${f(after)} |`;
  return [
    `## 사업 원장 월 갱신 ${month} (건축HUB 대용량 ${edition} 판)`, '',
    '| | 전 | 후 |', '|---|---|---|',
    row('원장 달 · 기준일', (s) => `${s.month} · ${s.referenceDate}`),
    row('건축HUB 대용량 판', (s) => s.edition ?? '–'),
    row('사업', (s) => fmt(s.projects)),
    row('판정(정상 · 주의 · 지연)', (s) => `${fmt(s.judged)} (${fmt(s.ok)} · ${fmt(s.caution)} · ${fmt(s.delay)})`),
    '',
    newMonth ? `새 달이다. 이 PR 을 합치면 ledger-load 가 ${month} 를 Supabase 에 싣고, 그때 앞 달 ${prevMonth} 가 닫힌다(되돌릴 수 없다).` : `같은 달(${month}) 갱신이다. 합치면 ledger-load 가 열린 달 ${month} 를 다시 싣는다.`,
    '자동으로 받지 않는 것: 통계누리(data/board/molit.json), 입주예정 새 파일(반기), LH 준공예정 새 판(연 1회), 법정동코드 새 판(연 1회).',
  ].join('\n');
}

/* 옮기기(다른 장치면 복사 후 지우기) */
function move(src, dest) {
  try { fs.renameSync(src, dest); } catch (e) { if (e.code !== 'EXDEV') throw e; fs.copyFileSync(src, dest); fs.unlinkSync(src); }
}

/* 새 판 3종을 dir/raw/hub-bulk 에 놓고, 밀려난 기본개요(oldRaw 의 판 used)를 과거 판으로 옮긴다(새 달이면 복사 — 앞 달 폴더는 그대로 둔다) */
function placeEdition({ dir, oldRaw, used, frag, tmp, month, copyOld }) {
  const old = readJson(path.join(oldRaw, 'manifest.json'));
  const histDir = path.join(dir, 'raw/hub-bulk-history');
  fs.mkdirSync(histDir, { recursive: true });
  const histFile = path.join(histDir, 'manifest.json');
  const hist = fs.existsSync(histFile) ? readJson(histFile) : { source: '건축HUB 대용량 제공 서비스 - 주택인허가 기본개요 과거 월 판', files: [] };
  const zip = `basic-${used}.zip`, ob = old.files.basic;
  if (!fs.existsSync(path.join(histDir, zip))) (copyOld ? fs.copyFileSync : move)(path.join(oldRaw, ob.zip), path.join(histDir, zip));
  if (!hist.files.some((f) => f.zip === zip)) {
    hist.files.push({ data_month: used, provided_month: /데이터제공년월 (\d{4}-\d{2})/.exec(ob.service ?? '')?.[1] ?? nextMonth(used), zip, zip_bytes: ob.zip_bytes, zip_sha256: ob.zip_sha256, member: ob.member, member_bytes: ob.member_bytes, rows: ob.rows, fetched_at: old.fetched_at });
    hist.files.sort((a, b) => a.data_month.localeCompare(b.data_month));
    writeJson(histFile, hist);
  }
  const raw = path.join(dir, 'raw/hub-bulk');
  if (!copyOld) for (const k of KINDS) { const f = path.join(raw, old.files[k].zip); if (fs.existsSync(f)) fs.unlinkSync(f); }
  fs.mkdirSync(raw, { recursive: true });
  for (const k of KINDS) move(path.join(tmp, frag.files[k].zip), path.join(raw, frag.files[k].zip));
  const provided = /데이터제공년월 (\d{4}-\d{2})/.exec(frag.files.basic.service ?? '')?.[1] ?? nextMonth(frag.data_month);
  writeJson(path.join(raw, 'manifest.json'), {
    source: old.source, data_month: frag.data_month, fetched_at: KINDS.map((k) => frag.files[k].fetched_at).sort()[0], endpoint: old.endpoint,
    params: { observed_month: month, 구분: '02 주택인허가', 데이터제공년월: `${provided}(${frag.data_month.slice(0, 4)}년 ${frag.data_month.slice(5)}월 데이터)`, 이용목적: '3 참고자료' },
    notes: 'tools/ledger/monthly.js 가 tools/ledger/fetch-hub-bulk.js 로 받았다(로그인 없음). 열 이름(columns)은 앞 판 manifest 에서 옮겼다.',
    files: Object.fromEntries(KINDS.map((k) => [k, { ...frag.files[k], columns: old.files[k].columns }])),
  });
}

async function run({ root = P.ROOT, month, dryRun = false, now = Date.now(), exec = defaultExec(root), listEditions, download, validateDir = defaultValidate, log = console.log } = {}) {
  const today = kstNow(now).slice(0, 10), kstMonth = today.slice(0, 7);
  month ??= kstMonth;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`--month 는 YYYY-MM 이어야 한다: ${month}`);
  if (month > kstMonth) throw new Error(`${month} 는 한국시간 이번 달(${kstMonth})보다 뒤라 만들 수 없다`);
  const latest = P.latestMonth(root);
  if (month < latest) throw new Error(`${month} 는 가장 늦은 원장 폴더(${latest})보다 앞이라 고칠 수 없다(새 달을 적재하면 앞 달은 닫힌다)`);
  const newMonth = month !== latest;
  if (newMonth && month !== kstMonth) throw new Error(`새 달 원장은 한국시간 이번 달(${kstMonth})만 만든다(건축HUB API 스냅샷·공고는 받은 날의 값이다)`);
  const dir = P.ledgerDir(month, root), prevDir = P.ledgerDir(latest, root);
  const used = P.bulkDataMonth(path.join(prevDir, 'raw/hub-bulk'));

  listEditions ??= async () => parseList(exec('fetch-hub-bulk.js', ['--list'], { capture: true }));
  const avail = latestEdition(await listEditions());
  const edition = avail && avail.month > used ? avail.month : used, fresh = edition !== used;
  const result = { month, newMonth, edition, previousEdition: used, previousMonth: latest, branch: `ledger/${month}-${edition}` };
  if (!newMonth && !fresh) {
    log(`새 자료 없음: ${month} 원장은 이미 건축HUB 대용량 ${used} 판을 쓴다(받을 수 있는 최신 판 ${avail?.month ?? '없음'}). 아무것도 바꾸지 않았다.`);
    return { ...result, status: 'no-new-data' };
  }
  const online = month === kstMonth;
  const plan = [
    newMonth ? `새 달 폴더 schemas/ledger-${month} 만들기, 앞 달 ${latest} 에서 정적 입력 복사(${STATIC.join(' · ')})` : `같은 달 schemas/ledger-${month} 고치기`,
    fresh ? `건축HUB 대용량 ${edition} 판 3종 받기, 밀려난 기본개요 ${used} → raw/hub-bulk-history/basic-${used}.zip` : `건축HUB 대용량 판은 ${used} 그대로`,
    `달 기록 manifest.json(기준일 ${today})`, 'hub-bulk.js', `snapshot.js${online ? '' : ' --offline'}`, online ? 'collect-national.js(공고 API)' : '공고 수집 건너뜀(지난 달)',
    'convert.js --out tables(후보 id 매핑 갱신)', 'validate', ...(newMonth ? [`trend.js --close(앞 달 ${latest} 관측 행)`] : []), 'trend.js', 'board.js',
  ];
  if (dryRun) {
    log(`[dry-run] ${month}${newMonth ? '(새 달)' : ''}: 건축HUB 대용량 ${used} → ${edition}. 할 일:\n${plan.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}`);
    return { ...result, status: 'planned' };
  }

  const boardFile = path.join(root, 'data/board/ledger-board.json');
  const before = boardSummary(boardFile);
  if (newMonth) {
    fs.mkdirSync(dir, { recursive: true });
    for (const rel of STATIC) if (fs.existsSync(path.join(prevDir, rel))) fs.cpSync(path.join(prevDir, rel), path.join(dir, rel), { recursive: true });
    if (!fresh) fs.cpSync(path.join(prevDir, 'raw/hub-bulk'), path.join(dir, 'raw/hub-bulk'), { recursive: true });
  }
  if (fresh) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-bulk-'));
    try {
      download ??= async (e, out) => JSON.parse(exec('fetch-hub-bulk.js', ['--data-month', e, '--out', out], { capture: true }));
      const frag = await download(edition, tmp);
      placeEdition({ dir, oldRaw: path.join(prevDir, 'raw/hub-bulk'), used, frag, tmp, month, copyOld: newMonth });
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    if (!newMonth) for (const f of [`hub-bulk-${used}.json`, `hub-bulk-${used}.manifest.json`, ...REFRESH_FILES]) fs.rmSync(path.join(dir, 'snapshot', f), { force: true });
  }
  const record = { schema: 'ledger-month/1', month, reference_date: today, edition, previous: { month: latest, edition: used }, built_at: new Date(now).toISOString(), tool: 'tools/ledger/monthly.js', steps: plan };
  writeJson(path.join(dir, 'manifest.json'), record);

  exec('hub-bulk.js', ['--month', month]);
  exec('snapshot.js', ['--month', month, ...(online ? [] : ['--offline'])]);
  if (online) exec('collect-national.js', ['--month', month, '--source', 'all', '--to', today]);
  exec('convert.js', convertArgs(root, dir, month, `hub-bulk-${edition}.json`));
  const errors = validateDir(path.join(dir, 'tables'));
  if (errors.length) throw new Error(`validate 오류 ${errors.length}건: ${errors.slice(0, 3).join(' / ')}`);
  if (newMonth) exec('trend.js', ['--month', month, '--close']);
  exec('trend.js', ['--month', month]);
  exec('board.js', ['--month', month]);
  const pp = policyProgressArgs(dir, month);
  if (pp) { exec('policy-progress.js', pp); exec('projects-index.js', pp); }

  const after = boardSummary(boardFile);
  const summary = summaryMarkdown({ month, edition, newMonth, prevMonth: latest, before, after });
  writeJson(path.join(dir, 'manifest.json'), { ...record, summary: { before, after } });
  log(summary);
  return { ...result, status: 'updated', summary };
}

/* convert.js 인자(그 달 폴더의 입력, --hub-bulk = snapshot/<bulkFile>). 단계별 원천 중간 스냅샷(snapshot/stage-*.json, 가장 늦은 것)이 있으면 --stage 로 넘긴다 —
   그 스냅샷은 수동 단계(tools/ledger/stage-snapshot.js, 원본 API 자료가 CI 에 없다)라 월 갱신이 만들지 않는다.
   HOME 덤프 판(raw/home/<덤프시각>, 가장 늦은 것)이 있으면 --home 과 id 매핑 --home-ids(mappings/home-ids.json)를 넘긴다 — 수도권은 HOME 이 정본이라 원본(jsonl.gz)이 없으면 convert 가 멈춘다(Storage 에서 받거나 home-dump.py — raw-store.js pull 은 아직 HOME 을 받지 않는다).
   HOME 판이 있으면 --sidos 11,28,41 도 넘긴다 — 원장 사업은 HOME 수도권만(2026-10-19 사용자 결정, 수도권 밖 사업·딸린 행을 뺀다) */
function convertArgs(root, dir, month, bulkFile) {
  const rel = (p) => path.relative(root, p);
  const dong = fs.readdirSync(path.join(dir, 'raw/legal-dong')).filter((f) => f.endsWith('.csv')).sort().pop();
  const snap = path.join(dir, 'snapshot'), stage = fs.existsSync(snap) ? fs.readdirSync(snap).filter((f) => /^stage-\d{4}-\d{2}\.json$/.test(f)).sort().pop() : null;
  const home = require('./home-source').latestHomeDir(dir);
  return ['--month', month, '--lh-sgg', rel(path.join(dir, 'mappings/lh-block-sgg.json')), '--hub-events', rel(path.join(dir, 'snapshot/hub-events.json')),
    '--legal-dong', rel(path.join(dir, 'raw/legal-dong', dong)), '--hub-bulk', rel(path.join(dir, 'snapshot', bulkFile)),
    '--hub-ids', rel(path.join(dir, 'mappings/hub-candidate-ids.json')), '--national', rel(path.join(dir, 'raw')), ...(stage ? ['--stage', rel(path.join(snap, stage))] : []),
    ...(home ? ['--home', rel(home), '--home-ids', rel(path.join(dir, 'mappings/home-ids.json')), '--sidos', require('./home-source').HOME_SIDO.join(',')] : []), '--out', rel(path.join(dir, 'tables'))];
}

/* 9·7 정책 단계별 목표·확인(policy-progress.js → data/board/policy-progress.json)과 사업 화면 자료(projects-index.js → projects-index·project-detail.json) 인자:
   그 달 폴더에 HOME 판이 있을 때만(보드 다음에 돈다), 없으면 null */
const policyProgressArgs = (dir, month) => (require('./home-source').latestHomeDir(dir) ? ['--month', month] : null);

/* ---------- 열린 달 주 1회 갱신(--refresh) ---------- */
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
/* 원장 표(tables/*.json)와 보드 파일의 바이트 지문 */
function fingerprint(root, dir) {
  const t = path.join(dir, 'tables'), board = path.join(root, 'data/board/ledger-board.json');
  const files = [...(fs.existsSync(t) ? fs.readdirSync(t).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(t, f)) : []), board];
  return files.map((f) => `${path.relative(root, f)} ${fs.existsSync(f) ? sha256(fs.readFileSync(f)) : '-'}`).join('\n');
}
/* 지도 색인(data/board/ledger-map.json)의 사업 id → 판정 등급(ok·caution·delay·null). 파일이 없으면 null */
const gradesOf = (file) => (fs.existsSync(file) ? new Map(Object.values(readJson(file).bySgg).flat().map((r) => [r.id, r.cls ?? null])) : null);
/* 판정 등급이 바뀐 사업 수(한쪽에만 있는 사업은 없는 쪽을 null 로 본다) */
function changedGrades(a, b) {
  let n = 0;
  for (const id of new Set([...a.keys(), ...b.keys()])) if ((a.get(id) ?? null) !== (b.get(id) ?? null)) n++;
  return n;
}
/* 상태: unchanged(표·보드 바이트 같음) · review(등급 바뀐 사업 > max(50, 판정 사업 2%) 또는 사업 수 ±2% 초과, 앞 보드·지도가 없을 때도) · auto */
function refreshStatus({ same, before, after, changed }) {
  if (same) return 'unchanged';
  if (!before || changed == null) return 'review';
  const limit = Math.max(50, before.judged * 0.02), drift = Math.abs(after.projects - before.projects) / (before.projects || 1);
  return changed > limit || drift > 0.02 ? 'review' : 'auto';
}
function refreshMarkdown({ month, edition, apiDate, before, after, changed, status, report }) {
  const row = (label, f) => `| ${label} | ${before ? f(before) : '–'} | ${f(after)} |`;
  const both = (p, u) => (s) => `${fmt(s[p])} · ${s[u] == null ? '–' : `${fmt(s[u])}호`}`;
  const o = report?.overwrite, m = report?.match;
  return [
    `## 사업 원장 열린 달 갱신 ${month} (건축HUB 대용량 ${edition} 판 + OpenAPI ${apiDate ?? '–'})`, '',
    '| | 전 | 후 |', '|---|---|---|',
    row('기준일', (s) => s.referenceDate),
    row('사업', (s) => fmt(s.projects)),
    row('판정 사업', (s) => fmt(s.judged)),
    row('정상 사업 · 호수', both('ok', 'okUnits')),
    row('주의 사업 · 호수', both('caution', 'cautionUnits')),
    row('지연 사업 · 호수', both('delay', 'delayUnits')),
    '',
    `판정 등급이 바뀐 사업 ${changed == null ? '–' : fmt(changed)} · 결과 ${status}${status === 'review' ? '(등급 바뀐 사업 > max(50, 판정 사업 2%) 또는 사업 수 ±2% 초과 — 사람이 확인)' : ''}`,
    ...(o ? [`API 덮어쓰기: 관리번호 일치 ${fmt(m.matched)}/${fmt(m.queried)}(${(m.rate * 100).toFixed(2)}%) · ①덮어씀 ${fmt(o.overwritten)}(값 바뀜 ${fmt(o.overwritten_changed)}) · ②대용량 그대로 ${fmt(o.kept_not_in_api + o.kept_not_queried)} · ③더함 ${fmt(o.added)} · ④뺌 ${fmt(o.dropped)} · 의심 날짜 ${fmt(report.suspect.count)}`] : []),
  ].join('\n');
}

async function refresh({ root = P.ROOT, month, now = Date.now(), exec = defaultExec(root), validateDir = defaultValidate, log = console.log } = {}) {
  const today = kstNow(now).slice(0, 10), kstMonth = today.slice(0, 7), latest = P.latestMonth(root);
  month ??= latest;
  if (month !== latest) throw new Error(`--refresh 는 가장 늦은 원장 폴더(${latest})만 고친다: ${month}`);
  const dir = P.ledgerDir(month, root), edition = P.bulkDataMonth(path.join(dir, 'raw/hub-bulk'));
  const result = { month, newMonth: false, edition, mode: 'refresh', branch: `ledger/${month}-refresh-${today}` };
  if (month !== kstMonth) {
    log(`건너뜀: 가장 늦은 원장 폴더 ${month} 가 한국시간 이번 달(${kstMonth})이 아니다 — 새 달 폴더는 월 수집(ledger-collect)이 만든다`);
    return { ...result, status: 'skipped' };
  }
  const boardFile = path.join(root, 'data/board/ledger-board.json'), mapFile = path.join(root, 'data/board/ledger-map.json');
  const before = boardSummary(boardFile), gradesBefore = gradesOf(mapFile), printBefore = fingerprint(root, dir);
  const recFile = path.join(dir, 'manifest.json'), prev = fs.existsSync(recFile) ? readJson(recFile) : {};
  const plan = [`달 기록 manifest.json(기준일 ${today})`, 'hub-bulk.js', 'hub-api-refresh.js(건축HUB OpenAPI 덮어쓰기)', 'snapshot.js', 'collect-national.js(공고 API)',
    'convert.js --hub-bulk snapshot/hub-refresh.json --out tables', 'validate', 'trend.js', 'board.js'];
  const { summary: _old, ...keep } = prev;
  const record = { ...keep, schema: 'ledger-month/1', month, reference_date: today, edition, refreshed_at: new Date(now).toISOString(), tool: 'tools/ledger/monthly.js --refresh', steps: plan };
  writeJson(recFile, record);

  exec('hub-bulk.js', ['--month', month]);
  exec('hub-api-refresh.js', ['--month', month]);
  exec('snapshot.js', ['--month', month]);
  exec('collect-national.js', ['--month', month, '--source', 'all', '--to', today]);
  exec('convert.js', convertArgs(root, dir, month, 'hub-refresh.json'));
  const errors = validateDir(path.join(dir, 'tables'));
  if (errors.length) throw new Error(`validate 오류 ${errors.length}건: ${errors.slice(0, 3).join(' / ')}`);
  exec('trend.js', ['--month', month]);
  exec('board.js', ['--month', month]);
  const pp = policyProgressArgs(dir, month);
  if (pp) { exec('policy-progress.js', pp); exec('projects-index.js', pp); }

  const after = boardSummary(boardFile), gradesAfter = gradesOf(mapFile);
  const changed = gradesBefore && gradesAfter ? changedGrades(gradesBefore, gradesAfter) : null;
  const status = refreshStatus({ same: fingerprint(root, dir) === printBefore, before, after, changed });
  const reportFile = path.join(dir, 'snapshot/hub-refresh.report.json'), report = fs.existsSync(reportFile) ? readJson(reportFile) : null;
  const summary = refreshMarkdown({ month, edition, apiDate: report?.api_date, before, after, changed, status, report });
  writeJson(recFile, { ...record, summary: { mode: 'refresh', status, changedGrades: changed, before, after } });
  log(summary);
  return { ...result, status, changedGrades: changed, summary };
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dryRun = true;
    else if (a === '--refresh') o.refresh = true;
    else if (['--month', '--root', '--result', '--summary'].includes(a)) o[a.slice(2)] = argv[++i];
    else throw new Error(`모르는 인자 ${a}`);
  }
  return o;
}

module.exports = { run, refresh, refreshStatus, changedGrades, parseList, latestEdition, placeEdition, summaryMarkdown, boardSummary, parseArgs, convertArgs, policyProgressArgs, STATIC, REFRESH_FILES };

if (require.main === module) {
  (async () => {
    const o = parseArgs(process.argv.slice(2));
    if (o.refresh && o.dryRun) throw new Error('--refresh 와 --dry-run 은 함께 쓰지 않는다');
    const r = await (o.refresh ? refresh : run)({ month: o.month, dryRun: o.dryRun, ...(o.root ? { root: path.resolve(o.root) } : {}) });
    if (o.result) fs.writeFileSync(o.result, `${JSON.stringify({ ...r, summary: undefined })}\n`);
    if (o.summary && r.summary) fs.writeFileSync(o.summary, `${r.summary}\n`);
  })().catch((e) => { console.error(`오류: ${e.message}`); process.exit(1); });
}
