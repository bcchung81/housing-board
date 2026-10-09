#!/usr/bin/env node
/* 화면 비교용 스크린샷 촬영(개발 도구). 같은 주소·해상도·상호작용 상태를 찍어 두 번의 결과를 scripts/visual/diff.mjs 로 픽셀 비교한다.
   Tailwind·shadcn 전환(2026-10-09 결정: 픽셀 완전 동일)에서 '바뀌기 전과 같은가'를 확인하는 기준선이다.

     node scripts/visual/shoot.js --base http://localhost:3100 --out .visual/baseline [--only /area,/month] [--map]

   ego-browser 가 필요하다(환경변수를 못 받아서 이 파일이 설정을 스크립트에 끼워 넣어 stdin 으로 넘긴다).
   결정적이게 하려고 prefers-reduced-motion 을 켜고(시안의 순환·전환 끔), 해상도 1440·1100·390, 배율 1, 긴 페이지는 높이 6000 에서 자른다. */
'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : a), []));
const base = (args.base || 'http://localhost:3100').replace(/\/$/, '');
const out = path.resolve(args.out || '.visual/shot');
const only = args.only ? String(args.only).split(',') : null;

/* 대시보드 경로(단일 화면). 알려진 모든 화면 종류를 한 번씩 */
const ROUTES = ['/', '/area', '/area/11', '/area/12', '/area/41450', '/area/11110', '/month/2026-08', '/month/2026-10', '/projects', '/project/PRJ-11290-0001', '/stage', '/stage/04', '/stage/01',
  '/agency', '/agency/lh', '/agency/local', '/agency/sh', '/agency/mnd', '/sources', '/reports', '/my-area', '/area/99'];
const WIDTHS = [1440, 1100, 390];

/* 상호작용 상태: [이름, 경로, 폭들, 동작(ego 스크립트 조각 — page 가 있다)] */
const STATES = [
  ['home-dir3', '/', [1440], 'await page.click("css:.dir:nth-child(3)");'],
  ['home-dir6', '/', [1440], 'await page.click("css:.dir:nth-child(6)");'],
  ['home-legend-start', '/', [1440], 'await page.click("css:.blegend button:nth-child(3)");'],
  ['home-jump-p12', '/', [1440, 390], 'await page.click("css:.jumps button:nth-child(4)");'],
  ['home-jump-m12', '/', [1440], 'await page.click("css:.jumps button:nth-child(1)");'],
  ['home-region-gg', '/', [1440], 'await page.click("css:.reg:nth-child(2)");'],
  ['home-region-jn', '/', [1440], 'await page.click("css:.reg:nth-child(14)");'],
  ['home-flow3', '/', [1440], 'await page.evaluate(() => [...document.querySelectorAll(".fstep")][2].click());'],
  ['home-tip', '/', [1440], 'await page.mouse.move(520, 480); await page.mouse.move(540, 482); await page.mouse.move(560, 484); await page.waitForSelector("css:#p-chart .tip:not([hidden])", { timeout: 5000 });'],
  ['rail-folded', '/area', [1440], 'await page.evaluate(() => localStorage.setItem("rail-folded", "1")); await page.reload(); await page.waitForSelector("css:nav.rail"); await page.waitForTimeout(300);'],
  ['rail-drawer', '/area', [390], 'await page.click("css:.rail-burger"); await page.waitForTimeout(400);'],
];

const config = { base, out, only, routes: ROUTES, widths: WIDTHS, states: STATES.map(([n, r, w]) => [n, r, w]), map: !!args.map };
const actions = STATES.map(([, , , code]) => `async (page) => { ${code} }`).join(',\n');

