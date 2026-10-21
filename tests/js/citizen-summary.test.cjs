'use strict';
/* /citizen 통합 요약 표(2026-10-18 사용자 결정·승인 — A 숫자 표): 왼쪽 카드 머리 = 지역 이름 줄 · 큰 숫자 줄(h1) · 단계 3줄 · 다음 준공 줄, 지도 카드 머리 띠·6단계 띠 없음.
   시안 빌드 결과(docs/design/대국민-모드-시안.html)의 첫 스크립트(순수 함수)를 vm 으로 돌리고, 화면 함수는 원본(template.html) 글을 떼어 필요한 것만 넣어 돌린다. 화면 사진은 찍지 않는다.
   ① 단계 3줄 합 = 큰 숫자 ② 가장 많은 단계 줄(동률이면 앞 단계) ③ D-day(일 · 월만 · 지남) · 30일 안 강조 ④ 위치 칩 = 레일 순위 ⑤ 단계 줄 누름 → 단계 모드 고정 · 다시 누르면 전체
   ⑥ 머리 띠·#sband 없음, h1 하나(요약 표 안) ⑦ 강조 금지 목록 · 훑음(sweep)은 줄임 설정이면 없음 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const TPL = fs.readFileSync(path.join(ROOT, 'tools', 'design', 'public-mock', 'template.html'), 'utf8');
const BUILT = fs.readFileSync(path.join(ROOT, 'docs', 'design', '대국민-모드-시안.html'), 'utf8');
const OPS = fs.readFileSync(path.join(ROOT, 'assets', 'citizen', 'index.html'), 'utf8');
const code = [...BUILT.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((c) => c.includes('function makeSearch'));
const ctx = {}; vm.createContext(ctx);
vm.runInContext(code + '\nObject.assign(this, { D, makeSearch, sumOf, stageSums, topStage, rankPos, nxDday, unitsFor, rankTop, modeOf, headParts, pressMode, MODE_ALL, STAGE6, STAGE_Q, SUPPLY_N, bigNum, sweep, FX, fxOff });', ctx);
const D = ctx.D, IX = ctx.makeSearch(D);
const plain = (v) => JSON.parse(JSON.stringify(v));
const fnBody = (name) => { const i = TPL.indexOf(`function ${name}(`); assert.ok(i >= 0, name); return TPL.slice(i, TPL.indexOf('\n}\n', i) + 2); };
const CSS = TPL.slice(TPL.indexOf('<style>'), TPL.indexOf('</style>'));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => n.toLocaleString('ko-KR');
const unitKey = (c) => (c.startsWith('41') ? c.slice(0, 4) + '0' : IX.regionOf[c]?.parent || c);
const sum = (codes) => ctx.sumOf(D, codes);
/* 화면 함수(원본 글)를 필요한 이름만 넣어 만든다 */
const make = (name, deps) => new Function(...Object.keys(deps), `${fnBody(name)}\nreturn ${name};`)(...Object.values(deps));
const bandHtml = make('bandHtml', { sum, D, areaOf: (c) => IX.regionOf[c], unitKey, bico: () => '', esc, nameOf: (r) => r.label, fmt, stageSums: ctx.stageSums, topStage: ctx.topStage, STAGE6: ctx.STAGE6, STAGE_Q: ctx.STAGE_Q, SUPPLY_N: ctx.SUPPLY_N, bigNum: ctx.bigNum });
const YBL = ['2026년(올해)', '2027년', '2028년', '2029년', '2030년', '2031년 이후', '연도 미정'];
const headHtml = make('headHtml', { sum, nameOf: (r) => r.label, esc, modeOf: ctx.modeOf, D, headParts: ctx.headParts, YBL, fmt });
const rows = (h) => [...h.matchAll(/<button type="button" class="sm-r s(\d)([^"]*)" data-st="\d" data-v="(\d+)"/g)].map((m) => ({ i: +m[1], cls: m[2], v: +m[3] }));
const bigOf = (h) => { const m = h.match(/<span class="n" title="([\d,]+)호">/); return m ? +m[1].replace(/,/g, '') : null; };

