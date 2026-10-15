'use strict';
/* 지도 첫 화면 '수도권 개요'(2026-10-15 승인 설계): 경계 변환(region-map → 경위도 GeoJSON), 시군구 값(사업 화면·지역 공급과 같은 계산), 경기 구 → 시 합산,
   주소 규칙(쿼리 없음 → 개요 · ?sido= → 개요 시도 · ?sgg·project·region → 상세), 개요에서 누른 곳 → /map?sgg= 주소, 화면 연결(레이아웃·페이지·지도 섬), 상세 경로 표시. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const O = require('../../lib/board/metro-overview.ts');
const V = require('../../lib/board/projects-view.ts');
const RG = require('../../lib/board/region.ts');
const J = require('../../assets/js/overview.js');
const R = require('../../assets/js/region.js');
const MAP = require('../../data/board/ledger-map.json');
const IDX = require('../../data/board/projects-index.json');
const CAL = require('../../data/board/region-calendar.json');
const RM = require('../../data/board/region-map.json');
const PP = require('../../data/board/policy-progress.json');
const AREAS = require('../../schemas/ledger-2026-10/tables/areas.json').rows;

const rows = V.rowsOf(MAP.bySgg, IDX.projects, IDX.sgg);
const DOC = O.metroOverview(RM, { rows, sggNames: IDX.sgg, calendar: CAL, referenceDate: MAP.referenceDate });
const KEYS = ['u', 'q', 'n', 'd', 'a', 'an'];

test('경계: region-map 시군구 67곳(서울 25 · 인천 11 · 경기 31)이 모두 유효한 경위도 면이고 수도권 범위 안에 있다', () => {
  assert.equal(DOC.units.length, 67);
  assert.deepEqual(['11', '28', '41'].map((s) => DOC.units.filter((u) => u.s === s).length), [25, 11, 31]);
  const fc = J.toGeoJSON(DOC.units);
  assert.equal(fc.type, 'FeatureCollection');
  assert.equal(fc.features.length, 67);
  for (const f of fc.features) {
    const g = f.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : null;
    assert.ok(polys && polys.length, `${f.properties.name}: 면 종류`);
    for (const p of polys) for (const ring of p) {
      assert.ok(ring.length >= 4, `${f.properties.name}: 고리 점 4개 이상`);
      assert.deepEqual(ring[0], ring[ring.length - 1], `${f.properties.name}: 고리가 닫힌다`);
      for (const [lon, lat] of ring) {
        assert.ok(Number.isFinite(lon) && Number.isFinite(lat));
        assert.ok(lon > 124.5 && lon < 128.0 && lat > 36.8 && lat < 38.4, `${f.properties.name}: ${lon},${lat} 수도권 밖`);
      }
    }
  }
  /* 투영식의 역: 서울시청(126.978, 37.5665) 근처로 되돌아온다 */
  const kx = Math.cos((37.5 * Math.PI) / 180) * 1000;
  const [lon, lat] = J.unproject((126.978 - 124.5) * kx, (38.4 - 37.5665) * 1000);
  assert.ok(Math.abs(lon - 126.978) < 1e-4 && Math.abs(lat - 37.5665) < 1e-4);
  /* 라벨 자리는 그 면 안 */
  for (const u of DOC.units) { const rs = J.pathRings(u.d), p = J.labelPoint(rs); assert.ok(rs.some((r) => J.inRing(p, r)), `${u.name}: 라벨 자리가 면 안`); }
});

