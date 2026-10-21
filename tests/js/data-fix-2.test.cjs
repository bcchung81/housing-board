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
  assert.equal(past.length, 3);   // 2026-10-19 수도권 한정: 예정일 지남 29 → 4(수도권 밖 사업 25곳이 빠짐) → 기준일 2026-10-20: 성남금토 A2(2026-09-16)가 1개월 지나 주의로 3
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
  assert.match(read('components/projects/ProjectDetail.tsx'), /pd = !j && pastDueOf\(r\)[\s\S]*pd \?[\s\S]*\{PAST_DUE_UNDER\}/, '서랍 머리에도 표지(2026-10-16: \'예정일 지남(1개월 미만)\' — r2-screens 2)');
  assert.match(read('components/projects/Candidate.tsx'), /next = nextOf\(r\)/, '간단 보기는 nextOf 그대로');
  assert.doesNotMatch(read('app/(dashboard)/projects/page.tsx'), /nextCell/, '2026-10-21 사업 화면은 HOME 원천 행 — 현재 예정 칸·인쇄 표 nextCell 이 없다(원장 판 nextCell 은 위에서 확인)');
});

test('#21 상태 이름: 판정 없음을 준공 완료 · 판정 일정 없음 · 일정 없음으로 나누고 범주·건수는 그대로', () => {
  const none = rows.filter((r) => V.statusOf(r) === 'none');
  // 2026-10-19 수도권 한정: 판정 없음 309 → 93(판정 일정 없음 14 → 13 전부 수도권, 준공 완료 73 → 0 — 건축HUB 후보가 빠져 HOME 행엔 준공 완료 표시가 없다, 일정 없음 80)
  // 2026-10-20 HOME 판: 판정 없음 93 → 195(새 사업 122 중 일정 없는 것 — 일정 없음 80 → 183, 판정 일정 없음 13 → 12)
  assert.equal(none.length, 103);   // 2026-10-21 새 덤프(20261020T142230Z): 새 사업 3(판정 일정 없음) 100 → 103 · 2026-10-20 공공 분류 안2: 화면은 공공 공급만(민간 정비 39·일반 민간 53 뺌) — 둘 다 판정 일정이 없던 사업이라 판정 없음만 192 → 100 · 2026-10-20 같은 현장 병합 6쌍: 평택고덕 대표 3곳이 공사 계약 일정을 넘겨받아 판정 대상(정상)이 됨 195 → 192
  const by = (k) => none.filter((r) => V.noneKind(r) === k);
  assert.equal(by('plan').length, 13);   // 2026-10-20 D9 SH 공고문 입주 예정: 고덕강일 3단지(PRJ-11740-0102)가 다음 일정이 생겨 일정 없음 → 판정 일정 없음(12 → 13)
  assert.ok(by('plan').some((r) => r.id === 'PRJ-11740-0102'));
  assert.equal(by('plan').filter((r) => V.isMetro(r.sgg)).length, 13);
  assert.equal(by('done').length, 0);
  assert.equal(by('none').length, 90);   // 2026-10-21 새 덤프(20261020T142230Z): 새 사업 3(일정 없음) 87 → 90 · D9: 88 → 87(위 고덕강일 3단지)   // 2026-10-20 공공 분류 안2: 빠진 민간 92곳은 모두 일정 없음 180 → 88 · 2026-10-20 같은 현장 병합 6쌍: 일정 없던 평택고덕 대표 3곳이 판정 대상이 됨 183 → 180
  assert.ok(by('done').every((r) => r.done));
  const doneRow = { ...none[0], done: '2026-01', next: null };   // 준공 완료 이름은 합성 행으로 확인(원장엔 해당 행이 없다)
  assert.deepEqual([V.statusLabel(doneRow), V.statusLabel(by('plan')[0]), V.statusLabel(by('none')[0])], ['준공 완료', '판정 일정 없음', '일정 없음']);
  assert.equal(L.statusCell(by('plan')[0]).text, '판정 일정 없음');
  assert.equal(V.STATUS_NAME.none, '판정 없음');
  assert.equal(V.STATUS_RANGE.none, '판정 없음', '칩 이름(묶음)');
  const page = read('app/(dashboard)/projects/page.tsx');
  assert.match(page, /<dt>상태 · 부족 호수<\/dt><dd>\{JUDGE_DEF\}/, '2026-10-21 목록 읽는 법 ⓘ 에 PoC 상태 정의(준공 완료·판정 일정 없음 이름은 원장 판 statusLabel 이 그대로)');   assert.doesNotMatch(page, /NONE_NAME/);
  /* D3(2026-10-15): 번호가 없는 후보는 확인 필요 — 2026-10-19 수도권 한정: 후보 1,839건(옛 정상 1,442 · 주의 84 · 지연 96 · 장기 217)이 원장에서 빠져 review 0 */
  const st = {}; for (const r of rows) st[V.statusOf(r)] = (st[V.statusOf(r)] ?? 0) + 1;
  assert.deepEqual(st, { none: 103, ok: 172, long: 2, caution: 11 }, '상태 건수(review 없음)');   // 2026-10-21 새 덤프: 새 사업 3 판정 없음 · 2026-10-20 공공 분류 안2: 화면은 공공 공급만(민간 정비 39·일반 민간 53 뺌)(판정 없음만 −92) · 2026-10-20 HOME 판 → 같은 현장 병합·기준일 10-20
  const calc = {}; for (const r of rows) calc[V.calcOf(r)] = (calc[V.calcOf(r)] ?? 0) + 1;
  assert.deepEqual(calc, { none: 103, ok: 172, long: 2, caution: 11 }, '같은 계산(번호와 상관없이) — 후보가 없어 상태와 같다');   // 2026-10-20 공공 분류 안2: 화면은 공공 공급만(민간 정비 39·일반 민간 53 뺌)
});

