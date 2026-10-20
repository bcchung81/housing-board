'use client';
/* 사업 창 내용(제목 · 머리 부속 · 본문)을 관점·종류에 맞는 부품으로: 정책담당자 = ProjectDetail(+DrawerHead) · Candidate(+CandidateHead), 일반사용자 = PublicDetail(+PublicHead).
   자료는 projectWindow(서버) 결과뿐이고, 지금 보는 화면의 거르기에 따라 달라지는 '같은 단계' 링크만 여기서 만든다(nav.ts sameStageHref). 2026-10-19 */
import ProjectDetail, { DrawerHead } from '@/components/projects/ProjectDetail';
import Candidate, { CandidateHead } from '@/components/projects/Candidate';
import PublicDetail, { PublicHead } from '@/components/citizen/PublicDetail';
import type { ProjectWindow } from '@/lib/board/project-window';
import { sameStageHref } from './nav';

export function windowParts(d: ProjectWindow, loc: { pathname: string; search: string }, today: string) {
  if (d.view === 'public') {
    const sameStage = d.sameStage ? sameStageHref(loc.pathname, loc.search, '/citizen/projects', d.sameStage) : null;
    return { title: d.title, head: <PublicHead head={d.head} />, body: <PublicDetail d={d} x={d.extra ?? undefined} today={d.today ?? today} pastDue={d.pastDue} links={{ ...d.links, sameStage }} /> };
  }
  /* 단계 줄의 '같은 단계 사업 목록': 사업 화면이면 지금 거르기를 두고 그 단계, 다른 화면이면 /projects?stage= */
  const stageHref = (i: number) => sameStageHref(loc.pathname, loc.search, '/projects', String(i));
  if (d.kind === 'candidate') return { title: d.title, head: <CandidateHead row={d.row} />, body: <Candidate row={d.row} sggName={d.sggName} sources={d.sources} stageHref={stageHref} /> };
  return { title: d.title, head: <DrawerHead d={d} />, body: <ProjectDetail d={d} stageHref={stageHref} /> };
}
