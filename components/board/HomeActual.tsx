/* 종합상황판 월별 실적 흐름(HOME 규칙 집계 — 2026-10-21 결정). Board 가 지역 탭(수도권 전체·서울·경기·인천)에서 고른 집계의 monthly 를 넘긴다(옛 RealPanels 서버 컴포넌트에서 옮김) */
import { cn } from 'cn';
import { Card } from '@/components/ui/card';
import ScopeChip from '@/components/ui/scope-chip';
import InfoTip from '@/components/ui/info-tip';
import MonthLines from '@/components/charts/MonthLines';
import { METRIC_COLOR } from '@/components/charts/palette';
import { ymDot } from '@/lib/board/calc';
import type { LedgerBoard } from '@/lib/board/types';
import PanelLink from './PanelLink';
import { Key } from './tags';
import { legend, pacts, panel, phead, phgroup, pinfo, ptitle } from './styles';

/* HOME 규칙 집계(2026-10-21 결정)의 월별 실적 흐름: 9·7 승인 연결 사업 사건(입력·추정 포함)의 단계별 누적 측정 월 증가분, 최근 24개월(HOME '월별 실적 흐름'과 같은 값) */
const HOME_LINES = [['APPROVAL', '인허가', 'permit'], ['CONSTRUCTION', '착공', 'start'], ['SUPPLY', '분양·모집', 'sale'], ['COMPLETION', '준공', 'complete']] as const;
/* sido = 지역 탭('all' 수도권 전체 · 시도 코드): 9·7 사업 링크도 그 시도로 */
export default function HomeActual({ monthly, refDate, scope, sido = 'all' }: { monthly: NonNullable<LedgerBoard['home']>['monthly']; refDate: string; scope: string; sido?: string }) {
  const months = monthly.map((r) => r.month), first = months[0], last = months[months.length - 1];
  const lines = HOME_LINES.map(([k, label, color]) => ({ key: k, label, color: METRIC_COLOR[color], values: monthly.map((r) => r[k]) }));
  return (
    <Card variant="section" className={panel} render={<section id="p-actual" aria-label="월별 실적 흐름" />}>
      <div className={phead}>
        <h2 className={ptitle} title={`HOME 9·7 승인 연결 사업(${scope}) · 단계별 누적 측정값의 월 증가분(입력·추정 포함) · 단위 호 · ${ymDot(first)} ~ ${ymDot(last)}`}>월별 실적 흐름</h2>
        <InfoTip label="월별 실적 흐름 기준" className={pinfo}>
          <p>최근 24개월 단계별 누적 측정값의 월 증가분 · 입력·추정 포함(HOME 정책 추진현황 '월별 실적 흐름'과 같은 값). 0은 등록된 증가분 없음입니다.</p>
          <p>{ymDot(first)} ~ {ymDot(last)}(기준일 {refDate.replaceAll('-', '.')}) · 통계누리 주택건설실적과 다른 출처입니다.</p>
        </InfoTip>
        <ScopeChip scope={scope} source="정책 진행 자료" title="HOME 9·7 승인 연결 사업의 단계 사건 월 증가분" />
        <div className={phgroup}>
          <ul className={cn(legend, 'm-0 list-none p-0')} aria-label="범례 · 실적 지표">{HOME_LINES.map(([k, label, color]) => <li key={k}><Key line sw={METRIC_COLOR[color]}>{label}</Key></li>)}</ul>
          <span className={pacts}><PanelLink href={`/projects?policy=97${sido === 'all' ? '' : `&sido=${sido}`}`} full={`9·7 연결 사업 목록(${scope})`}>9·7 사업</PanelLink></span>
        </div>
      </div>
      <div className="mt-3 flex flex-1 flex-col">
        <MonthLines months={months} lines={lines} provisional={[]} href={(ym) => `/month/${ym}`} label={`HOME 9·7 연결 사업(${scope}) 월별 인허가·착공·분양·모집·준공 증가분(호), ${ymDot(first)}부터 ${ymDot(last)}까지`} board />
      </div>
    </Card>
  );
}
