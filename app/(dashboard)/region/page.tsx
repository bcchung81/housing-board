import type { Metadata } from 'next';
import Link from 'next/link';
import { MetricRow, Page, PageHead, PanelHead, sub } from '@/components/page';
import PanelLink from '@/components/board/PanelLink';
import MapLink from '@/components/board/MapLink';
import { Card } from '@/components/ui/card';
import { Chip, ChipBar, ChipGroup } from '@/components/ui/chips';
import InfoTip from '@/components/ui/info-tip';
import Ahead from '@/components/region/Ahead';
import Annual, { parseMetric } from '@/components/region/Annual';
import Cond from '@/components/region/Cond';
import areaFactsJson from '@/data/board/area-facts.json';
import calendarJson from '@/data/board/region-calendar.json';
import mapJson from '@/data/board/region-map.json';
import annualJson from '@/data/board/region-annual.json';
import type { AreaFactsDoc } from '@/lib/board/area-facts';
import { fmt, lastMonth, ymDot } from '@/lib/board/calc';
import { getBoardData } from '@/lib/board/data';
import { METRO_AREAS, SIDO_SHORT, guOf } from '@/lib/board/metro-overview';
import { mapScopeHref } from '@/lib/board/map-href';
import ScopeChip from '@/components/ui/scope-chip';
import { AHEAD_KIND, CAL_KINDS, CAL_TYPE, METRO, PAST_DUE, aheadAll, aheadKindTip, inSgg, isDefaultKinds, pastDue, parseKinds, parseSgg, pickMonth, toggleKind, viewOf, type AnnualDoc, type CalKind, type CalendarDoc, type RegionMapDoc } from '@/lib/board/region';
import { getProjectsIndex } from '@/lib/board/projects-index';
import { AHEAD_ALL, AHEAD_COMPLETION, CAND_NAME, applyFilters, listHref, type Filters } from '@/lib/board/projects-view';
import type { Metric } from '@/lib/board/types';

export const metadata: Metadata = { title: '지역 공급' };

const calendar = calendarJson as unknown as CalendarDoc;
const regionMap = mapJson as unknown as RegionMapDoc;
const annual = annualJson as unknown as AnnualDoc;
const facts = areaFactsJson as AreaFactsDoc;
/* 시도 칩: 서울·인천·경기(2026-10-19 결정 — 화면은 수도권만, 전국 칩 없음) */
const ORDER = METRO;
const SGG_TABLE = { areas: METRO_AREAS, sidoShort: SIDO_SHORT, guOf };
const AHEAD_TIP = '대표 = 준공 예정(사업 화면·종합상황판·지도 개요와 같은 값) · 모집·입주는 종류 칩으로 더해 봄 · 사업 원장의 현재 예정(모집공고·준공·입주) · 종류마다 사업당 하나 · 이미 실제 기록이 있는 종류는 뺌 · 막대 한 조각 = 사업 하나(높이 = 호수) · 지도 원 넓이 = 호수(지도는 서울·인천·경기만) · 예정일은 계획이라 바뀔 수 있고 청약 자격은 모집공고에서 확인';
const LINKA = 'text-foreground underline-offset-[3px] hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

type Q = { sido?: string; m?: string; kind?: string; metric?: string; sgg?: string };

/* 지역 공급(옛 우리 동네 + 공급 실적): 지역 칩 → ① 앞으로 12개월 → ② 지난 공급 실적 → ③ 동네 여건(서울·인천·경기만). 선택은 모두 주소(?sido=&m=&kind=&metric=&sgg=)에 남는다(sgg = 지도에서 고른 시군구 — 칩을 누르면 풀린다).
   지역: 처음 열면 수도권(서울·인천·경기 — ?sido 없음, 옛 ?sido=all 도 수도권), ?sido=NN 시도 하나. 머리 줄에 같은 범위의 사업 화면(점검 필요) 연결.
   시안: docs/design/home-concept/region.html. 9.4 국민 예측가능성 지시(F-09)·연도별 실적(F-05)·전국↔시도(F-01) */
