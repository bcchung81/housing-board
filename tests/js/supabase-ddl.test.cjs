'use strict';
// Supabase 원장 마이그레이션(supabase/migrations/*_ledger_schema.sql)을 글자로 읽어 schemas/ledger 와 대조한다(네트워크 없음).
// 스키마와 DDL 이 따로 바뀌는 것을 막는다: 값 목록·패턴·열 이름, 모든 표 RLS, public 미사용, anon·authenticated 쓰기 권한 없음.
// 공개 범위(*_public_scope.sql, 기획서 Q4): 차례로 적용한 뒤 anon·authenticated 가 읽는 것은 api.board 와 그 뷰가 읽는 두 표뿐.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const MIG_DIR = path.join(ROOT, 'supabase/migrations');
const SCHEMA_DIR = path.join(ROOT, 'schemas/ledger');
const migFile = fs.readdirSync(MIG_DIR).find((f) => /^\d{14}_ledger_schema\.sql$/.test(f));
const SQL = fs.readFileSync(path.join(MIG_DIR, migFile), 'utf8');
const CODE = SQL.replace(/--[^\n]*/g, '');   // 주석 제거(주석 안에 '--' 를 담은 문자열 리터럴은 없다)
const scopeFile = fs.readdirSync(MIG_DIR).find((f) => /^\d{14}_public_scope\.sql$/.test(f));
const refineFile = fs.readdirSync(MIG_DIR).find((f) => /^\d{14}_ledger_refine\.sql$/.test(f));
const REFINE = refineFile ? fs.readFileSync(path.join(MIG_DIR, refineFile), 'utf8').replace(/--[^\n]*/g, '') : '';
const NEW_TABLES = ['policy_targets', 'area_facts'];   // *_ledger_refine.sql 이 만든 원장 표(비공개: RLS 정책·api 뷰 없음)
const SCOPE = scopeFile ? fs.readFileSync(path.join(MIG_DIR, scopeFile), 'utf8').replace(/--[^\n]*/g, '') : '';

const common = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'common.schema.json'), 'utf8')).$defs;
const RESEARCH_TABLES = ['source_documents', 'evidence'];   // 연구 파이프라인 출력 표(tools/research/chain) — DB 에 싣지 않는다
const TABLES = fs.readdirSync(SCHEMA_DIR).filter((f) => f !== 'common.schema.json').map((f) => f.replace('.schema.json', '')).filter((t) => !RESEARCH_TABLES.includes(t));
const rowSchema = (t) => JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, `${t}.schema.json`), 'utf8')).$defs.row;

// 스키마에 없고 DB 에만 있는 열: 적재 열, 대리 키, links 의 외래 키용 생성 열
const META = ['load_run_id', 'load_seq'];
const ADDED = { project_locations: ['location_id'], events: ['event_id'], units: ['unit_id'], review_required: ['review_id'],
  links: ['from_policy_id', 'from_program_id', 'to_program_id', 'to_project_id'],
  projects: ['retired_run_id'], complexes: ['retired_run_id'],   // 고아 표시(*_ledger_refine.sql, DB 가 정한다)
  policy_targets: ['target_id'], area_facts: ['fact_id'] };
const OPS_TABLES = ['months', 'ingest_runs', 'ingest_run_sources', 'board_snapshots'];
// 도메인 ↔ common.schema.json $defs
const DOMAIN_DEF = { project_id: 'project_id', sido_code: 'sido', sgg_code: 'sgg', bjd_code: 'bjd', pnu: 'pnu', ym: 'month',
  stage_code: 'stage_code', agency_id: 'agency_id', stat_actor: 'stat_actor', review_status: 'review_status',
  source_ref: 'source_ref', complex_id: 'complex_id', local_id: 'local_id' };

// 문자열 리터럴을 건너뛰며 괄호 깊이 0 의 쉼표로 나눈다
function splitTop(s) {
  const out = []; let depth = 0, inStr = false, cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) { cur += ch; if (ch === "'") { if (s[i + 1] === "'") { cur += s[++i]; } else inStr = false; } continue; }
    if (ch === "'") inStr = true;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
