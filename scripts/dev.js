#!/usr/bin/env node
/* 로컬 개발 서버: 저장소 루트의 정적 파일 + /api/bus(api/bus.js 그대로).
   node scripts/dev.js [포트=8000]
   버스 위치(/api/bus)는 .env.local 의 DATA_GO_KR_KEY 가 있어야 동작한다. 없으면 503 이고 지도는 버스 없이 뜬다.
   127.0.0.1 에만 열고, 점(.)으로 시작하는 파일(.env.local·.git)과 node_modules 는 내주지 않는다. 배포 빌드(scripts/build.js)와 무관하다. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.pbf': 'application/x-protobuf', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8' };

function loadEnv(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

function createServer(root = ROOT, env = process.env) {
  const bus = require(path.join(root, 'api', 'bus.js')).createHandler({ env });
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('Cache-Control', 'no-store');
    if (url.pathname === '/api/bus') return bus(req, res);
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(root, '.' + rel);
    const parts = path.relative(root, file).split(path.sep);
    if (file !== root && !file.startsWith(root + path.sep)) { res.statusCode = 403; return res.end('forbidden'); }
    if (parts.some((p) => p.startsWith('.') || p === 'node_modules')) { res.statusCode = 404; return res.end('not found'); }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.statusCode = 404; return res.end('not found'); }
      res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
      fs.createReadStream(file).pipe(res);
    });
  });
}

if (require.main === module) {
  const port = Number(process.argv[2]) || 8000;
  const env = Object.assign({}, loadEnv(path.join(ROOT, '.env.local')), process.env);
  createServer(ROOT, env).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/  (버스 위치 ${env.DATA_GO_KR_KEY ? '켬' : '꺼짐: .env.local 에 DATA_GO_KR_KEY 가 없음'})`));
}
module.exports = { createServer, loadEnv };
