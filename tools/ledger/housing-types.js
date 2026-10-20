'use strict';
/* 공급 유형 묶음(2026-10-20): 원장 units.housing_type 의 원천 이름을 일반사용자도 읽는 쉬운 이름으로 묶는다(사업 상세 창 머리 칩 — 이름은 칩, 원천 이름은 title).
   묶음 규칙이 사는 한 곳 — projects-index.js 가 만들어 project-detail.json 에 싣고, 화면은 이미 묶인 이름만 그린다. 순수 함수.
   한 원천 이름에 유형이 둘 있으면('공공분양, 공공임대(6년 분양전환)') 쉼표로 나눠 각각 묶는다. 모르는 이름은 원천 이름 그대로 둔다(버리지 않음). */
const ORDER = ['공공분양', '민간참여 공공분양', '이익공유형 분양', '분양전환 공공임대', '행복주택', '통합공공임대', '국민임대'];
const RULES = [[/민간참여/, '민간참여 공공분양'], [/이익공유/, '이익공유형 분양'], [/6년|분양전환/, '분양전환 공공임대']];
const easyName = (piece) => { const r = RULES.find(([re]) => re.test(piece)); return r ? r[1] : piece; };

/* raws: 그 사업의 원천 이름들 → [{ name, raw: [원천 이름...] }] (쉬운 이름은 한 번만, ORDER 순·모르는 이름은 뒤에 가나다) */
function typesOf(raws) {
  const m = new Map();
  for (const raw of [...new Set(raws.filter(Boolean))].sort()) {
    for (const piece of raw.split(/\s*,\s*/).filter(Boolean)) {
      const name = easyName(piece), x = m.get(name) || m.set(name, new Set()).get(name);
      x.add(raw);
    }
  }
  const rank = (n) => { const i = ORDER.indexOf(n); return i < 0 ? ORDER.length : i; };
  return [...m].sort((a, b) => rank(a[0]) - rank(b[0]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([name, raw]) => ({ name, raw: [...raw] }));
}
module.exports = { typesOf, easyName };
