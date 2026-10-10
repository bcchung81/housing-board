'use strict';
/* 일정 월 스냅샷 — 건축HUB 부분(docs/product/데이터-수집-계획.md 3절). 레지스트리의 건축HUB 사업(refs 의 hub-hs-basis 관리번호)마다
   주택인허가 기본개요(getHpBasisOulnInfo)의 실제일·예정일을 사업 원장 events 행으로 옮긴다.
   - 원천은 현재값만 주므로 찍은 달(observed_month)마다 행을 남겨 이력을 쌓는다. 스냅샷의 예정은 늘 CURRENT, 실제는 plan_basis null.
   - 한 사업에 허가 기록이 여럿(변경허가)이면 lib/permits.js 와 같은 규칙으로 (사업, 이벤트, 예정/실제)당 한 행:
     사업승인·사용검사 실제일은 가장 늦은 날, 착공 실제일은 가장 이른 날(aggregate 의 approvedAt·completedAt·startedAt), 예정일은 기간 끝이 가장 늦은 것(latestLoose).
   - 정밀도: 'YYYYMMDD' → event_date, 'YYYYMM' → event_month, 'YYYY' → event_year(ymdLoose). 비었거나 달력에 없는 값은 건너뛴다.
   실행: node tools/ledger/snapshot.js --month 2026-10 [--offline]
     법정동(레지스트리 건축HUB 사업의 bjdCodes)마다 모든 쪽을 불러 schemas/ledger-<달>/raw/hub/<법정동10>.json 에 원본(쪽별 items, 인증키 없음)을 남기고
     schemas/ledger-<달>/snapshot/hub-events.json · manifest.json 을 쓴다. --offline 은 저장된 원본만 읽어 같은 결과를 낸다.
     찍는 달은 한국시간 이번 달이어야 한다(지난 달 파일은 다시 쓰지 않는다). 호출·키 풀·재시도는 handlers/v1/permits.js 의 hubRecords 와 같다.
   시험: tests/js/snapshot.test.cjs */
const fs = require('node:fs');
const path = require('node:path');
const { ymdLoose } = require('../../lib/permits.js');

const ROOT = path.join(__dirname, '..', '..');
const SOURCE_REF = 'hub-hs-basis';
const HUB_URL = 'https://apis.data.go.kr/1613000/HsPmsHubService/getHpBasisOulnInfo';
const PAGE_ROWS = 100;
const MAX_PAGES = 30;
const FETCH_TIMEOUT_MS = 10000;
/* 이벤트 → 기본개요 필드와 여러 기록 중 고르는 쪽(lib/permits.js aggregate 와 같음) */
const FIELDS = [
  ['PERMIT', 'ACTUAL', 'apprvDay', 'last'],
  ['CONSTRUCTION_START', 'ACTUAL', 'stcnsDay', 'first'],
  ['CONSTRUCTION_START', 'PLANNED', 'stcnsSchedDay', 'last'],
  ['COMPLETION', 'ACTUAL', 'useInsptDay', 'last'],
  ['COMPLETION', 'PLANNED', 'useInsptSchedDay', 'last'],
];

const refOf = (r) => String(r.mgmHsrgstPk == null ? '' : r.mgmHsrgstPk).trim();
const hubRefs = (p) => p.refs.filter((r) => r.system === SOURCE_REF).map((r) => String(r.value));
const hubProjects = (registry) => registry.projects.filter((p) => !p.supersededBy && hubRefs(p).length);

/* 관리번호 → 기록 목록(법정동 순서·쪽 순서 그대로) */
function indexByRef(raw) {
  const idx = new Map();
  for (const bjd of Object.keys(raw).sort()) for (const r of raw[bjd]) { const k = refOf(r); if (k) (idx.get(k) || idx.set(k, []).get(k)).push(r); }
  return idx;
}

