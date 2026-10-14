'use strict';
/* 사업 화면(/projects · /project/[id] · /reports 정책 절)이 읽는 자료 두 파일. 원장 표를 화면마다 통째로 읽지 않게 미리 묶는다.
   - data/board/projects-index.json: 목록에 더하는 것만 — 정책·프로그램 목록, 시군구 이름, 사업별 공고 확인 호수·프로그램·정책·연결 상태.
     사업 행(이름·단계·판정·다음 일정·호수)은 지도 색인 data/board/ledger-map.json 그대로 쓴다(판정 규칙 한 벌 — tools/ledger/board.js).
   - data/board/project-detail.json: 발급 사업(살아 있는 레지스트리 사업)마다 개요·단계별 현재 예정/실제/추정·예정일 경과·공정률 이력·근거 원천.
     events 표(4 MB)를 사업별로 미리 묶은 것이다. 현재 예정과 경과는 board.js projectStates 그대로(목록의 다음 일정·상태와 같은 값).
   공고 확인 호수와 정책 연결 규칙은 지도 정적 자료(tools/ledger/home-map.js)와 같다: 연결이 하나라도 CONFIRMED 면 CONFIRMED, 아니면 REVIEW_REQUIRED.
   순수 함수 projectsIndexFromLedger·projectDetailFromLedger 는 파일을 읽거나 쓰지 않는다. 같은 입력 → 같은 바이트.
   실행: node tools/ledger/projects-index.js [--month YYYY-MM] → 그 달 원장 표를 읽어 두 파일을 다시 쓴다. 시험: tests/js/projects-index.test.cjs */
const fs = require('node:fs');
const path = require('node:path');

const P = require('./paths');
const { projectStates, loadTables } = require('./board');
const { noticeUnitsOf } = require('./home-map');

const INDEX_OUT = 'data/board/projects-index.json';
const DETAIL_OUT = 'data/board/project-detail.json';
const EXTRA_TABLES = ['links', 'programs', 'policies'];
/* 단계 사건(원장 event_type) — 사업 상세 타임라인의 줄 순서 */
const STAGE_EVENTS = ['PERMIT', 'CONSTRUCTION_START', 'SUPPLY_NOTICE', 'COMPLETION', 'MOVE_IN'];
const byStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const textOf = (e) => e.event_date ?? e.event_month ?? (e.event_year != null ? String(e.event_year) : null);

/* POL_2025_0907 → 키 '97'·짧은 이름 '9·7' */
const policyKey = (id) => { const m = /^POL_\d{4}_(\d{2})(\d{2})$/.exec(id); return m ? `${+m[1]}${+m[2]}` : id; };
const policyShort = (id) => { const m = /^POL_\d{4}_(\d{2})(\d{2})$/.exec(id); return m ? `${+m[1]}·${+m[2]}` : id; };

/* 사업 → { programs(이름), policies(키), link } (정책·프로그램 연결) */
function linksOf(tables) {
  const progName = new Map(tables.programs.map((p) => [p.local_program_id, p.program_name]));
  const prgPol = new Map();
  for (const l of tables.links) if (l.link_type === 'POLICY_PROGRAM') (prgPol.get(l.to_local_id) || prgPol.set(l.to_local_id, new Set()).get(l.to_local_id)).add(l.from_local_id);
  const out = new Map();
  for (const l of tables.links) {
    if (l.link_type !== 'PROGRAM_PROJECT') continue;
    const x = out.get(l.to_local_id) || out.set(l.to_local_id, { confirmed: false, programs: new Set(), policies: new Set() }).get(l.to_local_id);
    if (l.review_status === 'CONFIRMED') x.confirmed = true;
    if (progName.has(l.from_local_id)) x.programs.add(progName.get(l.from_local_id));
    for (const pol of prgPol.get(l.from_local_id) ?? []) x.policies.add(policyKey(pol));
  }
  return { out, prgPol, progName };
}

