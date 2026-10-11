#!/usr/bin/env node
/* 전국 원천 수집(원장 변환 없음): 마이홈포털 공공주택 모집공고(HWSPR02) · LH 분양임대공고문(15058530)과 공급정보(15056765).
   결과: schemas/ledger-2026-10/raw/<source>/ 아래 원본 JSON + manifest.json. 키(DATA_GO_KR_KEY, .env.local)는 어디에도 쓰지 않는다.
   사용: node tools/ledger/collect-national.js --month 2026-10 --source myhome|lh-notice|all [--to 2026-10-11] [--from 2024-01-01] [--supply-cap 600] [--reuse-list]
   한도: 호출 사이 110 ms, 동시 4건 이하(여기서는 순차), 초당 한도(PER_SECOND)는 25 초 쉬고 다시. 호출 총수는 manifest 의 calls.
   시험: tests/js/collect-national.test.cjs (순수 함수만) */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MYHOME_BASE = 'https://apis.data.go.kr/1613000/HWSPR02/';
const MYHOME_ENDPOINTS = { rental: 'rsdtRcritNtcList', sale: 'ltRsdtRcritNtcList' };
const LH_TYPES = ['05', '06', '13', '39', '54'];
const PAGE_ROWS = 100;
const SPACING_MS = 110;
const THROTTLE_WAIT_MS = 25000;
const SUPPLY_CONCURRENCY = 3;

/* ---- 순수 함수 ---- */
const pad = (n) => String(n).padStart(2, '0');
const ymd = (iso) => iso.replace(/-/g, '');
/* 총건수 → 쪽 수 */
const pageCount = (total, size = PAGE_ROWS) => (total > 0 ? Math.ceil(total / size) : 0);
/* [from, to] (YYYY-MM-DD) → 달력 연도 단위 창들. 첫·끝 창은 잘린다 */
function splitWindows(from, to) {
  if (!(from <= to)) return [];
  const out = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    const a = y === Number(from.slice(0, 4)) ? from : `${y}-01-01`, b = y === Number(to.slice(0, 4)) ? to : `${y}-12-31`;
    out.push({ from: a, to: b });
  }
  return out;
}
/* 공급정보를 부를 공고인가: 건설형(분양·국민임대·행복주택·공공임대 …)만. 매입임대·전세임대는 뺀다 */
function wantsSupply(row) {
  const name = String(row.AIS_TP_CD_NM || '') + ' ' + String(row.PAN_NM || '');
  if (!row.PAN_ID || !row.SPL_INF_TP_CD) return false;
  return !/매입|전세|집주인|어린이집/.test(String(row.AIS_TP_CD_NM || '')) && !/매입임대|전세임대/.test(name);
}
/* 공급정보 대상 고르기: 공고일 최신 순, 상한 cap */
function pickSupplyTargets(rows, cap) {
  const seen = new Set(), out = [];
  for (const r of [...rows].sort((a, b) => String(b.PAN_NT_ST_DT || '').localeCompare(String(a.PAN_NT_ST_DT || '')))) {
    if (!wantsSupply(r) || seen.has(r.PAN_ID)) continue;
    seen.add(r.PAN_ID); out.push(r);
    if (out.length >= cap) break;
  }
  return out;
}
const countBy = (rows, fn) => { const m = {}; for (const r of rows) { const k = fn(r) || '(없음)'; m[k] = (m[k] || 0) + 1; } return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1])); };
function manifest({ source, endpoint, params, calls, pages, records, fetchedAt, notes, extra }) {
  return { source, fetched_at: fetchedAt, endpoint, params, calls, pages, records, notes, ...(extra || {}) };
}

/* ---- 실행부 ---- */
function loadKey() {
  const t = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').match(/^DATA_GO_KR_KEY=(.*)$/m);
  if (!t) throw new Error('DATA_GO_KR_KEY 없음');
  return t[1].replace(/^["']|["']$/g, '').split(',')[0].trim();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function makeCaller() {
  const state = { calls: 0 };
  let last = 0;
  const doFetch = async (url, opts) => {   // 간격 유지·호출 수 셈. 429+PER_SECOND 는 호출한 쪽에서 본문을 보고 25 초 쉰다
    const at = Math.max(Date.now(), last + SPACING_MS); last = at; state.calls++;   // 동시 호출도 간격을 지키도록 시각을 먼저 예약
    if (at > Date.now()) await sleep(at - Date.now());
    return fetch(url, opts);
  };
  const longSleep = (ms) => sleep(ms >= 1000 && ms < THROTTLE_WAIT_MS ? THROTTLE_WAIT_MS : ms);   // 초당 한도 재시도 대기를 25 초로
  return { state, doFetch, sleep: longSleep };
}
const write = (dir, name, obj) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, name), JSON.stringify(obj, null, 1) + '\n'); };

