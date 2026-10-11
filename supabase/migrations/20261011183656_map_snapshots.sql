-- 지도 사업 표시값(api.map) — 기획서 M7(사업 카드에 6단계 위치와 다음 일정)·M8(지연 상태를 사업 색으로), Q4 공개 범위 '화면 표시값만 공개'.
-- 설계: docs/product/Supabase-원장-설계.md 1·3절, 부록 C. 앞 마이그레이션 세 개는 고치지 않는다.
-- 표 ledger.map_snapshots 는 tools/ledger/board.js 의 mapIndexFromLedger(data/board/ledger-map.json)를 달·시군구마다 한 행으로 싣는다.
-- 적재는 publish_run 뒤에 따로 publish_map 한 번(자기 트랜잭션) — publish_run 은 8초 제한에 가까워 건드리지 않는다.
-- 새로 공개하는 값은 지도가 이미 보이는 것(사업 이름·단계·판정·예정일·호수·건축HUB 관리번호·필지)뿐이다. 원장 행(api 의 나머지 뷰·ledger 표)은 그대로 비공개.

-- ============ 1 표 ============
create table ledger.map_snapshots (
  month     ledger.ym not null references ledger.months,
  sgg_code  ledger.sgg_code not null,
  run_id    bigint not null references ledger.ingest_runs,
  rows      jsonb not null check (jsonb_typeof(rows) = 'array'),
  built_at  timestamptz not null default now(),
  primary key (month, sgg_code)
);

-- ============ 2 불변 강제(board_snapshots 와 같은 방식) ============
create trigger guard before insert or update or delete on ledger.map_snapshots for each row execute function ledger.guard_closed_month('month');
create trigger no_truncate before truncate on ledger.map_snapshots for each statement execute function ledger.no_truncate();

-- ============ 3 RLS·권한: 읽기는 anon·authenticated, 쓰기는 service_role(publish_map)만 ============
alter table ledger.map_snapshots enable row level security;
revoke all on ledger.map_snapshots from public, anon, authenticated, service_role;
grant select on ledger.map_snapshots to anon, authenticated;
create policy read_all on ledger.map_snapshots for select to anon, authenticated using (true);
grant select, insert, update, delete on ledger.map_snapshots to service_role;

-- ============ 4 공개 뷰: 달·시군구·기준일·사업 행 ============
-- security_invoker 라 anon 은 map_snapshots·months(이미 공개, api.board 의 입력)만 읽는다
create view api.map with (security_invoker = true) as
  select s.month, s.sgg_code, m.reference_date, s.rows
  from ledger.map_snapshots s join ledger.months m using (month);
revoke all on api.map from public, anon, authenticated, service_role;
grant select on api.map to anon, authenticated;

-- ============ 5 적재 RPC ============
-- publish_map: 발행된(published) load 실행이고 그 달이 열려 있을 때만, 그 달의 시군구 행을 모두 바꿔 넣는다. p_rows = {시군구5: [사업 행…], …}.
--   publish_run 과 같은 잠금을 잡아 두 발행이 섞이지 않게 한다. 돌려주는 값 = 넣은 시군구 행 수.
create function ledger_admin.publish_map(p_run bigint, p_rows jsonb)
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
  if jsonb_typeof(p_rows) is distinct from 'object' or exists (select 1 from jsonb_each(p_rows) where jsonb_typeof(value) <> 'array') then
    raise exception 'p_rows 는 {시군구: [행…]} 객체여야 한다';
  end if;

  delete from ledger.map_snapshots where month = v_month;
  insert into ledger.map_snapshots (month, sgg_code, run_id, rows)
    select v_month, key, p_run, value from jsonb_each(p_rows) order by key;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function ledger_admin.publish_map(bigint, jsonb) from public, anon, authenticated;
grant execute on function ledger_admin.publish_map(bigint, jsonb) to service_role;

notify pgrst, 'reload schema';
