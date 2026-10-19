'use strict';
// 시험 도우미(시험 파일 아님): 지도 CSS(assets/css/app.css)의 변수는 색·글꼴 값을 app/globals.css 에 두고 var() 로 가리키기만 한다(2026-10-18).
// 여기서는 두 파일의 html 수준 규칙을 브라우저처럼 겹쳐(특이도 → 파일 순서 → 줄 순서) 지도 변수의 실제 값을 찾는다.
//   mapVars({ theme: 'dark' | 'light', metric: 'd', fallback: true, scope: '.maplibregl-popup-content' }) → { '--ink': '#F2F2F2', … }
//   mapCss(theme) → app.css 본문에서 globals 토큰을 가리키는 var() 를 그 테마의 값으로 바꾼 글(옛 '값이 app.css 에 있던' 단언을 그대로 쓰려고)
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const GLOBALS = noComments(read('app/globals.css')), APP = noComments(read('assets/css/app.css'));

/* 최상위 규칙과 @supports not(…) 안 규칙을 { sel, body, sup } 로 꺼낸다(@media·@keyframes 안은 html 변수에 쓰지 않으므로 건너뛴다) */
function rules(src) {
  const out = [];
  let i = 0;
  const walk = (end, sup) => {
    while (i < end) {
      const open = src.indexOf('{', i);
      if (open < 0 || open >= end) return;
      let head = src.slice(i, open); head = head.slice(head.lastIndexOf(';') + 1).trim();   // 앞의 @import·@custom-variant 같은 한 줄 규칙은 떼어 낸다
      let depth = 1, j = open + 1;
      while (depth && j < src.length) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; j++; }
      if (/^@supports not/.test(head)) { i = open + 1; walk(j - 1, true); }
      else if (!head.startsWith('@') || /^@theme/.test(head)) out.push({ sel: head.startsWith('@theme') ? ':root' : head.replace(/\s+/g, ' '), body: src.slice(open + 1, j - 1), sup });
      i = j;
    }
  };
  walk(src.length, false);
  return out;
}

/* <html> 에 붙는 규칙인지, 특이도는 얼마인지. 지도(/map)의 html 은 늘 data-map-shell 이 있다 */
function htmlRule(sel, o) {
  const parts = sel.split(',').map((s) => s.trim());
  let best = null;
  for (const s of parts) {
    if (!/^(:root|html|\.dark)/.test(s) || /\s/.test(s)) continue;
    let ok = true;
    const want = { '.dark': o.theme === 'dark', ':not(.dark)': o.theme !== 'dark', '[data-ov-metric="d"]': o.metric === 'd', '[data-map-shell]': true, ":root": true, 'html': true, "[data-aud='public']": o.aud === 'public' };
    const toks = s.match(/:not\([^)]*\)|\[[^\]]+\]|\.[\w-]+|:root|^html/g) || [];
    if (toks.join('') !== s) continue;   // 모르는 꼴(자손·다른 속성)은 html 규칙으로 보지 않는다
    for (const t of toks) if (!(t in want) || !want[t]) ok = false;
    if (!ok) continue;
    const spec = toks.reduce((n, t) => n + (t === 'html' ? 1 : 100), 0);
    best = Math.max(best ?? -1, spec);
  }
  return best;
}

const decls = (body) => [...body.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)].map((m) => [m[1], m[2].trim()]);

function resolve(v, vars, seen = new Set()) {
  return v.replace(/var\((--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (all, n, fb) => {
    if (seen.has(n)) throw new Error(`순환 참조 ${n}`);
    if (vars[n] != null) return resolve(vars[n], vars, new Set([...seen, n]));
    if (fb != null) return fb.trim();
    return all;
  });
}

function mapVars(opt = {}) {
  const o = { theme: 'dark', ...opt };
  const all = [];
  [GLOBALS, APP].forEach((src, f) => rules(src).forEach((r, k) => {
    if (r.sup && !o.fallback) return;
    const spec = htmlRule(r.sel, o);
    if (spec != null) all.push({ spec, f, k, d: decls(r.body) });
  }));
  all.sort((a, b) => a.spec - b.spec || a.f - b.f || a.k - b.k);
  const raw = {};
  for (const r of all) for (const [n, v] of r.d) raw[n] = v;
  let vars = raw;
  if (o.scope) {   // 그 요소 안에서 다시 정의한 변수: 값의 var() 는 html 값으로 푼다
    const r = rules(APP).filter((x) => x.sel === o.scope);
    if (!r.length) throw new Error(`app.css 에 ${o.scope} 규칙이 없음`);
    vars = { ...raw };
    for (const x of r) for (const [n, v] of decls(x.body)) vars[n] = resolve(v, raw);
  }
  const out = {};
  for (const n of Object.keys(vars)) out[n] = resolve(vars[n], vars);
  return out;
}

/* app.css 에서 globals 의 지도 전용 토큰(--map-*)을 가리키는 var() 를 그 테마의 값으로 바꾼다 */
function mapCss(theme = 'dark') {
  const V = mapVars({ theme });
  return read('assets/css/app.css').replace(/var\((--map-[\w-]+)\)/g, (all, n) => V[n] ?? all);
}

module.exports = { mapVars, mapCss, rules, GLOBALS, APP };
