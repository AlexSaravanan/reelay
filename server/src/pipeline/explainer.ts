import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

/**
 * Write a spoken-word explainer narration about `topic`, researched from the
 * web via Claude's web_search tool, sized to be spoken within ~targetSeconds.
 * Returns plain narration prose (no markdown, no stage directions).
 */
export async function writeExplainerScript(
  topic: string,
  targetSeconds: number,
  signal?: AbortSignal,
): Promise<string> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  // ~140 words/min spoken; aim a little under the video length so the voiceover
  // fits without being cut off.
  const words = Math.max(60, Math.round((targetSeconds / 60) * 140 * 0.9));

  const system = [
    "You are a documentary narrator and scriptwriter.",
    "Write a clear, engaging voiceover that EXPLAINS the given topic to a general",
    "audience, grounded in accurate, up-to-date facts you find on the web.",
    "Use the web_search tool to check facts before writing.",
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

  // Prefer server-side web search for current facts; if the tool isn't
  // available for this account/model, fall back to the model's own knowledge so
  // the explainer still gets made.
  const webSearchTool = {
    type: "web_search_20260209",
    name: "web_search",
    max_uses: 6,
  } as unknown as Anthropic.Tool;

  let text: string;
  try {
    text = await ask(client, system, prompt, [webSearchTool], signal);
  } catch (err) {
    console.warn(
      "Explainer web search unavailable, using model knowledge:",
      (err as Error).message,
    );
    text = await ask(client, system, prompt, undefined, signal);
  }

  const script = cleanScript(text);
  if (!script) {
    throw new Error("The model returned an empty explainer script.");
  }
  return script;
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
