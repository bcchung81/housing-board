import type { Metadata } from 'next';
import Crumbs from '../../../components/Crumbs';
import { SECTIONS } from '../../../lib/shell/menu';

/* 사이드바 목록 화면(/projects /area /stage /agency /sources /reports /my-area). 내용은 설계 문서 6절 M2에서 채운다. */
export const dynamicParams = false;
export const generateStaticParams = () => Object.keys(SECTIONS).map((section) => ({ section }));

type Props = { params: Promise<{ section: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section } = await params;
  return { title: SECTIONS[section]?.label };
}

export default async function SectionPage({ params }: Props) {
  const { section } = await params;
  const s = SECTIONS[section];
  return (
    <div className="page">
      <Crumbs items={[{ label: '종합상황판', href: '/' }, { label: s.label }]} />
      <h1>{s.label} <span className="pill">준비 중</span></h1>
      <p className="lede">{s.note}</p>
      <div className="box">이 화면은 사이드바와 경로만 먼저 잡았습니다. 데이터 연결은 다음 단계(설계 문서 6절 M2)에서 채웁니다.</div>
    </div>
  );
}
