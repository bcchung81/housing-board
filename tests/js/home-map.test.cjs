'use strict';
/* 수도권 지도 정적 자료(tools/ledger/home-map.js → data/board/home-map/<시군구>.json → scripts/build.js → assets/home-map/)와
   지도 연결(assets/js/region.js: 수도권 시군구는 permits·infra·ledger API 대신 이 파일 하나). 계획: docs/product/지도-개선-계획.md 3절·S3 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const H = require('../../tools/ledger/home-map.js');
const R = require('../../assets/js/region.js');
const { build } = require('../../scripts/build.js');

const ROOT = path.join(__dirname, '../..');
const DIR = path.join(ROOT, H.OUT_DIR);
const LEDGER_MAP = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/board/ledger-map.json'), 'utf8'));
const files = () => fs.readdirSync(DIR).filter((f) => /^\d{5}\.json$/.test(f)).sort();
const load = (sgg) => JSON.parse(fs.readFileSync(path.join(DIR, `${sgg}.json`), 'utf8'));

/* ---------- 생성기(순수 함수) ---------- */
const P = (id, sgg, extra = {}) => ({ local_project_id: id, project_name: `사업 ${id}`, sgg_code: sgg, agency_id: 'lh', stage_code: '04', issued_at: '2026-10-14', superseded_by: null, source_ref: 'home-dump-20261019T212247Z', ...extra });
const EV = (id, type, dateType, date, extra = {}) => ({ local_project_id: id, event_type: type, date_type: dateType, plan_basis: dateType === 'PLANNED' ? 'CURRENT' : null, event_date: date, event_month: null, event_year: null, source_ref: 'home-dump-20261019T212247Z', event_detail: null, ...extra });
function fixture() {
  const tables = {
    projects: [P('PRJ-41281-0001', '41281'), P('PRJ-41281-0002', '41281', { stage_code: '02' }), P('PRJ-41281-0003', '41281'), P('PRJ-26350-0001', '26350', { source_ref: 'hub-hs-basis' })],
    events: [
      EV('PRJ-41281-0001', 'COMPLETION', 'PLANNED', '2027-11-14'),
      EV('PRJ-41281-0001', 'COMPLETION', 'PLANNED', '2027-12-31', { source_ref: 'home-dump-20261019T212247Z-lh-plan' }),   // 순위가 낮은 원천(board.js 와 같은 순위)
      EV('PRJ-41281-0001', 'MOVE_IN', 'PLANNED', null, { event_month: '2028-01' }),
      EV('PRJ-41281-0001', 'SUPPLY_NOTICE', 'ACTUAL', '2025-04-30', { source_ref: 'home-dump-20261019T212247Z-notice', event_detail: '공고 APPLYHOME 2025000160-2025000160 고양창릉 A4블록 392세대 · 연결 확인 필요' }),
      EV('PRJ-41281-0001', 'SUPPLY_NOTICE', 'ACTUAL', '2025-04-30', { source_ref: 'home-dump-20261019T212247Z-notice', event_detail: '공고 APPLYHOME 2025000160-2025000160 고양창릉 A4블록 392세대 · 같은 공고 다시' }),
      EV('PRJ-41281-0001', 'SUPPLY_NOTICE', 'ACTUAL', '2025-09-30', { source_ref: 'home-dump-20261019T212247Z-notice', event_detail: '공고 APPLYHOME 2025000500-2025000500 고양창릉 A4블록 211세대' }),
    ],
    units: [{ local_project_id: 'PRJ-41281-0001', quantity_type: 'PROJECT_PLAN', unit_scope: 'TOTAL', unit_count: 900, source_ref: 'home-dump-20261019T212247Z' }],
    sources: [], areas: [], agencies: [],
    identifiers: [], project_locations: [{ local_project_id: 'PRJ-41281-0001', bjd_code: '4128111300', pnu: null }],
    links: [
      { link_type: 'PROGRAM_PROJECT', from_local_id: 'PRG_1', to_local_id: 'PRJ-41281-0001', review_status: 'REVIEW_REQUIRED' },
      { link_type: 'POLICY_PROGRAM', from_local_id: 'POL_2025_0907', to_local_id: 'PRG_1', review_status: 'REVIEW_REQUIRED' },
    ],
    policies: [{ local_policy_id: 'POL_2025_0907', policy_name: '주택공급 확대방안 (9·7)' }],
  };
  const homeIds = { 'BLK:41281|고양창릉|A4': 'PRJ-41281-0001', 'PRO:PRO_a': 'PRJ-41281-0001', 'PRO:PRO_b': 'PRJ-41281-0002', 'PRO:PRO_c': 'PRJ-41281-0003' };
  const kinds = {
    block_location: [{ entity_id: 'BLO_1', payload: { region: '경기도', district_name: '고양창릉', block: 'A4', zonecode: '41280MX2020001', latitude: 37.6222371, longitude: 126.8708712, coordinate_basis: 'LH_PUBLIC_BLOCK_LABEL_POINT' } }],
    project_location: [
      { entity_id: 'LOC_1', payload: { project_id: 'PRO_a', coordinate_basis: 'APPROXIMATE_AREA', latitude: 37.65, longitude: 126.83, status: 'REVIEW' } },   // 블록 라벨점이 이긴다
      { entity_id: 'LOC_2', payload: { project_id: 'PRO_b', coordinate_basis: 'APPROXIMATE_ADDRESS', latitude: 37.61, longitude: 126.85, status: 'REVIEW' } },
      { entity_id: 'LOC_3', payload: { project_id: 'PRO_c', coordinate_basis: 'APPROXIMATE_AREA', latitude: 37.65, longitude: 126.83, status: 'REVIEW' } },
    ],
    district: [{ entity_id: 'DIS_1', payload: { project_ids: ['PRO_b'], latitude: 37.6, longitude: 126.86, link_status: 'REVIEW' } }],   // 대표 지번이 지구 대표점보다 앞
  };
  return { tables, homeIds, kinds };
}
const gen = ({ tables, homeIds, kinds }) => H.homeMapFromLedger(tables, { referenceDate: '2026-10-13', observedMonth: '2026-10', edition: '20261019T212247Z', locations: H.homeLocations(kinds, homeIds), homeIds });

