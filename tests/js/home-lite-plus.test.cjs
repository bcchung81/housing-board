'use strict';
/* 수도권 경량 번들 보강(2026-10-16): LH 블록 다각형(V-World LT_C_LHBLPN, 라벨점 POINT 조회)을 사업 구역·다른 블록 윤곽으로,
   블록·지구 위치 사업이 든 작은 공공주택지구(볼록 껍질 ≤ 2 km²)는 지구 전체 건물을 담는다. 생성기 tools/ledger/home-lite.js, 지도 assets/js/region.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const L = require('../../tools/ledger/home-lite.js');
const V = require('../../tools/ledger/home-vworld.js');
const R = require('../../assets/js/region.js');

const ROOT = path.join(__dirname, '../..');
const LITE = path.join(ROOT, L.OUT_DIR);
const MAPDIR = path.join(ROOT, 'data/board/home-map');

/* ---------- 블록 고르기 ---------- */
const box = (x, y, d) => [[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]];
const feat = (id, blocktype, ring) => ({ id, blocktype, zonename: '시험지구', geometry: { type: 'MultiPolygon', coordinates: [[ring]] } });

test('blockAt: 라벨점을 품은 주택 용지 블록 중 가장 작은 것, 공원·복합시설·점 밖 블록은 쓰지 않는다', () => {
  const at = [127.0005, 37.0005];
  const big = feat('LT_C_LHBLPN.2', '공동주택', box(127, 37, 0.002)), small = feat('LT_C_LHBLPN.9', '아파트', box(127.0003, 37.0003, 0.0005));
  assert.equal(L.blockAt([big, small], at).id, 'LT_C_LHBLPN.9');
  assert.equal(L.blockAt([small, big], at).id, 'LT_C_LHBLPN.9');   // 응답 순서와 무관
  const b = L.blockAt([big], at);
  assert.deepEqual(b.ring[0], b.ring[b.ring.length - 1]); assert.ok(V.pointInGeometry({ type: 'Polygon', coordinates: [b.ring] }, at));
  assert.equal(L.blockAt([feat('LT_C_LHBLPN.3', '근린공원', box(127, 37, 0.002)), feat('LT_C_LHBLPN.4', '복합시설용지기타', box(127, 37, 0.002))], at), null);
  assert.equal(L.blockAt([feat('LT_C_LHBLPN.5', '공동주택', box(127.01, 37.01, 0.001))], at), null);
  assert.equal(L.blockAt([feat('LT_C_LHBLPN.6', '연립', box(127, 37, 0.002))], at).id, 'LT_C_LHBLPN.6');
  assert.equal(L.blockAt([], at), null);
});

/* ---------- liteDoc: 블록 링·다른 블록 다각형·작은 지구 ---------- */
function fixture() {
  const doc = { sgg: '41281', name: '경기도 고양시 덕양구', projects: [
    { id: 'P-1', loc: { by: 'block', at: [126.8, 37.6] } },
    { id: 'P-2', loc: { by: 'block', at: [126.81, 37.6] } },    // P-3 과 같은 블록 → 둘 다 점 표지
    { id: 'P-3', loc: { by: 'block', at: [126.8101, 37.6001] } },
    { id: 'P-4', loc: { by: 'address', at: [126.82, 37.6] } },   // 대표 지번: 블록을 찾지 않는다
  ] };
  const shape = { '126.8,37.6': { id: 'A', ring: box(126.7995, 37.5995, 0.001) }, '126.81,37.6': { id: 'B', ring: box(126.8095, 37.5995, 0.001) }, '126.8101,37.6001': { id: 'B', ring: box(126.8095, 37.5995, 0.001) },
    '126.8003,37.6003': { id: 'A', ring: box(126.7995, 37.5995, 0.001) }, '126.83,37.6': { id: 'C', ring: box(126.8295, 37.5995, 0.001) }, '126.8302,37.6002': { id: 'C', ring: box(126.8295, 37.5995, 0.001) },
    '126.82,37.6': { id: 'D', ring: box(126.8195, 37.5995, 0.001) } };
  const blockOf = (at) => shape[`${at[0]},${at[1]}`] || null;
  const blocks = [{ label: '지구 A1-1', at: [126.8003, 37.6003] }, { label: '지구 C1', at: [126.83, 37.6] }, { label: '지구 C2', at: [126.8302, 37.6002] }, { label: '지구 S1', at: [126.84, 37.6] }];
  const F = (x, y) => ({ type: 'Feature', properties: { eh: 9 }, geometry: { type: 'Polygon', coordinates: [box(x, y, 0.0001)] } });
  const features = [F(126.8001, 37.6001), F(126.7965, 37.606), F(126.95, 37.7)];
  const districts = [
    { name: '작은 지구', lon: 126.8, lat: 37.6, ids: [], rings: [[[126.795, 37.595], [126.81, 37.595], [126.795, 37.61], [126.795, 37.595]]] },   // 약 1.1 km², 블록 사업 P-1 이 든다
    { name: '큰 지구', lon: 126.9, lat: 37.65, ids: ['P-2'], rings: [[[126.9, 37.65], [126.96, 37.65], [126.96, 37.71], [126.9, 37.65]]] },        // 약 8 km² → 지구 전체는 담지 않는다
    { name: '먼 지구', lon: 127.5, lat: 37, ids: [], rings: [[[127.5, 37], [127.51, 37], [127.51, 37.01], [127.5, 37]]] },
  ];
  return { doc, opts: { features, districts, blocks, inside: () => true, basis: '20261016', edition: 'E', blockOf } };
}

