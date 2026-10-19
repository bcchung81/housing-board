/* v10(r17 B '신문 1면': 글자 단계 44·64 · 단 상자(#sum·#mapc·.cell) 넘침 · 상태별 사업 수 .facts · 공고 상태 .nt-st · 가장 많은 해 반전 R.yrs) · v9(r15: 지시선 0 · 강조형 카드 0 · 고른 곳 면 효과 R.sel) · v8(r14: 글꼴 분포 R.type · 사업 점 R.pts · G9 새 기준) · v7 화면 측정(브라우저에서 실행, 결과 JSON). 관문: G1 넘침·잘림·오류 · G3 누르는 크기 · G5 첫 화면 · G6 라벨 겹침(실제 getBBox) ·
   G7 기둥이 가리는 면 넓이 · G9 글자 크기 · G13 문서 높이 · G14 금지어 · G15 기둥 정합. 시안 상태 막대(#demo)는 재지 않는다.
   콘솔 오류는 페이지보다 먼저 심은 window.__errs 를 읽는다(없으면 null) */
(() => {
const R = {}, vw = innerWidth, vh = innerHeight;
const vis = (el) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') return false; } return true; };
const desc = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
const skip = (el) => !!el.closest('#demo, .tip');
const pub = document.documentElement.dataset.aud === 'public';
/* G1 넘침·잘림·오류 */
const offs = [];
document.querySelectorAll('body *').forEach((el) => { if (skip(el) || !vis(el)) return; const r = el.getBoundingClientRect(); if (r.right > vw + 1 || r.left < -1) { let clipped = false; for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/hidden|clip|auto|scroll/.test(s.overflowX)) { const pr = p.getBoundingClientRect(); if (pr.right <= vw + 1 && pr.left >= -1) { clipped = true; break; } } } if (!clipped) offs.push(desc(el)); } });
const clip = []; let ell = 0, ellNoTitle = [];
document.querySelectorAll('body *').forEach((el) => { if (skip(el) || !vis(el) || el instanceof SVGElement || el.closest('.sr')) return; const s = getComputedStyle(el); if (!/hidden|clip/.test(s.overflowX + s.overflowY)) return; if (!el.textContent.trim()) return;
  const wx = /hidden|clip/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 1, hy = /hidden|clip/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1; if (!wx && !hy) return;
  if (s.textOverflow === 'ellipsis' && wx && !hy) { ell++; if (!el.closest('[title]')) ellNoTitle.push(desc(el) + ':' + el.textContent.trim().slice(0, 20)); }
  else clip.push(desc(el) + ' "' + el.textContent.trim().slice(0, 24) + '"'); });
/* 카드 밖으로 나간 자식(overflow hidden 이 아니어도): .card 마다 보이는 자손 상자가 카드 상자를 1px 넘게 벗어나면 센다 */
const outCard = [];
document.querySelectorAll('.card, #sum, #mapc, .cell').forEach((c) => { if (skip(c) || !vis(c)) return; const cb = c.getBoundingClientRect();
  c.querySelectorAll('*').forEach((el) => { if (el.closest('.sr, svg, .tip') || !vis(el)) return; const r = el.getBoundingClientRect(); if (r.left < cb.left - 1 || r.right > cb.right + 1 || r.top < cb.top - 1 || r.bottom > cb.bottom + 1) outCard.push(desc(c) + '>' + desc(el)); }); });
