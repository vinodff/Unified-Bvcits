"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { deptSidebar, type SidebarNode } from "@/data/departments";
import { ChevronDown } from "@/components/ui/icons";

function hrefFor(deptSlug: string, node: SidebarNode): string {
  if (node.slug === "") return `/departments/${deptSlug}`;
  return `/departments/${deptSlug}/${node.slug}`;
}

export default function DeptSidebar({ deptSlug }: { deptSlug: string }) {
  const pathname = usePathname();
  const base = `/departments/${deptSlug}`;

  const isActive = (node: SidebarNode) =>
    node.slug !== undefined && pathname === hrefFor(deptSlug, node);

  const groupHasActive = (children: SidebarNode[]) =>
    children.some((c) => pathname === hrefFor(deptSlug, c));

  return (
    <nav aria-label="Department sections" className="rounded-xl border border-surface-border bg-white p-2 shadow-card">
      <p className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-gold-500">In this department</p>
      <ul className="space-y-0.5">
        {deptSidebar.map((node) => {
          if (node.children) {
            return <Group key={node.label} node={node} deptSlug={deptSlug} defaultOpen={groupHasActive(node.children)} pathname={pathname} />;
          }
          const active = isActive(node) || (node.slug === "" && pathname === base);
          return (
            <li key={node.label}>
              <Link
                href={hrefFor(deptSlug, node)}
                aria-current={active ? "page" : undefined}
                className={`block rounded-md px-3 py-2 text-sm transition ${
                  active ? "bg-gold font-semibold text-black" : "text-ink-soft hover:bg-gold-50 hover:text-navy"
                }`}
              >
                {node.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Group({
  node,
  deptSlug,
  defaultOpen,
  pathname,
}: {
  node: SidebarNode;
  deptSlug: string;
  defaultOpen: boolean;
  pathname: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <li>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium text-ink hover:bg-surface-grey"
      >
        {node.label}
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="ml-3 border-l border-surface-border pl-2">
          {node.children!.map((c) => {
            const active = pathname === `/departments/${deptSlug}/${c.slug}`;
            return (
              <li key={c.label}>
                <Link
                  href={`/departments/${deptSlug}/${c.slug}`}
                  aria-current={active ? "page" : undefined}
                  className={`block rounded-md px-3 py-1.5 text-sm transition ${
                    active ? "bg-gold font-semibold text-black" : "text-ink-muted hover:bg-gold-50 hover:text-navy"
                  }`}
                >
                  {c.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
