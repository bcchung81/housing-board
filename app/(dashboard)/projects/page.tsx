import type { Metadata } from 'next';
import Link from 'next/link';
import { cn } from 'cn';
import Crumbs from '../../../components/Crumbs';
import StageLadder from '../../../components/StageLadder';
import { Lede, Page, PageTitle, cardsGrid } from '../../../components/page';
import { Alert } from '../../../components/ui/alert';
import { Badge } from '../../../components/ui/badge';
import { buttonVariants } from '../../../components/ui/button';
import { cardVariants } from '../../../components/ui/card';
import { DataGrid } from '../../../components/ui/data-grid';
import { Basis } from '../../../components/ui';
import { sidoName } from '../../../lib/board/calc';
import { SGG, molit, projects } from '../../../lib/board/data';
import { STAGES, stageName } from '../../../lib/board/stages';

type Props = { searchParams: Promise<{ stage?: string | string[]; sgg?: string | string[] }> };

/* 거르기 ?stage=03 · ?sgg=41450. 2026-10-10 단계별 메뉴(/stage, /stage/NN)와 시군구 상세(/area/{시군구5})를 이 화면의 거르기로 합쳤다(옛 주소는 next.config.ts 가 넘긴다).
   맞지 않는 값은 거르지 않는다. 시군구는 시도가 행정표준코드에 있으면 레지스트리에 없어도 받는다(사업 자료 없음 안내와 지도 단추). */
async function filters(searchParams: Props['searchParams']) {
  const q = await searchParams;
  const stage = STAGES.find((s) => s.code === q.stage);
  const sgg = typeof q.sgg === 'string' && /^\d{5}$/.test(q.sgg) && sidoName(molit, q.sgg.slice(0, 2)) ? q.sgg : undefined;
  return { stage, sgg, label: [sgg && (SGG[sgg]?.name ?? `시군구 ${sgg}`), stage && `${stage.code} ${stage.name}`].filter(Boolean).join(' · ') };
}

/* 거르기 주소. 고른 칸을 다시 누르면 그 거르기가 풀린다 */
const listHref = (stage?: string, sgg?: string) => {
  const q = new URLSearchParams();
  if (sgg) q.set('sgg', sgg);
  if (stage) q.set('stage', stage);
  return q.toString() ? `/projects?${q}` : '/projects';
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { label } = await filters(searchParams);
  return { title: label ? `${label} 사업` : '사업(현황표)' };
}

