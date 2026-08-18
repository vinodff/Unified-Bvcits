// Certificate image rendering using the Canvas API.
//
// Runs entirely client-side: loads the background image, fills in placeholders,
// renders the body text, generates a QR code for verification, and stamps the
// certificate number. Returns a data URL that jsPDF can embed directly.

import QRCode from "qrcode";
import type { CertificateRecord, ExcelRow, TemplateConfig } from "./cert-types";
import { generateCertNumber } from "./cert-number";

/**
 * Fills template placeholders with student data.
 *
 * Supported placeholders:
 *   {name}     — student name
 *   {branch}   — branch / department
 *   {reg_no}   — roll / registration number
 *   {event}    — event title
 *   {date}     — event date
 *
 * Any extra columns from the Excel sheet are also available as `{column_name}`.
 */
export function fillTemplate(template: string, row: ExcelRow, event: string, date: string): string {
  let text = template;
  text = text.replace(/\{name\}/gi, row.name);
  text = text.replace(/\{branch\}/gi, row.branch);
  text = text.replace(/\{reg_no\}/gi, row.rollNumber);
  text = text.replace(/\{event\}/gi, event);
  text = text.replace(/\{date\}/gi, date);

  // Replace any extra columns, e.g. {section} if the Excel has a "Section" column
  for (const [key, value] of Object.entries(row)) {
    if (key !== "name" && key !== "rollNumber" && key !== "branch") {
      const pattern = new RegExp(`\\{${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\}`, "gi");
      text = text.replace(pattern, value);
    }
  }

  return text;
}

/** Loads an image from a data URL or object URL into an HTMLImageElement. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load background image."));
    img.src = src;
  });
}

/**
 * Wraps text to fit within maxWidth, returning an array of lines.
 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  // Split on explicit newlines first
  const paragraphs = text.split("\n");

  for (const paragraph of paragraphs) {
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/\s+/);
    let currentLine = "";
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
  }
  return lines;
}

/**
 * Generates a QR code as a data URL.
 */
async function generateQR(text: string, size: number): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    color: { dark: "#1a1a2e", light: "#ffffff" },
    errorCorrectionLevel: "M",
  });
}

/** The site URL used for verification links. */
function getSiteUrl(): string {
  if (typeof window !== "undefined" && window.location) {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://bvcits.edu.in";
}

export interface RenderOptions {
  backgroundUrl: string;
  config: TemplateConfig;
  row: ExcelRow;
  batchId: string;
  index: number;
  /** If provided, reuse this canvas instead of creating a new one. */
  canvas?: HTMLCanvasElement;
}

/**
 * Renders a single certificate and returns the record + image data URL.
 */
export async function renderCertificate(opts: RenderOptions): Promise<CertificateRecord> {
  const { backgroundUrl, config, row, batchId, index } = opts;

  const certNumber = generateCertNumber(batchId, index);
  const certText = fillTemplate(config.templateText, row, config.eventTitle, config.eventDate);
  const verifyUrl = `${getSiteUrl()}/verify/${certNumber}`;

  // Load background
  const bgImg = await loadImage(backgroundUrl);
  const W = bgImg.naturalWidth;
  const H = bgImg.naturalHeight;

  // Create or reuse canvas
  const canvas = opts.canvas ?? document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Draw background
  ctx.drawImage(bgImg, 0, 0, W, H);

  // Configure text
  const fontWeight = "normal";
  ctx.font = `${fontWeight} ${config.fontSize}px ${config.fontFamily}`;
  ctx.fillStyle = config.color;
  ctx.textAlign = config.bodyAlign;
  ctx.textBaseline = "top";

  // Body text position
  const maxW = W * config.bodyMaxWidthFraction;
  const bodyX = config.bodyAlign === "center" ? W / 2 : config.bodyAlign === "right" ? W - (W * (1 - config.bodyMaxWidthFraction)) / 2 : (W * (1 - config.bodyMaxWidthFraction)) / 2;
  const bodyY = H * config.bodyY;

  // Wrap and render text
  const lines = wrapText(ctx, certText, maxW);
  const lineHeight = config.fontSize * 1.5;

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], bodyX, bodyY + i * lineHeight, maxW);
  }

  // QR code
  if (config.qrPosition !== "none") {
    try {
      const qrDataUrl = await generateQR(verifyUrl, config.qrSize * 2);
      const qrImg = await loadImage(qrDataUrl);

      let qrX: number;
      let qrY: number;
      const margin = 40;
      const qrRenderSize = config.qrSize;

      if (config.qrPosition === "bottom-right") {
        qrX = W - qrRenderSize - margin;
        qrY = H - qrRenderSize - margin;
      } else {
        qrX = margin;
        qrY = H - qrRenderSize - margin;
      }

      // White background behind QR for readability
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(qrX - 4, qrY - 4, qrRenderSize + 8, qrRenderSize + 8);
      ctx.drawImage(qrImg, qrX, qrY, qrRenderSize, qrRenderSize);

      // "Scan to verify" label
      ctx.fillStyle = config.color;
      ctx.font = `bold 10px ${config.fontFamily}`;
      ctx.textAlign = "center";
      ctx.fillText("Scan to Verify", qrX + qrRenderSize / 2, qrY + qrRenderSize + 8);
    } catch {
      // QR generation can fail silently — certificate still valid without it
    }
  }

  // Certificate number
  if (config.certNumberPosition !== "none") {
    ctx.fillStyle = "#666666";
    ctx.font = `${config.certNumberFontSize}px ${config.fontFamily}`;
    ctx.textAlign = "center";

    const cnY = config.certNumberPosition === "bottom-center" ? H - 25 : H - 20;
    ctx.fillText(`Certificate No: ${certNumber}`, W / 2, cnY);
  }

  const imageDataUrl = canvas.toDataURL("image/jpeg", 0.92);

  return {
    certificateNumber: certNumber,
    studentName: row.name,
    rollNumber: row.rollNumber,
    branch: row.branch,
    eventTitle: config.eventTitle,
    eventDate: config.eventDate,
    certificateText: certText,
    imageDataUrl,
  };
}
