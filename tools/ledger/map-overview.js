'use strict';
/* 지도 수도권 개요(/map)의 시군구·시도 값 — HOME PoC #overview 와 같은 규칙(2026-10-21 사용자 결정). data/board/map-overview.json 을 만든다.
   셈 단위·범위·값은 공통 사업 자료 data/board/home-projects.json(tools/ledger/home-projects.js, 읽기만)을 그대로 쓴다:
   - 범위 p97 = 9·7 포트폴리오(9·7 확정 연결 원천 행 230 — PoC #overview 기본), all = 정책 전체(해제 뺀 원천 행 443 — PoC 정책 필터 없음)
   - 값 한 묶음(V): n 원천 행 · c 물량 집계 대상 행 · x 집계 제외(같은 블록 중복·모호) · q 집계 대상이지만 물량 없음 · u 집계 호수 합
       · d 지연 사업(판정 DELAYED — 도래 목표 대비 측정 부족률 2% 이상) · w 주의(WARNING) · a 향후 12개월 공급(모집·분양) 예정 호수 · an 그 사업 수
       · st 단계 물량[정책·사업화·인허가·건설(준공 포함)·공급·입주·미확인] = PoC 지도 서버 단계 분포(/map/dashboard stage_distribution — 2026-10-21 W4 결정 ④ 'PoC(HOME) 단계 기준',
         덤프로 재현할 수 없는 서버 계산이라 스냅샷 raw/home-api/<기준일>/projects-map-dashboard{-97,}.json.gz — home-projects.js 가 받아 둔 것, 읽기만).
         분포는 블록·시군구·시도·합계 묶음 값만 오고 행마다 값이 없어 pocStages 가 원천 행에 나눠 담는다: 블록 값은 그 블록 집계 행에, 시군구 값에서 블록 합을 뺀 나머지는
         블록 없는 집계 행에, 시도 값에서 시군구 합을 뺀 나머지는 시군구 미연결 행에(한 묶음 안 여러 행은 집계 호수 큰 순 → id 순으로 뒤 단계부터 채운다 —
         /citizen tools/design/public-mock/build_data.py 와 같은 규칙). 그래서 합계·시도·PoC 시군구 값은 스냅샷과 정확히 같고, 구가 있는 경기 시의 구별 값과 행 하나의 나눔은 근사다.
         판정·12개월·단계는 home-projects views 와 같이 물량 있는 집계 행만 센다
   - 행의 PoC 단계(상세 지도 6단계 칩·점 색 — home-map.js): 나눈 몫이 가장 큰 단계(같으면 뒤 단계, 미확인은 다른 단계 몫보다 클 때만).
     물량을 나누지 않은 행(집계 제외·물량 없음)은 그 행이 든 PoC 블록 분포에서 같은 규칙, 블록도 없으면 미확인(6)
   - 시군구: 행의 PoC 시군구(sgg.codes)를 지도 면 코드로(경기는 시 단위). 구가 있는 경기 시는 우리 원장 시군구(loc.ourSgg)가 그 시의 구이면 그 구, 아니면 시 코드('구 미정').
     PoC 시군구 미연결 행(unlinked)은 PoC 처럼 시군구 값에는 없고 시도·수도권 합계에만 든다
   - '!' 지연 표시(9·7 만): PoC 정책 지도와 같은 식 — 시군구·시도 묶음의 단계별 도래 목표 대비 누적 측정 부족률 2% 이상 단계가 있으면(home-view.js mapDelay).
     묶음 지표는 HOME 덤프로 만든 /policy-delivery/view(policy-progress.js homeView, 읽기만)의 portfolio_comparisons('city:<시군구 id>'·'region:<시도>')
   출력: { schema, asOf, source, scopes: { p97|all: { total: V, sido: { 11|28|41: V }, bySgg: { 코드: V }, unlinked, municipalities, flags: { sido: { 코드: 글 }, sgg: { 면 코드: 글 } } } } }
   같은 입력 → 같은 바이트. 실행: node tools/ledger/map-overview.js [--out <파일>]. 시험: tests/js/map-golden.test.cjs */
