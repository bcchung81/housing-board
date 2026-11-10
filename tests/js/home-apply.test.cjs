'use strict';
/* tools/ledger/home-apply.js(HOME 슬라이스 반영 명령, 2026-11-09 HOME-JSON-반영-계획 P3)의 판정 함수와 실제 모드 단계 순서.
   외부 명령은 가짜 runner 로만 — 네트워크·git·Supabase·Vercel 을 부르지 않는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const A = require('../../tools/ledger/home-apply.js');

/* 가짜 convert home 보고 */
const rep = (h = {}, validated = true) => ({ validated, home: { groups: 381, sggUnresolved: 0, publicTier: { A: 184, F: 0 }, ids: { conflicts: 0 }, ...h } });

test('stopReasons: 깨끗한 판은 멈춤 없음', () => {
  assert.deepEqual(A.stopReasons({ baseline: rep(), first: rep(), second: rep({ groups: 390 }) }), []);
});

test('stopReasons: ids.conflicts > 0(첫·두 번째 convert 어느 쪽이든) 이면 멈춘다', () => {
  assert.match(A.stopReasons({ baseline: rep(), first: rep({ ids: { conflicts: 1 } }), second: rep() }).join(), /첫 convert: ids.conflicts 1/);
  assert.match(A.stopReasons({ baseline: rep(), first: rep(), second: rep({ ids: { conflicts: 2 } }) }).join(), /두 번째 convert: ids.conflicts 2/);
});

test('stopReasons: publicTier F > 0 이면 멈춘다', () => {
  assert.match(A.stopReasons({ baseline: rep(), first: rep(), second: rep({ publicTier: { F: 3 } }) }).join(), /publicTier F\(판단 불가\) 3/);
});

test('stopReasons: sggUnresolved 는 직전 판보다 허용 폭(2) 넘게 늘면 멈춘다', () => {
  assert.equal(A.SGG_UNRESOLVED_ALLOW, 2);
  assert.deepEqual(A.stopReasons({ baseline: rep({ sggUnresolved: 1 }), first: rep(), second: rep({ sggUnresolved: 3 }) }), []);
  assert.match(A.stopReasons({ baseline: rep({ sggUnresolved: 1 }), first: rep(), second: rep({ sggUnresolved: 4 }) }).join(), /sggUnresolved 1 → 4/);
});

test('stopReasons: 묶음 수가 직전 대비 ±20% 를 넘으면 멈춘다(경계 20% 는 통과)', () => {
  const s = (g) => A.stopReasons({ baseline: rep({ groups: 100 }), first: rep(), second: rep({ groups: g }) });
  assert.deepEqual(s(120), []);
  assert.deepEqual(s(80), []);
  assert.match(s(121).join(), /묶음 수 100 → 121/);
  assert.match(s(79).join(), /묶음 수 100 → 79/);
});

test('stopReasons: 보고를 못 읽었거나 검증 통과가 없거나 기준선이 없으면 멈춘다', () => {
  assert.match(A.stopReasons({ baseline: null, first: rep(), second: rep() }).join(), /기준선/);
  assert.match(A.stopReasons({ baseline: rep(), first: null, second: rep() }).join(), /첫 convert 의 home 보고/);
  assert.match(A.stopReasons({ baseline: rep(), first: rep(), second: rep({}, false) }).join(), /검증 통과/);
});

test('parseConvertReport: 표 줄 사이의 home 보고 JSON 줄과 검증 통과를 읽는다', () => {
  const text = ['projects           398', `건축HUB 대용량·공고 ${JSON.stringify({ records: 1, home: { groups: 381, ids: { conflicts: 0 }, publicTier: { F: 0 }, sggUnresolved: 0 } })}`, '검증 통과', '표 18개를 썼다'].join('\n');
  const r = A.parseConvertReport(text);
  assert.equal(r.home.groups, 381);
  assert.equal(r.validated, true);
  assert.equal(A.parseConvertReport('projects 3\n검증 실패'), null);
});

test('parsePgTime·editionOf·kstDate: manifest until → 판 이름(UTC 초)·한국 날짜', () => {
  const d = A.parsePgTime('2026-10-22 13:35:44.7232+00');
  assert.equal(d.toISOString(), '2026-10-22T13:35:44.723Z');
  assert.equal(A.editionOf(d), '20261022T133544Z');
  assert.equal(A.kstDate(d), '2026-10-22');
  assert.equal(A.kstDate(A.parsePgTime('2026-10-31 15:30:00+00')), '2026-11-01');   // 한국시간으로 넘어간 날
  assert.equal(A.parsePgTime('2026-10-21 15:00:00+00').toISOString(), '2026-10-21T15:00:00.000Z');
});

