"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import {
  Award,
  Upload as UploadCloud,
  FileSpreadsheet,
  Download,
  Loader2,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  QrCode,
  FileDown,
  PackageOpen,
} from "lucide-react";
import { DEFAULT_TEMPLATE, type CertificateRecord, type TemplateConfig } from "@/lib/certificates/cert-types";
import type { ExcelRow } from "@/lib/certificates/cert-types";
import { parseExcelFile } from "@/lib/certificates/parse-excel";
import { renderCertificate, fillTemplate } from "@/lib/certificates/generate-cert";
import { exportSinglePdf, exportGroupPdf, exportIndividualPdfs } from "@/lib/certificates/export-pdf";
import { newBatchId } from "@/lib/certificates/cert-number";
import { saveBatch, type SaveBatchInput } from "./actions";

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS: Record<Step, string> = {
  1: "Template",
  2: "Data",
  3: "Generate",
  4: "Export",
};

const panelCls = "rounded-2xl border border-surface-border bg-white p-5 sm:p-6 shadow-card";
const inputCls =
  "w-full rounded-xl border border-surface-border bg-surface-subtle px-4 py-2.5 text-sm text-ink outline-none transition focus:border-crimson focus:ring-2 focus:ring-crimson/20";
const btnPrimary =
  "inline-flex items-center gap-2 rounded-xl bg-crimson px-5 py-2.5 text-sm font-bold text-white transition hover:bg-crimson-700 disabled:opacity-40 disabled:cursor-not-allowed";
const btnSecondary =
  "inline-flex items-center gap-2 rounded-xl border border-surface-border bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-surface-subtle disabled:opacity-40";

