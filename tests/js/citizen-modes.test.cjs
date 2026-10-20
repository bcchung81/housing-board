'use strict';
/* /citizen 지도 모드·연결 하이라이트·돌려 보기·배치(2026-10-18 사용자 결정 4·5번): 시안 빌드 결과(docs/design/대국민-모드-시안.html)의 첫 스크립트를
   그대로 떼어 순수 함수를 시험하고, 화면 연결은 원본(template.html) 글로 확인한다. 화면 사진은 찍지 않는다.
   ① 해별 지도 값 = '언제 들어오나' 막대 값(보는 시군구) ② 6단계 띠 칸 합 = 제목 큰 숫자 ③ 모드 상호 배제 ④ 모드별 색 구간·높이 = 같은 값 ⑤ 배치(지도 카드 폭·레일·고정 높이) ⑥ 돌려 보기 연결 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'tools', 'design', 'public-mock');
const TPL = fs.readFileSync(path.join(SRC, 'template.html'), 'utf8');
const BUILT = fs.readFileSync(path.join(ROOT, 'docs', 'design', '대국민-모드-시안.html'), 'utf8');
const code = [...BUILT.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((c) => c.includes('function makeSearch'));
const ctx = {}; vm.createContext(ctx);
vm.runInContext(code + '\nObject.assign(this, { D, makeSearch, sumOf, unitsFor, yearSums, stageSums, unitCodes, modeOf, modeValues, yearRange, modeView, headParts, pressMode, sameMode, MODE_ALL, STAGE3, classesOf, yearBucket, ISLES, CAPITAL, mapScope });', ctx);
const D = ctx.D, IX = ctx.makeSearch(D);
const plain = (v) => JSON.parse(JSON.stringify(v));   // vm 쪽 배열·객체를 이 쪽 값으로(deepEqual 의 프로토타입 비교 피하기)
const fnBody = (name) => { const i = TPL.indexOf(`function ${name}(`); assert.ok(i >= 0, name); return TPL.slice(i, TPL.indexOf('\n}\n', i)); };
const CSS = TPL.slice(TPL.indexOf('<style>'), TPL.indexOf('</style>'));
const unitKey = (c) => (c.startsWith('41') ? c.slice(0, 4) + '0' : IX.regionOf[c]?.parent || c);

test('① 해별 지도 값 = 언제 들어오나 막대 값: 보는 시군구(지도 면)마다·해 칸마다 같다(같은 함수 yearSums) — 경기·서울·인천, 범위도 같은 yearRange', () => {
  let n = 0;
  for (const sd of ['41', '11', '28']) {
    const units = ctx.unitsFor(D, IX, sd).filter((x) => IX.regionOf[x.key]);
    for (let i = 0; i < 6; i++) {
      const map = ctx.modeValues(D, IX, sd, { k: 'y', i });
      for (const x of units) { const bars = ctx.yearSums(D, IX.regionOf[x.key].codes); assert.equal(map[x.key] || 0, bars[i], `${sd} ${x.name} 칸 ${i}`); n++; }
    }
    /* 시도 전체를 볼 때(막대 = 시도 합): 지도 면 값의 합 = 시도 막대 */
    const sdBars = ctx.yearSums(D, IX.regionOf[sd].codes);
    for (let i = 0; i < 7; i++) assert.equal(Object.values(ctx.modeValues(D, IX, sd, { k: 'y', i })).reduce((a, b) => a + b, 0), sdBars[i], `${sd} 합 칸 ${i}`);
  }
  /* 화면 연결: 해 띠(setYrs)·지도(modeOf)가 모두 yearSums·yearRange 를 쓴다(2026-10-18 아래 줄의 해 막대·일정표는 없앴다) */
  assert.match(fnBody('setYrs'), /VIEW\.Ysc = yearSums\(D, r\.codes\); VIEW\.yrs = yearRange\(VIEW\.Ysc\);/);
  assert.match(fnBody('modeOf'), /mode\.k === 'y' \? yearSums\(D, codes\)\[mode\.i\]/);
  /* 남양주시(41360): 2027 518 · 2028 9,660(시안 시험 값과 같은 원장) */
  assert.deepEqual(plain(ctx.yearSums(D, IX.regionOf['41360'].codes)).slice(1, 3), plain(ctx.yearSums(D, ['41360'])).slice(1, 3));
  assert.deepEqual(plain(ctx.yearRange([0, 518, 9660, 0, 686, 0, 98000])), [1, 2, 3, 4], '앞뒤 0 인 해는 빼고 사이 0 인 해는 남긴다, 연도 미정 제외');
  console.log(`  면·해 ${n}쌍 같음`);
});

