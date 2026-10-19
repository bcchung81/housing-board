'use strict';
/* 연구 데이터셋(docs/speech/research/dataset/*.json) 검증: ① 폴더에 있는 표만 schemas/ledger 의 JSON Schema(ajv 2020-12 엄격 모드)
   ② 기본 키 중복 ③ 외래 키 — evidence.doc_id·source_documents.parent_doc_id ∈ source_documents, evidence.policy_id ∈ policies,
   links 끝 ∈ policies·programs(사업은 원장 projects), policy_targets ↔ policies·programs·원장 areas,
   source_ref ∈ 데이터셋 sources ∪ 원장 sources, stage_codes 정렬. 확인 판정인데 doc_id 가 빈 evidence 행 수는 경고로 보인다.
   tools/ledger/validate.js 의 validate() 는 원장 표 전부를 요구해서 그대로 쓰지 않는다.
   쓰는 법: node validate_dataset.cjs <dataset 폴더> <schemas/ledger> <원장 tables 폴더>   (오류가 있으면 종료 코드 1) */
const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require(require.resolve('ajv/dist/2020', { paths: [path.join(__dirname, '..', '..', '..')] }));

const KEYS = { source_documents: ['doc_id'], evidence: ['evidence_id'], sources: ['source_ref'], policies: ['local_policy_id'],
  programs: ['local_program_id'], links: ['link_type', 'from_local_id', 'to_local_id'],
  policy_targets: ['local_policy_id', 'local_program_id', 'stage_code', 'area_codes', 'period_start', 'period_end'] };

function readTable(dir, t) {
  const p = path.join(dir, `${t}.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

function validateDataset(dataDir, schemaDir, ledgerDir) {
  const errors = [];
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  for (const f of fs.readdirSync(schemaDir)) ajv.addSchema(JSON.parse(fs.readFileSync(path.join(schemaDir, f), 'utf8')));
  const tables = {};
  for (const f of fs.readdirSync(dataDir).filter((n) => n.endsWith('.json')).sort()) {
    const t = f.replace(/\.json$/, '');
    const doc = readTable(dataDir, t);
    const check = ajv.getSchema(`${t}.schema.json`);
    if (!check) { errors.push(`${t}: 스키마가 없다`); continue; }
    if (!check(doc)) for (const e of check.errors.slice(0, 10)) errors.push(`${t}${e.instancePath}: ${e.message}`);
    tables[t] = doc.rows ?? [];
  }
  const rows = (t) => tables[t] ?? [];
  const keyset = (t) => {
    const seen = new Set();
    for (const r of rows(t)) {
      const k = KEYS[t].map((c) => JSON.stringify(r[c])).join('|');
      if (seen.has(k)) errors.push(`${t}: 키 중복 ${k}`);
      seen.add(k);
    }
    return seen;
  };
  const ids = (t, c) => new Set(rows(t).map((r) => r[c]));
  for (const t of Object.keys(tables)) if (KEYS[t]) keyset(t);
  const ledger = (t) => { const d = readTable(ledgerDir, t); return d ? d.rows : []; };
  const docs = ids('source_documents', 'doc_id');
  const policies = ids('policies', 'local_policy_id'), programs = ids('programs', 'local_program_id');
  const projects = new Set(ledger('projects').map((r) => r.local_project_id));
  const areas = new Set(ledger('areas').map((r) => r.area_code));
  const sources = new Set([...rows('sources'), ...ledger('sources')].map((r) => r.source_ref));
  const ref = (t, c, set, label) => { for (const r of rows(t)) if (r[c] != null && !set.has(r[c])) errors.push(`${t}.${c}: 없는 ${label} ${r[c]}`); };
  ref('evidence', 'doc_id', docs, '문서');
  ref('evidence', 'policy_id', policies, '정책');
  ref('source_documents', 'parent_doc_id', docs, '문서');
  for (const r of rows('source_documents')) {
    if (r.parent_doc_id === r.doc_id) errors.push(`source_documents: ${r.doc_id} 의 상위 문서가 자기 자신`);
    if (JSON.stringify(r.stage_codes) !== JSON.stringify([...r.stage_codes].sort())) errors.push(`source_documents: ${r.doc_id} stage_codes 정렬 안 됨`);
    const want = r.sha256 ? `DOC-${r.sha256.slice(0, 16)}` : null;
    if (want && r.doc_id !== want) errors.push(`source_documents: ${r.doc_id} 가 sha256 과 맞지 않는다`);
  }
  const canon = new Map();
  for (const r of rows('source_documents')) if (r.canonical_url) {
    if (canon.has(r.canonical_url)) errors.push(`source_documents: canonical_url 중복 ${r.canonical_url}`);
    canon.set(r.canonical_url, r.doc_id);
  }
  for (const t of Object.keys(tables)) ref(t, 'source_ref', sources, 'source_ref');
  const ends = { POLICY_PROGRAM: [policies, programs], PROGRAM_PROJECT: [programs, projects], POLICY_PROJECT: [policies, projects] };
  for (const r of rows('links')) {
    const [from, to] = ends[r.link_type];
    if (!from.has(r.from_local_id) || !to.has(r.to_local_id)) errors.push(`links: ${r.link_type} ${r.from_local_id} → ${r.to_local_id} 의 끝이 없다`);
  }
  for (const r of rows('policy_targets')) {
    if (!policies.has(r.local_policy_id)) errors.push(`policy_targets.local_policy_id: 없는 정책 ${r.local_policy_id}`);
    if (r.local_program_id != null && !programs.has(r.local_program_id)) errors.push(`policy_targets.local_program_id: 없는 프로그램 ${r.local_program_id}`);
    for (const c of r.area_codes) if (areas.size && !areas.has(c)) errors.push(`policy_targets.area_codes: 없는 지역 ${c}`);
    if (r.period_start > r.period_end) errors.push(`policy_targets: 기간 ${r.period_start} > ${r.period_end}`);
  }
  // 확인 판정(근거 문서가 있어야 하는 것)인데 doc_id 가 빈 행 — 오류가 아니라 경고(엔진이 문서를 못 이은 것)
  const CONFIRM_DOC = new Set(['MATCH', 'MISMATCH', 'SOURCED', 'NOT_IN_SOURCE']);
  const warnings = [];
  const nodoc = rows('evidence').filter((r) => CONFIRM_DOC.has(r.verdict) && !r.doc_id).length;
  if (nodoc) warnings.push(`evidence: 확인 판정(MATCH·MISMATCH·SOURCED·NOT_IN_SOURCE)인데 doc_id 가 빈 행 ${nodoc}`);
  return { errors, warnings, nodoc, counts: Object.fromEntries(Object.entries(tables).map(([t, r]) => [t, r.length])) };
}

module.exports = { validateDataset };

if (require.main === module) {
  const [dataDir, schemaDir, ledgerDir] = process.argv.slice(2);
  const { errors, warnings, nodoc, counts } = validateDataset(dataDir, schemaDir, ledgerDir);
  for (const w of warnings) console.log('경고: ' + w);
  if (errors.length) { console.log(`데이터셋 검증 오류 ${errors.length}건`); for (const e of errors.slice(0, 50)) console.log(' - ' + e); process.exit(1); }
  console.log('데이터셋 검증 통과: ' + Object.entries(counts).map(([t, n]) => `${t} ${n}`).join(' · ') + ` · 확인 판정 문서 없음 ${nodoc}`);
}
