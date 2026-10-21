'use client';
/* 종합상황판 '월별 공급 파동' 자리: 3D(SupplyWave3D, three·R3F)를 고를 수 있으면 지연 로딩해 그리고, 아니면 지금 2D SVG(fallback)를 그대로 그린다.
   3D 는 next/dynamic(ssr:false)으로만 불러 '/' 첫 화면 JS 에 three 가 들어가지 않는다. 서버 렌더·판정 전에는 2D 다.
   2D 로 남는 경우: WebGL 없음 · 움직임 줄이기(prefers-reduced-motion) · 900px 이하(lib/board/wave3d-mode.ts viewMode). */
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { viewMode } from '@/lib/board/wave3d-mode';
import type { Wave3DProps } from './SupplyWave3D';

/* 3D 조각을 받는 동안은 3D 판과 같은 비(2D 리본 viewBox 960×400)의 빈 자리 — 높이가 흔들리지 않게 */
const Wave3D = dynamic(() => import('./SupplyWave3D'), { ssr: false, loading: () => <div className="mt-3 aspect-[12/5] w-full" aria-hidden="true" /> });

export default function SupplyWaveChart({ fallback, ...props }: Wave3DProps) {
  const [mode, setMode] = useState<'3d' | '2d' | null>(null);
  useEffect(() => {
    const cv = document.createElement('canvas'), gl = cv.getContext('webgl2') ?? cv.getContext('webgl');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();   // 판정에만 쓴 문맥은 바로 돌려준다
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
    const decide = () => setMode(viewMode({ webgl: !!gl, reduced: rm.matches, width: window.innerWidth }));
    decide();
    rm.addEventListener('change', decide); window.addEventListener('resize', decide);
    return () => { rm.removeEventListener('change', decide); window.removeEventListener('resize', decide); };
  }, []);
  if (mode !== '3d') return <>{fallback}</>;
  return <Wave3D {...props} fallback={fallback} />;
}
