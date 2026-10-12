'use strict';
/* 건축HUB 대용량 제공 서비스(구분 02 주택인허가)의 기본개요·행위개요·대지위치 zip 을 브라우저 없이(Node 내장 fetch) 내려받는다.
   인증키·로그인 필요 없음. 웹 양식과 같은 요청을 한다(2026-10-11 실측).
     1) GET  https://www.hub.go.kr/portal/opn/lps/idx-lgcpt-pvsn-srvc-list.do  → 세션 쿠키(JSESSIONID)와 <meta name="_csrf"> 토큰
     2) POST 같은 주소 (_csrf, opnLgcptTaskSeCd=02, srvcNm, startDay, endDay, pageIndex, pageCountPerPage) → 목록 HTML
        행마다 onclick="fnDownloadPop('02','0201','OPN202609201218463850')" 가 업무 코드와 파일 식별자(srvrFileNm)이고,
        제목 '기본개요 (2026년 08월)' 의 연월이 데이터 월, detail 의 연월이 제공 월(데이터 월 +1, 익월 20일께 올라온다)이다.
     3) POST /portal/opn/lps/idx-srvc-hstry-insert.do (헤더 X-CSRF-TOKEN, opnLgcptTaskSeCd, opnTaskCd, opnPrcusePrpsCd=3 참고자료) — 이용목적 팝업 '확인'과 같은 기록 요청
     4) POST /cmm/fms/fileOpnDown.do (_csrf, srvrFileNm=파일 식별자) → zip 본문
   예의: 한 번에 하나씩, 요청 사이 1초 이상, 사람이 읽을 수 있는 User-Agent, 실패 시 2회 재시도. 캡차·로그인이 나오면 우회하지 않고 멈춘다.
   사용:
     node tools/ledger/fetch-hub-bulk.js --list                         받을 수 있는 데이터 월(최신 순)
     node tools/ledger/fetch-hub-bulk.js --data-month 2026-08 --out <폴더> [--kinds basic,act,site] [--layout bulk|history]
   layout bulk(기본)은 주택인허가_기본개요_YYYY-MM.zip 등, history 는 basic-YYYY-MM.zip(기본개요만). 표준출력에 manifest 조각(JSON)을 낸다. 진행은 표준오류.
   순수 함수(parseCsrf·parseListHtml·pickFile·zipName·countPipes)는 tests/js/fetch-hub-bulk.test.cjs 가 가짜 응답으로 시험한다. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');

const BASE = 'https://www.hub.go.kr';
const LIST_PATH = '/portal/opn/lps/idx-lgcpt-pvsn-srvc-list.do';
const LOG_PATH = '/portal/opn/lps/idx-srvc-hstry-insert.do';
const DOWN_PATH = '/cmm/fms/fileOpnDown.do';
const UA = 'housing-board/1.0 (public data download; +https://github.com/bcchung81/housing-board)';
const PURPOSE = '3';   // 참고자료
const WAIT_MS = 1100;

/* 종류: 목록 제목(srvcNm), 업무 코드, 기존 파일 이름 조각, 안의 파일과 기대 열 수 */
const KINDS = {
  basic: { title: '기본개요', task: '0201', file: '기본개요', member: 'mart_jty_01.txt', cols: 29 },
  act: { title: '행위개요', task: '0211', file: '행위개요', member: 'mart_jty_12.txt', cols: 42 },
  site: { title: '대지위치', task: '0215', file: '대지위치', member: 'mart_jty_15.txt', cols: 21 },
};

/* ---------- 순수 함수 ---------- */

function parseCsrf(html) {
  const m = /<meta\s+name="_csrf"\s+content="([^"]+)"/.exec(html);
  return m ? m[1] : null;
}

/* 목록 HTML → { total, items:[{ name, dataMonth, providedMonth, task, fileId }] } (표시 순서 그대로) */
function parseListHtml(html) {
  const t = /총\s*<em>(\d+)<\/em>/.exec(html);
  const items = [];
  for (const block of html.split(/<li>/).slice(1)) {
    const d = /fnDownloadPop\('(\d+)','(\d+)','([^']+)'\)/.exec(block);
    const tit = /<p class="tit">\s*([^<]*?)\s*\((\d{4})년\s*(\d{1,2})월\)\s*<\/p>/.exec(block);
    const det = /<span class="detail">\s*(\d{4}-\d{2})\s*<\/span>/.exec(block);
    if (!d || !tit) continue;
    items.push({
      name: tit[1], dataMonth: `${tit[2]}-${tit[3].padStart(2, '0')}`,
      providedMonth: det ? det[1] : null, group: d[1], task: d[2], fileId: d[3],
    });
  }
  return { total: t ? Number(t[1]) : 0, items };
}

