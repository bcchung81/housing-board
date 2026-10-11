'use strict';
// Supabase 원장 마이그레이션(supabase/migrations/*_ledger_schema.sql)을 글자로 읽어 schemas/ledger 와 대조한다(네트워크 없음).
// 스키마와 DDL 이 따로 바뀌는 것을 막는다: 값 목록·패턴·열 이름, 모든 표 RLS, public 미사용, anon·authenticated 쓰기 권한 없음.
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

const common = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'common.schema.json'), 'utf8')).$defs;
const TABLES = fs.readdirSync(SCHEMA_DIR).filter((f) => f !== 'common.schema.json').map((f) => f.replace('.schema.json', ''));
const rowSchema = (t) => JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, `${t}.schema.json`), 'utf8')).$defs.row;

// 스키마에 없고 DB 에만 있는 열: 적재 열, 대리 키, links 의 외래 키용 생성 열
const META = ['load_run_id', 'load_seq'];
const ADDED = { project_locations: ['location_id'], events: ['event_id'], units: ['unit_id'], review_required: ['review_id'],
  links: ['from_policy_id', 'from_program_id', 'to_program_id', 'to_project_id'] };
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
for (const m of CODE.matchAll(/create table ledger\.(\w+)\s*\(/gi)) {
  const t = { columns: {}, tableChecks: [] };
  for (const item of splitTop(inner(CODE, m.index + m[0].length - 1))) {
    if (/^(primary key|unique|check|foreign key|constraint)\b/i.test(item)) { if (/^check\b/i.test(item)) t.tableChecks.push(...checks(item)); continue; }
    const [, col, type] = item.match(/^(\w+)\s+([\w.\[\]]+)/);
    t.columns[col] = { type, checks: checks(item) };
  }
  tables[m[1]] = t;
}
const domains = {};  // name → check expr
for (const m of CODE.matchAll(/create domain ledger\.(\w+)\s+as\s+\w+\s+check\s*\(/gi)) domains[m[1]] = inner(CODE, m.index + m[0].length - 1).trim();

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

test('마이그레이션 한 개, 원장 16표 + 운영 4표가 있다', () => {
  assert.ok(migFile, 'supabase/migrations/<14자리>_ledger_schema.sql');
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
  for (const t of Object.keys(tables)) {
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
  for (const t of TABLES.filter((t) => t !== 'review_required')) assert.ok(views.some(([, name]) => name === t), `api.${t}`);
});
