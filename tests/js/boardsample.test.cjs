'use strict';
// lib/board/sample.ts — 시안에서 옮긴 달 이름·구분·리본 좌표가 시안 원본과 같은 값을 내는지, 시안을 실행해 뽑은 기준값
// (tests/fixtures/board-sample-golden.json)과 비교한다. 원장 집계(data/board/ledger-board.json)로 바꾼 리본 기하·판정 문구와
// 월 판정 이력(trend)으로 바꾼 지연·주의 추이·선택 달 판정·지연 띠는 원장 값으로 다시 계산해 확인한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../../lib/board/sample.ts');
const G = require('../fixtures/board-sample-golden.json');
const L = require('../../data/board/ledger-board.json');
const T = S.timelineOf(L);                                   // 화면의 시점은 원장 집계에서 읽는다
const T0 = S.timelineOf({ months: L.months, now: L.now });   // 시안처럼 기준 달까지 실제(actualThrough 없음), trend 없음(기준 달만 판정)
const { trend: _t, ...OLD } = L;                            // 옛 집계(trend 없음, JSON 대체 등)
const J = S.judgmentsOf(L), DL = S.delaysOf(J), TR = S.trendOf(T, J);

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b)), `${msg}: ${a} ≠ ${b}`);
const nearAll = (a, b, msg) => { assert.equal(a.length, b.length, msg); a.forEach((v, i) => near(v, b[i], `${msg}[${i}]`)); };

test('46개 시점의 월 이름·구분이 시안과 같다(원장 시점 = 시안 시점, 기준 달까지 실제)', () => {
  assert.equal(G.months.length, T.last + 1);
  for (const g of G.months) {
    assert.equal(S.ml(T, g.m), g.label);
    assert.equal(S.kind(T0, g.m), g.kind);
  }
});

