'use strict';
// 건축HUB 주택인허가 전국 대용량(tools/ledger/hub-bulk.js → 중간 스냅샷 → tools/ledger/convert.js): 날짜 정리·범위 거르기·진행 중 규칙·옛 코드 잇기,
// 중간 스냅샷이 원본과 같은지(zip 해시 + 앞부분 다시 읽기), 후보 id 가 매핑으로 이어지는지, LH 블록 연결 규칙, 관리번호가 두 번 나오지 않는지. 네트워크는 쓰지 않는다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const H = require('../../tools/ledger/hub-bulk');
const { convert, loadInputs, readHubBulk, mergeHubIds } = require('../../tools/ledger/convert');
const { parseLegalDong } = require('../../tools/ledger/legal-dong');

const BASE = path.join(__dirname, '..', '..', 'schemas', 'ledger-2026-10');
const read = (p) => JSON.parse(fs.readFileSync(path.join(BASE, p), 'utf8'));
const DONG = 'raw/legal-dong/국토교통부_법정동코드_20260929.csv';
const legalDong = parseLegalDong(fs.readFileSync(path.join(BASE, DONG)), path.basename(DONG));
const bulk = readHubBulk(H.OUT);
const manifest = JSON.parse(fs.readFileSync(H.OUT_MANIFEST, 'utf8'));
const savedIds = read('mappings/hub-candidate-ids.json');
const saved = Object.fromEntries(['projects', 'identifiers', 'project_locations', 'review_required'].map((t) => [t, read(`tables/${t}.json`).rows]));
const BULK = 'hub-bulk-hs-2026-08';
const inputs = (records, hubIds) => loadInputs({ lhSgg: read('mappings/lh-block-sgg.json'), legalDong, hubBulk: { ...bulk, records }, hubIds });

/* 기본개요 한 줄(29열) */
const row = (o) => {
  const c = Array(29).fill('');
  Object.assign(c, { 0: '1000000000000000000001', 3: '11290', 4: '13800', 5: '0', 6: '0001', 7: '0000', 17: '10', 23: '20240105' }, o);
  return c;
};

test('날짜: 달력에 있는 YYYYMMDD 이고 1990-01-01 ~ 2040-12-31 인 값만 받는다', () => {
  assert.equal(H.cleanDate('20240229'), '2024-02-29');
  assert.equal(H.cleanDate(' 20240105 '), '2024-01-05', '앞뒤 공백');
  assert.equal(H.cleanDate('19900101'), '1990-01-01');
  assert.equal(H.cleanDate('20401231'), '2040-12-31');
  for (const bad of ['20230229', '20240431', '19891231', '20410101', '30000101', '99991201', ' 2002 5', '200512', '2005', '00000000', '.', '', null, undefined]) assert.equal(H.cleanDate(bad), null, String(bad));
});

test('범위: 사업승인일 · 총세대수 ≥ 1 · 철거·멸실 표시 없음 · 사용검사일 없음 또는 2025-01-01 이후', () => {
  assert.equal(H.basicRecord(row({ 23: ' 2002 5' })).drop, 'NO_PERMIT_DATE');
  assert.equal(H.basicRecord(row({ 17: '0' })).drop, 'NO_HOUSEHOLDS');
  assert.equal(H.basicRecord(row({ 17: '' })).drop, 'NO_HOUSEHOLDS');
  assert.equal(H.basicRecord(row({ 18: '1' })).drop, 'DEMOLISHED', '철거·멸실 구분 코드');
  assert.equal(H.basicRecord(row({ 22: '20250101' })).drop, 'DEMOLISHED', '철거·멸실일');
  assert.equal(H.basicRecord(row({ 27: '20241231' })).drop, 'COMPLETED_BEFORE_WINDOW');
  const kept = H.basicRecord(row({ 27: '20250101', 24: '200512', 26: '20261130' })).record;
  assert.deepEqual([kept.pk, kept.households, kept.apprv, kept.insp, kept.stcns_sched, kept.insp_sched], ['1000000000000000000001', 10, '2024-01-05', '2025-01-01', null, '2026-11-30']);
  assert.ok(H.basicRecord(row({ 27: '30000101' })).record, '오염된 사용검사일은 비었다고 본다');
});

