'use strict';
/* 수도권 지도 보강(2026-10-14 지도 연결 작업): 경량 번들(tools/ledger/home-lite.js → data/board/home-lite → assets/home-lite),
   이름 검색 근사 위치(tools/ledger/home-geocode.js → mappings/home-geocode.json → home-map loc.by 'name'),
   지도 쿼리(?sgg=·?project=) 처리와 지도 → 화면 연결점(카드·위치 미확보 목록 → /projects?id=), 지역 선택기의 수도권 시군구 목록. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

const L = require('../../tools/ledger/home-lite.js');
const G = require('../../tools/ledger/home-geocode.js');
const H = require('../../tools/ledger/home-map.js');
const V = require('../../tools/ledger/home-vworld.js');
const R = require('../../assets/js/region.js');
const { build } = require('../../scripts/build.js');

const ROOT = path.join(__dirname, '../..');
const LITE = path.join(ROOT, L.OUT_DIR);
const MAPDIR = path.join(ROOT, H.OUT_DIR);
const app = fs.readFileSync(path.join(ROOT, 'assets/js/app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'assets/css/app.css'), 'utf8'), html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* ---------- 경량 번들 생성기(순수 함수) ---------- */
const sq = (x, y, d = 0.0001) => ({ type: 'MultiPolygon', coordinates: [[[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]]] });
const F = (x, y, p = {}) => ({ type: 'Feature', properties: { eh: 9, src: '층수환산', f: 3, ...p }, geometry: sq(x, y) });
function liteFixture() {
  const doc = { schema: 'home-map/1', sgg: '41281', name: '경기도 고양시 덕양구', projects: [
    { id: 'PRJ-41281-0002', loc: { by: 'name', at: [126.85, 37.62] } },
    { id: 'PRJ-41281-0001', loc: { by: 'block', at: [126.8, 37.6] } },
    { id: 'PRJ-41281-0003', loc: { by: 'area', at: [126.9, 37.65] } },   // 시군구 대표점: 둘레 건물을 담지 않는다
    { id: 'PRJ-41281-0004', loc: null },
  ] };
  const features = [F(126.8051, 37.6001, { n: '먼 건물' }), F(126.8002, 37.6003), F(126.8001, 37.6001), F(126.8001, 37.6001), F(126.8503, 37.6202), F(126.9001, 37.6501)];
  const districts = [{ name: '고양창릉 공공주택지구', lon: 126.81, lat: 37.61, rings: [[[126.8, 37.6], [126.81, 37.6], [126.81, 37.61], [126.8, 37.6]]], ids: [] },
    { name: '먼 지구', lon: 127.5, lat: 37.0, rings: [[[127.5, 37], [127.51, 37], [127.51, 37.01], [127.5, 37]]], ids: ['PRJ-41281-0004'] },   // 연결 사업이 이 시군구면 넣는다
    { name: '남의 지구', lon: 127.6, lat: 37.1, rings: [[[127.6, 37.1], [127.61, 37.1], [127.61, 37.11], [127.6, 37.1]]], ids: ['PRJ-11110-0001'] }];
  const blocks = [{ label: '고양창릉 A4', at: [126.8, 37.6] }, { label: '고양창릉 S2', at: [126.82, 37.61] }, { label: '밖 A1', at: [128, 36] }];
  const inside = (p) => p[0] > 126.7 && p[0] < 127 && p[1] > 37.5 && p[1] < 37.7;
  return { doc, opts: { features, districts, blocks, inside, basis: '20261014', edition: '20261014T102506Z' } };
}

