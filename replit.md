# Workspace

## Overview

**MedEval Judge** — Full-stack Medical AI Model Evaluation System using LLM-as-a-Judge methodology. Allows researchers to benchmark and compare SLMs (Small Language Models) by importing their responses and having a judge LLM score them using a standardized rubric (1–5). Each user has their own private workspace with isolated API keys.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/llm-judge) — light theme, green primary
- **API framework**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Auth**: Dual auth — Replit Auth (OIDC + PKCE) + Firebase Auth (Google + Email/Password); both share cookie-based sessions in PostgreSQL
- **Build**: esbuild (CJS bundle)
- **Charts**: Recharts

## Architecture

- `artifacts/llm-judge` — React/Vite frontend (previewPath: `/`)
- `artifacts/api-server` — Express 5 API server (previewPath: `/api`)
- `lib/db` — Drizzle ORM database layer
- `lib/api-spec/openapi.yaml` — OpenAPI specification (source of truth)
- `lib/api-client-react` — Generated React Query hooks
- `lib/api-zod` — Generated Zod validation schemas (auth schemas appended manually at bottom)
- `lib/replit-auth-web` — Browser auth hook (`useAuth()`) for React

## Database Schema

- `users` — Auth users; Replit users use their Replit ID, Firebase users use `fb_<uid>` prefix (id, email, firstName, lastName, profileImageUrl)
- `sessions` — Server-side sessions for Replit Auth (sid, sess JSONB, expire)
- `models` — AI model registry
- `datasets` — Question datasets (Medical, Legal, General domains)
- `questions` — Questions with gold answers, supports MCQ and OPEN_ENDED, metadata as JSONB
- `model_responses` — LLM-generated responses with inference time tracking
- `judge_evaluations` — LLM-as-a-Judge scores (1-5) with Chain-of-Thought reasoning; includes `judge_model_version` and `confirmed_model` audit columns
- `judge_models` — Provider rows (OpenAI, Gemini, Claude, DeepSeek); IDs 9–12
- `settings` — **Per-user** key-value store; UNIQUE(user_id, key); FK → users.id

## Settings Keys (all per-user)

- `openai_api_key`, `gemini_api_key`, `claude_api_key`, `deepseek_api_key` — provider API keys
- `judge_model_id` — int → judge_models.id (which provider is the judge)
- `judge_model_version` — free text model name (e.g. "gpt-4o-mini")

## Authentication Flow

### Replit Auth
1. User clicks "Log in with Replit" → redirected to `/api/login?returnTo=<base>`
2. Replit OIDC (PKCE) handles auth → callback to `/api/callback`
3. Session created in `sessions` table, cookie `sid` set

### Firebase Auth (Google / Email+Password)
1. User clicks "Continue with Google" or "Sign in with Email" on login page
2. Firebase SDK authenticates client-side (popup for Google, inline for email)
3. Frontend gets Firebase ID token → POST `/api/auth/firebase-session`
4. Server verifies token via `firebase-admin`, upserts user with `fb_` prefix, creates session cookie
5. `onAuthStateChanged` listener in `AuthGate` detects user → exchanges token → sets `firebaseSessionOk`
6. Logout: `firebaseSignOut()` + POST `/api/auth/firebase-logout` → session cleared

### Common
- All protected routes require `req.isAuthenticated()` (401 if not)
- API keys stored per `user_id` → completely isolated between users
- Email uniqueness: if Firebase user shares email with existing Replit account, email stored as null to avoid constraint conflict
- `AuthGate` component (`artifacts/llm-judge/src/components/auth-gate.tsx`) handles both providers; exposes `currentUnifiedUser` module variable
- Google sign-in uses `signInWithPopup`; if run inside an iframe (Replit workspace preview) and popup is blocked, user is guided to open the app in a new tab
- Firebase project: **medevaljudge** — config stored as `VITE_FIREBASE_*` env vars
- Firebase authorized domains must include the Replit dev domain AND the deployed `.replit.app` domain

## Key Features

- **Authentication**: Dual auth — Replit Auth + Firebase (Google + Email/Password) with per-user isolated workspaces
- **Dynamic Model Lists**: `/api/settings/available-models?provider=OpenAI` fetches real models from each provider using the user's API key
- **Data Ingestion**: Upload CSV/JSONL files to create question datasets
- **LLM-as-a-Judge**: Judge any response set using user's configured judge LLM
- **MCQ Support**: Automatic binary scoring (correct=5, wrong=1)
- **Open-ended Evaluation**: Rubric-based with must_have/nice_to_have metadata
- **Analytics**: Model comparison, score distribution, Spearman correlation
- **Audit Trail**: `judge_model_version` + `confirmed_model` in evaluations

## Score Rubric

- 1 = Critical error / wrong answer
- 2 = Weak or incomplete answer
- 3 = Partially correct answer
- 4 = Good answer, close to ideal
- 5 = Excellent answer, matches or exceeds gold standard

## LLM Integration

Unified interface in `artifacts/api-server/src/lib/llm.ts` supports:
- OpenAI (gpt-4o, gpt-4o-mini, o1, o3, o4, etc.)
- Google Gemini (gemini-2.0-flash, gemini-1.5-pro, etc.)
- Anthropic Claude (claude-3-5-sonnet, claude-3-5-haiku, etc.)
- DeepSeek (deepseek-chat, deepseek-reasoner, etc.)

`callLLM()` returns `{ text, inferenceTimeMs, confirmedModel }` — confirmedModel is the model ID echoed back by the provider.

## Dynamic Model List Endpoints

Provider APIs called by the backend using the authenticated user's key:
- **OpenAI**: `GET https://api.openai.com/v1/models` → filter for gpt-/o1/o3/o4 prefixes
- **Gemini**: `GET https://generativelanguage.googleapis.com/v1beta/models?key=...` → filter generateContent models
- **Claude**: `GET https://api.anthropic.com/v1/models`
- **DeepSeek**: `GET https://api.deepseek.com/v1/models`

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/llm-judge run dev` — run frontend locally

## API Endpoints

### Auth (no auth required)
- `GET /api/auth/user` — current auth state (`{user: AuthUser | null}`)
- `GET /api/login` — Replit OIDC redirect
- `GET /api/callback` — Replit OIDC callback
- `GET /api/logout` — clear session + OIDC end-session redirect
- `POST /api/auth/firebase-session` — exchange Firebase ID token for server session cookie
- `POST /api/auth/firebase-logout` — clear Firebase-originated server session

### Settings (auth required)
- `GET/POST /api/settings/api-keys` — per-user API key management
- `GET/POST /api/settings/judge-model` — per-user judge model config
- `GET /api/settings/judge-models` — provider list (public)
- `GET /api/settings/available-models?provider=X` — live model list from provider API

### Data (auth required)
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
- `GET /api/evaluations/:id`
- `GET /api/analytics/summary`
- `GET /api/analytics/model-comparison`
- `GET /api/analytics/score-distribution`
- `GET /api/analytics/results`
- `GET /api/analytics/spearman`

## Orval Config Note

The `lib/api-spec/package.json` codegen script patches `lib/api-zod/src/index.ts` after codegen to resolve a barrel export conflict. Auth schemas (`AuthUser`, `GetCurrentAuthUserResponse`, etc.) are manually appended to the bottom of `lib/api-zod/src/generated/api.ts` since they don't go through the OpenAPI codegen pipeline.
