'use strict';
// 사업 원장 스키마(schemas/ledger, 문서 docs/product/데이터셋-스키마.md): 지금 가진 자료를 새 표로 옮겨도 검증을 통과하는지, 화면이 쓰는 숫자가 그대로 나오는지 확인한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { convert, loadInputs } = require('../../tools/ledger/convert');
const { validate } = require('../../tools/ledger/validate');

const ROOT = path.join(__dirname, '..', '..');
const DIR = path.join(ROOT, 'schemas/ledger');
const TABLES = ['areas', 'agencies', 'policies', 'programs', 'links', 'projects', 'identifiers', 'project_locations', 'complexes', 'events', 'units', 'notices', 'notice_links', 'stat_facts', 'sources', 'review_required'];
const input = loadInputs();
const tables = convert(input);
const schema = (t) => JSON.parse(fs.readFileSync(path.join(DIR, `${t}.schema.json`), 'utf8'));
const by = (rows, f) => rows.reduce((m, r) => ({ ...m, [f(r)]: (m[f(r)] ?? 0) + 1 }), {});

test('스키마: 표 16개 + 공통 1개, draft 2020-12, $id = 파일 이름, 파일 모양 { schema_version, table, rows }', () => {
  assert.deepEqual(fs.readdirSync(DIR).sort(), [...TABLES, 'common'].map((t) => `${t}.schema.json`).sort());
  for (const t of TABLES) {
    const s = schema(t);
    assert.equal(s.$schema, 'https://json-schema.org/draft/2020-12/schema', t);
    assert.equal(s.$id, `${t}.schema.json`);
    assert.equal(s.title, `ledger/${t}`);
    assert.deepEqual(s.required, ['schema_version', 'table', 'rows']);
    assert.equal(s.$defs.row.additionalProperties, false, `${t}: 정의하지 않은 열을 받지 않는다`);
  }
  assert.deepEqual(Object.keys(tables), TABLES, '변환 결과의 표 = 스키마의 표');
});

test('공통규격 v1.4 의 값을 그대로 쓰고, 넓힌 값만 더한다(이벤트 종류·날짜 구분·검토 상태)', () => {
  const ev = schema('events').$defs.row.properties;
  assert.deepEqual(ev.event_type.enum, ['PERMIT', 'CONSTRUCTION_START', 'PROGRESS', 'COMPLETION', 'SUPPLY_NOTICE', 'MOVE_IN']);
  assert.deepEqual(ev.date_type.enum, ['PLANNED', 'ACTUAL'], 'date_type 은 v1.4 그대로');
  assert.deepEqual(ev.plan_basis.anyOf[0].enum, ['BASELINE', 'REVISED', 'CURRENT'], '당초·변경·현재는 새 열(plan_basis)');
  assert.ok(ev.observed_month, '관측 월(스냅샷)');
  assert.deepEqual(schema('common').$defs.review_status.enum, ['CONFIRMED', 'REVIEW_REQUIRED']);
  for (const t of ['policies', 'programs', 'links', 'projects', 'identifiers', 'events', 'units', 'sources', 'review_required']) assert.match(schema(t).description, /공통규격 v1\.4: /, t);
});

test('지금 가진 자료 전체가 새 표로 옮겨지고 검증(스키마·키 중복·표 사이 참조)을 통과한다', () => {
  assert.deepEqual(validate(tables), []);
});

test('화면이 쓰는 숫자가 그대로 나온다: 사업 77건, 단지 22곳, 통계 칸, 원천 19 + 원장 원천 3', () => {
  assert.deepEqual(tables.projects.map((p) => p.local_project_id), input.registry.projects.map((p) => p.id));
  assert.ok(tables.projects.every((p) => p.issued_at), '레지스트리 사업은 모두 발급된 사업');
  assert.equal(tables.complexes.length, 22);
  assert.ok(tables.complexes.every((c) => c.local_project_id), '번들 단지는 모두 사업에 붙어 있다');
  const last = input.molit.months.at(-1);
  for (const metric of ['permit', 'start', 'sale', 'complete']) {
    const f = tables.stat_facts.find((x) => x.metric === metric && x.sido_code === '00' && x.actor === 'TOTAL' && x.ym === last);
    assert.equal(f.value, input.molit.metrics[metric].series['00'].total.at(-1), metric);
  }
  const cells = Object.values(input.molit.metrics).reduce((n, m) => n + Object.values(m.series).reduce((k, s) => k + input.molit.months.length * (1 + Object.keys(s.actors || {}).length), 0), 0);
  assert.equal(tables.stat_facts.length, cells);
  assert.equal(tables.sources.length, input.catalog.items.length + 3);
});

test('공공 여부 근거가 없는 건축HUB 사업과 시군구를 못 찾은 LH 블록은 검토 목록으로 간다', () => {
  const hub = input.registry.projects.filter((p) => p.refs.every((r) => r.system !== 'bundle'));
  const groups = new Set(input.lh.blocks.map((b) => `${b.district}|${b.block}`));
  assert.deepEqual(by(tables.review_required, (r) => r.review_type), { PUBLIC_SCOPE_UNKNOWN: hub.length, SGG_UNRESOLVED: groups.size });
  assert.ok(tables.projects.filter((p) => p.project_unit === 'PROJECT').every((p) => p.public_scope === 'UNKNOWN'));
});

