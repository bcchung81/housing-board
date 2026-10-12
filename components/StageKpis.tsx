/* 실적 KPI 를 공급 6단계 6칸에 놓는다(계획서 11절 "6단계가 아닌 3단·4단 표기를 고쳐"). 지표가 있는 단계는 Kpi(머리 '04 건설(착공)'),
   없는 단계(01 정책·02 사업화, 시행주체별 화면의 05 공급)는 점선 칸에 '—'(이유 '자료 없음 — …'는 title). 대응은 lib/board/stages.ts 의 METRIC_STAGE.
   시점(when)은 칸마다 되풀이하지 않고 묶음의 title·aria-label 에 한 번 둔다(화면의 기준 달은 머리글 오른쪽). 1100px 이하는 3칸, 520px 이하는 2칸씩. */
import type { ReactNode } from 'react';
import { Kpi } from './ui';
import { METRIC_COLOR } from './charts/palette';
import { METRIC_LABEL, METRIC_STAGE, STAGES } from '../lib/board/stages';
import type { Metric } from '../lib/board/types';

type Cell = { value: ReactNode; sub?: ReactNode };

export const stageLabel = (k: Metric) => {
  const s = STAGES.find((x) => x.code === METRIC_STAGE[k])!;
  return `${s.code} ${s.name}${METRIC_LABEL[k] === s.name ? '' : `(${METRIC_LABEL[k]})`}`;
};

export default function StageKpis({ cells, when, notes }: { cells: Partial<Record<Metric, Cell>>; when: string; notes?: Partial<Record<string, string>> }) {   // notes: 비는 단계의 까닭(단계 번호별), 없으면 '통계누리에 없는 단계'
  const ks = Object.keys(cells) as Metric[];
  return (
    <section data-slot="stage-kpis" className="grid grid-cols-6 gap-2.5 narrow:grid-cols-3 phone:grid-cols-2" aria-label={`공급 6단계별 실적 · ${when}`} title={`공급 6단계별 실적 · ${when}`}>
      {STAGES.map((s) => {
        const k = ks.find((m) => METRIC_STAGE[m] === s.code);
        if (k) return <Kpi key={s.code} label={stageLabel(k)} tone={METRIC_COLOR[k]} value={cells[k]!.value} sub={cells[k]!.sub} />;
        const why = `자료 없음 — ${notes?.[s.code] ?? '통계누리에 없는 단계'}`;
        return (
          <div key={s.code} className="flex min-w-0 flex-col gap-1.5 rounded-[12px] border border-dashed border-line2 bg-muted px-4 py-3.5 text-muted-foreground" title={why}>
            <span className="flex items-center gap-1.5 text-[14px]"><i className="block size-[9px] rounded-[3px] border-[1.5px] border-dashed border-line2" aria-hidden="true" />{s.code} {s.name}</span>
            <b className="font-display text-[30px] leading-[1.2] font-normal" aria-label={why}>—</b>
          </div>
        );
      })}
    </section>
  );
}
