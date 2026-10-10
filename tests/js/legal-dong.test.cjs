'use strict';
/* 법정동코드 파서(tools/ledger/legal-dong.js) 시험. 네트워크 없이 받아 둔 원본(schemas/ledger-2026-10/raw/legal-dong)을 읽는다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020');
const { parseLegalDong } = require('../../tools/ledger/legal-dong.js');

const ROOT = path.join(__dirname, '..', '..');
const RAW = path.join(ROOT, 'schemas', 'ledger-2026-10', 'raw', 'legal-dong');
const SCHEMAS = path.join(ROOT, 'schemas', 'ledger');
const FILE = fs.readdirSync(RAW).find((f) => f.endsWith('.csv'));
const { asOf, rows } = parseLegalDong(fs.readFileSync(path.join(RAW, FILE)), FILE);
const byCode = new Map(rows.map((r) => [r.area_code, r]));
const count = (level) => rows.filter((r) => r.level === level).length;

test('판 날짜는 파일 이름에서 읽는다', () => {
  assert.equal(asOf, '2026-09-29');
});

test('존재 행만 있고 단계별 행 수가 맞다', () => {
  assert.equal(rows.length, 20560);
  console.log(`단계별 행 수: SIDO ${count('SIDO')} / SGG ${count('SGG')} / BJD ${count('BJD')}`);
  assert.equal(count('SIDO') + count('SGG') + count('BJD'), rows.length);
  assert.equal(new Set(rows.map((r) => r.area_code)).size, rows.length, 'area_code 중복 없음');
  assert.deepEqual([count('SIDO'), count('SGG'), count('BJD')], [15, 269, 20276]);
});

test('이름과 단계', () => {
  assert.deepEqual(byCode.get('11290'), { area_code: '11290', level: 'SGG', area_name: '서울특별시 성북구', parent_code: '11' });
  assert.equal(byCode.get('41450').area_name, '경기도 하남시');
  assert.equal(byCode.get('28245').area_name, '인천광역시 계양구');
  /* 세종은 시도 행(3600000000)이 파일에 없고 36110 한 줄뿐이라 SGG(부모 36)로 나온다 */
  assert.equal(byCode.get('36'), undefined);
  assert.deepEqual(byCode.get('36110'), { area_code: '36110', level: 'SGG', area_name: '세종특별자치시', parent_code: '36' });
  assert.equal(byCode.get('41130').level, 'SGG');
  assert.deepEqual(byCode.get('41131'), { area_code: '41131', level: 'SGG', area_name: '경기도 성남시 수정구', parent_code: '41' });
  assert.equal(byCode.get('1129010300').level, 'BJD');
  assert.equal(byCode.get('1129010300').parent_code, '11290');
});

test('2026-07 광주·전남 통합 코드(12)가 있다', () => {
  assert.equal(byCode.get('12').area_name, '전남광주통합특별시');
  assert.match(byCode.get('12170').area_name, /^전남광주통합특별시 나주시/);
  assert.match(byCode.get('12330').area_name, /^전남광주통합특별시 광산구/);
});

test('부모 사슬이 끊기지 않는다', () => {
  const orphanBjd = rows.filter((r) => r.level === 'BJD' && byCode.get(r.parent_code)?.level !== 'SGG');
  const orphanSgg = rows.filter((r) => r.level === 'SGG' && byCode.get(r.parent_code)?.level !== 'SIDO');
  console.log(`부모 없는 BJD ${orphanBjd.length}건, 부모 없는 SGG ${orphanSgg.length}건`);
  console.log('예외 SGG', orphanSgg.slice(0, 5).map((r) => `${r.area_code} ${r.area_name}`));
  console.log('예외 BJD', orphanBjd.slice(0, 5).map((r) => `${r.area_code} ${r.area_name}`));
  /* 예외는 세종 36110 하나뿐(시도 행이 파일에 없다) */
  assert.deepEqual(orphanSgg.map((r) => r.area_code), ['36110']);
  assert.equal(orphanBjd.length, 0);
});

test('areas.schema.json 검증을 통과한다', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  for (const f of fs.readdirSync(SCHEMAS).filter((n) => n.endsWith('.schema.json'))) ajv.addSchema(JSON.parse(fs.readFileSync(path.join(SCHEMAS, f), 'utf8')));
  const validate = ajv.getSchema('areas.schema.json');
  const ok = validate({ schema_version: 'ledger/1', table: 'areas', rows: rows.map((r) => ({ ...r, source_ref: 'datagokr-15123287' })) });
  assert.ok(ok, JSON.stringify((validate.errors || []).slice(0, 5)));
});

test('건축HUB 조회 단위(동 3,656 + 리 15,209 = 18,865)와 비교한다(보고용)', () => {
  const bjd = count('BJD');
  const ri = rows.filter((r) => r.level === 'BJD' && !r.area_code.endsWith('00')).length;
  console.log(`BJD ${bjd} (뒤 2자리 00 ${bjd - ri}, 그 밖 ${ri}) vs HUB 18,865 → 차이 ${bjd - 18865}`);
  assert.ok(bjd > 0);
});
