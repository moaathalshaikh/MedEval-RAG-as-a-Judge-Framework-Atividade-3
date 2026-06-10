# MedEval — RAG as a Judge Framework

**Activity 3 | Group 5 | Tópicos Especiais em ES e SI I**
Federal University of Sergipe — Prof. Glauco Carneiro — June 2026

---

## Overview

MedEval Activity 3 extends the LLM-as-a-Judge evaluation platform built in Activity 2 with a full **Retrieval-Augmented Generation (RAG)** pipeline. The system ingests authoritative clinical guidelines published after the training cutoff of all evaluated models, embeds them into a vector knowledge base, re-runs inference on the same medical QA datasets, and measures the factual impact of external knowledge through before/after Spearman correlation analysis.

> *"A poorly selected document destroys the correlation coefficient of your model and will be penalized by your own judge agent."*
> — Prof. Glauco Carneiro

---

## 🎬 Video Presentation

▶️ [Watch the full presentation (10–20 min)](https://www.youtube.com/watch?v=VIDEO_ID_HERE)

---

## 👥 Team

| Name | Role |
|------|------|
| Moaath Almohammad Alshaikh | Full-stack development, RAG architecture, pgvector integration, statistical analysis |
| Tasneem Alshaher | SLM models, RAG re-inference pipeline, dataset management | statistical analysis |
| Marcelo West | Database schema extension, backup | statistical analysis |
| Clélio Xavier | Judge pipeline adaptation for RAG | statistical analysis |
| Sérgio Santos | Human evaluation, before/after results analysis | statistical analysis |
| Hernandison Bispo | Research insights, document curation | statistical analysis |

---

## 📊 Key Results

| Metric | Baseline (no RAG) | With RAG | Delta |
|--------|:-----------------:|:--------:|:-----:|
| Spearman ρ (Judge vs Human) | 0.956 | — | — |
| p-value | 0.0000 | — | — |
| Paired evaluations (n) | 92 | 92 | — |
| MCQ Accuracy | 34.6% | — | — |
| Datasets | K-QA (201) + USMLE (54 MCQ) | | |
| SLMs evaluated | 6 models | | |
| LLM Judge | DeepSeek-v4-flash | | |

> RAG before/after delta values will be populated after full pipeline execution.

---

## 🏗️ RAG Architecture

```
Clinical Guidelines (PDF / TXT)
           │
           ▼
    Text Extraction
    + Chunking (500 chars, 50 overlap)
           │
           ▼
  OpenAI text-embedding-3-small
  (1536-dim vectors)
           │
           ▼
   pgvector (PostgreSQL)
   table: rag_chunks
           │
    ┌──────┴──────┐
    │  At inference time:
    │  1. Embed question
    │  2. Similarity search → top-K chunks
    │  3. Inject context into prompt
    │  4. Call SLM with augmented prompt
    └─────────────┘
           │
           ▼
  LLM-as-a-Judge (same rubric as Activity 2)
  Chain-of-Thought: RAG HELPED / RAG ADDED NOISE / RAG NEUTRAL
           │
           ▼
  PostgreSQL: score_without_rag ↔ score_with_rag
           │
           ▼
  Spearman ρ before/after comparison
```

---

## 📚 RAG Knowledge Base — Document Selection

Documents were selected according to three criteria:

1. **Temporal validity** — publication date after the training cutoff of all three evaluated candidate models (BioMistral-7B, Mistral-7B-Instruct-v0.1, Qwen1.5-1.8B-Chat; all with cutoff ≤ September 2023).
2. **Topical relevance** — direct alignment with the K-QA and USMLE question distributions (infectious diseases, pharmacology, nephrology, cardiology, mental health).
3. **Clinical authority** — guidelines issued by internationally recognized bodies (CDC, IDSA, AHA/ACC, KDIGO, FDA, NIMH, USMLE.org).

| # | Document | Source | Covers | Dataset |
|---|----------|--------|--------|---------|
| 1 | STI Treatment Guidelines 2021 | CDC | Chlamydia, Herpes, HPV, gonorrhea | K-QA |
| 2 | Antimicrobial Stewardship Guidelines 2023 | IDSA | Antibiotic selection and stewardship | K-QA |
| 3 | ACC/AHA Hypertension Guidelines 2017/2023 | AHA Journals | Hypertension management | USMLE Step 2/3 |
| 4 | KDIGO AKI & AKD Guidelines 2023/2026 | KDIGO | Acute Tubular Necrosis, AKI staging | USMLE Step 1 |
| 5 | FDA Drug Safety Communications 2024 | FDA | Post-cutoff drug safety updates | K-QA |
| 6 | USMLE Step 1 Content Outline 2024 | USMLE.org | Biomedical sciences blueprint | USMLE |
| 7 | Depression & Anxiety Clinical Info 2024 | NIMH | SSRIs, buspirone, mental health Tx | K-QA |

The objective is to evaluate whether recent external knowledge improves factual correctness, reduces hallucinations, and increases alignment with gold-standard medical answers.

---

## 🗂️ Repository Structure

```
MedEval-RAG-as-a-Judge-Framework-Atividade-3/
├── README.md                              ← This file
├── Atividade_3/
│   ├── documents/                         ← Source PDFs/TXTs for RAG
│   ├── scripts/
│   │   ├── 01_ingest_documents.py         ← Chunking + ChromaDB indexing
│   │   ├── 02_rag_inference.py            ← RAG-augmented model inference
│   │   ├── 03_judge_rag.py               ← LLM Judge with Chain-of-Thought
│   │   ├── 04_update_db.py               ← PostgreSQL schema update + insert
│   │   └── 05_statistics.py              ← Spearman ρ before/after analysis
│   ├── prompts/
│   │   ├── rag_system_prompt.txt          ← Augmented inference prompt template
│   │   └── judge_rag_prompt.txt           ← Judge prompt with RAG impact field
│   ├── notebooks/
│   │   ├── rag_pipeline_demo.ipynb        ← End-to-end pipeline walkthrough
│   │   └── statistics_analysis.ipynb     ← Spearman + visualizations
│   ├── backup/
│   │   └── activity3_before_after.sql     ← PostgreSQL dump (pre + post RAG)
│   └── exports/
│       ├── spearman_results.csv           ← ρ before/after per model/dataset
│       └── rag_noise_cases.csv           ← Cases where RAG degraded performance
├── artifacts/                             ← (inherited from Activity 2)
│   ├── api-server/
│   └── llm-judge/
└── lib/
    └── db/src/schema/
        └── rag.ts                         ← rag_documents + rag_chunks tables
```

---

## 🗄️ Database Schema Extensions

Activity 3 extends the Activity 2 schema with the following additions:

```sql
-- New tables
CREATE TABLE rag_documents (
    id          SERIAL PRIMARY KEY,
    title       TEXT NOT NULL,
    source_url  TEXT,
    pub_date    DATE,
    scope       VARCHAR(20) DEFAULT 'both',  -- 'mcq', 'open', 'both'
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE rag_chunks (
    id           SERIAL PRIMARY KEY,
    document_id  INTEGER REFERENCES rag_documents(id),
    chunk_index  INTEGER,
    content      TEXT NOT NULL,
    embedding    vector(1536)               -- pgvector
);

-- Extensions to model_responses
ALTER TABLE model_responses
    ADD COLUMN rag_enabled    BOOLEAN DEFAULT FALSE,
    ADD COLUMN rag_context    TEXT;

-- Extensions to judge_evaluations
ALTER TABLE judge_evaluations
    ADD COLUMN score_with_rag  INTEGER,
    ADD COLUMN rag_impact      VARCHAR(20),  -- 'RAG HELPED' | 'RAG ADDED NOISE' | 'RAG NEUTRAL'
    ADD COLUMN cot_rag         TEXT;
```

### Key SQL Query for Before/After Comparison

```sql
SELECT
    m.model_name,
    d.dataset_name,
    ROUND(AVG(je.score)::numeric, 3)           AS avg_score_baseline,
    ROUND(AVG(je.score_with_rag)::numeric, 3)  AS avg_score_rag,
    ROUND((AVG(je.score_with_rag) - AVG(je.score))::numeric, 3) AS delta,
    COUNT(*) FILTER (WHERE je.rag_impact = 'RAG HELPED')      AS rag_helped,
    COUNT(*) FILTER (WHERE je.rag_impact = 'RAG ADDED NOISE') AS rag_noise,
    COUNT(*) FILTER (WHERE je.rag_impact = 'RAG NEUTRAL')     AS rag_neutral,
    COUNT(*) AS total
FROM judge_evaluations je
JOIN model_responses mr ON je.response_id = mr.id
JOIN models m           ON mr.model_id    = m.id
JOIN questions q        ON mr.question_id = q.id
JOIN datasets d         ON q.dataset_id   = d.id
WHERE je.score_with_rag IS NOT NULL
GROUP BY m.model_name, d.dataset_name
ORDER BY m.model_name, d.dataset_name;
```

---

## ⚙️ RAG Workflow (Step by Step)

```
Step 1 — Document Ingestion
    Upload PDF/TXT → chunk (500 chars, 50 overlap)
    → embed via OpenAI text-embedding-3-small
    → store in pgvector (rag_chunks)

Step 2 — RAG Re-Inference
    For each question in K-QA / USMLE:
        a. Embed question text
        b. Cosine similarity search → top-5 relevant chunks
        c. Inject chunks into system prompt
        d. Call SLM → save response with rag_enabled = true

Step 3 — Judge Evaluation (RAG-aware)
    Same judge model (DeepSeek-v4-flash), same 1–5 rubric
    Additional Chain-of-Thought field:
        "RAG HELPED"      — context corrected a hallucination
        "RAG ADDED NOISE" — context degraded the response
        "RAG NEUTRAL"     — context had no measurable effect

Step 4 — Database Update
    Populate score_with_rag, rag_impact, cot_rag
    in judge_evaluations

Step 5 — Statistical Analysis
    Compute Spearman ρ (judge vs human):
        - Baseline (score_without_rag vs human_score)
        - RAG      (score_with_rag   vs human_score)
    Report Δρ per model and dataset
    Flag and export noise cases
```

---

## 🔬 Statistical Analysis

Spearman rank correlation measures judge–human agreement before and after RAG:

```python
from scipy.stats import spearmanr

rho_base, p_base = spearmanr(judge_scores_baseline, human_scores)
rho_rag,  p_rag  = spearmanr(judge_scores_rag,      human_scores)

print(f"Baseline  ρ = {rho_base:.3f}  (p = {p_base:.4f})")
print(f"With RAG  ρ = {rho_rag:.3f}   (p = {p_rag:.4f})")
print(f"Δρ        = {rho_rag - rho_base:+.3f}")
```

| ρ range | Interpretation |
|---------|---------------|
| 0.7 – 1.0 | Strong alignment ✅ |
| 0.3 – 0.6 | Moderate — review rubric |
| < 0.3 | Weak judge |

---

## 🏷️ Judge Scoring Rubric (Open-Ended)

| Score | Label | Description |
|-------|-------|-------------|
| 5 | Excellent | Matches or exceeds reference; clinically safe |
| 4 | Good | Clinically sound, minor omissions |
| 3 | Partial | Acceptable but lacks precision |
| 2 | Weak | Major clinical omission |
| 1 | Critical | Hallucination or dangerous error |

MCQ questions are graded deterministically (model letter vs. gold answer).

---

## 🚩 Error Flag Taxonomy (inherited from Activity 2)

| Flag | Meaning |
|------|---------|
| `PROMPT_LEAKAGE` | Model repeated instructions from the prompt |
| `HALLUCINATION` | Fabricated clinical information |
| `OVER_VERBOSE` | Excessively long response that misleads the judge |
| `FACTUAL_ERROR` | Medically incorrect statement |
| `PARTIAL_ANSWER` | Incomplete response |
| `OFF_TOPIC` | Irrelevant content |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS, Shadcn UI |
| Backend | Express.js, Node.js, TypeScript |
| Database | PostgreSQL + Drizzle ORM |
| Vector Search | pgvector (1536-dim embeddings) |
| Embeddings | OpenAI `text-embedding-3-small` |
| LLM Providers | OpenAI, Google Gemini, Anthropic Claude, DeepSeek |
| Auth | Firebase Admin + Clerk |
| Monorepo | pnpm workspaces |

---

## 🚀 Setup & Running

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 14+ with `pgvector` extension
- OpenAI API key (embeddings + judge)

### Install

```bash
pnpm install
```

### Environment Variables

```env
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
FIREBASE_PROJECT_ID=...
FIREBASE_PRIVATE_KEY=...
FIREBASE_CLIENT_EMAIL=...
```

### Run (Development)

```bash
# API server
pnpm --filter @workspace/api-server run dev

# Frontend
pnpm --filter @workspace/llm-judge run dev
```

### Enable pgvector

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

---

## 🗄️ Database Restore

```bash
# 1. Create database
createdb -U postgres medeval_db

# 2. Restore Activity 2 baseline
psql -U postgres -d medeval_db -f Atividade_2/backup/medeval-backup-2026-05-14.sql

# 3. Apply Activity 3 schema extensions
psql -U postgres -d medeval_db -f Atividade_3/backup/activity3_before_after.sql

# 4. Verify
SELECT COUNT(*) FROM rag_documents;
SELECT COUNT(*) FROM rag_chunks;
SELECT COUNT(*) FROM judge_evaluations WHERE score_with_rag IS NOT NULL;
```

---

## 🔒 Security Notes

- API keys are stored privately per user and deleted on logout — never included in backups.
- All evaluations are authenticated via JWT.
- Backup files contain evaluation data only — store securely.

---

## 📚 References

1. Zheng et al. *Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena.* arXiv:2306.05685, 2023.
2. Jiang et al. *Mistral 7B.* arXiv:2310.06825, 2023.
3. Manes et al. *K-QA: A Real-World Medical Q&A Benchmark.* arXiv:2401.14493, 2024.
4. Kung et al. *Performance of ChatGPT on USMLE.* PLOS Digital Health, 2(2), 2023.
5. KDIGO. *Clinical Practice Guideline for AKI and AKD.* Public Review Draft, 2026.
6. CDC. *STI Treatment Guidelines.* 2021.
7. Whelton et al. *ACC/AHA Hypertension Guidelines.* Hypertension, 2018.
8. Spearman, C. *The Proof and Measurement of Association between Two Things.* AJP, 1904.

---

## Activity 2 Repository

[MedEval-LLM-as-a-Judge-Framework-Atividade-2](https://github.com/moaathalshaikh/MedEval-LLM-as-a-Judge-Framework-Atividade-2)
