'use strict';
// 지도 상세(2026-10-15 사용자 요구 4·5):
//  5 — 상세가 열리면 사업 구역이 현재 단계색(머리 줄 ①~⑥ 띠와 같은 색)으로 또렷이 칠해지고, 띠는 범례(누르면 그 단계만 강조, 나머지 흐리게), 꼬리표 맨 앞에 단계 번호.
//  4 — 건물·사업 카드가 1280×720~1920×1080 지도 안에서 넘치지 않는다(가로·세로 안쪽, 안내 띠 밑으로 가지 않음, 긴 이름 줄바꿈).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const app = read('assets/js/app.js'), css = read('assets/css/app.css'), tw = read('app/tailwind.css');
const block = (re) => { const m = re.exec(app); assert.ok(m, String(re)); return m[0]; };

/* 대비(WCAG 상대 휘도) */
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const over = (c, bg, a) => c.map((v, i) => v * a + bg[i] * (1 - a));

const COLOR = Function(`return ${block(/const COLOR = (\{[^}]*\})/).replace(/^const COLOR = /, '')}`)();
const STAGE_KIND = Function(`return ${/const STAGE_KIND = (\[[^\]]*\])/.exec(app)[1]}`)();
const DARK_BG = /vw: String\(window\.VWORLD_LAYER \|\| 'midnight'\), ofm: 'dark', bg: '(#[0-9A-F]{6})'/.exec(app)[1];
const LIGHT_BG = /vw: 'white', ofm: 'liberty', [^\n]*?bg: '(#[0-9A-F]{6})'/.exec(app)[1];

/* 불투명도 식(areaOp·lineOp·privOp)을 SHOWN·LIGHT_MAP 을 바꿔 가며 평가한다 */
const opSrc = block(/const AREA_OP = [\s\S]*?\nconst lineOp = [^\n]*\n/);
const ops = (shown, light) => Function('SHOWN', 'LIGHT_MAP', `${opSrc}; return { AREA_OP, AREA_FAINT, LINE_FAINT, areaOp, lineOp, privOp };`)(new Set(shown), light);

test('구역 채움: 다크에서 6단계 색 모두 배경 대비 3:1 이상, 같은 색 윤곽은 7:1 이상', () => {
  const { AREA_OP } = ops([], false), a = AREA_OP.dark[0], bg = hex(DARK_BG);
  for (const k of STAGE_KIND) {
    const fill = ratio(over(hex(COLOR[k]), bg, a), bg), line = ratio(hex(COLOR[k]), bg);
    assert.ok(fill >= 3, `${k} 채움 ${fill.toFixed(2)}:1`);
    assert.ok(line >= 7, `${k} 윤곽 ${line.toFixed(2)}:1`);
  }
  assert.ok(AREA_OP.dark[1] < AREA_OP.dark[0] && AREA_OP.light[0] < AREA_OP.dark[0], '가까이·라이트는 옅게');
});

test('꼬리표의 단계 번호 글자: 다크 남색 꼬리표 위 4.5:1 이상, 라이트 흰 꼬리표 위 4.5:1 이상(--st-*-ink)', () => {
  const navy = over([16, 26, 68], hex(DARK_BG), 0.9);   // groundImage 다크 바탕 rgba(16,26,68,.9)
  for (const k of STAGE_KIND) assert.ok(ratio(hex(COLOR[k]), navy) >= 4.5, `다크 ${k}`);
  const light = tw.slice(tw.indexOf('\n:root {'), tw.indexOf('\n}\n', tw.indexOf('\n:root {')));
  const paper = over([255, 255, 255], hex(LIGHT_BG), 0.97);   // groundImage 라이트 바탕 rgba(255,255,255,.97)
  for (const k of STAGE_KIND) {
    const v = new RegExp(`--st-${k}-ink:\\s*(#[0-9A-Fa-f]{6})`).exec(light)[1];
    assert.ok(ratio(hex(v), paper) >= 4.5, `라이트 ${k} ${v} ${ratio(hex(v), paper).toFixed(2)}`);
  }
});

