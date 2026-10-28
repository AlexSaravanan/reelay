import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

export type ScriptProvider = "claude" | "gemini";

/** Which LLM (if any) can write the explainer script, given the configured keys. */
export function scriptProvider(): ScriptProvider | null {
  if (config.anthropicApiKey) return "claude";
  if (config.geminiApiKey) return "gemini";
  return null;
}

/**
 * Write a spoken-word explainer narration about `topic`, researched from the
 * web, sized to be spoken within ~targetSeconds. Uses Claude (web_search) when
 * an Anthropic key is set, otherwise Google Gemini (Search grounding).
 * Returns plain narration prose (no markdown, no stage directions).
 */
export async function writeExplainerScript(
  topic: string,
  targetSeconds: number,
  signal?: AbortSignal,
): Promise<string> {
  // ~140 words/min spoken; aim a little under the video length so the voiceover
  // fits without being cut off.
  const words = Math.max(60, Math.round((targetSeconds / 60) * 140 * 0.9));

  const system = [
    "You are a documentary narrator and scriptwriter.",
    "Write a clear, engaging voiceover that EXPLAINS the given topic to a general",
    "audience, grounded in accurate, up-to-date facts you find on the web.",
    "Output ONLY the words to be spoken — natural flowing prose, first thing to",
    "last. No markdown, no headings, no bullet points, no camera/stage directions,",
    "no speaker labels, no citations or URLs in the text.",
    `Target about ${words} words so it can be read aloud in roughly ${Math.round(
      targetSeconds,
    )} seconds at a natural pace.`,
  ].join(" ");

  const prompt = [
    `Topic (from a video title): "${topic}"`,
    "",
    "Research this topic on the web, then write the narration script described",
    "above. Open with a hook, explain the key ideas in a logical order, and end",
    "with a short takeaway. Return only the spoken words.",
  ].join("\n");

  const provider = scriptProvider();
  let text: string;
  if (provider === "claude") {
    text = await viaClaude(system, prompt, signal);
  } else if (provider === "gemini") {
    text = await viaGemini(system, prompt, signal);
  } else {
    throw new Error(
      "No script key set. Add ANTHROPIC_API_KEY (Claude) or GEMINI_API_KEY " +
        "(free Gemini) to enable AI explainer mode.",
    );
  }

  const script = cleanScript(text);
  if (!script) {
    throw new Error("The model returned an empty explainer script.");
  }
  return script;
}

/** Claude with server-side web search, falling back to model knowledge. */
async function viaClaude(
  system: string,
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const webSearchTool = {
    type: "web_search_20260209",
    name: "web_search",
    max_uses: 6,
  } as unknown as Anthropic.Tool;
  try {
    return await ask(client, system, prompt, [webSearchTool], signal);
  } catch (err) {
    console.warn(
      "Claude web search unavailable, using model knowledge:",
      (err as Error).message,
    );
    return await ask(client, system, prompt, undefined, signal);
  }
}

/**
 * Google Gemini (free tier) with Search grounding, falling back to plain
 * generation if the grounding tool is rejected. Raw REST — no SDK dependency.
 */
async function viaGemini(
  system: string,
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const call = async (withSearch: boolean): Promise<string> => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`;
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 4000, temperature: 0.7 },
    };
    if (withSearch) body.tools = [{ googleSearch: {} }];

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      throw new Error(`Gemini API error ${res.status}: ${detail}`);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    return parts.map((p) => p.text ?? "").join("").trim();
  };

  try {
    return await call(true);
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    console.warn(
      "Gemini Search grounding failed, using model knowledge:",
      (err as Error).message,
    );
    return await call(false);
  }
}

/** One messages.create call; returns the concatenated text blocks. */
async function ask(
  client: Anthropic,
  system: string,
  prompt: string,
  tools: Anthropic.Tool[] | undefined,
  signal?: AbortSignal,
): Promise<string> {
  const response = await client.messages.create(
    {
      model: config.anthropicModel,
      max_tokens: 4000,
      system,
      ...(tools ? { tools } : {}),
      messages: [{ role: "user", content: prompt }],
    },
    { signal },
  );
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/** Strip any stray markdown / labels so only speakable prose remains. */
function cleanScript(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "") // code fences
    .replace(/^#{1,6}\s+/gm, "") // markdown headings
    .replace(/^\s*[-*•]\s+/gm, "") // bullet markers
    .replace(/\*\*(.*?)\*\*/g, "$1") // bold
    .replace(/\[(\d+)\]/g, "") // citation markers like [1]
    .replace(/\((?:https?:\/\/)[^)]+\)/g, "") // parenthetical URLs
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
