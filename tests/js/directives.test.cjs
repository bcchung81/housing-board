'use strict';
// 총리 지시 6건을 요구사항으로 반영한 화면(2026-10-10, DESIGN.md 결정 이력)을 확인한다.
// 8.14 정례 보고 → 보고자료, 9.4 국민 예측가능성 → 우리 동네, 9.30 쉬운 설명 → 사업 상세의 '다음 단계'. 숫자는 calc.ts 의 순수 함수로 다시 세어 대조한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const C = require('../../lib/board/calc.ts');
const AHEAD = require('../../data/board/ledger-board.json').observedMonth;   // lib/board/data.ts 의 AHEAD_FROM
const molit = require('../../data/board/molit.json');
const lh = require('../../data/board/lh-completion.json');
const { MENU } = require('../../lib/shell/menu.ts');

test('앞으로를 세는 기준 달은 종합상황판의 향후 12개월(원장 upcoming)과 같은 원장 관측 달이다(월 갱신을 따라간다)', () => {
  assert.match(fs.readFileSync(path.join(__dirname, '../../lib/board/data.ts'), 'utf8'), /AHEAD_FROM: l\.board\.observedMonth/);
  assert.equal(require('../../data/board/ledger-board.json').upcoming[0].ym, AHEAD);
  assert.match(read('app/(dashboard)/page.tsx'), /^    ledger,$/m);
});

test('우리 동네 달력(lhCalendar): 시도별 달력을 모두 더하면 전국 LH 준공 예정(lhByMonth)과 같고, 달 안은 날짜 순이다', () => {
  const sido = [...new Set(lh.blocks.map((b) => b.sido))];
  const nation = C.lhByMonth(lh, AHEAD, 12);
  const cals = sido.map((s) => C.lhCalendar(lh, s, AHEAD, 12));
  nation.forEach((m, i) => {
    assert.equal(cals.reduce((a, c) => a + c[i].units, 0), m.units, `${m.ym} 세대수`);
    assert.equal(cals.reduce((a, c) => a + c[i].blocks.length, 0), m.blocks, `${m.ym} 블록 수`);
    assert.equal(cals[0][i].ym, m.ym);
  });
  for (const c of cals) for (const m of c) for (let k = 1; k < m.blocks.length; k++) assert.ok(m.blocks[k - 1].date <= m.blocks[k].date, '날짜 순');
  const gyeonggi = C.lhCalendar(lh, '41', AHEAD, 12);
  assert.ok(gyeonggi.some((m) => m.blocks.length), '경기는 1년 안 준공 예정이 있다');
});

test('월간 보고(8.14 정례 보고): 사업 화면의 인쇄 보기(?print=1·@media print)가 핵심 질문·단계별 진행·정책 목표 대비(펼침)·점검 필요 사업(10줄 넘으면 상위 10)·기준일·출처를 담는다(2026-10-14 보고자료 메뉴를 사업 화면으로 합침)', () => {
  const s = read('app/(dashboard)/projects/page.tsx');
  assert.match(s, /<h1 [^>]*>월간 주택공급 보고<\/h1>/);
  assert.match(s, /점검 필요 \$\{fmt\(prioN\)\}건 전부/, "10줄 이하면 '점검 필요 n건 전부'(넘으면 상위 10)");
  assert.match(s, /const prioAll = priorityOf\(scope, Infinity\), top = prioAll\.slice\(0, 10\);/);
  assert.match(s, /자료 기준: 사업 원장 \{ref\}/);
  assert.doesNotMatch(s, /HOME 덤프 \{pp\.source\.edition\}/, "판 번호(20261014T102506Z)를 화면에 내지 않는다");
  assert.match(s, /출처: 사업 원장/);
  assert.ok(!fs.existsSync(path.join(ROOT, 'app/(dashboard)/reports')), '옛 보고자료 화면은 없다(/reports → /projects?print=1)');
  // 이번 달 증감은 전월·전년 같은 달과 비교한다
  const last = C.lastMonth(molit);
  assert.equal(C.nextYm(last, -1), '2026-07');
  assert.equal(C.nextYm(last, -12), '2025-08');
});

test('지역 공급(9.4 국민 예측가능성): 시도를 고르면 앞으로 12개월 모집·준공·입주 예정과 고른 달 목록을 보이고, 자격 판단은 하지 않는다', () => {
  const page = read('app/(dashboard)/region/page.tsx'), ahead = read('components/region/Ahead.tsx');
  assert.match(page, /aheadAll\(calendar, sido, sidoName\)/);
  assert.match(page, /청약 자격은 모집공고에서 확인/);
  assert.match(ahead, /role="radiogroup" aria-label="달 고르기"/, '달은 키보드로 고른다(←→)');
  assert.match(ahead, /const href = projectHref\(e, sido\);/, '사업은 사업 화면 서랍으로 연다(범위 붙임 — data-audit-1016 결함 3)');
  assert.equal(require('../../lib/board/region.ts').projectHref({ id: 'PRJ-28245-0001', drawer: true, sd: '28' }, 'metro'), '/projects?id=PRJ-28245-0001');
  assert.doesNotMatch(page + ahead, /자격 (판정|충족)/);
});

