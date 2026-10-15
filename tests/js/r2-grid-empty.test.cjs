'use strict';
/* R2: DataGrid 공통 빈 상태(emptyText 기본 '자료 없음') · '예정일 지남(1개월 미만)' 문구 한 곳 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('node:module').registerHooks({ resolve(s, c, n) { try { return n(s, c); } catch (e) { if (/^\.\.?\//.test(s)) return n(`${s}.ts`, c); throw e; } } });

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test("DataGrid: emptyText 기본값 '자료 없음', 행 0건이면 표 머리는 두고 본문에 한 줄(왼쪽·muted)", () => {
  const src = read('components/ui/data-grid.tsx');
  assert.match(src, /emptyText = '자료 없음'/);
  assert.match(src, /emptyText\?: string/);
  assert.match(src, /!rows\.length \? <TableRow><TableCell colSpan=\{cols\.length\} className="text-left[^"]*text-muted-foreground">\{emptyText\}/);
  assert.doesNotMatch(src.match(/!rows\.length[^\n]*/)[0], /text-center/);
});

test('자체 빈 상태 화면(/projects)은 그대로 — 0건 분기는 DataGrid 를 부르기 전에 있다', () => {
  assert.match(read('app/(dashboard)/projects/page.tsx'), /이 조건의 사업이 없습니다/);
});

test("'예정일 지남(1개월 미만)' 문구는 projects-view 한 곳, month-ahead 는 가져다 쓴다(region.ts 는 꼬리 없는 '예정일 지남'만), assets/js/region.js 는 같은 글자", () => {
  const V = require('../../lib/board/projects-view.ts');
  const MA = require('../../lib/board/month-ahead.ts');
  const R = require('../../lib/board/region.ts');
  assert.equal(V.PAST_DUE_UNDER, '예정일 지남(1개월 미만)');
  assert.equal(R.PAST_DUE, V.PAST_DUE);
  assert.equal(MA.dueStatus('정상', true), `정상 · ${V.PAST_DUE_UNDER}`);
  assert.doesNotMatch(read('lib/board/month-ahead.ts'), /= '예정일 지남/);
  const js = read('assets/js/region.js');
  assert.ok(js.includes(`\`${V.PAST_DUE}(\${`) && js.includes("'1개월 미만'"), 'region.js 조립 글자가 상수와 같다');
  const t = { pastDue: true, dueMonths: 0 };
  assert.equal(require('../../assets/js/region.js').statusReason({ cls: 'ok', ...t }), V.PAST_DUE_UNDER);
});
