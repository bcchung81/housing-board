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

test('자료: 공고 줄 사업 60곳(확정만 3 · 검토 섞임 57 — D7 근거 연결 공고가 더해짐, evidence-bridge.test.cjs), 유형 62곳(2026-10-21 같은 호수 대표 행 규칙으로 +7), 공고는 공고일 순·같은 공고 번호 한 번', () => {
  const withN = P.filter(([, x]) => x.notices);
  assert.equal(withN.length, 62);   // 2026-10-21 새 덤프(20261020T142230Z): 근거 연결(evidence_bridge 661 → 708)로 LH 공고 2쌍(인천부평 A PRJ-28237-0065·계양 A3 PRJ-28245-0057, 둘 다 검토) +2
  assert.equal(withN.filter(([, x]) => x.notices.every((n) => n.review === 'CONFIRMED')).length, 3);
  assert.equal(withN.filter(([, x]) => x.notices.some((n) => n.review === 'REVIEW_REQUIRED')).length, 59);
  assert.equal(P.filter(([, x]) => x.types).length, 67);   // 2026-10-21 새 덤프(20261020T142230Z): 새 사업 3(독산동·방화차고지 건설형 공공임대, 연남동 공공임대)·인천서구 공급계획 행이 합쳐진 2곳(PRJ-28275-0034·0037 행복주택) +5 · 2026-10-21: 같은 호수면 HOME inventory 대표 행(공급계획)의 유형 — +7(PRJ-28155-0036·28275-0036·41113-0034·41150-0096·41220-0181·41220-0185·41290-0031)
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
