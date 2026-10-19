'use strict';
/* '데이터 원본' 요구사항 충족 격자와 화면 머리의 요구사항 꼬리표(components/ReqTags.tsx)가 읽는 data/board/requirements.json 을 만든다.
   요구사항 F-01~F-12(HOME 기능 요구: 제목·우선순위·세부 항목·판단 기준)마다 관련 지시 날짜, 답하는 화면(새 구조: 사업 projects · 지역 공급 region · 데이터 원본 sources),
   실제 자료로 센 근거 지표와 판정(충족 met · 부분 part · 없음 none)을 적는다. 규칙은 승인된 시안(docs/design/home-concept/build-data.mjs JUDGE)과 같고 F 마다 하나다.
   입력: schemas/ledger-<달>/tables(projects·events·links·identifiers), data/board(ledger-map·projects-index·project-detail·policy-progress·molit·home-sources·home-map),
         docs/주택파동_정책근거_및_요구사항_매트릭스.md(지시 표), 그 달의 가장 늦은 HOME 판 원본(execution_schedule·execution_case — 담당자 기준선·원인 기록은 건수만 센다).
   공개 저장소라 담당자 이름·입력 사유 원문은 산출물에 넣지 않는다(건수만). 출력은 결정적이다(정렬, 현재 시각 없음).
   순서: 사업 화면 자료(projects-index.js 등)·policy-progress.js·home-sources.js 뒤에 돌린다.
   실행: node tools/ledger/requirements.js [--month YYYY-MM] */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const P = require('./paths');
const { latestHomeDir } = require('./home-source');

const OUT = 'data/board/requirements.json';

