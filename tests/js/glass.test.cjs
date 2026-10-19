// HUD 표지·요약·범례·하단 바·옵션·툴바·상세 카드를 짙은 네이비 유리로 바꿔도 글자가 읽히는지 확인한다(상황판 시안 M3, 어두운 지도).
// 가장 밝은 지도(흰 점: 역·정류장)와 가장 어두운 지도(검정) 위에서 모두 본문·보조·상태 글자의 대비가 4.5:1 이상이어야 한다.
// 유리는 투명도(alpha)와 흐림(blur)만 쓴다. 밝기를 누르는 필터는 쓰지 않으므로 뒤 지도 색을 그대로 깔고 계산한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const css = fs.readFileSync(path.join(ROOT, 'assets/css/app.css'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'assets/js/app.js'), 'utf8');
const { mapVars, mapCss, GLOBALS } = require('./map-tokens.cjs');   // 값은 app/globals.css 에 있고 app.css 는 var() 로 가리킨다(2026-10-18): 별칭을 따라가 실제 값을 읽는다

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const over = (rgba, backdrop) => { const [r, g, b, a] = rgba; return [r, g, b].map((v, i) => v * a + backdrop[i] * (1 - a)); };

const VARS = mapVars({ theme: 'dark' });   // 다크 지도의 html 값(@supports not 안의 대체값은 따로 본다)
function glass(name) {
  const m = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(VARS[name] || '');
  assert.ok(m, `${name} 은 rgba(...) 여야 한다: ${VARS[name]}`);
  return [+m[1], +m[2], +m[3], +m[4]];
}
const { mapTheme } = require('./map-js-theme.cjs');   // 지도 칠하기 색(app.js 가 globals 토큰에서 읽는다, 2026-10-18)
const STATUS = Object.values(mapTheme('dark').color);   // 모집·착공·준공·입주·계획·공공택지 민간(다크 --st-*-ink)

// 지도에서 가장 밝은/어두운 면.
const MAP = { lightest: '#FFFFFF', darkest: '#000000' };
// 유리 위 글자: 본문·보조·경고, 기반시설 보라·노랑, 6단계 색 글자(HUD 표지의 상태 글자).
const TEXT = [VARS['--ink'], VARS['--ink2'], VARS['--mute'], VARS['--warn'], VARS['--edu'], VARS['--power'], ...STATUS];

function check(name, textColors, backdrops) {
  const g = glass(name);
  for (const bd of backdrops) for (const tx of textColors) {
    const r = ratio(hex(tx), over(g, hex(bd)));
    assert.ok(r >= 4.5, `${name} 위 ${tx} 글자가 ${bd} 지도 위에서 ${r.toFixed(2)}:1 (4.5:1 필요)`);
  }
}

test('표지·요약·상세 카드 유리 위 글자 대비가 밝은 지도·어두운 지도 모두에서 4.5:1 이상', () => {
  for (const n of ['--glass-tag', '--glass-tag-hover', '--glass-sum', '--glass-card', '--glass-hud']) check(n, TEXT, [MAP.lightest, MAP.darkest]);
});

/* 2026-10-10 피드백 '상세 카드는 HUD 처럼 투명하게, 안내 띠는 입력줄 아래 투명하게': 단지 상세 카드는 --glass-hud(.86, 대비가 지켜지는 가장 옅은 쪽),
   안내 띠는 본문 글자(--ink)만 쓰므로 더 옅은 --glass-note. Next 지도의 밝은 테마 값도 같은 기준으로 본다 */
test('상세 카드(--glass-hud)는 기존 카드보다 옅고, 안내 띠(--glass-note)는 본문 글자만으로 4.5:1 을 지킨다(두 테마)', () => {
  assert.ok(glass('--glass-hud')[3] < glass('--glass-card')[3], '상세 카드가 다른 카드보다 비친다');
  assert.ok(glass('--glass-note')[3] <= 0.7, `안내 띠 ${glass('--glass-note')[3]}`);
  check('--glass-note', [VARS['--ink']], [MAP.lightest, MAP.darkest]);
  const L = mapVars({ theme: 'light' });
  const rgba = (v) => /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(v).slice(1).map(Number);
  for (const [n, texts] of [['--glass-hud', [L['--ink'], L['--ink2'], L['--mute'], L['--warn']]], ['--glass-note', [L['--ink']]]]) {
    assert.ok(L[n], `밝은 테마 ${n}`);
    for (const bd of [MAP.lightest, MAP.darkest]) for (const tx of texts) { const r = ratio(hex(tx), over(rgba(L[n]), hex(bd))); assert.ok(r >= 4.5, `밝은 테마 ${n} 위 ${tx} ${bd} ${r.toFixed(2)}:1`); }
  }
  assert.ok(rgba(L['--glass-hud'])[3] < rgba(L['--glass-card'])[3], '밝은 테마에서도 상세 카드가 더 비친다');
  assert.match(css, /(?:^|\n)\.maplibregl-popup-content\{[^}]*background:var\(--glass-pop\)/);
});

