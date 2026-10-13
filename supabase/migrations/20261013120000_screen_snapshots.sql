-- 화면 표시값(api.screens) — 화면이 빌드 때 묶은 JSON 대신 Supabase 에서 읽는다. Q4 공개 범위 '화면 표시값만 공개'.
-- 설계: docs/product/Supabase-원장-설계.md 1·3절. 앞 마이그레이션은 고치지 않는다(_map_snapshots.sql 과 같은 방식).
-- 표 ledger.screen_snapshots 는 저장소 파일 네 개를 달·화면 키마다 한 행으로 그대로 싣는다:
--   molit = data/board/molit.json · lh = data/board/lh-completion.json · sources = data/board/sources.json · registry = registry/projects.json
-- 적재는 publish_map 뒤 같은 트랜잭션에서 publish_screens 한 번(tools/ledger/supabase-load.js).
-- 새로 공개하는 값은 화면이 이미 보이는 것(위 네 파일)뿐이다. 원장 행(api 의 나머지 뷰·ledger 표)은 그대로 비공개.

-- ============ 1 표 ============
create table ledger.screen_snapshots (
  month     ledger.ym not null references ledger.months,
  key       text not null check (key in ('molit', 'lh', 'sources', 'registry')),
  run_id    bigint not null references ledger.ingest_runs,
  payload   jsonb not null check (jsonb_typeof(payload) = 'object'),
  built_at  timestamptz not null default now(),
  primary key (month, key)
);

-- ============ 2 불변 강제(board_snapshots 와 같은 방식) ============
create trigger guard before insert or update or delete on ledger.screen_snapshots for each row execute function ledger.guard_closed_month('month');
create trigger no_truncate before truncate on ledger.screen_snapshots for each statement execute function ledger.no_truncate();

-- ============ 3 RLS·권한: 읽기는 anon·authenticated, 쓰기는 service_role(publish_screens)만 ============
alter table ledger.screen_snapshots enable row level security;
revoke all on ledger.screen_snapshots from public, anon, authenticated, service_role;
grant select on ledger.screen_snapshots to anon, authenticated;
create policy read_all on ledger.screen_snapshots for select to anon, authenticated using (true);
grant select, insert, update, delete on ledger.screen_snapshots to service_role;

-- ============ 4 공개 뷰: 가장 최근 달의 화면 키·기준일·실행·내용 ============
-- security_invoker 라 anon 은 screen_snapshots·months(이미 공개, api.board 의 입력)만 읽는다
create view api.screens with (security_invoker = true) as
  select s.key, s.month, m.reference_date, s.run_id, s.payload
  from ledger.screen_snapshots s join ledger.months m using (month)
  where s.month = (select max(month) from ledger.screen_snapshots);
revoke all on api.screens from public, anon, authenticated, service_role;
grant select on api.screens to anon, authenticated;

-- ============ 5 적재 RPC ============
-- publish_screens: 발행된(published) load 실행이고 그 달이 열려 있을 때만, 그 달의 화면 행을 모두 바꿔 넣는다.
--   p_payloads = {molit: {…}, lh: {…}, sources: {…}, registry: {…}} — 키는 정확히 이 넷, 값은 모두 객체.
--   publish_run 과 같은 잠금을 잡아 두 발행이 섞이지 않게 한다. 돌려주는 값 = 넣은 행 수(4).
create function ledger_admin.publish_screens(p_run bigint, p_payloads jsonb)
returns integer
language plpgsql set search_path = '' as $$
declare
  v_month text; v_status text; v_kind text;
  n integer;
begin
  perform pg_advisory_xact_lock(hashtext('ledger_admin.publish_run'));
  select month, status, kind into v_month, v_status, v_kind from ledger.ingest_runs where run_id = p_run;
  if v_month is null then raise exception '실행 %이 없다', p_run; end if;
  if v_kind <> 'load' or v_status <> 'published' then raise exception '실행 %은 발행된 적재가 아니다(kind %, status %)', p_run, v_kind, v_status; end if;
  if not exists (select 1 from ledger.months where month = v_month and status = 'open') then raise exception '달 %이 열려 있지 않다', v_month; end if;
  if jsonb_typeof(p_payloads) is distinct from 'object'
     or (select array_agg(key order by key) from jsonb_each(p_payloads)) is distinct from array['lh', 'molit', 'registry', 'sources']
     or exists (select 1 from jsonb_each(p_payloads) where jsonb_typeof(value) <> 'object') then
    raise exception 'p_payloads 는 {molit, lh, sources, registry: 객체} 여야 한다';
  end if;

  delete from ledger.screen_snapshots where month = v_month;
  insert into ledger.screen_snapshots (month, key, run_id, payload)
    select v_month, key, p_run, value from jsonb_each(p_payloads) order by key;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function ledger_admin.publish_screens(bigint, jsonb) from public, anon, authenticated;
grant execute on function ledger_admin.publish_screens(bigint, jsonb) to service_role;

notify pgrst, 'reload schema';
