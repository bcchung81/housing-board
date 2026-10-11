'use strict';
// lib/board/pipeline.ts — 데이터 원본 화면의 수집 흐름(원천 → 보관·실시간 → 화면)과 계획. 자료끼리 맞는지와 화면에 적는 계산을 다시 해 본다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const P = require('../../lib/board/pipeline.ts');
const C = require('../../lib/board/calc.ts');
const sources = require('../../data/board/sources.json');
const registry = require('../../registry/projects.json').projects;
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('원천 카탈로그의 모든 항목이 흐름 안에 자리가 있고, 없는 항목을 가리키지 않는다', () => {
  const ids = sources.items.map((s) => s.id);
  assert.deepEqual(Object.keys(P.PLACE).sort(), [...ids].sort());
  const links = new Set([...P.CHAIN.map((c) => c.id), P.KEYLESS.id]);
  const items = new Set(P.ITEMS.map((i) => i.id));
  for (const [id, p] of Object.entries(P.PLACE)) {
    assert.ok(links.has(p.link), `${id}: 고리 ${p.link}`);
    assert.ok(p.item === null || items.has(p.item), `${id}: 판정 ${p.item}`);
  }
});

test('보관 줄은 여덟 단계이고 네 묶음이 빠짐·겹침 없이 차례대로 나눈다. 상태는 세 값 중 하나다', () => {
  assert.equal(P.STEPS.length, 8);
  assert.deepEqual(P.PHASES.flatMap((p) => p.steps), P.STEPS.map((s) => s.id));
  const all = [...P.STEPS, P.LIVE, ...P.ORIGINS];
  for (const s of all) assert.ok(P.STATUS_LABEL[s.status], `${s.id}: ${s.status}`);
  const ids = [...P.STEPS, P.LIVE].map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(P.ORIGINS.find((o) => o.id === 'input').status, 'plan', '기관 입력 경로는 아직 없다');
});

test('단계가 가리키는 코드 위치는 저장소에 실제로 있다(없는 파일을 근거로 적지 않는다)', () => {
  for (const s of [...P.STEPS, P.LIVE]) for (const f of s.code) assert.ok(fs.existsSync(path.join(ROOT, f)), `${s.id}: ${f}`);
});

test("'지금' 문구의 수치는 저장소 자료와 같다: 레지스트리 77건·5개 시군구·일정 0건, 번들 단지 22곳, 실시간 API 8개", () => {
  assert.equal(registry.length, 77);
  assert.equal(new Set(registry.map((p) => p.sgg)).size, 5);
  assert.equal(registry.filter((p) => p.schedule).length, 0);
  assert.equal(registry.filter((p) => p.refs.some((r) => r.system === 'bundle')).length, 22);
  const ledger = P.STEPS.find((s) => s.id === 'ledger').now;
  assert.match(ledger, /77건\(5개 시군구\)/); assert.match(ledger, /0건/);
  const routes = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name === 'route.ts' && !p.includes('/revalidate/')) routes.push(p); } };
  walk(path.join(ROOT, 'app/api'));
  assert.equal(routes.length, 8);
  assert.match(P.LIVE.now, /^8개:/);
});

test('판정 이유는 정의된 기준만 쓰고, 보관은 B 기준·실시간은 R 기준을 하나 이상 갖는다', () => {
  for (const i of P.ITEMS) {
    assert.ok(i.why.length > 0, i.id);
    for (const r of i.why) assert.ok(P.RULES[r], `${i.id}: ${r}`);
    if (i.mode === 'store') assert.ok(i.why.some((r) => r.startsWith('B')), i.id);
    if (i.mode === 'live') assert.ok(i.why.every((r) => r.startsWith('R')), i.id);
    if (i.mode === 'mixed') assert.ok(i.why.some((r) => r.startsWith('B')) && i.why.some((r) => r.startsWith('R')), i.id);
  }
  assert.equal(new Set(P.ITEMS.map((i) => i.id)).size, P.ITEMS.length);
});

