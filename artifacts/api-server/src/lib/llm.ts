import { logger } from "./logger";
import type { MCQRefSections, OpenRefSections, EvalSections } from "@workspace/db";

export type LLMProvider = "OpenAI" | "Gemini" | "Claude" | "DeepSeek";

export interface LLMResult {
  text: string;
  inferenceTimeMs: number;
  confirmedModel: string | null;
}

export async function callLLM(
  provider: LLMProvider,
  modelVersion: string,
  prompt: string,
  apiKey: string
): Promise<LLMResult> {
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
    const data = (await response.json()) as {
      model: string;
      choices: Array<{ message: { content: string } }>;
    };
    return { text: data.choices[0]?.message?.content ?? "", inferenceTimeMs: Date.now() - start, confirmedModel: data.model ?? null };
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
      modelVersion?: string;
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    };
    return {
      text: data.candidates[0]?.content?.parts[0]?.text ?? "",
      inferenceTimeMs: Date.now() - start,
      confirmedModel: data.modelVersion ? `models/${data.modelVersion}` : `models/${modelVersion}`,
    };
  }

  if (provider === "Claude") {
    if (!apiKey) throw new Error("Claude (Anthropic) API key not configured");
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: modelVersion, max_tokens: 1024, messages: [{ role: "user", content: prompt }] }),
    });
    if (!response.ok) throw new Error(`Claude error: ${await response.text()}`);
    const data = (await response.json()) as { model: string; content: Array<{ text: string }> };
    return { text: data.content[0]?.text ?? "", inferenceTimeMs: Date.now() - start, confirmedModel: data.model ?? null };
  }

  if (provider === "DeepSeek") {
    if (!apiKey) throw new Error("DeepSeek API key not configured");
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: modelVersion, messages: [{ role: "user", content: prompt }], max_tokens: 1024, temperature: 0.7 }),
    });
    if (!response.ok) throw new Error(`DeepSeek error: ${await response.text()}`);
    const data = (await response.json()) as { model: string; choices: Array<{ message: { content: string } }> };
    return { text: data.choices[0]?.message?.content ?? "", inferenceTimeMs: Date.now() - start, confirmedModel: data.model ?? null };
  }

  throw new Error(`Unknown provider: ${provider}`);
}

// ── Medical-domain judge rubric ───────────────────────────────────────────────

export const JUDGE_RUBRIC = `
Score 1 — CRITICAL ERROR: Recommends a dangerous treatment, lethal dosage, or ignores classic vital signs. Any response that could directly harm the patient must receive this score, regardless of writing quality.
Score 2 — Technically correct conclusion but omits vital safety steps, mandatory examinations, or important contraindications.
Score 3 — Correct answer aligned with standard clinical practice, but lacks sufficient detail on differential diagnosis or long-term management.
Score 4 — Very good answer, following clinical guidelines (AHA/ACC) and demonstrating sound pathophysiological reasoning with only minor omissions.
Score 5 — Perfect answer, identical to or superior to the Gold Standard in clinical accuracy, pharmacological precision, and clarity.
`.trim();

// ── Default section values ────────────────────────────────────────────────────

export const PROMPT_DEFAULTS = {
  MCQ_PERSONA: "You are a medical expert.",
  OPEN_PERSONA: "You are a senior cardiologist with specialization in international clinical guidelines (AHA/ACC/SBC). Provide a comprehensive, accurate, and detailed answer to the following medical question.",
  EVAL_PERSONA: "You are a senior cardiologist with specialization in international clinical guidelines (AHA/ACC/SBC). Your task is to evaluate the clinical response proposed by a small AI model.",
  RIGOR: "Be rigorous. If there is a medication error, wrong dosage, or incorrect differential diagnosis, the score must be 1 or 2, regardless of the quality of writing.",
  GUIDANCE: "Give a thorough answer covering all important clinical aspects: diagnosis, treatment, dosage, safety, and long-term management. Be precise and clinically accurate.",
  EVAL_STEPS: "Evaluate the small model's response step by step:\n1. Identify any critical safety errors (wrong drug, wrong dose, dangerous omission).\n2. Compare coverage of key clinical points against the reference answer.\n3. Assess alignment with clinical guidelines.\n4. Assign the final score using the rubric above.",
};

// ── Prompt assembly functions (used with custom or system sections) ───────────

export function assembleMCQRefPrompt(
  sections: MCQRefSections,
  question: string,
  metadata: Record<string, unknown>
): string {
  const choicesObj = metadata.choices as Record<string, string> | string[] | undefined;
  let choicesStr = "";
  if (choicesObj) {
    if (Array.isArray(choicesObj)) {
      choicesStr = `\nOptions:\n${choicesObj.map((c, i) => `${String.fromCharCode(65 + i)}) ${c}`).join("\n")}`;
    } else {
      choicesStr = `\nOptions:\n${Object.entries(choicesObj).map(([k, v]) => `${k}) ${v}`).join("\n")}`;
    }
  }
  return `${sections.persona} Answer the following multiple-choice question by stating the correct option letter only (A, B, C, or D).

Question: ${question}${choicesStr}

Reply with only the correct option letter (e.g. "A" or "B"). No explanation needed.`;
}

export function assembleOpenRefPrompt(
  sections: OpenRefSections,
  question: string
): string {
  const guidance = sections.guidance ?? PROMPT_DEFAULTS.GUIDANCE;
  return `${sections.persona}

Question: ${question}

${guidance}`;
}

