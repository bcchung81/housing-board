-- 원장 정제(HOME 덤프 재적재 대비) — 계획: docs/product/데이터-정제-계획.md 4절 D3, 8절 W3. 앞 마이그레이션은 고치지 않는다.
-- ① 고아 정리: publish_run 이 이번 실행 스테이징에 없는 projects·complexes 를 정리한다(지금까지는 upsert 만 해 옛 사업이 남았다).
--    다른 달(= 닫힌 달, 열린 달은 하나이고 그 달 events 는 먼저 갈아 넣는다) events 가 가리키는 행은 지울 수 없어(가드·외래 키)
--    지우지 않고 retired_run_id(정리한 실행)로 표시한다. 다시 실리면 upsert 가 null 로 되돌린다.
--    표시 열을 superseded_by 로 쓰지 않는 이유: 대체할 사업이 없는 고아가 대부분이고, complexes 에는 그 열이 없고,
--    superseded_by 는 파일(변환기)이 정하는 열이라 DB 가 바꾸면 파일 = DB 왕복(supabase-verify)이 깨진다.
--    공개·화면 쪽: api.projects·api.complexes·export_table 은 현재 판(load_run_id = current_run())만 보므로 표시된 행은 이미 빠진다.
-- ② 새 표 policy_targets(정책 목표 호수)·area_facts(지역 지표) — 판마다 바꾸는 표(지우고 넣기). anon·authenticated 권한·정책 없음.
-- ③ links 재매칭: links 는 이미 판마다 지우고 넣는 표이고, 덤프 판은 source_ref(예: home-dump-<덤프시각>, sources 행)와
--    ingest_run_sources(실행 ↔ 원천)로 추적된다 → 바꾸지 않는다.
-- 적용은 따로 승인받는다(이 파일만 만들었다).

-- ============ 1 고아 표시 열 ============
alter table ledger.projects add column retired_run_id bigint references ledger.ingest_runs;
alter table ledger.complexes add column retired_run_id bigint references ledger.ingest_runs;

-- ============ 2 새 표 ============
create table ledger.policy_targets (
  target_id        bigint generated always as identity primary key,
  local_policy_id  ledger.local_id not null references ledger.policies,
  local_program_id ledger.local_id references ledger.programs,
  stage_code       ledger.stage_code,
  area_codes       text[] not null check (cardinality(area_codes) > 0 and array_position(area_codes, null) is null
                                          and array_to_string(area_codes, ',') ~ '^(\d{2}|\d{5})(,(\d{2}|\d{5}))*$'),
  period_start     date not null,
  period_end       date not null,
  target_units     integer not null check (target_units >= 0),
  evidence         text check (evidence <> ''),
  source_ref       ledger.source_ref not null references ledger.sources,
  review_status    ledger.review_status not null,
  load_run_id      bigint not null references ledger.ingest_runs,
  load_seq         integer not null,
  unique nulls not distinct (local_policy_id, local_program_id, stage_code, area_codes, period_start, period_end),
  check (period_start <= period_end)
);
create index on ledger.policy_targets (local_program_id) where local_program_id is not null;

create table ledger.area_facts (
  fact_id       bigint generated always as identity primary key,
  area_code     text not null references ledger.areas,
  metric        text not null check (metric ~ '^[a-z][a-z0-9_]*$'),
  breakdown     text check (breakdown <> ''),
  period        text not null check (period ~ '^\d{4}(-(0[1-9]|1[0-2]|H[12]))?$'),
  value         numeric not null,
  unit          text not null check (unit <> ''),
  definition    text check (definition <> ''),
  source_ref    ledger.source_ref not null references ledger.sources,
  review_status ledger.review_status not null,
  load_run_id   bigint not null references ledger.ingest_runs,
  load_seq      integer not null,
  unique nulls not distinct (area_code, metric, breakdown, period, source_ref)
);
create index on ledger.area_facts (metric, period);

