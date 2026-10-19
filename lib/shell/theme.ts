/* 루트 레이아웃이 달라도 테마를 첫 화면을 그리기 전에 복원한다. 다크가 기본: 저장값이 'light' 일 때만 라이트(없음·'dark'·저장소 예외는 다크, 2026-10-18). */
export const THEME_INIT = "try{if(localStorage.getItem('theme')!=='light')document.documentElement.classList.add('dark')}catch(e){document.documentElement.classList.add('dark')}";

/* 보기 대상(관점): 저장값 audience 가 'admin' 이면 정책담당자, 없거나 그 밖이면 일반사용자. 첫 그림 전에 <html data-aud="public|admin"> 을 정해
   머리 줄 스위치·글자 강조를 CSS 로 그린다(깜빡임 없음). 표시 관점은 경로 규칙: /map 은 두 관점이 같이 쓰므로 저장값을 따르고,
   일반사용자 화면(/citizen/ 아래 — 사업 찾기·공급 일정, 2026-10-19)은 저장값과 상관없이 'public', 그 밖의 정책담당자 전용 화면은 'admin'(저장값은 바꾸지 않는다).
   처음 온 사람의 기본 화면은 일반사용자(/citizen): '/' 에서 저장값이 정책담당자가 아니면 보낸다(넘김은 저장값 기준, 다른 경로는 넘기지 않는다). 저장소를 못 쓰면 저장값은 일반사용자로 보고 넘기지 않는다. */
export const AUDIENCE_INIT = "var p=location.pathname,m=p==='/map'||p.indexOf('/map/')===0,c=p.indexOf('/citizen/')===0;try{var a=localStorage.getItem('audience')==='admin'?'admin':'public';document.documentElement.dataset.aud=m?a:c?'public':'admin';if(p==='/'&&a!=='admin')location.replace('/citizen')}catch(e){document.documentElement.dataset.aud=m||c?'public':'admin'}";

/* 앱 안 이동용 같은 규칙(TopNav): 경로와 저장값으로 표시 관점을 정한다 */
export const isMapPath = (pathname: string) => pathname === '/map' || pathname.startsWith('/map/');
export const isPublicPath = (pathname: string) => pathname.startsWith('/citizen/');
export const displayAudience = (pathname: string, saved: 'public' | 'admin'): 'public' | 'admin' => (isMapPath(pathname) ? saved : isPublicPath(pathname) ? 'public' : 'admin');
