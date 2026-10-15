'use strict';
// 지도 재평가(2026-10-15, impeccable 3차 28/40) 고침: 사업 이름 일치·단위 '건'·지역 선택기 구조·Esc 로 카드 닫기·다크 기존 건물 색·공개 문구·키보드 초점.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../../assets/js/region.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const html = read('index.html'), css = read('assets/css/app.css'), app = read('assets/js/app.js');
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/ .*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');   // 블록·줄 끝 주석·HTML 주석을 뺀 코드

const LITE = {
  41110: { name: '경기도 수원시', n: 3 }, 41113: { name: '경기도 수원시 권선구', n: 4 }, 41170: { name: '경기도 안양시', n: 1 },
  28245: { name: '인천광역시 계양구', n: 6 }, 11170: { name: '서울특별시 용산구', n: 9 },
};
const REGIONS = [{ slug: 'incheon-gyeyang', name: '인천 계양구' }, { slug: 'gwangju-gwangsan', name: '광주 광산구' }, { slug: 'jeonnam-naju', name: '전남 나주시' }];
function mount(r, resolved) {
  const els = { regionBox: { hidden: true }, regionSel: { innerHTML: '', addEventListener() {} } };
  const doc = { getElementById: (id) => els[id] };
  R.mountSelector(doc, Object.assign({ regions: REGIONS, name: '' }, r), { HOME_LITE: LITE, RESOLVED: resolved || null, location: { href: 'http://x.test/map' } });
  return els.regionSel.innerHTML;
}

test('지역 선택기: 시도 묶음 이름은 짧게, 구가 있는 시의 시 단위 코드는 "(구 미정)"으로 구와 나눈다(구가 없는 시는 그대로)', () => {
  const g = R.homeSelectorGroups(LITE);
  assert.deepEqual(g.map((x) => x.label), ['서울', '인천', '경기']);
  assert.deepEqual(g[2].options.map((o) => o.label), ['수원시(구 미정) · 3건', '수원시 권선구 · 4건', '안양시 · 1건']);
});

test('지역 선택기: 수도권 시도 목록이 먼저, 같은 곳의 상세 3D 지역(계양)은 한 항목으로 합치고, 나머지 상세 3D 지역은 맨 아래 묶음', () => {
  const s = mount({ slug: 'incheon-gyeyang' });
  const groups = [...s.matchAll(/<optgroup label="([^"]+)">/g)].map((m) => m[1]);
  assert.deepEqual(groups, ['서울', '인천', '경기', '상세 3D 지역']);
  assert.match(s, /<optgroup label="인천"><option value="incheon-gyeyang" selected>계양구 · 6건 · 상세 3D<\/option><\/optgroup>/);
  assert.equal((s.match(/계양/g) || []).length, 1, '계양구는 한 번만');
  assert.match(s, /<optgroup label="상세 3D 지역"><option value="gwangju-gwangsan">광주 광산구<\/option><option value="jeonnam-naju">전남 나주시<\/option><\/optgroup>$/);
  assert.doesNotMatch(s, /번들|사업 원장/);
  assert.match(mount({ slug: '' }, { sgg: '28245' }), /<option value="incheon-gyeyang" selected>/, '?sgg=28245 로 열어도 합친 항목이 골라진다');
  assert.match(mount({ slug: '' }, { sgg: '41110' }), /<option value="sgg:41110" selected>수원시\(구 미정\) · 3건<\/option>/);
});

test('사업 카드 제목은 원장 사업 이름(사업 화면 목록·서랍과 같은 이름, 길면 두 줄 말줄임 + title), 블록 이름은 부제', () => {
  assert.match(app, /const projName = \(b\) => String\(\(b\.ledger && b\.ledger\.name\) \|\| b\.name \|\| b\.id\);/);
  const fn = /function blockPopup\([\s\S]*?\n\}\n/.exec(app)[0];
  assert.match(fn, /const nm = projName\(b\), sub = \[nm !== b\.label \? b\.label : ''/);
  assert.match(fn, /<b class="pc-t" title="\$\{esc\(\[nm, about\]/);
  assert.match(css, /\.pc-h \.pc-t\{[^}]*-webkit-line-clamp:2[^}]*overflow:hidden/);
  const data = JSON.parse(read('data/board/home-map/41113.json')).projects.find((r) => r.id === 'PRJ-41113-0035');
  assert.equal(data.name, '수원당수 A-5BL 아파트 건설공사 5공구'); assert.equal(data.label, '수원당수 A5');   // 원장 이름은 자료에 이미 있다(생성기 그대로)
});

test("단위: 단계 줄·요약은 사업 수 '건'·호수 '호'(단지 아님), 후보는 '후보 사업'", () => {
  const code = noComments(app);
  assert.match(code, /<span class="sf-n">\$\{bs\.length\}건<\/span>/);
  assert.match(code, /<span class="hs-n">· \$\{tot\.prog \? '진행 ' : ''\}\$\{tot\.n\}건/);   // 수도권은 '진행 n건'(원장 ①~④, 수도권 개요와 같은 기준)
  assert.match(code, /<span class="sf-n">\$\{h\.n\}건<\/span>/);
  assert.doesNotMatch(code, /\}단지<|개 단지|단지 없음|번호 발급 전<\/small>/);
  assert.match(code, /<small>후보 사업<\/small>/);
  assert.match(html, /<h2 id="h-proj">사업<\/h2>/);
});