/* 사업(L2 목록): 사업 id 레지스트리의 사업. 5개 시군구뿐이라 '전국'이 아니다. */
export default async function ProjectsPage({ searchParams }: Props) {
  const { stage, sgg, label } = await filters(searchParams);
  const inSgg = sgg ? projects.filter((p) => p.sgg === sgg) : projects;
  const list = inSgg.filter((p) => !stage || p.stageCode === stage.code)
    .sort((a, b) => a.sgg.localeCompare(b.sgg) || b.stageCode.localeCompare(a.stageCode) || a.name.localeCompare(b.name, 'ko'));
  const bySgg = Object.keys(SGG).map((c) => ({ code: c, n: projects.filter((p) => p.sgg === c && (!stage || p.stageCode === stage.code)).length }));
  const sido = sgg?.slice(0, 2), sidoLabel = sido && sidoName(molit, sido);
  return (
    <Page>
      <Crumbs items={label ? [{ label: '종합상황판', href: '/' }, { label: '사업(현황표)', href: '/projects' }, { label }] : [{ label: '종합상황판', href: '/' }, { label: '사업(현황표)' }]} />
      <PageTitle>사업(현황표) <Badge variant="ok">실데이터</Badge></PageTitle>
      <Lede>사업 id 레지스트리에 발급된 사업 {projects.length}건. 시군구 카드나 6단계 칸을 누르면 그 사업만 거르고(다시 누르면 풀림), 행을 누르면 6단계·규모·위치·근거가 있는 사업 상세로 내려갑니다.</Lede>
      <div className={`${cardsGrid} mt-3`}>
        {bySgg.map((s) => (
          <Link key={s.code} className={cn(cardVariants({ variant: 'link' }), s.code === sgg && 'border-primary [box-shadow:0_0_0_1px_var(--primary)]')} aria-current={s.code === sgg ? 'true' : undefined}
            href={listHref(stage?.code, s.code === sgg ? undefined : s.code)}><b>{SGG[s.code].name}</b><span>사업 {s.n}건</span></Link>
        ))}
      </div>
      <StageLadder className="mt-5 mb-1" current={stage?.code} counts={Object.fromEntries(STAGES.map((s) => [s.code, inSgg.filter((p) => p.stageCode === s.code).length]))}
        href={(code) => listHref(code === stage?.code ? undefined : code, sgg)} />

      {label ? (
        <section aria-label="거른 조건" className="mt-4 mb-2 text-[16px] leading-[1.6] [word-break:keep-all]">
          <p className="m-0"><b>{label}</b> · 사업 {list.length}건 · <Link href="/projects">전체 보기</Link></p>
          {stage ? <p className="m-0 text-muted-foreground">{stage.q} — 이 단계에 확보한 데이터: {stage.data}.</p> : null}
          {sgg ? (
            <>
              <p className="m-0 text-muted-foreground">시군구 단위 실적 통계는 없고(통계누리는 시도 단위), 시도 실적은 {sidoLabel} 화면에서 봅니다.</p>
              <p className="m-0 flex flex-wrap gap-2.5">
                <a className={buttonVariants({ className: 'mt-2' })} href={`/map?sgg=${sgg}`}>이 동네 지도</a>
                <Link className={buttonVariants({ variant: 'outline', className: 'mt-2' })} href={`/area/${sido}`}>{sidoLabel} 실적</Link>
              </p>
            </>
          ) : null}
        </section>
      ) : null}

      {list.length > 0 ? (
        <DataGrid label="사업 목록" maxHeight={640}
          cols={[{ key: 'name', label: '사업', kind: 'text', wrap: true }, { key: 'sgg', label: '시군구', kind: 'text' }, { key: 'stage', label: '단계', kind: 'text' }, { key: 'units', label: '세대수' }, { key: 'loc', label: '위치' }, { key: 'id', label: 'id', kind: 'text' }]}
          rows={list.map((p) => ({
            id: p.id,
            c: { name: { text: p.name, href: `/project/${p.id}` }, sgg: { text: SGG[p.sgg]?.name ?? p.sgg, href: listHref(stage?.code, p.sgg) }, stage: `${p.stageCode} ${stageName(p.stageCode)}`, units: p.units ? p.units : { na: '미확인' }, loc: p.pnus && p.pnus.length ? { text: `필지 ${p.pnus.length}`, sort: p.pnus.length } : { na: '위치 미연결' }, id: { text: p.id, code: true } },
          }))} />
      ) : sgg && inSgg.length === 0 ? (
        <Alert className="mt-3"><b>사업 자료 없음</b> — 사업 id 레지스트리가 다루는 시군구는 {Object.keys(SGG).length}곳입니다. 지도는 번들이 없는 지역도 경계·건물·건축HUB 인허가 사업을 요청 시 조회해 엽니다.</Alert>
      ) : (
        <Alert className="mt-3">사업 id 레지스트리에 이 조건의 사업이 아직 없습니다. 이 단계의 자료는 위 데이터 범위뿐이고 사업 단위로 허가·사업과 이어 주는 일이 남아 있습니다.</Alert>
      )}
      <Basis>사업 id 레지스트리 {projects[0].asOf} 기준({Object.keys(SGG).length}개 시군구라 전국 분포가 아닙니다). 단계는 건축HUB 인허가 기록과 지도 번들 상태를 6단계로 옮긴 제안 매핑(스펙 9.2)의 값입니다. 일정(당초·변경·현재 예정)과 단계 진입일이 없어 지연·주의·정상 신호와 단계별 머문 기간·병목은 아직 판정하지 않습니다.</Basis>
    </Page>
  );
}
