// E2E: full campaign lifecycle through the public API (mock mode).
//
// ⚠ Start the target server with MARKETING_STORE=file. This script creates ~11
// campaigns plus assets, approvals and audit entries. With the default
// .env.local (MARKETING_STORE=supabase) those land in the live Supabase
// project, and the audit rows CANNOT be deleted afterwards — audit_log is
// append-only by rule. See docs/SUPABASE.md.
//
//   MARKETING_STORE=file npx next dev -p 3003     # bash
//   $env:MARKETING_STORE='file'; npx next dev -p 3003   # PowerShell
const sharp = require("sharp");
const fs = require("node:fs");
const path = require("node:path");

const BASE = "http://localhost:3003";
let cookie = "";

async function req(method, url, body, form) {
  const headers = { cookie };
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + url, { method, headers, body: payload });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

const assert = (cond, label) => {
  if (!cond) throw new Error(`ASSERT FAILED: ${label}`);
  console.log("  ✓", label);
};

(async () => {
  console.log("1. auth (dev mode)");
  const me = await req("GET", "/api/marketing/auth/login");
  assert(me.ok && me.dev === true, "dev mode active");

  console.log("2. create campaign");
  const { campaign } = await req("POST", "/api/marketing/campaigns", { title: `E2E National Hackathon ${Date.now()}`, type: "hackathon" });
  const id = campaign.id;
  assert(campaign.status === "DRAFT", `campaign ${id} created in DRAFT`);

  console.log("3. assistant fact extraction");
  const ask = await req("POST", `/api/marketing/campaigns/${id}/ask`, {
    message: "The National-Level Hackathon 2026 called 'HackBVC' happens on 2026-09-14 at the BVCITS Seminar Hall. Winners: Team Alpha (CSE), Team Beta (ECE). 120 participants from CSE, ECE departments. Organised by the Innovation Club, chief guest Dr. Rajesh Kumar. See https://bvcits.edu.in/hackbvc",
  });
  assert(ask.facts.length >= 6, `${ask.facts.length} facts extracted`);
  assert(ask.facts.some((f) => f.field === "winners"), "winners extracted");

  console.log("4. upload photograph");
  const dir = path.join(process.cwd(), ".data", "e2e");
  fs.mkdirSync(dir, { recursive: true });
  const photo = path.join(dir, "hackathon.jpg");
  await sharp({ create: { width: 1280, height: 960, channels: 3, background: { r: 60, g: 90, b: 120 } } })
    .composite([{ input: Buffer.from('<svg width="1280" height="960" xmlns="http://www.w3.org/2000/svg"><rect x="200" y="300" width="500" height="120" rx="10" fill="#1E293B"/><text x="450" y="400" text-anchor="middle" font-family="Arial" font-size="60" fill="#FFF">HACKBVC</text></svg>'), left: 0, top: 0 }])
    .jpeg({ quality: 80 })
    .toFile(photo);
  const form = new FormData();
  form.append("files", new Blob([fs.readFileSync(photo)], { type: "image/jpeg" }), "hackathon.jpg");
  const up = await req("POST", `/api/marketing/campaigns/${id}/assets`, undefined, form);
  assert(up.assets.length === 1, "photo uploaded");

  console.log("5. run pipeline");
  const gen = await req("POST", `/api/marketing/campaigns/${id}/generate`);
  assert(gen.campaign.status === "READY_FOR_REVIEW", `quality gate passed → READY_FOR_REVIEW (got ${gen.campaign.status})`);
  const detail = gen.detail;
  assert(detail.content.length >= 4, `${detail.content.length} platform versions written`);
  assert(detail.assets.some((a) => a.aiGenerated), "AI creative composed from real photo");
  assert(detail.quality && detail.quality.verdict === "pass", `quality ${detail.quality.overall}/100 pass`);
  assert(detail.seo && detail.seo.seoTitle.length > 10, "SEO metadata generated");
  assert(detail.runs.length >= 6, `${detail.runs.length} agent runs recorded`);

  console.log("6. connect mock accounts");
  const accountsRes = await req("GET", "/api/marketing/accounts");
  const have = new Set(accountsRes.accounts.map((a) => a.platform));
  if (!have.has("instagram")) {
    const acc = await req("POST", "/api/marketing/accounts", { platform: "instagram", label: "BVCITS (mock)" });
    assert(acc.account.mock === true, "mock instagram connected");
  } else {
    console.log("  ✓ instagram already connected");
  }
  if (!have.has("website")) {
    await req("POST", "/api/marketing/accounts", { platform: "website", label: "BVCITS Website" });
  } else {
    console.log("  ✓ website already connected");
  }

  console.log("7. approve & schedule");
  const due = new Date(Date.now() + 5 * 1000).toISOString();
  const appr = await req("POST", `/api/marketing/campaigns/${id}/approve`, { platforms: ["instagram", "website"], scheduledAt: due });
  assert(appr.campaign.status === "SCHEDULED", `campaign SCHEDULED (got ${appr.campaign.status})`);
  assert(appr.jobs.length === 2, `${appr.jobs.length} publish jobs created`);

  console.log("8. worker tick (due in 5s)");
  await new Promise((r) => setTimeout(r, 8000));
  const tick = await req("POST", "/api/marketing/worker");
  console.log("  tick:", JSON.stringify(tick));

  const final = await req("GET", `/api/marketing/campaigns/${id}`);
  console.log("  final status:", final.campaign.status);
  console.log("  jobs:", final.jobs.map((j) => `${j.platform}:${j.status}`).join(", "));
  assert(final.campaign.status === "PUBLISHED" || final.campaign.status === "SCHEDULED", "publish flow completed");
  assert(final.jobs.every((j) => ["published", "scheduled", "skipped"].includes(j.status)), "no failed jobs");

  console.log("9. audit trail");
  const audit = await req("GET", "/api/marketing/worker?limit=100");
  assert(audit.audit.some((a) => a.action === "published"), "audit contains published events");

  console.log("\nE2E PASS ✓");
})().catch((e) => {
  console.error("\nE2E FAIL:", e.message);
  process.exit(1);
});