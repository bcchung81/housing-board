/* 월별 공급 파동 리본 차트의 SVG 문자열(시안 buildChart·renderRibbon·pinSVG 를 그대로 옮김). 수식은 lib/board/sample.ts 와 같다.
   정적 부분(층·띠·축)은 범례 강조(hl)에만, 동적 부분(연도 띠·굵기 괄호·병목 핀)은 선택 시점(cur)에만 달라진다. */
import { C, GEO, K, LAST, NOW, PEAK, PH, PITCH, PW, PX0, S2, TOP, BOT, X, Y0, YT, argmax, dStage, f, ml, r10, rp, tot, vals, yr } from '../../lib/board/sample';

/* 리본 차트의 선·글자·층 경계 색: 테마별 값은 app/tailwind.css 의 --rb-* (라이트·다크). SVG 속성이 var() 로 읽는다 */
const PAL = { mid: 'var(--rb-mid)', sep: 'var(--rb-sep)', sc: 'var(--rb-sc)', axis: 'var(--rb-axis)', ink: 'var(--rb-ink)', cur: 'var(--rb-cur)', hatch: 'var(--rb-hatch)', hatchOp: '.55', seam: 'var(--rb-seam)', band: 'var(--rb-band)', acc: 'var(--rb-acc)', dim: 'var(--rb-dim)', pos: 'var(--rb-pos)', yrOn: 'var(--rb-yr-on)', yrOff: 'var(--rb-yr-off)', halo: 'var(--rb-halo)', haloTxt: 'var(--rb-halo-txt)' };
export const HOVER = { fill: 'var(--rb-hover)', opacity: '.10' };
export const CUR = { stroke: PAL.cur, width: 2.4 };
export const RIBBON = { PX0, PITCH, TOP, PH };

const dimK = (hl: number, k: number) => (hl >= 0 && hl !== k ? 0.28 : 1);
const ln = (x1: number, y1: number, x2: number, y2: number, st: string, w: number, d?: string) =>
  `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${st}" stroke-width="${w}"${d ? ` stroke-dasharray="${d}"` : ''} pointer-events="none"/>`;
const tt = (x: number, y: number | string, t: string, fill: string, fs: number, a: string) => `<text x="${x.toFixed(1)}" y="${y}" fill="${fill}" font-size="${fs}" text-anchor="${a}">${t}</text>`;

/* 정적 부분: 층 6개(실적·예정), 지연 띠, 예정 구간 빗금, 기준일 선, 축 글자. hl = 범례에서 고른 단계(없으면 -1). */
export function chartStatic(hl: number): string {
  const nowX = X(NOW + 1);
  let s = `<defs><pattern id="hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="9" stroke="${PAL.hatch}" stroke-width="3.5" stroke-opacity="${PAL.hatchOp}"/></pattern></defs>`;
  const half = 12500 * S2;
  s += ln(PX0, Y0, PX0 + PW, Y0, PAL.mid, 1, '3 4');
  s += ln(22, Y0 - half, 22, Y0 + half, PAL.sc, 1.6) + ln(17, Y0 - half, 27, Y0 - half, PAL.sc, 1.6) + ln(17, Y0 + half, 27, Y0 + half, PAL.sc, 1.6);
  s += tt(22, (Y0 - half - 8).toFixed(1), '굵기', PAL.axis, 10, 'middle') + tt(22, (Y0 + half + 15).toFixed(1), '25,000호', PAL.axis, 10, 'middle');
  [1, 2, 3].forEach((i) => { s += ln(X(i * 12), TOP - 10, X(i * 12), BOT, PAL.sep, 1, '2 4'); });
  for (let k = 5; k >= 0; k--) {
    s += `<path d="${rp(k, 0, NOW + 1, false)}" fill="${C[k]}" fill-opacity="${(0.92 * dimK(hl, k)).toFixed(2)}" stroke="${PAL.seam}" stroke-width="0.6"/>`;
    s += `<path d="${rp(k, NOW + 1, LAST + 1, false)}" fill="${C[k]}" fill-opacity="${(0.62 * dimK(hl, k)).toFixed(2)}" stroke="${PAL.seam}" stroke-width="0.6"/>`;
  }
  for (let k = 0; k < 6; k++) s += `<path d="${rp(k, 0, LAST + 1, true)}" fill="${PAL.band}" fill-opacity="${(0.94 * dimK(hl, k)).toFixed(2)}"/>`;
  s += `<rect x="${nowX.toFixed(1)}" y="${TOP}" width="${(PX0 + PW - nowX).toFixed(1)}" height="${PH}" fill="url(#hatch)" pointer-events="none"/>`;
  s += ln(nowX, TOP - 8, nowX, BOT + 2, PAL.ink, 1.4, '5 4');
  s += tt(nowX, 392, '기준일 2026.10', PAL.ink, 12, 'middle');
  [0, 6, 12, 18, 30, 36, 42].forEach((m) => { s += tt(X(m + 0.5), 392, ml(m), PAL.axis, 11, 'middle'); });
  s += `<rect x="${PX0 + 8}" y="64" width="10" height="10" rx="2" fill="${PAL.band}"/>` + tt(PX0 + 24, 73, '붉은 띠 = 단계별 지연 호수', PAL.sc, 11, 'start');
  return s;
}

