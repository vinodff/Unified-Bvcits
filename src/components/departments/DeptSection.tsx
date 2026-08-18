import { sectionLabel, type Department } from "@/data/departments";

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl font-extrabold text-navy">{children}</h2>;
}

function List({ items, ordered = false }: { items: string[]; ordered?: boolean }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className={`mt-4 space-y-2 pl-5 text-ink ${ordered ? "list-decimal" : "list-disc"}`}>
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </Tag>
  );
}

export default function DeptSection({ dept, slug }: { dept: Department; slug: string }) {
  switch (slug) {
    case "about":
      return (
        <div>
          <Heading>About the Department</Heading>
          {dept.overview.map((p, i) => (
            <p key={i} className="mt-4 leading-relaxed text-ink">{p}</p>
          ))}
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              ["Level", dept.level],
              ["Established", dept.established],
              ["Sanctioned Intake", dept.intake > 0 ? String(dept.intake) : "—"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-surface-border bg-surface-grey p-5 text-center">
                <div className="text-2xl font-extrabold text-navy">{v}</div>
                <div className="mt-1 text-sm text-ink-muted">{k}</div>
              </div>
            ))}
          </div>
        </div>
      );

    case "vision-mission":
      return (
        <div>
          <Heading>Vision &amp; Mission</Heading>
          <h3 className="mt-6 text-lg font-bold text-navy">Vision</h3>
          <p className="mt-2 rounded-lg border-l-4 border-gold-400 bg-surface-grey p-4 italic text-ink">{dept.vision}</p>
          <h3 className="mt-8 text-lg font-bold text-navy">Mission</h3>
          <List items={dept.mission} />
        </div>
      );

    case "peo-po-pso":
      return (
        <div className="space-y-8">
          <div>
            <Heading>Program Educational Objectives (PEOs)</Heading>
            <List items={dept.peos} ordered />
          </div>
          <div>
            <h2 className="text-2xl font-extrabold text-navy">Program Outcomes (POs)</h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {dept.pos.map((p, i) => (
                <div key={i} className="flex gap-2 rounded-lg border border-surface-border bg-white p-3 text-sm text-ink">
                  <span className="font-bold text-crimson">PO{i + 1}.</span> {p}
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-extrabold text-navy">Program Specific Outcomes (PSOs)</h2>
            <List items={dept.psos} ordered />
          </div>
        </div>
      );

    case "hod":
      return (
        <div>
          <Heading>Head of the Department</Heading>
          <div className="mt-6 flex flex-col gap-5 sm:flex-row">
            <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-navy via-navy-800 to-navy-600 text-3xl font-extrabold text-gold-300">
              {dept.hod.name.split(" ").slice(-1)[0][0]}
            </div>
            <div>
              <h3 className="text-lg font-bold text-navy">{dept.hod.name}</h3>
              <p className="text-sm font-medium text-gold-600">{dept.hod.designation}</p>
              {dept.hod.message.map((m, i) => (
                <p key={i} className="mt-3 text-sm leading-relaxed text-ink">{m}</p>
              ))}
            </div>
          </div>
        </div>
      );

    case "faculty":
      return (
        <div>
          <Heading>Faculty</Heading>
          <p className="mt-2 text-ink-soft">
            {dept.faculty.length} faculty members in the Department of {dept.short}.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {dept.faculty.map((f, i) => (
              <div key={i} className="flex items-center gap-4 rounded-xl border border-surface-border bg-white p-4 shadow-card">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-crimson-50 font-bold text-crimson">
                  {(f.name.replace(/^(Dr|Mr|Ms|Mrs|Prof)\.?\s*/i, "")[0] || "F").toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-navy">{f.name}</p>
                  <p className="text-sm text-ink-muted">{f.designation}</p>
                  {f.qualification && f.qualification !== "—" && (
                    <p className="text-xs text-ink-faint">{f.qualification}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      );

    case "infrastructure":
      return (
        <div>
          <Heading>Infrastructure &amp; Laboratories</Heading>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {dept.labs.map((l, i) => (
              <div key={i} className="rounded-xl border border-surface-border bg-white p-5 shadow-card">
                <h3 className="font-bold text-navy">{l.name}</h3>
                <p className="mt-1 text-sm text-ink-soft">{l.description}</p>
              </div>
            ))}
          </div>
        </div>
      );

    case "placements":
      return (
        <div>
          <Heading>Department Placements</Heading>
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            {dept.placements.map((s) => (
              <div key={s.label} className="rounded-xl border border-surface-border bg-surface-grey p-5 text-center">
                <div className="text-2xl font-extrabold text-navy">{s.value}</div>
                <div className="mt-1 text-xs text-ink-muted">{s.label}</div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-ink">
            The department works closely with the central Training &amp; Placement Cell to prepare students through
            aptitude training, technical certifications and mock interviews.
          </p>
        </div>
      );

    case "gallery":
      return (
        <div>
          <Heading>Gallery</Heading>
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
            {["Labs", "Workshops", "Events", "Projects", "Seminars", "Achievements"].map((g, i) => (
              <div key={g} className={`flex h-32 items-end rounded-xl bg-gradient-to-br ${i % 2 ? "from-crimson to-navy" : "from-navy to-navy-900"} p-3`}>
                <span className="text-sm font-semibold text-white">{g}</span>
              </div>
            ))}
          </div>
        </div>
      );

    case "syllabus":
      return (
        <div>
          <Heading>Course Structure &amp; Syllabus</Heading>
          <p className="mt-2 text-ink-soft">Outcome-based curriculum aligned with the autonomous regulations.</p>
          <ul className="mt-6 space-y-3">
            {["I Year", "II Year", "III Year", "IV Year"].map((y) => (
              <li key={y} className="flex items-center justify-between rounded-lg border border-surface-border bg-white p-4">
                <span className="font-medium text-navy">{dept.short} — {y} Syllabus</span>
                <span className="rounded-md border border-dashed border-surface-border px-3 py-1.5 text-xs text-ink-soft">
                  Not yet published
                </span>
              </li>
            ))}
          </ul>
        </div>
      );

    default:
      return (
        <div>
          <Heading>{sectionLabel(slug)}</Heading>
          <p className="mt-4 leading-relaxed text-ink">
            This section presents the <strong>{sectionLabel(slug).toLowerCase()}</strong> of the Department of {dept.name}.
            It covers the relevant records, activities and outcomes maintained by the department as part of its
            outcome-based education and accreditation processes.
          </p>
          <div className="mt-6 rounded-xl border border-dashed border-surface-border bg-surface-grey p-6 text-sm text-ink-soft">
            Detailed records for this section are maintained by the department office and are being added to this
            portal directly.
          </div>
        </div>
      );
  }
}
