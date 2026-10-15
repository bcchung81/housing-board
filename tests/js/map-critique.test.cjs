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
  assert.match(h[0], /: map\.getCanvas\(\);/); assert.match(h[0], /popup\.remove\(\); popup = null;/); assert.match(h[0], /back\.focus\(\)/);
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
  assert.match(html, /id="vTour"[^>]*aria-label="둘러보기"[^>]*>둘러보기<\/button>/);
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
  assert.match(code, /\['현재 예정', esc\(lt\.next\)\]/);
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
  assert.match(code, /HOME_T\s*\?\s*`<span class="big">\$\{SUM_TOTAL\.main\}<\/span>/, '패널 큰 숫자 = 머리 줄 합계');
  assert.match(code, /지도 표시 \$\{BLOCKS\.length\}건 · \$\{fmt\(total\)\}호/, '지도에 그린 몫은 이름표를 단 보조 줄');
  assert.match(code, /위치 미확보 \$\{REG\.home\.unlocated\.length\}건 제외/);
  assert.match(css, /\.sum \.cnt\+\.cnt\{display:block\}/);
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