test('#25 시 단위 코드: 구가 있는 경기 시는 구 사업을 합치고, 지도 개요와 같은 건수', () => {
  for (const [city, n] of [['41280', 11], ['41110', 13]]) {   // 2026-10-20 HOME 판: 고양 10→11 · 수원 7→13
    const f = pf({ sgg: city });
    assert.deepEqual(f.gu, M.guOf(city));
    const got = V.applyFilters(rows, f);
    assert.equal(got.length, n, city);
    assert.equal(got.length, rows.filter((r) => M.unitOf(r.sgg) === city).length, `${city} = 개요 면(unitOf)`);
  }
  assert.equal(pf({ sgg: '41281' }).gu, undefined, '구 코드는 그 구만');
  assert.equal(V.applyFilters(rows, pf({ sgg: '41281' })).length, 9);   // 2026-10-20 HOME 판 8→9
  assert.equal(pf({ sgg: '41150' }).gu, undefined, '구 없는 시는 그대로');
  const page = read('app/(dashboard)/projects/page.tsx');
  assert.match(page, /parseFilters\(q, \{[^\n]*guOf, home: \{ agencies: idx\.agencies\.map\(\(a\) => a\.name\) \} \}\)/);
  assert.match(read('app/(dashboard)/projects/csv/route.ts'), /parseFilters\(q, \{[^\n]*guOf, home: \{ agencies: idx\.agencies\.map\(\(a\) => a\.name\) \} \}\)/, 'CSV 도 같은 거르기');
  assert.match(page, /function sggFullName[\s\S]*\$\{METRO_AREAS\[code\]\}\(\$\{gu\.map/, "이름 '고양시(덕양구·일산동구·일산서구)'");
  assert.deepEqual(M.guOf('41280').map((c) => M.METRO_AREAS[c].slice(M.METRO_AREAS['41280'].length).trim()), ['덕양구', '일산동구', '일산서구']);
});

test('#27 위치 미확보: 서랍과 같은 상세 자료에 좌표가 없는 수도권 사업은 지도 열에 표지(링크는 유지)', () => {
  const metro = rows.filter((r) => V.isMetro(r.sgg));
  const noLoc = metro.filter((r) => DET.projects[r.id] && !DET.projects[r.id].loc);
  assert.equal(noLoc.length, 30);   // 2026-10-21 새 덤프(20261020T142230Z): HOME 위치 행(project_location) 194 → 310 으로 위치 미확보이던 20곳이 지구 근사 위치를 얻고(−20), 위치 없는 새 사업 3(독산동·연남동·방화차고지) +3 → 47 → 30 · 2026-10-20 공공 분류 안2: 화면은 공공 공급만(민간 정비 39·일반 민간 53 뺌): 위치 없던 민간 사업 77곳 빠짐(home-map 위치 none 47) 124 → 47 · 2026-10-20 HOME 판: 위치 미확보 26 → 127(새 사업 다수가 위치 원천 없음 — home-map 위치 none 127) → 2026-10-20 같은 현장 병합 6쌍: 위치 없던 대체 3곳(인천검단 0064·0065, 인천부평 0068) 빠짐 124
  const check = metro.filter(V.isCheck);
  assert.equal(check.length, 13);   // 2026-10-20 HOME 판: 주의 10 + 지연 2 → 기준일 10-20 주의 11(성남금토 A2) + 지연 2
  /* 기준일 10-20 에 주의가 된 성남금토 A2 는 LH 블록 라벨점 위치가 있다. 2026-10-21 새 덤프: HOME 위치 행이 늘어(194 → 310) 8건이 지구 근사 위치를 얻었다 — 나머지 4건은 위치 미확보 */
  assert.deepEqual(check.filter((r) => DET.projects[r.id].loc).map((r) => r.id), ['PRJ-28245-0058', 'PRJ-28245-0059', 'PRJ-41110-0009', 'PRJ-41110-0008', 'PRJ-41110-0004', 'PRJ-41131-0050', 'PRJ-41190-0006', 'PRJ-41360-0233', 'PRJ-41360-0232'], '수도권 점검 필요 13건 중 위치 있는 것 9건(성남금토 A2 + 새 덤프 지구 근사 8)');
  const c = L.mapCell(check.find((r) => !DET.projects[r.id].loc), true);
  assert.equal(c.text, L.NO_LOC);
  assert.equal(c.text, '위치 미확보');
  assert.match(c.href, /project=/);
  assert.match(c.title, /시군구로 보임/);
  assert.equal(L.mapCell(check[0]).icon, 'map', '좌표가 있으면 지도 표지 그대로');
  // 2026-10-19 수도권 한정: 원장에 수도권 밖 행이 없다 → 모든 행이 수도권이고, 수도권 밖 시군구 코드(합성 행)는 여전히 빈칸
  assert.equal(rows.every((r) => V.isMetro(r.sgg)), true);
  assert.equal(L.mapCell({ ...check[0], sgg: '26110' }, true), null, '수도권 밖은 빈칸');
  /* 2026-10-16 2차 평가: 판정은 지도와 같은 기준(mapLocOf — 번들 블록·동과 이어진 계양 A2 등은 확보) — r2-screens 1 */
  assert.match(read('app/(dashboard)/projects/page.tsx'), /getProjectDrawer\(oid\)[\s\S]*!mapLocOf\(d\.row, d\.detail\.loc\)/, '서랍과 같은 원천(getProjectDrawer)·같은 판정 — 원천 행의 ourId 로');
});

test('#15 날짜 점 표기: 종합상황판·사업·지역 공급 title 의 하이픈 날짜', () => {
  const board = read('components/board/Board.tsx');
  /* 2026-10-21 결정: HOME 과 같은 조건·같은 표기 — scope 는 H 갈래(기준일 dotDates)와 옛 원장 갈래(ymDot) 모두 점 표기 */
  assert.match(board, /기준일 \$\{dotDates\(L\.referenceDate\)\}/);
  assert.match(board, /: `원장 \$\{ymDot\(L\.observedMonth\)\} 기준/);
  assert.match(board, /판정 기준일 \$\{dotDates\(SJ\.referenceDate\)\}/);
  assert.match(board, /파일 기준일\(\{dotDates\(real\.lhAsOf\)\}\)/);   // (i) 팝오버 글(2026-10-16 3차)
  assert.doesNotMatch(board, /2026-07부터/);
  const L_ = makeDirectives({ sourceCount: 1, stageNames: ['a', 'b', 'c', 'd', 'e', 'f'], ledger: BOARD, start: { year: '2026', upto: 8, cum: 1, cumLy: 1 }, bottleneck: () => null });
  for (const d of L_.slice(1)) assert.doesNotMatch(d.basis, /\b20\d\d-\d\d\b/, `${d.t} 카드 title`);
  assert.match(L_[3].basis, /향후 12개월\(2026\.10~2027\.09\)/);
  const page = read('app/(dashboard)/projects/page.tsx');
  /* 2026-10-21 사업 화면 = HOME 원천 행: 머리 기준일 title 도 점 표기(ref = 기준일의 하이픈을 점으로) */
  assert.match(page, /const ref = idx\.referenceDate\.replace\(\/-\/g, '\.'\);/);
  assert.match(page, /title=\{`정책 진행 자료\(HOME\) 기준일 \$\{ref\}/);
  const region = read('app/(dashboard)/region/page.tsx');
  assert.match(region, /정책 진행 자료 기준일 \$\{calendar\.home\.asOf\.replace\(\/-\/g, '\.'\)\} · 통계누리 실적 \$\{ymDot\(last\)\}까지/);   // 2026-10-21: 앞으로 12개월 = HOME 공급 예정
  /* 지역 공급 예정 목록도 점 표기 하나(2026-10-16 2차 평가 — '10월 11일'·'10월 중'·'2026년 10월' 대신 2026.10.11·2026.10, r2-screens 8) */
  assert.match(read('components/region/Ahead.tsx'), /const dayText = \(e: Pick<AheadEntry, 'day' \| 'ym'>\) => \(W\.date === 'ko' \? koDay\(e\) : aheadDay\(e\)\);/);
  assert.equal(S.dotDates('2026-10-13'), '2026.10.13');
});

test('#16 단위 건: 종합상황판 카드·향후 12개월', () => {
  const d = makeDirectives({ sourceCount: 1, stageNames: ['a', 'b', 'c', 'd', 'e', 'f'], ledger: BOARD, start: { year: '2026', upto: 8, cum: 1, cumLy: 1 }, bottleneck: () => null });
  // 2026-10-19 수도권 한정: 사업 2,317건 → 262건, 후보 계산 313건이 빠져 지연 카드는 쌍 숫자 없이 '지연 2건'(옛 315건 = 2 + 후보 313)
  assert.equal(d[1].m, '288건');   // 2026-10-21 새 덤프(20261020T142230Z): 새 사업 3 · 2026-10-20 공공 분류 안2: 화면은 공공 공급만(민간 정비 39·일반 민간 53 뺌) · 2026-10-20 HOME 판 → 2026-10-20 같은 현장 병합 6쌍
  assert.equal(d[4].m, '지연 2건', 'D3: 사업 번호가 있는 사업만, 후보 0이면 쌍 숫자 없음');
  assert.ok(d.every((x) => !/사업$/.test(x.u)));
  const board = read('components/board/Board.tsx');
  assert.match(board, /\{f\(upProj\)\}건<\/span>/);
  assert.doesNotMatch(board, /\}사업/);
  assert.equal(BOARD.upcoming.reduce((n, m) => n + m.projects, 0), 25);   // 2026-10-20 HOME 판 24→25 · 2026-10-19 수도권 한정: 414 → 24곳
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
  assert.match(page, /value=\{fmt\(units\)\} unit="호" items=\{\[`\$\{fmt\(nProjects\)\}건`/);   // 2026-10-21: 건 = 증가분이 있는 HOME 원천 사업 행(HOME '사업 n개')
  assert.doesNotMatch(page, /man\(/);
  const ahead = read('components/region/Ahead.tsx');
  assert.match(ahead, /title=\{`\$\{monthLabel\(x\)\} \$\{xs\.length\}\$\{W\.count\} \$\{fmt\(tot\[i\]\)\}호/);
  const metro = R.aheadAll(calendar, 'metro', sido);
  assert.equal(metro.reduce((s, e) => s + e.units, 0), 31420, '수도권 12개월 예정 합(정확한 값)');   // 2026-10-21 새 덤프(20261020T142230Z): 인천서구 공급계획 행이 합쳐진 PRJ-28275-0034 거북이기지 모집 예정 2026-12 58호 +58 (0037 석남어울림 준공 예정은 공사 진행 원천의 이른 날 2027-09 → 2027-08, 호수 같음) ·  2026-10-20 HOME 판 27,494 → 28,692 → D9 LH 공고문 입주 예정 2곳(성남신촌 A-1 227 · 이천장호원 B2 620) 29,539 → GH·SH 공고문 2곳(다산지금 A3 518 · 고덕강일 3단지 1,305) 31,362
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
  /* 2026-10-21 결정: HOME 과 같은 조건·같은 표기 — 종합상황판은 H 면 AHEAD_SUPPLY(공급 예정), 아니면 AHEAD_COMPLETION */
  assert.match(read('components/board/Board.tsx'), />\{H \? AHEAD_SUPPLY : AHEAD_COMPLETION\}<\/h2>/);
  /* 2026-10-21 결정: 지역 공급 앞으로 12개월 = HOME 공급 예정 하나(종류 칩 대신 정책 칩) — 대표값 이름 '공급 예정', 정의는 (i) 의 AHEAD_SUPPLY */
  assert.match(read('app/(dashboard)/region/page.tsx'), /<dt>\{AHEAD_SUPPLY\}<\/dt>[\s\S]*<MetricRow label="공급 예정"/);
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
  /* 2026-10-21: 지역 공급은 HOME 공급 예정(달 단위 일정, 기준일 뒤 기한만)이라 예정일 지남 항목이 없다 — 표지는 원장 예정을 쓰는 일반사용자 공급 일정(Ahead)에 남는다 */
  assert.ok(Object.values(calendar.home.p97.sido).flat().every((e) => !R.pastDue(e, ref)));
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
  assert.deepEqual([metro.n, metro.units], [288, 242382]);   // 2026-10-21 새 덤프(20261020T142230Z): 새 사업 3(103호) · 2026-10-20 HOME 판 → 2026-10-20 같은 현장 병합 6쌍 → 2026-10-20 공공 분류 안2: 화면은 공공 공급만(민간 정비 39·일반 민간 53 뺌)
  const f = pf({ sido: 'all' }), list = V.listOrder(V.applyFilters(rows, f));
  const grid = L.listRows(list, f, null, sido);
  const csv = S.toCsv(L.csvCols(L.dropBlank(L.LIST_COLS, grid).cols), L.csvRows(grid)).split('\r\n').filter(Boolean);
  assert.equal(csv.length - 1, grid.length);
  assert.equal(grid.length, 288);   // 2026-10-21 새 덤프(20261020T142230Z): 새 사업 3 · 2026-10-20 공공 분류 안2: 화면은 공공 공급만(민간 정비 39·일반 민간 53 뺌) · 2026-10-20 HOME 판 262→383 → 2026-10-20 같은 현장 병합 6쌍 377 · 2026-10-19 수도권 한정: 목록 2,317행 → 262행
  assert.deepEqual(csv.slice(1).map((l) => l.split(',')[0]), list.map((r) => r.id), 'CSV 순서 = 목록 순서');
});
