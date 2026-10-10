'use strict';
/* 기관이 보낸 CSV 양식(schemas/ledger-2026-10/agency/templates)을 읽어 사업 원장 표에 더할 행으로 바꾼다.
   순수에 가깝다: 폴더를 읽기만 하고 base 표는 고치지 않는다(--out 을 줄 때만 CLI 가 추가 행 JSON 을 쓴다).
   행 단위로 먼저 걸러 거부 사유를 남기고, 통과한 행을 base 표에 합쳐 validate() 를 돌려 errors 로 돌려준다.
   새 사업(local_project_id 빈칸)의 id 는 발급 전 임시 id 다 — convert.js 가 LH 후보 id 를 주는 방식과 같게 다음 번호를 계산만 하고 issued_at 은 null.
   실행: node tools/ledger/import-agency.js --dir <폴더> --agency lh --received 2026-10-10 [--demo] [--out <파일>] */
const fs = require('node:fs');
const path = require('node:path');

const FILES = {
  project: { name: '기관_사업.csv', cols: ['agency_project_key', 'local_project_id', 'project_name', 'sgg_code', 'agency_id', 'stage_code', 'public_scope', 'public_basis'] },
  event: { name: '기관_일정.csv', cols: ['local_project_id', 'agency_project_key', 'event_type', 'plan_basis', 'event_date', 'event_month', 'event_year', 'change_reason', 'change_note'] },
  unit: { name: '기관_계획물량.csv', cols: ['local_project_id', 'agency_project_key', 'housing_type', 'unit_count', 'reference_period', 'unit_scope'] },
  policy: { name: '정책.csv', cols: ['local_policy_id', 'policy_name', 'announcement_date', 'scope_region'] },
  program: { name: '프로그램.csv', cols: ['local_program_id', 'program_name', 'program_definition'] },
  link: { name: '연결.csv', cols: ['link_type', 'from_local_id', 'to_local_id', 'evidence'] },
};
const ENUM = {
  event_type: ['PERMIT', 'CONSTRUCTION_START', 'PROGRESS', 'COMPLETION', 'SUPPLY_NOTICE', 'MOVE_IN'],
  plan_basis: ['BASELINE', 'REVISED'],
  change_reason: ['PERMIT', 'BUSINESS_APPROVAL', 'CONSTRUCTION_START', 'OTHER'],
  unit_scope: ['SUBTYPE', 'TOTAL'],
  stage_code: ['01', '02', '03', '04', '05', '06'],
  public_scope: ['PUBLIC', 'PRIVATE_ON_PUBLIC_LAND', 'UNKNOWN'],
  link_type: ['POLICY_PROGRAM', 'PROGRAM_PROJECT', 'POLICY_PROJECT'],
};
const RE = { sgg: /^\d{5}$/, project_id: /^PRJ-\d{5}-\d{4}$/, local_id: /^[A-Za-z0-9][A-Za-z0-9._-]*$/, date: /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, month: /^\d{4}-(0[1-9]|1[0-2])$/, year: /^\d{4}$/, period: /^\d{4}(-(0[1-9]|1[0-2]))?$/ };
const TABLES = ['sources', 'projects', 'identifiers', 'events', 'units', 'policies', 'programs', 'links'];

/* CSV → 레코드 [{ line, cells }]. BOM 을 떼고, 따옴표 안의 쉼표·줄바꿈·"" 를 처리한다. line 은 레코드가 시작한 줄(머리글 = 1) */
function parseCsv(text) {
  const out = [];
  let cells = [], cell = '', quoted = false, line = 1, start = 1;
  const t = text.replace(/^﻿/, '');
  const end = () => { cells.push(cell); cell = ''; if (cells.some((c) => c.trim() !== '')) out.push({ line: start, cells }); cells = []; start = line; };
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else { if (ch === '\n') line++; cell += ch; }
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { cells.push(cell); cell = ''; }
    else if (ch === '\n') { line++; end(); start = line; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || cells.length) end();
  return out;
}

/* 폴더에서 논리 파일 하나를 찾는다. '[가상]기관_사업.csv' 처럼 앞에 [가상] 이 붙어도 같은 양식이다 */
function readFile(dir, name) {
  const f = fs.readdirSync(dir).find((x) => x.replace(/^\[가상\]/, '') === name);
  return f ? { file: f, records: parseCsv(fs.readFileSync(path.join(dir, f), 'utf8')) } : null;
}

const yyyymm = (d) => d.slice(0, 7);

