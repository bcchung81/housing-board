import PanelLink from './PanelLink';
/* 종합상황판의 실데이터 위젯(HOME 집계가 없을 때 — 있으면 Board 가 지역 탭 값으로 HomeActual 을 그린다, 2026-10-21): 월별 실적 흐름(통계누리 합계 자리 '00' — 화면 범위 수도권이면 서울+인천+경기 합, lib/board/data.ts). 서버 컴포넌트가 data/board 의 값을 읽어 그린다. Board 가 시도 카드와 같은 줄에 둔다. */
import { cn } from 'cn';
import { Card } from '@/components/ui/card';
import ScopeChip from '@/components/ui/scope-chip';
import InfoTip from '@/components/ui/info-tip';
import MonthLines from '@/components/charts/MonthLines';
import { METRIC_COLOR } from '@/components/charts/palette';
import { METRICS, NATION, isProvisional, lastMonth, monthLabel, seriesOf, sidoName, ymDot } from '@/lib/board/calc';
import { METRIC_LABEL } from '@/lib/board/stages';
import { CIR, K } from '@/lib/board/sample';
import { Key } from './tags';
import { getBoardData } from '@/lib/board/data';
import { legend, pacts, panel, phead, phgroup, pinfo, ptitle } from './styles';

/* 통계누리 '분양' 실적(입주자 모집 승인 기준)은 리본 ④와 같은 말 '모집'으로 부른다 */
const LABEL = { permit: '인허가', start: '착공', complete: '준공', sale: '모집' } as const;
/* 범례 title: 리본 6단계 중 지표가 있는 자리(②인허가 ③착공 ④모집(분양) ⑤준공, ①계획·⑥입주는 통계누리에 없음) — components/charts/StageLegend 의 compact 와 같은 글 */
const ON_BOARD = { permit: 1, start: 2, sale: 3, complete: 4 } as const;
const LEGEND_TITLE = K.map((s, i) => { const k = METRICS.find((m) => ON_BOARD[m] === i); return `${CIR[i]}${s}${k ? (METRIC_LABEL[k] !== s ? `(${METRIC_LABEL[k]})` : '') : ' 자료 없음'}`; }).join(' · ');

export default async function RealPanels() {
  const { molit } = await getBoardData();
  const last = lastMonth(molit), area = sidoName(molit, NATION) ?? '전국';   // 범위 이름(합계 자리의 이름 — 수도권)
  const lines = METRICS.map((k) => ({ key: k, label: LABEL[k], color: METRIC_COLOR[k], values: seriesOf(molit, k, NATION).total }));
  return (
    <Card variant="section" className={panel} render={<section id="p-actual" aria-label="월별 실적 흐름" />}>
      <div className={phead}>
        <h2 className={ptitle} title={`국토교통 통계누리 주택건설실적통계 · ${area} · 단위 호(세로축 20만 = 20만 호) · ${ymDot(molit.months[0])} ~ ${ymDot(last)}`}>월별 실적 흐름</h2>
        <InfoTip label="월별 실적 흐름 기준" className={pinfo}>
          <p>국토교통 통계누리 주택건설실적통계({area}, 단위 호) — 사업 원장과 다른 출처입니다. 세로축 숫자도 호(20만 = 20만 호).</p>
          <p>자료 {ymDot(molit.months[0])} ~ {ymDot(last)}, 빗금은 잠정치{isProvisional(molit, last) ? '(2026.01~)' : ''}. 그래프의 달을 누르면 월 상세로 내려갑니다.</p>
        </InfoTip>
        <ScopeChip scope={area} source="통계누리" title={`국토교통 통계누리 주택건설실적통계(${area}) — 사업 원장과 다른 출처`} />
        <div className={phgroup}>
          <ul className={cn(legend, 'm-0 list-none p-0')} aria-label="범례 · 실적 지표" title={LEGEND_TITLE}>{METRICS.map((k) => <li key={k}><Key line sw={METRIC_COLOR[k]}>{LABEL[k]}</Key></li>)}</ul>
          <span className={pacts}><PanelLink href="/region?sido=all" full={`지역별 실적(${area})`}>지역별</PanelLink><PanelLink href={`/month/${last}`} full={`${monthLabel(last)} 월 상세`}>{Number(last.slice(5))}월</PanelLink></span>
        </div>
      </div>
      <div className="mt-3 flex flex-1 flex-col">
        <MonthLines months={molit.months} lines={lines} provisional={molit.provisional} href={(ym) => `/month/${ym}`} label={`${area} 월별 인허가·착공·모집·준공 호수, ${ymDot(molit.months[0])}부터 ${ymDot(last)}까지`} board />
      </div>
    </Card>
  );
}
