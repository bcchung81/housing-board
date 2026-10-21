'use strict';
// W6(2026-10-21 사용자 지시 '수도권 전체 · 9·7 · HOME'): 정책담당자 화면에 남은 옛 원장·HOME 밖 숫자를 HOME 9·7 자료로 바꾼 것을 고정한다.
//   LH 준공 예정(/month·/agency/lh·종합상황판 월 링크) = HOME 덤프 lh_completion_plan 중 9·7 포트폴리오 행에 이어진 블록(data/board/home-lh-plan.json, tools/ledger/home-lh-plan.js)
//   /sources '화면별 위젯 데이터'의 종합상황판 줄 = '/' 가 쓰는 data/board/home-board.json(옛 ledger-board.json 아님)
//   /region 머리 사업·점검 필요 건수 = 사업 화면과 같은 HOME 원천 행(home-projects views.p97) — 건수 = 그 링크로 열리는 목록 건수
// 정답(.cache/home-parity/golden, 기준일 2026-10-20)과 다른 값은 home-projects residuals 의 PRO_ id 로 설명돼야 한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const LHP = require('../../data/board/home-lh-plan.json');
const HP = require('../../data/board/home-projects.json');
const HB = require('../../data/board/home-board.json');
const IDX = require('../../data/board/projects-index.json');
const MOLIT = require('../../data/board/molit.json');
const CAL = require('../../data/board/region-calendar.json');
const V = require('../../lib/board/projects-view.ts');
const MA = require('../../lib/board/month-ahead.ts');
const GEN = require('../../tools/ledger/home-lh-plan');
const HOME = require('../../tools/ledger/home-source');
const P = require('../../tools/ledger/paths');

const GOLD = path.join(ROOT, '.cache/home-parity/golden/golden-policy.json');
const gp = fs.existsSync(GOLD) ? JSON.parse(fs.readFileSync(GOLD, 'utf8')) : null;
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

test('LH 준공 예정 원천 = HOME 덤프(9·7 포트폴리오 블록): 행마다 이어진 원천 행이 9·7·통계 포함 행이고, 원장 사업 id 는 그 행들의 것', () => {
  const rows = new Map(HP.rows.map((r) => [r.id, r]));
  assert.equal(LHP.schema, 'home-lh-plan/1');
  assert.equal(LHP.asOf, HP.asOf, '기준일 = 정책 진행 자료 기준일');
  assert.equal(LHP.source.dump.edition, HP.source.dump.edition, '같은 덤프 판');
  assert.equal(LHP.sourceAsOf, '2026-01-27', 'LH 파일 기준일(HOME 이 받은 판)');
  assert.deepEqual([LHP.count, LHP.units], [LHP.blocks.length, sum(LHP.blocks, (b) => b.units)]);
  assert.deepEqual([LHP.count, LHP.units, new Set(LHP.blocks.map((b) => `${b.district}|${b.block}`)).size], [77, 45702, 76], '2026-10-20 23:22 판: 77행 45,702호 76블록');
  for (const b of LHP.blocks) {
    assert.ok(b.pro.length && b.pro.every((id) => rows.get(id)?.p97 && rows.get(id).stats), `${b.id}: 9·7 포트폴리오 행에만 이어짐`);
    const ours = [...new Set(b.pro.map((id) => rows.get(id).ourId).filter(Boolean))].sort();
    assert.equal(b.ourId, ours[0] ?? null, b.id);
    assert.ok(['11', '28', '41'].includes(b.sido) && /^\d{4}-\d{2}-\d{2}$/.test(b.date) && b.units > 0, b.id);
  }
  assert.deepEqual(LHP.blocks.map((b) => b.date), LHP.blocks.map((b) => b.date).sort(), '준공예정일 순');
  assert.doesNotMatch(JSON.stringify(LHP), /"(actor|basis|reason|actor_basis)"/, '담당자 이름·사유 칸 없음');
});

test('home-lh-plan.json = 덤프로 다시 만든 바이트(원본 jsonl.gz 가 있을 때)', (t) => {
  const dir = HOME.latestHomeDir(P.ledgerDir(P.latestMonth()));
  if (!dir || !HOME.homeAvailable(dir)) return t.skip('HOME 덤프 원본 없음');
  const doc = GEN.build(GEN.readKinds(dir, ['lh_completion_plan', 'evidence_bridge']), HP);
  assert.equal(GEN.render(doc), read('data/board/home-lh-plan.json'));
});

