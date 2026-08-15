import { NextRequest, NextResponse } from "next/server";
import { generateEdgeTTS } from "@/lib/edge-tts-native";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const text = searchParams.get("text") || "";
    const lang = searchParams.get("lang") || "te-IN";

    if (!text.trim()) {
      return new NextResponse("Missing text parameter", { status: 400 });
    }

    // Clean text of markdown, brackets, emojis, and special chars
    const clean = text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_#`~>•]/g, "")
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
      .replace(/₹/g, "రూపాయలు ")
      .replace(/LPA/gi, "లక్షల రూపాయలు")
      .replace(/\s+/g, " ")
      .trim();

    // Select voice
    const voice = lang === "en-IN" ? "en-IN-NeerjaNeural" : "te-IN-ShrutiNeural";
    const targetLang = lang === "en-IN" ? "en-IN" : "te-IN";

    // 1. PRIMARY: Microsoft Edge Neural TTS (Natural human voice)
    try {
      const audioBuffer = await generateEdgeTTS(clean.slice(0, 300), voice, targetLang);
      if (audioBuffer && audioBuffer.length > 500) {
        return new NextResponse(audioBuffer, {
          status: 200,
          headers: {
            "Content-Type": "audio/mpeg",
            "Content-Length": audioBuffer.length.toString(),
            "Cache-Control": "public, max-age=86400",
          },
        });
      }
    } catch (edgeErr) {
      console.warn("Edge Neural TTS failed, trying Google TTS fallback:", edgeErr);
    }

    // 2. FALLBACK: Google TTS stream
    const googleLang = lang.startsWith("en") ? "en" : "te";
    const gttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
      clean.slice(0, 150)
    )}&tl=${googleLang}&total=1&idx=0&textlen=${clean.length}&client=tw-ob`;

    const gRes = await fetch(gttsUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        "Referer": "https://translate.google.com/",
      },
    });

    if (gRes.ok) {
      const gBuf = await gRes.arrayBuffer();
      return new NextResponse(gBuf, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": gBuf.byteLength.toString(),
        },
      });
    }

    return new NextResponse("TTS service unavailable", { status: 502 });
  } catch (error) {
    console.error("TTS Route Error:", error);
    return new NextResponse("Internal Server Error in TTS", { status: 500 });
  }
}
