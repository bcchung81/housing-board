'use strict';
/* 사업 화면(2026-10-14, HOME 개념 흡수 시안 v2): tools/ledger/projects-index.js 가 만든 두 파일, lib/board/projects-view.ts 의 렌즈·거르기·핵심 질문·단계 파이프라인·목표 대비·타임라인·서랍,
   그리고 화면 적용(목록 + 상세 서랍 ?id= · 월간 보고 ?print=1 · 옛 주소 넘김 · 발급 사업만 상세)을 고정한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const V = require('../../lib/board/projects-view.ts');
const X = require('../../tools/ledger/projects-index.js');
const MAP = require('../../data/board/ledger-map.json');
const IDX = require('../../data/board/projects-index.json');
const DET = require('../../data/board/project-detail.json');
const PP = require('../../data/board/policy-progress.json');
const REG = require('../../registry/projects.json').projects;

const BOARD = require('../../data/board/ledger-board.json');
const MOLIT = require('../../data/board/molit.json');
const E = require('./home-era.cjs');
const LP = require('../../tools/ledger/paths');
/* 판 무관(2026-11-10): 원장(가장 늦은 달) 사업 표 — 화면 목록 = 살아 있는(대체·숨김 아닌) 레지스트리 사업 중 원장 공공 분류 PUBLIC(2026-10-20 안2: 민간 정비·일반 민간 뺌) */
const LEDGER_PROJECTS = JSON.parse(fs.readFileSync(path.join(LP.ledgerDir(LP.latestMonth()), 'tables/projects.json'), 'utf8')).rows;
const LIVE_IDS = new Set(REG.filter((p) => !p.supersededBy && !p.hiddenAt).map((p) => p.id));
const PUBLIC_LIVE = LEDGER_PROJECTS.filter((p) => LIVE_IDS.has(p.local_project_id) && p.public_scope === 'PUBLIC');

const rows = V.rowsOf(MAP.bySgg, IDX.projects, IDX.sgg);
const pol = (k) => IDX.policies.find((p) => p.key === k);
const sidoName = (c) => MOLIT.sido.find((x) => x.code === c)?.name ?? c;
const ctx = { pp: PP, policies: IDX.policies, observedMonth: IDX.observedMonth, sidoName, sggName: (c) => (IDX.sgg[c] ?? c).split(' ').slice(1).join(' ') };
const Q = (f) => Object.fromEntries(V.questionsOf(rows, f, ctx).map((q) => [q.q, q]));
/* 판과 무관한 기대값(2026-11-09 P2): 핵심 질문 숫자를 사업 행·정책 진행 자료에서 시험 안에서 다시 센다(questionsOf 를 다시 부르지 않는다) */
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const p1 = (v) => v.toFixed(1);
const summed = (xs) => xs.reduce((s, r) => s + r.units, 0);
/* 정책 목표 대비 첫 칸: 목표·확인이 함께 있는 첫 단계의 달성률 · '<단계> 확인 a / 목표 t' · 미달이면 bad, title 의 추정 포함 꼬리 */
function wantPolicy(policyId) {
  const st = PP.policies.find((p) => p.policyId === policyId).stages, year = Number(PP.referenceMonthEnd.slice(0, 4));
  const cells = V.PP_STAGES.map((key) => ({ key, ...st[key].samePeriod.find((y) => y.year === year) })).map((c, board) => ({ ...c, board, withEst: c.actualWithEstimates ?? c.actual }));
  const pair = cells.find((c) => c.target != null && c.actual != null);
  const est = cells.filter((c) => c.actual != null && c.withEst > c.actual).map((c) => `${V.ppText(c)} ${fmt(c.withEst)}호`);
  return { pair, value: p1(pair.actual / pair.target * 100), sub: `${V.ppText(pair)} 확인 ${fmt(pair.actual)} / 목표 ${fmt(pair.target)}`, tone: pair.actual < pair.target ? 'bad' : undefined, est };
}
/* ②~⑤: 병목 = 번호 있는 지연 사업 호수가 가장 큰 칸 · 늦어지는 = 지연 + 장기 · 먼저 챙길 시도(시군구) = 주의·지연 호수 최대 · 12개월 준공 = 준공 예정 달이 관측 달부터 12개월 */
function wantRest(scope, bySgg) {
  const late = Array(V.BOARD_NAMES.length).fill(0);
  for (const r of scope.filter((x) => x.issued && x.cls === 'delay')) late[r.board] += r.units;
  const i = late.reduce((b, v, k) => (v > late[b] ? k : b), 0), neck = late[i] > 0 ? i : null;
  const n = (k) => scope.filter((r) => r.issued && V.statusOf(r) === k).length;
  const acc = new Map();
  for (const r of scope.filter((x) => x.issued && ['caution', 'delay'].includes(x.cls))) { const k = bySgg ? r.sgg : r.sgg.slice(0, 2); acc.set(k, (acc.get(k) ?? 0) + r.units); }
  const top = [...acc].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? null;
  const ahead = V.aheadMonths(IDX.observedMonth), up = scope.filter((r) => r.completion && ahead.includes(r.completion));
  return { neck, neckUnits: neck == null ? 0 : late[neck], delay: n('delay'), long: n('long'), top, upUnits: summed(up), upN: up.length };
}

test('두 파일은 지금 원장 표에서 다시 만든 것과 바이트가 같다(원장을 갱신하면 node tools/ledger/projects-index.js 를 다시 돌린다)', () => {
  const m = X.loadMonth();
  assert.equal(read(X.INDEX_OUT), X.renderIndex(X.projectsIndexFromLedger(m.tables, m)));
  assert.equal(read(X.DETAIL_OUT), X.renderDetail(X.projectDetailFromLedger(m.tables, m)));
  assert.equal(IDX.referenceDate, MAP.referenceDate, '지도 색인과 같은 기준일');
});