test('코드: 개요 면 67곳의 코드는 행정표준 시군구 코드표(areas.json)와 같고, 경기 구 코드는 앞 4자리 + 0 의 시로 접는다', () => {
  for (const [c, n] of Object.entries(O.METRO_AREAS)) {
    const a = AREAS.find((x) => x.area_code === c);
    assert.ok(a && a.level === 'SGG' && a.area_name === `${O.SIDO_FULL[c.slice(0, 2)]} ${n}`, `${c} ${n}`);
  }
  assert.equal(Object.keys(O.METRO_AREAS).length, AREAS.filter((x) => x.level === 'SGG' && ['11', '28', '41'].includes(x.area_code.slice(0, 2))).length);
  assert.equal(new Set(DOC.units.map((u) => u.code)).size, 67);
  for (const u of DOC.units) assert.equal(O.METRO_AREAS[u.code], u.name, `${u.code} 이름`);
  assert.equal(O.unitOf('41281'), '41280');   // 고양시 덕양구 → 고양시
  assert.equal(O.unitOf('41113'), '41110');   // 수원시 권선구 → 수원시
  assert.equal(O.unitOf('41595'), '41590');   // 화성시 병점구 → 화성시
  assert.equal(O.unitOf('41463'), '41460');   // 용인시 기흥구 → 용인시
  assert.equal(O.unitOf('41290'), '41290');   // 과천시(고양 41280 과 앞 3자리가 같아도 따로)
  assert.equal(O.unitOf('11215'), '11215');   // 서울·인천은 그대로
  assert.equal(O.unitOf('28245'), '28245');
  assert.equal(O.unitOf('26110'), null);      // 수도권 밖
  /* 구가 있는 경기 시는 8곳(원장 코드표 기준) */
  assert.deepEqual(DOC.units.filter((u) => O.guOf(u.code).length).map((u) => u.name), ['수원시', '성남시', '안양시', '부천시', '안산시', '고양시', '용인시', '화성시']);
  assert.deepEqual(O.guOf('41280'), ['41281', '41285', '41287']);
  /* 원장의 수도권 시군구 코드는 모두 개요 면 하나에 들어간다 */
  const units = new Set(DOC.units.map((u) => u.code));
  for (const c of Object.keys(MAP.bySgg).filter((c) => V.isMetro(c))) assert.ok(units.has(O.unitOf(c)), `${c} → 개요 면`);
});

test('합: 시군구 값의 합 = 시도 합 = 수도권 합(지표 모두), 구 메뉴 값의 합 = 그 시 값', () => {
  for (const k of KEYS) {
    const bySido = Object.fromEntries(DOC.sido.map((s) => [s.code, s.v[k]]));
    for (const s of DOC.sido) assert.equal(DOC.units.filter((u) => u.s === s.code).reduce((t, u) => t + u.v[k], 0), bySido[s.code], `${s.name} ${k}`);
    assert.equal(DOC.sido.reduce((t, s) => t + s.v[k], 0), DOC.total[k], `수도권 ${k}`);
  }
  for (let i = 0; i < 6; i++) assert.equal(DOC.units.reduce((t, u) => t + u.v.st[i], 0), DOC.total.st[i]);
  for (const u of DOC.units.filter((x) => x.gu.length)) for (const k of KEYS) assert.equal(u.gu.reduce((t, g) => t + g.v[k], 0), u.v[k], `${u.name} 구 합 ${k}`);
  assert.equal(DOC.total.st.reduce((a, b) => a + b, 0), rows.filter((r) => V.isMetro(r.sgg)).length, '단계 띠 = 수도권 사업 전부');
});

test('같은 숫자: 진행 사업 호수·지연 건수는 사업 화면 수도권 범위(applyFilters metro), 12개월 준공·입주는 지역 공급 수도권과 같은 정의로 센 값과 같다', () => {
  const metro = V.applyFilters(rows, { metro: true });
  const prog = metro.filter((r) => r.board <= 3);
  assert.equal(DOC.total.u, prog.reduce((s, r) => s + (r.units > 0 ? r.units : 0), 0));
  assert.equal(DOC.total.q, prog.filter((r) => !(r.units > 0)).length);
  assert.equal(DOC.total.n, prog.length);
  const late = metro.filter((r) => ['delay', 'long'].includes(V.statusOf(r))).length;
  assert.equal(DOC.total.d, late);
  /* 사업 화면 핵심 질문 '어떤 사업이 늦어지는가'(수도권 기본 범위)의 값과도 같다 */
  const ctx = { pp: PP, policies: IDX.policies, observedMonth: IDX.observedMonth, sidoName: (c) => c, sggName: (c) => c };
  assert.equal(V.questionsOf(rows, { metro: true }, ctx).find((q) => q.q === '어떤 사업이 늦어지는가').value, String(late));
  const ahead = RG.aheadAll(CAL, 'metro', (c) => c).filter((e) => e.type === 'COMPLETION' || e.type === 'MOVE_IN');
  assert.equal(DOC.total.a, ahead.reduce((s, e) => s + e.units, 0));
  assert.equal(DOC.total.an, ahead.length);
  /* 시도별로도 같다 */
  for (const s of DOC.sido) {
    const sc = V.applyFilters(rows, { sido: s.code });
    assert.equal(s.v.u, sc.filter((r) => r.board <= 3).reduce((t, r) => t + r.units, 0), `${s.name} 진행 호수`);
    assert.equal(s.v.d, sc.filter((r) => r.cls === 'delay').length, `${s.name} 지연`);
    assert.equal(s.v.a, RG.aheadAll(CAL, s.code, (c) => c).filter((e) => e.type !== 'SUPPLY_NOTICE').reduce((t, e) => t + e.units, 0), `${s.name} 12개월`);
  }
  /* 기준일·기간 */
  assert.equal(DOC.referenceDate, MAP.referenceDate);
  assert.deepEqual(DOC.months, [CAL.months[0], CAL.months[CAL.months.length - 1]]);
});

