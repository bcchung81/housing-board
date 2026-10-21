'use strict';
/* 지도 수도권 개요(/map) ↔ HOME PoC 정답(기준일 2026-10-20) 대조 — 2026-10-21 '전 화면 PoC 규칙' 결정.
   정답: tests/fixtures/map-golden-1021/golden.json(PoC 공개 API 수치만 — 만든 곳은 그 파일 _meta). 우리 값: 화면이 쓰는 문서 그대로
   (lib/board/metro-overview.ts homeOverview ← data/board/map-overview.json, 범위는 assets/js/overview.js scopeVals).
   같거나, 다르면 그 차이를 PRO_ id·이유(data/board/home-projects.json residuals — 덤프 뒤 HOME 변경·규칙 미이식)로 모두 설명해야 통과한다.
   설명한 잔차는 시험 출력(diagnostic)으로 남긴다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../../lib/board/metro-overview.ts');
const J = require('../../assets/js/overview.js');
const MO = require('../../tools/ledger/map-overview.js');
const RM = require('../../data/board/region-map.json');
const MOV = require('../../data/board/map-overview.json');
const HP = require('../../data/board/home-projects.json');
const G = require('../fixtures/map-golden-1021/golden.json');

const doc = (k) => J.scopeVals(O.homeOverview(RM, MOV), k);
const D97 = doc('p97'), DALL = doc('all');
const SIDO = { 서울특별시: '11', 인천광역시: '28', 경기도: '41' };
const rowOf = new Map(HP.rows.map((r) => [r.id, r]));
const resOf = new Map();
for (const x of HP.residuals) (resOf.get(x.id) || resOf.set(x.id, []).get(x.id)).push(x);
const faceOfRow = (r) => (MO.keyOf(r) ? O.unitOf(MO.keyOf(r)) : null);
/* PoC 시군구 이름 → 우리 면(이름이 같다 — 인천은 2026-07 개편 이름) */
const faceByName = new Map(D97.units.map((u) => [`${O.SIDO_FULL[u.s]}|${u.name}`, u]));
const note = (t, lines) => t.diagnostic(`${lines.length}건\n${lines.join('\n')}`);

test('9·7 기본(PoC #overview 기본): 원천 230행 · 집계 175 · 중복·모호 제외 55 · 물량 없음 0 · 151,271호 · 시군구 44곳 · 시군구 미연결 4행(시군구 합 149,520)', () => {
  const o = G.overview_97, t = D97.total;
  assert.deepEqual([t.n, t.c - t.q, t.x, t.q, t.u], [o['summary.project_count'], o['summary.target_counted_projects'], o['summary.target_excluded_projects'], o['summary.target_missing_projects'], o['summary.target_units']]);
  assert.deepEqual([t.n, t.c - t.q, t.u], [230, 175, 151271]);
  assert.equal(D97.meta.p97.municipalities, o['municipalities.with_projects']);
  assert.equal(D97.meta.p97.unlinked, o.municipality_unlinked_ids);
  assert.equal(D97.units.reduce((s, u) => s + u.v.u, 0), o['municipalities.target_sum']);
  assert.equal(D97.units.filter((u) => u.v.n > 0).length, 44);
});

test('정책 전체(?policy=all · 일반사용자 관점): 원천 443행 · 집계 346 · 제외 56 · 물량 없음 41 · 289,336호', () => {
  const o = G.overview_all, t = DALL.total;
  assert.deepEqual([t.n, t.c - t.q, t.x, t.q, t.u], [o['summary.project_count'], o['summary.target_counted_projects'], o['summary.target_excluded_projects'], o['summary.target_missing_projects'], o['summary.target_units']]);
  assert.deepEqual([t.n, t.u], [443, 289336]);
});

test('시도 카드(9·7): 행 수·계획 호수 = PoC groups.region(서울 29·47,615 · 인천 42·20,251 · 경기 159·83,405)', () => {
  for (const r of G.overview_97.regions) {
    const s = D97.sido.find((x) => x.code === SIDO[r.name]);
    assert.deepEqual([s.v.n, s.v.u], [r.project_count, r.target_units], r.name);
  }
});

test('시군구(9·7) 44곳: 면마다 행 수·계획 호수 = PoC municipalities(물량 미확보 = 0호), PoC 에 없는 면은 0건', (t) => {
  const seen = new Set(), off = [];
  for (const m of G.overview_97.municipalities) {
    const u = faceByName.get(`${m.region}|${m.name}`);
    assert.ok(u, `${m.region} ${m.name}: 지도 면 없음`);
    seen.add(u.code);
    if (u.v.n !== m.project_count || u.v.u !== (m.target_units ?? 0)) off.push(`${m.name}: 우리 ${u.v.n}건 ${u.v.u}호 · PoC ${m.project_count}건 ${m.target_units}호`);
  }
  for (const u of D97.units) if (!seen.has(u.code)) assert.equal(u.v.n, 0, `${u.name}: PoC 에 없는 면`);
  note(t, off);
  assert.deepEqual(off, [], '시군구 값 차이(설명할 잔차 없음 — home-projects 가 PoC 시군구 소속을 스냅샷으로 맞췄다)');
});

