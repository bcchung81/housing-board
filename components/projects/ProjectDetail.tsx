/* 사업 창의 내용(2026-10-19 서랍 → 모달리스 창: 창 관리자 components/windows 가 클라이언트에서 그린다 — 자료는 lib/board/project-window.ts projectWindow, 허용 목록이라 법정동 코드는 싣지 않는다). 시안: docs/design/home-concept/assets/app.js renderDetail.
   머리(이름·프로그램·정책(연결 상태는 title)·id) → 단계 줄(①~⑥, 목록과 같은 번호·색) → 핵심 수치(계획·공고 확인·공정률, 있는 것만) → 단계 타임라인(상태·'당초 일정 없음' 한 번) → 개요(지도에서 보기 · 위치 종류) → 근거(접힘).
   숨김 사업(대응 사업 없음)은 한 줄 안내와 개요만. 대체된 옛 id 는 대표 사업을 그리고 맨 위에 한 줄 안내. 건축HUB 관리번호는 공개 범위가 미결(기획서 Q4)이라 보이지 않는다.
   HOME 원천 행(row.home — 사업 화면 목록의 행, 2026-10-21): 단계 줄·상태·기관·호수는 PoC 값(단계 이름은 정책 화면 PoC 이름), 타임라인·공정률·공고·근거는 붙인 사업 원장 사업(d.ledger) 것.
   원장 사업이 없는 행(kind 'home')은 단계 줄·핵심 수치·개요만. */
import Link from 'next/link';
import { ChevronRight, ExternalLink } from 'lucide-react';
import PanelLink from '@/components/board/PanelLink';
import { Dl, FactNote, PanelHead } from '@/components/page';
import { SwatchMark } from '@/components/ui/chips';
import { STATUS_SW } from '@/lib/board/projects-list';
import { Kpi } from '@/components/ui';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import StageSteps from './StageSteps';
import StageTimeline, { TimelineLegend } from './StageTimeline';
import { mapHref } from '@/lib/board/map-href';
import { NOTICE_SITE } from '@/lib/board/public-labels';
import type { AdminDetailWin, HiddenWin, HomeWin } from '@/lib/board/project-window';
import InfoTip from '@/components/ui/info-tip';
import { AGENCY_NAME, AGENCY_TIP, AHEAD_SUPPLY, EVENT_NAME, HOME_UNIT, PAST_DUE_UNDER, agencyKey, dateAltOf, dayText, hiddenNote, LOST_INPUT, lostGuide, judgeName, judgeTip, pastDueOf, pct1, policyLabel, statusLabel, statusOf, statusTip, timelineOf } from '@/lib/board/projects-view';

const SCOPE: Record<string, string> = { PUBLIC: '공공', PRIVATE_ON_PUBLIC_LAND: '공공택지 민간', UNKNOWN: '미확인' };
const UNIT: Record<string, string> = { BLOCK: '블록', PROJECT: '사업', AREA_UNKNOWN: '구역 미상' };
const LOC: Record<string, string> = { bundle: 'LH 블록·동 윤곽(지도 자료)', block: 'LH 블록 대표점', address: '주소 근사점', district: '지구 대표점', area: '근사 영역(시군구·동)', parcel: '필지', name: '이름 검색 위치' };
/* 지도 링크 옆 짧은 위치 종류: 블록·지구·근사·미확보. 판정은 지도와 같은 기준(projects-view mapLocOf — 2026-10-16 2차 평가: 계양 A2 가 지도에는 블록·동 10개, 서랍은 '미확보'였다) */
const LOC_SHORT: Record<string, string> = { bundle: '블록', block: '블록', address: '근사', district: '지구', name: '근사' };
const NO_LOC_TIP = (by: string | undefined) => `지도에 그릴 위치가 없음(${by ? `${LOC[by] ?? by}뿐` : '좌표 없음'}) — 지도에서는 시군구로 열리고 '위치 미확보' 묶음에 들어감`;
const fmt = (n: number) => n.toLocaleString('en-US');
const JUDGE_SHOW = 3;   // 개요의 원천 행 판정 링크 수
const FACTS = 'm-0 grid grid-cols-[repeat(auto-fit,minmax(min(180px,100%),1fr))] gap-x-10 gap-y-3 text-base leading-body [&_dd]:m-0 [&_dt]:text-sm [&_dt]:text-muted-foreground';
const None = ({ children, tip }: { children: string; tip?: string }) => <span className="text-sm whitespace-nowrap text-muted-foreground" title={tip}>{children}</span>;
/* 지도로 가는 링크는 <a>(지도는 루트 레이아웃이 달라 새 문서로 연다) — 모양은 PanelLink */
const MapLink = ({ href, full, children }: { href: string; full: string; children: string }) => (
  <a href={href} title={full} className="group/action inline-flex flex-none items-center gap-px rounded-chip text-sm leading-body whitespace-nowrap text-muted-foreground no-underline underline-offset-[3px] transition-colors hover:text-primary hover:underline focus-visible:text-primary focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
    <span>{children}</span><ChevronRight className="size-3.5 shrink-0 transition-transform group-hover/action:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
  </a>
);

