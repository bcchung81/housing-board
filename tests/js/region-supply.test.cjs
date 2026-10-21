'use strict';
// 지역 공급(/region)·요구사항 충족(/sources ①) 자료 — tools/ledger/region-supply.js · tools/ledger/requirements.js · lib/board/region.ts · lib/board/requirements.ts.
// 결정적 출력, 서울·인천·경기 HOME 통계 2022~2025 = 통계누리, 판정 규칙, 동네 여건 범위, 담당자 실명·입력 사유 0건.
// HOME 판 원본(jsonl.gz)은 저장소에 없어(gitignore) 원본으로 다시 만들어 맞춰 보는 시험은 원본이 있을 때만 돈다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const RS = require('../../tools/ledger/region-supply.js');
const RQ = require('../../tools/ledger/requirements.js');
const R = require('../../lib/board/region.ts');
const Q = require('../../lib/board/requirements.ts');
const A = require('../../lib/board/annual.ts');
const P = require('../../tools/ledger/paths.js');
const H = require('../../tools/ledger/home-source.js');
const calendar = require('../../data/board/region-calendar.json');
const regionMap = require('../../data/board/region-map.json');
const annual = require('../../data/board/region-annual.json');
const reqs = require('../../data/board/requirements.json');
const facts = require('../../data/board/area-facts.json');
const molit = require('../../data/board/molit.json');
const pp = require('../../data/board/policy-progress.json');

const OUTS = ['data/board/region-calendar.json', 'data/board/region-map.json', 'data/board/region-annual.json', 'data/board/requirements.json'];
const homeDir = H.latestHomeDir(P.ledgerDir(P.latestMonth()));
const raw = !!homeDir && H.homeAvailable(homeDir);
const pocSnap = fs.existsSync(path.join(P.ledgerDir(P.latestMonth()), 'raw', 'home-api', P.referenceDateOf(P.ledgerDir(P.latestMonth())), 'sources-requirements.json.gz'));   // PoC 스냅샷 압축 원본(git 무시)

/* ---------- 생성기 결정성 ---------- */
test('buildCalendar: 입력 행 순서가 달라도 같은 결과(정렬), 종류마다 현재 예정 하나·실제가 있는 종류는 뺀다·12개월 밖은 뺀다', () => {
  const tables = {
    areas: [{ level: 'SGG', area_code: '41113', area_name: '경기도 수원시 권선구' }],
    sources: [{ source_ref: 'a', data_as_of: '2026-10-01' }, { source_ref: 'b', data_as_of: '2026-09-01' }],
    projects: [
      { local_project_id: 'P1', sgg_code: '41113', issued_at: '2026-10-01', source_ref: 'home-dump-x', project_name: '가' },
      { local_project_id: 'P2', sgg_code: '41113', issued_at: null, source_ref: 'b', project_name: '나' },
      { local_project_id: 'P3', sgg_code: '41113', issued_at: null, source_ref: 'b', project_name: '다', superseded_by: 'P1' },
    ],
    events: [
      { local_project_id: 'P1', event_type: 'COMPLETION', date_type: 'PLANNED', plan_basis: 'CURRENT', event_month: '2027-02', source_ref: 'b' },
      { local_project_id: 'P1', event_type: 'COMPLETION', date_type: 'PLANNED', plan_basis: 'CURRENT', event_date: '2027-01-05', source_ref: 'a' },
      { local_project_id: 'P1', event_type: 'MOVE_IN', date_type: 'PLANNED', plan_basis: 'CURRENT', event_month: '2027-11', source_ref: 'a' },   // 12개월 밖
      { local_project_id: 'P2', event_type: 'SUPPLY_NOTICE', date_type: 'PLANNED', plan_basis: 'CURRENT', event_month: '2026-12', source_ref: 'b' },
      { local_project_id: 'P2', event_type: 'SUPPLY_NOTICE', date_type: 'ACTUAL', event_month: '2026-09', source_ref: 'b' },   // 이미 모집 → 뺀다
      { local_project_id: 'P3', event_type: 'COMPLETION', date_type: 'PLANNED', plan_basis: 'CURRENT', event_month: '2026-11', source_ref: 'b' },   // 대체된 사업
    ],
  };
  const map = { P1: { name: '가 A1', units: 300 } };
  const a = RS.buildCalendar(tables, map, '2026-10');
  const shuffled = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, [...v].reverse()]));
  assert.deepEqual(RS.buildCalendar(shuffled, map, '2026-10'), a);
  assert.deepEqual(a.months, ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07', '2027-08', '2027-09']);
  assert.deepEqual(a.sido['41'].map((e) => [e.id, e.type, e.ym, e.day, e.units, e.drawer]), [['P1', 'COMPLETION', '2027-01', '2027-01-05', 300, true]], '기준일이 늦은 원천의 예정이 이긴다');
});

