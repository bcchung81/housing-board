/* 사업 상세 서랍의 내용(서버가 그린다 — 자료는 lib/board/projects-index.ts getProjectDrawer). 시안: docs/design/home-concept/assets/app.js renderDetail.
   머리(이름·프로그램·정책(연결 상태는 title)·id) → 단계 줄(①~⑥, 목록과 같은 번호·색) → 핵심 수치(계획·공고 확인·공정률, 있는 것만) → 단계 타임라인(상태·'당초 일정 없음' 한 번) → 개요(지도에서 보기 · 위치 종류) → 근거(접힘).
   숨김 사업(대응 사업 없음)은 한 줄 안내와 개요만. 대체된 옛 id 는 대표 사업을 그리고 맨 위에 한 줄 안내. 건축HUB 관리번호는 공개 범위가 미결(기획서 Q4)이라 보이지 않는다. */
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import PanelLink from '@/components/board/PanelLink';
import { Dl, PanelHead } from '@/components/page';
import { Kpi } from '@/components/ui';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import StageSteps from './StageSteps';
import StageTimeline, { TimelineLegend } from './StageTimeline';
import { mapHref } from '@/lib/board/map-href';
import type { Drawer } from '@/lib/board/projects-index';
import InfoTip from '@/components/ui/info-tip';
import { AGENCY_NAME, AGENCY_TIP, EVENT_NAME, PAST_DUE_UNDER, agencyKey, dateAltOf, dayText, hiddenNote, LOST_INPUT, lostGuide, mapLocOf, pastDueOf, pct1, policyLabel, statusLabel, statusTip, timelineOf } from '@/lib/board/projects-view';

const SCOPE: Record<string, string> = { PUBLIC: '공공', PRIVATE_ON_PUBLIC_LAND: '공공택지 민간', UNKNOWN: '미확인' };
const UNIT: Record<string, string> = { BLOCK: '블록', PROJECT: '사업', AREA_UNKNOWN: '구역 미상' };
const LOC: Record<string, string> = { bundle: 'LH 블록·동 윤곽(지도 자료)', block: 'LH 블록 대표점', address: '주소 근사점', district: '지구 대표점', area: '근사 영역(시군구·동)', parcel: '필지', name: '이름 검색 위치' };
/* 지도 링크 옆 짧은 위치 종류: 블록·지구·근사·미확보. 판정은 지도와 같은 기준(projects-view mapLocOf — 2026-10-16 2차 평가: 계양 A2 가 지도에는 블록·동 10개, 서랍은 '미확보'였다) */
const LOC_SHORT: Record<string, string> = { bundle: '블록', block: '블록', address: '근사', district: '지구', name: '근사' };
const NO_LOC_TIP = (by: string | undefined) => `지도에 그릴 위치가 없음(${by ? `${LOC[by] ?? by}뿐` : '좌표 없음'}) — 지도에서는 시군구로 열리고 '위치 미확보' 묶음에 들어감`;
const fmt = (n: number) => n.toLocaleString('en-US');
const NOTE = 'm-0 ui-inset text-base text-muted-foreground';
const FACTS = 'm-0 grid grid-cols-[repeat(auto-fit,minmax(min(180px,100%),1fr))] gap-x-10 gap-y-3 text-base leading-body [&_dd]:m-0 [&_dt]:text-sm [&_dt]:text-muted-foreground';
const MARK = 'inline-block rounded-chip bg-muted px-2 py-0.5 text-sm leading-none whitespace-nowrap text-muted-foreground';
const None = ({ children, tip }: { children: string; tip?: string }) => <span className="text-sm whitespace-nowrap text-muted-foreground" title={tip}>{children}</span>;
/* 지도로 가는 링크는 <a>(지도는 루트 레이아웃이 달라 새 문서로 연다) — 모양은 PanelLink */
const MapLink = ({ href, full, children }: { href: string; full: string; children: string }) => (
  <a href={href} title={full} className="group/action inline-flex flex-none items-center gap-px rounded-chip text-sm leading-body whitespace-nowrap text-muted-foreground no-underline underline-offset-[3px] transition-colors hover:text-primary hover:underline focus-visible:text-primary focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
    <span>{children}</span><ChevronRight className="size-3.5 shrink-0 transition-transform group-hover/action:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
  </a>
);

