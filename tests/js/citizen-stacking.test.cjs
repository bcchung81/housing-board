'use strict';
/* /citizen 겹침 회귀(2026-10-18 사용자 주석 '위치 바꾸기 클릭시 준비중이 겹쳐보이는 증상'):
   원인 = 머리 줄 규칙이 맨 클래스 이름 '.top' 이라, 같은 이름을 '가장 많은' 표시로 쓰는 단계 줄(.sm-r.top)·순위 번호(.no.top)에
   z-index 40 · sticky · 그림자가 붙었다. [바꾸기]가 펼친 검색 목록(.ac, z-index 30)보다 위라 '준비 중' 줄이 목록 위로 그려졌다.
   ① 머리 줄 규칙은 header 로 한정 ② z-index·sticky·fixed 를 주는 맨 클래스 규칙은 그 클래스가 첫 클래스인 요소(주인)에만 닿는다 —
   원본(template.html)의 class 값(마크업·JS 글)을 모두 모아, 덧붙이는 이름(수식어)으로 그 규칙에 걸리는 요소가 없는지 본다. 화면 사진은 찍지 않는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const TPL = fs.readFileSync(path.join(__dirname, '..', '..', 'tools', 'design', 'public-mock', 'template.html'), 'utf8');
const CSS = TPL.slice(TPL.indexOf('<style>'), TPL.indexOf('</style>')).replace(/\/\*[\s\S]*?\*\//g, '');

/* class="…" 값 → 클래스 목록. ${…} 안은 따옴표 글('…' · "…")의 낱말을 덧붙이는 이름으로 넣는다(조건부 수식어) */
function classLists() {
  const out = [];
  for (const m of TPL.matchAll(/class="((?:[^"$]|\$\{(?:[^{}]|\{[^{}]*\})*\})*)"/g)) {
    const raw = m[1], words = [];
    const stat = raw.replace(/\$\{((?:[^{}]|\{[^{}]*\})*)\}/g, (_, e) => { for (const q of e.matchAll(/'([^']*)'|"([^"]*)"/g)) words.push(...(q[1] ?? q[2]).split(/\s+/)); return ' '; });
    const list = [...stat.split(/\s+/), ...words].filter((w) => /^[a-z][\w-]*$/i.test(w));
    if (list.length) out.push({ raw, first: stat.trim().split(/\s+/)[0] || list[0], set: new Set(list) });
  }
  return out;
}
/* 맨 클래스만으로 된 선택자(.a 또는 .a.b — 태그·조상 없음) 중 z-index · position: sticky|fixed 를 주는 규칙 */
function stackingBareRules() {
  const out = [];
  for (const m of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const body = m[2]; if (!/z-index:|position: (sticky|fixed)/.test(body)) continue;
    for (const sel of m[1].split(',').map((x) => x.trim())) if (/^(\.[\w-]+)+$/.test(sel)) out.push({ sel, cls: sel.slice(1).split('.'), body: body.trim() });
  }
  return out;
}

test('① 머리 줄(sticky · z-index 40)은 header 로 한정 — 맨 .top 규칙 없음', () => {
  assert.match(CSS, /header\.top \{ position: sticky; top: 0; z-index: 40;/);
  assert.doesNotMatch(CSS, /(^|[\s,}])\.top \{/, '맨 .top 규칙이 있으면 .sm-r.top · .no.top 이 z-index 40 을 받는다');
  assert.match(TPL, /<header class="top">/);
});

test('② 쌓임 규칙(z-index · sticky · fixed)을 주는 맨 클래스는 덧붙이는 이름으로 남의 요소에 닿지 않는다', () => {
  const lists = classLists(), rules = stackingBareRules(), bad = [];
  assert.ok(lists.length > 200 && rules.length > 0, `${lists.length}/${rules.length}`);
  for (const r of rules) for (const l of lists) if (r.cls.every((c) => l.set.has(c)) && !r.cls.includes(l.first)) bad.push(`${r.sel} → class="${l.raw.slice(0, 80)}"`);
  assert.deepEqual(bad, []);
});

test('③ 단계 줄 · 순위 번호의 "가장 많은" 표시(.top)는 그대로 쓰되 쌓임 값이 없다 — 검색 목록(.ac z-index 30)보다 아래', () => {
  assert.match(TPL, /class="sm-r s\$\{i\}\$\{i === top \? ' top' : ''\}/);
  assert.match(CSS, /\.ac \{ position: absolute; z-index: 30;/);
  for (const m of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) if (/\.(sm-r|no)\.top\b/.test(m[1])) assert.doesNotMatch(m[2], /z-index|position/, m[1].trim());
});
