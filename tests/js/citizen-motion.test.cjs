'use strict';
/* /citizen 움직임(2026-10-18 impeccable animate, 사용자 승인 6번): 시안 빌드 결과의 첫 스크립트에서 순수 함수를 떼어 시험하고, 화면 연결은 원본(template.html) 글로 확인한다.
   ① 공고 접수 기간 띠 비율(시작 전·중·마감 지남·하루짜리·시작일 없음)과 3일 이하 맥동 조건 ② 처음 솟음은 세션당 한 번(저장소가 막혀도 오류 없음)
   ③ 줄임 설정이면 숫자·띠·막대·페이드·시트 펼침이 모두 곧바로 끝 상태(아무것도 움직이지 않음) ④ 움직임이 켜진 경우의 동작 ⑤ 화면 연결·CSS(줄임 설정 규칙 포함) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const TPL = fs.readFileSync(path.join(ROOT, 'tools', 'design', 'public-mock', 'template.html'), 'utf8');
const BUILT = fs.readFileSync(path.join(ROOT, 'docs', 'design', '대국민-모드-시안.html'), 'utf8');
const code = [...BUILT.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((c) => c.includes('function makeSearch'));
const ctx = {}; vm.createContext(ctx);
vm.runInContext(code + '\nObject.assign(this, { noticeSpan, takeRise, swapNum, playGrow, growList, swapHtml, sheetMorph, FX, fxOff });', ctx);
const { noticeSpan, takeRise, swapNum, playGrow, growList, swapHtml, sheetMorph, FX, fxOff } = ctx;
const plain = (v) => JSON.parse(JSON.stringify(v));
const win = (reduce) => ({ matchMedia: () => ({ matches: reduce }), setTimeout: (f) => { f(); return 0; }, getComputedStyle: (e) => ({ flexGrow: e.grow }) });
const fnBody = (name) => { const i = TPL.indexOf(`function ${name}(`); assert.ok(i >= 0, name); return TPL.slice(i, TPL.indexOf('\n}\n', i)); };

test('① 접수 기간 띠: 시작 전 · 접수 중(오늘 위치) · 마감 지남 · 하루짜리 · 시작일 없음', () => {
  const n = (a, b) => ({ applyFrom: a, applyTo: b });
  assert.deepEqual(plain(noticeSpan(n('2026-10-20', '2026-10-30'), '2026-10-18')), { state: 'pre', p: 0, pulse: false });
  assert.deepEqual(plain(noticeSpan(n('2026-10-10', '2026-10-30'), '2026-10-20')), { state: 'open', p: 0.5, pulse: false });
  assert.deepEqual(plain(noticeSpan(n('2026-10-10', '2026-10-20'), '2026-10-10')), { state: 'open', p: 0, pulse: false });   // 시작일 = 오늘: 채움 0, 마디만
  assert.equal(noticeSpan(n('2026-10-10', '2026-10-20'), '2026-10-21').state, 'closed');
  assert.equal(noticeSpan(n('2026-10-10', '2026-10-20'), '2026-10-21').p, 1);
  assert.deepEqual(plain(noticeSpan(n('2026-10-18', '2026-10-18'), '2026-10-18')), { state: 'open', p: 1, pulse: true });   // 하루짜리: 꽉 찬 띠, 오늘 마감
  assert.equal(noticeSpan(n('2026-10-18', '2026-10-18'), '2026-10-17').state, 'pre');
  assert.equal(noticeSpan({ applyTo: '2026-10-30' }, '2026-10-18'), null);   // 시작일을 모르면 띠 없음
  assert.equal(noticeSpan(null, '2026-10-18'), null);
  const p = noticeSpan(n('2026-10-01', '2026-10-31'), '2026-10-11').p; assert.ok(p > 0.33 && p < 0.34 && p <= 1);   // 소수 셋째 자리
});

test('① 맥동 조건: 접수 중이고 마감까지 3일 이하(3·2·1·0일)만, 4일 이상·접수 예정·마감 지남은 정지', () => {
  const at = (left) => noticeSpan({ applyFrom: '2026-10-01', applyTo: `2026-10-${String(18 + left).padStart(2, '0')}` }, '2026-10-18').pulse;
  assert.deepEqual([0, 1, 2, 3, 4, 10].map(at), [true, true, true, true, false, false]);
  assert.equal(noticeSpan({ applyFrom: '2026-10-19', applyTo: '2026-10-20' }, '2026-10-18').pulse, false);
  assert.equal(noticeSpan({ applyFrom: '2026-10-01', applyTo: '2026-10-10' }, '2026-10-18').pulse, false);
  /* 카드 연결: 3일 이하만 .soon(맥동), 예정은 .pre, aria-hidden, 마감 지난 것은 띠 없음, 새 문구 없음 */
  const sb = fnBody('spanBar');
  assert.match(sb, /noticeSpan\(n, TODAY\)/); assert.match(sb, /sp\.state === 'closed'\) return ''/); assert.match(sb, /aria-hidden="true"/);
  assert.match(sb, /sp\.state === 'pre' \? ' pre' : sp\.pulse \? ' soon' : ''/); assert.doesNotMatch(sb.replace(/\/\*[\s\S]*?\*\//g, ''), /[가-힣]/, '새 문구 없음');
  assert.match(TPL, /\.nt-span\.soon::after \{ animation: span-pulse/);
  assert.match(TPL, /\$\{spanBar\(n\)\}<\/a><\/li>/);   // 시트 안 공고 카드도 같은 ntRow
  const css = TPL.match(/\.nt-span \{[^}]*\}/)[0]; assert.doesNotMatch(css, /border|box-shadow/); assert.match(css, /pointer-events: none/);   // 카드 안 카드·테두리·그림자 없음
});

