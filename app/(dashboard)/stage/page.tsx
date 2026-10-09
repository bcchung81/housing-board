import type { Metadata } from 'next';
import Link from 'next/link';
import Crumbs from '../../../components/Crumbs';
import { Basis } from '../../../components/ui';
import { projects } from '../../../lib/board/data';
import { STAGES } from '../../../lib/board/stages';

export const metadata: Metadata = { title: '단계별' };

/* 단계별(L1 목록): 6단계별 사업 수. 사업 id 레지스트리 77건(5개 시군구) 기준이라 전국 분포가 아니다. 머문 기간·지연 호수는 일정이 없어 아직 못 센다. */
export default function StagePage() {
  const counts = STAGES.map((s) => ({ ...s, n: projects.filter((p) => p.stageCode === s.code).length }));
  const max = Math.max(1, ...counts.map((c) => c.n));
  return (
    <div className="page">
      <Crumbs items={[{ label: '종합상황판', href: '/' }, { label: '단계별' }]} />
      <h1>단계별 사업 <span className="pill ok">실데이터</span></h1>
      <p className="lede">계획에서 입주까지 6단계별 사업 수. 단계를 누르면 그 단계에 있는 사업 목록으로 내려갑니다.</p>
      <div className="box" style={{ marginTop: 10 }}><b className="warn">전국 분포가 아닙니다.</b> 사업 id 레지스트리가 다루는 5개 시군구의 사업 {projects.length}건 기준입니다. 전국 인허가 적재가 끝나면 전국으로 넓어집니다.</div>
      <section className="panel" aria-label="단계별 사업 수">
        <ol className="stepper" style={{ flexDirection: 'column', gap: 8 }}>
          {counts.map((c) => (
            <li key={c.code} style={{ display: 'grid', gridTemplateColumns: '28px 110px minmax(0,1fr) 60px', gap: 12 }}>
              <b>{Number(c.code)}</b>
              <Link href={`/stage/${c.code}`} style={{ color: 'var(--ink)' }}>{c.name}</Link>
              <span aria-hidden="true" style={{ height: 12, borderRadius: 4, background: 'var(--line)', display: 'block' }}><span style={{ display: 'block', height: '100%', borderRadius: 4, background: 'var(--acc)', width: `${(c.n / max) * 100}%` }} /></span>
              <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--ink)' }}>{c.n}건</span>
            </li>
          ))}
        </ol>
        <Basis>단계는 건축HUB 인허가 기록과 지도 번들 상태를 6단계로 옮긴 제안 매핑(스펙 9.2)의 값입니다. 단계별 머문 기간·병목은 단계 진입일이 없어 아직 계산하지 않습니다.</Basis>
      </section>
    </div>
  );
}
