'use strict';
/* 사업 창(모달리스 창, 2026-10-19 — 옛 사업 상세 서랍 대체): components/windows/nav.ts 의 순수 판정(링크 가로채기·주소·기록·창 수·자리)과
   lib/board/project-window.ts projectWindow(창 내용 props 하나뿐인 함수 — 종류·허용 목록·관점), 장착·Esc·접근성 규칙을 고정한다.
   핸드오프: docs/product/화면-데이터-활용-모달리스-창-핸드오프.md 5절. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const N = require('../../components/windows/nav.ts');

const click = (o = {}) => ({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...o });
const anchor = (href, o = {}) => ({ href, target: null, download: false, off: false, ...o });
const page = (href = 'https://x.kr/region?sido=11') => ({ href, search: new URL(href).search });

test('가로채기: /projects?id=·?cand=, /citizen/projects?id= 만 — 보조 키·가운데 단추·target·download·data-window="off"·인쇄 보기·다른 출처는 통과', () => {
  const t = (href, ev, a, p) => N.interceptOf(anchor(href, a), click(ev), page(p));
  assert.deepEqual(t('/projects?sido=11&id=PRJ-11350-0096'), { kind: 'id', id: 'PRJ-11350-0096' });
  assert.deepEqual(t('/projects?cand=HUB-1'), { kind: 'cand', id: 'HUB-1' });
  assert.deepEqual(t('/projects?id=A&cand=B'), { kind: 'id', id: 'A' }, 'id 가 먼저');
  assert.deepEqual(t('/citizen/projects?sgg=28245&id=PRJ-28245-0052'), { kind: 'id', id: 'PRJ-28245-0052' });
  assert.deepEqual(t('https://x.kr/projects?id=P1'), { kind: 'id', id: 'P1' }, '같은 출처 절대 주소');
  assert.equal(t('/citizen/projects?cand=X'), null, '일반사용자 화면에는 후보 창이 없다');
  for (const href of ['/projects', '/projects?sido=11', '/citizen/projects?q=계양', '/region?id=P1', '/map?project=P1', '/projects/csv?id=P1']) assert.equal(t(href), null, href);
  assert.equal(t('https://other.kr/projects?id=P1'), null, '다른 출처');
  for (const ev of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) assert.equal(t('/projects?id=P1', ev), null, JSON.stringify(ev));
  for (const a of [{ target: '_blank' }, { download: true }, { off: true }]) assert.equal(t('/projects?id=P1', {}, a), null, JSON.stringify(a));
  assert.equal(t('/projects?id=P1', {}, {}, 'https://x.kr/projects?print=1'), null, '인쇄 보기에는 창이 없다');
  /* 관점 전환 링크는 이동을 지킨다 */
  assert.match(read('components/citizen/PublicDetail.tsx'), /<Link href=\{`\/projects\?id=\$\{encodeURIComponent\(r\.id\)\}`\} data-window="off"/);
});

test('관점: /citizen 은 일반사용자, 그 밖은 정책담당자, 지도는 보기 대상 스위치(html[data-aud])', () => {
  assert.equal(N.viewOf('/citizen/projects', false, 'admin'), 'public');
  assert.equal(N.viewOf('/citizen/schedule', false, null), 'public');
  for (const p of ['/', '/projects', '/region', '/month/2026-11', '/agency/gh']) assert.equal(N.viewOf(p, false, 'public'), 'admin', p);
  assert.equal(N.viewOf('/map', true, 'public'), 'public');
  assert.equal(N.viewOf('/map', true, 'admin'), 'admin');
  assert.equal(N.viewOf('/map', true, null), 'admin');
});