/* HOME 기능 요구사항 원문(HOME PoC requirements-manual 의 source·우선순위, 2026-10-14 옮김) */
const REQUIREMENTS = [
  {"id":"F-01","title":"주택공급 현황 통합 조회","short":"주택공급 현황 통합 조회","priority":"필수","criterion":"전국·지역·개별 사업 단위 정보가 연계되고, 집계 결과를 구성하는 실제 사업 목록을 확인할 수 있는가?","items":["전국 및 지역별 주택공급 현황을 통합적으로 조회할 수 있어야 한다.","복수 기관 및 정책·사업에 분산된 공급정보를 함께 조회할 수 있어야 한다.","공급계획, 현재 진행상황, 실제 공급실적을 구분할 수 있어야 한다.","전체 현황에서 특정 지역이나 개별 사업으로 조회 범위를 좁힐 수 있어야 한다.","조회 범위에 따라 집계 결과가 일관되게 변경되어야 한다."]},
  {"id":"F-02","title":"주택공급 목표 대비 이행실적 관리","short":"목표 대비 이행실적 관리","priority":"필수","criterion":"어떤 정책이 목표 대비 얼마나 진행되었고, 남은 물량이 얼마인지 실제 데이터에 근거해 판단할 수 있는가?","items":["공급정책별 목표물량과 실적을 관리할 수 있어야 한다.","목표 대비 달성률 및 미달 물량을 확인할 수 있어야 한다.","연도별·지역별·기관별 이행실적을 비교할 수 있어야 한다.","실적의 기준일 및 집계 기준을 확인할 수 있어야 한다.","공급목표가 변경된 경우 변경 이력을 추적할 수 있어야 한다."]},
  {"id":"F-03","title":"공급 단계별 진행상황 관리","short":"공급 단계별 진행상황 관리","priority":"필수","criterion":"개별 사업의 현재 단계뿐 아니라, 전체 공급정책이 각 단계에서 얼마나 진척되었는지 파악할 수 있는가?","items":["사업화·인허가·착공·분양·준공·입주 등의 진행단계를 관리할 수 있어야 한다.","사업별 현재 단계와 완료된 주요 단계의 이력을 확인할 수 있어야 한다.","각 단계의 목표물량·실적물량·미완료물량을 구분할 수 있어야 한다.","전체 사업을 집계하여 공급 단계별 진척상황을 파악할 수 있어야 한다.","단계별 대상물량의 차이와 중복 집계 여부를 검증할 수 있어야 한다."]},
  {"id":"F-04","title":"사업별 상세정보 조회","short":"사업별 상세정보 조회","priority":"필수","criterion":"특정 사업이 어디에서, 누가, 얼마나, 언제까지 공급하는 사업인지 파악할 수 있는가?","items":["개별 공급사업의 사업명·위치·유형·담당기관·공급규모를 확인할 수 있어야 한다.","사업별 현재 진행단계와 주요 추진 실적을 확인할 수 있어야 한다.","사업별 과거·현재·향후 주요 일정을 조회할 수 있어야 한다.","사업의 진행상황을 판단하는 데 사용된 근거자료를 확인할 수 있어야 한다.","상위 지역·정책별 집계에서 개별 사업정보까지 추적할 수 있어야 한다."]},
  {"id":"F-05","title":"연도별 공급계획 및 시계열 분석","short":"연도별 공급계획·시계열 분석","priority":"필수","criterion":"특정 연도를 기준으로 공급정책의 진행상황을 확인하고, 앞으로 어느 시점에 얼마나 공급될 예정인지 설명할 수 있는가?","items":["과거부터 현재, 미래까지 연도별 공급현황을 조회할 수 있어야 한다.","특정 연도 기준의 계획·실적·진행상황을 확인할 수 있어야 한다.","연도별 착공·분양·준공·입주 예정물량을 확인할 수 있어야 한다.","향후 연도의 단계별 목표 달성 예정 시점을 확인할 수 있어야 한다.","기간 변경 시 전체 공급현황과 관련 집계가 일관되게 변경되어야 한다.","확정 실적과 계획상 예정물량, 예측 결과를 명확히 구분할 수 있어야 한다."]},
  {"id":"F-06","title":"공급사업 일정 및 지연 관리","short":"사업별 일정·지연 관리","priority":"필수","criterion":"당초 약속한 일정에 비해 어떤 사업이 얼마나 지연되었는지 확인할 수 있는가?","items":["사업별 최초 계획일정, 현재 예정일정, 실제 완료일정을 구분하여 관리할 수 있어야 한다.","일정 변경 여부와 지연기간을 확인할 수 있어야 한다.","지연 사업과 정상 추진 사업을 구분할 수 있어야 한다.","일정이 변경된 경우 변경 이력과 사유를 확인할 수 있어야 한다.","지역·기관·공급단계별 지연 현황을 집계할 수 있어야 한다."]},
  {"id":"F-07","title":"사업 지연 원인 및 병목 관리","short":"지연 원인·병목 관리","priority":"중요","criterion":"지연 사업을 발견하는 것에서 그치지 않고, 지연 원인과 후속 조치 필요사항을 파악할 수 있는가?","items":["사업 진행을 저해하는 주요 사유를 확인할 수 있어야 한다.","인허가, 보상, 기반시설, 기관 협의 등 병목 요인을 구분할 수 있어야 한다.","지연 요인별 영향 사업 및 물량을 집계할 수 있어야 한다.","해결 담당기관, 조치계획, 조치상태를 관리할 수 있어야 한다.","문제가 장기간 해소되지 않는 사업을 식별할 수 있어야 한다."]},
  {"id":"F-08","title":"기관별·정책별 추진현황 관리","short":"기관별·정책별 추진현황","priority":"중요","criterion":"특정 기관이 담당한 공급사업의 진행상황과 해결해야 할 주요 과제를 확인할 수 있는가?","items":["사업별 주관기관과 협력기관을 식별할 수 있어야 한다.","기관별 담당 사업의 목표와 실적을 확인할 수 있어야 한다.","정책 또는 공급사업 유형별 추진현황을 구분할 수 있어야 한다.","여러 기관이 참여하는 사업은 기관 간 협의 필요사항과 처리상태를 확인할 수 있어야 한다."]},
  {"id":"F-09","title":"국민의 공급 예측가능성 지원","short":"국민의 공급 예측가능성","priority":"필수","criterion":"국민이 특정 지역에서 앞으로 언제, 얼마나 주택이 공급될 예정인지 확인하고 주거계획에 참고할 수 있는가?","items":["특정 지역의 향후 주택공급 예정정보를 확인할 수 있어야 한다.","향후 공급규모와 주요 공급 일정을 확인할 수 있어야 한다.","분양·입주 등 국민의 주거계획에 필요한 일정을 구분할 수 있어야 한다.","일정이 확정되지 않은 경우 확정 여부 및 변경 가능성을 알 수 있어야 한다.","공개 가능한 공식정보를 기준으로 제공해야 한다."]},
  {"id":"F-10","title":"공급정보의 신뢰성 및 갱신 관리","short":"정보 신뢰성·갱신 관리","priority":"필수","criterion":"시스템의 주요 수치가 어떤 자료에서 도출되었는지 추적하고 검증할 수 있는가?","items":["주요 데이터별 원천기관 및 기준일을 확인할 수 있어야 한다.","정보가 언제 갱신되었는지 확인할 수 있어야 한다.","정책·사업·공급단계 간 집계 기준의 일관성을 검증할 수 있어야 한다.","데이터가 누락되거나 불일치하는 경우 이를 식별할 수 있어야 한다.","검증되지 않은 자료나 임의 생성 자료를 공식 실적으로 제공해서는 안 된다.","실제 데이터, 시연용 데이터, 추정 데이터를 구분할 수 있어야 한다."]},
  {"id":"F-11","title":"정책 이행상황 종합 판단","short":"정책 이행상황 종합 판단","priority":"중요","criterion":"정책 담당자가 현재 공급정책이 계획대로 진행되고 있는지 판단하고 우선 점검할 사업을 식별할 수 있는가?","items":["전국 및 지역별 공급정책의 전체 이행상황을 확인할 수 있어야 한다.","주요 단계별 목표 대비 실적을 종합적으로 비교할 수 있어야 한다.","정상 추진, 일정 지연, 추가 확인이 필요한 사업을 구분할 수 있어야 한다.","향후 일정에 영향을 미칠 수 있는 주요 위험 요인을 확인할 수 있어야 한다.","종합 결과에서 근거가 되는 개별 사업 및 데이터로 연결할 수 있어야 한다."]},
  {"id":"F-12","title":"향후 공급실적 예측 및 시나리오 분석","short":"공급 예측·시나리오 분석","priority":"확장","criterion":"일정 변화가 향후 공급실적에 미치는 영향을 근거에 기반해 분석할 수 있는가?","items":["현재 사업단계와 기존 추진일정을 기반으로 향후 공급규모를 전망할 수 있어야 한다.","사업 지연 및 일정 변동이 향후 공급물량에 미치는 영향을 분석할 수 있어야 한다.","기준 시나리오와 대안 시나리오를 비교할 수 있어야 한다.","예측에 사용된 가정, 데이터, 산정 방식을 확인할 수 있어야 한다.","예측 결과를 정부의 확정 공급계획 또는 공식 실적으로 오인하지 않도록 구분해야 한다."]},
];
/* 지시 날짜(매트릭스 1절의 '주는 요구사항'과 맞춘 것)와 답하는 화면. F-12(시나리오)는 답하는 화면이 없다 — 앞으로 12개월 예정은 F-09 로만 센다 */
const F_LINK = {
  'F-01': [['08.21', '09.03'], ['projects', 'region']], 'F-02': [['08.14'], ['projects']], 'F-03': [['08.14', '09.30'], ['projects']],
  'F-04': [['08.19'], ['projects']], 'F-05': [['08.14'], ['region']], 'F-06': [['09.18'], ['projects']],
  'F-07': [['09.03', '08.29'], ['projects']], 'F-08': [['08.21', '08.29'], ['projects']], 'F-09': [['09.04'], ['region']],
  'F-10': [['09.30'], ['sources']], 'F-11': [['08.14', '09.03'], ['projects']], 'F-12': [['09.04', '09.30'], []],
};
const PP_STAGES = ['BUSINESS', 'APPROVAL', 'CONSTRUCTION', 'SUPPLY', 'COMPLETION', 'MOVE_IN'];
const PRECISE = new Set(['block', 'address', 'district']);
const AGENCY = new Set(['lh', 'sh', 'gh']);
const LONG_DELAY_MONTHS = 12;
const statusOf = (r) => (r.cls === 'delay' ? (r.overdue && r.overdue.months >= LONG_DELAY_MONTHS ? 'long' : 'delay') : r.cls ?? 'none');
const pct = (a, b) => (b ? Math.round(a / b * 1000) / 10 : null);
const f = (n) => n.toLocaleString('en-US');

