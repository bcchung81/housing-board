'use strict';
/* 지도 개요 패널의 관점별 문구(일반사용자 = html[data-aud] 가 admin 이 아님): 지연 탭 없음·이름 /citizen 과 같게·metric=d → u,
   머리 메뉴 '지도' 주소(내 동네). 정책담당자 관점은 기존 그대로. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const J = require('../../assets/js/overview.js');
const { myAreaScope } = require('../../lib/shell/menu.ts');
const { mapHref } = require('../../lib/board/map-href.ts');
const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('지표: 일반사용자는 지연을 뺀 두 개, 이름이 공급 예정 호수·1년 안 준공', () => {
  const p = J.metricsFor(true);
  assert.deepEqual(p.map((m) => [m.id, m.name, m.short, m.unit]), [['u', '공급 예정 호수', '공급 예정 호수', '호'], ['a', '1년 안 준공', '1년 안 준공', '호']]);
});
test('지표: 정책담당자는 METRICS 그대로(지연 포함·옛 이름)', () => {
  assert.equal(J.metricsFor(false), J.METRICS);
  assert.deepEqual(J.METRICS.map((m) => [m.id, m.name, m.short]), [['u', '진행 사업 호수', '진행 호수'], ['d', '지연 사업', '지연'], ['a', '앞으로 12개월 준공', '12개월 준공']]);
});
test('?metric=d·late: 일반사용자는 u, 정책담당자는 d', () => {
  assert.equal(J.metricOf('?metric=d', true), 'u');
  assert.equal(J.metricOf('?metric=late', true), 'u');
  assert.equal(J.metricOf('?metric=a', true), 'a');
  assert.equal(J.metricOf('?metric=d'), 'd');
  assert.equal(J.metricOf('?metric=late', false), 'd');
});
test('제목·부제', () => {
  assert.equal(J.titleOf('수도권', true), '수도권 공급 예정 호수');
  assert.equal(J.titleOf('경기도', false), '경기도 공급 개요');
  const v = { n: 12, q: 3, an: 4, st: [1, 2] };
  assert.equal(J.totalSubOf('u', v, true), '사업 12곳');
  assert.equal(J.totalSubOf('u', v, false), '진행 12건 · 호수 미확인 3건');
  assert.equal(J.totalSubOf('a', v, true), '준공 예정 4건');
});
test('정의 문구: 일반사용자는 정책 용어(사업 화면 기준) 없음, 정책담당자는 기존 그대로', () => {
  assert.ok(!/사업 화면|호수 미확인/.test(J.defOf('u', {}, true) + J.defOf('a', {}, true)));
  assert.match(J.defOf('u', {}, false), /사업 화면과 같은 기준/);
  assert.equal(J.defOf('d', {}, false), J.defOf('d', {}));
});
test('머리 메뉴 지도 주소: 시군구 5자리·시도 2자리·없음', () => {
  assert.equal(mapHref(myAreaScope('41360')), '/map?sgg=41360');
  assert.equal(mapHref(myAreaScope('41280')), '/map?sido=41&pick=41280');
  assert.equal(mapHref(myAreaScope('11')), '/map?sido=11');
  assert.equal(mapHref(myAreaScope('26')), '/map');
  assert.equal(mapHref(myAreaScope(null)), '/map');
  assert.equal(mapHref(myAreaScope('abc')), '/map');
});
test('연결: 정적 제목은 CSS 로 관점별, 정책담당자 문구 유지, TopNav 는 마운트 뒤 href', () => {
  const page = read('app/(map)/map/page.tsx'), nav = read('components/TopNav.tsx');
  assert.match(page, /html\[data-aud=admin\] \.ov-aud-public,html:not\(\[data-aud=admin\]\) \.ov-aud-admin\{display:none\}/);
  assert.match(page, /className="ov-aud-admin">수도권 공급 개요</);
  assert.match(page, /className="ov-aud-public">수도권 공급 예정 호수</);
  assert.match(nav, /useState\('\/map'\)/);
  assert.match(nav, /setMapTo\(next === 'public' \? mapHref\(myAreaScope\(area\)\) : '\/map'\)/);
  assert.match(read('assets/js/overview.js'), /attributeFilter: \['data-aud'\]/);
  assert.equal(read('assets/js/overview.js'), read('public/assets/js/overview.js'));
});
