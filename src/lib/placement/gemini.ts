// Gemini client for the placement exam pipeline.
//
// SECURITY: server-only, same rule as src/lib/gemini.ts — the key must never
// carry a NEXT_PUBLIC_ prefix. Import this module only from the pipeline and
// route handlers.
//
// Unlike the assistant client (free-form rephrasing), the pipeline needs
// STRICT JSON: every agent output is parsed into a typed shape before anything
// is persisted. We request responseMimeType application/json plus an inline
// schema so the model cannot drift the contract.

if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/placement/gemini.ts is server-only and must not be imported from a client component.",
  );
}

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Pipeline runs are long and may stream several agents; free-tier quota is
 * per-model per-day, so keep the same failover-chain idea as the assistant but
 * with models that tolerate structured output well. Override with
 * PLACEMENT_GEMINI_MODEL (comma-separated).
 */
const DEFAULT_MODEL_CHAIN = ["gemini-2.5-flash", "gemini-3-flash-preview", "gemini-3.1-flash-lite"];

const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 16_000;

export function isPlacementGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** Exposed so other pipeline modules (e.g. the web-search agent) that make
 * their own raw Gemini calls stay on the same failover chain instead of
 * hardcoding a model name that can silently drift out of date. */
export function modelChain(): string[] {
  const configured = process.env.PLACEMENT_GEMINI_MODEL;
  if (!configured) return DEFAULT_MODEL_CHAIN;
  const parsed = configured
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_MODEL_CHAIN;
}

export interface JsonRequest {
  /** The task the model must complete (agent persona + instructions). */
  systemInstruction: string;
  /** The material the model works from. */
  prompt: string;
  /** JSON Schema (OpenAPI subset) constraining the output. */
  schema: Record<string, unknown>;
}

export type JsonRejection = "disabled" | "rate-limited" | "http-error" | "timeout" | "empty" | "invalid-json";

export interface JsonResult<T> {
  data: T | null;
  rejection?: JsonRejection;
  model?: string;
}

/**
 * Runs one structured-output call. Returns `data: null` on any failure so the
 * pipeline can degrade (corpus fallback, heuristic review) rather than throw.
 */
export async function generateJson<T>(request: JsonRequest): Promise<JsonResult<T>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { data: null, rejection: "disabled" };

  const deadline = Date.now() + DEFAULT_TIMEOUT_MS;
  let lastRejection: JsonRejection = "http-error";

  for (const model of modelChain()) {
    const remaining = deadline - Date.now();
    if (remaining < 5_000) break;

    const result = await callModel<T>(request, apiKey, model, remaining);
    if (result.data !== null) return result;

    lastRejection = result.rejection ?? "http-error";
    if (lastRejection !== "rate-limited" && lastRejection !== "http-error") break;
  }

  return { data: null, rejection: lastRejection };
}

async function callModel<T>(
  request: JsonRequest,
  apiKey: string,
  model: string,
  budgetMs: number
): Promise<JsonResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);

  try {
    const response = await fetch(`${ENDPOINT}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: request.systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: request.prompt }] }],
        generationConfig: {
          temperature: 0.4,
          topP: 0.9,
          maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
          responseMimeType: "application/json",
          responseSchema: request.schema,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.warn(`[placement-gemini] ${model} rate-limited`);
        return { data: null, rejection: "rate-limited", model };
      }
      console.warn(`[placement-gemini] ${model} responded ${response.status}`);
      return { data: null, rejection: "http-error", model };
    }

    const payload = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };

    const text = (payload.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();

    if (!text) return { data: null, rejection: "empty", model };

    try {
      // The model sometimes wraps JSON in ```json fences despite the mime type.
      const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      return { data: JSON.parse(cleaned) as T, model };
    } catch {
      console.warn(`[placement-gemini] ${model} returned unparseable JSON`);
      return { data: null, rejection: "invalid-json", model };
    }
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    return { data: null, rejection: isTimeout ? "timeout" : "http-error", model };
  } finally {
    clearTimeout(timer);
  }
}