test('buildMap: 결정적이고 경계 경로는 줄인 상대 좌표, 시도 보기 상자는 서울·인천·경기', () => {
  const sq = (x, y, d) => ({ type: 'Polygon', coordinates: [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]] });
  const munis = [
    { region: '경기도', name: '가시', admin_codes: ['41111'], longitude: 127, latitude: 37.3, geometry: sq(127, 37.3, 0.1) },
    { region: '서울특별시', name: '나구', admin_codes: ['11110'], longitude: 126.9, latitude: 37.5, geometry: sq(126.9, 37.5, 0.05) },
  ];
  const a = RS.buildMap(munis, [{ name: '지구', geometry: sq(127.01, 37.31, 0.01) }]);
  assert.deepEqual(RS.buildMap([...munis].reverse(), [{ name: '지구', geometry: sq(127.01, 37.31, 0.01) }]).doc, a.doc);
  assert.deepEqual(Object.keys(a.doc.view), ['11', '41']);
  assert.match(a.doc.sgg[0].d, /^M-?\d+ -?\d+l(-?\d+ -?\d+ ?)+z$/);
});

test('커밋된 지역 공급·요구사항 자료는 원본으로 다시 만든 것과 바이트까지 같다', { skip: (!raw && 'HOME 판 원본(jsonl.gz) 없음') || (!pocSnap && 'PoC 스냅샷(raw/home-api) 없음') }, () => {
  const out = RS.build();
  assert.equal(read(OUTS[0]), JSON.stringify(out.calendar) + '\n');
  assert.equal(read(OUTS[1]), JSON.stringify(out.map) + '\n');
  assert.equal(read(OUTS[2]), JSON.stringify(out.annual) + '\n');
  assert.equal(read(OUTS[3]), JSON.stringify(RQ.build()) + '\n');   // 요구사항은 PoC 스냅샷(raw/home-api, 압축 원본은 git 무시)도 있어야 다시 만들 수 있다
});

