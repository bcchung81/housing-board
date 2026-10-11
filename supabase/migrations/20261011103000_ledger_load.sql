-- 사업 원장 적재 단계 — 설계: docs/product/Supabase-원장-설계.md 1·3·5·6절, 부록 A-7.
-- 이번 범위: 스키마 ledger_admin(service_role 만), 스테이징 표 stage_rows, RPC begin_run·publish_run·export_table·record_files,
--   Storage 버킷 ledger-raw(비공개), Data API 노출 스키마(api·ledger_admin).
-- 적재 도구: tools/ledger/supabase-load.js(secret 키). 발행은 RPC 한 번 = 한 트랜잭션이라 읽는 쪽은 반쯤 올라간 판을 보지 않는다.
-- authenticator 의 statement_timeout 8초 안에서 끝나야 한다(2026-10 판 39,162행 실측은 부록 C).

-- ============ 1 스키마·스테이징 표 ============
create schema ledger_admin;
revoke all on schema ledger_admin from public;
grant usage on schema ledger_admin to service_role;   -- anon·authenticated 는 USAGE 없음 → 표·함수 모두 못 부른다

create table ledger_admin.stage_rows (
  run_id bigint  not null references ledger.ingest_runs on delete cascade,
  tbl    text    not null,
  seq    integer not null,           -- 그 달 파일 안의 순서(1부터) → load_seq
  row    jsonb   not null,
  primary key (run_id, tbl, seq)
);
alter table ledger_admin.stage_rows enable row level security;   -- 정책 없음: service_role(BYPASSRLS)만
revoke all on ledger_admin.stage_rows from public, anon, authenticated, service_role;
grant select, insert, delete on ledger_admin.stage_rows to service_role;

-- ============ 2 내부 도우미 ============
-- 적재하는 열: 대리 키(identity)·생성 열·적재 열 제외. 표 이름은 부르는 쪽이 목록으로 거른 뒤 넘긴다
create function ledger_admin.load_cols(p_tbl text) returns text[]
language sql stable set search_path = '' as $$
  select array_agg(a.attname::text order by a.attnum)
  from pg_catalog.pg_attribute a
  where a.attrelid = pg_catalog.to_regclass('ledger.' || pg_catalog.quote_ident(p_tbl))
    and a.attnum > 0 and not a.attisdropped and a.attidentity = '' and a.attgenerated = ''
    and a.attname not in ('load_run_id', 'load_seq')
$$;

create function ledger_admin.pk_cols(p_tbl text) returns text[]
language sql stable set search_path = '' as $$
  select array_agg(a.attname::text order by k.ord)
  from pg_catalog.pg_index i
  cross join lateral unnest(i.indkey) with ordinality k(attnum, ord)
  join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
  where i.indrelid = pg_catalog.to_regclass('ledger.' || pg_catalog.quote_ident(p_tbl)) and i.indisprimary
$$;

-- 스테이징 → 원장 표 insert 문(on conflict 절은 부르는 쪽이 붙인다)
create function ledger_admin.insert_sql(p_tbl text) returns text
language sql stable set search_path = '' as $$
  select format(
    'insert into ledger.%1$I (%2$s, load_run_id, load_seq) select %3$s, $1, s.seq from ledger_admin.stage_rows s '
    'cross join lateral jsonb_populate_record(null::ledger.%1$I, s.row) r where s.run_id = $1 and s.tbl = %4$L order by s.seq',
    p_tbl,
    (select string_agg(format('%I', c), ', ') from unnest(ledger_admin.load_cols(p_tbl)) c),
    (select string_agg(format('r.%I', c), ', ') from unnest(ledger_admin.load_cols(p_tbl)) c),
    p_tbl)
$$;

