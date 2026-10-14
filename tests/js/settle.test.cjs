'use strict';
// 입주 경과 표지(지도 개선 계획 2절, 2026-10-14 결정): 입주 진행 ≤6개월 · 입주 완료 7~24개월 · 기존 단지 >24개월, 날짜 없으면 null.
// 서버(lib/permits.js)와 브라우저(region.js·app.js)가 같은 파일(assets/js/settle.js)을 쓰는지도 본다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../../assets/js/settle.js');
const P = require('../../lib/permits.js');

const ROOT = path.join(__dirname, '..', '..');
const NOW = Date.parse('2026-10-14T03:00:00Z');

test('settledOf: 준공 뒤 경계 6·7·24·25개월', () => {
  assert.equal(S.settledOf('2026-04-14', null, NOW), 'moving');      // 6개월
  assert.equal(S.settledOf('2026-04-15', null, NOW), 'moving');      // 5개월(그 날이 아직)
  assert.equal(S.settledOf('2026-03-14', null, NOW), 'settled');     // 7개월
  assert.equal(S.settledOf('2024-10-14', null, NOW), 'settled');     // 24개월
  assert.equal(S.settledOf('2024-09-14', null, NOW), 'existing');    // 25개월
  assert.equal(S.settledOf('2026-10', null, NOW), 'moving');         // 달만 있는 값
  assert.equal(S.settledOf('2026-04', null, NOW), 'moving');
  assert.equal(S.settledOf('2026-03', null, NOW), 'settled');
  assert.equal(S.settledOf('2024-10', null, NOW), 'settled');
  assert.equal(S.settledOf('2024-09', null, NOW), 'existing');
});

test('settledOf: 입주예정월부터 6개월까지는 입주 진행, 두 날짜가 있으면 가까운 쪽', () => {
  assert.equal(S.settledOf(null, '2026-04', NOW), 'moving');
  assert.equal(S.settledOf(null, '2026-03', NOW), 'settled');
  assert.equal(S.settledOf(null, '2027-02', NOW), 'moving');         // 아직 오지 않은 입주예정월
  assert.equal(S.settledOf('2025-01-20', '2026-06', NOW), 'moving'); // 준공은 오래됐어도 입주예정월이 가까우면 진행
  assert.equal(S.settledOf('2003-01-21', '2025-03', NOW), 'settled');
});

test('settledOf: 날짜가 없거나 형식이 다르면 null(지금 동작 그대로)', () => {
  for (const v of [null, undefined, '', '2026', '20260414', '2026/04/14', 'abc']) assert.equal(S.settledOf(v, null, NOW), null, String(v));
  assert.equal(S.settledOf(null, null, NOW), null);
});

test('재현 사례: 작전동풍림아이원(2003-01-21)·휴먼시아 꽃뫼마을(2008-12-17)은 기존 단지', () => {
  assert.equal(S.settledOf('2003-01-21', null, NOW), 'existing');
  assert.equal(S.settledOf('2008-12', null, NOW), 'existing');
});

test('서버와 브라우저가 같은 구현을 쓴다: lib/permits.js 는 settle.js 를 불러 쓰고, 지도는 region.js 앞에 settle.js 를 싣는다', () => {
  assert.equal(P.settledOf, S.settledOf);
  const island = fs.readFileSync(path.join(ROOT, 'components/MapIsland.tsx'), 'utf8');
  const libs = /const LIBS = \[([^\]]+)\]/.exec(island)[1];
  assert.ok(libs.indexOf("'/assets/js/settle.js'") >= 0 && libs.indexOf("'/assets/js/settle.js'") < libs.indexOf("'/assets/js/region.js'"));
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  if (/assets\/js\/region\.js/.test(html)) assert.ok(html.indexOf('assets/js/settle.js') >= 0 && html.indexOf('assets/js/settle.js') < html.indexOf('assets/js/region.js'), 'index.html 옛 로더도');
});

test('region.settleOf: 06 입주일 때만, 번들은 마지막 실제 준공 사건, 인허가는 completedAt, 원장이 붙으면 원장 단계·done·입주예정월', () => {
  const R = require('../../assets/js/region.js');
  const ev = (type, date, over) => ({ type, date, source: 's', ...over });
  const bundle = R.adaptProject({ id: 'a', label: 'A', name: 'A', kind: '공동주택', status: '입주 단계', units: 10, outline: { tier: 'official', poly: [[0, 0], [1, 0], [1, 1]] }, sources: [],
    events: [ev('completion_inspection', '2003-01-21'), ev('completion_inspection', '2026-09-01', { suspect: true }), ev('permit_approved', '2002-01-01')] }, { sources: [] });
  assert.equal(bundle.doneAt, '2003-01-21');                                                     // suspect 는 쓰지 않는다
  assert.equal(R.settleOf(bundle, NOW), 'existing');
  assert.equal(R.settleOf({ status: '건설 단계', doneAt: '2003-01-21' }, NOW), null);               // 06 이 아니면 표지 없음
  assert.equal(R.settleOf({ status: '입주 단계' }, NOW), null);                                    // 날짜 없음 = 지금 동작
  const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, properties: { pnu: '2824510300106840000', name: '풍림', status: '입주 단계', completedAt: '2025-06-01', refs: [], records: 1 } }] };
  const [hub] = R.permitsToProjects(fc);
  assert.equal(R.settleOf(R.adaptProject(hub, { sources: [] }), NOW), 'settled');
  // 원장: 단계 06 이 아니면 표지 없음, 06 이면 done(실제 준공 달) 우선, MOVE_IN 일정이 가까우면 입주 진행
  assert.equal(R.settleOf({ status: '입주 단계', doneAt: '2003-01-21', ledger: { stage: '04' } }, NOW), null);
  assert.equal(R.settleOf({ status: '건설 단계', ledger: { stage: '06', done: '2008-12' } }, NOW), 'existing');   // 하남 휴먼시아 꽃뫼마을(PRJ-41450-0001) 모양
  assert.equal(R.settleOf({ status: '건설 단계', ledger: { stage: '06', done: '2008-12', next: { eventType: 'MOVE_IN', planned: '2026-08-01' } } }, NOW), 'moving');
  assert.equal(R.settleOf({ status: '건설 단계', ledger: { stage: '06' } }, NOW), null);           // done 이 아직 없는 원장 = 지금 동작
});
