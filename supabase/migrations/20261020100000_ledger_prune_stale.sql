-- 이번 판에 없는 통계·공고·지역 정리 — 2026-10-20 사용자 결정(원장·화면은 수도권 서울 11·인천 28·경기 41 만)으로
-- 저장소 표 areas·stat_facts 에서 수도권 밖 행이 빠진다. 앞 마이그레이션은 고치지 않는다.
-- 지금까지 publish_run 은 stat_facts·notices·areas 를 upsert 만 해(docs/product/HOME-재덤프-이관-핸드오프.md 5절 9) 표에서 빠진 행이 DB 에 남았다.
-- 공개 뷰(api.*)·export_table 은 현재 판(load_run_id = current_run())만 보므로 화면 값은 바뀌지 않는다 — 원장에 남은 행만 없앤다.
-- ① publish_run: projects·complexes 고아 정리(*_ledger_refine.sql) 뒤에, 이번 실행이 upsert 하지 않은 행(load_run_id ≠ p_run)을 지운다.
--    stat_facts — 가리키는 표가 없다 → 모두 지운다.
--    notices    — notice_links 만 가리킨다(판마다 통째 교체라 이번 판 연결뿐) → 이번 판 연결이 가리키지 않으면 지우고, 가리키면 남겨 센다.
--    areas      — projects(닫힌 달 events 때문에 남긴 표시 사업 포함)·project_locations·stat_facts·notices·area_facts·하위 areas 가 가리킨다
--                 → 앞의 둘을 먼저 지운 뒤, 아직 가리키는 행이 있는 지역과 그 상위(parent_code 사슬)는 남겨 센다(표시 열은 두지 않는다 — verify 가 stale 로 잡는다).
--    닫힌 달: 세 표에는 달 열·닫힌 달 가드가 없고, 닫힌 달 events 가 가리키는 사업은 이미 남기므로(retired_run_id) 그 시군구도 남는다.
--    멱등: 같은 판을 다시 발행하면 지울 행이 없다. 돌려주는 값의 orphans 에 stat_facts_deleted·notices_deleted·notices_kept·areas_deleted·areas_kept 를 더한다.
-- ② orphan_counts: areas·stat_facts·notices 의 stale(현재 판 아님) 수를 더한다 — supabase-verify 가 0 을 확인한다.
-- 적용은 따로 승인받는다(이 파일만 만들었다).

-- ============ 1 publish_run: 고아 정리에 통계·공고·지역 ============
-- 앞 판(*_ledger_refine.sql)과 같고 바뀐 곳은 하나: projects 고아 정리 뒤 '통계·공고·지역 정리' 묶음.
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

  -- 통계·공고·지역 정리: 가리키는 행이 남은 공고·지역은 지우지 않고 센다(_kept). 지역은 통계·공고를 지운 뒤에 본다
  delete from ledger.stat_facts f where f.load_run_id <> p_run;
  get diagnostics n = row_count;
  v_orphans := v_orphans || jsonb_build_object('stat_facts_deleted', n);
  delete from ledger.notices x
    where x.load_run_id <> p_run
      and not exists (select 1 from ledger.notice_links l where l.notice_system = x.notice_system and l.notice_id = x.notice_id);
  get diagnostics n = row_count;
  v_orphans := v_orphans || jsonb_build_object('notices_deleted', n);
  select count(*) into n from ledger.notices x where x.load_run_id <> p_run;
  v_orphans := v_orphans || jsonb_build_object('notices_kept', n);
  with recursive keep(code) as (
    select a.area_code from ledger.areas a
      where a.load_run_id <> p_run
        and (exists (select 1 from ledger.projects p where p.sgg_code = a.area_code)
          or exists (select 1 from ledger.project_locations l where l.bjd_code = a.area_code)
          or exists (select 1 from ledger.stat_facts f where f.sido_code = a.area_code)
          or exists (select 1 from ledger.notices x where x.sgg_code = a.area_code)
          or exists (select 1 from ledger.area_facts x where x.area_code = a.area_code)
          or exists (select 1 from ledger.areas c where c.parent_code = a.area_code and c.load_run_id = p_run))
    union
    select a.parent_code from ledger.areas a join keep k on a.area_code = k.code where a.parent_code is not null
  )
  select coalesce(array_agg(code), '{}') into v_keep from keep;
  delete from ledger.areas a
    where a.load_run_id <> p_run and a.area_code <> all (v_keep);
  get diagnostics n = row_count;
  v_orphans := v_orphans || jsonb_build_object('areas_deleted', n);
  select count(*) into n from ledger.areas a where a.load_run_id <> p_run;
  v_orphans := v_orphans || jsonb_build_object('areas_kept', n);
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

-- ============ 2 orphan_counts: 통계·공고·지역 stale(발행 뒤 0 이어야 한다) ============
-- create or replace 는 권한을 그대로 둔다(EXECUTE 는 service_role 만, *_ledger_refine.sql)
create or replace function ledger_admin.orphan_counts()
returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'projects_stale',    (select count(*) from ledger.projects  where load_run_id <> ledger.current_run() and retired_run_id is null),
    'projects_retired',  (select count(*) from ledger.projects  where retired_run_id is not null),
    'complexes_stale',   (select count(*) from ledger.complexes where load_run_id <> ledger.current_run() and retired_run_id is null),
    'complexes_retired', (select count(*) from ledger.complexes where retired_run_id is not null),
    'areas_stale',       (select count(*) from ledger.areas      where load_run_id <> ledger.current_run()),
    'stat_facts_stale',  (select count(*) from ledger.stat_facts where load_run_id <> ledger.current_run()),
    'notices_stale',     (select count(*) from ledger.notices    where load_run_id <> ledger.current_run()))
$$;

notify pgrst, 'reload schema';
