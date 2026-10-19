/* HOME 개념 시안 v2 HTML 만들기: 공통 머리(TopNav)·머리글(PageHead + 요구사항 꼬리표)·칩 줄·카드 틀을 앱 컴포넌트와 같은 마크업으로 4개 파일(목차 + 사업·지역 공급·데이터 원본)에 찍는다.
   숫자는 하나도 적지 않는다 — 표·차트·요약·기준일은 assets/app.js 가 assets/data.json(build-data.mjs 가 실제 산출물에서 만든 스냅샷)으로 그린다.
   저장소 루트에서:
     node docs/design/home-concept/build-data.mjs && node docs/design/home-concept/gen-html.mjs && node docs/design/home-concept/build-css.mjs */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PROD = 'https://housing-board.vercel.app';
const THEME_INIT = "try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}";
const ICON = {
  moon: '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  menu: '<path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h16"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  printer: '<path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
};
const icon = (n, cls) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}" aria-hidden="true">${ICON[n]}</svg>`;

/* ---------- components/TopNav.tsx ---------- */
/* 시안 메뉴 5개: 보고자료·공급 실적·우리 동네는 사업·지역 공급에 흡수(운영 반영 여부는 따로 정함) */
const MENU = [['home', `${PROD}/`, '종합상황판'], ['map', `${PROD}/map`, '지도'], ['projects', 'projects.html', '사업'], ['region', 'region.html', '지역 공급'], ['sources', 'sources.html', '데이터 원본']];
const linkBase = 'relative flex items-center whitespace-nowrap text-muted-foreground no-underline hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary';
const linkSize = 'h-16 px-2 text-[16px] font-normal min-[1101px]:px-3 min-[1101px]:text-[18px] mobile:h-11 mobile:px-4 mobile:text-[14px]';
const linkOn = 'text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-primary min-[1101px]:after:inset-x-3 mobile:after:inset-x-0 mobile:after:inset-y-2 mobile:after:right-auto mobile:after:h-auto mobile:after:w-0.5';
const items = (active, exact) => MENU.map(([id, href, label]) => {
  const on = id === active;
  return `<li class="flex"><a href="${href}" class="${linkBase} ${linkSize}${on ? ` ${linkOn}` : ''}"${on && exact ? ' aria-current="page"' : ''} title="${label}">${label}</a></li>`;
}).join('');
const themeBtn = `<button type="button" data-theme-toggle class="flex size-9 cursor-pointer items-center justify-center rounded-[8px] border-0 bg-transparent p-0 text-muted-foreground hover:bg-pn2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" aria-pressed="false" aria-label="다크 모드" title="다크 모드 전환">${icon('moon', 'size-[18px] dark:hidden')}${icon('sun', 'hidden size-[18px] dark:block')}</button>`;
const topNav = (active, exact = true) => `<header class="sticky top-0 z-40 shrink-0 overflow-x-clip border-b border-border bg-card font-display font-normal text-card-foreground shadow-[0_1px_8px_rgba(15,23,42,.025)] print:hidden">
  <div class="ml-[max(0px,50vw_-_720px)] flex h-16 w-[min(1440px,100vw)] items-center gap-2 px-7 mobile:ml-0 mobile:h-12 mobile:w-auto mobile:px-3">
    <a class="mr-3 flex h-full shrink-0 items-center gap-[9px] text-[#0F1A3D] no-underline dark:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary" href="index.html" aria-label="시안 목차로">
      <svg class="block size-[33px] shrink-0" viewBox="4 4 64 60" aria-hidden="true"><path fill="currentColor" d="M8 28 27 12Q36 4 45 12L64 28 57 36 39 21Q36 18 33 21L15 36Z"/><path fill="#D65535" d="M8 43C18 33 27 32 38 40C48 48 54 45 64 35V48C54 58 45 60 34 51C25 44 18 43 8 54Z"/></svg>
      <span class="whitespace-nowrap text-[30px] font-normal leading-none tracking-[-0.035em]">주택파동</span>
    </a>
    <nav id="main-menu" aria-label="주 메뉴" class="mx-auto mobile:hidden"><ul class="m-0 flex list-none p-0">${items(active, exact)}</ul></nav>
    <div class="flex items-center gap-1 mobile:ml-auto">
      ${themeBtn}
      <button type="button" data-menu-toggle class="hidden size-9 cursor-pointer items-center justify-center rounded-[8px] border-0 bg-transparent p-0 text-foreground hover:bg-pn2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary mobile:flex" aria-expanded="false" aria-controls="main-menu-list" aria-label="메뉴">${icon('menu', 'size-[20px]')}</button>
    </div>
  </div>
  <nav id="main-menu-list" aria-label="주 메뉴" class="hidden border-t border-border bg-card shadow-[var(--shadow-pop)]"><ul class="m-0 flex list-none flex-col p-0">${items(active, exact)}</ul></nav>
</header>`;