test('LH 준공 예정을 쓰는 화면(월 상세·기관 LH·종합상황판 월 링크)은 HOME 자료만 — 옛 공공데이터포털 파일(lh-completion.json)을 읽지 않는다', () => {
  const month = read('app/(dashboard)/month/[id]/page.tsx'), agency = read('app/(dashboard)/agency/[id]/page.tsx'), board = read('app/(dashboard)/page.tsx');
  for (const [name, src] of [['month', month], ['agency', agency], ['board', board]]) {
    assert.match(src, /from '@\/lib\/board\/home-lh-plan'/, name);
    assert.doesNotMatch(src, /\{[^}]*\blh\b[^}]*\} = await getBoardData\(\)/, `${name}: getBoardData 의 lh(공공데이터포털 파일)를 꺼내지 않는다`);
  }
  assert.match(read('lib/board/home-lh-plan.ts'), /import json from '\.\.\/\.\.\/data\/board\/home-lh-plan\.json'/);
  assert.match(board, /validMonths: monthIds\(molit\.months, homeLh\.blocks, calendar\)/);
  /* 범위 칩 = 'LH 준공 예정 · 정책 진행 자료' */
  for (const src of [month, agency]) assert.match(src, /<ScopeChip scope="LH 준공 예정" source="정책 진행 자료"/);
  assert.doesNotMatch(month, /LH 준공예정 파일/);
  /* 기관 LH 지도 열: 이어진 원천 행의 원장 사업(ourId) */
  assert.match(agency, /const project = b\.ourId && ours\.has\(b\.ourId\) \? b\.ourId : undefined/);
  /* 열리는 달 = 실적 + HOME LH 준공 예정 달 + 9·7 공급 예정 달 */
  const ids = MA.monthIds(MOLIT.months, LHP.blocks, CAL);
  for (const b of LHP.blocks) assert.ok(ids.includes(b.date.slice(0, 7)), b.id);
  assert.ok(ids.includes('2030-02'), '가장 늦은 9·7 연결 블록 달');
});