function importAgency({ dir, agencyId, receivedOn, isDemo = false, base, counters = {} }) {
  const rows = Object.fromEntries(TABLES.map((t) => [t, []]));
  const rejected = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedOn ?? '') || !RE.date.test(receivedOn)) return { rows, rejected, errors: [`receivedOn(YYYY-MM-DD)가 필요하다: ${receivedOn}`] };
  const agency = base.agencies.find((a) => a.agency_id === agencyId);
  if (!agency) return { rows, rejected, errors: [`base 에 없는 기관: ${agencyId}`] };

  const source_ref = `agency-${agencyId}-${receivedOn.replaceAll('-', '')}`;
  const month = yyyymm(receivedOn);
  const reject = (file, line, reason) => rejected.push({ file, line, reason });

  /* 파일마다 머리글을 확인하고 { file, line, row } 로 바꾼다. 머리글이 양식과 다르면 그 파일 전체를 거부한다 */
  const read = (kind) => {
    const f = readFile(dir, FILES[kind].name);
    if (!f) return [];
    const [head, ...body] = f.records;
    if (!head) return [];
    const got = head.cells.map((c) => c.trim());
    if (got.join(',') !== FILES[kind].cols.join(',')) { reject(f.file, 1, `머리글이 양식과 다르다: ${got.join(',')}`); return []; }
    return body.map((r) => {
      const row = Object.fromEntries(FILES[kind].cols.map((c, i) => [c, (r.cells[i] ?? '').trim()]));
      return { file: f.file, line: r.line, row, extra: r.cells.length > got.length };
    }).filter((r) => (r.extra ? (reject(r.file, r.line, '칸이 머리글보다 많다'), false) : true));
  };
  const nul = (v) => (v === '' ? null : v);

  const known = new Set(base.projects.map((p) => p.local_project_id));
  const mapKey = new Map(base.identifiers.filter((i) => i.id_type === 'MANUAL' && i.id_value.startsWith(`${agencyId}:`)).map((i) => [i.id_value.slice(agencyId.length + 1), i.local_project_id]));
  const serial = { ...counters };   // 시군구 → 쓰인 가장 큰 일련번호: 레지스트리 counters(폐기·삭제된 번호 포함)와 base 사업 id(LH 후보 id 포함) 중 큰 쪽
  for (const id of known) { const [, s, n] = id.split('-'); serial[s] = Math.max(serial[s] ?? 0, +n); }
  const areas = new Set(base.areas.map((a) => a.area_code));
  const agencyIds = new Set(base.agencies.map((a) => a.agency_id));
  const resolve = (r) => (r.local_project_id ? (known.has(r.local_project_id) ? r.local_project_id : null) : mapKey.get(r.agency_project_key) ?? null);
  const pick = (r, who) => {   // 사업 지정: id 와 키 중 정확히 하나
    if (!!r.row.local_project_id === !!r.row.agency_project_key) { reject(r.file, r.line, 'local_project_id 와 agency_project_key 중 하나만 채워야 한다'); return null; }
    const id = resolve(r.row);
    if (!id) reject(r.file, r.line, `없는 사업: ${r.row.local_project_id || r.row.agency_project_key}`);
    return id;
  };

  /* 사업 */
  for (const r of read('project')) {
    const x = r.row, why = [];
    if (!x.agency_project_key) why.push('agency_project_key 가 비었다');
    if (!x.project_name && !x.local_project_id) why.push('project_name 이 비었다');
    if (x.local_project_id && !known.has(x.local_project_id)) why.push(`없는 사업: ${x.local_project_id}`);
    if (!x.local_project_id) {
      if (!RE.sgg.test(x.sgg_code) || !areas.has(x.sgg_code)) why.push(`없는 시군구 코드: ${x.sgg_code}`);
      if (!agencyIds.has(x.agency_id)) why.push(`없는 agency_id: ${x.agency_id}`);
      if (!ENUM.stage_code.includes(x.stage_code)) why.push(`허용값 밖 stage_code: ${x.stage_code}`);
      if (!ENUM.public_scope.includes(x.public_scope)) why.push(`허용값 밖 public_scope: ${x.public_scope}`);
    }
    if (x.agency_project_key && mapKey.has(x.agency_project_key) && !x.local_project_id) why.push(`이미 가져온 사업 키: ${x.agency_project_key}`);
    if (why.length) { reject(r.file, r.line, why.join(' / ')); continue; }
    let pid = x.local_project_id;
    if (!pid) {   // 새 사업: 임시 id
      serial[x.sgg_code] = (serial[x.sgg_code] ?? 0) + 1;
      pid = `PRJ-${x.sgg_code}-${String(serial[x.sgg_code]).padStart(4, '0')}`;
      rows.projects.push({ local_project_id: pid, project_name: x.project_name, project_unit: 'PROJECT', sgg_code: x.sgg_code, agency_id: x.agency_id, public_scope: x.public_scope, public_basis: nul(x.public_basis), stage_code: x.stage_code, as_of: receivedOn, issued_at: null, superseded_by: null, source_ref });
      known.add(pid);
    }
    mapKey.set(x.agency_project_key, pid);
    rows.identifiers.push({ local_project_id: pid, id_type: 'MANUAL', id_value: `${agencyId}:${x.agency_project_key}`, id_issuer: 'HOUSING_WAVE', as_of: receivedOn, source_ref, match_status: 'CONFIRMED' });
  }

  /* 일정 */
  for (const r of read('event')) {
    const x = r.row, why = [];
    const pid = pick(r);
    if (!pid) continue;
    if (!ENUM.event_type.includes(x.event_type)) why.push(`허용값 밖 event_type: ${x.event_type}`);
    if (!ENUM.plan_basis.includes(x.plan_basis)) why.push(`허용값 밖 plan_basis: ${x.plan_basis}`);
    const dates = ['event_date', 'event_month', 'event_year'].filter((c) => x[c]);
    if (dates.length !== 1) why.push(dates.length ? `날짜 칸이 둘 이상: ${dates.join('·')}` : '날짜 칸(event_date·event_month·event_year)이 모두 비었다');
    else if (!RE[{ event_date: 'date', event_month: 'month', event_year: 'year' }[dates[0]]].test(x[dates[0]])) why.push(`${dates[0]} 형식이 틀렸다: ${x[dates[0]]}`);
    if (x.change_reason && !ENUM.change_reason.includes(x.change_reason)) why.push(`허용값 밖 change_reason: ${x.change_reason}`);
    if (x.change_reason && x.plan_basis === 'BASELINE') why.push('당초(BASELINE) 일정에는 변경 사유를 쓰지 않는다');
    if (why.length) { reject(r.file, r.line, why.join(' / ')); continue; }
    rows.events.push({ local_project_id: pid, complex_id: null, event_type: x.event_type, date_type: 'PLANNED', plan_basis: x.plan_basis, event_date: nul(x.event_date), event_month: nul(x.event_month), event_year: nul(x.event_year), progress_pct: null, event_detail: null, change_reason: nul(x.change_reason), change_note: nul(x.change_note), observed_month: month, source_ref, review_status: 'CONFIRMED' });
  }

  /* 계획 물량 */
  for (const r of read('unit')) {
    const x = r.row, why = [];
    const pid = pick(r);
    if (!pid) continue;
    if (!/^-?\d+$/.test(x.unit_count)) why.push(`unit_count 가 정수가 아니다: ${x.unit_count}`);
    else if (+x.unit_count < 0) why.push(`unit_count 가 음수다: ${x.unit_count}`);
    if (x.reference_period && !RE.period.test(x.reference_period)) why.push(`reference_period 형식이 틀렸다: ${x.reference_period}`);
    if (!ENUM.unit_scope.includes(x.unit_scope)) why.push(`허용값 밖 unit_scope: ${x.unit_scope}`);
    if (why.length) { reject(r.file, r.line, why.join(' / ')); continue; }
    rows.units.push({ local_project_id: pid, complex_id: null, quantity_type: 'AGENCY_PLAN', housing_type: nul(x.housing_type), unit_count: +x.unit_count, reference_period: nul(x.reference_period), unit_scope: x.unit_scope, source_ref, review_status: 'CONFIRMED' });
  }

  /* 정책·프로그램 */
  const policies = new Set(base.policies.map((p) => p.local_policy_id)), programs = new Set(base.programs.map((p) => p.local_program_id));
  for (const r of read('policy')) {
    const x = r.row, why = [];
    if (!RE.local_id.test(x.local_policy_id)) why.push(`local_policy_id 형식이 틀렸다: ${x.local_policy_id}`);
    else if (policies.has(x.local_policy_id)) why.push(`이미 있는 정책 id: ${x.local_policy_id}`);
    if (!x.policy_name) why.push('policy_name 이 비었다');
    if (x.announcement_date && !RE.date.test(x.announcement_date)) why.push(`announcement_date 형식이 틀렸다: ${x.announcement_date}`);
    if (why.length) { reject(r.file, r.line, why.join(' / ')); continue; }
    policies.add(x.local_policy_id);
    rows.policies.push({ local_policy_id: x.local_policy_id, policy_name: x.policy_name, announcement_date: nul(x.announcement_date), scope_region: nul(x.scope_region), source_ref, review_status: 'CONFIRMED' });
  }
  for (const r of read('program')) {
    const x = r.row, why = [];
    if (!RE.local_id.test(x.local_program_id)) why.push(`local_program_id 형식이 틀렸다: ${x.local_program_id}`);
    else if (programs.has(x.local_program_id)) why.push(`이미 있는 프로그램 id: ${x.local_program_id}`);
    if (!x.program_name) why.push('program_name 이 비었다');
    if (why.length) { reject(r.file, r.line, why.join(' / ')); continue; }
    programs.add(x.local_program_id);
    rows.programs.push({ local_program_id: x.local_program_id, program_name: x.program_name, program_definition: nul(x.program_definition), source_ref, review_status: 'CONFIRMED' });
  }

  /* 연결: 사업 쪽 끝은 사업 id 또는 이 입력의 agency_project_key 로 쓸 수 있다 */
  const ends = { POLICY_PROGRAM: [policies, programs], PROGRAM_PROJECT: [programs, null], POLICY_PROJECT: [policies, null] };
  const endId = (v, set) => (set ? (set.has(v) ? v : null) : known.has(v) ? v : mapKey.get(v) ?? null);
  for (const r of read('link')) {
    const x = r.row, why = [];
    if (!ENUM.link_type.includes(x.link_type)) { reject(r.file, r.line, `허용값 밖 link_type: ${x.link_type}`); continue; }
    const [fromSet, toSet] = ends[x.link_type];
    const from = endId(x.from_local_id, fromSet), to = endId(x.to_local_id, toSet);
    if (!from) why.push(`없는 from_local_id: ${x.from_local_id}`);
    if (!to) why.push(`없는 to_local_id: ${x.to_local_id}`);
    if (why.length) { reject(r.file, r.line, why.join(' / ')); continue; }
    rows.links.push({ link_type: x.link_type, from_local_id: from, to_local_id: to, evidence: nul(x.evidence), review_status: 'CONFIRMED', source_ref });
  }

  /* 통과한 행이 하나라도 있으면 원천 행 하나(입력 한 번 = 원천 하나) */
  const added = Object.values(rows).reduce((n, a) => n + a.length, 0);
  if (added) {
    rows.sources.push({ source_ref, source_owner: 'AGENCY', provider: agency.agency_name, dataset_name: isDemo ? '[가상] 기관 입력(CSV 양식)' : '기관 입력(CSV 양식)', source_url: null, source_record_key: null, data_as_of: receivedOn, collected_at: receivedOn, original_filename: null, notes: `기관 ${agencyId} 가 ${receivedOn} 에 보낸 CSV 양식 입력`, record_count: added, license: null, used_by: [], is_demo: !!isDemo });
  }

  const tables = Object.fromEntries(Object.keys(base).map((t) => [t, [...base[t], ...(rows[t] ?? [])]]));
  const errors = require('./validate').validate(tables);
  return { rows, rejected, errors };
}

