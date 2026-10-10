'use strict';
// 2026-10 기준 원장 한 벌(schemas/ledger-2026-10/tables): 저장된 표가 검증을 통과하고, 같은 입력으로 다시 만들면 똑같이 나온다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { convert, loadInputs } = require('../../tools/ledger/convert');
const { validate } = require('../../tools/ledger/validate');
const { parseLegalDong } = require('../../tools/ledger/legal-dong');

const BASE = path.join(__dirname, '..', '..', 'schemas', 'ledger-2026-10');
const read = (p) => JSON.parse(fs.readFileSync(path.join(BASE, p), 'utf8'));
const DONG = 'raw/legal-dong/국토교통부_법정동코드_20260929.csv';
const saved = Object.fromEntries(fs.readdirSync(path.join(BASE, 'tables')).map((f) => { const j = read(`tables/${f}`); return [j.table, j.rows]; }));
const rebuilt = convert(loadInputs({
  observedMonth: '2026-10',
  lhSgg: read('mappings/lh-block-sgg.json'),
  hubEvents: read('snapshot/hub-events.json').rows,
  legalDong: parseLegalDong(fs.readFileSync(path.join(BASE, DONG)), path.basename(DONG)),
}));

test('저장된 2026-10 기준 표 16개가 검증(스키마·키 중복·표 사이 참조)을 통과한다', () => {
  assert.equal(Object.keys(saved).length, 16);
  assert.deepEqual(validate(saved), []);
});

test('같은 입력(법정동코드·LH 매핑·건축HUB 스냅샷)으로 다시 만들면 저장된 표와 같다', () => {
  for (const [table, rows] of Object.entries(rebuilt)) assert.deepEqual(saved[table], rows, table);
});

test('2026-10 기준: 사업 = 발급 77 + LH 후보 273(발급 전), 이벤트는 모두 2026-10 관측, 검토 목록은 공공 여부 미확인만', () => {
  const issued = saved.projects.filter((p) => p.issued_at), candidates = saved.projects.filter((p) => !p.issued_at);
  assert.equal(issued.length, 77);
  assert.equal(candidates.length, 273);
  assert.ok(candidates.every((p) => p.source_ref === 'datagokr-15141761' && p.agency_id === 'lh'));
  assert.ok(saved.events.every((e) => e.observed_month === '2026-10'));
  assert.equal(saved.events.filter((e) => e.source_ref === 'hub-hs-basis').length, read('snapshot/hub-events.json').rows.length);
  assert.deepEqual([...new Set(saved.review_required.map((r) => r.review_type))], ['PUBLIC_SCOPE_UNKNOWN']);
  assert.equal(saved.areas.filter((a) => a.source_ref === 'datagokr-15123287').length, 20560, '법정동코드 파일의 존재 행');
});

test('예정일 경과(2026-10-10): 현재 예정의 기간 끝이 지났고, 같은 종류의 실제 기록이 없고, 사업 단계가 아직 그 단계 전인 건축HUB 사업 — 9개 사업 13쌍', () => {
  const stage = Object.fromEntries(saved.projects.map((p) => [p.local_project_id, p.stage_code]));
  const hub = saved.events.filter((e) => e.source_ref === 'hub-hs-basis');
  const actual = new Set(hub.filter((e) => e.date_type === 'ACTUAL').map((e) => `${e.local_project_id}|${e.event_type}`));
  const end = (e) => e.event_date ?? (e.event_month ? `${e.event_month}-31` : `${e.event_year}-12-31`);
  const reached = { CONSTRUCTION_START: '04', COMPLETION: '06' };
  const overdue = hub.filter((e) => e.date_type === 'PLANNED' && end(e) < '2026-10-10' && !actual.has(`${e.local_project_id}|${e.event_type}`) && stage[e.local_project_id] < reached[e.event_type]);
  assert.equal(overdue.length, 13);
  assert.equal(new Set(overdue.map((e) => e.local_project_id)).size, 9);
});