test('Esc: 열린 카드를 닫고 초점을 연 단추(없으면 지도)로 돌려준다. 옵션 창·입력 중이면 그쪽이 먼저', () => {
  assert.match(app, /cardFrom = from && from !== document\.body && !from\.closest\('\.maplibregl-popup'\) \? from : null;/);
  const h = /document\.addEventListener\('keydown', \(e\) => \{\n  if \(e\.key !== 'Escape' \|\| !popup[\s\S]*?\n\}\);/.exec(app);
  assert.ok(h, 'Esc 처리기를 찾을 수 없음');
  assert.match(h[0], /!\$\('#optPanel'\)\.hidden/); assert.match(h[0], /INPUT\|SELECT\|TEXTAREA/);
  assert.match(h[0], /map\.getCanvas\(\)\.focus\(\)/); assert.match(h[0], /popup\.remove\(\); popup = null;/); assert.match(h[0], /b\.focus\(\)/);
  assert.match(h[0], /!\$\('#vMenu'\)\.hidden/, '보기 메뉴가 열려 있으면 메뉴가 먼저 Esc 를 받는다');
});

const lum = (h) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
test('다크 지도: 기존 건물(기반시설) 면은 네이비 바탕 3:1 이상이면서 사업 표지 색(①~⑥)보다 어둡다 — 사업 표지가 주인공', () => {
  const fac = /fac: \{ edu: \{ c: '(#\w{6})'[^}]*\}, med: \{ c: '(#\w{6})'[^}]*\}, pub: \{ c: '(#\w{6})'/.exec(app).slice(1);
  const stage = [...(/const COLOR = \{([^}]*)\}/.exec(app)[1]).matchAll(/(\w+): '(#\w{6})'/g)].filter(([, k]) => k !== 'priv').map((m) => m[2]);
  const dimmest = Math.min(...stage.map(lum));
  for (const c of fac) {
    assert.ok(ratio(c, '#0A1030') >= 3, `${c} 대비 ${ratio(c, '#0A1030').toFixed(2)}`);
    assert.ok(lum(c) < dimmest, `${c} 가 사업 표지 색보다 밝다`);
  }
});

test("공개 문구: 지도 화면에 '투어'·'번들'·'HOME' 같은 내부 용어가 없다(둘러보기·상세 3D)", () => {
  assert.match(html, /id="vTour"[^>]*aria-label="둘러보기"[^>]*>(?:<i [^>]*><\/i>)?둘러보기<\/button>/);
  const vis = noComments(html) + noComments(app) + noComments(read('assets/js/region.js')) + noComments(read('assets/js/goto.js'));
  assert.doesNotMatch(vis, /투어|번들|HOME 덤프|\(HOME\)/);
});

