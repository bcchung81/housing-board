'use strict';
/* /citizen 사업 일정·판정 순수 함수(prjMarks·nextStep·prjJudge — 사업 찾기 lib/board/public-labels.ts 와 같은 결과를 내야 하는 원본)와 아래 줄 한 장 배치.
   2026-10-19 아래 줄 '사업' 표는 '청약 단지' 카드로 바뀌었다(사용자 Q&A 결정) — 표 줄 마크업(옛 pjRow)·덧붙임(D.ex) 시험은 지우고, 새 카드는 tools/design/public-mock/search.test.js '청약 단지-1~8' 이 본다.
   ① 고비 고르기 우선순위(det 실제 > det 예정 > 원장 next, 지난 예정은 빼고 다음 후보) · 다음 일정(첫 예정, 없으면 마지막 실제 '완료')
   ② 상태 = 원장 cls/overdue/issued(정책 화면 statusOf) ③ 화면 연결(한 장 배치·접기·옛 카드 없음) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const TPL = fs.readFileSync(path.join(ROOT, 'tools', 'design', 'public-mock', 'template.html'), 'utf8');
const BUILT = fs.readFileSync(path.join(ROOT, 'docs', 'design', '대국민-모드-시안.html'), 'utf8');
const code = [...BUILT.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((c) => c.includes('function makeSearch'));
const ctx = {}; vm.createContext(ctx);
vm.runInContext(code + '\nObject.assign(this, { D, makeSearch, prjMarks, nextStep, prjJudge, lateShort, OF_STAGE, distinctNames, shortName, fullDate, inLabel });', ctx);
const D = ctx.D;
const plain = (v) => JSON.parse(JSON.stringify(v));
const TODAY = '2026-10-18';
const fnBody = (name) => { const i = TPL.indexOf(`function ${name}(`); assert.ok(i >= 0, name); return TPL.slice(i, TPL.indexOf('\n}\n', i)); };
const CSS = TPL.slice(TPL.indexOf('<style>'), TPL.indexOf('</style>'));
const LM = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'board', 'ledger-map.json'), 'utf8'));

test('① 고비 고르기: 같은 고비는 det 실제 > det 예정 > 원장 next · 지난 예정은 빼고 다음 후보 · 다음 일정 = 첫 예정, 없으면 마지막 실제', () => {
  const F = { det: {
    'PRJ-9-01': ['', [['2025-03-02', 1], ['2027-05', 0], null, ['2030', 0]]],
    'PRJ-9-02': ['', [['2026-02', 0], ['2026-09', 0], null, null]],
    'PRJ-9-03': ['', [['2024-01', 1], ['2025', 1], null, null]] } };
  const m = (id, p) => plain(ctx.prjMarks(F, '9', [id, 'x', 2, 10, ...p], TODAY));
  assert.deepEqual(m('01', [1, '2028']), [{ k: 0, d: '2025-03-02', real: true }, { k: 1, d: '2027-05', real: false }, { k: 3, d: '2030', real: false }], 'det 예정이 next 보다 앞');
  assert.deepEqual(m('02', [1, '2027-11']), [{ k: 1, d: '2027-11', real: false }], '지난 det 예정 대신 next, 다른 지난 예정은 뺌');
  assert.deepEqual(m('02', [-1, '']), [], '지난 예정만 있으면 고비 없음');
  assert.deepEqual(m('03', [1, '2028']), [{ k: 0, d: '2024-01', real: true }, { k: 1, d: '2025', real: true }], 'det 실제가 next 보다 앞');
  assert.deepEqual(m('04', [0, '2026-10']), [{ k: 0, d: '2026-10', real: false }], '이번 달 예정은 아직 지나지 않음');
  assert.deepEqual(m('04', [0, '2026-10-17']), [], '어제 날짜 예정은 지남');
  assert.deepEqual(plain(ctx.nextStep(ctx.prjMarks(F, '9', ['01', 'x', 2, 10, 1, '2028'], TODAY))), { k: 1, d: '2027-05', real: false }, '첫 예정');
  assert.deepEqual(plain(ctx.nextStep(ctx.prjMarks(F, '9', ['03', 'x', 2, 10, -1, ''], TODAY))), { k: 1, d: '2025', real: true }, '예정이 없으면 마지막 실제');
  assert.equal(ctx.nextStep([]), null);
});

test('② 상태 칩 = 원장 판정(cls·overdue·issued, 정책 화면 statusOf): 정상 → 빈칸 · 주의/지연 → 준공 예정일이 n개월 지났어요(2026-10-19 안 A) · 판정 없음·후보 → 일정 미정 — 전국 모든 사업', () => {
  let n = 0, late = 0;
  for (const [c, L] of Object.entries(LM.bySgg)) for (const p of L) {
    const row = (D.prj[c] || []).find((q) => `PRJ-${c}-${q[0]}` === p.id); assert.ok(row, p.id);
    const s = ctx.prjJudge(D, c, row), want = !p.issued || !p.cls ? ['none', '일정 미정'] : p.cls === 'ok' ? ['ok', ''] : [p.cls, `${{ SUPPLY_NOTICE: '모집 공고', CONSTRUCTION_START: '착공', COMPLETION: '준공', MOVE_IN: '입주', PERMIT: '허가' }[p.overdue.eventType]} 예정일이 ${p.overdue.months}개월 지났어요`];
    assert.deepEqual([s.k, s.t], want, p.id); n++; if (s.m) late++;
  }
  assert.ok(late >= 4, '늦어짐 사업이 있다');
  console.log(`  판정 ${n}건 같음 · 늦어짐 ${late}건`);
});

test('③ 화면 연결: 아래 줄 = 카드 한 장(전체 폭, 2026-10-19 청약 단지) · 칸 높이에 맞게 접기(fitPj) · 옛 사업 일정 카드·사업 표·지도 위 사업 카드 없음', () => {
  assert.ok(!TPL.includes('id="c-yr"') && TPL.includes('<section class="ui-card cell" id="c-pj" aria-labelledby="c-pj-h"></section>'));
  assert.match(CSS, /\.bot-row \{ display: grid; grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(CSS, /\.pub \{ grid-template-rows: auto clamp\(460px, calc\(100vh - 152px\), 760px\) 268px auto; \}/, '아래 줄 고정 높이 그대로(레이아웃 이동 0)');
  assert.match(CSS, /\.cell \.pjs \{ flex: 1 1 auto; min-height: 0; overflow: hidden;/);
  const rc = fnBody('renderCells');
  assert.match(rc, /\.slice\(0, AH_MAX\)/); assert.match(rc, /popovertarget="tip-pj"/); assert.match(rc, /fitPj\(\);/); assert.doesNotMatch(rc, /findBtn|pjRow|stFil/);
  assert.match(TPL, /<div class="tip" id="tip-pj" popover><b>청약 단지<\/b>/);
  const fp = fnBody('fitPj');
  assert.match(fp, /Math\.floor\(\(box\.clientHeight \+ 1\) \/ h\)/); assert.match(fp, /\(max-width: 599px\)'\)\.matches \? 3 : 5/);
  assert.match(TPL, /fitLegend\(\); fitPj\(\);/, '크기가 바뀌면 다시 접는다');
  assert.doesNotMatch(TPL, /function (hlRow|pjRow|openPrjOnMap|openMapCard)\(|\.mapcard|\.pts \.pt|svg\.pts/, '옛 사업 표 줄·가리킴·지도 위 카드·점 층 없음');
  for (const f of ['renderTl', 'tlHtml', 'fitTl', 'paintYears', 'yrsChart', 'yearsOf', 'paintYearChart', 'withYearGlide']) assert.ok(!new RegExp(`\\b${f}\\b`).test(TPL), f);
  assert.ok(!TPL.includes('#c-yr') && !TPL.includes('tip-when') && !TPL.includes('class="hh"'));
  assert.match(TPL, /<p id="tip-head-hh"><\/p><\/div>/, '가구 증가 줄은 제목 ⓘ 안');
  const bd = fs.readFileSync(path.join(ROOT, 'tools', 'design', 'public-mock', 'build_data.py'), 'utf8');
  assert.match(bd, /JD = \{'ok': 0, 'caution': 1, 'delay': 2\}/); assert.match(bd, /'jd': jd/);
});
