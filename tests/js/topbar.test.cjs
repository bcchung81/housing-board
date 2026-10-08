// 지도 위 컨트롤: 상단은 한 줄(보기 기준·옵션·전체/평면/투어·좌우 돌리기/자동), 우측 상단은 확대·축소·나침반 한 묶음으로 작게.
// 화면에서의 실제 크기·겹침은 별도 헤드리스 Chrome 점검으로 본다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const html = read('index.html'), css = read('assets/css/app.css'), app = read('assets/js/app.js');
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');   // 주석이 선택자에 섞이지 않게
const bodies = (sel) => [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].split(',').map((s) => s.trim()).includes(sel)).map((m) => m[2]);
const topbar = /<div class="tools"[\s\S]*?\n  <\/div>\n  <\/div>/.exec(html);

test('상단 컨트롤은 줄바꿈 없이 한 줄이고, 회전 슬라이더 줄(.dial)은 없다', () => {
  assert.ok(topbar, '.tools 마크업을 찾을 수 없음');
  assert.doesNotMatch(html, /class="dial"|id="dial"|id="dRange"|id="dOut"|id="dNorth"/);
  const b = bodies('.tools').join(';');
  assert.match(b, /display:flex/);
  assert.doesNotMatch(b, /flex-wrap:\s*wrap/);
  assert.match(b, /overflow-x:auto/);                       // 좁은 화면에서는 옆으로 밀어 본다
  assert.doesNotMatch(css, /\.dial\b/);
});

test('지도 위 한 줄에 옵션·전체·평면·투어·◀▶·자동이 이 순서로 모여 있고, 보기 기준(#modeSeg)은 머리 줄에 있다', () => {
  const head = /<header class="mhead" id="mhead">[\s\S]*?<\/header>/.exec(html);
  assert.ok(head && /id="modeSeg"/.test(head[0]), '보기 기준은 머리 줄에 있어야 한다');
  assert.doesNotMatch(topbar[0], /id="modeSeg"/);
  const order = ['id="optBtn"', 'id="vAll"', 'id="vPlane"', 'id="vTour"', 'id="dLeft"', 'id="dRight"', 'id="vOrbit"'];
  let at = -1;
  for (const o of order) { const i = topbar[0].indexOf(o); assert.ok(i > at, `${o} 위치/순서`); at = i; }
  for (const id of ['vAll', 'vPlane', 'vTour', 'dLeft', 'dRight']) assert.match(topbar[0], new RegExp(`id="${id}"[^>]*aria-label="[^"]+"`));   // 글자가 줄어도 이름은 그대로
});

