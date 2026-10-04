const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n).toLocaleString('ko-KR');
const pct = (n, d) => (d ? (100 * n / d).toFixed(0) : '0') + '%';
const maplibregl = window.maplibregl;
if (!maplibregl) {
  const f = $('#fatal'); f.hidden = false;
  f.textContent = '지도 라이브러리(MapLibre)를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침해 주세요.';
  throw new Error('maplibregl not loaded');
}
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const say = (m) => { $('#sr').textContent = m; };

/* ---------- 데이터 ---------- */
const GY = window.GY_BUILDINGS, PR = window.GY_PROJECTS;
const HAS_GY = !!(GY && GY.features && GY.features.length);
const HAS_PR = !!(PR && PR.blocks && PR.blocks.length);
const REG = window.REGION || {};                               // 지역 정보(어댑터가 채움): 이름·시작 위치·출처·단지 찾기
const DISTRICTS = HAS_PR ? (PR.districts && PR.districts.length ? PR.districts : (PR.district ? [PR.district] : [])) : [];   // 지구 경계(여러 개 가능)
const FACTOR = (HAS_GY && GY.meta.factor) || {};
function floorsToHeight(f) {
  const k = f <= 5 ? '공동주택_1-5' : f <= 10 ? '공동주택_6-10' : f <= 15 ? '공동주택_11-15' : f <= 20 ? '공동주택_16-20' : '공동주택_21+';
  return Math.round(f * (FACTOR[k] || 2.85) * 10) / 10;
}
const BLOCKS = HAS_PR ? PR.blocks.slice() : [];             // 순서는 어댑터가 정한다(region.projectOrder → 상태 → 세대수 → 이름)
const HAS_PRIV = BLOCKS.some((b) => b.priv);                  // 공공택지 위 민간 단지가 있는 지역인가
const KIND = { '분양중': 'sale', '건설 단계': 'build', '준공 임박': 'soon', '입주 단계': 'move', '계획': 'plan' };
const kindOf = (b) => (b.priv ? 'priv' : KIND[b.status]);    // 색·무늬를 정하는 종류. 민간 단지는 상태와 상관없이 회색(priv)
const STAGE = { '계획': 0, '분양중': 1, '건설 단계': 2, '준공 임박': 3, '입주 단계': 4 };
const STATUS_ORDER = ['분양중', '건설 단계', '준공 임박', '입주 단계', '계획'];
const unitsTxt = (b) => (b.unitsKnown === false ? '세대수 미확인' : `${fmt(b.units)}세대`);
const dongN = (b) => b.dongCount || (b.dongs ? b.dongs.length : 0);
/* 단지 이름(label)은 자료에서 오므로 따옴표·쉼표·꺾쇠가 있어도 속성과 선택자가 깨지지 않게 한다. */
const idsAttr = (ids) => esc(JSON.stringify(ids));                                       // data-ids 에는 JSON 배열을 넣는다
const idsOf = (el) => { try { const v = JSON.parse(el.dataset.ids); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
const byId = (scope, name, id) => scope.querySelector(`[${name}="${CSS.escape(String(id))}"]`);
// 색: 색각 이상에서도 구분되는 Okabe-Ito 계열. 면 무늬도 달리한다(분양중 단색 / 건설 해칭 / 준공 임박 점무늬 / 입주 단계 격자 / 계획 점선 / 공공택지 민간 회색 단색).
const COLOR = { sale: '#D55E00', build: '#0072B2', soon: '#009E73', move: '#CC79A7', plan: '#5C6068', priv: '#8A8680' };   // 패널(항상 밝은 바탕)용. 지도 위 색은 THEMES에서 가져온다
const COLOR_D = { sale: '#A84800', build: '#005C91', soon: '#00755A', move: '#A23B7C', plan: '#4A4E56', priv: '#5E5A54' };   // 글자·칩용(흰 바탕 대비 4.5:1 이상)
const STAGE_NAMES = ['계획', '분양', '건설', '입주'];
const pctTxt = (v) => (v >= 99.95 ? '100' : v >= 10 ? v.toFixed(1) : v.toFixed(2).replace(/0$/, '')) + '%';
function sparkline(h) {
  const W = 56, H = 18, n = h.length, mx = Math.max(...h.map((x) => x[1]), 1);
  const pts = h.map((x, i) => `${(i / (n - 1) * (W - 4) + 2).toFixed(1)},${(H - 2 - x[1] / mx * (H - 4)).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="#2B2E34" stroke-width="1.6"/><circle cx="${pts.split(' ').pop().split(',')[0]}" cy="${pts.split(' ').pop().split(',')[1]}" r="2.2" fill="#2B2E34"/></svg>`;
}
function progressRow(b, k) {
  const p = b.progress, color = COLOR[k];
  return `<span class="pg" style="--c:${color}" title="공사 공정율 ${p.rate}% (${p.asOf} 기준)"><span>공사</span><span class="bar2"><i style="width:${Math.max(p.rate, 0.8)}%"></i></span><b>${pctTxt(p.rate)}</b>${p.history.length >= 3 ? sparkline(p.history) : ''}</span>`;
}
const centroid = (poly) => [poly.reduce((a, p) => a + p[0], 0) / poly.length, poly.reduce((a, p) => a + p[1], 0) / poly.length];
const hex2 = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function mixTone(kind, t0, tone = TONE) { const t = 0.3 + 0.7 * t0; const [a, b] = tone[kind].map(hex2); return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
function floorsRange(b) { const fl = b.dongs ? b.dongs.map((d) => d.floors) : null; return fl ? [Math.min(...fl), Math.max(...fl)] : null; }

const ST = { n: 0, src: { '공식높이': 0, '층수환산': 0, '정보없음': 0 } };
if (HAS_GY) GY.features.forEach((f, i) => { f.properties.i = i; ST.n++; ST.src[f.properties.src]++; });

/* ---------- 지도 ---------- */
const KEY = String(window.VWORLD_KEY || '').trim();
let usingVworld = !!KEY;
const q = new URLSearchParams(location.search);
let theme = q.get('theme') === 'night' ? 'night' : 'day';
/* 낮/밤 색. 지도 위에 그리는 모든 색은 여기서만 정한다(스타일을 다시 불러와도 같은 값으로 다시 그려진다). */
const THEMES = {
  day:   { vw: String(window.VWORLD_LAYER || 'white'), ofm: 'positron', bg: '#F4F4F5', text: '#1B1D21', sub: '#4A4E56', halo: '#FFFFFF', sky: ['#DDE1E6', '#F4F4F5'],
           mask: ['#27304A', 0.12], shadow: ['#000000', 0.2], hillShadow: '#4B5058', hillHi: '#FFFFFF', hillAcc: '#8E9299', district: '#6B6F77', dong: '#2B2E34', other: ['#8E9299', '#7A7F87'],
           ramp: ['#E6E8EC', '#CFD2D8', '#B1B5BD', '#8F949E', '#6E747F'], flat: '#E9EBEE',
           color: { sale: '#D55E00', build: '#0072B2', soon: '#009E73', move: '#CC79A7', plan: '#5C6068', priv: '#8A8680' },
           tone: { sale: ['#F2A66B', '#A84800'], build: ['#8EC3E6', '#005C91'], soon: ['#7FD6B8', '#00755A'], move: ['#E8B4D0', '#A23B7C'], plan: ['#C4C7CD', '#5C6068'], priv: ['#C9C6C0', '#6E6A64'] } },
  night: { vw: 'midnight', ofm: 'dark', bg: '#0E1624', text: '#F2F4F8', sub: '#B9C0CE', halo: '#0E1624', sky: ['#1A2437', '#0E1624'],
           mask: ['#000000', 0.38], shadow: ['#000000', 0.45], hillShadow: '#05080F', hillHi: '#7C8AA6', hillAcc: '#2A3550', district: '#9AA6BD', dong: '#E6EAF2', other: ['#5A6683', '#8B97B3'],
           ramp: ['#2C3546', '#3A455A', '#4E5B75', '#6A7895', '#8D9BB8'], flat: '#232C3B',
           color: { sale: '#FF8A3D', build: '#47B0F7', soon: '#2FD6A2', move: '#E88DC0', plan: '#A8B0C0', priv: '#A39F97' },
           tone: { sale: ['#FFC694', '#E8661A'], build: ['#A5D8F9', '#2B8FD6'], soon: ['#92EDD0', '#18B98A'], move: ['#F3C3DD', '#CF5E9E'], plan: ['#C9CFDB', '#8A93A6'], priv: ['#C8C4BC', '#8E8A83'] } },
};
const TH = () => THEMES[theme];
const TONE = THEMES.day.tone;   // 패널 막대용(항상 밝은 바탕). 지도 위 동 색은 TH().tone
const wmts = (layer) => `https://api.vworld.kr/req/wmts/1.0.0/${KEY}/${layer}/{z}/{y}/{x}.png`;
const ofmUrl = () => `https://tiles.openfreemap.org/styles/${TH().ofm}`;
function baseStyle() {
  if (!KEY || !usingVworld) return ofmUrl();
  return { version: 8, glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: { vworld: { type: 'raster', tileSize: 256, maxzoom: 18, tiles: [wmts(TH().vw)], attribution: '배경 © 국토교통부 V-World · 지명 © OpenStreetMap contributors' } },
    layers: [{ id: 'bg', type: 'background', paint: { 'background-color': TH().bg } }, { id: 'vworld', type: 'raster', source: 'vworld' }] };
}
$('.mapwrap').dataset.theme = theme;
$('#baseNote').textContent = KEY ? '배경: V-World' : '배경: OpenFreeMap (V-World 키를 넣으면 V-World로 바뀝니다)';

const DEM_TILES = ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'];
const STATUS = { loaded: false, errors: [], officialData: HAS_GY, projects: HAS_PR, base: KEY ? 'vworld' : 'openfreemap' };   // 시험용 상태. ?selftest 일 때만 window에 공개한다
if (q.get('selftest')) window.__mapStatus = STATUS;
const START = { pitch: 52, bearing: 0, ...(REG.view || { center: [126.7585, 37.5515], zoom: 14.4 }) };   // 지역의 시작 위치
const map = new maplibregl.Map({
  container: 'map', style: baseStyle(), ...START, maxPitch: 80, minZoom: 11, attributionControl: { compact: true },
  canvasContextAttributes: { antialias: q.get('aa') !== '0' },   // 모서리 계단 방지(4배 다중 샘플). 저사양이면 주소에 ?aa=0
  localIdeographFontFamily: "'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR','Noto Sans CJK KR',sans-serif",
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');   // 나침반은 아래의 동서남북 HUD(#compass)가 대신한다
map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');
let popup = null, selId = null, selDong = null, vwFail = 0, DONG_FEATS = [];
const SHOWN = new Set(BLOCKS.map((b) => b.status));          // 지도에 보이는 상태
let viewMode = ['progress', 'time'].includes(q.get('mode')) ? q.get('mode') : 'floors';   // 층수 / 공정율 / 입주 시기
let privOn = q.get('priv') !== '0';                            // 공공택지 민간 단지: 기본 켬
let hudOn = q.get('hud') !== '0';                              // HUD(단지 표시선·정보창): 기본 켬
let ctxOn = q.get('ctx') !== '0';                              // 역·학교(OSM): 기본 켬
let ringOn = q.get('ring') === '1';                            // 역 반경 원(500 m·1 km): 기본 끔
let timeMo = 0;                                               // 입주 시기 보기의 기준 달(2026-10부터 센 달 수)
let dimExisting = false;                                      // 기존 건물을 흐리게
map.on('error', (e) => {
  STATUS.errors.push((e && e.error && e.error.message) || String(e));
  // V-World 타일이 거절되면(키 오류·등록하지 않은 주소 등) 한 번만 OpenFreeMap으로 바꾼다.
  // 확대한 깊은 단계(19 이상)에는 V-World 타일이 없어 오류가 나므로 무시하고, 낮은 단계 타일이 2번 이상 실패할 때만 바꾼다.
  const tz = e && e.tile && e.tile.tileID && e.tile.tileID.canonical ? e.tile.tileID.canonical.z : 0;
  if (usingVworld && e && e.sourceId === 'vworld' && tz <= 17 && ++vwFail >= 2) {
    usingVworld = false; STATUS.base = 'openfreemap(fallback)';
    $('#baseNote').textContent = 'V-World 배경지도를 불러오지 못해 OpenFreeMap으로 바꿨습니다. 키와 등록한 서비스 주소를 확인하세요.';
    map.setStyle(baseStyle(), { diff: false });
  }
});

const rgba = (h, a) => { const [r, g, b] = hex2(h); return `rgba(${r},${g},${b},${a})`; };
function patternImage(kind) {
  const s = 8, c = document.createElement('canvas'); c.width = c.height = s; const x = c.getContext('2d'), T = TH();
  if (kind === 'hatch') {            // 건설 단계: 사선
    const col = T.color.build;
    x.fillStyle = rgba(col, .12); x.fillRect(0, 0, s, s); x.strokeStyle = col; x.lineWidth = 2; x.beginPath();
    x.moveTo(-1, s + 1); x.lineTo(s + 1, -1); x.moveTo(-1, 1); x.lineTo(1, -1); x.moveTo(s - 1, s + 1); x.lineTo(s + 1, s - 1); x.stroke();
  } else if (kind === 'cross') {     // 입주 단계: 격자
    const col = T.color.move;
    x.fillStyle = rgba(col, .12); x.fillRect(0, 0, s, s); x.strokeStyle = col; x.lineWidth = 1.5; x.beginPath();
    x.moveTo(0, .75); x.lineTo(s, .75); x.moveTo(.75, 0); x.lineTo(.75, s); x.stroke();
  } else {                           // 준공 임박: 점
    const col = T.color.soon;
    x.fillStyle = rgba(col, .14); x.fillRect(0, 0, s, s); x.fillStyle = col; x.beginPath(); x.arc(4, 4, 1.7, 0, Math.PI * 2); x.fill();
  }
  return x.getImageData(0, 0, s, s);
}
function roundRectPath(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
/* 단지 배지: 늘어나는 알약 모양 그림(9-slice). 낮에는 어두운 상태색에 흰 글씨, 밤에는 밝은 상태색에 어두운 글씨. */
function badgeImage(kind) {
  const W = 48, H = 28, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), night = theme === 'night', plan = kind === 'plan';
  const col = night ? THEMES.night.color[kind] : COLOR_D[kind];
  roundRectPath(x, 3, 3, W - 6, H - 6, 9);
  x.lineWidth = 4; x.strokeStyle = night ? 'rgba(14,22,36,.92)' : 'rgba(255,255,255,.94)'; x.stroke();
  x.fillStyle = plan ? (night ? '#1B2233' : '#FFFFFF') : col; x.fill();
  if (plan) { roundRectPath(x, 3, 3, W - 6, H - 6, 9); x.lineWidth = 1.8; x.setLineDash([4, 3]); x.strokeStyle = night ? '#A8B0C0' : '#4A4E56'; x.stroke(); }
  return { data: x.getImageData(0, 0, W, H), opts: { pixelRatio: 2, stretchX: [[14, 34]], stretchY: [[11, 17]], content: [12, 8, 36, 20] } };
}
/* 2026-10을 0으로 센 달 수(소수는 그 달 안의 날짜). 입주 시기 보기와 다음 일정에서 쓴다. */
const MO_MAX = 38;
const monthF = (s) => { const m = /(\d{4})[.-](\d\d)(?:[.-](\d\d))?/.exec(s || ''); return m ? (+m[1] - 2026) * 12 + (+m[2] - 10) + (m[3] ? (+m[3] - 1) / 30 : 0) : null; };
const moLabel = (m) => `${2026 + Math.floor((m + 9) / 12)}.${String((m + 9) % 12 + 1).padStart(2, '0')}`;
function blockTimes(b) {
  const digit = /^\d/.test(b.moveIn), mv = monthF(b.moveIn);
  const t0 = b.progress ? monthF(b.progress.start) : null;
  // 입주 월이 있으면 공사 종료일은 공사현황의 종료일, 없으면(임대) 입주계획의 '준공 예정일'을 쓴다.
  const t1 = digit ? (b.progress ? monthF(b.progress.end) : mv) : mv;
  // 이미 입주했는데 날짜를 모르면(입주 단계) 처음부터 다 지어진 것으로 본다. 아니면 '공사 중'으로 잘못 세어진다.
  const unk = b.status === '입주 단계' && mv == null;
  const planned = b.status === '계획' && t0 == null && mv == null;   // 일정이 전혀 없는 계획 단지는 달력 끝까지 '착공 전'
  const d0 = unk ? -MO_MAX : planned ? MO_MAX + 1 : 0, d1 = unk ? -1 : planned ? MO_MAX + 2 : 12;
  return { t0: t0 ?? d0, t1: t1 ?? d1, mo: digit ? Math.floor(mv) : Math.floor(t1 ?? d1) };
}
const moveText = (b) => (/^\d/.test(b.moveIn) ? `입주 ${b.moveIn}` : String(b.moveIn));
function blockProps(b) {
  const p = b.progress ? pctTxt(b.progress.rate) : '-';
  return { id: b.id, status: b.status, kind: kindOf(b), priv: !!b.priv, units: b.units, short: b.id, l2: `${b.status} · ${unitsTxt(b)}`, l2p: `공정율 ${p}`, l2t: moveText(b),
    lc: `${b.id} · ${b.status}`, lcp: `${b.id} · 공정율 ${p}`, lct: `${b.id} · ${moveText(b)}` };
}
function blocksGeoJSON() {
  return { type: 'FeatureCollection', features: BLOCKS.map((b) => ({ type: 'Feature', properties: blockProps(b), geometry: { type: 'Polygon', coordinates: [[...b.poly, b.poly[0]]] } })) };
}
function districtLabelPoint(d) {   // 단지 라벨과 겹치지 않게 지구 남쪽 1/3 지점에 둔다
  const ps = d.poly, lons = ps.map((p) => p[0]), lats = ps.map((p) => p[1]);
  return [(Math.min(...lons) + Math.max(...lons)) / 2 + 0.002, Math.min(...lats) + (Math.max(...lats) - Math.min(...lats)) * 0.16];
}
function blockPointsGeoJSON() {
  return { type: 'FeatureCollection', features: BLOCKS.map((b) => ({ type: 'Feature', properties: blockProps(b), geometry: { type: 'Point', coordinates: centroid(b.poly) } })) };
}
function blockTopsGeoJSON() {   // 가까이 볼 때 배지를 단지 북쪽 끝에 얹어 건물을 덜 가리게 한다
  return { type: 'FeatureCollection', features: BLOCKS.map((b) => ({ type: 'Feature', properties: blockProps(b), geometry: { type: 'Point', coordinates: [centroid(b.poly)[0], Math.max(...b.poly.map((p) => p[1]))] } })) };
}
function ringArea(r) { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q2 = r[(i + 1) % r.length]; a += p[0] * q2[1] - q2[0] * p[1]; } return Math.abs(a) / 2; }
function dongsGeoJSON() {
  const feats = [], labels = [], tone = TH().tone;
  BLOCKS.forEach((b) => {
    if (!b.dongs) return; const kind = kindOf(b); const r = floorsRange(b), tm = blockTimes(b);
    b.dongs.forEach((d) => {
      const t = r && r[1] > r[0] ? (d.floors - r[0]) / (r[1] - r[0]) : 1;
      const color = mixTone(kind, t, tone);
      d.poly.forEach((ring) => feats.push({ type: 'Feature', properties: { key: `${b.id}-${d.no}`, block: b.id, no: d.no, floors: d.floors, h: d.h != null ? d.h : floorsToHeight(d.floors), hEst: d.h != null ? 0 : 1, tier: d.tier, color, status: b.status, priv: !!b.priv, rate: b.progress ? b.progress.rate : 100, t0: tm.t0, t1: tm.t1, mo: tm.mo },
        geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] } }));
      const big = d.poly.reduce((m, ring) => (ringArea(ring) > ringArea(m) ? ring : m), d.poly[0]);
      labels.push({ type: 'Feature', properties: { text: `${d.no}동 ${d.floors}층`, no: d.no, block: b.id, status: b.status, priv: !!b.priv }, geometry: { type: 'Point', coordinates: centroid(big) } });
    });
  });
  return [{ type: 'FeatureCollection', features: feats }, { type: 'FeatureCollection', features: labels }];
}
/* 동 그림자: 북서쪽에서 해가 비친다고 보고, 높이의 0.6배만큼 남동쪽으로 늘어뜨린 바닥 그림자(외곽 볼록껍질). 장식이며 실제 일조 계산이 아니다. */
function hull(P) {
  P = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of P.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function shadowGeoJSON(feats) {
  return { type: 'FeatureCollection', features: feats.map((f) => {
    const ring = f.geometry.coordinates[0], lat = ring[0][1], L = f.properties.h * 0.6, k = Math.SQRT1_2;
    const dx = L * k / (111320 * Math.cos(lat * Math.PI / 180)), dy = -L * k / 111320;
    const h = hull(ring.concat(ring.map((p) => [p[0] + dx, p[1] + dy]))); h.push(h[0]);
    return { type: 'Feature', properties: { status: f.properties.status, priv: f.properties.priv }, geometry: { type: 'Polygon', coordinates: [h] } };
  }) };
}
/* 지구 밖을 살짝 어둡게 하는 마스크: 넓은 사각형에서 지구 경계를 구멍으로 뺀다. */
function maskGeoJSON() {
  const holes = DISTRICTS.map((d) => [...d.poly, d.poly[0]]);
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[120, 30], [135, 30], [135, 45], [120, 45], [120, 30]], ...holes] } };
}
/* 주변 맥락(OpenStreetMap): 역 반경 원, 역, 학교 */
const CTX = window.GY_CONTEXT, HAS_CTX = !!(CTX && CTX.stations && CTX.stations.length);
const distM = (a, b) => { const R = 6371008.8, r = Math.PI / 180, dl = (b[1] - a[1]) * r, dn = (b[0] - a[0]) * r; const h = Math.sin(dl / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const distTxt = (d) => (d < 1000 ? `약 ${Math.round(d / 10) * 10} m` : `약 ${(d / 1000).toFixed(1)} km`);
function nearestCtx(pt) {
  const best = (arr) => arr.map((s) => ({ name: s.name, d: distM(pt, [s.lon, s.lat]) })).sort((a, b) => a.d - b.d)[0];
  return { st: best(CTX.stations), sch: CTX.schools && CTX.schools.length ? best(CTX.schools) : null };
}
function ctxGeoJSON() {
  const ring = (s, rM) => { const pts = [], dl = rM / 111320, dn = rM / (111320 * Math.cos(s.lat * Math.PI / 180)); for (let i = 0; i <= 72; i++) { const a = i / 72 * Math.PI * 2; pts.push([s.lon + Math.cos(a) * dn, s.lat + Math.sin(a) * dl]); } return pts; };
  const pt = (s) => ({ type: 'Feature', properties: { name: s.name }, geometry: { type: 'Point', coordinates: [s.lon, s.lat] } });
  return {
    st: { type: 'FeatureCollection', features: CTX.stations.map(pt) },
    sch: { type: 'FeatureCollection', features: (CTX.schools || []).map(pt) },
    ring: { type: 'FeatureCollection', features: CTX.stations.flatMap((s) => [[500, '500 m'], [1000, '1 km']].map(([r, label]) => ({ type: 'Feature', properties: { label }, geometry: { type: 'LineString', coordinates: ring(s, r) } }))) },
  };
}

/* V-World 래스터 배경에는 지명이 없어 OpenFreeMap(OSM) 벡터 타일의 지명·도로명만 얹는다. 글자가 지형에 휘지 않고 곧게 선다.
   OpenFreeMap 스타일 JSON을 실행 때마다 받지 않으려고, 쓰는 층 6개의 정의만 여기에 내장했다(2026-10 positron 스타일에서 추려 글꼴·간격만 손봄).
   나라·도·시 이름, 물 이름은 지도를 11단계 아래로 줄일 수 없게 해서 쓰지 않는다. */
const OFM_LABELS = [{"id":"highway-name-major","source-layer":"transportation_name","minzoom":13.5,"filter":["match",["get","class"],["primary","secondary","tertiary","trunk"],true,false],"layout":{"symbol-placement":"line","text-field":["case",["has","name:nonlatin"],["concat",["get","name:latin"]," ",["get","name:nonlatin"]],["coalesce",["get","name_en"],["get","name"]]],"text-font":["Noto Sans Regular"],"text-rotation-alignment":"map","text-size":11,"symbol-spacing":900}},{"id":"highway-name-minor","source-layer":"transportation_name","minzoom":16.2,"filter":["all",["match",["geometry-type"],["LineString","MultiLineString"],true,false],["match",["get","class"],["minor","service","track"],true,false]],"layout":{"symbol-placement":"line","text-field":["case",["has","name:nonlatin"],["concat",["get","name:latin"]," ",["get","name:nonlatin"]],["coalesce",["get","name_en"],["get","name"]]],"text-font":["Noto Sans Regular"],"text-rotation-alignment":"map","text-size":11,"symbol-spacing":900}},{"id":"highway-name-path","source-layer":"transportation_name","minzoom":17,"filter":["==",["get","class"],"path"],"layout":{"symbol-placement":"line","text-field":["case",["has","name:nonlatin"],["concat",["get","name:latin"]," ",["get","name:nonlatin"]],["coalesce",["get","name_en"],["get","name"]]],"text-font":["Noto Sans Regular"],"text-rotation-alignment":"map","text-size":11,"symbol-spacing":900}},{"id":"label_other","source-layer":"place","minzoom":8,"filter":["match",["get","class"],["city","continent","country","state","town","village"],false,true],"layout":{"text-field":["case",["has","name:nonlatin"],["concat",["get","name:latin"],"\n",["get","name:nonlatin"]],["coalesce",["get","name_en"],["get","name"]]],"text-font":["Noto Sans Regular"],"text-letter-spacing":0.1,"text-max-width":9,"text-size":["interpolate",["linear"],["zoom"],8,9,12,10]}},{"id":"label_village","source-layer":"place","minzoom":9,"filter":["==",["get","class"],"village"],"layout":{"text-anchor":"bottom","text-field":["case",["has","name:nonlatin"],["concat",["get","name:latin"],"\n",["get","name:nonlatin"]],["coalesce",["get","name_en"],["get","name"]]],"text-font":["Noto Sans Regular"],"text-max-width":8,"text-size":["interpolate",["exponential",1.2],["zoom"],7,10,11,12]}},{"id":"label_town","source-layer":"place","minzoom":6,"filter":["==",["get","class"],"town"],"layout":{"text-anchor":"bottom","text-field":["case",["has","name:nonlatin"],["concat",["get","name:latin"],"\n",["get","name:nonlatin"]],["coalesce",["get","name_en"],["get","name"]]],"text-font":["Noto Sans Regular"],"text-max-width":8,"text-size":["interpolate",["exponential",1.2],["zoom"],7,12,11,14]}}];
function addOfmLabels() {
  if (!map.getStyle()) return;
  const T = TH();
  if (!map.getSource('ofm')) map.addSource('ofm', { type: 'vector', url: 'https://tiles.openfreemap.org/planet' });
  const before = map.getLayer('blk-label-lo') ? 'blk-label-lo' : undefined;
  for (const l of OFM_LABELS) {
    const id = 'ofm-' + l.id; if (map.getLayer(id)) continue;
    map.addLayer({ ...l, id, type: 'symbol', source: 'ofm', layout: { ...l.layout, 'text-field': ['coalesce', ['get', 'name:ko'], ['get', 'name']] },
      paint: { 'text-color': T.sub, 'text-halo-color': T.halo, 'text-halo-width': 2 } }, before);
  }
}
/* 기존 건물 색(장식): 높이 램프 + 용도 색조 + 연식 + 동마다 ±4.5% 명도 흔들림.
   색조는 용도·연식을 '참고로' 비춘 것이고 높이의 뜻(진할수록 높음)을 바꾸지 않을 만큼만 준다. 건물마다 4가지 색을
   미리 계산해 속성에 넣는다: c 벽, cr 지붕, cd 흐리게일 때 벽, crd 흐리게일 때 지붕. 낮/밤을 바꾸면 다시 계산한다. */
const ROOF_T = 0.8;   // 지붕 층 두께(m). 벽은 그만큼 낮추고 그 위에 밝은 얇은 층을 얹는다.
const USE_TINT = [[/공동주택|단독주택|숙박/, [7, 1, -8], 1], [/근린생활|판매|업무|문화|운동/, [-5, 0, 6], 1], [/공장|창고|위험물|자동차/, [-5, -5, -3], 0.95], [/교육|의료|노유자|종교|수련/, [-3, 4, -1], 1], [/동.식물|농/, [-5, 5, -6], 1]];
function paintBuildings() {
  if (!HAS_GY) return;
  const T = TH(), night = theme === 'night', bg = hex2(T.bg), flat = hex2(T.flat), k = night ? 0.55 : 1;
  const stops = [[3, T.ramp[0]], [12, T.ramp[1]], [25, T.ramp[2]], [45, T.ramp[3]], [70, T.ramp[4]]].map(([h, c]) => [h, hex2(c)]);
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const hexOf = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const rampAt = (eh) => { if (eh <= stops[0][0]) return stops[0][1]; for (let i = 1; i < stops.length; i++) if (eh <= stops[i][0]) { const [h0, c0] = stops[i - 1], [h1, c1] = stops[i]; return mix(c0, c1, (eh - h0) / (h1 - h0)); } return stops[stops.length - 1][1]; };
  GY.features.forEach((f, i) => {
    const p = f.properties, unknown = p.src === '정보없음';
    let c = unknown ? flat.slice() : rampAt(p.eh);
    if (!unknown) {
      const t = USE_TINT.find(([re]) => re.test(p.u || ''));
      if (t) c = c.map((v, j) => v + t[1][j] * k).map((v) => v * t[2]);
      if (p.a && p.a < 1990) c = mix(c, [150, 146, 140], night ? 0.12 : 0.2); else if (p.a && p.a >= 2010) c = mix(c, [255, 255, 255], night ? 0.06 : 0.12);   // 오래된 건물은 칙칙하게, 새 건물은 산뜻하게
    }
    const j = (((i * 2654435761) >>> 0) % 1000) / 1000 - 0.5; c = c.map((v) => v * (1 + j * (unknown ? 0.04 : 0.09)));
    const cr = mix(c, [255, 255, 255], night ? 0.14 : 0.26);
    p.c = hexOf(c); p.cr = hexOf(cr); p.cd = hexOf(mix(c, bg, 0.45)); p.crd = hexOf(mix(cr, bg, 0.45));
  });
}
/* 기존 건물 그림자: 북서 해 기준으로 높이 0.6배를 남동쪽으로 늘어뜨린 바닥 판. 3 m 이상 건물만, 확대 14.3 이상에서 처음 필요할 때 만든다
   (16,696동 · 약 5.5 MB라 시작을 느리게 하지 않으려고). 얇은 불투명도 extrusion이라 서로 겹쳐도 이중으로 어두워지지 않는다. */
const shadowStyle = () => (theme === 'night' ? ['#000000', 0.5] : ['#1c2230', 0.3]);
function addOfficialShadows() {
  if (!HAS_GY || map.getSource('official-shadow') || !map.getLayer('official-3d')) return;
  const L = []; GY.features.forEach((f) => { const p = f.properties; if (p.eh < 3) return; const ring = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0]; L.push({ type: 'Feature', properties: { h: p.eh, status: '' }, geometry: { type: 'Polygon', coordinates: [ring] } }); });
  map.addSource('official-shadow', { type: 'geojson', data: shadowGeoJSON(L), maxzoom: 16 });
  const sh = shadowStyle();
  map.addLayer({ id: 'official-shadow', type: 'fill-extrusion', source: 'official-shadow', minzoom: 14.3,
    paint: { 'fill-extrusion-color': sh[0], 'fill-extrusion-height': 0.06, 'fill-extrusion-base': 0, 'fill-extrusion-opacity': dimExisting ? sh[1] * 0.35 : sh[1] } }, 'official-3d');
}
const OFFICIAL_LAYERS = ['official-far', 'official-3d', 'official-roof'];
const BLK_FILLS = ['blk-sale', 'blk-build', 'blk-soon', 'blk-move', 'blk-plan', 'blk-priv'];
const DIM_OPACITY = 0.3, HUD_MAXZ = 16.3;   // HUD는 이 확대 단계보다 멀리 볼 때만 보이고, 가까이에서는 지도 위 이름표가 대신한다
function kindExpr(colors) { return ['match', ['get', 'kind'], 'sale', colors.sale, 'build', colors.build, 'soon', colors.soon, 'move', colors.move, 'priv', colors.priv, colors.plan]; }
function setupCustom() {
  const T = TH(), night = theme === 'night', layers = map.getStyle().layers, firstSymbol = (layers.find((l) => l.type === 'symbol') || {}).id;
  const add = (l) => { if (!map.getLayer(l.id)) map.addLayer(l, firstSymbol); };
  const empty = { type: 'FeatureCollection', features: [] };
  const src = (id, spec) => { if (!map.getSource(id)) map.addSource(id, spec); };

  /* --- 자료 --- */
  src('dem', { type: 'raster-dem', tiles: DEM_TILES, tileSize: 256, encoding: 'terrarium', maxzoom: 14,   // 원자료가 30 m급이라 14단계면 충분하고, 지명 벡터 타일(최대 14)과 맞아 경고도 없다
   
    attribution: 'Terrain: <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">AWS Terrain Tiles</a> (SRTM·GMTED2010 © USGS, ETOPO1 © NOAA 등)' });
  src('dem-shade', { type: 'raster-dem', tiles: DEM_TILES, tileSize: 256, encoding: 'terrarium', maxzoom: 14 });
  src('sel', { type: 'geojson', data: empty });
  if (HAS_GY) paintBuildings();   // 건물 색 4종을 계산해 속성에 넣은 뒤 소스에 올린다(낮/밤을 바꿔 다시 불러도 새 색)
  if (HAS_GY) src('official', { type: 'geojson', data: GY, maxzoom: 16, attribution: '건물 © 국토교통부 GIS건물통합정보(V-World, CC BY 2.0 KR)' });
  if (HAS_PR) {
    const [dg, dl] = dongsGeoJSON(); DONG_FEATS = dg.features;
    src('blocks', { type: 'geojson', data: blocksGeoJSON() });
    src('block-pts', { type: 'geojson', data: blockPointsGeoJSON() });
    src('block-tops', { type: 'geojson', data: blockTopsGeoJSON() });
    src('dongs', { type: 'geojson', data: dg });
    src('dong-shadow', { type: 'geojson', data: shadowGeoJSON(dg.features) });
    src('dong-labels', { type: 'geojson', data: dl });
    if (DISTRICTS.length) {
      const osm = (REG.sources || []).some((s) => /OpenStreetMap/.test(s.label));
      src('district', { type: 'geojson', data: { type: 'FeatureCollection', features: DISTRICTS.map((d) => ({ type: 'Feature', properties: { name: d.name }, geometry: { type: 'Polygon', coordinates: [[...d.poly, d.poly[0]]] } })) }, ...(osm ? { attribution: '지구경계 © OpenStreetMap contributors' } : {}) });
      src('district-pt', { type: 'geojson', data: { type: 'FeatureCollection', features: DISTRICTS.map((d) => ({ type: 'Feature', properties: { name: d.name }, geometry: { type: 'Point', coordinates: districtLabelPoint(d) } })) } });
      src('district-mask', { type: 'geojson', data: maskGeoJSON() });
    }
    if (PR.otherBlocks && PR.otherBlocks.length) src('other-blocks', { type: 'geojson', data: { type: 'FeatureCollection', features: PR.otherBlocks.map((r) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...r, r[0]]] } })) } });
    if (!map.hasImage('hatch')) map.addImage('hatch', patternImage('hatch'), { pixelRatio: 2 });
    if (!map.hasImage('dots')) map.addImage('dots', patternImage('dots'), { pixelRatio: 2 });
    if (!map.hasImage('cross')) map.addImage('cross', patternImage('cross'), { pixelRatio: 2 });
    for (const k of ['sale', 'build', 'soon', 'move', 'priv', 'plan']) if (!map.hasImage('bd-' + k)) { const b = badgeImage(k); map.addImage('bd-' + k, b.data, b.opts); }
  }
  if (HAS_CTX) { const g = ctxGeoJSON(); src('ctx-st', { type: 'geojson', data: g.st, attribution: '역·학교 © OpenStreetMap contributors' }); src('ctx-sch', { type: 'geojson', data: g.sch }); src('ctx-ring', { type: 'geojson', data: g.ring }); }

  /* --- 지형·하늘·빛 --- */
  add({ id: 'hillshade-own', type: 'hillshade', source: 'dem-shade',
    paint: { 'hillshade-exaggeration': night ? 0.38 : 0.3, 'hillshade-shadow-color': T.hillShadow, 'hillshade-highlight-color': T.hillHi, 'hillshade-accent-color': T.hillAcc, 'hillshade-illumination-direction': 315, 'hillshade-illumination-anchor': 'map' } });
  try { map.setSky({ 'sky-color': T.sky[0], 'horizon-color': T.sky[1], 'fog-color': T.sky[1], 'sky-horizon-blend': 0.5, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.25 }); } catch (_) {}
  map.setTerrain({ source: 'dem', exaggeration: 1.5 });
  // 해는 북서쪽(315°)에서 비춘다. 지도를 돌려도 방향이 그대로이며, 언덕 음영(hillshade)과 같은 방향이다. 어두운 면이 너무 검어지지 않게 세기를 낮게 둔다.
  try { map.setLight({ anchor: 'map', position: [1.5, 315, 38], color: night ? '#E1E9FF' : '#FFFFFF', intensity: 0.3 }); } catch (_) {}

  /* --- 바닥(지구 마스크, 용지, 블록, 그림자, 선택 윤곽) --- */
  if (HAS_PR) {
    if (DISTRICTS.length) {
      add({ id: 'district-mask', type: 'fill', source: 'district-mask', paint: { 'fill-color': T.mask[0], 'fill-opacity': T.mask[1] } });
      add({ id: 'district-line', type: 'line', source: 'district', paint: { 'line-color': T.district, 'line-width': 1.4, 'line-dasharray': [4, 3], 'line-opacity': 0.9 } });
    }
    if (PR.otherBlocks && PR.otherBlocks.length) {
      add({ id: 'other-fill', type: 'fill', source: 'other-blocks', minzoom: 13.5, paint: { 'fill-color': T.other[0], 'fill-opacity': night ? 0.16 : 0.1 } });
      add({ id: 'other-line', type: 'line', source: 'other-blocks', minzoom: 13.5, paint: { 'line-color': T.other[1], 'line-width': 1.2, 'line-dasharray': [2, 2], 'line-opacity': 0.9 } });
    }
    const NP = ['!=', ['get', 'priv'], true];   // 공공택지 민간 단지는 상태 무늬 대신 회색 면(blk-priv)으로 그린다
    add({ id: 'blk-sale', type: 'fill', source: 'blocks', filter: ['all', ['==', ['get', 'status'], '분양중'], NP], paint: { 'fill-color': T.color.sale, 'fill-opacity': night ? 0.28 : 0.2 } });
    add({ id: 'blk-build', type: 'fill', source: 'blocks', filter: ['all', ['==', ['get', 'status'], '건설 단계'], NP], paint: { 'fill-pattern': 'hatch' } });
    add({ id: 'blk-soon', type: 'fill', source: 'blocks', filter: ['all', ['==', ['get', 'status'], '준공 임박'], NP], paint: { 'fill-pattern': 'dots' } });
    add({ id: 'blk-move', type: 'fill', source: 'blocks', filter: ['all', ['==', ['get', 'status'], '입주 단계'], NP], paint: { 'fill-pattern': 'cross' } });
    add({ id: 'blk-plan', type: 'fill', source: 'blocks', filter: ['all', ['==', ['get', 'status'], '계획'], NP], paint: { 'fill-color': T.color.plan, 'fill-opacity': night ? 0.16 : 0.1 } });
    add({ id: 'blk-priv', type: 'fill', source: 'blocks', filter: ['==', ['get', 'priv'], true], paint: { 'fill-color': T.color.priv, 'fill-opacity': night ? 0.32 : 0.26 } });
    add({ id: 'blk-line', type: 'line', source: 'blocks', filter: ['!=', ['get', 'kind'], 'plan'], paint: { 'line-color': kindExpr(T.color), 'line-width': 2 } });
    add({ id: 'blk-line-plan', type: 'line', source: 'blocks', filter: ['==', ['get', 'kind'], 'plan'], paint: { 'line-color': T.color.plan, 'line-width': 2, 'line-dasharray': [3, 2] } });
    add({ id: 'dong-shadow', type: 'fill', source: 'dong-shadow', paint: { 'fill-color': T.shadow[0], 'fill-opacity': T.shadow[1] } });
    add({ id: 'dong-line', type: 'line', source: 'dongs', minzoom: 15.6, paint: { 'line-color': T.dong, 'line-width': 1, 'line-dasharray': [2, 2], 'line-opacity': 0.75 } });
  }
  if (HAS_CTX) add({ id: 'ctx-ring', type: 'line', source: 'ctx-ring', layout: { visibility: 'none' }, paint: { 'line-color': T.sub, 'line-width': 1.2, 'line-dasharray': [2, 2], 'line-opacity': 0.85 } });
  add({ id: 'sel-line-halo', type: 'line', source: 'sel', paint: { 'line-color': T.halo, 'line-width': 7, 'line-opacity': 0.9 } });
  add({ id: 'sel-line', type: 'line', source: 'sel', paint: { 'line-color': night ? '#FFFFFF' : '#1B1D21', 'line-width': 3 } });

  /* --- 입체(선택, 기존 건물, 동) --- */
  add({ id: 'sel-3d', type: 'fill-extrusion', source: 'sel', paint: { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-height': ['get', 'eh'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.97 } });
  if (HAS_GY) {
    // 멀리(12~14)서는 10 m 이상만(6,586동), 가까이(14~)서는 전부. 벽은 지붕 두께만큼 낮추고 지붕 층을 따로 그린다. 높이가 없던 건물은 한 색(3 m 평면).
    const ao = night ? ['#000000', 0.55] : ['#232832', 0.34];
    add({ id: 'official-far', type: 'fill-extrusion', source: 'official', minzoom: 12, maxzoom: 14, filter: ['>=', ['get', 'eh'], 10],
      paint: { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-height': ['get', 'eh'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 1 } });
    // 건물 아래 바닥이 살짝 어두워지는 접지 음영(의사 AO)
    add({ id: 'official-ao', type: 'line', source: 'official', minzoom: 15,
      paint: { 'line-color': ao[0], 'line-opacity': ao[1], 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 15, 2, 18, 14], 'line-blur': ['interpolate', ['linear'], ['zoom'], 15, 2, 18, 8] } });
    add({ id: 'official-3d', type: 'fill-extrusion', source: 'official', minzoom: 14,
      paint: { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-height': ['max', 0.5, ['-', ['get', 'eh'], ROOF_T]], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 1 } });
    add({ id: 'official-roof', type: 'fill-extrusion', source: 'official', minzoom: 14,
      paint: { 'fill-extrusion-color': ['get', 'cr'], 'fill-extrusion-base': ['max', 0.5, ['-', ['get', 'eh'], ROOF_T]], 'fill-extrusion-height': ['max', 1.3, ['get', 'eh']], 'fill-extrusion-opacity': 1 } });
  }
  if (HAS_PR) {
    add({ id: 'dong-ghost', type: 'fill-extrusion', source: 'dongs', layout: { visibility: 'none' }, paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.2 } });
    add({ id: 'dong-3d', type: 'fill-extrusion', source: 'dongs', paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 1 } });
    // 멀리서 볼 때는 단지를 점(세대수만큼 크기)으로 보여 준다.
    add({ id: 'blk-dot', type: 'circle', source: 'block-pts', maxzoom: 14.3,
      paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'units'], 300, 7, 800, 12], 'circle-color': kindExpr(T.color), 'circle-stroke-color': T.halo, 'circle-stroke-width': 2, 'circle-opacity': ['interpolate', ['linear'], ['zoom'], 13.6, 0.95, 14.3, 0] } });
  }
  if (HAS_CTX) {
    add({ id: 'ctx-school', type: 'circle', source: 'ctx-sch', minzoom: 14.8, layout: { visibility: 'none' }, paint: { 'circle-radius': 4.5, 'circle-color': T.sub, 'circle-stroke-color': T.halo, 'circle-stroke-width': 1.6 } });
    add({ id: 'ctx-station', type: 'circle', source: 'ctx-st', layout: { visibility: 'none' }, paint: { 'circle-radius': 7, 'circle-color': night ? '#0E1624' : '#FFFFFF', 'circle-stroke-color': night ? '#FFFFFF' : '#1B1D21', 'circle-stroke-width': 3 } });
  }

  /* --- 글자 --- */
  if (HAS_PR) {
    const fontLayer = layers.find((l) => l.type === 'symbol' && l.layout && l.layout['text-font']);
    const font = fontLayer ? fontLayer.layout['text-font'] : ['Noto Sans Regular'];
    const sym = (l) => { if (!map.getLayer(l.id)) map.addLayer({ ...l, layout: { 'text-font': font, ...l.layout } }); };
    const fillText = night ? '#0E1624' : '#FFFFFF', planText = night ? '#E6EAF2' : '#2B2E34';
    const badgeIcon = ['match', ['get', 'kind'], 'sale', 'bd-sale', 'build', 'bd-build', 'soon', 'bd-soon', 'move', 'bd-move', 'priv', 'bd-priv', 'bd-plan'];
    const badgeText = ['match', ['get', 'kind'], 'plan', planText, fillText];
    sym({ id: 'blk-label-lo', type: 'symbol', source: 'block-pts', maxzoom: 14.3,
      layout: { 'text-field': ['get', 'short'], 'text-size': 13, 'text-allow-overlap': false, 'text-variable-anchor': ['top', 'bottom', 'left', 'right'], 'text-radial-offset': 1.1, 'symbol-sort-key': ['-', 0, ['get', 'units']] },
      paint: { 'text-color': T.text, 'text-halo-color': T.halo, 'text-halo-width': 2 } });
    // 단지 배지: 14.3~16.6은 단지 가운데에 두 줄(이름 / 상태·세대수), 그보다 가까우면 북쪽 끝에 한 줄로 얹는다.
    sym({ id: 'blk-badge', type: 'symbol', source: 'block-pts', minzoom: 14.3, maxzoom: 16.6,
      layout: { 'icon-image': badgeIcon, 'icon-text-fit': 'both', 'icon-text-fit-padding': [2, 6, 2, 6], 'icon-allow-overlap': false, 'text-allow-overlap': false, 'symbol-sort-key': ['-', 0, ['get', 'units']],
        'text-variable-anchor': ['center', 'right', 'left', 'top', 'bottom'], 'text-radial-offset': 0.9,   // 이웃한 배지와 겹치면 옆으로 비켜 선다
        'text-field': ['format', ['get', 'id'], { 'font-scale': 1.15 }, '\n', {}, ['get', 'l2'], { 'font-scale': 0.85 }], 'text-size': 13.5, 'text-justify': 'center' },
      paint: { 'text-color': badgeText } });
    sym({ id: 'blk-badge-top', type: 'symbol', source: 'block-tops', minzoom: 16.6,
      layout: { 'icon-image': badgeIcon, 'icon-text-fit': 'both', 'icon-text-fit-padding': [1, 6, 1, 6], 'icon-allow-overlap': true, 'text-allow-overlap': true,
        'text-field': ['get', 'lc'], 'text-size': 12.5, 'text-anchor': 'bottom', 'text-offset': [0, -2.4] },
      paint: { 'text-color': badgeText } });
    // 동 이름표: 모든 동에 "602동 15층"처럼 번호와 층수를 보인다(확대 16.6부터).
    const dongPaint = { 'text-color': T.text, 'text-halo-color': T.halo, 'text-halo-width': 1.8 };
    sym({ id: 'dong-label', type: 'symbol', source: 'dong-labels', minzoom: 16.6,
      layout: { 'text-field': ['get', 'text'], 'text-size': 11.5, 'text-allow-overlap': false, 'text-variable-anchor': ['top', 'bottom'], 'text-radial-offset': 0.4 }, paint: dongPaint });
    if (DISTRICTS.length) sym({ id: 'district-label', type: 'symbol', source: 'district-pt', maxzoom: 14.6,
      layout: { 'text-field': ['get', 'name'], 'text-size': 13, 'text-letter-spacing': 0.08 }, paint: { 'text-color': T.sub, 'text-halo-color': T.halo, 'text-halo-width': 2 } });
    if (HAS_CTX) {
      const cp = { 'text-color': T.text, 'text-halo-color': T.halo, 'text-halo-width': 2 };
      sym({ id: 'ctx-ring-label', type: 'symbol', source: 'ctx-ring', maxzoom: 16.5, layout: { visibility: 'none', 'symbol-placement': 'line', 'symbol-spacing': 900, 'text-field': ['get', 'label'], 'text-size': 11 }, paint: { ...cp, 'text-color': T.sub } });
      sym({ id: 'ctx-station-label', type: 'symbol', source: 'ctx-st', minzoom: 11.5, layout: { visibility: 'none', 'text-field': ['get', 'name'], 'text-size': 13, 'text-anchor': 'top', 'text-offset': [0, 0.9], 'text-allow-overlap': true }, paint: cp });
      sym({ id: 'ctx-school-label', type: 'symbol', source: 'ctx-sch', minzoom: 15.6, layout: { visibility: 'none', 'text-field': ['get', 'name'], 'text-size': 11.5, 'text-anchor': 'top', 'text-offset': [0, 0.8] }, paint: { ...cp, 'text-color': T.sub } });
    }
  }
  if (usingVworld) addOfmLabels();
  if (map.getZoom() >= 14.3) addOfficialShadows();
  applyAll();
  if (!usingVworld) for (const l of layers) if (l.type === 'symbol' && /name/.test(JSON.stringify(map.getLayoutProperty(l.id, 'text-field') || ''))) map.setLayoutProperty(l.id, 'text-field', ['coalesce', ['get', 'name:ko'], ['get', 'name']]);
}
map.on('style.load', setupCustom);
map.on('zoom', () => { if (map.getZoom() >= 14.3) addOfficialShadows(); });


/* ---------- 팝업 ---------- */
const BASIS = HAS_GY ? String(GY.meta.basis).replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3') : '-';
/* 카드는 건물을 가리지 않도록 건물의 오른쪽(없으면 왼쪽, 그것도 없으면 위)에 띄운다. */
const PW = 272 + 12;           // 카드 폭 + 꼬리
function bboxOf(rings, hM) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const r of rings) for (const p of r) { const s = map.project(p); x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y); }
  const mpp = 40075016.686 * Math.cos(map.getCenter().lat * Math.PI / 180) / (512 * Math.pow(2, map.getZoom()));
  const hp = (hM || 0) / mpp * Math.sin(map.getPitch() * Math.PI / 180);   // 기울인 화면에서 건물 높이가 차지하는 세로 픽셀(근사)
  return { x0, x1, top: y0 - hp, bottom: y1 };
}
function showCard(html, rings, hM, clickX) {
  if (popup) { const o = popup; popup = null; o.remove(); }
  const W = map.getContainer().clientWidth, H = map.getContainer().clientHeight, gap = 12, BAR = 52;
  const bb = bboxOf(rings, hM);
  const cy = Math.min(Math.max((bb.top + bb.bottom) / 2, 150), H - BAR - 150);
  const roomR = bb.x1 + gap + PW <= W - 8, roomL = bb.x0 - gap - PW >= 8;
  const wantL = clickX != null && clickX < (bb.x0 + bb.x1) / 2;       // 누른 건물이 단지 왼쪽에 있으면 카드도 왼쪽에
  let anchor, pt;
  if ((wantL && roomL) || (!roomR && roomL)) { anchor = 'right'; pt = [bb.x0 - gap, cy]; }
  else if (roomR) { anchor = 'left'; pt = [bb.x1 + gap, cy]; }
  else { anchor = 'bottom'; pt = [(bb.x0 + bb.x1) / 2, Math.max(bb.top - gap, 320)]; }
  popup = new maplibregl.Popup({ anchor, maxWidth: 'none', offset: [0, 0] }).setLngLat(map.unproject(pt)).setHTML(html).addTo(map);
  popup.on('close', () => { if (selId != null || selDong != null) select(null); });
  // 카드가 지도 위·아래 끝(하단 바 포함)을 벗어나면 세로로만 밀어 넣는다.
  const r = popup.getElement().getBoundingClientRect(), m = map.getContainer().getBoundingClientRect();
  const dy = r.top < m.top + 8 ? m.top + 8 - r.top : (r.bottom > m.bottom - BAR ? m.bottom - BAR - r.bottom : 0);
  if (dy) popup.setOffset([0, dy]);
  say(popup.getElement().innerText.replace(/\s+/g, ' '));
}
function floorHistogram(b) {
  const h = {}; b.dongs.forEach((d) => { h[d.floors] = (h[d.floors] || 0) + 1; });
  return `<span class="pc-fl">${Object.keys(h).map(Number).sort((a, c) => c - a).map((f) => `<span>${f}층 ${h[f]}개동</span>`).join('')}</span>`;
}
const chipHtml = (cls, t) => `<span class="pc-chip ${cls}">${esc(t)}</span>`;
const dlHtml = (rows) => `<dl class="pc-dl">${rows.filter(Boolean).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
const ringsOf = (g) => (g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map((p) => p[0]));
function dongBars(b, cur) {
  const max = Math.max(...b.dongs.map((d) => d.floors)), k = kindOf(b);
  return `<div class="pc-bars" role="img" aria-label="${dongN(b)}개동 층수 비교" style="--tone:${mixTone(k, 1)}">` +
    b.dongs.slice().sort((a, c) => a.no.localeCompare(c.no)).map((d) => `<i class="${d.no === cur ? 'on' : ''}" title="${d.no}동 ${d.floors}층" style="height:${Math.round(26 * d.floors / max)}px"></i>`).join('') + '</div>';
}
function dongPopup(p, clickX) {
  const b = BLOCKS.find((x) => x.id === p.block), r = floorsRange(b);
  const same = b.dongs.filter((x) => x.floors === p.floors).length;
  const n = dongN(b);
  const rank = same === 1 && p.floors === r[1] ? `${n}개동 중 가장 높은 동` : same === 1 && p.floors === r[0] ? `${n}개동 중 가장 낮은 동` : r[0] === r[1] ? `${n}개동 모두 ${p.floors}층` : `${n}개동 중 ${same}개동이 ${p.floors}층`;
  const dnote = p.tier === 'schematic' ? '동 위치·높이는 근사값(10~20 m)이며, 층수는 공급 자료 기준입니다.' : '동 윤곽은 실제 건물 자료입니다. 층수·높이는 자료 기준입니다.';
  showCard(`<div class="pc">
    <div class="pc-h"><b>${esc(p.no)}동</b><span class="pc-sub">${esc(b.id)}</span>${chipHtml(KIND[b.status], b.status)}${b.priv ? chipHtml('priv', '공공택지 민간') : ''}</div>
    <div class="pc-big"><strong>${p.floors}층</strong><span>높이 약 ${Math.round(p.h)} m${p.hEst ? ' (추정)' : ''}</span></div>
    ${dongBars(b, p.no)}<div class="pc-cap">${rank}</div>
    ${dlHtml([b.progress ? ['단지 공정율', `${pctTxt(b.progress.rate)} <small>(${esc(b.progress.asOf)})</small>`] : null, ['입주', esc(b.moveIn)]])}
    <p class="pc-foot">${dnote}</p></div>`,
    b.dongs.flatMap((x) => x.poly), floorsToHeight(r[1]), clickX);
}
function blockPopup(b, clickX) {
  const fr = floorsRange(b), hist = fr ? floorHistogram(b) : null, nr = HAS_CTX ? nearestCtx(centroid(b.poly)) : null;
  const hmax = fr ? floorsToHeight(fr[1]) : 0;
  showCard(`<div class="pc">
    <div class="pc-h"><b>${esc(b.id)}</b><span class="pc-sub">${esc(b.kind)}</span>${chipHtml(KIND[b.status], b.status)}${b.priv ? chipHtml('priv', '공공택지 민간') : ''}</div>
    <div class="pc-big"><strong>${unitsTxt(b)}</strong>${dongN(b) ? `<span>${dongN(b)}개동</span>` : ''}</div>
    ${b.note ? `<div class="pc-cap">${esc(b.note)}</div>` : ''}
    ${dlHtml([b.progress ? ['공정율', `${pctTxt(b.progress.rate)} <small>(${esc(b.progress.asOf)} 기준)</small>`] : null, ['층수', hist || '미확인'], ['입주', esc(b.moveIn)], b.progress && b.progress.start && b.progress.end ? ['공사기간', esc(b.progress.start) + ' ~ ' + esc(b.progress.end)] : null, b.builder ? ['시공사', esc(b.builder) + (b.contractM ? ` <small>(공사금액 ${fmt(Math.round(b.contractM / 100))}억원)</small>` : '')] : null,
      nr && nr.st ? ['가까운 역', `${esc(nr.st.name)} <small>${distTxt(nr.st.d)}</small>`] : null, nr && nr.sch ? ['가까운 학교', `${esc(nr.sch.name)} <small>${distTxt(nr.sch.d)}</small>`] : null])}
    <p class="pc-foot">${b.src ? `출처: ${esc(b.src)}<br>` : ''}${esc(b.outlineHow)}${nr ? '<br>역·학교: OpenStreetMap, 단지 중심에서 직선거리' : ''}</p></div>`,
    b.dongs ? b.dongs.flatMap((x) => x.poly).concat([b.poly]) : [b.poly], hmax, clickX);
}
function officialPopup(p, geom, clickX) {
  const name = p.n ? esc(p.n) : '이름 없는 건물';
  let chip, big;
  if (p.src === '공식높이') { chip = chipHtml('off', '공식 높이'); big = `<strong>${p.h} m</strong>`; }
  else if (p.src === '층수환산') { chip = chipHtml('est', '층수로 추정'); big = `<strong>약 ${Math.round(p.eh)} m</strong><span>${p.f}층 × ${(p.eh / p.f).toFixed(2)} m</span>`; }
  else { chip = chipHtml('none', '높이 모름'); big = `<strong>-</strong><span>3 m 평면으로 표시(실제 높이 아님)</span>`; }
  const fl = [p.f != null ? `지상 ${p.f}` : null, p.b != null ? `지하 ${p.b}` : null].filter(Boolean).join(' · ');
  showCard(`<div class="pc">
    <div class="pc-h"><b>${name}</b>${p.d ? `<span class="pc-sub">${esc(p.d)}</span>` : ''}${chip}</div>
    <div class="pc-big">${big}</div>
    ${dlHtml([['층수', fl ? esc(fl) + '층' : '정보 없음'], ['용도', esc(p.u || '미기재')], ['사용승인', p.a != null ? p.a + '년' : '연도 없음']])}
    ${p.x ? `<p class="pc-warn">⚠ 높이 ${p.h} m와 지상 ${p.f}층이 어긋납니다. 둘 중 하나가 틀렸을 수 있습니다.</p>` : ''}
    <p class="pc-foot">국토교통부 GIS건물통합정보 (V-World)<br>${esc(BASIS)} 기준</p></div>`,
    ringsOf(geom), p.eh, clickX);
}
const rateH = () => ['*', ['get', 'h'], ['max', 0.05, ['/', ['get', 'rate'], 100]]];
const timeH = () => ['*', ['get', 'h'], ['max', 0.04, ['min', 1, ['/', ['-', timeMo, ['get', 't0']], ['max', 0.5, ['-', ['get', 't1'], ['get', 't0']]]]]]];
/* 지금 보기 기준으로 한 동이 그려지는 높이(m). 선택 표시가 같은 높이로 그려지게 지도 식과 똑같이 계산한다. */
function dongH(p) {
  if (viewMode === 'progress') return p.h * Math.max(0.05, p.rate / 100);
  if (viewMode === 'time') return p.h * Math.max(0.04, Math.min(1, (timeMo - p.t0) / Math.max(0.5, p.t1 - p.t0)));
  return p.h;
}
function statusFilter() { const f = ['in', ['get', 'status'], ['literal', [...SHOWN]]]; return privOn ? f : ['all', f, ['!=', ['get', 'priv'], true]]; }
const blockVisible = (b) => SHOWN.has(b.status) && (privOn || !b.priv);   // 지금 지도에 보이는 단지인가(상태 선택 + 민간 스위치)
function dongFilter() { return selDong == null ? statusFilter() : ['all', statusFilter(), ['!=', ['get', 'key'], selDong]]; }
const vis = (id, on) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); };
const SEL_COLOR = '#F0E442';   // 고른 건물: Okabe-Ito의 노랑(상태색 어디와도 겹치지 않음) + 바닥 윤곽선
function applySel() {
  const src = map.getSource('sel');
  let feats = [];
  if (selId != null && HAS_GY) feats = [{ type: 'Feature', properties: { eh: GY.features[selId].properties.eh, c: SEL_COLOR }, geometry: GY.features[selId].geometry }];
  else if (selDong != null) feats = DONG_FEATS.filter((f) => f.properties.key === selDong).map((f) => ({ type: 'Feature', properties: { eh: dongH(f.properties), c: SEL_COLOR }, geometry: f.geometry }));
  if (src) src.setData({ type: 'FeatureCollection', features: feats });
  const notSel = selId == null ? null : ['!=', ['get', 'i'], selId];
  if (map.getLayer('official-3d')) map.setFilter('official-3d', notSel);
  if (map.getLayer('official-roof')) map.setFilter('official-roof', notSel);
  if (map.getLayer('official-far')) map.setFilter('official-far', notSel ? ['all', ['>=', ['get', 'eh'], 10], notSel] : ['>=', ['get', 'eh'], 10]);
  for (const id of ['dong-3d', 'dong-ghost']) if (map.getLayer(id)) map.setFilter(id, dongFilter());
}
/* 보이는 상태 고르기 */
function applyFilters() {
  if (!map.getLayer('blk-line')) return;
  const f = statusFilter();
  for (const [id, st] of [['blk-sale', '분양중'], ['blk-build', '건설 단계'], ['blk-soon', '준공 임박'], ['blk-move', '입주 단계'], ['blk-plan', '계획']]) vis(id, SHOWN.has(st));
  vis('blk-priv', privOn); map.setFilter('blk-priv', ['all', ['==', ['get', 'priv'], true], ['in', ['get', 'status'], ['literal', [...SHOWN]]]]);
  map.setFilter('blk-line', ['all', f, ['!=', ['get', 'kind'], 'plan']]);
  map.setFilter('blk-line-plan', ['all', f, ['==', ['get', 'kind'], 'plan']]);
  for (const id of ['blk-dot', 'blk-label-lo', 'blk-badge', 'blk-badge-top', 'dong-label', 'dong-shadow', 'dong-line']) if (map.getLayer(id)) map.setFilter(id, f);
  for (const id of ['dong-3d', 'dong-ghost']) if (map.getLayer(id)) map.setFilter(id, dongFilter());
  document.querySelectorAll('#projList li').forEach((li) => { const card = li.querySelector('.card'); if (!card) return; li.hidden = !blockVisible(BLOCKS.find((x) => x.id === card.dataset.id)); });
  scheduleHud();
  document.querySelectorAll('#timeline .tlp').forEach((g) => { const ids = idsOf(g); g.style.opacity = ids.some((id) => blockVisible(BLOCKS.find((b) => b.id === id))) ? 1 : 0.25; });
}
/* 보기 기준: 층수 / 공정율(지은 만큼만 채움) / 입주 시기(달력) */
function applyMode() {
  if (!map.getLayer('dong-3d')) return;
  const m = viewMode;
  vis('dong-ghost', m === 'progress' || m === 'time');
  map.setPaintProperty('dong-3d', 'fill-extrusion-height', m === 'progress' ? rateH() : m === 'time' ? timeH() : ['get', 'h']);
  // HUD가 켜져 있으면 먼 곳의 점·알약 이름표는 HUD로 대신하고, 가까워지는 16.3부터 북쪽 끝 이름표가 이어받는다.
  for (const id of ['blk-badge', 'blk-dot', 'blk-label-lo']) vis(id, !hudOn);
  if (map.getLayer('blk-badge-top')) map.setLayerZoomRange('blk-badge-top', hudOn ? HUD_MAXZ : 16.6, 24);
  const l2 = { floors: 'l2', progress: 'l2p', time: 'l2t' }[m], lc = { floors: 'lc', progress: 'lcp', time: 'lct' }[m];
  if (map.getLayer('blk-badge')) map.setLayoutProperty('blk-badge', 'text-field', ['format', ['get', 'id'], { 'font-scale': 1.15 }, '\n', {}, ['get', l2], { 'font-scale': 0.85 }]);
  if (map.getLayer('blk-badge-top')) map.setLayoutProperty('blk-badge-top', 'text-field', ['get', lc]);
  document.querySelectorAll('#modeSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  $('#timebar').hidden = m !== 'time';
  if (m === 'time') setTime(timeMo); else stopPlay();
  applyDim();
  if (BLOCKS.length) setLegend();
  applySel();
  renderHudContent();
}
function applyDim() {
  if (!map.getLayer('official-3d')) return;
  const dim = dimExisting;
  for (const id of OFFICIAL_LAYERS) if (map.getLayer(id)) {
    map.setPaintProperty(id, 'fill-extrusion-opacity', dim ? DIM_OPACITY : 1);
    map.setPaintProperty(id, 'fill-extrusion-color', ['get', id === 'official-roof' ? (dim ? 'crd' : 'cr') : (dim ? 'cd' : 'c')]);
  }
  if (map.getLayer('official-shadow')) map.setPaintProperty('official-shadow', 'fill-extrusion-opacity', dim ? shadowStyle()[1] * 0.35 : shadowStyle()[1]);
  if (map.getLayer('official-ao')) map.setPaintProperty('official-ao', 'line-opacity', (theme === 'night' ? 0.55 : 0.34) * (dim ? 0.35 : 1));
  if (BLOCKS.length) setLegend();
}
function applyCtx() {
  for (const id of ['ctx-station', 'ctx-station-label', 'ctx-school', 'ctx-school-label']) vis(id, ctxOn);
  for (const id of ['ctx-ring', 'ctx-ring-label']) vis(id, ctxOn && ringOn);
  if (BLOCKS.length) setLegend();
}
function applyAll() { applyFilters(); applyMode(); applyCtx(); }
function select(i) { selId = i; selDong = null; applySel(); }
function selectDong(key) { selId = null; selDong = key; applySel(); }
map.on('click', (e) => {
  const pick = (ids) => { const use = ids.filter((id) => map.getLayer(id)); return use.length ? map.queryRenderedFeatures(e.point, { layers: use })[0] : undefined; };
  const far = map.getZoom() < 14.3;     // 멀리서는 점이 단지를 대표하므로 점을 먼저 고른다
  const f = (far && (pick(['blk-dot']) || pick(BLK_FILLS))) || pick(['dong-3d']) || pick(BLK_FILLS) || pick(['blk-dot', 'blk-badge', 'blk-badge-top']) || pick(['official-3d', 'official-roof', 'official-far']);
  if (popup) { const o = popup; popup = null; o.remove(); }
  if (!f) { select(null); return; }
  if (f.layer.id === 'dong-3d') { selectDong(f.properties.key); dongPopup(f.properties, e.point.x); }
  else if (f.layer.id.startsWith('blk-')) { select(null); blockPopup(BLOCKS.find((b) => b.id === f.properties.id), e.point.x); }
  else { const i = f.properties.i; select(i); officialPopup(GY.features[i].properties, GY.features[i].geometry, e.point.x); }
});
map.on('mousemove', (e) => {
  const ids = ['dong-3d', ...BLK_FILLS, 'blk-dot', 'blk-badge', 'blk-badge-top', ...OFFICIAL_LAYERS].filter((id) => map.getLayer(id));
  map.getCanvas().style.cursor = ids.length && map.queryRenderedFeatures(e.point, { layers: ids }).length ? 'pointer' : '';
});

/* ---------- 패널 ---------- */
function setLegend() {
  const present = new Set(BLOCKS.filter((b) => !b.priv).map((b) => b.status));
  const rows = [];
  if (present.has('분양중')) rows.push(['<i class="sw sale"></i>', '분양중', '']);
  if (present.has('건설 단계')) rows.push(['<i class="sw build"></i>', '건설 단계', '']);
  if (present.has('준공 임박')) rows.push(['<i class="sw soon"></i>', '준공 임박', '<small>공정율 90% 이상, 입주 3개월 안</small>']);
  if (present.has('입주 단계')) rows.push(['<i class="sw move"></i>', '입주 단계', '<small>입주를 시작했거나 마침</small>']);
  if (present.has('계획')) rows.push(['<i class="sw plan"></i>', '계획', '']);
  if (HAS_PRIV && privOn) rows.push(['<i class="sw priv"></i>', '공공택지 민간', '<small>회색 면, 상태는 글자로</small>']);
  rows.push(['<i class="sw ramp"></i>', '기존 건물', `<small>${dimExisting ? '흐리게 표시 중' : '높을수록 진하게, 색조는 참고'}</small>`]);
  if (PR.otherBlocks && PR.otherBlocks.length) rows.push(['<i class="sw other"></i>', '이름 모르는 주택 용지', '<small>공식 윤곽, 점선</small>']);
  const anyDongs = BLOCKS.some((b) => b.dongs && b.dongs.length), schem = BLOCKS.some((b) => (b.dongs || []).some((d) => d.tier === 'schematic'));
  if (anyDongs) {
    if (viewMode === 'progress') rows.push(['<i class="sw ghost"></i>', '연한 윤곽', '<small>아직 짓지 않은 높이</small>']);
    else if (viewMode === 'time') rows.push(['<i class="sw ghost"></i>', '동 높이', '<small>공사 기간을 직선으로 나눈 추정</small>']);
    else rows.push(['<i class="sw tone"></i>', '같은 단지 안', '<small>진할수록 높은 동</small>']);
  }
  if (schem) rows.push(['<i class="sw dash"></i>', '동 위치는 근사', '<small>동 윤곽은 공급 자료를 옮긴 값</small>']);
  if (ctxOn && HAS_CTX) rows.push(['<i class="sw stn"></i><i class="sw sch"></i>', '역 · 학교', ringOn ? '<small>점선 원 500 m · 1 km</small>' : '']);
  $('#legendList').innerHTML = rows.map(([sw, t, n]) => `<li>${sw}<span>${t} ${n}</span></li>`).join('');
}
if (BLOCKS.length) {
  /* 합계 */
  const by = {}; BLOCKS.forEach((b) => { const k = kindOf(b); by[k] = (by[k] || 0) + b.units; });
  const total = BLOCKS.reduce((a, b) => a + b.units, 0), unk = BLOCKS.filter((b) => b.unitsKnown === false).length;
  const grp = [...STATUS_ORDER.map((st) => ({ key: KIND[st], label: st })), { key: 'priv', label: '공공택지 민간' }].filter((g) => g.key in by);
  const known = new Set(BLOCKS.filter((b) => b.unitsKnown !== false).map(kindOf));   // 세대수를 아는 단지가 하나도 없는 묶음은 0 대신 '세대수 미확인'
  const gTxt = (g) => (known.has(g.key) ? fmt(by[g.key]) + '세대' : '세대수 미확인');
  $('#sumTotal').textContent = `${fmt(total)}세대 (${BLOCKS.length}개 단지${unk ? `, 세대수 미확인 ${unk}곳 제외` : ''})`;
  $('#sumBar').innerHTML = grp.map((g) => `<i style="width:${total ? 100 * by[g.key] / total : 0}%;background:${g.key === 'plan' ? 'repeating-linear-gradient(90deg,#5C6068 0 4px,#fff 4px 7px)' : COLOR[g.key]}" title="${g.label} ${gTxt(g)}"></i>`).join('');
  $('#sumBar').setAttribute('aria-label', grp.map((g) => `${g.label} ${gTxt(g)}`).join(', '));
  $('#sumLeg').innerHTML = grp.map((g) => `<span><i class="sw ${g.key}"></i>${g.label} ${known.has(g.key) ? `${fmt(by[g.key])} (${pct(by[g.key], total)})` : '세대수 미확인'}</span>`).join('');
  setLegend();

  /* 단지 카드: 접어 두고, 눌러서 선택하면 펼친다 */
  $('#projList').innerHTML = BLOCKS.map((b) => {
    const k = kindOf(b), cur = STAGE[b.status], fr = floorsRange(b);
    const sub = [b.priv ? '공공택지 민간' : null, unitsTxt(b), dongN(b) ? `${dongN(b)}개동` : null, fr ? `${fr[0] === fr[1] ? fr[0] : fr[0] + '~' + fr[1]}층` : null, /^\d/.test(b.moveIn) ? `입주 ${b.moveIn}` : b.moveIn].filter(Boolean).join(' · ');
    const stage = STAGE_NAMES.map((n, i) => `<span class="${i < cur ? 'done' : i === cur ? `now ${k}` : ''}">${n}</span>`).join('');
    const bars = fr ? b.dongs.slice().sort((a, c) => a.no.localeCompare(c.no)).map((d) => `<i title="${d.no}동 ${d.floors}층" style="height:${Math.round(34 * d.floors / 15)}px;background:${mixTone(k, fr[1] > fr[0] ? (d.floors - fr[0]) / (fr[1] - fr[0]) : 1)}"></i>`).join('') + '<em>동별 층수</em>' : '';
    const mini = b.progress ? `<span class="mini" style="--c:${COLOR[k]}" title="공정율 ${b.progress.rate}%"><i style="width:${Math.max(b.progress.rate, 1)}%"></i></span>` : '';
    const more = `<span class="more"><span class="stage" aria-hidden="true">${stage}</span>${b.progress ? progressRow(b, k) : ''}${bars ? `<span class="fl">${bars}</span>` : ''}${b.builder ? `<span class="bld">시공 ${esc(b.builder)}</span>` : ''}</span>`;
    return `<li><button type="button" class="card" aria-expanded="false" data-id="${esc(b.id)}" aria-label="${esc(b.id)} ${esc(b.status)}, ${esc(sub)}"><i class="sw ${k}"></i><b>${esc(b.id)} ${esc(b.kind.replace('(공공분양)', ''))}</b><span class="st" style="color:${COLOR_D[k]}">${esc(b.status)}</span><span class="sub">${sub}</span>${mini}${more}</button></li>`;
  }).join('');

  /* 입주·준공 예정 타임라인 (2026-10 ~ 2029-12). 같은 달은 한 점에 묶는다 */
  const when = (m) => { const mm = /(\d{4})[.-](\d\d)/.exec(m); return mm ? (Number(mm[1]) - 2026) * 12 + Number(mm[2]) - 10 : null; };
  const SPAN = 38, X0 = 22, X1 = 278, CY = 52, tx = (mo) => X0 + (X1 - X0) * mo / SPAN;
  let svg = `<line x1="${X0}" y1="${CY}" x2="${X1}" y2="${CY}" stroke="#9A9DA4" stroke-width="2"/>`;
  for (const [lab, mo, anc] of [['2027', 3, 'middle'], ['2028', 15, 'middle'], ['2029', 27, 'middle']]) svg += `<line x1="${tx(mo)}" y1="${CY - 6}" x2="${tx(mo)}" y2="${CY + 6}" stroke="#4A4E56" stroke-width="2"/><text x="${anc === 'start' ? tx(mo) - 4 : tx(mo)}" y="114" font-size="11.5" fill="#4A4E56" text-anchor="${anc}">${lab}${lab.length === 4 ? '년' : ''}</text>`;
  const groups = new Map();
  BLOCKS.forEach((b) => { const mo = when(b.moveIn); if (mo == null || mo < 0 || mo > SPAN) return; (groups.get(mo) || groups.set(mo, []).get(mo)).push(b); });
  const items = [...groups.entries()].sort((a, c) => a[0] - c[0]);
  items.forEach(([mo, bs], idx) => {
    const x = tx(mo), units = bs.reduce((a, b) => a + b.units, 0), r = 5 + Math.sqrt(units) / 4.5, k = kindOf(bs[0]), up = idx % 2 === 0;
    const yid = up ? 18 : 80, ydt = up ? 31 : 93, ids = bs.map((b) => b.id), dt = String(bs[0].moveIn).replace(/[^0-9.\-]/g, '').slice(2, 7).replace('-', '.');
    svg += `<g class="tlp" tabindex="0" role="button" data-ids="${idsAttr(ids)}" aria-label="${esc(ids.join('·'))} ${esc(bs[0].moveIn)} 입주·준공 예정, 누르면 지도에서 보기">`
      + `<circle cx="${x}" cy="${CY}" r="${Math.max(r, 11)}" fill="transparent"/>`
      + `<circle cx="${x}" cy="${CY}" r="${r}" fill="${COLOR[k]}" fill-opacity="${k === 'build' ? .88 : 1}"/>`
      + `<text x="${x}" y="${yid}" font-size="12.5" font-weight="700" fill="#1B1D21" text-anchor="middle">${esc(ids.join('·'))}</text>`
      + `<text x="${x}" y="${ydt}" font-size="11.5" fill="#4A4E56" text-anchor="middle">${dt}</text></g>`;
  });
  $('#timeline').innerHTML = svg;
  $('#h-tl').closest('section').hidden = !items.length;   // 날짜가 있는 단지가 없으면 빈 축만 보이지 않게 구역을 숨긴다
  $('#timeline').setAttribute('aria-label', '입주·준공 예정: ' + items.map(([, bs]) => `${bs.map((b) => b.id).join('·')} ${bs[0].moveIn}`).join(', '));
} else {
  $('#projList').innerHTML = '<li class="empty">이 지역에는 아직 표시할 단지가 없습니다. 자료가 들어오면 이곳에 나타납니다.</li>';
  for (const id of ['h-sum', 'h-tl']) { const s = document.getElementById(id).closest('section'); if (s) s.hidden = true; }
}
function flyTo(opts) { if (reduceMotion) map.jumpTo(opts); else map.flyTo({ ...opts, duration: 1600 }); }
function setSheet(state) {
  const h = { peek: '176px', half: '48vh', full: '88vh' }[state] || '176px';
  document.documentElement.style.setProperty('--sh', h); $('#panel').dataset.sheet = state; $('#sheetHandle').setAttribute('aria-expanded', String(state !== 'peek'));
}
const openId = () => { const c = document.querySelector('#projList .card[aria-expanded="true"]'); return c ? c.dataset.id : null; };
function syncUrl(id) {
  try {
    const u = new URL(location.href), set = (k, v) => (v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
    set('block', id); set('priv', privOn ? '' : '0'); set('mode', viewMode !== 'floors' ? viewMode : ''); set('theme', theme === 'night' ? 'night' : ''); set('ctx', ctxOn ? '' : '0'); set('ring', ringOn ? '1' : ''); set('hud', hudOn ? '' : '0');
    history.replaceState(null, '', u);
  } catch (_) { /* file:// 에서는 막힐 수 있음 */ }
}
function focusBlock(id, { toggle = true, tour = false } = {}) {
  if (!tour) stopMotion();
  const btn = byId($('#projList'), 'data-id', id), b = BLOCKS.find((x) => x.id === id); if (!b) return;
  const was = btn && btn.getAttribute('aria-expanded') === 'true';
  document.querySelectorAll('#projList .card').forEach((c) => c.setAttribute('aria-expanded', c === btn && !(toggle && was) ? 'true' : 'false'));
  if (btn && btn.getAttribute('aria-expanded') === 'true') btn.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });   // 사이드바에서 펼친 카드가 보이게
  if (!SHOWN.has(b.status)) { SHOWN.add(b.status); syncChips(); applyFilters(); }
  if (b.priv && !privOn) { privOn = true; syncChips(); applyFilters(); }
  if (innerWidth <= 900) setSheet('peek');
  syncUrl(id);
  select(null);
  flyTo({ center: centroid(b.poly), zoom: 16.5, pitch: 58, bearing: -10 });
  map.once('moveend', () => setTimeout(() => blockPopup(b), 80));   // 애니메이션 프레임 안에서 project/unproject를 부르면 지형 렌더가 겹쳐 오류가 나므로 한 박자 뒤에 연다
  say(`${b.id} 블록으로 이동합니다.`);
}
$('#projList').addEventListener('click', (e) => { const btn = e.target.closest('button[data-id]'); if (btn) focusBlock(btn.dataset.id); });
/* 타임라인의 점이나 '다음 일정'을 누르면 그 시기 단지로 이동 */
function showGroup(ids) {
  stopMotion();
  const bs = ids.map((i) => BLOCKS.find((b) => b.id === i)).filter(Boolean); if (!bs.length) return;
  if (bs.length === 1) { focusBlock(ids[0], { toggle: false }); return; }
  document.querySelectorAll('#projList .card').forEach((c) => c.setAttribute('aria-expanded', 'false'));
  const bb = new maplibregl.LngLatBounds(); bs.forEach((b) => b.poly.forEach((p) => bb.extend(p)));
  if (popup) { popup.remove(); popup = null; }
  select(null);
  if (innerWidth <= 900) setSheet('peek');
  map.fitBounds(bb, { padding: { top: 90, bottom: 90, left: 60, right: 60 }, pitch: 56, bearing: -8, duration: reduceMotion ? 0 : 1200, maxZoom: 16.4 });
  say(`${ids.join('과 ')} 블록을 함께 봅니다.`);
}
function onTimeline(e) {
  if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
  const g = e.target.closest('.tlp'); if (!g) return; e.preventDefault();
  showGroup(idsOf(g));
}
$('#timeline').addEventListener('click', onTimeline); $('#timeline').addEventListener('keydown', onTimeline);
const dur = reduceMotion ? 0 : 700;
function fitAll() {
  const pts = BLOCKS.flatMap((b) => b.poly); if (!pts.length) return;
  const bb = new maplibregl.LngLatBounds(); pts.forEach((p) => bb.extend(p));
  map.fitBounds(bb, { padding: { top: 70, bottom: 90, left: 50, right: 50 }, pitch: 52, bearing: 0, duration: reduceMotion ? 0 : 900, maxZoom: 16.2 });
}
$('#vAll').addEventListener('click', () => { stopMotion(); fitAll(); });
$('#vPlane').addEventListener('click', () => map.easeTo({ pitch: map.getPitch() < 5 ? 58 : 0, duration: dur }));

/* 자동 회전: 컨트롤이나 지도를 만지면 멈춘다. 움직임 줄이기 설정이면 버튼을 숨긴다. */
let orbitRaf = 0, orbitOn = false;
function stopOrbit() {
  if (!orbitOn) return; orbitOn = false; if (orbitRaf) cancelAnimationFrame(orbitRaf); orbitRaf = 0;
  $('#vOrbit').setAttribute('aria-pressed', 'false'); $('#vOrbit').textContent = '자동'; say('자동 회전을 멈췄습니다.');
}
function startOrbit() {
  stopTour(); orbitOn = true;
  if (popup) { popup.remove(); popup = null; }   // 돌면 카드가 건물을 가리게 되므로 닫는다
  $('#vOrbit').setAttribute('aria-pressed', 'true'); $('#vOrbit').textContent = '멈춤'; say('지금 보이는 지도를 그대로 천천히 돌립니다. 지도나 컨트롤을 만지면 멈춥니다.');
  // 화면 가운데·확대·기울기를 바꾸지 않고, 지금 보이는 지도를 그 자리에서 돌린다.
  let last = performance.now();
  const tick = (t) => { map.setBearing(map.getBearing() + (t - last) / 1000 * 7.5); last = t; orbitRaf = requestAnimationFrame(tick); };
  orbitRaf = requestAnimationFrame(tick);
}
$('#vOrbit').addEventListener('click', () => { stopTour(); if (orbitOn) stopOrbit(); else startOrbit(); });
if (reduceMotion) { $('#vOrbit').hidden = true; $('#vOrbit').previousElementSibling.hidden = true; }

/* 순회 투어: 보이는 단지를 하나씩 날아가 카드까지 열어 보여 주고, 한 바퀴 돌면 전체 보기로 돌아온다. 지도를 만지면 멈춘다. */
let tourOn = false, tourT = 0;
function stopTour() {
  if (!tourOn) return; tourOn = false; clearTimeout(tourT); tourT = 0;
  $('#vTour').setAttribute('aria-pressed', 'false'); $('#vTour').textContent = '순회 투어'; say('투어를 멈췄습니다.');
}
function startTour() {
  stopOrbit(); tourOn = true;
  $('#vTour').setAttribute('aria-pressed', 'true'); $('#vTour').textContent = '투어 멈춤'; say('단지를 차례로 보여 줍니다. 지도를 만지면 멈춥니다.');
  const seq = BLOCKS.filter(blockVisible).map((b) => b.id); let i = 0;
  const step = () => {
    if (!tourOn) return;
    if (i >= seq.length) { stopTour(); fitAll(); return; }
    focusBlock(seq[i++], { toggle: false, tour: true });
    tourT = setTimeout(step, 6500);
  };
  step();
}
$('#vTour').addEventListener('click', () => { if (tourOn) stopTour(); else startTour(); });
function stopMotion() { stopOrbit(); stopTour(); }
for (const ev of ['mousedown', 'touchstart', 'wheel']) map.on(ev, () => stopMotion());
$('#map').addEventListener('keydown', () => stopMotion());

/* 수동 회전 컨트롤: 슬라이더(0~359°)를 끌거나 ◀▶로 15°씩(길게 누르면 계속) 돌리고, '북'으로 북쪽을 위로 맞춘다.
   자동 회전·투어·마우스 등 무엇으로 돌든 슬라이더가 따라간다. 값은 카메라가 보는 방향이며 0°는 북쪽이 위다. */
const DIRS = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
let dialDrag = false, dialRaf = 0, dialVal = 0, holdT = 0, holdRaf = 0, held = false, heldAt = 0;
const normB = (b) => ((Math.round(b) % 360) + 360) % 360;
function syncDial() {
  const b = normB(map.getBearing()), name = DIRS[Math.round(b / 45) % 8], r = $('#dRange'), o = $('#dOut'), txt = `${b}° ${name}`;
  if (!dialDrag && r.value !== String(b)) r.value = String(b);
  if (o.textContent !== txt) { o.textContent = txt; r.setAttribute('aria-valuetext', `${b}도, ${name}쪽을 봅니다`); }
}
function syncPlane() { const f = String(map.getPitch() < 5), el = $('#vPlane'); if (el.getAttribute('aria-pressed') !== f) el.setAttribute('aria-pressed', f); }
map.on('move', () => { syncDial(); syncPlane(); });
{
  const r = $('#dRange'), endDrag = () => { if (dialDrag) { dialDrag = false; syncDial(); } };
  r.addEventListener('pointerdown', () => { stopMotion(); dialDrag = true; });
  for (const t of ['pointerup', 'pointercancel', 'blur', 'change']) r.addEventListener(t, endDrag);
  document.addEventListener('pointerup', endDrag);
  r.addEventListener('keydown', () => stopMotion());
  r.addEventListener('input', (e) => {
    stopMotion(); dialVal = Number(e.target.value);
    if (!dialRaf) dialRaf = requestAnimationFrame(() => { dialRaf = 0; map.setBearing(dialVal); });   // 끄는 동안 화면 갱신 횟수만큼만 돌린다
  });
}
function holdStart(dir) {
  stopMotion(); held = false; clearTimeout(holdT);
  holdT = setTimeout(() => {
    held = true; let last = performance.now();
    const tick = (t) => { map.setBearing(map.getBearing() + dir * (t - last) / 1000 * 45); last = t; holdRaf = requestAnimationFrame(tick); };
    holdRaf = requestAnimationFrame(tick);
  }, 260);
}
function holdEnd() { clearTimeout(holdT); holdT = 0; if (holdRaf) { cancelAnimationFrame(holdRaf); holdRaf = 0; } if (held) { held = false; heldAt = performance.now(); } }
for (const [sel, dir] of [['#dLeft', -1], ['#dRight', 1]]) {
  const el = $(sel);
  el.addEventListener('pointerdown', (e) => { if (!e.button) holdStart(dir); });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(t, holdEnd);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('click', () => {
    if (performance.now() - heldAt < 350) return;   // 길게 눌러 돌렸다면 손을 뗄 때의 클릭은 무시
    stopMotion(); map.easeTo({ bearing: map.getBearing() + dir * 15, duration: reduceMotion ? 0 : 250, easing: (t) => t });
  });
}
$('#dNorth').addEventListener('click', () => { stopMotion(); map.easeTo({ bearing: 0, duration: dur }); });

/* 옵션 창: 자주 바꾸지 않는 설정을 모았다. 기본값과 다른 설정이 있으면 버튼에 개수를 보인다. */
const ALL_ST = new Set(BLOCKS.map((b) => b.status));
const optCount = () => (SHOWN.size < ALL_ST.size ? 1 : 0) + (HAS_CTX && !ctxOn ? 1 : 0) + (HAS_CTX && ctxOn && ringOn ? 1 : 0) + (dimExisting ? 1 : 0) + (theme === 'night' ? 1 : 0) + (hudOn ? 0 : 1) + (HAS_PRIV && !privOn ? 1 : 0);
function syncChips() {
  document.querySelectorAll('#optStatus input').forEach((i) => { i.checked = SHOWN.has(i.dataset.status); });
  $('#dimChip').checked = dimExisting; $('#nightChip').checked = theme === 'night'; $('#hudChip').checked = hudOn; if (HAS_PRIV) $('#privChip').checked = privOn;
  if (HAS_CTX) { $('#ctxChip').checked = ctxOn; $('#ringChip').checked = ringOn; $('#ringChip').disabled = !ctxOn; $('#lblRing').classList.toggle('dis', !ctxOn); }
  const n = optCount(); $('#optN').hidden = !n; $('#optN').textContent = String(n);
  $('#optBtn').setAttribute('aria-label', n ? `옵션, 기본값과 다른 설정 ${n}개` : '옵션');
}
/* 낮/밤 전환: V-World 배경이면 스타일을 갈아끼우지 않고 배경 타일 주소와 우리가 얹은 층만 새 색으로 다시 만든다
   (스타일을 통째로 바꾸면 MapLibre 안에서 가끔 그리기 오류가 나서). 키가 없어 OpenFreeMap 스타일이면 스타일을 바꾼다. */
function reTheme() {
  const st = map.getStyle();
  try { map.setTerrain(null); } catch (_) {}
  for (const l of [...st.layers].reverse()) if (l.id !== 'bg' && l.id !== 'vworld') map.removeLayer(l.id);
  for (const id of Object.keys(st.sources)) if (id !== 'vworld') map.removeSource(id);
  for (const id of ['hatch', 'dots', 'cross', 'bd-sale', 'bd-build', 'bd-soon', 'bd-move', 'bd-priv', 'bd-plan']) if (map.hasImage(id)) map.removeImage(id);
  map.setPaintProperty('bg', 'background-color', TH().bg);
  map.getSource('vworld').setTiles([wmts(TH().vw)]);
  setupCustom();
}
function setTheme(t) {
  if (theme === t) return; theme = t; $('.mapwrap').dataset.theme = theme; syncChips(); syncUrl(openId());
  if (KEY && usingVworld && map.getLayer('vworld') && map.getLayer('bg')) reTheme(); else map.setStyle(baseStyle(), { diff: false });
  renderHudContent();
  say(theme === 'night' ? '야간 지도로 바꿉니다.' : '낮 지도로 바꿉니다.');
}
function setOpt(open) {
  $('#optPanel').hidden = !open; $('#optBtn').setAttribute('aria-expanded', String(open));
  if (open) positionOpt();
}
function positionOpt() {
  const w = $('.mapwrap').getBoundingClientRect(), b = $('#optBtn').getBoundingClientRect(), pw = $('#optPanel').offsetWidth || 272;
  $('#optPanel').style.setProperty('--ox', Math.max(12, Math.min(b.left - w.left, w.width - pw - 12)) + 'px');
  $('#optPanel').style.setProperty('--oy', (b.bottom - w.top + 6) + 'px');
}
(function wireTop() {
  const present = STATUS_ORDER.filter((st) => ALL_ST.has(st));
  $('#optStatus').innerHTML = present.map((st) => `<label><input type="checkbox" data-status="${st}" checked><i class="sw ${KIND[st]}"></i>${st}</label>`).join('');
  if (!HAS_CTX) { $('#lblCtx').hidden = true; $('#lblRing').hidden = true; }
  $('#lblPriv').hidden = !HAS_PRIV;
  $('#modeSeg').addEventListener('click', (e) => {
    const m = e.target.closest('button[data-mode]'); if (!m) return;
    viewMode = m.dataset.mode; applyMode(); syncUrl(openId()); say(MODE_SAY[viewMode]);
  });
  $('#optBtn').addEventListener('click', () => setOpt($('#optPanel').hidden));
  $('#optPanel').addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.status) {
      const st = t.dataset.status;
      if (!t.checked && SHOWN.size === 1) { t.checked = true; say('한 가지 상태는 켜 두어야 합니다.'); return; }
      t.checked ? SHOWN.add(st) : SHOWN.delete(st); syncChips(); applyFilters(); say(`${st} ${SHOWN.has(st) ? '보임' : '숨김'}`);
    } else if (t.id === 'privChip') { privOn = t.checked; syncChips(); applyFilters(); setLegend(); syncUrl(openId()); say(privOn ? '공공택지 민간 단지를 보여 줍니다.' : '공공택지 민간 단지를 숨깁니다.'); }
    else if (t.id === 'dimChip') { dimExisting = t.checked; syncChips(); applyDim(); }
    else if (t.id === 'ctxChip') { ctxOn = t.checked; syncChips(); applyCtx(); syncUrl(openId()); say(ctxOn ? '역과 학교를 보여 줍니다.' : '역과 학교를 숨깁니다.'); }
    else if (t.id === 'ringChip') { ringOn = t.checked; syncChips(); applyCtx(); syncUrl(openId()); }
    else if (t.id === 'hudChip') { hudOn = t.checked; applyMode(); syncChips(); syncUrl(openId()); say(hudOn ? 'HUD 표시를 켭니다.' : 'HUD 표시를 끕니다.'); }
    else if (t.id === 'nightChip') setTheme(t.checked ? 'night' : 'day');
  });
  $('#optReset').addEventListener('click', () => {
    ALL_ST.forEach((st) => SHOWN.add(st)); ctxOn = true; ringOn = false; dimExisting = false; hudOn = true; privOn = true; applyMode();
    applyFilters(); applyDim(); applyCtx(); setTheme('day'); syncChips(); syncUrl(openId()); say('옵션을 기본값으로 되돌렸습니다.');
  });
  document.addEventListener('pointerdown', (e) => { if (!$('#optPanel').hidden && !e.target.closest('#optPanel, #optBtn')) setOpt(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#optPanel').hidden) { setOpt(false); $('#optBtn').focus(); } });
  window.addEventListener('resize', () => { if (!$('#optPanel').hidden) positionOpt(); });
  syncChips(); syncDial(); syncPlane();
})();
const MODE_SAY = { floors: '동 높이를 층수로 보여 줍니다.', progress: '동 높이를 공정율만큼만 채워 보여 줍니다.', time: '달력을 움직이면 공사와 입주가 진행되는 모습을 보여 줍니다.' };

/* 입주 시기 보기: 달력(2026.10~2029.12)을 움직이면 동이 공사 기간에 맞춰 자란다. 공사 기간을 직선으로 나눈 추정이며 실제 공정과 다를 수 있다. */
let playT = 0;
function timeSummary(m) {
  let moved = 0, done = 0, going = 0, before = 0;
  BLOCKS.forEach((b) => { const t = blockTimes(b); if (m >= t.mo) moved++; else if (m >= t.t1) done++; else if (m >= t.t0) going++; else before++; });
  return { moved, done, going, before };
}
function setTime(m) {
  timeMo = Math.max(0, Math.min(MO_MAX, Math.round(m)));
  $('#tRange').value = String(timeMo);
  const t = timeSummary(timeMo);
  $('#tOut').innerHTML = `<b>${moLabel(timeMo)}</b> 입주 ${t.moved} · 준공 ${t.done} · 공사 중 ${t.going}${t.before ? ` · 착공 전 ${t.before}` : ''}`;
  $('#tRange').setAttribute('aria-valuetext', `${moLabel(timeMo)}, 입주 ${t.moved}개 단지, 준공 ${t.done}개 단지, 공사 중 ${t.going}개 단지`);
  if (viewMode === 'time' && map.getLayer('dong-3d')) { map.setPaintProperty('dong-3d', 'fill-extrusion-height', timeH()); applySel(); }
}
function stopPlay() {
  if (playT) { clearInterval(playT); playT = 0; }
  $('#tPlay').textContent = '▶'; $('#tPlay').setAttribute('aria-label', '입주 시기 재생');
}
function startPlay() {
  if (timeMo >= MO_MAX) setTime(0);
  $('#tPlay').textContent = '⏸'; $('#tPlay').setAttribute('aria-label', '재생 멈춤');
  playT = setInterval(() => { if (timeMo >= MO_MAX) { stopPlay(); return; } setTime(timeMo + 1); }, 420);
}
$('#tPlay').addEventListener('click', () => { if (playT) stopPlay(); else startPlay(); });
$('#tRange').addEventListener('input', (e) => { stopPlay(); setTime(Number(e.target.value)); });
timeMo = Math.max(0, Math.min(MO_MAX, Math.floor(monthF(new Date().toISOString().slice(0, 10)) ?? 0)));
$('#tRange').max = String(MO_MAX);

/* 다음 일정: 가까운 준공·입주 3건을 D-n으로. 달만 아는 입주는 개월 수로 어림한다. */
function buildNext() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const parse = (str) => { const m = /(\d{4})[.-](\d\d)(?:[.-](\d\d))?/.exec(str || ''); return m ? { d: new Date(+m[1], +m[2] - 1, m[3] ? +m[3] : 1), exact: !!m[3] } : null; };
  const ev = [];
  BLOCKS.forEach((b) => {
    const digit = /^\d/.test(b.moveIn), mv = parse(b.moveIn), end = b.progress ? parse(b.progress.end) : null;
    if (digit && end) ev.push({ kind: '준공 예정', b, ...end });
    if (!digit && mv) ev.push({ kind: '준공 예정', b, ...mv });      // 임대: 입주계획의 준공 예정일
    if (digit && mv) ev.push({ kind: '입주 시작', b, ...mv, exact: false });
  });
  const days = (d) => Math.round((d - today) / 864e5);
  const groups = new Map();
  ev.filter((e) => days(e.d) >= 0).sort((a, c) => a.d - c.d).forEach((e) => { const k = `${e.kind}|${e.d.getTime()}`; (groups.get(k) || groups.set(k, { ...e, bs: [] }).get(k)).bs.push(e.b); });
  const rows = [...groups.values()].slice(0, 3);
  $('#h-next').parentElement.hidden = !rows.length;
  $('#nextList').innerHTML = rows.map((g) => {
    const n = days(g.d), ids = g.bs.map((b) => b.id), units = g.bs.reduce((a, b) => a + b.units, 0);
    const dn = !g.exact ? (n < 30 ? '이번 달' : `${Math.round(n / 30.4)}개월 뒤`) : n === 0 ? 'D-day' : n <= 120 ? `D-${n}` : `${Math.round(n / 30.4)}개월 뒤`;
    const when = g.exact ? `${g.d.getFullYear()}.${String(g.d.getMonth() + 1).padStart(2, '0')}.${String(g.d.getDate()).padStart(2, '0')}` : `${g.d.getFullYear()}.${String(g.d.getMonth() + 1).padStart(2, '0')} 예정`;
    return `<li><button type="button" class="nx" data-ids="${idsAttr(ids)}" aria-label="${esc(ids.join('·'))} ${g.kind} ${when}, ${dn}, 누르면 지도에서 보기"><span class="dn${n > 60 ? ' far' : ''}">${dn}</span><span><b>${esc(ids.join('·'))} ${g.kind}</b><span class="s">${when} · ${fmt(units)}세대</span></span></button></li>`;
  }).join('');
}
buildNext();
$('#nextList').addEventListener('click', (e) => { const b = e.target.closest('button[data-ids]'); if (b) showGroup(idsOf(b)); });
$('#sheetHandle').addEventListener('click', () => setSheet({ peek: 'half', half: 'full', full: 'peek' }[$('#panel').dataset.sheet]));
if (innerWidth <= 900) setSheet('peek');

if (HAS_GY) {
  const s = ST.src, n = ST.n;
  $('#qbar').innerHTML = [['공식높이', '#6B6F77'], ['층수환산', '#B3B6BC'], ['정보없음', '#ECEDEF']].map(([k, c]) => `<i style="width:${100 * s[k] / n}%;background:${c}" title="${k} ${fmt(s[k])}동"></i>`).join('');
  $('#qbar').setAttribute('aria-label', `공식 높이 ${pct(s['공식높이'], n)}, 층수 환산 ${pct(s['층수환산'], n)}, 정보 없음 ${pct(s['정보없음'], n)}`);
  $('#qtext').textContent = `공식 높이 ${pct(s['공식높이'], n)} · 층수 환산 ${pct(s['층수환산'], n)} · 정보 없음 ${pct(s['정보없음'], n)}`;
  $('#basis').textContent = BASIS;
} else {
  $('#qtext').textContent = '이 지역의 공식 건물 자료가 아직 없습니다.';
}

let firstIdle = true;
map.on('idle', () => {
  const s = STATUS; s.loaded = true;
  if (firstIdle) {
    firstIdle = false; $('#loading').hidden = true;
    const at = document.querySelector('.maplibregl-ctrl-attrib'); if (at) { at.classList.remove('maplibregl-compact-show'); at.removeAttribute('open'); }   // 출처 표기는 접어 두고 ⓘ를 누르면 펼친다
    const want = q.get('block'), wb = want && REG.resolveBlock ? REG.resolveBlock(want) : null; if (wb && BLOCKS.includes(wb)) focusBlock(wb.id, { toggle: false });
  }
  const c = map.getCenter(); s.center = [c.lng, c.lat]; s.zoom = map.getZoom(); s.pitch = map.getPitch(); s.terrain = !!map.getTerrain();
  try {
    const dongs = map.getLayer('dong-3d') ? map.queryRenderedFeatures(undefined, { layers: ['dong-3d'] }) : [];
    s.dongPieces = dongs.length; s.dongNos = [...new Set(dongs.map((f) => f.properties.no))].sort();
    s.blocks = map.getLayer('blk-line') ? [...new Set(map.queryRenderedFeatures(undefined, { layers: ['blk-line', 'blk-line-plan'] }).map((f) => f.properties.id))].sort() : [];
  } catch (_) {}
  if (q.get('selftest')) document.documentElement.setAttribute('data-status', JSON.stringify(s));
});
if (window.innerWidth <= 900) $('#maplegend').open = false;   // 좁은 화면에서는 범례를 접어 둔다

/* ---------- 동서남북 HUD: 지도가 돌면 눈금판이 함께 돌아 북쪽이 어디인지 보이고, 가운데에 보는 방향(도)을 적는다 ---------- */
const cpRose = $('#cpRose'), cpLabels = [...cpRose.querySelectorAll('text')];
(function buildCompassTicks() {
  let h = '';
  for (let a = 0; a < 360; a += 15) {
    if (a % 90 === 0) continue;   // 동서남북 자리는 글자가 차지한다
    const len = a % 45 === 0 ? 6 : 3.5, rad = (a - 90) * Math.PI / 180, r0 = 38, r1 = 38 - len;
    h += `<line class="cp-tick${a % 45 === 0 ? ' m' : ''}" x1="${(Math.cos(rad) * r0).toFixed(2)}" y1="${(Math.sin(rad) * r0).toFixed(2)}" x2="${(Math.cos(rad) * r1).toFixed(2)}" y2="${(Math.sin(rad) * r1).toFixed(2)}"/>`;
  }
  $('#cpTicks').innerHTML = h;
})();
function syncCompass() {
  const b = map.getBearing(), n = normB(b), name = DIRS[Math.round(n / 45) % 8];
  cpRose.setAttribute('transform', `rotate(${(-b).toFixed(2)})`);
  for (const t of cpLabels) t.setAttribute('transform', `rotate(${b.toFixed(2)} ${t.dataset.x} ${t.dataset.y})`);   // 글자는 늘 바로 서게
  const deg = `${n}°`; if ($('#cpDeg').textContent !== deg) { $('#cpDeg').textContent = deg; $('#cpName').textContent = name; $('#compass').setAttribute('aria-label', `나침반. 보는 방향 ${n}도, ${name}쪽. 누르면 북쪽이 위로 오게 합니다`); }
}
$('#compass').addEventListener('click', () => { stopMotion(); map.easeTo({ bearing: 0, duration: dur }); });
map.on('move', syncCompass);
syncCompass();

/* ---------- 사이드바 스크롤: 큰 제목이 접히고, 구역 제목이 위에 붙어 따라오며, 오른쪽 점 레일로 구역을 오간다 ---------- */
(function panelScroll() {
  const sc = $('#pscroll'), head = $('#phead'), cur = $('#pcur');
  const secs = [...document.querySelectorAll('#prail button')].map((b) => ({ btn: b, el: document.getElementById(b.dataset.sec).closest('section'), name: b.getAttribute('aria-label') }));
  const topOf = (el) => el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
  let raf = 0;
  const upd = () => {
    raf = 0;
    const vis = secs.filter((x) => !x.el.hidden), max = sc.scrollHeight - sc.clientHeight, y = sc.scrollTop;
    head.classList.toggle('scrolled', y > 6);
    let now = vis[0];
    for (const x of vis) if (topOf(x.el) <= y + 40) now = x;
    if (max > 8 && y >= max - 4) now = vis[vis.length - 1];   // 맨 아래에 닿으면 마지막 구역
    secs.forEach((x) => {
      const on = x === now;
      if ((x.btn.getAttribute('aria-current') === 'true') !== on) { if (on) x.btn.setAttribute('aria-current', 'true'); else x.btn.removeAttribute('aria-current'); }
      const t0 = topOf(x.el); x.el.classList.toggle('stuck', t0 < y - 1 && t0 + x.el.offsetHeight > y + 36);   // 제목이 위에 붙어 있는 구역에만 그림자
    });
    const t = `${vis.indexOf(now) + 1}/${vis.length} ${now.name}`; if (cur.textContent !== t) cur.textContent = t;
  };
  const sched = () => { if (!raf) raf = requestAnimationFrame(upd); };
  sc.addEventListener('scroll', sched, { passive: true });
  window.addEventListener('resize', sched);
  if (window.ResizeObserver) { const ro = new ResizeObserver(sched); ro.observe(sc); secs.forEach((x) => ro.observe(x.el)); }
  $('#prail').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-sec]'); if (!b) return;
    const x = secs.find((y) => y.btn === b); sc.scrollTo({ top: x === secs.find((z) => !z.el.hidden) ? 0 : topOf(x.el), behavior: reduceMotion ? 'auto' : 'smooth' });
  });
  secs.forEach((x) => { x.btn.hidden = x.el.hidden; });   // 내용이 없는 구역(예: 다음 일정)은 레일에서도 뺀다
  upd();
})();

/* ---------- HUD: 단지마다 모서리 표시선(레티클)과 정보창을 화면에 고정된 크기로 그린다 ---------- */
let hudRaf = 0; const hudPrev = {}, hudSz = {};
function renderHudContent() {
  const host = $('#hudTags'); if (!host || !BLOCKS.length) return;
  if (!host.children.length) host.innerHTML = BLOCKS.map((b) => `<button type="button" class="hudtag" data-id="${esc(b.id)}"></button>`).join('');
  const T = TH();
  BLOCKS.forEach((b) => {
    const el = byId(host, 'data-id', b.id), k = kindOf(b), fr = floorsRange(b);
    el.style.setProperty('--c', T.color[k]); el.style.setProperty('--cd', theme === 'night' ? T.color[k] : COLOR_D[k]);
    const line = viewMode === 'progress' ? (b.progress ? `<span class="ht-bar"><i style="width:${Math.max(b.progress.rate, 1)}%"></i></span>공정율 ${pctTxt(b.progress.rate)}` : '공정율 -')
      : viewMode === 'time' ? esc(moveText(b)) : (fr ? `${fr[0] === fr[1] ? fr[0] : fr[0] + '~' + fr[1]}층` : '층수 미확인');
    el.innerHTML = `<span class="ht-h"><b>${esc(b.id)}</b><i>${esc(b.status)}</i></span><span class="ht-m">${unitsTxt(b)}${dongN(b) ? ` · ${dongN(b)}개동` : ''}</span><span class="ht-s">${line}</span>`;
    el.setAttribute('aria-label', `${b.id} ${b.status}${b.priv ? ', 공공택지 민간' : ''}, ${unitsTxt(b)}${dongN(b) ? `, ${dongN(b)}개동` : ''}. 누르면 지도에서 보기`);
    delete hudSz[b.id];
  });
  scheduleHud();
}
function scheduleHud() { if (!hudRaf) hudRaf = requestAnimationFrame(renderHud); }
const HUD_EXCL = '.topbar, .maplibregl-ctrl-top-right, #compass, .maplibregl-ctrl-bottom-right, #maplegend, .bar, #timebar:not([hidden]), #hudSum:not([hidden]), #optPanel:not([hidden]), #panelToggle';
function renderHud() {
  hudRaf = 0;
  const hud = $('#hud'), on = hudOn && HAS_PR && BLOCKS.length && map.getZoom() < HUD_MAXZ;
  hud.hidden = !on; if (!on) return;
  const mr = hud.getBoundingClientRect(), W = mr.width, H = mr.height, T = TH(), pad = 6;
  const ex = [...document.querySelectorAll(HUD_EXCL + (innerWidth <= 900 ? ', #panel' : ''))].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 2 && r.height > 2)
    .map((r) => ({ l: r.left - mr.left - pad, t: r.top - mr.top - pad, r: r.right - mr.left + pad, b: r.bottom - mr.top + pad }));
  const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  const placed = [], parts = [];
  const order = BLOCKS.filter(blockVisible).sort((a, c) => c.units - a.units);
  BLOCKS.forEach((b) => { const el = byId($('#hudTags'), 'data-id', b.id); el.hidden = !blockVisible(b); });
  for (const b of order) {
    const el = byId($('#hudTags'), 'data-id', b.id), k = kindOf(b), col = T.color[k];
    const ps = b.poly.map((c) => map.project(c));
    let x0 = Math.min(...ps.map((p) => p.x)), x1 = Math.max(...ps.map((p) => p.x)), y0 = Math.min(...ps.map((p) => p.y)), y1 = Math.max(...ps.map((p) => p.y));
    if (x1 < -30 || x0 > W + 30 || y1 < -30 || y0 > H + 30) { el.hidden = true; continue; }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (x1 - x0 < 22) { x0 = cx - 11; x1 = cx + 11; } if (y1 - y0 < 22) { y0 = cy - 11; y1 = cy + 11; }
    x0 -= 6; x1 += 6; y0 -= 6; y1 += 6;
    const sz = hudSz[b.id] || (hudSz[b.id] = { w: el.offsetWidth, h: el.offsetHeight }), TW = sz.w, TH_ = sz.h;
    const cands = [[x1 + 16, y0 - 4], [x0 - 16 - TW, y0 - 4], [x1 + 16, y1 - TH_ + 4], [x0 - 16 - TW, y1 - TH_ + 4], [cx - TW / 2, y0 - 16 - TH_], [cx - TW / 2, y1 + 16]];
    const rectOf = (c) => ({ l: c[0], t: c[1], r: c[0] + TW, b: c[1] + TH_ });
    const inside = (r) => r.l >= 4 && r.t >= 4 && r.r <= W - 4 && r.b <= H - 4;
    const conflicts = (r) => (inside(r) ? 0 : 3) + ex.filter((e) => hit(r, e)).length + placed.filter((e) => hit(r, e)).length;
    const first = hudPrev[b.id] != null ? hudPrev[b.id] : 0;
    let best = first, bestC = conflicts(rectOf(cands[first]));
    if (bestC > 0) cands.forEach((c, i) => { const n = conflicts(rectOf(c)); if (n < bestC) { best = i; bestC = n; } });
    hudPrev[b.id] = best;
    const c = cands[best], r = rectOf(c); placed.push(r);
    el.style.transform = `translate(${Math.round(c[0])}px,${Math.round(c[1])}px)`;
    // 모서리 표시선(레티클) + 정보창으로 이어지는 점선
    const L = Math.max(6, Math.min(14, (x1 - x0) / 3, (y1 - y0) / 3));
    const d = `M${x0},${y0 + L}V${y0}H${x0 + L}M${x1 - L},${y0}H${x1}V${y0 + L}M${x1},${y1 - L}V${y1}H${x1 - L}M${x0 + L},${y1}H${x0}V${y1 - L}`;
    const kx = c[0] > cx ? x1 : x0, ky = c[1] + TH_ / 2 > cy ? y1 : y0;
    const tx = Math.min(Math.max(kx, r.l), r.r), ty = Math.min(Math.max(ky, r.t), r.b);
    parts.push(`<path d="${d}" fill="none" stroke="${T.halo}" stroke-width="5" stroke-linecap="square"/><path d="${d}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linecap="square"/>`
      + `<line x1="${kx}" y1="${ky}" x2="${tx}" y2="${ty}" stroke="${T.halo}" stroke-width="3.5"/><line x1="${kx}" y1="${ky}" x2="${tx}" y2="${ty}" stroke="${col}" stroke-width="1.4" stroke-dasharray="3 3"/>`
      + `<circle cx="${kx}" cy="${ky}" r="3" fill="${col}" stroke="${T.halo}" stroke-width="1.5"/>`);
  }
  $('#hudSvg').innerHTML = parts.join('');
}
$('#hudTags').addEventListener('click', (e) => { const t = e.target.closest('button[data-id]'); if (t) focusBlock(t.dataset.id); });
map.on('render', scheduleHud); map.on('resize', () => { for (const k in hudSz) delete hudSz[k]; scheduleHud(); });

