'use strict';
// 지도 상세 2차 개선(2026-10-15 독립 디자인 평가 27/40의 지도 지적 + 메인 브라우저 확인 1건):
//  1 P0 같은 사업, 다른 값 — 공정률은 원장(HOME 보고, 서랍과 같은 값) 정본 + 지도 원천이 다르면 작은 표지, 같은 종류 날짜는 카드에 한 번, '예정일 지남(1개월 미만)', 점 날짜
//  2 꼬리표가 주소 입력줄·범례 띠·안내 띠와 겹치지 않는다(카드와 같은 safeRect)
//  3 6단계 띠 칸마다 '지도 밖 n호', 누르면 위치 미확보 목록(#lostPop), 지도에 없는 단계 칸도 눌린다(값 0 인 단계만 비활성)
//  4 기반시설 겹침은 옵션 모두 켬 그대로, 반경 원·통학구역·입주 전 점검 부지·연결선만 옅고 가늘게(단계색 구역이 먼저)
//  5 상세 모드 h1·document.title = 지역('고양시 덕양구 공급 지도'), 숨은 개요 h1 은 걷는다
//  6 1차(단계색 채움·soloShown·카드 안전 영역) 회귀 없음
//  7 대표점 사업은 첫 화면 확대에서 지름 44px 이상 단계색 표지(blk-pin)
// R2_ROOT 로 다른 작업 트리(고치기 전 파일)를 가리켜 실패를 확인할 수 있다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.env.R2_ROOT || path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const app = read('assets/js/app.js'), css = read('assets/css/app.css'), page = read('app/(map)/map/page.tsx'), island = read('components/MapIsland.tsx');
const R = require(path.join(ROOT, 'assets/js/region.js'));
const grab = (re, src = app) => { const m = re.exec(src); assert.ok(m, String(re)); return m[0]; };

/* app.js 의 작은 함수들을 떼어 평가한다 */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const helpers = () => {
  const src = [grab(/const pctTxt = [^\n]+\n/), grab(/const dotDate = [^\n]+\n/), grab(/const ymDot = [^\n]+\n/),
    grab(/const HOME_PROG = [\s\S]*?\nfunction progressRow\([\s\S]*?\n\}\n/), grab(/const dueCell = [^\n]+\n[\s\S]*?\nfunction dueDedup\([\s\S]*?\n\}\n/)].join('');
  return (homeProgress, sources = []) => Function('window', 'REG', 'esc', `${src}; return { progOf, progCell, progressRow, dueDedup, dueCell };`.replace('function progressRow', 'const COLOR = {}; const sparkline = () => ""; function progressRow'))({ HOME_PROGRESS: homeProgress }, { sources }, esc);
};

