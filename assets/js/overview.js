/* 지도 첫 화면 '수도권 개요'(/map · /map?sido=11|28|41). 상세 지도(app.js·지역 자료·지형·3D 건물·MapLibre)를 부르지 않는 가벼운 모듈이다.
   자료는 지도 페이지가 서버에서 센 window.OVERVIEW(lib/board/metro-overview.ts — 사업 화면·지역 공급과 같은 계산)이고, 여기서는 그리기만 한다.
   - 면: 시군구 경로(region-map 투영 정수)를 /citizen 과 같은 진짜 3D(MapLibre GL fill-extrusion — 공용 모듈 assets/js/map3d-gl.js · MapGL, 바탕 지도 없이 시군구 면만)로 그리고,
     주소 ?gl=0 · WebGL 없음 · 불러오기 실패면 SVG 흉내 3D(공용 모듈 assets/js/map3d.js · 모양 assets/css/map3d.css)로 대체한다(면 높이 = 진행 호수, 색 = 지표 단계).
     진짜 3D 는 시도를 고르면(시도 카드·면 누름·?sido=) 그 시도로 부드럽게 확대(flyTo), 풀면 수도권 본토로 축소한다 — 판·높이 배율·색 구간은 그대로.
     범위는 수도권 전체(쿼리 없음 — 세 시도 시군구 면이 무대를 채우고, 강화·옹진 섬 면은 그리지 않으며(값·순위·합계에는 그대로 든다), 수도권 밖 시도는 평평한 맥락 면으로 무대 밖은 잘림, data/board/korea-sido.json) 또는 ?sido= 의 시도(2026-10-19 — /citizen 과 같은 보는 시도 모드: 그 시도 면만 솟고, 1단계 이웃은 회색·평평, 그 너머와 수도권 밖 맥락 면은 그리지 않으며, 카메라는 그 시도 모양에 꼭 맞춘다).
     보기는 수도권 → 시도 2단이다(2026-10-18 사용자 지시 — /citizen 수도권 지도와 같은 범위·색, 그 전의 전국 보기는 없앴다). 수도권 보기에서 면·시도 카드를 누르면 그 시도로 확대하고, 수도권 밖 면은 고를 수 없다.
     지표를 바꾸면 색·이름표 숫자만 다시 칠하고 기하는 다시 만들지 않는다.
   - 지표 3개(진행 사업 호수 · 지연 사업 · 앞으로 12개월 준공)를 명도 5단계(분위수 경계)로 칠하고, 0 은 중립 색. 지연만 빨강(bad) 단계(<html data-ov-metric="d">), 나머지는 /citizen 과 같은 연두→남보라 램프(globals --map-ov-*).
   - 시군구를 누르면(시도 지도·순위 목록에서 Enter) 상세 지도 /map?sgg=<코드> 로 넘어간다. 구가 있는 경기 시는 작은 메뉴로 구를 고른다.
   - 순위는 가로 막대 목록(값 비례 · 면과 같은 단계 색): 패널 남은 높이에 들어가는 줄만 보이고(rowsFit · ResizeObserver) 전체는 '전체 n ›' 목록(#ovSheet, 그 안만 스크롤).
   순수 함수는 node --test 로 시험한다(tests/js/map-overview.test.cjs). DOM 은 mount 에서만 만진다. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MetroOverview = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- 주소 ---------- */
  /* 상세 지도로 여는 매개변수(region.js 의 코드 진입 + 옛 ?region=). 하나라도 있으면 상세, 없으면 개요 */
  const DETAIL_KEYS = ['project', 'pnu', 'bjd', 'sgg', 'code', 'region'];
  const SIDO = ['11', '28', '41'];
  function modeOf(search) {
    const q = new URLSearchParams(search || '');
    if (DETAIL_KEYS.some((k) => q.has(k))) return { mode: 'detail' };
    const s = q.get('sido');
    return { mode: 'overview', sido: SIDO.includes(s) ? s : '' };
  }
  const sggHref = (code) => `/map?sgg=${encodeURIComponent(code)}`;
  /* 지표 주소 값(?metric=): 개요 지표 id(u·d·a). 화면 쪽 계약의 'late' 는 지연(d)으로 읽는다 */
  const metricOf = (search, pub) => { const v = new URLSearchParams(search || '').get('metric'), r = v === 'late' ? 'd' : ['u', 'd', 'a'].includes(v) ? v : 'u'; return pub && r === 'd' ? 'u' : r; };   // pub(일반사용자 관점)은 지연 지표가 없어 u 로 본다
  /* 상세 지도 주소에 지금 지표를 붙인다(기본 '진행 호수'는 붙이지 않는다) — 상세가 지연 맥락(머리 줄 '지연 n' 칩·빨강 묶음 표지)을 이어 받는다 */
  const withMetric = (href, metric) => (metric && metric !== 'u' ? `${href}&metric=${metric}` : href);
  const sidoHref = (sido) => (sido ? `/map?sido=${sido}` : '/map');
  /* 주소를 다시 쓸 때 사업 창 관리자가 붙인 ?id=·?cand=(components/windows/nav.ts urlTarget)는 지우지 않고 잇는다 — 열린 창의 주소가 개요 이동으로 사라지지 않게 */
  const keepWin = (href, search) => { const q = new URLSearchParams(search || ''), k = q.get('id') ? 'id' : q.get('cand') ? 'cand' : ''; return k ? `${href}${href.includes('?') ? '&' : '?'}${k}=${encodeURIComponent(q.get(k))}` : href; };

  /* ---------- 경계: region-map 경로(투영 정수) ---------- */
  /* 'M절대 l상대…z' 고리들 → 투영 좌표 고리(닫지 않음) */
  function pathRings(d) {
    const out = [], re = /M(-?\d+) (-?\d+)l([^z]*)z/g;
    let m;
    while ((m = re.exec(String(d || '')))) {
      let x = Number(m[1]), y = Number(m[2]);
      const ring = [[x, y]], n = m[3].trim() ? m[3].trim().split(/\s+/).map(Number) : [];
      for (let i = 0; i + 1 < n.length; i += 2) { x += n[i]; y += n[i + 1]; ring.push([x, y]); }
      if (ring.length >= 3) out.push(ring);
    }
    return out;
  }
  const ringArea = (r) => Math.abs(r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  function inRing(pt, r) {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[i], b = r[j];
      if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  function ringsBox(rings) {
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const r of rings) for (const [x, y] of r) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); }
    return [b[0], b[1], b[2] - b[0], b[3] - b[1]];
  }
  /* 라벨 시작점: 가장 큰 고리 안에서 변과 가장 먼 격자점(오목한 시군구도 면 안에 든다). 3D 판에서는 Map3D.labelPoint 가 다듬은 면 안인지 다시 본다 */
  function labelPoint(rings) {
    const r = rings.slice().sort((p, q) => ringArea(q) - ringArea(p))[0];
    if (!r) return null;
    const [x0, y0, w, h] = ringsBox([r]), N = 24;
    const segDist = (p, a, b) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
      return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
    };
    let best = null, bd = -1;
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      const p = [x0 + (w * i) / N, y0 + (h * j) / N];
      if (!inRing(p, r)) continue;
      let d = Infinity;
      for (let k = 0, m = r.length - 1; k < r.length; m = k++) d = Math.min(d, segDist(p, r[m], r[k]));
      if (d > bd) { bd = d; best = p; }
    }
    return best || r[0];
  }

  /* 3D 판 범위: 수도권(sido '')은 섬(강화·옹진)을 뺀 세 시도 본토 면(2026-10-18 사용자 지시 '섬지역은 배제하고 수도권 기준으로' — 섬 삽입 지도도 없다. 무대 = 본토 판 상자),
     시도는 그 시도 면만(인천은 섬 삽입 지도로 강화·옹진). 2026-10-19 부터 개요 SVG 판은 svgScopeOf(본토 판 + 그 시도 맞춤)를 쓰고, 이 함수의 시도 범위는 시험·대조용으로 남는다.
     맥락 시도를 고르는 상자는 region-map 시도 상자(인천은 옹진 때문에 null → 판 상자 + 4%, /citizen 과 같은 규칙). 수도권 보기의 맥락 면은 mount 가 geom 에 따로 넘긴다(ctxBase) */
  const ISLES = ['28710', '28720'];
  function scopeOf(units, sido, view) {
    const codes = (units || []).filter((u) => !sido || u.s === sido).map((u) => u.code), isles = codes.filter((c) => ISLES.includes(c));
    return { own: codes.filter((c) => !isles.includes(c)), isles: sido ? isles : [], view: sido && sido !== '28' && view ? view[sido] || null : null };
  }
  /* SVG 판 범위(2026-10-19 — /citizen 과 같은 보는 시도 모드): 판 면은 늘 섬을 뺀 수도권 본토 전체(시도를 보면 그 밖 면은 draw 의 scope·hide 가 회색·숨김),
     시도를 보면 무대 맞춤 상자(geom fit) = 그 시도 본토 면 상자 — 진짜 3D 카메라처럼 그 시도 모양에 맞춘다 */
  function svgScopeOf(units, sido) {
    const all = scopeOf(units, '', null);
    return sido ? { ...all, fit: ringsBox((units || []).filter((u) => u.s === sido && !ISLES.includes(u.code)).flatMap((u) => pathRings(u.d))) } : all;
  }
  /* 수도권 보기 geom 옵션: 시도 외곽 면 묶음(prep 한 nat)을 평평한 맥락 면으로, 판 면이 있는 수도권 시도는 뺀다. 무대는 판 상자(fit 없음 — /citizen 과 같은 크기감) */
  const nationOpt = (nat) => (nat ? { ctxBase: nat, ctxOmit: SIDO } : {});
  /* 진짜 3D 맥락 면(평평한 면 층, 고를 수 없음): 전국 시도 외곽 가운데 수도권 밖만 [{ code, d }] */
  const glCtxOf = (sido) => (sido || []).filter((x) => !SIDO.includes(x.s)).map((x) => ({ code: x.s, d: x.d }));
  /* 진짜 3D 를 시도할지: 공용 모듈 주소가 있고 주소가 ?gl=0 이 아니면 'load'(WebGL 판정·maplibre 불러오기 뒤 'gl'), 아니면 처음부터 'svg' */
  const glModeOf = (search, src) => (!src || new URLSearchParams(search || '').get('gl') === '0' ? 'svg' : 'load');
  const MAPLIBRE = '/assets/vendor/maplibre-gl/5.24.0/maplibre-gl.js';   // 상세 지도(MapIsland LIBS)와 같은 주소 — 상세로 넘어가면 브라우저 캐시를 그대로 쓴다
  /* 순위 막대 목록에 보이는 줄 수: 목록 칸 높이(avail) ÷ 한 줄 높이(rowH), 줄 수(n) 이하 — 넘치는 줄은 숨기고 '전체 n ›' 이 받는다(패널 세로 스크롤 없음) */
  const rowsFit = (avail, rowH, n) => (rowH > 0 ? Math.max(0, Math.min(n, Math.floor((avail + .5) / rowH))) : n);
  /* 막대 길이(%): 목록 최댓값 대비, 0 이 아니면 최소 2% */
  const barPct = (v, max) => (v > 0 && max > 0 ? Math.max(2, Math.round((v / max) * 1000) / 10) : 0);
  /* Map3D.prep 입력: 코드·시도·이름·경로 + 라벨 시작점(labelPoint) */
  const seedOf = (units) => (units || []).map((u) => { const p = labelPoint(pathRings(u.d)) || [0, 0]; return { code: u.code, s: u.s, n: u.name, d: u.d, lx: p[0], ly: p[1] }; });

  /* ---------- 지표·색 단계 ---------- */
  const METRICS = [
    { id: 'u', name: '진행 사업 호수', short: '진행 호수', unit: '호' },
    { id: 'd', name: '지연 사업', short: '지연', unit: '건' },
    { id: 'a', name: '앞으로 12개월 준공', short: '12개월 준공', unit: '호' },
  ];
  /* 일반사용자 관점의 지표: 지연을 빼고 이름을 /citizen 과 맞춘다. 정책담당자 관점은 METRICS 그대로 */
  const PUBLIC_NAMES = { u: { name: '공급 예정 호수', short: '공급 예정 호수' }, a: { name: '1년 안 준공', short: '1년 안 준공' } };
  const metricsFor = (pub) => (pub ? METRICS.filter((m) => PUBLIC_NAMES[m.id]).map((m) => ({ ...m, ...PUBLIC_NAMES[m.id] })) : METRICS);
  const titleOf = (name, pub) => `${name} ${pub ? '공급 예정 호수' : '공급 개요'}`;
  const totalSubOf = (metric, v, pub) => metric === 'u' ? (pub ? `사업 ${fmt(v.n)}곳` : `진행 ${fmt(v.n)}건${v.q ? ` · 호수 미확인 ${fmt(v.q)}건` : ''}`) : metric === 'd' ? `전체 사업 ${fmt(v.st.reduce((a, b) => a + b, 0))}건 중` : `준공 예정 ${fmt(v.an)}건`;
  const valOf = (v, m) => (v ? v[m] || 0 : 0);
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const ymDot = (ym) => (ym ? `${ym.slice(0, 4)}.${ym.slice(5, 7)}` : '');
  const dayDot = (d) => (d ? d.slice(0, 10).replace(/-/g, '.') : '');
  function defOf(metric, doc, pub) {
    const m = doc && doc.months;
    if (pub && metric === 'u') return '계획부터 모집까지 진행 중인 사업의 계획 호수를 더한 값입니다. 호수가 아직 정해지지 않은 사업은 빠집니다.';
    if (pub) return `${m ? `${ymDot(m[0])}~${ymDot(m[1])}` : '앞으로 1년'}에 준공(공사 완료) 예정인 사업의 호수입니다. 같은 기간 입주 예정은 마우스를 올리면 따로 보입니다.`;
    if (metric === 'u') return '계획부터 모집까지(①~④) 진행 중인 사업의 계획 호수를 더한 값입니다. 호수가 아직 정해지지 않은 사업은 따로 건수로 셉니다. 사업 화면과 같은 기준입니다.';
    if (metric === 'd') return '예정일을 6개월 넘게 넘긴 사업 수입니다. 12개월 넘게 넘긴 장기 지연도 넣습니다. 사업 화면의 지연(장기 포함)과 같습니다.';
    return `${m ? `${ymDot(m[0])}~${ymDot(m[1])}` : '앞으로 12개월'}에 준공(공사 완료) 예정인 사업의 호수입니다. 사업 화면·지역 공급 화면의 준공 예정과 같은 기준입니다. 같은 기간 입주 예정은 마우스를 올리면 따로 보입니다.`;
  }
  /* 2자리 유효숫자로 올림(경계값을 읽기 쉽게) */
  function nice(v) {
    if (v < 10) return Math.ceil(v);
    const p = Math.pow(10, Math.floor(Math.log10(v)) - 1);
    return Math.ceil(v / p) * p;
  }
  /* 0 이 아닌 값들의 분위수 5단계 → 단계마다 윗값(오름차순, 마지막 = 최댓값). 서로 다른 값이 적으면 단계도 그만큼 */
  function breaksOf(values) {
    const xs = values.filter((v) => v > 0).sort((a, b) => a - b);
    if (!xs.length) return [];
    const max = xs[xs.length - 1], ups = [];
    for (let k = 1; k < 5; k++) {
      const q = nice(xs[Math.min(xs.length - 1, Math.ceil((xs.length * k) / 5) - 1)]);
      if (q < max && (!ups.length || q > ups[ups.length - 1])) ups.push(q);
    }
    ups.push(max);
    return ups;
  }
  /* 값 → 색 단계 0(값 0) · 1~5. 단계가 5보다 적으면 팔레트 양 끝을 쓰도록 퍼뜨린다 */
  function classOf(v, ups) {
    if (!(v > 0) || !ups.length) return 0;
    let i = ups.findIndex((u) => v <= u);
    if (i < 0) i = ups.length - 1;
    return ups.length === 1 ? 3 : 1 + Math.round((i * 4) / (ups.length - 1));
  }
  /* 범례 칸: [{ c(색 단계), text }] — 0 칸 + 단계마다 '이상~이하' */
  function legendOf(ups, unit) {
    const out = [{ c: 0, text: '0' }];
    ups.forEach((u, i) => {
      const lo = i ? ups[i - 1] + 1 : 1;
      out.push({ c: classOf(u, ups), text: lo >= u ? `${fmt(u)}${unit}` : `${fmt(lo)}~${fmt(u)}${unit}` });
    });
    return out;
  }
  /* 범례 마크업(/citizen 범례와 같은 모양): 머리(지표 이름(단위)) → [없음 견본 | 연속 그라데이션 막대] → 막대 아래 경계 눈금(구간 경계 = 다음 구간의 아래 끝 값, 1만 이상은 '2.4만') → '높이: …' 한 줄.
     그라데이션 색 멈춤 = 구간 가운데에 그 구간의 면 색 단계(--ov-N, 양 끝은 첫·끝 색). 눈금 글자가 구간 폭보다 넓을 것 같으면 한 칸 건너 둘째 줄. bw = 막대 폭(px 어림) */
  function legendHtml(ups, head, hint, bw) {
    const n = ups.length, pc = (x) => (x / n * 100).toFixed(2), tick = (v) => (v >= 1e4 ? `${+(v / 1e4).toFixed(1)}만` : fmt(v));
    const tk = ups.slice(0, -1).map((u) => tick(u + 1));
    const stag = n > 2 && Math.max(...tk.map((t) => [...t].reduce((w, c) => w + (/\d/.test(c) ? 8.5 : /[,.]/.test(c) ? 4.5 : 14), 0))) + 4 > bw / n;
    const cs = ups.map((u) => `var(--ov-${classOf(u, ups)})`), stops = n ? [`${cs[0]} 0%`, ...cs.map((c, i) => `${c} ${pc(i + 0.5)}%`), `${cs[n - 1]} 100%`].join(', ') : '';
    return `<h3 class="ov-lg-h">${esc(head)}</h3><div class="ov-lg-bar"><span class="ov-lg-sw"></span><span class="ov-lg-grad" style="--lg-stops:${stops}"></span></div>`
      + `<div class="ov-lg-ticks"><span class="ov-lg-tk0">없음</span><span class="ov-lg-tks">${tk.map((t, b) => `<span class="ov-lg-tk${stag && b % 2 ? ' l2' : ''}" style="--x:${pc(b + 1)}%">${t}</span>`).join('')}</span></div>`
      + `<small class="ov-lh" style="visibility:${hint ? '' : 'hidden'}">${esc(hint || '높이')}</small>`;
  }
  /* 순위: 값 큰 순, 같으면 시도·코드 순 */
  function rankOf(units, metric, sido) {
    return (units || []).filter((u) => !sido || u.s === sido).slice().sort((a, b) => valOf(b.v, metric) - valOf(a.v, metric) || a.code.localeCompare(b.code));
  }
  /* 면을 눌렀을 때: 구가 있으면 메뉴(구 → 주소), 없으면 바로 주소 */
  function pickOf(unit) {
    if (unit.gu && unit.gu.length) return { menu: unit.gu.map((g) => ({ code: g.code, name: g.name, v: g.v, href: g.code === unit.code ? `${sggHref(g.code)}&gu=none` : sggHref(g.code) })) };   // 구 미정(시 단위 코드)은 ?gu=none — 없으면 지도 첫 스크립트가 다시 이 메뉴로 넘긴다
    return { href: sggHref(unit.code) };
  }

  /* 시군구 목록 키보드(로빙 tabindex): names = 보이는 항목의 이름(묶음 단추는 ''), i = 지금 위치, key = 누른 키 → 옮길 위치(-1 이면 그대로).
     ↑↓ 는 끝에서 멈추고, Home·End 는 처음·끝, 글자 하나는 다음 항목부터 그 글자(한글은 초성도)로 시작하는 이름을 돌며 찾는다 */
  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const choOf = (ch) => { const c = String(ch).charCodeAt(0) - 0xac00; return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch; };
  function rankMove(names, i, key) {
    const n = names.length;
    if (!n) return -1;
    if (key === 'ArrowDown') return Math.min(n - 1, i + 1);
    if (key === 'ArrowUp') return Math.max(0, i - 1);
    if (key === 'Home') return 0;
    if (key === 'End') return n - 1;
    if (String(key).length !== 1 || key === ' ') return -1;
    const k = key.toLowerCase();
    for (let s = 1; s <= n; s++) { const j = (i + s) % n, a = String(names[j] || '').charAt(0).toLowerCase(); if (a && (a === k || choOf(a) === k)) return j; }
    return -1;
  }

  const SIDO_SHORT = { 11: '서울', 28: '인천', 41: '경기' };
  const STAGES = ['①계획', '②인허가', '③착공', '④모집', '⑤준공', '⑥입주'];
  const ST_VAR = ['--st-plan', '--st-permit', '--st-build', '--st-sale', '--st-soon', '--st-move'];
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const ICON_I = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.6"/><path d="M8 7.2v4"/><circle cx="8" cy="4.9" r=".55" class="dot"/></svg>';
  const ICON_MORE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4"/></svg>';
  function bandHtml(st) {
    const n = (st || []).reduce((a, b) => a + b, 0);
    if (!n) return '<span class="ov-band none" aria-hidden="true"></span>';
    return `<span class="ov-band" role="img" aria-label="현재 단계별 사업 수 ${st.map((v, i) => `${STAGES[i]} ${v}건`).filter((_, i) => st[i]).join(', ')}">${st.map((v, i) => (v ? `<i style="flex:${v};background:var(${ST_VAR[i]})" title="${STAGES[i]} ${v}건"></i>` : '')).join('')}</span>`;
  }

  /* ---------- 화면 ---------- */
  function mount(win, doc) {
    const D = win.OVERVIEW, root = doc.getElementById('ov'), M3 = win.Map3D;
    if (!root || !D) return null;
    const $ = (id) => doc.getElementById(id);
    const units = D.units || [], byCode = new Map(units.map((u) => [u.code, u]));
    const pickOfSearch = new URLSearchParams(win.location.search).get('pick');   // 아래 replaceState 가 주소를 바꾸기 전에 읽는다
    const isPub = () => doc.documentElement.getAttribute('data-aud') !== 'admin', ms = () => metricsFor(isPub());   // 관점은 head 의 AUDIENCE_INIT 이 html[data-aud] 에 먼저 넣는다
    const S = { metric: metricOf(win.location.search, isPub()), sido: modeOf(win.location.search).sido, hover: null, menu: null, going: false, pick: null, at: null };
    let ups = [];

    /* 패널 */
    const panel = $('ovPanel');
    $('ovAsOf').textContent = D.referenceDate ? `${dayDot(D.referenceDate)} 기준` : '';
    const mbox = $('ovMetrics');
    const buildTabs = () => { mbox.innerHTML = ms().map((m) => `<button type="button" role="radio" data-m="${m.id}" aria-checked="${m.id === S.metric}" tabindex="${m.id === S.metric ? 0 : -1}">${esc(m.short)}</button>`).join(''); };
    buildTabs();
    mbox.addEventListener('click', (e) => { const b = e.target.closest('button[data-m]'); if (b) setMetric(b.dataset.m); });
    mbox.addEventListener('keydown', (e) => {
      const MS = ms(), i = MS.findIndex((m) => m.id === S.metric), k = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!k) return;
      e.preventDefault();
      setMetric(MS[(i + k + MS.length) % MS.length].id);
      mbox.querySelector(`[data-m="${S.metric}"]`).focus();
    });
    const defBtn = $('ovDefBtn'), defP = $('ovDef');
    defBtn.innerHTML = ICON_I;
    defBtn.addEventListener('click', () => { const open = defBtn.getAttribute('aria-expanded') !== 'true'; defBtn.setAttribute('aria-expanded', String(open)); defP.hidden = !open; });
    $('ovCards').addEventListener('click', (e) => { const b = e.target.closest('button[data-s]'); if (b) setSido(S.sido === b.dataset.s ? '' : b.dataset.s, true); });
    $('ovBack').addEventListener('click', () => setSido('', true));   // 시도에서 수도권 전체로
    /* 시군구 목록 둘(#ovRank 패널 막대 목록 · #ovRankAll '전체 n' 목록)은 같은 사건을 받는다: 누름 → 상세(구 메뉴), 가리킴·초점 ↔ 면 효과, 로빙 tabindex */
    const LISTS = [$('ovRank'), $('ovRankAll')];
    for (const L of LISTS) L.addEventListener('click', (e) => {
      const z = e.target.closest('.ov-zbtn');
      if (z) { const on = z.getAttribute('aria-expanded') !== 'true'; z.setAttribute('aria-expanded', String(on)); z.querySelector('.ov-zc').textContent = on ? '▴' : '▾'; $('ovZeroList').hidden = !on; rove(L); return; }
      const b = e.target.closest('button[data-c]'); if (b) choose(b.dataset.c, b); });
    /* 시군구 목록: 로빙 tabindex(목록 안 항목 하나만 Tab 으로 들어가고, 안에서는 ↑↓·Home·End·첫 글자로 옮긴다 — 2026-10-15 평가 P3). 숨긴 줄(넘친 줄·접힌 묶음)은 건너뛴다 */
    const rankBtns = (L) => [...L.querySelectorAll('button')].filter((b) => !b.closest('[hidden]'));
    let rk = null;   // 목록에서 마지막으로 초점이 있던 항목(시군구 코드, 묶음 단추는 'zeros')
    const keyOf = (b) => b.dataset.c || 'zeros';
    function rove(L) {
      const bs = rankBtns(L), cur = bs.find((b) => keyOf(b) === rk) || bs[0];
      L.querySelectorAll('button').forEach((b) => { b.tabIndex = b === cur ? 0 : -1; });
    }
    for (const L of LISTS) {
      L.addEventListener('focusin', (e) => { const b = e.target.closest('button'); if (b) { rk = keyOf(b); rove(L); } });
      L.addEventListener('keydown', (e) => {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        const bs = rankBtns(L), i = bs.indexOf(doc.activeElement);
        if (i < 0) return;
        const j = rankMove(bs.map((b) => b.dataset.n || ''), i, e.key);
        if (j < 0) return;
        e.preventDefault();
        bs[j].focus();
        if (bs[j].scrollIntoView) bs[j].scrollIntoView({ block: 'nearest' });
      });
    }
    /* '전체 n ›' 목록: 화면 가운데 모달리스 팝업(좁은 화면은 패널 안 판, 그 안만 스크롤). 막은 흐리게만 하고 클릭은 통과. Esc·닫기로 닫고 여는 단추로 초점을 돌린다 */
    const sheetEl = $('ovSheet'), allBtn = $('ovAll'), scrimEl = $('ovScrim');
    function openSheet(on) {
      sheetEl.hidden = !on; scrimEl.classList.toggle('on', on); allBtn.setAttribute('aria-expanded', String(on));
      if (on) { rove($('ovRankAll')); const f = rankBtns($('ovRankAll')).find((b) => b.tabIndex === 0); if (f) f.focus(); } else allBtn.focus();
    }
    allBtn.addEventListener('click', () => openSheet(sheetEl.hidden));
    $('ovSheetX').addEventListener('click', () => openSheet(false));
    sheetEl.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !S.menu) { e.preventDefault(); openSheet(false); } });
    /* 패널 막대 목록에 들어가는 줄 수: 목록 칸 높이 ÷ 첫 줄 높이(넘친 줄은 hidden — 패널은 스크롤하지 않는다) */
    function fitRanks() {
      const L = $('ovRank'), li = [...L.children], h = li[0] ? li[0].offsetHeight : 0, n = rowsFit(L.clientHeight, h, li.length);
      li.forEach((x, i) => { x.hidden = i >= n; });
      rove(L);
    }
    if (!D.ok) { $('ovFail').hidden = false; }
    const handle = $('ovHandle');
    if (handle) handle.addEventListener('click', () => { const full = panel.dataset.sheet !== 'full'; panel.dataset.sheet = full ? 'full' : 'peek'; handle.setAttribute('aria-expanded', String(full)); handle.setAttribute('aria-label', full ? '개요 패널 접기' : '개요 패널 펼치기'); });   // 지도 무대는 접힌 시트 위까지라 펴고 접어도 다시 그리지 않는다

    function renderPanel() {
      const m = ms().find((x) => x.id === S.metric);
      const vals = units.map((u) => valOf(u.v, S.metric));
      ups = breaksOf(vals);
      doc.documentElement.setAttribute('data-ov-metric', S.metric);   // 면·범례·라벨 색 단계(지연만 빨강, app.css)
      mbox.querySelectorAll('button[data-m]').forEach((b) => { const on = b.dataset.m === S.metric; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
      const scope = S.sido ? (D.sido || []).find((s) => s.code === S.sido) : null, v = scope ? scope.v : D.total;
      $('ovTitle').textContent = titleOf(scope ? scope.name : '수도권', isPub());   // ?sido= 로 열면 제목·합계가 그 시도(2026-10-15 평가 P2)
      $('ovBack').hidden = !scope;
      $('ovTotalQ').textContent = `${scope ? scope.name : '수도권'} ${m.name}`;
      defBtn.title = defOf(S.metric, D, isPub()); defBtn.setAttribute('aria-label', `${m.name} 정의 보기`); defP.textContent = defOf(S.metric, D, isPub());
      $('ovTotal').innerHTML = D.ok && v ? `<b class="ov-big">${fmt(valOf(v, S.metric))}</b><span class="ov-unit">${m.unit}</span>` : '<b class="ov-big none">—</b>';
      $('ovTotalSub').textContent = !D.ok || !v ? '' : totalSubOf(S.metric, v, isPub());
      /* 12개월: 대표는 준공. 입주는 마우스 올림 설명(title)에만 분해로 둔다 */
      $('ovTotal').title = D.ok && v && S.metric === 'a' ? `준공 ${fmt(v.a)}호(${fmt(v.an)}건) · 같은 기간 입주 ${fmt(v.mi || 0)}호(${fmt(v.mn || 0)}건) — 입주는 더하지 않습니다` : '';
      $('ovCards').innerHTML = (D.sido || []).map((s) => `<button type="button" class="ov-card" data-s="${s.code}" aria-pressed="${S.sido === s.code}" title="${esc(`${s.name}로 맞춥니다. 다시 누르면 수도권 전체`)}">`
        + `<span class="ov-cn">${esc(s.name)}</span><span class="ov-cv">${D.ok && s.v ? `${fmt(valOf(s.v, S.metric))}<small>${m.unit}</small>` : '—'}</span>${D.ok && s.v ? bandHtml(s.v.st) : ''}</button>`).join('');
      const list = rankOf(units, S.metric, S.sido), where = S.sido ? SIDO_SHORT[S.sido] : '수도권';
      $('ovRankH').textContent = `${where} 시군구`;
      $('ovSheetH').textContent = `${where} 시군구`; $('ovSheetN').textContent = `${fmt(list.length)}곳`;   // 제목 / 보조 건수(14) 나눔(2026-10-19 핸드오프 5·6절)
      allBtn.innerHTML = `전체 ${list.length}${ICON_MORE}`; allBtn.setAttribute('aria-label', `${where} 시군구 전체 ${list.length}곳 목록`);
      /* 막대 줄: 순위 · 이름 · 막대(값 비례, 지도 면과 같은 단계 색 cN) · 값. 막대 최댓값은 이 목록의 1위 */
      const top = D.ok ? Math.max(0, ...list.map((u) => valOf(u.v, S.metric))) : 0;
      const rankRow = (u, i, zero) => {
        const x = valOf(u.v, S.metric), more = u.gu && u.gu.length;
        return `<li><button type="button" data-c="${u.code}" data-n="${esc(u.name)}"${more ? ' aria-haspopup="dialog"' : ''} class="${x ? '' : 'zero'}" title="${esc(more ? `${u.name}: 구를 골라 상세 지도로` : `${u.name} 상세 지도로`)}">`
          + `<span class="ov-rn">${D.ok && !zero ? i + 1 : ''}</span><span class="ov-rname">${S.sido ? '' : `<small>${SIDO_SHORT[u.s]}</small>`}${esc(u.name)}</span>`
          + `<span class="ov-rbar" aria-hidden="true">${D.ok && x ? `<i class="ov-sw c${classOf(x, ups)}" style="width:${barPct(x, top)}%"></i>` : ''}</span>`
          + `<span class="ov-rv">${D.ok ? `${fmt(x)}<small>${m.unit}</small>` : ''}</span><span class="ov-rgo">${more ? ICON_MORE : ''}</span></button></li>`;
      };
      /* 값이 0인 시군구는 순위를 매기지 않는다: 패널 막대 목록에는 값 있는 곳만, '전체 n' 목록 끝에 '값 없음 n곳' 묶음으로 접는다(누르거나 Enter·Space 로 펼친다) */
      const hit = D.ok ? list.filter((u) => valOf(u.v, S.metric) > 0) : list, none = D.ok ? list.filter((u) => !(valOf(u.v, S.metric) > 0)) : [];
      const open = $('ovRankAll').querySelector('.ov-zeros > button[aria-expanded="true"]') !== null;
      $('ovRank').innerHTML = hit.map((u, i) => rankRow(u, i, false)).join('');
      $('ovRankAll').innerHTML = hit.map((u, i) => rankRow(u, i, false)).join('')
        + (none.length ? `<li class="ov-zeros"><button type="button" class="ov-zbtn" aria-expanded="${open}" aria-controls="ovZeroList"><span>값 없음 ${none.length}곳</span><span class="ov-zc" aria-hidden="true">${open ? '▴' : '▾'}</span></button><ol id="ovZeroList" class="ov-zlist"${open ? '' : ' hidden'}>${none.map((u) => rankRow(u, 0, true)).join('')}</ol></li>` : '');
      rove($('ovRankAll'));
      /* 범례: 넓은 화면은 패널 맨 아래(#ovLegend), 좁은 화면은 지도 위 띠(#ovLegendTop) — 같은 마크업을 두 곳에 그리고 CSS 가 하나만 보인다.
         면 높이는 지표와 상관없이 진행 호수(기하를 다시 만들지 않는다) — 색 지표가 다를 때만 '높이: …' 한 줄로 알린다(자리는 늘 두어 범례 높이가 바뀌지 않게) */
      const hint = S.metric === 'u' ? '' : `높이: ${ms().find((x) => x.id === 'u').name}`, head = `${m.name}(${m.unit})`;
      const lgHtml = D.ok && ups.length ? legendHtml(ups, head, hint, win.innerWidth <= 768 ? Math.max(120, win.innerWidth - 44) : 300) : '';
      const lgAria = D.ok && ups.length ? `${head}: ${legendOf(ups, '').map((x, i) => (i ? x.text : '0(없음)')).join(', ')}${hint ? `. ${hint}` : ''}` : '';
      [$('ovLegend'), $('ovLegendTop')].forEach((el) => { el.innerHTML = lgHtml; el.setAttribute('aria-label', lgAria); });
      fitRanks();   // 범례가 패널 아래 자리를 차지하므로 범례를 그린 뒤에 순위 줄 수를 잰다(순위 칸은 남은 높이)
      /* 빈 상태: 값 있는 시군구가 3곳 미만이면 지도가 거의 회색이라 무엇을 보는지 한 줄로 알린다(예: '수도권 지연 사업 2건 — 인천 서구·경기 오산시') */
      const note = $('ovEmpty');
      if (note) {
        note.textContent = D.ok ? emptyNote(`${scope ? scope.name : '수도권'} ${m.name}`, valOf(v, S.metric), m.unit, hit.map((u) => `${SIDO_SHORT[u.s]} ${u.name}`)) : '';
        note.hidden = !note.textContent;
        const lg = $('ovLegendTop');   // 좁은 화면은 범례가 위 띠라 그 아래에 둔다
        note.style.top = !note.hidden && win.innerWidth <= 768 ? `${lg.offsetTop + lg.offsetHeight + 8}px` : '';
      }
    }

    function setMetric(id) {
      if (!ms().some((m) => m.id === id) || id === S.metric) return;
      S.metric = id; renderPanel(); paint();
    }
    function setSido(sido, push) {
      S.sido = sido;
      if (push && win.history && win.history.replaceState) win.history.replaceState(null, '', keepWin(sidoHref(sido), win.location.search));
      renderPanel(); drawMap(true);   // 범위가 바뀌면 SVG 판은 기하를 새로 만들고, 진짜 3D 는 그 범위로 날아간다(flyTo)
    }

    /* ---------- 지도: 3D 단계 구분도(공용 모듈 Map3D — /citizen 과 같은 구현) ----------
       무대(#ovStage)는 넓은 화면에서 지도 칸 전체(범례는 패널 맨 아래라 비켜 갈 것 없음), 좁은 화면(≤768)에서는 위 범례 띠와 접힌 아래 시트 사이.
       기하는 범위·무대 크기·휴대폰 여부가 바뀔 때만 만들고(drawMap), 지표를 바꾸면 색·이름표만 다시 칠한다(paint). 면 높이 = 진행 호수(√ 척도) */
    const stage = $('ovStage'), svg = stage.querySelector('svg.map'), legendBox = $('ovLegendTop');
    const seeds = seedOf(units), base = M3.prep(seeds);
    /* 보는 시도의 1단계 이웃 밖 면(SVG 판이 그리지 않는 면 — 진짜 3D 는 MapGL 이 같은 Map3D.nearOf 로, /citizen hideOf 와 같다): 시도마다 한 번 */
    const HIDE = {}, hideOf = (sd) => (HIDE[sd] = HIDE[sd] || M3.nearOf(base, sd, { omit: ISLES }).hide);
    /* 수도권 보기 맥락 면(시도 외곽 16곳 — 페이지가 korea-sido.json 에서 붙인다). 없으면 판 둘레는 빈 바탕 */
    const nat = D.nation ? M3.prep(D.nation.sido.map((x) => ({ code: x.s, s: x.s, n: x.n, d: x.d, lx: x.l[0], ly: x.l[1] }))) : null;
    const hOf = Object.fromEntries(units.map((u) => [u.code, D.ok ? valOf(u.v, 'u') : 0]));
    const ux = new Map(units.map((u) => [u.code, { key: u.code, s: u.s, name: u.name, u: 0, c: 0 }]));   // 이름표·색 단계 단위(지표마다 u·c 만 바꾼다, 그린 면이 같은 객체를 가리킨다)
    const unitOf = () => { for (const u of units) { const x = ux.get(u.code); x.u = D.ok ? valOf(u.v, S.metric) : 0; x.c = D.ok ? classOf(x.u, ups) : 0; } };
    const inScope = () => [...ux.values()].filter((x) => !S.sido || x.s === S.sido);
    const ariaOf = (x) => { const m = ms().find((q) => q.id === S.metric); return `${SIDO_SHORT[x.s]} ${x.name} ${D.ok ? `${fmt(x.u)}${m.unit}` : '수치 없음'}`; };
    const sheet = () => win.matchMedia('(max-width: 768px)').matches;
    const clsOf = () => Object.fromEntries([...ux.values()].map((x) => [x.key, x.c]));
    let G = null, drawn = '';

    /* ---------- 진짜 3D(2026-10-18 사용자 결정 — 공용 모듈 MapGL, /citizen 과 같은 구현) ----------
       GL.mode: 'load'(공용 모듈·maplibre 를 부르는 중 — 무대는 비워 두고 패널이 먼저) · 'gl' · 'svg'(?gl=0 · 모듈 주소 없음 · WebGL 없음 · 불러오기·붙이기 실패 · 8초 안에 첫 그림 없음 · 맥락 잃음 → 아래 SVG 판).
       지도 하나를 끝까지 쓴다(source 는 붙일 때 한 번): 범위 = 시도 → flyTo(시도), 수도권 → flyTo(null). 높이 = 진행 호수(판 하나 배율), 지표 전환 = 색 단계(setClasses)·색(setColors)·이름표만.
       섬(강화·옹진)은 면이 없다(값·순위·합계에는 그대로 — 순위 목록에서 고른다). 수도권 밖 시도는 평평한 맥락 면 층(방향 감각, 고를 수 없음). 라벨은 무대 위 덮개 svg(svg.map — SVG 판과 같은 마크업·모양) */
    const GL = { mode: glModeOf(win.location.search, root.dataset.gl), map: null, cols: '', G: null, drawn: false, narrow: false };
    const glOn = () => GL.mode === 'gl' && !!GL.map && GL.map.ready;
    const script = (src) => new Promise((ok, no) => { const s = doc.createElement('script'); s.src = src; s.async = true; s.onload = () => ok(); s.onerror = () => no(new Error(src)); doc.head.appendChild(s); });
    function glFallback() {
      const m = GL.map, was = GL.mode; GL.map = null; GL.mode = 'svg'; GL.G = null;   // 먼저 끊는다(떼는 동안 맥락 잃음 사건이 다시 와도 한 번만)
      if (m) { try { m.destroy(); } catch (_) { /* 이미 잃은 맥락 */ } m.el.remove(); }
      svg.classList.remove('glov'); svg.removeAttribute('aria-hidden'); svg.setAttribute('role', 'presentation'); svg.innerHTML = '';
      if (was !== 'svg') drawMap(true);
    }
    const glAria = () => { const x = S.at && ux.get(S.at); stage.setAttribute('aria-label', `${S.sido ? SIDO_SHORT[S.sido] : '수도권'} 시군구 지도${x ? `, ${ariaOf(x)}` : ''}. 화살표로 옮기고 Enter 로 ${S.sido ? '상세 지도를 엽니다' : '그 시도를 확대합니다'}`); };
    function glMount() {
      const el = doc.createElement('div'); el.className = 'glmap'; stage.prepend(el);
      /* 범례는 패널 맨 아래라 넓은 화면에서도 지도 칸을 비켜 갈 것이 없다 */
      const left = () => 12;
      /* 보는 시도 모드(scope — /citizen 과 같다, 2026-10-19): 시도를 보면 밖 면은 1단계 이웃만 회색·평평, 그 너머는 그리지 않고, 카메라는 그 시도 모양에 꼭 맞춘다(padFor tight — 왼쪽만 범례 칸 비킴) */
      const pad = ({ hmax }) => (S.sido ? { ...win.MapGL.padFor(hmax, true), left: left() } : { top: hmax + 14, right: 12, bottom: 14, left: left() });
      try { GL.map = win.MapGL.mount(el, { units: seeds, target: S.sido || null, scope: S.sido || null, ctx: D.nation ? glCtxOf(D.nation.sido) : [], padding: pad }); }
      catch (_) { el.remove(); glFallback(); return; }
      GL.map.map.on('load', glLayers);
      const wait = win.setTimeout(() => { if (GL.map && !GL.map.ready) glFallback(); }, 8000);
      GL.map.on('ready', () => { win.clearTimeout(wait); GL.map.overlay(svg); drawMap(true); }).on('settle', glSettle).on('lost', glFallback)
        .on('hover', (k) => { hover(k && byCode.has(k) ? k : null); if (!k) hideTip(); })
        .on('pick', glPick);
      GL.map.map.on('mousemove', (e) => { const u = S.hover && byCode.get(S.hover); if (u && !S.menu && e.originalEvent) showTip(u, ptOf(e.originalEvent)); });   // 모듈의 가리킴 사건 뒤라 S.hover 가 이미 지금 면
    }
    /* 층 보이기: 수도권 밖 맥락 면(gl-ctx)은 수도권 전체 보기에만, 시도 경계선(gl-sido)은 시도 보기에만(수도권 전체는 예전 /map 그대로 — 경계선 없음) */
    function glLayers() {
      const m = GL.map && GL.map.map; if (!m || !m.getLayer) return;
      for (const [id, on] of [['gl-ctx', !S.sido], ['gl-ctx-line', !S.sido], ['gl-sido', !!S.sido]]) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    }
    /* 그리기(drawMap 이 부른다): 붙이기 → 크기 → 처음이면 색·높이(진행 호수) → 범위로 날기. 움직이지 않으면 바로, 움직이면 가라앉을 때(settle) 이름표를 놓는다 */
    function glDraw(force, narrow) {
      if (GL.mode === 'load') return;
      unitOf(); GL.narrow = narrow;
      stage.setAttribute('role', 'img'); stage.removeAttribute('aria-activedescendant'); glAria();
      if (!GL.map) { glMount(); return; }
      if (!GL.map.ready) return;
      const resized = GL.map.setSize(), first = !GL.drawn;
      GL.map.setScope(S.sido || null); glLayers();   // 보는 시도 밖 면 = 이웃 회색·너머 숨김 + 시도 경계선(솟은 면 필터보다 먼저)
      if (first) { GL.drawn = true; glColors(); GL.map.setValues(hOf, clsOf(), { duration: 0 }); }
      const moved = GL.map.flyTo(S.sido || null, { duration: first ? 0 : undefined });
      if (!moved && (first || force || resized)) glSettle();
      if (!root.classList.contains('ready')) { root.classList.add('ready'); win.OVERVIEW_READY = performance.now(); }
    }
    /* 가라앉음: 화면 라벨 점 목록(키보드 이동 Map3D.keyMove 가 SVG 판과 같은 길로 쓴다 — 지금 범위의 면만) → 키보드 위치 → 이름표·면 효과 */
    function glSettle() {
      if (!glOn()) return;
      GL.G = { k: 1, F: GL.map.faces().filter((f) => ux.has(f.key) && (!S.sido || ux.get(f.key).s === S.sido)).map((f) => ({ x: ux.get(f.key), bx: f.x, by: f.y })) };
      if (!S.at || !GL.G.F.some((f) => f.x.key === S.at)) S.at = (GL.G.F.slice().sort((a, b) => hOf[b.x.key] - hOf[a.x.key])[0] || { x: {} }).x.key || null;
      glAria(); placeLabels(); paintFaces();
    }
    /* 면 누름(캔버스): 수도권 보기·다른 시도 면 → 그 시도로 확대, 지금 시도 면 → 상세(구가 있는 시는 구 메뉴) */
    function glPick(code, e) {
      const u = byCode.get(code); if (!u) return;
      hideTip();
      if (u.s !== S.sido) { setSido(u.s, true); return; }
      S.at = code; choose(code, null, e && e.originalEvent ? ptOf(e.originalEvent) : null);
    }
    /* 색 다시 칠하기(지표 — 지연 빨강 html[data-ov-metric] · 테마): 토큰을 지도 칸에서 다시 읽어 바뀌었을 때만 paint 를 바꾼다 */
    function glColors() {
      if (!GL.map) return;
      const c = win.MapGL.readColors(GL.map.el), k = JSON.stringify(c);
      if (k !== GL.cols) { GL.cols = k; GL.map.setColors(c); }
    }
    if (GL.mode === 'load') (win.MapGL ? Promise.resolve() : script(root.dataset.gl))
      .then(() => { if (!win.MapGL || !win.MapGL.supported(doc)) throw new Error('webgl'); return win.MapGL.load(root.dataset.maplibre || MAPLIBRE, doc); })
      .then(() => { if (GL.mode === 'load') { GL.mode = 'gl'; drawMap(true); } }, () => glFallback());

    function drawMap(force) {
      /* 좁은 화면: 무대 위쪽 = 범례 띠 아래(범례 높이는 지표와 상관없이 같게 둔다 — app.css) */
      stage.style.top = sheet() ? `${legendBox.offsetTop + legendBox.offsetHeight + 8}px` : '';
      const W = Math.floor(stage.clientWidth), H = Math.floor(stage.clientHeight); if (W < 60 || H < 60) return;
      const narrow = win.matchMedia('(max-width: 599px)').matches, wide = !sheet(), key = [S.sido, W, H, narrow, wide].join();
      if (GL.mode !== 'svg') { glDraw(force, narrow); return; }   // 진짜 3D(불러오는 중이면 비워 둔다) — SVG 판은 그리지 않는다
      if (!force && G && key === drawn) return;
      drawn = key; unitOf();
      const sc = svgScopeOf(units, S.sido);
      /* 범례는 패널 안이라 판은 무대 왼쪽 끝부터 놓는다(섬 삽입 지도 없음 — 진짜 3D 와 같은 본토 판) */
      const g = M3.geom(base, { ...sc, ...(S.sido ? {} : nationOpt(nat)), W, H, narrow, uOf: hOf, left: 0 });
      G = M3.draw(svg, g, { units: [...ux.values()], nameOf: (c) => (byCode.get(c) || {}).name || '', hFloor: !S.sido || S.sido === '11' ? 6 : 8, aria: ariaOf, ...(S.sido ? { scope: S.sido, hide: hideOf(S.sido) } : {}) });   // 시도 보기: 밖 면 회색·평평(.out) · 이웃 너머 숨김(.hid) · 시도 경계선
      stage.setAttribute('role', 'listbox'); stage.setAttribute('aria-label', S.sido ? `${SIDO_SHORT[S.sido]} 시군구 지도. 화살표로 옮기고 Enter 로 상세 지도를 엽니다` : '수도권 시군구 지도. 화살표로 옮기고 Enter 로 그 시도를 확대합니다');
      if (!S.at || !G.F.some((f) => f.x.key === S.at)) S.at = (inScope().filter((x) => G.F.some((f) => f.x.key === x.key)).sort((a, b) => hOf[b.key] - hOf[a.key])[0] || {}).key || null;
      placeLabels(); paintFaces();
      if (!root.classList.contains('ready')) { root.classList.add('ready'); win.OVERVIEW_READY = performance.now(); }
    }
    /* 지표를 바꿀 때: 색 단계·면 이름만 다시 칠하고 이름표를 다시 놓는다(기하는 그대로, G16) */
    function paint() {
      if (glOn()) { unitOf(); glColors(); GL.map.setClasses(clsOf()); placeLabels(); paintFaces(); return; }   // 진짜 3D: 색 단계·색만(높이·필터·source 그대로)
      if (!G) return;
      unitOf(); M3.recolor(svg, G); placeLabels(); paintFaces();
    }
    /* 이름표: /citizen 과 같은 규칙(이름 / 숫자 두 줄, 짧은 이름, 값 큰 순 그리디 — 시도 판은 상위 5 반드시, 겹치면 숨김). 숫자는 지금 지표 값('1.6만'), 단위는 범례 */
    function placeLabels() {
      if (glOn()) { if (GL.G) GL.map.labels(svg.querySelector('.lbls'), inScope(), { strict: !S.sido, narrow: GL.narrow }); return; }   // 같은 규칙(모듈 placeLabels)
      if (G) M3.labels(svg.querySelector('.lbls'), G, inScope(), { strict: !S.sido });   // 수도권 전체는 서울 구가 작게 몰려 상위라도 겹치면 숨긴다(순위 목록·마우스 올림이 받는다)
    }
    /* 면 효과: 구 메뉴가 열린 시(pick)·여는 중인 곳 = 고른 곳, 마우스·순위 줄 = 가리킨 곳, 지도 초점 = 키보드 위치 */
    function paintFaces() {
      if (glOn()) { GL.map.select(S.pick); GL.map.hover(S.hover || (doc.activeElement === stage ? S.at : null)); }   // feature-state 만(고른 곳 5px · 가리킴·키보드 2px)
      else if (!G) return;
      else { M3.paintFaces(svg, { sel: S.pick, hover: S.hover, kb: doc.activeElement === stage ? S.at : null }); if (S.at) stage.setAttribute('aria-activedescendant', `f-${S.at}`); }
      for (const L of LISTS) L.querySelectorAll('button[data-c]').forEach((b) => b.classList.toggle('hl', b.dataset.c === S.hover));
    }
    function hover(code) {
      if ((S.hover || null) === (code || null)) return;
      S.hover = code || null; paintFaces();
    }

    /* 마우스 올림 */
    const tip = $('ovTip');
    function showTip(u, pt) {
      const m = ms().find((x) => x.id === S.metric), v = u.v, pub = isPub();
      tip.innerHTML = `<b>${esc(`${SIDO_SHORT[u.s]} ${u.name}`)}</b>`
        + (D.ok && v ? `<span class="ov-tv">${esc(m.name)} <strong>${fmt(valOf(v, S.metric))}${m.unit}</strong></span>`
          + `<span class="ov-ts">${pub ? `사업 ${fmt(v.n)}곳` : `진행 ${fmt(v.n)}건 · 진행 호수 ${fmt(v.u)}호${v.q ? ` · 호수 미확인 ${fmt(v.q)}건` : ''}`}</span>${bandHtml(v.st)}`
          + `<span class="ov-ts">${pub ? '' : `지연 ${fmt(v.d)}건 · `}${pub ? '1년 안' : '12개월'} 준공 ${fmt(v.a)}호(${fmt(v.an)}건) · 입주 ${fmt(v.mi || 0)}호(${fmt(v.mn || 0)}건)</span>` : '<span class="ov-ts">수치 없음</span>')
        + `<span class="ov-th">${!S.sido || u.s !== S.sido ? `누르면 ${SIDO_SHORT[u.s]} 지도로` : u.gu && u.gu.length ? '누르면 구를 고릅니다' : '누르면 상세 지도로'}</span>`;
      tip.hidden = false;
      const W = $('ovMap').clientWidth, H = $('ovMap').clientHeight, w = tip.offsetWidth, h = tip.offsetHeight;
      const x = pt.x + 16 + w > W ? pt.x - 16 - w : pt.x + 16, y = Math.min(Math.max(8, pt.y - h / 2), H - h - 8);
      tip.style.transform = `translate(${Math.round(Math.max(8, x))}px,${Math.round(y)}px)`;
    }
    const hideTip = () => { tip.hidden = true; };

    /* 고르기 → 구 메뉴 또는 확대 후 이동 */
    const menu = $('ovMenu');
    /* 구 선택 단계임을 지도에서도 보이게(2026-10-17 사용자 요청 "세부 선택이 필요하면 분간되게"): 고른 시는 면 효과(솟지 않음)·나머지 면 흐림·라벨 흐림(app.css .ov.picking), 위 상태 띠에 '구를 골라 주세요' */
    function pickOn(u) {
      root.classList.add('picking'); S.pick = u.code; paintFaces();
      const st = $('ovGoing'); st.textContent = `${SIDO_SHORT[u.s]} ${u.name} · 구를 골라 주세요`; st.hidden = false;
    }
    function pickOff() {
      root.classList.remove('picking'); if (!S.going) { S.pick = null; paintFaces(); }
      if (!S.going) $('ovGoing').hidden = true;
    }
    function closeMenu(refocus) {
      if (!S.menu) return;
      const back = S.menu.opener;
      menu.hidden = true; menu.innerHTML = ''; S.menu = null;
      pickOff();
      if (refocus && back && back.focus) back.focus();
    }
    function choose(code, opener, at) {
      const u = byCode.get(code);
      if (!u || S.going) return;
      const p = pickOf(u);
      if (p.href) return go(u, withMetric(p.href, S.metric), `${SIDO_SHORT[u.s]} ${u.name}`);
      closeMenu(false);
      const m = ms().find((x) => x.id === S.metric);
      /* 메뉴는 마우스 올림 설명과 구분되는 '선택 단계'로: 굵은 제목 + 한 줄 안내 + 닫기, 줄마다 › (목록 줄과 같은 문법) */
      menu.innerHTML = `<div class="ov-mt"><p class="ov-mh" id="ovMenuH" title="상세 지도는 구 단위로 열립니다">${esc(u.name)} · 구를 골라 주세요</p><button type="button" class="ov-mx" data-close="1" aria-label="닫기">✕</button></div><ul>${p.menu.map((g) => `<li><button type="button" data-href="${esc(g.href)}" data-n="${esc(g.name)}"><span>${esc(g.code === u.code ? '구 미정' : g.name.replace(`${u.name} `, ''))}</span><span class="ov-mv">${D.ok && g.v ? `${fmt(valOf(g.v, S.metric))}<small>${m.unit}</small>` : ''}${ICON_MORE}</span></button></li>`).join('')}</ul>`;
      menu.setAttribute('aria-labelledby', 'ovMenuH');
      menu.hidden = false;
      S.menu = { u, opener: opener || null };
      pickOn(u);
      /* 자리: 목록에서 열면 그 줄 옆, 지도에서 열면 누른 곳 */
      const vw = win.innerWidth, vh = win.innerHeight, w = menu.offsetWidth, h = menu.offsetHeight;
      let x, y;
      if (opener && opener.getBoundingClientRect) { const r = opener.getBoundingClientRect(); x = r.right + 8; y = r.top; if (x + w > vw - 8) { x = Math.max(8, r.right - w); y = r.bottom + 4; } }
      else { const r = $('ovMap').getBoundingClientRect(); x = r.left + (at ? at.x : r.width / 2) + 10; y = r.top + (at ? at.y : r.height / 2) - 12; }
      x = Math.min(Math.max(8, x), vw - w - 8); y = Math.min(Math.max(8, y), vh - h - 8);
      menu.style.left = `${Math.round(x)}px`; menu.style.top = `${Math.round(y)}px`;
      const first = menu.querySelector('button[data-href]');
      if (first) first.focus();
    }
    menu.addEventListener('click', (e) => {
      if (e.target.closest('button[data-close]')) { closeMenu(true); return; }
      const b = e.target.closest('button[data-href]'); if (b && S.menu) go(S.menu.u, withMetric(b.dataset.href, S.metric), `${SIDO_SHORT[S.menu.u.s]} ${b.dataset.n}`);
    });
    menu.addEventListener('keydown', (e) => {
      const bs = [...menu.querySelectorAll('button[data-href]')], i = bs.indexOf(doc.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); return; }
      const k = e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey) ? 1 : e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey) ? -1 : 0;
      if (!k || !bs.length) return;
      e.preventDefault();
      bs[(i + k + bs.length) % bs.length].focus();
    });
    doc.addEventListener('pointerdown', (e) => { if (S.menu && !menu.contains(e.target) && !(S.menu.opener && S.menu.opener.contains(e.target))) closeMenu(false); });

    function go(u, href, label) {
      if (S.going) return;
      S.going = true; closeMenu(false); hideTip();
      S.pick = u.code; paintFaces();   // 여는 곳은 고른 곳 면 효과
      const st = $('ovGoing');
      st.textContent = `${label} 상세 지도를 여는 중`; st.hidden = false;
      root.setAttribute('aria-busy', 'true');
      win.setTimeout(() => win.location.assign(href), 40);
    }
    /* 뒤로 가기로 bfcache 에서 되살아나면 '여는 중' 잠금·띠·고른 곳 효과를 풀어 다른 시군구를 다시 고를 수 있게 한다 */
    win.addEventListener('pageshow', (e) => {
      if (!e.persisted || !S.going) return;
      S.going = false; $('ovGoing').hidden = true; root.removeAttribute('aria-busy');
      S.pick = null; paintFaces();
    });

    renderPanel();
    if (S.sido && win.history && win.history.replaceState) win.history.replaceState(null, '', keepWin(sidoHref(S.sido), win.location.search));
    /* ?pick=<구가 있는 시>: 상세 지도 ?sgg=<시> 로 연 것을 지도 첫 스크립트가 넘겨 왔다(MAP_MODE_INIT) — 그 시의 구 메뉴를 열고 첫 구에 초점.
       목록 줄이 보이면 그 줄 옆, 값 없음 묶음에 접혀 있으면 지도 가운데. 주소의 pick 은 위 replaceState 가 지웠다 */
    const pick = byCode.get(pickOfSearch);
    if (pick && pick.gu && pick.gu.length) choose(pick.code, rankBtns($('ovRank')).find((b) => b.dataset.c === pick.code) || null);

    /* 지도 그리기와 사건: 면 가리킴(마우스 올림 설명)·누름 → 상세(구가 있는 시는 구 메뉴), 순위 줄 가리킴·초점 ↔ 면 효과, 지도 키보드(Map3D.keyMove) */
    const ptOf = (e) => { const r = $('ovMap').getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const faceOf = (t) => { const el = t && t.closest && t.closest('.map [data-area]'); return el && byCode.get(el.dataset.area) && G && G.F.some((f) => f.x.key === el.dataset.area) ? byCode.get(el.dataset.area) : null; };
    /* 보는 시도 밖 회색 면은 가리킴·설명 없음(진짜 3D 와 같다) */
    svg.addEventListener('mousemove', (e) => { const u = faceOf(e.target); if (!u || (S.sido && u.s !== S.sido)) { hover(null); hideTip(); return; } hover(u.code); if (!S.menu) showTip(u, ptOf(e)); });
    svg.addEventListener('mouseleave', () => { hover(null); hideTip(); });
    /* 수도권 보기·보는 시도 밖 회색 면을 누르면 그 시도로 확대(시군구 상세는 시도 보기·순위 목록에서). 맥락 면(수도권 밖)은 data-area 가 없어 고르지 않는다 */
    svg.addEventListener('click', (e) => { const u = faceOf(e.target); if (u) { hideTip(); if (u.s !== S.sido) { setSido(u.s, true); return; } S.at = u.code; choose(u.code, null, ptOf(e)); } });
    for (const L of LISTS) {
      L.addEventListener('mouseover', (e) => { const b = e.target.closest('button[data-c]'); if (b) hover(b.dataset.c); });
      L.addEventListener('mouseout', (e) => { if (!(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.ov-rank button[data-c]'))) hover(doc.activeElement && doc.activeElement.dataset ? doc.activeElement.dataset.c : null); });
      L.addEventListener('focusin', (e) => { const b = e.target.closest('button[data-c]'); hover(b ? b.dataset.c : null); });
      L.addEventListener('focusout', () => hover(null));
    }
    stage.addEventListener('focus', () => { hover(S.at); paintFaces(); });
    stage.addEventListener('blur', () => { hover(null); paintFaces(); });
    stage.addEventListener('keydown', (e) => {
      const KG = glOn() ? GL.G : G && S.sido ? { ...G, F: G.F.filter((f) => f.x.s === S.sido) } : G;   // 진짜 3D 도 화면 라벨 점 목록으로 같은 키보드 이동 · 시도 보기는 그 시도 면만(회색·숨긴 면 제외)
      if (!KG || e.altKey || e.ctrlKey || e.metaKey) return;
      const r = M3.keyMove(KG, S.at, e.key); if (!r) return;
      e.preventDefault();
      if (r.enter && !S.sido) { const u = byCode.get(r.key); if (u) setSido(u.s, true); return; }   // 수도권 보기: Enter 는 그 시도로 확대
      if (r.enter) { const f = KG.F.find((q) => q.x.key === r.key), sb = stage.getBoundingClientRect(), mb = $('ovMap').getBoundingClientRect(); choose(r.key, null, f ? { x: sb.left - mb.left + f.bx, y: sb.top - mb.top + f.by } : null); return; }
      S.at = r.key; hover(r.key); paintFaces(); if (glOn()) glAria();
    });
    drawMap(true);
    let rq = 0; const redraw = () => { win.cancelAnimationFrame(rq); rq = win.requestAnimationFrame(() => drawMap(false)); };
    if (win.ResizeObserver) new win.ResizeObserver(redraw).observe(stage); else win.addEventListener('resize', redraw);
    /* 순위 막대 목록 줄 수는 목록 칸 높이가 바뀔 때마다(창 크기·시트 펴기·지표 문구 높이) 다시 잰다 */
    if (win.ResizeObserver) new win.ResizeObserver(() => fitRanks()).observe($('ovRank')); else win.addEventListener('resize', fitRanks);
    /* 웹 글꼴이 늦게 오면 이름표 폭이 달라지므로 다시 놓는다 */
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(() => placeLabels());
    /* 관점 스위치로 html[data-aud] 가 바뀌면 탭·문구를 새 관점으로 다시 그린다(일반사용자에게 지연은 없다) */
    if (win.MutationObserver) new win.MutationObserver(() => { if (isPub() && S.metric === 'd') S.metric = 'u'; buildTabs(); renderPanel(); paint(); }).observe(doc.documentElement, { attributes: true, attributeFilter: ['data-aud'] });
    /* 테마 전환(html.dark): 진짜 3D 는 토큰을 다시 읽어 칠한다(SVG 판은 CSS 변수라 그대로) */
    if (win.MutationObserver) new win.MutationObserver(() => { if (glOn()) glColors(); }).observe(doc.documentElement, { attributes: true, attributeFilter: ['class'] });
    if (/[?&]selftest=/.test(win.location.search)) win.__ov = { G: () => G, gl: () => GL, base, state: S };   // 시험 전용(브라우저 점검)
    return { state: S, gl: GL };
  }

  /* 빈 상태 한 줄: 값 있는 곳이 3곳 미만일 때만. names 는 값 큰 순 '시도 이름' */
  function emptyNote(what, total, unit, names) {
    if (names.length >= 3) return '';
    return names.length ? `${what} ${fmt(total)}${unit} — ${names.join('·')}` : `${what} 0${unit} — 값이 있는 시군구가 없습니다`;
  }

  return { DETAIL_KEYS, ISLES, SIDO, MAPLIBRE, nationOpt, glCtxOf, glModeOf, rowsFit, barPct, metricOf, withMetric, rankMove, emptyNote, modeOf, sggHref, sidoHref, pathRings, ringsBox, labelPoint, inRing, scopeOf, svgScopeOf, seedOf, METRICS, metricsFor, titleOf, totalSubOf, valOf, defOf, breaksOf, classOf, legendOf, legendHtml, rankOf, pickOf, fmt, mount };
});