test('불투명도 식: 고른 상태는 단계색 채움(멀리 .6 → 가까이 .4, 입주 완료는 더 흐리게), 고르지 않은 상태는 지우지 않고 흐리게', () => {
  const d = ops(['분양중'], false), l = ops(['분양중'], true);
  const a = d.areaOp();
  assert.deepEqual(a.slice(0, 3), ['interpolate', ['linear'], ['zoom']]);
  assert.deepEqual(a[4][1], ['in', ['get', 'status'], ['literal', ['분양중']]]);
  assert.equal(a[4][2][1], 0.6); assert.equal(a[6][2][1], 0.4); assert.equal(a[4][3], d.AREA_FAINT);
  assert.equal(l.areaOp()[4][2][1], 0.45);
  assert.deepEqual(a[4][2][2], ['case', ['==', ['get', 'settle'], 'settled'], 0.45, 1]);
  assert.deepEqual(d.lineOp(), ['case', ['in', ['get', 'status'], ['literal', ['분양중']]], ['case', ['==', ['get', 'settle'], 'settled'], 0.45, 1], d.LINE_FAINT]);
  assert.ok(d.AREA_FAINT > 0 && d.AREA_FAINT < 0.15 && d.LINE_FAINT > 0 && d.LINE_FAINT < 0.5);
  assert.equal(d.privOp()[3], d.AREA_FAINT);
});