test('home-map 생성기: 같은 입력 → 같은 바이트, 수도권 시군구만', () => {
  const a = gen(fixture()), b = gen(fixture());
  assert.deepEqual(Object.keys(a), ['41281']);
  assert.equal(H.renderHomeMap(a['41281']), H.renderHomeMap(b['41281']));
  assert.deepEqual(JSON.parse(H.renderHomeMap(a['41281'])), a['41281']);
});

test('home-map 생성기: 위치는 블록 라벨점 > 대표 지번 > 지구 대표점 > 시군구 대표점, 이름표·공고 확인 호수(공고 id 마다 한 번)·정책 연결·현재 예정', () => {
  const [p1, p2, p3] = gen(fixture())['41281'].projects;
  assert.deepEqual(p1.loc, { by: 'block', at: [126.870871, 37.622237], basis: 'LH_PUBLIC_BLOCK_LABEL_POINT', status: 'REVIEW' });
  assert.equal(p2.loc.by, 'address'); assert.equal(p3.loc.by, 'area');
  assert.equal(p1.label, '고양창릉 A4'); assert.equal(p2.label, '사업 PRJ-41281-0002');
  assert.equal(p1.noticeUnits, 392 + 211); assert.equal(p2.noticeUnits, null);
  assert.deepEqual(p1.policy, { status: 'REVIEW_REQUIRED', names: ['주택공급 확대방안 (9·7)'], short: ['9·7'] }); assert.equal(p2.policy, null);   // short: 화면과 같은 '9·7 대책' 표기용
  assert.equal(p1.completion, '2027-11-14'); assert.equal(p1.moveIn, '2028-01'); assert.equal(p1.bjd, '4128111300'); assert.equal(p1.units, 900);
});