test('원장을 읽지 못하면 경계만(값 없음, ok=false)', () => {
  const d = O.metroOverview(RM, null);
  assert.equal(d.ok, false);
  assert.equal(d.total, null);
  assert.equal(d.units.length, 67);
  assert.ok(d.units.every((u) => u.v === null && u.d));
  assert.match(read('app/(map)/map/page.tsx'), /catch \{\s*return metroOverview\(map, null\);/);
  assert.match(read('app/(map)/map/page.tsx'), />수치를 불러오지 못했습니다\. 경계만 보여 줍니다\.</);
});

test('주소 규칙: 쿼리 없음 → 개요, ?sido=11|28|41 → 개요 그 시도, ?sgg·project·region(과 pnu·bjd·code) → 상세 — 레이아웃 첫 스크립트와 개요 모듈이 같은 판정', () => {
  const cases = [
    ['', 'overview', ''], ['?sido=11', 'overview', '11'], ['?sido=28', 'overview', '28'], ['?sido=41', 'overview', '41'], ['?sido=26', 'overview', ''], ['?sido=all', 'overview', ''], ['?m=1', 'overview', ''],
    ['?sgg=41281', 'detail'], ['?sgg=28245', 'detail'], ['?project=PRJ-41281-0001', 'detail'], ['?region=incheon-gyeyang', 'detail'], ['?pnu=1111010100100010000', 'detail'], ['?bjd=2824510900', 'detail'], ['?code=11110', 'detail'], ['?sido=41&sgg=41281', 'detail'],
  ];
  for (const [q, mode, sido] of cases) {
    const m = J.modeOf(q);
    assert.equal(m.mode, mode, q);
    if (mode === 'overview') assert.equal(m.sido, sido, q);
    const attrs = {};
    const ctx = { location: { search: q }, URLSearchParams, document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } } };
    vm.runInNewContext(O.MAP_MODE_INIT, ctx);
    assert.equal(attrs['data-map-mode'], mode, `레이아웃 스크립트 ${q}`);
    /* 전역 이름을 남기지 않는다(전역 var q 가 app.js 의 최상위 const 와 부딪혀 상세 지도가 통째로 멈춘 적이 있다) */
    assert.deepEqual(Object.keys(ctx).sort(), ['URLSearchParams', 'document', 'location']);
  }
  /* 상세 코드 진입 매개변수는 region.js 의 것과 같다(+ 옛 ?region=) */
  for (const k of ['project', 'pnu', 'bjd', 'sgg', 'code']) assert.ok(R.codeQuery(`?${k}=1`), k);
  assert.deepEqual([...J.DETAIL_KEYS].sort(), ['bjd', 'code', 'pnu', 'project', 'region', 'sgg']);
  assert.equal(J.sidoHref('41'), '/map?sido=41');
  assert.equal(J.sidoHref(''), '/map');
});

