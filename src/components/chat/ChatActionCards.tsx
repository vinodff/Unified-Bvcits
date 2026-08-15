"use client";

import React, { useState, useEffect } from "react";
import confetti from "canvas-confetti";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Phone,
  Calendar,
  Clock,
  MapPin,
  CheckCircle2,
  ExternalLink,
  MessageCircle,
  Trophy,
  Award,
  Sparkles,
  Bus,
  ShieldCheck,
  Building,
  UserCheck,
  Download,
  Copy,
  FileSpreadsheet,
  ArrowRight,
  Search,
  Filter,
  Users,
} from "lucide-react";
import { HodInfo } from "@/data/bvcits-bot-knowledge";
import {
  exportAppointmentsToExcel,
  saveAppointment,
  getStoredAppointments,
  StoredAppointment,
} from "@/lib/bvcits-excel";
import type { NavigationTarget } from "@/lib/campus-agent";

// -------------------------------------------------------------
// 1. HOD CONTACT ACTION CARD
// -------------------------------------------------------------
export function HodContactCard({
  hod,
  onBookAppointment,
}: {
  hod: HodInfo;
  onBookAppointment?: (hod: HodInfo) => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopyPhone = () => {
    navigator.clipboard.writeText(hod.phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const whatsappUrl = `https://wa.me/919985422678?text=${encodeURIComponent(
    `Hello ${hod.hodName} (${hod.department} HOD), I would like to enquire about BVCITS admissions and department details.`
  )}`;

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-navy/15 bg-white shadow-card transition-all hover:border-crimson/30 hover:shadow-lift">
      <div className="bg-gradient-to-r from-navy via-navy-900 to-navy-800 p-4 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1 rounded-full bg-gold-400/20 px-2.5 py-0.5 text-[11px] font-bold text-gold-300 backdrop-blur-sm">
              <ShieldCheck className="h-3 w-3" /> అధికారిక కాంటాక్ట్ (Official Contact)
            </span>
            <h4 className="mt-1.5 font-display text-base font-extrabold text-white sm:text-lg">
              {hod.hodName}
            </h4>
            <p className="text-xs text-white/80">{hod.designation} · {hod.qualification}</p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-gold-300 backdrop-blur">
            <Building className="h-5 w-5" />
          </span>
        </div>
      </div>

      <div className="p-4 space-y-3 bg-surface-light">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-soft">
          <span className="flex items-center gap-1.5 font-medium">
            <Clock className="h-3.5 w-3.5 text-crimson" /> {hod.officeHours}
          </span>
          <span className="flex items-center gap-1.5 font-semibold text-navy">
            <MapPin className="h-3.5 w-3.5 text-crimson" /> HOD Chamber, Batlapalem
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          <a
            href={hod.directCallHref}
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-emerald-700 hover:shadow-md active:scale-95"
          >
            <Phone className="h-4 w-4 animate-bounce" />
            డైరెక్ట్ కాల్ చేయండి (Call Now)
          </a>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-[#1EBE5D] active:scale-95"
          >
            <MessageCircle className="h-4 w-4" />
            వాట్సాప్ మెసేజ్ (WhatsApp)
          </a>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1 border-t border-surface-border text-xs">
          <button
            type="button"
            onClick={handleCopyPhone}
            className="flex items-center gap-1 text-ink-muted hover:text-navy transition-colors py-1 px-2 rounded-md hover:bg-white"
          >
            <Copy className="h-3 w-3" />
            {copied ? "నెంబర్ కాపీ అయింది! (Copied)" : hod.phone}
          </button>

          {onBookAppointment && (
            <button
              type="button"
              onClick={() => onBookAppointment(hod)}
              className="flex items-center gap-1.5 font-bold text-crimson hover:text-crimson-700 underline underline-offset-2 py-1 px-2"
            >
              <Calendar className="h-3.5 w-3.5" />
              మీటింగ్ బుక్ చేయండి (Book Slot)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// 2. APPOINTMENT BOOKING ENGINE CARD WITH EXCEL STORAGE
// -------------------------------------------------------------
export function AppointmentBookingCard({
  payload,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
}) {
  const hod: HodInfo = payload.hodInfo;
  const [selectedDate, setSelectedDate] = useState("Tomorrow (రేపు)");
  const [selectedSlot, setSelectedSlot] = useState(payload.availableSlots?.[0] || "10:30 AM");
  const [studentName, setStudentName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [purpose, setPurpose] = useState("Admissions & Fee Enquiry (అడ్మిషన్ & ఫీజుల వివరాలు)");
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [appointmentToken, setAppointmentToken] = useState("");

  const handleBooking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim() || !mobileNumber.trim()) return;

    const token = `BVTS-APT-${Math.floor(1000 + Math.random() * 9000)}`;
    setAppointmentToken(token);
    setBookingConfirmed(true);

    // Save into real Excel structured appointment store
    saveAppointment({
      token,
      studentName,
      mobileNumber,
      department: hod.department,
      hodName: hod.hodName,
      date: selectedDate,
      slot: selectedSlot,
      purpose,
      status: "Confirmed",
      bookedAt: new Date().toLocaleString(),
    });

    try {
      confetti({
        particleCount: 90,
        spread: 75,
        origin: { y: 0.6 },
        colors: ["#F5B800", "#D89B00", "#0B0B0C", "#7A1717"],
      });
    } catch {
      // ignore
    }
  };

  const handleExportExcel = () => {
    exportAppointmentsToExcel();
  };

  if (bookingConfirmed) {
    return (
      <div className="mt-3 overflow-hidden rounded-2xl border-2 border-emerald-500 bg-emerald-50/70 p-5 text-ink shadow-card animate-fade-in">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md">
            <CheckCircle2 className="h-6 w-6" />
          </span>
          <div>
            <span className="inline-block rounded bg-emerald-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-900">
              అపాయింట్మెంట్ కన్ఫర్మ్ అయింది · Token: {appointmentToken}
            </span>
            <h4 className="font-display text-base font-bold text-emerald-950">
              మీటింగ్ స్లాట్ విజయవంతంగా బుక్ చేయబడింది!
            </h4>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-4 text-xs space-y-2 shadow-sm">
          <div className="flex justify-between border-b border-surface-border pb-2">
            <span className="text-ink-muted">అపాయింట్మెంట్ ఎవరితో (With):</span>
            <span className="font-bold text-navy">{hod.hodName} ({hod.department})</span>
          </div>
          <div className="flex justify-between border-b border-surface-border pb-2">
            <span className="text-ink-muted">తేదీ & సమయం (Date & Time):</span>
            <span className="font-bold text-crimson">{selectedDate} · {selectedSlot}</span>
          </div>
          <div className="flex justify-between border-b border-surface-border pb-2">
            <span className="text-ink-muted">విద్యార్థి పేరు (Student):</span>
            <span className="font-semibold text-navy">{studentName} ({mobileNumber})</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-muted">వేదిక (Venue):</span>
            <span className="font-semibold text-navy">HOD Chamber, BVCITS Batlapalem</span>
          </div>
        </div>

        <p className="mt-3 text-[11px] text-emerald-800 leading-relaxed">
          ఈ డేటా కాలేజ్ అడ్మిషన్ల రికార్డులలో భద్రపరచబడింది. స్టాఫ్ మరియు విద్యార్థులు ఎక్సెల్ షీట్ రూపంలో కూడా ఎగుమతి చేసుకోవచ్చు.
        </p>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-700 bg-emerald-700 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-800"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> ఎక్సెల్ షీట్ డౌన్‌లోడ్ (.xlsx)
          </button>
          <a
            href={hod.directCallHref}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-600 bg-white py-2 text-xs font-bold text-emerald-800 shadow-sm hover:bg-emerald-50"
          >
            <Phone className="h-3.5 w-3.5" /> డైరెక్ట్ కాల్ చేయండి
          </a>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleBooking}
      className="mt-3 overflow-hidden rounded-2xl border border-surface-border bg-white p-5 shadow-card transition-all"
    >
      <div className="flex items-center justify-between border-b border-surface-border pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-crimson-50 text-crimson">
            <Calendar className="h-4 w-4" />
          </span>
          <div>
            <h4 className="font-display text-sm font-bold text-navy">
              {hod.department} HOD తో అపాయింట్మెంట్ బుకింగ్
            </h4>
            <p className="text-[11px] text-ink-muted">
              స్లాట్ బుక్ చేసుకోండి · Excel డేటాబేస్ లో స్టోర్ అవుతుంది
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3.5 space-y-3 text-xs">
        <div>
          <label className="mb-1 block font-semibold text-navy">తేదీ ఎంచుకోండి (Select Date):</label>
          <div className="grid grid-cols-2 gap-2">
            {["Tomorrow (రేపు)", "Day After (ఎల్లుండి)"].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedDate(d)}
                className={`rounded-lg border px-3 py-2 text-center font-medium transition-all ${
                  selectedDate === d
                    ? "border-gold bg-gold text-black shadow-sm font-bold"
                    : "border-surface-border bg-surface-light text-ink hover:border-navy"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block font-semibold text-navy">అనుకూల సమయం (Select Slot):</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {payload.availableSlots?.map((slot: string) => (
              <button
                key={slot}
                type="button"
                onClick={() => setSelectedSlot(slot)}
                className={`rounded-md border py-1.5 px-2 text-center font-medium transition-all ${
                  selectedSlot === slot
                    ? "border-navy bg-navy text-white font-bold shadow-xs"
                    : "border-surface-border bg-surface-light text-ink hover:border-crimson"
                }`}
              >
                {slot}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          <div>
            <label className="mb-1 block font-semibold text-navy">విద్యార్థి / తల్లిదండ్రి పేరు *</label>
            <input
              required
              type="text"
              placeholder="e.g. Ramesh / Suresh"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface-light px-3 py-2 text-xs text-ink outline-none focus:border-crimson focus:bg-white"
            />
          </div>
          <div>
            <label className="mb-1 block font-semibold text-navy">మొబైల్ నంబర్ *</label>
            <input
              required
              type="tel"
              placeholder="10-digit number"
              value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface-light px-3 py-2 text-xs text-ink outline-none focus:border-crimson focus:bg-white"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block font-semibold text-navy">విచారణ అంశం (Purpose):</label>
          <select
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            className="w-full rounded-lg border border-surface-border bg-surface-light px-3 py-2 text-xs text-ink outline-none focus:border-crimson focus:bg-white"
          >
            <option>Admissions & Fee Enquiry (అడ్మిషన్ & ఫీజుల వివరాలు)</option>
            <option>Course Curriculum & Labs (సిలబస్ & ల్యాబ్స్ వివరాలు)</option>
            <option>Hostel & Bus Facilities (హాస్టల్ & బస్సు సౌకర్యాలు)</option>
            <option>Placements & Career Opportunities (ఉద్యోగ అవకాశాలు)</option>
          </select>
        </div>

        <button
          type="submit"
          className="mt-2 w-full rounded-xl bg-gradient-to-r from-gold to-gold-600 py-2.5 text-center text-xs font-bold text-black shadow-md transition-all hover:brightness-110 active:scale-98"
        >
          స్లాట్ కన్ఫర్మ్ చేయండి (Confirm & Book Appointment) →
        </button>
      </div>
    </form>
  );
}

// -------------------------------------------------------------
// 3. DIRECT WEBSITE TOOL NAVIGATOR CARD
// -------------------------------------------------------------
export function WebsiteNavigatorCard({
  payload,
  onNavigate,
}: {
  payload: NavigationTarget;
  onNavigate?: () => void;
}) {
  const router = useRouter();

  const handleGo = () => {
    if (onNavigate) onNavigate();
    router.push(payload.href);
  };

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-navy/20 bg-gradient-to-br from-white via-surface-light to-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-2 border-b border-surface-border pb-3">
        <div>
          <span className="inline-flex items-center gap-1 rounded-full bg-crimson-50 px-2 py-0.5 text-[10px] font-bold text-crimson">
            <Sparkles className="h-3 w-3" /> {payload.badge}
          </span>
          <h4 className="mt-1 font-display text-sm font-extrabold text-navy sm:text-base">
            {payload.titleTe}
          </h4>
          <p className="text-[11px] text-ink-muted">{payload.titleEn}</p>
        </div>
      </div>

      <p className="mt-2.5 text-xs leading-relaxed text-ink-soft">
        {payload.descriptionTe}
      </p>

      {/* Primary Action Button */}
      <button
        type="button"
        onClick={handleGo}
        className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-navy to-navy-900 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:bg-gold hover:text-black active:scale-98"
      >
        🚀 పేజీకి వెళ్లండి (Go to Page Now) <ArrowRight className="h-4 w-4" />
      </button>

      {/* Secondary Quick Links if available */}
      {payload.secondaryLinks && payload.secondaryLinks.length > 0 && (
        <div className="mt-3 border-t border-surface-border pt-2 flex flex-wrap gap-1.5 text-[11px]">
          <span className="text-ink-muted text-[10px] font-semibold block w-full">ఇతర లింకులు:</span>
          {payload.secondaryLinks.map((sec, i) => (
            <Link
              key={i}
              href={sec.href}
              onClick={onNavigate}
              className="rounded-md border border-surface-border bg-white px-2 py-1 font-medium text-navy hover:border-crimson hover:text-crimson transition-colors"
            >
              {sec.label} ↗
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// 4. FEE BREAKDOWN ACTION CARD
// -------------------------------------------------------------
export function FeeBreakdownCard({
  payload,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
}) {
  const [copiedCode, setCopiedCode] = useState(false);

  const copyCode = () => {
    navigator.clipboard.writeText("BVTS");
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-navy/15 bg-white shadow-card">
      <div className="bg-navy p-4 text-white flex items-center justify-between">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-gold-300">
            అధికారిక ఫీజుల వివరాలు · 2026-27
          </span>
          <h4 className="font-display text-base font-extrabold text-white">
            {payload.department} ఫీజుల నిర్మాణం
          </h4>
        </div>
        <button
          type="button"
          onClick={copyCode}
          className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-xs font-bold text-gold-300 border border-gold-400/30 hover:bg-white/20"
        >
          కోడ్: BVTS {copiedCode ? "✓" : ""}
        </button>
      </div>

      <div className="p-4 space-y-3 bg-surface-light text-xs">
        <div className="rounded-xl border border-emerald-300 bg-emerald-50/90 p-3.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-bold text-emerald-950 flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 text-emerald-600" /> కన్వీనర్ కోటా (AP EAPCET)
            </span>
            <span className="font-display font-extrabold text-emerald-700 text-sm">
              {payload.convenorFee}
            </span>
          </div>
          <p className="text-[11px] text-emerald-900 leading-relaxed font-medium">
            🎯 <strong>JVD పథకం (జగనన్న విద్యా దీవెన):</strong> అర్హులైన ప్రతి ఒక్కరికీ ఆంధ్రప్రదేశ్ ప్రభుత్వం ద్వారా <strong>100% పూర్తి ఫీజు రీయింబర్స్‌మెంట్</strong> వర్తిస్తుంది.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-surface-border bg-white p-3">
            <span className="text-[11px] text-ink-muted block">మేనేజ్‌మెంట్ కోటా (Category-B):</span>
            <span className="font-bold text-navy text-xs mt-0.5 block">{payload.managementFee}</span>
          </div>
          <div className="rounded-xl border border-surface-border bg-white p-3">
            <span className="text-[11px] text-ink-muted block">హాస్టల్ & భోజన వసతి:</span>
            <span className="font-bold text-crimson text-xs mt-0.5 block">{payload.hostelFee}</span>
          </div>
        </div>

        <div className="pt-2 flex items-center justify-between border-t border-surface-border">
          <span className="text-[11px] text-ink-soft">కౌన్సెలింగ్ సహాయం కోసం:</span>
          <a
            href="tel:+919985422678"
            className="font-bold text-crimson hover:underline flex items-center gap-1"
          >
            <Phone className="h-3 w-3" /> +91 99854 22678
          </a>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// 5. PLACEMENT SHOWCASE ACTION CARD
// -------------------------------------------------------------
export function PlacementsShowcaseCard({
  payload,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
}) {
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-gold-400/40 bg-gradient-to-br from-navy via-navy-900 to-navy-950 p-4 text-white shadow-card">
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div>
          <span className="inline-flex items-center gap-1 rounded-full bg-gold-400/20 px-2 py-0.5 text-[10px] font-bold text-gold-300">
            <Trophy className="h-3 w-3" /> రికార్డు ప్లేస్‌మెంట్స్ 2026
          </span>
          <h4 className="mt-1 font-display text-base font-extrabold text-white">
            1,256+ ప్లేస్‌మెంట్ ఆఫర్లు
          </h4>
        </div>
        <Award className="h-8 w-8 text-gold-400 shrink-0" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <span className="text-[10px] text-gold-300 font-bold uppercase block">హైయెస్ట్ ప్యాకేజ్ (Highest):</span>
          <span className="font-display text-lg font-black text-white mt-1 block">₹38 LPA</span>
          <span className="text-[10px] text-white/60">ServiceNow · K. Naga Satya Rajesh</span>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <span className="text-[10px] text-gold-300 font-bold uppercase block">టాప్ ఆఫర్ (Centific):</span>
          <span className="font-display text-lg font-black text-white mt-1 block">₹15 LPA</span>
          <span className="text-[10px] text-white/60">Centific · Palla Pavani</span>
        </div>
      </div>

      <div className="mt-3 border-t border-white/10 pt-2 flex flex-wrap gap-1.5">
        {payload.topRecruiters?.slice(0, 6).map((r: string) => (
          <span
            key={r}
            className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/80"
          >
            {r}
          </span>
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// 6. BUS ROUTES ACTION CARD
// -------------------------------------------------------------
export function BusRoutesCard({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any[];
}) {
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-surface-border bg-white p-4 shadow-card">
      <div className="flex items-center gap-2 border-b border-surface-border pb-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy/10 text-navy">
          <Bus className="h-4 w-4 text-crimson" />
        </span>
        <div>
          <h4 className="font-display text-sm font-bold text-navy">
            కాలేజ్ బస్సు రూట్లు & ఫీజులు (Bus Transport)
          </h4>
          <p className="text-[11px] text-ink-muted">40+ బస్సులు ప్రతిరోజూ క్యాంపస్ కు చేరవేస్తాయి</p>
        </div>
      </div>

      <div className="mt-3 space-y-2 text-xs max-h-52 overflow-y-auto pr-1">
        {payload?.map((route, i) => (
          <div key={i} className="rounded-xl border border-surface-border bg-surface-light p-2.5">
            <div className="flex justify-between font-semibold text-navy">
              <span>{route.routeName}</span>
              <span className="text-crimson font-bold">{route.annualFee}</span>
            </div>
            <p className="mt-1 text-[11px] text-ink-soft">
              స్టాప్స్: {route.stops.join(" ➔ ")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// 7. STAFF / ADMIN APPOINTMENT LEDGER DRAWER
// -------------------------------------------------------------
export function StaffAppointmentLedgerModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [appointments, setAppointments] = useState<StoredAppointment[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (isOpen) {
      setAppointments(getStoredAppointments());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filtered = appointments.filter(
    (a) =>
      a.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.mobileNumber.includes(searchQuery) ||
      a.token.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.department.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-navy-950/60 backdrop-blur-sm pointer-events-auto">
      <div className="relative flex flex-col h-[85vh] w-full max-w-4xl rounded-3xl bg-white shadow-2xl border border-surface-border overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between bg-navy px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-400/20 text-gold-300">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-display text-lg font-bold text-white">
                BVCITS అడ్మిషన్స్ & HOD అపాయింట్మెంట్ లెడ్జర్ (Staff Portal)
              </h3>
              <p className="text-xs text-white/70">
                మొత్తం బుకింగ్స్: {appointments.length} | Real-Time Excel Database
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => exportAppointmentsToExcel(appointments)}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
            >
              <Download className="h-4 w-4" /> ఎక్సెల్ (.xlsx) ఎగుమతి
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="border-b border-surface-border bg-surface-light px-6 py-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted" />
            <input
              type="text"
              placeholder="విద్యార్థి పేరు, టోకెన్ లేదా ఫోన్ నంబర్ తో వెతకండి..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-surface-border bg-white py-2 pl-10 pr-4 text-xs text-ink outline-none focus:border-crimson"
            />
          </div>
        </div>

        {/* Appointments Table */}
        <div className="flex-1 overflow-auto p-6">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-light text-navy border-b border-surface-border sticky top-0">
              <tr>
                <th className="py-2.5 px-3 font-bold">టోకెన్ ID</th>
                <th className="py-2.5 px-3 font-bold">విద్యార్థి / పేరెంట్</th>
                <th className="py-2.5 px-3 font-bold">ఫోన్ నంబర్</th>
                <th className="py-2.5 px-3 font-bold">డిపార్ట్‌మెంట్ & HOD</th>
                <th className="py-2.5 px-3 font-bold">తేదీ & స్లాట్</th>
                <th className="py-2.5 px-3 font-bold">స్టేటస్</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {filtered.map((item) => (
                <tr key={item.token} className="hover:bg-surface-light/60 transition-colors">
                  <td className="py-3 px-3 font-mono font-bold text-crimson">{item.token}</td>
                  <td className="py-3 px-3 font-semibold text-navy">{item.studentName}</td>
                  <td className="py-3 px-3 text-ink-soft font-mono">
                    <a href={`tel:${item.mobileNumber}`} className="hover:text-emerald-700 underline">
                      {item.mobileNumber}
                    </a>
                  </td>
                  <td className="py-3 px-3">
                    <span className="font-medium text-navy block">{item.department}</span>
                    <span className="text-[10px] text-ink-muted">{item.hodName}</span>
                  </td>
                  <td className="py-3 px-3">
                    <span className="font-bold text-navy block">{item.date}</span>
                    <span className="text-[10px] text-crimson font-semibold">{item.slot}</span>
                  </td>
                  <td className="py-3 px-3">
                    <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