test('한도 계산: 버스 4노선 × 86,400 ÷ 60 = 5,760 은 80% 기준(8,000) 안이고, 다른 막대도 모두 기준 안이다', () => {
  const bus = P.ITEMS.find((i) => i.id === 'bus').meter;
  assert.equal(bus.used, 5760);
  assert.ok(bus.used <= P.GUIDE * bus.limit);
  for (const i of P.ITEMS.filter((x) => x.meter)) assert.ok(P.pct(i.meter) < P.GUIDE * 100, `${i.id} ${P.pct(i.meter)}%`);
  assert.equal(P.pct(P.ITEMS.find((i) => i.id === 'hub-hs').meter), 9);     // 대지위치 2.7만 ÷ 30만
  assert.equal(P.pct(P.ITEMS.find((i) => i.id === 'hub-ap').meter), 23);    // 건축 기본개요 6.9만 ÷ 30만
  assert.equal(P.pct(P.ITEMS.find((i) => i.id === 'notices').meter), 14.4); // 6쪽 × 24시간 = 144 ÷ 1,000
  assert.equal(6 * 24, P.ITEMS.find((i) => i.id === 'notices').meter.used);
});

test('한도 계산의 근거가 코드와 같다: 공고 목록 6쪽·버스 하루 예산 8,000·건물 칸 5쪽', () => {
  assert.match(read('handlers/v1/notices.js'), /const MAX_PAGES = 6;/);
  assert.match(read('handlers/v1/buildings.js'), /const MAX_PAGES = 5;/);
  assert.match(read('handlers/bus.js'), /const DAILY_BUDGET = 8000;/);
});

test('시간축: 2026-10 에 시작한 일정 기록은 다음 달에 변경을 감지하고, 6개월 뒤(2027-04) 6개월 추이를 그린다', () => {
  const [start, second, trend] = P.TIMELINE.map((t) => t.ym);
  assert.equal(C.monthsBetween(start, second), 1);
  assert.equal(C.monthsBetween(start, trend), 6);
});

test('끝에서 본 결과: 질문 다섯 개와 국민 화면, 판정 값은 세 가지 중 하나. 계획은 일정 기록부터 시작한다', () => {
  assert.equal(P.QUESTIONS.length, 6);
  for (const q of P.QUESTIONS) assert.ok(P.CAN_LABEL[q.can], q.q);
  assert.match(P.PLAN[0].what, /^일정 기록 시작/);
  for (const p of P.PLAN) assert.ok(p.check.length > 0);
});

test('끝의 화면 링크는 메뉴에 있는 경로뿐이다', () => {
  const { MENU } = require('../../lib/shell/menu.ts');
  const hrefs = new Set(MENU.map((m) => m.href));
  for (const e of P.ENDS) for (const [, href] of e.screens) assert.ok(hrefs.has(href), href);
});

test('데이터 원본 화면은 카드 없이 화면별 요약 → 종합상황판 → 지도 → 보관 원천 순으로 보이고 보관 원천의 앵커를 유지한다', () => {
  const page = read('app/(dashboard)/sources/page.tsx');
  const screen = page.indexOf('label="화면별 데이터 사용과 부족한 자료"');
  const board = page.indexOf('id="board-data"');
  const map = page.indexOf('id="map-data"');
  const catalog = page.indexOf('id="catalog"');
  assert.ok(screen > 0 && screen < board && board < map && map < catalog);
  assert.doesNotMatch(page, /<Card|<Overview|<Summary|<Flow/);
  assert.match(page, /<section id=\{s\.id\}/, '원천별 딥링크 유지');
  assert.match(page, /<HashOpen \/>/);
  assert.match(read('components/sources/HashOpen.tsx'), /hashchange/);
});

test('모든 수집 원천과 운영 데이터에 방법·현재 주기가 있고, 계획과 실제를 구분한다', () => {
  assert.ok(P.GLOSSARY.length >= 5);
  for (const g of P.GLOSSARY) assert.ok(g.term && g.mean.length > 10, g.term);
  const page = read('app/(dashboard)/sources/page.tsx');
  const { COLLECTION, OPERATIONS, bytesLabel } = require('../../lib/board/collection.ts');
  assert.deepEqual(Object.keys(COLLECTION).sort(), sources.items.map((s) => s.id).sort());
  assert.deepEqual(Object.keys(OPERATIONS).sort(), P.ITEMS.map((i) => i.id).sort());
  for (const c of Object.values(COLLECTION)) assert.ok(c.name && c.method && c.cycle.startsWith('수동') && c.unit);
  assert.match(OPERATIONS.notices.cycle, /조회 시.*1시간/);
  assert.doesNotMatch(OPERATIONS.notices.cycle, /하루 1/);
  assert.match(OPERATIONS.schedule.cycle, /미수집/);
  assert.equal(bytesLabel(1024), '1.0 KiB');
  assert.match(page, /현재 수집 주기/);
  assert.match(read('components/sources/Flow.tsx'), /\{s\.does\}/, '단계 상세에 하는 일');
  for (const s of [...P.STEPS, P.LIVE]) assert.ok(s.does.length > 0, s.id);
});