/* ---------- 문서 틀: app/(dashboard)/layout.tsx 의 body ---------- */
const doc = ({ page, title, body }) => `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · 주택파동 시안 v2</title>
<script>${THEME_INIT}</script>
<link rel="stylesheet" href="assets/app.css">
<script defer src="assets/app.js"></script>
</head>
<body data-page="${page}" class="font-sans m-0 min-h-screen text-[16px] leading-[1.6] text-foreground [&_a:not([class])]:text-primary [background:var(--page-bg)] [font-synthesis:none] print:[background:#fff]">
${body}
</body>
</html>
`;
const PAGE = 'mx-auto flex max-w-[1440px] flex-col gap-3.5 px-7 pb-9 mobile:px-3 mobile:pb-6';
const dash = (active, inner) => `${topNav(active)}\n<main><div class="${PAGE}">\n${inner}\n</div></main>`;

/* ---------- components/Crumbs.tsx · page.tsx ---------- */
const crumbs = (list) => `<nav aria-label="현재 위치" data-slot="breadcrumb"><ol class="m-0 flex list-none flex-wrap items-center gap-1.5 p-0 text-[14px] text-muted-foreground">${list.map(([label, href], i) => `${i ? '<li role="presentation" aria-hidden="true" class="text-line2">›</li>' : ''}<li>${href ? `<a class="text-muted-foreground no-underline hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" href="${href}">${label}</a>` : `<span aria-current="page" class="font-bold text-foreground">${label}</span>`}</li>`).join('')}</ol></nav>`;
/* 요구사항 꼬리표: 머리 줄 오른쪽의 작은 칩. 누르면 데이터 원본의 충족 격자 해당 행. 이름·지시 날짜는 app.js 가 data.json 에서 title 로 붙인다(answer = 이 화면이 답하는 항목) */
const REQ_TAG = 'inline-block rounded-[6px] border border-line2 px-1.5 text-[12px] leading-[20px] font-bold whitespace-nowrap text-muted-foreground no-underline tabular-nums hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
const reqTag = (id, answer) => `<a href="sources.html#${id}" data-req="${id}" data-answer="${answer}" class="${REQ_TAG}">${id}</a>`;
const reqTags = (list) => `<span class="ml-auto flex flex-wrap items-center gap-1 self-center" aria-label="이 화면이 답하는 요구사항">${list.map(([id, answer]) => reqTag(id, answer)).join('')}</span>`;
const pageHead = ({ crumbs: c, title, tip, req, metaKey, children = '', right = '' }) => `<header class="-mb-0.5 pt-4 print:hidden" data-screen-only>
  ${crumbs(c)}
  <div class="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
    <h1 class="m-0 min-w-0 font-display text-[28px] leading-[1.2] font-normal tracking-[-0.03em] text-foreground [overflow-wrap:anywhere] mobile:text-[22px]"${tip ? ` title="${tip}"` : ''}>${title}</h1>
    ${children}
    ${reqTags(req)}
    <span class="text-[14px] whitespace-nowrap text-muted-foreground tabular-nums mobile:text-[13px]" data-meta="${metaKey}"></span>
    ${right}
  </div>
</header>`;
const PTITLE = 'm-0 text-[20px] leading-[1.25] font-display font-bold tabular-nums tracking-[0] [&_[data-slot=badge]]:text-[12px]';
const panelHead = ({ title, tip, id, right = '', cls = '' }) => `<div class="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 ${cls}"><h2${id ? ` id="${id}"` : ''} class="${PTITLE}"${tip ? ` title="${tip}"` : ''}>${title}</h2>${right ? `<div class="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1">${right}</div>` : ''}</div>`;
const CARD = 'border border-border bg-card text-card-foreground shadow-[var(--shadow-card)] card-soft min-w-0 rounded-[14px] px-5 py-5 print:shadow-none';
const card = (label, inner, cls = '') => `<section aria-label="${label}" class="${CARD} ${cls}">${inner}</section>`;
const panelLink = (href, text, full, attrs = '') => `<a href="${href}" title="${full}"${attrs} class="group/action inline-flex flex-none items-center gap-px rounded-[4px] text-[14px] leading-[1.45] whitespace-nowrap text-muted-foreground no-underline underline-offset-[3px] transition-colors hover:text-primary hover:underline focus-visible:text-primary focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><span>${text}</span>${icon('chevron-right', 'size-3.5 shrink-0 transition-transform group-hover/action:translate-x-0.5 motion-reduce:transition-none')}</a>`;
const srcLink = panelLink('sources.html', '데이터 원본', '데이터 원본');
const legendHtml = (list) => `<ul class="m-0 flex list-none flex-wrap items-center gap-x-2.5 gap-y-0.5 p-0 text-[13px] text-muted-foreground" aria-label="범례">${list.map(([cls, label, tip, style]) => `<li class="flex items-center gap-1 whitespace-nowrap"${tip ? ` title="${tip}"` : ''}><i class="block ${cls}"${style ? ` style="${style}"` : ''} aria-hidden="true"></i>${label}</li>`).join('')}</ul>`;
const HATCH_SW = '[background:repeating-linear-gradient(45deg,color-mix(in_srgb,var(--muted-foreground)_45%,transparent)_0_1.5px,transparent_1.5px_3.5px)]';

