#!/usr/bin/env node
/* 도로명 주소 → 지번 주소 매핑: 청약홈 분양정보 Detail(HSSPLY_ADRES)·LH 공고 상세(dsSbd 의 LGDN_ADR·LCT_ARA_ADR)의 도로명 주소를
   V-World 검색 API(req/search?type=address&category=road)의 address.parcel(건물이 놓인 지번)로 바꾼다.
   고른 이유: 한 주소에 1회 호출로 끝나고, getcoord(ROAD) 좌표 → 역지오코딩(PARCEL)은 가까운 필지를 주어 시험 5건 중 2건이 다른 지번이었다.
   검색 응답의 parcel 은 시도·시군구가 없어(예: '조촌동 907-1') 응답 road 의 앞부분(시도·시군구)을 붙여 완성한다.
   결과: schemas/ledger-2026-10/mappings/road-jibun.json (address 순, 한 행 한 줄). 지번→PNU 는 map-lh.js 의 jibunToPnu 로 잇는다.
   키·domain 은 lib/vworld.js 규칙(로컬은 VWORLD_DEV_KEY, 없으면 VWORLD_KEY)으로 환경변수 또는 .env.local 에서 읽고, 어디에도 쓰지 않는다.
   사용: node tools/ledger/road-jibun.js [--limit N] [--resume]
     --limit N  이번 실행에서 부를 주소 수 상한(기본 4900 = 하루 5,000 호출 안쪽)
     --resume   기존 결과 파일을 읽어 이미 OK 인 주소는 다시 부르지 않는다(없으면 처음부터)
   한도: 시작 간격 150 ms 이상, 동시 2건, 오류는 쉬었다 최대 3회 다시. */
'use strict';
const fs = require('fs');
const path = require('path');
const { VWORLD_SEARCH_URL, vworldCreds, redactVworld } = require('../../lib/vworld');

const ROOT = path.join(__dirname, '..', '..');
const RAW = path.join(ROOT, 'schemas', 'ledger-2026-10', 'raw');
const OUT = path.join(ROOT, 'schemas', 'ledger-2026-10', 'mappings', 'road-jibun.json');
const SPACING_MS = 150;
const CONCURRENCY = 2;
const RETRIES = 3;
const DEFAULT_LIMIT = 4900;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i < 0 ? def : (process.argv[i + 1] ?? true); };

