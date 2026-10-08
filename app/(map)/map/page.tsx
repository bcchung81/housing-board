import fs from 'node:fs';
import path from 'node:path';
import MapIsland from '../../../components/MapIsland';

/* 지도 섬: 기존 지도 앱의 마크업(index.html 의 body)을 그대로 넣고, 스크립트는 MapIsland 가 기존 순서대로 불러온다.
   app.js·시험은 건드리지 않는다. 마크업의 정본은 지금 루트 index.html 이다. */
const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
const markup = (html.match(/<body>([\s\S]*)<\/body>/)?.[1] ?? '').replace(/<noscript>[\s\S]*?<\/noscript>/, '');
if (!markup.includes('id="map"')) throw new Error('index.html 에서 지도 마크업을 찾지 못했습니다');

export default function MapPage() {
  return (
    <>
      <div style={{ display: 'contents' }} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: markup }} />
      <MapIsland />
    </>
  );
}
