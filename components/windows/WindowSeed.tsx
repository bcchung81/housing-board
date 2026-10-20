'use client';
/* 첫 창(2026-10-19): /projects·/citizen/projects 가 주소의 id·cand 로 서버에서 만든 창 props(lib/board/project-window.ts projectWindow 결과뿐 — RSC 페이로드에 공개되는 값)를
   창 관리자에 넘긴다. 서버 HTML 과 장착 전 첫 그림에는 같은 자리·같은 모양의 창을 여기서 그려(깜박임 없이) 두고, 장착(layout effect)하면 창 관리자가 그 창을 맡는다.
   search = 페이지가 받은 쿼리(장착 전 '같은 단계' 링크가 지금 거르기를 지키게). fromMap = ?from=map 으로 연 첫 창('지도로 돌아가기') */
import { useLayoutEffect, useState } from 'react';
import type { ProjectWindow } from '@/lib/board/project-window';
import FloatingWindow, { DEFAULT_BOX } from './FloatingWindow';
import { windowParts } from './parts';
import { backOf, useWindows } from './WindowHost';

const noop = () => {};

export default function WindowSeed({ win, path, search, fromMap = false }: { win: ProjectWindow | null; path: string; search: string; fromMap?: boolean }) {
  const host = useWindows();
  const [adopted, setAdopted] = useState(false);
  const key = win ? `${win.view}:${win.kind}:${win.asked}` : '';
  useLayoutEffect(() => {
    if (win && host) host.adopt(win, { fromMap });
    setAdopted(true);
  }, [key]);   // 첫 창은 사업이 바뀔 때만 다시 넘긴다(닫은 창을 다시 열지 않게)
  if (!win || adopted || !host) return null;
  const p = windowParts(win, { pathname: path, search }, win.view === 'public' ? win.today ?? '' : '');
  return <FloatingWindow winKey={key} title={p.title} head={p.head} back={backOf(win, fromMap)} box={DEFAULT_BOX} active focusSeq={0} onClose={noop} onRaise={noop}>{p.body}</FloatingWindow>;
}
