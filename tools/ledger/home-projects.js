'use strict';
/* HOME PoC 규칙의 '사업 보기' data/board/home-projects.json — 화면(/map·/region·/month·/agency·/citizen 3화면·/projects)이 함께 쓰는 사업 단위 자료 층.
   셈 단위·범위·값은 PoC 와 같게(2026-10-21 결정): 사업 = HOME 원천 사업후보 행(PRO_) 하나, 해제(RELEASED) 행은 통계에서 뺀다, 측정값은 담당자 입력·추정 포함.
   실행: node tools/ledger/home-projects.js [--month YYYY-MM] [--home <HOME 판 폴더>] [--out <파일>] [--fetch-poc]
   원천
   - 덤프(우선): HOME 덤프 판 raw/home/<덤프시각>(기준일 = 덤프 시각의 한국 날짜). 사업 행·정책 매핑(프로그램 위계 포함)·물량·지구·블록 중복 제외·시군구 소속·
     단계 사건·일정은 tools/ledger/policy-progress.js(homeService·buildCohorts — HOME policy_delivery.build_delivery 이식)를,
     단계 도달·사업 판정·12개월 공급 증가분·기관 묶음은 tools/ledger/home-view.js(PoC 프런트 계산 이식)를 require 해서 그대로 쓴다(두 파일은 고치지 않는다).
     정책 전체 범위는 buildCohorts 에 '해제 뺀 모든 사업'을 넘겨 만든다(9·7 범위로 만든 묶음과 사업마다 사건·일정이 같다 — 시험으로 확인).
   - PoC 공개 API 스냅샷(덤프로 재현할 수 없는 값만): raw/home-api/<기준일>/projects-map-dashboard{,-97}.json.gz(/map/dashboard 정책 전체·9·7)·
     projects-policy-delivery-97.json.gz(/policy-delivery/view 의 portfolio_cohorts 만)(--fetch-poc 로 받는다. 압축 원본은 git 무시,
     같은 폴더 manifest.json 에 주소·받은 시각·sha256·행 수 — 다른 도구(home-sources.js)와 나눠 쓰므로 내 항목만 더한다). 받을 때 담당자 이름·사유 칸(basis·reason·actor 등)은 지운다.
     스냅샷에서 가져오는 값: ① 덤프 뒤 생긴 사업 행(덤프에 없음) ② 덤프 이식 규칙이 PoC 서버와 다른 행의 집계 대상 여부·시군구 소속 ③ /map/dashboard 의 단계 분포(서버 계산 — 규칙 미공개)
     ④ 덤프 뒤 생긴 행의 사건·일정(PoC 정책 묶음) — ①② 는 사업마다 residuals 에 PRO_ id·덤프 값·PoC 값·이유로 남긴다.
     단계 도달·판정·12개월 공급·기관은 덤프 값을 쓰고(덤프 우선), 9·7 묶음은 PoC 정책 묶음으로 같은 식을 돌려 다른 사업을 residuals(use 'dump')에 남긴다.
   출력 모양(같은 입력 → 같은 바이트, 현재 시각 없음)
   - asOf, source{ dump{edition·snapshotAt·sourceCommit}, snapshots{파일 → url·fetched_at·sha256} }
   - rows[](PRO_ id 순, 451): id(PRO_) · ourId(우리 원장 사업 id — identifiers 의 HOME 식별자 → superseded_by 끝, 없으면 null) · name · region(시도 이름)
       · sgg{ id(PoC 시군구 경계 id MUN_·POL_), name, codes(행정 코드) } 또는 null(시군구 미연결) · policy{ id, status(CONFIRMED·REVIEW·RELEASED), programId, program }
       · stats(통계 포함 = 해제 아님) · p97(9·7 포트폴리오 = 9·7 확정 연결 행) · chart{ p97, all }(물량 집계 대상 chart_target — 정책 전체 범위는 해제 뺀 모든 행)
       · units{ planned(원천 사업 호수), counted(집계 호수 = 대표 행 호수(같은 블록 원천 값 보충 포함), 집계 대상 아니거나 물량 없음이면 null) }
       · reached{ BUSINESS·APPROVAL·CONSTRUCTION·COMPLETION·SUPPLY·MOVE_IN }(그 단계 또는 뒤 단계 실제 사건 최대 호수, 사업 호수로 자름 — S1 2.1 reached, 입력·추정 포함)
       · judge{ status(DELAYED 지연·WARNING 주의·NORMAL 목표 도달·UNKNOWN 판정 미확보), gap(부족 호수) }(S1 2.3 statusAt) · upcoming[[월, 호수]](기준 달부터 12개월 공급(모집·분양) 예정 증가분 — S1 2.4)
       · agency(PoC agencyName — S1 2.5) · progress{ pct, date }(공정률) · loc{ ourSgg(우리 원장 시군구 코드 — ledger-map.json bySgg 키), block(시도|지구|블록), district }
       · goal{ 단계: 기준일까지 도래한 목표 호수 }(0 인 단계 뺌 — 행 묶음의 단계 부족량 = max(0, Σgoal − Σreached), 종합상황판 병목과 같은 셈)
       · from('dump' | 'snapshot' — 행 자체가 스냅샷에서 온 것). reached·judge·upcoming·goal 은 묶음(코호트)이 있는 행만(없으면 null)
   - views.p97·views.all: rows(행 수) · chart(집계 대상 행) · counted(물량 있는 집계 행) · excluded(중복·모호 제외) · missing(물량 없음) · units(집계 호수 합)
       · regions[](시도: rows·units) · municipalities[](시군구: id·name·region·codes·rows·units — 행이 있는 곳만) · unlinked(시군구 미연결 행 수)
       · stages(PoC /map/dashboard 단계 분포 — 스냅샷) · future[](연말 누적 공급(모집·분양) 예정: 집계 행의 원천 공급 일정 중 기준 달 뒤 ~ 그해 말, 덤프)
       · reached(집계 행 단계 도달 합, 덤프) · judge(판정별 행·호수, 덤프) · upcoming(12개월 공급 예정 합·사업 수, 덤프)
   - bySgg: 시군구 경계 id → { name, region, codes, all{rows, units}, p97{rows, units} }(지도·/citizen 용)
   - residuals[]: { id, field, dump, poc, use('poc'|'dump' — 출력에 쓴 쪽), why } — 덤프 계산이 PoC 와 다른 칸 전부(덤프 뒤 변경·규칙 미이식) */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const P = require('./paths');
