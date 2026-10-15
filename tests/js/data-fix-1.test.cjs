/* 데이터 표기 고침 1(/sources · /agency · /month): 고정 글자 대신 계산값, 건수, 표기 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const json = (f) => JSON.parse(read(f));

test('#1·#9 단계 연계 ①계획: 레지스트리 계획 단계 건수와 원장 범위는 넘긴 값으로 계산한다', () => {
  const { stageLinks } = require('../../lib/board/stage-links.ts');
  const { ACQUIRE } = require('../../lib/board/acquire.ts');
  const zero = new Proxy({}, { get: () => 0 });
  const mk = (registry, ledgerNote) => stageLinks({ regions: 3, sgg: 5, registryTotal: 278, registryRefs: 55, registry, bundle: {},
    molit: { permit: 1, start: 1, sale: 1, complete: 1, annual: 1 }, months: '2021-09~2026-08', lhBlocks: 351, lhAsOf: '2026-01-27', ledgerNote,
    catalog: zero, hubBasis: 0, permits: 0, permitsStarted: 0, permitsCompleted: 0, plat: 0, ledger: 0, lhNotices: 0, myhome: 0, myhomePnu: 0, stan: 0 }, ACQUIRE)[0];
  const plan = mk({ '01': 5, '02': 138 }, '원장 2026.10 · 전국');
  const reg = plan.rows.find((r) => r.data.startsWith('사업 레지스트리'));
  assert.match(reg.cut, /계획 단계\(01·02\) 143건/);
  assert.doesNotMatch(reg.cut, /0건/);
  assert.ok(plan.outcomes[0].lines.includes('지금 원장 2026.10 · 전국'));
  assert.ok(!plan.outcomes[0].lines.some((l) => l.includes('전국 아님')));
  assert.match(mk({ '02': 1 }, '원장 2026.11 · 전국 아님').outcomes[0].lines[0], /2026\.11 · 전국 아님/);
  const src = read('lib/board/stage-links.ts');
  assert.ok(!src.includes('전국 아님'), '고정 글자 없음');
  const page = read('app/(dashboard)/sources/page.tsx');
  assert.match(page, /ledgerNote: `원장 \$\{ledger\.observedMonth\.replace\('-', '\.'\)\} · \$\{nationOf\(ledger\)\}`/);
});

test('#1 실제 레지스트리: 계획(01·02) 단계는 143건이다', () => {
  const reg = json('registry/projects.json');
  const rows = Array.isArray(reg) ? reg : reg.projects;
  const list = Array.isArray(rows) ? rows : Object.values(rows);
  const n = list.filter((p) => ['01', '02'].includes(p.stageCode)).length;
  if (list.some((p) => p.stageCode)) assert.equal(n, 143);
});

test('#2 추가 확보 필요: 원장에서 쓰는 6건은 수집·연결됨(수집일 포함), 나머지 11건이 확보 필요', () => {
  const { ACQUIRE, ACQUIRE_ASOF } = require('../../lib/board/acquire.ts');
  const done = ACQUIRE.filter((a) => a.status === '수집·연결됨');
  assert.deepEqual(done.map((a) => a.id), ['A1', 'A2', 'A10', 'F1', 'F5', 'F6']);
  assert.deepEqual(Object.fromEntries(done.map((a) => [a.id, a.got])), { A1: '2026-10-13', A2: '2026-10-12', A10: '2026-10-12', F1: '2026-10-13', F5: '2026-09-29', F6: '2026-10-11' });
  assert.equal(ACQUIRE.length - done.length, 11);
  assert.equal(ACQUIRE.filter((a) => a.status !== '수집·연결됨' && a.kind === 'API').length, 8);
  assert.equal(ACQUIRE.filter((a) => a.status !== '수집·연결됨' && a.kind === '파일').length, 3);
  assert.ok(ACQUIRE_ASOF > '2026-10-10');
  /* 근거: 원장 judge.dataAsOf 에 A1·A2·A10·F6 이 있고 sources 에 F1·F5 가 있다 */
  const asOf = json('data/board/ledger-board.json').judge.dataAsOf;
  for (const id of ['15058530', '15057999', '15098547', '15111714']) assert.ok(asOf[`datagokr-${id}`], id);
  assert.ok(asOf['hub-bulk-bld-2026-08']);
  const { stageLinks } = require('../../lib/board/stage-links.ts');
  const zero = new Proxy({}, { get: () => 0 });
  const st = stageLinks({ regions: 3, sgg: 5, registryTotal: 1, registryRefs: 1, registry: {}, bundle: {}, molit: { permit: 1, start: 1, sale: 1, complete: 1, annual: 1 }, months: '', lhBlocks: 1, lhAsOf: '', ledgerNote: '', catalog: zero,
    hubBasis: 0, permits: 0, permitsStarted: 0, permitsCompleted: 0, plat: 0, ledger: 0, lhNotices: 0, myhome: 0, myhomePnu: 0, stan: 0 }, ACQUIRE);
  const plan = st[0].acquire;   // ①계획의 F5·F1 은 이미 수집·연결됨이라 세지 않는다
  assert.equal(plan.ext, 4);   // A9·F2·F3·A11 (F5·F1 은 수집·연결됨이라 뺀다)
});

