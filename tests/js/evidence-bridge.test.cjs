'use strict';
/* HOME 근거 연결(evidence_bridge) 두 가지(2026-10-20 사용자 결정): D9 공고문 입주 예정월 싣기(LH → 같은 날 GH·SH·지자체로 넓힘) · D7 공고 ↔ 사업 연결 늘리기(REVIEW_REQUIRED 만, 코드로만).
   원장 표·화면 자료(커밋된 파일)의 센 수를 고정하고, 공고 확인 호수·모집공고 사건·판정이 그대로인지, 담당자 칸이 없는지, 연결이 주소의 공고 번호에서만 나왔는지 본다.
   덤프 원본(jsonl.gz)이 있으면 근거 행과도 대조한다. 규칙: tools/ledger/home-source.js(bridgeAdopted · noticeKeyOfUrl) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../../tools/ledger/home-source');
const { noticeUnitsOf } = require('../../tools/ledger/home-map');
/* lib/board/*.ts 는 같은 폴더 모듈을 확장자 없이 부른다 — 시험에서만 '.ts' 를 붙여 찾는다(data-defs 와 같다) */
require('node:module').registerHooks({ resolve(s, c, n) { try { return n(s, c); } catch (e) { if (/^\.\.?\//.test(s)) return n(`${s}.ts`, c); throw e; } } });

const ROOT = path.join(__dirname, '..', '..');
const P = require('../../tools/ledger/paths');
const DIR = P.ledgerDir(P.latestMonth());   // 지금 원장(가장 늦은 달 폴더) — 화면 자료(data/board)와 같은 달
const rows = (t) => JSON.parse(fs.readFileSync(path.join(DIR, 'tables', `${t}.json`), 'utf8')).rows;
const json = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const homeDir = H.latestHomeDir(DIR), raw = H.homeAvailable(homeDir);
/* 담당자 이름·입력 사유(2026-11-09): 덤프 판이면 그 판 원본에서 센다. 슬라이스 판(manifest slice_format — home-slice.py apply, 담당자 칸을 처음부터 싣지 않음)이면
   그 판 원본에 actor·reason·change_reason 칸이 하나도 없는지 확인하고(slice), 산출물 검사용 이름·사유는 같은 달 덤프 판 원본(있으면 가장 늦은 것)에서 가져온다 */
function officerTermsFor(dir) {
  const Hs = require('../../tools/ledger/home-source'), fsx = require('node:fs'), px = require('node:path');
  const isSlice = (d) => !!JSON.parse(fsx.readFileSync(px.join(d, 'manifest.json'), 'utf8')).slice_format;
  if (!isSlice(dir)) return { slice: false, ...Hs.officerTerms(Hs.readHome(dir).kinds) };
  const keys = [];
  const walk = (o) => { if (Array.isArray(o)) { for (const v of o) walk(v); return; } if (!o || typeof o !== 'object') return; for (const [k, v] of Object.entries(o)) { if (['actor', 'reason', 'change_reason'].includes(k)) keys.push(k); walk(v); } };
  walk(Hs.readHome(dir).kinds);
  const base = px.dirname(dir), dumps = fsx.readdirSync(base).map((e) => px.join(base, e)).filter((d) => fsx.existsSync(px.join(d, 'manifest.json')) && !isSlice(d) && Hs.homeAvailable(d)).sort();
  const t = dumps.length ? Hs.officerTerms(Hs.readHome(dumps.at(-1)).kinds) : { names: [], reasons: new Set() };
  return { slice: true, sliceKeys: keys.length, fromDump: dumps.length > 0, ...t };
}
const EVENTS = rows('events'), LINKS = rows('notice_links'), PD = json('data/board/project-detail.json').projects;
const LH_DOC = /^home-dump-\d{8}T\d{6}Z-(lh|gh|sh|local)-doc$/, BRIDGE = /^home-dump-\d{8}T\d{6}Z-bridge$/;
const lhDoc = EVENTS.filter((e) => LH_DOC.test(e.source_ref)), bridge = LINKS.filter((l) => BRIDGE.test(l.source_ref));

test('noticeKeyOfUrl: https · 공고 사이트 세 곳의 공고 번호 칸만 읽는다', () => {
  assert.deepEqual(H.noticeKeyOfUrl('https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?panId=0000060988&ccrCnntSysDsCd=02&uppAisTpCd=05&aisTpCd=05&mi=1027'), { system: 'LH', id: '0000060988', param: 'panId' });
  assert.deepEqual(H.noticeKeyOfUrl('https://www.applyhome.co.kr/ai/aia/selectAPTLttotPblancDetail.do?houseManageNo=2025000160&pblancNo=2025000161'), { system: 'APPLYHOME', id: '2025000160-2025000161', param: 'houseManageNo·pblancNo' });
  assert.deepEqual(H.noticeKeyOfUrl('https://apply.gh.or.kr/sb/sr/sr7150/selectPbancDetailView.do?pbancNo=793&pbancKndCd=01'), { system: 'GH', id: '793', param: 'pbancNo' });
  for (const u of ['http://apply.lh.or.kr/x.do?panId=1', 'https://apply.lh.or.kr.evil.kr/x.do?panId=1', 'https://www.lh.or.kr/x.do?panId=1', 'https://apply.lh.or.kr/lhapply/apply/noti/sp/list.do?sUppAisTpCd=06',
    'https://apply.lh.or.kr/x.do?panId=abc', 'https://www.applyhome.co.kr/x.do?houseManageNo=1', '남양주진접2 A-7블록 공공분양주택 입주자모집 공고', null]) assert.equal(H.noticeKeyOfUrl(u), null, String(u));
});

test('moveInDocOf: 원문 주소의 기관 사이트로만 공고문 원천을 가른다(LH·GH 는 공고 번호, SH·지자체 누리집, 중앙 기관·그 밖은 null)', () => {
  assert.equal(H.moveInDocOf('https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?panId=0000060988').kind, 'lh');
  assert.equal(H.moveInDocOf('https://apply.gh.or.kr/sb/sr/sr7150/selectPbancDetailView.do?pbancNo=793&pbancKndCd=01').kind, 'gh');
  assert.equal(H.moveInDocOf('https://www.i-sh.co.kr/app/com/file/innoFD.do?brdId=GS0401&seq=262508').kind, 'sh');
  assert.equal(H.moveInDocOf('https://www.anyang.go.kr/manan/selectBbsNttView.do?bbsNo=157').kind, 'local');
  for (const u of ['https://www.molit.go.kr/LCMS/DWN.jsp?x=1', 'https://www.data.go.kr/data/1', 'https://apply.lh.or.kr/lhapply/apply/noti/sp/list.do?sUppAisTpCd=06', 'http://www.i-sh.co.kr/x', 'https://www.korea.kr/briefing/x', 'https://kind.krx.co.kr/x', '하계5단지 공고문'])
    assert.equal(H.moveInDocOf(u), null, u);
});

test('bridgeAdopted: HOME 이 채택한(CONFIRMED) 연결만 — 검토 전 후보·해제·추정은 버린다', () => {
  assert.equal(H.bridgeAdopted({ status: 'CONFIRMED', inferred: false }), true);
  assert.equal(H.bridgeAdopted({ status: 'CONFIRMED' }), true);
  for (const p of [{ status: 'REVIEW' }, { status: 'RELEASED' }, { status: 'CONFIRMED', inferred: true }, {}]) assert.equal(H.bridgeAdopted(p), false, JSON.stringify(p));
});

test('D9: 공고문 입주 예정 14건(LH 10 · GH 1 · SH 1 · 지자체 2) · 화면 사업 14곳(입주 일정이 없던 곳을 채움 13 · 연도만 있던 곳을 달로 1), 달 이상 · CONFIRMED · 한 사업 한 달', () => {
  /* 2026-10-22 새 덤프(20261021T212310Z): 문서 근거(document_evidence 1,088 → 2,065) 채택 +2 — 계양 A3(PRJ-28245-0057) LH 공고문 2026-12 · PRJ-41196-0101 지자체 공고문 2029-06 */
  assert.equal(lhDoc.length, 14);
  assert.deepEqual(lhDoc.reduce((o, e) => { const k = /-(\w+)-doc$/.exec(e.source_ref)[1]; return { ...o, [k]: (o[k] ?? 0) + 1 }; }, {}), { lh: 10, gh: 1, sh: 1, local: 2 });
  const ids = [...new Set(lhDoc.map((e) => e.local_project_id))].sort();
  assert.deepEqual(ids, ['PRJ-11740-0102', 'PRJ-28155-0037', 'PRJ-28245-0057', 'PRJ-41131-0048', 'PRJ-41196-0101', 'PRJ-41220-0183', 'PRJ-41281-0095', 'PRJ-41360-0194', 'PRJ-41360-0195', 'PRJ-41360-0196', 'PRJ-41360-0197', 'PRJ-41360-0205', 'PRJ-41450-0074', 'PRJ-41500-0072']);
  /* 연도만 있던 곳(다산지금 A3, HOME 원천 공급계획 2027)은 달(GH 공고문 2027-05)이 현재 예정 */
  assert.equal(PD['PRJ-41360-0195'].stages.MOVE_IN.plan, '2027-05');
  assert.ok(EVENTS.some((e) => e.local_project_id === 'PRJ-41360-0195' && e.event_type === 'MOVE_IN' && e.event_year === '2027'));
  for (const e of lhDoc) {
    assert.deepEqual([e.event_type, e.date_type, e.plan_basis, e.review_status, e.event_date, e.event_year], ['MOVE_IN', 'PLANNED', 'CURRENT', 'CONFIRMED', null, null], e.local_project_id);
    assert.match(e.event_month, /^\d{4}-\d{2}$/);
    assert.match(e.event_detail, /^(LH 공고문 panId \d+|GH 공고문 pbancNo \d+|SH 공고문|지자체 공고문) 입주 예정 .+ · HOME 근거 연결 EVI_[0-9a-f]+$/);
    /* 같은 사업에 다른 입주 사건(실제 또는 달 이상 예정)이 있으면 싣지 않는다 */
    const other = EVENTS.filter((x) => x.event_type === 'MOVE_IN' && x.local_project_id === e.local_project_id && x !== e);
    assert.ok(other.every((x) => x.date_type === 'PLANNED' && !x.event_date && !x.event_month), `${e.local_project_id}: 이미 달 이상 입주 일정`);
  }
  /* 화면(사업 상세): 그 9곳의 입주 현재 예정이 LH 공고문 */
  const shown = Object.entries(PD).filter(([, x]) => LH_DOC.test(x.stages.MOVE_IN?.planSrc ?? '')).map(([id]) => id).sort();
  assert.deepEqual(shown, ids);
  const sources = new Map(rows('sources').map((x) => [x.source_ref, x]));
  const PROVIDER = { lh: /^LH 공고문.*한국토지주택공사/, gh: /^GH 공고문.*경기주택도시공사/, sh: /^SH 공고문.*서울주택도시공사/, local: /^지자체 공고문.*지방자치단체/ };
  for (const ref of new Set(lhDoc.map((e) => e.source_ref))) { const x = sources.get(ref); assert.match(`${x.dataset_name} ${x.provider}`, PROVIDER[/-(\w+)-doc$/.exec(ref)[1]], ref); }
});

test('D9 원본 대조: 근거는 공고문 주소 · 채택된 연결 · 연도 원천 아님, 검토 전 후보(REVIEW)는 싣지 않는다', { skip: !raw && 'HOME 판 원본(jsonl.gz) 없음' }, () => {
  const K = H.readHome(homeDir).kinds, byId = new Map(K.evidence_bridge.map((r) => [r.entity_id, r.payload]));
  for (const e of lhDoc) {
    const p = byId.get(/EVI_[0-9a-f]+$/.exec(e.event_detail)[0]);
    const doc = p && H.moveInDocOf(p.evidence_url);
    assert.ok(doc && H.bridgeAdopted(p), e.event_detail);
    assert.ok(e.source_ref.endsWith(`-${doc.kind}-doc`), e.source_ref);
    if (doc.code) assert.ok(e.event_detail.startsWith(`${doc.label} ${doc.code} `), e.event_detail);
    assert.ok(p.facts.some((f) => f.milestone === 'MOVE_IN' && f.kind === 'PLAN' && f.date === e.event_month && f.date_precision !== 'YEAR' && !f.date_conversion));
  }
  const review = K.evidence_bridge.filter((r) => H.moveInDocOf(r.payload.evidence_url) && !H.bridgeAdopted(r.payload) && (r.payload.facts ?? []).some((f) => f.milestone === 'MOVE_IN'));
  assert.ok(review.length > 0, '원본에 채택 안 된 입주 근거가 있다(시험이 빈 목록으로 통과하지 않게)');
  for (const r of review) assert.ok(!lhDoc.some((e) => e.event_detail.endsWith(r.entity_id)), r.entity_id);
});

test('D7: 근거 연결 공고 연결은 모두 REVIEW_REQUIRED(LH·GH), 주소의 공고 번호 = 연결 공고 번호(코드만), 겹치는 쌍 없음 — 원장 연결 = 사업 창 공고 줄', () => {
  const bySystem = (xs, k) => xs.reduce((o, x) => ({ ...o, [x[k]]: (o[x[k]] ?? 0) + 1 }), {});
  const pdNotices = Object.values(PD).flatMap((x) => x.notices ?? []);
  /* 판 숫자(135쌍 · { LH: 131, GH: 4 }) 대신: 원장 근거 연결 = 사업 창 자료(project-detail.json)의 청약홈 밖 공고 줄, 기관별로도 같다 */
  assert.ok(bridge.length > 0, '근거 연결 공고가 있다(빈 목록으로 통과하지 않게)');
  assert.equal(bridge.length, pdNotices.filter((n) => n.system !== 'APPLYHOME').length);
  assert.deepEqual(bySystem(bridge, 'notice_system'), bySystem(pdNotices.filter((n) => n.system !== 'APPLYHOME'), 'system'));
  assert.ok(bridge.every((l) => ['LH', 'GH'].includes(l.notice_system)), '근거 연결 공고는 LH·GH 공고 사이트만');
  const notices = new Map(rows('notices').map((n) => [`${n.notice_system}|${n.notice_id}`, n]));
  for (const l of bridge) {
    assert.equal(l.review_status, 'REVIEW_REQUIRED');
    const m = /^E1_EVIDENCE_URL_CODE: HOME 근거 연결 EVI_[0-9a-f]+ 원문 주소 (panId|pbancNo) (\d+) · 원문 (https:\/\/\S+)$/.exec(l.evidence);
    assert.ok(m, l.evidence);
    assert.deepEqual(H.noticeKeyOfUrl(m[3]), { system: l.notice_system, id: l.notice_id, param: m[1] });
    assert.equal(m[2], l.notice_id);
    const n = notices.get(`${l.notice_system}|${l.notice_id}`);
    assert.ok(n, '공고 표에 있는 공고만');
    assert.ok(!l.evidence.includes(n.notice_title), '공고명을 근거로 쓰지 않는다');
  }
  assert.equal(new Set(LINKS.map((l) => `${l.notice_system}|${l.notice_id}|${l.local_project_id}`)).size, LINKS.length, '같은 (공고, 사업) 쌍은 한 번');
  /* 이미 있던 청약 공고 연결: 판 숫자([41, 36]) 대신 사업 창의 청약홈 공고 줄 수·확정 공고 줄 수와 같다(근거 연결은 확정이 없다) */
  const home = LINKS.filter((l) => /-notice$/.test(l.source_ref));
  assert.equal(home.length + bridge.length, LINKS.length, '공고 연결 원천은 청약 공고·근거 연결 둘뿐');
  assert.deepEqual([home.length, home.filter((l) => l.review_status === 'CONFIRMED').length], [pdNotices.filter((n) => n.system === 'APPLYHOME').length, pdNotices.filter((n) => n.review === 'CONFIRMED').length]);
});

test('D7 화면: 공고 줄 사업 = 원장 공고 연결이 있는 사업(근거 연결로만 생긴 사업 포함), 근거 연결 공고는 모두 검토 표지·원문 주소', () => {
  const withN = Object.values(PD).filter((x) => x.notices);
  /* 판 숫자(68곳 · 근거 연결로만 27곳) 대신 원장 공고 연결(notice_links)에서 다시 센 사업 수 */
  const homeLinked = new Set(LINKS.filter((l) => /-notice$/.test(l.source_ref)).map((l) => l.local_project_id));
  const linked = new Set(LINKS.map((l) => l.local_project_id));
  assert.equal(withN.length, linked.size);
  assert.equal(withN.filter((x) => x.notices.every((n) => n.system !== 'APPLYHOME')).length, [...linked].filter((id) => !homeLinked.has(id)).length);
  for (const n of withN.flatMap((x) => x.notices).filter((n) => n.system !== 'APPLYHOME')) {
    assert.equal(n.review, 'REVIEW_REQUIRED');
    assert.match(n.url, /^https:\/\/(apply\.lh\.or\.kr|apply\.gh\.or\.kr)\//);
  }
});

test('D7 은 연결만: 공고 확인 호수(사업 색인 = 원장 사건·호수에서 다시 센 값)·모집공고 사건(근거 연결 원천 없음)·판정(보드 = 사업 행)은 그대로, 연결 원천의 사건 0', () => {
  const idx = json('data/board/projects-index.json').projects, v = Object.values(idx).filter((x) => x.notice != null);
  /* 판 숫자([41, 22952]) 대신: 사업 색인의 공고 확인 호수 = 원장 표(units·events)에서 noticeUnitsOf 로 다시 센 사업 수·호수 */
  const units = rows('units'), notice = noticeUnitsOf({ units, events: EVENTS }), ids = rows('projects').map((p) => p.local_project_id);
  assert.ok(v.length > 0);
  assert.deepEqual([v.length, v.reduce((s, x) => s + x.notice, 0)], [ids.filter((id) => notice(id) != null).length, ids.reduce((s, id) => s + (notice(id) ?? 0), 0)]);
  /* 판 숫자(모집공고 사건 126건) 대신: 모집공고 사건은 HOME 본 원천·청약 공고 원천에서만(근거 연결은 사건을 만들지 않는다), 보드의 모집공고 실적 사업 수 = 사건에서 다시 센 값 */
  const sn = EVENTS.filter((e) => e.event_type === 'SUPPLY_NOTICE');
  assert.ok(sn.length > 0 && sn.every((e) => /^home-dump-\d{8}T\d{6}Z(-notice)?$/.test(e.source_ref)), '모집공고 사건 원천');
  assert.equal(EVENTS.filter((e) => BRIDGE.test(e.source_ref)).length, 0);
  const B = json('data/board/ledger-board.json');
  assert.equal(B.scope.withEvents.supplyNotice, new Set(sn.filter((e) => e.date_type === 'ACTUAL' && idx[e.local_project_id]).map((e) => e.local_project_id)).size);
  /* 판 숫자([172, 11, 2]) 대신: 보드 판정 = 사업 색인(판정 칸 cls)에서 다시 센 정상·주의·지연 */
  const V = require('../../lib/board/projects-view.ts'), MAP = json('data/board/ledger-map.json'), IDX = json('data/board/projects-index.json');
  const shown = V.rowsOf(MAP.bySgg, IDX.projects, IDX.sgg), cls = (k) => shown.filter((r) => r.issued && r.cls === k).length;
  const j = B.judgment;
  assert.deepEqual([j.ok.projects, j.caution.projects, j.delay.projects], [cls('ok'), cls('caution'), cls('delay')]);
});

test('담당자 칸·이름이 원장 표·화면 자료에 없다', () => {
  const files = [...fs.readdirSync(path.join(DIR, 'tables')).map((f) => path.join(DIR, 'tables', f)),
    ...fs.readdirSync(path.join(ROOT, 'data/board')).filter((f) => f.endsWith('.json')).map((f) => path.join(ROOT, 'data/board', f)),
    ...fs.readdirSync(path.join(ROOT, 'data/board/home-map')).map((f) => path.join(ROOT, 'data/board/home-map', f))];
  const ot = raw ? officerTermsFor(homeDir) : null, names = ot ? ot.names : [];
  if (ot?.slice) assert.equal(ot.sliceKeys, 0, '슬라이스 판 원본에 담당자 칸(actor·reason)이 없다');
  if (ot && (!ot.slice || ot.fromDump)) assert.ok(names.length > 0, '원본(슬라이스 판이면 같은 달 덤프 판)에 담당자 입력이 있다 — 아래 이름 검사가 빈 목록으로 통과하지 않게');
  for (const f of files) {
    const s = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(s, /"(actor_basis|review_actor|responsible_org|officer|reviewer)"\s*:/, f);
    if (!/stat_facts\.json$/.test(f)) assert.doesNotMatch(s, /"actor"\s*:/, f);   // 통계 표의 actor 는 시행 주체(TOTAL·공공 등) 칸
    assert.deepEqual(names.filter((n) => s.includes(n)), [], `${path.relative(ROOT, f)}: 담당자 이름`);
  }
});