test('② 처음 솟음은 세션당 한 번: 첫 호출만 true · 같은 세션 저장 · 저장소가 던져도 오류 없이 이 페이지에서 한 번 · 주소 ?rise 는 다시', () => {
  const mem = {}, st = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
  const flag = { done: false };
  assert.equal(takeRise(st, flag), true); assert.equal(mem.rise, '1');
  assert.equal(takeRise(st, flag), false);
  assert.equal(takeRise(st, { done: false }), false, '같은 세션의 새 페이지(저장 값 있음)는 솟지 않는다');
  assert.equal(takeRise(st, flag, true), true, '?rise 로 다시');
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } }, f2 = { done: false };
  assert.doesNotThrow(() => takeRise(bad, f2)); const f3 = { done: false };
  assert.equal(takeRise(bad, f3), true); assert.equal(takeRise(bad, f3), false, '저장이 막혀도 같은 페이지에서는 한 번');
  /* 화면 연결: sessionStorage 접근 자체가 던져도 대체 저장소, 새 시도 경로 끝에서 한 번, 거리순 늦춤은 전체 1.2초 안 */
  assert.match(TPL, /const sessionStore = \(\) => \{ try \{ return sessionStorage; \} catch \(_\)/);
  assert.match(TPL, /if \(cap && VIEW\.G && takeRise\(sessionStore\(\), RISE, new URLSearchParams\(location\.search\)\.has\('rise'\)\)\) startRise\(\);/);
  const sr = fnBody('startRise');
  assert.match(sr, /from: \{\}/); assert.match(sr, /origin: org/); assert.match(sr, /VIEW\.homeKey \|\| VIEW\.viewKey/); assert.match(sr, /duration: FX\.rise/);
  assert.equal(FX.rise, 700); assert.equal(FX.riseAll, 1200); assert.ok(FX.riseAll <= 1200);
  assert.match(sr, /msPerPx: \(FX\.riseAll - FX\.rise\) \/ Math\.hypot\(VIEW\.g\.W, VIEW\.g\.H\)/);   // 가장 먼 면(대각선)의 늦춤 = 500ms → 700 + 500 = 1.2초
  /* 진입을 막지 않는다: 고르기·모드 바꾸기는 하던 솟음을 끝 상태로 */
  assert.match(fnBody('pick'), /^function pick\(source, code\) \{\n  finishRise\(\);/); assert.match(fnBody('applyMode'), /finishRise\(\);/);
  assert.match(TPL, /const finishRise = \(\) => \{ if \(VIEW\?\.rising && VIEW\.anim\) VIEW\.anim\.finish\(\); \};/);
  assert.match(fnBody('drawMap'), /const rerise = VIEW\.rising;[\s\S]*if \(rerise\) startRise\(\);/);   // 솟는 중 다시 그려도(글꼴·크기) 이어서
});

