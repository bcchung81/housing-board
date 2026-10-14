import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import StageLadder from '../../../../components/StageLadder';
import PanelLink from '../../../../components/board/PanelLink';
import ProjectTimeline, { TimelineLegend } from '../../../../components/projects/ProjectTimeline';
import { Dash, Dl, Page, PageHead, PanelHead, kpisGrid } from '../../../../components/page';
import { Kpi } from '../../../../components/ui';
import { Badge } from '../../../../components/ui/badge';
import { buttonVariants } from '../../../../components/ui/button';
import { Card } from '../../../../components/ui/card';
import { DataGrid } from '../../../../components/ui/data-grid';
import { sidoName } from '../../../../lib/board/calc';
import { getBoardData } from '../../../../lib/board/data';
import { getProjectDetail, getProjectRow } from '../../../../lib/board/projects-index';
import { BOARD_CIR, BOARD_COLOR, BOARD_NAMES, EVENT_NAME, STATUS_NAME, STATUS_TIP, scheduleOf, statusOf, timelineOf, ymText } from '../../../../lib/board/projects-view';
import { DETAILS } from '../../../../lib/shell/menu';
import type { Cell, Col, Row } from '../../../../lib/grid/spec';

type Props = { params: Promise<{ id: string }> };
/* 발급 사업 전부(대체·숨김 포함 — 대체는 새 id 로 넘기고, 숨김은 안내한다)를 빌드 때 만든다 */
export const generateStaticParams = async () => (await getBoardData()).allProjects.map((p) => ({ id: p.id }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { allProjects } = await getBoardData();
  return { title: allProjects.find((p) => p.id === id)?.name ?? id };
}

const SCOPE: Record<string, string> = { PUBLIC: '공공', PRIVATE_ON_PUBLIC_LAND: '공공택지 민간', UNKNOWN: '미확인' };
const UNIT: Record<string, string> = { BLOCK: '블록', PROJECT: '사업', AREA_UNKNOWN: '구역 미상' };
const fmt = (n: number) => n.toLocaleString('en-US');
const dayText = (d: string | null | undefined) => (d ? d.slice(0, 10).replace(/-/g, '.') : null);

/* 사업 상세(L3): 머리(이름·프로그램·정책 연결) → 6단계 계단 → KPI 3(계획·공고 확인·공정률) → 주인공 차트 '단계 일정' → 개요 | 일정 표 → 근거(접힘).
   지금 단계는 계단이 보이므로 문장으로 다시 쓰지 않는다(단계마다 답할 질문은 계단 칸의 title). 지역 여건은 우리 동네 링크만 둔다(같은 정보 한 곳).
   건축HUB 관리번호(refs)는 공개 범위가 미결(기획서 Q4)이라 보이지 않는다. */
export default async function ProjectPage({ params }: Props) {
  const { id } = await params;
  const { molit, allProjects } = await getBoardData();
  const p = DETAILS.project.id.test(id) ? allProjects.find((x) => x.id === id) : undefined;
  if (!p) notFound();
  if (p.supersededBy) redirect(`/project/${p.supersededBy}`);   // 대체된 사업(수도권 → HOME 사업): 옛 주소는 새 사업으로
  const [det, lr] = await Promise.all([getProjectDetail(id), getProjectRow(id)]);
  const d = det?.detail, r = lr?.row;
  const area = { sido: p.sgg.slice(0, 2), name: r?.sggName ?? p.sgg };
  const sidoLabel = sidoName(molit, area.sido) ?? area.sido;
  const units = r?.units || p.units || 0;
  const lastProg = d?.progress.length ? d.progress[d.progress.length - 1] : null;
  const policies = r && lr ? lr.policies.filter((x) => r.policies.includes(x.key)) : [];
  const st = r ? statusOf(r) : null;
  const tl = d && det ? timelineOf(d, det.referenceDate) : null;
  const sched = d ? scheduleOf(d) : [];
  const edition = d?.refs.map((x) => /^home-dump-([^-]+)/.exec(x)?.[1]).find(Boolean);

  const schedCols: Col[] = [{ key: 'st', label: '단계', kind: 'text' }, { key: 'plan', label: '예정', kind: 'text' }, { key: 'act', label: '실제', kind: 'text' }, { key: 'diff', label: '차이(개월)', kind: 'text' }];
  const diffCell = (x: (typeof sched)[number]): Cell => {
    if (x.late) return { text: `경과 +${x.late.months}`, tone: x.late.cls === 'delay' ? 'bad' : 'warn', title: `현재 예정일 경과 ${x.late.months}개월 — ${STATUS_NAME[x.late.cls]}` };
    if (x.diff !== null) return { text: x.diff > 0 ? `+${x.diff}` : String(x.diff), title: '실제 − 예정(개월)' };
    return null;
  };
  const schedRows: Row[] = sched.map((x) => ({
    id: x.type,
    c: {
      st: { text: `${BOARD_CIR[x.board]} ${BOARD_NAMES[x.board]}`, swatch: BOARD_COLOR[x.board], title: `원장 사건 ${EVENT_NAME[x.type]}` },
      plan: x.plan ? ymText(x.plan) : null,
      act: x.actual ? ymText(x.actual) : x.est ? { text: `${ymText(x.est)} 추정`, muted: true, title: '이 날 이전 착공(공고·보증 발급일로 추정)' } : null,
      diff: diffCell(x),
    },
  }));

  return (
    <Page>
      <PageHead crumbs={[{ label: '종합상황판', href: '/' }, { label: '사업', href: '/projects' }, { label: p.name }]} title={p.name}
        tip={`${area.name} · ${units ? `${fmt(units)}호` : '호수 미확인'}`} meta={<code className="text-[14px]" title="사업 id">{p.id}</code>}>
        <span className="flex flex-wrap items-center gap-1.5 self-center">
          {r?.programs.map((g) => <Badge key={g} title="프로그램">{g}</Badge>)}
          {policies.map((x) => (
            <Badge key={x.key} title={`${x.name} · ${r?.link === 'CONFIRMED' ? '담당자가 확정한 정책 연결' : '담당자 확인 전 제안 연결(검토 중) · 해제된 연결은 빠짐'}`}>
              {x.short} · {r?.link === 'CONFIRMED' ? '확정' : '검토 중'}
            </Badge>
          ))}
        </span>
      </PageHead>

      {p.hiddenAt ? <Card render={<section aria-label="대체됨" />}><p>{`이 사업은 ${p.hiddenAt}부터 목록에서 뺐습니다(대체 사업 없음) — ${p.hiddenReason ?? '대응 사업이 없다'}.`}</p></Card> : null}
      <StageLadder current={p.stageCode} />

      {r ? (
        <section aria-label="핵심 수치" className={kpisGrid}>
          <Kpi label="계획" value={units ? fmt(units) : '—'} tip="사업 계획 호수(원장의 첫 물량 — 공공 공급계획 → 인허가 → 공고 → 사업계획)" />
          {r.notice != null ? <Kpi label="공고 확인" value={fmt(r.notice)} tone="var(--st-sale)" sub={units ? `계획의 ${(r.notice / units * 100).toFixed(0)}%` : undefined} tip="모집공고에서 확인한 호수(공고 확인 ≠ 준공)" /> : null}
          {lastProg ? <Kpi label="공정률" value={String(lastProg[1])} unit="%" tone="var(--st-build)" sub={`보고 ${dayText(lastProg[0])}`} tip="LH 공사진행 보고의 마지막 값" /> : null}
        </section>
      ) : null}

      {tl ? (
        <Card render={<section aria-label="단계 일정" />}>
          <PanelHead title="단계 일정" tip="리본 6칸의 현재 예정(점선)과 실제(실색) · ③착공 줄은 공사 기간 · 빨간 테두리는 현재 예정일 경과 6개월 이상, 노란 테두리는 1~6개월 · 아래 선은 공정률 보고">
            <TimelineLegend progress={!!d?.progress.length} />
          </PanelHead>
          <ProjectTimeline t={tl} />
        </Card>
      ) : null}

      <div className="grid grid-cols-2 items-start gap-3.5 narrow:grid-cols-1">
        <Card render={<section aria-label="개요" />}>
          <PanelHead title="개요">
            <PanelLink href={`/my-area/${area.sido}`} full={`우리 동네(${sidoLabel}) 공급 소식과 동네 여건`}>우리 동네</PanelLink>
          </PanelHead>
          <Dl>
            <dt>시군구</dt><dd><Link href={`/projects?sgg=${p.sgg}`} title="이 시군구로 거른 사업 목록">{area.name}</Link></dd>
            {d ? <><dt>시행</dt><dd>{d.agency ? det!.agencies[d.agency] ?? d.agency : <Dash why="시행 기관 미확인" />}</dd></> : null}
            {d ? <><dt>구분</dt><dd title={d.basis ?? undefined}>{SCOPE[d.scope] ?? d.scope} · {UNIT[d.unit] ?? d.unit}</dd></> : null}
            <dt>법정동</dt><dd className="tabular-nums">{(d?.bjd.length ? d.bjd : p.bjdCodes).join(', ') || <Dash why="법정동 미연결" />}</dd>
            {r && st ? <><dt>상태</dt><dd title={STATUS_TIP[st]}>{STATUS_NAME[st]}{r.next ? <span className="text-muted-foreground"> · 다음 {ymText(r.next.planned)} {EVENT_NAME[r.next.eventType]}</span> : null}</dd></> : null}
          </Dl>
          <a className={buttonVariants({ className: 'mt-4' })} href={`/map?project=${p.id}`}>지도에서 보기</a>
        </Card>

        {d ? (
          <Card render={<section aria-label="일정 표" />}>
            <PanelHead title="일정" tip="현재 예정 · 실제 · 차이(실제 − 예정, 개월). 오지 않은 단계는 예정일 경과 개월 — 6개월 이상 지연(빨강), 1~6개월 주의(노랑)" />
            <DataGrid label="단계 일정" cols={schedCols} rows={schedRows} sortable={false} />
          </Card>
        ) : null}
      </div>

      <details className="group rounded-[12px] border border-border bg-card print:hidden">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-0.5 rounded-[12px] px-4 py-2.5 text-[15px] font-bold hover:bg-pn2 focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-4 flex-none text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />근거
          <span className="font-normal text-muted-foreground">{[p.source.provider, edition && `판 ${edition}`].filter(Boolean).join(' · ')}</span>
        </summary>
        <div className="border-t border-border px-4 py-3">
          <Dl className="text-[14px]">
            <dt>사업 출처</dt><dd>{p.source.provider} · {p.source.dataset}{p.source.url ? <> · <a href={p.source.url} target="_blank" rel="noopener noreferrer">원문</a></> : null}</dd>
            {d?.refs.map((ref) => {
              const s = det!.sources[ref];
              return s ? [
                <dt key={`t${ref}`}>원천</dt>,
                <dd key={`d${ref}`}>
                  {s.provider} · {s.dataset}
                  <span className="text-muted-foreground tabular-nums">{s.asOf ? ` · 기준 ${dayText(s.asOf)}` : ''}{s.collectedAt ? ` · 수집 ${dayText(s.collectedAt)}` : ''}</span>
                  {s.url ? <> · <a href={s.url} target="_blank" rel="noopener noreferrer">원문</a></> : null}
                </dd>,
              ] : null;
            })}
            <dt>기준일</dt>
            <dd className="tabular-nums">
              <span className="whitespace-nowrap" title="원장 기준일">원장 {det?.referenceDate ?? p.asOf}</span>
              {' · '}<span className="whitespace-nowrap" title="사업 id 발급일">발급 {p.issuedAt}</span>
              {d ? <>{' · '}<span className="whitespace-nowrap" title="사업 레코드 기준일">사업 {d.asOf}</span></> : null}
            </dd>
          </Dl>
        </div>
      </details>
    </Page>
  );
}