test('지도 배경은 저장된 테마(html.dark)를 따른다: 다크는 midnight·dark·검정 바탕, 라이트는 V-World 백지도·liberty', () => {
  assert.match(app, /window\.VWORLD_LAYER \|\| 'midnight'/);
  const D = mapTheme('dark'), L = mapTheme('light');
  assert.equal(D.ofm, 'dark'); assert.equal(D.bg.toUpperCase(), '#111111');
  assert.match(app, /let LIGHT_MAP = SHELL && !document\.documentElement\.classList\.contains\('dark'\);/);
  assert.match(app, /THEME = buildTheme\(LIGHT_MAP, tokOf\(getComputedStyle\(document\.documentElement\)\)\);/);
  assert.match(app, /const TH = \(\) => THEME;/);
  assert.deepEqual([L.vw, L.ofm], ['white', 'liberty'], "라이트는 V-World 백지도: 'Base' 는 장소 글자가 그림에 박혀 기울인 지도에서 번지고 벡터 지명과 겹쳤다");
  assert.doesNotMatch(css, /data-theme/i);
  assert.doesNotMatch(app, /nightChip|setTheme|reTheme/i);
});

test('유리는 뒤 지도가 비칠 만큼은 투명하되 글자 대비를 지킬 만큼 짙다(.85~.97)', () => {
  for (const n of ['--glass-tag', '--glass-tag-hover', '--glass-sum', '--glass-card', '--glass-hud']) { const a = glass(n)[3]; assert.ok(a >= 0.85 && a <= 0.97, `${n} ${a}`); }
});