test('목록 행 = 원장의 살아 있는 사업 전부(대체 10·숨김 71 제외), 발급 262 · 후보 0 — 모두 수도권', () => {
  // 2026-10-19 수도권 한정: 목록 2,317 → 262 (비수도권 후보 2,039 제거·광산 4·나주 12 숨김 → 발급 278 → 262, 숨김 55 → 71, 대체 10 그대로)
  /* 판 숫자(10-22 판 289) 대신: 원장 사업 표의 살아 있는 공공 사업(사업 id 까지) */
  assert.deepEqual(rows.map((r) => r.id).sort(), PUBLIC_LIVE.map((p) => p.local_project_id).sort());   // 내력: 2026-10-22 새 덤프(20261021T212310Z): 새 사업 1(부천역곡 A1, 9·7) 288 → 289 · 2026-10-21 새 덤프(20261020T142230Z): 새 사업 3(독산동·연남동·방화차고지, 모두 9·7) 285 → 288 · 2026-10-20 공공 분류 안2: 화면은 공공 공급만(민간 정비 39·일반 민간 53 뺌) 377 → 285 · 2026-10-20 HOME 판: 살아 있는 사업 262→383 → 2026-10-20 같은 현장 병합 6쌍 377
  assert.ok(rows.every((r) => ['11', '28', '41'].includes(r.sgg.slice(0, 2))), '원장 사업은 모두 서울·인천·경기');
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
  const gone = new Set(REG.filter((p) => p.supersededBy || p.hiddenAt).map((p) => p.id));
  assert.equal(gone.size, 88);   // 2026-10-20 HOME 판: 대체 10→11(0054→0055) · 숨김 71 → 2026-10-20 같은 현장 병합 6쌍 대체 17
  assert.ok(rows.every((r) => !gone.has(r.id)), '대체·숨김 사업은 목록에 없다');
  assert.equal(rows.filter((r) => r.issued).length, rows.length);   // 원장 행은 모두 발급 사업(10-22 판 289 · 11-10 판 290)
  assert.equal(rows.filter((r) => !r.issued).length, 0, '번호 없는 후보 0');
  const live = new Set(REG.filter((p) => !p.supersededBy && !p.hiddenAt).map((p) => p.id));
  assert.ok(rows.filter((r) => r.issued).every((r) => live.has(r.id)), '발급 행 = 살아 있는 레지스트리 사업');
  assert.deepEqual(Object.keys(DET.projects).sort(), rows.filter((r) => r.issued).map((r) => r.id).sort(), '상세 자료는 발급 사업만');
});

test('렌즈: 정책 렌즈마다 그 정책에 이어진 사업(모두 서울·인천·경기), 프로그램 렌즈는 프로그램 목록의 사업 수와 같다', () => {
  const n = (f) => V.applyFilters(rows, f).length;
  /* 판 숫자([['97', 167], ['129', 47], ['813', 51]] · 정책 연결 265 · 9·7 요약 [167, 144771, 22342, 0, 167]) 대신 사업 행에서 다시 센 값 */
  assert.deepEqual(IDX.policies.map((p) => [p.key, n({ policy: p })]), IDX.policies.map((p) => [p.key, rows.filter((r) => r.policies.includes(p.key)).length]));
  assert.ok(IDX.policies.every((p) => n({ policy: p }) > 0), '정책마다 사업이 있다');
  for (const p of IDX.policies) assert.ok(V.applyFilters(rows, { policy: p }).every((r) => r.policies.includes(p.key) && ['11', '28', '41'].includes(r.sgg.slice(0, 2))), p.key);
  for (const g of IDX.programs) assert.equal(n({ program: g }), g.projects, g.name);
  assert.equal(rows.filter((r) => r.policies.length).length, new Set(IDX.policies.flatMap((p) => rows.filter((r) => r.policies.includes(p.key)).map((r) => r.id))).size, '정책에 연결된 사업 = 정책 렌즈들의 합집합');
  const r97 = rows.filter((r) => r.policies.includes('97'));
  const s = V.summaryOf(V.applyFilters(rows, { policy: pol('97') }));
  assert.deepEqual([s.n, s.units, s.notice, s.review, s.confirmed], [r97.length, summed(r97), r97.reduce((a, r) => a + (r.notice ?? 0), 0), r97.filter((r) => r.link === 'REVIEW_REQUIRED').length, r97.filter((r) => r.link === 'CONFIRMED').length]);
  /* 렌즈 + 지역 + 단계 + 상태가 함께 걸린다 */
  const f = { policy: pol('97'), sido: '41', stage: '04', status: 'ok' };
  assert.ok(V.applyFilters(rows, f).every((r) => r.policies.includes('97') && r.sgg.startsWith('41') && r.stage === '04' && r.cls === 'ok'));
  assert.equal(V.applyFilters(rows, f, 'stage').length >= V.applyFilters(rows, f).length, true, '계단 건수는 단계 거르기를 빼고 센다');
});

