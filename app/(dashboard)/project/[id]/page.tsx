import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import StageLadder from '../../../../components/StageLadder';
import PanelLink from '../../../../components/board/PanelLink';
import { Dash, Dl, Page, PageHead, PanelHead, SrcLink } from '../../../../components/page';
import { buttonVariants } from '../../../../components/ui/button';
import { Card } from '../../../../components/ui/card';
import { fmt, sidoName } from '../../../../lib/board/calc';
import { SGG, molit, projects, sources } from '../../../../lib/board/data';
import { DETAILS } from '../../../../lib/shell/menu';

type Props = { params: Promise<{ id: string }> };
export const dynamicParams = false;
export const generateStaticParams = () => projects.map((p) => ({ id: p.id }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: projects.find((p) => p.id === id)?.name ?? id };
}

/* 사업 상세(L3): 머리·6단계·개요|근거(기획서 4.3). 지금 단계는 계단이 보이므로 문장으로 다시 쓰지 않는다(단계마다 답할 질문은 계단 칸의 title). 건축HUB 관리번호(refs)는 공개 범위가 미결(기획서 Q4)이라 보이지 않는다. */
export default async function ProjectPage({ params }: Props) {
  const { id } = await params;
  const p = DETAILS.project.id.test(id) ? projects.find((x) => x.id === id) : undefined;
  if (!p) notFound();
  const located = !!(p.pnus && p.pnus.length);
  const area = SGG[p.sgg];
  const slug = /^regions\/([^/]+)\//.exec(p.source.dataset)?.[1];   // 지도 번들 출처면 번들의 갱신일이 원천 기준일이다
  const cat = sources.items.find((i) => i.id === (slug ? `bundle-${slug}` : 'hub-hs-basis'));
  const sidoLabel = area ? sidoName(molit, area.sido) ?? area.sido : null;
  return (
    <Page>
      <PageHead crumbs={[{ label: '종합상황판', href: '/' }, { label: '사업(현황표)', href: '/projects' }, { label: p.name }]} title={p.name}
        tip={`${area?.name ?? p.sgg} · 법정동 ${p.bjdCodes.length}곳 · ${p.units ? `${fmt(p.units)}세대` : '세대수 미확인'}`}>
        <code className="text-[14px] text-muted-foreground" title="사업 id">{p.id}</code>
      </PageHead>

      <StageLadder current={p.stageCode} />

      <div className="grid grid-cols-2 items-start gap-3.5 narrow:grid-cols-1">
        <Card render={<section aria-label="개요" />}>
          <PanelHead title="개요">
            {area ? <PanelLink href={`/my-area/${area.sido}`} full={`우리 동네(${sidoLabel}) 공급 소식`}>우리 동네({sidoLabel})</PanelLink> : null}
          </PanelHead>
          <Dl>
            <dt>시군구</dt><dd><Link href={`/projects?sgg=${p.sgg}`}>{area?.name ?? p.sgg}</Link> <code className="text-[14px] text-muted-foreground">{p.sgg}</code></dd>
            <dt>법정동 코드</dt><dd className="tabular-nums">{p.bjdCodes.join(', ')}</dd>
            <dt>규모</dt><dd className="tabular-nums">{p.units ? `${fmt(p.units)}세대` : <Dash why="세대수 미확인" />}</dd>
            <dt>위치</dt><dd>{located ? `필지 ${p.pnus!.length}곳` : <span className="text-muted-foreground" title="위치 미연결 — 지도는 법정동 경계로 엽니다">위치 미연결</span>}</dd>
            <dt>일정·신호</dt><dd><span className="text-muted-foreground" title="당초·변경·현재 예정 일정이 없어 지연·주의·정상은 판정하지 않습니다(원천 없음)">판정 없음</span></dd>
          </Dl>
          <a className={buttonVariants({ className: 'mt-4' })} href={`/map?project=${p.id}`}>지도에서 보기</a>
        </Card>

        <Card render={<section aria-label="근거" />}>
          <PanelHead title="근거" tip="사업 단계는 건축HUB 인허가 기록과 지도 번들 상태를 6단계로 옮긴 제안 매핑(스펙 9.2)의 값입니다."><SrcLink /></PanelHead>
          <Dl>
            <dt>원천</dt><dd>{p.source.provider} · {p.source.dataset}</dd>
            {p.source.url ? <><dt>원문</dt><dd><a href={p.source.url} target="_blank" rel="noopener noreferrer">{p.source.url}</a></dd></> : null}
            <dt>기준일</dt>
            <dd className="tabular-nums">
              <span className="whitespace-nowrap" title="레지스트리 기준일(우리가 연결한 날)">레지스트리 {p.asOf}</span>
              {' · '}<span className="whitespace-nowrap" title="사업 id 발급일">발급 {p.issuedAt}</span>
              {' · '}<span className="whitespace-nowrap" title="원천 기준일">원천 {cat?.sourceAsOf ?? <Dash why="확인하지 못함(건축HUB 레코드의 생성일을 아직 모으지 않았습니다)" />}</span>
            </dd>
          </Dl>
        </Card>
      </div>
    </Page>
  );
}
