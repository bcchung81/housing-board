'use strict';
/* '데이터 원본' 요구사항 충족 격자와 화면 머리의 요구사항 꼬리표(components/ReqTags.tsx)가 읽는 data/board/requirements.json 을 만든다.
   요구사항 F-01~F-12(HOME 기능 요구: 제목·우선순위·세부 항목·판단 기준)마다 관련 지시 날짜, 답하는 화면(새 구조: 사업 projects · 지역 공급 region · 데이터 원본 sources),
   근거 지표와 판정(충족 met · 부분 part · 없음 none)을 적는다.
   근거 지표는 HOME PoC 와 같게(2026-10-21 결정): 모수는 9·7 정책 사업 230(PoC 정책 화면 기준), 값은 PoC '요구사항 충족' API 응답(추정 포함 기본 · 추정 제외 보조)이다.
   서버 쪽 셈(추정 포함 셀·기준선 등)은 덤프로 다시 만들 수 없어 home-sources.js --fetch-poc 가 받아 둔 스냅샷(raw/home-api/<기준일>/sources-requirements.json.gz)을 읽는다.
   F-01(지도 위치 근거 사업)·F-08(승인 기관 배정 목표 사업)은 PoC 정의로 바꿨다(시도 수·시행 기관 식별 → 사업 단위).
   판정 규칙은 F 마다 같다: 추정 포함 비율이 95% 이상이면 충족, 0 초과면 부분, 산정 불가(분모 0)이거나 0 이면 없음.
   입력: 스냅샷, docs/주택파동_정책근거_및_요구사항_매트릭스.md(지시 표), 그 달의 가장 늦은 HOME 판 이름(edition).
   공개 저장소라 담당자 이름·입력 사유 원문은 산출물에 넣지 않는다. 출력은 결정적이다(정렬, 현재 시각 없음).
   실행: node tools/ledger/requirements.js [--month YYYY-MM] */
const fs = require('node:fs');
const path = require('node:path');
const P = require('./paths');
const { latestHomeDir } = require('./home-source');
const { readPoc } = require('./home-sources');

const OUT = 'data/board/requirements.json';

