#!/usr/bin/env node
/* 전국 계획 단계 원천 수집(원장 변환·사업 연계 없음): V-World 데이터 API 의 택지·사업지구 경계(LT_C_LHZONE)와 블록(토지이용계획) 폴리곤(LT_C_LHBLPN).
   결과: <out>/<레이어>.geojson(없으면 50 MB 초과 시 .geojson.gz) + <out>/manifest.json. 기본 out = schemas/ledger-2026-10/raw/vworld-district.
   전국(경도 124~132, 위도 33~39)을 0.5도 칸으로 덮고, 칸의 총건수가 SPLIT_OVER 를 넘으면 4등분한다. 같은 지물은 id 로 중복을 지운다.
   키·domain 은 lib/vworld.js 규칙(로컬은 VWORLD_DEV_KEY, 없으면 VWORLD_KEY)으로 환경변수 또는 .env.local 에서 읽고, 어디에도 쓰지 않는다.
   사용: node tools/ledger/collect-vworld-district.js [--layer LT_C_LHBLPN|LT_C_LHZONE|all] [--out <폴더>] [--cell 0.5] [--plan]
   한도: 호출 사이 150 ms, 순차(동시 1건), 오류는 쉬었다 최대 3회 다시. --plan 은 칸당 총건수 호출만 하고 어림한 호출 수를 보여 준다. */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { VWORLD_URL, vworldCreds, redactVworld } = require('../../lib/vworld');

const ROOT = path.join(__dirname, '..', '..');
const LAYERS = ['LT_C_LHZONE', 'LT_C_LHBLPN'];   // --layer all 의 대상. LT_C_UD610(국민임대)·LT_C_UD620(보금자리)는 --layer 로 직접 지정
const EXTRA_LAYERS = ['LT_C_UD610', 'LT_C_UD620'];
const KOREA = { lon: [124, 132], lat: [33, 39] };
const PAGE_SIZE = 1000;
const SPLIT_OVER = 3000;
const MIN_CELL = 0.05;
const SPACING_MS = 150;
const RETRIES = 3;
const GZIP_OVER = 50 * 1024 * 1024;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i < 0 ? def : (process.argv[i + 1] ?? true); };

/* ---- 순수 함수 ---- */
const pageCount = (total, size = PAGE_SIZE) => (total > 0 ? Math.ceil(total / size) : 0);
/* 범위를 size 도 칸으로 나눈다 */
function gridCells(lon, lat, size) {
  const out = [];
  for (let y = lat[0]; y < lat[1] - 1e-9; y += size)
    for (let x = lon[0]; x < lon[1] - 1e-9; x += size) out.push([x, y, x + size, y + size]);
  return out;
}
const split4 = ([x0, y0, x1, y1]) => { const mx = (x0 + x1) / 2, my = (y0 + y1) / 2; return [[x0, y0, mx, my], [mx, y0, x1, my], [x0, my, mx, y1], [mx, my, x1, y1]]; };
const boxStr = (c) => `BOX(${c.map((v) => +v.toFixed(6)).join(',')})`;
/* 중심점(첫 좌표들의 평균 범위 중심) */
function center(geom) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  (function walk(a) { if (typeof a[0] === 'number') { x0 = Math.min(x0, a[0]); x1 = Math.max(x1, a[0]); y0 = Math.min(y0, a[1]); y1 = Math.max(y1, a[1]); } else a.forEach(walk); })(geom.coordinates);
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

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

let lastCall = 0;
async function getJson(env, layer, box, page, size, stats) {
  const { key, domain } = vworldCreds(env);
  if (!key) throw new Error('VWORLD_KEY 가 없다');
  const u = new URL(VWORLD_URL);
  const q = { service: 'data', request: 'GetFeature', data: layer, key, domain, format: 'json', size, page, geomFilter: box, crs: 'EPSG:4326' };
  for (const k in q) u.searchParams.set(k, q[k]);
  let err;
  for (let n = 0; n <= RETRIES; n++) {
    if (n) await sleep(2000 * n);
    const wait = lastCall + SPACING_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    stats.calls++;
    try {
      const res = await fetch(u);
      const r = (await res.json()).response;
      if (r?.status === 'OK') return r;
      if (r?.status === 'NOT_FOUND') return { status: 'OK', record: { total: '0' }, result: { featureCollection: { features: [] } } };
      err = new Error(`${layer} ${box} p${page}: ${r?.error?.code ?? res.status} ${r?.error?.text ?? ''}`);
      if (r?.error?.code === 'INCORRECT_KEY' || r?.error?.code === 'INVALID_RANGE') break;
    } catch (e) { err = e; }
  }
  throw new Error(redactVworld(err.message, env));
}

/* 한 칸의 총건수 */
async function cellTotal(env, layer, box, stats) {
  const r = await getJson(env, layer, box, 1, 1, stats);
  return Number(r.record?.total ?? 0);
}