test("'!' 지연 표시(9·7): 시군구·시도 묶음의 단계 목표 대비 부족률 2% 이상 — PoC 와 다른 곳은 그 지역의 9·7 행 가운데 덤프 뒤 HOME 변경(residuals) 행으로 모두 설명된다", (t) => {
  const pocSgg = new Set(Object.keys(G.delay_marks.city).map((id) => O.unitOf(HP.bySgg[id].codes[0])));
  const pocSido = new Set(Object.keys(G.delay_marks.region).map((n) => SIDO[n]));
  const ours = MOV.scopes.p97.flags;
  /* 화면 문서에도 같은 표시가 실린다(면·시도 v.f) */
  assert.deepEqual(D97.units.filter((u) => u.v.f).map((u) => u.code).sort(), Object.keys(ours.sgg).sort());
  assert.deepEqual(D97.sido.filter((s) => s.v.f).map((s) => s.code).sort(), Object.keys(ours.sido).sort());
  assert.ok(DALL.units.every((u) => !u.v.f), '정책 전체 범위에는 표시가 없다(PoC 정책 지도는 9·7)');
  const lines = [];
  const explain = (label, rows) => {
    const why = rows.filter((r) => resOf.has(r.id) && resOf.get(r.id).some((x) => ['judge', 'reached', 'row', 'sgg', 'upcoming'].includes(x.field)));
    assert.ok(why.length, `${label}: 설명할 행 없음`);
    lines.push(`${label}: ${why.map((r) => `${r.id}(${[...new Set(resOf.get(r.id).map((x) => x.field))].join('·')})`).join(' ')} — ${resOf.get(why[0].id)[0].why}`);
  };
  const p97 = HP.rows.filter((r) => MO.inScope(r, 'p97'));
  for (const c of new Set([...pocSgg, ...Object.keys(ours.sgg)])) {
    if (pocSgg.has(c) === !!ours.sgg[c]) continue;
    explain(`시군구 ${c} ${D97.units.find((u) => u.code === c).name} 우리 ${ours.sgg[c] ? '!' : '없음'} · PoC ${pocSgg.has(c) ? '!' : '없음'}`, p97.filter((r) => faceOfRow(r) === c));
  }
  for (const c of ['11', '28', '41']) {
    if (pocSido.has(c) === !!ours.sido[c]) continue;
    explain(`시도 ${c} 우리 ${ours.sido[c] ? '!' : '없음'} · PoC ${pocSido.has(c) ? '!' : '없음'}`, p97.filter((r) => SIDO[r.region] === c));
  }
  for (const c of pocSgg) assert.ok(ours.sgg[c], `PoC '!' 시군구 ${c} 는 우리도 '!'`);
  note(t, lines);
});

test('지연·주의 사업 수(9·7): 지연 4 = PoC 정책 화면, 주의 0 vs PoC 2 는 덤프 뒤 담당자 입력 변경 2행', (t) => {
  const st = G.policy_97.project_status;
  assert.equal(D97.total.d, st.DELAYED);
  const moved = HP.residuals.filter((x) => x.field === 'judge' && rowOf.get(x.id).p97 && (x.poc.status === 'WARNING') !== (x.dump.status === 'WARNING'));
  assert.equal(D97.total.w + moved.filter((x) => x.poc.status === 'WARNING').length - moved.filter((x) => x.dump.status === 'WARNING').length, st.WARNING);
  note(t, moved.map((x) => `${x.id} 판정 덤프 ${x.dump.status} · PoC ${x.poc.status} — ${x.why}`));
});

test('향후 12개월 공급 예정(9·7): 우리 17,838호(31건) − 덤프 뒤 입력 변경 행의 차 = PoC 17,488호(30건)', (t) => {
  const { total, projects } = G.policy_97.upcoming_12m, sum = (u) => (u || []).reduce((s, x) => s + x[1], 0);
  const moved = HP.residuals.filter((x) => x.field === 'upcoming' && rowOf.get(x.id).p97 && rowOf.get(x.id).chart.p97);
  const du = moved.reduce((s, x) => s + sum(x.dump) - sum(x.poc), 0), dn = moved.filter((x) => sum(x.dump) > 0).length - moved.filter((x) => sum(x.poc) > 0).length;
  assert.deepEqual([D97.total.a - du, D97.total.an - dn], [total, projects]);
  note(t, moved.map((x) => `${x.id} ${rowOf.get(x.id).name}: 덤프 ${sum(x.dump)}호 · PoC ${sum(x.poc)}호 — ${x.why}`));
});

