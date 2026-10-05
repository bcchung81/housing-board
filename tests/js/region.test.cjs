'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../../assets/js/region.js');

const RING = [[126.78, 35.15], [126.79, 35.15], [126.79, 35.16], [126.78, 35.16]];
const mkProject = (over = {}) => Object.assign({
  id: 'z1-A1', label: 'A-1', name: '테스트 A-1', sponsor: { name: 'LH', type: 'public' }, sponsorClass: 'public',
  kind: '공공분양', status: '분양중', units: 100, dongCount: 2,
  outline: { tier: 'official', poly: RING, how: 'V-World 공식 블록(LT_C_LHBLPN)' },
  dongs: [{ no: '101', tier: 'schematic', floorsAbove: 15, poly: [RING] }, { no: '102', tier: 'schematic', floorsAbove: 12, poly: [RING] }],
  sources: ['src-a', 'src-b'],
}, over);
const mkRegion = (over = {}) => Object.assign({
  schema_version: '1.1.0', slug: 'r1', name: '테스트구', title: '주택파동 · 테스트구', description: '설명', updatedAt: '2026-10-04',
  view: { center: [126.785, 35.155], zoom: 15, pitch: 52 }, codes: [],
  zones: [{ id: 'z1', name: '테스트 지구', type: '공공주택지구', publicLand: true, poly: RING }],
  sources: [{ id: 'src-a', label: '출처 A', redistributable: 'unknown' }, { id: 'src-b', label: '출처 B', redistributable: 'unknown' }, { id: 'lh-cwstt', label: 'LH 공사현황', redistributable: 'unknown' }],
  statusOrder: ['계획', '분양중', '건설 단계', '준공 임박', '입주 단계'],
}, over);
const mkRaw = (projects = [mkProject()], region = mkRegion(), extra = {}) => Object.assign({
  index: { schema_version: '1.1.0', regions: [{ slug: 'r1', name: '테스트구', default: true, visibility: 'public' }] },
  entry: { slug: 'r1', name: '테스트구', default: true, visibility: 'public' },
  region, projects: { schema_version: '1.1.0', projects }, buildings: { type: 'FeatureCollection', meta: { basis: '20261004' }, features: [] },
  context: { stations: [{ name: '역', lon: 126.78, lat: 35.15 }], schools: [], asOf: '2026-10-04', source: '© OpenStreetMap contributors (ODbL)' },
}, extra);

test('pickRegion: 기본 지역, ?region=, 모르는 slug, 빈 목록', () => {
  const index = { regions: [{ slug: 'a', name: 'A' }, { slug: 'b', name: 'B', default: true }] };
  assert.equal(R.pickRegion(index, '').region.slug, 'b');
  assert.equal(R.pickRegion(index, '?region=a').region.slug, 'a');
  const bad = R.pickRegion(index, '?region=zzz');
  assert.equal(bad.error, 'unknown'); assert.equal(bad.requested, 'zzz'); assert.equal(bad.regions.length, 2);
  assert.equal(R.pickRegion({ regions: [{ slug: 'x', name: 'X' }] }, '').region.slug, 'x');  // default 가 없으면 첫 지역
  assert.equal(R.pickRegion({ regions: [] }, '').error, 'empty');
});

test('moveInText: 입주 단계인데 날짜가 없으면 "입주 시기 미정"이 아니라 "입주 일자 미상"', () => {
  assert.equal(R.moveInText(null, undefined, '입주 단계'), '입주 일자 미상');
  assert.equal(R.moveInText('', null, '입주 단계'), '입주 일자 미상');
  assert.equal(R.moveInText('2026-09', null, '입주 단계'), '2026.09');
  assert.equal(R.moveInText(null, undefined, '건설 단계'), '입주 시기 미정');
});

test('adaptProject: 입주 단계 단지의 moveIn 문구에 상태가 반영된다', () => {
  const p = mkProject({ status: '입주 단계', moveIn: null, progress: null });
  assert.equal(R.adaptProject(p, mkRegion()).moveIn, '입주 일자 미상');
});