test('liteDoc: 블록 사업에 LH 블록 링(셋째 칸), 블록 하나에 사업 둘이면 점 표지, 다른 블록은 다각형(사업 블록·같은 다각형 둘째는 뺀다), 작은 지구만 지구 전체 건물', () => {
  const { doc, opts } = fixture();
  const d = L.liteDoc(doc, opts);
  assert.deepEqual(d.projects.map((x) => [x[0], x.length]), [['P-1', 3], ['P-2', 2], ['P-3', 2], ['P-4', 2]]);
  assert.deepEqual(d.projects[0][2], box(126.7995, 37.5995, 0.001));
  assert.deepEqual(d.blocks.map((b) => [b.label, !!b.poly]), [['지구 C1', true], ['지구 S1', false]]);   // A1-1 은 P-1 블록, C2 는 C1 과 같은 다각형
  assert.deepEqual(d.wide, ['작은 지구']);
  assert.equal(d.buildings.length, 2);   // P-1 둘레 + 작은 지구 안(126.7965 — P-1 에서 약 700 m). 큰 지구 안 건물(126.95)은 사업 둘레 밖이라 뺀다
  /* 같은 입력(순서만 바뀜) → 같은 바이트 */
  const b = fixture();
  b.opts.features.reverse(); b.opts.districts.reverse(); b.opts.blocks.reverse(); b.doc.projects.reverse();
  assert.equal(L.renderLite(L.liteDoc(b.doc, b.opts)), L.renderLite(d));
  assert.equal(L.liteDoc(doc, { ...opts, blockOf: undefined }).projects.every((x) => x.length === 2), true, 'blockOf 가 없으면 예전 모양');
});

test('hullOf·wideDistricts: 껍질 넓이(m²)와 2 km² 상한, 블록·지구 위치 사업이 들거나 연결된 지구만', () => {
  const h = L.hullOf([[[127, 37], [127.01, 37], [127.01, 37.01], [127, 37.01], [127, 37]], [[127.005, 37.005], [127.02, 37.005], [127.005, 37.005]]]);
  assert.deepEqual(h.ring[0], h.ring[h.ring.length - 1]);
  assert.ok(Math.abs(h.m2 - (0.01 * 88903 * 0.01 * 110540 + 0.5 * 0.01 * 88903 * 0.01 * 110540)) / h.m2 < 0.01, `${h.m2}`);
  assert.equal(L.WIDE_MAX_M2, 2e6);
  const { opts } = fixture();
  const at = (by, x, y, id = 'Q') => ({ id, loc: { by, at: [x, y] } });
  assert.deepEqual(L.wideDistricts([at('address', 126.8, 37.6)], opts.districts), [], '대표 지번·이름 근사 사업은 지구를 넓히지 않는다');
  assert.deepEqual(L.wideDistricts([at('district', 126.8, 37.6)], opts.districts).map((w) => w.name), ['작은 지구']);
  assert.deepEqual(L.wideDistricts([at('block', 126.95, 37.69, 'P-2')], opts.districts), [], '큰 지구는 연결돼도 넓히지 않는다');
});

/* ---------- 지도(region.js): 블록 링 → 사업 구역 ---------- */
const RES = { type: 'sgg', level: 'sgg', sgg: '41281', name: '고양시 덕양구', center: [126.87, 37.63], bbox: [126.75, 37.58, 127.0, 37.72], coverage: { tier: 'none' } };
const row = (id, loc, stage = '04') => ({ id, name: `사업 ${id}`, label: id, issued: true, stage, cls: 'ok', why: null, overdue: null, next: null, units: 300, pks: [], pnus: [], bundles: [], noticeUnits: null, loc, policy: null });
const HOME = { schema: 'home-map/1', sgg: '41281', name: '경기도 고양시 덕양구', projects: [
  row('P-1', { by: 'block', at: [126.8, 37.6], basis: 'B', status: 'REVIEW' }),
  row('P-2', { by: 'block', at: [126.81, 37.6], basis: 'B', status: 'REVIEW' }, '05'),
  row('P-3', { by: 'address', at: [126.82, 37.6], basis: 'A', status: 'REVIEW' }),
] };
const RING = box(126.7995, 37.5995, 0.001);
const LITEDOC = { schema: 'home-lite/1', sgg: '41281', radiusM: 300, wide: ['작은 지구'], projects: [['P-1', 1, RING], ['P-2', 0], ['P-3', 0]], districts: [],
  blocks: [{ label: '지구 C1', at: [126.83, 37.6], poly: box(126.8295, 37.5995, 0.001) }, { label: '지구 S1', at: [126.84, 37.6] }], buildings: [] };

