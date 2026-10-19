import type { Metadata } from 'next';
import { Page, PageHead, PanelHead } from '@/components/page';
import PanelLink from '@/components/board/PanelLink';
import MapLink from '@/components/board/MapLink';
import { Card } from '@/components/ui/card';
import { Chip, ChipBar, ChipGroup, ChipMenu, ChipSep } from '@/components/ui/chips';
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
import { getProjectsIndex } from '@/lib/board/projects-index';
import { applyFilters, listHref, type Filters } from '@/lib/board/projects-view';
import { CAL_KINDS, METRO, aheadAll, inSgg, isDefaultKinds, parseKinds, parseSgg, pastDue, pickMonth, metroYears, regionYears, sggUnits, toggleKind, type AnnualDoc, type CalKind, type CalendarDoc, type RegionMapDoc } from '@/lib/board/region';
import { PUBLIC_METRICS, PUBLIC_METRIC_NAME, PUBLIC_WORDS, hoText, koMonth, parsePublicMetric, parsePublicSido, rankText, yearRank, type PublicMetric } from '@/lib/board/public-schedule';
import { distinctNames } from '@/lib/board/public-labels';
import type { YearVal } from '@/lib/board/annual';

export const metadata: Metadata = { title: '공급 일정' };

const calendar = calendarJson as unknown as CalendarDoc;
const regionMap = mapJson as unknown as RegionMapDoc;
const annual = annualJson as unknown as AnnualDoc;
const SGG_TABLE = { areas: METRO_AREAS, sidoShort: SIDO_SHORT, guOf };
const W = PUBLIC_WORDS;
const BASE = '/citizen/schedule';
/* 사업 이름: 사업 찾기와 같은 쉬운 이름 규칙(public-labels distinctNames — 'BL' 원문 없음, 겹치면 블록 표기). 예정 항목 sgg 는 '경기도 고양시 덕양구' 글자라 시도를 뗀 이름이 지역 구분에 쓰인다 */
function easyNames<T extends { id: string; name: string; sgg: string; units: number }>(xs: T[]): T[] {
  const nm = distinctNames(xs.map((e) => ({ id: e.id, name: e.name, sgg: e.sgg, u: e.units })), (s) => s.split(' ').slice(1).join(' '));
  return xs.map((e) => ({ ...e, name: nm[e.id] ?? e.name }));
}
/* 시도 칩 순서(서울·경기·인천 — 제안서 5.4) */
const CHIPS = ['11', '41', '28'];

type Q = { sido?: string; sgg?: string; m?: string; kind?: string; metric?: string };

/* 일반사용자 공급 일정(옛 정책 화면 /region 의 국민판, 수도권만): 지역 칩 → ① 앞으로 12개월(달 막대 + 고른 달 목록) → ② 지난 몇 년(해마다 착공·준공, 민간 포함).
   숫자는 정책 화면과 같은 함수(aheadAll·pickMonth·regionYears·metroYears)에서 나온다 — 말·열·거르기만 다르다. 제안서 5절. */