test('필터는 흐림(blur)과 채도만 쓰고 밝기를 누르지 않으며, 상세 카드는 덜 번진다(4px 이하)', () => {
  assert.match(css, /--glass-blur:blur\(\d+px\) saturate\([\d.]+\)/);
  assert.doesNotMatch(css, /brightness\(/);
  const m = /--glass-card-blur:blur\(([\d.]+)px\)/.exec(css);
  assert.ok(m, '--glass-card-blur 정의를 찾을 수 없음');
  assert.ok(+m[1] <= 4, `--glass-card-blur 흐림 ${m[1]}px`);
});

test('표지·요약·카드가 유리 변수와 backdrop-filter 를 쓴다(-webkit- 포함)', () => {
  const CARDS = ['.optpanel'];   // 사업·건물 카드 팝업은 아래 별도 시험(--glass-pop)   // 뒤 지도가 보이는 카드 필터를 쓰는 선택자
  for (const sel of ['.hudtag', '.maplegend', '.tools', '.rctl', '.optpanel']) {   // 공급 요약은 2026-10-10 머리 줄로 옮겨 유리판이 아니고, 입주 시기 재생바는 없앴다
    const m = new RegExp(`(?:^|\\n)${sel.replace('.', '\\.')}\\{([^}]*)\\}`).exec(css);
    assert.ok(m, `${sel} 규칙을 찾을 수 없음`);
    assert.match(m[1], /var\(--glass-(tag|sum|card|hud)\)/, `${sel} 배경이 유리 변수여야 한다`);
    const f = CARDS.includes(sel) ? '--glass-card-blur' : '--glass-blur';
    assert.match(m[1], new RegExp(`-webkit-backdrop-filter:var\\(${f}\\)`));
    assert.match(m[1], new RegExp(`[^-]backdrop-filter:var\\(${f}\\)`));
  }
});

test('backdrop-filter 를 못 쓰는 브라우저용 @supports not 대체가 거의 불투명(.94 이상)하다', () => {
  assert.match(GLOBALS, /@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\) \{/, '@supports not 블록이 있어야 한다(app/globals.css)');
  const F = mapVars({ theme: 'dark', fallback: true });
  for (const k of ['--glass-tag', '--glass-sum', '--glass-card', '--glass-hud', '--glass-pop', '--glass-note', '--glass-cmd-active', '--glass-cmd-idle', '--glass-cmd-off']) {
    const mm = /rgba\(\d+,\d+,\d+,([\d.]+)\)/.exec(F[k]);
    assert.ok(mm && +mm[1] >= 0.94, `${k} 대체값 ${F[k]}`);
  }
});

test('상태 칩과 막대 같은 작은 색 요소는 불투명을 유지한다', () => {
  assert.match(css, /\.pc-chip\.sale\{background:var\(--sale\)/);
  assert.match(mapCss('dark'), /\.pc-chip\.priv\{background:#2E2E2E/);
  assert.doesNotMatch(css, /\.pc-chip[^{]*\{[^}]*rgba\(/);
});

test('칩 안의 글자(--on-c)가 6단계 색 바탕 위에서 4.5:1 이상이다', () => {
  for (const c of STATUS) { const r = ratio(hex(VARS['--on-c']), hex(c)); assert.ok(r >= 4.5, `${c} 바탕 위 --on-c ${r.toFixed(2)}:1`); }
});

test('패널 글자(본문·보조·6단계 색)가 카드 바탕(--pn, --pn2) 위에서 4.5:1 이상이다', () => {
  for (const bg of [VARS['--bg'], VARS['--pn'], VARS['--pn2']]) for (const tx of TEXT) {
    const r = ratio(hex(tx), hex(bg)); assert.ok(r >= 4.5, `${tx} 글자가 ${bg} 바탕에서 ${r.toFixed(2)}:1`);
  }
});

/* ---------- 주소 이동 입력줄: 어두운 유리 3단(입력 중 > 대기 > 비활성) ---------- */
const CMD = { active: glass('--glass-cmd-active'), idle: glass('--glass-cmd-idle'), off: glass('--glass-cmd-off') };

test('입력줄 유리: 상태가 투명도로 구별된다(입력 중 .90~.97 > 대기 .65~.85 > 비활성 .50~.70)', () => {
  const [a, i, o] = [CMD.active[3], CMD.idle[3], CMD.off[3]];
  assert.ok(a >= 0.9 && a <= 0.97, `입력 중 ${a}`); assert.ok(i >= 0.65 && i <= 0.85, `대기 ${i}`); assert.ok(o >= 0.5 && o <= 0.7, `비활성 ${o}`);
  assert.ok(a > i && i > o, '입력 중 > 대기 > 비활성 순서로 투명해져야 한다');
});

test('입력줄 유리: 입력 중·대기는 밝은 지도·어두운 지도 위에서 글자·보조 글자·자리표시가 4.5:1 이상, 비활성은 3:1 이상', () => {
  const text = hex(VARS['--cmd-text']), sub = hex(VARS['--cmd-sub']);   // 자리표시(placeholder)도 --cmd-sub 를 쓴다
  assert.match(css, /\.cmd-bar input::placeholder\{color:var\(--cmd-sub\)/);
  for (const bd of [MAP.lightest, MAP.darkest]) {
    const act = over(CMD.active, hex(bd)), sel = over([232, 237, 255, 0.14], act);   // 고른 줄은 밝은 막을 한 겹 더 쓴다
    for (const [name, tx, bg] of [['입력 중 글자', text, act], ['입력 중 보조', sub, act], ['입력 중 보조(고른 줄)', sub, sel]]) {
      const r = ratio(tx, bg); assert.ok(r >= 4.5, `${name} ${bd} 지도 위 ${r.toFixed(2)}:1`);
    }
    const idle = over(CMD.idle, hex(bd));
    for (const [name, tx] of [['대기 글자', text], ['대기 자리표시', sub]]) { const r = ratio(tx, idle); assert.ok(r >= 4.5, `${name} ${bd} 지도 위 ${r.toFixed(2)}:1`); }
    const off = over(CMD.off, hex(bd));
    for (const [name, tx] of [['비활성 글자', text], ['비활성 자리표시(이유 문구)', sub]]) { const r = ratio(tx, off); assert.ok(r >= 3, `${name} ${bd} 지도 위 ${r.toFixed(2)}:1 (비활성은 3:1)`); }
  }
});

test('입력줄 유리: 입력줄·후보·인식 칩이 상태별 변수와 backdrop-filter 를 쓰고, backdrop-filter 없는 브라우저는 거의 불투명', () => {
  const rule = (sel) => { const m = new RegExp(`(?:^|\\n)${sel.replace(/[.\[\]="]/g, '\\$&')}\\{([^}]*)\\}`).exec(css); assert.ok(m, `${sel} 규칙을 찾을 수 없음`); return m[1]; };
  const g = rule('.cmd-bar,.cmd-res,.cmd-parse');
  assert.match(g, /background:var\(--cmd-bg\)/); assert.match(g, /-webkit-backdrop-filter:var\(--glass-blur\)/); assert.match(g, /[^-]backdrop-filter:var\(--glass-blur\)/);
  assert.match(rule('.cmd'), /--cmd-bg:var\(--glass-cmd-idle\)/);
  assert.match(rule('.cmd[data-state="active"],.cmd[data-state="busy"]'), /--cmd-bg:var\(--glass-cmd-active\)/);
  assert.match(rule('.cmd[data-state="disabled"]'), /--cmd-bg:var\(--glass-cmd-off\)/);
  const fb = mapVars({ theme: 'dark', fallback: true });
  for (const n of ['--glass-cmd-active', '--glass-cmd-idle', '--glass-cmd-off']) { const m = /^rgba\(\d+,\d+,\d+,([\d.]+)\)$/.exec(fb[n]); assert.ok(m && +m[1] >= 0.94, `${n} 대체값`); }
});


test('라이트 지도 HUD 본문·보조·상태 글자는 가장 밝고 어두운 지도 위에서 4.5:1 이상이다', () => {
  const vars = mapVars({ theme: 'light' });   // 두 테마 공통(html[data-map-shell]: 단계색·강조색은 대시보드 토큰)과 라이트 값을 globals 까지 따라간 값
  const text = ['--ink', '--ink2', '--mute', '--warn', '--sale', '--build', '--soon', '--move', '--plan', '--priv', '--edu', '--power'];
  for (const glassName of ['--glass-tag', '--glass-tag-hover', '--glass-sum', '--glass-card']) {
    const g = vars[glassName].match(/[\d.]+/g).map(Number);
    for (const backdrop of ['#FFFFFF', '#000000']) for (const name of text) {
      assert.ok(ratio(hex(vars[name]), over(g, hex(backdrop))) >= 4.5, `${glassName} 위 ${name} 대비`);
    }
  }
});

/* 2026-10-15 '사업·건물 카드를 HUD 처럼 더 투명하게': 카드 전용 유리(--glass-pop .72~.82, 흐림 10~14px)는 근거가 '카드 흐림 4px 이하' 규칙(다른 카드가 뒤 지도를 선명하게 두는 용도)과 달리
   작은 글자판이 뒤 지도에 묻히지 않게 흐림을 키우는 쪽이므로 팝업만 예외다. 옅어진 만큼 카드 안 글자색만 밝게(다크)/진하게(라이트) 하고, 흰·검은 지도 위 최악에도 4.5:1 을 확인한다. */
test('사업·건물 카드(팝업)는 전용 HUD 유리(.72~.82, 흐림 10~14px)를 쓰고 카드 안 글자는 두 테마 모두 최악 4.5:1 이상', () => {
  const pop = /(?:^|\n)\.maplibregl-popup-content\{([^}]*)\}/.exec(css)[1];
  assert.match(pop, /background:var\(--glass-pop\)/);
  assert.match(pop, /-webkit-backdrop-filter:var\(--glass-pop-blur\)/); assert.match(pop, /[^-]backdrop-filter:var\(--glass-pop-blur\)/);
  const b = /--glass-pop-blur:blur\((\d+)px\) saturate\(([\d.]+)\)/.exec(css);
  assert.ok(b && +b[1] >= 10 && +b[1] <= 14 && +b[2] >= 1.1 && +b[2] <= 1.3, '--glass-pop-blur 는 blur 10~14px, saturate 1.1~1.3');
  const D = mapVars({ theme: 'dark', scope: '.maplibregl-popup-content' });   // 카드 안 덮어쓰기(.maplibregl-popup-content 의 --mute 등)까지 겹친 값
  const LC = mapVars({ theme: 'light', scope: '.maplibregl-popup-content' });
  const names = ['--ink', '--ink2', '--mute', '--warn', '--plan', '--permit', '--edu', '--power', '--ok', '--bad'];
  const dark = D, lt = LC;
  const popA = (v) => { const m = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(v || ''); assert.ok(m, '--glass-pop'); return [+m[1], +m[2], +m[3], +m[4]]; };
  const gd = popA(D['--glass-pop']);
  const gl = popA(LC['--glass-pop']);
  for (const g of [gd, gl]) assert.ok(g[3] >= 0.72 && g[3] <= 0.82, `--glass-pop 투명도 ${g[3]}`);
  for (const [th, g, V] of [['다크', gd, dark], ['라이트', gl, lt]]) for (const n of names) {
    assert.match(V[n] || '', /^#[0-9A-Fa-f]{6}$/, `${th} ${n} 값`);
    for (const bd of [MAP.lightest, MAP.darkest]) { const r = ratio(hex(V[n]), over(g, hex(bd))); assert.ok(r >= 4.5, `${th} 카드 ${n} ${V[n]} 이(가) ${bd} 지도 위에서 ${r.toFixed(2)}:1`); }
  }
});
