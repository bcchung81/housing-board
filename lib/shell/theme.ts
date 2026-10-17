/* 루트 레이아웃이 달라도 저장된 테마를 첫 화면을 그리기 전에 복원한다. */
export const THEME_INIT = "try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}";

/* 보기 대상(관점): 저장값 audience 가 'admin' 이면 정책담당자, 없거나 그 밖이면 일반사용자. 첫 그림 전에 <html data-aud="public|admin"> 을 정해
   머리 줄 스위치·글자 강조를 CSS 로 그린다(깜빡임 없음). 처음 온 사람의 기본 화면은 일반사용자(/citizen): '/' 에서 정책담당자가 아니면 보낸다(다른 경로는 넘기지 않는다).
   저장소를 못 쓰면 일반사용자로 보이되 넘기지 않는다. */
export const AUDIENCE_INIT = "try{var a=localStorage.getItem('audience')==='admin'?'admin':'public';document.documentElement.dataset.aud=a;if(location.pathname==='/'&&a!=='admin')location.replace('/citizen')}catch(e){document.documentElement.dataset.aud='public'}";
