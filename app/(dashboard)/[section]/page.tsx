import type { Metadata } from 'next';
import Crumbs from '../../../components/Crumbs';
import { SECTIONS } from '../../../lib/shell/menu';

/* 아직 데이터가 없는 사이드바 목록 화면(/reports /my-area). 나머지 목록(/projects /area /stage /agency /sources)은 전용 라우트가 있다. */
const SOON = Object.keys(SECTIONS).filter((k) => SECTIONS[k].soon);
export const dynamicParams = false;
export const generateStaticParams = () => SOON.map((section) => ({ section }));

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
      <div className="box">이 화면은 사이드바와 경로만 잡았습니다. 데이터가 생기면 채웁니다.</div>
    </div>
  );
}
