/* 지도 첫 화면 '수도권 개요'(/map · /map?sido=11|28|41). 상세 지도(app.js·지역 자료·지형·3D 건물)를 부르지 않는 가벼운 모듈이다.
   자료는 지도 페이지가 서버에서 센 window.OVERVIEW(lib/board/metro-overview.ts — 사업 화면·지역 공급과 같은 계산)이고, 여기서는 그리기만 한다.
   - 면: 시군구 경로(region-map 투영 정수)를 경위도로 되돌려 MapLibre 채움 면으로 그린다(배경 지도 타일 없음).
   - 지표 3개(진행 사업 호수 · 지연 사업 · 앞으로 12개월 준공·입주)를 한 색상 명도 5단계(분위수 경계)로 칠하고, 0 은 중립 색.
   - 시군구를 누르면(또는 순위 목록에서 Enter) 그 시군구로 0.6초 확대한 뒤 상세 지도 /map?sgg=<코드> 로 넘어간다. 구가 있는 경기 시는 작은 메뉴로 구를 고른다.
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
  const sidoHref = (sido) => (sido ? `/map?sido=${sido}` : '/map');

  /* ---------- 경계: region-map 경로 → 경위도 ---------- */
  /* region-map/1 투영(tools/ledger/region-supply.js): x = (경도−124.5)·cos37.5°·1000, y = (38.4−위도)·1000 */
  const KX = Math.cos((37.5 * Math.PI) / 180) * 1000;
  const unproject = (x, y) => [Math.round((x / KX + 124.5) * 1e5) / 1e5, Math.round((38.4 - y / 1000) * 1e5) / 1e5];
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
  /* 고리들 → 다각형들: 다른 고리 안에 든 고리는 그 고리의 구멍으로(경로는 바깥·구멍을 구분하지 않고 이어 적는다) */
  function polygonsOf(rings) {
    const order = rings.map((r, i) => ({ r, i, a: ringArea(r) })).sort((p, q) => q.a - p.a), polys = [];
    for (const o of order) {
      const host = polys.find((p) => inRing(o.r[0], p[0]));
      if (host) host.push(o.r); else polys.push([o.r]);
    }
    return polys;
  }
  const closeLL = (r) => { const ll = r.map((p) => unproject(p[0], p[1])); ll.push(ll[0].slice()); return ll; };
  /* 개요 면 → GeoJSON(경도·위도). properties: code · s(시도) · name */
  function toGeoJSON(units) {
    return {
      type: 'FeatureCollection',
      features: (units || []).map((u, id) => {
        const polys = polygonsOf(pathRings(u.d)).map((p) => p.map(closeLL));
        return { type: 'Feature', id, properties: { code: u.code, s: u.s, name: u.name }, geometry: polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys } };
      }),
    };
  }
  /* 투영 상자 [x, y, 너비, 높이] → 경위도 [[서, 남], [동, 북]] */
  const boxLL = (b) => { const a = unproject(b[0], b[1] + b[3]), c = unproject(b[0] + b[2], b[1]); return [a, c]; };
  function ringsBox(rings) {
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const r of rings) for (const [x, y] of r) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); }
    return [b[0], b[1], b[2] - b[0], b[3] - b[1]];
  }
  /* 라벨 자리: 가장 큰 고리 안에서 변과 가장 먼 격자점(오목한 시군구도 면 안에 든다) */
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

  /* ---------- 지표·색 단계 ---------- */
  const METRICS = [
    { id: 'u', name: '진행 사업 호수', short: '진행 호수', unit: '호' },
    { id: 'd', name: '지연 사업', short: '지연', unit: '건' },
    { id: 'a', name: '앞으로 12개월 준공·입주', short: '12개월 준공·입주', unit: '호' },
  ];
  const valOf = (v, m) => (v ? v[m] || 0 : 0);
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const ymDot = (ym) => (ym ? `${ym.slice(0, 4)}.${ym.slice(5, 7)}` : '');
  const dayDot = (d) => (d ? d.slice(0, 10).replace(/-/g, '.') : '');
  function defOf(metric, doc) {
    const m = doc && doc.months;
    if (metric === 'u') return '계획부터 모집까지(①~④) 진행 중인 사업의 계획 호수를 더한 값입니다. 호수가 아직 정해지지 않은 사업은 따로 건수로 셉니다. 사업 화면과 같은 기준입니다.';
    if (metric === 'd') return '예정일을 6개월 넘게 넘긴 사업 수입니다. 12개월 넘게 넘긴 장기 지연도 넣습니다. 사업 화면의 지연(장기 포함)과 같습니다.';
    return `${m ? `${ymDot(m[0])}~${ymDot(m[1])}` : '앞으로 12개월'}에 공사를 마치거나 입주할 예정인 사업의 호수입니다. 한 사업이 준공과 입주를 모두 앞두면 두 번 셉니다. 지역 공급 화면은 모집 예정까지 함께 셉니다.`;
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
  /* 순위: 값 큰 순, 같으면 시도·코드 순 */
  function rankOf(units, metric, sido) {
    return (units || []).filter((u) => !sido || u.s === sido).slice().sort((a, b) => valOf(b.v, metric) - valOf(a.v, metric) || a.code.localeCompare(b.code));
  }
  /* 면을 눌렀을 때: 구가 있으면 메뉴(구 → 주소), 없으면 바로 주소 */
  function pickOf(unit) {
    if (unit.gu && unit.gu.length) return { menu: unit.gu.map((g) => ({ code: g.code, name: g.name, v: g.v, href: sggHref(g.code) })) };
    return { href: sggHref(unit.code) };
  }

  /* 라벨 둘레 여백 [가로, 세로](화소, 한쪽). 이웃 라벨과 가로 16px·세로 10px 이상 떨어져 서로 다른 라벨로 읽힌다(글자 테두리 그림자 2px 포함) */
  const LABEL_PAD = [8, 5];
  /* 라벨 놓기(순수): items = [{ x, y, w, h }](중심·크기, 우선순위 순 — 값 큰 것부터), blocked = 미리 막힌 상자 [왼, 위, 오른, 아래].
     앞 라벨부터 여백을 둔 상자가 화면 밖이거나 이미 놓은 상자와 닿으면 숨긴다 → 놓은 상자끼리는 가로 2·px, 세로 2·py 이상 떨어진다. 돌려주는 값: 보이는지 배열 */
  function pickLabels(items, W, H, blocked, pad) {
    const [px, py] = pad || LABEL_PAD, placed = (blocked || []).slice();
    return items.map((it) => {
      const b = [it.x - it.w / 2 - px, it.y - it.h / 2 - py, it.x + it.w / 2 + px, it.y + it.h / 2 + py];
      if (b[0] < 0 || b[1] < 0 || b[2] > W || b[3] > H || placed.some((q) => b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1])) return false;
      placed.push(b);
      return true;
    });
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
  function mount(win, doc, libReady) {
    const D = win.OVERVIEW, root = doc.getElementById('ov');
    if (!root || !D) return null;
    const $ = (id) => doc.getElementById(id);
    const reduce = !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const units = D.units || [], byCode = new Map(units.map((u) => [u.code, u]));
    const rings = new Map(units.map((u) => [u.code, pathRings(u.d)]));
    const S = { metric: 'u', sido: modeOf(win.location.search).sido, hover: null, menu: null, going: false };
    let map = null, labels = [], ups = [];

    /* 패널 */
    const panel = $('ovPanel');
    $('ovAsOf').textContent = D.referenceDate ? `${dayDot(D.referenceDate)} 기준` : '';
    const mbox = $('ovMetrics');
    mbox.innerHTML = METRICS.map((m) => `<button type="button" role="radio" data-m="${m.id}" aria-checked="${m.id === S.metric}" tabindex="${m.id === S.metric ? 0 : -1}">${esc(m.short)}</button>`).join('');
    mbox.addEventListener('click', (e) => { const b = e.target.closest('button[data-m]'); if (b) setMetric(b.dataset.m); });
    mbox.addEventListener('keydown', (e) => {
      const i = METRICS.findIndex((m) => m.id === S.metric), k = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!k) return;
      e.preventDefault();
      setMetric(METRICS[(i + k + METRICS.length) % METRICS.length].id);
      mbox.querySelector(`[data-m="${S.metric}"]`).focus();
    });
    const defBtn = $('ovDefBtn'), defP = $('ovDef');
    defBtn.innerHTML = ICON_I;
    defBtn.addEventListener('click', () => { const open = defBtn.getAttribute('aria-expanded') !== 'true'; defBtn.setAttribute('aria-expanded', String(open)); defP.hidden = !open; });
    $('ovCards').addEventListener('click', (e) => { const b = e.target.closest('button[data-s]'); if (b) setSido(S.sido === b.dataset.s ? '' : b.dataset.s, true); });
    $('ovRank').addEventListener('click', (e) => {
      const z = e.target.closest('.ov-zbtn');
      if (z) { const on = z.getAttribute('aria-expanded') !== 'true'; z.setAttribute('aria-expanded', String(on)); z.querySelector('.ov-zc').textContent = on ? '▴' : '▾'; $('ovZeroList').hidden = !on; return; }
      const b = e.target.closest('button[data-c]'); if (b) choose(b.dataset.c, b); });
    if (!D.ok) { $('ovFail').hidden = false; }
    const handle = $('ovHandle');
    if (handle) handle.addEventListener('click', () => { const full = panel.dataset.sheet !== 'full'; panel.dataset.sheet = full ? 'full' : 'peek'; handle.setAttribute('aria-expanded', String(full)); handle.setAttribute('aria-label', full ? '개요 패널 접기' : '개요 패널 펼치기'); placeLabels(false); });
    panel.addEventListener('transitionend', () => placeLabels(false));   // 아래 시트를 펴고 접으면 라벨이 피할 자리가 바뀐다

    function renderPanel() {
      const m = METRICS.find((x) => x.id === S.metric);
      const vals = units.map((u) => valOf(u.v, S.metric));
      ups = breaksOf(vals);
      mbox.querySelectorAll('button[data-m]').forEach((b) => { const on = b.dataset.m === S.metric; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
      const scope = S.sido ? (D.sido || []).find((s) => s.code === S.sido) : null, v = scope ? scope.v : D.total;
      $('ovTotalQ').textContent = `${scope ? scope.name : '수도권'} ${m.name}`;
      defBtn.title = defOf(S.metric, D); defBtn.setAttribute('aria-label', `${m.name} 정의 보기`); defP.textContent = defOf(S.metric, D);
      $('ovTotal').innerHTML = D.ok && v ? `<b class="ov-big">${fmt(valOf(v, S.metric))}</b><span class="ov-unit">${m.unit}</span>` : '<b class="ov-big none">—</b>';
      $('ovTotalSub').textContent = !D.ok || !v ? '' : S.metric === 'u' ? `진행 ${fmt(v.n)}건${v.q ? ` · 호수 미확인 ${fmt(v.q)}건` : ''}` : S.metric === 'd' ? `전체 사업 ${fmt(v.st.reduce((a, b) => a + b, 0))}건 중` : `예정 ${fmt(v.an)}건`;
      $('ovCards').innerHTML = (D.sido || []).map((s) => `<button type="button" class="ov-card" data-s="${s.code}" aria-pressed="${S.sido === s.code}" title="${esc(`${s.name}로 맞춥니다. 다시 누르면 수도권 전체`)}">`
        + `<span class="ov-cn">${esc(s.name)}</span><span class="ov-cv">${D.ok && s.v ? `${fmt(valOf(s.v, S.metric))}<small>${m.unit}</small>` : '—'}</span>${D.ok && s.v ? bandHtml(s.v.st) : ''}</button>`).join('');
      const list = rankOf(units, S.metric, S.sido);
      $('ovRankH').textContent = `${S.sido ? SIDO_SHORT[S.sido] : '수도권'} 시군구 ${list.length}곳`;
      const rankRow = (u, i, zero) => {
        const x = valOf(u.v, S.metric), more = u.gu && u.gu.length;
        return `<li><button type="button" data-c="${u.code}"${more ? ' aria-haspopup="dialog"' : ''} class="${x ? '' : 'zero'}" title="${esc(more ? `${u.name}: 구를 골라 상세 지도로` : `${u.name} 상세 지도로`)}">`
          + `<span class="ov-rn">${D.ok && !zero ? i + 1 : ''}</span><span class="ov-rname">${S.sido ? '' : `<small>${SIDO_SHORT[u.s]}</small>`}${esc(u.name)}</span>`
          + `<span class="ov-rv">${D.ok ? `${fmt(x)}<small>${m.unit}</small>` : ''}</span><span class="ov-rgo">${more ? ICON_MORE : ''}</span></button></li>`;
      };
      /* 값이 0인 시군구는 순위를 매기지 않고 목록 끝 '값 없음 n곳' 묶음으로 접는다(누르거나 Enter·Space 로 펼친다) */
      const hit = D.ok ? list.filter((u) => valOf(u.v, S.metric) > 0) : list, none = D.ok ? list.filter((u) => !(valOf(u.v, S.metric) > 0)) : [];
      const open = $('ovRank').querySelector('.ov-zeros > button[aria-expanded="true"]') !== null;
      $('ovRank').innerHTML = hit.map((u, i) => rankRow(u, i, false)).join('')
        + (none.length ? `<li class="ov-zeros"><button type="button" class="ov-zbtn" aria-expanded="${open}" aria-controls="ovZeroList"><span>값 없음 ${none.length}곳</span><span class="ov-zc" aria-hidden="true">${open ? '▴' : '▾'}</span></button><ol id="ovZeroList" class="ov-zlist"${open ? '' : ' hidden'}>${none.map((u) => rankRow(u, 0, true)).join('')}</ol></li>` : '');
      /* 범례 */
      $('ovLegendT').textContent = `${m.name}(${m.unit})`;
      $('ovLegend').innerHTML = D.ok ? legendOf(ups, '').map((x) => `<li><i class="ov-sw c${x.c}"></i>${esc(x.text)}</li>`).join('') : '';
    }

    function setMetric(id) {
      if (!METRICS.some((m) => m.id === id) || id === S.metric) return;
      S.metric = id; renderPanel(); paint();
    }
    function setSido(sido, push) {
      S.sido = sido;
      if (push && win.history && win.history.replaceState) win.history.replaceState(null, '', sidoHref(sido));
      renderPanel(); paint();
      if (map) map.fitBounds(viewBounds(sido), { padding: pad(), duration: reduce ? 0 : 500 });
    }

    /* 지도 */
    const VIEW = D.view || {};
    function viewBounds(sido) {
      const bs = (sido ? [sido] : SIDO).map((s) => VIEW[s]).filter(Boolean);
      const x0 = Math.min(...bs.map((b) => b[0])), y0 = Math.min(...bs.map((b) => b[1])), x1 = Math.max(...bs.map((b) => b[0] + b[2])), y1 = Math.max(...bs.map((b) => b[1] + b[3]));
      return boxLL([x0, y0, x1 - x0, y1 - y0]);
    }
    /* 좁은 화면은 아래 시트가 지도 아래쪽을 덮으므로 그만큼 비운다 */
    const pad = () => (win.innerWidth <= 768 ? { top: ($('ovLegend').parentNode.offsetHeight || 0) + 18, left: 12, right: 12, bottom: Math.min(panel.offsetHeight, $('ovMap').clientHeight * 0.6) + 12 } : 28);
    const css = (n) => (win.getComputedStyle(doc.documentElement).getPropertyValue(n) || '').trim();
    const fillExpr = () => ['match', ['get', 'c'], 1, css('--ov-1'), 2, css('--ov-2'), 3, css('--ov-3'), 4, css('--ov-4'), 5, css('--ov-5'), css('--ov-0')];
    const geo = toGeoJSON(units);
    function paint() {
      const vals = new Map(units.map((u) => [u.code, valOf(u.v, S.metric)]));
      for (const f of geo.features) { f.properties.c = D.ok ? classOf(vals.get(f.properties.code), ups) : 0; f.properties.dim = S.sido && f.properties.s !== S.sido ? 1 : 0; }
      if (map && map.getSource('ov')) map.getSource('ov').setData(geo);
      placeLabels(true);
    }
    function theme() {
      if (!map || !map.getLayer('ov-fill')) return;
      map.setPaintProperty('ov-bg', 'background-color', css('--ov-bg'));
      map.setPaintProperty('ov-fill', 'fill-color', fillExpr());
      map.setPaintProperty('ov-line', 'line-color', css('--ov-line'));
      map.setPaintProperty('ov-hover', 'line-color', css('--ov-hl'));
      placeLabels(true);
    }

    /* 라벨(DOM): 값이 있는 면만, 값 큰 것부터(MapLibre symbol-sort-key 와 같은 우선순위) 놓고, 앞서 놓은 라벨·범례·아래 시트와 여백(LABEL_PAD, text-padding 격) 안에서 닿으면 숨긴다.
       지도를 움직이거나 확대할 때마다 다시 놓아 확대하면 숨겼던 라벨이 나타난다. 서울 구는 넓게 볼 때 이름 없이 값만 */
    const lp = new Map(units.map((u) => { const p = labelPoint(rings.get(u.code)); return [u.code, p ? unproject(p[0], p[1]) : null]; }));
    const labelBox = $('ovLabels');
    /* 라벨이 피할 다른 요소(라벨 상자 좌표). 넓은 화면의 패널처럼 지도 밖이면 겹치지 않아 빠진다 */
    function obstacles() {
      const o = labelBox.getBoundingClientRect(), out = [];
      for (const el of [$('ovLegend').parentNode, panel]) {
        const r = el && el.getBoundingClientRect();
        if (r && r.width && r.right > o.left && r.left < o.right && r.bottom > o.top && r.top < o.bottom) out.push([r.left - o.left, r.top - o.top, r.right - o.left, r.bottom - o.top]);
      }
      return out;
    }
    function placeLabels(rebuild) {
      if (!map) return;
      const z = map.getZoom(), m = METRICS.find((x) => x.id === S.metric);
      if (rebuild) {
        labelBox.innerHTML = '';
        labels = rankOf(units, S.metric, S.sido).filter((u) => D.ok && valOf(u.v, S.metric) > 0 && lp.get(u.code)).map((u) => {
          const el = doc.createElement('span'), c = classOf(valOf(u.v, S.metric), ups);
          el.className = `ov-lb c${c}`;
          el.innerHTML = `<b>${esc(u.name)}</b><span>${fmt(valOf(u.v, S.metric))}${m.unit}</span>`;
          labelBox.appendChild(el);
          return { u, el, w: 0, h: 0, named: null };
        });
      }
      const items = labels.map((L) => {
        const named = !(L.u.s === '11' && z < 10.6);
        if (named !== L.named) { L.el.classList.toggle('bare', !named); L.named = named; L.w = 0; }
        if (!L.w) { L.el.style.display = ''; L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; }
        const p = map.project(lp.get(L.u.code));
        return { x: p.x, y: p.y, w: L.w, h: L.h };
      });
      const show = pickLabels(items, labelBox.clientWidth, labelBox.clientHeight, obstacles());
      labels.forEach((L, i) => {
        if (!show[i]) { L.el.style.display = 'none'; return; }
        L.el.style.display = '';
        L.el.style.transform = `translate(${Math.round(items[i].x - L.w / 2)}px,${Math.round(items[i].y - L.h / 2)}px)`;
      });
    }

    /* 마우스 올림 */
    const tip = $('ovTip');
    function showTip(u, pt) {
      const m = METRICS.find((x) => x.id === S.metric), v = u.v;
      tip.innerHTML = `<b>${esc(`${SIDO_SHORT[u.s]} ${u.name}`)}</b>`
        + (D.ok && v ? `<span class="ov-tv">${esc(m.name)} <strong>${fmt(valOf(v, S.metric))}${m.unit}</strong></span>`
          + `<span class="ov-ts">진행 ${fmt(v.n)}건 · 진행 호수 ${fmt(v.u)}호${v.q ? ` · 호수 미확인 ${fmt(v.q)}건` : ''}</span>${bandHtml(v.st)}`
          + `<span class="ov-ts">지연 ${fmt(v.d)}건 · 12개월 준공·입주 ${fmt(v.a)}호</span>` : '<span class="ov-ts">수치 없음</span>')
        + `<span class="ov-th">${u.gu && u.gu.length ? '누르면 구를 고릅니다' : '누르면 상세 지도로'}</span>`;
      tip.hidden = false;
      const W = $('ovMap').clientWidth, H = $('ovMap').clientHeight, w = tip.offsetWidth, h = tip.offsetHeight;
      const x = pt.x + 16 + w > W ? pt.x - 16 - w : pt.x + 16, y = Math.min(Math.max(8, pt.y - h / 2), H - h - 8);
      tip.style.transform = `translate(${Math.round(Math.max(8, x))}px,${Math.round(y)}px)`;
    }
    const hideTip = () => { tip.hidden = true; };

    /* 고르기 → 구 메뉴 또는 확대 후 이동 */
    const menu = $('ovMenu');
    function closeMenu(refocus) {
      if (!S.menu) return;
      const back = S.menu.opener;
      menu.hidden = true; menu.innerHTML = ''; S.menu = null;
      if (refocus && back && back.focus) back.focus();
    }
    function choose(code, opener, at) {
      const u = byCode.get(code);
      if (!u || S.going) return;
      const p = pickOf(u);
      if (p.href) return go(u, p.href, `${SIDO_SHORT[u.s]} ${u.name}`);
      closeMenu(false);
      const m = METRICS.find((x) => x.id === S.metric);
      menu.innerHTML = `<p class="ov-mh" id="ovMenuH">${esc(u.name)} · 구를 고르세요</p><ul>${p.menu.map((g) => `<li><button type="button" data-href="${esc(g.href)}" data-n="${esc(g.name)}"><span>${esc(g.code === u.code ? '구 미정' : g.name.replace(`${u.name} `, ''))}</span><span class="ov-mv">${D.ok && g.v ? `${fmt(valOf(g.v, S.metric))}<small>${m.unit}</small>` : ''}</span></button></li>`).join('')}</ul>`;
      menu.setAttribute('aria-labelledby', 'ovMenuH');
      menu.hidden = false;
      S.menu = { u, opener: opener || null };
      /* 자리: 목록에서 열면 그 줄 옆, 지도에서 열면 누른 곳 */
      const vw = win.innerWidth, vh = win.innerHeight, w = menu.offsetWidth, h = menu.offsetHeight;
      let x, y;
      if (opener && opener.getBoundingClientRect) { const r = opener.getBoundingClientRect(); x = r.right + 8; y = r.top; if (x + w > vw - 8) { x = Math.max(8, r.right - w); y = r.bottom + 4; } }
      else { const r = $('ovMap').getBoundingClientRect(); x = r.left + (at ? at.x : r.width / 2) + 10; y = r.top + (at ? at.y : r.height / 2) - 12; }
      x = Math.min(Math.max(8, x), vw - w - 8); y = Math.min(Math.max(8, y), vh - h - 8);
      menu.style.left = `${Math.round(x)}px`; menu.style.top = `${Math.round(y)}px`;
      const first = menu.querySelector('button');
      if (first) first.focus();
    }
    menu.addEventListener('click', (e) => { const b = e.target.closest('button[data-href]'); if (b && S.menu) go(S.menu.u, b.dataset.href, `${SIDO_SHORT[S.menu.u.s]} ${b.dataset.n}`); });
    menu.addEventListener('keydown', (e) => {
      const bs = [...menu.querySelectorAll('button')], i = bs.indexOf(doc.activeElement);
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
      const st = $('ovGoing');
      st.textContent = `${label} 상세 지도를 여는 중`; st.hidden = false;
      root.setAttribute('aria-busy', 'true');
      const dur = reduce || !map ? 0 : 600;
      if (map) map.fitBounds(boxLL(ringsBox(rings.get(u.code))), { padding: pad(), duration: dur, maxZoom: 12 });
      win.setTimeout(() => win.location.assign(href), dur + 40);
    }

    renderPanel();
    if (S.sido && win.history && win.history.replaceState) win.history.replaceState(null, '', sidoHref(S.sido));

    /* 지도는 라이브러리가 오면 붙인다(패널은 먼저 보인다) */
    Promise.resolve(libReady).then(() => {
      const ml = win.maplibregl;
      if (!ml) throw new Error('지도 라이브러리를 불러오지 못했습니다');
      const all = viewBounds(''), span = [all[1][0] - all[0][0], all[1][1] - all[0][1]];
      map = new ml.Map({
        container: 'ovMap', attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false, renderWorldCopies: false, minZoom: 6.5, maxZoom: 12,
        maxBounds: [[all[0][0] - span[0] * 1.5, all[0][1] - span[1] * 1.5], [all[1][0] + span[0] * 1.5, all[1][1] + span[1] * 1.5]],   // 좁은 화면에서도 아래 시트를 비운 시점이 잘리지 않게 넉넉히
        bounds: viewBounds(S.sido), fitBoundsOptions: { padding: pad() },
        style: { version: 8, sources: { ov: { type: 'geojson', data: geo } }, layers: [
          { id: 'ov-bg', type: 'background', paint: { 'background-color': css('--ov-bg') } },
          { id: 'ov-fill', type: 'fill', source: 'ov', paint: { 'fill-color': fillExpr(), 'fill-opacity': ['case', ['==', ['get', 'dim'], 1], 0.35, 1] } },
          { id: 'ov-line', type: 'line', source: 'ov', paint: { 'line-color': css('--ov-line'), 'line-width': 1 } },
          { id: 'ov-hover', type: 'line', source: 'ov', filter: ['==', ['get', 'code'], ''], paint: { 'line-color': css('--ov-hl'), 'line-width': 2.5 } },
        ] },
      });
      if (map.touchZoomRotate) map.touchZoomRotate.disableRotation();
      map.on('load', () => { paint(); root.classList.add('ready'); win.OVERVIEW_READY = performance.now(); });
      /* 웹 글꼴이 늦게 오면 라벨 폭이 달라지므로 다시 재고 놓는다 */
      if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(() => { for (const L of labels) L.w = 0; placeLabels(false); });
      map.on('move', () => placeLabels(false));
      map.on('resize', () => placeLabels(false));
      map.on('mousemove', 'ov-fill', (e) => {
        const f = e.features && e.features[0], u = f && byCode.get(f.properties.code);
        if (!u) return;
        map.getCanvas().style.cursor = 'pointer';
        if (S.hover !== u.code) { S.hover = u.code; map.setFilter('ov-hover', ['==', ['get', 'code'], u.code]); }
        showTip(u, e.point);
      });
      map.on('mouseleave', 'ov-fill', () => { S.hover = null; map.getCanvas().style.cursor = ''; map.setFilter('ov-hover', ['==', ['get', 'code'], '']); hideTip(); });
      map.on('click', 'ov-fill', (e) => { const f = e.features && e.features[0]; if (f) { hideTip(); choose(f.properties.code, null, e.point); } });
      new win.MutationObserver(theme).observe(doc.documentElement, { attributes: true, attributeFilter: ['class'] });
    }).catch((e) => { const f = $('ovFail'); f.hidden = false; f.textContent = `지도를 그리지 못했습니다: ${e.message}. 왼쪽 목록에서 시군구를 고를 수 있습니다.`; });
    return { state: S };
  }

  return { DETAIL_KEYS, LABEL_PAD, pickLabels, modeOf, sggHref, sidoHref, unproject, pathRings, polygonsOf, toGeoJSON, boxLL, ringsBox, labelPoint, inRing, METRICS, valOf, defOf, breaksOf, classOf, legendOf, rankOf, pickOf, fmt, mount };
});