test('1 P0 공정률: 원장 값(93.12%, 2026.07.01 보고)이 정본, 지도 원천 100%는 작은 표지(근거는 title), 같으면 표지 없음, 원장 없으면 원천 값', () => {
  const H = helpers()({ 'PRJ-28245-0055': ['2026-07-01', 93.12] }, [{ id: 'lh-cwstt', label: 'LH 공사현황' }]);
  const b = { id: 'A2', ledger: { id: 'PRJ-28245-0055' }, progress: { rate: 100, asOf: '2026-10-01', history: [], source: 'lh-cwstt' } };
  const p = H.progOf(b);
  assert.deepEqual([p.rate, p.asOf, p.by], [93.12, '2026-07-01', 'ledger']);
  const cell = H.progCell(p);
  assert.match(cell, />93\.12%<\/span> <small>2026\.07\.01 보고<\/small>/);
  assert.match(cell, /<b class="jd alt" title="LH 공사현황 자료의 공정률은 100%\(2026\.10\.01 기준\)로, 원장 보고 값 93\.12%\(2026\.07\.01 보고\)와 다릅니다\. 공정률은 원장 기준입니다\.">원천 값 다름: 100%\(상세 3D\)<\/b>/);
  assert.match(H.progressRow(b, 'build'), /<b>93\.12%<\/b>/, '사이드바 목록도 같은 값');
  assert.equal(H.progOf({ ...b, progress: { ...b.progress, rate: 93.12 } }).alt, null);
  const m = H.progOf({ id: 'x', progress: { rate: 41.5, asOf: '2026-09-01', history: [] } });
  assert.deepEqual([m.rate, m.by], [41.5, 'map']);
  assert.doesNotMatch(H.progCell(m), /보고|원천 값 다름/);
  /* 지도 페이지가 서랍과 같은 project-detail.json 의 마지막 보고를 넘긴다 */
  assert.match(page, /import detailJson from '\.\.\/\.\.\/\.\.\/data\/board\/project-detail\.json';/);
  assert.match(page, /homeProgress=\{homeProgress\(detailJson as never\)\}/);
  assert.doesNotMatch(page, /export function homeProgress/, 'page 파일은 기본 내보내기 밖의 내보내기를 두지 않는다(Next)');
  assert.match(island, /w\.HOME_PROGRESS = homeProgress;/);
  const ts = require(path.join(ROOT, 'node_modules/typescript'));
  const fn = ts.transpileModule(grab(/function homeProgress\([\s\S]*?\n\}\n/, page), { compilerOptions: { target: 'es2020' } }).outputText;
  const homeProgress = Function(`${fn}; return homeProgress;`)();
  const t = homeProgress(JSON.parse(read('data/board/project-detail.json')));
  assert.deepEqual(t['PRJ-28245-0055'], ['2026-07-01', 93.12]);
  assert.deepEqual(homeProgress({ projects: { a: { progress: [['2026-07-01', 50], ['2026-03-01', 20]] }, b: { progress: [] } } }), { a: ['2026-07-01', 50] });
  /* 카드·동 카드가 같은 함수를 쓴다(옛 b.progress 직접 표시 없음) */
  const bp = grab(/function blockPopup\([\s\S]*?\n\}\n/);
  assert.match(bp, /pg \? \['공정률', progCell\(pg\), pg\.by === 'ledger'\] : null/);
  assert.doesNotMatch(app, /\['(단지 )?공정률', `<span title="\$\{esc\(dotDate\(b\.progress\.asOf\)\)\} 기준">/);
});

test("1 P0 날짜: 같은 종류(준공·입주) 날짜는 카드에 한 번 — 같은 달이면 칸을 빼고, 다르면 현재 예정 뒤 '원천 날짜 다름(상세 3D …)'", () => {
  const H = helpers()({});
  const same = H.dueDedup({ moveIn: '준공 예정 2026.10' }, '준공 예정 2026.10.12', null);
  assert.deepEqual(same, { cell: null, mark: '' }, "성남신촌: '준공 예정 2026.10.12'와 '준공 예정 2026.10' 중 하나만");
  const diff = H.dueDedup({ moveIn: '준공 예정 2026.11' }, '준공 예정 2026.10.12', null);
  assert.equal(diff.cell, null); assert.match(diff.mark, />원천 날짜 다름\(상세 3D 2026\.11\)<\/b>/);
  assert.deepEqual(H.dueDedup({ moveIn: '준공 예정 2026.10' }, '준공 예정 2026.10.11', { source: 'LH', planned: '2026-10-31' }), { cell: null, mark: '' });
  assert.deepEqual(H.dueDedup({ moveIn: '준공 예정 2026.11' }, '준공 예정 2026.10.11', { source: 'LH', planned: '2026-11-30' }).mark, '', '원천 날짜 다름(dateAlt)이 이미 그 달을 말한다');
  assert.deepEqual(H.dueDedup({ moveIn: '2027-03' }, '준공 예정 2026.10', null).cell, ['입주', '2027.03'], '종류가 다르면 칸을 남긴다(점 날짜)');
  assert.deepEqual(H.dueDedup({ moveIn: '준공 예정 2026.10' }, '', null).cell, ['준공 예정', '2026.10'], '원장 현재 예정이 없으면 칸 그대로');
  const bp = grab(/function blockPopup\([\s\S]*?\n\}\n/);
  assert.match(bp, /dd = dueDedup\(b, cur, alt\)/);
  assert.match(bp, /\['층수', floorLine\(b\)\], dd\.cell,/);
  assert.doesNotMatch(bp, /\['층수', floorLine\(b\)\], dueCell\(b\)/);
});

test("1 P0 상태 문구: '정상 · 예정일 지남(1개월 미만)', '경과 0개월'은 쓰지 않는다, 날짜는 점 형식", () => {
  const t = R.ledgerTexts({ cls: 'ok', referenceDate: '2026-10-13', overdue: { eventType: 'COMPLETION', planned: '2026-10-11', months: 0 } });
  assert.equal(`${t.cls} · ${R.statusReason(t)}`, '정상 · 예정일 지남(1개월 미만)');
  assert.equal(t.due, '준공 예정 2026.10.11');
  assert.equal(R.statusReason({ cls: '정상', pastDue: true, dueMonths: 2 }), '예정일 지남(2개월)');
  assert.doesNotMatch(grab(/function statusReason\(t\) \{[\s\S]*?\n  \}/, read('assets/js/region.js')), /경과/);
  /* 화면에 남던 줄표 날짜(title 포함)를 점으로 */
  assert.match(app, /title="\$\{esc\(`\$\{o\.kind\} 예정 \$\{dotDate\(o\.plannedAt\)\}/);
  assert.match(app, /t\.lateTitle \? ` title="\$\{esc\(dotDate\(t\.lateTitle\)\)\}"`/);
  assert.match(app, /\$\{esc\(dotDate\(bs\[0\]\.moveIn\)\)\} 입주·준공 예정/);
});

test('2 꼬리표: 카드와 같은 안전 영역(safeRect) 밖·입력줄·범례 띠·안내 띠와 겹치는 자리에는 서지 않는다(못 피하면 표시선만)', () => {
  const hud = grab(/function renderHud\(\) \{[\s\S]*?\n\}\n/);
  assert.match(hud, /const sr = safeRect\(\), SL = Math\.max\(4, sr\.left - mr\.left\), ST = Math\.max\(4, sr\.top - mr\.top\), SR = Math\.min\(W - 4, sr\.right - mr\.left\), SB = Math\.min\(H - 4, sr\.bottom - mr\.top\);/);
  assert.match(hud, /const inside = \(r\) => r\.l >= SL && r\.t >= ST && r\.r <= SR && r\.b <= SB;/);
  assert.match(hud, /if \(bestC > 0\) \{[^\n]*\n\s+el\.hidden = true;/);
  const ex = /const HUD_EXCL = '([^']+)'/.exec(app)[1];
  for (const s of ['#cmd:not([hidden])', '#botbar', '#locNote:not([hidden])', '#pvBanner:not([hidden])']) assert.ok(ex.includes(s), s);
  /* safeRect 는 입력줄·범례 띠를 아래 경계로 쓴다(카드·위치 미확보 표지와 같은 정의) */
  assert.match(grab(/function safeRect\(\) \{[\s\S]*?\n\}/), /\['#cmd', '#botbar'\]/);
  /* 금천 1440: 꼬리표 y751–803 이 입력줄 y782–816 과 겹쳤다 → 안전 영역 아래 경계(입력줄 위 8px)를 넘는 자리는 막힌 자리 */
  const SBx = 782 - 8, tag = { t: 751, b: 803 };
  assert.ok(!(tag.b <= SBx), '그 자리는 inside 가 아니다');
});

