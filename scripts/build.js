/* Vercel 빌드: 배포에 필요한 파일만 public/ 으로 모으고, 환경변수로 config.js 를 만듭니다.
   - VWORLD_KEY   : V-World 인증키 (Vercel 프로젝트 환경변수)
   - VWORLD_LAYER : (선택) 낮 배경 종류
   환경변수가 없으면 로컬 config.js 를, 그것도 없으면 빈 키(OpenFreeMap 회색 지도)를 씁니다.
   로컬 config.js 는 읽기만 하고 고치지 않습니다. */
const fs = require('fs');
const path = require('path');

const OUT = 'public';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT);
['index.html', 'assets', 'data'].forEach((p) => fs.cpSync(p, path.join(OUT, p), { recursive: true, filter: (f) => !f.endsWith('.md') }));

let config;
if (process.env.VWORLD_KEY) {
  config = 'window.VWORLD_KEY = ' + JSON.stringify(process.env.VWORLD_KEY) + ';\n';
  if (process.env.VWORLD_LAYER) config += 'window.VWORLD_LAYER = ' + JSON.stringify(process.env.VWORLD_LAYER) + ';\n';
} else if (fs.existsSync('config.js')) {
  config = fs.readFileSync('config.js', 'utf8');
} else {
  config = "window.VWORLD_KEY = '';\n";
}
fs.writeFileSync(path.join(OUT, 'config.js'), config);
console.log('build ok -> ' + OUT + '/ (V-World 키: ' + (/VWORLD_KEY\s*=\s*['"][^'"]+['"]/.test(config) ? '있음' : '없음') + ')');
