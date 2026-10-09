import localFont from 'next/font/local';

// 로고·본문·차트·지도 패널이 같은 전체 글꼴 파일을 공유한다.
export const doHyeon = localFont({
  src: '../../assets/fonts/do-hyeon/DoHyeon-Regular.woff2',
  weight: '400',
  style: 'normal',
  display: 'swap',
  variable: '--font-do-hyeon',
  adjustFontFallback: false,
  fallback: ['Apple SD Gothic Neo', 'Malgun Gothic', 'sans-serif'],
});