const fs = require('node:fs');
const path = require('node:path');
const P = require('./paths');
const HV = require('./home-view');

const OUT = 'data/board/map-overview.json';
const HP = 'data/board/home-projects.json';
const SIDO_OF = { 서울특별시: '11', 인천광역시: '28', 경기도: '41' };
const PARTS = ['POLICY', 'BUSINESS', 'APPROVAL', 'CONSTRUCTION', 'SUPPLY', 'MOVE_IN', 'UNKNOWN'];
/* 구가 있는 경기 시(lib/board/metro-overview.ts guOf 와 같은 시 — 시험으로 확인) */
const GU_CITY = ['41110', '41130', '41170', '41190', '41270', '41280', '41460', '41590'];
const byStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const DASH = { p97: 'projects-map-dashboard-97.json.gz', all: 'projects-map-dashboard.json.gz' };   // 범위 → PoC 지도 스냅샷(home-projects.js POC_FILES)
const FILL = [5, 4, 3, 2, 1, 0, 6];   // 나눠 채우는 순서(PARTS 자리 — 뒤 단계부터, 미확인 끝)

/* 행정 코드 → 지도 면 코드(경기는 시 단위로 접는다 — metro-overview.ts unitOf 와 같다) */
const unitOf = (code) => (/^(11|28|41)\d{3}$/.test(code || '') ? (code.startsWith('41') ? `${code.slice(0, 4)}0` : code) : null);
const inScope = (r, scope) => r.stats && (scope === 'all' || r.p97);
/* 행 → 값 묶음 키(면 코드 또는 구가 있는 시의 구 코드). PoC 시군구 미연결이면 null */
function keyOf(r) {
  const face = r.sgg ? unitOf(r.sgg.codes[0]) : null;
  if (!face) return null;
  const our = r.loc && r.loc.ourSgg;
  return GU_CITY.includes(face) && our && our !== face && unitOf(our) === face ? our : face;
}

const capOf = (r, scope) => (r.chart[scope] && r.units.counted > 0 ? r.units.counted : 0);
const partsOf = (o) => PARTS.map((k) => (o && o[k]) || 0);
/* 단계 몫 7칸 → 단계 하나(가장 큰 몫, 같으면 뒤 단계, 미확인은 다른 단계 몫보다 클 때만) */
function topOf(st) {
  let best = -1;
  for (let i = 0; i < 6; i++) if (st[i] > 0 && (best < 0 || st[i] >= st[best])) best = i;
  return best < 0 || st[6] > st[best] ? 6 : best;
}

/* PoC 지도 단계 분포를 범위 안 원천 행에 나눠 담는다(머리 주석). dash = 그 범위의 /map/dashboard 스냅샷.
   돌려주는 것: Map(PRO_ id → { st: 7칸 몫(물량 있는 집계 행만), s: 행 단계 0~6 }). 묶음 합이 집계 호수와 맞지 않으면 멈춘다 */