test('moveInText: 입주 월, 날짜, 종료일 대체, 미정', () => {
  assert.equal(R.moveInText('2029-06', null), '2029.06');
  assert.equal(R.moveInText('2028-09-30', null), '준공 예정 2028-09-30');
  assert.equal(R.moveInText(null, '2029-01-08'), '준공 예정 2029-01-08');
  assert.equal(R.moveInText(undefined, undefined), '입주 시기 미정');
  assert.equal(R.moveInText('', undefined), '입주 시기 미정');
});

test('adaptProject: 필드 매핑과 id=label, pid 보존', () => {
  const p = mkProject({ moveIn: '2029-06', builder: '시공사', contractAmountM: 1234.5, note: '메모', progress: { rate: 3.5, asOf: '2026-10-01', start: '2026-01-01', end: '2029-03-22', source: 'lh-cwstt' } });
  const b = R.adaptProject(p, mkRegion());
  assert.equal(b.id, 'A-1'); assert.equal(b.pid, 'z1-A1'); assert.equal(b.label, 'A-1');
  assert.equal(b.kind, '공공분양'); assert.equal(b.status, '분양중'); assert.equal(b.units, 100); assert.equal(b.unitsKnown, true);
  assert.equal(b.moveIn, '2029.06'); assert.equal(b.builder, '시공사'); assert.equal(b.contractM, 1234.5); assert.equal(b.note, '메모');
  assert.deepEqual(b.poly, RING); assert.equal(b.priv, false);
  assert.deepEqual(b.progress, { rate: 3.5, asOf: '2026-10-01', history: [], start: '2026-01-01', end: '2029-03-22', source: 'lh-cwstt' });
  assert.deepEqual(b.dongs.map((d) => [d.no, d.floors]), [['101', 15], ['102', 12]]);
  assert.equal(b.dongs[0].poly[0].length, 4);
  assert.equal(b.src, '출처 A · 출처 B');
  assert.equal(b.outlineHow, '블록 윤곽은 공식 자료 (V-World 공식 블록(LT_C_LHBLPN))');
});

test('adaptProject: 민간 단지, units 없음, progress 없음, dongs 없음', () => {
  const b = R.adaptProject(mkProject({ sponsorClass: 'private_on_public_land', units: null, dongs: undefined, dongCount: undefined, sources: undefined }), mkRegion());
  assert.equal(b.priv, true); assert.equal(b.units, 0); assert.equal(b.unitsKnown, false);
  assert.equal(b.progress, undefined); assert.equal(b.dongs, undefined); assert.equal(b.dongCount, 0); assert.equal(b.src, '');
  assert.equal(b.moveIn, '입주 시기 미정');
});

test('동: 층수·높이 모두 없으면 3D에서 뺀다, 높이만 있으면 층수를 추정, heightM 우선', () => {
  const dongs = [
    { no: '1', tier: 'building', poly: [RING] },
    { no: '2', tier: 'building', heightM: 57, poly: [RING] },
    { no: '3', tier: 'building', floorsAbove: 20, heightM: 59.35, poly: [RING] },
    { no: '4', tier: 'building', floorsAbove: 0, poly: [RING] },
  ];
  const b = R.adaptProject(mkProject({ dongs, dongCount: 4 }), mkRegion());
  assert.deepEqual(b.dongs.map((d) => d.no), ['2', '3']);
  assert.equal(b.dongs[0].floors, 20); assert.equal(b.dongs[0].h, 57);
  assert.equal(b.dongs[1].floors, 20); assert.equal(b.dongs[1].h, 59.35);
});

test('같은 label 이 둘이면 내부 id 를 구분한다', () => {
  const r = R.adaptBundle(mkRaw([mkProject({ id: 'a-A1' }), mkProject({ id: 'b-A1' }), mkProject({ id: 'c-B2', label: 'B-2' })]));
  const ids = r.blocks.map((b) => b.id);
  assert.equal(new Set(ids).size, 3);
  assert.deepEqual(r.blocks.map((b) => b.pid).sort(), ['a-A1', 'b-A1', 'c-B2']);
  assert.ok(ids.includes('B-2'));
});

test('같은 label 의 구분 접미사(·2)는 파일 순서가 아니라 화면에 보이는 순서를 따른다', () => {
  const r = R.adaptBundle(mkRaw([mkProject({ id: 'small', units: 10 }), mkProject({ id: 'big', units: 500 })]));   // 파일에는 작은 단지가 먼저
  assert.deepEqual(r.blocks.map((b) => [b.pid, b.id]), [['big', 'A-1'], ['small', 'A-1·2']]);
});