test('사업 상세(9.30 쉬운 설명): 서랍의 지금 단계는 6단계 스텝(현재 표시·칸 title 의 질문)이 보이고 문장으로 되풀이하지 않으며, 그 시도의 지역 공급으로 이어 준다', () => {
  const s = read('components/projects/ProjectDetail.tsx');
  assert.match(s, /<StageSteps current=\{r\.board\}/);
  assert.doesNotMatch(s, /단계입니다 — /, '그림이 보여 주는 지금·다음 단계를 문장으로 다시 쓰지 않는다(2026-10-13 화면 규칙)');
  assert.match(read('components/projects/StageSteps.tsx'), /title=\{`\$\{BOARD_CIR\[i\]\} \$\{name\} — \$\{QUESTION\[i\]\}/, '단계마다 답할 질문은 칸의 title');
  assert.match(s, /href=\{`\/region\?sido=\$\{r\.sgg\.slice\(0, 2\)\}`\}/);
});

test("메뉴: 보고자료·우리 동네는 화면이 생겨 '준비 중'이 아니고, 빈 화면을 그리던 [section] 경로는 없다", () => {
  assert.deepEqual(MENU.filter((m) => m.soon), []);
  assert.ok(!fs.existsSync(path.join(ROOT, 'app/(dashboard)/[section]')), '[section] 경로');
  for (const f of ['app/(dashboard)/projects/page.tsx', 'app/(dashboard)/region/page.tsx']) assert.ok(fs.existsSync(path.join(ROOT, f)), f);   // 보고자료 → 사업 인쇄 보기, 우리 동네 → 지역 공급(2026-10-14)
});

test('종합상황판의 총리 지시 줄은 원래 카드 그대로다(그림을 넣지 않는다 — 사용자 피드백 2026-10-10) — 2026-10-18 통일 규격: 두 줄(지시 이름 / 앞말 + 숫자 + 단위)', () => {
  const b = read('components/board/Board.tsx');
  assert.match(b, /<div className="grid grid-cols-2 gap-3 min-\[901px\]:grid-cols-3 min-\[1280px\]:grid-cols-6">/, '1280px 이상 6열 · 901~1279px 3열 · 900px 이하 2열(간격 12 하나, 2026-10-19)');
  assert.match(b, /text-sm leading-5', hide && 'invisible'\)\} aria-hidden=\{hide \|\| undefined\}>\{x\.t\}<\/span>/, '윗줄은 지시 주제 이름뿐(꼬리 없음)');
  assert.doesNotMatch(b, /\{x\.date\} · \{x\.t\}<\/span>|x\.sub\.note|data-slot="dir-tag"/, '날짜 접두·꼬리 작은 줄은 화면에 없다');
  assert.match(b, /data-slot="board-dir" title=\{`\$\{x\.date\} 지시 · \$\{x\.t\}\\n\$\{x\.basis\}`\}/, '날짜·지시 이름·기준은 hover title');
  assert.match(b, /\{pre \? <span className="ui-dir-label text-sm">\{pre\}<\/span> : null\}/, '아랫줄 = 앞말 14/400');
  assert.match(b, /text-md @min-\[180px\]:text-lg[^>]*>\{big\}<span className="text-sm font-normal">\{u\}<\/span>/, '+ 큰 숫자 20(좁으면 18) + 단위 14');
  assert.doesNotMatch(b, /<Real title=\{x\.basis\}/, '카드에 실데이터 표지를 달지 않는다');
  assert.doesNotMatch(b, /DIR_TL|top-\[83\.5px\]/);
  assert.match(b, /data-slot="board-dir"[^>]*className=\{cn\(btn, dirFrame, '[^']*\bmin-h-16 /, '카드 높이 64px 이상(내용만큼 자람)');
  assert.match(b, /const dirFrame = 'ui-dir @container';/, '틀은 globals 부품 .ui-dir(제목 위·값 아래, 여백 12/16, 바깥 카드 반경 — 2026-10-19)');
  assert.doesNotMatch(read('app/globals.css'), /\[data-slot="board-dir"\] \{ padding/, '데스크톱 덧댄 위아래 여백 없음');
});

test('종합상황판 리본 차트: 상자는 가로로만 밀리고(세로 스크롤바로 그림이 흔들리지 않게), 선택한 달의 기준 막대는 테두리 없는 반투명 HUD 막대다', () => {
  const b = read('components/board/Board.tsx'), r = read('components/board/ribbon.ts');
  assert.match(b, /<div className="mt-3 overflow-x-auto overflow-y-hidden">/, '본문 시작 간격 mt-3(패널 머리 줄 통일)');
  assert.match(b, /rx="3" fill=\{CUR\.fill\} className="rb-cur" pointerEvents="none" \/>/);
  assert.doesNotMatch(b, /stroke=\{CUR\./, '기준 막대에 테두리가 없다');
  assert.match(r, /export const CUR = \{ fill: 'url\(#cur-hud\)' \};/);
  assert.match(r, /<linearGradient id="cur-hud" x1="0" y1="0" x2="0" y2="1">/);
});

test('종합상황판 리본 그라데이션·12개월 막대 단색: 층마다 위 하이라이트→단계색→아래 그늘, 색은 style 로 준다(stop-color 속성의 color-mix 는 검정으로 칠해졌다), 층 경계는 --rb-seam', () => {
  const r = read('components/board/ribbon.ts'), b = read('components/board/Board.tsx'), tw = read('app/globals.css');
  assert.match(r, /<stop offset="0" style="stop-color:color-mix\(in srgb, \$\{C\[k\]\} 70%, var\(--rb-hi\)\)"\/>/);
  assert.match(r, /<stop offset="1" style="stop-color:color-mix\(in srgb, \$\{C\[k\]\} 86%, var\(--rb-lo\)\)"\/>/);
  assert.doesNotMatch(r + b, /stop-color="color-mix|stopColor=\{`color-mix/, 'color-mix 를 stop-color 속성에 넣지 않는다');
  assert.match(r, /fill="url\(#rbg\$\{k\}\)"/);
  assert.match(r, /stroke="\$\{PAL\.seam\}" stroke-width="0\.9"/);
  assert.match(b, /fill="var\(--st-soon\)"/, '12개월 막대는 시안처럼 단색(그라데이션 없음)');
  for (const sel of ['\n:root {', '\n.dark {']) { const i = tw.indexOf(sel), blk = tw.slice(i, tw.indexOf('\n}\n', i)); assert.match(blk, /--rb-hi: #/); assert.match(blk, /--rb-lo: #/); }
});

test('리본 위 라벨·툴팁은 흰 판이 아니라 HUD 유리다: 반투명 남색 판 + 밝은 가장자리 + 흰 글자(강조 띠 없음), 뒤가 가장 밝아도 4.5:1', () => {
  const r = read('components/board/ribbon.ts'), b = read('components/board/Board.tsx'), tw = read('app/globals.css');
  assert.match(r, /fill="\$\{PAL\.hud\}" stroke="\$\{PAL\.hudLine\}"/);
  assert.match(r, /fill="\$\{PAL\.hudTxt\}"/);
  assert.doesNotMatch(r + tw, /rb-halo/, '흰 판 토큰(--rb-halo)은 없다');
  assert.match(r, /labelSVG\(L\.total, L\.total\.text\)/);
  assert.match(r, /font-size="14" text-anchor="middle">\$\{text\}<\/text>/, '총량 라벨은 14 보통 글자(2026-10-18 강조 재배분 — 매달 같은 총량이 가장 큰 강조가 되지 않게)');
  assert.doesNotMatch(r.slice(r.indexOf('function labelSVG'), r.indexOf('export function ribbonDynamic')), /width="3"|accent|font-weight/, '왼쪽 3px 강조 띠·굵은 글자 없음(색 왼쪽 테두리 금지)');
  assert.match(read('lib/board/sample.ts'), /tt = `\$\{f\(g\.total\[cur\]\)\}호`/);
  assert.match(b, /data-slot="board-tip" className="dark [^"]*bg-\[color-mix\(in_srgb,var\(--popover\)_88%,transparent\)\][^"]*backdrop-blur-\[6px\]/, '툴팁은 다크 범위의 반투명 유리');
  // 대비: 유리(rgb a%)를 가장 밝은 바탕(흰색) 위에 깔았을 때 흰 글자
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  for (const sel of ['\n:root {', '\n.dark {']) {
    const i = tw.indexOf(sel), blk = tw.slice(i, tw.indexOf('\n}\n', i));
    const m = /--rb-hud: rgb\((\d+) (\d+) (\d+) \/ (\d+)%\);/.exec(blk); assert.ok(m, `${sel} --rb-hud`);
    const a = +m[4] / 100, bg = [+m[1], +m[2], +m[3]].map((v) => v * a + 255 * (1 - a));
    const r2 = (1.05) / (lum(bg) + 0.05); assert.ok(r2 >= 4.5, `${sel.trim()} 흰 바탕 위 HUD 판의 흰 글자 ${r2.toFixed(2)}:1`);
  }
});
