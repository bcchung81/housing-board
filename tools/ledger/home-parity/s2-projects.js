'use strict';
/* S2 정답 값(golden-projects.json·S2-project-map.csv) — 받은 HOME API 응답(정답 입력 S2-raw-*.json)·HOME 판(원장 달의 가장 늦은 판)·우리 원장·화면 데이터만 읽어
   다시 만든다. 네트워크 호출 없음. 저장소 파일은 읽기만.
   옮겨 온 곳: .cache/home-parity/golden/S2-extract.js(2026-11-09 HOME-JSON-반영-계획 P3) — 판 경로(20261022T133544Z)·기준일 하드코딩을 걷어 냈다.
   실행: node s2-projects.js --golden <정답 입력 폴더> --out <출력 폴더> [--repo <저장소>] [--as-of YYYY-MM-DD(기본 S1-view-policy.json as_of_date)] */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const G = path.resolve(arg('--golden') || '.');
const OUT = path.resolve(arg('--out') || G);
const REPO = path.resolve(arg('--repo') || path.join(__dirname, '..', '..', '..'));
const P = require(path.join(REPO, 'tools/ledger/paths'));
const MONTH_DIR = P.ledgerDir(P.latestMonth(REPO));
const DUMP = require(path.join(REPO, 'tools/ledger/home-source')).latestHomeDir(MONTH_DIR);
const TABLES = path.join(MONTH_DIR, 'tables');
const BOARD = path.join(REPO, 'data/board');
const AS_OF = arg('--as-of') || JSON.parse(fs.readFileSync(path.join(G, 'S1-view-policy.json'), 'utf8')).as_of_date;
if (!DUMP) throw new Error(`HOME 판 없음: ${MONTH_DIR}/raw/home`);

const raw = (n) => JSON.parse(fs.readFileSync(path.join(G, `S2-raw-${n}.json`), 'utf8'));
const table = (n) => JSON.parse(fs.readFileSync(path.join(TABLES, `${n}.json`), 'utf8')).rows;
const board = (n) => JSON.parse(fs.readFileSync(path.join(BOARD, n), 'utf8'));
const jsonl = (n) => zlib.gunzipSync(fs.readFileSync(path.join(DUMP, `${n}.jsonl.gz`))).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const obj = (v) => (typeof v === 'string' ? JSON.parse(v) : v) ?? {};
const count = (a, f) => a.reduce((m, x) => { const k = f(x); m[k] = (m[k] ?? 0) + 1; return m; }, {});
const sum = (a, f) => a.reduce((s, x) => s + (f(x) ?? 0), 0);

/* ---------- PoC 쪽 ---------- */
const mappings = raw('mappings');                 // /mappings?as_of_date=2026-10-22&compact=true — 사업후보 451(확정·검토·해제)
const dash = raw('map-dashboard');                // /map/dashboard?as_of_date=2026-10-22&compact=true — 해제 뺀 443
const workspace = raw('project-workspace');       // /project-workspace — 사업 추진현황 화면 목록(9·7 확정·검토)
const tree = raw('tree');                         // /tree?as_of_date=2026-10-22 — 정책-프로그램-사업 연결
const dashItem = new Map(dash.items.map((r) => [r.id, r]));
const wsIds = new Set(workspace.items.map((r) => r.id));
const treePolicy = new Map();
for (const p of tree.items) for (const g of p.groups) for (const r of g.projects) treePolicy.set(r.id, p.policy_id);

/* ---------- HOME 덤프(10-20 판) ---------- */
const dumpPro = new Map(jsonl('project').map((r) => [r.entity_id, r.payload]));
const dumpMapping = new Map(jsonl('home_mapping').map((r) => [r.project_id, r]));
const anchorOf = new Map();
for (const a of jsonl('home_identity_alias')) if (a.match_rule === 'SOURCE_ANCHOR') anchorOf.set(a.source_entity_id, a.project_id);