/* tables: board.js NEEDED + links·programs·policies. 돌려주는 것: projects-index/1 */
function projectsIndexFromLedger(tables, { referenceDate, observedMonth }) {
  const live = tables.projects.filter((p) => !p.superseded_by);
  const { out: links, prgPol, progName } = linksOf(tables);
  const notice = noticeUnitsOf(tables);
  const areaName = new Map(tables.areas.filter((a) => a.level === 'SGG').map((a) => [a.area_code, a.area_name]));
  const policies = [...tables.policies].sort((a, b) => byStr(a.announcement_date, b.announcement_date)).map((p) => ({
    id: p.local_policy_id, key: policyKey(p.local_policy_id), short: policyShort(p.local_policy_id), name: p.policy_name, announced: p.announcement_date, scope: p.scope_region,
  }));
  /* 프로그램: 같은 이름은 하나로(원천에 같은 이름의 프로그램 id 가 둘 있다), 연결 사업이 있는 것만, 사업 수 많은 순 */
  const progs = new Map();
  for (const p of live) for (const name of links.get(p.local_project_id)?.programs ?? []) {
    const x = progs.get(name) || progs.set(name, { name, policies: new Set(), projects: 0 }).get(name);
    x.projects += 1;
  }
  for (const [prg, pols] of prgPol) { const x = progs.get(progName.get(prg)); if (x) for (const pol of pols) x.policies.add(policyKey(pol)); }
  const programs = [...progs.values()].sort((a, b) => b.projects - a.projects || byStr(a.name, b.name)).map((x) => ({ name: x.name, policies: [...x.policies].sort(), projects: x.projects }));
  const sgg = {};
  for (const code of [...new Set(live.map((p) => p.sgg_code))].sort()) sgg[code] = areaName.get(code) ?? null;
  const projects = {};
  for (const p of [...live].sort((a, b) => byStr(a.local_project_id, b.local_project_id))) {
    const id = p.local_project_id, l = links.get(id), n = notice(id), x = {};
    if (n != null) x.notice = n;
    if (l) { x.programs = [...l.programs].sort(); x.policies = [...l.policies].sort(); x.link = l.confirmed ? 'CONFIRMED' : 'REVIEW_REQUIRED'; }
    if (Object.keys(x).length) projects[id] = x;
  }
  return { schema: 'projects-index/1', observedMonth, referenceDate, policies, programs, sgg, projects };
}

/* 발급 사업(issued_at 있고 대체되지 않음)마다 상세. 돌려주는 것: project-detail/1 */
function projectDetailFromLedger(tables, { referenceDate, observedMonth }) {
  const { projects: states } = projectStates(tables, referenceDate);
  const group = (rows) => { const m = new Map(); for (const r of rows) (m.get(r.local_project_id) || m.set(r.local_project_id, []).get(r.local_project_id)).push(r); return m; };
  const evOf = group(tables.events), locOf = group(tables.project_locations), unitOf = group(tables.units);
  const usedRefs = new Set();
  const projects = {};
  for (const x of [...states].filter((s) => s.issued).sort((a, b) => byStr(a.p.local_project_id, b.p.local_project_id))) {
    const id = x.p.local_project_id, evs = evOf.get(id) ?? [];
    const refs = new Set([x.p.source_ref]);
    const stages = {};
    for (const t of STAGE_EVENTS) {
      const s = {};
      const plan = x.plan[t];
      if (plan) { s.plan = textOf(plan); s.planSrc = plan.source_ref; refs.add(plan.source_ref); }
      /* 실제: 시작 사건(인허가·착공·모집공고)은 가장 이른 날, 준공·입주는 가장 늦은 날 */
      const act = evs.filter((e) => e.event_type === t && e.date_type === 'ACTUAL' && textOf(e)).sort((a, b) => byStr(textOf(a), textOf(b)) || byStr(a.source_ref, b.source_ref));
      const a = t === 'COMPLETION' || t === 'MOVE_IN' ? act[act.length - 1] : act[0];
      if (a) { s.actual = textOf(a); s.actualSrc = a.source_ref; refs.add(a.source_ref); }
      const est = evs.filter((e) => e.event_type === t && e.date_type === 'ESTIMATED' && textOf(e)).sort((p, q) => byStr(textOf(p), textOf(q)))[0];
      if (est && !a) { s.est = textOf(est); s.estSrc = est.source_ref; refs.add(est.source_ref); }
      const late = x.overdue.find((o) => o.eventType === t && (o.class === 'caution' || o.class === 'delay'));   // 경과 1개월 미만(ok)·판정 제외는 표시하지 않는다
      if (late) s.late = { months: late.months, cls: late.class };
      if (Object.keys(s).length) stages[t] = s;
    }
    /* 공정률 이력: 보고일 순, 같은 날 보고가 여럿이면 가장 큰 값(원천이 지난 달 사진 보고를 한 날에 몰아 싣는다) */
    const prog = new Map();
    for (const e of evs) {
      if (e.event_type !== 'PROGRESS' || e.progress_pct == null || !e.event_date) continue;
      refs.add(e.source_ref);
      prog.set(e.event_date, Math.max(prog.get(e.event_date) ?? -1, e.progress_pct));
    }
    for (const u of unitOf.get(id) ?? []) refs.add(u.source_ref);
    for (const r of refs) usedRefs.add(r);
    projects[id] = {
      unit: x.p.project_unit, agency: x.p.agency_id, scope: x.p.public_scope, basis: x.p.public_basis, asOf: x.p.as_of, issuedAt: x.p.issued_at, source: x.p.source_ref,
      bjd: [...new Set((locOf.get(id) ?? []).map((l) => l.bjd_code).filter(Boolean))].sort(),
      stages, progress: [...prog].sort((a, b) => byStr(a[0], b[0])), refs: [...refs].sort(),
    };
  }
  const sources = {};
  for (const s of [...tables.sources].sort((a, b) => byStr(a.source_ref, b.source_ref))) {
    if (!usedRefs.has(s.source_ref)) continue;
    sources[s.source_ref] = { provider: s.provider, dataset: s.dataset_name, asOf: s.data_as_of, collectedAt: s.collected_at, url: s.source_url };
  }
  const agencies = Object.fromEntries(tables.agencies.map((a) => [a.agency_id, a.agency_name]));
  return { schema: 'project-detail/1', observedMonth, referenceDate, agencies, sources, projects };
}

