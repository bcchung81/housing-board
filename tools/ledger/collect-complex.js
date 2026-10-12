#!/usr/bin/env node
/* ⑥입주 단계 '단지' 원천 4가지 전국 원본 수집(원장 연계 없음). 공공데이터포털 OpenAPI.
   --source kapt      K-apt 공동주택 단지 목록(15057332) getTotalAptList4 → raw/kapt-list (+ 기본정보 15058453 getAphusBassInfoV5 를 kaptCode 3개로만 불러 응답 필드 이름을 notes 에 기록)
   --source myhome    마이홈 공공임대주택 단지정보(15110581) rentalHouseGwList → raw/myhome-complex (시도+시군구 코드 둘 다 필수 → 시군구마다 전 쪽)
   --source lh-public LH 공공임대주택 단지정보(15058476) data.myhome.go.kr:443/rentalHouseList → raw/lh-public-complex (myhome 과 같은 요청)
   --source lh-lease  LH 임대주택단지 조회(15059475) lhLeaseInfo1 → raw/lh-lease-complex (지역 코드 없이 전국 한 번에)
   결과: <out>/<오퍼레이션>.json({operation, totalCount, rows}, 한 행 한 줄) + manifest.json. 키(DATA_GO_KR_KEY, 환경변수 또는 .env.local)는 어디에도 쓰지 않는다.
   사용: node tools/ledger/collect-complex.js --source kapt|myhome|lh-public|lh-lease [--out <폴더>] [--probe]
   --probe 는 첫 호출만 해서 totalCount 를 출력(파일 쓰지 않음). 한도: 호출 사이 250 ms, 순차, 오류는 쉬었다 최대 3회 다시, 키 미등록은 바로 중단. */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const LEGAL_DONG = 'schemas/ledger-2026-10/raw/legal-dong/국토교통부_법정동코드_20260929.csv';
const SPACING_MS = 250;
const RETRY_WAIT_MS = 5000;
const RETRIES = 3;
const MAX_CALLS = 900;   // 마이홈·LH 공공임대 일 한도 1,000 에서 여유

const SOURCES = {
  kapt: {
    base: 'https://apis.data.go.kr/1613000/AptListService4/', op: 'getTotalAptList4', out: 'schemas/ledger-2026-10/raw/kapt-list', pageRows: 5000, id: 'kaptCode', sido: (r) => r.as1,
    source: '국토교통부 공동주택 단지 목록제공 서비스(15057332, K-apt)',
    notes: '전국 모든 단지 코드·단지명·법정동코드(bjdCode)·시도~리 이름. 한 번에 numOfRows=5000 으로 전 쪽. rows 는 원천 행 그대로.',
  },
  myhome: {
    base: 'https://apis.data.go.kr/1613000/HWSPR04/', op: 'rentalHouseGwList', out: 'schemas/ledger-2026-10/raw/myhome-complex', pageRows: 5000, id: 'hsmpSn', sido: (r) => r.brtcNm,
    source: '국토교통부 마이홈포털 공공임대주택 단지정보 조회 서비스(15110581)',
    notes: 'brtcCode(2자리)+signguCode(3자리)가 둘 다 필수라 시군구(법정동코드 파일의 존재하는 5자리 시군구 코드)마다 전 쪽을 받아 rows 에 합쳤다. 행은 단지×주택형(styleNm) 단위라 hsmpSn 이 여러 행에 반복된다. 시군구 코드의 자료 없음(03)은 0건으로 센다.',
  },
  'lh-public': {
    base: 'https://data.myhome.go.kr:443/', op: 'rentalHouseList', out: 'schemas/ledger-2026-10/raw/lh-public-complex', pageRows: 5000, id: 'hsmpSn', sido: (r) => r.brtcNm,
    source: '한국토지주택공사 공공임대주택 단지정보(15058476, 마이홈포털)',
    notes: '요청 변수는 마이홈 단지정보와 같다(brtcCode·signguCode·numOfRows·pageNo).',
  },
  'lh-lease': {
    base: 'https://apis.data.go.kr/B552555/lhLeaseInfo1/', op: 'lhLeaseInfo1', out: 'schemas/ledger-2026-10/raw/lh-lease-complex', pageRows: 10000, id: 'SBD_LGO_NM', sido: (r) => String(r.ARA_NM || '').split(' ')[0],
    source: '한국토지주택공사 임대주택단지 조회 서비스(15059475)',
    notes: 'CNP_CD·SPL_TP_CD 는 선택이라 비우고 PG_SZ=10000 으로 전국 전 쪽. 행은 단지×전용면적 단위(총세대수 SUM_HSH_CNT, 전체 행수 ALL_CNT). 응답에 단지 코드·법정동코드·PNU 가 없고 지역명(ARA_NM)만 있다. totalCount 는 첫 행의 ALL_CNT.',
  },
};