const script = `
const fs = await import("node:fs/promises");
const C = ${JSON.stringify(config)};
const ACT = [${actions}];
const H = 900, CAP = 6000;
const slug = (s) => (s === "/" ? "home" : s.replace(/^\\//, "").replace(/[\\/?=&]+/g, "-"));
const task = await taskSpace("visual shoot");
const page = task.page("p1");
await page.goto(C.base + "/");
await page.waitForLoadState();
const DPR = await page.evaluate(() => devicePixelRatio);   // 이 브라우저의 화면 배율(예 1.1). 뷰포트 폭은 이만큼 나뉘어 적용되므로 미리 곱해 준다
await page.cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
const setView = async (w) => {
  const mobile = w < 600;   // 모바일 에뮬레이션은 배율 보정 없이 폭 그대로 적용된다
  await page.cdp("Emulation.setDeviceMetricsOverride", { width: mobile ? w : Math.round(w * DPR), height: mobile ? 844 : Math.round(H * DPR), deviceScaleFactor: mobile ? 1 : 1, mobile });
  const iw = await page.evaluate(() => innerWidth);
  if (iw !== w) console.log("경고: 뷰포트 폭", w, "요청, 실제", iw);
};
/* 포인터를 화면 밖으로 치운다: 이전 상태(툴팁 등)에서 남은 포인터가 다음 화면의 호버 효과를 만들면 같은 화면이 다르게 찍힌다 */
const park = () => page.cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: -50, y: -50, buttons: 0 });
const settle = async () => { await park(); await page.evaluate(() => document.fonts.ready.then(() => 0)); await page.waitForTimeout(350); };
/* CSS 픽셀 1:1 로 캡처한다(SDK 의 page.screenshot 은 배율 보정이 겹쳐 이미지가 1/1.1 로 줄어든다). clip.scale 1 = 이미지 1 픽셀이 CSS 1 픽셀 */
const cap = async (file, clip) => {
  const r = await page.cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { ...clip, scale: 1 } });
  await fs.mkdir(C.out, { recursive: true });
  await fs.writeFile(C.out + "/" + file + ".png", Buffer.from(r.data, "base64"));
};
const shot = async (file) => {
  const m = await page.evaluate(() => ({ w: innerWidth, h: Math.ceil(document.documentElement.scrollHeight) }));
  await cap(file, { x: 0, y: 0, width: m.w, height: Math.min(m.h, CAP) });
  return m.h;
};
let n = 0;
const want = (r) => !C.only || C.only.includes(r);
for (const w of C.widths) {
  await setView(w);
  for (const r of C.routes) {
    if (!want(r)) continue;
    await page.goto(C.base + r); await page.waitForLoadState(); await settle();
    const h = await shot(slug(r) + "@" + w); n++;
    console.log(w, r, "height", h);
  }
}
for (let i = 0; i < C.states.length; i++) {
  const [name, route, widths] = C.states[i];
  if (!want(route)) continue;
  for (const w of widths) {
    await setView(w);
    await page.goto(C.base + route); await page.waitForLoadState(); await settle();
    await ACT[i](page); await page.waitForTimeout(450);
    await shot("state-" + name + "@" + w); n++;
    console.log("state", name, w);
    await park();
    await page.evaluate(() => localStorage.removeItem("rail-folded"));
  }
}
if (C.map) {
  for (const w of [1440, 390]) {
    await setView(w);
    await page.goto(C.base + "/map?region=jeonnam-naju&selftest=1"); await page.waitForLoadState();
    await page.waitForFunction(() => window.__mapStatus && window.__mapStatus.loaded, undefined, { timeout: 60000 }).catch(() => {});
    await settle();
    await cap("map-rail@" + w, { x: 0, y: 0, width: w < 600 ? 70 : 60, height: H });
    n++; console.log("map-rail", w);
  }
}
await page.cdp("Emulation.setDeviceMetricsOverride", { width: 0, height: 0, deviceScaleFactor: 0, mobile: false });
await task.finish({ keep: [] });
console.log("찍은 장수:", n);
`;

const child = spawn('ego-browser', ['nodejs'], { stdio: ['pipe', 'inherit', 'inherit'] });
child.stdin.end(script);
child.on('exit', (code) => process.exit(code ?? 1));