R.G1 = { outOfCard: outCard.length, outOfCardAt: outCard.slice(0, 4), scrollW: document.documentElement.scrollWidth, overX: document.documentElement.scrollWidth > vw, offenders: offs.slice(0, 6), clipped: clip.slice(0, 6), clippedN: clip.length, ellipsis: ell, ellipsisNoTitle: ellNoTitle.slice(0, 6), errors: window.__errs || null };
/* G3 누르는 대상 44px(::before 투명 확장 포함). 지도 면(svg)은 순위·검색이 같은 동작이라 따로 센다 */
const small = []; let tot = 0, svgN = 0;
document.querySelectorAll('a[href],button,input,summary,[role=option],[tabindex]:not([tabindex="-1"])').forEach((el) => {
  if (skip(el) || !vis(el) || (el.classList.contains('skip') && el.getBoundingClientRect().top < 0)) return;
  if (el instanceof SVGElement) { svgN++; return; }
  if (el.closest('.ac') && el.getAttribute('role') === 'option') { /* 자동완성 줄은 48px */ }
  tot++; const r = el.getBoundingClientRect(); let w = r.width, h = r.height;
  const pb = getComputedStyle(el, '::before');
  if (pb.content !== 'none' && pb.position === 'absolute') { const t = parseFloat(pb.top) || 0, b = parseFloat(pb.bottom) || 0, l = parseFloat(pb.left) || 0, rr = parseFloat(pb.right) || 0; const bt = parseFloat(getComputedStyle(el).borderTopWidth) || 0; h = Math.max(h, h - 2 * bt - t - b); w = Math.max(w, w - l - rr); }
  if (w < 43.5 || h < 43.5) small.push(desc(el) + ' ' + Math.round(w) + 'x' + Math.round(h) + ' "' + (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 14) + '"'); });
R.G3 = { total: tot, under44: small.length, items: small.slice(0, 10), svgTargets: svgN };
/* G5 첫 화면 */
const pos = (sel) => { const el = document.querySelector(sel); if (!el || !vis(el)) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), seen: Math.round(Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0))) }; };
const st = pos('#mstage') || pos('.hbars');
R.G5 = { search: pos('#q'), sentence: pos('#sum-h'), nearest: pos('#apply'), map: st, ok: null };   // r13 가장 가까운 일정 → 지금 신청 칸
R.G5.sum = pos('#sum'); R.G5.cellHead = pos('.cell-h');
if (pub) { const f = R.G5, inV = (p) => p && p.top >= 0 && p.bottom <= vh; R.G5.ok = vw >= 900 ? !!(inV(f.search) && inV(f.sum) && st && st.bottom <= vh && f.cellHead && f.cellHead.top < vh) : !!(inV(f.search) && inV(f.sentence) && (inV(f.nearest) || !f.nearest) && st && st.seen >= 120); }
/* G13 문서 높이(시안 상태 막대는 떠 있어 들지 않는다) */
const docH = document.documentElement.scrollHeight;
R.G13 = { docH, vh, ratio: +(docH / vh).toFixed(3), limit: vw >= 900 ? 1.35 : vw >= 600 ? 2 : 1.7 };
R.G13.ok = !pub || R.G13.ratio <= R.G13.limit + 1e-3;
/* G9 글자 크기(국민 영역 보이는 글자) · 지도 라벨 */
let minPub = 99, minAt = '', minLbl = 99; const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
while (tw.nextNode()) { const n = tw.currentNode; if (!n.textContent.trim()) continue; const el = n.parentElement; if (!el || skip(el) || !el.closest('.pub, .sheet') || el.closest('.sr') || !vis(el)) continue; const px = parseFloat(getComputedStyle(el).fontSize);
  if (el.closest('svg.map')) { minLbl = Math.min(minLbl, px); continue; } if (px < minPub) { minPub = px; minAt = desc(el) + ' "' + n.textContent.trim().slice(0, 12) + '"'; } }
