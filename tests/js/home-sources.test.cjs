'use strict';
// tools/ledger/home-sources.js · lib/board/home-sources.ts — 수집 상태. 요약 파일의 수는 HOME 덤프(수집 실행·연결)와 PoC 스냅샷(건수·기준일·조회 상태·연도 확보)의 규칙으로 센 값과 맞아야 한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const { build, scrub, writeManifest } = require('../../tools/ledger/home-sources.js');
const L = require('../../lib/board/home-sources.ts');
const hs = require('../../data/board/home-sources.json');

test('build: 마지막 실행이 성공이면 정상, 실패면 실패 — 건수·기준일·조회 상태는 PoC 스냅샷, 연결은 덤프 상태별로 센다', () => {
  const batch = [
    { id: '1', source_id: 'a', status: 'SUCCESS', started_at: '2026-10-01 00:00:00+00', finished_at: '2026-10-01 00:00:05+00' },
    { id: '2', source_id: 'a', status: 'FAILED', started_at: '2026-10-02 00:00:00+00', finished_at: '2026-10-02 00:00:01+00' },
    { id: '3', source_id: 'b', status: 'FAILED', started_at: '2026-10-01 00:00:00+00', finished_at: '2026-10-01 00:00:01+00' },
    { id: '4', source_id: 'b', status: 'SUCCESS', started_at: '2026-10-03 00:00:00+00', finished_at: '2026-10-03 00:00:09+00' },
    { id: '5', source_id: 'c', status: 'INTERRUPTED', started_at: '2026-10-03 00:00:00+00', finished_at: '2026-10-03 00:00:01+00' },
  ];
  const poc = {
    fetchedAt: '2026-10-21T00:00:00Z', summary: { generated_at: '2026-10-21T09:00:00+09:00' },
    list: [
      { id: 'a', name: '가', org: '갑', record_count: 5, stats: { source_base_date: '2026-01-01' } },
      { id: 'b', name: '나', org: '갑', record_count: 7, stats: { dataset_version: '2025-09-22' } },
      { id: 'c', name: '다', org: '을', record_count: 0, stats: {} },
    ],
    validation: {
      coverage: { items: [{ source_id: 'a', query_status: 'PARTIAL', provided_records: 10, fetched_records: 9 }, { source_id: 'b', query_status: 'VERIFIED', provided_records: null, fetched_records: 7 }, { source_id: 'c', query_status: 'NOT_COLLECTED', provided_records: null, fetched_records: 0 }] },
      data_gaps: { rows: [{ source_id: 'a', label: '준공 · 지역 전체', region: '서울특별시', cells: [{ year: 2018, status: 'ACQUIRED' }, { year: 2019, status: 'NOT_ACQUIRED' }, { year: 2020, status: 'NO_SOURCE_RECORD' }, { year: 2021, status: 'SOURCE_NOT_PUBLISHED' }] }] },
    },
  };
  const st = (status) => ({ status });
  const out = build({ batch, poc, mapping: [st('CONFIRMED'), st('CONFIRMED'), st('REVIEW'), st('RELEASED')], programMapping: [st('CONFIRMED'), st('RELEASED')] });
  const by = Object.fromEntries(out.sources.map((s) => [s.id, s]));
  assert.deepEqual([by.a.ok, by.b.ok, by.c.ok], [false, true, false]);
  assert.equal(by.a.lastOk, '2026-10-01T00:00:05Z');
  assert.equal(by.c.lastOk, null);
  assert.deepEqual([by.a.runs, by.a.failed, by.c.interrupted], [2, 1, 1]);
  assert.deepEqual([by.a.name, by.a.org, by.a.records, by.a.asOf, by.b.asOf, by.c.asOf], ['가', '갑', 5, '2026-01-01', '2025-09-22', null]);
  assert.deepEqual([by.a.query, by.a.provided, by.a.fetched, by.b.provided], ['PARTIAL', 10, 9, null]);
  assert.deepEqual(out.runs, { total: 5, success: 2, failed: 2, interrupted: 1 });
  assert.deepEqual(out.poc, { fetchedAt: '2026-10-21T00:00:00Z', generatedAt: '2026-10-21T09:00:00+09:00', registered: 3, withData: 2, orgs: 2 }, '헤드라인은 정상 레코드가 있는 곳');
  assert.deepEqual(out.grid, [{ id: 'a|준공 · 지역 전체|서울특별시', name: '준공 · 지역 전체', region: '서울', owner: 'HOME', years: { 2018: 'full', 2019: 'none', 2020: 'nosrc', 2021: 'unpub' } }]);
  assert.deepEqual(out.links, [{ type: 'POLICY_PROGRAM', confirmed: 1, review: 0, released: 1 }, { type: 'PROGRAM_PROJECT', confirmed: 2, review: 1, released: 1 }]);
});

test('scrub: 담당자 이름·입력 사유가 든 칸(actor·reason·basis 등)은 중첩 안에서도 지운다', () => {
  assert.deepEqual(scrub({ id: 1, actor: '이름', items: [{ reason: '사유', basis: '사용자 입력 · 이름', keep: 2, deep: { mapping_basis: 'x', n: 3 } }] }), { id: 1, items: [{ keep: 2, deep: { n: 3 } }] });
});

test('writeManifest: 같은 폴더를 쓰는 다른 도구의 항목은 두고 내 항목만 더한다', () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-'));
  fs.writeFileSync(path.join(d, 'manifest.json'), JSON.stringify({ files: { 'other.json.gz': { rows: 1 } }, note: 'x' }));
  writeManifest(d, { 'sources-list.json.gz': { rows: 76 } });
  const m = JSON.parse(fs.readFileSync(path.join(d, 'manifest.json'), 'utf8'));
  assert.deepEqual(Object.keys(m.files), ['other.json.gz', 'sources-list.json.gz']);
  assert.equal(m.note, 'x');
});