test('#10·#8·#30 /sources 이름표: 사업 레지스트리(번호 발급)·수집 상태 구분·판정 시도', () => {
  const page = read('app/(dashboard)/sources/page.tsx');
  assert.match(page, /name: i\.id === 'ledger' \? '사업 레지스트리\(번호 발급\)'/);
  assert.match(read('lib/board/collection.ts'), /amount: '사업 레지스트리\(번호 발급\)'/);
  assert.match(read('components/sources/Collect.tsx'), /\(우리가 모은 원천 \{items\.length\} \+ 정책 진행 자료 \{hs\.sources\.length\}\)/);
  assert.match(page, /개 시도 모두/);
  assert.doesNotMatch(page, /`판정은 \$\{judgedSido\}만/);
  assert.ok(json('data/board/ledger-board.json').regions.every((r) => r.judged), '16곳 모두 판정');
});

test('#14 블록 수는 고유 블록(사업지구+블록), 파일 행은 행이라고 쓴다', () => {
  const lh = json('data/board/lh-completion.json');
  assert.equal(lh.blocks.length, 351);
  const uniq = (xs) => new Set(xs.map((b) => `${b.district}|${b.block}`)).size;
  assert.equal(uniq(lh.blocks), 278);
  const bs = (ym) => lh.blocks.filter((b) => b.date.startsWith(ym));
  assert.equal(uniq(bs('2026-10')), 2);
  assert.equal(bs('2026-10').length, 3);
  assert.equal(uniq(bs('2026-08')), 1);
  assert.match(read('app/(dashboard)/month/[id]/page.tsx'), /blockTotal\}블록/);
  const ag = read('app/(dashboard)/agency/[id]/page.tsx');
  assert.match(ag, /fmt\(blockTotal\)\}블록/);
  assert.doesNotMatch(ag, /blocks\.length\)\}건/);
  assert.match(read('app/(dashboard)/sources/page.tsx'), /전국 \$\{fmt\(blockCount\(lh\.blocks\)\)\}블록 중/);
  assert.doesNotMatch(read('lib/board/agencies.ts'), /351블록/);
  assert.match(read('lib/board/collection.ts'), /unit: '행\(블록×공급유형\)'/);
});

test('#15 하이픈 날짜는 점 표기, 월 제목 "2026년 10월"은 읽기 쉬운 제목 규칙(monthLabel)이라 그대로', () => {
  const ag = read('app/(dashboard)/agency/[id]/page.tsx'), mo = read('app/(dashboard)/month/[id]/page.tsx');
  assert.match(ag, /dotDates\(lh\.sourceAsOf\)/);
  assert.match(mo, /dotDates\(lh\.sourceAsOf\)/);
  assert.doesNotMatch(mo, /2026-07부터/);
  assert.match(read('app/(dashboard)/sources/page.tsx'), /dotDates\(ACQUIRE_ASOF\)/);
  assert.equal(require('../../lib/board/calc.ts').monthLabel('2026-10'), '2026년 10월');
});

test('#12 /agency/gh: 원장 GH 사업 4건을 보이고 사업 화면 기관 칩으로 잇는다', () => {
  const ag = read('app/(dashboard)/agency/[id]/page.tsx');
  assert.match(ag, /r\.agency === 'gh'/);
  assert.match(ag, /\/projects\?agency=gh/);
  assert.equal(Object.values(json('data/board/projects-index.json').projects).filter((p) => p.agency === 'gh').length, 4);
});

test('#20·#29 LH 준공 예정: 표 머리에 파일 기준일, 지난 달에는 파일상 예정 표기', () => {
  assert.match(read('app/(dashboard)/agency/[id]/page.tsx'), /· 파일 기준 \{dotDates\(lh\.sourceAsOf\)\}/);
  const mo = read('app/(dashboard)/month/[id]/page.tsx');
  assert.match(mo, /파일상 예정\(실제 준공 여부 미확인\)/);
  assert.match(mo, /ym < \(await getProjectsIndex\(\)\)\.observedMonth/);
});
