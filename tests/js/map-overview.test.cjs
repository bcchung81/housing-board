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
const M3 = require('../../assets/js/map3d.js');   // 3D 단계 구분도 공용 모듈(/citizen 과 같은 구현)
const R = require('../../assets/js/region.js');
const MAP = require('../../data/board/ledger-map.json');
const IDX = require('../../data/board/projects-index.json');
const CAL = require('../../data/board/region-calendar.json');
const RM = require('../../data/board/region-map.json');
const PP = require('../../data/board/policy-progress.json');
const AREAS = require('../../schemas/ledger-2026-10/tables/areas.json').rows;

const rows = V.rowsOf(MAP.bySgg, IDX.projects, IDX.sgg);
const DOC = O.metroOverview(RM, { rows, sggNames: IDX.sgg, calendar: CAL, referenceDate: MAP.referenceDate });
const KEYS = ['u', 'q', 'n', 'd', 'a', 'an', 'mi', 'mn'];

test('경계: region-map 시군구 67곳(서울 25 · 인천 11 · 경기 31)이 모두 유효한 고리이고, 3D 판(Map3D.geom)이 범위마다 면을 빠짐없이 그린다 — 수도권 보기 판은 섬(강화·옹진)을 뺀 본토 65면(섬 삽입 지도 없음), 시도는 그 시도 면(경기는 서울이 맥락 면, 인천은 섬 삽입 지도 2)', () => {
  assert.equal(DOC.units.length, 67);
  assert.deepEqual(['11', '28', '41'].map((s) => DOC.units.filter((u) => u.s === s).length), [25, 11, 31]);
  for (const u of DOC.units) {
    const rs = J.pathRings(u.d);
    assert.ok(rs.length && rs.every((r) => r.length >= 3 && r.every(([x, y]) => Number.isInteger(x) && Number.isInteger(y))), `${u.name}: 고리`);
    const p = J.labelPoint(rs); assert.ok(rs.some((r) => J.inRing(p, r)), `${u.name}: 라벨 시작점이 면 안`);
  }
  const base = M3.prep(J.seedOf(DOC.units)), uOf = Object.fromEntries(DOC.units.map((u) => [u.code, u.v ? u.v.u : 0]));
  const geomOf = (sido, W, H, narrow) => M3.geom(base, { ...J.scopeOf(DOC.units, sido, DOC.view), W, H, narrow, uOf });
  const all = J.scopeOf(DOC.units, '', DOC.view);
  assert.equal(all.own.length, 65); assert.ok(!all.own.some((c) => J.ISLES.includes(c)), '수도권 보기 판에 섬 없음'); assert.deepEqual(all.isles, []); assert.equal(all.view, null);
  const g = geomOf('', 1056, 811, false);
  assert.equal(g.own.length, 65); assert.equal(g.ctx.length, 0); assert.equal(g.inset, null, '섬 삽입 지도 없음');
  assert.equal(DOC.units.length, 67, '값(순위·합계)은 섬 두 군을 그대로 넣는다 — 지도 면만 뺀다');
  for (const o of g.own) assert.ok(o.rings.some((r) => M3.inRing(o.lp, r.pts)), `${o.code}: 다듬은 면 안 라벨 점`);
  /* 수도권 전체는 시도 경계도 이웃(서울 면의 조각이 경기 면을 이웃으로 — 옆벽은 높이 차만큼) */
  assert.ok(g.own.filter((o) => o.code.startsWith('11')).some((o) => o.rings.some((r) => r.pieces.some((pc) => pc.nb && pc.nb.startsWith('41')))), '서울·경기 맞닿은 조각');
  assert.deepEqual(geomOf('', 1056, 811, false), g, '같은 입력 같은 기하(G16)');
  const gg = geomOf('41', 1056, 811, false);
  assert.equal(gg.own.length, 31); assert.ok(gg.ctx.length === 25 && gg.ctx.every((c) => c.s === '11'), '경기 판의 맥락 면 = 서울');
  assert.equal(geomOf('11', 1056, 811, false).own.length, 25);
  const gi = geomOf('28', 374, 360, true); assert.equal(gi.own.length, 9); assert.equal(gi.inset.units.length, 2);
  assert.ok([g, gg, gi].every((x) => x.k >= 0.6 && x.k <= 0.8));
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

test('같은 숫자: 진행 사업 호수·지연 건수는 사업 화면 수도권 범위(applyFilters metro), 12개월 준공은 지역 공급 수도권의 준공(COMPLETION) 예정과 같고 입주는 따로 센다(2026-10-15 결정: 대표는 준공)', () => {
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
  const ahead = RG.aheadAll(CAL, 'metro', (c) => c).filter((e) => e.type === 'COMPLETION'), movein = RG.aheadAll(CAL, 'metro', (c) => c).filter((e) => e.type === 'MOVE_IN');
  assert.equal(DOC.total.a, ahead.reduce((s, e) => s + e.units, 0));
  assert.equal(DOC.total.an, ahead.length);
  assert.equal(DOC.total.mi, movein.reduce((s, e) => s + e.units, 0));
  assert.equal(DOC.total.mn, movein.length);
  /* 시도별로도 같다 */
  for (const s of DOC.sido) {
    const sc = V.applyFilters(rows, { sido: s.code });
    assert.equal(s.v.u, sc.filter((r) => r.board <= 3).reduce((t, r) => t + r.units, 0), `${s.name} 진행 호수`);
    assert.equal(s.v.d, sc.filter((r) => r.cls === 'delay').length, `${s.name} 지연`);
    assert.equal(s.v.a, RG.aheadAll(CAL, s.code, (c) => c).filter((e) => e.type === 'COMPLETION').reduce((t, e) => t + e.units, 0), `${s.name} 12개월 준공`);
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
  assert.match(read('app/(map)/map/page.tsx'), /catch \{\s*return withNation\(metroOverview\(map, null\)\);/);
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
        assert.equal(g.href, g.code === u.code ? `/map?sgg=${g.code}&gu=none` : `/map?sgg=${g.code}`);   // 구 미정(시 단위 코드)은 ?gu=none — 없으면 지도 첫 스크립트가 다시 구 메뉴로 넘긴다
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

test('색·글자 대비: 라이트·다크 모두 면 단계마다 라벨 글자가 4.5:1 이상이고, 값이 클수록 짙다(옅음 → 짙음)', () => {
  const { mapVars } = require('./map-tokens.cjs');   // 면·글자 색 값은 app/globals.css 의 --map-ov-*(2026-10-18), app.css 의 --ov-* 는 가리키기만 한다
  const vars = (sel) => mapVars({ theme: sel === ':root' ? 'dark' : 'light' });
  const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  for (const sel of [':root', 'html[data-map-shell]:not(.dark)']) {
    const v = vars(sel);
    for (let i = 0; i <= 5; i++) assert.ok(ratio(v[`--ov-${i}`], v[`--ov-ink-${i}`]) >= 4.5, `${sel} 단계 ${i}: ${ratio(v[`--ov-${i}`], v[`--ov-ink-${i}`]).toFixed(2)}`);
    const L = [1, 2, 3, 4, 5].map((i) => lum(v[`--ov-${i}`]));
    assert.ok(L.every((x, i) => !i || x < L[i - 1]), `${sel}: 값이 클수록 짙게(다크도 옅음 → 짙음)`);
  }
});

test('화면 연결: 레이아웃 첫 스크립트 → 개요/상세 CSS 분기, 페이지가 개요 값을 지도 섬에 넘기고, 지도 섬은 개요에서 3D 공용 모듈과 개요 모듈만 부른다(앱·키·지역 자료 없음 — 진짜 3D 모듈·maplibre 는 개요 모듈이 WebGL 판정 뒤 동적으로)', () => {
  const layout = read('app/(map)/layout.tsx'), page = read('app/(map)/map/page.tsx'), island = read('components/MapIsland.tsx'), css = read('assets/css/app.css');
  assert.match(layout, /<script dangerouslySetInnerHTML=\{\{ __html: MAP_MODE_INIT \}\} \/>/);
  assert.ok(layout.indexOf('THEME_INIT }}') < layout.indexOf('MAP_MODE_INIT }}'));
  assert.match(page, /<OverviewMarkup \/>/);
  assert.match(page, /<MapIsland \{\.\.\.props\} overview=\{await overviewDoc\(\)\} overviewSrc=\{props\.assets\[OVERVIEW_JS\] \|\| OVERVIEW_JS\} map3dSrc=\{props\.assets\[MAP3D_JS\] \|\| MAP3D_JS\} \/>/);
  assert.match(page, /const OVERVIEW_JS = '\/assets\/js\/overview\.js';/);
  assert.match(page, /const MAP3D_JS = '\/assets\/js\/map3d\.js';/);
  assert.match(page, /<div className="ov-stage" id="ovStage" tabIndex=\{0\} role="listbox" aria-label="수도권 시군구 지도"><svg className="map" role="presentation" \/><\/div>/, '3D 지도 무대(탭 정지점 하나)');
  assert.match(layout, /<link rel="stylesheet" href="\/assets\/css\/map3d\.css" \/>/, '3D 지도 모양(/citizen 과 같은 파일)');
  assert.match(page, /getProjectsIndex\(\)/, '사업 화면과 같은 읽기');
  assert.match(island, /if \(document\.documentElement\.getAttribute\('data-map-mode'\) === 'overview' && overviewSrc && map3dSrc\) \{/);
  const ov = island.slice(island.indexOf("=== 'overview'"), island.indexOf('return;\n    }'));
  assert.match(ov, /const m3 = load\(map3dSrc\), ov = load\(overviewSrc\);/, '3D 공용 모듈 → 개요 모듈 순서');
  assert.doesNotMatch(ov, /APP|CONFIG|RegionLoader|LOADVIEW|LIBS/, '개요는 MapLibre·앱·키·지역 자료·로딩 화면을 부르지 않는다');
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

test('같은 구현: /map 개요와 /citizen 은 같은 3D 모듈(진짜 3D assets/js/map3d-gl.js · SVG 대체 assets/js/map3d.js · assets/css/map3d.css)로 그린다 — 개요는 MapLibre 를 직접 만지지 않고(MapGL 만), 지표 전환은 칠하기만', () => {
  const ov = read('assets/js/overview.js'), tpl = read('tools/design/public-mock/template.html'), build = read('tools/design/public-mock/build.js');
  const m3 = read('assets/js/map3d.js'), m3css = read('assets/css/map3d.css'), ops = read('assets/citizen/index.html');
  for (const k of ['M3.prep(', 'M3.geom(', 'M3.draw(', 'M3.labels(', 'M3.recolor(', 'M3.paintFaces(', 'M3.keyMove(']) assert.ok(ov.includes(k), `개요 ${k}`);
  assert.doesNotMatch(ov, /maplibregl|setPaintProperty|addLayer|'fill'|fitBounds|toGeoJSON|unproject/, '개요는 MapLibre 층·카메라를 직접 만지지 않는다(공용 모듈 MapGL 만)');
  for (const k of ['win.MapGL.mount(', 'win.MapGL.supported(doc)', 'win.MapGL.load(', 'win.MapGL.readColors(', 'GL.map.flyTo(S.sido || null', 'GL.map.setClasses(', 'GL.map.labels(']) assert.ok(ov.includes(k), `개요 ${k}`);
  for (const k of ['Map3D.prep(', 'Map3D.geom(', 'Map3D.draw(', 'Map3D.labels(', 'Map3D.paintFaces(', 'Map3D.keyMove(']) assert.ok(tpl.includes(k), `/citizen ${k}`);
  for (const k of ['function arcsOf', 'function labelPoint', 'function faceClassAt', 'const textW', 'svg.innerHTML = ']) assert.ok(!tpl.includes(k), `/citizen 에 옛 사본 ${k}`);
  assert.match(build, /'\/\*__MAP3D__\*\/': map3d,/); assert.match(build, /'\/\*__MAP3D_CSS__\*\/': map3dCss,/);
  assert.ok(ops.includes(m3.trim()) && ops.includes(m3css.trim()), '/citizen 운영판에 같은 모듈·모양이 그대로 들어 있다');
  assert.equal(read('public/assets/js/map3d.js'), m3); assert.equal(read('public/assets/css/map3d.css'), m3css);
  /* G16: 지표를 바꿔도(paint) 기하를 다시 만들지 않는다. 기하는 drawMap(범위·무대 크기가 바뀔 때)에서만 */
  const fn = (nm) => { const i = ov.indexOf(`    function ${nm}(`); return ov.slice(i, ov.indexOf('\n    }\n', i)); };
  assert.doesNotMatch(fn('paint'), /M3\.(geom|draw)|drawMap/); assert.doesNotMatch(fn('setMetric'), /drawMap/);
  assert.match(fn('setSido'), /drawMap\(true\)/, '범위(시도)가 바뀔 때만 새 기하');
  assert.equal((ov.match(/M3\.draw\(/g) || []).length, 1);
  /* 키보드(공용): 화살표는 그 방향의 가장 가까운 라벨 점, Enter·Space 는 고르기, 다른 키는 다루지 않는다 */
  const f = (key, bx, by) => ({ x: { key }, bx, by });
  const G = { k: 0.7, F: [f('a', 100, 100), f('b', 200, 100), f('c', 100, 200)] };
  assert.deepEqual(M3.keyMove(G, 'a', 'ArrowRight'), { key: 'b' }); assert.deepEqual(M3.keyMove(G, 'a', 'ArrowDown'), { key: 'c' });
  assert.deepEqual(M3.keyMove(G, 'a', 'ArrowLeft'), { key: 'a' }, '그 방향에 없으면 그대로');
  assert.deepEqual(M3.keyMove(G, 'b', 'Enter'), { key: 'b', enter: true }); assert.equal(M3.keyMove(G, 'a', 'x'), null);
  /* 높이: 지수 0.75 척도(Hmin 4), 0 은 평평, 값 순위 = 높이 순위 */
  assert.deepEqual(M3.faceH([0, 25, 100], 4, 18).map((v) => +v.toFixed(2)), [0, 8.95, 18]);
  const hh = M3.faceH([0, 1, 2, 2, 7, 50, 100], 4, 44); assert.ok(hh[0] === 0 && hh[2] === hh[3] && hh[1] < hh[2] && hh[2] < hh[4] && hh[4] < hh[5] && hh[5] < hh[6] && hh[6] === 44);
  /* 상한 8%(16~48), 가림 55%·평균 80%, 하한 = 상한의 60% 이상 */
  const m3src = read('assets/js/map3d.js');
  assert.match(m3src, /Math\.max\(16, Math\.min\(48, Math\.round\(H \* \.08\)\)\)/);
  assert.match(m3src, /V\.min < \.55 \|\| V\.avg < \.8/); assert.match(m3src, /Math\.ceil\(g\.Hmax0 \* \.6\)/); assert.match(m3src, /faceH\(g\.own\.map\(\(q\) => q\.u\), 4, Hmax\)/);
});

test('같은 숫자(개요 ↔ 상세 머리 줄 ↔ 사업 화면): 수도권 시군구마다 상세 지도가 원장 파일로 센 진행(①~④) 호수·건수·호수 미확인이 개요 값, /projects?sgg= 진행 행과 같다', () => {
  const by = O.valuesBySgg(rows, CAL, IDX.sgg);
  const codes = Object.keys(MAP.bySgg).filter((c) => O.unitOf(c));
  assert.ok(codes.length >= 60);
  for (const c of codes) {
    const doc = JSON.parse(read(`data/board/home-map/${c}.json`));
    const t = R.homeTally([doc], R.homeToProjects([doc]).unlocated.map((r) => r.id)), v = by.get(c);
    assert.deepEqual([t.u, t.n, t.q], [v.u, v.n, v.q], `${c}: 상세 머리 줄 = 개요`);
    const p = V.applyFilters(rows, { sgg: c }).filter((r) => r.board <= 3);
    assert.deepEqual([t.u, t.n], [p.reduce((s, r) => s + (r.units > 0 ? r.units : 0), 0), p.length], `${c}: 상세 머리 줄 = 사업 화면 진행`);
    assert.deepEqual(t.st.map((s) => s.n), v.st, `${c}: 단계 칸 건수 = 개요 단계별 수`);
  }
  /* 고양시 덕양구: 진행 9건 10,110호 중 ①계획 2건 4,164호는 위치 미확보라 지도 표시 7건(2026-10-20 HOME 판 — 10-19 판: 8건 8,516호 중 ①계획 1건 2,570호(구 국방대학교)) */
  const gy = JSON.parse(read('data/board/home-map/41281.json')), t = R.homeTally([gy], R.homeToProjects([gy]).unlocated.map((r) => r.id));
  assert.deepEqual([t.u, t.n, t.lostN, t.lostU, t.st[0].u], [10110, 9, 2, 4164, 4164]);
  assert.equal(DOC.units.find((u) => u.code === '41280').gu.find((g) => g.code === '41281').v.u, 10110);
});

test('상세 머리 줄 연결: 수도권은 합계(#hudSum)·6단계 칸을 원장 기준(REGION.home.tally)으로 적고, 지도에 그리지 못한 진행 사업은 둘째 줄 \'지도 표시 n건(위치 미확보 m건 · k호)\'', () => {
  const app = read('assets/js/app.js'), reg = read('assets/js/region.js');
  assert.match(reg, /tally: homeTally\(raw\.home, home\.unlocated\.map\(\(r\) => r\.id\)\)/);
  assert.match(app, /const HOME_T = REG\.home && !REG\.home\.failed && REG\.home\.tally/);
  assert.match(app, /let SUM_TOTAL = HOME_T \? homeSumTotal\(HOME_T\) : null/);
  assert.match(app, /if \(!HOME_T\) SUM_TOTAL = /);
  assert.match(app, /const h = HOME_T && HOME_T\.st\[i\]/);
  assert.match(app, /지도 표시 \$\{t\.n - t\.lostN\}건\(\$\{lost\}\)/);
});

/* ---------- 2026-10-18 사용자 피드백: 전국 시도 경계(수도권 보기의 맥락 면) · 순위 막대 목록(패널 세로 스크롤 없음). 같은 날 사용자 지시로 첫 화면 범위는 전국 → 수도권 전체 ---------- */
const KS = require('../../data/board/korea-sido.json');
const KT = require('../../tools/ledger/korea-sido.js');
test('전국 시도 경계(korea-sido/1): 원천·이용 조건·받은 날을 머리에, region-map/1 과 같은 투영 정수, 시도 16곳(광주·전남은 전남광주 12 하나), 고리·대표점 유효, 크기 상한', () => {
  assert.equal(KS.schema, 'korea-sido/1');
  assert.deepEqual(Object.keys(KS).slice(0, 2), ['source', 'schema'], '출처가 파일 머리');
  assert.match(KS.source.name, /V-World .*LT_C_ADSIDO_INFO/); assert.equal(KS.source.license, '공공누리 제1유형(출처표시)'); assert.match(KS.source.fetched, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(KS.projection.startsWith(RM.projection), '같은 투영 식');
  const molit = require('../../data/board/molit.json').sido.filter((s) => s.code !== '00');
  assert.equal(KS.sido.length, 16);
  assert.deepEqual(KS.sido.map((x) => x.s).sort(), molit.map((s) => s.code).sort(), '시도 코드 = 통계누리 시도(전남광주 12)');
  assert.ok(!KS.sido.some((x) => x.s === '29' || x.s === '46'), '광주 29·전남 46 따로 없음(2026-07 통합)');
  for (const x of KS.sido) {
    assert.equal(x.n, molit.find((s) => s.code === x.s).name, `${x.s} 짧은 이름`);
    const rs = J.pathRings(x.d);
    assert.ok(rs.length && rs.every((r) => r.length >= 3 && r.every(([a, b]) => Number.isInteger(a) && Number.isInteger(b))), `${x.n}: 정수 고리`);
    assert.ok(rs.some((r) => J.inRing(x.l, r)), `${x.n}: 대표점이 면 안`);
  }
  /* 투영 확인: region-map 수도권 시군구 67곳의 대표점이 모두 korea-sido 의 그 시도 면 안(같은 식·같은 좌표계), 다른 시도 면 밖 */
  for (const u of DOC.units) {
    const p = J.labelPoint(J.pathRings(u.d)), own = KS.sido.find((x) => x.s === u.s);
    assert.ok(J.pathRings(own.d).some((r) => J.inRing(p, r)), `${u.name} → ${own.n} 면 안`);
    assert.ok(!KS.sido.filter((x) => x !== own).some((x) => J.pathRings(x.d).some((r) => J.inRing(p, r))), `${u.name}: 다른 시도 면 밖`);
  }
  /* 울릉도·독도는 남긴다(경도 130.5° 동쪽 고리) */
  const eastX = (130.5 - 124.5) * Math.cos(37.5 * Math.PI / 180) * 1000, gb = J.pathRings(KS.sido.find((x) => x.s === '47').d).filter((r) => r.every(([x]) => x > eastX));
  assert.ok(gb.length >= 2 && gb.some((r) => r.every(([x]) => x > (131.8 - 124.5) * Math.cos(37.5 * Math.PI / 180) * 1000)), '울릉도·독도');
  const kb = Buffer.byteLength(JSON.stringify(KS)) / 1024;
  assert.ok(kb <= 120, `단순화 크기 ${kb.toFixed(0)} KB ≤ 120 KB`);
  const all = KS.sido.flatMap((x) => J.pathRings(x.d)), bb = J.ringsBox(all);
  assert.ok(KS.view[0] <= bb[0] && KS.view[1] <= bb[1] && KS.view[0] + KS.view[2] >= bb[0] + bb[2] && KS.view[1] + KS.view[3] >= bb[1] + bb[3], '보기 상자가 전국을 덮는다');
  /* 도구: 이웃 두 시도가 같은 경계를 서로 다른 꼭짓점으로 그려도 공유 호로 같은 점을 쓴다(결정적) */
  const sq = (x0, x1, extra) => ({ type: 'Polygon', coordinates: [[[x0, 37], [x1, 37], ...(extra || []), [x1, 37.5], [x0, 37.5], [x0, 37]]] });
  const raw = { fetched: '2026-10-18', features: [{ code: '11', name: '서울특별시', geometry: sq(126.5, 127) }, { code: '41', name: '경기도', geometry: { type: 'Polygon', coordinates: [[[127, 37], [127.5, 37], [127.5, 37.5], [127, 37.5], [127, 37.2], [127, 37]]] } }] };
  const d1 = KT.buildSido(raw), d2 = KT.buildSido(raw);
  assert.deepEqual(d1, d2); assert.equal(d1.sido.length, 2);
  const pts = (d) => new Set(J.pathRings(d).flat().map((p) => p.join()));
  const shared = [...pts(d1.sido[0].d)].filter((k) => pts(d1.sido[1].d).has(k));
  assert.ok(shared.length >= 2, '맞닿은 변의 끝점을 함께 쓴다');
  assert.match(read('tools/ledger/korea-sido.js'), /공공누리 제1유형\(출처표시\)/);
  assert.match(read('tools/ledger/region-supply.js'), /module\.exports = \{[^}]*\bsggPaths\b/);
});

test('수도권 보기: 쿼리 없는 /map 은 수도권 본토 무대(섬 강화·옹진 제외 — 판 65면, 섬 삽입 지도 없음, 무대 = 본토 판 상자), 수도권 밖 13개 시도는 평평한 맥락 면(무대 밖은 잘림), ?sido= 는 그 시도 판 — 수도권 밖 면은 고를 수 없다(사건·tabindex·data-area 없음)', () => {
  const base = M3.prep(J.seedOf(DOC.units)), uOf = Object.fromEntries(DOC.units.map((u) => [u.code, u.v ? u.v.u : 0]));
  const nation = { view: KS.view, sido: KS.sido }, nat = M3.prep(nation.sido.map((x) => ({ code: x.s, s: x.s, n: x.n, d: x.d, lx: x.l[0], ly: x.l[1] })));
  const sc = J.scopeOf(DOC.units, '', DOC.view);
  const natOf = (W, H, narrow) => M3.geom(base, { ...sc, ...J.nationOpt(nat), W, H, narrow, uOf });
  const plainOf = (W, H, narrow) => M3.geom(base, { ...sc, W, H, narrow, uOf });   // /citizen 수도권 지도와 같은 호출(맥락 면 없음)
  for (const [W, H, narrow] of [[1056, 811, false], [1480, 900, false], [760, 700, false], [374, 360, true]]) {
    const g = natOf(W, H, narrow), p = plainOf(W, H, narrow);
    assert.equal(g.nat, true); assert.equal(g.own.length, 65); assert.equal(g.inset, null, '섬 삽입 지도 없음'); assert.ok(g.own.every((o) => !J.ISLES.includes(o.code)) && g.own.some((o) => o.code === '28155'), '섬은 빼고 영종구는 판에');
    assert.equal(g.ctx.length, 13); assert.ok(g.ctx.every((c) => !['11', '28', '41'].includes(c.s) && c.rings.length && c.n), '맥락 면 = 수도권 밖 시도(이름 있음)');
    /* 크기감 = /citizen: 맥락 면을 붙여도 판의 배율·기울기·원점·높이 상한·면이 맥락 면 없는 판과 같다 */
    for (const k of ['k', 's', 'ox', 'oy', 'T', 'Hmax0']) assert.equal(g[k], p[k], `${W}×${H} ${k}`);
    assert.deepEqual(g.own, p.own); assert.deepEqual(g.inset, p.inset);
    assert.equal(g.Hmax0, Math.max(16, Math.min(48, Math.round(H * .08))), '높이 상한은 시도 보기·/citizen 과 같은 규칙(전국 무대의 8~16 상한 아님)');
    /* 판이 무대를 채운다: 판 점은 모두 무대 안이고, 가로나 세로 한쪽은 무대의 85% 이상 */
    const bb = [Infinity, Infinity, -Infinity, -Infinity];
    for (const o of g.own) for (const r of o.rings) for (const [x, y] of r.pts) { bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], y); bb[2] = Math.max(bb[2], x); bb[3] = Math.max(bb[3], y); }
    assert.ok(bb[0] >= -1 && bb[1] >= -1 && bb[2] <= W + 1 && bb[3] <= H + 1, `판이 무대 안 ${W}×${H}`);
    assert.ok((bb[2] - bb[0]) / W >= .85 || (bb[3] - bb[1]) / H >= .85, `판이 무대를 채운다 ${W}×${H}: ${((bb[2] - bb[0]) / W).toFixed(2)} × ${((bb[3] - bb[1]) / H).toFixed(2)}`);
    /* 맥락 면은 무대 밖으로 나가도 된다(잘림) — 수도권 밖 시도 일부는 무대 밖에 점이 있다 */
    assert.ok(g.ctx.some((c) => c.rings.some((r) => r.some(([x, y]) => x < 0 || y < 0 || x > W || y > H))), '맥락 면은 무대 밖으로 잘린다');
    assert.deepEqual(natOf(W, H, narrow), g, '같은 입력 같은 기하(G16)');
  }
  assert.deepEqual(J.nationOpt(null), {}, '전국 자료가 없으면 수도권 판만');
  assert.equal(J.nationOpt(nat).ctxOmit, J.SIDO); assert.ok(!('fit' in J.nationOpt(nat)), '무대는 전국 상자가 아니라 판 상자');
  /* 옵션을 주지 않으면(/citizen·시도 보기) 예전과 같다: 경기 판의 맥락 면은 서울 */
  const gg = M3.geom(base, { ...J.scopeOf(DOC.units, '41', DOC.view), W: 1056, H: 811, narrow: false, uOf });
  assert.ok(!gg.nat && gg.ctx.length === 25 && gg.ctx.every((c) => c.s === '11'));
  /* 고를 수 없음: 맥락 면 경로는 data-area·role·tabindex 없이 aria-hidden, 개요의 면 찾기는 data-area 가 있는 판 면만 */
  const m3 = read('assets/js/map3d.js'), ov = read('assets/js/overview.js');
  assert.match(m3, /\$\{g\.ctx\.map\(\(c\) => `<path class="ctx" d="\$\{dOf\(c\.rings, T\)\}" aria-hidden="true"\/>`\)\.join\(''\)\}/);
  assert.match(ov, /const faceOf = \(t\) => \{ const el = t && t\.closest && t\.closest\('\.map \[data-area\]'\); return el && byCode\.get\(el\.dataset\.area\) && G && G\.F\.some/);
  assert.doesNotMatch(read('assets/css/map3d.css'), /\.ctx[^{]*\{[^}]*cursor/, '맥락 면은 누름 모양 없음');
  /* 기본 보기 = 수도권 전체, 누르면(면·Enter) 그 시도 보기로 확대. 이름표는 겹치면 숨김(strict) 그대로 */
  assert.equal(J.modeOf('').sido, '');
  assert.match(ov, /M3\.geom\(base, \{ \.\.\.sc, \.\.\.\(S\.sido \? \{\} : nationOpt\(nat\)\), W, H, narrow,/);
  assert.match(ov, /if \(u\) \{ hideTip\(\); if \(!S\.sido\) \{ setSido\(u\.s, true\); return; \}/);
  assert.match(ov, /if \(r\.enter && !S\.sido\) \{ const u = byCode\.get\(r\.key\); if \(u\) setSido\(u\.s, true\); return; \}/);
  assert.match(ov, /\$\('ovCards'\)\.addEventListener\('click', \(e\) => \{ const b = e\.target\.closest\('button\[data-s\]'\); if \(b\) setSido\(S\.sido === b\.dataset\.s \? '' : b\.dataset\.s, true\); \}\);/, '시도 카드도 확대(다시 누르면 수도권 전체)');
  /* 맥락 시도 이름(옅게, 그 시도 면 안) — 수도권 보기에서만 */
  assert.match(m3, /if \(g\.nat\) \{ G0\.ctxLs = g\.ctx\.filter/);
  assert.match(read('assets/css/map3d.css'), /\.map \.lbls \.lb-ctx\.far \{ fill: color-mix\(in srgb, var\(--foreground\) \d+%, var\(--map-ctx\)\); \}/);
  /* 페이지가 전국 자료를 붙인다 */
  const page = read('app/(map)/map/page.tsx');
  assert.match(page, /import koreaSidoJson from '@\/data\/board\/korea-sido\.json';/); assert.match(page, /return withNation\(metroOverview\(map, \{ rows/);
});

test('순위 막대 목록: 줄 = 순위·이름·막대(값 비례, 지도 면과 같은 단계 색)·값, 패널 남은 높이에 들어가는 줄만(ResizeObserver → rowsFit, 넘친 줄 hidden), 나머지는 \'전체 n ›\' 목록(그 안만 스크롤) — 누름·가리킴·키보드는 두 목록 같게', () => {
  assert.equal(J.rowsFit(480, 34, 67), 14); assert.equal(J.rowsFit(480, 34, 9), 9, '다 들어가면 다'); assert.equal(J.rowsFit(20, 34, 9), 0); assert.equal(J.rowsFit(340, 34, 31), 10, '꼭 맞는 높이'); assert.equal(J.rowsFit(300, 0, 5), 5, '줄 높이를 못 재면 다');
  assert.equal(J.barPct(100, 100), 100); assert.equal(J.barPct(1, 1000), 2, '0 이 아니면 최소 2%'); assert.equal(J.barPct(0, 100), 0); assert.equal(J.barPct(333, 1000), 33.3);
  const ov = read('assets/js/overview.js'), css = read('assets/css/app.css'), page = read('app/(map)/map/page.tsx');
  assert.match(ov, /<span class="ov-rbar" aria-hidden="true">\$\{D\.ok && x \? `<i class="ov-sw c\$\{classOf\(x, ups\)\}" style="width:\$\{barPct\(x, top\)\}%"><\/i>` : ''\}<\/span>/, '막대 색 = 면 단계(cN), 길이 = 1위 대비');
  assert.match(ov, /function fitRanks\(\) \{\n\s*const L = \$\('ovRank'\), li = \[\.\.\.L\.children\], h = li\[0\] \? li\[0\]\.offsetHeight : 0, n = rowsFit\(L\.clientHeight, h, li\.length\);\n\s*li\.forEach\(\(x, i\) => \{ x\.hidden = i >= n; \}\);/);
  assert.match(ov, /new win\.ResizeObserver\(\(\) => fitRanks\(\)\)\.observe\(\$\('ovRank'\)\)/);
  assert.match(ov, /\$\('ovRank'\)\.innerHTML = hit\.map\(\(u, i\) => rankRow\(u, i, false\)\)\.join\(''\);/, '패널 목록은 값 있는 곳만');
  assert.match(ov, /\$\('ovRankAll'\)\.innerHTML = hit\.map\(\(u, i\) => rankRow\(u, i, false\)\)\.join\(''\)\n\s*\+ \(none\.length \?/, '전체 목록 끝에 값 없음 묶음');
  assert.match(ov, /allBtn\.innerHTML = `전체 \$\{list\.length\}\$\{ICON_MORE\}`;/);
  /* 패널은 스크롤하지 않고 목록 칸이 남은 높이를 받는다. 전체 목록만 스크롤 */
  assert.match(css, /\.ov-panel\{position:relative;[^}]*overflow:hidden;/);
  assert.match(css, /\.ov-ranks\{flex:1 1 0;[^}]*min-height:0\}/); assert.match(css, /\.ov-panel \.ov-rank\{flex:1 1 0;min-height:0;overflow:hidden\}/);
  assert.match(css, /\.ov-sheet \.ov-rank\{[^}]*overflow-y:auto/);
  assert.match(css, /\.ov-panel\[data-sheet="full"\]\{height:86%\}/, '휴대폰 시트를 펴도 스크롤 없이 줄이 는다');
  assert.match(page, /<button type="button" className="ov-all" id="ovAll" aria-haspopup="dialog" aria-expanded="false" aria-controls="ovSheet" \/>/);
  assert.match(page, /<div className="ov-sheet" id="ovSheet" role="dialog" aria-labelledby="ovSheetH" hidden>/);
  /* 같은 동작: 누름 → choose(구 메뉴·상세), 가리킴·초점 → 면 효과, 키보드 로빙, Esc 로 닫고 여는 단추로 */
  assert.match(ov, /for \(const L of LISTS\) L\.addEventListener\('click', \(e\) => \{/);
  assert.match(ov, /L\.addEventListener\('mouseover', \(e\) => \{ const b = e\.target\.closest\('button\[data-c\]'\); if \(b\) hover\(b\.dataset\.c\); \}\);/);
  assert.match(ov, /for \(const L of LISTS\) L\.querySelectorAll\('button\[data-c\]'\)\.forEach\(\(b\) => b\.classList\.toggle\('hl', b\.dataset\.c === S\.hover\)\);/, '면 가리킴 → 목록 줄 강조');
  assert.match(ov, /if \(e\.key === 'Escape' && !S\.menu\) \{ e\.preventDefault\(\); openSheet\(false\); \}/);
  /* 문구는 숫자·짧은 이름표만, 색·크기는 토큰만 */
  for (const r of [/\.ov-rbar\{[^}]*\}/, /\.ov-all\{[^}]*\}/, /\.ov-sheet\{[^}]*\}/]) assert.doesNotMatch(css.match(r)[0], /#[0-9a-fA-F]{3,6}\b|rgb\(|font-size:\d|border-radius:\d/);
});