/* 지시 표: '| 2026.08.14 | 행사 | 핵심 | 필요 |' 줄 */
const directivesOf = (md) => [...md.matchAll(/^\| (2026\.\d\d\.\d\d) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)].map((m) => ({ date: m[1].slice(5), full: m[1], event: m[2].trim(), need: m[4].trim() }));

/* x: { projects, events, links, identifiers(원장 표 행), ledgerMap, pIndex, pDetail, pp, homeSources, homeLoc(id → loc), schedule(execution_schedule payload), cases(execution_case 행 수), sidoTotal } */
function measure(x) {
  const homeP = x.projects.filter((p) => p.source_ref.startsWith('home-dump-') && !p.superseded_by);
  const ids = new Set(homeP.map((p) => p.local_project_id));
  const mapRow = Object.fromEntries(Object.values(x.ledgerMap.bySgg).flat().map((r) => [r.id, r]));
  const evBy = new Map();
  for (const e of x.events) { if (!evBy.has(e.local_project_id)) evBy.set(e.local_project_id, []); evBy.get(e.local_project_id).push(e); }
  const hasEv = (id, type, dt) => (evBy.get(id) ?? []).some((e) => (!type || e.event_type === type) && (!dt || e.date_type === dt));
  const projects = homeP.map((p) => {
    const id = p.local_project_id, r = mapRow[id] ?? {}, ix = x.pIndex.projects[id] ?? {}, d = x.pDetail.projects[id];
    return {
      sido: p.sgg_code.slice(0, 2), units: r.units ?? 0, status: statusOf(r), policies: ix.policies ?? [], agency: d?.agency ?? p.agency_id ?? null, loc: x.homeLoc[id]?.by ?? null,
      sourced: !!d && d.refs.length > 0 && !!d.asOf,
      reached: [hasEv(id, 'PERMIT', 'ACTUAL'), hasEv(id, 'CONSTRUCTION_START', 'ACTUAL'), hasEv(id, 'SUPPLY_NOTICE', 'ACTUAL'), hasEv(id, 'COMPLETION', 'ACTUAL'), hasEv(id, 'MOVE_IN', 'ACTUAL')],
      anyPlan: hasEv(id, null, 'PLANNED'),
      supplyOrMoveInPlan: hasEv(id, 'SUPPLY_NOTICE', 'PLANNED') || hasEv(id, 'MOVE_IN', 'PLANNED'),
    };
  });
  const N = projects.length, cnt = (fn) => projects.filter(fn).length;
  /* 담당자 기준선: HOME execution_schedule 의 채택 기준선(baseline) → HOME 사업 id(PRO_) → 원장 사업(identifiers id_type HOME) */
  const homeToLocal = new Map(x.identifiers.filter((r) => r.id_type === 'HOME' && ids.has(r.local_project_id)).map((r) => [r.id_value, r.local_project_id]));
  const based = x.schedule.filter((s) => s.baseline && s.origin === 'MANUAL');
  const baselineProjects = new Set(based.map((s) => homeToLocal.get(s.project_id)).filter(Boolean));
  const ledgerBaseline = x.events.filter((e) => ids.has(e.local_project_id) && e.date_type === 'PLANNED' && e.plan_basis && e.plan_basis !== 'CURRENT').length;
  const refYear = Number(x.pp.referenceMonthEnd.slice(0, 4));
  const pp97 = x.pp.policies.find((p) => p.policyId === 'POL_2025_0907');
  const pairCells = pp97 ? PP_STAGES.filter((k) => { const s = pp97.stages[k]?.samePeriod.find((y) => y.year === refYear); return s && s.target != null && s.actual != null; }).length : 0;
  return {
    base: N, refYear, refMonth: x.pp.referenceMonthEnd.slice(5, 7), pairCells,
    plan: cnt((p) => p.units > 0), anyPlan: cnt((p) => p.anyPlan), supplyOrMoveInPlan: cnt((p) => p.supplyOrMoveInPlan),
    stageCells: projects.reduce((s, p) => s + p.reached.filter(Boolean).length, 0), stageCellsTotal: N * 5,
    locPrecise: cnt((p) => PRECISE.has(p.loc)), agencyKnown: cnt((p) => AGENCY.has(p.agency)), sourced: cnt((p) => p.sourced), judged: cnt((p) => p.status !== 'none'),
    baselineRows: based.length, baselineProjects: baselineProjects.size, ledgerBaseline,
    causes: x.cases, scenarios: 0, agencyTargets: 0,
    policySidos: new Set(projects.filter((p) => p.policies.length).map((p) => p.sido)).size, sidoTotal: x.sidoTotal,
    ledgerProjects: Object.values(x.ledgerMap.bySgg).flat().length, failedSources: x.homeSources.sources.filter((s) => !s.ok).length,
  };
}

