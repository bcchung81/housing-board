'use client';
/* 기존 index.html 의 로더와 같은 순서로 지도 스크립트를 불러온다:
   지도 라이브러리·어댑터·기반시설 점검·시설 분류·버스 → 지역 자료 읽기(어댑터가 전역을 채움) → 키 파일 → 앱 → 주소 이동 입력줄(없어도 지도는 열린다).
   app.js 는 최상위 const 를 선언하는 스크립트라 문서당 한 번만 돌아야 한다. 개발 모드의 효과 이중 실행은 플래그로 막는다. */
import { useEffect } from 'react';

type W = Window & {
  __mapBooted?: boolean;
  RegionLoader?: { boot: (w: Window, d: Document) => Promise<{ ok?: boolean } | null> };
  GotoBar?: { mount: (w: Window, d: Document) => void };
};

function load(src: string) {
  return new Promise<void>((ok, no) => {
    const s = document.createElement('script');
    s.src = src; s.async = false; s.onload = () => ok(); s.onerror = () => no(new Error(src));
    document.body.appendChild(s);
  });
}

export default function MapIsland() {
  useEffect(() => {
    const w = window as W;
    if (w.__mapBooted) return;
    w.__mapBooted = true;
    const fatal = (e: Error) => {
      const f = document.getElementById('fatal'), l = document.getElementById('loading');
      if (l) l.hidden = true;
      if (f) { f.hidden = false; f.textContent = '화면을 준비하지 못했습니다: ' + e.message; }
    };
    Promise.all(['/assets/vendor/maplibre-gl/5.24.0/maplibre-gl.js', '/assets/js/region.js', '/assets/js/infra.js', '/assets/js/facility.js', '/assets/js/bus.js'].map(load))
      .then(() => w.RegionLoader!.boot(window, document))
      .then((r) => {
        if (!r || !r.ok) return null;
        return load('/config.js').catch(() => {}).then(() => load('/assets/js/app.js'))
          .then(() => load('/assets/js/goto.js').then(() => w.GotoBar!.mount(window, document)).catch(() => {}));
      })
      .catch(fatal);
  }, []);
  return null;
}
