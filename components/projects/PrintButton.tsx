'use client';
/* 인쇄 미리보기(/projects?print=1)의 '인쇄' 단추: 브라우저 인쇄 창을 연다(화면은 이미 @media print 와 같은 보고 보기) */
import { Printer } from 'lucide-react';

export default function PrintButton({ className }: { className: string }) {
  return <button type="button" onClick={() => window.print()} className={className}><Printer className="size-4 flex-none text-muted-foreground" aria-hidden="true" />인쇄</button>;
}