module.exports = { importAgency, parseCsv, FILES };

if (require.main === module) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
  const { convert, loadInputs } = require('./convert');
  const dir = arg('--dir'), agencyId = arg('--agency'), receivedOn = arg('--received');
  if (!dir || !agencyId || !receivedOn) { console.error('사용: node tools/ledger/import-agency.js --dir <폴더> --agency lh --received 2026-10-10 [--demo] [--out <파일>]'); process.exit(2); }
  const result = importAgency({ dir, agencyId, receivedOn, isDemo: process.argv.includes('--demo'), base: convert(loadInputs()), counters: JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'registry', 'projects.json'), 'utf8')).counters });
  for (const [t, a] of Object.entries(result.rows)) console.log(`${t.padEnd(12)} +${a.length}`);
  console.log(`거부 ${result.rejected.length}행`);
  for (const r of result.rejected) console.log(`  ${r.file}:${r.line} ${r.reason}`);
  console.log(result.errors.length ? `검증 실패 ${result.errors.length}건\n${result.errors.slice(0, 30).join('\n')}` : '검증 통과');
  if (arg('--out')) fs.writeFileSync(arg('--out'), `${JSON.stringify(result.rows, null, 2)}\n`);
  process.exitCode = result.errors.length || result.rejected.length ? 1 : 0;
}
