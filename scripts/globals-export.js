'use strict';
/* app/globals.css 의 '내보내기 가능한 순수 CSS 층'을 꺼낸다(2026-10-18 2라운드 1단계, DESIGN.md).
   globals.css 안의 표시 주석 `/* @export start *\/` … `/* @export end *\/` 구간(여러 개)을 차례로 이어 붙인다.
   구간 안은 Tailwind 지시어가 없는 순수 CSS(토큰 :root·.dark·관점별 덮어쓰기, 줄바꿈 규칙, .ui-* 부품 클래스)라 Next 밖 정적 화면(/citizen)이 그대로 넣어 쓴다.
   쓰는 법: require('./globals-export').extractExport(cssText) · 명령줄 `node scripts/globals-export.js` → 표준 출력. 시험: tests/js/no-hardcode.test.cjs */
const fs = require('node:fs');
const path = require('node:path');

const START = '/* @export start */';
const END = '/* @export end */';
const GLOBALS = path.join(__dirname, '..', 'app', 'globals.css');

function extractExport(cssText) {
  const parts = [];
  let i = 0;
  for (;;) {
    const s = cssText.indexOf(START, i);
    if (s < 0) break;
    const e = cssText.indexOf(END, s);
    if (e < 0) throw new Error('@export start 뒤에 @export end 가 없다');
    const next = cssText.indexOf(START, s + START.length);
    if (next >= 0 && next < e) throw new Error('@export 구간이 겹친다');
    parts.push(cssText.slice(s + START.length, e).trim());
    i = e + END.length;
  }
  if (!parts.length) throw new Error('@export 구간이 없다');
  return parts.join('\n\n') + '\n';
}

module.exports = { extractExport, GLOBALS };

if (require.main === module) process.stdout.write(extractExport(fs.readFileSync(GLOBALS, 'utf8')));
