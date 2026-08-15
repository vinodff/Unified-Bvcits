// One-time GSAP + ScrollTrigger registration.
// GSAP + ScrollTrigger are 100% free since April 2025 (Webflow/GreenSock).
//
// The `typeof window` guard is required: this module is imported by client
// components that Next.js still evaluates once on the server during the
// module graph build. Registering a browser-only plugin at import time
// without the guard throws "window is not defined" during SSR/build — the
// exact failure mode reported in GSAP's own React/Next.js forum threads.
// Consuming components additionally wrap their DOM work in gsap.context()
// inside useEffect, which is what actually handles cleanup + React 19
// Strict Mode double-invoke — this guard only prevents the SSR crash.
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export { gsap, ScrollTrigger };
