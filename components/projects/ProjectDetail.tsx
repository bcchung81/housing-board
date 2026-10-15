/* 사업 상세 서랍의 내용(서버가 그린다 — 자료는 lib/board/projects-index.ts getProjectDrawer). 시안: docs/design/home-concept/assets/app.js renderDetail.
   머리(이름·프로그램·정책(연결 상태는 title)·id) → 단계 줄(①~⑥, 목록과 같은 번호·색 — 공식 01~06 은 보조 표기) → 핵심 수치(계획·공고 확인·공정률, 있는 것만) → 단계 타임라인(상태·'당초 일정 없음' 한 번) → 개요(지도에서 보기 · 위치 종류) → 근거(접힘).
   숨김 사업(대응 사업 없음)은 한 줄 안내와 개요만. 대체된 옛 id 는 대표 사업을 그리고 맨 위에 한 줄 안내. 건축HUB 관리번호는 공개 범위가 미결(기획서 Q4)이라 보이지 않는다. */
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import PanelLink from '../board/PanelLink';
import { Dl, PanelHead } from '../page';
import { Kpi } from '../ui';
import { Badge } from '../ui/badge';
import { Card } from '../ui/card';
import StageSteps from './StageSteps';
import StageTimeline, { TimelineLegend } from './StageTimeline';
import { mapHref } from '../../lib/board/map-href';
import type { Drawer } from '../../lib/board/projects-index';
import { AGENCY_NAME, AGENCY_TIP, EVENT_NAME, PAST_DUE, agencyKey, dayText, hiddenNote, pastDueOf, policyLabel, statusLabel, statusTip, timelineOf } from '../../lib/board/projects-view';

const SCOPE: Record<string, string> = { PUBLIC: '공공', PRIVATE_ON_PUBLIC_LAND: '공공택지 민간', UNKNOWN: '미확인' };
const UNIT: Record<string, string> = { BLOCK: '블록', PROJECT: '사업', AREA_UNKNOWN: '구역 미상' };
const LOC: Record<string, string> = { block: 'LH 블록 대표점', address: '주소 근사점', district: '지구 대표점', area: '근사 영역(시군구·동)', parcel: '필지', name: '이름 검색 위치' };
/* 지도 링크 옆 짧은 위치 종류: 블록·지번·지구·근사·미확보 */
const LOC_SHORT: Record<string, string> = { block: '블록', parcel: '지번', address: '근사', district: '지구', area: '근사', name: '근사' };
const fmt = (n: number) => n.toLocaleString('en-US');
const NOTE = 'm-0 rounded-[10px] border border-border bg-muted px-4 py-2.5 text-[15px] text-muted-foreground';
const FACTS = 'm-0 grid grid-cols-[repeat(auto-fit,minmax(min(180px,100%),1fr))] gap-x-10 gap-y-3 text-[16px] leading-[1.6] [&_dd]:m-0 [&_dt]:text-[14px] [&_dt]:text-muted-foreground';
const MARK = 'inline-block rounded-[4px] bg-muted px-1.5 text-[13px] leading-[19px] whitespace-nowrap text-muted-foreground';
const None = ({ children, tip }: { children: string; tip?: string }) => <span className="text-[13px] whitespace-nowrap text-muted-foreground" title={tip}>{children}</span>;
/* 지도로 가는 링크는 <a>(지도는 루트 레이아웃이 달라 새 문서로 연다) — 모양은 PanelLink */
const MapLink = ({ href, full, children }: { href: string; full: string; children: string }) => (
  <a href={href} title={full} className="group/action inline-flex flex-none items-center gap-px rounded-[4px] text-[14px] leading-[1.45] whitespace-nowrap text-muted-foreground no-underline underline-offset-[3px] transition-colors hover:text-primary hover:underline focus-visible:text-primary focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
    <span>{children}</span><ChevronRight className="size-3.5 shrink-0 transition-transform group-hover/action:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
  </a>
);

