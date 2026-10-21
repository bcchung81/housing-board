'use strict';
/* 8차 독립 평가 화면 고침 D(2026-10-15, 배포 전 마지막) — 결함만:
   1 지연 헤드라인 '확정 2 · 후보 계산 313'(같은 크기, 숫자마다 목록) · 2 첫 연출은 현재 시점에서 · 3 핵심 질문 보조 줄 말줄임 없음
   4 구가 있는 시 → 지도 ?sido=41&pick= · 5 지역 공급 '보기' 뒤 초점 · 6 GH 표 상태 '판정 밖'·알약 대비 · 7 서랍 짧은 이름·기준일 이름
   8 월별 실적 차트 로빙 초점 · 9 착공 목록의 범위 차이를 보이는 글로 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('node:module').registerHooks({ resolve(s, c, n) { try { return n(s, c); } catch (e) { if (/^\.\.?\//.test(s)) return n(`${s}.ts`, c); throw e; } } });
const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const V = require('../../lib/board/projects-view.ts');
const M = require('../../lib/board/metro-overview.ts');
const { makeDirectives } = require('../../lib/board/directives.ts');
const { GU_CITY, mapHref, mapScopeHref } = require('../../lib/board/map-href.ts');
const MAP = require('../../data/board/ledger-map.json');
const IDX = require('../../data/board/projects-index.json');
const BOARD = require('../../data/board/ledger-board.json');

const rows = V.rowsOf(MAP.bySgg, IDX.projects, IDX.sgg);
const fctx = { policies: IDX.policies, programs: IDX.programs, sidoOk: () => true, guOf: M.guOf };
const listOf = (href) => {
  const u = new URL(href, 'http://x');
  const l = V.applyFilters(rows, V.parseFilters(Object.fromEntries(u.searchParams), fctx));
  return { l, n: l.length, units: V.summaryOf(l).units };
};
const D = makeDirectives({ sourceCount: 19, stageNames: [...V.BOARD_NAMES], ledger: BOARD, start: { year: '2026', upto: 8, cum: 156396, cumLy: 141000 }, bottleneck: V.bottleneckOf });
const board = read('components/board/Board.tsx');

test('1 지연 헤드라인: 카드 = 지연 2건 · 주의 2(후보 0이라 쌍 숫자 없음), 후보가 있을 때의 쌍 숫자 화면 코드는 그대로(late · review-late)', () => {
  const late = D[4], c = BOARD.judgment.candidate;
  assert.equal(late.t, '일정 지연 관리');
  // 2026-10-19 수도권 한정: 후보 계산 313·확인 필요 1,839 → 0. 후보가 0이면 카드는 쌍 숫자 없이 '지연 n건' + sub '주의 n'(옛 후보 없는 모양)
  assert.deepEqual([late.pre, late.big, late.u], ['지연', '2', '건']);
  assert.equal(late.pair, undefined, '후보 계산 쌍 없음');
  assert.equal(late.m, '지연 2건');
  assert.equal(late.sub, '주의 11', '작은 보조 값(주의)');   // 2026-10-20 HOME 판: 주의 2→10 → 기준일 10-20 주의 11(성남금토 A2)
  assert.equal(c.delay.projects, 0);
  /* 목록: 지연 = 지연(장기 포함) 2건. 후보 목록(?status=review-late·review)은 0건 */
  assert.equal(late.list.href, '/projects?sido=all&status=late');
  assert.equal(listOf(late.list.href).n, 2);
  assert.equal(listOf('/projects?sido=all&status=review-late').l.length, 0, '후보 계산 목록 0건');
  assert.equal(listOf('/projects?sido=all&status=review').l.length, 0, '확인 필요(후보) 전체 목록 0건');
  assert.match(late.list.title, /지연\(장기 포함\) 사업\(수도권\) 2건/);
  /* 화면: 두 숫자는 같은 글자 크기 한 벌(dirVals 의 one — 6장 공통 규격, 2026-10-18), 겹친 층의 링크는 단추 밖(형제) */
  assert.match(board, /function dirVals\(x: Directive, link: boolean, open:/);
  assert.equal((board.slice(board.indexOf('function dirVals'), board.indexOf('/* 줄1: 지시 이름')).match(/ui-dir-num ui-kpi leading-title/g) || []).length, 1, '두 숫자가 같은 크기 클래스 하나를 쓴다');
  assert.ok(board.indexOf('data-slot="board-dir-value"') > board.indexOf('</button>', board.indexOf('data-slot="board-dir"')), '링크 층은 단추 밖');
  assert.match(board, /<div data-slot="board-dir-value" className=\{cn\(dirFrame, 'ui-dir-layer pointer-events-none absolute inset-0/);
  /* 해당 패널(선택 시점 판정): 작은 회색 후보 줄 대신 지연 확정 · 후보 계산 두 숫자(같은 크기, 각 목록) */
  const cand = board.slice(board.indexOf('data-slot="board-cand"'), board.indexOf('</div>', board.indexOf('data-slot="board-cand"')));
  assert.match(cand, /<PanelLink href=\{at\('\/projects\?sido=all&status=late'\)\}[^>]*>확정 <b className=\{cn\(disp, 'text-lg leading-none text-bad'\)\}>\{f\(SJ\.delay\.projects\)\}<\/b>건<\/PanelLink>/);
  assert.match(cand, /<PanelLink href=\{at\('\/projects\?sido=all&status=review-late'\)\}[^>]*>후보 계산 <b className=\{cn\(disp, 'text-lg leading-none text-foreground'\)\}>\{f\(SJ\.candidate\.delay\.projects\)\}<\/b>건<\/PanelLink>/);
  assert.doesNotMatch(cand, /candText\(SJ\.candidate\)\}<\/span>|후보 목록/, '옛 작은 회색 보조 줄 없음');
});

test('2 첫 연출: 기준 시점은 처음부터 현재(NOW) — 지난 달(2026.07)을 먼저 보이지 않는다', () => {
  assert.match(board, /const \[cursor, setCursor\] = useState\(NOW\);/);
  assert.doesNotMatch(board, /setCursor\(0\)|'travel'|requestAnimationFrame\(step\)/);
  assert.match(board, /useState<'sweep' \| 'landed' \| ''>\('sweep'\)/);
  assert.match(board, /data-intro=\{intro \|\| undefined\}/);
});

test('3 핵심 질문 보조 줄: 말줄임 없이 줄바꿈(후보가 있을 때 1280·인쇄에서 확인 필요(후보) 꼬리가 잘리지 않게)', () => {
  const s = read('components/projects/Summary.tsx');
  const line = s.split('\n').find((l) => l.includes('data-slot="q-sub"'));
  assert.ok(line, 'q-sub');
  assert.doesNotMatch(line, /truncate|whitespace-nowrap|line-clamp/);
  const q = V.questionsOf(rows, V.parseFilters({ sido: 'all' }, fctx), { pp: require('../../data/board/policy-progress.json'), policies: IDX.policies, observedMonth: IDX.observedMonth, sidoName: (c) => c, sggName: (c) => c }).find((x) => x.q === '어떤 사업이 늦어지는가');
  // 2026-10-19 수도권 한정: 확인 필요(후보) 313 꼬리 삭제 (후보 0건)
  assert.equal(q.sub, '지연 6~12개월 0 · 장기 12개월+ 2');
});

test('4 구가 있는 시 → 지도 ?sido=41&pick=<시 코드>(구 코드·구 없는 시는 ?sgg=)', () => {
  const cities = Object.keys(M.METRO_AREAS).filter((c) => M.guOf(c).length).sort();
  assert.deepEqual([...GU_CITY].sort(), cities, 'GU_CITY = guOf 로 구가 있는 시');
  assert.deepEqual(cities, ['41110', '41130', '41170', '41190', '41270', '41280', '41460', '41590']);
  for (const c of cities) {
    assert.equal(mapScopeHref({ sgg: c }), `/map?sido=41&pick=${c}`);
    assert.equal(mapHref({ sgg: c }), `/map?sido=41&pick=${c}`);
    for (const g of M.guOf(c)) assert.equal(mapHref({ sgg: g }), `/map?sgg=${g}`);
  }
  assert.equal(mapScopeHref({ sgg: '41150' }), '/map?sgg=41150', '구 없는 시(의정부)');
  assert.equal(mapScopeHref({ sgg: '11170' }), '/map?sgg=11170');
  assert.equal(mapHref({ project: 'PRJ-41281-0088', sgg: '41280' }), '/map?project=PRJ-41281-0088', '사업이 먼저');
  /* 고양시 범위: 사업 10건 · 10,330호(구 합침) — 지역 공급·사업 화면 모두 mapScopeHref 로 이 주소 */
  const g = listOf('/projects?sgg=41280');
  assert.deepEqual([g.n, g.units], [11, 11924]);   // 2026-10-20 HOME 판(고양 10건·10,330호 → 11건·11,924호)
  assert.match(read('app/(dashboard)/region/page.tsx'), /const scopeMap = sgg \? mapScopeHref\(\{ sgg \}\)/);
  assert.match(read('app/(dashboard)/projects/page.tsx'), /const scopeMap = f\.sgg \|\| f\.sido \? mapScopeHref\(\{ sgg: f\.sgg, sido: f\.sido \}\)/);
});

test('5 지역 공급 \'보기\' 뒤 초점: 새로 붙은 Ahead 가 앞으로 12개월 제목(h2#ahead-title)으로', () => {
  const a = read('components/region/Ahead.tsx');
  assert.match(a, /pickSgg\(draft \|\| null, true\)/);
  assert.match(a, /focusScopeAfterPick = focusAfter;/);
  assert.match(a, /if \(!focusScopeAfterPick\) return;\s*focusScopeAfterPick = false;\s*const h = document\.getElementById\(AHEAD_TITLE_ID\);\s*if \(!h\) return;\s*h\.tabIndex = -1;\s*h\.focus\(/);
  assert.match(a, /const AHEAD_TITLE_ID = 'ahead-title';/);
  assert.match(read('app/(dashboard)/region/page.tsx'), /<PanelHead id="ahead-title" title=/);
  assert.match(read('app/(dashboard)/region/page.tsx'), /<Ahead key=\{`\$\{sido\}\|\$\{policy\}\|\$\{sgg \?\? ''\}`\}/, '시군구가 바뀌면 새로 붙는다(초점 처리의 전제)');
});

test('6 GH 표 상태 = 판정 밖(머리 경고문과 같은 말) · 단계 알약 글자 대비 4.5 이상(밝은·어두운 테마)', () => {
  const p = read('app/(dashboard)/agency/[id]/page.tsx');
  assert.match(p, /판정하지 않습니다/);   // 묶음이 없는 기관(국방부)
  assert.match(p, /status: JUDGE_NAME\[r\.judge\?\.status \?\? 'UNKNOWN'\]/);   // 2026-10-21: GH·SH·iH 표 상태 = HOME 사업 판정
  const g = read('components/ui/data-grid.tsx');
  assert.match(g, /color: `color-mix\(in srgb,\$\{o\.pill\.ink\} 80%,var\(--foreground\)\)`/);
  assert.match(g, /background: `color-mix\(in srgb,\$\{o\.pill\.color\} 16%,var\(--card\)\)`/);
  /* app/globals.css 의 테마 값으로 계산 */
  const css = read('app/globals.css');
  const blocks = [css.slice(css.indexOf('--st-plan:'), css.indexOf('--actor-local:')), css.slice(css.lastIndexOf('--st-plan:'), css.lastIndexOf('--actor-local:'))];
  const theme = [css.slice(0, css.indexOf('--st-plan:')), css.slice(css.indexOf('--actor-local:'), css.lastIndexOf('--st-plan:'))];
  const hex = (s, k) => { const m = new RegExp(`--${k}:\\s*(#[0-9A-Fa-f]{6})`).exec(s); assert.ok(m, k); return [1, 3, 5].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255); };
  const lastHex = (s, k) => { const all = [...s.matchAll(new RegExp(`--${k}:\\s*(#[0-9A-Fa-f]{6})`, 'g'))]; const h = all[all.length - 1][1]; return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); };
  const lum = (c) => { const [r, g2, b] = c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g2 + 0.0722 * b; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const mix = (a, b, p) => a.map((v, i) => v * p + b[i] * (1 - p));
  const ST = ['plan', 'permit', 'build', 'sale', 'soon', 'move'];
  [0, 1].forEach((t) => {
    const card = lastHex(theme[t], 'card'), fg = lastHex(theme[t], 'foreground');
    for (const k of ST) {
      const bg = mix(hex(blocks[t], `st-${k}`), card, 0.16), ink = mix(hex(blocks[t], `st-${k}-ink`), fg, 0.8);
      assert.ok(ratio(ink, bg) >= 4.5, `${t ? '어두운' : '밝은'} 테마 ${k} 알약 ${ratio(ink, bg).toFixed(2)}`);
    }
  });
});

test('7 서랍: 제목 = 지도와 같은 짧은 이름(home-map label), 원장 이름은 부제 · HOME 자료 날짜는 이름을 붙여 원장 기준일과 구분', () => {
  const hm = require('../../data/board/home-map/41281.json');
  assert.equal(hm.projects.find((p) => p.id === 'PRJ-41281-0088').label, '고양창릉 A4');
  assert.equal(hm.projects.find((p) => p.id === 'PRJ-41281-0088').name, '고양창릉 A-4BL 아파트 건설공사 1공구');
  const ix = read('lib/board/projects-index.ts');
  assert.match(ix, /label: await mapLabelOf\(sgg, id\) \};/);
  assert.match(ix, /import\(`\.\.\/\.\.\/data\/board\/home-map\/\$\{sgg\}\.json`\)/);
  /* 창 제목(projectWindow — 2026-10-19 서랍 → 창): 사업 상세는 지도 이름표, 없으면 원장 이름 · 목록에서 뺀 사업은 그 이름 */
  const pw = read('lib/board/project-window.ts');
  assert.match(pw, /title: d\.label \?\? r\.name/);
  assert.match(pw, /kind: 'hidden', view, asked, canonical: p\.id, title: p\.name/);
  const d = read('components/projects/ProjectDetail.tsx');
  assert.match(d, /\{d\.label && d\.label !== r\.name \? <span data-slot="drawer-full"[^>]*>\{r\.name\}<\/span> : null\}/);
  assert.match(d, /사업 원장\(HOME\) \$\{edition\[1\]\}\.\$\{edition\[2\]\}\.\$\{edition\[3\]\} 받음/);   // HOME 이 무엇인지 붙여서(r3-screens 4)
  assert.doesNotMatch(d, /` · 자료 기준 \$\{edition/, '서랍의 HOME 받은 날을 \'자료 기준\'이라 부르지 않는다(화면의 자료 기준 = 원장 기준일)');
  assert.equal(IDX.referenceDate, '2026-10-20');   // 2026-10-20 사용자 결정: 기준일을 오늘로(manifest reference_date)
});

test('8 월별 실적 차트: Tab 은 차트에 한 번(마지막 달), 안에서 ←→·Home·End 로 옮긴다(링크·주소는 그대로)', () => {
  const m = read('components/charts/MonthLines.tsx');
  assert.match(m, /<a key=\{m\} href=\{href\(m\)\} data-roving tabIndex=\{i === months\.length - 1 \? 0 : -1\}/);
  assert.match(m, /<RovingKeys className=/);
  const r = read('components/charts/RovingKeys.tsx');
  assert.match(r, /^'use client';/);
  for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', "'Home'", "'End'"]) assert.ok(r.includes(k), k);
  assert.match(r, /items\[i\]\.setAttribute\('tabindex', '-1'\);\s*items\[j\]\.setAttribute\('tabindex', '0'\);\s*items\[j\]\.focus\(\);/);
});

test('9 착공 카드(통계누리) → ③착공 목록(원장): 목록 머리에 범위 차이를 보이는 글로', () => {
  assert.equal(D[0].list.href, '/projects?sido=all&stage=2');
  /* 2026-10-21 종합상황판·사업 화면 = HOME 규칙: 진척 관리(착공) 카드 목록은 HOME 6칸 ④건설(착공·준공 — stage=3), 사업 화면 목록 머리에 범위 차이 ⓘ */
  const HB = require('../../data/board/home-board.json');
  const HD = makeDirectives({ sourceCount: 19, stageNames: [...V.HOME_NAMES], ledger: HB, start: { year: '2026', upto: 8, cum: 156396, cumLy: 141000 }, bottleneck: V.bottleneckOf });
  assert.equal(HD[0].t, '진척 관리');
  assert.equal(HD[0].list.href, '/projects?sido=all&stage=3');
  assert.equal(V.HOME_NAMES[3], '건설');
  const p = read('app/(dashboard)/projects/page.tsx');
  assert.match(p, /\{f\.stage === 3 \? <InfoTip label="착공 목록 범위"[^>]*><p data-slot="start-basis">목록은 정책 진행 자료 원천 행 기준\(통계누리 착공 통계와 범위 다름\)/, '2026-10-18 서술형 정리: 보이는 글 대신 ⓘ');
  const HP = require('../../data/board/home-projects.json'), home = V.homeRowsOf(HP.rows, HP.residuals);
  const hctx = { ...fctx, programs: V.homeProgramsOf(home), home: { agencies: V.homeAgenciesOf(home).map((a) => a.name) } };
  const hf = V.parseFilters(Object.fromEntries(new URL(HD[0].list.href, 'http://x').searchParams), hctx), hl = V.applyFilters(home, hf);
  // 기준일 2026-10-20: 9·7 원천 행 중 지금 ④건설인 행 22건 · 집계 호수 17,865호(HOME 원천 행)
  // 2026-10-21 새 덤프(20261020T142230Z): 덤프 뒤였던 담당자 단계 측정값이 판에 들어와 ④건설 도달 행이 늘었다 → 26건 · 20,368호
  assert.deepEqual([hl.length, V.homeSummaryOf(hl, V.homeChartOf(hf)).units], [26, 20368], '목록 26건 · 20,368호(정책 진행 자료 원천 행)');
  const l = listOf(D[0].list.href);
  // 2026-10-19 수도권 한정: ③착공 목록 194건·107,554호 → 71건·48,320호 (= BOARD.stageUnits 지금 ③ 48,320, 후보 제외)
  // 2026-10-20 HOME 판: 71건·48,320호 → 150건·70,761호(새 사업 중 착공 단계 79건 — 단계 올리기 CONSTRUCTION_START 79)
  // 2026-10-20 같은 현장 병합 6쌍: ③ 인천 대체 3곳(2,016호) 빠지고 평택고덕은 대체 3 ↔ 대표 3(2,122호)이 맞바뀌어 147건·68,745호
  // 2026-10-20 공공 분류 안2: 화면은 공공 공급만(민간 정비 39·일반 민간 53 뺌): ③ 민간 79곳(22,329호) 빠져 68건·46,416호
  // 2026-10-21 새 덤프(20261020T142230Z): 새 사업 독산동(20호)·방화차고지(75호) ③착공 +2건·+95호
  assert.deepEqual([l.n, l.units], [70, 46511], '목록 70건 · 46,511호(원장)');
});

test('불변식: 지연 2 · 후보 계산 0 · 후보 0 · 수도권 262건 227,976호', () => {
  assert.equal(BOARD.judgment.delay.projects, 2);
  // 2026-10-19 수도권 한정: 후보 계산 313·후보 1,839 → 0
  assert.equal(BOARD.judgment.candidate.delay.projects, 0);
  const c = BOARD.judgment.candidate;
  assert.equal(c.ok.projects + c.caution.projects + c.delay.projects, 0);
  const metro = listOf('/projects?sido=metro');
  assert.deepEqual([metro.n, metro.units], [288, 242382]);   // 2026-10-21 새 덤프: 새 사업 3 · 2026-10-20 HOME 판 → 2026-10-20 같은 현장 병합 6쌍 → 2026-10-20 공공 분류 안2: 화면은 공공 공급만(민간 정비 39·일반 민간 53 뺌)
});