test('decideMonth: 같은 달 · 늦고 이번 달이면 새 달 · 늦은데 이번 달이 아니면 멈춤 · 앞 달이면 멈춤', () => {
  const at = (s) => new Date(s);
  assert.deepEqual(A.decideMonth({ until: at('2026-10-22T13:35:44Z'), observedMonth: '2026-10', now: at('2026-11-09T03:00:00Z') }), { month: '2026-10', newMonth: false });
  assert.deepEqual(A.decideMonth({ until: at('2026-11-08T13:00:00Z'), observedMonth: '2026-10', now: at('2026-11-09T03:00:00Z') }), { month: '2026-11', newMonth: true });
  // until 10-31 16:00Z = 한국 11-01 → 11월(이번 달 11월) → 새 달
  assert.deepEqual(A.decideMonth({ until: at('2026-10-31T16:00:00Z'), observedMonth: '2026-10', now: at('2026-11-02T00:00:00Z') }), { month: '2026-11', newMonth: true });
  assert.match(A.decideMonth({ until: at('2026-11-20T00:00:00Z'), observedMonth: '2026-10', now: at('2026-12-01T00:00:00Z') }).stop, /이번 달\(2026-12\)이 아니다/);
  assert.match(A.decideMonth({ until: at('2026-10-20T00:00:00Z'), observedMonth: '2026-11', now: at('2026-11-09T00:00:00Z') }).stop, /닫힌 달/);
});

test('parseTestCounts: node --test 요약 줄', () => {
  assert.deepEqual(A.parseTestCounts('ℹ tests 10\nℹ pass 9\nℹ fail 0\nℹ cancelled 0\nℹ skipped 1\n'), { tests: 10, pass: 9, fail: 0, skipped: 1, cancelled: 0 });
});

test('mask: DB 주소·Supabase 비밀키·URL 키 값을 가린다', () => {
  const s = A.mask('pg_dump postgresql://u:pw@host:5432/db sb_secret_abcDEF12 https://x/api?serviceKey=ABC123&x=1');
  assert.doesNotMatch(s, /pw@|abcDEF12|ABC123/);
});

/* ---------- 사전 점검 ---------- */
function fakeGit({ branch = 'main', head = 'a1', origin = 'a1', cached = 0, dirty = '', fetch = 0 } = {}) {
  const calls = [];
  const runner = (cmd, args) => {
    calls.push([path.basename(cmd), ...args].join(' '));
    if (cmd === 'git') {
      if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return { code: 0, stdout: `${branch}\n`, stderr: '' };
      if (args[0] === 'rev-parse') return { code: 0, stdout: `${args[1] === 'HEAD' ? head : origin}\n`, stderr: '' };
      if (args[0] === 'fetch') return { code: fetch, stdout: '', stderr: fetch ? 'network' : '' };
      if (args[0] === 'diff') return { code: cached, stdout: '', stderr: '' };
      if (args[0] === 'status') return { code: 0, stdout: dirty, stderr: '' };
    }
    return { code: 0, stdout: '', stderr: '' };
  };
  return { runner, calls };
}
const ENV_OK = 'SUPABASE_DB_URL=postgresql://x\nSUPABASE_SECRET_KEY=s\nNEXT_PUBLIC_SUPABASE_URL=u\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=p\n';

test('preflight: main·origin 같음·색인 빔·키 있음·반영 경로 깨끗이면 문제 없음, git fetch 를 부른다', () => {
  const f = fakeGit();
  assert.deepEqual(A.preflight({ root: '/r', runner: f.runner, envText: ENV_OK, month: '2026-10', newMonth: false }), []);
  assert.ok(f.calls.includes('git fetch -q origin'));
  const st = f.calls.find((c) => c.startsWith('git status'));
  for (const p of ['schemas/ledger-2026-10/tables', 'schemas/ledger-2026-10/raw/home', 'schemas/ledger-2026-10/raw/home-api', 'registry', 'data/board']) assert.ok(st.includes(p), p);
});

