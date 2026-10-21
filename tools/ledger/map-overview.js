'use strict';
/* 지도 수도권 개요(/map)의 시군구·시도 값 — HOME PoC #overview 와 같은 규칙(2026-10-21 사용자 결정). data/board/map-overview.json 을 만든다.
   셈 단위·범위·값은 공통 사업 자료 data/board/home-projects.json(tools/ledger/home-projects.js, 읽기만)을 그대로 쓴다:
   - 범위 p97 = 9·7 포트폴리오(9·7 확정 연결 원천 행 230 — PoC #overview 기본), all = 정책 전체(해제 뺀 원천 행 443 — PoC 정책 필터 없음)
   - 값 한 묶음(V): n 원천 행 · c 물량 집계 대상 행 · x 집계 제외(같은 블록 중복·모호) · q 집계 대상이지만 물량 없음 · u 집계 호수 합
       · d 지연 사업(판정 DELAYED — 도래 목표 대비 측정 부족률 2% 이상) · w 주의(WARNING) · a 향후 12개월 공급(모집·분양) 예정 호수 · an 그 사업 수
       · st 단계 물량[정책·사업화·인허가·건설(준공 포함)·공급·입주·미확인] — 집계 행마다 단계 도달(reached, 입력·추정 포함)을 뒤 단계부터 배정(PoC stageDistribution 과 같은 방식),
         단계 도달이 없는 집계 행은 미확인. 판정·12개월·단계는 home-projects views 와 같이 물량 있는 집계 행만 센다
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

/* 집계 행 하나의 단계 물량(cap = 집계 호수): 누적 도달을 사업 호수로 자르고 뒤 단계부터 빼서 배정한다 */
function bandOf(r, cap) {
  const st = PARTS.map(() => 0);
  if (!r.reached) { st[6] = cap; return st; }
  const at = (k, floor) => Math.max(floor, Math.min(cap, r.reached[k] || 0));
  const m = at('MOVE_IN', 0), s = at('SUPPLY', m), c = at('CONSTRUCTION', s), a = at('APPROVAL', c), b = at('BUSINESS', a);
  st[5] = m; st[4] = s - m; st[3] = c - s; st[2] = a - c; st[1] = b - a; st[0] = cap - b;
  return st;
}

/* 값 한 묶음(rows 는 이미 범위 안) */
function valsOf(rows, scope) {
  const v = { n: rows.length, c: 0, x: 0, q: 0, u: 0, d: 0, w: 0, a: 0, an: 0, st: PARTS.map(() => 0) };
  for (const r of rows) {
    if (!r.chart[scope]) { v.x++; continue; }
    v.c++;
    const cap = r.units.counted;
    if (!(cap > 0)) { v.q++; continue; }
    v.u += cap;
    bandOf(r, cap).forEach((x, i) => { v.st[i] += x; });
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

/* hp = home-projects.json, view = 덤프로 만든 /policy-delivery/view(9·7) */
function mapOverview(hp, view) {
  const scopes = {};
  for (const scope of ['p97', 'all']) {
    const rows = hp.rows.filter((r) => inScope(r, scope));
    const groups = new Map();
    for (const r of rows) { const k = keyOf(r); if (k) (groups.get(k) || groups.set(k, []).get(k)).push(r); }
    scopes[scope] = {
      total: valsOf(rows, scope),
      sido: Object.fromEntries(Object.entries(SIDO_OF).map(([name, code]) => [code, valsOf(rows.filter((r) => r.region === name), scope)]).sort(([a], [b]) => byStr(a, b))),
      bySgg: Object.fromEntries([...groups].sort(([a], [b]) => byStr(a, b)).map(([k, rs]) => [k, valsOf(rs, scope)])),
      unlinked: rows.filter((r) => !r.sgg).length,
      municipalities: new Set(rows.filter((r) => r.sgg).map((r) => r.sgg.id)).size,
      flags: scope === 'p97' ? flagsOf(view, hp.bySgg) : { sido: {}, sgg: {} },
    };
  }
  return { schema: 'map-overview/1', asOf: hp.asOf, source: { homeProjects: HP, policyView: { asOf: view.as_of_date, policyId: view.policy_id } }, scopes };
}

const render = (doc) => `${JSON.stringify(doc, null, 1)}\n`;

module.exports = { mapOverview, valsOf, bandOf, keyOf, unitOf, inScope, flagsOf, PARTS, GU_CITY, render };

if (require.main === module) {
  try {
    const args = process.argv.slice(2), i = args.indexOf('--out');
    const out = path.resolve(i >= 0 ? args[i + 1] : path.join(P.ROOT, OUT));
    const hp = JSON.parse(fs.readFileSync(path.join(P.ROOT, HP), 'utf8'));
    const doc = mapOverview(hp, require('./policy-progress').homeView());
    fs.writeFileSync(out, render(doc));
    const s = (k) => { const x = doc.scopes[k]; return `${x.total.n}행 · 집계 ${x.total.c - x.total.q} · ${x.total.u.toLocaleString('en-US')}호 · 시군구 ${x.municipalities}곳 · 지연 ${x.total.d}`; };
    console.log(`${path.relative(P.ROOT, out)}: 기준일 ${doc.asOf} · 9·7 ${s('p97')} · '!' 시군구 ${Object.keys(doc.scopes.p97.flags.sgg).length}곳 · 정책 전체 ${s('all')}`);
  } catch (e) { console.error(`오류: ${e.message}`); process.exit(1); }
}