function pocStages(hp, dash, scope) {
  const rows = hp.rows.filter((r) => inScope(r, scope)), byId = new Map(rows.map((r) => [r.id, r]));
  const out = new Map(rows.map((r) => [r.id, { st: PARTS.map(() => 0), s: 6 }]));
  const cap = (id) => (byId.has(id) ? capOf(byId.get(id), scope) : 0);
  const fill = (parts, ids, where) => {
    const left = parts.slice(), need = ids.reduce((s, id) => s + cap(id), 0);
    if (left.some((x) => x < 0) || left.reduce((a, b) => a + b, 0) !== need) throw new Error(`PoC 단계 분포(${where})와 집계 호수 ${need} 가 다르다 — 스냅샷과 home-projects.json 의 판이 같은지 본다`);
    for (const id of [...ids].sort((a, b) => cap(b) - cap(a) || byStr(a, b))) {
      let c = cap(id);
      for (const i of FILL) { const t = Math.min(c, left[i]); out.get(id).st[i] += t; left[i] -= t; c -= t; }
    }
  };
  const add = (a, b) => a.map((x, i) => x + b[i]), sub = (a, b) => a.map((x, i) => x - b[i]);
  const inBlock = new Set(), blockOf = new Map(), byMun = new Map(), byRegion = new Map();
  for (const b of dash.blocks || []) {
    const parts = partsOf(b.stage_distribution && b.stage_distribution.parts);
    for (const id of b.project_ids || []) if (byId.has(id) && !blockOf.has(id)) blockOf.set(id, parts);
    const ids = (b.chart_target_ids || []).filter((id) => cap(id));
    if (!ids.length) continue;
    fill(parts, ids, `블록 ${b.id}`);
    ids.forEach((id) => inBlock.add(id));
    const mun = new Set(ids.map((id) => (byId.get(id).sgg || {}).id || null));
    if (mun.size !== 1) throw new Error(`PoC 블록 ${b.id} 의 행이 시군구 여럿에 걸친다`);
    const m = [...mun][0];
    byMun.set(m, add(byMun.get(m) || PARTS.map(() => 0), parts));
  }
  for (const mu of dash.municipalities || []) {
    const parts = partsOf(mu.stage_distribution && mu.stage_distribution.parts);
    fill(sub(parts, byMun.get(mu.id) || PARTS.map(() => 0)), rows.filter((r) => r.sgg && r.sgg.id === mu.id && cap(r.id) && !inBlock.has(r.id)).map((r) => r.id), `시군구 ${mu.name}`);
    byRegion.set(mu.region, add(byRegion.get(mu.region) || PARTS.map(() => 0), parts));
  }
  for (const g of (dash.groups && dash.groups.region) || []) {
    fill(sub(partsOf(g.stage_distribution && g.stage_distribution.parts), byRegion.get(g.name) || PARTS.map(() => 0)), rows.filter((r) => !r.sgg && r.region === g.name && cap(r.id)).map((r) => r.id), `시도 ${g.name}`);
  }
  const total = rows.reduce((t, r) => add(t, out.get(r.id).st), PARTS.map(() => 0));
  if (total.join() !== partsOf(dash.summary.stage_distribution.parts).join()) throw new Error(`PoC 단계 분포 합계(${scope})를 다 나누지 못했다`);
  for (const r of rows) { const x = out.get(r.id); x.s = cap(r.id) ? topOf(x.st) : blockOf.has(r.id) ? topOf(blockOf.get(r.id)) : 6; }
  return out;
}

/* 값 한 묶음(rows 는 이미 범위 안, stages = pocStages(그 범위)) */
function valsOf(rows, scope, stages) {
  const v = { n: rows.length, c: 0, x: 0, q: 0, u: 0, d: 0, w: 0, a: 0, an: 0, st: PARTS.map(() => 0) };
  for (const r of rows) {
    if (!r.chart[scope]) { v.x++; continue; }
    v.c++;
    const cap = r.units.counted;
    if (!(cap > 0)) { v.q++; continue; }
    v.u += cap;
    stages.get(r.id).st.forEach((x, i) => { v.st[i] += x; });
    if (!r.reached) continue;
    if (r.judge.status === 'DELAYED') v.d++;
    if (r.judge.status === 'WARNING') v.w++;
    const up = (r.upcoming || []).reduce((s, x) => s + x[1], 0);
    if (up > 0) { v.a += up; v.an++; }
  }
  return v;
}