/* ---------- 저장소에 실린 파일 = 원장 지도 색인 ---------- */
const CAPITAL = Object.keys(LEDGER_MAP.bySgg).filter((s) => /^(11|28|41)/.test(s)).sort();
const SHARED = ['id', 'name', 'issued', 'stage', 'cls', 'why', 'overdue', 'next', 'done', 'units', 'pks', 'pnus', 'bundles'];

test('home-map 파일: 수도권 시군구마다 하나, 사업 수와 카드 값(단계·판정·다음 일정·준공 달·호수)이 원장 지도 색인(ledger-map.json)과 같다', () => {
  assert.deepEqual(files().map((f) => f.slice(0, 5)), CAPITAL);
  let n = 0;
  for (const sgg of CAPITAL) {
    const doc = load(sgg), rows = LEDGER_MAP.bySgg[sgg];
    assert.equal(doc.schema, 'home-map/1'); assert.equal(doc.sgg, sgg);
    assert.equal(doc.observedMonth, LEDGER_MAP.observedMonth); assert.equal(doc.referenceDate, LEDGER_MAP.referenceDate);
    assert.deepEqual(doc.projects.map((r) => r.id), rows.map((r) => r.id));
    doc.projects.forEach((r, i) => { for (const k of SHARED) assert.deepEqual(r[k], rows[i][k], `${r.id}.${k}`); });
    n += doc.projects.length;
  }
  assert.equal(n, CAPITAL.reduce((s, k) => s + LEDGER_MAP.bySgg[k].length, 0));
});

test('home-map 파일: 형식이 생성기 출력과 같고(다시 그리면 같은 바이트), 준공 칸은 원장 다음 일정(준공)과 같은 원천 순위다', () => {
  for (const f of files()) {
    const text = fs.readFileSync(path.join(DIR, f), 'utf8'), doc = JSON.parse(text);
    assert.equal(H.renderHomeMap(doc), text, f);
    for (const r of doc.projects) {
      if (r.next && r.next.eventType === 'COMPLETION') assert.equal(r.completion, r.next.planned, r.id);
      if (r.next && r.next.eventType === 'MOVE_IN') assert.equal(r.moveIn, r.next.planned, r.id);
      if (r.loc) { assert.ok(['block', 'address', 'district', 'name', 'area'].includes(r.loc.by)); assert.ok(r.loc.at.every(Number.isFinite)); }
      if (r.loc && r.loc.by === 'name') { assert.equal(r.loc.basis, 'NAME_SEARCH'); assert.equal(r.loc.status, 'REVIEW'); assert.deepEqual(r.bundles, []); }   // 이름 검색 근사는 번들 단지와 이어지지 않은 사업에만
    }
  }
});

/* ---------- 빌드: 해시 사본 + 시군구→해시 표, immutable ---------- */
test('build: data/board/home-map 을 assets/home-map 에 같은 이름과 내용 해시 이름으로 복사하고 표(manifest.json)를 쓴다, 해시 이름은 immutable', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-home-'));
  const w = (p, c) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), c); };
  w('assets/js/app.js', '//app'); w('regions/index.json', JSON.stringify({ regions: [{ slug: 'a', default: true }] })); w('regions/a/region.json', '{}');
  w('data/board/home-map/41281.json', '{"schema":"home-map/1"}\n'); w('data/board/home-map/README.txt', 'x');
  build({ root, env: {}, log: () => {} });
  const m = JSON.parse(fs.readFileSync(path.join(root, 'public/assets/home-map/manifest.json'), 'utf8'));
  assert.deepEqual(Object.keys(m), ['41281']); assert.match(m['41281'], /^[0-9a-f]{8}$/);
  assert.equal(fs.readFileSync(path.join(root, `public/assets/home-map/41281.${m['41281']}.json`), 'utf8'), '{"schema":"home-map/1"}\n');
  assert.ok(fs.existsSync(path.join(root, 'public/assets/home-map/41281.json')));
  assert.ok(!fs.existsSync(path.join(root, 'public/assets/home-map/README.txt'))); assert.ok(!fs.existsSync(path.join(root, 'public/data')));
  const cfg = fs.readFileSync(path.join(ROOT, 'next.config.ts'), 'utf8');
  const hit = /source: '(\/assets\/home-map\/:file\([^']+\))', headers: \[\{ key: 'Cache-Control', value: '([^']+)'/.exec(cfg);
  assert.ok(hit && /immutable/.test(hit[2]));
  const re = new RegExp('^' + hit[1].replace('/assets/home-map/:file(', '/assets/home-map/(').replace(/\\\\/g, '\\') + '$');
  assert.ok(re.test(`/assets/home-map/41281.${m['41281']}.json`)); assert.ok(!re.test('/assets/home-map/41281.json')); assert.ok(!re.test('/assets/home-map/manifest.json'));
  assert.match(fs.readFileSync(path.join(ROOT, 'components/MapIsland.tsx'), 'utf8'), /w\.HOME_MAP = homeMap;/);
});