test('data/board/home-sources.json: 실행 합계·원천 수·연결 수가 서로 맞는다', () => {
  assert.equal(hs.runs.total, hs.runs.success + hs.runs.failed + hs.runs.interrupted);
  assert.equal(hs.sources.reduce((n, s) => n + s.runs, 0), hs.runs.total);
  assert.equal(hs.sources.reduce((n, s) => n + s.failed, 0), hs.runs.failed);
  /* 헤드라인 '수집 출처' = 정상 레코드가 있는 등록 출처(PoC current.sources) — 등록 76 중 iH 임대주택만 자료 없음 */
  assert.equal(hs.sources.length, 76);
  assert.equal(hs.poc.registered, 76);
  assert.equal(hs.poc.withData, hs.sources.filter((s) => s.records > 0).length);
  assert.equal(hs.poc.withData, 75);
  assert.deepEqual(hs.sources.filter((s) => !s.ok).map((s) => s.id), ['ih_supply']);   // 2026-10-22 새 덤프(20261021T212310Z): 건축HUB 일반 인허가(building_general_permit)의 마지막 수집 실행이 성공(10-21 판 덤프에서는 실패 — 덤프 뒤 성공)
  /* 이름·기관은 PoC 출처 목록 그대로 — 보이는 글에 HOME 낱말이 없다 */
  assert.ok(hs.sources.every((s) => s.name && s.org && !/HOME/.test(s.name + s.org)));
  assert.equal(hs.poc.orgs, new Set(hs.sources.map((s) => s.org)).size);
  assert.equal(hs.grid.length, 26);
  assert.ok(hs.grid.every((g) => Object.keys(g.years).length === L.GRID_YEARS.length && Object.values(g.years).every((v) => ['full', 'none', 'nosrc', 'unpub'].includes(v))));
  assert.deepEqual(hs.links.map((l) => [l.type, l.review, l.confirmed, l.released]), [['POLICY_PROGRAM', 10, 33, 2], ['PROGRAM_PROJECT', 159, 285, 8]]);   // 2026-10-22 새 덤프(20261021T212310Z): home_mapping 451 → 452 — 부천역곡 A1 새 확정 +1 · 인천송림4 1 검토 → 확정(검토 160 → 159, 확정 283 → 285) · 2026-10-21 새 덤프: 확정 사업 연결 280 → 283(독산동·연남동·방화차고지 — PoC /mappings CONFIRMED 283 과 같음)
});

test('담당자 이름·입력 사유 글이 요약 파일에 없다', () => {
  assert.doesNotMatch(JSON.stringify(hs), /"(actor|reason|basis|mapping_basis)"|사용자 입력/);
});

test('statusRows: 실패 원천이 맨 위, 그 뒤 HOME 원천만 · 경고 = 조회 범위 일부 · 건수는 PoC 정상 레코드 수', () => {
  const rows = L.statusRows(hs);
  assert.equal(rows.length, hs.sources.length);
  const ih = rows.find((r) => r.id === 'ih_supply');
  assert.deepEqual([ih.ok, ih.lastOk, ih.count], [false, null, 0]);
  assert.match(ih.note, /정상 수집 없음/);
  assert.equal(rows.filter((r) => !r.ok).length, 1);   // 2026-10-22 새 덤프(20261021T212310Z): 건축HUB 일반 인허가(building_general_permit)의 마지막 수집 실행이 성공(10-21 판 덤프에서는 실패 — 덤프 뒤 성공)
  assert.deepEqual(rows.slice(0, 1).map((r) => r.id).sort(), ['ih_supply'], '실패 원천이 맨 위');
  assert.deepEqual(rows.filter((r) => r.warn).map((r) => r.id), hs.sources.filter((s) => s.ok && s.query === 'PARTIAL').map((s) => s.id));
  assert.equal(rows.reduce((n, r) => n + r.count, 0), hs.sources.reduce((n, s) => n + s.records, 0));
  assert.equal(rows.filter((r) => r.asOf).length, 19, '원천 기준일은 원천이 밝힌 19곳');
});

test('kstDate: UTC 는 한국 날짜로, +09:00 은 그대로', () => {
  assert.equal(L.kstDate('2026-10-13T16:00:00Z'), '2026.10.14');
  assert.equal(L.kstDate('2026-10-03T18:38:26+09:00'), '2026.10.03');
  assert.equal(L.kstDate(null), null);
});

test('kstEdition: 덤프 판 이름(UTC)은 한국 날짜로 — 머리 칩이 하루 늦게 읽히지 않는다', () => {
  assert.equal(L.kstEdition('20261019T212247Z'), '2026.10.20');
  assert.equal(L.kstEdition('20261019T120000Z'), '2026.10.19');
  assert.equal(L.kstEdition('bad'), null);
});

test('coverageRows: PoC 자료연도별 확보와 같은 26줄(원천 × 시도) × 9해', () => {
  const rows = L.coverageRows(hs);
  assert.equal(rows.length, 26);
  assert.ok(rows.every((r) => r.cells.length === L.GRID_YEARS.length && r.name.split(' · ').pop().match(/^(서울|경기)$/)));
  assert.equal(rows.flatMap((r) => r.cells).filter((c) => c === 'full').length, 175);
  assert.equal(new Set(rows.map((r) => r.id)).size, 26, '줄 id 는 겹치지 않는다');
});
