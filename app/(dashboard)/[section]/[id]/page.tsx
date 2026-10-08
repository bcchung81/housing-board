import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Crumbs, { type Crumb } from '../../../../components/Crumbs';
import { DETAILS, SECTIONS } from '../../../../lib/shell/menu';

/* 파생 상세 /area/{코드} /project/{PRJ-…} /stage/{01~06} /agency/{id} /month/{YYYY-MM}.
   식별자 모양이 맞지 않으면 404. 지도로 가는 버튼은 같은 창의 화면 전환(<a>, 팝업 아님)이다. */
type Props = { params: Promise<{ section: string; id: string }> };

const detail = (section: string, id: string) => { const d = DETAILS[section]; return d && d.id.test(id) ? d : null; };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section, id } = await params;
  const d = detail(section, id);
  return { title: d ? `${d.label} ${id}` : undefined };
}

export default async function DetailPage({ params }: Props) {
  const { section, id } = await params;
  const d = detail(section, id);
  if (!d) notFound();

  const crumbs: Crumb[] = [{ label: '종합상황판', href: '/' }];
  if (d.list !== '/') crumbs.push({ label: SECTIONS[d.list.slice(1)].label, href: d.list });
  crumbs.push({ label: id });

  const mapQuery = section === 'project' ? `project=${id}` : section === 'area' && id.length === 5 ? `sgg=${id}` : null;   // 시도(2자리)는 지도가 열지 않는다(스펙 1.3)
  return (
    <div className="page">
      <Crumbs items={crumbs} />
      <h1>{d.label} <code>{id}</code> <span className="pill">준비 중</span></h1>
      <p className="lede">{d.idLabel}. 내용은 설계 문서 6절 M2에서 채웁니다.</p>
      {mapQuery ? <a className="btn" href={`/map?${mapQuery}`}>{section === 'project' ? '지도에서 보기' : '이 동네 지도'}</a> : null}
    </div>
  );
}
