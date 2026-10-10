'use strict';
/* 지금 가진 자료(사업 레지스트리·통계누리·LH 준공예정·원천 카탈로그·지역 번들)를 사업 원장 표(schemas/ledger, 문서 docs/product/데이터셋-스키마.md)로 옮긴다.
   순수 함수다: 파일을 쓰지 않고 레지스트리도 고치지 않는다. LH 블록에 줄 사업 id 는 레지스트리 카운터 다음 번호로 계산만 하는 후보(issued_at null)이고,
   실제 발급은 scripts/issue-projects.js 의 일이다.
   실행: node tools/ledger/convert.js [--lh-sgg <매핑.json>]  → 표별 행 수와 검증 결과를 출력한다. */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SLUGS = ['incheon-gyeyang', 'gwangju-gwangsan', 'jeonnam-naju'];
const LH_SOURCE = 'datagokr-15141761';
const LEGAL_DONG_SOURCE = 'datagokr-15123287';
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

/* inputs: { observedMonth: 'YYYY-MM'(이벤트를 관측한 달 = 찍은 달), registry, molit, lh, catalog, bundles: [{ slug, region, projects }], agencies, sggNames: { 시군구5: { name } },
     lhSgg?: [{ district, block, sgg_code, sgg_name, bjd_code?, local_project_id? }](sgg_code 가 없는 항목은 못 찾은 블록), hubEvents?: 건축HUB 스냅샷의 events 행, legalDong?: { asOf, rows: areas 행(법정동코드 파일) } } */
function convert({ observedMonth, registry, molit, lh, catalog, bundles, agencies, sggNames, lhSgg = [], hubEvents = [], legalDong = null }) {
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
  const counters = { ...registry.counters };
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
    t.identifiers.push({ local_project_id: pid, id_type: 'AREA_BLOCK', id_value: key, id_issuer: 'LH', as_of: lh.sourceAsOf, source_ref: LH_SOURCE, match_status: 'CONFIRMED' });
    for (const d of [...new Set(rows.map((r) => r.date))].sort()) {
      t.events.push({ ...EVENT_BASE, local_project_id: pid, event_type: 'COMPLETION', date_type: 'PLANNED', plan_basis: 'CURRENT', event_date: d, event_month: null, event_detail: rows.filter((r) => r.date === d).map((r) => r.type).join('·'), observed_month: observedMonth, source_ref: LH_SOURCE });
    }
    for (const r of rows) t.units.push({ local_project_id: pid, complex_id: null, quantity_type: 'PUBLIC_PLAN', housing_type: r.type, unit_count: r.units, reference_period: ym(r.date), unit_scope: 'SUBTYPE', source_ref: LH_SOURCE, review_status: 'CONFIRMED' });
  }

  /* 건축HUB 스냅샷(tools/ledger/snapshot.js)이 만든 이벤트는 그대로 싣는다 */
  t.events.push(...hubEvents);

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

/* 저장소에서 입력을 읽는다. 시군구 이름 표(SGG)는 lib/board/data.ts 안에 있고 그 파일은 JSON 을 import 해 Node 가 바로 못 읽으므로
   tests/js/board.test.cjs 와 같은 방법으로 객체 글자만 꺼낸다. */
function loadInputs({ observedMonth = '2026-10', lhSgg, hubEvents, legalDong } = {}) {
  const json = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
  const src = fs.readFileSync(path.join(ROOT, 'lib/board/data.ts'), 'utf8');
  const sggNames = Function(`return (${/export const SGG[^=]*= (\{[\s\S]*?\n\});/.exec(src)[1]})`)();
  return {
    registry: json('registry/projects.json'), molit: json('data/board/molit.json'), lh: json('data/board/lh-completion.json'), catalog: json('data/board/sources.json'),
    bundles: SLUGS.map((slug) => ({ slug, region: json(`regions/${slug}/region.json`), projects: json(`regions/${slug}/projects.json`).projects })),
    agencies: require(path.join(ROOT, 'lib/board/agencies.ts')).AGENCIES,
    sggNames, lhSgg: lhSgg ?? [], hubEvents: hubEvents ?? [], legalDong: legalDong ?? null, observedMonth,
  };
}

module.exports = { convert, loadInputs };

/* 실행: node tools/ledger/convert.js [--month 2026-10] [--lh-sgg <매핑.json>] [--hub-events <스냅샷.json>] [--legal-dong <법정동코드 원본>] [--out <폴더>]
   --out 을 주면 검증을 통과했을 때만 표마다 <폴더>/<표>.json 을 쓴다(한 행 한 줄 — 변경을 줄 단위로 보려고). */
if (require.main === module) {
  const { validate } = require('./validate');
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
  const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
  const dong = arg('--legal-dong');
  const tables = convert(loadInputs({
    observedMonth: arg('--month') ?? '2026-10',
    lhSgg: arg('--lh-sgg') ? readJson(arg('--lh-sgg')) : [],
    hubEvents: arg('--hub-events') ? readJson(arg('--hub-events')).rows : [],
    legalDong: dong ? require('./legal-dong').parseLegalDong(fs.readFileSync(dong), path.basename(dong)) : null,
  }));
  for (const [name, rows] of Object.entries(tables)) console.log(`${name.padEnd(18)} ${rows.length}`);
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
  }
}
