'use strict';
/* 데이터 원본 '수집 상태' 보기용 요약 data/board/home-sources.json 을 만든다. 화면(lib/board/home-sources.ts)은 이 작은 파일만 읽는다.
   입력: HOME 덤프의 수집 실행(home_batch.jsonl.gz — source_id·status·시각)과 원천×지역 확보 기록(home_coverage.jsonl.gz — 기대·수집 건수),
         그리고 원장 표(schemas/ledger-<달>/tables: sources·links·events·notices·area_facts). HOME 덤프 원본은 저장소에 없다(gitignore) →
         --raw <덤프 폴더> 로 알려 준다(기본: 원장 달 폴더의 raw/home 중 가장 늦은 것).
   만드는 것:
     sources  HOME 원천(source_id)마다 마지막 실행 상태·마지막 정상 수집·실행 수·실패 수, 확보 기록(기대·수집 건수), 원장 쪽 건수·기준일(원장 원천과 이어지는 것만)
     grid     연도(2018~2026) × 원천 확보: 원장에 날짜가 있는 행(사건일·공고일·지표 기간)이 그 해에 있으면 확보, 그해가 자료 기준 연도이거나 월 지표가 12개월 미만이면 부분.
              HOME 확보 기록의 기간이 '2018~2024' 꼴이면 그 해들(기대·수집 건수가 다 찼으면 확보, 모자라면 부분). 기간을 알 수 없는 원천은 넣지 않는다.
     links    원장 links 의 정책–프로그램·프로그램–사업 연결을 검토 상태별로 센다(확정 CONFIRMED · 검토 중 REVIEW_REQUIRED · 그 밖)
   출력은 결정적이다(정렬, 현재 시각 없음). 실행: node tools/ledger/home-sources.js [--month YYYY-MM] [--raw <HOME 덤프 폴더>] */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const P = require('./paths');

const OUT = 'data/board/home-sources.json';
const YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

/* HOME 원천 이름·기관. 목록에 없는 source_id 는 id 를 이름으로 쓴다 */
const NAMES = {
  building_hub: ['건축HUB 주택인허가', '국토교통부'], building_hub_details: ['건축HUB 주택인허가 상세(행위·대지)', '국토교통부'], building_hub_incheon: ['건축HUB 주택인허가 · 인천', '국토교통부'],
  building_register: ['건축HUB 건축물대장', '국토교통부'], building_register_recap: ['건축HUB 건축물대장 총괄표제부', '국토교통부'],
  cheongyak: ['청약홈 분양정보', '한국부동산원'], complex_approval_reference: ['사업계획승인 단지 참조', '국토교통부'],
  gh_completion_evidence: ['GH 준공 근거', '경기주택도시공사'], gh_files: ['GH 첨부 파일', '경기주택도시공사'], gh_notice: ['GH 공고', '경기주택도시공사'], gh_supply_plan: ['GH 공급계획', '경기주택도시공사'],
  gyeonggi_plan_notice_pilot: ['경기 계획·공고 시범', '경기도'], ih_supply: ['iH 공급', '인천도시공사'],
  incheon_legal_dongs: ['인천 법정동', '인천광역시'], incheon_statistics: ['인천 통계', '인천광역시'],
  kosis_age: ['KOSIS 연령별 인구', '통계청'], kosis_employment: ['KOSIS 고용', '통계청'], kosis_household_forecast: ['KOSIS 장래가구추계', '통계청'],
  kosis_household_size: ['KOSIS 가구원수별 가구', '통계청'], kosis_housing: ['KOSIS 주택·가구(인구총조사)', '통계청'],
  legal_dongs: ['법정동코드', '국토교통부'],
  lh_block_location: ['LH 블록 위치', '한국토지주택공사'], lh_completion_plan: ['LH 공공주택 준공예정', '한국토지주택공사'], lh_construction: ['LH 건설공사 현황', '한국토지주택공사'],
  lh_history: ['LH 이력', '한국토지주택공사'], lh_incheon_construction: ['LH 건설공사 · 인천', '한국토지주택공사'], lh_incheon_rent: ['LH 임대 · 인천', '한국토지주택공사'], lh_incheon_sale: ['LH 분양 · 인천', '한국토지주택공사'],
  lh_movein_history: ['LH 입주 이력', '한국토지주택공사'], lh_notice: ['LH 분양임대공고', '한국토지주택공사'], lh_notice_detail: ['LH 공고 상세', '한국토지주택공사'],
  lh_progress: ['LH 공정률', '한국토지주택공사'], lh_reit_progress: ['LH 리츠 공정률', '한국토지주택공사'], lh_rent: ['LH 임대', '한국토지주택공사'], lh_sale: ['LH 분양', '한국토지주택공사'],
  lh_stock: ['LH 재고', '한국토지주택공사'], lh_supply_history: ['LH 공급 이력', '한국토지주택공사'],
  molit_demolition: ['국토부 철거 인벤토리', '국토교통부'], molit_renewal_inventory: ['국토부 정비 인벤토리', '국토교통부'], molit_statistics: ['통계누리 주택건설실적', '국토교통부'],
  national_statistics: ['전국 통계', '국토교통부'],
  policy_129: ['정책 1·29', '국토교통부'], policy_813: ['정책 8·13', '국토교통부'], policy_907: ['정책 9·7', '국토교통부'], policy_907_incheon_geometry: ['정책 9·7 인천 도형', '국토교통부'],
  policy_907_plan: ['정책 9·7 계획', '국토교통부'], policy_history: ['정책 이력', '국토교통부'], urban_930: ['9·30 도시 자료', '국토교통부'],
  project_locations: ['사업 위치', 'HOME'], seoul_cleanup: ['서울 정비사업', '서울특별시'], seoul_plan_notice_pilot: ['서울 계획·공고 시범', '서울특별시'],
  sgis_area: ['SGIS 인구·가구·사업체', '통계청'], sh_files: ['SH 첨부 파일', '서울주택도시공사'], sh_inventory: ['SH 재고', '서울주택도시공사'],
  sh_redevelopment: ['SH 재개발', '서울주택도시공사'], sh_supply_plan: ['SH 공급계획', '서울주택도시공사'],
  unsold_statistics: ['미분양주택 현황', '국토교통부'], vworld: ['V-World', '국토교통부'], vworld_district: ['V-World 지구', '국토교통부'], vworld_municipality: ['V-World 시군구', '국토교통부'],
};
/* HOME source_id → 원장 원천(source_ref 꼬리). 이어지는 것만: 원장 쪽 건수·기준일을 곁붙인다 */
const LEDGER_TAIL = {
  kosis_age: '-area-kosis-age', kosis_employment: '-area-kosis-employment', kosis_household_forecast: '-area-kosis-household-forecast', kosis_household_size: '-area-kosis-household-size',
  kosis_housing: '-area-kosis-housing', sgis_area: '-area-sgis-census', unsold_statistics: '-unsold', lh_notice: '-lh-notice', gh_notice: '-gh-notice', lh_completion_plan: '-lh-plan',
};