/* ---------- 시군구 경계: 이웃끼리 같은 선(겹침·틈 없음), 남이 안 덮는 구멍은 메운다 ---------- */
/* 'M절대 l상대…z' → 고리들(닫지 않음) */
const ringsOfD = (d) => [...d.matchAll(/M(-?\d+) (-?\d+)l([^z]*)z/g)].map((m) => {
  let x = +m[1], y = +m[2]; const r = [[x, y]], n = m[3].trim().split(/\s+/).map(Number);
  for (let i = 0; i + 1 < n.length; i += 2) r.push([x += n[i], y += n[i + 1]]);
  return r;
});
const inRing = ([px, py], r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) c = !c; } return c; };
const inFace = (p, rings) => rings.reduce((c, r) => c !== inRing(p, r), false);   // 짝홀 규칙
/* 격자(res 단위)에 구역마다 짝홀 규칙으로 가로줄을 칠해 셈 → 겹침 칸(2번 이상)·갇힌 빈 칸(바깥 테두리에서 빈 칸끼리 이어 닿지 않는 빈 칸) */
function raster(units, res) {
  const all = units.flat(2), xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const X0 = Math.min(...xs) - 2, Y0 = Math.min(...ys) - 2, W = Math.ceil((Math.max(...xs) + 2 - X0) / res), H = Math.ceil((Math.max(...ys) + 2 - Y0) / res);
  const cnt = new Uint8Array(W * H);
  for (const rings of units) {
    const rows = new Map();
    for (const r of rings) for (let k = 0; k < r.length; k++) {
      let [x1, y1] = r[k], [x2, y2] = r[(k + 1) % r.length]; if (y1 === y2) continue; if (y1 > y2) [x1, y1, x2, y2] = [x2, y2, x1, y1];
      for (let row = Math.ceil((y1 - Y0) / res - 0.5); row <= Math.ceil((y2 - Y0) / res - 0.5) - 1; row++) { const y = Y0 + (row + 0.5) * res; if (!rows.has(row)) rows.set(row, []); rows.get(row).push(x1 + (y - y1) * (x2 - x1) / (y2 - y1)); }
    }
    for (const [row, xs2] of rows) { xs2.sort((a, b) => a - b); for (let i = 0; i + 1 < xs2.length; i += 2) for (let c = Math.ceil((xs2[i] - X0) / res - 0.5); c <= Math.ceil((xs2[i + 1] - X0) / res - 0.5) - 1; c++) cnt[row * W + c]++; }
  }
  let over = 0; for (const v of cnt) if (v >= 2) over++;
  const seen = new Uint8Array(cnt.length), st = [];
  for (let x = 0; x < W; x++) st.push(x, (H - 1) * W + x); for (let y = 0; y < H; y++) st.push(y * W, y * W + W - 1);
  while (st.length) { const i = st.pop(); if (seen[i] || cnt[i]) continue; seen[i] = 1; const x = i % W; if (x > 0) st.push(i - 1); if (x < W - 1) st.push(i + 1); if (i >= W) st.push(i - W); if (i < (H - 1) * W) st.push(i + W); }
  let enclosed = 0; for (let i = 0; i < cnt.length; i++) if (!cnt[i] && !seen[i]) enclosed++;
  return { over, enclosed };
}
const unproj = ([x, y]) => [x / (Math.cos(37.5 * Math.PI / 180) * 1000) + 124.5, 38.4 - y / 1000];
const poly = (...rings) => ({ type: 'Polygon', coordinates: rings.map((r) => [...r, r[0]].map(unproj)) });
const muni = (name, code, geometry) => ({ region: '경기도', name, admin_codes: [code], longitude: 127, latitude: 37.3, geometry });

test('buildMap: 맞닿은 두 시군구는 공유 경계를 한 번만 줄여 겹침·틈이 없다(시작점·방향이 달라도)', () => {
  /* 세로 경계 x≈2000: 큰 굽이(진폭 8) + 허용보다 작은 지그재그(±0.45), 1단위마다 점 */
  const border = Array.from({ length: 101 }, (_, i) => [2000 + 8 * Math.sin(i * Math.PI / 25) + (i % 2 ? 0.45 : -0.45), 1000 + i]);
  const left = [[1900, 1000], ...border, [1900, 1100]];
  const right = [[2100, 1100], [2100, 1000], ...border].reverse();
  const rightRot = [...right.slice(37), ...right.slice(0, 37)];   // 다른 시작점
  const { doc } = RS.buildMap([muni('왼시', '41001', poly(left)), muni('오른시', '41002', poly(rightRot))], []);
  const units = doc.sgg.map((g) => ringsOfD(g.d));
  assert.equal(units.length, 2);
  assert.deepEqual(raster(units, 0.25), { over: 0, enclosed: 0 });
});