/* HOME 기능 요구사항 원문(HOME PoC requirements-manual 의 source·우선순위, 2026-10-14 옮김) */
const REQUIREMENTS = [
  {"id":"F-01","title":"주택공급 현황 통합 조회","short":"주택공급 현황 통합 조회","priority":"필수","criterion":"전국·지역·개별 사업 단위 정보가 연계되고, 집계 결과를 구성하는 실제 사업 목록을 확인할 수 있는가?","items":["전국 및 지역별 주택공급 현황을 통합적으로 조회할 수 있어야 한다.","복수 기관 및 정책·사업에 분산된 공급정보를 함께 조회할 수 있어야 한다.","공급계획, 현재 진행상황, 실제 공급실적을 구분할 수 있어야 한다.","전체 현황에서 특정 지역이나 개별 사업으로 조회 범위를 좁힐 수 있어야 한다.","조회 범위에 따라 집계 결과가 일관되게 변경되어야 한다."]},
  {"id":"F-02","title":"주택공급 목표 대비 이행실적 관리","short":"목표 대비 이행실적 관리","priority":"필수","criterion":"어떤 정책이 목표 대비 얼마나 진행되었고, 남은 물량이 얼마인지 실제 데이터에 근거해 판단할 수 있는가?","items":["공급정책별 목표물량과 실적을 관리할 수 있어야 한다.","목표 대비 달성률 및 미달 물량을 확인할 수 있어야 한다.","연도별·지역별·기관별 이행실적을 비교할 수 있어야 한다.","실적의 기준일 및 집계 기준을 확인할 수 있어야 한다.","공급목표가 변경된 경우 변경 이력을 추적할 수 있어야 한다."]},
  {"id":"F-03","title":"공급 단계별 진행상황 관리","short":"공급 단계별 진행상황 관리","priority":"필수","criterion":"개별 사업의 현재 단계뿐 아니라, 전체 공급정책이 각 단계에서 얼마나 진척되었는지 파악할 수 있는가?","items":["사업화·인허가·착공·분양·준공·입주 등의 진행단계를 관리할 수 있어야 한다.","사업별 현재 단계와 완료된 주요 단계의 이력을 확인할 수 있어야 한다.","각 단계의 목표물량·실적물량·미완료물량을 구분할 수 있어야 한다.","전체 사업을 집계하여 공급 단계별 진척상황을 파악할 수 있어야 한다.","단계별 대상물량의 차이와 중복 집계 여부를 검증할 수 있어야 한다."]},
  {"id":"F-04","title":"사업별 상세정보 조회","short":"사업별 상세정보 조회","priority":"필수","criterion":"특정 사업이 어디에서, 누가, 얼마나, 언제까지 공급하는 사업인지 파악할 수 있는가?","items":["개별 공급사업의 사업명·위치·유형·담당기관·공급규모를 확인할 수 있어야 한다.","사업별 현재 진행단계와 주요 추진 실적을 확인할 수 있어야 한다.","사업별 과거·현재·향후 주요 일정을 조회할 수 있어야 한다.","사업의 진행상황을 판단하는 데 사용된 근거자료를 확인할 수 있어야 한다.","상위 지역·정책별 집계에서 개별 사업정보까지 추적할 수 있어야 한다."]},
  {"id":"F-05","title":"연도별 공급계획 및 시계열 분석","short":"연도별 공급계획·시계열 분석","priority":"필수","criterion":"특정 연도를 기준으로 공급정책의 진행상황을 확인하고, 앞으로 어느 시점에 얼마나 공급될 예정인지 설명할 수 있는가?","items":["과거부터 현재, 미래까지 연도별 공급현황을 조회할 수 있어야 한다.","특정 연도 기준의 계획·실적·진행상황을 확인할 수 있어야 한다.","연도별 착공·분양·준공·입주 예정물량을 확인할 수 있어야 한다.","향후 연도의 단계별 목표 달성 예정 시점을 확인할 수 있어야 한다.","기간 변경 시 전체 공급현황과 관련 집계가 일관되게 변경되어야 한다.","확정 실적과 계획상 예정물량, 예측 결과를 명확히 구분할 수 있어야 한다."]},
  {"id":"F-06","title":"공급사업 일정 및 지연 관리","short":"사업별 일정·지연 관리","priority":"필수","criterion":"당초 약속한 일정에 비해 어떤 사업이 얼마나 지연되었는지 확인할 수 있는가?","items":["사업별 최초 계획일정, 현재 예정일정, 실제 완료일정을 구분하여 관리할 수 있어야 한다.","일정 변경 여부와 지연기간을 확인할 수 있어야 한다.","지연 사업과 정상 추진 사업을 구분할 수 있어야 한다.","일정이 변경된 경우 변경 이력과 사유를 확인할 수 있어야 한다.","지역·기관·공급단계별 지연 현황을 집계할 수 있어야 한다."]},
  {"id":"F-07","title":"사업 지연 원인 및 병목 관리","short":"지연 원인·병목 관리","priority":"중요","criterion":"지연 사업을 발견하는 것에서 그치지 않고, 지연 원인과 후속 조치 필요사항을 파악할 수 있는가?","items":["사업 진행을 저해하는 주요 사유를 확인할 수 있어야 한다.","인허가, 보상, 기반시설, 기관 협의 등 병목 요인을 구분할 수 있어야 한다.","지연 요인별 영향 사업 및 물량을 집계할 수 있어야 한다.","해결 담당기관, 조치계획, 조치상태를 관리할 수 있어야 한다.","문제가 장기간 해소되지 않는 사업을 식별할 수 있어야 한다."]},
  {"id":"F-08","title":"기관별·정책별 추진현황 관리","short":"기관별·정책별 추진현황","priority":"중요","criterion":"특정 기관이 담당한 공급사업의 진행상황과 해결해야 할 주요 과제를 확인할 수 있는가?","items":["사업별 주관기관과 협력기관을 식별할 수 있어야 한다.","기관별 담당 사업의 목표와 실적을 확인할 수 있어야 한다.","정책 또는 공급사업 유형별 추진현황을 구분할 수 있어야 한다.","여러 기관이 참여하는 사업은 기관 간 협의 필요사항과 처리상태를 확인할 수 있어야 한다."]},
  {"id":"F-09","title":"국민의 공급 예측가능성 지원","short":"국민의 공급 예측가능성","priority":"필수","criterion":"국민이 특정 지역에서 앞으로 언제, 얼마나 주택이 공급될 예정인지 확인하고 주거계획에 참고할 수 있는가?","items":["특정 지역의 향후 주택공급 예정정보를 확인할 수 있어야 한다.","향후 공급규모와 주요 공급 일정을 확인할 수 있어야 한다.","분양·입주 등 국민의 주거계획에 필요한 일정을 구분할 수 있어야 한다.","일정이 확정되지 않은 경우 확정 여부 및 변경 가능성을 알 수 있어야 한다.","공개 가능한 공식정보를 기준으로 제공해야 한다."]},
  {"id":"F-10","title":"공급정보의 신뢰성 및 갱신 관리","short":"정보 신뢰성·갱신 관리","priority":"필수","criterion":"시스템의 주요 수치가 어떤 자료에서 도출되었는지 추적하고 검증할 수 있는가?","items":["주요 데이터별 원천기관 및 기준일을 확인할 수 있어야 한다.","정보가 언제 갱신되었는지 확인할 수 있어야 한다.","정책·사업·공급단계 간 집계 기준의 일관성을 검증할 수 있어야 한다.","데이터가 누락되거나 불일치하는 경우 이를 식별할 수 있어야 한다.","검증되지 않은 자료나 임의 생성 자료를 공식 실적으로 제공해서는 안 된다.","실제 데이터, 시연용 데이터, 추정 데이터를 구분할 수 있어야 한다."]},
  {"id":"F-11","title":"정책 이행상황 종합 판단","short":"정책 이행상황 종합 판단","priority":"중요","criterion":"정책 담당자가 현재 공급정책이 계획대로 진행되고 있는지 판단하고 우선 점검할 사업을 식별할 수 있는가?","items":["전국 및 지역별 공급정책의 전체 이행상황을 확인할 수 있어야 한다.","주요 단계별 목표 대비 실적을 종합적으로 비교할 수 있어야 한다.","정상 추진, 일정 지연, 추가 확인이 필요한 사업을 구분할 수 있어야 한다.","향후 일정에 영향을 미칠 수 있는 주요 위험 요인을 확인할 수 있어야 한다.","종합 결과에서 근거가 되는 개별 사업 및 데이터로 연결할 수 있어야 한다."]},
  {"id":"F-12","title":"향후 공급실적 예측 및 시나리오 분석","short":"공급 예측·시나리오 분석","priority":"확장","criterion":"일정 변화가 향후 공급실적에 미치는 영향을 근거에 기반해 분석할 수 있는가?","items":["현재 사업단계와 기존 추진일정을 기반으로 향후 공급규모를 전망할 수 있어야 한다.","사업 지연 및 일정 변동이 향후 공급물량에 미치는 영향을 분석할 수 있어야 한다.","기준 시나리오와 대안 시나리오를 비교할 수 있어야 한다.","예측에 사용된 가정, 데이터, 산정 방식을 확인할 수 있어야 한다.","예측 결과를 정부의 확정 공급계획 또는 공식 실적으로 오인하지 않도록 구분해야 한다."]},
];
/* 지시 날짜(매트릭스 1절의 '주는 요구사항'과 맞춘 것)와 답하는 화면. F-12(시나리오)는 답하는 화면이 없다 — 앞으로 12개월 예정은 F-09 로만 센다 */
const F_LINK = {
  'F-01': [['08.21', '09.03'], ['projects', 'region']], 'F-02': [['08.14'], ['projects']], 'F-03': [['08.14', '09.30'], ['projects']],
  'F-04': [['08.19'], ['projects']], 'F-05': [['08.14'], ['region']], 'F-06': [['09.18'], ['projects']],
  'F-07': [['09.03', '08.29'], ['projects']], 'F-08': [['08.21', '08.29'], ['projects']], 'F-09': [['09.04'], ['region']],
  'F-10': [['09.30'], ['sources']], 'F-11': [['08.14', '09.03'], ['projects']], 'F-12': [['09.04', '09.30'], []],
};
/* 지시 표: '| 2026.08.14 | 행사 | 핵심 | 필요 |' 줄 */
const directivesOf = (md) => [...md.matchAll(/^\| (2026\.\d\d\.\d\d) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)].map((m) => ({ date: m[1].slice(5), full: m[1], event: m[2].trim(), need: m[4].trim() }));

