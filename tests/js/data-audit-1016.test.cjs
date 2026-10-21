'use strict';
/* 데이터 정확성·화면 간 연결 점검(2026-10-16): 화면 숫자를 원천 자료에서 다시 세어 화면끼리 같은지, 단위·범위 표지, 화면 사이 링크가 같은 대상·같은 거르기를 여는지 고정한다.
   결함마다 시험 하나 이상(고치기 전 실패 확인). 화면 간 같은 이름 숫자의 대조(지연·12개월 준공·시도·기관·단계)도 여기서 한 번에 다시 센다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const V = require('../../lib/board/projects-view.ts');
const R = require('../../lib/board/region.ts');
const O = require('../../lib/board/metro-overview.ts');
const MAP = require('../../data/board/ledger-map.json');
const IDX = require('../../data/board/projects-index.json');
const PP = require('../../data/board/policy-progress.json');
const BOARD = require('../../data/board/ledger-board.json');
const MOLIT = require('../../data/board/molit.json');
const CAL = require('../../data/board/region-calendar.json');
const RMAP = require('../../data/board/region-map.json');

const rows = V.rowsOf(MAP.bySgg, IDX.projects, IDX.sgg);
const sidoName = (c) => MOLIT.sido.find((x) => x.code === c)?.name ?? c;
const fctx = { policies: IDX.policies, programs: IDX.programs, sidoOk: (c) => !!MOLIT.sido.find((x) => x.code === c), guOf: O.guOf };
const qctx = { pp: PP, policies: IDX.policies, observedMonth: IDX.observedMonth, sidoName, sggName: (c) => c };
const Q = (q) => Object.fromEntries(V.questionsOf(rows, V.parseFilters(q, fctx), qctx).map((x) => [x.q, x]));
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const num = (t) => Number(String(t).replace(/,/g, ''));
const T = { areas: O.METRO_AREAS, sidoShort: O.SIDO_SHORT, guOf: O.guOf };
/* 지역 공급 주소(/region?sido=&sgg=)를 화면과 같은 규칙으로 읽어 기본 종류(준공) 예정의 건수·호수 */
function regionAhead(href) {
  const u = new URL(href, 'http://x');
  const q = Object.fromEntries(u.searchParams);
  const sido = q.sido === 'all' ? '' : q.sido ?? 'metro';
  const sgg = R.parseSgg(RMAP, sido, T, q.sgg);
  const list = R.aheadAll(CAL, sido, sidoName).filter((e) => (!sgg || R.inSgg(e, sgg, T)) && R.parseKinds(q.kind).includes(e.type));
  return { sgg, n: list.length, units: sum(list, (e) => e.units) };
}
/* 사업 화면 주소 → 목록(화면과 같은 parseFilters · applyFilters) */
const listOf = (href) => { const q = Object.fromEntries(new URL(href, 'http://x').searchParams); return V.applyFilters(rows, V.parseFilters(q, fctx)); };

