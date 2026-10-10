'use strict';
// 일정 월 스냅샷 — 건축HUB 부분(tools/ledger/snapshot.js): 저장된 2026-10 원본(schemas/ledger-2026-10/raw/hub)으로 다시 만들어 원장 events 스키마·레지스트리·정밀도 규칙을 확인한다. 네트워크는 쓰지 않는다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020');
const { eventsFromHub, matchRefs, bjdCodesOf } = require('../../tools/ledger/snapshot');

const ROOT = path.join(__dirname, '..', '..');
const MONTH = '2026-10';
const DIR = path.join(ROOT, `schemas/ledger-${MONTH}`);
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'registry/projects.json'), 'utf8'));
const raw = Object.fromEntries(bjdCodesOf(registry).map((bjd) => [bjd, JSON.parse(fs.readFileSync(path.join(DIR, 'raw/hub', `${bjd}.json`), 'utf8')).pages.flatMap((p) => p.items)]));
const rows = eventsFromHub(raw, registry, MONTH);

const ajv = new Ajv2020({ allErrors: true, strict: true });
for (const f of fs.readdirSync(path.join(ROOT, 'schemas/ledger'))) ajv.addSchema(JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas/ledger', f), 'utf8')));
const checkEvents = (rs) => { const v = ajv.getSchema('events.schema.json'); return v({ schema_version: 'ledger/1', table: 'events', rows: rs }) ? [] : v.errors; };

test('모든 행이 원장 events 스키마를 통과하고, 저장된 스냅샷 파일과 같다', () => {
  assert.ok(rows.length > 0);
  assert.deepEqual(checkEvents(rows), []);
  const saved = JSON.parse(fs.readFileSync(path.join(DIR, 'snapshot/hub-events.json'), 'utf8'));
  assert.deepEqual(saved, { schema_version: 'ledger/1', table: 'events', rows });
});

test('모든 행의 사업은 레지스트리의 건축HUB 사업이고, 찍은 달·원천·검토 상태가 고정값이다', () => {
  const hub = new Set(registry.projects.filter((p) => p.refs.some((r) => r.system === 'hub-hs-basis')).map((p) => p.id));
  for (const r of rows) {
    assert.ok(hub.has(r.local_project_id), r.local_project_id);
    assert.equal(r.observed_month, MONTH);
    assert.equal(r.source_ref, 'hub-hs-basis');
    assert.equal(r.review_status, 'CONFIRMED');
    assert.equal(r.complex_id, null);
    assert.match(r.event_detail, /^관리번호 \d+$/);
  }
  const { missing } = matchRefs(raw, registry);
  const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'snapshot/manifest.json'), 'utf8'));
  assert.deepEqual(manifest.refs_missing, missing);
  assert.equal(manifest.rows, rows.length);
});

test('ACTUAL 행은 plan_basis null, PLANNED 행은 늘 CURRENT · (사업, 이벤트, 예정/실제)당 한 행', () => {
  const seen = new Set();
  for (const r of rows) {
    assert.equal(r.plan_basis, r.date_type === 'ACTUAL' ? null : 'CURRENT');
    const k = `${r.local_project_id}|${r.event_type}|${r.date_type}`;
    assert.ok(!seen.has(k), k);
    seen.add(k);
  }
});

test('정밀도: YYYYMMDD → event_date, YYYYMM → event_month, YYYY → event_year, 비었거나 이상한 값은 건너뜀', () => {
  const reg = { projects: [
    { id: 'PRJ-11111-0001', bjdCodes: ['1111100000'], refs: [{ system: 'hub-hs-basis', key: 'mgmHsrgstPk', value: '1' }] },
    { id: 'PRJ-11111-0002', bjdCodes: ['1111100000'], refs: [{ system: 'hub-hs-basis', key: 'mgmHsrgstPk', value: '2' }, { system: 'hub-hs-basis', key: 'mgmHsrgstPk', value: '3' }] },
  ] };
  const recs = [
    { mgmHsrgstPk: 1, apprvDay: '20200115', stcnsSchedDay: '202107', stcnsDay: ' ', useInsptSchedDay: '2024', useInsptDay: '20231340' },
    // 변경허가 둘: 예정일은 기간 끝이 늦은 것(202312 > 20231130), 착공 실제일은 이른 것, 사업승인일은 늦은 것
    { mgmHsrgstPk: '2', apprvDay: '20190101', stcnsSchedDay: '20231130', stcnsDay: '20200301', useInsptSchedDay: '', useInsptDay: '2023ab' },
    { mgmHsrgstPk: '3', apprvDay: '20200601', stcnsSchedDay: '202312', stcnsDay: '20200401', useInsptSchedDay: '19000101x', useInsptDay: null },
    { mgmHsrgstPk: '9', apprvDay: '20200101' },
  ];
  const out = eventsFromHub({ '1111100000': recs }, reg, MONTH);
  const pick = (id, t, d) => out.filter((r) => r.local_project_id === id && r.event_type === t && r.date_type === d).map((r) => [r.event_date, r.event_month, r.event_year, r.event_detail]);
  assert.deepEqual(pick('PRJ-11111-0001', 'PERMIT', 'ACTUAL'), [['2020-01-15', null, null, '관리번호 1']]);
  assert.deepEqual(pick('PRJ-11111-0001', 'CONSTRUCTION_START', 'PLANNED'), [[null, '2021-07', null, '관리번호 1']]);
  assert.deepEqual(pick('PRJ-11111-0001', 'COMPLETION', 'PLANNED'), [[null, null, '2024', '관리번호 1']]);
  assert.deepEqual(pick('PRJ-11111-0001', 'CONSTRUCTION_START', 'ACTUAL'), [], '빈 값');
  assert.deepEqual(pick('PRJ-11111-0001', 'COMPLETION', 'ACTUAL'), [], '달력에 없는 날');
  assert.deepEqual(pick('PRJ-11111-0002', 'PERMIT', 'ACTUAL'), [['2020-06-01', null, null, '관리번호 3']]);
  assert.deepEqual(pick('PRJ-11111-0002', 'CONSTRUCTION_START', 'ACTUAL'), [['2020-03-01', null, null, '관리번호 2']]);
  assert.deepEqual(pick('PRJ-11111-0002', 'CONSTRUCTION_START', 'PLANNED'), [[null, '2023-12', null, '관리번호 3']]);
  assert.deepEqual(pick('PRJ-11111-0002', 'COMPLETION', 'PLANNED'), []);
  assert.deepEqual(pick('PRJ-11111-0002', 'COMPLETION', 'ACTUAL'), []);
  assert.equal(out.length, 6);
  assert.deepEqual(checkEvents(out), []);
  assert.deepEqual(matchRefs({ '1111100000': recs.slice(0, 2) }, reg).missing, [{ local_project_id: 'PRJ-11111-0002', mgmHsrgstPk: '3' }]);
});

test('같은 원본으로 두 번 만들면 결과가 같다', () => {
  assert.deepEqual(eventsFromHub(raw, registry, MONTH), rows);
  assert.equal(JSON.stringify(eventsFromHub(raw, registry, MONTH)), JSON.stringify(rows));
});
