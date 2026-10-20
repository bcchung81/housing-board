'use strict';
/* 지도 위 사업 창(2026-10-20, 핸드오프 W2): 지도 레이아웃의 창 관리자 장착 · Esc 양보 · 카드·꼬리표가 창을 피함 · 주소 보존 · 지도에서 연 창엔 '지도로 돌아가기' 없음 (소스 읽기) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const layout = read('app/(map)/layout.tsx'), app = read('assets/js/app.js'), host = read('components/windows/WindowHost.tsx'), ov = read('assets/js/overview.js');

test('지도 레이아웃이 창 관리자를 지도 셸·상단 메뉴 위에 장착한다', () => {
  assert.match(layout, /import WindowHost from '@\/components\/windows\/WindowHost'/);
  const a = layout.indexOf('<WindowHost>'), b = layout.indexOf('</WindowHost>');
  assert.ok(a > 0 && b > a);
  const inner = layout.slice(a, b);
  assert.ok(inner.includes('shell-map') && inner.includes('<TopNav compact />') && inner.includes('{children}'));
});

test('창(z-60)은 흐린 막(z-50)·상단 메뉴(z-40)·지도 HUD·시트(z < 60) 위', () => {
  const win = read('components/windows/FloatingWindow.tsx');
  assert.match(win, /fixed z-60/);
  const css = read('assets/css/app.css');
  const zs = [...css.matchAll(/z-index:(\d+)/g)].map((m) => +m[1]).filter((z) => z < 60);
  assert.ok(Math.max(...zs) < 60, '지도 z-index(.ov-scrim 40 · .ov-sheet 55)는 창(60)을 넘지 않는다(.ov-menu 60 은 창과 같은 값이라 DOM 뒤인 창이 위)');
});

test('Esc: 사업 창이 열려 있으면 지도 카드 닫기(app.js)는 양보한다', () => {
  const m = /document\.addEventListener\('keydown', \(e\) => \{\n  if \(e\.key !== 'Escape'[^\n]*/.exec(app);
  assert.ok(m, 'Esc 카드 닫기 핸들러');
  assert.ok(m[0].includes("document.querySelector('section[data-window]')"));
  assert.match(host, /e\.key !== 'Escape' \|\| !ref\.current\.length/);   // 창 관리자는 창이 있을 때만 Esc 를 처리
});

test('카드 자리(fitCard)와 꼬리표 피하기(HUD_EXCL)가 사업 창을 피한다 · 창이 바뀌면 꼬리표를 다시 잡는다', () => {
  const fit = app.slice(app.indexOf('function fitCard()'), app.indexOf('function floorLine'));
  assert.ok(fit.includes("querySelectorAll('section[data-window]')"));
  assert.match(app, /const HUD_EXCL = '[^']*, section\[data-window\]';/);
  assert.match(app, /new MutationObserver\(scheduleHud\)\.observe\(document\.body, \{ childList: true \}\)/);
});

test("지도에서 연 창(경로 /map)에는 '지도로 돌아가기'가 없다 — fromMap 은 /projects?from=map 첫 화면만", () => {
  assert.match(host, /window\.location\.pathname === '\/projects' && new URLSearchParams\(window\.location\.search\)\.get\('from'\) === 'map'/);
  assert.match(host, /ensureRef\.current\(t, viewNow\(\), a as HTMLElement, true\)/);   // 링크 가로채기는 fromMap 을 넘기지 않는다
  assert.match(host, /fromMap && d\.view === 'admin'/);
});

test('주소: 지도 syncUrl 은 자기 키만 쓰고(id·cand 보존), 개요 replaceState 도 id·cand 를 잇는다', () => {
  const sync = app.slice(app.indexOf('function syncUrl'), app.indexOf('function focusBlock'));
  assert.ok(sync.includes('new URL(location.href)') && !/searchParams\.(delete|set)\('(id|cand)'/.test(sync));
  assert.equal((ov.match(/keepWin\(sidoHref\(/g) || []).length, 2);
  const keep = /const keepWin = [^\n]*/.exec(ov)[0];
  const f = vm.runInNewContext(`(${keep.replace('const keepWin = ', '').replace(/;$/, '')})`, { URLSearchParams, encodeURIComponent });
  assert.equal(f('/map?sido=41', '?sido=11&id=PRJ-1'), '/map?sido=41&id=PRJ-1');
  assert.equal(f('/map', '?cand=a%20b'), '/map?cand=a%20b');
  assert.equal(f('/map?sido=41', '?sido=41'), '/map?sido=41');
});

test('MAP_MODE_INIT: id·cand 는 모드를 바꾸지 않고, 시 코드 개요 넘김(replace)에서도 잇는다', () => {
  const { MAP_MODE_INIT } = require('../../lib/board/metro-overview.ts');
  const run = (search) => { const attrs = {}; let to = null;
    vm.runInNewContext(MAP_MODE_INIT, { URLSearchParams, location: { search, replace: (u) => { to = u; } }, document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } } });
    return { mode: attrs['data-map-mode'], to }; };
  assert.equal(run('?id=PRJ-1').mode, 'overview');
  assert.equal(run('?project=P1&id=PRJ-1').mode, 'detail');
  const r = run('?sgg=41280&id=PRJ-41280-1');
  assert.match(r.to, /^\/map\?sido=41&pick=41280&id=PRJ-41280-1$/);
});
