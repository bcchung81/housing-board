'use strict';
// 원장·화면 수도권 한정(2026-10-19 사용자 결정): 원장 사업은 HOME 10-14 덤프(서울 11·인천 28·경기 41)만, 화면 범위 표기는 '수도권'.
// ① 저장된 원장 표·레지스트리·화면 자료에 수도권 밖 사업이 없다 ② 빼는 규칙(home-source.js keepSido·issueHome) ③ 통계누리·LH 준공예정은 화면에 넘길 때 수도권으로(calc.ts) ④ 범위 글자 = '수도권'.
// 수도권 밖 실시간 API 거부는 capital-scope.test.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../../tools/ledger/home-source');
const M = require('../../tools/ledger/monthly');
const P = require('../../tools/ledger/paths');

const ROOT = path.join(__dirname, '..', '..');
const CAP = ['11', '28', '41'];
const isCap = (code) => CAP.includes(String(code).slice(0, 2));
const BASE = P.ledgerDir('2026-10');
const rows = (t) => JSON.parse(fs.readFileSync(path.join(BASE, 'tables', `${t}.json`), 'utf8')).rows;
const json = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('① 원장 표: 사업은 모두 수도권(살아 있는 383 = HOME — 2026-10-20 판: 새 HOME 사업 122), 딸린 행은 수도권 사업 몫, 사업 없는 검토 행은 HOME 원천, 수도권 밖 시군구 공고 없음', () => {
  const projects = rows('projects'), live = projects.filter((p) => !p.superseded_by);
  assert.ok(projects.every((p) => isCap(p.sgg_code)));
  assert.equal(live.length, 381);   // 2026-10-22 새 덤프(20261021T212310Z): 새 발급 1(부천역곡 A1 PRJ-41192-0067) 380 → 381 · 2026-10-21 새 덤프(20261020T142230Z): 새 발급 3(독산동·연남동·방화차고지) 377 → 380 · 2026-10-20 HOME 판: 262 + 새 발급 122 − 같은 현장 대체 1(0054→0055) = 383 → 같은 현장 병합 6쌍(사용자 결정) 뒤 377
  assert.ok(live.every((p) => p.source_ref.startsWith(H.HOME_PREFIX)), '살아 있는 사업은 모두 HOME');
  const ids = new Set(projects.map((p) => p.local_project_id));
  for (const t of ['identifiers', 'project_locations', 'complexes', 'events', 'units', 'notice_links']) assert.ok(rows(t).every((r) => ids.has(r.local_project_id)), t);
  assert.ok(rows('review_required').every((r) => (r.local_project_id ? ids.has(r.local_project_id) : r.source_ref.startsWith(H.HOME_PREFIX))));
  assert.ok(rows('notices').every((n) => !n.sgg_code || isCap(n.sgg_code)));
});

test('① 레지스트리: 살아 있는 사업은 모두 수도권 HOME, 수도권 밖 발급 사업(광산 4·나주 12)은 숨김(id 는 남는다)', () => {
  const reg = json('registry/projects.json').projects;
  const live = reg.filter((p) => !p.supersededBy && !p.hiddenAt);
  assert.ok(live.length === 381 && live.every((p) => isCap(p.sgg) && p.refs.some((r) => r.system === H.HOME_SYSTEM)));
  const out = reg.filter((p) => !isCap(p.sgg));
  assert.deepEqual([out.length, [...new Set(out.map((p) => p.sgg))].sort()], [16, ['12170', '12330']]);
  assert.ok(out.every((p) => p.hiddenAt && /^수도권만 제공/.test(p.hiddenReason)));
});

test('① 화면 자료: 종합상황판 범위 CAPITAL·시도 3곳, 지도 색인·사업 색인·상세·지역 공급 달력은 수도권만', () => {
  const L = json('data/board/ledger-board.json');
  assert.deepEqual([L.scope.coverage, L.scope.sido, L.regions.map((r) => r.code)], ['CAPITAL', 3, CAP]);
  assert.deepEqual([L.scope.projects, L.scope.units, L.scope.candidates], [289, 243542, 0]);   // 2026-10-22 새 덤프: 공공 공급 새 사업 1(부천역곡 A1 1,160호) 288·242,382 → 289·243,542 · 2026-10-21 새 덤프: 공공 공급 새 사업 3(독산동 20·연남동 8·방화차고지 75호) 285·242,279 → 288·242,382 · 2026-10-20 공공 분류 안2: 화면은 공공 공급만(민간 정비 39·27,251호, 일반 민간 53·628호 뺌) 377·270,158 → 285·242,279 · 2026-10-20 HOME 판: 사업 262→383, 호수 227,976→274,296 → 2026-10-20 같은 현장 병합 6쌍(사업 −6·−4,138호) 377·270,158
  assert.ok(Object.keys(json('data/board/ledger-map.json').bySgg).every(isCap));
  const idx = json('data/board/projects-index.json');
  assert.ok(Object.keys(idx.projects).every((id) => isCap(id.slice(4, 9))) && Object.keys(idx.sgg).every(isCap));
  assert.ok(Object.keys(json('data/board/project-detail.json').projects).every((id) => isCap(id.slice(4, 9))));
  assert.deepEqual(Object.keys(json('data/board/region-calendar.json').sido).sort(), CAP);
});

