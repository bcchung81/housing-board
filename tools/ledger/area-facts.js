'use strict';
/* 사업 원장의 지역 지표(schemas/ledger-<달>/tables/area_facts.json, HOME 지역 지표 18,264행)에서 우리 동네 '동네 여건'이 쓰는 시도 단위 값만 뽑아
   data/board/area-facts.json(작은 요약)을 만든다. 화면(lib/board/area-facts.ts)은 이 파일만 읽는다 — 5.6 MB 원장 표를 서버 번들에 싣지 않는다.
   뽑는 값: 인구·일반가구·주택 재고(housing_units)는 KOSIS 주택·가구 판(area-kosis-housing)의 같은 연도·같은 행정구역 비교 값,
   장래가구 추계(forecast_households, 관측 아님), 미분양 월말 재고(unsold TOTAL·COMPLETED). 시군구는 주택 재고가 일부 시군구에만 있어 뽑지 않는다.
   출력은 결정적이다(정렬, 현재 시각 없음). 실행: node tools/ledger/area-facts.js [--month YYYY-MM] */
const fs = require('node:fs');
const path = require('node:path');
const P = require('./paths');

const OUT = 'data/board/area-facts.json';
const HOUSING = /-area-kosis-housing$/, FORECAST = /-area-kosis-household-forecast$/, UNSOLD = /-unsold$/;

function build(rows, areas) {
  const sido = {};
  const put = (code, key, period, value) => { ((sido[code] ??= {})[key] ??= {})[period] = value; };
  let ref = null;
  for (const r of rows) {
    if (r.area_code.length !== 2 || r.value === null) continue;
    if (HOUSING.test(r.source_ref) && ['population', 'households', 'housing_units'].includes(r.metric)) { put(r.area_code, r.metric, r.period, r.value); ref = r.source_ref; }
    else if (FORECAST.test(r.source_ref) && r.metric === 'forecast_households') put(r.area_code, 'forecast_households', r.period, r.value);
    else if (UNSOLD.test(r.source_ref) && r.metric === 'unsold') put(r.area_code, r.breakdown === 'COMPLETED' ? 'unsold_completed' : 'unsold_total', r.period, r.value);
  }
  const names = Object.fromEntries(areas.filter((a) => a.level === 'SIDO').map((a) => [a.area_code, a.area_name]));
  const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  const out = {};
  for (const code of Object.keys(sido).sort()) out[code] = { name: names[code] ?? code, ...Object.fromEntries(Object.entries(sido[code]).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sorted(v)])) };
  return { schema: 'area-facts/1', source: ref ? ref.replace(/-area-kosis-housing$/, '') : null, sido: out };
}

if (require.main === module) {
  const i = process.argv.indexOf('--month');
  const month = i > 0 ? process.argv[i + 1] : P.latestMonth();
  const dir = path.join(P.ledgerDir(month), 'tables');
  const read = (t) => JSON.parse(fs.readFileSync(path.join(dir, `${t}.json`), 'utf8')).rows;
  const doc = build(read('area_facts'), read('areas'));
  fs.writeFileSync(path.join(P.ROOT, OUT), JSON.stringify(doc) + '\n');
  console.log(`${OUT}: 시도 ${Object.keys(doc.sido).join('·')} (원장 ${month})`);
}

module.exports = { build };
