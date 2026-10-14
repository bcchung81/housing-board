/* 요구사항 꼬리표: 화면 머리 줄 오른쪽의 작은 칩. 그 화면이 답하는 요구사항(F-xx)을 data/board/requirements.json 에서 골라 보이고,
   누르면 데이터 원본의 요구사항 충족 격자 그 행(/sources#F-xx)으로 간다. 이름·지시 날짜·판정은 title 에. 서버 컴포넌트.
   쓰는 법: <ReqTags screen="projects" /> — 기본은 머리 줄 오른쪽 끝으로 미는 ml-auto(className 으로 바꾼다). */
import Link from 'next/link';
import { cn } from 'cn';
import requirementsJson from '../data/board/requirements.json';
import { reqsFor, tagTitle, type RequirementsDoc, type Screen } from '../lib/board/requirements';

const doc = requirementsJson as RequirementsDoc;
const TAG = 'inline-block rounded-[6px] border border-line2 px-1.5 text-[12px] leading-[20px] font-bold whitespace-nowrap text-muted-foreground no-underline tabular-nums hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export default function ReqTags({ screen, className }: { screen: Screen; className?: string }) {
  const list = reqsFor(doc, screen);
  if (!list.length) return null;
  return (
    <span className={cn('ml-auto flex flex-wrap items-center gap-1 self-center', className)} aria-label="이 화면이 답하는 요구사항">
      {list.map((r) => <Link key={r.id} href={`/sources#${r.id}`} title={tagTitle(doc, r)} className={TAG}>{r.id}</Link>)}
    </span>
  );
}