test('진행 중(기준일 2026-10-10): d 사용검사 ≥ 2025-01-01 · a 승인 ≥ 2021-10-01 · b 착공 ≥ 2018-01-01 · c 사용검사 예정 ≥ 2025-01-01 이고 승인 ≥ 2015-01-01, 아니면 장기 미갱신', () => {
  const basis = (o) => { const r = H.basicRecord(row(o)); return r.drop ?? r.active; };
  assert.equal(basis({ 23: '20211001' }), 'a', 'a: 주택법 제16조 착공 의무 5년 안');
  assert.equal(basis({ 23: '20210930' }), 'STALE', 'a 경계 하루 전');
  assert.equal(basis({ 23: '20100101', 25: '20180101' }), 'b');
  assert.equal(basis({ 23: '20100101', 25: '20171231' }), 'STALE', 'b 경계 하루 전');
  assert.equal(basis({ 23: '20150101', 26: '20250101' }), 'c');
  assert.equal(basis({ 23: '20141231', 26: '20261231' }), 'STALE', 'c 는 2015 전 승인이면 아니다');
  assert.equal(basis({ 23: '20000101', 27: '20250101' }), 'd');
  assert.equal(basis({ 23: '20230101', 27: '20250301' }), 'd', '여럿이 맞으면 d·a·b·c 순서의 첫 근거');
  assert.equal(basis({ 23: '20050301', 24: '20060101', 26: '20081231' }), 'STALE', '2005 허가, 착공·준공 기록 없음, 예정일만 옛날');
  assert.equal(H.activeBasis({ apprv: '2005-03-01', stcns_sched: null, stcns: null, insp_sched: null, insp: null }), null);
});

test('중간 스냅샷 = 원본: zip 해시가 원본 manifest 와 같고, 기본개요 앞 3,000줄을 다시 읽으면 같은 기록이 나온다', () => {
  const raw = read('raw/hub-bulk/manifest.json');
  for (const [k, f] of Object.entries(raw.files)) {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(H.RAW, f.zip))).digest('hex');
    assert.equal(hash, f.zip_sha256, f.zip);
    assert.equal(manifest.files[k].sha256, hash, k);
  }
  const f = raw.files.basic;
  const head = execFileSync('sh', ['-c', 'unzip -p "$1" "$2" | head -n 3000', 'sh', path.join(H.RAW, f.zip), f.member], { encoding: 'utf8', maxBuffer: 64 << 20 });
  const byPk = new Map(bulk.records.map((r) => [r.pk, r]));
  let kept = 0;
  for (const line of head.split('\n').filter(Boolean)) {
    const r = H.basicRecord(line.split('|')).record;
    if (!r) continue;
    kept++;
    const { complex, site, site_count, ...mid } = byPk.get(r.pk);
    const { complex: c0, site: s0, site_count: n0, ...fresh } = r;
    assert.deepEqual(mid, fresh, r.pk);
  }
  assert.ok(kept > 50, `앞 3,000줄 중 남은 기록 ${kept}`);
  const fn = manifest.funnel;
  assert.deepEqual(fn, { rows: 377256, NO_PERMIT_DATE: 951, NO_HOUSEHOLDS: 348582, DEMOLISHED: 0, COMPLETED_BEFORE_WINDOW: 13764, STALE: 9856, kept: 4103 });
  assert.equal(fn.rows, fn.NO_PERMIT_DATE + fn.NO_HOUSEHOLDS + fn.DEMOLISHED + fn.COMPLETED_BEFORE_WINDOW + fn.STALE + fn.kept);
  assert.deepEqual(manifest.active, { d: 630, a: 2912, b: 70, c: 491 }, '남은 기록의 근거(d·a·b·c 순서로 처음 맞는 것)');
  assert.equal(bulk.records.reduce((s, r) => s + r.households, 0), 2579621);
  assert.ok(bulk.records.every((r) => H.activeBasis(r)), '남은 기록은 모두 진행 중');
  assert.equal(bulk.records.length, fn.kept);
  assert.equal(new Set(bulk.records.map((r) => r.pk)).size, bulk.records.length, '관리번호 중복 없음');
});