export function CertificateGenerator() {
  const [step, setStep] = useState<Step>(1);

  // Step 1: Template
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);
  const [bgFileName, setBgFileName] = useState<string>("");
  const [config, setConfig] = useState<TemplateConfig>(DEFAULT_TEMPLATE);

  // Step 2: Data
  const [rows, setRows] = useState<ExcelRow[]>([]);
  const [excelFileName, setExcelFileName] = useState<string>("");
  const [excelError, setExcelError] = useState<string | null>(null);

  // Step 3: Generate
  const [batchId] = useState(() => newBatchId());
  const [certificates, setCertificates] = useState<CertificateRecord[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState({ done: 0, total: 0 });
  const [previewIndex, setPreviewIndex] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Step 4: Export
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ done: 0, total: 0 });
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; error?: string; count?: number } | null>(null);

  // Live Preview
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!bgImageUrl) {
      setPreviewDataUrl(null);
      return;
    }

    const dummyRow: ExcelRow = {
      name: "Jane Doe",
      branch: "Computer Science (CSE)",
      rollNumber: "21B91A0501",
    };

    let isMounted = true;
    renderCertificate({
      backgroundUrl: bgImageUrl,
      config,
      row: dummyRow,
      batchId: "preview-batch",
      index: 1,
    })
      .then((cert) => {
        if (isMounted) setPreviewDataUrl(cert.imageDataUrl || null);
      })
      .catch((err) => {
        console.error("Preview render failed:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [bgImageUrl, config]);

  // --- Step 1: Template configuration ---
  const handleBgUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBgFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setBgImageUrl(reader.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleBgDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setBgFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setBgImageUrl(reader.result as string);
    reader.readAsDataURL(file);
  }, []);

  const insertPlaceholder = useCallback((placeholder: string) => {
    setConfig((prev) => ({
      ...prev,
      templateText: prev.templateText + placeholder,
    }));
  }, []);

  // --- Step 2: Excel upload ---
  const handleExcelUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelFileName(file.name);
    setExcelError(null);

    const result = await parseExcelFile(file);
    if (!result.ok) {
      setExcelError(result.error);
      setRows([]);
      return;
    }
    setRows(result.rows);
  }, []);

  const handleExcelDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    setExcelFileName(file.name);
    setExcelError(null);

    const result = await parseExcelFile(file);
    if (!result.ok) {
      setExcelError(result.error);
      setRows([]);
      return;
    }
    setRows(result.rows);
  }, []);

  // --- Step 3: Generate certificates ---
  const handleGenerate = useCallback(async () => {
    if (!bgImageUrl || rows.length === 0) return;
    setGenerating(true);
    setCertificates([]);
    setGenProgress({ done: 0, total: rows.length });

    const canvas = canvasRef.current ?? document.createElement("canvas");
    const certs: CertificateRecord[] = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const cert = await renderCertificate({
          backgroundUrl: bgImageUrl,
          config,
          row: rows[i],
          batchId,
          index: i,
          canvas,
        });
        certs.push(cert);
      } catch (err) {
        console.error(`[cert] Failed rendering certificate ${i}:`, err);
      }

      setGenProgress({ done: i + 1, total: rows.length });

      // Yield to keep UI responsive
      if (i % 20 === 19) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    setCertificates(certs);
    setGenerating(false);
    setPreviewIndex(0);
  }, [bgImageUrl, rows, config, batchId]);

  // --- Step 4: Export ---
  const handleExportSingle = useCallback((cert: CertificateRecord) => {
    exportSinglePdf(cert);
  }, []);

  const handleExportGroup = useCallback(async () => {
    setExporting(true);
    setExportProgress({ done: 0, total: certificates.length });
    await exportGroupPdf(certificates, `certificates_${batchId.slice(0, 8)}.pdf`, (done, total) => {
      setExportProgress({ done, total });
    });
    setExporting(false);
  }, [certificates, batchId]);

  const handleExportIndividual = useCallback(async () => {
    setExporting(true);
    setExportProgress({ done: 0, total: certificates.length });
    await exportIndividualPdfs(certificates, (done, total) => {
      setExportProgress({ done, total });
    });
    setExporting(false);
  }, [certificates]);

  const handleSaveToDb = useCallback(async () => {
    setSaving(true);
    setSaveResult(null);

    const input: SaveBatchInput = {
      batchId,
      title: config.eventTitle || "Untitled Batch",
      templateText: config.templateText,
      certificates: certificates.map((c) => ({
        certificateNumber: c.certificateNumber,
        studentName: c.studentName,
        rollNumber: c.rollNumber,
        branch: c.branch,
        eventTitle: c.eventTitle,
        eventDate: c.eventDate,
        certificateText: c.certificateText,
      })),
    };

    const result = await saveBatch(input);
    setSaveResult({ ok: result.ok, error: result.error, count: result.savedCount });
    setSaving(false);
  }, [batchId, config, certificates]);

  // --- Navigation ---
  const canGoTo2 = !!bgImageUrl && config.templateText.trim().length > 0;
  const canGoTo3 = canGoTo2 && rows.length > 0;
  const canGoTo4 = certificates.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={panelCls}>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-crimson/10">
            <Award className="h-6 w-6 text-crimson" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-navy">Bulk Certificate Generator</h1>
            <p className="text-sm text-ink-muted">
              Upload a background image and Excel data to generate certificates with QR verification.
            </p>
          </div>
        </div>

        {/* Step indicator */}
        <div className="mt-5 flex items-center gap-1">
          {([1, 2, 3, 4] as Step[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                if (s === 1) setStep(1);
                if (s === 2 && canGoTo2) setStep(2);
                if (s === 3 && canGoTo3) setStep(3);
                if (s === 4 && canGoTo4) setStep(4);
              }}
              disabled={
                (s === 2 && !canGoTo2) ||
                (s === 3 && !canGoTo3) ||
                (s === 4 && !canGoTo4)
              }
              className={`flex flex-1 items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                step === s
                  ? "bg-crimson text-white"
                  : step > s
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-surface-subtle text-ink-muted"
              } disabled:opacity-40`}
            >
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                step > s ? "bg-emerald-500 text-white" : step === s ? "bg-white/20 text-inherit" : "bg-surface-border text-ink-muted"
              }`}>
                {step > s ? "✓" : s}
              </span>
              <span className="hidden sm:inline">{STEP_LABELS[s]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Step 1: Template */}
      {step === 1 && (
        <div className="space-y-4">
          <div className={panelCls}>
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-soft">
              <UploadCloud className="h-4 w-4" />
              Background Image
            </h2>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleBgDrop}
              className="mt-3 rounded-xl border-2 border-dashed border-surface-border p-8 text-center transition hover:border-crimson/40"
            >
              {bgImageUrl ? (
                <div>
                  <img
                    src={previewDataUrl || bgImageUrl}
                    alt="Certificate preview"
                    className="mx-auto max-h-[500px] w-full object-contain rounded-lg border border-surface-border shadow-sm"
                  />
                  <p className="mt-2 text-xs text-ink-muted">{bgFileName}</p>
                  <label className="mt-2 inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-crimson hover:underline">
                    Change image
                    <input type="file" accept="image/*" onChange={handleBgUpload} className="sr-only" />
                  </label>
                </div>
              ) : (
                <label className="cursor-pointer">
                  <UploadCloud className="mx-auto h-8 w-8 text-ink-faint" />
                  <p className="mt-2 text-sm text-ink-muted">
                    Drag & drop your certificate background or{" "}
                    <span className="font-semibold text-crimson">click to upload</span>
                  </p>
                  <p className="mt-1 text-xs text-ink-faint">PNG, JPG, or WEBP</p>
                  <input type="file" accept="image/*" onChange={handleBgUpload} className="sr-only" />
                </label>
              )}
            </div>
          </div>

          <div className={panelCls}>
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Certificate Text Template</h2>
            <p className="mt-1 text-xs text-ink-muted">
              Use placeholders that will be replaced with data from the Excel sheet.
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {[
                { label: "{name}", value: "{name}" },
                { label: "{branch}", value: "{branch}" },
                { label: "{reg_no}", value: "{reg_no}" },
                { label: "{event}", value: "{event}" },
                { label: "{date}", value: "{date}" },
              ].map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => insertPlaceholder(p.value)}
                  className="rounded-lg border border-crimson/20 bg-crimson/5 px-2.5 py-1 text-xs font-semibold text-crimson transition hover:bg-crimson/10"
                >
                  {p.label}
                </button>
              ))}
            </div>

            <textarea
              value={config.templateText}
              onChange={(e) => setConfig((prev) => ({ ...prev, templateText: e.target.value }))}
              rows={6}
              className={`mt-3 ${inputCls}`}
              placeholder="This is to Certify that {name} ..."
            />

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-ink-soft">Event / Workshop Title</label>
                <input
                  type="text"
                  value={config.eventTitle}
                  onChange={(e) => setConfig((prev) => ({ ...prev, eventTitle: e.target.value }))}
                  className={`mt-1 ${inputCls}`}
                  placeholder="Two day Workshop on AI & ML Tools"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-ink-soft">Event Date</label>
                <input
                  type="text"
                  value={config.eventDate}
                  onChange={(e) => setConfig((prev) => ({ ...prev, eventDate: e.target.value }))}
                  className={`mt-1 ${inputCls}`}
                  placeholder="19th & 20th September - 2025"
                />
              </div>
            </div>
          </div>

          <div className={panelCls}>
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Styling Options</h2>

            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <div>
                <label className="text-xs font-semibold text-ink-soft">Font Size</label>
                <input
                  type="number"
                  value={config.fontSize}
                  onChange={(e) => setConfig((prev) => ({ ...prev, fontSize: Number(e.target.value) }))}
                  className={`mt-1 ${inputCls}`}
                  min={10}
                  max={72}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-ink-soft">Font Family</label>
                <select
                  value={config.fontFamily}
                  onChange={(e) => setConfig((prev) => ({ ...prev, fontFamily: e.target.value }))}
                  className={`mt-1 ${inputCls}`}
                >
                  <option value="Georgia">Georgia</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Arial">Arial</option>
                  <option value="Verdana">Verdana</option>
                  <option value="Garamond">Garamond</option>
                  <option value="serif">Serif</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-ink-soft">Text Colour</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    value={config.color}
                    onChange={(e) => setConfig((prev) => ({ ...prev, color: e.target.value }))}
                    className="h-10 w-10 cursor-pointer rounded border border-surface-border"
                  />
                  <input
                    type="text"
                    value={config.color}
                    onChange={(e) => setConfig((prev) => ({ ...prev, color: e.target.value }))}
                    className={`flex-1 ${inputCls}`}
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <label className="text-xs font-semibold text-ink-soft">Text Y Position (%)</label>
                <input
                  type="range"
                  min="0.2"
                  max="0.85"
                  step="0.01"
                  value={config.bodyY}
                  onChange={(e) => setConfig((prev) => ({ ...prev, bodyY: Number(e.target.value) }))}
                  className="mt-2 w-full"
                />
                <p className="text-center text-xs text-ink-muted">{Math.round(config.bodyY * 100)}%</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-ink-soft">QR Code Position</label>
                <select
                  value={config.qrPosition}
                  onChange={(e) => setConfig((prev) => ({ ...prev, qrPosition: e.target.value as TemplateConfig["qrPosition"] }))}
                  className={`mt-1 ${inputCls}`}
                >
                  <option value="bottom-right">Bottom Right</option>
                  <option value="bottom-left">Bottom Left</option>
                  <option value="none">No QR Code</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-ink-soft">QR Code Size (px)</label>
                <input
                  type="number"
                  value={config.qrSize}
                  onChange={(e) => setConfig((prev) => ({ ...prev, qrSize: Number(e.target.value) }))}
                  className={`mt-1 ${inputCls}`}
                  min={50}
                  max={200}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={!canGoTo2}
              onClick={() => setStep(2)}
              className={btnPrimary}
            >
              Next: Upload Data
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Upload Excel */}
      {step === 2 && (
        <div className="space-y-4">
          <div className={panelCls}>
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-soft">
              <FileSpreadsheet className="h-4 w-4" />
              Upload Student Data
            </h2>
            <p className="mt-1 text-xs text-ink-muted">
              Upload an Excel file with columns: <strong>Name</strong>, <strong>Roll Number</strong>, <strong>Branch</strong>
            </p>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleExcelDrop}
              className="mt-3 rounded-xl border-2 border-dashed border-surface-border p-8 text-center transition hover:border-crimson/40"
            >
              <label className="cursor-pointer">
                <FileSpreadsheet className="mx-auto h-8 w-8 text-ink-faint" />
                <p className="mt-2 text-sm text-ink-muted">
                  Drag & drop Excel file or{" "}
                  <span className="font-semibold text-crimson">click to upload</span>
                </p>
                <p className="mt-1 text-xs text-ink-faint">.xlsx or .xls</p>
                <input
                  type="file"
                  accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  onChange={handleExcelUpload}
                  className="sr-only"
                />
              </label>
            </div>

            {excelError && (
              <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{excelError}</p>
            )}

            {excelFileName && !excelError && rows.length > 0 && (
              <div className="mt-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Loaded {rows.length.toLocaleString()} students from {excelFileName}
                </p>

                {/* Preview table */}
                <div className="mt-3 overflow-x-auto rounded-xl border border-surface-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-surface-subtle text-left">
                        <th className="px-3 py-2 font-semibold text-ink-soft">#</th>
                        <th className="px-3 py-2 font-semibold text-ink-soft">Name</th>
                        <th className="px-3 py-2 font-semibold text-ink-soft">Roll Number</th>
                        <th className="px-3 py-2 font-semibold text-ink-soft">Branch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 10).map((row, i) => (
                        <tr key={i} className="border-t border-surface-border">
                          <td className="px-3 py-2 text-ink-muted">{i + 1}</td>
                          <td className="px-3 py-2 font-medium">{row.name}</td>
                          <td className="px-3 py-2">{row.rollNumber}</td>
                          <td className="px-3 py-2">{row.branch}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length > 10 && (
                    <p className="border-t border-surface-border bg-surface-subtle px-3 py-2 text-center text-xs text-ink-muted">
                      … and {(rows.length - 10).toLocaleString()} more
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setStep(1)} className={btnSecondary}>
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <button
              type="button"
              disabled={!canGoTo3}
              onClick={() => setStep(3)}
              className={btnPrimary}
            >
              Next: Generate
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Generate */}
      {step === 3 && (
        <div className="space-y-4">
          <div className={panelCls}>
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-soft">
              <Award className="h-4 w-4" />
              Generate Certificates
            </h2>

            {/* Preview of template with first row */}
            {bgImageUrl && rows.length > 0 && certificates.length === 0 && !generating && (
              <div className="mt-3">
                <p className="text-xs text-ink-muted">Preview with first student&apos;s data:</p>
                <div className="mt-2 rounded-xl border border-surface-border bg-surface-subtle p-3">
                  <p className="whitespace-pre-wrap text-sm text-ink">
                    {fillTemplate(config.templateText, rows[0], config.eventTitle, config.eventDate)}
                  </p>
                </div>
              </div>
            )}

            {!generating && certificates.length === 0 && (
              <div className="mt-4 flex flex-col items-center gap-3">
                <p className="text-sm text-ink-muted">
                  Ready to generate <strong>{rows.length.toLocaleString()}</strong> certificates
                </p>
                <button type="button" onClick={handleGenerate} className={btnPrimary}>
                  <Award className="h-4 w-4" />
                  Generate All Certificates
                </button>
              </div>
            )}

            {generating && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-crimson" />
                  <p className="text-sm font-semibold text-ink">
                    Generating certificate {genProgress.done.toLocaleString()} of{" "}
                    {genProgress.total.toLocaleString()}…
                  </p>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-border">
                  <div
                    className="h-full rounded-full bg-crimson transition-all duration-300"
                    style={{ width: `${genProgress.total > 0 ? (genProgress.done / genProgress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {/* Certificate preview carousel */}
            {certificates.length > 0 && !generating && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    Generated {certificates.length.toLocaleString()} certificates
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))}
                      disabled={previewIndex === 0}
                      className={btnSecondary}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-xs font-semibold text-ink-muted">
                      {previewIndex + 1} / {certificates.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPreviewIndex((i) => Math.min(certificates.length - 1, i + 1))}
                      disabled={previewIndex >= certificates.length - 1}
                      className={btnSecondary}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {certificates[previewIndex]?.imageDataUrl && (
                  <div className="overflow-hidden rounded-xl border border-surface-border shadow-sm">
                    <img
                      src={certificates[previewIndex].imageDataUrl}
                      alt={`Certificate for ${certificates[previewIndex].studentName}`}
                      className="w-full"
                    />
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-crimson/10 px-2.5 py-1 font-semibold text-crimson">
                    {certificates[previewIndex]?.certificateNumber}
                  </span>
                  <span className="text-ink-muted">
                    {certificates[previewIndex]?.studentName} — {certificates[previewIndex]?.rollNumber}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Hidden canvas for rendering */}
          <canvas ref={canvasRef} className="hidden" />

          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setStep(2)} className={btnSecondary}>
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            {certificates.length > 0 && (
              <button type="button" onClick={() => setStep(4)} className={btnPrimary}>
                Next: Export
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Step 4: Export */}
      {step === 4 && (
        <div className="space-y-4">
          <div className={panelCls}>
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-soft">
              <Download className="h-4 w-4" />
              Export Certificates
            </h2>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {/* Single PDF download for current preview */}
              <button
                type="button"
                disabled={exporting}
                onClick={() => {
                  if (certificates[previewIndex]) handleExportSingle(certificates[previewIndex]);
                }}
                className="flex flex-col items-center gap-2 rounded-xl border border-surface-border p-5 text-center transition hover:border-crimson/40 hover:bg-crimson/5"
              >
                <FileDown className="h-8 w-8 text-crimson" />
                <span className="text-sm font-bold text-navy">Download Current</span>
                <span className="text-xs text-ink-muted">Single PDF of the previewed certificate</span>
              </button>

              {/* Group PDF */}
              <button
                type="button"
                disabled={exporting}
                onClick={handleExportGroup}
                className="flex flex-col items-center gap-2 rounded-xl border border-surface-border p-5 text-center transition hover:border-crimson/40 hover:bg-crimson/5"
              >
                <PackageOpen className="h-8 w-8 text-crimson" />
                <span className="text-sm font-bold text-navy">Group PDF</span>
                <span className="text-xs text-ink-muted">
                  All {certificates.length.toLocaleString()} certificates in one file
                </span>
              </button>

              {/* Individual PDFs */}
              <button
                type="button"
                disabled={exporting}
                onClick={handleExportIndividual}
                className="flex flex-col items-center gap-2 rounded-xl border border-surface-border p-5 text-center transition hover:border-crimson/40 hover:bg-crimson/5"
              >
                <FileSpreadsheet className="h-8 w-8 text-crimson" />
                <span className="text-sm font-bold text-navy">Individual PDFs</span>
                <span className="text-xs text-ink-muted">
                  {certificates.length <= 100
                    ? "Separate file per student (by roll number)"
                    : "Downloads as group PDF for large sets"}
                </span>
              </button>
            </div>

            {exporting && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-4 w-4 animate-spin text-crimson" />
                  <p className="text-sm text-ink-muted">
                    Exporting {exportProgress.done.toLocaleString()} of {exportProgress.total.toLocaleString()}…
                  </p>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-border">
                  <div
                    className="h-full rounded-full bg-crimson transition-all"
                    style={{ width: `${exportProgress.total > 0 ? (exportProgress.done / exportProgress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* QR / Save to database */}
          <div className={panelCls}>
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-soft">
              <QrCode className="h-4 w-4" />
              Verification & Database
            </h2>
            <p className="mt-1 text-xs text-ink-muted">
              Save certificate records to the database so the QR code verification page works. Each certificate
              gets a unique number and a scannable QR code linking to the public verification page.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={saving || saveResult?.ok === true}
                onClick={handleSaveToDb}
                className={btnPrimary}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : saveResult?.ok ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Saved {saveResult.count?.toLocaleString()} records
                  </>
                ) : (
                  <>
                    <QrCode className="h-4 w-4" />
                    Save to Database for Verification
                  </>
                )}
              </button>

              {saveResult && !saveResult.ok && (
                <p className="text-sm text-red-600">{saveResult.error}</p>
              )}
            </div>
          </div>

          {/* Certificate preview in export step */}
          {certificates.length > 0 && (
            <div className={panelCls}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Preview</h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))}
                    disabled={previewIndex === 0}
                    className={btnSecondary}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-xs font-semibold text-ink-muted">
                    {previewIndex + 1} / {certificates.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreviewIndex((i) => Math.min(certificates.length - 1, i + 1))}
                    disabled={previewIndex >= certificates.length - 1}
                    className={btnSecondary}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {certificates[previewIndex]?.imageDataUrl && (
                <div className="mt-3 overflow-hidden rounded-xl border border-surface-border shadow-sm">
                  <img
                    src={certificates[previewIndex].imageDataUrl}
                    alt={`Certificate for ${certificates[previewIndex].studentName}`}
                    className="w-full"
                  />
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-crimson/10 px-2.5 py-1 font-semibold text-crimson">
                    {certificates[previewIndex]?.certificateNumber}
                  </span>
                  <span className="text-ink-muted">
                    {certificates[previewIndex]?.studentName} — {certificates[previewIndex]?.rollNumber}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (certificates[previewIndex]) handleExportSingle(certificates[previewIndex]);
                  }}
                  className="font-semibold text-crimson hover:underline"
                >
                  Download this PDF
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setStep(3)} className={btnSecondary}>
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