/* r9: 본문(이름·문장·줄) 16px, 보조 15px 이상 */
const BODY = '.opt .nm, .yr-l, .ne-what, .none, .ev .when b, .pjs .ev .nm, .srow .t, .pc-tl li';
const bodyUnder16 = [...document.querySelectorAll(BODY)].filter((el) => !skip(el) && vis(el) && el.closest('.pub, .sheet') && !el.closest('.opt.more') && parseFloat(getComputedStyle(el).fontSize) < 16 && !(vw < 600 && el.closest('.loc'))).map((el) => desc(el)).slice(0, 4);
R.G9 = { minPub, minAt, minMapLabel: minLbl === 99 ? null : minLbl, bodyUnder16, ok: minPub >= 14 && bodyUnder16.length === 0 && (minLbl === 99 || minLbl >= 14) };   // r14: 본문 16 · 보조 14 · 지도 라벨 14 이상 · 12px 0
/* r14 글꼴 분포(보이는 글자 전부, 시안 상태 막대 제외): Do Hyeon 0 · 크기 8단계 밖 0 · 굵기 400·700 밖 0 · 첫 글꼴 Noto Sans KR · 실제로 실린 글꼴 */
{ const STEP = [12, 14, 16, 18, 20, 24, 30, 38, 44, 64], fam = {}, size = {}, wt = {}, badSize = [], badWt = []; let doHyeon = 0, n12 = 0; const tw4 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (tw4.nextNode()) { const nd = tw4.currentNode; if (!nd.textContent.trim()) continue; const el = nd.parentElement; if (!el || skip(el) || el.closest('.sr') || !vis(el)) continue; const cs = getComputedStyle(el), px = parseFloat(cs.fontSize), w = cs.fontWeight, f0 = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    fam[f0] = (fam[f0] || 0) + 1; size[px] = (size[px] || 0) + 1; wt[w] = (wt[w] || 0) + 1; if (/do ?hyeon/i.test(cs.fontFamily)) doHyeon++; if (px === 12 && el.closest('.pub, .sheet')) n12++;
    if (!STEP.includes(px)) badSize.push(desc(el) + ':' + px); if (w !== '400' && w !== '700') badWt.push(desc(el) + ':' + w); }
  const loaded = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '') + ' ' + f.weight);
  R.type = { doHyeon, fam, size, wt, badSize: badSize.slice(0, 6), badSizeN: badSize.length, badWt: badWt.slice(0, 6), badWtN: badWt.length, pub12: n12, loaded: [...new Set(loaded)], ok: !doHyeon && !badSize.length && !badWt.length && !n12 && Object.keys(fam).every((f) => f === 'Noto Sans KR') }; }
/* 검색 줄 이름 폭(r9): 자동완성이 열려 있으면 보이는 지역·사업 이름 폭의 최소(> 40px) */
const nmW = [...document.querySelectorAll('.ac .opt .nm')].filter(vis).map((el) => Math.round(el.getBoundingClientRect().width));
R.search = nmW.length ? { nameMinW: Math.min(...nmW), rows: nmW.length, ok: Math.min(...nmW) > 40 } : null;
/* 보이는 h1 */
R.h1 = [...document.querySelectorAll('h1')].filter(vis).map((h) => h.textContent.trim().slice(0, 30));
/* G2 대비: 국민 영역·시트의 HTML 글자(바탕 겹을 합성) 4.5:1(큰 글자 3:1), 지도 라벨은 글자색 vs 둘레(halo)색 */
const cvs = document.createElement('canvas'); cvs.width = cvs.height = 1; const cx2 = cvs.getContext('2d', { willReadFrequently: true });
const rgba = (c) => { cx2.clearRect(0, 0, 1, 1); cx2.fillStyle = '#000'; cx2.fillStyle = c; cx2.fillRect(0, 0, 1, 1); const d = cx2.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
const parse = (c) => { const m = c.match(/^rgba?\(([^)]+)\)/); if (m) { const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; } return rgba(c); };
const lum = (c) => { const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
const crt = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const over = (t, b) => { const a = t[3]; return [t[0] * a + b[0] * (1 - a), t[1] * a + b[1] * (1 - a), t[2] * a + b[2] * (1 - a), 1]; };
const bgOf = (el) => { const L = []; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c[3] > 0) { L.push(c); if (c[3] >= 1) break; } } let b = parse(getComputedStyle(document.body).backgroundColor); if (b[3] < 1) b = [255, 255, 255, 1]; for (const l of L.reverse()) b = over(l, b); return b; };
let g2min = 99, g2at = '', g2fail = 0; const tw3 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
while (tw3.nextNode()) { const n = tw3.currentNode; if (!n.textContent.trim()) continue; const el = n.parentElement; if (!el || skip(el) || !el.closest('.pub, .sheet') || el.closest('.sr, svg') || !vis(el)) continue;
  const cs = getComputedStyle(el), px2 = parseFloat(cs.fontSize), big = px2 >= 24 || (px2 >= 18.66 && parseInt(cs.fontWeight) >= 700); const r = crt(over(parse(cs.color), bgOf(el)), bgOf(el)); if (r < (big ? 3 : 4.5)) g2fail++; if (r < g2min) { g2min = r; g2at = desc(el) + ' "' + n.textContent.trim().slice(0, 10) + '"'; } }
