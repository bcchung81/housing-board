'use strict';
/* /citizen 아래 줄 사업 카드 한 장(2026-10-18 사용자 지시 '사업 일정 카드는 제거하고, 사업 카드의 메타데이터를 확대해서 1개의 카드로'):
   시안 빌드 결과(docs/design/대국민-모드-시안.html)의 첫 스크립트에서 순수 함수(prjMarks·nextStep·prjJudge)를 떼어 시험하고,
   표 줄 마크업(pjRow)은 원본(template.html)의 그 구간만 떼어 실제 원장 자료로 그려 본다. 화면 사진은 찍지 않는다.
   ① 고비 고르기 우선순위(det 실제 > det 예정 > 원장 next, 지난 예정은 빼고 다음 후보) · 다음 일정(첫 예정, 없으면 마지막 실제 '완료')
   ② 상태 칩 = 원장 cls/overdue/issued(정책 화면 statusOf) ③ 강서구(11500) 표의 다음 일정·들어올 때·상태·시행 열 = 원장·사업 카드 자료
   ④ 날짜 없는 사업 = '미정'·'연도 미정'·'일정 미정' ⑤ 시도 보기 이름 앞 시군구 ⑥ 화면 연결(한 장 배치·접기·가리킴·옛 카드 없음) ⑦ 덧붙임(ex): 유형 칩·법정동·공정률 막대·공고 물량·다른 기관 예정일 = 원천 값 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const TPL = fs.readFileSync(path.join(ROOT, 'tools', 'design', 'public-mock', 'template.html'), 'utf8');
const BUILT = fs.readFileSync(path.join(ROOT, 'docs', 'design', '대국민-모드-시안.html'), 'utf8');
const code = [...BUILT.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((c) => c.includes('function makeSearch'));
const ctx = {}; vm.createContext(ctx);
vm.runInContext(code + '\nObject.assign(this, { D, makeSearch, prjMarks, nextStep, prjJudge, OF_STAGE, distinctNames, shortName, fullDate, inLabel });', ctx);
const D = ctx.D, IX = ctx.makeSearch(D);
const plain = (v) => JSON.parse(JSON.stringify(v));
const TODAY = '2026-10-18';
const fnBody = (name) => { const i = TPL.indexOf(`function ${name}(`); assert.ok(i >= 0, name); return TPL.slice(i, TPL.indexOf('\n}\n', i)); };
const CSS = TPL.slice(TPL.indexOf('<style>'), TPL.indexOf('</style>'));
const LM = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'board', 'ledger-map.json'), 'utf8'));
const PD = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'board', 'project-detail.json'), 'utf8')).projects;

/* 원본의 표 줄 구간(stepDate ~ pjRow)을 실제 자료·색인으로 돌린다. 화면 전용 도우미(planMark·PRJA·esc·fmt·mapBtn)는 원본과 같은 모양의 작은 대역 */
const NEXT = ['모집 공고', '착공', '준공', '입주'];
const STATUS = [['준비 중', 'prep', ''], ['짓는 중', '', 'build'], ['모집 끝남', '', 'sale'], ['준공', '', 'soon']];
const stOf = (b) => (b <= 1 ? 0 : b - 1);
const unitKey = (c) => (c.startsWith('41') ? c.slice(0, 4) + '0' : IX.regionOf[c]?.parent || c);
const nameIn = (r) => (r.kind === 'sido' ? r.label : r.sub.slice(r.sub.indexOf(' ') + 1));
const prjOf = (id) => { const m = /^PRJ-(\d+)-(\w+)$/.exec(id); const p = m && (D.prj[m[1]] || []).find((q) => q[0] === m[2]); return p ? { c: m[1], p } : null; };
const block = TPL.slice(TPL.indexOf('const stepDate = '), TPL.indexOf('const yrHead = '));
const pjRow = new Function('D', 'TODAY', 'NEXT', 'STATUS', 'stOf', 'fmt', 'esc', 'PRJA', 'areaOf', 'unitKey', 'nameIn', 'shortName', 'fullDate', 'NSUB', 'prjOf', 'prjMarks', 'nextStep', 'prjJudge', 'planMark', 'CAPITAL', 'mapBtn', 'mapHref',
  block + '\nreturn pjRow;')(D, TODAY, NEXT, STATUS, stOf, (n) => n.toLocaleString('ko-KR'), (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
  (id) => `href="#prj-${id}" data-prj="${id}" aria-haspopup="dialog"`, (c) => IX.regionOf[c], unitKey, nameIn, ctx.shortName, ctx.fullDate, () => '', prjOf, ctx.prjMarks, ctx.nextStep, ctx.prjJudge,
  () => '', ['11', '28', '41'], () => '<a class="mapi"></a>', () => '');
const rowOf = (c, p) => ({ id: `PRJ-${c}-${p[0]}`, sgg: c, name: p[1] || '', b: ctx.OF_STAGE[p[2]], u: p[3], k: p[4], il: ctx.inLabel(D, c, p) });
const cells = (h) => { const g = (cls) => (h.match(new RegExp(`<span class="${cls}(?: tbd)?"[^>]*>([\\s\\S]*?)</span>`)) || [])[1]; return { nm: g('nm'), u: g('u'), nx: (h.match(/<span class="pj-nx[^"]*">([^<]*)<\/span>/) || [])[1], when: g('when'), jd: (h.match(/<span class="ui-chip (\w+)">([^<]+)<\/span>/) || []).slice(1).join(':'), ag: (h.match(/<span class="pj-ag(?: tbd)?">([^<]*)<\/span>/) || [])[1] }; };
const big = (codes) => codes.flatMap((c) => (D.prj[c] || []).filter((p) => ctx.OF_STAGE[p[2]] <= 3).map((p) => [c, p])).sort((a, b) => b[1][3] - a[1][3]);

test('① 고비 고르기: 같은 고비는 det 실제 > det 예정 > 원장 next · 지난 예정은 빼고 다음 후보 · 다음 일정 = 첫 예정, 없으면 마지막 실제', () => {
  const F = { det: {
    'PRJ-9-01': ['', [['2025-03-02', 1], ['2027-05', 0], null, ['2030', 0]]],
    'PRJ-9-02': ['', [['2026-02', 0], ['2026-09', 0], null, null]],
    'PRJ-9-03': ['', [['2024-01', 1], ['2025', 1], null, null]] } };
  const m = (id, p) => plain(ctx.prjMarks(F, '9', [id, 'x', 2, 10, ...p], TODAY));
  assert.deepEqual(m('01', [1, '2028']), [{ k: 0, d: '2025-03-02', real: true }, { k: 1, d: '2027-05', real: false }, { k: 3, d: '2030', real: false }], 'det 예정이 next 보다 앞');
  assert.deepEqual(m('02', [1, '2027-11']), [{ k: 1, d: '2027-11', real: false }], '지난 det 예정 대신 next, 다른 지난 예정은 뺌');
  assert.deepEqual(m('02', [-1, '']), [], '지난 예정만 있으면 고비 없음');
  assert.deepEqual(m('03', [1, '2028']), [{ k: 0, d: '2024-01', real: true }, { k: 1, d: '2025', real: true }], 'det 실제가 next 보다 앞');
  assert.deepEqual(m('04', [0, '2026-10']), [{ k: 0, d: '2026-10', real: false }], '이번 달 예정은 아직 지나지 않음');
  assert.deepEqual(m('04', [0, '2026-10-17']), [], '어제 날짜 예정은 지남');
  assert.deepEqual(plain(ctx.nextStep(ctx.prjMarks(F, '9', ['01', 'x', 2, 10, 1, '2028'], TODAY))), { k: 1, d: '2027-05', real: false }, '첫 예정');
  assert.deepEqual(plain(ctx.nextStep(ctx.prjMarks(F, '9', ['03', 'x', 2, 10, -1, ''], TODAY))), { k: 1, d: '2025', real: true }, '예정이 없으면 마지막 실제');
  assert.equal(ctx.nextStep([]), null);
});

test('② 상태 칩 = 원장 판정(cls·overdue·issued, 정책 화면 statusOf): 정상 → 빈칸 · 주의/지연 → 준공 예정일이 n개월 지났어요(2026-10-19 안 A) · 판정 없음·후보 → 일정 미정 — 전국 모든 사업', () => {
  let n = 0, late = 0;
  for (const [c, L] of Object.entries(LM.bySgg)) for (const p of L) {
    const row = (D.prj[c] || []).find((q) => `PRJ-${c}-${q[0]}` === p.id); assert.ok(row, p.id);
    const s = ctx.prjJudge(D, c, row), want = !p.issued || !p.cls ? ['none', '일정 미정'] : p.cls === 'ok' ? ['ok', ''] : [p.cls, `${{ SUPPLY_NOTICE: '모집 공고', CONSTRUCTION_START: '착공', COMPLETION: '준공', MOVE_IN: '입주', PERMIT: '허가' }[p.overdue.eventType]} 예정일이 ${p.overdue.months}개월 지났어요`];
    assert.deepEqual([s.k, s.t], want, p.id); n++; if (s.m) late++;
  }
  assert.ok(late >= 4, '늦어짐 사업이 있다');
  console.log(`  판정 ${n}건 같음 · 늦어짐 ${late}건`);
});

test('③ 강서구(11500) 표: 호수 큰 순 · 다음 일정 · 들어올 때 · 상태 · 시행 열이 원장·사업 카드 자료와 같다', () => {
  const rows = big(IX.regionOf['11500'].codes).map(([c, p]) => cells(pjRow(rowOf(c, p), false, {})));
  assert.deepEqual(plain(rows.map((r) => [r.nm, r.u, r.nx, r.when, r.jd, r.ag])), [
    ['가양 노후 임대 재건축', '3,235호', '착공 2029 예정', '입주 2032년', '', 'LH'],
    ['화곡역 동측', '2,335호', '착공 2030 예정', '연도 미정', '', '미정'],
    ['강서 군부대 터', '918호', '미정', '연도 미정', 'none:일정 미정', '미정'],
    ['강서구 이전부지', '558호', '미정', '연도 미정', 'none:일정 미정', '미정'],
    ['마곡지구 17단지', '381호', '미정', '연도 미정', 'none:일정 미정', 'SH'],   // 모집 공고 예정 2026-02 는 지난 계획이라 쓰지 않는다
    ['SBA 글로벌마케팅센터', '116호', '착공 2029.10 예정', '연도 미정', '', '미정'],
    ['강서염창(가로주택) 01', '14호', '입주 2027.02 예정', '입주 2027년 2월', 'none:일정 미정', 'LH'],   // 모집 공고 예정 2026-09 는 지남
    ['강서 국회대로 인근', '미정', '미정', '연도 미정', 'none:일정 미정', '미정'],   // 빈 값은 옅은 '미정' 하나(.tbd)
  ]);
  /* 원장·사업 카드 자료와 대조: 상태 = ledger-map cls · 시행 = project-detail agency */
  const AG = { lh: 'LH', gh: 'GH', sh: 'SH', local: '지자체', mnd: '국방부' };
  for (const [c, p] of big(IX.regionOf['11500'].codes)) {
    const id = `PRJ-${c}-${p[0]}`, l = LM.bySgg[c].find((x) => x.id === id), r = cells(pjRow(rowOf(c, p), false, {}));
    if (!l.issued || !l.cls) assert.match(r.jd, /^none:/, id); else if (l.cls === 'ok') assert.equal(r.jd, '', id); else assert.match(r.jd, /^(caution|delay):/, id);
    assert.equal(r.ag, AG[PD[id]?.agency] || '미정', id);
  }
  const h = pjRow(rowOf('11500', D.prj['11500'][0]), false, {});
  assert.match(h, /^<li><a class="ev" href="#prj-PRJ-11500-0100" data-prj="PRJ-11500-0100" aria-haspopup="dialog" data-unit="11500" title="가양 노후 임대 재건축 · 3,235호 · 준비 중 · 다음 일정 착공 2029년 예정 · 입주 2032년 · 시행 LH · 노후 공공임대 재건축" aria-label="/, '읽기 이름·title 에 모든 열(좁은 칸에서 접힌 들어올 때·시행 포함)');
  assert.match(h, /<\/a><a class="mapi"><\/a><\/li>$/, '줄 끝 큰 지도 단추 유지');
  assert.doesNotMatch(h, /[○●◆◇■□▲△›‹]/u, '글자 기호 없음');
});

test('④ 날짜가 하나도 없는 사업: 다음 일정 미정(보조 글 색) · 들어올 때 = inLabel(연도 미정) · 상태 일정 미정 — 수도권 전부', () => {
  let n = 0;
  for (const [c, rows] of Object.entries(D.prj)) {
    if (!['11', '28', '41'].includes(c.slice(0, 2))) continue;
    for (const p of rows) {
      if (ctx.OF_STAGE[p[2]] > 3 || ctx.prjMarks(D, c, p, TODAY).length) continue;
      const h = pjRow(rowOf(c, p), false, {}), r = cells(h);
      assert.equal(r.nx, '미정'); assert.match(h, /<span class="pj-nx tbd">미정<\/span>/);
      assert.equal(r.when, ctx.inLabel(D, c, p));
      if (!D.jd?.[c]?.[p[0]]) assert.equal(r.jd, 'none:일정 미정');
      n++;
    }
  }
  assert.ok(n > 50, `${n}`);
  console.log(`  날짜 없는 사업 ${n}건`);
});

test('⑤ 시도를 볼 때: 시군구는 이름 뒤 보조 글(서울 보기 → 이름 "가양 노후 임대 재건축" + 보조 "강서구 …") · 같은 이름은 distinctNames 로 가른다', () => {
  const r1 = pjRow(rowOf('11500', D.prj['11500'][0]), true, {});
  assert.equal(cells(r1).nm, '가양 노후 임대 재건축'); assert.match(sub(r1, /<span class="pj-dg">([^<]*)<\/span>/), /^강서구( |$)/);
  const gc = Object.keys(D.prj).find((c) => c.startsWith('4128') && D.prj[c].length);
  const r2 = pjRow(rowOf(gc, D.prj[gc][0]), true, {});
  assert.doesNotMatch(cells(r2).nm, /^고양시/); assert.match(sub(r2, /<span class="pj-dg">([^<]*)<\/span>/), /^고양시( |$)/, '경기 구가 있는 시는 시 이름');
  assert.match(fnBody('renderCells'), /big\.map\(\(x\) => pjRow\(x, isS, nm\)\)/); assert.match(fnBody('renderCells'), /const nm = distinctNames\(big, D\);/);
});

test('⑥ 화면 연결: 아래 줄 = 사업 카드 한 장(전체 폭) · 열 머리 · 칸 높이에 맞게 접기(fitPj) · 넘치면 전체 n 시트 · 줄 가리킴 = 사업 점·면 강조 · 옛 사업 일정 카드 없음', () => {
  assert.ok(!TPL.includes('id="c-yr"') && TPL.includes('<section class="ui-card cell" id="c-pj" aria-labelledby="c-pj-h"></section>'));
  assert.match(CSS, /\.bot-row \{ display: grid; grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(CSS, /\.pub \{ grid-template-rows: auto clamp\(460px, calc\(100vh - 152px\), 760px\) 268px auto; \}/, '아래 줄 고정 높이 그대로(레이아웃 이동 0)');
  assert.match(CSS, /\.cell \.pjs \{ flex: 1 1 auto; min-height: 0; overflow: hidden;/);
  const rc = fnBody('renderCells');
  assert.match(rc, /\.slice\(0, PJ_MAX\)/); assert.match(rc, /findBtn\(prj\.length, r, f\)/); assert.match(TPL, /href="\$\{findHref\(r, f\)\}"/);   // 2026-10-19 '전체 n ›' = 사업 찾기로 이동(옆 시트 아님) assert.match(rc, /popovertarget="tip-pj"/); assert.match(rc, /fitPj\(\);/);
  assert.match(TPL, /<div class="tip" id="tip-pj" popover><b>사업<\/b>/);
  const fp = fnBody('fitPj');
  assert.match(fp, /Math\.floor\(\(box\.clientHeight \+ 1\) \/ h\)/); assert.match(fp, /\(max-width: 599px\)'\)\.matches \? 3 : 5/);
  assert.match(TPL, /fitLegend\(\); fitPj\(\);/, '크기가 바뀌면 다시 접는다');
  assert.match(fnBody('hlRow'), /a\.classList\.toggle\('on', !!id && a\.dataset\.prj === id\)/); assert.match(fnBody('hlRow'), /hlUnit\(row \? row\.dataset\.unit/);
  assert.ok(TPL.includes("document.addEventListener('mouseover', (e) => { const r = e.target.closest?.('#c-pj .ev'); if (r) hlRow(r); });"));
  assert.match(TPL, /\.pts \.pt:hover \.pt-hit, \.pts \.pt:focus-visible \.pt-hit, \.pts \.pt\.on \.pt-hit \{/);
  for (const f of ['renderTl', 'tlHtml', 'fitTl', 'paintYears', 'yrsChart', 'yearsOf', 'paintYearChart', 'withYearGlide']) assert.ok(!new RegExp(`\\b${f}\\b`).test(TPL), f);
  assert.ok(!TPL.includes('#c-yr') && !TPL.includes('tip-when') && !TPL.includes('class="hh"'));
  assert.match(TPL, /<p id="tip-head-hh"><\/p><\/div>/, '가구 증가 줄은 제목 ⓘ 안');
  const bd = fs.readFileSync(path.join(ROOT, 'tools', 'design', 'public-mock', 'build_data.py'), 'utf8');
  assert.match(bd, /JD = \{'ok': 0, 'caution': 1, 'delay': 2\}/); assert.match(bd, /'jd': jd/);
});

/* ⑦ 덧붙임(D.ex·D.pg): 원천(project-detail progress · projects-index programs · home-map bjd·noticeUnits·dateAlt · areas BJD 이름)을 시험에서 따로 읽어 줄 마크업과 대조한다 */
const PI = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'board', 'projects-index.json'), 'utf8'));
const BJD = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas', 'ledger-2026-10', 'tables', 'areas.json'), 'utf8')).rows.filter((r) => r.level === 'BJD').map((r) => [r.area_code, r.area_name.split(' ').pop()]));
const HM = {};
for (const f of fs.readdirSync(path.join(ROOT, 'data', 'board', 'home-map'))) for (const q of JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'board', 'home-map', f), 'utf8')).projects) HM[q.id] = q;
const SHORT = { '공공주택 건설': '공공주택 건설', '도심 공공주택 복합사업': '도심 복합사업', '노후청사·공공부지': '노후청사·공공부지', '공공택지·공공분양': '공공택지 분양', '3기 신도시': '3기 신도시', '건설형 공공임대': '공공임대 건설', '노후 공공임대 재건축': '노후 임대 재건축',
  '공공시설·유휴부지 개발': '공공시설·유휴부지 개발', '군 유휴부지': '군 유휴부지', '도심 내 유휴부지 활용 공급': '도심 유휴부지 활용', '철도부지 복합개발': '철도부지 복합개발', '공공시설 이전': '공공시설 이전', '서울 남부권 공공택지 공급 조기화': '남부권 공공택지 공급',
  '신규 공공주택지구': '신규 주택지구', '우수입지 공공택지 분양': '우수입지 택지 분양', '유휴부지·노후청사 복합개발': '유휴·청사 복합개발', '공공택지 공급 조기화': '공공택지 공급' };
const rowById = (id) => { const [, c, n] = /^PRJ-(\d+)-(\w+)$/.exec(id); return pjRow(rowOf(c, D.prj[c].find((q) => q[0] === n)), false, {}); };
const sub = (h, re) => (h.match(re) || [])[1];
const monthsBefore = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCMonth(t.getUTCMonth() - n); return t.toISOString().slice(0, 10); };

test('⑦-1 공정률: 최근 값 · 3개월 전(그날 이전 마지막 값) 차이 = project-detail progress — 자료 있는 사업 전부, 없는 사업은 빈칸', () => {
  let n = 0, withDiff = 0;
  for (const [id, x] of Object.entries(PD)) {
    const m = /^PRJ-(\d+)-(\w+)$/.exec(id); if (!x.progress?.length || !D.prj[m[1]]?.find((q) => q[0] === m[2])) continue;
    const sr = x.progress, last = sr[sr.length - 1], old = sr.filter((r) => r[0] <= monthsBefore(last[0], 3)).pop();
    const h = rowById(id), t = sub(h, /<span class="pj-sn" title="([^"]*)"/);
    const d = old ? Math.round(last[1] - old[1]) : null;
    assert.equal(t, `공정률 ${Math.round(last[1])}% (${last[0].slice(0, 7).replace('-', '.')} 기준${d != null ? `, 3개월 전보다 ${d > 0 ? '+' : ''}${d}%p` : ''})`, id);
    assert.match(h, new RegExp(`<span class="pj-sn" title="[^"]*"><b>[^<]+</b> · 공사 ${Math.round(last[1])}%</span>`), '진행 띠 옆 단계 이름 · 공사 n%');
    { const band = sub(h, /<span class="pj-band" aria-hidden="true">(.*?)<\/span>/); assert.equal((band.match(/<i/g) || []).length, 6, '띠 6칸'); assert.ok(/class="on"/.test(band) && !/[■□●]/.test(h), '채운 칸 있음 · 글자 기호 없음'); }
    n++; if (old) withDiff++;
  }
  assert.ok(n === 108 && withDiff >= 50, `${n}/${withDiff}`);
  const none = Object.keys(HM).find((id) => !PD[id]?.progress?.length && D.prj[id.split('-')[1]]?.some((q) => q[0] === id.split('-')[2]));
  assert.doesNotMatch(rowById(none), /공사 \d+%/, '공정률 자료가 없으면 공사 % 없음');
  console.log(`  공정률 ${n}건(3개월 차이 ${withDiff}건) 같음`);
});

test('⑦-2 사업 유형: 칩 = 짧은 이름, title = 원래 이름(projects-index programs 첫 값) · 법정동 = areas BJD 이름 · 공고 물량 · 다른 기관 예정일 = home-map', () => {
  let ty = 0, dg = 0, nt = 0, alt = 0;
  for (const [c, rows] of Object.entries(D.prj)) for (const q of rows) {
    const id = `PRJ-${c}-${q[0]}`, h = rowById(id), pr = (PI.projects[id]?.programs || [])[0], hm = HM[id] || {};
    const chip = h.match(/<span class="ui-chip pj-ty" title="([^"]*)">([^<]*)<\/span>/);
    if (pr) { assert.equal(chip?.[1], pr, id); assert.ok(chip[2].length >= 2 && chip[2].length <= 13, `${id} ${chip[2]}`); assert.equal(chip[2], SHORT[pr], id); ty++; } else assert.equal(chip, null, id);
    const d = hm.bjd && BJD[hm.bjd]; assert.equal(sub(h, /<span class="pj-dg">([^<]*)<\/span>/), d || undefined, id); if (d) dg++;
    assert.equal(sub(h, /<span class="pj-nt">([^<]*)<\/span>/), hm.noticeUnits ? `공고 ${hm.noticeUnits.toLocaleString('ko-KR')}호` : undefined, id); if (hm.noticeUnits) nt++;
    const a = hm.dateAlt?.planned ? `${hm.dateAlt.source} 예정 ${hm.dateAlt.planned.slice(0, 7).replace('-', '.')}` : undefined;
    assert.equal(sub(h, /<span class="pj-nx[^"]*" title="([^"]*)"/), a, id); if (a) alt++;
    if (!pr && !d && !hm.noticeUnits && !a && !PD[id]?.progress?.length) assert.doesNotMatch(h, /pj-ty|pj-dg|pj-nt|공사 \d+%|<span class="pj-nx[^"]*" title/, `${id} 자료 없으면 빈칸`);
  }
  assert.ok(ty === 239 || ty > 200, `유형 ${ty}`); assert.ok(dg > 100 && nt >= 30 && alt >= 60, `${dg}/${nt}/${alt}`);
  assert.equal(rowById('PRJ-11500-0106').match(/<span class="pj-dg">([^<]*)</)?.[1], BJD['1150010500']);
  console.log(`  유형 ${ty} · 법정동 ${dg} · 공고 ${nt} · 다른 기관 예정일 ${alt} 같음`);
});

test('⑦-2b 이름 칸: .nm 은 사업명만 · 시도 보기의 시군구는 보조 글(.pj-dg)로 · title 순서 사업명 → 시군구 동 · 유형 17종 전부 화면 이름 대응', () => {
  assert.equal(Object.keys(SHORT).length, 17); assert.equal(new Set(Object.values(SHORT)).size, 17);
  assert.deepEqual([...PI.programs.map((x) => x.name)].sort(), Object.keys(SHORT).sort(), 'projects-index 프로그램 17종 = 화면 이름 표');
  let n = 0;
  for (const [c, rows] of Object.entries(D.prj)) for (const q of rows.slice(0, 3)) {
    const id = `PRJ-${c}-${q[0]}`, x = rowOf(c, q), h = pjRow(x, true, {}), nm = sub(h, /<span class="nm">([^<]*)(?:<|$)/);
    
    const dg = sub(h, /<span class="pj-dg">([^<]*)<\/span>/), t = sub(h, /^<li><a[^>]* title="([^"]*)"/);
    assert.ok(dg && /구|시|군/.test(dg.split(' ')[0]), `${id} 보조 글에 시군구: ${dg}`);
    assert.ok(nm && !nm.startsWith(dg.split(' ')[0] + ' · '), `${id} .nm 에 시군구 접두 없음: ${nm}`);
    assert.ok(t.replace(/&amp;/g, '&').startsWith(`${x.name || '이름 미정'} · ${dg}`), `${id} title 순서: ${t}`); n++;
  }
  assert.ok(n > 20, String(n));
});

test('⑦-3 화면 규칙: 새 열 없음(grid 열 7개 그대로) · 좁은 폭은 법정동 숨김 · 색은 토큰 · data.json 의 ex 는 전체 시계열 없이 최근 값만', () => {
  assert.match(CSS, /--pj-cols: minmax\(0, 1\.3fr\) 72px minmax\(224px, 1fr\) minmax\(144px, \.7fr\) minmax\(108px, \.5fr\) minmax\(108px, \.5fr\) 44px 44px;/); assert.match(CSS, /grid-template-areas: 'nm u st nx when jd ag'/);
  assert.match(CSS, /#c-pj \.pjs \.ev \.pj-dg \{ display: none; \}/);
  assert.match(CSS, /\.pj-ty, \.pj-nt, \.pj-dg \{ flex: none; white-space: nowrap; \}/); assert.match(CSS, /\.pjs \.ev \.nmw \{[^}]*flex-wrap: wrap;[^}]*overflow: hidden; \}/);   // 덧붙임은 줄지 않고 남는 자리에만(모자라면 보이지 않는 둘째 줄), 말줄임은 이름에만
  assert.match(CSS, /\.pjs \.ev \.nmw \.nm \{ flex: 0 1 auto; min-width: min\(100%, 8em\); max-width: 100%;/);   // 사업명은 늘 보인다: 최소 폭 보장 · 보조(.pj-ty/.pj-nt/.pj-dg)는 flex: none 이라 먼저 둘째 줄로 밀린다
  for (const v of Object.values(D.ex)) { if (v[4]) { assert.equal(v[4].length, 3); assert.match(v[4][0], /^\d{4}-\d{2}$/); } }
});