test('좌우 돌리기는 ◀▶ 15° 단추와 길게 누르기로 남아 있다(슬라이더 코드는 없다)', () => {
  assert.match(app, /\[\['#dLeft', -1\], \['#dRight', 1\]\]/);
  assert.match(app, /bearing: map\.getBearing\(\) \+ dir \* 15/);
  assert.doesNotMatch(app, /syncDial|dialDrag|#dRange|#dNorth/);
});

test('우측 상단은 확대·축소·나침반 한 묶음(.rctl)이고, 기본 확대 컨트롤과 큰 나침반은 없다', () => {
  const g = /<div class="rctl"[\s\S]*?<\/div>/.exec(html);
  assert.ok(g, '.rctl 마크업을 찾을 수 없음');
  for (const id of ['zIn', 'zOut', 'compass']) assert.match(g[0], new RegExp(`id="${id}"`));
  assert.doesNotMatch(app, /NavigationControl/);
  assert.match(app, /\$\('#zIn'\)\.addEventListener\('click'/);
  assert.match(app, /\$\('#zOut'\)\.addEventListener\('click'/);
  assert.doesNotMatch(css, /\.compass\b|cp-tick|cp-deg|cp-name/);
  assert.match(app, /HUD_EXCL = '\.topbar, \.rctl,/);        // 단지 표지가 이 묶음을 피한다
  // 나침반은 작게: 묶음 단추 폭 40px 이하, 그림 28px 이하
  const w = /\.rctl button\{[^}]*width:(\d+)px/.exec(css), svg = /\.rctl svg\{[^}]*width:(\d+)px/.exec(css);
  assert.ok(w && +w[1] <= 40, `.rctl button 폭 ${w && w[1]}`);
  assert.ok(svg && +svg[1] <= 28, `.rctl svg 폭 ${svg && svg[1]}`);
});

test('나침반은 방향(도)을 이름표로 알리고, 누르면 북쪽이 위로 온다', () => {
  assert.match(app, /나침반\. 보는 방향 \$\{n\}도, \$\{name\}쪽\. 누르면 북쪽이 위로 오게 합니다/);
  assert.match(app, /\$\('#compass'\)\.addEventListener\('click', \(\) => \{ stopMotion\(\); map\.easeTo\(\{ bearing: 0/);
});

test('옵션 창에는 야간 지도 선택이 없고, 단추 이름표도 야간을 말하지 않는다', () => {
  assert.doesNotMatch(html, /야간|nightChip/);
});

test('요약 카드(#hudSum)는 확대 카드 왼쪽에 붙는 가로형 2열 카드다(세로 240px 카드가 아니다)', () => {
  const b = bodies('.hudsum').join(';');
  assert.match(b, /top:12px/);
  assert.match(b, /display:grid/); assert.match(b, /grid-template-columns:minmax\(0,\d+px\) minmax\(0,\d+px\)/);
  assert.doesNotMatch(b, /width:240px|flex-direction:column/);
  // 오른쪽 위치 = 확대 카드 오른쪽 여백 12 + 확대 카드 폭(단추 36 + 테두리 2) + 간격 8
  const w = +/\.rctl button\{[^}]*width:(\d+)px/.exec(css)[1], right = +/right:(\d+)px/.exec(b)[1], rr = +/\.rctl\{[^}]*right:(\d+)px/.exec(css)[1];
  assert.equal(right, rr + w + 2 + 8, `.hudsum right:${right}px 는 확대 카드 바로 왼쪽이어야 한다`);
  // 상단 바(약 564px)와 가로로 겹치기 쉬운 폭에서는 바 아래로
  assert.match(css, /@media \(min-width:901px\) and \(max-width:1140px\)\{\.hudsum\{top:60px\}\}/);
  assert.match(css, /\.ptoggle,\.hudsum\{display:none!important\}/);   // 모바일은 하단 시트가 대신한다
});

test('요약 카드 내용은 요약본: 왼쪽 지역·합계·막대·번호 범례, 오른쪽 점검 한 줄과 다음 일정(제목·날짜·세대수 줄은 뺀다)', () => {
  const fn = /function syncHudSum\(\) \{[\s\S]*?\n\}\n/.exec(app);
  assert.ok(fn, 'syncHudSum 을 찾을 수 없음');
  for (const c of ['hs-a', 'hs-b', 'hs-region', 'hs-total', 'SUM_COMPACT', 'class="isum"', 'class="next"']) assert.ok(fn[0].includes(c), `${c} 가 있어야 한다`);
  assert.match(fn[0], /classList\.toggle\('solo', !side\)/);               // 점검·다음 일정이 없는 지역은 한 열
  assert.match(css, /\.hudsum\.solo\{grid-template-columns:minmax\(0,\d+px\)\}/);
  assert.doesNotMatch(fn[0], /<h3>/);                                     // '공급 예정'·'다음 일정' 제목 줄이 없다
  assert.match(app, /SUM_COMPACT = grp\.map/);                            // 상태별 번호만(이름·%는 이름표)
  assert.match(app, /sub: `공급 예정 \$\{BLOCKS\.length\}개 단지/);
  assert.match(bodies('.hudsum .isum-t').join(';'), /display:none/);       // 점검 헤드라인 문장은 칩이 대신한다
  assert.match(bodies('.hudsum .next span.s').join(';'), /display:none/);   // 날짜·세대수 보조 줄
  assert.match(app, /slice\(0, 2\)\.map\(\(li\) => li\.outerHTML\)/);   // 다음 일정은 2건
});

test('상세 카드는 가로 요약·확대 카드에 폭을 빼앗기지 않고, 가로로 겹치면 그 아래로 비켜 선다', () => {
  const fn = /function showCard\([\s\S]*?\n\}\n/.exec(app)[0];
  assert.match(fn, /const W = map\.getContainer\(\)\.clientWidth;/);       // 요약 왼쪽 가장자리로 폭을 줄이지 않는다
  assert.doesNotMatch(fn, /hs\.getBoundingClientRect\(\)\.left/);
  assert.match(fn, /for \(const o of \[\$\('#hudSum'\), \$\('\.rctl'\)\]\)/);
  assert.match(fn, /dy = Math\.max\(dy, q2\.bottom \+ 8 - r\.top\)/);
});