/* 종류(basic|act|site)와 데이터 월의 파일을 고른다. 업무 코드까지 맞는 것만. 없으면 null, 둘 이상이면 오류 */
function pickFile(items, kind, dataMonth) {
  const k = KINDS[kind];
  if (!k) throw new Error(`알 수 없는 종류: ${kind}`);
  const hit = items.filter((i) => i.group === '02' && i.task === k.task && i.name === k.title && i.dataMonth === dataMonth);
  if (hit.length > 1) throw new Error(`${k.title} ${dataMonth} 파일이 ${hit.length}개라 고를 수 없다`);
  return hit[0] || null;
}

/* 받아 둘 파일 이름 */
function zipName(kind, dataMonth, layout) {
  if (layout === 'history') {
    if (kind !== 'basic') throw new Error('history 배치는 기본개요(basic)만 쓴다');
    return `basic-${dataMonth}.zip`;
  }
  return `주택인허가_${KINDS[kind].file}_${dataMonth}.zip`;
}

/* 첫 줄의 '|' 수 + 1 = 열 수 */
function countPipes(firstLine) {
  return firstLine.split('|').length;
}

const nextMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };

/* ---------- 네트워크 ---------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.error(...a);

class Session {
  constructor() { this.cookies = new Map(); this.csrf = null; this.last = 0; }
  cookieHeader() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '); }
  async request(pathname, opts = {}) {
    let err;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const gap = this.last + WAIT_MS - Date.now();
      if (gap > 0) await sleep(gap);
      try {
        const res = await fetch(BASE + pathname, {
          ...opts,
          headers: { 'User-Agent': UA, Cookie: this.cookieHeader(), ...(opts.headers || {}) },
        });
        this.last = Date.now();
        for (const c of res.headers.getSetCookie?.() || []) {
          const [kv] = c.split(';'); const i = kv.indexOf('=');
          if (i > 0) this.cookies.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
        }
        if (!res.ok) throw new Error(`HTTP ${res.status} ${pathname}`);
        return res;
      } catch (e) { err = e; this.last = Date.now(); log(`요청 실패(${attempt + 1}/3): ${e.message}`); }
    }
    throw err;
  }
  async open() {
    const res = await this.request(LIST_PATH);
    this.csrf = parseCsrf(await res.text());
    if (!this.csrf) throw new Error('목록 화면에서 _csrf 토큰을 찾지 못했다(사이트가 바뀌었거나 사람 확인 화면일 수 있다)');
  }
  async list({ srvcNm = '', start = '2020-01-01', end }) {
    const items = [];
    for (let page = 1; page <= 20; page += 1) {
      const body = new URLSearchParams({
        _csrf: this.csrf, pageIndex: String(page), opnLgcptTaskSeCd: '02', srvcNm, startDay: start, endDay: end, pageCountPerPage: '40',
      });
      const res = await this.request(LIST_PATH, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      const html = await res.text();
      const csrf = parseCsrf(html); if (csrf) this.csrf = csrf;
      const p = parseListHtml(html);
      items.push(...p.items);
      if (!p.items.length || items.length >= p.total) break;
    }
    return items;
  }
  async download(item) {
    await this.request(LOG_PATH, {
      method: 'POST',
      body: new URLSearchParams({ opnLgcptTaskSeCd: item.group, opnTaskCd: item.task, opnPrcusePrpsCd: PURPOSE }),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRF-TOKEN': this.csrf, 'X-Requested-With': 'XMLHttpRequest' },
    });
    const res = await this.request(DOWN_PATH, {
      method: 'POST',
      body: new URLSearchParams({ srvrFileNm: item.fileId, _csrf: this.csrf }),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return Buffer.from(await res.arrayBuffer());
  }
}

const today = () => new Date().toISOString().slice(0, 10);

async function listAll(session) {
  const all = [];
  for (const kind of Object.keys(KINDS)) {
    const items = await session.list({ srvcNm: KINDS[kind].title, end: today() });
    all.push(...items.filter((i) => i.group === '02' && i.task === KINDS[kind].task && i.name === KINDS[kind].title).map((i) => ({ ...i, kind })));
  }
  return all;
}

/* zip 안의 첫 파일: 이름·바이트·행 수·첫 줄 열 수 */
function inspectZip(zipPath) {
  const names = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }).split('\n').filter(Boolean);
  if (names.length !== 1) throw new Error(`zip 안 파일이 ${names.length}개: ${names.join(', ')}`);
  return new Promise((resolve, reject) => {
    const p = spawn('unzip', ['-p', zipPath, names[0]]);
    let bytes = 0, lines = 0, first = '', done = false, last = 0;
    p.stdout.on('data', (b) => {
      bytes += b.length;
      if (!done) { first += b.toString('utf8'); const i = first.indexOf('\n'); if (i >= 0) { first = first.slice(0, i); done = true; } }
      for (let i = 0; i < b.length; i += 1) if (b[i] === 10) lines += 1;
      last = b[b.length - 1];
    });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error(`unzip 종료 코드 ${code}`));
      resolve({ member: names[0], member_bytes: bytes, rows: last === 10 || !bytes ? lines : lines + 1, cols: countPipes(first.replace(/\r$/, '')) });
    });
  });
}

