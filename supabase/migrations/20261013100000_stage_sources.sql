-- 단계별 원천(건축물대장·부동산원·K-apt·마이홈 단지·청약홈·HUG·LH 공고 상세)을 원장에 더한다 — tools/ledger/stage-link.js, convert.js --stage.
-- schemas/ledger 의 값 목록과 같다(tests/js/supabase-ddl.test.cjs). 앞 마이그레이션은 고치지 않는다. 적용은 따로 승인받는다(이 파일만 만들었다).
-- ① identifiers: id_type 에 BLDRGST_PK(건축물대장 관리번호)·REB_COMPLEX_ID(부동산원 단지고유번호)·KAPT_CODE(K-apt 단지코드)·MYHOME_HSMP_SN(마이홈 단지 일련번호),
--    id_issuer 에 한국부동산원, 열 match_rule(자동 연결 규칙 이름, 키 그대로면 null)
-- ② notices·notice_links: notice_system 에 APPLYHOME(청약홈 분양정보)·HUG(분양보증 이력)
-- ③ events: date_type 에 ESTIMATED(실제 날짜는 모르나 이 날 이전에 일어났음 — 착공 추정). plan_basis 는 PLANNED 에만 있다
--    (앞의 (date_type = 'ACTUAL') = (plan_basis is null) 를 PLANNED 기준으로 바꾼다)

alter table ledger.identifiers drop constraint identifiers_id_type_check;
alter table ledger.identifiers add constraint identifiers_id_type_check
  check (id_type in ('AREA_BLOCK','BUNDLE_ID','LH_AREA_BLOCK_CODE','HUB_HS_PK','HUB_AP_PK','MANUAL','BLDRGST_PK','REB_COMPLEX_ID','KAPT_CODE','MYHOME_HSMP_SN'));
alter table ledger.identifiers drop constraint identifiers_id_issuer_check;
alter table ledger.identifiers add constraint identifiers_id_issuer_check
  check (id_issuer in ('LH','HOUSING_WAVE','국토교통부','행정안전부','한국부동산원'));
alter table ledger.identifiers add column match_rule text check (match_rule ~ '^[A-Z0-9_]+$');

alter table ledger.notices drop constraint notices_notice_system_check;
alter table ledger.notices add constraint notices_notice_system_check
  check (notice_system in ('MYHOME','LH','APPLYHOME','HUG'));
alter table ledger.notice_links drop constraint notice_links_notice_system_check;
alter table ledger.notice_links add constraint notice_links_notice_system_check
  check (notice_system in ('MYHOME','LH','APPLYHOME','HUG'));

alter table ledger.events drop constraint events_date_type_check;
alter table ledger.events add constraint events_date_type_check
  check (date_type in ('PLANNED','ACTUAL','ESTIMATED'));
-- 이름 없이 만든 표 제약(ledger_schema.sql 의 events 표 check)을 정의로 찾아 지운다
do $$
declare c text;
begin
  select conname into strict c from pg_constraint
   where conrelid = 'ledger.events'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%date_type%ACTUAL%plan_basis IS NULL%';
  execute format('alter table ledger.events drop constraint %I', c);
end $$;
alter table ledger.events add constraint events_planned_basis_check
  check ((date_type = 'PLANNED') = (plan_basis is not null));

-- api.identifiers 는 열을 나열하므로 match_rule 을 끝에 더한다(공개 범위 회수는 그대로 — 뷰를 바꿔도 권한은 남는다)
create or replace view api.identifiers with (security_invoker = true) as
  select i.local_project_id, i.id_type, i.id_value, i.id_issuer, i.as_of, i.source_ref, i.match_status, s.is_demo, i.match_rule
  from ledger.identifiers i join ledger.sources s using (source_ref);

notify pgrst, 'reload schema';
