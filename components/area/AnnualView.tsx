/* 공급 실적 · 연도별(/area?period=year): 지표·지역 칩 한 줄 → KPI 3(마지막 완결 연도 · 전년 대비 · 올해 부분값) → 연도 막대 → 시도 × 연도 표.
   연간 집계·완결 판정은 lib/board/annual.ts. 자료가 2021-09 부터라 2021 은 부분 연도이고, 부분 연도는 전년 대비를 내지 않는다. */
import Link from 'next/link';
import { PanelHead, SrcLink, kpisGrid } from '../page';
import { Card } from '../ui/card';
import { DataGrid } from '../ui/data-grid';
import { Kpi, Prov } from '../ui';
import { ProvKey } from '../charts/Legend';
import { METRIC_COLOR } from '../charts/palette';
import YearBars from '../charts/YearBars';
import { annualSeries, lastCompleteYear, partialAfter, spanLabel, yoy } from '../../lib/board/annual';
import { METRICS, NATION, fmt, lastMonth } from '../../lib/board/calc';
import { METRIC_STAGE } from '../../lib/board/stages';
import type { Metric, Molit } from '../../lib/board/types';
import type { Col, Row } from '../../lib/grid/spec';

const LABEL: Record<Metric, string> = { permit: '인허가', start: '착공', complete: '준공', sale: '분양' };
export const parseMetric = (v?: string): Metric => (METRICS as string[]).includes(v ?? '') ? (v as Metric) : 'complete';