test('거르기 읽기·주소: 맞지 않는 값은 거르지 않고, 렌즈는 하나(정책이 이긴다), 시군구가 시도를 이긴다, 단계는 리본 칸(옛 01~06 도 받는다), 열쇠 순서 고정', () => {
  const ctx = { policies: IDX.policies, programs: IDX.programs, sidoOk: (c) => ['11', '28', '41'].includes(c) };
  assert.deepEqual(V.parseFilters({ policy: 'x', stage: '07', status: 'bad', sgg: '99999', agency: 'lx' }, ctx), {});
  const f = V.parseFilters({ policy: '97', program: '3기 신도시', sido: '11', sgg: '41285', stage: '04', status: 'delay', agency: 'lh' }, ctx);
  assert.equal(f.policy.key, '97'); assert.equal(f.program, undefined); assert.equal(f.sgg, '41285'); assert.equal(f.sido, undefined);
  assert.equal(f.stage, 2, '옛 공식 단계 04 건설 → ③착공 칸(/stage/04·종합상황판 링크)');
  assert.deepEqual(['01', '02', '03', '05', '06', '0', '5'].map((x) => V.parseFilters({ stage: x }, ctx).stage), [0, 0, 1, 3, 4, 0, 5]);
  assert.equal(V.parseFilters({ status: 'check' }, ctx).status, 'check');
  assert.equal(V.listHref(f), '/projects?policy=97&sgg=41285&stage=2&status=delay&agency=lh');
  assert.equal(V.listHref(f, { program: '3기 신도시' }), '/projects?program=3%EA%B8%B0+%EC%8B%A0%EB%8F%84%EC%8B%9C&sgg=41285&stage=2&status=delay&agency=lh', '프로그램을 고르면 정책 렌즈가 풀린다');
  assert.equal(V.listHref(f, { sido: '11' }), '/projects?policy=97&sido=11&stage=2&status=delay&agency=lh', '시도를 고르면 시군구가 풀린다');
  assert.equal(V.listHref({ sido: '41' }, { sgg: '41500' }), '/projects?sgg=41500', '시군구를 고르면 시도가 풀린다');
  assert.equal(V.listHref(f, { id: 'PRJ-41113-0035' }), '/projects?policy=97&sgg=41285&stage=2&status=delay&agency=lh&id=PRJ-41113-0035', '서랍 id 는 거르기를 지킨 채 맨 뒤');
  assert.equal(V.listHref({ metro: true }, { print: '1' }), '/projects?print=1', '기본 범위(수도권)는 주소에 적지 않는다');
  assert.equal(V.listHref({}, { print: '1' }), '/projects?sido=all&print=1', '전국은 ?sido=all');
  assert.equal(V.listHref(f, { policy: undefined, program: undefined, sgg: undefined, stage: undefined, status: undefined, agency: undefined }), '/projects');
  /* 기관·상태·단계가 함께 걸린다 */
  const g = { agency: 'lh', status: 'check', stage: 2 };
  assert.ok(V.applyFilters(rows, g).every((r) => r.agency === 'lh' && ['caution', 'delay'].includes(r.cls) && r.board === 2));
  /* 판 숫자(10-22 판 [146, 27, 4, 7, 105]) 대신: 원장 사업 표 agency_id 로 다시 센 값(기타 = 기관 미연결) */
  const byAgency = (a) => PUBLIC_LIVE.filter((p) => (a === 'etc' ? !['lh', 'sh', 'gh', 'ih'].includes(p.agency_id) : p.agency_id === a)).length;
  assert.ok(['lh', 'sh', 'gh', 'ih', 'etc'].every((a) => byAgency(a) > 0));
  assert.deepEqual(['lh', 'sh', 'gh', 'ih', 'etc'].map((a) => V.applyFilters(rows, { agency: a }).length), ['lh', 'sh', 'gh', 'ih', 'etc'].map(byAgency), '내력: 2026-10-22 새 덤프(20261021T212310Z): 새 사업 1 = LH(부천역곡 A1) · 2026-10-21 새 덤프: 새 사업 3 = SH 3(독산동·방화차고지·연남동 — 연남동 HOME 시행 \'서울주택도시개발공사(SH)\' 는 W5 \'HOME 기준\' SH 규칙으로 SH) · 기타 = 기관 미연결(지자체·국방부 포함) — 2026-10-20 공공 분류 안2: 민간 정비·일반 민간 92곳 빠짐 197 → 105(시행기관 미정 공공 사업) · 2026-10-19 수도권 한정: 269·2020 → 129·105 (비수도권 후보 제거, 합 262) → 2026-10-20 HOME 판 151·204(합 383) → 같은 현장 병합(LH −6)·iH 추가(원천 시행 인천도시공사 7, 기타에서 옮김) 145·7·197(합 377)');
});

