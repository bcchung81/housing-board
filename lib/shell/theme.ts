/* 루트 레이아웃이 달라도 저장된 테마를 첫 화면을 그리기 전에 복원한다. */
export const THEME_INIT = "try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}";

/* 처음 온 사람의 기본 화면은 일반사용자(/citizen). '/' 첫 화면에서 정책담당자를 고른 적이 없으면(audience ≠ 'admin') 보낸다 — 정책담당자는 토글이 'admin' 을 저장한다. */
export const AUDIENCE_INIT = "try{if(location.pathname==='/'&&localStorage.getItem('audience')!=='admin')location.replace('/citizen')}catch(e){}";
