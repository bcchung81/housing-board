import type { Metadata } from 'next';
import Link from 'next/link';
import { Page, PageHead, PanelHead, sub } from '../../../components/page';
import PanelLink from '../../../components/board/PanelLink';
import MapLink from '../../../components/board/MapLink';
import { Card } from '../../../components/ui/card';
import { Chip, ChipBar, ChipGroup, ChipSep } from '../../../components/ui/chips';
import InfoTip from '../../../components/ui/info-tip';
import Ahead from '../../../components/region/Ahead';
import Annual, { parseMetric } from '../../../components/region/Annual';
import Cond from '../../../components/region/Cond';
import areaFactsJson from '../../../data/board/area-facts.json';
import calendarJson from '../../../data/board/region-calendar.json';
import mapJson from '../../../data/board/region-map.json';
import annualJson from '../../../data/board/region-annual.json';
import type { AreaFactsDoc } from '../../../lib/board/area-facts';
import { fmt, lastMonth, monthLabel, ymDot } from '../../../lib/board/calc';
import { getBoardData } from '../../../lib/board/data';
import { mapScopeHref } from '../../../lib/board/map-href';
import { CAL_KINDS, CAL_TYPE, aheadAll, parseKinds, pickMonth, toggleKind, viewOf, type AnnualDoc, type CalKind, type CalendarDoc, type RegionMapDoc } from '../../../lib/board/region';
import { getProjectsIndex } from '../../../lib/board/projects-index';
import { AHEAD_ALL, AHEAD_COMPLETION, CAND_NAME, applyFilters, listHref, type Filters } from '../../../lib/board/projects-view';
import type { Metric } from '../../../lib/board/types';

export const metadata: Metadata = { title: '지역 공급' };

const calendar = calendarJson as unknown as CalendarDoc;
const regionMap = mapJson as unknown as RegionMapDoc;
const annual = annualJson as unknown as AnnualDoc;
const facts = areaFactsJson as AreaFactsDoc;
/* 시도 칩 순서(행정 순, 2026-07부터 광주·전남은 '전남광주' 12) */
const ORDER = ['11', '26', '27', '28', '12', '30', '31', '36', '41', '51', '43', '44', '52', '47', '48', '50'];
const man = (v: number) => (v >= 10000 ? `${+(v / 10000).toFixed(1)}만` : fmt(v));
const AHEAD_TIP = '사업 원장의 현재 예정(모집공고·준공·입주) · 종류마다 사업당 하나 · 이미 실제 기록이 있는 종류는 뺌 · 막대 한 조각 = 사업 하나(높이 = 호수, 전국은 종류별로 묶음) · 지도 원 넓이 = 호수(지도는 서울·인천·경기만) · 예정일은 계획이라 바뀔 수 있고 청약 자격은 모집공고에서 확인';
const LINKA = 'text-foreground underline-offset-[3px] hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

type Q = { sido?: string; m?: string; kind?: string; metric?: string };

/* 지역 공급(옛 우리 동네 + 공급 실적): 지역 칩 → ① 앞으로 12개월 → ② 지난 공급 실적 → ③ 동네 여건(서울·인천·경기만). 선택은 모두 주소(?sido=&m=&kind=&metric=)에 남는다.
   지역: 처음 열면 수도권(서울·인천·경기 — ?sido 없음), ?sido=all 전국, ?sido=NN 시도 하나. 머리 줄에 같은 범위의 사업 화면(점검 필요) 연결.
   시안: docs/design/home-concept/region.html. 9.4 국민 예측가능성 지시(F-09)·연도별 실적(F-05)·전국↔시도(F-01) */
