import type { Metadata } from 'next';
import Link from 'next/link';
import Crumbs from '../../../components/Crumbs';
import StageLadder from '../../../components/StageLadder';
import { Lede, Page, PageTitle, cardsGrid } from '../../../components/page';
import { Badge } from '../../../components/ui/badge';
import { cardVariants } from '../../../components/ui/card';
import { DataGrid } from '../../../components/ui/data-grid';
import { Basis } from '../../../components/ui';
import { SGG, projects } from '../../../lib/board/data';
import { STAGES, stageName } from '../../../lib/board/stages';

export const metadata: Metadata = { title: '사업(현황표)' };

/* 사업(L2 목록): 사업 id 레지스트리의 사업. 5개 시군구뿐이라 '전국'이 아니다. */
export default function ProjectsPage() {
  const list = [...projects].sort((a, b) => a.sgg.localeCompare(b.sgg) || b.stageCode.localeCompare(a.stageCode) || a.name.localeCompare(b.name, 'ko'));
  const bySgg = Object.keys(SGG).map((c) => ({ code: c, n: projects.filter((p) => p.sgg === c).length }));
  return (
    <Page>
      <Crumbs items={[{ label: '종합상황판', href: '/' }, { label: '사업(현황표)' }]} />
      <PageTitle>사업(현황표) <Badge variant="ok">실데이터</Badge></PageTitle>
      <Lede>사업 id 레지스트리에 발급된 사업 {projects.length}건. 행을 누르면 6단계·규모·위치·근거가 있는 사업 상세로 내려갑니다.</Lede>
      <div className={`${cardsGrid} mt-3`}>
        {bySgg.map((s) => <Link key={s.code} className={cardVariants({ variant: 'link' })} href={`/area/${s.code}`}><b>{SGG[s.code].name}</b><span>사업 {s.n}건</span></Link>)}
      </div>
      <StageLadder className="mt-5 mb-1" counts={Object.fromEntries(STAGES.map((s) => [s.code, projects.filter((p) => p.stageCode === s.code).length]))} />
      <DataGrid label="사업 목록" maxHeight={640}
        cols={[{ key: 'name', label: '사업', kind: 'text', wrap: true }, { key: 'sgg', label: '시군구', kind: 'text' }, { key: 'stage', label: '단계', kind: 'text' }, { key: 'units', label: '세대수' }, { key: 'loc', label: '위치' }, { key: 'id', label: 'id', kind: 'text' }]}
        rows={list.map((p) => ({
          id: p.id,
          c: { name: { text: p.name, href: `/project/${p.id}` }, sgg: { text: SGG[p.sgg]?.name ?? p.sgg, href: `/area/${p.sgg}` }, stage: `${p.stageCode} ${stageName(p.stageCode)}`, units: p.units ? p.units : { na: '미확인' }, loc: p.pnus && p.pnus.length ? { text: `필지 ${p.pnus.length}`, sort: p.pnus.length } : { na: '위치 미연결' }, id: { text: p.id, code: true } },
        }))} />
      <Basis>사업 id 레지스트리 {projects[0].asOf} 기준. 일정(당초·변경·현재 예정)이 없어 지연·주의·정상 신호는 아직 판정하지 않습니다.</Basis>
    </Page>
  );
}
