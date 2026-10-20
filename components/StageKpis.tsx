/* 실적 KPI 를 공급 6단계 이름으로 놓는다(계획서 11절 "6단계가 아닌 3단·4단 표기를 고쳐"). 단계 이름은 화면 전체와 같은 리본 이름(①계획~⑥입주 — 통계누리 인허가 ② · 착공 ③ · 분양 ④모집 · 준공 ⑤).
   값 있는 단계만 카드로 놓고 남은 폭을 채운다(auto-fit). 값 없는 단계(①계획·⑥입주, 시행주체별 화면의 ④모집)는 칸을 따로 두지 않고 칩 하나('자료 없음 ①·④·⑥')로 합치며,
   이유는 칩의 (i) 팝오버(키보드로도 열림)에 둔다(2026-10-16 3차 평가: 빈 '—' 칸 셋이 1920 에서 폭만 차지). 대응은 lib/board/stages.ts 의 METRIC_BOARD.
   값은 20/700 으로 고정한다(월·기관 상세가 같은 타일 규격 — Kpi 의 칸 폭별 크기를 [&_b] 로 덮는다).
   시점(when)은 칸마다 되풀이하지 않고 묶음의 title·aria-label 에 한 번 둔다(화면의 기준 달은 머리글 오른쪽). */
import { Fragment, type ReactNode } from 'react';
import { Kpi } from './ui';
import InfoTip from './ui/info-tip';
import { METRIC_COLOR } from './charts/palette';
import { METRIC_BOARD, metricBoardLabel } from '@/lib/board/stages';
import { CIR, K } from '@/lib/board/sample';
import type { Metric } from '@/lib/board/types';

type Cell = { value: ReactNode; sub?: ReactNode };

export const stageLabel = (k: Metric) => metricBoardLabel(k);

export default function StageKpis({ cells, when, notes }: { cells: Partial<Record<Metric, Cell>>; when: string; notes?: Partial<Record<number, string>> }) {   // notes: 값 없는 단계의 까닭(리본 칸 번호 0~5별), 없으면 '통계누리에 없는 단계'
  const ks = Object.keys(cells) as Metric[];
  const empty = K.flatMap((_, i) => (ks.some((m) => METRIC_BOARD[m] === i) ? [] : [i]));   // 값 없는 단계(리본 칸 번호)
  return (
    <section data-slot="stage-kpis" className="flex flex-col gap-1.5" aria-label={`공급 6단계별 실적 · ${when}`} title={`공급 6단계별 실적 · ${when}`}>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-2.5 [&_b]:text-lg!">
        {K.map((name, i) => {
          const k = ks.find((m) => METRIC_BOARD[m] === i);
          return k ? <Kpi key={name} label={stageLabel(k)} tone={METRIC_COLOR[k]} value={cells[k]!.value} sub={cells[k]!.sub} /> : null;
        })}
      </div>
      {empty.length ? (
        <div data-slot="stage-kpis-empty">
          <InfoTip label="자료 없는 단계" text={`자료 없음 ${empty.map((i) => CIR[i]).join('·')}`} className="text-sm">
            <dl>{empty.map((i) => <Fragment key={i}><dt>{CIR[i]} {K[i]}</dt><dd>{notes?.[i] ?? '통계누리에 없는 단계'}</dd></Fragment>)}</dl>
          </InfoTip>
        </div>
      ) : null}
    </section>
  );
}
