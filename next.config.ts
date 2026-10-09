import type { NextConfig } from 'next';

/* 이전 vercel.json 의 headers·functions 를 옮긴 것(스펙 8.3). 함수 지역 icn1 만 vercel.json 에 남는다. */

/* 함수 묶음에 딸려 가면 안 되는 것: 로컬 캐시, 시험·작업 자료·문서·도구(.vercelignore 로 배포에도 안 올라가지만 로컬 빌드의 추적에도 들어가지 않게) */
const NOT_FUNCTION = ['./.cache/**', './tests/**', './workspace/**', './dist/**', './docs/**', './tools/**', './schemas/**', './public/**'];

const config: NextConfig = {
  async headers() {
    return [
      { source: '/assets/vendor/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
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