/* ---------- 칩 줄(종합상황판 범례 칩 모양). 한 줄을 지키려고 1400px 아래에서는 무리 이름을 숨긴다(무리는 aria-label 로 남는다) ---------- */
const CHIP = 'btn-reset flex items-center gap-1.5 rounded-full border border-transparent px-2 py-[3px] text-[14px] whitespace-nowrap [transition:background_.15s,border-color_.15s] aria-pressed:border-primary aria-pressed:bg-accent not-aria-pressed:hover:bg-pn2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary max-[1500px]:px-1';
const POPITEM = 'btn-reset block w-full rounded-[8px] px-3 py-1.5 text-left text-[14px] whitespace-nowrap hover:bg-pn2 aria-pressed:bg-accent aria-pressed:font-bold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary';
const chip = (val, label, { tip, sw } = {}) => `<button type="button" data-val="${val}" aria-pressed="false" class="${CHIP}"${tip ? ` title="${tip}"` : ''}>${sw ? `<i class="block size-2.5 flex-none rounded-[3px] ${sw.cls || ''}"${sw.style ? ` style="${sw.style}"` : ''} aria-hidden="true"></i>` : ''}${label}</button>`;
/* 펼침 메뉴: list 가 비면 app.js 가 data-pop-fill 로 채운다 */
const pop = (name, list, { cols = 1, fill = '' } = {}) => `<div class="relative" data-pop="${name}"><button type="button" data-pop-btn aria-expanded="false" aria-haspopup="true" aria-pressed="false" class="${CHIP}"><span data-pop-label>${name}</span>${icon('chevron-down', 'size-3.5 shrink-0 text-muted-foreground')}</button><div data-pop-menu hidden class="absolute top-full left-0 z-30 mt-1 min-w-[150px] rounded-[10px] border border-border bg-popover p-1 text-popover-foreground shadow-[var(--shadow-pop)]"><div${fill ? ` data-pop-fill="${fill}"` : ''} class="${cols === 2 ? 'grid grid-cols-2 gap-0.5' : 'flex max-h-[360px] flex-col gap-0.5 overflow-y-auto'}">${list.map(([v, l]) => `<button type="button" data-val="${v}" aria-pressed="false" class="${POPITEM}">${l}</button>`).join('')}</div></div></div>`;
/* multi: 여러 개를 켜고 끄는 칩(값은 쉼표로 이은 켜진 값, 마지막 하나는 끌 수 없음) */
const group = (key, label, inner, { def = '', toggle = false, showDef = false, bare = false, multi = false } = {}) => `<div role="group" aria-label="${label}" data-chips="${key}" data-default="${def}"${toggle ? ' data-toggle' : ''}${multi ? ' data-multi' : ''}${showDef ? ' data-show-def' : ''} class="flex items-center gap-0.5">${bare ? '' : `<span class="mr-1 text-[13px] whitespace-nowrap text-muted-foreground max-[1400px]:hidden">${label}</span>`}${inner}</div>`;
const SEP = '<span class="h-5 w-px flex-none bg-border mobile:hidden" aria-hidden="true"></span>';
const chipBar = (inner) => `<div class="flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-[12px] border border-border bg-card px-3 py-2 shadow-[var(--shadow-card)] print:hidden min-[1501px]:gap-x-4" aria-label="거르기" data-screen-only>${inner}</div>`;
const STC = ['var(--st-plan)', 'var(--st-permit)', 'var(--st-build)', 'var(--st-sale)', 'var(--st-soon)', 'var(--st-move)'];
const STN = ['계획', '인허가', '착공', '모집', '준공', '입주'];
const CIR = ['①', '②', '③', '④', '⑤', '⑥'];

