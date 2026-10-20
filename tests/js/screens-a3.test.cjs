'use strict';
/* 3차 화면 재평가(impeccable 2026-10-15, 28/40)의 '36/40 최소 변경' 중 화면 쪽을 고정한다:
   H4 같은 날짜 열 이름(현재 예정 · '경과 n개월' 꼬리표) · H1 서랍 단계 '지금' 한 칸 · H8 정책 목표 대비 접힘(핵심 한 줄)·첫 칸 범위 이름·초과 ·
   H7 사업 목록 CSV(화면 열·UTF-8 BOM)·지역 공급 막대·지도 원 키보드 초점 · H9 부산 동네 여건·인쇄 '점검 필요 n건 전부'·후보 원천 예정 ·
   H10 ⓘ(단계별 진행·정책 목표 대비·핵심 질문) · 접근성(본문 바로가기·인쇄 전용 숨김) · /agency/lh 는 종합상황판 아래.
   용어표는 tests/js/screens-terms.test.cjs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/* lib/board/projects-list.ts 는 같은 폴더 모듈을 확장자 없이 부른다(Next 와 같은 해석) — 시험에서만 '.ts' 를 붙여 찾는다 */
require('node:module').registerHooks({ resolve(s, c, n) { try { return n(s, c); } catch (e) { if (/^\.\.?\//.test(s)) return n(`${s}.ts`, c); throw e; } } });

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const V = require('../../lib/board/projects-view.ts');
const L = require('../../lib/board/projects-list.ts');
const G = require('../../lib/grid/spec.ts');
const R = require('../../lib/board/region.ts');
const { activeMenuId, DETAILS } = require('../../lib/shell/menu.ts');
const MAP = require('../../data/board/ledger-map.json');
const IDX = require('../../data/board/projects-index.json');
const PP = require('../../data/board/policy-progress.json');
const MOLIT = require('../../data/board/molit.json');
const calendar = require('../../data/board/region-calendar.json');

const rows = V.rowsOf(MAP.bySgg, IDX.projects, IDX.sgg);
const sido = (c) => MOLIT.sido.find((x) => x.code === c)?.name;

test("H4 날짜 열: 목록·인쇄·간단 보기가 같은 이름 '현재 예정', 지난 예정은 빨강 대신 '경과 n개월' 꼬리표, 끝난 사업은 '실제'", () => {
  assert.equal(L.LIST_COLS.find((c) => c.key === 'next').label, '현재 예정');
  const page = read('app/(dashboard)/projects/page.tsx');
  assert.match(page, /\{ key: 'ev', label: PLAN_COL, kind: 'text' \}/, '인쇄 표도 같은 열 이름');
  assert.match(page, /ev: nextCell\(r\)/, '인쇄 표도 같은 값');
  assert.doesNotMatch(page, /'지난 예정'|'다음 일정'/);
  for (const r of rows) {
    const n = V.nextOf(r);
    if (!n) continue;
    assert.equal(n.tone, undefined, `${r.id}: 색으로 지난 날짜를 말하지 않는다`);
    if (V.lateOf(r) !== null) assert.equal(n.tag, `경과 ${r.overdue.months}개월`, r.id);
  }
  const done = rows.find((r) => r.done && V.lateOf(r) === null && !r.next);
  if (done) assert.equal(V.nextOf(done).tag, '실제');
  assert.match(read('components/ui/data-grid.tsx'), /\{o\?\.tag \? <span[^>]*>\{o\.tag\}<\/span> : null\}/);
});

test("H1 서랍 단계 줄: '지금' 한 칸만 채우고 지난 단계는 옅은 체크, 앞 단계는 빈 칸", () => {
  for (let cur = 0; cur < 6; cur++) {
    const st = [0, 1, 2, 3, 4, 5].map((i) => V.stepState(i, cur));
    assert.equal(st.filter((x) => x === 'now').length, 1, `지금 ${cur}`);
    assert.deepEqual(st, [...Array(cur).fill('past'), 'now', ...Array(5 - cur).fill('ahead')]);
  }
  const steps = read('components/projects/StageSteps.tsx');
  assert.match(steps, /const st = stepState\(i, current\), on = st === 'now';/);
  assert.match(steps, /style=\{on \? \{ background: `color-mix\(in srgb,\$\{c\} 26%,var\(--card\)\)` \} : undefined\}/, '단계색 면은 지금 칸에만');
  assert.match(steps, /\{st === 'past' \? <><Check [^>]*aria-hidden="true" \/><span className="sr-only">지난 단계 <\/span><\/> : null\}/);
  assert.doesNotMatch(steps, /done \?/, '지난 단계를 단계색으로 칠하지 않는다');
});

test('H8 정책 목표 대비: 기본 접힘(머리에 핵심 한 줄) · 인쇄 보기는 펼침 · 첫 질문 칸은 이름에 범위 · 목표를 넘으면 초과', () => {
  const lines = V.compareLines(PP, IDX.policies, rows, IDX.policies.map((p) => p.key));
  assert.deepEqual(lines.map(V.compareHead), ['9·7 · 목표 있는 4단계 중 2단계 미달(①계획·④모집)'], '4차(A4): 머리 줄은 비율 숫자 없이 단계 이름만(r4-screens 1: 부족 → 미달)');
  const cells = lines[0].cells;
  assert.equal(V.rateOf(cells[1]).word, '달성 170.8%', '② 인허가 6,249 / 3,658(2026-10-20 HOME 판 — 10-19 판 3,560 / 1,543 = 230.7%) — 2026-10-16 목표 대비 달성률(옛 \'초과 130.7%\', r2-screens 3)');
  assert.equal(V.rateOf(cells[4]).word, '달성 100.0%', '⑤ 준공 381 / 381');
  const sum = read('components/projects/Summary.tsx');
  assert.match(sum, /<details data-fold open=\{open\}/);
  assert.match(sum, /\{lines\.map\(\(l\) => <span key=\{l\.policy\.key\}[^>]*>\{compareHead\(l\)\}<\/span>\)\}/);
  assert.match(sum, /<b className=\{short \? 'text-bad' : c\.actual > c\.target \? 'text-ok' : 'text-foreground'\}>\{rateOf\(c\)\.word\}<\/b>/, 'r4-screens 1: 모든 칸 달성률');
  assert.match(read('app/(dashboard)/projects/page.tsx'), /<PolicyCompare lines=\{cmpLines\} title=\{.+ : '다른 정책 목표 대비'\} open=\{print\}/);
  /* 칩 메뉴 Esc 가 접힘 영역을 메뉴로 알고 닫지 않게 */
  assert.match(read('components/windows/WindowHost.tsx'), /details\[open\]:not\(\[data-fold\]\)/);
  const ctx = { pp: PP, policies: IDX.policies, observedMonth: IDX.observedMonth, sidoName: (c) => c, sggName: (c) => c };
  const q = V.questionsOf(rows, { metro: true }, ctx);
  assert.equal(q[0].q, '9·7 대책 목표 대비', '범위(전국)는 정책 목표 카드 머리의 범위 칩(screens-b)');
});

test('H10 도움말: 단계별 진행·정책 목표 대비·핵심 질문마다 ⓘ(쉬운 말)', () => {
  const sum = read('components/projects/Summary.tsx');
  assert.match(sum, /<InfoTip label="단계별 진행">/);
  assert.match(sum, /<InfoTip label=\{title\}>/);
  assert.match(sum, /<InfoTip label=\{x\.q\}><p>\{x\.help\}<\/p>\{x\.note \? <p>\{x\.note\}<\/p> : null\}<\/InfoTip>/);
  const ctx = { pp: PP, policies: IDX.policies, observedMonth: IDX.observedMonth, sidoName: (c) => c, sggName: (c) => c };
  for (const f of [{}, { metro: true }, { policy: IDX.policies[1] }]) for (const x of V.questionsOf(rows, f, ctx)) {
    assert.ok(x.help.length > 10, x.q);
    assert.doesNotMatch(x.help, /HOME|원장|policy|samePeriod|병목|판정/, `${x.q}: 전문용어 없이`);
  }
});

test('H7 CSV: 지금 거르기의 목록과 같은 열(지도 표지 제외)·같은 순서, UTF-8 BOM, CRLF, 숫자는 쉼표 없이', () => {
  const f = { metro: true, status: 'check' };
  const list = V.listOrder(V.applyFilters(rows, f));
  const grid = L.listRows(list, f, null, sido);
  const cols = L.csvCols(L.dropBlank(L.LIST_COLS, grid).cols);
  const csv = G.toCsv(cols, grid);
  assert.ok(csv.startsWith('﻿'), 'BOM');
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines.pop(), '');
  assert.equal(lines[0], cols.map((c) => c.label).join(','));
  assert.ok(!lines[0].includes('지도'));
  assert.ok(lines[0].includes('현재 예정'));
  assert.equal(lines.length, list.length + 1);
  const r0 = list[0], late = V.lateOf(r0);
  assert.ok(lines[1].includes(`,${late},`), '지연 +n → n');
  if (r0.units > 1000) assert.ok(lines[1].includes(`,${r0.units},`), '호수는 쉼표 없는 수');
  /* 글자 따옴표·꼬리표 */
  const t = G.toCsv([{ key: 'a', label: '이름', kind: 'text' }, { key: 'b', label: '호수' }], [{ id: '1', c: { a: { text: 'A, "B"', tag: '경과 3개월' }, b: { na: '미확인' } } }]);
  assert.equal(t, '﻿이름,호수\r\n"A, ""B"" (경과 3개월)",미확인\r\n');
  const route = read('app/(dashboard)/projects/csv/route.ts');
  assert.match(route, /parseFilters\(q, /); assert.match(route, /listOrder\(applyFilters\(idx\.rows, f\)\)/);
  assert.match(route, /'Content-Type': 'text\/csv; charset=utf-8'/); assert.match(route, /filename\*=UTF-8''/);
  const page = read('app/(dashboard)/projects/page.tsx');
  assert.match(page, /const csvHref = listHref\(f\)\.replace\(\/\^\\\/projects\/, '\/projects\/csv'\);/);
  assert.match(page, /<a href=\{csvHref\} download/);
});

test('H7 키보드: 지역 지도 원은 고른 달의 원만 초점 대상(Tab 하나·←→·Enter), 연도별 막대는 막대마다 초점과 읽기 이름', () => {
  const all = R.aheadAll(calendar, 'metro', (c) => c);
  const m = R.pickMonth(calendar.months, all);
  const f = R.dotFocus(all, m, null);
  const want = all.filter((e) => e.ym === m && e.pt).map((e) => e.k);
  assert.deepEqual(f.keys, want);
  assert.ok(f.keys.length > 0);
  assert.equal(f.tab, f.keys[0]);
  assert.equal(R.dotFocus(all, m, f.keys[f.keys.length - 1]).tab, f.keys[f.keys.length - 1], '고른 사업이 Tab 대상');
  assert.equal(R.dotFocus(all, m, 'x').tab, f.keys[0]);
  const ahead = read('components/region/Ahead.tsx');
  assert.match(ahead, /tabIndex: e\.k === foc\.tab \? 0 : -1, role: 'button', 'aria-pressed': e\.k === hl,/);
  assert.match(ahead, /if \(ev\.key === 'Enter' \|\| ev\.key === ' '\) \{ ev\.preventDefault\(\); const e = byK\.get\(k!\)!; pick\(e\.ym, e\.k\); return; \}/);
  assert.match(ahead, /role="group" aria-label=\{`\$\{regionName\} \$\{monthLabel\(m\)\} 예정 사업 위치/, '원이 읽기 도구에 보이게(img 아님)');
  assert.match(ahead, /ArrowRight: i \+ 1/, '달 막대의 ←→ 는 그대로');
  const bars = read('components/charts/YearBars.tsx');
  assert.match(bars, /tabIndex=\{0\} role="img" aria-label=\{`\$\{y\.year\}년/);
  assert.match(bars, /role="group" aria-label=\{label\}/);
});

test("H9 회복·문구: 부산은 '자료 없음(서울·인천·경기만)', 인쇄는 '점검 필요 n건 전부'(10줄 넘으면 상위 10)", () => {
  const region = read('app/(dashboard)/region/page.tsx');
  /* 2026-10-16: 빈 카드 대신 '동네 여건' 머리 한 줄(r2-screens 6) — 머리 바로 뒤라 '동네 여건'을 되풀이하지 않는다 */
  assert.match(region, /동네 여건<\/h3>[\s\S]*\$\{name\} 자료 없음\(서울·인천·경기만\)/);
  assert.match(region, /sido && sido !== 'metro' \?/);
  const page = read('app/(dashboard)/projects/page.tsx');
  assert.match(page, /const prioAll = priorityOf\(scope, Infinity\), top = prioAll\.slice\(0, 10\);/);
  assert.match(page, /prioAll\.length > 10 \? `점검 필요 \$\{fmt\(prioN\)\}건 중 상위 10` : `점검 필요 \$\{fmt\(prioN\)\}건 전부`/);
  assert.doesNotMatch(page, /우선 점검 사업 · 상위 10/);
  const all = V.priorityOf(V.scopeOf(rows, { metro: true }), Infinity);
  /* 2026-10-20 HOME 판: 수도권 점검 필요 4 → 12건(주의 10·지연 2)이라 10줄을 넘는다 — 인쇄 제목은 '점검 필요 12건 중 상위 10' */
  assert.ok(all.length > 10, '수도권은 10줄 넘음 — 제목은 상위 10');
  assert.equal(all.length, 12);
});

test('접근성: 본문 바로가기(첫 Tab), 인쇄 전용 표·정의는 화면에서 display:none(보조기기에도 숨김)', () => {
  const lay = read('app/(dashboard)/layout.tsx');
  const skip = lay.indexOf('href="#main"'), nav = lay.indexOf('<TopNav />');
  assert.ok(skip > 0 && skip < nav, '메뉴보다 먼저');
  assert.match(lay, /className="sr-only [^"]*focus:not-sr-only/);
  assert.match(lay, /<main id="main" tabIndex=\{-1\}/);
  const page = read('app/(dashboard)/projects/page.tsx');
  assert.equal((page.match(/!print && 'hidden print:block'/g) ?? []).length, 3, '점검 필요 표·출처 줄·보고 머리');
  assert.match(read('components/projects/Summary.tsx'), /<div aria-hidden="true" className="mt-4 hidden [^"]*print:block/);
});

test('/agency/lh: 위 메뉴·경로 표시는 종합상황판 아래, LH 준공 예정 표는 이번 달부터', () => {
  assert.equal(activeMenuId('/agency/lh'), 'home');
  assert.equal(DETAILS.agency.list, '/');
  const s = read('app/(dashboard)/agency/[id]/page.tsx');
  assert.match(s, /const crumbs = \[\{ label: '종합상황판', href: '\/' \}, \{ label: a\.name \}\];/);
  assert.match(s, /const blocks = lh\.blocks\.filter\(\(b\) => b\.date\.slice\(0, 7\) >= observedMonth\)/);
  assert.match(s, /rows=\{blocks\.map\(/);
  assert.doesNotMatch(s, /lh\.blocks\.map\(\(b, k\)/);
});