test('경량 번들 생성기: 위치 있는 사업 둘레 300 m 건물 + 블록 사업이 든 작은 지구 안 건물(중심점 순·겹치면 하나), 시군구 지구·블록, 같은 입력 → 같은 바이트', () => {
  const a = liteFixture(), b = liteFixture();
  b.opts.features.reverse(); b.opts.districts.reverse(); b.opts.blocks.reverse();   // 원천 순서가 바뀌어도 같은 바이트
  const da = L.liteDoc(a.doc, a.opts), db = L.liteDoc(b.doc, b.opts);
  assert.equal(L.renderLite(da), L.renderLite(db));
  assert.equal(da.buildings.length, 4);   // 시군구 대표점 둘레·같은 건물 둘째는 뺀다. 300 m 밖(약 450 m) '먼 건물'은 블록 사업이 든 작은 지구(고양창릉 픽스처) 안이라 담는다
  assert.ok(!da.buildings.some((f) => f.geometry.coordinates[0][0][0][0] === 126.9001));
  assert.ok(da.buildings.some((f) => f.geometry.coordinates[0][0][0][0] === 126.8051)); assert.deepEqual(da.wide, ['고양창릉 공공주택지구']);
  assert.deepEqual(da.projects, [['PRJ-41281-0001', 2], ['PRJ-41281-0002', 1]]);
  assert.deepEqual(da.districts.map((d) => d.name), ['고양창릉 공공주택지구', '먼 지구']);
  assert.deepEqual(da.blocks.map((x) => x.label), ['고양창릉 S2']);   // 사업 표지와 같은 점(A4)·시군구 밖은 뺀다
  assert.equal(da.radiusM, 300); assert.equal(da.basis, '20261014');
  assert.equal(L.liteDoc({ sgg: '41000', projects: [{ id: 'x', loc: null }] }, { ...a.opts, districts: [], blocks: [] }), null);   // 담을 것이 없으면 파일도 없다
});

test('경량 번들 건물 부호화: 정수 차이 부호화 → 지도(region.js liteFeatures)가 되돌리면 원래 좌표와 같은 수(요청 시 조회 건물과 중심점으로 겹침을 거른다)', () => {
  const g1 = { type: 'MultiPolygon', coordinates: [[[[126.123456, 37.654321], [126.123789, 37.654321], [126.123789, 37.654999], [126.123456, 37.654321]], [[126.1235, 37.6544], [126.1236, 37.6544], [126.1236, 37.6545], [126.1235, 37.6544]]]] };
  const g2 = { type: 'Polygon', coordinates: [[[127.000001, 36.999999], [127.000101, 36.999999], [127.000101, 37.000099], [127.000001, 36.999999]]] };
  const rows = JSON.parse(JSON.stringify([[{ eh: 3, src: '정보없음' }, L.encodeGeometry(g1)], [{ eh: 30, src: '공식높이', h: 30 }, L.encodeGeometry(g2)]]));
  const back = R.liteFeatures(rows);
  assert.deepEqual(back.map((f) => f.geometry), [g1, g2]);
  assert.deepEqual(back[1].properties, { eh: 30, src: '공식높이', h: 30 });
  assert.deepEqual(R.liteFeatures([['x'], null, [{ eh: 1 }, 'bad']]), []);
});