test('② 변환 인자: HOME 판이 있으면 --sidos 11,28,41 (월 갱신·핸드오프 node 한 줄이 같은 인자를 쓴다)', () => {
  const a = M.convertArgs(ROOT, BASE, '2026-10', 'hub-refresh.json');
  assert.equal(a[a.indexOf('--sidos') + 1], '11,28,41');
});

test('② keepSido: 수도권 밖 사업과 딸린 행을 빼고 수도권 행은 순서 그대로, 연결된 공고·시군구 없는 공고는 남긴다', () => {
  const t = {
    projects: [{ local_project_id: 'PRJ-11110-0001', sgg_code: '11110', source_ref: 'home-dump-x' }, { local_project_id: 'PRJ-26110-0001', sgg_code: '26110', source_ref: 'hub-bulk-hs-2026-08' }],
    identifiers: [{ local_project_id: 'PRJ-26110-0001' }, { local_project_id: 'PRJ-11110-0001' }], project_locations: [], complexes: [{ local_project_id: null }], events: [{ local_project_id: 'PRJ-26110-0001' }], units: [], notice_links: [{ local_project_id: 'PRJ-11110-0001', notice_system: 'APPLYHOME', notice_id: 'A' }],
    review_required: [{ local_project_id: null, source_ref: 'hub-bulk-hs-2026-08', record_key: 'pk' }, { local_project_id: null, source_ref: 'home-dump-x', record_key: 'HPR_1' }, { local_project_id: 'PRJ-11110-0001', source_ref: 'x', record_key: 'PRJ-11110-0001|PRJ-26110-0001' }],
    notices: [{ notice_system: 'APPLYHOME', notice_id: 'A', sgg_code: '26110' }, { notice_system: 'LH', notice_id: 'B', sgg_code: null }, { notice_system: 'HUG', notice_id: 'C', sgg_code: '26110' }, { notice_system: 'HUG', notice_id: 'D', sgg_code: '41281' }],
    areas: [{ area_code: '00' }, { area_code: '11' }, { area_code: '11110' }, { area_code: '26' }, { area_code: '26110' }], stat_facts: [{ sido_code: '00' }, { sido_code: '11' }, { sido_code: '26' }],
  };
  const r = H.keepSido(t);
  assert.deepEqual(t.projects.map((p) => p.local_project_id), ['PRJ-11110-0001']);
  assert.deepEqual([t.identifiers.length, t.complexes.length, t.events.length, t.notice_links.length], [1, 0, 0, 1]);
  assert.deepEqual(t.review_required.map((x) => x.record_key), ['HPR_1'], '사업 없는 비HOME 행·수도권 밖 사업을 가리키는 쌍은 뺀다');
  assert.deepEqual(t.notices.map((n) => n.notice_id), ['A', 'B', 'D'], '연결된 공고(A)·시군구 없는 공고(B)는 남기고 수도권 밖 시군구 공고(C)만 뺀다');
  /* 2026-10-20 결정: 지역·통계도 수도권만(전국 합계 '00' 포함 수도권 밖 행을 뺀다) */
  assert.deepEqual([t.areas.map((a) => a.area_code), t.stat_facts.map((r) => r.sido_code)], [['11', '11110'], ['11']], '지역·통계도 수도권 행만(전국 00 도 뺀다)');
  assert.deepEqual([r.removed.areas, r.removed.stat_facts], [3, 2]);
  assert.deepEqual([r.removedProjects, r.bySource], [1, { 'hub-bulk-hs-2026-08': 1 }]);
});

