/* 실적 KPI 를 공급 6단계 6칸에 놓는다(계획서 11절 "6단계가 아닌 3단·4단 표기를 고쳐"). 단계 이름은 화면 전체와 같은 리본 이름(①계획~⑥입주 — 통계누리 인허가 ② · 착공 ③ · 분양 ④모집 · 준공 ⑤).
   없는 단계(①계획·⑥입주, 시행주체별 화면의 ④모집)는 점선 칸에 '—'(이유 '자료 없음 — …'는 title). 대응은 lib/board/stages.ts 의 METRIC_BOARD.
   시점(when)은 칸마다 되풀이하지 않고 묶음의 title·aria-label 에 한 번 둔다(화면의 기준 달은 머리글 오른쪽). 1100px 이하는 3칸, 520px 이하는 2칸씩. */
import type { ReactNode } from 'react';
import { Kpi } from './ui';
import { METRIC_COLOR } from './charts/palette';
import { METRIC_BOARD, metricBoardLabel } from '../lib/board/stages';
import { CIR, K } from '../lib/board/sample';
import type { Metric } from '../lib/board/types';

type Cell = { value: ReactNode; sub?: ReactNode };

export const stageLabel = (k: Metric) => metricBoardLabel(k);

export default function StageKpis({ cells, when, notes }: { cells: Partial<Record<Metric, Cell>>; when: string; notes?: Partial<Record<number, string>> }) {   // notes: 비는 칸의 까닭(리본 칸 번호 0~5별), 없으면 '통계누리에 없는 단계'
  const ks = Object.keys(cells) as Metric[];
  return (
    <section data-slot="stage-kpis" className="grid grid-cols-6 gap-2.5 narrow:grid-cols-3 phone:grid-cols-2" aria-label={`공급 6단계별 실적 · ${when}`} title={`공급 6단계별 실적 · ${when}`}>
      {K.map((name, i) => {
        const k = ks.find((m) => METRIC_BOARD[m] === i);
        if (k) return <Kpi key={name} label={stageLabel(k)} tone={METRIC_COLOR[k]} value={cells[k]!.value} sub={cells[k]!.sub} />;
        const why = `자료 없음 — ${notes?.[i] ?? '통계누리에 없는 단계'}`;
        return (
          <div key={name} className="flex min-w-0 flex-col gap-1.5 rounded-[12px] border border-dashed border-line2 bg-muted px-4 py-3.5 text-muted-foreground" title={why}>
            <span className="flex items-center gap-1.5 text-[14px]"><i className="block size-[9px] rounded-[3px] border-[1.5px] border-dashed border-line2" aria-hidden="true" />{CIR[i]} {name}</span>
            <b className="font-display text-[30px] leading-[1.2] font-normal" aria-label={why}>—</b>
          </div>
        );
      })}
    </section>
  );
}
