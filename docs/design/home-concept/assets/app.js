/* HOME 개념 흡수 시안 v2 — 공용 스크립트. 숫자는 모두 assets/data.json(build-data.mjs 가 원장·HOME 덤프·통계누리에서 만든 스냅샷)에서 계산한다.
   테마·메뉴, 칩 줄(선택 상태는 주소 쿼리), 데이터 그리드(정렬·검색·줄무늬), 요구사항 꼬리표, 화면별 그리기(사업·지역 공급·데이터 원본)를 맡는다.
   클래스 문자열은 앱 컴포넌트(components/ui/*, components/page.tsx, components/projects/*, components/charts/*)에서 옮겼다.
   Tailwind 가 이 파일도 스캔하므로 클래스는 조각을 이어 붙이지 않고 온전한 이름으로 쓴다(색은 style 로). */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const DOC = document.documentElement;
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const ymDot = (d) => (d ? (d.length >= 7 ? `${d.slice(0, 4)}.${d.slice(5, 7)}` : d) : '');
  const dayDot = (d) => (d ? d.slice(0, 10).replace(/-/g, '.') : '');
  const monthNo = (d) => Number(d.slice(0, 4)) * 12 + (d.length >= 7 ? Number(d.slice(5, 7)) - 1 : 11);
  const ymOfNo = (n) => `${Math.floor(n / 12)}.${String((n % 12) + 1).padStart(2, '0')}`;
  const monthLabel = (ym) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월`;

  /* ---------- 아이콘(lucide 같은 선) ---------- */
  const ICON = {
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-up': '<path d="m18 15-6-6-6 6"/>',
    'chevrons-up-down': '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
    search: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
    menu: '<path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h16"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  };
  const icon = (n, cls) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}" aria-hidden="true">${ICON[n]}</svg>`;

  /* ---------- 단계(종합상황판 리본 이름 · 단계색) ---------- */
  const ST = [
    { n: '계획', c: 'var(--st-plan)', ink: 'var(--st-plan-ink)', off: '01 정책 · 02 사업화' },
    { n: '인허가', c: 'var(--st-permit)', ink: 'var(--st-permit-ink)', off: '03 인허가' },
    { n: '착공', c: 'var(--st-build)', ink: 'var(--st-build-ink)', off: '04 건설(착공~준공 공사 기간)' },
    { n: '모집', c: 'var(--st-sale)', ink: 'var(--st-sale-ink)', off: '05 공급' },
    { n: '준공', c: 'var(--st-soon)', ink: 'var(--st-soon-ink)', off: '04 건설 끝(사용검사)' },
    { n: '입주', c: 'var(--st-move)', ink: 'var(--st-move-ink)', off: '06 입주' },
  ];
  const CIR = ['①', '②', '③', '④', '⑤', '⑥'];
  const EV = { PERMIT: '인허가', CONSTRUCTION_START: '착공', SUPPLY_NOTICE: '모집', COMPLETION: '준공', MOVE_IN: '입주' };
  const EV_BOARD = { PERMIT: 1, CONSTRUCTION_START: 2, SUPPLY_NOTICE: 3, COMPLETION: 4, MOVE_IN: 5 };
  const STAGE_EVENTS = ['PERMIT', 'CONSTRUCTION_START', 'SUPPLY_NOTICE', 'COMPLETION', 'MOVE_IN'];
  const light = (c, p = 28) => `color-mix(in srgb,${c} ${p}%,var(--card))`;
  const HATCH = '[background:repeating-linear-gradient(45deg,color-mix(in_srgb,var(--muted-foreground)_30%,transparent)_0_2px,transparent_2px_7px)]';
  const HATCH_SW = '[background:repeating-linear-gradient(45deg,color-mix(in_srgb,var(--muted-foreground)_45%,transparent)_0_1.5px,transparent_1.5px_3.5px)]';

  /* ---------- 공통 조각 ---------- */
  const KPI_CARD = 'border border-border bg-card text-card-foreground shadow-[var(--shadow-card)] card-soft @container flex min-w-0 flex-col gap-1.5 rounded-[12px] px-4 py-3.5';
  const kpiInner = ({ label, value, unit = '호', sub, tone }) =>
    `<span class="flex min-w-0 items-center gap-1.5 truncate text-[14px] text-muted-foreground"><i class="block size-[9px] flex-none rounded-[3px] bg-line2"${tone ? ` style="background:${tone}"` : ''} aria-hidden="true"></i>${label}</span>`
    /* 값과 보조 줄을 한 줄에(넓은 칸에서 오른쪽이 비지 않게). 좁으면 보조 줄이 아래로 내려간다 */
    + `<span class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5"><b class="font-display text-[min(30px,15cqi)] leading-[1.2] font-normal whitespace-nowrap tabular-nums" data-kpi-value>${value}${unit ? `<small class="ml-[3px] font-sans text-[14px] font-normal text-muted-foreground">${unit}</small>` : ''}</b>`
    + (sub ? `<span class="text-[13px] text-muted-foreground tabular-nums">${sub}</span>` : '') + '</span>';
  const kpi = (o) => `<div class="${KPI_CARD}"${o.tip ? ` title="${esc(o.tip)}"` : ''}>${kpiInner(o)}</div>`;
  const badge = (t, tip) => `<span data-slot="badge" class="inline-block rounded-full border border-line2 px-[9px] text-[12px] leading-[22px] font-bold whitespace-nowrap text-muted-foreground"${tip ? ` title="${esc(tip)}"` : ''}>${t}</span>`;
  const prov = '<span data-slot="badge" class="ml-1.5 inline-block rounded-full border border-warn px-1.5 text-[11px] leading-[18px] font-bold whitespace-nowrap text-warn" title="통계누리가 잠정치로 낸 달을 포함">잠정</span>';
  const legend = (list) => `<ul class="m-0 flex list-none flex-wrap items-center gap-x-2.5 gap-y-0.5 p-0 text-[13px] text-muted-foreground" aria-label="범례">${list.map((x) => `<li class="flex items-center gap-1 whitespace-nowrap"${x.tip ? ` title="${esc(x.tip)}"` : ''}><i class="block size-[9px] flex-none rounded-[2px] ${x.cls || ''}"${x.style ? ` style="${x.style}"` : ''} aria-hidden="true"></i>${x.label}</li>`).join('')}</ul>`;
  /* 빈칸 표지: 짧게. 기준선 없음 = 회색, 자료 없음 = 글자만(같은 표지가 반복되는 칸·줄은 그리지 않고 머리에서 한 번만 말한다) */
  const markGray = (t, tip) => `<span class="inline-block rounded-[4px] bg-muted px-1.5 text-[12px] leading-[18px] whitespace-nowrap text-muted-foreground"${tip ? ` title="${esc(tip)}"` : ''}>${t}</span>`;
  const markNone = (t = '자료 없음', tip) => `<span class="text-[13px] whitespace-nowrap text-muted-foreground"${tip ? ` title="${esc(tip)}"` : ''}>${t}</span>`;
  const dash = (tip) => `<span class="text-muted-foreground"${tip ? ` title="${esc(tip)}"` : ''}>–</span>`;
  const stageChip = (s) => `<span class="inline-block rounded-full px-2 text-[12px] leading-[19px] font-bold whitespace-nowrap" style="background:${light(ST[s].c, 16)};color:${ST[s].ink}" title="공식 단계 ${ST[s].off}">${CIR[s]} ${ST[s].n}</span>`;
  const niceMax = (v) => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p; return 10 * p; };
  const man = (v) => (v === 0 ? '0' : v >= 10000 ? `${+(v / 10000).toFixed(1)}만` : fmt(v));
  const PANEL_LINK = 'group/action inline-flex flex-none items-center gap-px rounded-[4px] text-[14px] leading-[1.45] whitespace-nowrap text-muted-foreground no-underline underline-offset-[3px] transition-colors hover:text-primary hover:underline focus-visible:text-primary focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
  const panelLink = (href, text, full) => `<a href="${href}" title="${esc(full)}" class="${PANEL_LINK}"><span>${text}</span>${icon('chevron-right', 'size-3.5 shrink-0 transition-transform group-hover/action:translate-x-0.5 motion-reduce:transition-none')}</a>`;
  const POPITEM = 'btn-reset block w-full rounded-[8px] px-3 py-1.5 text-left text-[14px] whitespace-nowrap hover:bg-pn2 aria-pressed:bg-accent aria-pressed:font-bold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary';

  /* ---------- 상태(판정) ---------- */
  const STATUS = {
    ok: { n: '정상', sw: 'bg-ok', tip: '현재 예정일이 지나지 않음', sort: 4 },
    caution: { n: '주의', sw: 'bg-warn', tip: '현재 예정일 경과 1~6개월', sort: 2 },
    delay: { n: '지연', sw: 'border-2 border-bad', tip: '현재 예정일 경과 6개월 이상', sort: 1 },
    long: { n: '장기 지연', sw: 'bg-bad', tip: '현재 예정일 경과 12개월 이상', sort: 0 },
    none: { n: '일정 없음', sw: `border border-line2 ${HATCH_SW}`, tip: '판정할 현재 예정일이 없음', sort: 3 },
  };
  const statusCell = (k) => `<span class="inline-flex items-center gap-1.5" title="${STATUS[k].tip}"><i class="block size-[10px] flex-none rounded-full ${STATUS[k].sw}" aria-hidden="true"></i><span class="${k === 'delay' || k === 'long' ? 'text-bad' : k === 'none' ? 'text-muted-foreground' : ''}">${STATUS[k].n}</span></span>`;

  /* ---------- 테마 · 메뉴 ---------- */
  function wireShell() {
    const t = $('[data-theme-toggle]');
    if (t) {
      t.setAttribute('aria-pressed', String(DOC.classList.contains('dark')));
      t.addEventListener('click', () => {
        const next = !DOC.classList.contains('dark');
        DOC.classList.toggle('dark', next);
        try { localStorage.setItem('theme', next ? 'dark' : 'light'); } catch (_) { /* 저장소를 못 써도 이번 화면에서는 바뀐다 */ }
        t.setAttribute('aria-pressed', String(next));
      });
    }
    const m = $('[data-menu-toggle]'), list = $('#main-menu-list');
    if (m && list) m.addEventListener('click', () => {
      const open = m.getAttribute('aria-expanded') !== 'true';
      m.setAttribute('aria-expanded', String(open));
      list.classList.toggle('mobile:block', open);
      m.innerHTML = icon(open ? 'x' : 'menu', 'size-[20px]');
    });
  }

  /* ---------- 칩 줄: 선택 상태 = 주소 쿼리 ---------- */
  const S = {}, DEF = {};
  const opts = (g) => $$(`[data-chips="${g}"] [data-val]`);
  /* data-multi 묶음: 값 = 켜진 값들을 칩 순서대로 쉼표로 이은 것 */
  const isMulti = (g) => !!$(`[data-chips="${g}"][data-multi]`);
  const multiNorm = (g, list) => opts(g).map((b) => b.dataset.val).filter((x) => list.includes(x)).join(',');
  function paintChips(g) {
    const v = S[g], on = isMulti(g) ? v.split(',') : [v];
    opts(g).forEach((b) => b.setAttribute('aria-pressed', String(on.includes(b.dataset.val))));
    $$(`[data-chips="${g}"] [data-pop]`).forEach((p) => {
      const showDef = $(`[data-chips="${g}"]`).hasAttribute('data-show-def');
      const sel = $$('[data-val]', p).find((b) => b.dataset.val === v && (showDef || b.dataset.val !== DEF[g]));
      $('[data-pop-btn]', p).setAttribute('aria-pressed', String(!!sel));
      $('[data-pop-label]', p).textContent = sel ? sel.textContent.trim() : p.dataset.pop;
    });
  }
  function readUrl() {
    const q = new URLSearchParams(location.search);
    $$('[data-chips]').forEach((g) => {
      const k = g.dataset.chips;
      DEF[k] = g.dataset.default ?? '';
      const v = q.get(k);
      if (isMulti(k)) { const n = v === null ? '' : multiNorm(k, v.split(',')); S[k] = n || DEF[k]; } else S[k] = v !== null && opts(k).some((b) => b.dataset.val === v) ? v : DEF[k];
      paintChips(k);
    });
  }
  function writeUrl() {
    const q = new URLSearchParams(location.search);
    Object.keys(DEF).forEach((k) => { if (S[k] === DEF[k]) q.delete(k); else q.set(k, S[k]); });
    const s = q.toString();
    history.replaceState(null, '', (s ? `?${s}` : location.pathname) + location.hash);
  }
  const closePops = () => $$('[data-pop-menu]').forEach((m) => { m.hidden = true; m.previousElementSibling.setAttribute('aria-expanded', 'false'); });
  function setState(g, v) {
    const el = $(`[data-chips="${g}"]`);
    if (isMulti(g)) { const cur = S[g].split(','), n = multiNorm(g, cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]); if (!n) return; S[g] = n; } else S[g] = el && el.hasAttribute('data-toggle') && S[g] === v ? DEF[g] : v;
    paintChips(g); writeUrl(); emit();
  }
  let page = null;
  const emit = () => page && page.update && page.update(S);
  function wireChips() {
    document.addEventListener('click', (e) => {
      const pb = e.target.closest('[data-pop-btn]');
      if (pb) { const menu = pb.nextElementSibling, open = menu.hidden; closePops(); menu.hidden = !open; pb.setAttribute('aria-expanded', String(open)); return; }
      const b = e.target.closest('[data-chips] [data-val]');
      if (b) { closePops(); setState(b.closest('[data-chips]').dataset.chips, b.dataset.val); return; }
      const set = e.target.closest('[data-set]');
      if (set) { const [g, v] = set.dataset.set.split(':'); setState(g, v); return; }
      if (!e.target.closest('[data-pop]')) closePops();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePops(); });
  }
  const fillPop = (key, list) => { const el = $(`[data-pop-fill="${key}"]`); if (el) el.innerHTML = list.map(([v, l, tip]) => `<button type="button" data-val="${esc(v)}" aria-pressed="false" class="${POPITEM}"${tip ? ` title="${esc(tip)}"` : ''}>${esc(l)}</button>`).join(''); };

  /* ---------- 데이터 그리드(components/ui/data-grid.tsx 모양) ---------- */
  const ZEBRA = 'bg-[color-mix(in_srgb,var(--pn2)_45%,var(--card))]';
  const TH_BASE = 'sticky top-0 z-[2] border-b border-border bg-muted px-2.5 py-2.5 text-[14px] font-bold whitespace-nowrap text-muted-foreground';
  const TD_BASE = 'border-b border-border px-2.5 py-2.5 whitespace-nowrap';
  const STICKY_TD = 'sticky left-0 z-[1] bg-inherit group-data-[scrolled]/grid:shadow-[6px_0_6px_-6px_rgb(0_0_0/0.25)]';
  const STICKY_TH = 'left-0 z-[3] group-data-[scrolled]/grid:shadow-[6px_0_6px_-6px_rgb(0_0_0/0.25)]';
  const SORT_BTN = 'inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 font-[inherit] text-inherit hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
  /* cols: {key,label,text?,sort?,head?,tip?,clip?(최대 폭 — 한 줄 말줄임)} · rows: {id,cells:{key:html},v:{key:정렬값},pin?,href?,attrs?} · onRow(tr): 행 누름(없으면 href 로 이동) */
  function grid({ label, cols, rows, maxHeight, sortable = true, dense = false, search: forceSearch }) {
    const body = rows.filter((r) => !r.pin);
    const search = forceSearch ?? body.length > 30;
    const head = cols.map((c, i) => {
      const can = sortable && c.sort !== false;
      const align = i === 0 || c.text ? 'text-left' : 'text-right';
      return `<th scope="col"${can ? ' aria-sort="none"' : ''} data-kind="${c.text ? 'text' : 'num'}" class="${TH_BASE} ${align} ${i === 0 ? STICKY_TH : ''}"${c.tip ? ` title="${esc(c.tip)}"` : ''}>`
        + (can ? `<button type="button" data-sort="${i}" title="눌러서 정렬" class="${SORT_BTN}">${c.label}${icon('chevrons-up-down', 'size-3.5 shrink-0 opacity-40')}</button>` : c.label)
        + (c.head || '') + '</th>';
    }).join('');
    const line = (r, i) => `<tr data-row${r.pin ? ` data-pin="${r.pin}"` : ''} data-i="${i}"${r.href ? ` data-href="${r.href}"` : ''}${r.attrs || ''} class="hover:bg-pn2 data-[sel]:bg-accent data-[target]:outline-2 data-[target]:-outline-offset-2 data-[target]:outline-primary ${r.pin ? '[&_td]:bg-muted [&_td]:font-bold' : i % 2 ? ZEBRA : 'bg-card'} ${r.href ? 'cursor-pointer' : ''}">`
      + cols.map((c, k) => {
        const v = r.v && r.v[c.key] !== undefined ? ` data-v="${esc(r.v[c.key])}"` : '';
        const align = k === 0 || c.text ? 'text-left' : 'text-right';
        const cell = r.cells[c.key] ?? dash();
        return `<td${v} class="${TD_BASE} ${align} ${k === 0 ? STICKY_TD : ''}">${c.clip ? `<span class="block truncate" style="max-width:${c.clip}">${cell}</span>` : cell}</td>`;
      }).join('') + '</tr>';
    const top = rows.filter((r) => r.pin === 'top').map((r) => line(r, -1)).join('');
    const mid = body.map(line).join('');
    return `<div data-slot="data-grid" data-grid${dense ? ' class="[&_table]:text-[13px] [&_table]:leading-[1.5] [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-[13px] [&_td]:px-2 [&_td]:py-1.5"' : ''}>`
      + (search ? `<div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5"><label class="relative block w-full max-w-[320px]">${icon('search', 'pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground')}<input type="search" data-grid-search placeholder="이 표에서 찾기" aria-label="${esc(label)} 안에서 찾기" class="h-10 w-full rounded-[10px] border-[1.5px] border-line2 bg-card pr-3 pl-9 text-[15px] text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"></label><span data-grid-count class="text-[14px] text-muted-foreground tabular-nums" aria-live="polite">${body.length}건</span></div>` : '')
      + `<div data-slot="table-container" class="group/grid mt-2 overflow-x-auto rounded-[10px] border border-border${maxHeight ? ' overflow-y-auto' : ''}"${maxHeight ? ` style="max-height:${maxHeight}px"` : ''}><table aria-label="${esc(label)}" class="w-full border-collapse text-[16px] leading-[1.6] tabular-nums [&_a]:text-foreground [&_a]:no-underline [&_a:hover]:underline"><thead><tr>${head}</tr></thead><tbody class="[&_tr:last-child_td]:border-b-0">${top}${mid}<tr data-empty hidden><td colspan="${cols.length}" class="${TD_BASE} text-center whitespace-normal text-muted-foreground">맞는 행이 없습니다</td></tr></tbody></table></div></div>`;
  }
  function restripe(root) {
    let k = 0;
    $$('tr[data-row]:not([data-pin])', root).forEach((r) => {
      r.hidden = r.dataset.f === '1' || r.dataset.s === '1';
      if (r.hidden) return;
      r.classList.toggle(ZEBRA, k % 2 === 1); r.classList.toggle('bg-card', k % 2 === 0); k++;
    });
    const empty = $('tr[data-empty]', root); if (empty) empty.hidden = k > 0;
    const n = $('[data-grid-count]', root);
    if (n) { const all = $$('tr[data-row]:not([data-pin])', root).filter((r) => r.dataset.f !== '1').length; n.textContent = k === all ? `${all}건` : `${k}건 / ${all}건`; }
    return k;
  }
  function wireGrid(root, onRow) {
    const table = $('table', root), tbody = table.tBodies[0];
    const box = $('[data-slot=table-container]', root);
    box.addEventListener('scroll', () => box.toggleAttribute('data-scrolled', box.scrollLeft > 0));
    $$('[data-sort]', root).forEach((btn) => btn.addEventListener('click', () => {
      const th = btn.closest('th'), i = +btn.dataset.sort, cur = th.getAttribute('aria-sort');
      const text = th.dataset.kind === 'text';
      const first = text ? 'ascending' : 'descending', second = text ? 'descending' : 'ascending';
      const next = cur === 'none' ? first : cur === first ? second : 'none';
      $$('th[aria-sort]', table).forEach((h) => { h.setAttribute('aria-sort', 'none'); h.classList.remove('text-foreground'); const b = $('[data-sort]', h); b.lastElementChild.outerHTML = icon('chevrons-up-down', 'size-3.5 shrink-0 opacity-40'); });
      th.setAttribute('aria-sort', next);
      if (next !== 'none') { th.classList.add('text-foreground'); btn.lastElementChild.outerHTML = icon(next === 'ascending' ? 'chevron-up' : 'chevron-down', 'size-3.5 shrink-0'); }
      const rows = $$('tr[data-row]:not([data-pin])', tbody);
      const val = (r) => { const td = r.children[i]; const v = td.dataset.v ?? td.textContent.trim(); return v === '' ? null : (Number.isNaN(+v) ? v : +v); };
      rows.sort((a, b) => {
        if (next === 'none') return a.dataset.i - b.dataset.i;
        const va = val(a), vb = val(b);
        if (va === null) return 1; if (vb === null) return -1;
        const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'ko', { numeric: true });
        return next === 'ascending' ? c : -c;
      });
      const anchor = $('tr[data-pin="bottom"]', tbody) || $('tr[data-empty]', tbody);
      rows.forEach((r) => tbody.insertBefore(r, anchor));
      restripe(root);
    }));
    const q = $('[data-grid-search]', root);
    if (q) q.addEventListener('input', () => {
      const n = q.value.toLowerCase().replace(/\s+/g, '');
      $$('tr[data-row]:not([data-pin])', tbody).forEach((r) => { r.dataset.s = n && !r.textContent.toLowerCase().replace(/\s+/g, '').includes(n) ? '1' : '0'; });
      restripe(root);
    });
    tbody.addEventListener('click', (e) => {
      if (e.target.closest('a, button, input')) return;
      const tr = e.target.closest('tr[data-row]');
      if (tr && onRow) onRow(tr); else if (tr && tr.dataset.href) location.href = tr.dataset.href;
    });
  }
  const mountGrid = (el, o) => { el.innerHTML = grid(o); const g = $('[data-grid]', el); wireGrid(g, o.onRow); return g; };

  /* ================= 자료 ================= */
  let D = null;
  const SIDO_SHORT = (code) => (D.sido[code] ?? code);
  /* '경기도 수원시 권선구' → '경기 수원시 권선구'(표는 짧게), 시도 화면 안에서는 시도를 뺀다 */
  const sggLabel = (name, sido, drop = false) => { const t = name.split(' '); if (t.length < 2) return name; return drop ? t.slice(1).join(' ') : `${SIDO_SHORT(sido)} ${t.slice(1).join(' ')}`; };
  const AGENCY_TIP = { LH: '한국토지주택공사', SH: '서울주택도시공사', GH: '경기주택도시공사', 기타: '시행 기관 미확인(HOME 원천에 기관 없음)' };

  /* 머리 줄 기준일(meta) */
  function paintMeta() {
    const m = D.meta;
    const set = (key, text, tip) => $$(`[data-meta="${key}"]`).forEach((el) => { el.textContent = text; if (tip) el.title = tip; });
    const ref = dayDot(m.referenceDate);
    set('index', `원장 ${ymDot(m.ledgerMonth)} · 덤프 ${dayDot(m.dumpDate)} 판`, `사업 원장 ${m.ledgerMonth}(기준일 ${m.referenceDate}) · HOME 덤프 ${m.dumpEdition} · 통계누리 ${m.molitThrough}까지`);
    set('index-note', `수도권 HOME 사업 ${fmt(D.fill.base)}건 · 원장 사업 ${fmt(D.fill.ledgerProjects)}건 · 요구사항 ${D.requirements.length}개 — 숫자는 모두 assets/data.json(build-data.mjs)에서 계산`);
    set('projects', `원장 ${ref}`, `사업 원장 ${m.ledgerMonth} · 기준일 ${m.referenceDate} · 수도권 HOME 사업(덤프 ${m.dumpEdition}, 대체 사업 제외) · 판정: 현재 예정일 경과 ${m.judge.caution}~${m.judge.delay}개월 주의, ${m.judge.delay}개월 이상 지연, ${m.longDelayMonths}개월 이상 장기 지연`);
    set('report', `원장 ${ref} · 정책 ${ymDot(m.policyThrough)}`, `사업 원장 ${m.referenceDate} · 9·7 단계 목표·확인은 ${m.policyThrough}까지(policy-progress samePeriod) · 범위 서울·인천·경기`);
    set('region', `예정 ${ymDot(m.calendarFrom)}~${ymDot(m.calendarTo)} · 실적 ${ymDot(m.molitThrough)}`, `앞으로 12개월(${monthLabel(m.calendarFrom)} ~ ${monthLabel(m.calendarTo)}) · 원장 기준일 ${m.referenceDate} · 통계누리 실적 ${m.molitThrough}까지`);
    set('sources', `수집 ${dayDot(m.dumpDate)} · 원장 ${ref}`, `HOME 덤프 ${m.dumpEdition} 수집 실행 · 사업 원장 기준일 ${m.referenceDate}`);
  }
  /* 요구사항 꼬리표의 title: 이름·우선순위·관련 지시·이 화면이 답하는 항목 */
  function paintReqTags() {
    const R = Object.fromEntries(D.requirements.map((r) => [r.id, r])), DIR = Object.fromEntries(D.directives.map((d) => [d.date, d]));
    $$('[data-req]').forEach((el) => {
      const r = R[el.dataset.req]; if (!r) return;
      const dirs = r.dates.map((d) => (DIR[d] ? `${DIR[d].full} ${DIR[d].event}` : d)).join(' · ');
      el.title = `${r.id} ${r.title}(${r.priority}) · 지시 ${dirs}${el.dataset.answer && el.dataset.answer !== '목차' ? ` · 이 화면: ${el.dataset.answer}` : ''} · 판정 ${VERDICT[r.verdict].n}(${r.metric})`;
    });
  }
  const VERDICT = { met: { n: '충족', sort: 0 }, part: { n: '부분', sort: 1 }, none: { n: '없음', sort: 2 } };

  /* ================= 화면별 ================= */
  const PAGES = {};

  /* ----- 사업(/projects) ----- */
  const POLKEYS = () => D.policies.map((p) => p.key);
  const inLens = (p, l) => l === 'all' || (POLKEYS().includes(l) ? p.policies.includes(l) : l.startsWith('p:') ? p.programs.includes(l.slice(2)) : true);
  const lensName = (l) => (l === 'all' ? '전체' : POLKEYS().includes(l) ? D.policies.find((p) => p.key === l).short : l.slice(2));
  function nextCell(p) {
    if (p.overdue && p.late !== null) return { html: `<span class="${p.status === 'caution' ? 'text-warn' : 'text-bad'}" title="${EV[p.overdue.eventType]} 현재 예정일 경과 ${p.overdue.months}개월 — ${STATUS[p.status].n}">${ymDot(p.overdue.planned)} ${EV[p.overdue.eventType]}</span>`, v: monthNo(p.overdue.planned) };
    if (p.next) return { html: `<span title="${EV[p.next.eventType]} 현재 예정">${ymDot(p.next.planned)} ${EV[p.next.eventType]}</span>`, v: monthNo(p.next.planned) };
    return { html: dash('현재 예정 없음'), v: '' };
  }
  const isCheck = (p) => p.status === 'caution' || p.status === 'delay' || p.status === 'long';
  const statusOk = (p, st) => !st || (st === 'check' ? isCheck(p) : p.status === st);
  const hasTarget = (c) => !!c && (c.target != null || !!c.yearEnd);
  /* 목표 칸 하나(정책 목표가 있는 단계만): 목표·확인 막대 · 실적 없음 · 연말 목표만 */
  function targetHtml(c, i, polName) {
    const st = ST[i];
    if (c.target != null && c.actual != null) {
      const fill = Math.min(100, c.actual / c.target * 100), short = c.status === 'GAP';
      return `<div class="flex flex-col gap-1" title="${esc(`${polName} ${CIR[i]} ${st.n} — ${ymDot(c.from)}~${ymDot(c.through)} · 확인 ${fmt(c.actual)}호${c.review ? `(검토 중 연결 ${fmt(c.review)}호 포함)` : ''} / 목표 ${fmt(c.target)}호${short ? ` · 부족 ${fmt(c.gap)}호(${c.shortfallPct}%)` : ''} · 목표: ${c.targetBasis} · 확인: ${c.actualBasis}`)}">`
        + `<span class="relative block h-[8px]" style="background:${light(st.c, 30)}"><span class="absolute inset-y-0 left-0" style="width:${fill}%;background:${st.c}"></span>${short ? '<span class="absolute inset-0 border-[1.5px] border-bad"></span>' : ''}</span>`
        + `<span class="text-[13px] whitespace-nowrap text-muted-foreground tabular-nums"><b class="text-[14px] ${short ? 'text-bad' : 'text-foreground'}">${fmt(c.actual)}</b> / ${fmt(c.target)}${short ? ` <b class="text-bad">부족 ${c.shortfallPct}%</b>` : ''}</span></div>`;
    }
    if (c.target != null) return `<div class="flex flex-col gap-1" title="${esc(`${polName} ${CIR[i]} ${st.n} — 목표 ${fmt(c.target)}호 · 확인 실적 없음 · 확인: ${c.actualBasis}`)}"><span class="block h-[8px] ${HATCH}" style="background-color:${light(st.c, 30)}"></span><span class="text-[13px] whitespace-nowrap text-muted-foreground tabular-nums">실적 없음 / ${fmt(c.target)}</span></div>`;
    return `<div class="flex flex-col gap-1" title="${esc(`${polName} ${CIR[i]} ${st.n} — 같은 기간(${ymDot(c.from)}~${ymDot(c.through)}) 목표 없음 · 연말 목표 ${dayDot(c.yearEnd.date)} ${fmt(c.yearEnd.units)}호(${c.targetBasis})${c.actual != null ? ` · 확인 ${fmt(c.actual)}호(${c.actualBasis})` : ''}`)}"><span class="text-[13px] whitespace-nowrap text-muted-foreground tabular-nums">연말 목표 <b class="text-[14px] text-foreground">${man(c.yearEnd.units)}</b></span>${c.actual != null ? `<span class="text-[13px] whitespace-nowrap text-muted-foreground tabular-nums">확인 ${man(c.actual)}</span>` : ''}</div>`;
  }
  /* 단계 파이프라인 칸 하나: 확인 실적(호수·사업 수·비율 막대) */
  function pipeCell(i, set, on) {
    const st = ST[i], hit = set.filter((p) => p.reached[i]), n = hit.length, units = sum(hit, (p) => p.units);
    const share = set.length ? n / set.length * 100 : 0;
    const head = `<span class="flex items-center gap-1.5 text-[14px] whitespace-nowrap" style="color:${st.ink}"><i class="block size-[9px] flex-none rounded-[2px]" style="background:${st.c}" aria-hidden="true"></i>${CIR[i]} ${st.n}</span>`;
    const main = `<b class="font-display text-[24px] leading-[1.15] font-normal tabular-nums">${fmt(units)}<small class="ml-[3px] font-sans text-[13px] text-muted-foreground">호</small></b><span class="text-[13px] text-muted-foreground tabular-nums">${fmt(n)}건 / ${fmt(set.length)}</span>`;
    const bar = `<span class="relative block h-[6px]" style="background:${light(st.c, 22)}" aria-hidden="true"><span class="q-grow-x absolute inset-y-0 left-0" style="width:${share}%;background:${st.c};--i:${i}"></span></span>`;
    const tip = `${CIR[i]} ${st.n} — 원천 실제 기록으로 확인한 사업 ${n}건(${share.toFixed(0)}%) · 그 사업들의 계획 호수 ${fmt(units)}호${i === 0 ? ' · ①은 계획 호수를 확인한 사업' : ''} · 누르면 이 단계 사업만`;
    return `<li class="min-w-0"><button type="button" data-set="stage:${i}" aria-pressed="${on}" title="${esc(tip)}" class="btn-reset card-lift flex h-full w-full min-w-0 flex-col gap-1.5 rounded-[10px] border border-border px-3 py-2.5 text-left aria-pressed:border-primary aria-pressed:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">${head}<span class="flex flex-col">${main}</span>${bar}</button></li>`;
  }
  /* 파이프라인: 기록이 있는 단계만 칸으로, 나머지는 작게 접은 한 칸 */
  function pipeline(set, lens, stageOn) {
    const open = ST.map((_, i) => set.some((p) => p.reached[i]));
    const shut = ST.map((_, i) => i).filter((i) => !open[i]);
    const fold = shut.length ? `<li class="min-w-0"><div class="flex h-full min-h-[80px] flex-col justify-center gap-0.5 rounded-[10px] border border-dashed border-line2 px-3 py-2.5" title="${esc(`${shut.map((i) => `${CIR[i]} ${ST[i].n}`).join(' · ')} — 원천 실제 기록이 있는 사업 없음${shut.includes(5) ? ' · 입주 실적은 원천에서 집계하지 않음(실제 시작일만)' : ''}`)}"><span class="text-[14px] text-muted-foreground">${shut.map((i) => `${CIR[i]}${ST[i].n}`).join(' · ')}</span><span class="text-[13px] text-muted-foreground">기록 없음</span></div></li>` : '';
    const cols = `repeat(${6 - shut.length},minmax(0,1fr))${shut.length ? ` minmax(0,${Math.max(0.7, shut.length * 0.45)}fr)` : ''}`;
    const lensRows = D.projects.filter((p) => inLens(p, lens));
    const scope = [...new Set(lensRows.map((p) => p.sido))].sort().map((c) => SIDO_SHORT(c)).join('·');
    const rev = lensRows.filter((p) => p.link === 'REVIEW_REQUIRED').length, fix = lensRows.filter((p) => p.link === 'CONFIRMED').length;
    const badges = lens === 'all' ? '' : `<span class="flex items-center gap-1.5">${badge(scope, `범위: 이 렌즈에 연결된 사업은 ${scope}에만 있음`)}${rev ? badge('검토 중 연결', `담당자 확인 전 제안 연결 ${rev}건 포함(확정 ${fix}건) · 해제된 연결은 빠짐`) : ''}</span>`;
    return `<div class="flex flex-wrap items-center gap-x-3 gap-y-1"><h3 class="m-0 text-[16px] font-normal text-muted-foreground" title="단계마다 원천 실제 기록으로 확인한 사업 수와 그 계획 호수 · 막대 = 범위 사업 중 비율 · 기록 없는 단계는 접은 한 칸 · 칸을 누르면 그 단계 사업만">단계 파이프라인</h3>${badges}</div>`
      + `<ol class="m-0 mt-3 grid list-none gap-2 p-0" style="grid-template-columns:${cols}" aria-label="단계 파이프라인">${ST.map((_, i) => (open[i] ? pipeCell(i, set, stageOn === String(i)) : '')).join('')}${fold}</ol>`;
  }
  /* 목표 대비: 렌즈 '전체'면 목표가 배정된 정책 모두(정책별 비교), 정책 렌즈면 그 정책 하나. 목표가 있는 단계만 칸으로 */
  function policyCompare(keys, title) {
    const pols = D.policies.filter((pol) => keys.includes(pol.key) && (D.policyCells[pol.key] ?? []).some(hasTarget));
    if (!pols.length) return '';
    const used = pols.flatMap((pol) => D.policyCells[pol.key].filter(hasTarget));
    const lg = [{ label: '확인', cls: 'bg-mute', tip: '확인 호수(단계색 실색)' }];
    if (used.some((c) => c.target != null)) lg.push({ label: '목표', style: 'background:color-mix(in srgb,var(--mute) 30%,var(--card))', tip: '같은 기간 목표(같은 색 옅게)' });
    if (used.some((c) => c.target != null && c.actual == null)) lg.push({ label: '실적 없음', cls: `border border-line2 ${HATCH_SW}`, tip: '목표는 있으나 확인 실적 원천이 없음(빗금)' });
    if (used.some((c) => c.status === 'GAP')) lg.push({ label: '목표 미달', cls: 'border-[1.5px] border-bad', tip: '확인이 목표에 못 미침(빨간 테두리)' });
    const c0 = D.policyCells[pols[0].key][0];
    const left = D.policies.filter((p) => !pols.includes(p) && keys.includes(p.key));
    return `<div class="mt-5"><div class="flex flex-wrap items-center gap-x-3 gap-y-1"><h3 class="m-0 text-[16px] font-normal text-muted-foreground" title="정책마다 6단계 같은 기간 목표 대비 확인 · 단계 목표가 배정된 정책만${left.length ? `(${esc(left.map((p) => p.short).join('·'))}은 목표 없음 — 렌즈 칩으로 사업은 볼 수 있음)` : ''} · 확인은 검토 중 연결 포함 · 정책 전체 범위(policy-progress)">${title}</h3><span class="text-[14px] text-muted-foreground tabular-nums" title="같은 해 1월~기준 달 누적(policy-progress samePeriod)">${ymDot(c0.from)}~${c0.through.slice(5, 7)}</span><div class="ml-auto">${legend(lg)}</div></div>${pols.map((pol) => {      const cells = D.policyCells[pol.key], set = D.projects.filter((p) => p.policies.includes(pol.key));
      const rev = set.filter((p) => p.link === 'REVIEW_REQUIRED').length, fix = set.filter((p) => p.link === 'CONFIRMED').length;
      const none = ST.map((_, i) => i).filter((i) => !hasTarget(cells[i]));
      return `<div class="mt-2 flex flex-wrap items-center gap-x-8 gap-y-2 rounded-[10px] border border-border px-3 py-2.5"><button type="button" data-set="lens:${pol.key}" class="btn-reset flex flex-col rounded-[6px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" title="${esc(`${pol.name} · ${dayDot(pol.announced)} 발표 · ${pol.scope} · 누르면 이 렌즈`)}"><b class="font-display text-[20px] leading-[1.2] font-normal hover:underline">${pol.short}</b><span class="text-[13px] text-muted-foreground tabular-nums">사업 ${set.length}건 · ${fmt(sum(set, (p) => p.units))}호</span></button>`
        + ST.map((st, i) => (hasTarget(cells[i]) ? `<div class="flex min-w-[150px] flex-col gap-1"><span class="flex items-center gap-1.5 text-[14px] whitespace-nowrap" style="color:${st.ink}" title="공식 단계 ${st.off}"><i class="block size-[9px] flex-none rounded-[2px]" style="background:${st.c}" aria-hidden="true"></i>${CIR[i]} ${st.n}</span>${targetHtml(cells[i], i, pol.short)}</div>` : '')).join('')
        + `<span class="ml-auto flex items-center gap-2">${none.length ? `<span class="text-[13px] text-muted-foreground" title="${esc(`${none.map((i) => `${CIR[i]} ${ST[i].n}`).join(' · ')} — 같은 기간 단계 목표가 배정되지 않음`)}">${none.map((i) => CIR[i]).join('')} 목표 미배정</span>` : ''}${badge(`검토 중 ${rev} · 확정 ${fix}`, '정책–사업 연결 상태 · 검토 중은 담당자 확인 전 제안')}</span></div>`;
    }).join('')}</div>`;
  }
  /* 핵심 질문 5: 렌즈·지역·기관 범위(상태·단계 칩과 무관)로 다시 계산 */
  let COMPL = null;
  function questions(scope, s, lens, sggOk) {
    COMPL ??= Object.values(D.calendar).flat().filter((e) => e.type === 'COMPLETION');
    const Q = [];
    const pk = lens === 'all' ? '97' : POLKEYS().includes(lens) ? lens : null;
    const pair = pk ? (D.policyCells[pk] ?? []).map((c, i) => [c, i]).find(([c]) => c && c.target != null && c.actual != null) : null;
    if (pair) {
      const [c, i] = pair, short = c.status === 'GAP';
      Q.push({ q: '계획대로 가고 있는가', set: lens === 'all' ? `lens:${pk}` : '', tip: `${lensName(pk)} ${CIR[i]} ${ST[i].n} ${ymDot(c.from)}~${ymDot(c.through)} 확인 ${fmt(c.actual)}호 / 목표 ${fmt(c.target)}호${short ? ` · 부족 ${fmt(c.gap)}호` : ''} · 정책 전체 범위(policy-progress) · 목표·실적이 같은 칸에 있는 단계는 이것 하나`, value: `<span class="${short ? 'text-bad' : ''}">${short ? c.shortfallPct : fmt(Math.round(c.actual / c.target * 100))}</span>`, unit: short ? '% 부족' : '% 달성', sub: `${lensName(pk)} ${CIR[i]}${ST[i].n} ${fmt(c.actual)} / ${fmt(c.target)}` });
    } else {
      const judged = scope.filter((p) => p.status !== 'none');
      if (judged.length) { const ok = judged.filter((p) => p.status === 'ok').length; Q.push({ q: '계획대로 가고 있는가', set: 'status:ok', tip: '단계 목표가 없는 범위라 현재 예정일을 지키는 사업 비율로 답함 · 판정 사업 중 정상(경과 없음)', value: String(Math.round(ok / judged.length * 100)), unit: '% 정상', sub: `판정 ${fmt(judged.length)}건 · 일정 없음 ${fmt(scope.length - judged.length)}` }); }
    }
    const late = scope.filter(isCheck);
    const byBoard = [0, 0, 0, 0, 0, 0]; for (const p of late) byBoard[p.board] += p.units;
    const bU = Math.max(...byBoard), bB = byBoard.indexOf(bU);
    Q.push({ q: '어디서 막혀 있는가', set: bU ? `stage:${bB}` : '', tip: `지연·주의 사업의 지금 단계별 계획 호수 중 가장 큰 단계 · ${byBoard.map((v, i) => `${CIR[i]} ${fmt(v)}`).join(' · ')} · 원인 기록은 원천에 없음`, value: bU ? `<span style="color:${ST[bB].ink}">${CIR[bB]} ${ST[bB].n}</span>` : '<span class="text-muted-foreground">없음</span>', unit: '', sub: bU ? `지연·주의 ${fmt(bU)}호` : '지연·주의 사업 없음' });
    const nLate = late.filter((p) => p.status !== 'caution').length;
    Q.push({ q: '어떤 사업이 늦어지는가', set: late.length ? 'status:check' : '', tip: `지연(6개월 이상) ${late.filter((p) => p.status === 'delay').length} · 장기 지연(12개월 이상) ${late.filter((p) => p.status === 'long').length} · 주의 ${late.filter((p) => p.status === 'caution').length} · 누르면 점검 필요(지연 개월 순)`, value: fmt(nLate), unit: '건', sub: `장기 ${late.filter((p) => p.status === 'long').length} · 주의 ${late.filter((p) => p.status === 'caution').length}` });
    const bySgg = !!(s.sido || sggOk), acc = {};
    for (const p of late) { const k = bySgg ? p.sgg : p.sido; acc[k] = (acc[k] ?? 0) + p.units; }
    const top = Object.entries(acc).sort((a, b) => b[1] - a[1])[0];
    const topName = top ? (bySgg ? sggLabel(D.projects.find((p) => p.sgg === top[0]).sggName, top[0].slice(0, 2), true) : SIDO_SHORT(top[0])) : null;
    const q4 = new URLSearchParams(location.search); if (top && bySgg) { q4.set('sgg', top[0]); q4.delete('id'); }
    Q.push({ q: '어디를 먼저 챙기는가', set: top && !bySgg ? `sido:${top[0]}` : '', href: top && bySgg && top[0] !== sggOk ? `projects.html?${q4}` : '', tip: `지연·주의 사업 호수가 가장 큰 ${bySgg ? '시군구' : '시도'}`, value: top ? esc(topName) : '<span class="text-muted-foreground">없음</span>', unit: '', sub: top ? `지연·주의 ${fmt(top[1])}호` : '지연·주의 사업 없음' });
    const ids = new Set(scope.map((p) => p.id)), up = COMPL.filter((e) => ids.has(e.id));
    Q.push({ q: '앞으로 얼마나 공급되는가', href: `region.html${s.sido ? `?sido=${s.sido}` : ''}`, tip: `이 범위 사업의 준공 현재 예정 · ${ymDot(D.meta.calendarFrom)}~${ymDot(D.meta.calendarTo)} · 이미 준공 실제가 있는 사업 제외 · 누르면 지역 공급`, value: fmt(sum(up, (e) => e.units)), unit: '호', sub: `12개월 준공 예정 · ${up.length}건` });
    const el = $('#questions');
    el.style.gridTemplateColumns = `repeat(${Q.length},minmax(0,1fr))`;
    const QA = 'group/q flex w-full min-w-0 flex-col gap-1 rounded-[8px] text-left text-foreground no-underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary';
    el.innerHTML = Q.map((x) => {
      const inner = `<span class="text-[14px] text-muted-foreground${x.set || x.href ? ' group-hover/q:text-primary' : ''}">${x.q}</span><b class="font-display text-[28px] leading-[1.2] font-normal whitespace-nowrap tabular-nums">${x.value}${x.unit ? `<small class="ml-[3px] font-sans text-[14px] font-normal text-muted-foreground">${x.unit}</small>` : ''}</b><span class="truncate text-[13px] text-muted-foreground tabular-nums">${x.sub}</span>`;
      const box = x.set ? `<button type="button" data-set="${x.set}" title="${esc(x.tip)}" class="btn-reset ${QA}">${inner}</button>` : x.href ? `<a href="${x.href}" title="${esc(x.tip)}" class="${QA}">${inner}</a>` : `<div title="${esc(x.tip)}" class="${QA}">${inner}</div>`;
      return `<li class="min-w-0 px-4 first:pl-0 last:pr-0">${box}</li>`;
    }).join('');
  }

  PAGES.projects = () => {
    const q0 = new URLSearchParams(location.search);
    const printMode = q0.get('print') === '1';
    /* 렌즈 칩(정책)·프로그램 메뉴는 자료에서 */
    $('[data-lens-chips]').innerHTML = D.policies.map((p) => `<button type="button" data-val="${p.key}" aria-pressed="false" title="${esc(`${p.name} · ${dayDot(p.announced)} 발표 · ${p.scope}`)}" class="btn-reset flex items-center gap-1.5 rounded-full border border-transparent px-2 py-[3px] text-[14px] whitespace-nowrap [transition:background_.15s,border-color_.15s] aria-pressed:border-primary aria-pressed:bg-accent not-aria-pressed:hover:bg-pn2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary max-[1500px]:px-1">${p.short}</button>`).join('');
    fillPop('program', D.programs.map((g) => [`p:${g.name}`, g.name, `${g.policies.map((k) => D.policies.find((p) => p.key === k)?.short).join('·')} · 사업 ${g.projects}건`]));
    const sgg = q0.get('sgg');
    const sggOk = sgg && D.projects.some((p) => p.sgg === sgg) ? sgg : null;
    const sggChip = $('[data-sgg-chip]');
    if (sggOk && sggChip) {
      sggChip.hidden = false;
      $('[data-sgg-label]', sggChip).textContent = sggLabel(D.projects.find((p) => p.sgg === sggOk).sggName, sggOk.slice(0, 2));
      sggChip.addEventListener('click', () => { const q = new URLSearchParams(location.search); q.delete('sgg'); location.search = q.toString(); });
    }
    /* 인쇄 미리보기(?print=1): 화면 전용 블록을 숨기고 보고 블록을 편다(@media print 와 같은 결과) */
    if (printMode) {
      $$('[data-screen-only]').forEach((el) => { el.style.display = 'none'; });
      $$('[data-print-only]').forEach((el) => el.classList.remove('hidden'));
      const bar = $('[data-print-bar]'); bar.classList.replace('hidden', 'flex');
      $('[data-print]', bar).addEventListener('click', () => window.print());
    }
    const rows = D.projects.map((p) => {
      const nx = nextCell(p);
      return {
        id: p.id, href: `projects.html?id=${p.id}`,
        attrs: ` data-id="${p.id}"`,
        cells: {
          name: `<a href="projects.html?id=${p.id}" data-open="${p.id}" title="${esc(p.name)}">${esc(p.name)}</a>`,
          sgg: `<span title="${esc(p.sggName)}">${esc(sggLabel(p.sggName, p.sido))}</span>`,
          agency: `<span title="${AGENCY_TIP[p.agency]}" class="${p.agency === '기타' ? 'text-muted-foreground' : ''}">${p.agency}</span>`,
          stage: stageChip(p.board),
          units: p.units > 0 ? fmt(p.units) : markNone('미확인', '계획 호수 원천 없음'),
          notice: p.notice != null ? fmt(p.notice) : dash('모집공고 확인 없음'),
          next: nx.html,
          late: p.late !== null ? `<span class="${p.status === 'caution' ? 'text-warn' : 'text-bad font-bold'}" title="${EV[p.overdue.eventType]} 예정 ${ymDot(p.overdue.planned)} 경과">+${p.late}</span>` : dash(p.status === 'none' ? '현재 예정 없음' : '경과 없음'),
          status: statusCell(p.status),
        },
        v: { stage: p.board, units: p.units, notice: p.notice ?? '', next: nx.v, late: p.late ?? '', status: STATUS[p.status].sort, agency: p.agency },
      };
    });
    const COLS = [{ key: 'name', label: '사업', text: true, clip: 'clamp(180px, 100vw - 1120px, 380px)' }, { key: 'sgg', label: '시군구', text: true, clip: 'clamp(120px, 100vw - 1180px, 200px)' }, { key: 'agency', label: '기관', text: true },
      { key: 'stage', label: '단계', text: true }, { key: 'units', label: '계획 호수' }, { key: 'notice', label: '공고 확인', tip: '모집공고에서 확인한 호수(공고 확인 ≠ 준공)' },
      { key: 'next', label: '다음 일정', text: true, tip: '현재 예정 · 색 글자는 예정일 경과' }, { key: 'late', label: '지연(개월)', tip: '현재 예정일 경과 개월 — 주의 1~6, 지연 6 이상, 장기 지연 12 이상' }, { key: 'status', label: '상태', text: true }];
    const gridRoot = mountGrid($('#project-grid'), { label: '사업 목록', maxHeight: 640, cols: COLS, rows, onRow: (tr) => openDrawer(tr.dataset.id) });
    const LATE_COL = COLS.findIndex((c) => c.key === 'late');
    /* 점검 필요를 켜면 지연 개월 큰 순(정렬 단추를 눌러 내림차순으로) */
    const sortLate = () => { const th = $$('th', gridRoot)[LATE_COL], b = $('[data-sort]', th); for (let k = 0; k < 3 && th.getAttribute('aria-sort') !== 'descending'; k++) b.click(); };
    let wasCheck = false;

    /* ----- 상세 서랍(?id=) ----- */
    const drawer = $('#drawer');
    let pushed = false, lastId = null;
    const urlWith = (id) => { const q = new URLSearchParams(location.search); if (id) q.set('id', id); else q.delete('id'); const t = q.toString(); return (t ? `?${t}` : location.pathname) + location.hash; };
    const markRow = (id) => $$('tr[data-row]', gridRoot).forEach((r) => r.toggleAttribute('data-sel', r.dataset.id === id));
    function showDetail(asked) {
      let id = asked, from = null;
      if (D.superseded[id]) { from = id; id = D.superseded[id].to; history.replaceState(history.state, '', urlWith(id)); }
      const p = D.projects.find((x) => x.id === id);
      if (!p) { hideDetail(); return; }
      renderDetail(p, from);
      drawer.hidden = false; lastId = id; markRow(id);
      $('#drawer .overflow-y-auto').scrollTop = 0;
      $('#dr-name').focus({ preventScroll: true });
    }
    function hideDetail() {
      if (drawer.hidden) return;
      drawer.hidden = true; markRow(null); pushed = false;
      const a = lastId && $(`a[data-open="${CSS.escape(lastId)}"]`, gridRoot); if (a) a.focus({ preventScroll: true });
    }
    function openDrawer(id) {
      if (drawer.hidden) { history.pushState({ drawer: 1 }, '', urlWith(id)); pushed = true; } else history.replaceState(history.state, '', urlWith(id));
      showDetail(id);
    }
    function closeDrawer() {
      if (pushed) { history.back(); return; }   // popstate 가 닫는다
      history.replaceState(null, '', urlWith(null)); hideDetail();
    }
    addEventListener('popstate', () => { const id = new URLSearchParams(location.search).get('id'); if (id) showDetail(id); else hideDetail(); });
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-open]');
      if (a && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) { e.preventDefault(); openDrawer(a.dataset.open); return; }
      if (e.target.closest('[data-drawer-close]')) closeDrawer();
    });
    /* Esc: 펼친 메뉴가 있으면 메뉴만, 없으면 서랍을 닫는다(메뉴 닫기보다 먼저 보려고 capture) */
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !drawer.hidden && !$$('[data-pop-menu]').some((m) => !m.hidden)) closeDrawer(); }, true);

    return {
      start() { const id = !printMode && q0.get('id'); if (id) showDetail(id); },
      update(s) {
        const lens = s.lens;
        const scope = D.projects.filter((p) => inLens(p, lens) && (!s.sido || p.sido === s.sido) && (!sggOk || p.sgg === sggOk) && (!s.agency || p.agency === s.agency));
        const base = scope.filter((p) => statusOk(p, s.status));
        const list = base.filter((p) => !s.stage || String(p.board) === s.stage);
        questions(scope, s, lens, sggOk);
        $('#lens-summary').innerHTML = `<div class="min-w-0">${pipeline(base, lens, s.stage)}</div>${lens === 'all' ? policyCompare(POLKEYS(), '정책별 목표 대비') : POLKEYS().includes(lens) ? policyCompare([lens], `${lensName(lens)} 목표 대비`) : ''}`;
        const ok = new Set(list.map((p) => p.id));
        $$('tr[data-row]', gridRoot).forEach((r) => { r.dataset.f = ok.has(r.dataset.id) ? '0' : '1'; });
        restripe(gridRoot);
        const isChk = s.status === 'check';
        if (isChk && !wasCheck) sortLate();
        wasCheck = isChk;
        const label = [lens !== 'all' && lensName(lens), s.sido && SIDO_SHORT(s.sido), sggOk && sggLabel(D.projects.find((p) => p.sgg === sggOk).sggName, sggOk.slice(0, 2)), s.stage && `${CIR[+s.stage]} ${ST[+s.stage].n}`, s.status && (isChk ? '점검 필요' : STATUS[s.status].n), s.agency].filter(Boolean).join(' · ');
        const plan = sum(list, (p) => p.units);
        $('#list-title').innerHTML = `${esc(label ? `사업 목록 · ${label}` : '사업 목록')}<span class="ml-2 text-[14px] font-normal text-muted-foreground tabular-nums" title="사업마다 원장의 첫 물량 합 · 호수 미확인 ${list.filter((p) => !(p.units > 0)).length}건은 0">${fmt(list.length)}건 · 계획 ${fmt(plan)}호</span>`;
        /* 월간 보고(인쇄): 우선 점검 상위 10 · 기준일·출처 */
        const top = scope.filter((p) => p.late !== null).sort((a, b) => b.late - a.late || b.units - a.units).slice(0, 10);
        if (top.length) mountGrid($('#priority'), {
          label: '우선 점검 사업', sortable: false, search: false,
          cols: [{ key: 'name', label: '사업', text: true }, { key: 'sgg', label: '시군구', text: true }, { key: 'agency', label: '기관', text: true }, { key: 'stage', label: '단계', text: true }, { key: 'units', label: '계획 호수' }, { key: 'ev', label: '지난 예정', text: true }, { key: 'late', label: '지연(개월)' }, { key: 'status', label: '상태', text: true }],
          rows: top.map((p) => ({ id: p.id, cells: { name: esc(p.name), sgg: esc(sggLabel(p.sggName, p.sido)), agency: p.agency, stage: stageChip(p.board), units: p.units > 0 ? fmt(p.units) : markNone('미확인'), ev: `${EV[p.overdue.eventType]} ${ymDot(p.overdue.planned)}`, late: `<span class="${p.status === 'caution' ? 'text-warn' : 'font-bold text-bad'}">+${p.late}</span>`, status: statusCell(p.status) } })),
        });
        else $('#priority').innerHTML = '<p class="m-0 text-[14px] text-muted-foreground">예정일이 지난 사업이 없습니다</p>';
        const m = D.meta;
        $('#report-src').textContent = `범위 ${label || '수도권 HOME 사업 전체'}(${fmt(scope.length)}건) · 기준일: 사업 원장 ${dayDot(m.referenceDate)} · HOME 덤프 ${m.dumpEdition} · 정책 목표·확인 ${ymDot(m.policyThrough)}까지 · 출처: 사업 원장(건축HUB·LH·마이홈·청약홈), HOME 덤프, 정책 진행(policy-progress), 통계누리 · 판정: 현재 예정일 경과 ${m.judge.caution}~${m.judge.delay}개월 주의, ${m.judge.delay}개월 이상 지연, ${m.longDelayMonths}개월 이상 장기 지연`;
      },
    };
  };

  /* ----- 사업 상세(/project/[id]) ----- */
  const LOC = { block: 'LH 블록 대표점', address: '주소 근사점', district: '지구 대표점', area: '근사 영역(시군구·동)', parcel: '필지' };
  const SCOPE = { PUBLIC: '공공', PRIVATE_ON_PUBLIC_LAND: '공공택지 민간', UNKNOWN: '미확인' };
  const UNIT = { BLOCK: '블록', PROJECT: '사업', AREA_UNKNOWN: '구역 미상' };
  /* 단계 타임라인: 단계마다 현재·실제 두 줄(기준선이 있는 단계만 당초 줄). 기록이 하나도 없는 단계는 줄을 그리지 않는다 */
  function timeline(d, ref) {
    const T = monthNo(ref);
    const dates = [T];
    for (const t of STAGE_EVENTS) { const s = d.stages[t]; if (s) for (const v of [s.plan, s.actual]) if (v) dates.push(monthNo(v)); if (d.baseline[t]) dates.push(monthNo(String(d.baseline[t]))); }
    for (const [p] of d.progress) dates.push(monthNo(p));
    const y0 = Math.floor(Math.min(...dates) / 12), y1 = Math.floor(Math.max(...dates) / 12) + 1;
    const X0 = y0 * 12, span = (y1 - y0) * 12;
    const x = (m) => Math.round((m + 0.5 - X0) / span * 10000) / 100;
    const xe = (m) => Math.round((m - X0) / span * 10000) / 100;
    const years = []; for (let y = y0; y < y1; y++) years.push(y);
    const tag = (at, text, cls = 'text-muted-foreground', left = at > 78) => `<span aria-hidden="true" class="pointer-events-none absolute top-1/2 z-[3] -translate-y-1/2 rounded-[3px] bg-chartbg px-1 text-[12px] leading-[15px] whitespace-nowrap tabular-nums ${cls} ${left ? '-ml-2.5 -translate-x-full' : 'ml-2.5'}" style="left:${at}%">${text}</span>`;
    const used = { plan: false, actual: false, late: false, hatch: false, base: false };
    const hatch = (tip) => { used.hatch = true; return `<span class="absolute inset-0 border border-border [background:repeating-linear-gradient(45deg,color-mix(in_srgb,var(--muted-foreground)_18%,transparent)_0_1.5px,transparent_1.5px_7px)]" title="${esc(tip)}"></span>`; };
    const lanes = [];
    let maxLate = null;
    for (let b = 0; b < 6; b++) {
      const t = STAGE_EVENTS.find((k) => EV_BOARD[k] === b);
      const s = t ? d.stages[t] ?? {} : {};
      const c = ST[b].c, base = t ? d.baseline[t] : null;
      const span3 = b === 2 && (d.stages.CONSTRUCTION_START ?? {}).actual;
      if (!s.plan && !s.actual && !base && !span3) continue;
      /* 당초(기준선): 있는 단계만 */
      const l0 = base ? `<span class="absolute top-1/2 z-[2] size-[11px] -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-mute bg-card" style="left:${x(monthNo(String(base)))}%" title="${ST[b].n} 당초 ${ymDot(String(base))}"></span>${tag(x(monthNo(String(base))), ymDot(String(base)))}` : '';
      if (base) used.base = true;
      /* 현재 예정 */
      let l1 = '';
      if (b === 2) {
        const cs = d.stages.CONSTRUCTION_START ?? {}, cp = d.stages.COMPLETION ?? {};
        const st0 = cs.plan ?? cs.actual, end = cp.plan;
        if (st0 && end && monthNo(end) > monthNo(st0)) { used.plan = true; l1 += `<span class="absolute top-[1px] bottom-[1px] rounded-[3px] border-[1.5px] border-dashed" style="left:${xe(monthNo(st0))}%;width:${Math.max(0.6, xe(monthNo(end) + 1) - xe(monthNo(st0)))}%;background:${light(c, 22)};border-color:${c}" title="공사 예정 ${ymDot(st0)}~${ymDot(end)}"></span>`; }
      }
      if (s.plan) {
        const lt = s.late;
        used.plan = true;
        if (lt) { maxLate = Math.max(maxLate ?? 0, lt.months); used.late = true; }
        l1 += `<span class="absolute top-[1px] bottom-[1px] z-[2] w-[13px] -translate-x-1/2 rounded-[3px] ${lt ? 'border-2' : 'border-[1.5px] border-dashed'}" style="left:${x(monthNo(s.plan))}%;background:${light(c, 32)};border-color:${lt ? (lt.cls === 'delay' ? 'var(--bad)' : 'var(--warn)') : c}" title="${esc(`${EV[t]} 현재 예정 ${ymDot(s.plan)}${lt ? ` · 경과 ${lt.months}개월 — ${lt.cls === 'delay' ? '지연' : '주의'}` : ''}`)}"></span>`
          + tag(x(monthNo(s.plan)), `${ymDot(s.plan)}${lt ? ` +${lt.months}개월` : ''}`, lt ? (lt.cls === 'delay' ? 'text-bad font-bold' : 'text-warn font-bold') : 'text-muted-foreground');
      }
      /* 실제 */
      let l2 = '';
      if (span3) {
        const a = d.stages.CONSTRUCTION_START.actual, ca = (d.stages.COMPLETION ?? {}).actual;
        const to = ca ? xe(monthNo(ca) + 1) : Math.max(x(T), xe(monthNo(a) + 1));
        l2 += `<span class="q-grow-x absolute top-1/2 h-[6px] -translate-y-1/2" style="left:${xe(monthNo(a))}%;width:${Math.max(0.6, to - xe(monthNo(a)))}%;background:${c}" title="공사 ${ymDot(a)}~${ca ? ymDot(ca) : '진행 중'}"></span>`;
      }
      if (s.actual) {
        used.actual = true;
        const diff = s.plan ? monthNo(s.actual) - monthNo(s.plan) : null;
        l2 += `<span class="absolute top-1/2 z-[2] size-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card" style="left:${x(monthNo(s.actual))}%;background:${c}" title="${esc(`${EV[t]} 실제 ${dayDot(s.actual)}${diff !== null ? ` · 현재 예정 대비 ${diff > 0 ? '+' : ''}${diff}개월` : ''}`)}"></span>` + tag(x(monthNo(s.actual)), ymDot(s.actual), 'text-foreground', b === 2 ? x(monthNo(s.actual)) > 12 : undefined);
      } else if (s.plan && monthNo(s.plan) < T) l2 = hatch(`${ST[b].n} — 예정일이 지났는데 실제 기록 없음`);
      const late = s.late ? `<span class="${s.late.cls === 'delay' ? 'text-bad font-bold' : 'text-warn font-bold'}" title="현재 예정일 경과 ${s.late.months}개월">+${s.late.months}개월</span>` : '<span class="text-muted-foreground">–</span>';
      const line = (lbl, inner) => `<span class="text-[12px] leading-none text-muted-foreground">${lbl}</span><span class="relative block h-[16px]">${inner}</span>`;
      lanes.push(`<div class="grid grid-cols-[96px_40px_minmax(0,1fr)_76px] items-center gap-x-3 gap-y-[3px]" role="group" aria-label="${CIR[b]} ${ST[b].n}">
        <span class="${base ? 'row-span-3' : 'row-span-2'} flex items-center gap-1.5 self-center text-[14px] whitespace-nowrap" title="공식 단계 ${ST[b].off}"><i class="block size-[9px] flex-none rounded-[2px]" style="background:${c}" aria-hidden="true"></i>${CIR[b]} ${ST[b].n}</span>
        ${base ? line('당초', l0) : ''}${line('현재', l1)}<span class="${base ? 'row-span-3' : 'row-span-2'} self-center text-right text-[13px] tabular-nums">${late}</span>
        ${line('실제', l2)}
      </div>`);
    }
    const pr = d.progress.map(([day, v]) => ({ at: x(monthNo(day)), v, day }));
    const last = pr[pr.length - 1];
    const prog = pr.length ? `<div class="grid grid-cols-[148px_minmax(0,1fr)_76px] items-center gap-x-3"><span class="text-[14px] whitespace-nowrap text-muted-foreground" title="LH 공사진행 보고 · 보고일마다 점">공정률</span><span class="relative mt-1 block h-[56px] border-t border-dashed border-border"><svg class="absolute inset-0 block size-full overflow-visible" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label="공정률 이력, 마지막 ${last.v}%"><polyline fill="none" stroke="var(--st-build)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" points="${pr.map((p) => `${(p.at * 10).toFixed(1)},${(100 - p.v).toFixed(1)}`).join(' ')}"/></svg>${pr.map((p) => `<span class="absolute size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-card" style="left:${p.at}%;top:${100 - p.v}%;background:var(--st-build)" title="${dayDot(p.day)} 보고 ${p.v}%"></span>`).join('')}<span class="absolute -translate-y-1/2 pl-2 text-[12px] font-bold whitespace-nowrap tabular-nums ${last.at > 85 ? '-translate-x-full pr-2 pl-0' : ''}" style="left:${last.at}%;top:${100 - last.v}%;color:var(--st-build-ink)">${last.v}%</span></span><span></span></div>` : '';
    const OV = 'pointer-events-none absolute inset-y-0 right-[88px] left-[160px]';
    /* 범례: 이 사업 타임라인에 그린 표지만 */
    const lg = [
      used.base && ['size-[9px] rotate-45 border-2 border-mute bg-card', '당초', '최초 약속 일정(기준선)'],
      used.plan && ['h-[9px] w-4 rounded-[2px] border-[1.5px] border-dashed border-mute [background:color-mix(in_srgb,var(--mute)_22%,var(--card))]', '현재 예정', '원장 현재 예정(CURRENT) 하나'],
      used.actual && ['h-[5px] w-4 bg-mute', '실제', '원천에서 확인한 날짜'],
      used.late && ['h-[9px] w-4 rounded-[2px] border-[1.5px] border-bad', '지연', '현재 예정일 경과 6개월 이상(1~6개월은 노란 테두리)'],
      used.hatch && [`h-[9px] w-4 rounded-[2px] border border-line2 ${HATCH_SW}`, '미확보', '예정일이 지났는데 실제 기록 없음'],
      ['h-3 w-0.5 bg-foreground', '오늘', '원장 기준일의 달'],
      pr.length && ['h-0.5 w-4 bg-[var(--st-build)]', '공정률', 'LH 공사진행 보고'],
    ].filter(Boolean);
    return {
      maxLate, hasBase: used.base,
      legend: `<ul class="m-0 flex list-none flex-wrap items-center gap-x-2.5 gap-y-0.5 p-0 text-[13px] text-muted-foreground" aria-label="범례">${lg.map(([cls, label, tip]) => `<li class="flex items-center gap-1 whitespace-nowrap" title="${esc(tip)}"><i class="block ${cls}" aria-hidden="true"></i>${label}</li>`).join('')}</ul>`,
      html: lanes.length || prog ? `<div class="relative mt-3 rounded-[10px] border border-border bg-chartbg px-5 pt-7 pb-9">
        <div class="relative flex flex-col gap-2.5">
          <span class="${OV}" aria-hidden="true">${years.map((y) => `<span class="absolute inset-y-0 border-l border-border" style="left:${(y - y0) / years.length * 100}%"></span>`).join('')}<span class="absolute -top-6 bottom-0 z-[1] border-l-2 border-foreground" style="left:${x(T)}%"></span><span class="absolute -top-[26px] pl-1.5 text-[12px] font-bold whitespace-nowrap tabular-nums ${x(T) > 85 ? '-translate-x-full pr-1.5 pl-0' : ''}" style="left:${x(T)}%">오늘 ${ymOfNo(T)}</span></span>
          ${lanes.join('')}
          ${prog}
        </div>
        <div aria-hidden="true" class="pointer-events-none absolute right-[108px] bottom-3 left-[180px] h-4 text-[13px] leading-none text-mute">${years.map((y) => `<span class="absolute -translate-x-1/2 whitespace-nowrap tabular-nums" style="left:${(y - y0 + 0.5) / years.length * 100}%">${y}</span>`).join('')}</div>
      </div>` : `<p class="m-0 mt-2 text-[14px] text-muted-foreground">단계 일정 기록 없음</p>`,
    };
  }
  /* 사업 상세(서랍 안): 머리·단계 스텝·핵심 수치·타임라인·개요·근거 */
  function renderDetail(p, from) {
    const d = D.details[p.id];
    const m = $('#moved');
    m.hidden = !from;
    if (from) m.textContent = `옛 사업 id ${from}(${D.superseded[from].name})는 이 사업으로 합쳤습니다`;
    $$('#drawer [data-f=name]').forEach((x) => { x.textContent = p.name; });
    $('#drawer [data-f=id]').textContent = p.id;
    const pol = D.policies.filter((x) => p.policies.includes(x.key));
    $('#head-badges').innerHTML = p.programs.map((g) => badge(esc(g), '프로그램')).join('')
      + pol.map((x) => badge(`${x.short} · ${p.link === 'CONFIRMED' ? '확정' : '검토 중'}`, `${x.name} · ${p.link === 'CONFIRMED' ? '담당자가 확정한 정책 연결' : '담당자 확인 전 제안 연결(검토 중) · 해제된 연결은 빠짐'}`)).join('');
    $$('#ladder [data-code]').forEach((li) => {
      const a = $('a', li), on = li.dataset.code === p.stage;
      a.href = `projects.html?stage=${['01', '02'].includes(li.dataset.code) ? 0 : { '03': 1, '04': 2, '05': 3, '06': 5 }[li.dataset.code]}`;
      a.className = on ? a.dataset.on : a.dataset.off;
      if (on) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current');
      $('[data-now]', li).hidden = !on;
    });
    const last = d.progress.length ? d.progress[d.progress.length - 1] : null;
    $('#kpis').innerHTML = kpi({ label: '계획', value: p.units > 0 ? fmt(p.units) : '—', unit: p.units > 0 ? '호' : '', sub: p.units > 0 ? '' : '호수 미확인', tip: '사업 계획 호수(원장의 첫 물량)' })
      + (p.notice != null ? kpi({ label: '공고 확인', value: fmt(p.notice), tone: 'var(--st-sale)', sub: p.units > 0 ? `계획의 ${(p.notice / p.units * 100).toFixed(0)}%` : '', tip: '모집공고에서 확인한 호수(공고 확인 ≠ 준공)' }) : '')
      + (last ? kpi({ label: '공정률', value: String(last[1]), unit: '%', tone: 'var(--st-build)', sub: `보고 ${dayDot(last[0])}`, tip: 'LH 공사진행 보고의 마지막 값' }) : '');
    const tl = timeline(d, D.meta.referenceDate);
    $('#timeline').innerHTML = tl.html;
    $('#tl-legend').innerHTML = tl.legend;
    $('#tl-status').innerHTML = `<span title="${STATUS[p.status].tip}">${STATUS[p.status].n}</span>${tl.hasBase ? '' : ` · ${markGray('기준선 없음', '최초 약속 일정(당초)이 원장(plan_basis)·HOME(execution_schedule)에 없어 당초 줄을 그리지 않음 — 지연은 현재 예정일 경과로만 판정')}`}`;
    const bjd = d.bjd.length ? d.bjd.join(', ') : null;
    $('#facts').innerHTML = `<div><dt>시군구</dt><dd><a href="projects.html?sgg=${p.sgg}" title="이 시군구로 거른 사업 목록">${esc(p.sggName)}</a></dd></div>`
      + `<div><dt>위치</dt><dd>${d.loc ? `<span title="${esc(d.loc.basis)}">${LOC[d.loc.by] ?? d.loc.by}</span>` : markNone('좌표 없음')}${bjd ? `<span class="text-muted-foreground tabular-nums" title="법정동 코드"> · ${bjd}</span>` : ''}</dd></div>`
      + `<div><dt>시행</dt><dd title="${AGENCY_TIP[p.agency]}">${p.agency === '기타' ? markNone('미확인', AGENCY_TIP.기타) : p.agency}</dd></div>`
      + `<div><dt>구분</dt><dd title="${esc(d.basis ?? '')}">${SCOPE[d.scope] ?? d.scope} · ${UNIT[d.unit] ?? d.unit}</dd></div>`
      + `<div><dt>정책 연결</dt><dd>${pol.length ? pol.map((x) => `${x.short} <span class="text-muted-foreground">${p.link === 'CONFIRMED' ? '확정' : '검토 중'}</span>`).join(' · ') : markNone('연결 없음')}</dd></div>`;
    $('#infra-link').innerHTML = panelLink(`https://housing-board.vercel.app/map?project=${p.id}`, '기반시설 점검', '지도에서 이 사업 주변 교통·교육·전기 기반시설 점검(2026.08.19 지시)');
    $('#area-link').href = `region.html?sido=${p.sido}`;
    const R = D.refs;
    $('#evidence').innerHTML = d.refs.map((ref) => { const s = R[ref]; return s ? `<dt>원천</dt><dd>${esc(s.provider)} · ${esc(s.dataset)}<span class="text-muted-foreground tabular-nums">${s.asOf ? ` · 기준 ${dayDot(s.asOf)}` : ''}${s.collectedAt ? ` · 수집 ${dayDot(s.collectedAt)}` : ''}</span></dd>` : ''; }).join('')
      + `<dt>기준일</dt><dd class="tabular-nums">원장 ${dayDot(D.meta.referenceDate)} · 발급 ${dayDot(d.issuedAt)} · 사업 ${dayDot(d.asOf)}</dd>`
      + (Object.keys(d.baseline).length ? `<dt>기준선</dt><dd>${Object.entries(d.baseline).map(([k, v]) => `${EV[k]} ${ymDot(String(v))}`).join(' · ')}</dd>` : '');
    $('#evidence-meta').textContent = `원천 ${d.refs.length}곳 · 판 ${D.meta.dumpEdition}`;
  }

  /* ----- 지역 공급(/region): 옛 우리 동네 + 공급 실적 ----- */
  /* ----- 공급 실적(/area) ----- */
  const METRIC = { permit: ['인허가', 'var(--st-permit)'], start: ['착공', 'var(--st-build)'], sale: ['분양', 'var(--st-sale)'], complete: ['준공', 'var(--st-soon)'] };
  const METRO = ['11', '28', '41'];
  /* 월 자료 → 해마다 { year, value, months, first, last, complete, provisional } */
  function yearly(months, arr, provisional, fromYear) {
    const out = new Map();
    months.forEach((ym, i) => {
      const y = Number(ym.slice(0, 4)); if (y < fromYear) return;
      const e = out.get(y) ?? { year: y, value: null, months: 0, first: null, last: null, provisional: false };
      out.set(y, e);
      if (provisional.includes(ym)) e.provisional = true;
      const v = arr[i]; if (v == null) return;
      const mo = Number(ym.slice(5, 7));
      e.value = (e.value ?? 0) + v; e.months += 1; e.first = e.first === null ? mo : Math.min(e.first, mo); e.last = e.last === null ? mo : Math.max(e.last, mo);
    });
    return [...out.values()].sort((a, b) => a.year - b.year).map((e) => ({ ...e, complete: e.months === 12 }));
  }
  /* 시도 하나의 연도별 실적: 통계누리 2022~(월 합). 서울·인천·경기는 2018~2021을 HOME 통계(같은 통계누리 시도 자료 — 2022~2025 값 일치)로 앞에 잇는다 */
  function regionYears(metric, code) {
    const N = D.annual.nation, M = D.annual.metro;
    const years = yearly(N.months, N.series[metric][code || '00'], N.provisional, 2022);
    if (!METRO.includes(code)) return { years, spliced: false };
    const early = metric === 'permit'
      ? [2018, 2019, 2020, 2021].map((y) => { const v = M.yearly.permit[code][y] ?? null; return { year: y, value: v, months: v === null ? 0 : 12, first: 1, last: 12, complete: v !== null, provisional: false }; })
      : yearly(M.months, M.series[metric][code], M.provisional, 2018).filter((y) => y.year < 2022);
    return { years: [...early, ...years], spliced: true };
  }
  function bars({ labels, values, color, label, partialLast, partialTitle, yoy }) {
    const n = values.length, max = niceMax(Math.max(1, ...values.filter((v) => v != null))), ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => max * f);
    const W = 100;
    return `<div data-slot="chart-frame" class="relative mt-3 rounded-[10px] border border-border bg-chartbg pt-6 pr-5 pb-10 pl-[72px]">
      <div aria-hidden="true" class="pointer-events-none absolute top-6 bottom-10 left-0 w-[64px] text-[13px] leading-none text-mute">${ticks.map((v, i) => `<span class="absolute right-0 -translate-y-1/2 whitespace-nowrap tabular-nums" style="top:${i / 4 * 100}%">${man(v)}</span>`).join('')}</div>
      <div class="relative h-[260px]">
        <svg preserveAspectRatio="none" viewBox="0 0 ${n * W} 1000" class="absolute inset-0 block size-full overflow-visible" role="img" aria-label="${esc(label)}">
          ${ticks.map((v) => `<line x1="0" x2="${n * W}" y1="${1000 - v / max * 1000}" y2="${1000 - v / max * 1000}" stroke="var(--border)" vector-effect="non-scaling-stroke"/>`).join('')}
          ${values.map((v, i) => (v == null ? '' : `<rect class="q-grow-y" x="${i * W + W * 0.22}" width="${W * 0.56}" y="${1000 - v / max * 1000}" height="${v / max * 1000}" style="fill:${partialLast && i === n - 1 ? `color-mix(in srgb,${color} 38%,var(--chartbg))` : color};--i:${i * 0.5}"${partialLast && i === n - 1 ? ` stroke="${color}" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"` : ''}><title>${labels[i]}${partialLast && i === n - 1 ? ` ${partialTitle}` : ''} — ${fmt(v)}호</title></rect>`)).join('')}
        </svg>
        ${values.map((v, i) => (v == null ? `<span class="absolute bottom-0 h-[38%] -translate-x-1/2 border border-line2 ${HATCH}" style="left:${(i + 0.5) / n * 100}%;width:${56 / n}%" title="${labels[i]} 자료 없음"></span><span class="absolute -translate-x-1/2 text-[12px] whitespace-nowrap text-muted-foreground" style="left:${(i + 0.5) / n * 100}%;bottom:calc(38% + 3px)">자료 없음</span>` : '')).join('')}
        ${yoy ? values.map((v, i) => { const t = yoy(i); return t && v != null ? `<span class="absolute -translate-x-1/2 text-[12px] whitespace-nowrap tabular-nums" style="left:${(i + 0.5) / n * 100}%;bottom:calc(${v / max * 100}% + 3px)">${t}</span>` : ''; }).join('') : ''}
      </div>
      <div aria-hidden="true" class="pointer-events-none absolute right-5 bottom-3 left-[72px] h-4 text-[13px] leading-none text-mute">${labels.map((y, i) => (n > 14 && i % 3 !== n % 3 - 1 && i !== n - 1 ? '' : `<span class="absolute -translate-x-1/2 whitespace-nowrap tabular-nums" style="left:${(i + 0.5) / n * 100}%">${y}</span>`)).join('')}</div>
    </div>`;
  }
  const delta = (cur, prev) => (cur != null && prev ? (cur - prev) / prev * 100 : null);

  /* ----- 우리 동네(/my-area/[sido]) ----- */
  const CAL_TYPE = { SUPPLY_NOTICE: ['모집', 'var(--st-sale)', 'var(--st-sale-ink)'], COMPLETION: ['준공', 'var(--st-soon)', 'var(--st-soon-ink)'], MOVE_IN: ['입주', 'var(--st-move)', 'var(--st-move-ink)'] };
  const COND_TIP = '숫자마다 기준연도가 다릅니다 · 재고−가구 차이는 공급 부족 확정치가 아님(공실·점유·실입주량은 이 자료에 없음) · KOSIS·SGIS(HOME 지역 지표)';
  const latest = (s) => { const k = Object.keys(s ?? {}).sort(); return k.length ? { period: k[k.length - 1], value: s[k[k.length - 1]] } : null; };
  function stockLines(f, name) {
    const actual = Object.keys(f.housing_units).filter((y) => y in f.households).map(Number).sort((a, b) => a - b);
    const lastA = actual[actual.length - 1];
    const fc = Object.keys(f.forecast_households ?? {}).map(Number).filter((y) => y > lastA).sort((a, b) => a - b);
    const yrs = [...actual, ...fc], n = yrs.length;
    const stock = actual.map((y) => f.housing_units[y]), house = actual.map((y) => f.households[y]), proj = [f.households[lastA], ...fc.map((y) => f.forecast_households[y])];
    const all = [...stock, ...house, ...proj];
    const span0 = Math.min(...all), span1 = Math.max(...all), pad = (span1 - span0) * 0.08;
    const step = niceMax((span1 - span0) / 4) / 2 || 1;
    const lo = Math.floor((span0 - pad) / step) * step, hi = Math.ceil((span1 + pad) / step) * step;
    const X = (i) => (i + 0.5) / n * 1000, Y = (v) => (1 - (v - lo) / (hi - lo)) * 260;
    const pts = (vals, from) => vals.map((v, i) => `${X(i + from).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    const ticks = []; for (let v = hi; v >= lo; v -= step) ticks.push(v);
    const dots = (vals, from, c, lbl) => vals.map((v, i) => `<span class="absolute size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-chartbg" style="left:${X(i + from) / 10}%;top:${Y(v) / 260 * 100}%;background:${c}" title="${yrs[i + from]} ${lbl} ${fmt(v)}"></span>`).join('');
    const li = actual.length - 1;
    return `<div data-slot="chart-frame" class="relative mt-3 rounded-[10px] border border-border bg-chartbg pt-4 pr-5 pb-10 pl-[72px]">
      <div aria-hidden="true" class="pointer-events-none absolute top-4 bottom-10 left-0 w-[64px] text-[13px] leading-none text-mute">${ticks.map((v) => `<span class="absolute right-0 -translate-y-1/2 whitespace-nowrap tabular-nums" style="top:${Y(v) / 260 * 100}%">${man(v)}</span>`).join('')}</div>
      <div class="relative h-[240px]">
        <svg preserveAspectRatio="none" viewBox="0 0 1000 260" class="absolute inset-0 block size-full overflow-visible" role="img" aria-label="${esc(name)} 주택 재고와 일반가구 ${actual[0]}~${lastA}, 장래가구 추계">
          ${ticks.map((v) => `<line x1="0" x2="1000" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--border)" vector-effect="non-scaling-stroke"/>`).join('')}
          <line x1="${X(li + 0.5)}" x2="${X(li + 0.5)}" y1="0" y2="260" stroke="var(--line2)" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>
          <g class="q-sweep"><polyline fill="none" stroke="var(--chart-1)" stroke-width="2.4" vector-effect="non-scaling-stroke" stroke-linejoin="round" points="${pts(stock, 0)}"/>
          <polyline fill="none" stroke="var(--chart-5)" stroke-width="2.4" vector-effect="non-scaling-stroke" stroke-linejoin="round" points="${pts(house, 0)}"/>
          <polyline fill="none" stroke="var(--chart-5)" stroke-width="2.4" stroke-dasharray="7 5" vector-effect="non-scaling-stroke" stroke-linejoin="round" points="${pts(proj, li)}"/></g>
        </svg>
        ${dots(stock, 0, 'var(--chart-1)', '주택 재고')}${dots(house, 0, 'var(--chart-5)', '일반가구')}
        <span class="absolute top-0 pl-1.5 text-[12px] text-muted-foreground" style="left:${X(li + 0.5) / 10}%">추계</span>
      </div>
      <div aria-hidden="true" class="pointer-events-none absolute right-5 bottom-3 left-[72px] h-4 text-[13px] leading-none text-mute">${yrs.map((y, i) => (n > 14 && i % 2 ? '' : `<span class="absolute -translate-x-1/2 whitespace-nowrap tabular-nums" style="left:${(i + 0.5) / n * 100}%">${y}</span>`)).join('')}</div>
    </div>`;
  }
  /* 앞으로 12개월: 파동 타임라인(달마다 사업 조각을 호수만큼 쌓음) · 지도(원 넓이 = 호수) · 고른 달 목록. 세 블록이 같은 고른 달·종류를 쓴다 */
  const KINDS = Object.keys(CAL_TYPE);
  const LOC_NAME = { block: 'LH 블록 대표점', address: '주소 근사점', district: '지구 대표점', area: '근사 위치(시군구·동)', rep: '대표 위치(시군구 중심)' };
  const hollow = (e) => e.pk === 'rep' || e.pk === 'area';
  const dayText = (e) => (e.day ? `${Number(e.day.slice(5, 7))}월 ${Number(e.day.slice(8, 10))}일` : `${Number(e.ym.slice(5, 7))}월 중`);
  const kindChip = (t) => `<span class="inline-block flex-none rounded-full px-2 text-[12px] leading-[19px] font-bold whitespace-nowrap" style="background:${light(CAL_TYPE[t][1], 16)};color:${CAL_TYPE[t][2]}">${CAL_TYPE[t][0]}</span>`;
  const WAVE_H = 260, LIST_N = 8;
  PAGES.region = () => {
    /* m = 고른 달(주소 ?m=), hover = 마우스를 올린 달(지도만), hl = 누른 사업, hot = 목록·조각에 올린 사업, more = 목록 다 보기 */
    const C = { m: new URLSearchParams(location.search).get('m'), hover: null, hl: null, hot: null, more: false, key: '' };
    let cur = null;
    const hud = $('#cal-hud');
    const showHud = (ev, html) => {
      if (html) hud.innerHTML = html;
      hud.hidden = false;
      const r = hud.getBoundingClientRect();
      let x = ev.clientX + 14, y = ev.clientY + 16;
      if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
      if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - 16;
      hud.style.left = `${x}px`; hud.style.top = `${y}px`;
    };
    const hudHtml = (e, withLoc) => `<b class="block">${esc(e.name)}</b><span class="block tabular-nums"><b style="color:${CAL_TYPE[e.type][2]}">${CAL_TYPE[e.type][0]}</b> · ${dayText(e)} · ${e.units ? `${fmt(e.units)}호` : '호수 미확인'}</span><span class="block text-muted-foreground">${esc(sggLabel(e.sgg, e.sd, !!cur.sido))}${withLoc && e.pk ? ` · ${LOC_NAME[e.pk]}` : ''}</span>`;
    const setUrlM = (m) => { const q = new URLSearchParams(location.search); if (m) q.set('m', m); else q.delete('m'); const t = q.toString(); history.replaceState(null, '', (t ? `?${t}` : location.pathname) + location.hash); };

    function wave(anim) {
      const { months, byM } = cur, nowM = D.meta.referenceDate.slice(0, 7);
      const tot = months.map((m) => sum(byM[m], (e) => e.units));
      const max = niceMax(Math.max(1, ...tot));
      const cols = months.map((m, i) => {
        const xs = byM[m], on = m === C.m;
        /* 시도: 조각 = 사업 하나. 전국: 사업이 많아(달마다 수백) 조각 대신 종류별로 묶는다 */
        const segs = !cur.sido ? KINDS.map((t) => { const ys = xs.filter((e) => e.type === t), u = sum(ys, (e) => e.units); return u ? `<span class="relative block w-full flex-none border-t border-chartbg" style="height:${u / max * 100}%;background:${CAL_TYPE[t][1]}" title="${esc(`${monthLabel(m)} ${CAL_TYPE[t][0]} ${ys.length}곳 · ${fmt(u)}호`)}"></span>` : ''; }).join('') : [...xs].sort((a, b) => KINDS.indexOf(a.type) - KINDS.indexOf(b.type) || b.units - a.units).map((e) => (e.units
          ? `<span data-seg="${e.k}" class="relative block min-h-[3px] w-full flex-none border-t border-chartbg data-[hl]:z-[1] data-[hl]:outline-2 data-[hl]:outline-foreground" style="height:${e.units / max * 100}%;background:${CAL_TYPE[e.type][1]}"></span>`
          : `<span data-seg="${e.k}" class="relative block h-[7px] w-full flex-none border border-b-0 ${HATCH_SW} data-[hl]:z-[1] data-[hl]:outline-2 data-[hl]:outline-foreground" style="border-color:${CAL_TYPE[e.type][1]}"></span>`)).join('');
        return `<button type="button" role="radio" aria-checked="${on}" data-m="${m}" ${xs.length ? `tabindex="${on ? 0 : -1}"` : 'disabled'} aria-label="${monthLabel(m)} ${xs.length}곳 ${fmt(tot[i])}호"
          class="btn-reset group/m flex min-w-0 flex-col items-center rounded-[8px] px-0.5 pt-1 pb-0.5 enabled:cursor-pointer enabled:hover:bg-[color-mix(in_srgb,var(--pn2)_70%,transparent)] aria-checked:bg-[color-mix(in_srgb,var(--primary)_9%,transparent)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">
          <span class="flex h-[36px] flex-col items-center justify-end leading-[1.25] tabular-nums">${xs.length ? `<b class="text-[13px] whitespace-nowrap">${man(tot[i])}<small class="ml-px text-[11px] font-normal text-muted-foreground">호</small></b><span class="text-[12px] whitespace-nowrap text-muted-foreground">${xs.length}곳</span>` : ''}</span>
          <span class="relative flex w-full flex-col-reverse items-center" style="height:${WAVE_H}px">${xs.length
            ? `<span class="flex h-full w-[min(30px,62%)] flex-col-reverse [&>span:last-child]:rounded-t-[3px]${anim ? ' q-grow-y' : ''}" style="--i:${i}">${segs}</span>`
            : '<span class="text-[12px] leading-none text-muted-foreground">없음</span><span class="mb-1 block h-[5px] w-px bg-line2"></span>'}</span>
          <span class="mt-1.5 flex flex-col items-center leading-[1.25]"><span class="rounded-full px-1.5 text-[13px] whitespace-nowrap tabular-nums group-aria-checked/m:bg-primary group-aria-checked/m:font-bold group-aria-checked/m:text-primary-foreground">${Number(m.slice(5))}월</span><span class="h-4 text-[11px] whitespace-nowrap text-muted-foreground">${m === nowM ? '이번 달' : m.endsWith('-01') ? m.slice(0, 4) : ''}</span></span>
        </button>`;
      }).join('');
      /* 눈금 3개(0·절반·최대). 위치 = 달 머리(4+36px) 아래 막대 영역 */
      const ticks = [max, max / 2, 0];
      return `<div data-slot="chart-frame" class="relative h-full rounded-[10px] border border-border bg-chartbg py-2.5 pr-3 pl-[54px]">
        <div class="relative">
          <div aria-hidden="true" class="pointer-events-none absolute inset-x-0" style="top:40px;height:${WAVE_H}px">${ticks.map((v, i) => `<span class="absolute inset-x-0 border-t border-border" style="top:${i * 50}%"></span><span class="absolute right-[calc(100%+8px)] -translate-y-1/2 text-[12px] leading-none whitespace-nowrap text-mute tabular-nums" style="top:${i * 50}%">${man(v)}</span>`).join('')}</div>
          <div role="radiogroup" aria-label="달 고르기" class="relative grid grid-cols-12">${cols}</div>
        </div>
      </div>`;
    }

    function mapShell() {
      /* 지도는 경계가 있는 서울·인천·경기만. 없으면 칸째 빼고 파동이 폭을 다 쓴다 */
      const V = D.areaMap.view[cur.sido], M = $('#cal-map');
      M.hidden = !V;
      $('#cal-grid').className = V ? 'grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-3.5 narrow:grid-cols-1' : 'grid grid-cols-1';
      if (!V) return;
      const sgg = D.areaMap.sgg;
      M.innerHTML = `<div data-slot="chart-frame" class="relative h-full min-h-[340px] overflow-hidden rounded-[10px] border border-border bg-chartbg">
        <svg data-map viewBox="${V.join(' ')}" preserveAspectRatio="xMidYMid meet" class="absolute top-2 left-2 block h-[calc(100%-16px)] w-[calc(100%-16px)]" role="img" aria-label="${esc(D.sido[cur.sido])} 예정 사업 위치(목록과 같은 사업)">
          <g stroke-linejoin="round">${sgg.filter((g) => g.s !== cur.sido).map((g) => `<path d="${g.d}" fill="none" stroke="var(--border)" vector-effect="non-scaling-stroke"/>`).join('')}${sgg.filter((g) => g.s === cur.sido).map((g) => `<path d="${g.d}" fill="var(--card)" stroke="var(--line2)" vector-effect="non-scaling-stroke"><title>${esc(g.n)}</title></path>`).join('')}</g>
          <g fill="color-mix(in srgb,var(--muted-foreground) 20%,transparent)" aria-hidden="true">${D.areaMap.districts.map((x) => `<path d="${x.d}"><title>${esc(x.n)}</title></path>`).join('')}</g>
          <g data-dots></g>
        </svg>
        <ul class="pointer-events-auto absolute bottom-2 left-3 m-0 flex list-none flex-wrap items-center gap-x-2.5 p-0 text-[12px] text-muted-foreground" aria-label="지도 범례">
          <li class="flex items-center gap-1" title="원 넓이 = 호수(호수 미확인은 가장 작은 원)"><i class="block size-[9px] rounded-full bg-mute" aria-hidden="true"></i>원 넓이 = 호수</li>
          <li class="flex items-center gap-1" title="정확한 좌표가 없어 시군구 중심(또는 시군구·동 근사 위치)에 둔 사업"><i class="block size-[9px] rounded-full border-[1.5px] border-mute" aria-hidden="true"></i>대표 위치</li>
          <li class="flex items-center gap-1" title="공공주택지구 공동주택용지(V-World LT_C_LHBLPN)"><i class="block size-[9px] rounded-[2px]" style="background:color-mix(in srgb,var(--muted-foreground) 20%,transparent)" aria-hidden="true"></i>지구</li>
        </ul>
      </div>`;
    }

    function dots() {
      const svg = $('[data-map]');
      if (!svg) return;
      const V = D.areaMap.view[cur.sido], box = svg.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const k = Math.max(V[2] / box.width, V[3] / box.height);   // 지도 단위 / 화면 px
      const maxU = Math.max(1, ...cur.all.map((e) => e.units));
      const act = C.hover ?? C.m, hot = C.hot ?? C.hl;
      const pts = cur.list.filter((e) => e.pt).sort((a, b) => (a.ym === act) - (b.ym === act) || b.units - a.units);
      const rOf = (e) => (e.units ? Math.max(4, 17 * Math.sqrt(e.units / maxU)) : 4) * k;
      let ring = '';
      $('[data-dots]', svg).innerHTML = pts.map((e) => {
        const on = e.ym === act, c = CAL_TYPE[e.type][1], [x, y] = e.pt, r = rOf(e);
        if (e.k === hot) ring = `<circle cx="${x}" cy="${y}" r="${r + 3 * k}" fill="none" stroke="var(--foreground)" stroke-width="2" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
        return hollow(e)
          ? `<circle data-dot="${e.k}" cx="${x}" cy="${y}" r="${r}" fill="var(--chartbg)" fill-opacity="${on ? 0.7 : 0}" stroke="${c}" stroke-width="${on ? 2 : 1.2}" stroke-opacity="${on ? 1 : 0.4}" vector-effect="non-scaling-stroke" class="cursor-pointer"/>`
          : `<circle data-dot="${e.k}" cx="${x}" cy="${y}" r="${r}" fill="${c}" fill-opacity="${on ? 0.9 : 0.22}" stroke="${on ? 'var(--card)' : 'none'}" stroke-width="1" vector-effect="non-scaling-stroke" class="cursor-pointer"/>`;
      }).join('') + ring;
    }

    function listHtml() {
      if (!cur.list.length) return `<p class="m-0 text-[14px] text-muted-foreground">12개월 안 예정 없음</p>`;
      const xs = cur.byM[C.m] ?? [], shown = C.more ? xs : xs.slice(0, LIST_N), hot = C.hot ?? C.hl;
      return `<div class="mb-1 flex flex-wrap items-baseline gap-x-3"><h3 class="m-0 text-[16px] font-bold">${monthLabel(C.m)}</h3><span class="text-[14px] text-muted-foreground tabular-nums">${xs.length}곳 · ${fmt(sum(xs, (e) => e.units))}호</span></div>
        <ol class="m-0 list-none columns-2 gap-x-8 p-0 narrow:columns-1" aria-label="${monthLabel(C.m)} 예정 사업">${shown.map((e) => {
          const href = e.issued && D.details[e.id] ? `projects.html?id=${e.id}` : '';
          return `<li data-row="${e.k}"${e.k === hot ? ' data-hl' : ''} class="flex break-inside-avoid items-center gap-x-3 border-b border-border px-1 py-1.5 text-[14px] leading-[1.5] data-[hl]:bg-[color-mix(in_srgb,var(--primary)_9%,transparent)]">${kindChip(e.type)}
            <span class="min-w-0 flex-1 truncate font-bold" title="${esc(e.name)}">${href ? `<a href="${href}" class="text-foreground no-underline underline-offset-[3px] hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">${esc(e.name)}</a>` : esc(e.name)}</span>
            <span class="w-[74px] flex-none whitespace-nowrap text-muted-foreground tabular-nums">${dayText(e)}</span>
            <span class="w-[96px] flex-none truncate text-muted-foreground" title="${esc(e.sgg)}">${esc(sggLabel(e.sgg, e.sd, !!cur.sido))}</span>
            <span class="w-[68px] flex-none text-right whitespace-nowrap tabular-nums">${e.units ? `${fmt(e.units)}호` : markNone('미확인', '호수 미확인')}</span>
            <span class="w-4 flex-none">${href ? `<a href="${href}" tabindex="-1" aria-hidden="true" class="flex text-muted-foreground hover:text-primary">${icon('chevron-right', 'size-4')}</a>` : ''}</span></li>`;
        }).join('')}</ol>${xs.length > shown.length ? `<button type="button" data-more class="btn-reset ${PANEL_LINK} mt-2 cursor-pointer">더 보기 · 외 ${xs.length - shown.length}곳 ${fmt(sum(xs.slice(LIST_N), (e) => e.units))}호</button>` : ''}`;
    }

    function render(anim) {
      $('#wave').innerHTML = wave(anim);
      mapShell();
      $('#cal-list').innerHTML = listHtml();
      paintHot();   // 누른 사업 강조(조각·행)와 지도 원
    }
    function paintHot() {
      const hot = C.hot ?? C.hl;
      $$('#wave [data-seg]').forEach((x) => x.toggleAttribute('data-hl', x.dataset.seg === hot));
      $$('#cal-list [data-row]').forEach((x) => x.toggleAttribute('data-hl', x.dataset.row === hot));
      dots();
    }
    function pick(m, hl = null, focus = false) {
      if (!cur.byM[m]?.length) return;
      C.m = m; C.hl = hl; C.hot = null;
      const xs = cur.byM[m];
      C.more = hl ? xs.findIndex((e) => e.k === hl) >= LIST_N : false;
      setUrlM(m);
      render(false);
      if (focus) $(`#wave [data-m="${m}"]`).focus();
      if (hl) { const row = $(`#cal-list [data-row="${CSS.escape(hl)}"]`); if (row) row.scrollIntoView({ block: 'nearest' }); }
    }
    const byK = (k) => cur.list.find((e) => e.k === k);

    /* 이벤트(한 번만 단다): 조각·원은 마우스용 HUD, 키보드는 달 단추(←→)와 목록 링크가 같은 정보를 준다 */
    const wv = $('#wave'), mp = $('#cal-map'), ls = $('#cal-list');
    wv.addEventListener('click', (ev) => { const b = ev.target.closest('[data-m]'); if (!b || b.disabled) return; const seg = ev.target.closest('[data-seg]'); pick(b.dataset.m, seg ? seg.dataset.seg : null); });
    wv.addEventListener('keydown', (ev) => {
      const b = ev.target.closest('[data-m]'); if (!b) return;
      const ok = cur.months.filter((m) => cur.byM[m].length), i = ok.indexOf(b.dataset.m);
      const n = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: ok.length - 1 }[ev.key];
      if (n === undefined || !ok.length) return;
      ev.preventDefault(); pick(ok[(n + ok.length) % ok.length], null, true);
    });
    wv.addEventListener('mouseover', (ev) => {
      const b = ev.target.closest('[data-m]'), seg = ev.target.closest('[data-seg]');
      const m = b && !b.disabled ? b.dataset.m : null;
      if (m !== C.hover) { C.hover = m; dots(); }
      if (seg) showHud(ev, hudHtml(byK(seg.dataset.seg), false)); else hud.hidden = true;
    });
    wv.addEventListener('mousemove', (ev) => { if (!hud.hidden) showHud(ev); });
    wv.addEventListener('mouseleave', () => { C.hover = null; hud.hidden = true; dots(); });
    mp.addEventListener('mouseover', (ev) => { const d = ev.target.closest('[data-dot]'); if (d) showHud(ev, hudHtml(byK(d.dataset.dot), true)); else hud.hidden = true; });
    mp.addEventListener('mousemove', (ev) => { if (!hud.hidden) showHud(ev); });
    mp.addEventListener('mouseleave', () => { hud.hidden = true; });
    mp.addEventListener('click', (ev) => { const d = ev.target.closest('[data-dot]'); if (d) { hud.hidden = true; const e = byK(d.dataset.dot); pick(e.ym, e.k); } });
    const rowIn = (ev) => { const r = ev.target.closest('[data-row]'); const k = r ? r.dataset.row : null; if (k !== C.hot) { C.hot = k; paintHot(); } };
    ls.addEventListener('mouseover', rowIn);
    ls.addEventListener('focusin', rowIn);
    ls.addEventListener('mouseleave', () => { C.hot = null; paintHot(); });
    ls.addEventListener('focusout', (ev) => { if (!ls.contains(ev.relatedTarget)) { C.hot = null; paintHot(); } });
    ls.addEventListener('click', (ev) => { if (ev.target.closest('[data-more]')) { C.more = true; ls.innerHTML = listHtml(); } });
    if (window.ResizeObserver) new ResizeObserver(() => cur && dots()).observe(mp);

    /* 전국 = 시도 달력을 합친 것(시도 코드는 e.sd) */
    for (const [c, l] of Object.entries(D.calendar)) for (const e of l) { e.sd = c; e.k ??= `${e.id}|${e.type}`; }
    const NATION = Object.values(D.calendar).flat().sort((a, b) => (a.day ?? `${a.ym}-99`).localeCompare(b.day ?? `${b.ym}-99`) || a.name.localeCompare(b.name, 'ko'));
    const SIDO_ORDER = $$('[data-chips="sido"] [data-val]').map((b) => b.dataset.val).filter(Boolean);

    /* ② 지난 공급 실적: 고른 시도 하나의 연도별 막대. 전국일 때만 시도×연도 표 */
    function annual(s) {
      const sido = s.sido, metric = s.metric, [mname, color] = METRIC[metric];
      const rname = sido ? D.sido[sido] : '전국';
      const { years: ys, spliced } = regionYears(metric, sido);
      const N = D.annual.nation;
      const srcTip = `통계누리 주택건설실적통계 ${ymDot(N.months[0])}~${ymDot(N.months[N.months.length - 1])}(${ymDot(N.provisional[0])}~ 잠정치)${spliced ? ` · 2018~2021은 HOME 통계(통계누리 서울·경기·인천 시도 자료, 덤프 ${D.meta.dumpEdition}) — 2022~2025 값이 통계누리와 같음` : ''}`;
      const part = ys.length && !ys[ys.length - 1].complete && ys[ys.length - 1].value != null ? ys[ys.length - 1] : null;
      const span = (y) => (y.first === y.last ? `${y.first}월` : `${y.first}~${y.last}월`);
      $('#chart-title').textContent = `지난 공급 실적 · 연도별 ${mname}`;
      $('#chart-title').title = `${rname} · 호 · 막대 위는 전년 대비(두 해 모두 12/12개월일 때만) · 마지막 해가 부분 연도면 옅은 막대 · ${srcTip}`;
      $('#chart-legend').innerHTML = legend([{ label: '완결 연도', style: `background:${color}` }, ...(part ? [{ label: `${part.year} ${span(part)}`, cls: 'border border-dashed', style: `border-color:${color};background:color-mix(in srgb,${color} 38%,var(--card))`, tip: `부분 연도 · ${part.months}/12개월${part.provisional ? ' · 잠정치 포함' : ''}` }] : [])]);
      const yoyTxt = (i) => { const y = ys[i], p = ys[i - 1]; if (!y.complete && y.value != null) return `<span class="text-muted-foreground" title="부분 연도라 전년 대비를 내지 않음">${span(y)}</span>`; if (!p || !y.complete || !p.complete) return null; const dd = delta(y.value, p.value); return `<span class="${dd >= 0 ? 'text-ok' : 'text-bad'}" title="전년 대비(두 해 모두 12/12개월)">${dd >= 0 ? '▲' : '▼'} ${Math.abs(dd).toFixed(1)}%</span>`; };
      $('#chart').innerHTML = bars({ labels: ys.map((y) => String(y.year)), values: ys.map((y) => y.value), color, label: `${rname} 연도별 ${mname} 호수`, partialLast: !!part, partialTitle: part ? `${span(part)}(부분 연도)` : '', yoy: yoyTxt });
      $('#table-wrap').hidden = !!sido;
      if (sido) return;
      const row = (code, name) => { const yy = regionYears(metric, code === '00' ? '' : code).years; return { id: code, pin: code === '00' ? 'top' : undefined, attrs: code === '00' ? '' : ` data-sido="${code}"`, cells: { name, ...Object.fromEntries(yy.map((y) => [`y${y.year}`, y.value == null ? markNone() : fmt(y.value)])) }, v: Object.fromEntries(yy.map((y) => [`y${y.year}`, y.value ?? ''])) }; };
      $('#table-title').textContent = `시도별 · 연도별 ${mname}`;
      $('#table-title').title = `호 · ${srcTip} · 2026-07부터 광주·전남은 '전남광주'로 집계 · 행을 누르면 그 시도`;
      const g = mountGrid($('#table'), {
        label: `시도별 연도별 ${mname}`, search: false,
        cols: [{ key: 'name', label: '시도', text: true }, ...ys.map((y) => ({ key: `y${y.year}`, label: String(y.year), head: !y.complete && y.value != null ? ` <span class="ml-1 inline-block rounded-full border border-line2 px-1.5 text-[11px] leading-[18px] font-bold">${span(y)}</span>${y.provisional ? prov : ''}` : '' }))],
        rows: [['00', '전국'], ...SIDO_ORDER.map((c) => [c, D.sido[c]])].map(([c, nm]) => row(c, nm)),
        onRow: (tr) => tr.dataset.sido && setState('sido', tr.dataset.sido),
      });
      $$('tr[data-sido]', g).forEach((tr) => tr.classList.add('cursor-pointer'));
    }

    /* ③ 동네 여건: 자료가 있는 시도(서울·인천·경기)만 블록을 그린다 */
    function cond(sido) {
      const fct = sido ? D.areaFacts[sido] : null, have = Object.keys(D.areaFacts);
      $('#cond-wrap').hidden = !fct;
      const none = $('#cond-none');
      none.hidden = !!fct;
      if (!fct) { none.innerHTML = `동네 여건 자료: ${have.map((c) => `<button type="button" data-set="sido:${c}" class="btn-reset ${PANEL_LINK} cursor-pointer">${D.sido[c]}</button>`).join(' · ')} <span title="인구·가구·주택 재고·미분양(KOSIS·SGIS, HOME 지역 지표)은 이 세 시도만 있어 다른 시도·전국은 블록을 그리지 않음">만</span>`; return; }
      const name = D.sido[sido];
      const pop = latest(fct.population), hh = latest(fct.households), hu = latest(fct.housing_units), un = latest(fct.unsold_total);
      const unc = un ? fct.unsold_completed?.[un.period] : null;
      /* 숫자 칸은 셋: 인구 · 주택 재고(일반가구는 보조 줄) · 미분양 — 재고·가구 추이는 아래 선 그림 */
      $('#cond').innerHTML = '<div class="grid grid-cols-3 gap-2.5 mobile:grid-cols-1">'
        + kpi({ label: '인구', value: pop ? fmt(pop.value) : '–', unit: '명', sub: pop?.period, tip: '인구총조사 기반 총인구' })
        + kpi({ label: '주택 재고', value: hu ? fmt(hu.value) : '–', sub: hu ? `${hu.period}${hh ? ` · 일반가구 ${fmt(hh.value)}(${hh.period})` : ''}` : '', tip: 'KOSIS 주택 수 · 일반가구 수와 같은 연도로 비교(재고−가구 차이는 공급 부족 확정치가 아님)' })
        + kpi({ label: '미분양', value: un ? fmt(un.value) : '–', sub: un ? `${ymDot(un.period)}${unc != null ? ` · 준공 후 ${fmt(unc)}` : ''}` : '', tip: '미분양주택현황 월말 재고 · 신규 공급 실적 아님' })
        + `</div><div class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1"><h3 class="m-0 text-[16px] font-normal text-muted-foreground" title="${esc(`${name} · ${COND_TIP}`)}">주택 재고 · 일반가구</h3><span class="ml-auto">${legend([{ label: '주택 재고', style: 'background:var(--chart-1)' }, { label: '일반가구', style: 'background:var(--chart-5)' }, { label: '장래가구 추계(점선)', cls: 'border border-dashed', style: 'border-color:var(--chart-5)' }])}</span></div>`
        + stockLines(fct, name);
    }

    return {
      update(s) {
        const sido = s.sido, name = sido ? D.sido[sido] : '전국';
        document.title = `${name} 지역 공급 · 주택파동 시안 v2`;
        const all = sido ? D.calendar[sido] ?? [] : NATION;
        /* ① 앞으로 12개월: 종류 칩에 곳 수 */
        for (const t of KINDS) { const el = $(`[data-kind-n="${t}"]`); if (el) { const xs = all.filter((e) => e.type === t); el.textContent = ` ${fmt(xs.length)}`; el.title = `${name} · 1년 안 ${CAL_TYPE[t][0]} 예정 ${xs.length}곳 · ${fmt(sum(xs, (e) => e.units))}호${xs.some((e) => !e.units) ? ` · 호수 미확인 ${xs.filter((e) => !e.units).length}` : ''}`; } }
        const kinds = s.kind.split(',');
        const list = all.filter((e) => kinds.includes(e.type));
        const months = []; let k = monthNo(D.meta.calendarFrom); for (let i = 0; i < 12; i++, k++) months.push(`${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`);
        const byM = Object.fromEntries(months.map((m) => [m, list.filter((e) => e.ym === m)]));
        const key = `${sido}|${s.kind}`, changed = key !== C.key; C.key = key;
        if (!byM[C.m]?.length) { const had = C.m; C.m = months.find((m) => byM[m].length) ?? months[0]; C.more = false; if (had && new URLSearchParams(location.search).has('m')) setUrlM(null); }
        if (C.hl && !list.some((e) => e.k === C.hl)) C.hl = null;
        cur = { sido, all, list, months, byM };
        $('#cal-period').textContent = `${ymDot(months[0])} ~ ${ymDot(months[11])} · ${fmt(list.length)}곳 · ${man(sum(list, (e) => e.units))}호`;
        render(changed);
        annual(s);
        cond(sido);
      },
    };
  };

  /* ----- 데이터 원본(/sources): ① 요구사항 충족 → ② 수집 상태 → ③ 연도 확보 → ④ 연결 ----- */
  PAGES.sources = () => {
    const X = D.sources;
    /* ① 요구사항 충족: 다른 화면의 꼬리표(sources.html#F-02)가 이 행으로 온다 */
    const DIR = Object.fromEntries(D.directives.map((d) => [d.date, d]));
    const SCREEN = { projects: '사업', region: '지역 공급', sources: '데이터 원본' };
    const V = { met: `<span class="inline-flex items-center gap-1.5 font-bold"><i class="block size-[10px] flex-none rounded-[3px] bg-primary" aria-hidden="true"></i>충족</span>`, part: `<span class="inline-flex items-center gap-1.5 font-bold"><i class="block size-[10px] flex-none rounded-[3px]" style="background:color-mix(in srgb,var(--primary) 30%,var(--card))" aria-hidden="true"></i>부분</span>`, none: `<span class="inline-flex items-center gap-1.5 font-bold text-muted-foreground"><i class="block size-[10px] flex-none rounded-[3px] border border-line2 ${HATCH_SW}" aria-hidden="true"></i>없음</span>` };
    const cnt = (v) => D.requirements.filter((r) => r.verdict === v).length;
    $('#req-summary').innerHTML = `<span class="text-[14px] text-muted-foreground tabular-nums">충족 <b class="text-foreground">${cnt('met')}</b> · 부분 <b class="text-foreground">${cnt('part')}</b> · 없음 <b class="text-foreground">${cnt('none')}</b></span>`;
    const reqRoot = mountGrid($('#req-grid'), {
      label: '요구사항 충족', search: false,
      cols: [{ key: 'id', label: '요구사항', text: true }, { key: 'pri', label: '우선순위', text: true }, { key: 'dir', label: '지시', text: true }, { key: 'v', label: '판정', text: true }, { key: 'm', label: '근거 지표', text: true }, { key: 'sc', label: '화면', text: true, sort: false }],
      rows: D.requirements.map((r) => ({
        id: r.id, attrs: ` id="${r.id}" style="scroll-margin-top:96px"`,
        cells: {
          id: `<span title="${esc(`${r.criterion}\n- ${r.items.join('\n- ')}`)}"><b class="tabular-nums">${r.id}</b> ${esc(r.title)}</span>`,
          pri: `<span class="${r.priority === '필수' ? 'font-bold' : 'text-muted-foreground'}">${r.priority}</span>`,
          dir: r.dates.map((d) => `<span class="tabular-nums" title="${esc(DIR[d] ? `${DIR[d].full} ${DIR[d].event} — ${DIR[d].need}` : d)}">${d}</span>`).join(' · '),
          v: V[r.verdict],
          m: `<span title="${esc(r.tip)}" class="tabular-nums">${esc(r.metric)}</span>`,
          sc: r.screens.length ? r.screens.map((s) => `<a href="${s}.html" class="text-[14px]">${SCREEN[s]}</a>`).join(' · ') : dash('답하는 화면 없음'),
        },
        v: { id: r.id, pri: r.priority === '필수' ? 0 : r.priority === '중요' ? 1 : 2, v: VERDICT[r.verdict].sort },
      })),
    });
    const markTarget = (scroll) => {
      const h = decodeURIComponent(location.hash.slice(1));
      $$('tr[data-row]', reqRoot).forEach((tr) => tr.toggleAttribute('data-target', tr.id === h));
      const t = h && $(`tr[id="${CSS.escape(h)}"]`, reqRoot);
      if (t && scroll) t.scrollIntoView({ block: 'center' });
    };
    markTarget(true);
    addEventListener('hashchange', () => markTarget(true));

    /* ② 수집 상태: 실패·경고만 표로, 정상은 기관별로 접는다 */
    const warn = (r) => r.ok && r.partial;
    const issues = X.status.filter((r) => !r.ok || warn(r));
    const okRows = X.status.filter((r) => r.ok && !r.partial);
    const nFail = X.status.filter((r) => !r.ok).length, nWarn = X.status.filter(warn).length;
    $('#src-count').textContent = `${X.status.length}곳 · 실패 ${nFail} · 경고 ${nWarn}`;
    $('#src-count').title = `우리 원천 ${X.oursCount}곳(원천 카탈로그) · HOME 원천 ${X.homeCount}곳(덤프 수집 실행 ${fmt(X.runs.total)}회 중 실패 ${X.runs.failed}·중단 ${X.runs.interrupted})`;
    $('#src-legend').innerHTML = legend([nFail && { label: '실패', cls: 'rounded-full bg-bad' }, nWarn && { label: '경고', cls: 'rounded-full bg-warn' }, { label: '정상', cls: 'rounded-full bg-ok' }].filter(Boolean));
    mountGrid($('#src-grid'), {
      label: '실패·경고 원천', dense: true, search: false,
      cols: [{ key: 'name', label: '원천', text: true, clip: 'clamp(220px, 100vw - 1000px, 440px)' }, { key: 'owner', label: '구분', text: true }, { key: 'org', label: '기관', text: true, clip: '160px' }, { key: 'st', label: '상태', text: true }, { key: 'runs', label: '수집 실행', text: true }, { key: 'last', label: '마지막 정상 수집', text: true }, { key: 'asof', label: '원천 기준일', text: true }, { key: 'n', label: '건수' }],
      rows: issues.map((r, i) => ({
        id: String(i),
        cells: {
          name: `<span title="${esc(r.name)}">${esc(r.name)}</span>`, owner: r.owner, org: `<span title="${esc(r.org)}">${esc(r.org)}</span>`,
          st: r.ok ? `<span class="inline-flex items-center gap-1.5 font-bold text-warn" title="마지막 수집이 일부만(부분 수집)"><i class="block size-[9px] rounded-full bg-warn" aria-hidden="true"></i>경고</span>`
            : `<span class="inline-flex items-center gap-1.5 font-bold text-bad" title="${esc(`마지막 실행 ${dayDot(r.lastRun)} 실패${r.lastOk ? ' — 마지막 정상 값을 씀' : ' — 정상 수집 없음'}`)}"><i class="block size-[9px] rounded-full bg-bad" aria-hidden="true"></i>실패</span>`,
          runs: r.runs == null ? '<span class="text-muted-foreground">파일</span>' : `${r.runs}회${r.failed ? ` · <span class="text-bad">실패 ${r.failed}</span>` : ''}`,
          last: r.lastOk ? dayDot(r.lastOk) : markNone('없음'), asof: r.asOf ? dayDot(r.asOf) : dash('원천 기준일 없음'),
          n: r.count != null ? fmt(r.count) : dash(),
        },
        v: { st: r.ok ? 1 : 0, n: r.count ?? '', last: r.lastOk ?? '' },
      })),
    });
    const orgs = new Map();
    for (const r of okRows) { if (!orgs.has(r.org)) orgs.set(r.org, []); orgs.get(r.org).push(r); }
    const orgList = [...orgs].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'ko'));
    const maxDay = (rs) => rs.map((r) => r.lastOk).filter(Boolean).sort().pop();
    /* 마지막 줄 빈 칸이 적은 열 수(3·4) */
    const orgCols = [3, 4].sort((x, y) => (x - orgList.length % x) % x - (y - orgList.length % y) % y)[0];
    $('#src-orgs').innerHTML = `<h3 class="m-0 text-[16px] font-normal text-muted-foreground" title="정상 원천 — 기관을 누르면 원천마다 기준일·건수">정상 ${okRows.length}곳 · 기관 ${orgList.length}</h3><div class="mt-1.5 grid ${orgCols === 4 ? 'grid-cols-4' : 'grid-cols-3'} gap-x-8 narrow:grid-cols-2">${orgList.map(([org, rs]) => `<details class="group/o min-w-0 border-b border-border"><summary class="flex cursor-pointer list-none items-center gap-1.5 rounded-[6px] py-1.5 text-[14px] hover:bg-pn2 focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">${icon('chevron-right', 'size-3.5 flex-none text-muted-foreground transition-transform group-open/o:rotate-90')}<span class="min-w-0 flex-1 truncate font-bold" title="${esc(org)}">${esc(org)}</span><span class="flex-none text-[13px] whitespace-nowrap text-muted-foreground tabular-nums">${rs.length}곳${maxDay(rs) ? ` · ${dayDot(maxDay(rs))}` : ''}</span></summary><ul class="m-0 list-none p-0 pb-2 pl-5 text-[13px] leading-[1.5]">${rs.map((r) => `<li class="flex gap-2 py-0.5"><span class="min-w-0 flex-1 truncate" title="${esc(`${r.name} · ${r.owner}`)}">${esc(r.name)}</span><span class="flex-none text-muted-foreground tabular-nums">${r.asOf ? `기준 ${dayDot(r.asOf)}` : ''}${r.count != null ? ` · ${fmt(r.count)}` : ''}</span></li>`).join('')}</ul></details>`).join('')}</div>`;

    /* ③ 연도 확보: 빈틈 없는 원천과 올해 자료만 있는 원천은 한 줄로 접는다(2026은 진행 중인 해라 부분도 확보로 셈) */
    const MARK = { full: '확보', part: '부분', none: '미확보' };
    const now = X.years.length - 1;
    const isFull = (r) => r.cells.every((c, i) => c === 'full' || (i === now && c === 'part'));
    const onlyNow = (r) => r.cells.every((c, i) => (i === now ? c !== 'none' : c === 'none'));
    const rest = X.coverage.filter((r) => !isFull(r) && !onlyNow(r));
    const foldLine = (rs, label, tip) => (rs.length ? `<p class="m-0 mt-2 text-[14px] text-muted-foreground" title="${esc(tip)}"><b class="font-bold text-foreground">${label} ${rs.length}곳</b> · ${rs.map((r) => `<span title="${esc(r.owner)}">${esc(r.name)}</span>`).join(' · ')}</p>` : '');
    $('#coverage').innerHTML = `<div class="overflow-x-auto"><div class="grid min-w-[520px] grid-cols-[minmax(0,320px)_repeat(9,minmax(0,1fr))] items-center gap-1 text-[13px]" role="table" aria-label="원천별 연도 확보">
      <span role="columnheader"></span>${X.years.map((y) => `<span role="columnheader" class="text-center text-muted-foreground tabular-nums">${y}</span>`).join('')}
      ${rest.map((r) => `<span role="rowheader" class="truncate" title="${esc(`${r.name} · ${r.owner}`)}">${r.owner === 'HOME' ? '<span class="mr-1 text-[11px] text-muted-foreground">HOME</span>' : ''}${esc(r.name)}</span>${r.cells.map((c, i) => `<span role="cell" class="block h-[18px] rounded-[3px] ${c === 'none' ? `border border-line2 ${HATCH}` : ''}" style="${c === 'full' ? 'background:var(--primary)' : c === 'part' ? 'background:color-mix(in srgb,var(--primary) 26%,var(--card))' : ''}" title="${esc(`${r.name} · ${X.years[i]} · ${MARK[c]}`)}"><span class="sr-only">${MARK[c]}</span></span>`).join('')}`).join('')}
    </div></div>`
      + foldLine(X.coverage.filter(isFull), `${X.years[0]}~${X.years[now]} 빈틈 없음`, `모든 연도 확보(${X.years[now]}은 진행 중이라 부분 포함)`)
      + foldLine(X.coverage.filter(onlyNow), `${X.years[now]} 자료만`, `과거 연도 없이 지금 판(${X.years[now]})만 있는 원천 — 예정·현황 스냅샷`);

    /* ④ 연결 */
    const LN = { POLICY_PROGRAM: ['정책–프로그램', '정책 3건과 프로그램의 연결'], PROGRAM_PROJECT: ['프로그램–사업', '프로그램과 사업 원장 사업의 연결'] };
    $('#links').innerHTML = X.links.map((l) => { const all = l.confirmed + l.review, [nm, t] = LN[l.type]; return `<div class="flex flex-col gap-1.5" title="${t}"><div class="flex flex-wrap items-baseline justify-between gap-x-3"><b class="text-[15px]">${nm}</b><span class="text-[13px] text-muted-foreground tabular-nums">검토 중 <b class="text-[15px] text-foreground">${fmt(l.review)}</b> · 확정 <b class="text-[15px] text-foreground">${fmt(l.confirmed)}</b></span></div>${all ? `<span class="flex h-[14px] gap-px overflow-hidden" role="img" aria-label="${nm}: 확정 ${l.confirmed}, 검토 중 ${l.review}">${l.confirmed ? `<span style="width:${l.confirmed / all * 100}%;min-width:3px;background:var(--primary)" title="확정 ${fmt(l.confirmed)}"></span>` : ''}<span style="width:${l.review / all * 100}%;background:color-mix(in srgb,var(--primary) 30%,var(--card))" title="검토 중 ${fmt(l.review)}"></span></span>` : markNone('연결 없음')}</div>`; }).join('');
    return null;
  };

  PAGES.index = () => null;

  /* ---------- 시작 ---------- */
  wireShell(); wireChips();
  fetch('assets/data.json').then((r) => { if (!r.ok) throw new Error(`data.json ${r.status}`); return r.json(); }).then((data) => {
    D = data;
    paintMeta(); paintReqTags();
    const name = document.body.dataset.page;
    /* 칩 메뉴를 자료로 채운 뒤 주소를 읽는다 */
    page = PAGES[name] ? PAGES[name]() : null;
    readUrl();
    emit();
    if (page && page.start) page.start();
    window.__v2 = { D, S, setState };
  }).catch((e) => {
    const main = $('main > div');
    if (main) main.insertAdjacentHTML('beforeend', `<p role="alert" class="m-0 rounded-[12px] border border-bad bg-card px-4 py-3 text-[14px] text-bad">자료를 읽지 못했습니다: ${esc(e.message)} — 이 시안은 http 서버에서 열어야 합니다</p>`);
    console.error(e);
  });
})();
