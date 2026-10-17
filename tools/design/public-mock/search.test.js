// 시안 HTML 에서 makeSearch 와 D 를 그대로 떼어 내 시험한다
const fs = require('fs'), assert = require('assert'), vm = require('vm');
const h = fs.readFileSync(require('path').join(__dirname, '..', '..', '..', 'docs', 'design', '대국민-모드-시안.html'), 'utf8');
const code = [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((c) => c.includes('function makeSearch'));
const ctx = {}; vm.createContext(ctx); vm.runInContext(code + '\nthis.makeSearch = makeSearch; this.D = D; this.sumOf = sumOf; this.decidePick = decidePick; this.labelNum = labelNum; this.placeLabels = placeLabels; this.faceLabelOpts = faceLabelOpts; this.shortNames = shortNames; this.shortName = shortName; this.yrLine = yrLine; this.groupByMonth = groupByMonth; this.groupByArea = groupByArea; this.KIND_CHIP = KIND_CHIP; this.mapHref = mapHref; this.mapScopeHref = mapScopeHref; this.geomFor = geomFor; this.inRing = inRing; this.faceH = faceH; this.arcsOf = arcsOf; this.ringArea = ringArea; this.unitsFor = unitsFor; this.rankTop = rankTop; this.statusCounts = statusCounts; this.OF_STAGE = OF_STAGE; this.stepOpt = stepOpt; this.eul = eul; this.undoHome = undoHome;', ctx);
const S = ctx.makeSearch(ctx.D);
const labels = (r) => r.regions.items.map((x) => x.label);
let pass = 0; const t = (name, fn) => { try { fn(); pass++; console.log('PASS', name); } catch (e) { console.log('FAIL', name, e.message); } };
t("'ㄱㅇ' 에 계양구가 포함된다", () => { const r = S.search('ㄱㅇ'); assert(labels(r).includes('계양구'), labels(r)); assert(labels(r).some((l) => l.startsWith('고양시')), labels(r)); });
t("'rPdid' 에 계양이 포함된다", () => { const r = S.search('rPdid'); assert(labels(r).includes('계양구')); assert(r.en); assert(r.projects.items.every((p) => p.name.includes('계양'))); });
t("'남양주' 결과의 첫 묶음이 지역이다", () => { const r = S.search('남양주'); assert(r.regions.total > 0 && r.regions.items[0].label === '남양주시'); });
t('없는 말이면 0건이고 후보도 없다', () => { const r = S.search('햏햏햏'); assert.strictEqual(r.regions.total + r.projects.total, 0); assert.strictEqual(r.suggest.length, 0); });
t("'남양쥬' 는 0건이지만 '남양주시' 를 찾으셨나요 후보로 낸다", () => { const r = S.search('남양쥬'); assert.strictEqual(r.regions.total + r.projects.total, 0); assert.strictEqual(r.suggest[0]?.label, '남양주시', JSON.stringify(r.suggest.map((x) => x.label))); assert.strictEqual(r.suggest[0].code, '41360'); });
t("'고양시' 는 구를 묶은 시 단위 항목이 맨 위다", () => { const r = S.search('고양시'); const x = r.regions.items[0]; assert.strictEqual(x.label, '고양시'); assert.strictEqual(x.code, '41280'); assert(x.codes.length >= 2 && x.codes.every((c) => c.startsWith('4128')), x.codes); assert(!labels(r).some((l) => l.startsWith('고양시 ')), labels(r)); for (const q of ['수원시', '성남시', '용인시', '부천시', '안산시', '안양시']) { const y = S.search(q).regions.items[0]; assert(y && y.label === q && /0$/.test(y.code), q); } });
t("'별내' 처럼 색인에 없는 동 이름은 주소 묶음으로 넘긴다", () => { const r = S.search('별내'); assert.strictEqual(r.regions.total + r.projects.total, 0); assert(r.addr && r.addrFirst); });
t('같은 이름이 둘이면 시도까지 붙는다', () => { const r = S.search('중구'); const l = labels(r); assert(l.length >= 2 && l.every((x) => / 중구$/.test(x) && x !== '중구'), l); assert(new Set(l).size === l.length); const g = S.search('강서구'); assert.strictEqual(JSON.stringify([...labels(g)].sort()), JSON.stringify(['부산 강서구', '서울 강서구'])); });
t("'부산' 검색 숫자 = 상황판 부산 큰 숫자(sumOf ①~④), 모든 지역 항목도 같은 정의", () => {
  const x = S.search('부산').regions.items.find((r) => r.kind === 'sido' && r.code === '26');
  const big = ctx.sumOf(ctx.D, S.regionOf['26'].codes);
  assert(x, 'no 부산'); assert.strictEqual(x.units, big.u); assert.strictEqual(x.projects, big.n);
  const bad = S.regions.filter((r) => { const b = ctx.sumOf(ctx.D, r.codes); return b.u !== r.units || b.n !== r.projects; }).map((r) => r.label);
  assert.strictEqual(bad.length, 0, bad.slice(0, 5).join(','));
});
t('보기와 내 동네 분리: 면·카드·이웃·검색은 저장하지 않고, [내 동네로 정하기]·[현 위치]·검색 내 동네로·[맞아요] 뒤 시군구만 저장한다', () => {
  const mem = { myArea: '41360' }, store = { get: (k) => mem[k] ?? null, set: (k, v) => { mem[k] = v; } };
  let st = { home: store.get('myArea'), view: null };
  const act = (src, code) => { const r = ctx.decidePick(st, src, code); st = { home: r.home, view: r.view }; if (r.save) store.set('myArea', r.home); return r; };
  for (const src of ['face', 'card', 'near', 'search']) { act(src, '41280'); assert.strictEqual(mem.myArea, '41360', src); assert.strictEqual(st.view, '41280'); assert.strictEqual(st.home, '41360'); }
  act('face', '41360'); assert.strictEqual(st.view, null, '내 동네 면은 보기를 내 동네로 되돌린다');
  act('face', '41280'); act('set-home', st.view); assert.strictEqual(mem.myArea, '41280'); assert.strictEqual(st.view, null);
  act('gps', '41360'); assert.strictEqual(mem.myArea, '41360');
  act('search-home', '28245'); assert.strictEqual(mem.myArea, '28245');
  st = { home: null, view: null }; act('face', '41280'); assert.strictEqual(mem.myArea, '28245', '첫 방문 둘러보기는 저장 안 함');
  act('yes', '41'); assert.strictEqual(mem.myArea, '41'); act('face', '41280'); assert.strictEqual(mem.myArea, '41280', '[맞아요] 뒤 시군구 선택은 저장');
  act('search', '26'); assert.strictEqual(mem.myArea, '41280', '다른 시도 보기는 저장 안 함');
});
t('숫자 정의 하나(v7): 요약 합계 = 지도 면 합 = 많은 곳 순위 숫자 — 경기·서울·인천·부산', () => {
  const D = ctx.D;
  for (const sd of ['41', '11', '28', '26']) {
    const units = ctx.unitsFor(D, S, sd), big = ctx.sumOf(D, S.regionOf[sd].codes);
    assert.strictEqual(units.reduce((a, x) => a + x.u, 0), big.u, sd + ' 면 합');
    assert.strictEqual(units.reduce((a, x) => a + x.n, 0), big.n, sd + ' 사업 수 합');
    const rk = ctx.rankTop(units, null, sd === '26' ? 8 : 5);
    assert.deepStrictEqual(rk.map((x) => x.u), units.filter((x) => x.u > 0).slice(0, rk.length).map((x) => x.u), sd + ' 순위 = 호수 내림차순');
    for (const x of units) { const r = S.regionOf[x.key]; if (r) assert.strictEqual(r.units, x.u, sd + ' 검색 숫자 ' + x.name); }
  }
  assert.strictEqual(ctx.sumOf(D, S.regionOf['26'].codes).u, 154329, '부산 154,329');
  const g = ctx.unitsFor(D, S, '41'), r6 = ctx.rankTop(g, '41630', 5);
  assert.strictEqual(r6.length, 6); assert.strictEqual(r6[5].key, '41630', '순위 밖 보는 곳은 6번째 줄');
  assert.strictEqual(ctx.rankTop(g, '41290', 5).length, 5, '순위 안 보는 곳은 그대로 5줄');
});
t('상태 배지: 준비 중 + 짓는 중 + 모집 시작 사업 수 합 = 보는 곳 사업 수(준공 전) — 시도·시군구 모두', () => {
  const D = ctx.D;
  for (const r of S.regions) { const c = ctx.statusCounts(D, r.codes); assert.strictEqual(c[0] + c[1] + c[2], r.projects, r.label); }
  const c = ctx.statusCounts(D, S.regionOf['41360'].codes); console.log('  남양주시 배지:', c.join(' · '));
});
t('지도 라벨(v7d): 값 = 원장 값(1만 이상 0.1만 단위), 면 위 라벨끼리 겹침 0, 가장 큰 값이 먼저', () => {
  const D = ctx.D, L = ctx.labelNum;
  assert.strictEqual(L(16388), '1.6만'); assert.strictEqual(L(23592), '2.4만'); assert.strictEqual(L(3885), '3,885'); assert.strictEqual(L(10330), '1만'); assert.strictEqual(L(10609), '1.1만'); assert.strictEqual(L(21618), '2.2만');
  const g = ctx.geomFor(D, S, '41', 760, 430, false), units = ctx.unitsFor(D, S, '41').filter((x) => x.u > 0), lp = Object.fromEntries(g.own.map((o) => [o.code, o.lp]));
  const cands = units.map((x, i) => { const v = L(x.u), w = v.length * 8 + 6; return { key: x.key, v, force: i < 5, opts: ctx.faceLabelOpts(lp[x.key][0], lp[x.key][1], w, 20) }; });
  const out = ctx.placeLabels(cands, []);
  const box = (b) => [b.x - b.w / 2, b.y - b.h / 2, b.x + b.w / 2, b.y + b.h / 2], ov = (p, q) => { const a = box(p), b = box(q); return a[0] < b[2] - .5 && b[0] < a[2] - .5 && a[1] < b[3] - .5 && b[1] < a[3] - .5; };
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) assert(!ov(out[i].at, out[j].at), out[i].key + '×' + out[j].key);
  for (const o of out) assert.strictEqual(o.v, L(units.find((x) => x.key === o.key).u));
  assert.strictEqual(out[0].key, units[0].key);
  console.log(`  라벨 ${out.length}/${units.length}곳 놓임`);
});
t('라벨 순서(v7d): 경기·서울·인천 모두 호수 큰 순 그리디 — 상위 5곳 라벨은 반드시 보이고, 앞이 못 놓여도 뒤는 자리가 있으면 놓인다', () => {
  const D = ctx.D;
  for (const sd of ['41', '11', '28']) {
    const g = ctx.geomFor(D, S, sd, 760, 430, false), lp = Object.fromEntries(g.own.map((o) => [o.code, o.lp]));
    const units = ctx.unitsFor(D, S, sd).filter((x) => x.u > 0 && lp[x.key]);
    const cands = units.map((x, i) => { const v = ctx.labelNum(x.u), w = v.length * 8 + 6; return { key: x.key, v, force: i < 5, opts: ctx.faceLabelOpts(lp[x.key][0], lp[x.key][1], w, 20) }; });
    const out = ctx.placeLabels(cands, []), shown = new Set(out.map((o) => o.key));
    for (const x of units.slice(0, 5)) assert(shown.has(x.key), sd + ' 상위 5 ' + x.name);
    const hp = (p, q) => Math.abs(p.x - q.x) * 2 < p.w + q.w + 4 && Math.abs(p.y - q.y) * 2 < p.h + q.h + 4;
    for (const c of cands.filter((c) => !shown.has(c.key))) { const before = out.filter((o) => cands.findIndex((x) => x.key === o.key) < cands.indexOf(c)).map((o) => o.at); assert(c.opts.every((o) => before.some((b) => hp(o, b))), sd + ' 그리디 ' + c.key); }
    console.log(`  ${sd} 라벨 ${out.length}/${units.length}곳`);
  }
});
t('선택 안정(G16): 지도 기하(geomFor)는 시도·무대 크기·휴대폰 여부만 받는다 — 같은 입력이면 같은 값, 라벨 점은 다듬은 면 안, k 는 0.6~0.8(판 상자·무대로만), 인천 섬은 삽입 지도', () => {
  assert.strictEqual(ctx.geomFor.length, 6, '인자: D, IX, 시도, W, H, 휴대폰');
  for (const [sd, W, H, nar] of [['41', 760, 430, false], ['11', 760, 430, false], ['28', 760, 430, false], ['41', 366, 250, true]]) {
    const a = ctx.geomFor(ctx.D, S, sd, W, H, nar), b = ctx.geomFor(ctx.D, S, sd, W, H, nar);
    assert.deepStrictEqual(a, b, sd + ' 같은 입력 같은 값');
    for (const o of a.own) assert(o.rings.some((r) => ctx.inRing(o.lp, r.pts)), sd + ' 라벨 점 ' + o.code);
    assert(a.k >= .6 && a.k <= .8, sd + ' k ' + a.k);
    assert(a.Hmax0 >= 8 && a.Hmax0 <= 18, sd + ' Hmax ' + a.Hmax0);
  }
  const ic = ctx.geomFor(ctx.D, S, '28', 760, 430, false);
  assert(!ic.own.some((o) => ['28710', '28720'].includes(o.code)) && ic.inset && ic.inset.units.map((u) => u.code).sort().join() === '28710,28720', '인천 삽입 지도');
});
t('경계 다듬기: 공유 호를 한 번만 다듬어 이웃 면끼리 같은 좌표 — 이웃과 맞닿은 조각은 이웃 고리에 같은 점열(방향만 반대일 수 있음)로 있다(틈·겹침 0), 0길이 변 0', () => {
  for (const sd of ['41', '11', '28']) {
    const g = ctx.geomFor(ctx.D, S, sd, 760, 430, false), sig = (pts) => pts.map((p) => p.join(',')).join(';');
    const of = Object.fromEntries(g.own.map((o) => [o.code, new Set(o.rings.flatMap((r) => r.pieces.map((pc) => sig(pc.pts))))]));
    let shared = 0, bad = 0, zero = 0;
    for (const o of g.own) for (const r of o.rings) for (const pc of r.pieces) {
      for (let i = 0; i + 1 < pc.pts.length; i++) if (pc.pts[i][0] === pc.pts[i + 1][0] && pc.pts[i][1] === pc.pts[i + 1][1]) zero++;
      if (!pc.nb) continue; shared++;
      const f = sig(pc.pts), b = sig(pc.pts.slice().reverse()); if (!of[pc.nb].has(f) && !of[pc.nb].has(b)) bad++;
    }
    assert.strictEqual(bad, 0, sd + ' 이웃 조각 불일치 ' + bad + '/' + shared); assert.strictEqual(zero, 0, sd + ' 0길이 변 ' + zero);
    assert(shared > 20, sd + ' 공유 조각 ' + shared);
  }
});
t('면 높이(v7d): h = 3 + (Hmax − 3)·√(u/umax), 0호는 0 — 시도마다 배율 하나라 호수 순위 = 높이 순위(Spearman 1), 같은 호수는 같은 높이', () => {
  const D = ctx.D;
  const rank = (a) => { const o = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]), R = []; for (let i = 0; i < o.length;) { let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++; for (let k = i; k <= j; k++) R[o[k][1]] = (i + j) / 2 + 1; i = j + 1; } return R; };
  for (const sd of ['11', '28', '41']) for (const Hm of [8, 16, 18]) {
    const us = ctx.unitsFor(D, S, sd).map((x) => x.u), h = ctx.faceH(us, 3, Hm), umax = Math.max(...us);
    us.forEach((u, i) => { if (!u) assert.strictEqual(h[i], 0); else assert(Math.abs(h[i] - (3 + (Hm - 3) * Math.sqrt(u / umax))) < 1e-9); us.forEach((v, j) => { if (v === u) assert.strictEqual(h[j], h[i]); if (v > u) assert(h[j] > h[i]); }); });
    const ra = rank(us), rb = rank(h), n = us.length, m = (n + 1) / 2, sp = ra.reduce((a, v, i) => a + (v - m) * (rb[i] - m), 0) / Math.sqrt(ra.reduce((a, v) => a + (v - m) ** 2, 0) * rb.reduce((a, v) => a + (v - m) ** 2, 0));
    assert(Math.abs(sp - 1) < 1e-9, sd + ' spearman ' + sp);
    assert.strictEqual(Math.max(...h), Hm);
  }
});
t('기둥 밑점(polylabel)과 대표점은 모두 자기 면 안에 있다', () => {
  const inside = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [x1, y1] = r[i], [x2, y2] = r[j]; if ((y1 > p[1]) !== (y2 > p[1]) && p[0] < (x2 - x1) * (p[1] - y1) / (y2 - y1) + x1) c = !c; } return c; };
  const ringsOf = (d) => { const out = []; let x = 0, y = 0; for (const [, cmd, body] of d.matchAll(/([Mlz])([^Mlz]*)/g)) { let n = body.trim() ? body.trim().split(/\s+/).map(Number) : []; if (cmd === 'M') { x = n[0]; y = n[1]; out.push([[x, y]]); n = n.slice(2); } if (cmd !== 'z') for (let i = 0; i < n.length; i += 2) { x += n[i]; y += n[i + 1]; out[out.length - 1].push([x, y]); } } return out; };
  const bad = [];
  for (const u of ctx.D.map.units) { const R = ringsOf(u[3]); for (const p of [[u[4], u[5]], [u[6], u[7]]]) if (!R.some((r) => inside(p, r))) bad.push(u[2] + JSON.stringify(p)); }
  assert.strictEqual(bad.length, 0, bad.join(','));
});
t("검색 ↓/↑ 는 '내 동네로'를 건너뛰고, 조사는 받침에 맞고, 되돌리기는 저장 전 동네로 돌아간다", () => {
  const opts = [{ kind: 'region' }, { kind: 'home' }, { kind: 'region' }, { kind: 'home' }, { kind: 'project' }];
  let a = -1; const seen = []; for (let i = 0; i < 5; i++) { a = ctx.stepOpt(opts, a, 1); seen.push(a); }
  assert.deepStrictEqual(seen, [0, 2, 4, 0, 2]);
  assert.strictEqual(ctx.stepOpt(opts, 1, 1), 2, '보조 단추에서 ↓ 는 다음 결과 줄'); assert.strictEqual(ctx.stepOpt(opts, 0, -1), 4);
  assert.strictEqual(ctx.eul('고양시'), '고양시를'); assert.strictEqual(ctx.eul('계양구'), '계양구를'); assert.strictEqual(ctx.eul('남양주시'), '남양주시를'); assert.strictEqual(ctx.eul('서울 강남'), '서울 강남을');
  const st0 = { home: '41360', view: null }, r = ctx.decidePick(st0, 'search-home', '41280');
  assert(r.save && r.home === '41280'); const u = ctx.undoHome(st0.home); assert.strictEqual(u.home, '41360'); assert(u.save && !u.clear);
  const u0 = ctx.undoHome(null); assert(u0.clear && !u0.save && u0.home === null);
});
t('쉬운 말(G14): 국민 영역 템플릿 문자열(ⓘ 툴팁·담당자 9구역·시안 상태·주석 제외)에 금지어가 없다', () => {
  let src = fs.readFileSync(require('path').join(__dirname, 'template.html'), 'utf8');
  src = src.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<div class="tip"[^>]*popover>[\s\S]*?<\/div>/g, '').replace(/<div class="board">[\s\S]*?<\/main>/, '</main>')
    .replace(/<details class="demo"[\s\S]*?<\/details>/, '').replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
  const [htmlPart, ...scripts] = src.split('<script>');
  const js = scripts.join('\n').replace(/\/\*__SEARCH__\*\//, '');
  const strs = [...js.matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)].map((m) => m[0]);
  const text = htmlPart.replace(/<[^>]+>/g, ' ') + '\n' + strs.join('\n');
  const BAN = ['①', '②', '③', '④', 'BL', 'D-', '원장', '완공 연도 나옴', '아직 모름', '나머지', '단계 구분도', '제곱근'];
  const re = (w) => new RegExp(/^[A-Z]/.test(w) ? `(?<![A-Za-z_$])${w}(?![A-Za-z])` : w);   // 'BL'·'D-' 는 낱말로만(코드 이름 YBL 은 아님)
  const hit = BAN.filter((w) => re(w).test(text)).map((w) => w + ': ' + text.split('\n').find((l) => re(w).test(l)).trim().slice(0, 80));
  assert.strictEqual(hit.length, 0, hit.join(' | '));
});
t("지도 짧은 이름: 시·군·구를 떼고('남양주시' → '남양주', '중구'는 그대로), 같은 시도 안에서 겹치지 않는다", () => {
  const D = ctx.D;
  for (const sd of ['11', '28', '41', '26', '43']) {
    const names = ctx.unitsFor(D, S, sd).map((x) => x.name), m = ctx.shortNames(names), v = names.map((n) => m[n]);
    assert.strictEqual(new Set(v).size, v.length, sd + ' 중복 ' + v.join(','));
    for (const n of names) assert(n.startsWith(m[n]) && m[n].length >= 2, sd + ' ' + n + '→' + m[n]);
  }
  const g = ctx.shortNames(ctx.unitsFor(D, S, '41').map((x) => x.name)); assert.strictEqual(g['남양주시'], '남양주'); assert.strictEqual(g['고양시'], '고양');
  assert.strictEqual(ctx.shortNames(ctx.unitsFor(D, S, '11').map((x) => x.name))['중구'], '중구');
});
t('들어올 해 둘째 줄: 정해진 비율 30% 미만이면 "…만 … · 대부분 아직 계획 단계예요", 30% 이상이면 지금 문장, 0이면 "아직 없어요"', () => {
  assert.strictEqual(ctx.yrLine(299, 1000).join(''), '이 중 299 집만 들어올 해가 정해졌어요 · 대부분 아직 계획 단계예요');
  assert.strictEqual(ctx.yrLine(300, 1000).join(''), '이 중 300 집은 들어올 해가 정해졌어요');
  assert.strictEqual(ctx.yrLine(1268, 112116).join(''), '이 중 1,268 집만 들어올 해가 정해졌어요 · 대부분 아직 계획 단계예요');
  assert.strictEqual(ctx.yrLine(0, 500)[0], '아직 들어올 해가 정해진 집은 없어요');
});
t('일정 시트 묶음: 달별 건수 합 = 전체 n, 종류 칩으로 거른 뒤 합 일치, 지역별 합 = 달별 합, 묶음 안 모집 공고 먼저', () => {
  const D = ctx.D, evs = [];
  for (const [c, rows] of Object.entries(D.prj)) if (c.startsWith('41')) for (const p of rows) if (p[4] >= 0 && p[5] && p[5] >= '2026-10') evs.push({ id: c + p[0], k: p[4], when: p[5], u: p[3], sgg: c });
  const g = ctx.groupByMonth(evs, '2026-10-16'), n = g.reduce((a, x) => a + x.items.length, 0);
  assert.strictEqual(n, evs.length);
  for (const x of g) { const i = x.items.findIndex((e) => e.k !== 0); if (i >= 0) assert(x.items.slice(i).every((e) => e.k !== 0), x.label + ' 모집 공고 먼저'); }
  for (const on of [['sale'], ['build', 'done'], ['sale', 'build', 'done']]) { const f = evs.filter((e) => on.includes(ctx.KIND_CHIP(e.k))); const gg = ctx.groupByMonth(f, '2026-10-16'); assert.strictEqual(gg.reduce((a, x) => a + x.items.length, 0), f.length, on.join()); }
  const ga = ctx.groupByArea(evs, (e) => e.sgg.slice(0, 4)); assert.strictEqual(ga.reduce((a, x) => a + x.items.length, 0), n);
  assert(g.some((x) => /^\d+월$/.test(x.label)), g.map((x) => x.label).join());
});
t("사업 이름 풀어 쓰기: 'A-17'·'S1'·'B3'·'C2' → '(n블록)', '주복1' → '(주상복합 1)', 군더더기 빼기", () => {
  assert.strictEqual(ctx.shortName('남양주왕숙 A-17'), '남양주왕숙(17블록)');
  assert.strictEqual(ctx.shortName('고양창릉 S1'), '고양창릉(1블록)');
  assert.strictEqual(ctx.shortName('하남교산 C2'), '하남교산(2블록)');
  assert.strictEqual(ctx.shortName('부천대장 주복1'), '부천대장 (주상복합 1)');
  assert.strictEqual(ctx.shortName('조달청) 화성동탄 B3 아파트 건설공사 1공구'), '화성동탄(3블록)');
});
t('큰 지도 주소: lib/board/map-href.ts 와 같은 결과(사업 > 시군구 > 시도 > 첫 화면, 구가 있는 경기 시는 ?sido=41&pick=, 수도권 밖 연결점은 null)', () => {
  const src = fs.readFileSync(require('path').join(__dirname, '..', '..', '..', 'lib', 'board', 'map-href.ts'), 'utf8').replace(/export /g, '').replace(/\(o: \{[^}]*\} = \{\}\): string( \| null)? =>/g, '(o = {}) =>');
  const ref = {}; vm.createContext(ref); vm.runInContext(src + '\nthis.mapHref = mapHref; this.mapScopeHref = mapScopeHref;', ref);
  const S1 = [{}, { project: 'PRJ-41360-0001' }, { sgg: '41360' }, { sgg: '41280' }, { sgg: '41110' }, { sgg: '11650' }, { sgg: '28245' }, { sido: '41' }, { sido: '11' }, { sido: '26' }, { sgg: '26110' }];
  for (const o of S1) { assert.strictEqual(ctx.mapHref(o), ref.mapHref(o), JSON.stringify(o)); assert.strictEqual(ctx.mapScopeHref(o), ref.mapScopeHref(o), 'scope ' + JSON.stringify(o)); }
  assert.strictEqual(ctx.mapScopeHref({ sgg: '41280' }), '/map?sido=41&pick=41280'); assert.strictEqual(ctx.mapScopeHref({ sgg: '41360' }), '/map?sgg=41360');
  assert.strictEqual(ctx.mapScopeHref({ sido: '26' }), null); assert.strictEqual(ctx.mapScopeHref({ sgg: '26110' }), null);
  const opts = [{ kind: 'region' }, { kind: 'home' }, { kind: 'map' }, { kind: 'project' }, { kind: 'map' }, { kind: 'region' }];
  assert.strictEqual(ctx.stepOpt(opts, 0, 1), 3, '↓ 는 내 동네로·지도 건너뜀'); assert.strictEqual(ctx.stepOpt(opts, 2, 1), 3); assert.strictEqual(ctx.stepOpt(opts, 4, 1), 5); assert.strictEqual(ctx.stepOpt(opts, 3, -1), 0);
});
t("보기 대상 토글 이름은 '일반사용자'·'정책담당자' (옛 '국민'·'담당자' 버튼 글자 없음)", () => {
  assert(/data-aud="public"[^>]*><span>일반사용자<\/span>/.test(h)); assert(/data-aud="admin"[^>]*><span>정책담당자<\/span>/.test(h));
  assert(!h.includes('>국민<') && !h.includes('>담당자<'));
});
t('.sr 규칙은 한 번만 정의되고 li 에 class="sr" 를 쓰지 않는다(시트 줄은 sli)', () => {
  assert.strictEqual((h.match(/^\.sr \{/gm) || []).length, 1);
  assert(!/<li[^>]*class="[^"]*\bsr\b/.test(h)); assert(h.includes('<li class="sli'));
});
t("운영판 결과 파일의 메뉴 '종합상황판' href 는 /citizen", () => {
  const o = fs.readFileSync(require('path').join(__dirname, '..', '..', '..', 'assets', 'citizen', 'index.html'), 'utf8');
  assert(/routes = \['\/citizen', /.test(o)); assert(o.includes('일반사용자'));
});
const N = 28; console.log(`${pass}/${N} 통과`);
process.exit(pass === N ? 0 : 1);