test('상태: 지연 중 경과 12개월 이상은 장기 지연, 점검 필요 = 번호 있는 사업의 주의·지연·장기 지연(지연 개월 큰 순), 번호 없는 후보는 확인 필요(D3)', () => {
  const n = (s) => rows.filter((r) => V.statusOf(r) === s).length;
  /* 판 숫자(10-22 판 [172, 11, 0, 2, 0, 104]) 대신: 보드(ledger-board.json — 원장 표에서 따로 만든 판정)와 같다. 정상 = 보드 정상, 판정 없음 = 발급 − 판정, 합 = 목록 */
  assert.equal(n('ok'), BOARD.judgment.ok.projects);
  assert.equal(n('none'), BOARD.scope.issued - BOARD.scope.judged);
  assert.equal(['ok', 'caution', 'delay', 'long', 'review', 'none'].map(n).reduce((a, b) => a + b, 0), rows.length);   // 내력: 2026-10-22 새 덤프(20261021T212310Z): 새 사업 1(부천역곡 A1) 판정 없음 103 → 104 · 2026-10-21 새 덤프(20261020T142230Z): 새 사업 3 은 판정 없음 100 → 103 · 2026-10-20 공공 분류 안2: 화면은 공공 공급만(민간 정비 39·일반 민간 53 뺌) — 판정 없음만 −92 · 2026-10-20 같은 현장 병합 6쌍·기준일 10-20(성남금토 A2 주의)   // 2026-10-20 HOME 판: 정상 176·주의 10·판정 없음 195(새 사업 122) · 2026-10-19 수도권 한정: 확인 필요 1,839 → 0, 판정 없음 309 → 93 (후보 제거·숨긴 광산·나주 발급 16 제외)
  assert.equal(n('delay') + n('long'), BOARD.judgment.delay.projects, '지연 + 장기 지연 = 보드 판정 지연');
  assert.equal(n('caution'), BOARD.judgment.caution.projects);
  assert.equal(n('review'), BOARD.scope.candidateJudged, '확인 필요 = 보드의 후보 계산 건수(둘 다 0)');
  const chk = V.listOrder(V.applyFilters(rows, { status: 'check' }), { status: 'check' });
  assert.equal(chk.length, n('caution') + n('delay') + n('long') + n('review'));   // 점검 필요 = 주의·지연·장기 지연(+ 후보 확인 필요) — 10-22 판 13 = 주의 11 + 장기 2
  /* 번호가 있는 사업 먼저, 후보 사업은 뒤(2026-10-15 결정) — 그 안에서 지연 개월 큰 순 */
  const sameGroup = (a, b) => !!a.issued === !!b.issued;
  assert.ok(chk.every((r, i) => i === 0 || (!!chk[i - 1].issued >= !!r.issued && (!sameGroup(chk[i - 1], r) || V.lateOf(chk[i - 1]) >= V.lateOf(r)))), '번호 있는 사업 먼저 · 지연 개월 큰 순');
  const top = V.priorityOf(rows);
  /* 판 숫자(10-22 판 경과 [20, 20, 3 ×8] · 이름 10개 — 기준일마다 경과 개월이 바뀐다) 대신: 상위 10 = 번호 있는 주의·지연·장기 지연 사업 중 경과 개월 큰 10곳(D3 — 후보는 확인 필요로 따로) */
  const issuedChk = rows.filter((r) => r.issued && ['caution', 'delay', 'long'].includes(V.statusOf(r)));
  assert.ok(issuedChk.length > 0, '점검할 사업이 있다(빈 값으로 통과하지 않게)');
  assert.equal(top.length, Math.min(10, issuedChk.length));
  assert.ok(top.every((r) => r.issued && ['caution', 'delay', 'long'].includes(V.statusOf(r))), '월간 보고 우선 점검 = 번호 있는 사업의 주의·지연만');
  assert.deepEqual(top.map(V.lateOf), issuedChk.map(V.lateOf).sort((a, b) => b - a).slice(0, top.length), '경과 개월 큰 순');
  assert.equal(new Set(top.map((r) => `${r.sgg}|${r.name}`)).size, top.length);
  const all = V.listOrder(V.applyFilters(rows, {}));
  assert.ok(all.every((r, i) => i === 0 || (!!all[i - 1].issued >= !!r.issued && (!sameGroup(all[i - 1], r) || (V.overdueMonthsOf(all[i - 1]) ?? -1) >= (V.overdueMonthsOf(r) ?? -1)))), '목록 기본 순서 = 번호 있는 사업 먼저, 그 안에서 예정일 경과 개월 큰 순(후보끼리도 같은 계산 순, 경과 없는 사업은 뒤)');
});

test('핵심 질문 5(전체): 9·7 목표 대비(목표·확인이 함께 있는 첫 단계의 달성률) · 병목 · 지연(확인 필요 후보 없음, D3) · 먼저 챙길 시도 · 앞으로 12개월 준공(= 종합상황판 향후 12개월)', () => {
  const q = Q({});
  assert.deepEqual(Object.keys(q), ['9·7 대책 목표 대비', '어디서 막혀 있는가', '어떤 사업이 늦어지는가', '어디를 먼저 챙기는가', '앞으로 얼마나 공급되는가'], '첫 칸 범위(전국 · 정책 진행 자료)는 정책 목표 카드 머리의 범위 칩에');
  /* 판 숫자('129.9' · '사업화 확인 18,074 / 목표 13,914' · '사업화 20,303호') 대신 정책 진행 자료(policy-progress.json)에서 다시 만든 글 */
  const a = q['9·7 대책 목표 대비'], w = wantPolicy('POL_2025_0907');
  assert.deepEqual([a.value, a.unit, a.sub, a.tone, a.href], [w.value, '% 달성', w.sub, w.tone, '/projects?policy=97&sido=all']);
  for (const x of Object.values(q)) assert.ok(x.help && !/policy-progress|samePeriod|HOME|원장/.test(x.help), `ⓘ 정의는 쉬운 말: ${x.q}`);
  if (w.est.length) assert.ok(a.tip.includes(`담당자 추정 포함(확인과 따로): ${w.est.join(' · ')}`), '추정 포함은 title 에만');
  else assert.doesNotMatch(a.tip, /담당자 추정 포함/);
  assert.doesNotMatch(a.sub, /추정/);
  /* 판 숫자('③ 착공' 1,666호 · 지연 2 · 경기 5,004호 · 14,570호) 대신 사업 행에서 다시 센 값 */
  const all = V.applyFilters(rows, V.parseFilters({ sido: 'all' }, { policies: IDX.policies, programs: IDX.programs, sidoOk: () => true })), r = wantRest(all, false);
  assert.ok(r.neck != null && r.top, '지연·주의 사업이 있다(빈 값으로 통과하지 않게)');
  assert.deepEqual([q['어디서 막혀 있는가'].value, q['어디서 막혀 있는가'].sub, q['어디서 막혀 있는가'].href], [`${V.BOARD_CIR[r.neck]} ${V.BOARD_NAMES[r.neck]}`, `병목 · ${V.DELAY_GROUP} ${fmt(r.neckUnits)}호`, `/projects?sido=all&stage=${r.neck}&status=late`]);
  assert.deepEqual([q['어떤 사업이 늦어지는가'].value, q['어떤 사업이 늦어지는가'].sub, q['어떤 사업이 늦어지는가'].href], [fmt(r.delay + r.long), `지연 6~12개월 ${fmt(r.delay)} · 장기 12개월+ ${fmt(r.long)}`, '/projects?sido=all&status=late'], '보조 줄 = 머리 숫자의 구성(지연 + 장기), 주의는 따로. 2026-10-19 수도권 한정: 후보 0이라 확인 필요(후보) 꼬리 없음');
  assert.deepEqual([q['어디를 먼저 챙기는가'].value, q['어디를 먼저 챙기는가'].sub, q['어디를 먼저 챙기는가'].href], [sidoName(r.top[0]), `지연·주의 ${fmt(r.top[1])}호`, `/projects?sido=${r.top[0]}`]);
  const up = BOARD.upcoming.reduce((s, x) => ({ units: s.units + x.units, projects: s.projects + x.projects }), { units: 0, projects: 0 });
  assert.deepEqual([q['앞으로 얼마나 공급되는가'].value, q['앞으로 얼마나 공급되는가'].sub, q['앞으로 얼마나 공급되는가'].href], [up.units.toLocaleString('en-US'), `앞으로 12개월 · 준공 예정 · ${up.projects}건`, '/region?sido=all']);
  assert.deepEqual([up.units, up.projects], [r.upUnits, r.upN], '종합상황판 향후 12개월 = 사업 행에서 다시 센 값');
});

