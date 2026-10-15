import fs from 'node:fs';
import path from 'node:path';
import { preload } from 'react-dom';
import MapIsland from '../../../components/MapIsland';
import calendarJson from '../../../data/board/region-calendar.json';
import detailJson from '../../../data/board/project-detail.json';
import regionMapJson from '../../../data/board/region-map.json';
import { metroOverview, type OverviewDoc } from '../../../lib/board/metro-overview';
import { getProjectsIndex } from '../../../lib/board/projects-index';
import type { CalendarDoc, RegionMapDoc } from '../../../lib/board/region';

/* 지도 섬: 기존 지도 앱의 마크업(index.html 의 body)을 그대로 넣고, 스크립트는 MapIsland 가 기존 순서대로 불러온다.
   app.js·시험은 건드리지 않는다. 마크업의 정본은 지금 루트 index.html 이다.
   index.html 은 그릴 때 읽는다: 개발 서버는 요청마다 다시 읽어 고친 마크업이 바로 보이고, 운영 빌드는 정적으로 한 번 그린다(모듈 맨 위에서 읽으면 개발 서버를 다시 켜야 반영됐다) */
function mapMarkup() {
  const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  const markup = (html.match(/<body>([\s\S]*)<\/body>/)?.[1] ?? '').replace(/<noscript>[\s\S]*?<\/noscript>/, '');
  if (!markup.includes('id="map"')) throw new Error('index.html 에서 지도 마크업을 찾지 못했습니다');
  return markup;
}

/* 지도 스크립트의 해시 이름 표(scripts/build.js 가 public/assets/manifest.json 에 쓴다). 없으면 옛 이름을 그대로 쓴다.
   문서를 받는 즉시 스크립트를 내려받기 시작하도록 <link rel=preload> 를 낸다: 지도 섬이 스크립트를 순서대로(로딩 화면 → 라이브러리 → 지역 자료 → 키 → 앱) 불러도
   그 사이의 왕복을 기다리지 않고 캐시에서 바로 실행된다(S5). 같은 주소로 불러야 미리 받은 것을 쓴다 */
const MAPLIBRE = '/assets/vendor/maplibre-gl/5.24.0/maplibre-gl.js';
function scriptManifest(): Record<string, string> {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/assets/manifest.json'), 'utf8')); } catch { return {}; }
}

/* 수도권 지도 정적 자료의 시군구→내용 해시 표(scripts/build.js 가 public/assets/home-map/manifest.json 에 쓴다). 지도는 이 표로 해시 이름(장기 캐시)을 부른다. 없으면 빈 표 */
function homeMapManifest(): Record<string, string> {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/assets/home-map/manifest.json'), 'utf8')); } catch { return {}; }
}

/* 수도권 경량 번들 표(scripts/build.js 가 public/assets/home-lite/manifest.json 에 쓴다): { 시군구: { name, n(사업 수), h?(경량 번들 해시) } }.
   지도는 h 가 있는 시군구에서 경량 번들을 부르고, 지역 선택기에 이 시군구들을 시도별로 넣는다. 없으면 빈 표 */
function homeLiteManifest(): Record<string, { name: string; n: number; h?: string }> {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/assets/home-lite/manifest.json'), 'utf8')); } catch { return {}; }
}

/* 사업별 최근 공정률(사업 원장 = HOME 보고, 사업 화면 서랍과 같은 project-detail.json): { 사업 id: [보고일, 공정률] }. 지도 카드가 이 값을 정본으로 쓰고
   지도 원천(번들) 값이 다르면 작은 표지만 단다(app.js progOf, 2026-10-15 2차 평가 P0). 108건 남짓이라 페이지에 바로 싣는다 */
function homeProgress(doc: { projects?: Record<string, { progress?: [string, number][] }> }): Record<string, [string, number]> {
  const out: Record<string, [string, number]> = {};
  for (const [id, d] of Object.entries(doc.projects || {})) {
    const last = (d.progress || []).filter((x) => Array.isArray(x) && typeof x[0] === 'string' && Number.isFinite(x[1])).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).pop();
    if (last) out[id] = [last[0], last[1]];
  }
  return out;
}

/* 지역 자료 읽기는 index.json → 기본 지역의 region.json → 나머지 순으로 이어져 왕복이 직렬이다. 앞의 둘은 작고 모든 열기에 쓰이므로 미리 받는다
   (기본 지역이 아닌 지역·코드로 열면 4 KB 정도가 헛될 뿐이다. 큰 buildings.json 은 지역을 알아야 하므로 미리 받지 않는다) */
function regionPreloads(): string[] {
  try {
    const index = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/regions/index.json'), 'utf8'));
    const def = (index.regions || []).find((r: { default?: boolean }) => r.default) || (index.regions || [])[0];
    const base = String(index.dataBase || 'regions/').replace(/\/?$/, '/');
    return ['/regions/index.json', ...(def && !index.dataBase ? [`/${base}${def.slug}/region.json`] : [])];
  } catch { return []; }
}

