/* 운영 범위: 수도권(서울 11·인천 28·경기 41)만. 수도권 밖 실시간 자료 API 는 막는다.
   개발 확인용으로 환경변수 NON_CAPITAL_LIVE=1 일 때만 수도권 밖도 허용한다(2026-10-19 결정).
   시도 판정은 입력 앞 두 자리가 아니라 lib/codes.js classify() 의 sido 로 한다(옛 광주 29·전남 46 은 12 로 바뀐다). 시험: tests/js/capital-scope.test.cjs */
'use strict';

const CAPITAL_SIDO = ['11', '28', '41'];
/* 수도권 경계 상자(옹진 백령도 124.6E · 연천 38.28N · 평택·안성 36.9N · 양평 127.85E 포함) */
const CAPITAL_BBOX = { w: 124.5, e: 127.9, s: 36.85, n: 38.35 };

const nonCapitalAllowed = (env) => !!env && env.NON_CAPITAL_LIVE === '1';
const inCapitalSido = (sido) => CAPITAL_SIDO.includes(String(sido));
/* 영역 [w,s,e,n] 이 수도권 경계 상자와 겹치는가 */
const overlapsCapital = (w, s, e, n) => e > CAPITAL_BBOX.w && w < CAPITAL_BBOX.e && n > CAPITAL_BBOX.s && s < CAPITAL_BBOX.n;

const OUT_OF_SCOPE = { status: 403, code: 'out-of-scope', title: '수도권만 제공합니다', detail: '서울·인천·경기만 볼 수 있습니다', cache: 'public, s-maxage=3600' };

/* problem(res, status, code, title, detail, extra, cc) 형 헬퍼로 거부 응답을 보낸다 */
const denyScope = (problem, res, sido) => problem(res, OUT_OF_SCOPE.status, OUT_OF_SCOPE.code, OUT_OF_SCOPE.title, OUT_OF_SCOPE.detail, sido ? { sido } : undefined, OUT_OF_SCOPE.cache);

module.exports = { CAPITAL_SIDO, CAPITAL_BBOX, OUT_OF_SCOPE, nonCapitalAllowed, inCapitalSido, overlapsCapital, denyScope };
