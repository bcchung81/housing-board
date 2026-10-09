import type { Metadata } from 'next';
import Crumbs from '../../../components/Crumbs';
import { fmt } from '../../../lib/board/calc';
import { sources } from '../../../lib/board/data';
import type { Source } from '../../../lib/board/types';

export const metadata: Metadata = { title: '데이터 원본' };

const GROUPS = ['국토교통부', '한국토지주택공사', '서울주택도시공사', '국방부', '주택파동 지도 번들'];
/* 이 원천을 읽는 화면: [이름, 링크]. 목록 화면이 없는 곳(월 상세·사업 상세)은 가장 가까운 목록으로 보낸다. */
const SCREEN: Record<string, [string, string]> = { '/': ['종합상황판', '/'], '/area': ['지역별', '/area'], '/month': ['월 상세', '/area'], '/agency': ['기관별', '/agency'], '/projects': ['사업', '/projects'], '/project': ['사업 상세', '/projects'], '/map': ['지도', '/map'] };

/* 수집일(우리가 받은 시각)과 원천 기준일을 섞지 않는다(스펙 9.3). 모르는 값은 '확인하지 못함'. */
const when = (iso: string | null) => (iso ? iso.replace('T', ' ').replace(/:\d\d\+09:00$/, ' KST') : null);
const query = (q: Record<string, unknown>) => Object.entries(q).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`).join(' · ');

function Item({ s }: { s: Source }) {
  return (
    <section className="src" id={s.id} aria-label={s.dataset}>
      <h3>{s.dataset}</h3>
      <p>{s.description}</p>
      <dl className="dl">
        <dt>제공기관</dt><dd>{s.provider}</dd>
        <dt>받은 시각</dt><dd>{when(s.collectedAt) ?? <span className="na">기록 없음</span>} <span className="na">(우리가 받은 때)</span></dd>
        <dt>원천 기준일</dt><dd>{s.sourceAsOf ?? <span className="na">확인하지 못함</span>} <span className="na">(원천이 말하는 기준)</span></dd>
        <dt>건수</dt><dd>{fmt(s.count)}</dd>
        <dt>조회 조건</dt><dd>{query(s.query)}</dd>
        {s.license ? <><dt>이용허락</dt><dd>{s.license}</dd></> : null}
        <dt>이 화면들이 읽음</dt><dd>{s.usedBy.length ? s.usedBy.map((u, i) => <span key={u}>{i ? ', ' : ''}<a href={SCREEN[u][1]}>{SCREEN[u][0]}</a></span>) : <span className="na">아직 쓰지 않음</span>}</dd>
      </dl>
    </section>
  );
}

/* 데이터 원본(원천 카탈로그, 기획서 4.2·스펙 9.3). '쓰인 건수'(usedCount)는 '사용'의 정의가 미결(기획서 Q8)이라 건수 대신 읽는 화면을 보인다. */
export default function SourcesPage() {
  const items = sources.items;
  const used = items.filter((i) => i.usedBy.length > 0).length;
  return (
    <div className="page">
      <Crumbs items={[{ label: '종합상황판', href: '/' }, { label: '데이터 원본' }]} />
      <h1>데이터 원본 <span className="pill ok">실데이터</span></h1>
      <p className="lede">상황판이 받은 원천 {items.length}곳 중 {used}곳을 화면이 읽습니다. 받은 때와 원천이 말하는 기준일은 늘 따로 적습니다.</p>
      <div className="cards" style={{ marginTop: 10 }}>
        {GROUPS.map((g) => <a key={g} className="cardlink" href={`#g-${g}`}><b>{g}</b><span>{items.filter((i) => i.group === g).length}곳</span></a>)}
      </div>
      {GROUPS.map((g) => (
        <div key={g} id={`g-${g}`}>
          <h2 style={{ marginTop: 26 }}>{g}</h2>
          {items.filter((i) => i.group === g).map((s) => <Item key={s.id} s={s} />)}
        </div>
      ))}
    </div>
  );
}