/* 머리 줄의 배지(프로그램·정책 연결)와 id */
export function DrawerHead({ d }: { d: Drawer }) {
  if (d.kind === 'hidden') return <code className="ml-auto text-[14px] text-muted-foreground" title="사업 id">{d.project.id}</code>;
  const r = d.row, pol = d.policies.filter((x) => r.policies.includes(x.key)), fixed = r.link === 'CONFIRMED';
  return (
    <>
      <span className="flex flex-wrap items-center gap-1.5">
        {r.programs.map((g) => <Badge key={g} title="프로그램">{g}</Badge>)}
        {pol.map((x) => <Badge key={x.key} title={`${x.name} · 정책 연결: ${fixed ? '담당자가 확정함' : '담당자가 아직 확정하지 않은 제안(해제된 연결은 빠짐)'}`}>{policyLabel(x)}</Badge>)}
      </span>
      <code className="text-[14px] text-muted-foreground" title="사업 id">{r.id}</code>
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
  const loc = x.loc ? LOC_SHORT[x.loc.by] ?? '근사' : '미확보';
  return (
    <>
      {d.from ? <p role="note" className={NOTE}>옛 사업 id {d.from.id}({d.from.name})는 이 사업으로 합쳤습니다</p> : null}
      <div className="flex flex-col gap-3">
        <StageSteps current={r.board} reached={r.reached} href={stageHref} />
        <section aria-label="핵심 수치" className="grid grid-cols-3 gap-2.5 mobile:grid-cols-1">
          <Kpi label="계획" value={r.units > 0 ? fmt(r.units) : '—'} unit={r.units > 0 ? '호' : ''} sub={r.units > 0 ? undefined : '호수 미확인'} tip="사업 계획 호수(원장의 첫 물량 — 공공 공급계획 → 인허가 → 공고 → 사업계획)" />
          {r.notice != null ? <Kpi label="공고 확인" value={fmt(r.notice)} tone="var(--st-sale)" sub={r.units > 0 ? `계획의 ${(r.notice / r.units * 100).toFixed(0)}%` : undefined} tip="모집공고에서 확인한 호수(공고 확인 ≠ 준공)" /> : null}
          {last ? <Kpi label="공정률" value={String(last[1])} unit="%" tone="var(--st-build)" sub={`보고 ${dayText(last[0])}`} tip="LH 공사진행 보고의 마지막 값" /> : null}
        </section>
      </div>

      <Card render={<section aria-label="단계 타임라인" />}>
        <PanelHead title={<>단계 타임라인<span className="ml-2 text-[14px] font-normal text-muted-foreground"><span title={statusTip(r)}>{statusLabel(r)}</span>{pastDueOf(r) ? <> · <span className={MARK} title={`${EVENT_NAME[r.overdue!.eventType]} 현재 예정일 ${dayText(r.overdue!.planned)}이 기준일보다 앞섰지만 실제 기록이 없음 — 경과 1개월 미만이라 상태는 그대로`}>{PAST_DUE}</span></> : null} · <span className={MARK} title="최초 약속 일정(당초)이 원장·HOME 자료에 없어 당초 줄을 그리지 않음 — 지연은 현재 예정일 경과로만 판정">당초 일정 없음</span></span></>}
          tip="단계마다 두 줄: 현재 = 원장의 현재 예정 하나 · 실제 = 원천에서 확인한 날짜 · 지연 = 현재 예정일 경과 개월(당초 대비가 아님) · 기록이 하나도 없는 단계는 줄을 그리지 않음 · 오른쪽 열은 지연 개월">
          <TimelineLegend t={tl} />
        </PanelHead>
        <StageTimeline t={tl} />
      </Card>

      <Card render={<section aria-label="개요" />}>
        <PanelHead title="개요">
          <MapLink href={mapHref({ project: r.id })} full={`지도에서 이 사업 위치와 주변 교통·교육·전기 기반시설 보기 · 위치: ${x.loc ? LOC[x.loc.by] ?? x.loc.by : '좌표 미확보(시군구로 보임)'}`}>{`지도에서 보기 · ${loc}`}</MapLink>
          <PanelLink href={`/region?sido=${r.sgg.slice(0, 2)}`} full="이 시도의 앞으로 12개월 예정·지난 실적·동네 여건">지역 공급</PanelLink>
        </PanelHead>
        <dl className={FACTS}>
          <div><dt>시군구</dt><dd><Link href={`/projects?sgg=${r.sgg}`} title="이 시군구로 거른 사업 목록">{r.sggName}</Link></dd></div>
          <div><dt>위치</dt><dd>{x.loc ? <span title={x.loc.basis ?? undefined}>{LOC[x.loc.by] ?? x.loc.by}</span> : <None>좌표 없음</None>}{x.bjd.length ? <span className="text-muted-foreground tabular-nums" title="법정동 코드"> · {x.bjd.join(', ')}</span> : null}</dd></div>
          <div><dt>시행</dt><dd title={AGENCY_TIP[ag]}>{r.agency ? d.agencies[r.agency] ?? AGENCY_NAME[ag] : <None tip={AGENCY_TIP.etc}>미확인</None>}</dd></div>
          <div><dt>구분</dt><dd title={x.basis ?? undefined}>{SCOPE[x.scope] ?? x.scope} · {UNIT[x.unit] ?? x.unit}</dd></div>
          <div><dt>정책 연결</dt><dd>{pol.length ? pol.map((p, i) => <span key={p.key} title={`정책 연결: ${r.link === 'CONFIRMED' ? '담당자가 확정함' : '담당자가 아직 확정하지 않은 제안'}`}>{i ? ' · ' : ''}{policyLabel(p)}</span>) : <None>연결 없음</None>}</dd></div>
        </dl>
      </Card>

      <details className="group rounded-[12px] border border-border bg-card">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-0.5 rounded-[12px] px-4 py-2.5 text-[15px] font-bold hover:bg-pn2 focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-4 flex-none text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />근거
          <span className="font-normal text-muted-foreground">출처 {x.refs.length}곳{edition ? ` · 자료 기준 ${edition[1]}.${edition[2]}.${edition[3]}` : ''}</span>
        </summary>
        <div className="border-t border-border px-4 py-3">
          <Dl className="text-[14px]">
            {x.refs.map((ref) => {
              const s = d.sources[ref];
              return s ? [
                <dt key={`t${ref}`}>출처</dt>,
                <dd key={`d${ref}`}>
                  {s.provider.replace(/HOME 덤프/g, 'HOME 자료')} · {s.dataset}
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
      </details>
    </>
  );
}
