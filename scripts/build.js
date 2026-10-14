/* Vercel 빌드: 배포에 필요한 파일만 public/ 으로 모으고, 환경변수로 config.js 를 만듭니다.
   - assets/ · regions/ 만 복사합니다(원천 data·tools·tests·docs 와 *.md 는 올라가지 않습니다). 지도 마크업의 정본 index.html 은 복사하지 않습니다:
     Next.js 가 /map 을 그릴 때 프로젝트 루트에서 읽습니다(app/(map)/map/page.tsx).
   - 운영 빌드(VERCEL_ENV=production)는 regions/index.json 에서 visibility 가 preview 인 지역을 빼고 그 폴더도 복사하지 않습니다.
   - VWORLD_KEY   : V-World 인증키 (Vercel 프로젝트 환경변수)
   - VWORLD_LAYER : (선택) 배경 종류(기본 midnight)
   환경변수가 없으면 로컬 config.js 를, 그것도 없으면 빈 키(OpenFreeMap 어두운 지도)를 씁니다.
   - 지도 스크립트(assets/js/*.js 와 config.js)는 내용 해시가 붙은 사본(app.<해시8>.js, config.<해시8>.js)도 assets/js/ 에 만들고,
     옛 이름→해시 이름 표를 assets/manifest.json 에 적습니다. 해시 이름은 next.config.ts 가 immutable 장기 캐시로 내려 주고, 옛 이름은 그대로 남습니다(짧은 캐시).
   - 수도권 지도 정적 자료(data/board/home-map/<시군구>.json, tools/ledger/home-map.js)는 assets/home-map/ 에 같은 이름과 내용 해시 이름(<시군구>.<해시8>.json)으로 복사하고,
     시군구→해시 표를 assets/home-map/manifest.json 에 적습니다(지도 페이지가 읽어 window.HOME_MAP 으로 넘깁니다). 해시 이름은 immutable 장기 캐시입니다.
   로컬 config.js 는 읽기만 하고 고치지 않습니다. 로그에는 키 값을 찍지 않습니다. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* 지역 색인에서 이번 빌드에 넣을 지역만 남긴다. 기본 지역이 빠지면 남은 첫 지역이 기본이 된다. 원본은 바꾸지 않는다. */
function pickRegions(index, production) {
  const regions = index.regions.filter((r) => !(production && r.visibility === 'preview')).map((r) => ({ ...r }));
  if (regions.length && !regions.some((r) => r.default)) regions[0].default = true;
  return { ...index, regions };
}

function configText(root, env) {
  if (env.VWORLD_KEY) {
    let c = 'window.VWORLD_KEY = ' + JSON.stringify(env.VWORLD_KEY) + ';\n';
    if (env.VWORLD_LAYER) c += 'window.VWORLD_LAYER = ' + JSON.stringify(env.VWORLD_LAYER) + ';\n';
    return c;
  }
  const local = path.join(root, 'config.js');
  return fs.existsSync(local) ? fs.readFileSync(local, 'utf8') : "window.VWORLD_KEY = '';\n";
}

/* 지도 스크립트의 해시 이름 사본과 표. 내용이 같으면 이름이 같고, 바뀌면 이름이 바뀐다 */
function hashScripts(OUT) {
  const manifest = {};
  const put = (logical, file) => {
    const body = fs.readFileSync(file);
    const h = crypto.createHash('sha256').update(body).digest('hex').slice(0, 8);
    const name = path.basename(logical, '.js') + '.' + h + '.js';
    fs.writeFileSync(path.join(OUT, 'assets/js', name), body);
    manifest[logical] = '/assets/js/' + name;
  };
  const dir = path.join(OUT, 'assets/js');
  for (const f of fs.readdirSync(dir).sort()) if (/^[\w-]+\.js$/.test(f)) put('/assets/js/' + f, path.join(dir, f));
  put('/config.js', path.join(OUT, 'config.js'));
  fs.writeFileSync(path.join(OUT, 'assets/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

/* 수도권 지도 정적 자료의 사본과 시군구→해시 표. 원본 폴더가 없으면 아무것도 만들지 않는다 */
function homeMapFiles(root, OUT) {
  const src = path.join(root, 'data/board/home-map');
  if (!fs.existsSync(src)) return {};
  const dir = path.join(OUT, 'assets/home-map'), manifest = {};
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(src).sort()) {
    if (!/^\d{5}\.json$/.test(f)) continue;
    const body = fs.readFileSync(path.join(src, f)), sgg = f.slice(0, 5);
    const h = crypto.createHash('sha256').update(body).digest('hex').slice(0, 8);
    fs.writeFileSync(path.join(dir, f), body);
    fs.writeFileSync(path.join(dir, `${sgg}.${h}.json`), body);
    manifest[sgg] = h;
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest) + '\n');
  return manifest;
}

function build({ root = '.', out = 'public', env = process.env, log = console.log } = {}) {
  const OUT = path.join(root, out), production = env.VERCEL_ENV === 'production';
  const index = pickRegions(JSON.parse(fs.readFileSync(path.join(root, 'regions/index.json'), 'utf8')), production);
  for (const r of index.regions) {
    if (!fs.existsSync(path.join(root, 'regions', r.slug))) throw new Error(`regions/index.json 의 지역 폴더가 없습니다: regions/${r.slug}`);
  }
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const keep = (f) => !f.endsWith('.md') && !f.endsWith('.DS_Store');
  for (const p of ['assets']) fs.cpSync(path.join(root, p), path.join(OUT, p), { recursive: true, filter: keep });
  for (const r of index.regions) fs.cpSync(path.join(root, 'regions', r.slug), path.join(OUT, 'regions', r.slug), { recursive: true, filter: keep });
  fs.writeFileSync(path.join(OUT, 'regions/index.json'), JSON.stringify(index, null, 2) + '\n');
  const config = configText(root, env);
  fs.writeFileSync(path.join(OUT, 'config.js'), config);
  hashScripts(OUT);
  const home = homeMapFiles(root, OUT);
  log(`build ok -> ${out}/ (지역 ${index.regions.map((r) => r.slug).join(', ')}${Object.keys(home).length ? ` · 수도권 지도 자료 ${Object.keys(home).length}개 시군구` : ''}${production ? ' · 운영: 미리보기 지역 제외' : ''}; V-World 키: ${/VWORLD_KEY\s*=\s*['"][^'"]+['"]/.test(config) ? '있음' : '없음'})`);
  return index;
}

module.exports = { pickRegions, build, homeMapFiles };
if (require.main === module) build();
