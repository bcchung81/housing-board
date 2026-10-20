'use strict';
// 이번 판에 없는 통계·공고·지역 정리(supabase/migrations/*_ledger_prune_stale.sql, 2026-10-20 수도권 한정)와 supabase-verify 의 검사 도우미.
// 마이그레이션은 글자로 읽는다(네트워크·DB 없음). 실제 동작은 메인 적용 전에 로컬 PGlite 리허설로 확인했다(보고서).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const V = require('../../tools/ledger/supabase-verify');

const MIG_DIR = path.join(__dirname, '..', '..', 'supabase/migrations');
const find = (name) => fs.readdirSync(MIG_DIR).find((f) => new RegExp(`^\\d{14}_${name}\\.sql$`).test(f));
const read = (f) => fs.readFileSync(path.join(MIG_DIR, f), 'utf8').replace(/--[^\n]*/g, '');
const pruneFile = find('ledger_prune_stale'), refineFile = find('ledger_refine');
const PRUNE = read(pruneFile), REFINE = read(refineFile);
const publishRun = (sql) => sql.match(/create or replace function ledger_admin\.publish_run\(p_run bigint, p_expected jsonb\)[\s\S]+?end \$\$;/i)?.[0];
const squash = (s) => s.replace(/\s+/g, ' ').trim();
/* 새 publish_run 에서 더한 묶음(통계 지우기 ~ areas_kept) */
const block = (fn) => fn.match(/delete from ledger\.stat_facts[\s\S]+?jsonb_build_object\('areas_kept', n\);/)?.[0];

test('파일: 정제 마이그레이션 뒤, 앞 마이그레이션은 그대로(이 파일만 publish_run·orphan_counts 를 다시 만든다)', () => {
  assert.ok(pruneFile && refineFile && pruneFile > refineFile, 'supabase/migrations/<14자리>_ledger_prune_stale.sql 이 *_ledger_refine.sql 뒤에 있다');
  assert.ok(/^20261020\d{6}_/.test(pruneFile));
  assert.doesNotMatch(PRUNE, /\b(alter|create|drop) table\b|create (or replace )?view|create policy|\bgrant\b|\brevoke\b|security\s+definer|\bpublic\s*\.|\btruncate\b/i, '표·뷰·권한은 바꾸지 않는다');
  assert.deepEqual([...PRUNE.matchAll(/create or replace function (ledger_admin\.\w+)/gi)].map((m) => m[1]), ['ledger_admin.publish_run', 'ledger_admin.orphan_counts']);
  assert.match(PRUNE, /notify pgrst, 'reload schema';\s*$/);
});

test('publish_run: 앞 판(*_ledger_refine.sql)과 같고, projects 고아 정리 뒤 · orphans 넣기 앞에 정리 묶음 하나만 더했다', () => {
  const before = publishRun(REFINE), after = publishRun(PRUNE);
  assert.ok(before && after);
  const added = block(after);
  assert.ok(added, '정리 묶음');
  assert.equal(squash(after.replace(added, '')), squash(before), '묶음을 빼면 앞 판과 같다');
  assert.match(after, /jsonb_build_object\('projects_deleted', n\);\s*delete from ledger\.stat_facts/, 'projects 고아 정리 바로 뒤');
  assert.match(after, /jsonb_build_object\('areas_kept', n\);\s*v_counts := v_counts \|\| jsonb_build_object\('orphans', v_orphans\);/, '돌려주는 orphans 에 들어간다');
});

test('정리 묶음: 통계 → 공고(이번 판 연결이 가리키면 남김) → 지역(가리키는 행이 있으면 상위 사슬까지 남김) 순, 모두 이번 실행이 아닌 행만', () => {
  const b = block(publishRun(PRUNE));
  const order = ['delete from ledger.stat_facts', 'delete from ledger.notices', 'with recursive keep(code)', 'delete from ledger.areas'].map((s) => b.indexOf(s));
  assert.ok(order.every((i) => i >= 0) && order.every((i, k) => k === 0 || i > order[k - 1]), `순서 ${order}`);
  assert.match(b, /delete from ledger\.stat_facts f where f\.load_run_id <> p_run;/);
  assert.match(b, /delete from ledger\.notices x\s+where x\.load_run_id <> p_run\s+and not exists \(select 1 from ledger\.notice_links l where l\.notice_system = x\.notice_system and l\.notice_id = x\.notice_id\);/);
  assert.match(b, /delete from ledger\.areas a\s+where a\.load_run_id <> p_run and a\.area_code <> all \(v_keep\);/);
  assert.match(b, /union\s+select a\.parent_code from ledger\.areas a join keep k on a\.area_code = k\.code where a\.parent_code is not null/, '남기는 지역의 상위도 남긴다');
  for (const k of ['stat_facts_deleted', 'notices_deleted', 'notices_kept', 'areas_deleted', 'areas_kept']) assert.match(b, new RegExp(`jsonb_build_object\\('${k}', n\\)`), k);
  for (const d of b.match(/\bdelete from [^;]+;/g)) assert.match(d, /\bwhere\b/, `safeupdate: ${d}`);
  assert.doesNotMatch(b, /ledger\.events|months|retired_run_id/, '닫힌 달 행은 건드리지 않는다');
});

