'use client';
/* 기존 index.html 의 로더와 같은 순서로 지도 스크립트를 불러온다:
   로딩 화면 진행(loadview) → 지도 라이브러리·어댑터·기반시설 점검·시설 분류·버스 → 지역 자료 읽기(어댑터가 전역을 채움) → 키 파일 → 앱 → 주소 이동 입력줄(없어도 지도는 열린다).
   스크립트·지역 자료를 받는 대로 로딩 화면(LoadView)에 알린다. 지도가 생긴 뒤의 타일은 app.js 가 알린다.
   app.js 는 최상위 const 를 선언하는 스크립트라 문서당 한 번만 돌아야 한다. 개발 모드의 효과 이중 실행은 플래그로 막는다.
   수도권 개요 모드(쿼리 없는 /map · ?sido=, 레이아웃 <head> 가 html[data-map-mode] 로 정함)는 개요 모듈과 지도 라이브러리만 부른다(지역 자료·키·앱·지형 없음). */
import { useEffect } from 'react';
import type { OverviewDoc } from '../lib/board/metro-overview';

type LoadCtl = { want: (a: string, k: string) => void; got: (a: string, k: string) => void; finish: (a: string) => void; trackFetch: (w: Window) => () => void };
type W = Window & {
  __mapBooted?: boolean;
  HOME_MAP?: Record<string, string>;
  HOME_LITE?: Record<string, { name: string; n: number; h?: string }>;
  LoadView?: { ctl: () => LoadCtl };
  RegionLoader?: { boot: (w: Window, d: Document) => Promise<{ ok?: boolean } | null> };
  GotoBar?: { mount: (w: Window, d: Document) => void };
  OVERVIEW?: OverviewDoc;
  MetroOverview?: { mount: (w: Window, d: Document, libReady: Promise<void>) => unknown };
};

const LOADVIEW = '/assets/js/loadview.js';
const LIBS = ['/assets/vendor/maplibre-gl/5.24.0/maplibre-gl.js', '/assets/js/settle.js', '/assets/js/region.js', '/assets/js/infra.js', '/assets/js/facility.js', '/assets/js/bus.js'];
const CONFIG = '/config.js', APP = '/assets/js/app.js';

/* 해시 이름 표(옛 이름 → app.<해시>.js). 표에 없으면 옛 이름 그대로 */
let ASSETS: Record<string, string> = {};

function load(src: string) {
  return new Promise<void>((ok, no) => {
    const s = document.createElement('script');
    s.src = ASSETS[src] || src; s.async = false; s.onload = () => ok(); s.onerror = () => no(new Error(src));
    document.body.appendChild(s);
  });
}

export default function MapIsland({ assets = {}, homeMap = {}, homeLite = {}, overview, overviewSrc }: { assets?: Record<string, string>; homeMap?: Record<string, string>; homeLite?: Record<string, { name: string; n: number; h?: string }>; overview?: OverviewDoc; overviewSrc?: string }) {
  useEffect(() => {
    ASSETS = assets;
    const w = window as W;
    if (w.__mapBooted) return;
    w.__mapBooted = true;
    if (document.documentElement.getAttribute('data-map-mode') === 'overview' && overviewSrc) {
      /* 개요: 개요 모듈을 먼저 실행해 패널을 그리고, 지도 라이브러리가 오면 면을 그린다(둘 다 async=false 라 넣은 순서대로 실행) */
      w.OVERVIEW = overview;
      const ov = load(overviewSrc), lib = load(LIBS[0]);
      ov.then(() => { w.MetroOverview!.mount(window, document, lib); }).catch((e: Error) => {
        const f = document.getElementById('ovFail');
        if (f) { f.hidden = false; f.textContent = '화면을 준비하지 못했습니다: ' + e.message; }
      });
      return;
    }
    w.HOME_MAP = homeMap;   // 수도권 시군구 → 지도 정적 자료 해시(region.js 가 assets/home-map/<시군구>.<해시>.json 을 부른다)
    w.HOME_LITE = homeLite;   // 수도권 시군구 → 이름·사업 수·경량 번들 해시(region.js: assets/home-lite/<시군구>.<해시>.json, 지역 선택기 목록)
    const fatal = (e: Error) => {
      const f = document.getElementById('fatal'), l = document.getElementById('loading');
      if (l) l.hidden = true;
      if (f) { f.hidden = false; f.textContent = '화면을 준비하지 못했습니다: ' + e.message; }
    };
    let lv: LoadCtl | null = null;
    const step = (src: string) => () => { if (lv) lv.got('code', src); };
    load(LOADVIEW).catch(() => {})
      .then(() => {
        lv = w.LoadView ? w.LoadView.ctl() : null;
        if (lv) [...LIBS, CONFIG, APP].forEach((s) => lv!.want('code', s));
        return Promise.all(LIBS.map((s) => load(s).then(step(s))));
      })
      .then(() => {
        const restore = lv ? lv.trackFetch(window) : () => {};
        return w.RegionLoader!.boot(window, document).finally(() => { restore(); if (lv) lv.finish('data'); });
      })
      .then((r) => {
        if (!r || !r.ok) return null;
        return load(CONFIG).catch(() => {}).then(step(CONFIG)).then(() => load(APP)).then(step(APP)).then(() => { if (lv) lv.finish('code'); })
          .then(() => load('/assets/js/goto.js').then(() => w.GotoBar!.mount(window, document)).catch(() => {}));
      })
      .catch(fatal);
  }, []);
  return null;
}
