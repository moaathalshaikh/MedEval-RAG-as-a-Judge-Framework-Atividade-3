# Workspace

## Overview

Full-stack AI model evaluation system using LLM-as-a-Judge methodology. Allows researchers to benchmark and compare AI models (OpenAI, DeepSeek, Claude) by running inference pipelines and having a judge LLM score responses using a standardized rubric.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/llm-judge) — dark navy theme
- **API framework**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Charts**: Recharts

## Architecture

- `artifacts/llm-judge` — React/Vite frontend (previewPath: `/`)
- `artifacts/api-server` — Express 5 API server (previewPath: `/api`)
- `lib/db` — Drizzle ORM database layer
- `lib/api-spec/openapi.yaml` — OpenAPI specification (source of truth)
- `lib/api-client-react` — Generated React Query hooks
- `lib/api-zod` — Generated Zod validation schemas

## Database Schema

- `models` — AI model registry (OpenAI, DeepSeek, Claude)
- `datasets` — Question datasets (Medical, Legal, General domains)
- `questions` — Questions with gold answers, supports MCQ and OPEN_ENDED, metadata stored as JSONB
- `model_responses` — LLM-generated responses with inference time tracking
- `judge_evaluations` — LLM-as-a-Judge scores (1-5) with Chain-of-Thought reasoning
- `settings` — API key storage for LLM providers

## Key Features

- **Data Ingestion**: Upload CSV/JSONL files to create question datasets
- **Inference Pipeline**: Send questions to registered models, store responses
- **LLM-as-a-Judge**: Use any registered model as a judge with a standardized rubric (1-5 scoring)
- **MCQ Support**: Automatic binary scoring (correct=5, wrong=1) for multiple choice
- **Open-ended Evaluation**: Rubric-based scoring with must_have/nice_to_have metadata
- **Analytics**: Model comparison, score distribution, Spearman correlation
- **Traceability**: Full Question → Response → Evaluation chain

## Score Rubric

- 1 = Critical error / wrong answer
- 2 = Weak or incomplete answer
- 3 = Partially correct answer
- 4 = Good answer, close to ideal
- 5 = Excellent answer, matches or exceeds gold standard

## LLM Integration

Unified interface in `artifacts/api-server/src/lib/llm.ts` supports:
- OpenAI (gpt-4o, gpt-3.5-turbo, etc.)
- DeepSeek (deepseek-chat, etc.)
- Claude/Anthropic (claude-3-5-sonnet-20241022, etc.)

API keys stored encrypted in `settings` table, configured via `/settings` page.

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/llm-judge run dev` — run frontend locally

## API Endpoints

- `GET/POST /api/models` — model management
- `GET/PATCH/DELETE /api/models/:id`
- `GET/POST /api/datasets` — dataset management
- `GET/DELETE /api/datasets/:id`
- `POST /api/datasets/upload` — upload CSV/JSONL questions
- `GET/POST /api/questions` — question management
- `GET /api/responses` — list responses
- `POST /api/responses/generate` — run inference pipeline
- `GET /api/evaluations` — list evaluations
- `POST /api/evaluations/run` — run LLM-as-a-Judge
- `GET /api/analytics/summary` — system statistics
- `GET /api/analytics/model-comparison` — compare models
- `GET /api/analytics/score-distribution` — score distribution
- `GET /api/analytics/results` — full traceability results
- `GET /api/analytics/spearman` — Spearman correlation analysis
- `GET/POST /api/settings/api-keys` — API key management

## Orval Config Note

The `lib/api-spec/package.json` codegen script patches `lib/api-zod/src/index.ts` after codegen to resolve a barrel export conflict that Orval generates when using `mode: "single"`.
