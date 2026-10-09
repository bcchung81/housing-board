import type { Metadata } from 'next';
import Link from 'next/link';
import Crumbs from '../../../components/Crumbs';
import { Lede, Page, PageTitle } from '../../../components/page';
import { Alert } from '../../../components/ui/alert';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { Stepper, StepperItem } from '../../../components/ui/stepper';
import { Basis } from '../../../components/ui';
import { projects } from '../../../lib/board/data';
import { STAGES } from '../../../lib/board/stages';

export const metadata: Metadata = { title: '단계별' };

/* 단계별(L1 목록): 6단계별 사업 수. 사업 id 레지스트리 77건(5개 시군구) 기준이라 전국 분포가 아니다. 머문 기간·지연 호수는 일정이 없어 아직 못 센다. */
export default function StagePage() {
  const counts = STAGES.map((s) => ({ ...s, n: projects.filter((p) => p.stageCode === s.code).length }));
  const max = Math.max(1, ...counts.map((c) => c.n));
  return (
    <Page>
      <Crumbs items={[{ label: '종합상황판', href: '/' }, { label: '단계별' }]} />
      <PageTitle>단계별 사업 <Badge variant="ok">실데이터</Badge></PageTitle>
      <Lede>계획에서 입주까지 6단계별 사업 수. 단계를 누르면 그 단계에 있는 사업 목록으로 내려갑니다.</Lede>
      <Alert className="mt-2.5"><b>전국 분포가 아닙니다.</b> 사업 id 레지스트리가 다루는 5개 시군구의 사업 {projects.length}건 기준입니다. 전국 인허가 적재가 끝나면 전국으로 넓어집니다.</Alert>
      <Card render={<section aria-label="단계별 사업 수" />}>
        <Stepper className="flex-col gap-2">
          {counts.map((c) => (
            <StepperItem key={c.code} className="grid grid-cols-[28px_110px_minmax(0,1fr)_60px] gap-3">
              <b>{Number(c.code)}</b>
              <Link href={`/stage/${c.code}`} className="text-foreground">{c.name}</Link>
              <span aria-hidden="true" className="block h-3 rounded-[4px] bg-border"><span className="block h-full rounded-[4px] bg-primary" style={{ width: `${(c.n / max) * 100}%` }} /></span>
              <span className="text-right text-foreground tabular-nums">{c.n}건</span>
            </StepperItem>
          ))}
        </Stepper>
        <Basis>단계는 건축HUB 인허가 기록과 지도 번들 상태를 6단계로 옮긴 제안 매핑(스펙 9.2)의 값입니다. 단계별 머문 기간·병목은 단계 진입일이 없어 아직 계산하지 않습니다.</Basis>
      </Card>
    </Page>
  );
}
