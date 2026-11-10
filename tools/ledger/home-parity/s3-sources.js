#!/usr/bin/env node
'use strict';
/* S3 출처·검증 화면 정답 값(golden-sources.json) 재현 스크립트 — 읽기 전용(저장소 파일을 고치지 않고 --out 폴더에 S3-snapshot.json·golden-sources.json 만 쓴다).
   옮겨 온 곳: .cache/home-parity/golden/S3-extract.js(2026-11-09 HOME-JSON-반영-계획 P3). 네트워크로 받던 --live 는 뺐다 — 응답은 HOME 패키지 golden/ 로 받는다.
   PoC = HOME PoC 공개 API 의 출처·검증 화면 응답, 우리 = 저장소의 data/board/*.json 과 lib/board/*.ts.
   쓰는 법
     node s3-sources.js --golden <정답 입력 폴더> --web <프런트 JS 폴더> --out <출력 폴더> [--repo <저장소>] [--as-of YYYY-MM-DD] [--fetched-at <ISO>] [--check <golden-sources.json>]
     입력: 정답 입력 폴더의 S3-snapshot.json(이미 줄인 스냅샷)이 있으면 그것을, 없으면 HOME API 응답 원본 S3-<경로>.json 10개(slices.json golden)를 아래 reduce 로 줄여 S3-snapshot.json 을 만든다.
           원본에서 만들 때 meta.fetchedAt = --fetched-at(패키지 manifest 의 받은 시각, 없으면 until), requestedAsOf = --as-of.
           요구사항정의 자체 평가 점수는 프런트 JS 사본(--web 의 js_requirements-manual.js)에서 센다.
   기준일: PoC 는 /sources·/source-summary·/project-collection·/connections·/api-requests 에서 as_of_date 를 무시하고 '지금' 값을 낸다
          (source-summary·project-collection 응답의 as_of_date 는 요청 당일 KST). 스냅샷의 meta.fetchedAt 이 실제 받은 시각이다.
   금지 준수: 담당자 이름(actor)·인증키 값·API 주소의 키는 스냅샷에 넣지 않는다. */
const fs = require('node:fs');
const path = require('node:path');

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const GIN = path.resolve(arg('--golden') || '.');
const WEB = path.resolve(arg('--web') || GIN);
const OUT = path.resolve(arg('--out') || GIN);
const ROOT = path.resolve(arg('--repo') || path.join(__dirname, '..', '..', '..'));
const API = 'https://www.minslab.kr/poc/home/api';

const cnt = (a, f) => a.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
const sum = (a, f = (x) => x) => a.reduce((n, x) => n + (f(x) || 0), 0);
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