/* 머리 줄의 배지(프로그램·정책 연결)와 id */
export function DrawerHead({ d }: { d: AdminDetailWin | HiddenWin | HomeWin }) {
  if (d.kind === 'hidden') return <code className="ml-auto text-sm text-muted-foreground" title="사업 id">{d.project.id}</code>;
  const r = d.row, pol = d.policies.filter((x) => r.policies.includes(x.key)), fixed = r.link === 'CONFIRMED';
  if (d.kind === 'home') return (
    <>
      <span className="flex flex-wrap items-center gap-1.5">
        {r.programs.map((g) => <Badge key={g} title="프로그램(정책 진행 자료)">{g}</Badge>)}
        {pol.map((x) => <Badge key={x.key} title={`${x.name} · 정책 연결: ${fixed ? '담당자가 확정함' : '담당자 검토 중'}`}>{policyLabel(x)}</Badge>)}
      </span>
      <code className="text-sm text-muted-foreground" title={HOME_UNIT}>{r.id}</code>
    </>
  );
  return (
    <>
      {/* 제목은 지도와 같은 짧은 이름(d.label), 원장 사업 이름은 부제(2026-10-15 평가: 지도 '고양창릉 A4' ↔ 서랍 '…A-4BL 아파트 건설공사 1공구') */}
      {d.label && d.label !== r.name ? <span data-slot="drawer-full" className="basis-full text-sm text-muted-foreground" title="사업 원장 이름">{r.name}</span> : null}
      <span className="flex flex-wrap items-center gap-1.5">
        {r.programs.map((g) => <Badge key={g} title="프로그램">{g}</Badge>)}
        {d.detail.types?.map((t) => <Badge key={t.name} title={`공급 유형 · 원천 이름: ${t.raw.join(' · ')}`}>{t.name}</Badge>)}
        {pol.map((x) => <Badge key={x.key} title={`${x.name} · 정책 연결: ${fixed ? '담당자가 확정함' : '담당자가 아직 확정하지 않은 제안(해제된 연결은 빠짐)'}`}>{policyLabel(x)}</Badge>)}
      </span>
      <code className="text-sm text-muted-foreground" title={d.ledger ? `${HOME_UNIT} — 사업 원장 ${d.ledger.id}` : '사업 id'}>{r.id}</code>
    </>
  );
}

/* HOME 원천 행의 핵심 수치: 계획(원천 행 호수) · 집계(대표 호수 — 중복·모호 행은 제외) · 부족(판정) · 향후 12개월 공급 예정 · 공정률(원천) */
function HomeKpis({ r, progress }: { r: AdminDetailWin['row']; progress?: [string, number] | null }) {
  const h = r.home!, last = progress ?? (h.progress ? [h.progress.date ?? '', h.progress.pct] as [string, number] : null);
  return (
    <section aria-label="핵심 수치" className="relative grid grid-cols-3 gap-2.5 mobile:grid-cols-1 @max-[560px]:grid-cols-1">
      <Kpi variant="inset" label="계획" value={r.units > 0 ? fmt(r.units) : '—'} unit={r.units > 0 ? '호' : ''} sub={h.counted == null ? '호수 집계 제외(중복·모호)' : h.counted !== r.units ? `집계 ${fmt(h.counted)}호` : undefined} tip="원천 행의 사업 호수(정책 진행 자료) · 집계 = 같은 블록 중복·모호 행을 뺀 대표 호수" />
      {h.gap ? <Kpi variant="inset" label="부족" value={fmt(h.gap)} unit="호" tone="var(--bad)" sub={statusLabel(r)} tip="기준일까지 도래한 단계 목표 대비 측정(담당자 입력 포함) 부족 호수" /> : null}
      {h.upcoming ? <Kpi variant="inset" label="12개월 공급" value={fmt(h.upcoming)} unit="호" tone="var(--st-sale)" sub={AHEAD_SUPPLY} tip={`${AHEAD_SUPPLY} — 공급(본 분양·모집) 일정 증가분`} /> : null}
      {last ? <Kpi variant="inset" label="공정률" value={pct1(last[1])} unit="%" tone="var(--st-build)" sub={last[0] ? `보고 ${dayText(last[0])}` : undefined} tip="공사진행 보고의 마지막 값" /> : null}
    </section>
  );
}

