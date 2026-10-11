'use strict';
/* 사업 원장 표(schemas/ledger-2026-10/tables)에서 종합상황판 카드용 집계를 만든다. 화면(components/board/Board.tsx)이 쓰는 시점(2025.01=0 … 2028.10=45)과
   보드 단계 6칸(0 ①계획 · 1 ②인허가 · 2 ③착공 · 3 ④모집 · 4 ⑤준공 · 5 ⑥입주)에 맞춘다.
   판정 기준(2026-10-10 결정, docs/product/상황판-기획서.md Q7 · 데이터-수집-계획.md 3절): 현재 예정(CURRENT)의 기간 끝에서 기준일까지 꽉 찬 달 수가
   6 이상이면 지연, 1 이상 6 미만이면 주의, 그 밖은 정상. 판정 대상은 발급 사업과 건축HUB 전국 대용량 후보(발급 전이지만 원천에 실제 착공·준공 기록이 있다, 기준 2026-08)다.
   LH 후보(발급 전, 파일 기준일 2026-01-27)는 준공 여부를 알 기록이 없어 판정에서 뺀다.
   건축HUB 대용량 후보는 착공 실제일이 있는 기록이 약 7% 뿐이라 '착공 예정 경과 + 착공 기록 없음'이 대부분 자료 누락이다(2026-10-11 결정). 그래서 사용검사(준공) 예정 경과만 판정하고,
   착공 예정 경과는 정상·주의·지연에서 빼 judgment.excludedStartOverdue 로 따로 센다. 건축HUB 스냅샷(발급 사업)은 착공·준공 둘 다 판정한다.
   순수 함수 boardFromLedger 는 파일을 읽거나 쓰지 않는다. 월 판정 이력(history, data/board/judgment-history.json 의 rows — tools/ledger/trend.js)을 받으면
   결과의 trend 는 관측 달 앞의 이력 행 + 이번 달 판정 행(basis OBSERVED) 하나다(지연·주의 추이 카드).
   지도 색인 mapIndexFromLedger 는 같은 사업별 상태(projectStates)로 시군구마다 사업 단계·판정·다음 일정을 모은다(지도 사업 색, 기획서 M7·M8).
   실행: node tools/ledger/board.js  → schemas/ledger-2026-10/tables 와 판정 이력(있으면)을 읽어 data/board/ledger-board.json 과 data/board/ledger-map.json 을 쓴다. */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const TABLES = 'schemas/ledger-2026-10/tables';
const OUT = 'data/board/ledger-board.json';
const MAP_OUT = 'data/board/ledger-map.json';
const HISTORY = 'data/board/judgment-history.json';
const NEEDED = ['projects', 'events', 'units', 'sources', 'areas', 'agencies', 'identifiers', 'project_locations'];
const LH_SOURCE = 'datagokr-15141761';
const BULK_PREFIX = 'hub-bulk-hs-';   // 건축HUB 주택인허가 전국 대용량(tools/ledger/hub-bulk.js), 뒤에 자료 달
const FIRST_MONTH = '2025-01', LAST = 45;   // 보드 시점 0 … 45
const JUDGE = { cautionMonths: 1, delayMonths: 6 };
/* 물량 종류 우선순위: 사업에 있는 첫 종류만 쓴다(기준이 다른 물량은 더하지 않는다) */
const QTY_ORDER = ['PUBLIC_PLAN', 'PERMIT', 'NOTICE', 'PROJECT_PLAN'];
const BOARD_OF_EVENT = { PERMIT: 1, CONSTRUCTION_START: 2, SUPPLY_NOTICE: 3, COMPLETION: 4, MOVE_IN: 5 };
const BOARD_OF_STAGE = { '01': 0, '02': 0, '03': 1, '04': 2, '05': 3, '06': 4 };
/* 판정하는 이벤트와, 사업 단계가 이 값 이상이면 이미 그 단계에 이른 것으로 본다 */
const REACHED = { CONSTRUCTION_START: '04', COMPLETION: '06' };
const BULK_SKIP = 'CONSTRUCTION_START';   // 대용량 후보에서 판정하지 않는 이벤트
const UNKNOWN_AGENCY = '기관 미상';
/* 예정일 경과 목록은 경과가 큰 것부터 이만큼만 싣는다(전국이면 1만 건 가까이라 화면 자료가 1 MB 를 넘는다). 전체 수는 overdueTotal */
const OVERDUE_LIMIT = 200;

