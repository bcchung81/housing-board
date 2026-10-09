import type { ReactNode } from 'react';

export function Kpi({ label, value, unit = '호', sub, tone }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; tone?: string }) {
  return (
    <div className="kpi">
      <span className="kl"><i style={tone ? { background: tone } : undefined} aria-hidden="true" />{label}</span>
      <b>{value}<small>{unit}</small></b>
      {sub ? <span className="ks">{sub}</span> : null}
    </div>
  );
}

export const Prov = () => <span className="pill prov" title="통계누리가 잠정치로 낸 달입니다. 확정치는 2027년 9월 공표 예정">잠정</span>;

/* 이 화면이 읽는 원천과 기준일. 수집일과 원천 기준을 섞지 않는다(스펙 9.3). */
export function Basis({ children }: { children: ReactNode }) {
  return <p className="basis">{children} <a href="/sources">데이터 원본</a></p>;
}