/* 사업 원장에 같은 사업이 없는 HOME 원천 행 */
function HomeOnly({ d, stageHref }: { d: HomeWin; stageHref: (i: number) => string }) {
  const r = d.row, pol = d.policies.filter((p) => r.policies.includes(p.key));
  return (
    <>
      <div role="note"><FactNote className="ui-inset" tip={{ label: '사업 원장 없음', children: <p>정책 진행 자료를 받은 뒤에 생긴 원천 행이거나, 원장 변환에서 빠진 행(지구·블록 별칭 없음·시군구 미정)이라 일정·공정률·공고 상세가 없습니다. 값은 정책 진행 자료 그대로입니다.</p> }}>사업 원장에 같은 사업 없음 · 정책 진행 자료 값만</FactNote></div>
      <Card render={<section aria-label="단계와 핵심 수치" />} className="flex flex-col gap-3">
        <StageSteps home current={r.board} reached={r.reached} listHref={stageHref(r.board)} />
        <HomeKpis r={r} />
      </Card>
      <Card render={<section aria-label="개요" />}>
        <PanelHead title="개요" />
        <dl className={FACTS}>
          <div><dt>시군구</dt><dd><Link href={`/projects?sgg=${r.sgg}`} title="이 시군구로 거른 사업 목록">{r.sggName}</Link></dd></div>
          <div><dt>상태</dt><dd title={statusTip(r)}><span className="inline-flex items-center gap-1.5"><SwatchMark {...STATUS_SW[statusOf(r)]} />{statusLabel(r)}</span></dd></div>
          <div><dt>시행</dt><dd>{r.agency ?? <None tip={AGENCY_TIP.etc}>미확인</None>}</dd></div>
          <div><dt>정책 연결</dt><dd>{pol.length ? pol.map((p, i) => <span key={p.key}>{i ? ' · ' : ''}{policyLabel(p)}</span>) : <None>정책 미귀속</None>}</dd></div>
        </dl>
      </Card>
    </>
  );
}