test('주소: 지금 경로·쿼리를 두고 id·cand 만 바꾼다(둘이 함께 남지 않음) · 지금 주소의 대상', () => {
  assert.equal(N.hrefWith('/region', '?sido=11&m=2026-11', { kind: 'id', id: 'P1' }), '/region?sido=11&m=2026-11&id=P1');
  assert.equal(N.hrefWith('/projects', '?sido=11&id=P1', { kind: 'cand', id: 'C1' }), '/projects?sido=11&cand=C1');
  assert.equal(N.hrefWith('/projects', '?cand=C1&status=check', { kind: 'id', id: 'P2' }), '/projects?status=check&id=P2');
  assert.equal(N.hrefWith('/projects', '?sido=11&id=P1', null), '/projects?sido=11');
  assert.equal(N.hrefWith('/projects', '?id=P1', null, '#projects-list'), '/projects#projects-list');
  assert.deepEqual(N.urlTarget('?sido=11&id=P1'), { kind: 'id', id: 'P1' });
  assert.deepEqual(N.urlTarget('?cand=C1'), { kind: 'cand', id: 'C1' });
  assert.equal(N.urlTarget('?sido=11'), null);
});

test('기록: 0 → 1 만 push, 그 뒤 열기·맨 위 바꾸기 replace, 활성 창 닫기 = 새 맨 위로 replace, 비활성 닫기 = 그대로, 마지막 창 = 쌓았으면 back 아니면 id 를 뺀 replace', () => {
  const A = { kind: 'id', id: 'A' }, B = { kind: 'id', id: 'B' }, C = { kind: 'cand', id: 'C' };
  /* 목록에서 A 열기 → B 열기 → A 다시 누름(맨 위로) → 비활성 B 닫기 → 마지막 A 닫기 */
  let s = N.navStep(null, A, 1, false, true);
  assert.deepEqual(s, { op: 'push', target: A, base: true });
  s = N.navStep(A, B, 2, s.base, true); assert.deepEqual(s, { op: 'replace', target: B, base: true });
  s = N.navStep(B, A, 2, s.base, true); assert.deepEqual(s, { op: 'replace', target: A, base: true }, '이미 열린 사업 다시 누름 = 맨 위로(replace)');
  s = N.navStep(A, A, 1, s.base, true); assert.deepEqual(s, { op: 'none', target: A, base: true }, '비활성 창 닫기는 주소 그대로');
  s = N.navStep(A, null, 0, s.base, true); assert.deepEqual(s, { op: 'back', target: null, base: false }, '쌓은 기록만큼 뒤로');
  /* 활성 창을 닫으면 다음 맨 위 창(후보는 cand)으로 */
  assert.deepEqual(N.navStep(B, C, 1, true, true), { op: 'replace', target: C, base: true });
  /* 주소로 바로 연 창(기준 기록 없음)을 닫으면 id 를 뺀다 */
  assert.deepEqual(N.navStep(A, null, 0, false, true), { op: 'replace', target: null, base: false });
  /* 사업 창은 다 닫혔는데 목록 창이 남으면 back 하지 않는다(뒤로 가면 남은 창까지 닫힌다) */
  assert.deepEqual(N.navStep(A, null, 1, true, true), { op: 'replace', target: null, base: false });
  /* 사용자 조작이 아니면 주소만 맞춘다: 옛 id → 대표 id, 거르기 링크로 빠진 id 다시 적기, 첫 창(주소 그대로) */
  assert.deepEqual(N.navStep({ kind: 'id', id: 'OLD' }, A, 1, false, false), { op: 'replace', target: A, base: false });
  assert.deepEqual(N.navStep(null, A, 1, false, false), { op: 'replace', target: A, base: false });
  assert.deepEqual(N.navStep(A, A, 1, false, false), { op: 'none', target: A, base: false });
  assert.deepEqual(N.navStep(null, null, 0, true, false), { op: 'none', target: null, base: false }, '뒤로가기로 다 닫히면 기준 기록도 없다');
});