/* ---------- components/StageLadder.tsx(공식 6단계) ---------- */
const STAGES = [['01', '정책', '정부가 무엇을 얼마나 공급할 것인가', 'gov'], ['02', '사업화', '어느 위치에 누가 몇 호를 추진할 것인가', 'gov'], ['03', '인허가', '실제로 사업할 수 있는 단계까지 왔는가', 'gov'], ['04', '건설', '착공했고 현재 얼마나 진행됐는가', 'gov'], ['05', '공급', '언제, 누구에게, 몇 호를 분양·임대하는가', 'pub'], ['06', '입주', '언제 실제 주택으로 완성되어 국민이 들어가는가', 'pub']];
const LADDER_A = 'card-lift keep-border flex min-h-[64px] w-full flex-col mobile:min-h-0 items-center justify-center gap-0.5 border-2 border-b-0 border-[var(--sc)] px-1 text-center no-underline mobile:h-auto mobile:flex-row mobile:justify-start mobile:gap-2 mobile:rounded-[8px] mobile:border-b-2 mobile:px-3 mobile:py-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
/* 사업 상세(서랍) 머리: 공개 범위 범례 → 6단계 스텝(현재 단계 강조, data-on/data-off 를 app.js 가 바꿔 끼움) → 핵심 수치(있는 것만 1~3칸) */
const ladderRow = () => `<div class="flex flex-col gap-3" id="head-row">
  <div>
  <p class="m-0 mb-1 flex flex-wrap justify-end gap-x-2.5 gap-y-0.5 text-[12px] text-muted-foreground" aria-label="공개 범위"><span class="flex items-center gap-1"><i class="block size-[9px] rounded-[2px] border-2 border-[var(--scope-gov)]" aria-hidden="true"></i>담당자 열람 (01~04)</span><span class="flex items-center gap-1"><i class="block size-[9px] rounded-[2px] border-2 border-[var(--scope-pub)]" aria-hidden="true"></i>국민에게도 공개 (05~06)</span></p>
  <div data-slot="stage-ladder" id="ladder" class="flex min-w-0"><ol class="m-0 grid flex-1 list-none grid-cols-6 p-0 mobile:grid-cols-1 mobile:gap-2" aria-label="공급 6단계">${STAGES.map(([code, name, q, scope], i) => { const off = `${LADDER_A} bg-[color-mix(in_srgb,var(--sc)_14%,var(--card))] text-[var(--sc)] hover:bg-[color-mix(in_srgb,var(--sc)_22%,var(--card))]`; return `<li data-code="${code}" class="flex min-w-0" style="--sc:var(--scope-${scope});--i:${i * 1.5}"><div class="flex flex-1 border-b-2 border-line2 px-1.5 mobile:border-b-0 mobile:px-0"><a href="projects.html" title="${code} ${name} — ${q}" data-on="${LADDER_A} q-pulse bg-[color-mix(in_srgb,var(--sc)_24%,var(--card))] text-foreground [box-shadow:0_0_0_2px_var(--primary)]" data-off="${off}" class="${off}"><span class="text-[15px] leading-none tabular-nums">${code}</span><b class="font-display text-[20px] leading-[1.25] font-normal">${name}</b><span data-now hidden><span class="rounded-full bg-primary px-2 text-[12px] leading-[18px] font-bold text-primary-foreground">현재</span></span></a></div></li>`; }).join('')}</ol></div>
  </div>
  <section aria-label="핵심 수치" id="kpis" class="grid auto-cols-[minmax(0,1fr)] grid-flow-col gap-2.5"></section>
</div>`;

const DETAILS = 'group rounded-[12px] border border-border bg-card print:hidden';
const SUMMARY = 'flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-0.5 rounded-[12px] px-4 py-2.5 text-[15px] font-bold hover:bg-pn2 focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden';
const DL = 'm-0 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-[16px] leading-[1.6] [&_dt]:text-muted-foreground [&_dd]:m-0 [&_dd]:[overflow-wrap:anywhere]';


const pages = {};