const readGz = (f) => zlib.gunzipSync(fs.readFileSync(f)).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const readTable = (dir, t) => JSON.parse(fs.readFileSync(path.join(dir, `${t}.json`), 'utf8')).rows;
const iso = (t) => t.replace(' ', 'T').replace(/\.\d+/, '').replace(/\+00$/, 'Z');   // '2026-10-13 11:00:12.3+00' → '2026-10-13T11:00:12Z'

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

function coverageOf(coverage) {
  const by = {};
  for (const c of coverage) {
    const s = (by[c.source_id] ??= { expected: 0, fetched: 0, partial: false, periods: new Set() });
    s.expected += Number(c.expected_count) || 0; s.fetched += Number(c.fetched_count) || 0;
    if (c.query_status !== 'COMPLETE_QUERY') s.partial = true;
    if (c.source_period) s.periods.add(c.source_period);
  }
  return by;
}

/* 원장 표의 날짜 있는 행 → 원천(source_ref)별 연도별 행 수와 월 집합 */
function yearCounts(t) {
  const H = {};
  const add = (ref, d, monthly) => { const m = /^(\d{4})(?:-(\d{2}))?/.exec(String(d ?? '')); if (!m) return; const h = (H[ref] ??= { years: {}, months: {} }); h.years[m[1]] = (h.years[m[1]] ?? 0) + 1; if (monthly && m[2] && String(d).length === 7) (h.months[m[1]] ??= new Set()).add(m[2]); };
  for (const x of t.events) add(x.source_ref, x.event_date ?? x.event_month ?? x.event_year);
  for (const x of t.notices) add(x.source_ref, x.announced_on);
  for (const x of t.area_facts) add(x.source_ref, x.period, true);   // 월 지표('2025-08')만 달 수를 센다 — 사건일·공고일은 달이 비어도 부분이 아니다
  return H;
}

