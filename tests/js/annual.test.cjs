'use strict';
// lib/board/annual.ts — 연도별 집계. HOME 연도별 비교의 2025 공식 실적(서울·경기·인천)과 같은 값이 나와야 한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../../lib/board/annual.ts');
const molit = require('../../data/board/molit.json');

const v = (metric, code, year) => A.annualSeries(molit, metric, code).find((y) => y.year === year).value;

test('2025 연간 값이 HOME 연도별 비교와 같다(준공·착공·분양 × 서울·경기·인천)', () => {
  const HOME = { complete: [46708, 82390, 14444], start: [32224, 115745, 18896], sale: [12654, 87256, 19046] };
  for (const [metric, vals] of Object.entries(HOME)) ['11', '41', '28'].forEach((code, i) => assert.equal(v(metric, code, 2025), vals[i], `${metric} ${code}`));
});

test('자료가 2021-09 부터라 2021 은 부분 연도(9~12월), 마지막 해는 1~8월 잠정', () => {
  const s = A.annualSeries(molit, 'complete', '00');
  assert.deepEqual(s.map((y) => y.year), [2021, 2022, 2023, 2024, 2025, 2026]);
  assert.deepEqual([s[0].complete, s[0].first, s[0].last, s[0].months], [false, 9, 12, 4]);
  assert.equal(A.spanLabel(s[0]), '9~12월');
  assert.deepEqual([s[5].complete, s[5].months, s[5].provisional, A.spanLabel(s[5])], [false, 8, true, '1~8월']);
  assert.equal(s[4].provisional, false);
});

test('인허가는 첫 달이 비어(차분) 2021 이 3개월만 센다', () => {
  const y = A.annualSeries(molit, 'permit', '00')[0];
  assert.deepEqual([y.months, y.first, y.complete], [3, 10, false]);
});

test('전년 대비는 두 해 모두 12/12개월일 때만 — 2022 는 2021 이 부분이라 null, 2026 도 null', () => {
  const s = A.annualSeries(molit, 'complete', '00');
  assert.equal(A.yoy(s, 2022), null);
  assert.equal(A.yoy(s, 2026), null);
  const want = (v(  'complete', '00', 2025) / v('complete', '00', 2024) - 1) * 100;
  assert.equal(A.yoy(s, 2025), want);
  assert.equal(A.lastCompleteYear(s), 2025);
  assert.equal(A.partialAfter(s).year, 2026);
});

test('연간 합 = 그해 월 값의 합', () => {
  const i = molit.months.indexOf('2025-01');
  const sum = molit.metrics.complete.series['00'].total.slice(i, i + 12).reduce((a, b) => a + b, 0);
  assert.equal(v('complete', '00', 2025), sum);
});