/* ---------- 화면 간 같은 이름 숫자(고치기 전에도 맞던 값 — 다음 원장에서 어긋나면 잡는다) ---------- */
test('대조: 지연 확정·후보 계산·병목·12개월 준공·단계 호수가 종합상황판 ↔ 사업 ↔ 지역 공급 ↔ 지도 개요에서 같다', () => {
  const all = Q({ sido: 'all' }), metro = Q({});
  /* 지연 확정(번호 있는 사업) = 사업 화면 '어떤 사업이 늦어지는가'(전국) = 목록 ?status=late */
  assert.equal(num(all['어떤 사업이 늦어지는가'].value), BOARD.judgment.delay.projects);
  assert.equal(listOf('/projects?sido=all&status=late').length, BOARD.judgment.delay.projects);
  /* 후보 계산 지연 = 번호 없는 후보 중 계산 지연 */
  assert.equal(rows.filter((r) => !r.issued && r.cls === 'delay').length, BOARD.judgment.candidate.delay.projects);
  /* 병목: 단계별 지연 호수 */
  assert.deepEqual(V.delayByStageOf(rows), BOARD.delayByStage);
  /* 앞으로 12개월 준공: 전국 = 종합상황판 upcoming = 지역 공급(전국) */
  const up = sum(BOARD.upcoming, (m) => m.units), upN = sum(BOARD.upcoming, (m) => m.projects);
  assert.equal(num(all['앞으로 얼마나 공급되는가'].value), up);
  assert.deepEqual([regionAhead('/region?sido=all').n, regionAhead('/region?sido=all').units], [upN, up]);
  /* 수도권 = 사업 화면 기본 = 지역 공급 기본 = 지도 개요 합계(14,570호 · 25건 — 2026-10-20 HOME 판, 10-19 판 13,372호 · 24건) */
  const ov = O.metroOverview(RMAP, { rows, calendar: CAL, sggNames: IDX.sgg, referenceDate: IDX.referenceDate });
  assert.equal(num(metro['앞으로 얼마나 공급되는가'].value), 14570);
  assert.deepEqual([regionAhead('/region').n, regionAhead('/region').units], [25, 14570]);
  assert.deepEqual([ov.total.an, ov.total.a], [25, 14570]);
  assert.equal(ov.total.d, listOf('/projects?status=late&sido=metro').length, '지도 개요 지연 = 사업 화면 수도권 지연(장기 포함)');
  /* 지금 단계별 호수·건수: 리본 기준 달 = 목록 행의 현재 단계 합 */
  for (let i = 0; i < 6; i++) {
    const xs = rows.filter((r) => r.board === i);
    assert.equal(sum(xs, (r) => r.units), BOARD.stageUnits[BOARD.now][i], `단계 ${i} 호수`);
    assert.equal(xs.length, BOARD.stageProjects[BOARD.now][i], `단계 ${i} 건수`);
  }
  /* 시도 타일 = 목록 시도 거르기 */
  for (const g of BOARD.regions) {
    const xs = listOf(`/projects?sido=${g.code}`);
    assert.deepEqual([xs.length, sum(xs, (r) => r.units), xs.filter(V.isLate).length], [g.projects, g.units, g.delay], g.code);
  }
  /* 통계누리: 시도 합 = 전국, 시행주체 합 = 총계(월 상세 표의 부분 합 = 전체) */
  for (const k of ['permit', 'start', 'sale', 'complete']) {
    const S = MOLIT.metrics[k].series;
    MOLIT.months.forEach((ym, i) => {
      const n = S['00'].total[i];
      if (n == null) return;
      const parts = MOLIT.sido.filter((s) => s.code !== '00').map((s) => S[s.code].total[i]);
      if (parts.every((v) => v != null)) assert.equal(sum(parts, (v) => v), n, `${k} ${ym} 시도 합`);
      if (S['00'].actors) assert.equal(sum(Object.values(S['00'].actors), (a) => a[i] ?? 0), n, `${k} ${ym} 시행주체 합`);
    });
  }
});

/* ---------- 결함 1: 사업 화면 '정책 목표 대비' 카드의 범위 칩이 '전국'이었다 — 정책 진행 자료(HOME)는 정책에 연결된 사업 전체(세 정책 모두 수도권 정책)라 '정책 전체' ---------- */
test('결함 1: 정책 목표 대비 카드 범위 칩 = 정책 전체(전국 아님 — 세 정책 모두 수도권 정책)', () => {
  for (const p of IDX.policies) assert.match(p.scope, /수도권/, `${p.short} 정책 범위`);
  for (const p of IDX.policies) assert.deepEqual([...new Set(rows.filter((r) => r.policies.includes(p.key)).map((r) => r.sgg.slice(0, 2)))].filter((c) => !['11', '28', '41'].includes(c)), [], `${p.short} 연결 사업은 수도권만`);
  const page = read('app/(dashboard)/projects/page.tsx');
  assert.match(page, /<ScopeChip scope="정책 전체" source="정책 진행 자료"/);
  assert.doesNotMatch(page, /<ScopeChip scope="전국" source="정책 진행 자료"/);
});

