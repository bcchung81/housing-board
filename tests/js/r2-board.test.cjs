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

test('1 월 상세 = 원장 그 달 준공 예정: 2026.10 전국 18건 8,807호(종합상황판 앞으로 12개월 막대와 같은 값), 수도권 4건 1,806호(지역 공급과 같은 값), 날짜는 HOME', () => {
  const oct = MA.monthDue(CAL, '2026-10');
  assert.equal(oct.length, 18); assert.equal(sum(oct), 8807);
  assert.deepEqual([oct.length, sum(oct)], [BOARD.upcoming[0].projects, BOARD.upcoming[0].units], '종합상황판 앞으로 12개월 첫 달과 같다');
  for (const u of BOARD.upcoming) { const m = MA.monthDue(CAL, u.ym); assert.deepEqual([m.length, sum(m)], [u.projects, u.units], u.ym); }
  const metro = oct.filter((e) => R.METRO.includes(e.sd));
  assert.deepEqual([metro.length, sum(metro)], [4, 1806], '지역 공급(수도권) 10월 4건 1,806호');
  assert.ok(metro.some((e) => /성남신촌/.test(e.name) && e.units === 227) && metro.some((e) => /서울공릉/.test(e.name) && e.units === 294));
  const a2 = oct.find((e) => e.id === 'PRJ-28245-0055');
  assert.equal(V.dayText(a2.day), '2026.10.11', 'HOME 정본 날짜');
  assert.equal(V.dateAltOf(byId.get(a2.id)).text, '원천 날짜 다름(LH 2026.10.31)', 'LH 파일 날짜는 표지로');
  assert.ok(oct.every((e, i) => i === 0 || (oct[i - 1].day ?? '') <= (e.day ?? '')), '예정일 순');
  /* 화면: 원장 목록 표(DataGrid) + 머리에 건수·호수, 종합상황판 앞으로 12개월 카드에 같은 달 링크(숫자 = 월 상세 합계) */
  assert.match(month, /monthDue\(calendar, ym\)/);
  assert.match(month, /<DataGrid label=\{`\$\{monthLabel\(ym\)\} 준공 예정 사업`\}/);
  assert.match(month, /\{fmt\(due\.length\)\}건 · \{fmt\(dueUnits\)\}호/);
  assert.match(month, /dateAltOf\(r\)/, '원천 날짜 다름 표지');
  assert.match(month, /monthIds\(molit\.months, lh\.blocks, calendar\)/, '열리는 달 = 실적 + LH + 원장 준공 예정');
  assert.match(read('app/(dashboard)/page.tsx'), /validMonths: monthIds\(molit\.months, lh\.blocks, calendar\)/, '종합상황판 월 링크도 같은 목록');
  const fut = panel('p-fut');
  assert.match(board, /const fu = up\[hasFut \? fi : 0\]/, '고른 달(앞으로 12개월 안) 또는 첫 달');
  assert.match(fut, /data-slot="fut-month"/);
  assert.match(fut, /href=\{`\/month\/\$\{fu\.ym\}`\}/);
  assert.match(fut, /\{f\(fu\.units\)\}호/, '링크 숫자 = 그 달 준공 예정 호수(= 월 상세 합계)');
  assert.ok(MA.monthIds(MOLIT.months, LH.blocks, CAL).includes('2027-09'), '앞으로 12개월 끝 달까지 월 상세가 열린다');
});

