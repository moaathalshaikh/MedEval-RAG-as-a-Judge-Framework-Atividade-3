// OpenAI text-embedding-3-small — 1536 dimensions

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_URL = "https://api.openai.com/v1/embeddings";

export async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch(EMBEDDING_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: text.slice(0, 8000),
      model: EMBEDDING_MODEL,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embedding error: ${err}`);
  }
  const data = (await res.json()) as {
    data: Array<{ embedding: number[] }>;
  };
  return data.data[0]?.embedding ?? [];
}

// ── Chunking ──────────────────────────────────────────────────────────────────
// 800-character chunks with 100-character overlap

export function chunkText(text: string, chunkSize = 800, overlap = 100): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 30) {
      chunks.push(chunk);
    }
    if (end >= text.length) break;
    start += chunkSize - overlap;
  }
  return chunks;
}
