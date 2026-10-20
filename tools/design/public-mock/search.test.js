// 시안 HTML 에서 makeSearch 와 D 를 그대로 떼어 내 시험한다
const fs = require('fs'), assert = require('assert'), vm = require('vm');
const h = fs.readFileSync(require('path').join(__dirname, '..', '..', '..', 'docs', 'design', '대국민-모드-시안.html'), 'utf8');
const code = [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((c) => c.includes('function makeSearch'));
const ctx = {}; vm.createContext(ctx); vm.runInContext(code + '\nthis.makeSearch = makeSearch; this.D = D; this.sumOf = sumOf; this.decidePick = decidePick; this.labelNum = labelNum; this.placeLabels = placeLabels; this.faceLabelOpts = faceLabelOpts; this.shortNames = shortNames; this.shortName = shortName; this.groupByMonth = groupByMonth; this.groupByArea = groupByArea; this.KIND_CHIP = KIND_CHIP; this.mapHref = mapHref; this.mapScopeHref = mapScopeHref; this.geomFor = geomFor; this.inRing = inRing; this.faceH = faceH; this.ringArea = ringArea; this.unitsFor = unitsFor; this.rankTop = rankTop; this.stageSums = stageSums; this.yearSums = yearSums; this.unitCodes = unitCodes; this.modeOf = modeOf; this.modeValues = modeValues; this.yearRange = yearRange; this.modeView = modeView; this.headParts = headParts; this.pressMode = pressMode; this.sameMode = sameMode; this.MODE_ALL = MODE_ALL; this.STAGE6 = STAGE6; this.SUPPLY_N = SUPPLY_N; this.STAGE_Q = STAGE_Q; this.classesOf = classesOf; this.OF_STAGE = OF_STAGE; this.stepOpt = stepOpt; this.eul = eul; this.undoHome = undoHome; this.ro = ro; this.daysBetween = daysBetween; this.ddayText = ddayText; this.inYear = inYear; this.yearBucket = yearBucket; this.noticeName = noticeName; this.fullDate = fullDate; this.blockOf = blockOf; this.inLabel = inLabel; this.distinctNames = distinctNames; this.geoSido = geoSido; this.searchProjects = searchProjects; this.sp = sp; this.addrArea = addrArea; this.inDate = inDate; this.inCmp = inCmp; this.dayKey = dayKey; this.noticeList = noticeList; this.noticeStatus = noticeStatus; this.noticePeriod = noticePeriod; this.noticePrice = noticePrice; this.noticeTargets = noticeTargets; this.noticeTitle = noticeTitle; this.noticeType = noticeType; this.widen = widen; this.pnuIndex = pnuIndex; this.neun = neun; this.safeUrl = safeUrl; this.fillNear = fillNear; this.ptXY = Map3D.ptXY; this.bigNum = bigNum;', ctx);
const S = ctx.makeSearch(ctx.D);
const labels = (r) => r.regions.items.map((x) => x.label);
/* 3D 지도 공용 모듈(/map 수도권 개요와 같은 구현): 스크립트·모양은 assets/js/map3d.js·assets/css/map3d.css 에 있고 build.js 가 끼워 넣는다.
   템플릿 <style> 검사는 그 자리표시(/*__MAP3D_CSS__*\/)에 map3d.css 를 넣은 글(빌드와 같은 모양)로 한다 */
const M3 = fs.readFileSync(require('path').join(__dirname, '..', '..', '..', 'assets', 'js', 'map3d.js'), 'utf8');
const M3CSS = fs.readFileSync(require('path').join(__dirname, '..', '..', '..', 'assets', 'css', 'map3d.css'), 'utf8').trim();
const tplStyle = (T) => T.slice(T.indexOf('<style>'), T.indexOf('</style>')).replace('/*__MAP3D_CSS__*/', M3CSS);
let pass = 0; const t = (name, fn) => { try { fn(); pass++; console.log('PASS', name); } catch (e) { console.log('FAIL', name, e.message); } };
t("'ㄱㅇ' 에 계양구가 포함된다", () => { const r = S.search('ㄱㅇ'); assert(labels(r).includes('계양구'), labels(r)); assert(labels(r).some((l) => l.startsWith('고양시')), labels(r)); });
t("'rPdid' 에 계양이 포함된다", () => { const r = S.search('rPdid'); assert(labels(r).includes('계양구')); assert(r.en); assert(r.projects.items.every((p) => p.name.includes('계양'))); });
t("'남양주' 결과의 첫 묶음이 지역이다", () => { const r = S.search('남양주'); assert(r.regions.total > 0 && r.regions.items[0].label === '남양주시'); });
t('없는 말이면 0건이고 후보도 없다', () => { const r = S.search('햏햏햏'); assert.strictEqual(r.regions.total + r.projects.total, 0); assert.strictEqual(r.suggest.length, 0); });
t("'남양쥬' 는 0건이지만 '남양주시' 를 찾으셨나요 후보로 낸다", () => { const r = S.search('남양쥬'); assert.strictEqual(r.regions.total + r.projects.total, 0); assert.strictEqual(r.suggest[0]?.label, '남양주시', JSON.stringify(r.suggest.map((x) => x.label))); assert.strictEqual(r.suggest[0].code, '41360'); });
t("'고양시' 는 구를 묶은 시 단위 항목이 맨 위다", () => { const r = S.search('고양시'); const x = r.regions.items[0]; assert.strictEqual(x.label, '고양시'); assert.strictEqual(x.code, '41280'); assert(x.codes.length >= 2 && x.codes.every((c) => c.startsWith('4128')), x.codes); assert(!labels(r).some((l) => l.startsWith('고양시 ')), labels(r)); for (const q of ['수원시', '성남시', '용인시', '부천시', '안산시', '안양시']) { const y = S.search(q).regions.items[0]; assert(y && y.label === q && /0$/.test(y.code), q); } });
t("'별내' 처럼 색인에 없는 동 이름은 주소 묶음으로 넘긴다", () => { const r = S.search('별내'); assert.strictEqual(r.regions.total + r.projects.total, 0); assert(r.addr && r.addrFirst); });
/* 2026-10-19 수도권 한정: 색인(서울·인천·경기)에 같은 이름 시군구가 없다(인천 중구는 제물포·영종구로 바뀌었고 부산 강서구는 수도권 밖) — 실제 색인은 이름 그대로, 시도를 붙이는 규칙은 작은 표본 색인(DUP)으로 본다 */
const DUP = ctx.makeSearch({ sgg: [['11140', '서울특별시 중구', 0], ['26110', '부산광역시 중구', 0], ['11500', '서울특별시 강서구', 0], ['26440', '부산광역시 강서구', 0], ['26320', '부산광역시 북구', 0], ['27230', '대구광역시 북구', 0]], prj: {} });
t('같은 이름이 둘이면 시도까지 붙는다', () => { assert.strictEqual(JSON.stringify(labels(S.search('중구'))), '["중구"]', '2026-10-19 수도권 한정: 서울 중구 하나'); assert.strictEqual(JSON.stringify(labels(S.search('강서구'))), '["강서구"]', '2026-10-19 수도권 한정'); const r = DUP.search('중구'); const l = labels(r); assert(l.length >= 2 && l.every((x) => / 중구$/.test(x) && x !== '중구'), l); assert(new Set(l).size === l.length); const g = DUP.search('강서구'); assert.strictEqual(JSON.stringify([...labels(g)].sort()), JSON.stringify(['부산 강서구', '서울 강서구'])); });
t("'부산' 검색은 0건(2026-10-19 수도권 한정 — 옛 '부산 큰 숫자' 단언 대체), 경기 검색 숫자 = 상황판 경기 큰 숫자(sumOf ①~④), 모든 지역 항목도 같은 정의", () => {
  const out = S.search('부산'); assert.strictEqual(out.regions.total + out.projects.total, 0, '2026-10-19 수도권 한정: 수도권 밖 지역·사업 없음'); assert(!S.regions.some((r) => !['11', '28', '41'].includes(r.code.slice(0, 2))), '색인 = 수도권만');
  const x = S.search('경기').regions.items.find((r) => r.kind === 'sido' && r.code === '41');
  const big = ctx.sumOf(ctx.D, S.regionOf['41'].codes);
  assert(x, 'no 경기'); assert.strictEqual(x.units, big.u); assert.strictEqual(x.projects, big.n);
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
t('숫자 정의 하나(v7): 요약 합계 = 지도 면 합 = 많은 곳 순위 숫자 — 경기·서울·인천', () => {
  const D = ctx.D;
  for (const sd of ['41', '11', '28']) {   // 2026-10-19 수도권 한정: 부산(26)은 색인에 없다
    const units = ctx.unitsFor(D, S, sd), big = ctx.sumOf(D, S.regionOf[sd].codes);
    assert.strictEqual(units.reduce((a, x) => a + x.u, 0), big.u, sd + ' 면 합');
    assert.strictEqual(units.reduce((a, x) => a + x.n, 0), big.n, sd + ' 사업 수 합');
    const rk = ctx.rankTop(units, null, sd === '26' ? 8 : 5);
    assert.deepStrictEqual(rk.map((x) => x.u), units.filter((x) => x.u > 0).slice(0, rk.length).map((x) => x.u), sd + ' 순위 = 호수 내림차순');
    for (const x of units) { const r = S.regionOf[x.key]; if (r) assert.strictEqual(r.units, x.u, sd + ' 검색 숫자 ' + x.name); }
  }
  assert.strictEqual(S.regionOf['26'], undefined, '2026-10-19 수도권 한정: 옛 부산 154,329 단언 대체 — 부산은 색인에 없다');
  const g = ctx.unitsFor(D, S, '41'), r6 = ctx.rankTop(g, '41630', 5);
  assert.strictEqual(r6.length, 6); assert.strictEqual(r6[5].key, '41630', '순위 밖 보는 곳은 6번째 줄');
  assert.strictEqual(ctx.rankTop(g, '41290', 5).length, 5, '순위 안 보는 곳은 그대로 5줄');
});
t('6단계 줄(2026-10-20 공식 이름): 계획 + 인허가 + 착공 + 모집 호수 합 = 보는 곳 제목 큰 숫자(sumOf), 준공·입주는 큰 숫자 밖 — 시도·시군구 모두', () => {
  const D = ctx.D;
  for (const r of S.regions) { const c = ctx.stageSums(D, r.codes); assert.strictEqual(c[0] + c[1] + c[2] + c[3], r.units, r.label); assert.strictEqual(c.length, 6); }
  assert.deepStrictEqual([...ctx.STAGE6], ['계획', '인허가', '착공', '모집', '준공', '입주'], '단계 이름 6개·순서(원 숫자·옛 3단계 이름 없음)'); assert.strictEqual(ctx.SUPPLY_N, 4);
  /* 준공·입주 줄은 큰 숫자 밖: 준공(6)·입주(7) 사업을 끼워 넣으면 해당 칸만 늘고 큰 숫자(sumOf)는 그대로 */
  const D2 = JSON.parse(JSON.stringify(D)), c0 = S.regionOf['41360'].codes[0]; D2.prj[c0].push(['T1', '시험 준공', 6, 100, -1, ''], ['T2', '시험 입주', 7, 40, -1, '']);
  const a0 = ctx.stageSums(D, S.regionOf['41360'].codes), a1 = ctx.stageSums(D2, S.regionOf['41360'].codes);
  assert.strictEqual(a1[4] - a0[4], 100); assert.strictEqual(a1[5] - a0[5], 40); assert.strictEqual(ctx.sumOf(D2, S.regionOf['41360'].codes).u, ctx.sumOf(D, S.regionOf['41360'].codes).u, '큰 숫자는 준공·입주를 세지 않는다');
  const c = ctx.stageSums(D, S.regionOf['41360'].codes); console.log('  남양주시 띠:', c.join(' · '));
});
t('지도 라벨(v7d): 값 = 원장 값(1만 이상 0.1만 단위), 면 위 라벨끼리 겹침 0, 가장 큰 값이 먼저', () => {
  const D = ctx.D, L = ctx.labelNum;
  assert.strictEqual(L(16388), '1.6만'); assert.strictEqual(L(23592), '2.4만'); assert.strictEqual(L(3885), '3,885'); assert.strictEqual(L(10330), '1만'); assert.strictEqual(L(10609), '1.1만'); assert.strictEqual(L(21618), '2.2만');
  const g = ctx.geomFor(D, S, 760, 430, false), units = ctx.unitsFor(D, S, '41').filter((x) => x.u > 0), lp = Object.fromEntries(g.own.map((o) => [o.code, o.lp]));
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
    const g = ctx.geomFor(D, S, 760, 430, false), lp = Object.fromEntries(g.own.map((o) => [o.code, o.lp]));
    const units = ctx.unitsFor(D, S, sd).filter((x) => x.u > 0 && lp[x.key]);
    const cands = units.map((x, i) => { const v = ctx.labelNum(x.u), w = v.length * 8 + 6; return { key: x.key, v, force: i < 5, opts: ctx.faceLabelOpts(lp[x.key][0], lp[x.key][1], w, 20) }; });
    const out = ctx.placeLabels(cands, []), shown = new Set(out.map((o) => o.key));
    for (const x of units.slice(0, 5)) assert(shown.has(x.key), sd + ' 상위 5 ' + x.name);
    const hp = (p, q) => Math.abs(p.x - q.x) * 2 < p.w + q.w + 4 && Math.abs(p.y - q.y) * 2 < p.h + q.h + 4;
    for (const c of cands.filter((c) => !shown.has(c.key))) { const before = out.filter((o) => cands.findIndex((x) => x.key === o.key) < cands.indexOf(c)).map((o) => o.at); assert(c.opts.every((o) => before.some((b) => hp(o, b))), sd + ' 그리디 ' + c.key); }
    console.log(`  ${sd} 라벨 ${out.length}/${units.length}곳`);
  }
});
t('선택 안정(G16): 지도 기하(geomFor)는 무대 크기·휴대폰 여부만 받는다(판 = 수도권 세 시도 — 서울·인천·경기 보기 모두 같은 범위·배율) — 같은 입력이면 같은 값, 라벨 점은 다듬은 면 안, k 는 0.6~0.8(판 상자·무대로만), 섬 지역(강화·옹진)은 판에 없다(삽입 지도도 없음)', () => {
  assert.strictEqual(ctx.geomFor.length, 5, '인자: D, IX, W, H, 휴대폰(시도는 받지 않는다)');
  for (const [sd, W, H, nar] of [['41', 760, 430, false], ['11', 1000, 640, false], ['28', 760, 430, false], ['41', 366, 250, true]]) {
    const a = ctx.geomFor(ctx.D, S, W, H, nar), b = ctx.geomFor(ctx.D, S, W, H, nar);
    assert.deepStrictEqual(a, b, sd + ' 같은 입력 같은 값');
    for (const o of a.own) assert(o.rings.some((r) => ctx.inRing(o.lp, r.pts)), sd + ' 라벨 점 ' + o.code);
    assert(a.k >= .6 && a.k <= .8, sd + ' k ' + a.k);
    assert(a.Hmax0 === Math.max(16, Math.min(48, Math.round(H * .08))), sd + ' Hmax ' + a.Hmax0);
  }
  const ic = ctx.geomFor(ctx.D, S, 760, 430, false);
  assert(!ic.own.some((o) => ['28710', '28720'].includes(o.code)) && !ic.inset, '섬 면·섬 삽입 지도 없음');
  /* 판 = 섬을 뺀 수도권 세 시도 본토 면 전부(영종구 포함), 맥락 시도 없음. 범위 = 본토 면 상자(섬이 넓히지 않는다) */
  const drawn = ic.own.map((o) => o.code).sort();
  assert.strictEqual(drawn.join(), ctx.D.map.units.map((u) => u[0]).filter((c) => ['11', '28', '41'].includes(c.slice(0, 2)) && !['28710', '28720'].includes(c)).sort().join(), '본토 면 전부');
  assert(drawn.includes('28155'), '영종구는 판에 있다');
  const P = ic.own.flatMap((o) => o.rings.flatMap((r) => r.pts)), xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
  assert(Math.min(...xs) >= 0 && Math.max(...xs) <= 760 && Math.min(...ys) >= 0 && Math.max(...ys) <= 430, '본토 판이 무대 안');
  assert(Math.min(...xs) < 30 || Math.max(...xs) > 730 || Math.max(...ys) > 400, '본토 판이 무대를 가득 쓴다(섬 칸 여백 없음)');
  /* 보는 곳이 강화·옹진(판에 면 없음)이어도 깨지지 않는다: 면·점·핀·솟음 시작점은 면이 없으면 건너뛴다(인천 시도 보기와 같은 지도) */
  const T0 = fs.readFileSync(require('path').join(__dirname, 'template.html'), 'utf8'), body = (nm) => { const i = T0.indexOf(`function ${nm}(`); return T0.slice(i, T0.indexOf('\n}\n', i)); };
  assert(!/function (mcXY|openPrjOnMap|openMapCard)\(|\.mapcard/.test(T0), '지도 위 사업 카드는 2026-10-19 청약 단지 카드로 바뀌며 지웠다(사업 점도 같은 날 지움)');
  assert(body('drawOverlay').includes("f = hk && VIEW.G.F.find((x) => x.x.key === hk && !x.inset)") && body('drawOverlay').includes('else if (f)'), '핀: 면이 없으면 없음');
  assert(body('paintSelection').includes("if (document.getElementById('f-' + S.mapAt))"), '키보드 위치: 면이 있을 때만');
  for (const sd of ['11', '28', '41']) assert(ic.own.some((o) => o.code.startsWith(sd)), sd + ' 면이 판에 있다');
  assert.strictEqual(ic.ctx.length, 0, '맥락 시도 없음');
});
t('경계 다듬기: 공유 호를 한 번만 다듬어 이웃 면끼리 같은 좌표 — 이웃과 맞닿은 조각은 이웃 고리에 같은 점열(방향만 반대일 수 있음)로 있다(틈·겹침 0), 0길이 변 0', () => {
  for (const sd of ['41', '11', '28']) {
    const g = ctx.geomFor(ctx.D, S, 760, 430, false), sig = (pts) => pts.map((p) => p.join(',')).join(';');
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
t('면 높이(v7e): h = 4 + (Hmax − 4)·(u/umax)^0.75, 0호는 0 — 시도마다 배율 하나라 호수 순위 = 높이 순위(Spearman 1), 같은 호수는 같은 높이', () => {
  const D = ctx.D;
  const rank = (a) => { const o = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]), R = []; for (let i = 0; i < o.length;) { let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++; for (let k = i; k <= j; k++) R[o[k][1]] = (i + j) / 2 + 1; i = j + 1; } return R; };
  for (const sd of ['11', '28', '41']) for (const Hm of [16, 30, 44]) {
    const us = ctx.unitsFor(D, S, sd).map((x) => x.u), h = ctx.faceH(us, 4, Hm), umax = Math.max(...us);
    us.forEach((u, i) => { if (!u) assert.strictEqual(h[i], 0); else assert(Math.abs(h[i] - (4 + (Hm - 4) * Math.pow(u / umax, .75))) < 1e-9); us.forEach((v, j) => { if (v === u) assert.strictEqual(h[j], h[i]); if (v > u) assert(h[j] > h[i]); }); });
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
  const BAN = ['①', '②', '③', '④', 'BL', '원장', '완공 연도 나옴', '아직 모름', '나머지', '단계 구분도', '제곱근'];
  const re = (w) => new RegExp(/^[A-Z]/.test(w) ? `(?<![A-Za-z_$])${w}(?![A-Za-z])` : w);   // 'BL' 은 낱말로만(코드 이름 YBL 은 아님). 다음 준공 칩은 2026-10-19 'D-13' → '13일 뒤'(일반사용자 화면 'D-' 금지)
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
t('요약 표 큰 숫자 줄은 지도 모드를 따른다(2026-10-18 통합 요약 표): 전체 · 해 · 단계 이름 + 숫자(숫자 조각만 주색) — 들어올 해 정해짐 줄 없음(사업 일정표가 일정을 맡는다)', () => {
  const YBLT = ['2026년(올해)', '2027년', '2028년', '2029년', '2030년', '2031년 이후', '연도 미정'];
  assert.deepStrictEqual([...ctx.headParts(ctx.MODE_ALL, 16388, YBLT)], ['공급 예정 호수', '1만 6,388', '호']);
  assert.deepStrictEqual([...ctx.headParts({ k: 'y', i: 2 }, 9660, YBLT)], ['2028년 공급 호수', '9,660', '호']);
  assert.deepStrictEqual([...ctx.headParts({ k: 's', i: 2 }, 9660, YBLT)], ['착공', '9,660', '호']);
  assert(!/yrLine|class="yr-l"/.test(fs.readFileSync(require('path').join(__dirname, 'template.html'), 'utf8')), '들어올 해 정해짐 줄 없음');
  { const T = fs.readFileSync(require('path').join(__dirname, 'template.html'), 'utf8'); assert(!T.includes('그 비율이 낮으면') && /id="tip-head" popover>[^\n]*<p id="tip-head-hh"><\/p><\/div>/.test(T), 'ⓘ: 옛 비율 막대 설명은 빼고 가구 증가 한 줄 자리(2026-10-18 사업 일정표)'); }
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
t('머리 줄 스위치(header-unify-spec 1절): role="switch" 보기 대상 하나·테마 둘(머리 줄 / 599 이하 메뉴 펼침, 한 번에 하나만 보임), aria-checked·이름, 트랙 48×28·손잡이 22px·누름 44px 이상, lucide 아이콘', () => {
  const sw = [...h.matchAll(/<button[^>]*role="switch"[^>]*>/g)].map((m) => m[0]);
  assert.strictEqual(sw.length, 3, sw.join('\n'));
  assert(sw.some((b) => /id="theme-m"/.test(b) && /class="sw sw-theme"/.test(b) && /aria-label="다크 모드"/.test(b)), '메뉴 펼침 테마 스위치');
  assert(/@media \(max-width: 599px\) \{[^}]*\}\s*\.tools > \.sw-theme, \.tsep \{ display: none; \}/.test(h), '599 이하 머리 줄 테마 스위치·구분선 숨김');
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
t('카드·칸 제목(header-unify-spec 4절): 지도 카드·칸 제목은 Noto Sans KR 700 · 카드 제목 역할(--fs-h2 20), ⓘ 에 정책담당자 화면과 같은 숫자 한 줄', () => {
  assert(/\.lg-h \{[^}]*font-size: var\(--fs-h3\); line-height: var\(--lh-sub\);/.test(h) && /\.hb-t \{[^}]*font-size: var\(--fs-h3\); line-height: var\(--lh-sub\);/.test(h)); assert(!/\.(lg-h|hb-t) \{[^}]*font-family: var\(--font-sans\)/.test(h));   // 2026-10-18 지도 카드 제목 = 머리 띠 h1, 레일 범례 제목 h3
  assert(/\.cell-h h2 \{[^}]*font-size: var\(--fs-h2\);/.test(h));
  assert(/^\s*h1, h2, h3, h4 \{ font-weight: 700;/m.test(h));
  assert(h.includes('정책담당자 화면의 계획~모집 단계와 같은 숫자예요'));
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
t('r9-2 사업 링크는 사업 카드(옆 시트)를 연다 — 다음 준공 줄은 사업 찾기 상세, 시트 안 자세히 보기도 사업 찾기 상세(정책담당자 화면 이동 없음), 카드 자료 = project-detail(실제가 있으면 실제)', () => {
  const tpl = fs.readFileSync(require('path').join(__dirname, 'template.html'), 'utf8');
  for (const c of ['srow']) assert(new RegExp(`<a class="${c}" \\$\\{PRJA\\(`).test(tpl), c);   // 2026-10-19 아래 줄 표 줄(.ev)은 청약 단지(청약홈 원문)라 사업 시트를 열지 않는다
  assert(tpl.includes('<a class="nx" href="/citizen/projects?id=${nx.id}" data-go="/citizen/projects?id=${nx.id}" data-k="${nx.k}"'), '다음 준공 줄 = 사업 찾기 상세(2026-10-19 D3)');
  assert.strictEqual((tpl.match(/data-go="\/projects\?id=/g) || []).length, 0, '정책담당자 화면(/projects?id=) 직접 이동 없음');
  assert.strictEqual((tpl.match(/data-go="\/citizen\/projects\?id=\$\{id\}">자세히 보기<\/a>/g) || []).length, 1, '시트 안 하나 = 사업 찾기 상세 (2026-10-19: 지도 위 사업 카드를 지워 2 → 1)');
  assert(!tpl.includes('자세히 보기(정책담당자 화면)') && tpl.includes('id="pc-back"'));
  const pd = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', '..', '..', 'data', 'board', 'project-detail.json'), 'utf8')).projects;
  const AG = { lh: 'LH', gh: 'GH', sh: 'SH', ih: 'iH', local: '지자체', mnd: '국방부' }, K = ['SUPPLY_NOTICE', 'CONSTRUCTION_START', 'COMPLETION', 'MOVE_IN'];
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
t("r9-6 지도 제목은 두 테마 공통 '높을수록 … 호수가 많아요'(색 말 없음), ⓘ 색 설명도 테마 중립", () => {
  assert(h.includes('시군구 면이 높이 솟을수록 공급 예정 호수가 많아요'), '높이 읽는 법은 ⓘ(2026-10-18 지도 카드 제목 = 한 문장 h1, 범례 제목 = 모드 이름)');
  assert(h.includes("const modeName = (m) => (m.k === 'y' ? `${YBL[m.i]} 공급 호수` : m.k === 's' ? `${STAGE6[m.i]} 호수` : '공급 예정 호수');"));
  assert(!/진할수록|가장 옅은 회색/.test(h));
});
t("r9-7 공고 이름: 원래 이름의 블록 표기('S-12'·'C-1')를 살리고 군더더기만 뺀다, 복사 단추 누름 칸 44px", () => {
  assert.strictEqual(ctx.noticeName('과천지식정보타운 S-12'), '과천지식정보타운 S-12');
  assert.strictEqual(ctx.noticeName('조달청)과천주암 C-1BL 공동주택 건설공사 1공구'), '과천주암 C-1');
  assert.strictEqual(ctx.noticeName('고양창릉 A-4BL 아파트 건설공사 1공구'), '고양창릉 A-4');
  assert.strictEqual(ctx.blockOf('과천지식정보타운 S-12'), 'S-12'); assert.strictEqual(ctx.blockOf('인천검단 AA13-1'), 'AA13-1'); assert.strictEqual(ctx.blockOf('고양창릉 S1'), 'S1'); assert.strictEqual(ctx.blockOf('서울공릉 1'), '');
  /* r19: 복사 단추 = 단추 부품 ghost · icon(보이는 36), 누름 칸은 ::before 로 사방 46(안쪽 34 + 6·5 확장) */
  assert(h.includes('class="ui-btn ui-btn-ghost ui-btn-icon cp" data-copy=') && /--btn-h: 36px;/.test(h) && /\.ui-btn::before \{ content: ''; position: absolute; left: 0; right: 0; top: -6px; bottom: -6px; \}/.test(h) && /\.ui-btn-icon::before \{ left: -5px; right: -5px; \}/.test(h));
  assert(h.includes("toastMsg(`공고 이름 '${t}'${eul(t).slice(t.length)} 복사했어요`)"));
});
t('r9-10 보이는 h1 = 요약 문장(#sum-h), 담당자 판 제목은 h2, 머리 줄 스위치 사이 세로 구분선 1×20px', () => {
  const tpl = fs.readFileSync(require('path').join(__dirname, 'template.html'), 'utf8');
  assert(tpl.includes('<h1 class="ui-h1 sum-h" id="sum-h">') && /<h1 class="ui-h1 sum-h zero" id="sum-h">/.test(tpl));
  assert(tpl.includes('<header class="bhead"><h2 class="sr">') && !/<h1>/.test(tpl));
  assert(/<\/div>\s*<span class="tsep" aria-hidden="true"><\/span>\s*<button type="button" class="sw sw-theme" id="theme"/.test(tpl));
  assert(/\.tsep \{ flex: none; width: 1px; height: 20px; background: var\(--border\); \}/.test(tpl));
});
t('r15 지시선 없음(2026-10-17 사용자 지시): 두 줄이 면 안에 안 들어가면 자기 면 라벨 점 위(±6px)에 옅은 바탕 — 상위 5·내 동네는 반드시, 그 밖은 이름 한 줄 또는 생략', () => {
  for (const k of ['lb-ld', 'lb-ldc', 'lb-dot', 'data-lead', '.lead', 'lead:', 'leads', 'sideOpts', 'ringOpts', 'poolOpts', 'cornerY']) assert(!h.includes(k), '지시선 잔재 ' + k);
  assert(h.includes("const NTOP = narrow ? 5 : 10;"));
  assert(h.includes("const onPt = (w, h) => { const P = []; for (let dy = -(h / 2 - 4); dy <= h / 2 - 4; dy += 4) for (let dx = -(w / 2 - 4); dx <= w / 2 - 4; dx += 4)"), '옅은 바탕 자리는 상자가 자기 면 라벨 점을 덮는 곳뿐');
  assert(h.includes("const ri = rkOf.get(x.key), must = (!opt.strict && !!x.u && ri < 5) || x === hm;") && h.includes("VIEW.labels = Map3D.labels(g, VIEW.G, VIEW.units, { homeKey: VIEW.homeKey });") && h.includes("if (!at && must) at = pl(near.find((o) => inStage(o))) || pl(near[0]);"), '상위 5·내 동네는 제자리까지 — 빠지지 않음');
  assert(h.includes("if (p.must) break;") && h.includes("if (!p.must && (p.ri >= NTOP || !p.v)) {"), '실제 상자 검사에서 반드시 보일 곳은 빼지 않음');
  assert(/\.map \.lb-g \.plb \{ fill: none; stroke: none; \}/.test(h) && /\.map \.lb-g\.pl \.lb \{ fill: var\(--foreground\); stroke: var\(--card\); stroke-width: 4px; \}/.test(h), 'r17 넘친 묶음도 흰 상자·알약 없이 글자 + 바탕색 테두리');
});
t('r15·10-18 고른 곳·가리킨 곳 = 띄운 면(그림만 transform, 기하 불변): 검은 굵은 윤곽 없음, 윤곽 = 그 면 단계 계열 ≤1.5px, 고른 곳 5px+그림자·가리킴 2px, 흰 알약·흰 카드(.pill·.lb-hi) 없음, 고른 곳 이름만 굵게, 키보드 초점 고리는 그대로', () => {
  const TPL = fs.readFileSync(require('path').join(__dirname, 'template.html'), 'utf8'), CSS = tplStyle(TPL);
  assert(!/--map-ov-hl|\.ring\b|\.hov\b/.test(M3CSS + M3), '검은 강조선(--map-ov-hl·.ring·.hov) 없음');
  assert(!/\.f:(hover|is\()/.test(CSS) && !/filter: brightness/.test(M3CSS), '면 필터 강조 없음(띄운 사본이 대신)');
  for (let c = 0; c <= 5; c++) assert(new RegExp(`\\.map \\.lift \\.c${c} \\{ --ce: var\\(--map-ov-[0-5]\\); \\}`).test(M3CSS), `c${c} 윤곽 = 단계 계열 토큰`);
  const sw = /\.map \.lift \.up-top \{[^}]*stroke: var\(--ce\); stroke-width: ([\d.]+);/.exec(M3CSS); assert(sw && +sw[1] >= 1 && +sw[1] <= 1.5, '윤곽 1~1.5px');
  assert(M3CSS.includes('.map .lift .on .up, .map .lbls .lb-g.up-on { transform: translateY(-5px); }') && M3CSS.includes('.map .lift .hv .up, .map .lbls .lb-g.up-hv, .map :is(.kb-halo, .kb) { transform: translateY(-2px); }'), '고른 곳 5px · 가리킴·키보드 2px');
  assert(/@media \(prefers-reduced-motion: reduce\) \{ \.map \.lift :is\(\.up, \.up-shd\), \.map \.lbls \.lb-g, \.map :is\(\.kb-halo, \.kb\) \{ transform: none; \} \}/.test(M3CSS), '줄이기 동작이면 띄우지 않음');
  assert(/\.map \.lift \.up-shd \{ fill: color-mix\(in srgb, var\(--map-shade\)/.test(M3CSS) && /\.map \.lift :is\(\.up-side, \.up-w\) \{ fill: color-mix\(in srgb, var\(--c\) \d+%, var\(--map-shade\)\); \}/.test(M3CSS), '바닥 그림자·옆면 = 그늘 섞기');
  { const i = M3.indexOf('  function paintFaces('), b = M3.slice(i, M3.indexOf('\n  }\n', i)); assert(!/setAttribute\('(transform|d)', [^)]*h\b|data-h|faceH|geom\(/.test(b) && b.includes("if (lv === 'on') g.appendChild(el('path', 'up-shd', d));"), '사본은 원래 d 그대로(높이 값·경계 불변), 그림자는 고른 곳만'); }
  assert(CSS.includes('.map .kb-halo { stroke: var(--card); stroke-width: 4.5; }') && CSS.includes('.map .kb { stroke: var(--ring); stroke-width: 2; }'), '키보드 초점 고리 유지');
  for (const k of ['ring-halo', 'lb-hi', 'class="pill"', '.lb-g .pill', 'lb-g.sel .pill', '.lb-g.hov']) assert(!(TPL + M3 + M3CSS).includes(k), '남은 강조형 ' + k);
  assert(M3.includes("g.classList.toggle('dim', !!band && !band.has(k)") && (M3CSS.match(/\.dim\b/g) || []).length === 6, '흐림(.dim)은 범례 구간을 고를 때만(2026-10-19 사용자 결정 — 고른 곳·가리킨 곳 강조에는 쓰지 않는다)');
  assert(CSS.includes('.map .lb-g.sel .lb.nm { font-weight: 700; }') && (CSS.match(/\.lb-g\.sel[^{]*\{[^}]*(fill|stroke):/g) || []).map((m) => m.split(' {')[0]).join() === '.lb-g.sel:not(.pl) .lb', '고른 곳은 이름 굵게 + 선택 색 위 라벨 글자(2026-10-19 사용자 피드백 — 면 위 라벨만, 바탕 판 없음)');
  assert(CSS.includes('.map .lift .on .up .up-top { fill: var(--cz-map-sel); stroke: var(--cz-map-sel-line); stroke-width: 1.5; }'), 'SVG 대체: 고른 곳 띄운 윗면 = 선택 색 · 윤곽 1.5(≤1.5)');
  const body = (nm) => { const i = TPL.indexOf(`function ${nm}(`); return TPL.slice(i, TPL.indexOf('\n}\n', i)); };
  const ov = body('drawOverlay'); assert(/g\.innerHTML = pin \? PINP\(pin\[0\], pin\[1\]\) : '';/.test(ov) && !/rect|textW/.test(ov) && !/hoverKey[^;]*(innerHTML|append|createElement)/.test(ov), '덮는 층은 내 동네 핀 하나뿐(가리킨 면은 라벨 클래스만 — 2026-10-19 .hv)');
  const m3body = (nm) => { const i = M3.indexOf(`  function ${nm}(`); assert(i >= 0, nm); return M3.slice(i, M3.indexOf('\n  }\n', i)); };
  assert(body('paintRings').includes('Map3D.paintFaces(svg, { sel: VIEW.viewKey, hover: VIEW.hoverKey,') && m3body('paintFaces').includes("if (hf && !hf.classList.contains('out')) hf.classList.add('hl');"), '순위 줄에서 가리켜도 면 효과(공용 모듈 칠하기, /map 개요와 같은 구현)');
  assert(!/innerHTML|drawMap|drawBaseLabels/.test(body('paintRings')) && !/innerHTML|draw\(|labels\(/.test(m3body('paintFaces')), '칠하기는 svg·라벨을 다시 만들지 않음(G16)');
});
const TPL = fs.readFileSync(require('path').join(__dirname, 'template.html'), 'utf8');
const GLOBALS = fs.readFileSync(require('path').join(__dirname, '..', '..', '..', 'app', 'globals.css'), 'utf8');
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
  assert(!/`\$\{x\.yt\} 들어와요`/.test(TPL) && TPL.includes('const sub = ev ? NEXT[x.k] : x.il'), '시트 사업 줄 = 들어올 때 말(아래 줄 사업 표는 2026-10-19 청약 단지 카드로 바뀜)');
  assert(TPL.includes('입주 예정 해가 있으면 입주 해, 없으면 준공 해'), 'ⓘ 입주 기준');
  console.log(`  ${n}건 들어올 때 말 = 들어올 해`);
});
t('r10-5 시트 사업 줄 상태 글자(색 점만이 아님): 호수 아래 상태 + 접근 이름에 포함', () => {
  assert(TPL.includes('<span class="stt"><span class="sr">, </span>${st}</span>'));
  assert(/st = ev \? '' : STATUS\[stOf\(x\.b\)\]\[0\]/.test(TPL));
});
t('r10-6 보기 바뀜 알림: role=status·aria-live=polite 영역이 문서에 늘 하나 있고(2026-10-20 팝업은 모달리스라 팝업 안 영역 없음), 고르기마다 "○○ 보는 중 · 앞으로 n호"', () => {
  assert(/<div class="sr" role="status" aria-live="polite" aria-atomic="true" id="live"><\/div>/.test(TPL));
  assert(!TPL.includes('id="sheet-live"'), '팝업 안 영역 없음(바깥 영역이 늘 읽힌다)');
  assert.strictEqual(TPL.split("$('#live').textContent =").length, 2, '알림은 say() 하나로');
  assert(TPL.includes("function say(msg) { $('#live').textContent = msg; }"));
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
  assert.strictEqual(ctx.D.prj['28290'].filter((p) => p[1] === '인천검단 AA13-1').map((p) => p[0]).join(), '0058', '2026-10-20 사용자 결정: 같은 현장(같은 이름·702호) 두 사업을 합쳤다(0064 → 0058 대체) — 겹침 허용 예외 없음');
});
t("r10-9 수도권 밖 IP(2026-10-19 수도권 한정): /api/v1/geo 의 수도권 시도는 그대로, 수도권 밖(광주 29·전남 46·제주 49·부산 26 …)·모르는 코드는 null → 추천 없이 기본 경기(41) 보기 + 시도 고르기", () => {
  for (const c of ['11', '28', '41']) assert.strictEqual(ctx.geoSido(c, S), c);
  for (const c of ['29', '46', '49', '12', '50', '26', '51', '52', '36']) assert.strictEqual(ctx.geoSido(c, S), null, c + ' 2026-10-19 수도권 한정: 옛 전남광주·제주 바꿈(GEO_ALIAS)·그 시도 추천 대체');
  assert.strictEqual(ctx.geoSido('99', S), null); assert.strictEqual(ctx.geoSido(null, S), null);
  assert(TPL.includes("const sd = j && j.sido ? geoSido(String(j.sido), IX) : null;") && TPL.includes("if (sd) { S.guess = sd; S.guessKnown = true;") && TPL.includes("const S = { home: null, view: null, loc: 'guess', guess: '41', guessKnown: !OPS,"), 'null 이면 S.guess 기본 41 그대로(시도 고르기)');
  assert(!TPL.includes('GEO_ALIAS') && TPL.includes("S.guess = geoSido('29', IX) || '41'; S.guessKnown = false;"), '데모 광주 IP 도 오류 없이 기본 경기');
  assert(!TPL.includes("(CAPITAL.includes(S.guess) ? CAPITAL : [S.guess, ...CAPITAL])"), '2026-10-19 안내 줄 시도 칩은 상단 필터 줄로 옮겼다(수도권 밖은 [다른 시도])');
});
t("r10-10 숫자와 '호'(316호·1.6만 호), 큰 지도 링크는 지도 아이콘, 값 0 막대에 '0', 보조 글자 16px(15px 없음)", () => {
  assert(TPL.includes('<span class="sm-k">${k}</span> <span class="nw"><span class="n" title="${fmt(u)}호">${n}</span>${b}</span></h1>'), '2026-10-18 요약 표 큰 숫자 줄: 모드 이름 + 숫자 + 호(headParts)');
  assert(TPL.includes("const bigMap = (sd, viewKey) => mapBtn(scopeHref(sd, viewKey), bigLabel(sd, viewKey), 'big-map')") && !TPL.includes("큰 지도에서 보기${ico('ext')}"), 'r16 큰 지도 = 지도 아이콘 단추');
  assert(TPL.includes('function setYrs() { const { r } = cellScope(); VIEW.Ysc = yearSums(D, r.codes); VIEW.yrs = yearRange(VIEW.Ysc); }'), '해 띠는 값이 있는 첫 해~마지막 해(그 사이 0인 해 포함) — yearRange');
  assert.deepStrictEqual([...ctx.yearRange([0, 518, 9660, 0, 686, 0, 98000])], [1, 2, 3, 4]); assert.deepStrictEqual([...ctx.yearRange([0, 0, 0, 0, 0, 0, 5])], []);
  const pubCss = tplStyle(TPL).split('\n').filter((l) => /font-size: 15px/.test(l));
  assert(pubCss.every((l) => /^\.mnav a|^\.dir \.t/.test(l)), pubCss.join('\n'));
});
t('r10-7 지도 옆 순위: 내 동네 핀은 이름 칸 밖(순위 숫자 아래)', () => {
  assert(TPL.includes("x.key === homeKey && cap ? `<span class=\"me\" aria-hidden=\"true\">${ico('pin')}</span>` : ''"), '2026-10-19 모든 줄에 막대 — 핀은 늘 번호 아래');
  assert(/\.rank \.rk > \.me \{ grid-column: 1; grid-row: 2;/.test(TPL));
});
t("r10b 메뉴: 일반사용자 관점 = 종합상황판·지도·사업 찾기·공급 일정, 정책담당자 관점 5개 — 항목·순서·이름·경로 = lib/shell/menu.ts MENU(가로 메뉴·펼침 메뉴 같은 규칙)", () => {
  const navs = [...TPL.matchAll(/<ul class="menu">([\s\S]*?)<\/ul>|<nav class="mnav"[^>]*><ul>([\s\S]*?)<\/ul>/g)].map((m) => m[1] || m[2]);
  assert.strictEqual(navs.length, 2);
  const MS = fs.readFileSync(require('path').join(__dirname, '..', '..', '..', 'lib', 'shell', 'menu.ts'), 'utf8');
  const MENU = [...MS.matchAll(/\{ id: '(\w+)', href: '([^']+)', label: '([^']+)'([^}]*)\}/g)].map((m) => ({ href: m[2], label: m[3], adm: /adminOnly/.test(m[4]), pub: /publicOnly/.test(m[4]) }));
  assert.strictEqual(MENU.length, 7);
  for (const n of navs) {
    const li = [...n.matchAll(/<li( class="(?:adm|m-pub)")?><a [^>]*>([^<]+)<\/a>/g)];
    assert.deepStrictEqual(li.map((x) => x[2]), MENU.map((m) => m.label));
    assert.deepStrictEqual(li.map((x) => (x[1] || '').replace(/ class="|"/g, '')), MENU.map((m) => (m.adm ? 'adm' : m.pub ? 'm-pub' : '')));
  }
  assert(TPL.includes("const routes = ['/citizen', " + MENU.slice(1).map((m) => "'" + m.href + "'").join(', ') + "];"));
  assert(TPL.includes('html:not([data-aud="admin"]) :is(.menu, .mnav) li.adm { display: none; }') && TPL.includes('html[data-aud="admin"] :is(.menu, .mnav) li.m-pub { display: none; }'));
});
t('r10b 시트 [달별|지역별] 누름 칸 44px 이상(r19: outline 단추 36px + 위아래 6px 투명 확장, .seg 가 자르지 않음)', () => {
  assert(TPL.includes('<button type="button" class="ui-btn ui-btn-outline" data-mode="time" aria-pressed=') && TPL.includes('<button type="button" class="ui-btn ui-btn-outline" data-mode="area" aria-pressed='));
  assert(/\.ui-btn::before \{ content: ''; position: absolute; left: 0; right: 0; top: -6px; bottom: -6px; \}/.test(TPL) && !/\.seg button/.test(TPL));
  assert(!/\.seg \{[^}]*overflow: hidden/.test(TPL)); assert(36 - 2 + 12 >= 44);
});
t('r10b 이름·블록 표기도 같은 서로 다른 사업: 시군구가 다르면 시군구 이름, 같으면 호수를 작은 글자로', () => {
  const D = ctx.D, items = ctx.searchProjects(S, 'ㄱㅇ').map((x) => ({ id: x.id, name: x.name, sgg: x.sgg, u: x.units, stage: x.stage }));
  const nm = ctx.distinctNames(items, D), seen = {}, twins = [];
  for (const x of items) { const k = nm[x.id] + '|' + (nm.sub[x.id] || ''); if (/^이름 미정/.test(nm[x.id])) continue; const same = seen[k] && items.find((y) => y.id === seen[k]); if (same && same.name === x.name && same.sgg === x.sgg && same.u === x.u && same.stage === x.stage) { twins.push(nm[x.id]); continue; } assert(!seen[k] || seen[k] === x.id, '겹침 ' + k); seen[k] = x.id; }
  console.log('  원천 값까지 같은 쌍(구별 불가):', twins.join(', ') || '없음');
  /* 2026-10-19 수도권 한정: 옛 표본 '가야1 재개발'(935호·933호)은 수도권 밖(부산)이라 색인에 없다 — 수도권 원장에는 이름·블록이 같은 서로 다른 사업이 없어 규칙은 만든 표본으로 본다 */
  assert.strictEqual(Object.keys(nm.sub).length, 0, '수도권 ㄱㅇ 결과에는 작은 글자가 필요한 쌍이 없다');
  const fx = [{ id: 'a', name: '가야1 재개발', sgg: '41360', u: 935, stage: 3 }, { id: 'b', name: '가야1 재개발', sgg: '41360', u: 933, stage: 3 }, { id: 'c', name: '보람 재건축', sgg: '41360', u: 100 }, { id: 'd', name: '보람 재건축', sgg: '41290', u: 100 }];
  const nf = ctx.distinctNames(fx, D); assert.strictEqual(['a', 'b'].map((k) => nf.sub[k]).join(','), '935호,933호'); assert.strictEqual(['c', 'd'].map((k) => nf.sub[k]).join(','), '남양주시,과천시');
  assert.deepStrictEqual(Object.keys(nm).length, new Set(items.map((x) => x.id)).size, 'sub 는 열거되지 않는다');
  assert(TPL.includes('<small class="nsub">'));
});
t("r11-1 주소·장소 결과 → 지역(지도 면 단위): 41360112xx → 남양주 41360, PNU 도 앞 5자리, 경기 구는 시(41111 수원 장안구 → 41110 · 41131 성남 수정구 → 41130), 그 밖 구가 있는 시는 시, 모르면 null", () => {
  const A = (c) => ctx.addrArea(S, c);
  assert.strictEqual(A('4136011200'), '41360'); assert.strictEqual(A('4136011299'), '41360'); assert.strictEqual(A('4136011200160840000'), '41360'); assert.strictEqual(A('41360'), '41360');
  assert.strictEqual(A('4111112900'), '41110'); assert.strictEqual(A('4113110100'), '41130'); assert.strictEqual(A('4128110100'), '41280');
  assert.strictEqual(A('5211110100'), null); assert.strictEqual(A('2632010100'), null);   // 2026-10-19 수도권 한정: 전주 완산구·부산 북구는 색인에 없다(옛 '그 시·구 코드' 단언 대체)
  assert.strictEqual(A('99999'), null); assert.strictEqual(A(''), null); assert.strictEqual(A('41'), null);
  for (const k of ['41360', '41110', '41130', '41280']) assert.strictEqual(ctx.unitKey ? ctx.unitKey(k) : k, k);
  /* 화면: 같은 시군구가 여러 줄이면 지역 묶음 맨 위 한 줄('다산동 → 남양주시'), 주소 줄은 줄 누름 = 보기 · [지도] = 큰 지도에서 열기 */
  assert(TPL.includes("merged = Object.keys(aCnt).filter((k) => aCnt[k] > 1 && !inR.has(k))"));
  assert(TPL.includes("`${esc(q)} · <b>${esc(nameOf(x))}</b>`"));
  assert(TPL.includes("noHome: inR.has(k) || merged.includes(k)") && TPL.includes("큰 지도에서 ${o.href ? '열기' : '보기'}"));
  const dsn = { '4136011200': 1, '4148012100': 1, '4136011200160840000': 1, '4136011200134730000': 1, '4136011200144380000': 1 };
  const m = TPL.match(/'다산동': \[([\s\S]*?)\],\n  '별내'/); assert(m, '데모 흉내 응답');
  const codes = [...m[1].matchAll(/code: '(\d+)'/g)].map((x) => x[1]); assert.deepStrictEqual(codes.sort(), Object.keys(dsn).sort());
  const keys = codes.map(A); assert.strictEqual(keys.filter((k) => k === '41360').length, 4); assert(keys.includes('41480'));
});
t("r11-2 사업 시트 순서 = 줄에 보이는 날짜(입주 → 준공 → 다음 일정) 가까운 순, 해 묶음 안에서도 월·일 순, 머리 글자 '들어올 날 가까운 순'", () => {
  const D = ctx.D;
  for (const pre of ['41360', '4128', '41', '11', '26']) {
    const rows = Object.entries(D.prj).filter(([c]) => c.startsWith(pre)).flatMap(([c, rs]) => rs.filter((p) => ctx.OF_STAGE[p[2]] <= 3).map((p) => ({ d: ctx.inDate(D, c, p), when: p[5], u: p[3], il: ctx.inLabel(D, c, p), y: ctx.inYear(D, c, p) })));
    rows.sort(ctx.inCmp);
    for (let i = 1; i < rows.length; i++) assert(ctx.dayKey(rows[i - 1].d) <= ctx.dayKey(rows[i].d), pre + ' ' + rows[i - 1].il + ' > ' + rows[i].il);
    for (const x of rows) assert.strictEqual(x.y, x.d.slice(0, 4)); 
    const lab = rows.filter((x) => x.d).map((x) => x.il); assert(lab.every((l) => /^(입주|준공) /.test(l)));
  }
  assert.strictEqual(ctx.dayKey('2027-08'), '2027-08-32'); assert(ctx.dayKey('2027-08-15') < ctx.dayKey('2027-08')); assert(ctx.dayKey('2027-12') < ctx.dayKey('2027')); assert(ctx.dayKey('2027') < ctx.dayKey(''));
  assert(TPL.includes('return out.sort(inCmp);') && TPL.includes('.sort(inCmp) }));') && TPL.includes("' · 들어올 날 가까운 순'") && !TPL.includes('다음 일정이 가까운 순'));
});
t("r13 '다가오는 일정' 칸(#c-ev)은 없애고 '언제 들어오나' 칸 오른쪽 '다가오는 준공·입주' + 일정 전체 시트(처음부터 전부)로 흡수", () => {
  assert(!TPL.includes('id="c-ev"') && !TPL.includes('그다음 일정'));
  // r17 신문 1면: 아래 단의 '다가오는 준공·입주' 목록은 빼고, 가장 가까운 준공·입주는 헤드라인 단 '다음 준공' 줄, 일정 전체는 '일정 n ›' 시트(모든 폭)
  assert(!TPL.includes('<h3>다가오는 준공·입주</h3>') && !TPL.includes('findBtn') && !/countBtn\('(ev|yr|tl)'/.test(TPL), '2026-10-19 아래 줄 = 청약 단지 카드 한 장: 머리 개수 단추 없음(옛 일정·해별·사업 단추 없음)');
  assert(TPL.includes("const nx = eventsOf(r.codes).filter((e) => e.k >= 2)") && TPL.includes('<span class="k">다음 ${NEXT[nx.k]}</span>'), '다음 준공·입주 줄');
});
t("r11-5 [다른 동네]·[바꾸기]: 빈 입력 대신 목록을 바로 펼친다 — 안내 '초성(ㄱㅇ)이나 동 이름으로도 찾아요', 수도권 많은 곳 8 + 시도 3, aria-expanded=true", () => {
  assert(TPL.includes("if (t.dataset.act === 'pick') { S.q = ''; input.value = ''; S.sidos = false; S.pickAll = true; S.open = true;"));
  const br = TPL.slice(TPL.indexOf('if (S.open && !q && S.pickAll)'), TPL.indexOf('if (S.open && !q && S.sidos)'));
  assert(!br.includes('초성(ㄱㅇ)이나 동 이름으로도 찾아요') && br.includes("$('#ac-note').innerHTML = '';") && TPL.includes('<span class="sr" id="q-help">초성(ㄱㅇ)이나 영문 자판(rPdid)으로 쳐도 찾습니다.') && br.includes("input.setAttribute('aria-expanded', 'true')") && br.includes('regionOpt(x, opts'), '2026-10-18 서술형 정리: 보이는 안내 줄 없음, 화면 읽기 설명은 유지');
  assert(TPL.includes('placeholder="동네, 사업, 주소 검색"') && !/placeholder="[^"]*초성/.test(TPL) && TPL.includes('<span class="k-cho"><kbd>ㄱㅇ</kbd> 초성 검색</span>') && TPL.includes('.keys > :not(.k-cho) { display: none; }'), '2026-10-19 자리표시 글은 짧게, 초성 안내는 자동완성 판 키 안내 줄(모든 폭)·화면 읽기 설명(q-help)으로');
  const D = ctx.D, top = ['11', '28', '41'].flatMap((sd) => ctx.unitsFor(D, S, sd)).filter((x) => x.u > 0 && S.regionOf[x.key]).sort((a, b) => b.u - a.u).slice(0, 8);
  assert.strictEqual(top.length, 8); assert.strictEqual(S.regions.filter((x) => x.kind === 'sido').length, 3);   // 2026-10-19 수도권 한정: 시도 16 → 3(서울·인천·경기)
  console.log('  많은 곳 8:', top.map((x) => S.regionOf[x.key].label).join(' · '));
});
t("r11-6 범례 '620호 미만'(~ 없음), 지역 줄은 늘 [내 동네로](시도 포함), 같은 이름 시군구는 시도 짧은 이름('부산 북구 보는 중'), ⓘ 16px·제곱근 없음·①② 는 정책담당자 줄에만, 메뉴 Esc", () => {
  assert(TPL.includes('`${fmt(C.br[0])}호 미만`') && !TPL.includes('`~${fmt(C.br[0])}'));   // r16 세로 범례: 맨 아래 칸의 읽는 이름
  assert(!/if \(x\.kind !== 'sgg'\)/.test(TPL.slice(TPL.indexOf('function regionOpt'), TPL.indexOf('function renderAC'))), '시도 줄도 내 동네로');
  assert.strictEqual(DUP.regionOf['26320'].label, '부산 북구'); assert.strictEqual(DUP.regionOf['27230'].label, '대구 북구'); assert.strictEqual(S.regionOf['26320'], undefined); assert.strictEqual(S.regionOf['41360'].label, '남양주시');   // 2026-10-19 수도권 한정: 같은 이름 규칙은 표본 색인(DUP), 실제 색인에 부산 없음 assert.strictEqual(S.regionOf['41281']?.label ?? '고양시 덕양구', '고양시 덕양구');
  assert(TPL.includes('const nameOf = (r) => r.label;') && TPL.includes('${esc(nameOf(v))}</b> 보는 중'));
  assert(/\.tip \{[^}]*font-size: var\(--fs-body\);/.test(TPL));   // 일반사용자 관점 본문 16px(html[data-aud=public])
  const tips = [...TPL.matchAll(/<div class="tip" id="tip-(head|map|pj|src)" popover>([\s\S]*?)<\/div>/g)].map((m) => m[2]);
  assert.strictEqual(tips.length, 4); assert(!tips.join('').includes('제곱근')); assert(TPL.includes('많을수록 높게, 차이가 너무 커 보이지 않게 줄였어요'));
  const circled = tips.join('').split('</p>').filter((p) => /[①②③④]/.test(p)); assert.strictEqual(circled.length, 0, circled.join('|'));   // 2026-10-18 원 숫자 글자 금지(tests/js/citizen-glyphs.test.cjs)
  assert(TPL.includes("if (e.key === 'Escape' && $('#mnav').classList.contains('open')"));
  assert(!/data-act="(sethome|back)"|sum-foot|sum-act/.test(TPL), '요약 아래 [내 동네로 정하기]·[돌아가기] 단추 줄 없음(2026-10-18 사용자 지시)');
});
t("통일-지도 단계: 면 색 클래스 c0~c5 = /map 개요의 --map-ov-0~5, 구간 → 단계 퍼뜨림은 assets/js/overview.js classOf 와 같다(4구간이면 1·2·4·5)", () => {
  const css = tplStyle(TPL);
  for (let i = 0; i <= 5; i++) assert(css.includes(`.c${i} { --c: var(--map-ov-${i}); }`), 'c' + i);
  assert(!/--ch\d|--sw\d|--mline|--hot\b/.test(TPL), '신문판 지도 토큰 없음');
  const J = require(require('path').join(__dirname, '..', '..', '..', 'assets', 'js', 'overview.js'));
  const cut = (a, b) => { const i = TPL.indexOf(a); assert(i >= 0, a); return TPL.slice(i, TPL.indexOf(b, i)); };
  const classesOf = new Function(cut('const nice = ', '\n') + '\n' + cut('function classesOf(', '\n}\n') + '\n}\nreturn classesOf;')();
  for (let n = 1; n <= 5; n++) { const ups = Array.from({ length: n }, (_, i) => (i + 1) * 100), br = ups.slice(0, -1).map((u) => u + 1);
    const C = classesOf(Array.from({ length: 40 }, (_, i) => ({ u: i + 1 })));   // 실제 함수(구간 3개)
    const lv = (r) => (n === 1 ? 3 : 1 + Math.round(((r - 1) * 4) / (n - 1)));
    for (let r = 1; r <= n; r++) assert.strictEqual(lv(r), J.classOf(ups[r - 1], ups), `n=${n} r=${r}`);
    if (n === 4) assert.deepStrictEqual([1, 2, 3, 4].map(C.lv), [1, 2, 4, 5], 'template classesOf.lv'); }
  const C = classesOf([{ u: 0 }, { u: 5 }, { u: 50 }, { u: 500 }, { u: 5000 }, { u: 9000 }, { u: 20 }, { u: 2 }]);
  assert.strictEqual(C.cls(0), 0); assert(C.cls(9000) === 5 && C.cls(2) === 1, JSON.stringify(C.br));
  for (let i = 0; i <= 5; i++) assert(css.includes(`.map .lb.f${i} { fill: var(--map-ov-ink-${i});`), '라벨 글자색 단계 ' + i);
});
/* ---------- r13 지금 신청(모집 공고) ---------- */
const NT = (o) => ({ id: o.id, kind: o.kind || 'rental', title: o.title || '공고 ' + o.id, applyFrom: o.f, applyTo: o.t, url: 'https://www.myhome.go.kr/x?id=' + o.id, ...o.x });
t('r13 공고 거르기·정렬: 마감 ≥ 오늘만, 접수 중(마감 가까운 순) → 접수 예정(시작 가까운 순), 같은 공고는 한 번', () => {
  const T = '2026-10-17';
  const L = [NT({ id: 'past', f: '2026-10-01', t: '2026-10-16' }), NT({ id: 'soon2', f: '2026-10-25', t: '2026-10-30' }), NT({ id: 'open9', f: '2026-10-10', t: '2026-10-26' }),
    NT({ id: 'open0', f: '2026-10-17', t: '2026-10-17' }), NT({ id: 'soon1', f: '2026-10-19', t: '2026-10-27' }), NT({ id: 'open3', f: '2026-10-01', t: '2026-10-20' }), NT({ id: 'open3', f: '2026-10-01', t: '2026-10-20' })];
  assert.strictEqual(ctx.noticeList(L, T).map((n) => n.id).join(), 'open0,open3,open9,soon1,soon2');
  assert.strictEqual(ctx.noticeList([], T).length, 0); assert.strictEqual(ctx.noticeList(null, T).length, 0);
});
t("r13 남은 날 말: '접수 중 · n일 남음'·'오늘 마감'·'접수 예정 · n일 뒤', 기간 '10.19(월)~10.27(화)' — 'D-' 는 쓰지 않는다", () => {
  const T = '2026-10-17';
  assert.strictEqual(ctx.noticeStatus(NT({ id: 'a', f: '2026-10-10', t: '2026-10-20' }), T), '접수 중 · 3일 남음');
  assert.strictEqual(ctx.noticeStatus(NT({ id: 'b', f: '2026-10-10', t: '2026-10-17' }), T), '접수 중 · 오늘 마감');
  assert.strictEqual(ctx.noticeStatus(NT({ id: 'c', f: '2026-10-19', t: '2026-10-27' }), T), '접수 예정 · 2일 뒤');
  assert.strictEqual(ctx.noticePeriod(NT({ id: 'c', f: '2026-10-19', t: '2026-10-27' })), '10.19(월)~10.27(화)');
  const src = TPL.slice(TPL.indexOf('/* ---------- r13 모집 공고'), TPL.indexOf('/* 검색 상자 ↓/↑'));
  assert(!/D-/.test(src) && !/'D-'|`D-/.test(TPL.slice(TPL.indexOf('function paintApply'), TPL.indexOf('function fitApply'))));
});
t("r13 가격은 임대 보증금·월세만('보증금 1,855만 · 월 11.4만'·'1억 1,612만'), 분양은 비움 · 대상 칩은 API targets 또는 제목 · 짧은 이름에 'BL' 없음", () => {
  assert.strictEqual(ctx.noticePrice({ kind: 'rental', deposit: 18551000, monthlyRent: 114150 }), '보증금 1,855만 · 월 11.4만');
  assert.strictEqual(ctx.noticePrice({ kind: 'rental', deposit: 116120000, monthlyRent: 483830 }), '보증금 1억 1,612만 · 월 48.4만');
  assert.strictEqual(ctx.noticePrice({ kind: 'rental', deposit: null, monthlyRent: null }), '');
  assert.strictEqual(ctx.noticePrice({ kind: 'sale', deposit: 300000000 }), '', '분양가는 보이지 않는다');
  assert.strictEqual(ctx.noticeTargets({ title: '하남시 신혼희망타운 행복주택 청년 모집' }).join(), '신혼부부,청년');
  assert.strictEqual(ctx.noticeTargets({ title: '신혼희망타운', targets: ['고령자', '장애인'] }).join(), '고령자', 'API 값이 있으면 그것(다섯 가지만)');
  assert.strictEqual(ctx.noticeTitle('인천계양 A17블록 신혼희망타운(공공분양) 입주자모집공고'), '인천계양 A17블록 신혼희망타운(공공분양)');
  assert.strictEqual(ctx.noticeTitle("양주회천 A25BL 영구임대주택 추가입주자 모집 공고(‘26.09.21)"), '양주회천 A25블록 영구임대주택');
  assert.strictEqual(ctx.noticeTitle('[경기북부] 2026년 4차 비분양전환형 든든전세주택 입주자 모집공고'), '2026년 4차 비분양전환형 든든전세주택');
  assert.strictEqual(ctx.noticeType({ kind: 'sale', supplyType: null }), '공공분양'); assert.strictEqual(ctx.noticeType({ kind: 'sale', supplyType: '민영 분양' }), '민영 분양');
  for (const n of ctx.D.notices) assert(!/(?<![A-Za-z])BL(?![A-Za-z])/.test(ctx.noticeTitle(n.title)), n.title);
});
t('r13 0건 넓히기 순서: 내 동네 → 이웃(D.nb, 시도 경계 넘어) → 같은 시도(2건) → 원장 모집 공고 계획', () => {
  const a = [NT({ id: 'a', f: '2026-10-01', t: '2026-10-30' })], b = [1, 2, 3].map((i) => NT({ id: 'b' + i, f: '2026-10-01', t: '2026-10-30' })), c = [1, 2, 3].map((i) => NT({ id: 'c' + i, f: '2026-10-01', t: '2026-10-30' }));
  assert.strictEqual(ctx.widen(a, b, c).mode, 'own'); const n = ctx.widen([], b, c); assert.strictEqual(n.mode, 'near'); assert.strictEqual(n.items.length, 2);
  assert.strictEqual(ctx.widen([], [b[0]], c).items.map((x) => x.id).join(), 'b1,c1', '이웃 1건이면 시도에서 채움');
  const s2 = ctx.widen([], [], c); assert.strictEqual(s2.mode, 'sido'); assert.strictEqual(s2.items.map((x) => x.id).join(), 'c1,c2');
  assert.strictEqual(ctx.widen([], [], []).mode, 'plan'); assert.strictEqual(ctx.widen(null, null, null).mode, 'plan', '시도 실패(null)도 계획으로');
  assert(ctx.D.nb['41450'].includes('11740') && ctx.D.nb['41450'].includes('41360'), '하남 이웃에 서울 강동·남양주');
  assert(TPL.includes('${esc(neun(nameOf(r)))} 지금 접수 중인 공고가 없어요') && TPL.includes('모집 예정(계획)') && TPL.includes("건</span>${bico('chev', 'inline-end')}"));
  assert.strictEqual(ctx.neun('남양주시'), '남양주시는'); assert.strictEqual(ctx.neun('인천광역시'), '인천광역시는'); assert.strictEqual(ctx.neun('계양구'), '계양구는');
});
t('달력에 넣기 기능 없음: 문구·.ics·text/calendar 0', () => {
  for (const w of ['달력에 넣기', '.ics', 'text/calendar']) assert(!TPL.includes(w), w);
});
t("r13 원장 ④단계 이름 '모집'(배지·시트 칩·사업 카드·검색·ⓘ, 2026-10-20 공식 이름) — '모집 시작'·'모집 끝남' 없음", () => {
  assert(!TPL.includes('모집 시작'), '모집 시작 남음');
  assert(TPL.includes("['모집', '', 'sale']") && TPL.includes("['3', '모집']") && TPL.includes('들어올 사람을 모집하는 공고가 나갔어요') && !TPL.includes('모집 끝남'));
});
t('r13 공고 ↔ 사업은 PNU 로만: A17 pnu 2824510900102770001 = PRJ-28245-0054, 원장 줄 7번째 칸, 이름으로 잇지 않는다', () => {
  const ix = ctx.pnuIndex(ctx.D); assert.strictEqual(ix.get('2824510900102770001'), 'PRJ-28245-0054');
  assert(ix.size >= 6, ix.size);   // 2026-10-19 수도권 한정: 수도권 HOME 262 사업 중 PNU 가 있는 사업은 6곳(옛 전국 1,716곳 — 데이터 전환 전에도 수도권은 6곳)
  const a17 = ctx.D.notices.find((n) => n.pnu === '2824510900102770001'); assert(a17 && a17.sgg === '28245', '데모 표본에 A17');
  const nf = TPL.slice(TPL.indexOf('const noticesForPrj'), TPL.indexOf('/* ---------- ② 3D 지도 카드')); assert(nf.includes('n.pnu && pn.has(n.pnu)') && !/title|name/.test(nf.replace('noticesForPrj', '')), '이름 비교 없음');
});
t('r13 데모 표본: 수도권만, 키·개인 정보 없음, API 와 같은 모양 · 운영판에는 넣지 않는다', () => {
  const ns = ctx.D.notices; assert(ns.length >= 10, ns.length);
  for (const n of ns) { assert(['11', '28', '41'].includes(n.sgg.slice(0, 2)), n.sgg); for (const k of ['id', 'kind', 'title', 'applyTo', 'url']) assert(n[k], k); assert(!/serviceKey|apikey/i.test(JSON.stringify(n))); }
  const ops = fs.readFileSync(require('path').join(__dirname, '..', '..', '..', 'assets', 'citizen', 'index.html'), 'utf8'); assert(!ops.includes('"notices":['), '운영판에 표본 없음');
  assert(ops.includes('/api/v1/notices?'));
});
t("r13 화면 구성: 왼쪽 열 = 요약 카드 하나(눈썹 글·'가장 가까운 일정'·'사업 수' 머리 글 없음, 문장 24px, .ne::before 막대 없음), 아래 줄 2:1, 순위 상위 5 + 보는 곳·내 동네", () => {
  assert(!TPL.includes("'내 동네' : S.view ? '보는 중'") && !TPL.includes('가장 가까운 일정</h3>') && !TPL.includes('<li class="k">사업 수</li>'));
  assert(!TPL.includes('.ne::before') && TPL.includes('<h1 class="ui-h1 sum-h" id="sum-h">') && !/--text-[45]xl/.test(TPL), '한 문장 제목 = .ui-h1(30, 900 이하 24)');
  assert(TPL.includes("grid-template-areas: 'sum map';") && TPL.includes('.bot-row { display: grid; grid-template-columns: minmax(0, 1fr);'), '2026-10-18 아래 줄 = 사업 카드 한 장(전체 폭)');
  const g = ctx.unitsFor(ctx.D, S, '41'), r = ctx.rankTop(g, '41630', 5, '41820');
  assert.strictEqual(r.slice(5).map((x) => x.key).join(), '41630,41820'); assert.strictEqual(ctx.rankTop(g, g[0].key, 5, g[1].key).length, 5);
  assert(TPL.includes('const rankN = (cap) => (cap ? 7 :'));
});
t('r13 지도 맥락 시도 면(--map-ctx + 경계선)과 사업 없음(--map-ov-0) 대비 1.3 이상, 면 위 이름표(--foreground) 4.5:1 이상 — 라이트·다크(globals 값, 점선·빗금 없이)', () => {
  const css = tplStyle(TPL), lum = (x) => { const c = [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255).map((v) => (v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
  const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const G = require(require('path').join(__dirname, '..', '..', '..', 'scripts', 'globals-export.js')).extractExport(fs.readFileSync(require('path').join(__dirname, '..', '..', '..', 'app', 'globals.css'), 'utf8'));
  const blocks = (sel) => [...G.matchAll(new RegExp(`(?:^|\\n)${sel} \\{([^}]*)\\}`, 'g'))].map((m) => m[1]).join('\n');
  for (const [nm, blk] of [['light', blocks(':root')], ['dark', blocks('\\.dark')]]) { const g = (k) => blk.match(new RegExp(`--${k}: (#[0-9A-Fa-f]{6})`))[1]; const r = cr(g('map-ctx'), g('map-ov-0')), tx = cr(g('map-ctx'), g('foreground')); assert(r >= 1.3, nm + ' ' + r.toFixed(2)); assert(tx >= 4.5, nm + ' 이름표 ' + tx.toFixed(2)); console.log(`  ${nm} 맥락(map-ctx)/사업 없음(map-ov-0) ${r.toFixed(2)} · 이름표 ${tx.toFixed(2)}`); }
  assert(/\.map \.ctx \{ fill: var\(--map-ctx\); stroke: var\(--card\);/.test(css), '불투명(옅게 섞지 않음) + 경계선');
});t("r13 오늘 = 이 기기의 실제 날짜(빌드 날짜 고정 아님) · '지도' 메뉴는 내 동네 큰 지도 주소", () => {
  const d = new Date(), today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.strictEqual(ctx.D.meta.today, today); assert(!TPL.includes("'2026-10-16'"));
  assert(TPL.includes("const dday = (w) => { const t = ddayText(w, TODAY);"));
  const f = TPL.slice(TPL.indexOf('function syncMapNav'), TPL.indexOf('function syncMapNav') + 500); assert(f.includes("store.get('myArea')") && f.includes("mapHref({ sgg: unitKey(h.code) })") && f.includes("'/map'"));
  assert.strictEqual(ctx.mapHref({ sgg: '41360' }), '/map?sgg=41360'); assert.strictEqual(ctx.mapHref({ sgg: '41280' }), '/map?sido=41&pick=41280');
});
/* ---------- r14 글꼴 통일 · 이름 · 근처 채우기 · 사업 점 ---------- */
const ROOT = require('path').join(__dirname, '..', '..', '..');
const OPSH = fs.readFileSync(require('path').join(ROOT, 'assets', 'citizen', 'index.html'), 'utf8');
const CSS = tplStyle(TPL);
const noCmt = (x) => x.replace(/\/\*[\s\S]*?\*\//g, '');
t('r14 글꼴: Do Hyeon 참조 0, 외부 글꼴 요청 0, Noto Sans KR 로컬 css 하나(데모판 상대 경로 · 운영판 /assets 경로)', () => {
  for (const [nm, x] of [['template', TPL], ['demo', h], ['ops', OPSH]]) {
    assert(!/Do ?Hyeon|do-hyeon|--font-display/i.test(x), nm + ' Do Hyeon');
    assert(!/fonts\.googleapis|fonts\.gstatic|@import\s+url\(\s*['"]?https?:|<link[^>]+href="https?:[^"]+\.(css|woff2?)/i.test(x), nm + ' 외부 글꼴');
    assert(!/@font-face/.test(x.slice(x.indexOf('<style>'), x.indexOf('</style>'))), nm + ' @font-face 는 로컬 css 파일에만');
  }
  assert(h.includes('<link rel="stylesheet" href="../../assets/fonts/noto-sans-kr/noto-sans-kr.css">'));
  assert(OPSH.includes('<link rel="stylesheet" href="/assets/fonts/noto-sans-kr/noto-sans-kr.css">') && !OPSH.includes('../../assets/'));
  assert(fs.existsSync(require('path').join(ROOT, 'assets', 'fonts', 'noto-sans-kr', 'noto-sans-kr.css')));
  assert(/--font-sans: 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;/.test(h) && !/--font-sans:/.test(CSS), '글꼴 토큰은 globals 내보내기 층에서(템플릿은 정의하지 않는다)');
  assert(!/font-family: (?!inherit|var\(--font-sans\))/.test(CSS.replace(/--font-sans:[^;]*;/, '')), '글꼴 이름을 따로 적은 규칙 없음');
});
t('r14 글자 크기 8단계(12·14·16·18·20·24·30·38) 밖 0, 12px 0(일반사용자 화면), em·rem 크기 0, 지도 라벨 재는 크기 14·16, 토큰 이름·값 = 앱', () => {
  const STEP = [12, 14, 16, 18, 20, 24, 30, 38];   // 2026-10-18 화면 통일: 신문 제목 단계 44·64 없앰
  const px = [...CSS.matchAll(/font-size: *([\d.]+)(px|em|rem)/g)].map((m) => [+m[1], m[2]]).concat([...CSS.matchAll(/font: *(?:\d{3} )?([\d.]+)(px|em|rem)/g)].map((m) => [+m[1], m[2]]));
  const bad = px.filter(([v, u]) => u !== 'px' || !STEP.includes(v));
  assert.strictEqual(bad.length, 0, JSON.stringify(bad));
  assert(!px.some(([v]) => v === 12), '12px 금지');
  const tw = [...M3.matchAll(/textW\([^,]+, (\w+)/g)].map((m) => m[1]); assert(tw.length >= 4 && tw.every((x) => ['14', '16', 'NS'].includes(x)), tw.join()); assert(M3.includes('const NS = 14,') && !TPL.includes('textW('), '지도 라벨 재기는 공용 모듈(assets/js/map3d.js) 한 곳');
  const app = fs.readFileSync(require('path').join(ROOT, 'app', 'globals.css'), 'utf8');
  assert.strictEqual(px.length, 0, '템플릿 글자 크기는 모두 var() 토큰: ' + JSON.stringify(px));
  assert(!/--text-[45]xl|--fs-label-map|--text-[\w-]+:\s*\d|--fs-[\w-]+:\s*\d/.test(CSS), '템플릿은 글자 토큰을 정의하지 않는다');
  for (const k of ['xs', 'sm', 'base', 'md', 'lg', 'xl', '2xl', '3xl']) { const a = app.match(new RegExp(`--text-${k}: (\\d+px);`)), b = h.match(new RegExp(`--text-${k}: (\\d+px);`)); assert(a && b && a[1] === b[1] && STEP.includes(parseInt(b[1], 10)), k); }
  for (const k of ['fs-body', 'fs-table', 'fs-meta', 'fs-legend', 'fs-kpi', 'fs-h1', 'fs-h2', 'fs-h3']) assert(new RegExp(`--${k}: \\d+px;`).test(h), k);
  assert(/html\[data-aud='public'\] \{\s*--fs-body: 16px;\s*--fs-table: 16px;/.test(h), '일반사용자 관점 본문 16(globals 관점 덮어쓰기)');
  assert(/\.map \.lbls \.lb\.nm \{ font-size: var\(--fs-legend\);/.test(CSS) && /\.map \.lbls text \{[^}]*font-size: var\(--text-base\);/.test(CSS), '지도 라벨 이름 14 · 숫자 16');
});
t('r14 굵기는 400·700 두 가지만(500·600·800 0)', () => {
  const w = [...CSS.matchAll(/font-weight: *(\w+)/g)].map((m) => m[1]).concat([...CSS.matchAll(/font: *(\d{3}) /g)].map((m) => m[1]));
  assert(w.length > 20 && w.every((x) => x === '400' || x === '700'), [...new Set(w)].join());
  assert(!/font-(weight|bold)[^;]*\b(500|600|800|900|bold|bolder)\b/.test(TPL.replace(/<style>[\s\S]*<\/style>/, '')), 'JS 안 굵기');
});
t("r14 서비스 이름 '더주택'(2026-10-18 결정 — '주택공급'·'주택파동' 로고 글자 0): 로고 글자·이름표·운영판 제목·og, 로고 글자 --fs-logo 700 (앱 TopNav 와 같은 토큰)", () => {
  for (const x of [TPL, h, OPSH, fs.readFileSync(require('path').join(__dirname, 'build.js'), 'utf8')]) assert(!x.includes('주택파동'));
  assert(TPL.includes('aria-label="더주택 종합상황판 처음으로"') && TPL.includes('<svg class="lk-full" viewBox="0 0 202 64" aria-hidden="true">') && TPL.includes('<svg class="lk-mark" viewBox="4 4 64 60" aria-hidden="true">') && !TPL.includes('class="logo-the"') && !TPL.includes('<span>주택공급</span>'), '로고 = 원본 lockup 벡터 한 벌(글자·굵기 규칙 없음), 이름은 링크 aria-label');
  assert(OPSH.includes('<title>더주택 — 내 동네 공공 주택 공급</title>') && OPSH.includes('content="더주택 — 내 동네 공공 주택 공급"'));
  assert(/\.logo \.lk-full \{ height: var\(--logo-h\); width: auto; \}/.test(CSS) && /\.logo \.lk-mark \{ display: none; width: var\(--logo-mark\); height: var\(--logo-mark\); \}/.test(CSS) && !/--fs-logo/.test(CSS), '앱 TopNav 와 같은 --logo-h · --logo-mark 토큰');
});
t("r14 '지금 신청' 채우기: 넓은 화면에서 내 동네 3건 미만이면 이웃 → 같은 시도로 3건까지('근처에서' 아래), 내 동네와 같은 공고 빼기, 휴대폰은 1건 + 'n건 더'", () => {
  const a = [{ id: 'a1' }], nb = [{ id: 'b1' }, { id: 'a1' }], sd = [{ id: 'b1' }, { id: 'c1' }, { id: 'c2' }];
  assert.strictEqual(ctx.fillNear(a, nb, sd, 2).map((x) => x.id).join(), 'b1,c1');
  assert.strictEqual(ctx.fillNear([{ id: 'a1' }, { id: 'a2' }], [], sd, 1).map((x) => x.id).join(), 'b1');
  assert.strictEqual(ctx.fillNear(a, null, null, 2).length, 0); assert.strictEqual(ctx.fillNear(a, nb, sd, 0).length, 0);
  const f = TPL.slice(TPL.indexOf('function paintApply'), TPL.indexOf('function fitApply'));
  assert(f.includes("fill = r.kind === 'sido' || max < 3 ? [] : fillNear(L, st.near, st.sido, Math.max(0, max - L.length))"), '넓은 화면(칸 3)만 채움 — 휴대폰 1건 + n건 더, 태블릿은 칸 높이 고정이라 채우지 않음, 시도 보기도 채우지 않음');
  assert(f.includes('<p class="ap-near" id="ap-near">근처에서</p><ul class="nts nts-near"'));
  assert(TPL.includes("if (own.ok && st.own.items.length < 3 && !(isS && st.own.items.length))"), '3건 미만이면 이웃·시도도 받는다');
  assert(TPL.includes("el.querySelectorAll('.nts:not(.nts-near) > li:not(.sk)')"), "'n건 더'는 내 동네 공고만 센다");
  assert(TPL.includes("const apMax = () => (matchMedia('(max-width: 599px)').matches ? 1 :"));
});
t('r14 사업 점 투영: 알려진 사업(남양주 PRJ-41360-0188, 정확)이 그 시군구 면 안 · 수도권 정확 점 95% 이상이 자기 면 안(섬 지역은 판에 없다)', () => {
  const D = ctx.D; assert(Object.keys(D.pt).length >= 200 && Object.values(D.pt).every((p) => p.length === 3 && Number.isInteger(p[0]) && Number.isInteger(p[1]) && (p[2] === 0 || p[2] === 1)));
  const uk = (c) => (c.startsWith('41') ? c.slice(0, 4) + '0' : S.regionOf[c]?.parent || c);
  let n = 0, inn = 0;
  for (const sd of ['11', '28', '41']) {
    const g = ctx.geomFor(D, S, 1000, 640, false);
    for (const [id, p] of Object.entries(D.pt)) {
      const k = uk(id.split('-')[1]); if (k.slice(0, 2) !== sd) continue;
      const o = g.own.find((u) => u.code === k), iu = g.inset?.units.find((u) => u.code === k);
      const f = o ? { h: 0 } : iu ? { tf: iu.tf } : null; if (!f) continue;
      const xy = ctx.ptXY(g, f, p), R = o ? o.rings.map((r) => r.pts) : iu.R, ok = R.some((r) => ctx.inRing(xy, r));
      if (id === 'PRJ-41360-0188') assert(ok, '남양주 0188 면 밖 ' + xy);
      if (p[2] === 1) { n++; inn += ok; }
    }
  }
  console.log(`  정확 점 ${inn}/${n} 자기 면 안`); assert(n >= 100 && inn / n >= .95);
});
t('2026-10-19 사업 위치 점 지움(사용자 결정): 점 층(svg.pts·.pts-g·.pts-top)·점 함수(paintPts·maskPts·ptsOf)·점 CSS·점 범례(.lg-pts) 0, 내 동네 핀은 남김, 지도 svg innerHTML 은 공용 모듈 draw 한 곳뿐(G16)', () => {
  const body = (nm) => { const i = TPL.indexOf(`function ${nm}(`); return TPL.slice(i, TPL.indexOf('\n}\n', i)); };
  for (const k of ['svg.pts', 'pts-g', 'pts-top', 'paintPts', 'maskPts', 'ptsOf', 'lg-pts', 'lg-pt', 'ptsw', 'pt-hit', '--pt-ink']) assert(!TPL.includes(k), '점 잔재 ' + k);
  for (const f of ['map3d-gl.js', 'map3d.js']) assert(!/사업 점/.test(fs.readFileSync(require('path').join(ROOT, 'assets', 'js', f), 'utf8')), f + ' 설명에 사업 점 없음');
  { const i = M3.indexOf('  function draw('), d = M3.slice(i, M3.indexOf('\n  }\n', i)); assert.strictEqual((TPL.match(/svg\.innerHTML = /g) || []).length, 0); assert.strictEqual((M3.match(/svg\.innerHTML = /g) || []).length, 1); assert(d.includes('svg.innerHTML = '), '지도 svg innerHTML 은 공용 모듈 draw 한 곳뿐'); assert.strictEqual((TPL.match(/Map3D\.draw\(/g) || []).length, 1); assert(body('drawMap').includes('Map3D.draw('), '그리기를 부르는 곳은 drawMap 하나'); }
  assert(/drawOverlay\(\);\n\}/.test(body('paintSelection') + '\n}'), 'paintSelection 끝 = 덮개(점 층·지도 위 사업 카드 없음 — 카드는 2026-10-19 청약 단지 카드로 바뀌며 지웠다)');
  assert(TPL.includes('PINP(pin[0], pin[1])') && body('drawOverlay').includes('const hk = VIEW.homeKey'), '내 동네 핀은 그대로');
});
t('진짜 3D(GL) 경로도 G16·G15: 고르기·가리키기는 feature-state 만(paintRings → select·hover), 이름표는 같은 마크업(덮개 svg)·같은 반드시 규칙, 사업 점은 같은 점 층에 윗면 높이로, 높이·색은 SVG 판과 같은 값(VIEW.mvals·VIEW.umax·VIEW.all 색 단계) — 위 SVG 단언은 대체 경로(WebGL 없음)에 그대로', () => {
  const body = (nm) => { const i = TPL.indexOf(`function ${nm}(`); return TPL.slice(i, TPL.indexOf('\n}\n', i)); };
  const GLM = fs.readFileSync(require('path').join(__dirname, '..', '..', '..', 'assets', 'js', 'map3d-gl.js'), 'utf8');
  assert(body('paintRings').includes('GLS.map.select(VIEW.viewKey); GLS.map.hover(VIEW.hoverKey);') && !/setFilter|setData|labels\(/.test(GLM.slice(GLM.indexOf('function select('), GLM.indexOf('function setColors('))), '고르기·가리키기 = feature-state 만');
  assert(body('drawBaseLabels').includes('GLS.map.labels(g, VIEW.units, { homeKey: VIEW.homeKey, viewKey: VIEW.viewKey,') && GLM.includes("(!opt.strict && !!x.u && ri < 5) || x.key === opt.homeKey || x.key === opt.viewKey"), '이름표 = 상위 5·내 동네·보는 곳 반드시');
  assert(body('glDraw').includes('GLS.map.setValues(VIEW.mvals, glCls(), { umax: VIEW.umax, duration: 0 });') && TPL.includes('const glCls = () => Object.fromEntries(VIEW.all.map((x) => [x.key, x.c || 0]));'), '높이·색 = 판 하나의 값·배율');
  assert(GLM.includes("return [c, u > 0 ? hmin + (hmax - hmin) * Math.pow(Math.min(1, u / umax), .75) : 0];"), '높이 척도 = faceH(지수 0.75, 0호 0)');
});
/* ---------- r16 사용자 디자인 피드백(2026-10-17): 공고 카드 · 순위 아래 세로 범례 · 아이콘 단추 · 알약형 보조 단추 0 ---------- */
const escT = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const icoT = (id, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const srcOf = (a, b) => { const i = TPL.indexOf(a); assert(i >= 0, a); return TPL.slice(i, TPL.indexOf(b, i)); };
const shown = (html) => html.replace(/<span class="sr">[\s\S]*?<\/span>/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
t("r16-1 공고 카드: 한 건 = 링크 하나(새 창, rel=noopener) · 첫 줄 상태 칩·기간 / 이름 한 줄(말줄임 + title) / 유형·대상·가격 한 줄 · 오른쪽 위 ↗ · '공고 보기' 글자 단추 0", () => {
  const ntRow = new Function('noticeTargets', 'noticePrice', 'noticeType', 'noticeTitle', 'noticeStatus', 'noticePeriod', 'esc', 'safeUrl', 'ico', 'TODAY', 'noticeSpan', srcOf('function ntRow', '\nconst SKEL') + '\nreturn ntRow;')(ctx.noticeTargets, ctx.noticePrice, ctx.noticeType, ctx.noticeTitle, ctx.noticeStatus, ctx.noticePeriod, escT, ctx.safeUrl, icoT, '2026-10-17', ctx.noticeSpan);
  const n = { id: 'x', kind: 'rental', title: '인천계양 A17블록 신혼희망타운 행복주택 청년 입주자모집공고', supplyType: '행복주택', applyFrom: '2026-10-14', applyTo: '2026-10-20', url: 'https://apply.lh.or.kr/x?a=1', deposit: 18551000, monthlyRent: 114150 };
  const li = ntRow(n, '');
  assert(/^<li><a class="ntc ui-inset card-lift" href="https:\/\/apply\.lh\.or\.kr\/x\?a=1" target="_blank" rel="noopener">/.test(li), li.slice(0, 120));
  assert.strictEqual((li.match(/<a /g) || []).length, 1, '카드 안 링크는 하나(카드 자체)');
  assert.strictEqual((li.match(/ui-inset/g) || []).length, 1, '공고 카드 안에 또 안쪽 카드 없음(깊이 2단까지)');
  assert(!/<button/.test(li) && !shown(li).includes('공고 보기'), "'공고 보기' 글자 단추 없음");
  const p1 = li.indexOf('class="nt1"'), p2 = li.indexOf('class="nt2"'), p3 = li.indexOf('class="nt3"'); assert(p1 > 0 && p1 < p2 && p2 < p3, '줄 순서 상태 → 이름 → 유형');
  assert(/<span class="nt-when"><span class="sr">접수 중 · 3일 남음, <\/span><span class="nt-st soon" aria-hidden="true">접수 중<\/span><b class="nt-big" aria-hidden="true">3<small>일<\/small><\/b><span class="nt-suf" aria-hidden="true">남음<\/span><\/span>/.test(li), 'r17 왼쪽 = 상태 · 남은 날 큰 숫자(3일 이하 주홍)');
  assert(/class="nt1"><span class="per">10\.14\(수\)~10\.20\(화\)<\/span>/.test(li), '기간 줄');
  assert(/<span class="ui-chip chip">행복주택<\/span><span class="ui-chip ui-chip-primary chip">신혼부부<\/span><span class="ui-chip ui-chip-primary chip">청년<\/span><span class="pr">보증금 1,855만/.test(li), '유형 칩 · 대상 칩(주홍) · 임대 가격');
  assert(/<span class="nt2" title="인천계양 A17블록[^"]*">/.test(li) && /<span class="nt3" title="[^"]*보증금 1,855만/.test(li), '이름·유형 줄 title(말줄임 대비)');
  assert(li.includes('<svg class="i xi" aria-hidden="true"><use href="#i-ext"/></svg>') && li.includes('<span class="sr">(공고 원문, 새 창)</span>'), '↗ 아이콘 + 화면 읽기 새 창 알림');
  assert(!TPL.includes('공고 보기') && !TPL.includes('class="nt4"') && !/\.nt4\b/.test(CSS), "템플릿 어디에도 '공고 보기'·nt4 없음(사업 카드 공고도 같은 카드)");
  assert(TPL.includes('<div class="pc-nt"><ul class="nts" aria-label="이 사업의 모집 공고">${ntRow(nts[0], \'\')}</ul></div>'));
  assert(/\.ntc > svg\.xi \{ position: absolute; top: 14px; right: 14px;/.test(CSS) && /\.nt2, \.nt3 \{ display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; \}/.test(CSS));
  assert(/\.nts \{[^}]*display: grid; gap: 8px;/.test(CSS) && !/\.nts > li \{[^}]*border/.test(CSS) && !/\.ntc \{[^}]*(border:|box-shadow|background:)/.test(CSS), '공고 = 안쪽 카드(.ui-inset)가 테두리·바탕을 낸다: 줄 목록의 구분선 없음, .ntc 는 테두리·그림자·바탕을 따로 정하지 않는다');
  assert(/\.ntc:hover \{ border-color: var\(--primary\); background: var\(--pn2\); \}/.test(CSS), '가리키면 테두리·면만 바뀐다');
  assert(TPL.includes('<p class="ap-near" id="ap-near">근처에서</p>') && TPL.includes('지금 접수 중인 공고가 없어요'), "'근처에서'·0건 안내 유지");
});
t('r16-2 범례(2026-10-18 레일): 많은 곳 순위 아래, /map 개요 범례와 같은 모양 — 견본 + 구간 글자, 0(없음)부터 커지는 순 · 견본 색 단계 = 면 색 단계 · 제목 = 지도 모드 이름 · 사업 위치 점 · 휴대폰은 가로로 늘어놓기', () => {
  const modeNameT = (m) => (m.k === 'y' ? `${['2026년(올해)', '2027년', '2028년'][m.i]} 공급 호수` : m.k === 's' ? `${ctx.STAGE6[m.i]} 호수` : '공급 예정 호수');
  const fmtT = (v) => Number(v).toLocaleString('en-US'), labelNumT = (v) => (v / 1e4).toFixed(1) + '만';
  const L = new Function('fmt', 'esc', 'modeName', 'TIP_MAP', 'labelNum', srcOf('function legendHtml(', '\n}\n') + '\n}\nreturn legendHtml;')(fmtT, escT, modeNameT, '<b>i</b>', labelNumT);
  const C4 = { br: [1300, 3200, 4900], lv: (r) => [0, 1, 2, 4, 5][r] }, legend = L(C4, ctx.MODE_ALL);
  assert.deepStrictEqual([...legend.matchAll(/<button type="button" class="lg-sw (c\d)" data-lv="(\d)"/g)].map((m) => m[1] + m[2]), ['c00', 'c11', 'c22', 'c44', 'c55'], '가로 계단 막대: 0 → 옅은 → 진한(4구간 = 1·2·4·5), 같은 폭 칸 = 구간 단추(data-lv = 색 단계, 2026-10-19)');
  assert.deepStrictEqual([...legend.matchAll(/class="lg-sw c\d"[^>]* title="([^"]+)" aria-label="([^"]+)"/g)].map((m) => m[1] === m[2] && m[1]), ['사업 없음', '1,300호 미만', '1,300~3,199호', '3,200~4,899호', '4,900호 이상'], '칸 title = 단추 이름 = 정확한 범위(화면 읽기용 목록 대신)');
  assert.deepStrictEqual([...legend.matchAll(/aria-pressed="false" tabindex="(-?\d)"/g)].map((m) => +m[1]), [0, -1, -1, -1, -1], '한 번의 Tab(움직이는 tabindex) · 처음엔 모두 안 눌림'); assert(legend.includes('<div class="lg-bar" data-rove>'), '화살표로 옮김(data-rove — 그라데이션 조각 단추도 같은 묶음 안)');
  /* 2026-10-19 사용자 피드백 '색상 그라데이션으로 표기': 계단 칸 → [사업 없음 견본] + 연속 그라데이션 막대. 색 멈춤 = 구간 가운데에 그 구간의 면 색 단계(var(--map-ov-n) — 램프 덮기·다크를 따른다), 구간 단추 = 같은 폭 조각(--i 번째) */
  assert(legend.includes('<span class="lg-grad" style="--m:4;--lg-stops:var(--map-ov-1) 0%, var(--map-ov-1) 12.50%, var(--map-ov-2) 37.50%, var(--map-ov-4) 62.50%, var(--map-ov-5) 87.50%, var(--map-ov-5) 100%">') && !/#[0-9A-Fa-f]{6}/.test(legend), '그라데이션 색 = 구간 가운데 그 구간 색 단계(1·2·4·5), 값은 토큰(hex 없음)');
  assert.deepStrictEqual([...legend.matchAll(/data-lv="(\d)"[^>]*?(?: style="--i:(\d)")?><\/button>/g)].map((m) => m[2] ?? '-'), ['-', '0', '1', '2', '3'], '사업 없음 견본은 그라데이션 밖, 구간 조각은 0부터 차례');
  assert(legend.indexOf('data-lv="0"') < legend.indexOf('class="lg-grad"'), "'사업 없음' 견본은 그라데이션 왼쪽에 떨어져");
  assert(L({ br: [], lv: () => 3 }, ctx.MODE_ALL).includes('--m:1;--lg-stops:var(--map-ov-3) 0%, var(--map-ov-3) 50.00%, var(--map-ov-3) 100%'), '구간이 하나면 한 색(멈춤 2개 이상 — 그라데이션이 깨지지 않는다)');
  assert.deepStrictEqual([...legend.matchAll(/<span class="lg-tk[^"]*"(?: style="[^"]*")?>([^<]+)<\/span>/g)].map((m) => m[1]), ['없음', '1,300', '3,200', '4,900'], '눈금 글자 = 없음 + 경계값(C.br)만');
  assert(legend.includes('<span class="lg-tk0">없음</span><span class="lg-tks"><span class="lg-tk" style="--x:25.00%">1,300</span><span class="lg-tk" style="--x:50.00%">3,200</span><span class="lg-tk" style="--x:75.00%">4,900</span></span>'), '눈금 = 그라데이션 막대 안 구간 경계 자리(2026-10-19), 없음은 견본 아래');
  assert(!/\d~\d/.test(legend.replace(/(title|aria-label)="[^"]*"/g, '')), "보이는 눈금에 '~n−1' 꼴 없음");
  assert(L({ br: [12000, 20000, 33000], lv: C4.lv }, ctx.MODE_ALL).includes('>1.2만<') && !legend.includes('stag'), '1만 이상 눈금은 약식(labelNum)');
  assert(!/l2/.test(legend) && /class="lg-tk l2"/.test(L({ br: [10000, 20000, 30000, 40000], lv: (r) => r }, ctx.MODE_ALL)), '눈금이 겹칠 만큼 넓으면 한 칸 건너 둘째 줄(.l2), 좁으면 한 줄');
  const order = ['class="lg-h"', 'class="lg-bar"', 'class="lg-ticks"'].map((x) => legend.indexOf(x)); assert(order[0] > 0 && order.every((v, i) => !i || order[i - 1] < v) && !legend.includes('lg-pt'), '제목(모드 이름 ⓘ) → 막대 → 눈금(사업 위치 점 범례는 2026-10-19 지웠다)');
  assert(legend.startsWith('<div class="lgv" role="group" aria-label="바닥 색 구간(공급 예정 호수), 단위 호"><h3 class="lg-h"><span class="lg-t">공급 예정 호수</span><b>i</b></h3>') && !/ui-hud|ui-inset|ui-card/.test(legend), "범례 머리 = 모드 이름 + ⓘ 만('호 호' 없음, 단위는 aria-label), 판 없음");
  assert(L(C4, { k: 'y', i: 2 }).includes('<span class="lg-t">2028년 공급 호수</span>') && L(C4, { k: 's', i: 2 }).includes('aria-label="바닥 색 구간(착공 호수), 단위 호"') && L(C4, { k: 'y', i: 2 }).includes('aria-label="없음"'), '모드 제목 · 0 칸 이름');
  assert(L({ br: [], lv: () => 3 }, ctx.MODE_ALL).includes('title="1호 이상"') && !L({ br: [], lv: () => 3 }, ctx.MODE_ALL).includes('<li>'), '구간이 하나여도 깨지지 않는다');
  const hd = new Function('esc', 'YBL', 'STAGE6', 'areaOf', 'VIEW', srcOf('const modeShort = ', '\nconst zeroWord') + '\nreturn rankHead;')(escT, ['2026년(올해)', '2027년', '2028년'], ctx.STAGE6, () => ({ label: '서울' }), { sd: '11' });
  assert.strictEqual(hd(ctx.MODE_ALL), '<h3>공급 예정 상위 지역</h3><p class="rank-context"><span>서울 · 전체 기간</span><span>단위: 호</span></p>'); assert.strictEqual(hd({ k: 'y', i: 2 }), '<h3>공급 예정 상위 지역</h3><p class="rank-context"><span>서울 · 2028년</span><span>단위: 호</span></p>'); assert.strictEqual(hd({ k: 'y', i: 0 }), '<h3>공급 예정 상위 지역</h3><p class="rank-context"><span>서울 · 2026년</span><span>단위: 호</span></p>'); assert.strictEqual(hd({ k: 's', i: 2 }), '<h3>공급 예정 상위 지역</h3><p class="rank-context"><span>서울 · 착공</span><span>단위: 호</span></p>', '순위 머리가 모드를 따른다');
  assert(TPL.includes("$('#mapc .rank-head')") && TPL.includes('rh.innerHTML = rankHead(curMode())'), '모드가 바뀌면(미리보기 포함) 순위 머리도 갱신');
  assert(TPL.includes("${tband}${legendHtml(VIEW.C, MODE_ALL)}<div class=\"rail\">${list('rank', `<div class=\"rank-head\">${rankHead(MODE_ALL)}</div>`)}</div>") && TPL.includes("$('#mapc').innerHTML = `<div class=\"mapc-b${cap ? '' : ' nomap'}\">${bodyH}</div>`;"), '레일: 많은 곳 → 눈금 범례(시도 전체는 요약 표 이름 줄의 시도 단추, 2026-10-18)');
  assert(!/\.rail > \.sido-link|\.lg-list|lg-tight|rk-tight|\.lg-u\b|\.sido-link|lg-sido/.test(CSS) && CSS.includes('.mapc-b.rk5 .rank ol > li.m5 { display: none; }') && CSS.includes('.mapc-b.rk3 .rank ol > li.mx { display: none; }'), '시도 전체는 숨길 때 자리 없음(display), 순위 줄이기 7 → 5 → 3');
  assert(TPL.includes("b.classList.add('rk5')") && TPL.includes("b.classList.add('rk3')") && TPL.includes('probe'), '줄 수는 보는 곳 줄이 있는 경우 기준(fitLegend 가 잠깐 붙여 잰다)');
  assert(TPL.includes("<ol aria-label=\"공급 예정 호수가 많은 시군구\" data-rove>${rankHtml(units, cap, viewKey, homeKey)}</ol>${tail}</div>"));
  assert(!TPL.includes('mapc-h') && !TPL.includes('id="sband"') && TPL.includes('<span class="tctl">${play}${rot}${bm ? `<span class="tmap">${bm}</span>` : \'\'}</span>'), '2026-10-18 머리 띠·6단계 띠 없음 — 큰 지도는 시간 띠 오른쪽 단추 묶음 끝');
  assert(/\.lg-sw \{ flex: none; width: 16px; height: 11px; border: var\(--border-w\) solid var\(--map-ov-line\); border-radius: var\(--radius-chip\); background: var\(--c\); \}/.test(CSS), '견본 = /map .ov-sw(16×11, 반경 4, 면 경계선 색)');
  const appCss = fs.readFileSync(require('path').join(ROOT, 'assets', 'css', 'app.css'), 'utf8'); assert(/\.ov-sw\{flex:none;width:16px;height:11px;border-radius:var\(--radius-chip\);border:1px solid var\(--ov-line\)\}/.test(appCss), '/map 견본 모양 그대로인지');
  const mob = CSS.slice(CSS.indexOf('@media (max-width: 599px) {\n  .logo .lk-full'));
  assert(mob.includes('.lg-ticks { height: var(--lh1); }') && mob.includes('.lg-tk.l2 { top: 0; }'), '휴대폰: 막대 가로 전체 폭, 눈금 한 줄');
  assert(TPL.includes("setRank($('#mapc .mapc-b ol[data-rove]'), rankHtml(") && TPL.includes('drawMap(true); fitBars(); fitLegend();'), '고를 때는 순위 줄만 바꾸고 범례는 그대로');
});
t("r16-3 큰 지도(#big-map) = 지도 아이콘 단추: 보이는 글자 0, aria-label·title '○○ 큰 지도에서 보기', 누름 칸 44 · 보이는 칸 36, 고르면 이름도 바뀐다", () => {
  const areas = { 41: { label: '경기도' }, 41360: { label: '남양주시' } };
  const f = new Function('scopeHref', 'esc', 'ico', 'areaOf', 'nameOf', srcOf('const mapBtn = ', '\nfunction renderMapCard') + '\nreturn bigMap;')((sd, k) => (k ? `/map?sgg=${k}` : `/map?sido=${sd}`), escT, icoT, (c) => areas[c], (r) => r.label);
  for (const [sd, k, nm] of [['41', '41360', '남양주시'], ['41', null, '경기도']]) {
    const a = f(sd, k); assert(/^<a id="big-map" class="mapi big-map" href="\/map\?s/.test(a), a);
    assert.strictEqual(shown(a), '', '보이는 글자 0'); assert(a.includes(`aria-label="${nm} 큰 지도에서 보기"`) && a.includes(`title="${nm} 큰 지도에서 보기"`) && a.includes('#i-map'), nm);
  }
  assert(/\.mapi \{ position: relative;[^}]*width: 44px; height: 44px;/.test(CSS) && /\.mapi\.big-map::after \{ inset: 4px; \}/.test(CSS), '누름 44 · 보이는 36');
  assert(TPL.includes("bm.setAttribute('aria-label', l); bm.title = l;"), '같은 시도에서 고를 때 이름 갱신');
});
t("r16-4 테두리 알약형 보조 단추 0: '전체 20'·'일정 전체 19'·'○○도 n건 모두'·'n건 더' → 숫자 + 꺾쇠(14px, 누름 44 — r18 부터 테두리 없는 주색 틴트 개수 알약 .ui-count), 바깥 링크는 글자 링크 · 주 동작([내 동네로 정하기]·[맞아요]·[현 위치])은 그대로", () => {
  const rules = [...CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);
  const pill = rules.filter(([sel, body]) => /(^|[\s,(])(a|button)?\.(ext|all|big-map)\b/.test(sel) && (/border-radius: 999px/.test(body) || /border: [1-9]/.test(body)));
  assert.strictEqual(pill.length, 0, pill.map((x) => x[0]).join(' | '));
  { const GX = require(require('path').join(ROOT, 'scripts', 'globals-export.js')).extractExport(fs.readFileSync(require('path').join(ROOT, 'app', 'globals.css'), 'utf8')), sm = GX.match(/\n  \.ui-btn-sm \{([^}]*)\}/)[1];
    assert(/height: var\(--btn-h-sm\);/.test(sm) && /font-size: var\(--fs-meta\);/.test(sm) && /--btn-h-sm: 32px;/.test(GX) && !/\.ui-count\b/.test(GX), 'r19 개수 단추 = .ui-btn.ui-btn-secondary.ui-btn-sm: 보이는 32 · 글자 14 (.ui-count 는 없앴다)');
    assert(/\.all \{[^}]*min-width: 44px;/.test(CSS) && !/\.all \{[^}]*(border|background|font-size|color|height):/.test(CSS) && !/\.all::before/.test(CSS) && /\.ui-btn-sm::before \{ top: -7px; bottom: -7px; \}/.test(CSS), '모양은 단추 부품, .all 은 자리만 · 누름 칸 = 안쪽 30 + 7 × 2 = 44'); }
  assert(/\.ext \{[^}]*font-size: var\(--fs-meta\);[^}]*text-decoration: underline;/.test(CSS) && !/\.ext \{[^}]*border/.test(CSS));
  const all = srcOf('const countBtn = (kind, n, what', '\n');
  assert(all.includes("<span>${fmt(n)}</span>${bico('chev', 'inline-end')}") && all.includes('aria-label="${what} 전체 ${fmt(n)}개 보기"'), "'20 ›' — 숫자는 남기고 '전체'는 aria-label 로(장식 아이콘 없이)");
  assert(!/countBtn\('[a-z]+', [^)]*'일정 전체'\)/.test(TPL) && !/>전체 \$\{fmt/.test(TPL), "보이는 '전체'·'일정 전체' 없음");
  assert(TPL.includes('<span>+${fmt(Math.max(0, L.length - max))}</span>${bico(\'chev\', \'inline-end\')}') && TPL.includes("btn.querySelector('span').textContent = `+${fmt(Math.max(0, n))}`"), "'n건 더' → '+n ›'(글자 + 꺾쇠)");
  assert(TPL.includes('<span>${esc(sido.label)} ${fmt(st.sido.length)}건</span>${bico(\'chev\', \'inline-end\')}') && !TPL.includes('건 모두</span>'), "'경기도 11건 모두' → '경기도 11건 ›'");
  assert(h.includes('<symbol id="i-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-lucide="chevron-right"><path d="m9 18 6-6-6-6"/></symbol>'), '꺾쇠 = lucide chevron-right');
  assert(!/\.cell-h \.all svg\.i \{ display: none; \}/.test(CSS) && !/\.pub :is\([^)]*\.(all|ext)[,)]/.test(CSS), '휴대폰도 꺾쇠 보임 · 14px 를 16px 로 덮지 않음');
  assert(!TPL.includes('class="ext big-map"') && !TPL.includes('큰 지도에서 보기${ico(\'map\')}</a>') && TPL.includes('${mh ? mapBtn(mh, sn) : \'\'}'), '사업 카드의 큰 지도도 아이콘 단추');
  for (const k of ['data-act="yes"', 'id="gps"']) assert(TPL.includes(k), k);
  assert(TPL.includes('class="ui-btn" data-act="yes"') && TPL.includes('class="ui-btn ui-btn-ghost gps" id="gps"') && /--btn-h: 36px;/.test(require(require('path').join(ROOT, 'scripts', 'globals-export.js')).extractExport(fs.readFileSync(require('path').join(ROOT, 'app', 'globals.css'), 'utf8'))) && !/btn-pri|btn-out\b|class="btn[ "]/.test(TPL), '주 동작 단추 = 앱 단추(.ui-btn 채움 · [현 위치] .ui-btn-ghost 텍스트 단추 · [다른 동네] secondary), 보이는 36');
});
/* ---------- 화면 통일(2026-10-18 사용자 결정 '모든 화면 한 모양', 정본 = 정책 화면): 신문판(r17)을 거두고 app/globals.css 토큰·부품만 쓴다. 기능은 그대로 ---------- */
const TPLCSS = noCmt(CSS);
t('통일-1 토큰은 globals 한 곳: 템플릿 <style> 은 자리표시(/*__GLOBALS__*/)로 시작하고 색·크기·글꼴 토큰을 정의하지 않는다 · 두 판 모두 내보내기 층을 그대로 담는다', () => {
  assert(/^<style>\n\/\*__GLOBALS__\*\//m.test(TPL.slice(TPL.indexOf('<style>'))), '맨 앞 자리표시');
  assert(!/--(background|foreground|card|primary|muted|border|ok|warn|bad|st-[a-z]+|text-[\w-]+|fs-[\w-]+|font-sans|radius-[\w-]+|shadow-[\w-]+|page-bg|hot|ch\d|sw\d|mline|ctx|slab|hatch)\s*:/.test(TPLCSS), '템플릿 토큰 정의 없음');
  assert(!/(?<![\w&/#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])|\b(?:rgba?|hsla?|oklch|oklab)\(/.test(TPLCSS), '색 리터럴 0');
  const G = require(require('path').join(ROOT, 'scripts', 'globals-export.js')).extractExport(fs.readFileSync(require('path').join(ROOT, 'app', 'globals.css'), 'utf8')).trim();
  for (const [nm, x] of [['demo', h], ['ops', OPSH]]) { const st = x.slice(x.indexOf('<style>'), x.indexOf('</style>')); assert(st.includes(G), nm + ' 내보내기 층'); assert(st.indexOf(G) < st.indexOf('@layer base {\n  * { box-sizing'), nm + ' 맨 앞'); assert(!st.includes('/*__GLOBALS__*/'), nm); }
  assert(/<html lang="ko" data-elev="raised"[^>]*>/.test(TPL) && TPL.includes("h.dataset.aud = a;") && TPL.includes("a = 'public'"), '관점 덮어쓰기(html[data-aud=public] 본문 16)를 받는 html 속성');
  assert(!/-webkit-font-smoothing/.test(TPLCSS) && /body \{[^}]*font-synthesis: none;/.test(TPLCSS), '글자 렌더링 = 앱 body');
});
t('통일-2 한 문장 제목 = .ui-h1(30, 900 이하 24) · 숫자만 주색 · 1만 이상은 "1만 6,388" · 64·44 헤드라인 없음', () => {
  assert(TPL.includes('<h1 class="ui-h1 sum-h" id="sum-h">') && TPL.includes('<h1 class="ui-h1 sum-h zero" id="sum-h">'));
  assert(/\.sum-h \.n \{ color: var\(--primary\);/.test(CSS) && !/\.sum-h \{[^}]*font-size/.test(CSS) && !/--text-[45]xl/.test(TPL), '크기는 .ui-h1');
  const bigNum = new Function(srcOf('const bigNum = ', '\n') + '\nreturn bigNum;')();
  assert.strictEqual(bigNum(16388), '1만 6,388'); assert.strictEqual(bigNum(20000), '2만'); assert.strictEqual(bigNum(7417), '7,417'); assert.strictEqual(bigNum(99896), '9만 9,896');
});
t('통일-4 머리 줄 = 앱 TopNav(64px · 900 이하 48px · 로고 lockup --logo-h · 메뉴 --fs-nav · 보기 대상·테마 스위치) — 색은 앱과 같은 토큰을 그대로 쓴다(값 복사·덮어쓰기 없음) · 보조 줄(오늘 · 자료 기준 · 공고 기준) 한 줄', () => {
  assert(/\.top-in \{[^}]*height: 64px;/.test(CSS) && /\.top-in \{ height: 48px;/.test(CSS)); 
  assert(/\.logo \.lk-mark \{ display: none; width: var\(--logo-mark\);/.test(CSS) && /\.menu a \{[^}]*font-size: var\(--fs-nav\);/.test(CSS) && !/\.menu a \{[^}]*font-size: var\(--text-/.test(CSS) && !/\.menu a \{ padding: 0 1?2?8?px; font-size/.test(CSS), '머리 줄 글자·로고 그림은 globals 토큰(--logo-h · --logo-mark · --fs-nav), 값 복사 없음');
  { const h = require('fs').readFileSync(__dirname + '/template.html', 'utf8'); assert(h.includes("localStorage.getItem('theme') !== 'light') h.classList.add('dark')") && !h.includes("getItem('theme') === 'dark'"), '다크 기본: 라이트 저장값이 아니면 다크'); }
  assert(!/\.top \{[^}]*--[\w-]+:/.test(CSS) && !/\.dark \.top \{/.test(CSS), '머리 줄 토큰 덮어쓰기 없음');
  assert(/\.top \{[^}]*background: var\(--card\);[^}]*border-bottom: var\(--border-w\) solid var\(--border\); box-shadow: var\(--shadow-card\);/.test(CSS), '앱 TopNav: bg-card · border-b · shadow-card');
  assert(/\.logo \.ink \{ fill: var\(--logo-ink\); \}/.test(CSS) && /\.logo \.wave \{ fill: var\(--logo-wave\); \}/.test(CSS) && TPL.includes('<path class="wave" fill-rule="evenodd" d="M29.4 28.7 48.2 21.1V51.4'), '로고 = fill-logo-ink(집·주택) · fill-logo-wave(문·The), 열린 문 심벌');
  assert((TPL.match(/aria-label="더주택 종합상황판 처음으로"/g) || []).length === 1 && (TPL.match(/viewBox="0 0 202 64"/g) || []).length === 1, '서비스 이름(로고)은 머리 줄에만');
  assert(!TPL.includes('id="dl"') && !TPL.includes('dl-today') && !/\.dl[ {>]/.test(CSS) && !TPL.includes("grid-template-areas: 'q loc';") && TPL.includes('grid-template-rows: auto clamp(460px, calc(100vh - 152px), 760px) 268px auto;') && !TPL.includes('calc(100vh - 200px)'), '날짜 줄 제거(2026-10-18) + 필터를 검색 줄로 합침(2026-10-19): 띠 하나(행 4: 띠 · 위 줄 · 아래 줄 · 출처), 위 줄 높이 100vh−152');
  assert(/id="tip-src" popover>.*자료 기준 \/\*LEDGER_DOT\*\/<span id="dl-nt"><\/span>/.test(TPL.replace(/\n/g, ' ')), '자료 기준·공고 기준은 출처 ⓘ 안에 한 번');
  assert(!/border(?:-(?:top|bottom|left|right))?(?:-width)?:\s*[2-9]px/.test(TPLCSS) && !/border-(?:top|bottom)[^;]*var\(--foreground\)/.test(TPLCSS), '6/3px 괘선·검은 괘선 없음');
  assert(/\.mnav-theme \{[^}]*padding: var\(--pad-compact-y\) var\(--pad-tile-x\);/.test(CSS), 'impeccable 검출 1건: 메뉴 테마 줄 여백');
});
t('통일-5 금지 목록: 국민 영역 4칸 = 구역 카드(.ui-card) · 안쪽 카드는 .ui-inset 만(깊이 2단까지, 3단 금지) · 1px 넘는 색 왼쪽/오른쪽 강조 없음 · 그라데이션 없음 · 반경·글자 크기는 var() 만 · 앱 부품(단추 .ui-btn · 칩 .ui-chip · 안쪽 칸 .ui-inset)', () => {
  for (const id of ['smry', 'mapc', 'c-pj']) assert(new RegExp(`<section class="ui-card [a-z]+" id="${id}"`).test(TPL), id);
  assert(TPL.includes('<div class="ui-card ap-card" id="ap-card"></div>') && TPL.includes('<div class="sum" id="sum" role="group"'), '왼쪽 열 = 별개 카드 둘(요약 · 지금 신청)');
  const js = TPL.slice(TPL.indexOf('<script>\n/*__SEARCH__*/'));
  assert(!/ui-card|ui-tile"|ui-tile /.test(js.replace(/ui-inset/g, '')), '스크립트가 만드는 마크업에 카드·타일 없음(안쪽 카드는 .ui-inset 만)');
  /* 새 규칙: 깊이 2단까지 — 구역 카드(.ui-card) 안 .ui-inset 한 겹, 안쪽 카드 안에 안쪽 카드·카드·타일 금지 */
  assert(!/class="[^"]*\bui-inset\b[^"]*"[^>]*>(?:(?!<\/li>|<\/div>|<\/a>)[\s\S])*class="[^"]*\b(?:ui-inset|ui-card|ui-tile)\b/.test(js), '안쪽 카드 안에 카드가 또 없다(3단 금지)');
  assert(!/\.ui-inset[^{,]*\s\.ui-inset\b/.test(TPLCSS) && !/\.ntc\s[^{]*\.ui-inset/.test(TPLCSS), 'CSS 에도 안쪽 카드 속 안쪽 카드 없음');
  assert(!/border-(?:left|right)(?:-width)?:\s*(?:[2-9]|\d{2,})px/.test(TPLCSS) && !/border-(?:left|right):\s*var\(--border-w-on\)/.test(TPLCSS) && !/\.ne::before/.test(TPLCSS), '색 막대 강조');
  /* 2026-10-19 사용자 피드백('색상 그라데이션으로 표기'·순위 막대 다듬기): 자료 표현(범례 램프 조각 · 순위 값 막대)만 그라데이션 허용 — 장식 그라데이션은 여전히 금지 */
  const gradOk = /^(?:\.lg-grad > \.lg-sw|\.rank \.rk \.bar i|\.rank \.rk:is\(:hover, \.hl\) \.bar i) \{/;
  assert.deepStrictEqual(TPLCSS.split('\n').filter((l) => /linear-gradient|radial-gradient/.test(l) && !gradOk.test(l)), [], '그라데이션(자료 표현 밖)');
  const bad = [...TPLCSS.matchAll(/(?<![\w-])(font-size|border(?:-[a-z]+)*-radius)\s*:\s*([^;}]+)/g)].filter((m) => /\d(?:\.\d+)?(px|r?em|%)/.test(m[2].replace(/var\([^)]*\)/g, '')));
  assert.deepStrictEqual(bad.map((m) => m[0]), [], 'var() 만');
  assert(TPL.includes('<span class="ui-chip ui-chip-primary guess-tag">') && TPL.includes('<span class="ui-chip pchip">') && TPL.includes('<span class="ui-chip prep-chip">') && TPL.includes('class="ui-tile dir"') && TPL.includes('class="ui-card blk"'));
  { const GX = require(require('path').join(__dirname, '..', '..', '..', 'scripts', 'globals-export.js')).extractExport(fs.readFileSync(require('path').join(__dirname, '..', '..', '..', 'app', 'globals.css'), 'utf8'));
    assert(/\.ui-btn:hover \{/.test(GX) && /\.ui-btn-outline:hover, \.ui-btn-ghost:hover/.test(GX) && /\.ui-btn:disabled \{/.test(GX) && /\.ui-chip-primary \{/.test(GX), '단추 hover·disabled · 주색 칩은 globals 내보내기 층(2.5)');
    assert(!/\.ui-btn[\w-]*(?:\[[^\]]*\])?:(hover|disabled|focus-visible) \{|\.guess-tag \{ border-color/.test(CSS), '템플릿에 같은 일을 하던 개별 규칙 없음'); }
  assert(/@layer base \{\n  \* \{ box-sizing/.test(CSS), '기본 요소 재설정은 base 층(부품 클래스가 이기게)');
});
/* ---------- r18 사용자 디자인 피드백(2026-10-18, 라이트에서): 요약 카드 색감 · 언제 들어오나 그래프 · 카드 머리 공용 부품 ---------- */
const GXR = require(require('path').join(ROOT, 'scripts', 'globals-export.js')).extractExport(fs.readFileSync(require('path').join(ROOT, 'app', 'globals.css'), 'utf8'));
t('r18-1 카드 머리 공용 부품(globals 내보내기 층): .ui-card-head(장식 아이콘 배지 없음) · 개수 단추 = .ui-btn.ui-btn-secondary.ui-btn-sm — 지도·지금 신청·사업 일정·사업 머리가 모두 쓰고, 좁은 폭에서는 줄바꿈으로 칸 밖으로 나가지 않는다', () => {
  const sec = GXR.match(/\n  \.ui-btn-secondary \{([^}]*)\}/)[1], hd = GXR.match(/\.ui-card-head \{([^}]*)\}/)[1];
  assert(/display: flex;/.test(hd) && /min-height: var\(--head-h\);/.test(hd) && /gap: var\(--head-gap\);/.test(hd), '제목 줄');
  assert(!/ui-badge-icon|--badge-/.test(GXR + TPL), '배지 아이콘 부품·토큰은 없앴다(2026-10-18 장식 아이콘 빼기)');
  assert(/--tint-mix: 12%;/.test(GXR) && /--tint-mix: 14%;/.test(GXR), '틴트 토큰(라이트 12% · 다크 14%)');
  assert(/background: var\(--secondary\);/.test(sec) && /color: var\(--secondary-foreground\);/.test(sec) && /\.ui-btn-secondary:hover \{\s*background-color: color-mix\(in oklch, var\(--secondary\), var\(--foreground\) var\(--btn-sec-hover\)\);/.test(GXR), 'r19 개수 단추 = shadcn secondary(bg-secondary · 가리키면 본문색 5% 섞기)');
  const heads = [['ap-h'], ['cell-h']];   // 2026-10-18 지도 카드 머리 띠 없음 — 왼쪽 카드 머리는 요약 표(.smry)
  for (const [cls] of heads) assert(TPL.includes(`<div class="${cls} ui-card-head">`), cls);
  assert(/\.cell-h, \.ap-h \{ flex-wrap: wrap; row-gap: 0; \}/.test(CSS), '390 에서 머리 줄 단추가 줄에 안 들어가면 다음 줄로(칸 밖으로 나가지 않는다)');
  { const m = h.match(/<symbol id="i-map" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-lucide="map">([\s\S]*?)<\/symbol>/); assert(m && /^(<(path|rect|circle|line|polyline)[^>]*\/>)+$/.test(m[1]), 'i-map = lucide map'); }
  assert(!/srcOf|badgeIcon/.test(srcOf('function renderSum()', '\n}\n')), '요약 카드 제목(h1)에는 배지 없음');
  assert(!/class="all"|ui-count/.test(TPL) && (TPL.match(/class="ui-btn ui-btn-secondary ui-btn-sm all[" ]/g) || []).length === 1 && (TPL.match(/class="ui-btn ui-btn-link ui-btn-sm all[" ]/g) || []).length === 2 && TPL.includes('class="ui-btn ui-btn-ghost ui-btn-sm sm-sd"'), 'r19 머리 줄 개수 단추 = .ui-btn.ui-btn-secondary.ui-btn-sm · 시도 전체 = 요약 표 이름 줄의 ghost · sm 시도 단추(2026-10-18)');
  assert(!/background-clip:\s*text|-webkit-text-fill-color/.test(TPLCSS + GXR), '그라데이션 글자 없음');
});
t('r18-2 요약 카드 색감: 단계 6줄 = 단계색 점 + 옅은 틴트 + 단계 글자색 숫자(계획 --st-plan · 인허가 --st-permit · 착공 --st-build · 모집 --st-sale · 준공 --st-soon · 입주 --st-move), 다음 준공 = 준공색 띠(입주는 입주색, 아이콘 없음), 공고 상태 칸 = 접수 중 --ok · 마감 임박 --warn · 접수 예정 --primary, 글자 대비 4.5:1(라이트·다크 계산)', () => {
  assert(TPL.includes("const STATUS = [['계획', '', 'plan'], ['인허가', '', 'permit'], ['착공', '', 'build'], ['모집', '', 'sale'], ['준공', '', 'soon'], ['입주', '', 'move']]") && TPL.includes('계획·인허가·착공·모집 네 단계를 더해요') && TPL.includes('이미 지은 준공·입주 호수는 이 숫자에 넣지 않고'), '단어 ↔ 단계(tip-head 정의)');
  /* 2026-10-18 통합 요약 표(10-20 6줄): 단계 줄 = 이름 | 단계색 막대(폭 = 비율) | 호수. 가장 많은 단계 줄(.top)만 막대가 제 단계색·숫자 굵게, 나머지 막대는 단계색을 옅게 섞는다. 고정된 줄 = 단계색 틴트(--tint-mix-on) + 굵게 */
  assert(TPL.includes('<button type="button" class="sm-r s${i}${i === top ? \' top\' : \'\'}${u ? \'\' : \' z\'}" data-st="${i}" data-v="${u}" aria-pressed="false" aria-label="${lb}, 지도에서 보기" title="${tt}"><span class="sm-sn">${STAGE6[i]}</span><span class="sm-b" aria-hidden="true"><i style="flex-grow:${(t.u ? Math.min(1, u / t.u) : 0).toFixed(4)}"></i></span><b class="sm-sv">${bigNum(u)}</b></button>'));
  assert(/\.sm-r \{ --c: var\(--st-plan\); --c-ink: var\(--st-plan-ink\);[^}]*grid-template-columns: subgrid;/.test(CSS) && ['permit', 'build', 'sale', 'soon', 'move'].every((k, j) => CSS.includes(`.sm-r.s${j + 1} { --c: var(--st-${k}); --c-ink: var(--st-${k}-ink); }`)) && /\.sm-b > i \{[^}]*background: var\(--c-ink\); \}/.test(CSS) && CSS.includes('.sm-r.top .sm-sv { font-weight: 700; }') && /\.sm-r\[aria-pressed="true"\] \{ background: color-mix\(in oklab, var\(--c\) var\(--tint-mix-on\), var\(--sf\)\); \}/.test(CSS) && /\.sm-st \{[^}]*grid-auto-rows: 44px;/.test(CSS), '단계 줄 색 · 1급 가장 많은 줄 · 2급 고정 줄 · 누름 44');
  assert(TPL.includes('<a class="nx" href="/citizen/projects?id=${nx.id}" data-go="/citizen/projects?id=${nx.id}" data-k="${nx.k}"') && TPL.includes(`"><span class="k">다음 \${NEXT[nx.k]}</span>`) && /\.nx \{[^}]*grid-template-areas: 'k d \. dd' 'nm nm nm u';/.test(CSS) && !/\.nx \{[^}]*border(-bottom)?:/.test(CSS) && CSS.includes('.nx .sm-dd.on { border-color: var(--primary); background: var(--primary); color: var(--primary-foreground); font-weight: 700; }'), '다음 준공 줄(요약 표 안, 테두리·면 없음) · 30일 안 D-day 칩 = 주색 채움');
  assert(/\.smry \{ --sf: var\(--card\);/.test(CSS) && !/\.smry \{[^}]*(?:margin: calc|border-color:|background: color-mix)/.test(CSS) && /html\[data-page="citizen"\] \.smry \{ --sf: var\(--cz-summary-bg\); background: linear-gradient\(135deg, var\(--cz-summary-bg\), var\(--cz-summary-bg-2\)\); border-color: var\(--cz-summary-bg\); color: var\(--cz-summary-fg\);/.test(GXR), '요약 = 별개 카드(.ui-card) + 짙은 클레이 그라데이션 채움·흰 글자(2026-10-19 사용자 선택 B 클레이 그라데이션 — 2026-10-18 안 2 — 값은 globals 범위 블록 --cz-summary-*, 템플릿은 틴트를 더하지 않는다), 카드 가장자리까지 붙은 구역 아님');
  const ntRow = new Function('noticeTargets', 'noticePrice', 'noticeType', 'noticeTitle', 'noticeStatus', 'noticePeriod', 'esc', 'safeUrl', 'ico', 'TODAY', 'noticeSpan', srcOf('function ntRow', '\nconst SKEL') + '\nreturn ntRow;')(ctx.noticeTargets, ctx.noticePrice, ctx.noticeType, ctx.noticeTitle, ctx.noticeStatus, ctx.noticePeriod, escT, ctx.safeUrl, icoT, '2026-10-17', ctx.noticeSpan);
  const st = (from, to) => (ntRow({ id: 'x', kind: 'sale', title: 'A', applyFrom: from, applyTo: to, url: 'https://x.kr/' }, '').match(/<span class="(nt-st[^"]*)"/) || [])[1];
  assert.deepStrictEqual([st('2026-10-10', '2026-10-27'), st('2026-10-10', '2026-10-19'), st('2026-10-20', '2026-10-27')], ['nt-st', 'nt-st soon', 'nt-st pre']);
  assert(/\.nt-when \{ --c: var\(--primary\);[^}]*background: color-mix\(in oklab, var\(--c\) var\(--tint-mix-on\), var\(--inset-bg\)\); \}/.test(CSS) && CSS.includes('.nt-when:has(> .nt-st.soon) { --c: var(--primary); }') && CSS.includes('.nt-when:has(> .nt-st.pre) { --c: var(--foreground); }') && CSS.includes('.nt-st, .nt-big { color: color-mix(in oklab, var(--c) 70%, var(--foreground)); }'));
  /* 대비: globals 값으로 oklab 섞기를 그대로 계산한다(/citizen 은 html[data-elev=raised]) */
  const blk = (sel) => { const i = GXR.indexOf(`\n${sel} {`); return GXR.slice(i, GXR.indexOf('}', i)); };
  const val = (bs, n) => { for (const b of bs) { const m = b.match(new RegExp(`--${n}: (#[0-9A-Fa-f]{6}|\\d+%);`)); if (m) return m[1]; } throw new Error(n); };
  const toL = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4), toG = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  const lab = (h) => { const [r, g, b] = [1, 3, 5].map((i) => toL(parseInt(h.slice(i, i + 2), 16) / 255)); const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b); return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]; };
  const rgb = ([L, a, b]) => { const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3; return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map((c) => Math.min(1, Math.max(0, toG(c)))); };
  const mix = (a, p, b) => { const A = lab(a), B = lab(b); return rgb(A.map((v, i) => v * p + B[i] * (1 - p))); };
  const Y = (c) => { const [r, g, b] = (typeof c === 'string' ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255) : c).map(toL); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const cr = (a, b) => { const x = Y(a), y = Y(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hx = (c) => '#' + c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  const out = [];
  for (const [nm, bs] of [['라이트', [blk('html[data-elev="raised"]'), blk(':root')]], ['다크', [blk('html.dark[data-elev="raised"]'), blk('.dark'), blk(':root')]]]) {
    const v = (n) => val(bs, n), P = parseFloat(v('tint-mix')) / 100, card = v('card'), inset = v('inset-bg'), fg = v('foreground'), mf = v('muted-foreground');
    const chk = (what, txt, bg, min = 4.5) => { const c = cr(txt, bg); out.push(`${nm} ${what} ${c.toFixed(2)}`); assert(c >= min, `${nm} ${what} ${c.toFixed(2)}`); };
    /* 요약 카드 = 짙은 채움 + 흰 글자: 본문·보조·큰 숫자(산호 옅은 색)·단계 막대(3:1)·단계 줄 가리킴(--tint-mix)·고정(--tint-mix-on) 위 본문.
       2026-10-19 사용자 선택 먹색 그라데이션(시안 D — 옛 B 클레이 대체, --cz-summary-bg → --cz-summary-bg-2): 흰 글자에 불리한 밝은 끝(bg-2)까지 두 끝 모두 잰다. 요약 안 D-day 칩 = 시작 색 글자(--primary-foreground) / 큰 숫자 색 바탕 */
    const cz = (n) => val(nm === '다크' ? [blk('html.dark[data-page="citizen"]'), blk('html[data-page="citizen"]')] : [blk('html[data-page="citizen"]')], n);
    for (const [e, sm] of [['', cz('cz-summary-bg')], [' 밝은 끝', cz('cz-summary-bg-2')]]) {
      chk('요약 본문' + e, cz('cz-summary-fg'), sm); chk('요약 보조' + e, cz('cz-summary-muted'), sm); chk('요약 큰 숫자' + e, cz('cz-summary-num'), sm);
      for (const k of ['plan', 'build', 'sale']) { chk(`요약 막대 ${k}${e}`, cz(`cz-summary-${k}`), sm, 3); chk(`단계 줄 ${k} 가리킴${e}`, cz('cz-summary-fg'), hx(mix(v(`st-${k}`), P, sm))); chk(`단계 줄 ${k} 고정${e}`, cz('cz-summary-fg'), hx(mix(v(`st-${k}`), parseFloat(v('tint-mix-on')) / 100, sm))); }
    }
    chk('요약 D-day 칩', cz('cz-summary-bg'), cz('cz-summary-num'));
    chk('D-day 칩(30일 안)', v('primary-foreground'), v('primary'));
    for (const k of ['ok', 'warn', 'primary']) { const bg = mix(v(k), P, inset); chk(`공고 ${k} 상태`, hx(mix(v(k), 0.85, fg)), bg); chk(`공고 ${k} 보조`, mf, bg); }
    chk('개수 단추(secondary)', v('secondary-foreground'), v('secondary'));
    chk('막대 준공', v('st-soon'), card, 3); chk('막대 가장 많은 해', v('st-soon-ink'), card, 4.5); chk('비율 막대 미정', v('out-line'), card, 3);
  }
  console.log('  ' + out.filter((x) => /숫자|상태$|배지 ok|개수 단추|막대|요약|단계 줄|D-day/.test(x)).join(' · '));
});
/* ---------- r19 사용자 디자인 피드백(2026-10-18): 지도 많은 곳·범례 = 떠 있는 HUD 판 · 아이콘 = lucide(shadcn) 원본 · 단추 = shadcn Button 부품 ---------- */
const hx3 = (c) => { const m = c.match(/^#([0-9a-f]{6})$/i); if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255); const r = c.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/); return [r[1], r[2], r[3]].map((v) => +v / 255); };
const alphaOf = (c) => { const m = c.match(/(?:,|\/)\s*([\d.]+)(%?)\s*\)$/); return m ? (m[2] ? +m[1] / 100 : +m[1]) : 1; };
const lum3 = (c) => c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
const cr3 = (a, b) => { const x = lum3(a), y = lum3(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const over3 = (top, bot) => { const t = hx3(top), a = alphaOf(top), b = typeof bot === 'string' ? hx3(bot) : bot; return t.map((v, i) => v * a + b[i] * (1 - a)); };
const tok = (n) => [...GXR.matchAll(new RegExp(`--${n}: ([^;]+);`, 'g'))].map((m) => m[1].trim());   // 첫째 = 라이트(:root), 둘째 = 다크(.dark)
t('r19-1·레일(2026-10-18 nested-cards 정리): globals .ui-hud 부품은 그대로 두되 /citizen 지도 카드는 판을 쓰지 않는다 — 많은 곳·범례는 오른쪽 레일(1px 구분선만, 테두리·바탕·반경·흐림 없음), 무대를 덮지 않고, 휴대폰은 무대·시간 띠 아래', () => {
  const hud = GXR.match(/\n  \.ui-hud \{([^}]*)\}/)[1];
  for (const d of ['border: var(--border-w) solid color-mix(in oklab, var(--border) var(--hud-line-mix), transparent);', 'border-radius: var(--radius-tile);', 'background: var(--hud-bg);', 'backdrop-filter: var(--hud-backdrop);', '-webkit-backdrop-filter: var(--hud-backdrop);', 'padding: var(--pad-compact-y) var(--pad-compact-x);', 'box-shadow: var(--shadow-hud);']) assert(hud.includes(d), d);
  assert(/--hud-alpha: 18%;/.test(GXR) && /--hud-line-mix: 38%;/.test(GXR) && /--hud-backdrop: blur\(6px\) saturate\(1\.1\);/.test(GXR) && /--hud-bg: color-mix\(in oklab, var\(--card\) var\(--hud-alpha\), transparent\);/.test(GXR) && tok('shadow-hud').length === 3, '유리 18% · 흐림 6px · 테두리 38% · 테마별 약한 그림자(:root·.dark + 웜 라이트 덮기 = 3)');
  assert(/@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\) \{\n  html:root \{\n    --hud-alpha: 96%;/.test(GXR), '흐림을 못 쓰는 브라우저는 96%(html:root 가 뒤의 :root 18% 보다 앞섬)');
  /* 레일: 무대 열 | 레일(212 · 1199 이하 216 · 태블릿 230), 레일은 왼쪽 1px 구분선 + 여백만 */
  assert(CSS.includes(".mapc-b { display: grid; grid-template-columns: minmax(0, 1fr) 240px; grid-template-rows: minmax(0, 1fr) auto auto; grid-template-areas: 'stage rail' 'tband rail' 'legend rail';") && CSS.includes('.stage { position: relative; min-width: 0; min-height: 0; }'), '무대 열 · 레일 열');
  const rail = CSS.match(/\n\.rail \{([^}]*)\}/)[1];
  assert(rail.includes('border-left: var(--border-w) solid var(--border);') && !/background|border-radius|box-shadow|backdrop|border:/.test(rail), '레일 = 1px 구분선만');
  assert(!/hud-col|ui-hud/.test(TPL.replace(/\/\*[\s\S]*?\*\//g, '').replace('mapcard ui-hud in', '')) && !/margin-left: calc\(-1 \*/.test(CSS), '판·겹침 없음');
  const mob = CSS.slice(CSS.indexOf('@media (max-width: 599px) {\n  .logo .lk-full'));
  assert(mob.includes("grid-template-areas: 'stage' 'tband' 'legend' 'rail';") && mob.includes('.rail { padding: var(--s3) 0 0; border-left: 0; border-top: var(--border-w) solid var(--border); }'), '휴대폰: 무대 → 시간 띠 → 레일(위 구분선)');
  /* 순위 줄: 1~3위 원 배지 · 줄마다 지도 단계 색 막대 · 누름·가리킴·키보드는 그대로(.rk · data-src="rank" · data-rove) */
  const rk = srcOf('function rankHtml(', '\n/* lib/board/map-href.ts');
  assert(rk.includes(`<span class="no\${i < 3 ? ' top' : ''}" aria-hidden="true">\${i + 1}</span>`) && rk.includes(`<span class="bar" aria-hidden="true"><i class="c\${x.c || 0}" style="width:\${(x.u / umax * 100).toFixed(1)}%"></i></span>`) && rk.includes('class="rk" data-area="${x.key}" data-src="rank" tabindex="-1"'));
  assert(/\.rank \.rk \.no\.top \{[^}]*color: var\(--muted-foreground\); font-weight: 400;/.test(CSS) && CSS.includes('.rank .rk .bar { grid-column: 2 / 4; grid-row: 2; height: var(--rank-bar-h); background: none; pointer-events: none; }') && !/\.rank \.rk \.bar \{[^}]*position: absolute/.test(CSS) && !/\.rank \.rk > :not\(\.bar\)/.test(CSS), '번호 배지 · 띠 = 2행(이름 열부터 값 열 끝까지), 줄 바탕에 깔린 absolute 막대 없음(2026-10-19 사용자 선택 \'줄 아래 띠\')');
  /* 2026-10-19 사용자 피드백 '범례처럼 동일한 색상으로 개별적으로' + 선택 '줄 아래 띠': 띠 = 그 줄 면 색 --c 단색(카드색과 섞지 않음·그라데이션 없음), 끝 = 범례 막대와 같은 --radius-full, 가리킴에도 색 그대로 */
  { const iR = CSS.match(/\.rank \.rk \.bar i \{[^}]*\}/g) || [];
    assert(iR.length === 1 && iR[0] === '.rank .rk .bar i { display: block; height: 100%; border-radius: var(--radius-full); background: var(--map-ov-4); }', '순위 띠: 단색 var(--c) · 알약 끝');
    assert(!/\.rank \.rk[^{]*\.bar[^{]*\{[^}]*(gradient|color-mix|box-shadow)/.test(CSS) && !CSS.includes('.rank .rk:is(:hover, .hl) .bar i'), '순위 띠: 그라데이션·color-mix·끝선 없음, 가리킴에도 띠 색은 그대로');
    const rr = CSS.match(/\n\.rank \.rk \{([^}]*)\}/)[1];
    assert(rr.includes('row-gap: var(--s2);') && rr.includes('min-height: var(--rank-row-h);') && CSS.includes('.rk-ph { display: block; height: var(--rank-row-h); }'), '줄 = 두 행(글 · 띠) 사이 --s1, 줄 높이·자리 표시 줄 높이 = --rank-row-h 한 토큰');
    assert(/--rank-row-h: (4[4-9]|5\d)px;/.test(GXR) && /--rank-bar-h: [4-8]px;/.test(GXR) && tok('rank-row-h').length === 1 && tok('rank-bar-h').length === 1, '값 = globals citizen 토큰(줄 44 이상 · 띠 4~8px, 라이트·다크 한 번)');
    assert(!/rank-bar-(inset|mix)/.test(GXR + CSS + TPL), '옛 토큰(--rank-bar-inset·-mix-0·-mix·-mix-on) 없음');
  }
  assert(TPL.includes("document.addEventListener('mouseover', (e) => { const t = e.target.closest?.('.map [data-area], .rk');") && TPL.includes("setRank($('#mapc .mapc-b ol[data-rove]'), rankHtml("), '가리킴·고르기 동작 그대로');
  /* 2026-10-19 사용자 피드백 '색상 그라데이션으로 표기': 계단 칸 → [없음 견본] 틈 [연속 그라데이션(둥근 끝)], 조각마다 전체 그라데이션의 제 몫 */
  assert(TPL.includes('.lg-bar, .lg-ticks { display: grid; grid-template-columns: var(--s4) minmax(0, 1fr); column-gap: var(--s2); }') && TPL.includes('.lg-grad > .lg-sw { flex: 1 1 0; width: auto; min-width: 0; height: 100%; border: 0; border-radius: 0; background: linear-gradient(90deg, var(--lg-stops)) calc(var(--i) / max(var(--m) - 1, 1) * 100%) 0 / calc(var(--m) * 100%) 100% no-repeat; }')
    && TPL.includes('.lg-grad > .lg-sw:first-child { border-radius: var(--radius-full) 0 0 var(--radius-full); }') && TPL.includes('.lg-grad > .lg-sw:last-child { border-radius: 0 var(--radius-full) var(--radius-full) 0; }') && !TPL.includes('repeat(var(--n)'), '범례 = 없음 견본 + 떨어진 연속 그라데이션 막대(계단 칸 없음)');
  assert(/\.lg-tk::before \{ content: ''; position: absolute; left: 50%; top: calc\(var\(--s2\) \* -1\); width: var\(--border-w\); height: var\(--s1\);/.test(TPL), '구간 경계 = 얇은 눈금선 + 숫자');
  /* 레일 글자는 카드 면 위(지도 면 위가 아니다): 본문·보조 글 대비 4.5:1(라이트·다크·입체 다크) */
  const [fgL, fgD] = tok('foreground'), [mfL, mfD] = tok('muted-foreground'), out = [];
  for (const [nm, card, fg, mf] of [['라이트', '#FFFFFF', fgL, mfL], ['다크', '#111111', fgD, mfD], ['입체 다크', '#1A1A1B', fgD, mfD]]) { const a = cr3(hx3(fg), hx3(card)), b = cr3(hx3(mf), hx3(card)); out.push(`${nm} 글자 ${a.toFixed(2)} · 보조 ${b.toFixed(2)}`); assert(a >= 4.5 && b >= 4.5, nm); }
  console.log('  레일 대비: ' + out.join(' / '));
});
t('r19-2 단추 = shadcn 4.21.4 base-nova Button 부품(globals): 기본(주색) · secondary · outline · ghost × 기본 36 · sm 32 · icon, 아이콘 16, aria-pressed = 주색 옅은 면 — /citizen 의 모든 단추가 부품만 쓰고(스위치·순위 줄·시안 상태 막대 제외) 화면에 개별 단추 모양 규칙 0, 주요 단추에 뜻 아이콘', () => {
  const rule = (sel) => (GXR.match(new RegExp(`\\n  ${sel.replace(/[.[\]()"=]/g, (c) => '\\' + c)} \\{([^}]*)\\}`)) || [])[1] || '';
  const b = rule('.ui-btn');
  for (const d of ['display: inline-flex;', 'gap: var(--btn-gap);', 'height: var(--btn-h);', 'border: var(--border-w) solid transparent;', 'border-radius: var(--radius-tile);', 'background: var(--primary);', 'color: var(--primary-foreground);', 'padding: 0 var(--pad-compact-x);', 'font-size: var(--fs-body);', 'font-weight: 700;']) assert(b.includes(d), d);
  for (const [n, v] of [['btn-h', '36px'], ['btn-h-sm', '32px'], ['btn-gap', '6px'], ['btn-gap-sm', '4px'], ['btn-pad-icon', '8px'], ['btn-pad-icon-sm', '6px'], ['btn-icon', '16px'], ['btn-fill-hover', '80%'], ['btn-wash', '30%'], ['btn-wash-on', '50%'], ['btn-sec-hover', '5%']]) assert(GXR.includes(`--${n}: ${v};`), n);
  assert(rule('.ui-btn:hover').includes('background-color: color-mix(in oklab, var(--primary) var(--btn-fill-hover), transparent);') && rule('.ui-btn-outline').includes('border-color: var(--border);') && rule('.ui-btn-ghost').includes('background: transparent;') && rule('.ui-btn-sm').includes('height: var(--btn-h-sm);') && rule('.ui-btn-icon').includes('width: var(--btn-h);') && rule('.ui-btn svg').includes('width: var(--btn-icon);'), '변형·크기');
  assert(/\.ui-btn-outline:hover, \.ui-btn-ghost:hover, \.ui-btn-outline\[aria-expanded="true"\], \.ui-btn-ghost\[aria-expanded="true"\] \{\s*background-color: var\(--muted\);/.test(GXR) && /\.dark \.ui-btn-outline \{\s*border-color: var\(--input\);\s*background: color-mix\(in oklab, var\(--input\) var\(--btn-wash\), transparent\);/.test(GXR), 'outline·ghost 가리킴 · 다크 outline');
  assert(/\.ui-btn\[aria-pressed="true"\], \.ui-btn\[aria-pressed="true"\]:hover \{\s*background-color: color-mix\(in oklab, var\(--primary\) var\(--tint-mix\), var\(--card\)\);\s*color: var\(--primary\);/.test(GXR) && /\.ui-btn:focus-visible \{\s*outline: var\(--border-w-on\) solid var\(--ring\);/.test(GXR) && /\.ui-btn:disabled \{\s*pointer-events: none;\s*opacity: var\(--disabled-opacity\);/.test(GXR) && /\.ui-btn:has\(> \[data-icon="inline-start"\]\) \{\s*padding-left: var\(--btn-pad-icon\);/.test(GXR), '고름 · 초점 · 꺼짐 · 아이콘 쪽 여백');
  /* 화면: 모든 단추가 부품 */
  const btns = [...TPL.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]).filter((x) => !/ data-s="/.test(x) && !/class="(sw|rk|sm-r|tk|lg-sw)[ "]/.test(x) && !/ data-(vsido|fst)="/.test(x));   // 스위치·순위 줄·요약 표 단계 줄·사업 일정표 해 눈금(자료 표지, 2026-10-18)·상단 필터 탭(.ui-tabs 부품, 2026-10-19)은 단추 부품이 아니다
  assert(btns.length >= 30 && btns.every((x) => /class="ui-btn[ "]/.test(x)), btns.filter((x) => !/class="ui-btn[ "]/.test(x)).join(' | '));
  assert(!/class="[^"]*(?<![\w-])(btn|btn-txt|icon-btn|ui-count)(?![\w-])/.test(TPL), '옛 단추 클래스 없음');
  /* 화면 CSS 에 단추 모양 규칙 없음: 단추 갈고리를 마지막으로 고르는 규칙은 자리(위치·여백·표시)·누름 칸(::before)만 */
  const hook = /(\.ui-btn[\w-]*|\.tip-btn|\.clear|\.cp|\.all|\.sido-link|\.chip2|\.to-admin|\.pc-back|\.gps|\.seg button|\.near button|#burger|#sheet-x|#undo|#gps)((?::[\w-]+(?:\([^)]*\))?)|\[[^\]]+\])*$/;
  const bad = [];
  for (const m of TPLCSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sels = m[1].trim().split(',').map((x) => x.trim()).filter((x) => hook.test(x));
    if (!sels.length) continue;
    for (const d of m[2].split(';').map((x) => x.trim()).filter(Boolean)) {
      const prop = d.split(':')[0].trim();
      if (/^(background|border|border-[\w-]+|height|padding|padding-[\w-]+|font-size|font-weight|box-shadow|text-decoration|color|outline|transition)$/.test(prop) && !(prop === 'color' && sels.every((x) => x === '.tip-btn'))) bad.push(`${sels.join(',')} { ${d} }`);
    }
  }
  assert.deepStrictEqual(bad, [], '개별 단추 모양 규칙(ⓘ 보조 글 색만 예외)');
  /* 주요 단추: 변형 · 뜻 아이콘(lucide) + 글자 그대로 */
  for (const k of [
    `<button type="button" class="ui-btn" data-act="yes">\${bico('check')}맞아요</button><button type="button" class="ui-btn ui-btn-secondary" data-act="pick">\${bico('map')}다른 동네</button>`,
    `<button type="button" class="ui-btn ui-btn-ghost gps" id="gps" aria-describedby="gps-note"\${busy ? ' disabled aria-busy="true"' : ''}>\${bico(busy ? 'run' : 'gps', 'inline-start', busy ? 'spin' : '')}`,
    `<button type="button" class="ui-btn ui-btn-ghost" data-act="sidos" aria-controls="ac-list">\${bico('map')}다른 시도</button>`,
    `<button type="button" class="ui-btn ui-btn-ghost" data-act="pick">\${bico('search')}검색으로 고르기</button>`,
    `<button type="button" class="ui-btn ui-btn-ghost" data-act="pick">\${bico('map')}다른 동네</button>`,
    `<button type="button" class="ui-btn ui-btn-ghost ui-btn-sm" id="undo">\${bico('undo')}되돌리기</button>`,
    `<button type="button" class="ui-btn ui-btn-ghost pc-back" id="pc-back">\${bico('left')}목록</button>`,
    `<button type="button" class="ui-btn ui-btn-ghost ui-btn-icon" id="burger"`, `<button type="button" class="ui-btn ui-btn-ghost ui-btn-icon" id="sheet-x"`, `<button type="button" class="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm clear" id="clear"`,
    `class="ui-btn ui-btn-ghost ui-btn-sm to-admin" id="to-admin">전체 통계<span class="opt-t"> 보기(정책담당자 화면)</span><svg class="i" data-icon="inline-end" aria-hidden="true"><use href="#i-arrow"/></svg></button>`,
    `<button type="button" class="ui-btn ui-btn-outline chip2" data-chip=`, `<div class="seg" role="group" aria-label="묶는 방법"><button type="button" class="ui-btn ui-btn-outline" data-mode="time"`,
    "const bico = (id, at = 'inline-start', cls = '') => `<svg class=\"i${cls ? ' ' + cls : ''}\" data-icon=\"${at}\" aria-hidden=\"true\"><use href=\"#i-${id}\"/></svg>`;",
  ]) assert(TPL.includes(k), k.slice(0, 90));
  assert.strictEqual((TPL.match(/class="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm tip-btn"/g) || []).length, 7, 'ⓘ 7곳 = ghost · icon · sm(2026-10-18 지도 ⓘ 는 TIP_MAP 하나를 범례·수도권 밖 머리에서 같이 쓴다)');
  /* 대비(라이트·입체 다크): 기본 · 가리킨 기본(주색 80%) · secondary · outline · 고름 */
  const out = [];
  for (const [nm, k, card] of [['라이트', 0, '#FFFFFF'], ['입체 다크', 1, '#1A1A1B']]) {
    const v = (n) => tok(n)[k], prim = hx3(v('primary'));
    const pairs = [['기본', v('primary-foreground'), v('primary')], ['기본 가리킴', v('primary-foreground'), prim.map((c, i) => c * 0.8 + hx3(card)[i] * 0.2)], ['secondary', v('secondary-foreground'), v('secondary')], ['outline', v('foreground'), v('background')]];
    for (const [w, a, bg] of pairs) { const c = cr3(hx3(a), typeof bg === 'string' ? hx3(bg) : bg); out.push(`${nm} ${w} ${c.toFixed(2)}`); assert(c >= 4.5, `${nm} ${w}`); }
  }
  console.log('  단추 대비: ' + out.join(' · '));
});
t('r19-3 아이콘 스프라이트 = lucide(shadcn 아이콘) 원본 도형: 템플릿에는 손으로 그린 <symbol> 이 없고(자리표시만), 빌드가 대응표(build.js ICONS)대로 lucide-react 의 __iconData 를 그대로 옮긴다 · 마크업이 부르는 아이콘은 모두 대응표에 있다 · ISC 주석', () => {
  assert(!/<symbol\b/.test(TPL) && TPL.includes('<!--__ICONS__-->'), '템플릿 스프라이트 = 자리표시');
  const B = fs.readFileSync(require('path').join(__dirname, 'build.js'), 'utf8'), ICONS = require('vm').runInNewContext('(' + B.match(/const ICONS = (\{[\s\S]*?\n\});/)[1] + ')');
  const LU = require('path').join(ROOT, 'node_modules', 'lucide-react');
  const node = (n) => require('vm').runInNewContext('(' + fs.readFileSync(require('path').join(LU, 'dist', 'esm', 'icons', `${n}.mjs`), 'utf8').match(/const __iconData = (\{[\s\S]*?\n\});/)[1] + ')').node;
  const syms = [...h.matchAll(/<symbol id="i-([\w-]+)"([^>]*)>([\s\S]*?)<\/symbol>/g)];
  assert.strictEqual(syms.length, Object.keys(ICONS).length, '스프라이트 = 대응표');
  for (const [, id, at, body] of syms) {
    const n = ICONS[id]; assert(n, id);
    assert.strictEqual(at, ` viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-lucide="${n}"`, id);
    assert.strictEqual(body, node(n).map(([tag, a]) => `<${tag}${Object.entries(a).filter(([k]) => k !== 'key').map(([k, v]) => ` ${k}="${v}"`).join('')}/>`).join(''), `${id} = lucide ${n} 그대로`);
  }
  const used = new Set([...TPL.matchAll(/href="#i-([\w-]+)"|\b(?:ico|bico|badgeIcon)\('([\w-]+)'/g)].map((m) => m[1] || m[2]));
  for (const x of ["busy ? 'run' : 'gps'"]) assert(TPL.includes(x));
  assert(!TPL.includes('ALL_ICO'), '개수 단추 앞 장식 아이콘 없음');
  for (const id of [...used, 'run', 'gps']) assert(ICONS[id], '대응표에 없음: ' + id);
  assert(/<!-- 아이콘: lucide \d+\.\d+\.\d+ \(ISC License, https:\/\/lucide\.dev\)/.test(h), 'ISC 주석');
  assert.deepStrictEqual(['home', 'gps', 'warn', 'key', 'brief', 'undo'].map((k) => ICONS[k]), ['house', 'locate-fixed', 'triangle-alert', 'keyboard', 'briefcase-business', 'undo-2']);
  for (const id of ['cal', 'bldg', 'mega', 'trophy', 'layers', 'chart', 'list', 'pencil']) assert(!ICONS[id], '장식 아이콘은 대응표에서 뺐다: ' + id);
});
t('2026-10-19 필터를 검색 줄로: .band 한 줄(검색 · 보는 곳 · 시도 탭 · 단계 탭 · 현 위치), 넓으면 한 줄 · 좁으면 줄바꿈, 390 은 검색 → 보는 곳 → 탭 순, 가로 넘침 없음 규칙', () => {
  const band = TPL.slice(TPL.indexOf('<div class="band">'), TPL.indexOf('<div class="top-row">'));
  assert(band.indexOf('id="loc"') > 0 && band.indexOf('id="loc"') < band.indexOf('id="fbar"') && band.indexOf('role="search"') < band.indexOf('id="loc"'), '마크업 순서: 검색 → 보는 곳 → 필터');
  assert(TPL.indexOf('<div class="fbar" id="fbar">') > TPL.indexOf('<div class="band">') && TPL.indexOf('<div class="fbar" id="fbar">') < TPL.indexOf('<div class="top-row">') && band.includes('</div>\n    </div>\n'), '#fbar 는 .band 안(띠 닫기 전)');
  /* 2026-10-19 세 묶음: [검색] [보는 곳 + 현 위치 …… 거르기] — 검색 칸 상한 = .top-row 왼쪽 열(세로선 맞춤), 모자라면 검색이 먼저 240 까지 줄고 그다음 오른쪽 묶음이 다음 줄 */
  assert(band.indexOf('<div class="band-r">') < band.indexOf('id="loc"') && band.indexOf('role="search"') < band.indexOf('<div class="band-r">'), '오른쪽 묶음(.band-r) = 보는 곳 + 거르기');
  assert(TPL.includes('.band { display: flex; flex-wrap: wrap; align-items: flex-start; gap: var(--s2) var(--s4); }') && TPL.includes('.band > .sbox { flex: 1000 1 240px; min-width: 240px; max-width: clamp(320px, 24vw, 400px); }') && /\.top-row \{[^}]*grid-template-columns: clamp\(320px, 24vw, 400px\) minmax\(0, 1fr\);/.test(TPL), '검색 칸 상한 = 요약 카드 열(같은 clamp), 최소 240');
  assert(TPL.includes('  .band > .sbox { max-width: clamp(300px, 28vw, 360px); }') && TPL.includes('  .top-row { grid-template-columns: clamp(300px, 28vw, 360px) minmax(0, 1fr); }'), '1199 이하도 같은 열');
  assert(TPL.includes('.band-r { flex: 1 0 auto; max-width: 100%; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--s2) var(--s5); }'), '오른쪽 묶음: 보는 곳 왼쪽 · 거르기 오른쪽, 모자라면 거르기가 아래 줄');
  assert(TPL.includes('  .band > .sbox { flex-basis: 100%; max-width: none; }'), '899 이하: 검색 한 줄');
  const m = TPL.slice(TPL.indexOf('/* 띠(2026-10-19): 검색 한 줄'));
  assert(m.includes('.band-r > .loc { flex: 1 1 100%; }') && m.includes('.loc .gps { margin-left: auto; }') && m.includes('.fbar { flex: 1 1 100%; gap: var(--s2); }') && m.includes('.fbar .ui-tabs { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); width: 100%; }') && m.includes('.fbar .ui-tabs:last-child { grid-auto-flow: row; grid-template-columns: repeat(4, minmax(0, 1fr)); height: auto; }'), '599 이하: 검색 → 보는 곳 → 시도 탭(3칸) → 단계 탭(7개 = 4칸 × 2줄, 2026-10-20), 가로 넘침 없음');
  assert(TPL.includes('<div class="ui-search" id="sfield">') && !/\.sfield\b|#q \{|#q:focus/.test(TPLCSS) && TPL.includes('.ui-search.has .clear { display: flex; }'), '검색 입력은 부품 .ui-search(화면에 모양 규칙 없음), 지우기는 입력이 있을 때만');
  { const GX = require(require('path').join(ROOT, 'scripts', 'globals-export.js')).extractExport(fs.readFileSync(require('path').join(ROOT, 'app', 'globals.css'), 'utf8'));
    assert(/--ctl-h: 40px;/.test(GX) && GX.includes('html[data-page="citizen"] .band { --btn-h: var(--ctl-h); }'), '한 줄 조작 높이 40(검색·탭·단추)');
    const se = GX.slice(GX.indexOf('  .ui-search {'), GX.indexOf('  /* 카드 머리(2026-10-18)'));
    assert(/\.ui-search > input \{[^}]*height: var\(--btn-h\);[^}]*background: var\(--card\);[^}]*text-overflow: ellipsis;/.test(se) && /\.ui-search > input:focus-visible \{\s*border-color: var\(--ring\);\s*outline: var\(--border-w-on\) solid var\(--ring\);/.test(se) && /\.ui-search:focus-within > svg \{\s*color: var\(--primary\);/.test(se) && !/box-shadow:\s*0 0 /.test(se) && !/#[0-9a-fA-F]{3,8}\b|rgb\(|\d+px/.test(se), '검색 입력 부품: 높이 토큰 · 카드 면 · 초점 = 주색 테두리 + 2px 외곽선 · 돋보기 주색 · 0 오프셋 후광 없음 · 리터럴 0'); }
});
t('2026-10-19 상단 필터 = 시도(서울·경기·인천) + 단계(전체·계획·인허가·착공·모집·준공·입주): 부품 단추만, 모드·사업 표와 동기, 중복 칩 없음', () => {
  const fb = TPL.slice(TPL.indexOf('<div class="fbar" id="fbar">'), TPL.indexOf('<div class="top-row">'));
  assert(fb.indexOf('시도로 보기') < fb.indexOf('단계로 보기'));
  assert.deepStrictEqual([...fb.matchAll(/data-vsido="(\d+)"[^>]*>([^<]+)</g)].map((m) => m[1] + m[2]), ['11서울', '41경기', '28인천'], '서울·경기·인천 순서');
  assert.deepStrictEqual([...fb.matchAll(/data-fst="(\w+)"[^>]*>([^<]+)</g)].map((m) => m[1] + m[2]), ['all전체', '0계획', '1인허가', '2착공', '3모집', '4준공', '5입주']);
  assert.strictEqual((fb.match(/class="ui-tabs ui-tabs-seg" role="group" aria-label="시도로 보기"/g) || []).length, 1, '시도 = 채움 탭(2026-10-19)');
  assert.strictEqual((fb.match(/class="ui-tabs ui-tabs-line" role="group" aria-label="단계로 보기"/g) || []).length, 1, '단계 = 밑줄 탭(2026-10-19)');
  assert(!/ui-btn/.test(fb) && !/role="tab"/.test(fb), '단추 부품·role=tab 없음(거르기라 group + aria-pressed)');
  assert.strictEqual((fb.match(/<span class="n"><\/span>/g) || []).length, 7, '배지는 단계 탭 7개(전체 + 6단계)에만(시도 탭 없음)');
  assert(fb.match(/role="group" aria-label="단계로 보기"/) && fb.match(/role="group" aria-label="시도로 보기"/));
  assert(!/<style[^>]*>[\s\S]*#fbar[^{]*\{[^}]*(#[0-9a-fA-F]{3,6}|rgb)/.test(TPL), '템플릿 #fbar 규칙에 색 리터럴 없음');
  const GCSS = fs.readFileSync(require('path').join(ROOT, 'app', 'globals.css'), 'utf8');
  for (const [i, k] of [['0', 'plan'], ['1', 'permit'], ['2', 'build'], ['3', 'sale'], ['4', 'soon'], ['5', 'move']]) assert(GCSS.includes(`html[data-page="citizen"] #fbar [data-fst="${i}"] { --tab-c: var(--st-${k}-ink); }`), `단계색 ${k}(고른 탭 글자·옅은 면·테두리·배지)`);
  { const ol = GCSS.slice(GCSS.indexOf('  .ui-tabs-outline {'), GCSS.indexOf('  /* 검색 입력(2026-10-19'));
    assert(/\.ui-tabs-outline \{\s*--tab-c: var\(--primary\);\s*border: var\(--border-w\) solid var\(--border\);\s*background: var\(--card\);/.test(ol) && /\[aria-current="true"\]\), \.dark \.ui-tabs-outline > :is\(button, a\):is\(\[aria-pressed="true"\], \[aria-current="true"\]\) \{\s*border-color: var\(--tab-c\);\s*background: color-mix\(in oklab, var\(--tab-c\) var\(--tint-mix\), var\(--card\)\);\s*color: var\(--tab-c\);/.test(ol) && /\[aria-current="true"\]\) \.n \{\s*background: var\(--tab-c\);\s*color: var\(--card\);/.test(ol), '테두리형 탭: 카드 면 틀 · 고른 탭 = 그 색 옅은 면 + 1px + 글자 · 배지 채움'); }
  assert(!/#fbar \[data-fst="\d"\] \{ --primary/.test(GCSS), '옛 --primary 덮어쓰기 없음');
  { const GX = require(require('path').join(ROOT, 'scripts', 'globals-export.js')).extractExport(GCSS), tabs = GX.slice(GX.indexOf('  .ui-tabs {'), GX.indexOf('  /* 카드 머리(2026-10-18)'));
    assert(tabs.length > 500 && !/#[0-9a-fA-F]{3,8}\b|rgb\(|\d+px/.test(tabs), '.ui-tabs 는 토큰(var)만 · 리터럴 0');
    assert(/\.ui-tabs \{[^}]*background: var\(--muted\);[^}]*padding: var\(--tabs-pad\)/.test(tabs) && /\[aria-current="true"\]\) \{\s*background: var\(--card\);[^}]*font-weight: 700;[^}]*box-shadow: var\(--shadow-card\)/.test(tabs) && /\.dark \.ui-tabs > :is\(button, a\):is\(\[aria-pressed="true"\], \[aria-current="true"\]\) \{\s*border-color: var\(--input\)/.test(tabs) && /\.ui-tabs \.n \{[^}]*font-size: var\(--fs-caption\);[^}]*font-weight: 700/.test(tabs) && /--tabs-pad: 3px;/.test(GX), '틀 · 고른 탭 · 다크 · 배지'); }
  assert(TPL.includes("n.textContent = String(cnt[n.parentNode.dataset.fst])") && TPL.includes('cnt[OF_STAGE[p[2]]]++; cnt.all++;') && TPL.includes('for (const c of cellScope().r.codes) for (const p of D.prj[c] || [])'), '배지 건수 = 보는 지역의 6단계별 사업 건수(OF_STAGE · cellScope, 전체 = 여섯 합)');
  /* 동기: 모드가 바뀔 때마다(applyMode 두 길)·보는 곳이 바뀔 때마다(renderAll) 한 함수가 칠하고, 해 모드면 단계 단추는 모두 풀린다 */
  assert(TPL.includes("renderHead(); paintBand(); paintTband(); paintFbar(); return; }") && TPL.includes('paintBand(); paintTband(); paintFbar();   // 요약 표') && TPL.includes('renderCells(); paintFbar(); fitApply();'));
  assert(TPL.includes("b.dataset.fst === 'all' ? m.k === 'all' : m.k === 's' && +b.dataset.fst === m.i") && TPL.includes("String(b.dataset.vsido === sd)"));
  assert(TPL.includes("setMode(b.dataset.fst === 'all' ? MODE_ALL : pressMode(VIEW.mode, 's', +b.dataset.fst))"), '누르면 기존 setMode → applyMode 경로');
  /* 2026-10-19 아래 줄이 청약 단지 카드로 바뀌어 단계 거르기는 지도·순위·배지만(카드는 거르지 않는다 — 청약 단지-7) */
  assert(!TPL.includes('all.filter((x) => stOf(x.b) === f)') && !TPL.includes('사업이 없어요`'));
  assert(!TPL.includes('sido-pick'), '안내 줄의 시도 칩은 필터 줄과 겹쳐 없앤다');
});
/* ---------- 2026-10-19 청약 단지 카드(#c-pj, 옛 '사업' 표 자리 — 사용자 Q&A 결정) ----------
   원본 구간(AH_KIND ~ yrHead)과 renderCells 를 실제 자료(D.ah)로 돌리고, 원천(원장 notices APPLYHOME · raw Detail · Mdl)은 시험이 따로 읽어 대조한다. 화면 사진은 찍지 않는다 */
const escA = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtA = (n) => n.toLocaleString('ko-KR');
const MAPOF_A = Object.fromEntries(ctx.D.map.units.map((u) => [u[0], { code: u[0], s: u[1], n: u[2] }]));
const ahKit = (D, today) => new Function('D', 'TODAY', 'MAPOF', 'esc', 'fmt', srcOf('const AH_KIND = ', 'const yrHead = ') + '\nreturn { ahStep, ahRows, ahRow, AH_MAX, AH_NEAR };')(D, today, MAPOF_A, escA, fmtA);
const AHK = ahKit(ctx.D, '2026-10-19');
const fnA = (name) => { const i = TPL.indexOf(`function ${name}(`); assert(i > 0, name); return TPL.slice(i, TPL.indexOf('\n}\n', i)) + '\n}'; };
const unitKeyA = (c) => (c.startsWith('41') ? c.slice(0, 4) + '0' : S.regionOf[c]?.parent || c);
/* renderCells 를 그대로 돌려 카드 마크업을 받는다(DOM 은 작은 대역) */
const ahCard = (code, today = '2026-10-19', D = ctx.D) => {
  const k = ahKit(D, today); let html = '';
  new Function('areaOf', 'viewCode', 'sidoOf', 'D', 'MAPU', 'unitKey', 'ahRows', 'ahRow', 'AH_MAX', 'AH_NEAR', 'TODAY', 'swapHtml', '$', 'fitPj', 'bigNum', 'window', fnA('renderCells') + '\nreturn renderCells;')(
    (c) => S.regionOf[c], () => code, (r) => (r.kind === 'sido' ? r.code : r.code.slice(0, 2)), D, D.map.units.map(([c, s, n]) => ({ code: c, s, n })), unitKeyA,
    k.ahRows, (o, w) => k.ahRow(o, w, today), k.AH_MAX, k.AH_NEAR, today, (el, h) => { html = h; }, (q) => (q === '#c-pj' ? {} : null), () => {}, (n) => String(n), {})();
  return html;
};
const ahCells = (h) => [...h.matchAll(/<li><a class="ev" href="([^"]*)" target="_blank" rel="noopener" title="([^"]*)" aria-label="([^"]*)">([\s\S]*?)<\/a><\/li>/g)].map((m) => {
  const g = (re) => (m[4].match(re) || [])[1];
  return { href: m[1].replace(/&amp;/g, '&'), title: m[2], aria: m[3], kind: g(/<span class="ui-chip pj-ty">([^<]*)</), nm: g(/<span class="nm">([^<]*)</), dg: g(/<span class="pj-dg">([^<]*)</) || '', u: g(/<span class="u(?: tbd)?">([^<]*)</),
    st: g(/<span class="pj-st"><span class="ui-chip[^"]*">([^<]*)</) || '', stc: g(/<span class="pj-st"><span class="(ui-chip[^"]*)"/) || '', nx: g(/<span class="pj-nxt">([^<]*)</), nxc: g(/<span class="(pj-nx(?: tbd)?)"/),
    sp: g(/<span class="pj-sp(?: tbd)?">([^<]*)</), spc: g(/<span class="(pj-sp(?: tbd)?)"/), pc: g(/<span class="pj-pc">([^<]*)</) || '',
    mv: g(/<span class="when(?: tbd)?">([^<]*)</), ar: g(/<span class="pj-ar(?: tbd)?">([^<]*)</), ag: g(/<span class="pj-ag(?: tbd)?">([^<]*)</), vis: m[4].replace(/<[^>]*>/g, ' ') };
});
/* 원천에서 따로 만든 기대값: notices(APPLYHOME, 시군구 코드) → Detail(관리번호-공고번호) → Mdl, 공고일 ≥ 수집 기준일 2년 전 */
const AHRAW = (() => {
  const rd = (p) => JSON.parse(fs.readFileSync(require('path').join(ROOT, 'schemas', 'ledger-2026-10', p), 'utf8'));
  const man = rd('raw/applyhome/manifest.json'), ref = man.fetched_at.slice(0, 10), from = `${+ref.slice(0, 4) - 2}${ref.slice(4)}`;
  const nt = new Map(rd('tables/notices.json').rows.filter((n) => n.notice_system === 'APPLYHOME' && n.sgg_code).map((n) => [n.notice_id, n]));
  const mdl = new Map(); for (const m of rd('raw/applyhome/getAPTLttotPblancMdl.json').rows) { const k = m.HOUSE_MANAGE_NO + '-' + m.PBLANC_NO; (mdl.get(k) || mdl.set(k, []).get(k)).push(m); }
  const by = {};
  for (const d of rd('raw/applyhome/getAPTLttotPblancDetail.json').rows) {
    const id = d.HOUSE_MANAGE_NO + '-' + d.PBLANC_NO, n = nt.get(id); if (!n || !(d.RCRIT_PBLANC_DE >= from)) continue;
    const u = n.sgg_code.startsWith('41') ? n.sgg_code.slice(0, 4) + '0' : n.sgg_code;
    (by[u] = by[u] || []).push({ d, n, mdl: mdl.get(id) || [] });
  }
  return { ref, from, by };
})();
const ahWant = (r, today) => {   // 시험 쪽 단계 계산(원천 칸 이름 그대로)
  const d = r.d, s = d.SPSPLY_RCEPT_BGNDE || d.RCEPT_BGNDE, md = (v) => v.slice(5).replace('-', '.');
  if (s && today < s) return ['접수 예정', `접수 ${md(s)}`]; if (d.RCEPT_ENDDE && today <= d.RCEPT_ENDDE) return ['접수 중', `마감 ${md(d.RCEPT_ENDDE)}`];
  if (d.PRZWNER_PRESNATN_DE && today < d.PRZWNER_PRESNATN_DE) return ['발표 대기', `발표 ${md(d.PRZWNER_PRESNATN_DE)}`];
  if (d.CNTRCT_CNCLS_ENDDE && today <= d.CNTRCT_CNCLS_ENDDE) return [today < d.CNTRCT_CNCLS_BGNDE ? '계약 전' : '계약 중', `계약 ${md(d.CNTRCT_CNCLS_BGNDE)}~${md(d.CNTRCT_CNCLS_ENDDE)}`];
  return ['끝남', `${d.RCRIT_PBLANC_DE.slice(0, 4)}.${d.RCRIT_PBLANC_DE.slice(5, 7)} 공고`];
};
const ahSorted = (list, today) => list.map((r, i) => ({ r, i, live: ahWant(r, today)[0] !== '끝남' })).sort((a, b) => b.live - a.live || b.r.d.RCRIT_PBLANC_DE.localeCompare(a.r.d.RCRIT_PBLANC_DE) || b.r.d.HOUSE_MANAGE_NO.localeCompare(a.r.d.HOUSE_MANAGE_NO)).map((x) => x.r);

t('지금 신청 공고 카드 호수(U12, 2026-10-20): units 가 있으면 셋째 줄 끝 \'120호\'(자리 쉼표), 단지 이름·주소는 보이는 글에 없고 링크 title·화면 읽기 글에만, 없으면 아무것도 안 붙임', () => {
  const base = { id: 'x', title: '시험 공고', agency: 'SH', status: '접수중', housingType: '아파트', supplyType: '국민임대', applyFrom: '2000-01-01', applyTo: '2999-12-31', url: 'https://www.myhome.go.kr/x', targets: ['신혼부부'], deposit: null, monthlyRent: null };
  const ntRow = new Function('noticeTargets', 'noticePrice', 'noticeType', 'noticeTitle', 'noticeStatus', 'noticePeriod', 'TODAY', 'esc', 'safeUrl', 'fmt', 'ico', 'spanBar', srcOf('function ntRow(', '\n/* 접수 기간 띠') + '\nreturn ntRow;')(ctx.noticeTargets, ctx.noticePrice, ctx.noticeType, ctx.noticeTitle, ctx.noticeStatus, ctx.noticePeriod, '2026-10-20', (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'), ctx.safeUrl, (n) => n.toLocaleString('ko-KR'), () => '<svg></svg>', () => '');
  const withU = ntRow({ ...base, complex: '가나다단지', units: 1200, address: '서울특별시 종로구 어딘가 1' }, ''), noU = ntRow({ ...base, complex: null, units: null, address: null }, ''), zero = ntRow({ ...base, units: 0 }, '');
  const nt3 = (h) => (h.match(/<span class="nt3"[\s\S]*?<\/span><\/span>(?=<svg|<\/span>|\s*<svg)/) || [''])[0];
  assert(/<span class="un">1,200호<\/span><\/span><\/span>/.test(withU), '호수는 셋째 줄 맨 끝(자리 쉼표 + 단위 호)');
  assert(!/class="un"/.test(noU) && !/class="un"/.test(zero), 'units 없음·0 이면 아무것도 안 붙인다');
  const visible = withU.replace(/ (title|aria-label)="[^"]*"/g, '').replace(/<span class="sr">[^<]*<\/span>/g, '').replace(/<[^>]+>/g, ' ');
  assert(!visible.includes('가나다단지') && !visible.includes('종로구'), '단지 이름·주소는 보이는 글에 없다');
  assert(/<a class="ntc [^>]*title="시험 공고\n가나다단지, 서울특별시 종로구 어딘가 1"/.test(withU) && /<span class="sr">가나다단지, 서울특별시 종로구 어딘가 1 \(공고 원문, 새 창\)<\/span>/.test(withU), '링크 title + 화면 읽기 글에만');
  assert(!/<a class="ntc [^>]*title=/.test(noU), '이름·주소가 없으면 title 도 없다');
  assert.strictEqual((withU.match(/class="nt[123]"/g) || []).length, 3, '카드 세 줄 규격 그대로');
  assert(/\.nt3 \.un \{/.test(TPL));
});

t('청약 단지-1 카드 머리 = 제목 \'청약 단지\' + (i) 하나(사업 n개 링크 단추 없음) · 열 머리 9칸(2026-10-20 한 줄) = 구분 · 이름 · 위치 · 세대 · 특별공급 · 주택형 · 일정 · 입주 · 시공·시행 · ⓘ = 원천기관 · 수집 기준일 · 원문 안내', () => {
  const h = ahCard('11650'), head = h.slice(0, h.indexOf('</div>'));
  assert(head.includes('<h2 id="c-pj-h">청약 단지</h2>') && head.includes('popovertarget="tip-pj"') && !/<a |class="[^"]*\ball\b/.test(head), '머리 링크·개수 단추 없음');
  assert.deepStrictEqual([...h.match(/<div class="pj-th" aria-hidden="true">([\s\S]*?)<\/div>/)[1].matchAll(/<span[^>]*>([^<]*)<\/span>/g)].map((m) => m[1]), ['구분', '이름', '위치', '세대', '특별공급', '주택형', '일정', '입주', '시공·시행']);
  assert(!/findBtn|findHref|FIND_STAGE|PJ_MAX|pjRow|progHtml|pjEx|stepText/.test(TPL), '옛 사업 표 함수·머리 링크 없음');
  const tip = TPL.match(/<div class="tip" id="tip-pj" popover>([\s\S]*?)<\/div>/)[1];
  assert(tip.includes('<b>청약 단지</b>') && tip.includes('한국부동산원 청약홈 분양정보') && tip.includes('공공데이터포털') && tip.includes('수집 /*AH_REF*/') && tip.includes('줄을 누르면 청약홈 원문') && tip.includes('특별공급 비율은 전체 세대 대비예요'), tip);
  assert(tip.replace(/<[^>]*>/g, '').length < 140, '문구 최소: ⓘ 짧게');
  assert(fs.readFileSync(require('path').join(__dirname, 'build.js'), 'utf8').includes("'/*AH_REF*/': dot(D.ah.ref)") && h.length && ctx.D.ah.ref === AHRAW.ref && ctx.D.ah.from === AHRAW.from, '기준일 = 청약홈 manifest 수집일, 범위 = 2년');
  const built = fs.readFileSync(require('path').join(ROOT, 'docs', 'design', '대국민-모드-시안.html'), 'utf8');
  assert(built.includes(`수집 ${AHRAW.ref.replace(/-/g, '.')}</p>`), '빌드에 기준일이 들어간다');
});
t('청약 단지-2 청약 단계 = 오늘 날짜로(경계 날짜): 접수 예정 → 접수 중(시작·마감 당일 포함) → 발표 대기 → 계약 전(발표 당일) → 계약 중(계약 첫날·끝날) → 끝남, 특별공급 접수 시작이 먼저', () => {
  const x = ['단지', 100, 1, '', '202911', 59, 84, 'X', '2026-10-08', '2026-10-19', '2026-10-21', '2026-10-27', '2026-11-09', '2026-11-15', 'a', 0, 50, []];
  const st = (t) => { const s = AHK.ahStep(x, t); return `${s.k}|${s.t}|${s.nx}`; };
  assert.deepStrictEqual(['2026-10-18', '2026-10-19', '2026-10-21', '2026-10-22', '2026-10-26', '2026-10-27', '2026-11-08', '2026-11-09', '2026-11-15', '2026-11-16'].map(st), [
    '0|접수 예정|접수 10.19', '1|접수 중|마감 10.21', '1|접수 중|마감 10.21', '2|발표 대기|발표 10.27', '2|발표 대기|발표 10.27', '3|계약 전|계약 11.09~11.15', '3|계약 전|계약 11.09~11.15', '3|계약 중|계약 11.09~11.15', '3|계약 중|계약 11.09~11.15', '4|끝남|2026.10 공고']);
  /* 원천 전부(최근 2년 344건)와 시험 쪽 계산이 같다 — 오늘 · 한 달 전 · 한 달 뒤 */
  let n = 0;
  for (const today of ['2026-09-19', '2026-10-19', '2026-11-19']) for (const [u, L] of Object.entries(AHRAW.by)) {
    const rows = ctx.D.ah.u[u] || [];
    for (const x of rows) { const r = L.find((q) => q.d.HOUSE_NM === x[0] && q.d.RCRIT_PBLANC_DE === x[8] && x[14] && q.d.PBLANC_URL.endsWith(x[14])); assert(r, u + x[0]); const s = AHK.ahStep(x, today); assert.deepStrictEqual([s.t, s.nx], ahWant(r, today), u + ' ' + x[0] + ' ' + today); n++; }
  }
  assert(n > 300, n); console.log(`  단계 계산 ${n}건 = 원천 날짜`);
  assert(TPL.includes("D.meta.today = localDay(new Date());") && fnA('renderCells').includes('ahRows(D, keys, TODAY)'), '오늘 = 브라우저 날짜(TODAY)');
});
t('청약 단지-3 줄 = 원천 그대로: 이름(원래 이름, 넘치면 말줄임) · 세대(TOT_SUPLY_HSHLDCO) · 입주(MVN_PREARNGE_YM) · 주택형(Mdl 전용 범위) · 시공(민영)/시행 약칭(공공) · 원문 새 탭 — 서초·계양·수원', () => {
  const short = (s) => (s || '').split(',').map((p) => p.replace(/\(\s*주\s*\)|㈜|주식회사/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const ag = (p) => (/한국토지주택공사/.test(p.replace(/ /g, '')) ? 'LH' : /^서울주택도시/.test(p) ? 'SH' : /^경기주택도시공사/.test(p) ? 'GH' : /^인천도시공사/.test(p) ? 'iH' : p);
  for (const code of ['11650', '28245', '41110']) {
    const got = ahCells(ahCard(code)), want = ahSorted(AHRAW.by[code] || [], '2026-10-19').slice(0, 5);
    assert.strictEqual(got.length, Math.min(5, want.length), code);
    got.forEach((g, i) => {
      const { d, mdl } = want[i], ar = mdl.map((m) => Math.floor(parseFloat(m.HOUSE_TY))).filter((v) => v > 0), pub = d.HOUSE_DTL_SECD_NM === '국민';
      const co = pub ? [...new Set(short(d.BSNS_MBY_NM).map(ag))].join(', ') : short(d.CNSTRCT_ENTRPS_NM).join(', ');
      assert.deepStrictEqual([g.kind, g.nm, g.u, g.mv, g.ar, g.ag, g.href], [pub ? '공공분양' : '민영', escA(d.HOUSE_NM), `${fmtA(d.TOT_SUPLY_HSHLDCO)}세대`, `${d.MVN_PREARNGE_YM.slice(0, 4)}.${d.MVN_PREARNGE_YM.slice(4)}`,
        Math.min(...ar) === Math.max(...ar) ? `${Math.min(...ar)}㎡` : `${Math.min(...ar)}~${Math.max(...ar)}㎡`, escA(co), d.PBLANC_URL], `${code} ${i}`);
      assert.deepStrictEqual([g.st || '끝남', g.nx], ahWant(want[i], '2026-10-19'));
      assert(g.title.startsWith(escA(d.HOUSE_NM) + ' · ') && g.title.includes(`공고 ${d.RCRIT_PBLANC_DE.replace(/-/g, '.')}`) && g.title === g.aria, 'title·aria-label = 원래 이름 · 공고일');
    });
    console.log(`  ${code} ${S.regionOf[code].label}: ` + got.map((g) => `${g.nm.slice(0, 20)} | ${g.u} | ${g.st} | ${g.nx} | ${g.mv} | ${g.ar} | ${g.ag}`).join('\n    '));
  }
  assert(/\.ev \.nm \{[^}]*overflow: hidden; text-overflow: ellipsis; white-space: nowrap; \}/.test(CSS) && /\.pjs \.ev \.nm \{ grid-area: nm; font-weight: 700; \}/.test(CSS), '이름은 원래 이름 그대로 · 칸을 넘치면 말줄임');
  assert(!/\(주\)|주식회사|㈜/.test(JSON.stringify(ctx.D.ah)), "'(주)'·'주식회사' 없음");
  const pub = Object.values(ctx.D.ah.u).flat().filter((x) => x[2] === 0).map((x) => x[7]);
  assert(pub.length > 20 && pub.filter((a) => /^(LH|SH|GH|iH)(,|$)/.test(a)).length / pub.length > .8 && !pub.some((a) => /한국토지주택공사|서울주택도시|경기주택도시공사|인천도시공사/.test(a)), '공공 = 사업주체 약칭 LH·SH·GH·iH');
});
t('청약 단지-4 정렬 = 끝나지 않은 단계 먼저, 그다음 공고일 최근 순 · 최대 5줄 · 공고일 2년 안 · 경쟁률·분양가 없음 · 규제는 title·aria-label 에만', () => {
  const F = { ah: { url: 'u?', u: { A: [
    ['끝남 새것', 10, 1, '', '', 0, 0, '', '2026-09-01', '2026-09-10', '2026-09-11', '2026-09-18', '2026-09-28', '2026-09-30', 'a', 1, null, []],
    ['진행 옛것', 10, 1, '', '', 0, 0, '', '2026-08-01', '2026-10-01', '2026-10-02', '2026-10-10', '2026-11-01', '2026-11-30', 'b', 0, 0, []],
    ['끝남 옛것', 10, 1, '', '', 0, 0, '', '2025-01-01', '2025-01-10', '2025-01-11', '2025-01-18', '2025-01-28', '2025-01-30', 'c', 0, 0, []]] } } };
  assert.deepStrictEqual(AHK.ahRows(F, ['A'], '2026-10-19').map((o) => o.x[0]), ['진행 옛것', '끝남 새것', '끝남 옛것']);
  assert.deepStrictEqual(AHK.ahRows(F, ['A'], '2026-12-01').map((o) => o.x[0]), ['끝남 새것', '진행 옛것', '끝남 옛것'], '모두 끝나면 공고 최근 순');
  /* 실제 자료: 모든 면에서 카드 줄 수 = min(5, 원천 건수), 순서 = 시험 쪽 정렬 */
  let big = 0;
  for (const u of ctx.D.map.units.map((x) => x[0])) {
    const L = AHRAW.by[u] || []; if (!L.length) continue;
    const got = ahCells(ahCard(u)).map((g) => g.href), want = ahSorted(L, '2026-10-19').slice(0, 5).map((r) => r.d.PBLANC_URL);
    assert.deepStrictEqual(got, want, u); if (L.length > 5) big++;
  }
  assert(big >= 10, `5줄보다 많은 면 ${big}`);
  assert.strictEqual(AHK.AH_MAX, 5); assert(TPL.includes('const AH_MAX = 5, AH_NEAR = 3;'));
  for (const x of Object.values(ctx.D.ah.u).flat()) { assert(x[8] >= ctx.D.ah.from, x[0]); assert.strictEqual(x.length, 18, '줄 = 18칸(16 특공 · 17 유형별, 관리번호는 화면으로 보내지 않는다)'); }
  const src = srcOf('const AH_KIND = ', 'const yrHead = ') + fnA('renderCells'), bd = fs.readFileSync(require('path').join(__dirname, 'build_data.py'), 'utf8');
  assert(!/경쟁률|분양가(?!상한제)|LTTOT_TOP_AMOUNT|SUPLY_AR|만원/.test(src + bd.slice(bd.indexOf('# 청약 단지 카드'), bd.indexOf("ah = {'ref'"))), '경쟁률·분양가 없음');
  const fl = Object.entries(ctx.D.ah.u).flatMap(([u, L]) => L.filter((x) => x[15] & 1).map((x) => [u, x]))[0];
  const row = AHK.ahRow({ k: fl[0], x: fl[1] }, false), c = ahCells(`${row}`)[0];
  assert(c.title.includes('분양가상한제') && c.aria.includes('분양가상한제') && !c.vis.includes('분양가상한제'), '규제 표시는 title·aria-label 에만');
});
t('청약 단지-5 빈 시군구 = \'최근 2년 청약 없음\' 한 줄 + 맞닿은 면(D.nb)의 최근 단지 3줄(같은 정렬, 줄마다 시군구 이름) · 이웃에도 없으면 그 한 줄만', () => {
  const empty = ctx.D.map.units.map((u) => u[0]).filter((u) => !(AHRAW.by[u] || []).length);
  assert.deepStrictEqual(empty, ctx.D.map.units.map((u) => u[0]).filter((u) => !ctx.D.ah.u[u]), '빈 면 = 자료에 없는 면');
  for (const u of empty) {
    const h = ahCard(u), got = ahCells(h), nb = [...(ctx.D.nb[u] || [])];   // vm 쪽 배열을 이쪽 배열로(deepStrictEqual 은 원형까지 본다)
    assert(h.includes('<p class="none">최근 2년 청약 없음</p>'), u);
    const want = ahSorted(nb.flatMap((k) => (AHRAW.by[k] || []).map((r) => Object.assign({ k }, r))), '2026-10-19').slice(0, 3);
    assert.deepStrictEqual(got.map((g) => g.href), want.map((r) => r.d.PBLANC_URL), u);
    got.forEach((g, i) => assert(g.dg.startsWith(MAPOF_A[want[i].k].n), `${u} ${g.dg}`));
    if (!want.length) assert(!h.includes('<ul'), u + ' 이웃에도 없으면 한 줄만');
  }
  { const F = { ...ctx.D, nb: { ...ctx.D.nb, [empty[0]]: [] } }; const h = ahCard(empty[0], '2026-10-19', F); assert(h.includes('최근 2년 청약 없음') && !h.includes('<ul') && !h.includes('pj-th'), '이웃 없음 = 한 줄만'); }
  console.log(`  최근 2년 0건 ${empty.length}곳: ${empty.map((u) => MAPOF_A[u].n).join(' · ')}`);
});
t('청약 단지-6 시군구 묶음 = 지도 면 단위(unitKey): 수원시(41110)는 4개 구 공고를 합치고 구 코드로 봐도 같은 카드 · 시도 보기는 그 시도 면 전부(줄마다 시군구 이름)', () => {
  const sw = AHRAW.by['41110'], gus = new Set(sw.map((r) => r.n.sgg_code));
  assert(gus.size >= 2 && [...gus].every((c) => c.startsWith('4111') && c !== '41110'), [...gus].join());
  assert.strictEqual(ahCard('41113'), ahCard('41110'), '권선구 코드(색인에 있는 구)로 봐도 수원시 카드');
  assert(fnA('renderCells').includes('[unitKey(r.code)]') && fnA('renderCells').includes('MAPU.filter((u) => u.s === r.code)'), '단위 = unitKey(원장 사업을 면에 붙이는 규칙과 같다)');
  const bd = fs.readFileSync(require('path').join(__dirname, 'build_data.py'), 'utf8'); assert(bd.includes("unit = c[:4] + '0' if c.startswith('41') else c"), '자료도 같은 규칙');
  for (const sd of ['11', '28', '41']) {
    const got = ahCells(ahCard(sd)), keys = [...ctx.D.map.units.filter((u) => u[1] === sd).map((u) => u[0])];
    const want = ahSorted(keys.flatMap((k) => (AHRAW.by[k] || []).map((r) => Object.assign({ k }, r))), '2026-10-19').slice(0, 5);
    assert.deepStrictEqual(got.map((g) => g.href), want.map((r) => r.d.PBLANC_URL), sd);
    got.forEach((g, i) => assert(g.dg.startsWith(MAPOF_A[want[i].k].n), `${sd} ${g.dg}`));
  }
  assert(ahCells(ahCard('11650')).every((g) => !g.dg.includes('서초구')), '시군구 보기는 시군구 이름 없이 동만');
});
t('청약 단지-7 줄 누름 = 청약홈 원문 새 탭(target=_blank rel=noopener) · 지도 아이콘 칸·지도 위 카드·사업 시트·가리킴 강조 연결 없음 · 단계 필터는 이 카드를 거르지 않는다', () => {
  for (const g of ahCells(ahCard('41'))) assert(/^https:\/\/www\.applyhome\.co\.kr\/ai\/aia\/selectAPTLttotPblancDetail\.do\?houseManageNo=\d+&pblancNo=\d+$/.test(g.href), g.href);
  const src = srcOf('const AH_KIND = ', 'const yrHead = ') + fnA('renderCells');
  assert(!/mapi|mapBtn|data-prj|PRJA|data-unit|data-go|openPrjOnMap|hlUnit/.test(src), '이 카드에 지도·사업 시트 연결 없음');
  assert(!/function (hlRow|openPrjOnMap|openMapCard|mapCardHtml|placeMapCard|closeMapCard|mcWant|mcXY)\(|#c-pj \.ev|\.mapcard|\bMC\b/.test(TPL), '지도 위 사업 카드·줄 가리킴 강조는 지웠다');
  assert(TPL.includes("if (t.dataset.prj) { e.preventDefault(); openProject(t.dataset.prj, t); return; }"), '다른 목록·검색의 사업은 옆 시트 그대로');
  assert(!/stFil|cellF|projectsOf|STATUS\[f\]/.test(fnA('renderCells')) && !/renderCells|cellF/.test(fnA('paintFbar')) && !/\bcellF\b/.test(TPL), '단계 필터는 이 카드를 거르지 않는다(지도·순위·배지는 그대로)');
  assert(TPL.includes("renderLoc(); renderSum(); renderMapCard(); renderCells(); paintFbar();"), '보는 곳이 바뀌면 다시 그린다');
});
t('청약 단지-8 화면 규칙: 9칸 격자 하나(머리·줄 subgrid, 넓은 칸 한 줄 — 2026-10-20) · 좁은 칸(안쪽 1200 미만) 두 줄 · 진행 중 단계 칩은 일정 칸 앞(진행 중 줄만) · 의미색(접수 중 --ok · 그 밖 --primary), 끝남은 기본 칩 · 글자 14·16 토큰 · 기호 없음', () => {
  assert(/#c-pj \{ container: pj \/ inline-size; \}/.test(CSS) && /\.pj-th, \.pjs \{ grid-template-columns: var\(--pj-cols\);/.test(CSS), '7열은 globals 토큰 한 트랙');
  assert(/\.pjs > li \{ grid-column: 1 \/ -1; display: grid; grid-template-columns: subgrid;/.test(CSS) && /\.pjs \.ev \{ grid-column: 1 \/ -1; grid-template-columns: subgrid; grid-template-areas: 'ty nm dg u sp ar nx when ag';/.test(CSS) && /\.pjs \.ev \.nmw \{ display: contents; \}/.test(CSS));
  assert(/@container pj \(max-width: 1199px\) \{\n  #c-pj \.pj-th \{ display: none; \}\n  #c-pj \.pjs \{ grid-template-columns: max-content minmax\(0, 1fr\) max-content; \}[^\n]*\n  #c-pj \.pjs \.ev \{ grid-template-areas: 'nm nm u' 'sp nx when';/.test(CSS) && /#c-pj \.pjs \.ev :is\(\.pj-ar, \.pj-ag\) \{ display: none; \}/.test(CSS), '좁은 칸 두 줄');
  assert(/\.pj-st \.ui-chip\.on \{ --c: var\(--primary\); border-color: var\(--c\); background: color-mix\(in oklab, var\(--c\) var\(--tint-mix\), var\(--card\)\); color: color-mix\(in oklab, var\(--c\) 85%, var\(--foreground\)\); font-weight: 700; \}/.test(CSS) && /\.pj-st \.ui-chip\.on\.open \{ --c: var\(--ok\); \}/.test(CSS), '진행 중 칩 = 의미 토큰');
  const cls = Object.fromEntries(['2026-10-18', '2026-10-19', '2026-10-22', '2026-11-16'].map((t) => { const x = ['a', 1, 1, '', '', 0, 0, '', '2026-10-08', '2026-10-19', '2026-10-21', '2026-10-27', '2026-11-09', '2026-11-15', 'q', 0, 10, []]; const c = ahCells(AHK.ahRow({ k: '11650', x }, false, t))[0]; return [c.st || '끝남', `${c.stc}|${c.nxc}`]; }));
  assert.deepStrictEqual(cls, { '접수 예정': 'ui-chip on|pj-nx', '접수 중': 'ui-chip on open|pj-nx', '발표 대기': 'ui-chip on|pj-nx', '끝남': '|pj-nx tbd' }, '진행 중 줄만 일정 칸에 단계 칩 · 끝남 = 칩 없이 옅은 공고 연월');
  const pjCss = TPLCSS.split('\n').filter((l) => /^\s*(\.pj|#c-pj|\.pjs)/.test(l)).join('\n');
  assert([...pjCss.matchAll(/font-size: ([^;]+);/g)].every((m) => /^var\(--fs-(meta|body)\)$/.test(m[1])) && !/gradient|dash|hatch|#[0-9a-f]{3,8}\b|rgb\(/i.test(pjCss), '글자 14·16(토큰) · 색 리터럴·그라데이션 없음');
  assert(!/pj-band|pj-sn|pj-jd|pj-nt|mapcard|mc-/.test(TPLCSS), '옛 진행 띠·상태 칩·공고 물량·지도 위 카드 CSS 없음');
  const vis = ahCells(ahCard('41')).map((g) => g.vis).join(' ');
  assert(!/[①-⓿←-⇿■-◿•›‹\u{1F300}-\u{1FAFF}]/u.test(vis), '보이는 글에 기호 없음');
  assert(!TPL.includes('id="c-yr"') && !/\b(yrsChart|yearsOf|withYearGlide|paintYearChart|renderTl|tlHtml|paintYears)\b/.test(TPL), '옛 막대·일정표 없음');
});
t('청약 단지-9 특별공급 칸(사용자 피드백 \'청약 단계가 전부 끝남\' → 특별공급 세대): build_data 줄 16 특공 · 17 유형별 · 자르기 18 · 칸 글(세대·비율·없음·미정) · title 유형별 내역(0 유형 빠짐)', () => {
  const bd = fs.readFileSync(require('path').join(__dirname, 'build_data.py'), 'utf8');
  assert(bd.includes("sp, spk if any(spk) else [], d['HOUSE_MANAGE_NO']]") && bd.includes('(r[8], r[18])') && bd.includes('[r[:18] for r in L'), '줄 형식: 16 특공 · 17 유형별 · 18 관리번호(정렬용, 자름)');
  assert(bd.includes('if mdl else None'), '주택형 줄이 없으면 특공 = null');
  const K = ['NWWDS_HSHLDCO', 'LFE_FRST_HSHLDCO', 'MNYCH_HSHLDCO', 'OLD_PARNTS_SUPORT_HSHLDCO', 'INSTT_RECOMEND_HSHLDCO', 'YGMN_HSHLDCO', 'NWBB_HSHLDCO', 'TRANSR_INSTT_ENFSN_HSHLDCO', 'ETC_HSHLDCO'];
  let pos = 0, zero = 0, nul = 0, withKinds = 0;
  for (const [u, rows] of Object.entries(ctx.D.ah.u)) for (const x of rows) {
    const r = AHRAW.by[u].find((q) => q.d.HOUSE_NM === x[0] && q.d.RCRIT_PBLANC_DE === x[8] && q.d.PBLANC_URL.endsWith(x[14]));
    const sum = (k) => r.mdl.reduce((a, m) => a + (+m[k] || 0), 0), kinds = K.map(sum);
    assert.strictEqual(x[16], r.mdl.length ? sum('SPSPLY_HSHLDCO') : null, u + x[0]);
    assert.deepStrictEqual([...x[17]], kinds.some(Boolean) ? kinds : [], u + x[0]);
    if (x[16] == null) nul++; else if (x[16] === 0) zero++; else pos++; if (x[17].length) withKinds++;
  }
  console.log(`  특별공급 양수 ${pos} · 0 ${zero} · null ${nul} (유형별 있음 ${withKinds})`); assert(pos > 100);
  const row = (sp, kinds, tot = 1300, t = '2026-10-19') => AHK.ahRow({ k: '11650', x: ['단지', tot, 1, '', '', 0, 0, '', '2026-10-08', '2026-10-19', '2026-10-21', '2026-10-27', '2026-11-09', '2026-11-15', 'q', 0, sp, kinds] }, false, t);
  let c = ahCells(row(685, [200, 150, 0, 0, 0, 0, 0, 0, 335]))[0];
  assert.deepStrictEqual([c.sp, c.pc, c.spc], ['685세대', '53%', 'pj-sp'], '685세대 + 옅은 53%(같은 줄, 간격은 CSS)');
  assert(c.title.includes('특별공급 685세대(신혼부부 200 · 생애최초 150 · 기타 335)') && !c.title.includes('다자녀') && c.title === c.aria, c.title);
  const nk = ahCells(row(685, []))[0]; assert(nk.title.includes('특별공급 685세대 ·') && !nk.title.includes('685세대('), '유형별이 비면 괄호 없이');
  c = ahCells(row(0, []))[0]; assert.deepStrictEqual([c.sp, c.spc], ['없음', 'pj-sp tbd'], '0 = 옅은 없음'); assert(c.title.includes('특별공급 없음'));
  c = ahCells(row(null, []))[0]; assert.deepStrictEqual([c.sp, c.spc], ['미정', 'pj-sp tbd'], 'null = 옅은 미정'); assert(!c.title.includes('특별공급'));
  c = ahCells(row(50, [], 0))[0]; assert.deepStrictEqual([c.sp, c.pc], ['50세대', ''], '전체 세대 0 이면 비율 생략'); assert(!/pj-pc/.test(row(50, [], 0)));
  assert.strictEqual(ahCells(row(1, [], 3))[0].pc, '33%', '반올림 정수');
  const live = row(10, []), done = row(10, [], 100, '2026-12-01');
  assert(/<span class="pj-nx"><span class="pj-st"><span class="ui-chip on open">접수 중<\/span><\/span><span class="pj-nxt">마감 10\.21<\/span><\/span>/.test(live), live);
  assert(/<span class="pj-nx tbd"><span class="pj-nxt">2026\.10 공고<\/span><\/span>/.test(done) && !/pj-st/.test(done), done);
  assert(live.indexOf('pj-sp') < live.indexOf('pj-nx') && live.indexOf('pj-nx') < live.indexOf('class="when'), '칸 순서: 세대 · 특별공급 · 일정 · 입주');
  assert(!/청약 단계/.test(fnA('renderCells')) && TPL.includes('<span class="pj-sp">특별공급</span><span class="pj-ar">주택형</span>'), "열 머리에 '청약 단계' 없음");
});
/* 2026-10-19 사용자 결정('서울 선택 시 서울특별시에 해당하지 않는 부분은 회색으로 경계를 나눠'): 시도를 보면 그 시도 밖 면은 맥락 회색·평평, 시도 경계선, 라벨·사업 점·핀은 그 시도만 */
t('10-19 서울 보기 = 서울 밖 면 out(맥락 회색·평평, 면 효과 없음)·시도 경계선 레이어(서울에 닿은 선 진하게)·라벨은 서울만, 수도권 전체 보기는 모두 칠함', () => {
  const D = ctx.D, M = ctx.Map3D, GL = ctx.MapGL, TPL = fs.readFileSync(require('path').join(__dirname, 'template.html'), 'utf8'), CSS = tplStyle(TPL);
  const body = (nm) => { const i = TPL.indexOf(`function ${nm}(`); return TPL.slice(i, TPL.indexOf('\n}\n', i)); };
  const g = ctx.geomFor(D, S, 760, 430, false), all = ['11', '28', '41'].flatMap((sd) => ctx.unitsFor(D, S, sd)), vals = Object.fromEntries(all.map((x) => [x.key, x.u]));
  /* SVG 대체(공용 Map3D): 서울 밖 면은 높이 0(평평) — 값이 있어도 */
  const G = { Hmax: 32, st: { gv: g, o: { scope: '11' }, hs: g.own.map(() => 0), umax: 0 } }, P = M.heightPlan(G, vals);
  g.own.forEach((q, i) => { if (!q.code.startsWith('11')) assert.strictEqual(P.h1[i], 0, q.code + ' 서울 밖 = 평평'); else if (vals[q.code] > 0) assert(P.h1[i] > 0, q.code + ' 서울 면은 솟는다'); });
  const us = all.map((x) => ({ ...x, c: 1 })), F = (scope) => M.faces(g, { units: us, ...(scope === undefined ? {} : { scope }) }, { hs: P.h1 });
  const f11 = F('11'), f0 = F(null), fx = F(undefined);
  assert(f11.some((f) => f.sdlOn) && !f11.some((f) => f.sdl), '서울에 닿은 선(진하게)만 — 인천-경기 선은 그리지 않는다(2026-10-19 이웃 1단계)');
  assert(!f0.some((f) => f.sdlOn) && f0.some((f) => f.sdl), '수도권 전체 보기: 경계선은 모두 옅게');
  assert(!fx.some((f) => 'sdl' in f || 'sdlOn' in f), 'scope 를 주지 않으면(/map 개요) 경계선 없음 — 예전 그대로');
  assert(CSS.includes('.map .out { --c: var(--map-ctx); }') && CSS.includes('.map .sdl.on { stroke: var(--map-sido-line); stroke-width: var(--map-sido-w); }'), '맥락 회색·경계선 = 토큰');
  assert(M3.includes("if (!f || f.classList.contains('out')) continue;"), '밖 면은 띄우지 않는다');
  /* 진짜 3D(공용 MapGL): 경계선 층 = 고른 곳 윤곽 위 · 솟은 면 아래, 밖 면 식 */
  const lines = GL.sidoLines(D.map.units.map(([code, s, n, d, , , lx, ly]) => ({ code, s, n, d, lx, ly })));
  assert.strictEqual(lines.features.map((f) => f.properties.id).join(), '1128,1141,2841', '서울-인천·서울-경기·인천-경기');
  const cols = { face: Array(6).fill([1, 2, 3, 1]), lift: Array(6).fill([4, 5, 6, 1]), ce: Array(6).fill([7, 8, 9, 1]), line: [255, 255, 255, 1], sea: [0, 0, 0, .06], ctx: [9, 9, 9, 1] };
  const st = GL.styleOf(GL.toGeoJSON(D.map.units.map(([code, s, n, d, , , lx, ly]) => ({ code, s, n, d, lx, ly }))), cols, null, { lines }), ids = st.layers.map((l) => l.id);
  assert.strictEqual(ids.slice(-4).join(), 'gl-hl,gl-sido,gl-ext,gl-rim', '맨 위 = 시군구 경계 띠(2026-10-19)'); assert(/"feature-state","out"/.test(JSON.stringify(st.layers.find((l) => l.id === 'gl-flat').paint)));
  /* 화면 연결: 보는 시도 = camSido(고른 곳이 없으면 null) — 시도 탭·검색·순위·면 누름·내 동네는 모두 pick → renderMapCard 로 */
  assert(body('glDraw').includes('GLS.map.setScope(camSido());') && body('glDraw').indexOf('setScope(') < body('glDraw').indexOf('GLS.map.setValues('), 'GL: 높이보다 먼저 보는 시도');
  assert(body('renderMapCard').includes('GLS.map.setScope(camSido()); GLS.map.flyTo(camSido());') && body('renderMapCard').includes("VIEW.scope !== camSido()) drawMap('view');"), '같은 시도 안에서 수도권 → 시도로 바뀔 때도');
  assert(body('glMount').includes('scope: camSido()') && body('drawMap').includes('scope: VIEW.scope'));
  /* 라벨·순위 = 보는 시도 면만(서울 밖 라벨 없음), 사업 점 = 보는 시군구, 핀 = 같은 시도의 내 동네 */
  assert(ctx.unitsFor(D, S, '11').every((x) => x.key.startsWith('11')), '서울 보기 라벨 후보 = 서울 면');
  assert(body('drawBaseLabels').includes('GLS.map.labels(g, VIEW.units,') && TPL.includes("homeKey = hr && hr.kind === 'sgg' && sidoOf(hr) === sd ? unitKey(hr.code) : null"));
});
t('2026-10-19 지도 레일: 범례 구간 단추(aria-pressed 고정·다시 누르면 풀림·가리킴/초점 미리보기) → 지도(GL feature-state · SVG .fg.dim)·순위 줄·라벨 함께, 순위 ↔ 지도 양방향(가리킨 면 라벨 진하게 · 목록 칸 안에서만 그 줄로), 모든 줄 막대 · 보는 곳 줄 표시 · 구분선', () => {
  const fn = (name) => { const i = TPL.indexOf(`function ${name}(`); assert(i > 0, name); return TPL.slice(i, TPL.indexOf('\n}\n', i)); };
  /* 고정·풀기: 누른 칸 = 고정(미리보기도), 같은 칸을 다시 누르면 둘 다 풀림, 다른 칸이면 옮김 */
  const click = TPL.match(/document\.addEventListener\('click', \(e\) => \{ const b = e\.target\.closest\?\.\('#mapc \.lg-sw'\);[^\n]*/)[0];
  assert(click.includes('const lv = +b.dataset.lv, on = VIEW.bandFix !== lv; setBand(on ? lv : null, on ? lv : null);'));
  const V = { bandFix: null, bandPv: null }, press = (lv) => { const on = V.bandFix !== lv; V.bandFix = on ? lv : null; V.bandPv = on ? lv : null; };
  press(3); assert.deepStrictEqual([V.bandFix, V.bandPv], [3, 3]); press(5); assert.strictEqual(V.bandFix, 5); press(5); assert.deepStrictEqual([V.bandFix, V.bandPv], [null, null], '다시 누르면 풀림');
  const ui = fn('paintBandUi');
  assert(ui.includes("b.setAttribute('aria-pressed', String(+b.dataset.lv === VIEW.bandFix))") && ui.includes("b.classList.toggle('on', +b.dataset.lv === lv)") && ui.includes("li.classList.toggle('dim', lv != null && !!b && +b.dataset.c !== lv)"), 'aria-pressed = 고정 · 진한 칸 = 미리보기 또는 고정 · 순위 줄 흐림 = 색 단계가 다른 줄');
  assert(TPL.includes("document.addEventListener('mouseover', bandOn); document.addEventListener('focusin', bandOn);") && TPL.includes("document.addEventListener('mouseout', bandOff); document.addEventListener('focusout', bandOff);"), '가리킴·키보드 초점 = 미리보기');
  assert(fn('setBand').includes('paintBandUi(); paintRings(); drawOverlay();') && fn('paintRings').includes('GLS.map.setBand(bandKeys())') && fn('paintRings').includes('band: bandKeys()'), '지도는 칠하기만(GL feature-state · SVG paintFaces band)');
  assert(TPL.includes('const bandKeys = () => { const lv = bandLv(); return lv == null ? null : VIEW.all.filter((x) => (x.c || 0) === lv).map((x) => x.key); };'), '구간 = 같은 색 단계 면');
  assert(fn('paintLegend').includes('VIEW.bandFix != null && !nl.querySelector(`.lg-sw[data-lv="${VIEW.bandFix}"]`)) VIEW.bandFix = null;'), '모드가 바뀌어 그 색 단계가 없으면 풀림');
  assert(fn('drawOverlay').includes("l.classList.toggle('hv', k === VIEW.hoverKey); l.classList.toggle('dim', !!band && !band.has(k) && k !== VIEW.hoverKey);") && CSS.includes('.map .lb-g.hv .lb.nm { font-weight: 700; }') && CSS.includes('.map .lbls .lb-g.dim { opacity: var(--cz-dim-op); }'), '라벨: 가리킴 진하게 · 구간 밖 흐리게');
  /* 순위 ↔ 지도: 줄 가리킴·초점 → hlUnit(면 hv), 면 가리킴 → hlUnit(key, true) → 목록 칸 안 스크롤(페이지는 그대로), 줄임 설정이면 바로 */
  assert(TPL.includes("const t = e.target.closest?.('.map [data-area], .rk'); if (t) hlUnit(t.dataset.area, !t.classList.contains('rk'));") && fn('glHover').includes('true);') && (fn('mapKey').match(/hlUnit\(r\.key, true\)/g) || []).length === 2, '면에서 가리킴만 줄로 민다');
  const rv = fn('revealRow'); assert(rv.includes("ol.scrollTo({ top:") && rv.includes("behavior: fxOff(window) ? 'auto' : 'smooth'") && !rv.includes('scrollIntoView') && rv.includes('if (r.top >= a.top && r.bottom <= a.bottom) return false;'), '목록 칸 안에서만, 보이면 그대로');
  /* 디자인: 모든 줄 막대 · 보는 곳 줄 = 옅은 주색 면 + '보는 곳'(색 왼쪽 테두리 없음) · 구분선 · 토큰만 */
  const rk = srcOf('function rankHtml(', '\n/* lib/board/map-href.ts');
  assert(!rk.includes("!cap || i < 3 ?") && rk.includes(`\${vw && cap ? '<span class="vw">보는 곳</span>' : ''}`) && rk.includes('data-c="${x.c || 0}" data-u="${x.u}"'), '막대 전체 · 보는 곳 표시 · 색 단계·값');
  assert(CSS.includes('.rank li.view > .rk { background: color-mix(in oklab, var(--primary) var(--tint-mix), var(--card)); }') && !/\.rank li\.view[^{]*\{[^}]*border-left/.test(CSS) && CSS.includes('.mapc-b > .lgv { padding-top: var(--s3); border-top: var(--border-w) solid var(--border);'), '보는 곳 면 · 왼쪽 테두리 없음 · 순위/범례 구분선');
  assert(/\.rank \.rk \{[^}]*min-height: 44px|\.rk \{ position: relative;[^}]*min-height: 44px/.test(CSS) && CSS.includes('.rank .rk .v { margin-left: var(--s1); text-align: right; }'), '줄 높이 44 · 숫자 오른쪽');
  assert(/\.lg-bar \.lg-sw::before \{ content: ''; position: absolute; inset: calc\(var\(--s3\) \* -1\) 0 calc\(var\(--s5\) \* -1\); \}/.test(CSS) && CSS.includes('@media (prefers-reduced-motion: no-preference) { .lgv[data-band] .lg-bar .lg-sw.on { transform: translateY(-2px); } }'), '범례 칸 누름 칸 48 · 떠오름은 움직임 줄이기가 아닐 때만');
  assert(CSS.includes('.lgv[data-band] .lg-bar .lg-sw:not(.on) { opacity: var(--cz-dim-op); }') && CSS.includes('.lgv[data-band] .lg-grad > .lg-sw.on { z-index: 1; box-shadow: var(--shadow-hud); }'), '2026-10-19 그라데이션 범례: 고른 구간 조각만 떠 보이고(그림자) 나머지 조각은 옅게 덮인다');
  assert(/--cz-dim-op: \.\d+;/.test(GXR) && /--map-dim-mix: \d+%;/.test(GXR), '흐림 값 = globals 토큰');
});
const N = 107; console.log(`${pass}/${N} 통과`);
process.exit(pass === N ? 0 : 1);
