/* 검색 색인(브라우저 안에서만 돈다): 지역(시도·시군구) → 사업. 초성('ㄱㅇ')·한영 자판 오타('rPdid' → 계양)·치는 중인 글자('계ㅇ')를 자모 단위로 맞춘다.
   점수: 0 앞부분 글자 일치 · 1 중간 글자 일치 · 2~3 자모 일부 일치 · 3~4 초성 일치(낮을수록 위) */
function makeSearch(D) {
  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const JUNG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅗㅏ', 'ㅗㅐ', 'ㅗㅣ', 'ㅛ', 'ㅜ', 'ㅜㅓ', 'ㅜㅔ', 'ㅜㅣ', 'ㅠ', 'ㅡ', 'ㅡㅣ', 'ㅣ'];
  const JONG = ['', 'ㄱ', 'ㄲ', 'ㄱㅅ', 'ㄴ', 'ㄴㅈ', 'ㄴㅎ', 'ㄷ', 'ㄹ', 'ㄹㄱ', 'ㄹㅁ', 'ㄹㅂ', 'ㄹㅅ', 'ㄹㅌ', 'ㄹㅍ', 'ㄹㅎ', 'ㅁ', 'ㅂ', 'ㅂㅅ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  const SPLIT = { 'ㅘ': 'ㅗㅏ', 'ㅙ': 'ㅗㅐ', 'ㅚ': 'ㅗㅣ', 'ㅝ': 'ㅜㅓ', 'ㅞ': 'ㅜㅔ', 'ㅟ': 'ㅜㅣ', 'ㅢ': 'ㅡㅣ', 'ㄳ': 'ㄱㅅ', 'ㄵ': 'ㄴㅈ', 'ㄶ': 'ㄴㅎ', 'ㄺ': 'ㄹㄱ', 'ㄻ': 'ㄹㅁ', 'ㄼ': 'ㄹㅂ', 'ㄽ': 'ㄹㅅ', 'ㄾ': 'ㄹㅌ', 'ㄿ': 'ㄹㅍ', 'ㅀ': 'ㄹㅎ', 'ㅄ': 'ㅂㅅ' };
  /* 두벌식 자판: 영문 자판 상태로 친 글자 → 자모(Shift 는 쌍자음·ㅒ·ㅖ) */
  const KEY = { q: 'ㅂ', w: 'ㅈ', e: 'ㄷ', r: 'ㄱ', t: 'ㅅ', y: 'ㅛ', u: 'ㅕ', i: 'ㅑ', o: 'ㅐ', p: 'ㅔ', a: 'ㅁ', s: 'ㄴ', d: 'ㅇ', f: 'ㄹ', g: 'ㅎ', h: 'ㅗ', j: 'ㅓ', k: 'ㅏ', l: 'ㅣ', z: 'ㅋ', x: 'ㅌ', c: 'ㅊ', v: 'ㅍ', b: 'ㅠ', n: 'ㅜ', m: 'ㅡ', Q: 'ㅃ', W: 'ㅉ', E: 'ㄸ', R: 'ㄲ', T: 'ㅆ', O: 'ㅒ', P: 'ㅖ' };
  const isSyl = (c) => c >= '가' && c <= '힣';
  const isCons = (c) => CHO.includes(c);
  const jamoOf = (c) => {
    if (isSyl(c)) { const n = c.charCodeAt(0) - 0xAC00; return CHO[Math.floor(n / 588)] + JUNG[Math.floor((n % 588) / 28)] + JONG[n % 28]; }
    return SPLIT[c] || c.toLowerCase();
  };
  /* 이름 → 자모열·초성열과 각 자모가 몇 번째 글자에서 왔는지(공백은 건너뛴다) */
  function prep(text, cho = true) {
    const j = [], jc = [], js = [], i = [], ic = [];
    [...text].forEach((c, k) => {
      if (/\s/.test(c)) return;
      const s = jamoOf(c);
      [...s].forEach((x, n) => { j.push(x); jc.push(k); js.push(n === 0); });
      i.push(isSyl(c) ? s[0] : c.toLowerCase()); ic.push(k);
    });
    return { text, cho, j: j.join(''), jc, js, i: i.join(''), ic };
  }
  function variants(q) {
    const s = q.replace(/\s+/g, '');
    if (!s) return [];
    const mk = (j, en) => ({ j, en, cho: [...j].every(isCons) });
    const out = [mk([...s].map(jamoOf).join(''), false)];
    if (/[A-Za-z]/.test(s)) out.push(mk([...s].map((c) => KEY[c] || KEY[c.toLowerCase()] || c.toLowerCase()).join(''), true));
    return out;
  }
  const wordStart = (p, k) => k === 0 || /[\s(),·]/.test(p.text[k - 1]);   // 낱말 첫머리(이름 앞 또는 공백·괄호 뒤)
  function match(p, v) {
    if (v.cho) {
      if (!p.cho) return null;
      const at = p.i.indexOf(v.j);
      return at < 0 ? null : { score: wordStart(p, p.ic[at]) ? 3 : 4, hl: [p.ic[at], p.ic[at + v.j.length - 1] + 1] };
    }
    const at = p.j.indexOf(v.j);
    if (at < 0) return null;
    const end = at + v.j.length;
    const aligned = p.js[at] && (end === p.j.length || p.js[end]);
    return { score: (p.jc[at] === 0 || (p.js[at] && wordStart(p, p.jc[at])) ? 0 : 1) + (aligned ? 0 : 2), hl: [p.jc[at], p.jc[end - 1] + 1] };
  }
  function best(preps, vs) {
    let b = null;
    for (const v of vs) for (let k = 0; k < preps.length; k++) {
      const m = match(preps[k], v);
      if (m && (!b || m.score < b.score || (m.score === b.score && b.en && !v.en))) b = { score: m.score, hl: m.hl.map((n) => n + (preps[k].shift || 0)), field: preps[k].field ?? k, en: v.en };
    }
    return b;
  }

  /* 색인 만들기 */
  const SIDO_SHORT = { '11': '서울', '26': '부산', '27': '대구', '28': '인천', '30': '대전', '31': '울산', '36': '세종', '41': '경기', '43': '충북', '44': '충남', '12': '전남광주', '47': '경북', '48': '경남', '50': '제주', '51': '강원', '52': '전북' };
  const sidoFull = {};
  const shortOf = (full) => full.slice(full.indexOf(' ') + 1);
  for (const [code, full] of D.sgg) sidoFull[code.slice(0, 2)] = full.split(' ')[0];
  const dupCount = {};
  for (const [, full] of D.sgg) dupCount[shortOf(full)] = (dupCount[shortOf(full)] || 0) + 1;
  /* 검색 숫자도 상황판과 같은 정의(리본 ①~④ = 원장 단계 01~05, sumOf)로 센다 */
  const stat = (codes) => { const t = sumOf(D, codes); return { projects: t.n, units: t.u }; };
  const regions = [];
  for (const [sd, full] of Object.entries(sidoFull)) {
    const codes = D.sgg.filter(([c]) => c.startsWith(sd)).map(([c]) => c);
    regions.push({ kind: 'sido', code: sd, label: full, sub: '시도', short: SIDO_SHORT[sd], codes, ...stat(codes), preps: [prep(full), prep(SIDO_SHORT[sd], false)] });
  }
  for (const [code, full, zero] of D.sgg) {
    const sh = shortOf(full), sd = code.slice(0, 2);
    const dup = dupCount[sh] > 1, label = dup ? `${SIDO_SHORT[sd]} ${sh}` : sh;
    /* 초성은 시군구 이름에만 맞춘다(전체 이름 '강원특별자치도 …'·붙인 시도 '강원 고성군'이 'ㄱㅇ'에 걸리지 않게). 같은 이름이면 시도를 앞에 붙인 이름으로 보인다 */
    const preps = [prep(label, !dup), prep(full, false)];
    if (dup) preps.push(Object.assign(prep(sh), { field: 0, shift: label.length - sh.length }));
    regions.push({ kind: 'sgg', code, label, sub: full, short: label, zero: !!zero, codes: [code], ...stat([code]), preps });
  }
  /* 구가 있는 시(고양·수원·성남·용인 …): 시 단위 항목 하나로 구들을 묶는다(지도 면과 같은 단위). 시 코드로만 적힌 사업이 있으면 그 항목을 넓힌다 */
  const byCode = Object.fromEntries(regions.map((r) => [r.code, r]));
  for (const [code, full] of D.sgg) {
    const parts = full.split(' ');
    if (parts.length < 3) continue;
    const cc = code.slice(0, 4) + '0', cityFull = parts.slice(0, 2).join(' '), sd = code.slice(0, 2);
    let c = byCode[cc];
    if (!c) {
      const label = dupCount[parts[1]] > 1 ? `${SIDO_SHORT[sd]} ${parts[1]}` : parts[1];
      c = byCode[cc] = { kind: 'sgg', code: cc, label, sub: cityFull, short: label, zero: false, codes: [], preps: [prep(label), prep(cityFull, false)] };
      regions.push(c);
    }
    c.city = true;
    if (!c.codes.includes(cc) && D.prj[cc]) c.codes.push(cc);
    c.codes.push(code);
    Object.assign(c, stat(c.codes), { zero: false });
    byCode[code].parent = cc;
  }
  const regionOf = byCode;
  const projects = [];
  for (const [code, rows] of Object.entries(D.prj)) for (const [serial, name, stage, units] of rows) {
    if (!name) continue;   // 이름 없는 사업(53건)은 이름 검색에서 빠지고 지역 합계에만 든다
    projects.push({ id: `PRJ-${code}-${serial}`, sgg: code, name, stage, units, area: regionOf[code].label, preps: [prep(name)] });
  }

  function lev(a, b) {
    const m = a.length, n = b.length; let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
    return prev[n];
  }
  function suggest(q) {
    const qs = q.replace(/\s+/g, '');
    if (!/^[가-힣]{2,}$/.test(qs)) return [];
    const qj = [...qs].map(jamoOf).join('');
    const out = [];
    for (const r of regions) {
      const name = r.kind === 'sido' ? r.label : r.label.split(' ').pop();
      const j = [...name.replace(/\s+/g, '')].map(jamoOf).join('');
      let d = Infinity;
      for (let L = qj.length - 1; L <= qj.length + 1; L++) if (L > 0 && L <= j.length) d = Math.min(d, lev(qj, j.slice(0, L)));
      if (d <= 1) out.push({ ...r, d });
    }
    return out.sort((a, b) => a.d - b.d || b.projects - a.projects).slice(0, 3);
  }

  function search(q, { regionMax = 5, projectMax = 5 } = {}) {
    const vs = variants(q);
    const res = { q, en: false, regions: { total: 0, items: [] }, projects: { total: 0, items: [] }, addr: false, addrFirst: false, suggest: [] };
    if (!vs.length) return res;
    const hit = (list, tie) => list.map((x) => { const m = best(x.preps, vs); return m && { ...x, ...m }; }).filter(Boolean).sort((a, b) => a.score - b.score || tie(a, b));
    const R = hit(regions, (a, b) => (a.field - b.field) || b.projects - a.projects || a.label.length - b.label.length || a.code.localeCompare(b.code));
    const P = hit(projects, (a, b) => b.units - a.units || a.id.localeCompare(b.id));
    const cities = new Set(R.filter((x) => x.city).map((x) => x.code));
    const R2 = R.filter((x) => !(x.parent && cities.has(x.parent) && x.field === 0 && x.hl[1] <= regionOf[x.parent].label.length));
    res.regions = { total: R2.length, items: R2.slice(0, regionMax) };
    /* 주소·장소 묶음(서버)은 두 글자부터 늘 묻는다. 색인에서 0건이면 그 묶음이 앞에 선다('별내' 같은 동 이름) */
    res.addr = q.replace(/\s+/g, '').length >= 2;
    res.addrFirst = res.addr && !R2.length && !P.length;
    /* 찾으셨나요?: 색인에서 지역이 0건이면 자모 편집 거리 1 안의 지역(이름 앞부분 기준) */
    res.suggest = R2.length ? [] : suggest(q);
    res.projects = { total: P.length, items: P.slice(0, projectMax) };
    const top = [...R2.slice(0, 1), ...P.slice(0, 1)];
    res.en = top.length > 0 && top.every((x) => x.en);
    return res;
  }
  return { search, regions, regionOf, projects, stat, SIDO_SHORT };
}
/* 공급 예정 호수(진행 사업 호수): 리본 칸 ①~④(원장 단계 01~05). lib/board/metro-overview.ts 의 u 와 같은 정의 */
const OF_STAGE = { 1: 0, 2: 0, 3: 1, 4: 2, 5: 3, 6: 4 };
function sumOf(D, codes) {
  const st = [0, 0, 0, 0]; let u = 0, n = 0;
  for (const c of codes) for (const p of D.prj[c] || []) { const b = OF_STAGE[p[2]]; if (b > 3) continue; st[b] += p[3]; u += p[3]; n++; }
  return { u, n, st };
}
/* 보기와 내 동네: 면·막대·카드·이웃·검색 결과는 보기만 바꾼다([맞아요]로 시도만 정한 뒤에도). 저장은 [내 동네로 정하기]·[현 위치]·[맞아요]·검색의 '내 동네로'뿐이다
   — 시도만 정한 사람은 시군구를 고른 뒤 요약 카드의 [내 동네로 정하기]로 저장한다 */
const SAVE_SOURCES = ['set-home', 'gps', 'yes', 'search-home'];
function decidePick(state, source, code) {
  if (SAVE_SOURCES.includes(source)) return { home: code, view: null, save: true };
  return { home: state.home, view: code === state.home ? null : code, save: false };
}
if (typeof module !== 'undefined') module.exports = { makeSearch, sumOf, decidePick };
