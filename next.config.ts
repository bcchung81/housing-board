import type { NextConfig } from 'next';

/* 이전 vercel.json 의 headers·functions 를 옮긴 것(스펙 8.3). 함수 지역 icn1 만 vercel.json 에 남는다. */

/* 함수 묶음에서 뺄 것은 우리 폴더에만 있는 이름으로 좁게 쓴다. 제외 패턴은 경로 어디에든 일치(contains)하므로 `dist`·`docs`·`tests`·`public`
   같은 흔한 폴더 이름을 쓰면 node_modules 안의 파일(next/dist/server/node-environment 등)까지 빠져, 함수가 `Cannot find module` 로 죽는다
   (2026-10-09 미리보기 배포에서 /api/* 가 모두 500). 시험·작업 자료·문서·도구는 .vercelignore 로 배포에 올라가지 않아 따로 뺄 필요가 없다. */
const NOT_FUNCTION = ['./.cache/**'];

const config: NextConfig = {
  /* Tailwind CSS v4 를 Turbopack 로더로 연결한다(Next 16.4 create-next-app 과 같은 방식). 모든 .css 가 지나가지만 Tailwind 지시문이 없는 파일은 그대로 나온다. */
  turbopack: { rules: { '*.css': { loaders: ['@tailwindcss/turbopack'], as: '*.css' } } },

  async headers() {
    return [
      { source: '/assets/vendor/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      { source: '/assets/js/:file(.+\\.[0-9a-f]{8}\\.js)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },   // build.js 가 만든 내용 해시 사본(옛 이름은 아래 기본 캐시로 남는다)
      { source: '/assets/home-map/:file(\\d{5}\\.[0-9a-f]{8}\\.json)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },   // 수도권 지도 정적 자료의 내용 해시 사본(build.js)
      { source: '/assets/home-lite/:file(\\d{5}\\.[0-9a-f]{8}\\.json)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },   // 수도권 경량 번들(사업 둘레 건물·지구 경계)의 내용 해시 사본(build.js)
      { source: '/regions/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=300, stale-while-revalidate=3600' }] },
      {   // 모든 경로: 지도를 다른 출처의 iframe 에 넣지 못하게 한다(스펙 2.3). 화면 전환은 같은 창이라 영향이 없다
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },

  /* 메뉴 통합(lib/shell/menu.ts)으로 없앤 화면의 옛 주소. 나중에 화면을 다시 열 수 있게 영구(308)가 아닌 임시(307) 넘김으로 둔다.
     2026-10-10: 단계별·단계 상세·시군구 상세는 사업 목록의 거르기다.
     2026-10-14(메뉴 5개): 사업 상세는 사업 목록의 서랍(?id=), 보고자료는 사업 화면의 인쇄 보기(?print=1), 공급 실적·시행주체별·우리 동네는 지역 공급(?sido=).
     월 상세(/month/:id)·기관 상세(/agency/:id)는 종합상황판 위젯이 링크하므로 넘기지 않는다. 쿼리는 Next 가 목적지에 덧붙인다 */
  async redirects() {
    return [
      { source: '/stage', destination: '/projects', permanent: false },
      { source: '/stage/:id(0[1-6])', destination: '/projects?stage=:id', permanent: false },
      { source: '/area/:sgg(\\d{5})', destination: '/projects?sgg=:sgg', permanent: false },
      { source: '/project/:id', destination: '/projects?id=:id', permanent: false },
      { source: '/reports', destination: '/projects?print=1', permanent: false },
      { source: '/area', destination: '/region', permanent: false },
      { source: '/area/:sido(\\d{2})', destination: '/region?sido=:sido', permanent: false },
      { source: '/agency', destination: '/region', permanent: false },
      { source: '/my-area', destination: '/region', permanent: false },
      { source: '/my-area/:sido', destination: '/region?sido=:sido', permanent: false },
    ];
  },

  /* 핸들러가 실행 때 읽는 파일을 함수 묶음에 넣고(경로를 계산해 읽어 자동 추적이 못 찾는다), 로컬 캐시와 큰 번들은 뺀다.
     이전 vercel.json functions 의 includeFiles·excludeFiles 와 같은 규칙: resolve 8.9 MB → 44 KB 로 줄였던 것. */
  outputFileTracingIncludes: {
    '/api/v1/resolve': ['./regions/index.json', './regions/*/region.json', './registry/projects.json'],   // 사업 id 해석은 레지스트리를 읽는다
    '/api/v1/permits': ['./registry/projects.json'],                                                      // 인허가 사업에 사업 id 를 붙인다
    '/api/v1/codes/search': ['./regions/index.json', './regions/*/region.json'],                         // 검색 후보의 번들 유무를 resolve 와 같은 표로 정한다
    '/api/bus': ['./regions/*/infra.json'],
  },
  outputFileTracingExcludes: {
    '/api/*': [...NOT_FUNCTION, './regions/*/buildings.json', './regions/*/projects.json', './regions/*/context.json'],
    '/api/v1/*': [...NOT_FUNCTION, './regions/*/buildings.json', './regions/*/projects.json', './regions/*/context.json', './regions/*/infra.json'],   // v1 함수는 infra.json 도 읽지 않는다(bus 만 읽는다)
  },
};

export default config;