test('문구: 역·학교 문장은 마침표로 끝난다', () => {
  const r = R.adaptBundle(mkRaw());
  assert.match(r.texts.footerHtml, /역·학교는 OpenStreetMap입니다\.(<|$)/);
});

test('orderProjects: projectOrder, 상태 순서, 세대수, label', () => {
  const ps = [
    mkProject({ id: 'p1', label: 'P1', status: '계획', units: 900 }),
    mkProject({ id: 'p2', label: 'P2', status: '입주 단계', units: 100 }),
    mkProject({ id: 'p3', label: 'P3', status: '분양중', units: 100 }),
    mkProject({ id: 'p4', label: 'P4', status: '분양중', units: 300 }),
    mkProject({ id: 'p5', label: 'P5', status: '분양중', units: 300 }),
    mkProject({ id: 'p6', label: 'P6', status: '건설 단계', units: null }),
  ];
  const byDefault = R.adaptBundle(mkRaw(ps)).blocks.map((b) => b.pid);
  assert.deepEqual(byDefault, ['p4', 'p5', 'p3', 'p6', 'p2', 'p1']);
  const pinned = R.adaptBundle(mkRaw(ps, mkRegion({ projectOrder: ['p2', 'p1', 'ghost'] }))).blocks.map((b) => b.pid);
  assert.deepEqual(pinned.slice(0, 2), ['p2', 'p1']);
  assert.deepEqual(pinned.slice(2), ['p4', 'p5', 'p3', 'p6']);
});

test('resolveBlock: label, pid, 모르는 값', () => {
  const r = R.adaptBundle(mkRaw());
  assert.equal(r.resolveBlock('A-1').pid, 'z1-A1');
  assert.equal(r.resolveBlock('z1-A1').id, 'A-1');
  assert.equal(r.resolveBlock('nope'), null);
  assert.equal(r.resolveBlock(null), null);
});

test('전역 설정 모양: GY_PROJECTS, 지구, 건물, 맥락', () => {
  const r = R.adaptBundle(mkRaw([mkProject()], mkRegion(), { projects: { schema_version: '1.1.0', projects: [mkProject()], otherBlocks: [RING] } }));
  assert.equal(r.GY_PROJECTS.blocks.length, 1);
  assert.equal(r.GY_PROJECTS.district.poly, RING); assert.equal(r.GY_PROJECTS.district.name, '테스트 지구');
  assert.equal(r.GY_PROJECTS.districts.length, 1);
  assert.deepEqual(r.GY_PROJECTS.otherBlocks, [RING]);
  assert.equal(r.GY_BUILDINGS.meta.basis, '20261004');
  assert.equal(r.GY_CONTEXT.stations.length, 1);
  assert.deepEqual(r.view, { center: [126.785, 35.155], zoom: 15, pitch: 52 });
  assert.deepEqual(r.statusOrder, ['계획', '분양중', '건설 단계', '준공 임박', '입주 단계']);
});

test('지구에 poly 가 없으면 district 는 null, context 가 없으면 GY_CONTEXT 는 null', () => {
  const r = R.adaptBundle(mkRaw([mkProject()], mkRegion({ zones: [{ id: 'z', name: 'Z', type: '기타', publicLand: false }] }), { context: null }));
  assert.equal(r.GY_PROJECTS.district, null); assert.deepEqual(r.GY_PROJECTS.districts, []);
  assert.equal(r.GY_CONTEXT, null);
});

const INFRA_DOC = { schema_version: '1.2.0', asOf: '2026-10-04', sources: [{ id: 'i', label: '출처', redistributable: 'unknown' }], schools: [], stops: [] };

test('기반시설(infra.json): 있으면 GY_INFRA 와 푸터 문장, 없으면 null 이고 문장도 없다', () => {
  const withInfra = R.adaptBundle(mkRaw([mkProject()], mkRegion(), { infra: INFRA_DOC }));
  assert.equal(withInfra.GY_INFRA, INFRA_DOC);
  assert.match(withInfra.texts.footerHtml, /기반시설 점검 자료는 2026-10-04 기준 공개 자료입니다\.(<|$)/);
  const without = R.adaptBundle(mkRaw());
  assert.equal(without.GY_INFRA, null);
  assert.ok(!without.texts.footerHtml.includes('기반시설'));
  assert.equal(R.adaptBundle(mkRaw([mkProject()], mkRegion(), { infra: null })).GY_INFRA, null);
});

