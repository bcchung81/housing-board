import type { Metadata } from 'next';
import Link from 'next/link';
import Crumbs from '../../../components/Crumbs';
import { Basis } from '../../../components/ui';
import { fmt } from '../../../lib/board/calc';
import { SGG, projects } from '../../../lib/board/data';
import { STAGES, stageName } from '../../../lib/board/stages';

export const metadata: Metadata = { title: '사업(현황표)' };

/* 사업(L2 목록): 사업 id 레지스트리의 사업. 5개 시군구뿐이라 '전국'이 아니다. */
export default function ProjectsPage() {
  const list = [...projects].sort((a, b) => a.sgg.localeCompare(b.sgg) || b.stageCode.localeCompare(a.stageCode) || a.name.localeCompare(b.name, 'ko'));
  const bySgg = Object.keys(SGG).map((c) => ({ code: c, n: projects.filter((p) => p.sgg === c).length }));
  return (
    <div className="page">
      <Crumbs items={[{ label: '종합상황판', href: '/' }, { label: '사업(현황표)' }]} />
      <h1>사업(현황표) <span className="pill ok">실데이터</span></h1>
      <p className="lede">사업 id 레지스트리에 발급된 사업 {projects.length}건. 행을 누르면 6단계·규모·위치·근거가 있는 사업 상세로 내려갑니다.</p>
      <div className="cards" style={{ marginTop: 12 }}>
        {bySgg.map((s) => <Link key={s.code} className="cardlink" href={`/area/${s.code}`}><b>{SGG[s.code].name}</b><span>사업 {s.n}건</span><code>/area/{s.code}</code></Link>)}
      </div>
      <ul className="legend" style={{ marginTop: 12 }} aria-label="단계별 사업 수">
        {STAGES.map((s) => <li key={s.code}><Link href={`/stage/${s.code}`}>{s.code} {s.name} {projects.filter((p) => p.stageCode === s.code).length}건</Link></li>)}
      </ul>
      <div className="tablewrap">
        <table className="tbl">
          <thead><tr><th>사업</th><th>시군구</th><th>단계</th><th>세대수</th><th>위치</th><th>id</th></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td className="wrap"><Link href={`/project/${p.id}`}>{p.name}</Link></td>
                <td><Link href={`/area/${p.sgg}`}>{SGG[p.sgg]?.name ?? p.sgg}</Link></td>
                <td>{p.stageCode} {stageName(p.stageCode)}</td>
                <td>{p.units ? fmt(p.units) : <span className="na">미확인</span>}</td>
                <td>{p.pnus && p.pnus.length ? `필지 ${p.pnus.length}` : <span className="na">위치 미연결</span>}</td>
                <td><code>{p.id}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Basis>사업 id 레지스트리 {projects[0].asOf} 기준. 일정(당초·변경·현재 예정)이 없어 지연·주의·정상 신호는 아직 판정하지 않습니다.</Basis>
    </div>
  );
}
