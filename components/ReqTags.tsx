/* 요구사항 칩: 화면 머리 줄 오른쪽의 '요구사항 n' 칩 하나. 누르면 그 화면이 답하는 요구사항(data/board/requirements.json)이 펼쳐지고,
   항목을 누르면 데이터 원본의 요구사항 충족 표 그 행(/sources#F-xx)으로 간다. 요구사항 번호(F-xx)는 펼친 목록 안에서만 작게 보인다(화면에 코드를 늘어놓지 않는다).
   쓰는 법: <ReqTags screen="projects" /> — 기본은 머리 줄 오른쪽 끝으로 미는 ml-auto(className 으로 바꾼다). ids 를 주면 그 요구사항만(사업 상세 서랍).
   링크는 <Link> 가 아니라 <a>: 클라이언트 이동(pushState)은 CSS :target 을 바꾸지 않아 데이터 원본의 그 행이 강조되지 않는다. 서버 컴포넌트(<details> — 스크립트 없음). */
import { ChevronDown } from 'lucide-react';
import { cn } from 'cn';
import requirementsJson from '@/data/board/requirements.json';
import { VERDICT, reqsFor, tagTitle, type RequirementsDoc, type Screen } from '@/lib/board/requirements';

const doc = requirementsJson as RequirementsDoc;
const CHIP = 'flex h-6.5 cursor-pointer list-none items-center gap-1 rounded-chip border border-line2 px-2 text-sm font-bold whitespace-nowrap text-muted-foreground tabular-nums hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden';

export default function ReqTags({ screen, ids, className }: { screen: Screen; ids?: string[]; className?: string }) {
  const list = reqsFor(doc, screen).filter((r) => !ids || ids.includes(r.id));
  if (!list.length) return null;
  return (
    <details className={cn('group relative ml-auto self-center', className)} aria-label="이 화면이 답하는 요구사항">
      <summary className={CHIP} title="이 화면이 답하는 요구사항 — 누르면 목록, 항목을 누르면 데이터 원본의 판정">
        요구사항 {list.length}<ChevronDown className="size-3.5 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <ul className="absolute top-full right-0 z-30 m-0 mt-1 flex max-h-[60vh] min-w-[300px] list-none flex-col gap-0.5 overflow-y-auto rounded-tile border border-border bg-popover p-1 text-popover-foreground shadow-pop">
        {list.map((r) => (
          <li key={r.id}>
            <a href={`/sources#${r.id}`} title={tagTitle(doc, r)} className="flex items-baseline gap-2 rounded-chip px-3 py-1.5 text-sm whitespace-nowrap text-foreground no-underline hover:bg-pn2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">
              <span className="min-w-0 flex-1">{r.title}</span>
              <span className="text-sm text-muted-foreground">{VERDICT[r.verdict].name}</span>
              <span className="text-sm text-muted-foreground tabular-nums">{r.id}</span>
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