/* ---------- 우리 원장·화면 ---------- */
const projects = new Map(table('projects').map((p) => [p.local_project_id, p]));
const idents = table('identifiers');
const reviews = table('review_required');
const proToLocal = new Map(idents.filter((i) => i.id_type === 'HOME' && /^PRO_/.test(i.id_value)).map((i) => [i.id_value, i.local_project_id]));
const finalOf = (id) => { let p = projects.get(id), guard = 0; while (p?.superseded_by && guard++ < 10) p = projects.get(p.superseded_by); return p?.local_project_id ?? id; };
const prosOfFinal = new Map();
for (const [pro, loc] of proToLocal) { const f = finalOf(loc); (prosOfFinal.get(f) || prosOfFinal.set(f, []).get(f)).push(pro); }
const unresolvedPro = new Map();
for (const r of reviews) if (r.review_type === 'SGG_UNRESOLVED') for (const m of r.detail.matchAll(/PRO_[0-9a-f]{24}/g)) unresolvedPro.set(m[0], r.record_key);
const idx = board('projects-index.json');
const screenIds = new Set(Object.keys(idx.projects));
const renewalIds = new Set(Object.values(idx.renewal.bySgg).flat().map((r) => r.id));
const detail = board('project-detail.json').projects;
const mapRows = new Map(Object.values(board('ledger-map.json').bySgg).flat().map((r) => [r.id, r]));

/* ---------- 사업 단위 대조표 ---------- */
const SCOPE_REASON = { PRIVATE_RENEWAL: '제외_민간정비(공공 분류 안2, /projects 정비 목록에만)', PRIVATE: '제외_민간(공공 분류 안2)' };
const rows = [];
for (const it of mappings.items) {
  const mp = obj(it.mapping);
  const d = dashItem.get(it.id);
  const q = d ? obj(d.map_quantities) : {};
  const loc = proToLocal.get(it.id) ?? null;
  const fin = loc ? finalOf(loc) : null;
  const pr = fin ? projects.get(fin) : null;
  const inDump = dumpPro.has(it.id);
  const group = fin ? prosOfFinal.get(fin) ?? [] : [];
  let status, reason = '';
  if (!inDump) { status = '덤프뒤신규'; reason = `HOME 판(${path.basename(DUMP)}) 뒤에 생긴 사업후보 — 재이관하면 들어옴`; }
  else if (!loc && unresolvedPro.has(it.id)) { status = '제외_시군구미정'; reason = `review_required SGG_UNRESOLVED (${unresolvedPro.get(it.id)})`; }
  else if (!loc && !anchorOf.has(it.id)) { status = '제외_SOURCE_ANCHOR없음'; reason = '덤프에 HOME 사업(HPR)의 SOURCE_ANCHOR 별칭이 없어 변환기가 사업으로 만들지 않음'; }
  else if (!loc) { status = '제외_변환기미발급'; reason = `SOURCE_ANCHOR ${anchorOf.get(it.id)} 있으나 identifiers 없음`; }
  else if (pr && SCOPE_REASON[pr.public_scope]) { status = pr.public_scope === 'PRIVATE_RENEWAL' ? '제외_민간정비' : '제외_민간'; reason = SCOPE_REASON[pr.public_scope]; }
  else if (screenIds.has(fin)) { status = group.length > 1 ? '병합' : '화면'; reason = group.length > 1 ? `같은 현장·블록 병합 ${group.length}행→1곳` : ''; }
  else { status = '제외_기타'; reason = `원장 ${fin} scope ${pr?.public_scope ?? '-'} 이 화면 목록에 없음`; }
  if (loc && loc !== fin) reason = `${reason ? reason + ' · ' : ''}식별자 ${loc} → superseded_by ${fin}`;
  rows.push({
    poc_id: it.id, poc_name: it.name, poc_region: it.region, poc_municipality: it.municipality ?? '',
    poc_mapping_status: mp.status ?? '', poc_policy: mp.policy_id ?? '', poc_program: it.program ?? '',
    poc_in_map_443: d ? 'Y' : 'N', poc_in_projects_workspace: wsIds.has(it.id) ? 'Y' : 'N',
    poc_source: it.source_id, poc_stage: it.stage ?? '', poc_planned_units: it.planned_units ?? '',
    poc_map_target_units: q.target_units ?? '', poc_supply_units: it.supply_units ?? '',
    in_dump_1020: inDump ? 'Y' : 'N', dump_mapping_status: dumpMapping.get(it.id)?.status ?? '', dump_policy: dumpMapping.get(it.id)?.policy_id ?? '',
    hpr: anchorOf.get(it.id) ?? '', our_identifier_id: loc ?? '', our_final_id: fin ?? '',
    our_scope: pr?.public_scope ?? '', our_stage: pr?.stage_code ?? '', our_units: fin && mapRows.get(fin) ? mapRows.get(fin).units : '',
    mapping_changed_after_dump: inDump && (dumpMapping.get(it.id)?.policy_id !== mp.policy_id || dumpMapping.get(it.id)?.status !== mp.status) ? 'Y' : 'N',
    poc_in_97_target_175: '',
    merge_group_size: group.length || '', status, reason,
  });
}
const target97 = new Set(obj(raw('map-dashboard-js').summary.chart_target_ids));
for (const r of rows) r.poc_in_97_target_175 = target97.has(r.poc_id) ? 'Y' : 'N';
rows.sort((a, b) => a.status.localeCompare(b.status) || a.poc_id.localeCompare(b.poc_id));
const cols = Object.keys(rows[0]);
const cell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };
const byStatus = count(rows, (r) => r.status);
const totalLine = { poc_id: '합계', poc_name: `PoC 사업후보 ${rows.length}행 · ${Object.entries(byStatus).map(([k, v]) => `${k} ${v}`).join(' · ')}`,
  poc_in_map_443: rows.filter((r) => r.poc_in_map_443 === 'Y').length, poc_in_projects_workspace: rows.filter((r) => r.poc_in_projects_workspace === 'Y').length,
  poc_planned_units: sum(rows, (r) => +r.poc_planned_units || 0), poc_map_target_units: sum(rows, (r) => +r.poc_map_target_units || 0),
  in_dump_1020: rows.filter((r) => r.in_dump_1020 === 'Y').length, mapping_changed_after_dump: rows.filter((r) => r.mapping_changed_after_dump === 'Y').length, poc_in_97_target_175: rows.filter((r) => r.poc_in_97_target_175 === 'Y').length, our_final_id: new Set(rows.map((r) => r.our_final_id).filter(Boolean)).size };
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'S2-project-map.csv'), [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(',')), cols.map((c) => cell(totalLine[c])).join(',')].join('\n') + '\n');

