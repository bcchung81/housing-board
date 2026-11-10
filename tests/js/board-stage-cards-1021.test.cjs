'use strict';
/* 2026-10-21 사용자 지시 '상단의 6개 카드를 정책/사업화/인허가/건설/공급/입주 6단계 기준으로 PoC 를 참고해서 내용을 변경':
   종합상황판 맨 위 카드 6장 = HOME PoC '정책 진행현황' 카드(https://www.minslab.kr/poc/home/#policy-progress, 2026-10-21 실측 — 공급만 PoC 가 덤프 뒤 바뀌어 우리 덤프 값).
   경기·인천 정책 목표는 덤프에 없어 PoC 공개 API 스냅샷(policy-plan-97 — 담당자 입력)으로 채우고 출처 표지(from 'poc')를 남긴다. 옛 원장 경로(지시 6건)는 그대로 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const HB = require('../../data/board/home-board.json');
const D = require('../../lib/board/directives.ts');
const V = require('../../lib/board/projects-view.ts');

const start = { year: '2026', upto: 8, cum: 86739, cumLy: 85424 };
const dirOf = (sido) => D.makeDirectives({ sourceCount: 19, stageNames: HB.stageNames, ledger: sido === 'all' ? HB : { ...HB.byRegion[sido], regions: HB.regions }, start, bottleneck: V.bottleneckOf, sido });

/* [큰 숫자, 아래 줄] × 정책·사업화·인허가·건설·공급·입주 — 판 숫자(2026-10-22 22:35 판 표 EXPECT) 대신 '/' 자료(home-board.json home.cards — policy-golden.test.cjs 가 PoC 응답과 견준다)에서 만든 기대 글.
   문구 규칙(남은 호수 = 12월 말 예상 − 현재, 0 이면 '일치', 음수면 '초과', 입주는 12월 말 예상)은 아래 가짜 카드로 따로 고정한다 */
const n = (x) => x.toLocaleString('en-US');
const cardsOf = (sido) => (sido === 'all' ? HB.home.cards : HB.byRegion[sido].home.cards);
const expectOf = (sido) => {
  const C = cardsOf(sido);
  return [[C.POLICY.target == null ? '미확보' : n(C.POLICY.target), '전체 목표'],
    ...['BUSINESS', 'APPROVAL', 'CONSTRUCTION', 'SUPPLY'].map((k) => { const c = C[k]; assert.equal(c.remainder, c.year_end_expected - c.current, `${sido} ${k} 남은 호수 = 예상 − 현재`); return [n(c.current), c.remainder > 0 ? `연말 계획까지 ${n(c.remainder)}호` : c.remainder < 0 ? `연말 계획 대비 ${n(-c.remainder)}호 초과` : '연말 계획과 일치']; }),
    [C.MOVE_IN.current == null ? '0' : n(C.MOVE_IN.current), C.MOVE_IN.year_end_expected == null ? '연말 계획 미확보' : `12월 말 예상 ${n(C.MOVE_IN.year_end_expected)}호`]];
};

test('카드 문구 규칙(가짜 카드 — 2026-10-22 오전 판 수도권 값): 남은 호수 양수·0·음수, 입주 현재 없음·예상 없음', () => {
  const card = (current, ye) => ({ current, year_end_expected: ye, remainder: ye == null || current == null ? null : ye - current, measured_on: '2026-10-21', plan_date: '2026-12-31' });
  const fake = { ...HB, home: { ...HB.home, cards: { POLICY: { target: 1350000 }, BUSINESS: card(153402, 153402), APPROVAL: card(100973, 106771), CONSTRUCTION: card(82968, 80000), SUPPLY: card(58125, 73114), MOVE_IN: card(null, 3845) } } };
  const d = D.makeDirectives({ sourceCount: 19, stageNames: HB.stageNames, ledger: fake, start, bottleneck: V.bottleneckOf, sido: 'all' });
  assert.deepEqual(d.map((x) => [x.big, x.pre, x.u]), [['1,350,000', '전체 목표', '호'], ['153,402', '연말 계획과 일치', '호'], ['100,973', '연말 계획까지 5,798호', '호'], ['82,968', '연말 계획 대비 2,968호 초과', '호'], ['58,125', '연말 계획까지 14,989호', '호'], ['0', '12월 말 예상 3,845호', '건']]);
  assert.equal(d[3].m, '착공(건설) 현재 누적 82,968호 · 연말 계획 대비 2,968호 초과');
  const none = { ...fake, home: { ...fake.home, cards: { ...fake.home.cards, MOVE_IN: card(null, null) } } };
  assert.equal(D.makeDirectives({ sourceCount: 19, stageNames: HB.stageNames, ledger: none, start, bottleneck: V.bottleneckOf, sido: 'all' })[5].pre, '연말 계획 미확보');
});

