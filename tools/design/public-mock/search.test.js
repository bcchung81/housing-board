// 시안 HTML 에서 makeSearch 와 D 를 그대로 떼어 내 시험한다
const fs = require('fs'), assert = require('assert'), vm = require('vm');
const h = fs.readFileSync(require('path').join(__dirname, '..', '..', '..', 'docs', 'design', '대국민-모드-시안.html'), 'utf8');
const code = [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((c) => c.includes('function makeSearch'));
const ctx = {}; vm.createContext(ctx); vm.runInContext(code + '\nthis.makeSearch = makeSearch; this.D = D; this.sumOf = sumOf; this.decidePick = decidePick; this.labelNum = labelNum; this.placeLabels = placeLabels; this.faceLabelOpts = faceLabelOpts; this.shortNames = shortNames; this.shortName = shortName; this.yrLine = yrLine; this.groupByMonth = groupByMonth; this.groupByArea = groupByArea; this.KIND_CHIP = KIND_CHIP; this.mapHref = mapHref; this.mapScopeHref = mapScopeHref; this.geomFor = geomFor; this.inRing = inRing; this.faceH = faceH; this.arcsOf = arcsOf; this.ringArea = ringArea; this.unitsFor = unitsFor; this.rankTop = rankTop; this.statusCounts = statusCounts; this.OF_STAGE = OF_STAGE; this.stepOpt = stepOpt; this.eul = eul; this.undoHome = undoHome; this.ro = ro; this.daysBetween = daysBetween; this.ddayText = ddayText; this.inYear = inYear; this.yearBucket = yearBucket; this.noticeName = noticeName; this.fullDate = fullDate; this.blockOf = blockOf; this.inLabel = inLabel; this.distinctNames = distinctNames; this.geoSido = geoSido; this.searchProjects = searchProjects; this.sp = sp;', ctx);
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
t('보기와 내 동네 분리: 면·순위·카드·이웃·검색은 저장하지 않고([맞아요] 뒤에도), [내 동네로 정하기]·[현 위치]·검색 내 동네로·[맞아요]만 저장한다', () => {
  const mem = { myArea: '41360' }, store = { get: (k) => mem[k] ?? null, set: (k, v) => { mem[k] = v; } };
  let st = { home: store.get('myArea'), view: null };
  const act = (src, code) => { const r = ctx.decidePick(st, src, code); st = { home: r.home, view: r.view }; if (r.save) store.set('myArea', r.home); return r; };
  for (const src of ['face', 'card', 'near', 'search']) { act(src, '41280'); assert.strictEqual(mem.myArea, '41360', src); assert.strictEqual(st.view, '41280'); assert.strictEqual(st.home, '41360'); }
  act('face', '41360'); assert.strictEqual(st.view, null, '내 동네 면은 보기를 내 동네로 되돌린다');
  act('face', '41280'); act('set-home', st.view); assert.strictEqual(mem.myArea, '41280'); assert.strictEqual(st.view, null);
  act('gps', '41360'); assert.strictEqual(mem.myArea, '41360');
  act('search-home', '28245'); assert.strictEqual(mem.myArea, '28245');
  st = { home: null, view: null }; act('face', '41280'); assert.strictEqual(mem.myArea, '28245', '첫 방문 둘러보기는 저장 안 함');
  act('yes', '41'); assert.strictEqual(mem.myArea, '41'); act('face', '41280'); assert.strictEqual(mem.myArea, '41', '[맞아요] 뒤에도 지도 누름은 보기만'); assert.strictEqual(st.view, '41280');
  for (const src of ['face', 'rank', 'search']) { act(src, '41130'); assert.strictEqual(mem.myArea, '41', src + ' 누름 뒤 myArea 그대로'); }
  act('set-home', st.view); assert.strictEqual(mem.myArea, '41130', '시군구를 고른 뒤 [내 동네로 정하기]로 저장');
  act('search', '26'); assert.strictEqual(mem.myArea, '41130', '다른 시도 보기는 저장 안 함');
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
  assert.strictEqual(ctx.yrLine(299, 1000).join(''), '이 중 299집만 들어올 해가 정해졌어요 · 대부분 아직 계획 단계예요');
  assert.strictEqual(ctx.yrLine(300, 1000).join(''), '이 중 300집은 들어올 해가 정해졌어요');
  assert.strictEqual(ctx.yrLine(1268, 112116).join(''), '이 중 1,268집만 들어올 해가 정해졌어요 · 대부분 아직 계획 단계예요');
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
t("보기 대상 이름은 '일반사용자'·'정책담당자' (옛 '국민'·'담당자' 버튼 글자 없음)", () => {
  assert(/class="aud-l l-pub" data-aud="public"[^>]*>일반사용자<\/span>/.test(h)); assert(/class="aud-l l-adm" data-aud="admin"[^>]*>정책담당자<\/span>/.test(h));
  assert(!h.includes('>국민<') && !h.includes('>담당자<'));
});
t('머리 줄 스위치(header-unify-spec 1절): role="switch" 두 개(보기 대상·테마), aria-checked·이름, 트랙 48×28·손잡이 22px·누름 44px 이상, lucide 아이콘', () => {
  const sw = [...h.matchAll(/<button[^>]*role="switch"[^>]*>/g)].map((m) => m[0]);
  assert.strictEqual(sw.length, 2, sw.join('\n'));
  assert(sw.some((b) => /id="aud-sw"/.test(b) && /aria-checked="false"/.test(b) && /aria-label="정책담당자 화면"/.test(b)));
  assert(sw.some((b) => /id="theme"/.test(b) && /aria-checked="false"/.test(b) && /aria-label="다크 모드"/.test(b)));
  assert(/\.sw \{[^}]*width: 48px; height: 28px;/.test(h)); assert(/\.sw \.knob \{[^}]*width: 22px; height: 22px;/.test(h));
  const m = h.match(/\.sw::before \{[^}]*top: -(\d+)px; bottom: -(\d+)px;/); assert(m && 28 - 2 + +m[1] + +m[2] >= 44, '누름 칸');
  for (const id of ['i-user', 'i-brief', 'i-sun', 'i-moon']) assert(h.includes(`<symbol id="${id}"`), id);
  assert(!/aria-pressed="(true|false)"><span>(일반사용자|정책담당자)/.test(h), '옛 분절 단추');
});
t('머리 줄 치수(header-unify-spec 3절): 높이 64px(앱 TopNav 처럼 900 이하 48px), 안쪽 폭 100vw 기준 1440px·좌우 28px(1600 이상 1760px), 900 이하 좌우 12px', () => {
  assert(/\.top-in \{[^}]*width: min\(1440px, 100vw\); margin-left: max\(0px, calc\(50vw - 720px\)\); height: 64px;[^}]*padding: 0 28px;/.test(h));
  assert(/min-width: 1600px\) \{ \.top-in \{ width: min\(1760px, 100vw\); margin-left: max\(0px, calc\(50vw - 880px\)\);/.test(h));
  assert(/max-width: 900px\) \{\s*\.top-in \{ height: 48px; width: auto; margin-left: 0; padding: 0 12px; \}/.test(h));
  assert(/\.menu a \{[^}]*height: 64px;/.test(h));
});
t('카드·칸 제목(header-unify-spec 4절): 지도 카드·칸 제목은 Do Hyeon 20px(600 미만 18px), ⓘ 에 정책담당자 화면과 같은 숫자 한 줄', () => {
  assert(/\.mapc-h h2 \{[^}]*font-size: 20px; line-height: 1\.25;/.test(h)); assert(!/\.mapc-h h2 \{[^}]*font-family: var\(--font-sans\)/.test(h));
  assert(/\.cell-h h2 \{[^}]*font-size: 20px;/.test(h));
  assert(/^h1, h2, h3, h4 \{ font-family: var\(--font-display\)/m.test(h));
  assert(h.includes('정책담당자 화면의 ①계획~④모집과 같은 숫자예요'));
});
t('.sr 규칙은 한 번만 정의되고 li 에 class="sr" 를 쓰지 않는다(시트 줄은 sli)', () => {
  assert.strictEqual((h.match(/^\.sr \{/gm) || []).length, 1);
  assert(!/<li[^>]*class="[^"]*\bsr\b/.test(h)); assert(h.includes('<li class="sli'));
});
t("운영판 결과 파일의 메뉴 '종합상황판' href 는 /citizen", () => {
  const o = fs.readFileSync(require('path').join(__dirname, '..', '..', '..', 'assets', 'citizen', 'index.html'), 'utf8');
  assert(/routes = \['\/citizen', /.test(o)); assert(o.includes('일반사용자'));
});
t('지도 누름은 저장하지 않는다: [맞아요]로 시도(41)만 정한 뒤 지도 면·순위·검색 지역을 눌러도 myArea 는 41 그대로, 보기만 바뀐다', () => {
  for (const src of ['face', 'rank', 'search', 'near', 'card']) { const r = ctx.decidePick({ home: '41', view: null }, src, '41130'); assert(!r.save, src); assert.strictEqual(r.home, '41'); assert.strictEqual(r.view, '41130'); }
  const r = ctx.decidePick({ home: '41360', view: null }, 'face', '41130'); assert(!r.save && r.home === '41360');
});
t("날짜 칩: 날짜까지 모르는 일정('2026-10'·'2027')은 칩 없이 쓰고, 화면에 '날짜 미정' 칩이 없다", () => {
  assert.strictEqual(ctx.ddayText('2026-10', '2026-10-17'), ''); assert.strictEqual(ctx.ddayText('2027', '2026-10-17'), '');
  assert(!h.includes('날짜 미정'), '날짜 미정 글자');
});
t('남은 날: 자정 기준 정수 — 10/17 에서 10/30 은 13일, 같은 날은 오늘, 지난 날·90일 넘으면 비움', () => {
  assert.strictEqual(ctx.daysBetween('2026-10-17', '2026-10-30'), 13); assert.strictEqual(ctx.ddayText('2026-10-30', '2026-10-17'), '13일 남음');
  assert.strictEqual(ctx.ddayText('2026-10-17', '2026-10-17'), '오늘'); assert.strictEqual(ctx.ddayText('2026-10-16', '2026-10-17'), ''); assert.strictEqual(ctx.ddayText('2027-03-01', '2026-10-17'), '');
  assert.strictEqual(ctx.daysBetween('2027-03-27', '2027-03-29'), 2, '서머타임 없는 자정 차');
});
t("조사: 숫자·영문 뒤는 읽는 소리로 — 'S-12로'·'A-3으로'·'B10으로'·'고양시로'·'서울 강남으로', 'S-10을'·'S-12를'", () => {
  for (const [w, x] of [['S-12', 'S-12로'], ['A-3', 'A-3으로'], ['B10', 'B10으로'], ['고양시', '고양시로'], ['서울 강남', '서울 강남으로'], ['남양주 A-17', '남양주 A-17로'], ['계양구', '계양구로'], ['서울', '서울로']]) assert.strictEqual(ctx.ro(w), x);
  assert.strictEqual(ctx.eul('S-10'), 'S-10을'); assert.strictEqual(ctx.eul('S-12'), 'S-12를'); assert.strictEqual(ctx.eul('고양시'), '고양시를');
  assert(!/'으로 찾아|}'으로/.test(h), "'…'으로 고정 조사");
});
t('시트 종류 칩: 0건 칩은 그리지 않는다(모집 공고 0 같은 칩 없음)', () => {
  assert(/chips\.filter\(\(\[c\]\) => cnt\(c\)\)\.map/.test(h));
});
t('r9-1 검색 줄(599 이하): [내 동네로]·[지도] 단추는 이름 아랫줄, 이름 칸 최소 폭 64px', () => {
  assert(/@media \(max-width: 599px\) \{\s*\/\*[^*]*\*\/\s*\.optrow \{ display: flex; flex-wrap: wrap;[^}]*\}\s*\.optrow > \.opt:not\(\.sethome\) \{ flex: 1 0 100%; \}/.test(h));
  assert(/\.opt \{ display: grid; grid-template-columns: 20px minmax\(64px, 1fr\) auto;/.test(h));
});
t('r9-2 사업 링크는 사업 카드(옆 시트)를 연다 — 요약·일정·사업 칸·시트 줄에 /projects 직접 이동이 없고, 카드 자료 = project-detail(실제가 있으면 실제)', () => {
  const tpl = fs.readFileSync(require('path').join(__dirname, 'template.html'), 'utf8');
  for (const c of ['ne-nm', 'ev', 'srow']) assert(new RegExp(`<a class="${c}" \\$\\{PRJA\\(`).test(tpl), c);
  assert.strictEqual((tpl.match(/data-go="\/projects\?id=/g) || []).length, 1, '자세히 보기(정책담당자 화면) 하나만');
  assert(tpl.includes('자세히 보기(정책담당자 화면)') && tpl.includes('id="pc-back"'));
  const pd = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', '..', '..', 'data', 'board', 'project-detail.json'), 'utf8')).projects;
  const AG = { lh: 'LH', gh: 'GH', sh: 'SH', local: '지자체', mnd: '국방부' }, K = ['SUPPLY_NOTICE', 'CONSTRUCTION_START', 'COMPLETION', 'MOVE_IN'];
  let n = 0;
  for (const [id, x] of Object.entries(pd)) { const d = ctx.D.det[id], st = x.stages || {}; const want = K.map((k) => (st[k]?.actual ? [st[k].actual, 1] : st[k]?.plan ? [st[k].plan, 0] : null));
    if (!x.agency && !want.some(Boolean)) { assert(!d, id); continue; } n++; assert.deepStrictEqual(JSON.parse(JSON.stringify(d)), [AG[x.agency] || '', want], id); }
  const s12 = ctx.D.det['PRJ-41290-0031']; assert.strictEqual(s12[0], 'LH'); assert.deepStrictEqual(JSON.parse(JSON.stringify(s12[1])), [['2026-10', 0], ['2024-12-31', 1], ['2027-07-30', 0], ['2027-11', 0]]);
  assert.strictEqual(ctx.fullDate('2027-07-30'), '2027년 7월 30일'); assert.strictEqual(ctx.fullDate('2027-11'), '2027년 11월'); assert.strictEqual(ctx.fullDate(''), '미정');
  console.log(`  카드 자료 ${n}건 = project-detail`);
});
t("r9-3 들어올 해 = 입주 → 준공 → 원장 다음 일정(준공·입주) → 연도 미정. 과천 S-12 → 2027, '정해짐' 합 = 막대 합(올해~5년 뒤 이후)", () => {
  const D = ctx.D, row = (id) => { const [, c, n] = id.split('-'); return [c, D.prj[c].find((p) => p[0] === n)]; };
  assert.strictEqual(ctx.inYear(D, ...row('PRJ-41290-0031')), '2027');
  assert.strictEqual(ctx.inYear(D, ...row('PRJ-41290-0032')), '2029', '입주 2029-02 가 준공 2027-12 보다 먼저');
  const out = {};
  for (const sd of ['41', '11', '28']) {
    let has = 0, tbd = 0; const Y = [0, 0, 0, 0, 0, 0, 0];
    for (const c of S.regionOf[sd].codes) for (const p of D.prj[c] || []) { if (ctx.OF_STAGE[p[2]] > 3) continue; const b = ctx.yearBucket(D, c, p); Y[b] += p[3]; if (ctx.inYear(D, c, p)) has += p[3]; else tbd += p[3]; }
    assert.strictEqual(Y.slice(0, 6).reduce((a, b) => a + b, 0), has, sd); assert.strictEqual(Y[6], tbd, sd);
    assert.strictEqual(has + tbd, ctx.sumOf(D, S.regionOf[sd].codes).u, sd + ' 합 = 큰 숫자');
    out[sd] = has;
  }
  console.log('  정해짐(호):', JSON.stringify(out));
});
t("r9-6 지도 제목은 두 테마 공통 '높을수록 … 집이 많아요'(색 말 없음), ⓘ 색 설명도 테마 중립", () => {
  assert(h.includes('<span>높을수록 <span class="lg-long">앞으로 들어올 </span>집이 많아요</span>'));
  assert(!/진할수록|가장 옅은 회색/.test(h));
});
t("r9-7 공고 이름: 원래 이름의 블록 표기('S-12'·'C-1')를 살리고 군더더기만 뺀다, 복사 단추 누름 칸 44px", () => {
  assert.strictEqual(ctx.noticeName('과천지식정보타운 S-12'), '과천지식정보타운 S-12');
  assert.strictEqual(ctx.noticeName('조달청)과천주암 C-1BL 공동주택 건설공사 1공구'), '과천주암 C-1');
  assert.strictEqual(ctx.noticeName('고양창릉 A-4BL 아파트 건설공사 1공구'), '고양창릉 A-4');
  assert.strictEqual(ctx.blockOf('과천지식정보타운 S-12'), 'S-12'); assert.strictEqual(ctx.blockOf('인천검단 AA13-1'), 'AA13-1'); assert.strictEqual(ctx.blockOf('고양창릉 S1'), 'S1'); assert.strictEqual(ctx.blockOf('서울공릉 1'), '');
  assert(/\.cp \{[^}]*width: 36px; height: 36px;/.test(h) && /\.cp::before \{ content: ''; position: absolute; inset: -4px; \}/.test(h));
  assert(h.includes("toastMsg(`공고 이름 '${t}'${eul(t).slice(t.length)} 복사했어요`)"));
});
t('r9-10 보이는 h1 = 요약 문장(#sum-h), 담당자 판 제목은 h2, 머리 줄 스위치 사이 세로 구분선 1×20px', () => {
  const tpl = fs.readFileSync(require('path').join(__dirname, 'template.html'), 'utf8');
  assert(/<h1 class="sum-h" id="sum-h">/.test(tpl) && /<h1 class="sum-h zero" id="sum-h">/.test(tpl));
  assert(tpl.includes('<header class="bhead"><h2>') && !/<h1>/.test(tpl));
  assert(/<\/div>\s*<span class="tsep" aria-hidden="true"><\/span>\s*<button type="button" class="sw" id="theme"/.test(tpl));
  assert(/\.tsep \{ flex: none; width: 1px; height: 20px; background: var\(--border\); \}/.test(tpl));
});
t('r9 상위 10 숫자 표기(메인 결정): 상위 10(휴대폰 5)은 반드시 이름 / 숫자 — 자리가 없으면 카드색 알약 + 닻 점 지시선, 실제 상자 검사에서도 빼지 않는다', () => {
  assert(h.includes("const NTOP = narrow ? 5 : 10;"));
  assert(/if \(!at && top\) \{ const pl = [\s\S]{0,1200}?\|\| pl\(near\[0\]\); \}/.test(h), '알약 마지막 수단은 제자리까지 — 빠지지 않음');
  assert(h.includes("if (p.ri < NTOP && p.v) break;") && h.includes("if (p.ri >= NTOP || !p.v) {"), '실제 상자 검사에서 상위 10 두 줄 묶음은 빼지 않음');
  assert(/\.map \.lb-g \.plb \{ fill: var\(--card\); fill-opacity: \.92; stroke: var\(--line2\); stroke-width: 1; \}/.test(h));
  assert(h.includes('r="${p.pill ? 2.5 : 3}"'), '닻 점 지름 5px');
});
const TPL = fs.readFileSync(require('path').join(__dirname, 'template.html'), 'utf8');
t("r10-1 검색 '사업 n개 모두 보기'는 옆 시트(페이지 이동 없음): 시트 건수 = 검색 결과 건수, 머리 '‘ㄱㅇ’ 검색 결과 · 사업 n개'", () => {
  for (const q of ['ㄱㅇ', '남양주', 'rPdid', '과천']) { const r = S.search(q); assert.strictEqual(ctx.searchProjects(S, q).length, r.projects.total, q); }
  assert(S.search('ㄱㅇ').projects.total > 5);
  assert(!TPL.includes('/projects?q='), '정책담당자 /projects 로 가지 않는다');
  assert(TPL.includes("else openSearchSheet(o.q, $('#q'));"));
  assert(TPL.includes("$('#sheet-h').textContent = `‘${SH.q}’ 검색 결과`;") && TPL.includes("$('#sheet-sub').textContent = `사업 ${fmt(items.length)}개`;"));
  assert(/items\.map\(\(x\) => sheetRow\(x, true, homeKey, nm\)\)/.test(TPL), '줄은 시트 줄 모양');
});
t("r10-4 사업 줄 '들어와요' 대신 일정 이름: 고양창릉 A-4 → '입주 2028년 1월', 이름 붙은 해 = 들어올 해(inYear)", () => {
  const D = ctx.D; let n = 0;
  for (const [c, rows] of Object.entries(D.prj)) for (const p of rows) { const y = ctx.inYear(D, c, p), l = ctx.inLabel(D, c, p); if (!y) assert.strictEqual(l, '연도 미정'); else { assert(/^(입주|준공) \d{4}년/.test(l), l); assert.strictEqual(l.slice(3, 7), y, c + p[0]); } n++; }
  const g = Object.entries(D.prj).flatMap(([c, rows]) => rows.filter((p) => p[1] === '고양창릉 A-4BL 아파트 건설공사 1공구').map((p) => ctx.inLabel(D, c, p)));
  assert.deepStrictEqual(g, ['입주 2028년 1월']);
  assert(!/`\$\{x\.yt\} 들어와요`/.test(TPL) && TPL.includes('<span class="when">${x.il}</span>'));
  assert(TPL.includes('사업마다 입주 예정 해(입주 기준)에'), 'ⓘ 입주 기준');
  console.log(`  ${n}건 들어올 때 말 = 들어올 해`);
});
t('r10-5 시트 사업 줄 상태 글자(색 점만이 아님): 호수 아래 상태 + 접근 이름에 포함', () => {
  assert(TPL.includes('<span class="stt"><span class="sr">, </span>${st}</span>'));
  assert(/st = ev \? '' : STATUS\[stOf\(x\.b\)\]\[0\]/.test(TPL));
});
t('r10-6 보기 바뀜 알림: role=status·aria-live=polite 영역이 문서(시트 밖)와 시트 안에 늘 있고, 고르기마다 "○○ 보는 중 · 앞으로 n집"', () => {
  assert(/<div class="sr" role="status" aria-live="polite" aria-atomic="true" id="live"><\/div>/.test(TPL));
  assert(/<aside class="sheet"[\s\S]*?id="sheet-live"[\s\S]*?<\/aside>/.test(TPL), '시트 안 영역');
  assert(!TPL.includes("$('#live').textContent ="), '알림은 say() 하나로');
  assert(TPL.includes("`${nameOf(vr)} 보는 중 · ${amtOf(vr)}`"));
  assert.strictEqual(ctx.sp('1만'), ' '); assert.strictEqual(ctx.sp('9,660'), '');
});
t("r10-8 같은 목록 안 이름 겹침: 고양창릉(4블록) 두 곳은 'A-4'·'S-04'를 덧붙이고, 겹치지 않으면 그대로", () => {
  const D = ctx.D, rows = Object.entries(D.prj).filter(([c]) => c.startsWith('4128')).flatMap(([c, rs]) => rs.map((p) => ({ id: `PRJ-${c}-${p[0]}`, name: p[1] })));
  const m = ctx.distinctNames(rows), v = Object.values(m);
  assert(v.includes('고양창릉(4블록) A-4') && v.includes('고양창릉(4블록) S-04'), v.filter((x) => x.includes('창릉')).join(','));
  for (const pre of ['4136', '41', '11', '28']) { const L = Object.entries(D.prj).filter(([c]) => c.startsWith(pre)).flatMap(([c, rs]) => rs.filter((p) => ctx.OF_STAGE[p[2]] <= 3).map((p) => ({ id: `PRJ-${c}-${p[0]}`, name: p[1] })));
    const vv = Object.values(ctx.distinctNames(L)).filter((x) => !x.startsWith('이름 미정')); assert.strictEqual(new Set(vv).size, vv.length, pre + ' 겹침 ' + vv.filter((x, i) => vv.indexOf(x) !== i).slice(0, 3)); }
  assert.strictEqual(ctx.distinctNames([{ id: 'a', name: '과천지식정보타운 S-12' }]).a, '과천지식정보타운(12블록)');
});
t("r10-9 수도권 밖 IP: /api/v1/geo 의 광주 29·전남 46 → 12, 제주 49 → 50, 수도권·그 밖 시도는 그대로, 모르는 코드는 null", () => {
  assert.strictEqual(ctx.geoSido('29', S), '12'); assert.strictEqual(ctx.geoSido('46', S), '12'); assert.strictEqual(ctx.geoSido('49', S), '50');
  for (const c of ['11', '28', '41', '26', '51', '52', '36']) assert.strictEqual(ctx.geoSido(c, S), c);
  assert.strictEqual(ctx.geoSido('99', S), null); assert.strictEqual(ctx.geoSido(null, S), null);
  assert(TPL.includes("const sd = j && j.sido ? geoSido(String(j.sido), IX) : null;"));
  assert(TPL.includes("(CAPITAL.includes(S.guess) ? CAPITAL : [S.guess, ...CAPITAL])"), '칩 줄 첫 칩 = 추천 시도');
});
t("r10-10 숫자와 '집'(316집·1.6만 집), 큰 지도 링크는 지도 아이콘, 값 0 막대에 '0', 보조 글자 16px(15px 없음)", () => {
  assert(TPL.includes('${sp(labelNum(t.u))}집이 들어와요'));
  assert(TPL.includes("큰 지도에서 보기${ico('map')}</a>`;") && !TPL.includes("큰 지도에서 보기${ico('ext')}"));
  assert(TPL.includes("${y.u ? labelNum(y.u) : '0'}"));
  const pubCss = TPL.slice(TPL.indexOf('<style>'), TPL.indexOf('</style>')).split('\n').filter((l) => /font-size: 15px/.test(l));
  assert(pubCss.every((l) => /^\.mnav a|^\.dir \.t/.test(l)), pubCss.join('\n'));
});
t('r10-7 지도 옆 순위: 내 동네 핀은 이름 칸 밖(순위 숫자 아래)', () => {
  assert(TPL.includes("x.key === homeKey && cap ? `<span class=\"me\" aria-hidden=\"true\">${ico('pin')}</span>` : ''"));
  assert(/\.rank \.rk > \.me \{ grid-column: 1; grid-row: 2;/.test(TPL));
});
t("r10-3 '사업' 칸 = 호수 큰 순(같으면 들어올 해 빠른 순), '다가오는 일정'에 보인 사업은 빼고 채움(dedupPj)", () => {
  assert(TPL.includes("const big = prj.slice().sort((a, b) => b.u - a.u || (a.y || '9999').localeCompare(b.y || '9999')).slice(0, 9);"));
  assert(/function dedupPj\(\)/.test(TPL) && (TPL.match(/dedupPj\(\);/g) || []).length >= 2);
});
t("r10b 메뉴: 일반사용자 관점은 종합상황판·지도 2개, 정책담당자 관점은 5개(가로 메뉴·펼침 메뉴 같은 규칙)", () => {
  const navs = [...TPL.matchAll(/<ul class="menu">([\s\S]*?)<\/ul>|<nav class="mnav"[^>]*><ul>([\s\S]*?)<\/ul>/g)].map((m) => m[1] || m[2]);
  assert.strictEqual(navs.length, 2);
  for (const n of navs) { const li = [...n.matchAll(/<li( class="adm")?><a [^>]*>([^<]+)<\/a>/g)]; assert.deepStrictEqual(li.filter((x) => !x[1]).map((x) => x[2]), ['종합상황판', '지도']); assert.deepStrictEqual(li.map((x) => x[2]), ['종합상황판', '지도', '사업', '지역 공급', '데이터 원본']); }
  assert(TPL.includes('html:not([data-aud="admin"]) :is(.menu, .mnav) li.adm { display: none; }'));
});
t('r10b 시트 [달별|지역별] 누름 칸 44px 이상(34px + 위아래 6px 투명 확장, .seg 가 자르지 않음)', () => {
  assert(/\.seg button::before \{ content: ''; position: absolute; left: 0; right: 0; top: -6px; bottom: -6px; \}/.test(TPL));
  assert(!/\.seg \{[^}]*overflow: hidden/.test(TPL)); assert(34 + 12 >= 44);
});
t('r10b 이름·블록 표기도 같은 서로 다른 사업: 시군구가 다르면 시군구 이름, 같으면 호수를 작은 글자로', () => {
  const D = ctx.D, items = ctx.searchProjects(S, 'ㄱㅇ').map((x) => ({ id: x.id, name: x.name, sgg: x.sgg, u: x.units, stage: x.stage }));
  const nm = ctx.distinctNames(items, D), seen = {}, twins = [];
  for (const x of items) { const k = nm[x.id] + '|' + (nm.sub[x.id] || ''); if (/^이름 미정/.test(nm[x.id])) continue; const same = seen[k] && items.find((y) => y.id === seen[k]); if (same && same.name === x.name && same.sgg === x.sgg && same.u === x.u && same.stage === x.stage) { twins.push(nm[x.id]); continue; } assert(!seen[k] || seen[k] === x.id, '겹침 ' + k); seen[k] = x.id; }
  console.log('  원천 값까지 같은 쌍(구별 불가):', twins.join(', ') || '없음');
  const ga = items.filter((x) => x.name === '가야1 재개발'); assert.strictEqual(ga.map((x) => nm.sub[x.id]).join(','), '935호,933호');
  assert.deepStrictEqual(Object.keys(nm).length, new Set(items.map((x) => x.id)).size, 'sub 는 열거되지 않는다');
  assert(TPL.includes('<small class="nsub">'));
});
const N = 55; console.log(`${pass}/${N} 통과`);
process.exit(pass === N ? 0 : 1);