/* 레이어 전체 수집: 칸 → (많으면 4등분) → 쪽 순회, id 로 중복 제거 */
async function collectLayer(env, layer, cellSize, planOnly) {
  const stats = { calls: 0 };
  const byId = new Map();
  let raw = 0, recTotal = 0, cells = 0, split = 0, planPages = 0;
  const queue = gridCells(KOREA.lon, KOREA.lat, cellSize);
  while (queue.length) {
    const c = queue.shift();
    const box = boxStr(c);
    const total = await cellTotal(env, layer, box, stats);
    if (!total) continue;
    if (total > SPLIT_OVER && c[2] - c[0] > MIN_CELL + 1e-9) { split++; queue.unshift(...split4(c)); continue; }
    cells++; recTotal += total;
    planPages += pageCount(total);
    if (planOnly) continue;
    for (let p = 1; p <= pageCount(total); p++) {
      const r = await getJson(env, layer, box, p, PAGE_SIZE, stats);
      for (const f of r.result?.featureCollection?.features ?? []) { raw++; if (!byId.has(f.id)) byId.set(f.id, f); }
    }
  }
  return { features: [...byId.values()], raw, recTotal, cells, split, calls: stats.calls, planPages };
}

function summarize(features) {
  const fields = {}, sido = {};
  for (const f of features) {
    for (const [k, v] of Object.entries(f.properties || {})) { fields[k] = fields[k] || 0; if (v !== null && v !== '') fields[k]++; }
    const s = f.properties?.sido_name ?? null;
    const key = s ?? (f.geometry ? (([x, y]) => `경위도 ${Math.floor(x)}E ${Math.floor(y)}N`)(center(f.geometry)) : '지오메트리 없음');
    sido[key] = (sido[key] || 0) + 1;
  }
  return { fields, sido };
}

async function main() {
  const env = loadEnv();
  const which = arg('layer', 'all');
  const layers = which === 'all' ? LAYERS : [which];
  if (!LAYERS.concat(EXTRA_LAYERS).includes(which) && which !== 'all') throw new Error(`알 수 없는 layer: ${which}`);
  const out = path.resolve(ROOT, arg('out', 'schemas/ledger-2026-10/raw/vworld-district'));
  const cellSize = Number(arg('cell', 0.5));
  const planOnly = process.argv.includes('--plan');
  fs.mkdirSync(out, { recursive: true });
  const manifestFile = path.join(out, 'manifest.json');
  const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {
    source: 'V-World 데이터 API 택지·사업지구 경계와 블록(토지이용계획) 폴리곤',
    endpoint: VWORLD_URL,
    params: { service: 'data', request: 'GetFeature', data: '<layer>', geomFilter: 'BOX(<격자 칸>)', size: PAGE_SIZE, page: '1..N', format: 'json', crs: 'EPSG:4326' },
    layers: {},
  };
  for (const layer of layers) {
    console.log(`[${layer}] 시작 (칸 ${cellSize}도${planOnly ? ', 계획만' : ''})`);
    const r = await collectLayer(env, layer, cellSize, planOnly);
    console.log(`[${layer}] 칸 ${r.cells}(4등분 ${r.split}) 받을 쪽 ${r.planPages} 호출 ${r.calls} 원본 ${r.raw} 고유 ${r.features.length}`);
    if (planOnly) continue;
    const { fields, sido } = summarize(r.features);
    const fc = { type: 'FeatureCollection', crs_note: 'EPSG:4326 (요청 crs 그대로)', source: `V-World 데이터 API ${layer}`, fetched_at: new Date().toISOString(), features: r.features };
    const body = JSON.stringify(fc);
    const gz = Buffer.byteLength(body) > GZIP_OVER;
    const name = `${layer}.geojson${gz ? '.gz' : ''}`;
    for (const old of [`${layer}.geojson`, `${layer}.geojson.gz`]) fs.rmSync(path.join(out, old), { force: true });
    fs.writeFileSync(path.join(out, name), gz ? zlib.gzipSync(body) : body);
    manifest.layers[layer] = {
      file: name, gzip: gz, crs: 'EPSG:4326', bytes_json: Buffer.byteLength(body), bytes_file: fs.statSync(path.join(out, name)).size,
      features_before_dedupe: r.raw, record_total_sum: r.recTotal, features: r.features.length, id_field: 'feature.id (예 LT_C_LHBLPN.44313)',
      property_fields: fields, by_region: sido, calls: r.calls, grid: { cell_deg: cellSize, cells_fetched: r.cells, cells_split_to_quarter: r.split, split_over: SPLIT_OVER, min_cell_deg: MIN_CELL, page_size: PAGE_SIZE, bounds: KOREA },
    };
    manifest.fetched_at = new Date().toISOString();
    manifest.calls = Object.values(manifest.layers).reduce((a, l) => a + l.calls, 0);
    manifest.records = Object.values(manifest.layers).reduce((a, l) => a + l.features, 0);
    manifest.notes = '속성은 원본 그대로. 같은 지물이 여러 칸에 걸치면 feature.id 로 중복 제거. 사업과의 연계 없음.';
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 1) + '\n');
  }
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { pageCount, gridCells, split4, boxStr };
