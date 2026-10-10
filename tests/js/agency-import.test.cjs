'use strict';
/* 기관 입력 양식·가져오기 도구(tools/ledger/import-agency.js) 시험 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { importAgency, parseCsv, FILES } = require('../../tools/ledger/import-agency');
const { convert, loadInputs } = require('../../tools/ledger/convert');

const AGENCY = path.join(__dirname, '..', '..', 'schemas', 'ledger-2026-10', 'agency');
const SCHEMA = path.join(__dirname, '..', '..', 'schemas', 'ledger');
const base = convert(loadInputs());
const run = (dir, isDemo = false) => importAgency({ dir, agencyId: 'lh', receivedOn: '2026-10-10', isDemo, base });
const count = (r) => Object.values(r.rows).reduce((n, a) => n + a.length, 0);

test('양식 머리글이 정의와 같고 열이 원장 스키마에 있다', () => {
  const tableOf = { project: 'projects', event: 'events', unit: 'units', policy: 'policies', program: 'programs', link: 'links' };
  for (const [kind, { name, cols }] of Object.entries(FILES)) {
    const text = fs.readFileSync(path.join(AGENCY, 'templates', name), 'utf8');
    assert.ok(text.startsWith('﻿'), `${name} BOM`);
    const lines = text.slice(1).split(/\r?\n/).filter(Boolean);
    assert.equal(lines.length, 1, `${name} 은 머리글 한 줄뿐`);
    assert.deepEqual(lines[0].split(','), cols);
    const props = Object.keys(JSON.parse(fs.readFileSync(path.join(SCHEMA, `${tableOf[kind]}.schema.json`), 'utf8')).$defs.row.properties);
    for (const c of cols) assert.ok(props.includes(c) || c === 'agency_project_key', `${name}: ${c}`);
  }
});

test('빈 양식은 추가 행 0·오류 0', () => {
  const r = run(path.join(AGENCY, 'templates'));
  assert.equal(count(r), 0);
  assert.deepEqual(r.rejected, []);
  assert.deepEqual(r.errors, []);
});

test('가상 예시는 오류 0·거부 0이고 모든 추가 행이 is_demo 원천을 가리킨다', () => {
  const r = run(path.join(AGENCY, 'demo'), true);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.rejected, []);
  assert.equal(r.rows.sources.length, 1);
  assert.equal(r.rows.sources[0].is_demo, true);
  assert.equal(r.rows.sources[0].source_ref, 'agency-lh-20261010');
  for (const [t, rows] of Object.entries(r.rows)) if (t !== 'sources') for (const x of rows) assert.equal(x.source_ref, 'agency-lh-20261010');
  const np = r.rows.projects[0];
  assert.equal(np.issued_at, null);
  assert.ok(!base.projects.some((p) => p.local_project_id === np.local_project_id));
  assert.ok(r.rows.units.every((u) => u.quantity_type === 'AGENCY_PLAN'));
  assert.ok(r.rows.events.some((e) => e.plan_basis === 'REVISED' && e.change_reason === 'PERMIT'));
  const saved = JSON.parse(fs.readFileSync(path.join(AGENCY, 'demo', 'rows.json'), 'utf8'));
  assert.deepEqual(saved, r.rows, 'demo/rows.json 이 현재 결과와 같다');
});

test('잘못된 행은 줄 번호와 사유와 함께 거부된다', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agency-'));
  const put = (kind, lines) => fs.writeFileSync(path.join(dir, FILES[kind].name), `﻿${[FILES[kind].cols.join(','), ...lines].join('\n')}\n`);
  put('event', [
    'PRJ-28245-9999,,PERMIT,BASELINE,2026-01-01,,,,',          // 2: 없는 사업
    'PRJ-28245-0005,,PERMIT,REVISED,2026-01-01,,,LATE,',       // 3: 허용값 밖 change_reason
    'PRJ-28245-0005,,PERMIT,BASELINE,,,,,',                    // 4: 날짜 칸 없음
    'PRJ-28245-0005,,PERMIT,BASELINE,2026-01-01,2026-01,,,',   // 5: 날짜 칸 둘
    'PRJ-28245-0005,,PERMIT,BASELINE,2026-01-01,,,,"쉼표, 따옴표"',   // 6: 통과(따옴표 안 쉼표)
  ]);
  put('unit', ['PRJ-28245-0005,,공공분양,-5,2028,SUBTYPE']);
  const r = run(dir);
  const by = (file, line) => r.rejected.find((x) => x.file === file && x.line === line)?.reason ?? '';
  assert.match(by('기관_일정.csv', 2), /없는 사업/);
  assert.match(by('기관_일정.csv', 3), /change_reason/);
  assert.match(by('기관_일정.csv', 4), /날짜 칸/);
  assert.match(by('기관_일정.csv', 5), /둘 이상/);
  assert.match(by('기관_계획물량.csv', 2), /음수/);
  assert.equal(r.rejected.length, 5);
  assert.equal(r.rows.events.length, 1);
  assert.equal(r.rows.events[0].change_note, '쉼표, 따옴표');
  assert.deepEqual(r.errors, []);
});

test('counters 가 base 최대값보다 크면 그 다음 번호로 임시 id 를 준다', () => {
  const r = importAgency({ dir: path.join(AGENCY, 'demo'), agencyId: 'lh', receivedOn: '2026-10-10', isDemo: true, base, counters: { 28245: 9 } });
  assert.equal(r.rows.projects[0].local_project_id, 'PRJ-28245-0010');
  assert.deepEqual(r.errors, []);
});

test('CSV 읽기: BOM·따옴표 안 쉼표·줄바꿈', () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x,y","l1\nl2"\r\n').map((r) => r.cells), [['a', 'b'], ['x,y', 'l1\nl2']]);
});