/* ---- 순수 함수 ---- */
const countBy = (rows, fn) => { const m = {}; for (const r of rows) { const k = fn(r) || '(없음)'; m[k] = (m[k] || 0) + 1; } return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1])); };
const distinct = (rows, field) => new Set(rows.map((r) => r[field])).size;
/* 한 줄에 한 행: JSON 한 벌이되 rows 만 줄 단위 */
const serialize = (operation, totalCount, rows) => `{"operation":${JSON.stringify(operation)},"totalCount":${totalCount},"rows":[\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`;
/* 법정동코드 CSV(EUC-KR 또는 UTF-8) → 존재하는 시군구 [시도2, 시군구3] (시도 자체 제외; 끝자리가 0 이 아닌 일반구 코드 포함) */
function sigunguCodes(buf, all = false) {   // all=true 면 폐지 행도 포함(옛 코드 시험용)
  let text = new TextDecoder('utf-8', { fatal: true });
  try { text = text.decode(buf); } catch { text = new TextDecoder('euc-kr').decode(buf); }
  const out = [];
  for (const line of text.split(/\r?\n/).slice(1)) {
    const [code, , state] = line.split(',');
    if (/^\d{10}$/.test(code || '') && code.endsWith('00000') && !code.endsWith('00000000') && (state === '존재' || all))  out.push([code.slice(0, 2), code.slice(2, 5)]);
  }
  return out;
}