test('누르기: 개요의 모든 시군구(구 메뉴 포함)는 올바른 /map?sgg=<코드> 로 간다', () => {
  let n = 0;
  for (const u of DOC.units) {
    const p = J.pickOf(u);
    if (u.gu.length) {
      assert.ok(p.menu && !p.href, `${u.name}: 구 메뉴`);
      for (const g of p.menu) {
        assert.equal(g.href, `/map?sgg=${g.code}`);
        assert.ok(/^41\d{3}$/.test(g.code) && O.unitOf(g.code) === u.code, `${u.name} ${g.name}`);
        assert.ok(O.METRO_AREAS[g.code], `${g.code} 코드표`);
        n++;
      }
      /* 구 모두 + 시 단위로만 적힌 사업이 있으면 '(구 미정)'으로 시 자체 */
      assert.deepEqual(p.menu.filter((g) => g.code !== u.code).map((g) => g.code), O.guOf(u.code));
    } else {
      assert.equal(p.href, `/map?sgg=${u.code}`);
      assert.ok(R.isHomeSgg(u.code));
      n++;
    }
  }
  assert.ok(n >= 59 + 23, `주소 ${n}개`);
  const goyang = J.pickOf(DOC.units.find((u) => u.code === '41280'));
  assert.deepEqual(goyang.menu.map((g) => g.href), ['/map?sgg=41281', '/map?sgg=41285', '/map?sgg=41287']);
  const suwon = J.pickOf(DOC.units.find((u) => u.code === '41110'));
  assert.equal(suwon.menu[suwon.menu.length - 1].name, '수원시(구 미정)', '시 단위 코드 사업은 지역 선택기와 같은 이름');
  assert.equal(J.pickOf(DOC.units.find((u) => u.code === '28245')).href, '/map?sgg=28245', '계양구는 상세 3D 지역으로(코드 진입이 번들로 연다)');
});

test('색 단계: 0 은 중립(0단계), 분위수 경계는 오름차순이고 값이 클수록 단계가 내려가지 않는다, 범례 칸은 0 + 단계', () => {
  for (const m of J.METRICS) {
    const vals = DOC.units.map((u) => J.valOf(u.v, m.id)), ups = J.breaksOf(vals);
    assert.ok(ups.length >= 1 && ups.length <= 5, m.id);
    assert.ok(ups.every((u, i) => !i || u > ups[i - 1]), `${m.id} 경계 오름차순`);
    assert.equal(ups[ups.length - 1], Math.max(...vals));
    const sorted = vals.slice().sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) assert.ok(J.classOf(sorted[i], ups) >= J.classOf(sorted[i - 1], ups));
    assert.equal(J.classOf(0, ups), 0);
    assert.ok(vals.filter((v) => v > 0).every((v) => J.classOf(v, ups) >= 1 && J.classOf(v, ups) <= 5));
    const lg = J.legendOf(ups, '');
    assert.equal(lg[0].c, 0);
    assert.equal(lg.length, ups.length + 1);
  }
  assert.deepEqual(J.breaksOf([0, 0]), []);
  assert.equal(J.classOf(5, [5]), 3, '서로 다른 값이 하나면 가운데 단계');
});

test('색·글자 대비: 라이트·다크 모두 면 단계마다 라벨 글자가 4.5:1 이상이고, 단계는 밝기 순서대로다', () => {
  const css = read('assets/css/app.css');
  const vars = (sel) => { const m = css.match(new RegExp(`${sel.replace(/[[\]().:"]/g, (c) => `\\${c}`)}\\{(--ov-[^}]*)\\}`)); assert.ok(m, sel); return Object.fromEntries(m[1].split(';').filter(Boolean).map((x) => x.trim().split(':'))); };
  const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  for (const [sel, dark] of [[':root', true], ['html[data-map-shell]:not(.dark)', false]]) {
    const v = vars(sel);
    for (let i = 0; i <= 5; i++) assert.ok(ratio(v[`--ov-${i}`], v[`--ov-ink-${i}`]) >= 4.5, `${sel} 단계 ${i}: ${ratio(v[`--ov-${i}`], v[`--ov-ink-${i}`]).toFixed(2)}`);
    const L = [1, 2, 3, 4, 5].map((i) => lum(v[`--ov-${i}`]));
    assert.ok(L.every((x, i) => !i || (dark ? x > L[i - 1] : x < L[i - 1])), `${sel}: 값이 클수록 ${dark ? '밝게' : '짙게'}`);
  }
});