/* ===== 0. 목차: 3장 + 각 장이 답하는 요구사항 ===== */
const LINKCARD = 'border border-border bg-card text-card-foreground shadow-[var(--shadow-card)] card-lift flex h-full flex-col gap-1 rounded-[12px] px-4 py-3 no-underline hover:bg-pn2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&_b]:text-[17px] [&_b]:leading-[1.35] [&_b]:text-foreground';
const REQ_PROJECTS = [['F-01', '렌즈·지역·단계·기관으로 좁히고 구성 사업까지 표로 확인'], ['F-02', '9·7 목표 대비 확인·부족률(목표 있는 칸만)'], ['F-03', '6단계 칸마다 확인 실적 호수·사업 수'], ['F-07', '병목 단계(지연·주의 호수 최대) — 원인 기록은 없음'], ['F-08', '기관 칩(LH·SH·GH·기타)과 정책·프로그램 렌즈'], ['F-11', '핵심 질문 5, 상태 칩과 점검 필요(지연·주의, 지연 개월 순)']];
const REQ_DRAWER = [['F-04', '위치·기관·유형·규모와 근거 원천'], ['F-06', '단계마다 현재 예정·실제와 지연 개월 — 기준선(당초)은 없음']];
const REQ_REGION = [['F-01', '전국 ↔ 시도 실적·예정'], ['F-05', '연도별 실적(부분 연도 구분, 완결 연도만 전년 대비)'], ['F-09', '앞으로 12개월 모집·준공·입주 예정(예정일은 바뀔 수 있음)']];
const REQ_SOURCES = [['F-10', '요구사항 충족 판정, 원천마다 상태·마지막 정상 수집·기준일·건수, 연도 확보, 연결 검토 상태']];
const TOC = [
  ['projects.html', '사업', '목록 · 상세 서랍 · 월간 보고 인쇄', [...REQ_PROJECTS, ...REQ_DRAWER].sort()],
  ['region.html', '지역 공급', '앞으로 12개월 · 지난 실적 · 동네 여건', REQ_REGION],
  ['sources.html', '데이터 원본', '요구사항 충족 · 수집 상태 · 연도 확보 · 연결', REQ_SOURCES],
];
pages.index = doc({ page: 'index', title: '시안 목차', body: `<main><div class="${PAGE}">
<header class="flex flex-wrap items-baseline gap-x-3 gap-y-1 pt-6">
  <h1 class="m-0 font-display text-[28px] leading-[1.2] font-normal tracking-[-0.03em]" title="외부 PoC 'HOME'의 개념을 주택파동 화면 언어로 다시 그린 시안 v2 · 화면의 숫자는 모두 원장·HOME 덤프·통계누리 스냅샷(assets/data.json)에서 계산 · 종합상황판·지도는 제외">HOME 개념 흡수 시안 v2</h1>
  <span class="text-[14px] text-muted-foreground tabular-nums" data-meta="index"></span>
  <span class="ml-auto self-center">${themeBtn}</span>
</header>
<ol class="m-0 grid list-none grid-cols-3 gap-2.5 p-0 mobile:grid-cols-1">${TOC.map(([href, name, where, req], i) => `<li><a class="${LINKCARD}" href="${href}"><b>${i + 1}. ${name}</b><span class="text-[14px] text-muted-foreground">${where}</span><span class="mt-1 flex flex-wrap gap-1">${req.map(([id, answer]) => `<span data-req="${id}" data-answer="${answer}" class="${REQ_TAG}">${id}</span>`).join('')}</span></a></li>`).join('')}</ol>
<p class="m-0 text-[13px] text-muted-foreground" data-meta="index-note"></p>
</div></main>` });

