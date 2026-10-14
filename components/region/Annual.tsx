/* 지역 공급 ② 지난 공급 실적: 고른 시도(또는 전국)의 연도별 막대 + 전국일 때만 시도 × 연도 표. 지표 칩(인허가·착공·분양·준공)은 주소 ?metric=.
   서울·인천·경기는 2018~2021 을 HOME 통계(통계누리 시도 자료)로 앞에 잇는다(lib/board/region.ts regionYears). 부분 연도는 옅은 막대·머리글 기간 표기, 전년 대비는 완결 연도만. */
import type { ReactNode } from 'react';
import { PanelHead, SrcLink, SubTitle } from '../page';
import { Card } from '../ui/card';
import { DataGrid } from '../ui/data-grid';
import { Chip, ChipGroup } from '../ui/chips';
import { METRIC_COLOR } from '../charts/palette';
import YearBars from '../charts/YearBars';
import { spanLabel } from '../../lib/board/annual';
import { METRICS, NATION, ymDot } from '../../lib/board/calc';
import { regionYears, type AnnualDoc } from '../../lib/board/region';
import type { Metric, Molit } from '../../lib/board/types';
import type { Col, Row } from '../../lib/grid/spec';

export const METRIC_NAME: Record<Metric, string> = { permit: '인허가', start: '착공', sale: '분양', complete: '준공' };
export const parseMetric = (v?: string): Metric => ((METRICS as string[]).includes(v ?? '') ? (v as Metric) : 'complete');

type Props = { molit: Molit; annual: AnnualDoc; sido: string; metric: Metric; order: string[]; sidoName: (c: string) => string; href: (p: { sido?: string; metric?: Metric }) => string };

export default function Annual({ molit, annual, sido, metric, order, sidoName, href }: Props) {
  const name = METRIC_NAME[metric], color = METRIC_COLOR[metric], rname = sido ? sidoName(sido) : '전국';
  const { years, spliced } = regionYears(molit, annual, metric, sido);
  const last = years[years.length - 1];
  const part = last && !last.complete && last.value !== null ? last : null;
  const months = molit.months;
  const srcTip = `통계누리 주택건설실적통계 ${ymDot(months[0])}~${ymDot(months[months.length - 1])}(${ymDot(molit.provisional[0])}~ 잠정치)${spliced ? ` · 2018~2021은 HOME 통계(통계누리 서울·인천·경기 시도 자료, 덤프 ${annual.edition}) — 2022~2025 값이 통계누리와 같음` : ''}`;

  /* 전국일 때만 시도 × 연도 표. 모든 칸이 비어 있는 해(열)는 그리지 않는다 */
  let table: ReactNode = null;
  if (!sido) {
    const nation = regionYears(molit, annual, metric, '');
    const rowsOf = [NATION, ...order].map((code) => ({ code, ys: regionYears(molit, annual, metric, code === NATION ? '' : code).years }));
    const cols: Col[] = [
      { key: 'name', label: '시도', kind: 'text' },
      ...nation.years.filter((y) => rowsOf.some((r) => r.ys.find((v) => v.year === y.year)?.value != null))
        .map((y) => ({ key: `y${y.year}`, label: y.complete ? String(y.year) : `${y.year} · ${spanLabel(y)}${y.provisional ? ' 잠정' : ''}` })),
    ];
    const rows: Row[] = rowsOf.map(({ code, ys }) => ({
      id: code, pin: code === NATION ? 'top' : undefined,
      c: { name: code === NATION ? '전국' : { text: sidoName(code), href: href({ sido: code, metric }) }, ...Object.fromEntries(ys.map((y) => [`y${y.year}`, y.value])) },
    }));
    table = (
      <>
        <SubTitle className="m-0" title={`호 · ${srcTip} · 2026-07부터 광주·전남은 '전남광주'로 집계 · 시도 이름을 누르면 그 시도`}>시도별 · 연도별 {name}</SubTitle>
        <DataGrid label={`시도별 연도별 ${name}`} cols={cols} rows={rows} />
      </>
    );
  }

  return (
    <Card render={<section aria-label="지난 공급 실적" />}>
      <PanelHead title={`지난 공급 실적 · 연도별 ${name}`} tip={`${rname} · 호 · 막대 위는 전년 대비(두 해 모두 12/12개월일 때만) · 마지막 해가 부분 연도면 옅은 막대 · ${srcTip}`}>
        <ChipGroup label="지표" className="[&>span:first-child]:sr-only">
          {METRICS.map((k) => <Chip key={k} href={href({ sido, metric: k })} on={k === metric} swatch={{ kind: 'fill', color: METRIC_COLOR[k] }}>{METRIC_NAME[k]}</Chip>)}
        </ChipGroup>
        <ul className="m-0 flex list-none flex-wrap items-center gap-x-2.5 gap-y-0.5 p-0 text-[13px] text-muted-foreground" aria-label="범례">
          <li className="flex items-center gap-1 whitespace-nowrap"><i className="block size-[9px] flex-none rounded-[2px]" style={{ background: color }} aria-hidden="true" />완결 연도</li>
          {part ? <li className="flex items-center gap-1 whitespace-nowrap" title={`부분 연도 · ${part.months}/12개월${part.provisional ? ' · 잠정치 포함' : ''}`}><i className="block size-[9px] flex-none rounded-[2px] border border-dashed" style={{ borderColor: color, background: `color-mix(in srgb,${color} 38%,var(--card))` }} aria-hidden="true" />{part.year} {spanLabel(part)}</li> : null}
        </ul>
        <SrcLink />
      </PanelHead>
      <YearBars series={years} color={color} label={`${rname} 연도별 ${name} 호수, ${years[0]?.year}년부터 ${ymDot(months[months.length - 1])}까지`} />
      {table ? <div className="mt-5">{table}</div> : null}
    </Card>
  );
}
