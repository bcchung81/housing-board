'use strict';
/* 사업 상세 창의 공고 줄(D1)·공급 유형(D2): 자료(project-detail.json)의 센 수 · 묶음 규칙 · 청약홈 주소 · 창 자료(허용 목록·pks 없음). 2026-10-20 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..', '..');
const DET = require('../../data/board/project-detail.json');
const { typesOf } = require('../../tools/ledger/housing-types');
const P = Object.entries(DET.projects);

function loadTs(rel, stubs) {
  const done = new Map();
  const resolve = (req, dir) => {
    const base = req.startsWith('@/') ? path.join(ROOT, req.slice(2)) : req.startsWith('.') ? path.resolve(dir, req) : null;
    if (!base) return null;
    for (const f of [base, `${base}.ts`, `${base}.tsx`]) if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
    return base;
  };
  const load = (file) => {
    if (done.has(file)) return done.get(file).exports;
    const m = new Module(file, module);
    m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
    done.set(file, m);
    m.require = (req) => {
      const abs = resolve(req, path.dirname(file));
      if (abs && stubs[path.relative(ROOT, abs)]) return stubs[path.relative(ROOT, abs)];
      if (abs && /\.tsx?$/.test(abs)) return load(abs);
      return require(abs ?? req);
    };
    m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
    return m.exports;
  };
  return load(path.join(ROOT, rel));
}
const W = loadTs('lib/board/project-window.ts', {
  'lib/board/data.ts': { getBoardData: async () => ({ allProjects: require('../../registry/projects.json').projects, molit: require('../../data/board/molit.json') }), SGG: {} },
});
const { applyhomeUrl, noticeUrl } = loadTs('lib/board/public-labels.ts', {});
const URL_RE = /^https:\/\/www\.applyhome\.co\.kr\/ai\/aia\/selectAPTLttotPblancDetail\.do\?houseManageNo=\d+&pblancNo=\d+$/;
const SITE_RE = /^https:\/\/(apply\.lh\.or\.kr|www\.applyhome\.co\.kr|apply\.gh\.or\.kr)\//;

test('자료: 공고 줄 사업·확정만·검토 섞임 = 원장 공고 연결(notice_links — D7 근거 연결 공고 포함, evidence-bridge.test.cjs)에서 다시 센 수, 유형 있는 사업 = 원장 호수 표의 공급 유형이 있는 사업, 공고는 공고일 순·같은 공고 번호 한 번', () => {
  const withN = P.filter(([, x]) => x.notices);
  /* 판 숫자(68 · 확정만 2 · 검토 섞임 66 · 유형 69) 대신 원장 표에서 다시 센 값. 같은 (사업, 공고)는 한 줄 — 연결 하나라도 확정이면 확정 */
  const table = (t) => JSON.parse(fs.readFileSync(path.join(require('../../tools/ledger/paths').ledgerDir(require('../../tools/ledger/paths').latestMonth()), 'tables', `${t}.json`), 'utf8')).rows;
  const pairs = new Map();
  for (const l of table('notice_links')) {
    if (!DET.projects[l.local_project_id]) continue;
    const k = `${l.local_project_id}|${l.notice_system}|${l.notice_id}`;
    pairs.set(k, pairs.get(k) === 'CONFIRMED' ? 'CONFIRMED' : l.review_status);
  }
  const byProject = new Map();
  for (const [k, st] of pairs) { const id = k.split('|')[0]; (byProject.get(id) || byProject.set(id, []).get(id)).push(st); }
  assert.ok(byProject.size > 0, '공고 연결이 있다(빈 목록으로 통과하지 않게)');
  assert.equal(withN.length, byProject.size);
  assert.equal(withN.filter(([, x]) => x.notices.every((n) => n.review === 'CONFIRMED')).length, [...byProject.values()].filter((v) => v.every((st) => st === 'CONFIRMED')).length);
  assert.equal(withN.filter(([, x]) => x.notices.some((n) => n.review === 'REVIEW_REQUIRED')).length, [...byProject.values()].filter((v) => v.some((st) => st === 'REVIEW_REQUIRED')).length);
  const typed = new Set(table('units').filter((u) => u.housing_type && String(u.housing_type).trim()).map((u) => u.local_project_id));
  assert.equal(P.filter(([, x]) => x.types).length, P.filter(([id]) => typed.has(id)).length);
  for (const [, x] of withN) {
    for (const n of x.notices) assert.deepEqual(Object.keys(n), ['system', 'id', 'title', 'date', 'review', ...(n.url ? ['url'] : [])]);
    assert.equal(new Set(x.notices.map((n) => `${n.system}|${n.id}`)).size, x.notices.length);
    assert.ok(x.notices.every((n) => n.title && n.date));
    assert.deepEqual(x.notices.map((n) => n.date), x.notices.map((n) => n.date).sort());
  }
});