async function collectMyhome({ key, month, outRoot }) {
  const { fetchPage } = require('../../lib/datagokr.js');
  const c = makeCaller(), dir = path.join(outRoot, 'myhome'), per = {}; let pages = 0, records = 0;
  for (const kind of Object.keys(MYHOME_ENDPOINTS)) {
    const items = []; let total = 0;
    for (let page = 1; ; page++) {
      const got = await fetchPage({ doFetch: c.doFetch, sleep: c.sleep, attempts: 6, url: MYHOME_BASE + MYHOME_ENDPOINTS[kind], timeoutMs: 20000, params: { serviceKey: key, numOfRows: String(PAGE_ROWS), pageNo: String(page), _type: 'json' } });
      pages++; total = got.total; items.push(...got.items);
      if (!got.items.length || page >= pageCount(total)) break;
    }
    write(dir, `${kind}.json`, { kind, endpoint: MYHOME_ENDPOINTS[kind], totalCount: total, items });
    per[kind] = { totalCount: total, rows: items.length, by_brtcNm: countBy(items, (r) => r.brtcNm), by_suplyInsttNm: countBy(items, (r) => r.suplyInsttNm), by_sttusNm: countBy(items, (r) => r.sttusNm), by_houseTyNm: countBy(items, (r) => r.houseTyNm), with_pnu: items.filter((r) => /^\d{19}$/.test(String(r.pnu || ''))).length, with_hsmpNm: items.filter((r) => r.hsmpNm).length, fields: Object.keys(items[0] || {}) };
    records += items.length;
  }
  write(dir, 'manifest.json', manifest({ source: '마이홈포털 공공주택 모집공고(HWSPR02)', endpoint: Object.values(MYHOME_ENDPOINTS).map((e) => MYHOME_BASE + e), params: { numOfRows: PAGE_ROWS, pageNo: '1..N', _type: 'json', observed_month: month }, calls: c.state.calls, pages, records, fetchedAt: new Date().toISOString(),
    notes: '전국 현재 공고 전체(시군구 필터 없음). 임대=rental.json, 분양=sale.json(items 는 원천 행 그대로). 22자리 관리번호 보호는 lib/datagokr.js protectBigInts.', extra: { per_kind: per } }));
  return { calls: c.state.calls, records };
}

