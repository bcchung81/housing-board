-- 공개 범위(public_scope)에 PRIVATE_RENEWAL(민간 정비, 정책 귀속 검토)·PRIVATE(일반 민간·소규모)를 더한다 — 2026-10-20 사용자 결정 '공공 분류는 안2로'.
-- 수도권 HOME 사업을 시행 값·원천 출처·HOME 프로그램 id 로 나눠(tools/ledger/home-source.js PUBLIC_TIER) 공공 시행·공공 시행 제도·공공택지·공공부지 복합개발은 PUBLIC,
-- 재개발·재건축·소규모 주택정비(정책 귀속 검토)는 PRIVATE_RENEWAL, 일반 주택 건설·지역주택조합(정책 미귀속)은 PRIVATE 로 싣는다. 화면 집계는 PUBLIC 만 센다(tools/ledger/board.js).
-- schemas/ledger/projects.schema.json 의 public_scope enum 과 같은 목록이다(tests/js/supabase-ddl.test.cjs). 앞 마이그레이션(*_ledger_schema.sql)은 고치지 않는다.
-- 이 마이그레이션 없이 적재하면 projects upsert 가 이 CHECK 에 걸린다(적재 전에 적용한다). 적용은 따로 승인받는다(이 파일만 만들었다).
alter table ledger.projects drop constraint projects_public_scope_check;
alter table ledger.projects add constraint projects_public_scope_check
  check (public_scope in ('PUBLIC','PRIVATE_ON_PUBLIC_LAND','UNKNOWN','PRIVATE_RENEWAL','PRIVATE'));