test('기반시설 문장은 다른 문장 뒤에 오고 한 번만 나온다', () => {
  const t = R.adaptBundle(mkRaw([mkProject()], mkRegion(), { infra: INFRA_DOC })).texts.footerHtml;
  assert.match(t, /역·학교는 OpenStreetMap입니다\. 기반시설 점검 자료는/);
  assert.equal(t.split('기반시설 점검 자료는').length, 2);
});

test('빈 지역(단지 0개)도 어댑터가 통과한다', () => {
  const r = R.adaptBundle(mkRaw([]));
  assert.deepEqual(r.blocks, []); assert.equal(r.hasPrivate, false);
  assert.equal(r.GY_PROJECTS.blocks.length, 0);
  assert.ok(r.texts.footerHtml.includes('V-World'));
});

test('hasPrivate', () => {
  assert.equal(R.adaptBundle(mkRaw([mkProject(), mkProject({ id: 'x', label: 'X', sponsorClass: 'private_on_public_land' })])).hasPrivate, true);
});

test('문구: 탭 제목, 소제목, 푸터(윤곽·공정율·역학교)', () => {
  const p1 = mkProject({ progress: { rate: 1, asOf: '2026-10-01', source: 'lh-cwstt' } });
  const p2 = mkProject({ id: 'p2', label: 'B', outline: { tier: 'official', poly: RING }, dongs: [{ no: '1', tier: 'building', floorsAbove: 5, poly: [RING] }] });
  const t = R.adaptBundle(mkRaw([p1, p2])).texts;
  assert.equal(t.documentTitle, '주택파동 공급 지도 (테스트구)');
  assert.equal(t.eyebrow, '주택파동 · 테스트구'); assert.equal(t.description, '설명');
  assert.match(t.footerHtml, /블록 윤곽은 공식 자료, 동 윤곽은 실제 건물 자료, 동 윤곽은 근사값\(10~20 m\)입니다\./);
  assert.match(t.footerHtml, /공정율은 LH 공사현황 기준입니다\./);
  assert.match(t.footerHtml, /역·학교는 OpenStreetMap입니다/);
  assert.match(t.footerHtml, /<span id="basis">-<\/span> 기준/);
});

test('문구: 공정율 출처·맥락이 없으면 그 문장이 없다, HTML 이스케이프', () => {
  const t = R.adaptBundle(mkRaw([mkProject()], mkRegion({ name: 'A&B<구>', title: 'T<b>' }), { context: null })).texts;
  assert.ok(!t.footerHtml.includes('공정율은')); assert.ok(!t.footerHtml.includes('역·학교'));
  assert.equal(t.documentTitle, '주택파동 공급 지도 (A&B<구>)');  // 제목은 텍스트라 이스케이프하지 않는다
  assert.equal(R.escapeHtml('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
});

test('1.0.0 번들(새 필드 없음)도 읽힌다', () => {
  const r = R.adaptBundle(mkRaw());
  const b = r.blocks[0];
  assert.equal(b.builder, undefined); assert.equal(b.contractM, undefined); assert.equal(b.note, undefined); assert.equal(b.progress, undefined);
});

test('selectorModel / regionUrl', () => {
  const index = { regions: [{ slug: 'a', name: 'A' }, { slug: 'b', name: 'B' }] };
  assert.deepEqual(R.selectorModel(index, 'b'), { visible: true, options: [{ value: 'a', label: 'A', selected: false }, { value: 'b', label: 'B', selected: true }] });
  assert.equal(R.selectorModel({ regions: [{ slug: 'a', name: 'A' }] }, 'a').visible, false);
  assert.equal(R.regionUrl('https://x.test/?block=A6&mode=time&region=a', 'b'), 'https://x.test/?mode=time&region=b');
});

function fakeFetch(files) {
  const calls = [];
  const f = async (url) => { calls.push(url); if (url in files) return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(files[url])) }; return { ok: false, status: 404, json: async () => { throw new Error('404'); } }; };
  f.calls = calls; return f;
}
const filesFor = (base = 'regions/') => ({
  'regions/index.json': { schema_version: '1.1.0', dataBase: base, regions: [{ slug: 'r1', name: '테스트구', default: true, visibility: 'public' }, { slug: 'r2', name: '둘째', visibility: 'public' }] },
  [`${base}r1/region.json`]: mkRegion(), [`${base}r1/projects.json`]: { schema_version: '1.1.0', projects: [mkProject()] },
  [`${base}r1/buildings.json`]: { type: 'FeatureCollection', meta: { basis: '20261004' }, features: [] },
  [`${base}r1/context.json`]: mkRaw().context,
});

