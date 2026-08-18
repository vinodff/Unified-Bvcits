"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  fetchJdFromUrl,
  optimizeForJob,
  uploadResumeFile,
  type JdFetchState,
  type OptimizeState,
  type UploadState,
} from "./actions";
import { Results } from "./results";
import { FileText, Target, Download, Sparkles, Loader2 } from "@/components/ui/icons";

const uploadInitial: UploadState = { error: null, text: null, fileName: null };
const jdInitial: JdFetchState = { error: null, text: null };
const optimizeInitial: OptimizeState = { error: null, result: null, originalText: null };

const textareaCls =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-gold/60 focus:ring-2 focus:ring-gold/20";

export function ResumeOptimizer() {
  const [resumeText, setResumeText] = useState("");
  const [jdText, setJdText] = useState("");
  const [jdUrl, setJdUrl] = useState("");
  const [extraNotes, setExtraNotes] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadFormRef = useRef<HTMLFormElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const [uploadState, uploadAction, uploading] = useActionState(uploadResumeFile, uploadInitial);
  const [jdState, jdAction, fetchingJd] = useActionState(fetchJdFromUrl, jdInitial);
  const [optimizeState, optimizeAction, optimizing] = useActionState(optimizeForJob, optimizeInitial);

  // Extraction results flow into the textarea the student can still edit —
  // a bad PDF parse is visible and fixable before it costs a model call.
  useEffect(() => {
    if (uploadState.text) setResumeText(uploadState.text);
  }, [uploadState.text]);

  useEffect(() => {
    if (jdState.text) setJdText(jdState.text);
  }, [jdState.text]);

  useEffect(() => {
    if (optimizeState.result) resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [optimizeState.result]);

  function submitFile(file: File) {
    if (!fileInputRef.current || !uploadFormRef.current) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInputRef.current.files = transfer.files;
    uploadFormRef.current.requestSubmit();
  }

  const canOptimize = resumeText.trim().length >= 80 && jdText.trim().length >= 60 && !optimizing;

  return (
    <div className="rounded-3xl bg-brand-black px-4 py-10 sm:px-8 sm:py-14">
      <header className="mx-auto max-w-3xl text-center">
        <h1 className="font-display text-3xl font-extrabold leading-tight text-white sm:text-5xl">
          Improve Your Resume <span className="text-gold">for Any Job</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/55 sm:text-base">
          Paste your resume and the job you want. We rewrite it to match — and show you exactly what changed, what&apos;s
          still missing, and how much of it your original actually backs up.
        </p>
      </header>

      <div className="mx-auto mt-10 max-w-5xl space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          {/* ---- Resume ---- */}
          <section className="rounded-2xl border border-white/10 bg-brand-charcoal p-5">
            <h2 className="flex flex-wrap items-baseline gap-2 text-sm font-bold text-white">
              <FileText className="h-4 w-4 text-gold" />
              Your Resume
              <span className="text-xs font-normal text-white/40">Paste text or upload a PDF</span>
            </h2>

            <textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              rows={9}
              placeholder="Paste your resume text here… Include your work experience, education, skills, and any other relevant sections."
              className={`mt-3 ${textareaCls}`}
            />

            <form ref={uploadFormRef} action={uploadAction}>
              <input
                ref={fileInputRef}
                type="file"
                name="file"
                accept=".pdf,.txt,.md,.csv,application/pdf,text/plain"
                className="sr-only"
                onChange={(e) => {
                  if (e.target.files?.[0]) uploadFormRef.current?.requestSubmit();
                }}
              />
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) submitFile(file);
                }}
                className={`mt-3 rounded-xl border border-dashed p-6 text-center transition ${
                  isDragging ? "border-gold bg-gold/5" : "border-white/15"
                }`}
              >
                {uploading ? (
                  <p className="flex items-center justify-center gap-2 text-sm text-white/60">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Reading {uploadState.fileName ?? "file"}…
                  </p>
                ) : (
                  <>
                    <Download className="mx-auto h-5 w-5 rotate-180 text-white/30" />
                    <p className="mt-2 text-sm text-white/50">
                      Drag &amp; drop PDF or{" "}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="font-bold text-gold underline-offset-2 hover:underline"
                      >
                        click to upload
                      </button>
                    </p>
                  </>
                )}
              </div>
            </form>

            {uploadState.error && (
              <p role="alert" className="mt-2 text-xs text-red-300">
                {uploadState.error}
              </p>
            )}
            {uploadState.text && !uploadState.error && (
              <p role="status" className="mt-2 text-xs text-emerald-300">
                Extracted {uploadState.text.length.toLocaleString()} characters from {uploadState.fileName}. Check it
                below before optimizing.
              </p>
            )}
          </section>

          {/* ---- Job description ---- */}
          <section className="rounded-2xl border border-white/10 bg-brand-charcoal p-5">
            <h2 className="flex flex-wrap items-baseline gap-2 text-sm font-bold text-white">
              <Target className="h-4 w-4 text-gold" />
              Job Description
              <span className="text-xs font-normal text-white/40">Paste or fetch from a URL</span>
            </h2>

            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              rows={9}
              placeholder="Paste the full job description here… Include requirements, responsibilities, qualifications, and any preferred skills."
              className={`mt-3 ${textareaCls}`}
            />

            <form action={jdAction} className="mt-3 flex gap-2">
              <input
                name="url"
                value={jdUrl}
                onChange={(e) => setJdUrl(e.target.value)}
                placeholder="Or fetch from a job posting URL…"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-gold/60"
              />
              <button
                type="submit"
                disabled={fetchingJd || !jdUrl.trim()}
                className="shrink-0 rounded-xl bg-gold px-5 py-2.5 text-sm font-bold text-brand-black transition hover:bg-gold-500 disabled:opacity-40"
              >
                {fetchingJd ? "…" : "Fetch"}
              </button>
            </form>

            {jdState.error && (
              <p role="alert" className="mt-2 text-xs text-red-300">
                {jdState.error}
              </p>
            )}
          </section>
        </div>

        {/* ---- Notes + run ---- */}
        <section className="rounded-2xl border border-white/10 bg-brand-charcoal p-5">
          <h2 className="text-sm font-bold text-white">
            Anything specific to add or change? <span className="font-normal italic text-white/40">optional</span>
          </h2>
          <textarea
            value={extraNotes}
            onChange={(e) => setExtraNotes(e.target.value)}
            rows={2}
            placeholder={'e.g. "I led a team of 6 but forgot to add it"'}
            className={`mt-3 ${textareaCls}`}
          />

          <form action={optimizeAction} className="mt-4">
            <input type="hidden" name="resumeText" value={resumeText} readOnly />
            <input type="hidden" name="jdText" value={jdText} readOnly />
            <input type="hidden" name="jdUrl" value={jdUrl} readOnly />
            <input type="hidden" name="extraNotes" value={extraNotes} readOnly />

            <button
              type="submit"
              disabled={!canOptimize}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gold px-6 py-3.5 font-display text-sm font-bold text-brand-black transition hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {optimizing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analysing and rewriting…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Optimize my resume
                </>
              )}
            </button>
            {!canOptimize && !optimizing && (
              <p className="mt-2 text-center text-xs text-white/35">
                Add your resume and the job description to continue.
              </p>
            )}
          </form>

          {optimizeState.error && (
            <p role="alert" className="mt-3 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">
              {optimizeState.error}
            </p>
          )}
        </section>

        <div ref={resultsRef}>
          {optimizeState.result && optimizeState.originalText && (
            <div className="pt-4">
              <Results result={optimizeState.result} originalText={optimizeState.originalText} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
