// HUD 표지·HUD 요약·상세 카드를 반투명 유리로 바꿔도 글자가 읽히는지 확인한다.
// 가장 밝은 지도와 가장 어두운 지도 위에서 모두 본문·보조·상태 글자의 대비가 4.5:1 이상이어야 한다.
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
function themeRamp(theme) {
  const m = new RegExp(`${theme}:\\s*\\{[\\s\\S]*?ramp: \\[([^\\]]*)\\]`).exec(app);
  assert.ok(m, `THEMES.${theme}.ramp 를 찾을 수 없음`);
  return [...m[1].matchAll(/#[0-9A-Fa-f]{6}/g)].map((x) => x[0]);
}
function themeBg(theme) { return new RegExp(`${theme}:\\s*\\{[^\\n]*bg: '(#[0-9A-Fa-f]{6})'`).exec(app)[1]; }
function themeColors(theme) {
  const m = new RegExp(`${theme}:\\s*\\{[\\s\\S]*?color: \\{([^}]*)\\}`).exec(app);
  return [...m[1].matchAll(/#[0-9A-Fa-f]{6}/g)].map((x) => x[0]);
}
const byLum = (list) => list.slice().sort((a, b) => lum(hex(a)) - lum(hex(b)));
const COLOR_D = [...(/const COLOR_D = \{([^}]*)\}/.exec(app)[1]).matchAll(/#[0-9A-Fa-f]{6}/g)].map((x) => x[0]);

// 지도에서 가장 밝은/어두운 면. 낮: 흰 바탕 ~ 기존 건물 램프의 가장 진한 색. 밤: 램프의 가장 밝은 색 ~ 밤 바탕.
const DAY = { lightest: '#FFFFFF', darkest: byLum(themeRamp('day'))[0] };
const NIGHT = { lightest: byLum(themeRamp('night')).slice(-1)[0], darkest: themeBg('night') };
const DAY_TEXT = [VARS['--ink'], VARS['--mute'], '#5C6068', '#8A4112', ...COLOR_D];
const NIGHT_TEXT = ['#EEF1F7', '#B9C0CE', '#F0A56B', ...themeColors('night')];

function check(name, textColors, backdrops) {
  const g = glass(name);
  for (const bd of backdrops) for (const tx of textColors) {
    const r = ratio(hex(tx), over(g, hex(bd)));
    assert.ok(r >= 4.5, `${name} 위 ${tx} 글자가 ${bd} 지도 위에서 ${r.toFixed(2)}:1 (4.5:1 필요)`);
  }
}

test('낮: 표지·요약·카드 유리 위 글자 대비가 밝은 지도·어두운 지도 모두에서 4.5:1 이상', () => {
  for (const n of ['--glass-day-tag', '--glass-day-tag-hover', '--glass-day-sum', '--glass-day-card']) check(n, DAY_TEXT, [DAY.lightest, DAY.darkest]);
});

test('밤: 표지·요약·카드 유리 위 글자 대비가 밝은 지도·어두운 지도 모두에서 4.5:1 이상', () => {
  for (const n of ['--glass-night-tag', '--glass-night-tag-hover', '--glass-night-sum', '--glass-night-card']) check(n, NIGHT_TEXT, [NIGHT.lightest, NIGHT.darkest]);
});

test('정말 투명해졌는가: 낮 .70~.88, 밤 .70~.82(옛 값은 .93~.95)', () => {
  for (const n of ['--glass-day-tag', '--glass-day-sum', '--glass-day-card']) { const a = glass(n)[3]; assert.ok(a >= 0.7 && a <= 0.88, `${n} ${a}`); }
  for (const n of ['--glass-night-tag', '--glass-night-sum', '--glass-night-card']) { const a = glass(n)[3]; assert.ok(a >= 0.7 && a <= 0.82, `${n} ${a}`); }
});

test('표지·요약·카드가 유리 변수와 backdrop-filter 를 쓴다(-webkit- 포함)', () => {
  for (const sel of ['.maplibregl-popup-content', '.hudtag', '.hudsum']) {
    const m = new RegExp(`(?:^|\\n)${sel.replace('.', '\\.')}\\{([^}]*)\\}`).exec(css);
    assert.ok(m, `${sel} 규칙을 찾을 수 없음`);
    assert.match(m[1], /var\(--glass-day-(tag|sum|card)\)/, `${sel} 배경이 유리 변수여야 한다`);
    assert.match(m[1], /-webkit-backdrop-filter:var\(--glass-blur\)/);
    assert.match(m[1], /[^-]backdrop-filter:var\(--glass-blur\)/);
  }
  for (const sel of ['.hudtag', '.hudsum', '.maplibregl-popup-content']) {
    assert.match(css, new RegExp(`\\[data-theme=night\\] ${sel.replace('.', '\\.')}\\{[^}]*var\\(--glass-night-`), `밤 ${sel} 도 유리 변수`);
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
  assert.match(m[1], /--glass-night-card/);
});

test('상태 칩과 막대 같은 작은 색 요소는 불투명을 유지한다', () => {
  assert.match(css, /\.pc-chip\.sale\{background:var\(--sale-d\)/);
  assert.match(css, /\.pc-chip\.priv\{background:#ECEAE6/);
  assert.doesNotMatch(css, /\.pc-chip[^{]*\{[^}]*rgba\(/);
});
