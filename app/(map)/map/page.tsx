import fs from 'node:fs';
import path from 'node:path';
import { preload } from 'react-dom';
import MapIsland from '../../../components/MapIsland';

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

export default function MapPage() {
  const markup = mapMarkup();
  const assets = scriptManifest();
  for (const href of [assets['/assets/js/loadview.js'] || '/assets/js/loadview.js', MAPLIBRE, ...Object.values(assets).filter((h) => !h.includes('/loadview.'))]) preload(href, { as: 'script' });
  for (const href of regionPreloads()) preload(href, { as: 'fetch', crossOrigin: 'anonymous' });
  return (
    <>
      <div style={{ display: 'contents' }} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: markup }} />
      <MapIsland assets={assets} homeMap={homeMapManifest()} homeLite={homeLiteManifest()} />
    </>
  );
}