test('지연·주의 추이(월 판정 이력): 점 = 0 … NOW 달마다 하나, 값 = 이력 행의 지연·주의 호수(기준 달은 원장 판정), 세로 맨 위 = 4 × 간격, 선 끝 이름표 = 선택 달 값과 전월 대비 실제 차이', () => {
  assert.equal(L.trend.length, T.now + 1, '2025.01~2026.09 소급 21행 + 2026.10 관측 1행');
  assert.deepEqual(T.judged, Array.from({ length: T.now + 1 }, (_, i) => i));
  assert.equal(TR.length, T.now + 1); assert.ok(TR.every(Boolean), '점 수 = NOW + 1');
  L.trend.forEach((r, i) => assert.deepEqual(TR[i], { d: r.delay.units, w: r.caution.units }, r.month));
  assert.deepEqual(TR[T.now], { d: L.judgment.delay.units, w: L.judgment.caution.units });
  /* 세로 맨 위: 최댓값 이상인 가장 작은 1·1.2·1.5·2·2.5·3·4·5·6·8 × 10^n(눈금선 y=55·100·145 = 3/4·1/2·1/4) */
  assert.equal(S.trendMax(215282), 250000); assert.equal(S.trendMax(70000), 80000); assert.equal(S.trendMax(100000), 100000); assert.equal(S.trendMax(9000), 10000); assert.equal(S.trendMax(0), 1);
  const max = Math.max(...TR.flatMap((r) => [r.d, r.w])), top = S.trendMax(max);
  assert.ok(top >= max && top <= max * 1.25, `맨 위 ${top} 는 최댓값 ${max} 이상, 1.25배 이하`);
  assert.equal(S.trendAt(T, TR, 0).dd, 0, '첫 달 증감은 0');
  for (let m = 0; m <= T.now; m++) {
    const t = S.trendAt(T, TR, m);
    assert.deepEqual(t, { d: TR[m].d, w: TR[m].w, dd: m ? TR[m].d - TR[m - 1].d : 0, dw: m ? TR[m].w - TR[m - 1].w : 0 }, `선택 달 ${m} 의 값 = 이력 값, 증감 = 전월 차이`);
  }
  assert.deepEqual(S.trendAt(T, TR, T.last), S.trendAt(T, TR, T.now), 'NOW 뒤 달은 NOW');
  /* 이름표 겹침: 간격이 좁으면 아래쪽을 내리고, 바닥을 넘으면 위쪽을 올린다. 입력 순서대로 돌려준다 */
  assert.deepEqual(S.apart(50, 60, 36, 150), [50, 86]); assert.deepEqual(S.apart(60, 50, 36, 150), [86, 50]);
  assert.deepEqual(S.apart(50, 120, 36, 150), [50, 120], '충분히 떨어지면 그대로');
  assert.deepEqual(S.apart(140, 145, 36, 150), [114, 150], '바닥을 넘으면 위쪽을 올린다');
  const trend = panel(board, 'p-trend');
  assert.match(trend, /points=\{pts\('w'\)\}[\s\S]*points=\{pts\('d'\)\}/);
  assert.match(board, /const pts = \(k: 'd' \| 'w'\) => TR\.flatMap\(\(r, m\) => \(r \? \[tx\(m\) \+ ',' \+ ty\(r\[k\]\)\] : \[\]\)\)\.join\(' '\);/);
  assert.match(board, /tyn = \(val: number\) => TPT \+ TPH - val \/ tmax \* TPH/, '세로 축척은 이력 최댓값에 맞춘 tmax');
  assert.match(trend, /\[0\.25, 0\.5, 0\.75\]\.map\(\(fr\) => <line /, '눈금선 3개(글자 없음)');
  assert.doesNotMatch(trend, /<text|<Key|legend|txTrend|Reserve/, '범례 칩·아래 문장 없음(svg 안 글자 없음)');
  assert.match(board, /tsel = trendAt\(T, TR, cursor\)/, '이름표 값 = 선택 달'); assert.match(trend, /tsel\?\.d, tsel\?\.dd/);
  assert.match(trend, /이름표 = 선택 달 값과 전월 대비 증감/, 'h2 title 끝');
  assert.match(trend, /\{ml\(T, 0\)\}<\/span><span>\{ml\(T, NOW\)\}/, 'x축 글자는 양 끝 둘');
});

test('옛 집계(trend 없음): 판정은 기준 달만 — 추이는 기준 달 한 점, 증감 0, 앞 달 지연 띠 0', () => {
  const TO = S.timelineOf(OLD), JO = S.judgmentsOf(OLD), TRO = S.trendOf(TO, JO);
  assert.deepEqual(TO.judged, [TO.now]);
  assert.equal(TRO.filter(Boolean).length, 1);
  assert.deepEqual(TRO[TO.now], { d: L.judgment.delay.units, w: L.judgment.caution.units });
  assert.equal(S.trendAt(TO, TRO, TO.now).dd, 0); assert.equal(S.trendAt(TO, TRO, 5), null, '판정 달 이전은 null');
  assert.deepEqual([S.judgedAt(TO, 5), S.judgedAt(TO, TO.now), S.judgedAt(TO, 30)], [-1, TO.now, TO.now]);
  const DO = S.delaysOf(JO);
  assert.deepEqual(S.delayAt(TO, DO, TO.now - 1), [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(S.delayAt(TO, DO, TO.now), L.delayByStage);
  assert.deepEqual(S.delayAt(TO, DO, TO.last), L.delayByStage);
  const R = S.ribbonOf(TO, L.stageUnits, DO);
  for (const g of R.geo) if (g.x < TO.now) assert.deepEqual(g.dl, [0, 0, 0, 0, 0, 0], `x=${g.x}`);
});

test('지시 6건: 값은 모두 자료에서 센다(통계누리 착공 누계·원장 집계·원천 수), 날짜·제목·연결 패널·인용문은 시안 그대로이고, 원장 시도는 통계누리 시도 코드(짧은 이름·/area 링크)로 이어진다', () => {
  const { makeDirectives } = require('../../lib/board/directives.ts');
  const BN = require('../../lib/board/projects-view.ts').bottleneckOf;
  const molit = require('../../data/board/molit.json'), C = require('../../lib/board/calc.ts');
  const last = C.lastMonth(molit), cum = C.ytd(molit, 'start', C.NATION, last), cumLy = C.ytd(molit, 'start', C.NATION, C.nextYm(last, -12));
  const start = { year: last.slice(0, 4), upto: Number(last.slice(5)), cum, cumLy };
  const dir = makeDirectives({ sourceCount: 19, stageNames: S.K, ledger: L, start, bottleneck: BN });
  assert.deepEqual(dir.map((d) => [d.date, d.t, d.p]), [['08.14', '진척 관리', ['p-chart']], ['08.19', '사업장별 현황판', ['p-region']], ['09.03', '범부처 통합·병목', ['p-trend', 'p-agency']], ['09.04', '예측가능성', ['p-fut']], ['09.18', '일정 지연 관리', ['p-trend']], ['09.30', '국민 공개·공식 원천', ['p-flow']]]);
  dir.forEach((d, i) => { assert.ok(d.basis.length > 10, `표지 title ${i}`); });
  const yoy = (cum - cumLy) / cumLy * 100;
  /* 카드 아랫줄 = 앞말(pre) + 큰 숫자(big) + 단위(u): 문자열을 자르지 않고 나눈 필드로 그린다. m 은 셋을 이은 읽기용 한 줄 */
  for (const d of dir) assert.equal(d.m, `${d.pre ? d.pre + ' ' : ''}${d.big}${d.u}`);
  assert.deepEqual([dir[0].pre, dir[0].big, dir[0].u], ['착공', S.f(cum), '호']);
  assert.equal(dir[0].sub.text, `${yoy >= 0 ? '▲' : '▼'}${Math.abs(yoy).toFixed(1)}%`);
  assert.match(dir[0].basis, /달성률은 내지 못합니다/);
  assert.match(dir[0].basis, new RegExp(`착공 ${start.year}년 1~${start.upto}월 누계와 전년 같은 기간 대비`), '착공 누계의 기간(통계누리 마지막 달)은 카드 title 에 — 원장 기준 카드들과 기간이 다르다');
  assert.equal(dir[0].sub.note, undefined, '기간 작은 줄은 화면에 두지 않는다(title 로)');
  assert.deepEqual([dir[1].pre, dir[1].big, dir[1].u], [undefined, S.f(L.scope.projects), '건']);
  assert.equal(L.scope.projects, L.scope.issued + L.scope.candidates);
  const b = L.scope.bySource;
  assert.match(dir[1].basis, new RegExp(`^원장 ${L.observedMonth.replace('-', '.')} 기준 · 전국 · 사업 ${S.f(L.scope.projects)}건\\(발급 ${b.issued} · LH 후보 ${b.lhCandidates} · 건축HUB 후보 ${S.f(b.hubBulkCandidates)}${b.home ? ` · 수도권 HOME ${S.f(b.home)}` : ''}\\)$`));
  /* D3(2026-10-15): 판정은 사업 번호가 있는 사업만, 후보는 '확인 필요(후보)'로 따로 — 카드 title 에 후보 계산 결과 */
  const c = L.judgment.candidate;
  assert.match(dir[4].basis, new RegExp(`^원장 ${L.observedMonth.replace('-', '.')} 기준 · 전국 · 판정 ${S.f(L.scope.judged)}건\\(사업 번호가 있는 사업 — 착공·준공 예정 경과 · 확인 필요\\(후보\\) ${S.f(L.scope.candidateJudged)}건은 번호가 없는 후보라 따로 셈\\(건축HUB 후보, 준공 예정 경과만 계산\\) · 판정 밖: LH 후보 ${b.lhCandidates}건, 건축HUB 후보의 착공 예정 경과 ${S.f(L.judgment.excludedStartOverdue.pairs)}건\\) 중 지연·주의 · 확인 필요\\(후보\\): 계산하면 지연 ${S.f(c.delay.projects)} · 주의 ${S.f(c.caution.projects)} · 정상 ${S.f(c.ok.projects)}건\\(지연·주의에 넣지 않음\\)$`));
  assert.doesNotMatch(dir.map((d) => d.basis).join(' '), /전국 아님/);
  const bk = L.delayByStage.indexOf(Math.max(...L.delayByStage));
  assert.deepEqual([dir[2].pre, dir[2].big, dir[2].u], [`병목 ${S.K[bk]}`, S.f(L.delayByStage[bk]), '호']);
  assert.deepEqual([dir[3].pre, dir[3].big, dir[3].u], ['준공 예정', S.f(L.upcoming.reduce((n, m) => n + m.units, 0)), '호']);
  assert.deepEqual([dir[4].pre, dir[4].big, dir[4].u], ['지연', S.f(L.judgment.delay.projects), '건']);
  assert.deepEqual(dir[4].sub, { text: `주의 ${S.f(L.judgment.caution.projects)}`, tone: 'warn' });
  assert.equal(makeDirectives({ sourceCount: 19, stageNames: S.K, ledger: L, start, bottleneck: BN })[5].m, '원천 19곳');
  assert.equal(makeDirectives({ sourceCount: 14, stageNames: S.K, ledger: L, start: { ...start, cum: null }, bottleneck: BN })[0].sub, undefined, '누계가 없으면 증감을 내지 않는다');
  const codes = require('../../data/board/molit.json').sido.map((s) => s.code);
  assert.equal(L.regions.length, 16);
  for (const r of L.regions) assert.ok(codes.includes(r.code), `${r.name} → ${r.code}`);
  assert.ok(L.regions.some((r) => r.code === '12'), '2026-07 통합: 광주·전남은 12(전남광주) 하나');
});

test('원장 집계와 화면 시점이 같은 칸이다: 46개월(2025-01~2028-10), NOW = 2026-10, 실제 날짜는 2026-08까지, 단계 6칸', () => {
  assert.equal(L.schema, 'ledger-board/1');
  assert.deepEqual([T.months, T.now, T.last], [L.months, L.now, L.months.length - 1]);
  assert.deepEqual([T.last, T.months[0], T.months[T.last]], [45, '2025-01', '2028-10']);
  assert.equal(L.observedMonth, T.months[T.now], '첫 판 NOW = 21(2026-10)');
  /* 실제 날짜 = 건축HUB 대용량 판의 데이터 월(첫 판 2026-08, 19) */
  const ed = L.trend[L.trend.length - 1].edition, a = L.months.indexOf(ed);
  assert.deepEqual([L.actualThrough, T.actual, L.actualIndex], [ed, a, a]);
  assert.deepEqual([S.kind(T, a), ...Array.from({ length: T.now - a - 1 }, (_, i) => S.kind(T, a + 1 + i)), S.kind(T, T.now), S.kind(T, T.now + 1)],
    ['실적 기준', ...Array(T.now - a - 1).fill('예정 기준'), '현재', '예정 기준'], '실제 날짜 뒤 달(첫 판 2026.09)은 예정 기준');
  assert.equal(T0.actual, T0.now, 'actualThrough 가 없는 옛 집계는 기준 달까지 실제');
  for (const row of L.stageUnits) assert.equal(row.length, S.K.length);
  assert.equal(L.delayByStage.length, S.K.length);
});

test('리본 차트 기하(원장): 좌표 상수는 시안과 같고, 층 두께 = 그 달 단계별 호수, 층은 바닥(BOT)부터 빈틈없이 쌓인다', () => {
  assert.deepEqual([S.PX0, S.PW, S.TOP].map(Number), [G.consts.PX0, G.consts.PW, G.consts.TOP]);
  assert.deepEqual([S.PH, S.BOT], [G.consts.PH, G.consts.BOT], '세로는 시안 값(아래 달 이름 줄이 없어 기준 글자만 BOT 아래에 둔다)');
  const R = S.ribbonOf(T, L.stageUnits, DL);
  near(R.pitch, G.consts.PITCH, 'PITCH');
  G.x.forEach(([v, x]) => near(R.X(v), x, `X(${v})`));
  assert.ok(S.textBox(S.staticTexts(R).now).y >= S.BOT + 7, '기준 글자 상자가 플롯(BOT)·1월 눈금(7) 안으로 들어가지 않는다');
  R.total.forEach((t, m) => assert.equal(t, L.stageUnits[m].reduce((a, b) => a + b, 0), `총량 ${m}`));
  assert.equal(R.step, 500000); assert.equal(R.ymax, 1500000, '세로 축척은 가장 큰 총량을 눈금 간격 단위로 올린 값(수도권 HOME 교체 뒤 총량 약 141만, 2026-10-14)');
  assert.ok(R.ymax >= Math.max(...R.total) && R.ymax - Math.max(...R.total) < R.step);
  near(R.s2, S.PH / R.ymax, 's2');
  assert.equal(R.geo.length, 4 * (T.last + 1) + 1, '0.25개월 간격');
  for (let m = 0; m <= T.last; m++) {
    const g = R.geo[4 * m + 2];   // 칸 가운데(m + 0.5) = 그 달 값 그대로
    near(g.x, m + 0.5, 'x');
    for (let k = 0; k < 6; k++) near((g.lw[k] - g.up[k]) / R.s2, L.stageUnits[m][k], `층 두께 ${m}/${k}`);
    for (let k = 0; k < 5; k++) near(g.lw[k], g.up[k + 1], `층 이음 ${m}/${k}`);
    near(g.up[0], S.BOT - R.total[m] * R.s2, `위 ${m}`); near(g.lw[5], S.BOT, `아래 ${m}`);
  }
  const layer0 = S.rp(R, 0, 0, T.now + 1, false);
  assert.match(layer0, /^M46\.0,/);
  assert.equal(layer0.split(' L').length, 2 * (4 * (T.now + 1) + 1), '위·아래 경계 점');
  assert.match(S.rp(R, 5, T.now + 1, T.last + 1, false, 3), /^M[\d.]+,[\d.]+( L[\d.]+,[\d.]+)+ Z$/);
});

test('리본 지연 띠·병목: 달마다 그 달(판정 달)의 delayByStage, NOW 뒤는 NOW 판정, 띠는 층보다 두껍지 않다, 병목 = 지연 호수가 가장 큰 단계', () => {
  const R = S.ribbonOf(T, L.stageUnits, DL);
  for (const g of R.geo) g.dl.forEach((d, k) => assert.ok(d <= g.lw[k] - g.up[k] + 1e-9, `x=${g.x} k=${k}`));
  for (let m = 0; m <= T.last; m++) {
    const at = R.geo[4 * m + 2], dm = m <= T.now ? L.trend[m].delayByStage : L.delayByStage;
    dm.forEach((d, k) => near(at.dl[k], Math.min(d, L.stageUnits[m][k]) * R.s2, `띠 ${m}/${k}`));
  }
  assert.deepEqual(S.delayAt(T, DL, 0), L.trend[0].delayByStage);
  assert.deepEqual(S.delayAt(T, DL, T.now - 1), L.trend[T.now - 1].delayByStage);
  assert.deepEqual(S.delayAt(T, DL, T.now), L.delayByStage);
  assert.deepEqual(S.delayAt(T, DL, T.last), L.delayByStage);
  assert.equal(S.argmax(L.delayByStage), L.delayByStage.indexOf(Math.max(...L.delayByStage)));
  /* 띠가 층보다 두꺼우면 층 두께로 자른다 */
  const tiny = S.ribbonOf(T, L.stageUnits.map(() => [10, 10, 10, 10, 10, 10]), T.months.map(() => [100, 0, 0, 0, 0, 0]));
  near(tiny.geo[4 * T.now + 2].dl[0], 10 * tiny.s2, '잘린 띠');
  near(tiny.geo[2].dl[0], 10 * tiny.s2, '이력 달의 띠');
});

test('리본 글자 자리: 46개 시점 모두 글자·HUD 라벨이 서로 겹치지 않고 viewBox(960×400) 안에 있다(원장 = 총량 매달 같음, 총량이 해마다 다른 경우도)', () => {
  const R = S.ribbonOf(T, L.stageUnits, DL);
  // 총량이 해마다 다른 경우: 전국 원장(총량 약 141만 — 2026-10-14 수도권 HOME 교체 전 238만)에서 0.5배 → 1.5배
  const grow = S.ribbonOf(T, L.stageUnits.map((r, m) => r.map((v) => Math.round(v * (0.5 + m / 45)))), DL);
  for (const [name, g] of [['원장', R], ['총량 증가', grow]]) {
    for (let cur = 0; cur <= T.last; cur++) {
      const o = S.ribbonLabels(g, cur);
      const B = [...o.statics, ...o.years.flat()].map((t) => [t.t, S.textBox(t)])
        .concat([[`커서 ${o.total.text}`, o.total]]);
      for (let i = 0; i < B.length; i++) {
        assert.ok(S.inView(B[i][1]), `${name} ${cur}: '${B[i][0]}' 가 viewBox 밖`);
        for (let j = i + 1; j < B.length; j++) assert.ok(!S.hit(B[i][1], B[j][1]), `${name} ${cur}: '${B[i][0]}' ⟷ '${B[j][0]}' 겹침`);
      }
    }
  }
  /* 원장: 총량이 매달 같으니 연도 라벨은 연도만. 붉은 띠 범례·총량 설명·세로축 단위·아래 달 이름·병목 핀은 차트 안에 없다(제목 줄 '지연' 칩·제목 title·툴팁). 세로축 눈금은 0…ymax 만 단위 */
  assert.ok(S.flatTotal(R) && !S.flatTotal(grow));
  const o = S.ribbonLabels(R, T.now), ST = S.staticTexts(R);
  assert.deepEqual(o.years.map((y) => y.map((t) => t.t)), [['2025년'], ['2026년'], ['2027년'], ['2028년']]);
  assert.deepEqual(Object.keys(ST).sort(), ['now', 'ticks']);
  assert.deepEqual(Object.keys(o).sort(), ['statics', 'total', 'years'], '병목 핀 없음');
  assert.equal(ST.now.t, '기준 2026.10');
  for (const g of [R, grow]) assert.ok(S.ribbonLabels(g, T.now).statics.every((t) => !/붉은 띠|총량 매달/.test(t.t)), '차트 안 설명 글자 없음');
  assert.deepEqual(ST.ticks.map((t) => t.t), ['0', '50만', '100만', '150만']); assert.equal(S.axisUnit(R), '호');
  const big = S.ribbonOf(T, L.stageUnits.map((r) => r.map((v) => v * 8)), DL);   // ymax 1,000만 이상: '만' 을 빼 눈금이 왼쪽 여백에 들어가고 단위는 머리 글자로
  assert.ok(big.ymax >= 10000000); assert.ok(S.staticTexts(big).ticks.every((t) => !t.t.includes('만'))); assert.equal(S.axisUnit(big), '만 호');
  ST.ticks.forEach((t, i) => near(t.y, S.BOT - R.ticks[i] * R.s2 + 3, `눈금 y ${i}`));
  const small = S.ribbonOf(T, L.stageUnits.map(() => [10000, 20000, 30000, 20000, 5000, 4000]), DL);   // 총량 89,000: 5만 간격이면 2칸이지만 더 잘게 5칸 이하 중 가장 작은 간격
  assert.equal(small.step, 20000); assert.equal(small.ymax, 100000); assert.deepEqual(S.staticTexts(small).ticks.map((t) => t.t), ['0', '2만', '4만', '6만', '8만', '10만']);
  const half = S.ribbonOf(T, L.stageUnits.map(() => [20000, 20000, 20000, 20000, 20000, 20000]), DL);   // 총량 120,000 → 간격 25,000(2.5 × 10^4)
  assert.equal(half.step, 25000); assert.deepEqual(S.staticTexts(half).ticks.map((t) => t.t), ['0', '2.5만', '5만', '7.5만', '10만', '12.5만']);
  assert.equal(S.ribbonLabels(grow, T.now).years[1].length, 2, '총량이 해마다 다르면 연도·총량과 증감 두 줄');
  /* 리본 SVG 는 이 자리를 그대로 그린다(글자 좌표를 따로 박아 두지 않는다) */
  const rb = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../components/board/ribbon.ts'), 'utf8');
  assert.match(rb, /ribbonLabels\(g, cur\)/); assert.match(rb, /staticTexts\(g\)/);
  assert.doesNotMatch(rb, /T\.legend|T\.summary|T\.unit|T\.months|rb-pin|pinSVG/, '붉은 띠 범례 견본·총량 설명·단위·달 이름·병목 핀을 그리지 않는다');
  assert.match(rb, /TL\.months\[m\]\.endsWith\('-01'\)/, '아래 달 눈금은 글자 없이 표시만(1월은 길게)');
  assert.match(board, /세로축 \$\{axisUnit\(rib\)\}/, '세로축 단위는 카드 제목 title 에');
  assert.doesNotMatch(rb, /<text x="\$\{x\.toFixed/, '글자 자리 직접 계산 금지');
});

test('시도 타일 색 단계: 0 은 맨 앞, 경계값은 위 단계로 넘어간다', () => {
  assert.equal(S.rcls(0), 0); assert.equal(S.rcls(9.99), 1); assert.equal(S.rcls(10), 2); assert.equal(S.rcls(14.99), 2); assert.equal(S.rcls(15), 3); assert.equal(S.rcls(20), 4); assert.equal(S.rcls(29.99), 4); assert.equal(S.rcls(30), 5); assert.equal(S.rcls(100), 5);
  assert.deepEqual(S.RTH, [10, 15, 20, 30]); assert.deepEqual(S.RLAB, ['0', '<10', '10~15', '15~20', '20~30', '30+']);
  assert.equal(S.RCOL.length, 6); assert.equal(S.RLAB.length, 6);
});

test('시도 지리 격자: 4열 × 5줄, 원장의 16개 시도가 모두 자리를 갖고 겹치지 않으며 5줄 2~4열(요약 칸)·4/4 는 비어 있다', () => {
  const codes = L.regions.map((r) => r.code);
  assert.equal(codes.length, 16);
  const cells = codes.map((c) => { assert.ok(S.REGION_POS[c], `${c} 자리`); return S.REGION_POS[c].join('/'); });
  assert.equal(new Set(cells).size, 16, '자리 겹침 없음');
  for (const [r, c] of Object.values(S.REGION_POS)) { assert.ok(r >= 1 && r <= 5 && c >= 1 && c <= 4); assert.ok(!(r === 5 && c >= 2), '요약 칸 자리'); assert.notEqual(`${r}/${c}`, '4/4'); }
  assert.deepEqual([S.REGION_POS['28'], S.REGION_POS['11'], S.REGION_POS['41'], S.REGION_POS['51'], S.REGION_POS['12'], S.REGION_POS['50']], [[1, 1], [1, 2], [1, 3], [1, 4], [4, 1], [5, 1]]);
  const region = panel(board, 'p-region');
  assert.match(region, /grid-cols-4[^"]*gap-1\.5/); assert.match(region, /auto-rows-\[minmax\(60px,1fr\)\]/);
  assert.match(region, /\[grid-area:5\/2\/6\/5\]/, '요약 칸 5줄 2~4열');
  assert.match(region, /pos \? \{ gridArea: /, '표에 없는 코드는 자리를 주지 않아 빈 칸에 이어 붙는다');
  assert.equal((region.match(/<PanelLink/g) || []).length, 1, '이동 링크는 한 곳(요약 칸)');
  assert.doesNotMatch(region.slice(0, region.indexOf('auto-rows')), /<PanelLink/, '제목 줄에는 링크가 없다');
  assert.doesNotMatch(region, /text-bad">\{r\.delay\}/, '타일 안 세 숫자 칸 없음');
});

test('시점은 원장 집계에서 읽는다: 다음 달 원장(관측 2026-11, now 22)을 올리면 기준 글자·달 이름·현재 표지·SAMPLE 추이 끝점이 한 달 옮겨 가고 글자는 겹치지 않는다', () => {
  const next = { ...L, now: 22, observedMonth: '2026-11', actualThrough: '2026-09' }, T2 = S.timelineOf(next);
  assert.deepEqual([T2.now, T2.last, T2.actual], [22, 45, 20]);
  assert.equal(S.ml(T2, T2.now), '2026.11');
  assert.deepEqual([S.kind(T2, 21), S.kind(T2, 22)], ['예정 기준', '현재']);
  const R2 = S.ribbonOf(T2, next.stageUnits, S.delaysOf(S.judgmentsOf(next))), ST2 = S.staticTexts(R2);
  assert.equal(ST2.now.t, '기준 2026.11'); near(ST2.now.x, R2.X(23), '기준 글자 x');
  assert.deepEqual(T2.judged, Array.from({ length: 23 }, (_, i) => i), '이력(2026.10 관측 행 포함) + 새 기준 달');
  assert.deepEqual(S.delayAt(T2, S.delaysOf(S.judgmentsOf(next)), 21), L.delayByStage, '지난 기준 달은 그 달 이력 행');
  for (let cur = 0; cur <= T2.last; cur++) {
    const o = S.ribbonLabels(R2, cur), B = [...o.statics, ...o.years.flat()].map(S.textBox).concat([o.total]);
    for (let i = 0; i < B.length; i++) { assert.ok(S.inView(B[i]), `${cur}: ${i} viewBox 밖`); for (let j = i + 1; j < B.length; j++) assert.ok(!S.hit(B[i], B[j]), `${cur}: ${i}⟷${j} 겹침`); }
  }
  /* 첫 달이 1월이 아니어도 연도 머리는 원장의 달에서 나온다 */
  assert.deepEqual(S.yearsOf(S.timelineOf({ months: L.months.slice(3), now: 18 })).map((y) => [y.y, y.a, y.b]), [[2025, 0, 8], [2026, 9, 20], [2027, 21, 32], [2028, 33, 42]]);
});

test('선택 달 규칙: 판정 값은 선택 달 이하의 가장 늦은 판정 달(이력 달·기준 달) — 지난 달은 그 달 이력, 예정 달은 기준 달 판정, 이력이 빈 달은 앞 판정 달', () => {
  assert.equal(S.judgedAt(T, 5), 5);
  assert.equal(S.judgedAt(T, T.now - 1), T.now - 1);
  assert.equal(S.judgedAt(T, T.now), T.now);
  assert.equal(S.judgedAt(T, 30), T.now);
  assert.equal(S.judgedAt(T0, 5), -1, '옛 집계: 기준 달 앞은 판정 없음');
  const gap = S.timelineOf({ ...L, trend: L.trend.filter((r) => r.month !== '2025-06') });   // 판이 없는 달
  assert.equal(S.judgedAt(gap, 5), 4);
  assert.deepEqual(J[5], L.trend[5]); assert.equal(J[T.now].delay.units, L.judgment.delay.units);
});

/* ── 종합상황판 이식: SAMPLE 위젯만 표지가 있고, 실데이터 위젯은 표지 없이 제목 title 에 기준·범위를 둔다(2026-10-11 사용자 지시) ── */
const fs = require('node:fs');
const path = require('node:path');
const board = fs.readFileSync(path.join(__dirname, '../../components/board/Board.tsx'), 'utf8');
const realRow = fs.readFileSync(path.join(__dirname, '../../components/board/RealPanels.tsx'), 'utf8');

function panel(src, id) {
  const i = src.indexOf(`id="${id}"`);
  assert.ok(i >= 0, `${id} 패널이 있어야 한다`);
  const j = src.indexOf('</Card>', i);   // 패널은 <Card variant="board" render={<section id=…/>}> … </Card>
  return src.slice(i, j);
}

test('SAMPLE 표지는 없다(지연·주의 추이도 월 판정 이력), 원장 패널 5개는 제목 title 에 원장 범위(전국 여부)를 보인다', () => {
  assert.doesNotMatch(board, /<Sample|SAMPLE/, 'SAMPLE 표지·문구 없음');
  for (const id of ['p-chart', 'p-snap', 'p-region', 'p-agency', 'p-fut']) {
    const p = panel(board, id);
    assert.match(p, /<h2 className=\{(ptitle|cn\(ptitle, '[^']*'\))\} title=\{`\$\{scope\} · /, `${id}: 제목 title 에 원장 범위`);
    assert.doesNotMatch(p, /<Sample \/>/, `${id} 는 실데이터라 SAMPLE 표지가 없어야 한다`);
    assert.doesNotMatch(p, /ptSmall/, `${id}: 제목 옆 설명 글자 없음(title 로)`);
  }
  assert.doesNotMatch(board + realRow, /<Real\b|실데이터<|scopeShort/, '실데이터 표지·보이는 범위 글자 없음');
  assert.match(board, /const scope = `원장 \$\{ymDot\(L\.observedMonth\)\} 기준 · 사업 \$\{f\(L\.scope\.projects\)\}건\(\$\{ledgerMix\(L\)\}\) · \$\{nation\} · \$\{real\.ledgerOrigin === 'supabase' \? `출처 Supabase\(api\.board, \$\{real\.ledgerMonth\}\)` : '출처 JSON 대체'\}`;/);
  assert.match(panel(board, 'p-trend'), /title=\{`지연·주의 호수\(호\) · 2025\.01~2026\.09 건축HUB 과거 판 소급 판정 · 2026\.10부터 월 관측 · /);
  assert.match(panel(realRow, 'p-actual'), /<h2 className=\{ptitle\} title=\{`국토교통 통계누리/, 'p-actual: 출처는 제목 title');
  assert.doesNotMatch(board, /\b(AG|REG|dStage|vals|txSnap)\b/, '시안 SAMPLE 계산(기관·시도·단계 호수)을 쓰지 않는다');
});

test('원장 패널은 원장 집계 값을 그린다: 판정·제외·단계 호수·증감·지연, 시도 판정 여부, 기관별 사업 수, 12개월 준공 예정', () => {
  const snap = panel(board, 'p-snap');
  assert.match(board, /const T = useMemo\(\(\) => timelineOf\(L\), \[L\]\), NOW = T\.now, LAST = T\.last;/, '시점은 원장 집계에서');
  assert.match(board, /const v = L\.stageUnits\[cursor\], nv = L\.stageUnits\[NOW\], jm = judgedAt\(T, cursor\), judged = jm >= 0, SJ = JS\[judged \? jm : NOW\]!, ds = delayAt\(T, DL, cursor\), bk = bottleneckOf\(SJ\.delayByStage\)\?\.i \?\? -1;/, '선택 달의 판정 = 그 판정 달의 이력 행 · 병목은 사업 화면과 같은 bottleneckOf');
  assert.match(board, /<PanelLink href=\{`\/projects\?stage=\$\{bk\}&status=check`\}/, '병목 단계 링크는 리본 칸 번호(옛 0${bk + 1} 은 공식 단계로 읽혀 한 칸 앞 단계로 갔다)');
  assert.match(board, /const JS = useMemo\(\(\) => judgmentsOf\(L\), \[L\]\), DL = useMemo\(\(\) => delaysOf\(JS\), \[JS\]\)/);
  assert.match(board, /ribbonOf\(T, L\.stageUnits, DL\)/, '리본 지연 띠도 달마다 판정');
  assert.match(board, /showDlt = cursor !== NOW;/);
  assert.match(board, /jTag = judged \? `\$\{ml\(T, jm\)\} 판정` : '판정 없음', showJTag = jm !== cursor;/, '꼬리표는 선택 달과 판정 달이 다를 때만');
  assert.match(snap, /role="img" aria-label=\{judged \? [\s\S]*?\{showJTag \? <span data-slot="judge-tag" className=\{cn\(jtag, '[^']*'\)\}>\{jTag\}<\/span> : null\}/, '판정 막대 오른쪽에 판정 달 꼬리표');
  assert.match(snap, /<span \/><span className="text-right">호수<\/span>\{showDlt \? <span className="text-right phone:hidden">증감<\/span> : null\}<span className="text-right">지연<\/span>/, "표 머리는 '호수 / (증감) / 지연'(단계 글자 없음), 기준 달이면 증감 칸(머리)이 없다");
  assert.match(snap, /\{dlt === 0 \? '0' : sg\(dlt\)\}/, "증감 0 은 '0'");
  assert.doesNotMatch(snap, /'현재' : sg/, "증감 칸에 '현재' 글자를 쓰지 않는다");
  assert.match(snap, /\{judged \? f\(ds\[i\]\) : '—'\}/, '판정 없는 달의 지연 호수는 —');
  for (const id of ['p-region', 'p-agency']) assert.doesNotMatch(panel(board, id), /judge-tag/, `${id}: 판정 달 꼬리표 없음(기준 달 판정, 제목 title 에 원장 기준)`);
  assert.match(board, /const J = L\.judgment, d = SJ\.delay\.units, w = SJ\.caution\.units, ok = SJ\.ok\.units/);
  assert.match(snap, /\['지연', 'bad', d, SJ\.delay\.projects\]/);
  assert.doesNotMatch(snap, /txJudge|판정 제외:/, '서술 줄 없음 — 규칙·제외는 실데이터 표지 title 에');
  assert.match(snap, /ledgerJudged\(L\)/);
  assert.match(snap, /const dlt = v\[i\] - nv\[i\], neck = judged && i === bk;/, '증감 = 선택 달 − 기준 달, 병목 표시는 판정이 있는 달만');
  const region = panel(board, 'p-region');
  assert.match(region, /\{L\.regions\.map\(/);
  assert.match(region, /rate = r\.judged \? r\.delay \/ r\.judged \* 100 : null/);
  assert.match(region, /rate === null \? 'var\(--card\)' : RCOL\[rcls\(rate\)\]/);
  assert.match(region, /판정 대상 없음/);
  assert.match(region, /href=\{`\/region\?sido=\$\{curReg\.code\}`\}/, '시도 실적은 지역 공급(옛 /area/NN 넘김 대신 바로)');
  const agency = panel(board, 'p-agency');
  assert.match(agency, /\{L\.agencies\.filter\(\(a\) => a\.projects\)\.map\(/, '사업 있는 기관만 행으로');
  assert.match(agency, /사업 없음: \{emptyAgencies\.map\(\(a\) => a\.name\)\.join\(' · '\)\}/, '사업 없는 기관은 마지막 한 줄로 묶는다');
  assert.match(agency, /<div key=\{a\.id\} className=\{ag\}/, '기관 행은 같은 세 칸(subgrid)');
  assert.doesNotMatch(agency, /agName\}>[^\n]*판정 제외/, '이름 칸에 판정 제외를 넣지 않는다');
  assert.match(agency.slice(0, agency.indexOf('className={ags}')), /\['bg-\[var\(--out\)\] shadow-\[inset_0_0_0_1px_var\(--out-line\)\]', '판정 밖'\]/, "막대 범례는 제목 줄에, '판정 밖' 견본은 --out 채움 + --out-line 1px 선");
  assert.match(agency, /<span className="block bg-\[var\(--out\)\]" style=\{\{ width: pw\(out\) \}\} \/>/, '판정 밖 막대 조각 = --out');
  assert.match(agency, /전체 지연 \$\{f\(J\.delay\.units\)\}호/);
  assert.match(agency, /a\.id === 'unknown' \? `\. 판정 밖: \$\{dotDates\(outNote \?\? ''\)\}`/, '기관 미상 설명은 그 행의 title 에');
  assert.match(agency, /판정 제외 \$\{f\(a\.excludedUnits\)\}호/, '판정 제외는 행 title 에');
  assert.match(agency, /\$\{CAND_TEXT\} \$\{f\(a\.candidateUnits\)\}호/, '확인 필요(후보) 호수도 행 title 에(막대에서는 판정 밖, D3)');
  assert.match(agency, /pw\(a\.okUnits\)[\s\S]*pw\(a\.cautionUnits\)[\s\S]*pw\(a\.delayUnits\)/, '막대는 호수');
  assert.match(agency, /\(J\.delay\.units \? a\.delayUnits \/ J\.delay\.units \* 100 : 0\)\.toFixed\(1\)/, '지연 비중은 전체 지연 호수 중 비중');
});

test('시도 카드는 월별 실적 흐름(middle)과 같은 줄에 있고, 시행주체별 진행 현황·데이터 흐름 카드는 없다', () => {
  assert.match(board, /<div className=\{row2\}>\s*\{middle\}\s*<Card variant="board"[^>]*id="p-region"/);
  /* 시도 칸은 지리 격자 4열이 들어가는 620px */
  const styles = fs.readFileSync(path.join(__dirname, '../../components/board/styles.ts'), 'utf8');
  assert.equal(Number(/export const row2 = "[^"]*grid-cols-\[minmax\(0,1fr\)_(\d+)px\]/.exec(styles)[1]), 620);
  assert.doesNotMatch(board, /id="p-flow"/);
  assert.doesNotMatch(realRow, /id="p-actors"/);
});

test('향후 12개월 패널은 원장의 준공 예정(upcoming, 2026-10부터 12개월)만 그리고, 시안의 SAMPLE 계열(착공·모집·입주 예정)을 쓰지 않는다', () => {
  const fut = panel(board, 'p-fut');
  assert.match(board, /const up = L\.upcoming,/);
  assert.match(fut, /\{up\.map\(\(m, i\) =>/);
  assert.match(fut, /onClick=\{\(\) => goto\(NOW \+ i\)\}/, '막대를 누르면 그 달 선택');
  assert.match(fut, /fill="var\(--st-soon\)"/, '단색'); assert.doesNotMatch(fut, /linearGradient|Reserve|futRead/, '그라데이션·아래 문장 없음');
  assert.match(board, /upSum = up\.reduce\(\(n, m\) => n \+ m\.units, 0\), upProj = up\.reduce\(\(n, m\) => n \+ m\.projects, 0\)/, '12개월 합');
  assert.ok(L.upcoming.reduce((n, m) => n + m.units, 0) > 0);
  assert.match(fut, /\{f\(upSum\)\}<small[^>]*>호<\/small>[\s\S]*\{f\(upProj\)\}건/, '큰 숫자 한 줄');
  assert.doesNotMatch(board, /real\.lh\b|lhByMonth/);
  assert.equal(L.upcoming.length, 12);
  assert.equal(L.upcoming[0].ym, L.observedMonth);
  assert.equal(L.upcoming[11].ym, L.months[L.now + 11]);
  assert.doesNotMatch(fut, /\bFS\b|FSC/);
  assert.doesNotMatch(board, /\bFS\b/, 'sample.ts 에서 FS(향후 12개월 SAMPLE)를 가져오지 않는다');
});

test('종합상황판은 실데이터를 data/board 에서만 읽는다: 월별 실적(molit), 원장 집계(ledger), 원천 수(sources)', () => {
  const page = fs.readFileSync(path.join(__dirname, '../../app/(dashboard)/page.tsx'), 'utf8');
  assert.match(fs.readFileSync(path.join(__dirname, '../../lib/board/ledger-source.ts'), 'utf8'), /import ledgerBundled from '\.\.\/\.\.\/data\/board\/ledger-board\.json';/);
  assert.match(page, /^    ledger,$/m);
  assert.match(page, /sido: Object\.fromEntries\(molit\.sido\.map/);
  assert.match(page, /sourceCount: sources\.items\.length/);
  assert.match(realRow, /seriesOf\(molit/);
});

test('카드의 이동 링크는 아래 줄이 아니라 제목 줄 오른쪽(pacts)에 조용한 글자 링크로 있다(2026-10-10 사용자 지시, 2026-10-12 시안 정리)', () => {
  const head = (src) => src.slice(0, src.search(/<\/div>/));   // 패널의 첫 줄(제목 줄)
  for (const id of ['p-snap', 'p-fut', 'p-agency']) assert.match(head(panel(board, id)), /className=\{pacts\}>(\{bk >= 0 \? )?<PanelLink/, id);
  assert.match(head(panel(realRow, 'p-actual')), /className=\{pacts\}><PanelLink/, 'p-actual');
  assert.doesNotMatch(board + realRow, /plink/, '카드 아래 링크 줄(plink)은 없다');
  const link = fs.readFileSync(path.join(__dirname, '../../components/board/PanelLink.tsx'), 'utf8');
  assert.match(link, /text-\[14px\][^"]*text-muted-foreground[^"]*hover:text-primary[^"]*focus-visible:text-primary[^"]*focus-visible:outline-2/, '14px 흐린 글자, 올림·포커스 때 주색, 보이는 포커스 고리');
  assert.doesNotMatch(link, /bg-primary|rounded-md|\bh-7\b/, '채움·둥근 상자 없음');
  assert.match(link, /title=\{full\}/, '줄인 이름 대신 원래 이름은 title 로 보인다');
});

test('월별 실적 흐름: 종합상황판에서만 세로축을 만 단위로 줄이고 그래프가 카드 높이를 채운다(기관 상세 /agency/{기관} 의 MonthLines 는 그대로)', () => {
  assert.match(realRow, /<MonthLines [\s\S]*? board \/>/);
  const lines = fs.readFileSync(path.join(__dirname, '../../components/charts/MonthLines.tsx'), 'utf8');
  assert.match(lines, /const man = \(v: number\) => \(v === 0 \? '0' : `\$\{\+\(v \/ 10000\)\.toFixed\(1\)\}만`\);/);
  assert.match(lines, /fmt=\{board \? man : undefined\} fill=\{board\}/);
  for (const f of ['app/(dashboard)/agency/[id]/page.tsx']) assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '../../', f), 'utf8'), /\sboard(\s|=|\/>)/, f);
});

test('추이 그래프: 원천이 새로 들어간 달(addedSources)에만 표지를 단다', () => {
  const marks = S.addedMarks(J, L.now);
  const withSrc = L.trend.filter((r) => r.addedSources?.length && L.months.indexOf(r.month) <= L.now).map((r) => r.month);
  assert.deepEqual(marks.map((a) => L.months[a.m]), withSrc, '표지 달 = addedSources 가 있는 달');
  assert.deepEqual(S.addedMarks(S.judgmentsOf(OLD), OLD.now), [], 'addedSources 가 없으면 표지 없음');
  const none = S.judgmentsOf({ ...L, trend: L.trend.map(({ addedSources, ...r }) => r) });
  assert.deepEqual(S.addedMarks(none, L.now), []);
  const trend = panel(board, 'p-trend');
  assert.match(trend, /AM\.map\(\(a\) => <line [^>]*data-added-mark[^>]*strokeDasharray/, '세로 점선');
  assert.match(trend, /AM\.map\(\(a\) => <span [^>]*data-added-label[^>]*>원천 추가<\/span>/, '이름표');
  assert.match(board, /원천 추가: \$\{a\.sources\.join\('·'\)\} — 이전 달과 직접 비교 주의/, '툴팁 문구');
});