/* 우리 쪽에서 PoC 사업후보로 이어지지 않는 원장 사업(번들 등) */
const linkedFinal = new Set(rows.map((r) => r.our_final_id).filter(Boolean));
const oursOnly = [...screenIds].filter((id) => !linkedFinal.has(id));

/* ---------- 정답 값(사업 모집단) ---------- */
const st = (r) => obj(r.mapping).status;
const golden = {
  _meta: { as_of: AS_OF, made_by: 'S2-extract.js', poc_sources: [`/mappings?as_of_date=${AS_OF}&compact=true`, `/map/dashboard?as_of_date=${AS_OF}&compact=true`, '/project-workspace', `/tree?as_of_date=${AS_OF}`] },
  population: {
    'mappings.total': mappings.total,
    'mappings.counts': mappings.counts,
    'mappings.audit': mappings.audit,
    'map.summary.project_count': dash.summary.project_count,
    'map.items': dash.items.length,
    'map.items_eq_confirmed_plus_review': dash.items.length === (mappings.counts.CONFIRMED + mappings.counts.REVIEW),
    'tree.projects': [...treePolicy.keys()].length,
    'tree.by_policy': count([...treePolicy.values()], (x) => x),
    'workspace.items': workspace.items.length,
    'workspace.by_status': count(workspace.items, (r) => obj(r.mapping).status),
    'workspace.by_policy': count(workspace.items, (r) => obj(r.mapping).policy_id),
    'mappings.by_policy_status': count(mappings.items, (r) => `${obj(r.mapping).policy_id}|${st(r)}`),
  },
  project_map: {
    poc_rows: rows.length,
    by_status: byStatus,
    our_final_projects_linked: linkedFinal.size,
    our_screen_projects: screenIds.size,
    by_poc_policy_status_x_ours: rows.reduce((m, r) => { const k = `${r.poc_policy}|${r.poc_mapping_status}`; (m[k] ??= {})[r.status] = (m[k][r.status] ?? 0) + 1; return m; }, {}),
    mapping_changed_after_dump: count(rows.filter((r) => r.mapping_changed_after_dump === 'Y'), (r) => `${r.dump_policy || '(덤프에 없음)'}→${r.poc_policy}`),
    poc97_rows_on_our_screen: rows.filter((r) => r.poc_policy === 'POL_2025_0907' && ['화면', '병합'].includes(r.status)).length,
    poc97_our_projects: new Set(rows.filter((r) => r.poc_policy === 'POL_2025_0907' && ['화면', '병합'].includes(r.status)).map((r) => r.our_final_id)).size,
    poc97_our_projects_without_97_link: [...new Set(rows.filter((r) => r.poc_policy === 'POL_2025_0907' && ['화면', '병합'].includes(r.status)).map((r) => r.our_final_id))].filter((id) => !(idx.projects[id]?.policies ?? []).includes('97')),
    our_screen_projects_without_poc_row: oursOnly.length,
    our_renewal_projects: renewalIds.size,
    ledger_rows: projects.size,
    ledger_live_by_scope: count([...projects.values()].filter((p) => !p.superseded_by), (p) => p.public_scope),
    ledger_superseded: [...projects.values()].filter((p) => p.superseded_by).length,
    identifiers_pro: proToLocal.size,
    dump_pro: dumpPro.size,
  },
};
/* ---------- PoC 기본 화면(9·7 필터 — JS 기본 인자) ---------- */
const dash97 = raw('map-dashboard-js');           // /map/dashboard?as_of_date=2026-10-22&policy_id=POL_2025_0907&horizon=10&measure=SUPPLY&schedule_status=all&compact=true
const tree97 = raw('tree-js');                    // /tree?as_of_date=2026-10-22&policy_id=POL_2025_0907
const s97 = dash97.summary;
const targetIds97 = new Set(obj(s97.chart_target_ids));
const plannedOf = new Map(dash97.items.map((r) => [r.id, r.planned_units]));
const distOf = (x) => { const d = obj(x.stage_distribution); return { total_units: d.total_units, advanced_units: d.advanced_units, pct: d.total_units ? Math.round(100 * d.advanced_units / d.total_units) : null, parts: d.parts, cumulative: d.cumulative }; };
const muni97 = dash97.municipalities.filter((m) => m.project_count).map((m) => ({ region: m.region, name: m.name, project_count: m.project_count, target_units: m.target_units, current_notice_units: m.current_notice_units, future1: obj(m.future)[0]?.source_units ?? null, stage_pct: distOf(m).pct }));
const blockStatus = (b) => { const p = obj(b.progress), goal = p.cumulative_goal_units, obs = p.observed_units;
  if (!(goal > 0) || obs == null || obs < 0) return '판정미확보'; const gap = Math.max(0, goal - obs), rate = 100 * gap / goal; return gap === 0 ? '정상' : rate >= 2 ? '지연' : '주의'; };
