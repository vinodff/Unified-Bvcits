# CLAUDE.md — BVCITS 2.0

> Read [docs/AGENT-RULES.md](docs/AGENT-RULES.md) first, every session. It is the
> project's factual contract (institution data, phasing, IA rules). This file is the
> **operating philosophy** on top of it — how to work, not what the site contains.
> Where the two overlap, AGENT-RULES.md wins.

## Core philosophy

> **Optimize the context window. Persist everything else.**

A session that re-derives decisions from scratch is slower and worse than one that
executes against knowledge already written down. Don't hold reusable knowledge only in
conversation — persist it, then move on. Every session should feel like execution, not
re-research, because the previous session already paid that cost.

## The five persistence layers

When something is worth knowing twice, it goes in one of these — not left to memory:

| Layer | What it holds | Where, in this project |
|---|---|---|
| **Rules** | Standing facts and constraints, always loaded | `docs/AGENT-RULES.md`, this file |
| **Skills** | Reusable multi-step workflows | `~/.claude/skills/` |
| **Agents** | Specialist reviewers for one concern each | `react-reviewer`, `typescript-reviewer`, `a11y-architect`, `security-reviewer` |
| **Hooks** | Automation that runs without being asked | format/lint/type-check on save (see `~/.claude/rules/ecc/web/hooks.md`) |
| **Memory** | Durable facts that aren't derivable from the repo | `~/.claude/.../memory/` — project decisions, open questions, non-obvious gotchas |

If you work out something reusable mid-session (a pattern, a gotcha, a decision and its
reason), write it into the right layer before the session ends. Don't let it evaporate
with the context window.

## Operating principles

1. **Prepare before pressure.** Before building a page or section, check
   `docs/SITEMAP.md`, `ROUTE-INVENTORY.md`, `NAVIGATION.md`, `PAGE-TYPES.md`,
   `COMPONENT-INVENTORY.md`, `DESIGN-SPEC.md`. Don't guess structure that's already
   documented.
2. **Never solve the same problem twice.** A pattern reused more than once (a template,
   a data shape, a deploy step) gets written down in `docs/` — not re-figured-out next
   session.
3. **Research before writing.** Check `src/components/`, `src/data/`, `src/lib/` for an
   existing pattern before adding a new one. The department `[slug]/[section]` template
   and `src/data/departments.ts` are the reference shapes — extend them, don't fork them.
4. **Evidence, not assumption.** A change isn't done because it looks right — it's done
   after `npm run build` succeeds and the actual route renders correctly. Don't claim a
   fix without having run something that could have falsified it.
5. **Specialists over one generalist pass.** Route concerns to the matching reviewer
   agent (React correctness, TypeScript, accessibility, security) rather than one
   pass trying to cover everything at once.
6. **Protect the setup, not just the code.** No secrets/API keys committed. `docs/`,
   rules, and config are load-bearing — don't let an agent silently overwrite another's
   work (see AGENT-RULES.md's agent safety rule).
7. **Master the small toolset this project actually uses** before reaching for
   anything outside it: Next.js App Router, TypeScript, Tailwind, the data-driven
   department template.

## Workflows

**New page/section**
Check `ROUTE-INVENTORY.md` + `PAGE-TYPES.md` → reuse or extend an existing
component/template → implement → `npm run build` → confirm no dead links.

**New/edited department content**
Edit `src/data/departments.ts` only, following the CSE entry's existing shape exactly.
Don't redesign the schema ad hoc — if it needs to change, that's a decision worth a line
in `docs/`, not a silent divergence.

**Bug fix**
Reproduce the exact route/state → find root cause (not just the symptom) → fix →
`npm run build` to confirm no regression across the static pages.

**Before calling anything done**
`npm run build` succeeds · no dead links introduced · matches `docs/` · you can state,
per the AGENT-RULES.md safety rule: what you inspected, what you found, files changed,
files intentionally left alone, and what the next session needs to know.
