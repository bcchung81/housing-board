'use strict';
/* 2차 개선(2026-10-16, 독립 디자인 평가 27/40) — 종합상황판·월 상세·기관 화면:
   1 월 상세 = 원장 그 달 준공 예정(HOME 날짜·원천 날짜 다름) · 2 '정상 · 예정일 지남(1개월 미만)' · 3 기관별 진행 비중 = 지연 중 비중 · 4 '판정 밖' → '일정 정보 없음'
   5 시도 타일: 판정 대상 있는 시도 앞에 크게, 나머지 한 줄 묶음 · 6 지연·주의 추이: 기준 변경 뒤 값 + 이전(빗금), 빈칸 없음 · 7 '현재 단계' 표지
   8 다크 링크 대비 · 9 날짜 점 표기 · 10 넓은 화면(1760) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('node:module').registerHooks({ resolve(s, c, n) { try { return n(s, c); } catch (e) { if (/^\.\.?\//.test(s)) return n(`${s}.ts`, c); throw e; } } });
const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');   // 주석 뺀 화면 글자
const V = require('../../lib/board/projects-view.ts');
const MA = require('../../lib/board/month-ahead.ts');
const R = require('../../lib/board/region.ts');
const MAP = require('../../data/board/ledger-map.json');
const IDX = require('../../data/board/projects-index.json');
const BOARD = require('../../data/board/ledger-board.json');
const CAL = require('../../data/board/region-calendar.json');
const LH = require('../../data/board/lh-completion.json');
const MOLIT = require('../../data/board/molit.json');

const rows = V.rowsOf(MAP.bySgg, IDX.projects, IDX.sgg), byId = new Map(rows.map((r) => [r.id, r]));
const board = read('components/board/Board.tsx'), month = read('app/(dashboard)/month/[id]/page.tsx'), agency = read('app/(dashboard)/agency/[id]/page.tsx');
const panel = (id) => board.slice(board.indexOf(`id="${id}"`), board.indexOf('</Card>', board.indexOf(`id="${id}"`)));
const sum = (xs) => xs.reduce((s, e) => s + e.units, 0);

/* 2026-10-21 결정(HOME 과 같은 조건): 월 상세 = 9·7 그 달 공급 예정(HOME 향후 12개월 공급 예정의 그 달 몫, 원천 사업 행 단위) — 정답 대조는 region-golden */
test('1 월 상세 = 9·7 그 달 공급 예정: 달마다 건수·호수가 지역 공급 9·7(수도권)·region-calendar home.p97.months 와 같다', () => {
  for (const u of CAL.home.p97.months) {
    const m = MA.monthSupply(CAL, u.ym);
    assert.deepEqual([new Set(m.map((e) => e.pro)).size, sum(m)], [u.projects, u.units], u.ym);
    assert.equal(sum(R.aheadAll(CAL.home.p97, 'metro', (c) => c).filter((e) => e.ym === u.ym)), sum(m), `${u.ym} 지역 공급(수도권) = 월 상세`);
  }
  assert.ok(MA.monthSupply(CAL, '2026-10').some((e) => /과천지식정보타운 S-12/.test(e.name) && e.units === 1424));
  /* 화면: 공급 예정 표(DataGrid) + 머리에 건수·호수, 종합상황판 앞으로 12개월 카드에 같은 달 링크 */
  assert.match(month, /monthSupply\(calendar, ym\)/);
  assert.match(month, /<DataGrid label=\{`\$\{monthLabel\(ym\)\} 공급 예정 사업`\}/);
  assert.match(month, /value=\{fmt\(dueUnits\)\} unit=\"호\"[^]*\$\{fmt\(due\.length\)\}건/);
  assert.match(month, /monthIds\(molit\.months, lh\.blocks, calendar\)/, '열리는 달 = 실적 + LH + 9·7 공급 예정');
  assert.match(read('app/(dashboard)/page.tsx'), /validMonths: monthIds\(molit\.months, lh\.blocks, calendar\)/, '종합상황판 월 링크도 같은 목록');
  const fut = panel('p-fut');
  assert.match(board, /const fu = up\[hasFut \? fi : 0\]/, '고른 달(앞으로 12개월 안) 또는 첫 달');
  assert.match(fut, /data-slot="fut-month"/);
  assert.match(fut, /href=\{`\/month\/\$\{fu\.ym\}`\}/);
  assert.match(fut, /\{f\(fu\.units\)\}호/, '링크 숫자 = 그 달 준공 예정 호수(= 월 상세 합계)');
  assert.ok(MA.monthIds(MOLIT.months, LH.blocks, CAL).includes('2027-09'), '앞으로 12개월 끝 달까지 월 상세가 열린다');
});

test("2 '경과 0개월'은 쓰지 않는다 · 월 상세 판정 칸 = HOME 사업 판정", () => {
  /* 2026-10-21: 월 상세 공급 예정 표의 상태 칸은 HOME 사업 판정 — 옛 '예정일 지남(1개월 미만)' 꼬리는 원장 준공 예정 표와 함께 빠졌다(문구는 projects-view 에 남음) */
  assert.match(month, /status: j \? \{ text: JUDGE_NAME\[j\.status\]/);
  for (const [f, s] of [['Board', board], ['month', month], ['agency', agency], ['month-ahead', read('lib/board/month-ahead.ts')]]) assert.doesNotMatch(code(s), /경과 0개월|경과 \$\{[^}]*\.months\}개월/, f);   // 규칙 설명('경과 6개월 이상')은 괜찮다
});

test('3 기관별 진행의 % = 범위(whole) 지연 중 몫(열 머리·title — 2026-10-16 4차 r4-board 5 에서 \'지연 중 비중\'을 바꿈)', () => {
  const ag = panel('p-agency');
  assert.match(ag, /data-slot="agency-head"[\s\S]*?\{whole\} 지연 중 몫/, '열 머리');
  assert.match(ag, /title=\{`[^`]*\$\{whole\} 지연 \$\{f\(J\.delay\.units\)\}호 중 \$\{a\.name\} 몫`\}/, '값 title');
});

test("4 용어: '판정 밖' → '일정 정보 없음'(종합상황판·기관 화면·지시 카드 설명), 후보는 '확인 필요(후보)' 조각으로 따로", () => {
  for (const [f, s] of [['Board', board], ['agency', agency], ['directives', read('lib/board/directives.ts')]]) {
    assert.doesNotMatch(code(s), /판정 밖/, f);
  }
  assert.match(code(board), /일정 정보 없음/);
  assert.match(agency, /status: JUDGE_NAME\[r\.judge\?\.status \?\? 'UNKNOWN'\]/, '2026-10-21: 기관 화면 상태 = HOME 사업 판정(판정 미확보 포함)');
  const ag = panel('p-agency');
  assert.match(ag, /width: pw\(cand\)/, '확인 필요(후보) 조각');
  assert.match(ag, /width: pw\(none\)/, '일정 정보 없음 조각');
  assert.match(board, /cand = a\.candidateUnits \?\? 0, none = out - cand/);
});

test('5 시도 타일: 시도는 서울·인천·경기 3곳뿐이고 모두 판정 대상이 있다 — 묶음 없이 모두 타일(r4-board 1)', () => {
  const judged = BOARD.regions.filter((r) => r.judged), rest = BOARD.regions.filter((r) => !r.judged);
  assert.deepEqual(judged.map((r) => r.code), ['11', '28', '41']);
  // 2026-10-19 수도권 한정: 시도 16칸(판정 대상 없는 13곳) → 3칸 모두 판정 대상 있음
  assert.equal(rest.length, 0); assert.equal(BOARD.regions.length, 3);
  const reg = panel('p-region');
  assert.match(reg, /\{L\.regions\.map\(\(r, ri\) =>/, '시도 모두 타일');
  assert.doesNotMatch(board, /region-fold|judgedRegions|restRegions/, '한 줄 묶음 없음');
  assert.match(reg, /data-slot="region-none"/, '판정 대상 없는 칸마다 짧은 표기');
});

test('6 지연·주의 추이: 기준 변경 뒤 값(큰 숫자)과 이전 기준(빗금 띠·점선)을 함께, 고정 높이·오른쪽 이름표 칸 없이 카드 높이를 채운다', () => {
  const tr = panel('p-trend');
  assert.doesNotMatch(board, /TLBL/, '오른쪽 이름표 칸(120px) 없음');
  assert.doesNotMatch(tr, /style=\{\{ height: TH \}\}/, '고정 높이(168px) 없음');
  assert.match(tr, /data-slot="trend-now"/, '선택 달 값(큰 숫자)');
  assert.match(tr, /data-slot="trend-old"/, '이전 기준 빗금 띠');
  assert.match(tr, /data-slot="trend-plot"[^>]*flex-1/, '그래프가 남는 높이를 채운다');
  assert.match(tr, /amSel \? <span[^>]*>비교 불가<\/span> : <span[^>]*>\{sg\(dv\)\}<\/span>/, '전월 대비 또는 비교 불가');
  assert.match(tr, /strokeDasharray="5 3"/, '이전 기준 선은 점선');
});

test("7 종합상황판 단계표 머리 = '현재 단계'(지역 공급의 '입주 예정'과 다른 정의가 드러나게)", () => {
  const snap = panel('p-snap');
  assert.match(snap, /data-slot="stage-now"[^>]*>현재 단계<\/span>/);
});

test('8 다크 링크 대비: muted-foreground 다크 값이 다크 바탕·카드에서 4.5:1 이상, 링크는 색 전환 애니메이션 없이 바로 테마 색', () => {
  const css = read('app/globals.css');
  const dark = css.slice(css.indexOf('\n.dark {'), css.indexOf('}', css.indexOf('\n.dark {')));
  const tok = (k) => new RegExp(`--${k}: (#[0-9A-Fa-f]{6})`).exec(dark)[1];
  const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const bg of ['background', 'card', 'pn2', 'accent']) assert.ok(ratio(tok('muted-foreground'), tok(bg)) >= 4.5, `${bg} ${ratio(tok('muted-foreground'), tok(bg)).toFixed(2)}:1`);
  assert.ok(ratio('#4D5B6F', '#111111') < 4.5, '라이트 값이 남으면 대비 부족(평가 실측 2.4~2.7:1)');
  for (const f of ['components/board/PanelLink.tsx', 'components/board/MapLink.tsx']) assert.doesNotMatch(read(f), /transition-colors/, f);
  assert.doesNotMatch(board, /data-slot="board-dir-list"[^>]*transition-\[color/, "지시 카드 '목록' 링크");
});

test('9 날짜 점 표기: 월 상세·기관 화면의 LH 준공예정일 칸은 2026.10.31(하이픈 없음)', () => {
  assert.doesNotMatch(month, /date: b\.date\b/);
  assert.match(month, /date: dayText\(b\.date\)/);
  assert.match(agency, /date: \{ text: dayText\(b\.date\)/);
  assert.match(agency, /asOf: s\.sourceAsOf \? dotDates\(s\.sourceAsOf\)/);
  assert.equal(V.dayText('2026-10-31'), '2026.10.31');
});

test('10 넓은 화면: 종합상황판 최대 폭 1760px, 1280px 이상은 한 6열 격자(리본 4 + 선택 시점 2, 아래 줄 2 + 2 + 2)라 1600px 이상도 같은 비율로 넓어진다', () => {
  assert.doesNotMatch(board, /max-w-\[1440px\]/);
  assert.match(board, /board-desktop mx-auto max-w-\[1760px\]/);
  assert.doesNotMatch(board, /min-\[1600px\]:grid-cols/, '1600px 따로 정한 열 없음(2026-10-18 6열 기본 격자)');
  assert.match(board, /<div className=\{cn\(grid6, 'grid-cols-\[minmax\(0,1fr\)_clamp\(340px,30vw,400px\)\] narrow:grid-cols-1'\)\}>/, '1행: 1280px 미만은 원래 두 칸');
  assert.match(board, /className=\{cn\(panel, 'min-\[1280px\]:col-span-4', linked/);
  assert.match(board, /className=\{cn\(panel, '@container min-\[1280px\]:col-span-2'\)\}/);
  assert.match(board, /<div className=\{cn\(grid6, 'grid-cols-\[repeat\(auto-fit,minmax\(min\(300px,100%\),1fr\)\)\] min-\[1280px\]:\[&>\*\]:col-span-2'\)\}>/, '3행: 2 + 2 + 2');
});
