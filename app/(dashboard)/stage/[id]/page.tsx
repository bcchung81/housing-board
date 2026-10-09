import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Crumbs from '../../../../components/Crumbs';
import { Lede, Page, PageTitle, na } from '../../../../components/page';
import { Alert } from '../../../../components/ui/alert';
import { Badge } from '../../../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../../components/ui/table';
import { Basis } from '../../../../components/ui';
import { fmt } from '../../../../lib/board/calc';
import { SGG, projects } from '../../../../lib/board/data';
import { STAGES } from '../../../../lib/board/stages';
import { DETAILS } from '../../../../lib/shell/menu';

type Props = { params: Promise<{ id: string }> };
export const dynamicParams = false;
export const generateStaticParams = () => STAGES.map((s) => ({ id: s.code }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const s = STAGES.find((x) => x.code === id);
  return { title: s ? `${s.code} ${s.name} 단계` : id };
}

export default async function StageDetail({ params }: Props) {
  const { id } = await params;
  const s = DETAILS.stage.id.test(id) ? STAGES.find((x) => x.code === id) : undefined;
  if (!s) notFound();
  const list = projects.filter((p) => p.stageCode === id).sort((a, b) => a.sgg.localeCompare(b.sgg) || a.name.localeCompare(b.name, 'ko'));
  return (
    <Page>
      <Crumbs items={[{ label: '종합상황판', href: '/' }, { label: '단계별', href: '/stage' }, { label: `${s.code} ${s.name}` }]} />
      <PageTitle>{s.code} {s.name} <Badge>{list.length}건</Badge></PageTitle>
      <Lede>이 단계에 확보한 데이터: {s.data}.</Lede>
      {list.length > 0 ? (
        <Table>
          <TableHeader><tr><TableHead>사업</TableHead><TableHead>시군구</TableHead><TableHead>세대수</TableHead></tr></TableHeader>
          <TableBody>{list.map((p) => <TableRow key={p.id}><TableCell className="min-w-[180px] whitespace-normal"><Link href={`/project/${p.id}`}>{p.name}</Link></TableCell><TableCell>{SGG[p.sgg]?.name ?? p.sgg}</TableCell><TableCell>{p.units ? fmt(p.units) : <span className={na}>미확인</span>}</TableCell></TableRow>)}</TableBody>
        </Table>
      ) : <Alert>사업 id 레지스트리에 이 단계의 사업이 아직 없습니다. 이 단계의 자료는 위 데이터 범위뿐이고 사업 단위로 허가·사업과 이어 주는 일이 남아 있습니다.</Alert>}
      <Basis>사업 id 레지스트리 {projects[0].asOf} 기준(5개 시군구). 머문 기간은 단계 진입일이 있는 사업만 셀 수 있어 아직 보이지 않습니다.</Basis>
    </Page>
  );
}
