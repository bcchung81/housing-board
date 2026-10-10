'use strict';
/* LH 준공예정 지구·블록의 시군구·법정동 매핑(tools/ledger/map-lh.js)과 그 결과 파일(schemas/ledger-2026-10/mappings/lh-block-sgg.json)을 확인한다. 네트워크는 쓰지 않는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { mapLhBlocks, LEGAL_DONG_FILE, OUT } = require('../../tools/ledger/map-lh.js');
const { parseLegalDong } = require('../../tools/ledger/legal-dong.js');
const { convert, loadInputs } = require('../../tools/ledger/convert.js');
const { validate } = require('../../tools/ledger/validate.js');

const ROOT = path.join(__dirname, '..', '..');
const lh = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/board/lh-completion.json'), 'utf8'));
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'registry/projects.json'), 'utf8'));
const legalDong = parseLegalDong(fs.readFileSync(LEGAL_DONG_FILE), path.basename(LEGAL_DONG_FILE));
const run = () => mapLhBlocks({ blocks: lh.blocks, areaRows: legalDong.rows, registry });
const items = run();
const countBy = (f) => items.reduce((m, i) => { m[f(i)] = (m[f(i)] ?? 0) + 1; return m; }, {});

test('278개 항목, 지구·블록 키 중복 없음', () => {
  assert.equal(items.length, 278);
  assert.equal(new Set(items.map((i) => `${i.district}|${i.block}`)).size, 278);
});

test('method 별 개수', () => {
  assert.deepEqual(countBy((i) => i.method), { NAME: 254, RULE_SEJONG: 7, RULE_MERGED_SIDO: 7, RULE_REORGANIZED_SGG: 10 });
});

test('세종은 36110, 통합 시도는 12xxx', () => {
  for (const i of items.filter((x) => x.method === 'RULE_SEJONG')) assert.equal(i.sgg_code, '36110');
  for (const i of items.filter((x) => x.method === 'RULE_MERGED_SIDO')) assert.match(i.sgg_code, /^12\d{3}$/);
  assert.ok(items.filter((x) => x.location.startsWith('세종')).every((x) => x.method === 'RULE_SEJONG'));
});

test('개편된 인천 구는 동 이름으로 이어진다', () => {
  const code = (loc) => [...new Set(items.filter((i) => i.location.includes(loc)).map((i) => i.sgg_code))];
  assert.deepEqual(code('가정동'), ['28275']);
  assert.deepEqual(code('석남동'), ['28275']);
  assert.deepEqual(code('당하동'), ['28290']);
  assert.deepEqual(code('중산동'), ['28155']);
  assert.equal(items.filter((i) => i.method === 'UNRESOLVED').length, 0);
});

test('계양 5블록은 기존 사업 id 에 붙는다', () => {
  const gy = items.filter((i) => i.district === '인천계양(공공주택)');
  assert.deepEqual(gy.map((i) => [i.block, i.local_project_id]), [['A10', 'PRJ-28245-0006'], ['A2', 'PRJ-28245-0005'], ['A3', 'PRJ-28245-0004'], ['A6', 'PRJ-28245-0001'], ['A9', 'PRJ-28245-0003']]);
  assert.equal(items.filter((i) => i.local_project_id).length, 5);
});

test('모든 sgg_code 는 지역 표 SGG 에 있고 bjd_code 앞 5자리는 sgg_code', () => {
  const sgg = new Set(legalDong.rows.filter((r) => r.level === 'SGG').map((r) => r.area_code));
  const bjd = new Set(legalDong.rows.filter((r) => r.level === 'BJD').map((r) => r.area_code));
  for (const i of items) {
    if (!i.sgg_code) { assert.equal(i.method, 'UNRESOLVED'); assert.equal(i.bjd_code, null); continue; }
    assert.ok(sgg.has(i.sgg_code), i.location);
    if (i.bjd_code) { assert.ok(bjd.has(i.bjd_code)); assert.equal(i.bjd_code.slice(0, 5), i.sgg_code); }
  }
});

test('저장된 매핑 파일은 함수 결과와 같고, 두 번 돌려도 같다', () => {
  assert.deepEqual(run(), items);
  assert.deepEqual(JSON.parse(fs.readFileSync(OUT, 'utf8')), items);
});

test('변환기에 넣으면 검증 오류가 없고 새 후보 사업 수가 맞다', () => {
  const lhSgg = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const base = convert(loadInputs({ legalDong }));
  const t = convert(loadInputs({ lhSgg, legalDong }));
  assert.deepEqual(validate(t), []);
  const found = lhSgg.filter((i) => i.sgg_code).length, attached = lhSgg.filter((i) => i.sgg_code && i.local_project_id).length;
  assert.equal(t.projects.length - base.projects.length, found - attached);
});
