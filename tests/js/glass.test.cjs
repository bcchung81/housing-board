// HUD 표지·요약·범례·하단 바·옵션·툴바·상세 카드를 반투명 유리로 바꿔도 글자가 읽히는지 확인한다.
// 가장 밝은 지도와 가장 어두운 지도 위에서 모두 본문·보조·상태 글자의 대비가 4.5:1 이상이어야 한다(야간 지도는 없다).
// 유리는 투명도(alpha)만이 아니라 뒤 지도를 밝게 누르는 backdrop-filter brightness 도 쓰므로, 시험도 그 효과를 뒤 지도 색에 먼저 곱해 계산한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const css = fs.readFileSync(path.join(ROOT, 'assets/css/app.css'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'assets/js/app.js'), 'utf8');

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const over = (rgba, backdrop) => { const [r, g, b, a] = rgba; return [r, g, b].map((v, i) => v * a + backdrop[i] * (1 - a)); };

function rootVars() {
  const m = css.match(/:root\{([^}]*)\}/);
  assert.ok(m, ':root 블록이 있어야 한다');
  const vars = {};
  for (const [, k, v] of m[1].matchAll(/(--[\w-]+):([^;]+);?/g)) vars[k] = v.trim();
  return vars;
}
const VARS = rootVars();
function glass(name) {
  const m = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(VARS[name] || '');
  assert.ok(m, `${name} 은 rgba(...) 여야 한다: ${VARS[name]}`);
  return [+m[1], +m[2], +m[3], +m[4]];
}
function themeRamp() {
  const m = /const THEME = \{[\s\S]*?ramp: \[([^\]]*)\]/.exec(app);
  assert.ok(m, 'THEME.ramp 를 찾을 수 없음');
  return [...m[1].matchAll(/#[0-9A-Fa-f]{6}/g)].map((x) => x[0]);
}
const byLum = (list) => list.slice().sort((a, b) => lum(hex(a)) - lum(hex(b)));
const COLOR_D = [...(/const COLOR_D = \{([^}]*)\}/.exec(app)[1]).matchAll(/#[0-9A-Fa-f]{6}/g)].map((x) => x[0]);

// 지도에서 가장 밝은/어두운 면: 흰 바탕 ~ 기존 건물 램프의 가장 진한 색.
const DAY = { lightest: '#FFFFFF', darkest: byLum(themeRamp())[0] };
const COLOR_G = [...(/const COLOR_G = \{([^}]*)\}/.exec(app)[1]).matchAll(/#[0-9A-Fa-f]{6}/g)].map((x) => x[0]);   // 유리 위 상태 글자(낮)
const DAY_TEXT = [VARS['--ink'], VARS['--mute'], '#8A4112', '#4F2C78', ...COLOR_G];   // 유리 위 보조 글자는 --mute(#4A4E56)까지만 쓴다(#5C6068 이하는 이 투명도에서 4.5:1 미달)
// 상세 카드(팝업)·옵션 창·범례 펼침은 뒤 지도가 보이도록 더 투명하고 밝기 보정도 약하다. 대신 보조 글자는 더 진한 --mute-card 를 쓴다.
const CARD_DAY_TEXT = [VARS['--ink'], VARS['--mute-card'], '#2B2E34', '#6E2F0D'];   // 팝업 본문·보조·큰 수치 옆 글자·경고. 상태 글자색(COLOR_G)은 HUD 표지 전용이고 팝업의 상태 칩은 불투명 배경이다
const BRIGHT = { day: parseFloat(VARS['--glass-day-bright']), cardDay: parseFloat(VARS['--glass-card-day-bright']) };
const press = (c, k) => c.map((v) => Math.min(255, Math.round(v * k)));   // brightness(k) 가 뒤 지도에 하는 일

function check(name, textColors, backdrops) {
  const card = /-card$/.test(name);
  const g = glass(name), k = card ? BRIGHT.cardDay : BRIGHT.day;
  for (const bd of backdrops) for (const tx of textColors) {
    const r = ratio(hex(tx), over(g, press(hex(bd), k)));
    assert.ok(r >= 4.5, `${name} 위 ${tx} 글자가 ${bd} 지도 위에서 ${r.toFixed(2)}:1 (4.5:1 필요)`);
  }
}

test('낮: 표지·요약 유리 위 글자 대비가 밝은 지도·어두운 지도 모두에서 4.5:1 이상', () => {
  for (const n of ['--glass-day-tag', '--glass-day-tag-hover', '--glass-day-sum']) check(n, DAY_TEXT, [DAY.lightest, DAY.darkest]);
});

test('상세 카드(더 투명) 유리 위 글자 대비가 밝은 지도·어두운 지도 모두에서 4.5:1 이상', () => {
  check('--glass-day-card', CARD_DAY_TEXT, [DAY.lightest, DAY.darkest]);
});

test('야간 지도는 없다: 밤 변수·규칙·테마 스위치가 남아 있지 않다', () => {
  assert.doesNotMatch(css, /night|data-theme/i);
  assert.doesNotMatch(app, /night|nightChip|setTheme|reTheme/i);
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), /night/i);
});

test('정말 투명해졌는가: 표지·요약 .40~.60, 상세 카드는 뒤 지도가 보이게 .30~.45(옛 값은 .84·.76, 그 전에는 .93~.95)', () => {
  for (const n of ['--glass-day-tag', '--glass-day-sum']) { const a = glass(n)[3]; assert.ok(a >= 0.4 && a <= 0.6, `${n} ${a}`); }
  for (const n of ['--glass-day-card']) { const a = glass(n)[3]; assert.ok(a >= 0.3 && a <= 0.45, `${n} ${a}`); }
});

test('뒤 지도를 눌러 주는 밝기: 밝게(>1)이고 과하지 않다', () => {
  assert.ok(BRIGHT.day > 1 && BRIGHT.day <= 1.6, `낮 ${BRIGHT.day}`);
  assert.match(css, /--glass-blur:blur\(\d+px\) brightness\(var\(--glass-day-bright\)\)/);
});

test('상세 카드 필터는 덜 번지고(흐림 2px 이하) 밝기 보정도 약하다(1.0~1.2)', () => {
  assert.ok(BRIGHT.cardDay >= 1.0 && BRIGHT.cardDay <= 1.2, `낮 ${BRIGHT.cardDay}`);
  const m = /--glass-card-blur:blur\(([\d.]+)px\) brightness\(var\(--glass-card-day-bright\)\)/.exec(css);
  assert.ok(m, '--glass-card-blur 정의를 찾을 수 없음');
  assert.ok(+m[1] <= 2, `--glass-card-blur 흐림 ${m[1]}px`);
});

test('표지·요약·카드가 유리 변수와 backdrop-filter 를 쓴다(-webkit- 포함)', () => {
  const CARDS = ['.maplibregl-popup-content', '.optpanel'];   // 뒤 지도가 보이는 카드 필터를 쓰는 선택자
  for (const sel of ['.maplibregl-popup-content', '.hudtag', '.hudsum', '.maplegend', '.timebar', '.tools', '.rctl', '.optpanel']) {
    const m = new RegExp(`(?:^|\\n)${sel.replace('.', '\\.')}\\{([^}]*)\\}`).exec(css);
    assert.ok(m, `${sel} 규칙을 찾을 수 없음`);
    assert.match(m[1], /var\(--glass-day-(tag|sum|card)\)/, `${sel} 배경이 유리 변수여야 한다`);
    const f = CARDS.includes(sel) ? '--glass-card-blur' : '--glass-blur';
    assert.match(m[1], new RegExp(`-webkit-backdrop-filter:var\\(${f}\\)`));
    assert.match(m[1], new RegExp(`[^-]backdrop-filter:var\\(${f}\\)`));
  }
});

test('backdrop-filter 를 못 쓰는 브라우저용 @supports not 대체가 거의 불투명(.94 이상)하다', () => {
  const m = /@supports not \(\(backdrop-filter:blur\(1px\)\) or \(-webkit-backdrop-filter:blur\(1px\)\)\)\{:root\{([^}]*)\}\}/.exec(css);
  assert.ok(m, '@supports not 블록이 있어야 한다');
  for (const [, k, v] of m[1].matchAll(/(--glass-[\w-]+):([^;]+);?/g)) {
    if (/hover/.test(k) && !/rgba/.test(v)) continue;   // #fff 처럼 불투명한 값
    const mm = /rgba\(\d+,\d+,\d+,([\d.]+)\)/.exec(v);
    if (mm) assert.ok(+mm[1] >= 0.94, `${k} 대체값 ${v}`);
  }
  assert.match(m[1], /--glass-day-card/);
});

test('상태 칩과 막대 같은 작은 색 요소는 불투명을 유지한다', () => {
  assert.match(css, /\.pc-chip\.sale\{background:var\(--sale-d\)/);
  assert.match(css, /\.pc-chip\.priv\{background:#ECEAE6/);
  assert.doesNotMatch(css, /\.pc-chip[^{]*\{[^}]*rgba\(/);
});

/* ---------- 주소 이동 입력줄: 어두운 유리 3단(입력 중 > 대기 > 비활성) ---------- */
const DARK = { bright: parseFloat(VARS['--glass-dark-bright']), active: glass('--glass-dark-active'), idle: glass('--glass-dark-idle'), off: glass('--glass-dark-off') };
const darkBg = (g, bd) => over(g, press(hex(bd), DARK.bright));   // 가장 밝은 지도가 뒤에 있을 때가 흰 글자에 가장 불리하다
const blendText = (alpha, bg) => bg.map((v) => 255 * alpha + v * (1 - alpha));   // 반투명 흰 글자(자리표시)가 유리 위에서 실제로 보이는 색

test('어두운 유리: 상태가 투명도로 구별된다(입력 중 .80~.92 > 대기 .55~.70 > 비활성 .40~.55)', () => {
  const [a, i, o] = [DARK.active[3], DARK.idle[3], DARK.off[3]];
  assert.ok(a >= 0.8 && a <= 0.92, `입력 중 ${a}`); assert.ok(i >= 0.55 && i <= 0.7, `대기 ${i}`); assert.ok(o >= 0.4 && o <= 0.55, `비활성 ${o}`);
  assert.ok(a > i && i > o, '입력 중 > 대기 > 비활성 순서로 투명해져야 한다');
  assert.ok(DARK.bright > 0.7 && DARK.bright < 1, `어두운 유리 뒤 지도 밝기 ${DARK.bright}(약하게 눌러 흰 글자 대비를 지킨다)`);
  assert.match(css, /--glass-dark-blur:blur\(\d+px\) brightness\(var\(--glass-dark-bright\)\)/);
});

test('어두운 유리: 입력 중·대기는 밝은 지도·어두운 지도 위에서 흰 글자·보조 글자·자리표시가 4.5:1 이상, 비활성은 3:1 이상', () => {
  const placeholder = Number(/\.cmd-bar input::placeholder\{color:rgba\(255,255,255,([\d.]+)\)/.exec(css)[1]);
  const sub = hex(VARS['--cmd-sub']), tier = hex('#E4E6E9'), white = [255, 255, 255];
  for (const bd of [DAY.lightest, DAY.darkest]) {
    const act = darkBg(DARK.active, bd), sel = over([255, 255, 255, 0.16], act);   // 고른 줄은 흰 막을 한 겹 더 쓴다
    for (const [name, tx, bg] of [['입력 중 흰 글자', white, act], ['입력 중 보조', sub, act], ['입력 중 보조(고른 줄)', sub, sel], ['입력 중 유형 글자(고른 줄)', tier, sel]]) {
      const r = ratio(tx, bg); assert.ok(r >= 4.5, `${name} ${bd} 지도 위 ${r.toFixed(2)}:1`);
    }
    const idle = darkBg(DARK.idle, bd);
    for (const [name, tx] of [['대기 흰 글자', white], ['대기 자리표시', blendText(placeholder, idle)]]) { const r = ratio(tx, idle); assert.ok(r >= 4.5, `${name} ${bd} 지도 위 ${r.toFixed(2)}:1`); }
    const off = darkBg(DARK.off, bd);
    for (const [name, tx] of [['비활성 흰 글자', white], ['비활성 자리표시(이유 문구)', blendText(placeholder, off)]]) { const r = ratio(tx, off); assert.ok(r >= 3, `${name} ${bd} 지도 위 ${r.toFixed(2)}:1 (비활성은 3:1)`); }
  }
});

test('어두운 유리: 입력줄·후보·인식 칩이 상태별 변수와 backdrop-filter 를 쓰고, backdrop-filter 없는 브라우저는 거의 불투명', () => {
  const rule = (sel) => { const m = new RegExp(`(?:^|\\n)${sel.replace(/[.\[\]="]/g, '\\$&')}\\{([^}]*)\\}`).exec(css); assert.ok(m, `${sel} 규칙을 찾을 수 없음`); return m[1]; };
  const g = rule('.cmd-bar,.cmd-res,.cmd-parse');
  assert.match(g, /background:var\(--cmd-bg\)/); assert.match(g, /-webkit-backdrop-filter:var\(--glass-dark-blur\)/); assert.match(g, /[^-]backdrop-filter:var\(--glass-dark-blur\)/);
  assert.match(rule('.cmd'), /--cmd-bg:var\(--glass-dark-idle\)/);
  assert.match(rule('.cmd[data-state="active"],.cmd[data-state="busy"]'), /--cmd-bg:var\(--glass-dark-active\)/);
  assert.match(rule('.cmd[data-state="disabled"]'), /--cmd-bg:var\(--glass-dark-off\)/);
  const fb = /@supports not[^{]*\{\s*:root\{([^}]*)\}\}/.exec(css)[1];
  for (const n of ['--glass-dark-active', '--glass-dark-idle', '--glass-dark-off']) { const m = new RegExp(`${n}:rgba\\(\\d+,\\d+,\\d+,([\\d.]+)\\)`).exec(fb); assert.ok(m && +m[1] >= 0.94, `${n} 대체값`); }
});