/* 근거 지표에 보이는 짧은 이름(PoC 지표 이름은 길어 툴팁에 둔다) */
const SHORT = {
  'F-01': '위치 근거 사업', 'F-02': '목표·실적 칸', 'F-03': '실적 근거 칸', 'F-04': '이름·지역·계획량 사업', 'F-05': '날짜 있는 계획 사업', 'F-06': '기준선 칸',
  'F-07': '병목 기록', 'F-08': '기관 배정 목표 사업', 'F-09': '공급·입주 예정 사업', 'F-10': '원천·기준일 사업', 'F-11': '목표·실적 칸', 'F-12': '시나리오',
};
const ratio = (m) => (m.total ? `${m.count}/${m.total} ${m.percent}%` : '산정 불가');

/* poc: sources-requirements 응답. 판정: met 충족 · part 부분 · none 없음. 근거 지표(metric)는 화면에 보이는 짧은 값, tip 은 PoC 지표 이름·주석·규칙(제목 툴팁) */
function judge(poc) {
  return Object.fromEntries(Object.entries(poc.metrics).map(([id, m]) => {
    const w = m.with_estimates, x = m.without_estimates;
    const verdict = w.percent >= 95 ? 'met' : w.percent > 0 ? 'part' : 'none';
    return [id, {
      verdict, metric: `${SHORT[id]} ${ratio(w)} · 추정 제외 ${ratio(x)}`,
      tip: `${m.label} — 추정 포함(기본) ${ratio(w)} · 추정 제외 ${ratio(x)} · 추정으로 추가 ${m.estimate_added_count} · 모수는 9·7 정책 사업 ${poc.project_count}건(5단계 칸은 ${poc.project_count * 5}) · ${m.note} · 규칙: 추정 포함 95% 이상 충족, 0 초과 부분, 산정 불가·0 없음`,
      poc: { label: m.label, count: w.count, total: w.total, percent: w.percent, exCount: x.count, exTotal: x.total, exPercent: x.percent, added: m.estimate_added_count },
    }];
  }));
}

