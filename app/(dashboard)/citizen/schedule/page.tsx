import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from 'cn';
import { FactNote, MetricRow, Page, PageHead, PanelHead } from '@/components/page';
import PanelLink from '@/components/board/PanelLink';
import MapLink from '@/components/board/MapLink';
import { Card } from '@/components/ui/card';
import { Chip, ChipBar, ChipGroup, ChipMenu } from '@/components/ui/chips';
import InfoTip from '@/components/ui/info-tip';
import ScopeChip from '@/components/ui/scope-chip';
import Ahead from '@/components/region/Ahead';
import MyAreaDefault from '@/components/region/MyAreaDefault';
import YearBars from '@/components/charts/YearBars';
import { METRIC_COLOR } from '@/components/charts/palette';
import calendarJson from '@/data/board/region-calendar.json';
import mapJson from '@/data/board/region-map.json';
import annualJson from '@/data/board/region-annual.json';
import { fmt, lastMonth } from '@/lib/board/calc';
import { getBoardData } from '@/lib/board/data';
import { METRO_AREAS, SIDO_SHORT, guOf } from '@/lib/board/metro-overview';
import { mapScopeHref } from '@/lib/board/map-href';
import homeJson from '@/data/board/home-projects.json';
import { applyFilters, homeRowsOf, isMetro, listHref, type Filters, type HomeDocRow } from '@/lib/board/projects-view';
import { CAL_KINDS, METRO, aheadAll, inSgg, parseKinds, parseSgg, pastDue, pickMonth, metroYears, regionYears, sggUnits, toggleKind, type AnnualDoc, type CalKind, type CalendarDoc, type RegionMapDoc } from '@/lib/board/region';
import { PUBLIC_METRICS, PUBLIC_METRIC_NAME, PUBLIC_WORDS, hoText, koMonth, parsePublicMetric, parsePublicSido, yearRank, type PublicMetric } from '@/lib/board/public-schedule';
import { distinctNames } from '@/lib/board/public-labels';
import type { YearVal } from '@/lib/board/annual';

export const metadata: Metadata = { title: '공급 일정' };

const calendar = calendarJson as unknown as CalendarDoc;
const regionMap = mapJson as unknown as RegionMapDoc;
const annual = annualJson as unknown as AnnualDoc;
const SGG_TABLE = { areas: METRO_AREAS, sidoShort: SIDO_SHORT, guOf };
const W = PUBLIC_WORDS;
const HOME_ROWS = homeRowsOf((homeJson as unknown as { rows: HomeDocRow[] }).rows).filter((r) => isMetro(r.sgg));
/* 2026-10-21 HOME PoC: 기본 종류 = 모집 공고(PoC '향후 12개월 공급(모집·분양) 예정' — region-calendar.json home.all, 정책 전체·원천 행 단위).
   준공·입주는 PoC 에 같은 값이 없어 사업 원장 예정(region-calendar.json sido)을 그대로 더해 볼 수 있게 둔다 */
const KIND_HOME: CalKind[] = ['SUPPLY_NOTICE'];
const isHomeDefault = (ks: CalKind[]) => ks.length === 1 && ks[0] === 'SUPPLY_NOTICE';
const BASE = '/citizen/schedule';
/* 시군구 메뉴를 시도 채움 탭(.ui-tabs-seg)과 같은 높이 --ctl-h · 반경 tile 로, 안 고른 메뉴는 탭 틀과 같은 --muted 면으로(사업 찾기 FindFilters 와 같은 값) */
const MENU = '[&_summary]:h-(--ctl-h) [&_summary]:rounded-tile [&_summary]:px-3';
const MENU_OFF = '[&_summary]:border-transparent [&_summary]:bg-muted';
const LINK = 'group/action inline-flex items-center gap-px rounded-chip text-meta whitespace-nowrap text-muted-foreground no-underline underline-offset-4 hover:text-primary hover:underline focus-visible:text-primary focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
/* 사업 이름: 사업 찾기와 같은 쉬운 이름 규칙(public-labels distinctNames — 'BL' 원문 없음, 겹치면 블록 표기). 예정 항목 sgg 는 '경기도 고양시 덕양구' 글자라 시도를 뗀 이름이 지역 구분에 쓰인다 */
function easyNames<T extends { id: string; name: string; sgg: string; units: number }>(xs: T[]): T[] {
  const nm = distinctNames(xs.map((e) => ({ id: e.id, name: e.name, sgg: e.sgg, u: e.units })), (s) => s.split(' ').slice(1).join(' '));
  return xs.map((e) => ({ ...e, name: nm[e.id] ?? e.name }));
}
/* 호수 글자('22만 7,976호')를 값과 단위로 나눈다(MetricRow) */
const splitHo = (t: string) => ({ value: t.replace(/\s*호$/, ''), unit: '호' });
/* 시도 칩 순서(서울·경기·인천 — 제안서 5.4) */
const CHIPS = ['11', '41', '28'];
/* 지난 몇 년 지표 탭: 고른 탭 밑줄·글자색 = 착공 짓는 중 · 준공 준공 임박 단계 글자색 */
const METRIC_INK: Record<string, string> = { start: '[--tab-c:var(--st-build-ink)]', complete: '[--tab-c:var(--st-soon-ink)]' };