const HOME = require('./home-source');
const PP = require('./policy-progress');
const HV = require('./home-view');

const OUT = 'data/board/home-projects.json';
const POC_API = 'https://www.minslab.kr/poc/home/api';
const P97 = PP.POLICY_ID;
/* PoC 스냅샷: 파일 이름 → [주소(AS_OF = 기준일), 남길 부분, 행 수]. 지도 -97 은 PoC #overview 기본 인자(app.js) 그대로, 다른 하나는 정책 필터 없음('정책 전체').
   정책 응답(약 6 MB)은 사업 대조에 쓰는 portfolio_cohorts 만 남긴다(나머지 칸에 담당자 이름 든 근거 글이 섞인다) */
const POC_FILES = {
  'projects-map-dashboard.json.gz': ['map/dashboard?as_of_date=AS_OF&compact=true', (r) => r, (r) => r.items.length],
  'projects-map-dashboard-97.json.gz': [`map/dashboard?as_of_date=AS_OF&policy_id=${P97}&horizon=10&measure=SUPPLY&schedule_status=all&compact=true`, (r) => r, (r) => r.items.length],
  'projects-policy-delivery-97.json.gz': ['policy-delivery/view?as_of_date=AS_OF&group=policy&scope=policy', (r) => ({ as_of_date: r.as_of_date, portfolio_cohorts: r.portfolio_cohorts }), (r) => r.portfolio_cohorts.length],
};
const SCRUB = new Set(['actor', 'actor_basis', 'reason', 'change_reason', 'basis', 'mapping_basis', 'note']);
const scrub = (v) => (Array.isArray(v) ? v.map(scrub) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => !SCRUB.has(k)).map(([k, x]) => [k, scrub(x)])) : v);
const STAGES = ['BUSINESS', 'APPROVAL', 'CONSTRUCTION', 'COMPLETION', 'SUPPLY', 'MOVE_IN'];
const ALIASES = { lh_incheon_sale: 'lh_sale', lh_incheon_rent: 'lh_rent', lh_incheon_construction: 'lh_construction' };   // policy-progress.js 와 같은 원천 별칭
const REASON = {
  new: 'HOME 덤프 판 뒤에 생긴 사업후보 — 다음 덤프 재이관에서 들어온다(행 값은 PoC 스냅샷)',
  chart: 'HOME 2038810 supply_dashboard block_key·inventory 를 옮긴 덤프 계산(home-source.js)으로는 집계 대상인데 PoC 운영 판은 아님(또는 반대) — 2038810 원본 규칙으로도 이 행은 단독 대표라 덤프 뒤 변경 또는 미공개 서버 규칙(집계 여부는 PoC 스냅샷)',
  sggUnknown: '인천 행정구역 개편 귀속: 원장 시군구 규칙(home-source.js sggByPro — 덤프 + 법정동 표·LH 블록 시군구 매핑, PoC 운영 규칙 INCHON_DATED_ADMINISTRATIVE_NAME 대신)으로도 시군구 미정(원장 SGG_UNRESOLVED — 지구 \'인천서구\' 만으로는 개편 뒤 서해구·검단구를 가르지 못한다, PoC 규칙 표는 미공개 — 소속은 PoC 스냅샷)',
  sgg: '인천 이름 추정(policy-progress.js municipalities 의 지구·사업명 → 정책 시군구) 결과가 PoC 지도 서버의 소속과 다름 — 서버 규칙 미공개(소속은 PoC 스냅샷)',
  mapping: '덤프 뒤 HOME 정책·프로그램 매핑 변경(정책 연결·해제는 PoC 스냅샷)',
  input: '덤프 뒤 HOME 담당자 입력·근거 변경(PoC 사건·일정의 changed_at 이 덤프 시각 뒤) — 다음 덤프 재이관에서 같아진다(값은 덤프)',
  cohort: '같은 사업의 PoC 정책 묶음(portfolio_cohorts)과 덤프 묶음의 사건·일정이 다름 — 원인 미확인(값은 덤프)',
  sibling: '같은 블록의 다른 원천 행(복수 현장 계약 등)에 붙은 담당자 측정값이 덤프 묶음에는 있고 PoC 정책 묶음에는 없음 — HOME 2038810 공개 코드(policy_delivery build_delivery 의 overrides)는 묶음 행 전체의 측정값을 쓰므로 덤프 뒤 담당자 입력 변경 또는 미커밋 서버 규칙(값은 덤프)',
  units: '덤프 뒤 HOME 계획 물량 변경 또는 대표 행 호수 보충 규칙 차이(물량은 PoC 스냅샷)',
};

const byStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sum = (xs, f) => xs.reduce((s, x) => s + (f(x) ?? 0), 0);
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/* manifest.json 은 같은 폴더를 쓰는 다른 도구와 나눠 쓴다 — 읽어서 files 에 내 항목만 더하거나 바꾼다 */
function writeManifest(dir, entries) {
  const f = path.join(dir, 'manifest.json');
  const m = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
  m.files = Object.fromEntries(Object.entries({ ...(m.files ?? {}), ...entries }).sort(([a], [b]) => byStr(a, b)));
  fs.writeFileSync(f, JSON.stringify(Object.fromEntries(Object.entries(m).sort(([a], [b]) => byStr(a, b))), null, 2) + '\n');
}

/* PoC 공개 API 에서 POC_FILES 를 받아 압축 JSON 으로 둔다. 503(잠시 연결 불가)이면 몇 초 뒤 다시, 호출 사이 1.5초 */
async function fetchPoc(dir, asOf) {
  fs.mkdirSync(dir, { recursive: true });
  const entries = {};
  for (const [name, [rel, keep, rows]] of Object.entries(POC_FILES)) {
    const url = `${POC_API}/${rel.replace('AS_OF', asOf)}`;
    let res = null;
    for (let i = 0; i < 6 && !(res && res.ok); i++) { if (i) await new Promise((r) => setTimeout(r, 4000)); res = await fetch(url, { signal: AbortSignal.timeout(180000) }).catch(() => null); }
    if (!res || !res.ok) throw new Error(`PoC 응답 실패: ${rel}`);
    const body = scrub(keep(await res.json()));
    const text = JSON.stringify(body);
    if (text.includes('사용자 입력 ·')) throw new Error(`${name}: 담당자 입력 글이 남았다 — SCRUB 칸을 늘린다`);
    const buf = zlib.gzipSync(text, { level: 9 });
    fs.writeFileSync(path.join(dir, name), buf);
    entries[name] = { url, fetched_at: new Date().toISOString(), sha256: sha(buf), rows: rows(body), bytes: buf.length };
    await new Promise((r) => setTimeout(r, 1500));
  }
  writeManifest(dir, entries);
}