test('경량 번들 파일: 수도권 시군구 목록(index.json)과 형식, 시군구 gzip ≤ 150 KB, 사업당 건물 gzip ≤ 50 KB, 근사 위치(name) 사업은 150 m 만', () => {
  const idx = JSON.parse(fs.readFileSync(path.join(LITE, 'index.json'), 'utf8'));
  const sggs = fs.readdirSync(MAPDIR).filter((f) => /^\d{5}\.json$/.test(f)).map((f) => f.slice(0, 5)).sort();
  assert.deepEqual(idx.sggs.map((x) => x.sgg), sggs);
  for (const x of idx.sggs) {
    const f = path.join(LITE, `${x.sgg}.json`);
    assert.equal(fs.existsSync(f), x.lite, x.sgg);
    if (!x.lite) continue;
    const text = fs.readFileSync(f, 'utf8'), d = JSON.parse(text);
    assert.equal(d.schema, 'home-lite/1'); assert.equal(d.sgg, x.sgg); assert.equal(d.radiusM, 300); assert.equal(d.approxRadiusM, 150);
    assert.ok(zlib.gzipSync(text).length <= 150 * 1024, `${x.sgg} gzip`);
    const feats = R.liteFeatures(d.buildings);
    assert.equal(feats.length, d.buildings.length, x.sgg);
    const home = JSON.parse(fs.readFileSync(path.join(MAPDIR, `${x.sgg}.json`), 'utf8'));
    for (const [id, n] of d.projects) {
      const loc = home.projects.find((r) => r.id === id).loc, at = loc.at, rM = loc.by === 'name' ? 150 : 300;
      const mine = d.buildings.filter((_, i) => V.distM(at, feats[i].geometry.coordinates[0][0].slice(0, -1).reduce((a, p, k, arr) => [a[0] + p[0] / arr.length, a[1] + p[1] / arr.length], [0, 0])) <= rM);
      assert.equal(mine.length, n, id);
      assert.ok(zlib.gzipSync(JSON.stringify(mine)).length <= 50 * 1024, `${id} gzip`);
    }
  }
});

/* ---------- 이름 검색 근사 위치 ---------- */
test('근사 위치 검색어: 꾸밈말(북측·인근·부지)·舊·괄호를 떼고 시설 이름으로 끝날 때만, 흔한 낱말 하나(주민센터·우체국)로는 찾지 않는다. 끝이 …동 번지면 지번 검색', () => {
  const q = (n) => G.queriesOf(n, '서울특별시 도봉구').map((x) => `${x.kind}:${x.q}`);
  assert.deepEqual(q('효창공원앞역 북측'), ['place:효창공원앞역']);
  assert.deepEqual(q('신당(약수역)'), ['place:약수역']);
  assert.deepEqual(q('송중동 주민센터'), ['place:송중동 주민센터']);   // 마지막 낱말 '주민센터' 만으로는 찾지 않는다
  assert.deepEqual(q('남인천 우체국'), ['place:남인천 우체국']);
  assert.deepEqual(q('고양시 소재 구 국방대학교'), ['place:고양시 소재 구 국방대학교', 'place:국방대학교']);
  assert.deepEqual(q('성동초 인근'), ['place:성동초등학교']);
  assert.deepEqual(q('서울시 도봉구 창동 700-33'), ['parcel:서울특별시 도봉구 창동 700-33']);
  assert.deepEqual(q('서울 서리풀'), []); assert.deepEqual(q('인천검단 AA13-1'), []); assert.deepEqual(q('강서 군부지'), []);
});

test('근사 위치 채택: 같은 시군구 안 제목이 같은 일치가 한 곳(300 m)에 모일 때만 채택, 흩어지거나 시군구 밖뿐이거나 포함 일치뿐이면 보류', () => {
  const place = { kind: 'place', q: '상봉역' }, inside = (p) => p[0] < 127.2;
  const it = (title, x, y, category = '철도시설') => ({ title, category, parcel: '', point: [x, y] });
  const one = G.decide(place, [it('상봉역(버스정류장)', 127.0857, 37.5967, '도로시설 > 정류장'), it('상봉역', 127.0858, 37.5968), it('상봉역 3번출구', 127.09, 37.59), it('상봉역', 127.0846, 37.5966)], inside);
  assert.equal(one.status, 'ADOPTED'); assert.equal(one.strong, 3); assert.deepEqual(one.at, [127.0858, 37.5968]); assert.equal(one.match, '상봉역');   // 대표는 괄호 없는 시설 자체
  assert.equal(G.decide(place, [it('상봉역', 127.0858, 37.5968), it('상봉역', 127.1, 37.6)], inside).reason, 'spread');
  assert.equal(G.decide(place, [it('상봉역', 127.3, 37.6)], inside).reason, 'outside');
  assert.equal(G.decide(place, [it('상봉역청년주택', 127.0853, 37.5927)], inside).reason, 'none');   // 이름을 포함만 하는 것은 강한 일치가 아니다
  const parcel = { kind: 'parcel', q: '서울특별시 도봉구 창동 700-33', key: '창동 700-33' };
  assert.equal(G.decide(parcel, [{ title: '', category: '', parcel: '서울특별시 도봉구 창동 700-33', point: [127.03, 37.65] }], inside).status, 'ADOPTED');
  assert.equal(G.decide(parcel, [{ title: '', category: '', parcel: '서울특별시 도봉구 창동 700-3', point: [127.03, 37.65] }], inside).reason, 'none');
});