alter table ledger.policy_targets enable row level security;
alter table ledger.area_facts     enable row level security;
-- 정책 없음, anon·authenticated 권한 없음(원장 행은 비공개 — 기획서 Q4). 쓰기는 service_role(적재 RPC)만, TRUNCATE 는 주지 않는다
revoke all on ledger.policy_targets, ledger.area_facts from public, anon, authenticated, service_role;
grant select, insert, update, delete on ledger.policy_targets, ledger.area_facts to service_role;
grant usage on sequence ledger.policy_targets_target_id_seq, ledger.area_facts_fact_id_seq to service_role;

-- ============ 3 적재 도우미: retired_run_id 는 적재 열처럼 DB 가 정한다(파일에 없다) ============
create or replace function ledger_admin.load_cols(p_tbl text) returns text[]
language sql stable set search_path = '' as $$
  select array_agg(a.attname::text order by a.attnum)
  from pg_catalog.pg_attribute a
  where a.attrelid = pg_catalog.to_regclass('ledger.' || pg_catalog.quote_ident(p_tbl))
    and a.attnum > 0 and not a.attisdropped and a.attidentity = '' and a.attgenerated = ''
    and a.attname not in ('load_run_id', 'load_seq', 'retired_run_id')
$$;

-- ============ 4 publish_run: 새 표 2개 + 고아 정리 ============
-- 앞 판(_ledger_load.sql)과 같고 바뀐 곳은 셋: v_replace 에 새 표 2개, projects·complexes upsert 때 retired_run_id = null,
-- events 뒤 고아 정리(돌려주는 값의 orphans = {complexes_retired, complexes_deleted, projects_retired, projects_deleted}).
create or replace function ledger_admin.publish_run(p_run bigint, p_expected jsonb)
returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_upsert  text[] := array['sources','areas','agencies','projects','complexes','policies','programs','notices','stat_facts'];
  v_replace text[] := array['identifiers','project_locations','units','review_required','links','notice_links','policy_targets','area_facts'];
  v_month text; v_status text; v_kind text;
  v_counts jsonb := '{}';
  v_orphans jsonb := '{}';
  v_board jsonb;
  v_keep text[];
  t text; n bigint; bad text;