golden.poc_overview_97 = {
  'items': dash97.items.length,
  'summary.project_count': s97.project_count,
  'summary.target_units': s97.target_units,
  'summary.target_counted_projects': s97.target_counted_projects,
  'summary.target_excluded_projects': s97.target_excluded_projects,
  'summary.target_missing_projects': s97.target_missing_projects,
  'chart_target_ids.planned_sum': [...targetIds97].reduce((s, id) => s + (plannedOf.get(id) ?? 0), 0),
  'items.planned_sum_with_dup': sum(dash97.items, (r) => r.planned_units),
  'summary.current_notice_units': s97.current_notice_units,
  'summary.current_notice_count': s97.current_notice_count,
  'summary.future.source_units': obj(s97.future).map((f) => f.source_units),
  'summary.future.source_events': obj(s97.future).map((f) => f.source_events),
  'summary.progress': (({ observed_units, observed_pct, capacity_projects, year_to_date_goal_units, year_to_date_goal_events, late_count, schedule_gap_count, max_gap_months }) => ({ observed_units, observed_pct, capacity_projects, year_to_date_goal_units, year_to_date_goal_events, late_count, schedule_gap_count, max_gap_months, verification_count: obj(s97.progress).verification_project_ids?.length }))(obj(s97.progress)),
  'summary.stage_distribution': distOf(s97),
  'groups.region': dash97.groups.region.map((r) => ({ name: r.name, project_count: r.project_count, target_units: r.target_units, current_notice_units: r.current_notice_units, future1: obj(r.future)[0]?.source_units ?? null, stage: distOf(r) })),
  'municipalities.with_projects': muni97.length,
  'municipalities.target_sum': sum(muni97, (m) => m.target_units),
  'municipality_unlinked_ids': obj(dash97.municipality_unlinked_ids).length,
  'districts.linked_projects': new Set(dash97.districts.flatMap((d) => obj(d.project_ids))).size,
  'blocks': dash97.blocks.length,
  'blocks.status': count(dash97.blocks, blockStatus),
  'municipalities': muni97.sort((a, b) => (b.target_units ?? -1) - (a.target_units ?? -1)),
};
golden.poc_overview_all = { 'summary.project_count': dash.summary.project_count, 'summary.target_units': dash.summary.target_units, 'summary.target_counted_projects': dash.summary.target_counted_projects, 'summary.target_excluded_projects': dash.summary.target_excluded_projects, 'summary.target_missing_projects': dash.summary.target_missing_projects, 'summary.current_notice_units': dash.summary.current_notice_units, 'summary.stage_distribution': distOf(dash.summary), 'groups.policy': dash.groups.policy.map((p) => ({ id: p.id, name: p.name, project_count: p.project_count, target_units: p.target_units })) };
golden.poc_tree_97 = { projects: sum(tree97.items, (p) => sum(p.groups, (g) => g.count)), groups: Object.fromEntries(tree97.items[0].groups.map((g) => [g.name, g.count])) };
golden.poc_projects_workspace = { items: workspace.items.length, by_region: count(workspace.items, (r) => r.region), by_program: count(workspace.items, (r) => obj(r.mapping).program_name), programs_97: workspace.programs.filter((p) => p.policy_id === 'POL_2025_0907').length, planned_sum: sum(workspace.items, (r) => r.planned_units) };

