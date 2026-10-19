'use client';
/* 상단 메뉴 바(한 줄, PC 높이 64px). 왼쪽 로고, 가운데 메뉴 글자 링크(5개, 전부 한 줄에 보인다), 오른쪽 보기 대상 스위치 → 테마 스위치. 900px 이하에서는 햄버거 하나로 접혀 아래로 펼쳐진다. 인쇄에는 싣지 않는다.
   지도 화면(compact)도 동일한 헤더와 테마 토글을 사용하며 문서 단위로 이동한다.
   안쪽 상자는 스크롤바를 뺀 폭이 아니라 화면 폭(100vw) 기준으로 폭·자리를 정한다: 문서 스크롤바가 있는 화면(종합상황판·사업…)과 없는 화면(우리 동네·지도)을
   오갈 때 메뉴 바가 움직이지 않게. 폭도 100vw 기준이라 1470px 보다 좁은 화면에서도 같고(2026-10-10: 메뉴 7px·테마 단추 14px 이동), 스크롤바 밑으로 들어가는 몫은 overflow-x-clip 으로 자른다
   (오른쪽 여백 28px 이 스크롤바 15px 보다 넓어 단추는 가려지지 않는다). 900px 이하는 여백이 12px 이라 예전처럼 남은 폭을 쓴다.
   사업·지역 공급·데이터 원본은 정책담당자 관점에서만 보인다(li 의 data-aud-only="admin", html[data-aud=public] 이면 CSS 로 숨김: 첫 그림부터). 화면 자체는 일반사용자도 주소로 열 수 있다.
   지도로 가는 링크와 지도 안의 모든 링크는 <Link> 대신 <a> 로 둔다: 지도는 루트 레이아웃이 달라 들어갈 때·나올 때 전체 문서가 새로 열린다
   (app.js 는 문서당 한 번만 도는 스크립트라서).
   보기 대상(관점)은 첫 그림 전 스크립트(AUDIENCE_INIT)가 정한 html[data-aud] 를 따른다: 스위치 손잡이·글자 강조는 그 표시를 보는 CSS 로 그리고,
   로고·'종합상황판' 주소(관점 첫 화면: 일반사용자 /citizen, 정책담당자 '/')와 aria-checked 는 수화 뒤 맞춘다. 수화 전에 '/' 를 눌러도 AUDIENCE_INIT 이 일반사용자를 /citizen 으로 보낸다. */