/* 머리 줄의 배지(프로그램·정책 연결)와 id */
export function DrawerHead({ d }: { d: Drawer }) {
  if (d.kind === 'hidden') return <code className="ml-auto text-sm text-muted-foreground" title="사업 id">{d.project.id}</code>;
  const r = d.row, pol = d.policies.filter((x) => r.policies.includes(x.key)), fixed = r.link === 'CONFIRMED';
  return (
    <>
      {/* 제목은 지도와 같은 짧은 이름(d.label), 원장 사업 이름은 부제(2026-10-15 평가: 지도 '고양창릉 A4' ↔ 서랍 '…A-4BL 아파트 건설공사 1공구') */}
      {d.label && d.label !== r.name ? <span data-slot="drawer-full" className="basis-full text-sm text-muted-foreground" title="사업 원장 이름">{r.name}</span> : null}
      <span className="flex flex-wrap items-center gap-1.5">
        {r.programs.map((g) => <Badge key={g} title="프로그램">{g}</Badge>)}
        {pol.map((x) => <Badge key={x.key} title={`${x.name} · 정책 연결: ${fixed ? '담당자가 확정함' : '담당자가 아직 확정하지 않은 제안(해제된 연결은 빠짐)'}`}>{policyLabel(x)}</Badge>)}
      </span>
      <code className="text-sm text-muted-foreground" title="사업 id">{r.id}</code>
    </>
  );
}

