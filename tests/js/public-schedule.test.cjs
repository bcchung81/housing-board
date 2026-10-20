'use strict';
/* 일반사용자 공급 일정(/citizen/schedule, 2026-10-19): 정책 /region 과 같은 함수·같은 숫자, 수도권만, 쉬운 말, 12px 없음, 민간 포함 범위 이름. 제안서 5절. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const R = require('../../lib/board/region.ts');
const P = require('../../lib/board/public-schedule.ts');
const calendar = require('../../data/board/region-calendar.json');
const molit = require('../../data/board/molit.json');
const annual = require('../../data/board/region-annual.json');

const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[\s;,{}()])\/\/.*$/, '$1')).join('\n');
const PAGE = noComments(read('app/(dashboard)/citizen/schedule/page.tsx'));
const WORDS = noComments(read('lib/board/public-schedule.ts'));
const AHEAD = read('components/region/Ahead.tsx');
const sidoName = (c) => ({ 11: '서울', 28: '인천', 41: '경기' }[c] ?? c);

test('대표 숫자 = 정책 화면과 같은 함수 값(수도권 준공 예정 24곳·13,372호)', () => {
  const all = R.aheadAll(calendar, 'metro', sidoName);
  const list = all.filter((e) => R.parseKinds(undefined).includes(e.type));
  assert.equal(list.length, 25);   // 2026-10-20 HOME 판: 24곳·13,372호 → 25곳·14,570호
  assert.equal(list.reduce((s, e) => s + e.units, 0), 14570);
  assert.equal(P.hoText(14570), '1만 4,570호');
  // 페이지는 같은 함수를 직접 쓴다(새 계산 없음)
  for (const f of ['aheadAll', 'pickMonth', 'pastDue', 'parseKinds', 'regionYears', 'metroYears']) assert.match(PAGE, new RegExp(`\\b${f}\\b`), f);
});

test('수도권만: 서울·인천·경기 밖은 범위에 들어오지 않는다', () => {
  assert.deepEqual(P.parsePublicSido(undefined), 'metro');
  assert.deepEqual(['26', '12', 'all', ''].map(P.parsePublicSido), ['metro', 'metro', 'metro', 'metro']);
  assert.deepEqual(['11', '28', '41'].map(P.parsePublicSido), ['11', '28', '41']);
  const all = R.aheadAll(calendar, 'metro', sidoName);
  assert.ok(all.length > 0 && all.every((e) => ['11', '28', '41'].includes(e.sd)));
  // 2026-10-19 수도권 한정: region-calendar 시도 16 → 3 이라 자료에도 수도권 밖이 없다
  assert.deepEqual(Object.keys(calendar.sido).sort(), ['11', '28', '41'], '자료의 시도가 서울·인천·경기뿐');
  assert.doesNotMatch(PAGE, /sido=all|전국/);
  // 화면 칩은 서울·경기·인천뿐
  assert.match(PAGE, /const CHIPS = \['11', '41', '28'\]/);
});

test('정책 판 말은 그대로(부품 기본값 = 옛 문구)', () => {
  assert.equal(P.POLICY_WORDS.count, '건');
  assert.equal(P.POLICY_WORDS.past, R.PAST_DUE);
  assert.equal(P.POLICY_WORDS.cand, '(후보)');
  for (const k of R.CAL_KINDS) assert.equal(P.POLICY_WORDS.kind[k], R.CAL_TYPE[k].name);
  assert.deepEqual(['11', '28', '41'], R.METRO);
  assert.match(AHEAD, /words \?\? POLICY_WORDS/);
});

test('쉬운 말: 금지어 ①~④·BL·D-·원장·모집 시작·단위 집이 일반사용자 말에 없다', () => {
  const BAD = /[①②③④⑤⑥]|\bBL\b|D-\d|원장|모집 시작|단계 구분도|(?<=[\d}])집|(?<![가-힣])집(?![가-힣])/;
  const strings = (s) => [...s.matchAll(/'([^'\n]*)'|`([^`\n]*)`|>([^<>{}\n]+)</g)].map((m) => m[1] ?? m[2] ?? m[3]);
  for (const t of [...strings(PAGE), ...strings(WORDS)]) assert.doesNotMatch(t, BAD, t);
  for (const v of [...Object.values(P.PUBLIC_WORDS.kind), ...Object.values(P.PUBLIC_WORDS.kindTip), P.PUBLIC_WORDS.past, P.PUBLIC_WORDS.pastTip, P.PUBLIC_WORDS.cand, P.PUBLIC_WORDS.candTip, P.PUBLIC_WORDS.unitsUnknown]) assert.doesNotMatch(v, BAD, v);
  assert.deepEqual(P.PUBLIC_WORDS.kind, { SUPPLY_NOTICE: '모집 공고', COMPLETION: '준공', MOVE_IN: '입주' });
  assert.equal(P.PUBLIC_WORDS.count, '곳');
  assert.equal(P.PUBLIC_WORDS.cand, '일정 확인 중');
  assert.equal(P.PUBLIC_WORDS.unitsUnknown, '호수 미정');
});

test('표기: 9만 9,896호 · 10월 11일 · 2026년 10월', () => {
  assert.equal(P.hoText(99896), '9만 9,896호');
  assert.equal(P.hoText(9896), '9,896호');
  assert.equal(P.hoText(80000), '8만 호');
  assert.equal(P.koDay({ day: '2026-10-11', ym: '2026-10' }), '10월 11일');
  assert.equal(P.koDay({ day: null, ym: '2027-03' }), '3월');
  assert.equal(P.koMonth('2027-07'), '2027년 7월');
});

test('지난 몇 년: 착공·준공 둘, 민간 포함 범위 이름, 순위 한 줄, 전년 대비 없음', () => {
  assert.deepEqual(P.PUBLIC_METRICS, ['start', 'complete']);
  assert.equal(P.parsePublicMetric('permit'), 'complete');
  assert.match(PAGE, /모든 주택\(민간 포함\)/);
  assert.match(PAGE, /yoy=\{false\}/);
  const byCode = Object.fromEntries(R.METRO.map((c) => [c, R.regionYears(molit, annual, 'complete', c).years]));
  const r = P.yearRank(byCode, '41');
  assert.deepEqual(r, { year: 2025, rank: 1, of: 3, value: 82390 });
  assert.equal(P.rankText('준공', r), '2025년 준공 수도권 3곳 중 1위 · 8만 2,390호');
  const metro = R.metroYears(molit, annual, 'complete').find((y) => y.year === 2025);
  assert.equal(metro.value, 143542);
});

test('12px 이하 글자 크기가 없다(text-xs·text-[12px]·caption)', () => {
  for (const src of [PAGE, WORDS]) assert.doesNotMatch(src, /text-xs|text-\[\d+px\]|text-caption|\b1[012]px\b/);
});

test('하드코딩 없음: 화면에 색 리터럴·임의값 클래스가 없다', () => {
  assert.doesNotMatch(PAGE, /#[0-9a-fA-F]{3,8}\b|rgba?\(|\b(?:p|m|w|h|gap|rounded|leading|tracking)-\[/);
});

test('내 동네: lib/shell/menu.ts 의 myAreaScope 를 읽기만 한다', () => {
  const c = read('components/region/MyAreaDefault.tsx');
  assert.match(c, /myAreaScope/);
  assert.match(c, /localStorage\.getItem\('myArea'\)/);
  assert.doesNotMatch(c, /localStorage\.setItem/);
});

test('사업 이름 = 사업 찾기와 같은 쉬운 이름, BL 원문 0, 링크는 사업 찾기 쿼리', () => {
  const L = require('../../lib/board/public-labels.ts');
  const raw = R.aheadAll(calendar, 'metro', sidoName);
  const nm = L.distinctNames(raw.map((e) => ({ id: e.id, name: e.name, sgg: e.sgg, u: e.units })), (s) => s.split(' ').slice(1).join(' '));
  const easy = raw.map((e) => ({ ...e, name: nm[e.id] ?? e.name }));   // 페이지 easyNames 와 같은 식(페이지 글자로 아래에서 잠금)
  assert.match(PAGE, /distinctNames\(xs\.map\(\(e\) => \(\{ id: e\.id, name: e\.name, sgg: e\.sgg, u: e\.units \}\)\), \(s\) => s\.split\(' '\)\.slice\(1\)\.join\(' '\)\)/);
  assert.ok(raw.some((e) => /BL/.test(e.name)), '원문에는 BL 이 있다');
  assert.equal(easy.filter((e) => /BL|건설공사|\d공구/.test(e.name)).length, 0);
  assert.match(PAGE, /easyNames\(aheadAll/);
  assert.match(AHEAD, /findHref\(\{ id: e\.id \}\)/);
  assert.equal(L.findHref({ id: 'X1' }), '/citizen/projects?id=X1');
  assert.doesNotMatch(AHEAD, /\?\$\{e\.drawer \? 'id' : 'cand'\}/);
});

test('시도 순위: 수도권 3시도 안에서 오류 없이 계산되고, 자료에 없는 코드는 빈 연도', () => {
  assert.deepEqual(R.regionYears(molit, annual, 'complete', '29').years, []);
  for (const metric of ['start', 'complete']) {
    const by = Object.fromEntries(R.METRO.map((c) => [c, R.regionYears(molit, annual, metric, c).years]));
    for (const c of R.METRO) {
      const r = P.yearRank(by, c);
      assert.ok(r && r.of === 3 && r.rank >= 1 && r.rank <= 3, `${metric} ${c}`);
      assert.match(P.rankText('준공', r), /^\d{4}년 준공 수도권 3곳 중 [123]위 · /);
    }
  }
  assert.doesNotMatch(PAGE, /\bORDER\b/);
});
