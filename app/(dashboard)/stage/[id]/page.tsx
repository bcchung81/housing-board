import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Crumbs from '../../../../components/Crumbs';
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
    <div className="page">
      <Crumbs items={[{ label: '종합상황판', href: '/' }, { label: '단계별', href: '/stage' }, { label: `${s.code} ${s.name}` }]} />
      <h1>{s.code} {s.name} <span className="pill">{list.length}건</span></h1>
      <p className="lede">이 단계에 확보한 데이터: {s.data}.</p>
      {list.length > 0 ? (
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>사업</th><th>시군구</th><th>세대수</th></tr></thead>
            <tbody>{list.map((p) => <tr key={p.id}><td className="wrap"><Link href={`/project/${p.id}`}>{p.name}</Link></td><td>{SGG[p.sgg]?.name ?? p.sgg}</td><td>{p.units ? fmt(p.units) : <span className="na">미확인</span>}</td></tr>)}</tbody>
          </table>
        </div>
      ) : <div className="box">사업 id 레지스트리에 이 단계의 사업이 아직 없습니다. 이 단계의 자료는 위 데이터 범위뿐이고 사업 단위로 허가·사업과 이어 주는 일이 남아 있습니다.</div>}
      <Basis>사업 id 레지스트리 {projects[0].asOf} 기준(5개 시군구). 머문 기간은 단계 진입일이 있는 사업만 셀 수 있어 아직 보이지 않습니다.</Basis>
    </div>
  );
}
