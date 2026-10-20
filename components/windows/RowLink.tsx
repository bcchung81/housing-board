'use client';
/* 목록 행의 사업 링크(일반사용자 사업 찾기 표): 창에 열린 사업이면 aria-current — 행의 선택 표시(has-[a[aria-current]])가 서버가 다시 그리지 않아도 창을 따른다.
   창 관리자 장착 전(서버 HTML·첫 그림)은 서버가 정한 on 그대로. 2026-10-19 */
import type { ComponentProps } from 'react';
import Link from 'next/link';
import { useOpenIds } from './WindowHost';

export default function RowLink({ pid, on, ...props }: ComponentProps<typeof Link> & { pid: string; on: boolean }) {
  const open = useOpenIds();
  return <Link {...props} aria-current={(open ? open.has(pid) : on) ? 'true' : undefined} />;
}