test('preflight: 브랜치·origin·색인·미커밋·키 이름 문제를 모두 적는다(키 값은 적지 않는다)', () => {
  const p = A.preflight({ root: '/r', runner: fakeGit({ branch: 'home-x', head: 'a1', origin: 'b2', cached: 1, dirty: ' M data/board/ledger-board.json\n' }).runner, envText: 'SUPABASE_DB_URL=postgresql://secret\n', month: '2026-10', newMonth: false }).join('\n');
  assert.match(p, /main 브랜치가 아니다/);
  assert.match(p, /origin\/main/);
  assert.match(p, /색인/);
  assert.match(p, /미커밋 변경 1개: M data\/board\/ledger-board.json/);
  assert.match(p, /키가 없다: SUPABASE_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(p, /secret/);
});

test('preflight: 새 달이면 DATA_GO_KR_KEY 도 요구하고 달 폴더 전체를 본다 · .env.local 이 없으면 문제', () => {
  const f = fakeGit();
  assert.match(A.preflight({ root: '/r', runner: f.runner, envText: ENV_OK, month: '2026-11', newMonth: true }).join(), /DATA_GO_KR_KEY/);
  assert.ok(f.calls.find((c) => c.startsWith('git status')).includes('schemas/ledger-2026-11 '));
  assert.match(A.preflight({ root: '/r', runner: fakeGit().runner, envText: null, month: '2026-10', newMonth: false }).join(), /\.env\.local 이 없다/);
});

/* ---------- 실제 모드 단계 ---------- */
function fixture() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'home-apply-test-'));
  const root = path.join(work, 'root'), copy = path.join(work, 'copy');
  for (const d of [root, copy]) fs.mkdirSync(path.join(d, 'data/board'), { recursive: true });
  fs.mkdirSync(path.join(root, '.vercel'));
  fs.writeFileSync(path.join(root, '.vercel/project.json'), '{}');
  fs.writeFileSync(path.join(copy, 'data/board/x.json'), '{"new":1}\n');
  fs.writeFileSync(path.join(root, 'data/board/gone.json'), '{}\n');
  const report = { steps: [], rollback: {}, applyPaths: ['data/board'] };
  const ctx = { root, copy, work, month: '2026-10', edition: '20261022T133544Z', untilDate: '2026-10-22', files: { changed: ['data/board/x.json'], deleted: ['data/board/gone.json'] },
    envText: 'SUPABASE_DB_URL=postgresql://u:pw@h/db\n', report, summary: '시험', backupDir: path.join(work, 'backups') };
  return { work, root, copy, ctx, report };
}
function fakeRunner({ failOn } = {}) {
  const calls = [];
  const runner = (cmd, args = [], opts = {}) => {
    const line = [path.basename(cmd), ...args].join(' ');
    calls.push({ line, opts });
    if (failOn && line.includes(failOn)) return { code: 1, stdout: '', stderr: `${failOn} 실패함` };
    const ok = (stdout = '') => ({ code: 0, stdout, stderr: '' });
    if (line.startsWith('pg_restore')) return ok('x TABLE DATA\n'.repeat(25));
    if (line.includes('supabase-load.js')) return ok('2026-10 판 발행: run 50 · projects 398\n');
    if (line.includes('supabase-verify.js')) return ok('…\n모두 통과\n');
    if (line.startsWith('git rev-parse HEAD')) return ok('abc1234def\n');
    if (line.startsWith('vercel deploy')) return ok('https://the-housing-xyz123.vercel.app\n');
    if (line.startsWith('vercel inspect')) return ok('url https://the-housing-old999.vercel.app\n');
    if (line.startsWith('curl')) return ok('<meta name="board-source" content="supabase:2026-10:run50"/>');
    return ok();
  };
  return { runner, calls };
}
const ORDER = ['결과 옮기기', '백업(pg_dump)', '원본 Storage(raw-store push)', '적재(supabase-load)', '검증(supabase-verify)', '커밋', '운영 배포(vercel)', '푸시', '운영 board-source 확인'];

