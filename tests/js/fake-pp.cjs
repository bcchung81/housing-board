'use strict';
/* 판과 무관한 가짜 정책 진행 자료(data/board/policy-progress.json 모양) — 화면 규칙(달성률 글자·막대 기준선·같은 확인 값 문구·접힌 머리 줄)을
   HOME 판 숫자 대신 고정한 작은 자료로 시험한다(2026-11-09 P2). 값은 2026-10-19 판 9·7 의 예(시험 이름에 남은 3,560/14,694 · 3,560/1,543 · 381/381 등).
   stages: { KEY: [목표, 확인, 추정 포함] } — 상태·부족은 policy-progress.js samePeriod 규칙(목표 없음 NOT_DUE · 확인 없음 NO_ACTUAL · 미달 GAP · 아니면 REACHED) */
const SAMPLE = {
  BUSINESS: [14694, 3560, 5789],
  APPROVAL: [1543, 3560, 3560],
  CONSTRUCTION: [null, 86739, 86739],
  SUPPLY: [8049, 4732, 8742],
  COMPLETION: [381, 381, 381],
  MOVE_IN: [null, null, null],
};
function fakePP(stages = SAMPLE, policyId = 'POL_2025_0907') {
  const from = '2026-01-01', through = '2026-09-30';
  const st = Object.fromEntries(Object.entries(stages).map(([k, [target, actual, withEst]]) => {
    const gap = target != null && actual != null ? Math.max(0, target - actual) : null;
    const status = target == null ? 'NOT_DUE' : actual == null ? 'NO_ACTUAL' : gap > 0 ? 'GAP' : 'REACHED';
    return [k, {
      label: k, targetBasis: '가짜 목표', actualBasis: '가짜 확인',
      targetPoints: k === 'CONSTRUCTION' ? [{ date: '2026-12-31', units: 269000 }] : [],
      samePeriod: [{ year: 2026, from, through, target, actual, actualWithEstimates: withEst, actualReviewUnits: 0, actualThrough: through, gap, shortfallPct: gap != null && target ? Math.round(gap / target * 1000) / 10 : null, status }],
    }];
  }));
  return { asOf: '2026-10-13', referenceMonthEnd: through, policies: [{ policyId, name: '가짜 9·7', stages: st }] };
}
module.exports = { fakePP, SAMPLE };