/* stageHref: 단계 줄 칸의 주소(목록 화면의 지금 거르기를 유지 — 화면이 만든다) */
export default function ProjectDetail({ d, stageHref }: { d: AdminDetailWin | HiddenWin | HomeWin; stageHref: (i: number) => string }) {
  if (d.kind === 'home') return <HomeOnly d={d} stageHref={stageHref} />;
  if (d.kind === 'hidden') {
    const p = d.project, h = hiddenNote(p.hiddenAt!, p.hiddenReason);
    return (
      <>
        <div role="note" aria-label="목록에서 뺀 사업" title={h.title}><FactNote className="ui-inset" tip={{ label: '목록에서 뺀 사유', children: <p>{h.title}</p> }}>{h.text}</FactNote></div>
        <Card render={<section aria-label="개요" />}>
          <PanelHead title="개요" />
          <dl className={FACTS}><div><dt>시군구</dt><dd>{d.sggName}</dd></div></dl>
        </Card>
      </>
    );
  }
  const { row: r, detail: x } = d;
  const tl = timelineOf(x, d.referenceDate);
  const last = x.progress.length ? x.progress[x.progress.length - 1] : null;
  const pol = d.policies.filter((p) => r.policies.includes(p.key));
  const ag = agencyKey(r.agency);
  const edition = x.refs.map((ref) => /^home-dump-(\d{4})(\d{2})(\d{2})/.exec(ref)).find(Boolean);
  const ml = d.mapLoc;   // 지도에 그리는 위치(지도와 같은 판정 mapLocOf — 서버가 계산해 싣는다, 번들 단지 값은 싣지 않음) — null 이면 위치 미확보
  const loc = ml ? LOC_SHORT[ml] : '미확보';
  const alt = r.home || d.judge ? null : dateAltOf(r, true);   // 원천 날짜 다름(D2): 판정은 원장 날짜, 표지만 — 서랍은 LH 날짜를 일까지(같은 달이어도 무엇이 다른지 보이게)
  const mapId = d.ledger?.id ?? r.id, home = !!r.home;
  /* 원장 사업 창에 HOME 원천 행이 합쳐져 있으면 상태는 그 PoC 판정(d.judge), 옛 '예정일 경과' 표지는 그리지 않는다 */
  const j = d.judge, poc = home || !!j, sName = j ? judgeName(j) : statusLabel(r), sTip = j ? judgeTip(j) : statusTip(r), sKey = j ? j.cls ?? 'none' : statusOf(r), pd = !j && pastDueOf(r);
  return (
    <>
      {d.from ? <div role="note" title={`옛 사업 id ${d.from.id}(${d.from.name})는 이 사업으로 합쳤습니다`}><FactNote className="ui-inset" tip={{ label: '합쳐진 옛 id', children: <p>옛 사업 id {d.from.id}({d.from.name})는 이 사업으로 합쳤습니다</p> }}>옛 id {d.from.id} 합쳐짐</FactNote></div> : null}
      <Card render={<section aria-label="단계와 핵심 수치" />} className="flex flex-col gap-3">
        <StageSteps home={home} current={r.board} reached={r.reached} listHref={stageHref(r.board)} />
        {home ? <HomeKpis r={r} progress={last} /> : <section aria-label="핵심 수치" className="relative grid grid-cols-3 gap-2.5 mobile:grid-cols-1 @max-[560px]:grid-cols-1">
          <Kpi variant="inset" label="계획" value={r.units > 0 ? fmt(r.units) : '—'} unit={r.units > 0 ? '호' : ''} sub={r.units > 0 ? undefined : '호수 미확인'} tip="사업 계획 호수(원장의 첫 물량 — 공공 공급계획 → 인허가 → 공고 → 사업계획)" />
          {r.notice != null ? <Kpi variant="inset" label="공고 확인" value={fmt(r.notice)} tone="var(--st-sale)" sub={r.units > 0 ? `계획의 ${pct1(r.notice / r.units * 100)}%` : undefined} tip="모집공고에서 확인한 호수(공고 확인 ≠ 준공)" /> : null}
          {last ? <Kpi variant="inset" label="공정률" value={pct1(last[1])} unit="%" tone="var(--st-build)" sub={`보고 ${dayText(last[0])}`} tip="LH 공사진행 보고의 마지막 값" /> : null}
          <span className="absolute top-1.5 right-1.5">
            <InfoTip label="핵심 수치">
              <dl>
                <dt>계획</dt><dd>사업 계획 호수(원장의 첫 물량 — 공공 공급계획 → 인허가 → 공고 → 사업계획 순)</dd>
                {r.notice != null ? <><dt>공고 확인</dt><dd>모집공고에서 확인한 호수(공고가 났다고 공사를 마친 것은 아님)</dd></> : null}
                {last ? <><dt>공정률</dt><dd>LH 공사진행 보고의 마지막 값({dayText(last[0])} 보고) · 소수 한 자리</dd></> : null}
              </dl>
            </InfoTip>
          </span>
        </section>}
      </Card>

      <Card render={<section aria-label="단계 타임라인" />}>
        <PanelHead title="단계 타임라인"
          tip={poc ? `사업 원장 ${mapId}(같은 현장 원천 ${d.ledger?.rows ?? j?.rows.length ?? 1}행)의 일정 — 단계마다 두 줄: 현재 = 원장의 현재 예정 하나 · 실제 = 원천에서 확인한 날짜 · 상태는 정책 진행 자료 판정(부족률)이라 예정일 경과 표지는 그리지 않음` : '단계마다 두 줄: 현재 = 원장의 현재 예정 하나 · 실제 = 원천에서 확인한 날짜 · 지연 = 현재 예정일 경과 개월(당초 대비가 아님) · 기록이 하나도 없는 단계는 줄을 그리지 않음 · 오른쪽 열은 지연 개월'}>
          <TimelineLegend t={tl} />
          <InfoTip label="상태·일정 읽는 법">
            <dl>
              <dt>{sName}</dt><dd>{sTip}</dd>
              {pd ? <><dt>{PAST_DUE_UNDER}</dt><dd>현재 예정일 {dayText(r.overdue!.planned)}이 기준일보다 앞섰지만 실제 기록이 없음 — 1개월 미만이라 상태는 그대로</dd></> : null}
              {alt ? <><dt>{alt.text}</dt><dd>{alt.title.replace(/^준공 예정이 원천마다 다름 — /, '준공 예정: ').replace(/HOME/g, '사업 원장')}</dd></> : null}
              <dt>당초 일정 없음</dt><dd>최초 약속 일정이 원장에 없어 당초 줄을 그리지 않음{poc ? '' : ' — 지연은 현재 예정일이 지난 개월로만 판정'}</dd>
              <dt>현재 · 실제</dt><dd>단계마다 두 줄: 현재 = 원장의 현재 예정 하나, 실제 = 원천에서 확인한 날짜 · 오른쪽 열은 예정이 지난 개월</dd>
            </dl>
          </InfoTip>
        </PanelHead>
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5 font-bold text-foreground" title={sTip}><SwatchMark {...STATUS_SW[sKey]} />{sName}</span>
          <span className="ml-auto text-muted-foreground" title={poc ? '최초 약속 일정(당초)이 사업 원장에 없어 당초 줄을 그리지 않음 — 상태는 정책 진행 자료의 단계 목표 대비 판정' : '최초 약속 일정(당초)이 사업 원장(HOME 포함)에 없어 당초 줄을 그리지 않음 — 지연은 현재 예정일 경과로만 판정'}>당초 일정 없음</span>
        </div>
        {pd ? <FactNote className="mb-2" tip={{ label: PAST_DUE_UNDER, children: <p>현재 예정일 {dayText(r.overdue!.planned)}이 기준일보다 앞섰지만 실제 기록이 없음 — 1개월 미만이라 상태는 그대로</p> }}>{PAST_DUE_UNDER} · {EVENT_NAME[r.overdue!.eventType]} 현재 예정일 {dayText(r.overdue!.planned)}</FactNote> : null}
        {alt ? <FactNote className="mb-2" tip={{ label: alt.text, children: <p>{alt.title.replace(/^준공 예정이 원천마다 다름 — /, '준공 예정: ').replace(/HOME/g, '사업 원장')}</p> }}>{alt.text}</FactNote> : null}
        <StageTimeline t={tl} />
      </Card>

      <Card render={<section aria-label="개요" />}>
        <PanelHead title="개요">
          <MapLink href={mapHref({ project: mapId })} full={`지도에서 이 사업 위치와 주변 교통·교육·전기 기반시설 보기 · 위치: ${ml ? LOC[ml] : NO_LOC_TIP(x.loc?.by)}`}>{`지도에서 보기 · ${loc}`}</MapLink>
          <PanelLink href={`/region?sido=${r.sgg.slice(0, 2)}`} full="이 시도의 앞으로 12개월 예정·지난 실적·동네 여건">지역 공급</PanelLink>
        </PanelHead>
        <dl className={FACTS}>
          <div><dt>시군구</dt><dd><Link href={`/projects?sgg=${r.sgg}`} title="이 시군구로 거른 사업 목록">{r.sggName}</Link></dd></div>
          <div><dt>위치</dt><dd>{ml ? <span title={ml === 'bundle' ? '지도 자료의 LH 블록·동 윤곽과 이어진 사업' : x.loc?.basis ?? undefined}>{LOC[ml]}</span> : <None tip={NO_LOC_TIP(x.loc?.by)}>위치 미확보</None>}{ml ? null : <span className="mt-0.5 flex items-center gap-0.5 text-sm text-muted-foreground"><span>위치 입력 필요</span><InfoTip label="위치 입력 안내"><dl><dt>안내</dt><dd>{lostGuide(r.stage, x.loc?.by === 'area')}</dd><dt>필수</dt><dd>{LOST_INPUT.required}</dd><dt>선택</dt><dd>{LOST_INPUT.optional}</dd><dt>확인</dt><dd>{LOST_INPUT.check}</dd></dl><p>{LOST_INPUT.note}</p></InfoTip></span>}</dd></div>
          <div><dt>시행</dt><dd title={home ? '정책 진행 자료의 기관 이름' : AGENCY_TIP[ag]}>{home ? r.agency : r.agency ? d.agencies[r.agency] ?? AGENCY_NAME[ag] : <None tip={AGENCY_TIP.etc}>미확인</None>}</dd></div>
          {j ? <div><dt>정책 진행 자료</dt><dd title={`이 사업에 합쳐진 정책 진행 자료 원천 행 ${j.rows.length}개 — 상태는 그중 가장 나쁜 판정`}>{j.rows.slice(0, JUDGE_SHOW).map((y, i) => <span key={y.id}>{i ? ' · ' : ''}<Link href={`/projects?id=${y.id}`} title={`${y.name} · ${judgeName(y)}${y.gap ? ` · 부족 ${fmt(Math.round(y.gap))}호` : ''}`}>{judgeName(y)}</Link></span>)}{j.rows.length > JUDGE_SHOW ? <span className="text-sm text-muted-foreground">{` 외 ${j.rows.length - JUDGE_SHOW}행`}</span> : null}</dd></div> : null}
          {d.ledger ? <div><dt>사업 원장</dt><dd title={`같은 현장을 합친 사업 원장 사업 — 이 사업에 합쳐진 원천 행 ${d.ledger.rows}개 · 일정·공정률·공고·근거는 이 사업 것`}><code className="text-sm">{d.ledger.id}</code>{d.ledger.rows > 1 ? <span className="text-sm text-muted-foreground"> · 원천 {d.ledger.rows}행 합침</span> : null}</dd></div> : null}
          <div><dt>구분</dt><dd title={x.basis ?? undefined}>{SCOPE[x.scope] ?? x.scope} · {UNIT[x.unit] ?? x.unit}</dd></div>
          <div><dt>정책 연결</dt><dd>{pol.length ? pol.map((p, i) => <span key={p.key} title={`정책 연결: ${r.link === 'CONFIRMED' ? '담당자가 확정함' : '담당자가 아직 확정하지 않은 제안'}`}>{i ? ' · ' : ''}{policyLabel(p)}</span>) : <None>연결 없음</None>}</dd></div>
        </dl>
        {x.notices?.length ? (
          <ul className="mt-3 mb-0 flex list-none flex-col gap-1.5 p-0 text-sm" aria-label="청약 공고">
            {x.notices.map((n) => (
              <li key={`${n.system}${n.id}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {n.url ? (
                  <a href={n.url} target="_blank" rel="noopener noreferrer" title={`${NOTICE_SITE[n.system] ?? '원문'} 공고 상세가 새 창으로 열려요`}>{n.title}<ExternalLink className="ml-1 inline size-3.5 align-text-bottom" aria-hidden="true" /><span className="sr-only">(새 창)</span></a>
                ) : <span>{n.title}</span>}
                {n.date ? <span className="tabular-nums text-muted-foreground">{dayText(n.date)}</span> : null}
                {n.review !== 'CONFIRMED' ? <Badge title="사업과 공고의 연결이 아직 확정되지 않았어요">확인 필요</Badge> : null}
              </li>
            ))}
            {x.noticesMore ? <li className="text-muted-foreground">{`외 ${x.noticesMore}건`}</li> : null}
          </ul>
        ) : null}
      </Card>

      <Card render={<details className="group" />}>
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-0.5 rounded-chip px-1 text-base font-bold hover:bg-pn2 focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-4 flex-none text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />근거
          <span className="font-normal text-muted-foreground">출처 {x.refs.length}곳{edition ? <span title={`사업 원장의 원천 HOME(국토교통부 정책·LH·SH·GH 원천을 모은 팀 자료)을 받은 날 — 화면의 '자료 기준'(원장 기준일 ${dayText(d.referenceDate)})과 다른 날짜`}>{` · 사업 원장(HOME) ${edition[1]}.${edition[2]}.${edition[3]} 받음`}</span> : ''}</span>
        </summary>
        <div className="mt-2 border-t border-border px-1 pt-2">
          <Dl className="text-sm">
            {x.refs.map((ref) => {
              const s = d.sources[ref];
              return s ? [
                <dt key={`t${ref}`}>출처</dt>,
                <dd key={`d${ref}`}>
                  {s.provider.replace(/HOME 덤프/g, '사업 원장(HOME)')} · {s.dataset}
                  <span className="text-muted-foreground tabular-nums">{s.asOf ? ` · 기준 ${dayText(s.asOf)}` : ''}{s.collectedAt ? ` · 수집 ${dayText(s.collectedAt)}` : ''}</span>
                  {s.url ? <> · <a href={s.url} target="_blank" rel="noopener noreferrer">원문</a></> : null}
                </dd>,
              ] : null;
            })}
            <dt>기준일</dt>
            <dd className="tabular-nums">
              <span className="whitespace-nowrap" title="원장 기준일">원장 {dayText(d.referenceDate)}</span>{' · '}
              <span className="whitespace-nowrap" title="사업 id 발급일">발급 {dayText(x.issuedAt)}</span>{' · '}
              <span className="whitespace-nowrap" title="사업 레코드 기준일">사업 {dayText(x.asOf)}</span>
            </dd>
          </Dl>
        </div>
      </Card>
    </>
  );
}