test('realSteps: 옮기기 → 백업 → Storage → 적재 → 검증 → 커밋 → 배포 → 푸시 → board-source 순서, 명령 인자', () => {
  const { ctx, report, root } = fixture();
  const f = fakeRunner();
  const res = A.runSteps(A.realSteps(ctx, f.runner), report, () => {});
  assert.deepEqual(res, { ok: true });
  assert.deepEqual(report.steps.map((s) => s.name), ORDER);
  assert.equal(fs.readFileSync(path.join(root, 'data/board/x.json'), 'utf8'), '{"new":1}\n');
  assert.equal(fs.existsSync(path.join(root, 'data/board/gone.json')), false);
  const L = f.calls.map((c) => c.line);
  const idx = (s) => L.findIndex((l) => l.startsWith(s));
  assert.ok(idx('pg_dump') < idx('node tools/ledger/raw-store.js push --month 2026-10 --only raw/home'));
  assert.ok(idx('node tools/ledger/raw-store.js') < idx('node tools/ledger/supabase-load.js --month 2026-10 --skip-raw'));
  assert.ok(idx('node tools/ledger/supabase-verify.js --month 2026-10') < idx('git commit'));
  assert.ok(idx('git commit') < idx('vercel deploy --prod --yes'));
  assert.ok(idx('vercel deploy') < idx('git push origin main'));
  assert.ok(idx('git push') < idx('curl'));
  assert.deepEqual(f.calls.find((c) => c.line.startsWith('pg_dump')).line.split(' ').slice(2), ['-n', 'ledger', '-n', 'ledger_admin', '-n', 'api', '-Fc', '-f', f.calls.find((c) => c.line.startsWith('pg_dump')).line.split(' ').at(-1)]);
  assert.equal(f.calls.find((c) => c.line.includes('supabase-load')).opts.env.BOARD_REVALIDATE_URL, '');   // 운영 캐시를 비우지 않게
  assert.ok(!Object.keys(f.calls.find((c) => c.line.startsWith('vercel deploy')).opts.env).some((k) => k.startsWith('VERCEL_')));
  const commit = L.find((l) => l.startsWith('git commit'));
  assert.match(commit, /-- data\/board\/x\.json data\/board\/gone\.json$/);   // 이번 반영 파일만
  const msgFile = commit.split(' ')[3];
  assert.match(fs.readFileSync(msgFile, 'utf8'), /Co-Authored-By: Claude Opus 5\.5 <noreply@anthropic\.com>\n$/);
  assert.ok(!JSON.stringify(report).includes('pw@'), '보고에 DB 주소가 남지 않는다');
  assert.equal(report.rollback.previousDeployment, 'https://the-housing-old999.vercel.app');
  assert.equal(ctx.deployment, 'https://the-housing-xyz123.vercel.app');
});

test('realSteps: 검증이 실패하면 거기서 멈추고 커밋·배포·푸시를 부르지 않는다, 되돌리기에 백업 경로', () => {
  const { ctx, report } = fixture();
  const f = fakeRunner({ failOn: 'supabase-verify' });
  const res = A.runSteps(A.realSteps(ctx, f.runner), report, () => {});
  assert.deepEqual(res, { ok: false, failed: '검증(supabase-verify)' });
  assert.deepEqual(report.steps.map((s) => s.name), ORDER.slice(0, 5));
  assert.ok(!f.calls.some((c) => /^(git commit|git push|vercel deploy|curl)/.test(c.line)));
  const text = A.rollbackText(report, ctx.root);
  assert.match(text, /backups\/ledger-before-home-20261022T133544Z-\d{12}\.dump/);
  assert.match(text, /커밋 전/);
});

test('realSteps: 백업 TABLE DATA 가 모자라면 적재 전에 멈춘다 · 운영 board-source 가 새 run 이 아니면 실패', () => {
  const a = fixture(), f1 = fakeRunner();
  const r1 = (cmd, args, o) => (path.basename(cmd) === 'pg_restore' ? { code: 0, stdout: 'TABLE DATA\n', stderr: '' } : f1.runner(cmd, args, o));
  assert.deepEqual(A.runSteps(A.realSteps(a.ctx, r1), a.report, () => {}), { ok: false, failed: '백업(pg_dump)' });
  assert.ok(!f1.calls.some((c) => c.line.includes('supabase-load')));
  const b = fixture(), f2 = fakeRunner();
  const r2 = (cmd, args, o) => (cmd === 'curl' ? { code: 0, stdout: 'content="supabase:2026-10:run49"', stderr: '' } : f2.runner(cmd, args, o));
  const res = A.runSteps(A.realSteps(b.ctx, r2), b.report, () => {});
  assert.deepEqual(res, { ok: false, failed: '운영 board-source 확인' });
  assert.match(A.rollbackText(b.report, b.ctx.root), /git revert abc1234[\s\S]*vercel rollback https:\/\/the-housing-old999/);
});

