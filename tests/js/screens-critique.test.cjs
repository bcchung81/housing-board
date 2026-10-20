'use strict';
/* 화면 점검(impeccable critique 2026-10-14) 고침을 고정한다: 사업(/projects)·지역 공급(/region)·데이터 원본(/sources)·종합상황판 카드.
   단계 번호 한 체계 · 같은 이름 = 같은 값(병목) · 보조 줄 산수 · 기본 정렬·기본 범위(수도권) · 칩 줄 구성 · 빈 결과 회복 · 지도 연결점(mapHref) · 언어. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const V = require('../../lib/board/projects-view.ts');
const R = require('../../lib/board/region.ts');
const RQ = require('../../lib/board/requirements.ts');
const { makeDirectives } = require('../../lib/board/directives.ts');
const MAP = require('../../data/board/ledger-map.json');
const IDX = require('../../data/board/projects-index.json');
const PP = require('../../data/board/policy-progress.json');
const BOARD = require('../../data/board/ledger-board.json');
const MOLIT = require('../../data/board/molit.json');
const calendar = require('../../data/board/region-calendar.json');
const regionMap = require('../../data/board/region-map.json');
const annual = require('../../data/board/region-annual.json');
const reqs = require('../../data/board/requirements.json');

const rows = V.rowsOf(MAP.bySgg, IDX.projects, IDX.sgg);
const sidoName = (c) => MOLIT.sido.find((x) => x.code === c)?.name ?? c;
const ctx = { pp: PP, policies: IDX.policies, observedMonth: IDX.observedMonth, sidoName, sggName: (c) => (IDX.sgg[c] ?? c).split(' ').slice(1).join(' ') };
const Q = (f) => Object.fromEntries(V.questionsOf(rows, f, ctx).map((q) => [q.q, q]));
const fctx = { policies: IDX.policies, programs: IDX.programs, sidoOk: (c) => !!MOLIT.sido.find((x) => x.code === c) };
const num = (t) => Number(t.replace(/,/g, ''));

test('단계 번호는 한 체계(①~⑥ 리본 칸): 서랍 단계 줄·목록 알약·타임라인·지역 공급 종류가 같은 이름이고, 공식 01~06 은 보조 표기뿐', () => {
  const steps = read('components/projects/StageSteps.tsx'), det = read('components/projects/ProjectDetail.tsx'), tl = read('components/projects/StageTimeline.tsx');
  assert.match(steps, /BOARD_NAMES\.map/);
  assert.doesNotMatch(det + steps, /STAGES\.map|s\.code\}/, '서랍에 공식 번호를 머리 글자로 그리지 않는다');
  assert.match(tl, /\{BOARD_CIR\[l\.board\]\} \{BOARD_NAMES\[l\.board\]\}/);
  assert.deepEqual(['SUPPLY_NOTICE', 'COMPLETION', 'MOVE_IN'].map((k) => R.CAL_TYPE[k].name), V.BOARD_NAMES.slice(3), '지역 공급 종류 = ④⑤⑥ 이름');
  assert.equal(V.BOARD_OFFICIAL.length, 6, '공식 01~06 은 title 에만(보이는 보조 표기 없음 — screens-terms)');
  /* '모집'과 '분양'을 섞지 않는다: 지역 공급 실적 칩·종합상황판 실적 흐름도 '모집' */
  assert.match(read('components/region/Annual.tsx'), /sale: '모집'/);
  assert.match(read('components/board/RealPanels.tsx'), /sale: '모집'/);
});

