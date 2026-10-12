#!/usr/bin/env node
/* 한국부동산원 청약홈 분양정보(공공데이터포털 15098547, api.odcloud.kr) 전국·전 기간 원본 수집(원장 변환 없음).
   오퍼레이션 10개: Detail 5(APT·무순위/잔여·오피스텔 등 공고) + Mdl 5(주택형별 공급내역). 기간 조건 없이 모든 쪽을 받는다.
   결과: <out>/<오퍼레이션>.json({operation, totalCount, rows}, 한 행 한 줄) + manifest.json. 키(DATA_GO_KR_KEY, 환경변수 또는 .env.local)는 어디에도 쓰지 않는다.
   사용: node tools/ledger/collect-applyhome.js [--out schemas/ledger-2026-10/raw/applyhome] [--service detail|cmpet] [--only getAPTLttotPblancDetail,...] [--probe]
   --probe 는 첫 쪽(perPage=1)만 불러 totalCount 만 출력(파일 쓰지 않음). 한도: 호출 사이 250 ms, 순차, 오류·429 는 쉬었다 최대 3회 다시. */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
/* --service detail(기본, 분양정보 15098547) | cmpet(경쟁률·특별공급 신청현황 15098905, 오퍼레이션 8개, 기본 out = raw/applyhome-cmpet) */
const SERVICES = {
  detail: {
    base: 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/', out: 'schemas/ledger-2026-10/raw/applyhome', source: '한국부동산원 청약홈 분양정보 조회 서비스(15098547)',
    operations: ['getAPTLttotPblancDetail', 'getUrbtyOfctlLttotPblancDetail', 'getRemndrLttotPblancDetail', 'getPblPvtRentLttotPblancDetail', 'getOPTLttotPblancDetail',
      'getAPTLttotPblancMdl', 'getUrbtyOfctlLttotPblancMdl', 'getRemndrLttotPblancMdl', 'getPblPvtRentLttotPblancMdl', 'getOPTLttotPblancMdl'],
    notes: '오퍼레이션별 전 쪽 수집(rows 는 원천 행 그대로, 값 변환 없음). Detail 5개는 모집공고일(RCRIT_PBLANC_DE) 범위를 기록하고 Mdl 5개는 공고일이 없다(HOUSE_MANAGE_NO·PBLANC_NO 로 Detail 과 잇는다).',
  },
  cmpet: {
    base: 'https://api.odcloud.kr/api/ApplyhomeInfoCmpetRtSvc/v1/', out: 'schemas/ledger-2026-10/raw/applyhome-cmpet', source: '한국부동산원 청약홈 청약접수 경쟁률 및 특별공급 신청현황 조회 서비스(15098905)',
    operations: ['getAPTLttotPblancCmpet', 'getUrbtyOfctlLttotPblancCmpet', 'getPblPvtRentLttotPblancCmpet', 'getCancResplLttotPblancCmpet', 'getRemndrLttotPblancCmpet', 'getAptLttotPblancScore', 'getOPTLttotPblancCmpet', 'getAPTSpsplyReqstStus'],
    notes: '오퍼레이션별 전 쪽 수집(rows 는 원천 행 그대로, 값 변환 없음). 분양정보와는 HOUSE_MANAGE_NO·PBLANC_NO 로 잇는다. 경쟁률 행에는 공고일이 없어 earliest·latest 는 null.',
  },
};
const PAGE_ROWS = 1000;
const SPACING_MS = 250;
const RETRY_WAIT_MS = 5000;
const RETRIES = 3;

/* ---- 순수 함수 ---- */
const pageCount = (total, size = PAGE_ROWS) => (total > 0 ? Math.ceil(total / size) : 0);
const countBy = (rows, fn) => { const m = {}; for (const r of rows) { const k = fn(r) || '(없음)'; m[k] = (m[k] || 0) + 1; } return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1])); };
/* 모집공고일 가장 이른/늦은 값(Mdl 에는 공고일이 없어 null) */
function dateRange(rows) {
  const ds = rows.map((r) => String(r.RCRIT_PBLANC_DE || '')).filter(Boolean).sort();
  return { earliest: ds[0] || null, latest: ds[ds.length - 1] || null };
}
/* 한 줄에 한 행: JSON 한 벌이되 rows 만 줄 단위 */
const serialize = (operation, totalCount, rows) => `{"operation":${JSON.stringify(operation)},"totalCount":${totalCount},"rows":[\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`;