test('핵심 질문 5(9·7 렌즈): 정책 렌즈 안 값(목표 대비·병목·지연·먼저 챙길 시도·12개월 준공) / 1·29 는 목표가 없어 정상 비율 / 시도를 고르면 시군구', () => {
  const q = Q({ policy: pol('97') });
  /* 판 숫자(['129.9', …] · '③ 착공' · '2' · '경기' · '14,570') 대신 9·7 사업 행·정책 진행 자료에서 다시 센 값 */
  const w = wantPolicy('POL_2025_0907'), r = wantRest(rows.filter((x) => x.policies.includes('97')), false);
  assert.deepEqual(Object.values(q).map((x) => [x.value, x.sub]), [[w.value, w.sub], [`${V.BOARD_CIR[r.neck]} ${V.BOARD_NAMES[r.neck]}`, `병목 · ${V.DELAY_GROUP} ${fmt(r.neckUnits)}호`],
    [fmt(r.delay + r.long), `지연 6~12개월 ${fmt(r.delay)} · 장기 12개월+ ${fmt(r.long)}`], [sidoName(r.top[0]), `지연·주의 ${fmt(r.top[1])}호`], [fmt(r.upUnits), `앞으로 12개월 · 준공 예정 · ${r.upN}건`]]);
  assert.equal(q['9·7 대책 목표 대비'].href, undefined, '이미 9·7 렌즈');
  /* 1·29: 판 숫자('100.0' · '판정 38건 · 판정 없음 9') 대신 1·29 사업 행에서 다시 센 정상 비율·판정 수 */
  const q129 = Q({ policy: pol('129') }), r129 = rows.filter((x) => x.policies.includes('129')), j129 = r129.filter((x) => x.issued && x.cls);
  assert.ok(j129.length > 0);
  assert.deepEqual([q129['계획대로 가고 있는가'].value, q129['계획대로 가고 있는가'].unit, q129['계획대로 가고 있는가'].sub], [p1(j129.filter((x) => x.cls === 'ok').length / j129.length * 100), '% 정상', `판정 ${fmt(j129.length)}건 · 판정 없음 ${fmt(r129.length - j129.length)}`]);
  const n129 = wantRest(r129, false);
  assert.deepEqual([q129['어디서 막혀 있는가'].value, q129['어디서 막혀 있는가'].muted, q129['어디서 막혀 있는가'].href], n129.neck == null ? ['없음', true, undefined] : [`${V.BOARD_CIR[n129.neck]} ${V.BOARD_NAMES[n129.neck]}`, false, q129['어디서 막혀 있는가'].href]);
  const qm = Q({ metro: true }), rm = wantRest(V.applyFilters(rows, { metro: true }), false);
  assert.deepEqual([qm['어디서 막혀 있는가'].href, qm['앞으로 얼마나 공급되는가'].href], [`/projects?sido=metro&stage=${rm.neck}&status=late`, '/region'], '수도권(기본) 범위의 링크는 수도권을 지킨다');
  /* 시도를 고르면 시군구: 판 숫자('수원시' · ?sgg=41110) 대신 경기 사업 행에서 다시 센 주의·지연 호수 최대 시군구 */
  const q41 = Q({ sido: '41' }), r41 = wantRest(rows.filter((x) => x.sgg.startsWith('41')), true);
  assert.ok(r41.top, '경기에 주의·지연 사업이 있다');
  assert.deepEqual([q41['어디를 먼저 챙기는가'].value, q41['어디를 먼저 챙기는가'].href], [ctx.sggName(r41.top[0]), `/projects?sgg=${r41.top[0]}`]);
  assert.equal(q41['앞으로 얼마나 공급되는가'].href, '/region?sido=41');
});

test('단계 파이프라인: 이 단계까지 온 사업(현재 단계 기준 누적, D4 — ①계획 = 전체)이 있는 칸만 열고 나머지는 접은 한 칸', () => {
  const p = (f) => V.pipelineOf(V.applyFilters(rows, f, 'stage'));
  /* 판 숫자([[0, 289], [1, 127], [2, 112], [3, 41]] · 접힘 [4, 5] · 9·7 [[0, 167, 144771], …] · 1·29 접힘 [1~5]) 대신 행에서 다시 센 값: 이 단계까지 온 사업 = 현재 칸이 그 칸 이상 */
  const want = (scope) => {
    const cell = V.BOARD_NAMES.map((_, i) => { const xs = scope.filter((r) => r.board >= i); return [i, xs.length, summed(xs)]; });
    return { open: cell.filter((c) => c[1] > 0), shut: cell.filter((c) => c[1] === 0).map((c) => c[0]), total: scope.length };
  };
  const all = p({}), wa = want(rows);
  assert.deepEqual([all.open.map((c) => [c.i, c.n, c.units]), all.shut, all.total], [wa.open, wa.shut, wa.total]);
  assert.equal(all.open[0].units, rows.reduce((s, r) => s + r.units, 0), '①은 범위 전체');
  const r97 = rows.filter((r) => r.policies.includes('97')), p97 = p({ policy: pol('97') }), w97 = want(r97);
  assert.deepEqual([p97.open.map((c) => [c.i, c.n, c.units]), p97.shut, p97.total], [w97.open, w97.shut, w97.total]);
  assert.deepEqual(p({ policy: pol('129') }).shut, want(rows.filter((r) => r.policies.includes('129'))).shut);
  assert.ok(rows.every((r) => r.reached.every((i) => i >= 1 && i <= 5)), 'reached 는 리본 칸 1~5');
});