test('뒤로가기(popstate): 주소에 대상이 없으면 모두 닫기, 있으면 그 창을 맨 위로(옛 id 로 연 창도), 없으면 연다', () => {
  const list = [{ key: 'id:A', asked: 'id:A' }, { key: 'id:NEW', asked: 'id:OLD' }];
  assert.deepEqual(N.popAction(null, list), { act: 'closeAll' });
  assert.deepEqual(N.popAction({ kind: 'id', id: 'A' }, list), { act: 'raise', key: 'id:A' });
  assert.deepEqual(N.popAction({ kind: 'id', id: 'OLD' }, list), { act: 'raise', key: 'id:NEW' });
  assert.deepEqual(N.popAction({ kind: 'cand', id: 'A' }, list), { act: 'open', target: { kind: 'cand', id: 'A' } }, '후보와 상세는 다른 창');
});

test('창 수: 정책담당자 3(넘치면 가장 오래된 창부터 닫음) · 일반사용자 1(내용 교체) · 같은 사업 다시 누름 = 새로 열지 않고 맨 위로 · 목록 창도 센다', () => {
  assert.equal(N.ADMIN_MAX, 3); assert.equal(N.PUBLIC_MAX, 1);
  const w = (key) => ({ key });
  let L = [];
  for (const k of ['id:A', 'id:B', 'list:주의', 'id:C']) L = N.place(L, w(k), N.ADMIN_MAX);
  assert.deepEqual(L.map((x) => x.key), ['id:B', 'list:주의', 'id:C'], '가장 오래된 A 가 닫힘');
  L = N.place(L, w('id:B'), N.ADMIN_MAX);
  assert.deepEqual(L.map((x) => x.key), ['list:주의', 'id:C', 'id:B'], '다시 누름 = 맨 위로(중복 없음)');
  let P = N.place([], w('id:A'), N.PUBLIC_MAX);
  P = N.place(P, w('id:B'), N.PUBLIC_MAX);
  assert.deepEqual(P.map((x) => x.key), ['id:B']);
  /* 일반사용자·900px 이하는 1개(창 관리자 maxOf) */
  assert.match(read('components/windows/WindowHost.tsx'), /const maxOf = \(v: View\) => \(v === 'public' \|\| isMobile\(\) \? PUBLIC_MAX : ADMIN_MAX\);/);
});

test('창 자리·크기: 기본 800 · 400 ~ 화면 60% · 높이 160 ~ 화면 − 96 · 새 창은 앞 창에서 24 어긋나게 · 화면 밖으로 나가지 않음', () => {
  const vp = { w: 1440, h: 900 };
  assert.deepEqual(N.nextBox({ x: 320, y: 282, w: 800 }, vp), { x: 344, y: 306, w: 800 }, '끌어 옮긴 창 다음 창 = 그 창에서 오른쪽 아래 24');
  assert.deepEqual(N.nextBox({ x: 880, y: 840, w: 800 }, vp), { x: 640, y: 900 - 52, w: 800 }, '화면 밖이면 clampBox 로 되돌림');
  assert.deepEqual([0, 24, 48].map(N.nextOff), [24, 48, 0], '끌기 전 창끼리 24 씩 어긋남(창 수 한도 3 을 넘기면 0)');
  assert.equal(N.clampW(300, 1440), 400); assert.equal(N.clampW(2000, 1440), 864); assert.equal(N.clampW(2000, 1000), 600);
  assert.equal(N.clampH(2000, 900), 804); assert.equal(N.clampH(50, 900), 160);
  assert.deepEqual(N.clampBox({ x: -50, y: 10, w: 560 }, vp), { x: 0, y: 10, w: 560 }, '왼쪽·위(위 한계 0 — 상단 메뉴 위 층이라 겹쳐도 된다)');
  assert.equal(N.clampBox({ x: 0, y: -30, w: 560 }, vp).y, 0);
  assert.deepEqual(N.clampBox({ x: 1300, y: 2000, w: 560 }, vp), { x: 880, y: 900 - 52, w: 560 }, '오른쪽·아래(머리 줄은 남김)');
  assert.deepEqual(N.clampBox({ x: 600, y: 100, w: 864 }, { w: 1000, h: 800 }), { x: 400, y: 100, w: 600 }, '화면이 줄면 폭도 60% 로');
  const fw = read('components/windows/FloatingWindow.tsx');
  assert.match(fw, /max-h-\[calc\(100dvh-96px\)\]/, '높이는 내용(최대 화면 − 96, 안쪽 스크롤)');
  assert.match(fw, /window\.addEventListener\('resize', onResize\)/, '화면 크기가 바뀌면 되돌린다');
  assert.match(fw, /top-1\/2 left-1\/2 mt-\(--win-off\) ml-\(--win-off\) -translate-x-1\/2 -translate-y-1\/2/, '끌기 전 창 = CSS 정중앙 + 두 번째 창부터 어긋남');
  assert.doesNotMatch(fw, /top-20 right-4|useLayoutEffect|centerBox/, '옛 오른쪽 위 첫 자리·측정 배치 없음');
  assert.match(fw, /mobile:m-0 mobile:translate-none/, '모바일 전면 시트는 정중앙을 되돌림');
});