test('home-map 생성기: 이름 검색 근사(name)는 그릴 위치가 없거나 시군구 대표점뿐이고 번들과 이어지지 않은 사업에만, 시군구 이름을 싣는다', () => {
  const P = (id, extra = {}) => ({ local_project_id: id, project_name: `사업 ${id}`, sgg_code: '41281', agency_id: 'lh', stage_code: '04', issued_at: '2026-10-14', superseded_by: null, source_ref: 'home-dump-x', ...extra });
  const tables = { projects: [P('PRJ-41281-0001'), P('PRJ-41281-0002'), P('PRJ-41281-0003')], events: [], units: [], sources: [], areas: [], agencies: [], identifiers: [], project_locations: [], links: [], policies: [] };
  const locations = new Map([['PRJ-41281-0001', { by: 'block', at: [126.8, 37.6], basis: 'B', status: 'REVIEW' }], ['PRJ-41281-0002', { by: 'area', at: [126.9, 37.65], basis: 'APPROXIMATE_AREA', status: 'REVIEW' }]]);
  const g = (id) => [id, { id, status: 'ADOPTED', at: [126.85, 37.62], match: '대곡역' }];
  const geocode = new Map([g('PRJ-41281-0001'), g('PRJ-41281-0002'), g('PRJ-41281-0003')]);
  const doc = H.homeMapFromLedger(tables, { referenceDate: '2026-10-13', observedMonth: '2026-10', locations, geocode, names: new Map([['41281', '경기도 고양시 덕양구']]) })['41281'];
  assert.equal(doc.name, '경기도 고양시 덕양구');
  const by = Object.fromEntries(doc.projects.map((r) => [r.id, r.loc && r.loc.by]));
  assert.deepEqual(by, { 'PRJ-41281-0001': 'block', 'PRJ-41281-0002': 'name', 'PRJ-41281-0003': 'name' });
  assert.deepEqual(doc.projects[1].loc, { by: 'name', at: [126.85, 37.62], basis: 'NAME_SEARCH', status: 'REVIEW', match: '대곡역' });
  const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas/ledger-2026-10', G.OUT_NAME), 'utf8'));
  assert.ok(map.rows.every((r) => ['ADOPTED', 'HELD'].includes(r.status) && (r.status !== 'ADOPTED' || (r.at.length === 2 && r.strong >= 1))));
  assert.equal(G.renderGeocode(map.rows), fs.readFileSync(path.join(ROOT, 'schemas/ledger-2026-10', G.OUT_NAME), 'utf8'));   // 결정적(사업 id 순, 한 행 한 줄)
});