function readPoc(dir) {
  const f = path.join(dir, 'manifest.json');
  const m = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { files: {} };
  const out = { meta: {} };
  for (const name of Object.keys(POC_FILES)) {
    const e = m.files?.[name], file = path.join(dir, name);
    if (!e || !fs.existsSync(file)) throw new Error(`PoC 스냅샷이 없다: ${path.relative(P.ROOT, file)} — --fetch-poc 로 받는다`);
    const buf = fs.readFileSync(file);
    if (sha(buf) !== e.sha256) throw new Error(`${name} 의 sha256 이 manifest 와 다르다`);
    out[name] = JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
    out.meta[name] = { url: e.url, fetched_at: e.fetched_at, sha256: e.sha256 };
  }
  return out;
}

/* 우리 원장: HOME 식별자(PRO_) → 사업 id(superseded_by 끝까지), 사업 id → 시군구 코드 */
function ledgerIds(monthDir) {
  const table = (n) => JSON.parse(fs.readFileSync(path.join(monthDir, 'tables', `${n}.json`), 'utf8')).rows;
  const projects = new Map(table('projects').map((p) => [p.local_project_id, p]));
  const finalOf = (id) => { let p = projects.get(id); for (let i = 0; p?.superseded_by && i < 20; i++) p = projects.get(p.superseded_by); return p ?? null; };
  const ids = new Map();
  for (const r of table('identifiers')) if (r.id_type === 'HOME' && /^PRO_/.test(r.id_value)) { const p = finalOf(r.local_project_id); ids.set(r.id_value, p ? { id: p.local_project_id, sgg: p.sgg_code ?? null } : null); }
  return ids;
}

/* 묶음(코호트) 하나의 S1 값: 단계 도달·판정·12개월 공급 증가분 · 단계 목표·측정(goal — 종합상황판 병목과 같은 셈, home-board.js stageShort) */
function cohortValues(c, asOf) {
  const data = { as_of_date: asOf };
  const reached = Object.fromEntries(STAGES.map((k) => [k, HV.reached(data, [c], k, asOf)]));
  const j = HV.statusAt(c, asOf);
  const st = HV.statistics([c], asOf, +asOf.slice(0, 4));
  return { reached, judge: { status: j.status, gap: j.units }, upcoming: st.upcoming.filter((r) => r.units > 0).map((r) => [r.month, r.units]), goal: goalOf(c, asOf) };
}
/* 단계마다 기준일까지 도래한 목표(사업 일정 최대, 사업 호수로 자름) — 0 인 단계는 뺀다.
   행 묶음의 단계 부족량 = max(0, Σ목표 − Σ누적 도달 reached)(포트폴리오 전체면 home-board.json home.stageChecks 의 due·actual·gap 과 같다) */
function goalOf(c, asOf) {
  const out = {};
  for (const k of STAGES) {
    const goals = (c.schedules || []).filter((s) => s.stage === k && s.units != null && s.due_date && s.due_date <= asOf);
    const due = goals.length ? Math.min(HV.capacity(c), Math.max(...goals.map((s) => s.units))) : 0;
    if (due) out[k] = due;
  }
  return out;
}

