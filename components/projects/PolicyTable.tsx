/* 보고자료 '정책별 진행' 표: 정책 × 리본 6칸의 확인/목표(policy-progress samePeriod). 단계 목표 계산이 없는 정책(1·29·8·13)은 칸을 합쳐 '비교 자료 없음'.
   마지막 칸은 범위(연결 사업의 시도)와 연결 상태(검토 중·확정) 배지. 칸 설명은 title. 칸에 막대가 있어 DataGrid 대신 표를 직접 그린다. */
import Link from 'next/link';
import { Badge } from '../ui/badge';
import { HATCH } from '../ui/chips';
import { PolicyStageCell } from './PolicyStages';
import { BOARD_CIR, BOARD_COLOR, BOARD_NAMES, type StageCell } from '../../lib/board/projects-view';
import { cn } from 'cn';

export type PolicyLine = { key: string; short: string; name: string; projects: number; units: number; cells: StageCell[] | null; scope: string; review: number; confirmed: number };

const TH = 'sticky top-0 border-b border-border bg-muted px-2.5 py-2.5 text-left text-[14px] font-bold whitespace-nowrap text-muted-foreground';
const TD = 'border-b border-border px-2.5 py-2.5 text-left align-top';
const ZEBRA = 'bg-[color-mix(in_srgb,var(--pn2)_45%,var(--card))]';

export default function PolicyTable({ lines }: { lines: PolicyLine[] }) {
  const f = (n: number) => n.toLocaleString('en-US');
  return (
    <div data-slot="table-container" className="mt-2 overflow-x-auto rounded-[10px] border border-border">
      <table aria-label="정책별 6단계 확인/목표" className="w-full border-collapse text-[16px] leading-[1.6] tabular-nums">
        <thead>
          <tr>
            <th scope="col" className={TH}>정책</th>
            {BOARD_NAMES.map((n, i) => <th key={n} scope="col" className={TH}><span className="inline-flex items-center gap-1.5"><i className="block size-[9px] rounded-[2px]" style={{ background: BOARD_COLOR[i] }} aria-hidden="true" />{BOARD_CIR[i]} {n}</span></th>)}
            <th scope="col" className={TH}>범위 · 연결</th>
          </tr>
        </thead>
        <tbody className="[&_tr:last-child_td]:border-b-0">
          {lines.map((l, r) => (
            <tr key={l.key} className={r % 2 ? ZEBRA : 'bg-card'}>
              <td className={TD}>
                <Link href={`/projects?policy=${l.key}`} title={`${l.name} — 사업 렌즈로 보기`} className="font-display text-[18px] font-normal text-foreground no-underline hover:underline">{l.short}</Link>
                <span className="block text-[13px] whitespace-nowrap text-muted-foreground">사업 {f(l.projects)}건 · {f(l.units)}호</span>
              </td>
              {l.cells ? l.cells.map((c) => <td key={c.key} className={TD}><PolicyStageCell c={c} /></td>) : (
                <td colSpan={6} className={TD} title="단계 목표 계산은 9·7 정책 전체 범위만 있습니다(HOME policy_delivery) — 이 정책은 비교할 목표 자료가 없습니다">
                  <span className={cn('block h-[8px] border border-line2', HATCH)} aria-hidden="true" />
                  <span className="text-[13px] text-muted-foreground">비교 자료 없음</span>
                </td>
              )}
              <td className={TD}>
                <span className="flex flex-wrap gap-1">
                  <Badge title={`범위: 이 정책에 연결된 사업은 ${l.scope}에만 있습니다`}>{l.scope}</Badge>
                  <Badge title="정책–사업 연결 상태 · 검토 중은 담당자 확인 전 제안, 해제된 연결은 빠짐">{`검토 중 ${f(l.review)} · 확정 ${f(l.confirmed)}`}</Badge>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