begin
  perform pg_advisory_xact_lock(hashtext('ledger_admin.publish_run'));
  select month, status, kind into v_month, v_status, v_kind from ledger.ingest_runs where run_id = p_run for update;
  if v_month is null then raise exception '실행 %이 없다', p_run; end if;
  if v_kind <> 'load' or v_status <> 'staged' then raise exception '실행 %은 발행할 수 없다(kind %, status %)', p_run, v_kind, v_status; end if;

  select string_agg(format('%s 스테이징 %s ≠ 기대 %s', k, coalesce(s.n, 0), coalesce(e.n, 0)), ', ') into bad
  from (select tbl as k, count(*) as n from ledger_admin.stage_rows where run_id = p_run group by tbl) s
  full join (select key as k, value::bigint as n from jsonb_each_text(p_expected)) e using (k)
  where coalesce(s.n, 0) <> coalesce(e.n, 0);
  if bad is not null then raise exception '스테이징 행 수가 다르다: %', bad; end if;
  if exists (select 1 from ledger_admin.stage_rows where run_id = p_run
             and tbl not in ('board','events') and not (tbl = any (v_upsert || v_replace))) then
    raise exception '모르는 표가 스테이징에 있다';
  end if;
  if exists (select 1 from ledger_admin.stage_rows where run_id = p_run and tbl = 'events' and row->>'observed_month' is distinct from v_month) then
    raise exception 'events 의 observed_month 가 실행 달 %과 다르다', v_month;
  end if;

  set constraints all deferred;

  foreach t in array v_upsert loop
    execute ledger_admin.insert_sql(t) || format(' on conflict (%s) do update set %s, load_run_id = excluded.load_run_id, load_seq = excluded.load_seq%s',
      (select string_agg(format('%I', c), ', ') from unnest(ledger_admin.pk_cols(t)) c),
      (select string_agg(format('%1$I = excluded.%1$I', c), ', ') from unnest(ledger_admin.load_cols(t)) c
         where c <> all (ledger_admin.pk_cols(t))),
      case when t in ('projects', 'complexes') then ', retired_run_id = null' else '' end)
      using p_run;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object(t, n);
  end loop;

  foreach t in array v_replace loop
    execute format('delete from ledger.%I where load_run_id is not null', t);   -- safeupdate: WHERE 필수
    execute ledger_admin.insert_sql(t) using p_run;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object(t, n);
  end loop;

  delete from ledger.events where observed_month = v_month;
  execute ledger_admin.insert_sql('events') using p_run;
  get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('events', n);

  -- 고아 정리: 이번 실행이 upsert 하지 않은 행(load_run_id ≠ p_run). 바꾸는 표·이 달 events 는 이미 이번 판뿐이라
  -- 남은 참조는 다른 달(닫힌 달) events 와 그 events 때문에 남기는 단지·대체 사슬뿐이다.
  update ledger.complexes c set retired_run_id = p_run
    where c.load_run_id <> p_run and c.retired_run_id is null
      and exists (select 1 from ledger.events e where e.complex_id = c.complex_id);
  get diagnostics n = row_count;
  v_orphans := v_orphans || jsonb_build_object('complexes_retired', n);
  delete from ledger.complexes c
    where c.load_run_id <> p_run
      and not exists (select 1 from ledger.events e where e.complex_id = c.complex_id);
  get diagnostics n = row_count;
  v_orphans := v_orphans || jsonb_build_object('complexes_deleted', n);

  with recursive keep(id) as (
    select r.id from (
      select e.local_project_id::text as id from ledger.events e
        join ledger.projects p on p.local_project_id = e.local_project_id and p.load_run_id <> p_run
      union
      select c.local_project_id::text from ledger.complexes c
        join ledger.projects p on p.local_project_id = c.local_project_id and p.load_run_id <> p_run
    ) r
    union
    select p.superseded_by::text from ledger.projects p join keep k on p.local_project_id = k.id where p.superseded_by is not null
  )
  select coalesce(array_agg(id), '{}') into v_keep from keep;
  update ledger.projects p set retired_run_id = p_run
    where p.load_run_id <> p_run and p.retired_run_id is null and p.local_project_id = any (v_keep);
  get diagnostics n = row_count;
  v_orphans := v_orphans || jsonb_build_object('projects_retired', n);
  delete from ledger.projects p
    where p.load_run_id <> p_run and p.local_project_id <> all (v_keep);
  get diagnostics n = row_count;
  v_orphans := v_orphans || jsonb_build_object('projects_deleted', n);
  v_counts := v_counts || jsonb_build_object('orphans', v_orphans);

  select row into v_board from ledger_admin.stage_rows where run_id = p_run and tbl = 'board';
  if v_board is not null then
    insert into ledger.board_snapshots (month, run_id, reference_date, board)
      values (v_month, p_run, (v_board->>'referenceDate')::date, v_board)
      on conflict (month) do update set run_id = excluded.run_id, reference_date = excluded.reference_date,
        board = excluded.board, built_at = now();
    v_counts := v_counts || jsonb_build_object('board', 1);
  end if;

  insert into ledger.ingest_run_sources (run_id, source_ref, data_as_of, collected_at, record_count)
    select p_run, r.source_ref, r.data_as_of, r.collected_at, r.record_count
    from ledger_admin.stage_rows s cross join lateral jsonb_populate_record(null::ledger.sources, s.row) r
    where s.run_id = p_run and s.tbl = 'sources';

  update ledger.ingest_runs set status = 'superseded'
    where month = v_month and kind = 'load' and status = 'published' and run_id <> p_run;
  update ledger.ingest_runs set status = 'published', finished_at = now(), counts = v_counts where run_id = p_run;
  delete from ledger_admin.stage_rows where run_id = p_run;
  return v_counts;
