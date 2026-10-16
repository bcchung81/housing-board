'use strict';
/* 경기 상세 지역 번들(regions/gyeonggi-*) 연결: 지역 설정 → 번들 → 시군구 코드 → 지도 지역 선택기.
   - region.json 의 시군구 코드가 tools/regiontools/regions/<slug>.json 과 같고, 수도권 경량 번들 목록(home-lite)에 있는 시군구다
   - lib/coverage.js readCoverage 가 그 코드를 그 지역으로 잇는다(운영에서는 preview 지역을 뺀다)
   - 지역 선택기는 index 이름('경기 남양주시')이 '경기' 묶음의 시군구 이름과 같을 때 한 항목('… · 상세 3D')으로 합친다
   - 단지 zoneId 는 region.json 지구 안에 있고, 단지 id 는 겹치지 않는다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../../assets/js/region.js');
const { readCoverage } = require('../../lib/coverage.js');

const ROOT = path.join(__dirname, '..', '..');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const INDEX = readJson('regions/index.json');
const GG = INDEX.regions.filter((r) => r.slug.startsWith('gyeonggi-'));
const LITE_INDEX = readJson('data/board/home-lite/index.json');
const LITE = Object.fromEntries(LITE_INDEX.sggs.map((e) => [e.sgg, { name: e.name, n: e.projects }]));

test('index 의 경기 상세 지역마다 설정 파일·번들 파일이 다 있다(아직 index 에 올린 경기 지역이 없으면 빈 시험)', () => {
  for (const r of GG) {
    const cfg = readJson(`tools/regiontools/regions/${r.slug}.json`);
    assert.equal(cfg.name, r.name, r.slug);
    for (const f of ['region.json', 'projects.json', 'buildings.json']) assert.ok(fs.existsSync(path.join(ROOT, 'regions', r.slug, f)), `${r.slug}/${f}`);
    assert.ok(['public', 'preview'].includes(r.visibility));
  }
});

test('region.json 시군구 코드 = 설정 파일 코드 = 수도권 목록(home-lite)의 같은 시군구, 이름도 맞는다', () => {
  for (const r of GG) {
    const region = readJson(`regions/${r.slug}/region.json`), cfg = readJson(`tools/regiontools/regions/${r.slug}.json`);
    const sgg = region.codes.filter((c) => c.type === 'sigungu').map((c) => c.code);
    assert.deepEqual(sgg, [cfg.sigungu], r.slug);
    assert.ok(LITE[cfg.sigungu], `${r.slug}: home-lite 에 ${cfg.sigungu} 가 없음`);
    assert.equal(`경기 ${LITE[cfg.sigungu].name.replace(/^경기도\s*/, '')}`, r.name, r.slug);
  }
});

test('readCoverage: 경기 시군구 코드가 그 상세 지역으로 이어지고, 운영에서는 preview 지역을 뺀다', () => {
  const cov = readCoverage(), prod = readCoverage(undefined, true);
  for (const r of GG) {
    const code = readJson(`tools/regiontools/regions/${r.slug}.json`).sigungu;
    assert.equal(cov[code] && cov[code].slug, r.slug);
    assert.equal(!!prod[code], r.visibility !== 'preview', `${r.slug}: 운영 해석은 visibility 를 따른다`);
  }
  assert.equal(cov['28245'].slug, 'incheon-gyeyang');   // 기존 지역은 그대로
});

test('지역 선택기: 경기 상세 지역은 경기 묶음의 같은 시군구와 한 항목(· 상세 3D)으로 합쳐지고 맨 아래 묶음에 남지 않는다', () => {
  const els = { regionBox: { hidden: true }, regionSel: { innerHTML: '', addEventListener() {} } };
  const first = GG[0] ? GG[0].slug : '';
  R.mountSelector({ getElementById: (id) => els[id] }, { regions: INDEX.regions, name: '', slug: first },
    { HOME_LITE: LITE, RESOLVED: null, location: { href: 'http://x.test/map' } });
  const s = els.regionSel.innerHTML;
  const gg = (s.match(/<optgroup label="경기">([\s\S]*?)<\/optgroup>/) || [])[1] || '';
  const rest = (s.match(/<optgroup label="상세 3D 지역">([\s\S]*?)<\/optgroup>/) || [])[1] || '';
  for (const r of GG) {
    assert.match(gg, new RegExp(`<option value="${r.slug}"[^>]*>[^<]* · 상세 3D</option>`), r.slug);
    assert.doesNotMatch(rest, new RegExp(r.slug));
  }
  if (first) assert.match(gg, new RegExp(`<option value="${first}" selected>[^<]* · \\d+건 · 상세 3D</option>`));
});

test('번들 안: 단지 zoneId 는 region.json 지구에 있고 id 가 겹치지 않으며, 건물은 지구 범위 근처에 있다', () => {
  for (const r of GG) {
    const region = readJson(`regions/${r.slug}/region.json`), projects = readJson(`regions/${r.slug}/projects.json`);
    const zones = new Set(region.zones.map((z) => z.id));
    const cfg = readJson(`tools/regiontools/regions/${r.slug}.json`);
    assert.deepEqual([...zones], cfg.zones.map((z) => z.id), r.slug);
    const ids = projects.projects.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length, `${r.slug}: 단지 id 중복`);
    for (const p of projects.projects) assert.ok(zones.has(p.zoneId), `${r.slug}: ${p.id} zoneId ${p.zoneId}`);
    const [x, y] = region.view.center;
    assert.ok(x > 126.5 && x < 127.6 && y > 36.9 && y < 38.0, `${r.slug}: 중심이 경기 밖`);
  }
});
