'use strict';
// 지도 상세 3차 개선(2026-10-16 독립 평가 27/40 → 목표 36/40의 지도 지적):
//  1 P1 지연 확정 사업(검단구 인천검단 35·AA13-1)이 위치 미확보라 지도에 안 보인다
//    (a) 브라우저가 받는 자료(home-map·home-lite)에 그 사업의 지구 경계·대표점이 없어 근사 표지는 만들 수 없다(자료를 새로 만들지 않는다)
//    (b) ?project= 로 연 위치 미확보 사업은 위치 미확보 목록(#lostPop)을 저절로 열고 그 사업을 강조·초점, 6단계 띠·묶음 표지에 '지연 n' 빨강 표지
//  2 P1 같은 사업 상태 표기 충돌: 꼬리표는 단계 + 판정 상태('③착공 · 정상'), 예정일 지남은 카드와 같은 '예정일 지남(1개월 미만)' 짧은 표지,
//    카드의 원천 날짜 다름은 같은 달이면 일 단위('LH 2026.10.31')
//  3 카드 '사업 정보 보기 ›' 링크는 머리(제목 줄) 바로 아래 — 1280 에서 카드 안 스크롤 아래로 가려졌다
//  4 띠·카드 툴팁에 '공식 01~06' 번호를 쓰지 않는다(①~⑥ 과 어긋남) — 단계 정의만 짧게
//  5 하단 범례 띠 요약에는 단계색 견본을 두지 않는다(머리 줄 띠가 단계 범례) — 비단계 표지만, '자세히' 목록은 그대로
//  6 첫 화면: 지역 기본 시점보다 사업 구역이 크게 보이게 첫 맞춤(fitAll, 여백 축소) — 멀어지게는 하지 않는다
//  7 준공 임박 사업은 꼬리표에 '준공 임박' 짧은 표지(단계색은 ③ 그대로)
// R3_ROOT 로 다른 작업 트리(고치기 전 파일)를 가리켜 실패를 확인할 수 있다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.env.R3_ROOT || path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const app = read('assets/js/app.js'), css = read('assets/css/app.css');
const R = require(path.join(ROOT, 'assets/js/region.js'));
const S = require(path.join(ROOT, 'assets/js/settle.js'));
const grab = (re, src = app) => { const m = re.exec(src); assert.ok(m, String(re)); return m[0]; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* app.js 앞머리(상태 낱말·6단계·stageNow·tagState)를 떼어 평가한다 */
const head = () => {
  const src = grab(/const STATUS_TXT = [\s\S]*?\nfunction tagState\(b\) \{[\s\S]*?\n\}\n/);
  const doc = { documentElement: { hasAttribute: () => false, classList: { contains: () => false } } };
  return Function('window', 'document', 'BLOCKS', 'getComputedStyle', `${src}; return { STAGES6, stageNow, tagState, stTxt };`)({ RegionLoader: R, Settle: S }, doc, [], () => ({ getPropertyValue: () => '' }));
};
const ledger = (o) => ({ id: 'PRJ-X', issued: true, stage: '04', cls: 'ok', referenceDate: '2026-10-13', month: '2026-10', ...o });

test('1(a) 근사 불가 확인: 검단구 지연 2건(인천검단 35·AA13-1)은 home-map 에 위치·법정동이 없고, home-lite 에 지구 경계·블록이 없다', () => {
  const hm = JSON.parse(read('public/assets/home-map/28290.json'));
  for (const id of ['PRJ-28290-0056', 'PRJ-28290-0058']) {
    const p = hm.projects.find((x) => x.id === id);
    /* 2026-10-20 HOME 판: AA13-1(0058)은 새 LH 준공예정 별칭(LH 블록 매핑)으로 법정동 2829010400 이 생겼다 — 위치(loc)는 여전히 없다.
       같은 현장 병합(2026-10-20 사용자 결정): 0056 이 AA13-2(0065)의 LH 별칭·법정동을 넘겨받았다 */
    assert.equal(p.cls, 'delay', id); assert.equal(p.loc, null, id); assert.equal(p.bjd, '2829010400', id);
    assert.deepEqual([p.bundles, p.pnus, p.pks], [[], [], []], id);
  }
  const man = JSON.parse(read('public/assets/home-lite/manifest.json'))['28290'];
  const lite = JSON.parse(read(`public/assets/home-lite/28290.${man.h}.json`));
  assert.deepEqual([lite.districts, lite.blocks], [[], []], '지구 경계·블록이 없다');
  assert.ok(lite.projects.every(([id]) => !['PRJ-28290-0056', 'PRJ-28290-0058'].includes(id)), '경량 번들 사업에도 없다');
});

test('1(b) ?project= 로 연 위치 미확보 사업: 목록(#lostPop)을 저절로 열고 그 사업 줄을 강조(aria-current)·초점, 지연이면 묶음 표지 빨강', () => {
  assert.match(app, /const CUR_LOST = RES && RES\.lost \? LOST\.find\(\(x\) => x\.id === RES\.lost\.id\) \|\| null : null;/);
  /* 목록 줄: 연 사업은 class="cur" aria-current="true" */
  const rows = grab(/const LIST_RANK = [^\n]*\nconst ledgerRows = [\s\S]*?\.join\(''\);\n/);
  const run = (cur) => Function('esc', 'fmt', 'CLS_WORD', 'stageOfCode', 'stName', 'projHref', 'CUR_LOST', `${rows}; return ledgerRows;`)(esc, String, { delay: '지연' }, () => null, () => '', (id) => `/projects?id=${id}`, cur);
  const xs = [{ id: 'PRJ-28290-0056', name: '인천검단 35', cls: 'delay', stage: '04', units: 964 }, { id: 'PRJ-28290-0058', name: '인천검단 AA13-1', cls: 'delay', stage: '04', units: 702 }];
  const html = run({ id: 'PRJ-28290-0058' })(xs);
  assert.equal((html.match(/aria-current="true"/g) || []).length, 1);
  assert.match(html, /<li class="cur" aria-current="true"><span class="lp-n"><b title="인천검단 AA13-1">/);
  assert.doesNotMatch(run(null)(xs), /aria-current/);
  /* 저절로 열기: 카드가 없으면 연 사업 줄에 초점 */
  assert.match(app, /if \(CUR_LOST\) whenRevealed\(\(\) => \{ if \(!popup\) setLost\(true, pin, 'cur'\); \}\);/);
  const sl = grab(/function setLost\([\s\S]*?\n\}/);
  assert.match(sl, /const first = pop\.querySelector\(focus === 'cur' \? 'li\[aria-current="true"\] a' : 'a'\);/);
  assert.match(sl, /if \(focus === 'cur'\) first\.closest\('li'\)\.scrollIntoView\(\{ block: 'nearest' \}\);/);
  assert.match(app, /pin\.classList\.toggle\('late', \(LATE \|\| !!\(CUR_LOST && CUR_LOST\.cls === 'delay'\)\) && sm\.delay > 0\);/);
  assert.match(css, /\.lostpop li\.cur\{[^}]*box-shadow:inset 0 0 0 var\(--border-w\) var\(--acc\)/);
});

test("1(b) 6단계 띠: 위치 미확보 몫에 지연이 있으면 '지연 n' 빨강 표지(그 칸의 단계로 센다, 단계 모르면 ①)", () => {
  const ll = grab(/const lostLate = [^\n]*\n/);
  const f = Function('LOST', 'BOARD_OF_STAGE', `${ll}; return lostLate;`);
  const B = { '01': 0, '02': 0, '03': 1, '04': 2, '05': 3, '06': 4 };
  const lostLate = f([{ cls: 'delay', stage: '04' }, { cls: 'caution', stage: '04' }, { cls: 'delay', stage: '04' }, { cls: 'delay', stage: null }], B);
  assert.deepEqual([0, 1, 2, 3].map(lostLate), [1, 0, 2, 0]);
  const wt = grab(/\(function wireTop\(\) \{[\s\S]*?\n\}\)\(\);/);
  assert.match(wt, /const ld = h\.lostN \? lostLate\(i\) : 0;/);
  assert.match(wt, /\$\{lostTxt\}\$\{ld \? ` <b class="sf-late">지연 \$\{ld\}<\/b>` : ''\}<\/span>/);
  const { mapCss } = require('./map-tokens.cjs');   // 색 값은 app/globals.css 의 --map-bad-ink(라이트·다크), app.css 는 가리키기만 한다
  assert.match(mapCss('dark'), /\.sf-late\{display:inline-block;[^}]*color:#FFAFBF[^}]*\}/);
  assert.match(mapCss('light'), /\.sf-late\{display:inline-block;[^}]*color:#8E2C3C[^}]*\}/);
});

test("2 꼬리표 = 단계 + 판정 상태('③착공 · 정상'), 예정일 지남은 카드 이유 줄과 같은 '예정일 지남(1개월 미만)' 짧은 표지", () => {
  const H = head();
  /* 계양 A2: 준공 임박, 원장 04·정상, 준공 예정 2026-10-11 < 기준일 2026-10-13 */
  const a2 = { id: 'A2', status: '준공 임박', ledger: ledger({ next: { eventType: 'COMPLETION', planned: '2026-10-11' } }) };
  const t = H.tagState(a2), lt = R.ledgerTexts(a2.ledger);
  assert.deepEqual(t, { main: '③착공 · 정상', mark: '예정일 지남(1개월 미만)' });
  assert.equal(t.mark, R.statusReason(lt), '카드 상태 칸의 이유 줄과 같은 글자');
  assert.equal(lt.cls, '정상', '카드 상태 칩과 같은 판정');
  assert.deepEqual(H.tagState({ id: 'A9', status: '건설 단계', ledger: ledger({ cls: 'delay', overdue: { eventType: 'COMPLETION', planned: '2026-01-01', months: 9 } }) }), { main: '③착공 · 지연', mark: '' });
  assert.deepEqual(H.tagState({ id: 'B', status: '건설 단계' }), { main: '③착공', mark: '' }, '원장 판정이 없으면 단계만');
  assert.deepEqual(H.tagState({ id: 'C', status: '입주 단계', settle: 'moving' }), { main: '⑤입주 진행', mark: '' });
  const hc = grab(/function renderHudContent\(\) \{[\s\S]*?\n\}\n/);
  assert.match(hc, /ts = tagState\(b\)/);
  /* 단계는 늘, ' · 판정'은 정책담당자 관점에만(ov-aud-admin, 2026-10-18) */
  assert.match(hc, /<i>\$\{esc\(ts\.main\.split\(' · '\)\[0\]\)\}\$\{ts\.main\.includes\(' · '\) \? `<span class="ov-aud-admin"> · \$\{esc\(ts\.main\.split\(' · '\)\[1\]\)\}<\/span>` : ''\}<\/i>/);
  assert.match(hc, /<span class="ht-m">\$\{unitsTxt\(b\)\}\$\{ts\.mark \? ` <em class="ht-x">\$\{esc\(ts\.mark\)\}<\/em>` : ''\}<\/span>/);
  assert.doesNotMatch(hc, /stTxt\(b\)/, "꼬리표에 '③예정일 지남'(stTxt)을 쓰지 않는다");
  assert.match(css, /\.hudtag \.ht-x\{[^}]*border-radius:var\(--radius-full\)/);
});

test("2 카드 원천 날짜 다름: 원장 현재 예정과 같은 달이면 일 단위('LH 2026.10.31'), 다른 달이면 달('LH 2028.12')", () => {
  const src = [grab(/const dotDate = [^\n]+\n/), grab(/const ymDot = [^\n]+\n/), grab(/const altMark = [^\n]+\n/)].join('');
  const altMark = Function('esc', `${src}; return altMark;`)(esc);
  assert.match(altMark({ source: 'LH', planned: '2026-10-31' }, '2026-10-11'), />원천 날짜 다름\(LH 2026\.10\.31\)<\/b>$/);
  assert.match(altMark({ source: 'LH', planned: '2028-12-31' }, '2027-10-31'), />원천 날짜 다름\(LH 2028\.12\)<\/b>$/);
  assert.match(altMark({ source: 'LH', planned: '2028-12-31' }), />원천 날짜 다름\(LH 2028\.12\)<\/b>$/);
  const bp = grab(/function blockPopup\([\s\S]*?\n\}\n/);
  assert.match(bp, /const pe = lg && \(lg\.overdue \|\| lg\.next\), am = alt \? altMark\(alt, pe && pe\.planned\) : '';/);
  assert.doesNotMatch(bp, /altMark\(alt\)/);
});

test("3 카드: '사업 정보 보기 ›'는 머리(제목 줄) 바로 아래, 스크롤하는 몸통보다 앞", () => {
  const bp = grab(/function blockPopup\([\s\S]*?\n\}\n/);
  const h = bp.indexOf('<div class="pc-h">'), link = bp.indexOf('<a class="pc-open"'), body = bp.indexOf('<div class="pc-body">');
  assert.ok(h > 0 && link > h && body > link, `머리 ${h} < 링크 ${link} < 몸통 ${body}`);
  assert.match(bp, /<\/div>\n\s*\$\{linkId \? `<a class="pc-open" href="\$\{esc\(projHref\(linkId\)\)\}">사업 정보 보기 ›<\/a>` : ''\}\n\s*<div class="pc-body">/);
  assert.match(css, /\.pc-split>\.pc-open\{flex:none;[^}]*border-bottom:1px solid var\(--line\)[^}]*\}/);
  assert.doesNotMatch(css, /\.pc-split>\.pc-open\{[^}]*border-top/);
});

test("4 단계 정의: 띠·카드 툴팁에 '공식 01~06' 번호를 쓰지 않는다, 정의만 짧게", () => {
  const H = head();
  assert.equal(H.STAGES6.length, 6);
  for (const s of H.STAGES6) { assert.ok(s[4] && s[4].length <= 16, `${s[1]}: ${s[4]}`); assert.doesNotMatch(s[4], /공식|\b0[1-6]\b/, s[1]); }
  assert.equal(H.STAGES6[4][4], '사용검사(공사 끝)');
  assert.doesNotMatch(app, /공식 0[1-6]/);
});

test('5 하단 범례 요약(#legendSum)은 비단계 표지만: 단계 견본은 머리 줄 띠가 맡고, 자세히 목록에는 남는다', () => {
  const lg = grab(/BY_STAGE\.forEach\(\(st\) => \{   \/\/ 6단계 순서[\s\S]*?\n  \}\);\n/);
  /* 2026-10-18: 6단계 띠(#stageF)는 두 관점 모두 보이므로 단계 칸은 요약 줄에 넣지 않고 자세히 목록에만 둔다 */
  assert.match(app, /const stg = \(sw, t, n, tip\) => \{ rows\.push\(\[sw, t, n, ''\]\); if \(tip\) tips\.set\(t, tip\); \};/);
  assert.match(lg, /stg\(`<i class="sw \$\{KIND\[st\]\}"><\/i>`, stLabel\(st\), NOTE\[st\] \|\| '', stTitle\(st\)\)/, '단계 칸: 자세히 목록만');
  assert.match(lg, /stg\('<i class="sw soon"><\/i>', '⑤준공 · 입주 진행', '<small>준공 6개월 안<\/small>', stTitle\(st\)\)/);
  assert.match(app, /\$\('#legendSum'\)\.innerHTML = chips\.map\(\(\[sw, t, c\]\) => `<span\$\{tipAttr\(t\)\}\$\{clsAttr\(c\)\}>/);
  assert.match(lg, /add\('<i class="sw soon" style="opacity:\.45"><\/i>', '⑤준공 · 입주 완료', '<small>준공 7~24개월, 흐리게<\/small>', '입주 완료', stTitle\(st\)\)/, '흐리게 그린 입주 완료는 비단계 표지로 남긴다');
  /* 비단계 표지(근사 위치·주의/지연 테두리·기존 건물)는 요약에 남는다(short 기본값 = 이름) */
  assert.match(app, /add\('<i class="sw approx"><\/i>', '근사 위치', '<small>이름으로 찾은 위치, 겹원 · 확인 필요<\/small>', '근사 위치', APPROX_TXT\);/);
  assert.match(app, /if \(jd\[0\] \+ jd\[1\]\) add\([^\n]*'<small>상태, 굵은 테두리<\/small>', '', '', 'ov-aud-admin'\);/);   // 원장 판정 줄은 정책담당자 관점에만
  assert.match(app, /else add\('<i class="sw ramp"><\/i>', '기존 건물', '<small>높을수록 밝게, 색조는 참고<\/small>'\);/);
});

test('6 첫 화면 맞춤: 지역·시군구로 열면 사업 구역에 맞춰(여백 24px) 기본 시점보다 가까울 때만 움직임 없이, 전체 보기도 같은 여백', () => {
  const fa = grab(/function fitAll\(first = false\) \{[\s\S]*?\n\}\n/);
  assert.match(fa, /PAD = 24;/);
  assert.match(fa, /map\.jumpTo\(was\);\n\s*if \(first\) \{ if \(to\.zoom > was\.zoom \+ 0\.05\) map\.jumpTo\(to\); return; \}/);
  assert.match(fa, /map\.easeTo\(\{ \.\.\.to, duration: reduceMotion \? 0 : 900 \}\);/);
  assert.match(app, /const FIRST_FIT = !atParam\(\)\.center && !q\.get\('block'\) && \(!RES \|\| \(RES\.type === 'sgg' && !RES\.block\)\);/);
  const ff = grab(/if \(FIRST_FIT\) map\.once\('load', \(\) => \{[\s\S]*?\n\}\);/);
  assert.match(ff, /const go = \(\) => \{ if \(done\) return; done = true; map\.resize\(\); fitAll\(true\); \}, c = \$\('#cmd'\);/);
  assert.match(ff, /if \(!c \|\| !c\.hidden \|\| !window\.MutationObserver\) return go\(\);/, '입력줄이 이미 있으면 바로');
  assert.match(ff, /mo\.observe\(c, \{ attributes: true, attributeFilter: \['hidden'\] \}\);/, '입력줄이 붙으면(안전 영역 아래 경계) 그때 맞춘다');
  assert.match(ff, /whenRevealed\(\(\) => \{ mo\.disconnect\(\); go\(\); \}\);/, '입력줄이 끝내 없으면 막이 걷힐 때');
  assert.match(app, /\$\('#vAll'\)\.addEventListener\('click', \(\) => \{ stopMotion\(\); fitAll\(\); \}\);/);
});

test("7 준공 임박: 꼬리표에 '준공 임박' 짧은 표지(예정일 지남이 있으면 그 표지), 단계 글자·색은 ③착공", () => {
  const H = head();
  const near = { id: 'A3', status: '준공 임박', ledger: ledger({ next: { eventType: 'COMPLETION', planned: '2026-12-20' } }) };
  assert.deepEqual(H.tagState(near), { main: '③착공 · 정상', mark: '준공 임박' });
  assert.deepEqual(H.tagState({ id: 'N', status: '준공 임박' }), { main: '③착공', mark: '준공 임박' }, '원장이 없어도');
  assert.equal(H.stageNow(near).k, 'near', '색 종류는 near(= ③ build 색) 그대로');
});