test('유형 묶음: 쉬운 이름은 사업마다 한 번, 원천 이름 10가지가 7가지 이름으로', () => {
  const names = new Set(), raws = new Set();
  for (const [, x] of P) for (const t of x.types ?? []) { names.add(t.name); t.raw.forEach((r) => raws.add(r)); }
  assert.equal(raws.size, 12);   // 2026-10-21 새 덤프(20261020T142230Z): 원천 이름 '건설형 공공임대'(독산동·방화차고지)·'공공임대'(연남동)가 새로 — 쉬운 이름 표에 없어 그대로 보인다
  assert.deepEqual([...names].sort(), ['건설형 공공임대', '공공분양', '공공임대', '국민임대', '민간참여 공공분양', '분양전환 공공임대', '이익공유형 분양', '통합공공임대', '행복주택'].sort());
  for (const [, x] of P) if (x.types) assert.equal(new Set(x.types.map((t) => t.name)).size, x.types.length);
  assert.deepEqual(typesOf(['공공분양, 공공임대(6년 분양전환)']).map((t) => t.name), ['공공분양', '분양전환 공공임대']);
  assert.deepEqual(typesOf(['6년 공공임대주택', '분양전환 공공임대']), [{ name: '분양전환 공공임대', raw: ['6년 공공임대주택', '분양전환 공공임대'] }]);
  assert.deepEqual(typesOf(['이익공유형 분양주택', '이익공유형 공공분양']).map((t) => t.name), ['이익공유형 분양']);
  assert.deepEqual(typesOf(['공공주택 · 민간참여 공공분양 계획']).map((t) => t.name), ['민간참여 공공분양']);
  assert.deepEqual(typesOf([null, '새 유형']).map((t) => t.name), ['새 유형'], '모르는 이름은 그대로');
});

test('청약홈 주소: 공고 번호 두 토막만, 그 밖은 null', () => {
  assert.equal(applyhomeUrl('APPLYHOME', '2025000160-2025000160'), 'https://www.applyhome.co.kr/ai/aia/selectAPTLttotPblancDetail.do?houseManageNo=2025000160&pblancNo=2025000160');
  assert.equal(applyhomeUrl('LH', '0000060571'), null);
  assert.equal(applyhomeUrl('APPLYHOME', 'x'), null);
  /* 원천 주소: https · 공고 사이트 세 곳만, 아니면 청약홈 번호 주소 또는 null */
  const lh = 'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?panId=0000060988&ccrCnntSysDsCd=02&uppAisTpCd=05&aisTpCd=05&mi=1027';
  assert.equal(noticeUrl('LH', '0000060988', lh), lh);
  assert.equal(noticeUrl('GH', '793', 'https://apply.gh.or.kr/sb/sr/sr7150/selectPbancDetailView.do?pbancNo=793&pbancKndCd=01'), 'https://apply.gh.or.kr/sb/sr/sr7150/selectPbancDetailView.do?pbancNo=793&pbancKndCd=01');
  for (const bad of ['http://apply.lh.or.kr/x?panId=1', 'https://apply.lh.or.kr.evil.kr/x', 'https://www.lh.or.kr/x', 'javascript:alert(1)', '', null, undefined]) assert.equal(noticeUrl('LH', '1', bad), null, String(bad));
  assert.equal(noticeUrl('APPLYHOME', '2025000160-2025000160', 'https://evil.example/x'), applyhomeUrl('APPLYHOME', '2025000160-2025000160'));
});

test('창 자료: 두 관점 모두 notices(주소 포함)·types 가 있고 pks 가 없다', async () => {
  const id = P.find(([, x]) => x.notices && x.types && x.notices.some((n) => n.system === 'APPLYHOME') && x.notices.some((n) => n.review === 'REVIEW_REQUIRED'))[0];
  const a = await W.projectWindow(id, 'admin'), u = await W.projectWindow(id, 'public', { today: '2026-10-20' });
  assert.ok(a && u, id);
  for (const w of [a, u]) assert.ok(!JSON.stringify(w).includes('"pks"'));
  assert.ok(a.detail.notices.length && a.detail.notices.every((n) => (n.system === 'APPLYHOME' ? URL_RE : SITE_RE).test(n.url)));
  assert.ok(a.detail.types.length);
  assert.deepEqual(u.detail.notices, a.detail.notices);
  assert.deepEqual(u.head.types, a.detail.types);
  assert.ok(!('notices' in (await W.projectWindow(P.find(([, x]) => !x.notices)[0], 'admin')).detail));
});

test('창 자료: 공고는 공고일 최근 순 3건 + 나머지 noticesMore(두 관점 같다), LH·GH 는 원천 주소', async () => {
  const many = P.filter(([, x]) => (x.notices ?? []).length > 3);
  assert.equal(many.length, 16);
  for (const [id, x] of many.slice(0, 4)) {
    const a = await W.projectWindow(id, 'admin'), u = await W.projectWindow(id, 'public', { today: '2026-10-20' });
    assert.equal(a.detail.notices.length, 3, id);
    assert.equal(a.detail.noticesMore, x.notices.length - 3, id);
    const dates = a.detail.notices.map((n) => n.date);
    assert.deepEqual(dates, [...dates].sort().reverse(), id);
    assert.equal(dates[0], [...x.notices].map((n) => n.date).sort().pop(), id);
    if (u) { assert.deepEqual(u.detail.notices, a.detail.notices); assert.equal(u.detail.noticesMore, a.detail.noticesMore); }
  }
  const lh = P.find(([, x]) => (x.notices ?? []).length <= 3 && x.notices?.some((n) => n.system === 'LH'));
  const w = await W.projectWindow(lh[0], 'admin');
  assert.ok(!('noticesMore' in w.detail));
  for (const n of w.detail.notices) assert.match(n.url, SITE_RE, n.id);
  assert.ok(w.detail.notices.filter((n) => n.system === 'LH').every((n) => n.url.includes(`panId=${n.id}`)));
});