test('화면 연결: 레이아웃 첫 스크립트 → 개요/상세 CSS 분기, 페이지가 개요 값을 지도 섬에 넘기고, 지도 섬은 개요에서 개요 모듈과 지도 라이브러리만 부른다', () => {
  const layout = read('app/(map)/layout.tsx'), page = read('app/(map)/map/page.tsx'), island = read('components/MapIsland.tsx'), css = read('assets/css/app.css');
  assert.match(layout, /<script dangerouslySetInnerHTML=\{\{ __html: MAP_MODE_INIT \}\} \/>/);
  assert.ok(layout.indexOf('THEME_INIT }}') < layout.indexOf('MAP_MODE_INIT }}'));
  assert.match(page, /<OverviewMarkup \/>/);
  assert.match(page, /<MapIsland \{\.\.\.props\} overview=\{await overviewDoc\(\)\} overviewSrc=\{props\.assets\[OVERVIEW_JS\] \|\| OVERVIEW_JS\} \/>/);
  assert.match(page, /const OVERVIEW_JS = '\/assets\/js\/overview\.js';/);
  assert.match(page, /getProjectsIndex\(\)/, '사업 화면과 같은 읽기');
  assert.match(island, /if \(document\.documentElement\.getAttribute\('data-map-mode'\) === 'overview' && overviewSrc\) \{/);
  const ov = island.slice(island.indexOf("=== 'overview'"), island.indexOf('return;\n    }'));
  assert.match(ov, /load\(overviewSrc\), lib = load\(LIBS\[0\]\)/);
  assert.doesNotMatch(ov, /APP|CONFIG|RegionLoader|LOADVIEW/, '개요는 앱·키·지역 자료·로딩 화면을 부르지 않는다');
  assert.match(css, /html\[data-map-mode="overview"\] \.shell-map \.app\{display:none\}/);
  assert.match(css, /\.ov\{display:none\}/);
  assert.match(css, /@media \(max-width:768px\)\{\n  html\[data-map-mode="overview"\] \.ov\{display:block\}/);
  /* 보이는 글에 내부 용어가 없다 */
  const src = read('assets/js/overview.js').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const w of ['HOME', '번들', '원장 관측']) { assert.ok(!src.includes(w), `overview.js: ${w}`); assert.ok(!page.slice(page.indexOf('function OverviewMarkup')).replace(/\{\/\*[\s\S]*?\*\/\}/g, '').includes(w), `개요 마크업: ${w}`); }
});

test('상세 지도 위 경로: 수도권 › 시도 › 시군구, 앞 둘은 /map · /map?sido= 링크', () => {
  assert.deepEqual(R.crumbsOf('41281', '경기도 고양시 덕양구'), [{ label: '수도권', href: '/map' }, { label: '경기', href: '/map?sido=41' }, { label: '고양시 덕양구' }]);
  assert.deepEqual(R.crumbsOf('28245', '인천광역시 계양구').map((c) => c.label), ['수도권', '인천', '계양구']);
  assert.equal(R.crumbsOf('26110', '부산광역시 중구'), null, '수도권 밖은 경로 없음');
  assert.equal(R.crumbsHtml(R.crumbsOf('11110', '서울특별시 종로구')), '<a href="/map">수도권</a><span class="cr-sep" aria-hidden="true">›</span><a href="/map?sido=11">서울</a><span class="cr-sep" aria-hidden="true">›</span><span aria-current="page">종로구</span>');
  const el = { hidden: true, innerHTML: '' }, doc = { getElementById: (id) => (id === 'mapCrumbs' ? el : null) };
  R.mountCrumbs({ HOME_LITE: { 41281: { name: '경기도 고양시 덕양구', n: 8 } } }, doc, {}, { sgg: '41281', type: 'sgg', name: '경기도 고양시 덕양구' });
  assert.equal(el.hidden, false);
  assert.match(el.innerHTML, /고양시 덕양구<\/span>$/);
  R.mountCrumbs({}, doc, { sggs: ['28245'] }, null);   // 지역 번들(?region=incheon-gyeyang)
  assert.match(el.innerHTML, /\/map\?sido=28/);
  R.mountCrumbs({}, doc, { sggs: [] }, { sgg: '26110', type: 'sgg', name: '부산광역시 중구' });
  assert.equal(el.hidden, true);
  assert.match(read('index.html'), /<div class="brand-t"><nav class="crumbs" id="mapCrumbs" aria-label="지도 위치" hidden><\/nav><b>공급 지도<\/b>/);
});
