/* 기관 화면(/agency/[id])·월 상세의 HOME 사업 판정(2026-10-21 결정 — HOME 정책 추진현황 '기관별 진행현황'과 같은 값).
   자료는 data/board/home-projects.json(tools/ledger/home-projects.js — PoC 원천 사업 행 PRO_ 단위). 순수 함수 — Node 시험이 그대로 읽는다.
   기관 = PoC agencyName(빈값·'확인 필요' → 기관 미상, LH·GH·SH 만 묶고 그 밖은 원천 글자 그대로 — iH 는 원천 '인천도시공사'),
   묶음 = 9·7 포트폴리오의 물량 집계 대상 행(PoC portfolio_cohorts — 정책 화면 기본), 호수 = 집계 호수, 판정 = statusAt(도래 목표 대비 같은 단계 측정 부족률 2% 이상 지연, 0~2% 주의). */
export type Judge = 'DELAYED' | 'WARNING' | 'NORMAL' | 'UNKNOWN';
export type HomeRow = {
  id: string; ourId: string | null; name: string; region: string; sgg: { name: string; codes: string[] } | null;
  stats: boolean; p97: boolean; chart: { p97: boolean; all: boolean }; units: { planned: number | null; counted: number | null };
  judge: { status: Judge; gap: number } | null; agency: string; loc: { ourSgg: string | null } | null;
};
export const JUDGE_NAME: Record<Judge, string> = { DELAYED: '지연', WARNING: '주의', NORMAL: '정상', UNKNOWN: '판정 미확보' };
/* 우리 기관 화면 id → PoC 기관 이름 */
export const HOME_AGENCY: Record<string, string> = { lh: 'LH', gh: 'GH', sh: 'SH', ih: '인천도시공사' };

export type AgencyLine = { name: string; rows: HomeRow[]; total: number; count: number; units: Record<Judge, number>; delayedSharePct: number };
/* 기관 한 줄: 9·7 집계 행 중 그 기관 — 호수 합·사업 수·판정별 호수·지연 사업 물량 비중(지연 호수 ÷ 합, 소수 한 자리) */
export function agencyLine(rows: HomeRow[], name: string): AgencyLine {
  const xs = rows.filter((r) => r.p97 && r.chart.p97 && r.agency === name);
  const units: Record<Judge, number> = { DELAYED: 0, WARNING: 0, NORMAL: 0, UNKNOWN: 0 };
  for (const r of xs) units[r.judge?.status ?? 'UNKNOWN'] += r.units.counted ?? 0;
  const total = xs.reduce((n, r) => n + (r.units.counted ?? 0), 0);
  return { name, rows: xs, total, count: xs.length, units, delayedSharePct: total ? Math.round(units.DELAYED / total * 1000) / 10 : 0 };
}