/* 응답을 계산에 필요한 만큼만 줄인다(이름·URL·담당자·키 제외) */
const S3_FILES = ['sources', 'source-summary', 'validation', 'samples', 'project-collection', 'mappings', 'connections', 'api-requests', 'data-integrity', 'requirements-status'];
function reduceSnapshot(dir, { fetchedAt, asOf }) {
  const [src, sum_, val, smp, pc, map, con, apr, di, rst] = S3_FILES.map((n) => JSON.parse(fs.readFileSync(path.join(dir, `S3-${n}.json`), 'utf8')));
  /* 자료연도별 확보 격자: HOME 앱 bbc21f7(2026-10-22 22:35)부터 화면 격자는 /sources/year-coverage(인천 행 포함 39줄 — tools/ledger/home-sources.js 와 같은 원본).
     그 응답(S3-year-coverage.json)이 정답 입력에 있으면 격자 줄·연도는 그것으로, 없으면 옛 /validation data_gaps 그대로 */
  const ycFile = path.join(dir, 'S3-year-coverage.json');
  if (fs.existsSync(ycFile)) { const yc = JSON.parse(fs.readFileSync(ycFile, 'utf8')); val.data_gaps = { ...val.data_gaps, years: yc.years, rows: yc.rows }; }
  return {
    meta: { fetchedAt, requestedAsOf: asOf, base: API },
    sources: src.items.map((s) => ({
      id: s.id, name: s.name, org: s.org, type: s.type, data_type: s.data_type, collection_mode: s.collection_mode ?? null, status: s.status, last_success: s.last_success, record_count: s.record_count,
      has_key_env: !!s.key_env, show_key_card: s.show_key_card !== false, key_configured: !!s.key_configured, snapshot_count: s.snapshot_count, ops_mode: s.operations?.mode ?? null, refresh_days: s.refresh_days ?? null,
      base_date: s.stats?.source_base_date ?? s.stats?.dataset_version ?? null, error: s.error ? true : false,
    })),
    sourceSummary: { as_of_date: sum_.as_of_date, generated_at: sum_.generated_at, current: sum_.current, today: sum_.today, types: sum_.types.map((t) => ({ id: t.id, label: t.label, source_ids: t.source_ids, today_source_ids: t.today_source_ids, records: t.records, columns: t.columns, extracted_cells: t.extracted_cells, linked_records: t.linked_records, today_records: t.today_records, today_extracted_cells: t.today_extracted_cells, today_linked_records: t.today_linked_records })) },
    validation: {
      total: val.total, baseline_status: val.baseline_status, notes: val.notes.length,
      items: val.items.map((i) => ({ code: i.code, source_id: i.source_id, project_id: i.project_id })),
      coverage: { complete_population: val.coverage.complete_population, remaining_gaps: val.coverage.remaining_gaps.length, items: val.coverage.items.map((c) => ({ source_id: c.source_id, provided: c.provided_records, fetched: c.fetched_records, collected: c.collected_records, query_status: c.query_status, collection_status: c.collection_status, gap: c.gap })) },
      coverage_details: val.coverage_details.map((c) => ({ source_id: c.source_id, query_status: c.query_status, expected: c.expected_count, fetched: c.fetched_count })),
      data_gaps: {
        years: val.data_gaps.years, forecast_years: val.data_gaps.forecast_years, projects: val.data_gaps.projects,
        scope: val.data_gaps.scope.map((r) => ({ source_id: r.source_id, completed: r.completed, total: r.total, status: r.status })),
        rows: val.data_gaps.rows.map((r) => ({ source_id: r.source_id, label: r.label, region: r.region, cells: r.cells.map((c) => c.status) })),
        forecast_rows: val.data_gaps.forecast_rows.map((r) => ({ region: r.region, cells: r.cells.map((c) => c.status) })),
        not_started: val.data_gaps.not_started.map((r) => r.label),
      },
    },
    samples: { total: smp.total, counts: smp.counts, regions: smp.regions, source_years: smp.source_years, collection_mode: smp.collection_mode },
    projectCollection: {
      as_of_date: pc.as_of_date, total: pc.total, policies: pc.policies.length,
      items: pc.items.map((i) => ({ id: i.id, mapping_status: i.mapping_status, policy_id: i.policy_id, cells: Object.fromEntries(Object.entries(i.cells).map(([k, c]) => [k, { status: c.status, progress: c.progress?.code ?? null }])) })),
      gap_groups: pc.gap_groups.map((g) => ({ owner: g.owner, stage: g.stage, code: g.code, action_required: !!g.action_required, projects: g.project_ids.length })),
      repairs: pc.repairs.map((r) => ({ repair_type: r.repair_type, status: r.status })),
      diagram: pc.diagram.map((d) => ({ stage: d.stage, counts: d.counts, sources: d.sources.map((s) => ({ id: s.id, linked_projects: s.linked_projects })) })),
    },
    mappings: { total: map.total, counts: map.counts, audit: map.audit, policies: map.policies.length, programs: map.programs.map((p) => p.status) },
    connections: { checked_date: con.checked_date, connected: con.connected.map((c) => ({ id: c.id, status: c.status, key_configured: !!c.key_configured, record_count: c.record_count })), planned: con.planned.map((c) => ({ id: c.id, priority: c.priority, mode: c.mode })) },
    apiRequests: { checked_date: apr.checked_date, items: apr.items.map((i) => ({ id: i.id, priority: i.priority, mode: i.mode, collector: i.collector?.status ?? null })) },
    requirementsStatus: { as_of_date: rst.as_of_date, policy_id: rst.policy_id, project_count: rst.project_count, metrics: Object.fromEntries(Object.entries(rst.metrics).map(([k, m]) => [k, { label: m.label, count: m.count, total: m.total, percent: m.percent, without: [m.without_estimates.count, m.without_estimates.total, m.without_estimates.percent], added: m.estimate_added_count }])) },
    integrity: { rounds: di.items.map((r) => ({ id: r.id, sequence: r.sequence, created_at: r.created_at, score: r.score })) },
  };
}

