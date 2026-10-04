/* 지역 번들 로더와 어댑터.
   regions/<slug>/*.json(번들)을 화면 코드(app.js)가 쓰는 전역 모양(GY_BUILDINGS · GY_PROJECTS · GY_CONTEXT)으로 바꾼다.
   순수 함수는 node --test 로 시험한다(tests/js/region.test.cjs). DOM 은 applyTexts · mount* · boot 에서만 만진다.
   필드 정의와 변환 규칙의 정본: docs/data-interface/번들-어댑터-정의서.md */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RegionLoader = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STATUS_RANK = ['분양중', '건설 단계', '준공 임박', '입주 단계', '계획'];
  const OUTLINE_TEXT = { official: '블록 윤곽은 공식 자료', building: '동 윤곽은 실제 건물 자료', schematic: '동 윤곽은 근사값(10~20 m)' };
  const TIER_ORDER = ['official', 'building', 'schematic'];
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
    u.searchParams.set('region', slug);
    return u.toString();
  }

  /* ---------- 단지 변환 ---------- */
  function moveInText(moveIn, progressEnd) {
    const v = moveIn == null ? '' : String(moveIn).trim();
    if (/^\d{4}-\d{2}$/.test(v)) return v.replace('-', '.');
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `준공 예정 ${v}`;
    if (v) return v;
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
      id: p.label, pid: p.id, label: p.label, name: p.name, kind: p.kind, status: p.status,
      units: finite(p.units) ? p.units : 0, unitsKnown: finite(p.units),
      dongCount: finite(p.dongCount) ? p.dongCount : (dongs ? dongs.length : 0),
      moveIn: moveInText(p.moveIn, pr && pr.end),
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
    return b;
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

  /* ---------- 문구 ---------- */
  function buildTexts(region, blocks, context) {
    const tiers = new Set();
    blocks.forEach((b) => { tiers.add(b.outlineTier); (b.dongs || []).forEach((d) => tiers.add(d.tier)); });
    const phrases = TIER_ORDER.filter((t) => tiers.has(t)).map((t) => OUTLINE_TEXT[t]);
    const tierSentence = phrases.length ? `${phrases.join(', ')}입니다.` : '';
    const label = {};
    (region.sources || []).forEach((s) => { label[s.id] = s.label; });
    const progressLabels = [...new Set(blocks.filter((b) => b.progress && b.progress.source).map((b) => label[b.progress.source]).filter(Boolean))];
    const progressSentence = progressLabels.length ? `공정율은 ${progressLabels.join(', ')} 기준입니다.` : '';
    const ctxSentence = context ? `역·학교는 ${/OpenStreetMap/.test(context.source || '') ? 'OpenStreetMap' : (context.source || '출처 미상')}입니다` : '';
    const parts = [tierSentence, progressSentence, ctxSentence].filter(Boolean).join(' ');
    return {
      documentTitle: `주택파동 공급 지도 (${region.name})`,
      eyebrow: region.title,
      description: region.description || '',
      footerHtml: `건물 © 국토교통부 GIS건물통합정보 (V-World)<br><span id="basis">-</span> 기준${parts ? ' · ' + escapeHtml(parts) : ''}`,
    };
  }

  /* ---------- 번들 전체 변환 ---------- */
  function adaptBundle(raw) {
    const { index, entry, region, projects, buildings, context } = raw;
    let blocks = (projects.projects || []).map((p) => adaptProject(p, region));
    uniqueIds(blocks);
    blocks = orderBlocks(blocks, region.projectOrder);
    const districts = (region.zones || []).filter((z) => Array.isArray(z.poly) && z.poly.length >= 3).map((z) => ({ name: z.name, poly: z.poly }));
    const byKey = new Map();
    blocks.forEach((b) => { byKey.set(b.id, b); byKey.set(b.pid, b); });
    return {
      slug: region.slug, name: region.name, title: region.title, description: region.description || '',
      visibility: (entry && entry.visibility) || 'public', view: region.view, statusOrder: region.statusOrder,
      sources: region.sources || [], zones: region.zones || [], districts,
      blocks, otherBlocks: projects.otherBlocks || [], hasPrivate: blocks.some((b) => b.priv),
      GY_BUILDINGS: buildings,
      GY_PROJECTS: { blocks, district: districts[0] || null, districts, otherBlocks: projects.otherBlocks || [], meta: {} },
      GY_CONTEXT: context || null,
      texts: buildTexts(region, blocks, context || null),
      regions: (index && index.regions) || [],
      resolveBlock: (param) => (param ? byKey.get(String(param)) || null : null),
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
    const [projects, buildings, context] = await Promise.all([getJson(dir + 'projects.json'), getJson(dir + 'buildings.json'), getJson(dir + 'context.json', true)]);
    return Object.assign({ ok: true }, adaptBundle({ index, entry: pick.region, region, projects, buildings, context }));
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
    const m = selectorModel({ regions: r.regions }, r.slug);
    if (!m.visible) return;
    sel.innerHTML = m.options.map((o) => `<option value="${escapeHtml(o.value)}"${o.selected ? ' selected' : ''}>${escapeHtml(o.label)}</option>`).join('');
    sel.addEventListener('change', () => { win.location.assign(regionUrl(win.location.href, sel.value)); });
    box.hidden = false;
  }
  function mountBanner(doc, r) {
    const el = doc.getElementById('pvBanner');
    if (el && r.visibility === 'preview') { el.textContent = '미리보기 — 공개 전 자료입니다'; el.hidden = false; }
  }
  function showFatal(doc, html) {
    const f = doc.getElementById('fatal'), l = doc.getElementById('loading');
    if (l) l.hidden = true;
    if (f) { f.innerHTML = html; f.hidden = false; }
  }
  /* 불러와 전역에 올리고 문구·지역 선택기·배너를 반영한다. 실패하면 안내 화면을 보이고 {ok:false} 를 돌려 준다. */
  async function boot(win, doc) {
    let r;
    try {
      r = await loadRegion({ fetch: (u) => win.fetch(u), search: win.location.search });
    } catch (e) {
      showFatal(doc, `<p>지역 자료를 불러오지 못했습니다.</p><p><code>${escapeHtml(e.message)}</code></p>`);
      return { ok: false, error: 'load', message: e.message };
    }
    if (!r.ok) {
      const links = (r.regions || []).map((x) => `<li><a href="?region=${encodeURIComponent(x.slug)}">${escapeHtml(x.name)}</a></li>`).join('');
      showFatal(doc, `<p>${r.error === 'unknown' ? `‘${escapeHtml(r.requested)}’ 지역을 찾을 수 없습니다.` : '볼 수 있는 지역이 없습니다.'}</p>${links ? `<ul>${links}</ul>` : ''}`);
      return r;
    }
    win.GY_BUILDINGS = r.GY_BUILDINGS; win.GY_PROJECTS = r.GY_PROJECTS; win.GY_CONTEXT = r.GY_CONTEXT; win.REGION = r;
    applyTexts(doc, r); mountSelector(doc, r, win); mountBanner(doc, r);
    return r;
  }

  return { STATUS_RANK, escapeHtml, pickRegion, selectorModel, regionUrl, moveInText, outlineText, adaptDongs, adaptProject, orderBlocks, buildTexts, adaptBundle, loadRegion, applyTexts, mountSelector, mountBanner, boot };
});
