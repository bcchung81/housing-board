'use strict';
// /sources 의 숫자 요소를 HOME PoC 정답(.cache/home-parity/golden/golden-sources.json, 기준일 2026-10-22 — 원장 기준일)과 대조한다.
// 다른 값은 tests/fixtures/sources-1021/explained.json 에 까닭이 적힌 것뿐이어야 한다 — 설명 못 하는 차이는 0.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, '..', '..');
const E = require('./home-era.cjs');
const GOLD = E.GOLDEN_DIR;   // HOME_GOLDEN_DIR(기본 .cache/home-parity/golden)
const has = fs.existsSync(path.join(GOLD, 'golden-sources.json')) && fs.existsSync(path.join(GOLD, 'S3-snapshot.json'));
const skip = !has && '정답 파일(.cache/home-parity/golden) 없음';
const golden = has ? JSON.parse(fs.readFileSync(path.join(GOLD, 'golden-sources.json'), 'utf8')) : null;
const snap = has ? JSON.parse(fs.readFileSync(path.join(GOLD, 'S3-snapshot.json'), 'utf8')) : null;   // 정답을 만든 PoC 응답 축소본(원천별 값)
const hs = require('../../data/board/home-sources.json');
const reqs = require('../../data/board/requirements.json');
const sourcesJson = require('../../data/board/sources.json');
const L = require('../../lib/board/home-sources.ts');
const ex = require('../fixtures/sources-1021/explained.json');
const P = require('../../tools/ledger/paths');

const pocDir = path.join(P.ledgerDir(P.latestMonth()), 'raw', 'home-api', P.referenceDateOf(P.ledgerDir(P.latestMonth())));
const gz = (name) => (fs.existsSync(path.join(pocDir, name)) ? JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(pocDir, name))).toString('utf8')) : null);
const goldSrc = has ? Object.fromEntries(snap.sources.map((s) => [s.id, s])) : {};

/* 판에 따라 달라지는 대조(1-B 건수 · 1-D 연도 격자 · 1-E 연결 · 1-F 요구사항)의 정답(2026-11-09 P2): golden-sources.json 의 받은 시각(meta.pocFetchedAt)이 원장 HOME 판 snapshot_at 보다
   이르면 옛 판 정답이라 쓰지 않고, 같은 판 HOME 응답(raw/home-api/<기준일> — manifest 받은 시각 ≥ snapshot_at, 압축 원본이 있을 때)에서 S3-extract.js 와 같은 셈으로 다시 센다. 둘 다 없으면 건너뛴다 */
const cnt = (a, f) => a.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
const ERA = (() => {
  const g = has ? E.golden(path.join(GOLD, 'golden-sources.json')) : { doc: null, skip: '정답 파일(.cache/home-parity/golden) 없음' };
  if (g.doc) return { from: 'golden-sources.json', src: goldSrc, recordCountSum: golden.poc.sources.recordCountSum, dataGaps: golden.poc.validation.dataGaps, mappings: golden.poc.mappings, requirements: golden.poc.requirements };
  const api = ['sources-list.json.gz', 'sources-year-coverage.json.gz', 'sources-mappings.json.gz', 'sources-requirements.json.gz'].map((n) => E.homeApi(n));
  const miss = api.find((a) => !a.doc);
  if (miss) return { skip: `${g.skip} · 같은 판 HOME 응답도 없음(${miss.skip || '압축 원본 없음'})` };
  const [list, cov, map, rq] = api.map((a) => a.doc);
  const yearRowCells = cov.years.map((y, k) => sortKeys(cnt(cov.rows, (r) => r.cells[k].status)));
  return {
    from: 'raw/home-api', src: Object.fromEntries(list.items.map((x) => [x.id, x])), recordCountSum: list.items.reduce((n, x) => n + (x.record_count || 0), 0),
    dataGaps: { yearRows: cov.rows.length, totalCells: cov.rows.length * cov.years.length, acquiredCells: yearRowCells.reduce((n, c) => n + (c.ACQUIRED || 0), 0), yearRowCells },
    mappings: { counts: map.counts, programStatus: sortKeys(cnt(map.programs, (x) => x.status)) },
    requirements: { projectCount: rq.project_count, metrics: Object.fromEntries(Object.entries(rq.metrics).map(([k, m]) => [k, `${m.count}/${m.total} ${m.percent ?? '산정 불가'}% · 추정 제외 ${m.without_estimates.count}/${m.without_estimates.total} ${m.without_estimates.percent ?? '산정 불가'}% · 추정으로 추가 ${m.estimate_added_count}`])) },
  };
})();
const eraSkip = ERA.skip || false;