/* ---------- 지도 연결(region.js) ---------- */
const json = (status, body) => ({ ok: status < 400, status, json: async () => JSON.parse(JSON.stringify(body)) });
function bootCapital(search, resolved, { homeMap, files = {} } = {}) {
  const els = {}, el = (id) => (els[id] = els[id] || { hidden: true, innerHTML: '', textContent: '', addEventListener() {}, setAttribute() {} });
  const doc = { title: '', querySelector: () => null, getElementById: el };
  const urls = [];
  const win = { location: { search, href: `http://x.test/map${search}` }, HOME_MAP: homeMap,
    fetch: async (u) => { u = String(u); urls.push(u); if (u.startsWith('api/v1/resolve')) return json(200, resolved); if (u in files) return json(200, files[u]); if (u.startsWith('api/v1/')) return json(200, { type: 'FeatureCollection', features: [] }); return json(404, {}); } };
  return { win, doc, els, urls };
}
const RES = (sgg, extra = {}) => ({ type: 'sgg', level: 'sgg', sgg, name: `시군구 ${sgg}`, center: [126.87, 37.63], bbox: [126.8, 37.6, 126.95, 37.7], coverage: { tier: 'none' }, ...extra });
const api = (urls) => urls.filter((u) => /^api\/v1\/(permits|infra|ledger)/.test(u));

test('지도: 수도권 시군구(?sgg=41281)는 permits·infra·ledger 를 부르지 않고 정적 자료(해시 이름) 하나로 사업을 그린다 — 사업 수·카드 값 = 원장', async () => {
  const doc = load('41281'), hash = 'abcdef12';
  const { win, doc: d, els, urls } = bootCapital('?sgg=41281', RES('41281'), { homeMap: { 41281: hash }, files: { [`assets/home-map/41281.${hash}.json`]: doc } });
  const r = await R.boot(win, d);
  assert.equal(r.ok, true);
  assert.deepEqual(api(urls), []);
  assert.ok(urls.includes(`assets/home-map/41281.${hash}.json`));
  const drawn = doc.projects.filter((x) => x.loc && ['block', 'address', 'district', 'name'].includes(x.loc.by));
  assert.equal(r.home.total, doc.projects.length); assert.equal(r.blocks.length, drawn.length); assert.equal(r.home.unlocated.length, doc.projects.length - drawn.length);
  for (const b of r.blocks) {
    const row = doc.projects.find((x) => x.id === b.projectId);
    assert.equal(b.ledger.id, row.id); assert.equal(b.ledger.stage, row.stage); assert.equal(b.ledger.cls, row.cls); assert.deepEqual(b.ledger.next, row.next);
    assert.equal(b.home.noticeUnits, row.noticeUnits); assert.equal(b.units, row.units || 0); assert.equal(b.statusBy, 'ledger');
    assert.equal(b.poly.length, row.loc.by === 'name' ? 24 : 8); assert.equal(b.outlineTier, 'point'); assert.equal(!!b.approx, row.loc.by === 'name');   // 이름 검색 근사는 원(24각) + 점선
  }
  assert.equal(win.LEDGER, null); assert.equal(win.GY_INFRA, null); assert.equal(win.GY_BUILDINGS.dynamic, true);   // 원장은 이미 붙었고, 건물은 배경으로 요청 시 조회
  /* '사업 원장'은 정책담당자 관점 낱말, 일반사용자에게는 '사업'(관점 CSS ov-aud-*, 2026-10-18) */
  assert.match(els.pvBanner.innerHTML, new RegExp(`<span class="ov-aud-admin">사업 원장</span><span class="ov-aud-public">사업</span> ${doc.projects.length}건 · 지도 ${drawn.length}건`));
});