/* 병목 핀: 그 달 병목 단계의 지연 띠 한가운데 */
function pinSVG(m: number, main: boolean): string {
  const g = GEO[4 * m + 2], ds = dStage(m), k = argmax(ds);
  const px = X(m + 0.5), py = g.lw[k] - g.dl[k] / 2, cx = Math.max(PX0 + 95, Math.min(PX0 + PW - 95, px));
  const t = main ? `${K[k]} 지연 ${f(r10(ds[k]))}호 · ${(ds[k] / vals(m)[k] * 100).toFixed(1)}%` : `정점 · ${K[k]} ${f(r10(ds[k]))}호`;
  return `<line x1="${px.toFixed(1)}" y1="${(py - 7).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${(py - 34).toFixed(1)}" stroke="${PAL.cur}" stroke-width="1.2" stroke-dasharray="2 2"/>`
    + `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="6" fill="var(--rb-pin)" stroke="${PAL.acc}" stroke-width="3"/>`
    + `<text x="${cx.toFixed(1)}" y="${(py - 40).toFixed(1)}" fill="${PAL.haloTxt}" font-size="12" font-weight="700" text-anchor="middle" stroke="${PAL.halo}" stroke-width="4" paint-order="stroke" stroke-linejoin="round">${t}</text>`;
}

/* 동적 부분: 연도 띠 · 굵기 괄호 · 병목 핀(선택 시점과 정점) */
export function ribbonDynamic(cur: number): string {
  const yi = yr(cur);
  let s = '';
  YT.forEach((tv, i) => {
    const ma = i * 12, mb = Math.min(ma + 11, LAST), xa = X(ma), xb = X(mb + 1), act = i === yi, bc = act ? PAL.acc : PAL.dim, bw = act ? 2.2 : 1.2, cx = ((xa + xb) / 2).toFixed(1);
    const bl = (x1: number, y1: number, x2: number, y2: number) => `<line x1="${x1.toFixed(1)}" y1="${y1}" x2="${x2.toFixed(1)}" y2="${y2}" stroke="${bc}" stroke-width="${bw}"/>`;
    s += `<text x="${cx}" y="16" fill="${act ? PAL.yrOn : PAL.yrOff}" font-size="13" font-weight="700" text-anchor="middle">${2025 + i}년 ${f(tv)}호</text>`;
    s += i > 0
      ? `<text x="${cx}" y="31" fill="${PAL.pos}" font-size="11" font-weight="700" text-anchor="middle">▲ +${f(tv - YT[i - 1])}호 (+${Math.round((tv - YT[i - 1]) / YT[i - 1] * 100)}%)</text>`
      : `<text x="${cx}" y="31" fill="${PAL.axis}" font-size="11" text-anchor="middle">기준 연도</text>`;
    s += bl(xa + 3, 38, xb - 3, 38) + bl(xa + 3, 34, xa + 3, 38) + bl(xb - 3, 34, xb - 3, 38);
  });
  const hh = tot(cur) * S2 / 2, bx = X(cur + 0.5);
  const cl = (x1: number, y1: number, x2: number, y2: number, w: number, d?: boolean) => `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${PAL.cur}" stroke-width="${w}"${d ? ' stroke-dasharray="2 2"' : ''}/>`;
  s += cl(bx, Y0 - hh, bx, Y0 + hh, 1.4, true) + cl(bx - 8, Y0 - hh, bx + 8, Y0 - hh, 2) + cl(bx - 8, Y0 + hh, bx + 8, Y0 + hh, 2);
  s += `<text x="${bx.toFixed(1)}" y="${(Y0 - hh - 7).toFixed(1)}" fill="${PAL.haloTxt}" font-size="12" font-weight="700" text-anchor="middle" stroke="${PAL.halo}" stroke-width="4" paint-order="stroke" stroke-linejoin="round">${f(tot(cur))}호</text>`;
  s += pinSVG(cur, true);
  if (Math.abs(PEAK - cur) > 4) s += pinSVG(PEAK, false);
  return s;
}
