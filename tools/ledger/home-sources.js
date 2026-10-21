'use strict';
/* 데이터 원본 '수집 상태' 보기용 요약 data/board/home-sources.json 을 만든다. 화면(lib/board/home-sources.ts)은 이 작은 파일만 읽는다.
   값은 HOME PoC 와 같게(2026-10-21 결정): 덤프로 낼 수 있는 값은 덤프, 덤프에 없는 값은 PoC 공개 API 응답을 받아 둔 스냅샷에서 센다.
   입력: HOME 덤프의 수집 실행(home_batch.jsonl.gz — source_id·status·시각)과 정책–프로그램·프로그램–사업 연결(home_program_mapping·home_mapping),
         PoC API 스냅샷 raw/home-api/<기준일>/sources-*.json.gz (--fetch-poc 로 받아 manifest.json 에 주소·시각·sha256·행 수를 적는다. 압축 원본은 git 무시).
         HOME 덤프 원본은 저장소에 없다(gitignore) → --raw <덤프 폴더> 로 알려 준다(기본: 원장 달 폴더의 raw/home 중 가장 늦은 것).
   만드는 것:
     sources  HOME 원천(source_id)마다 이름·기관(PoC 출처 목록), 마지막 실행 상태·마지막 정상 수집·실행 수·실패 수(덤프), 정상 레코드 수(record_count)·원천 기준일(stats)·조회 상태·제공/조회 건수(PoC 스냅샷)
     poc      스냅샷을 받은 시각, 집계 시각, 데이터가 있는 출처 수(헤드라인), 등록 출처 수, 기관 수
     grid     연도(2018~2026) × 원천×시도 확보(PoC '자료연도별 확보' 26줄 — 확보·미확보·원본 행 없음·원천 미공표)
     links    정책–프로그램·프로그램–사업 연결을 검토 상태별로 센다(확정 CONFIRMED · 검토 중 REVIEW · 해제 RELEASED — 덤프)
   출력은 결정적이다(정렬, 현재 시각 없음). 실행: node tools/ledger/home-sources.js [--month YYYY-MM] [--raw <HOME 덤프 폴더>] [--fetch-poc] */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const P = require('./paths');

const OUT = 'data/board/home-sources.json';

const POC_API = 'https://www.minslab.kr/poc/home/api';
/* PoC 스냅샷: 파일 이름 → 주소(기준일은 AS_OF 로 바뀐다)와 행 수 세는 법. 정책 진행 자료 화면의 PoC 대응 요소(출처 목록·집계·자료연도별 확보·연결·요구사항)만 받는다 */
const POC_FILES = {
  'sources-list.json.gz': ['sources?compact=true', (r) => r.items.length],
  'sources-summary.json.gz': ['source-summary', (r) => r.types.length],
  'sources-validation.json.gz': ['validation?as_of_date=AS_OF', (r) => r.data_gaps.rows.length],
  'sources-mappings.json.gz': ['mappings?as_of_date=AS_OF&compact=true', (r) => r.items.length],
  'sources-requirements.json.gz': ['requirements-status?as_of_date=AS_OF', (r) => Object.keys(r.metrics).length],
};
/* 담당자 이름·입력 사유가 든 칸은 받자마자 지운다(PoC 응답의 연결 확인 actor·reason, 연결 근거 basis 에 '사용자 입력 · 이름' 글이 섞인다) */
const SCRUB = new Set(['actor', 'actor_basis', 'reason', 'change_reason', 'basis', 'mapping_basis']);
const scrub = (v) => (Array.isArray(v) ? v.map(scrub) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => !SCRUB.has(k)).map(([k, x]) => [k, scrub(x)])) : v);

const readGz = (f) => zlib.gunzipSync(fs.readFileSync(f)).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const iso = (t) => t.replace(' ', 'T').replace(/\.\d+/, '').replace(/\+00$/, 'Z');   // '2026-10-13 11:00:12.3+00' → '2026-10-13T11:00:12Z'

/* manifest.json 은 같은 폴더를 쓰는 다른 도구와 나눠 쓴다 — 읽어서 files 에 내 항목만 더하거나 바꾼다(덮어쓰지 않는다) */
function writeManifest(dir, entries) {
  const f = path.join(dir, 'manifest.json');
  const m = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
  m.files = { ...(m.files ?? {}), ...entries };
  fs.writeFileSync(f, JSON.stringify(Object.fromEntries(Object.entries(m).sort(([a], [b]) => (a < b ? -1 : 1))), null, 2) + '\n');
}

/* PoC 공개 API 에서 POC_FILES 를 받아 dir 에 압축 JSON 으로 두고 manifest.json 에 적는다. 503(잠시 연결 불가)이면 몇 초 뒤 다시, 호출 사이 1.5초 */
async function fetchPoc(dir, asOf) {
  fs.mkdirSync(dir, { recursive: true });
  const entries = {};
  for (const [name, [rel, rows]] of Object.entries(POC_FILES)) {
    const url = `${POC_API}/${rel.replace('AS_OF', asOf)}`;
    let res = null;
    for (let i = 0; i < 6 && !(res && res.ok); i++) { if (i) await new Promise((r) => setTimeout(r, 4000)); res = await fetch(url, { signal: AbortSignal.timeout(120000) }).catch(() => null); }
    if (!res || !res.ok) throw new Error(`PoC 응답 실패: ${rel}`);
    const body = scrub(await res.json());
    const buf = zlib.gzipSync(JSON.stringify(body), { level: 9 });
    fs.writeFileSync(path.join(dir, name), buf);
    entries[name] = { url, fetched_at: new Date().toISOString(), sha256: crypto.createHash('sha256').update(buf).digest('hex'), rows: rows(body), bytes: buf.length };
    await new Promise((r) => setTimeout(r, 1500));
  }
  writeManifest(dir, entries);
}

