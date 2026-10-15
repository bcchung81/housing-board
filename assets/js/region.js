/* 지역 번들 로더와 어댑터.
   regions/<slug>/*.json(번들)을 화면 코드(app.js)가 쓰는 전역 모양(GY_BUILDINGS · GY_PROJECTS · GY_CONTEXT · GY_INFRA)으로 바꾼다.
   순수 함수는 node --test 로 시험한다(tests/js/region.test.cjs). DOM 은 applyTexts · mount* · boot 에서만 만진다.
   필드 정의와 변환 규칙의 정본: docs/data-interface/번들-어댑터-정의서.md */
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./settle.js') : root.Settle || null);   // 입주 경과 표지(서버 lib/permits.js 와 같은 파일)
  if (node) module.exports = api;
  else root.RegionLoader = api;
})(typeof self !== 'undefined' ? self : this, function (Settle) {
  'use strict';

  const STATUS_RANK = ['분양중', '건설 단계', '준공 임박', '입주 단계', '계획', '사업화'];
  const OUTLINE_TEXT = { official: '블록 윤곽은 공식 자료', building: '동 윤곽은 실제 건물 자료', schematic: '동 윤곽은 근사값(10~20 m)', point: '수도권 사업 위치는 대표점 둘레 표지(경계 아님)' };
  const TIER_ORDER = ['official', 'building', 'schematic', 'point'];
  const CODE_PARAMS = ['project', 'pnu', 'bjd', 'sgg', 'code'];   // 우선순위 순서(사업 id 가 가장 구체적이다)
  const FLOOR_HEIGHT = 2.85;   // 층고를 모를 때(화면의 기본 환산과 같은 값)

  const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);

  /* ---------- 지역 고르기 ---------- */
  function pickRegion(index, search) {
    const regions = (index && index.regions) || [];
    if (!regions.length) return { error: 'empty', regions };
    const want = new URLSearchParams(search || '').get('region');
    if (want) {
      const r = regions.find((x) => x.slug === want);
      return r ? { region: r } : { error: 'unknown', requested: want, regions };
    }
    return { region: regions.find((x) => x.default) || regions[0] };
  }
  function selectorModel(index, slug) {
    const regions = (index && index.regions) || [];
    return { visible: regions.length >= 2, options: regions.map((r) => ({ value: r.slug, label: r.name, selected: r.slug === slug })) };
  }
  function regionUrl(href, slug) {
    const u = new URL(href);
    u.searchParams.delete('block');
    for (const n of CODE_PARAMS) u.searchParams.delete(n);   // 지역을 고르면 코드 진입은 끝난다
    u.searchParams.set('region', slug);
    return u.toString();
  }

  /* ---------- 표준코드로 열기 (?project= | ?pnu= | ?bjd= | ?sgg= | ?code=) ----------
     코드가 있으면 코드가 우선이다(둘 이상이면 project > pnu > bjd > sgg > code 중 앞선 하나). ?region= 만 있으면 옛 방식 그대로.
     코드는 /api/v1/resolve 가 해석하고, 번들이 있는 시군구(등급 A)만 지도를 연다. 스펙: docs/product/상황판-스펙.md 2.1 */
  function codeQuery(search) {
    const p = new URLSearchParams(search || '');
    for (const n of CODE_PARAMS) if (p.has(n)) return { name: n, value: p.get(n) };
    return null;
  }
  const resolveUrl = (cq, base) => `${base || 'api/v1/resolve'}?${new URLSearchParams({ [cq.name]: cq.value, geometry: '1' })}`;   // 경계도 함께 받는다(번들 없는 지역은 경계가 지도의 전부)
  /* 주소 이동 입력줄이 고른 곳으로 지도를 여는 주소: 코드 매개변수를 이 하나로 바꾸고 region·block·at 은 지운다(보던 상태 mode·panel 등은 남김).
     at 은 도로명 주소처럼 좌표가 있을 때만 '경도,위도,확대' 로 붙인다 */
  function codeUrl(href, name, value, at) {
    const u = new URL(href);
    for (const n of CODE_PARAMS) u.searchParams.delete(n);
    for (const n of ['region', 'block', 'at']) u.searchParams.delete(n);
    u.searchParams.set(name, value);
    if (at) u.searchParams.set('at', at);
    return u.toString();
  }
  /* 코드 입력을 지역 번들 주소(?region=slug)로 바꾼다. 코드 매개변수는 지우고 나머지(at·mode 등)는 그대로 둔다 */
  function withRegion(search, slug) {
    const p = new URLSearchParams(search || '');
    for (const n of CODE_PARAMS) p.delete(n);
    p.set('region', slug);
    return `?${p}`;
  }
  /* bbox 가 화면(가로 px)에 들어가는 확대 단계(타일 512 px 기준). 지도 앱의 minZoom 11 아래로는 내려가지 않는다 */
  function zoomForBbox(bbox, px = 700) {
    if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(finite)) return null;
    const lon = Math.max(bbox[2] - bbox[0], 1e-4);
    return Math.max(11, Math.min(16, Math.log2((px * 360) / (512 * lon)) - 0.2));
  }
  /* 해석 결과 → 지도 시작 위치. 번들이 있는 시군구는 지역 기본 시점이라 null. 법정동은 한눈에, 필지는 가까이,
     번들이 없는 시군구는 경계가 한눈에 보이게 */
  function resolvedStart(r) {
    if (!r || !Array.isArray(r.center) || r.center.length !== 2 || !r.center.every(finite)) return null;
    const none = !r.coverage || r.coverage.tier !== 'A';
    if (r.type === 'sgg' || (r.type === 'project' && !r.bjd && !r.pnu)) { const z = none ? zoomForBbox(r.bbox) : null; return z == null ? null : { center: r.center, zoom: Math.round(z * 10) / 10 }; }
    const parcel = (r.type === 'pnu' || r.type === 'project') && r.parcel && r.parcel.geometry;   // 사업 id 로 열었어도 필지가 연결돼 있으면 필지로
    return { center: r.center, zoom: parcel ? 17.6 : 15.4 };
  }
  /* 강조해서 그릴 경계: 필지가 있으면 필지, 없으면 법정동 경계(필지를 못 찾아 후퇴한 경우 포함).
     시군구는 번들이 있으면 그리지 않고(지구 경계가 있음) 번들이 없으면 시군구 경계가 화면의 전부다 */
  function resolvedShape(r) {
    if (!r) return null;
    if ((r.type === 'sgg' || (r.type === 'project' && !r.bjd && !r.pnu)) && r.coverage && r.coverage.tier === 'A') return null;   // 번들이 있는 시군구(사업이 위치 없이 시군구까지만 열린 경우 포함)는 지구 경계가 있어 그리지 않는다
    const g = ((r.type === 'pnu' || r.type === 'project') && r.parcel && r.parcel.geometry) || r.geometry;
    return g && g.type && g.coordinates ? g : null;
  }
  /* 건축HUB 인허가 사업(/api/v1/permits 의 features)을 번들 단지(projects.json 의 한 항목) 모양으로. 시행자·분양 정보가 없어 sponsorClass 는 'unknown' 이고
     상태는 인허가로 아는 3가지(계획·건설 단계·입주 단계)뿐이다. 윤곽은 필지(연속지적도), 동(3D)은 없다 */
  const HUB_SOURCES = [
    { id: 'hub-housing-permit', label: '건축HUB 주택인허가정보(번지 단위 집계)' },
    { id: 'vworld-cadastre', label: 'V-World 연속지적도(필지 경계)' },
  ];
  const LEDGER_SOURCE = { id: 'hub-bldrgst', label: '건축HUB 건축물대장정보(총괄표제부: 블록·합필 위치, 사용승인일)' };
  function permitsToProjects(fc) {
    const out = [];
    for (const f of (fc && fc.features) || []) {
      const p = f.properties || {}, ring = f.geometry && f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : null;
      if (!p.pnu || !ring || ring.length < 4) continue;
      const open = ring.slice(0, ring.length - 1);
      const byLedger = !!(p.via === 'ledger' || p.statusBy === 'ledger'), ledgerDone = !!(p.completedAt && (p.statusBy === 'ledger' || (p.ledger && p.ledger.useAprDay === p.completedAt)));
      const dates = [p.approvedAt ? `사업승인 ${p.approvedAt}` : '', p.startedAt ? `착공 ${p.startedAt}` : '', p.completedAt ? `${ledgerDone ? '사용승인(건물대장)' : '사용검사'} ${p.completedAt}` : ''].filter(Boolean).join(' · ');
      /* 건물대장으로 위치를 정했으면 근거를 적는다: 블록 단위 허가(필지 번호 없음)는 세대수·대지면적이 맞는 대장 지번, 합필·분할은 현재 지번 */
      const where = p.via === 'ledger' ? `건물대장 기준 위치${p.block ? `(허가는 블록 단위 ${p.block})` : p.hubJibun ? `(허가 지번 ${p.hubJibun}은 합필·분할로 지금은 없음)` : ''}: ${p.ledger && p.ledger.by === 'name' ? '세대수·단지명 일치(허가에 대지면적 기록이 없음)' : `세대수 일치, 대지면적 오차 ${p.ledger && finite(p.ledger.areaDiff) ? `${p.ledger.areaDiff}%` : '2% 이내'}`}` : '';
      /* 예정일이 지났는데 착공·사용검사 기록이 원천에 없으면 사실만 적는다(지연이라고 판정하지 않음) */
      const late = p.overdue ? `${p.overdue.kind} 예정일 ${p.overdue.plannedAt}이 ${p.overdue.months >= 1 ? `${p.overdue.months}개월` : '얼마'} 지났으나 ${p.overdue.kind} 기록이 없음` : (p.status === '계획' && !p.plannedStart ? '착공 기록 없음' : '');
      out.push({
        id: `hub-${p.pnu}`, projectId: /^PRJ-\d{5}-\d{4}$/.test(p.projectId || '') ? p.projectId : null, zoneId: 'hub', label: p.label || p.name, name: p.name, sponsor: { type: 'unknown', name: '' }, sponsorClass: 'unknown',
        kind: '인허가 사업', status: p.status, units: finite(p.units) ? p.units : null, dongCount: finite(p.mainBldCnt) ? p.mainBldCnt : 0,
        moveIn: p.status === '입주 단계' ? (p.completedAt ? p.completedAt.slice(0, 7) : null) : (p.plannedCompletion || null), doneAt: p.completedAt || null, overdue: p.overdue || null,
        outline: { tier: 'official', poly: open, how: p.via === 'ledger' ? '건물대장이 가리키는 대지 필지(연속지적도)' : '건축HUB 인허가의 대지 필지(연속지적도)' }, dongs: null, events: [], sources: byLedger ? ['hub-housing-permit', 'hub-bldrgst', 'vworld-cadastre'] : ['hub-housing-permit', 'vworld-cadastre'],
        pnu: p.pnu, refs: Array.isArray(p.refs) ? p.refs.map(String) : [],   // 사업 원장과 잇는 열쇠(attachLedger)
        note: [p.address, where, `허가 기록 ${p.records}건`, dates, p.status === '계획' && p.plannedStart && !p.overdue ? `착공 예정 ${p.plannedStart}` : '', late, '시행자·분양 정보는 없음'].filter(Boolean).join(' · '),
      });
    }
    return out;
  }
  /* 번들이 없는 지역(등급 B·C)을 여는 빈 번들. 건물은 화면이 요청 시 칸 단위로 불러 붙이므로(GY_BUILDINGS.dynamic) 처음엔 비어 있고,
     법정동·필지로 열었으면 그 법정동의 건축HUB 인허가 사업(permits)이 단지로 들어간다 */
  function emptyBundle(resolved, index, permits, infra, opts) {
    const name = resolved.name || '선택한 지역';
    const home = opts && opts.home;   // 수도권: { doc } (doc 이 null 이면 받지 못함) — 인허가·기반시설 없이 원장 사업만
    if (home) {
      const docs = home.doc ? [home.doc] : [], lite = home.lite && Array.isArray(home.lite.buildings) ? home.lite : null;
      /* 경량 번들(home-lite): 사업 둘레 건물은 처음부터 그리고(번들 밖은 그대로 요청 시 조회 — dynamic), 지구 공동주택용지 면은 지구 경계로, 다른 블록 라벨점은 옅은 점 표지로 */
      const zones = lite ? (lite.districts || []).flatMap((d) => (d.polys || []).filter((g) => Array.isArray(g) && g.length >= 4).map((g) => ({ name: String(d.name || ''), poly: g.slice(0, g.length - 1) }))) : [];
      const others = lite ? (lite.blocks || []).filter((x) => Array.isArray(x.at) && x.at.every(finite)).map((x) => ring8(x.at, 22)) : [];
      const pts = docs.flatMap((d) => d.projects || []).filter((x) => x && x.loc && HOME_DRAWN_M[x.loc.by] && Array.isArray(x.loc.at) && x.loc.at.length === 2 && x.loc.at.every(finite) && !(x.bundles || []).length).map((x) => x.loc.at);
      const region = { slug: '', name, notes: home.doc ? [] : ['사업 원장 자료를 불러오지 못했습니다. 잠시 뒤 다시 열어 보세요.'], title: name,
        description: `${name}의 공급 사업은 사업 원장 기준입니다. 위치는 대표점이며 사업 경계가 아닙니다.${lite ? ` 건물은 사업 둘레 ${lite.radiusM || 300} m를 미리 담았고 그 밖은 확대하면 불러옵니다.` : ''}`,
        view: homeView(pts, opts.px) || { center: resolved.center || [127.0, 37.5], zoom: Math.round((zoomForBbox(resolved.bbox) || 12) * 10) / 10, pitch: 50, bearing: 0 }, sources: [], zones };
      const buildings = { type: 'FeatureCollection', meta: { basis: (lite && lite.basis) || '', factor: {} }, features: lite ? liteFeatures(lite.buildings) : [], dynamic: true, lite: !!lite };
      const b = Object.assign({ ok: true }, adaptBundle({ index: index || { regions: [] }, entry: { visibility: 'public' }, region, projects: { projects: [], otherBlocks: others }, buildings, context: null, infra: null, home: docs, homeFailed: !home.doc }));
      b.lite = lite ? { buildings: buildings.features.length, districts: (lite.districts || []).length, blocks: others.length, radiusM: lite.radiusM || 300 } : null;
      b.nearby = (Array.isArray(resolved.neighbors) ? resolved.neighbors : []).filter((x) => x && /^\d{10}$/.test(String(x.bjd)) && x.name).map((x) => ({ bjd: String(x.bjd), name: String(x.name) })).slice(0, 150);
      b.permits = null;
      return b;
    }
    const z = zoomForBbox(resolved.bbox) || 12;
    const projects = permitsToProjects(permits);
    const m0 = (permits && permits.meta) || {};
    const lost = (m0.unlocatedList || []).slice(0, 8);
    const blk = (m0.blockList || []).slice(0, 6);
    const lg = m0.ledger || {};
    const ledgerNote = [lg.blocksMatched || lg.parcelsRecovered || lg.completions ? `건축물대장으로 보강: 블록 단위 허가 ${lg.blocksMatched || 0}곳의 위치, 합필·분할로 사라진 지번 ${lg.parcelsRecovered || 0}곳의 현재 지번, 사용승인으로 준공 확인 ${lg.completions || 0}곳.` : '', lg.error ? `건축물대장 보강이 완전하지 않습니다: ${lg.error}.` : ''].filter(Boolean);
    const blockNote = m0.blockProjects ? [`공공주택지구 블록 단위 허가 ${m0.blockProjects}곳은 필지 번호가 없어(블록 번호만 있음) ${lg.used ? '건축물대장과 세대수·대지면적을 맞춰 보았지만 지번을 정하지 못해' : '위치를 정할 수 없어'} 지도에 없습니다: ${blk.map((x) => `${x.name}${x.block && !x.name.includes(x.block) ? `(${x.block})` : ''} ${x.units ? `${x.units}세대` : ''}`.trim()).join(', ')}${m0.blockProjects > blk.length ? ' 외' : ''}.`] : [];
    const im = (infra && infra.type === 'Infra' && infra.meta) || {};
    const infraNotes = [im.stopsSource === 'osm' ? `버스 정류장: 국토교통부 TAGO${im.seoulError ? '·서울시' : ''}에 이 지역 자료가 없어 OpenStreetMap 기준으로 보여 드립니다(누락이 있을 수 있습니다).` : '', im.stopsSource === 'seoul' ? '버스 정류소: 서울특별시 정류소정보조회 기준입니다(국토교통부 TAGO에는 서울 자료가 없습니다).' : '', im.seoulError ? `서울시 정류소: ${im.seoulError}.` : '', im.noBus ? '버스 정류소: 국토교통부 TAGO에 이 지역(서울 등)의 정류소 자료가 없어 교통 점검은 "자료 없음"입니다.' : '', im.schoolsError ? '신설예정 학교를 불러오지 못했습니다.' : '', im.stopsError ? `${im.stopsError}.` : ''].filter(Boolean);
    const infraLate = opts && opts.infraFailed ? ['기반시설(신설예정 학교·정류장)을 제때 불러오지 못해 입주 전 점검 없이 열었습니다. 잠시 뒤 다시 열면 나올 수 있습니다.'] : [];
    const notes = (lost.length ? [`건축HUB 인허가 사업 후보 중 필지를 못 찾아 지도에 없는 ${m0.unlocated}곳: ${lost.map((x) => `${x.name}(${x.jibun})`).join(', ')}${m0.unlocated > lost.length ? ' 외' : ''}. 원인 추정: ${[...new Set(lost.map((x) => x.reason))].join(' / ')}.`] : []).concat(blockNote, ledgerNote, infraNotes, infraLate);
    const region = {
      slug: '', name, notes, title: name, description: `${name}의 경계와 건물을 보여 줍니다. 공급 사업은 건축HUB 인허가 기록에서 요청 시 조회한 것만 있습니다.`,
      view: { center: resolved.center || [127.0, 37.5], zoom: Math.round(z * 10) / 10, pitch: 50, bearing: 0 }, sources: projects.length ? (projects.some((x) => x.sources.includes('hub-bldrgst')) ? [HUB_SOURCES[0], LEDGER_SOURCE, HUB_SOURCES[1]] : HUB_SOURCES) : [], zones: [],
    };
    const buildings = { type: 'FeatureCollection', meta: { basis: '', factor: {} }, features: [], dynamic: true };
    const b = Object.assign({ ok: true }, adaptBundle({ index: index || { regions: [] }, entry: { visibility: 'public' }, region, projects: { projects, otherBlocks: [] }, buildings, context: null, infra: hasInfra(infra) && projects.length ? infraOf(infra) : null }));
    b.nearby = (Array.isArray(resolved.neighbors) ? resolved.neighbors : []).filter((x) => x && /^\d{10}$/.test(String(x.bjd)) && x.name).map((x) => ({ bjd: String(x.bjd), name: String(x.name) })).slice(0, 150);   // 같은 시군구의 다른 법정동(빈 지역에서 고르게)
    const m = (permits && permits.meta) || {};
    b.permits = { fetched: !!(permits && permits.type === 'FeatureCollection'), count: projects.length, unlocated: m.unlocated || 0, truncated: !!m.truncated, records: m.records || 0, candidates: m.candidates || 0, blocks: m.blockProjects || 0, ledger: m.ledger || null };
    return b;
  }
  /* /api/v1/infra 응답 → 번들 infra.json 모양(schema_version·asOf·sources·schools·stops). 학교나 정류소가 하나도 없으면 쓰지 않는다 */
  const hasInfra = (d) => !!(d && d.type === 'Infra' && ((d.schools || []).length || (d.stops || []).length));
  const infraOf = (d) => ({ schema_version: '1.3.0', asOf: d.asOf, sources: d.sources || [], schools: d.schools || [], stops: d.stops || [] });
  /* 기반시설(신설예정 학교·정류장) 요청: 시간이 걸릴 수 있어 15초까지만 기다리고, 실패해도 지도는 열린다(null) */
  async function fetchInfra(win, bjd) {
    try {
      const res = await Promise.race([win.fetch(`api/v1/infra?bjd=${encodeURIComponent(bjd)}`), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 15000))]);
      if (!res.ok) return null;
      const d = await res.json();
      return d && d.type === 'Infra' ? d : null;
    } catch (e) { return null; }
  }
  /* 공공 모집 공고(마이홈) 요청: 사이드바를 늦게 채우므로 지도를 막지 않는다. 실패하면 null(구역을 숨김) */
  async function fetchNotices(win, sgg) {
    try {
      const res = await win.fetch(`api/v1/notices?sgg=${encodeURIComponent(sgg)}`);
      if (!res.ok) return null;
      const d = await res.json();
      return d && d.type === 'Notices' && Array.isArray(d.items) ? d : null;
    } catch (e) { return null; }
  }
  /* 공고 → 화면 줄(순수 함수): 제목 · 기관·유형·세대수 · 접수 기간 · 단지·주소 · 공고 링크(https 마이홈·LH 만) · 필지로 이동(pnu) */
  const md = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? `${iso.slice(5, 7)}.${iso.slice(8, 10)}` : '');
  function noticeRows(data) {
    const kind = { rental: '임대', sale: '분양' };
    return ((data && data.items) || []).filter((n) => n && n.title).map((n) => {
      const from = md(n.applyFrom), to = md(n.applyTo);
      return {
        id: String(n.id || ''), title: String(n.title),
        meta: [n.agency, `${kind[n.kind] || ''}${n.supplyType ? `(${n.supplyType})` : ''}`.trim(), n.housingType, n.units ? `${n.units}호` : ''].filter(Boolean).join(' · '),
        period: from && to ? `접수 ${from === to ? from : `${from}~${to}`}` : n.announcedAt ? `공고 ${n.announcedAt.replace(/-/g, '.')}` : '',
        place: [n.complex, n.address].filter(Boolean).join(' · '),
        url: /^https:\/\/(www\.myhome\.go\.kr|m\.myhome\.go\.kr|apply\.lh\.or\.kr)\//.test(n.url || '') ? n.url : '', pnu: /^\d{19}$/.test(n.pnu || '') ? n.pnu : '', fromLh: n.source === 'lh',
      };
    });
  }
  /* 건축HUB 인허가 요청: 실패해도 지도는 열린다(null) */
  async function fetchPermits(win, bjd) {
    try {
      const res = await win.fetch(`api/v1/permits?bjd=${encodeURIComponent(bjd)}`);
      if (!res.ok) return null;
      const d = await res.json();
      return d && d.type === 'FeatureCollection' && Array.isArray(d.features) ? d : null;
    } catch (e) { return null; }
  }
  /* 주소 ?permits=0 이면 번들 없는 지역에서 건축HUB 인허가 사업을 조회하지 않는다 */
  const permitsOff = (search) => new URLSearchParams(search || '').get('permits') === '0';
  /* 주소 ?dyn=0|1: 0 이면 건물을 요청 시 조회하지 않고, 1 이면 번들이 있는 지역에서도 번들 밖 건물을 요청 시 조회한다 */
  function dynParam(search) {
    const v = new URLSearchParams(search || '').get('dyn');
    return v === '0' ? 'off' : v === '1' ? 'on' : null;
  }

  /* 해석 경고(warnings) → 지도 위 한 줄 안내. 요청한 것과 다른 범위로 열렸을 때 조용히 넘기지 않는다(스펙 1.4) */
  const NOTICE_TEXT = {
    'parcel-not-found': '요청한 필지를 찾지 못해 법정동 경계로 열었습니다',
    'ri-uses-umd-boundary': '리(里) 경계는 없어 읍면동 경계로 표시합니다',
    'boundary-not-found': '경계를 찾지 못해 지역 기본 위치로 열었습니다',
    'geometry-unavailable': '경계를 불러오지 못해 지역 기본 위치로 열었습니다',
    'geometry-not-configured': '경계를 불러오지 못해 지역 기본 위치로 열었습니다',
    'project-unlocated': '이 사업의 위치(필지)가 아직 연결되지 않아 법정동 또는 시군구 경계로 열었습니다',
    'project-superseded': '합병되어 폐기된 사업 id 라서 남은 사업으로 열었습니다',
  };
  function noticeText(warnings) {
    return [...new Set((warnings || []).map((w) => NOTICE_TEXT[w]).filter(Boolean))].join(' · ');
  }
  const PROBLEM_TEXT = {
    'invalid-code': '코드 형식이 맞지 않습니다', 'unknown-code': '표준코드 표에 없는 코드입니다', 'unknown-project': '발급되지 않은 사업 id 입니다', 'unsupported-level': '시도 단위는 열 수 없습니다',
    'keys-exhausted': '오늘 코드 해석 한도에 닿았습니다. 잠시 뒤 다시 시도하세요', 'not-configured': '코드 해석 서비스가 설정되어 있지 않습니다', upstream: '코드 해석 서비스를 부르지 못했습니다',
  };
  /* /api/v1/resolve 호출 → { ok:true, data } | { ok:false, code, message } */
  async function resolveCode(f, cq, base) {
    let res;
    try { res = await f(resolveUrl(cq, base)); } catch (e) { return { ok: false, code: 'network', message: '코드 해석 서비스에 연결하지 못했습니다' }; }
    let body = null;
    try { body = await res.json(); } catch (e) { /* 본문 없음 */ }
    if (res.ok && body && body.coverage) return { ok: true, data: body };
    const code = (body && body.code) || (res.status === 404 || res.status === 405 ? 'unavailable' : 'upstream');
    return { ok: false, code, message: PROBLEM_TEXT[code] || '코드 해석 서비스를 쓸 수 없습니다', detail: body && body.detail ? String(body.detail) : '' };
  }

  /* ---------- 단지 변환 ---------- */
  function moveInText(moveIn, progressEnd, status) {
    const v = moveIn == null ? '' : String(moveIn).trim();
    if (/^\d{4}-\d{2}$/.test(v)) return v.replace('-', '.');
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `준공 예정 ${v}`;
    if (v) return v;
    if (status === '입주 단계') return '입주 일자 미상';   // 이미 입주한 단지에 '시기 미정'은 어색하다
    return progressEnd ? `준공 예정 ${progressEnd}` : '입주 시기 미정';
  }
  function outlineText(outline) {
    const base = OUTLINE_TEXT[outline.tier] || '';
    return outline.how ? `${base} (${outline.how})` : base;
  }
  function sourcesText(p, region) {
    const label = {};
    (region.sources || []).forEach((s) => { label[s.id] = s.label; });
    return (p.sources || []).map((id) => label[id] || id).join(' · ');
  }
  function adaptDongs(dongs) {
    const out = [];
    for (const d of dongs) {
      const above = finite(d.floorsAbove) && d.floorsAbove > 0 ? d.floorsAbove : null;
      const hasH = finite(d.heightM) && d.heightM > 0;
      if (above == null && !hasH) continue;   // 층수도 높이도 모르는 동은 3D 로 그리지 않는다
      out.push({ no: String(d.no), floors: above != null ? above : Math.max(1, Math.round(d.heightM / FLOOR_HEIGHT)), h: hasH ? d.heightM : undefined, tier: d.tier, poly: d.poly });
    }
    return out;
  }
  function adaptProject(p, region) {
    const dongs = Array.isArray(p.dongs) ? adaptDongs(p.dongs) : undefined;
    const pr = p.progress || null;
    const b = {
      id: p.label, pid: p.id, projectId: p.projectId || null, label: p.label, name: p.name, kind: p.kind, status: p.status,
      units: finite(p.units) ? p.units : 0, unitsKnown: finite(p.units),
      dongCount: finite(p.dongCount) ? p.dongCount : (dongs ? dongs.length : 0),
      moveIn: moveInText(p.moveIn, pr && pr.end, p.status),
      poly: p.outline.poly, outlineTier: p.outline.tier,
      sponsorClass: p.sponsorClass, priv: p.sponsorClass === 'private_on_public_land',
      src: sourcesText(p, region), outlineHow: outlineText(p.outline),
    };
    if (pr) {
      b.progress = { rate: pr.rate, asOf: pr.asOf, history: pr.history || [] };
      if (pr.start) b.progress.start = pr.start;
      if (pr.end) b.progress.end = pr.end;
      if (pr.source) b.progress.source = pr.source;
    }
    if (dongs) b.dongs = dongs;
    if (p.builder) b.builder = p.builder;
    if (finite(p.contractAmountM)) b.contractM = p.contractAmountM;
    if (p.note) b.note = p.note;
    if (p.pnu) { b.pnu = p.pnu; b.refs = p.refs || []; }   // 인허가 사업만(번들 단지에는 없다)
    const done = p.doneAt || (p.events || []).filter((e) => e && e.type === 'completion_inspection' && !e.suspect && !e.planned && /^\d{4}-\d{2}-\d{2}$/.test(e.date || '')).map((e) => e.date).sort().pop();
    if (done) b.doneAt = done;   // 마지막 실제 준공일(입주 경과 표지)
    if (p.overdue) b.overdue = p.overdue;   // 예정일이 지났는데 기록이 없음(인허가 사업)
    if (p.home) b.home = p.home;   // 수도권 원장 행의 계획·공고 확인 호수·위치 근거·정책 연결(homeToProjects)
    if (p.approx) b.approx = true;   // 이름 검색 근사 위치(속 빈 원 + 점선 표지)
    return b;
  }
  /* 입주 경과 표지(assets/js/settle.js): 지금 단계가 06 입주일 때만 'moving'·'settled'·'existing', 아니면·날짜가 없으면 null.
     원장이 붙었으면 원장 단계와 실제 준공 달(done)·입주예정월(MOVE_IN 일정)을, 아니면 단지의 마지막 실제 준공일을 쓴다 */
  function settleOf(b, now = Date.now()) {
    if (!Settle || !b) return null;
    const l = b.ledger;
    if (l && l.stage ? l.stage !== '06' : b.status !== '입주 단계') return null;
    const mv = l ? [l.next, l.overdue].find((e) => e && e.eventType === 'MOVE_IN' && e.planned) : null;
    return Settle.settledOf((l && l.done) || b.doneAt || null, (l && l.moveIn) || (mv ? String(mv.planned).slice(0, 7) : null), now);
  }
  function uniqueIds(blocks) {
    const seen = new Map();
    blocks.forEach((b) => {
      const n = (seen.get(b.label) || 0) + 1;
      seen.set(b.label, n);
      if (n > 1) b.id = `${b.label}·${n}`;
    });
  }
  function orderBlocks(blocks, pinned) {
    const pos = new Map((pinned || []).map((id, i) => [id, i]));
    const rank = (b) => { const i = STATUS_RANK.indexOf(b.status); return i < 0 ? STATUS_RANK.length : i; };
    return blocks.slice().sort((a, c) => {
      const pa = pos.has(a.pid) ? pos.get(a.pid) : Infinity, pc = pos.has(c.pid) ? pos.get(c.pid) : Infinity;
      if (pa !== pc) return pa < pc ? -1 : 1;
      return (rank(a) - rank(c)) || (c.units - a.units) || String(a.label).localeCompare(String(c.label), 'ko');
    });
  }

  /* ---------- 사업 원장(GET /api/v1/ledger?sgg=) — 지도 카드의 6단계·다음 일정·판정(기획서 M7·M8) ----------
     판정(cls)은 종합상황판과 같은 규칙으로 서버가 계산한 값이라 화면에서 다시 계산하지 않는다. 실패하면 null(원장 정보 없이 지도는 그대로) */
  async function fetchLedger(win, sgg) {
    try {
      const res = await win.fetch(`api/v1/ledger?sgg=${encodeURIComponent(sgg)}`);
      if (!res.ok) return null;
      const d = await res.json();
      return d && d.schema === 'ledger-map/1' && Array.isArray(d.projects) ? d : null;
    } catch (e) { return null; }
  }
  /* 단지 ↔ 원장 행: 사업 id(projectId) · 건축HUB 관리번호(refs ↔ pks) · 필지(pnu ↔ pnus) · 번들 단지 id('지역slug/단지id' ↔ bundles, 원장 식별자 BUNDLE_ID) 중 하나라도 같으면 같은 사업 */
  function ledgerIndex(rows) {
    const id = new Map(), pk = new Map(), pnu = new Map(), bundle = new Map();
    for (const r of rows) {
      if (!r || !r.id) continue;
      id.set(r.id, r);
      (r.pks || []).forEach((k) => pk.set(String(k), r));
      (r.pnus || []).forEach((k) => pnu.set(String(k), r));
      (r.bundles || []).forEach((k) => bundle.set(String(k), r));
    }
    return { id, pk, pnu, bundle };
  }
  function matchLedger(b, ix, slug) {
    return (b.projectId && ix.id.get(b.projectId)) || (b.refs || []).map((k) => ix.pk.get(String(k))).find(Boolean)
      || (b.pnu && ix.pnu.get(b.pnu)) || (slug && b.pid && ix.bundle.get(`${slug}/${b.pid}`)) || null;
  }
  /* 원장 응답들(시군구마다 하나) → 단지마다 b.ledger 를 붙이고 붙인 수를 돌려 준다. slug = 번들 지역(번들 없는 지역은 '') */
  function attachLedger(blocks, docs, slug) {
    const ok = (docs || []).filter((d) => d && Array.isArray(d.projects));
    if (!ok.length) return 0;
    const ix = ledgerIndex(ok.flatMap((d) => d.projects)), meta = ok[0];
    let n = 0;
    for (const b of blocks || []) {
      const r = matchLedger(b, ix, slug);
      if (!r) continue;
      b.ledger = { id: r.id, issued: !!r.issued, stage: /^0[1-6]$/.test(r.stage || '') ? r.stage : null, cls: ['ok', 'caution', 'delay'].includes(r.cls) ? r.cls : null,
        overdue: r.overdue || null, next: r.next || null, done: /^\d{4}-\d{2}/.test(r.done || '') ? String(r.done).slice(0, 7) : null,   // done: 마지막 실제 준공 달(원장 색인에 생기면 입주 경과 표지에 쓴다)
        moveIn: /^\d{4}-\d{2}/.test(r.moveIn || '') ? String(r.moveIn).slice(0, 7) : null,   // 현재 예정 입주 달(수도권 정적 자료에만 있다)
        month: meta.month, referenceDate: meta.referenceDate, origin: meta.origin };
      n++;
    }
    return n;
  }
  /* 원장 한 행 → 카드 문구. 일정은 월까지('YYYY-MM-DD'·'YYYY-MM' → 'YYYY.MM', 'YYYY' 는 그대로) */
  const EVENT_TEXT = { PERMIT: '인허가', CONSTRUCTION_START: '착공', SUPPLY_NOTICE: '모집 공고', COMPLETION: '준공', MOVE_IN: '입주' };
  const CLS_TEXT = { ok: '정상', caution: '주의', delay: '지연' };
  const ymText = (v) => { const m = /^(\d{4})(?:-(\d{2}))?/.exec(String(v || '')); return m ? (m[2] ? `${m[1]}.${m[2]}` : m[1]) : ''; };
  function ledgerTexts(l) {
    if (!l) return null;
    const ev = (e) => (e && EVENT_TEXT[e.eventType]) || '';
    const late = l.cls && l.cls !== 'ok' && l.overdue && ev(l.overdue) ? `${ev(l.overdue)} 예정 경과 ${l.overdue.months}개월` : '';
    /* 판정이 정상인데 예정일이 자료 기준일보다 앞서 있으면(한 달 미만 경과) 상태는 그대로 두고 '예정일 지남' 표지만 붙인다 */
    const pe = [l.overdue, l.next].find((e) => e && ev(e) && /^\d{4}-\d{2}-\d{2}/.test(e.planned || '')), pastDue = !!(pe && (!l.cls || l.cls === 'ok') && l.referenceDate && String(pe.planned).slice(0, 10) < String(l.referenceDate).slice(0, 10));
    return {
      ...(pastDue ? { pastDue, due: `${ev(pe)} 예정 ${String(pe.planned).slice(0, 10).replace(/-/g, '.')}` } : {}),
      cls: l.cls ? CLS_TEXT[l.cls] : '', late, lateTitle: late && l.overdue.planned ? `예정일 ${l.overdue.planned}` : '',
      next: l.next && ev(l.next) && ymText(l.next.planned) ? `${ev(l.next)} 예정 ${ymText(l.next.planned)}` : '',
      basis: `${l.origin === 'supabase' ? 'Supabase 원장' : '사업 원장'} ${l.month || ''} 기준`.replace(/\s+/g, ' '), refDate: l.referenceDate || '',
    };
  }
  /* ---------- 수도권(서울 11·인천 28·경기 41) 사업 원장 정적 자료 — 지도 개선 계획 3절·S3 ----------
     tools/ledger/home-map.js 가 원장 표와 HOME 원본 좌표로 만든 시군구 파일(data/board/home-map/<시군구>.json)을 scripts/build.js 가 assets/home-map/ 에
     내용 해시 이름으로 복사하고, 지도 페이지가 시군구→해시 표를 window.HOME_MAP 으로 넘긴다. 수도권 시군구는 /api/v1/permits·/api/v1/ledger·/api/v1/infra 를 부르지 않고
     이 파일 하나로 사업을 그린다(사업 = 원장 행, 단계·판정·다음 일정은 지도 색인과 같은 값). 번들 지역(계양)은 번들 단지(3D 동)를 배경으로 두고 상태를 원장 단계로 맞춘다 */
  const HOME_SIDO = ['11', '28', '41'];
  const isHomeSgg = (sgg) => /^\d{5}$/.test(String(sgg || '')) && HOME_SIDO.includes(String(sgg).slice(0, 2));
  /* 해시 표가 있으면 표의 이름(표에 없는 시군구는 사업이 없어 부르지 않는다 → null), 표가 없으면(옛 정적 페이지·시험) 해시 없는 이름 */
  function homeMapUrl(win, sgg) {
    const m = win && win.HOME_MAP;
    if (m && typeof m === 'object' && Object.keys(m).length) return /^[0-9a-f]{8}$/.test(m[sgg] || '') ? `assets/home-map/${sgg}.${m[sgg]}.json` : null;
    return `assets/home-map/${sgg}.json`;
  }
  /* → 파일 객체 | { sgg, projects: [] }(사업 없는 시군구) | null(받지 못함) */
  async function fetchHomeMap(win, sgg) {
    const url = homeMapUrl(win, sgg);
    if (!url) return { schema: 'home-map/1', sgg, projects: [] };
    try {
      const res = await win.fetch(url);
      if (res.status === 404) return { schema: 'home-map/1', sgg, projects: [] };
      if (!res.ok) return null;
      const d = await res.json();
      return d && d.schema === 'home-map/1' && Array.isArray(d.projects) ? Object.assign({ month: d.observedMonth, origin: 'home-map' }, d) : null;
    } catch (e) { return null; }
  }
  /* 수도권 경량 번들(tools/ledger/home-lite.js → data/board/home-lite → scripts/build.js 가 assets/home-lite/<시군구>.<해시8>.json 으로 복사): 사업 둘레 건물·지구 경계·블록 라벨점.
     표(window.HOME_LITE = { 시군구: { name, n, h? } }, 지도 페이지가 넘김)에 해시가 있는 시군구만 부른다. 표가 없으면(옛 정적 페이지·시험) 부르지 않는다 → null */
  function homeLiteUrl(win, sgg) {
    const m = win && win.HOME_LITE, e = m && typeof m === 'object' ? m[sgg] : null;
    return e && /^[0-9a-f]{8}$/.test(e.h || '') ? `assets/home-lite/${sgg}.${e.h}.json` : null;
  }
  async function fetchHomeLite(win, sgg) {
    const url = homeLiteUrl(win, sgg);
    if (!url) return null;
    try {
      const res = await win.fetch(url);
      if (!res.ok) return null;
      const d = await res.json();
      return d && d.schema === 'home-lite/1' && Array.isArray(d.buildings) ? d : null;
    } catch (e) { return null; }
  }
  /* 경량 번들 건물 줄([속성, 부호화한 도형]) → GeoJSON 피처. tools/ledger/home-lite.js encodeGeometry 의 역: 링마다 경위도×1e6 정수의 첫 점 + 차이(닫는 점 없음),
     MultiPolygon 은 { m: [...] }. 되돌린 좌표는 /api/v1/buildings 가 주는 좌표(소수 6자리)와 같은 수라 요청 시 조회와 겹침을 중심점으로 거를 수 있다 */
  function decodeRing(a) {
    const out = [];
    let x = 0, y = 0;
    for (let i = 0; i + 1 < a.length; i += 2) { x += a[i]; y += a[i + 1]; out.push([x / 1e6, y / 1e6]); }
    if (out.length) out.push(out[0].slice());
    return out;
  }
  function liteFeatures(rows) {
    const out = [];
    for (const row of rows || []) {
      if (!Array.isArray(row) || row.length !== 2 || !row[0] || typeof row[0] !== 'object') continue;
      const g = row[1], geometry = Array.isArray(g) ? { type: 'Polygon', coordinates: g.map(decodeRing) } : g && Array.isArray(g.m) ? { type: 'MultiPolygon', coordinates: g.m.map((p) => p.map(decodeRing)) } : null;
      if (geometry) out.push({ type: 'Feature', properties: Object.assign({}, row[0]), geometry });
    }
    return out;
  }
  /* 지역 선택기의 수도권 목록(HOME_LITE 표 → 시도별 묶음 '서울'·'인천'·'경기', 시군구 코드 순이라 시 아래 구가 바로 뒤에 온다). 사업이 없는 시군구는 뺀다.
     구가 있는 시의 시 단위 코드(41110 수원시 등 — 구를 정하지 못한 사업)는 '수원시(구 미정)'으로 구 항목과 구분한다 */
  const SIDO_SHORT = { 11: '서울', 28: '인천', 41: '경기' };
  const sggShort = (name) => String(name).replace(/^(서울특별시|인천광역시|경기도)\s*/, '');
  function homeSelectorGroups(table) {
    const rows = Object.entries(table && typeof table === 'object' ? table : {}).filter(([sgg, e]) => isHomeSgg(sgg) && e && e.n > 0 && e.name).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const cityWithGu = (sgg) => sgg.endsWith('0') && rows.some(([x]) => x !== sgg && x.slice(0, 4) === sgg.slice(0, 4));
    return HOME_SIDO.map((sido) => ({ sido, label: SIDO_SHORT[sido], options: rows.filter(([sgg]) => sgg.slice(0, 2) === sido)
      .map(([sgg, e]) => ({ value: `sgg:${sgg}`, sgg, name: sggShort(e.name), n: e.n, label: `${sggShort(e.name)}${cityWithGu(sgg) ? '(구 미정)' : ''} · ${e.n}건` })) })).filter((g) => g.options.length);
  }
  /* 지도에 그린 사업 지점들 → 첫 시점. 모두가 확대 minZ 이상의 한 화면에 들어가면 그 범위, 아니면 가장 많은 사업이 모인 곳(첫 화면에 건물이 보이게).
     사업이 하나면 그 사업(확대 16). px = 지도 가로 화소 */
  function homeView(points, px = 900, minZ = 14) {
    const pts = (points || []).filter((p) => Array.isArray(p) && p.length === 2 && p.every(finite));
    if (!pts.length) return null;
    const fit = (ps) => {
      const xs = ps.map((p) => p[0]), ys = ps.map((p) => p[1]), bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      const span = Math.max(bb[2] - bb[0], (bb[3] - bb[1]) * 1.6);
      return { center: [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2], zoom: ps.length === 1 || span < 1e-4 ? 16 : Math.min(16, zoomForBbox([0, 0, span, 0], px)) };
    };
    const done = (v) => ({ center: v.center.map((x) => Math.round(x * 1e6) / 1e6), zoom: Math.round(v.zoom * 10) / 10, pitch: 50, bearing: 0 });
    const all = fit(pts);
    if (all.zoom >= minZ) return done(all);
    const half = (px * 360) / (512 * 2 ** (minZ + 0.2)) / 2 * 0.9;   // 확대 minZ 화면의 반폭(경도)
    let best = null;
    for (const p of pts) { const near = pts.filter((q) => Math.abs(q[0] - p[0]) <= half && Math.abs(q[1] - p[1]) <= half * 0.6); if (!best || near.length > best.length) best = near; }
    const v = fit(best);
    return done({ center: v.center, zoom: best.length === 1 ? minZ + 1 : Math.max(minZ, v.zoom) });   // 홀로 떨어진 사업만 있으면 둘레가 보이게 한 단계 덜 당긴다
  }
  /* 원장 단계 → 지도 상태(색·거르기). 01·02 는 '사업화'(계획과 같은 색, 머리 줄 02 사업화 칸) */
  const STATUS_OF_STAGE = { '01': '사업화', '02': '사업화', '03': '계획', '04': '건설 단계', '05': '분양중', '06': '입주 단계' };
  const HOME_LOC_TEXT = { block: 'LH 블록 라벨점', address: '대표 지번 근사', district: '지구 대표점', name: '이름 검색 근사 위치', area: '시군구 대표점' };
  const HOME_DRAWN_M = { block: 45, address: 35, district: 45, name: 40 };   // 지도에 그리는 위치 종류와 표지 반지름(m). 시군구 대표점·위치 없음은 목록에만
  const APPROX_TITLE = '근사 위치 — 사업 이름으로 찾은 위치라 확인이 필요합니다';   // 이름 검색(tools/ledger/home-geocode.js)으로 찾은 위치: 겹원 표지(app.js approxRings)
  const HOME_SOURCE = { id: 'home-ledger', label: '사업 원장 · 위치는 LH 블록 라벨점·대표 지번·지구 대표점·이름 검색 근사(검토 중)' };
  const AGENCY_TEXT = { lh: 'LH', sh: 'SH', gh: 'GH' };
  const homeInfo = (r) => ({ units: finite(r.units) && r.units > 0 ? r.units : null, noticeUnits: finite(r.noticeUnits) ? r.noticeUnits : null,
    loc: r.loc && HOME_LOC_TEXT[r.loc.by] ? Object.assign({ by: r.loc.by, text: HOME_LOC_TEXT[r.loc.by], status: r.loc.status || 'REVIEW' }, r.loc.by === 'name' && r.loc.match ? { match: String(r.loc.match) } : {}) : null,
    policy: r.policy && r.policy.status ? { status: r.policy.status, names: Array.isArray(r.policy.names) ? r.policy.names.map(String) : [], short: Array.isArray(r.policy.short) ? r.policy.short.map(String) : [] } : null });
  /* 점 둘레 정팔각형(경도·위도) */
  function ring8(c, rM) {
    const dl = rM / 111320, dn = rM / (111320 * Math.cos(c[1] * Math.PI / 180)), out = [];
    for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * Math.PI * 2; out.push([Math.round((c[0] + Math.cos(a) * dn) * 1e7) / 1e7, Math.round((c[1] + Math.sin(a) * dl) * 1e7) / 1e7]); }
    return out;
  }
  /* 점 둘레 원(24각, 이름 검색 근사 표지) */
  function ring24(c, rM) {
    const dl = rM / 111320, dn = rM / (111320 * Math.cos(c[1] * Math.PI / 180)), out = [];
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; out.push([Math.round((c[0] + Math.cos(a) * dn) * 1e7) / 1e7, Math.round((c[1] + Math.sin(a) * dl) * 1e7) / 1e7]); }
    return out;
  }
  /* 원장 행 → 번들 단지 모양(adaptProject 입력). 그릴 위치가 없는 행은 unlocated. 같은 점에 여럿이면(지구 대표점 등) 점 둘레 원 위에 id 순으로 벌린다.
     skip(r) 이 참인 행(번들 단지와 이어진 행)은 뺀다 */
  function homeToProjects(docs, skip) {
    const rows = [].concat(...(docs || []).filter((d) => d && Array.isArray(d.projects)).map((d) => d.projects)).filter((r) => r && r.id && !(skip && skip(r)));
    const drawable = (r) => r.loc && HOME_DRAWN_M[r.loc.by] && Array.isArray(r.loc.at) && r.loc.at.length === 2 && r.loc.at.every(finite);
    const groups = new Map(), unlocated = [];
    for (const r of rows) { if (!drawable(r)) { unlocated.push(r); continue; } const k = r.loc.at.join(','); (groups.get(k) || groups.set(k, []).get(k)).push(r); }
    const projects = [];
    for (const rs of groups.values()) rs.forEach((r, i) => {
      const n = rs.length, R = n > 1 ? 60 + 15 * n : 0, a = i / n * Math.PI * 2 - Math.PI / 2, c0 = r.loc.at;
      const c = n > 1 ? [c0[0] + Math.cos(a) * R / (111320 * Math.cos(c0[1] * Math.PI / 180)), c0[1] + Math.sin(a) * R / 111320] : c0;
      const ym = /^(\d{4})-(\d{2})/.exec(r.completion || '');
      projects.push({
        id: `home-${r.id}`, projectId: r.id, label: String(r.label || r.name || r.id), name: String(r.name || r.label || r.id), sponsor: { type: r.agency ? 'public' : 'unknown', name: AGENCY_TEXT[r.agency] || '' },
        sponsorClass: r.agency ? 'public' : 'unknown', kind: AGENCY_TEXT[r.agency] || '공공주택 사업', status: STATUS_OF_STAGE[r.stage] || '사업화',
        units: finite(r.units) && r.units > 0 ? r.units : null, dongCount: 0,
        moveIn: /^\d{4}-\d{2}/.test(r.moveIn || '') ? String(r.moveIn).slice(0, 7) : ym ? `준공 예정 ${ym[1]}.${ym[2]}` : null,
        outline: r.loc.by === 'name' ? { tier: 'point', poly: ring24(c, HOME_DRAWN_M.name), how: `${APPROX_TITLE}${r.loc.match ? `(검색 일치: ${r.loc.match})` : ''}${n > 1 ? ` · 같은 점 ${n}곳을 벌려 놓음` : ''}` }
          : { tier: 'point', poly: ring8(c, HOME_DRAWN_M[r.loc.by]), how: `${HOME_LOC_TEXT[r.loc.by]} 둘레 표지${n > 1 ? `(같은 점 ${n}곳을 벌려 놓음)` : ''} · 위치 ${r.loc.status === 'CONFIRMED' ? '확인' : '검토 중'}` },
        dongs: null, events: [], sources: [HOME_SOURCE.id], home: homeInfo(r), ...(r.loc.by === 'name' ? { approx: true } : {}),
      });
    });
    projects.sort((a, b) => (a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0));
    return { projects, unlocated: unlocated.map((r) => ({ id: r.id, name: String(r.name || r.id), stage: /^0[1-6]$/.test(r.stage || '') ? r.stage : null, units: finite(r.units) && r.units > 0 ? r.units : null, loc: r.loc && HOME_LOC_TEXT[r.loc.by] ? HOME_LOC_TEXT[r.loc.by] : '' })), total: rows.length };
  }
  /* 원장 행 → 단계 칸(①~⑥)별 합계와 진행(①계획~④모집) 합계. 수도권 개요(lib/board/metro-overview.ts valuesBySgg)·사업 화면과 같은 정의:
     칸 = 원장 단계(01·02 → ①, 03 → ②, 04 → ③, 05 → ④, 06 → ⑤, 모르면 ①), 호수 = 계획 호수(없으면 호수 미확인 q 로 센다). 위치 미확보로 지도에 그리지 못한 사업도 센다(lost*).
     lostIds = 그리지 못한 사업 id(homeToProjects 의 unlocated). 같은 id 는 한 번만 */
  const BOARD_OF_STAGE = { '01': 0, '02': 0, '03': 1, '04': 2, '05': 3, '06': 4 };
  function homeTally(docs, lostIds) {
    const lost = new Set(lostIds || []), seen = new Set();
    const st = [0, 1, 2, 3, 4, 5].map(() => ({ n: 0, u: 0, q: 0, lostN: 0, lostU: 0 }));
    for (const d of docs || []) for (const r of (d && Array.isArray(d.projects) ? d.projects : [])) {
      if (!r || !r.id || seen.has(r.id)) continue;
      seen.add(r.id);
      const s = st[BOARD_OF_STAGE[r.stage] ?? 0], u = finite(r.units) && r.units > 0 ? r.units : 0;
      s.n += 1; if (u) s.u += u; else s.q += 1;
      if (lost.has(r.id)) { s.lostN += 1; s.lostU += u; }
    }
    const prog = st.slice(0, 4).reduce((t, s) => { for (const k of Object.keys(t)) t[k] += s[k]; return t; }, { n: 0, u: 0, q: 0, lostN: 0, lostU: 0 });
    return Object.assign(prog, { st });
  }
  /* 원장 행을 단지에 붙인다: b.ledger(attachLedger) + b.home + 상태를 원장 단계로(6절 결정 4: 번들 단지도 사업 표시는 원장 기준, 04 안의 '준공 임박'은 남긴다) */
  function applyHome(blocks, docs, slug) {
    const ok = (docs || []).filter((d) => d && Array.isArray(d.projects));
    const n = attachLedger(blocks, ok, slug);
    if (!n) return 0;
    const ix = ledgerIndex(ok.flatMap((d) => d.projects));
    for (const b of blocks || []) {
      const r = matchLedger(b, ix, slug), st = r && STATUS_OF_STAGE[r.stage];
      if (!r) continue;
      if (!b.home) b.home = homeInfo(r);
      if (finite(r.units) && r.units > 0 && !(b.unitsKnown !== false && b.units === r.units)) {   // 호수는 원장 계획 호수가 기준(번들은 분양분만 셀 수 있다) — 번들 값은 보조 줄로
        if (b.unitsKnown !== false && b.units > 0) b.bundleUnits = b.units;
        b.units = r.units; b.unitsKnown = true;
      }
      if (st && !(r.stage === '04' && b.status === '준공 임박')) b.status = st;
      b.statusBy = 'ledger';
    }
    return n;
  }

  /* 원장을 부를 시군구: 번들 지역은 region.json 의 시군구, 코드로 열었으면 해석 결과의 시군구도 */
  const ledgerSggs = (r, resolved) => [...new Set([...((r && r.sggs) || []), ...(resolved && /^\d{5}$/.test(resolved.sgg || '') ? [resolved.sgg] : [])])];
  /* 주소 ?ledger=0 이면 원장을 부르지 않는다 */
  const ledgerOff = (search) => new URLSearchParams(search || '').get('ledger') === '0';

  /* ---------- 문구 ---------- */
  function buildTexts(region, blocks, context, infra) {
    const tiers = new Set();
    blocks.forEach((b) => { tiers.add(b.outlineTier); (b.dongs || []).forEach((d) => tiers.add(d.tier)); });
    const phrases = TIER_ORDER.filter((t) => tiers.has(t)).map((t) => OUTLINE_TEXT[t]);
    const tierSentence = phrases.length ? `${phrases.join(', ')}입니다.` : '';
    const label = {};
    (region.sources || []).forEach((s) => { label[s.id] = s.label; });
    const progressLabels = [...new Set(blocks.filter((b) => b.progress && b.progress.source).map((b) => label[b.progress.source]).filter(Boolean))];
    const progressSentence = progressLabels.length ? `공정율은 ${progressLabels.join(', ')} 기준입니다.` : '';
    const ctxSentence = context ? `역·학교는 ${/OpenStreetMap/.test(context.source || '') ? 'OpenStreetMap' : (context.source || '출처 미상')}입니다.` : '';
    const infraSentence = infra && infra.asOf ? `기반시설 점검 자료는 ${infra.asOf} 기준 공개 자료입니다.` : '';
    const parts = [tierSentence, progressSentence, ctxSentence, infraSentence, ...(region.notes || [])].filter(Boolean).join(' ');
    return {
      documentTitle: `주택파동 공급 지도 (${region.name})`,
      eyebrow: region.title,
      description: region.description || '',
      footerHtml: `건물 © 국토교통부 GIS건물통합정보 (V-World)<br><span id="basis">-</span> 기준${parts ? `<details class="fnote"><summary>자료 안내</summary>${escapeHtml(parts)}</details>` : ''}`,   // 윤곽·공정율·출처 설명은 길어서 접어 둔다
    };
  }

  /* ---------- 번들 전체 변환 ---------- */
  function adaptBundle(raw) {
    const { index, entry, projects, buildings, context, infra } = raw;
    let region = raw.region, list = projects.projects || [], home = null;
    /* 수도권 원장 자료(raw.home = 시군구 파일들): 번들 단지와 이어지지 않은 원장 사업은 대표점 표지로 더하고, 붙일 수 있는 원장 행은 모두 붙인다 */
    if (Array.isArray(raw.home)) {
      const bundleKeys = new Set(list.map((p) => `${region.slug}/${p.id}`)), ids = new Set(list.map((p) => p.projectId).filter(Boolean));
      home = homeToProjects(raw.home, (r) => ids.has(r.id) || (r.bundles || []).some((k) => bundleKeys.has(String(k))));
      if (home.projects.length) { list = list.concat(home.projects); region = Object.assign({}, region, { sources: [...(region.sources || []), HOME_SOURCE] }); }
    }
    let blocks = list.map((p) => adaptProject(p, region));
    if (home) applyHome(blocks, raw.home, region.slug);
    blocks = orderBlocks(blocks, region.projectOrder);
    uniqueIds(blocks);   // 구분 접미사(·2)는 화면에 보이는 순서를 따른다
    const districts = (region.zones || []).filter((z) => Array.isArray(z.poly) && z.poly.length >= 3).map((z) => ({ name: z.name, poly: z.poly }));
    const byKey = new Map();
    blocks.forEach((b) => { byKey.set(b.id, b); byKey.set(b.pid, b); });
    return {
      slug: region.slug, name: region.name, title: region.title, description: region.description || '',
      sggs: (region.codes || []).filter((c) => c && c.type === 'sigungu' && /^\d{5}$/.test(c.code)).map((c) => c.code),   // 사업 원장을 부를 시군구
      visibility: (entry && entry.visibility) || 'public', view: region.view, statusOrder: region.statusOrder,
      sources: region.sources || [], zones: region.zones || [], districts,
      blocks, otherBlocks: projects.otherBlocks || [], hasPrivate: blocks.some((b) => b.priv),
      GY_BUILDINGS: buildings,
      GY_PROJECTS: { blocks, district: districts[0] || null, districts, otherBlocks: projects.otherBlocks || [], meta: {} },
      GY_CONTEXT: context || null,
      GY_INFRA: infra || null,
      texts: buildTexts(region, blocks, context || null, infra || null),
      regions: (index && index.regions) || [],
      resolveBlock: (param) => (param ? byKey.get(String(param)) || null : null),
      home: home ? { total: (raw.home || []).reduce((s, d) => s + ((d && d.projects) || []).length, 0), drawn: blocks.filter((b) => b.home).length, unlocated: home.unlocated, failed: !!raw.homeFailed,
        tally: homeTally(raw.home, home.unlocated.map((r) => r.id)) } : null,
    };
  }

  /* ---------- 불러오기 ---------- */
  async function loadRegion(opts) {
    const f = opts.fetch, base = opts.base || 'regions/';
    const getJson = async (url, optional) => {
      let res;
      try { res = await f(url); } catch (e) { throw new Error(`${url}: ${e.message}`); }
      if (!res.ok) {
        if (optional && res.status === 404) return null;
        throw new Error(`${url}: HTTP ${res.status}`);
      }
      try { return await res.json(); } catch (e) { throw new Error(`${url}: JSON을 읽을 수 없음 (${e.message})`); }
    };
    const index = await getJson(base + 'index.json');
    const pick = pickRegion(index, opts.search);
    if (pick.error) return { ok: false, error: pick.error, requested: pick.requested, regions: pick.regions, index };
    const dir = String(index.dataBase || base).replace(/\/?$/, '/') + pick.region.slug + '/';
    const region = await getJson(dir + 'region.json');
    /* opts.home(region) → 수도권 원장 자료 Promise(번들 파일과 함께 받는다) */
    const [projects, buildings, context, infra, home] = await Promise.all([getJson(dir + 'projects.json'), getJson(dir + 'buildings.json'), getJson(dir + 'context.json', true), pick.region.infra === false ? null : getJson(dir + 'infra.json', true), opts.home ? opts.home(region) : null]);
    return Object.assign({ ok: true }, adaptBundle({ index, entry: pick.region, region, projects, buildings, context, infra, ...(home ? { home: home.docs, homeFailed: home.failed } : {}) }));
  }

  /* ---------- 화면 반영(브라우저 전용) ---------- */
  function applyTexts(doc, r) {
    doc.title = r.texts.documentTitle;
    const meta = doc.querySelector('meta[name="description"]');
    if (meta && r.texts.description) meta.setAttribute('content', r.texts.description);
    const eb = doc.querySelector('.eyebrow');
    if (eb) eb.textContent = r.texts.eyebrow;
    const foot = doc.querySelector('.foot');
    if (foot) foot.innerHTML = r.texts.footerHtml;
  }
  function mountSelector(doc, r, win) {
    const box = doc.getElementById('regionBox'), sel = doc.getElementById('regionSel');
    if (!box || !sel) return;
    const m = selectorModel({ regions: r.regions }, r.slug), groups = homeSelectorGroups(win && win.HOME_LITE);
    if (!m.visible && !groups.length) return;
    /* 수도권 시군구(사업 원장 사업이 있는 곳, 시도별)를 먼저, 상세 3D 지역(regions/ 지역 자료)은 맨 아래 '상세 3D 지역' 묶음에.
       수도권 시군구와 같은 곳의 상세 3D 지역(인천 계양구)은 한 항목으로 합쳐 그 지역 자료로 연다(그 지역도 사업은 원장으로 붙는다). 수도권 시군구를 고르면 ?sgg= 로 연다 */
    const cur = !r.slug && win && win.RESOLVED && win.RESOLVED.sgg ? `sgg:${win.RESOLVED.sgg}` : '';
    const merged = new Set();
    const homeGroups = groups.map((g) => ({ label: g.label, options: g.options.map((o) => {
      const b = m.options.find((x) => x.label === `${g.label} ${o.name}`);
      if (!b) return o;
      merged.add(b.value);
      return { value: b.value, sgg: o.sgg, label: `${o.label} · 상세 3D`, selected: b.selected };
    }) }));
    const rest = m.options.filter((o) => !merged.has(o.value));
    const on = (o) => !!o.selected || o.value === cur || (!!o.sgg && `sgg:${o.sgg}` === cur);
    const listed = homeGroups.some((g) => g.options.some(on)) || rest.some(on);
    const none = !listed ? `<option value="" selected disabled hidden>${escapeHtml(r.name)}</option>` : '';   // 목록에 없는 지역은 현재 값을 따로 보인다
    const opt = (o) => `<option value="${escapeHtml(o.value)}"${on(o) ? ' selected' : ''}>${escapeHtml(o.label)}</option>`;
    sel.innerHTML = none + (groups.length ? homeGroups.map((g) => `<optgroup label="${escapeHtml(g.label)}">${g.options.map(opt).join('')}</optgroup>`).join('') + (rest.length ? `<optgroup label="상세 3D 지역">${rest.map(opt).join('')}</optgroup>` : '')
      : m.options.map(opt).join(''));
    sel.addEventListener('change', () => { win.location.assign(/^sgg:\d{5}$/.test(sel.value) ? codeUrl(win.location.href, 'sgg', sel.value.slice(4)) : regionUrl(win.location.href, sel.value)); });
    box.hidden = false;
  }
  /* 안내 띠: 한 줄 요약(brief)만 보이고 누르면 전체 문장을 편다(2026-10-10 피드백, 주소 입력줄 아래 반투명 띠 — goto.js 가 옮긴다).
     요약이 없거나 전체와 같으면 전체 한 줄 */
  function mountBanner(doc, r, notice, brief) {
    const el = doc.getElementById('pvBanner');
    const pre = r.visibility === 'preview';
    const text = [pre ? '미리보기 — 공개 전 자료입니다' : '', notice || ''].filter(Boolean).join(' · ');
    if (!el || !text) return;
    const short = [pre ? '미리보기' : '', brief || notice || ''].filter(Boolean).join(' · ');
    el.innerHTML = short === text ? `<span class="pv-s">${escapeHtml(text)}</span>`
      : `<details class="pv-d"><summary class="pv-s">${escapeHtml(short)}</summary><p class="pv-f">${escapeHtml(text)}</p></details>`;
    el.hidden = false;
  }
  /* 위치 안내 한 줄(#locNote): ?project= 로 연 사업이 위치 미확보(시군구 전체로 열림)거나 근사 위치일 때 지도 위에 눈에 띄게, 닫을 수 있게.
     작은 요약 띠(pvBanner)에 섞으면 놓친다(2026-10-14 재평가) */
  function locNoteHtml(x) {
    if (!x) return '';
    const name = `<b>${escapeHtml(x.name)}</b>`;
    return x.approx ? `${name} · 근사 위치 — 사업 이름으로 찾은 위치라 실제 사업지와 다를 수 있습니다`
      : `${name} · 위치 미확보 — 지도에 표시할 위치가 없어 시군구 전체를 보여 줍니다. <a href="/projects?id=${encodeURIComponent(x.id)}">사업 정보 보기</a>`;
  }
  function mountLocNote(doc, x) {
    const el = doc.getElementById('locNote'), t = doc.getElementById('locNoteText'), btn = doc.getElementById('locNoteX');
    const html = locNoteHtml(x);
    if (!el || !t || !html) return;
    t.innerHTML = html; el.hidden = false;
    if (btn) btn.addEventListener('click', () => { el.hidden = true; });
  }
  /* 안내 띠의 한 줄 요약: 번들 없는 지역은 무엇을 보여 주는지만 짧게(전체 문장은 mountResolved 의 baseNote). 번들 지역의 경고는 짧아서 그대로 */
  function bannerBrief(r, warnings) {
    const pm = r.permits, warn = noticeText(warnings);
    if (r.slug) return warn;
    if (r.home) return [warn ? `위치 안내 ${warn.split(' · ').length}건` : '', r.home.failed ? '사업 원장을 불러오지 못함' : `사업 원장 ${r.home.total}건 · 지도 ${r.home.drawn}건`].filter(Boolean).join(' · ');
    const found = pm && pm.ledger ? pm.ledger.blocksMatched + pm.ledger.parcelsRecovered : 0;
    const extra = [found ? `대장으로 찾음 ${found}` : '', pm && pm.unlocated ? `제외 ${pm.unlocated}` : ''].filter(Boolean).join(' · ');
    const base = pm && pm.count ? `인허가 사업 ${pm.count}곳${extra ? ` (${extra})` : ''}`
      : pm && pm.fetched && pm.blocks ? `블록 단위 인허가 ${pm.blocks}곳은 지도에 못 그림`
      : pm && pm.fetched ? '이 법정동 인허가 사업 없음'
      : '경계·건물만';
    return [warn ? `위치 안내 ${warn.split(' · ').length}건` : '', base].filter(Boolean).join(' · ');
  }
  function showFatal(doc, html) {
    const f = doc.getElementById('fatal'), l = doc.getElementById('loading');
    if (l) l.hidden = true;
    if (f) { f.innerHTML = html; f.hidden = false; }
  }
  /* 코드 해석이 안 될 때 보여 줄 지역 목록 링크(index 를 못 읽으면 빈 문자열) */
  async function regionLinks(win) {
    try {
      const idx = await (await win.fetch('regions/index.json')).json();
      const items = (idx.regions || []).map((x) => `<li><a href="?region=${encodeURIComponent(x.slug)}">${escapeHtml(x.name)}</a></li>`).join('');
      return items ? `<ul>${items}</ul>` : '';
    } catch (e) { return ''; }
  }
  /* 불러와 전역에 올리고 문구·지역 선택기·배너를 반영한다. 실패하면 안내 화면을 보이고 {ok:false} 를 돌려 준다. */
  async function boot(win, doc) {
    let r, search = win.location.search, resolved = null;
    const cq = codeQuery(search);
    if (cq) {
      const rr = await resolveCode((u) => win.fetch(u), cq);
      if (!rr.ok) {
        showFatal(doc, `<p>${escapeHtml(rr.message)}</p>${rr.detail ? `<p><code>${escapeHtml(rr.detail)}</code></p>` : ''}${await regionLinks(win)}`);
        return { ok: false, error: 'code', code: rr.code };
      }
      resolved = rr.data;
      if (resolved.coverage.tier !== 'A') {
        /* 번들이 없는 지역(등급 B·C): 경계와 요청 시 조회한 건물만 보이는 빈 번들로 연다. ?dyn=0 이면 건물도 없이 경계만 */
        /* 수도권 시군구는 사업 원장 정적 자료 하나만 받는다(인허가 후보를 사업으로 그리지 않고, 인허가 결과로 만드는 기반시설 점검도 부르지 않는다 — 3절·S3) */
        const home = isHomeSgg(resolved.sgg);
        const ledgerP = home || ledgerOff(search) ? null : Promise.all(ledgerSggs(null, resolved).map((s) => fetchLedger(win, s)));   // 인허가와 함께 받는다(기다리지 않음)
        const [idx, homeDoc, homeLite] = await Promise.all([getIndex(win), home ? fetchHomeMap(win, resolved.sgg) : null, home ? fetchHomeLite(win, resolved.sgg) : null]);
        const permits = !home && resolved.bjd && !permitsOff(search) ? await fetchPermits(win, resolved.bjd) : null;
        const wantInfra = !!(permits && permits.features && permits.features.length) && new URLSearchParams(search).get('infra') !== '0';   // 인허가 단지가 있어야 점검할 대상이 있다
        const infra = wantInfra ? await fetchInfra(win, resolved.bjd) : null;   // 서버가 인허가를 CDN 에서 이어 받으므로 인허가 다음에
        r = emptyBundle(resolved, idx, permits, infra, { infraFailed: wantInfra && !infra, home: home ? { doc: homeDoc, lite: homeLite } : null, px: mapPx(win) });
        if (dynParam(search) === 'off') r.GY_BUILDINGS.dynamic = false;
        mountResolved(win, doc, r, resolved);
        hangLedger(win, r, ledgerP);
        return r;
      }
      search = withRegion(search, resolved.coverage.slug);
    }
    /* 수도권 번들 지역(계양): 원장 정적 자료를 번들 파일과 함께 받아 단지에 붙인다(?ledger=0 이면 번들 그대로). 받지 못한 시군구는 원장 API 로 */
    const homeOf = ledgerOff(search) ? null : async (region) => {
      const sggs = [...new Set([...(region.codes || []).filter((c) => c && c.type === 'sigungu').map((c) => String(c.code)), ...(resolved && resolved.sgg ? [resolved.sgg] : [])])].filter(isHomeSgg);
      if (!sggs.length) return null;
      const docs = await Promise.all(sggs.map((s) => fetchHomeMap(win, s)));
      return { docs: docs.filter(Boolean), got: sggs.filter((_, i) => docs[i]), failed: docs.some((d) => !d) };
    };
    let homeGot = [];
    try {
      r = await loadRegion({ fetch: (u) => win.fetch(u), search, home: homeOf && ((region) => homeOf(region).then((h) => { homeGot = h ? h.got : []; return h; })) });
    } catch (e) {
      showFatal(doc, `<p>지역 자료를 불러오지 못했습니다.</p><p><code>${escapeHtml(e.message)}</code></p>`);
      return { ok: false, error: 'load', message: e.message };
    }
    if (!r.ok) {
      const links = (r.regions || []).map((x) => `<li><a href="?region=${encodeURIComponent(x.slug)}">${escapeHtml(x.name)}</a></li>`).join('');
      showFatal(doc, `<p>${r.error === 'unknown' ? `‘${escapeHtml(r.requested)}’ 지역을 찾을 수 없습니다.` : '볼 수 있는 지역이 없습니다.'}</p>${links ? `<ul>${links}</ul>` : ''}`);
      return r;
    }
    /* 번들이 있는 지역: 코드로 열었거나 ?dyn=1 이면 번들 밖 건물도 요청 시 조회한다(번들은 지구 주변만 담은 지역이 있음) */
    const dyn = dynParam(search);
    if (r.GY_BUILDINGS && dyn !== 'off' && (dyn === 'on' || resolved)) r.GY_BUILDINGS.dynamic = true;
    mountResolved(win, doc, r, resolved);
    const rest = ledgerSggs(r, resolved).filter((s) => !homeGot.includes(s));
    hangLedger(win, r, ledgerOff(search) || !rest.length ? null : Promise.all(rest.map((s) => fetchLedger(win, s))));
    return r;
  }
  /* 원장은 지도 첫 표시를 기다리게 하지 않는다: 받는 대로 단지에 붙이고, 화면(app.js)은 window.LEDGER(붙인 단지 수)를 기다려 다시 그린다 */
  function hangLedger(win, r, p) {
    win.LEDGER = p ? p.then((docs) => attachLedger(r.blocks, docs, r.slug), () => 0) : null;
  }
  /* 전역에 올리고 문구·지역 선택기·배너를 반영 */
  function mountResolved(win, doc, r, resolved) {
    win.GY_BUILDINGS = r.GY_BUILDINGS; win.GY_PROJECTS = r.GY_PROJECTS; win.GY_CONTEXT = r.GY_CONTEXT; win.GY_INFRA = r.GY_INFRA; win.REGION = r;
    const hit = resolved && ((resolved.pnu && r.blocks.find((b) => b.pid === `hub-${resolved.pnu}`))   // 필지로 열었는데 그 필지가 인허가 사업이면 그 단지를 연다
      || (resolved.project && resolved.project.block && r.blocks.find((b) => b.pid === resolved.project.block))   // 사업 id 가 번들 단지의 것이면 그 단지를 연다
      || (resolved.project && resolved.project.id && r.blocks.find((b) => b.projectId === resolved.project.id)));   // 수도권 원장 사업 id 면 그 표지를 연다
    /* 수도권 시군구(번들 없음): ?sgg= 는 사업들이 모인 곳(homeView)에서, 위치가 있는 사업 ?project= 는 그 표지에서 바로 연다(시군구 전체를 거치지 않음).
       표지로 열면 '위치가 연결되지 않음' 경고는 내리고, 근사 위치면 그렇다고 알린다. 위치가 없는 사업은 시군구 경계로 열고 목록에서 그 사업을 강조한다(app.js) */
    const capital = !!(resolved && r.home && !r.slug);
    const start = capital && hit ? { center: hit.poly.reduce((a, p) => [a[0] + p[0] / hit.poly.length, a[1] + p[1] / hit.poly.length], [0, 0]), zoom: 16.5, pitch: 58, bearing: -10 }
      : capital && resolved.type === 'sgg' && r.view ? { center: r.view.center, zoom: r.view.zoom } : resolvedStart(resolved);
    const warns = resolved ? (resolved.warnings || []).filter((w) => !(hit && w === 'project-unlocated')) : [];
    const lost = capital && resolved.project && !hit ? (r.home.unlocated || []).find((x) => x.id === resolved.project.id) || { id: resolved.project.id, name: resolved.project.name || resolved.project.id } : null;
    win.RESOLVED = resolved ? { sgg: resolved.sgg, bjd: resolved.bjd || null, start, shape: resolvedShape(resolved), name: resolved.name, level: resolved.level, type: resolved.type, parcel: !!(resolved.parcel && resolved.parcel.geometry), projectId: resolved.project ? resolved.project.id : null, tier: resolved.coverage.tier, warnings: warns, block: hit ? hit.pid : null, approx: !!(hit && hit.approx), lost: lost ? { id: lost.id, name: lost.name } : null } : null;
    const pm = r.permits;
    const hm = r.home;
    const baseNote = r.slug ? '' : hm ? (hm.failed ? '사업 원장 자료를 불러오지 못해 경계와 건물(요청 시 조회)만 보여 줍니다'
      : `사업 원장 ${hm.total}건 중 ${hm.drawn}건을 대표점(블록·대표 지번·지구 대표점·근사 위치)에 표시합니다. 표시한 점은 사업 경계가 아닙니다. 위치 미확보 ${hm.unlocated.length}건은 목록에만 둡니다`)
      : pm && pm.count ? `상세 3D 자료가 없어 경계·건물(요청 시 조회)·건축HUB 인허가 사업 ${pm.count}곳만 보여 줍니다${pm.ledger && (pm.ledger.blocksMatched + pm.ledger.parcelsRecovered) ? `(건축물대장으로 위치를 찾은 ${pm.ledger.blocksMatched + pm.ledger.parcelsRecovered}곳 포함${pm.unlocated ? `, 필지를 못 찾은 ${pm.unlocated}곳 제외` : ''})` : pm.unlocated ? `(필지를 못 찾은 ${pm.unlocated}곳 제외)` : ''}`
      : pm && pm.fetched && pm.blocks ? `상세 3D 자료가 없어 경계와 건물(요청 시 조회)만 보여 줍니다. 이 법정동의 건축HUB 인허가는 공공주택지구 블록 단위 ${pm.blocks}곳뿐이라 필지 번호가 없어 ${pm.ledger && pm.ledger.used ? '건축물대장과 맞춰 보아도 지번을 정하지 못해 ' : ''}지도에 그릴 수 없습니다`
      : pm && pm.fetched ? `상세 3D 자료가 없어 경계와 건물(요청 시 조회)만 보여 줍니다. 건축HUB 주택인허가에 이 법정동의 공동주택 사업이 없습니다(기록 ${pm.records}건) — 이웃 법정동에 있을 수 있습니다`
      : '상세 3D 자료가 없어 경계와 건물(요청 시 조회)만 보여 줍니다';
    const notes = [resolved ? noticeText(warns) : '', baseNote].filter(Boolean).join(' · ');
    applyTexts(doc, r); mountSelector(doc, r, win); mountBanner(doc, r, notes, bannerBrief(r, warns));
    mountLocNote(doc, capital && hit && hit.approx ? { name: hit.name, approx: true } : lost ? { id: lost.id, name: lost.name } : null);
    mountCrumbs(win, doc, r, resolved);
  }
  /* 상세 지도 위 경로(수도권 › 시도 › 시군구): 수도권 시군구일 때만. 앞 둘은 수도권 개요로 가는 링크(/map · /map?sido=NN), 마지막은 지금 지역(링크 없음) */
  function crumbsOf(sgg, name) {
    if (!isHomeSgg(sgg)) return null;
    const sido = String(sgg).slice(0, 2), here = name ? sggShort(name) : '';
    return [{ label: '수도권', href: '/map' }, { label: SIDO_SHORT[sido], href: `/map?sido=${sido}` }, ...(here ? [{ label: here }] : [])];
  }
  function crumbsHtml(list) {
    return (list || []).map((c, i) => `${i ? '<span class="cr-sep" aria-hidden="true">›</span>' : ''}${c.href ? `<a href="${escapeHtml(c.href)}">${escapeHtml(c.label)}</a>` : `<span aria-current="page">${escapeHtml(c.label)}</span>`}`).join('');
  }
  /* 시군구: 코드로 열었으면 그 시군구, 지역 번들(계양)이면 번들의 시군구. 이름은 수도권 표(HOME_LITE) → 시군구로 연 해석 이름 순 */
  function mountCrumbs(win, doc, r, resolved) {
    const el = doc && doc.getElementById && doc.getElementById('mapCrumbs');
    if (!el) return;
    const sgg = resolved && resolved.sgg ? String(resolved.sgg) : ((r && r.sggs) || []).find(isHomeSgg) || '';
    const lite = win && win.HOME_LITE && win.HOME_LITE[sgg];
    const list = crumbsOf(sgg, (lite && lite.name) || (resolved && resolved.type === 'sgg' ? resolved.name : '') || '');
    el.innerHTML = list ? crumbsHtml(list) : '';
    el.hidden = !list;
  }
  /* 지도 가로 화소(사이드바를 뺀 대강의 값) — 첫 시점 계산용 */
  const mapPx = (win) => { const w = Number(win && win.innerWidth) || 1200; return Math.max(360, w > 900 ? w - 400 : w); };
  async function getIndex(win) {
    try { return await (await win.fetch('regions/index.json')).json(); } catch (e) { return { regions: [] }; }
  }

  return { HOME_SIDO, isHomeSgg, crumbsOf, crumbsHtml, mountCrumbs, homeMapUrl, fetchHomeMap, homeLiteUrl, fetchHomeLite, liteFeatures, homeSelectorGroups, homeView, APPROX_TITLE, homeToProjects, applyHome, homeTally, STATUS_RANK, escapeHtml, pickRegion, selectorModel, regionUrl, codeQuery, resolveUrl, withRegion, codeUrl, resolvedStart, resolvedShape, resolveCode, noticeText, zoomForBbox, emptyBundle, dynParam, permitsToProjects, fetchPermits, fetchInfra, fetchLedger, ledgerIndex, matchLedger, attachLedger, ledgerTexts, settleOf, ledgerSggs, fetchNotices, noticeRows, moveInText, outlineText, adaptDongs, adaptProject, orderBlocks, buildTexts, adaptBundle, loadRegion, applyTexts, mountSelector, mountBanner, bannerBrief, locNoteHtml, boot };
});
