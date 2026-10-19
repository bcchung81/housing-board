/* 데이터 원본 ① 요구사항 충족: F-01~F-12 마다 우선순위·관련 지시·판정(충족·부분·없음)·근거 지표·답하는 화면. 값은 data/board/requirements.json(tools/ledger/requirements.js).
   다른 화면의 요구사항 꼬리표(/sources#F-02)가 이 표의 그 행으로 온다 — 행에 id 를 두고, 주소의 #F-xx 와 같은 행은 :target 테두리로 강조한다(스크립트 없음).
   휴대폰 폭(900px 이하 mobile:)에서는 같은 마크업을 세로 목록으로 바꾼다 — 행마다 이름 줄 아래 '이름 값' 쌍(머리 행은 감추고 칸마다 이름표를 보인다). 코드·숫자+단위는 줄바꿈하지 않는다.
   행에 앵커가 필요해 데이터 그리드 대신 같은 모양의 표 부품(components/ui/table)으로 그린다(12행 고정이라 검색·정렬 없음). */
import { Fragment, type CSSProperties } from 'react';
import Link from 'next/link';
import { PanelHead } from '@/components/page';
import { Card } from '@/components/ui/card';
import InfoTip from '@/components/ui/info-tip';
import ScopeChip from '@/components/ui/scope-chip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { HATCH } from '@/components/ui/chips';
import { VERDICT, countVerdicts, datesOf, directiveText, type RequirementsDoc, type Verdict } from '@/lib/board/requirements';

const ZEBRA = 'bg-[color-mix(in_srgb,var(--pn2)_45%,var(--card))]';
const SW: Record<Verdict, { cls: string; style?: CSSProperties }> = {
  met: { cls: 'bg-primary' },
  part: { cls: '', style: { background: 'color-mix(in srgb,var(--primary) 30%,var(--card))' } },
  none: { cls: `border border-line2 ${HATCH}` },
};
/* 휴대폰 폭 목록: 행은 두 열 격자(이름표 | 값), 이름 칸은 두 열을 다 쓰고, 나머지 칸은 contents 라 이름표와 값이 격자 칸이 된다 */
const ROW_M = 'mobile:grid mobile:grid-cols-[max-content_minmax(0,1fr)] mobile:items-baseline mobile:gap-x-4 mobile:gap-y-1 mobile:border-b mobile:border-border mobile:px-tile-x mobile:py-tile-y';
const NAME_M = 'mobile:col-span-2 mobile:border-0 mobile:p-0';
const CELL_M = 'mobile:contents mobile:whitespace-normal';
const Lab = ({ children }: { children: string }) => <span className="hidden text-muted-foreground mobile:inline">{children}</span>;
const Mark = ({ v }: { v: Verdict }) => (
  <span className={`inline-flex items-center gap-1.5 font-bold ${v === 'none' ? 'text-muted-foreground' : ''}`}>
    <i className={`block size-[10px] flex-none rounded-chip ${SW[v].cls}`} style={SW[v].style} aria-hidden="true" />{VERDICT[v].name}
  </span>
);

export default function Requirements({ doc }: { doc: RequirementsDoc }) {
  const n = countVerdicts(doc);
  /* 범위 칩 title: 근거 지표의 모수(requirements.json measures — 타입은 lib/board/requirements.ts 밖이라 여기서 좁힌다) */
  const m = (doc as RequirementsDoc & { measures?: { base: number; ledgerProjects: number } }).measures;
  return (
    <Card render={<section aria-label="요구사항 충족" />}>
      <PanelHead title="요구사항 충족"
        scope={<ScopeChip scope="수도권" source="정책 진행 자료" title={`판정 근거 지표는 정책 진행 자료(HOME)의 수도권 사업${m ? ` ${m.base}건` : ''} 기준(정책·프로그램 연결이 수도권 사업뿐) · 원장 사업 수(F-01)도 수도권${m ? ` ${m.ledgerProjects.toLocaleString('en-US')}건` : ''}`} />}
        tip="기능 요구 12가지(F-01~F-12) · 판정은 실제 자료로 센 근거 지표와 규칙(tools/ledger/requirements.js)으로 냄 — 충족·부분·없음 · 근거 지표에 마우스를 올리면 계산과 규칙 · 다른 화면의 요구사항 꼬리표를 누르면 이 표의 그 행">
        <span className="text-sm text-muted-foreground tabular-nums">충족 <b className="text-foreground">{n.met}</b> · 부분 <b className="text-foreground">{n.part}</b> · 없음 <b className="text-foreground">{n.none}</b></span>
        <InfoTip label="요구사항 충족 읽는 법">
          <dl>
            <dt>판정</dt><dd>충족 · 부분 · 없음 — 실제 자료로 센 근거 지표와 정해 둔 규칙으로 냄(근거 지표에 마우스를 올리면 계산)</dd>
            <dt>지시</dt><dd>이 요구사항과 관련된 지시 날짜(월.일)</dd>
            <dt>화면</dt><dd>이 요구사항에 답하는 화면 · 다른 화면의 요구사항 꼬리표를 누르면 이 표의 그 행으로 옴</dd>
          </dl>
        </InfoTip>
      </PanelHead>
      <Table aria-label="요구사항 충족" className="mobile:block">
        <TableHeader className="mobile:hidden">
          <tr>
            {['요구사항', '우선순위', '지시', '판정', '근거 지표', '화면'].map((h) => <TableHead key={h} className="z-[2] text-left">{h}</TableHead>)}
          </tr>
        </TableHeader>
        <TableBody className="mobile:block">
          {doc.items.map((r, i) => (
            <TableRow key={r.id} id={r.id} className={`scroll-mt-24 target:outline-2 target:-outline-offset-2 target:outline-primary ${i % 2 ? ZEBRA : 'bg-card'} ${ROW_M}`}>
              <TableCell className={`text-left whitespace-normal [word-break:keep-all] ${NAME_M}`}><span title={`${r.id} · ${r.criterion}\n- ${r.items.join('\n- ')}`}><b>{r.title}</b> <span className="whitespace-nowrap text-sm text-muted-foreground tabular-nums">{r.id}</span></span></TableCell>
              <TableCell className={`text-left ${CELL_M} ${r.priority === '필수' ? 'font-bold' : 'text-muted-foreground'}`}><Lab>우선순위</Lab><span>{r.priority}</span></TableCell>
              <TableCell className={`text-left ${CELL_M}`}>
                <Lab>지시</Lab>
                <span>{datesOf(r).map((d, j) => <span key={d} className="whitespace-nowrap">{j ? ' · ' : ''}<span className="tabular-nums" title={directiveText(doc, d)}>{d}</span></span>)}</span>
              </TableCell>
              <TableCell className={`text-left ${CELL_M}`}><Lab>판정</Lab><Mark v={r.verdict} /></TableCell>
              <TableCell className={`text-left ${CELL_M}`}><Lab>근거 지표</Lab><span className="tabular-nums" title={r.tip}>{r.metric.split(' · ').map((t, k) => <Fragment key={k}>{k ? ' · ' : ''}<span className="whitespace-nowrap">{t}</span></Fragment>)}</span></TableCell>
              <TableCell className={`text-left ${CELL_M}`}>
                <Lab>화면</Lab>
                <span>{r.screens.length ? r.screens.map((s, j) => <span key={s} className="whitespace-nowrap">{j ? ' · ' : ''}<Link href={doc.screens[s].href} className="text-sm">{doc.screens[s].name}</Link></span>)
                  : <span className="text-muted-foreground" title="답하는 화면 없음">–</span>}</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