test('지도: 수도권 법정동·필지로 열어도 permits 를 부르지 않는다. 표에 없는 시군구는 파일도 부르지 않고 빈 원장, 받지 못하면 그렇다고 알린다', async () => {
  const doc = load('41281');
  const a = bootCapital('?bjd=4128111300', RES('41281', { type: 'bjd', level: 'umd', bjd: '4128111300' }), { files: { 'assets/home-map/41281.json': doc } });   // 해시 표가 없으면 해시 없는 이름
  const ra = await R.boot(a.win, a.doc);
  assert.deepEqual(api(a.urls), []); assert.equal(ra.home.total, doc.projects.length);
  const b = bootCapital('?sgg=11110', RES('11110'), { homeMap: { 41281: 'abcdef12' } });
  const rb = await R.boot(b.win, b.doc);
  assert.deepEqual(api(b.urls), []); assert.ok(!b.urls.some((u) => u.startsWith('assets/home-map/'))); assert.equal(rb.home.total, 0); assert.equal(rb.blocks.length, 0);
  const c = bootCapital('?sgg=41281', RES('41281'), { homeMap: { 41281: 'abcdef12' } });   // 파일 404 가 아니라 실패(500)
  c.win.fetch = async (u) => { u = String(u); c.urls.push(u); if (u.startsWith('api/v1/resolve')) return json(200, RES('41281')); return json(500, {}); };
  const rc = await R.boot(c.win, c.doc);
  assert.deepEqual(api(c.urls), []); assert.equal(rc.home.failed, true); assert.match(c.els.pvBanner.innerHTML, /사업 원장을 불러오지 못함/);
});

test('지도: 비수도권(부산 26350)은 그대로 법정동 인허가(permits)를 부르고 정적 자료는 부르지 않는다', async () => {
  const { win, doc, urls } = bootCapital('?bjd=2635010500', RES('26350', { type: 'bjd', level: 'umd', bjd: '2635010500' }), { homeMap: { 41281: 'abcdef12' } });
  const r = await R.boot(win, doc);
  assert.equal(r.ok, true); assert.equal(r.home, null);
  assert.ok(urls.includes('api/v1/permits?bjd=2635010500')); assert.ok(!urls.some((u) => u.startsWith('assets/home-map/')));
});