export default async function SchedulePage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const { molit } = await getBoardData();
  const short = Object.fromEntries(molit.sido.map((s) => [s.code, s.name]));
  const sidoName = (c: string) => short[c] ?? c;
  const sido = parsePublicSido(q.sido);
  const kinds = parseKinds(q.kind);
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
    if (!isDefaultKinds(ks)) s.set('kind', ks.join(','));
    if (mt !== 'complete') s.set('metric', mt);
    return `${BASE}?${s.toString()}`;
  };

  /* ① 앞으로 12개월 — 정책 /region 과 같은 함수·같은 범위(수도권 = 서울·인천·경기만 들어 있다) */
  const all = easyNames(aheadAll(calendar, sido, sidoName)).filter((e) => !sgg || inSgg(e, sgg, SGG_TABLE));
  const list = all.filter((e) => kinds.includes(e.type));
  const months = calendar.months;
  const m = pickMonth(months, list, q.m);
  const total = list.reduce((s, e) => s + e.units, 0);
  const pastN = list.filter((e) => pastDue(e, calendar.referenceDate)).length;
  const nowM = calendar.referenceDate.slice(0, 7);
  const last = lastMonth(molit);

  /* 사업 찾기·지도 연결 */
  const { rows } = await getProjectsIndex();
  const pf: Filters = sgg ? { sgg, gu: guOf(sgg) } : sido === 'metro' ? { metro: true } : { sido };
  const inScope = applyFilters(rows, pf).length;
  const scopeMap = sgg ? mapScopeHref({ sgg }) : sido === 'metro' ? mapScopeHref() : mapScopeHref({ sido });
  const findHref = listHref(pf).replace(/^\/projects/, '/citizen/projects');

  /* 내 동네로 옮기기에 쓰는 표: 시군구·구 코드 → 거를 수 있는 면 코드 */
  const sggOf: Record<string, string> = {};
  for (const u of sggUnits(regionMap, 'metro', SGG_TABLE)) if (u.code) { sggOf[u.code] = u.code; for (const g of u.gu) sggOf[g.code] = u.code; }

  /* ② 지난 몇 년 — 통계누리(민간 포함 모든 주택). 수도권 합 또는 시도 하나 */
  const years: YearVal[] = sido === 'metro' ? metroYears(molit, annual, metric) : regionYears(molit, annual, metric, sido).years;
  const part = years.length && !years[years.length - 1].complete && years[years.length - 1].value !== null ? years[years.length - 1] : null;
  const mname = PUBLIC_METRIC_NAME[metric];
  let rank = '';
  if (sido === 'metro') {
    const done = [...years].filter((y) => y.complete && y.value !== null).pop();
    if (done) rank = `${done.year}년 ${name} ${mname} ${hoText(done.value as number)}`;
  } else {
    const r = yearRank(Object.fromEntries(METRO.map((c) => [c, regionYears(molit, annual, metric, c).years])), sido);
    if (r) rank = rankText(mname, r);
  }

  return (
    <Page>
      <MyAreaDefault metro={METRO} sggOf={sggOf} base={BASE} />
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
        <ChipGroup label="시도" className="[&>span:first-child]:sr-only">
          <Chip href={href({ sido: 'metro' })} on={sido === 'metro'} title="서울·경기·인천 전체">수도권</Chip>
          {CHIPS.map((c) => <Chip key={c} href={href({ sido: c })} on={c === sido}>{sidoName(c)}</Chip>)}
        </ChipGroup>
        <ChipSep />
        <ChipMenu label="시군구" fixed on={!!sgg} cols={2} title="시군구로 좁혀 보기"
          items={[{ href: href({ sgg: null }), label: `${name} 전체`, on: !sgg }, ...units.filter((u) => u.code).map((u) => ({ href: href({ sgg: u.code }), label: sido === 'metro' ? u.label : u.n, on: u.code === sgg }))]} />
        <span className="ml-auto flex items-center gap-x-3 text-sm whitespace-nowrap text-muted-foreground tabular-nums">
          {scopeMap ? <MapLink href={scopeMap} full={`${scopeName} 지도에서 보기`}>지도에서 보기</MapLink> : null}
          <PanelLink href={findHref} full={`${scopeName} 사업 보기`}>이 지역 사업 {fmt(inScope)}곳</PanelLink>
        </span>
      </ChipBar>

      <Card render={<section aria-label="앞으로 12개월" />}>
        <PanelHead id="ahead-title"
          title={<>{isDefaultKinds(kinds) ? '앞으로 12개월 · 준공 예정' : `앞으로 12개월 · ${kinds.map((k) => W.kind[k]).join('·')} 예정`}<span className="ml-2 font-normal text-muted-foreground tabular-nums" title={pastN ? `${W.past} ${pastN}${W.count}도 이 합계에 들어 있어요` : undefined}>{fmt(list.length)}{W.count} · {hoText(total)}</span></>}
          scope={<ScopeChip scope={scopeName} source="공공 사업" clearHref={sgg ? href({ sgg: null, m: null }) : undefined} title={`${scopeName}의 공공 사업`} />}>
          <InfoTip label="앞으로 12개월 읽는 법">
            <dl>
              <dt>준공 예정</dt><dd>공사를 마칠 예정인 달이 앞으로 12개월 안인 사업이에요. 정책 담당자 화면과 같은 숫자예요</dd>
              <dt>모집 공고·입주</dt><dd>같은 기간의 청약 모집 공고와 입주 예정을 더해 볼 수 있어요</dd>
              <dt>막대</dt><dd>막대 한 조각이 사업 하나, 높이는 호수예요. 위 숫자는 그 달 호수, 아래는 사업 수예요</dd>
              <dt>예정일 지남</dt><dd>예정한 날짜가 지났는데 아직 기록이 없는 사업이에요. 합계에는 들어 있어요</dd>
            </dl>
          </InfoTip>
          <ChipGroup label="종류">
            {CAL_KINDS.map((t) => {
              const xs = all.filter((e) => e.type === t), next = toggleKind(kinds, t);
              return <Chip key={t} href={href({ kinds: next ?? kinds })} on={kinds.includes(t)} swatch={{ kind: 'fill', color: `var(--st-${t === 'SUPPLY_NOTICE' ? 'sale' : t === 'COMPLETION' ? 'soon' : 'move'})` }}
                title={`${scopeName} · ${W.kindTip?.[t]} · ${xs.length}${W.count} · ${hoText(xs.reduce((s, e) => s + e.units, 0))}`}>{W.kind[t]}<span className="text-muted-foreground tabular-nums">{fmt(xs.length)}{W.count}</span></Chip>;
            })}
          </ChipGroup>
        </PanelHead>
        {list.length ? (
          <Ahead key={`${sido}|${kinds.join(',')}|${sgg ?? ''}`} words={W} sido={sido} regionName={scopeName} months={months} nowM={nowM} refDate={calendar.referenceDate} list={list} initialM={m} initialSgg={sgg} map={null} />
        ) : <p className="m-0 text-base text-muted-foreground">앞으로 12개월 안에 {kinds.map((k) => W.kind[k]).join('·')} 예정인 공공 사업이 없어요</p>}
      </Card>

      <Card render={<section aria-label="지난 몇 년" />}>
        <PanelHead title={`지난 몇 년 · 해마다 ${mname}된 주택`}
          scope={<ScopeChip scope={name} source="모든 주택(민간 포함)" title={`통계누리 주택건설실적통계 · ${name} · 민간이 지은 주택까지 모두 포함 — 위 공공 사업 숫자와 범위가 달라요`}
            note={sggName ? { text: '시도 전체 값', title: `${sggName}을 골라도 ${name} 전체 값이에요(시군구별 실적은 없어요)` } : undefined} />}>
          <ChipGroup label="지표" className="[&>span:first-child]:sr-only">
            {PUBLIC_METRICS.map((k) => <Chip key={k} href={href({ metric: k })} on={k === metric} swatch={{ kind: 'fill', color: METRIC_COLOR[k] }}>{PUBLIC_METRIC_NAME[k]}</Chip>)}
          </ChipGroup>
          <InfoTip label="지난 몇 년 읽는 법">
            <p>국토교통부 통계누리 주택건설실적통계예요. 공공 사업뿐 아니라 민간이 지은 주택까지 모두 센 호수라, 위 앞으로 12개월의 공공 사업 숫자와 범위가 달라요.</p>
          </InfoTip>
        </PanelHead>
        {rank ? <p className="m-0 text-base font-bold tabular-nums">{rank}</p> : null}
        <YearBars series={years} color={METRIC_COLOR[metric]} yoy={false} label={`${name} 해마다 ${mname}된 주택 호수, ${years[0]?.year}년부터 ${koMonth(last)}까지`} />
        {part ? <p className="m-0 text-right text-base text-muted-foreground">{part.year}년은 {part.last}월까지{part.provisional ? '(잠정)' : ''}</p> : null}
      </Card>
    </Page>
  );
}