test('③ 줄임 설정이면 연출 함수가 곧바로 끝 상태: 아무것도 움직이지 않고 false', () => {
  const R = win(true), calls = [];
  assert.equal(fxOff(R), true); assert.equal(fxOff(win(false)), false); assert.equal(fxOff(null), true);
  const mk = (t) => ({ textContent: t, parentNode: { appendChild: () => calls.push('append') }, cloneNode: () => ({ classList: { add() {} }, setAttribute() {}, removeAttribute() {}, animate() { calls.push('ghost'); return {}; } }), animate: () => calls.push('anim') });
  assert.equal(swapNum(mk('3'), mk('4'), R), false);
  const els = [{ grow: 1, style: { flexGrow: '2' } }];
  assert.equal(playGrow(els, [1], 400, R), false); assert.equal(els[0].style.flexGrow, '2', '막대·칸은 새 값 그대로');
  const box = { innerHTML: 'a', _h: 'a', querySelectorAll: () => [{ animate: () => calls.push('fade') }] };
  assert.equal(swapHtml(box, 'b', 'x', R), false); assert.equal(box.innerHTML, 'b', '내용은 바로 바뀐다');
  let ran = 0, started = 0;
  const doc = { startViewTransition: () => { started++; return { finished: Promise.resolve() }; } }, sheet = { classList: { add() {}, remove() {} }, style: {} }, from = { style: {}, id: 'b' };
  assert.equal(sheetMorph(doc, R, from, sheet, () => ran++), false); assert.equal(ran, 1); assert.equal(started, 0); assert.equal(from.style.viewTransitionName, undefined);
  assert.deepEqual(calls, [], '줄임 설정: 애니메이션 호출 0');
  /* 지도 높이 움직임·돌리기·해 재생은 엔진이 같은 설정을 본다(animateHeights → reducedMotion → 즉시 끝 + onEnd) */
  const M3 = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'map3d.js'), 'utf8');
  assert.match(M3, /reducedMotion\(win\)\) \{ end\(\); return hd; \}/);
  assert.match(fnBody('turnTo'), /Map3D\.reducedMotion\(window\)\) \{ endView\(target\); return; \}/);
});

test('③ 줄임 설정 CSS: 맥동·시트 펼침·sheet-in·전환(transition)·View Transition 이 모두 꺼진다 + 라벨 띄우기 전이도 꺼짐', () => {
  const m = TPL.match(/@media \(prefers-reduced-motion: reduce\) \{ \.spin, \.sheet, \.nt-span::after \{ animation: none; \} \* \{ transition-duration: 0s !important; \} (::view-transition-group\(\*\)[^}]*)\} \}/);
  assert.ok(m, '줄임 설정 규칙'); assert.match(m[1], /animation: none !important/);
  const M3CSS = fs.readFileSync(path.join(ROOT, 'assets', 'css', 'map3d.css'), 'utf8');
  assert.match(M3CSS, /prefers-reduced-motion: reduce\) \{ \.map \.lift :is\(\.up, \.up-shd\), \.map \.lbls \.lb-g \{ transition: none; \} \}/);
  /* 켜진 움직임은 모두 transform·opacity·flex-grow(작은 막대) 만, 새 색 리터럴 없음 */
  const mot = TPL.slice(TPL.indexOf('/* 접수 기간 띠'), TPL.indexOf('@keyframes span-pulse')); assert.doesNotMatch(mot, /#[0-9a-fA-F]{3,6}\b|rgba?\(|hsla?\(/);
  assert.match(TPL, /\.sheet\.vt \{ animation: none; \}/);
});

