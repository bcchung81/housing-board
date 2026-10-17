// template.html + search.js + data.json → 두 벌
//   (1) docs/design/대국민-모드-시안.html — 데모판(시안 상태 막대·흉내 추천·흉내 현 위치·이동 주소 출력)
//   (2) assets/citizen/index.html        — 운영판(/citizen): 실제 이동·IP 추천(/api/v1/geo)·현 위치(브라우저 안 판정)·주소 검색(/api/v1/codes/search). ?demo=1 이면 상태 막대
const fs = require('fs'), path = require('path');
const SP = __dirname, ROOT = path.join(__dirname, '..', '..', '..');
const OUT = { demo: path.join(ROOT, 'docs', 'design', '대국민-모드-시안.html'), ops: path.join(ROOT, 'assets', 'citizen', 'index.html') };
const D = JSON.parse(fs.readFileSync(path.join(SP, 'data.json'), 'utf8'));
const dot = (s) => s.replace(/-/g, '.');
const tpl = fs.readFileSync(path.join(SP, 'template.html'), 'utf8');
const search = fs.readFileSync(path.join(SP, 'search.js'), 'utf8').replace(/\nif \(typeof module[^\n]*\n?/, '\n');
const LOGO = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='4 4 64 60'><path fill='%2323466D' d='M8 28 27 12Q36 4 45 12L64 28 57 36 39 21Q36 18 33 21L15 36Z'/><path fill='%23D65535' d='M8 43C18 33 27 32 38 40C48 48 54 45 64 35V48C54 58 45 60 34 51C25 44 18 43 8 54Z'/></svg>`;
for (const mode of ['demo', 'ops']) {
  let h = tpl;
  const rep = {
    '/*__SEARCH__*/': search.trim(),
    '/*__DATA__*/': JSON.stringify(D).replace(/</g, '\\u003c'),
    '/*__MODE__*/': mode,
    '/*LEDGER_DOT*/': dot(D.meta.ledgerRef), '/*LEDGER_REF*/': dot(D.meta.ledgerRef),
    '/*CAL_RANGE*/': `${dot(D.meta.calFrom)}~${dot(D.meta.calTo)}`, '/*CAL_REF*/': dot(D.meta.calRef), '/*TODAY*/': dot(D.meta.today),
  };
  for (const [k, v] of Object.entries(rep)) { if (!h.includes(k)) throw new Error('missing ' + k); h = h.split(k).join(v); }
  if (mode === 'ops') {
    /* 운영판: 제목·설명·og·파비콘(로고 그림), 글꼴은 앱 자산 절대 경로 */
    h = h.replace(/<title>[^<]*<\/title>/, `<title>주택파동 — 내 동네 공공 주택 공급</title>
<meta name="description" content="내 동네에 앞으로 들어올 공공 주택이 얼마나, 언제 들어오는지 한 화면에서 봅니다. 모집 공고·착공·준공 일정과 시군구별 지도를 함께 보여 줍니다.">
<meta property="og:type" content="website"><meta property="og:title" content="주택파동 — 내 동네 공공 주택 공급"><meta property="og:description" content="내 동네에 앞으로 들어올 공공 주택과 다가오는 모집 공고·준공 일정"><meta property="og:locale" content="ko_KR">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${LOGO.replace(/"/g, "'")}">`);
    h = h.split("url('../../assets/fonts/").join("url('/assets/fonts/");
    if (h.includes('../../assets/')) throw new Error('relative asset path left in ops build');
  }
  fs.mkdirSync(path.dirname(OUT[mode]), { recursive: true });
  fs.writeFileSync(OUT[mode], h);
  console.log(mode, OUT[mode], fs.statSync(OUT[mode]).size);
}