test('카드 6장 = 정책·사업화·인허가·건설·공급·입주, 큰 숫자·아래 줄 = PoC 정책 진행현황(수도권·서울·경기·인천)', () => {
  for (const sido of ['all', '11', '41', '28']) {
    const d = dirOf(sido), rows = expectOf(sido);
    assert.deepEqual(d.map((x) => x.t), ['정책', '사업화', '인허가', '건설', '공급', '입주'], sido);
    assert.deepEqual(d.map((x) => [x.big, x.pre]), rows, sido);
    assert.deepEqual(d.map((x) => x.u), rows.map(([b]) => (b === '미확보' ? '' : b === '0' ? '건' : '호')), `${sido} 단위`);
    for (const x of d) {
      assert.deepEqual(x.p, ['p-chart']);
      assert.equal(x.date, undefined, '지시 날짜 없음');
      assert.equal(x.sub, undefined); assert.equal(x.pair, undefined);
    }
  }
  const all = dirOf('all'), A = expectOf('all');
  assert.equal(all[3].m, `착공(건설) 현재 누적 ${A[3][0]}호 · ${A[3][1]}`);
  assert.equal(all[0].m, '정책 전체 목표 1,350,000호');   // 9·7 정책 목표(정책 문서 값 — 판과 무관)
  assert.equal(all[5].m, `입주 현재 누적 ${A[5][0]}건 · ${A[5][1]}`);
});

test('정책 목표: 경기 800,000·인천 216,000 은 PoC 스냅샷(출처 표지 from poc — (i) 에 PoC 공개 화면 값), 수도권·서울은 덤프 값(표지 없음)', () => {
  assert.deepEqual([HB.byRegion['41'].home.cards.POLICY, HB.byRegion['28'].home.cards.POLICY], [{ target: 800000, from: 'poc' }, { target: 216000, from: 'poc' }]);
  assert.deepEqual([HB.home.cards.POLICY, HB.byRegion['11'].home.cards.POLICY], [{ target: 1350000 }, { target: 334000 }]);
  for (const s of ['41', '28']) assert.match(dirOf(s)[0].basis, /HOME 정책 카드 — 지역 배분 목표\(입력 목표 · 그래프 배경 기준\) · PoC 공개 화면 값\(담당자 입력 — 덤프에 없음\)/);
  assert.doesNotMatch(dirOf('11')[0].basis, /PoC 공개 화면 값/);
  assert.match(dirOf('all')[0].basis, /HOME 정책 카드 — 전체 목표\(입력 목표 · 그래프 배경 기준\)$/);
  /* 목표가 없으면 '미확보'(단위 없음) */
  const L = { ...HB, home: { ...HB.home, cards: { ...HB.home.cards, POLICY: { target: null } } } };
  const p = D.makeDirectives({ sourceCount: 19, stageNames: HB.stageNames, ledger: L, start, bottleneck: V.bottleneckOf })[0];
  assert.deepEqual([p.big, p.u, p.pre], ['미확보', '', '전체 목표']);
});