test('buildMap: 이웃 경계 두 줄 없음 — 양쪽 꼭짓점이 살짝 어긋난 공유 경계도 한 줄로 합친다', () => {
  /* 같은 굽은 경계를 왼쪽은 정수 높이마다, 오른쪽은 반 칸 어긋난 높이마다(±0.05 흔들림) 그렸다. 끝점(이음점)만 같다 */
  const curve = (t) => [2000 + 8 * Math.sin(t * Math.PI / 25), 1000 + t];
  const a = Array.from({ length: 101 }, (_, i) => curve(i));
  const b = Array.from({ length: 100 }, (_, i) => { const [x, y] = curve(i + 0.5); return [x + (i % 2 ? 0.05 : -0.05), y]; });
  const left = [[1900, 1000], ...a, [1900, 1100]];
  const right = [[2100, 1100], [2100, 1000], a[0], ...b, a[100]].reverse();
  const { doc } = RS.buildMap([muni('왼시', '41001', poly(left)), muni('오른시', '41002', poly(right))], []);
  const units = doc.sgg.map((g) => ringsOfD(g.d));
  const border = (rings) => rings[0].filter(([x]) => x > 1950 && x < 2050).map((p) => p.join()).sort();
  assert.ok(border(units[0]).length > 5, '굽이가 남는다');
  assert.deepEqual(border(units[0]), border(units[1]), '양쪽 경계가 같은 점(한 줄)');
  assert.deepEqual(raster(units, 0.25), { over: 0, enclosed: 0 });
});

test('buildMap: 다른 시군구가 안 덮는 구멍은 메우고, 들어앉은 시군구의 구멍은 남겨 그 바깥 고리와 같은 점을 쓴다', () => {
  const circle = (cx, cy, rad, n) => Array.from({ length: n }, (_, i) => [cx + (rad + (i % 2 ? 0.4 : -0.4)) * Math.cos(2 * Math.PI * i / n), cy + (rad + (i % 2 ? 0.4 : -0.4)) * Math.sin(2 * Math.PI * i / n)]);
  const outer = [[1000, 1000], [1100, 1000], [1100, 1100], [1000, 1100]];
  const lone = circle(1030, 1050, 8, 40), inner = circle(1070, 1050, 10, 60);
  const island = [...inner].reverse(), islandRot = [...island.slice(17), ...island.slice(0, 17)];   // 방향·시작점이 다르다
  const { doc } = RS.buildMap([muni('바깥시', '41001', poly(outer, lone, inner)), muni('안시', '41002', poly(islandRot))], []);
  const A = ringsOfD(doc.sgg.find((g) => g.n === '바깥시').d), B = ringsOfD(doc.sgg.find((g) => g.n === '안시').d);
  assert.ok(inFace([1030, 1050], A), '아무도 안 덮는 구멍은 메운다');
  assert.ok(!inFace([1070, 1050], A) && inFace([1070, 1050], B), '들어앉은 구역 자리는 구멍으로 남는다');
  assert.equal(A.length, 2); assert.equal(B.length, 1);
  const pts = (r) => r.map((p) => p.join()).sort();
  assert.deepEqual(pts(A[1]), pts(B[0]), '구멍과 들어앉은 구역 바깥 고리가 같은 점');
  assert.deepEqual(raster([A, B], 0.25), { over: 0, enclosed: 0 });
});

test('region-map.json 시군구 경계: 겹침 ≤ 3 km², 갇힌 빈 칸 ≤ 6 km², 수원시 팔달구 자리는 수원시가 덮는다', () => {
  const RES = 0.5, km2 = (n) => n * RES * RES * 0.0888 * 0.1111;
  const units = regionMap.sgg.map((g) => ringsOfD(g.d));
  const { over, enclosed } = raster(units, RES);
  assert.ok(km2(over) <= 3, `겹침 ${km2(over).toFixed(2)} km²`);
  assert.ok(km2(enclosed) <= 6, `갇힌 빈 칸 ${km2(enclosed).toFixed(2)} km²`);
  assert.ok(inFace(RS.proj([127.02, 37.28]), ringsOfD(regionMap.sgg.find((g) => g.n === '수원시').d)), '팔달구 중심');
});

