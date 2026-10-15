import PanelLink from './PanelLink';
/* 종합상황판의 실데이터 위젯: 월별 실적 흐름(전국). 서버 컴포넌트가 data/board 의 값을 읽어 그린다. Board 가 시도 카드와 같은 줄에 둔다. */
import { Card } from '../ui/card';
import ScopeChip from '../ui/scope-chip';
import InfoTip from '../ui/info-tip';
import StageLegend from '../charts/StageLegend';
import MonthLines from '../charts/MonthLines';
import { METRIC_COLOR } from '../charts/palette';
import { METRICS, NATION, isProvisional, lastMonth, monthLabel, seriesOf, ymDot } from '../../lib/board/calc';
import { getBoardData } from '../../lib/board/data';
import { pacts, phead, phgroup, ptitle } from './styles';

/* 통계누리 '분양' 실적(입주자 모집 승인 기준)은 리본 ④와 같은 말 '모집'으로 부른다 */
const LABEL = { permit: '인허가', start: '착공', complete: '준공', sale: '모집' } as const;

export default async function RealPanels() {
  const { molit } = await getBoardData();
  const last = lastMonth(molit);
  const lines = METRICS.map((k) => ({ key: k, label: LABEL[k], color: METRIC_COLOR[k], values: seriesOf(molit, k, NATION).total }));
  return (
    <Card variant="board" render={<section id="p-actual" aria-label="월별 실적 흐름" />}>
      <div className={phead}>
        <h2 className={ptitle} title={`국토교통 통계누리 주택건설실적통계 · 전국 · 호 · ${ymDot(molit.months[0])} ~ ${ymDot(last)}`}>월별 실적 흐름</h2>
        <InfoTip label="월별 실적 흐름 기준" className="-ml-2">
          <p>국토교통 통계누리 주택건설실적통계(전국, 단위 호) — 사업 원장과 다른 출처입니다. 세로축 숫자도 호(20만 = 20만 호).</p>
          <p>자료 {ymDot(molit.months[0])} ~ {ymDot(last)}, 빗금은 잠정치{isProvisional(molit, last) ? '(2026.01~)' : ''}. 그래프의 달을 누르면 월 상세로 내려갑니다.</p>
        </InfoTip>
        <ScopeChip scope="전국" source="통계누리" title="국토교통 통계누리 주택건설실적통계(전국) — 사업 원장과 다른 출처" />
        <div className={phgroup}>
          <span data-slot="actual-unit" className="text-[12px] whitespace-nowrap text-muted-foreground" title="세로축 숫자의 단위(20만 = 20만 호)">단위 호</span>
          <StageLegend metrics={METRICS} names="board" compact />
          <span className={pacts}><PanelLink href="/region?sido=all" full="지역별 실적(전국)">지역별</PanelLink><PanelLink href={`/month/${last}`} full={`${monthLabel(last)} 월 상세`}>{Number(last.slice(5))}월</PanelLink></span>
        </div>
      </div>
      <MonthLines months={molit.months} lines={lines} provisional={molit.provisional} href={(ym) => `/month/${ym}`} label={`전국 월별 인허가·착공·모집·준공 호수, ${ymDot(molit.months[0])}부터 ${ymDot(last)}까지`} board />
    </Card>
  );
}