/* PoC 요구사항정의 화면의 자체 평가 점수: 프런트 JS 사본(.cache/home-parity/poc/js_requirements-manual.js)의 assessments 에서 화면과 같은 식(summary())으로 센다 */
function selfAssessment() {
  const file = path.join(WEB, 'js_requirements-manual.js');
  if (!fs.existsSync(file)) throw new Error(`프런트 JS 없음: ${file} (요구사항정의 자체 평가 점수)`);
  const js = fs.readFileSync(file, 'utf8');
  const a = JSON.parse(js.match(/const assessments=(\{[\s\S]*?\});\n/)[1]);
  const pts = Object.values(a).flatMap((x) => x.scores), earned = sum(pts);
  return { requirements: Object.keys(a).length, points: earned, total: pts.length, percent: Math.round(1000 * earned / pts.length) / 10, full: pts.filter((x) => x === 1).length, partial: pts.filter((x) => x === 0.5).length, notImplemented: pts.filter((x) => x === 0).length, perF: Object.fromEntries(Object.entries(a).map(([k, x]) => [k, Math.round(1000 * sum(x.scores) / x.scores.length) / 10])) };
}

/* ───────────── PoC: 정답 값 계산 ───────────── */
function pocValues(S) {
  const src = S.sources, ss = S.sourceSummary, v = S.validation, pc = S.projectCollection, dg = v.data_gaps;
  const stages = ['POLICY', 'BUSINESS', 'APPROVAL', 'CONSTRUCTION', 'SUPPLY', 'MOVE_IN'];
  const cellStatus = Object.fromEntries(stages.map((st) => [st, sortKeys(cnt(pc.items, (i) => i.cells[st]?.status ?? 'NONE'))]));
  const cellProgress = Object.fromEntries(stages.map((st) => [st, sortKeys(cnt(pc.items, (i) => i.cells[st]?.progress ?? 'NONE'))]));
  const yearCells = dg.years.map((y, k) => sortKeys(cnt(dg.rows, (r) => r.cells[k])));
  return {
    // #sources 출처와 수집현황
    sources: {
      registered: src.length,
      withSuccess: src.filter((s) => s.last_success).length,   // 정상 수집 실행이 있는 원천(HOME 머리 수치 current.sources 는 데이터 행이 있는 원천이라 이보다 같거나 크다)
      status: sortKeys(cnt(src, (s) => s.status)),
      failedIds: src.filter((s) => s.status === 'FAILED').map((s) => s.id).sort(),
      recordCountSum: sum(src, (s) => s.record_count),
      recordCountNull: src.filter((s) => s.record_count == null).length,
      lastSuccessMax: src.map((s) => s.last_success).filter(Boolean).sort().pop(),
      lastSuccessMin: src.map((s) => s.last_success).filter(Boolean).sort()[0],
      lastSuccessOnDate: Object.fromEntries([3, 2, 1].map((k) => new Date(Date.parse(S.meta.requestedAsOf) - k * 864e5).toISOString().slice(0, 10)).map((d) => [d, src.filter((s) => s.last_success && new Date(Date.parse(s.last_success) + 9 * 3600e3).toISOString().slice(0, 10) === d).length])),
      byDataType: sortKeys(cnt(src, (s) => s.data_type)),
      byOpsMode: sortKeys(cnt(src, (s) => s.ops_mode)),
      withBaseDate: src.filter((s) => s.base_date).length,
      snapshotCountSum: sum(src, (s) => s.snapshot_count),
      filterOptions: src.filter((s) => s.collection_mode !== 'TEST_SAMPLE' && s.type !== 'POLICY_FOLLOWUP').length,
      orgCount: new Set(src.map((s) => s.org)).size,
    },
    sourceSummary: {
      as_of_date: ss.as_of_date, generated_at: ss.generated_at,
      current: ss.current, today: ss.today,
      typeTable: ss.types.map((t) => ({ id: t.id, sources: t.source_ids.length, records: t.records, columns: t.columns, extracted_cells: t.extracted_cells, today_extracted_cells: t.today_extracted_cells, linked_records: t.linked_records })),
      totals: { sources: sum(ss.types, (t) => t.source_ids.length), records: sum(ss.types, (t) => t.records), columns: sum(ss.types, (t) => t.columns), extracted_cells: sum(ss.types, (t) => t.extracted_cells), today_extracted_cells: sum(ss.types, (t) => t.today_extracted_cells), linked_records: sum(ss.types, (t) => t.linked_records) },
    },
    // #validation 데이터 검증
    validation: {
      items: v.total, itemsByCode: sortKeys(cnt(v.items, (i) => i.code)), codeKinds: new Set(v.items.map((i) => i.code)).size, itemsBySource: sortKeys(cnt(v.items, (i) => i.source_id)),
      distinctProjectsInItems: new Set(v.items.map((i) => i.project_id)).size,
      baseline_status: v.baseline_status, notes: v.notes,
      coverage: {
        sources: v.coverage.items.length, complete_population: v.coverage.complete_population, remaining_gaps: v.coverage.remaining_gaps,
        queryStatus: sortKeys(cnt(v.coverage.items, (c) => c.query_status)), collectionStatus: sortKeys(cnt(v.coverage.items, (c) => c.collection_status)),
        providedSum: sum(v.coverage.items, (c) => c.provided), fetchedSum: sum(v.coverage.items, (c) => c.fetched), collectedSum: sum(v.coverage.items, (c) => c.collected), providedNull: v.coverage.items.filter((c) => c.provided == null).length,
      },
      coverageDetails: { n: v.coverage_details.length, queryStatus: sortKeys(cnt(v.coverage_details, (c) => c.query_status)) },
      dataGaps: {
        projects: dg.projects, years: dg.years, forecastYears: dg.forecast_years,
        scope: dg.scope, yearRows: dg.rows.length, yearRowCells: yearCells, acquiredCells: sum(yearCells, (c) => c.ACQUIRED), totalCells: dg.rows.length * dg.years.length,
        forecastRows: dg.forecast_rows.length, forecastAcquired: sum(dg.forecast_rows, (r) => r.cells.filter((c) => c === 'ACQUIRED').length), notStarted: dg.not_started,
      },
    },
    // #samples 원천 검증 자료
    samples: { total: S.samples.total, kinds: Object.keys(S.samples.counts).length, countsSum: sum(Object.values(S.samples.counts)), counts: sortKeys(S.samples.counts), regionBuckets: Object.keys(S.samples.regions).length, years: S.samples.source_years.length, yearRange: [Math.min(...S.samples.source_years), Math.max(...S.samples.source_years)] },
    // #project-collection 사업별 수집연계
    projectCollection: {
      as_of_date: pc.as_of_date, total: pc.total, mappingStatus: sortKeys(cnt(pc.items, (i) => i.mapping_status)), policies: pc.policies, byPolicy: sortKeys(cnt(pc.items, (i) => i.policy_id)),
      cellStatus, cellProgress,
      diagram: pc.diagram.map((d) => ({ stage: d.stage, counts: d.counts, sources: d.sources.length })),
      gapGroups: { n: pc.gap_groups.length, actionRequired: pc.gap_groups.filter((g) => g.action_required).length, byCode: sortKeys(cnt(pc.gap_groups, (g) => g.code)) },
      repairs: { n: pc.repairs.length, byType: sortKeys(cnt(pc.repairs, (r) => r.repair_type)), byStatus: sortKeys(cnt(pc.repairs, (r) => r.status)) },
    },
    mappings: { total: S.mappings.total, counts: S.mappings.counts, audit: S.mappings.audit, policies: S.mappings.policies, programs: S.mappings.programs.length, programStatus: sortKeys(cnt(S.mappings.programs, (s) => s)) },
    // #keys API 연결 안내
    keys: {
      cards: S.sources.filter((s) => s.has_key_env && s.show_key_card).length, cardsConfigured: S.sources.filter((s) => s.has_key_env && s.show_key_card && s.key_configured).length, sourcesWithKeyEnv: S.sources.filter((s) => s.has_key_env).length,
      connected: S.connections.connected.length, connectedOk: S.connections.connected.filter((c) => c.status === 'SUCCESS').length, connectedRecords: sum(S.connections.connected, (c) => c.record_count), connectedChecked: S.connections.checked_date,
      planned: S.connections.planned.length, plannedByPriority: sortKeys(cnt(S.connections.planned, (c) => c.priority)),
      apiRequests: S.apiRequests.items.length, apiRequestsByCollector: sortKeys(cnt(S.apiRequests.items, (i) => i.collector)), apiRequestsByPriority: sortKeys(cnt(S.apiRequests.items, (i) => i.priority)), apiRequestsChecked: S.apiRequests.checked_date,
    },
    // 요구사항정의(PoC /requirements-status + 화면 안의 자체 평가 점수) ↔ 우리 /sources 요구사항 충족
    requirements: {
      as_of_date: S.requirementsStatus.as_of_date, policy_id: S.requirementsStatus.policy_id, projectCount: S.requirementsStatus.project_count,
      metrics: Object.fromEntries(Object.entries(S.requirementsStatus.metrics).map(([k, m]) => [k, `${m.count}/${m.total} ${m.percent ?? '산정 불가'}% · 추정 제외 ${m.without[0]}/${m.without[1]} ${m.without[2] ?? '산정 불가'}% · 추정으로 추가 ${m.added}`])),
      selfAssessment: selfAssessment(),
    },
    // #data-integrity 데이터 정합성 확인
    integrity: { rounds: S.integrity.rounds.length, latest: S.integrity.rounds.slice().sort((a, b) => b.sequence - a.sequence)[0] && { id: S.integrity.rounds.slice().sort((a, b) => b.sequence - a.sequence)[0].id, score: S.integrity.rounds.slice().sort((a, b) => b.sequence - a.sequence)[0].score }, scores: S.integrity.rounds.slice().sort((a, b) => a.sequence - b.sequence).map((r) => r.score) },
  };
}