/* ---------- 앞으로 12개월·지도 ---------- */
test('region-calendar: 12개월 안의 예정만, 위치(점)는 서울·인천·경기만 · 지도 자료는 100 KB 이하', () => {
  assert.equal(calendar.months.length, 12);
  assert.equal(calendar.from, calendar.observedMonth);
  for (const [sd, list] of Object.entries(calendar.sido)) for (const e of list) {
    assert.ok(calendar.months.includes(e.ym), `${e.id} ${e.ym}`);
    assert.ok(R.CAL_KINDS.includes(e.type));
    assert.equal(!!e.pt, R.METRO.includes(sd), `${e.id}: 점은 서울·인천·경기만`);
    if (e.pt) assert.ok(Object.keys(R.LOC_NAME).includes(e.loc), `${e.id}: 위치 근거`);
  }
  assert.deepEqual(Object.keys(regionMap.view), ['11', '28', '41']);
  assert.deepEqual(['11', '28', '41'].map((s) => regionMap.sgg.filter((g) => g.s === s).length), [25, 11, 31], '서울 25 · 인천 11 · 경기 31');
  assert.ok(fs.statSync(path.join(ROOT, OUTS[1])).size <= 100 * 1024);
});

test('lib/board/region: 종류 칩(마지막 하나는 못 끔)·고른 달(예정 없는 달이면 첫 예정 달)·전국 합치기', () => {
  assert.deepEqual(R.parseKinds(undefined), ['COMPLETION'], '기본 = 준공만(대표 숫자, 2026-10-15 결정)');
  assert.deepEqual(R.parseKinds('SUPPLY_NOTICE,COMPLETION,MOVE_IN'), R.CAL_KINDS);
  assert.deepEqual(R.parseKinds('MOVE_IN,x,SUPPLY_NOTICE'), ['SUPPLY_NOTICE', 'MOVE_IN']);
  assert.deepEqual(R.toggleKind(['COMPLETION'], 'MOVE_IN'), ['COMPLETION', 'MOVE_IN']);
  assert.equal(R.toggleKind(['COMPLETION'], 'COMPLETION'), null);
  const months = calendar.months;
  assert.equal(R.pickMonth(months, [{ ym: months[3] }], months[0]), months[3]);
  assert.equal(R.pickMonth(months, [{ ym: months[3] }, { ym: months[5] }], months[5]), months[5]);
  assert.equal(R.pickMonth(months, [], 'x'), months[0]);
  const names = Object.fromEntries(molit.sido.map((s) => [s.code, s.name]));
  const nation = R.aheadAll(calendar, '', (c) => names[c]);
  assert.equal(nation.length, Object.values(calendar.sido).flat().length);
  assert.equal(new Set(nation.map((e) => e.k)).size, nation.length, '사업|종류 열쇠는 겹치지 않는다');
  const gg = R.aheadAll(calendar, '41', (c) => names[c]);
  assert.ok(gg.every((e) => !e.place.startsWith('경기')), '시도 보기는 시도 이름을 뺀다');
  assert.equal(R.placeLabel('경기도 수원시 권선구', '경기', false), '경기 수원시 권선구');
});

/* ---------- 지난 공급 실적 ---------- */
test('서울·인천·경기 HOME 통계 2022~2025 는 통계누리(molit.json)와 같다 — 그래서 2018~2021 을 앞에 이어도 된다', () => {
  const sumYear = (months, arr, y) => months.reduce((s, m, i) => s + (m.startsWith(String(y)) && arr[i] != null ? arr[i] : 0), 0);
  for (const code of R.METRO) for (const y of [2022, 2023, 2024, 2025]) {
    for (const m of ['start', 'sale', 'complete']) assert.equal(sumYear(annual.months, annual.series[m][code], y), sumYear(molit.months, molit.metrics[m].series[code].total, y), `${code} ${m} ${y}`);
    assert.equal(annual.permitYearly[code][String(y)], sumYear(molit.months, molit.metrics.permit.series[code].total, y), `${code} permit ${y}`);
  }
  for (const code of R.METRO) for (const y of [2018, 2019, 2020, 2021]) for (const m of ['start', 'sale', 'complete']) assert.equal(annual.series[m][code].filter((v, i) => annual.months[i].startsWith(String(y)) && v != null).length, 12, `${code} ${m} ${y} 12개월`);
});

