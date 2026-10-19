'use strict';
/* 일반사용자 사업 찾기(/citizen/projects, 2026-10-19): lib/board/public-labels.ts 가 /citizen 템플릿(tools/design/public-mock/template.html)의
   inLabel·inYear·prjMarks·nextStep·prjJudge·shortName·distinctNames 와 같은 입력에 같은 결과인지 실제 원장 전체로 잠그고,
   목록 합계 = /citizen 공급 예정 호수 = 정책 화면 같은 범위, 수도권만, 쉬운 말(금지어·단위 '호')·12px 없음·하드코딩 없음을 본다. 제안서 scratchpad/public-menus/proposal.md 4·6·8.2절.
   지연 문구(안 A, 2026-10-19 사용자 결정)는 템플릿 prjJudge 와 완전히 같다 — 정상은 빈칸, 주의·지연은 '{고비} 예정일이 n개월 지났어요'(예외 없음). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const P = require('../../lib/board/public-labels.ts');
const V = require('../../lib/board/projects-view.ts');
const { guOf } = require('../../lib/board/metro-overview.ts');

/* ---------- 템플릿 함수 떼기(원본 그대로) ---------- */
const TPL = read('tools/design/public-mock/template.html');
const SEARCH = read('tools/design/public-mock/search.js');
function srcOf(text, name) {
  let i = text.indexOf(`function ${name}(`);
  if (i >= 0) return text.slice(i, text.indexOf('\n}\n', i) + 2);
  i = text.indexOf(`const ${name} = `);
  assert.ok(i >= 0, name);
  return text.slice(i, text.indexOf('\n', i));
}
const NAMES = ['PLACEHOLDER', 'shortName', 'noticeName', 'blockOf', 'fullDate', 'inDate', 'inYear', 'inLabel', 'dayKey', 'inCmp', 'periodEnd', 'prjMarks', 'nextStep', 'prjJudge', 'distinctNames', 'bigNum'];
const T = {};
vm.createContext(T);
vm.runInContext([srcOf(SEARCH, 'OF_STAGE'), ...NAMES.map((n) => srcOf(TPL, n)), `Object.assign(this, { OF_STAGE, ${NAMES.join(', ')} });`].join('\n'), T);
const plain = (v) => JSON.parse(JSON.stringify(v));

/* ---------- 템플릿 자료 D(build_data.py 의 prj·det·jd·sgg 규칙을 그대로 옮김) ---------- */
const LM = JSON.parse(read('data/board/ledger-map.json'));
const PD = JSON.parse(read('data/board/project-detail.json')).projects;
const IDX = JSON.parse(read('data/board/projects-index.json'));
const NEXTE = ['SUPPLY_NOTICE', 'CONSTRUCTION_START', 'COMPLETION', 'MOVE_IN'];
const AG = { lh: 'LH', gh: 'GH', sh: 'SH', local: '지자체', mnd: '국방부' };
const D = { prj: {}, det: {}, jd: {}, sgg: Object.entries(IDX.sgg).sort().map(([k, v]) => [k, v, 0]) };
for (const [c, L] of Object.entries(LM.bySgg)) {
  D.prj[c] = L.map((p) => [p.id.split('-')[2], p.name, Number(p.stage), p.units || 0, p.next ? NEXTE.indexOf(p.next.eventType) : -1, (p.next || {}).planned || '', ...(p.pnus && p.pnus.length ? [p.pnus] : [])]);
  const m = {}; for (const p of L) if (p.issued && ['ok', 'caution', 'delay'].includes(p.cls)) m[p.id.split('-')[2]] = [{ ok: 0, caution: 1, delay: 2 }[p.cls], (p.overdue || {}).months || 0, [...NEXTE, 'PERMIT'].indexOf((p.overdue || {}).eventType)];
  if (Object.keys(m).length) D.jd[c] = m;
}
for (const [id, x] of Object.entries(PD)) {
  const st = x.stages || {}, s = NEXTE.map((k) => (st[k]?.actual ? [st[k].actual, 1] : st[k]?.plan ? [st[k].plan, 0] : null));
  if (x.agency || s.some(Boolean)) D.det[id] = [AG[x.agency] || '', s];
}
const BUILT = path.join(ROOT, 'tools/design/public-mock/data.json');
const DJ = fs.existsSync(BUILT) ? JSON.parse(fs.readFileSync(BUILT, 'utf8')) : null;