test('화면 사용 판정은 모든 운영 자료를 포함하고, 사용 근거 경로가 실제로 존재한다', () => {
  const { SCREEN_USAGE, sourceUsage, sourceGap } = require('../../lib/board/screen-usage.ts');
  assert.deepEqual(Object.keys(SCREEN_USAGE).sort(), P.ITEMS.map((i) => i.id).sort());
  for (const [id, usage] of Object.entries(SCREEN_USAGE)) {
    assert.ok(usage.board && usage.map && usage.gap && usage.evidence.length, id);
    for (const file of usage.evidence) assert.ok(fs.existsSync(path.join(ROOT, file)), `${id}: ${file}`);
  }
  assert.match(SCREEN_USAGE.ledger.board, /^△ 원장 2026-10/, '종합상황판은 원장 2026-10 범위만 쓴다(전국 아님)');
  assert.match(SCREEN_USAGE.ledger.map, /✓/);
  assert.match(SCREEN_USAGE['hub-ap'].map, /△/);
  assert.match(SCREEN_USAGE.schedule.gap, /이력 없음/);
  const annual = sources.items.find((s) => s.id === 'molit-permit-annual');
  assert.equal(sourceUsage(annual.id, annual.usedBy).board, '—');
  assert.match(sourceGap(annual), /계획 호수/);
  assert.equal(sourceUsage('datagokr-15141761', ['/']).map, '△ 계양 가공본');
  assert.match(read('app/(dashboard)/sources/page.tsx'), /SAMPLE/);
});

