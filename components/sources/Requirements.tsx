/* 데이터 원본 ① 요구사항 충족: F-01~F-12 마다 우선순위·관련 지시·판정(충족·부분·없음)·근거 지표·답하는 화면. 값은 data/board/requirements.json(tools/ledger/requirements.js).
   다른 화면의 요구사항 꼬리표(/sources#F-02)가 이 표의 그 행으로 온다 — 행에 id 를 두고, 주소의 #F-xx 와 같은 행은 :target 테두리로 강조한다(스크립트 없음).
   행에 앵커가 필요해 데이터 그리드 대신 같은 모양의 표 부품(components/ui/table)으로 그린다(12행 고정이라 검색·정렬 없음). */
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { PanelHead } from '../page';
import { Card } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { HATCH } from '../ui/chips';
import { VERDICT, countVerdicts, datesOf, directiveText, type RequirementsDoc, type Verdict } from '../../lib/board/requirements';

const ZEBRA = 'bg-[color-mix(in_srgb,var(--pn2)_45%,var(--card))]';
const SW: Record<Verdict, { cls: string; style?: CSSProperties }> = {
  met: { cls: 'bg-primary' },
  part: { cls: '', style: { background: 'color-mix(in srgb,var(--primary) 30%,var(--card))' } },
  none: { cls: `border border-line2 ${HATCH}` },
};
const Mark = ({ v }: { v: Verdict }) => (
  <span className={`inline-flex items-center gap-1.5 font-bold ${v === 'none' ? 'text-muted-foreground' : ''}`}>
    <i className={`block size-[10px] flex-none rounded-[3px] ${SW[v].cls}`} style={SW[v].style} aria-hidden="true" />{VERDICT[v].name}
  </span>
);

export default function Requirements({ doc }: { doc: RequirementsDoc }) {
  const n = countVerdicts(doc);
  return (
    <Card render={<section aria-label="요구사항 충족" />}>
      <PanelHead title="요구사항 충족" tip="HOME 기능 요구 12가지 · 판정은 실제 자료로 센 근거 지표와 규칙(tools/ledger/requirements.js)으로 냄 — 충족·부분·없음 · 근거 지표에 마우스를 올리면 계산과 규칙 · 다른 화면의 요구사항 꼬리표를 누르면 이 표의 그 행">
        <span className="text-[14px] text-muted-foreground tabular-nums">충족 <b className="text-foreground">{n.met}</b> · 부분 <b className="text-foreground">{n.part}</b> · 없음 <b className="text-foreground">{n.none}</b></span>
      </PanelHead>
      <Table aria-label="요구사항 충족">
        <TableHeader>
          <tr>
            {['요구사항', '우선순위', '지시', '판정', '근거 지표', '화면'].map((h) => <TableHead key={h} className="z-[2] text-left">{h}</TableHead>)}
          </tr>
        </TableHeader>
        <TableBody>
          {doc.items.map((r, i) => (
            <TableRow key={r.id} id={r.id} className={`scroll-mt-24 target:outline-2 target:-outline-offset-2 target:outline-primary ${i % 2 ? ZEBRA : 'bg-card'}`}>
              <TableCell className="text-left whitespace-normal"><span title={`${r.id} · ${r.criterion}\n- ${r.items.join('\n- ')}`}><b>{r.title}</b> <span className="text-[13px] text-muted-foreground tabular-nums">{r.id}</span></span></TableCell>
              <TableCell className={`text-left ${r.priority === '필수' ? 'font-bold' : 'text-muted-foreground'}`}>{r.priority}</TableCell>
              <TableCell className="text-left">
                {datesOf(r).map((d, j) => <span key={d}>{j ? ' · ' : ''}<span className="tabular-nums" title={directiveText(doc, d)}>{d}</span></span>)}
              </TableCell>
              <TableCell className="text-left"><Mark v={r.verdict} /></TableCell>
              <TableCell className="text-left"><span className="tabular-nums" title={r.tip}>{r.metric}</span></TableCell>
              <TableCell className="text-left">
                {r.screens.length ? r.screens.map((s, j) => <span key={s}>{j ? ' · ' : ''}<Link href={doc.screens[s].href} className="text-[14px]">{doc.screens[s].name}</Link></span>)
                  : <span className="text-muted-foreground" title="답하는 화면 없음">–</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
