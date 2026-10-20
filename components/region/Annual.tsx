/* 지역 공급 ② 지난 공급 실적: 고른 범위(수도권·전국·시도)의 연도별 막대 + 수도권·전국이면 시도 × 연도 표. 지표 칩(인허가·착공·모집·준공)은 주소 ?metric=.
   통계누리 '분양' 실적(입주자 모집 승인 기준)은 화면 전체에서 리본 ④와 같은 '모집'으로 부른다. 연도 범위가 시도마다 달라(수도권 2018~, 나머지 2022~) 차트 아래 한 줄로 밝힌다.
   서울·인천·경기는 2018~2021 을 HOME 통계(통계누리 시도 자료)로 앞에 잇는다(lib/board/region.ts regionYears). 부분 연도는 옅은 막대·머리글 기간 표기, 전년 대비는 완결 연도만. */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from 'cn';
import { PanelHead, SrcLink, SubTitle, sub } from '@/components/page';
import { Card } from '@/components/ui/card';
import InfoTip from '@/components/ui/info-tip';
import ScopeChip from '@/components/ui/scope-chip';
import { DataGrid } from '@/components/ui/data-grid';
import { METRIC_COLOR } from '@/components/charts/palette';
import YearBars from '@/components/charts/YearBars';
import { spanLabel } from '@/lib/board/annual';
import { METRICS, NATION, ymDot } from '@/lib/board/calc';
import { METRO, NATION_FROM, metroYears, regionYears, type AnnualDoc } from '@/lib/board/region';
import type { Metric, Molit } from '@/lib/board/types';
import type { Col, Row } from '@/lib/grid/spec';

export const METRIC_NAME: Record<Metric, string> = { permit: '인허가', start: '착공', sale: '모집', complete: '준공' };
/* 고른 지표 탭 밑줄·글자색 = 같은 6단계 글자색(인허가·착공·모집·준공) */
const METRIC_INK: Record<Metric, string> = { permit: '[--tab-c:var(--st-permit-ink)]', start: '[--tab-c:var(--st-build-ink)]', sale: '[--tab-c:var(--st-sale-ink)]', complete: '[--tab-c:var(--st-soon-ink)]' };
const METRIC_TIP: Partial<Record<Metric, string>> = { sale: '통계누리 분양 실적(공동주택 입주자 모집 승인 기준) — 리본 ④모집과 같은 단계' };
export const parseMetric = (v?: string): Metric => ((METRICS as string[]).includes(v ?? '') ? (v as Metric) : 'complete');

/* sggName: 지역 공급에서 고른 시군구(있으면 머리에 '시도 단위 자료' 표지 — 이 패널은 시군구로 거를 자료가 없다) */
type Props = { molit: Molit; annual: AnnualDoc; sido: string; metric: Metric; order: string[]; sidoName: (c: string) => string; href: (p: { sido?: string; metric?: Metric }) => string; sggName?: string | null };