/* 판정: met 충족 · part 부분 · none 없음. 근거 지표(metric)는 화면에 보이는 짧은 값, tip 은 계산·규칙(제목 툴팁) */
function judge(m) {
  const N = m.base;
  return {
    'F-01': { verdict: m.policySidos >= m.sidoTotal ? 'met' : m.ledgerProjects > 0 ? 'part' : 'none', metric: `정책 연결 시도 ${m.policySidos}/${m.sidoTotal}`, tip: `원장 사업 ${f(m.ledgerProjects)}건과 정책·프로그램 연결은 수도권(서울·인천·경기) HOME 사업만(2026-10-19 결정) · 규칙: 정책 연결이 모든 시도면 충족, 일부 시도면 부분` },
    'F-02': { verdict: m.pairCells === 6 ? 'met' : m.pairCells > 0 ? 'part' : 'none', metric: `목표·실적 같은 칸 ${m.pairCells}/6`, tip: `9·7 단계 6칸 중 같은 기간(${m.refYear}.01~${m.refMonth}) 목표와 확인이 둘 다 있는 칸 · 1·29·8·13 은 단계 목표 없음 · 규칙: 6칸 모두면 충족, 1칸 이상 부분` },
    'F-03': { verdict: pct(m.stageCells, m.stageCellsTotal) >= 80 ? 'met' : m.stageCells > 0 ? 'part' : 'none', metric: `단계 실적 근거 ${pct(m.stageCells, m.stageCellsTotal)}%`, tip: `사업 ${N} × 단계 5(②인허가~⑥입주) 중 원천 실제 기록이 있는 칸 ${f(m.stageCells)}/${f(m.stageCellsTotal)} · 규칙: 80% 이상 충족, 0 초과 부분` },
    'F-04': { verdict: pct(m.plan, N) >= 95 ? 'met' : pct(m.plan, N) >= 50 ? 'part' : 'none', metric: `계획 호수 ${Math.round(pct(m.plan, N))}%`, tip: `사업명·지역은 ${N}건 모두, 계획 호수는 ${m.plan}/${N} · 정밀 위치 ${m.locPrecise}건 · 규칙: 95% 이상 충족, 50% 이상 부분` },
    'F-05': { verdict: pct(m.anyPlan, N) >= 95 ? 'met' : m.anyPlan > 0 ? 'part' : 'none', metric: `예정 일정 1개 이상 ${Math.round(pct(m.anyPlan, N))}%`, tip: `날짜가 있는 단계 예정이 하나라도 있는 사업 ${m.anyPlan}/${N} · 연도별 실적은 서울·인천·경기 2018~ · 규칙: 95% 이상 충족, 0 초과 부분` },
    'F-06': { verdict: m.baselineProjects + m.ledgerBaseline > 0 ? 'part' : 'none', metric: `기준선 사업 ${m.baselineProjects}/${N}`, tip: `담당자가 채택한 일정 기준선(HOME 일정 입력 ${f(m.baselineRows)}건)이 있는 사업 ${m.baselineProjects}/${N} · 원장의 당초 예정 ${m.ledgerBaseline}건 · 지연 판정은 아직 현재 예정일 경과 기준(당초 대비 아님) · 규칙: 기준선이 있으면 부분, 없으면 없음` },
    'F-07': { verdict: m.causes > 0 ? 'part' : 'none', metric: `원인·조치 기록 ${m.causes}건`, tip: `병목 원인·담당기관·조치계획 기록(HOME execution_case) ${m.causes}건 · 규칙: 기록이 있으면 부분, 없으면 없음` },
    'F-08': { verdict: m.agencyTargets > 0 ? 'met' : m.agencyKnown > 0 ? 'part' : 'none', metric: `기관 식별 ${Math.round(pct(m.agencyKnown, N))}%`, tip: `LH·SH·GH 로 시행 기관을 아는 사업 ${m.agencyKnown}/${N} · 기관별 배정 목표 ${m.agencyTargets}건 · 규칙: 배정 목표가 있으면 충족, 기관만 알면 부분` },
    'F-09': { verdict: pct(m.supplyOrMoveInPlan, N) >= 80 ? 'met' : m.supplyOrMoveInPlan > 0 ? 'part' : 'none', metric: `모집·입주 예정 ${Math.round(pct(m.supplyOrMoveInPlan, N))}%`, tip: `모집 또는 입주 예정일이 있는 사업 ${m.supplyOrMoveInPlan}/${N} · 규칙: 80% 이상 충족, 0 초과 부분` },
    'F-10': { verdict: m.sourced === N ? 'met' : m.sourced > 0 ? 'part' : 'none', metric: `원천·기준일 ${m.sourced}/${N}`, tip: `원천 참조와 기준일이 있는 사업 · 수집 실패 원천 ${m.failedSources}곳(마지막 정상 값 사용) · 규칙: 모든 사업이면 충족` },
    'F-11': { verdict: m.pairCells > 0 ? 'part' : 'none', metric: `목표·실적 같은 칸 ${m.pairCells}/6`, tip: `정상·주의·지연 판정 사업 ${m.judged}/${N} · 목표·실적 비교는 9·7 단계 ${m.pairCells}칸 · 규칙: 목표·실적 칸이 있으면 부분` },
    'F-12': { verdict: m.scenarios > 0 ? 'part' : 'none', metric: `시나리오 ${m.scenarios}건`, tip: '일정 이동 시나리오·기준선 저장 없음 · 규칙: 저장한 시나리오가 있으면 부분' },
  };
}