test('옛 코드 잇기: 폐지 법정동은 시도 이름을 지금 이름으로 바꿔 끝 이름이 같은 존재 법정동 하나로, 기본개요에 위치가 없으면 대지위치 대표 필지', () => {
  const m = H.codeMapper(legalDong.rows, legalDong.abolished);
  assert.equal(m.bjd('2826010800'), '2827510600', '인천 서구 가정동 → 서해구 가정동(2026-07 개편)');
  assert.equal(m.bjd('4128310100'), '4128510100', '고양 일산구 식사동 → 일산동구 식사동');
  assert.equal(m.bjd('1129013800'), '1129013800', '존재 코드는 그대로');
  assert.equal(m.sgg('42130'), '51130', '강원도 원주시 → 강원특별자치도 원주시');
  assert.equal(m.sgg('43710'), null, '청원군은 시군구 이름으로 못 잇는다');
  const at = H.locate({ sgg: '', bjd: '', site: { sgg: '11290', bjd: '13800', plat_gb: '0', bun: '0317', ji: '0000' } }, m);
  assert.deepEqual(at, { sgg: '11290', bjd: '1129013800', pnu: '1129013800103170000' });
  assert.deepEqual(H.locate({ sgg: '28260', bjd: '10800', plat_gb: '2', bun: '0000', ji: '0000' }, m), { sgg: '28275', bjd: '2827510600', pnu: null }, '블록 단위 허가는 필지 없음');
});

test('블록 코드·지구 낱말: A-2 ≈ A2 ≈ A2BL ≈ A02 ≈ A-2블록, 번호뿐인 블록은 대조하지 않는다', () => {
  assert.deepEqual(['A-2', 'A2', 'A2BL', 'A02', 'a-2bl', 'A-2블록', '51L3', '1', '01', ''].map(H.normBlock), ['A2', 'A2', 'A2', 'A2', 'A2', 'A2', '51L3', null, null, null]);
  assert.deepEqual(['인천계양(공공주택)', '위례A2-7BL', '광주장덕 C-20BL', '파주운정3(07택1)', 'A'].map(H.districtToken), ['인천계양', '위례', '광주장덕', '파주운정3', null]);
});

test('후보 id: 매핑으로 다시 만들면 같은 id, 새 필지의 새 관리번호는 시군구의 다음 번호(장기 미갱신으로 빠진 id 다음), 기존 필지의 새 관리번호는 그 사업 id', () => {
  const existing = saved.project_locations.find((l) => l.source_ref === BULK && l.pnu);
  const host = bulk.records.find((r) => savedIds[r.pk] === existing.local_project_id);
  const extra = [
    { ...host, pk: '9999999999999999999998', apprv: '2026-08-01', insp: null },
    { ...bulk.records[0], pk: '9999999999999999999999', sgg: '11290', bjd: '13800', plat_gb: '0', bun: '9998', ji: '0000', block: '', apprv: '2026-08-01', insp: null, site: null },
  ];
  const t = convert(inputs([...bulk.records, ...extra], savedIds));
  const idOf = (pk) => t.identifiers.find((i) => i.id_type === 'HUB_HS_PK' && i.id_value === pk)?.local_project_id;
  assert.equal(idOf('9999999999999999999998'), existing.local_project_id);
  const max = Math.max(...[...saved.projects.map((p) => p.local_project_id), ...Object.values(savedIds)].filter((id) => id.startsWith('PRJ-11290-')).map((id) => +id.slice(-4)));
  assert.equal(idOf('9999999999999999999999'), `PRJ-11290-${String(max + 1).padStart(4, '0')}`);
  const live = new Set(bulk.records.map((r) => r.pk));
  for (const [pk, id] of Object.entries(savedIds)) if (live.has(pk)) assert.equal(idOf(pk), id, pk);
  const merged = mergeHubIds(savedIds, t);
  assert.equal(Object.keys(merged).length, Object.keys(savedIds).length + 2, '매핑은 더하기만 한다');
  assert.deepEqual(mergeHubIds(savedIds, convert(inputs(bulk.records, savedIds))), savedIds, '같은 입력이면 매핑이 그대로');
});