test('/sources 화면별 위젯 데이터: 종합상황판 줄 = home-board 값(9·7 175곳·부족률 판정·12개월 공급 예정), 옛 ledger-board 설명 없음', () => {
  const page = read('app/(dashboard)/sources/page.tsx');
  assert.match(page, /import homeBoardJson from '@\/data\/board\/home-board\.json'/);
  assert.doesNotMatch(page, /ledger-board\.json|\bledger\.(scope|regions|upcoming|agencies|overdue|months|observedMonth)|ledgerRow\(|ledgerJudged|nationOf/, '옛 원장 집계로 설명하지 않는다');
  assert.equal(HB.scope.projects, 177);   // 2026-10-22 새 덤프(20261021T212310Z): 부천역곡 A1·인천송림4 1 이 9·7 포트폴리오에 들어옴(10-21 판 175)
  if (gp) assert.equal(HB.scope.projects, Number(gp['policy.linked_projects']), 'PoC 연결 사업(물량 집계) 175 = 첫 줄 수집 건수');
  assert.match(page, /homeRow\('ribbon', '월별 공급 파동', tipped\(`수도권 9·7\(사업 \$\{fmt\(homeBoard\.scope\.projects\)\}건\)`/);
  assert.match(page, /count: first \? held\(homeBoard\.scope\.projects, '사업'\)/);
  assert.match(page, /homeRow\('snap', '선택 시점 판정', tipped\(`판정 \$\{fmt\(homeBoard\.scope\.judged\)\}건 · 지연 \$\{fmt\(hj\.delay\.projects\)\} · 주의 \$\{fmt\(hj\.caution\.projects\)\}`, `\$\{homeBoard\.judge\.rule\}/);
  assert.match(HB.judge.rule, /부족률/, '판정 규칙 = 부족률 2%');
  assert.match(page, /homeRow\('future', AHEAD_SUPPLY, tipped\(`\$\{fmt\(aheadUnits\)\}호/);
  assert.match(page, /aheadUnits = homeBoard\.upcoming\.reduce\(\(n, m\) => n \+ m\.units, 0\)/);
  assert.match(page, /scope: '수도권 9·7 · 시도 · 월'/, '범위 = 수도권 전체(전국 아님)');
  for (const k of ['stageUnits', 'judgment', 'regions', 'upcoming', 'agencies']) assert.match(page, new RegExp(`'data/board/home-board\\.json · ${k}'`), `펼친 예시 ${k}`);
  /* 단계별 데이터 연계(같은 화면 아래 탭): 종합상황판 기준 글 = 정책 진행 자료 */
  assert.match(page, /ledgerNote: `정책 진행 자료 \$\{homeBoard\.observedMonth/);
});

test('/region 머리 숫자 = home-projects views.p97(사업 화면 기본과 같은 HOME 원천 행) — 링크 건수 = 열리는 목록 건수, 점검 필요 = 지연·주의', () => {
  const page = read('app/(dashboard)/region/page.tsx');
  assert.match(page, /const hp = await getHomeProjects\(\), rows = hp\.rows;/);
  assert.match(page, /const pf: Filters = \{ home: true, \.\.\.\(policy === 'p97' \? \{ policy: hp\.policies\.find\(\(p\) => p\.key === HOME_DEFAULT_POLICY\) \} : \{\}\)/);
  assert.doesNotMatch(page, /getProjectsIndex/, '옛 원장 사업 행으로 세지 않는다');
  const rows = V.homeRowsOf(HP.rows, HP.residuals), p97 = IDX.policies.find((p) => p.key === V.HOME_DEFAULT_POLICY);
  const ctx = { policies: IDX.policies, programs: V.homeProgramsOf(rows), sidoOk: (c) => ['11', '28', '41'].includes(c), home: { agencies: V.homeAgenciesOf(rows).map((a) => a.name) } };
  const opened = (href) => V.applyFilters(rows, V.parseFilters(Object.fromEntries(new URL(href, 'https://x').searchParams), ctx)).length;
  const head = (reg, pol = 'p97') => { const pf = { home: true, ...(pol === 'p97' ? { policy: p97 } : {}), ...reg }; return { n: V.applyFilters(rows, pf).length, check: V.applyFilters(rows, { ...pf, status: 'check' }).length, href: V.listHref(pf), checkHref: V.listHref(pf, { status: 'check' }) }; };
  const metro = head({ metro: true });
  const judge = HP.views.p97.judge;
  assert.deepEqual([metro.n, metro.check, metro.href], [HP.views.p97.rows, (judge.DELAYED?.rows ?? 0) + (judge.WARNING?.rows ?? 0), '/projects'], '수도권 9·7 = 230건 · 점검 필요 = 지연+주의');
  assert.deepEqual([metro.n, metro.check], [232, 8]);   // 2026-10-22: 점검 필요 = 지연 6 · 주의 2(= PoC) · 9·7 원천 행 +2(10-21 판 230)
  for (const h of [metro, head({ sido: '11' }), head({ sido: '28' }), head({ sido: '41' }), head({ metro: true }, 'all'), head({ sido: '41' }, 'all')]) {
    assert.equal(opened(h.href), h.n, h.href);
    assert.equal(opened(h.checkHref), h.check, h.checkHref);
  }
  for (const r of HP.views.p97.regions) {
    const code = { 서울특별시: '11', 인천광역시: '28', 경기도: '41' }[r.name];
    assert.equal(head({ sido: code }).n, r.rows, r.name);
  }
  assert.equal(head({ metro: true }, 'all').n, HP.views.all.rows, '정책 칩이 정책 전체면 443행');
  if (gp) {
    assert.equal(metro.n, Number(gp['policy.management_projects']), 'PoC 관리 사업 230');
    /* 점검 필요: PoC 지연 6·주의 2 = 우리 8 — 판정 잔차(home-projects residuals judge)가 있으면 그만큼만 다르다(2026-10-22 잔차 0) */
    const late = HP.residuals.filter((x) => x.field === 'judge' && ['DELAYED', 'WARNING'].includes(x.poc?.status) && !['DELAYED', 'WARNING'].includes(x.dump?.status));
    assert.equal(metro.check + late.length, Number(gp['policy.project_status.DELAYED.projects']) + Number(gp['policy.project_status.WARNING.projects']), late.map((x) => x.id).join(' '));
  }
});