/* ---------- 지도 쿼리 처리(region.js boot) ---------- */
const json = (status, body) => ({ ok: status < 400, status, json: async () => JSON.parse(JSON.stringify(body)) });
function bootWith(search, resolved, files, { lite = {} } = {}) {
  const els = {}, el = (id) => (els[id] = els[id] || { hidden: true, innerHTML: '', textContent: '', addEventListener() {}, setAttribute() {} });
  const doc = { title: '', querySelector: () => null, getElementById: el };
  const urls = [];
  const win = { innerWidth: 1440, location: { search, href: `http://x.test/map${search}`, assign() {} }, HOME_MAP: { 41281: 'abcdef12' }, HOME_LITE: lite,
    fetch: async (u) => { u = String(u); urls.push(u); if (u.startsWith('api/v1/resolve')) return json(200, resolved); if (u in files) return json(200, files[u]); if (u.startsWith('api/v1/')) return json(200, { type: 'FeatureCollection', features: [] }); return json(404, {}); } };
  return { win, doc, els, urls };
}
const RES = (extra = {}) => ({ type: 'sgg', level: 'sgg', sgg: '41281', name: '고양시 덕양구', center: [126.87, 37.63], bbox: [126.75, 37.58, 127.0, 37.72], coverage: { tier: 'none' }, geometry: { type: 'Polygon', coordinates: [[[126.75, 37.58], [127, 37.58], [127, 37.72], [126.75, 37.58]]] }, ...extra });
const row = (id, loc, extra = {}) => ({ id, name: `사업 ${id}`, label: id, issued: true, stage: '04', cls: 'ok', why: null, overdue: null, next: null, units: 300, pks: [], pnus: [], bundles: [], noticeUnits: null, loc, policy: null, ...extra });
const HOME = { schema: 'home-map/1', sgg: '41281', name: '경기도 고양시 덕양구', observedMonth: '2026-10', referenceDate: '2026-10-13', projects: [
  row('PRJ-41281-0001', { by: 'block', at: [126.85, 37.62], basis: 'B', status: 'REVIEW' }),
  row('PRJ-41281-0002', { by: 'name', at: [126.852, 37.621], basis: 'NAME_SEARCH', status: 'REVIEW', match: '대곡역' }),
  row('PRJ-41281-0003', { by: 'area', at: [126.87, 37.63], basis: 'APPROXIMATE_AREA', status: 'REVIEW' }),
  row('PRJ-41281-0004', null),
] };
const LITEDOC = { schema: 'home-lite/1', sgg: '41281', name: '경기도 고양시 덕양구', basis: '20261014', radiusM: 300, projects: [['PRJ-41281-0001', 1]],
  districts: [{ name: '고양창릉 공공주택지구', polys: [[[126.84, 37.61], [126.86, 37.61], [126.86, 37.63], [126.84, 37.61]]] }], blocks: [{ label: '고양창릉 S2', at: [126.855, 37.625] }],
  buildings: [[{ eh: 30, src: '공식높이', h: 30 }, L.encodeGeometry({ type: 'MultiPolygon', coordinates: [[[[126.8501, 37.6201], [126.8502, 37.6201], [126.8502, 37.6202], [126.8501, 37.6201]]]] })]] };
const FILES = { 'assets/home-map/41281.abcdef12.json': HOME, 'assets/home-lite/41281.0badc0de.json': LITEDOC };
const LITE_TABLE = { 41281: { name: '경기도 고양시 덕양구', n: 4, h: '0badc0de' }, 11350: { name: '서울특별시 노원구', n: 9, h: '12345678' }, 28245: { name: '인천광역시 계양구', n: 12 }, 41000: { name: '빈 곳', n: 0 } };