/* ---- 순수 함수 ---- */
/* 도로명 주소 판정: 괄호 앞 부분에 '…로·…길 건물번호'(번지·쉼표 허용)가 있다. 지번형('…동 123', '…리 45-6')은 아니다 */
const isRoad = (a) => /(로|길)\s*\d+(-\d+)?(번지)?(\s|,|$)/.test(String(a).replace(/\s*\(.*$/, '').trim() + ' ');
/* 검색어: 끝의 괄호 설명·'번지'를 뗀다 */
const queryOf = (a) => a.replace(/\s*\(.*$/, '').replace(/번지$/, '').trim();
/* 검색어의 '도로명 건물번호' (예: '양안로 123') */
const roadKey = (q) => { const m = /(\S*(?:로|길))\s*(\d+(?:-\d+)?)$/.exec(q); return m ? `${m[1]} ${m[2]}` : null; };
/* 응답 road('시도 시군구 [읍면] 도로명 번호 (…)') + parcel('[읍면] 동·리 번지') → '시도 시군구 [읍면] 동·리 번지' */
function fullParcel(road, parcel) {
  const rt = String(road).replace(/\s*\(.*$/, '').split(/\s+/);
  const pt = parcel.split(/\s+/);
  const ri = rt.findIndex((t) => /(로|길)$/.test(t) || /\d(번)?길$/.test(t));
  let prefix = ri < 0 ? rt : rt.slice(0, ri);
  const cut = prefix.indexOf(pt[0]);
  if (cut >= 0) prefix = prefix.slice(0, cut);
  return [...prefix, ...pt].join(' ');
}

/* ---- 대상 주소 ---- */
function collectAddresses() {
  const map = new Map();   // address → Set(source)
  const add = (a, s) => { a = String(a ?? '').trim(); if (a && isRoad(a)) map.set(a, (map.get(a) ?? new Set()).add(s)); };
  const dir = path.join(RAW, 'applyhome');
  for (const f of fs.readdirSync(dir).filter((f) => /Detail\.json$/.test(f)))
    for (const r of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).rows ?? []) add(r.HSSPLY_ADRES, 'applyhome');
  const lh = JSON.parse(fs.readFileSync(path.join(RAW, 'lh-notice-detail', 'details.json'), 'utf8'));
  for (const row of lh.rows ?? []) for (const b of row.response ?? []) for (const x of b.dsSbd ?? []) { add(x.LGDN_ADR, 'lh-detail'); add(x.LCT_ARA_ADR, 'lh-detail'); }
  return map;
}
const sourceOf = (set) => (set.size > 1 ? 'both' : [...set][0]);

/* ---- 호출 ---- */
function loadEnv() {
  const file = path.join(ROOT, '.env.local');
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const env = { ...process.env };
  for (const k of ['VWORLD_KEY', 'VWORLD_DEV_KEY', 'VWORLD_DOMAIN']) {
    if (env[k]) continue;
    const m = text.match(new RegExp('^' + k + '=(.*)$', 'm'));
    if (m) env[k] = m[1].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

let nextStart = 0;
async function lookup(env, address, stats) {
  const { key, domain } = vworldCreds(env);
  const q = queryOf(address);
  const u = new URL(VWORLD_SEARCH_URL);
  for (const [k, v] of Object.entries({ service: 'search', request: 'search', version: '2.0', crs: 'epsg:4326', size: '1', page: '1', type: 'address', category: 'road', format: 'json', query: q, key, domain })) u.searchParams.set(k, v);
  let lastErr;
  for (let t = 0; t <= RETRIES; t++) {
    const wait = Math.max(0, nextStart - Date.now());
    nextStart = Math.max(nextStart, Date.now()) + SPACING_MS;   // 시작 시각을 150 ms 간격으로 배정
    await sleep(wait);
    if (t > 0) await sleep(1000 * 2 ** t);
    try {
      stats.calls++;
      const res = await fetch(u);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()).response;
      if (json?.status === 'NOT_FOUND') return { parcel: null, status: 'NOT_FOUND' };
      if (json?.status !== 'OK') throw new Error(`status ${json?.status} ${json?.error?.text ?? ''}`);
      const it = json.result?.items?.[0]?.address;
      if (!it?.parcel) return { parcel: null, status: 'NOT_FOUND' };
      const rk = roadKey(q);
      if (rk && !String(it.road).replace(/\s+/g, ' ').includes(rk)) return { parcel: null, status: 'NOT_FOUND' };   // 다른 도로·번호가 걸린 경우
      if (!/\d$/.test(it.parcel)) return { parcel: null, status: 'NOT_FOUND' };   // 번지 없이 동 이름만 온 경우는 필지가 아니다
      return { parcel: fullParcel(it.road, it.parcel), status: 'OK' };
    } catch (e) { lastErr = redactVworld(e.message, env); }
  }
  return { parcel: null, status: 'ERROR', error: lastErr };
}

function save(rows, method, calls) {
  const sorted = [...rows.values()].sort((a, b) => (a.address < b.address ? -1 : a.address > b.address ? 1 : 0));
  const head = `{"schema":"road-jibun/1","method":${JSON.stringify(method)},"fetched_at":${JSON.stringify(new Date().toISOString())},"calls":${calls},"rows":[\n`;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, head + sorted.map((r) => JSON.stringify({ address: r.address, parcel: r.parcel, status: r.status, source: r.source })).join(',\n') + '\n]}\n');
}

const METHOD = 'V-World req/search?type=address&category=road&query=<도로명 주소(괄호·번지 뗌)> 의 첫 결과 address.parcel 에 응답 road 의 시도·시군구를 붙임. 응답 road 에 검색어의 도로명·건물번호가 없으면 NOT_FOUND';

async function main() {
  const targets = collectAddresses();
  console.log(`대상 고유 도로명 주소 ${targets.size}건 (청약홈 ${[...targets.values()].filter((s) => s.has('applyhome')).length}, LH 상세 ${[...targets.values()].filter((s) => s.has('lh-detail')).length})`);
  const rows = new Map();
  let calls = 0;
  if (process.argv.includes('--resume') && fs.existsSync(OUT)) {
    const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    calls = prev.calls ?? 0;
    for (const r of prev.rows) if (r.status === 'OK' && /\d$/.test(r.parcel) && targets.has(r.address)) rows.set(r.address, r);   // 번지 없는 OK 는 다시 부른다
  }
  const limit = Number(arg('limit', DEFAULT_LIMIT));
  const todo = [...targets.keys()].sort().filter((a) => !rows.has(a)).slice(0, limit);
  const env = loadEnv();
  if (!vworldCreds(env).key) { console.error('VWORLD 키가 없다(.env.local)'); process.exit(1); }
  const stats = { calls: 0 };
  let i = 0, done = 0;
  const worker = async () => {
    while (i < todo.length) {
      const address = todo[i++];
      const r = await lookup(env, address, stats);
      rows.set(address, { address, parcel: r.parcel, status: r.status, source: sourceOf(targets.get(address)) });
      if (r.status === 'ERROR') console.warn(`오류: ${address}: ${r.error}`);
      if (++done % 100 === 0) { save(rows, METHOD, calls + stats.calls); console.log(`${done}/${todo.length}`); }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  /* 이번 실행에서 안 부른 주소도 행으로 남긴다(상태 ERROR: 아직 안 부름) */
  for (const a of targets.keys()) if (!rows.has(a)) rows.set(a, { address: a, parcel: null, status: 'ERROR', source: sourceOf(targets.get(a)) });
  save(rows, METHOD, calls + stats.calls);
  const n = (s) => [...rows.values()].filter((r) => r.status === s).length;
  console.log(`호출 ${stats.calls}회(누적 ${calls + stats.calls}) · OK ${n('OK')} · NOT_FOUND ${n('NOT_FOUND')} · ERROR ${n('ERROR')} → ${path.relative(ROOT, OUT)}`);
}

module.exports = { isRoad, queryOf, roadKey, fullParcel, collectAddresses };
if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