test('④ 움직임이 켜졌을 때: 숫자 교체·칸/막대 미끄러짐·페이드·시트 펼침', () => {
  const W = win(false), log = [];
  const anim = (tag) => (kf, o) => { log.push([tag, o.duration]); return {}; };
  const ghost = { classList: { add() {} }, setAttribute() {}, removeAttribute() {}, animate: anim('out'), remove() {} };
  const newN = { textContent: '4', parentNode: { appendChild: () => log.push(['append']) }, animate: anim('in') };
  assert.equal(swapNum({ textContent: '3', cloneNode: () => ghost }, newN, W), true);
  assert.deepEqual(log.filter((x) => x[0] !== 'append'), [['out', FX.numOut], ['in', FX.num]]); assert.equal(FX.num, 200);
  assert.equal(swapNum({ textContent: '4', cloneNode: () => ghost }, newN, W), false, '같은 값이면 하지 않는다');
  assert.equal(swapNum(null, newN, W), false);
  /* 칸 폭: 옛 값에서 시작해 새 값으로(transition) */
  const els = [{ grow: 0, style: { flexGrow: '0.6', transition: '' }, offsetWidth: 1 }, { grow: 0, style: { flexGrow: '0.4', transition: '' }, offsetWidth: 1 }];
  assert.equal(playGrow(els, [0.2, 0.4], FX.glide, W), true);
  assert.equal(els[0].style.flexGrow, '0.6'); assert.match(els[0].style.transition, /^$|flex-grow 400ms/);   // win.setTimeout 스텁이 곧바로 transition 을 비운다
  assert.equal(playGrow([{ grow: 0, style: { flexGrow: '0.5' }, offsetWidth: 1 }], [0.5], 400, W), false, '값이 같으면 하지 않는다');
  assert.equal(playGrow(els, [], 400, W), false, '처음 그릴 때(옛 값 없음)는 하지 않는다');
  assert.deepEqual(growList([{ grow: '1.5' }, { grow: '0' }], { getComputedStyle: (e) => ({ flexGrow: e.grow }) }), [1.5, 0]);
  assert.equal(FX.glide, 400); assert.ok(FX.fade <= 150 && FX.glideHover < FX.glide);
  /* 페이드: 내용이 바뀔 때만 */
  let fades = 0; const box = { innerHTML: '', querySelectorAll: () => [{ animate: () => fades++ }, { animate: () => fades++ }] };
  assert.equal(swapHtml(box, 'a', 'x', W), false, '첫 그리기는 페이드 없음'); assert.equal(swapHtml(box, 'a', 'x', W), false, '같은 내용'); assert.equal(fades, 0);
  assert.equal(swapHtml(box, 'b', 'x', W), true); assert.equal(fades, 2); assert.equal(FX.fade, 150);
  /* 시트 펼침: 지원하면 callback 안에서 run, 이름 옮김·정리, 입력줄(#q)·지원 안 함이면 그대로 run */
  let ran = 0, cb; const sheet = { classList: { add: (c) => log.push(['cls+', c]), remove: (c) => log.push(['cls-', c]) }, style: {} }, from = { style: {}, id: 'b' };
  const doc = { startViewTransition: (f) => { cb = f; return { finished: Promise.resolve() }; } };
  assert.equal(sheetMorph(doc, W, from, sheet, () => ran++), true); assert.equal(from.style.viewTransitionName, 'sheet-x'); assert.equal(ran, 0);
  cb(); assert.equal(ran, 1); assert.equal(from.style.viewTransitionName, ''); assert.equal(sheet.style.viewTransitionName, 'sheet-x');
  assert.equal(sheetMorph(doc, W, { style: {}, id: 'q' }, sheet, () => ran++), false); assert.equal(ran, 2);
  assert.equal(sheetMorph({}, W, from, sheet, () => ran++), false); assert.equal(ran, 3, '지원하지 않으면 기존 sheet-in');
  const thr = { startViewTransition: () => { throw new Error('x'); } }; assert.equal(sheetMorph(thr, W, from, sheet, () => ran++), false); assert.equal(ran, 4, '던져도 시트는 열린다');
});

test('⑤ 화면 연결: 제목 숫자·6단계 띠·사업/지금 신청 칸·시트 열기가 각 움직임 함수를 부른다(레이아웃 이동 없는 방식)', () => {
  assert.match(fnBody('renderHead'), /swapNum\(oldN, h\.querySelector\('\.n'\), window\)/);
  assert.match(fnBody('paintBand'), /playGrow\(cols, old, pa \? FX\.glideHover : FX\.glide, window\)/, '요약 표 단계 막대가 새 비율로 미끄러진다');
  assert.match(fnBody('paintBand'), /if \(!first\) el\.querySelectorAll\('\.sm-r'\)\.forEach\(\(b, i\) => \{ if \(b\.dataset\.v !== oldV\[i\]\) sweep\(b, window\); \}\);/, '값이 바뀐 단계 줄만 훑음(첫 그리기 제외)');
  assert.match(fnBody('renderHead'), /if \(moved\) sweep\(h, window\);/); assert.match(fnBody('renderHead'), /if \(!first\) sweep\(nn, window\);/);
  assert.match(fnBody('renderCells'), /'\.pj-th, \.evs, \.none', window\);[^\n]*\n  fitPj\(\);/, '사업 표: 바뀐 내용만 150ms 교차 페이드, 그 뒤 칸 높이에 맞게 접기');
  assert.match(fnBody('renderCells'), /swapHtml\(\$\('#c-pj'\)/); assert.match(fnBody('paintApply'), /swapHtml\(el, /);
  assert.match(fnBody('showSheet'), /sheetMorph\(document, window, from, \$\('#sheet'\)/);
  assert.match(TPL, /\.sum-h \.n-ghost \{ position: absolute;/); assert.match(TPL, /::view-transition-group\(sheet-x\)/);
  assert.match(TPL, /\.sum-h \.nw \{ position: relative;/);
  /* 넣지 않는 것: 숫자 굴림·입자·패럴랙스·스크롤 연출·소리 */
  assert.doesNotMatch(TPL, /count-?up|parallax|IntersectionObserver|new Audio|AudioContext|particles/i);
  assert.equal((TPL.match(/startRise\(\)/g) || []).length >= 2, true);
});