test("같은 이름 = 같은 값: 병목(지연 호수가 가장 큰 단계)은 종합상황판 카드·리본과 사업 '어디서 막혀 있는가'가 같은 함수(bottleneckOf)로 같은 값을 낸다", () => {
  assert.deepEqual(V.delayByStageOf(rows), BOARD.delayByStage, '사업 행에서 다시 센 단계별 지연 호수 = 원장 집계');
  const neck = V.bottleneckOf(BOARD.delayByStage);
  assert.deepEqual(neck, { i: 2, units: 1666 }, 'D3: 번호 있는 사업의 지연만(옛 ② 인허가 83,715호는 후보 포함)');
  const card = makeDirectives({ sourceCount: 19, stageNames: V.BOARD_NAMES, ledger: BOARD, start: { year: '2026', upto: 8, cum: 1, cumLy: 1 }, bottleneck: V.bottleneckOf })[2];
  const q = Q({})['어디서 막혀 있는가'];
  assert.equal(card.m, `병목 착공 ${neck.units.toLocaleString('en-US')}호`);
  assert.equal(q.value, '③ 착공');
  assert.equal(q.sub, `병목 · 지연(장기 포함) ${neck.units.toLocaleString('en-US')}호`, '전국 범위에서 카드와 같은 숫자');
  assert.equal(V.bottleneckOf([0, 0, 0, 0, 0, 0]), null);
  const board = read('components/board/Board.tsx');
  assert.match(board, /bottleneck: bottleneckOf/);
  assert.doesNotMatch(board, /argmax\(/, '리본 툴팁·병목 표지도 같은 함수');
  assert.doesNotMatch(read('lib/board/directives.ts'), /argmax/);
});

test('보조 줄 산수: 머리 숫자 = 보조 줄 숫자의 합(지연 + 장기), 주의는 넣지 않는다 — 여러 범위', () => {
  for (const f of [{}, { metro: true }, { sido: '26' }, { policy: IDX.policies[0] }]) {
    const q = Q(f)['어떤 사업이 늦어지는가'];
    const m = /^지연 6~12개월 ([\d,]+) · 장기 12개월\+ ([\d,]+)(?: · 확인 필요\(후보\) [\d,]+)?$/.exec(q.sub);   // 확인 필요(후보)는 머리 숫자 밖(D3)
    assert.ok(m, q.sub);
    const parts = [num(m[1]), num(m[2])];
    assert.equal(num(q.value), parts[0] + parts[1], JSON.stringify(f));
  }
});

test('기본 범위·기본 정렬: 쿼리 없이 열면 수도권, 명시적 ?sido·?sgg 는 그대로, 종합상황판 링크(?stage·?status·?agency 만)는 전국 · 목록은 점검 필요 순', () => {
  assert.deepEqual(V.parseFilters({}, fctx), { metro: true });
  assert.deepEqual(V.parseFilters({ id: 'PRJ-11110-0001' }, fctx), { metro: true }, '서랍 주소만 있어도 기본 범위');
  assert.deepEqual(V.parseFilters({ sido: 'all' }, fctx), {});
  assert.deepEqual(V.parseFilters({ sido: '26' }, fctx), { sido: '26' });
  assert.deepEqual(V.parseFilters({ stage: '1' }, fctx), { stage: 1 }, '종합상황판 병목 단계 링크 = 전국');
  assert.deepEqual(V.parseFilters({ agency: 'lh' }, fctx), { agency: 'lh' });
  assert.deepEqual(V.parseFilters({ stage: '1', sido: 'metro' }, fctx), { metro: true, stage: 1 });
  /* 주소는 다시 읽어도 같은 거르기 */
  for (const q of [{}, { sido: 'all' }, { sido: 'metro', status: 'check' }, { stage: '2' }, { sgg: '41500', status: 'delay' }, { sido: '11', agency: 'sh' }]) {
    const f = V.parseFilters(q, fctx), href = V.listHref(f), back = V.parseFilters(Object.fromEntries(new URLSearchParams(href.split('?')[1] ?? '')), fctx);
    assert.deepEqual(back, f, href);
  }
  const metro = V.applyFilters(rows, { metro: true });
  assert.equal(metro.length, rows.filter((r) => ['11', '28', '41'].includes(r.sgg.slice(0, 2))).length);
  assert.deepEqual(V.applyFilters(rows, {}).map((r) => r.id), metro.map((r) => r.id), '2026-10-19 수도권 한정: ?sido=all(거르기 없음)도 수도권과 같은 목록');
  const list = V.listOrder(metro);
  assert.ok(list.every((r, i) => i === 0 || (V.lateOf(list[i - 1]) ?? -1) >= (V.lateOf(r) ?? -1)), '지연 개월 큰 순');
  const page = read('app/(dashboard)/projects/page.tsx');
  assert.match(page, /const list = listOrder\(applyFilters\(rows, f\)\);/, '상태와 상관없이 기본 순서 = 점검 필요 순');
  /* 지역 공급도 처음은 수도권 */
  const region = read('app/(dashboard)/region/page.tsx');
  // 2026-10-19 수도권 한정: ?sido=all(전국)이 없어졌다 — 목록에 없는 값(옛 all·수도권 밖 코드)은 모두 'metro'
  assert.match(region, /const sido = q\.sido && ORDER\.includes\(q\.sido\) \? q\.sido : 'metro';/);
  assert.ok(!R.aheadAll(calendar, 'metro', sidoName).some((e) => !/^(서울|인천|경기) /.test(e.place)));
  assert.match(region, /if \(sd !== 'metro'\) s\.set\('sido', sd \|\| 'all'\);/);
  assert.equal(R.aheadAll(calendar, 'metro', sidoName).length, ['11', '28', '41'].reduce((n, c) => n + (calendar.sido[c] ?? []).length, 0));
  assert.ok(R.aheadAll(calendar, 'metro', sidoName).every((e) => /^(서울|인천|경기) /.test(e.place)), '수도권 목록은 시도 이름을 붙인다');
  const v = R.viewOf(regionMap, 'metro');
  for (const c of ['11', '28', '41']) { const w = regionMap.view[c]; assert.ok(v[0] <= w[0] && v[1] <= w[1] && v[0] + v[2] >= w[0] + w[2] && v[1] + v[3] >= w[1] + w[3], c); }
  assert.equal(R.viewOf(regionMap, ''), null);
  const my = R.metroYears(MOLIT, annual, 'complete');
  for (const y of my.filter((x) => x.value !== null)) assert.equal(y.value, ['11', '28', '41'].reduce((t, c) => t + R.regionYears(MOLIT, annual, 'complete', c).years.find((z) => z.year === y.year).value, 0), String(y.year));
  assert.equal(my[0].year, 2018, '수도권은 2018년부터');
});

test('칩 줄: 단계 칩 없음(파이프라인 칸으로) · 상태는 점검 필요 + 메뉴 · 수도권 칩(전국 칩 없음) · 모두 풀기 · 요구사항은 칩 하나로 접는다', () => {
  const page = read('app/(dashboard)/projects/page.tsx');
  const bar = page.slice(page.indexOf('<ChipBar'), page.indexOf('</ChipBar>'));
  assert.doesNotMatch(bar, /BOARD_NAMES\.map/);
  assert.match(bar, />수도권<\/Chip>/);
  assert.doesNotMatch(bar, />전국<\/Chip>/, '2026-10-19 수도권 한정: 전국 칩 없음');
  assert.match(bar, />점검 필요<\/Chip>/); assert.match(bar, /<ChipMenu label="상태"/);
  assert.doesNotMatch(bar, /STATUS_ORDER\.map\(statusChip\)/, '상태 칩 5개를 늘어놓지 않는다');
  assert.match(bar, /<Chip href="\/projects"[^>]*>모두 풀기<\/Chip>/);
  assert.ok((bar.match(/<Chip /g) ?? []).length <= 9, '보이는 칩은 몇 개뿐');
  const tags = read('components/ReqTags.tsx');
  assert.match(tags, /요구사항 \{list\.length\}/);
  assert.match(tags, /<details/, '누르면 펼친다(F 번호는 펼친 목록 안에서만)');
  assert.doesNotMatch(read('components/projects/Summary.tsx') + page, /F-0\d/);
});

test('빈 결과 회복: 거르기 풀기·수도권 전체 보기 등 건수가 있는 대안만 보이고, 후보 사업은 간단 보기로 연다는 것을 보이는 글로', () => {
  const page = read('app/(dashboard)/projects/page.tsx');
  assert.match(page, /이 조건의 사업이 없습니다/);
  for (const t of ['상태·단계 거르기 풀기', '수도권 전체 보기', '정책·기관 거르기 풀기', '모두 풀기']) assert.ok(page.includes(t), t);
  assert.match(page, /\.filter\(\(a\) => a\.n > 0\)/);
  assert.match(page, /\$\{CAND_NAME\} \$\{fmt\(list\.length - issued\)\}건 뒤쪽/);
  assert.match(page, /\$\{CAND_NAME\}은 간단 보기\(번호가 있는 사업 뒤\)/, '풀어 쓴 안내는 목록 머리 줄 title');
  /* 실제 자료: 수도권 + 장기 지연 + ⑤준공 은 비고, 상태·단계를 풀면 사업이 있다 */
  const f = { metro: true, status: 'long', stage: 4 };
  assert.equal(V.applyFilters(rows, f).length, 0);
  assert.ok(V.applyFilters(rows, { metro: true }).length > 0);
  assert.match(read('components/region/Ahead.tsx'), /\(후보\) = 사업 번호가 아직 없는 후보 사업 · 누르면 간단 보기/);
});

test('지도 연결점: 화면은 지도 주소를 mapHref 한 곳으로 만들고 <a>(문서 이동)로 연다 — 서랍·목록 행·지역 공급 목록과 원·LH 블록 표·시도만 고른 지도 링크(시군구 고르기)', () => {
  const files = ['components/projects/ProjectDetail.tsx', 'components/region/Ahead.tsx', 'app/(dashboard)/agency/[id]/page.tsx'];
  for (const f of files) {
    const s = read(f);
    assert.match(s, /import \{ mapHref \} from '@\/lib\/board\/map-href'/, f);
    assert.doesNotMatch(s, /`\/map\?(project|sgg)=/, `${f}: 지도 주소를 직접 쓰지 않는다`);
  }
  const det = read('components/projects/ProjectDetail.tsx');
  assert.match(det, /<MapLink href=\{mapHref\(\{ project: r\.id \}\)\}/);
  assert.match(det, /지도에서 보기 · \$\{loc\}/, '위치 종류(블록·지번·지구·근사·미확보)를 짧게');
  assert.doesNotMatch(det, />기반시설 점검</);
  const page = read('app/(dashboard)/projects/page.tsx');
  assert.match(read('lib/board/projects-list.ts'), /if \(!isMetro\(r\.sgg\)\) return null;[\s\S]*return noLoc[\s\S]*\{ text: '지도', href: mapHref\(\{ project: r\.id \}\), doc: true, icon: 'map'/, '목록 행 지도 표지는 수도권 사업만');
  assert.match(page, /import \{ mapScopeHref \} from '@\/lib\/board\/map-href'/);
  /* mapHref = 사업 창의 '지도로 돌아가기'(from=map) — 창 관리자(2026-10-19) */
  const host = read('components/windows/WindowHost.tsx');
  assert.match(host, /import \{ mapHref \} from '@\/lib\/board\/map-href'/);
  assert.doesNotMatch(host, /`\/map\?|: '\/map'/, '지도 주소는 map-href 한 곳');
  assert.doesNotMatch(page, /`\/map\?|: '\/map'/, '지도 주소는 map-href 한 곳');
  const grid = read('components/ui/data-grid.tsx');
  assert.match(grid, /o\.doc \? <a href=\{o\.href\}/);
  const ahead = read('components/region/Ahead.tsx');
  assert.match(ahead, /onMap\(e\) \? <a href=\{mapHref\(\{ project: e\.id \}\)\}/);
  assert.match(ahead, /sel && onMap\(sel\) \? \(\s*<a href=\{mapHref\(\{ project: sel\.id \}\)\}/);
  /* 주소 → 시군구(LH 블록) */
  assert.equal(V.sggOfAddress('경기도 성남시 수정구 창곡동 A2-7블록', '41', IDX.sgg), Object.entries(IDX.sgg).find(([, n]) => n === '경기도 성남시 수정구')[0]);
  assert.equal(V.sggOfAddress('없는 주소', '41', IDX.sgg), null);
});

test('언어: 판 번호·HOME 덤프·렌즈·검토 중·기준선 없음 대신 짧은 말 · 정책은 "9·7 대책" · 요구사항 지시 날짜는 시간순', () => {
  const page = read('app/(dashboard)/projects/page.tsx'), det = read('components/projects/ProjectDetail.tsx'), sum = read('components/projects/Summary.tsx');
  const vis = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\.replace\(\/HOME 덤프\/g, '사업 원장\(HOME\)'\)/g, '');   // 출처 이름 속 'HOME 덤프'를 바꾸는 코드는 뺀다
  for (const [f, s] of [['page', page], ['detail', det], ['summary', sum]]) {
    assert.doesNotMatch(vis(s), /HOME 덤프|기준선 없음|>검토 중|'검토 중'|판 \$\{/, f);
  }
  assert.equal(V.policyLabel({ short: '9·7' }), '9·7 대책');
  assert.equal(V.editionText('20261014T102506Z'), '2026.10.14');
  for (const r of reqs.items) assert.deepEqual(RQ.datesOf(r), [...r.dates].sort(), r.id);
  assert.match(read('components/sources/Requirements.tsx'), /datesOf\(r\)\.map/);
});

test('읽는 법(ⓘ 하나의 정의들)과 진행 표지: 지연 구간 · 확인과 담당자 추정 · 이 단계까지 온 사업과 지금 · 병목 · 앞으로 12개월, 칩·서랍 이동 중에는 가벼운 표지', () => {
  const sum = read('components/projects/Summary.tsx');
  for (const t of ['<dt>{DELAY_GROUP}</dt>', '<dt>확인 · 담당자 추정 포함</dt>', '<dt>이 단계까지 온 사업 · 지금 이 단계</dt>', '<dt>병목</dt>', '<dt>{AHEAD_COMPLETION}</dt>']) assert.ok(sum.includes(t), t);
  assert.match(read('app/(dashboard)/projects/page.tsx'), /<ReadHelp \/>/);
  assert.match(sum, /지금 이 단계 <b>\{fmt\(c\.now\)\}<\/b>/, '파이프라인 칸 안에 지금 건수');
  assert.match(sum, /이 단계까지 온 사업 \{fmt\(c\.n\)\}/);
  const p = V.pipelineOf(V.applyFilters(rows, {}, 'stage'));
  assert.ok(p.open.every((c) => c.now === rows.filter((r) => r.board === c.i).length), '지금 = 칸을 누르면 거르는 건수');
  assert.match(read('components/ui/link-pending.tsx'), /useLinkStatus/);
  assert.match(read('components/ui/chips.tsx'), /<LinkPending \/>/);
  assert.match(read('components/ui/data-grid.tsx'), /startGoing\(\(\) => router\.push/);
});