/* 수도권 개요(쿼리 없는 /map · ?sido=)의 시군구별 값. 사업 화면(/projects)·지역 공급(/region)과 같은 자료(저장소 JSON — 그 화면들처럼 배포 때 갱신)와 같은 계산.
   원장을 읽지 못하면 경계만(ok: false — 화면이 '수치를 불러오지 못했습니다'를 띄운다) */
async function overviewDoc(): Promise<OverviewDoc> {
  const map = regionMapJson as unknown as RegionMapDoc;
  try {
    const { rows, sggNames, referenceDate } = await getProjectsIndex();
    return metroOverview(map, { rows, sggNames, calendar: calendarJson as unknown as CalendarDoc, referenceDate });
  } catch {
    return metroOverview(map, null);
  }
}

/* 개요 마크업(값·목록은 assets/js/overview.js 가 채운다). 상세 마크업과 함께 내려가고, 모드(레이아웃 <head> 의 MAP_MODE_INIT)에 따라 CSS 가 하나만 보인다 */
function OverviewMarkup() {
  return (
    <div className="ov" id="ov">
      <aside className="ov-panel" id="ovPanel" aria-label="수도권 개요" data-sheet="peek">
        <button type="button" className="ov-handle" id="ovHandle" aria-expanded="false" aria-controls="ovPanel" aria-label="개요 패널 펼치기" />
        <header className="ov-head"><h1 id="ovTitle">수도권 공급 개요</h1><button type="button" className="ov-back" id="ovBack" hidden>수도권 전체</button><span className="ov-asof" id="ovAsOf" /></header>
        <div className="ov-metrics" id="ovMetrics" role="radiogroup" aria-label="지도 색 기준" />
        <section className="ov-total" aria-labelledby="ovTotalQ">
          <div className="ov-q"><h2 id="ovTotalQ">수도권 진행 사업 호수</h2><button type="button" className="ov-i" id="ovDefBtn" aria-expanded="false" aria-controls="ovDef" /></div>
          <p className="ov-def" id="ovDef" hidden />
          <div className="ov-num" id="ovTotal" />
          <p className="ov-sub" id="ovTotalSub" />
        </section>
        <p className="ov-fail" id="ovFail" role="status" hidden>수치를 불러오지 못했습니다. 경계만 보여 줍니다.</p>
        <div className="ov-cards" id="ovCards" role="group" aria-label="시도로 맞추기" />
        <section className="ov-ranks" aria-labelledby="ovRankH">
          <h2 id="ovRankH">시군구</h2>
          <ol className="ov-rank" id="ovRank" />
        </section>
      </aside>
      <section className="ov-mapwrap" id="ovMapWrap" tabIndex={-1} aria-label="수도권 시군구 지도(같은 내용과 고르기는 시군구 목록에도 있습니다)">
        <div className="ov-map" id="ovMap" />
        <div className="ov-labels" id="ovLabels" aria-hidden="true" />
        <div className="ov-tip" id="ovTip" hidden />
        <div className="ov-legend"><b id="ovLegendT" /><ul id="ovLegend" /></div>
        <p className="ov-empty" id="ovEmpty" role="status" hidden />
        <p className="ov-going" id="ovGoing" role="status" hidden />
      </section>
      <div className="ov-menu" id="ovMenu" role="dialog" hidden />
    </div>
  );
}

/* 지도 섬 + 개요 값: 개요 값은 사업 화면과 같은 읽기(getProjectsIndex)를 기다려 넘긴다. 개요 모듈 주소도 여기서 정한다(해시 이름 표 → 없으면 옛 이름).
   상세 지도의 스크립트 순서는 지도 섬이 index.html 로더와 같게 가진다(개요 모듈은 Next 지도에만 있다) */
async function Island(props: { assets: Record<string, string>; homeMap: Record<string, string>; homeLite: Record<string, { name: string; n: number; h?: string }>; homeProgress: Record<string, [string, number]> }) {
  return <MapIsland {...props} overview={await overviewDoc()} overviewSrc={props.assets[OVERVIEW_JS] || OVERVIEW_JS} />;
}
const OVERVIEW_JS = '/assets/js/overview.js';

export default function MapPage() {
  const markup = mapMarkup();
  const assets = scriptManifest();
  for (const href of [assets['/assets/js/loadview.js'] || '/assets/js/loadview.js', MAPLIBRE, ...Object.values(assets).filter((h) => !h.includes('/loadview.'))]) preload(href, { as: 'script' });
  for (const href of regionPreloads()) preload(href, { as: 'fetch', crossOrigin: 'anonymous' });
  return (
    <>
      <OverviewMarkup />
      <div style={{ display: 'contents' }} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: markup }} />
      <Island assets={assets} homeMap={homeMapManifest()} homeLite={homeLiteManifest()} homeProgress={homeProgress(detailJson as never)} />
    </>
  );
}