/* raw: { 법정동10: [기본개요 기록…] }, registry: registry/projects.json, month: 'YYYY-MM'(찍은 달) → events 행 배열 */
function eventsFromHub(raw, registry, month) {
  const idx = indexByRef(raw), rows = [];
  for (const p of hubProjects(registry)) {
    const recs = hubRefs(p).flatMap((k) => idx.get(k) || []);
    for (const [event_type, date_type, field, pick] of FIELDS) {
      const vals = recs.map((r) => ({ d: ymdLoose(r[field]), ref: refOf(r) })).filter((v) => v.d);
      if (!vals.length) continue;
      vals.sort((a, b) => (a.d.end < b.d.end ? -1 : a.d.end > b.d.end ? 1 : 0));   // 안정 정렬: 같은 날이면 기록 순서
      const { d, ref } = pick === 'first' ? vals[0] : vals[vals.length - 1];
      rows.push({
        local_project_id: p.id, complex_id: null, event_type, date_type, plan_basis: date_type === 'PLANNED' ? 'CURRENT' : null,
        event_date: d.iso.length === 10 ? d.iso : null, event_month: d.iso.length === 7 ? d.iso : null, event_year: d.iso.length === 4 ? d.iso : null,
        progress_pct: null, event_detail: `관리번호 ${ref}`, change_reason: null, change_note: null, observed_month: month, source_ref: SOURCE_REF, review_status: 'CONFIRMED',
      });
    }
  }
  return rows;
}

/* 레지스트리 관리번호 중 원본에서 찾은 것·못 찾은 것 */
function matchRefs(raw, registry) {
  const idx = indexByRef(raw), matched = [], missing = [];
  for (const p of hubProjects(registry)) for (const k of hubRefs(p)) (idx.has(k) ? matched : missing).push({ local_project_id: p.id, mgmHsrgstPk: k });
  return { matched, missing };
}

/* '예정일 경과': 현재 예정(기간의 마지막 날) < 오늘이고 같은 이벤트의 실제 행이 없는 (사업, 이벤트). today 'YYYY-MM-DD' */
function overdueOf(rows, today) {
  const end = (r) => r.event_date || (r.event_month ? ymdLoose(r.event_month.replace('-', '')).end : `${r.event_year}-12-31`);
  const actual = new Set(rows.filter((r) => r.date_type === 'ACTUAL').map((r) => `${r.local_project_id}|${r.event_type}`));
  return rows.filter((r) => r.date_type === 'PLANNED' && end(r) < today && !actual.has(`${r.local_project_id}|${r.event_type}`))
    .map((r) => ({ local_project_id: r.local_project_id, event_type: r.event_type, planned: r.event_date || r.event_month || r.event_year }));
}

const dirOf = (month) => path.join(ROOT, 'schemas', `ledger-${month}`);
const rawFile = (month, bjd) => path.join(dirOf(month), 'raw', 'hub', `${bjd}.json`);
const bjdCodesOf = (registry) => [...new Set(hubProjects(registry).flatMap((p) => p.bjdCodes || []))].sort();
const kstMonth = (now) => new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 7);

/* 법정동 하나의 모든 쪽(handlers/v1/permits.js hubRecords 와 같은 호출). 반환 { pages: [{ page_no, total_count, items }] } */
async function fetchBjd(bjd, { pool, doFetch, sleep }) {
  const { fetchPage } = require('../../lib/datagokr.js');
  const pages = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const got = await pool.run('RESOLVE', 'hub', (key) => fetchPage({ doFetch, sleep, url: HUB_URL, timeoutMs: FETCH_TIMEOUT_MS,
      params: { serviceKey: key, sigunguCd: bjd.slice(0, 5), bjdongCd: bjd.slice(5, 10), numOfRows: String(PAGE_ROWS), pageNo: String(page), _type: 'json' } }));
    pages.push({ page_no: page, total_count: got.total, items: got.items });
    if (!got.items.length || page * PAGE_ROWS >= got.total) break;
  }
  return { pages };
}