const href = (metric: Metric, region: string) => `/area?period=year&metric=${metric}${region === NATION ? '' : `&region=${region}`}`;
const chip = 'inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-[14px] font-bold whitespace-nowrap no-underline border border-border text-ink2 hover:bg-pn2 aria-[current=true]:border-primary aria-[current=true]:bg-primary aria-[current=true]:text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export default function AnnualView({ molit, metric, region }: { molit: Molit; metric: Metric; region: string }) {
  const last = lastMonth(molit), color = METRIC_COLOR[metric], rname = region === NATION ? '전국' : molit.sido.find((s) => s.code === region)!.name;
  const series = annualSeries(molit, metric, region);
  const lc = lastCompleteYear(series), cur = series.find((y) => y.year === lc), prev = series.find((y) => y.year === (lc ?? 0) - 1), part = partialAfter(series);
  const d = lc === null ? null : yoy(series, lc);
  const anyProv = series.some((y) => y.provisional);
  const years = annualSeries(molit, metric, NATION);
  const cols: Col[] = [
    { key: 'name', label: '시도', kind: 'text' },
    ...years.map((y) => ({ key: `y${y.year}`, label: y.complete ? String(y.year) : `${y.year} · ${spanLabel(y)}` })),
  ];
  const rows: Row[] = molit.sido.map((s) => {
    const ser = annualSeries(molit, metric, s.code);
    return {
      id: s.code, pin: s.code === NATION ? 'top' : undefined,
      c: { name: s.code === NATION ? '전국' : { text: s.name, href: `/area/${s.code}` }, ...Object.fromEntries(ser.map((y) => [`y${y.year}`, y.value === null ? null : y.provisional ? { text: fmt(y.value), sort: y.value, prov: true } : y.value])) },
    };
  });
  const span = `${molit.months[0]} ~ ${last}`;
  return (
    <>
      <div role="group" aria-label="거르기" className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div role="group" aria-label="지표" className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13px] text-muted-foreground">지표</span>
          {METRICS.map((k) => (
            <Link key={k} href={href(k, region)} aria-current={k === metric ? 'true' : undefined} className={chip}>
              <i className="block size-[9px] flex-none rounded-[2px]" style={{ background: METRIC_COLOR[k] }} aria-hidden="true" />{LABEL[k]}
            </Link>
          ))}
        </div>
        <div role="group" aria-label="지역" className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13px] text-muted-foreground">지역</span>
          <Link href={href(metric, NATION)} aria-current={region === NATION ? 'true' : undefined} className={chip}>전국</Link>
          <details className="group relative">
            <summary aria-current={region !== NATION ? 'true' : undefined} className={`${chip} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>{region === NATION ? '시도' : rname}<span aria-hidden="true">▾</span></summary>
            <div className="absolute top-full left-0 z-30 mt-1 grid w-[260px] grid-cols-4 gap-1 rounded-[10px] border border-border bg-card p-2 shadow-[var(--shadow-card)]">
              {molit.sido.filter((s) => s.code !== NATION).map((s) => (
                <Link key={s.code} href={href(metric, s.code)} aria-current={s.code === region ? 'true' : undefined} className={`${chip} h-7 justify-center border-0 px-1.5 text-[13px]`}>{s.name}</Link>
              ))}
            </div>
          </details>
        </div>
      </div>

      <div className={kpisGrid} aria-label="핵심 수치">
        {cur ? <Kpi label={`${cur.year} ${LABEL[metric]}(${rname})`} value={fmt(cur.value)} tone={color} sub="12/12개월" tip={`통계누리 주택건설실적통계 · ${cur.year}년 ${LABEL[metric]} 합계`} /> : null}
        {cur && prev ? (
          d === null ? <Kpi label="전년 대비" value="–" unit="" sub={`${prev.year}년이 ${prev.months}/12개월`} tip="두 해 모두 12/12개월일 때만 냅니다" />
            : <Kpi label="전년 대비" value={<span className={d >= 0 ? 'text-ok' : 'text-bad'}>{d >= 0 ? '▲' : '▼'} {Math.abs(d).toFixed(1)}</span>} unit="%" sub={`${prev.year} ${fmt(prev.value)}호`} tip={`${cur.year} ÷ ${prev.year} − 1. 두 해 모두 12/12개월일 때만 냅니다`} />
        ) : null}
        {part ? <Kpi label={`${part.year} ${spanLabel(part)}`} value={fmt(part.value)} tone={`color-mix(in srgb, ${color} 45%, var(--card))`}
          sub={<><span className="inline-block rounded-full border border-line2 px-1.5 leading-[18px]">{part.months}/12</span>{part.provisional ? <Prov /> : null}</>} tip={`부분 연도 · ${part.months}/12개월${part.provisional ? ' · 잠정치 포함' : ''}`} /> : null}
      </div>

      <Card render={<section aria-label="연도별 차트" />}>
        <PanelHead title={`연도별 ${LABEL[metric]} · ${rname}`} tip={`호 · ${span} · 막대 위는 전년 대비(완결 연도만) · 옅은 막대는 부분 연도(자료가 ${molit.months[0]}부터라 ${molit.months[0].slice(0, 4)}은 ${Number(molit.months[0].slice(5))}월부터) · 통계누리 주택건설실적통계${anyProv ? ` · ${last.slice(0, 4)}-01~${last.slice(5)}은 잠정치` : ''}`}>
          <ul className="m-0 flex list-none flex-wrap items-center gap-x-2.5 p-0 text-[13px] text-muted-foreground" aria-label="범례">
            <li className="flex items-center gap-1"><i className="block size-[9px] rounded-[2px]" style={{ background: color }} aria-hidden="true" />완결 연도</li>
            <li className="flex items-center gap-1"><i className="block size-[9px] rounded-[2px] border border-dashed" style={{ borderColor: color, background: `color-mix(in srgb, ${color} 34%, var(--card))` }} aria-hidden="true" />부분 연도</li>
          </ul>
          {anyProv ? <ProvKey /> : null}
          <SrcLink />
        </PanelHead>
        <YearBars series={series} color={color} label={`${rname} 연도별 ${LABEL[metric]} 호수, ${series[0].year}년부터 ${last.slice(0, 4)}년 ${Number(last.slice(5))}월까지`} />
      </Card>

      <Card render={<section aria-label="시도별 연도별 표" />}>
        <PanelHead title={`시도별 · 연도별 ${METRIC_STAGE[metric]} ${LABEL[metric]}`} tip={`호 · 2026-07부터 광주·전남은 '전남광주'로 집계, 이전 달은 두 곳을 합산 · 부분 연도 열은 머리글의 기간만 합친 값${anyProv ? ` · ${last.slice(0, 4)}년은 잠정치` : ''}`} />
        <DataGrid label={`시도별 연도별 ${LABEL[metric]}`} cols={cols} rows={rows} />
      </Card>
    </>
  );
}