/* ---------- 결함 2: 사업 화면 ?sgg= 의 '앞으로 얼마나 공급되는가' 링크가 시군구를 버리고 시도 지역 공급으로 갔다(고양시: 0호 → 경기 11,342호) ---------- */
test('결함 2: 시군구 거르기의 앞으로 12개월 링크 = 같은 시군구 지역 공급(값이 같다)', () => {
  const at = (sgg) => Q({ sgg })['앞으로 얼마나 공급되는가'];
  assert.equal(at('41280').href, '/region?sido=41&sgg=41280', '구가 있는 시');
  assert.equal(at('28245').href, '/region?sido=28&sgg=28245', '인천 구');
  assert.equal(at('11350').href, '/region?sido=11&sgg=11350', '서울 구');
  assert.equal(at('41570').href, '/region?sido=41&sgg=41570', '구가 없는 경기 시');
  assert.equal(at('41281').href, '/region?sido=41&sgg=41280', '경기 구 코드는 지역 공급 면(시)으로');
  assert.equal(at('12170').href, '/region?sido=12', '수도권 밖 시군구는 시도(지역 공급 시군구 면은 수도권만)');
  /* 지도 면 코드(수도권 시군구 67곳) 모두: 사업 화면 값 = 링크가 여는 지역 공급 값 */
  for (const u of R.sggUnits(RMAP, 'metro', T)) {
    const q = at(u.code), r = regionAhead(q.href);
    assert.equal(r.sgg, u.code, `${u.label} 지역 공급이 시군구를 받는다`);
    assert.equal(num(q.value), r.units, `${u.label} 호수`);
    assert.equal(q.sub, `${V.AHEAD_COMPLETION} · ${r.n.toLocaleString('en-US')}건`, `${u.label} 건수`);
  }
  /* 시도·수도권·전국은 그대로 */
  assert.equal(Q({})['앞으로 얼마나 공급되는가'].href, '/region');
  assert.equal(Q({ sido: 'all' })['앞으로 얼마나 공급되는가'].href, '/region?sido=all');
  assert.equal(Q({ sido: '28' })['앞으로 얼마나 공급되는가'].href, '/region?sido=28');
});

/* ---------- 결함 3: 지역 공급 목록의 사업 링크(/projects?id= · ?cand=)가 범위 없이 열려, 수도권 밖 사업도 수도권 목록 위에 서랍이 열렸다(닫으면 그 사업이 없는 목록) ---------- */
test('결함 3: 지역 공급 → 사업 서랍 링크는 그 사업이 들어 있는 목록 범위로', () => {
  assert.equal(typeof R.projectHref, 'function');
  // 2026-10-19 수도권 한정: 부산 후보(?cand)·광주 사업 예시가 달력에서 사라졌다 → 전체 보기(''·all)는 수도권 사업뿐이고 모두 상세 서랍(?id=) 사업. 후보 모양(?cand)은 같은 항목의 drawer 를 끈 합성 항목으로 본다
  const all = R.aheadAll(CAL, '', sidoName);
  assert.ok(all.length > 0 && all.every((e) => R.METRO.includes(e.sd) && e.drawer), '전체 보기 = 수도권 사업, 모두 상세 서랍');
  const inc = all.find((e) => e.sd === '28');
  const cand = { ...inc, drawer: false };
  const metroE = R.aheadAll(CAL, 'metro', sidoName).find((e) => e.drawer);
  assert.equal(R.projectHref(inc, ''), `/projects?sido=28&id=${inc.id}`, '전체 보기의 인천 사업 → 인천 목록 + 서랍');
  assert.equal(R.projectHref(cand, ''), `/projects?sido=28&cand=${inc.id}`, '후보 모양이면 간단 보기(cand)');
  assert.equal(R.projectHref(inc, '28'), `/projects?sido=28&id=${inc.id}`);
  assert.equal(R.projectHref(metroE, 'metro'), `/projects?id=${metroE.id}`, '수도권 보기는 사업 화면 기본(수도권) 그대로');
  /* 링크가 여는 목록에 그 사업이 있다(서랍 뒤 목록·닫기 후 목록) */
  for (const sd of ['', 'metro', '28', '11']) for (const e of R.aheadAll(CAL, sd, sidoName).slice(0, 40)) {
    const href = R.projectHref(e, sd);
    const q = Object.fromEntries(new URL(href, 'http://x').searchParams);
    assert.equal(q.id ?? q.cand, e.id);
    const f = V.parseFilters(q, fctx);
    assert.ok(V.applyFilters(rows, f).some((r) => r.id === e.id), `${href} 목록에 ${e.id}`);
  }
  assert.match(read('components/region/Ahead.tsx'), /const href = projectHref\(e, sido\);/);
});