test('기준((i)): HOME 카드 이름 · 현재 누적 측정량(측정일 · 후속 단계 포함) · 12월 말 누적 예상량(계획일), 건설만 통계누리 범위 차이', () => {
  const d = dirOf('all');
  /* 판 숫자(99,462 · 126,852 · 측정일 10.21 · 기준일 10.22) 대신 '/' 자료 카드 값·기준일 */
  const ap = HB.home.cards.APPROVAL, dot = (x) => x.replaceAll('-', '.');
  assert.equal(d[2].basis, `HOME 9·7 정책 추진현황 규칙 · 기준일 ${dot(HB.referenceDate)} · 수도권 · HOME 인허가 카드 — 현재 누적 측정량 ${n(ap.current)}호(측정일 ${dot(ap.measured_on)} · 후속 단계 포함 · 입력·추정 포함) · 12월 말 누적 예상량 ${n(ap.year_end_expected)}호(계획일 ${dot(ap.plan_date)} · 계획 기준)`);
  assert.match(d[3].basis, /HOME 착공\(건설\) 카드 — .*\. 통계누리 착공 통계\(민간 포함 모든 주택 · 수도권 2026년 1~8월 86,739호\)와 범위가 다릅니다\.$/);
  const mv = HB.home.cards.MOVE_IN;   // 판 숫자(0건 · 3,845호) 대신 '/' 자료 입주 카드
  assert.ok(d[5].basis.includes(`HOME 입주 카드 — 현재 누적 측정량 ${mv.current == null ? '0건' : `${n(mv.current)}호`}`) && d[5].basis.includes(`12월 말 누적 예상량 ${mv.year_end_expected == null ? '계획 미확보' : `${n(mv.year_end_expected)}호`}`), d[5].basis);
  assert.match(dirOf('11')[5].basis, /12월 말 누적 예상량 계획 미확보$/);
  for (const x of [...d.slice(0, 3), ...d.slice(4)]) assert.doesNotMatch(x.basis, /통계누리/);
});

test('숫자 링크: 정책 = 연결 사업 목록, 나머지 = 지금 그 HOME 단계(0~5)인 사업 — 고른 지역 주소', () => {
  for (const sido of ['all', '11', '41', '28']) {
    const d = dirOf(sido), s = sido === 'all' ? 'all' : sido;
    assert.deepEqual(d.map((x) => x.list.href), ['/projects?sido=' + s, ...[1, 2, 3, 4, 5].map((i) => `/projects?sido=${s}&stage=${i}`)], sido);
    assert.match(d[0].list.title, /^목록: 연결 사업 [\d,]+개\(.+\) — 카드 숫자는 정책 목표라 목록 호수와 다름$/);
    assert.match(d[3].list.title, /^목록: 지금 건설 단계인 사업\(.+\) — 카드 숫자는 후속 단계를 포함한 누적 측정량이라 목록 건수·호수와 다름$/);
  }
});

test('화면: HOME 이면 카드 누름 = 월별 공급 파동 단계 강조(범례와 같은 hl, 다시 누르면 전체) · 차트로 내림, 연결 표시는 강조 중 차트만, 이름 정책 진행현황 6단계', () => {
  const b = read('components/board/Board.tsx');
  assert.match(b, /const pickStage = \(i: number\) => \{\n    setHl\(hl === i \? -1 : i\);\n    document\.getElementById\('p-chart'\)\?\.scrollIntoView\(/);
  assert.match(b, /aria-pressed=\{H \? hl === i : i === focus - 1\} onClick=\{\(\) => \(H \? pickStage\(i\) : pick\(i\)\)\}/);
  assert.match(b, /const lk = \(id: string\) => \(H \? hl >= 0 && id === 'p-chart' : cur\.p\.includes\(id\)\);/);
  assert.doesNotMatch(b, /cur\.p\.includes\('/, '패널 연결 표시는 모두 lk');
  assert.match(b, /aria-pressed=\{hl === i\} onClick=\{\(\) => setHl\(hl === i \? -1 : i\)\}/, '범례 단추와 같은 상태');
  assert.match(b, /<section id="board-dirs" aria-label=\{H \? '정책 진행현황 6단계' : '총리 지시 6건'\}>/);
  assert.match(b, /aria-label=\{`\$\{x\.date \? `\$\{x\.date\} 지시 ` : ''\}\$\{x\.t\}: /, '날짜 없으면 지시 글자 없이');
});

test('옛 원장 경로(home 없음)는 지시 6건 그대로', () => {
  const L = require('../../data/board/ledger-board.json');
  assert.equal(L.home, undefined);
  const d = D.makeDirectives({ sourceCount: 19, stageNames: ['계획', '인허가', '착공', '분양', '준공', '입주'], ledger: L, start, bottleneck: V.bottleneckOf });
  assert.deepEqual(d.map((x) => [x.date, x.t]), [['08.14', '진척 관리'], ['08.19', '사업장별 현황판'], ['09.03', '범부처 통합·병목'], ['09.04', '예측가능성'], ['09.18', '일정 지연 관리'], ['09.30', '국민 공개·공식 원천']]);
});