test('?sgg=(수도권): 원장 정적 자료 + 경량 번들 각 1건, permits·infra·ledger 0. 건물·지구·블록을 처음부터 싣고 사업이 모인 곳을 건물이 보이는 확대로 연다', async () => {
  const { win, doc, els, urls } = bootWith('?sgg=41281', RES(), FILES, { lite: LITE_TABLE });
  const r = await R.boot(win, doc);
  assert.equal(r.ok, true);
  assert.equal(urls.filter((u) => u.startsWith('assets/home-lite/')).length, 1); assert.equal(urls.filter((u) => u.startsWith('assets/home-map/')).length, 1);
  assert.deepEqual(urls.filter((u) => /^api\/v1\/(permits|infra|ledger)/.test(u)), []);
  assert.equal(win.GY_BUILDINGS.lite, true); assert.equal(win.GY_BUILDINGS.dynamic, true); assert.equal(win.GY_BUILDINGS.features.length, 1); assert.equal(win.GY_BUILDINGS.meta.basis, '20261014');
  assert.equal(r.districts.length, 1); assert.equal(r.otherBlocks.length, 1); assert.deepEqual(r.lite, { buildings: 1, districts: 1, blocks: 1, radiusM: 300 });
  assert.equal(r.blocks.length, 2); assert.equal(r.home.unlocated.length, 2);
  assert.ok(win.RESOLVED.start.zoom >= 14, `zoom ${win.RESOLVED.start.zoom}`);   // 시군구 전체(확대 11~12)가 아니라 사업 둘레
  assert.ok(Math.abs(win.RESOLVED.start.center[0] - 126.851) < 0.002);
  assert.match(els.pvBanner.innerHTML, /사업 원장 4건 중 2건을 대표점/); assert.doesNotMatch(els.pvBanner.innerHTML, /HOME|미리 담았/, '개발 용어·번들 설명은 화면에 없다');
  assert.ok(!els.locNote || els.locNote.hidden, '?sgg= 로 열면 위치 안내 한 줄은 없다');
  /* 지역 선택기: 번들 + 수도권 시군구(사업 있는 곳만, 시도별), 지금 시군구가 골라져 있다 */
  assert.match(els.regionSel.innerHTML, /<optgroup label="서울"><option value="sgg:11350">노원구 · 9건<\/option><\/optgroup>/);
  assert.match(els.regionSel.innerHTML, /<option value="sgg:41281" selected>고양시 덕양구 · 4건<\/option>/);
  assert.doesNotMatch(els.regionSel.innerHTML, /sgg:41000/); assert.equal(els.regionBox.hidden, false);
});

test('?sgg= 의 첫 시점(homeView): 다 들어가면 그 범위, 너무 넓으면 사업이 가장 많이 모인 곳(확대 14 이상), 하나면 그 사업(16)', () => {
  assert.deepEqual(R.homeView([[126.85, 37.62]], 1040), { center: [126.85, 37.62], zoom: 16, pitch: 50, bearing: 0 });
  const near = R.homeView([[126.85, 37.62], [126.853, 37.621]], 1040);
  assert.ok(near.zoom > 15 && near.zoom <= 16);
  const far = R.homeView([[126.80, 37.60], [126.801, 37.601], [126.802, 37.6], [127.0, 37.7]], 1040);
  assert.ok(far.zoom >= 14); assert.ok(Math.abs(far.center[0] - 126.801) < 0.002);   // 셋이 모인 곳
  assert.equal(R.homeView([], 1040), null);
});

