/* 월별 공급 파동 리본 차트의 SVG 문자열(시안 buildChart·renderRibbon·pinSVG 를 옮김). 기하는 lib/board/sample.ts 의 ribbonOf(원장 집계)로 계산한다.
   정적 부분(층·띠·축)은 범례 강조(hl)에만, 동적 부분(연도 띠·총량 괄호·병목 핀)은 선택 시점(cur)에만 달라진다. */
import { C, LAST, NOW, PH, PITCH, PW, PX0, TOP, BOT, X, ribbonLabels, rp, staticTexts, yr, type Ribbon, type Tx } from '../../lib/board/sample';

/* 리본 차트의 선·글자·층 경계 색: 테마별 값은 app/tailwind.css 의 --rb-* (라이트·다크). SVG 속성이 var() 로 읽는다 */
/* 층마다 세로 그라데이션(#rbg0~5): 위 = 단계색 70% + 하이라이트 30%, 가운데 = 단계색, 아래 = 단계색 86% + 그늘 14%. 두 테마 모두 위가 빛나고 아래가 깊어 물결처럼 보인다.
   색은 stop-color '속성'이 아니라 style 로 준다: 속성 값의 color-mix() 는 브라우저가 읽지 못해 검정으로 칠했다(2026-10-10 화면으로 확인). */
const grad = (k: number) => `<linearGradient id="rbg${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:color-mix(in srgb, ${C[k]} 70%, var(--rb-hi))"/><stop offset=".5" style="stop-color:${C[k]}"/><stop offset="1" style="stop-color:color-mix(in srgb, ${C[k]} 86%, var(--rb-lo))"/></linearGradient>`;
const PAL = { mid: 'var(--rb-mid)', sep: 'var(--rb-sep)', sc: 'var(--rb-sc)', axis: 'var(--rb-axis)', ink: 'var(--rb-ink)', cur: 'var(--rb-cur)', hatch: 'var(--rb-hatch)', hatchOp: '.32', seam: 'var(--rb-seam)', band: 'var(--rb-band)', acc: 'var(--rb-acc)', dim: 'var(--rb-dim)', pos: 'var(--rb-pos)', yrOn: 'var(--rb-yr-on)', yrOff: 'var(--rb-yr-off)', hud: 'var(--rb-hud)', hudLine: 'var(--rb-hud-line)', hudTxt: 'var(--rb-hud-txt)', hudAcc: 'var(--rb-hud-acc)' };
export const HOVER = { fill: 'var(--rb-hover)', opacity: '.10' };
/* 선택한 달의 기준 막대: 테두리 없는 반투명 HUD 막대(위·아래가 조금 진하고 가운데가 옅은 세로 그라데이션 #cur-hud, 주색). 뒤의 층·지연 띠가 비쳐 보인다 */
export const CUR = { fill: 'url(#cur-hud)' };
export const RIBBON = { PX0, PITCH, TOP, PH };

const dimK = (hl: number, k: number) => (hl >= 0 && hl !== k ? 0.28 : 1);
const ln = (x1: number, y1: number, x2: number, y2: number, st: string, w: number, d?: string) =>
  `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${st}" stroke-width="${w}"${d ? ` stroke-dasharray="${d}"` : ''} pointer-events="none"/>`;
/* 글자 자리는 lib/board/sample.ts 의 staticTexts·ribbonLabels 가 정한다(겹치지 않게 고른 자리). c = PAL 의 색 이름 */
const tx = (x: Tx) => `<text x="${x.x.toFixed(1)}" y="${x.y.toFixed(1)}" fill="${PAL[x.c as keyof typeof PAL]}" font-size="${x.fs}"${x.bold ? ' font-weight="700"' : ''} text-anchor="${x.a}">${x.t}</text>`;