const pad2 = (n) => String(n).padStart(2, '0');
const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number), k = y * 12 + (m - 1) + n; return `${Math.floor(k / 12)}-${pad2(k % 12 + 1)}`; };
const lastDay = (ym) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${pad2(new Date(Date.UTC(y, m, 0)).getUTCDate())}`; };
/* 이벤트의 달(연도만 있으면 그해 12월)과 기간 끝(일 → 그날, 월 → 말일, 연 → 12-31) */
const monthOf = (e) => (e.event_date ? e.event_date.slice(0, 7) : e.event_month ?? (e.event_year != null ? `${e.event_year}-12` : null));
const endOf = (e) => e.event_date ?? (e.event_month ? lastDay(e.event_month) : e.event_year != null ? `${e.event_year}-12-31` : null);
const plannedText = (e) => e.event_date ?? e.event_month ?? String(e.event_year);

/* 기간 끝(end)에서 기준일(ref)까지 꽉 찬 달 수. 아직 지나지 않았으면 0. 달 차이에서, 기준일의 일이 끝 날짜의 일보다 작으면 1을 뺀다 */
function elapsedMonths(end, ref) {
  if (end >= ref) return 0;
  const [ey, em, ed] = end.split('-').map(Number), [ry, rm, rd] = ref.split('-').map(Number);
  return (ry - ey) * 12 + (rm - em) - (rd < ed ? 1 : 0);
}
const classify = (months, judge = JUDGE) => (months >= judge.delayMonths ? 'delay' : months >= judge.cautionMonths ? 'caution' : 'ok');

/* 사업별 상태(한 번만 계산해 보드 집계 boardFromLedger 와 지도 색인 mapIndexFromLedger 가 같이 쓴다 — 판정 규칙은 여기 한 벌뿐이다).
   사업마다 { p, issued, bulk, judgeable, units, actual, actualTypes, plan(종류마다 현재 예정 하나), base(보드 칸), cls(판정, 대상 아니면 null), overdue(예정일 경과 쌍) } */
function projectStates(tables, referenceDate) {
  /* 원천 순위: data_as_of 가 둘 다 있으면 최근 것, 아니면 bundle-* > hub-hs-basis > LH 준공예정 */
  const asOf = new Map(tables.sources.map((s) => [s.source_ref, s.data_as_of]));
  const order = (ref) => (ref.startsWith('bundle-') ? 0 : ref === 'hub-hs-basis' ? 1 : ref === LH_SOURCE ? 2 : 3);
  const bySource = (a, b) => {
    const da = asOf.get(a), db = asOf.get(b);
    if (da && db && da !== db) return da > db ? -1 : 1;
    return order(a) - order(b);
  };

  const group = (rows) => { const m = new Map(); for (const r of rows) { if (!m.has(r.local_project_id)) m.set(r.local_project_id, []); m.get(r.local_project_id).push(r); } return m; };
  const eventsOf = group(tables.events.filter((e) => BOARD_OF_EVENT[e.event_type] != null && monthOf(e)));
  const unitsOf = group(tables.units);

  /* 사업 하나의 호수: 첫 물량 종류, 그 안에서 순위가 가장 높은 원천 하나(같은 물량을 두 원천이 실으면 겹치므로), TOTAL 이 있으면 TOTAL 아니면 SUBTYPE 합 */
  const unitsOfProject = (pid) => {
    const rows = unitsOf.get(pid) ?? [];
    const type = QTY_ORDER.find((q) => rows.some((r) => r.quantity_type === q));
    if (!type) return 0;
    const ofType = rows.filter((r) => r.quantity_type === type);
    const src = [...new Set(ofType.map((r) => r.source_ref))].sort(bySource)[0];
    const ofSrc = ofType.filter((r) => r.source_ref === src);
    const total = ofSrc.filter((r) => r.unit_scope === 'TOTAL');
    return (total.length ? total : ofSrc).reduce((s, r) => s + r.unit_count, 0);
  };

  const projects = tables.projects.map((p) => {
    const evs = eventsOf.get(p.local_project_id) ?? [];
    const actual = evs.filter((e) => e.date_type === 'ACTUAL');
    /* 종류마다 현재 예정 하나: 원천 순위가 가장 높은 것 */
    const plan = {};
    for (const e of evs.filter((x) => x.date_type === 'PLANNED' && x.plan_basis === 'CURRENT').sort((a, b) => bySource(a.source_ref, b.source_ref))) plan[e.event_type] ??= e;
    const bulk = p.source_ref.startsWith(BULK_PREFIX);
    return { p, issued: !!p.issued_at, bulk, judgeable: !!p.issued_at || bulk, units: unitsOfProject(p.local_project_id), actual, actualTypes: new Set(actual.map((e) => e.event_type)), plan, base: BOARD_OF_STAGE[p.stage_code] };
  });

  /* 판정: 발급 사업과 건축HUB 대용량 후보 중 착공·준공 현재 예정이 하나라도 있는 사업. 실제 기록이 있거나 사업 단계가 이미 이른 종류는 보지 않는다 */
  for (const x of projects) {
    x.cls = null;
    x.overdue = [];
    if (!x.judgeable) continue;
    let worst = 0;
    for (const [t, reached] of Object.entries(REACHED)) {
      const e = x.plan[t];
      if (!e || x.actualTypes.has(t) || x.p.stage_code >= reached) continue;
      const end = endOf(e);
      if (end >= referenceDate) continue;
      const m = elapsedMonths(end, referenceDate);
      const skip = x.bulk && t === BULK_SKIP;   // 대용량 후보의 착공 예정 경과는 판정하지 않는다
      if (!skip) worst = Math.max(worst, m);
      x.overdue.push({ id: x.p.local_project_id, name: x.p.project_name, sgg: x.p.sgg_code, eventType: t, planned: plannedText(e), months: m, class: skip ? 'excluded' : classify(m) });
    }
    /* 판정 대상 = 판정하는 종류(대용량 후보는 준공만)의 현재 예정이 하나라도 있는 사업 */
    if (Object.keys(REACHED).some((t) => x.plan[t] && !(x.bulk && t === BULK_SKIP))) x.cls = classify(worst);
  }
  return { projects, asOf };
}

/* tables: { projects, events, units, sources, areas, agencies } 의 행 배열, history: 판정 이력 행(달 순) */
function boardFromLedger(tables, { referenceDate = '2026-10-10', observedMonth = '2026-10', history = [] } = {}) {
  const months = Array.from({ length: LAST + 1 }, (_, i) => addMonths(FIRST_MONTH, i));
  const now = months.indexOf(observedMonth);
  if (now < 0) throw new Error(`observedMonth ${observedMonth} 가 보드 시점(${FIRST_MONTH}~${months[LAST]}) 밖이다`);
  const { projects, asOf } = projectStates(tables, referenceDate);

  /* 실제 날짜가 어디까지인가(actualThrough): 실제 기록이 있는 사업의 호수를 원천별로 더해(사업마다 원천 하나에 한 번), 호수가 가장 많은 원천의 자료 달(data_as_of 의 달).
     자료 달이 없거나 관측 달보다 늦으면 관측 달. 그 뒤 달은 실제가 아니라 예정으로 다시 만든다(stageAt) */
  const actualUnits = {};
  for (const x of projects) for (const s of new Set(x.actual.map((e) => e.source_ref))) actualUnits[s] = (actualUnits[s] ?? 0) + x.units;
  const actualSource = Object.keys(actualUnits).sort((a, b) => actualUnits[b] - actualUnits[a] || a.localeCompare(b))[0] ?? null;
  const sourceMonth = actualSource && asOf.get(actualSource) ? asOf.get(actualSource).slice(0, 7) : observedMonth;
  const actualThrough = sourceMonth < observedMonth ? sourceMonth : observedMonth, at = months.indexOf(actualThrough);

  /* 보드 단계(달 i 말 기준). 실제 기록이 없는 사업(LH 후보)은 stage_code 의 칸을 처음부터 쓴다.
     actualThrough 달 뒤에는 기간 끝이 기준일 뒤인 현재 예정을 더하고(기준일 전에 지난 예정은 일어난 것으로 치지 않는다), NOW 부터는 stage_code 의 칸보다 낮게 두지 않는다.
     NOW 달은 기준일 관측(stage_code)이라 예정을 더하지 않는다 — 더하면 판정의 단계별 지연 호수(delayByStage)가 바뀐다 */
  const stageAt = (x, i) => {
    const ym = months[i];
    let s = x.actual.length ? 0 : x.base;
    for (const e of x.actual) if (monthOf(e) <= ym) s = Math.max(s, BOARD_OF_EVENT[e.event_type]);
    if (i > at && i !== now) for (const e of Object.values(x.plan)) if (endOf(e) > referenceDate && monthOf(e) <= ym) s = Math.max(s, BOARD_OF_EVENT[e.event_type]);
    if (i >= now) s = Math.max(s, x.base);
    return s;
  };
  const stageUnits = months.map(() => [0, 0, 0, 0, 0, 0]), stageProjects = months.map(() => [0, 0, 0, 0, 0, 0]);
  for (const x of projects) {
    x.stages = months.map((_, i) => stageAt(x, i));
    x.stages.forEach((s, i) => { stageUnits[i][s] += x.units; stageProjects[i][s] += 1; });
  }

  /* 예정일 경과 쌍(판정은 projectStates). 착공 예정 경과를 판정에서 뺀 대용량 후보는 쌍마다 한 번 */
  const overdue = projects.flatMap((x) => x.overdue);
  const startSkipped = projects.flatMap((x) => x.overdue.filter((o) => o.class === 'excluded').map(() => x));
  overdue.sort((a, b) => b.months - a.months || a.id.localeCompare(b.id) || a.eventType.localeCompare(b.eventType));

  const sum = (xs, f = (x) => x.units) => xs.reduce((s, x) => s + f(x), 0);
  const judged = projects.filter((x) => x.cls), candidates = projects.filter((x) => !x.issued), excluded = projects.filter((x) => !x.judgeable);
  const bucket = (c) => { const xs = judged.filter((x) => x.cls === c); return { projects: xs.length, units: sum(xs) }; };
  const lhAsOf = asOf.get(LH_SOURCE);
  const byStageNow = (c) => { const v = [0, 0, 0, 0, 0, 0]; for (const x of judged) if (x.cls === c) v[x.stages[now]] += x.units; return v; };
  const counts = (xs) => ({ ok: xs.filter((x) => x.cls === 'ok').length, caution: xs.filter((x) => x.cls === 'caution').length, delay: xs.filter((x) => x.cls === 'delay').length });

  const regions = tables.areas.filter((a) => a.level === 'SIDO').sort((a, b) => a.area_code.localeCompare(b.area_code)).map((a) => {
    const xs = projects.filter((x) => x.p.sgg_code.slice(0, 2) === a.area_code);
    return { code: a.area_code, name: a.area_name, projects: xs.length, units: sum(xs), judged: xs.filter((x) => x.cls).length, ...counts(xs), delayUnits: sum(xs.filter((x) => x.cls === 'delay')), cautionUnits: sum(xs.filter((x) => x.cls === 'caution')) };
  });

  /* 기관별 정상·주의·지연 호수: 판정된 사업의 물량(시도 집계와 같은 물량 규칙) */
  const unitsBy = (xs) => ({ okUnits: sum(xs.filter((x) => x.cls === 'ok')), cautionUnits: sum(xs.filter((x) => x.cls === 'caution')), delayUnits: sum(xs.filter((x) => x.cls === 'delay')) });
  const agencyRow = (id, name, xs, note) => ({ id, name, projects: xs.length, units: sum(xs), ...counts(xs), ...unitsBy(xs), excludedUnits: sum(xs.filter((x) => !x.judgeable)), note });
  const agencies = tables.agencies.map((a) => {
    const xs = projects.filter((x) => x.p.agency_id === a.agency_id), cand = xs.filter((x) => !x.judgeable);
    const note = !xs.length ? '원장에 사업 없음' : cand.length ? `LH 후보 ${cand.length}건은 판정에서 뺐다(파일 기준일 ${lhAsOf} 이후 준공 기록 없음)` : null;
    return agencyRow(a.agency_id, a.agency_name, xs, note);
  });
  const noAgency = projects.filter((x) => !x.p.agency_id);
  const hubCount = noAgency.filter((x) => x.p.source_ref === 'hub-hs-basis').length, bulkCount = noAgency.filter((x) => x.bulk).length;
  const bundle = noAgency.filter((x) => x.p.source_ref.startsWith('bundle-'));
  const privateCount = bundle.filter((x) => x.p.public_scope === 'PRIVATE_ON_PUBLIC_LAND').length;
  const bundleText = `지역 번들 ${bundle.length}건${privateCount ? `(공공택지 민간 ${privateCount})` : ''}`;
  agencies.push(agencyRow('unknown', UNKNOWN_AGENCY, noAgency, `시행 기관 미연결: 건축HUB ${hubCount.toLocaleString('en-US')}건 · ${bulkCount ? `건축HUB 전국 후보 ${bulkCount.toLocaleString('en-US')}건 · ` : ''}${bundleText}`));

  /* 향후 12개월 준공 예정: 준공 실제 기록이 없는 사업의 현재 예정 준공 하나(원천 순위)를 그 사업의 준공 달로 본다 */
  const upcoming = months.slice(now, now + 12).map((ym) => ({ ym, units: 0, projects: 0 }));
  for (const x of projects) {
    const e = x.plan.COMPLETION;
    if (x.actualTypes.has('COMPLETION') || !e) continue;
    const u = upcoming.find((r) => r.ym === monthOf(e));
    if (u) { u.units += x.units; u.projects += 1; }
  }

  /* 판정한 사업의 이벤트가 나온 원천과 그 기준일(원천마다 기준일이 달라 판정의 '지금'이 원천마다 다르다) */
  const judgedSources = new Set(judged.flatMap((x) => [...x.actual, ...Object.values(x.plan)].map((e) => e.source_ref)));
  const dataAsOf = Object.fromEntries([...judgedSources].sort().map((s) => [s, asOf.get(s) ?? null]));
  const bulkCandidates = candidates.filter((x) => x.bulk).length;
  const judgment = { ok: bucket('ok'), caution: bucket('caution'), delay: bucket('delay'), excluded: { projects: excluded.length, units: sum(excluded), reason: `LH 준공예정 후보(발급 전): 파일 기준일 ${lhAsOf} 이후 준공 여부를 알 기록이 없다` },
    excludedStartOverdue: { projects: new Set(startSkipped.map((x) => x.p.local_project_id)).size, pairs: startSkipped.length, units: sum([...new Set(startSkipped)]), reason: '건축HUB 대용량 후보의 착공 예정 경과(착공 기록 없음): 원천에 착공 실제일 기록이 약 7% 뿐이라 지연으로 치지 않는다' } };
  const delayByStage = byStageNow('delay'), cautionByStage = byStageNow('caution');
  /* 이번 달 판정 행(이력 파일과 같은 모양). edition = 실은 건축HUB 대용량 판의 자료 달 */
  const edition = tables.sources.map((s) => s.source_ref).find((r) => r.startsWith(BULK_PREFIX))?.slice(BULK_PREFIX.length) ?? null;
  const { excludedStartOverdue: xs } = judgment;
  const own = { month: observedMonth, referenceDate, edition, basis: 'OBSERVED', ok: judgment.ok, caution: judgment.caution, delay: judgment.delay, delayByStage, cautionByStage, judged: judged.length, excludedStartOverdue: { projects: xs.projects, pairs: xs.pairs, units: xs.units } };

  return {
    schema: 'ledger-board/1', observedMonth, referenceDate, source: TABLES,
    judge: { ...JUDGE, dataAsOf, rule: '발급 사업(건축HUB 스냅샷)은 착공·준공 예정 경과를 판정하고, 건축HUB 대용량 후보는 사용검사(준공) 예정 경과만 판정한다(착공 실제일 기록이 약 7% 뿐이라 착공 예정 경과는 자료 누락이 많다). LH 후보는 판정하지 않는다.' },
    scope: {
      projects: projects.length, issued: projects.length - candidates.length, candidates: candidates.length, judged: judged.length, units: sum(projects),
      coverage: bulkCandidates ? 'NATIONWIDE' : 'PARTIAL',   // 건축HUB 전국 대용량을 실었으면 전국
      bySource: { issued: projects.length - candidates.length, lhCandidates: candidates.length - bulkCandidates, hubBulkCandidates: bulkCandidates },
      sido: new Set(projects.map((x) => x.p.sgg_code.slice(0, 2))).size,
      /* ④모집·⑥입주 일정이 있는 사업 수(공고 = 실제 SUPPLY_NOTICE, 입주 = 현재 예정 MOVE_IN) */
      withEvents: { supplyNotice: projects.filter((x) => x.actualTypes.has('SUPPLY_NOTICE')).length, moveIn: projects.filter((x) => x.plan.MOVE_IN).length },
    },
    months, now, actualThrough, actualIndex: at, actualSource, stageUnits, stageProjects,
    judgment, delayByStage, cautionByStage,
    regions, agencies, upcoming, overdue: overdue.slice(0, OVERDUE_LIMIT), overdueTotal: overdue.length,
    trend: [...history.filter((r) => r.month < observedMonth), own],
  };
}

/* 지도 색인: 시군구마다 사업 행(id 순). 판정(cls)·경과는 projectStates 그대로라 보드 판정 합계와 같다.
   행 = { id, name, issued, stage(stage_code), cls('ok'|'caution'|'delay'|null), why(cls 가 null 인 까닭), overdue, next, units(보드와 같은 물량 규칙), pks(건축HUB 관리번호), pnus(필지), bundles(지도 번들 단지 '지역slug/단지id') }
   overdue = 판정에 넣은 예정일 경과 중 가장 많이 지난 것 { eventType, planned, months }(대용량 후보의 착공 예정 경과처럼 판정에서 뺀 것은 넣지 않는다), 없으면 null.
   next = 기준일 당일·이후에 끝나는 현재 예정 중 가장 이른 것 { eventType, planned }. 실제 기록이 있는 종류와, 판정처럼 사업 단계가 이미 이른 착공·준공은 뺀다 */
function mapIndexFromLedger(tables, { referenceDate = '2026-10-10', observedMonth = '2026-10' } = {}) {
  const { projects } = projectStates(tables, referenceDate);
  const listOf = (rows, pick) => { const m = new Map(); for (const r of rows) { const v = pick(r); if (v == null) continue; if (!m.has(r.local_project_id)) m.set(r.local_project_id, new Set()); m.get(r.local_project_id).add(v); } return m; };
  const pks = listOf(tables.identifiers, (r) => (r.id_type === 'HUB_HS_PK' ? r.id_value : null));
  const pnus = listOf(tables.project_locations, (r) => r.pnu);
  const bundles = listOf(tables.identifiers, (r) => (r.id_type === 'BUNDLE_ID' ? r.id_value : null));
  const sorted = (set) => [...(set ?? [])].sort();
  const bySgg = {};
  for (const x of [...projects].sort((a, b) => a.p.local_project_id.localeCompare(b.p.local_project_id))) {
    const worst = x.overdue.filter((o) => o.class !== 'excluded').sort((a, b) => b.months - a.months || a.eventType.localeCompare(b.eventType))[0];
    const upcoming = Object.values(x.plan).filter((e) => endOf(e) >= referenceDate && !x.actualTypes.has(e.event_type) && !(REACHED[e.event_type] && x.p.stage_code >= REACHED[e.event_type]))
      .sort((a, b) => endOf(a).localeCompare(endOf(b)) || BOARD_OF_EVENT[a.event_type] - BOARD_OF_EVENT[b.event_type])[0];
    const id = x.p.local_project_id;
    (bySgg[x.p.sgg_code] ??= []).push({
      id, name: x.p.project_name, issued: x.issued, stage: x.p.stage_code, cls: x.cls,
      why: x.cls ? null : x.judgeable ? '예정 없음' : 'LH 후보',
      overdue: worst ? { eventType: worst.eventType, planned: worst.planned, months: worst.months } : null,
      next: upcoming ? { eventType: upcoming.event_type, planned: plannedText(upcoming) } : null,
      units: x.units, pks: sorted(pks.get(id)), pnus: sorted(pnus.get(id)), bundles: sorted(bundles.get(id)),
    });
  }
  return { schema: 'ledger-map/1', observedMonth, referenceDate, bySgg };
}
/* 지도 색인 파일: 한 행 한 줄(diff 가 사업 단위로 보이게) */
function renderMap(index) {
  const head = Object.entries(index).filter(([k]) => k !== 'bySgg').map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  const groups = Object.entries(index.bySgg).map(([sgg, rows]) => `    ${JSON.stringify(sgg)}: [\n${rows.map((r) => `      ${JSON.stringify(r)}`).join(',\n')}\n    ]`);
  return `{\n${head.join('\n')}\n  "bySgg": {\n${groups.join(',\n')}\n  }\n}\n`;
}

/* 들여쓰기 2칸. 원소가 모두 값(문자열·숫자·null)인 배열·객체는 한 줄로 쓴다 */
const prim = (v) => v === null || typeof v !== 'object';
function render(v, ind = '') {
  if (prim(v) || Object.values(v).every(prim)) return JSON.stringify(v);
  const next = `${ind}  `;
  const items = Array.isArray(v) ? v.map((x) => next + render(x, next)) : Object.entries(v).map(([k, x]) => `${next}${JSON.stringify(k)}: ${render(x, next)}`);
  return Array.isArray(v) ? `[\n${items.join(',\n')}\n${ind}]` : `{\n${items.join(',\n')}\n${ind}}`;
}

const loadTables = (dir = path.join(ROOT, TABLES)) => Object.fromEntries(NEEDED.map((t) => [t, JSON.parse(fs.readFileSync(path.join(dir, `${t}.json`), 'utf8')).rows]));
/* 판정 이력 행(파일이 없으면 빈 배열) */
const loadHistory = (root = ROOT) => { const f = path.join(root, HISTORY); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).rows : []; };

module.exports = { boardFromLedger, mapIndexFromLedger, renderMap, MAP_OUT, elapsedMonths, classify, render, loadTables, loadHistory, endOf, lastDay, addMonths, OUT, HISTORY };

if (require.main === module) {
  const board = boardFromLedger(loadTables(), { history: loadHistory() });
  const out = path.join(ROOT, OUT);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${render(board)}\n`);
  const j = board.judgment;
  console.log(`판정 ${board.scope.judged}: 정상 ${j.ok.projects} · 주의 ${j.caution.projects} · 지연 ${j.delay.projects} (제외 ${j.excluded.projects})`);
  console.log(`실제 날짜 ${board.actualThrough}까지(${board.actualSource})`);
  console.log(`${OUT} 를 썼다 (${fs.statSync(out).size} 바이트)`);
  const index = mapIndexFromLedger(loadTables(), { referenceDate: board.referenceDate, observedMonth: board.observedMonth });
  const mapOut = path.join(ROOT, MAP_OUT);
  fs.writeFileSync(mapOut, renderMap(index));
  const rows = Object.values(index.bySgg).flat();
  console.log(`${MAP_OUT} 를 썼다 (시군구 ${Object.keys(index.bySgg).length} · 사업 ${rows.length} · ${fs.statSync(mapOut).size} 바이트)`);
}
