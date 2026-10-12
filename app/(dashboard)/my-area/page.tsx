import type { Metadata } from 'next';
import Link from 'next/link';
import { Page, PageHead, sub } from '../../../components/page';
import { cardVariants } from '../../../components/ui/card';
import { NATION, fmt, lhCalendar, monthLabel, nextYm, ymDot } from '../../../lib/board/calc';
import { AHEAD_FROM, SGG, lh, molit, projects } from '../../../lib/board/data';

export const metadata: Metadata = { title: '우리 동네' };

/* 우리 동네(국민 공개, L1): 시도를 한 번 고르면 그 시도의 앞으로 1년 공급 달력으로 간다(기획서 시나리오 B: 선택은 한두 번). */
export default function MyAreaIndex() {
  const until = nextYm(AHEAD_FROM, 11);
  return (
    <Page>
      <PageHead crumbs={[{ label: '종합상황판', href: '/' }, { label: '우리 동네' }]} title="우리 동네 공급 소식"
        tip={`살고 싶은 지역을 고르면 앞으로 1년(${monthLabel(AHEAD_FROM)} ~ ${monthLabel(until)}) 동안 그 지역에 완성될 공공주택과 진행 중인 사업을 달력으로 보여 드립니다.`}
        meta={`${ymDot(AHEAD_FROM)} ~ ${ymDot(until)}`} metaTip={`앞으로 1년(${monthLabel(AHEAD_FROM)} ~ ${monthLabel(until)})`} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-2.5">
        {molit.sido.filter((s) => s.code !== NATION).map((s) => {
          const cal = lhCalendar(lh, s.code, AHEAD_FROM, 12), n = cal.reduce((a, m) => a + m.blocks.length, 0), units = cal.reduce((a, m) => a + m.units, 0), pj = projects.filter((p) => SGG[p.sgg]?.sido === s.code).length;
          return (
            <Link key={s.code} className={cardVariants({ variant: 'link' })} href={`/my-area/${s.code}`}>
              <b>{s.name}</b>
              <span>{n ? `1년 안 준공 예정 ${n}곳 · ${fmt(units)}세대` : '1년 안 준공 예정 없음(LH 기준)'}{pj ? ` · 등록 사업 ${pj}건` : ''}</span>
            </Link>
          );
        })}
      </div>
      <p className={`${sub} m-0 text-[13px]`} title={`LH 공공주택 준공예정현황(15141761) · 파일 기준일 ${lh.sourceAsOf}. 공공주택 중 LH 가 낸 준공 예정만 담겨 있고, 일정은 바뀔 수 있습니다.`}>LH 준공예정 · 파일 기준일 {lh.sourceAsOf} · 일정은 바뀔 수 있습니다. 청약·입주 자격은 각 모집공고에서 직접 확인하세요.</p>
    </Page>
  );
}
