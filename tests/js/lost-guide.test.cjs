'use strict';
// 위치 미확보 사업 안내 — 단계·위치 종류별 문구, 지도 목록 안내 줄
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const V = require('../../lib/board/projects-view.ts');

test('계획 단계(01~03)이고 위치 단서 없음: 주소나 좌표 입력', () => {
  for (const s of ['01', '02', '03']) assert.equal(V.lostGuide(s), '대표 지번 주소나 좌표를 입력하면 지도에 표시됩니다');
});
test('건설 이후(04 이상): 건축허가 연결 또는 주소 입력', () => {
  for (const s of ['04', '05', '06']) assert.equal(V.lostGuide(s), '건축허가 정보와 연결되면 지도에 표시됩니다 · 대표 지번 주소를 입력해도 됩니다');
});
test('시군구 대표점뿐이면 단계와 상관없이 임시 표시 안내', () => {
  for (const s of ['01', '05']) assert.equal(V.lostGuide(s, true), '시군구 대표점에 임시로 표시 중 · 대표 지번 주소를 입력하면 정확한 위치로 표시됩니다');
});
test('(i) 상세에 필수·선택·검증·준비 중 문구', () => {
  assert.match(V.LOST_INPUT.required, /지번 주소 또는 좌표.*근거/);
  assert.match(V.LOST_INPUT.note, /준비 중/);
});
test('지도 목록(app.js)에 안내 줄이 있고 같은 문구를 쓴다', () => {
  const js = fs.readFileSync(__dirname + '/../../assets/js/app.js', 'utf8');
  assert.match(js, /function lostGuide\(/);
  assert.match(js, /class="lp-guide ov-aud-admin"/);   // 위치 입력 안내는 정책담당자 관점에만(2026-10-18)
  for (const t of Object.values(V.LOST_GUIDE)) assert.ok(js.includes(t), t);
});