test('② issueHome: 수도권 밖 발급 사업은 숨긴다(대체된 사업은 그대로)', () => {
  const p = (id, sgg, extra = {}) => ({ id, sgg, stageCode: '06', name: id, bjdCodes: [], pnus: [], refs: [{ system: 'bundle', key: 'r', value: id }], issuedAt: '2026-10-01', ...extra });
  const registry = { counters: {}, projects: [p('PRJ-12170-0001', '12170'), p('PRJ-12170-0002', '12170', { supersededBy: 'PRJ-12170-0001' })] };
  const r = H.issueHome(registry, { tables: { projects: [], identifiers: [], project_locations: [], units: [] }, homeIds: {}, today: '2026-10-19', edition: 'E' });
  const out = Object.fromEntries(r.registry.projects.map((x) => [x.id, x]));
  assert.equal(out['PRJ-12170-0001'].hiddenAt, '2026-10-19');
  assert.match(out['PRJ-12170-0001'].hiddenReason, /^수도권만 제공/);
  assert.equal(out['PRJ-12170-0002'].hiddenAt, undefined);
  assert.equal(registry.projects[0].hiddenAt, undefined, '레지스트리 원본은 바꾸지 않는다');
});

test('③ 통계누리·LH 준공예정은 화면에 넘길 때 수도권으로: 합계 자리 00 = 서울+인천+경기(빈 달은 빈 값), 시도 = [수도권, 서울, 인천, 경기], LH 블록은 수도권만', () => {
  const C = require('../../lib/board/calc.ts');
  const molit = json('data/board/molit.json'), m = C.capitalMolit(molit);
  assert.deepEqual(m.sido, [{ code: '00', name: '수도권' }, ...molit.sido.filter((s) => CAP.includes(s.code))]);
  for (const [k, v] of Object.entries(molit.metrics)) {
    assert.deepEqual(Object.keys(m.metrics[k].series).sort(), ['00', ...CAP], k);
    m.metrics[k].series['00'].total.forEach((x, i) => {
      const parts = CAP.map((c) => v.series[c].total[i]);
      assert.equal(x, parts.some((y) => y === null) ? null : parts.reduce((a, b) => a + b, 0), `${k} ${molit.months[i]}`);
    });
    for (const a of Object.keys(v.series['11'].actors ?? {})) assert.equal(m.metrics[k].series['00'].actors[a].length, molit.months.length);
  }
  assert.equal(molit.sido[0].name, '전국', '원본 molit.json 은 전국 그대로(바꾸지 않는다)');
  const lh = json('data/board/lh-completion.json'), cl = C.capitalLh(lh);
  assert.ok(cl.blocks.length > 0 && cl.blocks.every((b) => CAP.includes(b.sido)));
  assert.deepEqual([cl.count, cl.units], [cl.blocks.length, cl.blocks.reduce((n, b) => n + b.units, 0)]);
  assert.match(src('lib/board/data.ts'), /molit: capitalMolit\(s\.molit\), lh: capitalLh\(s\.lh\)/);
});

test("④ 범위 글자 '수도권': 원장 범위(nation)·지시 카드에 '전국' 없음, 지역 공급·사업 화면에 전국 칩 없음, 월별 실적·월 상세·기관은 합계 자리 이름", () => {
  const D = require('../../lib/board/directives.ts');
  const L = json('data/board/ledger-board.json');
  assert.equal(D.nation(L), '수도권');
  assert.equal(D.nation({ scope: { coverage: 'NATIONWIDE' } }), '전국');
  const cards = D.makeDirectives({ sourceCount: 1, stageNames: ['계획', '인허가', '착공', '모집', '준공', '입주'], ledger: L, start: { year: '2026', upto: 8, cum: 1, cumLy: 1 }, bottleneck: () => null });
  const text = JSON.stringify(cards);
  assert.ok(!text.includes('전국'), text.match(/.{20}전국.{20}/)?.[0]);
  assert.ok(text.includes('통계누리 수도권 착공'));
  assert.equal(cards.find((c) => c.t === '일정 지연 관리').pair, undefined, '후보가 0이면 쌍 숫자 없음');
  assert.equal(D.ledgerMix(L), '수도권 HOME 289');   // 2026-10-22 새 덤프: 새 사업 1 · 2026-10-21 새 덤프: 새 사업 3 ·  2026-10-20 공공 분류 안2: 공공 공급만 377 → 285 · 2026-10-20 같은 현장 병합 6쌍(사업 −6·−4,138호)
  const region = src('app/(dashboard)/region/page.tsx'), projects = src('app/(dashboard)/projects/page.tsx');
  assert.match(region, /const ORDER = METRO;/);
  assert.ok(!/>전국<\/Chip>/.test(region) && !/>전국<\/Chip>/.test(projects), '전국 칩 없음');
  for (const f of ['components/board/RealPanels.tsx', 'app/(dashboard)/month/[id]/page.tsx', 'app/(dashboard)/agency/[id]/page.tsx']) assert.match(src(f), /sidoName\(molit, NATION\) \?\? '전국'/, f);
  assert.match(src('components/board/Board.tsx'), /scope=\{nation === '전국 아님' \? '일부 지역' : nation\}/);
});