/* stageHref: 단계 줄 칸의 주소(목록 화면의 지금 거르기를 유지 — 화면이 만든다) */
export default function ProjectDetail({ d, stageHref }: { d: Drawer; stageHref: (i: number) => string }) {
  if (d.kind === 'hidden') {
    const p = d.project, h = hiddenNote(p.hiddenAt!, p.hiddenReason);
    return (
      <>
        <p role="note" aria-label="목록에서 뺀 사업" className={NOTE} title={h.title}>{h.text}</p>
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
  const ml = mapLocOf(r, x.loc);   // 지도에 그리는 위치(지도와 같은 판정) — null 이면 위치 미확보
  const loc = ml ? LOC_SHORT[ml] : '미확보';
  const alt = dateAltOf(r, true);   // 원천 날짜 다름(D2): 판정은 원장 날짜, 표지만 — 서랍은 LH 날짜를 일까지(같은 달이어도 무엇이 다른지 보이게)
  return (
    <>
      {d.from ? <p role="note" className={NOTE} title={`옛 사업 id ${d.from.id}(${d.from.name})는 이 사업으로 합쳤습니다`}>옛 id {d.from.id} 합쳐짐</p> : null}
      <Card render={<section aria-label="단계와 핵심 수치" />} className="flex flex-col gap-3">
        <StageSteps current={r.board} reached={r.reached} listHref={stageHref(r.board)} />
        <section aria-label="핵심 수치" className="relative grid grid-cols-3 gap-2.5 mobile:grid-cols-1">
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
        </section>
      </Card>

      <Card render={<section aria-label="단계 타임라인" />}>
        <PanelHead title={<>단계 타임라인<span className="ml-2 text-sm font-normal text-muted-foreground"><span title={statusTip(r)}>{statusLabel(r)}</span>{pastDueOf(r) ? <> · <span className={MARK} title={`${EVENT_NAME[r.overdue!.eventType]} 현재 예정일 ${dayText(r.overdue!.planned)}이 기준일보다 앞섰지만 실제 기록이 없음 — 1개월 미만이라 상태는 그대로`}>{PAST_DUE_UNDER}</span></> : null}{alt ? <> · <span className={MARK} title={alt.title}>{alt.text}</span></> : null} · <span className={MARK} title="최초 약속 일정(당초)이 사업 원장(HOME 포함)에 없어 당초 줄을 그리지 않음 — 지연은 현재 예정일 경과로만 판정">당초 일정 없음</span></span></>}
          tip="단계마다 두 줄: 현재 = 원장의 현재 예정 하나 · 실제 = 원천에서 확인한 날짜 · 지연 = 현재 예정일 경과 개월(당초 대비가 아님) · 기록이 하나도 없는 단계는 줄을 그리지 않음 · 오른쪽 열은 지연 개월">
          <TimelineLegend t={tl} />
          <InfoTip label="상태·일정 읽는 법">
            <dl>
              <dt>{statusLabel(r)}</dt><dd>{statusTip(r)}</dd>
              {pastDueOf(r) ? <><dt>{PAST_DUE_UNDER}</dt><dd>현재 예정일 {dayText(r.overdue!.planned)}이 기준일보다 앞섰지만 실제 기록이 없음 — 1개월 미만이라 상태는 그대로</dd></> : null}
              {alt ? <><dt>{alt.text}</dt><dd>{alt.title.replace(/^준공 예정이 원천마다 다름 — /, '준공 예정: ').replace(/HOME/g, '사업 원장')}</dd></> : null}
              <dt>당초 일정 없음</dt><dd>최초 약속 일정이 원장에 없어 당초 줄을 그리지 않음 — 지연은 현재 예정일이 지난 개월로만 판정</dd>
              <dt>현재 · 실제</dt><dd>단계마다 두 줄: 현재 = 원장의 현재 예정 하나, 실제 = 원천에서 확인한 날짜 · 오른쪽 열은 예정이 지난 개월</dd>
            </dl>
          </InfoTip>
        </PanelHead>
        <StageTimeline t={tl} />
      </Card>

      <Card render={<section aria-label="개요" />}>
        <PanelHead title="개요">
          <MapLink href={mapHref({ project: r.id })} full={`지도에서 이 사업 위치와 주변 교통·교육·전기 기반시설 보기 · 위치: ${ml ? LOC[ml] : NO_LOC_TIP(x.loc?.by)}`}>{`지도에서 보기 · ${loc}`}</MapLink>
          <PanelLink href={`/region?sido=${r.sgg.slice(0, 2)}`} full="이 시도의 앞으로 12개월 예정·지난 실적·동네 여건">지역 공급</PanelLink>
        </PanelHead>
        <dl className={FACTS}>
          <div><dt>시군구</dt><dd><Link href={`/projects?sgg=${r.sgg}`} title="이 시군구로 거른 사업 목록">{r.sggName}</Link></dd></div>
          <div><dt>위치</dt><dd>{ml ? <span title={ml === 'bundle' ? '지도 자료의 LH 블록·동 윤곽과 이어진 사업' : x.loc?.basis ?? undefined}>{LOC[ml]}</span> : <None tip={NO_LOC_TIP(x.loc?.by)}>위치 미확보</None>}{ml ? null : <span className="mt-0.5 flex items-center gap-0.5 text-sm text-muted-foreground"><span>위치 입력 필요</span><InfoTip label="위치 입력 안내"><dl><dt>안내</dt><dd>{lostGuide(r.stage, x.loc?.by === 'area')}</dd><dt>필수</dt><dd>{LOST_INPUT.required}</dd><dt>선택</dt><dd>{LOST_INPUT.optional}</dd><dt>확인</dt><dd>{LOST_INPUT.check}</dd></dl><p>{LOST_INPUT.note}</p></InfoTip></span>}{x.bjd.length ? <span className="text-muted-foreground tabular-nums" title="법정동 코드"> · {x.bjd.join(', ')}</span> : null}</dd></div>
          <div><dt>시행</dt><dd title={AGENCY_TIP[ag]}>{r.agency ? d.agencies[r.agency] ?? AGENCY_NAME[ag] : <None tip={AGENCY_TIP.etc}>미확인</None>}</dd></div>
          <div><dt>구분</dt><dd title={x.basis ?? undefined}>{SCOPE[x.scope] ?? x.scope} · {UNIT[x.unit] ?? x.unit}</dd></div>
          <div><dt>정책 연결</dt><dd>{pol.length ? pol.map((p, i) => <span key={p.key} title={`정책 연결: ${r.link === 'CONFIRMED' ? '담당자가 확정함' : '담당자가 아직 확정하지 않은 제안'}`}>{i ? ' · ' : ''}{policyLabel(p)}</span>) : <None>연결 없음</None>}</dd></div>
        </dl>
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