test('단계 물량 띠 = PoC 지도 서버 단계 분포(2026-10-21 W4 결정 ④): 합계·시도·시군구 면마다 7칸(정책·사업화·인허가·건설·공급·입주·미확인)이 정답과 같다 — 두 범위, 잔차 0', () => {
  const names = ['POLICY', 'BUSINESS', 'APPROVAL', 'CONSTRUCTION', 'SUPPLY', 'MOVE_IN', 'UNKNOWN'], arr = (o) => names.map((k) => o[k]);
  for (const [D, o] of [[D97, G.overview_97], [DALL, G.overview_all]]) {
    assert.deepEqual(D.total.st, arr(o.stage), '합계');
    assert.equal(D.total.st.reduce((a, b) => a + b, 0), D.total.u, '단계 합 = 계획 호수');
    for (const r of o.regions) assert.deepEqual(D.sido.find((x) => x.code === SIDO[r.name]).v.st, arr(r.stage), r.name);
    const byName = new Map(D.units.map((u) => [`${O.SIDO_FULL[u.s]}|${u.name}`, u]));
    for (const m of o.municipalities) assert.deepEqual(byName.get(`${m.region}|${m.name}`).v.st, arr(m.stage), `${m.region} ${m.name}`);
    assert.equal(o.municipalities.length, D.units.filter((u) => u.v.n > 0).length);
  }
});

test('상세 지도 6단계 칩 = PoC 단계 이름(정책·사업화·인허가·건설·공급·입주 + 미확인)·개수 = 단계별 원천 행 수(행 단계 = map-overview.js pocStages), 칩 합 = 머리 줄 원천 n건', () => {
  const APP = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../assets/js/app.js'), 'utf8');
  assert.match(APP, /const POC7 = \[\['정책', [^\]]+\], \['사업화', [^\]]+\], \['인허가', [^\]]+\], \['건설', [^\]]+\], \['공급', [^\]]+\], \['입주', [^\]]+\], \['미확인', [^\]]+\]\]/);
  const HM = require('../../tools/ledger/home-map.js');
  const files = require('node:fs').readdirSync(require('node:path').join(__dirname, '../../data/board/home-map')).filter((f) => /^\d{5}\.json$/.test(f)).map((f) => require(`../../data/board/home-map/${f}`)).filter((d) => d.poc);
  const dash = MO.readDash(HP);
  for (const scope of ['p97', 'all']) {
    const st = MO.pocStages(HP, dash[scope], scope), rows = HP.rows.filter((r) => MO.inScope(r, scope) && HM.sggOfRow(r));
    const want = MO.PARTS.map(() => 0), wantU = MO.PARTS.map(() => 0);
    for (const r of rows) { const s = st.get(r.id).s; want[s] += 1; wantU[s] += r.chart[scope] && r.units.counted > 0 ? r.units.counted : 0; }
    const k = MO.PARTS.map((_, i) => files.reduce((a, d) => a + d.poc[scope].k[i], 0)), ku = MO.PARTS.map((_, i) => files.reduce((a, d) => a + d.poc[scope].ku[i], 0));
    assert.deepEqual(k, want, `${scope} 칩 개수`);
    assert.deepEqual(ku, wantU, `${scope} 칩 호수`);
    for (const d of files) assert.equal(d.poc[scope].k.reduce((a, b) => a + b, 0), d.poc[scope].n, `${d.sgg} 칩 합 = 머리 줄 원천 n건`);
    /* 시군구 파일에 없는 행 = 원장 시군구도 없고 PoC 시군구 코드가 여럿인 행(상세 지도 어느 시군구에도 속하지 않음) */
    assert.equal(HP.rows.filter((r) => MO.inScope(r, scope) && !HM.sggOfRow(r)).length, 1);
    /* 행 단계 = 나눈 몫이 가장 큰 단계: 정답 블록 하나에 단계가 하나뿐이면 그 블록 집계 행은 모두 그 단계 */
    for (const b of dash[scope].blocks) {
      const nz = MO.PARTS.map((p, i) => [i, b.stage_distribution.parts[p] || 0]).filter((x) => x[1] > 0);
      if (nz.length !== 1) continue;
      for (const id of b.chart_target_ids || []) if (st.has(id) && rowOf.get(id).units.counted > 0) assert.equal(st.get(id).s, nz[0][0], `${b.id} ${id}`);
    }
  }
  /* 9·7 칩: 정책 14 · 사업화 5 · 인허가 6 · 건설 92 · 공급 80 · 입주 0 · 미확인 32(229행) */
  assert.deepEqual(MO.PARTS.map((_, i) => files.reduce((a, d) => a + d.poc.p97.k[i], 0)), [14, 5, 6, 92, 80, 0, 32]);
});