/* ---------- 우리 값(같은 지표) ---------- */
const lmRows = Object.values(board('ledger-map.json').bySgg).flat();
const lmById = new Map(lmRows.map((r) => [r.id, r]));
const BOARD_OF = { '01': 0, '02': 0, '03': 1, '04': 2, '05': 3, '06': 4 };
const sggName = idx.sgg;
const sidoOf = (id) => ({ 11: '서울특별시', 28: '인천광역시', 41: '경기도' })[id.slice(4, 6)];
const faceName = (id) => { const code = id.slice(4, 9), n = sggName[code] ?? code, parts = n.split(' '); return parts[0] === '경기도' ? parts[1] : parts[parts.length - 1]; };
const is97 = (id) => (idx.projects[id]?.policies ?? []).includes('97');
const stageSums = (rs) => { const a = [0, 0, 0, 0, 0, 0]; for (const r of rs) a[BOARD_OF[r.stage] ?? 0] += r.units || 0; return a; };
const cal = board('region-calendar.json');
const calAll = Object.values(cal.sido).flat();
const ours = {
  screen_projects: lmRows.length,
  units: sum(lmRows, (r) => r.units),
  units_missing: lmRows.filter((r) => !r.units).length,
  by_sido: Object.fromEntries(['서울특별시', '인천광역시', '경기도'].map((s) => { const rs = lmRows.filter((r) => sidoOf(r.id) === s); return [s, { projects: rs.length, units: sum(rs, (r) => r.units) }]; })),
  stage_units: stageSums(lmRows),
  stage_counts: lmRows.reduce((a, r) => (a[BOARD_OF[r.stage] ?? 0]++, a), [0, 0, 0, 0, 0, 0]),
  cls: count(lmRows, (r) => r.cls ?? 'none'),
  calendar_12m: Object.fromEntries(cal.kinds.map((k) => { const xs = calAll.filter((e) => e.type === k); return [k, { events: xs.length, units: sum(xs, (e) => e.units) }]; })),
  notice_units: sum(Object.values(idx.projects), (p) => p.notice),
  p97: (() => { const rs = lmRows.filter((r) => is97(r.id)); return { projects: rs.length, confirmed: rs.filter((r) => idx.projects[r.id].link === 'CONFIRMED').length, units: sum(rs, (r) => r.units), stage_units: stageSums(rs), notice_units: sum(rs, (r) => idx.projects[r.id].notice), by_sido: count(rs, (r) => sidoOf(r.id)) }; })(),
};
/* 9·7 PoC 집계 175행이 가리키는 우리 사업 */
const ourOf97Target = new Set(rows.filter((r) => targetIds97.has(r.poc_id) && r.our_final_id && ['화면', '병합'].includes(r.status)).map((r) => r.our_final_id));
ours.p97_poc_target_rows_to_our_projects = { projects: ourOf97Target.size, units: sum([...ourOf97Target], (id) => lmById.get(id)?.units) };
/* 시군구(지도 면) 대조: PoC 9·7 계획 물량 vs 우리 9·7 연결 사업 호수 */
const ourFace = {};
for (const r of lmRows.filter((x) => is97(x.id))) { const k = `${sidoOf(r.id)}|${faceName(r.id)}`; ourFace[k] = ourFace[k] ?? { projects: 0, units: 0 }; ourFace[k].projects++; ourFace[k].units += r.units || 0; }
const allFace = {};
for (const r of lmRows) { const k = `${sidoOf(r.id)}|${faceName(r.id)}`; allFace[k] = allFace[k] ?? { projects: 0, units: 0 }; allFace[k].projects++; allFace[k].units += r.units || 0; }
golden.municipality_compare_97 = [...new Set([...muni97.map((m) => `${m.region}|${m.name}`), ...Object.keys(ourFace)])].sort().map((k) => { const m = muni97.find((x) => `${x.region}|${x.name}` === k); return { face: k, poc_projects: m?.project_count ?? 0, poc_target_units: m?.target_units ?? null, our_97_projects: ourFace[k]?.projects ?? 0, our_97_units: ourFace[k]?.units ?? 0, our_all_units: allFace[k]?.units ?? 0 }; });
const unitRows = table('units').filter((u) => u.quantity_type === 'PROJECT_PLAN' && u.unit_scope === 'TOTAL');
const planOf = new Map();
for (const u of unitRows) planOf.set(u.local_project_id, Math.max(planOf.get(u.local_project_id) ?? 0, u.unit_count ?? 0));
ours.by_policy = Object.fromEntries(['97', '129', '813'].map((k) => { const rs = lmRows.filter((r) => (idx.projects[r.id]?.policies ?? []).includes(k)); return [k, { projects: rs.length, units: sum(rs, (r) => r.units) }]; }));
ours.ledger_live_units_by_scope = [...projects.values()].filter((p) => !p.superseded_by).reduce((m, p) => { const k = p.public_scope; m[k] ??= { projects: 0, units: 0 }; m[k].projects++; m[k].units += planOf.get(p.local_project_id) ?? 0; return m; }, {});
golden.ours = ours;