test('추가 확보 필요: API 11건(신규 신청 8·신청됨 미연결 3)·파일 6건, 부족 번호·출처 주소가 있고 화면에서 지도와 카탈로그 사이에 보인다', () => {
  const { ACQUIRE, GAPS } = require('../../lib/board/acquire.ts');
  const ids = ACQUIRE.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  const api = ACQUIRE.filter((a) => a.kind === 'API'), file = ACQUIRE.filter((a) => a.kind === '파일');
  assert.equal(api.length, 11);
  assert.equal(file.length, 6);
  assert.equal(api.filter((a) => a.status === '신규 신청 필요').length, 8);
  assert.equal(api.filter((a) => a.status === '신청됨·미연결').length, 3);
  for (const a of ACQUIRE) {
    assert.ok(a.gaps.length && a.gaps.every((g) => GAPS[g]), a.id);
    assert.match(a.url, /^https:\/\//, a.id);
  }
  const page = read('app/(dashboard)/sources/page.tsx');
  const at = (k) => page.indexOf(k);
  assert.ok(at('id="map-data"') < at('id="acquire"') && at('id="acquire"') < at('id="catalog"'));
});

test('행 예시: 앞 10건만 보이고, 전체 건수와 출처를 함께 둔다. CP949 CSV 도 읽는다', () => {
  const S = require('../../lib/board/samples.ts');
  const recs = Array.from({ length: 25 }, (_, i) => ({ n: i, name: `x${i}`, obj: { a: 1 }, empty: null }));
  const d = S.detailOf(recs, 'src');
  assert.equal(d.rows.length, 10);
  assert.equal(d.total, 25);
  assert.deepEqual(d.cols.map((c) => c.key), ['n', 'name'], '값이 없는 칸·객체 칸은 열로 만들지 않는다');
  assert.equal(d.cols[0].kind, 'int');
  assert.equal(S.detailOf([], 'src'), undefined);
  const lhCsv = 'data/raw/datagokr/15141761_한국토지주택공사_공공주택 준공예정현황_20260127.csv';
  if (fs.existsSync(path.join(ROOT, lhCsv))) {   // 원본은 저장소에 없다(로컬에만)
    const c = S.csvDetail(lhCsv);
    assert.equal(c.total, 351);
    assert.equal(c.rows.length, 10);
    assert.ok(c.cols.some((col) => /[가-힣]/.test(col.label)), 'CP949 머리 줄이 한글로 읽힌다');
  }
  const page = read('app/(dashboard)/sources/page.tsx');
  assert.match(page, /return \{ id: s\.id, detail: DETAIL\[s\.id\], c: \{/, '카탈로그 행도 펼친다');
  assert.match(page, /rows=\{withDetail\(boardRows\)\}/);
  assert.match(page, /rows=\{withDetail\(mapRows\)\}/);
});

test('단계별 데이터 연계: ①계획~⑥입주 6탭, 자료는 정해진 고리·선 종류만 쓰고 추가 자료는 조사 목록(ACQUIRE) id 를 가리킨다', () => {
  const { stageLinks, LEVELS, VIAS } = require('../../lib/board/stage-links.ts');
  const { ACQUIRE } = require('../../lib/board/acquire.ts');
  const zero = new Proxy({}, { get: () => 0 });
  const stages = stageLinks({ regions: 3, sgg: 5, registryTotal: 77, registryRefs: 55, registry: { '06': 59, '03': 12, '04': 4, '05': 2 }, bundle: { '계획': 3 },
    molit: { permit: 1, start: 1, sale: 1, complete: 1, annual: 1 }, months: '2021-09~2026-08', lhBlocks: 351, lhAsOf: '2026-01-27',
    catalog: zero, hubBasis: 58, permits: 0, permitsStarted: 0, permitsCompleted: 0, plat: 0, ledger: 0, lhNotices: 0, myhome: 0, myhomePnu: 0, stan: 0 }, ACQUIRE);
  assert.deepEqual(stages.map((s) => s.name), ['계획', '인허가', '착공', '모집', '준공', '입주']);
  const ids = new Set(ACQUIRE.map((a) => a.id));
  for (const s of stages) {
    assert.ok(s.current.length && s.needed.length && s.rows.length, s.id);
    assert.equal(s.outcomes.length, 4, s.id);
    for (const it of [...s.current, ...s.needed]) {
      assert.ok(LEVELS.includes(it.level) && ['key', 'name', 'need', 'none'].includes(it.edge), `${s.id}: ${it.name}`);
      for (const id of it.ids ?? []) assert.ok(ids.has(id), `${s.id}: ${id}`);
      /* 상자 폭 320 - 여백 28 = 292px 안에 들어가는가(한글은 글자 크기만큼, 영숫자·기호는 그 절반 남짓으로 어림) */
      const px = (t, size) => [...t].reduce((w, ch) => w + (/[가-힣○]/.test(ch) ? size : size * 0.58), 0);
      assert.ok(it.via?.length && it.via.every((v) => VIAS.includes(v)), `${s.id}: ${it.name} 에 받는 방식 표지(실시간·API·CSV 등)가 있어야 한다`);
      const badges = it.via.reduce((w, v) => w + [...v].reduce((x, ch) => x + (/[가-힣]/.test(ch) ? 11 : 7.2), 0) + 16, 0);
      assert.ok(px(it.name, 14.5) + badges + 8 <= 292 && px(it.sub, 12) <= 292, `${s.id}: 상자 글자가 길다 — ${it.name} / ${it.sub}`);
    }
    for (const it of s.needed) assert.ok(it.internal || it.ids?.length, `${s.id}: ${it.name} 은 조사 id 나 내부 표시가 있어야 한다`);
  }
  assert.deepEqual(stages[0].acquire, { ext: 6, api: 2, file: 4, internal: 2 }, '계획: 외부 6건(API A9·A11 · 파일 F1·F2·F3·F5) + 내부 2건');
  const page = read('app/(dashboard)/sources/page.tsx');
  const at = (k) => page.indexOf(k);
  assert.ok(at('id="stage-links"') < at('id="etc"') && at('id="etc"') < at('label="화면별 데이터 사용과 부족한 자료"') && at('id="acquire"') < at('id="catalog"'), '단계별 연계가 맨 위, 나머지는 기타 탭 안');
  const c = read('components/sources/StageLinks.tsx');
  assert.match(c, /role="tablist"/);
  assert.match(c, /role="tab"[^>]*aria-selected=\{i === tab\}/);
  assert.match(c, /id="stage-tab-etc"[^>]*aria-selected=\{tab === ETC\}/, '마지막 탭은 기타');
  assert.match(c, /role="tabpanel" id="stage-panel-etc"[^>]*hidden=\{tab !== ETC\}/, '기타는 늘 그려 두고 숨겨서 #id 링크가 닿는다');
  assert.match(page, /<StageLinks stages=\{stages\} extra=\{\(\s*<div id="etc">/);
  assert.match(c, /<DataGrid key=\{s\.id\} label=\{`\$\{s\.name\} 단계 자료별 연계`\}/);
});