test('1-A 헤드라인: 수집 출처 75(데이터 있는 곳) · 등록 76 · 기관 31 · 실패 2 — 우리 보관 원천 17은 따로', { skip }, () => {
  assert.equal(hs.poc.withData, golden.poc.sourceSummary.current.sources);
  /* 정답의 last_success 수(옛 정답은 withData 이름). 데이터는 있으나 정상 수집 실행이 없는 원천(예 ai_publication)이 있으면 머리 수치가 더 크다 */
  assert.ok(hs.poc.withData >= (golden.poc.sources.withSuccess ?? golden.poc.sources.withData));
  assert.equal(hs.poc.registered, golden.poc.sources.registered);
  assert.equal(hs.poc.orgs, golden.poc.sources.orgCount);
  /* 실패 원천 = 정답의 실패 + explained.failed(덤프의 마지막 수집 실행이 실패인데 PoC 는 덤프 뒤 성공한 것) − 정답 실패 중 덤프에선 성공인 것(없음) */
  assert.ok(Object.values(ex.failed).every((v) => v.reason && v.golden === 'SUCCESS' && v.ours === 'FAILED'));
  assert.deepEqual(L.statusRows(hs).filter((r) => !r.ok).map((r) => r.id).sort(), [...golden.poc.sources.failedIds, ...Object.keys(ex.failed)].sort());
  assert.equal(L.statusRows(hs).length, golden.poc.sources.registered, '수집 상태 표에는 우리 보관 원천이 섞이지 않는다');
  assert.equal(sourcesJson.items.length, golden.ours.catalog.n, '1-L 우리 보관 원천 17곳은 그대로(PoC 비교 대상이 아니라 카탈로그)');
});

test('1-A 머리 칩: 덤프 판 날짜는 한국 날짜로 읽는다', { skip }, () => {
  /* 판 날짜 = 원장 HOME 판 manifest 의 snapshot_at(UTC)을 +9시간 한국 날짜로 — 판 이름(UTC)과 같은 판이어야 한다 */
  const kst = new Date(Date.parse(E.snapshotAt) + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '.');
  assert.equal(L.kstEdition(path.basename(E.HOME_DIR)), kst);
  if (golden.meta.ourDumpEdition === path.basename(E.HOME_DIR)) assert.equal(L.kstEdition(golden.meta.ourDumpEdition), kst);
});

test('1-B 원천별 건수(record_count): 정답과 같고, 다른 원천은 explained.recordCount 에 까닭이 있는 것뿐 · 합계도 맞는다', { skip: eraSkip }, () => {
  const diff = {};
  for (const s of hs.sources) if (s.records !== ERA.src[s.id].record_count) diff[s.id] = { golden: ERA.src[s.id].record_count, ours: s.records };
  assert.deepEqual(Object.fromEntries(Object.entries(ex.recordCount).map(([k, v]) => [k, { golden: v.golden, ours: v.ours }])), diff);
  assert.ok(Object.values(ex.recordCount).every((v) => v.reason));
  const sum = hs.sources.reduce((n, s) => n + s.records, 0);
  assert.equal(sum - ERA.recordCountSum, Object.values(diff).reduce((n, d) => n + d.ours - d.golden, 0));
  assert.equal(L.statusRows(hs).reduce((n, r) => n + r.count, 0), sum, '표의 건수 열 합 = 요약 파일 합');
});

test('1-B 원천 기준일(stats): 기준일이 있는 19곳과 날짜가 정답과 같다', { skip }, () => {
  assert.equal(hs.sources.filter((s) => s.asOf).length, golden.poc.sources.withBaseDate);
  assert.deepEqual(hs.sources.filter((s) => s.asOf !== (goldSrc[s.id].base_date ?? null)).map((s) => s.id), []);
});

test('1-A 상태: 조회 상태(검증됨·일부·미검증·미수집)와 PoC 상태는 정답과 같거나 explained.status 로 설명된다', { skip }, () => {
  const q = {};
  for (const s of hs.sources) q[s.query] = (q[s.query] ?? 0) + 1;
  assert.deepEqual(q, golden.poc.validation.coverage.queryStatus);
  const list = gz('sources-list.json.gz');
  if (!list) return;   // 압축 원본(git 무시)이 있는 개발 PC 에서만
  const diff = list.items.filter((s) => s.status !== goldSrc[s.id].status).map((s) => [s.id, goldSrc[s.id].status, s.status]);
  assert.deepEqual(diff, Object.entries(ex.status).map(([id, v]) => [id, v.golden, v.snapshot]));
});