test("3 6단계 띠: 칸마다 '지도 밖 n호'(툴팁·누르면 #lostPop), 지도에 그린 사업이 없어도 위치 미확보가 있으면 눌리는 목록 단추", () => {
  const wt = grab(/\(function wireTop\(\) \{[\s\S]*?\n\}\)\(\);/);
  assert.match(wt, /const lostTxt = h\.lostN \? `지도 밖 \$\{h\.lostU \? `\$\{fmt\(h\.lostU\)\}호` : `\$\{h\.lostN\}건`\}` : '';/);
  assert.match(wt, /<span class="sf-lost" title="\$\{esc\(`위치 미확보 \$\{h\.lostN\}건/);
  assert.match(wt, /if \(!bs\.length && h\.lostN\) return `<button type="button" class="sf lostonly" data-status="" data-lost="1"[^`]*aria-controls="lostPop"/);
  assert.doesNotMatch(wt.slice(wt.indexOf('class="sf lostonly"'), wt.indexOf('class="sf lostonly"') + 300), / disabled/);
  assert.match(wt, /if \(b\.dataset\.lost \|\| e\.target\.closest\('\.sf-lost'\)\) \{ toggleLost\(b\); return; \}/);
  assert.match(app, /const lostTriggers = \(\) => \[\.\.\.document\.querySelectorAll\('\.lostpin, \.hs-lost, #stageF \[data-lost\]'\)\];/);
  assert.match(app, /!e\.target\.closest\('#lostPop, \.lostpin, \.hs-lost, #stageF \[data-lost\], #stageF \.sf-lost'\)/);
  assert.match(app, /#stageF button\[data-status\]:not\(:disabled\):not\(\[data-lost\]\)/, '목록 단추 칸은 강조 토글(aria-pressed)이 아니다');
  assert.match(css, /\.sf-lost\{[^}]*color:var\(--mute\)[^}]*cursor:pointer\}/);
  assert.match(css, /\.sf\.lostonly \.sf-sw\{background:transparent;/);
  /* homeTally 가 칸마다 지도 밖 몫을 센다(덕양 ① 2,570호 = 모두 위치 미확보) */
  const tl = R.homeTally([{ projects: [{ id: 'P1', stage: '01', units: 2570 }, { id: 'P2', stage: '04', units: 300 }] }], ['P1']);
  assert.deepEqual([tl.st[0].lostN, tl.st[0].lostU, tl.st[2].lostN], [1, 2570, 0]);
});

