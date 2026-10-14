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

/* HOME 원천 이름·기관: HOME 원천 등록부(10-home/backend/sources.py 의 SOURCES — id·name·org) 그대로 옮겼다(2026-10-14, 60곳 + 2026-10-14 판의 새 원천 2곳 = 덤프 수집 실행의 source_id 전부).
   등록부가 바뀌면 여기를 다시 옮긴다. 목록에 없는 source_id 는 id 를 이름으로 쓴다 */
const NAMES = {
  building_hub: ["건축HUB 주택인허가", "국토교통부"], building_hub_details: ["건축HUB 동별·대지위치 파일럿", "국토교통부"], building_hub_incheon: ["9·7 인천 주택인허가 원천", "국토교통부"], building_register: ["건축HUB 주거용 건축물대장", "국토교통부"],
  building_register_recap: ["건축HUB 주거용 총괄표제부 · 사용승인·합필 참조", "국토교통부"], cheongyak: ["청약홈 분양정보", "한국부동산원"], complex_approval_reference: ["한국부동산원 공동주택 단지·필지 사용승인 참조", "한국부동산원 / 공공데이터포털"],
  gh_completion_evidence: ["GH 사용검사·사용승인 원문 증빙", "경기주택도시공사"], gh_files: ["GH 재건축 매입임대 현황", "경기주택도시공사 / 공공데이터포털"], gh_notice: ["GH 주택 공고·과거 목록", "경기주택도시공사"],
  gh_supply_plan: ["GH 주택 분양·임대 공급계획", "경기주택도시공사"], gyeonggi_plan_notice_pilot: ["경기 고양창릉 지구지정 변경 고시 원문", "국토교통부"], ih_supply: ["iH 인천도시공사 임대주택 재고·계약·공가 참조", "인천도시공사"],
  incheon_legal_dongs: ["9·7 인천 전체 법정동 코드", "행정안전부"], incheon_statistics: ["인천 주택 인허가·착공·준공·분양승인 통계", "국토교통 통계누리"], kosis_age: ["KOSIS 수도권 시군구 연령별 주민등록인구", "국가데이터처 KOSIS"],
  kosis_employment: ["KOSIS 시군구별 반기 고용·취업자", "국가데이터처 KOSIS"], kosis_household_forecast: ["KOSIS 시도별 장래가구추계", "국가데이터처 KOSIS"], kosis_household_size: ["KOSIS 서울·경기 가구원수별 일반가구", "국가데이터처 KOSIS"],
  kosis_housing: ["KOSIS 서울·경기 일반가구·다가구 반영 주택 재고", "국가데이터처 / 국토교통부"], legal_dongs: ["서울·경기 전체 법정동 코드", "행정안전부 행정표준코드관리시스템"], lh_block_location: ["LH 공개 지도 블록 라벨 위치", "한국토지주택공사"],
  lh_completion_plan: ["LH 공공주택 블록별 준공예정", "한국토지주택공사"], lh_construction: ["LH 건설공사 현황", "LH 주택품질안전처"], lh_history: ["LH 과거 건설공사 현황", "LH 주택품질안전처"],
  lh_incheon_construction: ["LH 인천 실제 착공·공정 현황", "한국토지주택공사"], lh_incheon_rent: ["LH 인천 임대 공급계획", "LH청약플러스"], lh_incheon_sale: ["LH 인천 분양 공급계획", "LH청약플러스"],
  lh_movein_history: ["LH 연도별 입주계획 공개본", "한국토지주택공사"], lh_notice: ["LH 분양·임대 공고", "한국토지주택공사"], lh_notice_detail: ["LH 모집공고 상세 · 입주 예정월", "한국토지주택공사"],
  lh_progress: ["LH 블록별 실제 공정률 · 공개 상세 이력", "LH청약플러스"], lh_reit_progress: ["LH 공공임대리츠 실제 공정률 · 2018 투자보고서", "한국토지주택공사 / NHF 제6호"], lh_rent: ["LH 연간 임대주택 공급계획", "LH청약플러스"],
  lh_sale: ["LH 연간 분양주택 공급계획", "LH청약플러스"], lh_stock: ["LH 단지정보 · 과거 준공·입주지정 일정", "한국토지주택공사 / 공공데이터포털"], lh_supply_history: ["LH 공공분양 공급현황 2020~2025", "한국토지주택공사"],
  molit_demolition: ["국토부 연도별 주택멸실현황 · 서울·경기", "국토교통부 / e-나라지표"], molit_renewal_inventory: ["국토부 전국 정비사업 통합 현황 · 서울·경기 후보", "국토교통부"], molit_statistics: ["서울·경기 주택건설 공식 통계", "국토교통 통계누리"],
  national_statistics: ["전국 주택 공급단계 통계 · 보관 원본 확대 추출", "국토교통부"], policy_129: ["1·29 도심 주택공급 확대 및 신속화", "국토교통부 / 정책브리핑"], policy_813: ["8·13 주택 신속공급 방안", "관계부처 합동 / 정책브리핑"],
  policy_907: ["9·7 주택공급 확대방안", "관계부처 합동 / 국세청 전재"], policy_907_incheon_geometry: ["9·7 인천 시군구 경계", "국토교통부 VWorld"], policy_907_plan: ["9·7 전체 연도·유형별 착공 목표 원문", "국토교통부 / KDI 원문"],
  policy_history: ["정책 기원·후속조치 이력", "국토교통부 / 정책브리핑"], project_locations: ["사업 대표 주소·지역 근사 좌표", "VWorld·공식 행정구역"], seoul_cleanup: ["서울 정비사업 정보몽땅·추진경과", "서울특별시"],
  seoul_plan_notice_pilot: ["서울 공덕1 정비구역 변경 고시 원문", "서울특별시"], sgis_area: ["SGIS 서울·경기 인구·가구·사업체·산업 종사자", "국가데이터처 SGIS"], sh_files: ["SH 주택관리현황 2024~2026 공개본", "서울 열린데이터광장 / SH"],
  sh_inventory: ["SH 최신 공개본 사업 연결", "서울주택도시공사"], sh_redevelopment: ["SH 공공재개발·재건축 사업현황", "서울주택도시공사"], sh_supply_plan: ["SH 주택분양 공급계획·과거 공개본", "서울주택도시공사"],
  unsold_statistics: ["수도권 미분양·준공 후 미분양 월별 재고", "국토교통 통계누리"], urban_930: ["서울 도심복합사업 9·30 후속조치", "국토교통부 / 정책브리핑"], vworld: ["행정구역 경계·주소 좌표", "국토교통부 VWorld"],
  vworld_district: ["VWorld 공공주택지구 공동주택용지", "국토교통부 VWorld"], vworld_municipality: ["VWorld 서울·경기 시군구 경계", "국토교통부 VWorld"],
  /* 2026-10-14 판에 새로 생긴 원천 — 등록부 소스가 아직 공개되지 않아 덤프의 APPLICATION_README 설명으로 적었다 */
  area_national_benchmarks: ["입지 지표 전국 평균 비교(인구·가구 전국 원천)", "국가데이터처 KOSIS·SGIS"], kosis_living: ["KOSIS 생활 통계(소득·인구이동·거주기간·주거형태)·PIR", "국가데이터처 KOSIS / 국가지표체계"],
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
