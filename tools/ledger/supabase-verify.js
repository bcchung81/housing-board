'use strict';
/* Supabase 에 실린 한 달 판을 파일과 대조한다 — 설계: docs/product/Supabase-원장-설계.md 6절 6단계.
   secret 키: ledger_admin.export_table 로 16표를 받아 파일과 행마다 깊은 같음(load_seq 순, 키 순서는 보지 않음) → validate.js 오류 0
     → 저장한 보드(api.board) = boardFromLedger(DB 표) = data/board/ledger-board.json, 달은 열림.
   publishable 키(anon): api 뷰 17개 읽힘, 현재 판 행 수 = 파일 행 수, review_required 는 api 에 없음, 원천별 최근 발행 실행(source_freshness.run_id)이 하나, ledger_admin 의 RPC·표 쓰기와 api 뷰 쓰기는 거부.
   실행: node tools/ledger/supabase-verify.js --month 2026-10 (어긋나면 종료 코드 1) */
const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { boardFromLedger } = require('./board');
const { validate } = require('./validate');
const { readEnv, readTables, client } = require('./supabase-load');

const ROOT = path.join(__dirname, '..', '..');
const PAGE = 5000;
const VIEWS = ['board', 'areas', 'agencies', 'sources', 'projects', 'identifiers', 'project_locations', 'complexes', 'events', 'units',
  'stat_facts', 'policies', 'programs', 'links', 'notices', 'notice_links', 'source_freshness'];

async function exportAll(api, tbl, month) {
  const rows = [];
  for (let off = 0; ; off += PAGE) {
    const page = await api.rpc('export_table', { p_tbl: tbl, p_month: month, p_offset: off, p_limit: PAGE });
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

async function verify({ month, root = ROOT, env = readEnv(root), fetch = globalThis.fetch, log = console.log }) {
  const problems = [];
  const check = (ok, msg) => { if (!ok) problems.push(msg); return ok; };
  const files = readTables(path.join(root, 'schemas', `ledger-${month}`, 'tables'));
  const url = env.NEXT_PUBLIC_SUPABASE_URL, pub = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const api = client({ url, key: env.SUPABASE_SECRET_KEY, fetch });

  /* 1 왕복: DB → JSON = 파일 */
  const db = {};
  for (const tbl of Object.keys(files)) {
    db[tbl] = await exportAll(api, tbl, month);
    const a = files[tbl], b = db[tbl];
    const bad = a.findIndex((r, i) => !isDeepStrictEqual(r, b[i]));
    check(a.length === b.length && bad < 0, `${tbl}: 파일 ${a.length}행 · DB ${b.length}행${bad >= 0 ? `, ${bad + 1}번째 행이 다르다` : ''}`);
  }
  log(`왕복: ${Object.keys(db).map((t) => `${t} ${db[t].length}`).join(' · ')}`);
  const errors = validate(db);
  check(errors.length === 0, `validate(DB 표) 오류 ${errors.length}건: ${errors.slice(0, 3).join(' / ')}`);
  log(`validate(DB 표): 오류 ${errors.length}`);

  /* 2 anon 읽기: 뷰 17개, 행 수 */
  const anon = async (p, init = {}) => fetch(`${url}/rest/v1/${p}`, { ...init, headers: { apikey: pub, 'Accept-Profile': 'api', ...(init.headers ?? {}) } });
  const counts = {};
  for (const v of VIEWS) {
    const res = await anon(`${v}?select=*${v === 'events' ? `&observed_month=eq.${month}` : v === 'board' ? `&month=eq.${month}` : ''}`, { headers: { Prefer: 'count=exact', Range: '0-0' } });
    await res.text();
    counts[v] = Number((res.headers.get('content-range') ?? '').split('/')[1]);
    check(res.ok, `anon api.${v} 읽기 ${res.status}`);
  }
  for (const [v, n] of Object.entries(counts)) {
    const want = v === 'board' ? 1 : v === 'source_freshness' ? files.sources.length : files[v].length;
    check(n === want, `api.${v} ${n}행 ≠ 기대 ${want}`);
  }
  log(`anon api 행 수: ${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(' · ')}`);

  /* 3 보드: 저장본 = DB 표로 다시 계산 = 파일 */
  const res = await anon(`board?month=eq.${month}&select=board,reference_date,status`);
  const [row] = await res.json();
  const stored = row?.board;
  const fileBoard = JSON.parse(fs.readFileSync(path.join(root, 'data/board/ledger-board.json'), 'utf8'));
  check(isDeepStrictEqual(stored, boardFromLedger(db, { referenceDate: row?.reference_date, observedMonth: month })), '저장한 보드 ≠ boardFromLedger(DB 표)');
  check(isDeepStrictEqual(stored, fileBoard), '저장한 보드 ≠ data/board/ledger-board.json');
  check(row?.status === 'open', `달 ${month} 상태 ${row?.status}`);
  log(`보드: 저장본 = 재계산 = 파일 ${problems.some((p) => p.includes('보드')) ? '아님' : '같음'} · 달 상태 ${row?.status}`);

  /* 4 현재 판: 모든 원천의 최근 발행 실행이 하나(source_freshness.run_id) */
  const fr = await (await anon('source_freshness?select=run_id')).json();
  const runs = [...new Set(fr.map((r) => r.run_id))];
  check(runs.length === 1 && runs[0] != null, `원천별 최근 발행 실행이 하나가 아니다: ${runs.join(',')}`);
  log(`현재 판 실행: ${runs.join(',')}`);

  /* 5 anon 쓰기 거부 */
  const denied = async (label, p, body, profile) => {
    const r = await fetch(`${url}/rest/v1/${p}`, { method: 'POST', headers: { apikey: pub, 'Content-Type': 'application/json', 'Content-Profile': profile }, body: JSON.stringify(body) });
    await r.text();
    check(r.status >= 400, `anon ${label} 가 거부되지 않았다(${r.status})`);
    return `${label} ${r.status}`;
  };
  const deny = [
    await denied('rpc begin_run', 'rpc/begin_run', { p_month: month, p_kind: 'load', p_reference_date: '2026-10-10' }, 'ledger_admin'),
    await denied('rpc publish_run', 'rpc/publish_run', { p_run: 1, p_expected: {} }, 'ledger_admin'),
    await denied('stage_rows insert', 'stage_rows', { run_id: 1, tbl: 'x', seq: 1, row: {} }, 'ledger_admin'),
    await denied('api.projects insert', 'projects', { local_project_id: 'PRJ-00000-0000' }, 'api'),
  ];
  const rr = await anon('review_required?select=*&limit=1');
  await rr.text();
  check(rr.status >= 400, `anon api.review_required 가 읽힌다(${rr.status})`);
  log(`anon 거부: ${deny.join(' · ')} · api.review_required ${rr.status}`);

  if (problems.length) log(`어긋남 ${problems.length}건:\n- ${problems.join('\n- ')}`);
  else log('모두 통과');
  return { problems, counts, runs, exported: Object.fromEntries(Object.entries(db).map(([k, v]) => [k, v.length])) };
}

module.exports = { verify, exportAll, VIEWS };

if (require.main === module) {
  const i = process.argv.indexOf('--month');
  const month = process.argv[i + 1];
  if (i < 0 || !/^\d{4}-\d{2}$/.test(month ?? '')) { console.error('--month YYYY-MM 이 필요하다'); process.exit(1); }
  verify({ month }).then((r) => process.exit(r.problems.length ? 1 : 0), (e) => { console.error(e.message); process.exit(1); });
}
