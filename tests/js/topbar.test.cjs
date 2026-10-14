// 지도 위 컨트롤: 왼쪽 위는 자료 켜고 끄기 한 줄(옵션·버스위치·건물 흐리게), 오른쪽 위는 시점 조작 한 묶음(확대·축소·나침반 | 전체·평면·투어 | 좌우 돌리기·자동, 2026-10-13).
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

test('왼쪽 위 한 줄은 옵션·버스위치·건물 흐리게, 시점 조작(전체·평면·투어·돌리기·자동)은 오른쪽 위 묶음에 이 순서로 모여 있고, 보기 기준 단추(층수·공정율·입주 시기)는 없다', () => {
  const head = /<header class="mhead" id="mhead">[\s\S]*?<\/header>/.exec(html);
  assert.ok(head && /id="hudSum"/.test(head[0]), '옛 보기 기준 자리에 공급 요약이 있다');
  assert.doesNotMatch(html + app, /modeSeg|data-mode=|id="timebar"|tRange|tPlay|MODE_SAY|rateH|timeH|dong-ghost|timeMo|blockTimes|moLabel|MO_MAX|monthF|\btm\.mo\b|dongH\(/);   // 지운 이름을 가리키는 식이 남으면 setupCustom 이 멈춰 지도에 배경만 남는다(2026-10-10 실제로 겪음)
  assert.match(app, /let viewMode = window\.GY_INFRA \? 'infra' : 'floors';/);
  assert.match(app, /set\('mode', ''\);/, '옛 주소의 mode= 는 지운다');
  const inOrder = (block, ids) => { let at = -1; for (const id of ids) { const i = block.indexOf(`id="${id}"`); assert.ok(i > at, `${id} 위치/순서`); at = i; } };
  inOrder(topbar[0], ['optBtn', 'busLoad', 'dimBtn']);
  const cam = /<div class="rctl"[\s\S]*?\n  <\/div>/.exec(html)[0];
  inOrder(cam, ['zIn', 'zOut', 'compass', 'vAll', 'vPlane', 'vTour', 'dLeft', 'dRight', 'vOrbit']);
  for (const id of ['vAll', 'vPlane', 'vTour', 'dLeft', 'dRight', 'vOrbit']) assert.doesNotMatch(topbar[0], new RegExp(`id="${id}"`), `${id} 는 왼쪽 줄에 없다`);
  for (const id of ['vAll', 'vPlane', 'vTour', 'dLeft', 'dRight']) assert.match(cam, new RegExp(`id="${id}"[^>]*aria-label="[^"]+"`));   // 글자·그림이 줄어도 이름은 그대로
  assert.match(cam, /id="dLeft"[^>]*><svg viewBox="0 0 24 24" aria-hidden="true">/);   // 돌리기는 글리프(◀▶) 대신 그린 아이콘
  assert.equal((cam.match(/class="rsep"/g) || []).length, 2, '무리 셋을 띠 둘로 나눈다');
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
  assert.match(app, /HUD_EXCL = '\.topbar, \.rctl,[^']*#cmd:not\(\[hidden\]\)/);        // 단지 표지가 이 묶음과 주소 입력줄을 피한다
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

test('공급 요약(#hudSum)은 머리 줄 오른쪽의 2열(합계 한 줄 | 점검 단추)이고, 지도 위에 떠 있지 않다', () => {
  const b = bodies('.hudsum').join(';');
  assert.match(b, /margin-left:auto/); assert.match(b, /display:grid/);
  assert.doesNotMatch(b, /position:absolute|backdrop-filter|box-shadow/, '머리 줄 안이라 떠 있는 유리 카드가 아니다');
  assert.match(css, /@media \(max-width:1100px\)\{\.hudsum \.hs-b\{display:none\}/);
  assert.match(css, /\.ptoggle,\.hudsum\{display:none!important\}/);   // 모바일은 하단 시트가 대신한다
  const isum = bodies('.hudsum .isum').join(';');
  assert.match(isum, /border:0/); assert.match(isum, /background:transparent/); assert.match(isum, /color:var\(--mute\)/);   // 조용한 링크 말씨(상자·채움 없음)
});

test('공급 요약 내용: 합계는 \'n호 · m건\' 한 줄(문장은 title), 상태 막대·범례는 사이드바에만, 오른쪽은 입주 전 점검 단추(2026-10-13)', () => {
  const fn = /function syncHudSum\(\) \{[\s\S]*?\n\}\n/.exec(app);
  assert.ok(fn, 'syncHudSum 을 찾을 수 없음');
  for (const c of ['hs-a', 'hs-b', 'hs-total', 'class="isum"', 'title="${esc(tot.sub)}"', '${tot.n}건']) assert.ok(fn[0].includes(c), `${c} 가 있어야 한다`);
  for (const c of ['hs-region', 'class="next"', 'sbar', 'sleg', 'SUM_COMPACT', '#sumBar']) assert.ok(!fn[0].includes(c), `${c} 는 없어야 한다`);
  assert.match(fn[0], /classList\.toggle\('solo', !side\)/);               // 점검 자료가 없는 지역은 한 열
  assert.match(css, /\.hudsum\.solo\{grid-template-columns:auto\}/);
  assert.doesNotMatch(app, /SUM_COMPACT|HS_ICON/);
  assert.match(app, /sub: `공급 예정 사업 \$\{BLOCKS\.length\}건/);
  assert.match(app, /function infraSumHtml\(\) \{[\s\S]*?<span class="isum-h">입주 전 점검<\/span><span class="isum-go" aria-hidden="true">›<\/span><span class="isum-c">/);
});

test('상세 카드는 늘 보이는 영역 안에 든다: 시점 묶음과 겹치면 가로로 비켜 서고, 위·아래 상자(도구 줄·입력줄·범례 띠·아래 시트) 사이 높이에 맞춰 줄이고(안쪽 스크롤) 밀어 넣는다', () => {
  const fn = /function showCard\([\s\S]*?\n\}\n/.exec(app)[0];
  assert.match(fn, /const W = map\.getContainer\(\)\.clientWidth;/);       // 요약 왼쪽 가장자리로 폭을 줄이지 않는다
  assert.match(fn, /fitCard\(\);/);
  const fit = /function fitCard\(\) \{[\s\S]*?\n\}\n/.exec(app)[0];
  assert.match(app, /const CARD_AVOID = \['\.topbar', '#cmd', '#botbar', '\.maplibregl-ctrl-bottom-right'\];/);
  assert.match(fit, /innerWidth <= 900 \? \['#panel'\]/);
  assert.match(fit, /dx = rc\.left - 8 - r\.right/);
  assert.match(fit, /pc\.style\.maxHeight = /);
  assert.match(bodies('.pc').join(';'), /overflow-y:auto/);
});