test('?project=(수도권): 위치 있는 사업은 그 표지에서(확대 16.5) 열고 경고를 내린다. 근사 위치는 근사라고, 위치 없는 사업은 시군구 경계 + 목록 강조 + 위치 미확보 한 줄', async () => {
  const P = (id, w = ['project-unlocated']) => RES({ type: 'project', level: 'sgg', project: { id }, warnings: w });
  const a = bootWith('?project=PRJ-41281-0001', P('PRJ-41281-0001'), FILES, { lite: LITE_TABLE });
  await R.boot(a.win, a.doc);
  assert.equal(a.win.RESOLVED.block, 'home-PRJ-41281-0001'); assert.equal(a.win.RESOLVED.start.zoom, 16.5); assert.deepEqual(a.win.RESOLVED.warnings, []);
  assert.ok(Math.abs(a.win.RESOLVED.start.center[0] - 126.85) < 1e-6); assert.equal(a.win.RESOLVED.approx, false); assert.equal(a.win.RESOLVED.lost, null);
  const b = bootWith('?project=PRJ-41281-0002', P('PRJ-41281-0002'), FILES, { lite: LITE_TABLE });
  const rb = await R.boot(b.win, b.doc);
  assert.equal(b.win.RESOLVED.block, 'home-PRJ-41281-0002'); assert.equal(b.win.RESOLVED.approx, true);
  assert.equal(rb.blocks.find((x) => x.pid === 'home-PRJ-41281-0002').approx, true);
  assert.equal(b.els.locNote.hidden, false); assert.match(b.els.locNoteText.innerHTML, /<b>사업 PRJ-41281-0002<\/b> · 근사 위치 — 사업 이름으로 찾은 위치라/);   // 눈에 띄는 한 줄(닫기 단추)
  const c = bootWith('?project=PRJ-41281-0004', P('PRJ-41281-0004'), FILES, { lite: LITE_TABLE });
  await R.boot(c.win, c.doc);
  assert.equal(c.win.RESOLVED.block, null); assert.deepEqual(c.win.RESOLVED.lost, { id: 'PRJ-41281-0004', name: '사업 PRJ-41281-0004' });
  assert.ok(c.win.RESOLVED.shape); assert.ok(c.win.RESOLVED.start.zoom < 14);   // 시군구 경계로
  assert.equal(c.els.locNote.hidden, false); assert.match(c.els.locNoteText.innerHTML, /<b>사업 PRJ-41281-0004<\/b> · 위치 미확보 — 지도에 표시할 위치가 없어 시군구 전체를 보여 줍니다\. <a href="\/projects\?id=PRJ-41281-0004">사업 정보 보기<\/a>/);
  assert.doesNotMatch(c.els.pvBanner.innerHTML, /사업 PRJ-41281-0004/, '작은 요약 띠에 섞지 않는다');
  assert.equal(R.locNoteHtml({ id: 'P<1>', name: '<b>' }).includes('&lt;b&gt;'), true, '이름은 이스케이프');
});

test('경량 번들 표가 없으면(옛 정적 페이지) 경량 번들을 부르지 않고 예전처럼 연다. 비수도권은 그대로', async () => {
  const a = bootWith('?sgg=41281', RES(), FILES);
  const ra = await R.boot(a.win, a.doc);
  assert.ok(!a.urls.some((u) => u.startsWith('assets/home-lite/'))); assert.equal(ra.lite, null); assert.equal(a.win.GY_BUILDINGS.features.length, 0);
  const b = bootWith('?bjd=2635010500', RES({ type: 'bjd', level: 'umd', sgg: '26350', bjd: '2635010500' }), FILES, { lite: LITE_TABLE });
  const rb = await R.boot(b.win, b.doc);
  assert.equal(rb.home, null); assert.ok(b.urls.includes('api/v1/permits?bjd=2635010500')); assert.ok(!b.urls.some((u) => u.startsWith('assets/home-')));
});