/* 정적 부분: 층 6개(실적·예정), 지연 띠, 예정 구간 빗금, 기준일 선, 축 글자. hl = 범례에서 고른 단계(없으면 -1). */
export function chartStatic(g: Ribbon, hl: number): string {
  const nowX = X(NOW + 1);
  let s = `<defs><pattern id="hatch" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M-3 3 L3 -3 M0 14 L14 0 M11 17 L17 11" fill="none" stroke="${PAL.hatch}" stroke-width="1.2" stroke-opacity="${PAL.hatchOp}"/></pattern>`
    + `<linearGradient id="cur-hud" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${PAL.acc}" stop-opacity=".34"/><stop offset=".16" stop-color="${PAL.acc}" stop-opacity=".14"/><stop offset=".84" stop-color="${PAL.acc}" stop-opacity=".14"/><stop offset="1" stop-color="${PAL.acc}" stop-opacity=".34"/></linearGradient>${[0, 1, 2, 3, 4, 5].map(grad).join('')}`
    + `<linearGradient id="rb-scan-g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${PAL.hudAcc}" stop-opacity="0"/><stop offset=".6" stop-color="${PAL.hudAcc}" stop-opacity=".38"/><stop offset=".86" stop-color="#FFFFFF" stop-opacity=".9"/><stop offset="1" stop-color="${PAL.hudAcc}" stop-opacity="0"/></linearGradient></defs>`;
  /* 첫 화면 연출(app/tailwind.css 의 [data-intro]): 축(rb-axes)·층(rb-layers)·기준일(rb-now)을 따로 묶어 차례로 등장시킨다 */
  const T = staticTexts(g);
  s += '<g class="rb-axes">';
  [1, 2, 3].forEach((i) => { s += ln(X(i * 12), TOP - 10, X(i * 12), BOT, PAL.sep, 1, '2 4'); });
  s += '</g><g class="rb-layers">';
  for (let k = 5; k >= 0; k--) {
    s += `<path d="${rp(g, k, 0, NOW + 1, false, 3)}" fill="url(#rbg${k})" opacity="${dimK(hl, k).toFixed(2)}"/>`;
    s += `<path d="${rp(g, k, NOW + 1, LAST + 1, false, 3)}" fill="url(#rbg${k})" opacity="${(0.62 * dimK(hl, k)).toFixed(2)}"/>`;
  }
  /* 층 경계: 전 구간 한 줄로 그어(과거·예정 사이에 세로 이음선이 생기지 않게) 층이 또렷하게 갈린다. 라이트 흰색, 다크 남색(--rb-seam) */
  for (let k = 5; k >= 0; k--) s += `<path d="${rp(g, k, 0, LAST + 1, false, 3)}" fill="none" stroke="${PAL.seam}" stroke-width="0.9" stroke-opacity="${(0.85 * dimK(hl, k)).toFixed(2)}" stroke-linejoin="round" pointer-events="none"/>`;
  for (let k = 0; k < 6; k++) s += `<path d="${rp(g, k, 0, LAST + 1, true, 3)}" fill="${PAL.band}" fill-opacity="${(0.94 * dimK(hl, k)).toFixed(2)}"/>`;
  s += `<rect x="${nowX.toFixed(1)}" y="${TOP}" width="${(PX0 + PW - nowX).toFixed(1)}" height="${PH}" fill="url(#hatch)" pointer-events="none"/>`;
  s += '</g><g class="rb-now">' + ln(nowX, TOP - 8, nowX, BOT + 2, PAL.ink, 1.4, '5 4');
  s += tx(T.now) + '</g><g class="rb-axes">' + T.months.map(tx).join('');
  /* 세로축(호): 층이 판을 거의 덮으므로 눈금선은 층 경계색(--rb-seam)을 55% 로 깐 점선으로 층 위에서도 보이게, 0 은 실선. 눈금 글자·'(호)' 는 staticTexts 가 정한다 */
  g.ticks.forEach((v, i) => { const y = BOT - v * g.s2; s += (i ? `<g opacity=".55">${ln(PX0, y, PX0 + PW, y, PAL.seam, 1, '3 4')}</g>` : ln(PX0, y, PX0 + PW, y, PAL.mid, 1)) + ln(PX0 - 4, y, PX0, y, PAL.axis, 1); });
  s += T.ticks.map(tx).join('') + tx(T.unit);
  /* 범례(붉은 띠)와 총량 설명: 총량이 매달 같으면 머리 위 줄(HY1)에, 아니면 시안처럼 층 위 왼쪽에 */
  s += `<rect x="${PX0 + 8}" y="${T.legend.y - 9}" width="12" height="12" rx="2" fill="${PAL.band}"/>` + tx(T.legend) + (T.summary ? tx(T.summary) : '') + '</g>';
  return s;
}

