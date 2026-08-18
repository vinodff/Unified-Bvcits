// Bulk results import: an admin posts a spreadsheet, it lands as a DRAFT batch.

import { NextRequest, NextResponse } from "next/server";

import { can } from "@/lib/auth/roles";
import { getSessionUser, getServiceClient } from "@/lib/auth/server";
import { importResultBatch } from "@/lib/results/import";
import { summarize } from "@/lib/results/parse";
import { ACCEPTED_EXTENSIONS, MAX_UPLOAD_BYTES, hasAcceptedExtension, parseWorkbook } from "@/lib/results/workbook";

export const dynamic = "force-dynamic";

/**
 * Parsing a 30,000-row workbook and writing it in 500-row chunks takes longer
 * than the default serverless budget allows.
 */
export const maxDuration = 300;

/** Fallback DOB for students a sheet introduces without one. */
const DEFAULT_PLACEHOLDER_DOB = "2005-01-01";

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function field(form: FormData, name: string): string | null {
  const value = form.get(name);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export async function POST(req: NextRequest) {
  /*
   * Authorization, first and explicitly.
   *
   * The middleware guards the /admin PAGES, not this route — an API path is
   * not covered by ROUTE_CAPABILITIES — and everything below runs on the
   * service-role client, which bypasses RLS entirely. This check is therefore
   * the only thing standing between a signed-in student and the ability to
   * publish marks, so it is not defence in depth here; it is the defence.
   */
  const user = await getSessionUser();
  if (!user) return bad("Your session has expired. Sign in again.", 401);
  if (!can(user.role, "results.publish")) return bad("Your role cannot publish results.", 403);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return bad("Could not read the upload. Send the file as multipart/form-data.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) return bad("No file was attached.");
  if (file.size === 0) return bad("That file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) {
    return bad(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
  }
  if (!hasAcceptedExtension(file.name)) {
    return bad(`Unsupported file type. Accepted: ${ACCEPTED_EXTENSIONS.join(", ")}`);
  }

  const defaultDob = field(form, "defaultDob") ?? DEFAULT_PLACEHOLDER_DOB;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(defaultDob)) {
    return bad("The fallback date of birth must be a calendar date.");
  }

  let parsed;
  try {
    parsed = parseWorkbook(await file.arrayBuffer());
  } catch (error) {
    // A corrupt or password-protected workbook throws from deep inside the
    // spreadsheet library; its message is not something to show an operator.
    console.error("[results/import] workbook parse failed", error);
    return bad("That file could not be read as a spreadsheet. If it is password protected, remove the password and try again.");
  }

  if (parsed.rows.length === 0) {
    return NextResponse.json(
      {
        error: "No result rows were found in that file.",
        issues: parsed.issues.slice(0, 50),
        sheets: parsed.sheets,
      },
      { status: 422 }
    );
  }

  const title =
    field(form, "title") ??
    `${file.name.replace(/\.[^.]+$/, "")} — ${summarize(parsed.rows).students} students`;

  try {
    const outcome = await importResultBatch(
      getServiceClient(),
      {
        title,
        academicYear: field(form, "academicYear"),
        semester: field(form, "semester"),
        examType: field(form, "examType"),
        sourceFilename: file.name,
        defaultDob,
        uploadedBy: user.id,
        notes: field(form, "notes"),
      },
      parsed.rows,
      parsed.issues
    );

    return NextResponse.json({
      ...outcome,
      sheets: parsed.sheets,
      // Only the first 200 issues travel to the browser. A malformed file can
      // produce one issue per row, and shipping 30,000 of them would make the
      // response larger than the spreadsheet.
      issues: outcome.issues.slice(0, 200),
      issueCount: outcome.issues.length,
      defaultDob,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[results/import] import failed", error);
    return bad(message, 500);
  }
}