type Q = { sido?: string; sgg?: string; m?: string; kind?: string; metric?: string };

/* 일반사용자 공급 일정(옛 정책 화면 /region 의 국민판, 수도권만): 지역 칩 → ① 앞으로 12개월(달 막대 + 고른 달 목록) → ② 지난 몇 년(해마다 착공·준공, 민간 포함).
   숫자는 정책 화면과 같은 함수(aheadAll·pickMonth·regionYears·metroYears)에서 나온다 — 말·열·거르기만 다르다. 제안서 5절. */
export default async function SchedulePage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const asked = q.sido !== undefined || q.sgg !== undefined;   // 주소에 지역이 있으면 내 동네로 옮기지 않는다(사업 찾기 MyAreaFirst 와 같은 쪽 판정)
  const { molit } = await getBoardData();
  const short = Object.fromEntries(molit.sido.map((s) => [s.code, s.name]));
  const sidoName = (c: string) => short[c] ?? c;
  const sido = parsePublicSido(q.sido);
  const kinds = q.kind ? parseKinds(q.kind) : [...KIND_HOME];
  const metric = parsePublicMetric(q.metric);
  const name = sido === 'metro' ? '수도권' : sidoName(sido);
  const sgg = parseSgg(regionMap, sido, SGG_TABLE, q.sgg);
  const sggName = sgg ? METRO_AREAS[sgg] : null;
  const scopeName = sggName ?? name;
  const units = sggUnits(regionMap, sido, SGG_TABLE);

  const href = (p: { sido?: string; kinds?: CalKind[]; metric?: PublicMetric; m?: string | null; sgg?: string | null }) => {
    const s = new URLSearchParams();
    const sd = p.sido ?? sido, ks = p.kinds ?? kinds, mt = p.metric ?? metric, m = p.m === undefined ? q.m : p.m;
    const sg = p.sgg !== undefined ? p.sgg : p.sido !== undefined ? null : sgg;   // 시도를 바꾸면 시군구는 풀린다
    s.set('sido', sd);   // 수도권도 적어 둔다 — 주소에 지역이 없을 때만 내 동네로 옮기기 때문
    if (sg) s.set('sgg', sg);
    if (m) s.set('m', m);
    if (!isHomeDefault(ks)) s.set('kind', ks.join(','));
    if (mt !== 'complete') s.set('metric', mt);
    return `${BASE}?${s.toString()}`;
  };

  /* ① 앞으로 12개월 — 정책 /region 과 같은 함수(aheadAll). 모집 공고 = HOME PoC 정책 전체 공급 예정(home.all), 준공·입주 = 사업 원장 예정(sido). 수도권 = 서울·인천·경기만 들어 있다 */
  const cal = { sido: Object.fromEntries(METRO.map((c) => [c, [...(calendar.home.all.sido[c] ?? []), ...(calendar.sido[c] ?? []).filter((e) => e.type !== 'SUPPLY_NOTICE')]])) };
  const all = easyNames(aheadAll(cal, sido, sidoName)).filter((e) => !sgg || inSgg(e, sgg, SGG_TABLE));
  const list = all.filter((e) => kinds.includes(e.type));
  const months = calendar.months;
  const m = pickMonth(months, list, q.m);
  const total = list.reduce((s, e) => s + e.units, 0);
  const pastN = list.filter((e) => pastDue(e, calendar.referenceDate)).length;
  const nowM = calendar.referenceDate.slice(0, 7);
  const last = lastMonth(molit);

  /* 사업 찾기·지도 연결: 사업 수 = 사업 찾기 목록과 같은 HOME PoC 행(정책 전체) */
  const pf: Filters = sgg ? { sgg, gu: guOf(sgg) } : sido === 'metro' ? { metro: true } : { sido };
  const inScope = applyFilters(HOME_ROWS, pf).length;
  const scopeMap = sgg ? mapScopeHref({ sgg }) : sido === 'metro' ? mapScopeHref() : mapScopeHref({ sido });
  const findHref = listHref(pf).replace(/^\/projects/, '/citizen/projects');

  /* 내 동네로 옮기기에 쓰는 표: 시군구·구 코드 → 거를 수 있는 면 코드 */
  const sggOf: Record<string, string> = {};
  for (const u of sggUnits(regionMap, 'metro', SGG_TABLE)) if (u.code) { sggOf[u.code] = u.code; for (const g of u.gu) sggOf[g.code] = u.code; }

  /* ② 지난 몇 년 — 통계누리(민간 포함 모든 주택). 수도권 합 또는 시도 하나 */
  const years: YearVal[] = sido === 'metro' ? metroYears(molit, annual, metric) : regionYears(molit, annual, metric, sido).years;
  const part = years.length && !years[years.length - 1].complete && years[years.length - 1].value !== null ? years[years.length - 1] : null;
  const mname = PUBLIC_METRIC_NAME[metric];
  /* 순위 줄: 라벨 · 값 · 보조 (값은 기존 yearRank·hoText 그대로, 말만 나눠 놓는다) */
  let rank: { label: string; value: string; unit?: string; items?: string[] } | null = null;
  if (sido === 'metro') {
    const done = [...years].filter((y) => y.complete && y.value !== null).pop();
    if (done) rank = { label: `${done.year}년 ${name} ${mname}`, ...splitHo(hoText(done.value as number)) };
  } else {
    const r = yearRank(Object.fromEntries(METRO.map((c) => [c, regionYears(molit, annual, metric, c).years])), sido);
    if (r) rank = { label: `${r.year}년 ${mname} 수도권 ${r.of}곳 중`, value: `${r.rank}위`, items: [hoText(r.value)] };
  }

  return (
    <Page>
      {asked ? null : <MyAreaDefault metro={METRO} sggOf={sggOf} base={BASE} />}
      <PageHead title="공급 일정">
        <span className="ml-auto flex items-center gap-1 text-sm whitespace-nowrap text-muted-foreground tabular-nums">
          {koMonth(calendar.from)} ~ {koMonth(calendar.to)} 예정 · 실적은 {koMonth(last)}까지
          <InfoTip label="일정과 실적 기준">
            <dl>
              <dt>예정</dt><dd>국토교통부 건축HUB·LH·청약홈 자료 · 기준일 {calendar.referenceDate.replace(/-/g, '.')} · 예정일은 계획이라 바뀔 수 있고 청약 자격은 모집 공고에서 확인해요</dd>
              <dt>실적</dt><dd>국토교통부 통계누리 주택건설실적통계 · 민간이 지은 주택까지 모두 포함</dd>
            </dl>
          </InfoTip>
        </span>
      </PageHead>

      <ChipBar label="지역">
        <div className="ui-tabs ui-tabs-seg [--btn-h:var(--ctl-h)]" role="group" aria-label="시도">
          <Link href={href({ sido: 'metro' })} scroll={false} aria-current={sido === 'metro' ? 'true' : undefined} title="서울·경기·인천 전체">수도권</Link>
          {CHIPS.map((c) => <Link key={c} href={href({ sido: c })} scroll={false} aria-current={c === sido ? 'true' : undefined}>{sidoName(c)}</Link>)}
        </div>
        <div className={cn(MENU, !sgg && MENU_OFF)}>
          <ChipMenu label="시군구" fixed on={!!sgg} cols={2} title="시군구로 좁혀 보기"
            items={[{ href: href({ sgg: null }), label: `${name} 전체`, on: !sgg }, ...units.filter((u) => u.code).map((u) => ({ href: href({ sgg: u.code }), label: sido === 'metro' ? u.label : u.n, on: u.code === sgg }))]} />
        </div>
        <span className="ml-auto flex items-center gap-x-3 text-sm whitespace-nowrap text-muted-foreground tabular-nums">
          {scopeMap ? <MapLink href={scopeMap} full={`${scopeName} 지도에서 보기`}>지도에서 보기</MapLink> : null}
          <PanelLink href={findHref} full={`${scopeName} 사업 보기`}>이 지역 사업 {fmt(inScope)}곳</PanelLink>
        </span>
      </ChipBar>

      <Card render={<section aria-label="앞으로 12개월" />}>
        <PanelHead id="ahead-title"
          title="앞으로 12개월"
          scope={<>
            <ScopeChip scope={scopeName} clearHref={sgg ? href({ sgg: null, m: null }) : undefined} title={`${scopeName}의 주택 공급 정책 사업(공공·조합·민간)`} />
            <InfoTip label="앞으로 12개월 읽는 법">
              <dl>
                <dt>모집 공고 예정</dt><dd>주택 공급 정책에 연결된 사업 가운데 앞으로 12개월 안에 모집·분양이 예정된 호수예요. 정책 담당자 화면의 '향후 12개월 공급 예정'과 같은 숫자예요</dd>
                <dt>준공·입주</dt><dd>공공 사업 일정에 있는 같은 기간의 준공·입주 예정을 더해 볼 수 있어요</dd>
                <dt>막대</dt><dd>막대 한 조각이 사업 하나, 높이는 호수예요. 위 숫자는 그 달 호수, 아래는 사업 수예요</dd>
                <dt>예정일 지남</dt><dd>예정한 날짜가 지났는데 아직 기록이 없는 사업이에요. 합계에는 들어 있어요</dd>
              </dl>
            </InfoTip>
          </>}>
          <ChipGroup label="종류" className="[&_a:not([aria-current])]:border-line2">
            {CAL_KINDS.map((t) => {
              const xs = all.filter((e) => e.type === t), next = toggleKind(kinds, t);
              return <Chip key={t} href={href({ kinds: next ?? kinds })} on={kinds.includes(t)} swatch={{ kind: 'fill', color: `var(--st-${t === 'SUPPLY_NOTICE' ? 'sale' : t === 'COMPLETION' ? 'soon' : 'move'})` }}
                title={`${scopeName} · ${W.kindTip?.[t]} · ${xs.length}${W.count} · ${hoText(xs.reduce((s, e) => s + e.units, 0))}`}>{W.kind[t]}<span className="text-muted-foreground tabular-nums">{fmt(xs.length)}{W.count}</span></Chip>;
            })}
          </ChipGroup>
        </PanelHead>
        {list.length ? (
          <MetricRow className="mb-3" label={isHomeDefault(kinds) ? '모집 공고 예정' : `${kinds.map((k) => W.kind[k]).join('·')} 예정`} {...splitHo(hoText(total))}
            items={[<span key="n" title={pastN ? `${W.past} ${pastN}${W.count}도 이 합계에 들어 있어요` : undefined}>{`${fmt(list.length)}${W.count}`}</span>]} />
        ) : null}
        {list.length ? (
          <Ahead key={`${sido}|${kinds.join(',')}|${sgg ?? ''}`} words={W} sido={sido} regionName={scopeName} months={months} nowM={nowM} refDate={calendar.referenceDate} list={list} initialM={m} initialSgg={sgg} map={null} />
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <FactNote>앞으로 12개월 안에 {kinds.map((k) => W.kind[k]).join('·')} 예정인 공공 사업이 없어요</FactNote>
            {sgg ? <Link href={href({ sgg: null, m: null })} scroll={false} className={LINK}>{`${name} 전체 보기`}<ChevronRight className="size-3.5 shrink-0" aria-hidden="true" /></Link> : null}
            {kinds.length < CAL_KINDS.length ? <Link href={href({ kinds: [...CAL_KINDS], m: null })} scroll={false} className={LINK}>모든 종류 보기<ChevronRight className="size-3.5 shrink-0" aria-hidden="true" /></Link> : null}
            {sido !== 'metro' ? <Link href={href({ sido: 'metro', m: null })} scroll={false} className={LINK}>수도권 전체 보기<ChevronRight className="size-3.5 shrink-0" aria-hidden="true" /></Link> : null}
          </div>
        )}
      </Card>

      <Card render={<section aria-label="지난 몇 년" />}>
        <PanelHead title="지난 몇 년"
          scope={<ScopeChip scope={name} source="모든 주택(민간 포함)" title={`통계누리 주택건설실적통계 · ${name} · 민간이 지은 주택까지 모두 포함 — 위 공공 사업 숫자와 범위가 달라요`}
            note={sggName ? { text: '시도 전체 값', title: `${sggName}을 골라도 ${name} 전체 값이에요(시군구별 실적은 없어요)` } : undefined} />}>
          <div className="ui-tabs ui-tabs-line" role="group" aria-label="지표">
            {PUBLIC_METRICS.map((k) => <Link key={k} href={href({ metric: k })} scroll={false} aria-current={k === metric ? 'true' : undefined} className={METRIC_INK[k]}>{PUBLIC_METRIC_NAME[k]}</Link>)}
          </div>
          <InfoTip label="지난 몇 년 읽는 법">
            <p>국토교통부 통계누리 주택건설실적통계예요. 공공 사업뿐 아니라 민간이 지은 주택까지 모두 센 호수라, 위 앞으로 12개월의 공공 사업 숫자와 범위가 달라요.</p>
          </InfoTip>
        </PanelHead>
        <p className="ui-meta m-0 mb-2">{`해마다 ${mname}된 주택`}</p>
        {rank ? <MetricRow className="mb-2" label={rank.label} value={rank.value} unit={rank.unit} items={rank.items} /> : null}
        <YearBars series={years} color={METRIC_COLOR[metric]} yoy={false} label={`${name} 해마다 ${mname}된 주택 호수, ${years[0]?.year}년부터 ${koMonth(last)}까지`} />
        {part ? <p className="m-0 text-right text-base text-muted-foreground">{`${part.year}년 ${part.last === 1 ? '1월' : `1~${part.last}월`}${part.provisional ? ' · 잠정' : ''}`}</p> : null}
      </Card>
    </Page>
  );
}