/* PoC 묶음 지표의 '!' 지연 표시: { sido: { 시도 코드: 글 }, sgg: { 면 코드: 글 } } */
function flagsOf(view, bySgg) {
  const out = { sido: {}, sgg: {} }, pc = view.portfolio_comparisons || {};
  for (const [k, c] of Object.entries(pc).sort(([a], [b]) => byStr(a, b))) {
    const m = /^(region|city):(.+)$/.exec(k);
    if (!m) continue;
    const d = HV.mapDelay(c.metrics, view.as_of_date);
    if (!d.delayed) continue;
    if (m[1] === 'region' && SIDO_OF[m[2]]) out.sido[SIDO_OF[m[2]]] = d.delayNote;
    const face = m[1] === 'city' && bySgg[m[2]] ? unitOf(bySgg[m[2]].codes[0]) : null;
    if (face) out.sgg[face] = d.delayNote;
  }
  return out;
}

/* hp = home-projects.json, view = 덤프로 만든 /policy-delivery/view(9·7), dash = { p97, all } PoC 지도 스냅샷(readDash) */
function mapOverview(hp, view, dash) {
  const scopes = {};
  for (const scope of ['p97', 'all']) {
    const rows = hp.rows.filter((r) => inScope(r, scope)), st = pocStages(hp, dash[scope], scope), vals = (rs) => valsOf(rs, scope, st);
    const groups = new Map();
    for (const r of rows) { const k = keyOf(r); if (k) (groups.get(k) || groups.set(k, []).get(k)).push(r); }
    scopes[scope] = {
      total: vals(rows),
      sido: Object.fromEntries(Object.entries(SIDO_OF).map(([name, code]) => [code, vals(rows.filter((r) => r.region === name))]).sort(([a], [b]) => byStr(a, b))),
      bySgg: Object.fromEntries([...groups].sort(([a], [b]) => byStr(a, b)).map(([k, rs]) => [k, vals(rs)])),
      unlinked: rows.filter((r) => !r.sgg).length,
      municipalities: new Set(rows.filter((r) => r.sgg).map((r) => r.sgg.id)).size,
      flags: scope === 'p97' ? flagsOf(view, hp.bySgg) : { sido: {}, sgg: {} },
    };
  }
  return { schema: 'map-overview/1', asOf: hp.asOf, source: { homeProjects: HP, policyView: { asOf: view.as_of_date, policyId: view.policy_id }, stages: Object.fromEntries(Object.entries(DASH).map(([k, f]) => [k, (hp.source.snapshots || {})[f] || f])) }, scopes };
}

/* PoC 지도 스냅샷 두 벌(sha256 은 home-projects.js readPoc 이 manifest 와 맞춰 본다) */
function readDash(hp) {
  const poc = require('./home-projects').readPoc(path.join(P.ledgerDir(hp.asOf.slice(0, 7)), 'raw/home-api', hp.asOf));
  return { p97: poc[DASH.p97], all: poc[DASH.all] };
}

const render = (doc) => `${JSON.stringify(doc, null, 1)}\n`;

module.exports = { mapOverview, valsOf, pocStages, topOf, readDash, keyOf, unitOf, inScope, flagsOf, PARTS, GU_CITY, DASH, render };

if (require.main === module) {
  try {
    const args = process.argv.slice(2), i = args.indexOf('--out');
    const out = path.resolve(i >= 0 ? args[i + 1] : path.join(P.ROOT, OUT));
    const hp = JSON.parse(fs.readFileSync(path.join(P.ROOT, HP), 'utf8'));
    const doc = mapOverview(hp, require('./policy-progress').homeView(), readDash(hp));
    fs.writeFileSync(out, render(doc));
    const s = (k) => { const x = doc.scopes[k]; return `${x.total.n}행 · 집계 ${x.total.c - x.total.q} · ${x.total.u.toLocaleString('en-US')}호 · 시군구 ${x.municipalities}곳 · 지연 ${x.total.d}`; };
    console.log(`${path.relative(P.ROOT, out)}: 기준일 ${doc.asOf} · 9·7 ${s('p97')} · '!' 시군구 ${Object.keys(doc.scopes.p97.flags.sgg).length}곳 · 정책 전체 ${s('all')}`);
  } catch (e) { console.error(`오류: ${e.message}`); process.exit(1); }
}