/* ---------- 연도별 공급(PoC /annual-supply vs 우리 region-annual·molit) ---------- */
const ann = raw('annual-supply');
const SIDO3 = { '서울특별시': '11', '인천광역시': '28', '경기도': '41' };
const ra = board('region-annual.json'), molit = board('molit.json');
const ourYear = (metric, code, y) => {
  if (metric === 'permit') { if (ra.permitYearly[code]?.[y] != null) return ra.permitYearly[code][y]; const s = molit.metrics.permit.series[code].total; const v = molit.months.map((m, i) => (m.startsWith(`${y}-`) ? s[i] : null)).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) : null; }
  const s = ra.series[metric][code]; const v = ra.months.map((m, i) => (m.startsWith(`${y}-`) ? s[i] : null)).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) : null;
};
const MET = { '분양승인': 'sale', '인허가': 'permit', '착공': 'start', '준공': 'complete' };
const annual = [];
for (const r of ann.rows.filter((x) => SIDO3[x.region])) for (const [k, m] of Object.entries(MET)) {
  const poc = r.metrics[k]?.units ?? null, our = ourYear(m, SIDO3[r.region], r.year);
  annual.push({ region: r.region, year: r.year, metric: k, poc, ours: our, same: poc === our, complete: r.metrics[k]?.complete ?? null });
}
golden.annual_supply = { rows: annual.length, mismatches: annual.filter((x) => !x.same), metro_by_year: Object.fromEntries([...new Set(annual.map((x) => x.year))].map((y) => [y, Object.fromEntries(Object.keys(MET).map((k) => [k, { poc: sum(annual.filter((x) => x.year === y && x.metric === k), (x) => x.poc), ours: sum(annual.filter((x) => x.year === y && x.metric === k), (x) => x.ours) }]))])) };