/* 파일 글: 머리 칸 한 줄씩, 큰 묶음(projects·sources)은 항목 한 줄씩(diff 가 사업 단위로 보이게) */
function renderDoc(doc, big) {
  const lines = Object.entries(doc).map(([k, v]) => {
    if (!big.includes(k)) return `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`;
    const items = Object.entries(v).map(([id, x]) => `    ${JSON.stringify(id)}: ${JSON.stringify(x)}`);
    return `  ${JSON.stringify(k)}: {\n${items.join(',\n')}\n  }`;
  });
  return `{\n${lines.join(',\n')}\n}\n`;
}
const renderIndex = (doc) => renderDoc(doc, ['projects']);
const renderDetail = (doc) => renderDoc(doc, ['sources', 'projects']);

/* 그 달 폴더의 원장 표 + 기준일 */
function loadMonth(month = P.latestMonth()) {
  const dir = P.ledgerDir(month), tablesDir = path.join(dir, 'tables');
  const tables = { ...loadTables(tablesDir), ...Object.fromEntries(EXTRA_TABLES.map((t) => [t, JSON.parse(fs.readFileSync(path.join(tablesDir, `${t}.json`), 'utf8')).rows])) };
  return { tables, referenceDate: P.referenceDateOf(dir), observedMonth: month };
}

module.exports = { INDEX_OUT, DETAIL_OUT, STAGE_EVENTS, policyKey, policyShort, projectsIndexFromLedger, projectDetailFromLedger, renderIndex, renderDetail, loadMonth };

if (require.main === module) {
  const i = process.argv.indexOf('--month');
  const { tables, referenceDate, observedMonth } = loadMonth(i > 0 ? process.argv[i + 1] : undefined);
  const index = projectsIndexFromLedger(tables, { referenceDate, observedMonth });
  const detail = projectDetailFromLedger(tables, { referenceDate, observedMonth });
  const a = renderIndex(index), b = renderDetail(detail);
  fs.writeFileSync(path.join(P.ROOT, INDEX_OUT), a);
  fs.writeFileSync(path.join(P.ROOT, DETAIL_OUT), b);
  console.log(`${INDEX_OUT}: 정책 ${index.policies.length} · 프로그램 ${index.programs.length} · 사업 ${Object.keys(index.projects).length} · ${Buffer.byteLength(a)} 바이트`);
  console.log(`${DETAIL_OUT}: 발급 사업 ${Object.keys(detail.projects).length} · 원천 ${Object.keys(detail.sources).length} · ${Buffer.byteLength(b)} 바이트`);
}