test('4 기반시설 겹침: 옵션은 모두 켬 그대로(2026-10-10 사용자 요청 우선), 반경 원·통학구역·입주 전 점검 부지·연결선만 옅고 가늘게(선 .45~.55·1.2px 이하, 채움 .03 이하), 점 표지는 그대로', () => {
  for (const k of ['ring', 'infra', 'zone']) assert.match(app, new RegExp(`let ${k}On = q\\.get\\('${k}'\\) !== '0';`), k);
  assert.match(app, /ctxOn = true; ringOn = true; infraOn = true; zoneOn = true;/);
  const OVL = Function(`return ${/const OVL = (\{[^}]*\})/.exec(app)[1]}`)();
  assert.ok(OVL.line >= 0.45 && OVL.line <= 0.55, `선 ${OVL.line}`); assert.ok(OVL.width <= 1.2, `굵기 ${OVL.width}`); assert.ok(OVL.fill <= 0.03, `채움 ${OVL.fill}`);
  const layer = (id) => grab(new RegExp(`add\\(\\{ id: '${id}', [^\\n]*`));
  for (const id of ['infra-ring-line', 'infra-zone-line', 'infra-site-line', 'infra-site-dash', 'infra-link-zone', 'ctx-ring']) {
    const l = layer(id); assert.match(l, /'line-width': OVL\.width/, id); assert.match(l, /'line-opacity': OVL\.line/, id);
  }
  assert.match(layer('infra-link-new'), /'line-width': OVL\.width, [^\n]*'line-opacity': \['case', warn, OVL\.line \+ 0\.05, OVL\.line\]/, '주의 연결선만 조금 진하게(.55)');
  for (const id of ['infra-ring-fill', 'infra-zone-fill', 'infra-site-fill']) {
    const l = layer(id), ops = [...l.slice(l.indexOf("'fill-opacity'")).matchAll(/OVL\.fill(?: \/ 2)?|\b0\.\d+/g)].map((m) => m[0]);
    assert.ok(ops.length && ops.every((o) => /^OVL\.fill/.test(o)), `${id}: ${ops}`);
  }
  /* 학교·역 점 표지는 그대로 */
  assert.match(app, /add\(\{ id: 'ctx-station', type: 'circle', [^\n]*'circle-radius': 7,/);
  assert.match(app, /add\(\{ id: 'infra-school', type: 'symbol', [^\n]*'icon-size': ICON_SZ/);
});

test("5 상세 모드 제목: h1·document.title 은 지역('고양시 덕양구 공급 지도'), 숨은 개요 h1 은 걷는다", () => {
  const raw = { index: { regions: [] }, entry: { visibility: 'public' }, region: { slug: '', name: '경기도 고양시 덕양구', title: '경기도 고양시 덕양구', sources: [], zones: [] }, projects: { projects: [] }, buildings: { type: 'FeatureCollection', meta: { factor: {} }, features: [] }, context: null, infra: null };
  const t = R.adaptBundle(raw).texts;
  assert.equal(t.headTitle, '고양시 덕양구 공급 지도');
  assert.equal(t.documentTitle, '고양시 덕양구 공급 지도 · 주택파동');
  const h1 = { textContent: '공급 현황' }, ov = { parentNode: { removed: null, removeChild(x) { this.removed = x; } } };
  const doc = { title: '', querySelector: (s) => (s === '#phead h1' ? h1 : null), getElementById: (id) => (id === 'ov' ? ov : null) };
  R.applyTexts(doc, { texts: t });
  assert.equal(doc.title, '고양시 덕양구 공급 지도 · 주택파동');
  assert.equal(h1.textContent, '고양시 덕양구 공급 지도');
  assert.equal(ov.parentNode.removed, ov, "개요 마크업(h1 '수도권 공급 개요')을 걷는다");
});

test('6 1차 회귀: 단계색 채움(다크 .6→.4, 라이트 .45→.3), soloShown, 카드 안전 영역', () => {
  assert.match(app, /const AREA_OP = \{ dark: \[0\.6, 0\.4\], light: \[0\.45, 0\.3\] \}/);
  const solo = Function(`${grab(/function soloShown\([\s\S]*?\n\}\n/)}; return soloShown;`)();
  const all = new Set(['계획', '사업화', '건설 단계', '준공 임박']);
  assert.deepEqual([...solo(new Set(all), ['건설 단계', '준공 임박'], all)], ['건설 단계', '준공 임박']);
  assert.deepEqual([...solo(new Set(['건설 단계', '준공 임박']), ['건설 단계', '준공 임박'], all)], [...all]);
  const sc = grab(/function showCard\([\s\S]*?\n\}\n/);
  assert.match(sc, /sr = safeRect\(\)/);
  assert.match(app, /const CARD_NOTES = \['#locNote', '#pvBanner'\];/);
  assert.match(css, /\.pc\{[^}]*overflow-wrap:anywhere/);
});

test('7 대표점 사업: 첫 화면 확대에서 지름 44px 이상 단계색 원(흰 테두리, 근사 위치는 옅은 속 + 단계색 테두리), 팔각형이 커지면 사라짐, 블록 다각형 사업은 제외', () => {
  const PIN_R = Number(/const PIN_R = (\d+)/.exec(app)[1]), PIN_Z = JSON.parse(/PIN_Z = (\[[\d., ]+\])/.exec(app)[1]);
  assert.ok(PIN_R * 2 >= 44, `지름 ${PIN_R * 2}px`);
  /* 사라지기 시작하는 확대에서 대표점 팔각형(반지름 35 m, 위도 37.6°)이 이미 표지 크기에 가깝다(그 전엔 표지가 덮는다) */
  const px = (m, z) => m / (40075016.686 * Math.cos(37.6 * Math.PI / 180) / (512 * 2 ** z));
  assert.ok(px(35, PIN_Z[0]) >= PIN_R * 0.9, `${px(35, PIN_Z[0]).toFixed(1)}px`);
  assert.ok(px(35, 14.3) * 2 < 44, '첫 화면 확대(14.3)에서는 팔각형만으로 44px 가 안 된다');
  const layer = grab(/add\(\{ id: 'blk-pin', [\s\S]*?\} \}\);/);
  assert.match(layer, /source: 'block-pts', maxzoom: PIN_Z\[1\], filter: \['==', \['get', 'pt'\], true\]/);
  assert.match(layer, /'circle-radius': PIN_R, 'circle-color': kindExpr\(T\.color\)/);
  assert.match(layer, /'#FFFFFF'\], 'circle-stroke-width'/);
  assert.match(app, /pt: b\.outlineTier === 'point'/);
  assert.match(app, /const BLK_FILLS = \[[^\]]*'blk-pin'\]/, '누르면 사업 카드·첫 연출 ④에 함께');
  assert.match(grab(/function applyFilters\(\) \{[\s\S]*?\n\}\n/), /map\.setPaintProperty\('blk-pin', 'circle-opacity', pinOp\(0\.35\)\)/, '띠 강조(SHOWN)에 따라 흐리게');
  const op = Function('shownExpr', 'AREA_FAINT', 'PIN_Z', `${grab(/const pinOp = [^\n]+\n/)}; return pinOp;`)(() => ['x'], 0.08, PIN_Z);
  assert.deepEqual(op()[4], ['case', ['x'], 0.9, 0.16]); assert.equal(op()[3], PIN_Z[0]);
  assert.equal(op()[6], 0);
});
