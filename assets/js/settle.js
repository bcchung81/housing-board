/* 입주 경과 표지(지도 개선 계획 2절, 2026-10-14 결정). 06 입주 단계는 그대로 두고 '얼마나 지났는가'만 표지로 붙인다.
   settledOf(마지막 실제 준공일, 입주예정월, 기준일) → 'moving'(입주 진행) | 'settled'(입주 완료) | 'existing'(기존 단지) | null(날짜 없음 = 지금 동작 그대로)
   - 입주 진행: 준공 뒤 6개월 이하, 또는 입주예정월부터 6개월 이하(입주예정월이 아직 오지 않았어도 진행으로 본다)
   - 입주 완료: 7~24개월 · 기존 단지: 24개월 초과. 두 날짜가 다 있으면 가까운 쪽(지난 달 수가 작은 쪽)으로 본다.
   날짜는 'YYYY-MM-DD' 또는 'YYYY-MM'. 일이 있으면 그 날이 지나야 한 달로 센다(2026-04-14 → 2026-10-14 는 6개월).
   서버(lib/permits.js)와 브라우저(region.js·app.js)가 같은 파일을 쓴다: 브라우저는 전역 Settle, Node 는 require. 시험: tests/js/settle.test.cjs */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Settle = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MOVING_MAX = 6, SETTLED_MAX = 24;

  /* 날짜 → 기준일까지 지난 달 수(미래면 음수). 형식이 다르면 null */
  function monthsSince(v, now) {
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(v == null ? '' : v).trim());
    if (!m) return null;
    const t = new Date(now);
    let n = (t.getUTCFullYear() - Number(m[1])) * 12 + (t.getUTCMonth() + 1 - Number(m[2]));
    if (m[3] && t.getUTCDate() < Number(m[3])) n -= 1;
    return n;
  }

  function settledOf(done, plan, now = Date.now()) {
    const ns = [monthsSince(done, now), monthsSince(plan, now)].filter((n) => n != null);
    if (!ns.length) return null;
    const n = Math.min(...ns);
    return n <= MOVING_MAX ? 'moving' : n <= SETTLED_MAX ? 'settled' : 'existing';
  }

  const LABEL = { moving: '입주 진행', settled: '입주 완료', existing: '기존 단지' };

  return { MOVING_MAX, SETTLED_MAX, monthsSince, settledOf, LABEL };
});