test('지도: 블록 링이 있는 사업은 공식 윤곽(단계색 면 blk-*, 대표점 핀 없음)으로, 없는 사업은 예전 점 표지. 다른 블록은 다각형 윤곽, 안내 띠·설명 문구', () => {
  const b = R.emptyBundle(RES, null, null, null, { home: { doc: HOME, lite: LITEDOC }, px: 1040 });
  const by = Object.fromEntries(b.blocks.map((x) => [x.projectId || x.pid, x]));
  const p1 = b.blocks.find((x) => x.pid === 'home-P-1'), p2 = b.blocks.find((x) => x.pid === 'home-P-2');
  assert.ok(by && p1 && p2);
  assert.equal(p1.outlineTier, 'official'); assert.deepEqual(p1.poly, RING.slice(0, -1)); assert.match(p1.outlineHow, /LH 블록 경계/);
  assert.equal(p1.status, '건설 단계', '단계색은 원장 단계 그대로');
  assert.equal(p2.outlineTier, 'point'); assert.equal(p2.poly.length, 8);
  assert.deepEqual(b.otherBlocks[0], box(126.8295, 37.5995, 0.001).slice(0, -1)); assert.equal(b.otherBlocks[1].length, 8);
  assert.equal(b.home.blocks, 1);
  assert.match(b.description, /LH 블록 위치가 잡힌 사업은 블록 경계/); assert.match(b.description, /사업 둘레 300 m와 공공주택지구 1곳 전체를 미리 담았고/);
  const old = R.emptyBundle(RES, null, null, null, { home: { doc: HOME, lite: { ...LITEDOC, wide: undefined, projects: [['P-1', 1]], blocks: [] } }, px: 1040 });
  assert.equal(old.blocks.every((x) => x.outlineTier === 'point'), true, '블록 링이 없는 옛 번들은 예전 그대로');
  assert.match(old.description, /위치는 대표점이며 사업 경계가 아닙니다\. 건물은 사업 둘레 300 m를 미리 담았고/);
  assert.equal(R.liteRing([[1, 2], [3, 4], [1, 2]]), null); assert.equal(R.liteRing('x'), null);
  const app = fs.readFileSync(path.join(ROOT, 'assets/js/app.js'), 'utf8');
  assert.match(app, /pt: b\.outlineTier === 'point'/, '핀(blk-pin)은 점 표지만 — 공식 윤곽은 면으로');
  assert.match(app, /geometry: \{ type: 'Polygon', coordinates: b\.approx \? approxRings\(b\.poly\) : \[\[\.\.\.b\.poly, b\.poly\[0\]\]\] \}/, '단지 면은 b.poly 를 그대로 그린다');
});

/* ---------- 만든 파일 ---------- */
const files = () => fs.readdirSync(LITE).filter((f) => /^\d{5}\.json$/.test(f)).sort();

test('만든 파일: 블록 위치 사업의 90% 이상에 LH 블록 링(라벨점을 품고 닫힌 링), 링은 블록 사업에만', () => {
  let block = 0, withRing = 0;
  for (const f of files()) {
    const d = JSON.parse(fs.readFileSync(path.join(LITE, f), 'utf8')), home = JSON.parse(fs.readFileSync(path.join(MAPDIR, f), 'utf8'));
    const loc = new Map(home.projects.map((r) => [r.id, r.loc]));
    for (const [id, , ring] of d.projects) {
      if (loc.get(id).by === 'block') block += 1;
      if (!ring) continue;
      withRing += 1;
      assert.equal(loc.get(id).by, 'block', id);
      assert.ok(ring.length >= 4); assert.deepEqual(ring[0], ring[ring.length - 1], id);
      assert.ok(V.pointInGeometry({ type: 'Polygon', coordinates: [ring] }, loc.get(id).at), `${id} 라벨점이 블록 안`);
    }
    for (const b of d.blocks) if (b.poly) assert.ok(V.pointInGeometry({ type: 'Polygon', coordinates: [b.poly] }, b.at), `${f} ${b.label}`);
  }
  assert.ok(block >= 50, `블록 위치 사업 ${block}`);
  assert.ok(withRing >= Math.ceil(block * 0.9), `블록 링 ${withRing}/${block}`);
});

test('만든 파일 크기(지도 첫 열기): 시군구 gzip ≤ 120 KB, 60곳 합계 원본 ≤ 7 MB·gzip ≤ 1.5 MB', () => {
  let raw = 0, gz = 0;
  for (const f of files()) {
    const t = fs.readFileSync(path.join(LITE, f)), g = zlib.gzipSync(t).length;
    assert.ok(g <= 120 * 1024, `${f} gzip ${g}`);
    raw += t.length; gz += g;
  }
  assert.ok(raw <= 7 * 1024 * 1024, `원본 ${raw}`); assert.ok(gz <= 1.5 * 1024 * 1024, `gzip ${gz}`);
});