import { BriefcaseBusiness, Menu, Moon, Sun, User, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from 'cn';
import { mapHref } from '@/lib/board/map-href';
import { MENU, activeMenuId, myAreaScope, peerHref } from '@/lib/shell/menu';
import { displayAudience } from '@/lib/shell/theme';
import { Switch } from './ui/switch';

type Audience = 'public' | 'admin';
const homeOf = (a: Audience | null) => (a === 'public' ? '/citizen' : '/');   // 관점 첫 화면(모르면 '/': AUDIENCE_INIT 이 넘긴다)

const linkBase = 'relative flex items-center whitespace-nowrap text-muted-foreground no-underline hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary';

export default function TopNav({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const active = compact ? 'map' : activeMenuId(pathname);
  const [open, setOpen] = useState(false);          // 900px 이하의 펼침 메뉴
  const [dark, setDark] = useState(false);
  const [aud, setAud] = useState<Audience | null>(null);
  const [mapTo, setMapTo] = useState('/map');   // 머리 메뉴 '지도' 주소: 일반사용자가 내 동네를 정했으면 그 동네(수화 뒤에 정한다 — 서버 렌더는 '/map')
  useEffect(() => { setDark(document.documentElement.classList.contains('dark')); }, []);
  /* 표시 관점 = 경로 규칙(정책담당자 전용 화면은 admin, /map 은 저장값). 첫 그림 전에는 AUDIENCE_INIT 이, 앱 안 이동으로 경로가 바뀌면 여기서 다시 정한다 */
  useEffect(() => {
    let saved: Audience = 'public';
    try { saved = localStorage.getItem('audience') === 'admin' ? 'admin' : 'public'; } catch (_) { /* 저장소를 못 쓰면 일반사용자 */ }
    const next = displayAudience(pathname, saved);
    document.documentElement.dataset.aud = next;
    setAud(next);
    let area: string | null = null;
    try { area = localStorage.getItem('myArea'); } catch (_) { /* 저장소를 못 쓰면 동네 없음 */ }
    setMapTo(next === 'public' ? mapHref(myAreaScope(area)) : '/map');
  }, [pathname]);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('theme', next ? 'dark' : 'light'); } catch (_) { /* 저장소를 못 써도 이번 화면에서는 바뀐다 */ }
    window.dispatchEvent(new Event('housing:theme-change'));
  };

  /* 보기 대상을 바꾸면 저장하고 그 관점의 첫 화면으로 간다(같은 관점이면 그대로). 정책담당자 전용 화면은 늘 정책담당자로 보이므로 끄는 동작만 있다 */
  const chooseAudience = (next: Audience) => {
    if (next === aud) return;
    setAud(next);
    document.documentElement.dataset.aud = next;
    try { localStorage.setItem('audience', next); } catch (_) { /* 저장소를 못 써도 이동은 그대로 */ }
    window.location.assign(peerHref(pathname, window.location.search, next) ?? homeOf(next));   // 짝 화면(사업 ↔ 사업 찾기 등)이 있으면 그리로
  };
  const home = homeOf(aud);

  const items = MENU.map((m) => {
    const on = active === m.id;
    const href = m.id === 'home' ? home : m.id === 'map' ? mapTo : m.href;
    const exact = pathname === href;
    const label = (<>{m.label}{m.soon ? <em className="ml-1.5 hidden rounded-full border border-border px-1.5 py-px text-sm not-italic min-[1280px]:inline">준비 중</em> : null}</>);
    const cls = cn(linkBase, 'h-16 px-2 text-(length:--fs-nav) font-normal min-[1101px]:px-3 mobile:h-11 mobile:px-4', on && 'text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-primary min-[1101px]:after:inset-x-3 mobile:after:inset-x-0 mobile:after:inset-y-2 mobile:after:right-auto mobile:after:h-auto mobile:after:w-0.5');
    return (
      <li key={m.id} className={cn('flex', m.adminOnly && '[html[data-aud=public]_&]:hidden', m.publicOnly && '[html[data-aud=admin]_&]:hidden')} data-aud-only={m.adminOnly ? 'admin' : m.publicOnly ? 'public' : undefined}>
        {/* /citizen 은 Next 화면이 아니라 정적 문서(next.config 의 rewrites)라 <a> 로 간다 */}
        {compact || m.id === 'map' || href === '/citizen'
          ? <a href={href} className={cls} aria-current={on && (compact ? m.id === 'map' : exact) ? 'page' : undefined} title={m.label}>{label}</a>
          : <Link href={href} className={cls} aria-current={exact ? 'page' : undefined} title={m.label}>{label}</Link>}
      </li>
    );
  });

  return (
    <header className="sticky top-0 z-40 shrink-0 overflow-x-clip border-b border-border bg-card font-normal text-card-foreground shadow-card print:hidden">
      {/* 1600px 이상 대시보드는 본문 틀(components/page.tsx)과 같이 1760px 선. 지도(compact)도 같은 선이다(app.css .shell-map .mhead 가 같은 1440/1760px 선에 맞춘다) */}
      <div className={cn('ml-[max(0px,50vw_-_720px)] flex h-16 w-[min(1440px,100vw)] items-center gap-2 px-7 mobile:ml-0 mobile:h-12 mobile:w-auto mobile:px-3 min-[1600px]:ml-[max(0px,50vw_-_880px)] min-[1600px]:w-[min(1760px,100vw)]')}>
        <a className="mr-3 flex h-full shrink-0 items-center no-underline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary" href={home} aria-label="The주택 종합상황판 처음으로">
          <svg className="block h-(--logo-h) w-auto shrink-0 max-[599px]:hidden" viewBox="0 0 250 64" aria-hidden="true">
            {/* 로고 한 벌(lockup): 열린 문 심벌 + The(클레이) + 주택(잉크). 원본 docs/design/the-jutaek-logo/. 한글 윤곽은 Noto Sans KR Bold 에서 뽑았다(SIL OFL 1.1, assets/fonts/noto-sans-kr/LICENSE) */}
            <path className="fill-logo-ink" d="M9 25.7 32.9 6.4Q36 3.9 39.1 6.4L63 25.7V55Q63 59 59 59H51.8V30.1L37.3 18.3Q36 17.2 34.7 18.3L20.2 30.1V52.6H26.2V59H13Q9 59 9 55Z" />
            <path className="fill-logo-wave" fillRule="evenodd" d="M29.4 28.7 48.2 21.1V51.4L29.4 59V28.7ZM41.4 34.9A2.65 2.65 0 1 0 41.4 40.2A2.65 2.65 0 1 0 41.4 34.9Z" />
            <g className="fill-logo-wave" transform="translate(80 9.1) scale(2.275)"><path d="M0.5 2.2H10.6L11.8 3.4V5H7.7V17.8H4.6V5H0.5Z" /><path d="M13.3 2.2H16.3V7.9C17.1 6.8 18.3 6.2 19.8 6.2C22.5 6.2 24 7.9 24 10.8V17.8H21V11.2C21 9.5 20.3 8.7 19 8.7C17.4 8.7 16.3 9.8 16.3 11.6V17.8H13.3Z" /><path fillRule="evenodd" d="M31 6.2C34.3 6.2 35.7 8.6 35.7 11.6V12.8H28.3C28.5 14.5 29.6 15.4 31.3 15.4C32.6 15.4 33.6 15 34.6 14.3L35.4 16.5C34.2 17.5 32.8 18 31.1 18C27.5 18 25.3 15.7 25.3 12.1C25.3 8.7 27.5 6.2 31 6.2ZM28.3 10.7H32.9C32.7 9.2 32 8.5 30.8 8.5C29.5 8.5 28.6 9.3 28.3 10.7Z" /></g>
            <g className="fill-logo-ink"><path d="M183.42 16.60H188.70V17.88Q188.70 20.06 187.99 22.11Q187.29 24.16 185.88 25.91Q184.47 27.66 182.44 29.05Q180.42 30.43 177.78 31.39Q175.14 32.35 171.91 32.76L169.68 28.07Q172.50 27.70 174.71 26.95Q176.92 26.20 178.55 25.18Q180.19 24.16 181.28 22.97Q182.38 21.79 182.90 20.47Q183.42 19.15 183.42 17.88ZM185.20 16.60H190.43V17.88Q190.43 19.15 190.95 20.47Q191.48 21.79 192.57 22.97Q193.66 24.16 195.32 25.18Q196.98 26.20 199.16 26.95Q201.35 27.70 204.17 28.07L201.94 32.76Q198.71 32.35 196.07 31.39Q193.43 30.43 191.41 29.05Q189.38 27.66 187.99 25.91Q186.61 24.16 185.90 22.11Q185.20 20.06 185.20 17.88ZM183.74 38.67H189.79V54.09H183.74ZM167.86 35.17H205.99V40.04H167.86ZM171.23 14.10H202.49V18.88H171.23Z" /><path d="M209.27 31.16H212.18Q215.23 31.16 217.67 31.09Q220.10 31.03 222.28 30.82Q224.47 30.62 226.79 30.25L227.33 35.08Q224.92 35.48 222.65 35.71Q220.37 35.94 217.85 35.99Q215.32 36.03 212.18 36.03H209.27ZM209.27 14.74H225.83V19.56H215.1V33.85H209.27ZM213.37 23.02H225.42V27.57H213.37ZM237.98 11.92H243.76V37.67H237.98ZM232.98 22.24H239.67V27.11H232.98ZM229.02 12.69H234.66V37.40H229.02ZM214.78 39.44H243.76V54.09H237.71V44.31H214.78Z" /></g>
          </svg>
          <svg className="hidden size-(--logo-mark) shrink-0 max-[599px]:block" viewBox="4 4 64 60" aria-hidden="true">
            <path className="fill-logo-ink" d="M9 25.7 32.9 6.4Q36 3.9 39.1 6.4L63 25.7V55Q63 59 59 59H51.8V30.1L37.3 18.3Q36 17.2 34.7 18.3L20.2 30.1V52.6H26.2V59H13Q9 59 9 55Z" />
            <path className="fill-logo-wave" fillRule="evenodd" d="M29.4 28.7 48.2 21.1V51.4L29.4 59V28.7ZM41.4 34.9A2.65 2.65 0 1 0 41.4 40.2A2.65 2.65 0 1 0 41.4 34.9Z" />
          </svg>
        </a>
        <nav id="main-menu" aria-label="주 메뉴" className="mx-auto mobile:hidden"><ul className="m-0 flex list-none p-0">{items}</ul></nav>
        <div className="flex items-center mobile:ml-auto">
          <div className="flex items-center gap-3">
            {/* 보기 대상 스위치: 꺼짐 = 일반사용자(사람), 켜짐 = 정책담당자(서류가방). 양옆 글자는 모든 폭에서 14px 로 둘 다 보인다(지금 관점 진하게, 눌러도 바뀐다). 이름은 스위치가 가지므로 글자는 읽기 도구에서 숨긴다 */}
            <div className="flex items-center gap-2 font-sans text-sm" title="일반사용자 ↔ 정책담당자 화면 바꾸기">
              <span aria-hidden="true" className="cursor-pointer whitespace-nowrap font-bold text-foreground [html[data-aud=admin]_&]:font-normal [html[data-aud=admin]_&]:text-muted-foreground" onClick={() => chooseAudience('public')}>일반사용자</span>
              <Switch on="admin" checked={aud === 'admin'} onCheckedChange={(v) => chooseAudience(v ? 'admin' : 'public')} aria-label="정책담당자 화면" offIcon={<User aria-hidden="true" />} onIcon={<BriefcaseBusiness aria-hidden="true" />} />
              <span aria-hidden="true" className="cursor-pointer whitespace-nowrap text-muted-foreground [html[data-aud=admin]_&]:font-bold [html[data-aud=admin]_&]:text-foreground" onClick={() => chooseAudience('admin')}>정책담당자</span>
            </div>
            {/* 보기 대상 묶음과 테마 스위치를 가르는 세로 구분선(1×20px, 좌우 gap-3 12px). 599px 이하는 없고 테마 스위치도 펼침 메뉴 맨 아래 줄로 옮긴다 */}
            <span aria-hidden="true" data-role="switch-divider" className="h-5 w-px shrink-0 bg-border max-[599px]:hidden" />
            {/* 테마 스위치: 꺼짐(라이트) = 해, 켜짐(다크) = 달 */}
            <Switch on="dark" checked={dark} onCheckedChange={toggleTheme} aria-label="다크 모드" title="다크 모드 전환" className="max-[599px]:hidden" offIcon={<Sun aria-hidden="true" />} onIcon={<Moon aria-hidden="true" />} />
          </div>
          <button type="button" className="ml-1 hidden size-9 cursor-pointer items-center justify-center rounded-tile border-0 bg-transparent p-0 text-foreground hover:bg-pn2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary mobile:flex" aria-expanded={open} aria-controls="main-menu-list" aria-label="메뉴" onClick={() => setOpen(!open)}>
            {open ? <X className="size-[20px]" aria-hidden="true" /> : <Menu className="size-[20px]" aria-hidden="true" />}
          </button>
        </div>
      </div>
      {open ? <nav id="main-menu-list" aria-label="주 메뉴" className="hidden border-t border-border bg-card shadow-pop mobile:block"><ul className="m-0 flex list-none flex-col p-0">{items}</ul>
        {/* 599px 이하: 테마 스위치는 펼침 메뉴 맨 아래 줄 */}
        <div className="hidden h-11 items-center justify-between border-t border-border px-4 text-sm max-[599px]:flex font-normal"><span aria-hidden="true">다크 모드</span><Switch on="dark" checked={dark} onCheckedChange={toggleTheme} aria-label="다크 모드" offIcon={<Sun aria-hidden="true" />} onIcon={<Moon aria-hidden="true" />} /></div></nav> : null}
    </header>
  );
}
