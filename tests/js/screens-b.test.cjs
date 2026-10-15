'use strict';
/* 독립 디자인 평가(26/40) 화면 고침 B(2026-10-15) — 숫자 신뢰·드릴다운:
   1 범위 칩(components/ui/scope-chip) · 정책 목표 카드 분리(9·7 행 한 번) · 2 지시 카드 '목록 ›'(목록 건수 = 카드 숫자) · 3 자동 넘김 멈춤(WCAG 2.2.2)
   4 지역 공급 시군구 거르기(구 합침, 서버 렌더) · 5 CSV 현재 예정 칸·비고 분리 · 6 목록으로 바로가기 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('node:module').registerHooks({ resolve(s, c, n) { try { return n(s, c); } catch (e) { if (/^\.\.?\//.test(s)) return n(`${s}.ts`, c); throw e; } } });
const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const V = require('../../lib/board/projects-view.ts');
const L = require('../../lib/board/projects-list.ts');
const S = require('../../lib/grid/spec.ts');
const R = require('../../lib/board/region.ts');
const M = require('../../lib/board/metro-overview.ts');
const { makeDirectives } = require('../../lib/board/directives.ts');
const MAP = require('../../data/board/ledger-map.json');
const IDX = require('../../data/board/projects-index.json');
const PP = require('../../data/board/policy-progress.json');
const BOARD = require('../../data/board/ledger-board.json');
const CAL = require('../../data/board/region-calendar.json');
const regionMap = require('../../data/board/region-map.json');

const rows = V.rowsOf(MAP.bySgg, IDX.projects, IDX.sgg);
const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
const fctx = { policies: IDX.policies, programs: IDX.programs, sidoOk: () => true, guOf: M.guOf };
const T = { areas: M.METRO_AREAS, sidoShort: M.SIDO_SHORT, guOf: M.guOf };
const sido = (c) => ({ 11: '서울', 28: '인천', 41: '경기' })[c] ?? c;
const qctx = { pp: PP, policies: IDX.policies, observedMonth: IDX.observedMonth, sidoName: sido, sggName: (c) => c };
/* '/projects?…' → 사업 화면과 같은 거르기로 센 목록(머리의 건수·계획 호수) */
const listOf = (href) => {
  const u = new URL(href, 'http://x');
  assert.equal(u.pathname, '/projects', href);
  const l = V.applyFilters(rows, V.parseFilters(Object.fromEntries(u.searchParams), fctx));
  return { n: l.length, units: V.summaryOf(l).units };
};
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