test('9·7 목표 대비 = policy-progress samePeriod(올해 1월~기준 달 앞 달), 확인과 담당자 추정을 나눈다 — 칸 상태·막대·설명 글이 자료 값 그대로', () => {
  const cells = V.policyStageCells(PP, 'POL_2025_0907');
  const st = PP.policies[0].stages;
  /* 판 무관: 기간 = 올해 1월 ~ 기준 달 앞 달 말(policy-progress referenceMonthEnd — 10-22 판 2026.01~2026.09 · 11-10 판 2026.01~2026.10) */
  const year = Number(PP.referenceMonthEnd.slice(0, 4)), span = `${year}.01~${PP.referenceMonthEnd.slice(0, 7).replace('-', '.')}`;
  assert.deepEqual(cells.map((c) => c.key), ['BUSINESS', 'APPROVAL', 'CONSTRUCTION', 'SUPPLY', 'COMPLETION', 'MOVE_IN']);
  for (const c of cells) {
    const s = st[c.key].samePeriod.find((y) => y.year === year);
    assert.deepEqual([c.target, c.actual, c.withEst, c.gap, c.shortfallPct, c.review], [s.target, s.actual, s.actualWithEstimates, s.gap, s.shortfallPct, s.actualReviewUnits], c.key);
    /* 판 숫자(공급 short 8,049·4,963·8,742 · 사업화 met 13,914·18,074 · 칸 상태 목록) 대신 규칙: 목표·확인이 다 있으면 GAP → short 아니면 met, 확인만 noTarget, 목표만 noActual, 둘 다 없으면 none */
    const state = s.target != null && s.actual != null ? (s.status === 'GAP' ? 'short' : 'met') : s.actual != null ? 'noTarget' : s.target != null ? 'noActual' : 'none';
    assert.equal(c.state, state, c.key);
    /* 막대: 확인 막대 = 확인/목표(100에서 멈춤), 추정 포함 막대도 목표에서 멈춘다 */
    if (c.target && c.actual != null) assert.equal(c.fill, Math.min(100, c.actual / c.target * 100), c.key);
    if (c.target && c.withEst != null) assert.equal(c.estFill, Math.min(100, c.withEst / c.target * 100), c.key);
    if (V.hasEstimate(c)) for (const t of [`확인 ${fmt(c.actual)}호`, `추정 포함 ${fmt(c.withEst)}호`, fmt(c.target), `달성 ${p1(c.actual / c.target * 100)}%${c.state === 'short' ? `(목표까지 ${fmt(c.gap)}호)` : ''}`, span]) assert.ok(V.stageCellTip(c).includes(t), `${c.key} ${t}`);
  }
  /* HOME 정책 화면 응답(판이 같을 때): 같은 기간 목표·추정 포함 = HOME */
  const view = E.golden('S1-view-policy.json').doc;
  if (view) for (const c of cells) assert.deepEqual(E.homePeriod(view, c.key, c.from, c.through), { target: c.target, actual: c.withEst }, c.key);
  assert.deepEqual(cells[2].yearEnd, { date: '2026-12-31', units: 269000 }, '착공은 9·7 원문 연도별 목표의 연말 점');
  assert.equal(cells[2].withEst, cells[2].actual, '착공(지역 통계)·준공은 추정 입력이 없다');
  assert.deepEqual(cells.map(V.hasTarget), cells.map((c) => c.target != null || !!c.yearEnd));
  assert.equal(V.policyStageCells(PP, 'POL_2026_0129'), null, '1·29·8·13 은 비교 자료 없음');
});

test('목표 대비 줄: 렌즈 전체 = 목표가 배정된 정책(9·7)만 · ⑥ 목표 미배정 한 번 · 9·7 렌즈도 같은 한 줄 · 1·29 렌즈는 없음', () => {
  const all = V.compareLines(PP, IDX.policies, rows, IDX.policies.map((p) => p.key));
  assert.deepEqual(all.map((l) => [l.policy.key, l.n, l.units, l.none, l.review, l.confirmed]), [['97', 167, 144771, [5], 0, 167]]);   // 2026-10-22 새 덤프(20261021T212310Z): 9·7 새 사업 1(1,160호) · 2026-10-21 새 덤프(20261020T142230Z): 9·7 새 사업 3(103호) · 2026-10-20 HOME 판: 9·7 연결 사업 141→166 → 2026-10-20 같은 현장 병합 6쌍 163·143,508호(평택고덕 공사 계약 3곳 2,122호 빠짐)
  assert.deepEqual(V.compareLines(PP, IDX.policies, rows, ['97']).map((l) => l.policy.key), ['97']);
  assert.deepEqual(V.compareLines(PP, IDX.policies, rows, ['129']), []);
});