/* ===== 1. 사업: 칩 줄 → 요약(핵심 질문 5 · 단계 파이프라인 · 정책별 비교) → 목록. 행을 누르면 오른쪽 서랍에 사업 상세(?id=). 인쇄·?print=1 은 월간 보고 보기 ===== */
const STATUS_SW = { ok: { cls: 'bg-ok' }, caution: { cls: 'bg-warn' }, delay: { cls: 'border-2 border-bad' }, long: { cls: 'bg-bad' }, none: { cls: `border border-line2 ${HATCH_SW}` } };
const BTN = 'btn-reset inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-line2 bg-card px-3 text-[14px] font-bold whitespace-nowrap text-foreground no-underline hover:bg-pn2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
const ICON_BTN = 'flex size-9 flex-none cursor-pointer items-center justify-center rounded-[8px] border-0 bg-transparent p-0 text-muted-foreground hover:bg-pn2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
const TL_TIP = '단계마다 두 줄: 현재 = 원장의 현재 예정 하나 · 실제 = 원천에서 확인한 날짜 · 지연 = 현재 예정일 경과 개월(당초 대비가 아님) · 기록이 하나도 없는 단계는 줄을 그리지 않음 · 오른쪽 열은 지연 개월';
pages.projects = doc({ page: 'projects', title: '사업', body: dash('projects', `
${pageHead({ crumbs: [['종합상황판', `${PROD}/`], ['사업']], title: '사업', tip: '수도권 HOME 사업을 정책·프로그램 렌즈와 지역·단계·상태·기관으로 거른다 · 행을 누르면 오른쪽에 사업 상세 · 보고서 인쇄 = 월간 진척 보고(2026.08.14 지시)', metaKey: 'projects',
  req: REQ_PROJECTS, right: `<a href="projects.html?print=1" class="${BTN} self-center" title="핵심 질문·단계 파이프라인·정책별 비교·우선 점검 상위 10·기준일·출처만 담은 월간 보고 보기(인쇄 미리보기)">${icon('printer', 'size-4 flex-none text-muted-foreground')}보고서 인쇄</a>` })}
<div data-print-bar role="toolbar" aria-label="인쇄 미리보기" class="mt-4 hidden items-center gap-2 rounded-[12px] border border-border bg-card px-4 py-2 text-[14px] text-muted-foreground print:hidden"><span class="mr-auto">인쇄 미리보기 · 월간 보고</span><button type="button" data-print class="${BTN}">${icon('printer', 'size-4 flex-none text-muted-foreground')}인쇄</button><a href="projects.html" class="${BTN}">닫기</a></div>
<header data-print-only class="hidden pt-4 print:block print:pt-0"><div class="flex flex-wrap items-baseline gap-x-3"><h1 class="m-0 font-display text-[28px] leading-[1.2] font-normal tracking-[-0.03em]">월간 주택공급 보고</h1><span class="text-[14px] text-muted-foreground tabular-nums" data-meta="report"></span></div></header>
${chipBar(`
  ${group('lens', '렌즈', `${chip('all', '전체')}<span data-lens-chips class="contents"></span>${pop('프로그램', [], { fill: 'program' })}`, { def: 'all', bare: true })}
  ${SEP}
  ${group('sido', '지역', `${pop('시도', [['', '전체'], ['11', '서울'], ['28', '인천'], ['41', '경기']])}<span data-sgg-chip hidden><button type="button" class="${CHIP}" aria-pressed="true" title="시군구 거르기 풀기"><span data-sgg-label></span>${icon('x', 'size-3.5 shrink-0')}</button></span>`, { bare: true })}
  ${SEP}
  ${group('stage', '단계', STN.map((n, i) => chip(String(i), `${CIR[i]}${n}`, { sw: { style: `background:${STC[i]}` } })).join(''), { toggle: true, bare: true })}
  ${SEP}
  ${group('status', '상태', chip('check', '점검 필요', { tip: '미리 정한 거르기: 주의·지연·장기 지연 사업을 지연 개월이 큰 순으로' }) + [['ok', '정상'], ['caution', '주의'], ['delay', '지연'], ['long', '장기 지연'], ['none', '일정 없음']].map(([v, l]) => chip(v, l, { sw: STATUS_SW[v] })).join(''), { toggle: true, bare: true })}
  ${SEP}
  ${group('agency', '기관', pop('기관', [['', '전체'], ['LH', 'LH'], ['SH', 'SH'], ['GH', 'GH'], ['기타', '기타']]), { bare: true })}
`)}
${card('요약', `<ol id="questions" class="m-0 grid list-none gap-0 divide-x divide-border p-0" aria-label="핵심 질문"></ol><div id="lens-summary" class="mt-5"></div>`)}
<section data-print-only aria-label="우선 점검 사업" class="${CARD} hidden print:block">${panelHead({ title: '우선 점검 사업 · 상위 10', tip: '현재 예정일 경과 개월이 큰 사업부터 최대 10건 · 판정: 주의 1~6개월, 지연 6개월 이상, 장기 지연 12개월 이상' })}<div id="priority"></div></section>
<p data-print-only class="m-0 hidden text-[13px] text-muted-foreground print:block" id="report-src"></p>
<section aria-label="사업 목록" class="${CARD} print:hidden" data-screen-only>${panelHead({ title: '<span id="list-title">사업 목록</span>', tip: '행을 누르면 오른쪽에 사업 상세 · 지연(개월) = 현재 예정일 경과 개월(주의 1~6, 지연 6 이상, 장기 지연 12 이상) · 공고 확인 = 모집공고에서 확인한 호수', right: `${panelLink(`${PROD}/map`, '지도', '지도에서 보기')}${srcLink}` })}<div id="project-grid"></div></section>
<aside id="drawer" hidden role="dialog" aria-modal="false" aria-labelledby="dr-name" class="fixed top-16 right-0 bottom-0 z-30 flex w-[min(60vw,980px)] flex-col border-l border-border shadow-[var(--shadow-pop)] [background:var(--page-bg)] print:hidden mobile:top-12 mobile:w-full [&[hidden]]:hidden">
  <header class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-card py-2.5 pr-3 pl-5">
    <h2 id="dr-name" tabindex="-1" data-f="name" class="m-0 min-w-0 font-display text-[24px] leading-[1.2] font-normal tracking-[-0.03em] [overflow-wrap:anywhere] focus:outline-none"></h2>
    <span id="head-badges" class="flex flex-wrap items-center gap-1.5"></span>
    ${reqTags(REQ_DRAWER)}
    <code class="text-[14px] text-muted-foreground" title="사업 id" data-f="id"></code>
    <button type="button" data-drawer-close class="${ICON_BTN}" aria-label="사업 상세 닫기" title="닫기 (Esc)">${icon('x', 'size-[18px]')}</button>
  </header>
  <div class="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 pt-4 pb-6">
    <p id="moved" hidden role="note" class="m-0 rounded-[10px] border border-border bg-muted px-4 py-2.5 text-[15px] text-muted-foreground"></p>
    ${ladderRow()}
    ${card('단계 타임라인', `${panelHead({ title: '단계 타임라인<span id="tl-status" class="ml-2 text-[14px] font-normal text-muted-foreground"></span>', tip: TL_TIP, right: '<span id="tl-legend"></span>' })}<div id="timeline"></div>`)}
    ${card('개요', `${panelHead({ title: '개요', right: `<span id="infra-link"></span>${panelLink('region.html', '지역 공급', '이 시도의 앞으로 12개월 예정·지난 실적·동네 여건', ' id="area-link"')}` })}<dl id="facts" class="m-0 grid grid-cols-[repeat(auto-fit,minmax(min(180px,100%),1fr))] gap-x-10 gap-y-3 text-[16px] leading-[1.6] [&_dd]:m-0 [&_dt]:text-[14px] [&_dt]:text-muted-foreground"></dl>`)}
    <details class="${DETAILS}">
      <summary class="${SUMMARY}">${icon('chevron-right', 'size-4 flex-none text-muted-foreground transition-transform group-open:rotate-90')}근거<span class="font-normal text-muted-foreground" id="evidence-meta"></span></summary>
      <div class="border-t border-border px-4 py-3"><dl class="${DL} text-[14px]" id="evidence"></dl></div>
    </details>
  </div>
</aside>
`) });