// s[open] = '(' 일 때 짝 괄호 안쪽
function inner(s, open) {
  let depth = 0, inStr = false;
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (inStr) { if (ch === "'") { if (s[i + 1] === "'") i++; else inStr = false; } continue; }
    if (ch === "'") inStr = true;
    else if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return s.slice(open + 1, i);
  }
  throw new Error('괄호 짝 없음');
}
const literals = (list) => [...list.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
// 항목 안의 check (...) 식들
const checks = (item) => [...item.matchAll(/\bcheck\s*\(/gi)].map((m) => inner(item, m.index + m[0].length - 1).trim());

const tables = {};   // name → { columns: {col: {type, checks: [expr]}}, tableChecks: [expr] }
for (const m of [...CODE.matchAll(/create table ledger\.(\w+)\s*\(/gi), ...REFINE.matchAll(/create table ledger\.(\w+)\s*\(/gi)]) {
  const src = m.input;
  const t = { columns: {}, tableChecks: [] };
  for (const item of splitTop(inner(src, m.index + m[0].length - 1))) {
    if (/^(primary key|unique|check|foreign key|constraint)\b/i.test(item)) { if (/^check\b/i.test(item)) t.tableChecks.push(...checks(item)); continue; }
    const [, col, type] = item.match(/^(\w+)\s+([\w.\[\]]+)/);
    t.columns[col] = { type, checks: checks(item) };
  }
  tables[m[1]] = t;
}
/* 뒤 마이그레이션을 차례로 적용한다 — 값 목록을 넓히거나 열을 더할 때 앞 마이그레이션은 고치지 않는다.
   열 CHECK 바꾸기(alter table ledger.<표> drop/add constraint <표>_<열>_check), 열 더하기(add column <열> <형> [check (…)]),
   열이 아닌 이름의 제약(<표>_<이름>_check)은 표 제약으로 더한다. 이름을 모르는 표 제약 지우기(do 블록 execute format)는 여기서 읽지 않는다 */
const altered = [];
for (const f of fs.readdirSync(MIG_DIR).filter((x) => /^\d{14}_\w+\.sql$/.test(x) && x > migFile).sort()) {
  const sql = fs.readFileSync(path.join(MIG_DIR, f), 'utf8').replace(/--[^\n]*/g, '');
  for (const m of sql.matchAll(/alter table ledger\.(\w+)\s+(?:(drop|add) constraint (\w+)|add column (\w+)\s+([\w.]+))/gi)) {
    const [, t, op, name, newCol, type] = m;
    if (newCol) {
      if (!tables[t] || tables[t].columns[newCol]) throw new Error(`${f}: ${t}.${newCol} 를 더할 수 없다`);
      const rest = sql.slice(m.index + m[0].length, sql.indexOf(';', m.index));
      tables[t].columns[newCol] = { type, checks: checks(rest) };
      altered.push(`${f}:add column:${t}.${newCol}`);
      continue;
    }
    if (!name.endsWith('_check')) throw new Error(`${f}: CHECK 가 아닌 제약 ${name}`);
    const col = tables[t]?.columns[name.replace(`${t}_`, '').replace(/_check$/, '')];
    if (col) { if (op === 'drop') col.checks = []; else col.checks.push(checks(sql.slice(m.index))[0]); }
    else if (op === 'add') tables[t].tableChecks.push(checks(sql.slice(m.index))[0]);
    else throw new Error(`${f}: 열이 없는 제약 지우기 ${name}`);
    altered.push(`${f}:${op}:${name}`);
  }
}
const domains = {};  // name → check expr
for (const m of CODE.matchAll(/create domain ledger\.(\w+)\s+as\s+\w+\s+check\s*\(/gi)) domains[m[1]] = inner(CODE, m.index + m[0].length - 1).trim();
/* 뒤 마이그레이션의 도메인 값 목록 바꾸기(alter domain ledger.<도메인> add constraint <이름> check (…)) — 앞 규칙은 같은 파일의 do 블록이 이름을 찾아 지운다(*_agency_ih.sql) */
for (const f of fs.readdirSync(MIG_DIR).filter((x) => /^\d{14}_\w+\.sql$/.test(x) && x > migFile).sort()) {
  const sql = fs.readFileSync(path.join(MIG_DIR, f), 'utf8').replace(/--[^\n]*/g, '');
  for (const m of sql.matchAll(/alter domain ledger\.(\w+)\s+add constraint \w+\s+check\s*\(/gi)) { domains[m[1]] = inner(sql, m.index + m[0].length - 1).trim(); altered.push(`${f}:domain:${m[1]}`); }
}

// 스키마 열 → { enum, pattern } (anyOf 의 null 아닌 쪽, $ref 는 common 에서 푼다)
function resolve(p) {
  if (p.$ref) return resolve(common[p.$ref.split('/').pop()]);
  if (p.anyOf) { const alts = p.anyOf.filter((a) => a.type !== 'null'); return alts.length === 1 ? resolve(alts[0]) : { alts: alts.map(resolve) }; }
  return p;
}
const inList = (expr, col) => { const m = expr.match(new RegExp(`^${col}\\s+in\\s*\\(([^)]*)\\)$`, 'i')); return m && literals(m[1]); };
const regexOf = (expr, col) => { const m = expr.match(new RegExp(`^${col}\\s*~\\s*'((?:[^']|'')*)'$`)); return m && m[1].replace(/''/g, "'"); };
const domainOf = (type) => type.startsWith('ledger.') ? type.slice(7) : null;
const sorted = (a) => [...a].sort();

test('원장 16표 + 운영 4표(*_ledger_schema.sql) + 새 원장 2표(*_ledger_refine.sql)가 있다', () => {
  assert.ok(migFile, 'supabase/migrations/<14자리>_ledger_schema.sql');
  assert.ok(refineFile, 'supabase/migrations/<14자리>_ledger_refine.sql');
  assert.deepEqual(sorted(Object.keys(tables)), sorted([...TABLES, ...OPS_TABLES]));
});

test('열: 스키마 열 = DDL 열 − (적재 열·대리 키·생성 열)', () => {
  for (const t of TABLES) {
    const ddl = Object.keys(tables[t].columns);
    const extra = [...META, ...(ADDED[t] ?? [])];
    assert.deepEqual(sorted(ddl.filter((c) => !extra.includes(c))), sorted(Object.keys(rowSchema(t).properties)), t);
    for (const c of extra) assert.ok(ddl.includes(c), `${t}.${c}`);
  }
});

test('값 목록: 스키마 enum 열마다 DDL 에 같은 목록(열 CHECK 또는 도메인), DDL 의 열 목록 CHECK 는 모두 스키마 enum 과 같다', () => {
  let compared = 0;
  for (const t of TABLES) {
    const props = rowSchema(t).properties;
    for (const [col, { type, checks: cs }] of Object.entries(tables[t].columns)) {
      const lists = [...cs, ...tables[t].tableChecks].map((e) => inList(e, col)).filter(Boolean);
      const d = domainOf(type);
      if (d && domains[d]) { const l = inList(domains[d], 'value'); if (l) lists.push(l); }
      const s = props[col] ? resolve(props[col]) : null;
      if (s?.enum) {
        assert.equal(lists.length, 1, `${t}.${col}: 값 목록 CHECK 가 하나여야 한다`);
        assert.deepEqual(sorted(lists[0]), sorted(s.enum), `${t}.${col}`);
        compared++;
      } else assert.equal(lists.length, 0, `${t}.${col}: 스키마에 enum 이 없는데 값 목록 CHECK 가 있다`);
    }
  }
  assert.ok(compared >= 30, `대조한 열 ${compared}`);
});

test('뒤 마이그레이션의 값 목록 넓히기: review_required.review_type 에 DUPLICATE_CANDIDATE(중복 사업 후보) — 지우고 다시 만든다', () => {
  const dup = '20261011200000_review_duplicate_candidate.sql';
  assert.deepEqual(altered.filter((a) => a.startsWith(dup)), [`${dup}:drop:review_required_review_type_check`, `${dup}:add:review_required_review_type_check`]);
  assert.ok(inList(tables.review_required.columns.review_type.checks[0], 'review_type').includes('DUPLICATE_CANDIDATE'));
});

test('공개 범위 민간 정비·일반 민간(*_public_scope_private.sql, 2026-10-20 공공 분류 안2): projects.public_scope CHECK 를 지우고 PRIVATE_RENEWAL·PRIVATE 를 더해 다시 건다', () => {
  const f = fs.readdirSync(MIG_DIR).find((x) => /^\d{14}_public_scope_private\.sql$/.test(x));
  assert.ok(f, 'supabase/migrations/<14자리>_public_scope_private.sql');
  assert.deepEqual(altered.filter((a) => a.startsWith(f)), [`${f}:drop:projects_public_scope_check`, `${f}:add:projects_public_scope_check`]);
  assert.deepEqual(sorted(inList(tables.projects.columns.public_scope.checks[0], 'public_scope')), ['PRIVATE', 'PRIVATE_ON_PUBLIC_LAND', 'PRIVATE_RENEWAL', 'PUBLIC', 'UNKNOWN']);
  assert.doesNotMatch(fs.readFileSync(path.join(MIG_DIR, f), 'utf8').replace(/--[^\n]*/g, ''), /\bgrant\b/i, '권한은 바꾸지 않는다');
});

test('기관 iH(*_agency_ih.sql, 2026-10-20): 도메인 agency_id 의 앞 CHECK 를 이름으로 찾아 지우고 ih 를 더한 목록으로 다시 건다', () => {
  const f = fs.readdirSync(MIG_DIR).find((x) => /^\d{14}_agency_ih\.sql$/.test(x));
  assert.ok(f, 'supabase/migrations/<14자리>_agency_ih.sql');
  assert.deepEqual(altered.filter((a) => a.startsWith(f)), [`${f}:domain:agency_id`]);
  assert.deepEqual(sorted(inList(domains.agency_id, 'value')), ['gh', 'ih', 'lh', 'local', 'mnd', 'sh']);
  const sql = fs.readFileSync(path.join(MIG_DIR, f), 'utf8').replace(/--[^\n]*/g, '');
  assert.match(sql, /contypid = 'ledger\.agency_id'::regtype[\s\S]*execute format\('alter domain ledger\.agency_id drop constraint %I', c\)/);
  assert.doesNotMatch(sql, /\bgrant\b/i, '권한은 바꾸지 않는다');
});

test('단계별 원천(*_stage_sources.sql): id_type·id_issuer·notice_system·date_type 넓히기, identifiers.match_rule 더하기, plan_basis 규칙은 PLANNED 기준, api.identifiers 끝에 match_rule', () => {
  const f = fs.readdirSync(MIG_DIR).find((x) => /^\d{14}_stage_sources\.sql$/.test(x));
  assert.ok(f, 'supabase/migrations/<14자리>_stage_sources.sql');
  const pairs = ['identifiers_id_type_check', 'identifiers_id_issuer_check', 'notices_notice_system_check', 'notice_links_notice_system_check', 'events_date_type_check'].flatMap((n) => [`${f}:drop:${n}`, `${f}:add:${n}`]);
  assert.deepEqual(altered.filter((a) => a.startsWith(f)).sort(), [...pairs, `${f}:add column:identifiers.match_rule`, `${f}:add:events_planned_basis_check`].sort());
  assert.deepEqual(inList(tables.events.columns.date_type.checks[0], 'date_type'), ['PLANNED', 'ACTUAL', 'ESTIMATED']);
  assert.ok(tables.events.tableChecks.includes("(date_type = 'PLANNED') = (plan_basis is not null)"));
  const sql = fs.readFileSync(path.join(MIG_DIR, f), 'utf8').replace(/--[^\n]*/g, '');
  assert.match(sql, /pg_get_constraintdef\(oid\) ilike '%date_type%ACTUAL%plan_basis IS NULL%'[\s\S]*execute format\('alter table ledger\.events drop constraint %I', c\)/, '이름 없는 앞 규칙을 정의로 찾아 지운다');
  assert.match(sql, /create or replace view api\.identifiers with \(security_invoker = true\) as\s+select i\.local_project_id, i\.id_type, i\.id_value, i\.id_issuer, i\.as_of, i\.source_ref, i\.match_status, s\.is_demo, i\.match_rule\b/);
  assert.doesNotMatch(sql, /\bgrant\b/i, '권한은 바꾸지 않는다');
});

test('패턴: 도메인 정규식 = common $defs pattern, 열 정규식 CHECK = 스키마 pattern', () => {
  for (const [d, def] of Object.entries(DOMAIN_DEF)) {
    assert.ok(domains[d], `도메인 ${d}`);
    const c = common[def];
    if (c.enum) assert.deepEqual(sorted(inList(domains[d], 'value')), sorted(c.enum), d);
    else assert.equal(regexOf(domains[d], 'value'), c.pattern, d);
  }
  let compared = 0;
  for (const t of TABLES) for (const [col, { checks: cs }] of Object.entries(tables[t].columns)) {
    const rx = cs.map((e) => regexOf(e, col)).find(Boolean);
    if (!rx) continue;
    const s = resolve(rowSchema(t).properties[col]);
    if (s.alts) {   // sources.collected_at: 일시 또는 날짜 → 한 정규식(날짜 + 선택 시각)
      assert.equal(`${t}.${col}`, 'sources.collected_at');
      for (const sample of ['2026-10-10', '2026-10-10T09:30:00+09:00', '2026-10-10T09:30Z']) assert.match(sample, new RegExp(rx));
      assert.doesNotMatch('2026-10', new RegExp(rx));
      continue;
    }
    assert.equal(rx, s.pattern, `${t}.${col}`);
    compared++;
  }
  assert.ok(compared >= 4, `대조한 열 ${compared}`);
});

test('RLS: 모든 표 enable row level security, review_required 외에는 select 정책', () => {
  const policies = [...CODE.matchAll(/create policy \w+ on ledger\.(\w+)\s+for (\w+) to ([\w, ]+?) using/gi)];
  for (const t of Object.keys(tables).filter((x) => !NEW_TABLES.includes(x))) {   // 새 표는 아래 *_ledger_refine.sql 시험
    assert.match(CODE, new RegExp(`alter table ledger\\.${t}\\s+enable row level security;`), t);
    const mine = policies.filter((p) => p[1] === t);
    if (t === 'review_required') { assert.equal(mine.length, 0, 'review_required 는 공개하지 않는다'); continue; }
    assert.equal(mine.length, 1, `${t}: 정책 하나`);
    assert.equal(mine[0][2].toLowerCase(), 'select', t);
  }
  for (const p of policies) assert.equal(p[3].trim(), 'anon, authenticated');
});

test('public 스키마 객체를 만들거나 쓰지 않는다', () => {
  assert.doesNotMatch(CODE, /\bpublic\s*\./i);
  assert.doesNotMatch(CODE, /\b(security\s+definer)\b/i, '이번 마이그레이션에는 정의자 권한 함수가 없다');
});

test('권한: anon·authenticated 에는 읽기(select·usage·execute)만, review_required 는 주지 않는다', () => {
  const grants = [...CODE.matchAll(/\bgrant\s+([\s\S]+?)\s+on\s+([\s\S]+?)\s+to\s+([\s\S]+?);/gi)];
  assert.ok(grants.length >= 5);
  let publicGrants = 0;
  for (const [, privs, objs, to] of grants) {
    const grantees = to.split(',').map((s) => s.trim().toLowerCase());
    if (!grantees.some((g) => g === 'anon' || g === 'authenticated' || g === 'public')) continue;
    publicGrants++;
    for (const p of privs.split(',').map((s) => s.trim().toLowerCase())) assert.ok(['select', 'usage', 'execute'].includes(p), `${p} on ${objs}`);
    assert.doesNotMatch(objs, /review_required/);
    assert.doesNotMatch(objs, /all tables in schema ledger/i, 'ledger 표는 이름을 들어 준다');
  }
  assert.ok(publicGrants >= 3);
  assert.doesNotMatch(CODE, /alter default privileges/i);
  assert.doesNotMatch(CODE, /grant[^;]*\btruncate\b/i, '누구에게도 TRUNCATE 를 주지 않는다');
});

test('불변: 닫힌 달 트리거(events·board_snapshots·ingest_runs), 달 보호, TRUNCATE 금지(events·board_snapshots·months)', () => {
  for (const t of ['events', 'board_snapshots', 'ingest_runs']) assert.match(CODE, new RegExp(`create trigger guard before insert or update or delete on ledger\\.${t}\\s+for each row execute function ledger\\.guard_closed_month\\('\\w+'\\)`), t);
  assert.match(CODE, /create trigger guard before update or delete on ledger\.months for each row execute function ledger\.guard_months\(\)/);
  for (const t of ['events', 'board_snapshots', 'months']) assert.match(CODE, new RegExp(`create trigger no_truncate before truncate on ledger\\.${t}\\s+for each statement`), t);
});

test('api 뷰: 모두 security_invoker, review_required 는 뷰가 없다', () => {
  const views = [...CODE.matchAll(/create view api\.(\w+) with \(([^)]*)\)/gi)];
  assert.ok(views.length >= 16);
  for (const [, name, opts] of views) assert.match(opts, /security_invoker\s*=\s*true/, name);
  assert.ok(!views.some(([, name]) => name === 'review_required'));
  for (const t of TABLES.filter((t) => t !== 'review_required' && !NEW_TABLES.includes(t))) assert.ok(views.some(([, name]) => name === t), `api.${t}`);
});

const namesIn = (s, schema) => [...s.matchAll(new RegExp(`\\b${schema}\\.(\\w+)`, 'g'))].map((m) => m[1]);

test('공개 범위(기획서 Q4): 차례로 적용하면 anon·authenticated 는 api.board 와 그 뷰가 읽는 두 표만 select 한다', () => {
  assert.ok(scopeFile && scopeFile > migFile, 'supabase/migrations/<14자리>_public_scope.sql 이 표 마이그레이션 뒤에 있다');
  const views = [...CODE.matchAll(/create view api\.(\w+)/gi)].map((m) => m[1]);
  const readable = { api: new Set(), ledger: new Set() };
  for (const [, privs, objs, to] of CODE.matchAll(/\bgrant\s+([\s\S]+?)\s+on\s+([\s\S]+?)\s+to\s+([\s\S]+?);/gi)) {
    if (!/\bselect\b/i.test(privs) || !/\banon\b/i.test(to)) continue;
    if (/all tables in schema api/i.test(objs)) views.forEach((v) => readable.api.add(v));
    namesIn(objs, 'ledger').forEach((t) => readable.ledger.add(t));
  }
  assert.equal(readable.api.size, 17);
  for (const [, privs, objs, from] of SCOPE.matchAll(/\brevoke\s+([\s\S]+?)\s+on\s+([\s\S]+?)\s+from\s+([\s\S]+?);/gi)) {
    if (!/\bselect\b/i.test(privs)) continue;
    assert.deepEqual(from.split(',').map((w) => w.trim().toLowerCase()), ['anon', 'authenticated'], objs);
    namesIn(objs, 'api').forEach((v) => readable.api.delete(v));
    namesIn(objs, 'ledger').forEach((t) => readable.ledger.delete(t));
  }
  assert.deepEqual(sorted(readable.api), ['board']);
  assert.deepEqual(sorted(readable.ledger), ['board_snapshots', 'months']);
  const board = CODE.match(/create view api\.board[\s\S]+?;/i)[0];   // security_invoker 라 남긴 표가 정확히 이 뷰의 입력
  assert.deepEqual(sorted(new Set(namesIn(board, 'ledger'))), ['board_snapshots', 'months']);
  assert.doesNotMatch(board, /current_run/);
});

test('공개 범위: current_run 실행 회수(public 포함), 정책은 months·board_snapshots 만, 회수만 하고 적재 경로는 건드리지 않는다', () => {
  assert.match(SCOPE, /revoke execute on function ledger\.current_run\(\) from public, anon, authenticated;/);
  const created = [...CODE.matchAll(/create policy (\w+) on ledger\.(\w+)/gi)].map((m) => `${m[2]}.${m[1]}`);
  const dropped = [...SCOPE.matchAll(/drop policy (\w+) on ledger\.(\w+);/gi)].map((m) => `${m[2]}.${m[1]}`);
  for (const d of dropped) assert.ok(created.includes(d), d);
  assert.deepEqual(sorted(created.filter((p) => !dropped.includes(p))), ['board_snapshots.read_all', 'months.read_all']);
  assert.doesNotMatch(SCOPE, /\bgrant\b/i, '회수만 한다');
  assert.doesNotMatch(SCOPE, /service_role|ledger_admin|storage\.|db_schemas/i, '적재 경로·노출 설정은 그대로');
});

/* 지도 사업 표시값(*_map_snapshots.sql, 기획서 M7·M8 · Q4 '화면 표시값만 공개'): 표 하나 + 공개 뷰 api.map + 적재 RPC publish_map */
const mapFile = fs.readdirSync(MIG_DIR).find((f) => /^\d{14}_map_snapshots\.sql$/.test(f));
const MAPSQL = mapFile ? fs.readFileSync(path.join(MIG_DIR, mapFile), 'utf8').replace(/--[^\n]*/g, '') : '';

test('지도 표시값: map_snapshots 는 RLS·읽기 정책·닫힌 달 가드·TRUNCATE 금지, 쓰기는 service_role 만, publish_run 은 건드리지 않는다', () => {
  assert.ok(mapFile && mapFile > scopeFile, '공개 범위 마이그레이션 뒤에 있다');
  assert.match(MAPSQL, /create table ledger\.map_snapshots \([\s\S]*primary key \(month, sgg_code\)/);
  assert.match(MAPSQL, /month\s+ledger\.ym not null references ledger\.months/);
  assert.match(MAPSQL, /run_id\s+bigint not null references ledger\.ingest_runs/);
  assert.match(MAPSQL, /alter table ledger\.map_snapshots enable row level security;/);
  assert.match(MAPSQL, /create policy read_all on ledger\.map_snapshots for select to anon, authenticated using \(true\);/);
  assert.match(MAPSQL, /create trigger guard before insert or update or delete on ledger\.map_snapshots for each row execute function ledger\.guard_closed_month\('month'\)/);
  assert.match(MAPSQL, /create trigger no_truncate before truncate on ledger\.map_snapshots for each statement execute function ledger\.no_truncate\(\)/);
  for (const [, privs, objs, to] of MAPSQL.matchAll(/\bgrant\s+([\s\S]+?)\s+on\s+([\s\S]+?)\s+to\s+([\s\S]+?);/gi)) {
    if (/\b(anon|authenticated|public)\b/i.test(to)) assert.equal(privs.trim().toLowerCase(), 'select', `${objs} 는 읽기만`);
    if (/execute/i.test(privs)) assert.equal(to.trim(), 'service_role');
    assert.doesNotMatch(privs, /truncate/i);
  }
  assert.match(MAPSQL, /revoke execute on function ledger_admin\.publish_map\(bigint, jsonb\) from public, anon, authenticated;/);
  assert.doesNotMatch(MAPSQL, /publish_run\s*\(|security\s+definer|\bpublic\s*\./i);
  assert.match(MAPSQL, /status <> 'published'/, '발행된 실행만');
  assert.match(MAPSQL, /status = 'open'/, '열린 달만');
});

test('공개 범위(Q4 넓힘): 차례로 적용하면 anon 이 읽는 것은 api.board·api.map 과 그 뷰가 읽는 세 표뿐', () => {
  const view = MAPSQL.match(/create view api\.map with \(([^)]*)\) as[\s\S]+?;/i);
  assert.ok(view);
  assert.match(view[1], /security_invoker\s*=\s*true/);
  assert.deepEqual(sorted(new Set(namesIn(view[0], 'ledger'))), ['map_snapshots', 'months']);
  const readable = { api: new Set(['board']), ledger: new Set(['board_snapshots', 'months']) };   // 공개 범위 마이그레이션 뒤(앞 시험)
  for (const [, privs, objs, to] of MAPSQL.matchAll(/\bgrant\s+([\s\S]+?)\s+on\s+([\s\S]+?)\s+to\s+([\s\S]+?);/gi)) {
    if (!/\bselect\b/i.test(privs) || !/\banon\b/i.test(to)) continue;
    namesIn(objs, 'api').forEach((v) => readable.api.add(v));
    namesIn(objs, 'ledger').forEach((t) => readable.ledger.add(t));
  }
  assert.deepEqual(sorted(readable.api), ['board', 'map']);
  assert.deepEqual(sorted(readable.ledger), ['board_snapshots', 'map_snapshots', 'months']);
  assert.doesNotMatch(MAPSQL, /all tables in schema/i, '이름을 들어 준다');
});

/* 화면 표시값(*_screen_snapshots.sql, Q4 '화면 표시값만 공개'): 표 하나 + 공개 뷰 api.screens(가장 최근 달만) + 적재 RPC publish_screens */
const screenFile = fs.readdirSync(MIG_DIR).find((f) => /^\d{14}_screen_snapshots\.sql$/.test(f));
const SCRSQL = screenFile ? fs.readFileSync(path.join(MIG_DIR, screenFile), 'utf8').replace(/--[^\n]*/g, '') : '';

test('화면 표시값: screen_snapshots 는 키 넷·객체 내용, RLS·읽기 정책·닫힌 달 가드·TRUNCATE 금지, 쓰기는 service_role 만', () => {
  assert.ok(screenFile && screenFile > mapFile, '지도 표시값 마이그레이션 뒤에 있다');
  assert.match(SCRSQL, /create table ledger\.screen_snapshots \([\s\S]*primary key \(month, key\)/);
  assert.match(SCRSQL, /month\s+ledger\.ym not null references ledger\.months/);
  assert.match(SCRSQL, /key\s+text not null check \(key in \('molit', 'lh', 'sources', 'registry'\)\)/);
  assert.match(SCRSQL, /run_id\s+bigint not null references ledger\.ingest_runs/);
  assert.match(SCRSQL, /payload\s+jsonb not null check \(jsonb_typeof\(payload\) = 'object'\)/);
  assert.match(SCRSQL, /alter table ledger\.screen_snapshots enable row level security;/);
  assert.match(SCRSQL, /create policy read_all on ledger\.screen_snapshots for select to anon, authenticated using \(true\);/);
  assert.match(SCRSQL, /create trigger guard before insert or update or delete on ledger\.screen_snapshots for each row execute function ledger\.guard_closed_month\('month'\)/);
  assert.match(SCRSQL, /create trigger no_truncate before truncate on ledger\.screen_snapshots for each statement execute function ledger\.no_truncate\(\)/);
  for (const [, privs, objs, to] of SCRSQL.matchAll(/\bgrant\s+([\s\S]+?)\s+on\s+([\s\S]+?)\s+to\s+([\s\S]+?);/gi)) {
    if (/\b(anon|authenticated|public)\b/i.test(to)) assert.equal(privs.trim().toLowerCase(), 'select', `${objs} 는 읽기만`);
    if (/execute/i.test(privs)) assert.equal(to.trim(), 'service_role');
    assert.doesNotMatch(privs, /truncate/i);
  }
  assert.match(SCRSQL, /revoke execute on function ledger_admin\.publish_screens\(bigint, jsonb\) from public, anon, authenticated;/);
  assert.match(SCRSQL, /grant execute on function ledger_admin\.publish_screens\(bigint, jsonb\) to service_role;/);
  assert.doesNotMatch(SCRSQL, /publish_run\s*\(|publish_map\s*\(|security\s+definer|\bpublic\s*\./i);
  assert.match(SCRSQL, /pg_advisory_xact_lock\(hashtext\('ledger_admin\.publish_run'\)\)/, 'publish_run 과 같은 잠금');
  assert.match(SCRSQL, /status <> 'published'/, '발행된 실행만');
  assert.match(SCRSQL, /status = 'open'/, '열린 달만');
  assert.match(SCRSQL, /is distinct from array\['lh', 'molit', 'registry', 'sources'\]/, '키는 정확히 넷');
  assert.match(SCRSQL, /delete from ledger\.screen_snapshots where month = v_month;/);
  assert.match(SCRSQL, /notify pgrst, 'reload schema';\s*$/);
});

test('공개 범위(Q4 넓힘): api.screens 는 열 다섯·가장 최근 달만, 차례로 적용하면 anon 이 읽는 것은 api.board·api.map·api.screens 와 그 뷰가 읽는 네 표뿐', () => {
  const view = SCRSQL.match(/create view api\.screens with \(([^)]*)\) as([\s\S]+?);/i);
  assert.ok(view);
  assert.match(view[1], /security_invoker\s*=\s*true/);
  assert.deepEqual(view[2].match(/select\s+([\s\S]+?)\s+from/i)[1].split(',').map((c) => c.trim().split('.').pop()), ['key', 'month', 'reference_date', 'run_id', 'payload']);
  assert.match(view[2], /where s\.month = \(select max\(month\) from ledger\.screen_snapshots\)/);
  assert.deepEqual(sorted(new Set(namesIn(view[0], 'ledger'))), ['months', 'screen_snapshots']);
  assert.match(SCRSQL, /revoke all on api\.screens from public, anon, authenticated, service_role;/);
  const readable = { api: new Set(['board', 'map']), ledger: new Set(['board_snapshots', 'map_snapshots', 'months']) };   // 지도 표시값 마이그레이션 뒤(앞 시험)
  for (const [, privs, objs, to] of SCRSQL.matchAll(/\bgrant\s+([\s\S]+?)\s+on\s+([\s\S]+?)\s+to\s+([\s\S]+?);/gi)) {
    if (!/\bselect\b/i.test(privs) || !/\banon\b/i.test(to)) continue;
    namesIn(objs, 'api').forEach((v) => readable.api.add(v));
    namesIn(objs, 'ledger').forEach((t) => readable.ledger.add(t));
  }
  assert.deepEqual(sorted(readable.api), ['board', 'map', 'screens']);
  assert.deepEqual(sorted(readable.ledger), ['board_snapshots', 'map_snapshots', 'months', 'screen_snapshots']);
  assert.doesNotMatch(SCRSQL, /all tables in schema/i, '이름을 들어 준다');
});

/* 원장 정제(*_ledger_refine.sql, 데이터-정제-계획 D3): publish_run 고아 정리 + 새 표 policy_targets·area_facts(비공개) */
test('정제: 새 표 2개는 RLS 켬·정책 없음·anon·authenticated 권한 없음, 쓰기는 service_role 만, 화면 스냅샷·공개 범위는 그대로', () => {
  assert.ok(refineFile && refineFile > screenFile, '화면 표시값 마이그레이션 뒤에 있다');
  for (const t of NEW_TABLES) {
    assert.match(REFINE, new RegExp(`alter table ledger\\.${t}\\s+enable row level security;`), t);
    assert.match(tables[t].columns.source_ref.type, /^ledger\.source_ref$/, `${t}.source_ref`);
    assert.match(tables[t].columns.review_status.type, /^ledger\.review_status$/, `${t}.review_status`);
    assert.ok(tables[t].columns.load_run_id && tables[t].columns.load_seq, `${t}: 적재 열`);
  }
  assert.doesNotMatch(REFINE, /create policy|create (or replace )?view|security\s+definer|\bpublic\s*\.|all tables in schema|db_schemas|screen_snapshots/i);
  assert.match(REFINE, /revoke all on ledger\.policy_targets, ledger\.area_facts from public, anon, authenticated, service_role;/);
  for (const [, privs, objs, to] of REFINE.matchAll(/\bgrant\s+([\s\S]+?)\s+on\s+([\s\S]+?)\s+to\s+([\s\S]+?);/gi)) {
    assert.equal(to.trim(), 'service_role', `${privs} on ${objs}`);
    assert.doesNotMatch(privs, /truncate/i);
  }
  assert.match(REFINE, /local_policy_id\s+ledger\.local_id not null references ledger\.policies/);
  assert.match(REFINE, /local_program_id\s+ledger\.local_id references ledger\.programs/);
  assert.match(REFINE, /area_code\s+text not null references ledger\.areas/);
  assert.match(REFINE, /revoke execute on function ledger_admin\.orphan_counts\(\) from public, anon, authenticated;/);
  assert.match(REFINE, /grant execute on function ledger_admin\.orphan_counts\(\) to service_role;/);
});

test('정제: publish_run 은 이번 실행에 없는 projects·complexes 를 지우고, 다른 달 events 가 가리키면 retired_run_id 로 표시한다', () => {
  const fn = REFINE.match(/create or replace function ledger_admin\.publish_run\(p_run bigint, p_expected jsonb\)[\s\S]+?end \$\$;/i)?.[0];
  assert.ok(fn, 'publish_run 을 같은 서명으로 다시 만든다');
  assert.match(fn, /v_replace text\[\] := array\['identifiers','project_locations','units','review_required','links','notice_links','policy_targets','area_facts'\]/, '기존 교체 표 + 새 표 2개');
  assert.match(fn, /v_upsert\s+text\[\] := array\['sources','areas','agencies','projects','complexes','policies','programs','notices','stat_facts'\]/, 'upsert 표는 그대로');
  assert.match(fn, /delete from ledger\.events where observed_month = v_month;[\s\S]*update ledger\.complexes c set retired_run_id = p_run/, '그 달 events 를 갈아 넣은 뒤 정리');
  assert.match(fn, /when t in \('projects', 'complexes'\) then ', retired_run_id = null'/, '다시 실리면 표시를 푼다');
  assert.match(fn, /delete from ledger\.complexes c\s+where c\.load_run_id <> p_run\s+and not exists \(select 1 from ledger\.events e where e\.complex_id = c\.complex_id\)/);
  assert.match(fn, /with recursive keep\(id\)[\s\S]+ledger\.events e[\s\S]+ledger\.complexes c[\s\S]+superseded_by/, '남길 사업 = events·남은 단지·대체 사슬');
  assert.match(fn, /update ledger\.projects p set retired_run_id = p_run\s+where p\.load_run_id <> p_run and p\.retired_run_id is null and p\.local_project_id = any \(v_keep\)/);
  assert.match(fn, /delete from ledger\.projects p\s+where p\.load_run_id <> p_run and p\.local_project_id <> all \(v_keep\)/);
  assert.match(fn, /jsonb_build_object\('orphans', v_orphans\)/, '정리 건수를 돌려준다');
  assert.match(fn, /pg_advisory_xact_lock\(hashtext\('ledger_admin\.publish_run'\)\)/);
  assert.match(REFINE, /alter table ledger\.projects add column retired_run_id bigint references ledger\.ingest_runs;/);
  assert.match(REFINE, /alter table ledger\.complexes add column retired_run_id bigint references ledger\.ingest_runs;/);
  assert.match(REFINE, /a\.attname not in \('load_run_id', 'load_seq', 'retired_run_id'\)/, '표시 열은 적재 열처럼 파일에서 받지 않는다');
  const ex = REFINE.match(/create or replace function ledger_admin\.export_table[\s\S]+?end \$\$;/i)?.[0];
  assert.ok(ex);
  for (const c of ['target_id', 'fact_id', 'retired_run_id']) assert.match(ex, new RegExp(`'${c}'`), `export_table 은 ${c} 를 뺀다`);
  for (const t of NEW_TABLES) assert.match(ex, new RegExp(`'${t}'`), `export_table 이 ${t} 를 내보낸다`);
  assert.doesNotMatch(REFINE, /alter table ledger\.links/, 'links 는 바꾸지 않는다(이미 판마다 교체, 덤프 판은 source_ref)');
});

test('정제: notices·notice_links.notice_system 에 GH, identifiers.id_type 에 HOME 을 더한다(앞 마이그레이션은 그대로) — 표 계약 enum 과 같다', () => {
  for (const [file, col, t, want] of [['notices', 'notice_system', 'notices', 'GH'], ['notice_links', 'notice_system', 'notice_links', 'GH'], ['identifiers', 'id_type', 'identifiers', 'HOME']]) {
    const m = REFINE.match(new RegExp(`alter table ledger\\.${t} drop constraint ${t}_${col}_check;\\s*alter table ledger\\.${t} add constraint ${t}_${col}_check\\s*check \\(${col} in \\(([^)]*)\\)\\);`));
    assert.ok(m, `${t}.${col} CHECK 다시 만들기`);
    const vals = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    assert.ok(vals.includes(want), `${t}.${col} ∋ ${want}`);
    const contract = JSON.parse(fs.readFileSync(path.join(__dirname, '../../schemas/ledger', `${file}.schema.json`), 'utf8'));
    const en = JSON.stringify(contract).match(new RegExp(`"${col}":\\{"enum":\\[([^\\]]*)\\]`))[1].replace(/"/g, '').split(',');
    assert.deepEqual(vals.slice().sort(), en.slice().sort(), `${file}.schema.json enum = 마이그레이션 CHECK`);
  }
});
