'use strict';
// Tailwind CSS v4 + shadcn/ui 기반(app/tailwind.css, components.json)이 계획대로인지 정적으로 확인한다.
// 겉모습이 그대로인지는 scripts/visual(스크린샷 80장 픽셀 비교)이 본다. 여기서는 그 전제 — preflight 보류·토큰·연결 — 를 지킨다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const css = read('app/tailwind.css');
const pkg = JSON.parse(read('package.json'));

test('preflight(전역 리셋)를 가져오지 않는다: theme·utilities 만 레이어로 가져온다(옛 CSS 가 걷히는 마지막 단계에서 켠다)', () => {
  assert.match(css, /@layer theme, base, components, utilities;/);
  assert.match(css, /@import "tailwindcss\/theme\.css" layer\(theme\);/);
  assert.match(css, /@import "tailwindcss\/utilities\.css" layer\(utilities\);/);
  assert.doesNotMatch(css, /@import "tailwindcss";/, '전체 가져오기는 preflight 를 포함한다');
  assert.doesNotMatch(css, /preflight\.css/);
});

/* tailwind.css 에서 `:root {…}`(라이트)와 `.dark {…}`(다크) 블록의 본문을 꺼낸다 */
const block = (sel) => { const i = css.indexOf(`\n${sel} {`); assert.ok(i >= 0, `${sel} 블록`); return css.slice(i, css.indexOf('\n}\n', i)); };
const token = (b, n) => { const m = new RegExp(`--${n}:\\s*(#[0-9A-Fa-f]{6})`).exec(b); assert.ok(m, `--${n}`); return m[1].toUpperCase(); };

test('다크 토큰이 종합상황판 시안(남색) 팔레트와 같은 값이다', () => {
  /* 시안 팔레트(옛 dash.css 의 :root 변수). 옛 CSS 를 걷어낸 뒤에도 값이 바뀌지 않게 여기에 고정한다. */
  const PALETTE = { bg: '#0A1030', bg2: '#0E1740', pn: '#101A44', pn2: '#16225A', on: '#1B2A66', line: '#22305E', line2: '#3A4C8C', ink: '#E8EDFF', ink2: '#D6DEFA', sub: '#9AA8D6', mute: '#8FA0C8', acc: '#FF8A65', 'acc-ink': '#2A0E04', ok: '#4ADE9E', warn: '#FFC24D', bad: '#FF6B88' };
  const dark = block('.dark');
  const same = { background: 'bg', card: 'pn', secondary: 'pn2', muted: 'bg2', accent: 'on', border: 'line', foreground: 'ink', 'muted-foreground': 'sub', primary: 'acc', 'primary-foreground': 'acc-ink', ring: 'acc', destructive: 'bad', ok: 'ok', warn: 'warn', bad: 'bad', ink2: 'ink2', mute: 'mute', line2: 'line2' };
  for (const [shadcn, ours] of Object.entries(same)) assert.equal(token(dark, shadcn), PALETTE[ours], `--${shadcn} = 시안 --${ours}`);
  assert.equal(token(dark, 'input'), PALETTE.line2);
  assert.match(dark, /color-scheme: dark/);
});

test('라이트가 기본(:root)이고 같은 이름의 토큰을 모두 갖는다. 글자색은 카드·바탕 위에서 4.5:1 이상이다', () => {
  const light = block(':root'), dark = block('.dark');
  const names = (b) => [...b.matchAll(/--([a-z0-9-]+):/g)].map((m) => m[1]).filter((n) => n !== 'radius' && n !== 'page-bg');
  assert.deepEqual(names(light).sort(), names(dark).sort(), '라이트와 다크는 같은 토큰 이름을 정의한다');
  assert.match(light, /color-scheme: light/);
  const lum = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const t = (n) => token(light, n);
  for (const [fg, bg] of [['foreground', 'card'], ['foreground', 'background'], ['muted-foreground', 'card'], ['muted-foreground', 'muted'], ['primary', 'card'], ['primary-foreground', 'primary'], ['ink2', 'card'], ['bad', 'card'], ['ok', 'card']]) {
    assert.ok(ratio(t(fg), t(bg)) >= 4.4, `${fg} 위 ${bg}: ${ratio(t(fg), t(bg)).toFixed(2)}`);
  }
  assert.ok(ratio(t('warn'), t('card')) >= 4.0, 'warn 글자(큰 글씨 위주)');
});

test('두 루트 레이아웃이 tailwind.css 를 가져온다: 대시보드는 라이트 기본(저장된 다크만 그리기 전에 켠다), 지도는 다크 고정', () => {
  for (const f of ['app/(dashboard)/layout.tsx', 'app/(map)/layout.tsx']) assert.match(read(f), /import '\.\.\/tailwind\.css';/, f);
  const dash = read('app/(dashboard)/layout.tsx');
  assert.match(dash, /localStorage\.getItem\('theme'\)==='dark'/);
  assert.doesNotMatch(dash, /className="dark"/, '대시보드는 기본이 라이트다');
  assert.match(read('app/(map)/layout.tsx'), /<html lang="ko" className="dark">/);
  assert.match(read('components/TopNav.tsx'), /localStorage\.setItem\('theme'/);
});

test('Tailwind 는 Turbopack 로더로 연결하고, shadcn 설정(components.json)이 우리 CSS 를 가리킨다', () => {
  assert.match(read('next.config.ts'), /'\*\.css': \{ loaders: \['@tailwindcss\/turbopack'\], as: '\*\.css' \}/);
  const c = JSON.parse(read('components.json'));
  assert.equal(c.tailwind.css, 'app/tailwind.css');
  assert.equal(c.tailwind.config, '', 'Tailwind v4 는 CSS 우선 설정이라 config 파일이 없다');
  assert.equal(c.aliases.ui, '@/components/ui');
  assert.deepEqual(JSON.parse(read('tsconfig.json')).compilerOptions.paths, { '@/*': ['./*'] });
});

test('의존성: 화면이 쓰는 것은 운영 의존성, shadcn CLI·Tailwind 는 개발 의존성(CLI 의 하위 패키지 취약점이 운영 트리에 들어가지 않게)', () => {
  for (const d of ['@base-ui/react', 'class-variance-authority', 'cn', 'lucide-react', 'tw-animate-css']) assert.ok(pkg.dependencies[d], `${d} 는 운영 의존성`);
  for (const d of ['tailwindcss', '@tailwindcss/turbopack', 'shadcn']) assert.ok(pkg.devDependencies[d], `${d} 는 개발 의존성`);
  assert.ok(!pkg.dependencies.shadcn, 'shadcn 은 CSS 한 줄(shadcn/tailwind.css)만 쓴다');
  for (const v of [...Object.values(pkg.dependencies), ...Object.values(pkg.devDependencies)]) assert.match(v, /^\d/, `정확한 버전으로 고정한다: ${v}`);
});