/* ===== 2. 지역 공급(옛 우리 동네 + 공급 실적): 시도 칩 → ① 앞으로 12개월 → ② 지난 공급 실적 → ③ 동네 여건(서울·인천·경기만) ===== */
const CAL_KINDS = [['SUPPLY_NOTICE', '모집', 'var(--st-sale)'], ['COMPLETION', '준공', 'var(--st-soon)'], ['MOVE_IN', '입주', 'var(--st-move)']];
const SIDO_ORDER = [['11', '서울'], ['26', '부산'], ['27', '대구'], ['28', '인천'], ['12', '전남광주'], ['30', '대전'], ['31', '울산'], ['36', '세종'], ['41', '경기'], ['51', '강원'], ['43', '충북'], ['44', '충남'], ['52', '전북'], ['47', '경북'], ['48', '경남'], ['50', '제주']];
pages.region = doc({ page: 'region', title: '지역 공급', body: dash('region', `
${pageHead({ crumbs: [['종합상황판', `${PROD}/`], ['지역 공급']], title: '지역 공급', tip: '앞으로 12개월 예정(원장 현재 예정) → 지난 공급 실적(통계누리) → 동네 여건(서울·인천·경기) 순', metaKey: 'region', req: REQ_REGION })}
${chipBar(group('sido', '시도', [chip('', '전국'), ...SIDO_ORDER.map(([c, n]) => chip(c, n))].join(''), { def: '', bare: true }))}
${card('앞으로 12개월', `${panelHead({ title: '앞으로 12개월<span id="cal-period" class="ml-2 text-[14px] font-normal text-muted-foreground"></span>', tip: '사업 원장의 현재 예정(모집공고·준공·입주) · 종류마다 사업당 하나 · 이미 실제 기록이 있는 종류는 뺌 · 막대 한 조각 = 사업 하나(높이 = 호수) · 지도 원 넓이 = 호수(지도는 서울·인천·경기만) · 예정일은 계획이라 바뀔 수 있고 청약 자격은 모집공고에서 확인',
    right: group('kind', '종류', CAL_KINDS.map(([v, l, c]) => chip(v, `${l}<span data-kind-n="${v}" class="text-muted-foreground tabular-nums"></span>`, { sw: { style: `background:${c}` } })).join(''), { def: CAL_KINDS.map(([v]) => v).join(','), multi: true }) })}
  <div id="cal-grid" class="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-3.5 narrow:grid-cols-1"><div id="wave" class="min-w-0"></div><div id="cal-map" class="min-w-0"></div></div>
  <div id="cal-list" class="mt-4"></div>
  <div id="cal-hud" hidden role="presentation" class="pointer-events-none fixed z-50 max-w-[300px] rounded-[8px] border border-border bg-popover px-2.5 py-1.5 text-[13px] leading-[1.45] text-popover-foreground shadow-[var(--shadow-pop)]"></div>`)}
${card('지난 공급 실적', `${panelHead({ title: '<span id="chart-title"></span>', right: `${group('metric', '지표', [['permit', '인허가', 'var(--st-permit)'], ['start', '착공', 'var(--st-build)'], ['sale', '분양', 'var(--st-sale)'], ['complete', '준공', 'var(--st-soon)']].map(([v, l, c]) => chip(v, l, { sw: { style: `background:${c}` } })).join(''), { def: 'complete', bare: true })}<span id="chart-legend"></span>${srcLink}` })}<div id="chart"></div><div id="table-wrap" class="mt-5"><h3 id="table-title" class="m-0 text-[16px] font-normal text-muted-foreground"></h3><div id="table"></div></div>`)}
<div id="cond-wrap">${card('동네 여건', `${panelHead({ title: '동네 여건', tip: '숫자마다 기준연도가 다름 · 재고−가구 차이는 공급 부족 확정치가 아님 · KOSIS·SGIS(HOME 지역 지표) · 서울·인천·경기만', right: srcLink })}<div id="cond"></div>`)}</div>
<p id="cond-none" hidden class="m-0 px-1 text-[14px] text-muted-foreground"></p>
`) });

