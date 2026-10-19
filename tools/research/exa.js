'use strict';
// 원천 자료조사용 Exa 검색·본문 추출. 키는 EXA_API_KEY 환경변수 또는 .env.local 에서 읽고 출력하지 않는다.
// 요청 모양은 Exa build-with-exa 스킬 권장형을 따른다.
//   node tools/research/exa.js search "<질의>" [--start-date YYYY-MM-DD] [--end-date YYYY-MM-DD] [--schema 파일.json] [--save 파일.json]
//   node tools/research/exa.js contents <URL...> [--save 파일.json]
// --start-date/--end-date 는 과업이 기간을 정할 때만(예: 마지막 실행 이후 새 정책 찾기), --schema 는 필드 추출이 필요할 때만 쓴다.
const fs = require('node:fs');
const path = require('node:path');

function searchBody(query, opts = {}) {
  const body = { query, type: 'auto', contents: { highlights: true } };
  if (opts.startDate) body.startPublishedDate = opts.startDate;
  if (opts.endDate) body.endPublishedDate = opts.endDate;
  if (opts.schema) body.outputSchema = opts.schema;
  return body;
}

function takeOption(rest, name) {
  const i = rest.indexOf(name);
  if (i === -1) return null;
  const v = rest[i + 1];
  if (v === undefined || v.startsWith('--')) throw new Error(`${name} 뒤에 값이 없다`);
  rest.splice(i, 2);
  return v;
}

function checkDate(name, v) {
  if (v !== null && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${name} 은 YYYY-MM-DD 형식이어야 한다: ${v}`);
  return v;
}

function contentsBody(urls) {
  return { urls, text: true };
}

function loadKey() {
  if (process.env.EXA_API_KEY) return process.env.EXA_API_KEY;
  const file = path.join(__dirname, '..', '..', '.env.local');
  if (!fs.existsSync(file)) return null;
  const m = fs.readFileSync(file, 'utf8').match(/^EXA_API_KEY=(.*)$/m);
  if (!m) return null;
  const v = m[1].trim().replace(/^["']+|["']+$/g, '').trim();
  return v || null;
}

async function call(endpoint, body, key) {
  const res = await fetch(`https://api.exa.ai/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Exa ${endpoint} 실패: HTTP ${res.status} ${text.slice(0, 500)}`);
  }
  return res.json();
}

function printSearch(res) {
  if (res.output !== undefined) console.log(`output ${JSON.stringify(res.output).slice(0, 2000)}`);
  for (const r of res.results || []) {
    console.log(`${r.title} | ${r.url} | ${r.publishedDate || '-'}`);
    for (const h of r.highlights || []) {
      String(h).split('\n').forEach((line) => console.log(`  > ${line}`));
    }
  }
}

function printContents(res) {
  let failed = false;
  for (const s of res.statuses || []) {
    console.log(`${s.status} ${s.id}`);
    if (s.status !== 'success') failed = true;
  }
  for (const r of res.results || []) {
    console.log(`${r.url} | 글자 ${String(r.text || '').length}`);
  }
  if (failed) process.exitCode = 3;
}

function printCost(res) {
  const c = res.costDollars;
  if (!c) return;
  console.log(c.total !== undefined ? `비용 $${c.total}` : `비용 ${JSON.stringify(c)}`);
}

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  if (command !== 'search' && command !== 'contents') {
    console.error('사용법: node tools/research/exa.js search "<질의>" [--start-date YYYY-MM-DD] [--end-date YYYY-MM-DD] [--schema 파일.json] [--save 파일.json]');
    console.error('        node tools/research/exa.js contents <URL...> [--save 파일.json]');
    process.exit(2);
  }

  const rest = argv.slice();
  const saveFile = takeOption(rest, '--save');
  const opts = {};
  if (command === 'search') {
    opts.startDate = checkDate('--start-date', takeOption(rest, '--start-date'));
    opts.endDate = checkDate('--end-date', takeOption(rest, '--end-date'));
    const schemaFile = takeOption(rest, '--schema');
    if (schemaFile) opts.schema = JSON.parse(fs.readFileSync(schemaFile, 'utf8'));
  }

  const key = loadKey();
  if (!key) {
    console.error('EXA_API_KEY 가 없다 — .env.local 에 EXA_API_KEY=... 를 넣는다');
    process.exit(1);
  }

  const res = command === 'search'
    ? await call('search', searchBody(rest.join(' '), opts), key)
    : await call('contents', contentsBody(rest), key);

  if (saveFile) {
    fs.mkdirSync(path.dirname(path.resolve(saveFile)), { recursive: true });
    fs.writeFileSync(saveFile, JSON.stringify(res, null, 2));
  }

  if (command === 'search') printSearch(res);
  else printContents(res);
  printCost(res);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { searchBody, contentsBody };