function buildRequirements(x, { md, month, referenceDate, edition }) {
  const m = measure(x), J = judge(m);
  const used = new Set(Object.values(F_LINK).flatMap(([d]) => d));
  return {
    schema: 'requirements/1', observedMonth: month, referenceDate, edition,
    screens: { projects: { name: '사업', href: '/projects' }, region: { name: '지역 공급', href: '/region' }, sources: { name: '데이터 원본', href: '/sources' } },
    directives: directivesOf(md).filter((d) => used.has(d.date)),
    items: REQUIREMENTS.map((r) => ({ ...r, dates: F_LINK[r.id][0], screens: F_LINK[r.id][1], ...J[r.id] })),
    measures: m,
  };
}

const readGz = (file) => zlib.gunzipSync(fs.readFileSync(file)).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
function build({ month, root = P.ROOT } = {}) {
  month ??= P.latestMonth(root);
  const dir = P.ledgerDir(month, root), tdir = path.join(dir, 'tables');
  const table = (t) => JSON.parse(fs.readFileSync(path.join(tdir, `${t}.json`), 'utf8')).rows;
  const board = (file) => JSON.parse(fs.readFileSync(path.join(root, 'data/board', file), 'utf8'));
  const homeDir = latestHomeDir(dir);
  const sched = path.join(homeDir ?? `${dir}/raw/home`, 'execution_schedule.jsonl.gz');
  if (!fs.existsSync(sched)) throw new Error(`HOME 판 원본이 없다: ${sched} — raw-store.js 로 받아 온 뒤 다시 실행`);
  const caseFile = path.join(homeDir, 'execution_case.jsonl.gz');
  const hmDir = path.join(root, 'data/board/home-map');
  const homeLoc = Object.fromEntries(fs.readdirSync(hmDir).filter((x) => /^\d{5}\.json$/.test(x)).sort().flatMap((x) => JSON.parse(fs.readFileSync(path.join(hmDir, x), 'utf8')).projects.filter((p) => p.loc).map((p) => [p.id, p.loc])));
  const x = {
    projects: table('projects'), events: table('events'), links: table('links'), identifiers: table('identifiers'),
    ledgerMap: board('ledger-map.json'), pIndex: board('projects-index.json'), pDetail: board('project-detail.json'), pp: board('policy-progress.json'), homeSources: board('home-sources.json'),
    homeLoc, schedule: readGz(sched).map((r) => r.payload), cases: fs.existsSync(caseFile) ? readGz(caseFile).length : 0, sidoTotal: board('molit.json').sido.length - 1,
  };
  const md = fs.readFileSync(path.join(root, 'docs/주택파동_정책근거_및_요구사항_매트릭스.md'), 'utf8');
  return buildRequirements(x, { md, month, referenceDate: P.referenceDateOf(dir), edition: path.basename(homeDir) });
}

if (require.main === module) {
  const i = process.argv.indexOf('--month');
  const doc = build({ month: i > 0 ? process.argv[i + 1] : undefined });
  fs.writeFileSync(path.join(P.ROOT, OUT), JSON.stringify(doc) + '\n');
  const n = (v) => doc.items.filter((r) => r.verdict === v).length;
  console.log(`${OUT}: 충족 ${n('met')} · 부분 ${n('part')} · 없음 ${n('none')} (HOME 사업 ${doc.measures.base}, 판 ${doc.edition})`);
  for (const r of doc.items) console.log(`  ${r.id} ${r.verdict.padEnd(4)} ${r.metric}`);
}

module.exports = { REQUIREMENTS, F_LINK, OUT, directivesOf, measure, judge, buildRequirements, build };