function readPoc(dir) {
  const get = (name) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, name))).toString('utf8'));
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  return { list: get('sources-list.json.gz').items, summary: get('sources-summary.json.gz'), validation: get('sources-validation.json.gz'), mappings: get('sources-mappings.json.gz'),
    requirements: get('sources-requirements.json.gz'), fetchedAt: m.files['sources-list.json.gz'].fetched_at };
}

function runStatus(batch) {
  const by = {};
  for (const b of batch) {
    const s = (by[b.source_id] ??= { runs: 0, ok: 0, failed: 0, interrupted: 0, last: null, lastOk: null });
    s.runs++;
    if (b.status === 'SUCCESS') { s.ok++; if (!s.lastOk || b.finished_at > s.lastOk) s.lastOk = b.finished_at; }
    else if (b.status === 'FAILED') s.failed++;
    else s.interrupted++;
    if (!s.last || b.started_at > s.last.started_at) s.last = b;
  }
  return by;
}

/* PoC 칸 상태 → 화면 4가지(확보·미확보·원본 행 없음·원천 미공표) */
const CELL = { ACQUIRED: 'full', NOT_ACQUIRED: 'none', NO_SOURCE_RECORD: 'nosrc', SOURCE_NOT_PUBLISHED: 'unpub' };
const shortRegion = (r) => r.replace(/(특별시|광역시|도)$/, '');

/* batch: 수집 실행 행 · poc: readPoc() 결과 · mapping/programMapping: 덤프 home_mapping·home_program_mapping 행 */
function build({ batch, poc, mapping, programMapping }) {
  const runs = runStatus(batch);
  const byId = Object.fromEntries(poc.list.map((s) => [s.id, s]));
  const cov = Object.fromEntries(poc.validation.coverage.items.map((c) => [c.source_id, c]));
  const sources = Object.keys(runs).sort().map((id) => {
    const r = runs[id], p = byId[id], c = cov[id];
    return {
      id, name: p.name, org: p.org, ok: r.last.status === 'SUCCESS', lastRun: iso(r.last.started_at), lastOk: r.lastOk ? iso(r.lastOk) : null, runs: r.runs, failed: r.failed, interrupted: r.interrupted,
      records: p.record_count, asOf: p.stats.source_base_date ?? p.stats.dataset_version ?? null, query: c.query_status, provided: c.provided_records, fetched: c.fetched_records,
    };
  });

  const grid = poc.validation.data_gaps.rows.map((g) => ({
    id: `${g.source_id}|${g.label}|${g.region}`, name: g.label, region: shortRegion(g.region), owner: 'HOME',
    years: Object.fromEntries(g.cells.map((c) => [c.year, CELL[c.status]])),
  }));

  const count = (rows, type) => ({ type, confirmed: rows.filter((l) => l.status === 'CONFIRMED').length, review: rows.filter((l) => l.status === 'REVIEW').length, released: rows.filter((l) => l.status === 'RELEASED').length });
  const links = [count(programMapping, 'POLICY_PROGRAM'), count(mapping, 'PROGRAM_PROJECT')];
  const total = batch.length;
  return {
    schema: 'home-sources/2',
    poc: { fetchedAt: poc.fetchedAt, generatedAt: poc.summary.generated_at, registered: poc.list.length, withData: poc.list.filter((s) => s.record_count > 0).length, orgs: new Set(poc.list.map((s) => s.org)).size },
    runs: { total, success: batch.filter((b) => b.status === 'SUCCESS').length, failed: batch.filter((b) => b.status === 'FAILED').length, interrupted: batch.filter((b) => b.status === 'INTERRUPTED').length },
    sources, grid, links,
  };
}

async function main() {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const month = arg('--month') ?? P.latestMonth();
  const dir = P.ledgerDir(month);
  let raw = arg('--raw');
  if (!raw) {
    const base = path.join(dir, 'raw', 'home');
    const found = fs.existsSync(base) ? fs.readdirSync(base).sort().pop() : null;
    if (!found) { console.error('HOME 덤프 폴더를 찾지 못했다 — --raw <폴더> 로 알려 준다'); process.exit(1); }
    raw = path.join(base, found);
  }
  const asOf = P.referenceDateOf(dir), pocDir = path.join(dir, 'raw', 'home-api', asOf);
  if (process.argv.includes('--fetch-poc')) await fetchPoc(pocDir, asOf);
  if (!fs.existsSync(path.join(pocDir, 'manifest.json'))) { console.error(`PoC 스냅샷이 없다: ${pocDir} — --fetch-poc 로 받는다`); process.exit(1); }
  const doc = build({ batch: readGz(path.join(raw, 'home_batch.jsonl.gz')), poc: readPoc(pocDir), mapping: readGz(path.join(raw, 'home_mapping.jsonl.gz')), programMapping: readGz(path.join(raw, 'home_program_mapping.jsonl.gz')) });
  fs.writeFileSync(path.join(P.ROOT, OUT), JSON.stringify(doc) + '\n');
  const bad = doc.sources.filter((s) => !s.ok).length;
  console.log(`${OUT}: 출처 ${doc.poc.withData}(등록 ${doc.sources.length}, 실패 ${bad}) · 확보 격자 ${doc.grid.length}줄 · 실행 ${doc.runs.total} · 연결 ${doc.links.map((l) => `${l.type} 검토 ${l.review}·확정 ${l.confirmed}`).join(' / ')}`);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });

module.exports = { build, runStatus, readPoc, fetchPoc, writeManifest, scrub, POC_FILES };