test('지도: 수도권 번들 지역(계양)은 번들 단지를 두고 원장 정적 자료를 번들과 함께 받아 붙인다 — 원장 API 를 부르지 않고 상태는 원장 단계(04 안의 준공 임박은 유지)', async () => {
  const RING = [[126.73, 37.55], [126.74, 37.55], [126.74, 37.56], [126.73, 37.56]];
  const proj = (id, status) => ({ id, label: id, name: id, sponsor: { name: 'LH', type: 'public' }, sponsorClass: 'public', kind: '공공분양', status, units: 100, outline: { tier: 'official', poly: RING }, dongs: [], sources: [] });
  const region = { slug: 'r1', name: '계양', title: 't', view: { center: [126.73, 37.55], zoom: 15 }, codes: [{ type: 'sigungu', code: '28245' }], zones: [], sources: [], statusOrder: [] };
  const row = (id, stage, bundle, extra = {}) => ({ id, name: id, label: id, issued: true, stage, cls: 'ok', why: null, overdue: null, next: null, units: 500, pks: [], pnus: [], bundles: bundle ? [bundle] : [], noticeUnits: null, loc: null, policy: { status: 'REVIEW_REQUIRED', names: ['9·7'] }, ...extra });
  const home = { schema: 'home-map/1', sgg: '28245', observedMonth: '2026-10', referenceDate: '2026-10-13', projects: [
    row('PRJ-28245-0053', '02', 'r1/techno-A6'), row('PRJ-28245-0055', '04', 'r1/techno-A2'),
    row('PRJ-28245-0099', '05', null, { loc: { by: 'block', at: [126.735, 37.552], basis: 'LH_PUBLIC_BLOCK_LABEL_POINT', status: 'REVIEW' } }),   // 번들에 없는 원장 사업 → 대표점 표지로 더한다
  ] };
  const files = {
    'regions/index.json': { regions: [{ slug: 'r1', name: '계양', default: true, visibility: 'public' }] }, 'regions/r1/region.json': region,
    'regions/r1/projects.json': { projects: [proj('techno-A6', '분양중'), proj('techno-A2', '준공 임박')] }, 'regions/r1/buildings.json': { type: 'FeatureCollection', meta: {}, features: [] },
    'assets/home-map/28245.abcdef12.json': home,
  };
  const { win, doc, urls } = bootCapital('', null, { homeMap: { 28245: 'abcdef12' }, files });
  const r = await R.boot(win, doc);
  assert.equal(r.ok, true); assert.deepEqual(api(urls), []); assert.equal(win.LEDGER, null);
  const by = (pid) => r.blocks.find((b) => b.pid === pid);
  assert.equal(by('techno-A6').status, '사업화'); assert.equal(by('techno-A6').ledger.stage, '02'); assert.equal(by('techno-A6').statusBy, 'ledger');
  assert.equal(by('techno-A2').status, '준공 임박'); assert.equal(by('techno-A2').ledger.id, 'PRJ-28245-0055');
  assert.equal(by('home-PRJ-28245-0099').status, '분양중'); assert.equal(r.blocks.length, 3);
  assert.ok(by('techno-A6').home.policy); assert.equal(r.home.total, 3);
  const off = bootCapital('?ledger=0', null, { homeMap: { 28245: 'abcdef12' }, files });   // ?ledger=0 이면 번들 그대로
  const ro = await R.boot(off.win, off.doc);
  assert.ok(!off.urls.some((u) => u.startsWith('assets/home-map/'))); assert.equal(ro.blocks.find((b) => b.pid === 'techno-A6').status, '분양중');
});

test('homeToProjects: 같은 점의 사업은 점 둘레로 벌리고(겹치지 않게), 시군구 대표점·위치 없음은 목록(unlocated)으로', () => {
  const at = [127.0, 37.5], row = (id, by) => ({ id, name: id, stage: '02', units: 10, loc: by ? { by, at, status: 'REVIEW' } : null });
  const out = R.homeToProjects([{ projects: [row('PRJ-1', 'district'), row('PRJ-2', 'district'), row('PRJ-3', 'area'), row('PRJ-4', null)] }]);
  assert.deepEqual(out.projects.map((p) => p.projectId), ['PRJ-1', 'PRJ-2']);
  const c = (p) => [p.outline.poly.reduce((s, q) => s + q[0], 0) / 8, p.outline.poly.reduce((s, q) => s + q[1], 0) / 8];
  assert.notDeepEqual(c(out.projects[0]).map((v) => v.toFixed(5)), c(out.projects[1]).map((v) => v.toFixed(5)));
  assert.deepEqual(out.unlocated.map((u) => [u.id, u.loc]), [['PRJ-3', '시군구 대표점'], ['PRJ-4', '']]);
  assert.equal(R.isHomeSgg('41281'), true); assert.equal(R.isHomeSgg('26350'), false); assert.equal(R.isHomeSgg(''), false);
});