test('지역 남김 조건 = DDL 에서 ledger.areas 를 가리키는 외래 키 전부(새 외래 키가 생기면 여기서 깨진다)', () => {
  const refs = [];
  for (const f of fs.readdirSync(MIG_DIR).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = read(f);
    for (const m of sql.matchAll(/create table ledger\.(\w+)\s*\(([\s\S]+?)\n\);/gi)) {
      for (const line of m[2].split('\n')) {
        const r = line.match(/^\s*(\w+)\s+[\w.\[\]]+.*\breferences ledger\.areas\b/);
        if (r) refs.push(`${m[1]}.${r[1]}`);
      }
    }
    assert.doesNotMatch(sql.replace(/create table ledger\.\w+\s*\([\s\S]+?\n\);/gi, ''), /references ledger\.areas\b/, `${f}: 표 만들기 밖에서 areas 를 가리키는 외래 키`);
  }
  assert.deepEqual(refs.sort(), ['area_facts.area_code', 'areas.parent_code', 'notices.sgg_code', 'project_locations.bjd_code', 'projects.sgg_code', 'stat_facts.sido_code']);
  const keep = block(publishRun(PRUNE)).match(/with recursive keep\(code\) as \(([\s\S]+?)\n  \)/)[1];
  for (const ref of refs) {
    const [t, col] = ref.split('.');
    if (t === 'areas') assert.match(keep, /exists \(select 1 from ledger\.areas c where c\.parent_code = a\.area_code and c\.load_run_id = p_run\)/, '이번 판 하위 지역');
    else assert.match(keep, new RegExp(`exists \\(select 1 from ledger\\.${t} \\w+ where \\w+\\.${col} = a\\.area_code\\)`), ref);
  }
});

test('orphan_counts: 앞 키 넷은 그대로 + 지역·통계·공고 stale(현재 판 아님), 권한은 바꾸지 않는다(create or replace)', () => {
  const fn = PRUNE.match(/create or replace function ledger_admin\.orphan_counts\(\)[\s\S]+?\$\$;/i)?.[0];
  assert.ok(fn);
  const old = REFINE.match(/create function ledger_admin\.orphan_counts\(\)[\s\S]+?\$\$;/i)[0];
  const entries = (s) => s.split('\n').filter((l) => /^\s*'\w+',/.test(l)).map((l) => squash(l).replace(/,$/, '').replace(/\)\)$/, ')'));
  const now = entries(fn);
  assert.equal(entries(old).length, 4);
  for (const e of entries(old)) assert.ok(now.includes(e), `앞 키 그대로: ${e}`);
  assert.equal(now.length, 7);
  for (const [k, t] of [['areas_stale', 'areas'], ['stat_facts_stale', 'stat_facts'], ['notices_stale', 'notices']]) {
    assert.match(fn, new RegExp(`'${k}',\\s+\\(select count\\(\\*\\) from ledger\\.${t}\\s+where load_run_id <> ledger\\.current_run\\(\\)\\)`), k);
  }
  assert.match(fn, /language sql stable set search_path = ''/);
  const keys = [...fn.matchAll(/'(\w+_(?:stale|retired))'/g)].map((m) => m[1]);
  for (const k of V.STALE_KEYS) assert.ok(keys.includes(k), `verify 가 보는 ${k} 를 돌려준다`);
});

test('verify staleProblem: 다섯 stale 이 모두 0 일 때만 통과, 키가 없으면(마이그레이션 전) 실패 문장에 알린다', () => {
  const zero = Object.fromEntries(V.STALE_KEYS.map((k) => [k, 0]));
  assert.equal(V.staleProblem({ ...zero, projects_retired: 3, complexes_retired: 1 }), null);
  assert.match(V.staleProblem({ ...zero, areas_stale: 2 }), /areas_stale 2/);
  const before = V.staleProblem({ projects_stale: 0, complexes_stale: 0, projects_retired: 0, complexes_retired: 0 });
  assert.match(before, /areas_stale 없음\(\*_ledger_prune_stale\.sql 미적용\?\)/);
  assert.match(V.staleProblem(undefined), /projects_stale 없음/);
});

test('verify outsideCapital: 서울 11·인천 28·경기 41 밖(전국 00 포함)을 표마다 센다, 시군구 없는 공고는 세지 않는다', () => {
  const t = {
    areas: [{ area_code: '00' }, { area_code: '11' }, { area_code: '26' }, { area_code: '4111000000' }],
    stat_facts: [{ sido_code: '00' }, { sido_code: '28' }, { sido_code: '48' }],
    projects: [{ sgg_code: '41110' }, { sgg_code: '26110' }],
    notices: [{ sgg_code: null }, { sgg_code: '11110' }, { sgg_code: '30110' }],
    area_facts: [{ area_code: '28' }],
  };
  assert.deepEqual(V.outsideCapital(t), { areas: 2, stat_facts: 2, projects: 1, notices: 1, area_facts: 0 });
  assert.deepEqual(V.outsideCapital({}), { areas: 0, stat_facts: 0, projects: 0, notices: 0, area_facts: 0 });
  assert.deepEqual(Object.keys(V.CAPITAL_COLS).sort(), ['area_facts', 'areas', 'notices', 'projects', 'stat_facts']);
});