test('단계 타임라인(서랍): 수원당수 A5 — 기록 있는 단계만 ③④⑤⑥ 줄, 착공 실제 2023.12 공사 막대(오늘까지)·준공 예정 2027.02·입주 예정 2027.06, 공정률 마지막 68%', () => {
  const id = 'PRJ-41113-0035', d = DET.projects[id], row = rows.find((r) => r.id === id);
  assert.equal(d.stages.COMPLETION.plan, row.next.planned);
  const t = V.timelineOf(d, DET.referenceDate);
  assert.deepEqual(t.years, [2023, 2024, 2025, 2026, 2027]);
  assert.equal(t.todayText, DET.referenceDate.slice(0, 7).replace('-', '.'), '오늘 = 상세 자료 기준일의 달');
  assert.deepEqual(t.lanes.map((l) => l.board), [2, 3, 4, 5], '①계획·②인허가는 기록이 없어 줄이 없다');
  const build = t.lanes[0];
  assert.equal(build.actual.title, '착공 실제 2023.12.21');
  assert.ok(build.actualBar.from === build.planBar.from && build.actualBar.to === t.today && build.planBar.to > t.today, '공사 막대: 착공부터 오늘까지 실선, 준공 예정까지 점선');
  assert.deepEqual(t.lanes.map((l) => l.plan?.tag ?? null), [null, null, '2027.02', '2027.06']);
  assert.deepEqual(t.lanes.map((l) => l.actual?.tag ?? null), ['2023.12', '2024.11', null, null]);
  assert.deepEqual(t.used, { plan: true, actual: true, late: false, missing: false }, '범례는 그린 표지만');
  assert.deepEqual(t.progress[t.progress.length - 1], { at: t.progress[t.progress.length - 1].at, pct: 68, text: '2026.10.07 보고 68.0%' });
  assert.ok(t.progress.every((p, i, a) => i === 0 || p.at >= a[i - 1].at), '보고일 순');
  const late = V.timelineOf({ ...d, progress: [], stages: { CONSTRUCTION_START: { plan: '2025-03', late: { months: 7, cls: 'delay' } }, COMPLETION: { plan: '2026-01', actual: '2026-04' } } }, DET.referenceDate);
  assert.deepEqual([late.lanes[0].plan.tag, late.lanes[0].plan.late, late.lanes[0].late.months], ['2025.03 +7개월', 'delay', 7]);
  assert.match(late.lanes[0].missing, /예정일이 지났는데 실제 기록 없음/);
  assert.equal(late.lanes[1].actual.title, '준공 실제 2026.04 · 현재 예정 대비 +3개월', '예정 대비 차이는 실제 점의 title');
  assert.deepEqual(late.used, { plan: true, actual: true, late: true, missing: true });
});

test('상세의 현재 예정·경과는 목록(지도 색인)과 같은 값이다 — 발급 사업 전부', () => {
  for (const r of rows.filter((x) => x.issued)) {
    const d = DET.projects[r.id];
    if (r.next) assert.equal(d.stages[r.next.eventType]?.plan, r.next.planned, `${r.id} 다음 일정`);
    if (r.overdue && (r.cls === 'delay' || r.cls === 'caution')) assert.equal(d.stages[r.overdue.eventType]?.late?.months, r.overdue.months, `${r.id} 경과`);
    for (const s of Object.values(d.stages)) if (s.late) assert.ok(['delay', 'caution'].includes(s.late.cls), `${r.id}: 경과 1개월 미만은 표시하지 않는다`);
  }
});

test('서랍이 열 것(?id=): 발급 사업 → 그 사업, 대체된 옛 id → 대표 사업(옛 id 안내), 숨김 → 안내 한 줄, 발급 전 후보·없는 id → 열지 않음', () => {
  const has = (id) => id in DET.projects;
  assert.deepEqual(V.drawerTarget('PRJ-41113-0035', REG, has), { kind: 'detail', id: 'PRJ-41113-0035', from: null });
  const sup = REG.filter((p) => p.supersededBy);
  assert.ok(sup.length > 0);
  for (const p of sup) assert.deepEqual(V.drawerTarget(p.id, REG, has), { kind: 'detail', id: p.supersededBy, from: { id: p.id, name: p.name } }, p.id);
  const hid = REG.filter((p) => p.hiddenAt && !p.supersededBy);
  assert.equal(hid.length, 71);   // 2026-10-19 수도권 한정: 숨김 55 → 71 (광산 4·나주 12 추가)
  for (const p of hid) assert.equal(V.drawerTarget(p.id, REG, has).kind, 'hidden', p.id);
  // 2026-10-19 수도권 한정: 원장에 후보 행이 없어 임시 후보 번호(CAND-…)로 확인한다
  assert.ok(rows.every((r) => r.issued), '원장 행은 모두 발급 사업');
  assert.equal(V.drawerTarget('CAND-28245-0001', REG, has), null, '발급 전 후보는 임시 번호라 서랍을 열지 않는다');
  for (const x of ['PRJ-0000-0001', 'x', '']) assert.equal(V.drawerTarget(x, REG, has), null, x);
});