test('키보드 초점: 넘침을 자르는 도구 묶음(.rctl·.tools) 단추는 안쪽 고리, 지역 선택에도 고리', () => {
  assert.match(css, /\.rctl button:focus-visible,\.tools button:focus-visible\{outline:2px solid var\(--acc\);outline-offset:-3px/);
  assert.match(css, /\.regionbox select:focus-visible\{outline:2px solid var\(--acc\)/);
});

test("정책 표기: 지도 카드의 policyTxt 줄에는 연결 상태('연결 확정'·'확정 전')가 없다 — 상태는 title 에만", () => {
  const line = /^const policyTxt = .*$/m.exec(app);
  assert.ok(line, 'policyTxt 정의 줄을 찾을 수 없음');
  assert.doesNotMatch(line[0], /연결 확정|확정 전/);
});

/* ---- 4차 재평가(2026-10-15): 카드 용어·말풍선 겹침·다크 파랑 건물 ---- */
test("카드 행 이름: 사업 화면과 같은 '현재 예정'·'상태'(펼친 카드·접힌 카드 줄), 사이드바 모음은 '다가오는 준공·입주'", () => {
  const code = noComments(app);
  assert.match(code, /\['상태', `<b class="jd/);
  assert.match(code, /\['현재 예정', `\$\{esc\(lt\.next \|\| lt\.due\)\}/);
  assert.match(code, /t\.next \? `현재 예정 \$\{esc\(t\.next\)\}`/);
  assert.doesNotMatch(code, /\['다음 일정'|\['판정'|`다음 \$\{esc\(t\.next\)\}`/);
  assert.match(html, /<h2 id="h-next">다가오는 준공·입주<\/h2>/);
  assert.equal(R.ledgerTexts({ cls: 'caution', overdue: { eventType: 'COMPLETION', planned: '2026-06-01', months: 4 } }).late, '준공 예정 경과 4개월');   // 사업 화면 '경과 n개월'과 같은 어순
});

test('말풍선 겹침: 단지 카드(HUD)는 자리 후보를 넓히고, 끝내 먼저 놓인 카드와 겹치면 카드만 숨기고 표시선(표지)은 남긴다', () => {
  const fn = /function renderHud\(\) \{[\s\S]*?\n\}\n/.exec(app)[0];
  assert.match(fn, /const cands = \[[^;]*\[x1 \+ 16, y0 - 4 \+ TH_ \+ 6\][^;]*\];/);
  const skip = /if \(placed\.some\(\(e\) => hit\(r, e\)\)\) \{[\s\S]*?continue;\s*\}\s*placed\.push\(r\);/.exec(fn);
  assert.ok(skip, '겹침 처리 블록을 찾을 수 없음');
  assert.match(skip[0], /el\.hidden = true;/); assert.match(skip[0], /parts\.push\(`<path d="\$\{d\}"/);   // 표시선(레티클)은 그대로 그린다
  assert.ok(fn.indexOf('placed.push(r)') > fn.indexOf('placed.some'), '숨긴 카드는 자리를 차지하지 않는다');
  assert.match(app, /'blk-label-lo'[\s\S]{0,400}'text-allow-overlap': false/);   // 지도 안 라벨은 겹침 금지 그대로
});

test('다크 지도: 기존 건물 파랑 단계는 지붕(밝게 섞은 윗면)까지 네이비 바탕 3:1 이상이면서 모든 단계 색보다 어둡다', () => {
  const ramp = /ramp: \['(#\w{6})', '(#\w{6})', '(#\w{6})', '(#\w{6})', '(#\w{6})'\], flat/.exec(app).slice(1);
  const roof = (h) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * 0.74 + 255 * 0.26).toString(16).padStart(2, '0')).join('');   // paintBuildings: 지붕 = 흰색 26% 섞음
  const stage = [...(/const COLOR = \{([^}]*)\}/.exec(app)[1]).matchAll(/(\w+): '(#\w{6})'/g)].filter(([, k]) => k !== 'priv').map((m) => m[2]);
  assert.ok(lum(roof(ramp[4])) < Math.min(...stage.map(lum)), '가장 밝은 파랑 지붕이 단계 색보다 밝다');
  assert.ok(ratio(roof(ramp[4]), '#0A1030') >= 3, `지붕 대비 ${ratio(roof(ramp[4]), '#0A1030').toFixed(2)}`);
  assert.ok(lum(ramp[4]) <= lum('#394C96') + 1e-9 && lum(ramp[3]) <= lum('#2E3F82') + 1e-9, '위 두 단은 3차 값(#33468D·#4155A3)보다 한 단계 낮다');
  assert.match(css, /\.sw\.ramp\{background:linear-gradient\(90deg,#17204D,#394C96\)\}/);   // 범례 견본도 같이
});

test('사업 카드(2026-10-15): 화면 용어(상태·공정률·호·점 날짜), 머리 고정 + 몸통 스크롤, 핵심 2열 격자·설명 두 줄·주변·시공 접힘', () => {
  const fn = noComments(/function blockPopup\([\s\S]*?\n\}\n/.exec(app)[0]);
  assert.doesNotMatch(fn, /판정|공정율|세대/, '카드 글자에 옛 용어가 없다');
  assert.match(fn, /\['공정률', /); assert.match(fn, /\['입주', esc\(dotDate\(b\.moveIn\)\)\]/); assert.match(fn, /esc\(noteTxt\(b\.note\)\)/);
  assert.match(fn, /<div class="pc pc-split">\s*<div class="pc-h">[\s\S]*<\/div>\s*<div class="pc-body">/, '머리는 몸통 밖(스크롤해도 고정)');
  assert.match(fn, /gridHtml\(\[/); assert.match(fn, /<details class="pc-note">/); assert.match(fn, /<details class="pc-more pc-near"><summary>주변·시공/);
  /* 날짜·단위 바꾸기(app.js 의 dotDate·noteTxt 를 그대로 떼어 돌린다) */
  const src = /const dotDate = [^\n]*\nconst noteTxt = [^\n]*\n/.exec(app)[0];
  const f = new Function(`${src}; return { dotDate, noteTxt };`)();
  assert.equal(f.noteTxt('블록 538세대 중 359세대 분양, 179세대는 행복주택입니다. 공사 종료 예정은 2026-10-11입니다.'), '블록 538호 중 359호 분양, 179호는 행복주택입니다. 공사 종료 예정은 2026.10.11입니다.');
  assert.equal(f.dotDate('2028-09-30'), '2028.09.30'); assert.equal(f.dotDate('2026-12'), '2026.12'); assert.equal(f.dotDate('PRJ-28245-0057'), 'PRJ-28245-0057');
  assert.match(css, /\.pc-split\{[^}]*overflow:hidden/);
  assert.match(css, /\.pc-split>\.pc-body\{[^}]*min-height:0[^}]*overflow-y:auto/);
  assert.match(css, /\.pc-grid\{display:grid;grid-template-columns:1fr 1fr/);
  assert.match(css, /\.pc-note summary\{[^}]*-webkit-line-clamp:2/);
  /* 반투명 유리: backdrop-filter 와, 못 쓰는 브라우저용 @supports 대체(두 테마) */
  assert.match(css, /(?:^|\n)\.maplibregl-popup-content\{[^}]*background:var\(--glass-pop\);-webkit-backdrop-filter:var\(--glass-pop-blur\);backdrop-filter:var\(--glass-pop-blur\)/);
  assert.match(css, /@supports not \(\(backdrop-filter:blur\(1px\)\) or \(-webkit-backdrop-filter:blur\(1px\)\)\)\{:root\{[^}]*--glass-pop:rgba\(16,26,68,\.98\)/);
  assert.match(css, /@supports not \(\(backdrop-filter:blur\(1px\)\) or \(-webkit-backdrop-filter:blur\(1px\)\)\)\{html\[data-map-shell\]:not\(\.dark\)\{--glass-hud:rgba\(255,255,255,\.98\)/);
  /* 접힘을 펴면 자리를 다시 맞춘다 */
  assert.match(app, /popup\.getElement\(\)\.addEventListener\('toggle', \(\) => \{ if \(popup !== own\) return; popup\.setOffset\(\[0, 0\]\); fitCard\(\); \}, true\)/);
});

// ---- 지도 마지막 다듬기(2026-10-15, 디자인 평가 A5 남은 지도 문제 6건) ----
const ovjs = read('assets/js/overview.js'), layoutMap = read('app/(map)/layout.tsx'), pageMap = read('app/(map)/map/page.tsx');

test('다듬기 1: 수도권 패널 합계는 머리 줄과 같은 값(SUM_TOTAL.main), 지도에 그린 몫은 보조 줄로 이름을 붙인다', () => {
  const code = noComments(app);
  assert.match(code, /지도 표시 \$\{BLOCKS\.length\}건 · \$\{fmt\(total\)\}호/, '지도에 그린 몫은 이름표를 단 보조 줄');
  assert.match(code, /위치 미확보 \$\{REG\.home\.unlocated\.length\}건`/);
});

test('다듬기 2: 사업 꼬리표 위에 놓인 학교 거리·통학구역 연결선 글자는 숨긴다(꼬리표 우선)', () => {
  const code = noComments(app);
  assert.match(code, /hideLinkLabelsUnder\(placed\);\s*\}/, 'renderHud 끝에서 놓은 꼬리표 상자로 호출');
  assert.match(code, /map\.setFilter\(layer, ids\.length \? \(base \? \['all', base, cut\] : cut\) : \(base \|\| null\)\)/);
  assert.match(code, /\['infra-school-label', 'pts', 'id', 12, 't'\]/, '학교 이름 글자도 같은 규칙');
  assert.match(code, /for \(const id of \['blk-badge', 'blk-badge-top'\]\) if \(map\.getLayer\(id\)\) map\.moveLayer\(id\);/, '지면 꼬리표를 위 층으로 올려 먼저 자리를 잡는다');
  // 겹침 판정은 순수 사각형 견주기라 같은 식으로 시험: 꼬리표(0,0,100,40)와 글자 상자
  const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  assert.equal(hit({ l: 90, t: 30, r: 200, b: 60 }, { l: 0, t: 0, r: 100, b: 40 }), true);
  assert.equal(hit({ l: 110, t: 30, r: 200, b: 60 }, { l: 0, t: 0, r: 100, b: 40 }), false);
});

test('다듬기 3: 개요 순위는 값이 0인 시군구에 번호를 붙이지 않고 목록 끝 "값 없음 n곳" 묶음(접기·키보드)으로 접는다', () => {
  assert.match(ovjs, /값 없음 \$\{none\.length\}곳/);
  assert.match(ovjs, /const hit = D\.ok \? list\.filter\(\(u\) => valOf\(u\.v, S\.metric\) > 0\) : list/);
  assert.match(ovjs, /rankRow\(u, i, false\)/);
  assert.match(ovjs, /rankRow\(u, 0, true\)/, '0건 행은 순위 자리 비움');
  assert.match(ovjs, /<button type="button" class="ov-zbtn" aria-expanded=/, '접기 단추는 button(Enter·Space 로 열림)');
  assert.match(ovjs, /<ol id="ovZeroList" class="ov-zlist"[^>]*hidden/);
});

test('다듬기 4: /map 첫 Tab 은 지도로 바로가기(개요·상세 각 지도 영역), 평소엔 숨기고 초점일 때만 보인다', () => {
  assert.ok(layoutMap.indexOf('지도로 바로가기') < layoutMap.indexOf('<TopNav'), '로고보다 앞');
  assert.match(layoutMap, /href="#ovMapWrap" className="skip-ov sr-only [^"]*focus:not-sr-only/);
  assert.match(layoutMap, /href="#mapMain" className="skip-detail sr-only [^"]*focus:not-sr-only/);
  assert.match(pageMap, /id="ovMapWrap" tabIndex=\{-1\}/);
  assert.match(html, /<main class="mapwrap" id="mapMain" tabindex="-1">/);
  assert.match(css, /html\[data-map-mode="overview"\] \.skip-detail,html:not\(\[data-map-mode="overview"\]\) \.skip-ov\{display:none\}/);
});

test('다듬기 5: 지도 사업 카드 아래에 "사업 정보 보기 ›" 링크(서랍 /projects?id=)', () => {
  assert.match(app, /<a class="pc-open" href="\$\{esc\(projHref\(linkId\)\)\}">사업 정보 보기 ›<\/a>/);
  assert.match(css, /\.pc-split>\.pc-open\{flex:none;[^}]*text-decoration:underline/);
});

test('다듬기 6: 패널 사업 목록의 이름은 지도 꼬리표와 같은 짧은 이름(b.id), 원래 이름은 title', () => {
  assert.match(app, /<b title="\$\{esc\(projName\(b\) !== b\.label \? `\$\{projName\(b\)\} · \$\{b\.label\}` : projName\(b\)\)\}">\$\{esc\(b\.id\)\} \$\{esc\(b\.kind/);
  assert.match(app, /<span class="ht-h"><b>\$\{esc\(b\.id\)\}<\/b>/, '꼬리표도 b.id');
});

test('계양 번들: 카드·꼬리표·패널 호수는 원장 계획 호수(A3 538·A17 463·A9 475), 번들 호수는 보조 값', () => {
  const rd = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '../../', f), 'utf8'));
  const dir = 'public/regions/incheon-gyeyang/';
  const raw = { index: { regions: [] }, entry: {}, region: rd(dir + 'region.json'), projects: rd(dir + 'projects.json'), buildings: rd(dir + 'buildings.json'), home: [rd('data/board/home-map/28245.json')] };
  const r = R.adaptBundle(raw), by = Object.fromEntries(r.blocks.filter((b) => b.pid).map((b) => [b.pid, b]));
  for (const [pid, led, bundle] of [['techno-A3', 538, 359], ['techno-A17', 463, 309], ['techno-A9', 475, 317]]) {
    assert.equal(by[pid].units, led, pid);
    assert.equal(by[pid].bundleUnits, bundle, pid);
  }
  assert.equal(by['techno-A2'].units, 747);
  assert.equal(by['techno-A2'].bundleUnits, undefined, '같은 값이면 보조 값 없음');
  assert.match(app, /\$\{b\.bundleUnits \? `<small title=/);
  // 지도에 그린 단지의 호수 합 = 원장에서 같은 사업을 더한 값
  const led = new Map(raw.home[0].projects.map((p) => [p.id, p.units]));
  for (const b of r.blocks) if (b.ledger) assert.equal(b.units, led.get(b.ledger.id) || b.units, b.id);
  assert.ok(r.home.tally.u > 0);
});

test('개요 12개월 지표 설명은 실제 범위(준공·입주, 모집은 지역 공급만)로 적는다', () => {
  const ov = fs.readFileSync(path.join(__dirname, '../../assets/js/overview.js'), 'utf8');
  assert.doesNotMatch(ov, /지역 공급 화면과 같은 기준/);
  assert.match(ov, /지역 공급 화면은 모집 예정까지 함께 셉니다/);
});

test('D1: 정상 판정인데 예정일이 기준일보다 앞서면 상태는 그대로, "예정일 지남" 표지만(현재 예정 줄·준공 임박 표지)', () => {
  const rd = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '../../', f), 'utf8'));
  const dir = 'public/regions/incheon-gyeyang/';
  const r = R.adaptBundle({ index: { regions: [] }, entry: {}, region: rd(dir + 'region.json'), projects: rd(dir + 'projects.json'), buildings: rd(dir + 'buildings.json'), home: [rd('data/board/home-map/28245.json')] });
  for (const pid of ['techno-A2', 'techno-A3']) {
    const b = r.blocks.find((x) => x.pid === pid), t = R.ledgerTexts(b.ledger);
    assert.equal(t.pastDue, true, pid);
    assert.equal(t.due, '준공 예정 2026.10.11', pid);
    assert.equal(b.status, '준공 임박', '상태 값은 바꾸지 않는다(표지 글자만 예정일 지남)');
  }
  assert.equal(R.ledgerTexts({ cls: 'ok', referenceDate: '2026-10-13', next: { eventType: 'COMPLETION', planned: '2026-11-30' } }).pastDue, undefined);
  assert.equal(R.ledgerTexts({ cls: 'delay', referenceDate: '2026-10-13', overdue: { eventType: 'COMPLETION', planned: '2026-01-01', months: 9 } }).pastDue, undefined, '지연은 기존 표지');
  assert.match(app, /b\.status === '준공 임박' && [^;]*pastDue \? '예정일 지남'/);
  assert.match(app, /lt && \(lt\.next \|\| lt\.pastDue\) \? \['현재 예정'/);
});

/* ---- 5차 평가(2026-10-15, 26/40) 고침: 카드 닫기 초점·이동 중 알림, 보기 메뉴, 개요 라벨, D2 원천 날짜 다름 ---- */
test('1: 꼬리표·목록에서 연 사업 카드는 누르는 즉시 "…로 이동 중", 열리면 "… 카드 열림"을 알리고, Esc 로 닫으면 사업 id 로 꼬리표(없으면 목록 단추)를 다시 찾아 초점', () => {
  const fb = /function focusBlock\([\s\S]*?\n\}\n/.exec(app)[0];
  assert.match(fb, /say\(`\$\{b\.id\}로 이동 중`\)/);
  assert.match(fb, /blockPopup\(b, undefined, `\$\{b\.id\} 카드 열림\. `\)/);
  assert.match(fb, /cardGo = popup && from \? \{ id: b\.id, from, cam \} : null/);
  assert.match(fb, /setGoing\(id\)/); assert.match(fb, /setGoing\(null\)/);   // 이동 중 표시(aria-busy)를 켜고, 카드가 열리면 끈다
  assert.match(app, /say\(\(lead \|\| ''\) \+ popup\.getElement\(\)\.innerText/);   // 카드 열림 + 카드 내용을 한 번에(#sr aria-live)
  assert.match(html, /<div id="sr" class="sr" aria-live="polite"><\/div>/);
  assert.match(app, /\$\('#hudTags'\)\.addEventListener\('click', [^\n]*focusBlock\(t\.dataset\.id, \{ from: 'tag' \}\)/);
  assert.match(app, /\$\('#projList'\)\.addEventListener\('click', [^\n]*focusBlock\(btn\.dataset\.id, \{ from: 'list' \}\)/);
  const back = /function cardBackTo\(id\) \{[\s\S]*?\n\}/.exec(app)[0];
  assert.match(back, /byId\(\$\('#hudTags'\), 'data-id', id\)/); assert.match(back, /byId\(\$\('#projList'\), 'data-id', id\)/);
  assert.match(back, /shown\(tag\) \? tag : shown\(row\) \? row : map\.getCanvas\(\)/);   // 꼬리표 → 목록 단추 → 지도 순
  const h = /document\.addEventListener\('keydown', \(e\) => \{\n  if \(e\.key !== 'Escape' \|\| !popup[\s\S]*?\n\}\);/.exec(app)[0];
  assert.match(h, /go\.from === 'tag' && go\.cam && map\.getZoom\(\) >= HUD_MAXZ/);   // 꼬리표는 멀리 볼 때만 있어 연 자리 시점으로 돌아가 다시 그린 뒤 초점
  assert.ok(h.indexOf("map.once('moveend'") < h.indexOf('map.easeTo('), 'moveend 를 먼저 걸어야 움직임 줄이기(0ms)에서도 초점이 간다');
  assert.match(h, /renderHud\(\); cardBackTo\(go\.id\)\.focus\(\)/);
  assert.match(css, /\.hudtag\[aria-busy="true"\],#projList \.card\[aria-busy="true"\]\{border-color:var\(--acc\)/);
  assert.match(html, /<p class="gonote" id="goNote" aria-hidden="true" hidden><\/p>/);   // 날아가는 동안 화면에도 '…로 이동 중'(꼬리표는 가까이 가면 숨는다)
  assert.match(app, /note\.textContent = id == null \? '' : `\$\{id\}로 이동 중`/);
});

test('2: 늘 보이는 시점 조작은 확대·축소·나침반·전체·보기(5개)로 줄고, 평면·둘러보기·좌우 돌리기·자동 회전은 보기 메뉴(키보드·aria)에 모두 있다', () => {
  const cam = /<div class="rctl"[\s\S]*?\n  <\/div>/.exec(html)[0];
  assert.deepEqual([...cam.matchAll(/<button [^>]*id="(\w+)"/g)].map((m) => m[1]), ['zIn', 'zOut', 'compass', 'vAll', 'vMenuBtn']);
  assert.match(cam, /id="vMenuBtn"[^>]*aria-haspopup="menu" aria-expanded="false" aria-controls="vMenu"[^>]*>보기<\/button>/);
  const menu = /<div class="vmenu" id="vMenu" role="menu"[^>]*hidden>[\s\S]*?\n  <\/div>/.exec(html);
  assert.ok(menu, '보기 메뉴(role=menu)를 찾을 수 없음');
  assert.deepEqual([...menu[0].matchAll(/<button [^>]*id="(\w+)"/g)].map((m) => m[1]), ['vPlane', 'vTour', 'dLeft', 'dRight', 'vOrbit']);
  for (const id of ['vPlane', 'vTour', 'vOrbit']) assert.match(menu[0], new RegExp(`id="${id}"[^>]*role="menuitemcheckbox" aria-checked="false" tabindex="-1"`));
  for (const id of ['dLeft', 'dRight']) assert.match(menu[0], new RegExp(`id="${id}"[^>]*role="menuitem" tabindex="-1"`));
  // 기능은 그대로: 각 항목의 처리기가 남아 있다
  assert.match(app, /\$\('#vPlane'\)\.addEventListener\('click', \(\) => map\.easeTo\(\{ pitch:/);
  assert.match(app, /\$\('#vTour'\)\.addEventListener\('click', \(\) => \{ closeViewMenu\(true\); if \(tourOn\) stopTour\(\); else startTour\(\); \}\)/);
  assert.match(app, /\$\('#vOrbit'\)\.addEventListener\('click', \(\) => \{ closeViewMenu\(true\); stopTour\(\); if \(orbitOn\) stopOrbit\(\); else startOrbit\(\); \}\)/);
  assert.match(app, /\[\['#dLeft', -1\], \['#dRight', 1\]\]/);
  // 키보드: 단추에서 ↑↓ 로 열고, 메뉴 안 ↑↓·Home·End, Esc 는 닫고 단추로, Tab 은 닫기
  assert.match(app, /vBtn\.addEventListener\('keydown'[^\n]*\n\s*if \(e\.key === 'ArrowDown' \|\| e\.key === 'ArrowUp'\)/);
  const mk = /vMenu\.addEventListener\('keydown'[\s\S]*?\n\}\);/.exec(app)[0];
  for (const k of ['Escape', 'Tab', 'ArrowDown', 'ArrowUp', 'Home', 'End']) assert.match(mk, new RegExp(`'${k}'`));
  assert.match(mk, /closeViewMenu\(true\)/);
  assert.match(app, /function closeViewMenu\(refocus\) \{[\s\S]*?vBtn\.setAttribute\('aria-expanded', 'false'\);\n  if \(refocus\) vBtn\.focus\(\);/);
  assert.doesNotMatch(app, /textContent = '멈춤'/, '상태는 aria-checked 로(글자를 바꾸지 않는다)');
  assert.match(app, /HUD_EXCL = [^\n]*#vMenu:not\(\[hidden\]\)/);
  assert.doesNotMatch(css, /#vTour\{[^}]*word-break/, "'둘러보/기' 두 줄 꺾기 규칙은 없다");
  // 빈 단계 칸은 좁은 칩
  assert.match(app, /class="sf empty" data-status=""/);
  assert.match(css, /\.stagef>\.sf\.empty\{flex:0 0 auto;min-width:0\}/);
});

const OV = require('../../assets/js/overview.js');
test('3: 개요 라벨은 이름+값 한 상자만(숫자만 남기는 bare 없음), 상자가 자기 면 밖이면 숨기고, 보이는 라벨 글자는 자기 면 색 바탕에서 4.5:1 이상', () => {
  const ov = read('assets/js/overview.js');
  assert.doesNotMatch(ov + css, /\bbare\b/);
  assert.match(ov, /fits: boxInFace\(corners, faces\.get\(L\.u\.code\)\)/);
  assert.match(ov, /const show = items\.map\(\(it, i\) => it\.fits && fit\[i\]\)/);
  // 면 안 판정(구멍 포함): 10×10 정사각형에 가운데 4×4 구멍
  const sq = [[[0, 0], [10, 0], [10, 10], [0, 10]], [[3, 3], [7, 3], [7, 7], [3, 7]]];
  const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  assert.equal(OV.boxInFace(box(0.5, 0.5, 2.5, 2.5), [sq]), true);
  assert.equal(OV.boxInFace(box(8, 8, 11, 9), [sq]), false, '한 귀퉁이가 면 밖');
  assert.equal(OV.boxInFace(box(1, 4, 9, 6), [sq]), false, '네 귀퉁이는 면 안이지만 변 가운데가 구멍(이웃 면) 위');
  assert.deepEqual(OV.projectLL(...OV.unproject(1234, 567)).map(Math.round), [1234, 567]);
  // 대비: 라벨은 값 > 0 인 면에만(c1~c5) — 단계마다 글자색(--ov-ink-N)을 자기 면색(--ov-N) 위에서 잰다(라이트·다크)
  const vars = (block) => Object.fromEntries([...block.matchAll(/(--ov-[\w-]+):(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));
  const dark = vars(/:root\{--ov-bg[^}]*\}/.exec(css)[0]), light = vars(/html\[data-map-shell\]:not\(\.dark\)\{--ov-bg[^}]*\}/.exec(css)[0]);
  for (const [name, t] of [['다크', dark], ['라이트', light]]) for (let c = 0; c <= 5; c++) {
    const r = ratio(t[`--ov-ink-${c}`], t[`--ov-${c}`]);
    assert.ok(r >= 4.5, `${name} c${c}: ${t[`--ov-ink-${c}`]} / ${t[`--ov-${c}`]} = ${r.toFixed(2)}`);
  }
  for (let c = 0; c <= 5; c++) assert.match(css, new RegExp(`\\.ov-lb\\.c${c}\\{color:var\\(--ov-ink-${c}\\);text-shadow:0 0 2px var\\(--ov-${c}\\)`));
  // 겹침 0: pickLabels 는 놓은 상자끼리 여백(LABEL_PAD) 안에서 닿지 않는다
  const items = [{ x: 50, y: 50, w: 40, h: 20 }, { x: 60, y: 55, w: 40, h: 20 }, { x: 150, y: 50, w: 40, h: 20 }];
  assert.deepEqual(OV.pickLabels(items, 400, 200, []), [true, false, true]);
});

test('4: 개요 패널은 스크롤바 자리를 비워 두고(지표 단추 폭 고정), 값 있는 시군구가 3곳 미만이면 지도 위에 빈 상태 한 줄', () => {
  assert.match(css, /\.ov-panel\{[^}]*scrollbar-gutter:stable/);
  assert.equal(OV.emptyNote('수도권 지연 사업', 2, '건', ['인천 서구', '경기 오산시']), '수도권 지연 사업 2건 — 인천 서구·경기 오산시');
  assert.equal(OV.emptyNote('수도권 지연 사업', 3, '건', ['a', 'b', 'c']), '');
  assert.match(OV.emptyNote('서울 지연 사업', 0, '건', []), /값이 있는 시군구가 없습니다/);
  assert.match(read('app/(map)/map/page.tsx'), /<p className="ov-empty" id="ovEmpty" role="status" hidden \/>/);
});

test("5: 원장 행에 dateAlt 가 있으면 카드 '현재 예정' 줄에 '원천 날짜 다름(LH 2028.12)' 표지(설명은 title), 없으면 그리지 않는다", () => {
  const fns = /const dateAltOf = [\s\S]*?\nfunction blockPopup/.exec(app)[0];
  const ctx = {};
  new (require('node:vm').Script)(`const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const dotDate = ${/const dotDate = ([^\n]*);/.exec(app)[1]};
    const ymDot = ${/const ymDot = ([^\n]*);/.exec(app)[1]};
    ${fns.replace(/\nfunction blockPopup$/, '')}
    this.dateAltOf = dateAltOf; this.altMark = altMark;`).runInNewContext(ctx);
  assert.equal(ctx.dateAltOf({ stage: '04' }), null);
  assert.equal(ctx.dateAltOf(null), null);
  const a = ctx.dateAltOf({ dateAlt: { source: 'LH', planned: '2028-12-31' } });
  const html1 = ctx.altMark(a);
  assert.match(html1, />원천 날짜 다름\(LH 2028\.12\)<\/b>$/);
  assert.match(html1, /title="LH 자료의 예정일은 2028\.12\.31로/);
  const fn = /function blockPopup\([\s\S]*?\n\}\n/.exec(app)[0];
  assert.match(fn, /alt = dateAltOf\(lg\)/);
  assert.match(fn, /\$\{alt \? ` \$\{altMark\(alt\)\}` : ''\}/);
  assert.match(read('assets/js/region.js'), /if \(r\.dateAlt && [^\n]*\) b\.ledger\.dateAlt = \{ source: String\(r\.dateAlt\.source \|\| ''\), planned: String\(r\.dateAlt\.planned\) \};/, '원장 행의 dateAlt 를 b.ledger 로 옮긴다');
});

test('합계 세 번 표시 정리: 원장 진행 합계(SUM_TOTAL.main)는 머리 줄(syncHudSum) 한 곳에서만 마크업으로 만들고, 패널은 지도 몫만, 알약은 건수 대조만', () => {
  const code = noComments(app);
  assert.equal(code.split('${SUM_TOTAL.main}').length - 1, 0, '패널 큰 숫자에 원장 합계를 다시 쓰지 않는다');
  assert.equal(code.split('${esc(tot.main)}').length - 1, 1, '머리 줄 한 곳');
  assert.match(code, /\$\('#sumTotal'\)\.innerHTML = HOME_T\s*\? `<span class="cnt">\$\{mapPart\}/);
  const pill = noComments(read('assets/js/region.js')).match(/사업 원장 \$\{r\.home\.total\}건 · 지도 \$\{r\.home\.drawn\}건`/);
  assert.ok(pill && !/units|호/.test(pill[0]), '알약은 건수만');
});
