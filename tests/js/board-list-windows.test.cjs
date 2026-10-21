'use strict';
// 종합상황판 목록 링크 → 목록 창(2026-10-20): 서버가 /projects 와 같은 함수로 미리 계산한 목록, 대상 링크만 창으로 열고 나머지·새 탭은 이동.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const V = require('../../lib/board/projects-view.ts');
const BL = require('../../lib/board/board-lists.ts');
const ledger = require('../../data/board/ledger-board.json');
const MAP = require('../../data/board/ledger-map.json');
const IDX = require('../../data/board/projects-index.json');
const real = V.rowsOf(MAP.bySgg, IDX.projects, IDX.sgg);

/* 시험용 행: 원장 지도 자료에서 만들 수 없는 칸이 많아 목록 계산 함수에는 합성 행을 쓴다 */
const row = (id, issued, cls, months, board, sgg = '28245') => ({ id, name: `사업 ${id}`, issued, cls, overdue: months ? { months, planned: '2025-01', eventType: 'COMPLETION' } : null, board, sgg, sggName: '인천광역시 계양구', units: 10, agency: 'LH', policies: [], programs: [], stage: '04' });
const rows = [row('PRJ-1', true, 'delay', 8, 2), row('PRJ-2', true, 'delay', 14, 4), row('PRJ-3', true, 'caution', 3, 2), row('c1', false, 'delay', 9, 4), row('PRJ-4', true, 'ok', null, 2)];
const sido = (c) => ({ 28: '인천' })[c];

test('미리 계산한 목록은 /projects 와 같은 거르기(parseFilters → applyFilters)의 건수·순서와 같다', () => {
  const L = BL.boardLists(V, rows, sido);
  const count = (href) => V.applyFilters(rows, V.parseFilters(Object.fromEntries(new URL(href, 'http://x').searchParams), { policies: [], programs: [], sidoOk: () => true })).length;
  for (const href of [BL.LIST_LATE, BL.LIST_REVIEW, BL.LIST_CAUTION, ...[0, 1, 2, 3, 4, 5].map(BL.listStage)]) assert.equal(L[href].rows.length, count(href), href);
  assert.deepEqual(L[BL.LIST_LATE].rows.map((r) => r.name), ['사업 PRJ-2', '사업 PRJ-1']);
  assert.equal(L[BL.LIST_LATE].title, '지연 확정 2건');
  assert.equal(L[BL.LIST_REVIEW].rows.length, 1);
  assert.equal(L[BL.LIST_CAUTION].rows.length, 1);
  assert.equal(L[BL.listStage(2)].rows.length, 1);
  assert.equal(L[BL.listStage(4)].title, '⑤ 준공 지연 1건');
});

test('행 href 는 발급 사업 ?id=, 후보 ?cand= 이고, 행에는 name·meta·href 만 담는다(원자료 pks·bundles 없음)', () => {
  const L = BL.boardLists(V, rows, sido);
  assert.match(L[BL.LIST_LATE].rows[0].href, /[?&]id=PRJ-2/);
  assert.match(L[BL.LIST_REVIEW].rows[0].href, /[?&]cand=c1/);
  assert.equal(L[BL.LIST_LATE].rows[0].meta, '인천 계양구 · +14개월');
  for (const l of Object.values(L)) for (const r of l.rows) assert.deepEqual(Object.keys(r).sort(), ['href', 'meta', 'name']);
});

test('실제 원장: 지연 확정·후보 계산 건수는 원장 집계(judgment.delay·candidate.delay)와 같고, 단계별 지연 합이 지연 확정과 같다', () => {
  const L = BL.boardLists(V, real, () => undefined), J = ledger.judgment;
  assert.equal(L[BL.LIST_LATE].rows.length, J.delay.projects);
  assert.equal(L[BL.LIST_REVIEW].rows.length, J.candidate.delay.projects);
  assert.equal(L[BL.LIST_CAUTION].rows.length, J.caution.projects);
  assert.equal([0, 1, 2, 3, 4, 5].reduce((a, i) => a + L[BL.listStage(i)].rows.length, 0), J.delay.projects);
  /* 2026-10-21 종합상황판 = HOME 규칙(home-board.json): 페이지는 HOME 원천 행으로 목록을 계산하고, 목록 건수 = 카드 숫자(지연·주의·연결 사업), 단계별 지연 합 = 지연 */
  const HB = require('../../data/board/home-board.json'), HP = require('../../data/board/home-projects.json');
  const H = BL.boardLists(V, V.homeRowsOf(HP.rows, HP.residuals), () => undefined);
  assert.equal(H[BL.LIST_LATE].rows.length, HB.judgment.delay.projects);
  assert.equal(H[BL.LIST_CAUTION].rows.length, HB.judgment.caution.projects);
  assert.equal(H[BL.LIST_ALL].rows.length, HB.scope.projects);
  assert.equal(HB.judgment.candidate, undefined, 'HOME 집계에는 후보(번호 없는 사업)가 없다');
  assert.equal(H[BL.LIST_REVIEW].rows.length, 0);
  assert.equal([0, 1, 2, 3, 4, 5].reduce((a, i) => a + H[BL.listStage(i)].rows.length, 0), HB.judgment.delay.projects);
  assert.match(read('app/(dashboard)/page.tsx'), /lists: Object\.assign\(boardLists\(View, idx\.homeRows/);
});

test('상황판: 목록이 있는 링크만 창으로 열고(일반 클릭), href 는 그대로 둔다', () => {
  const src = read('components/board/Board.tsx');
  assert.match(src, /win\.openList\(\{ title: l\.title, rows: l\.rows, moreHref: href \}/);
  assert.match(src, /if \(e\.defaultPrevented \|\| e\.button !== 0 \|\| e\.metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.altKey\) return;/);
  assert.match(src, /if \(!l \|\| !win\) return undefined;/);   // 목록이 없으면 페이지 이동
  assert.match(src, /<Link href=\{l\.href\} onClick=\{open\(l\.href\)\}/);
  assert.match(src, /<PanelLink href=\{at\('\/projects\?sido=all&status=late'\)\} onClick=\{open\(at\(/);   // 2026-10-21 지역 탭: 주소의 시도는 고른 지역(atSido)
  assert.match(src, /<PanelLink href=\{at\('\/projects\?sido=all&status=review-late'\)\} onClick=\{open\(at\(/);
  assert.match(src, /<PanelLink href=\{at\(`\/projects\?sido=all&stage=\$\{bk\}&status=late`\)\} onClick=\{open\(at\(/);
  // 그 밖의 링크(전체 262건·착공·지역·소스)는 onClick 이 없다
  assert.doesNotMatch(src, /<PanelLink href=\{at\('\/projects\?sido=all'\)\} [^>]*onClick/);
  assert.doesNotMatch(src, /<PanelLink href="\/agency[^>]*onClick/);
  assert.match(read('components/board/PanelLink.tsx'), /onClick=\{onClick\}/);
});

test('창으로 여는 주소는 directives 가 거는 링크와 같은 글자다', () => {
  const d = read('lib/board/directives.ts');
  assert.ok(d.includes(`'${BL.LIST_LATE}'`) && d.includes(`'${BL.LIST_REVIEW}'`));
  assert.ok(d.includes('/projects?sido=all&stage=${neck.i}&status=late'));
  assert.ok(read('components/board/Board.tsx').includes(`'${BL.LIST_CAUTION}'`));
});