/* ---------- 실행 ---------- */

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; }

async function main() {
  const session = new Session();
  await session.open();
  if (process.argv.includes('--list')) {
    const all = await listAll(session);
    const months = [...new Set(all.map((i) => i.dataMonth))].sort().reverse();
    for (const m of months) {
      const have = Object.keys(KINDS).filter((k) => all.some((i) => i.kind === k && i.dataMonth === m));
      const prov = all.find((i) => i.dataMonth === m).providedMonth;
      console.log(`${m}\t제공 ${prov}\t${have.join(',')}`);
    }
    return;
  }
  const dataMonth = arg('--data-month'), out = arg('--out');
  if (!/^\d{4}-\d{2}$/.test(dataMonth || '') || !out) throw new Error('사용: --data-month YYYY-MM --out <폴더> [--kinds basic,act,site] [--layout bulk|history]');
  const kinds = (arg('--kinds') || 'basic,act,site').split(',');
  const layout = arg('--layout') || 'bulk';
  for (const k of kinds) if (!KINDS[k]) throw new Error(`알 수 없는 종류: ${k}`);
  fs.mkdirSync(out, { recursive: true });
  const files = {};
  for (const kind of kinds) {
    const k = KINDS[kind];
    const items = await session.list({ srvcNm: k.title, start: `${nextMonth(dataMonth)}-01`, end: today() });
    const item = pickFile(items, kind, dataMonth);
    if (!item) throw new Error(`${k.title} ${dataMonth} 판이 목록에 없다(제공 예정 ${nextMonth(dataMonth)} 20일께)`);
    log(`${k.title} ${dataMonth} 내려받는 중 (${item.fileId})`);
    const buf = await session.download(item);
    if (buf.length < 4 || buf.readUInt32LE(0) !== 0x04034b50) throw new Error(`${k.title}: 응답이 zip 이 아니다(${buf.length} 바이트, 로그인·확인 화면일 수 있다)`);
    const zip = zipName(kind, dataMonth, layout);
    const target = path.join(out, zip);
    fs.writeFileSync(target, buf);
    const info = await inspectZip(target);
    if (info.member !== k.member) log(`주의: 안의 파일 이름이 ${info.member} (기대 ${k.member})`);
    if (info.cols !== k.cols) log(`주의: 열 수가 ${info.cols} (기대 ${k.cols})`);
    files[kind] = {
      service: `${k.title} (${dataMonth.slice(0, 4)}년 ${dataMonth.slice(5)}월, 데이터제공년월 ${item.providedMonth})`,
      opnTaskCd: k.task, zip, zip_bytes: buf.length, zip_sha256: crypto.createHash('sha256').update(buf).digest('hex'),
      member: info.member, member_bytes: info.member_bytes, format: `UTF-8, 구분자 '|', 머리글 없음, 열 수 ${info.cols}`, rows: info.rows,
      fetched_at: new Date().toISOString(),
    };
    log(`  ${zip} ${buf.length} 바이트 sha256 ${files[kind].zip_sha256.slice(0, 12)}… ${info.member} ${info.rows}행 ${info.cols}열`);
  }
  console.log(JSON.stringify({ data_month: dataMonth, files }, null, 1));
}

module.exports = { KINDS, parseCsrf, parseListHtml, pickFile, zipName, countPipes, nextMonth };

if (require.main === module) {
  main().catch((e) => { console.error(`오류: ${e.message}`); process.exit(1); });
}