export default async function RegionPage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const { molit } = await getBoardData();
  const short = Object.fromEntries(molit.sido.map((s) => [s.code, s.name]));
  const sidoName = (c: string) => short[c] ?? c;
  /* 지역: 'metro'(기본) · ''(전국 ?sido=all) · 'NN' */
  const sido = q.sido && ORDER.includes(q.sido) ? q.sido : q.sido === 'all' ? '' : 'metro';
  const metric = parseMetric(q.metric);
  const kinds = parseKinds(q.kind);
  const name = sido === 'metro' ? '수도권' : sido ? sidoName(sido) : '전국';

  const href = (p: { sido?: string; kinds?: CalKind[]; metric?: Metric; m?: string | null }) => {
    const s = new URLSearchParams();
    const sd = p.sido ?? sido, ks = p.kinds ?? kinds, mt = p.metric ?? metric, m = p.m === undefined ? q.m : p.m;
    if (sd !== 'metro') s.set('sido', sd || 'all');
    if (m) s.set('m', m);
    if (ks.length !== CAL_KINDS.length) s.set('kind', ks.join(','));
    if (mt !== 'complete') s.set('metric', mt);
    const t = s.toString();
    return t ? `/region?${t}` : '/region';
  };

  /* ① 앞으로 12개월 */
  const all = aheadAll(calendar, sido, sidoName);
  const list = all.filter((e) => kinds.includes(e.type));
  const months = calendar.months;
  const m = pickMonth(months, list, q.m);
  const units = list.reduce((s, e) => s + e.units, 0);
  const view = viewOf(regionMap, sido);
  const nowM = calendar.referenceDate.slice(0, 7);
  const last = lastMonth(molit);

  /* 같은 범위의 사업 화면 연결: 점검 필요(주의·지연·장기 지연) 건수 */
  const { rows } = await getProjectsIndex();
  const pf: Filters = sido === 'metro' ? { metro: true } : sido ? { sido } : {};
  /* 지도 연결: 수도권 = 지도 첫 화면, 시도 하나 = ?sido=, 전국·수도권 밖 = 없음 */
  const scopeMap = sido === 'metro' ? mapScopeHref() : sido ? mapScopeHref({ sido }) : null;
  const check = applyFilters(rows, { ...pf, status: 'check' }).length, inScope = applyFilters(rows, pf).length;

  return (
    <Page>
      <PageHead crumbs={[{ label: '종합상황판', href: '/' }, { label: '지역 공급' }]} title="지역 공급"
        tip="앞으로 12개월 예정(원장 현재 예정) → 지난 공급 실적(통계누리) → 동네 여건(서울·인천·경기) 순">
        <span className="ml-auto text-[14px] whitespace-nowrap text-muted-foreground tabular-nums mobile:text-[13px]"
          title={`앞으로 12개월(${monthLabel(calendar.from)} ~ ${monthLabel(calendar.to)}) · 원장 기준일 ${calendar.referenceDate} · 통계누리 실적 ${last}까지`}>
          예정 {ymDot(calendar.from)}~{ymDot(calendar.to)} · 실적 {ymDot(last)}
        </span>
      </PageHead>

      <ChipBar label="지역">
        <ChipGroup label="범위" className="[&>span:first-child]:sr-only">
          <Chip href={href({ sido: 'metro' })} on={sido === 'metro'} title="서울·인천·경기(처음 열 때 범위)">수도권</Chip>
          <Chip href={href({ sido: '' })} on={!sido}>전국</Chip>
        </ChipGroup>
        <ChipSep />
        <ChipGroup label="시도" className="[&>span:first-child]:sr-only">
          {ORDER.map((c) => <Chip key={c} href={href({ sido: c })} on={c === sido}>{sidoName(c)}</Chip>)}
        </ChipGroup>
        <span className={`${sub} ml-auto whitespace-nowrap tabular-nums`}>
          {scopeMap ? <><MapLink href={scopeMap} full={`${name} 지도에서 보기`} />{' · '}</> : null}
          <Link href={listHref(pf)} className={LINKA} title={`${name} 사업 목록(사업 화면)`}>{name} 사업 {fmt(inScope)}건</Link>
          {' · '}
          {check ? <Link href={listHref(pf, { status: 'check' })} className={LINKA} title="주의·지연·장기 지연 사업을 지연 개월 큰 순으로">점검 필요 <b className="text-bad">{fmt(check)}</b> ›</Link> : '점검 필요 0'}
        </span>
      </ChipBar>

      <Card render={<section aria-label={AHEAD_ALL} />}>
        <PanelHead title={<>{kinds.length === CAL_KINDS.length ? AHEAD_ALL : `앞으로 12개월 ${kinds.map((k) => CAL_TYPE[k].name).join('·')} 예정`}<span className="ml-2 text-[14px] font-normal text-muted-foreground">{ymDot(months[0])} ~ {ymDot(months[11])} · {fmt(list.length)}건 · {man(units)}호</span></>} tip={AHEAD_TIP}>
          <InfoTip label="앞으로 12개월 읽는 법">
            <dl>
              <dt>{AHEAD_ALL}</dt><dd>사업 원장의 현재 예정(모집공고·준공·입주)이 {ymDot(months[0])}~{ymDot(months[11])}에 든 사업 · 종류마다 사업당 하나 · 이미 실제 기록이 있는 종류는 뺌</dd>
              <dt>준공 칩</dt><dd>사업 화면 &apos;{AHEAD_COMPLETION}&apos;과 같은 범위·같은 값</dd>
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
                  title={`${name} · 1년 안 ${CAL_TYPE[t].name} 예정 ${xs.length}건 · ${fmt(xs.reduce((s, e) => s + e.units, 0))}호${xs.some((e) => !e.units) ? ` · 호수 미확인 ${xs.filter((e) => !e.units).length}` : ''}`}>
                  {CAL_TYPE[t].name}<span className="text-muted-foreground tabular-nums">{fmt(xs.length)}</span>
                </Chip>
              );
            })}
          </ChipGroup>
        </PanelHead>
        {list.length ? (
          <Ahead key={`${sido}|${kinds.join(',')}`} sido={sido} regionName={name} months={months} nowM={nowM} list={list} initialM={m}
            map={view ? { view, sgg: regionMap.sgg, districts: regionMap.districts } : null} />
        ) : <p className="m-0 text-[14px] text-muted-foreground">{name} · 12개월 안 {kinds.map((k) => CAL_TYPE[k].name).join('·')} 예정 없음</p>}
      </Card>

      <Annual molit={molit} annual={annual} sido={sido} metric={metric} order={ORDER} sidoName={sidoName} href={(p) => href({ ...p, m: null })} />

      {sido && facts.sido[sido] ? <Cond facts={facts} sido={sido} name={name} /> : (
        <Card render={<section aria-label="동네 여건" />}>
          <PanelHead title="동네 여건" tip="인구·가구·주택 재고·미분양(KOSIS·SGIS, HOME 지역 지표)은 서울·인천·경기만 자료가 있어 시도 하나를 고르면 보인다" />
          <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-muted-foreground">
            {/* 시도 하나를 골랐는데 자료가 없으면 '없음'을 바로 말하고(고르라고 하지 않는다), 수도권·전국이면 시도를 고르게 한다 */}
            <span>{sido && sido !== 'metro' ? `${name} 동네 여건 자료 없음(서울·인천·경기만)` : `인구·주택 재고·미분양은 시도를 고르면 보입니다${sido ? '' : '(서울·인천·경기만 자료 있음)'}`}</span>
            {Object.keys(facts.sido).map((c) => <PanelLink key={c} href={href({ sido: c, m: null })} full={`${sidoName(c)} 동네 여건`}>{sidoName(c)}</PanelLink>)}
          </p>
        </Card>
      )}
    </Page>
  );
}
