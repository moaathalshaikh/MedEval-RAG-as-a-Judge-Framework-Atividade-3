import {
  useGetResults, useListModels, useListDatasets,
  getGetResultsQueryKey,
} from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ScoreBadge } from "@/components/score-badge";
import {
  Filter, Download, Eraser, ChevronDown, ChevronRight,
  CheckCircle2, XCircle, Sparkles, Settings, AlertCircle,
  RotateCcw, BookOpen, Cpu,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { currentUnifiedUser } from "@/components/auth-gate";
import { Link } from "wouter";
import { useSharedJudgeModelId } from "@/hooks/use-shared-judge";

// ── Types ──────────────────────────────────────────────────────────────────────
interface ActiveJudgeModel {
  id: number; provider: string; displayName: string; modelVersion: string; hasKey: boolean;
}
interface RefStatus { total: number; covered: number; }
interface ModelResponse {
  responseId: number; modelName: string; responseText: string;
  mustHaveScore?: number | null; mcqCorrect?: string | null; mcqScore?: string | null;
  score?: number | null; reasoning?: string | null; judgeModelName?: string | null;
  evaluationId?: number | null; evaluatedAt?: string | null; evaluationCreatedBy?: string | null;
  inferenceTimeMs?: number | null;
}
interface QuestionGroup {
  questionId: number; questionText: string; goldAnswer: string;
  questionType: string; datasetName: string; referenceAnswer: string | null;
  metadata?: Record<string, unknown>;
  responses: ModelResponse[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function escapeCSV(val: unknown): string {
  const s = val == null ? "" : String(val);
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}
function canDelete(createdBy: string | null | undefined) {
  if (createdBy == null) return true;
  return currentUnifiedUser?.id === createdBy;
}

const PROVIDER_META: Record<string, { label: string; dot: string }> = {
  OpenAI:   { label: "OpenAI",    dot: "bg-emerald-500" },
  Gemini:   { label: "Google",    dot: "bg-blue-500"    },
  Claude:   { label: "Anthropic", dot: "bg-amber-500"   },
  DeepSeek: { label: "DeepSeek",  dot: "bg-violet-500"  },
};

// ── Hooks ──────────────────────────────────────────────────────────────────────
function useActiveJudgeModels() {
  return useQuery<ActiveJudgeModel[]>({
    queryKey: ["settings", "active-judge-models"],
    queryFn: () => fetch("/api/settings/active-judge-models", { credentials: "include" }).then(r => r.json()),
    staleTime: 30_000,
  });
}
function useRefStatus(datasetId: string | null, judgeModelId: string) {
  return useQuery<RefStatus>({
    queryKey: ["reference-answers", "status", datasetId, judgeModelId],
    queryFn: () => {
      const p = new URLSearchParams({ datasetId: datasetId! });
      if (judgeModelId) p.set("judgeModelId", judgeModelId);
      return fetch(`/api/reference-answers/status?${p}`, { credentials: "include" }).then(r => r.json());
    },
    enabled: !!datasetId && datasetId !== "all",
    staleTime: 0,
  });
}
function useGenerateRef() {
  return useMutation<{ generated: number; skipped: number; errors: string[] }, { error?: string }, { datasetId: number; judgeModelId: number }>({
    mutationFn: (body) => fetch("/api/reference-answers/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      credentials: "include", body: JSON.stringify(body),
    }).then(async r => { if (!r.ok) throw await r.json(); return r.json(); }),
  });
}

// ── Generate Reference Answers panel ──────────────────────────────────────────
function GenerateRefPanel({ datasetId }: { datasetId: string }) {
  const { data: activeJudgeModels, isLoading } = useActiveJudgeModels();
  const [selectedJudgeId, setSelectedJudgeId] = useSharedJudgeModelId();
  const { data: refStatus, refetch } = useRefStatus(datasetId || null, selectedJudgeId);
  const generateRef = useGenerateRef();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const covered = refStatus?.covered ?? 0;
  const total = refStatus?.total ?? 0;
  const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
  const complete = total > 0 && covered >= total;
  const selectedJudge = activeJudgeModels?.find(m => m.id.toString() === selectedJudgeId);

  function handleGenerate() {
    if (!selectedJudge || !datasetId || datasetId === "all") return;
    generateRef.mutate(
      { datasetId: parseInt(datasetId), judgeModelId: selectedJudge.id },
      {
        onSuccess: (res) => {
          refetch();
          queryClient.invalidateQueries({ queryKey: getGetResultsQueryKey({}) });
          queryClient.invalidateQueries({ queryKey: ["reference-answers"] });
          toast({ title: "Reference answers ready", description: `Generated ${res.generated} answers.` });
        },
        onError: (err) => toast({ title: "Generation failed", description: err.error ?? "Unknown", variant: "destructive" }),
      }
    );
  }

  if (!datasetId || datasetId === "all") return null;

  return (
    <Card className="border-blue-200 bg-blue-50/60">
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-blue-800 flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-blue-600" />
            Generate Reference Answers (Large LLM)
          </CardTitle>
          <Link href="/settings">
            <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs text-blue-600 hover:bg-blue-100">
              <Settings className="h-3 w-3" /> Manage
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="pb-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
            {isLoading ? <Skeleton className="h-9 w-full" /> : (
              <Select value={selectedJudgeId} onValueChange={setSelectedJudgeId}>
                <SelectTrigger className="h-9 bg-white border-blue-200 text-sm">
                  <SelectValue placeholder="Select judge model" />
                </SelectTrigger>
                <SelectContent>
                  {activeJudgeModels?.map(m => {
                    const meta = PROVIDER_META[m.provider];
                    return (
                      <SelectItem key={m.id} value={m.id.toString()}>
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${meta?.dot ?? "bg-muted"}`} />
                          <span>{meta?.label ?? m.provider} · {m.modelVersion}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
          </div>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 gap-1.5 h-9"
            onClick={handleGenerate}
            disabled={generateRef.isPending || !selectedJudge || !datasetId}
          >
            {generateRef.isPending ? (
              <><div className="h-3.5 w-3.5 border-2 border-white border-r-transparent rounded-full animate-spin" /> Generating…</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5" /> {complete ? "Re-generate" : "Generate Reference Answers"}</>
            )}
          </Button>
        </div>
        {total > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-blue-700">
              <span>Coverage</span>
              <span className="font-medium">{covered} / {total} questions {complete && "✓"}</span>
            </div>
            <Progress value={pct} className="h-1.5 bg-blue-100" />
          </div>
        )}
        {(activeJudgeModels?.length ?? 0) === 0 && !isLoading && (
          <Alert className="border-amber-200 bg-amber-50 py-2">
            <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
            <AlertDescription className="text-xs text-amber-700">
              No judge models configured. <Link href="/settings" className="underline font-medium">Add one in Settings →</Link>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

// ── Score pill ─────────────────────────────────────────────────────────────────
function ScorePill({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-xs text-muted-foreground">—</span>;
  const colors = ["", "bg-red-100 text-red-700", "bg-orange-100 text-orange-700", "bg-yellow-100 text-yellow-700", "bg-lime-100 text-lime-700", "bg-green-100 text-green-700"];
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${colors[score] ?? "bg-muted text-muted-foreground"}`}>
      {score}/5
    </span>
  );
}

// ── Model color palette ────────────────────────────────────────────────────────
const MODEL_COLORS = [
  { bg: "bg-purple-50", border: "border-purple-200", badge: "bg-purple-100 text-purple-800", header: "text-purple-700" },
  { bg: "bg-teal-50",   border: "border-teal-200",   badge: "bg-teal-100 text-teal-800",    header: "text-teal-700"   },
  { bg: "bg-rose-50",   border: "border-rose-200",    badge: "bg-rose-100 text-rose-800",    header: "text-rose-700"   },
  { bg: "bg-sky-50",    border: "border-sky-200",     badge: "bg-sky-100 text-sky-800",      header: "text-sky-700"    },
];

// ── Open-ended question card ───────────────────────────────────────────────────
function OpenEndedCard({
  group, qNum, onClearEvaluation,
}: {
  group: QuestionGroup;
  qNum: number;
  onClearEvaluation: (evaluationId: number) => void;
}) {
  const [open, setOpen] = useState(false);

  const models = group.responses;
  const hasRef = !!group.referenceAnswer;
  const avgScore = models.filter(m => m.score != null).length > 0
    ? models.filter(m => m.score != null).reduce((s, m) => s + (m.score ?? 0), 0) / models.filter(m => m.score != null).length
    : null;

  return (
    <div className={`rounded-xl border transition-all ${open ? "border-primary/30 shadow-sm" : "border-border hover:border-muted-foreground/30"}`}>
      {/* Summary row */}
      <button
        className="w-full text-left px-4 py-3 flex items-start gap-3"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-xs font-mono font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded mt-0.5 shrink-0">
          {qNum}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground line-clamp-1">{group.questionText}</p>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            {hasRef && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full font-medium">
                <Sparkles className="h-2.5 w-2.5" /> Ref
              </span>
            )}
            {models.map((m, i) => (
              <span key={m.responseId} className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium ${MODEL_COLORS[i % MODEL_COLORS.length].badge}`}>
                <Cpu className="h-2.5 w-2.5" />
                {m.modelName.length > 14 ? m.modelName.slice(0, 14) + "…" : m.modelName}
                {m.mustHaveScore != null && <span className="opacity-70">· {Number(m.mustHaveScore).toFixed(2)}</span>}
                {m.score != null && <ScorePill score={m.score} />}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          {avgScore != null && (
            <span className="text-xs font-semibold text-muted-foreground">avg {avgScore.toFixed(1)}</span>
          )}
          {open
            ? <ChevronDown className="h-4 w-4 text-primary" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground" />
          }
        </div>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-5 pt-1 border-t border-border space-y-4">

              {/* Question */}
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <BookOpen className="h-3 w-3" /> Question
                </p>
                <div className="text-sm leading-relaxed bg-muted/40 border border-border rounded-lg p-3.5">{group.questionText}</div>
              </div>

              {/* Gold answer + Reference side by side */}
              <div className={`grid gap-3 ${hasRef ? "md:grid-cols-2" : "grid-cols-1"}`}>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">Gold Answer (Dataset)</p>
                  <div className="text-sm leading-relaxed bg-green-50 border border-green-200 rounded-lg p-3.5 text-green-900">{group.goldAnswer}</div>
                </div>
                {hasRef && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide flex items-center gap-1">
                      <Sparkles className="h-3 w-3" /> Large LLM Reference Answer
                    </p>
                    <div className="text-sm leading-relaxed bg-amber-50 border border-amber-200 rounded-lg p-3.5 text-amber-900">{group.referenceAnswer}</div>
                  </div>
                )}
              </div>

              {/* Model responses grid */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Cpu className="h-3 w-3" /> Small Model Responses
                </p>
                <div className={`grid gap-3 ${models.length === 1 ? "grid-cols-1" : models.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
                  {models.map((m, i) => {
                    const colors = MODEL_COLORS[i % MODEL_COLORS.length];
                    return (
                      <div key={m.responseId} className={`rounded-lg border ${colors.border} ${colors.bg} p-3 space-y-2`}>
                        {/* Model header */}
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-bold ${colors.header}`}>{m.modelName}</span>
                          <div className="flex items-center gap-1.5">
                            {m.mustHaveScore != null && (
                              <span className="text-xs font-mono text-muted-foreground">MH: {Number(m.mustHaveScore).toFixed(2)}</span>
                            )}
                            <ScorePill score={m.score} />
                          </div>
                        </div>
                        {/* Response */}
                        <p className="text-xs leading-relaxed text-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">
                          {m.responseText}
                        </p>
                        {/* Judge reasoning */}
                        {m.reasoning && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium">
                              Judge reasoning ▸
                            </summary>
                            <div className="mt-1.5 p-2 bg-white/70 rounded border border-border/60 text-muted-foreground whitespace-pre-wrap max-h-32 overflow-y-auto">
                              {m.reasoning}
                            </div>
                          </details>
                        )}
                        {/* Clear eval action */}
                        {m.evaluationId && canDelete(m.evaluationCreatedBy) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onClearEvaluation(m.evaluationId!); }}
                            className="text-xs text-amber-600 hover:text-amber-800 flex items-center gap-1 mt-1"
                          >
                            <RotateCcw className="h-2.5 w-2.5" /> Clear score
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── MCQ question card ──────────────────────────────────────────────────────────
function MCQCard({ group, qNum }: { group: QuestionGroup; qNum: number }) {
  const [open, setOpen] = useState(false);

  const models = group.responses;
  const correctLetter = group.goldAnswer.match(/^\(?([A-F])\)?/)?.[1] ?? group.goldAnswer;

  const choices: Record<string, string> = (group.metadata as any)?.choices ?? {};

  return (
    <div className={`rounded-xl border transition-all ${open ? "border-blue-300/60 shadow-sm" : "border-border hover:border-muted-foreground/30"}`}>
      {/* Summary row */}
      <button className="w-full text-left px-4 py-3 flex items-start gap-3" onClick={() => setOpen(o => !o)}>
        <span className="text-xs font-mono font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded mt-0.5 shrink-0">
          {qNum}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium line-clamp-1">{group.questionText}</p>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <span className="text-xs bg-green-100 text-green-800 font-bold px-2 py-0.5 rounded-full">
              ✓ {correctLetter}
            </span>
            {models.map((m, i) => {
              const pred = m.responseText?.toUpperCase().replace(/^\(([A-F])\)$/, "$1") ?? "?";
              const isCorrect = m.mcqScore?.toLowerCase() === "true" ||
                (m.mcqScore == null && pred === correctLetter.toUpperCase());
              const colors = MODEL_COLORS[i % MODEL_COLORS.length];
              return (
                <span key={m.responseId} className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium ${colors.badge}`}>
                  {m.modelName.length > 12 ? m.modelName.slice(0, 12) + "…" : m.modelName}: {pred}
                  {isCorrect
                    ? <CheckCircle2 className="h-2.5 w-2.5 text-green-600" />
                    : <XCircle className="h-2.5 w-2.5 text-red-500" />}
                </span>
              );
            })}
          </div>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
      </button>

      {/* Expanded */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-5 pt-1 border-t border-border space-y-4">

              {/* Question */}
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Question</p>
                <div className="text-sm leading-relaxed bg-muted/40 border border-border rounded-lg p-3.5">{group.questionText}</div>
              </div>

              {/* Choices grid */}
              {Object.keys(choices).length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Options</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {Object.entries(choices).map(([letter, text]) => {
                      const isCorrectChoice = letter === correctLetter.toUpperCase();
                      return (
                        <div key={letter} className={`flex gap-2 rounded-lg border px-3 py-2 text-sm ${isCorrectChoice ? "bg-green-50 border-green-300 font-medium text-green-900" : "bg-white border-border text-muted-foreground"}`}>
                          <span className={`font-bold shrink-0 ${isCorrectChoice ? "text-green-700" : "text-muted-foreground"}`}>({letter})</span>
                          <span>{text}</span>
                          {isCorrectChoice && <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 ml-auto self-center" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Model predictions grid */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Cpu className="h-3 w-3" /> Model Predictions
                </p>
                <div className={`grid gap-3 ${models.length === 1 ? "grid-cols-1" : models.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
                  {models.map((m, i) => {
                    const pred = m.responseText?.toUpperCase().replace(/^\(([A-F])\)$/, "$1") ?? "?";
                    const isCorrect = m.mcqScore?.toLowerCase() === "true" ||
                      (m.mcqScore == null && pred === correctLetter.toUpperCase());
                    const colors = MODEL_COLORS[i % MODEL_COLORS.length];
                    const choiceText = choices[pred] ?? "";
                    return (
                      <div key={m.responseId} className={`rounded-lg border ${isCorrect ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"} p-3.5 space-y-2`}>
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-bold ${colors.header}`}>{m.modelName}</span>
                          {isCorrect
                            ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full"><CheckCircle2 className="h-3 w-3" /> Correct</span>
                            : <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full"><XCircle className="h-3 w-3" /> Wrong</span>
                          }
                        </div>
                        <div className={`text-center py-3 rounded-lg border font-bold text-2xl ${isCorrect ? "bg-green-100 border-green-200 text-green-800" : "bg-red-100 border-red-200 text-red-800"}`}>
                          ({pred})
                        </div>
                        {choiceText && (
                          <p className="text-xs text-muted-foreground leading-relaxed">{choiceText}</p>
                        )}
                        {!isCorrect && choices[correctLetter] && (
                          <p className="text-xs text-green-700">
                            <span className="font-semibold">Correct:</span> ({correctLetter}) {choices[correctLetter]}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Export helpers ─────────────────────────────────────────────────────────────
function exportOpenEndedCSV(groups: QuestionGroup[]) {
  const headers = ["#", "question", "gold_answer", "reference_answer", "model", "response", "must_have_score", "score", "judge_model", "reasoning"];
  const rows: string[] = [headers.join(",")];
  groups.forEach((g, qi) => {
    g.responses.forEach(m => {
      rows.push([qi + 1, g.questionText, g.goldAnswer, g.referenceAnswer ?? "", m.modelName, m.responseText, m.mustHaveScore ?? "", m.score ?? "", m.judgeModelName ?? "", m.reasoning ?? ""].map(v => escapeCSV(v)).join(","));
    });
  });
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `open_ended_results_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
}
function exportMCQCSV(groups: QuestionGroup[]) {
  const headers = ["#", "question", "correct_answer", "model", "prediction", "is_correct"];
  const rows: string[] = [headers.join(",")];
  groups.forEach((g, qi) => {
    g.responses.forEach(m => {
      const pred = m.responseText?.toUpperCase() ?? "";
      const correct = g.goldAnswer.match(/^\(?([A-F])\)?/)?.[1] ?? g.goldAnswer;
      const isCorrect = m.mcqScore?.toLowerCase() === "true" || pred === correct.toUpperCase();
      rows.push([qi + 1, g.questionText, g.goldAnswer, m.modelName, pred, isCorrect].map(v => escapeCSV(v)).join(","));
    });
  });
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `mcq_results_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Results() {
  const [datasetId, setDatasetId] = useState<string>("");
  const [modelId, setModelId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"open_ended" | "mcq">("open_ended");
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "evaluation"; evaluationId: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showClearAll, setShowClearAll] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: models } = useListModels();
  const { data: datasets } = useListDatasets();

  const queryParams = {
    datasetId: datasetId !== "all" && datasetId !== "" ? parseInt(datasetId) : undefined,
    modelId: modelId !== "all" && modelId !== "" ? parseInt(modelId) : undefined,
  };
  const { data: results, isLoading } = useGetResults(queryParams, {
    query: { queryKey: getGetResultsQueryKey(queryParams) },
  });

  // Group by questionId
  const { openGroups, mcqGroups } = useMemo(() => {
    if (!results) return { openGroups: [] as QuestionGroup[], mcqGroups: [] as QuestionGroup[] };

    const openMap = new Map<number, QuestionGroup>();
    const mcqMap = new Map<number, QuestionGroup>();

    results.forEach((row: any) => {
      const map = row.questionType === "MCQ" ? mcqMap : openMap;
      if (!map.has(row.questionId)) {
        map.set(row.questionId, {
          questionId: row.questionId,
          questionText: row.questionText,
          goldAnswer: row.goldAnswer,
          questionType: row.questionType,
          datasetName: row.datasetName,
          referenceAnswer: row.referenceAnswer ?? null,
          metadata: row.metadata ?? {},
          responses: [],
        });
      }
      const group = map.get(row.questionId)!;
      if (row.referenceAnswer && !group.referenceAnswer) group.referenceAnswer = row.referenceAnswer;
      if (row.responseId) {
        group.responses.push({
          responseId: row.responseId,
          modelName: row.modelName,
          responseText: row.responseText,
          mustHaveScore: row.mustHaveScore,
          mcqCorrect: row.mcqCorrect,
          mcqScore: row.mcqScore,
          score: row.score,
          reasoning: row.reasoning,
          judgeModelName: row.judgeModelName,
          evaluationId: row.evaluationId,
          evaluatedAt: row.evaluatedAt,
          evaluationCreatedBy: row.evaluationCreatedBy,
          inferenceTimeMs: row.inferenceTimeMs,
        });
      }
    });

    return {
      openGroups: Array.from(openMap.values()),
      mcqGroups: Array.from(mcqMap.values()),
    };
  }, [results]);

  async function clearAllResults() {
    setIsClearing(true);
    try {
      const res = await fetch("/api/results/clear-all", { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      toast({ title: "Cleared", description: `Deleted ${data.deletedResponses} responses and ${data.deletedRefs} reference answers.` });
      queryClient.invalidateQueries();
    } catch (e) {
      toast({ title: "Clear failed", description: String(e), variant: "destructive" });
    } finally {
      setIsClearing(false);
      setShowClearAll(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/evaluations/${deleteTarget.evaluationId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Evaluation cleared" });
      queryClient.invalidateQueries();
    } catch (e) {
      toast({ title: "Delete failed", description: String(e), variant: "destructive" });
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Results</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Question-by-question comparison of all models</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={datasetId} onValueChange={setDatasetId}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All datasets" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All datasets</SelectItem>
              {datasets?.map(d => <SelectItem key={d.id} value={d.id.toString()}>{d.datasetName}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={modelId} onValueChange={setModelId}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All models" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All models</SelectItem>
              {models?.map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.modelName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Generate reference answers panel — only for open-ended when dataset is selected */}
      {activeTab === "open_ended" && (
        <GenerateRefPanel datasetId={datasetId} />
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as "open_ended" | "mcq")}>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <TabsList>
            <TabsTrigger value="open_ended" className="gap-1.5">
              Open-ended
              {!isLoading && <span className="text-xs bg-primary/10 text-primary rounded-full px-1.5 py-0.5 font-medium">{openGroups.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="mcq" className="gap-1.5">
              MCQ
              {!isLoading && <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5 font-medium">{mcqGroups.length}</span>}
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0"
              disabled={activeTab === "open_ended" ? openGroups.length === 0 : mcqGroups.length === 0}
              onClick={() => activeTab === "open_ended" ? exportOpenEndedCSV(openGroups) : exportMCQCSV(mcqGroups)}
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0 text-red-600 border-red-200 hover:bg-red-50"
              disabled={!results || results.length === 0}
              onClick={() => setShowClearAll(true)}
            >
              <Eraser className="h-3.5 w-3.5" /> Clear All
            </Button>
          </div>
        </div>

        {/* Open-ended tab */}
        <TabsContent value="open_ended" className="mt-0">
          {isLoading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
          ) : openGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 rounded-xl border border-dashed border-border text-sm text-muted-foreground">
              No open-ended responses found. Import responses or adjust filters.
            </div>
          ) : (
            <div className="space-y-2">
              {openGroups.map((group, i) => (
                <OpenEndedCard
                  key={group.questionId}
                  group={group}
                  qNum={i + 1}
                  onClearEvaluation={(id) => setDeleteTarget({ kind: "evaluation", evaluationId: id })}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* MCQ tab */}
        <TabsContent value="mcq" className="mt-0">
          {isLoading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
          ) : mcqGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 rounded-xl border border-dashed border-border text-sm text-muted-foreground">
              No MCQ responses found. Import responses or adjust filters.
            </div>
          ) : (
            <div className="space-y-2">
              {mcqGroups.map((group, i) => (
                <MCQCard key={group.questionId} group={group} qNum={i + 1} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* MCQ stats summary */}
      {activeTab === "mcq" && mcqGroups.length > 0 && !isLoading && (() => {
        const modelStats: Record<string, { correct: number; total: number }> = {};
        mcqGroups.forEach(g => {
          const correct = g.goldAnswer.match(/^\(?([A-F])\)?/)?.[1] ?? g.goldAnswer;
          g.responses.forEach(m => {
            if (!modelStats[m.modelName]) modelStats[m.modelName] = { correct: 0, total: 0 };
            modelStats[m.modelName].total++;
            const pred = m.responseText?.toUpperCase().replace(/^\(([A-F])\)$/, "$1") ?? "";
            const isCorrect = m.mcqScore?.toLowerCase() === "true" || pred === correct.toUpperCase();
            if (isCorrect) modelStats[m.modelName].correct++;
          });
        });
        return (
          <Card className="border-blue-100 bg-blue-50/40">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold text-blue-800">MCQ Accuracy Summary</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="flex flex-wrap gap-4">
                {Object.entries(modelStats).map(([name, stats], i) => {
                  const pct = Math.round((stats.correct / stats.total) * 100);
                  const colors = MODEL_COLORS[i % MODEL_COLORS.length];
                  return (
                    <div key={name} className={`flex-1 min-w-[140px] rounded-lg border ${colors.border} ${colors.bg} p-3 text-center`}>
                      <p className={`text-xs font-bold ${colors.header} mb-1`}>{name}</p>
                      <p className="text-2xl font-bold text-foreground">{pct}%</p>
                      <p className="text-xs text-muted-foreground">{stats.correct} / {stats.total} correct</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Confirm clear evaluation */}
      <Dialog open={deleteTarget?.kind === "evaluation"} onOpenChange={o => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear evaluation score?</DialogTitle>
            <DialogDescription>This removes the judge score and reasoning. The response stays and can be re-evaluated.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={confirmDelete} disabled={isDeleting}>
              {isDeleting ? "Clearing…" : "Clear score"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm clear all */}
      <Dialog open={showClearAll} onOpenChange={o => !o && setShowClearAll(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear all results?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 pt-1">
                <p>The following will be permanently deleted:</p>
                <ul className="text-sm list-disc list-inside text-muted-foreground space-y-0.5">
                  <li>All model responses</li>
                  <li>All judge evaluations</li>
                  <li>All reference answers</li>
                </ul>
                <p className="text-sm font-medium text-foreground pt-1">Questions, Datasets, and Models are kept.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearAll(false)} disabled={isClearing}>Cancel</Button>
            <Button variant="destructive" onClick={clearAllResults} disabled={isClearing}>
              {isClearing ? "Clearing…" : "Clear all results"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </motion.div>
  );
}