test('① 단계 6줄 중 앞 4줄 합 = 큰 숫자(준공·입주는 구분선 아래 큰 숫자 밖): 모든 시도·시군구(그려진 줄의 data-v 합 = h1 의 숫자 = sumOf), 사업이 없는 곳은 줄 대신 이웃 단추와 \'아직 예정된 공공주택이 없어요\'', () => {
  let n = 0, z = 0;
  for (const r of IX.regions) {
    const t = sum(r.codes), b = bandHtml(r, false), h = headHtml(r, ctx.MODE_ALL);
    if (!t.n) { assert.equal(rows(b).length, 0, r.label); assert.match(h, /<h1 class="ui-h1 sum-h zero" id="sum-h">.*아직 예정된 공공주택이 없어요/); z++; continue; }
    const R = rows(b);
    assert.deepEqual(R.map((x) => x.i), [0, 1, 2, 3, 4, 5], r.label);
    assert.equal(R.slice(0, 4).reduce((a, x) => a + x.v, 0), bigOf(h), `${r.label} 앞 4줄 합 = 큰 숫자`);
    assert.ok(b.indexOf('class="sm-sep"') > b.indexOf('class="sm-r s3') && b.indexOf('class="sm-sep"') < b.indexOf('class="sm-r s4'), `${r.label} 구분선은 모집(넷째 줄)과 준공 사이`);
    assert.equal((b.match(/class="sm-sep"/g) || []).length, 1);
    assert.equal(bigOf(h), t.u, r.label);
    /* 막대 폭 = 큰 숫자 대비 비율(앞 넷 합이 1 을 넘지 않는다, 준공·입주는 1 로 자른다) */
    const g = [...b.matchAll(/flex-grow:([\d.]+)/g)].map((m) => +m[1]); assert.ok(g.slice(0, 4).reduce((a, x) => a + x, 0) <= 1.0002 && g.every((x) => x <= 1), r.label);
    n++;
  }
  /* 모드면 큰 숫자 = 그 모드 값, 이름 = 모드 이름(해 모드는 해가 굵게) */
  const nyj = IX.regionOf['41360'];
  const hy = headHtml(nyj, { k: 'y', i: 2 }), hs = headHtml(nyj, { k: 's', i: 2 });
  assert.match(hy, /<span class="sm-k"><b>2028년<\/b> 공급 호수<\/span>/); assert.equal(bigOf(hy), ctx.modeOf(D, nyj.codes, { k: 'y', i: 2 }));
  assert.match(hs, /<span class="sm-k">착공<\/span>/); assert.equal(bigOf(hs), ctx.stageSums(D, nyj.codes)[2]);
  console.log(`  줄 합 = 큰 숫자 ${n}곳 · 사업 없는 곳 ${z}곳`);
});

test('② 가장 많은 단계 줄(1급): 최댓값 줄 하나만 .top, 같으면 앞 단계, 0 은 .z(막대 없이 옅게)', () => {
  assert.equal(ctx.topStage([5, 5, 1]), 0, '동률이면 앞 단계'); assert.equal(ctx.topStage([1, 5, 5]), 1); assert.equal(ctx.topStage([0, 3, 9]), 2);
  assert.equal(ctx.topStage([0, 0, 0]), -1, '모두 0 이면 없음'); assert.equal(ctx.topStage([0, 0, 4]), 2);
  assert.equal(ctx.topStage([1, 2, 3, 4, 9, 9]), 3, '준공·입주는 큰 숫자 밖이라 가장 많은 단계에서 뺀다'); assert.equal(ctx.topStage([0, 0, 0, 0, 9, 9]), -1);
  for (const r of IX.regions) {
    if (!sum(r.codes).n) continue;
    const S = plain(ctx.stageSums(D, r.codes)).slice(0, 4), R = rows(bandHtml(r, false)), top = R.filter((x) => / top/.test(x.cls));
    const want = S.indexOf(Math.max(...S));
    if (Math.max(...S) > 0) { assert.equal(top.length, 1, r.label); assert.equal(top[0].i, want, r.label); }
    R.forEach((x) => assert.equal(/ z/.test(x.cls), x.v === 0, `${r.label} ${x.i} 0 표시`));
  }
  assert.ok(CSS.includes('.sm-r.top .sm-sv { font-weight: 700; }') && /\.sm-b > i \{[^}]*background: var\(--c-ink\); \}/.test(CSS) && !CSS.includes('.sm-r.top .sm-b > i') && /\.sm-b \{[^}]*height: 10px;/.test(CSS), '모든 단계 줄 막대는 진한 단계색(--c-ink) 100%·높이 10px(바탕 대비 3:1 이상), 가장 많은 줄은 숫자만 굵게');
});