/* ---------- 사이드바 접기 + 요약 HUD: 지도만 크게 볼 때도 합계와 다음 일정이 화면에 남는다 ---------- */
function syncHudSum() {
  const rows = [...$('#nextList').children].slice(0, 2).map((li) => li.outerHTML).join('');
  $('#hudSum').innerHTML = `<h3>공급 예정</h3><div class="hs-total">${esc($('#sumTotal').textContent)}</div><div class="sbar" role="img" aria-label="${esc($('#sumBar').getAttribute('aria-label') || '')}">${$('#sumBar').innerHTML}</div><div class="sleg">${$('#sumLeg').innerHTML}</div>`
    + (rows ? `<h3>다음 일정</h3><ul class="next">${rows}</ul>` : '');
}
function setCollapsed(on) {
  $('.app').classList.toggle('collapsed', on);
  const t = $('#panelToggle'); t.setAttribute('aria-expanded', String(!on));
  const lab = on ? '사이드바 펼치기' : '사이드바 접기'; t.setAttribute('aria-label', lab); t.title = lab; t.firstElementChild.textContent = on ? '›' : '‹';
  $('#hudSum').hidden = !on;
  requestAnimationFrame(() => { map.resize(); scheduleHud(); });
  say(on ? '사이드바를 접었습니다. 요약은 지도 오른쪽 위에 보입니다.' : '사이드바를 펼쳤습니다.');
}
$('#panelToggle').addEventListener('click', () => setCollapsed(!$('.app').classList.contains('collapsed')));
$('#hudSum').addEventListener('click', (e) => { const b = e.target.closest('button[data-ids]'); if (b) showGroup(idsOf(b)); });
syncHudSum();
renderHudContent();

if (q.get('selftest')) {   // 시험 전용 훅(운영 주소에는 붙지 않음)
  window.__map = map; window.__blocks = BLOCKS;
  window.__st = () => ({ viewMode, theme, ctxOn, ringOn, timeMo, selId, selDong, tourOn, playing: !!playT });
}