/* ---------- 지도 → 화면 연결점·표지 ---------- */
test('연결점: 카드의 사업 id·이름과 위치 미확보 목록은 사업 화면 서랍(/projects?id=)으로 문서 이동한다(옛 /project/ 아님)', () => {
  assert.match(app, /const projHref = \(id\) => \{ const sgg = [^\n]*return `\/projects\?id=\$\{encodeURIComponent\(id\)\}&from=map\$\{sgg \? `&sgg=\$\{sgg\}` : ''\}`; \};/);   // 2026-10-15 지도 → 서랍 계약(from=map·sgg)
  assert.match(app, /const pidLink = \(id\) => `<a class="pc-pid" href="\$\{esc\(projHref\(id\)\)\}"/);
  assert.match(app, /\$\{linkId \? `<a href="\$\{esc\(projHref\(linkId\)\)\}"/);
  assert.match(app, /function unlocatedHtml\(\)[\s\S]*<a href="\$\{esc\(projHref\(x\.id\)\)\}"\$\{x\.id === cur \? ' aria-current="true"/);
  assert.doesNotMatch(app, /href="\/project\//);
  assert.match(app, /lostHtml\(\) \+ BLOCKS\.map/); assert.match(app, /lostHtml\(\) \+ \(REG\.home \?/);
});

test('표지: 이름 검색 근사 위치는 실선 겹원 + 띠(①계획 점선과 다른 모양, 범례 \'근사 위치\'), 경량 번들 지구는 지구 밖을 어둡게 하지 않는다', () => {
  assert.match(app, /id: 'blk-line-approx', type: 'line', source: 'blocks', filter: \['==', \['get', 'approx'\], true\], paint: \{ 'line-color': kindExpr\(T\.color\), 'line-width': 1\.6 \} \}/, '점선 아님');
  assert.match(app, /id: 'blk-approx', type: 'fill', source: 'blocks', filter: \['==', \['get', 'approx'\], true\]/);
  assert.match(app, /coordinates: b\.approx \? approxRings\(b\.poly\) :/, '바깥 원 + 안쪽 원(구멍)');
  assert.match(app, /add\('<i class="sw approx"><\/i>', '근사 위치'/); assert.match(css, /\.sw\.approx\{border-radius:50%;border:1\.5px solid/);
  assert.match(html, /id="locNote" role="status" hidden>[\s\S]*?id="locNoteX" aria-label="안내 닫기"/);
  assert.match(app, /approx: !!b\.approx/);
  assert.match(app, /const NOT_APPROX = \['!=', \['get', 'approx'\], true\]/);
  assert.match(app, /const MASK_ON = DISTRICTS\.length > 0 && !\(window\.REGION && window\.REGION\.lite\)/);
  assert.match(app, /if \(MASK_ON\) add\(\{ id: 'district-mask'/);
});

/* ---------- 빌드 ---------- */
test('build: 경량 번들은 해시 이름으로만 복사하고 표(name·n·h)를 쓴다. 해시 이름은 immutable, 지도 페이지가 window.HOME_LITE 로 넘긴다', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lite-build-'));
  const w = (f, t) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), t); };
  w('regions/index.json', JSON.stringify({ regions: [{ slug: 'a', name: 'A', default: true }] })); w('regions/a/region.json', '{}'); w('assets/js/app.js', '');
  w('data/board/home-lite/index.json', JSON.stringify({ sggs: [{ sgg: '41281', name: '경기도 고양시 덕양구', projects: 7, lite: true }, { sgg: '41630', name: '경기도 양주시', projects: 2, lite: false }] }));
  w('data/board/home-lite/41281.json', '{"schema":"home-lite/1"}\n');
  build({ root, env: {}, log: () => {} });
  const m = JSON.parse(fs.readFileSync(path.join(root, 'public/assets/home-lite/manifest.json'), 'utf8'));
  assert.deepEqual(Object.keys(m), ['41281', '41630']); assert.match(m['41281'].h, /^[0-9a-f]{8}$/); assert.equal(m['41630'].h, undefined); assert.equal(m['41630'].n, 2);
  assert.ok(fs.existsSync(path.join(root, `public/assets/home-lite/41281.${m['41281'].h}.json`))); assert.ok(!fs.existsSync(path.join(root, 'public/assets/home-lite/41281.json')));
  const cfg = fs.readFileSync(path.join(ROOT, 'next.config.ts'), 'utf8');
  assert.match(cfg, /source: '\/assets\/home-lite\/:file\(\\\\d\{5\}\\\\\.\[0-9a-f\]\{8\}\\\\\.json\)', headers: \[\{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' \}\]/);
  assert.match(fs.readFileSync(path.join(ROOT, 'components/MapIsland.tsx'), 'utf8'), /w\.HOME_LITE = homeLite;/);
  assert.match(fs.readFileSync(path.join(ROOT, 'app/(map)/map/page.tsx'), 'utf8'), /homeLite=\{homeLiteManifest\(\)\}/);
});