export default function Annual({ molit, annual, sido, metric, order, sidoName, href, sggName }: Props) {
  const name = METRIC_NAME[metric], color = METRIC_COLOR[metric], rname = sido === 'metro' ? '수도권' : sido ? sidoName(sido) : '전국';
  const metro = sido === 'metro';
  const { years, spliced } = metro ? { years: metroYears(molit, annual, metric), spliced: true } : regionYears(molit, annual, metric, sido);
  const last = years[years.length - 1];
  const part = last && !last.complete && last.value !== null ? last : null;
  const months = molit.months;
  const srcTip = `통계누리 주택건설실적통계 ${ymDot(months[0])}~${ymDot(months[months.length - 1])}(${ymDot(molit.provisional[0])}~ 잠정치)${spliced ? ` · 2018~2021은 정책 진행 자료(HOME)에 담긴 통계누리 서울·인천·경기 시도 자료(${annual.edition.slice(0, 4)}.${annual.edition.slice(4, 6)}.${annual.edition.slice(6, 8)} 판) — 2022~2025 값이 통계누리와 같음` : ''}`;

  /* 수도권·전국일 때 시도 × 연도 표(맨 위 합계 행 고정). 모든 칸이 비어 있는 해(열)는 그리지 않는다 */
  let table: ReactNode = null;
  if (!sido || metro) {
    const head = metro ? 'metro' : NATION;
    const rowsOf = [head, ...(metro ? METRO : order)].map((code) => ({ code, ys: code === 'metro' ? years : regionYears(molit, annual, metric, code === NATION ? '' : code).years }));
    const cols: Col[] = [
      { key: 'name', label: '시도', kind: 'text' },
      ...rowsOf[0].ys.filter((y) => rowsOf.some((r) => r.ys.find((v) => v.year === y.year)?.value != null))
        .map((y) => ({ key: `y${y.year}`, label: y.complete ? String(y.year) : `${y.year}년 ${spanLabel(y)}${y.provisional ? ' · 잠정' : ''}` })),
    ];
    const rows: Row[] = rowsOf.map(({ code, ys }) => ({
      id: code, pin: code === head ? 'top' : undefined,
      c: { name: code === NATION ? '전국' : code === 'metro' ? '수도권' : { text: sidoName(code), href: href({ sido: code, metric }) }, ...Object.fromEntries(ys.map((y) => [`y${y.year}`, y.value])) },
    }));
    table = (
      <>
        <SubTitle className="m-0" title={`호 · ${srcTip}${metro ? '' : " · 2026-07부터 광주·전남은 '전남광주'로 집계"} · 시도 이름을 누르면 그 시도`}>시도별 · 연도별 {name}</SubTitle>
        <DataGrid label={`시도별 연도별 ${name}`} cols={cols} rows={rows} />
      </>
    );
  }

  return (
    <Card render={<section aria-label="지난 공급 실적" />}>
      <PanelHead title="지난 공급 실적"
        scope={<ScopeChip scope={rname} source="통계누리" title={`통계누리 주택건설실적통계 · ${rname}`} note={sggName ? { text: '시도 단위 자료', title: `${sggName}을 골라도 ${rname} 전체 값(시군구 실적 자료 없음)` } : undefined} />} tip={`${rname} · 호 · 막대 위는 전년 대비(두 해 모두 12/12개월일 때만) · 마지막 해가 부분 연도면 옅은 막대 · ${srcTip}`}>
        <div className="ui-tabs ui-tabs-line" role="group" aria-label="지표">
          {METRICS.map((k) => <Link key={k} href={href({ sido, metric: k })} scroll={false} aria-current={k === metric ? 'true' : undefined} title={METRIC_TIP[k]} className={METRIC_INK[k]}>{METRIC_NAME[k]}</Link>)}
        </div>
        <ul className="m-0 flex list-none flex-wrap items-center gap-x-2.5 gap-y-0.5 p-0 text-sm text-muted-foreground" aria-label="범례">
          <li className="flex items-center gap-1 whitespace-nowrap"><i className="block size-[9px] flex-none rounded-chip" style={{ background: color }} aria-hidden="true" />완결 연도</li>
          {part ? <li className="flex items-center gap-1 whitespace-nowrap" title={`부분 연도 · ${part.months}/12개월${part.provisional ? ' · 잠정치 포함' : ''}`}><i className="block size-[9px] flex-none rounded-chip border border-dashed" style={{ borderColor: color, background: `color-mix(in srgb,${color} 38%,var(--card))` }} aria-hidden="true" />{part.year}년 {spanLabel(part)}{part.provisional ? ' · 잠정' : ''}</li> : null}
        </ul>
        <InfoTip label="연도 범위·출처">
          <p>
            {spliced ? <><span title="HOME — 국토교통부 정책·LH·SH·GH 원천을 모은 팀 자료(2018~2021 시도 통계)">{`${years[0]?.year}~${NATION_FROM - 1}년은 정책 진행 자료에 담긴 같은 통계누리 시도 자료`}</span>{`, ${NATION_FROM}년부터 통계누리 월 자료`}</> : `${NATION_FROM}년부터(통계누리 월 자료 — ${months[0].slice(0, 4)}년은 ${Number(months[0].slice(5))}월부터라 뺌) · 서울·인천·경기는 2018년부터(수도권 칩)`}
            {part ? ` · ${part.year}년은 ${spanLabel(part)}만${part.provisional ? '(잠정치 포함)' : ''}` : ''}
          </p>
        </InfoTip>
        <SrcLink />
      </PanelHead>
      <p className={cn(sub, 'm-0 mb-2')}>연도별 {name}</p>
      {/* 차트 틀은 이 카드 안이라 테두리·바탕을 걷는다(카드 안 카드 금지). 좁은 폭에서는 전년 대비 꼬리표를 하나 걸러 숨겨 겹치지 않게(값은 막대 툴팁·아래 표에 있다) */}
      <div className="[&_[data-slot=chart-frame]]:rounded-none [&_[data-slot=chart-frame]]:border-0 [&_[data-slot=chart-frame]]:bg-transparent max-[720px]:[&_[data-slot=chart-frame]_span[style*=bottom]:nth-of-type(even)]:invisible">
        <YearBars series={years} color={color} label={`${rname} 연도별 ${name} 호수, ${years[0]?.year}년부터 ${ymDot(months[months.length - 1])}까지`} />
      </div>
      {table ? <div className="mt-5">{table}</div> : null}
    </Card>
  );
}