/* ---------- 지역 지표(PoC /area-context·/area-outlook vs 우리 area-facts) ---------- */
const af = board('area-facts.json').sido;
const last = (o) => { const ks = Object.keys(o ?? {}).sort(); return ks.length ? [ks.at(-1), o[ks.at(-1)]] : [null, null]; };
golden.area = Object.fromEntries(Object.entries({ seoul: '11', incheon: '28', gyeonggi: '41' }).map(([slug, code]) => {
  const c = raw(`area-context-${slug}`), o = raw(`area-outlook-${slug}`), a = af[code];
  const pop = c.population_history?.at(-1), hb = c.housing_balance?.at(-1);
  return [a.name, {
    population: { poc: pop?.population ?? pop?.value ?? null, poc_year: pop?.year ?? null, ours: last(a.population)[1], ours_year: last(a.population)[0] },
    households: { poc: hb?.households ?? null, ours: last(a.households)[1] },
    housing_units: { poc: hb?.housing_units ?? null, ours: last(a.housing_units)[1] },
    unsold_total: { poc: c.unsold?.current?.total ?? null, poc_period: c.unsold?.current?.period ?? null, ours: last(a.unsold_total)[1], ours_period: last(a.unsold_total)[0] },
    unsold_completed: { poc: c.unsold?.current?.completed ?? null, ours: last(a.unsold_completed)[1] },
    forecast_households_2026: { poc: o.years.find((y) => y.year === 2026)?.forecast_households ?? null, ours: a.forecast_households?.['2026'] ?? null },
    outlook_gap: o.years.filter((y) => [2026, 2027, 2030].includes(y.year)).map((y) => ({ year: y.year, scenario_gap_units: y.scenario_gap_units, planned_completion_cumulative: y.planned_completion_cumulative })),
  }];
}));

fs.writeFileSync(path.join(OUT, 'golden-projects.json'), JSON.stringify(golden, null, 1) + '\n');
console.log(JSON.stringify({ project_map: golden.project_map, overview97: Object.fromEntries(Object.entries(golden.poc_overview_97).filter(([k]) => k !== 'municipalities')), ours, annual_mismatch: golden.annual_supply.mismatches.length, area: golden.area }, null, 1));
