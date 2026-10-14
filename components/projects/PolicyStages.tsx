/* 정책 6단계 목표 대비 확인(data/board/policy-progress.json 의 samePeriod — 같은 해 1월~기준 달). 사업 목록 요약(막대 6줄)과 보고자료 정책 표(칸 하나)가 같이 쓴다.
   상태 4가지(HOME 개념 흡수 계획 3절): 확인 = 단계색 실색 · 목표(예정) = 같은 색 옅게 · 미확보·목표 없음 = 빗금 · 목표 미달 = 빨간 테두리. 숫자 설명은 title. */
import { cn } from 'cn';
import { HATCH } from '../ui/chips';
import { BOARD_CIR, BOARD_COLOR, BOARD_NAMES, stageCellTip, type StageCell } from '../../lib/board/projects-view';

const f = (n: number) => n.toLocaleString('en-US');
const light = (c: string, p = 30) => `color-mix(in srgb,${c} ${p}%,var(--card))`;

/* 범례(카드 머리 줄 오른쪽) */
export function StateLegend() {
  const items = [
    { label: '확인', cls: 'bg-mute', tip: '원천에서 확인한 호수(단계색 실색)' },
    { label: '목표', cls: '', style: { background: 'color-mix(in srgb,var(--mute) 30%,var(--card))' }, tip: '같은 기간 목표 호수(같은 색 옅게)' },
    { label: '미확보', cls: `border border-line2 ${HATCH}`, tip: '목표나 확인 원천이 없음(빗금)' },
    { label: '목표 미달', cls: 'border-[1.5px] border-bad', tip: '확인이 같은 기간 목표에 못 미침(빨간 테두리)' },
  ];
  return (
    <ul className="m-0 flex list-none flex-wrap items-center gap-x-2.5 gap-y-0.5 p-0 text-[13px] text-muted-foreground" aria-label="범례">
      {items.map((x) => <li key={x.label} className="flex items-center gap-1 whitespace-nowrap" title={x.tip}><i className={cn('block size-[9px] flex-none rounded-[2px]', x.cls)} style={x.style} aria-hidden="true" />{x.label}</li>)}
    </ul>
  );
}

/* 막대 하나: 목표 = 칸 전체(옅게), 확인 = 목표 대비 길이(실색). 목표 없음·확인 미확보는 빗금 */
function Track({ c, className }: { c: StageCell; className?: string }) {
  const color = BOARD_COLOR[c.board];
  const label = c.state === 'none' ? '목표 없음' : c.state === 'noTarget' ? `확인 ${f(c.actual!)}호, 목표 없음` : c.state === 'noActual' ? `목표 ${f(c.target!)}호, 확인 미확보` : `확인 ${f(c.actual!)}호 / 목표 ${f(c.target!)}호${c.state === 'short' ? ', 목표 미달' : ''}`;
  return (
    <span role="img" aria-label={`${BOARD_NAMES[c.board]} ${label}`} className={cn('relative block', className, (c.state === 'none' || c.state === 'noTarget') && `border border-line2 ${HATCH}`)}
      style={c.state === 'noActual' ? { background: light(color) } : undefined}>
      {c.state === 'noActual' ? <span className={cn('absolute inset-0', HATCH)} /> : null}
      {c.state === 'short' || c.state === 'met' ? <>
        <span className="absolute inset-0" style={{ background: light(color) }} />
        <span className="q-grow-x absolute inset-y-0 left-0" style={{ width: `${c.fill}%`, background: color, ['--i' as string]: c.board }} />
        {c.state === 'short' ? <span className="absolute inset-0 border-[1.5px] border-bad" /> : null}
      </> : null}
    </span>
  );
}
function Value({ c, size = 15 }: { c: StageCell; size?: number }) {
  const b = (t: string, bad?: boolean) => <b className={cn('text-foreground', bad && 'text-bad')} style={{ fontSize: size }}>{t}</b>;
  if (c.state === 'none') return <>목표 없음</>;
  if (c.state === 'noTarget') return <>{b(f(c.actual!))} / 목표 없음</>;
  if (c.state === 'noActual') return <>미확보 / {f(c.target!)}</>;
  return <>{b(f(c.actual!), c.state === 'short')} / {f(c.target!)}</>;
}

/* 사업 목록 요약: 6줄(단계 | 막대 | 확인/목표) */
export function PolicyStageBars({ cells }: { cells: StageCell[] }) {
  return (
    <div className="mt-3 grid grid-cols-[86px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5">
      {cells.map((c) => (
        <div key={c.key} className="col-span-full grid grid-cols-subgrid items-center" title={stageCellTip(c)}>
          <span className="flex items-center gap-1.5 text-[14px] whitespace-nowrap"><i className="block size-[9px] flex-none rounded-[2px]" style={{ background: BOARD_COLOR[c.board] }} aria-hidden="true" />{BOARD_CIR[c.board]} {BOARD_NAMES[c.board]}</span>
          <Track c={c} className="h-[14px]" />
          <span className="text-right text-[13px] whitespace-nowrap text-muted-foreground tabular-nums"><Value c={c} /></span>
        </div>
      ))}
    </div>
  );
}

/* 보고자료 표의 칸 하나: 얇은 막대 + 확인/목표 */
export function PolicyStageCell({ c }: { c: StageCell }) {
  return (
    <div className="flex min-w-[96px] flex-col gap-1" title={stageCellTip(c)}>
      <Track c={c} className="h-[8px]" />
      <span className="text-[13px] whitespace-nowrap text-muted-foreground tabular-nums"><Value c={c} size={14} /></span>
    </div>
  );
}