test('구역 층: 다섯 상태 면과 근사 위치 겹원 띠는 단계색 단색(kindExpr) + areaOp, 윤곽은 lineOp, 판정 테두리는 그대로', () => {
  for (const id of ['blk-sale', 'blk-build', 'blk-soon', 'blk-move', 'blk-plan', 'blk-approx']) assert.match(app, new RegExp(`add\\(\\{ id: '${id}', type: 'fill', [^\\n]*'fill-color': kindExpr\\(T\\.color\\), 'fill-opacity': areaOp\\(\\)`), id);
  assert.match(app, /add\(\{ id: 'blk-priv', [^\n]*'fill-color': T\.tone\.priv\[1\], 'fill-opacity': privOp\(\)/, '공공택지 민간은 회색 그대로');
  assert.match(app, /add\(\{ id: 'blk-line', [^\n]*'line-opacity': lineOp\(\)/);
  assert.match(app, /add\(\{ id: 'blk-line-plan', [^\n]*'line-dasharray': \[3, 2\], 'line-opacity': lineOp\(\)/, '①②는 점선 윤곽 유지');
  assert.match(app, /add\(\{ id: 'blk-judge', type: 'line', source: 'blocks', filter: JUDGED, paint: \{ 'line-color': judgeExpr\(T\.halo\), 'line-width': 7/);
  /* applyFilters: 면·윤곽은 SHOWN 으로 거르지 않고(흐리게) 불투명도 식을 다시 건다. 판정 테두리·점·이름표는 지금처럼 고른 상태만 */
  const af = block(/function applyFilters\(\) \{[\s\S]*?\n\}\n/);
  assert.doesNotMatch(af, /vis\(id, on\.length > 0\)/);
  assert.match(af, /map\.setPaintProperty\(id, 'fill-opacity', areaOp\(\)\)/);
  assert.match(af, /map\.setPaintProperty\('blk-priv', 'fill-opacity', privOp\(\)\)/);
  assert.match(af, /for \(const id of \['blk-line', 'blk-line-plan', 'blk-line-approx'\]\) if \(map\.getLayer\(id\)\) map\.setPaintProperty\(id, 'line-opacity', lineOp\(\)\)/);
  assert.match(af, /map\.setFilter\('blk-line', \['all', \.\.\.g, \['!', PLAN_KIND\], NOT_APPROX\]\)/);
  assert.match(af, /map\.setFilter\('blk-judge', \['all', f, JUDGED\]\)/);
  assert.match(af, /for \(const id of \['blk-dot', 'blk-label-lo', 'blk-badge', 'blk-badge-top', 'dong-label', 'dong-shadow', 'dong-line'\]\) if \(map\.getLayer\(id\)\) map\.setFilter\(id, f\)/);
  assert.doesNotMatch(af, /\['all', g,/, "빈 'all' 이 생기지 않게 펼쳐 쓴다");
});

test('색 종류는 현재 단계(stageNow): 구역 속성 kind·꼬리표 sn/sc, 화면 꼬리표 색·번호가 같은 값을 쓴다', () => {
  const bp = block(/function blockProps\(b\) \{[\s\S]*?\n\}\n/);
  assert.match(bp, /sn = stageNow\(b\)/);
  assert.match(bp, /kind: sn\.k, sn: sn\.now \? `\$\{sn\.now\[0\]\}\$\{sn\.now\[1\]\} ` : '', sc: COLOR\[sn\.k\] \|\| TH\(\)\.text/);
  const gt = block(/function groundText\(inline\) \{[\s\S]*?\n\}\n/);
  assert.match(gt, /return \['format', \['get', 'sn'\], \{ [^}]*'text-color': \['to-color', \['get', 'sc'\]\] \},\s*(\/\/[^\n]*)?\n\s*\['get', 'id'\]/, '맨 앞 단계 번호·이름을 단계색으로');
  const hc = block(/function renderHudContent\(\) \{[\s\S]*?\n\}\n/);
  assert.match(hc, /sn = stageNow\(b\), k = sn\.k;/); assert.match(hc, /el\.dataset\.k = k;/);
  assert.match(hc, /<i>\$\{esc\(ts\.main\)\}<\/i>/, "'③착공 · 정상'처럼 번호 + 단계 + 판정 글자(색만으로 구별하지 않는다, tagState — r3-map 2)");
  assert.match(block(/function renderHud\(\) \{[\s\S]*?\n\}\n/), /k = el\.dataset\.k \|\| kindOf\(b\), col = T\.color\[k\]/);
  /* 띠 색 = 구역 색: 띠 칸 색(stageColor)과 구역 색(kindExpr)이 같은 COLOR 를 같은 종류로 읽는다 */
  assert.match(app, /const stageColor = \(i\) => COLOR\[STAGE_KIND\[i\]\];/);
  assert.match(app, /function kindExpr\(colors\) \{ return \['match', \['get', 'kind'\], 'sale', colors\.sale, 'build', colors\.build, 'near', colors\.near, 'soon', colors\.soon, 'permit', colors\.permit, 'priv', colors\.priv, colors\.plan\]; \}/);
  assert.match(app, /THEME = \{[\s\S]*?color: COLOR,/);
});

test('6단계 띠 = 범례: 누르면 그 단계만, 같은 칸을 다시 누르면 전체(soloShown), 빈 칸은 눌리지 않고 흐린 색 칸', () => {
  const soloShown = Function(`${block(/function soloShown\(shown, sts, all\) \{[\s\S]*?\n\}\n/)}; return soloShown;`)();
  const ALL = new Set(['사업화', '계획', '건설 단계', '준공 임박', '분양중']);
  const s1 = soloShown(ALL, ['건설 단계', '준공 임박'], ALL);
  assert.deepEqual([...s1], ['건설 단계', '준공 임박'], '전체 → ③만');
  assert.deepEqual([...soloShown(s1, ['건설 단계', '준공 임박'], ALL)], [...ALL], '③만 → 다시 누르면 전체');
  assert.deepEqual([...soloShown(s1, ['분양중'], ALL)], ['분양중'], '③만 → ④ 누르면 ④만');
  assert.deepEqual([...soloShown(new Set(['분양중', '계획']), ['계획'], ALL)], ['계획'], '옵션에서 일부만 켠 상태 → 누른 단계만');
  const click = /\$\('#stageF'\)\.addEventListener\('click', \(e\) => \{[\s\S]*?\n  \}\);/.exec(app)[0];
  assert.match(click, /if \(!b \|\| b\.disabled\) return;/);
  assert.match(click, /soloShown\(SHOWN, b\.dataset\.status\.split\('\|'\), ALL_ST\)/);
  assert.match(click, /syncChips\(\); applyFilters\(\);/);
  assert.match(app, /const SOLO_TIP = ' · 누르면 이 단계 구역만 강조, 다시 누르면 전체';/, '설명은 툴팁');
  assert.match(css, /\.sf:disabled \.sf-sw\{background:transparent;box-shadow:inset 0 0 0 1\.5px var\(--c\);opacity:\.6\}/);
  assert.match(css, /\.sf\[aria-pressed="false"\]\{opacity:\.55\}/, '고르지 않은 칸은 흐리게');
  /* 범례 기호도 지도와 같은 단색(무늬 없음) */
  assert.match(css, /\.sw\.build,\.sw\.near\{background:var\(--build\)\}/);
  assert.doesNotMatch(css, /\.sw\.build\{[^}]*repeating-linear-gradient/);
});

/* ---- 요구 4: 카드 넘침 ---- */
const fitSrc = block(/function fitCard\(\) \{[\s\S]*?\n\}\n/);
const consts = block(/const CARD_AVOID = [^\n]*\nconst CARD_NOTES = [^\n]*\nconst CARD_MIN_H = [^\n]*\n/);
assert.match(consts, /const CARD_NOTES = \['#locNote', '#pvBanner'\];/);
const mkFit = Function('popup', 'map', '$', 'cardAvoid', 'innerWidth', `${consts}${fitSrc}; return fitCard;`);
/* 지도 상자 1280×600(1280×720 화면에서 머리 줄을 뺀 높이 근사), 왼쪽 위 도구 줄, 오른쪽 위 시점 묶음, 아래 입력줄·범례 띠 */
function run({ anchor, ax, ay, w = 276, h = 520, chrome = 12, avoid = null, boxes = {} }) {
  const M = { left: 0, top: 120, right: 1280, bottom: 720, width: 1280, height: 600 };
  const R = (l, t, r, b) => ({ left: l, top: t, right: r, bottom: b, width: r - l, height: b - t });
  const B = Object.assign({ '.rctl': R(1220, 132, 1268, 330), '.topbar': R(12, 132, 260, 170), '#cmd': R(360, 600, 920, 650), '#botbar': R(0, 680, 1280, 720) }, boxes);
  const pc = { style: { maxHeight: '' }, get offsetHeight() { return cur().height - chrome; } };
  const cur = () => {
    const mh = parseFloat(pc.style.maxHeight), hh = Number.isFinite(mh) ? Math.min(h, mh + chrome) : h;
    const left = anchor === 'top' || anchor === 'bottom' ? ax - w / 2 : anchor === 'left' ? ax : ax - w;
    const top = anchor === 'top' ? ay : anchor === 'bottom' ? ay - hh : ay - hh / 2;
    return R(left, top, left + w, top + hh);
  };
  let off = [0, 0];
  const popup = { getElement: () => ({ querySelector: () => pc, getBoundingClientRect: cur }), setOffset: (o) => { off = o; } };
  const map = { getContainer: () => ({ getBoundingClientRect: () => M }) };
  const $ = (s) => (B[s] ? { hidden: false, offsetParent: {}, getBoundingClientRect: () => B[s] } : null);
  mkFit(popup, map, $, avoid, 1280)();
  const r = cur();
  return { M, B, left: r.left + off[0], right: r.right + off[0], top: r.top + off[1], bottom: r.bottom + off[1], maxH: pc.style.maxHeight };
}

test('카드 가로: 위·아래에 붙은 카드가 화면 가장자리에 걸친 대상 가운데에 서도 지도 상자 안으로 들어온다', () => {
  const L = run({ anchor: 'bottom', ax: 40, ay: 560, h: 300, avoid: { anchor: 'bottom', x0: -400, x1: 480, top: 568, bottom: 700 } });
  assert.ok(L.left >= L.M.left + 8, `왼쪽 ${L.left}`);
  const Rr = run({ anchor: 'top', ax: 1250, ay: 200, h: 300, avoid: { anchor: 'top', x0: 1000, x1: 1500, top: 120, bottom: 192 } });
  assert.ok(Rr.right <= Rr.M.right - 8, `오른쪽 ${Rr.right}`);
});

test('카드 세로: 큰 대상이라 그 쪽 공간이 거의 없으면 대상 쪽 제한을 풀고, 상자(도구 줄·입력줄·범례 띠) 사이 높이로 줄여 화면 안에 둔다', () => {
  /* 가까이 본 큰 단지: 대상 위가 지도 맨 위라 'bottom' 쪽 남은 높이가 없다 — 예전엔 160px 로 짓눌려 머리·두세 줄만 보이고 나머지는 스크롤이었다 */
  const r = run({ anchor: 'bottom', ax: 640, ay: 118, h: 520, avoid: { anchor: 'bottom', x0: 200, x1: 1100, top: 118, bottom: 700 } });
  assert.ok(r.top >= r.M.top + 8, `위 ${r.top}`);
  assert.ok(r.bottom <= r.B['#cmd'].top - 8, `아래 ${r.bottom}(입력줄 위)`);
  assert.ok(r.bottom - r.top >= 400, `쓸 수 있는 높이 ${r.bottom - r.top}`);
  assert.ok(r.maxH, '그래도 길면 높이를 줄인다(안쪽 스크롤)');
  /* 보통 경우(옆에 자리): 그대로 */
  const n = run({ anchor: 'left', ax: 700, ay: 420, h: 300, avoid: { anchor: 'left', x0: 500, x1: 690, top: 300, bottom: 500 } });
  assert.equal(n.maxH, ''); assert.equal(n.left, 700); assert.equal(n.top, 270);
});

test('카드는 지도 위쪽 안내 띠(#locNote) 밑으로 들어가지 않는다, 긴 이름·주소는 칸 안에서 줄바꿈', () => {
  const r = run({ anchor: 'left', ax: 500, ay: 300, h: 300, boxes: { '#locNote': { left: 430, top: 132, right: 850, bottom: 176, width: 420, height: 44 } } });
  assert.ok(r.top >= 176 + 8, `위 ${r.top}`);
  assert.match(css, /\.pc\{[^}]*word-break:keep-all;overflow-wrap:anywhere;/, '띄어 쓰지 않은 긴 이름도 카드 폭 안에서 줄을 바꾼다');
  assert.match(css, /\.pc-h \.pc-t\{[^}]*-webkit-line-clamp:2/, '사업 이름 두 줄 말줄임(원문은 title)');
  assert.match(app, /<b class="pc-t" title="\$\{esc\(\[nm, about\]/);
});