test('③ 다음 준공 날짜 칩: 날짜까지면 \'n일 뒤\'(오늘 \'오늘\', 지나면 없음 — 일반사용자 화면은 \'D-\' 를 쓰지 않는다, 2026-10-19), 달까지만이면 칩 대신 \'10월\', 30일 안이면 주색 채운 칩', () => {
  const T = '2026-10-18', d = (w) => plain(ctx.nxDday(w, T));
  assert.deepEqual(d('2026-10-31'), { t: '13일 뒤', n: 13, chip: true, soon: true });
  assert.deepEqual(d('2026-10-18'), { t: '오늘', n: 0, chip: true, soon: true });
  assert.equal(d('2026-11-17').soon, true, '30일째까지 강조'); assert.equal(d('2026-11-18').soon, false, '31일째부터 옅은 칩'); assert.equal(d('2026-11-18').t, '31일 뒤');
  assert.equal(d('2027-02-01').t, '106일 뒤');
  assert.doesNotMatch(fnBody('nxDday'), /D-/, "'D-' 표기 없음");
  assert.equal(ctx.nxDday('2026-10-17', T), null, '지난 날은 칩 없음'); assert.equal(ctx.nxDday('', T), null);
  assert.deepEqual(d('2026-10'), { t: '10월', n: null, chip: false, soon: false }, '달까지만이면 칩 대신 글');
  assert.equal(d('2027-03').t, '2027년 3월'); assert.equal(d('2027').t, '2027년');
  const nx = fnBody('nxHtml');
  assert.match(nx, /dd\.chip \? `<span class="ui-chip sm-dd\$\{dd\.soon \? ' on' : ''\}">\$\{dd\.t\}<\/span>` : `<span class="dm">\$\{esc\(dd\.t\)\}<\/span>`/);
  assert.match(nx, /<a class="nx" href="\/citizen\/projects\?id=\$\{nx\.id\}" data-go="\/citizen\/projects\?id=\$\{nx\.id\}" data-k="\$\{nx\.k\}"/, '누르면 일반사용자 사업 찾기 상세(2026-10-19 D3)');
  assert.ok(CSS.includes('.nx .sm-dd.on { border-color: var(--primary); background: var(--primary); color: var(--primary-foreground); font-weight: 700; }'));
  assert.doesNotMatch(fnBody('renderSum'), /eventsOf|class="nx"/, '왼쪽 카드 맨 아래 옛 다음 준공 줄 없음');
});

test('④ 위치 칩 = 레일 순위: 같은 줄 세움(VIEW.units, 지금 모드 값 큰 순)에서 몇 번째 · 시도 안 면 수 — 레일 rankHtml 의 순위 번호와 같다', () => {
  const rankHtml = make('rankHtml', { rankN: () => 7, rankTop: ctx.rankTop, esc, fmt, zeroWord: () => '진행 사업 없음', curMode: () => ctx.MODE_ALL, ico: () => '' });
  let n = 0;
  for (const sd of ['11', '28', '41']) {
    const units = ctx.unitsFor(D, IX, sd);
    for (const x of units) {
      const p = plain(ctx.rankPos(units, x.key)), h = rankHtml(units, true, x.key, null);
      const m = h.match(new RegExp(`data-area="${x.key}"[^>]*aria-current="true" aria-label="(\\d+)위`));
      assert.ok(m, `${sd} ${x.name} 레일 줄`); assert.equal(p.i, +m[1], `${sd} ${x.name}`); assert.equal(p.n, units.length); n++;
    }
  }
  assert.equal(ctx.rankPos([{ key: 'a' }], 'b'), null);
  /* 화면 연결: 시군구일 때만 칩, 순위는 모드를 새로 세운 뒤 칠한다 */
  assert.match(fnBody('nameHtml'), /key = r\.kind === 'sgg' \? unitKey\(r\.code\) : null, pos = key && VIEW\?\.sd === sd\.code \? rankPos\(VIEW\.units, key\) : null/);
  assert.match(fnBody('nameHtml'), /\$\{fmt\(pos\.n\)\}곳 중 \$\{fmt\(pos\.i\)\}위/);
  const am = fnBody('applyMode'); assert.ok(am.indexOf('VIEW.units.sort(') < am.lastIndexOf('renderHead();'), '순위를 새로 세운 뒤 요약 표를 칠한다');
  console.log(`  면 ${n}곳 위치 칩 = 레일 순위`);
});