async function collectLh({ key, month, outRoot, from, to, supplyCap, reuseList }) {
  const L = require('../../lib/lhnotice.js');
  const c = makeCaller(), dir = path.join(outRoot, 'lh-notice'), windows = splitWindows(from, to); let pages = 0;
  const byId = new Map(), perType = {}, listFile = path.join(dir, 'notices.json');
  const reuse = reuseList && fs.existsSync(listFile);   // 목록 재사용(공급정보 단계만 다시 돌릴 때)
  if (reuse) for (const r of JSON.parse(fs.readFileSync(listFile, 'utf8')).items) { byId.set(r.PAN_ID, r); perType[r.UPP_AIS_TP_CD] = (perType[r.UPP_AIS_TP_CD] || 0) + 1; }
  for (const tp of reuse ? [] : LH_TYPES) {
    perType[tp] = 0;
    for (const w of windows) for (let page = 1; ; page++) {
      const json = await L.fetchLh({ doFetch: c.doFetch, sleep: c.sleep, url: L.LIST_URL, attempts: 6, params: { serviceKey: key, PG_SZ: String(PAGE_ROWS), PAGE: String(page), PAN_ST_DT: ymd(w.from), PAN_ED_DT: ymd(w.to), UPP_AIS_TP_CD: tp } });
      const got = L.listOf(json); pages++;
      for (const r of got.rows) if (!byId.has(r.PAN_ID)) { byId.set(r.PAN_ID, r); perType[tp]++; }
      if (!got.rows.length || page >= pageCount(got.total)) break;
    }
  }
  const rows = [...byId.values()];
  if (!reuse) write(dir, 'notices.json', { window: { from, to }, types: LH_TYPES, items: rows });
  const targets = pickSupplyTargets(rows, supplyCap), supplyFile = path.join(dir, 'supply.json');
  const prev = reuse && fs.existsSync(supplyFile) ? JSON.parse(fs.readFileSync(supplyFile, 'utf8')).items : [];   // 중간에 끊겼을 때 이어받기
  const done = new Map(prev.map((p) => [p.PAN_ID, p])), failed = [];
  const todo = targets.filter((r) => !done.has(r.PAN_ID));
  const save = () => write(dir, 'supply.json', { count: done.size, failed, items: [...done.values()] });
  let next = 0;
  await Promise.all(Array.from({ length: SUPPLY_CONCURRENCY }, async () => {
    while (next < todo.length) {
      const r = todo[next++];
      try {
        const json = await L.fetchLh({ doFetch: c.doFetch, sleep: c.sleep, url: L.SUPPLY_URL, attempts: 6, params: { serviceKey: key, PAN_ID: r.PAN_ID, SPL_INF_TP_CD: r.SPL_INF_TP_CD, CCR_CNNT_SYS_DS_CD: r.CCR_CNNT_SYS_DS_CD, UPP_AIS_TP_CD: r.UPP_AIS_TP_CD } });
        done.set(r.PAN_ID, { PAN_ID: r.PAN_ID, response: json });
      } catch (e) { failed.push({ PAN_ID: r.PAN_ID, error: e.message }); }
      if ((done.size + failed.length) % 50 === 0) { save(); console.log('supply', done.size + failed.length, '/', targets.length, 'calls', c.state.calls); }
    }
  }));
  save();
  const supply = [...done.values()];
  const dtl = supply.flatMap((s) => (Array.isArray(s.response) ? s.response.filter((b) => b && Array.isArray(b.dsList01)).flatMap((b) => b.dsList01) : []));
  write(dir, 'manifest.json', manifest({ source: 'LH 분양임대공고문(15058530) + 공급정보(15056765)', endpoint: [L.LIST_URL, L.SUPPLY_URL], params: { PG_SZ: PAGE_ROWS, PAN_ST_DT: ymd(from), PAN_ED_DT: ymd(to), UPP_AIS_TP_CD: LH_TYPES, windows, 'PAN_SS': '(생략=전체 상태)', observed_month: month }, calls: c.state.calls, pages, records: rows.length, fetchedAt: new Date().toISOString(),
    notes: `공고 목록은 유형별·연도 창별로 전 쪽 수집 후 PAN_ID 로 중복 제거(notices.json). 공급정보(supply.json)는 매입·전세 제외 건설형 후보 중 공고일 최신 ${supplyCap}건까지(대상 ${targets.length}건, 성공 ${supply.length}, 실패 ${failed.length}). 공급정보 행(dsList01)에는 단지명·주택형·세대수만 있고 주소는 없다. 지역은 CNP_CD_NM(시도)뿐.`,
    extra: { by_type: perType, by_AIS_TP_CD_NM: countBy(rows, (r) => r.AIS_TP_CD_NM), by_PAN_SS: countBy(rows, (r) => r.PAN_SS), by_CNP_CD_NM: countBy(rows, (r) => r.CNP_CD_NM), by_year: countBy(rows, (r) => String(r.PAN_NT_ST_DT || '').slice(0, 4)), supply_targets: targets.length, supply_ok: supply.length, supply_failed: failed.length, supply_rows: dtl.length, supply_fields: Object.keys(dtl[0] || {}) } }));
  return { calls: c.state.calls, records: rows.length };
}

async function main() {
  const a = process.argv.slice(2), opt = (n, d) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : d; };
  const month = opt('month', '2026-10'), source = opt('source', 'all'), to = opt('to', '2026-10-11'), from = opt('from', '2024-01-01'), supplyCap = Number(opt('supply-cap', '600'));
  if (!/^\d{4}-\d{2}$/.test(month) || !['myhome', 'lh-notice', 'all'].includes(source)) throw new Error('사용: --month YYYY-MM --source myhome|lh-notice|all');
  const outRoot = path.join(ROOT, 'schemas', `ledger-${month}`, 'raw'), key = loadKey();
  if (source !== 'lh-notice') console.log('myhome', await collectMyhome({ key, month, outRoot }));
  if (source !== 'myhome') console.log('lh-notice', await collectLh({ key, month, outRoot, from, to, supplyCap, reuseList: a.includes('--reuse-list') }));
}
module.exports = { pageCount, splitWindows, wantsSupply, pickSupplyTargets, countBy, manifest };
if (require.main === module) main().catch((e) => { console.error(String(e.message || e).replace(/serviceKey=[^&\s]+/g, 'serviceKey=***')); process.exit(1); });
