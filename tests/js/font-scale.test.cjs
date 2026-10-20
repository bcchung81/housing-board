'use strict';
// 앱 화면(app·components)의 글꼴·글자 크기 체계(2026-10-17 사용자 결정): 글꼴은 Noto Sans KR 하나(Do Hyeon 폐지, 로컬 파일, 외부 글꼴 요청 없음),
// 크기는 8단계(12·14·16·18·20·24·30·38px), 굵기는 400·700 두 가지, 정책담당자 본문·표 14px · 일반사용자 16px, 서비스 이름은 '주택공급'.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (rel === 'app/api') continue;
    if (e.isDirectory()) walk(rel, out);
    else if (/\.(tsx?|css)$/.test(e.name)) out.push(rel);
  }
  return out;
}
const SRC = [...walk('app'), ...walk('components'), 'lib/grid/spec.ts'];   // lib/grid/spec.ts: 표 밀도 클래스(GRID_DENSE)
const LAYOUTS = ['app/(dashboard)/layout.tsx', 'app/(map)/layout.tsx'];
/* 주석은 검사에서 뺀다(설명 글에는 옛 값을 적어 둘 수 있다) */
const code = (f) => read(f).replace(/(^|\s)\/\*[\s\S]*?\*\//g, '$1').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');
const hits = (re) => SRC.flatMap((f) => code(f).split('\n').map((l, i) => (re.test(l) ? `${f}:${i + 1}: ${l.trim().slice(0, 120)}` : null)).filter(Boolean));

test('(a) 글자 크기 임의 값 text-[Npx] 는 없다(단계 클래스 text-xs~3xl 또는 역할 토큰만, 유동 min()/max() 의 최대값도 단계 값)', () => {
  assert.deepEqual(hits(/text-\[\d+(\.\d+)?px\]/), []);
  const STEPS = new Set(['12', '14', '16', '18', '20', '24', '30', '38']);
  const bad = [];
  for (const f of SRC) for (const m of code(f).matchAll(/text-\[(?:min|max)\([^\]]*\]/g)) for (const n of m[0].matchAll(/(\d+(?:\.\d+)?)px/g)) if (!STEPS.has(n[1])) bad.push(`${f}: ${m[0]}`);
  assert.deepEqual(bad, [], '유동 크기의 px 값은 8단계 중 하나');
  assert.deepEqual(hits(/font-size\s*:\s*\d/), [], 'CSS font-size 를 px 로 직접 쓰지 않는다');
});

test('(b) 8단계·역할 토큰이 @theme 에 있고 기본 Tailwind 크기는 지운다, 정책담당자 본문·표 14px · 일반사용자 16px', () => {
  const tw = read('app/globals.css');
  assert.match(tw, /--text-\*: initial;/);
  const want = { xs: 12, sm: 14, base: 16, md: 18, lg: 20, xl: 24, '2xl': 30, '3xl': 38 };
  for (const [k, v] of Object.entries(want)) assert.match(tw, new RegExp(`--text-${k}: ${v}px;\\n  --text-${k}--line-height: [\\d.]+;`), k);
  assert.match(tw, /:root \{\n  --fs-body: 14px;\n  --fs-table: 14px;/, '정책담당자 기본: 본문·표 14px');
  assert.match(tw, /html\[data-aud='public'\] \{\n  --fs-body: 16px;\n  --fs-table: 16px;/, '일반사용자: 본문·표 16px');
  for (const r of ['body', 'table', 'meta', 'legend', 'kpi', 'h1', 'h2']) assert.match(tw, new RegExp(`--text-${r}: var\\(--fs-${r}\\);`), `역할 토큰 ${r}`);
  assert.match(read('app/(dashboard)/layout.tsx'), /<body className=\{`font-sans m-0 min-h-screen text-body /, '본문 크기는 역할 토큰');
});

test('(b2) 역할 토큰 text-body·table·meta·legend·kpi·h1·h2 는 cn() 인자에 쓰지 않는다(tailwind 병합기가 색으로 알고 뒤의 색 클래스와 함께 지운다 — cn 에서는 text-[length:var(--fs-…)])', () => {
  assert.deepEqual(hits(/cn\([^)]*['"` ]text-(body|table|meta|legend|kpi|h1|h2)\b/), []);
});

test('(c) 굵기는 400·700 두 가지: font-medium·font-semibold 등 중간 굵기가 없다', () => {
  assert.deepEqual(hits(/\bfont-(thin|extralight|light|medium|semibold|extrabold|black)\b|font-\[\d{3}\]|font-weight\s*:\s*(?!400|700)\d{3}|\bfontWeight\b/), []);
});

test('(d) 보이는 서비스 이름은 \'주택공급\': 옛 이름은 app·components 에 남지 않는다(자료 값을 바꿔 보이는 한 줄만 legacy-name 표시로 예외)', () => {
  const old = SRC.flatMap((f) => read(f).split('\n').map((l, i) => (l.includes('주택파동') && !/legacy-name/.test(l) ? `${f}:${i + 1}` : null)).filter(Boolean));
  assert.deepEqual(old, []);
  assert.match(read('app/(dashboard)/layout.tsx'), /title: \{ default: '더주택 종합상황판', template: '%s · 더주택' \}/);
  assert.match(read('app/(map)/layout.tsx'), /title: '더주택 지도'/);
  const nav = read('components/TopNav.tsx');
  assert.match(nav, /aria-label="더주택 종합상황판 처음으로"/, '보이는 로고 글자가 접근 이름에 든다');
  assert.match(nav, /viewBox="0 0 202 64" aria-hidden="true"/, '로고 = 원본 lockup 벡터 한 벌(2026-10-19: 열린 문 심벌 + 더 + 주택 윤곽선), 이름은 링크 aria-label');
});

test('(e) 레이아웃 둘은 로컬 Noto Sans KR 을 싣고 Do Hyeon·외부 글꼴 주소는 없다', () => {
  for (const f of LAYOUTS) {
    const s = read(f);
    assert.match(s, /import '@\/assets\/fonts\/noto-sans-kr\/noto-sans-kr\.css';/, f);
    assert.doesNotMatch(s, /doHyeon|do-hyeon|next\/font|fonts\.googleapis|fonts\.gstatic/i, f);
    assert.match(s, /className=\{`font-sans /, f);
  }
  const face = read('assets/fonts/noto-sans-kr/noto-sans-kr.css');
  assert.ok((face.match(/@font-face/g) || []).length >= 100, '글꼴 규칙');
  assert.ok(!/https?:\/\//.test(face.replace(/\/\*[\s\S]*?\*\//g, '')), 'noto-sans-kr.css 안에 외부 주소가 없다');
  assert.deepEqual(hits(/https?:\/\/[^"'\s]*(fonts\.(googleapis|gstatic)|use\.typekit|cdn\.jsdelivr[^"'\s]*font)/i), []);
  const tw = read('app/globals.css');
  assert.match(tw, /--font-sans: 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;/);
  assert.equal(fs.existsSync(path.join(ROOT, 'lib/shell/fonts.ts')), false, 'Do Hyeon 로컬 폰트 로더 파일 제거');
  assert.equal(fs.existsSync(path.join(ROOT, 'assets/fonts/do-hyeon')), false, 'Do Hyeon 글꼴 파일 제거(2026-10-17 사용자 지시)');
});

test('(f) Do Hyeon 참조는 app·components·app/globals.css 에 없다(주석 제외): font-display·--font-display·--font-do-hyeon·\'Do Hyeon\'', () => {
  assert.deepEqual(hits(/Do ?Hyeon|do-hyeon|doHyeon|font-display|--font-display|--font-disp\b/i), []);
});

test('(g) 숫자는 본문 글꼴 굵게(700)·같은 폭 숫자: 숫자용 상수 disp 는 font-bold tabular-nums, 큰 숫자(KPI)에 다른 글꼴이 없다', () => {
  assert.match(read('components/board/styles.ts'), /export const disp = "font-bold tabular-nums";/);
  const kpi = read('components/ui.tsx');
  /* 칸이 좁으면 8단계 안에서 줄어든다(2026-10-18: 유동 cqi 대신 @container 폭 단계 — 옛 15cqi 와 같은 문턱) */
  assert.match(kpi, /<b className="text-sm leading-title font-bold whitespace-nowrap tabular-nums @min-\[107px\]:text-base @min-\[120px\]:text-md @min-\[134px\]:text-lg @min-\[160px\]:text-xl @min-\[200px\]:text-2xl">/);
  assert.deepEqual(hits(/font-(sans|serif|mono)\b[^"'`]*\btext-(2xl|3xl|xl|lg)\b/), [], '큰 글자에 글꼴을 따로 고르지 않는다(글꼴은 하나)');
  assert.deepEqual(hits(/font-mono|font-serif/), []);
});

test('(h) 위계는 크기·굵기로만: 제목(h1·h2·h3)은 700, 로고 글자는 700, 헤더·메뉴는 400', () => {
  const tw = read('app/globals.css');
  assert.match(tw, /h1, h2, h3 \{\n    font-weight: 700;\n  \}/);
  const nav = read('components/TopNav.tsx');
  assert.match(nav, /<svg className="block h-\(--logo-h\) w-auto shrink-0 max-\[599px\]:hidden" viewBox="0 0 202 64" aria-hidden="true">/, '로고 = 원본 lockup 벡터(글자 span 없음, 2026-10-19)');
  assert.doesNotMatch(nav, /--fs-logo|<span[^>]*>주택<\/span>/);
  assert.match(nav, /<header className="[^"]*font-normal /);
  /* 메뉴·모바일 펼침·좁은 화면 어디에도 별도 글꼴이 없다 */
  assert.doesNotMatch(nav, /font-(display|heading|mono|serif)/);
});
