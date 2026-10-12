#!/usr/bin/env node
/* LH 분양임대공고별 상세정보(공공데이터포털 15057999 lhLeaseNoticeDtlInfo1) 수집(연계·변환 없음). 입력은 raw/lh-notice/notices.json 의 주택 공고(UPP_AIS_TP_CD 05·06·13·39·54).
   결과: schemas/ledger-2026-10/raw/lh-notice-detail/details.json(한 행 한 줄, response 는 원본 그대로) + manifest.json. 키(DATA_GO_KR_KEY)는 어디에도 쓰지 않는다.
   사용: node tools/ledger/collect-lh-notice-detail.js [--out <폴더>] [--limit N]   (대상이 9,000 을 넘으면 공고일 최신부터 9,000)
   한도: 호출 간격 150 ms 이상, 동시 2건 이하, 오류는 쉬었다 최대 3회. 시험: 없음 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const URL_BASE = 'https://apis.data.go.kr/B552555/lhLeaseNoticeDtlInfo1/getLeaseNoticeDtlInfo1';
const LIST_FILE = path.join(ROOT, 'schemas', 'ledger-2026-10', 'raw', 'lh-notice', 'notices.json');
const HOUSING = new Set(['05', '06', '13', '39', '54']);   // lib/lhnotice.js KIND_OF 와 같다. 토지(01)·상가(22) 등은 뺀다
const MAX_TARGETS = 9000, SPACING_MS = 150, CONCURRENCY = 2, ATTEMPTS = 3, TIMEOUT_MS = 20000;
const PARAMS = ['PAN_ID', 'SPL_INF_TP_CD', 'CCR_CNNT_SYS_DS_CD', 'UPP_AIS_TP_CD', 'AIS_TP_CD'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const scrub = (s) => String(s).replace(/serviceKey=[^&\s"]+/g, 'serviceKey=***');
function loadKey() {
  const file = path.join(ROOT, '.env.local');
  const t = process.env.DATA_GO_KR_KEY ?? (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').match(/^DATA_GO_KR_KEY=(.*)$/m)?.[1] : null);
  if (!t) throw new Error('DATA_GO_KR_KEY 없음');
  return t.replace(/^["']|["']$/g, '').split(',')[0].trim();
}

/* ---- 순수 함수 ---- */
/* 목록 행 → 대상(주택만, PAN_ID 중복 제거, 공고일 최신 순, 상한 cap). skipped 는 뺀 수 */
function pickTargets(items, cap = MAX_TARGETS) {
  const seen = new Set(), out = []; let notHousing = 0, dup = 0;
  for (const r of [...items].sort((a, b) => String(b.PAN_NT_ST_DT || '').localeCompare(String(a.PAN_NT_ST_DT || '')))) {
    if (!HOUSING.has(String(r.UPP_AIS_TP_CD))) { notHousing++; continue; }
    if (!r.PAN_ID || seen.has(r.PAN_ID)) { dup++; continue; }
    seen.add(r.PAN_ID); out.push(r);
  }
  return { targets: out.slice(0, cap), notHousing, dup, overCap: Math.max(0, out.length - cap) };
}
const isLabelBlock = (k) => /Nm$/.test(k) || k === 'resHeader';   // dsSbdNm·dsAhflInfoNm 처럼 Nm 으로 끝나는 블록 = 필드 이름의 한글 설명표(값이 '단지명'·'단지주소' 등). 데이터는 dsSbd·dsAhflInfo
const dataBlocks = (resp) => (Array.isArray(resp) ? resp.filter((b) => b && typeof b === 'object' && !b.dsSch).flatMap((b) => Object.entries(b)).filter(([k]) => !isLabelBlock(k)) : []);
const realRows = (rows) => (Array.isArray(rows) ? rows.filter((r) => r && typeof r === 'object') : []);
const blockRows = (resp, name) => dataBlocks(resp).filter(([k]) => k === name).flatMap(([, v]) => realRows(v));
/* 응답에 실제 내용이 하나라도 있나 */
const hasContent = (resp) => dataBlocks(resp).some(([, v]) => realRows(v).some((r) => Object.values(r).some((x) => String(x ?? '').trim())));

/* ---- 실행부 ---- */
async function fetchDetail(key, row, state) {
  const q = new URLSearchParams({ serviceKey: key });
  for (const p of PARAMS) if (row[p] != null && row[p] !== '') q.set(p, String(row[p]));
  let last = '응답 없음';
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (attempt) await sleep(1500 * attempt);
    const at = Math.max(Date.now(), state.last + SPACING_MS); state.last = at;   // 동시 호출도 간격을 지키도록 시각을 먼저 예약
    if (at > Date.now()) await sleep(at - Date.now());
    state.calls++;
    let r, text;
    try { r = await fetch(`${URL_BASE}?${q}`, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'application/json' } }); text = await r.text(); } catch (e) { last = 'network'; continue; }
    if (/SERVICE_KEY_IS_NOT_REGISTERED|SERVICE KEY IS NOT REGISTERED|UNREGISTERED|SERVICE_ACCESS_DENIED/i.test(text)) { const e = new Error('키 미등록'); e.unregistered = true; throw e; }
    if (/LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS|REQUESTS_PER_SECOND/i.test(text)) { last = '호출 한도'; await sleep(5000); continue; }
    if (!r.ok) { last = `HTTP ${r.status}`; continue; }
    let json; try { json = JSON.parse(text); } catch (e) { last = 'JSON 아님'; continue; }
    if (!Array.isArray(json)) { last = '응답 모양 이상'; continue; }
    return { request: Object.fromEntries(PARAMS.map((p) => [p, row[p] ?? null])), response: json };
  }
  throw new Error(last);
}
const countBy = (arr) => { const m = {}; for (const k of arr) m[k] = (m[k] || 0) + 1; return m; };
function save(dir, name, obj) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, name), obj); }