test('⑤ 단계 줄 = 지금 3칸 띠 역할: 누르면 단계 모드 고정(VIEW.mode), 다시 누르면 전체 · 가리킴·초점 = 미리보기(pmode) · 눌림 표시는 고정 모드만', () => {
  let m = ctx.MODE_ALL;
  m = ctx.pressMode(m, 's', 1); assert.deepEqual(plain(m), { k: 's', i: 1 });
  m = ctx.pressMode(m, 's', 1); assert.deepEqual(plain(m), { k: 'all' }, '다시 누르면 전체');
  m = ctx.pressMode({ k: 'y', i: 2 }, 's', 0); assert.deepEqual(plain(m), { k: 's', i: 0 }, '해 모드에서 단계 줄 → 단계(해는 전체)');
  const clk = TPL.slice(TPL.indexOf("/* 띠 칸·해 칸·막대·재생·돌리기 누름 */"), TPL.indexOf('/* ---------- 돌려 보기(2026-10-18)'));
  assert.match(clk, /e\.target\.closest\?\.\('#sm-st \.sm-r, #tband \[data-y\]/); assert.match(clk, /else setMode\(pressMode\(VIEW\.mode, 's', \+b\.dataset\.st\)\);/);
  assert.match(fnBody('setMode'), /VIEW\.mode = m; VIEW\.pmode = null;/);
  assert.equal(TPL.split("const b = e.target.closest?.('#sm-st .sm-r'); if (b) { clearTimeout(pmT); setPmode(pmOf(b)); }").length - 1, 2, '가리킴(mouseover)·초점(focusin) = 단계 미리보기');
  assert.equal(TPL.split("closest?.('#sm-st .sm-r') && !e.relatedTarget?.closest?.('#sm-st .sm-r')) { clearTimeout(pmT); pmT = setTimeout(() => setPmode(null), 90);").length - 1, 2, '떠나면 고정 모드로');
  assert.match(fnBody('paintBand'), /m = VIEW\?\.mode \|\| MODE_ALL/, '눌림 = 고정 모드(VIEW.mode)');
  assert.match(fnBody('paintBand'), /b\.setAttribute\('aria-pressed', String\(m\.k === 's' && \+b\.dataset\.st === m\.i\)\)/);
  assert.match(CSS, /\.sm-r\[aria-pressed="true"\] \{ background: color-mix\(in oklab, var\(--c\) var\(--tint-mix-on\), var\(--sf\)\); \}/);
  /* 시도 단추 = 예전 '시도 전체' 단추 역할(누르면 시도 보기) */
  assert.match(fnBody('nameHtml'), /<button type="button" class="ui-btn ui-btn-ghost ui-btn-sm sm-sd" data-area="\$\{sd\.code\}" data-src="sido" title="\$\{esc\(sd\.label\)\} 전체 \$\{bigNum\(sum\(sd\.codes\)\.u\)\}호"/);
  assert.match(fnBody('nameHtml'), /\$\{ico\('chev', 'sm-cv'\)\}/, '꺾쇠 = lucide chevron 선 아이콘');
});

test('⑥ 머리 띠·#sband 없음, h1 은 하나이고 요약 표(#smry) 안 · 큰 지도는 시간 띠 단추 묶음', () => {
  for (const [nm, f] of [['원본', TPL], ['데모판', BUILT], ['운영판', OPS]]) {
    assert.doesNotMatch(f, /id="sband"|class="mapc-h|class="sband|#sband/, `${nm}: 머리 띠·6단계 띠 없음`);
    const body = f.slice(f.indexOf('<body'));
    /* 정적 마크업에는 h1 이 없고(스크립트가 만든다), 스크립트가 만드는 h1 은 요약 표의 #sum-h 뿐 */
    const h1s = [...body.matchAll(/<h1\b[^>]*>/g)].map((m) => m[0]);
    assert.ok(h1s.length >= 1 && h1s.every((h) => /^<h1 class="ui-h1 sum-h(?: zero)?" id="sum-h">$/.test(h)), `${nm}: ${h1s.join(' ')}`);
  }
  assert.match(fnBody('renderSum'), /if \(!sm\.firstChild\) sm\.innerHTML = '<div class="sm-nm"><\/div><h1 class="ui-h1 sum-h" id="sum-h"><\/h1><div class="sm-st" id="sm-st" role="group" aria-label="단계별 호수"><\/div><p class="nx none"><\/p>';/);
  assert.match(fnBody('renderHead'), /const box = \$\('#smry'\);[\s\S]*const old = box\.querySelector\('h1'\)/, 'h1 은 요약 표 안에서만 바꾼다');
  assert.match(TPL, /<div class="sum" id="sum" role="group" aria-label="요약과 지금 신청"><section class="ui-card smry" id="smry" aria-labelledby="sum-h"><\/section><div class="ui-card ap-card" id="ap-card"><\/div><\/div>\s*<section class="ui-card mapc" id="mapc" aria-label="시군구 지도"><\/section>/);
  assert.ok(TPL.indexOf('id="sum"') < TPL.indexOf('id="mapc"'), '마크업·휴대폰 순서 = 요약 표가 먼저(390 첫 화면 맨 위, G5)');
  assert.doesNotMatch(fnBody('renderMapCard'), /TIP_HEAD|sdTag|bigMap\(sd, viewKey\)\}<div/, '지도 카드에 ⓘ·시도 전체·큰 지도 머리 없음');
  assert.match(fnBody('tbandHtml'), /<span class="tmap">\$\{bm\}<\/span>/);
});

test('⑦ 강조 금지 목록(색 왼쪽/오른쪽 테두리 2px 이상 · 0 오프셋 색 후광 · 그라데이션 글자 · 장식 유리 · 눈썹 글) 0, 요약은 별개 카드의 틴트 바탕 · 높이 고정 · 훑음은 줄임 설정이면 없음', () => {
  const sm = CSS.slice(CSS.indexOf('/* ① 왼쪽 열(2026-10-18 통합 요약 표'), CSS.indexOf('/* 지금 신청: 소제목'));
  assert.ok(sm.length > 1000);
  assert.doesNotMatch(sm, /border-(left|right):\s*(var\(--border-w-on\)|[2-9]px)/, '색 옆 테두리 2px 이상 없음');
  assert.doesNotMatch(sm, /box-shadow:\s*0 0 /, '0 오프셋 후광 없음');
  assert.doesNotMatch(sm, /background-clip:\s*text|-webkit-text-fill-color|linear-gradient|radial-gradient|backdrop-filter/, '그라데이션 글자·유리 없음');
  assert.doesNotMatch(sm, /\.smry \{[^}]*margin: /, '요약은 카드 가장자리까지 붙은 구역이 아니라 자기 카드');
  assert.match(sm, /\.smry \{[^}]*grid-template-rows: 36px 44px auto 52px;[^}]*background: var\(--sf\);/, '줄 높이 고정 · 별개 카드 강조 바탕');
  assert.match(sm, /\.sm-st \{[^}]*height: calc\(264px \+ var\(--s3\) \+ var\(--s1\) \* 2 \+ var\(--border-w\) \* 2\);/);
  /* 훑음: 첫 그리기·줄임 설정이면 없음, 켜지면 .fx-sw 를 0.6초 */
  const W = (reduce) => ({ matchMedia: () => ({ matches: reduce }), setTimeout: (f, ms) => { W.ms = ms; return 1; }, clearTimeout: () => {} });
  const el = () => { const s = new Set(); return { classList: { add: (c) => s.add(c), remove: (c) => s.delete(c), has: (c) => s.has(c) }, offsetWidth: 1 }; };
  const a = el(); assert.equal(ctx.sweep(a, W(true)), false); assert.equal(a.classList.has('fx-sw'), false, '줄임 설정');
  const b = el(); assert.equal(ctx.sweep(b, W(false)), true); assert.equal(b.classList.has('fx-sw'), true); assert.equal(ctx.FX.sweep, 600);
  assert.equal(ctx.sweep(null, W(false)), false);
  assert.match(TPL, /@media \(prefers-reduced-motion: reduce\) \{ \.fx-sw::after \{ display: none; \} \}/);
  assert.match(CSS, /:is\(\.sm-nm, \.sum-h, \.sm-r, \.nx\)\.fx-sw::after \{[^}]*animation: sm-sweep \.6s cubic-bezier\(\.16, 1, \.3, 1\) forwards; \}/, '지수형 감속 0.6초');
  /* 요약 표에는 등장 연출이 없다(지도 처음 솟음만 연출된 순간) — 첫 그리기는 훑지 않는다 */
  assert.match(fnBody('renderHead'), /first = !box\.dataset\.on;/); assert.match(fnBody('paintBand'), /const first = el\.dataset\.sig === undefined/);
});