async function main(argv) {
  const at = argv.indexOf('--month'), month = at >= 0 ? argv[at + 1] : null, offline = argv.includes('--offline');
  if (!/^\d{4}-\d{2}$/.test(month || '')) throw new Error('--month YYYY-MM 이 필요하다');
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'registry', 'projects.json'), 'utf8'));
  const bjds = bjdCodesOf(registry), files = {};

  if (offline) {
    for (const bjd of bjds) files[bjd] = JSON.parse(fs.readFileSync(rawFile(month, bjd), 'utf8'));
  } else {
    if (month !== kstMonth(Date.now())) throw new Error(`찍는 달은 한국시간 이번 달(${kstMonth(Date.now())})이어야 한다. 지난 달 스냅샷은 --offline 으로만 다시 만든다`);
    const { createKeyPool, fileStore } = require('../../lib/keys.js');
    const { defaultDir } = require('../../lib/cache.js');
    const { loadEnv } = require('../../scripts/dev.js');
    const env = Object.assign({}, loadEnv(path.join(ROOT, '.env.local')), process.env);
    const pool = createKeyPool({ env, store: fileStore(path.join(defaultDir(env), 'key-usage.json')) });
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (const bjd of bjds) {
      let calls = 0;
      const doFetch = (...a) => { calls++; return fetch(...a); };
      const fetched_at = new Date().toISOString(), { pages } = await fetchBjd(bjd, { pool, doFetch, sleep });
      // 인증키가 든 요청 주소는 남기지 않는다: 엔드포인트와 키를 뺀 조회 조건만
      files[bjd] = { source_ref: SOURCE_REF, endpoint: HUB_URL, params: { sigunguCd: bjd.slice(0, 5), bjdongCd: bjd.slice(5, 10), numOfRows: String(PAGE_ROWS), _type: 'json' }, fetched_at, calls, pages };
      fs.mkdirSync(path.dirname(rawFile(month, bjd)), { recursive: true });
      fs.writeFileSync(rawFile(month, bjd), JSON.stringify(files[bjd], null, 1) + '\n');
      console.log(`${bjd}: ${pages.length}쪽 ${pages.reduce((a, p) => a + p.items.length, 0)}건 (호출 ${calls})`);
    }
  }

  const raw = Object.fromEntries(bjds.map((bjd) => [bjd, files[bjd].pages.flatMap((p) => p.items)]));
  const rows = eventsFromHub(raw, registry, month), { matched, missing } = matchRefs(raw, registry);
  const manifest = {
    taken_at: bjds.map((b) => files[b].fetched_at).sort()[0], month, source_ref: SOURCE_REF, endpoint: HUB_URL, bjd_codes: bjds,
    calls: bjds.reduce((a, b) => a + files[b].calls, 0), pages: bjds.reduce((a, b) => a + files[b].pages.length, 0), records: Object.values(raw).reduce((a, r) => a + r.length, 0),
    rows: rows.length, projects: hubProjects(registry).length, refs: matched.length + missing.length, refs_matched: matched.length, refs_missing: missing,
  };
  const out = path.join(dirOf(month), 'snapshot');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'hub-events.json'), JSON.stringify({ schema_version: 'ledger/1', table: 'events', rows }, null, 1) + '\n');
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
  console.log(`호출 ${manifest.calls} · 쪽 ${manifest.pages} · 기록 ${manifest.records} · 행 ${rows.length} · 관리번호 ${matched.length}/${manifest.refs}${missing.length ? ` (못 찾음 ${missing.map((m) => m.mgmHsrgstPk).join(', ')})` : ''}`);
}

module.exports = { eventsFromHub, matchRefs, overdueOf, bjdCodesOf, SOURCE_REF };

if (require.main === module) main(process.argv.slice(2)).catch((e) => { console.error(`오류: ${e.message}`); process.exit(1); });