async function main() {
  const a = process.argv.slice(2), opt = (n, d) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : d; };
  const outDir = path.resolve(opt('out', path.join(ROOT, 'schemas', 'ledger-2026-10', 'raw', 'lh-notice-detail'))), limit = Number(opt('limit', '0')) || 0;
  const key = loadKey(), list = JSON.parse(fs.readFileSync(LIST_FILE, 'utf8')).items;
  const pick = pickTargets(list), targets = limit ? pick.targets.slice(0, limit) : pick.targets;
  console.log('목록', list.length, '대상', targets.length, '주택 아님', pick.notHousing, '중복', pick.dup, '상한 초과', pick.overCap);
  const state = { calls: 0, last: 0 }, results = new Map(), failed = [];
  let next = 0, fatal = null;
  // 첫 호출이 키 미등록이면 아무것도 쓰지 않고 끝낸다
  try { const first = targets[next++]; results.set(first.PAN_ID, await fetchDetail(key, first, state)); } catch (e) { if (e.unregistered) { console.log('키 미등록: 수집하지 않음'); return; } failed.push({ PAN_ID: targets[0].PAN_ID, error: scrub(e.message) }); }
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < targets.length && !fatal) {
      const r = targets[next++];
      try { results.set(r.PAN_ID, await fetchDetail(key, r, state)); } catch (e) { if (e.unregistered) { fatal = e; return; } failed.push({ PAN_ID: r.PAN_ID, error: scrub(e.message) }); }
      if ((results.size + failed.length) % 250 === 0) console.log(results.size + failed.length, '/', targets.length, 'calls', state.calls, 'failed', failed.length);
    }
  }));
  if (fatal) throw fatal;
  const rows = targets.filter((t) => results.has(t.PAN_ID)).map((t) => ({ PAN_ID: t.PAN_ID, ...results.get(t.PAN_ID) }));
  const ok = rows.filter((r) => hasContent(r.response)), empty = rows.length - ok.length;
  const blocks = {};
  for (const r of rows) for (const [k, v] of dataBlocks(r.response)) { const b = blocks[k] || (blocks[k] = { rows: 0, fields: new Set() }); for (const x of realRows(v)) { b.rows++; Object.keys(x).forEach((f) => b.fields.add(f)); } }
  const filled = (blk, ...fs_) => rows.filter((r) => blockRows(r.response, blk).some((x) => fs_.some((f) => String(x[f] ?? '').trim()))).length;
  const lines = rows.map((r) => ' ' + JSON.stringify(r)).join(',\n');
  save(outDir, 'details.json', `{"operation":"getLeaseNoticeDtlInfo1","requested":${targets.length},"ok":${ok.length},"empty":${empty},"failed":${failed.length},"failed_list":${JSON.stringify(failed)},"rows":[\n${lines}\n]}\n`);
  save(outDir, 'manifest.json', JSON.stringify({
    source: 'LH 분양임대공고별 상세정보(15057999 lhLeaseNoticeDtlInfo1)', fetched_at: new Date().toISOString(), endpoint: URL_BASE,
    params: { input: PARAMS, from: 'raw/lh-notice/notices.json 목록 행의 값', UPP_AIS_TP_CD: [...HOUSING], max_targets: MAX_TARGETS, spacing_ms: SPACING_MS, concurrency: CONCURRENCY },
    calls: state.calls, pages: state.calls, records: rows.length,
    notes: `주택 공고(05·06·13·39·54)만 공고일 최신 순으로 호출(목록 ${list.length}행 중 대상 ${targets.length}, 주택 아님 ${pick.notHousing}, 중복 ${pick.dup}, 상한 초과 ${pick.overCap}). 응답은 원본 그대로. 블록 이름이 Nm 으로 끝나는 것(dsSbdNm 등)은 필드 이름의 한글 설명표(값이 '단지명'·'단지주소' 등)라 내용·채움 수에서 뺀다(원본에는 그대로 있다). ok=설명표 아닌 블록에 값이 있는 응답, empty=그 외.`,
    requested: targets.length, ok: ok.length, empty, failed: failed.length, failed_list: failed.slice(0, 50),
    blocks: Object.fromEntries(Object.entries(blocks).map(([k, b]) => [k, { rows: b.rows, fields: [...b.fields] }])),
    filled: { 단지주소_LGDN_ADR_or_LCT_ARA_ADR: filled('dsSbd', 'LGDN_ADR', 'LCT_ARA_ADR'), 입주예정월_MVIN_XPC_YM: filled('dsSbd', 'MVIN_XPC_YM'), 세대수_HSH_CNT_or_SUM_TOT_HSH_CNT: filled('dsSbd', 'HSH_CNT', 'SUM_TOT_HSH_CNT'), 단지명_LCC_NT_NM_or_BZDT_NM: filled('dsSbd', 'LCC_NT_NM', 'BZDT_NM'), 공고문파일_AHFL_URL: filled('dsAhflInfo', 'AHFL_URL') },
    by_AIS_TP_CD_NM: countBy(targets.map((t) => t.AIS_TP_CD_NM || '(없음)')),
  }, null, 1) + '\n');
  console.log({ requested: targets.length, ok: ok.length, empty, failed: failed.length, calls: state.calls });
}
module.exports = { pickTargets, hasContent, realRows };
if (require.main === module) main().catch((e) => { console.error(scrub(e.message || e)); process.exit(1); });
