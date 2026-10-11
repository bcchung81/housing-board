-- 공개 범위를 화면 집계만으로 줄인다 — 기획서 Q4 결정(2026-10-11): 원장 행은 비공개, 화면 집계(api.board)만 공개.
-- 설계: docs/product/Supabase-원장-설계.md 1·9절, 부록 C. 앞 두 마이그레이션은 고치지 않고 여기서 회수한다.
-- 바꾸지 않는 것: service_role 권한, ledger_admin(적재 RPC·stage_rows), Storage 버킷, 노출 스키마 설정.

-- ============ 1 api 뷰: board 만 남긴다 ============
revoke select on api.areas, api.agencies, api.sources, api.projects, api.identifiers, api.project_locations,
  api.complexes, api.events, api.units, api.stat_facts, api.policies, api.programs, api.links,
  api.notices, api.notice_links, api.source_freshness from anon, authenticated;

-- ============ 2 ledger 표: api.board 가 security_invoker 로 읽는 두 표(board_snapshots·months)만 남긴다 ============
revoke select on ledger.areas, ledger.agencies, ledger.sources, ledger.projects, ledger.identifiers,
  ledger.project_locations, ledger.complexes, ledger.events, ledger.units, ledger.stat_facts,
  ledger.policies, ledger.programs, ledger.links, ledger.notices, ledger.notice_links,
  ledger.ingest_runs, ledger.ingest_run_sources from anon, authenticated;

-- 정책도 지운다: 나중에 GRANT 를 잘못 다시 줘도 RLS 가 0행으로 막는 이중 잠금
drop policy read_published on ledger.ingest_runs;
drop policy read_all on ledger.sources;
drop policy read_all on ledger.ingest_run_sources;
drop policy read_all on ledger.areas;
drop policy read_all on ledger.agencies;
drop policy read_all on ledger.projects;
drop policy read_all on ledger.identifiers;
drop policy read_all on ledger.project_locations;
drop policy read_all on ledger.complexes;
drop policy read_all on ledger.events;
drop policy read_all on ledger.units;
drop policy read_all on ledger.stat_facts;
drop policy read_all on ledger.policies;
drop policy read_all on ledger.programs;
drop policy read_all on ledger.links;
drop policy read_all on ledger.notices;
drop policy read_all on ledger.notice_links;

-- ============ 3 current_run(): api.board 는 쓰지 않는다 ============
-- 함수의 기본 EXECUTE 는 public 에도 있어(실측 =X/postgres) public 까지 회수한다. service_role(export_table)은 그대로.
revoke execute on function ledger.current_run() from public, anon, authenticated;

notify pgrst, 'reload schema';