/* ---------- 결함 4: 데이터 원본 표의 원장 사업 수가 천 단위 쉼표 없이('사업 2317건'), 위젯 이름이 종합상황판과 다름('향후 12개월 공급 예정') ---------- */
test('결함 4: 데이터 원본 — 원장 사업 수 쉼표 · 12개월 위젯 이름 = 종합상황판 카드 이름', () => {
  const page = read('app/(dashboard)/sources/page.tsx');
  /* 2026-10-21 W6: 종합상황판 줄은 '/' 가 쓰는 정책 진행 자료 집계(home-board.json) — 12개월 위젯 이름도 종합상황판 카드와 같은 AHEAD_SUPPLY */
  assert.doesNotMatch(page, /\(사업 \$\{homeBoard\.scope\.projects\}건/);
  assert.match(page, /\(사업 \$\{fmt\(homeBoard\.scope\.projects\)\}건/);
  assert.match(page, /homeRow\('future', AHEAD_SUPPLY,/);
  assert.doesNotMatch(page, /'향후 12개월 공급 예정'/, '글자 대신 상수');
});

/* ---------- 결함 5: 종합상황판 '지연·주의 추이'·'기관별 진행'의 숫자에 단위가 없었다(제목 title 에만 '호') ---------- */
test('결함 5: 종합상황판 지연·주의 추이·기관별 진행 숫자에 단위(호)가 보인다', () => {
  const board = read('components/board/Board.tsx');
  const panel = (id) => board.slice(board.indexOf(`id="${id}"`), board.indexOf('</Card>', board.indexOf(`id="${id}"`)));
  /* 2026-10-21 결정: HOME 과 같은 조건·같은 표기 — 추이 제목 title 은 H ? HOME 문구 : 옛 문구 두 갈래, 둘 다 '단위 호' */
  assert.match(panel('p-trend'), /<h2 className=\{ptitle\} title=\{H \? '[^']*단위 호[^']*' : '[^']*단위 호[^']*'\}>지연·주의 추이<\/h2>/, '추이 단위는 제목 title(2026-10-18 — 보이는 \'단위 호\' 글자는 다른 패널처럼 title 로)');
  assert.doesNotMatch(panel('p-trend'), /data-slot="trend-unit"/);
  assert.match(panel('p-agency'), /\{f\(a\.delayUnits\)\}<small[^>]*>호<\/small><\/b>/, '기관 지연 호수');
});

/* ---------- 후속 1: '후보 계산 313건'을 누르면 313건 목록(누른 숫자 = 목록 건수) — 새 거르기 ?status=review-late. 확인 필요(후보) 전체(?status=review, 1,839건)는 그대로 ---------- */
test('후속 1: 후보 계산 숫자 → ?status=review-late 목록·CSV 건수가 같다(확인 필요 전체 목록은 그대로)', () => {
  const c = BOARD.judgment.candidate;
  const D = require('../../lib/board/directives.ts').makeDirectives({ sourceCount: 1, stageNames: V.BOARD_NAMES, ledger: BOARD, start: { year: '2026', upto: 8, cum: 1, cumLy: 1 }, bottleneck: V.bottleneckOf });
  const late = D.find((d) => d.t === '일정 지연 관리');
  // 2026-10-19 수도권 한정: 후보(번호 없는 건축HUB·LH 후보)가 원장에서 빠져 후보 계산이 0 — 카드는 쌍 숫자(pair) 없이 '지연 n건', 후보 목록은 비어 있고 확인 필요 전체도 0
  assert.equal(late.pair, undefined, '후보 0이면 쌍 숫자 없음');
  assert.deepEqual([c.ok.projects, c.caution.projects, c.delay.projects], [0, 0, 0]);
  assert.ok(rows.every((r) => r.issued), '원장 사업은 모두 번호 있음(후보 없음)');
  assert.equal(listOf('/projects?sido=all&status=review-late').length, c.delay.projects);
  assert.equal(listOf('/projects?sido=all&status=review').length, c.ok.projects + c.caution.projects + c.delay.projects, '확인 필요(후보) 전체도 0');
  /* 종합상황판 선택 시점 카드의 링크도 같은 주소 */
  const board = read('components/board/Board.tsx');
  assert.match(board, /<PanelLink href=\{at\('\/projects\?sido=all&status=review-late'\)\}[^>]*>후보 계산 <b/);   // 2026-10-21 지역 탭(atSido)
  /* 사업 화면: 목록 머리 이름 · 상태 메뉴 칩 · CSV(같은 parseFilters·applyFilters) */
  assert.equal(V.REVIEW_LATE, '후보 · 지연 계산');
  assert.equal(V.listHref(V.parseFilters({ sido: 'all', status: 'review-late' }, fctx)), '/projects?sido=all&status=review-late', '주소가 그대로 돌아온다');
  /* 사업 화면(2026-10-21 HOME 원천 행 — 후보 없음, r4-screens 4): 후보 이름·칩이 없고 상태 메뉴는 HOME 판정 칩뿐, CSV 는 화면과 같은 거르기·순서.
     종합상황판도 후보 집계가 있을 때만 후보 계산 링크를 건다(HOME 집계에는 없음) */
  const page = read('app/(dashboard)/projects/page.tsx');
  assert.doesNotMatch(page, /REVIEW_LATE/, '목록 머리 이름·메뉴에 후보 없음');
  assert.match(board, /\{judged && SJ\.candidate && candCount\(SJ\.candidate\) \? \(/, '후보 집계가 없으면 후보 계산 링크 없음');
  assert.match(page, /\.\.\.HOME_STATUS_ORDER\.map\(\(k\) => \(\{ href: at\(\{ status: k \}\), label: HOME_STATUS_NAME\[k\]!, on: f\.status === k/, '상태 메뉴 칩 = HOME 판정');
  assert.doesNotMatch(page, /at\(\{ status: 'review-late' \}\)/, '후보가 없어 후보 칩 없음');
  assert.match(page, /const list = homeOrderOf\(applyFilters\(rows, f\), f\)/);
  assert.match(read('app/(dashboard)/projects/csv/route.ts'), /const list = homeOrderOf\(applyFilters\(idx\.rows, f\), f\);/, 'CSV 도 같은 거르기');
  /* HOME 원천 행: 후보 계산 목록 0건 = 종합상황판 HOME 집계의 후보 계산(없음) */
  const HP = require('../../data/board/home-projects.json'), HB = require('../../data/board/home-board.json');
  const home = V.homeRowsOf(HP.rows, HP.residuals), hctx = { ...fctx, home: { agencies: V.homeAgenciesOf(home).map((a) => a.name) } };
  assert.ok(home.every((r) => r.issued), 'HOME 원천 행은 모두 번호 있음(후보 없음)');
  assert.equal(V.applyFilters(home, V.parseFilters({ sido: 'all', status: 'review-late' }, hctx)).length, HB.judgment.candidate?.delay.projects ?? 0);
  /* 사업 화면 핵심 질문: 후보 목록으로 보내지 않는다(원장·HOME 둘 다) */
  const q = Q({ sido: '28' })['어떤 사업이 늦어지는가'];
  assert.ok(q && !/review-late/.test(q.href), '후보 지연이 없으면 후보 목록으로 보내지 않는다');
  const hq = V.homeQuestionsOf(home, V.parseFilters({ sido: '28' }, hctx), qctx).find((x) => x.q === '어떤 사업이 늦어지는가');
  assert.ok(hq && !/review-late/.test(hq.href ?? ''), 'HOME 질문도 후보 목록으로 보내지 않는다');
});

/* ---------- 후속 2: 지도 개요의 지연 수 d 는 번호 있는 사업만(사업 화면 '지연(장기 포함)'과 같은 정의) ---------- */
test('후속 2: 지도 개요 지연 수 = 번호 있는 사업의 지연만(후보 계산 지연은 세지 않음)', () => {
  const ov = O.metroOverview(RMAP, { rows, calendar: CAL, sggNames: IDX.sgg, referenceDate: IDX.referenceDate });
  assert.equal(ov.total.d, 2, '지금 값 그대로');
  const cand = rows.find((r) => r.issued && r.cls === 'delay');
  const fake = [{ ...cand, issued: false }];   // 같은 사업이 번호가 없으면(후보) 지연으로 세지 않는다
  assert.equal(O.valuesBySgg(fake, { sido: {} }, IDX.sgg).get(cand.sgg).d, 0);
  assert.equal(O.valuesBySgg([cand], { sido: {} }, IDX.sgg).get(cand.sgg).d, 1);
});

/* ---------- 후속 3: 데이터 원본 단계별 연계의 12개월 설명을 지금 집계 기준으로(옛 'LH 351블록 · 예정 = LH만') ---------- */
test('후속 3: 단계별 연계 ⑤ — 앞으로 12개월 · 준공 예정, 숫자는 정책 진행 자료 LH 준공 예정(9·7 연결 — 2026-10-21 W6, 옛 원장 upcoming)', () => {
  const { stageLinks } = require('../../lib/board/stage-links.ts');
  const { ACQUIRE } = require('../../lib/board/acquire.ts');
  const zero = new Proxy({}, { get: () => 0 });
  const LHP = require('../../data/board/home-lh-plan.json'), from = LHP.asOf.slice(0, 7), to = V.aheadMonths(from)[11];
  const lhAhead = LHP.blocks.filter((b) => b.date.slice(0, 7) >= from && b.date.slice(0, 7) <= to);
  const ahead = { units: sum(lhAhead, (b) => b.units), projects: lhAhead.length };
  const st = stageLinks({ regions: 3, sgg: 5, registryTotal: 1, registryRefs: 1, registry: {}, bundle: {}, molit: { permit: 1, start: 1, sale: 1, complete: 1, annual: 1 }, months: '2021-09~2026-08',
    lhBlocks: 351, lhAsOf: '2026-01-27', ledgerNote: '원장 2026.10 · 수도권', ahead, catalog: zero, hubBasis: 0, permits: 0, permitsStarted: 0, permitsCompleted: 0, plat: 0, ledger: 0, lhNotices: 0, myhome: 0, myhomePnu: 0, stan: 0 }, ACQUIRE);
  const done = st.find((s) => s.name === '준공');
  const o = done.outcomes.find((x) => x.name === V.AHEAD_COMPLETION);
  assert.ok(o, '이름 = 종합상황판 카드 이름');
  // 옛 원장 upcoming(준공 현재 예정 14,570호·25건) → 정책 진행 자료 LH 준공 예정 9·7 연결 행 중 2026-10~2027-09
  assert.deepEqual([ahead.units, ahead.projects], [7944, 12]);
  assert.deepEqual(o.lines, ['7,944호 · 12행', '정책 진행 자료 · LH 준공 예정(9·7 연결)']);
  assert.deepEqual(done.outcomes.find((x) => x.name.startsWith('⑤ 준공 층')).lines, ['실적 = 통계누리', '예정 = LH 준공 예정(정책 진행 자료)']);
  assert.ok(!done.outcomes.some((x) => x.lines.some((l) => /LH만|갱신 필요|원장/.test(l)) || x.name === '향후 12개월 공급 예정'), '옛 기준 설명 없음');
  assert.match(read('app/(dashboard)/sources/page.tsx'), /ahead: \{ units: lhAhead\.reduce/);
});