/* ───────────── 우리: 값 계산(화면 app/(dashboard)/sources/page.tsx 와 같은 규칙) ───────────── */
async function oursValues(snap) {
  const lib = async (f) => import(path.join(ROOT, 'lib/board', f));
  const [hsLib, annual, calc, usage, acq, pipe] = await Promise.all([lib('home-sources.ts'), lib('annual.ts'), lib('calc.ts'), lib('screen-usage.ts'), lib('acquire.ts'), lib('pipeline.ts')]);
  const sources = readJson('data/board/sources.json'), hs = readJson('data/board/home-sources.json'), req = readJson('data/board/requirements.json');
  const ledger = readJson('data/board/ledger-board.json'), molit = calc.capitalMolit(readJson('data/board/molit.json')), lh = calc.capitalLh(readJson('data/board/lh-completion.json'));
  const items = sources.items;

  // ② 수집 상태(Collect)
  const all = hsLib.statusRows(hs, items);
  const showOrg = (o) => o.replace(/지도 번들|번들/g, '지도 자료').replace(/^주택파동/, '주택공급');
  const okRows = all.filter((r) => r.ok && !r.warn);
  const orgs = new Set(okRows.map((r) => showOrg(r.org)));
  const hsFetched = hs.sources.map((s) => s.records ?? s.fetched);
  const collect = {
    ours: items.length, home: hs.sources.length, total: all.length,
    fail: all.filter((r) => !r.ok).length, failNames: all.filter((r) => !r.ok).map((r) => r.name).sort(), warn: all.filter((r) => r.warn).length, ok: okRows.length, orgs: orgs.size,
    homeRuns: hs.runs, homeExpectedSum: sum(hs.sources, (x) => x.expected), homeFetchedSum: sum(hs.sources, (x) => x.fetched), homeWithCoverage: hs.sources.filter((x) => x.expected !== null).length, homeWithLedgerRecords: hs.sources.filter((x) => x.records !== null).length, homePartial: hs.sources.filter((x) => x.partial).length, homeCountNull: hsFetched.filter((n) => n == null).length, homeCountSum: sum(hsFetched), homeWithAsOf: hs.sources.filter((s) => s.asOf).length,
    homeLastOkMax: hs.sources.map((s) => s.lastOk).filter(Boolean).sort().pop(), homeLastRunMax: hs.sources.map((s) => s.lastRun).sort().pop(),
    oursCountSum: sum(items, (s) => s.count),
  };

  // ③ 연도 확보(Coverage)
  const cover = hsLib.coverageRows(hs, annual.annualSeries(molit, 'complete', '00'));
  const now = hsLib.GRID_YEARS.length - 1;
  const isFull = (r) => r.cells.every((c, i) => c === 'full' || (i === now && c === 'part'));
  const onlyNow = (r) => r.cells.every((c, i) => (i === now ? c !== 'none' : c === 'none'));
  const coverage = {
    years: hsLib.GRID_YEARS, rows: cover.length, owners: sortKeys(cnt(cover, (r) => r.owner)), fullFold: cover.filter(isFull).length, onlyNowFold: cover.filter(onlyNow).length, shownRows: cover.filter((r) => !isFull(r) && !onlyNow(r)).length,
    cellsByState: sortKeys(cnt(cover.flatMap((r) => r.cells), (c) => c)), cellsByYear: hsLib.GRID_YEARS.map((y, k) => sortKeys(cnt(cover, (r) => r.cells[k]))),
  };

  // ④ 연결(Links)
  const links = hs.links;

  // ① 요구사항 충족(Requirements)
  const verdict = sortKeys(cnt(req.items, (r) => r.verdict));
  const requirements = { edition: req.edition, referenceDate: req.referenceDate, observedMonth: req.observedMonth, verdict, rows: req.items.map((r) => [r.id, r.verdict, r.metric]), measures: req.measures };

  // 원천 카탈로그 17건
  const catalog = {
    n: items.length, countSum: sum(items, (s) => s.count), counts: Object.fromEntries(items.map((s) => [s.id, s.count])),
    collectedMin: items.map((s) => s.collectedAt).filter(Boolean).map((d) => d.slice(0, 10)).sort()[0], collectedMax: items.map((s) => s.collectedAt).filter(Boolean).map((d) => d.slice(0, 10)).sort().pop(),
    noCollectedAt: items.filter((s) => !s.collectedAt).length, noSourceAsOf: items.filter((s) => !s.sourceAsOf).length, noLicense: items.filter((s) => !s.license).length, noScreen: items.filter((s) => !s.usedBy.length).length,
    boardUsed: items.filter((s) => s.usedBy.includes('/')).length, mapUsed: items.filter((s) => s.usedBy.includes('/map')).length, sourceAsOfMax: items.map((s) => s.sourceAsOf).filter(Boolean).sort().pop(),
    molitRows: sum(items.filter((s) => s.id.startsWith('molit-') && s.usedBy.includes('/')), (s) => s.count), molitUsed: items.filter((s) => s.id.startsWith('molit-') && s.usedBy.includes('/')).length,
  };

  // 추가 확보 필요(조사 목록)
  const open = acq.ACQUIRE.filter((a) => a.status !== '수집·연결됨');
  const acquire = { asOf: acq.ACQUIRE_ASOF, total: acq.ACQUIRE.length, open: open.length, openApi: open.filter((a) => a.kind === 'API').length, openFile: open.filter((a) => a.kind === '파일').length, byStatus: sortKeys(cnt(acq.ACQUIRE, (a) => a.status)), byKind: sortKeys(cnt(acq.ACQUIRE, (a) => a.kind)) };

  // 화면별 요약·위젯·지도 표(보관 파일에서 센 값만; .cache 응답 건수는 개발 PC 에서만 있어 정답 값에서 뺀다)
  const regionsIdx = readJson('regions/index.json').regions.filter((r) => r.visibility === 'public');
  const b = { projects: 0, buildings: 0, context: 0, infra: 0, infraRegions: 0, permits: 0, zones: 0 };
  for (const { slug } of regionsIdx) {
    const rd = (n) => { try { return readJson(`regions/${slug}/${n}.json`); } catch { return {}; } };
    const n = (d, k) => (Array.isArray(d[k]) ? d[k].length : 0);
    const p = rd('projects'), bl = rd('buildings'), cx = rd('context'), inf = rd('infra');
    b.projects += n(p, 'projects'); b.buildings += n(bl, 'features'); b.context += n(cx, 'stations') + n(cx, 'schools');
    if (Object.keys(inf).length) b.infraRegions++;
    b.permits += n(inf, 'permits'); b.zones += n(inf, 'zones') + n(inf, 'attendance');
    b.infra += ['schools', 'zones', 'attendance', 'stops', 'busRoutes', 'sites', 'permits', 'measures'].reduce((s, k) => s + n(inf, k), 0);
  }
  const bundleStatus = {};
  for (const { slug } of regionsIdx) { try { for (const x of readJson(`regions/${slug}/projects.json`).projects ?? []) bundleStatus[String(x.status)] = (bundleStatus[String(x.status)] ?? 0) + 1; } catch { /* 지역 파일 없음 */ } }
  const registry = readJson('registry/projects.json').projects.filter((p) => !p.supersededBy && !p.hiddenAt);
  const uniqBlocks = (bs) => new Set(bs.map((x) => `${x.district}|${x.block}`)).size;
  const mapItems = pipe.ITEMS.filter((i) => !usage.SCREEN_USAGE[i.id].map.startsWith('—'));
  const missing = (screen) => pipe.ITEMS.filter((i) => usage.SCREEN_USAGE[i.id][screen].startsWith('필요')).map((i) => i.name);
  const modeOf = (i) => (i.id === 'hub-ap' || i.id === 'lh-completion' ? '보관' : i.now === 'none' ? '미연결' : pipe.MODE_LABEL[i.now]);
  const mapModes = sortKeys(cnt([...['보관', '보관', '보관', '보관', '실시간'], ...mapItems.map(modeOf)], (m) => m));   // 지도 표: 지역 지도 자료 4행(보관) + 건축물대장(실시간) + 운영 자료
  const widgets = {
    mapModes, mapUsed: mapItems.length + 5 - (mapModes['미연결'] ?? 0), bundleStatus: sortKeys(bundleStatus),
    boardWidgetRows: 8, boardMissing: missing('board'), mapMissing: missing('map'), mapItemRows: mapItems.length, mapBundleRows: 5, mapRows: mapItems.length + 5, pipelineItems: pipe.ITEMS.length,
    ledgerProjects: ledger.scope.projects, ledgerIssued: ledger.scope.issued, ledgerJudged: ledger.scope.judged, ledgerUnits: ledger.scope.units, ledgerSido: ledger.scope.sido, ledgerObservedMonth: ledger.observedMonth,
    registryLive: registry.length, registrySgg: new Set(registry.map((p) => p.sgg)).size, registryRefsHubBasis: registry.filter((p) => p.refs.some((r) => r.system === 'hub-hs-basis')).length, registryByStage: sortKeys(cnt(registry, (p) => p.stageCode)),
    bundles: b, bundleRegions: regionsIdx.length, lhBlocks: lh.count, lhBlocksUnique: uniqBlocks(lh.blocks), lhBlocksGyeyang: uniqBlocks(lh.blocks.filter((x) => x.district.includes('계양'))), lhSourceAsOf: lh.sourceAsOf,
    upcoming: { units: sum(ledger.upcoming, (m) => m.units), projects: sum(ledger.upcoming, (m) => m.projects), months: ledger.upcoming.length }, agencyUnknownProjects: ledger.agencies.find((a) => a.id === 'unknown')?.projects ?? 0,
    molitMonths: [molit.months[0], molit.months[molit.months.length - 1], molit.months.length],
  };

  // HOME 덤프 원본(읽기만): 연결·수집 실행 표의 행 수 — 원장 변환 전 값
  const zlib = require('node:zlib');
  const dumpDir = path.join(ROOT, `schemas/ledger-${req.observedMonth}/raw/home`, req.edition);
  const rd = (f) => zlib.gunzipSync(fs.readFileSync(path.join(dumpDir, f))).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const hm = rd('home_mapping.jsonl.gz'), pm = rd('home_program_mapping.jsonl.gz'), hp = rd('home_project.jsonl.gz'), batch = rd('home_batch.jsonl.gz');
  const dump = {
    edition: req.edition, homeProjectRows: hp.length, homeMappingRows: hm.length, homeMappingStatus: sortKeys(cnt(hm, (x) => x.status)), homeMappingByPolicy: sortKeys(cnt(hm, (x) => x.policy_id)),
    programMappingRows: pm.length, programMappingStatus: sortKeys(cnt(pm, (x) => x.status)), batchRows: batch.length, batchSourceIds: new Set(batch.map((b) => b.source_id)).size,
    lastBatchFinished: batch.map((b) => b.finished_at).filter(Boolean).sort().pop(),
    hasSourceTable: fs.existsSync(path.join(dumpDir, 'source.jsonl.gz')), hasSampleTable: fs.existsSync(path.join(dumpDir, 'sample.jsonl.gz')),
  };
  const es = rd('execution_schedule.jsonl.gz').map((r) => r.payload), p97 = new Set(hm.filter((x) => x.policy_id === 'POL_2025_0907').map((x) => x.project_id));
  const cell5 = (x) => `${x.project_id}|${x.stage === 'COMPLETION' ? 'CONSTRUCTION' : x.stage}`;   // PoC 는 5단계(건설 = 착공·준공 통합 셀)
  const e97 = es.filter((x) => p97.has(x.project_id));
  dump.scheduleBaseline97 = { policyProjects: p97.size, rows: es.length, projectsWithRows: new Set(e97.map((x) => x.project_id)).size, cells5: new Set(e97.map(cell5)).size, cells5NonInferred: new Set(e97.filter((x) => !x.inferred).map(cell5)).size, allRowsBaselineManual: es.every((x) => x.origin === 'MANUAL' && x.baseline) };
  const snapPc = snap.projectCollection.items;
  const hmBy = new Map(hm.map((x) => [x.project_id, x])), pocBy = new Map(snapPc.map((x) => [x.id, x]));
  dump.vsPoc = {
    pocProjects: snapPc.length, dumpMappedProjects: hmBy.size, inBoth: snapPc.filter((x) => hmBy.has(x.id)).length, onlyPoc: snapPc.filter((x) => !hmBy.has(x.id)).length, onlyDump: hm.filter((x) => !pocBy.has(x.project_id)).length,
    statusChanged: snapPc.filter((x) => hmBy.has(x.id) && hmBy.get(x.id).status !== x.mapping_status).length,
    policyChanged: snapPc.filter((x) => hmBy.has(x.id) && (hmBy.get(x.id).policy_id ?? 'UNASSIGNED') !== x.policy_id).length,
    onlyPocByPolicy: sortKeys(cnt(snapPc.filter((x) => !hmBy.has(x.id)), (x) => x.policy_id)),
  };
  return { meta: { dumpEdition: req.edition, ledgerMonth: req.observedMonth, referenceDate: req.referenceDate }, requirements, collect, coverage, links, dump, catalog, acquire, widgets };
}

