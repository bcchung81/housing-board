'use strict';
/* 데이터 표기 고침 2(종합상황판 / · 사업 /projects · 지역 공급 /region): 전 화면 데이터 점검 #3·#21·#25·#27·#15·#16·#17·#18·#19·#24·#28·#7 과
   사용자 결정 D1(예정일이 기준일보다 지났지만 실적 기록이 없고 경과 1개월 미만이면 상태는 그대로, '예정일 지남' 표지만). 판정·건수 불변식도 함께 고정한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/* projects-list.ts 는 같은 폴더 모듈을 확장자 없이 부른다 — 시험에서만 '.ts' 를 붙여 찾는다(screens-a3 와 같다) */
require('node:module').registerHooks({ resolve(s, c, n) { try { return n(s, c); } catch (e) { if (/^\.\.?\//.test(s)) return n(`${s}.ts`, c); throw e; } } });
const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const V = require('../../lib/board/projects-view.ts');
const L = require('../../lib/board/projects-list.ts');
const R = require('../../lib/board/region.ts');
const M = require('../../lib/board/metro-overview.ts');
const S = require('../../lib/grid/spec.ts');
const { makeDirectives } = require('../../lib/board/directives.ts');
const MAP = require('../../data/board/ledger-map.json');
const IDX = require('../../data/board/projects-index.json');
const PP = require('../../data/board/policy-progress.json');
const BOARD = require('../../data/board/ledger-board.json');
const DET = require('../../data/board/project-detail.json');
const calendar = require('../../data/board/region-calendar.json');

const rows = V.rowsOf(MAP.bySgg, IDX.projects, IDX.sgg);
const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
const ctx = { policies: IDX.policies, programs: IDX.programs, sidoOk: () => true, guOf: M.guOf };
const pf = (q) => V.parseFilters(q, ctx);
const sido = (c) => ({ 11: '서울', 28: '인천', 41: '경기' })[c] ?? c;

test('#3·D1 현재 예정: 경과 1개월 미만으로 지난 예정은 그 날짜 + \'예정일 지남\'(빈칸 0), 상태는 그대로', () => {
  const past = rows.filter((r) => V.pastDueOf(r));
  assert.equal(past.length, 4);   // 2026-10-19 수도권 한정: 예정일 지남 29 → 4(수도권 밖 사업 25곳이 빠짐)
  for (const r of past) {
    const n = V.nextOf(r);
    assert.ok(n, r.id);
    assert.equal(n.tag, V.PAST_DUE);
    assert.equal(n.text, `${V.ymText(r.overdue.planned)} ${V.NEXT_NAME[r.overdue.eventType]}`);
    assert.equal(V.statusOf(r), r.issued ? r.cls : 'review', '상태 판정은 바꾸지 않는다(번호가 없는 후보는 확인 필요 — D3)');
  }
  assert.equal(V.PAST_DUE, '예정일 지남');
  assert.equal(R.PAST_DUE, V.PAST_DUE, '지역 공급과 같은 말');
  assert.equal(rows.filter((r) => r.cls && !V.nextOf(r)).length, 0, '판정 사업의 현재 예정 빈칸 0(전 20행)');
  /* 계양 A2·A3 은 원천 날짜 다름(D2: HOME 10.11 · LH 10.31) 표지가 꼬리표 끝에 붙는다 */
  for (const [id, tag] of [['PRJ-28245-0055', '예정일 지남 · 원천 날짜 다름(LH 2026.10.31)'], ['PRJ-28245-0057', '예정일 지남 · 원천 날짜 다름(LH 2026.10.31)'], ['PRJ-41131-0048', '예정일 지남']]) {
    const r = byId[id], cell = L.nextCell(r);
    assert.equal(cell.tag, tag, `${id} 목록 칸`);
    assert.match(cell.text, /^2026\.10 준공$/);
    assert.equal(V.statusOf(r), 'ok');
    assert.equal(S.csvValue(cell, 'text'), `2026.10 준공 (${tag})`, 'CSV 도 같은 값');
  }
  assert.equal(L.nextCell(byId['PRJ-28290-0058']).tag, '원천 날짜 다름(LH 2028.12)', '지연 행(지연 열이 있는 목록)은 경과 꼬리표 없이 옅게 — 원천 날짜 다름만');
  assert.match(V.nextOf(byId['PRJ-28290-0058']).tag, /^경과 \d+개월$/, '간단 보기의 지연 꼬리표는 그대로');
  assert.match(read('components/projects/ProjectDetail.tsx'), /pastDueOf\(r\) \?[\s\S]*\{PAST_DUE_UNDER\}/, '서랍 머리에도 표지(2026-10-16: \'예정일 지남(1개월 미만)\' — r2-screens 2)');
  assert.match(read('components/projects/Candidate.tsx'), /next = nextOf\(r\)/, '간단 보기는 nextOf 그대로');
  assert.match(read('app/(dashboard)/projects/page.tsx'), /ev: nextCell\(r\)/, '인쇄 표도 nextCell');
});

test('#21 상태 이름: 판정 없음을 준공 완료 · 판정 일정 없음 · 일정 없음으로 나누고 범주·건수는 그대로', () => {
  const none = rows.filter((r) => V.statusOf(r) === 'none');
  // 2026-10-19 수도권 한정: 판정 없음 309 → 93(판정 일정 없음 14 → 13 전부 수도권, 준공 완료 73 → 0 — 건축HUB 후보가 빠져 HOME 행엔 준공 완료 표시가 없다, 일정 없음 80)
  assert.equal(none.length, 93);
  const by = (k) => none.filter((r) => V.noneKind(r) === k);
  assert.equal(by('plan').length, 13);
  assert.equal(by('plan').filter((r) => V.isMetro(r.sgg)).length, 13);
  assert.equal(by('done').length, 0);
  assert.equal(by('none').length, 80);
  assert.ok(by('done').every((r) => r.done));
  const doneRow = { ...none[0], done: '2026-01', next: null };   // 준공 완료 이름은 합성 행으로 확인(원장엔 해당 행이 없다)
  assert.deepEqual([V.statusLabel(doneRow), V.statusLabel(by('plan')[0]), V.statusLabel(by('none')[0])], ['준공 완료', '판정 일정 없음', '일정 없음']);
  assert.equal(L.statusCell(by('plan')[0]).text, '판정 일정 없음');
  assert.equal(V.STATUS_NAME.none, '판정 없음');
  assert.equal(V.STATUS_RANGE.none, '판정 없음', '칩 이름(묶음)');
  const page = read('app/(dashboard)/projects/page.tsx');
  assert.match(page, /<dt>상태<\/dt><dd>[\s\S]*NONE_NAME\.done[\s\S]*NONE_NAME\.plan[\s\S]*NONE_NAME\.none/, '목록 읽는 법 ⓘ 에 상태 정의');
  /* D3(2026-10-15): 번호가 없는 후보는 확인 필요 — 2026-10-19 수도권 한정: 후보 1,839건(옛 정상 1,442 · 주의 84 · 지연 96 · 장기 217)이 원장에서 빠져 review 0 */
  const st = {}; for (const r of rows) st[V.statusOf(r)] = (st[V.statusOf(r)] ?? 0) + 1;
  assert.deepEqual(st, { none: 93, ok: 165, long: 2, caution: 2 }, '상태 건수(review 없음)');
  const calc = {}; for (const r of rows) calc[V.calcOf(r)] = (calc[V.calcOf(r)] ?? 0) + 1;
  assert.deepEqual(calc, { none: 93, ok: 165, long: 2, caution: 2 }, '같은 계산(번호와 상관없이) — 후보가 없어 상태와 같다');
});

test('#25 시 단위 코드: 구가 있는 경기 시는 구 사업을 합치고, 지도 개요와 같은 건수', () => {
  for (const [city, n] of [['41280', 10], ['41110', 7]]) {
    const f = pf({ sgg: city });
    assert.deepEqual(f.gu, M.guOf(city));
    const got = V.applyFilters(rows, f);
    assert.equal(got.length, n, city);
    assert.equal(got.length, rows.filter((r) => M.unitOf(r.sgg) === city).length, `${city} = 개요 면(unitOf)`);
  }
  assert.equal(pf({ sgg: '41281' }).gu, undefined, '구 코드는 그 구만');
  assert.equal(V.applyFilters(rows, pf({ sgg: '41281' })).length, 8);
  assert.equal(pf({ sgg: '41150' }).gu, undefined, '구 없는 시는 그대로');
  const page = read('app/(dashboard)/projects/page.tsx');
  assert.match(page, /parseFilters\(q, \{[^}]*guOf \}\)/);
  assert.match(read('app/(dashboard)/projects/csv/route.ts'), /parseFilters\(q, \{[^}]*guOf \}\)/, 'CSV 도 같은 거르기');
  assert.match(page, /function sggFullName[\s\S]*\$\{METRO_AREAS\[code\]\}\(\$\{gu\.map/, "이름 '고양시(덕양구·일산동구·일산서구)'");
  assert.deepEqual(M.guOf('41280').map((c) => M.METRO_AREAS[c].slice(M.METRO_AREAS['41280'].length).trim()), ['덕양구', '일산동구', '일산서구']);
});

test('#27 위치 미확보: 서랍과 같은 상세 자료에 좌표가 없는 수도권 사업은 지도 열에 표지(링크는 유지)', () => {
  const metro = rows.filter((r) => V.isMetro(r.sgg));
  const noLoc = metro.filter((r) => DET.projects[r.id] && !DET.projects[r.id].loc);
  assert.equal(noLoc.length, 26);
  const check = metro.filter(V.isCheck);
  assert.equal(check.length, 4);
  assert.ok(check.every((r) => !DET.projects[r.id].loc), '수도권 점검 필요 4건은 모두 위치 미확보');
  const c = L.mapCell(check[0], true);
  assert.equal(c.text, L.NO_LOC);
  assert.equal(c.text, '위치 미확보');
  assert.match(c.href, /project=/);
  assert.match(c.title, /시군구로 보임/);
  assert.equal(L.mapCell(check[0]).icon, 'map', '좌표가 있으면 지도 표지 그대로');
  // 2026-10-19 수도권 한정: 원장에 수도권 밖 행이 없다 → 모든 행이 수도권이고, 수도권 밖 시군구 코드(합성 행)는 여전히 빈칸
  assert.equal(rows.every((r) => V.isMetro(r.sgg)), true);
  assert.equal(L.mapCell({ ...check[0], sgg: '26110' }, true), null, '수도권 밖은 빈칸');
  /* 2026-10-16 2차 평가: 판정은 지도와 같은 기준(mapLocOf — 번들 블록·동과 이어진 계양 A2 등은 확보) — r2-screens 1 */
  assert.match(read('app/(dashboard)/projects/page.tsx'), /getProjectDrawer\(r\.id\)[\s\S]*!mapLocOf\(d\.row, d\.detail\.loc\)/, '서랍과 같은 원천(getProjectDrawer)·같은 판정');
});

test('#15 날짜 점 표기: 종합상황판·사업·지역 공급 title 의 하이픈 날짜', () => {
  const board = read('components/board/Board.tsx');
  assert.match(board, /const scope = `원장 \$\{ymDot\(L\.observedMonth\)\} 기준/);
  assert.match(board, /판정 기준일 \$\{dotDates\(SJ\.referenceDate\)\}/);
  assert.match(board, /파일 기준일\(\{dotDates\(real\.lhAsOf\)\}\)/);   // (i) 팝오버 글(2026-10-16 3차)
  assert.doesNotMatch(board, /2026-07부터/);
  const L_ = makeDirectives({ sourceCount: 1, stageNames: ['a', 'b', 'c', 'd', 'e', 'f'], ledger: BOARD, start: { year: '2026', upto: 8, cum: 1, cumLy: 1 }, bottleneck: () => null });
  for (const d of L_.slice(1)) assert.doesNotMatch(d.basis, /\b20\d\d-\d\d\b/, `${d.t} 카드 title`);
  assert.match(L_[3].basis, /향후 12개월\(2026\.10~2027\.09\)/);
  const page = read('app/(dashboard)/projects/page.tsx');
  assert.match(page, /title=\{`사업 원장 \$\{ymText\(idx\.observedMonth\)\} · 기준일 \$\{ref\}/);
  const region = read('app/(dashboard)/region/page.tsx');
  assert.match(region, /원장 기준일 \$\{calendar\.referenceDate\.replace\(\/-\/g, '\.'\)\} · 통계누리 실적 \$\{ymDot\(last\)\}까지/);
  /* 지역 공급 예정 목록도 점 표기 하나(2026-10-16 2차 평가 — '10월 11일'·'10월 중'·'2026년 10월' 대신 2026.10.11·2026.10, r2-screens 8) */
  assert.match(read('components/region/Ahead.tsx'), /const dayText = \(e: Pick<AheadEntry, 'day' \| 'ym'>\) => \(W\.date === 'ko' \? koDay\(e\) : aheadDay\(e\)\);/);
  assert.equal(S.dotDates('2026-10-13'), '2026.10.13');
});

test('#16 단위 건: 종합상황판 카드·향후 12개월', () => {
  const d = makeDirectives({ sourceCount: 1, stageNames: ['a', 'b', 'c', 'd', 'e', 'f'], ledger: BOARD, start: { year: '2026', upto: 8, cum: 1, cumLy: 1 }, bottleneck: () => null });
  // 2026-10-19 수도권 한정: 사업 2,317건 → 262건, 후보 계산 313건이 빠져 지연 카드는 쌍 숫자 없이 '지연 2건'(옛 315건 = 2 + 후보 313)
  assert.equal(d[1].m, '262건');
  assert.equal(d[4].m, '지연 2건', 'D3: 사업 번호가 있는 사업만, 후보 0이면 쌍 숫자 없음');
  assert.ok(d.every((x) => !/사업$/.test(x.u)));
  const board = read('components/board/Board.tsx');
  assert.match(board, /\{f\(upProj\)\}건<\/span>/);
  assert.doesNotMatch(board, /\}사업/);
  assert.equal(BOARD.upcoming.reduce((n, m) => n + m.projects, 0), 24);   // 2026-10-19 수도권 한정: 414 → 24곳
});

test('#17 기관별 진행 비중은 소수 1자리', () => {
  assert.match(read('components/board/Board.tsx'), /\(J\.delay\.units \? a\.delayUnits \/ J\.delay\.units \* 100 : 0\)\.toFixed\(1\)\}%/);
  assert.doesNotMatch(read('components/board/Board.tsx'), /Math\.round\(a\.delayUnits/);
});

test("#18 기관 이름: 사업 화면 '기타' → 종합상황판과 같은 '기관 미상'", () => {
  assert.equal(V.AGENCY_NAME.etc, '기관 미상');
  assert.equal(BOARD.agencies.find((a) => a.id === 'unknown').name, V.AGENCY_NAME.etc);
  assert.equal(V.applyFilters(rows, { agency: 'etc' }).length, BOARD.agencies.find((a) => a.id === 'unknown').projects, '같은 범주(수도권 HOME 105건 — 2026-10-19 수도권 한정, 전엔 2,020건)');
  assert.deepEqual(L.agencyCell(rows.find((r) => !r.agency)), { text: '기관 미상', muted: true });
  assert.ok(!Object.values(V.AGENCY_NAME).includes('기타'));
});

test('#19 지역 공급 합계는 정확한 호수(축 눈금만 근삿값), 달 막대 근삿값은 title 에 정확한 값', () => {
  const page = read('app/(dashboard)/region/page.tsx');
  assert.match(page, /\{fmt\(list\.length\)\}건 · \{fmt\(units\)\}호/);
  assert.doesNotMatch(page, /man\(/);
  const ahead = read('components/region/Ahead.tsx');
  assert.match(ahead, /title=\{`\$\{monthLabel\(x\)\} \$\{xs\.length\}\$\{W\.count\} \$\{fmt\(tot\[i\]\)\}호/);
  const metro = R.aheadAll(calendar, 'metro', sido);
  assert.equal(metro.reduce((s, e) => s + e.units, 0), 27494, '수도권 12개월 예정 합(정확한 값)');
});

test('#24 지연율 기준 표기: 시도 타일·선택 시점 막대 모두 호수 기준(2026-10-16 3차 — 한 화면 한 기준)', () => {
  const board = read('components/board/Board.tsx');
  assert.match(board, />지연율 · 호수 기준</);
  assert.match(board, /data-slot="basis-tag"[^>]*>호수 기준</);
});

test('#28 원천이 추가된 달은 추이 증감 대신 비교 불가', () => {
  // 2026-10-19 수도권 한정: 2026.10 에 추가됐던 원천 행이 모두 비수도권 사업 몫이라 trend.addedSources 가 한 달도 없다 — 집계 쪽 기록은 비고, 화면 코드(비교 불가 표지)는 그대로 남는다
  const added = BOARD.trend.filter((t) => t.addedSources?.length).map((t) => t.month);
  assert.deepEqual(added, []);
  const board = read('components/board/Board.tsx');
  assert.match(board, /amSel = AM\.find\(\(a\) => a\.m === judgedAt\(T, cc\)\)/);
  assert.match(board, /amSel \? <span[^>]*>비교 불가<\/span> : <span[^>]*>\{sg\(dv\)\}<\/span>/);
});

test('#12 앞으로 12개월 이름에 범위', () => {
  assert.equal(V.AHEAD_COMPLETION, '앞으로 12개월 · 준공 예정');
  assert.equal(V.AHEAD_ALL, '앞으로 12개월 · 모집·준공·입주 예정');
  assert.match(read('components/board/Board.tsx'), />\{AHEAD_COMPLETION\}<\/h2>/);
  assert.match(read('app/(dashboard)/region/page.tsx'), /`앞으로 12개월 · \$\{kinds\.map/);
});

test('D1 지역 공급: 기준일보다 앞선 예정은 표지만, 합계에는 그대로', () => {
  const ref = calendar.referenceDate;
  const past = Object.values(calendar.sido).flat().filter((e) => R.pastDue(e, ref));
  // 2026-10-19 수도권 한정: 6건(광주·충남 두정동·제주 포함) → 수도권 3건
  assert.deepEqual(past.map((e) => `${e.name}|${e.day}`).sort(), [
    '민간참여) 성남신촌 A-1BL 민간참여 공공주택 건설사업|2026-10-12',
    '인천계양(공공주택) A2|2026-10-11', '인천계양(공공주택) A3|2026-10-11'].sort());
  assert.equal(R.pastDue({ day: ref }, ref), false, '기준일 당일은 예정');
  assert.equal(R.pastDue({ day: null }, ref), false, '날짜 없는 달 예정은 표지 없음');
  const ahead = read('components/region/Ahead.tsx');
  assert.match(ahead, /past\(e\) \? <>[\s\S]*data-slot="past-due"[\s\S]*\{W\.past\}/, '목록 행 표지');
  assert.match(ahead, /past\(hud\.e\) \? ` \$\{W\.past\}`/, 'HUD');
  assert.match(ahead, /합계에는 그대로 넣음/);
  const page = read('app/(dashboard)/region/page.tsx');
  assert.match(page, /refDate=\{calendar\.referenceDate\}/);
  assert.match(page, /const units = list\.reduce\(\(s, e\) => s \+ e\.units, 0\);/, '합계는 그대로');
  assert.match(page, /이 합계에 들어 있음/);
});

test('불변식: 지연 2건(D3 — 번호 있는 사업만, 수도권 한정으로 후보 0) = 사업 지연(장기 포함) · 9·7 8,049·4,732·8,742 · 수도권 227,976호·262건 · CSV = 목록', () => {
  assert.equal(BOARD.judgment.delay.projects, 2);
  assert.equal(BOARD.judgment.delay.projects + BOARD.judgment.candidate.delay.projects, 2);   // 2026-10-19 수도권 한정: 315 = 2 + 313 → 2 + 0
  const all = V.applyFilters(rows, pf({ sido: 'all' }));
  assert.equal(all.filter((r) => ['delay', 'long'].includes(V.statusOf(r))).length, 2);
  const q = Object.fromEntries(V.questionsOf(rows, pf({ sido: 'all' }), { pp: PP, policies: IDX.policies, observedMonth: IDX.observedMonth, sidoName: sido, sggName: (c) => c }).map((x) => [x.q, x]));
  assert.equal(q['어떤 사업이 늦어지는가'].value, '2');
  const s97 = PP.policies.find((p) => p.policyId.includes('97') || p.name.includes('9·7')).stages.SUPPLY.samePeriod.find((y) => y.year === 2026);
  assert.deepEqual([s97.target, s97.actual, s97.actualWithEstimates], [8049, 4732, 8742]);
  const metro = V.summaryOf(V.applyFilters(rows, pf({})));
  assert.deepEqual([metro.n, metro.units], [262, 227976]);
  const f = pf({ sido: 'all' }), list = V.listOrder(V.applyFilters(rows, f));
  const grid = L.listRows(list, f, null, sido);
  const csv = S.toCsv(L.csvCols(L.dropBlank(L.LIST_COLS, grid).cols), L.csvRows(grid)).split('\r\n').filter(Boolean);
  assert.equal(csv.length - 1, grid.length);
  assert.equal(grid.length, 262);   // 2026-10-19 수도권 한정: 목록 2,317행 → 262행
  assert.deepEqual(csv.slice(1).map((l) => l.split(',')[0]), list.map((r) => r.id), 'CSV 순서 = 목록 순서');
});
