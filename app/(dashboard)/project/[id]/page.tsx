import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Crumbs from '../../../../components/Crumbs';
import StageLadder from '../../../../components/StageLadder';
import { Dl, Lede, Page, PageTitle, PanelTitle } from '../../../../components/page';
import { buttonVariants } from '../../../../components/ui/button';
import { Card } from '../../../../components/ui/card';
import { Basis } from '../../../../components/ui';
import { fmt, sidoName } from '../../../../lib/board/calc';
import { SGG, molit, projects, sources } from '../../../../lib/board/data';
import { STAGES } from '../../../../lib/board/stages';
import { DETAILS } from '../../../../lib/shell/menu';

type Props = { params: Promise<{ id: string }> };
export const dynamicParams = false;
export const generateStaticParams = () => projects.map((p) => ({ id: p.id }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: projects.find((p) => p.id === id)?.name ?? id };
}

/* 사업 상세(L3): 머리·6단계·규모·위치·근거(기획서 4.3). 건축HUB 관리번호(refs)는 공개 범위가 미결(기획서 Q4)이라 보이지 않는다. */
export default async function ProjectPage({ params }: Props) {
  const { id } = await params;
  const p = DETAILS.project.id.test(id) ? projects.find((x) => x.id === id) : undefined;
  if (!p) notFound();
  const cur = STAGES.findIndex((s) => s.code === p.stageCode);
  const located = !!(p.pnus && p.pnus.length);
  const area = SGG[p.sgg];
  const slug = /^regions\/([^/]+)\//.exec(p.source.dataset)?.[1];   // 지도 번들 출처면 번들의 갱신일이 원천 기준일이다
  const cat = sources.items.find((i) => i.id === (slug ? `bundle-${slug}` : 'hub-hs-basis'));
  return (
    <Page>
      <Crumbs items={[{ label: '종합상황판', href: '/' }, { label: '사업(현황표)', href: '/projects' }, { label: p.name }]} />
      <PageTitle>{p.name} <code>{p.id}</code></PageTitle>
      <Lede>{area?.name ?? p.sgg} · 법정동 {p.bjdCodes.length}곳 · {p.units ? `${fmt(p.units)}세대` : '세대수 미확인'}</Lede>

      <StageLadder current={p.stageCode} />
      {/* 9.30 지시 '사업별 진행상황과 앞으로의 변화를 알기 쉽게': 지금 단계와 다음 단계를 한 문장씩. 날짜는 원천에 일정이 없어 쓰지 않는다 */}
      <p className="mt-2.5 mb-0">지금은 <b>{p.stageCode} {STAGES[cur]?.name}</b> 단계입니다 — {STAGES[cur]?.q}</p>
      <p className="mt-1 mb-0 text-muted-foreground">{STAGES[cur + 1] ? <>다음은 <b className="text-foreground">{STAGES[cur + 1].code} {STAGES[cur + 1].name}</b> 단계입니다 — {STAGES[cur + 1].q}</> : '마지막 단계입니다.'} {area ? <Link href={`/my-area/${area.sido}`}>우리 동네({sidoName(molit, area.sido) ?? area.sido}) 공급 소식</Link> : null}</p>

      <Card render={<section aria-label="개요" />}>
        <PanelTitle>개요</PanelTitle>
        <Dl>
          <dt>시군구</dt><dd><Link href={`/area/${p.sgg}`}>{area?.name ?? p.sgg}</Link> <code>{p.sgg}</code></dd>
          <dt>법정동 코드</dt><dd>{p.bjdCodes.join(', ')}</dd>
          <dt>규모</dt><dd>{p.units ? `${fmt(p.units)}세대` : <span>세대수 미확인</span>}</dd>
          <dt>위치</dt><dd>{located ? `필지 ${p.pnus!.length}곳이 연결됨` : '위치 미연결 — 지도는 법정동 경계로 엽니다'}</dd>
          <dt>일정·신호</dt><dd><span>당초·변경·현재 예정 일정이 없어 지연·주의·정상은 판정하지 않습니다(원천 없음)</span></dd>
        </Dl>
        <a className={buttonVariants({ className: 'mt-3' })} href={`/map?project=${p.id}`}>지도에서 보기</a>
      </Card>

      <Card render={<section aria-label="근거" />}>
        <PanelTitle>근거</PanelTitle>
        <Dl>
          <dt>원천</dt><dd>{p.source.provider} · {p.source.dataset}</dd>
          {p.source.url ? <><dt>원문</dt><dd><a href={p.source.url} target="_blank" rel="noopener noreferrer">{p.source.url}</a></dd></> : null}
          <dt>레지스트리 기준일</dt><dd>{p.asOf} <span>(우리가 연결한 날)</span></dd>
          <dt>사업 id 발급일</dt><dd>{p.issuedAt}</dd>
          <dt>원천 기준일</dt><dd>{cat?.sourceAsOf ?? <span>확인하지 못함(건축HUB 레코드의 생성일을 아직 모으지 않았습니다)</span>}</dd>
        </Dl>
        <Basis>사업 단계는 건축HUB 인허가 기록과 지도 번들 상태를 6단계로 옮긴 제안 매핑(스펙 9.2)의 값입니다.</Basis>
      </Card>
    </Page>
  );
}