let lbMin = 99, lbAt = ''; document.querySelectorAll('svg.map .lbls text, svg.map .hil text').forEach((t) => { if (!vis(t)) return; const cs = getComputedStyle(t); if (cs.stroke === 'none' || parseFloat(cs.strokeWidth) === 0) { const r = crt(parse(cs.fill), parse(getComputedStyle(t.parentElement.querySelector('rect') || t).fill)); if (r < lbMin) { lbMin = r; lbAt = 'box:' + t.textContent; } return; } const r = crt(parse(cs.fill), over(parse(cs.stroke), [255, 255, 255, 1])); const r2 = crt(parse(cs.fill), over(parse(cs.stroke), [10, 16, 48, 1])); const rr = Math.min(r, r2); if (rr < lbMin) { lbMin = rr; lbAt = t.textContent; } });
R.G2 = { textMin: +g2min.toFixed(2), textMinAt: g2at, textFail: g2fail, mapLabelMin: lbMin === 99 ? null : +lbMin.toFixed(2), mapLabelMinAt: lbAt };
/* G14 쉬운 말: 국민 영역 보이는 글자(시트 포함, ⓘ·시안 상태 제외) */
const BAN = ['①', '②', '③', '④', 'BL', 'D-', '원장', '완공 연도 나옴', '아직 모름', '나머지', '단계 구분도', '제곱근', '모집 시작'];   // r13 '모집 시작' → '모집 끝남'
let txt = ''; const tw2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
while (tw2.nextNode()) { const el = tw2.currentNode.parentElement; if (el && !skip(el) && el.closest('.pub, .sheet') && vis(el)) txt += tw2.currentNode.textContent + '\n'; }
R.G14 = { hits: BAN.filter((w) => (/^[A-Z]/.test(w) ? new RegExp(`(?<![A-Za-z])${w}(?![A-Za-z])`) : new RegExp(w)).test(txt)) };
/* 지도(수도권, v7d 면 돌출): G6 라벨 겹침 · G7 윗면 보이는 비율 · G15 높이 정합 */
const svg = document.querySelector('svg.map');
if (svg && vis(svg)) {
  const W = +svg.getAttribute('width'), H = +svg.getAttribute('height');
  const fgs = [...svg.querySelectorAll('.faces > .fg')];
  const uOf = Object.fromEntries(fgs.map((g) => [g.dataset.area, +g.dataset.u]));
  const lbs = [...svg.querySelectorAll('.lbls .lb-g:not(.dim)')].map((g) => { const [x, y, w, h] = g.dataset.box.split(',').map(Number); return { key: g.dataset.area, v: g.dataset.v, nm: g.dataset.nm, pill: g.classList.contains('pl'), x, y, x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2 }; });
  /* r15 지시선 0(선·닻 점·data-lead) · 덮는 강조형 0(흰 카드 .lb-hi · 흰 알약 .pill) */
  const leaders = svg.querySelectorAll('.lb-ld, .lb-ldc, .lb-dot, [data-lead]').length, hiCards = svg.querySelectorAll('.lb-hi, .lb-g .pill').length;
  const his = [...svg.querySelectorAll('.hil [data-box]')].map((g) => { const [x, y, w, h] = g.dataset.box.split(',').map(Number); return { key: g.dataset.area, x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2 }; });
  const ov = (a, b) => a.x0 < b.x1 - .5 && b.x0 < a.x1 - .5 && a.y0 < b.y1 - .5 && b.y0 < a.y1 - .5;
  /* 겹침은 그려진 글자의 실제 상자(getBBox)로 잰다: 기본 묶음(흐리게 된 것 제외)·맥락 이름·띄운 알약 */
  const gb = (el) => { const b = el.getBBox(); return { x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height }; };
  const uni = (a, b) => (a ? { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) } : b);
  const realB = [...svg.querySelectorAll('.lbls .lb-g:not(.dim)')].map((g) => { let u = null; g.querySelectorAll('text').forEach((t) => { u = uni(u, gb(t)); }); const pb2 = g.querySelector('.plb'); if (pb2) u = uni(u, gb(pb2)); return { key: g.dataset.area, nm: g.dataset.nm, ...u }; });
  const ctxEl = svg.querySelector('.lb-ctx:not(.dim)'); if (ctxEl) realB.push({ key: 'ctx', nm: ctxEl.textContent, ...gb(ctxEl) });
  svg.querySelectorAll('.hil .lb-hi').forEach((g) => realB.push({ key: 'hi:' + g.dataset.area, nm: 'hi:' + g.dataset.area, ...gb(g.querySelector('rect')) }));
  const ovAt = []; let lbOv = 0; for (let i = 0; i < realB.length; i++) for (let j = i + 1; j < realB.length; j++) if (ov(realB[i], realB[j])) { lbOv++; ovAt.push(`${realB[i].nm}×${realB[j].nm}`); }
  const pos = Object.entries(uOf).filter(([, u]) => u > 0).sort((a, b) => b[1] - a[1]), top5 = pos.slice(0, 5).map(([k2]) => k2);
  const shownK = new Set([...lbs.map((b) => b.key), ...his.map((b) => b.key)]);
  let hiOn5 = 0; for (const h of his) for (const l of lbs) if (top5.includes(l.key) && ov(h, l)) hiOn5++;
  const out = lbs.filter((b) => b.x0 < 0 || b.y0 < 0 || b.x1 > W || b.y1 > H).length;
  /* G7: .fg 순서대로 벽(0)·윗면(번호)을 칠해 남은 화소 / 그 윗면만 칠한 화소. 라벨 점이 자기 윗면 위에 보이는지도 */
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d', { willReadFrequently: true });
  const one = document.createElement('canvas'); one.width = W; one.height = H; const c1 = one.getContext('2d', { willReadFrequently: true });
  const areaPx = fgs.map((g) => { c1.clearRect(0, 0, W, H); c1.fillStyle = '#000'; c1.fill(new Path2D(g.querySelector('.f').getAttribute('d')), 'evenodd'); const d = c1.getImageData(0, 0, W, H).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] === 255) n++; return n; });   // 가장자리 번짐 화소는 양쪽 모두 뺀다
  fgs.forEach((g, i) => { const w = g.querySelector('.w'); if (w) { c.fillStyle = '#fff'; c.fill(new Path2D(w.getAttribute('d'))); } c.fillStyle = `rgb(${(i + 1) & 255},${(i + 1) >> 8},1)`; c.fill(new Path2D(g.querySelector('.f').getAttribute('d')), 'evenodd'); });
  const px = c.getImageData(0, 0, W, H).data, seen = new Float64Array(fgs.length + 1);
  for (let i = 0; i < W * H; i++) if (px[i * 4 + 2] === 1 && px[i * 4 + 3] === 255) seen[px[i * 4] + (px[i * 4 + 1] << 8)]++;
  const vr = fgs.map((g, i) => ({ key: g.dataset.area, px: areaPx[i], r: areaPx[i] ? Math.min(1, seen[i + 1] / areaPx[i]) : 1 })).filter((x) => x.px >= 4);
  const at = (x, y) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return null; const k = (y * W + x) * 4; return px[k + 2] === 1 ? fgs[px[k] + (px[k + 1] << 8) - 1]?.dataset.area : 'wall'; };
  const lbOcc = lbs.filter((b) => !b.pill && at(b.x, b.y) !== b.key).map((b) => b.key);
  const pillOff = lbs.filter((b) => b.pill && at(b.x, b.y) !== b.key).map((b) => b.key);   // 옅은 바탕 묶음 가운데가 자기 면 위가 아닌 곳(떨어진 자리)
  vr.sort((a, b) => a.r - b.r);
  const pb = svg.querySelector('.faces').getBBox();
  R.G7 = { plateUse: +Math.max(pb.width / W, pb.height / H).toFixed(2), plateWH: [Math.round(pb.width), Math.round(pb.height), W, H], minVisible: +vr[0].r.toFixed(3), minAt: `${vr[0].key}(${vr[0].px}px²)`, avgVisible: +(vr.reduce((a, b) => a + b.r, 0) / vr.length).toFixed(3), under70: vr.filter((x) => x.r < .7).map((x) => `${x.key}:${(x.r * 100).toFixed(0)}%/${x.px}px²`), labelOnOtherFace: lbOcc.length, labelOnOtherFaceAt: lbOcc.slice(0, 4), Hmax: +svg.dataset.hmax, k: +svg.dataset.k };
  const namesShown = new Set([...lbs.filter((b) => b.nm).map((b) => b.key), ...his.map((b) => b.key)]);
  /* 맥락 시도 이름: 보이는지, 시군구 묶음과 겹치지 않는지. 뺀 묶음이 어느 면 위에 놓였는지(판 바깥 여백만 허용) */
  const ctxT = svg.querySelector('.lb-ctx'); let ctxOv = 0, ctxShown = !!ctxT;
  if (ctxT) { const cb = gb(ctxT); ctxOv = realB.filter((b) => b.key !== 'ctx' && ov(b, cb)).length; }
  /* r9: 면 안 묶음의 실제 상자 중 자기 윗면 위 비율(최소, 6×3 표본) · 묶음 간 실제 간격(최소) · 무대 밖 실제 상자 수 */
  const fsh = realB.filter((b) => !b.key.startsWith('hi:') && b.key !== 'ctx' && !lbs.find((l) => l.key === b.key)?.pill).map((b) => { let n = 0; for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) if (at(b.x0 + (b.x1 - b.x0) * (i + .5) / 6, b.y0 + (b.y1 - b.y0) * (j + .5) / 3) === b.key) n++; return { key: b.key, r: n / 18 }; }).sort((a, b) => a.r - b.r);
  const base = realB.filter((b) => !b.key.startsWith('hi:'));
  let gapMin = 99, gapAt = ''; for (let i = 0; i < base.length; i++) for (let j = i + 1; j < base.length; j++) { const a = base[i], b = base[j], g = Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1); if (g < gapMin) { gapMin = g; gapAt = a.nm + '×' + b.nm; } }
  const outReal = base.filter((b) => b.x0 < 0 || b.y0 < 0 || b.x1 > W || b.y1 > H).map((b) => b.nm);
  R.G6r9 = { faceShareMin: fsh.length ? +fsh[0].r.toFixed(2) : null, faceShareMinAt: fsh[0]?.key || null, under70: fsh.filter((x) => x.r < .7).map((x) => x.key), pills: lbs.filter((b) => b.pill).map((b) => b.nm), pillOffFace: pillOff, gapMin: +gapMin.toFixed(1), gapMinAt: gapAt, outOfStageReal: outReal };
  R.G6 = { ctxShown, ctxOverlap: ctxOv, leaders, hiCards, namesShown: namesShown.size, faceCount: fgs.length, nameRatio: +(namesShown.size / fgs.length).toFixed(2), labels: lbs.length, faces: pos.length, labelOverlap: lbOv, labelOverlapAt: ovAt.slice(0, 4), top10Num: pos.slice(0, 10).filter(([k2]) => lbs.some((b) => b.key === k2 && b.v)).length + '/' + Math.min(10, pos.length), overlayOnTop5: hiOn5, labelOutOfStage: out, top5Hidden: top5.filter((k2) => !shownK.has(k2)) };
  /* r15 고른 곳 면 효과(가리킴과 같은 필터 · 1.5px 윤곽), 고른 곳 이름 굵기 */
  const sf = svg.querySelector('.f[aria-selected="true"]'), rg = svg.querySelector('.ring'), sl = sf && svg.querySelector(`.lbls .lb-g[data-area="${sf.dataset.area}"] .nm`);
  R.sel = sf ? { key: sf.dataset.area, filter: getComputedStyle(sf).filter, ring: rg && rg.getAttribute('d') === sf.getAttribute('d') ? getComputedStyle(rg).strokeWidth : 'none', label: sl ? getComputedStyle(sl).fontWeight : 'none', hover: (svg.querySelector('.f.hl') && getComputedStyle(svg.querySelector('.f.hl')).filter) || null } : null;
  /* G15: h = 3 + (Hmax − 3)·√(u/umax)(오차 ≤ 0.5px), 높이 순위 = 호수 순위, 0호 = 0, 라벨 값 = 호수 */
  const hm = +svg.dataset.hmax, umax = Math.max(...Object.values(uOf)), hs = fgs.map((g) => ({ u: +g.dataset.u, h: +g.dataset.h }));
  const err = Math.max(0, ...hs.map((x) => Math.abs(x.h - (x.u > 0 ? 3 + (hm - 3) * Math.sqrt(x.u / umax) : 0))));
  let inv = 0; for (const a of hs) for (const b of hs) if (a.u > b.u && a.h <= b.h - 1e-6) inv++;
  const L = (u) => (u >= 1e4 ? `${+(Math.round(u / 1e3) / 10).toFixed(1)}만` : u.toLocaleString('ko-KR'));
  const badLabel = lbs.filter((b) => b.v && b.v !== L(uOf[b.key] || 0)).map((b) => b.key + ':' + b.v);
  R.G15 = { Hmax: hm, sqrtErr: +err.toFixed(3), rankInversions: inv, zeroFlat: hs.every((x) => x.u > 0 || x.h === 0), badLabels: badLabel, faceSum: Object.values(uOf).reduce((a, b) => a + b, 0), dash: [...svg.querySelectorAll('*')].filter((e) => getComputedStyle(e).strokeDasharray !== 'none').length };
}
/* 숫자 일치(G10): 요약 문장 · 순위 · 시트와 같은 정의인지 화면 값으로 */
R.nums = { sentence: document.querySelector('#sum-h .n')?.getAttribute('title') || null, rank: [...document.querySelectorAll('.rk .v')].map((v) => v.textContent).slice(0, 6), badges: [...document.querySelectorAll('.facts dd')].map((b) => b.textContent.replace('곳', '')), headline: document.querySelector('#sum-h')?.textContent.trim() || null };
/* r10: 시트 줄 이름 잘림(2줄 넘침·말줄임) · 순위 이름 말줄임 · 알림 영역 · 보이는 목록 안 같은 이름(서로 다른 사업) */
const cut = (el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
const sheetCut = [...document.querySelectorAll('.sheet .srow .t')].filter((el) => vis(el) && cut(el)).map((el) => el.textContent.trim().slice(0, 24));
const rankCut = [...document.querySelectorAll('.rk .nm')].filter((el) => vis(el) && cut(el)).map((el) => el.textContent.trim());
const dup = [];
document.querySelectorAll('.evs, .srows').forEach((ul) => { if (!vis(ul)) return; const m = new Map();
  ul.querySelectorAll(':scope > li').forEach((li) => { if (!vis(li)) return; const a = li.querySelector('[data-prj]'), t = li.querySelector('.nm, .t'); if (!a || !t) return; const n = t.textContent.split(' · ').filter((x) => !/^(모집 공고|착공|준공|입주|연도 미정)/.test(x)).join(' · ').trim(); if (!m.has(n)) m.set(n, new Set()); m.get(n).add(a.dataset.prj); });
  for (const [n, s] of m) if (s.size > 1 && !/이름 미정/.test(n)) dup.push(n); });
R.r10 = { sheetNameCut: sheetCut.length, sheetNameCutAt: sheetCut.slice(0, 3), rankNameCut: rankCut, live: [...document.querySelectorAll('[aria-live]')].filter((e) => !e.closest('#demo')).map((e) => e.id + ':' + e.textContent.trim().slice(0, 40)), dupNames: dup.slice(0, 4) };
/* r13 G16 비교용 상자(실행마다 같은 값이어야 한다): 요약·지도 카드·아래 줄·무대 · 지금 신청 칸 · svg 다시 만든 횟수 */
const bx = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.left + scrollX), Math.round(r.top + scrollY), Math.round(r.width), Math.round(r.height)].join(','); };
const ps = document.querySelector('#mstage svg.pts');
R.pts = ps ? { n: +(ps.dataset.n || 0), hid: +(ps.dataset.hid || 0), exact: ps.querySelectorAll('.pt:not(.ap):not(.hid)').length, approx: ps.querySelectorAll('.pt.ap:not(.hid)').length, label: ps.querySelector('.pts-g')?.getAttribute('aria-label') || null, legend: [...document.querySelectorAll('#mapc .lg-pt')].map((l) => l.style.visibility || 'visible').join(',') } : null;
R.boxes = { sum: bx('#sum'), mapc: bx('#mapc'), bot: bx('.bot-row'), stage: bx('#mstage') || bx('.hbars'), apply: bx('#apply'), geo: window.__geo || 0, hmax: document.querySelector('svg.map')?.dataset.hmax || null };
R.apply = (() => { const a = document.querySelector('#apply'); if (!a) return null; return { busy: a.getAttribute('aria-busy'), rows: [...a.querySelectorAll('.nts > li:not(.sk)')].filter(vis).length, msg: a.querySelector('.ap-msg')?.textContent || null, more: [...a.querySelectorAll('.ap-more > *')].filter(vis).map((e) => e.textContent.trim()), chips: [...a.querySelectorAll('.nt-when')].filter(vis).map((e) => e.querySelector('.sr')?.textContent.replace(/, $/, '')), clip: a.scrollHeight > a.clientHeight + 1 }; })();
R.yrs = (() => { const ol = document.querySelector('#c-yr .yrs'); if (!ol || !vis(ol)) return null; const L = [...ol.children].map((li) => ({ y: li.querySelector('.y').textContent, v: li.querySelector('.v').title, max: li.classList.contains('max'), bg: getComputedStyle(li).backgroundColor, fs: getComputedStyle(li.querySelector('.v')).fontSize })); return { cells: L.length, max: L.filter((x) => x.max).map((x) => x.y), fs: L[0]?.fs, cut: [...ol.querySelectorAll('.v')].filter((v) => v.scrollWidth > v.parentElement.clientWidth - 23).length }; })();
R.hl = (() => { const h = document.querySelector('#sum-h'); return h ? { fs: getComputedStyle(h).fontSize, lines: Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)), numColor: getComputedStyle(h.querySelector('.n') || h).color } : null; })();
return R; })()
