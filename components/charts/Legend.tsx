/* 카드 머리 줄 오른쪽에 놓는 작은 범례 칩(종합상황판 제목 줄 범례와 같은 크기) */
export default function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="m-0 flex list-none flex-wrap items-center gap-x-2.5 gap-y-0.5 p-0 text-[13px] text-muted-foreground" aria-label="범례">
      {items.map((i) => <li key={i.label} className="flex items-center gap-1 whitespace-nowrap"><i className="block size-[9px] flex-none rounded-[2px]" style={{ background: i.color }} aria-hidden="true" />{i.label}</li>)}
    </ul>
  );
}

/* 머리 줄 범례의 '잠정' 칩: 그래프의 잠정치 빗금(MonthLines 의 45° 띠)과 같은 무늬 */
export const ProvKey = () => <span className="flex items-center gap-1 text-[13px] whitespace-nowrap text-muted-foreground" title="빗금은 통계누리 잠정치 구간입니다. 확정치는 2027년 9월 공표 예정"><i className="block size-[9px] flex-none rounded-[2px] border border-line2 [background:repeating-linear-gradient(45deg,color-mix(in_srgb,var(--muted-foreground)_45%,transparent)_0_1.5px,transparent_1.5px_3.5px)]" aria-hidden="true" />잠정</span>;

/* 표 안의 색 견본: 표의 행 이름 앞에 같은 차트의 색을 붙여, 표가 바로 아래 차트의 범례 노릇도 하게 한다 */
export const Swatch = ({ color }: { color: string }) => <i className="mr-1.5 inline-block size-[11px] rounded-[3px] align-[-1px]" style={{ background: color }} aria-hidden="true" />;
