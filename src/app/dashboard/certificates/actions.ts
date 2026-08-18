"use server";

import { revalidatePath } from "next/cache";
import { createClient, getSessionUser, getServiceClient } from "@/lib/auth/server";
import { can } from "@/lib/auth/roles";
import type { CertificateBatch } from "@/lib/certificates/cert-types";

// ---------------------------------------------------------------------------
// Save a batch of certificates to Supabase
// ---------------------------------------------------------------------------

export interface SaveBatchInput {
  batchId: string;
  title: string;
  templateText: string;
  certificates: {
    certificateNumber: string;
    studentName: string;
    rollNumber: string;
    branch: string;
    eventTitle: string;
    eventDate: string;
    certificateText: string;
  }[];
}

export interface SaveBatchResult {
  ok: boolean;
  error?: string;
  savedCount?: number;
}

/**
 * Persists a generation run — the batch record and all individual certificates.
 *
 * This is called after the client has rendered all certificates and the user
 * clicks "Save to Database". It is NOT called automatically during generation
 * because rendering 100K images is slow enough without waiting for network I/O
 * between each one.
 */
export async function saveBatch(input: SaveBatchInput): Promise<SaveBatchResult> {
  const user = await getSessionUser();
  if (!user || !can(user.role, "certificates.generate")) {
    return { ok: false, error: "You do not have permission to generate certificates." };
  }

  try {
    const supabase = await createClient();

    // 1. Create the batch record
    const { error: batchError } = await supabase.from("certificate_batches").insert({
      id: input.batchId,
      title: input.title,
      template_text: input.templateText,
      total_count: input.certificates.length,
      generated_by: user.id,
    });

    if (batchError) {
      console.error("[certificates] batch insert failed:", batchError.message);
      return { ok: false, error: `Could not save the batch record: ${batchError.message}` };
    }

    // 2. Insert certificates in chunks (Supabase has a row limit per insert)
    const CHUNK_SIZE = 500;
    let savedCount = 0;

    for (let i = 0; i < input.certificates.length; i += CHUNK_SIZE) {
      const chunk = input.certificates.slice(i, i + CHUNK_SIZE).map((cert) => ({
        certificate_number: cert.certificateNumber,
        student_name: cert.studentName,
        roll_number: cert.rollNumber,
        branch: cert.branch,
        event_title: cert.eventTitle,
        event_date: cert.eventDate,
        certificate_text: cert.certificateText,
        batch_id: input.batchId,
        generated_by: user.id,
      }));

      const { error: certError } = await supabase.from("certificates").insert(chunk);

      if (certError) {
        console.error(`[certificates] chunk ${i} insert failed:`, certError.message);
        // Continue with remaining chunks — partial save is better than none
      } else {
        savedCount += chunk.length;
      }
    }

    revalidatePath("/dashboard/certificates");
    return { ok: true, savedCount };
  } catch (error) {
    console.error("[certificates] saveBatch failed:", error instanceof Error ? error.message : error);
    return { ok: false, error: "Could not save certificates. Try again." };
  }
}

// ---------------------------------------------------------------------------
// List past batches
// ---------------------------------------------------------------------------

export async function listBatches(): Promise<CertificateBatch[]> {
  const user = await getSessionUser();
  if (!user || !can(user.role, "certificates.generate")) return [];

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("certificate_batches")
      .select("id, title, template_text, total_count, generated_by, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!data) return [];

    return data.map((row) => ({
      id: row.id,
      title: row.title,
      templateText: row.template_text,
      totalCount: row.total_count,
      generatedBy: row.generated_by,
      createdAt: row.created_at,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Revoke a certificate
// ---------------------------------------------------------------------------

export async function revokeCertificate(certNumber: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user || !can(user.role, "certificates.generate")) {
    return { ok: false, error: "Not authorized." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("certificates")
      .update({ is_verified: false })
      .eq("certificate_number", certNumber);

    if (error) return { ok: false, error: error.message };

    revalidatePath("/dashboard/certificates");
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not revoke certificate." };
  }
}

// ---------------------------------------------------------------------------
// Public verification (used by the /verify/[certNumber] page)
// ---------------------------------------------------------------------------

export interface VerifyResult {
  found: boolean;
  verified?: boolean;
  studentName?: string;
  rollNumber?: string;
  branch?: string;
  eventTitle?: string;
  eventDate?: string;
  certificateNumber?: string;
  generatedAt?: string;
}

export async function verifyCertificate(certNumber: string): Promise<VerifyResult> {
  try {
    const supabase = getServiceClient();
    const { data } = await supabase
      .from("certificates")
      .select("certificate_number, student_name, roll_number, branch, event_title, event_date, is_verified, generated_at")
      .eq("certificate_number", certNumber)
      .maybeSingle();

    if (!data) return { found: false };

    return {
      found: true,
      verified: data.is_verified,
      studentName: data.student_name,
      rollNumber: data.roll_number,
      branch: data.branch,
      eventTitle: data.event_title,
      eventDate: data.event_date,
      certificateNumber: data.certificate_number,
      generatedAt: data.generated_at,
    };
  } catch {
    return { found: false };
  }
}