/* ───────────── 실행 ───────────── */
function strip(o) { const c = JSON.parse(JSON.stringify(o)); delete c.meta.generatedAt; return c; }
function diff(a, b, p = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) => diff(a[k], b[k], `${p}.${k}`));
  return [`${p}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`];
}

(async () => {
  const check = arg('--check');
  let snap;
  if (fs.existsSync(path.join(GIN, 'S3-snapshot.json'))) snap = JSON.parse(fs.readFileSync(path.join(GIN, 'S3-snapshot.json'), 'utf8'));
  else {
    const asOf = arg('--as-of'), fetchedAt = arg('--fetched-at');
    if (!asOf || !fetchedAt) throw new Error('S3-snapshot.json 이 없으면 --as-of 와 --fetched-at 이 필요하다');
    snap = reduceSnapshot(GIN, { fetchedAt, asOf });
  }
  const out = {
    meta: { schema: 'golden-sources/1', pocAsOfRequested: snap.meta.requestedAsOf, pocFetchedAt: snap.meta.fetchedAt, ourDumpEdition: null, note: 'poc = HOME PoC 공개 API 응답(스냅샷 S3-snapshot.json)에서 센 값, ours = 저장소 data/board/*.json·lib/board/*.ts 에서 화면 규칙대로 센 값. .cache 응답 건수는 개발 PC 에서만 있어 뺐다.' },
    poc: pocValues(snap),
    ours: await oursValues(snap),
  };
  out.meta.ourDumpEdition = out.ours.meta.dumpEdition;
  fs.mkdirSync(OUT, { recursive: true });
  if (path.resolve(GIN) !== OUT || !fs.existsSync(path.join(OUT, 'S3-snapshot.json'))) fs.writeFileSync(path.join(OUT, 'S3-snapshot.json'), JSON.stringify(snap) + '\n');
  fs.writeFileSync(path.join(OUT, 'golden-sources.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(`정답 쓰기: ${path.join(OUT, 'golden-sources.json')}`);
  if (check) {
    const gold = JSON.parse(fs.readFileSync(check, 'utf8'));
    const d = diff(strip(gold), strip(out));
    if (d.length) { console.error(`정답 값과 다름 ${d.length}곳`); d.slice(0, 40).forEach((x) => console.error('  ' + x)); process.exit(1); }
    console.log(`일치: PoC ${Object.keys(out.poc).length}묶음 · 우리 ${Object.keys(out.ours).length}묶음 (스냅샷 ${snap.meta.fetchedAt})`);
  }
})().catch((e) => { console.error(e.message); process.exit(2); });
