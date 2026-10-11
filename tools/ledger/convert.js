'use strict';
/* 지금 가진 자료(사업 레지스트리·통계누리·LH 준공예정·원천 카탈로그·지역 번들)를 사업 원장 표(schemas/ledger, 문서 docs/product/데이터셋-스키마.md)로 옮긴다.
   순수 함수다: 파일을 쓰지 않고 레지스트리도 고치지 않는다. LH 블록에 줄 사업 id 는 레지스트리 카운터 다음 번호로 계산만 하는 후보(issued_at null)이고,
   실제 발급은 scripts/issue-projects.js 의 일이다.
   실행: node tools/ledger/convert.js [--lh-sgg <매핑.json>]  → 표별 행 수와 검증 결과를 출력한다. */
const fs = require('node:fs');
const path = require('node:path');
const { codeMapper, locate, groupKey, normBlock, districtToken, cleanDate } = require('./hub-bulk');
const { normalize, nameIndex, jibunToPnu } = require('./map-lh');
const { permitEvents, statusOf } = require('../../lib/permits.js');
const { stageOf } = require('../../lib/projects.js');

const ROOT = path.join(__dirname, '..', '..');
const SLUGS = ['incheon-gyeyang', 'gwangju-gwangsan', 'jeonnam-naju'];
const LH_SOURCE = 'datagokr-15141761';
const LEGAL_DONG_SOURCE = 'datagokr-15123287';
const MYHOME_SOURCE = 'myhome-hwspr02', LH_NOTICE_SOURCE = 'datagokr-15058530', MOVE_IN_SOURCE = 'datagokr-15111714';
/* 모집공고 공급기관 이름 → 기관 id(SH·GH 를 지방공사보다 먼저 본다) */
const agencyOfSupplier = (name) => (/^(LH|한국토지주택공사)$/.test(name) ? 'lh' : /^(SH|서울주택도시공사)$/.test(name) ? 'sh' : /^(GH|경기주택도시공사)$/.test(name) ? 'gh' : /(도시공사|개발공사|지방공사)$/.test(name) ? 'local' : null);
const METRIC_STAGE = { permit: '03', start: '04', sale: '05', complete: '06' };
/* 번들 이벤트 → 원장 이벤트. structure_observed(위성·현장에서 구조물을 본 날)는 단계 날짜가 아니라 옮기지 않는다 */
const BUNDLE_EVENT = { notice: 'SUPPLY_NOTICE', permit_approved: 'PERMIT', construction_start: 'CONSTRUCTION_START', progress: 'PROGRESS', completion_inspection: 'COMPLETION', move_in: 'MOVE_IN' };
const AGENCY_OF_SPONSOR = { 한국토지주택공사: 'lh', LH: 'lh' };
/* 원장이 더하는 원천(카탈로그 밖): 레지스트리·지역 이름·기관 목록 */
const OWN_SOURCES = [
  { source_ref: 'housing-wave-registry', provider: '주택파동', dataset_name: '사업 레지스트리(registry/projects.json)', source_record_key: 'id(PRJ-시군구5-일련4)', used_by: ['/projects', '/project', '/map'] },
  { source_ref: 'stan-api', provider: '행정안전부(공공데이터포털)', dataset_name: '행정표준코드 법정동코드 API(시군구 이름 확인)', source_record_key: '법정동코드', used_by: ['/map'] },
  { source_ref: 'housing-wave-manual', provider: '주택파동', dataset_name: '기관 목록(lib/board/agencies.ts)', source_record_key: 'agency_id', used_by: ['/agency'] },
];

const ym = (d) => d.slice(0, 7);
const dateOrMonth = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? { event_date: d, event_month: null } : { event_date: null, event_month: ym(d) });
const EVENT_BASE = { complex_id: null, event_year: null, progress_pct: null, event_detail: null, change_reason: null, change_note: null, review_status: 'CONFIRMED' };
/* 건축HUB 대용량 기록의 날짜 → 이벤트와 여러 기록 중 고르는 쪽(snapshot.js FIELDS 와 같음). 실제일은 lib/permits.js 가 의심(suspect)으로 보는 값 —
   자료 기준일 뒤의 날짜, 한 기록 안에서 순서가 모순인 날짜 — 을 빼고 고른다(aggregate 의 approvedAt·startedAt·completedAt 과 같음) */
const HUB_BULK_FIELDS = [
  ['PERMIT', 'ACTUAL', 'apprv', 'last'],
  ['CONSTRUCTION_START', 'ACTUAL', 'stcns', 'first'],
  ['CONSTRUCTION_START', 'PLANNED', 'stcns_sched', 'last'],
  ['COMPLETION', 'ACTUAL', 'insp', 'last'],
  ['COMPLETION', 'PLANNED', 'insp_sched', 'last'],
];
const SUSPECT_FIELD = { permit_approved: 'apprv', construction_start: 'stcns', completion_inspection: 'insp' };

/* inputs: { observedMonth: 'YYYY-MM'(이벤트를 관측한 달 = 찍은 달), registry, molit, lh, catalog, bundles: [{ slug, region, projects }], agencies, sggNames: { 시군구5: { name } },
     lhSgg?: [{ district, block, sgg_code, sgg_name, bjd_code?, local_project_id? }](sgg_code 가 없는 항목은 못 찾은 블록), hubEvents?: 건축HUB 스냅샷의 events 행, legalDong?: { asOf, rows: areas 행(법정동코드 파일), abolished },
     hubBulk?: { dataMonth, dataAsOf, collectedAt, files, records }(tools/ledger/hub-bulk.js 중간 스냅샷, legalDong 필요), hubIds?: { 관리번호: 후보 id }(mappings/hub-candidate-ids.json),
     national?: readNational() 의 { myhome, lhNotice, moveIn }(전국 모집공고·입주예정물량, legalDong 필요),
     report?: 건축HUB 대용량·공고·입주예정 처리 건수를 채울 빈 객체 } */
