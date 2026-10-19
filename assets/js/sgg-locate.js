/* 전국 시군구 판정 — 경위도 → 시군구 코드. /citizen '현 위치'가 쓴다(좌표는 기기 밖으로 보내지 않는다: 이 모듈은 경계 파일을 받기만 한다).
   자료: assets/geo/korea-sgg.json(korea-sgg/1, tools/ledger/korea-sgg.js 가 만든다) — 수도권(11·28·41)은 빠져 있어 화면이 region-map 으로 먼저 맞춘다.
   locate(data, lon, lat): 상자로 먼저 거르고, 작은 섬 상자 안이면 그 시군구, 아니면 한 시군구의 모든 고리에 짝수-홀수 규칙(구멍·섬)을 적용한다. 없으면 null.
   load(url): 한 번만 받아 기억하는 Promise(실패하면 null 로 풀리고, 다음 부르면 다시 받는다).
   노드 require 와 브라우저 전역(window.SggLocate) 둘 다(map3d.js 와 같은 UMD). 시험: tests/js/sgg-locate.test.cjs */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SggLocate = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const COS = Math.cos(37.5 * Math.PI / 180);
  /* 고리 [x0, y0, dx1, dy1, …] 에 대해 점이 가로 반직선을 몇 번 건너는지의 홀짝 */
  function crossRing(ring, px, py) {
    let inside = false, x = ring[0], y = ring[1];
    const n = ring.length;
    for (let i = 2; i <= n; i += 2) {
      const nx = i < n ? x + ring[i] : ring[0], ny = i < n ? y + ring[i + 1] : ring[1];
      if ((y > py) !== (ny > py) && px < ((nx - x) * (py - y)) / (ny - y) + x) inside = !inside;
      x = nx; y = ny;
    }
    return inside;
  }
  function locate(data, lon, lat) {
    if (!data || !Array.isArray(data.sgg) || !Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    const k = 1000 * (data.scale || 1), px = (lon - 124.5) * COS * k, py = (38.4 - lat) * k;
    for (const [code, , b, rings, isles] of data.sgg) {
      if (px < b[0] || px > b[2] || py < b[1] || py > b[3]) continue;
      if (isles && isles.some((q) => px >= q[0] && px <= q[2] && py >= q[1] && py <= q[3])) return code;
      let inside = false;
      for (const r of rings) if (crossRing(r, px, py)) inside = !inside;
      if (inside) return code;
    }
    return null;
  }
  const memo = new Map();
  function load(url, fetchFn) {
    const f = fetchFn || (typeof fetch === 'function' ? fetch : null);
    if (!memo.has(url)) {
      const p = (f ? Promise.resolve().then(() => f(url)) : Promise.reject(new Error('fetch 없음')))
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => (d && Array.isArray(d.sgg) ? d : null), () => null)
        .then((d) => { if (!d) memo.delete(url); return d; });
      memo.set(url, p);
    }
    return memo.get(url);
  }
  return { locate, load, crossRing };
});