test('applyPaths: 열린 달은 표·매핑·HOME 판·HOME 응답·달 manifest, 새 달은 달 폴더 전체 + registry·data/board', () => {
  assert.deepEqual(A.applyPaths('2026-10', false), ['schemas/ledger-2026-10/tables', 'schemas/ledger-2026-10/mappings', 'schemas/ledger-2026-10/raw/home', 'schemas/ledger-2026-10/raw/home-api', 'schemas/ledger-2026-10/manifest.json', 'registry', 'data/board', 'assets/citizen/index.html', 'docs/design/대국민-모드-시안.html']);
  assert.deepEqual(A.applyPaths('2026-11', true), ['schemas/ledger-2026-11', 'registry', 'data/board', 'assets/citizen/index.html', 'docs/design/대국민-모드-시안.html']);
});

test('parseArgs: --in 필수, 모르는 인자 거부', () => {
  assert.deepEqual(A.parseArgs(['--in', 'p', '--dry-run', '--base', '20261021T212310Z']), { in: 'p', dryRun: true, base: '20261021T212310Z' });
  assert.throws(() => A.parseArgs(['--dry-run']), /--in/);
  assert.throws(() => A.parseArgs(['--in', 'p', '--force']), /모르는 인자/);
});

test('goldenYearCoverage: golden/ 에 없고 api/ 에 있으면 golden-in/S3-year-coverage.json 으로 넣고, golden/ 에 있으면 건드리지 않는다', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-')), pkg = path.join(d, 'pkg'), gin = path.join(d, 'golden-in');
  fs.mkdirSync(path.join(pkg, 'api'), { recursive: true });
  fs.writeFileSync(path.join(pkg, 'api/sources-year-coverage.json'), '{"years":[2026],"rows":[]}');
  assert.ok(A.goldenYearCoverage(['api/sources-year-coverage.json', 'golden/S1-view-policy.json'], gin, pkg));
  assert.equal(fs.readFileSync(path.join(gin, 'S3-year-coverage.json'), 'utf8'), '{"years":[2026],"rows":[]}');
  const gin2 = path.join(d, 'g2');
  assert.equal(A.goldenYearCoverage(['api/sources-year-coverage.json', 'golden/S3-year-coverage.json'], gin2, pkg), null);
  assert.equal(A.goldenYearCoverage(['golden/S1-view-policy.json'], gin2, pkg), null);
  assert.ok(!fs.existsSync(gin2));
});

test('CITIZEN_BUILD: 생성기 끝 — python3 build_data.py data.json → node build.js, 위치는 tools/design/public-mock', () => {
  assert.equal(A.CITIZEN_DIR, 'tools/design/public-mock');
  assert.deepEqual(A.CITIZEN_BUILD, [['python3', ['build_data.py', 'data.json']], ['node', ['build.js']]]);
  assert.ok(A.GENERATORS('2026-11').at(-1)[0] === 'home-sources.js');
});

test('GENERATORS: trend.js(--close 없음) → board.js 맨 앞(소급 행을 합친 판으로), home-lite.js --offline 은 home-map.js 바로 뒤, 달은 모두 --month', () => {
  const g = A.GENERATORS('2026-11'), names = g.map((x) => x[0]);
  assert.deepEqual(g.slice(0, 2), [['trend.js', '--month', '2026-11'], ['board.js', '--month', '2026-11']]);
  assert.deepEqual(g[names.indexOf('home-map.js') + 1], ['home-lite.js', '--month', '2026-11', '--offline']);
  assert.ok(!g.flat().includes('--close'));
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(names, ['trend.js', 'board.js', 'home-projects.js', 'home-map.js', 'home-lite.js', 'policy-progress.js', 'home-lh-plan.js', 'home-board.js', 'map-overview.js', 'projects-index.js', 'region-supply.js', 'requirements.js', 'area-facts.js', 'home-sources.js']);
});

test('notIgnored: git check-ignore 로 무시되는 파일(data.json)만 뺀다 · 빈 목록이면 git 을 부르지 않는다', () => {
  const calls = [];
  const runner = (cmd, args, o) => { calls.push([cmd, args, o]); return { code: 0, stdout: 'tools/design/public-mock/data.json\n', stderr: '' }; };
  assert.deepEqual(A.notIgnored(['tools/design/public-mock/data.json', 'app/x.tsx'], runner, '/c'), ['app/x.tsx']);
  assert.deepEqual(calls[0].slice(0, 2), ['git', ['check-ignore', '--stdin']]);
  assert.equal(calls[0][2].cwd, '/c');
  assert.deepEqual(A.notIgnored([], runner, '/c'), []);
  assert.equal(calls.length, 1);
});
