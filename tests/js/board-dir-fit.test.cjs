/* 종합상황판 총리 지시 카드 6장 통일 규격(2026-10-18 디자인 진단 P1): 두 줄 고정(지시 이름 / 값), 숫자 자체가 목록 링크, 바깥 카드 규격 — 소스 구조 시험 + 글자 폭 계산 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const board = fs.readFileSync(path.join(__dirname, '../../components/board/Board.tsx'), 'utf8');
const btn = board.slice(board.indexOf('data-slot="board-dir" title='), board.indexOf('</button>', board.indexOf('data-slot="board-dir" title=')));
const cls = btn.match(/className=\{cn\(btn, dirFrame, '([^']*)'/)[1];
const frame = board.match(/const dirFrame = '([^']*)';/)[1];
const layer = board.slice(board.indexOf('data-slot="board-dir-value"'), board.indexOf('</div>', board.indexOf('data-slot="board-dir-value"')));
const vals = board.slice(board.indexOf('function dirVals'), board.indexOf('/* 줄1: 지시 이름'));

const css = fs.readFileSync(path.join(__dirname, '../../app/globals.css'), 'utf8');
const rule = (sel) => (css.match(new RegExp(`\\n  ${sel.replace(/[.[\]()*+?^$|~>=":]/g, '\\$&')} \\{([^}]*)\\}`)) || [])[1] || '';

test('틀(2026-10-19 globals 부품 .ui-dir): 바깥 카드(반경 14 · 카드 그림자 · 1px 테두리), 여백 12/16(타일) · 두 줄 사이 4, 높이 64 이상 내용만큼 — 단추와 겹친 층이 같은 틀', () => {
  assert.equal(frame, 'ui-dir @container');
  const dir = rule('.ui-dir');
  assert.match(dir, /display: flex;\s*flex-direction: column;\s*justify-content: space-between;\s*gap: var\(--dir-gap\);/);
  assert.match(dir, /border: var\(--border-w\) solid transparent;\s*border-radius: var\(--radius-card\);\s*padding: var\(--dir-pad-y\) var\(--dir-pad-x\);/);
  assert.match(css, /--dir-pad-y: var\(--pad-tile-y\);[^\n]*\n  --dir-pad-x: var\(--pad-tile-x\);\n  --dir-pad-x-tight: 12px;[^\n]*\n  --dir-gap: 4px;/);
  assert.match(css, /@media \(min-width: 1280px\) and \(max-width: 1365px\) \{\n  :root \{ --dir-pad-x: var\(--dir-pad-x-tight\); \}/, '1280~1365px 6열은 좌우 12');
  assert.match(css, /@media \(max-width: 520px\) \{\n  :root \{ --dir-pad-y: var\(--pad-compact-y\); --dir-pad-x: var\(--pad-compact-x\); \}/, '520px 이하는 촘촘 8/10');
  assert.match(rule('.ui-dir-face'), /background-color: var\(--card\);\s*color: var\(--card-foreground\);\s*border-color: var\(--border\);\s*box-shadow: var\(--shadow-card\);/);
  assert.match(cls, /^ui-dir-face ui-pick q-rise relative min-h-16 h-full w-full min-w-0$/);
  assert.doesNotMatch(cls + frame, /ui-tile-compact|rounded-tile/, '촘촘 타일(반경 10 · 그림자 없음)이 아니다');
  assert.doesNotMatch(cls, /\boverflow-hidden\b|(^| )h-20 |\bmax-h-/, '자르지 않고 고정·최대 높이 없음');
  assert.match(layer, /cn\(dirFrame, 'ui-dir-layer pointer-events-none absolute inset-0 z-\[1\]'\)/, '겹친 층 = 같은 틀(투명 테두리 자리 포함), 누름은 단추로 흘려보낸다');
});

test('상호작용(2026-10-19): 칸째 떠오름(가리킴·키보드 초점) · 누르는 순간 내려앉음 80ms · 고른 것 = 주색 옅은 면 + 1px 주색 + 숫자 주색(2px·고리 없음)', () => {
  assert.match(board, /<div key=\{i\} className="ui-dir-cell relative min-w-0">/);
  assert.match(css, /\.ui-dir-cell:hover > \.ui-dir-face \{ box-shadow: var\(--shadow-hover\); \}/);
  assert.match(css, /\.ui-dir-cell:hover > \.ui-dir-face:not\(\[aria-pressed="true"\]\) \{ border-color: color-mix\(in srgb, var\(--primary\) var\(--lift-mix\), var\(--border\)\); \}/);
  assert.match(css, /\.ui-dir-cell:has\(> \.ui-dir-face:focus-visible\) \{ translate: 0 var\(--lift-y\); \}/);
  assert.match(css, /--dur-press: 80ms;/);
  assert.match(css, /\.ui-dir-face\[aria-pressed="true"\] ~ \.ui-dir-layer \{ --dir-num: var\(--primary\); \}/, '고른 카드의 숫자 = 주색');
  const pressed = [...css.matchAll(/\[aria-pressed="true"\][^{]*\{([^}]*)\}/g)].filter((m) => /ui-(pick|dir|press|region)/.test(css.slice(css.lastIndexOf('\n', m.index), m.index + 1))).map((m) => m[1]).join(' ');
  assert.match(pressed, /border-color: var\(--primary\)/, '고른 것 규칙을 찾았다');
  assert.doesNotMatch(pressed, /0 0 0 \dpx|inset 0 0 0|outline|border-w-on/, '고른 것에 고리·2px 없음');
});

test('줄1: 지시 이름 14/400 muted · 길면 말줄임(70% 제한 없음) · 오른쪽 (i) 자리 — 꼬리(통계누리·기간) 없음', () => {
  assert.match(board, /const dirTitle = \(x: Directive, hide = false\) => \(\n  <span className=\{cn\('ui-dir-label block min-w-0 truncate pr-7 text-sm leading-5', hide && 'invisible'\)\} aria-hidden=\{hide \|\| undefined\}>\{x\.t\}<\/span>/);
  assert.doesNotMatch(board, /max-w-\[70%\]|data-slot="dir-tag"|x\.tag|x\.note/);
  assert.match(board, /<div className="ui-dir-info z-\[2\] flex items-center">/, '(i) 는 단추 밖 형제(단추 안에 단추를 넣지 않는다)');
  assert.match(rule('.ui-dir-info'), /position: absolute;\s*top: calc\(var\(--dir-pad-y\) \+ var\(--dir-info-dy\)\);\s*right: var\(--dir-pad-x\);/, '(i) 자리는 여백 토큰을 따른다');
  assert.match(board, /<InfoTip label=\{`\$\{x\.t\} 기준`\} className="h-7 px-0\.5">\n\s*<p>\{x\.basis\}<\/p><p className="text-muted-foreground">\{x\.list\.title\}<\/p>\{x\.pair \? <p className="text-muted-foreground">\{x\.pair\.list\.title\}<\/p> : null\}/, '(i) = 기준 + 숫자 링크가 여는 목록');
});

test('줄2: 앞말 14/400 muted + 큰 숫자 20/700(내용 폭 180px 미만 18) + 단위 14/400 + 보조 값 14 muted(220px 미만 숨김, 색 없음) — 색 위계는 토큰(--dir-label·--dir-num·--dir-sub)', () => {
  assert.match(vals, /\{pre \? <span className="ui-dir-label text-sm">\{pre\}<\/span> : null\}/);
  assert.match(vals, /<span data-big className=\{cn\(disp, 'ui-dir-num text-md @min-\[180px\]:text-lg leading-title'\)\}>\{big\}<span className="text-sm font-normal">\{u\}<\/span><\/span>/);
  assert.match(vals, /data-slot="dir-sub" className="ui-dir-sub hidden text-sm tabular-nums @min-\[220px\]:inline">\{x\.sub\}<\/span>/);
  assert.doesNotMatch(vals, /text-ok|text-bad|text-warn|font-bold text-ink2|text-xs|text-muted-foreground|text-foreground/, '앞말 굵게·12px·상태색 없음, 색은 부품 토큰');
  assert.match(rule('.ui-dir'), /--dir-label: var\(--muted-foreground\);\s*--dir-num: var\(--foreground\);\s*--dir-sub: var\(--muted-foreground\);/);
  assert.match(board, /const dirRow = 'flex min-w-0 flex-wrap items-baseline gap-x-2 leading-title whitespace-nowrap';/, '두 숫자 사이 간격 8');
  assert.match(btn, /<span className=\{cn\(dirRow, 'invisible'\)\} aria-hidden="true">\{dirVals\(x, false\)\}<\/span>/, '단추 안 값 줄은 자리만');
});

test('링크: 숫자 자체가 목록 링크(점선 밑줄 → 가리키면 주색 실선) — 링크 글자·자리표 없음, href·title 은 지시 값 그대로', () => {
  assert.match(vals, /\{link \? <Link href=\{l\.href\} title=\{l\.title\} aria-label=\{`\$\{x\.t\} \$\{pre \? pre \+ ' ' : ''\}\$\{big\}\$\{u\} 목록`\} data-slot="board-dir-list" className=\{cn\(dirNum, 'pointer-events-auto'\)\}>\{num\}<\/Link> : num\}/);
  assert.match(board, /const dirNum = 'ui-dir-link rounded-chip';/);
  assert.match(rule('.ui-dir-num'), /color: var\(--dir-num\);\s*text-decoration: underline dotted var\(--muted-foreground\) var\(--border-w\);\s*text-underline-offset: var\(--num-underline-offset\);/);
  assert.match(css, /\.ui-dir-link:hover \.ui-dir-num \{ color: var\(--primary\); text-decoration-color: var\(--primary\); text-decoration-style: solid; \}/);
  assert.match(vals, /\{one\(x\.pre, x\.big, x\.u, x\.list, 'a'\)\}\n\s*\{x\.pair \? one\(x\.pair\.pre, x\.pair\.big, x\.pair\.u, x\.pair\.list, 'b'\) : null\}/, '두 숫자 카드는 숫자마다 자기 목록');
  assert.match(layer, /<span className=\{dirRow\}>\{dirVals\(x, true\)\}<\/span>/, '6장 모두 겹친 층의 숫자가 링크');
  assert.doesNotMatch(board, /dir-list-gap|dirListText|\{x\.list\.text|'목록'|board-dir-pair/);
});

test('열: 1280px 이상 6열 · 901~1279px 3열(2줄 띠) · 900px 이하 2열, 간격 12 하나(901px 이상은 패널 줄과 같은 세로선)', () => {
  assert.match(board, /<div className="grid grid-cols-2 gap-3 min-\[901px\]:grid-cols-3 min-\[1280px\]:grid-cols-6">/);
});

/* 글자 폭: 번들 Noto Sans KR(assets/fonts/noto-sans-kr)의 글자 너비(em) — 한글 0.92, 숫자 400 0.555 / 700 0.59, 쉼표·마침표 0.278 / 0.325, % 0.921 / 0.963, 공백 0.224 */
const ADV = { 400: { d: 0.555, p: 0.278, pct: 0.921, sp: 0.224 }, 700: { d: 0.59, p: 0.325, pct: 0.963, sp: 0.227 } };
const tw = (t, px, wt = 400) => [...t].reduce((w, c) => w + px * (/[가-힣]/.test(c) ? 0.92 : /[0-9+−]/.test(c) ? ADV[wt].d : /[,.]/.test(c) ? ADV[wt].p : c === '%' ? ADV[wt].pct : c === ' ' ? ADV[wt].sp : 0.6), 0);
const one = (pre, big, u, px) => (pre ? tw(pre, 14) + 4 : 0) + tw(big, px, 700) + tw(u, 14);
const rowW = (d, px, sub) => one(d.pre, d.big, d.u, px) + (d.pair ? 8 + one(d.pair.pre, d.pair.big, d.pair.u, px) : 0) + (sub && d.sub ? 8 + tw(d.sub, 14) : 0);
/* 카드 내용 폭 = (본문 − 간격 12) ÷ 열 − 좌우 여백 × 2 − 테두리 2. 좌우 여백 = --dir-pad-x: 16(1280~1365px 6열 12 · 520px 이하 10). 본문 = 창 − 스크롤바 − 좌우 56(900px 이하 24), 1760px 상한 */
const padX = (vw) => (vw <= 520 ? 10 : vw >= 1280 && vw <= 1365 ? 12 : 16);
const inner = (vw, sb) => { const cols = vw >= 1280 ? 6 : vw >= 901 ? 3 : 2, gap = 12, body = Math.min(vw - sb, 1760) - (vw <= 900 ? 24 : 56); return (body - gap * (cols - 1)) / cols - padX(vw) * 2 - 2; };
/* 두 줄 높이 = 위아래 여백 + 지시 이름 줄 20 + 사이 4 + 값 줄(숫자 크기 × 1.2) + 테두리 2 */
const cardH = (vw, px) => (vw <= 520 ? 8 : 12) * 2 + 20 + 4 + px * 1.2 + 2;

