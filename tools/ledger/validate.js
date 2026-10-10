'use strict';
/* 사업 원장 표 검증: ① 표마다 JSON Schema(schemas/ledger, ajv 2020-12 엄격 모드) ② 기본 키 중복 ③ 표 사이 참조(외래 키)와 코드 사슬.
   오류 문장 배열을 돌려준다(비면 통과). */
const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020');

const DIR = path.join(__dirname, '..', '..', 'schemas', 'ledger');
const METRIC_STAGE = { permit: '03', start: '04', sale: '05', complete: '06' };

let ajv = null;
function schemas() {
  if (ajv) return ajv;
  ajv = new Ajv2020({ allErrors: true, strict: true });
  for (const f of fs.readdirSync(DIR)) ajv.addSchema(JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
  return ajv;
}

function validate(tables) {
  const errors = [];
  const v = schemas();
  for (const [table, rows] of Object.entries(tables)) {
    const check = v.getSchema(`${table}.schema.json`);
    if (!check) { errors.push(`${table}: 스키마가 없다`); continue; }
    if (!check({ schema_version: 'ledger/1', table, rows })) for (const e of check.errors.slice(0, 5)) errors.push(`${table}${e.instancePath}: ${e.message}`);
  }

  const keys = (table, cols) => {
    const seen = new Set();
    for (const r of tables[table]) {
      const k = cols.map((c) => r[c]).join('|');
      if (seen.has(k)) errors.push(`${table}: 키 중복 ${k}`);
      seen.add(k);
    }
    return seen;
  };
  const areas = keys('areas', ['area_code']), projects = keys('projects', ['local_project_id']), sources = keys('sources', ['source_ref']);
  const complexes = keys('complexes', ['complex_id']), agencies = keys('agencies', ['agency_id']), notices = keys('notices', ['notice_system', 'notice_id']);
  const policies = keys('policies', ['local_policy_id']), programs = keys('programs', ['local_program_id']);
  keys('identifiers', ['id_type', 'id_value']);   // 같은 원천 레코드가 두 사업에 붙지 않는다
  keys('stat_facts', ['metric', 'sido_code', 'ym', 'actor']);

  const ref = (table, col, set, label = col) => {
    for (const r of tables[table]) if (r[col] != null && !set.has(r[col])) errors.push(`${table}.${label}: 없는 값 ${r[col]}`);
  };
  for (const table of Object.keys(tables)) {
    if (tables[table].length && 'source_ref' in tables[table][0]) ref(table, 'source_ref', sources);
    if (tables[table].length && 'local_project_id' in tables[table][0]) ref(table, 'local_project_id', projects);
    if (tables[table].length && 'complex_id' in tables[table][0] && table !== 'complexes') ref(table, 'complex_id', complexes);
  }
  ref('areas', 'parent_code', areas);
  ref('projects', 'sgg_code', areas);
  ref('projects', 'agency_id', agencies);
  ref('projects', 'superseded_by', projects);
  ref('project_locations', 'bjd_code', areas);
  ref('notices', 'sgg_code', areas);
  ref('stat_facts', 'sido_code', areas);
  for (const r of tables.project_locations) if (r.pnu && !r.pnu.startsWith(r.bjd_code)) errors.push(`project_locations: 필지 ${r.pnu} 가 법정동 ${r.bjd_code} 밖`);
  for (const r of tables.stat_facts) if (METRIC_STAGE[r.metric] !== r.stage_code) errors.push(`stat_facts: ${r.metric} 의 단계는 ${METRIC_STAGE[r.metric]}`);
  for (const r of tables.notice_links) if (!notices.has(`${r.notice_system}|${r.notice_id}`)) errors.push(`notice_links: 없는 공고 ${r.notice_system} ${r.notice_id}`);
  const ends = { POLICY_PROGRAM: [policies, programs], PROGRAM_PROJECT: [programs, projects], POLICY_PROJECT: [policies, projects] };
  for (const r of tables.links) {
    const [from, to] = ends[r.link_type];
    if (!from.has(r.from_local_id) || !to.has(r.to_local_id)) errors.push(`links: ${r.link_type} ${r.from_local_id} → ${r.to_local_id} 의 끝이 없다`);
  }
  return errors;
}

module.exports = { validate };