/* 덤프 뒤 생긴 9·7 집계 행(덤프에 없고 PoC 9·7 지도 집계 대상·9·7 확정 연결)의 PoC 정책 묶음 — build 가 그 행에 쓰는 것과 같은 스냅샷 근거.
   종합상황판(home-board.js)이 이것을 덤프 포트폴리오에 더해 views.p97 과 같은 원천 행 집합을 쓴다 */
function lateCohorts(home, poc) {
  const dump = new Set(PP.homeService(home, PP.asOfOf(home.snapshotAt)).allProjects().map((p) => p.id));
  const dash97 = poc['projects-map-dashboard-97.json.gz'], chart = new Set(dash97.summary.chart_target_ids);
  const item = new Map(poc['projects-map-dashboard.json.gz'].items.map((r) => [r.id, r]));
  const p97 = (id) => item.get(id)?.mapping?.policy_id === P97 && item.get(id)?.mapping?.status === 'CONFIRMED';
  return poc['projects-policy-delivery-97.json.gz'].portfolio_cohorts.filter((c) => !dump.has(c.id) && chart.has(c.id) && p97(c.id)).sort((a, b) => byStr(a.id, b.id));
}

/* 판 + 스냅샷 → 문서 */
function build(home, poc, ledger) {
  const asOf = PP.asOfOf(home.snapshotAt);
  const svc = PP.homeService(home, asOf);
  const all = svc.allProjects();
  const dumpById = new Map(all.map((p) => [p.id, p]));
  const live = all.filter((p) => p.mapping.status !== 'RELEASED');
  const plan = svc.rows('policy_delivery_plan').find((r) => r.policy_id === P97);
  /* 정책 전체 범위의 묶음: buildCohorts 에 해제 뺀 모든 사업을 넘긴다(정책 목표 검사는 범위 밖이라 목표를 비운다) */
  const scoped = (rows) => ({ ...svc, projects: () => rows, rows: (k) => (k === 'policy_delivery_plan' ? [{ ...plan, policy_id: 'ALL', target_units: Infinity }] : svc.rows(k)) });
  const b = PP.buildCohorts(scoped(live), asOf, 'ALL');
  const cohorts = new Map(b.portfolio.map((c) => [c.id, c]));
  const chosen = new Map(b.chosen.map((r) => [r.id, r]));

  const dash = poc['projects-map-dashboard.json.gz'], dash97 = poc['projects-map-dashboard-97.json.gz'];
  const pocItem = new Map(dash.items.map((r) => [r.id, r]));
  const pocChart = { all: new Set(dash.summary.chart_target_ids), p97: new Set(dash97.summary.chart_target_ids) };
  const pocCohorts = new Map(poc['projects-policy-delivery-97.json.gz'].portfolio_cohorts.map((c) => [c.id, c]));
  const dumpAt = Date.parse(home.snapshotAt);
  const lateInput = (c) => [...c.events, ...c.schedules].some((e) => e.changed_at && Date.parse(e.changed_at) > dumpAt);
  const pocSgg = new Map();
  for (const m of dash.municipalities) for (const id of m.project_ids) pocSgg.set(id, m.id);

  /* 시군구 경계(덤프): id → 이름·시도·행정 코드 */
  const SIDO = { 11: '서울특별시', 28: '인천광역시', 41: '경기도' };   // 인천 정책 시군구 경계(policy_municipality)는 시도 칸이 없어 행정 코드 앞 두 자리로
  const bounds = new Map([...svc.rows('municipality'), ...svc.rows('policy_municipality')].map((a) => [a.id, { id: a.id, name: a.name, region: a.region ?? SIDO[String(a.admin_codes?.[0]).slice(0, 2)] ?? null, codes: [...(a.admin_codes ?? [])].sort(byStr) }]));
  for (const m of dash.municipalities) if (!bounds.has(m.id)) bounds.set(m.id, { id: m.id, name: m.name, region: m.region, codes: [...(m.admin_codes ?? [])].sort(byStr) });
  /* 덤프 시군구 소속: 묶음(대표 행)은 buildCohorts 의 시군구, 대표가 아닌 행은 같은 블록 대표의 시군구, 그래도 없으면 원천 시군구 이름이 경계 이름과 같을 때(경기는 '시' 뗀 이름도) */
  const blockText = (r) => { const k = HOME.blockKey({ ...r, source_id: ALIASES[r.source_id] ?? r.source_id }); return k ? `${k.region}|${k.term}|${k.block}` : null; };
  const repByBlock = new Map();
  for (const c of b.portfolio) { const k = blockText(dumpById.get(c.id)); if (k && c.municipality_id) repByBlock.set(k, repByBlock.has(k) && repByBlock.get(k) !== c.municipality_id ? null : c.municipality_id); }
  const byName = (r) => { const hits = [...bounds.values()].filter((a) => a.region === r.region && r.municipality && (a.name === r.municipality || (a.region === '경기도' && a.name.slice(0, -1) === r.municipality))); return hits.length === 1 ? hits[0].id : null; };
  const dumpSgg = (r) => (cohorts.has(r.id) ? cohorts.get(r.id).municipality_id ?? null : repByBlock.get(blockText(r)) ?? byName(r));

  /* PoC 가 따로 남기는 같은 블록 행(덤프 inventory 가 뺀 행) — 자기 행만으로 묶음을 만든다(build_delivery '대표가 둘 이상이면 자기 행만') */
  for (const id of pocChart.all) {
    if (cohorts.has(id) || !dumpById.has(id)) continue;
    const one = PP.buildCohorts(scoped([dumpById.get(id)]), asOf, 'ALL').portfolio[0];
    if (one) cohorts.set(id, one);
  }

  const residuals = [];
  const ids = [...new Set([...all.map((p) => p.id), ...dash.items.map((r) => r.id)])].sort(byStr);
  const rows = ids.map((id) => {
    const d = dumpById.get(id), q = pocItem.get(id);
    const diff = (field, dump, poc, reason, use = 'poc') => { if (JSON.stringify(dump) !== JSON.stringify(poc)) { residuals.push({ id, field, dump, poc, use, why: reason }); return use === 'poc' ? poc : dump; } return dump; };
    if (!d) residuals.push({ id, field: 'row', dump: null, poc: 'present', use: 'poc', why: REASON.new });
    const src = d ?? q, dm = d?.mapping;
    /* 정책 연결·통계 포함: PoC 지도 응답에 있으면 해제가 아니다(해제 행은 응답에 없다) */
    const mapping = (m) => ({ id: m.policy_id ?? null, status: m.status, programId: m.program_id ?? null, program: m.program_name ?? null });
    const stats = d ? diff('stats', dm.status !== 'RELEASED', !!q, REASON.mapping) : true;
    const policy = d && stats && q ? diff('policy', mapping(dm), mapping(q.mapping), REASON.mapping) : mapping(dm ?? q.mapping);
    if (!stats) policy.status = 'RELEASED';
    const p97 = policy.id === P97 && policy.status === 'CONFIRMED';
    /* 집계 대상 */
    const chart = {};
    for (const scope of ['all', 'p97']) {
      const inScope = stats && (scope === 'all' || p97), pocVal = pocChart[scope].has(id);
      chart[scope] = (d ? diff(`chart.${scope}`, inScope && chosen.has(id), pocVal, REASON.chart) : pocVal) && inScope;
    }
    /* 물량: 사업 호수 = 원천 행, 집계 호수 = 대표 행(같은 블록 원천 값 보충 포함) */
    const rep = chosen.get(id) ?? cohorts.get(id);
    const planned = d && q ? diff('units.planned', d.planned_units ?? null, q.planned_units ?? null, REASON.units) : src.planned_units ?? null;
    const pocCounted = q && chart.all ? q.map_quantities?.target_units ?? null : null;
    const counted = chart.all ? (d ? diff('units.counted', (rep ? rep.planned_units : planned) ?? null, pocCounted, REASON.units) : pocCounted) : null;
    /* 시군구 */
    let sggId;
    if (stats) {
      const dumpVal = d ? dumpSgg(d) : null, pocVal = pocSgg.get(id) ?? null;
      sggId = d ? diff('sgg', dumpVal, pocVal, dumpVal == null ? REASON.sggUnknown : REASON.sgg) : pocVal;
    } else sggId = dumpSgg(d);
    const s = sggId ? bounds.get(sggId) : null;
    /* 단계 도달·판정·12개월 공급·기관: 덤프 묶음(덤프 뒤 생긴 행은 PoC 정책 묶음). 9·7 묶음은 PoC 정책 응답과 견줘 다른 칸을 남긴다 */
    const pc = pocCohorts.get(id);
    const c = d ? cohorts.get(id) : pc ?? null;
    const v = c ? cohortValues(c, asOf) : { reached: null, judge: null, upcoming: null, goal: null };
    const agency = c || d ? HV.agencyName(c?.developer ?? d?.developer) : null;
    if (d && pc) {
      /* 덤프 묶음에만 있는 담당자 측정값이 이 행이 아닌 같은 블록 원천 행의 것인지(2026-10-21 새 덤프: 부천대장 A5·A6 의 A-5·A-6 묶음 계약 행 공급 추정) */
      const inPoc = new Set(pc.events.map((e) => `${e.stage}|${e.event_date}|${e.units}`));
      const sibling = c.events.some((e) => e.origin === 'MANUAL' && e.project_id && e.project_id !== id && !inPoc.has(`${e.stage}|${e.event_date}|${e.units}`));
      const pv = cohortValues(pc, asOf), why = lateInput(pc) ? REASON.input : sibling ? REASON.sibling : REASON.cohort;
      for (const k of ['reached', 'judge', 'upcoming']) diff(k, v[k], pv[k], why, 'dump');
      diff('agency', agency, HV.agencyName(pc.developer), why, 'dump');
    }
    const ours = ledger.get(id) ?? null;
    const progressPct = src.progress_pct ?? null;
    return {
      id, ourId: ours?.id ?? null, name: src.name, region: src.region,
      sgg: s ? { id: s.id, name: s.name, codes: s.codes } : null,
      policy, stats, p97, chart, units: { planned, counted },
      ...v,
      agency,
      progress: progressPct == null ? null : { pct: progressPct, date: d ? d.progress_date ?? d.base_date ?? null : q.construction_progress?.as_of_date ?? null },
      loc: { ourSgg: ours?.sgg ?? null, block: d ? blockText(d) : null, district: src.district ?? null },
      from: d ? 'dump' : 'snapshot',
    };
  });

  const view = (scope, stages) => {
    const rs = rows.filter((r) => r.stats && (scope === 'all' || r.p97)), ch = rs.filter((r) => r.chart[scope]);
    const counted = ch.filter((r) => r.units.counted != null && r.units.counted > 0), isCounted = new Set(counted);
    const regions = ['서울특별시', '인천광역시', '경기도'].map((name) => ({ name, rows: rs.filter((r) => r.region === name).length, units: sum(counted.filter((r) => r.region === name), (r) => r.units.counted) }));
    const mun = new Map();
    for (const r of rs) if (r.sgg) { const m = mun.get(r.sgg.id) ?? { ...bounds.get(r.sgg.id), rows: 0, units: null }; m.rows++; if (isCounted.has(r)) m.units = (m.units ?? 0) + r.units.counted; mun.set(r.sgg.id, m); }
    const year = +asOf.slice(0, 4), month = asOf.slice(0, 7);
    const futureRows = ch.filter((r) => dumpById.has(r.id)).flatMap((r) => PP.sourceEvents(dumpById.get(r.id)).filter((e) => e.stage === 'SUPPLY' && (e.month ?? e.due_date?.slice(0, 7)) > month));
    const future = Array.from({ length: 10 }, (_, i) => { const end = year + 1 + i, es = futureRows.filter((e) => +String(e.month ?? e.due_date).slice(0, 4) <= end); return { endYear: end, units: sum(es, (e) => e.units), events: es.length }; });
    const withC = counted.filter((r) => r.reached);
    const judge = {};
    for (const r of withC) { const j = (judge[r.judge.status] ??= { rows: 0, units: 0 }); j.rows++; j.units += r.units.counted; }
    const upcoming = withC.map((r) => sum(r.upcoming, (x) => x[1]));
    return {
      rows: rs.length, chart: ch.length, counted: counted.length, excluded: rs.length - ch.length, missing: ch.length - counted.length, units: sum(counted, (r) => r.units.counted),
      regions, municipalities: [...mun.values()].sort((a, b) => (b.units ?? -1) - (a.units ?? -1) || byStr(a.id, b.id)), unlinked: rs.filter((r) => !r.sgg).length,
      stages: { parts: stages.parts, cumulative: stages.cumulative, advanced: stages.advanced_units, total: stages.total_units },
      future, reached: Object.fromEntries(STAGES.map((k) => [k, sum(withC, (r) => r.reached[k])])), judge: Object.fromEntries(Object.entries(judge).sort(([a], [b]) => byStr(a, b))),
      upcoming: { units: sum(upcoming, (x) => x), projects: upcoming.filter((x) => x > 0).length },
    };
  };
  const views = { p97: view('p97', dash97.summary.stage_distribution), all: view('all', dash.summary.stage_distribution) };
  const bySgg = {};
  for (const [k, sc] of [['all', views.all], ['p97', views.p97]]) for (const m of sc.municipalities) {
    bySgg[m.id] ??= { name: m.name, region: m.region, codes: m.codes, all: { rows: 0, units: null }, p97: { rows: 0, units: null } };
    bySgg[m.id][k] = { rows: m.rows, units: m.units };
  }
  residuals.sort((a, b) => byStr(a.id, b.id) || byStr(a.field, b.field));
  return {
    schema: 'home-projects/1', asOf,
    source: { dump: { edition: home.edition, snapshotAt: home.snapshotAt, sourceCommit: home.manifest?.source_commit ?? null }, snapshots: poc.meta },
    rows, views, bySgg: Object.fromEntries(Object.entries(bySgg).sort(([a], [b]) => byStr(a, b))), residuals,
  };
}

