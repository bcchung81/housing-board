'use strict';
/* 지난 공급 실적 지표 = 밑줄 탭(링크, 단계 글자색 --tab-c) + 공급 일정은 주소에 지역이 있으면 내 동네로 덮어쓰지 않는다(2026-10-19). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const ANNUAL = read('components/region/Annual.tsx');
const SCHEDULE = read('app/(dashboard)/citizen/schedule/page.tsx');
const INK = { permit: 'permit', start: 'build', sale: 'sale', complete: 'soon' };

test('지표 탭: 정책·일반 둘 다 .ui-tabs-line 링크 탭, 칩(ChipGroup 지표) 아님', () => {
  for (const src of [ANNUAL, SCHEDULE]) {
    assert.match(src, /className="ui-tabs ui-tabs-line" role="group" aria-label="지표"/);
    assert.match(src, /aria-current=\{[^}]*\? 'true' : undefined\}/);
    assert.doesNotMatch(src, /<ChipGroup label="지표"/);
  }
});

test('지표 탭 색: 지표 → 6단계 글자색 토큰, 색 리터럴 없음', () => {
  for (const [metric, st] of Object.entries(INK)) {
    assert.ok(ANNUAL.includes(`${metric}: '[--tab-c:var(--st-${st}-ink)]'`), `Annual ${metric}`);
    if (metric === 'start' || metric === 'complete') assert.ok(SCHEDULE.includes(`${metric}: '[--tab-c:var(--st-${st}-ink)]'`), `Schedule ${metric}`);
  }
});

test('공급 일정: 주소에 지역(?sido·?sgg)이 있으면 내 동네로 옮기지 않는다', () => {
  assert.match(SCHEDULE, /const asked = q\.sido !== undefined \|\| q\.sgg !== undefined/);
  assert.match(SCHEDULE, /\{asked \? null : <MyAreaDefault /);
  assert.doesNotMatch(SCHEDULE, /^\s*<MyAreaDefault /m);
});
