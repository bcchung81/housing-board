import Link from 'next/link';

/* 종합상황판(L0). 시안(수치 SAMPLE) 이식 전이라, 지금은 위젯에서 내려가는 상세 화면의 길을 보인다(설계 문서 2절). */
const WAYS = [
  { href: '/area/11', title: '17개 시도 → 시도 상세', note: '시도 타일을 누르면 내려갑니다. 시군구 행 → 시군구 → 사업 상세', code: '/area/{시도2}' },
  { href: '/area/41450', title: '시군구 상세', note: '그 동네 사업 목록과 "이 동네 지도"', code: '/area/{시군구5}' },
  { href: '/project/PRJ-11290-0001', title: '사업 상세', note: '6단계·규모·위치·근거. "지도에서 보기"는 같은 창에서 지도 화면으로 전환', code: '/project/{PRJ-…}' },
  { href: '/stage/04', title: '병목 단계 막대 → 단계 상세', note: '그 단계에 머문 사업 목록', code: '/stage/{01~06}' },
  { href: '/agency/lh', title: '기관별 진행 → 기관 상세', note: '기관의 사업·호수·단계 분포', code: '/agency/{lh|gh|sh|local|mnd}' },
  { href: '/month/2026-10', title: '월별 공급 파동의 월 → 월 상세', note: '그 달의 인허가·착공·준공·분양 호수', code: '/month/{YYYY-MM}' },
  { href: '/sources', title: '모든 숫자의 출처 → 데이터 원본', note: '원천 카탈로그: 수집일과 원천 기준일을 따로', code: '/sources' },
];

export default function Home() {
  return (
    <div className="page">
      <h1>주택공급 종합상황판 <span className="pill sample">시안 이식 전</span></h1>
      <p className="lede">공급 6단계를 한눈에 보고, 시도·시군구·사업·지도로 내려갑니다. 모든 상세는 사이드바 메뉴 구조의 화면 전환입니다(팝업 없음).</p>

      <h2>위젯에서 내려가는 상세 화면</h2>
      <div className="cards">
        {WAYS.map((w) => (
          <Link key={w.href} className="cardlink" href={w.href}><b>{w.title}</b><span>{w.note}</span><code>{w.code}</code></Link>
        ))}
        <a className="cardlink" href="/map"><b>지도 화면</b><span>같은 창에서 전환. 사업·시군구에서는 <code>?project=</code> · <code>?sgg=</code> 로 바로 그 곳을 엽니다</span><code>/map</code></a>
      </div>

      <div className="box"><b>종합상황판 시안</b>(월별 공급 파동 · 지연·주의 추이 · 향후 12개월 · 기관별 · 17개 시도 · 데이터 흐름)은 이 자리로 옮겨 옵니다. 시안의 수치는 모두 샘플이라 옮긴 뒤에도 "샘플" 표지를 유지하고, 실데이터로 채울 수 있는 위젯부터 바꿔 갑니다.</div>
    </div>
  );
}