/* 사업 행·잔차는 한 줄에 하나(diff 보기 쉽게), 나머지는 키마다 한 줄 */
function render(doc) {
  const lines = Object.entries(doc).map(([k, v]) => (Array.isArray(v) && ['rows', 'residuals'].includes(k) ? `${JSON.stringify(k)}:[\n${v.map((x) => JSON.stringify(x)).join(',\n')}\n]` : `${JSON.stringify(k)}:${JSON.stringify(v)}`));
  return `{\n${lines.join(',\n')}\n}\n`;
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (['--month', '--home', '--out'].includes(a)) o[a.slice(2)] = argv[++i];
    else if (a === '--fetch-poc') o.fetch = true;
    else throw new Error(`모르는 인자 ${a}`);
  }
  return o;
}

module.exports = { build, render, readPoc, fetchPoc, ledgerIds, lateCohorts, scrub, POC_FILES, REASON };

if (require.main === module) {
  (async () => {
    const o = parseArgs(process.argv.slice(2));
    const monthDir = P.ledgerDir(o.month ?? P.latestMonth());
    const dir = o.home ? path.resolve(o.home) : HOME.latestHomeDir(monthDir);
    if (!dir || !HOME.homeAvailable(dir)) throw new Error('HOME 판(raw/home/<덤프시각>)의 원본(jsonl.gz)이 없다 — raw-store.js pull 또는 home-dump.py');
    const home = HOME.readHome(dir), asOf = PP.asOfOf(home.snapshotAt);
    const pocDir = path.join(monthDir, 'raw', 'home-api', asOf);
    if (o.fetch) await fetchPoc(pocDir, asOf);
    const doc = build(home, readPoc(pocDir), ledgerIds(monthDir));
    const out = o.out ? path.resolve(o.out) : path.join(P.ROOT, OUT);
    fs.writeFileSync(out, render(doc));
    const v = doc.views;
    console.log(`${path.relative(P.ROOT, out)}: 기준일 ${asOf} · 행 ${doc.rows.length} · 9·7 ${v.p97.rows}행 집계 ${v.p97.counted} ${v.p97.units}호 · 정책 전체 ${v.all.rows}행 집계 ${v.all.counted} ${v.all.units}호 · 잔차 ${doc.residuals.length}`);
  })().catch((e) => { console.error(`오류: ${e.message}`); process.exit(1); });
}