test("같은 단계 링크: 지금 그 목록 화면이면 지금 거르기를 두고 stage 만(창 주소·인쇄·지도에서 옴은 뺀다), 다른 화면이면 목록?stage=", () => {
  assert.equal(N.sameStageHref('/projects', '?sido=11&id=P1&from=map', '/projects', '2'), '/projects?sido=11&stage=2');
  assert.equal(N.sameStageHref('/projects', '?stage=1&cand=C', '/projects', '3'), '/projects?stage=3');
  assert.equal(N.sameStageHref('/region', '?sido=11&id=P1', '/projects', '2'), '/projects?stage=2');
  assert.equal(N.sameStageHref('/citizen/projects', '?sgg=28245&q=a&id=P1', '/citizen/projects', 'build'), '/citizen/projects?sgg=28245&q=a&stage=build');
  assert.equal(N.sameStageHref('/citizen/schedule', '?sido=28', '/citizen/projects', 'prep'), '/citizen/projects?stage=prep');
});

test('창 관리자: 캡처 단계 click 하나·keydown 하나(Esc 순서 ⓘ → 칩 메뉴 → 맨 위 창), 창마다 role=dialog aria-modal=false·고유 id, 열면 제목 초점, 인쇄·움직임 줄이기', () => {
  const host = read('components/windows/WindowHost.tsx'), fw = read('components/windows/FloatingWindow.tsx');
  assert.match(host, /window\.addEventListener\('click', onClick, true\)/, '캡처 단계 위임');
  assert.match(host, /e\.preventDefault\(\);\s*e\.stopPropagation\(\);/, 'Next <Link> 이동을 막는다');
  assert.equal((host.match(/addEventListener\('keydown'/g) || []).length, 1);
  assert.doesNotMatch(fw, /addEventListener\('keydown'|onKeyDown/, '창마다 keydown 리스너를 달지 않는다');
  const esc = host.slice(host.indexOf("if (e.key !== 'Escape'"), host.indexOf("window.addEventListener('keydown'"));
  assert.ok(esc.indexOf('[data-popup-open]') < esc.indexOf('details[open]:not([data-fold])') && esc.indexOf('details[open]:not([data-fold])') < esc.indexOf('close(ref.current[ref.current.length - 1].key)'), 'ⓘ → 칩 메뉴 → 맨 위 창');
  assert.match(fw, /role="dialog" aria-modal="false" aria-labelledby=\{titleId\}/);
  assert.match(fw, /const titleId = useId\(\);/);
  const pd = read('components/citizen/PublicDetail.tsx');
  assert.doesNotMatch(pd, /"pd-sched"/, '창 안 고정 id 없음');
  assert.match(pd, /const sid = useId\(\);/);
  assert.match(fw, /titleRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(fw, /print:hidden/);
  assert.match(fw, /q-rise/, '등장은 조용한 등장(움직임 줄이기면 globals 의 no-preference 안이라 없음)');
  assert.match(fw, /mobile:inset-x-0 mobile:top-12 mobile:bottom-0/, '900px 이하 = 옛 서랍 모바일 모양(전면)');
  assert.match(fw, /!active && 'mobile:hidden'/, '900px 이하는 맨 위 창 하나만');
  assert.match(fw, /rounded-card border border-border bg-popover text-popover-foreground shadow-pop/, '면 --popover · 그림자 --shadow-pop · 카드 반경');
  /* 장착: 대시보드 레이아웃에 하나, 지도 레이아웃에도 하나(2026-10-20 W2, 시험 tests/js/map-windows.test.cjs) */
  assert.match(read('app/(dashboard)/layout.tsx'), /<WindowHost>\s*<main id="main"/);
  assert.match(read('app/(map)/layout.tsx'), /<WindowHost>[\s\S]*<\/WindowHost>/);
  assert.ok(!fs.existsSync(path.join(ROOT, 'components/projects/Drawer.tsx')), '옛 서랍은 지웠다');
  /* 다른 화면의 사업 링크(/month·/agency·/region·/citizen/schedule)는 링크 그대로 — 가로채기로 창이 된다 */
  assert.match(read('lib/board/region.ts'), /\/projects\?/);
});

test('목록 선택 표시: 장착 뒤에는 창에 열린 사업 행(서버가 다시 그리지 않아도), 장착 전은 서버 sel 그대로', () => {
  const g = read('components/ui/data-grid.tsx');
  assert.match(g, /const selOf = \(r: Row\) => \(openIds && r\.href \? openIds\.has\(r\.id\) : !!r\.sel\);/);
  assert.match(g, /if \(a\) \{ a\.click\(\); return; \}/, '행 누름 = 행 안의 같은 주소 링크(창 가로채기 포함)');
  assert.match(read('components/windows/RowLink.tsx'), /aria-current=\{\(open \? open\.has\(pid\) : on\) \? 'true' : undefined\}/);
  assert.match(read('app/(dashboard)/citizen/projects/page.tsx'), /has-\[a\[aria-current\]\]:bg-accent!/);
});

/* ---------- projectWindow: 실제 lib/board/project-window.ts + projects-index.ts 를 CJS 로 옮겨 부른다(화면 자료 getBoardData 만 번들 JSON 으로 바꿈 — 환경변수 없을 때와 같은 자료) ---------- */
const REG = require('../../registry/projects.json').projects;
const MOLIT = require('../../data/board/molit.json');
const MAP = require('../../data/board/ledger-map.json');
const DET = require('../../data/board/project-detail.json');
function loadTs(rel, stubs) {
  const done = new Map();
  const resolve = (req, dir) => {
    const base = req.startsWith('@/') ? path.join(ROOT, req.slice(2)) : req.startsWith('.') ? path.resolve(dir, req) : null;
    if (!base) return null;
    for (const f of [base, `${base}.ts`, `${base}.tsx`]) if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
    return base;
  };
  const load = (file) => {
    if (done.has(file)) return done.get(file).exports;
    const m = new Module(file, module);
    m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
    done.set(file, m);
    m.require = (req) => {
      const abs = resolve(req, path.dirname(file));
      if (abs && stubs[path.relative(ROOT, abs)]) return stubs[path.relative(ROOT, abs)];
      if (abs && /\.tsx?$/.test(abs)) return load(abs);
      return require(abs ?? req);
    };
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    m._compile(out, file);
    return m.exports;
  };
  return load(path.join(ROOT, rel));
}
const W = loadTs('lib/board/project-window.ts', {
  'lib/board/data.ts': { getBoardData: async () => ({ allProjects: REG, molit: MOLIT }), SGG: {} },
});
const SECRET = '9999999999999999999999';   // 건축HUB 관리번호 모양(22자리) — 이 사업 행에 심어 응답에 새지 않는지 본다
const A2 = 'PRJ-28245-0052';   // 계양 A2: 번들 단지(블록·동)와 이어진 사업, 법정동 2824511000
const rowA2 = Object.values(MAP.bySgg).flat().find((r) => r.id === A2);
rowA2.pks = [SECRET];

test('projectWindow 종류: detail(발급) · 옛 id → 대표 id(canonical) · hidden(목록에서 뺀 사업) · candidate(?cand=) · 없는 id null', async () => {
  const d = await W.projectWindow(A2, 'admin');
  assert.equal(d.kind, 'detail'); assert.equal(d.view, 'admin'); assert.equal(d.canonical, A2); assert.equal(d.asked, A2);
  assert.equal(d.mapLoc, 'bundle', '지도 위치 판정(mapLocOf)은 서버가 계산해 싣는다');
  assert.equal(d.dataAsOf, MAP.referenceDate);
  assert.equal(d.title, d.label ?? d.row.name);
  const sup = REG.find((p) => p.supersededBy && DET.projects[p.supersededBy]);
  const o = await W.projectWindow(sup.id, 'admin');
  assert.equal(o.kind, 'detail'); assert.equal(o.asked, sup.id); assert.equal(o.canonical, sup.supersededBy); assert.deepEqual(o.from, { id: sup.id, name: sup.name });
  const hid = REG.find((p) => p.hiddenAt && !p.supersededBy);
  const h = await W.projectWindow(hid.id, 'admin');
  assert.equal(h.kind, 'hidden'); assert.equal(h.canonical, hid.id); assert.equal(h.title, hid.name); assert.equal(h.project.hiddenAt, hid.hiddenAt);
  assert.deepEqual(Object.keys(h.project).sort(), ['hiddenAt', 'id', 'name', ...(hid.hiddenReason ? ['hiddenReason'] : [])].sort(), '숨김 사업은 이름·날짜·사유만(법정동·필지 없음)');
  const c = await W.projectWindow(A2, 'admin', { cand: true });
  assert.equal(c.kind, 'candidate'); assert.equal(c.canonical, A2); assert.deepEqual(c.sources, ['건축HUB 주택인허가'], '출처 이름만(관리번호 값 없음)');
  assert.match(c.sggName, /계양구/);
  for (const x of ['PRJ-00000-0000', 'x', 'CAND-28245-0001']) assert.equal(await W.projectWindow(x, 'admin'), null, x);
  assert.equal(await W.projectWindow('NOPE', 'admin', { cand: true }), null);
});

test('projectWindow 허용 목록: 응답에 건축HUB 관리번호(pks)·번들 단지(bundles)·법정동(bjd)·필지가 없고, 출처·기관·정책은 그 사업 것만', async () => {
  const det = DET.projects[A2], reg = REG.find((p) => p.id === A2);
  assert.ok(rowA2.bundles.length && det.bjd.length && reg.pnus.length);
  const banned = [SECRET, ...rowA2.bundles, ...det.bjd, ...reg.pnus, ...rowA2.pnus];
  const keys = (o, out = new Set()) => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { out.add(k); keys(v, out); } return out; };
  for (const [view, opts] of [['admin', {}], ['admin', { cand: true }], ['public', {}]]) {
    const w = await W.projectWindow(A2, view, opts), s = JSON.stringify(w);
    for (const b of banned) assert.ok(!s.includes(b), `${view}${opts.cand ? ' cand' : ''}: ${b}`);
    for (const k of ['pks', 'bundles', 'bjd', 'bjdCodes', 'pnus']) assert.ok(!keys(w).has(k), `${view}: 열쇠 ${k}`);
    if (w.row) assert.deepEqual(Object.keys(w.row).filter((k) => !['id', 'name', 'issued', 'stage', 'cls', 'why', 'overdue', 'next', 'done', 'units', 'dateAlt', 'sgg', 'sggName', 'notice', 'programs', 'policies', 'link', 'agency', 'reached', 'completion', 'board'].includes(k)), [], `${view}: 행은 허용 목록 칸만`);
  }
  const d = await W.projectWindow(A2, 'admin');
  assert.deepEqual(Object.keys(d.sources), det.refs.filter((r) => DET.sources[r]), '출처는 그 사업 refs 만');
  assert.ok(Object.keys(d.agencies).length <= 1 && d.policies.every((p) => d.row.policies.includes(p.key)));
  /* 페이지가 넘기는 첫 창 props 도 이 함수 결과만 */
  assert.match(read('app/(dashboard)/projects/page.tsx'), /<WindowSeed win=\{win\}/);
  assert.match(read('app/(dashboard)/citizen/projects/page.tsx'), /const sel = win \? \{ \.\.\.win, title: /);
  assert.doesNotMatch(read('app/(dashboard)/citizen/projects/page.tsx'), /<PublicDetail|getProjectDrawer\(id\) : null\]/, '페이지가 상세 자료를 직접 넘기지 않는다');
});

test('projectWindow 일반사용자: 수도권 발급 사업만(목록에서 뺀 사업·후보·수도권 밖 숨김은 null) · 머리 글자·링크는 서버가 만든다', async () => {
  const p = await W.projectWindow(A2, 'public', { today: '2026-10-19' });
  assert.equal(p.view, 'public'); assert.equal(p.kind, 'detail'); assert.equal(p.today, '2026-10-19');
  assert.equal(p.head.area, '인천 계양구'); assert.equal(p.links.map, `/map?project=${A2}`); assert.match(p.links.schedule, /^\/citizen\/schedule\?sido=28&sgg=28245$/);
  assert.equal(p.sameStage, 'build');
  assert.equal(p.detail.refs.length, DET.projects[A2].refs.length); assert.equal(p.detail.stages, undefined, '일반사용자 창은 출처 refs 만');
  const far = REG.find((p) => p.hiddenAt && !p.supersededBy && !/^(11|28|41)/.test(p.sgg));
  assert.equal(await W.projectWindow(far.id, 'public'), null, '수도권 밖(숨김)');
  assert.equal(await W.projectWindow(REG.find((x) => x.hiddenAt && !x.supersededBy).id, 'public'), null, '목록에서 뺀 사업');
  assert.match(read('lib/board/project-window.ts'), /if \(d\.kind !== 'detail' \|\| !isMetro\(d\.row\.sgg\)\) return null;/);
  /* 상세 API: 없는 id 404, view=public|admin, cand=1 */
  const api = read('app/api/v1/project/[id]/route.ts');
  assert.match(api, /status: 404/); assert.match(api, /q\.get\('view'\) === 'public' \? 'public' : 'admin'/); assert.match(api, /cand: q\.get\('cand'\) === '1'/);
  assert.match(api, /s-maxage=86400/);
});

test('흐린 배경 막: 창이 있으면 한 장 · 클릭을 막지 않음 · 토큰 · 쌓임 순서 상단 메뉴(40) < 막(50) < 창(60) < ⓘ 팝오버(70)', () => {
  const host = read('components/windows/WindowHost.tsx'), fw = read('components/windows/FloatingWindow.tsx');
  assert.match(host, /\{wins\.length \? <Scrim \/> : null\}/);
  const scrim = host.slice(host.indexOf('function Scrim()'), host.indexOf('function UrlWatch'));
  for (const c of ['pointer-events-none', 'fixed inset-0', 'z-50', 'bg-(--win-scrim)', 'backdrop-blur-(--win-blur)', 'print:hidden', 'motion-reduce:transition-none', 'aria-hidden="true"']) assert.ok(scrim.includes(c), c);
  assert.doesNotMatch(host, /inert|aria-modal="true"|overflow-hidden.*body/);
  assert.match(fw, /aria-modal="false"/);
  const z = (src, re) => +re.exec(src)[1];
  const top = z(read('components/TopNav.tsx'), /sticky top-0 z-(\d+)/), sc = z(scrim, /z-(\d+)/), win = z(fw, /fixed z-(\d+)/), tip = z(read('components/ui/info-tip.tsx'), /className="z-(\d+)"/);
  assert.ok(top < sc && sc < win && win < tip, `${top} < ${sc} < ${win} < ${tip}`);
});
