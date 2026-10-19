/* 시안 v2 CSS 만들기: 앱의 app/globals.css 를 그대로 입력으로, 이 폴더의 HTML·assets/app.js 를 스캔 대상으로 다시 컴파일한다.
   같은 토큰·유틸리티·.dark 테마가 나온다. 저장소 루트에서: node docs/design/home-concept/build-css.mjs → assets/app.css */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const appDir = path.join(root, 'app');
const input = readFileSync(path.join(appDir, 'globals.css'), 'utf8');

const compiler = await compile(input, { base: appDir, onDependency: () => {} });
const files = [
  ...readdirSync(here).filter((f) => f.endsWith('.html')).map((f) => path.join(here, f)),
  path.join(here, 'assets', 'app.js'),
];
const scanner = new Scanner({});
const candidates = scanner.scanFiles(files.map((file) => ({ content: readFileSync(file, 'utf8'), extension: path.extname(file).slice(1) })));
/* 글꼴: 레이아웃의 doHyeon.variable(--font-do-hyeon)과 같은 역할 */
const font = `@font-face{font-family:'Do Hyeon';src:url('./DoHyeon-Regular.woff2') format('woff2');font-weight:400;font-style:normal;font-display:block}
:root{--font-do-hyeon:'Do Hyeon'}
`;
writeFileSync(path.join(here, 'assets', 'app.css'), font + compiler.build(candidates));
console.log(`app.css: 파일 ${files.length} · 후보 ${candidates.length}`);