/* ---- 실행부 ---- */
function loadKey() {   // 환경변수 먼저, 없으면 .env.local
  const file = path.join(ROOT, '.env.local');
  const t = process.env.DATA_GO_KR_KEY ?? (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').match(/^DATA_GO_KR_KEY=(.*)$/m)?.[1] : null);
  if (!t) throw new Error('DATA_GO_KR_KEY 없음');
  return t.replace(/^["']|["']$/g, '').split(',')[0].trim();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function makeCaller(key, BASE) {
  const state = { calls: 0 };
  let last = 0;
  async function getPage(op, page, perPage) {
    const qs = new URLSearchParams({ serviceKey: key, page: String(page), perPage: String(perPage), returnType: 'JSON' });
    for (let attempt = 1; ; attempt++) {
      const at = Math.max(Date.now(), last + SPACING_MS); last = at;
      if (at > Date.now()) await sleep(at - Date.now());
      state.calls++;
      try {
        const res = await fetch(`${BASE}${op}?${qs}`, { signal: AbortSignal.timeout(30000) });
        if (res.ok) return await res.json();
        throw new Error(`HTTP ${res.status}`);
      } catch (e) {
        if (attempt > RETRIES) throw new Error(`${op} page ${page}: ${e.message}`);
        await sleep(RETRY_WAIT_MS * attempt);
      }
    }
  }
  return { state, getPage };
}

async function main() {
  const a = process.argv.slice(2), opt = (n, d) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : d; };
  const svc = SERVICES[opt('service', 'detail')];
  if (!svc) throw new Error(`알 수 없는 service: ${opt('service')}`);
  const { base: BASE, operations: OPERATIONS } = svc;
  const out = path.resolve(ROOT, opt('out', svc.out));
  const only = opt('only', '') ? opt('only').split(',') : OPERATIONS;
  const bad = only.filter((o) => !OPERATIONS.includes(o));
  if (bad.length) throw new Error(`알 수 없는 오퍼레이션: ${bad.join(',')}`);
  const c = makeCaller(loadKey(), BASE);
  if (a.includes('--probe')) {
    for (const op of only) { const j = await c.getPage(op, 1, 1); console.log(op, 'totalCount', j.totalCount, 'matchCount', j.matchCount, 'fields', Object.keys(j.data[0] || {}).length); }
    console.log('calls', c.state.calls);
    return;
  }
  fs.mkdirSync(out, { recursive: true });
  const per = {}; let records = 0, pages = 0;
  for (const op of only) {
    const rows = []; let total = 0, calls = 0;
    for (let page = 1; ; page++) {
      const j = await c.getPage(op, page, PAGE_ROWS);
      calls++; pages++; total = j.totalCount; rows.push(...j.data);
      if (!j.data.length || page >= pageCount(total)) break;
    }
    fs.writeFileSync(path.join(out, `${op}.json`), serialize(op, total, rows));
    per[op] = { totalCount: total, rows: rows.length, calls, fields: Object.keys(rows[0] || {}), ...dateRange(rows) };
    records += rows.length;
    console.log(op, total, rows.length, calls);
  }
  const mf = path.join(out, 'manifest.json');
  const prev = fs.existsSync(mf) && only.length < OPERATIONS.length ? JSON.parse(fs.readFileSync(mf, 'utf8')) : null;   // --only 일 때 다른 오퍼레이션 기록은 보존
  const operations = { ...(prev ? prev.operations : {}), ...per };
  fs.writeFileSync(mf, JSON.stringify({ source: svc.source, fetched_at: new Date().toISOString(), endpoint: OPERATIONS.map((o) => BASE + o),
    params: { page: '1..N', perPage: PAGE_ROWS, returnType: 'JSON', cond: '(없음=전체 기간·전국)' }, calls: (prev ? prev.calls : 0) + c.state.calls, pages: (prev ? prev.pages : 0) + pages, records: Object.values(operations).reduce((s, o) => s + o.rows, 0),
    notes: svc.notes,
    operations }, null, 1) + '\n');
}
module.exports = { pageCount, countBy, dateRange, serialize };
if (require.main === module) main().catch((e) => { console.error(String(e.message || e).replace(/serviceKey=[^&\s]+/g, 'serviceKey=***')); process.exit(1); });
