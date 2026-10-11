-- 사업 원장(ledger) 표 만들기 — 설계: docs/product/Supabase-원장-설계.md 부록 A (결정 1~6 모두 추천안).
-- 이번 범위: 스키마 ledger·api, 도메인, 원장 16표 + months·ingest_runs·ingest_run_sources·board_snapshots,
--   닫힌 달 불변·TRUNCATE 금지 트리거, RLS·정책, GRANT/REVOKE, api 읽기 뷰.
-- 나중(적재 단계): ledger_admin 스키마, begin_run·publish_run·export_table, stage_rows, Storage 버킷.
-- 열 정의의 정본은 schemas/ledger/*.schema.json. 값 목록·패턴 대조는 tests/js/supabase-ddl.test.cjs.

-- ============ 1 스키마·도메인 ============
create schema ledger;
create schema api;
revoke all on schema ledger, api from public;
grant usage on schema api, ledger to anon, authenticated, service_role;  -- ledger USAGE 는 security_invoker 뷰용(Data API 에 노출하지 않음)

create domain ledger.project_id    as text check (value ~ '^PRJ-\d{5}-\d{4}$');
create domain ledger.sido_code     as text check (value ~ '^\d{2}$');
create domain ledger.sgg_code      as text check (value ~ '^\d{5}$');
create domain ledger.bjd_code      as text check (value ~ '^\d{10}$');
create domain ledger.pnu           as text check (value ~ '^\d{19}$');
create domain ledger.ym            as text check (value ~ '^\d{4}-(0[1-9]|1[0-2])$');
create domain ledger.stage_code    as text check (value in ('01','02','03','04','05','06'));
create domain ledger.agency_id     as text check (value in ('lh','local','gh','sh','mnd'));
create domain ledger.stat_actor    as text check (value in ('지자체','LH','주택업체','민간'));
create domain ledger.review_status as text check (value in ('CONFIRMED','REVIEW_REQUIRED'));
create domain ledger.source_ref    as text check (value ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$');
create domain ledger.complex_id    as text check (value ~ '^[a-z0-9-]+/.+$');
create domain ledger.local_id      as text check (value ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$');

-- ============ 2 운영 표 ============
create table ledger.months (
  month          ledger.ym primary key,
  status         text not null default 'open' check (status in ('open','closed')),
  reference_date date not null,
  opened_at      timestamptz not null default now(),
  closed_at      timestamptz,
  check ((status = 'closed') = (closed_at is not null))
);
create unique index months_one_open on ledger.months ((true)) where status = 'open';

create table ledger.ingest_runs (
  run_id      bigint generated always as identity primary key,
  month       ledger.ym not null references ledger.months,
  kind        text not null check (kind in ('legal_dong','lh_mapping','hub_snapshot','agency_import','stat','load')),
  status      text not null default 'staged' check (status in ('staged','published','failed','superseded')),
  tool        text not null,
  git_commit  text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  params      jsonb not null default '{}',
  counts      jsonb not null default '{}',
  issues      jsonb not null default '[]',
  files       jsonb not null default '[]',
  error       text
);

-- ============ 3 원장 표 (적재 열 load_run_id·load_seq 는 모든 표 공통, 내보낼 때 뺀다) ============
create table ledger.sources (
  source_ref        ledger.source_ref primary key,
  source_owner      text not null check (source_owner <> ''),
  provider          text not null check (provider <> ''),
  dataset_name      text not null check (dataset_name <> ''),
  source_url        text,
  source_record_key text,
  data_as_of        date,
  collected_at      text check (collected_at ~ '^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$'),
  original_filename text,
  notes             text,
  record_count      integer check (record_count >= 0),
  license           text,
  used_by           text[] not null default '{}',
  is_demo           boolean not null,
  load_run_id       bigint not null references ledger.ingest_runs,
  load_seq          integer not null
);

create table ledger.ingest_run_sources (
  run_id       bigint references ledger.ingest_runs on delete cascade,
  source_ref   ledger.source_ref references ledger.sources deferrable initially deferred,
  data_as_of   date,
  collected_at text,
  record_count integer,
  primary key (run_id, source_ref)
);

create table ledger.areas (
  area_code   text primary key check (area_code ~ '^(\d{2}|\d{5}|\d{10})$'),
  level       text not null check (level in ('NATION','SIDO','SGG','BJD')),
  area_name   text check (area_name <> ''),
  parent_code text references ledger.areas deferrable initially deferred,
  source_ref  ledger.source_ref not null references ledger.sources,
  load_run_id bigint not null references ledger.ingest_runs,
  load_seq    integer not null,
  check (length(area_code) = case level when 'BJD' then 10 when 'SGG' then 5 else 2 end),
  check ((parent_code is null) = (level in ('NATION','SIDO'))),
  check (parent_code is null or area_code like parent_code || '%')
);
create index on ledger.areas (parent_code);

create table ledger.agencies (
  agency_id   ledger.agency_id primary key,
  agency_name text not null check (agency_name <> ''),
  stat_actor  ledger.stat_actor,
  source_ref  ledger.source_ref not null references ledger.sources,
  load_run_id bigint not null references ledger.ingest_runs,
  load_seq    integer not null
);

create table ledger.projects (
  local_project_id ledger.project_id primary key,
  project_name     text check (project_name <> ''),
  project_unit     text not null check (project_unit in ('PROJECT','BLOCK','AREA_UNKNOWN')),
  sgg_code         ledger.sgg_code not null references ledger.areas,
  agency_id        ledger.agency_id references ledger.agencies,
  public_scope     text not null check (public_scope in ('PUBLIC','PRIVATE_ON_PUBLIC_LAND','UNKNOWN')),
  public_basis     text,
  stage_code       ledger.stage_code not null,
  as_of            date not null,
  issued_at        date,                                   -- null = LH 후보(발급 전)
  superseded_by    ledger.project_id references ledger.projects deferrable initially deferred,
  source_ref       ledger.source_ref not null references ledger.sources,
  load_run_id      bigint not null references ledger.ingest_runs,
  load_seq         integer not null,
  check (superseded_by is distinct from local_project_id)
);
create index on ledger.projects (sgg_code);
create index on ledger.projects (left(sgg_code, 2));   -- 시도 16·우리 동네
create index on ledger.projects (stage_code);
create index on ledger.projects (agency_id);

create table ledger.identifiers (
  id_type          text not null check (id_type in ('AREA_BLOCK','BUNDLE_ID','LH_AREA_BLOCK_CODE','HUB_HS_PK','HUB_AP_PK','MANUAL')),
  id_value         text not null check (id_value <> ''),
  local_project_id ledger.project_id not null references ledger.projects,
  id_issuer        text not null check (id_issuer in ('LH','HOUSING_WAVE','국토교통부','행정안전부')),
  as_of            date,
  source_ref       ledger.source_ref not null references ledger.sources,
  match_status     ledger.review_status not null,
  load_run_id      bigint not null references ledger.ingest_runs,
  load_seq         integer not null,
  primary key (id_type, id_value)
);
create index on ledger.identifiers (local_project_id);

create table ledger.project_locations (
  location_id      bigint generated always as identity primary key,
  local_project_id ledger.project_id not null references ledger.projects,
  bjd_code         ledger.bjd_code not null references ledger.areas,
  pnu              ledger.pnu,
  pnu_scope        text check (pnu_scope in ('SITE','REPRESENTATIVE')),
  source_ref       ledger.source_ref not null references ledger.sources,
  load_run_id      bigint not null references ledger.ingest_runs,
  load_seq         integer not null,
  unique nulls not distinct (local_project_id, bjd_code, pnu),
  check (pnu is null or left(pnu, 10) = bjd_code),
  check ((pnu is null) = (pnu_scope is null))             -- 스키마의 if pnu null then pnu_scope null else string
);
create index on ledger.project_locations (bjd_code);
create index on ledger.project_locations (pnu) where pnu is not null;

create table ledger.complexes (
  complex_id       ledger.complex_id primary key,
  local_project_id ledger.project_id references ledger.projects,
  region_slug      text not null check (region_slug ~ '^[a-z0-9-]+$'),
  complex_label    text not null check (complex_label <> ''),
  complex_name     text not null check (complex_name <> ''),
  status           text not null check (status in ('계획','분양중','건설 단계','준공 임박','입주 단계')),
  sponsor_class    text not null check (sponsor_class in ('public','private_on_public_land')),
  housing_kind     text,
  unit_count       integer check (unit_count >= 0),
  move_in_month    ledger.ym,
  progress_pct     numeric check (progress_pct between 0 and 100),
  progress_as_of   date,
  source_ref       ledger.source_ref not null references ledger.sources,
  load_run_id      bigint not null references ledger.ingest_runs,
  load_seq         integer not null
);
create index on ledger.complexes (local_project_id);

create table ledger.events (
  event_id         bigint generated always as identity primary key,
  local_project_id ledger.project_id not null references ledger.projects,
  complex_id       ledger.complex_id references ledger.complexes,
  event_type       text not null check (event_type in ('PERMIT','CONSTRUCTION_START','PROGRESS','COMPLETION','SUPPLY_NOTICE','MOVE_IN')),
  date_type        text not null check (date_type in ('PLANNED','ACTUAL')),
  plan_basis       text check (plan_basis in ('BASELINE','REVISED','CURRENT')),
  event_date       date,
  event_month      ledger.ym,
  event_year       text check (event_year ~ '^\d{4}$'),
  progress_pct     numeric check (progress_pct between 0 and 100),
  event_detail     text,
  change_reason    text check (change_reason in ('PERMIT','BUSINESS_APPROVAL','CONSTRUCTION_START','OTHER')),
  change_note      text,
  observed_month   ledger.ym not null references ledger.months,
  source_ref       ledger.source_ref not null references ledger.sources,
  review_status    ledger.review_status not null,
  load_run_id      bigint not null references ledger.ingest_runs,
  load_seq         integer not null,
  unique (observed_month, load_seq),
  check (num_nonnulls(event_date, event_month, event_year) = 1),
  check ((date_type = 'ACTUAL') = (plan_basis is null))
);
create index on ledger.events (local_project_id, observed_month);
create index on ledger.events (observed_month, event_type, date_type);

create table ledger.units (
  unit_id          bigint generated always as identity primary key,
  local_project_id ledger.project_id not null references ledger.projects,
  complex_id       ledger.complex_id references ledger.complexes,
  quantity_type    text not null check (quantity_type in ('PUBLIC_PLAN','NOTICE','PROJECT_PLAN','PERMIT','AGENCY_PLAN')),
  housing_type     text,
  unit_count       integer not null check (unit_count >= 0),
  reference_period text check (reference_period ~ '^\d{4}(-(0[1-9]|1[0-2]))?$'),
  unit_scope       text not null check (unit_scope in ('SUBTYPE','TOTAL')),
  source_ref       ledger.source_ref not null references ledger.sources,
  review_status    ledger.review_status not null,
  load_run_id      bigint not null references ledger.ingest_runs,
  load_seq         integer not null
);
create index on ledger.units (local_project_id);

create table ledger.stat_facts (
  metric      text not null check (metric in ('permit','start','sale','complete')),
  stage_code  text not null check (stage_code in ('03','04','05','06')),
  sido_code   ledger.sido_code not null references ledger.areas,   -- 00 은 NATION 행
  ym          ledger.ym not null,
  actor       text not null check (actor in ('TOTAL','지자체','LH','주택업체','민간')),
  value       integer check (value >= 0),
  provisional boolean not null,
  source_ref  ledger.source_ref not null references ledger.sources,
  load_run_id bigint not null references ledger.ingest_runs,
  load_seq    integer not null,
  primary key (metric, sido_code, ym, actor),
  check (stage_code = case metric when 'permit' then '03' when 'start' then '04' when 'sale' then '05' else '06' end)
);
create index on ledger.stat_facts (sido_code, ym);

create table ledger.review_required (
  review_id        bigint generated always as identity primary key,
  review_type      text not null check (review_type in ('SGG_UNRESOLVED','PUBLIC_SCOPE_UNKNOWN','DATE_CONFLICT','LINK_CANDIDATE')),
  local_project_id ledger.project_id references ledger.projects,
  source_ref       ledger.source_ref not null references ledger.sources,
  record_key       text not null check (record_key <> ''),
  record_name      text,
  detail           text,
  reason           text not null check (reason <> ''),
  load_run_id      bigint not null references ledger.ingest_runs,
  load_seq         integer not null
);
create index on ledger.review_required (local_project_id);

create table ledger.policies (
  local_policy_id   ledger.local_id primary key,
  policy_name       text not null check (policy_name <> ''),
  announcement_date date,
  scope_region      text,
  source_ref        ledger.source_ref not null references ledger.sources,
  review_status     ledger.review_status not null,
  load_run_id       bigint not null references ledger.ingest_runs,
  load_seq          integer not null
);

create table ledger.programs (
  local_program_id   ledger.local_id primary key,
  program_name       text not null check (program_name <> ''),
  program_definition text,
  source_ref         ledger.source_ref not null references ledger.sources,
  review_status      ledger.review_status not null,
  load_run_id        bigint not null references ledger.ingest_runs,
  load_seq           integer not null
);

create table ledger.links (
  link_type       text not null check (link_type in ('POLICY_PROGRAM','PROGRAM_PROJECT','POLICY_PROJECT')),
  from_local_id   ledger.local_id not null,
  to_local_id     ledger.local_id not null,
  evidence        text,
  review_status   ledger.review_status not null,
  source_ref      ledger.source_ref not null references ledger.sources,
  load_run_id     bigint not null references ledger.ingest_runs,
  load_seq        integer not null,
  -- link_type 별 끝을 생성 열로 갈라 외래 키를 건다(v1.4 열은 그대로)
  from_policy_id  text generated always as (case when link_type <> 'PROGRAM_PROJECT' then from_local_id end) stored references ledger.policies,
  from_program_id text generated always as (case when link_type =  'PROGRAM_PROJECT' then from_local_id end) stored references ledger.programs,
  to_program_id   text generated always as (case when link_type =  'POLICY_PROGRAM'  then to_local_id   end) stored references ledger.programs,
  to_project_id   text generated always as (case when link_type <> 'POLICY_PROGRAM'  then to_local_id   end) stored references ledger.projects,
  primary key (link_type, from_local_id, to_local_id)
);

create table ledger.notices (
  notice_system text not null check (notice_system in ('MYHOME','LH')),
  notice_id     text not null check (notice_id <> ''),
  notice_title  text not null check (notice_title <> ''),
  sgg_code      ledger.sgg_code references ledger.areas,
  pnu           ledger.pnu,
  announced_on  date,
  apply_start   date,
  apply_end     date,
  observed_on   date not null,
  source_ref    ledger.source_ref not null references ledger.sources,
  load_run_id   bigint not null references ledger.ingest_runs,
  load_seq      integer not null,
  primary key (notice_system, notice_id)
);
create index on ledger.notices (sgg_code);

create table ledger.notice_links (
  notice_system    text not null check (notice_system in ('MYHOME','LH')),
  notice_id        text not null,
  local_project_id ledger.project_id not null references ledger.projects,
  evidence         text,
  review_status    ledger.review_status not null,
  source_ref       ledger.source_ref not null references ledger.sources,
  load_run_id      bigint not null references ledger.ingest_runs,
  load_seq         integer not null,
  primary key (notice_system, notice_id, local_project_id),
  foreign key (notice_system, notice_id) references ledger.notices
);

create table ledger.board_snapshots (
  month          ledger.ym primary key references ledger.months,
  run_id         bigint not null references ledger.ingest_runs,
  reference_date date not null,
  board          jsonb not null check (board->>'schema' = 'ledger-board/1' and board->>'observedMonth' = month::text),
  built_at       timestamptz not null default now()
);

-- ============ 4 불변 강제 ============
create function ledger.guard_closed_month() returns trigger
language plpgsql set search_path = '' as $$
declare col text := tg_argv[0];
begin
  if tg_op in ('UPDATE','DELETE') and exists (select 1 from ledger.months m where m.month = to_jsonb(old)->>col and m.status = 'closed') then
    raise exception '닫힌 달 %의 행은 바꿀 수 없다', to_jsonb(old)->>col;
  end if;
  if tg_op in ('INSERT','UPDATE') and exists (select 1 from ledger.months m where m.month = to_jsonb(new)->>col and m.status = 'closed') then
    raise exception '닫힌 달 %에는 넣을 수 없다', to_jsonb(new)->>col;
  end if;
  return coalesce(new, old);
end $$;
create trigger guard before insert or update or delete on ledger.events          for each row execute function ledger.guard_closed_month('observed_month');
create trigger guard before insert or update or delete on ledger.board_snapshots for each row execute function ledger.guard_closed_month('month');
create trigger guard before insert or update or delete on ledger.ingest_runs     for each row execute function ledger.guard_closed_month('month');

create function ledger.guard_months() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception '달은 지우지 않는다'; end if;
  if old.status = 'closed' then raise exception '닫힌 달 %은 바꿀 수 없다', old.month; end if;
  return new;
end $$;
create trigger guard before update or delete on ledger.months for each row execute function ledger.guard_months();

create function ledger.no_truncate() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'TRUNCATE 금지';
end $$;
create trigger no_truncate before truncate on ledger.events          for each statement execute function ledger.no_truncate();
create trigger no_truncate before truncate on ledger.board_snapshots for each statement execute function ledger.no_truncate();
create trigger no_truncate before truncate on ledger.months          for each statement execute function ledger.no_truncate();

-- ============ 5 RLS·권한 ============
-- public 이 아니므로 RLS 자동 켜기(ensure_rls)가 닿지 않는다. 모든 표에서 직접 켠다.
alter table ledger.months             enable row level security;
alter table ledger.ingest_runs        enable row level security;
alter table ledger.sources            enable row level security;
alter table ledger.ingest_run_sources enable row level security;
alter table ledger.areas              enable row level security;
alter table ledger.agencies           enable row level security;
alter table ledger.projects           enable row level security;
alter table ledger.identifiers        enable row level security;
alter table ledger.project_locations  enable row level security;
alter table ledger.complexes          enable row level security;
alter table ledger.events             enable row level security;
alter table ledger.units              enable row level security;
alter table ledger.stat_facts         enable row level security;
alter table ledger.review_required    enable row level security;
alter table ledger.policies           enable row level security;
alter table ledger.programs           enable row level security;
alter table ledger.links              enable row level security;
alter table ledger.notices            enable row level security;
alter table ledger.notice_links       enable row level security;
alter table ledger.board_snapshots    enable row level security;

-- 새 스키마에는 기본 권한(pg_default_acl)이 없지만 명시한다: 소유자 외 아무 권한 없음에서 시작
revoke all on all tables in schema ledger from public, anon, authenticated, service_role;
revoke all on all sequences in schema ledger from public, anon, authenticated, service_role;

-- 읽기: 공개 표 19개(review_required 제외)
grant select on ledger.areas, ledger.agencies, ledger.sources, ledger.projects, ledger.identifiers,
  ledger.project_locations, ledger.complexes, ledger.events, ledger.units, ledger.stat_facts,
  ledger.policies, ledger.programs, ledger.links, ledger.notices, ledger.notice_links,
  ledger.months, ledger.board_snapshots, ledger.ingest_runs, ledger.ingest_run_sources to anon, authenticated;

create policy read_all on ledger.months             for select to anon, authenticated using (true);
create policy read_published on ledger.ingest_runs  for select to anon, authenticated using (status in ('published','superseded'));
create policy read_all on ledger.sources            for select to anon, authenticated using (true);
create policy read_all on ledger.ingest_run_sources for select to anon, authenticated using (true);
create policy read_all on ledger.areas              for select to anon, authenticated using (true);
create policy read_all on ledger.agencies           for select to anon, authenticated using (true);
create policy read_all on ledger.projects           for select to anon, authenticated using (true);
create policy read_all on ledger.identifiers        for select to anon, authenticated using (true);
create policy read_all on ledger.project_locations  for select to anon, authenticated using (true);
create policy read_all on ledger.complexes          for select to anon, authenticated using (true);
create policy read_all on ledger.events             for select to anon, authenticated using (true);
create policy read_all on ledger.units              for select to anon, authenticated using (true);
create policy read_all on ledger.stat_facts         for select to anon, authenticated using (true);
create policy read_all on ledger.policies           for select to anon, authenticated using (true);
create policy read_all on ledger.programs           for select to anon, authenticated using (true);
create policy read_all on ledger.links              for select to anon, authenticated using (true);
create policy read_all on ledger.notices            for select to anon, authenticated using (true);
create policy read_all on ledger.notice_links       for select to anon, authenticated using (true);
create policy read_all on ledger.board_snapshots    for select to anon, authenticated using (true);
-- review_required: anon·authenticated 권한·정책 없음(내부 작업 목록)

-- 쓰기: service_role 만(적재 RPC 가 쓴다). TRUNCATE 는 주지 않는다
grant select, insert, update, delete on all tables in schema ledger to service_role;
grant usage on all sequences in schema ledger to service_role;   -- 대리 키(identity)

-- ============ 6 공개 뷰(api) ============
-- 현재 판 = 가장 최근에 발행된 load 실행. 빈 DB 에서는 null 이라 현재 판 뷰는 0행이다.
create function ledger.current_run() returns bigint
language sql stable set search_path = '' as $$
  select run_id from ledger.ingest_runs where kind = 'load' and status = 'published' order by month desc, run_id desc limit 1
$$;
grant execute on function ledger.current_run() to anon, authenticated, service_role;

-- 열 = 스키마 열 + is_demo(원천에서), load_*·대리 키 제외. 지우지 않는 표(upsert)는 현재 판만, 판마다 바꾸는 표는 전부.
create view api.board with (security_invoker = true) as
  select b.month, b.reference_date, b.board, m.status
  from ledger.board_snapshots b join ledger.months m using (month);

create view api.areas with (security_invoker = true) as
  select a.area_code, a.level, a.area_name, a.parent_code, a.source_ref, s.is_demo
  from ledger.areas a join ledger.sources s using (source_ref)
  where a.load_run_id = (select ledger.current_run());

create view api.agencies with (security_invoker = true) as
  select g.agency_id, g.agency_name, g.stat_actor, g.source_ref, s.is_demo
  from ledger.agencies g join ledger.sources s using (source_ref)
  where g.load_run_id = (select ledger.current_run());

create view api.sources with (security_invoker = true) as
  select s.source_ref, s.source_owner, s.provider, s.dataset_name, s.source_url, s.source_record_key, s.data_as_of,
         s.collected_at, s.original_filename, s.notes, s.record_count, s.license, s.used_by, s.is_demo
  from ledger.sources s
  where s.load_run_id = (select ledger.current_run());

create view api.projects with (security_invoker = true) as
  select p.local_project_id, p.project_name, p.project_unit, p.sgg_code, left(p.sgg_code, 2) as sido_code,
         p.agency_id, p.public_scope, p.public_basis, p.stage_code, p.as_of, p.issued_at,
         p.issued_at is null as is_candidate, p.superseded_by, p.source_ref, s.is_demo
  from ledger.projects p join ledger.sources s using (source_ref)
  where p.load_run_id = (select ledger.current_run());

create view api.identifiers with (security_invoker = true) as
  select i.local_project_id, i.id_type, i.id_value, i.id_issuer, i.as_of, i.source_ref, i.match_status, s.is_demo
  from ledger.identifiers i join ledger.sources s using (source_ref);

create view api.project_locations with (security_invoker = true) as
  select l.local_project_id, l.bjd_code, l.pnu, l.pnu_scope, l.source_ref, s.is_demo
  from ledger.project_locations l join ledger.sources s using (source_ref);

create view api.complexes with (security_invoker = true) as
  select c.complex_id, c.local_project_id, c.region_slug, c.complex_label, c.complex_name, c.status, c.sponsor_class,
         c.housing_kind, c.unit_count, c.move_in_month, c.progress_pct, c.progress_as_of, c.source_ref, s.is_demo
  from ledger.complexes c join ledger.sources s using (source_ref)
  where c.load_run_id = (select ledger.current_run());

create view api.events with (security_invoker = true) as        -- 모든 관측 달
  select e.local_project_id, e.complex_id, e.event_type, e.date_type, e.plan_basis, e.event_date, e.event_month,
         e.event_year, e.progress_pct, e.event_detail, e.change_reason, e.change_note, e.observed_month,
         e.source_ref, e.review_status, s.is_demo
  from ledger.events e join ledger.sources s using (source_ref);

create view api.units with (security_invoker = true) as
  select u.local_project_id, u.complex_id, u.quantity_type, u.housing_type, u.unit_count, u.reference_period,
         u.unit_scope, u.source_ref, u.review_status, s.is_demo
  from ledger.units u join ledger.sources s using (source_ref);

create view api.stat_facts with (security_invoker = true) as
  select f.metric, f.stage_code, f.sido_code, f.ym, f.actor, f.value, f.provisional, f.source_ref, s.is_demo
  from ledger.stat_facts f join ledger.sources s using (source_ref)
  where f.load_run_id = (select ledger.current_run());

create view api.policies with (security_invoker = true) as
  select p.local_policy_id, p.policy_name, p.announcement_date, p.scope_region, p.source_ref, p.review_status, s.is_demo
  from ledger.policies p join ledger.sources s using (source_ref)
  where p.load_run_id = (select ledger.current_run());

create view api.programs with (security_invoker = true) as
  select p.local_program_id, p.program_name, p.program_definition, p.source_ref, p.review_status, s.is_demo
  from ledger.programs p join ledger.sources s using (source_ref)
  where p.load_run_id = (select ledger.current_run());

create view api.links with (security_invoker = true) as
  select k.link_type, k.from_local_id, k.to_local_id, k.evidence, k.review_status, k.source_ref, s.is_demo
  from ledger.links k join ledger.sources s using (source_ref);

create view api.notices with (security_invoker = true) as
  select n.notice_system, n.notice_id, n.notice_title, n.sgg_code, n.pnu, n.announced_on, n.apply_start, n.apply_end,
         n.observed_on, n.source_ref, s.is_demo
  from ledger.notices n join ledger.sources s using (source_ref)
  where n.load_run_id = (select ledger.current_run());

create view api.notice_links with (security_invoker = true) as
  select n.notice_system, n.notice_id, n.local_project_id, n.evidence, n.review_status, n.source_ref, s.is_demo
  from ledger.notice_links n join ledger.sources s using (source_ref);

-- /sources D1: 원천의 현재 판 기준일·수집일 + 그 원천을 마지막으로 실은 발행 실행의 기록
create view api.source_freshness with (security_invoker = true) as
  select s.source_ref, s.provider, s.dataset_name, s.data_as_of, s.collected_at, s.is_demo,
         r.run_id, r.month as run_month, r.kind as run_kind, r.finished_at as run_finished_at,
         r.data_as_of as run_data_as_of, r.collected_at as run_collected_at, r.record_count as run_record_count
  from ledger.sources s
  left join lateral (
    select ir.run_id, ir.month, ir.kind, ir.finished_at, irs.data_as_of, irs.collected_at, irs.record_count
    from ledger.ingest_run_sources irs join ledger.ingest_runs ir using (run_id)
    where irs.source_ref = s.source_ref and ir.status = 'published'
    order by ir.month desc, ir.run_id desc
    limit 1
  ) r on true
  where s.load_run_id = (select ledger.current_run());

revoke all on all tables in schema api from public, anon, authenticated, service_role;
grant select on all tables in schema api to anon, authenticated;