const ALL = Object.entries(LM.bySgg).flatMap(([c, L]) => L.map((r) => ({ c, r, p: D.prj[c].find((q) => q[0] === r.id.split('-')[2]) })));
const METROS = ALL.filter((x) => P.METRO.includes(x.c.slice(0, 2)));
const stepsOfId = (id) => P.stepsOf(PD[id]?.stages);
const sggName = (c) => { const f = (D.sgg.find((r) => r[0] === c) || [])[1] || ''; return f.slice(f.indexOf(' ') + 1); };
const sggShort = (c) => { const n = IDX.sgg[c]; return n ? n.slice(n.indexOf(' ') + 1) : c; };

test('시험이 만든 템플릿 자료 D 는 빌드 결과(data.json)와 같다(있을 때) — 옮긴 규칙이 build_data.py 와 같다는 확인', { skip: !DJ && 'data.json 없음(빌드 생성물)' }, () => {
  for (const { c, p } of METROS) assert.deepEqual(DJ.prj[c].find((q) => q[0] === p[0]), p, `${c}-${p[0]}`);
  for (const { c, r } of METROS) { assert.deepEqual(DJ.det[r.id] ?? null, D.det[r.id] ?? null, r.id); assert.deepEqual(DJ.jd[c]?.[r.id.split('-')[2]] ?? null, D.jd[c]?.[r.id.split('-')[2]] ?? null, r.id); }
});