test("2 예정일 지남 문구: '정상 · 예정일 지남(1개월 미만)' — '경과 0개월'은 쓰지 않는다", () => {
  assert.equal(MA.dueStatus('정상', true), '정상 · 예정일 지남(1개월 미만)');
  assert.equal(MA.dueStatus('정상', false), '정상');
  const a2 = MA.monthDue(CAL, '2026-10').find((e) => e.id === 'PRJ-28245-0055');
  assert.equal(MA.dueStatus(V.statusLabel(byId.get(a2.id)), R.pastDue(a2, CAL.referenceDate)), '정상 · 예정일 지남(1개월 미만)', '계양 A2(10.11, 기준일 10.13)');
  assert.match(month, /dueStatus\(V?\.?statusLabel\(r\), pastDue\(e, calendar\.referenceDate\)\)/);
  for (const [f, s] of [['Board', board], ['month', month], ['agency', agency], ['month-ahead', read('lib/board/month-ahead.ts')]]) assert.doesNotMatch(code(s), /경과 0개월|경과 \$\{[^}]*\.months\}개월/, f);   // 규칙 설명('경과 6개월 이상')은 괜찮다
});

test('3 기관별 진행의 % = 전국 지연 중 몫(열 머리·title — 2026-10-16 4차 r4-board 5 에서 \'지연 중 비중\'을 바꿈)', () => {
  const ag = panel('p-agency');
  assert.match(ag, /data-slot="agency-head"[\s\S]*?\{whole\} 지연 중 몫/, '열 머리');
  assert.match(ag, /title=\{`[^`]*\$\{whole\} 지연 \$\{f\(J\.delay\.units\)\}호 중 \$\{a\.name\} 몫`\}/, '값 title');
});

test("4 용어: '판정 밖' → '일정 정보 없음'(종합상황판·기관 화면·지시 카드 설명), 후보는 '확인 필요(후보)' 조각으로 따로", () => {
  for (const [f, s] of [['Board', board], ['agency', agency], ['directives', read('lib/board/directives.ts')]]) {
    assert.doesNotMatch(code(s), /판정 밖/, f);
  }
  assert.match(code(board), /일정 정보 없음/);
  assert.match(agency, /status: \{ text: '일정 정보 없음', muted: true,/);
  const ag = panel('p-agency');
  assert.match(ag, /width: pw\(cand\)/, '확인 필요(후보) 조각');
  assert.match(ag, /width: pw\(none\)/, '일정 정보 없음 조각');
  assert.match(board, /cand = a\.candidateUnits \?\? 0, none = out - cand/);
});

test('5 시도 타일: 판정 대상은 서울·인천·경기 3곳, 13곳은 판정 대상 없음 — 2026-10-16 4차 사용자 지시로 묶음을 되돌려 16칸 모두 타일(r4-board 1)', () => {
  const judged = BOARD.regions.filter((r) => r.judged), rest = BOARD.regions.filter((r) => !r.judged);
  assert.deepEqual(judged.map((r) => r.code), ['11', '28', '41']);
  assert.equal(rest.length, 13);
  const reg = panel('p-region');
  assert.match(reg, /\{L\.regions\.map\(\(r, ri\) =>/, '16곳 모두 타일');
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
  const css = read('app/tailwind.css');
  const dark = css.slice(css.indexOf('\n.dark {'), css.indexOf('}', css.indexOf('\n.dark {')));
  const tok = (k) => new RegExp(`--${k}: (#[0-9A-Fa-f]{6})`).exec(dark)[1];
  const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const bg of ['background', 'card', 'pn2', 'accent']) assert.ok(ratio(tok('muted-foreground'), tok(bg)) >= 4.5, `${bg} ${ratio(tok('muted-foreground'), tok(bg)).toFixed(2)}:1`);
  assert.ok(ratio('#4D5B6F', '#0A1030') < 4.5, '라이트 값이 남으면 대비 부족(평가 실측 2.4~2.7:1)');
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

test('10 넓은 화면: 종합상황판 최대 폭 1760px, 1600px 이상에서 오른쪽 칸·아래 줄 열을 넓혀 채운다', () => {
  assert.doesNotMatch(board, /max-w-\[1440px\]/);
  assert.match(board, /board-desktop mx-auto max-w-\[1760px\]/);
  assert.match(board, /min-\[1600px\]:grid-cols-\[minmax\(0,1fr\)_clamp\(400px,26vw,460px\)\]/);
  assert.match(board, /min-\[1600px\]:grid-cols-3/);
});