/* ---- 실행부 ---- */
class KeyNotRegistered extends Error {}
function loadKey() {   // 환경변수 먼저, 없으면 .env.local
  const file = path.join(ROOT, '.env.local');
  const t = process.env.DATA_GO_KR_KEY ?? (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').match(/^DATA_GO_KR_KEY=(.*)$/m)?.[1] : null);
  if (!t) throw new Error('DATA_GO_KR_KEY 없음');
  return t.replace(/^["']|["']$/g, '').split(',')[0].trim();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function makeCaller(key) {
  const state = { calls: 0 };
  let last = 0;
  /* 정상(자료 없음 포함)이면 JSON, 키 미등록이면 KeyNotRegistered, 그 밖의 오류는 쉬었다 다시 */
  async function get(url, params) {
    const qs = new URLSearchParams({ serviceKey: key, ...params });
    for (let attempt = 1; ; attempt++) {
      const at = Math.max(Date.now(), last + SPACING_MS); last = at;
      if (at > Date.now()) await sleep(at - Date.now());
      state.calls++;
      try {
        const res = await fetch(`${url}?${qs}`, { signal: AbortSignal.timeout(60000) });
        const text = await res.text();
        if (/SERVICE[_ ]KEY[_ ]IS[_ ]NOT[_ ]REGISTERED/i.test(text)) throw new KeyNotRegistered('키 미등록(SERVICE KEY IS NOT REGISTERED)');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = JSON.parse(text);
        const code = j?.response?.header?.resultCode;
        if (code && code !== '00' && code !== '03') throw new Error(`resultCode ${code} ${j.response.header.resultMsg}`);
        return j;
      } catch (e) {
        if (e instanceof KeyNotRegistered || attempt > RETRIES) throw e instanceof KeyNotRegistered ? e : new Error(`${url} ${JSON.stringify(params)}: ${e.message}`);
        await sleep(RETRY_WAIT_MS * attempt);
      }
    }
  }
  return { state, get };
}
const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);

/* 한 소스의 요청 단위들을 돌며 [{rows,total}] 반환 */
async function fetchKapt(c, s, probe) {
  const rows = []; let total = 0;
  for (let page = 1; ; page++) {
    const b = (await c.get(s.base + s.op, { numOfRows: s.pageRows, pageNo: page })).response.body;
    total = Number(b.totalCount); rows.push(...asList(b.items?.item ?? b.items));
    if (probe || rows.length >= total || !asList(b.items).length) break;
  }
  return { rows, total, units: 'numOfRows=5000 전 쪽(전국 한 요청 단위)' };
}
async function fetchMyhome(c, s, probe, only) {
  const pairs = only || sigunguCodes(fs.readFileSync(path.join(ROOT, LEGAL_DONG)));
  if (pairs.length > MAX_CALLS) throw new Error(`호출 어림 ${pairs.length} > ${MAX_CALLS}: 멈춤`);
  const rows = [], requests = {}; let total = 0, nodata = 0;
  for (const [brtcCode, signguCode] of pairs) {
    let got = 0, unit = 0;
    for (let page = 1; ; page++) {
      const j = await c.get(s.base + s.op, { brtcCode, signguCode, numOfRows: s.pageRows, pageNo: page });
      const b = j.response.body;
      if (!b) { nodata++; requests[brtcCode + signguCode] = 0; break; }
      unit = Number(b.totalCount); const items = asList(b.item); rows.push(...items); got += items.length;
      if (got >= unit || !items.length) break;
    }
    if (got !== unit) throw new Error(`${brtcCode}-${signguCode}: totalCount ${unit} 와 받은 행 ${got} 다름`);
    total += unit; requests[brtcCode + signguCode] = unit;
    if (c.state.calls > MAX_CALLS) throw new Error('호출 900 초과: 멈춤');
    if (probe) break;
  }
  return { rows, total, units: `시도+시군구 ${pairs.length}곳(자료 없음 ${nodata}곳), 곳마다 numOfRows=${s.pageRows} 전 쪽`, requests };
}
async function fetchLease(c, s, probe) {
  const rows = []; let total = 0;
  for (let page = 1; ; page++) {
    const j = await c.get(s.base + s.op, { PG_SZ: s.pageRows, PAGE: page });
    const list = j[1]?.dsList || [];
    rows.push(...list);
    if (page === 1) total = Number(list[0]?.ALL_CNT || 0);
    if (probe || list.length < s.pageRows) break;
  }
  return { rows, total, units: 'PG_SZ=10000 전 쪽(전국 한 요청 단위)' };
}

/* --merge-from <폴더>: 다른 폴더에서 받은 시군구 요청(--codes)을 <out> 의 기존 결과에 합친다. 전체 필드가 같은 행은 넣지 않는다. 호출은 하지 않는다 */
function mergeFrom(s, out, from) {
  const read = (d) => ({ m: JSON.parse(fs.readFileSync(path.join(d, 'manifest.json'), 'utf8')), j: JSON.parse(fs.readFileSync(path.join(d, `${s.op}.json`), 'utf8')) });
  const a = read(out), b = read(from);
  const seen = new Set(a.j.rows.map((r) => JSON.stringify(r)));
  let added = 0, dup = 0;
  for (const r of b.j.rows) { const k = JSON.stringify(r); if (seen.has(k)) dup++; else { seen.add(k); a.j.rows.push(r); added++; } }
  const rows = a.j.rows, ao = a.m.operations[s.op], bo = b.m.operations[s.op];
  const requests = { ...(ao.requests || countBy(a.j.rows, (r) => r.brtcCode + r.signguCode)), ...bo.requests };
  const total = Object.values(requests).reduce((x, y) => x + y, 0);
  const ids = distinct(rows, s.id);
  fs.writeFileSync(path.join(out, `${s.op}.json`), serialize(s.op, total, rows));
  Object.assign(ao, { totalCount: total, rows: rows.length, calls: ao.calls + bo.calls, fields: [...new Set(rows.flatMap((x) => Object.keys(x)))], idDistinct: ids, idRepeatRows: rows.length - ids,
    bySido: countBy(rows, s.sido), requests, mergedExtra: { rowsAdded: added, identicalRowsSkipped: dup, calls: bo.calls, units: b.m.params.요청단위 } });
  Object.assign(a.m, { calls: a.m.calls + bo.calls, pages: a.m.pages + bo.calls, records: rows.length, params: { ...a.m.params, 요청단위: `${a.m.params.요청단위} + 보충 ${Object.keys(bo.requests).length}곳(${b.m.params.요청단위})` } });
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(a.m, null, 1) + '\n');
  console.log('added', added, 'identical skipped', dup, 'rows', rows.length, 'hsmpSn', ids, 'totalCount', total);
}

async function main() {
  const a = process.argv.slice(2), opt = (n, d) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : d; };
  const name = opt('source');
  const s = SOURCES[name];
  if (!s) throw new Error(`--source kapt|myhome|lh-public|lh-lease 중 하나 (받은 값: ${name})`);
  const out = path.resolve(ROOT, opt('out', s.out));
  const probe = a.includes('--probe');
  const c = makeCaller(loadKey());
  const codes = opt('codes') ? opt('codes').split(',').map((x) => [x.slice(0, 2), x.slice(2)]) : null;   // 5자리 시군구 코드만 불러 오기(예: 11215,28110)
  if (opt('merge-from')) return mergeFrom(s, out, path.resolve(ROOT, opt('merge-from')));
  const run = name === 'kapt' ? fetchKapt : name === 'lh-lease' ? fetchLease : fetchMyhome;
  let r;
  try { r = await run(c, s, probe, codes); } catch (e) { if (e instanceof KeyNotRegistered) { console.log(`${name}: 키 미등록 — 수집하지 않음`); return; } throw e; }
  if (probe) { console.log(name, 'totalCount', r.total, 'rows', r.rows.length, 'calls', c.state.calls); return; }
  let notes = s.notes;
  if (name === 'kapt') {   // 기본정보 15058453: 키 등록 확인 + 응답 필드 이름만(3건)
    const fields = {};
    for (const code of r.rows.slice(0, 3).map((x) => x.kaptCode)) {
      try {
        const j = await c.get('https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusBassInfoV5', { kaptCode: code });
        const item = j.response?.body?.item ?? j.response?.body?.items?.item ?? j.response?.body?.items;
        fields[code] = item ? Object.keys(Array.isArray(item) ? item[0] : item) : `(응답 없음: ${j.response?.header?.resultMsg})`;
      } catch (e) { fields[code] = e instanceof KeyNotRegistered ? '키 미등록' : `오류 ${e.message.slice(-60)}`; }
    }
    const ok = Object.values(fields).find(Array.isArray);
    notes += ` 기본정보(15058453 getAphusBassInfoV5) 시험 3건: ${ok ? `응답 필드 ${ok.join(',')}` : JSON.stringify(Object.values(fields))}`;
  }
  const rows = r.rows;
  if (rows.length !== r.total) console.log(`경고: 행 ${rows.length} != totalCount ${r.total}`);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, `${s.op}.json`), serialize(s.op, r.total, rows));
  const ids = distinct(rows, s.id);
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ source: s.source, fetched_at: new Date().toISOString(), endpoint: [s.base + s.op],
    params: { pageRows: s.pageRows, 요청단위: r.units, cond: '(전국·전체)' }, calls: c.state.calls, pages: c.state.calls, records: rows.length, notes,
    operations: { [s.op]: { totalCount: r.total, rows: rows.length, calls: c.state.calls, fields: [...new Set(rows.flatMap((x) => Object.keys(x)))],
      idField: s.id, idDistinct: ids, idRepeatRows: rows.length - ids, bySido: countBy(rows, s.sido), ...(r.requests ? { requests: r.requests } : {}) } } }, null, 1) + '\n');
  console.log(s.op, r.total, rows.length, 'calls', c.state.calls, 'distinct', s.id, ids);
}
module.exports = { countBy, distinct, serialize, sigunguCodes };
if (require.main === module) main().catch((e) => { console.error(String(e.message || e).replace(/serviceKey=[^&\s]+/g, 'serviceKey=***')); process.exit(1); });
