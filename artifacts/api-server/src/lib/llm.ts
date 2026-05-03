import { logger } from "./logger";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type LLMProvider = "OpenAI" | "Gemini" | "Claude" | "DeepSeek";

async function getApiKey(provider: LLMProvider): Promise<string | null> {
  const keyMap: Record<LLMProvider, string> = {
    OpenAI: "openai_api_key",
    Gemini: "gemini_api_key",
    Claude: "claude_api_key",
    DeepSeek: "deepseek_api_key",
  };
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, keyMap[provider]));
  return row?.value ?? null;
}

export async function callLLM(
  provider: LLMProvider,
  modelVersion: string,
  prompt: string
): Promise<{ text: string; inferenceTimeMs: number }> {
  const apiKey = await getApiKey(provider);
  const start = Date.now();

  if (provider === "OpenAI") {
    if (!apiKey) throw new Error("OpenAI API key not configured");
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelVersion,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });
    if (!response.ok) throw new Error(`OpenAI error: ${await response.text()}`);
    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    return { text: data.choices[0]?.message?.content ?? "", inferenceTimeMs: Date.now() - start };
  }

  if (provider === "Gemini") {
    if (!apiKey) throw new Error("Gemini API key not configured");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelVersion}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
      }),
    });
    if (!response.ok) throw new Error(`Gemini error: ${await response.text()}`);
    const data = (await response.json()) as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    };
    return {
      text: data.candidates[0]?.content?.parts[0]?.text ?? "",
      inferenceTimeMs: Date.now() - start,
    };
  }

  if (provider === "Claude") {
    if (!apiKey) throw new Error("Claude (Anthropic) API key not configured");
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelVersion,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!response.ok) throw new Error(`Claude error: ${await response.text()}`);
    const data = (await response.json()) as { content: Array<{ text: string }> };
    return { text: data.content[0]?.text ?? "", inferenceTimeMs: Date.now() - start };
  }

  if (provider === "DeepSeek") {
    if (!apiKey) throw new Error("DeepSeek API key not configured");
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelVersion,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });
    if (!response.ok) throw new Error(`DeepSeek error: ${await response.text()}`);
    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    return { text: data.choices[0]?.message?.content ?? "", inferenceTimeMs: Date.now() - start };
  }

  throw new Error(`Unknown provider: ${provider}`);
}

export const JUDGE_RUBRIC = `
Evaluate the model's response against the gold answer using this rubric:

Score 1 — Critical error / completely wrong answer. The response is factually incorrect, irrelevant, or harmful.
Score 2 — Weak or incomplete answer. The response has some relevant elements but is mostly incorrect or missing key information.
Score 3 — Partially correct answer. The response captures some of the key points but is missing important details or has minor errors.
Score 4 — Good answer close to the ideal. The response is largely correct and covers most key points with minor omissions.
Score 5 — Excellent answer that matches or exceeds the gold standard. Complete, accurate, and well-reasoned.
`.trim();

export function buildJudgePrompt(
  question: string,
  goldAnswer: string,
  modelResponse: string,
  questionType: string,
  metadata: Record<string, unknown>
): string {
  if (questionType === "MCQ") {
    return `You are an expert evaluator for multiple choice questions.

Question: ${question}
Correct Answer: ${goldAnswer}
Model Response: ${modelResponse}

For MCQ questions: 
- If the model's response matches the correct answer (same letter/option), score = 5
- If the model's response does not match, score = 1

Provide your evaluation in exactly this JSON format (no other text):
{"score": <1 or 5>, "reasoning": "<brief explanation>"}`;
  }

  const mustHave = metadata.must_have
    ? `\nRequired elements (must_have): ${JSON.stringify(metadata.must_have)}`
    : "";
  const niceToHave = metadata.nice_to_have
    ? `\nBonus elements (nice_to_have): ${JSON.stringify(metadata.nice_to_have)}`
    : "";

  return `You are an expert evaluator. Evaluate the model's response to the following question.

${JUDGE_RUBRIC}

Question: ${question}
Gold Answer (ideal response): ${goldAnswer}${mustHave}${niceToHave}
Model Response: ${modelResponse}

Evaluate carefully using the rubric above. Provide a detailed Chain-of-Thought reasoning explaining your scoring, then give the final score.

Respond in exactly this JSON format (no other text):
{"score": <integer 1-5>, "reasoning": "<detailed Chain-of-Thought explanation of why this score was given>"}`;
}

export function parseJudgeResponse(text: string): { score: number; reasoning: string } | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*"score"[\s\S]*"reasoning"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { score: unknown; reasoning: unknown };
      const score = Number(parsed.score);
      const reasoning = String(parsed.reasoning ?? "");
      if (score >= 1 && score <= 5 && reasoning) {
        return { score: Math.round(score), reasoning };
      }
    }
  } catch (e) {
    logger.warn({ text, error: String(e) }, "Failed to parse judge response as JSON");
  }

  const scoreMatch = text.match(/\bscore[:\s]+([1-5])\b/i) ?? text.match(/\b([1-5])\s*\/\s*5\b/);
  if (scoreMatch) {
    return { score: parseInt(scoreMatch[1], 10), reasoning: text };
  }

  return null;
}