test('화면 적용: 목록은 발급 사업을 상세 창(?id=), 번호 발급 전 사업을 간단 보기(?cand=)로 열고, 창은 그 사업 자료만 서버(projectWindow)에서 받는다. 인쇄 보기는 요약·우선 점검·출처만', () => {
  const page = read('app/(dashboard)/projects/page.tsx');
  const lst = read('lib/board/projects-list.ts');
  assert.match(lst, /const href = r\.issued \? listHref\(f, \{ id: r\.id \}\) : listHref\(f, \{ cand: r\.id \}\);/, '원장 판 listRows 는 그대로');
  assert.match(lst, /id: r\.id, href, sel: r\.id === sel,/, '행을 누르면 사업 창, 열린 사업은 선택 표시');
  /* 2026-10-21: 사업 화면 목록 = HOME 원천 행(PRO_ — 모두 ?id=, 후보 ?cand= 행은 목록에 없다) */
  assert.match(lst, /export function homeListRows[\s\S]*const href = listHref\(f, \{ id: r\.id \}\);/);
  assert.match(page, /const gridRows: Row\[\] = homeListRows\(list, f, sel,/, '화면 표와 CSV 가 같은 행');
  assert.match(page, /getProjectDrawer\(/);
  /* 2026-10-19 서랍 → 모달리스 창: 첫 창은 projectWindow(허용 목록) 결과만 창 관리자에 넘긴다(?id= 상세, 없으면 ?cand= 간단 보기, 인쇄 보기에는 만들지 않음) */
  assert.match(page, /print \? null : \(async \(\) => \(id \? await projectWindow\(id, 'admin'\) : null\) \?\? \(candId \? await projectWindow\(candId, 'admin', \{ cand: true \}\) : null\)\)\(\)/);
  assert.match(page, /<WindowSeed win=\{win\} path="\/projects" search=\{search\} fromMap=\{f\.from === 'map'\} \/>/);
  assert.match(page, /const sel = win \? win\.canonical : null;/);
  assert.doesNotMatch(page, /<ReqTags/, '요구사항 칩은 데이터 원본에만');
  assert.match(page, /href=\{listHref\(f, \{ print: '1' \}\)\}/, '보고서 인쇄는 지금 거르기를 지킨 인쇄 보기');
  const printBranch = page.slice(page.indexOf('if (print) {'), page.indexOf('/* 목록:'));
  for (const x of ['{reportHead}', '{summary}', '{report}', '<PrintButton']) assert.ok(printBranch.includes(x), x);
  for (const x of ['<DataGrid label="사업 목록"', '<WindowSeed', '<ChipBar']) assert.ok(!printBranch.includes(x), `인쇄 보기에 ${x} 없음`);
  assert.match(page, /print:hidden/, '@media print 도 같은 보고 보기');
  assert.doesNotMatch(page, /SAMPLE/);
  /* 창 관리자: Esc 하나 · 마지막 창 닫기 = 쌓은 기록만큼 뒤로(back) 아니면 id 를 뺀 주소(replace) — 규칙은 nav.ts navStep(tests/js/windows.test.cjs) · 창 폭 기본 560(400 ~ 화면 60%) */
  const host = read('components/windows/WindowHost.tsx'), win = read('components/windows/FloatingWindow.tsx');
  assert.match(host, /e\.key !== 'Escape'/); assert.match(host, /window\.history\.back\(\)/); assert.match(host, /window\.history\.replaceState\(null, '', url\)/);
  assert.match(win, /w-\(--win-w\) max-w-\[60vw\] min-w-\[400px\]/, '기본 560 · 최소 400 · 최대 화면 60%');
  assert.match(read('components/windows/nav.ts'), /export const WIN_W = 800;[\s\S]*export const WIN_W_MIN = 400;[\s\S]*export const WIN_W_MAX = 0\.6;/);
  const det = read('components/projects/ProjectDetail.tsx');
  assert.match(det, /<StageSteps home(?:=\{home\})? current=\{r\.board\} reached=\{r\.reached\}/, '서랍의 단계 줄도 목록과 같은 리본 칸 번호');
  assert.match(det, />당초 일정 없음</, "타임라인 머리에 '당초 일정 없음' 한 번");
  assert.match(det, /hiddenNote\(p\.hiddenAt!, p\.hiddenReason\)/);
  /* 화면은 자료를 lib/board/projects-index.ts 한 곳에서만 읽고, 옛 상세·보고자료 화면은 없다 */
  for (const f of ['app/(dashboard)/projects/page.tsx', 'components/projects/ProjectDetail.tsx', 'components/projects/Summary.tsx', 'lib/board/project-window.ts', 'components/windows/WindowHost.tsx', 'components/windows/parts.tsx', 'app/api/v1/project/[id]/route.ts']) assert.doesNotMatch(read(f), /data\/board\/(ledger-map|projects-index|project-detail|policy-progress)\.json/, f);
  for (const f of ['app/(dashboard)/project', 'app/(dashboard)/reports']) assert.ok(!fs.existsSync(path.join(ROOT, f)), f);
});

test('옛 주소 넘김(next.config.ts redirects, 모두 307): 사업 상세 → 서랍, 보고자료 → 인쇄 보기, 공급 실적·시행주체별·우리 동네 → 지역 공급. 월·기관 상세는 넘기지 않는다', async () => {
  const cfg = require('../../next.config.ts').default;
  const list = await cfg.redirects();
  assert.deepEqual(list.map((r) => [r.source, r.destination]), [
    ['/stage', '/projects'], ['/stage/:id(0[1-6])', '/projects?stage=:id'], ['/area/:sgg(\\d{5})', '/projects?sgg=:sgg'],
    ['/project/:id', '/projects?id=:id'], ['/reports', '/projects?print=1'],
    ['/area', '/region'], ['/area/:sido(\\d{2})', '/region?sido=:sido'], ['/agency', '/region'], ['/my-area', '/region'], ['/my-area/:sido', '/region?sido=:sido'],
  ]);
  assert.ok(list.every((r) => r.permanent === false), '임시(307)');
  for (const p of ['/month', '/agency/:']) assert.ok(!list.some((r) => r.source.startsWith(p)), `${p} 는 넘기지 않는다`);
  assert.ok(fs.existsSync(path.join(ROOT, 'app/(dashboard)/month/[id]/page.tsx')) && fs.existsSync(path.join(ROOT, 'app/(dashboard)/agency/[id]/page.tsx')));
});

test('숨김 사업 안내: 한 줄 + 이유는 title, 덤프 판 번호·내부 문서 이름은 내지 않는다 · 시군구는 이름', () => {
  const h = REG.filter((p) => p.hiddenAt);
  assert.ok(h.length > 0);
  for (const p of h) {
    const n = V.hiddenNote(p.hiddenAt, p.hiddenReason);
    assert.equal(n.text, `${p.hiddenAt.replace(/-/g, '.')}부터 목록에서 뺀 사업입니다 · 대신할 사업 없음`);
    assert.doesNotMatch(n.title, /데이터-정제|절 \d|\d{8}T\d{6}Z/, p.id);
    // 2026-10-19 수도권 한정: 색인 시군구 이름은 수도권만 — 숨긴 광산·나주(12·46)는 이름 없이 코드로 안내
    assert.ok(IDX.sgg[p.sgg] || !['11', '28', '41'].includes(p.sgg.slice(0, 2)), `${p.id}: 수도권 시군구 ${p.sgg} 이름이 있다`);
  }
  assert.equal(V.hiddenNote('2026-10-14', 'HOME 덤프 20261013T140241Z 에 대응 사업이 없다(수도권은 HOME 이 정본 — 데이터-정제-계획 6절 3)').title, 'HOME 자료에 대응 사업이 없다(수도권은 HOME 이 정본)');
});