/* ===== 3. 데이터 원본: ① 요구사항 충족 → ② 수집 상태(실패·경고 위, 정상은 기관별로 접음) → ③ 연도 확보 → ④ 연결 ===== */
pages.sources = doc({ page: 'sources', title: '데이터 원본', body: dash('sources', `
${pageHead({ crumbs: [['종합상황판', `${PROD}/`], ['데이터 원본']], title: '데이터 원본', metaKey: 'sources', req: REQ_SOURCES })}
${card('요구사항 충족', `${panelHead({ title: '요구사항 충족', tip: 'HOME 기능 요구 F-01~F-12 · 판정은 실제 자료로 계산한 근거 지표와 규칙(build-data.mjs JUDGE)으로 냄 — 충족·부분·없음 · 다른 화면의 요구사항 꼬리표를 누르면 이 표의 그 행', right: '<span id="req-summary"></span>' })}<div id="req-grid"></div>`)}
${card('수집 상태', `${panelHead({ title: '수집 상태<span id="src-count" class="ml-2 text-[14px] font-normal text-muted-foreground tabular-nums"></span>', tip: '실패·경고 원천만 표로 펼치고, 정상 원천은 기관별로 접음(기관 · 원천 수 · 최근 수집일) · 실패 = 마지막 실행 실패(마지막 정상 값을 씀) · 경고 = 마지막 수집이 일부만 · 우리 = 파일로 받아 둔 원천 카탈로그, HOME = 덤프의 수집 실행 결과',
    right: '<span id="src-legend"></span>' })}<div id="src-grid"></div><div id="src-orgs" class="mt-4"></div>`)}
${card('연도 확보', `${panelHead({ title: '연도 확보', tip: '원천마다 2018~2026 자료가 있는지 · 부분은 일부 월·범위만(2026은 진행 중인 해) · 통계누리는 월 자료로 센 값 · 빈틈 없는 원천과 올해 자료만 있는 원천은 한 줄로 접음',
    right: legendHtml([['size-[9px] rounded-[2px] bg-primary', '확보'], ['size-[9px] rounded-[2px]', '부분', '', 'background:color-mix(in srgb,var(--primary) 26%,var(--card))'], [`size-[9px] rounded-[2px] border border-line2 ${HATCH_SW}`, '미확보']]) })}<div id="coverage"></div>`)}
${card('연결', `${panelHead({ title: '연결', tip: '정책–프로그램, 프로그램–사업 연결(사업 원장 links) · 검토 중 = 담당자 확인 전 제안 · 해제된 연결은 빠짐',
    right: legendHtml([['size-[9px] rounded-[2px] bg-primary', '확정'], ['size-[9px] rounded-[2px]', '검토 중', '', 'background:color-mix(in srgb,var(--primary) 30%,var(--card))']]) })}<div id="links" class="mt-3 grid grid-cols-2 gap-x-10 gap-y-5 narrow:grid-cols-1"></div>`)}
`) });

for (const [name, html] of Object.entries(pages)) writeFileSync(path.join(here, `${name}.html`), html);
console.log('HTML:', Object.keys(pages).map((n) => `${n}.html`).join(' '));
