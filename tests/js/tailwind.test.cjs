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

test('shadcn 토큰이 종합상황판 팔레트(dash.css :root)와 같은 값이다', () => {
  const dash = read('app/(dashboard)/dash.css');
  const dv = (n) => new RegExp(`--${n}:\\s*(#[0-9A-Fa-f]{6})`).exec(dash)[1].toUpperCase();
  const tv = (n) => new RegExp(`--${n}:\\s*(#[0-9A-Fa-f]{6})`).exec(css)[1].toUpperCase();
  const same = { background: 'bg', card: 'pn', secondary: 'pn2', muted: 'bg2', accent: 'on', border: 'line', foreground: 'ink', 'muted-foreground': 'sub', primary: 'acc', 'primary-foreground': 'acc-ink', ring: 'acc', destructive: 'bad', ok: 'ok', warn: 'warn', bad: 'bad', ink2: 'ink2', mute: 'mute', line2: 'line2' };
  for (const [shadcn, ours] of Object.entries(same)) assert.equal(tv(shadcn), dv(ours), `--${shadcn} = dash.css --${ours}`);
  assert.equal(tv('input'), dv('line2'));
  assert.equal(tv('sidebar'), '#0C1438', '레일 배경은 옛 shell.css 의 --r-bg 와 같은 값');
  assert.equal(tv('sidebar-accent'), dv('on'));
});

test('두 루트 레이아웃이 tailwind.css 를 가져오고 <html class="dark"> 다(shadcn 의 dark: 변형을 항상 켠다)', () => {
  for (const f of ['app/(dashboard)/layout.tsx', 'app/(map)/layout.tsx']) {
    assert.match(read(f), /import '\.\.\/tailwind\.css';/, f);
    assert.match(read(f), /<html lang="ko" className="dark">/, f);
  }
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
