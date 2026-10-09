import type { Metadata } from 'next';
import Link from 'next/link';
import Crumbs from '../../../components/Crumbs';
import { Lede, Page, PageTitle, cardsGrid, na } from '../../../components/page';
import { Badge } from '../../../components/ui/badge';
import { cardVariants } from '../../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
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
    <Page>
      <Crumbs items={[{ label: '종합상황판', href: '/' }, { label: '사업(현황표)' }]} />
      <PageTitle>사업(현황표) <Badge variant="ok">실데이터</Badge></PageTitle>
      <Lede>사업 id 레지스트리에 발급된 사업 {projects.length}건. 행을 누르면 6단계·규모·위치·근거가 있는 사업 상세로 내려갑니다.</Lede>
      <div className={`${cardsGrid} mt-3`}>
        {bySgg.map((s) => <Link key={s.code} className={cardVariants({ variant: 'link' })} href={`/area/${s.code}`}><b>{SGG[s.code].name}</b><span>사업 {s.n}건</span><code>/area/{s.code}</code></Link>)}
      </div>
      <ul className="m-0 mt-3 flex list-none flex-wrap gap-x-[14px] gap-y-1.5 p-0 text-[12.5px] text-foreground [&_li]:flex [&_li]:items-center [&_li]:gap-1.5" aria-label="단계별 사업 수">
        {STAGES.map((s) => <li key={s.code}><Link href={`/stage/${s.code}`}>{s.code} {s.name} {projects.filter((p) => p.stageCode === s.code).length}건</Link></li>)}
      </ul>
      <Table>
        <TableHeader><tr><TableHead>사업</TableHead><TableHead>시군구</TableHead><TableHead>단계</TableHead><TableHead>세대수</TableHead><TableHead>위치</TableHead><TableHead>id</TableHead></tr></TableHeader>
        <TableBody>
          {list.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="min-w-[180px] whitespace-normal"><Link href={`/project/${p.id}`}>{p.name}</Link></TableCell>
              <TableCell><Link href={`/area/${p.sgg}`}>{SGG[p.sgg]?.name ?? p.sgg}</Link></TableCell>
              <TableCell>{p.stageCode} {stageName(p.stageCode)}</TableCell>
              <TableCell>{p.units ? fmt(p.units) : <span className={na}>미확인</span>}</TableCell>
              <TableCell>{p.pnus && p.pnus.length ? `필지 ${p.pnus.length}` : <span className={na}>위치 미연결</span>}</TableCell>
              <TableCell><code>{p.id}</code></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Basis>사업 id 레지스트리 {projects[0].asOf} 기준. 일정(당초·변경·현재 예정)이 없어 지연·주의·정상 신호는 아직 판정하지 않습니다.</Basis>
    </Page>
  );
}
