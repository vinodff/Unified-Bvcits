"use client";

import type { ResumeSections } from "@/lib/resume";

/**
 * A print-quality resume document.
 *
 * Typeset to real page rules rather than "a card with some text in it": A4
 * width, a serif face at 10pt with tight leading, rule-underlined section
 * headings, and right-aligned dates on the same baseline as the entry they
 * belong to. Those alignment details are what separate a document a student
 * can send to an employer from one that looks generated.
 *
 * Deliberately light-on-white even though the surrounding page is dark — it
 * is a preview of a printed page, and rendering it in the app's theme would
 * misrepresent what gets sent. `print:` variants strip the on-screen scaling
 * so the same component is what the browser's Save-as-PDF produces.
 */
export function ResumeDocument({ sections, scale = 1 }: { sections: ResumeSections; scale?: number }) {
  const { contact, summary, education, experience, projects, skills, certifications } = sections;

  return (
    <div
      className="resume-doc mx-auto bg-white text-[#111]"
      style={{
        width: "210mm",
        minHeight: "297mm",
        padding: "14mm 15mm",
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: "10pt",
        lineHeight: 1.42,
        transform: scale === 1 ? undefined : `scale(${scale})`,
        transformOrigin: "top center",
      }}
    >
      {/* ---- Letterhead ---- */}
      <header className="text-center">
        <h1
          className="uppercase"
          style={{ fontSize: "19pt", fontWeight: 700, letterSpacing: "0.06em", lineHeight: 1.15, margin: 0 }}
        >
          {contact.fullName || "Your Name"}
        </h1>
        {(contact.phone || contact.email || contact.location) && (
          <p style={{ fontSize: "9pt", color: "#333", marginTop: "3mm" }}>
            {[contact.phone, contact.email, contact.location].filter(Boolean).join("  •  ")}
          </p>
        )}
      </header>

      <hr style={{ border: 0, borderTop: "1.2pt solid #111", margin: "4mm 0 0" }} />

      {summary && (
        <Block title="Professional Summary">
          <p style={{ textAlign: "justify", margin: 0 }}>{summary}</p>
        </Block>
      )}

      {skills.length > 0 && (
        <Block title="Technical Skills">
          <p style={{ margin: 0 }}>
            {skills.map((s, i) => (
              <span key={s}>
                <span style={{ textTransform: "capitalize" }}>{s}</span>
                {i < skills.length - 1 && <span style={{ color: "#888" }}> · </span>}
              </span>
            ))}
          </p>
        </Block>
      )}

      {experience.length > 0 && (
        <Block title="Experience">
          {experience.map((entry, i) => (
            <Entry
              key={i}
              primary={entry.organization}
              secondary={entry.role}
              meta={entry.years}
              bullets={entry.bullets}
              last={i === experience.length - 1}
            />
          ))}
        </Block>
      )}

      {projects.length > 0 && (
        <Block title="Projects">
          {projects.map((entry, i) => (
            <Entry
              key={i}
              primary={entry.name}
              secondary={entry.stack}
              meta=""
              bullets={entry.bullets}
              last={i === projects.length - 1}
            />
          ))}
        </Block>
      )}

      {education.length > 0 && (
        <Block title="Education">
          {education.map((entry, i) => (
            <Entry
              key={i}
              primary={entry.institution}
              secondary={entry.degree}
              meta={entry.years}
              bullets={entry.detail ? [entry.detail] : []}
              last={i === education.length - 1}
            />
          ))}
        </Block>
      )}

      {certifications.length > 0 && (
        <Block title="Certifications & Achievements">
          <ul style={{ margin: 0, paddingLeft: "5mm" }}>
            {certifications.map((entry, i) => (
              <li key={i} style={{ marginBottom: "1mm" }}>
                <span style={{ fontWeight: 600 }}>{entry.name}</span>
                {entry.issuer && <span style={{ color: "#333" }}> — {entry.issuer}</span>}
                {entry.year && <span style={{ color: "#555" }}> ({entry.year})</span>}
              </li>
            ))}
          </ul>
        </Block>
      )}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: "5mm", breakInside: "avoid" }}>
      <h2
        className="uppercase"
        style={{
          fontSize: "10pt",
          fontWeight: 700,
          letterSpacing: "0.11em",
          borderBottom: "0.6pt solid #999",
          paddingBottom: "1mm",
          marginBottom: "2.5mm",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * One entry. The header row is a flex baseline so the date sits flush right on
 * the same line as the title — the alignment detail that most distinguishes a
 * typeset resume from a stack of paragraphs.
 */
function Entry({
  primary,
  secondary,
  meta,
  bullets,
  last,
}: {
  primary: string;
  secondary: string;
  meta: string;
  bullets: string[];
  last: boolean;
}) {
  return (
    <div style={{ marginBottom: last ? 0 : "3.5mm", breakInside: "avoid" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "6mm" }}>
        <p style={{ margin: 0, fontWeight: 700 }}>
          {primary}
          {secondary && <span style={{ fontWeight: 400, fontStyle: "italic", color: "#222" }}> — {secondary}</span>}
        </p>
        {meta && <span style={{ flexShrink: 0, fontSize: "9pt", color: "#555", whiteSpace: "nowrap" }}>{meta}</span>}
      </div>
      {bullets.length > 0 && (
        <ul style={{ margin: "1.5mm 0 0", paddingLeft: "5mm" }}>
          {bullets.map((b, i) => (
            <li key={i} style={{ marginBottom: "0.8mm", textAlign: "justify" }}>
              {b}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