test('번들 이벤트: 구조물 관측은 옮기지 않고, 입주 시기는 월·날짜 모두 받으며, 공정 기록이 있으면 착공은 실제다', () => {
  const kinds = new Set(input.bundles.flatMap((b) => b.projects.flatMap((p) => (p.events || []).map((e) => e.type))));
  assert.ok(kinds.has('structure_observed'), '원천에는 구조물 관측이 있다');
  const moveIns = input.bundles.flatMap((b) => b.projects.filter((p) => p.moveIn));
  assert.equal(tables.events.filter((e) => e.event_type === 'MOVE_IN').length, moveIns.length);
  assert.ok(tables.events.some((e) => e.event_type === 'MOVE_IN' && e.event_date === '2028-09-30'), '계양 A10 은 날짜(준공예정을 옮긴 값)');
  const a2 = tables.events.filter((e) => e.complex_id === 'incheon-gyeyang/techno-A2');
  assert.equal(a2.find((e) => e.event_type === 'CONSTRUCTION_START').date_type, 'ACTUAL');
  assert.ok(a2.filter((e) => e.event_type === 'PROGRESS').length > 20, '공정율 이력');
  assert.equal(tables.units.find((u) => u.complex_id === 'incheon-gyeyang/techno-A10').quantity_type, 'PUBLIC_PLAN', '준공예정 원천을 가리키는 단지');
  assert.ok(tables.events.every((e) => e.observed_month === '2026-10'), '관측 월 = 찍은 달(2026-10 기준)');
  assert.throws(() => convert({ ...input, observedMonth: undefined }), /observedMonth/);
  assert.ok(tables.sources.every((s) => s.is_demo === false), '지금 원천은 모두 실데이터');
});

test('LH 시군구 매핑이 있으면: 새 블록은 다음 번호의 후보 id(발급 전), 기존 사업과 같은 블록은 그 사업에 붙고, 레지스트리는 바뀌지 않는다', () => {
  const a2 = input.registry.projects.find((p) => p.refs.some((r) => r.system === 'bundle' && r.value === 'techno-A2')).id;
  const before = JSON.stringify(input.registry);
  const t = convert({ ...input, lhSgg: [
    { district: '위례A2-7BL', block: '1', sgg_code: '41131', sgg_name: '경기도 성남시 수정구' },
    { district: '인천계양(공공주택)', block: 'A2', sgg_code: '28245', local_project_id: a2 },
    { district: '청주지북(뉴스테이)', block: 'A4', sgg_code: null },   // 못 찾은 블록은 매핑에 있어도 검토 목록
  ] });
  assert.equal(JSON.stringify(input.registry), before);
  assert.deepEqual(validate(t), []);
  const fresh = t.projects.filter((p) => !p.issued_at);
  assert.deepEqual(fresh.map((p) => [p.local_project_id, p.project_unit, p.agency_id, p.public_scope]), [['PRJ-41131-0001', 'AREA_UNKNOWN', 'lh', 'PUBLIC']]);
  assert.deepEqual(t.units.filter((u) => u.local_project_id === 'PRJ-41131-0001').map((u) => [u.housing_type, u.unit_count]), [['공공분양', 1090], ['행복주택', 219]]);
  assert.deepEqual(t.events.filter((e) => e.local_project_id === a2 && e.source_ref === 'datagokr-15141761').map((e) => [e.event_type, e.date_type, e.plan_basis, e.event_date, e.observed_month]), [['COMPLETION', 'PLANNED', 'CURRENT', '2026-10-31', '2026-10']]);
  assert.equal(t.projects.length, tables.projects.length + 1, '기존 사업에 붙은 블록은 사업을 새로 만들지 않는다');
  assert.equal(t.review_required.filter((r) => r.review_type === 'SGG_UNRESOLVED').length, tables.review_required.filter((r) => r.review_type === 'SGG_UNRESOLVED').length - 2);
});

test('검증기는 잘못을 잡는다: 없는 사업·필지와 법정동 불일치·같은 원천 레코드 중복·실제 날짜에 당초 구분', () => {
  const bad = structuredClone(tables);
  bad.identifiers.push({ ...bad.identifiers[0] });
  bad.identifiers.push({ ...bad.identifiers[1], local_project_id: 'PRJ-99999-0001', id_value: 'x' });
  bad.project_locations.push({ ...bad.project_locations.find((l) => l.pnu), pnu: '1111111111111111111' });
  bad.events.push({ ...bad.events.find((e) => e.date_type === 'ACTUAL'), plan_basis: 'BASELINE' });
  const errors = validate(bad).join('\n');
  assert.match(errors, /identifiers: 키 중복/);
  assert.match(errors, /identifiers\.local_project_id: 없는 값 PRJ-99999-0001/);
  assert.match(errors, /project_locations: 필지 1111111111111111111 가 법정동 \d{10} 밖/);
  assert.match(errors, /events\/rows\/\d+\/plan_basis: must be null/);
});
