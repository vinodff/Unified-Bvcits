import Link from "next/link";

export type Crumb = { label: string; href?: string };

export default function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-white/80">
        <li>
          <Link href="/" className="hover:text-white">Home</Link>
        </li>
        {items.map((c, i) => (
          <li key={i} className="flex items-center gap-2">
            <span aria-hidden className="text-white/40">/</span>
            {c.href && i < items.length - 1 ? (
              <Link href={c.href} className="hover:text-white">{c.label}</Link>
            ) : (
              <span className="font-medium text-white" aria-current="page">{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