test('1 범위 칩: 공용 컴포넌트(범위 + 출처, 풀기 ×) — 사업 요약·종합상황판 패널·지역 공급 패널 머리에', () => {
  const chip = read('components/ui/scope-chip.tsx');
  assert.match(chip, /export type ScopeSource = '사업 원장' \| '정책 진행 자료' \| '통계누리'/);
  assert.match(chip, /data-slot="scope-chip"/);
  assert.match(chip, /aria-label=\{`\$\{scope\} 거르기 풀기`\}/);
  const page = read('app/(dashboard)/projects/page.tsx');
  assert.match(page, /<ScopeChip scope="정책 전체" source="정책 진행 자료"/, '정책 목표 카드: 정책 전체 · 정책 진행 자료(data-audit-1016 결함 1)');
  assert.match(page, /<ScopeChip scope=\{region\} source="사업 원장"/, '원장 요약: 거르기 범위(수도권·전국·시도·시군구) · 사업 원장');
  const board = read('components/board/Board.tsx');
  assert.match(board, /const ledgerChip = <ScopeChip scope=\{nation === '전국' \? '전국' : '일부 지역'\} source="사업 원장"/);
  for (const t of ['월별 공급 파동', '시도 \\{L\\.regions\\.length\\}곳', '지연·주의 추이', '\\{AHEAD_COMPLETION\\}', '기관별 진행']) assert.match(board, new RegExp(`>${t}</h2>\\n\\s*<InfoTip [\\s\\S]*?</InfoTip>\\n\\s*\\{ledgerChip\\}`), t);   // 제목 바로 옆 (i)(2026-10-16 3차)
  assert.match(read('components/board/RealPanels.tsx'), />월별 실적 흐름<\/h2>\n\s*<InfoTip [\s\S]*?<\/InfoTip>\n\s*<ScopeChip scope="전국" source="통계누리"/);
  const region = read('app/(dashboard)/region/page.tsx');
  assert.match(region, /scope=\{<ScopeChip scope=\{scopeName\} source="사업 원장"[^\n]*clearHref=\{sgg \? href\(\{ sgg: null, m: null \}\) : undefined\}/, '앞으로 12개월: 시군구 칩 + ×');
  assert.match(read('components/region/Annual.tsx'), /<ScopeChip scope=\{rname\} source="통계누리"/);
  assert.match(read('components/region/Cond.tsx'), /<ScopeChip scope=\{name\} source="KOSIS·SGIS"/);
  assert.doesNotMatch(read('components/projects/Summary.tsx'), /<Badge/, "옛 'Badge 범위' 표기(정책 전체 · 호 / 사업 원장 · …)는 범위 칩으로");
});

test('1 정책 목표 대비는 별도 카드, 9·7 행은 한 번만(왼쪽 ①~⑥ 표 유지 · 접힘에는 다른 정책 줄만)', () => {
  const page = read('app/(dashboard)/projects/page.tsx');
  assert.match(page, /const cmpLines = whole\?\.stages \? lines\.filter\(\(l\) => l\.policy\.key !== \(f\.policy \? f\.policy\.key : '97'\)\) : lines;/);
  const pc = page.slice(page.indexOf('const policyCard'), page.indexOf('const ledgerCard'));
  assert.match(pc, /<Card render=\{<section aria-label="정책 목표 대비" \/>\}/);
  assert.match(pc, /<PolicyCompare lines=\{cmpLines\}/);
  assert.doesNotMatch(page.slice(page.indexOf('const ledgerCard'), page.indexOf('const summary')), /PolicyCompare|whole/, '원장 요약 카드에는 정책 숫자가 없다');
  for (const f of [{}, { metro: true }, { sido: '41' }, { policy: IDX.policies.find((p) => p.key === '97') }]) {
    const q = V.questionsOf(rows, f, qctx), lines = V.compareLines(PP, IDX.policies, rows, f.policy ? [f.policy.key] : IDX.policies.map((p) => p.key));
    const whole = q[0].stages ? q[0] : null;
    const cmp = whole ? lines.filter((l) => l.policy.key !== (f.policy ? f.policy.key : '97')) : lines;
    const n97 = (whole && /^9·7/.test(whole.q) ? 1 : 0) + cmp.filter((l) => l.policy.key === '97').length;
    assert.equal(n97, 1, JSON.stringify(Object.keys(f)));
    assert.equal(whole.q, '9·7 대책 목표 대비', '범위는 이름이 아니라 칩');
  }
});

test('2 지시 카드 목록 ›: 목록 머리 건수(·계획 호수) = 카드 숫자(같은 lib 계산)', () => {
  const D = makeDirectives({ sourceCount: 30, stageNames: [...V.BOARD_NAMES], ledger: BOARD, start: { year: '2026', upto: 8, cum: 1, cumLy: 1 }, bottleneck: V.bottleneckOf });
  assert.ok(D.every((d) => d.list && d.list.href && d.list.title), '카드마다 목록 링크');
  const [start, sites, neck, ahead, delay, src] = D;
  /* 사업장별 현황판: 사업 2,317건 = 목록 2,317건 */
  assert.equal(listOf(sites.list.href).n, BOARD.scope.projects);
  assert.equal(sites.big, BOARD.scope.projects.toLocaleString('en-US'));
  /* 일정 지연 관리: 지연 2건 = 지연(장기 포함) 목록 2건(?status=delay 는 6~12개월만이라 0건 — 장기 2건이 빠진다) */
  assert.equal(delay.list.href, '/projects?sido=all&status=late');
  assert.equal(listOf(delay.list.href).n, BOARD.judgment.delay.projects);
  assert.equal(BOARD.judgment.delay.projects, 2);
  assert.equal(listOf('/projects?sido=all&status=delay').n, 0, '옛 거르기로는 맞지 않았다');
  /* 병목: 착공 1,666호 = 병목 단계 지연(장기 포함) 목록의 계획 호수 */
  const b = V.bottleneckOf(BOARD.delayByStage);
  assert.equal(neck.list.href, `/projects?sido=all&stage=${b.i}&status=late`);
  assert.equal(listOf(neck.list.href).units, b.units);
  assert.equal(neck.big, b.units.toLocaleString('en-US'));
  /* 예측가능성: 사업 목록에 12개월 거르기가 없어 지역 공급(전국 · 준공)으로 — 같은 건수·호수 */
  assert.equal(ahead.list.href, '/region?sido=all&kind=COMPLETION');
  const cal = R.aheadAll(CAL, '', sido).filter((e) => e.type === 'COMPLETION');
  assert.equal(sum(cal, (e) => e.units), sum(BOARD.upcoming, (m) => m.units));
  assert.equal(cal.length, sum(BOARD.upcoming, (m) => m.projects));
  assert.match(ahead.list.title, /같은 범위·같은 값/);
  /* 거를 수 없는 카드는 가장 가까운 목록 + title 에 차이 */
  assert.equal(start.list.href, '/projects?sido=all&stage=2');
  assert.match(start.list.title, /가장 가까운 목록\(건수가 다름\)/);
  assert.equal(src.list.href, '/sources');
  /* 선택 시점 패널: 확인 필요(후보) 건수 = 후보 목록 */
  const c = BOARD.judgment.candidate;
  assert.equal(listOf('/projects?sido=all&status=review').n, c.ok.projects + c.caution.projects + c.delay.projects);
  assert.equal(c.delay.projects, 313);
  /* 핵심 질문 '어떤 사업이 늦어지는가'·'어디서 막혀 있는가'도 같은 거르기(late) */
  const q = Object.fromEntries(V.questionsOf(rows, V.parseFilters({ sido: 'all' }, fctx), qctx).map((x) => [x.q, x]));
  assert.equal(String(listOf(q['어떤 사업이 늦어지는가'].href).n), q['어떤 사업이 늦어지는가'].value);
  assert.equal(listOf(q['어디서 막혀 있는가'].href).units, b.units);
  const board = read('components/board/Board.tsx');
  assert.match(board, /<Link href=\{x\.list\.href\} title=\{x\.list\.title\} aria-label=\{`\$\{x\.t\} \$\{x\.list\.text \?\? '목록'\}`\} data-slot="board-dir-list"/);
  assert.ok(board.indexOf('data-slot="board-dir-list"') > board.indexOf('</button>', board.indexOf('data-slot="board-dir"')), '링크는 단추 밖(형제) — 단추 안에 링크를 넣지 않는다');
  assert.match(board, /<PanelLink href=\{`\/projects\?sido=all&stage=\$\{bk\}&status=late`\}/);
  assert.match(board, /<PanelLink href="\/projects\?sido=all&status=review-late"/);   // 후보 계산 313 = 그 목록(data-audit-1016 후속 1)
  /* 사업 화면 상태 메뉴·목록 이름에도 '지연(장기 포함)' */
  const page = read('app/(dashboard)/projects/page.tsx');
  assert.match(page, /\{ href: at\(\{ status: 'late' \}\), label: DELAY_GROUP, on: f\.status === 'late'/);
  assert.match(page, /f\.status === 'late' \? DELAY_GROUP/);
});

test('3 지시 카드 자동 넘김: 멈춤 단추(aria-label·aria-pressed) · 마우스·초점이 있으면 멈춤 · 움직임 줄이기면 처음부터 멈춤', () => {
  const board = read('components/board/Board.tsx');
  assert.match(board, /data-slot="dir-pause" aria-controls="board-dirs" aria-pressed=\{!tour\} aria-label="지시 카드 자동 넘김 멈춤"/);
  assert.match(board, /onClick=\{\(\) => setTour\(\(t\) => !t\)\}/);
  assert.match(board, /<section id="board-dirs" aria-label="총리 지시 6건"\n\s*onMouseEnter=\{\(\) => setHold\(true\)\} onMouseLeave=\{\(\) => setHold\(false\)\}\n\s*onFocus=\{\(\) => setHold\(true\)\} onBlur=\{\(e\) => \{ if \(!e\.currentTarget\.contains\(e\.relatedTarget as Node \| null\)\) setHold\(false\); \}\}>/);
  assert.match(board, /const run = tour && !hold;/);
  assert.match(board, /if \(!run\) return;\n\s*const id = setInterval/, '멈추면 틱도 멈춘다');
  assert.match(board, /const \[tour, setTour\] = useState\(false\);/, '서버 렌더·움직임 줄이기는 멈춘 채 시작');
  assert.match(board, /useEffect\(\(\) => \{ setTour\(!window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches\); \}, \[\]\);/);
});

test('4 지역 공급 시군구 거르기: 고양시(41280) = 덕양·일산동·일산서 구 합 · 안산(41270) = 시 + 구 · 이름 코드 = id 코드', () => {
  const metro = R.aheadAll(CAL, 'metro', sido);
  for (const e of metro) assert.equal(R.entrySgg(e, e.sd, T), e.id.slice(4, 9), `${e.id} ${e.sgg}`);
  for (const unit of ['41280', '41270', '41130', '41110', '11680', '28245']) {
    const got = metro.filter((e) => R.inSgg(e, unit, T));
    const codes = [unit, ...M.guOf(unit)];
    const want = metro.filter((e) => codes.includes(R.entrySgg(e, e.sd, T)));
    assert.deepEqual(got.map((e) => e.k), want.map((e) => e.k), unit);
    assert.equal(sum(got, (e) => e.units), sum(codes, (c) => sum(metro.filter((e) => R.entrySgg(e, e.sd, T) === c), (e) => e.units)), `${unit} 합계 = 시군구(구) 합`);
  }
  assert.deepEqual(M.guOf('41280'), ['41281', '41285', '41287']);
  assert.ok(metro.filter((e) => R.inSgg(e, '41270', T)).length >= 2, '안산: 시 코드 + 구 코드 사업');
  const page = read('app/(dashboard)/region/page.tsx');
  assert.match(page, /const sgg = parseSgg\(regionMap, sido, SGG_TABLE, q\.sgg\);/, '서버 렌더에서 ?sgg= 를 읽는다');
  assert.match(page, /const all = aheadAll\(calendar, sido, sidoName\)\.filter\(\(e\) => !sgg \|\| inSgg\(e, sgg, SGG_TABLE\)\);/, '달별 막대·목록·합계·종류 칩이 같은 거른 목록');
  assert.match(page, /const pf: Filters = sgg \? \{ sgg, gu: guOf\(sgg\) \}/, '사업 화면 연결도 그 시군구');
  assert.match(page, /\{list\.length \|\| sgg \? \(/, '고른 시군구에 예정이 없어도 지도는 남는다(다른 면을 고를 수 있게)');
  assert.match(read('components/region/Annual.tsx'), /note=\{sggName \? \{ text: '시도 단위 자료'/);
  assert.match(read('components/region/Cond.tsx'), /note=\{sggName \? \{ text: '시도 단위 자료'/);
  assert.equal(R.parseSgg(regionMap, '41', T, '41280'), '41280');
});

test('5 CSV: 현재 예정 칸은 날짜·사건만, 예정일 지남·실제·원천 날짜 다름은 비고(괄호 겹침 없음)', () => {
  const f = V.parseFilters({ sido: 'all' }, fctx), list = V.listOrder(V.applyFilters(rows, f)), grid = L.listRows(list, f, null, sido);
  const cols = L.csvCols(L.dropBlank(L.LIST_COLS, grid).cols), out = L.csvRows(grid);
  const at = Object.fromEntries(out.map((r) => [r.id, r]));
  const cell = (id, k) => S.csvValue(at[id].c[k], cols.find((c) => c.key === k).kind);
  assert.equal(cell('PRJ-28290-0058', 'next'), '2025.02 준공');
  assert.match(cell('PRJ-28290-0058', 'note'), /^원천 날짜 다름\(LH 2028\.12\) — HOME 2025\.02\.18 · LH 준공 예정 파일 2028\.12\.31 · 판정은 HOME 날짜로$/, '꼬리표를 비고에 다시 쓰지 않는다');
  assert.equal(cell('PRJ-28245-0055', 'next'), '2026.10 준공');
  assert.match(cell('PRJ-28245-0055', 'note'), /^예정일 지남 · 원천 날짜 다름\(LH 2026\.10\.31\) — /);
  assert.equal(cell('PRJ-41131-0048', 'next'), '2026.10 준공');
  assert.equal(cell('PRJ-41131-0048', 'note'), '예정일 지남');
  const csv = S.toCsv(cols, out);
  assert.doesNotMatch(csv, /(준공|착공|모집|입주|인허가) \(/, '현재 예정 칸에 괄호 꼬리표 없음');
  assert.equal(csv.split('\r\n').filter((l) => l.includes('원천 날짜 다름(')).length, 71, '원천 날짜 다름은 비고에 그대로 71건');
  /* 화면 표 칸은 그대로(꼬리표) */
  assert.equal(L.nextCell(byId['PRJ-28290-0058']).tag, '원천 날짜 다름(LH 2028.12)');
});

test('6 목록으로 바로가기: 요약 앞, 평소 숨김·초점 때 보임, 사업 목록 첫 행 링크로 초점', () => {
  const page = read('app/(dashboard)/projects/page.tsx');
  assert.match(page, /<Page>\n\s*\{list\.length \? <SkipToList \/> : null\}\n\s*<div className="contents print:hidden">/, 'Page 첫 요소(본문 바로가기 다음 첫 Tab)');
  assert.match(page, /<section id="projects-list" aria-label="사업 목록" \/>/);
  const skip = read('components/projects/SkipToList.tsx');
  assert.match(skip, /href="#projects-list"/);
  assert.match(skip, /document\.querySelector<HTMLElement>\('table\[aria-label="사업 목록"\] tbody a'\)/);
  assert.match(skip, /sr-only [^"]*focus:not-sr-only/);
  assert.match(skip, />\n\s*목록으로 바로가기\n/);
});