test('regionYears: 서울·인천·경기는 2018 부터(2018~2021 완결), 전국·다른 시도는 2022 부터 = annualSeries', () => {
  for (const m of ['permit', 'start', 'sale', 'complete']) {
    const gg = R.regionYears(molit, annual, m, '41');
    assert.equal(gg.spliced, true);
    assert.deepEqual(gg.years.slice(0, 4).map((y) => [y.year, y.complete]), [[2018, true], [2019, true], [2020, true], [2021, true]], m);
    for (const code of ['', '26']) {
      const r = R.regionYears(molit, annual, m, code);
      assert.equal(r.spliced, false);
      assert.deepEqual(r.years, A.annualSeries(molit, m, code || '00').filter((y) => y.year >= 2022), `${m} ${code}`);
    }
  }
});

/* ---------- 동네 여건 범위 ---------- */
test('동네 여건은 서울·인천·경기만 그리고, 다른 시도·전국은 블록 없이 한 줄', () => {
  assert.deepEqual(Object.keys(facts.sido), ['11', '28', '41']);
  const page = read('app/(dashboard)/region/page.tsx');
  assert.match(page, /\{sido && facts\.sido\[sido\] \? <Cond /);
  assert.match(page, /인구·주택 재고·미분양은 시도를 고르면 보입니다/, '수도권·전국·다른 시도는 막다른 꼬리말 대신 시도 고르기 링크');
  assert.match(read('components/region/Cond.tsx'), /if \(!c\) return null;/);
});

/* ---------- 요구사항 판정 ---------- */
/* PoC 요구사항 응답 모양의 지표 하나: 추정 포함 w, 추정 제외 x (count/total) */
const pm = (w, x, total) => ({ label: 'L', note: 'N', estimate_added_count: w - x, with_estimates: { count: w, total, percent: total ? Math.round(w / total * 1000) / 10 : null }, without_estimates: { count: x, total, percent: total ? Math.round(x / total * 1000) / 10 : null } });
test('judge: PoC 지표의 추정 포함 비율로 — 95% 이상 충족 · 0 초과 부분 · 0 또는 산정 불가 없음 (추정 제외는 보조로 적기만)', () => {
  const v = (w, total = 100) => RQ.judge({ project_count: 100, metrics: { 'F-01': pm(w, 0, total) } })['F-01'];
  assert.equal(v(95).verdict, 'met'); assert.equal(v(94).verdict, 'part'); assert.equal(v(1).verdict, 'part');
  assert.equal(v(0).verdict, 'none', '0 이면 없음'); assert.equal(v(0, 0).verdict, 'none', '분모 0(산정 불가)도 없음');
  assert.match(v(0, 0).metric, /산정 불가 · 추정 제외 산정 불가$/);
  assert.match(v(66, 100).metric, /66\/100 66% · 추정 제외 0\/100 0%$/, '추정 포함이 앞, 추정 제외가 뒤');
});

test('requirements.json: F-01~F-12, 화면은 새 구조(사업·지역 공급·데이터 원본), 9·7 같은 칸 수는 policy-progress 와 같다', () => {
  assert.deepEqual(reqs.items.map((r) => r.id), Array.from({ length: 12 }, (_, i) => `F-${String(i + 1).padStart(2, '0')}`));
  for (const r of reqs.items) {
    assert.ok(['met', 'part', 'none'].includes(r.verdict), r.id);
    assert.ok(r.metric && r.tip && r.title && r.priority && r.items.length, r.id);
    assert.ok(r.screens.every((s) => ['projects', 'region', 'sources'].includes(s)), r.id);
    for (const d of r.dates) assert.ok(reqs.directives.some((x) => x.date === d), `${r.id} 지시 ${d}`);
  }
  assert.equal(reqs.measures.base, 232, '모수는 PoC 9·7 정책 사업 232');   // 2026-10-22 재이관: PoC 요구사항 스냅샷(raw/home-api/2026-10-20 sources-requirements, 10-22 다시 받음) 9·7 사업 +2(부천역곡 A1·인천송림4 1) — 10-21 판 230
  for (const r of reqs.items) assert.equal(r.verdict, r.poc.percent >= 95 ? 'met' : r.poc.percent > 0 ? 'part' : 'none', r.id);
  assert.deepEqual(Q.reqsFor(reqs, 'region').map((r) => r.id), ['F-01', 'F-05', 'F-09']);
  assert.deepEqual(Q.reqsFor(reqs, 'sources').map((r) => r.id), ['F-10']);
  assert.match(Q.tagTitle(reqs, reqs.items[1]), /^F-02 .+\(필수\) · 지시 2026\.08\.14 .+ · 판정 /);
});

test('요구사항 꼬리표는 /sources#F-xx 로 가고, 데이터 원본 ① 표의 행에 같은 id 가 있으며 :target 으로 강조한다', () => {
  assert.match(read('components/ReqTags.tsx'), /href=\{`\/sources#\$\{r\.id\}`\}/);
  const t = read('components/sources/Requirements.tsx');
  assert.match(t, /<TableRow key=\{r\.id\} id=\{r\.id\} className=\{`scroll-mt-24 target:outline-2/);
  const page = read('app/(dashboard)/sources/page.tsx'), at = (k) => page.indexOf(k);
  assert.ok(at('<Requirements ') < at('<Collect ') && at('<Collect ') < at('<Coverage ') && at('<Coverage ') < at('<Links ') && at('<Links ') < at('<Fold title="원천 카탈로그"') && at('<Fold title="원천 카탈로그"') < at('id="stage-links"'), '①~④ 다음 맨 아래 접힌 원천 카탈로그');
});

/* ---------- 공개 저장소: 담당자 실명·입력 사유 0건 ---------- */
test('산출물에 담당자 칸(actor·reason)이 없다', () => {
  for (const f of OUTS) assert.doesNotMatch(read(f), /"(actor|actor_basis|reason|change_reason|responsible_org)"\s*:/, f);
});
test('산출물에 HOME 원본의 담당자 이름·입력 사유 원문이 0건이다', { skip: !raw && 'HOME 판 원본(jsonl.gz) 없음' }, () => {
  const t = H.officerTerms(H.readHome(homeDir).kinds);
  assert.ok(t.names.length > 0, '원본에 담당자 입력이 있다(시험이 빈 목록으로 통과하지 않게)');
  for (const f of [...OUTS, 'data/board/area-facts.json', 'data/board/home-sources.json']) {
    const s = read(f);
    assert.deepEqual(t.names.filter((n) => s.includes(n)), [], `${f}: 이름`);
    assert.deepEqual([...t.reasons].filter((r) => s.includes(r)), [], `${f}: 사유`);
  }
});

test('카드 안 카드는 테두리형(inset): 동네 여건 숫자 칸·12개월 막대 틀·지도 틀·연결 칸, 각진 틀 없음', () => {
  assert.match(read('components/region/Cond.tsx'), /<Card variant="inset" className="@container/, '동네 여건 숫자 칸');
  const ahead = read('components/region/Ahead.tsx');
  assert.match(ahead, /<Card variant="inset" className="h-full p-0">\{wave\}<\/Card>/, '달별 막대 틀');
  assert.match(ahead, /<Card variant="inset"[^>]*>\{mapEl\}<\/Card>/, '지도 틀');
  assert.match(read('components/sources/Collect.tsx'), /<Card key=\{l\.type\} variant="inset"/, '연결 칸');
  for (const f of ['components/region/Ahead.tsx', 'components/sources/Collect.tsx', 'components/sources/Fold.tsx']) assert.doesNotMatch(read(f), /rounded-none|rounded-\[0/, `${f}: 각진 상자`);
});
