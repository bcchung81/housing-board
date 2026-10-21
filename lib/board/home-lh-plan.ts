import json from '../../data/board/home-lh-plan.json';
import { addrText } from './calc';
import type { LhBlock, LhData } from './types';

/* 정책 진행 자료(HOME)의 LH 준공 예정(tools/ledger/home-lh-plan.js — HOME 덤프 lh_completion_plan 중 9·7 포트폴리오 원천 행에 이어진 블록×공급유형 행).
   월 상세(/month)·기관 LH(/agency/lh)·종합상황판 월 링크(monthIds)가 쓴다(2026-10-21 W6 — 공공데이터포털 파일 data/board/lh-completion.json 대신). */
export type HomeLhBlock = LhBlock & { id: string; pro: string[]; ourId: string | null };
export type HomeLhPlan = Omit<LhData, 'blocks'> & { asOf: string; blocks: HomeLhBlock[] };
export const homeLh = json as unknown as HomeLhPlan;
/* 위치 칸: 원천 주소는 주소 칸 여럿을 이어 붙여 시도·시군구가 되풀이된다 — 되풀이를 뺀 글(addrText), 원문은 title */
export const lhLoc = (loc: string) => { const t = addrText(loc); return t === loc ? loc : { text: t, title: loc }; };
/* 한 블록이 공급유형별 여러 줄인 까닭(머리 'n블록 · m줄' 의 (i)) */
export const LH_ROWS_TIP = '파일 한 줄 = 블록 × 공급유형이라 한 블록이 여러 줄일 수 있습니다(블록 = 사업지구 + 블록 이름으로 셈)';
/* 범위 칩·설명의 한 말 */
export const HOME_LH_TIP = '정책 진행 자료(HOME)가 받은 LH 공공주택 준공예정현황(공공데이터포털 15141761) 중 9·7 정책 승인 연결 사업에 이어진 블록만';
