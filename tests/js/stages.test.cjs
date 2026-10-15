'use strict';
// 단계 표기(docs/product/화면-배색-개선-계획.md 5절)를 정적으로 고정한다.
// 문구는 발표자료(docs/주택파동_발표자료.html)의 SHEET 03 '주택공급 6단계, 단계마다 답해야 할 질문'과 SHEET 02 '정책적 필요성'에서 직접 읽어 대조한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const deck = read('docs/주택파동_발표자료.html');
const stages = read('lib/board/stages.ts'), sample = read('lib/board/sample.ts'), board = read('components/board/Board.tsx'), app = read('assets/js/app.js');
const strip = (h) => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

test('공식 6단계: 이름·질문·공개 범위가 발표자료 SHEET 03 과 같다(01~04 담당자 열람, 05~06 국민 공개)', () => {
  const qs = [...deck.matchAll(/<p class="q"[^>]*data-k="(\d)"[^>]*>([^<]+)<\/p>/g)].map((m) => [Number(m[1]), m[2].trim()]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  assert.equal(qs.length, 6, '발표자료에서 질문 6개를 찾아야 한다');
  const rows = [...stages.matchAll(/\{ code: '(\d\d)', name: '([^']+)', q: '([^']+)', scope: '(gov|pub)'/g)].map((m) => ({ code: m[1], name: m[2], q: m[3], scope: m[4] }));
  assert.deepEqual(rows.map((r) => r.name), ['정책', '사업화', '인허가', '건설', '공급', '입주']);
  assert.deepEqual(rows.map((r) => r.q), qs);
  assert.deepEqual(rows.map((r) => r.scope), ['gov', 'gov', 'gov', 'gov', 'pub', 'pub']);
});

test('사업 상세(서랍)·목록·타임라인은 같은 리본 칸 번호(①~⑥ 이름·단계색)를 쓰고, 공식 01~06 은 서랍 칸의 title 에만 있다. 단계 거르기는 파이프라인 칸으로 고르고 칩 줄에는 고른 단계만(풀기). 옛 Stepper·StageLadder 는 없다', () => {
  const det = read('components/projects/ProjectDetail.tsx');
  /* 2026-10-16 2차 평가: 칸은 링크가 아니고, 같은 단계 목록은 따로 링크 하나(지금 거르기 유지 — r2-screens 4) */
  assert.match(det, /<StageSteps current=\{r\.board\} reached=\{r\.reached\} listHref=\{stageHref\(r\.board\)\} \/>/, '지금 단계 = 목록의 단계 알약과 같은 리본 칸(목록 주소는 지금 거르기를 지킨다)');
  for (const f of ['components/projects/ProjectDetail.tsx', 'app/(dashboard)/projects/page.tsx']) assert.doesNotMatch(read(f), /Stepper|StageLadder/, f);
  for (const f of ['components/ui/stepper.tsx', 'components/StageLadder.tsx']) assert.ok(!fs.existsSync(path.join(ROOT, f)), `쓰는 곳이 없는 ${f} 는 지운다`);
  const steps = read('components/projects/StageSteps.tsx');
  assert.match(steps, /\{BOARD_CIR\[i\]\} \{name\}\n\s*<\/b>/, '칸 이름은 ①~⑥');
  assert.doesNotMatch(steps, /공식 단계|BOARD_OFFICIAL/, '공식 01~06 은 ①~⑥ 과 어긋나 title 에도 쓰지 않는다(2026-10-16 3차 평가 — r3-screens 4)');
  assert.doesNotMatch(steps, /BOARD_OFFICIAL_SHORT/);
  assert.match(steps, /aria-current=\{on \? 'step' : undefined\}/);
  assert.match(steps, /\$\{QUESTION\[i\]\}/, '단계마다 답할 질문은 칸의 title');
  const list = read('app/(dashboard)/projects/page.tsx');
  assert.match(list, /href=\{\(i\) => at\(\{ stage: f\.stage === i \? undefined : String\(i\) \}\)\}/, '파이프라인 칸이 단계 거르기(다른 거르기 유지, 다시 누르면 풀림)');
  assert.doesNotMatch(list, /BOARD_NAMES\.map\(\(n, i\) => <Chip/, '칩 줄에 단계 칩 6개를 두지 않는다');
  assert.match(list, /f\.stage !== undefined \? <ClearChip href=\{at\(\{ stage: undefined \}\)\}/, '고른 단계는 칩 줄에서 풀 수 있다');
});

test('지도의 단계 필터·단지 카드 단계 위치는 화면과 같은 리본 칸(①계획~⑥입주, 공식 번호는 title)이고, 단지 상태는 사업 레지스트리와 같은 매핑으로 묶인다', () => {
  assert.match(app, /const STAGES6 = \[\['①', '계획', \['사업화'\], '[^']+'\], \['②', '인허가', \['계획'\], '[^']+'\], \['③', '착공', \['건설 단계', '준공 임박'\], '[^']+'\], \['④', '모집', \['분양중'\], '[^']+'\], \['⑤', '준공', \['입주 단계'\], '[^']+'\], \['⑥', '입주', \[\], '[^']+'\]\]/);   // 다섯째 값은 단계 정의(공식 번호 없음, r3-map 4)
  const view = read('lib/board/projects-view.ts');
  assert.match(view, /export const BOARD_NAMES = \['계획', '인허가', '착공', '모집', '준공', '입주'\] as const;/, '이름은 사업 화면 BOARD_NAMES 와 같다');
  assert.match(app, /const BOARD_OF_STAGE = \{ '01': 0, '02': 0, '03': 1, '04': 2, '05': 3, '06': 4 \};/, '원장 단계 → 칸은 사업 화면 BOARD_OF_STAGE 와 같다');
  assert.match(view, /export const BOARD_OF_STAGE: Record<string, number> = \{ '01': 0, '02': 0, '03': 1, '04': 2, '05': 3, '06': 4 \};/);
  assert.match(app, /const STATUS_TXT = \{ '사업화': '계획', '계획': '인허가', '건설 단계': '착공', '준공 임박': '준공 임박', '분양중': '모집 중', '입주 단계': '준공' \};/);
  assert.doesNotMatch(app, /\$\{no\} \$\{name\}|<small>세대<\/small>|'세대수 미확인'|\}세대`/, '머리 줄·카드에 옛 번호(01~06)·세대 단위가 남지 않는다');
  const { stageOf } = require(path.join(ROOT, 'lib/projects.js'));
  assert.match(app, /'계획': 'permit', '사업화': 'plan'/, '사업화(수도권 원장 01·02 단계)는 ①계획 색, 계획(인허가)은 ②인허가 색');   // 지도 개선 계획 3절
  const MAP = { '계획': '03', '건설 단계': '04', '준공 임박': '04', '분양중': '05', '입주 단계': '06' };
  for (const [status, code] of Object.entries(MAP)) assert.equal(stageOf(status, { approvedAt: true }), code, `레지스트리 stageOf(${status})`);
  assert.match(app, /data-status="\$\{live\.join\('\|'\)\}"/, '한 단계가 여러 상태를 함께 켜고 끈다');
  assert.match(app, /const own = STAGES6\.find\(\(x\) => x\[2\]\.includes\(b\.status\)\), l = b\.ledger && b\.ledger\.stage \? stageOfCode\(b\.ledger\.stage\) : null;/, '단지 카드의 지금 단계 = 상태가 속한 단계(원장 단계가 있으면 그 칸)');
  assert.match(app, /if \(!l\) return \{ now: own,/, '사업 원장 단계가 없을 때만 상태로 정한다(있으면 원장 단계, M7)');
  assert.doesNotMatch(app, /'착공', '건설 단계'|'모집', '분양중'|PERMIT_COLOR/, '옛 단계 이름·인허가 대체색이 남지 않는다');
});

/* ---------- 실적 지표의 6단계 표기(계획서 11절, 2026-10-10 "6단계가 아닌 3단·4단 표기를 고쳐") ---------- */
test('통계누리 지표 → 6단계 대응은 사업 레지스트리(stageOf)와 같고, 지표 순서는 6단계 순서다', () => {
  const S = require('../../lib/board/stages.ts'), C = require('../../lib/board/calc.ts'), P = require('../../lib/projects.js');
  assert.deepEqual({ ...S.METRIC_STAGE }, { permit: '03', start: '04', sale: '05', complete: '06' });
  // 인허가(사업승인 있음) = 계획 → 03, 착공 = 건설 단계 → 04, 분양 = 분양중 → 05, 준공(사용검사) = 입주 단계 → 06
  const stageOf = /function stageOf[\s\S]*?\n\}/.exec(read('lib/projects.js'))[0];
  assert.match(stageOf, /case '입주 단계': return '06';/); assert.match(stageOf, /case '분양중': return '05';/); assert.match(stageOf, /case '건설 단계': case '준공 임박': return '04';/); assert.match(stageOf, /case '계획': return approvedAt \? '03'/);
  assert.deepEqual(C.METRICS, ['permit', 'start', 'sale', 'complete']);
  assert.deepEqual(C.METRICS.map((k) => S.METRIC_STAGE[k]), ['03', '04', '05', '06']);
  assert.ok(P);
});

test('지표 범례·KPI 는 6칸(StageLegend·StageKpis): 지표가 없는 단계는 점선 견본·\'자료 없음\', 종합상황판은 리본 이름(①계획~⑥입주)', () => {
  const legend = read('components/charts/StageLegend.tsx'), kpis = read('components/StageKpis.tsx');
  assert.match(legend, /\{STAGES\.map\(\(s, i\) => \{/);
  assert.match(legend, /const ON_BOARD: Record<Metric, number> = \{ permit: 1, start: 2, sale: 3, complete: 4 \};/);
  assert.match(legend, /border-dashed border-line2/); assert.match(legend, />자료 없음</);
  assert.match(kpis, /\{K\.map\(\(name, i\) => \{/, 'KPI 칸은 리본 이름(①계획~⑥입주)'); assert.match(kpis, /자료 없음/); assert.match(kpis, /grid grid-cols-\[repeat\(auto-fit,minmax\(min\(200px,100%\),1fr\)\)\] gap-2\.5/, '값 있는 단계 카드가 폭을 채운다(2026-10-16 3차)'); assert.match(kpis, /title=\{`공급 6단계별 실적 · \$\{when\}`\}/, '시점은 묶음의 title 에 한 번');
  assert.match(kpis, /text=\{`자료 없음 \$\{empty\.map\(\(i\) => CIR\[i\]\)\.join\('·'\)\}`\}/, "빈 단계는 칩 하나('자료 없음 ①·⑥'), 이유는 (i) 팝오버(2026-10-16 3차)"); assert.doesNotMatch(kpis, /<span className="text-\[14px\]">\{notes/, '이유 문장을 칸에 보이지 않는다');
  assert.match(read('components/board/RealPanels.tsx'), /<StageLegend metrics=\{METRICS\} names="board" compact \/>/, '종합상황판은 제목 줄의 작은 칩(①·⑥ 자료 없음은 빼고 단계 번호는 title)');
  assert.match(legend, /if \(compact\) return \(/); assert.match(legend, /' 자료 없음'/);
  const pages = { 'app/(dashboard)/month/[id]/page.tsx': ['kpis'], 'app/(dashboard)/agency/[id]/page.tsx': ['legend', 'kpis'] };
  for (const [f, want] of Object.entries(pages)) {
    const s = read(f);
    if (want.includes('legend')) assert.match(s, /<StageLegend metrics=/, f);
    if (want.includes('kpis')) assert.match(s, /<StageKpis when=/, f);
    assert.doesNotMatch(s, /<Kpi key=\{k\}/, `${f}: 지표별 KPI 를 3·4칸으로 늘어놓지 않는다`);
    assert.doesNotMatch(s, /<Legend items=\{lines\.map/, `${f}: 지표 선의 범례는 6단계 범례`);
  }
});

test('표 머리는 리본 단계 이름을 붙인다(②인허가·③착공·④모집·⑤준공)', () => {
  /* 표는 데이터 그리드(계획서 17절)라 머리글은 열 정의의 label 이다. 통계누리 지표 → 리본 칸은 METRIC_BOARD(화면 전체의 한 단계 체계) */
  for (const f of ['app/(dashboard)/month/[id]/page.tsx', 'app/(dashboard)/agency/[id]/page.tsx']) assert.match(read(f), /label: metricBoardLabel\(k\)/, f);
  const S = require('../../lib/board/stages.ts'), C = require('../../lib/board/calc.ts');
  assert.deepEqual(C.METRICS.map((k) => S.metricBoardLabel(k)), ['② 인허가', '③ 착공', '④ 모집', '⑤ 준공']);
});

test('지도 범례·옵션 창의 단지 상태는 6단계 순서이고 리본 칸 이름(①~⑥)이 붙는다, 공식 번호는 title(머리 줄 6단계 필터와 같은 대응)', () => {
  assert.match(app, /const BY_STAGE = STAGES6\.flatMap\(\(s\) => s\[2\]\);/);
  assert.match(app, /BY_STAGE\.forEach\(\(st\) => \{[^]*?if \(!present\.has\(st\)\) return;\n\s+if \(st !== '입주 단계'\) return add\(`<i class="sw \$\{KIND\[st\]\}"><\/i>`, stLabel\(st\), NOTE\[st\] \|\| '', '', stTitle\(st\)\);/);   // 요약 줄 칩 없음(머리 줄 띠가 단계 범례, r3-map 5)
  assert.match(app, /add\('<i class="sw soon"><\/i>', '⑤준공 · 입주 진행'/);    // ⑤준공(사용검사)은 경과 표지로 둘로 나눈다(2026-10-14)
  assert.match(app, /'⑤준공 · 입주 완료'/);
  assert.match(app, /const present = BY_STAGE\.filter\(\(st\) => ALL_ST\.has\(st\)\);/);
  assert.match(app, /\$\{stLabel\(st\)\}<\/label>/);
  assert.doesNotMatch(app, /stageOfSt/);
  const stLabel = new Function('STAGES6', 'STATUS_TXT', `return ${/const stLabel = (\(st\) => \{.*?\});/.exec(app)[1]}`)(
    [['①', '계획', ['사업화']], ['②', '인허가', ['계획']], ['③', '착공', ['건설 단계', '준공 임박']], ['④', '모집', ['분양중']], ['⑤', '준공', ['입주 단계']], ['⑥', '입주', []]],
    { '사업화': '계획', '계획': '인허가', '건설 단계': '착공', '준공 임박': '준공 임박', '분양중': '모집 중', '입주 단계': '준공' });
  assert.deepEqual(['사업화', '계획', '건설 단계', '준공 임박', '분양중'].map(stLabel), ['①계획', '②인허가', '③착공', '준공 임박', '④모집 중']);
});