function buildRequirements({ poc, md, month, referenceDate, edition }) {
  const J = judge(poc);
  const used = new Set(Object.values(F_LINK).flatMap(([d]) => d));
  return {
    schema: 'requirements/2', observedMonth: month, referenceDate, edition,
    screens: { projects: { name: '사업', href: '/projects' }, region: { name: '지역 공급', href: '/region' }, sources: { name: '데이터 원본', href: '/sources' } },
    directives: directivesOf(md).filter((d) => used.has(d.date)),
    items: REQUIREMENTS.map((r) => ({ ...r, dates: F_LINK[r.id][0], screens: F_LINK[r.id][1], ...J[r.id] })),
    measures: { base: poc.project_count, policyId: poc.policy_id },
  };
}

function build({ month, root = P.ROOT } = {}) {
  month ??= P.latestMonth(root);
  const dir = P.ledgerDir(month, root);
  const homeDir = latestHomeDir(dir);
  const referenceDate = P.referenceDateOf(dir), pocDir = path.join(dir, 'raw', 'home-api', referenceDate);
  if (!fs.existsSync(path.join(pocDir, 'manifest.json'))) throw new Error(`PoC 스냅샷이 없다: ${pocDir} — node tools/ledger/home-sources.js --fetch-poc`);
  const md = fs.readFileSync(path.join(root, 'docs/주택파동_정책근거_및_요구사항_매트릭스.md'), 'utf8');
  return buildRequirements({ poc: readPoc(pocDir).requirements, md, month, referenceDate, edition: path.basename(homeDir) });
}

if (require.main === module) {
  const i = process.argv.indexOf('--month');
  const doc = build({ month: i > 0 ? process.argv[i + 1] : undefined });
  fs.writeFileSync(path.join(P.ROOT, OUT), JSON.stringify(doc) + '\n');
  const n = (v) => doc.items.filter((r) => r.verdict === v).length;
  console.log(`${OUT}: 충족 ${n('met')} · 부분 ${n('part')} · 없음 ${n('none')} (9·7 사업 ${doc.measures.base}, 판 ${doc.edition})`);
  for (const r of doc.items) console.log(`  ${r.id} ${r.verdict.padEnd(4)} ${r.metric}`);
}

module.exports = { REQUIREMENTS, F_LINK, OUT, directivesOf, judge, buildRequirements, build };
