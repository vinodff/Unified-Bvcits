// Defensive parsing for JSON that came out of a language model.
//
// A model asked for JSON returns *something like* JSON. In practice it wraps the
// object in a markdown fence, nests it under a descriptive key, renames fields
// to snake_case, or drops fields entirely — all while remaining syntactically
// valid, so `JSON.parse` succeeds and an unchecked `as T` cast lets the malformed
// object straight through.
//
// That is exactly how a live campaign died: Gemini returned
//   { "campaign_strategy": { "objective": "...", "key_messaging": {...} } }
// instead of the flat shape with `platformStrategy`. The cast passed, and the
// writing agent crashed on `strategy.platformStrategy["instagram"]`, taking SEO
// and the quality gate down with it.
//
// The rule here: never trust the shape, always merge over a known-good default,
// and report what had to be repaired so the failure is visible instead of silent.

/** Normalised key for matching: "platform_strategy" and "Platform Strategy" both → "platformstrategy". */
function keyOf(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Strip a markdown code fence if the model wrapped its JSON in one.
 * ```json\n{...}\n``` is the single most common deviation.
 */
function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  return (fenced ? fenced[1] : trimmed).trim();
}

/**
 * Parse model output into an object, tolerating fences and leading prose.
 * Returns null when nothing object-shaped can be recovered.
 */
export function parseLlmJson(text: string): Record<string, unknown> | null {
  const cleaned = stripFences(text ?? "");
  if (!cleaned) return null;

  const attempt = (s: string): Record<string, unknown> | null => {
    try {
      const parsed: unknown = JSON.parse(s);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  };

  const direct = attempt(cleaned);
  if (direct) return direct;

  // Some models prefix an explanation before the object. Fall back to the
  // outermost brace pair rather than discarding an otherwise usable response.
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first !== -1 && last > first) return attempt(cleaned.slice(first, last + 1));

  return null;
}

/**
 * Depth-first search for the first value whose key matches any alias.
 *
 * Searching recursively is what makes a nested wrapper (`campaign_strategy.objective`)
 * or a regrouped field (`event_details.venue`) recoverable instead of fatal.
 */
export function deepFind(source: unknown, aliases: string[]): unknown {
  const wanted = new Set(aliases.map(keyOf));
  const seen = new Set<unknown>();

  const walk = (node: unknown): unknown => {
    if (!node || typeof node !== "object" || seen.has(node)) return undefined;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node) {
        const hit = walk(item);
        if (hit !== undefined) return hit;
      }
      return undefined;
    }

    const obj = node as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      if (wanted.has(keyOf(k)) && v != null) return v;
    }
    // Only descend once the whole level has been checked, so a top-level match
    // always beats a deeper one of the same name.
    for (const v of Object.values(obj)) {
      const hit = walk(v);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };

  return walk(source);
}

// --- coercion helpers -------------------------------------------------------
// Each returns undefined when the value cannot be honestly used as that type,
// which is the signal to fall back to the default and record a repair.

export function asString(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return undefined;
}

export function asStringList(v: unknown): string[] | undefined {
  if (Array.isArray(v)) {
    const items = v.map(asString).filter((s): s is string => !!s);
    return items.length ? items : undefined;
  }
  // A model that returns a sentence where a list was requested is still usable.
  const single = asString(v);
  return single ? [single] : undefined;
}

export function asStringMap(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    const s = asString(raw);
    if (s) out[k.toLowerCase()] = s;
  }
  return Object.keys(out).length ? out : undefined;
}

export function asBoolean(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    if (/^(true|yes)$/i.test(v.trim())) return true;
    if (/^(false|no)$/i.test(v.trim())) return false;
  }
  return undefined;
}

/**
 * Builds a complete object by taking each field from the model output when it is
 * usable and from `defaults` when it is not, recording every substitution.
 *
 * `repaired` is the honest-failure signal: an empty list means the model returned
 * the shape it was asked for; a long list means it did not and the output is
 * mostly deterministic fallback, which the admin deserves to see.
 */
export function coerceShape<T extends Record<string, unknown>>(
  parsed: unknown,
  defaults: T,
  fields: { [K in keyof T]: { aliases: string[]; read: (v: unknown) => T[K] | undefined } }
): { value: T; repaired: string[] } {
  const value = { ...defaults };
  const repaired: string[] = [];

  for (const key of Object.keys(fields) as (keyof T)[]) {
    const { aliases, read } = fields[key];
    const found = deepFind(parsed, [String(key), ...aliases]);
    const usable = found === undefined ? undefined : read(found);
    if (usable === undefined) repaired.push(String(key));
    else value[key] = usable;
  }

  return { value, repaired };
}