export default async function RegionPage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const { molit } = await getBoardData();
  const short = Object.fromEntries(molit.sido.map((s) => [s.code, s.name]));
  const sidoName = (c: string) => short[c] ?? c;
  /* 지역: 'metro'(기본 — 옛 ?sido=all·수도권 밖 코드도) · 'NN'(서울·인천·경기) */
  const sido = q.sido && ORDER.includes(q.sido) ? q.sido : 'metro';
  const metric = parseMetric(q.metric);
  const kinds = parseKinds(q.kind);
  const name = sido === 'metro' ? '수도권' : sidoName(sido);
  /* 시군구 거르기(?sgg=<지도 면 코드>, 서버가 거른다): 앞으로 12개월(달별 막대·고른 달 목록·합계·종류 칩 건수)과 사업 화면 연결이 그 시군구만. 구가 있는 시는 구를 합친다.
     지난 공급 실적·동네 여건은 시도 단위 자료뿐이라 그대로(머리에 '시도 단위 자료' 표지) */
  const sgg = parseSgg(regionMap, sido, SGG_TABLE, q.sgg);
  const sggName = sgg ? METRO_AREAS[sgg] : null;

  const href = (p: { sido?: string; kinds?: CalKind[]; metric?: Metric; m?: string | null; sgg?: string | null }) => {
    const s = new URLSearchParams();
    const sd = p.sido ?? sido, ks = p.kinds ?? kinds, mt = p.metric ?? metric, m = p.m === undefined ? q.m : p.m;
    const sg = p.sgg !== undefined ? p.sgg : p.sido !== undefined ? null : sgg;   // 시도를 바꾸면 시군구는 풀린다
    if (sd !== 'metro') s.set('sido', sd || 'all');
    if (sg) s.set('sgg', sg);
    if (m) s.set('m', m);
    if (!isDefaultKinds(ks)) s.set('kind', ks.join(','));   // 기본(준공만)과 다를 때만
    if (mt !== 'complete') s.set('metric', mt);
    const t = s.toString();
    return t ? `/region?${t}` : '/region';
  };

  /* ① 앞으로 12개월 */
  const all = aheadAll(calendar, sido, sidoName).filter((e) => !sgg || inSgg(e, sgg, SGG_TABLE));
  const list = all.filter((e) => kinds.includes(e.type));
  const months = calendar.months;
  const m = pickMonth(months, list, q.m);
  const units = list.reduce((s, e) => s + e.units, 0);
  /* 예정일 지남(기준일보다 앞선 예정): 표지만 달고 합계에는 그대로 둔다(title 에 적는다) */
  const aheadLabel = (isDefaultKinds(kinds) ? AHEAD_COMPLETION : kinds.length === CAL_KINDS.length ? AHEAD_ALL : `앞으로 12개월 · ${kinds.map((k) => CAL_TYPE[k].name).join('·')} 예정`).replace(/^앞으로 12개월 · /, '');
  const past = list.filter((e) => pastDue(e, calendar.referenceDate));
  const view = viewOf(regionMap, sido);
  const nowM = calendar.referenceDate.slice(0, 7);
  const last = lastMonth(molit);

  /* 같은 범위의 사업 화면 연결: 점검 필요(주의·지연·장기 지연) 건수 */
  const { rows } = await getProjectsIndex();
  const pf: Filters = sgg ? { sgg, gu: guOf(sgg) } : sido === 'metro' ? { metro: true } : sido ? { sido } : {};
  const scopeName = sggName ?? name;
  /* 지도 연결: 시군구 = ?sgg=, 수도권 = 지도 첫 화면, 시도 하나 = ?sido=, 전국·수도권 밖 = 없음 */
  const scopeMap = sgg ? mapScopeHref({ sgg }) : sido === 'metro' ? mapScopeHref() : sido ? mapScopeHref({ sido }) : null;
  const check = applyFilters(rows, { ...pf, status: 'check' }).length, inScope = applyFilters(rows, pf).length;

  return (
    <Page>
      <PageHead crumbs={[{ label: '종합상황판', href: '/' }, { label: '지역 공급' }]} title="지역 공급"
        tip="앞으로 12개월 예정(원장 현재 예정) → 지난 공급 실적(통계누리) → 동네 여건(서울·인천·경기) 순">
        <span className="ml-auto text-sm whitespace-nowrap text-muted-foreground tabular-nums mobile:text-sm"
          title={`앞으로 12개월(${ymDot(calendar.from)} ~ ${ymDot(calendar.to)}) · 원장 기준일 ${calendar.referenceDate.replace(/-/g, '.')} · 통계누리 실적 ${ymDot(last)}까지`}>
          예정 {ymDot(calendar.from)}~{ymDot(calendar.to)} · 실적 {ymDot(last)}
        </span>
      </PageHead>

      <ChipBar label="지역" className="[--btn-h:var(--ctl-h)]">
        <div className="ui-tabs ui-tabs-seg" role="group" aria-label="지역">
          <Link href={href({ sido: 'metro' })} aria-current={sido === 'metro' ? 'true' : undefined} title="서울·인천·경기(처음 열 때 범위)">수도권</Link>
          {ORDER.map((c) => <Link key={c} href={href({ sido: c })} aria-current={c === sido ? 'true' : undefined}>{sidoName(c)}</Link>)}
        </div>
        <span className={`${sub} ml-auto whitespace-nowrap tabular-nums`}>
          {scopeMap ? <><MapLink href={scopeMap} full={`${scopeName} 지도에서 보기`} />{' · '}</> : null}
          <Link href={listHref(pf)} className={LINKA} title={`${scopeName} 사업 목록(사업 화면)`}>{scopeName} 사업 {fmt(inScope)}건</Link>
          {' · '}
          {check ? <Link href={listHref(pf, { status: 'check' })} className={LINKA} title="주의·지연·장기 지연 사업을 지연 개월 큰 순으로">점검 필요 <b className="text-bad">{fmt(check)}</b> ›</Link> : '점검 필요 0'}
        </span>
      </ChipBar>

      <Card render={<section aria-label="앞으로 12개월" />}>
        <PanelHead id="ahead-title" title="앞으로 12개월" tip={AHEAD_TIP}
          scope={<ScopeChip scope={scopeName} source="사업 원장" title={sgg ? `${name} 중 ${sggName}만(구가 있는 시는 구를 합침) — 달별 막대·목록·합계·종류 칩 건수가 이 범위 · ×를 누르면 ${name}(으)로` : `사업 원장 현재 예정 · ${name}`} clearHref={sgg ? href({ sgg: null, m: null }) : undefined} />}>
          <InfoTip label="앞으로 12개월 읽는 법">
            <dl>
              <dt>{AHEAD_COMPLETION}</dt><dd>대표 숫자 — 준공 현재 예정이 {ymDot(months[0])}~{ymDot(months[11])}인 사업(이미 준공 실제가 있으면 뺌) · 사업 화면·종합상황판·지도 개요와 같은 값</dd>
              <dt>{AHEAD_KIND.SUPPLY_NOTICE} · {AHEAD_KIND.MOVE_IN} 칩</dt><dd>같은 기간 모집공고·입주 예정을 더해 봄(종류마다 사업당 하나 · 이미 실제 기록이 있는 종류는 뺌) · 앞으로 12개월 입주 예정은 종합상황판 &apos;⑥입주&apos;(지금 입주 단계인 사업)와 다름</dd>
              <dt>달별 막대</dt><dd>막대 한 조각 = 사업 하나(높이 = 호수) · 위 숫자 = 그 달 호수, 아래 = 건수 · 고른 칩의 종류만 쌓음</dd>
              <dt>{PAST_DUE}</dt><dd>예정 날짜가 원장 기준일보다 앞섰는데 실제 기록이 아직 없는 항목 — 표지만 달고 건수·호수 합계에는 넣음</dd>
              <dt>(후보) {CAND_NAME}</dt><dd>사업 번호가 아직 없는 사업 — 누르면 간단 보기</dd>
              <dt>키보드</dt><dd>달 막대는 ←→ 로 옮기고, 지도 원은 Tab 으로 들어가 ←→ 로 옮긴 뒤 Enter 로 그 사업을 고릅니다</dd>
              <dt>예정일</dt><dd>계획이라 바뀔 수 있고, 청약 자격은 모집공고에서 확인</dd>
            </dl>
          </InfoTip>
          <ChipGroup label="종류">
            {CAL_KINDS.map((t) => {
              const xs = all.filter((e) => e.type === t), next = toggleKind(kinds, t);
              return (
                <Chip key={t} href={href({ kinds: next ?? kinds })} on={kinds.includes(t)} swatch={{ kind: 'fill', color: CAL_TYPE[t].color }}
                  title={`${scopeName} · ${aheadKindTip(t)} · ${xs.length}건 · ${fmt(xs.reduce((s, e) => s + e.units, 0))}호${xs.some((e) => !e.units) ? ` · 호수 미확인 ${xs.filter((e) => !e.units).length}` : ''}`}>
                  {AHEAD_KIND[t]}<span className="text-muted-foreground tabular-nums">{fmt(xs.length)}건 · {fmt(xs.reduce((s, e) => s + e.units, 0))}호</span>
                </Chip>
              );
            })}
          </ChipGroup>
        </PanelHead>
        <div title={past.length ? `${PAST_DUE} ${past.length}건(${fmt(past.reduce((s, e) => s + e.units, 0))}호 — 예정 날짜가 원장 기준일 ${calendar.referenceDate.replace(/-/g, '.')}보다 앞서고 실제 기록이 아직 없음)도 이 합계에 들어 있음` : undefined}>
          <MetricRow label={aheadLabel} value={fmt(units)} unit="호" items={[`${fmt(list.length)}건`, `${ymDot(months[0])} ~ ${ymDot(months[11])}`]} className="mb-3" />
        </div>
        {list.length || sgg ? (
          <Ahead key={`${sido}|${kinds.join(',')}|${sgg ?? ''}`} sido={sido} regionName={scopeName} months={months} nowM={nowM} refDate={calendar.referenceDate} list={list} initialM={m} initialSgg={sgg}
            map={view ? { view, sgg: regionMap.sgg, districts: regionMap.districts } : null} />
        ) : <p className="m-0 text-sm text-muted-foreground">{name} · 12개월 안 {kinds.map((k) => CAL_TYPE[k].name).join('·')} 예정 없음</p>}
      </Card>

      <Annual molit={molit} annual={annual} sido={sido} metric={metric} order={ORDER} sidoName={sidoName} href={(p) => href({ ...p, m: null })} sggName={sggName} />

      {sido && facts.sido[sido] ? <Cond facts={facts} sido={sido} name={name} sggName={sggName} /> : (
        /* 자료가 없는 범위(수도권·전국·다른 시도)는 빈 카드 대신 한 줄 안내(2026-10-16 2차 평가: 1384×99 카드에 내용 435px — 오른쪽이 비었다) */
        <section aria-label="동네 여건" data-slot="cond-note" className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-sm text-muted-foreground"
          title="인구·가구·주택 재고·미분양(KOSIS·SGIS, 정책 진행 자료(HOME) 지역 지표)은 서울·인천·경기만 자료가 있어 시도 하나를 고르면 보인다">
          <h3 className="ui-h3">동네 여건</h3>
          {/* 시도 하나를 골랐는데 자료가 없으면 '없음'을 바로 말하고(고르라고 하지 않는다), 수도권·전국이면 시도를 고르게 한다 */}
          <span>{sido && sido !== 'metro' ? `${name} 자료 없음(서울·인천·경기만)` : '인구·주택 재고·미분양은 시도를 고르면 보입니다'}</span>
          {Object.keys(facts.sido).map((c) => <PanelLink key={c} href={href({ sido: c, m: null })} full={`${sidoName(c)} 동네 여건`}>{sidoName(c)}</PanelLink>)}
        </section>
      )}
    </Page>
  );
}
