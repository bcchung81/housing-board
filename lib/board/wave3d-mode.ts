/* 종합상황판 '월별 공급 파동' 3D·2D 판정(R4). components/board/SupplyWaveChart.tsx 가 '/' 첫 화면에서 부르므로 아무것도 import 하지 않는다(d3-scale·three 가 딸려 오지 않게).
   WebGL 없음·움직임 줄이기·900px 이하는 지금 2D SVG */
export const viewMode = (o: { webgl: boolean; reduced: boolean; width: number }): '3d' | '2d' => (o.webgl && !o.reduced && o.width > 900 ? '3d' : '2d');