test('② 요약 표 단계 3줄 합 = 큰 숫자(sumOf): 모든 시도·시군구, 줄은 준비 중 · 짓는 중 · 모집 끝남(일반사용자 단계 이름)', () => {
  for (const r of IX.regions) { const s = ctx.stageSums(D, r.codes); assert.equal(s.length, 3); assert.equal(s[0] + s[1] + s[2], ctx.sumOf(D, r.codes).u, r.label); }
  assert.deepEqual(plain(ctx.STAGE3), ['준비 중', '짓는 중', '모집 끝남']);
  /* 단계 모드 지도 값의 합 = 시도 띠 칸 */
  /* 2026-10-19 수도권 한정: 부산(26)은 색인에 없어 시도 셋만 */
  for (const sd of ['41', '11', '28']) for (let i = 0; i < 3; i++) assert.equal(Object.values(ctx.modeValues(D, IX, sd, { k: 's', i })).reduce((a, b) => a + b, 0), ctx.stageSums(D, IX.regionOf[sd].codes)[i], `${sd} 단계 ${i}`);
  /* 화면 연결: 단계 줄 = stageSums, 큰 숫자 = sum(r.codes)(전체 모드) — 같은 보는 곳 r */
  assert.match(fnBody('bandHtml'), /const t = sum\(r\.codes\);[\s\S]*const S3 = stageSums\(D, r\.codes\), top = topStage\(S3\);[\s\S]*S3\.map\(\(u, i\) =>/);
  assert.match(fnBody('headHtml'), /const t = sum\(r\.codes\), name = nameOf\(r\);[\s\S]*const u = m\.k === 'all' \? t\.u : modeOf\(D, r\.codes, m\)/);
  assert.match(fnBody('bandHtml'), /<i style="flex-grow:\$\{\(t\.u \? u \/ t\.u : 0\)\.toFixed\(4\)\}"><\/i>/, '막대 폭 = 비율');
  assert.match(CSS, /\.sm-st \{[^}]*grid-auto-rows: 44px;/, '단계 줄 누름 44px');
});

test('③ 모드 상호 배제: 모드는 하나(VIEW.mode) — 해를 고르면 단계는 전체, 단계를 고르면 해는 전체, 같은 것을 다시 누르거나 [전체]면 전체', () => {
  const P = (cur, k, i) => plain(ctx.pressMode(cur, k, i)), A = { k: 'all' };
  assert.deepEqual(P(A, 'y', 2), { k: 'y', i: 2 });
  assert.deepEqual(P({ k: 'y', i: 2 }, 's', 1), { k: 's', i: 1 }, '해 → 단계: 해는 버린다');
  assert.deepEqual(P({ k: 's', i: 1 }, 'y', 3), { k: 'y', i: 3 }, '단계 → 해: 단계는 버린다');
  assert.deepEqual(P({ k: 'y', i: 2 }, 'y', 2), A, '다시 누르면 전체');
  assert.deepEqual(P({ k: 's', i: 0 }, 's', 0), A);
  assert.deepEqual(P({ k: 's', i: 0 }, 'all'), A, '[전체]');
  assert.deepEqual(P({ k: 'y', i: 1 }, 'y', 4), { k: 'y', i: 4 }, '같은 축 다른 해');
  assert.ok(ctx.sameMode({ k: 'all' }, { k: 'all', i: 9 }) && !ctx.sameMode({ k: 'y', i: 1 }, { k: 's', i: 1 }));
  /* 화면: 띠 칸·해 칸·막대 누름은 모두 setMode(pressMode(VIEW.mode, …)) 하나로, 시간 띠 [전체]는 단계 모드일 때도 눌림(해가 전체), 띠는 단계 모드일 때만 눌림 */
  const clk = TPL.slice(TPL.indexOf("/* 띠 칸·해 칸·막대·재생·돌리기 누름 */"), TPL.indexOf('/* ---------- 돌려 보기(2026-10-18)'));
  assert.match(clk, /setMode\(pressMode\(VIEW\.mode, 'y', \+b\.dataset\.y\)\);/);
  assert.match(clk, /setMode\(pressMode\(VIEW\.mode, 's', \+b\.dataset\.st\)\);/);
  assert.match(fnBody('paintTband'), /b\.dataset\.y === 'all' \? m\.k !== 'y' : m\.k === 'y' && \+b\.dataset\.y === m\.i/);
  assert.match(fnBody('paintBand'), /m = VIEW\?\.mode \|\| MODE_ALL[\s\S]*m\.k === 's' && \+b\.dataset\.st === m\.i/, '눌림 = 고정된 단계 모드만');
  assert.equal((TPL.match(/VIEW\.mode = /g) || []).length, 4, 'VIEW.mode 를 바꾸는 곳: setMode · 재생 두 곳(해 · 끝나면 전체) · 해 범위 밖 되돌림(새 시도는 VIEW 를 새로 만든다)');
});

test('④ 모드별 색 구간 = 높이 값: 면 값 하나(vals)로 색 단계(C.cls)·높이(animateHeights·draw 의 umax 고정 배율)·라벨·순위를 칠하고, 구간·배율은 같은 축 모드 전체를 한 표본으로', () => {
  const keysOf = (sd) => ctx.unitsFor(D, IX, sd).map((x) => x.key);
  for (const sd of ['41', '11', '28']) {
    const keys = keysOf(sd), Y = ctx.yearSums(D, IX.regionOf[sd].codes), yrs = plain(ctx.yearRange(Y)), isl = ctx.ISLES[sd] || [];
    for (const m of [{ k: 'all' }, ...yrs.map((i) => ({ k: 'y', i })), { k: 's', i: 0 }, { k: 's', i: 1 }, { k: 's', i: 2 }]) {
      const md = ctx.modeView(D, IX, [sd], m, yrs, keys), vals = keys.map((k) => md.vals[k] || 0);
      assert.deepEqual(plain(md.vals), plain(ctx.modeValues(D, IX, sd, m)), `${sd} ${JSON.stringify(m)} 값`);
      /* 색 단계는 값만으로 정해진다: 0 → c0, 값이 크면 단계도 같거나 크다 */
      const cs = vals.map((v) => md.C.cls(v));
      vals.forEach((v, j) => { if (!v) assert.equal(cs[j], 0); vals.forEach((w, l) => { if (v > w) assert.ok(cs[j] >= cs[l], `${sd} 단조 ${v}>${w}`); }); });
      /* 배율은 같은 축 모드 전체의 최댓값(섬 삽입 지도 제외) — 그 모드 값은 넘지 않는다 */
      const fam = m.k === 'y' ? yrs.map((i) => ({ k: 'y', i })) : m.k === 's' ? [0, 1, 2].map((i) => ({ k: 's', i })) : [m];
      const pool = fam.flatMap((f) => { const v = ctx.modeValues(D, IX, sd, f); return keys.filter((k) => !isl.includes(k)).map((k) => v[k] || 0); });
      assert.equal(md.umax, Math.max(1, ...pool), `${sd} ${JSON.stringify(m)} 배율`);
      /* 같은 축의 다른 모드도 같은 구간(해마다 넘겨도 같은 호수 = 같은 색) */
      if (fam.length > 1) { const o = ctx.modeView(D, IX, [sd], fam[fam.length - 1], yrs, keys); assert.deepEqual(plain(o.C.br), plain(md.C.br), `${sd} 같은 축 같은 구간`); }
    }
    /* 전체 모드 구간 = 예전 지도(unitsFor 값의 사분위) 그대로 */
    assert.deepEqual(plain(ctx.modeView(D, IX, [sd], { k: 'all' }, yrs, keys).C.br), plain(ctx.classesOf(ctx.unitsFor(D, IX, sd)).br), sd + ' 전체 모드 구간 불변');
  }
  /* 화면 연결: 같은 md 로 값 → 색 → 높이, 다시 그릴 때도 지금 모드 값 + 같은 배율, 범례도 VIEW.C */
  const am = fnBody('applyMode');
  assert.match(am, /for \(const x of VIEW\.all\) \{ x\.u = md\.vals\[x\.key\] \|\| 0; x\.c = md\.C\.cls\(x\.u\); \}/);
  assert.match(am, /Map3D\.recolor\(svg, VIEW\.G\);/);
  assert.match(am, /Map3D\.animateHeights\(svg, VIEW\.G, md\.vals, \{ umax: md\.umax, duration: 700,/);
  assert.match(fnBody('drawMap'), /own: g\.own\.map\(\(q\) => \(\{ \.\.\.q, u: VIEW\.mvals\[q\.code\] \|\| 0 \}\)\)/);
  assert.match(fnBody('drawMap'), /view: VIEW\.view \|\| undefined, shade: true, umax: VIEW\.umax, scope: VIEW\.scope, hide: hideOf\(VIEW\.scope\) \}/);   // 2026-10-19: 보는 시도 밖 면 = 맥락 회색(scope), 이웃 1단계 밖은 그리지 않음(hide)
  assert.match(fnBody('paintLegend'), /legendHtml\(VIEW\.C, m\)/);
  assert.match(TPL, /const modeName = \(m\) => \(m\.k === 'y' \? `\$\{YBL\[m\.i\]\} 공급 호수` : m\.k === 's' \? `\$\{STAGE3\[m\.i\]\} 호` : '공급 예정 호수'\);/, '범례 제목 = 모드 이름');
  /* 제목도 모드를 따른다 */
  const YBLT = ['2026년(올해)', '2027년', '2028년', '2029년', '2030년', '2031년 이후', '연도 미정'];
  assert.deepEqual(plain(ctx.headParts({ k: 'y', i: 2 }, 9660, YBLT)), ['2028년 공급 호수', '9,660', '호']);
  assert.deepEqual(plain(ctx.headParts({ k: 's', i: 1 }, 9660, YBLT)), ['짓는 중', '9,660', '호']);
});

test('④-2 수도권 한 판(2026-10-18): 서울·인천·경기 어느 시도를 봐도 지도 범위·배율·면 높이·색 구간이 같고, 다른 시도 면도 같은 구간으로 칠한다(없음으로 어둡게 그리지 않는다)', () => {
  assert.deepEqual(plain(ctx.CAPITAL), ['11', '28', '41']);
  for (const sd of ctx.CAPITAL) assert.deepEqual(plain(ctx.mapScope(sd)), ['11', '28', '41'], sd + ' 판 = 세 시도');
  assert.deepEqual(plain(ctx.mapScope('26')), ['26'], '수도권 밖은 그 시도(막대 순위 — 동작 그대로)');
  /* renderMapCard 와 같은 묶음: all = 판의 모든 면(세 시도 unitsFor), keys = 그 열쇠 */
  const allOf = (sd) => ctx.mapScope(sd).flatMap((s) => ctx.unitsFor(D, IX, s)), keys = allOf('11').map((x) => x.key);
  assert.equal(keys.length, D.map.units.filter((u) => ['11', '28', '41'].includes(u[1])).length, '판 면 = 지도 면 목록 전부');
  const M = [{ k: 'all' }, { k: 's', i: 0 }, { k: 's', i: 1 }, { k: 's', i: 2 }];
  for (const m of M) {
    const md = ['11', '28', '41'].map((sd) => plain(ctx.modeView(D, IX, ctx.mapScope(sd), m, [], allOf(sd).map((x) => x.key))));
    assert.deepEqual(md[0], md[1], `${JSON.stringify(m)} 서울 = 인천`); assert.deepEqual(md[0], md[2], `${JSON.stringify(m)} 서울 = 경기`);
    for (const sd of ['11', '28', '41']) assert.deepEqual(Object.fromEntries(Object.entries(md[0].vals).filter(([k]) => k.startsWith(sd))), plain(ctx.modeValues(D, IX, sd, m)), `${sd} ${JSON.stringify(m)} 값은 그 시도 값 그대로`);
  }
  /* 서울을 볼 때 경기·인천 면도 값이 있으면 색 단계 1 이상(값·구간 표본은 판 하나 그대로).
     2026-10-19 사용자 결정('서울 선택 시 서울 밖은 회색으로 경계를 나눠'): 시도를 보고 있으면 그 시도 밖 면은 화면에서 맥락 회색·평평으로 그린다 —
     색 단계 자체는 그대로 두고 그리기만 scope(drawMap → Map3D.draw o.scope · GL setScope)가 덮는다. 수도권 전체 보기(camSido null)는 모두 칠한다 */
  const md = ctx.modeView(D, IX, ctx.mapScope('11'), { k: 'all' }, [], keys), lit = allOf('11').filter((x) => x.u > 0);
  for (const x of lit) assert.ok(md.C.cls(md.vals[x.key]) > 0, `${x.key} 색 단계`);
  assert.ok(lit.some((x) => x.key.startsWith('41')) && lit.some((x) => x.key.startsWith('28')), '경기·인천 면 값이 있다');
  /* 화면 연결: 기하는 시도를 받지 않고, 면 그림은 판의 모든 면(VIEW.all)·시도와 관계없는 높이 하한, 라벨·순위는 보는 시도 면(VIEW.units) */
  const dm = fnBody('drawMap');
  assert.match(dm, /VIEW\.g = geomFor\(D, IX, W, H, narrow\);/); assert.match(dm, /VIEW\.scope = camSido\(\);/, '보는 시도 = 카메라와 같은 camSido(고른 곳이 없으면 null = 모두 칠함)'); assert.doesNotMatch(dm, /VIEW\.sd/, 'drawMap 은 보는 시도에 기대지 않는다');
  assert.match(dm, /Map3D\.draw\(st\.querySelector\('svg\.map'\), gm, \{ units: VIEW\.all, nameOf: [^,]+, hFloor: 6, aria/);
  assert.match(fnBody('drawBaseLabels'), /Map3D\.labels\(g, VIEW\.G, VIEW\.units, \{ homeKey: VIEW\.homeKey \}\)/);
  assert.match(fnBody('modeData'), /modeView\(D, IX, mapScope\(VIEW\.sd\), m, VIEW\.yrs, VIEW\.all\.map\(\(x\) => x\.key\)\)/);
  assert.match(fnBody('renderMapCard'), /const units = unitsFor\(D, IX, sd\), all = mapScope\(sd\)\.flatMap\(\(s\) => \(s === sd \? units : unitsFor\(D, IX, s\)\)\);[\s\S]*all\.forEach\(\(x\) => \{ x\.c = md\.C\.cls\(x\.u\); \}\);/, 'all 은 units 와 같은 객체를 나눠 쓴다(모드가 바뀌면 함께 갱신)');
});

test('⑤ 배치: 1440 에서 지도 카드 약 74%(72~75%), 마크업·휴대폰 순서 = 왼쪽 카드(요약 표) → 지도 카드(G5), 1440×906 지도 카드 끝 ≤ 906 · 무대 높이 ≥ 640, 레일 = 1px 구분선만, 지도 카드 = 무대 + 시간 띠만(머리 띠·6단계 띠 없음)', () => {
  const m = CSS.match(/\.top-row \{[^}]*grid-template-columns: clamp\((\d+)px, (\d+)vw, (\d+)px\) minmax\(0, 1fr\);/);
  assert.ok(m, 'top-row 열');
  const left = Math.min(+m[3], Math.max(+m[1], 1440 * +m[2] / 100)), inner = 1440 - 48, share = (inner - left - 16) / inner;
  assert.ok(share >= .72 && share <= .75, `지도 카드 ${(share * 100).toFixed(1)}%`);
  assert.ok(TPL.indexOf('id="sum"') < TPL.indexOf('id="mapc"'), '마크업: 지금 신청 → 지도 카드(390 첫 화면에 지금 신청 첫 줄 — G5)');
  assert.match(CSS, /grid-template-areas: 'sum map';/); assert.match(CSS, /grid-template-areas: 'sum' 'map';/);
  /* 1440×906: 위 줄 = 100vh − 152(지도 카드 끝까지 첫 화면) → 무대 = 위 줄 − 카드 여백 40 − 간격 8 − 시간 띠 44(2026-10-18 통합 요약 표: 머리 띠 44 · 6단계 띠 44 · 간격 16 을 무대에 돌려줌) */
  assert.strictEqual((TPL.match(/class="[^"]*(?<![\w-])pub(?![\w-])[^"]*"/g) || []).length, 1, 'template: class 에 pub 낱말은 <section class="pub"> 하나뿐(메뉴 li 는 m-pub)');
  const row = CSS.match(/\.pub \{ grid-template-rows: auto clamp\((\d+)px, calc\(100vh - (\d+)px\), (\d+)px\) 268px auto; \}/); assert.ok(row);
  for (const vh of [900, 906]) {
    const top = Math.min(+row[3], Math.max(+row[1], vh - +row[2])), stageH = top - 40 - 8 - 44;
    assert.ok(64 + 16 + 48 + 16 + top <= vh, `${vh}: 지도 카드 끝 ${64 + 16 + 48 + 16 + top}px ≤ ${vh}`); assert.ok(stageH >= 600, `${vh}: 무대 ${stageH}px`);
    if (vh === 906) console.log(`  1440×906 위 줄 ${top} · 무대 ${stageH}(예전 ${top - 196}, +${stageH - (top - 196)})`);
  }
  assert.match(CSS, /\.mapc \{ position: relative; display: grid; grid-template-rows: minmax\(0, 1fr\);/, '지도 카드 = 몸통 한 줄(무대 + 시간 띠 | 레일)');
  assert.doesNotMatch(TPL, /mapc-h|id="sband"|\.sband|\.sb \{/, '머리 띠·6단계 띠 없음'); assert.match(CSS, /\.tband \{ display: flex; align-items: center; gap: var\(--s2\); height: 44px;/);
  assert.match(CSS, /\.tchips \{[^}]*min-width: 0;[^}]*overflow-x: auto;/, '해 칸이 넘치면 띠 안에서만 밀린다(390 가로 넘침 없음)');
  assert.doesNotMatch(TPL.replace(/\/\*[\s\S]*?\*\//g, '').replace('mapcard ui-hud in', ''), /ui-hud|hud-col|class="facts"|\.facts/, '카드 안 판·상태 칸 없음 (2026-10-19: 지도 위 사업 카드 .mapcard 의 ui-hud 만 예외)');
  assert.match(fnBody('renderMapCard'), /\$\('#mapc'\)\.innerHTML = `<div class="mapc-b\$\{cap \? '' : ' nomap'\}">\$\{bodyH\}<\/div>`;/, '지도 카드 = 몸통만');
  assert.match(fnBody('tbandHtml'), /const bm = bigMap\(VIEW\.sd, VIEW\.viewKey\);[\s\S]*<span class="tctl">\$\{play\}\$\{rot\}\$\{bm \? `<span class="tmap">\$\{bm\}<\/span>` : ''\}<\/span>/, '큰 지도 = 시간 띠 오른쪽 단추 묶음(보는 곳 기준 주소)');
  /* 미리보기는 옅게(.pv) — 큰 숫자·요약 구역 */
  assert.match(CSS, /\.sum-h\.pv, \.sum-h\.pv \.n \{ color: var\(--muted-foreground\); \}/); assert.match(CSS, /\.smry\.pv /); assert.doesNotMatch(TPL, /#c-yr|\.tlw/, '아래 줄 해 막대·일정표 없음(사업 카드 한 장)');
  assert.match(TPL, /if \(f && VIEW\?\.cap && !busyStage\(\) && !f\.classList\.contains\('out'\)\) \{[^}]*pvT = setTimeout\(\(\) => setPv\(k\), 200\);/, '면에 200ms 머물면 미리보기(보는 시도 밖 회색 면은 없음, 2026-10-19)');
});

test('⑥ 돌려 보기 연결: shade · attachOrbit(끄는 동안 투영만, 놓으면 그 보기로 다시 그림) · 단추 15° · 원래 방향(돌렸을 때만) · 고르기는 click · 아이콘은 lucide 대응표', () => {
  const rc = fnBody('renderMapCard');
  assert.match(rc, /VIEW\.detach = Map3D\.attachOrbit\(\$\('#mstage'\), \{/);
  assert.match(rc, /set: \(v\) => \{ VIEW\.view = v; if \(VIEW\.G\) Map3D\.reproject\(\$\('#mstage svg\.map'\), VIEW\.G, v, \{ sea: false \}\); \},/);
  assert.match(rc, /onEnd: endView,/);
  assert.match(fnBody('endView'), /VIEW\.view = isHomeView\(v\) \? null : v; drawMap\('view'\);/);
  assert.match(fnBody('drawMap'), /drawBaseLabels\(\);\n  paintSelection\(\);/, '다시 그린 뒤 라벨·칠하기');
  assert.match(rc, /VIEW = \{ cap, sd, units,[^}]*mode: MODE_ALL,[^}]*view: null,/, '시도가 바뀌면 보기·모드 처음으로');
  assert.doesNotMatch(TPL, /store\.set\('(view|bearing|orbit)/, '돌린 각도는 저장하지 않는다');
  assert.match(TPL, /const ROT = \[\['-15', 'rotl', '왼쪽으로 돌리기'\], \['15', 'rotr', '오른쪽으로 돌리기'\], \['0', 'compass', '원래 방향으로'\]\];/);
  assert.match(fnBody('paintTband'), /if \(!d\) b\.hidden = isHomeView\(v\);/, '원래 방향은 돌렸을 때만');
  assert.match(CSS, /\.stage:is\(\.orbiting, \.turning, \.morph\) :is\(\.map \.lbls, \.map \.hil, \.map \.lift, \.map \.kb, \.map \.kb-halo\)/, '끄는 동안·전환 중 라벨 층 숨김');
  /* 지도 고르기는 click(끌기 뒤 click 하나는 attachOrbit 이 삼킨다) · 키보드 화살표는 keyMove 그대로 */
  assert.match(TPL, /if \(e\.target\.closest\('#mapbox'\)\) \{ const k = e\.target\.closest\('\[data-area\]'\)\?\.dataset\.area;/);
  assert.match(fnBody('mapKey'), /Map3D\.keyMove\(VIEW\.G, S\.mapAt, e\.key\)/);
  /* 아이콘: build.js 대응표에 lucide 원본 이름으로 */
  const build = fs.readFileSync(path.join(SRC, 'build.js'), 'utf8');
  for (const [id, n] of [['play', 'play'], ['pause', 'pause'], ['rotl', 'rotate-ccw'], ['rotr', 'rotate-cw'], ['compass', 'compass']]) assert.match(build, new RegExp(`\\b${id}: '${n}'`), id);
  for (const id of ['play', 'pause', 'rotl', 'rotr', 'compass']) assert.match(BUILT, new RegExp(`<symbol id="i-${id}" `), '스프라이트 ' + id);
  /* 재생: 해마다 1.4초, 끝나면 전체 */
  assert.match(fnBody('startPlay'), /VIEW\.playT = setTimeout\(step, 1400\)/); assert.match(fnBody('startPlay'), /VIEW\.mode = MODE_ALL; applyMode\(\);/);
});
