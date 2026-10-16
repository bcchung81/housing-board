'use strict';
// 지도 상세 4차 개선(2026-10-16): 같은 사업의 착공일이 화면마다 다름 — 인천계양 A2(PRJ-28245-0055) 서랍은 '실제 2023.10'(원장), 지도 카드는 '공사 2024.03 ~ 2026.10'(상세 3D).
//  공정률과 같은 방식: 원장(서랍과 같은 project-detail.json stages)의 착공 실제일·준공(실제, 없으면 현재 예정)이 있으면 카드 공사 기간을 그 값으로,
//  지도 원천(상세 3D) 달이 다르면 '원천 날짜 다름(상세 3D 2024.03)' 작은 표지(title 에 두 원천). 원장 착공 실제가 있는 계양 사업 전부에 같은 규칙.
// R4_ROOT 로 다른 작업 트리(고치기 전 파일)를 가리켜 실패를 확인할 수 있다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.env.R4_ROOT || path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const app = read('assets/js/app.js'), page = read('app/(map)/map/page.tsx'), island = read('components/MapIsland.tsx');
const R = require(path.join(ROOT, 'assets/js/region.js'));
const grab = (re, src = app) => { const m = re.exec(src); assert.ok(m, String(re)); return m[0]; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DETAIL = JSON.parse(read('data/board/project-detail.json'));

/* page.tsx 의 homeDates 를 떼어 실제 원장으로 돌린다 */
const homeDatesFn = () => {
  const ts = require(path.join(ROOT, 'node_modules/typescript'));
  const fn = ts.transpileModule(grab(/function homeDates\([\s\S]*?\n\}\n/, page), { compilerOptions: { target: 'es2020' } }).outputText;
  return Function(`${fn}; return homeDates;`)();
};
/* app.js 의 공사 기간 함수들을 떼어 평가한다 */
const spanHelpers = (homeDates, sources = []) => {
  const src = [grab(/const dotDate = [^\n]+\n/), grab(/const ymDot = [^\n]+\n/), grab(/const progSrc = [^\n]+\n/), grab(/const HOME_DATES = [\s\S]*?\nconst spanCell = [^\n]+\n/)].join('');
  return Function('window', 'REG', 'esc', `${src}; return { spanOf, spanCell };`)({ HOME_DATES: homeDates }, { sources }, esc);
};

test('page.tsx 가 서랍과 같은 project-detail.json 에서 착공 실제·준공 날짜만 넘기고, 지도 섬이 window.HOME_DATES 로 둔다', () => {
  const homeDates = homeDatesFn();
  const t = homeDates(DETAIL);
  assert.deepEqual(t['PRJ-28245-0055'], { s: '2023-10-25', e: '2026-10-11' });
  assert.deepEqual(homeDates({ projects: { a: { stages: { CONSTRUCTION_START: { plan: '2027-01-01' }, COMPLETION: { plan: '2029-01-01', actual: '2028-12-01' } } }, b: { stages: {} }, c: {} } }),
    { a: { e: '2028-12-01', done: true } }, '착공은 실제만, 준공은 실제 우선(그다음 현재 예정), 날짜가 없으면 싣지 않는다');
  assert.match(page, /homeDates=\{homeDates\(detailJson as never\)\}/);
  assert.doesNotMatch(page, /export function homeDates/);
  assert.match(island, /w\.HOME_DATES = homeDates;/);
});

test("A2: 공사 기간 시작은 원장 착공 실제(2023.10), 상세 3D 2024.03 은 '원천 날짜 다름' 표지(title 에 두 원천), 끝이 같은 달이면 표지에 넣지 않는다", () => {
  const H = spanHelpers(homeDatesFn()(DETAIL), [{ id: 'lh-cwstt', label: 'LH 공사현황' }]);
  const b = { id: 'A2', ledger: { id: 'PRJ-28245-0055' }, progress: { rate: 100, start: '2024-03-29', end: '2026-10-11', source: 'lh-cwstt' } };
  const sp = H.spanOf(b);
  assert.deepEqual([sp.s, sp.e], ['2023-10-25', '2026-10-11']);
  const cell = H.spanCell(sp);
  assert.match(cell, /^<span title="[^"]*">2023\.10 ~ 2026\.10<\/span> <b class="jd alt" title="([^"]*)">원천 날짜 다름\(상세 3D 2024\.03\)<\/b>$/);
  const tip = /<b class="jd alt" title="([^"]*)"/.exec(cell)[1];
  assert.match(tip, /사업 원장: 착공 실제 2023\.10\.25 · 준공 예정 2026\.10\.11/);
  assert.match(tip, /LH 공사현황\(상세 3D\): 공사 2024\.03\.29 ~ 2026\.10\.11/);
  assert.doesNotMatch(cell, /HOME|번들/, '지도에 내부 낱말 없음');
  /* 원장 날짜가 없으면 지도 원천 그대로, 표지 없음 */
  const m = H.spanOf({ id: 'x', progress: { start: '2024-03-29', end: '2026-10-11' } });
  assert.equal(H.spanCell(m), '<span title="공사 기간: 상세 3D 자료">2024.03 ~ 2026.10</span>');
  /* 원장과 같은 달이면 표지 없음 */
  assert.doesNotMatch(H.spanCell(H.spanOf({ ...b, progress: { ...b.progress, start: '2023-10-02' } })), /원천 날짜 다름/);
  /* 끝만 다르면 '~ 끝', 둘 다 다르면 '시작 ~ 끝' */
  assert.match(H.spanCell(H.spanOf({ ...b, progress: { ...b.progress, start: '2023-10-02', end: '2026-12-31' } })), /원천 날짜 다름\(상세 3D ~ 2026\.12\)/);
  assert.match(H.spanCell(H.spanOf({ ...b, progress: { ...b.progress, end: '2026-12-31' } })), /원천 날짜 다름\(상세 3D 2024\.03 ~ 2026\.12\)/);
  /* 지도 원천에 공사 기간이 없으면 칸을 만들지 않는다(예전과 같음) */
  assert.equal(H.spanOf({ ...b, progress: { rate: 1 } }), null);
  /* 카드가 이 함수를 쓴다(옛 b.progress 직접 표시 없음) */
  const bp = grab(/function blockPopup\([\s\S]*?\n\}\n/);
  assert.match(bp, /sp \? \['공사', spanCell\(sp\), true\] : null/);
  assert.doesNotMatch(bp, /\['공사', `\$\{ymDot\(b\.progress\.start\)\}/);
});

test('원장 착공 실제가 있는 계양 사업 전부: 실제 번들 단지 + 원장 정적 자료로 붙인 뒤 카드 공사 시작 = 원장 착공 실제, 달이 다르면 표지', () => {
  const homeDates = homeDatesFn()(DETAIL);
  const bundle = JSON.parse(read('regions/incheon-gyeyang/projects.json'));
  const blocks = bundle.projects.map((p) => R.adaptProject(p, { sources: [] }));
  const ledger = JSON.parse(read('data/board/home-map/28245.json'));
  R.attachLedger(blocks, [ledger], 'incheon-gyeyang');
  const H = spanHelpers(homeDates, [{ id: 'lh-cwstt', label: 'LH 공사현황' }]);
  const want = Object.entries(DETAIL.projects).filter(([id, d]) => id.startsWith('PRJ-28245-') && d.stages && d.stages.CONSTRUCTION_START && d.stages.CONSTRUCTION_START.actual);
  assert.ok(want.length >= 5, `계양 원장 착공 실제 ${want.length}건`);
  const seen = [];
  for (const [id, d] of want) {
    const b = blocks.find((x) => x.ledger && x.ledger.id === id);
    assert.ok(b, `${id} 가 지도 단지에 붙는다`);
    const sp = H.spanOf(b), cell = H.spanCell(sp), act = d.stages.CONSTRUCTION_START.actual;
    assert.equal(sp.s, act, `${id} 시작 = 원장 착공 실제`);
    assert.ok(cell.includes(`>${act.slice(0, 7).replace('-', '.')} ~ `), `${id} 카드 글자`);
    const comp = d.stages.COMPLETION || {};
    assert.equal(sp.e, comp.actual || comp.plan || b.progress.end, `${id} 끝 = 원장 준공(실제 → 현재 예정)`);
    const diff = act.slice(0, 7) !== b.progress.start.slice(0, 7);
    assert.equal(/원천 날짜 다름\(상세 3D \d{4}\.\d{2}/.test(cell), diff, `${id} 시작 달이 다를 때만 시작 표지`);
    seen.push(`${b.id}:${cell.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ')}`);
  }
  assert.deepEqual(seen.sort(), [
    'A10:2025.12 ~ 2028.08 원천 날짜 다름(상세 3D 2026.06 ~ 2029.01)',
    'A17:2026.06 ~ 2029.07 원천 날짜 다름(상세 3D 2026.07 ~ 2029.08)',
    'A2:2023.10 ~ 2026.10 원천 날짜 다름(상세 3D 2024.03)',
    'A3:2023.10 ~ 2026.10 원천 날짜 다름(상세 3D 2024.03)',
    'A9:2025.09 ~ 2028.06 원천 날짜 다름(상세 3D 2025.11 ~ 2028.10)',
  ]);
  /* 원장 착공 실제가 없는 계양 단지(A6)는 지도 원천 그대로, 표지 없음 */
  const a6 = blocks.find((x) => x.id === 'A6');
  assert.equal(H.spanCell(H.spanOf(a6)).replace(/<[^>]+>/g, ''), '2026.08 ~ 2029.03');
});
