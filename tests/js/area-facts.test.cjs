'use strict';
// lib/board/area-facts.ts · tools/ledger/area-facts.js — 동네 여건. 화면 값 = 원장 area_facts 표의 값(원장 표를 직접 읽어 대조).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const F = require('../../lib/board/area-facts.ts');
const doc = require('../../data/board/area-facts.json');
const { build } = require('../../tools/ledger/area-facts.js');

const ROOT = path.join(__dirname, '..', '..');
const T = path.join(ROOT, 'schemas/ledger-2026-10/tables');
const rows = JSON.parse(fs.readFileSync(path.join(T, 'area_facts.json'), 'utf8')).rows;
const areas = JSON.parse(fs.readFileSync(path.join(T, 'areas.json'), 'utf8')).rows;
const fact = (code, metric, period, breakdown = null, ref = /kosis-housing$/) => rows.find((r) => r.area_code === code && r.metric === metric && r.period === period && r.breakdown === breakdown && ref.test(r.source_ref)).value;

test('data/board/area-facts.json 은 원장 표에서 다시 만든 것과 같다(결정적 출력)', () => {
  assert.deepEqual(build(rows, areas), doc);
});

test('서울·인천·경기만 있다', () => {
  assert.deepEqual(Object.keys(doc.sido), ['11', '28', '41']);
  assert.equal(F.conditions(doc, '26'), null);
  assert.equal(F.stockChart(doc, '26'), null);
});

test('경기 숫자 4 = 원장 값, 숫자마다 기준 시점이 따로다', () => {
  const c = F.conditions(doc, '41');
  assert.deepEqual(c.population, { period: '2025', value: fact('41', 'population', '2025') });
  assert.deepEqual(c.households, { period: '2025', value: fact('41', 'households', '2025') });
  assert.deepEqual(c.housingUnits, { period: '2025', value: fact('41', 'housing_units', '2025') });
  assert.equal(c.housingUnits.value, 5634886);
  assert.equal(c.households.value, 5665748);
  assert.equal(c.population.value, 13967870);
  assert.deepEqual([c.unsold.period, c.unsold.value, c.unsold.completed], ['2026-08', fact('41', 'unsold', '2026-08', 'TOTAL', /unsold$/), fact('41', 'unsold', '2026-08', 'COMPLETED', /unsold$/)]);
  assert.equal(c.unsold.value, 14509);
});

test('재고·가구 선은 같은 해만, 장래가구 추계는 마지막 실측 해에서 이어진다', () => {
  const c = F.stockChart(doc, '41');
  assert.deepEqual(c.years.slice(0, 8), [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);
  assert.equal(c.lastActual, 2025);
  assert.equal(c.years[c.years.length - 1], 2036);
  const i = c.years.indexOf(2025);
  assert.equal(c.forecast[i], c.households[i]);        // 점선이 실측 마지막 점에서 시작
  assert.equal(c.forecast[i + 1], fact('41', 'forecast_households', '2026', null, /household-forecast$/));
  assert.equal(c.stock[i + 1], null);                  // 추계 구간에는 재고 값이 없다
  assert.equal(c.households[i + 1], null);
  assert.equal(c.forecast[0], null);
});

test('latest 는 사전순 마지막 시점, 비어 있으면 null', () => {
  assert.deepEqual(F.latest({ '2024': 1, '2025': 2 }), { period: '2025', value: 2 });
  assert.equal(F.latest(undefined), null);
  assert.equal(F.latest({}), null);
});
