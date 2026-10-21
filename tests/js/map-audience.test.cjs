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

test('지표: 일반사용자는 지연을 뺀 두 개, 이름이 공급 예정 호수·1년 안 모집(2026-10-21 — 12개월 = 공급(모집·분양) 예정)', () => {
  const p = J.metricsFor(true);
  assert.deepEqual(p.map((m) => [m.id, m.name, m.short, m.unit]), [['u', '공급 예정 호수', '공급 예정 호수', '호'], ['a', '1년 안 모집', '1년 안 모집', '호']]);
});
test('지표: 정책담당자는 METRICS 그대로(지연 포함 — 2026-10-21 HOME PoC 규칙 이름)', () => {
  assert.equal(J.metricsFor(false), J.METRICS);
  assert.deepEqual(J.METRICS.map((m) => [m.id, m.name, m.short]), [['u', '계획 호수', '계획 호수'], ['d', '지연 사업', '지연'], ['a', '향후 12개월 공급 예정', '12개월 공급']]);
});
test('범위: 두 관점 모두 기본 9·7(2026-10-21 W4 결정 ⑤ — 일반사용자도 9·7), ?policy=all 이면 정책 전체 — 개요에서 여는 주소에 policy=all 을 잇는다', () => {
  assert.equal(J.policyOf('', false), 'p97');
  assert.equal(J.policyOf('?sido=11&policy=all', false), 'all');
  assert.equal(J.policyOf('', true), 'p97', '일반사용자 관점 기본 9·7');
  assert.equal(J.policyOf('?policy=all', true), 'all');
  assert.equal(J.keepPolicy('/map?sgg=11650', '?policy=all'), '/map?sgg=11650&policy=all');
  assert.equal(J.keepPolicy('/map', '?policy=all'), '/map?policy=all');
  assert.equal(J.keepPolicy('/map?sgg=11650', '?sido=11'), '/map?sgg=11650', '기본 9·7 은 붙이지 않는다');
  assert.equal(mapHref({ sgg: '11650', policy: 'all' }), '/map?sgg=11650&policy=all');
  assert.equal(mapHref({ sgg: '41280', policy: 'all' }), '/map?sido=41&pick=41280&policy=all');
  assert.equal(mapHref({ sido: '11', policy: 'p97' }), '/map?sido=11');
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
  const v = { n: 12, c: 10, x: 2, q: 3, w: 1, an: 4, st: [1, 2] };
  assert.equal(J.totalSubOf('u', v, true), '사업 7곳', '일반사용자 사업 수 = 집계 행 c − q(2026-10-21 W5-MP2 — /citizen 과 같은 셈)');
  assert.equal(J.totalSubOf('u', v, false), '원천 12건 · 7건 집계 · 중복·모호 2건 제외 · 물량 없음 3건');
  assert.equal(J.totalSubOf('d', v, false), '원천 12건 중 · 주의 1건');
  assert.equal(J.totalSubOf('a', v, true), '공급 예정 4건');
});
test('정의 문구: 일반사용자는 정책 용어(원천 행·종합상황판) 없음, 정책담당자는 범위 이름과 같은 기준', () => {
  assert.ok(!/사업 화면|호수 미확인|원천|종합상황판/.test(J.defOf('u', {}, true) + J.defOf('a', {}, true)));
  assert.match(J.defOf('u', {}, false, 'p97'), /^9·7 연결 사업\(원천 행\)의 계획 호수 합입니다\..*종합상황판과 같은 기준입니다\. 막대 띠는 단계별 물량입니다 — 정책 진행 자료의 지도 단계 분포/);
  assert.match(J.defOf('u', {}, true, 'p97'), /^9·7 주택공급 확대방안에 연결된 수도권 사업의 계획 호수/, '일반사용자도 9·7 범위 설명');
  assert.match(J.defOf('u', {}, true, 'all'), /^주택 공급 정책에 연결된 수도권 사업/);
  assert.match(J.defOf('u', {}, false, 'all'), /^정책 전체 사업/);
  assert.match(J.defOf('d', {}, false), /2% 이상/);
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

test('일반사용자 부제 사업 수(2026-10-21 W5-MP2): 9·7 175곳 · 정책 전체 346곳, 정책담당자는 원천 230건·443건 + 집계 175·346', () => {
  const O = require('../../lib/board/metro-overview.ts'), RM = require('../../data/board/region-map.json'), MOV = require('../../data/board/map-overview.json');
  const D = (k) => J.scopeVals(O.homeOverview(RM, MOV), k).total;
  assert.equal(J.totalSubOf('u', D('p97'), true), '사업 177곳');   // 2026-10-22 새 덤프(20261021T212310Z): 9·7 집계 행 175 → 177
  assert.equal(J.totalSubOf('u', D('all'), true), '사업 347곳');   // 2026-10-22 새 덤프(20261021T212310Z): 정책 전체 집계 행 346 → 347(부천역곡 A1)
  assert.match(J.totalSubOf('u', D('p97'), false), /^원천 232건 · 177건 집계/);   // 2026-10-22 새 덤프(20261021T212310Z): 9·7 +2행(부천역곡 A1·인천송림4 1), 정책 전체 +1행(부천역곡 A1)
  assert.match(J.totalSubOf('u', D('all'), false), /^원천 444건 · 347건 집계/);
});
