-- 시행 기관에 iH(인천도시공사) 추가 — 2026-10-20 사용자 결정. 원장 기관 표(agencies)에 'ih' 행이 생기고, HOME 원천 시행이 인천도시공사이거나
-- iH 프로그램에 이어진 수도권 사업의 agency_id 가 'ih' 가 된다(tools/ledger/home-source.js AGENCY·IH_PROGRAM). 앞 마이그레이션은 고치지 않는다.
-- 이 마이그레이션 없이 적재하면 agencies·projects upsert 가 도메인 검사에 걸린다(적재 전에 적용한다).
-- 적용은 따로 승인받는다(이 파일만 만들었다).

do $$
declare c text;
begin
  select conname into c from pg_constraint where contypid = 'ledger.agency_id'::regtype and contype = 'c';
  if c is not null then execute format('alter domain ledger.agency_id drop constraint %I', c); end if;
end $$;
alter domain ledger.agency_id add constraint agency_id_check check (value in ('lh','local','gh','sh','mnd','ih'));