/* 리본 위 라벨: HUD 판(남색 반투명 유리 + 밝은 가장자리 선 + 왼쪽 3px 강조 띠) 위에 흰 글자. 흰 판이 리본 색을 가리던 것을 바꿨다(2026-10-10).
   글자에 외곽선을 겹치면 축소 시 획이 뭉개져서 판과 글자를 따로 그린다. accent = 강조 띠 색(총량은 밝은 주색 --rb-hud-acc, 병목·정점 핀은 지연 띠 색) */
function labelSVG(b: { x: number; y: number; w: number; center: number; baseline: number }, text: string, accent: string): string {
  return `<rect x="${b.x.toFixed(2)}" y="${b.y.toFixed(2)}" width="${b.w}" height="24" rx="5" fill="${PAL.hud}" stroke="${PAL.hudLine}" stroke-width=".75"/>`
    + `<rect x="${(b.x + 3).toFixed(2)}" y="${(b.y + 4).toFixed(2)}" width="3" height="16" rx="1.5" fill="${accent}"/>`
    + `<text x="${(b.center + 3).toFixed(2)}" y="${b.baseline.toFixed(2)}" fill="${PAL.hudTxt}" font-size="15" font-weight="600" text-anchor="middle">${text}</text>`;
}

/* 병목 핀: 그 달 병목 단계(지연 호수가 가장 큰 단계)의 지연 띠 한가운데. 라벨은 핀 위(시안 자리)가 머리 글자와 겹치면 아래·옆으로 비켜 놓는다(ribbonLabels) */
function pinSVG(p: ReturnType<typeof ribbonLabels>['pin']): string {
  const { px, py } = p, y2 = p.below ? py + 34 : py - 34;
  return `<g class="rb-pin"><line x1="${px.toFixed(1)}" y1="${(p.below ? py + 7 : py - 7).toFixed(1)}" x2="${p.center.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${PAL.cur}" stroke-width="1.2" stroke-dasharray="2 2"/>`
    + `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="6" fill="var(--rb-pin)" stroke="${PAL.acc}" stroke-width="3"/>`
    + labelSVG(p, p.text, PAL.band) + '</g>';
}

/* 동적 부분: 연도 띠 · 총량 괄호 · 병목 핀(선택 시점, 판정 기록 앞이면 NOW 관측) */
export function ribbonDynamic(g: Ribbon, cur: number): string {
  const yi = yr(cur), L = ribbonLabels(g, cur);
  let s = '';
  [0, 1, 2, 3].forEach((i) => {
    const ma = i * 12, mb = Math.min(ma + 11, LAST), xa = X(ma), xb = X(mb + 1), act = i === yi, bc = act ? PAL.acc : PAL.dim, bw = act ? 2.2 : 1.2;
    const bl = (x1: number, y1: number, x2: number, y2: number) => `<line x1="${x1.toFixed(1)}" y1="${y1}" x2="${x2.toFixed(1)}" y2="${y2}" stroke="${bc}" stroke-width="${bw}"/>`;
    s += `<g class="rb-yr" style="--i:${i}">${L.years[i].map(tx).join('')}`;   // 이 해의 머리 글자(총량이 같으면 연도 하나, 다르면 연도·총량과 증감 두 줄)
    s += bl(xa + 3, 38, xb - 3, 38) + bl(xa + 3, 34, xa + 3, 38) + bl(xb - 3, 34, xb - 3, 38) + '</g>';
  });
  const top = BOT - g.total[cur] * g.s2, bx = X(cur + 0.5);
  const cl = (x1: number, y1: number, x2: number, y2: number, w: number, d?: boolean) => `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${PAL.cur}" stroke-width="${w}"${d ? ' stroke-dasharray="2 2"' : ''}/>`;
  s += '<g class="rb-marks">' + cl(bx, top, bx, BOT, 1.4, true) + cl(bx - 8, top, bx + 8, top, 2) + cl(bx - 8, BOT, bx + 8, BOT, 2);
  s += labelSVG(L.total, L.total.text, PAL.hudAcc);
  s += pinSVG(L.pin);
  return s + '</g>';
}
