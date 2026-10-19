#!/usr/bin/env node
/* LH 분양임대공고문(15058530)+공급정보(15056765) 2019~2023 공고 수집 — 연구 폴더 전용.
   tools/ledger/collect-national.js 의 요청 모양·한도(110ms 순차, PER_SECOND 25초 대기)를 따르되 출력은 docs/speech/research/05.공급/원본/api/lh-notice-2019-2023/ 만 쓴다.
   사용: node tools/research/chain/collect_lh_history.js [--cap 1500]   시험: tests/js/research-lh-history.test.cjs */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const OUT_DIR = path.join(ROOT, 'docs', 'speech', 'research', '05.공급', '원본', 'api', 'lh-notice-2019-2023');
const FROM = '2019-01-01', TO = '2023-12-31';
const { splitWindows, wantsSupply, pickSupplyTargets, pageCount, countBy } = require('../../ledger/collect-national.js');
const LH_TYPES = ['05', '06', '13', '39', '54'];
const PAGE_ROWS = 100, SPACING_MS = 110, THROTTLE_WAIT_MS = 25000;

function assertSafeOut(dir) {
  const rel = path.relative(ROOT, path.resolve(dir));
  if (rel.startsWith('..') || rel.split(path.sep)[0] === 'schemas') throw new Error('출력 경로 불가: ' + rel);
  if (!rel.startsWith(path.join('docs', 'speech', 'research'))) throw new Error('연구 폴더 밖: ' + rel);
  return path.resolve(dir);
}
const ymd = (iso) => iso.replace(/-/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mask = (s) => String(s).replace(/serviceKey=[^&\s]+/g, 'serviceKey=***');
function loadKey() {
  const file = path.join(ROOT, '.env.local');
  const t = process.env.DATA_GO_KR_KEY ?? (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').match(/^DATA_GO_KR_KEY=(.*)$/m)?.[1] : null);
  if (!t) throw new Error('DATA_GO_KR_KEY 없음');
  return t.replace(/^["']|["']$/g, '').split(',')[0].trim();
}
const write = (dir, name, obj) => { fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true }); fs.writeFileSync(path.join(dir, name), JSON.stringify(obj, null, 1) + '\n'); };

async function main() {
  const cap = Number(process.argv[process.argv.indexOf('--cap') + 1]) || 1500;
  const dir = assertSafeOut(OUT_DIR), key = loadKey(), L = require('../../../lib/lhnotice.js');
  const state = { calls: 0 }; let last = 0;
  const doFetch = async (url, opts) => { const at = Math.max(Date.now(), last + SPACING_MS); last = at; state.calls++; if (at > Date.now()) await sleep(at - Date.now()); return fetch(url, opts); };
  const lsleep = (ms) => sleep(ms >= 1000 && ms < THROTTLE_WAIT_MS ? THROTTLE_WAIT_MS : ms);
  const badPages = [], windows = splitWindows(FROM, TO), byId = new Map(), perType = {}; let pages = 0;
  for (const tp of LH_TYPES) {
    perType[tp] = 0;
    for (const w of windows) {
      let total = null;
      for (let page = 1; ; page++) {
        const base = { serviceKey: key, PAN_ST_DT: ymd(w.from), PAN_ED_DT: ymd(w.to), UPP_AIS_TP_CD: tp };
        const take = (json, name) => { write(dir, `pages/${name}.json`, json); const got = L.listOf(json); pages++; if (total === null) total = got.total; for (const r of got.rows) if (!byId.has(r.PAN_ID)) { byId.set(r.PAN_ID, r); perType[tp]++; } return got; };
        const tag = `list-${tp}-${w.from.slice(0, 4)}`;
        try {
          const got = take(await L.fetchLh({ doFetch, sleep: lsleep, url: L.LIST_URL, attempts: 6, params: { ...base, PG_SZ: String(PAGE_ROWS), PAGE: String(page) } }), `${tag}-p${page}`);
          if (!got.rows.length || page >= pageCount(got.total)) break;
        } catch (e) {
          if (e.quota || !/^SS_CODE/.test(e.message)) throw e;
          // API 가 특정 쪽만 SS_CODE N 을 돌려준다(예: 유형 13·2022 의 3쪽). 작은 쪽 크기(25)로 같은 행 범위를 다시 받는다
          badPages.push({ type: tp, year: w.from.slice(0, 4), page, error: e.message });
          for (let k = 4 * (page - 1) + 1; k <= 4 * page; k++) {
            try { take(await L.fetchLh({ doFetch, sleep: lsleep, url: L.LIST_URL, attempts: 6, params: { ...base, PG_SZ: '25', PAGE: String(k) } }), `${tag}-sz25-p${k}`); }
            catch (e2) { if (e2.quota) throw e2; badPages.push({ type: tp, year: w.from.slice(0, 4), page: `sz25-${k}`, error: e2.message }); }
          }
          if (total !== null && page >= pageCount(total)) break;
          if (total === null) throw e;
        }
      }
    }
  }
  const rows = [...byId.values()];
  write(dir, 'notices.json', { window: { from: FROM, to: TO }, types: LH_TYPES, items: rows });
  const targets = pickSupplyTargets(rows, cap), done = new Map(), failed = [];
  for (const r of targets) {
    try {
      const json = await L.fetchLh({ doFetch, sleep: lsleep, url: L.SUPPLY_URL, attempts: 6, params: { serviceKey: key, PAN_ID: r.PAN_ID, SPL_INF_TP_CD: r.SPL_INF_TP_CD, CCR_CNNT_SYS_DS_CD: r.CCR_CNNT_SYS_DS_CD, UPP_AIS_TP_CD: r.UPP_AIS_TP_CD } });
      done.set(r.PAN_ID, { PAN_ID: r.PAN_ID, response: json });
    } catch (e) { failed.push({ PAN_ID: r.PAN_ID, error: mask(e.message) }); }
    if ((done.size + failed.length) % 100 === 0) console.log('supply', done.size + failed.length, '/', targets.length, 'calls', state.calls);
  }
  write(dir, 'supply.json', { count: done.size, failed, items: [...done.values()] });
  write(dir, 'manifest.json', {
    source: 'LH 분양임대공고문(15058530) + 공급정보(15056765) — 2019~2023 연구용 수집', fetched_at: new Date().toISOString(),
    endpoint: [L.LIST_URL, L.SUPPLY_URL],
    params: { PG_SZ: PAGE_ROWS, PAN_ST_DT: ymd(FROM), PAN_ED_DT: ymd(TO), UPP_AIS_TP_CD: LH_TYPES, windows, PAN_SS: '(생략=전체 상태)' },
    calls: state.calls, pages, records: rows.length,
    notes: `유형별·연도 창별 전 쪽 수집 후 PAN_ID 중복 제거. 공급정보는 wantsSupply 규칙, 공고일 최신 순 상한 ${cap}건(대상 ${targets.length}, 성공 ${done.size}, 실패 ${failed.length}).`,
    by_type: perType, by_year: countBy(rows, (r) => String(r.PAN_NT_ST_DT || '').slice(0, 4)),
    bad_pages: badPages, supply_targets: targets.length, supply_ok: done.size, supply_failed: failed.length,
    supply_by_year: countBy(targets.filter((t) => done.has(t.PAN_ID)), (r) => String(r.PAN_NT_ST_DT || '').slice(0, 4)),
  });
  console.log('done', { calls: state.calls, pages, records: rows.length, supply: done.size, failed: failed.length });
}
module.exports = { assertSafeOut, OUT_DIR, ROOT };
if (require.main === module) main().catch((e) => { console.error(mask(e.message || e)); process.exit(1); });