test('1-D 연도 확보 격자: 줄 수 · 칸 수 · 확보 칸, 해마다 칸 상태 수가 정답과 같다', { skip: eraSkip }, () => {
  const rows = L.coverageRows(hs);
  const gd = ERA.dataGaps;   // 판 숫자(26줄 · 234칸 · 확보 175) 대신 같은 판 정답
  assert.equal(rows.length, gd.yearRows);
  assert.equal(rows.length * L.GRID_YEARS.length, gd.totalCells);
  assert.equal(rows.flatMap((r) => r.cells).filter((c) => c === 'full').length, gd.acquiredCells);
  const code = { full: 'ACQUIRED', none: 'NOT_ACQUIRED', nosrc: 'NO_SOURCE_RECORD', unpub: 'SOURCE_NOT_PUBLISHED' };
  L.GRID_YEARS.forEach((y, i) => {
    const n = {};
    for (const r of rows) n[code[r.cells[i]]] = (n[code[r.cells[i]]] ?? 0) + 1;
    assert.deepEqual(n, gd.yearRowCells[i], String(y));
  });
});

test('1-E 연결: 정책–프로그램·프로그램–사업(확정·검토·해제)이 정답과 같다 — 다르면 explained.links 에 사업 id·까닭이 있는 것뿐', { skip: eraSkip }, () => {
  const [pp, pj] = hs.links;
  assert.deepEqual([pp.confirmed, pp.review], [ERA.mappings.programStatus.CONFIRMED, ERA.mappings.programStatus.REVIEW]);
  const g = ERA.mappings.counts, e = ex.links.PROGRAM_PROJECT;
  assert.deepEqual([pj.review, pj.released], [g.REVIEW, g.RELEASED]);
  const mp = gz('sources-mappings.json.gz');
  if (mp && ERA.from === 'golden-sources.json') assert.equal(mp.items.filter((x) => x.mapping.status === 'CONFIRMED').length, g.CONFIRMED, '스냅샷 = 정답');
  if (!e) { assert.equal(pj.confirmed, g.CONFIRMED, '차이가 없으면 explained.links 도 비어 있다'); return; }
  assert.equal(e.confirmed.golden, g.CONFIRMED);
  assert.equal(pj.confirmed, e.confirmed.ours);
  /* 덤프가 많으면(ours > golden) projectIds 는 덤프에만 있는 확정 사업, 정답이 많으면 덤프 뒤 확정된 사업 */
  assert.equal(Math.abs(g.CONFIRMED - pj.confirmed), e.projectIds.length);
  assert.ok(e.reason);
  if (mp) {   // 정답이 많으면 스냅샷에서 확정 연결, 덤프가 많으면 스냅샷에 없는 사업
    const st = Object.fromEntries(mp.items.map((x) => [x.id, x.mapping.status]));
    assert.ok(e.projectIds.every((id) => (g.CONFIRMED > pj.confirmed ? st[id] === 'CONFIRMED' : !(id in st))));
  }
});

test('1-F 요구사항: 모수 9·7 사업 · F-01~F-12 추정 포함/제외 값이 정답과 같다', { skip: eraSkip }, () => {
  assert.equal(reqs.measures.base, ERA.requirements.projectCount);   // 판 숫자(모수 232) 대신 같은 판 정답
  assert.deepEqual(reqs.items.map((r) => r.id), Object.keys(ERA.requirements.metrics));
  for (const r of reqs.items) {
    const m = /^(\d+)\/(\d+) (\S+(?: 불가)?)% · 추정 제외 (\d+)\/(\d+) (\S+(?: 불가)?)% · 추정으로 추가 (\d+)$/.exec(ERA.requirements.metrics[r.id]);
    assert.ok(m, r.id);
    const pct = (v) => (v.startsWith('산정') ? null : Number(v));   // 정답 글의 '산정 불가%' → 값 없음
    const p = r.poc;
    assert.deepEqual([p.count, p.total, p.percent, p.exCount, p.exTotal, p.exPercent, p.added], [+m[1], +m[2], pct(m[3]), +m[4], +m[5], pct(m[6]), +m[7]], r.id);
  }
});

test('1-F 요구사항 판정: 추정 포함 95% 이상 충족 · 0 초과 부분 · 0·산정 불가 없음 (충족 5 · 부분 4 · 없음 3)', { skip }, () => {
  const v = (r) => (r.poc.percent >= 95 ? 'met' : r.poc.percent > 0 ? 'part' : 'none');
  assert.deepEqual(reqs.items.filter((r) => r.verdict !== v(r)).map((r) => r.id), []);
  const n = (k) => reqs.items.filter((r) => r.verdict === k).length;
  assert.deepEqual([n('met'), n('part'), n('none')], [5, 4, 3]);
  /* F-01·F-08 은 정의가 바뀌었다(시도 수·시행 기관 식별 → 사업 단위) — 이름표에 옛 정의가 남지 않는다 */
  assert.match(reqs.items[0].tip, /지도 위치 근거/); assert.match(reqs.items[7].tip, /승인 기관 배정 목표/);
  assert.doesNotMatch(JSON.stringify(reqs), /"(actor|reason|basis)"|사용자 입력/);
});