test('stepsOf·nxOf·AGENCY_SHORT·PG_SHORT = build_data.py 의 det·prj·AG·PG_SHORT', () => {
  for (const { r, p } of ALL) {
    assert.deepEqual(P.stepsOf(PD[r.id]?.stages), D.det[r.id]?.[1] ?? [null, null, null, null], r.id);
    assert.deepEqual(P.nxOf(r.next), { k: p[4], d: p[5] }, r.id);
  }
  const py = read('tools/design/public-mock/build_data.py');
  const dict = (name) => Object.fromEntries([...py.slice(py.indexOf(`${name} = {`), py.indexOf('}', py.indexOf(`${name} = {`))).matchAll(/'([^']+)': '([^']+)'/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(P.AGENCY_SHORT, dict('AG'));
  assert.deepEqual(P.PG_SHORT, dict('PG_SHORT'));
});

test('이름: shortName·noticeName·blockOf·fullDate·bigNum 이 템플릿과 같다(원장 이름 전체)', () => {
  const names = [...new Set(ALL.map((x) => x.r.name || ''))].concat(['', '  ', 'OO아파트 신축공사', '대장동 OO지구', '조달청)과천주암 C-1BL 공동주택 건설공사 1공구', '하남교산 A-4 주복 03']);
  for (const n of names) {
    assert.equal(P.shortName(n), T.shortName(n), n);
    assert.equal(P.noticeName(n), T.noticeName(n), n);
    assert.equal(P.blockOf(P.noticeName(n)), T.blockOf(T.noticeName(n)), n);
  }
  for (const w of ['', '2027', '2027-03', '2027-03-02', '2027-11-14T00:00']) assert.equal(P.fullDate(w), T.fullDate(w), w);
  for (const u of [0, 7417, 10000, 16388, 99896, 227976]) assert.equal(P.bigNum(u), T.bigNum(u));
  assert.equal(P.hoBig(227976), '22만 7,976호');
  assert.equal(P.hoBig(20000), '2만 호');
});

test('들어올 때·다음 일정: inDate·inYear·inLabel·prjMarks·nextStep 이 템플릿과 같다(원장 전체 × 오늘 셋)', () => {
  for (const { c, r, p } of ALL) {
    const s = stepsOfId(r.id), nx = P.nxOf(r.next);
    assert.equal(P.inDate(s, nx), T.inDate(D, c, p), r.id);
    assert.equal(P.inYear(s, nx), T.inYear(D, c, p), r.id);
    assert.equal(P.inLabel(s, nx), T.inLabel(D, c, p), r.id);
    for (const today of ['2026-10-13', '2026-10-19', '2027-06-30']) {
      const a = P.prjMarks(s, nx, today);
      assert.deepEqual(plain(a), plain(T.prjMarks(D, c, p, today)), `${r.id} ${today}`);
      assert.deepEqual(plain(P.nextStep(a)), plain(T.nextStep(T.prjMarks(D, c, p, today))), `${r.id} ${today}`);
    }
  }
});

test('목록 순서: inCmp(들어올 날 → 원장 다음 고비 → 호수)가 템플릿과 같은 차례를 낸다(수도권 전체)', () => {
  const xs = METROS.map(({ c, r, p }) => ({ id: r.id, d: P.inDate(stepsOfId(r.id), P.nxOf(r.next)), when: p[5], u: p[3], t: { d: T.inDate(D, c, p), when: p[5], u: p[3] } }));
  const mine = [...xs].sort(P.inCmp).map((x) => x.id), theirs = [...xs].sort((a, b) => T.inCmp(a.t, b.t)).map((x) => x.id);
  assert.deepEqual(mine, theirs);
});

test('같은 이름 구별: distinctNames 가 템플릿과 같다(시군구별·시도별·수도권 목록) — 보이는 이름과 sub', () => {
  const lists = [];
  const byKey = (k) => { const m = {}; for (const x of METROS) (m[k(x)] = m[k(x)] || []).push(x); return Object.values(m); };
  lists.push(...byKey((x) => x.c), ...byKey((x) => x.c.slice(0, 2)), METROS);
  for (const L of lists) {
    const items = L.filter(({ p }) => T.OF_STAGE[p[2]] <= 3).map(({ c, r, p }) => ({ id: r.id, name: p[1] || '', sgg: c, u: p[3], b: T.OF_STAGE[p[2]] }));
    const a = P.distinctNames(items, sggName), b = T.distinctNames(items, D);
    assert.deepEqual({ ...a }, { ...b });
    assert.deepEqual(plain(a.sub), plain(b.sub));
  }
  assert.equal(sggName('28245'), sggShort('28245'), '화면의 시군구 이름(sggShort)은 템플릿 D.sgg 이름과 같은 말');
});

test('예정 대비(안 A): prjJudge 는 템플릿과 글자까지 같다 — 정상 빈칸 · 주의/지연 \'{고비} 예정일이 n개월 지났어요\' (예외 없음)', () => {
  const diff = { ok: 0, caution: 0, delay: 0 };
  for (const { c, r, p } of ALL) {
    const a = P.prjJudge(r), b = T.prjJudge(D, c, p);
    assert.deepEqual({ ...a }, { ...b }, r.id);
    if (a.k === 'ok') assert.equal(a.t, '');
    else if (a.k !== 'none') { assert.match(a.t, /^(모집 공고|착공|준공|입주|허가) 예정일이 (\d+개월 )?지났어요$/, r.id); assert.doesNotMatch(a.t, /늦어짐|지연/); }
    diff[a.k]++;
  }
  assert.ok(diff.ok > 0 && diff.caution + diff.delay > 0, JSON.stringify(diff));
  /* 인천검단 35(PRJ-28290-0056): 준공 예정일 2025-02-18 이 19개월 지남 — 상세 머리 한 줄 */
  const r = LM.bySgg['28290'].find((x) => x.id === 'PRJ-28290-0056');
  assert.equal(P.factLine(P.prjJudge(r), r.overdue), `준공 예정일(${P.fullDate(r.overdue.planned)})이 ${r.overdue.months}개월 지났어요`);
  assert.equal(P.factOf({ k: 'ok', t: '' }, true), '예정일 지남 · 기록 확인 중');
  assert.equal(P.factOf({ k: 'ok', t: '' }, false), '');
});

/* 화면과 같은 순서로 목록을 만든다(page.tsx 의 load·CitizenProjectsPage 와 같은 함수 사슬) */
const rows = V.rowsOf(LM.bySgg, IDX.projects, IDX.sgg);
const parse = (q) => V.parseFilters(q, { policies: [], programs: [], sidoOk: (c) => P.METRO.includes(c), guOf });
function listOf(q, today = '2026-10-19') {
  const f = parse(q);
  const scope = V.applyFilters(rows, f).filter((r) => V.isMetro(r.sgg) && P.inSupply(r.board));
  return P.publicItems(scope.map((r) => ({ id: r.id, name: r.name, sgg: r.sgg, area: sggShort(r.sgg), units: r.units, board: r.board, issued: r.issued, cls: r.cls, overdue: r.overdue, next: r.next,
    pastDue: V.pastDueOf(r), steps: stepsOfId(r.id), agency: D.det[r.id]?.[0] ?? '', progress: null })), today, sggShort);
}
/* /citizen 공급 예정 호수(템플릿 sumOf — ①~④) */
const citizenSum = (pre) => { let n = 0, u = 0; for (const [c, L] of Object.entries(D.prj)) if (c.startsWith(pre)) for (const p of L) if (T.OF_STAGE[p[2]] <= 3) { n++; u += p[3]; } return { n, u }; };

test('합계: 수도권 262곳·22만 7,976호 = /citizen 공급 예정 호수 = 정책 화면 같은 범위(시도마다도 같다)', () => {
  const all = listOf({});
  const metro = ['11', '28', '41'].reduce((s, sd) => { const x = citizenSum(sd); return { n: s.n + x.n, u: s.u + x.u }; }, { n: 0, u: 0 });
  assert.deepEqual({ n: all.length, u: all.reduce((s, x) => s + x.units, 0) }, metro);
  assert.deepEqual(metro, { n: 262, u: 227976 }, '제안서 1.5 실측 값(원장 2026-10-13)');
  const policy = V.applyFilters(rows, V.parseFilters({}, { policies: [], programs: [], sidoOk: () => true })).filter((r) => r.board <= 3);
  assert.equal(policy.length, metro.n); assert.equal(policy.reduce((s, r) => s + r.units, 0), metro.u);
  if (DJ) { const b = Object.entries(DJ.prj).filter(([c]) => P.METRO.includes(c.slice(0, 2))).flatMap(([, L]) => L).filter((p) => T.OF_STAGE[p[2]] <= 3); assert.deepEqual({ n: b.length, u: b.reduce((s, p) => s + p[3], 0) }, metro, '빌드된 /citizen 자료와도 같다'); }
  for (const sd of ['11', '28', '41']) { const L = listOf({ sido: sd }); assert.deepEqual({ n: L.length, u: L.reduce((s, x) => s + x.units, 0) }, citizenSum(sd), sd); }
  const gy = listOf({ sgg: '28245' });
  assert.deepEqual({ n: gy.length, u: gy.reduce((s, x) => s + x.units, 0) }, { n: 6, u: 3664 }, '인천 계양구(제안서 4.4)');
  /* 묶음 합 = 목록 합 */
  const g = P.byYear(all, '2026-10-19');
  assert.equal(g.reduce((s, x) => s + x.items.length, 0), all.length);
  assert.equal(g.reduce((s, x) => s + x.units, 0), metro.u);
  assert.equal(g[g.length - 1].label, '연도 미정');
  assert.ok(g.every((x, i) => !i || !x.year || !g[i - 1].year || g[i - 1].year < x.year), '해 순서');
  assert.ok(g.every((x) => !x.year || x.year >= '2026'), '지난 해는 올해 묶음에(/citizen yearBucket 칸 0)');
});

test('수도권만: 수도권 밖 시도·시군구 주소는 수도권으로, 목록에 수도권 밖 사업 없음', () => {
  for (const q of [{ sido: '26' }, { sido: 'all' }, { sgg: '26110' }, { sido: '12' }, {}]) {
    const f = parse(q);
    assert.ok(!f.sido && !f.sgg, `${JSON.stringify(q)}: 시도·시군구 거르기 없음 → 화면 지역 이름 '수도권'`);
    assert.ok(listOf(q).every((x) => P.METRO.includes(x.sgg.slice(0, 2))), JSON.stringify(q));
  }
  assert.ok(rows.some((r) => !V.isMetro(r.sgg)), '원장에는 수도권 밖 사업이 있다(걸러짐을 보는 시험)');
  assert.deepEqual(parse({ sgg: '41280' }).gu, guOf('41280'), '구가 있는 경기 시는 그 구들');
});

test('거르기: 단계 묶음(/citizen 상단 필터와 같음)·이름 검색(초성)·주소 모양', () => {
  assert.deepEqual(P.STAGE_GROUPS, { prep: [0, 1], build: [2], sale: [3] });
  assert.deepEqual(Object.values(P.STAGE_GROUP_NAME), ['준비 중', '짓는 중', '모집 끝남']);
  for (const b of [0, 1, 2, 3]) assert.equal(P.STAGE_GROUP_NAME[P.groupOfBoard(b)], P.STAGE_NAME[b]);
  assert.ok(P.nameMatch('계양', ['인천계양(2블록)']) && P.nameMatch('ㅇㅊㄱㅇ', ['인천계양(2블록)']) && P.nameMatch('인천 계양', ['인천계양']) && !P.nameMatch('검단', ['인천계양']));
  assert.equal(P.findHref({ sgg: '28245', sido: '28', stage: 'build', q: '계양', id: 'PRJ-28245-0052' }), '/citizen/projects?sgg=28245&stage=build&q=%EA%B3%84%EC%96%91&id=PRJ-28245-0052');
  assert.equal(P.findHref({ sido: 'metro' }), '/citizen/projects?sido=metro', '수도권도 주소에 적는다(내 동네 넘김은 지역 없는 주소에서만)');
  assert.equal(P.findHref({}), '/citizen/projects');
});

/* ---------- 쉬운 말·단위·글자 ---------- */
const BANNED = [/[①②③④⑤⑥]/, /\bBL\b|\dBL/, /D-\d|D-day/, /원장/, /모집 시작/, /점검 필요/, /병목/, /판정/, /지연/, /후보/, /CSV/, /사업 id/, /PRJ-/, /HOME/, /덤프/];
const words = (L) => L.flatMap((x) => [x.name, x.sub, x.area, x.stage, x.nextText, x.inText, x.fact, x.agency]);

test("보이는 값(수도권 목록 전부·묶음 머리·사다리·문구)에 정책·내부 말이 없고 단위는 '호'", () => {
  const all = listOf({}), texts = [...words(all), ...P.byYear(all, '2026-10-19').map((g) => g.label), ...P.LADDER, ...P.LADDER_Q, ...Object.values(P.STAGE_GROUP_NAME), P.PAST_DUE_PUBLIC, P.PAST_DUE_TIP,
    ...Object.values(PD).flatMap((x) => (x.refs || []).map((ref) => P.sourceName(JSON.parse(read('data/board/project-detail.json')).sources[ref]?.provider || '') || ''))];
  for (const t of texts) for (const re of BANNED) assert.doesNotMatch(t, re, `${re} — ${t}`);
  for (const t of texts) assert.doesNotMatch(t, /\d\s*집/, t);
  assert.ok(all.every((x) => /^(모집 공고|착공|준공|입주) \d{4}년( \d+월( \d+일)?)? (완료|예정)$|^미정$/.test(x.nextText)), '다음 일정 모양');
  assert.ok(all.every((x) => /^(입주|준공) \d{4}년|^연도 미정$/.test(x.inText)), '들어올 때 모양');
  assert.equal(P.ho(1285), '1,285호');
  assert.equal(P.refText('2026-10-13'), '2026년 10월 13일 기준');
});

/* 화면 파일(주석 뺌): 12px·중간 굵기·임의값·색 리터럴·글자 기호·정책 말 없음 */
const FILES = ['app/(dashboard)/citizen/projects/page.tsx', 'components/citizen/FindFilters.tsx', 'components/citizen/MyAreaFirst.tsx', 'components/citizen/PublicDetail.tsx', 'components/citizen/PublicSteps.tsx'];
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const korean = (s) => [...s.matchAll(/[가-힣][가-힣 ·]*/g)].map((m) => m[0]).join(' | ');

test('화면 파일: 12px 없음(text-xs·text-caption·Badge·탭 개수 배지), 굵기 400·700, 하드코딩 없음', () => {
  for (const f of FILES) {
    const s = noComments(read(f));
    assert.doesNotMatch(s, /\btext-xs\b|text-caption|fs-caption|components\/ui\/badge|className="n"/, `${f}: 12px`);
    assert.doesNotMatch(s, /font-(medium|semibold|extrabold|black|thin|light)\b|font-\[\d/, `${f}: 굵기`);
    assert.doesNotMatch(s, /\b(?:text|rounded|leading|tracking|shadow|p[xytrbl]?|m[xytrbl]?|w|h|gap|border)-\[/, `${f}: 임의값`);
    assert.doesNotMatch(s, /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/, `${f}: 색 리터럴`);
    assert.doesNotMatch(s, /[①②③④⑤⑥›‹→←●○▸▾]/, `${f}: 글자 기호(아이콘은 lucide)`);
  }
});

test("화면 파일의 한글 문구: 정책·내부 말(원장·판정·지연·후보·점검·병목·D-·BL·모집 시작) 없음 · 일반사용자 말투", () => {
  for (const f of FILES) {
    const k = korean(noComments(read(f)));
    for (const re of [/원장/, /판정/, /지연/, /후보/, /점검/, /병목/, /모집 시작/, /사업 원장/, /정책 진행/, /누적/, /보고서/, /내려받기/]) assert.doesNotMatch(k, re, `${f}: ${re}`);
    assert.doesNotMatch(noComments(read(f)), /D-\$\{|'D-'|>BL</, f);
  }
  const page = noComments(read(FILES[0]));
  assert.match(page, /이 조건의 사업이 없어요/);
  assert.match(page, /title="사업 찾기"/);
  assert.doesNotMatch(page, /Download|Printer|ChipBar|Questions|Pipeline|PolicyCompare|statusCell|lateCell|DrawerHead/, '정책 화면 블록·조작 없음');
});

test('재사용: 목록 행·거르기·서랍은 정책 화면과 같은 함수(getProjectsIndex·getProjectDrawer·parseFilters·applyFilters·pastDueOf·Drawer), 내 동네는 menu.ts 를 읽기만', () => {
  const page = read(FILES[0]);
  for (const s of ['getProjectsIndex()', 'getProjectDrawer(id)', 'getPublicDetails()', 'parseFilters(', 'applyFilters(idx.rows, f)', 'pastDueOf(r)', "from '@/components/projects/Drawer'", 'publicItems(', 'byYear(items, today)']) assert.ok(page.includes(s), s);
  const my = read('components/citizen/MyAreaFirst.tsx');
  assert.match(my, /myAreaScope\(raw\)/); assert.match(my, /localStorage\.getItem\('myArea'\)/); assert.doesNotMatch(my, /localStorage\.setItem/);
  assert.match(read('components/citizen/FindFilters.tsx'), /className="ui-tabs" role="group" aria-label="지역"/);
  assert.match(read('components/citizen/FindFilters.tsx'), /className="ui-tabs" role="group" aria-label="단계"/);
  const steps = read('components/citizen/PublicSteps.tsx');
  assert.match(steps, /LADDER\.map/); assert.match(steps, /stepState\(i, current\)/);
});
