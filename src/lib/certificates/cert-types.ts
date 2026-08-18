// TypeScript interfaces for the certificate generation system.

/** A single row parsed from the uploaded Excel sheet. */
export interface ExcelRow {
  name: string;
  rollNumber: string;
  branch: string;
  /** Extra columns the template might reference, keyed by column header. */
  [key: string]: string;
}

/** Configuration for a single text field rendered on the certificate. */
export interface TextFieldConfig {
  /** The text to render (with placeholders already filled). */
  text: string;
  /** X position as a fraction of canvas width (0–1). */
  x: number;
  /** Y position as a fraction of canvas height (0–1). */
  y: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  align: CanvasTextAlign;
  maxWidth?: number;
  bold?: boolean;
  italic?: boolean;
}

/** Full template configuration for rendering a certificate. */
export interface TemplateConfig {
  /** The raw template string with `{name}`, `{branch}`, `{reg_no}` placeholders. */
  templateText: string;
  /** Event/workshop title. */
  eventTitle: string;
  /** Event date string, e.g. "19th & 20th September - 2025". */
  eventDate: string;
  /** Main body font size in px. */
  fontSize: number;
  /** Font family name. */
  fontFamily: string;
  /** Text colour (CSS). */
  color: string;
  /** Y position for the body text as fraction of canvas height. */
  bodyY: number;
  /** Text alignment for the body. */
  bodyAlign: CanvasTextAlign;
  /** Maximum width for text wrapping as fraction of canvas width. */
  bodyMaxWidthFraction: number;
  /** Where to place the QR code. */
  qrPosition: "bottom-left" | "bottom-right" | "none";
  /** QR code size in px. */
  qrSize: number;
  /** Where to place the certificate number. */
  certNumberPosition: "bottom-center" | "below-qr" | "none";
  /** Certificate number font size. */
  certNumberFontSize: number;
}

/** A generated certificate record, ready for PDF export or database persistence. */
export interface CertificateRecord {
  certificateNumber: string;
  studentName: string;
  rollNumber: string;
  branch: string;
  eventTitle: string;
  eventDate: string;
  /** The full rendered body text (placeholders filled). */
  certificateText: string;
  /** Data URL of the rendered certificate image. */
  imageDataUrl?: string;
}

/** Persisted batch metadata (matches the database row). */
export interface CertificateBatch {
  id: string;
  title: string;
  templateText: string;
  totalCount: number;
  generatedBy: string;
  createdAt: string;
}

/** Default template config for a fresh form. */
export const DEFAULT_TEMPLATE: TemplateConfig = {
  templateText:
    'This is to Certify that {Mr./Ms. {name}}\n\nStudying {branch} with Reg.No. {reg_no}, has participated in the\n\n{event}\n\nheld on {date}.',
  eventTitle: "",
  eventDate: "",
  fontSize: 28,
  fontFamily: "Georgia",
  color: "#1a1a2e",
  bodyY: 0.52,
  bodyAlign: "center",
  bodyMaxWidthFraction: 0.75,
  qrPosition: "bottom-right",
  qrSize: 100,
  certNumberPosition: "bottom-center",
  certNumberFontSize: 12,
};