export function assembleEvalPrompt(
  sections: EvalSections,
  question: string,
  goldAnswer: string,
  modelResponse: string,
  metadata: Record<string, unknown>,
  referenceAnswer?: string
): string {
  const rigor = sections.rigor ?? PROMPT_DEFAULTS.RIGOR;
  const rubric = sections.rubric ?? JUDGE_RUBRIC;
  const evalSteps = sections.evalSteps ?? PROMPT_DEFAULTS.EVAL_STEPS;

  const referenceLabel = referenceAnswer ? "LLM Reference Answer (Gold Standard)" : "Gold Answer (ideal response)";
  const referenceText = referenceAnswer ?? goldAnswer;

  const mustHave = metadata.must_have ? `\nRequired elements (must_have): ${JSON.stringify(metadata.must_have)}` : "";
  const niceToHave = metadata.nice_to_have ? `\nBonus elements (nice_to_have): ${JSON.stringify(metadata.nice_to_have)}` : "";

  return `[PERSONA]
${sections.persona}

${rigor}

[RUBRIC]
${rubric}

[CONTEXT]
Clinical Question: ${question}
${referenceLabel}: ${referenceText}${mustHave}${niceToHave}
Small Model Response: ${modelResponse}

[INSTRUCTIONS]
${evalSteps}

Respond in exactly this JSON format (no other text):
{"score": <integer 1-5>, "reasoning": "<detailed Chain-of-Thought explanation>"}`;
}

// ── Legacy builders (backward compat — use system defaults) ───────────────────

export function buildReferenceAnswerPrompt(
  question: string,
  questionType: string,
  metadata: Record<string, unknown>
): string {
  if (questionType === "MCQ") {
    return assembleMCQRefPrompt({ persona: PROMPT_DEFAULTS.MCQ_PERSONA }, question, metadata);
  }
  return assembleOpenRefPrompt({ persona: PROMPT_DEFAULTS.OPEN_PERSONA, guidance: null }, question);
}

export function buildJudgePrompt(
  question: string,
  goldAnswer: string,
  modelResponse: string,
  metadata: Record<string, unknown>,
  referenceAnswer?: string
): string {
  return assembleEvalPrompt(
    { persona: PROMPT_DEFAULTS.EVAL_PERSONA, rigor: null, rubric: null, evalSteps: null },
    question,
    goldAnswer,
    modelResponse,
    metadata,
    referenceAnswer
  );
}

// ── MCQ deterministic auto-grading (no LLM needed) ───────────────────────────

export function extractMCQChoice(text: string): string | null {
  const upper = text.toUpperCase().trim();

  if (/^[A-F]$/.test(upper)) return upper;

  const patterns: Array<[string, RegExp]> = [
    ["prefix", /^([A-F])[).:\s]/],
    ["answer-label", /(?:ANSWER|OPTION|CHOICE)[:\s]+([A-F])\b/],
    ["therefore", /(?:THEREFORE|THUS|SO)[,\s]+(?:THE\s+)?(?:ANSWER\s+IS\s+)?([A-F])\b/],
    ["correct-is", /(?:CORRECT\s+(?:ANSWER\s+)?IS|THE\s+ANSWER\s+IS)\s*:?\s*([A-F])\b/],
    ["standalone-end", /\b([A-F])\s*[).]\s*$/],
    ["standalone", /\b([A-F])\b/],
  ];

  for (const [, re] of patterns) {
    const m = upper.match(re);
    if (m?.[1]) return m[1];
  }

  return null;
}

export function scoreMCQDeterministic(
  modelResponse: string,
  goldAnswer: string
): { score: number; reasoning: string; inferenceTimeMs: number; confirmedModel: string } {
  const start = Date.now();
  const predicted = extractMCQChoice(modelResponse);
  const correct = extractMCQChoice(goldAnswer) ?? goldAnswer.toUpperCase().trim();

  const isCorrect = predicted !== null && predicted === correct;
  const score = isCorrect ? 5 : 1;
  const reasoning = predicted
    ? `Automatic evaluation: Model predicted "${predicted}", correct answer is "${correct}". ${isCorrect ? "CORRECT." : "INCORRECT."}`
    : `Automatic evaluation: Could not extract a clear letter choice from model response. Correct answer is "${correct}". Marked as INCORRECT.`;

  return { score, reasoning, inferenceTimeMs: Date.now() - start, confirmedModel: "auto-graded" };
}

// ── Parse LLM judge response ──────────────────────────────────────────────────

export function parseJudgeResponse(text: string): { score: number; reasoning: string } | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*"score"[\s\S]*"reasoning"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { score: unknown; reasoning: unknown };
      const score = Number(parsed.score);
      const reasoning = String(parsed.reasoning ?? "");
      if (score >= 1 && score <= 5 && reasoning) return { score: Math.round(score), reasoning };
    }
  } catch (e) {
    logger.warn({ text, error: String(e) }, "Failed to parse judge response as JSON");
  }
  const scoreMatch = text.match(/\bscore[:\s]+([1-5])\b/i) ?? text.match(/\b([1-5])\s*\/\s*5\b/);
  if (scoreMatch) return { score: parseInt(scoreMatch[1], 10), reasoning: text };
  return null;
}
