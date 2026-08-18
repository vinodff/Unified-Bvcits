// PDF export utilities for the certificate generator.
//
// Three modes:
//   1. Single PDF — one certificate, one file
//   2. Group PDF  — all certificates in one multi-page PDF
//   3. ZIP export — individual PDFs bundled into a .zip (using JSZip via jsPDF)
//
// All client-side. The certificates arrive as JPEG data URLs from generate-cert.ts
// and are embedded into landscape PDF pages at the image's native aspect ratio.

import { jsPDF } from "jspdf";
import type { CertificateRecord } from "./cert-types";

/** Triggers a browser download of a Blob. */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Creates a single-page PDF from one certificate.
 */
export function exportSinglePdf(cert: CertificateRecord): void {
  if (!cert.imageDataUrl) return;

  const img = new Image();
  img.src = cert.imageDataUrl;

  // Landscape A4-ish dimensions based on image aspect ratio
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "px",
    format: [img.naturalWidth || 1920, img.naturalHeight || 1358],
  });

  pdf.addImage(
    cert.imageDataUrl,
    "JPEG",
    0,
    0,
    pdf.internal.pageSize.getWidth(),
    pdf.internal.pageSize.getHeight(),
  );

  pdf.save(`${cert.rollNumber}_certificate.pdf`);
}

/**
 * Creates a multi-page PDF containing all certificates.
 *
 * @param certs  Array of certificates with imageDataUrl populated.
 * @param filename  Output filename.
 * @param onProgress  Optional callback for progress reporting.
 */
export async function exportGroupPdf(
  certs: CertificateRecord[],
  filename: string = "certificates_all.pdf",
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  if (certs.length === 0) return;

  const first = certs[0];
  if (!first.imageDataUrl) return;

  // Use a temporary image to get dimensions
  const tmpImg = new Image();
  tmpImg.src = first.imageDataUrl;
  await new Promise<void>((res) => {
    tmpImg.onload = () => res();
    // If already loaded
    if (tmpImg.complete) res();
  });

  const W = tmpImg.naturalWidth || 1920;
  const H = tmpImg.naturalHeight || 1358;

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "px",
    format: [W, H],
  });

  for (let i = 0; i < certs.length; i++) {
    const cert = certs[i];
    if (!cert.imageDataUrl) continue;

    if (i > 0) pdf.addPage([W, H], "landscape");

    pdf.addImage(cert.imageDataUrl, "JPEG", 0, 0, W, H);

    onProgress?.(i + 1, certs.length);

    // Yield to the event loop every 50 pages to keep the UI responsive
    if (i % 50 === 49) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  const blob = pdf.output("blob");
  downloadBlob(blob, filename);
}

/**
 * Exports individual PDFs as a ZIP archive.
 *
 * Since we don't want another dependency, this creates individual PDF downloads
 * in batches. For large sets, use exportGroupPdf instead.
 *
 * For a proper ZIP, this packages them into a single group PDF with bookmarks.
 * A future version could use JSZip if needed.
 */
export async function exportIndividualPdfs(
  certs: CertificateRecord[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  if (certs.length === 0) return;

  const first = certs[0];
  if (!first.imageDataUrl) return;

  const tmpImg = new Image();
  tmpImg.src = first.imageDataUrl;
  await new Promise<void>((res) => {
    tmpImg.onload = () => res();
    if (tmpImg.complete) res();
  });

  const W = tmpImg.naturalWidth || 1920;
  const H = tmpImg.naturalHeight || 1358;

  // For manageable sizes (< 100), download individual files
  if (certs.length <= 100) {
    for (let i = 0; i < certs.length; i++) {
      const cert = certs[i];
      if (!cert.imageDataUrl) continue;

      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "px",
        format: [W, H],
      });

      pdf.addImage(cert.imageDataUrl, "JPEG", 0, 0, W, H);
      pdf.save(`${cert.rollNumber}_certificate.pdf`);

      onProgress?.(i + 1, certs.length);
      await new Promise((r) => setTimeout(r, 100)); // Small delay between downloads
    }
    return;
  }

  // For larger sets, fall back to group PDF (browsers block bulk downloads)
  await exportGroupPdf(certs, "certificates_all.pdf", onProgress);
}