test('값 줄은 1280px 이상·901~1279px·900px 에서 한 줄(카드 두 줄 높이) — 숫자·보조 값 크기 단계가 폭에 맞는다(스크롤바 0·17px 모두)', () => {
  const { makeDirectives } = require('../../lib/board/directives.ts');
  const S = require('../../lib/board/sample.ts'), C = require('../../lib/board/calc.ts');
  const L = require('../../data/board/ledger-board.json'), molit = require('../../data/board/molit.json');
  const last = C.lastMonth(molit);
  const start = { year: last.slice(0, 4), upto: Number(last.slice(5)), cum: C.ytd(molit, 'start', C.NATION, last), cumLy: C.ytd(molit, 'start', C.NATION, C.nextYm(last, -12)) };
  const dir = makeDirectives({ sourceCount: 19, stageNames: S.K, ledger: L, start, bottleneck: require('../../lib/board/projects-view.ts').bottleneckOf });
  for (const vw of [1280, 1300, 1365, 1366, 1440, 1600, 1920, 2117, 1101, 1279, 901, 900]) for (const sb of [0, 17]) {
    const w = inner(vw, sb), px = w >= 180 ? 20 : 18, sub = w >= 220;
    assert.ok(cardH(vw, px) <= 74, `${vw}px 카드 높이 ${cardH(vw, px)}px — 두 줄(74 이하)`);
    for (const d of dir) {
      assert.ok(rowW(d, px, sub) <= w, `${vw}px(스크롤바 ${sb}) ${d.t}: 값 줄 ${rowW(d, px, sub).toFixed(1)}px > 내용 폭 ${w.toFixed(1)}px`);
      assert.ok(tw(d.t, 14) + 28 <= w, `${vw}px ${d.t}: 제목이 말줄임 없이 들어간다`);
    }
  }
  assert.ok(inner(1440, 0) >= 180 && inner(1440, 17) >= 180, '1440px 에서 숫자 20px');
});
