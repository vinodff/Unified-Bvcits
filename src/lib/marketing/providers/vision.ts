// Vision provider — analyzes event photographs (spec Section 7).
// CRITICAL RULE: never invent identities. Observations describe what is visible;
// names only ever come from the administrator (source: "admin").
//
// MockVision: offline heuristic analysis (dimensions, filename, admin tags).
// OpenAICompatibleVision: env-gated vision-capable model, returns observations only.

import { formatDate } from "./llm";

export interface ImageObservation {
  people: "none" | "single" | "group";
  stage?: boolean;
  banner?: boolean;
  branding?: boolean;
  certificates?: boolean;
  trophy?: boolean;
  audience?: boolean;
  speaker?: boolean;
  winners?: boolean;
  groupPhoto?: boolean;
  activity?: boolean;
  campus?: boolean;
  textVisible: string[];
  summary: string;
}

export interface VisionProvider {
  readonly name: string;
  analyze(imagePath: string, adminTags?: string[]): Promise<ImageObservation>;
}

export class MockVision implements VisionProvider {
  readonly name = "mock-vision-v1";
  constructor(readonly model = "mock-vision-v1") {}

  async analyze(imagePath: string, adminTags: string[] = []): Promise<ImageObservation> {
    const tags = adminTags.map((t) => t.toLowerCase());
    const has = (words: string[]) => words.some((w) => tags.some((t) => t.includes(w)));
    const observation: ImageObservation = {
      people: has(["group", "team", "audience", "winners", "crowd"]) ? "group" : has(["portrait", "person", "speaker", "student"]) ? "single" : "none",
      stage: has(["stage", "dais"]),
      banner: has(["banner", "backdrop"]),
      branding: has(["banner", "branding", "logo", "backdrop"]),
      certificates: has(["certificate", "certificates"]),
      trophy: has(["trophy", "prize", "shield"]),
      audience: has(["audience", "crowd"]),
      speaker: has(["speaker", "guest", "chief"]),
      winners: has(["winner", "winners", "winning"]),
      groupPhoto: has(["group", "team"]),
      activity: has(["hackathon", "coding", "activity", "hands-on", "workshop"]),
      campus: has(["campus", "building", "classroom", "lab"]),
      textVisible: ["(visible banner text requires a vision model — run with OPENAI_API_KEY for text detection)"],
      summary: `Photograph analyzed (${formatDate(new Date().toISOString())}). ${tags.length ? `Administrator tags: ${tags.join(", ")}. ` : ""}No identities are inferred from pixels.`,
    };
    return observation;
  }
}

export class OpenAICompatibleVision implements VisionProvider {
  readonly name = "openai-vision";
  constructor(readonly model = "gpt-4o-mini") {}

  async analyze(imagePath: string, adminTags: string[] = []): Promise<ImageObservation> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not set");
    // Image path must be a local file URL readable by the model provider or a
    // public URL; for local files we pass a data URL placeholder — real
    // deployments should use a signed URL or base64 upload.
    const res = await fetch(`${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: "system",
            content:
              "You analyze event photographs for a college marketing pipeline. Output STRICT JSON with the observation schema. NEVER name people — describe visible objects, banner text, stage, trophies, group size. Administrator tags are context, not ground truth.",
          },
          {
            role: "user",
            content: `Administrator tags: ${adminTags.join(", ") || "none"}. Image file: ${imagePath}. Respond only with JSON.`,
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Vision request failed: ${res.status}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content ?? "{}";
    try {
      return JSON.parse(text) as ImageObservation;
    } catch {
      return { people: "none", textVisible: [], summary: "Vision model returned unparseable output." };
    }
  }
}

export function getVision(): VisionProvider {
  if (process.env.OPENAI_API_KEY && process.env.MARKETING_VISION === "openai") {
    return new OpenAICompatibleVision(process.env.MARKETING_VISION_MODEL ?? "gpt-4o-mini");
  }
  return new MockVision();
}