test('loadRegion: 정상, context 404 는 무시', async () => {
  const files = filesFor(); delete files['regions/r1/context.json'];
  const out = await R.loadRegion({ fetch: fakeFetch(files), search: '' });
  assert.equal(out.ok, true); assert.equal(out.slug, 'r1'); assert.equal(out.GY_CONTEXT, null); assert.equal(out.blocks.length, 1);
  assert.equal(out.regions.length, 2);
});

test('loadRegion: infra.json 이 있으면 읽고, 404 면 null 로 둔다(지역은 그대로 열린다)', async () => {
  const files = filesFor(); files['regions/r1/infra.json'] = INFRA_DOC;
  const f = fakeFetch(files);
  const withInfra = await R.loadRegion({ fetch: f, search: '' });
  assert.equal(withInfra.ok, true); assert.deepEqual(withInfra.GY_INFRA, INFRA_DOC); assert.ok(f.calls.includes('regions/r1/infra.json'));
  const without = await R.loadRegion({ fetch: fakeFetch(filesFor()), search: '' });
  assert.equal(without.ok, true); assert.equal(without.GY_INFRA, null); assert.equal(without.blocks.length, 1);
});

test('loadRegion: infra.json 이 깨져 있으면(404 가 아닌 오류) URL 을 담은 예외', async () => {
  const files = filesFor(); files['regions/r1/infra.json'] = INFRA_DOC;
  const f = async (url) => (url === 'regions/r1/infra.json' ? { ok: false, status: 500, json: async () => ({}) } : fakeFetch(files)(url));
  await assert.rejects(() => R.loadRegion({ fetch: f, search: '' }), /regions\/r1\/infra\.json: HTTP 500/);
});

test('boot: 전역 GY_INFRA 를 채운다(없으면 null)', async () => {
  const doc = { title: '', querySelector: () => null, getElementById: () => null };
  const mk = (files) => ({ location: { search: '', href: 'http://x.test/' }, fetch: (u) => fakeFetch(files)(u) });
  const files = filesFor(); files['regions/r1/infra.json'] = INFRA_DOC;
  const w1 = mk(files); const r1 = await R.boot(w1, doc);
  assert.equal(r1.ok, true); assert.deepEqual(w1.GY_INFRA, INFRA_DOC); assert.equal(w1.REGION.slug, 'r1');
  const w2 = mk(filesFor()); await R.boot(w2, doc);
  assert.equal(w2.GY_INFRA, null);
});

test('loadRegion: dataBase 로 지역 폴더 주소를 바꾼다', async () => {
  const files = filesFor('https://cdn.test/data/');
  const f = fakeFetch(files);
  const out = await R.loadRegion({ fetch: f, search: '' });
  assert.equal(out.ok, true);
  assert.ok(f.calls.includes('https://cdn.test/data/r1/projects.json')); assert.ok(f.calls[0] === 'regions/index.json');
});

test('loadRegion: 모르는 지역은 오류 객체, 필수 파일 실패는 URL 을 담은 예외', async () => {
  const bad = await R.loadRegion({ fetch: fakeFetch(filesFor()), search: '?region=zzz' });
  assert.equal(bad.ok, false); assert.equal(bad.error, 'unknown'); assert.equal(bad.regions.length, 2);
  const files = filesFor(); delete files['regions/r1/buildings.json'];
  await assert.rejects(() => R.loadRegion({ fetch: fakeFetch(files), search: '' }), /regions\/r1\/buildings\.json/);
  await assert.rejects(() => R.loadRegion({ fetch: fakeFetch({}), search: '' }), /regions\/index\.json/);
});