end $$;

-- ============ 5 export_table: 새 표 2개, 표시 열·새 대리 키는 뺀다 ============
create or replace function ledger_admin.export_table(p_tbl text, p_month text default null, p_offset integer default 0, p_limit integer default 5000)
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_drop text[] := array['load_run_id','load_seq','location_id','event_id','unit_id','review_id','target_id','fact_id','retired_run_id',
                         'from_policy_id','from_program_id','to_program_id','to_project_id'];
  v_run bigint := ledger.current_run();
  v_out jsonb;
begin
  if p_tbl not in ('sources','areas','agencies','projects','complexes','policies','programs','notices','stat_facts',
                   'identifiers','project_locations','units','review_required','links','notice_links','events',
                   'policy_targets','area_facts') then
    raise exception '내보낼 수 없는 표 %', p_tbl;
  end if;
  if p_tbl = 'events' then
    execute format('select coalesce(jsonb_agg(to_jsonb(t) - $1 order by t.load_seq), ''[]'') from '
                   '(select * from ledger.events where observed_month = $2 order by load_seq offset $3 limit $4) t')
      into v_out using v_drop, coalesce(p_month, (select month from ledger.ingest_runs where run_id = v_run)), p_offset, p_limit;
  else
    execute format('select coalesce(jsonb_agg(to_jsonb(t) - $1 order by t.load_seq), ''[]'') from '
                   '(select * from ledger.%I where load_run_id = $2 order by load_seq offset $3 limit $4) t', p_tbl)
      into v_out using v_drop, v_run, p_offset, p_limit;
  end if;
  return v_out;
end $$;

-- ============ 6 orphan_counts: 확인용(supabase-verify). stale = 현재 판이 아닌데 표시도 없는 행(발행 뒤 0 이어야 한다) ============
create function ledger_admin.orphan_counts()
returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'projects_stale',    (select count(*) from ledger.projects  where load_run_id <> ledger.current_run() and retired_run_id is null),
    'projects_retired',  (select count(*) from ledger.projects  where retired_run_id is not null),
    'complexes_stale',   (select count(*) from ledger.complexes where load_run_id <> ledger.current_run() and retired_run_id is null),
    'complexes_retired', (select count(*) from ledger.complexes where retired_run_id is not null))
$$;

-- create or replace 는 권한을 그대로 둔다. 새 함수는 기본 EXECUTE 가 public 에 있어 회수한다
revoke execute on function ledger_admin.orphan_counts() from public, anon, authenticated;
grant execute on function ledger_admin.orphan_counts() to service_role;

-- ============ 7 값 목록 넓히기: GH 공고(notice_system 'GH')·HOME 별칭 식별자(id_type 'HOME') ============
-- GH 공고 694건(HOME gh_notice)이 notice_system CHECK 에 GH 가 없어 실리지 못했다. HPR_·PRO_·LH_ 별칭은 MANUAL 에 섞여 있었다 — 전용 종류로 나눈다.
alter table ledger.notices drop constraint notices_notice_system_check;
alter table ledger.notices add constraint notices_notice_system_check
  check (notice_system in ('MYHOME','LH','APPLYHOME','HUG','GH'));
alter table ledger.notice_links drop constraint notice_links_notice_system_check;
alter table ledger.notice_links add constraint notice_links_notice_system_check
  check (notice_system in ('MYHOME','LH','APPLYHOME','HUG','GH'));
alter table ledger.identifiers drop constraint identifiers_id_type_check;
alter table ledger.identifiers add constraint identifiers_id_type_check
  check (id_type in ('AREA_BLOCK','BUNDLE_ID','LH_AREA_BLOCK_CODE','HUB_HS_PK','HUB_AP_PK','MANUAL','BLDRGST_PK','REB_COMPLEX_ID','KAPT_CODE','MYHOME_HSMP_SN','HOME'));

notify pgrst, 'reload schema';