-- ============ 3 적재 RPC ============
-- begin_run: 새 달이면 이전의 열린 달을 같은 트랜잭션에서 닫는다. 닫힌 달이면 guard_months 가 거부, 열린 달보다 앞선 달은 months_one_open 이 거부.
-- 같은 달·같은 종류의 'staged' 로 남은 실행(앞선 적재가 중간에 멈춤)은 failed 로 돌리고 스테이징을 비운다.
create function ledger_admin.begin_run(p_month text, p_kind text, p_reference_date date, p_meta jsonb default '{}')
returns bigint
language plpgsql set search_path = '' as $$
declare v_run bigint;
begin
  update ledger.months set status = 'closed', closed_at = now() where status = 'open' and month < p_month;
  insert into ledger.months (month, reference_date) values (p_month, p_reference_date)
    on conflict (month) do update set reference_date = excluded.reference_date;
  delete from ledger_admin.stage_rows s using ledger.ingest_runs r
    where s.run_id = r.run_id and r.month = p_month and r.kind = p_kind and r.status = 'staged';
  update ledger.ingest_runs set status = 'failed', finished_at = now(), error = '발행 전에 다음 실행이 시작됨'
    where month = p_month and kind = p_kind and status = 'staged';
  insert into ledger.ingest_runs (month, kind, tool, git_commit, params)
    values (p_month, p_kind, coalesce(p_meta->>'tool', 'unknown'), p_meta->>'git_commit', coalesce(p_meta->'params', '{}'))
    returning run_id into v_run;
  return v_run;
end $$;

-- publish_run: 한 트랜잭션에서 스테이징 → 원장. p_expected = {표: 행 수, …, board: 1} 과 스테이징 행 수가 다르면 전체 취소.
--   upsert 표(지우지 않음) → 바꾸는 표(지우고 넣기) → 그 달 events 지우고 넣기 → board_snapshots → ingest_run_sources
--   → 같은 달 이전 발행 superseded, 이 실행 published·counts → 스테이징 비우기.
create function ledger_admin.publish_run(p_run bigint, p_expected jsonb)
returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_upsert  text[] := array['sources','areas','agencies','projects','complexes','policies','programs','notices','stat_facts'];
  v_replace text[] := array['identifiers','project_locations','units','review_required','links','notice_links'];
  v_month text; v_status text; v_kind text;
  v_counts jsonb := '{}';
  v_board jsonb;
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
    execute ledger_admin.insert_sql(t) || format(' on conflict (%s) do update set %s, load_run_id = excluded.load_run_id, load_seq = excluded.load_seq',
      (select string_agg(format('%I', c), ', ') from unnest(ledger_admin.pk_cols(t)) c),
      (select string_agg(format('%1$I = excluded.%1$I', c), ', ') from unnest(ledger_admin.load_cols(t)) c
         where c <> all (ledger_admin.pk_cols(t))))
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

-- record_files: Storage 에 올린 원본 목록 [{bucket, path, bytes, sha256, source}] 을 발행된 실행에 남긴다
create function ledger_admin.record_files(p_run bigint, p_files jsonb)
returns void
language plpgsql set search_path = '' as $$
begin
  update ledger.ingest_runs set files = p_files where run_id = p_run and status = 'published';
  if not found then raise exception '발행된 실행 %이 없다', p_run; end if;
end $$;

-- export_table: 현재 판(events 는 그 달)을 load_seq 순 JSON 배열로. 적재 열·대리 키·생성 열은 뺀다
create function ledger_admin.export_table(p_tbl text, p_month text default null, p_offset integer default 0, p_limit integer default 5000)
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_drop text[] := array['load_run_id','load_seq','location_id','event_id','unit_id','review_id',
                         'from_policy_id','from_program_id','to_program_id','to_project_id'];
  v_run bigint := ledger.current_run();
  v_out jsonb;
begin
  if p_tbl not in ('sources','areas','agencies','projects','complexes','policies','programs','notices','stat_facts',
                   'identifiers','project_locations','units','review_required','links','notice_links','events') then
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

revoke execute on all functions in schema ledger_admin from public, anon, authenticated;
grant execute on all functions in schema ledger_admin to service_role;

-- ============ 4 Storage 버킷(비공개) ============
insert into storage.buckets (id, name, public) values ('ledger-raw', 'ledger-raw', false)
  on conflict (id) do nothing;

-- ============ 5 Data API 노출 스키마 ============
-- 대시보드·`supabase config push` 로는 바뀌지 않아 DB 안의 PostgREST 설정으로 둔다(2026-10-11 api 추가를 같은 방법으로 했다).
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, api, ledger_admin';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
