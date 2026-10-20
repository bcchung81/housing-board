'use strict';
// tools/ledger/home-sources.js · lib/board/home-sources.ts — 수집 상태. 요약 파일의 수는 원장 표·HOME 수집 실행 기록의 규칙으로 센 값과 맞아야 한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('../../tools/ledger/home-sources.js');
const L = require('../../lib/board/home-sources.ts');
const A = require('../../lib/board/annual.ts');
const hs = require('../../data/board/home-sources.json');
const molit = require('../../data/board/molit.json');
const sources = require('../../data/board/sources.json');

const T = path.join(__dirname, '..', '..', 'schemas/ledger-2026-10/tables');
const links = JSON.parse(fs.readFileSync(path.join(T, 'links.json'), 'utf8')).rows;

test('build: 마지막 실행이 성공이면 정상, 실패면 실패 — 마지막 정상 수집은 성공 실행의 끝 시각', () => {
  const batch = [
    { id: '1', source_id: 'a', status: 'SUCCESS', started_at: '2026-10-01 00:00:00+00', finished_at: '2026-10-01 00:00:05+00' },
    { id: '2', source_id: 'a', status: 'FAILED', started_at: '2026-10-02 00:00:00+00', finished_at: '2026-10-02 00:00:01+00' },
    { id: '3', source_id: 'b', status: 'FAILED', started_at: '2026-10-01 00:00:00+00', finished_at: '2026-10-01 00:00:01+00' },
    { id: '4', source_id: 'b', status: 'SUCCESS', started_at: '2026-10-03 00:00:00+00', finished_at: '2026-10-03 00:00:09+00' },
    { id: '5', source_id: 'c', status: 'INTERRUPTED', started_at: '2026-10-03 00:00:00+00', finished_at: '2026-10-03 00:00:01+00' },
  ];
  const coverage = [
    { source_id: 'a', expected_count: '10', fetched_count: '10', query_status: 'COMPLETE_QUERY', source_period: '2018~2020' },
    { source_id: 'b', expected_count: '10', fetched_count: '4', query_status: 'COMPLETE_QUERY', source_period: null },
  ];
  const out = build({ batch, coverage, tables: { sources: [], links: [], events: [], notices: [], area_facts: [] } });
  const by = Object.fromEntries(out.sources.map((s) => [s.id, s]));
  assert.deepEqual([by.a.ok, by.b.ok, by.c.ok], [false, true, false]);
  assert.equal(by.a.lastOk, '2026-10-01T00:00:05Z');
  assert.equal(by.c.lastOk, null);
  assert.deepEqual([by.a.runs, by.a.failed, by.c.interrupted], [2, 1, 1]);
  assert.deepEqual([by.a.partial, by.b.partial], [false, true]);   // 수집 < 기대면 일부 범위
  assert.deepEqual(out.runs, { total: 5, success: 2, failed: 2, interrupted: 1 });
  assert.deepEqual(out.grid.map((g) => g.years), [{ 2018: 'full', 2019: 'full', 2020: 'full' }]);   // 기간 '2018~2020' 꼴만 격자에 든다
});

test('data/board/home-sources.json: 실행 합계·원천 수·연결 수가 서로·원장 표와 맞는다', () => {
  assert.equal(hs.runs.total, hs.runs.success + hs.runs.failed + hs.runs.interrupted);
  assert.equal(hs.sources.reduce((n, s) => n + s.runs, 0), hs.runs.total);
  assert.equal(hs.sources.reduce((n, s) => n + s.failed, 0), hs.runs.failed);
  /* 2026-10-20 판: HOME 원천 62→76(새 원천 14 — 이름은 HOME 등록부 커밋 2038810), 마지막 실행 실패에 건축HUB 일반 건축인허가가 더해졌다 */
  assert.equal(hs.sources.length, 76);
  assert.deepEqual(hs.sources.filter((s) => !s.ok).map((s) => s.id), ['building_general_permit', 'ih_supply']);
  /* 이름·기관은 HOME 원천 등록부(sources.py SOURCES) 그대로 — 62곳 모두 이름이 있다(id 를 이름으로 쓴 원천 없음, 2026-10-14 판의 새 원천 2곳은 덤프 안내서 설명으로) */
  assert.ok(hs.sources.every((s) => s.name !== s.id && s.org !== 'HOME'), '등록부에 없는 원천');
  const ih = hs.sources.find((s) => s.id === 'ih_supply');
  assert.deepEqual([ih.name, ih.org], ['iH 인천도시공사 임대주택 재고·계약·공가 참조', '인천도시공사']);
  for (const l of hs.links) {
    const rows = links.filter((x) => x.link_type === l.type);
    assert.equal(l.confirmed + l.review + l.other, rows.length);
    assert.equal(l.confirmed, rows.filter((x) => x.review_status === 'CONFIRMED').length);
  }
  assert.deepEqual(hs.links.map((l) => [l.type, l.review, l.confirmed]), [['POLICY_PROGRAM', 13, 31], ['PROGRAM_PROJECT', 98, 200]]);   // 2026-10-20 판: 확정 25→31 · 174→200
});

test('statusRows: 실패 원천이 맨 위, 그 뒤 우리 원천 + HOME 원천 · 실패 원천은 마지막 정상 없음', () => {
  const rows = L.statusRows(hs, sources.items);
  assert.equal(rows.length, sources.items.length + hs.sources.length);
  assert.equal(rows.filter((r) => r.owner === '우리').length, 17);
  const ih = rows.find((r) => r.id === 'ih_supply');
  assert.deepEqual([ih.ok, ih.lastOk], [false, null]);
  assert.match(ih.note, /정상 수집 없음/);
  assert.equal(rows.filter((r) => !r.ok).length, 2);   // 2026-10-20 판: ih_supply + building_general_permit
  assert.deepEqual(rows.slice(0, 2).map((r) => r.id).sort(), ['building_general_permit', 'ih_supply'], '실패 원천이 맨 위');
  assert.equal(rows[2].owner, '우리', '그 뒤는 우리 원천부터');
  assert.equal(rows.find((r) => r.id === 'molit-permit-monthly').lastOk, '2026.10.03');
});

test('kstDate: UTC 는 한국 날짜로, +09:00 은 그대로', () => {
  assert.equal(L.kstDate('2026-10-13T16:00:00Z'), '2026.10.14');
  assert.equal(L.kstDate('2026-10-03T18:38:26+09:00'), '2026.10.03');
  assert.equal(L.kstDate(null), null);
});

test('coverageRows: 통계누리는 2021 부분(9~12월)·2022~2025 확보·2026 부분·2018~2020 미확보', () => {
  const rows = L.coverageRows(hs, A.annualSeries(molit, 'complete', '00'));
  assert.deepEqual(rows[0].cells, ['none', 'none', 'none', 'part', 'full', 'full', 'full', 'full', 'part']);
  assert.ok(rows.every((r) => r.cells.length === L.GRID_YEARS.length));
});