const short = (n) => n.split(/ — |（|\(/)[0].trim().replace(/^HOME /, '').replace(/^\d{5,} /, '');
const nameOfRef = (ref) => { const id = Object.keys(LEDGER_TAIL).find((k) => ref.endsWith(LEDGER_TAIL[k])); return id ? NAMES[id][0] : null; };

function build({ batch, coverage, tables }) {
  const runs = runStatus(batch), cov = coverageOf(coverage);
  const srcRows = Object.fromEntries(tables.sources.map((s) => [s.source_ref, s]));
  const homeRef = (tail) => Object.keys(srcRows).find((r) => r.startsWith('home-dump-') && r.endsWith(tail));
  const sources = Object.keys(runs).sort().map((id) => {
    const r = runs[id], c = cov[id], [name, org] = NAMES[id] ?? [id, 'HOME'], ref = LEDGER_TAIL[id] && homeRef(LEDGER_TAIL[id]), l = ref && srcRows[ref];
    return {
      id, name, org, ok: r.last.status === 'SUCCESS', lastRun: iso(r.last.started_at), lastOk: r.lastOk ? iso(r.lastOk) : null, runs: r.runs, failed: r.failed, interrupted: r.interrupted,
      expected: c ? c.expected : null, fetched: c ? c.fetched : null, partial: c ? c.partial || c.fetched < c.expected : false,
      records: l ? l.record_count : null, asOf: l ? l.data_as_of : null,
    };
  });

  const H = yearCounts(tables), grid = [];
  for (const ref of Object.keys(H).sort()) {
    if (ref.startsWith('bundle-') || ref.startsWith('molit-') || /^home-dump-\d+T\d+Z$/.test(ref)) continue;   // 지역 번들·통계누리(화면이 월 자료로 센다)·HOME 사업 사건 모음은 원천 한 줄로 보기 어렵다
    const s = srcRows[ref]; if (!s) continue;
    const asOf = s.data_as_of ?? (s.collected_at ?? '').slice(0, 10), asOfYear = Number(asOf.slice(0, 4)), full = asOf.slice(5) >= '12-31';
    const years = {};
    for (const y of YEARS) {
      const n = H[ref].years[y]; if (!n) continue;
      const months = H[ref].months[y];
      years[y] = (months && months.size < 12) || (y >= asOfYear && !full) ? 'part' : 'full';
    }
    if (Object.keys(years).length) grid.push({ id: ref.replace(/^home-dump-\d+T\d+Z-?/, 'home-') || ref, name: (ref.startsWith('home-dump-') && nameOfRef(ref)) || short(s.dataset_name), owner: ref.startsWith('home-dump-') ? 'HOME' : '우리', years });
  }
  for (const id of Object.keys(cov).sort()) {   // HOME 확보 기록의 기간이 '2018~2024' 꼴인 원천
    const range = [...cov[id].periods].map((p) => /^(\d{4})~(\d{4})$/.exec(p)).find(Boolean);
    if (!range) continue;
    const years = {};
    for (const y of YEARS) if (y >= Number(range[1]) && y <= Number(range[2])) years[y] = cov[id].partial || cov[id].fetched < cov[id].expected ? 'part' : 'full';
    grid.push({ id: `coverage-${id}`, name: NAMES[id]?.[0] ?? id, owner: 'HOME', years });
  }
  grid.sort((a, b) => (a.owner === b.owner ? a.name.localeCompare(b.name, 'ko') : a.owner === '우리' ? -1 : 1));

  const links = ['POLICY_PROGRAM', 'PROGRAM_PROJECT'].map((type) => {
    const rows = tables.links.filter((l) => l.link_type === type);
    return { type, confirmed: rows.filter((l) => l.review_status === 'CONFIRMED').length, review: rows.filter((l) => l.review_status === 'REVIEW_REQUIRED').length, other: rows.filter((l) => !['CONFIRMED', 'REVIEW_REQUIRED'].includes(l.review_status)).length };
  });
  const total = batch.length;
  return {
    schema: 'home-sources/1',
    runs: { total, success: batch.filter((b) => b.status === 'SUCCESS').length, failed: batch.filter((b) => b.status === 'FAILED').length, interrupted: batch.filter((b) => b.status === 'INTERRUPTED').length },
    sources, grid, links,
  };
}

if (require.main === module) {
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
  const t = path.join(dir, 'tables');
  const tables = Object.fromEntries(['sources', 'links', 'events', 'notices', 'area_facts'].map((n) => [n, readTable(t, n)]));
  const doc = build({ batch: readGz(path.join(raw, 'home_batch.jsonl.gz')), coverage: readGz(path.join(raw, 'home_coverage.jsonl.gz')), tables });
  fs.writeFileSync(path.join(P.ROOT, OUT), JSON.stringify(doc) + '\n');
  const bad = doc.sources.filter((s) => !s.ok).length;
  console.log(`${OUT}: HOME 원천 ${doc.sources.length}(실패 ${bad}) · 확보 격자 ${doc.grid.length}줄 · 실행 ${doc.runs.total} · 연결 ${doc.links.map((l) => `${l.type} 검토 ${l.review}·확정 ${l.confirmed}`).join(' / ')}`);
}

module.exports = { build, runStatus, coverageOf };
