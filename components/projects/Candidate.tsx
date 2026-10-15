/* 간단 보기 서랍(/projects?cand=<원장 id>): 상세 자료(일정·공정률·근거)가 없는 사업 — 대부분 사업 번호가 아직 없는 후보 사업 — 을 목록 색인 자료만으로 보인다.
   요청 때 서버가 그린다(정적 페이지를 만들지 않는다). 이름·시군구·단계·호수·예정·판정·출처 + 안내 한 줄.
   후보 사업의 예정은 원천(건축HUB·LH 파일)에 적힌 값이라 '원천 예정(확인 필요)'로 이름을 붙이고, 안내 글도 예정 유무에 맞춘다(일정 없음 ↔ 예정 표시 모순을 없앤다).
   후보 사업의 원장 id 는 다음 원장에서 바뀔 수 있어 상세(?id=)와 주소를 나눈다. 건축HUB 관리번호는 공개 범위 미결이라 보이지 않는다. */
import Link from 'next/link';
import StageSteps from './StageSteps';
import { Card } from '../ui/card';
import { PanelHead } from '../page';
import { mapHref } from '../../lib/board/map-href';
import { BOARD_CIR, BOARD_NAMES, CAND_NAME, CAND_PLAN, PLAN_COL, isMetro, lateOf, nextOf, statusLabel, statusOf, statusTip, type ProjectRow } from '../../lib/board/projects-view';

const fmt = (n: number) => n.toLocaleString('en-US');
const NOTE = 'm-0 rounded-[10px] border border-border bg-muted px-4 py-2.5 text-[15px] text-muted-foreground';
const FACTS = 'm-0 grid grid-cols-[repeat(auto-fit,minmax(min(180px,100%),1fr))] gap-x-10 gap-y-3 text-[16px] leading-[1.6] [&_dd]:m-0 [&_dt]:text-[14px] [&_dt]:text-muted-foreground';

export const CandidateHead = ({ row }: { row: ProjectRow }) => (
  <span className="rounded-[4px] border border-line2 px-1.5 text-[13px] leading-[20px] whitespace-nowrap text-muted-foreground" title="사업 번호가 아직 없는 사업 — 다음 원장에서 id 가 바뀔 수 있음">{row.issued ? '상세 자료 없음' : CAND_NAME}</span>
);

export default function Candidate({ row: r, sggName, sources, stageHref }: { row: ProjectRow; sggName: string; sources: string[]; stageHref: (i: number) => string }) {
  const st = statusOf(r), next = nextOf(r), late = lateOf(r);
  const note = r.issued ? '상세 자료가 없어 목록에 있는 값만 보입니다'
    : next ? '사업 번호가 아직 없는 후보 사업입니다 · 예정일은 원천 자료에 적힌 값이라 확인이 필요합니다'
    : '사업 번호가 아직 없는 후보 사업입니다 · 예정일 자료가 없습니다';
  return (
    <>
      <p role="note" className={NOTE}>{note}</p>
      <StageSteps current={r.board} reached={r.reached} href={stageHref} />
      <Card render={<section aria-label="간단 보기" />}>
        <PanelHead title="간단 보기">
          {isMetro(r.sgg) ? <a href={mapHref({ project: r.id })} className="text-[14px] text-muted-foreground no-underline hover:text-primary hover:underline" title="지도에서 이 사업 위치 보기">지도에서 보기 ›</a> : null}
        </PanelHead>
        <dl className={FACTS}>
          <div><dt>시군구</dt><dd><Link href={`/projects?sgg=${r.sgg}`} title="이 시군구로 거른 사업 목록">{sggName}</Link></dd></div>
          <div><dt>단계</dt><dd>{BOARD_CIR[r.board]} {BOARD_NAMES[r.board]}</dd></div>
          <div><dt>계획 호수</dt><dd className="tabular-nums">{r.units > 0 ? `${fmt(r.units)}호` : <span className="text-muted-foreground">미확인</span>}</dd></div>
          <div><dt>{r.issued ? PLAN_COL : CAND_PLAN}</dt><dd className="tabular-nums">{next ? <span className={next.muted ? 'text-muted-foreground' : undefined} title={next.title}>{next.text}{next.tag ? <span className="ml-1.5 inline-block rounded-[4px] border border-line2 px-1 text-[12px] leading-[18px] text-muted-foreground">{next.tag}</span> : null}</span> : <span className="text-muted-foreground">없음</span>}</dd></div>
          <div><dt>판정</dt><dd title={statusTip(r)}>{statusLabel(r)}{late !== null ? <span className="text-muted-foreground tabular-nums"> · 경과 {late}개월</span> : null}{st === 'none' && r.why ? <span className="text-muted-foreground"> · {r.why === 'LH 후보' ? 'LH 후보(판정 대상 아님)' : r.why}</span> : null}</dd></div>
          <div><dt>출처</dt><dd>{sources.join(' · ')}</dd></div>
        </dl>
      </Card>
    </>
  );
}