test('LH 블록 연결: 시군구·블록 코드·지구 이름이 맞으면 LH 후보(고양장항 A-2)에 붙고, 지구 이름이 없으면 따로 싣는다', () => {
  const rec = { pk: 'T1', sgg: '41285', bjd: '10400', plat_gb: '2', bun: '0000', ji: '0000', block: 'A2BL', special: '고양장항 공공주택지구', address: '경기도 고양시 일산동구 장항동 블록', name: 'LH아파트', complex: null, use: '공동주택', households: 500, apprv: '2023-01-02', stcns_sched: null, stcns: '2023-06-01', insp_sched: '2026-12-31', insp: null, site: null, site_count: 1 };
  const other = { ...rec, pk: 'T2', bjd: '10500', special: '', address: '경기도 고양시 일산동구 마두동 블록' };
  const t = convert(inputs([rec, other], {}));
  const lhId = t.identifiers.find((i) => i.id_type === 'AREA_BLOCK' && i.id_value === '고양장항|A-2').local_project_id;
  const of = (pk) => t.identifiers.find((i) => i.id_value === pk).local_project_id;
  assert.equal(of('T1'), lhId);
  assert.ok(t.events.some((e) => e.local_project_id === lhId && e.source_ref === BULK && e.event_type === 'CONSTRUCTION_START' && e.date_type === 'ACTUAL'));
  assert.ok(!t.projects.some((p) => p.source_ref === BULK && p.local_project_id === of('T1')), 'LH 후보에 붙으면 새 사업이 없다');
  const sep = t.projects.find((p) => p.local_project_id === of('T2'));
  assert.equal(sep.source_ref, BULK, '지구 이름이 없는 묶음은 건축HUB 후보로 따로');
  assert.deepEqual([sep.project_unit, sep.stage_code, sep.issued_at, sep.public_scope], ['BLOCK', '04', null, 'UNKNOWN']);
});

test('관리번호는 한 번만: 대용량 기록마다 식별자 한 행(사업 또는 LH 후보) · 시군구 미해결 검토 · 레지스트리와 겹침 중 하나', () => {
  const ids = saved.identifiers.filter((i) => i.id_type === 'HUB_HS_PK');
  assert.equal(new Set(ids.map((i) => i.id_value)).size, ids.length);
  const fromBulk = new Set(ids.filter((i) => i.source_ref === BULK).map((i) => i.id_value));
  const unresolved = new Set(saved.review_required.filter((r) => r.review_type === 'SGG_UNRESOLVED' && r.source_ref === BULK).map((r) => r.record_key));
  const registry = new Set(ids.filter((i) => i.source_ref !== BULK).map((i) => i.id_value));
  for (const r of bulk.records) assert.equal([fromBulk.has(r.pk), unresolved.has(r.pk), registry.has(r.pk)].filter(Boolean).length, 1, r.pk);
  const regLeft = bulk.records.filter((r) => registry.has(r.pk)).length;
  assert.deepEqual([fromBulk.size, unresolved.size], [4103 - 5 - regLeft, 5]);
});

test('매핑은 더하기만: 장기 미갱신으로 빠진 관리번호의 id 도 매핑에 남고(사업은 없음), 대용량 후보 사업은 모두 매핑의 id', () => {
  const projOf = new Set(Object.values(savedIds)), bulkProjects = saved.projects.filter((p) => p.source_ref === BULK);
  assert.equal(Object.keys(savedIds).length, 13588, '관리번호 13,588개(2026-10 첫 실행) 그대로');
  assert.equal(bulkProjects.length, 3495);
  assert.ok(bulkProjects.every((p) => projOf.has(p.local_project_id)));
  const live = new Set(bulk.records.map((r) => r.pk)), gone = Object.keys(savedIds).filter((pk) => !live.has(pk));
  assert.ok(gone.length > 9000, `빠진 관리번호 ${gone.length}`);
  const ids = new Set(saved.projects.map((p) => p.local_project_id)), liveIds = new Set([...live].map((pk) => savedIds[pk]));
  assert.ok(gone.filter((pk) => !liveIds.has(savedIds[pk])).every((pk) => !ids.has(savedIds[pk])), '빠진 관리번호만 가리키던 id 는 사업이 없다');
});
