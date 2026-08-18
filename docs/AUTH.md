# Authentication & Roles

> Schema: [`supabase/migrations/0004_auth_roles.sql`](../supabase/migrations/0004_auth_roles.sql)
> · Database layer: [SUPABASE.md](SUPABASE.md) · IA: [IA-STAKEHOLDER-NAV.md](IA-STAKEHOLDER-NAV.md)

**Status: `0004` applied and verified live.** The whole flow was exercised end
to end against the remote project — signup, sign-in, role gating, announcements,
and every escalation attempt.

⚠ **`0005_announcement_oversight.sql` is written and locally verified but NOT
yet applied.** Until it is, management and admin cannot see notices targeted at
students or parents — see [Announcement oversight](#announcement-oversight).

One setup step remains: [create the first admin](#going-live).

## The eight roles

They mirror the seven stakeholder portals plus `admin`, so a signed-in user's
role maps onto the portal they already navigate to. No second taxonomy.

| Role | Portal | Beyond reading announcements |
|---|---|---|
| `student` | `/students` | — |
| `parent` | `/parents` | — |
| `recruiter` | `/recruiters` | — |
| `trainer` | `/trainers` | — |
| `regulatory` | `/regulatory` | — |
| `faculty` | `/staff` | Post announcements |
| `management` | `/management` | + enquiry inbox, assistant insights |
| `admin` | `/management` | + Marketing Studio, user management |

`USER_ROLES` in [`src/lib/auth/roles.ts`](../src/lib/auth/roles.ts) is the
runtime source of truth with the TypeScript union derived from it — the same
pattern as `CAMPAIGN_TYPES`. A test asserts it matches the Postgres enum exactly,
so the two cannot drift silently.

## Capabilities, not role checks

Authorization is a matrix (`CAPABILITY_MATRIX`), queried with
`can(role, capability)`. The dashboard nav, the page guards and the server
actions all ask the same question the same way, instead of scattering
`role === "admin"` around the codebase.

`CAPABILITIES` in `src/lib/auth/roles.ts` is the source of truth — it has grown
past the original six as features landed (exams, academics, opportunities,
results), so read the array rather than trusting a list copied here.

Two worth calling out because they look similar and are not:

- `academics.record` — faculty enter marks and attendance for the classes the
  timetable assigns them. Scoped per (subject, class) by `teaches_student()`.
- `results.publish` — bulk-publish a whole examination notification from a
  spreadsheet. Admin and management only; deliberately **not** faculty, because
  one upload publishes marks for every branch at once. See
  [RESULTS-PORTAL.md](RESULTS-PORTAL.md).

## Security model

**Self-signup can never grant privilege.** Three independent layers:

1. `handle_new_user()` hardcodes the new profile to `student`. It reads
   `full_name` and `phone` from signup metadata but **never `role`** — that
   object is fully client-controlled, so honouring it would let anyone register
   as an admin.
2. `guard_profile_privilege_change()` rejects any self-service change to `role`
   or `is_active`. This matters because users *can* update their own profile
   row; without the trigger, `update profiles set role='admin' where
   id=auth.uid()` would succeed.
3. The signup form simply never sends a role.

**Other deliberate choices:**

- `getUser()`, never `getSession()`. `getSession` reads the cookie without
  verifying it, so a forged cookie would be trusted. `getUser` revalidates
  against the auth server.
- **The role comes from `profiles`, never from the JWT.** A token issued at
  sign-in would keep asserting a stale role after an admin revoked it.
- Deactivation is checked on every request, so `is_active = false` locks someone
  out immediately rather than when their token happens to expire.
- `next=` redirects after login are restricted to relative paths, so a phishing
  link cannot bounce a freshly authenticated user off-site.

### Where the capability gate lives, and why

Middleware answers *"signed in?"* **and** *"allowed?"*, using
`ROUTE_CAPABILITIES` in [`route-guards.ts`](../src/lib/auth/route-guards.ts),
which is derived from the same matrix the pages use.

The role check started out page-only. That was wrong, and testing caught it: the
dashboard layout's shell begins streaming before the page component runs, so the
HTTP status is already committed as `200` by the time a page-level `notFound()`
throws. A denied route returned **200 with a not-found body** — no data leaked,
but a dishonest status that would fool monitoring and crawlers. Deciding in
middleware, before anything renders, gives a real `307` to
`/dashboard?denied=1`, and the user is told which role they're signed in as.

The cost is one profile lookup, paid only on `/dashboard` and `/admin` — the
matcher deliberately excludes the 269 public pages, so anonymous visitors never
trigger an auth round trip.

Page-level `can()` checks remain as defence in depth: they are what guard the
**service-role** reads on `/dashboard/enquiries`, `/dashboard/insights` and
`/dashboard/users`, which bypass RLS entirely.

### What RLS actually enforces

`admission_enquiries` and the marketing tables have RLS **with no policies** —
unreachable with a user session by design. `/dashboard/enquiries` reads them
with the service client, which means its `can(...)` check *is* the authorization
boundary, not a convenience. The same is true of `/dashboard/users`.

`profiles` and `announcements` are different: they carry real policies, so the
page queries carry no role filter at all and the database decides which rows
exist for that user. A student and a parent run the identical statement and get
different rows.

> `profiles` deliberately does **not** `force row level security`. Forcing it
> would subject the table owner to the policies, and `current_user_role()` —
> which the policies call — would recurse into its own policy forever.

## Verification

**Against the live project**, using real accounts and real JWTs:

| Attempt | Result |
|---|---|
| Sign up with `"role":"admin"` in user metadata | Ignored → `role: "student"` |
| Student `PATCH profiles {role: admin}` | `403` · *Only an administrator can change an account role.* |
| Student `PATCH profiles {is_active: false}` | `403` · *Only an administrator can activate or deactivate an account.* |
| Student `POST announcements` | `403` · RLS violation |
| Faculty forging `author_id` as another user | `403` · RLS violation |
| Student calling `set_user_role` | `403` · permission denied for function |
| Parent editing a faculty member's announcement | 0 rows changed |
| `anon` reading `profiles` / `announcements` | `401` |
| Student listing profiles | Only their own row |
| Parent's announcement feed | 2 published + entitled, draft excluded |
| Student editing their own name | `204` — legitimate edits still work |

Route gating, production server:

| Route | Faculty | Parent | Anonymous |
|---|---|---|---|
| `/dashboard`, `/dashboard/announcements` | 200 | 200 | 307 → `/login` |
| `/dashboard/users`, `/admin/marketing-studio` | 307 → denied | 307 → denied | 307 → `/login` |
| `/dashboard/enquiries`, `/dashboard/insights` | 307 → denied | 307 → denied | 307 → `/login` |
| `/admin/results` | 307 → denied | 307 → denied | 307 → `/login` |
| `/students` (public) | 200 | 200 | 200 |
| `/students/results` (public lookup) | 200 | 200 | 200 |

`/admin/results` is gated on `results.publish`, not `marketing.studio` — the
longest-prefix rule in `requiredCapability()` is what makes the more specific
`/admin/results` entry win over the broader `/admin` one.

An admin reaches all seven dashboard routes and sees the full user directory.

Also verified locally against Postgres 17 with a stubbed `auth` schema: 30
assertions covering deactivated accounts losing their role and feed, cascade
deletion of profiles, and expiry (retroactive expiry is rejected — takedown is
`published = false`).

14 unit tests cover the capability matrix, including that admin is a strict
superset of every other role and that no self-signup role holds a privileged
capability. **169 tests pass overall.**

## Announcement oversight

`0004`'s `can_read_announcement()` let staff bypass **department** scoping but
still applied **audience** scoping to them. Testing the demo accounts exposed
the consequence: the admin saw 1 of 3 announcements, because it was not in the
`student` or `parent` audience and had not authored them. Faculty appeared fine
only because authors see their own posts via `announcements_select_own`.

The people responsible for the platform were the only ones unable to audit what
had been published on it. [`0005_announcement_oversight.sql`](../supabase/migrations/0005_announcement_oversight.sql)
lets `is_staff_level()` bypass both filters.

Verified locally: admin then sees all 3 published notices and still no drafts,
while a CSE student remains department-scoped and the parent feed is unchanged.
**Apply it in the SQL editor.**

## Demo accounts

For showing the role model without provisioning people by hand.

```bash
npm run seed:demo          # create/reset the four accounts + 3 announcements
npm run seed:demo:remove   # delete them again
```

| Account | Role | Unlocks |
|---|---|---|
| `demo.student@example.com` | student | Student announcements, own profile |
| `demo.parent@example.com` | parent | Parent announcements |
| `demo.faculty@example.com` | faculty | + Post announcements |
| `demo.admin@example.com` | admin | + Enquiries, insights, users, Marketing Studio |

Password for all four: `BvcitsDemo#2026`

They appear on `/login` as one-click buttons **only** when
`NEXT_PUBLIC_DEMO_LOGINS=1`. The flag defaults off and is compared against the
literal `"1"`, so any other value keeps it hidden. When off, the panel is absent
from the markup entirely rather than hidden with CSS.

> **These are real accounts with real privileges.** The demo administrator can
> manage every user and open the Marketing Studio. Turn the flag off — and run
> `npm run seed:demo:remove` — before any deployment holding real data.

Verified: signing in as each role yields different dashboards and different
announcement feeds, and the three non-admin roles are bounced from
`/dashboard/users`, `/dashboard/enquiries` and `/admin/marketing-studio`.

## Going live

**1. ~~Apply the migration~~** — done. `0004` is live.

**2. Create the first admin.** Roles are assigned from `/dashboard/users`, which
requires an admin — so the first one cannot be made through the UI. Sign up
normally at `/signup`, then:

```bash
npm run grant-role -- you@bvcits.edu.in admin
```

**3. Check email confirmation.** `mailer_autoconfirm` is currently **off**, so
new accounts must click a confirmation link before signing in. For a demo, turn
it on under Authentication → Providers → Email.

### Heads-up: the Marketing Studio is now admin-only

It previously ran in DEV MODE with auth disabled whenever `ADMIN_PIN` was unset
— meaning anyone could open it. `src/app/admin/layout.tsx` now requires the
`marketing.studio` capability. **After applying `0004` you must grant yourself
`admin` (step 2) or you will lock yourself out of the studio.**

When Supabase is not configured at all, the layout steps aside and the old
`ADMIN_PIN` behaviour applies.

## Files

```
supabase/migrations/0004_auth_roles.sql   schema, RLS, triggers, guards
src/lib/auth/roles.ts                     roles, capabilities, matrix
src/lib/auth/server.ts                    getSessionUser(), service client
src/lib/auth/browser.ts                   sign-in / sign-up / sign-out client
src/middleware.ts                         token refresh + /dashboard guard
src/app/login, src/app/signup             auth pages
src/app/dashboard/                        overview, announcements, profile,
                                          enquiries, insights, users
src/app/admin/layout.tsx                  studio role gate
scripts/grant-role.mjs                    first-admin bootstrap
```
