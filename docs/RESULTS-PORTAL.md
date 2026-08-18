# Results Portal

Bulk semester-results publishing. An admin drops the examination branch's Excel
sheet in; students read their marks with a hall ticket number and a date of
birth. No student account, no signup, no password resets.

- **Admin:** `/admin/results` — requires the `results.publish` capability
- **Student:** `/students/results` — public, no sign-in
- **Migration:** `supabase/migrations/0010_results_portal.sql`

---

## Why this is separate from `semester_results`

There are now two results systems and both should exist. They answer different
questions:

| | `semester_results` (0007) | `result_marks` (0010) |
|---|---|---|
| Keyed by | `profiles.id` — a real auth account | hall ticket number |
| Entered by | faculty, subject by subject | bulk Excel upload |
| Read at | `/dashboard/results` (signed in) | `/students/results` (public) |
| Purpose | the live transcript, feeds CGPA | a published results notification |

Reusing `semester_results` would have meant minting a Supabase auth user for
every one of ~1,200 students in a sheet before a single mark could be stored,
and stranding every row whose hall ticket had no account. The uploaded sheet
only ever contains a hall ticket.

---

## Admin flow

1. Open `/admin/results`.
2. Drag the sheet onto the drop zone (`.xlsx`, `.xls`, `.xlsm`, `.csv`).
3. Optionally fill in title, academic year, semester, exam type, and the
   **fallback date of birth**.
4. **Import as draft.** The file is parsed and stored, but is invisible to
   students.
5. Review the returned numbers and the row-level issue list.
6. **Publish to students** on the batch card.

An upload is *always* a draft. Publishing is a separate, explicit click, so
dropping the wrong file is recoverable rather than an instant notification to
the whole college.

### Batch lifecycle

| Action | Effect |
|---|---|
| Publish | students can look the batch up |
| Unpublish | back to draft, hidden; `published_at` is kept |
| Archive | kept on record, out of lookups — for a superseded notification |
| Delete | cascades to all its marks; blocked while published; requires typing the title back |

Deleting a batch never deletes student identities — a hall ticket's date of
birth belongs to the student, not to one upload, and removing it would break
their access to every *other* batch they appear in.

---

## The spreadsheet

### Columns

Headers are matched case-insensitively with punctuation and spacing ignored, so
`Hall Ticket No`, `HALL_TICKET_NO`, `Roll No` and `Regd. No.` are all the same
column. Annotated headers such as `Internal Marks (30)` also bind.

| Column | Required | Recognised as |
|---|---|---|
| Hall ticket | **yes** | Hall Ticket No, HT No, Roll No, Regd No, Register No, PIN, Student ID |
| Subject code | one of these two | Subject Code, Sub Code, Paper Code, Course Code |
| Subject name | one of these two | Subject Name, Paper Name, Course Title, Subject |
| Branch | no | Branch, Department, Course, Stream |
| Student name | no | Student Name, Name of the Student, Candidate Name |
| Internal marks | no | Internal Marks, Sessionals, CIE, Mid Marks |
| External marks | no | External Marks, Sem End Marks, Theory Marks, SEE |
| Total marks | no | Total Marks, Marks Obtained, Grand Total |
| Grade | no | Grade, Letter Grade |
| Credits | no | Credits, Credit, Cr |
| Result | no | Result, Status, Pass/Fail, Remarks |
| Date of birth | no — but see below | Date of Birth, DOB, Birth Date |

### Behaviour worth knowing

- **Every tab is imported**, not just the first. Exam sections publish one tab
  per branch; importing only one would be a successful-looking upload missing
  most of the college.
- **The header does not have to be row 1.** A college banner and blank lines
  above it are expected and skipped.
- **Row numbers in error messages match what Excel shows you**, so
  `CE!47 — missing hall ticket` points at a row you can actually open.
- **Duplicate `(hall ticket, subject)` lines collapse**, keeping the later one
  and reporting it. Postgres rejects an upsert payload containing the same
  conflict key twice, so this has to happen before the write.
- **An outcome is derived from the grade** when the sheet has no Result column
  (`F` → fail, `AB` → absent, anything else → pass). When both exist, the
  sheet's Result column wins.
- **A total is only computed when both internal and external exist.** Publishing
  an internal-only figure as a "total" would look like a catastrophic external
  mark rather than a missing one.
- **Absent is not zero.** `AB` in a marks cell stores `null`, not `0`, so it does
  not drag averages down.
- **Re-uploading is idempotent per batch** — rows upsert on
  `(batch_id, hall_ticket_no, subject_code)`.

### Date format ambiguity

`03/04/2005` is read as **3 April**, not 4 March. Day-first is the format on
Indian admission records. ISO (`2005-04-03`) is also recognised, as are Excel
serial numbers and real date-formatted cells.

The student-facing form uses a native `<input type="date">`, which always
submits ISO, so this ambiguity exists only on the upload side.

---

## Dates of birth, and what they do and do not protect

Results sheets do not carry a date of birth (the sheet this was built from has
none). Without one, a student the sheet introduces could never sign in at all.
So:

1. If the sheet **has** a DOB column, each student gets their real date
   (`dob_source = 'sheet'`). This always wins — it upgrades a placeholder and
   corrects an earlier typo.
2. If it does not, students **new to the system** get the batch's fallback date
   (`dob_source = 'placeholder'`).
3. A student already on file whose DOB is real is **never** overwritten by a
   fallback.

The admin UI reports how many students are on a placeholder, both after an
upload and on each batch card, because those students are effectively protected
by their hall ticket alone.

> **Get real dates in.** Add a `Date of Birth` column to the sheet, or re-upload
> a sheet that has one — it upgrades existing students in place.

### Security posture

Hall ticket + date of birth is weak authentication: hall tickets are sequential
and a DOB is guessable. It is what was asked for and what JNTUH/JNTUK
themselves use, so the mitigation is containment, not refusal:

- `anon` and `authenticated` have **no grant** on any results table. The lookup
  runs through one route handler on the service-role client that returns one
  student and nothing else — no listing, no pagination, no wildcard, so there is
  nothing to scrape in bulk.
- Only `published` batches resolve. A draft returns "not found".
- One **identical error** for "no such hall ticket", "wrong date of birth" and
  "still in draft", so the endpoint is not an enumeration oracle.
- **Rate limited** per (IP + hall ticket) — the pair, so one NAT'd computer lab
  is not throttled by a few typos while one attacker across many addresses still
  is. Only *failed* lookups count.
- Every failure is written to `result_lookup_attempts` with a salted IP hash.
  Set `RESULTS_LOOKUP_SALT` in production.
- Responses are `Cache-Control: no-store, private`.

> The rate limiter is in-process. On serverless it is per-instance and resets on
> cold start — a speed bump, not a wall. The containment above does not depend
> on it working. To make it a real wall, move the counter to Postgres or Redis;
> the interface in `src/lib/results/rate-limit.ts` would not change.

**Do not put anything in these sheets that should not be readable by someone
who knows a hall ticket number.**

---

## SGPA

Computed from the published letter grade, never recomputed from the marks — the
sheet may reflect moderation, revaluation or a grace mark the raw marks do not
show.

Points: `O`=10, `A+`=9, `A`=8, `B+`=7, `B`=6, `C`=5, `D`/`E`/`P`=4, `F`/`AB`=0.
These match `src/app/dashboard/classes/[slotId]/results/grading.ts` for every
letter both understand.

Two decisions worth knowing:

- **Failed subjects stay in the denominator.** The sheet writes `0.0` credits
  for a failure, so summing that column would drop failures out entirely and
  inflate exactly the SGPAs that most need to be accurate. Each subject's real
  weight is learned at import from the rows that *passed* it and stored on
  `result_batches.subject_credits`.
- **An unrecognised grade suppresses the SGPA** rather than counting as zero. A
  student comparing this against their marks memo must not find a third number
  that neither source agrees with.

---

## Testing it

```bash
node scripts/make-sample-results.mjs
```

Writes two synthetic files to `./tmp/` and prints working credentials:

- `sample-results.xlsx` — the exact layout from the requirement (no DOB column),
  so every student lands on the batch fallback date.
- `sample-results-with-dob.xlsx` — two branch tabs plus a real DOB per student,
  which is the shape you want in production.

Then: upload at `/admin/results` → **publish the batch** → look it up at
`/students/results`. A draft deliberately returns "not found".

Unit and integration tests:

```bash
npx vitest run src/lib/results
```

`parse.test.ts` covers the rules against the real sheet's column layout;
`workbook.test.ts` round-trips actual `.xlsx` and `.csv` bytes through SheetJS,
which is what catches breakage on a spreadsheet-library upgrade.

---

## Schema

| Table | Holds |
|---|---|
| `result_batches` | one row per upload; the publish unit |
| `result_students` | hall ticket → date of birth; the credential store |
| `result_marks` | one row per subject line of the sheet |
| `result_lookup_attempts` | failed lookups, for abuse review |
| `results_batch_overview` | staff-only aggregate view (service-role only) |

Reads for staff go through RLS (`is_staff_level()`); **every write goes through
the service-role client** in a route handler or server action. `authenticated`
has a `select` grant only, so a bug in a future client component cannot mutate
published results from a browser.

---

## Code map

| File | Responsibility |
|---|---|
| `src/lib/results/types.ts` | shared shapes, no I/O deps |
| `src/lib/results/columns.ts` | header matching, cell coercion, date parsing — pure |
| `src/lib/results/parse.ts` | matrix → rows, header detection, dedupe — pure |
| `src/lib/results/workbook.ts` | the only file that imports `xlsx` |
| `src/lib/results/grading.ts` | grade → point, SGPA |
| `src/lib/results/import.ts` | chunked writes, DOB resolution (server-only) |
| `src/lib/results/lookup.ts` | the student read path (server-only) |
| `src/lib/results/rate-limit.ts` | abuse control, IP hashing (server-only) |

The parsing rules are deliberately free of `xlsx` and Supabase imports so the
awkward half of this feature is testable with plain arrays.