function convert({ observedMonth, registry, molit, lh, catalog, bundles, agencies, sggNames, lhSgg = [], hubEvents = [], legalDong = null, hubBulk = null, hubIds = {}, national = null, report = {} }) {
  if (!/^\d{4}-\d{2}$/.test(observedMonth ?? '')) throw new Error('observedMonth(YYYY-MM)가 필요하다');
  const t = { areas: [], agencies: [], policies: [], programs: [], links: [], projects: [], identifiers: [], project_locations: [], complexes: [], events: [], units: [], notices: [], notice_links: [], stat_facts: [], sources: [], review_required: [] };

  /* 원천 */
  for (const s of catalog.items) {
    t.sources.push({ source_ref: s.id, source_owner: 'HOUSING_WAVE', provider: s.provider, dataset_name: s.dataset, source_url: null, source_record_key: null, data_as_of: s.sourceAsOf, collected_at: s.collectedAt, original_filename: null, notes: s.description || null, record_count: s.count, license: s.license, used_by: s.usedBy, is_demo: false });
  }
  const own = { source_owner: 'HOUSING_WAVE', source_url: null, data_as_of: null, collected_at: null, original_filename: null, notes: null, record_count: null, license: null, is_demo: false };
  for (const s of OWN_SOURCES) t.sources.push({ ...own, ...s });
  if (legalDong) t.sources.push({ ...own, source_ref: LEGAL_DONG_SOURCE, provider: '국토교통부(공공데이터포털)', dataset_name: '국토교통부_법정동코드(15123287)', source_record_key: '법정동코드', data_as_of: legalDong.asOf, record_count: legalDong.rows.length, used_by: [] });
  t.sources.find((s) => s.source_ref === 'housing-wave-registry').data_as_of = registry.updatedAt.slice(0, 10);

  /* 지역: 법정동코드 파일(있으면)이 바탕이고 이름은 그 파일의 전체 이름. 없는 칸만 전국·시도는 통계누리, 시군구는 행정표준코드로 확인한 이름,
     법정동은 레지스트리(이름은 번들의 법정동 8자리 + 리 00 이 맞을 때만)로 채운다 */
  const areas = new Map();
  const addArea = (area_code, level, area_name, source_ref) => {
    const prev = areas.get(area_code);
    if (prev) { if (!prev.area_name && area_name) prev.area_name = area_name; return; }
    const parent_code = level === 'SGG' ? area_code.slice(0, 2) : level === 'BJD' ? area_code.slice(0, 5) : null;
    areas.set(area_code, { area_code, level, area_name, parent_code, source_ref });
  };
  for (const r of legalDong?.rows ?? []) areas.set(r.area_code, { ...r, source_ref: LEGAL_DONG_SOURCE });
  for (const s of molit.sido) addArea(s.code, s.code === '00' ? 'NATION' : 'SIDO', s.name, 'molit-permit-monthly');
  for (const [code, s] of Object.entries(sggNames)) addArea(code, 'SGG', s.name, 'stan-api');
  const bjdName = new Map(bundles.flatMap((b) => (b.region.codes || []).filter((c) => c.type === 'bjdong').map((c) => [`${c.code}00`, c.name])));
  const mapped = lhSgg.filter((m) => m.sgg_code);
  for (const m of mapped) addArea(m.sgg_code, 'SGG', m.sgg_name || null, 'stan-api');

  /* 기관 */
  for (const a of agencies) t.agencies.push({ agency_id: a.id, agency_name: a.name, stat_actor: a.actor ?? null, source_ref: 'housing-wave-manual' });

  /* 지역 번들 단지: 레지스트리의 bundle 참조로 사업에 붙는다 */
  const projectOfComplex = new Map(registry.projects.flatMap((p) => p.refs.filter((r) => r.system === 'bundle').map((r) => [`${r.key}/${r.value}`, p.id])));
  const complexOfProject = new Map();
  for (const { slug, region, projects } of bundles) {
    const src = `bundle-${slug}`;
    const label = Object.fromEntries((region.sources || []).map((s) => [s.id, s.label || '']));
    for (const c of projects) {
      const complex_id = `${slug}/${c.id}`, pid = projectOfComplex.get(complex_id) ?? null;
      if (pid) complexOfProject.set(pid, { c, slug });
      t.complexes.push({ complex_id, local_project_id: pid, region_slug: slug, complex_label: c.label, complex_name: c.name, status: c.status, sponsor_class: c.sponsorClass, housing_kind: c.kind ?? null, unit_count: Number.isInteger(c.units) ? c.units : null, move_in_month: /^\d{4}-\d{2}(-\d{2})?$/.test(c.moveIn ?? '') ? ym(c.moveIn) : null, progress_pct: c.progress?.rate ?? null, progress_as_of: c.progress?.asOf ?? null, source_ref: src });
      if (!pid) continue;
      const ev = (e) => t.events.push({ ...EVENT_BASE, local_project_id: pid, complex_id, observed_month: observedMonth, source_ref: src, ...e });
      for (const e of c.events || []) {
        if (!BUNDLE_EVENT[e.type]) continue;
        ev({ event_type: BUNDLE_EVENT[e.type], date_type: e.planned ? 'PLANNED' : 'ACTUAL', plan_basis: e.planned ? 'CURRENT' : null, ...dateOrMonth(e.date), progress_pct: e.type === 'progress' ? e.value ?? null : null, review_status: e.suspect ? 'REVIEW_REQUIRED' : 'CONFIRMED' });
      }
      const pr = c.progress;
      if (pr) {   // 공정율 이력과 공사기간(공통규격 v1.4 변환과 같은 규칙: 공정 기록이 있으면 착공은 실제, 100% 이고 기준일이 종료일 뒤면 준공은 실제)
        for (const [d, rate] of pr.history || []) ev({ event_type: 'PROGRESS', date_type: 'ACTUAL', plan_basis: null, ...dateOrMonth(d), progress_pct: rate, event_detail: `원천 ${pr.source}` });
        const started = (pr.history || []).length > 0, done = pr.rate === 100 && pr.asOf >= pr.end;
        if (pr.start) ev({ event_type: 'CONSTRUCTION_START', date_type: started ? 'ACTUAL' : 'PLANNED', plan_basis: started ? null : 'CURRENT', ...dateOrMonth(pr.start), event_detail: `원천 ${pr.source}` });
        if (pr.end) ev({ event_type: 'COMPLETION', date_type: done ? 'ACTUAL' : 'PLANNED', plan_basis: done ? null : 'CURRENT', ...dateOrMonth(pr.end), event_detail: `원천 ${pr.source}` });
      }
      if (/^\d{4}-\d{2}(-\d{2})?$/.test(c.moveIn ?? '')) ev({ event_type: 'MOVE_IN', date_type: 'PLANNED', plan_basis: 'CURRENT', ...dateOrMonth(c.moveIn) });   // 입주 시기는 월(공고) 또는 날짜(준공예정을 옮긴 값)
      if (Number.isInteger(c.units)) {   // 단지 세대수의 기준은 단지가 가리키는 원천으로 정한다: 모집공고 > 준공예정 > 주택인허가, 셋 다 아니면 검토
        const labels = (c.sources || []).map((id) => label[id] || id).join(' ');
        const q = /모집공고/.test(labels) ? 'NOTICE' : /준공예정/.test(labels) ? 'PUBLIC_PLAN' : /주택인허가/.test(labels) ? 'PERMIT' : 'PROJECT_PLAN';
        t.units.push({ local_project_id: pid, complex_id, quantity_type: q, housing_type: c.kind ?? null, unit_count: c.units, reference_period: null, unit_scope: 'SUBTYPE', source_ref: src, review_status: q === 'PROJECT_PLAN' ? 'REVIEW_REQUIRED' : 'CONFIRMED' });
      }
    }
  }

  /* 사업 원장: 레지스트리 그대로(번들 단지 사업은 BLOCK, 건축HUB 사업은 번지 단위 PROJECT) */
  for (const p of registry.projects) {
    const bundle = complexOfProject.get(p.id);
    const src = bundle ? `bundle-${bundle.slug}` : 'hub-hs-basis';
    const sponsor = bundle?.c.sponsor?.name;
    t.projects.push({
      local_project_id: p.id, project_name: p.name ?? null, project_unit: bundle ? 'BLOCK' : 'PROJECT', sgg_code: p.sgg,
      agency_id: AGENCY_OF_SPONSOR[sponsor] ?? null,
      public_scope: bundle ? (bundle.c.sponsorClass === 'public' ? 'PUBLIC' : 'PRIVATE_ON_PUBLIC_LAND') : 'UNKNOWN',
      public_basis: bundle ? `지역 번들 시행자: ${sponsor}` : null,
      stage_code: p.stageCode, as_of: p.asOf, issued_at: p.issuedAt, superseded_by: p.supersededBy ?? null, source_ref: src,
    });
    if (!sggNames[p.sgg]) addArea(p.sgg, 'SGG', null, 'housing-wave-registry');
    for (const r of p.refs) {
      if (r.system === 'bundle') t.identifiers.push({ local_project_id: p.id, id_type: 'BUNDLE_ID', id_value: `${r.key}/${r.value}`, id_issuer: 'HOUSING_WAVE', as_of: r.asOf ?? null, source_ref: `bundle-${r.key}`, match_status: 'CONFIRMED' });
      else t.identifiers.push({ local_project_id: p.id, id_type: r.system === 'hub-ap-basis' ? 'HUB_AP_PK' : r.system === 'manual' ? 'MANUAL' : 'HUB_HS_PK', id_value: String(r.value), id_issuer: r.system === 'manual' ? 'HOUSING_WAVE' : '국토교통부', as_of: r.asOf ?? null, source_ref: r.system === 'manual' ? 'housing-wave-registry' : 'hub-hs-basis', match_status: 'CONFIRMED' });
    }
    const pnus = p.pnus || [], withPnu = new Set(pnus.map((x) => x.slice(0, 10)));
    for (const pnu of pnus) t.project_locations.push({ local_project_id: p.id, bjd_code: pnu.slice(0, 10), pnu, pnu_scope: bundle ? 'REPRESENTATIVE' : 'SITE', source_ref: src });
    for (const bjd of p.bjdCodes) if (!withPnu.has(bjd)) t.project_locations.push({ local_project_id: p.id, bjd_code: bjd, pnu: null, pnu_scope: null, source_ref: src });
    for (const bjd of new Set([...p.bjdCodes, ...withPnu])) addArea(bjd, 'BJD', bjdName.get(bjd) ?? null, 'housing-wave-registry');
    if (!bundle && Number.isInteger(p.units)) t.units.push({ local_project_id: p.id, complex_id: null, quantity_type: 'PERMIT', housing_type: null, unit_count: p.units, reference_period: null, unit_scope: 'TOTAL', source_ref: 'hub-hs-basis', review_status: 'CONFIRMED' });
    if (!bundle) t.review_required.push({ review_type: 'PUBLIC_SCOPE_UNKNOWN', local_project_id: p.id, source_ref: 'hub-hs-basis', record_key: p.id, record_name: p.name ?? null, detail: `시군구 ${p.sgg} · 단계 ${p.stageCode}`, reason: '건축HUB 주택인허가에는 공공 여부를 판정할 근거(시행자 구분)가 없다' });
  }

  /* LH 준공예정: (지구, 블록)마다 사업 하나. 시군구 매핑이 있는 블록만 원장에 넣고(기존 사업이면 그 사업에, 아니면 다음 번호의 후보 id), 나머지는 검토 목록 */
  const groups = new Map();
  for (const b of lh.blocks) {
    const k = `${b.district}|${b.block}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(b);
  }
  const mapping = new Map(mapped.map((m) => [`${m.district}|${m.block}`, m]));
  const counters = { ...registry.counters }, lhCands = [];
  const order = [...groups.entries()].sort(([ka, a], [kb, b]) => Math.min(...a.map((x) => +new Date(x.date))) - Math.min(...b.map((x) => +new Date(x.date))) || ka.localeCompare(kb, 'ko'));
  for (const [key, rows] of order) {
    const [district, block] = key.split('|'), m = mapping.get(key);
    if (!m) {
      t.review_required.push({ review_type: 'SGG_UNRESOLVED', local_project_id: null, source_ref: LH_SOURCE, record_key: key, record_name: `${district} ${block}`, detail: rows[0].location, reason: '위치 글자에서 시군구 코드를 찾지 못했다(시군구 매핑 없음)' });
      continue;
    }
    let pid = m.local_project_id;
    if (!pid) {
      counters[m.sgg_code] = (counters[m.sgg_code] ?? 0) + 1;
      pid = `PRJ-${m.sgg_code}-${String(counters[m.sgg_code]).padStart(4, '0')}`;
      t.projects.push({ local_project_id: pid, project_name: `${district} ${block}`, project_unit: /^\d+$/.test(block) ? 'AREA_UNKNOWN' : 'BLOCK', sgg_code: m.sgg_code, agency_id: 'lh', public_scope: 'PUBLIC', public_basis: 'LH 공공주택 준공예정현황', stage_code: '04', as_of: lh.sourceAsOf, issued_at: null, superseded_by: null, source_ref: LH_SOURCE });
      if (m.bjd_code) {   // 위치 글자의 동 이름으로 찾은 법정동(필지는 모른다 → 지도에서는 위치 미연결)
        t.project_locations.push({ local_project_id: pid, bjd_code: m.bjd_code, pnu: null, pnu_scope: null, source_ref: LH_SOURCE });
        addArea(m.bjd_code, 'BJD', null, LH_SOURCE);
      }
    }
    lhCands.push({ pid, district, block, sgg: m.sgg_code, bjd: m.bjd_code ?? null, registry: !!m.local_project_id });
    t.identifiers.push({ local_project_id: pid, id_type: 'AREA_BLOCK', id_value: key, id_issuer: 'LH', as_of: lh.sourceAsOf, source_ref: LH_SOURCE, match_status: 'CONFIRMED' });
    for (const d of [...new Set(rows.map((r) => r.date))].sort()) {
      t.events.push({ ...EVENT_BASE, local_project_id: pid, event_type: 'COMPLETION', date_type: 'PLANNED', plan_basis: 'CURRENT', event_date: d, event_month: null, event_detail: rows.filter((r) => r.date === d).map((r) => r.type).join('·'), observed_month: observedMonth, source_ref: LH_SOURCE });
    }
    for (const r of rows) t.units.push({ local_project_id: pid, complex_id: null, quantity_type: 'PUBLIC_PLAN', housing_type: r.type, unit_count: r.units, reference_period: ym(r.date), unit_scope: 'SUBTYPE', source_ref: LH_SOURCE, review_status: 'CONFIRMED' });
  }

  /* 건축HUB 주택인허가 전국 대용량(tools/ledger/hub-bulk.js 중간 스냅샷): 기록을 lib/permits.js 처럼 필지·블록 단위로 모아 발급 전 후보 사업(issued_at null)으로 싣는다.
     ① 레지스트리 사업의 관리번호·필지와 겹치는 묶음은 새로 싣지 않는다(레지스트리의 API 스냅샷 이벤트가 정본). 레지스트리에 없던 같은 필지의 관리번호만 그 사업의 식별자로 붙인다.
     ② 시군구·블록 코드·지구 이름이 맞는 LH 준공예정 블록이 하나뿐인 묶음은 새 사업 대신 그 LH 후보에 관리번호·이벤트·물량을 붙인다
        (한 블록에 묶음이 여럿 — 블록 표기만 다른 허가 — 이면 모두 한 사업으로 합친다. LH 블록이 레지스트리 사업이면 관리번호만).
        맞는 블록이 둘 이상이면 검토 목록(LINK_CANDIDATE)에 두고 따로 싣는다.
     ③ 후보 id 는 hubIds(관리번호 → id)를 먼저 쓰고, 새 묶음만 시군구마다 레지스트리 카운터·LH 후보·기존 매핑 중 가장 큰 번호 다음을 준다.
     시군구를 못 찾은 기록(옛 코드도 못 이은 것)은 검토 목록(SGG_UNRESOLVED)에 둔다. 공공 여부는 알 수 없어 UNKNOWN 이다. */
  if (hubBulk) {
    if (!legalDong?.abolished) throw new Error('hubBulk 에는 legalDong(폐지 행 포함)이 필요하다');
    const ref = `hub-bulk-hs-${hubBulk.dataMonth}`, asOfB = hubBulk.dataAsOf, now = Date.parse(`${asOfB}T00:00:00Z`);
    t.sources.push({ ...own, source_ref: ref, provider: '국토교통부 건축HUB', dataset_name: `건축HUB 대용량 제공 주택인허가(기본개요·행위개요·대지위치) ${hubBulk.dataMonth} 데이터`, source_url: 'https://www.hub.go.kr/portal/opn/lps/idx-lgcpt-pvsn-srvc-list.do', source_record_key: '관리_주택대장_PK', data_as_of: asOfB, collected_at: hubBulk.collectedAt, original_filename: hubBulk.files.join(' · '), notes: '전국 주택인허가 중 사업승인일·총세대수가 있고 2025-01 전에 사용검사하지 않았으며 진행 중(2025 이후 사용검사 · 2021-10 이후 승인 · 2018 이후 착공 · 2015 이후 승인이고 2025 이후 사용검사 예정 중 하나)인 기록(tools/ledger/hub-bulk.js). 필지·블록 단위로 모은 후보 사업과 그 일정·물량.', record_count: hubBulk.records.length, used_by: ['/'] });
    const mapper = codeMapper(legalDong.rows, legalDong.abolished);
    const regPks = new Map(registry.projects.flatMap((p) => p.refs.filter((r) => r.system === 'hub-hs-basis').map((r) => [String(r.value), p.id])));
    const regPnus = new Map(registry.projects.flatMap((p) => (p.pnus || []).map((x) => [x, p.id])));
    const byKey = new Map();
    Object.assign(report, { records: hubBulk.records.length, unresolved: 0, groups: 0, registryGroups: 0, registryPks: 0, lhMatchedGroups: 0, lhMatched: 0, lhMatchedRegistry: 0, lhAmbiguous: 0, reusedIds: 0, newIds: 0, idConflicts: 0 });
    for (const rec of hubBulk.records) {
      const at = locate(rec, mapper);
      if (!at.sgg) {
        report.unresolved++;
        t.review_required.push({ review_type: 'SGG_UNRESOLVED', local_project_id: null, source_ref: ref, record_key: rec.pk, record_name: rec.name || rec.complex || null, detail: `시군구 ${rec.sgg || '(빈칸)'} · 법정동 ${rec.bjd || '(빈칸)'} · ${rec.address || '(주소 없음)'} · ${rec.households}세대`, reason: '시군구 코드가 법정동코드 파일(존재 행)에 없고 폐지 행 이름으로도 지금 코드를 찾지 못했다' });
        continue;
      }
      const k = groupKey(rec, at);
      if (!byKey.has(k)) byKey.set(k, { key: k, at, recs: [] });
      byKey.get(k).recs.push(rec);
    }
    const groups = [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    report.groups = groups.length;
    const lhIdx = lhCands.map((c) => ({ ...c, blk: normBlock(c.block), token: districtToken(c.district) })).filter((c) => c.blk && c.token);
    for (const g of groups) {
      g.pks = g.recs.map((r) => r.pk);
      g.registry = regPks.get(g.pks.find((k) => regPks.has(k))) ?? regPnus.get(g.at.pnu) ?? null;
      if (g.registry) { report.registryGroups++; report.registryPks += g.pks.length; continue; }
      const blks = new Set(g.recs.map((r) => normBlock(r.block)).filter(Boolean)), text = g.recs.map((r) => `${r.name}${r.complex ?? ''}${r.special}${r.address}`).join('').replace(/\s/g, '');
      g.lh = lhIdx.filter((c) => c.sgg === g.at.sgg && blks.has(c.blk) && text.includes(c.token));
      if (g.lh.length === 1) { g.match = g.lh[0]; report.lhMatchedGroups++; continue; }
      if (!g.lh.length) continue;
      report.lhAmbiguous++;
      for (const c of g.lh) t.review_required.push({ review_type: 'LINK_CANDIDATE', local_project_id: c.pid, source_ref: ref, record_key: g.pks.join(','), record_name: g.recs[0].name || g.recs[0].complex || null, detail: `LH ${c.district} ${c.block} ↔ 건축HUB 묶음 ${g.key} (이 묶음에 맞는 LH 블록 ${g.lh.length}개: ${g.lh.map((x) => x.pid).join(', ')})`, reason: '시군구·블록 코드·지구 이름이 맞는 LH 블록이 둘 이상이라 자동으로 잇지 않았다(건축HUB 후보로 따로 실었다)' });
    }
    /* 후보 id: 매핑 → 새 번호 */
    const seq = { ...counters }, used = new Set(t.projects.map((p) => p.local_project_id));
    for (const id of Object.values(hubIds)) { const [, sgg, n] = /^PRJ-(\d{5})-(\d{4})$/.exec(id); seq[sgg] = Math.max(seq[sgg] ?? 0, +n); }
    const fresh = [];
    for (const g of groups) {
      if (g.registry || g.match) continue;
      const known = [...new Set(g.pks.map((k) => hubIds[k]).filter(Boolean))].sort().filter((id) => !used.has(id));
      if (g.pks.some((k) => hubIds[k]) && known.length !== 1) report.idConflicts++;
      if (known.length) { g.id = known[0]; used.add(g.id); report.reusedIds++; } else fresh.push(g);
    }
    const firstPermit = (g) => g.recs.map((r) => r.apprv).sort()[0];
    fresh.sort((a, b) => a.at.sgg.localeCompare(b.at.sgg) || firstPermit(a).localeCompare(firstPermit(b)) || (a.key < b.key ? -1 : 1));
    for (const g of fresh) {
      const n = (seq[g.at.sgg] ?? 0) + 1;
      if (n > 9999) throw new Error(`시군구 ${g.at.sgg} 의 후보 일련이 9999 를 넘는다`);
      seq[g.at.sgg] = n; g.id = `PRJ-${g.at.sgg}-${String(n).padStart(4, '0')}`; used.add(g.id); report.newIds++;
    }
    /* 싣기: 묶음들(gs)의 기록을 사업 pid 하나로. own 이면 사업 행을 만들고, LH 블록이 레지스트리 사업이면 관리번호만 */
    const located = new Set(t.project_locations.map((l) => `${l.local_project_id}|${l.bjd_code}|${l.pnu}`));
    const load = (pid, gs, { own, idsOnly }) => {
      const recs = gs.flatMap((g) => g.recs).sort((a, b) => (a.pk < b.pk ? -1 : 1));
      for (const r of recs) t.identifiers.push({ local_project_id: pid, id_type: 'HUB_HS_PK', id_value: r.pk, id_issuer: '국토교통부', as_of: asOfB, source_ref: ref, match_status: 'CONFIRMED' });
      if (idsOnly) return;
      const pe = recs.map((r) => permitEvents({ mgmHsrgstPk: r.pk, apprvDay: r.apprv?.replace(/-/g, ''), stcnsDay: r.stcns?.replace(/-/g, ''), useInsptDay: r.insp?.replace(/-/g, ''), totHhldCnt: r.households }, now));
      const suspect = new Set(pe.flat().filter((e) => e.suspect).map((e) => `${e.ref}|${SUSPECT_FIELD[e.type]}`));
      if (own) {
        const g = gs[0], named = recs.filter((r) => r.name || r.complex), latest = named.reduce((b, r) => (!b || r.apprv > b.apprv ? r : b), null);
        t.projects.push({ local_project_id: pid, project_name: latest ? latest.name || latest.complex : null, project_unit: !g.at.pnu && g.key.startsWith('B') ? 'BLOCK' : 'PROJECT', sgg_code: g.at.sgg, agency_id: null, public_scope: 'UNKNOWN', public_basis: null, stage_code: stageOf(statusOf(pe.flat(), now), { approvedAt: true }), as_of: asOfB, issued_at: null, superseded_by: null, source_ref: ref });
      }
      for (const [event_type, date_type, field, pick] of HUB_BULK_FIELDS) {
        const vals = recs.filter((r) => r[field] && !suspect.has(`${r.pk}|${field}`)).sort((a, b) => (a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0));
        if (!vals.length) continue;
        const r = pick === 'first' ? vals[0] : vals[vals.length - 1];
        t.events.push({ ...EVENT_BASE, local_project_id: pid, event_type, date_type, plan_basis: date_type === 'PLANNED' ? 'CURRENT' : null, event_date: r[field], event_month: null, event_detail: `관리번호 ${r.pk}`, observed_month: observedMonth, source_ref: ref });
      }
      const units = recs.reduce((b, r) => (!b || r.apprv > b.apprv || (r.apprv === b.apprv && r.households > b.households) ? r : b), null).households;   // 가장 늦은 허가의 총세대수(lib/permits.js aggregate)
      t.units.push({ local_project_id: pid, complex_id: null, quantity_type: 'PERMIT', housing_type: null, unit_count: units, reference_period: null, unit_scope: 'TOTAL', source_ref: ref, review_status: 'CONFIRMED' });
      for (const { at } of gs) {
        const bjd = at.pnu ? at.pnu.slice(0, 10) : at.bjd, k = `${pid}|${bjd}|${at.pnu}`;
        if (!bjd || located.has(k)) continue;
        located.add(k);
        t.project_locations.push({ local_project_id: pid, bjd_code: bjd, pnu: at.pnu, pnu_scope: at.pnu ? 'SITE' : null, source_ref: ref });
      }
    };
    const toLh = new Map();
    for (const g of groups) {
      if (g.registry) load(g.registry, [{ recs: g.recs.filter((r) => !regPks.has(r.pk)) }], { idsOnly: true });
      else if (g.match) (toLh.get(g.match.pid) || toLh.set(g.match.pid, []).get(g.match.pid)).push(g);
      else load(g.id, [g], { own: true });
    }
    for (const [pid, gs] of toLh) {
      report[gs[0].match.registry ? 'lhMatchedRegistry' : 'lhMatched']++;
      load(pid, gs, { own: false, idsOnly: gs[0].match.registry });
    }
  }

  /* 건축HUB 스냅샷(tools/ledger/snapshot.js)이 만든 이벤트는 그대로 싣는다 */
  t.events.push(...hubEvents);

  if (national) addNational(t, { ...national, legalDong, observedMonth, own, report });

  /* 통계 실적: 지표 × 시도 × 월 × (총계 + 시행주체) */
  for (const [metric, m] of Object.entries(molit.metrics)) {
    const source_ref = { permit: 'molit-permit-monthly', start: 'molit-start-monthly', complete: 'molit-complete-monthly', sale: 'molit-sale-apt' }[metric];
    for (const [sido_code, s] of Object.entries(m.series)) {
      molit.months.forEach((month, i) => {
        const base = { metric, stage_code: METRIC_STAGE[metric], sido_code, ym: month, provisional: molit.provisional.includes(month), source_ref };
        t.stat_facts.push({ ...base, actor: 'TOTAL', value: s.total[i] });
        for (const [actor, values] of Object.entries(s.actors || {})) t.stat_facts.push({ ...base, actor, value: values[i] });
      });
    }
  }

  t.areas = [...areas.values()].sort((a, b) => a.area_code.localeCompare(b.area_code));
  return t;
}

/* 전국 모집공고(마이홈 공공주택 모집공고 · LH 분양임대공고문)와 한국부동산원 입주예정물량을 원장에 더한다(t 를 고친다).
   공고: 공고 하나에 notices 한 행. 마이홈 공고의 LH 링크 panId 가 LH 목록의 PAN_ID 와 같으면 한 공고로 보고 (LH, PAN_ID) 로 싣되, 행의 값(제목·날짜·필지·시군구)은
     마이홈에서 가져와 source_ref 는 마이홈이다(LH 쪽은 notice_id 가 가리킨다). LH 목록에만 있는 공고는 LH 값(시도뿐이라 시군구·필지 없음), 마이홈에만 있는 공고는 (MYHOME, pblancId).
   연결: 마이홈 행의 19자리 필지(옛 코드는 지금 코드로)가 사업 위치 필지와 같을 때만 잇는다(이름만 같은 것은 잇지 않고 report.noticeNameOnly 로 센다).
     자동 연결이라 notice_links·SUPPLY_NOTICE 이벤트는 REVIEW_REQUIRED(스키마: 사람이 확인한 연결만 CONFIRMED). 이벤트 날짜는 공고일(실제), 접수 기간은 event_detail.
     연결된 건축HUB 대용량 후보의 기관이 비었으면 공급기관으로 채우고(LH → lh · SH → sh · GH → gh · 도시·개발공사 → local) 근거를 public_basis 에 적는다.
   입주예정: 지번 주소 → 필지(map-lh.js jibunToPnu)가 사업 위치 필지와 같으면 MOVE_IN 예정(CURRENT, 월). 사업은 만들지 않는다. 시군구를 못 찾은 주소만 검토 목록 */
function addNational(t, { myhome, lhNotice, moveIn, legalDong, observedMonth, own, report }) {
  if (!legalDong?.abolished) throw new Error('national 에는 legalDong(폐지 행 포함)이 필요하다');
  const rep = (report.national = {});
  const mapper = codeMapper(legalDong.rows, legalDong.abolished), idx = nameIndex(legalDong.rows);
  const day = (s) => cleanDate(String(s ?? '').replace(/\D/g, ''));
  const used = ['/'];
  t.sources.push({ ...own, source_ref: MYHOME_SOURCE, provider: '국토교통부 마이홈포털(공공데이터포털)', dataset_name: '마이홈포털 공공주택 모집공고(HWSPR02) 임대·분양', source_url: myhome.endpoint.join(' · '), source_record_key: 'pblancId·houseSn', data_as_of: myhome.fetchedAt.slice(0, 10), collected_at: myhome.fetchedAt, notes: '받은 날의 전국 현재 공고(tools/ledger/collect-national.js). 필지(pnu)가 사업 위치 필지와 같은 공고만 사업에 이었다.', record_count: myhome.rows.length, used_by: used });
  t.sources.push({ ...own, source_ref: LH_NOTICE_SOURCE, provider: '한국토지주택공사(공공데이터포털)', dataset_name: '15058530 분양임대공고문 조회(+15056765 공급정보)', source_url: lhNotice.endpoint.join(' · '), source_record_key: 'PAN_ID', data_as_of: lhNotice.fetchedAt.slice(0, 10), collected_at: lhNotice.fetchedAt, notes: `공고일 2024-01-01 이후 공고 목록(지역은 시도뿐). 공급정보 ${lhNotice.supply.length}건은 단지명·세대수뿐이라 이름 대조 건수만 셌다.`, record_count: lhNotice.notices.length, used_by: [] });
  t.sources.push({ ...own, source_ref: MOVE_IN_SOURCE, provider: '한국부동산원(공공데이터포털)', dataset_name: '15111714 주택공급정보 입주예정물량정보', source_url: 'https://www.data.go.kr/data/15111714/fileData.do', source_record_key: '주소(지번)·아파트명', data_as_of: moveIn.dataAsOf, collected_at: moveIn.fetchedAt, original_filename: moveIn.filename, notes: '30세대 이상 공동주택 입주예정 월(지번 주소). 주소의 필지가 사업 위치 필지와 같은 행만 MOVE_IN 예정으로 실었다.', record_count: moveIn.rows.length, used_by: used });

  /* 사업 위치 필지 → 사업들 */
  const byPnu = new Map();
  for (const l of t.project_locations) if (l.pnu) (byPnu.get(l.pnu) || byPnu.set(l.pnu, new Set()).get(l.pnu)).add(l.local_project_id);
  const nowPnu = (pnu) => { const b = /^\d{19}$/.test(pnu ?? '') ? mapper.bjd(pnu.slice(0, 10)) : null; return b ? b + pnu.slice(10) : null; };
  const sggOfNames = (sido, sgg) => { const n = normalize(`${sido} ${sgg ?? ''}`.trim()); return n.method === 'RULE_SEJONG' ? '36110' : idx.sggByName.get(n.tokens.join(' '))?.area_code ?? null; };

  /* 공고 */
  const lhById = new Map(lhNotice.notices.map((n) => [n.PAN_ID, n]));
  const groups = new Map();
  for (const r of myhome.rows) {
    const pan = /[?&]panId=([^&]+)/.exec(r.url ?? '')?.[1];
    const key = pan && lhById.has(pan) ? `LH|${pan}` : `MYHOME|${r.pblancId}`;
    (groups.get(key) || groups.set(key, []).get(key)).push({ ...r, pnu19: nowPnu(r.pnu) });
  }
  const notices = new Map();
  for (const [key, rows] of groups) {
    const [system, id] = key.split('|');
    const main = rows.reduce((b, r) => (+r.pblancId > +b.pblancId ? r : b));   // 한 PAN_ID 에 마이홈 공고가 둘이면 나중 것
    const sggs = new Set(rows.map((r) => r.pnu19?.slice(0, 5) ?? sggOfNames(r.brtcNm, r.signguNm)));
    const pnus = new Set(rows.map((r) => r.pnu19));
    notices.set(key, { rows, supplier: main.suplyInsttNm, row: { notice_system: system, notice_id: id, notice_title: main.pblancNm, sgg_code: sggs.size === 1 ? [...sggs][0] : null, pnu: pnus.size === 1 ? [...pnus][0] : null, announced_on: day(main.rcritPblancDe), apply_start: day(main.beginDe), apply_end: day(main.endDe), observed_on: myhome.fetchedAt.slice(0, 10), source_ref: MYHOME_SOURCE } });
  }
  for (const n of lhNotice.notices) {
    if (notices.has(`LH|${n.PAN_ID}`)) continue;
    notices.set(`LH|${n.PAN_ID}`, { rows: [], row: { notice_system: 'LH', notice_id: n.PAN_ID, notice_title: n.PAN_NM, sgg_code: null, pnu: null, announced_on: day(n.PAN_NT_ST_DT), apply_start: null, apply_end: day(n.CLSG_DT), observed_on: lhNotice.fetchedAt.slice(0, 10), source_ref: LH_NOTICE_SOURCE } });
  }
  const keys = [...notices.keys()].sort();
  t.notices.push(...keys.map((k) => notices.get(k).row));
  Object.assign(rep, { myhomeRows: myhome.rows.length, myhomeNotices: groups.size, lhNotices: lhNotice.notices.length, merged: [...groups.keys()].filter((k) => k.startsWith('LH|')).length, notices: keys.length });

  /* 필지 연결 → notice_links · SUPPLY_NOTICE · 기관 추정 */
  const projectById = new Map(t.projects.map((p) => [p.local_project_id, p]));
  const supplierOf = new Map();
  for (const k of keys) {
    const { rows, row, supplier } = notices.get(k), linked = new Map();
    for (const r of [...rows].sort((a, b) => +a.pblancId - +b.pblancId || a.houseSn - b.houseSn)) for (const pid of byPnu.get(r.pnu19) ?? []) if (!linked.has(pid)) linked.set(pid, r);
    for (const [pid, r] of [...linked].sort(([a], [b]) => a.localeCompare(b))) {
      t.notice_links.push({ notice_system: row.notice_system, notice_id: row.notice_id, local_project_id: pid, evidence: `마이홈 공고 ${r.pblancId}-${r.houseSn} ${r.hsmpNm || '(단지명 없음)'} 필지 ${r.pnu19} = 사업 위치 필지`, review_status: 'REVIEW_REQUIRED', source_ref: MYHOME_SOURCE });
      if (row.announced_on) t.events.push({ ...EVENT_BASE, local_project_id: pid, event_type: 'SUPPLY_NOTICE', date_type: 'ACTUAL', plan_basis: null, event_date: row.announced_on, event_month: null, event_detail: `공고 ${row.notice_system} ${row.notice_id} · 접수 ${row.apply_start ?? '?'} ~ ${row.apply_end ?? '?'}`, observed_month: observedMonth, source_ref: MYHOME_SOURCE, review_status: 'REVIEW_REQUIRED' });
      (supplierOf.get(pid) || supplierOf.set(pid, []).get(pid)).push({ supplier, row, pnu: r.pnu19 });
    }
  }
  Object.assign(rep, { links: t.notice_links.length, linkedNotices: new Set(t.notice_links.map((l) => l.notice_id)).size, linkedProjects: supplierOf.size, agencyInferred: {}, agencyConflicts: 0 });
  for (const [pid, xs] of supplierOf) {
    const p = projectById.get(pid);
    if (!p.source_ref.startsWith('hub-bulk-hs-') || p.agency_id) continue;
    const ids = new Set(xs.map((x) => agencyOfSupplier(x.supplier)));
    if (ids.size !== 1 || ids.has(null)) { rep.agencyConflicts++; continue; }
    const x = xs[0];
    Object.assign(p, { agency_id: [...ids][0], public_scope: 'PUBLIC', public_basis: `마이홈 모집공고 공급기관 ${x.supplier}(공고 ${x.row.notice_system} ${x.row.notice_id}, 필지 ${x.pnu} 일치 — 자동 연결, 확인 필요)` });
    rep.agencyInferred[p.agency_id] = (rep.agencyInferred[p.agency_id] ?? 0) + 1;
  }
  /* 이름만 맞는 후보(잇지 않고 세기만): 연결 안 된 공고의 단지명(마이홈 hsmpNm · LH 공급정보 SBD_LGO_NM)이 사업 이름과 공백·괄호를 빼고 같다 */
  const norm = (s) => String(s ?? '').replace(/\(.*?\)/g, '').replace(/\s/g, '');
  const byName = new Set(t.projects.map((p) => norm(p.project_name)).filter((x) => x.length >= 3));
  const lhNames = new Map(lhNotice.supply.map((s) => [s.PAN_ID, (s.response ?? []).flatMap((x) => x.dsList01 ?? []).map((d) => d.SBD_LGO_NM)]));
  const linkedKeys = new Set(t.notice_links.map((l) => `${l.notice_system}|${l.notice_id}`));
  rep.noticeNameOnly = keys.filter((k) => !linkedKeys.has(k) && [...notices.get(k).rows.map((r) => r.hsmpNm), ...(k.startsWith('LH|') ? lhNames.get(k.slice(3)) ?? [] : [])].some((n) => byName.has(norm(n)))).length;

  /* 입주예정 */
  const mi = { rows: moveIn.rows.length, badMonth: 0, parseFailed: {}, noProject: 0, matchedRows: 0, events: 0, projects: 0, multiMonthProjects: 0 };
  const plans = new Map();
  for (const r of moveIn.rows) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(r.month)) { mi.badMonth++; continue; }
    const at = jibunToPnu(r.address, idx);
    if (at.error) {
      mi.parseFailed[at.error] = (mi.parseFailed[at.error] ?? 0) + 1;
      if (at.error === 'SGG') t.review_required.push({ review_type: 'SGG_UNRESOLVED', local_project_id: null, source_ref: MOVE_IN_SOURCE, record_key: r.address, record_name: r.name || null, detail: `입주예정 ${r.month} · ${r.units}세대 · ${r.type}`, reason: '지번 주소에서 시군구 코드를 찾지 못했다' });
      continue;
    }
    const pids = byPnu.get(at.pnu);
    if (!pids) { mi.noProject++; continue; }
    mi.matchedRows++;
    for (const pid of pids) {
      const k = `${pid}|${r.month}`;
      if (!plans.has(k)) plans.set(k, { pid, month: r.month, names: [] });
      plans.get(k).names.push(`${r.name} ${r.units}세대(${r.type})`);
    }
  }
  for (const p of [...plans.values()].sort((a, b) => a.pid.localeCompare(b.pid) || a.month.localeCompare(b.month))) {
    t.events.push({ ...EVENT_BASE, local_project_id: p.pid, event_type: 'MOVE_IN', date_type: 'PLANNED', plan_basis: 'CURRENT', event_date: null, event_month: p.month, event_detail: p.names.join(' · '), observed_month: observedMonth, source_ref: MOVE_IN_SOURCE });
  }
  const months = new Map();
  for (const p of plans.values()) months.set(p.pid, (months.get(p.pid) ?? 0) + 1);
  Object.assign(mi, { events: plans.size, projects: months.size, multiMonthProjects: [...months.values()].filter((n) => n > 1).length });
  rep.moveIn = mi;
}

/* 저장소에서 입력을 읽는다. 시군구 이름 표(SGG)는 lib/board/data.ts 안에 있고 그 파일은 JSON 을 import 해 Node 가 바로 못 읽으므로
   tests/js/board.test.cjs 와 같은 방법으로 객체 글자만 꺼낸다. */
function loadInputs({ observedMonth = '2026-10', lhSgg, hubEvents, legalDong, hubBulk, hubIds, national } = {}) {
  const json = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
  const src = fs.readFileSync(path.join(ROOT, 'lib/board/data.ts'), 'utf8');
  const sggNames = Function(`return (${/export const SGG[^=]*= (\{[\s\S]*?\n\});/.exec(src)[1]})`)();
  return {
    registry: json('registry/projects.json'), molit: json('data/board/molit.json'), lh: json('data/board/lh-completion.json'), catalog: json('data/board/sources.json'),
    bundles: SLUGS.map((slug) => ({ slug, region: json(`regions/${slug}/region.json`), projects: json(`regions/${slug}/projects.json`).projects })),
    agencies: require(path.join(ROOT, 'lib/board/agencies.ts')).AGENCIES,
    sggNames, lhSgg: lhSgg ?? [], hubEvents: hubEvents ?? [], legalDong: legalDong ?? null, hubBulk: hubBulk ?? null, hubIds: hubIds ?? {}, national: national ?? null, observedMonth,
  };
}

/* 건축HUB 대용량 중간 스냅샷(hub-bulk.js 가 쓴 파일과 그 manifest) → convert 의 hubBulk 입력 */
function readHubBulk(file) {
  const { records } = JSON.parse(fs.readFileSync(file, 'utf8'));
  const m = JSON.parse(fs.readFileSync(file.replace(/\.json$/, '.manifest.json'), 'utf8'));
  return { dataMonth: m.data_month, dataAsOf: m.data_as_of, collectedAt: m.fetched_at.slice(0, 10), files: Object.values(m.files).map((f) => f.zip), records };
}
/* 전국 모집공고·입주예정 원본 폴더(schemas/ledger-YYYY-MM/raw: myhome · lh-notice · move-in, tools/ledger/collect-national.js) → convert 의 national 입력.
   입주예정 CSV 는 따옴표 칸(쉼표 포함)을 받고, 기준일은 원본 파일 이름 끝의 날짜(…_20260630.csv) */
function readNational(raw) {
  const json = (p) => JSON.parse(fs.readFileSync(path.join(raw, p), 'utf8'));
  const my = json('myhome/manifest.json'), lhm = json('lh-notice/manifest.json'), mm = json('move-in/manifest.json');
  const cells = (line) => [...`${line},`.matchAll(/("(?:[^"]|"")*"|[^,]*),/g)].map((m) => m[1].replace(/^"|"$/g, '').replace(/""/g, '"').trim());
  const [, ...lines] = fs.readFileSync(path.join(raw, 'move-in', mm.files.utf8_copy.name), 'utf8').split(/\r?\n/).filter(Boolean);
  const d = /(\d{4})(\d{2})(\d{2})\.csv$/.exec(mm.files.original.name);
  return {
    myhome: { rows: [...json('myhome/rental.json').items, ...json('myhome/sale.json').items], fetchedAt: my.fetched_at, endpoint: my.endpoint },
    lhNotice: { notices: json('lh-notice/notices.json').items, supply: json('lh-notice/supply.json').items, fetchedAt: lhm.fetched_at, endpoint: lhm.endpoint },
    moveIn: { rows: lines.map(cells).map(([month, region, type, address, name, units]) => ({ month, region, type, address, name, units: Number(units) })), dataAsOf: `${d[1]}-${d[2]}-${d[3]}`, fetchedAt: mm.fetched_at, filename: mm.files.original.name },
  };
}
/* 후보 id 매핑 파일: 지금 표의 건축HUB 대용량 후보(그 원천이 만든 사업)의 관리번호 → id 를 이전 매핑에 더한다(지우지 않는다). 관리번호 순, 한 항목 한 줄 */
function mergeHubIds(prev, tables) {
  const bulk = new Set(tables.projects.filter((p) => p.source_ref.startsWith('hub-bulk-hs-')).map((p) => p.local_project_id));
  const ids = { ...prev };
  for (const r of tables.identifiers) if (r.id_type === 'HUB_HS_PK' && bulk.has(r.local_project_id)) ids[r.id_value] ??= r.local_project_id;
  return Object.fromEntries(Object.keys(ids).sort().map((k) => [k, ids[k]]));
}
const renderHubIds = (ids) => `{\n${Object.entries(ids).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n}\n`;

module.exports = { convert, loadInputs, readHubBulk, readNational, mergeHubIds, renderHubIds };

/* 실행: node tools/ledger/convert.js [--month 2026-10] [--lh-sgg <매핑.json>] [--hub-events <스냅샷.json>] [--legal-dong <법정동코드 원본>]
     [--hub-bulk <중간 스냅샷.json> --hub-ids <후보 id 매핑.json>] [--national <raw 폴더>] [--out <폴더>]
   --out 을 주면 검증을 통과했을 때만 표마다 <폴더>/<표>.json 을 쓰고(한 행 한 줄 — 변경을 줄 단위로 보려고), --hub-ids 파일에 새 후보 id 를 더한다. */
if (require.main === module) {
  const { validate } = require('./validate');
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
  const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
  const dong = arg('--legal-dong'), idsFile = arg('--hub-ids'), report = {};
  const hubIds = idsFile && fs.existsSync(idsFile) ? readJson(idsFile) : {};
  const tables = convert({ ...loadInputs({
    observedMonth: arg('--month') ?? '2026-10',
    lhSgg: arg('--lh-sgg') ? readJson(arg('--lh-sgg')) : [],
    hubEvents: arg('--hub-events') ? readJson(arg('--hub-events')).rows : [],
    legalDong: dong ? require('./legal-dong').parseLegalDong(fs.readFileSync(dong), path.basename(dong)) : null,
    hubBulk: arg('--hub-bulk') ? readHubBulk(arg('--hub-bulk')) : null, hubIds,
    national: arg('--national') ? readNational(arg('--national')) : null,
  }), report });
  for (const [name, rows] of Object.entries(tables)) console.log(`${name.padEnd(18)} ${rows.length}`);
  if (Object.keys(report).length) console.log('건축HUB 대용량·공고·입주예정', JSON.stringify(report));
  const errors = validate(tables);
  console.log(errors.length ? `검증 실패 ${errors.length}건\n${errors.slice(0, 30).join('\n')}` : '검증 통과');
  process.exitCode = errors.length ? 1 : 0;
  const out = arg('--out');
  if (out && !errors.length) {
    fs.mkdirSync(out, { recursive: true });
    for (const [table, rows] of Object.entries(tables)) {
      fs.writeFileSync(path.join(out, `${table}.json`), `{"schema_version":"ledger/1","table":"${table}","rows":[\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`);
    }
    console.log(`표 ${Object.keys(tables).length}개를 ${out} 에 썼다`);
    if (idsFile) fs.writeFileSync(idsFile, renderHubIds(mergeHubIds(hubIds, tables)));
  }
}
