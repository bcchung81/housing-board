export default function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="legend" aria-label="범례">
      {items.map((i) => <li key={i.label}><i style={{ background: i.color }} aria-hidden="true" />{i.label}</li>)}
    </ul>
  );
}
