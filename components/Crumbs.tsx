/* 빵부스러기: 파생 상세에서 위로 한 번에 올라온다. 마지막 항목이 지금 화면. */
import Link from 'next/link';

export type Crumb = { label: string; href?: string };

export default function Crumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="현재 위치">
      <ol className="crumbs">
        {items.map((c, i) => (
          <li key={i}>{c.href ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}</li>
        ))}
      </ol>
    </nav>
  );
}
