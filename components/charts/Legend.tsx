export default function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-[14px] gap-y-1.5 p-0 text-[12.5px] text-foreground" aria-label="범례">
      {items.map((i) => <li key={i.label} className="flex items-center gap-1.5"><i className="block size-[11px] rounded-[3px]" style={{ background: i.color }} aria-hidden="true" />{i.label}</li>)}
    </ul>
  );
}