test('⑥ 준공·입주 줄(2026-10-20): 구분선 아래·큰 숫자 밖, 값은 지은 호수, 색은 --st-soon·--st-move, 단계 탭 7개·모드 6개', () => {
  const D2 = JSON.parse(JSON.stringify(D)), c0 = IX.regionOf['41360'].codes[0];
  D2.hp.c[c0][3][4] += 100; D2.hp.c[c0][3][5] += 40;   // 2026-10-21 HOME PoC 칸(D.hp 단계 6칸) — 옛 원장 줄 D.prj 끼워 넣기 대체
  const band2 = make('bandHtml', { sum: (cs) => ctx.sumOf(D2, cs), D: D2, areaOf: (c) => IX.regionOf[c], unitKey, bico: () => '', esc, nameOf: (r) => r.label, fmt, stageSums: ctx.stageSums, topStage: ctx.topStage, STAGE6: ctx.STAGE6, STAGE_Q: ctx.STAGE_Q, SUPPLY_N: ctx.SUPPLY_N, bigNum: ctx.bigNum });
  const r = IX.regionOf['41360'], b = band2(r, false), R = rows(b);
  assert.deepEqual(R.slice(4).map((x) => x.v), [ctx.stageSums(D, r.codes)[4] + 100, ctx.stageSums(D, r.codes)[5] + 40], '준공·입주 줄 = 이미 지은 호수');
  assert.equal(R.slice(0, 4).reduce((a, x) => a + x.v, 0), ctx.sumOf(D2, r.codes).u, '앞 4줄 합 = 큰 숫자 — 준공·입주는 더하지 않는다');
  assert.ok(b.indexOf('class="sm-sep"') < b.indexOf('class="sm-r s4') && b.indexOf('class="sm-r s3') < b.indexOf('class="sm-sep"'), '구분선 아래에 준공·입주');
  assert.match(b, /<span class="sm-sn">준공<\/span>/); assert.match(b, /<span class="sm-sn">입주<\/span>/); assert.doesNotMatch(b, /[①②③④⑤⑥]|준비 중|짓는 중|모집 끝남/);
  assert.match(b, /title="준공 100호\. 공사를 마치고 사용 승인을 받았어요"/, '뜻은 툴팁에 쉬운 말로');
  assert.ok(/\.sm-sep \{[^}]*height: var\(--border-w\); background: var\(--border\);/.test(CSS) && CSS.includes('.sm-st:has(> .sm-sep) { grid-template-rows: repeat(4, 44px) var(--s3) repeat(2, 44px); }'));
  for (const [j, k] of [[1, 'permit'], [2, 'build'], [3, 'sale'], [4, 'soon'], [5, 'move']]) assert.ok(CSS.includes(`.sm-r.s${j} { --c: var(--st-${k}); --c-ink: var(--st-${k}-ink); }`), `s${j}`);
  /* 단계 탭 7개(전체 + 6)와 599 이하 배치 4칸 × 2줄 */
  assert.deepEqual([...TPL.matchAll(/data-fst="(\w+)"/g)].map((m) => m[1]), ['all', '0', '1', '2', '3', '4', '5']);
  assert.ok(CSS.includes('.fbar .ui-tabs:last-child { grid-auto-flow: row; grid-template-columns: repeat(4, minmax(0, 1fr)); height: auto; }'));
  /* 지도 모드: 준공·입주도 단계 모드로 같은 값, 해마다처럼 한 표본(6개)으로 색 구간을 묶는다 */
  assert.match(TPL, /mode\.k === 's' \? STAGE6\.map\(\(_, i\) => \(\{ k: 's', i \}\)\)/);
  assert.match(TPL, /\['', '', 'build', 'sale', '', ''\]\[m\.i\]/, '램프는 착공·모집만(나머지 넷은 기본 램프)');
  assert.equal(ctx.modeOf(D2, r.codes, { k: 's', i: 4 }), ctx.stageSums(D, r.codes)[4] + 100);
});
